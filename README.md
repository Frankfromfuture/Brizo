<div align="center">
  <img src="./logo.svg" alt="Brizo logo" width="104" />
  <br />
  <img src="./logo%20brizo.png" alt="Brizo" width="196" />

  <h3>Navigate beyond the known.</h3>

  <p>
    一款将原生网页浏览、证据优先的 AI 搜索与可控浏览器执行结合在一起的桌面浏览器。<br />
    A desktop browser for native browsing, evidence-first AI search, and controlled web execution.
  </p>

  <p>
    <a href="#中文">中文</a> · <a href="#english">English</a>
  </p>
</div>

---

<a id="中文"></a>

## Brizo 是什么

Brizo 是一个本地优先、正在快速演进的 Electron 桌面浏览器原型。它以更快的启动、更低的空闲内存、更少的网页打扰和更清晰的安全边界为基础，同时在新标签页中提供两种明确意图：

- **Ask**：检索真实网页，整理来源，生成带引用的回答与后续问题。
- **Use**：在临时、隔离的浏览器沙箱中执行网页任务，并展示实时页面与完整步骤。

输入网址时，Brizo 就是一台浏览器；输入问题时，它成为 **Brizo Scout AI**；输入需要操作网页的指令时，它会创建一个独立的 **Use** 任务标签页。AI 能力不会取代普通浏览，而是与浏览并列存在。

## 核心体验

| 模式 | 用途 | 关键行为 |
| --- | --- | --- |
| **Browse** | 打开真实网页、PDF 与下载文件 | 每个网页使用与 Brizo UI 隔离的 Electron `WebContentsView`；普通标签共享正常浏览 profile |
| **Ask** | 研究问题与搜索信息 | 查询规划、多路检索、证据排序、引用审计、相关图片与后续问题 |
| **Use** | 执行有明确目标的网页操作 | 一次一沙箱、实时页面、完整步骤、暂停/继续、结果验证与执行上限 |
| **Brief** | 阅读高价值国内外事件 | 聚合、去重、重要性排序，并在站内打开多来源中文简报 |
| **Library** | 管理长期浏览资料 | 书签、文件夹、历史记录、下载内容、密码箱与本地结果快照 |

## 本轮 Top 级升级

### 极致快速与低系统负担

- 移除未使用的通用 Remotion/Remocn 运行时、颜色运行时、旧字体和 166 个未使用的书签 SVG 输出；保留实际使用的轻量 Remocn 图标与动效。
- HarmonyOS Sans SC 从 8.26 MB TTF 转为完整字符集的 4.28 MB WOFF2；当前整个 `dist` 逻辑大小约 4.9 MiB。
- 不再为每个标签长期保留 base64 页面预览；窗口隐藏、失焦或标签离开前台时暂停非必要工作。
- 新标签页粒子背景使用单个原生 WebGL2 画布、192 × 192 程序化网格、单 draw call、24 FPS 上限；入场结束后停在静态帧。
- 高开销边框光束只播放两圈；Sparkles 保留轻量、感知焦点状态的低频动效，不再让空闲页面持续重绘。
- 搜索支持取消，页面观察与快照节流；启动和空闲性能可通过 `npm run perf:compare` 重复测量。

当前构建画像：主渲染 JS 542.24 kB（gzip 154.28 kB）、Brief 异步块 23.81 kB（gzip 9.73 kB）、CSS 229.18 kB（gzip 38.37 kB）、完整 WOFF2 字体 4.18 MiB。主渲染块仍超过 500 kB，下一阶段应继续把 Settings、密码箱和收藏夹拆到惰性加载边界，并缩小通用图标入口。

### 同机 Chrome 方向性基准

2026-08-24 在 Apple M5、16 GB、macOS Darwin 25.5 上，以 Electron 43.2.0 对比 Chrome 151.0.7922.172。启动为 5 次全新进程，空闲为 3 次采样、预热 8 秒后统计 5 秒；Chrome 的空闲样本仅在顶层界面与内容渲染进程均就绪后才接受。

