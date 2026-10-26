$ErrorActionPreference = 'Stop'

$cloudRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$backRoot = Join-Path $cloudRoot 'Back'
$serverPath = Join-Path $backRoot 'src\server.mjs'
$cloudflaredPath = Join-Path $cloudRoot 'tools\cloudflared.exe'
$runtimeRoot = Join-Path $cloudRoot 'runtime'
$localUrl = 'http://127.0.0.1:8787/front'
$healthUrl = 'http://127.0.0.1:8787/api/health'
$bundledNode = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
$serverProcess = $null
$tunnelProcess = $null

function Pause-OnError([string]$message) {
  Write-Host "`n启动失败：$message" -ForegroundColor Red
  Write-Host "日志目录：$runtimeRoot" -ForegroundColor Yellow
  Read-Host '按 Enter 关闭'
  exit 1
}

function Stop-OwnedProcess([string]$pidFile) {
  if (-not (Test-Path -LiteralPath $pidFile)) { return }
  $savedPid = (Get-Content -LiteralPath $pidFile -Raw -ErrorAction SilentlyContinue).Trim()
  if ($savedPid -match '^\d+$') {
    $existing = Get-Process -Id ([int]$savedPid) -ErrorAction SilentlyContinue
    if ($existing) { Stop-Process -Id $existing.Id -ErrorAction SilentlyContinue }
  }
  Remove-Item -LiteralPath $pidFile -Force -ErrorAction SilentlyContinue
}

function Stop-StaleSkillSServer {
  $listener = Get-NetTCPConnection -LocalPort 8787 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
  if (-not $listener) { return }
  $owner = Get-CimInstance Win32_Process -Filter "ProcessId = $($listener.OwningProcess)" -ErrorAction SilentlyContinue
  if ($owner -and $owner.Name -ieq 'node.exe' -and $owner.CommandLine -match 'Cloud[\\/]Back[\\/]src[\\/]server\.mjs') {
    Stop-Process -Id $listener.OwningProcess -ErrorAction SilentlyContinue
    Start-Sleep -Milliseconds 500
    return
  }
  Pause-OnError '端口 8787 已被其他程序占用，请先关闭占用程序。'
}

function Test-AppReady {
  try {
    $health = Invoke-RestMethod $healthUrl -TimeoutSec 2
    $page = Invoke-WebRequest $localUrl -UseBasicParsing -TimeoutSec 2
    return $health.ok -and $page.StatusCode -eq 200 -and $page.Content -match '<title>真人帮'
  } catch { return $false }
}

function Get-LanIPv4 {
  try {
    $physical = Get-NetIPConfiguration -ErrorAction Stop | Where-Object {
      $_.NetAdapter.Status -eq 'Up' -and $_.IPv4Address -and $_.IPv4DefaultGateway -and
      $_.InterfaceDescription -notmatch 'Tunnel|Virtual|VPN|Hyper-V|WSL|Bluetooth|Sangfor|TAP|Loopback' -and
      $_.IPv4Address.IPAddress -match '^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)'
    } | Select-Object -First 1
    return $physical.IPv4Address.IPAddress
  } catch { return $null }
}

function Get-TunnelUrl([string]$outLog,[string]$errLog) {
  for ($i = 0; $i -lt 80; $i++) {
    if ($tunnelProcess.HasExited) { return $null }
    $text = ''
    if (Test-Path -LiteralPath $outLog) { $text += Get-Content -LiteralPath $outLog -Raw -ErrorAction SilentlyContinue }
    if (Test-Path -LiteralPath $errLog) { $text += Get-Content -LiteralPath $errLog -Raw -ErrorAction SilentlyContinue }
    $match = [regex]::Match($text,'https://[a-z0-9-]+\.trycloudflare\.com')
    if ($match.Success) { return "$($match.Value)/front" }
    Start-Sleep -Milliseconds 250
  }
  return $null
}

function Wait-PublicUrl([string]$url) {
  if (-not $url) { return $false }
  for ($i = 0; $i -lt 60; $i++) {
    if ($tunnelProcess.HasExited) { return $false }
    try {
      $page = Invoke-WebRequest $url -UseBasicParsing -TimeoutSec 4
      if ($page.StatusCode -eq 200 -and $page.Content -match '<title>真人帮') { return $true }
    } catch {}
    Start-Sleep -Milliseconds 500
  }
  return $false
}

New-Item -ItemType Directory -Path $runtimeRoot -Force | Out-Null
if (-not (Test-Path -LiteralPath $serverPath)) { Pause-OnError "未找到 $serverPath" }

