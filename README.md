<div align="center">
  <img src="./logo.png" alt="Brizo logo" width="112" />
  <br />
  <img src="./logo%20brizo.png" alt="Brizo" width="180" />

  <h3>Navigate beyond the known.</h3>

  <p>
    A minimalist, lightning-fast AI browser that understands you.<br />
    一款极简、迅捷、优雅且懂你的 AI 浏览器。
  </p>

  <p>
    <a href="#english">English</a> · <a href="#中文">中文</a>
  </p>
</div>

---

<a id="english"></a>

## Brizo

In Greek tradition, **Brizo** was a protector of mariners, known for prophetic dreams connected with navigation. She did not choose the destination for the voyager; she offered guidance through uncertainty.

That is the idea behind this browser.

The web has become crowded with tabs, feeds, interruptions, and interfaces competing for attention. Brizo takes a quieter course: a beautiful, elegant surface; navigation that feels immediate; intelligence that appears when it is useful; and a browsing experience that gradually understands what matters to you.

**Navigate beyond the known** is not simply a tagline. It is Brizo's design principle: move past familiar links and habitual answers, without losing clarity, control, or yourself along the way.

> Less interface. Less waiting. More understanding.

## Why Brizo feels different

### Minimal by design

Brizo removes visual noise so the page, question, or idea in front of you can hold your attention. Its interface is deliberately restrained: a compact tab strip, a living address bar, an icon-first bookmark library, and a calm start page built around a single invitation—where do you want to go?

### Fast in the moments that matter

Speed is more than a benchmark. It is the absence of friction between intention and result. Brizo keeps the browsing shell lean, preconnects likely destinations, treats the address bar as a responsive command surface, and uses a fast-model-first strategy for AI-assisted exploration.

### Intelligent, not intrusive

Brizo Scout AI turns a question into a focused research path: planning concise web searches, retrieving real sources, removing duplication, ranking evidence, composing cited answers, and suggesting useful next questions. URL-like input still behaves like a browser; natural language becomes exploration.

### Personal without becoming invasive

Brizo remembers useful context locally: your search history, result snapshots, bookmarks, open research sessions, and preferred model provider. This allows suggestions and restored work to feel familiar while keeping credentials out of renderer code, build artifacts, and browser storage.

### Elegant down to the details

Brizo is designed as an object you should enjoy returning to. Its typography, pale-gold accents, continuous tab contours, subtle motion, and quiet use of space seek a timeless quality rather than a fashionable skin. Beauty here is functional: it makes complexity feel calm.

## What is inside

- **Brizo Scout AI** — source-grounded web exploration with cited answers and follow-up paths.
- **One field, two intentions** — navigate directly with a URL or explore naturally with a question.
- **Independent research tabs** — each new tab keeps its own prompt, attachments, results, sources, and follow-ups.
- **Local result memory** — reopen completed searches from history without repeating the AI or retrieval request.
- **Model Guard** — bind multiple OpenAI-compatible providers, choose a default, discover models, and keep API keys encrypted on the desktop.
- **Provider-aware model selection** — favors fast, stable, text-capable models while filtering unsuitable audio, image, embedding, and snapshot variants.
- **Living bookmark library** — import a real nested bookmark tree, preserve favicons, and organize pages through compact cascading folders.
- **Focused reading and export** — extract readable article content and produce PDF output from the desktop app.
- **Native desktop browsing** — external pages run in isolated Electron `WebContentsView` instances rather than inside the React renderer.
- **Cross-platform packaging** — application icons and build targets for macOS, Windows, and Linux.

## How Brizo thinks

```text
Your intent
   │
   ├── URL-like input ──────► fast, direct navigation
   │
   └── natural language ────► query planning
                                  │
                                  ▼
                            real web retrieval
                                  │
                                  ▼
                         rank + deduplicate sources
                                  │
                                  ▼
                       cited answer + next questions
```

Brizo does not silently invent search results. When its configured retrieval or model service is unavailable, it should say so honestly instead of fabricating a live answer.

## Architecture

Brizo is an Electron desktop application with a React interface:

- **React 19 + Vite** power the browser shell and start/search experience.
- **Electron** owns windows, tabs, downloads, navigation state, native dialogs, PDF generation, and secure desktop capabilities.
- **Isolated `WebContentsView` pages** keep external websites separated from the application renderer, with Node integration disabled, context isolation and sandboxing enabled, and remote permission requests denied by default.
- **Preload bridges** expose a narrow application API instead of giving the renderer unrestricted desktop access.
- **Vane-compatible search services** provide real web retrieval for Brizo Scout AI.
- **Mozilla Readability + Cheerio** support article extraction and document processing.
- **Local encrypted provider storage** keeps model credentials on the desktop and never returns an existing plaintext key to the interface.

## Run locally

### Requirements

- Node.js 20 or later
- npm

```bash
git clone https://github.com/Frankfromfuture/Brizo.git
cd Brizo
npm install
npm run build
npm run desktop:run
```

For interface development with Vite:

```bash
npm run dev
```

On macOS, `Brizo.command` is also provided as a double-clickable local launcher. The legacy `Bean.command` remains available for compatibility with older shortcuts.

## Useful commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the Vite development server |
| `npm run build` | Build the client and prepare the Sites bundle |
| `npm run desktop:run` | Launch Electron using the existing build |
| `npm run desktop:smoke` | Build and run the desktop smoke test |
| `npm run desktop:browser-smoke` | Verify the external-page runtime |
| `npm run test:sites` | Test static asset and application-route handling |
| `npm run perf:startup` | Run the repeatable startup benchmark |
| `npm run dist:mac` | Package for macOS |
| `npm run dist:win` | Package for Windows |
| `npm run dist:linux` | Package for Linux |

