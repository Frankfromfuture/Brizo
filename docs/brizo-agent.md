# 在外部 Agent 中操作 Brizo

在 Codex、腾讯 WorkBuddy 等支持本地 skill 和命令执行的 Agent 中调用 `brizo`。任务由当前 Agent 执行，Brizo 在现有主窗口里提供原生标签组；无需在 Use 输入，也无需另配模型 API Key。

本机已通过 `npm run agent:install` 安装到 Codex、通用 Agent、CodeBuddy 和 WorkBuddy 的 skill 目录。刷新 skill 列表或开启新会话后调用：

- Codex：选择 `brizo` skill，或输入 `$brizo 在百度搜索框填写 Brizo，先不要提交`。
- CodeBuddy：输入 `/brizo 在百度搜索框填写 Brizo，先不要提交`。安装器同时注册了这个斜杠命令。
- WorkBuddy：选择或提及 `brizo` skill，再输入任务。是否能以 `/brizo` 直接选择 skill，取决于宿主的命令菜单；安装本地 skill 本身不会改变宿主的输入语法。

首次调用会按本机安装配置启动 Brizo。当前开发安装指向本项目的 Electron 和生产构建；移动项目后应重新运行安装器。沙箱里的登录状态与普通 Brizo 标签分开，关闭沙箱后清除。

每个任务以“Codex 操作”“WorkBuddy 操作”等名称出现在 Brizo 侧栏。网页是组内的原生标签，沿用 Brizo 地址栏和浏览区域，不另开浏览器窗口。每组最多八个标签，最多同时保留四组沙箱。Agent 可以读取网页、截图、点击、填写、滚动和切换组内标签。每次操作使用最新观察生成的控件引用，不能读取或操控普通标签。

地址栏里的「接管网页」图标会中断当前操作。登录或网站验证需要人工处理时，也会交给用户；处理完后点击「交还 AI」，再告诉外部 Agent 继续。「停止连接」立即撤销本次操作权限，Agent 不能自行重新接管。任务完成后可保留页面供查看，或关闭整组沙箱。

连接只经过本机文件权限保护的进程通信通道，不开放 HTTP、CDP 端口或任意脚本执行接口。完整命令说明见 [brizo skill](../skills/brizo/SKILL.md)。任务说明、进度、结果和模型用量由外部 Agent 在各自平台反馈，Brizo 网页不显示这些文字。AI 操作时，页面显示与 Use 相同的流光金框，组和标签图标切换为线状电脑屏幕；接管或结束后恢复普通网页显示。