| 指标 | Brizo | Chrome | Brizo 相对结果 |
| --- | ---: | ---: | ---: |
| 冷进程启动中位数 | 349.5 ms | 527.8 ms | 快 33.8% |
| 5 次启动 p95 / 最大值 | 384.2 ms | 661.7 ms | 快 41.9% |
| 稳定空闲进程数 | 4 | 9 | 少 55.6% |
| 稳定空闲 RSS 中位数 | 817.3 MiB | 1113.3 MiB | 低 26.6% |
| 稳定空闲 CPU（整机口径） | 0.2% | 0.1% | Chrome 更低 0.1 个百分点 |
| macOS 应用逻辑大小 | 353.8 MiB | 2.05 GiB | 小 83.2% |

这不是标准化浏览器跑分：Brizo 打开真实新标签页，Chrome 打开极简本地页；它测量冷进程而非冷磁盘，而且两者的“就绪”生命周期并不完全相同。Chrome 安装包也包含更多架构、语言、更新器和成熟浏览器功能。上述数据用于持续回归，不用于宣称所有场景绝对领先。

### 本地密码自动化与安全边界

- “密码箱”由 Electron `safeStorage` 加密，凭证按精确 HTTPS origin（包括端口）隔离；拒绝 HTTP、IP、本地域名和不安全的公共后缀式目标。
- 写入采用串行、原子更新和 `0600` 文件权限；损坏存储会被保留供恢复，不会静默覆盖。
- 填充用户名/密码使用 15 秒一次性授权，绑定目标页面、frame、origin、凭证和表单指纹；导航或页面销毁会立即撤销。
- 明文密码不返回 Brizo 自有 UI renderer，也不通过产品 IPC API 暴露；一次性授权后，仅由目标外部网页的受控 preload 写入已核验表单。复制敏感内容 30 秒后清理剪贴板，并且只在剪贴板仍由 Brizo 持有该值时清理。
- 普通外部网页可使用本地密码箱；Use 临时沙箱默认不能静默读取普通浏览凭证，也不会替用户绕过登录或验证。
- 渲染器采用限制性 CSP，外部网页日志和诊断信息会移除敏感 URL 参数与文本。
- 远程图片经过 HTTPS-only 代理：DNS 与重定向重新校验，阻止私网、元数据地址和高风险端口，并限制类型、魔数、体积、超时与跳转次数。

### 免广告与 Cookie 打扰

- 基于 `@ghostery/adblocker` 的广告/跟踪请求拦截，规则延迟编译、缓存 7 天，并提供本地回退，不阻塞应用启动或主页面导航。
- 页面净化提供全局关闭、平衡、严格三档，并允许每站单独启用或关闭。
- 对 OneTrust、Cookiebot、Didomi、Usercentrics 等高置信度同意框执行确定性处理，并覆盖可安全访问的 shadow root 与同源 iframe。
- 不操纵登录 Cookie，不绕过付费墙，也不会把不确定的弹窗误当成 Cookie 横幅。

### Ask：证据优先的 AI 搜索

- 查询规划与多路检索融合，按第一方/机构、权威媒体和其他来源分级；使用 BM25 选取相关段落，并结合时效、域名去重和实体官网优先级。
- 生成前建立证据包，流式回答完成后审计引用、数字和来源覆盖；截断或无法落地到证据的结果不会伪装成成功。
- 来源先于回答 token 固定，便于边生成边核验；搜索结果仍可保存为本地快照、复制和导出 PDF。
- 本地附件通过主进程一次性句柄读取，限制 20 MB，并复核路径、符号链接和文件替换；支持文本、Markdown、HTML 与可提取文本的 PDF。
- 图片、DOCX 和扫描 PDF 的视觉/OCR 理解尚未完成，不能宣称已经覆盖。

当前真实联网 smoke 已能完成规划、检索和生成，但在只启用旧检索回退时会诚实标记 `degraded` / `grounded: false`。要把 Ask 做到稳定超越现有答案引擎，仍需配置主检索、二级检索/重排和可靠的 OpenAI-compatible 模型；README 不把这一目标写成已经达成。

