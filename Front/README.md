# SkillS 工程前端

`index.html` 是网页入口文件，不能删除。它只负责加载以下分离资源：

- `config/env.js`：前后端环境配置
- `css/styles.css`：页面样式
- `js/views.js`：页面视图定义
- `js/app.js`：核心交互与路由
- `js/problem-api.js`：问题整理、标签与案例接口
- `js/integration.js`：订单、消息、视频及后端集成

## 启动

在 PowerShell 中运行：

```powershell
& 'D:\Xiangmu\SkillS\APP\Cloud\启动SkillS本地版.ps1'
```

或者双击 `D:\Xiangmu\SkillS\APP\Cloud\启动SkillS本地版.cmd`。

启动后访问：<http://127.0.0.1:8787/front>

不要直接双击打开 `index.html`，因为真实案例、AI、订单、消息和视频信令需要通过本地后端提供的 HTTP API 工作。

## 画布与响应式规则

- 设计画布固定为 `390 × 844`。
- 网页端按原尺寸居中显示。
- 手机屏幕宽度小于 390px 时按宽度等比缩放，不改变内部布局比例。
- 页面会在渲染时删除模拟时间、网络、电量状态栏和底部 Home Indicator。