## Project status

Brizo is an early-stage, actively evolving project. The repository contains a working desktop prototype and its cross-platform packaging foundation. Some integrations require a locally reachable search service and a user-configured OpenAI-compatible model provider. Interfaces and internal APIs may change quickly.

---

<a id="中文"></a>

## Brizo：航向未知

在希腊传统中，**Brizo** 是水手的守护者，以与航行有关的预示之梦闻名。她不替远航者决定目的地，而是在充满不确定性的海面上给予指引。

这正是 Brizo 浏览器的起点。

今天的网络被标签页、信息流、弹窗与争夺注意力的界面层层包围。Brizo 选择了一条更安静的航线：美观而典雅的界面，几乎没有等待感的导航，只在需要时出现的智能，以及一个逐渐理解你真正关心什么的浏览体验。

**Navigate beyond the known——航向已知之外。**

它不只是一句口号，更是 Brizo 的设计原则：带你越过熟悉的链接和惯性的答案，同时不牺牲清晰、控制与自我。

> 更少的界面，更少的等待，更多的理解。

## Brizo 的不同之处

### 极简，是一种取舍

Brizo 主动拿掉视觉噪音，让眼前的网页、问题与念头重新成为中心。紧凑的标签栏、会呼吸的地址栏、图标优先的书签库，以及只围绕一个问题展开的起始页——你想去往哪里？

### 速度，是意图与结果之间没有阻力

真正的快不只是一组跑分，而是你想到某件事时，不必等待界面追上来。Brizo 保持轻量的浏览器外壳，为可能访问的目标提前建立连接，让地址栏成为灵敏的命令入口，并在智能探索中优先选择快速、稳定、适合文本的模型。

### 智能，但不打扰

Brizo Scout AI 会把一个自然语言问题变成清晰的研究路径：规划少量有效查询、检索真实网页、去重并排序来源、生成带引用的回答，再给出值得继续追问的方向。输入网址时，它仍然是一台直接、快速的浏览器；输入问题时，它才成为探索工具。

### 懂你，但不窥探你

Brizo 在本地保留真正有用的上下文：搜索历史、结果快照、书签、尚未结束的研究会话，以及你偏好的模型服务。这让建议和恢复体验越来越熟悉，同时避免把凭证写入渲染代码、构建产物或浏览器存储。

### 美观、优雅、典雅

Brizo 希望成为一个让人愿意反复回来的数字物件。字体、淡金色点缀、连续的标签页轮廓、克制的动效与留白，都不追逐短暂潮流，而是寻求一种耐看的秩序。这里的美不是装饰；它让复杂变得从容。

## 核心能力

- **Brizo Scout AI**：基于真实网页来源进行探索，输出带引用的回答与后续问题。
- **一个入口，两种意图**：网址直接打开，自然语言进入智能搜索。
- **独立研究标签页**：每个新标签独立保存问题、附件、结果、来源与追问路径。
- **本地结果记忆**：从历史记录直接恢复已完成的搜索，无需再次调用检索或模型。
- **模型护航**：绑定多个 OpenAI-compatible 服务，选择默认服务、发现可用模型，并在桌面端加密保存 API Key。
- **懂模型的自动选择**：优先快速、稳定、适合文本对话的模型，避开音频、图像、向量及快照型模型。
- **会生长的书签库**：导入真实多级书签树，保留网站图标，以紧凑的级联目录整理网页。
- **专注阅读与导出**：提取可读正文，并在桌面端生成 PDF。
- **原生桌面浏览**：外部网页运行于隔离的 Electron `WebContentsView`，而非 React 渲染器内部。
- **跨平台基础**：提供 macOS、Windows 与 Linux 的图标和打包目标。

## 技术精髓

Brizo 是一款由 Electron 与 React 构建的桌面浏览器：

- **React 19 + Vite** 构成浏览器外壳、起始页与搜索体验。
- **Electron** 负责窗口、标签页、下载、导航状态、原生对话框、PDF 与桌面安全能力。
- **隔离的 `WebContentsView`** 承载外部网站：关闭 Node integration，启用 context isolation 与 sandbox，并默认拒绝远程权限请求。
- **最小化 Preload Bridge** 只向界面开放必要能力，避免渲染层获得不受限制的桌面权限。
- **Vane-compatible 搜索服务** 为 Brizo Scout AI 提供真实网页检索。
- **Mozilla Readability + Cheerio** 支撑正文提取与文档处理。
- **本地加密的模型配置** 让密钥留在桌面端；已保存的明文 Key 永远不会再次返回给界面。

## 本地运行

需要 Node.js 20 或更高版本，以及 npm。

```bash
git clone https://github.com/Frankfromfuture/Brizo.git
cd Brizo
npm install
npm run build
npm run desktop:run
```

界面开发可运行：

```bash
npm run dev
```

在 macOS 上，也可以双击 `Brizo.command` 启动本地版本。`Bean.command` 作为旧快捷方式的兼容入口继续保留。

## 项目状态

Brizo 仍处于快速演进的早期阶段。仓库包含可运行的桌面原型与跨平台打包基础；部分智能搜索能力需要本地可访问的检索服务，以及用户自行配置的 OpenAI-compatible 模型服务。界面与内部 API 仍可能快速变化。

## License

This project is licensed under the terms of the [LICENSE](./LICENSE) file.

---

<div align="center">
  <strong>Brizo, navigate beyond the known.</strong>
</div>