### Use：可验证的日常网页执行

- 每个命令创建唯一、非持久化、权限默认拒绝的隔离沙箱；Node integration 关闭，context isolation 与 Chromium sandbox 开启。
- 页面观察可读取表单约束、contenteditable、shadow DOM、同源 iframe 与缩放后的真实坐标，敏感字段只显示脱敏状态。
- “填写”与“提交”分离；填写动作不会自行提交。可能产生外部影响的提交必须来自用户明确指令，网页文本或模型理由不能替用户授权。
- 每一步写入只追加的证据账本，并通过 URL、字段值、选中状态、可见结果等后置条件验证；页面无变化时不会把点击伪报为成功。
- 搜索框提交、登录弹窗关闭、重定向、坐标缩放、陈旧元素恢复和重复动作检测采用确定性规则；单任务最多执行 50 个浏览器动作。
- 支持真正的合作式暂停/继续：保留沙箱、页面、已完成步骤、剩余计划和当前结果，不通过终止后重跑来伪装恢复。
- 结果首先说明实际使用的网站域名，再给出结论、完整数据、建议与风险；数字必须能回到执行证据。购买、支付、认证或不可逆操作不会被虚报为完成。
- 跨站执行仍属实验性能力，不保证覆盖任意网站、复杂登录、支付或强反自动化流程。

### 润物无声的 Pilot

- AI 不持续监听页面，也不会自动上传浏览内容；Pilot 只在用户点击明确入口时读取当前页的受限上下文。
- Browse、Ask 和 Use 始终是三个清晰入口：普通浏览不被聊天框接管，搜索与执行也不会静默改变当前标签。
- 新标签页 Ask/Use、直接 Bing/Google 搜索、历史恢复、书签、下载、PDF 和密码箱共同形成可日常使用的完整路径。

## 当前能力

### 浏览器外壳

- 多标签页浏览，保留各标签页的页面状态、历史与滚动位置。
- 地址栏同时支持网址、自然语言搜索、Bing 与 Google 直接搜索。
- 首次打开外部网页时用 Brizo 暖色加载层遮住原生空白帧，等到连续两个合成器绘制帧后再揭示页面；真实导航超时统一为 20 秒。
- 外部网页标签、地址栏与页面背景联动，并根据明暗自动调整控件对比度。
- 内置 PDF 阅读流程，可打开远程、本地、下载及由 Brizo 生成的 PDF。
- 下载记录、文件打开、Finder 定位、暂停/取消与完成后操作。
- 普通文字、链接、图片及链接图片的 Brizo 原生右键菜单。
- 单实例运行；重复启动只聚焦已有窗口，避免用户落入旧构建或重复进程。

### Brizo Scout AI（Ask）

- 将问题规划为少量有效查询，并从真实网页检索证据。
- 按第一方/机构来源、权威媒体和其他来源分层排序。
- 跨检索源融合、域名去重、BM25 段落选择和时效置信度排序后生成带引用回答。
- 对回答中的引用与数字执行完成后审计，同时保留可恢复的本地结果快照。
- 对明确人物或实体，在证据可靠时展示最多三张经来源与名称规则筛选的可信图片。
- 每次完成搜索都生成五个可继续探索的问题。
- 支持安全的本地文本/PDF 附件、复制完整结果、导出 PDF，以及复制可恢复的 Brizo 搜索地址。

### Brizo Use

- 为每次任务创建唯一、非持久化、隔离的临时浏览器会话。
- 在结果页嵌入真实网页画面，并同步显示操作步骤。
- 支持合作式暂停与继续，不会把“暂停”伪装成终止后重跑。
- 区分填写与提交，记录执行证据，并验证每一步是否真的改变了页面。
- 限制单次任务为最多 50 个浏览器操作，并保留循环检测、陈旧引用恢复与失败说明。
- 任务完成后销毁沙箱，不与普通浏览标签共享会话。

### Brief 与资料管理

