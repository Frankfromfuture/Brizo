<div align="center">
  <img src="./logo.png" alt="Brizo logo" width="104" />
  <br />
  <img src="./logo%20brizo.png" alt="Brizo" width="196" />

  <h3>Navigate beyond the known.</h3>

  <p>
    一款将原生网页浏览、可信 AI 搜索与可控浏览器执行结合在一起的桌面浏览器。<br />
    A desktop browser for native browsing, grounded AI search, and controlled web execution.
  </p>

  <p>
    <a href="#中文">中文</a> · <a href="#english">English</a>
  </p>
</div>

---

<a id="中文"></a>

## Brizo 是什么

Brizo 是一个正在快速演进的 Electron 桌面浏览器原型。它保留浏览器最直接的使用方式，同时在新标签页中提供两种明确意图：

- **Ask**：检索真实网页，整理来源，生成带引用的回答与后续问题。
- **Use**：在临时、隔离的浏览器沙箱中执行网页任务，并展示实时页面与完整步骤。

输入网址时，Brizo 就是一台浏览器；输入问题时，它成为 **Brizo Scout AI**；输入需要操作网页的指令时，它会创建一个独立的 **Use** 任务标签页。AI 能力不会取代普通浏览，而是与浏览并列存在。

## 核心体验

| 模式 | 用途 | 关键行为 |
| --- | --- | --- |
| **Browse** | 打开真实网页、PDF 与下载文件 | 每个外部网页使用独立、隔离的 Electron `WebContentsView` |
| **Ask** | 研究问题与搜索信息 | 真实检索、来源排序、引用回答、相关图片、五个后续问题 |
| **Use** | 执行有明确目标的网页操作 | 一次一沙箱、实时页面、步骤追踪、暂停/继续、执行上限 |
| **Brief** | 阅读高价值国内外事件 | 聚合、去重、重要性排序，并在站内打开多来源中文简报 |
| **Library** | 管理长期浏览资料 | 书签、文件夹、历史记录、下载内容、密码箱与本地结果快照 |

## 当前能力

### 浏览器外壳

- 多标签页浏览，保留各标签页的页面状态、历史与滚动位置。
- 地址栏同时支持网址、自然语言搜索、Bing 与 Google 直接搜索。
- 外部网页标签、地址栏与页面背景联动，并根据明暗自动调整控件对比度。
- 内置 PDF 阅读流程，可打开远程、本地、下载及由 Brizo 生成的 PDF。
- 下载记录、文件打开、Finder 定位、暂停/取消与完成后操作。
- 普通文字、链接、图片及链接图片的 Brizo 原生右键菜单。

### Brizo Scout AI（Ask）

- 将问题规划为少量有效查询，并从真实网页检索证据。
- 按第一方/机构来源、权威媒体和其他来源分层排序。
- 去重后生成带引用回答，同时保留可恢复的本地结果快照。
- 对明确人物或实体，在证据可靠时展示最多三张权威图片。
- 每次完成搜索都生成五个可继续探索的问题。
- 支持复制完整结果、导出 PDF，以及复制可恢复的 Brizo 搜索地址。

### Brizo Use

- 为每次任务创建唯一、非持久化、隔离的临时浏览器会话。
- 在结果页嵌入真实网页画面，并同步显示操作步骤。
- 支持合作式暂停与继续，不会把“暂停”伪装成终止后重跑。
- 限制单次任务的浏览器操作数量，并保留循环检测与失败说明。
- 任务完成后销毁沙箱，不与普通浏览标签共享会话。

### Brief 与资料管理

- Brief 以国内外高价值事件为核心，聚合同一事件的多来源报道。
- 书签支持浏览器/HTML 导入、多级文件夹、搜索、改名、移动与删除。
- 内置双栏书签整理页，支持层级目录与真实持久化数据。
- 网页历史和 Scout 搜索历史统一管理，可恢复结果或重新填入查询。
- 本地密码箱使用 Electron `safeStorage` 保存凭证，明文密码不返回渲染层。

## 隐私与安全边界

Brizo 的桌面架构把浏览器页面与产品界面分开：

- 外部网站运行于隔离的 `WebContentsView`，关闭 Node integration。
- 启用 context isolation 与 Chromium sandbox，默认拒绝远程权限请求。
- Preload 只暴露受控 IPC 能力，不向网页开放任意桌面访问。
- Use 使用非持久化临时 partition，与普通浏览数据隔离。
- API Key 与密码由 Electron 安全存储处理，不写入公开构建产物或渲染器存储。
- 私密窗口不写入普通浏览历史和下载历史。

