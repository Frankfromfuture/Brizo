# Agent 接口验收

2026 年 10 月 25 日，本轮 126 项项目测试、22 个公共隐藏 Chromium 场景和 23 个桌面集成场景通过。公开文件边界、语法与 npm 包检查通过；原始场景见 [validation.json](./agent-evidence/validation.json) 和 [desktop-validation.json](./agent-evidence/desktop-validation.json)。

测试环境为 macOS、Electron 44.2.0、Chromium 152.0.7977.76。固定页面在隔离会话中响应合成域名；窗口隐藏，前台激活 API 调用为 0。桌面加载当前生产构建及嵌入 Runtime，保留原有过程记录与追问继续执行。日常应用未重启。

最新 MDN 输入根因、整页／子树范围与三站复测见[新验收](./mdn-scopes-validation-2026-10-25.md)。

本轮新增验证长文章的当前视口正文、安全章节片段、控件标签、底层截断提示，以及被遮挡的控件不接收点击。等待超时返回当前观察；多匹配存在性等待通过，动作和控件值验证仍拦截歧义。既有语义批处理、截图坐标、125% 缩放 Canvas 拖拽、输入授权与登录接管场景也通过。

![拖动前](./agent-evidence/canvas-before.png)
![拖动后](./agent-evidence/canvas-after.png)

前一轮固定页面的配对性能记录基于提交 `2feb1f1`，见[固定页面报告](./ego-comparison-2026-10-25.md)。本轮真实网站的失败、恢复和仍存在的差距见[三站实测](./real-sites-comparison-2026-10-25.md)。它们的页面、源码与测试口径不同，统计分别保留。

从源码仓库复现功能验收：

```sh
npm ci
npm run check
npm install --no-save --package-lock=false electron@44.2.0
npm run verify:agent -- --output /absolute/path/agent-validation.json
```

也可通过 `--electron /absolute/path/to/Electron` 使用已有运行时。GitHub CI 执行跨平台检查和隐藏浏览器验收。宿主同步嵌入 Runtime 后才具备对应能力。