- Brief 以国内外高价值事件为核心，聚合同一事件的多来源报道。
- 书签支持浏览器/HTML 导入、多级文件夹、搜索、改名、移动与删除。
- 内置双栏书签整理页，支持层级目录与真实持久化数据。
- 网页历史和 Scout 搜索历史统一管理，可恢复结果或重新填入查询。
- 本地密码箱使用 Electron `safeStorage` 保存凭证，明文密码不返回 Brizo 自有 UI renderer；表单填充只通过目标网页的受控一次性通道。

## 隐私与安全边界

Brizo 的桌面架构把浏览器页面与产品界面分开：

- 外部网站运行于隔离的 `WebContentsView`，关闭 Node integration。
- 启用 context isolation 与 Chromium sandbox，默认拒绝远程权限请求。
- Preload 只暴露受控 IPC 能力，不向网页开放任意桌面访问。
- Use 使用非持久化临时 partition，与普通浏览数据隔离。
- API Key 与密码由 Electron 安全存储处理，不写入公开构建产物或渲染器存储。
- 私密窗口不写入普通浏览历史和下载历史。
- 广告拦截规则和 Cookie 净化在本地执行；Pilot 不在后台持续上传页面。
- 当前更新流程只提供诚实的手动发行提示，尚未接入带签名和可验证发布源的自动更新器。

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
- **Ghostery Adblocker**：本地广告与跟踪请求过滤。
- **PDF.js**：受控的本地与远程 PDF 文本提取。
- **轻量 Remocn 衍生组件 + CSS / WebGL2**：克制的图标和一次性动效，不引入 Remotion player 常驻运行时。
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

Scout 的实时检索和生成能力需要本地配置可用的搜索服务及 OpenAI-compatible 模型提供方。增强检索以 Serper.dev 为主检索、博查（Bocha）为中文网页补充与交叉排序；两者都未配置时只使用能力较弱的旧检索回退。仓库不包含真实密钥。

```bash
npm run search:configure
```

请勿提交本地 Key、访问令牌、密码或用户数据。

### 哪些能力需要外部服务

| 能力 | 是否需要额外 API / 资质 | 当前边界 |
| --- | --- | --- |
| 普通浏览、PDF、下载、书签、历史 | 否 | 本地 Electron 能力 |
| 广告拦截与 Cookie 净化 | 否 | 规则与偏好在本地运行 |
| 密码箱与用户名/密码填充 | 否 | 依赖操作系统支持的 Electron `safeStorage` |
| Use 网页执行 | 生成计划需要可用模型；浏览沙箱本身不需要第三方自动化 API | 默认不读取普通浏览凭证，不执行登录绕过、支付或不可逆操作 |
| Ask 回答生成 | 是 | 需要用户绑定 OpenAI-compatible 模型 |
| Ask 增强网页检索 | 是 | 建议同时配置 Serper.dev 与博查；无 Key 时降级 |
| 图片/扫描件理解 | 尚未完成 | 需要后续接入视觉模型或 OCR，当前不能依赖 |
| 自动更新 | 尚未完成 | 正式发布前需要签名证书与可信 release feed |

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
| `npm run test:bookmarks` | 运行收藏夹图标资源测试 |
| `npm run test:password` | 运行密码箱测试 |
| `npm run test:hygiene` | 运行广告拦截与 Cookie 净化测试 |
| `npm run test:browser-agent` | 运行 Use 执行、证据与后置条件测试 |
| `npm run test:security` | 运行安全边界与敏感数据测试 |
| `npm run test:performance` | 运行性能生命周期与构建卫生测试 |
| `npm run desktop:smoke` | 验证本地文件桌面运行时 |
| `npm run desktop:browser-smoke` | 验证隔离外部网页运行时 |
| `npm run perf:startup` | 执行可重复的启动性能基准 |
| `npm run perf:compare` | 构建后与本机 Chrome 比较启动、空闲资源与应用大小 |
| `npm run dist:mac` | 构建 macOS 安装包 |
| `npm run dist:win` | 构建 Windows 安装包 |
| `npm run dist:linux` | 构建 Linux 安装包 |

