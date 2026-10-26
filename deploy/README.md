# 云端收尾（zhenrenbang.xin）

域名审核或备案未完成前，服务保持在现有 HTTPS 测试地址；不要把域名写死到前端。审核通过后，在服务器执行以下操作：

1. 将整个 `APP` 部署到 `/opt/zhenrenbang`，并将 `Back/.env.production.example` 复制为 `Back/.env`，填入真实百炼 Key。
2. `sudo install -m 644 deploy/systemd/zhenrenbang.service /etc/systemd/system/zhenrenbang.service`，然后执行 `sudo systemctl daemon-reload && sudo systemctl enable --now zhenrenbang`。
3. 先将 `deploy/nginx/zhenrenbang.xin.conf` 的证书两行临时注释，安装 Nginx 与 Certbot，签发 `zhenrenbang.xin` 和 `www.zhenrenbang.xin` 的证书；再恢复两行并启用该配置。
4. `curl -fsS https://zhenrenbang.xin/api/health` 应返回 `ok: true`。两台手机分别完成发布、接单、文字消息和视频测试。

`webrtc_signals` 已写入 SQLite，只存 SDP/ICE 信令，不存储音视频。TURN 仍保持空配置；只有跨网络直连失败时才填入 TURN 环境变量并重启服务。