> Brizo 仍是开发阶段的软件。请不要把当前原型视为经过完整安全审计的正式浏览器发行版。

## 技术架构

```text
React 19 + Vite renderer
├── tabs / toolbar / bookmarks / menus
├── new tab: Ask + Use
├── Scout results + Brief
└── renderer-owned popovers and local pages
             │ narrow preload bridge
             ▼
Electron main process
├── isolated external-page WebContentsView instances
├── temporary Use sandbox WebContentsView
├── navigation / downloads / PDF / native dialogs
├── encrypted model and credential storage
└── search, answer, history and bookmark services
```

主要技术包括：

- **React 19 + Vite**：浏览器外壳和 Brizo 自有页面。
- **Electron**：窗口、隔离网页、下载、PDF、原生文件能力与安全存储。
- **Mozilla Readability + Cheerio**：正文提取与文档处理。
- **Remotion / Remocn components**：克制的图标与界面动效。
- **OpenAI-compatible model providers**：由用户在本地绑定，支持模型发现与选择。

## 本地运行

### 环境要求

- Node.js 20 或更高版本
- npm
- macOS、Windows 或 Linux（当前桌面原型主要在 macOS 上验证）

```bash
git clone https://github.com/Frankfromfuture/Brizo.git
cd Brizo
npm install
npm run build
npm run desktop:run
```

在 macOS 上也可以双击 `Brizo.command`。兼容旧快捷方式的 `Bean.command` 仍然保留。

### 搜索与模型配置

Scout 的实时检索和生成能力需要本地配置可用的搜索服务及 OpenAI-compatible 模型提供方。仓库只提供示例配置，不包含真实密钥。

```bash
npm run search:configure
```

请勿提交本地 Key、访问令牌、密码或用户数据。

## 常用命令

| 命令 | 说明 |
| --- | --- |
| `npm run dev` | 启动 Vite 界面开发服务器 |
| `npm run build` | 构建客户端并准备 Sites 产物 |
| `npm run desktop:run` | 使用现有 `dist` 启动桌面版 |
| `npm run desktop` | 先构建，再启动桌面版 |
| `npm test` | 运行项目测试集合 |
| `npm run test:search` | 运行搜索与回答引擎测试 |
| `npm run test:brief` | 运行 Brief 服务测试 |
| `npm run test:smart` | 运行书签与历史相关测试 |
| `npm run test:password` | 运行密码箱测试 |
| `npm run desktop:smoke` | 验证本地文件桌面运行时 |
| `npm run desktop:browser-smoke` | 验证隔离外部网页运行时 |
| `npm run perf:startup` | 执行可重复的启动性能基准 |
| `npm run dist:mac` | 构建 macOS 安装包 |
| `npm run dist:win` | 构建 Windows 安装包 |
| `npm run dist:linux` | 构建 Linux 安装包 |

## 项目状态

Brizo 目前是可运行的早期桌面原型，而不是稳定发行版。浏览器外壳、Ask、Use、Brief、书签、下载、历史、密码箱和 PDF 流程都在持续迭代；界面、数据结构与内部 API 仍可能变化。

欢迎通过 Issue 报告可复现问题。提交问题时，请移除网址查询参数中的敏感内容、API Key、密码和个人文件路径。

---

<a id="english"></a>

## English

Brizo is an early-stage Electron desktop browser that keeps ordinary browsing, grounded AI search, and controlled web execution as three distinct experiences.

- **Browse** opens real websites and PDFs in isolated Electron `WebContentsView` instances.
- **Ask** powers Brizo Scout AI: real retrieval, ranked sources, cited answers, verified entity images, result snapshots, and follow-up questions.
- **Use** creates a unique non-persistent sandbox, embeds the live webpage in a dedicated result tab, records each operation, and supports cooperative pause/resume.
- **Brief** organizes consequential domestic and international events into a deduplicated, source-aware reading stream.
- **Library tools** cover nested bookmarks, browsing/search history, downloads, PDF export, and a local `safeStorage`-backed password vault.

External pages run without Node integration, with context isolation and Chromium sandboxing enabled. Remote permissions are denied by default, Use sessions do not share the normal browsing partition, and saved model credentials are handled in the Electron main process.

### Quick start

```bash
git clone https://github.com/Frankfromfuture/Brizo.git
cd Brizo
npm install
npm run build
npm run desktop:run
```

Live Scout search and generation require locally configured retrieval services and an OpenAI-compatible model provider. No production credentials are included in this repository.

## License

See [LICENSE](./LICENSE).

---

<div align="center">
  <img src="./logo.png" alt="Brizo logo" width="48" />
  <br />
  <strong>Brizo, navigate beyond the known.</strong>
</div>