## 验证状态

本轮完整验证覆盖 265 次测试执行：搜索与回答 57、Brief 26、书签 1、密码与凭证 17、页面净化 7、Use/浏览器代理 74、安全边界 68、性能 11、Sites 4，全部通过。同时完成：

- `npm run build`
- `npm run desktop:smoke`
- `npm run desktop:browser-smoke`
- `npm audit --omit=dev` 与完整 `npm audit`：0 个已知漏洞

真实联网搜索 smoke 也已运行；它暴露的降级检索/未 grounded 状态被保留为已知缺口，而不是通过测试文案隐藏。

## 项目状态

Brizo 目前是可运行的早期桌面原型，而不是稳定发行版。浏览器外壳、Ask、Use、Brief、书签、下载、历史、密码箱和 PDF 流程都在持续迭代；界面、数据结构与内部 API 仍可能变化。

欢迎通过 Issue 报告可复现问题。提交问题时，请移除网址查询参数中的敏感内容、API Key、密码和个人文件路径。

---

<a id="english"></a>

## English

Brizo is a local-first, early-stage Electron desktop browser that keeps ordinary browsing, evidence-first AI search, and controlled web execution as three distinct experiences.

- **Browse** opens real websites and PDFs in Electron `WebContentsView` instances isolated from the Brizo UI; normal tabs share the normal browsing profile.
- **Ask** powers Brizo Scout AI: query planning, multi-provider retrieval, authority and passage ranking, citation/number audits, local text/PDF context, screened source images, result snapshots, and follow-up questions.
- **Use** creates a unique non-persistent sandbox, embeds the live webpage in a dedicated result tab, separates fill from submit, records append-only evidence, verifies postconditions, and supports cooperative pause/resume.
- **Brief** organizes consequential domestic and international events into a deduplicated, source-aware reading stream.
- **Library tools** cover nested bookmarks, browsing/search history, downloads, PDF export, and a local `safeStorage`-backed password vault.

The 2026-08-24 directional benchmark on an Apple M5 measured a 349.5 ms median cold-process startup versus Chrome's 527.8 ms, four versus nine stable-idle processes, and 817.3 MiB versus 1113.3 MiB idle RSS. Brizo's idle CPU was 0.2% versus Chrome's 0.1%, so Brizo does not claim a win on every metric. This is a reproducible shell regression baseline, not a standardized cross-browser benchmark.

External pages run without Node integration, with context isolation and Chromium sandboxing enabled. Remote permissions are denied by default, Use sessions do not share the normal browsing partition, and saved model credentials are handled in the Electron main process. Local ad/tracker blocking, deterministic cookie-banner handling, origin-bound one-time credential fill, expiring sensitive clipboard data, guarded remote images, and redacted diagnostics are included in the current codebase. Cross-site Use remains experimental and does not promise arbitrary-site, complex-authentication, payment, or anti-bot coverage.

### Quick start

```bash
git clone https://github.com/Frankfromfuture/Brizo.git
cd Brizo
npm install
npm run build
npm run desktop:run
```

Live Scout generation requires a locally configured OpenAI-compatible model. Strong retrieval is designed for Serper.dev plus Bocha; without those services Brizo falls back to a weaker retrieval tier and marks the result as degraded. Vision/OCR for images, DOCX, and scanned PDFs, as well as a signed automatic-update feed, remain unfinished. No production credentials are included in this repository.

## License

See [LICENSE](./LICENSE).

Brizo also bundles HarmonyOS Sans SC. Copyright 2021 Huawei Device Co., Ltd. All Rights Reserved. Its separate [HarmonyOS Sans Fonts License Agreement](https://gitee.com/openharmony/global_system_resources/blob/master/LICENSE_Fonts) and the [official Huawei design-resource page](https://developer.huawei.com/consumer/en/design/resource/) apply to that font; the repository's project license does not replace the font license.

---

<div align="center">
  <img src="./logo.svg" alt="Brizo logo" width="48" />
  <br />
  <strong>Brizo, navigate beyond the known.</strong>
</div>