if (Test-Path -LiteralPath $bundledNode) {
  $nodeExe = $bundledNode
} elseif (Get-Command node -ErrorAction SilentlyContinue) {
  $nodeExe = (Get-Command node).Source
} else {
  Pause-OnError '未找到 Node.js 24。'
}

$nodeMajor = [int]((& $nodeExe --version).TrimStart('v').Split('.')[0])
if ($nodeMajor -lt 24) { Pause-OnError "Node.js 版本过低（当前 $nodeMajor，需要 24 或更高）。" }

Stop-OwnedProcess (Join-Path $runtimeRoot 'cloudflared.pid')
Stop-StaleSkillSServer

$serverOut = Join-Path $runtimeRoot 'server.out.log'
$serverErr = Join-Path $runtimeRoot 'server.err.log'
$tunnelOut = Join-Path $runtimeRoot 'tunnel.out.log'
$tunnelErr = Join-Path $runtimeRoot 'tunnel.err.log'
Remove-Item -LiteralPath $serverOut,$serverErr,$tunnelOut,$tunnelErr -Force -ErrorAction SilentlyContinue

$env:HOST = '0.0.0.0'
$env:PORT = '8787'
Write-Host '正在启动真人帮本地服务……' -ForegroundColor Cyan
$serverProcess = Start-Process -FilePath $nodeExe -ArgumentList $serverPath -WorkingDirectory $backRoot -PassThru -WindowStyle Hidden -RedirectStandardOutput $serverOut -RedirectStandardError $serverErr
$serverProcess.Id | Set-Content -LiteralPath (Join-Path $runtimeRoot 'server.pid') -Encoding ascii

$ready = $false
for ($i = 0; $i -lt 40; $i++) {
  if ($serverProcess.HasExited) { break }
  if (Test-AppReady) { $ready = $true; break }
  Start-Sleep -Milliseconds 250
}
if (-not $ready) { Pause-OnError '后端或前端健康检查未通过。' }

$lanIp = Get-LanIPv4
$lanUrl = if ($lanIp) { "http://${lanIp}:8787/front" } else { $null }
$publicUrl = $null

if (Test-Path -LiteralPath $cloudflaredPath) {
  Write-Host '正在建立手机可用的 HTTPS 测试地址……' -ForegroundColor Cyan
  $tunnelProcess = Start-Process -FilePath $cloudflaredPath -ArgumentList @('tunnel','--url','http://127.0.0.1:8787','--no-autoupdate','--protocol','quic') -WorkingDirectory $cloudRoot -PassThru -WindowStyle Hidden -RedirectStandardOutput $tunnelOut -RedirectStandardError $tunnelErr
  $tunnelProcess.Id | Set-Content -LiteralPath (Join-Path $runtimeRoot 'cloudflared.pid') -Encoding ascii
  $publicUrl = Get-TunnelUrl $tunnelOut $tunnelErr
  if (-not (Wait-PublicUrl $publicUrl)) { $publicUrl = $null }
}

Write-Host '============================================================' -ForegroundColor DarkCyan
Write-Host ' 真人帮 SkillS 已启动' -ForegroundColor Green
Write-Host '============================================================' -ForegroundColor DarkCyan
Write-Host "电脑本机：$localUrl"
if ($lanUrl) { Write-Host "局域网地址：$lanUrl" }
if ($publicUrl) {
  Write-Host "`n双设备统一测试地址（推荐）：" -ForegroundColor Yellow
  Write-Host $publicUrl -ForegroundColor Cyan
  Write-Host '电脑和手机都打开上面同一个 HTTPS 地址。' -ForegroundColor Yellow
} else {
  Write-Host "`nHTTPS 地址创建失败；订单和聊天可用局域网地址测试。" -ForegroundColor Yellow
  Write-Host "视频需要 HTTPS。请检查 $tunnelErr" -ForegroundColor Yellow
}
Write-Host "`n测试流程：手机发布 → 一直等待 → 电脑切换服务者并接单 → 双方进入聊天。"
Write-Host '关闭本窗口后，本次本地服务和临时 HTTPS 地址将停止。'
Write-Host "日志：$runtimeRoot" -ForegroundColor DarkGray

$openUrl = if ($publicUrl) { $publicUrl } else { $localUrl }
Start-Process $openUrl

try {
  while (-not $serverProcess.HasExited) { Start-Sleep -Seconds 1 }
} finally {
  if ($tunnelProcess -and -not $tunnelProcess.HasExited) { Stop-Process -Id $tunnelProcess.Id -ErrorAction SilentlyContinue }
  Remove-Item -LiteralPath (Join-Path $runtimeRoot 'server.pid'),(Join-Path $runtimeRoot 'cloudflared.pid') -Force -ErrorAction SilentlyContinue
}
