$ErrorActionPreference = 'Stop'

$frontRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$appRoot = (Resolve-Path (Join-Path $frontRoot '..\..')).Path
$serverPath = Join-Path $appRoot 'Back\src\server.mjs'
$frontUrl = 'http://127.0.0.1:8787/front'
$healthUrl = 'http://127.0.0.1:8787/api/health'
$bundledNode = 'C:\Users\Lenovo\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'

try {
  $health = Invoke-RestMethod $healthUrl -TimeoutSec 1
  if ($health.ok) {
    Write-Host "SkillS 后端已运行，正在打开工程前端：$frontUrl" -ForegroundColor Green
    Start-Process $frontUrl
    exit 0
  }
} catch {}

if (Get-Command node -ErrorAction SilentlyContinue) {
  $nodeExe = (Get-Command node).Source
} elseif (Test-Path -LiteralPath $bundledNode) {
  $nodeExe = $bundledNode
} else {
  Write-Host '未找到 Node.js 24。' -ForegroundColor Red
  Read-Host '按 Enter 关闭'
  exit 1
}

Write-Host '正在启动 SkillS 后端与工程前端……' -ForegroundColor Cyan
$serverProcess = Start-Process -FilePath $nodeExe -ArgumentList $serverPath -WorkingDirectory (Split-Path -Parent $serverPath) -NoNewWindow -PassThru

$ready = $false
for ($i = 0; $i -lt 40; $i++) {
  if ($serverProcess.HasExited) { break }
  try {
    $health = Invoke-RestMethod $healthUrl -TimeoutSec 1
    if ($health.ok) {
      $ready = $true
      break
    }
  } catch {}
  Start-Sleep -Milliseconds 250
}

if (-not $ready) {
  Write-Host '启动失败，请查看上方错误信息。' -ForegroundColor Red
  Read-Host '按 Enter 关闭'
  exit 1
}

Write-Host "启动成功：$frontUrl" -ForegroundColor Green
Write-Host '保持此窗口运行；关闭窗口后端将停止。'
Start-Process $frontUrl
Wait-Process -Id $serverProcess.Id
