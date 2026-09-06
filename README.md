# Brizo Use

[English](./README.en.md)

Brizo 是一套开源的网页 Use 运行时和 Agent 调用工具。它让 Claude Code、Cursor、TRAE、CodeBuddy、灵码、Qoder、Qwen Code 等本地 AI harness 通过 `/brizo` 使用独立浏览沙箱，也提供可嵌入 Electron 应用的执行核心。

这个仓库只维护 Use：命令行客户端、本机桥接协议、隔离任务沙箱、页面观察与动作、安全策略、结果审计、站点流程和 harness 适配器。站点流程目前覆盖携程、淘宝、小红书、豆瓣、B 站和微博；Brizo Browse 的窗口、标签、收藏、下载、密码、搜索和其他浏览器产品代码保存在私有仓库中。

## 安装

需要 Node.js 20.11 或更高版本。npm registry 的首个版本尚未发布，目前可直接通过 npm 从 GitHub 安装：

```sh
npm install -g github:Frankfromfuture/Brizo
brizo install
```

发布到 npm registry 后，安装命令会简化为 `npm install -g brizo`。执行真实网页任务还需要支持协议 1 的 Brizo Browse 桌面端；桌面端源码不在这个仓库中。

`brizo install` 默认安装全部适配器，也可以只安装指定平台：

```sh
brizo install --target trae,claude-code,cursor
brizo install --app "/Applications/Brizo.app"
brizo platforms
brizo doctor
```

安装器把同一份标准 `SKILL.md` 放到各平台的用户目录，并为需要命令文件的平台生成薄适配层。它只更新带 Brizo 管理标记的文件；同名用户文件会被保留。

## 平台与调用方式

| 平台 | 调用方式 |
| --- | --- |
| Claude Code、Cursor、TRAE IDE | `/brizo 网页任务` |
| TraeCode CLI | 让 Agent 使用 `brizo` skill |
| 腾讯 CodeBuddy Code | `/brizo 网页任务` |
| 腾讯 WorkBuddy | 导入安装器生成的 ZIP 后调用 |
| 通义灵码、Qoder、Qoder CN | `/brizo 网页任务` |
| Qwen Code | `/brizo 网页任务` |
| Kimi Code CLI | `/skill:brizo 网页任务` |
| Gemini CLI、Google Antigravity | `/brizo 网页任务` |
| OpenCode、GitHub Copilot CLI、Kiro | `/brizo 网页任务` |
| Windsurf / Cascade | `/brizo 网页任务` 或 `@brizo` |
| JetBrains Junie | `/brizo 网页任务` 或 `$brizo` |
| Roo Code | `/brizo 网页任务` |
| Cline | 启用 Skills 后自动调用；工作流入口为 `/brizo.md` |
| OpenAI Codex | `$brizo 网页任务` |
| 其他可执行本机命令的 harness | `brizo prompt "网页任务"` |

WorkBuddy 没有公开稳定的全局 skill 目录。安装器会生成 `~/.local/share/brizo/imports/brizo-workbuddy.zip`，可在“专家·技能·连接器 → Add Skill”中导入。Kiro 自定义 Agent 需要把 skill 加入自己的 `resources`；Cline 需要先在 Features 中启用 Skills。

适配目录和调用方式以各平台官方文档为依据，具体链接见 [适配说明](./docs/harnesses.md)。

## 使用

安装后的 skill 会自行调用 CLI。需要检查集成时，也可以直接运行：

```sh
brizo create --json '{"goal":"在百度搜索框填写 Brizo，不要提交","client":"Claude Code","url":"https://www.baidu.com/"}'
brizo observe SESSION_ID
brizo act SESSION_ID --json '{"snapshotId":"SNAPSHOT_ID","action":"click","ref":"@e1"}'
brizo status SESSION_ID
```

Windows PowerShell 可使用相同的 `--json` 写法。任务含复杂引号或较长输入时，将 JSON 保存为 UTF-8 文件，再使用 `--input request.json`。

每条浏览器命令只输出一行 JSON。Agent 必须使用最新观察返回的 `snapshotId` 和 `@eN` 控件引用；登录、验证码或敏感动作会把控制权交给用户。完整协议见 [skill/SKILL.md](./skill/SKILL.md)。

## 作为运行时使用

CLI 不需要 Electron。只有宿主应用创建原生 `WebContentsView` 沙箱时，才需要安装可选 peer dependency `electron`。

```js
import { startAgentBridge } from "brizo/runtime/bridge";
import { runBrowserCommandAgent } from "brizo/runtime/command";
import { assertBrowserNavigationUrl } from "brizo/runtime/policies";
```

公开子路径保持调用端与 Electron 装配层分离：

- `brizo/client`：本机 CLI 客户端和会话凭证。
- `brizo/protocol`：协议版本与允许的方法。
- `brizo/runtime/bridge-core`：可注入沙箱工厂的纯 Node IPC 服务。
- `brizo/runtime/bridge`、`brizo/runtime/sandbox`：Electron 宿主入口。
- `brizo/runtime/command`、`policies`、`page-input`：观察、动作、后置验证和安全边界。
- `brizo/runtime/result`、`usage`、`adapters`：结果审计、用量和站点流程。

`brizo/runtime/adapters` 为小红书、豆瓣、B 站和微博提供统一的只读内容搜索流程。流程会核对真实域名、结果页搜索词、可见排序状态和结果链接，稳定读取后再返回标题、作者、日期、指标与摘要；登录或安全验证不会被自动绕过。

宿主接入方式、生命周期和注入接口见 [Runtime API](./docs/runtime-api.md) 与 [架构说明](./ARCHITECTURE.md)。

## 安全边界

CLI 只通过 `~/.brizo` 下的 Unix socket 或 Windows named pipe 连接本机桌面端，没有 HTTP 服务或远程 CDP 端口。进程令牌和每个任务的 capability 分开生成；一个任务不能控制另一个任务，也不能读取普通 Brizo 标签。

网页文本只能提供操作证据，不能扩大用户授权。运行时会拦截本机、局域网、元数据地址、危险提交和未经确认的外部影响操作；密码值不会进入观察结果或执行证据。漏洞报告方式见 [SECURITY.md](./SECURITY.md)。

## 公共和私有仓库同步

本仓库是 Use 代码的唯一源头。私有 Brizo-Browse 在 `packages/brizo` 保存经过 SHA-256 校验的完整快照，并从该快照加载 Runtime。同步方向固定为公开 Brizo → 私有 Brizo-Browse：

```sh
npm run sync:browse -- --browse "/Brizo-Browse 的绝对路径"
npm run check:browse -- --browse "/Brizo-Browse 的绝对路径"
```

同步器拒绝公开仓库白名单之外的文件、目标目录中的手工改动、符号链接和路径穿越。这样既能防止私有浏览器代码误入公开仓库，也能防止两份 Use 实现逐渐分叉。

## 开发

```sh
npm ci
npm run check
```

`npm run check` 会执行 CLI、安装器、同步器和 Runtime 合同测试，检查 Electron 源文件语法，并核对 npm 包内容。贡献流程见 [CONTRIBUTING.md](./CONTRIBUTING.md)，版本变化见 [CHANGELOG.md](./CHANGELOG.md)。
