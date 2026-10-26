# SkillS 本地后端

Node.js 24 直接运行，无需安装 npm 依赖。

已实现 SQLite、10 个小案例、求助、规则匹配、会话、消息、结果、案例授权和手机端原生 WebRTC 双人视频。信令保存到 SQLite；不依赖 Jitsi 或其他第三方视频登录。登录、支付、上传和生产 TURN 服务仍按课程版边界处理。

```powershell
node src/server.mjs
node --check src/server.mjs
node --test test/api.test.mjs
```

打开 <http://127.0.0.1:8787>。真实配置复制 `.env.example` 为 `.env` 后填写。

外部 API 接入点：`POST /api/ai/context-card`、`POST /api/ai/case-draft`、`POST /api/sessions/:id/meeting`。

教程抓取只保存允许抓取页面的元数据与原始链接，不下载、转载第三方视频。待接入脚本位于 `scripts/import-tutorial-links.mjs`。
