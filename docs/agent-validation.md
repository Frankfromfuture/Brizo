# Agent 接口验收

2026 年 10 月 25 日，0.5.0 的 122 项项目测试和 15 个隐藏 Chromium 场景全部通过，公开文件边界、语法及 npm 包检查通过。[validation.json](./agent-evidence/validation.json)保留逐项场景和统计。

环境为 macOS、Electron 44.2.0、Chromium 152.0.7977.76。测试使用固定页面，在隔离会话中响应合成域名，宿主启用 offscreen 渲染；窗口始终隐藏，前台激活 API 调用为 0。

覆盖创建即返回观察、截图后继续动作、CSS／设备截图尺寸、语义批处理、条件等待、观察筛选与变化、超时后保留控制权、过期引用拦截、批处理部分结果及整批预检、Canvas 拖拽、坐标限制、提交授权和登录接管。Canvas 在 125% 网页缩放下执行，截图确认位置变化：

![拖动前](./agent-evidence/canvas-before.png)
![拖动后](./agent-evidence/canvas-after.png)

桌面集成另用当前 `dist/client/index.html` 和同步的嵌入 Runtime 验证了 16 个隐藏场景，保留原有过程记录与追问继续执行。生产构建和镜像检查通过，日常应用未重启；新 Runtime 会在后续正常启动时加载。详见 [desktop-validation.json](./agent-evidence/desktop-validation.json)。

同一验收页面的 JSON 观察大小为：完整 40,130 字节、默认精简 9,201 字节、只保留搜索按钮且不返回正文 483 字节。完整与精简相比减少约 77.1%。这是同版本输出形式的比较，字节数不等于 token 数；文本格式另在配对实测中记录。

本轮验收一次运行耗时 1,755 ms，包含 27 次客户端调用和故意触发的失败场景；桌面集成耗时 1,963 ms、29 次调用。它们用于复现功能验收，不代表网站任务平均耗时。旧宿主兼容测试确认截图后刷新引用，增强动作在不支持的宿主上明确报错。

Ego 后台对比现已完成：同一固定页面、尺寸匹配、每类五次，两边各 20/20 成功。Brizo 三项任务耗时更低，纯观察基本持平。测试版本、全部样本和测量限制见[配对实测报告](./ego-comparison-2026-10-25.md)。

在源码仓库复现功能验收：

```sh
npm ci
npm run check
npm install --no-save --package-lock=false electron@44.2.0
npm run verify:agent -- --output /absolute/path/agent-validation.json
```

也可通过 `--electron /absolute/path/to/Electron` 使用已有运行时。GitHub CI 运行跨平台项目检查，并在 macOS 运行隐藏浏览器验收。浏览器宿主同步嵌入新版 Runtime 后才具备这些能力。
