import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  ipcMain,
  nativeImage,
  powerMonitor,
  safeStorage,
  screen,
  session,
  shell,
  WebContentsView,
} from "electron";
import { createBriefService } from "./brief-service.mjs";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { promisify } from "node:util";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const execFileAsync = promisify(execFile);
const rendererEntry = path.join(projectRoot, "dist", "client", "index.html");
const preloadEntry = path.join(projectRoot, "electron", "preload.cjs");
const browserPagePreloadEntry = path.join(projectRoot, "electron", "browser-page-preload.cjs");
const incognitoEntry = path.join(projectRoot, "electron", "incognito.html");
const incognitoPreloadEntry = path.join(projectRoot, "electron", "incognito-preload.cjs");
const appIconPath = app.isPackaged
  ? path.join(process.resourcesPath, "icon.png")
  : path.join(projectRoot, "build", "icon.png");

function findBundledRendererAsset(stem) {
  const assetsPath = path.join(projectRoot, "dist", "client", "assets");
  const escapedStem = stem.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const assetPattern = new RegExp(`^${escapedStem}-[^.]+\\.png$`, "i");
  const filename = readdirSync(assetsPath).find((name) => assetPattern.test(name));
  if (!filename) throw new Error(`Bundled renderer asset was not found: ${stem}`);
  return path.join(assetsPath, filename);
}

const loadingLogoPath = app.isPackaged
  ? findBundledRendererAsset("logo")
  : path.join(projectRoot, "logo.png");
const browserErrorBackgroundPath = app.isPackaged
  ? findBundledRendererAsset("404")
  : path.join(projectRoot, "404.png");
const shellSmokeTest = process.argv.includes("--smoke-test");
const browserSmokeTest = process.argv.includes("--browser-smoke");
const pdfSmokeTest = process.argv.includes("--pdf-smoke");
const startupBenchmark = process.argv.includes("--startup-benchmark");
const processStartedAt = Date.now();
const headlessTest = shellSmokeTest || browserSmokeTest || pdfSmokeTest || startupBenchmark;
const pdfSmokeUrl = process.env.BEAN_PDF_SMOKE_URL?.trim() || "";
const pdfSmokeExpectedTitle = process.env.BEAN_PDF_EXPECTED_TITLE?.trim() || "";
const pdfSmokeImage = `data:image/svg+xml,${encodeURIComponent(`
  <svg xmlns="http://www.w3.org/2000/svg" width="1200" height="620" viewBox="0 0 1200 620">
    <rect width="1200" height="620" fill="#e8eee8"/>
    <circle cx="430" cy="310" r="190" fill="#789579"/>
    <circle cx="770" cy="310" r="190" fill="#3e6146"/>
    <path d="M510 120 C650 210 550 410 690 500" fill="none" stroke="#fff" stroke-width="28" stroke-linecap="round"/>
  </svg>
`)}`;
const pdfSmokeFixture = `<!doctype html>
  <html lang="en">
    <head>
      <meta charset="utf-8">
      <meta name="author" content="Ada Example">
      <meta name="SiteName" content="Example Public Agency">
      <meta name="ArticleTitle" content="A clean article export">
      <title>Example Public Agency</title>
    </head>
    <body>
      <nav>Products Pricing Sign in</nav>
      <main>
        <article>
          <h1>A clean article export</h1>
          <p class="byline">By Ada Example</p>
          <p>This fixture verifies that the exporter keeps the <strong>important argument</strong>
          and the <em>original emphasis</em> while removing interface chrome. The body is
          intentionally long enough for reliable readability detection and polished PDF layout.</p>
          <h2>Meaningful visual evidence</h2>
          <p>A useful illustration belongs with the article and should remain next to its caption.
          Navigation, advertisements, unrelated recommendations, and form controls should not
          appear in the resulting document.</p>
          <p lang="zh">这段中文正文用于验证导出文档会自动使用宋体，并保持清晰、统一的正文排版。</p>
          <figure>
            <img src="${pdfSmokeImage}" alt="Two overlapping green circles">
            <figcaption>Figure 1. A retained article illustration.</figcaption>
          </figure>
          <p>Final paragraph text confirms that the complete readable body is preserved in a
          searchable text layer rather than flattened into a screenshot.</p>
          <aside>Advertisement: remove this content.</aside>
        </article>
      </main>
    </body>
  </html>`;
const initialUrl = pdfSmokeTest
  ? pdfSmokeUrl || `data:text/html;charset=utf-8,${encodeURIComponent(pdfSmokeFixture)}`
  : browserSmokeTest
    ? "https://example.org/"
    : "https://example.com/";

let mainWindow;
let browserView;
const browserViews = new Map();
const browserTabSleepDelayMs = 10 * 60 * 1000;
let browserBounds = { x: 0, y: 72, width: 800, height: 600 };
let browserVisible = true;
let browserError = "";
let pageBackgroundColor = "#ffffff";
let pageFaviconUrl = "";
let pdfExportInProgress = false;
let incognitoSequence = 0;
let browserInteractionCount = 0;
let browserDisplayUrl = "";
let browserOwnerTabId = "";
let browserNavigationGeneration = 0;
let pageEdgeColorUpdateTimer;
let exampleLoadingPageUrlPromise;
let browserErrorPageActive = false;
let browserSessionHandlersInstalled = false;
let downloadRecords = [];
let suggestionRegionPromise = Promise.resolve("GLOBAL");
const searchSuggestionCache = new Map();
let searchSuggestionCooldownUntil = 0;
const SEARCH_SUGGESTION_CACHE_TTL = 5 * 60 * 1000;
let downloadRecordsPromise;
let downloadsWindow;
let downloadsWindowClosedAt = 0;
let webContextMenuWindow;
let menuTypographyCssCache;
let userLocalePromise = Promise.resolve({ country: "", language: "zh-CN", label: "中文" });
const downloadThumbnailCache = new Map();
const downloadThumbnailCacheLimit = 96;
const incognitoContexts = new Map();
const scrollbarCssKeys = new Map();
const modelGuardPath = () => path.join(app.getPath("userData"), "model-guard.json");
const downloadStorePath = () => path.join(app.getPath("userData"), "downloads.json");
const pageScrollbarCss = `
  * {
    scrollbar-width: thin;
    scrollbar-color: rgba(37, 44, 39, 0.5) transparent;
  }
  *::-webkit-scrollbar {
    width: 10px;
    height: 10px;
    background: transparent;
  }
  *::-webkit-scrollbar-track,
  *::-webkit-scrollbar-corner {
    background: transparent;
  }
  *::-webkit-scrollbar-thumb {
    min-height: 36px;
    border: 3px solid transparent;
    border-radius: 999px;
    background: rgba(37, 44, 39, 0.5);
    background-clip: content-box;
  }
  *.bean-scroll-active {
    scrollbar-color: rgba(91, 119, 96, 0.82) transparent;
  }
  *.bean-scroll-active::-webkit-scrollbar-thumb {
    background: rgba(91, 119, 96, 0.82);
    background-clip: content-box;
  }
`;

// Keep the established profile path while presenting the new Brizo product name.
// Changing Electron's app name otherwise creates a fresh profile and hides existing user data.
app.setPath("userData", path.join(app.getPath("appData"), "bean"));
app.setName("Brizo");
app.commandLine.appendSwitch("enable-smooth-scrolling");
app.commandLine.appendSwitch("enable-gpu-rasterization");
app.commandLine.appendSwitch("enable-zero-copy");

const briefService = createBriefService({
  callEditorialModel: (payload) => searchWithQwenEditorialModel(payload),
  callModel: (payload) => searchWithBoundModel(payload),
  notify: (edition) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("bean-browser:brief-edition-updated", edition);
    }
  },
  search: (query, options) => searchWebQuery(query, options),
  userDataPath: app.getPath("userData"),
});

let articlePdfModulePromise;
let browserToolsModulePromise;
let cheerioModulePromise;

function loadArticlePdfModule() {
  articlePdfModulePromise ??= import("./article-pdf.mjs");
  return articlePdfModulePromise;
}

function loadBrowserToolsModule() {
  browserToolsModulePromise ??= import("./browser-tools.mjs");
  return browserToolsModulePromise;
}

function loadCheerioModule() {
  cheerioModulePromise ??= import("cheerio");
  return cheerioModulePromise;
}

function failTest(message) {
  console.error(`[desktop-test] ${message}`);
  app.exit(1);
}

function normalizeBrowserInput(input) {
  const value = String(input ?? "").trim().slice(0, 2048);
  if (!value) return null;

  const candidate = /^[a-zA-Z][a-zA-Z\d+.-]*:/.test(value)
    ? value
    : value.includes(" ") || !value.includes(".")
      ? `https://duckduckgo.com/?q=${encodeURIComponent(value)}`
      : `https://${value}`;

  try {
    const url = new URL(candidate);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}

function normalizeImageSourceUrl(input) {
  const value = String(input ?? "").trim();
  if (!value || value.length > 20_000_000) return null;

  try {
    const url = new URL(value);
    if (["http:", "https:"].includes(url.protocol)) return url.href;
    if (url.protocol === "data:" && /^data:image\//i.test(value)) return value;
    if (url.protocol === "blob:" && /^blob:https?:\/\//i.test(value)) return value;
  } catch {
    // Ignore malformed or unsupported image sources.
  }
  return null;
}

const imageContextMenuItems = [
  { action: "open", label: "新标签页中打开图片" },
  { action: "download", label: "下载该图片" },
  { action: "copy-image", label: "复制该图片", separatorBefore: true },
  { action: "copy-address", label: "复制图片地址" },
];
const linkContextMenuItems = [
  { action: "open-link", label: "在新标签页打开链接" },
  { action: "copy-link", label: "复制链接地址" },
];
const selectionContextMenuItems = [
  { action: "copy-text", label: "复制文字" },
  { action: "ask-brizo", label: "向 Brizo 询问" },
  { action: "translate", label: "翻译" },
];

function menuTypographyCss() {
  if (menuTypographyCssCache !== undefined) return menuTypographyCssCache;
  const directFontPath = path.join(
    projectRoot,
    "node_modules",
    "@fontsource",
    "eb-garamond",
    "files",
    "eb-garamond-latin-400-normal.woff2",
  );
  let fontPath = existsSync(directFontPath) ? directFontPath : "";
  if (!fontPath) {
    try {
      const assetsPath = path.join(projectRoot, "dist", "client", "assets");
      const bundledName = readdirSync(assetsPath).find((name) =>
        /^eb-garamond-latin-400-normal-.*\.woff2$/i.test(name),
      );
      if (bundledName) fontPath = path.join(assetsPath, bundledName);
    } catch {
      // Local EB Garamond remains available as a final fallback.
    }
  }
  let source = 'local("EB Garamond")';
  if (fontPath) {
    source = `url(data:font/woff2;base64,${readFileSync(fontPath).toString("base64")}) format("woff2")`;
  }
  menuTypographyCssCache = `
    @font-face {
      font-family: "Brizo Menu Latin";
      src: ${source};
      font-style: normal;
      font-weight: 400 700;
      size-adjust: 112%;
      unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD;
    }
  `;
  return menuTypographyCssCache;
}

function createWebContextMenuPageUrl(items, ariaLabel) {
  const links = items.map(({ action, label, separatorBefore }) => `
    ${separatorBefore ? '<span class="separator" aria-hidden="true"></span>' : ""}
    <a href="brizo-context-menu://${action}" role="menuitem">${label}</a>
  `).join("");
  const html = `<!doctype html>
    <html lang="zh-CN">
      <head>
        <meta charset="utf-8">
        <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">
        <style>
          ${menuTypographyCss()}
          * { box-sizing: border-box; }
          html, body { width: 100%; height: 100%; margin: 0; overflow: hidden; background: transparent; }
          body {
            color: #283029;
            font-family: "Brizo Menu Latin", "Source Han Serif SC VF", "Source Han Serif SC", "思源宋体 VF", "思源宋体", serif;
            -webkit-font-smoothing: antialiased;
          }
          main {
            height: 100%;
            padding: 5px;
            border: 0;
            border-radius: 10px;
            background: #fdfefc;
            transform-origin: top left;
            animation: image-menu-reveal 180ms cubic-bezier(.2, .82, .24, 1) both;
          }
          a { height: 30px; padding: 0 10px; display: flex; align-items: center; border-radius: 6px; color: inherit; font-size: 13px; font-weight: 400; text-decoration: none; }
          a:hover, a:focus-visible { outline: none; background: #eef1ed; }
          .separator { height: 1px; margin: 4px 5px; display: block; background: #e4e7e3; }
          @keyframes image-menu-reveal {
            from {
              clip-path: inset(0 100% 100% 0 round 10px);
              transform: scale(.82);
            }
            to {
              clip-path: inset(0 0 0 0 round 10px);
              transform: scale(1);
            }
          }
          @media (prefers-reduced-motion: reduce) {
            main { animation: none; }
          }
        </style>
      </head>
      <body><main role="menu" aria-label="${escapeHtml(ariaLabel)}">${links}</main></body>
    </html>`;
  return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
}

function showWebContextMenu({ actions, ariaLabel, items, params, window }) {
  webContextMenuWindow?.close();
  const width = 222;
  const separatorCount = items.filter((item) => item.separatorBefore).length;
  const height = items.length * 30 + separatorCount * 9 + 16;
  const parentBounds = window.getContentBounds();
  const point = {
    x: parentBounds.x + browserBounds.x + params.x,
    y: parentBounds.y + browserBounds.y + params.y,
  };
  const workArea = screen.getDisplayNearestPoint(point).workArea;
  const popup = new BrowserWindow({
    parent: window,
    width,
    height,
    x: Math.min(Math.max(point.x, workArea.x + 8), workArea.x + workArea.width - width - 8),
    y: Math.min(Math.max(point.y, workArea.y + 8), workArea.y + workArea.height - height - 8),
    frame: false,
    hasShadow: false,
    opacity: 0.95,
    resizable: false,
    roundedCorners: true,
    show: false,
    skipTaskbar: true,
    transparent: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  webContextMenuWindow = popup;
  popup.setAlwaysOnTop(true, "pop-up-menu");
  popup.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  popup.webContents.on("will-navigate", (event, url) => {
    event.preventDefault();
    let action = "";
    try { action = new URL(url).hostname; } catch { action = ""; }
    popup.close();
    actions[action]?.();
  });
  popup.webContents.on("before-input-event", (_event, input) => {
    if (input.type === "keyDown" && input.key === "Escape") popup.close();
  });
  popup.on("blur", () => popup.close());
  popup.on("closed", () => {
    if (webContextMenuWindow === popup) webContextMenuWindow = undefined;
  });
  popup.loadURL(createWebContextMenuPageUrl(items, ariaLabel))
    .then(() => popup.show())
    .catch(() => popup.close());
}

function safeScriptValue(value) {
  return JSON.stringify(String(value ?? ""))
    .replaceAll("<", "\\u003c")
    .replaceAll("\u2028", "\\u2028")
    .replaceAll("\u2029", "\\u2029");
}

async function showTranslationBelowSelection(
  webContents,
  originalText,
  translation,
  languageLabel,
  isError = false,
) {
  if (webContents.isDestroyed()) return;
  await webContents.executeJavaScript(`
    (() => {
      const selection = window.getSelection();
      const range = selection && selection.rangeCount ? selection.getRangeAt(0) : null;
      const rect = range?.getBoundingClientRect();
      document.getElementById("__brizo_selection_translation")?.remove();
      const host = document.createElement("div");
      host.id = "__brizo_selection_translation";
      host.style.cssText = [
        "position:absolute",
        "z-index:2147483647",
        "left:" + Math.max(8, window.scrollX + (rect?.left || 8)) + "px",
        "top:" + Math.max(8, window.scrollY + (rect?.bottom || 8) + 7) + "px",
        "max-width:min(520px,calc(100vw - 24px))"
      ].join(";");
      const root = host.attachShadow({ mode: "closed" });
      const style = document.createElement("style");
      style.textContent = ${safeScriptValue(`${menuTypographyCss()}
        .translation-card {
          font-family: "Brizo Menu Latin", "Source Han Serif SC VF", "Source Han Serif SC", "思源宋体 VF", "思源宋体", serif;
        }
        .translation-original {
          color: #6f776f;
          font-style: italic;
        }
        .translation-result {
          margin-top: 8px;
        }
      `)};
      const card = document.createElement("div");
      card.className = "translation-card";
      card.style.cssText = [
        "padding:9px 12px",
        "border-radius:9px",
        "background:rgba(253,254,252,.95)",
        "box-shadow:0 8px 24px rgba(31,37,32,.16)",
        "color:${isError ? "#8b4d45" : "#283029"}",
        "font-size:14px",
        "line-height:1.55",
        "white-space:pre-wrap"
      ].join(";");
      const original = document.createElement("div");
      original.className = "translation-original";
      original.textContent = ${safeScriptValue(`“${originalText}”`)};
      const result = document.createElement("div");
      result.className = "translation-result";
      result.textContent = ${safeScriptValue(translation)};
      card.append(original, result);
      card.title = ${safeScriptValue(languageLabel)};
      root.append(style, card);
      (document.body || document.documentElement).append(host);
    })()
  `);
}

async function translateSelectedText(webContents, selectedText) {
  const locale = await userLocalePromise;
  const result = await searchWithBoundModel({
    query: selectedText,
    systemPrompt: `将用户提供的文字准确翻译为${locale.label}（语言代码 ${locale.language}）。只输出译文，不要解释、加引号或添加标题；保留原文的段落结构。`,
  });
  if (result?.status === "success" && result.message) {
    await showTranslationBelowSelection(
      webContents,
      selectedText,
      result.message,
      `${locale.label}译文`,
    );
    return;
  }
  const message = result?.message || "请先在“大模型护航”中绑定可用模型后再翻译。";
  await showTranslationBelowSelection(
    webContents,
    selectedText,
    message,
    "翻译暂不可用",
    true,
  );
}

function installWebContextMenus(webContents, window, onOpenInNewTab, onAskBrizo) {
  webContents.on("context-menu", (event, params) => {
    const imageUrl = params.mediaType === "image"
      ? normalizeImageSourceUrl(params.srcURL)
      : null;
    const linkUrl = normalizeBrowserInput(params.linkURL);
    const selectedText = String(params.selectionText || "").trim().slice(0, 12_000);
    let items;
    let ariaLabel;
    let actions;

    if (imageUrl) {
      items = imageContextMenuItems;
      ariaLabel = "图片操作";
      actions = {
        open: () => onOpenInNewTab(imageUrl),
        download: () => webContents.downloadURL(imageUrl),
        "copy-image": () => webContents.copyImageAt(params.x, params.y),
        "copy-address": () => clipboard.writeText(imageUrl),
      };
    } else if (linkUrl) {
      items = linkContextMenuItems;
      ariaLabel = "链接操作";
      actions = {
        "open-link": () => onOpenInNewTab(linkUrl),
        "copy-link": () => clipboard.writeText(linkUrl),
      };
    } else if (selectedText) {
      items = selectionContextMenuItems;
      ariaLabel = "文字操作";
      actions = {
        "copy-text": () => clipboard.writeText(selectedText),
        "ask-brizo": () => onAskBrizo(selectedText),
        translate: () => { void translateSelectedText(webContents, selectedText); },
      };
    } else {
      return;
    }

    event.preventDefault();
    showWebContextMenu({ actions, ariaLabel, items, params, window });
  });
}

async function loadDownloadRecords() {
  if (!downloadRecordsPromise) {
    downloadRecordsPromise = readFile(downloadStorePath(), "utf8")
      .then((content) => {
        const stored = JSON.parse(content);
        downloadRecords = Array.isArray(stored)
          ? stored.filter((record) => (
            record
            && typeof record.id === "string"
            && typeof record.filename === "string"
            && typeof record.sourceUrl === "string"
            && typeof record.savePath === "string"
            && typeof record.createdAt === "string"
          )).slice(0, 500)
          : [];
      })
      .catch(() => {
        downloadRecords = [];
      });
  }
  await downloadRecordsPromise;
}

function saveDownloadRecords() {
  return writeFile(downloadStorePath(), JSON.stringify(downloadRecords, null, 2), "utf8")
    .catch((error) => {
      console.error("[downloads]", error instanceof Error ? error.message : String(error));
    });
}

async function getDownloadRecords() {
  await loadDownloadRecords();
  return Promise.all(downloadRecords
    .slice()
    .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))
    .map(async (record) => {
      let isMissing = false;
      let thumbnailDataUrl = "";
      if (record.state === "completed") {
        try {
          await stat(record.savePath);
        } catch {
          isMissing = true;
        }
      }
      const isImage = /\.(?:avif|bmp|gif|heic|heif|jpe?g|png|tiff?|webp)$/i.test(record.filename);
      if (record.state === "completed" && !isMissing && isImage) {
        thumbnailDataUrl = downloadThumbnailCache.get(record.savePath) || "";
        if (thumbnailDataUrl) {
          downloadThumbnailCache.delete(record.savePath);
          downloadThumbnailCache.set(record.savePath, thumbnailDataUrl);
        }
        if (!thumbnailDataUrl) {
          try {
            const thumbnail = await nativeImage.createThumbnailFromPath(
              record.savePath,
              { width: 44, height: 44 },
            );
            if (!thumbnail.isEmpty()) {
              thumbnailDataUrl = thumbnail.toDataURL();
              downloadThumbnailCache.set(record.savePath, thumbnailDataUrl);
              while (downloadThumbnailCache.size > downloadThumbnailCacheLimit) {
                downloadThumbnailCache.delete(downloadThumbnailCache.keys().next().value);
              }
            }
          } catch {
            // Keep the normal file glyph if an image thumbnail cannot be generated.
          }
        }
      }
      if (isMissing) downloadThumbnailCache.delete(record.savePath);
      return { ...record, isMissing, thumbnailDataUrl };
    }));
}

function publishDownloads() {
  if (!downloadsWindow || downloadsWindow.isDestroyed()) return;
  getDownloadRecords()
    .then((records) => {
      if (downloadsWindow && !downloadsWindow.isDestroyed()) {
        downloadsWindow.loadURL(createDownloadsPageUrl(records)).catch(() => {});
      }
    })
    .catch(() => {});
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function groupDownloadRecords(records) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const week = new Date(today);
  week.setDate(week.getDate() - ((week.getDay() + 6) % 7));
  const month = new Date(now.getFullYear(), now.getMonth(), 1);
  const groups = [
    ["今日", []],
    ["昨日", []],
    ["本周", []],
    ["本月", []],
    ["历史", []],
  ];
  records.forEach((record) => {
    const createdAt = new Date(record.createdAt);
    const index = createdAt >= today
      ? 0
      : createdAt >= yesterday
        ? 1
        : createdAt >= week
          ? 2
          : createdAt >= month
            ? 3
            : 4;
    groups[index][1].push(record);
  });
  return groups.filter(([, items]) => items.length);
}

function createDownloadsPageUrl(records) {
  const fileIcon = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3.5h6.3L18 8.2v12.3H7z"/><path d="M13 3.5v5h5"/></svg>`;
  const folderIcon = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 6.5h6l2 2h9v10h-17z"/></svg>`;
  const groups = groupDownloadRecords(records);
  const content = groups.length
    ? groups.map(([label, items]) => `
      <section class="group">
        <h2>${label}</h2>
        ${items.map((record) => `
          <article class="row${record.isMissing ? " missing" : ""}">
            <a class="row-main" href="brizo-download://open?id=${encodeURIComponent(record.id)}" aria-label="打开 ${escapeHtml(record.filename)}">
              <span class="icon" aria-hidden="true">${record.thumbnailDataUrl
                ? `<img src="${record.thumbnailDataUrl}" alt="">`
                : fileIcon}</span>
              <span class="copy">
                <strong>${escapeHtml(record.filename)}</strong>
                <em title="${escapeHtml(record.savePath)}">${escapeHtml(record.savePath)}</em>
              </span>
            </a>
            <a class="folder-button" href="brizo-download://folder?id=${encodeURIComponent(record.id)}" aria-label="在文件夹中显示 ${escapeHtml(record.filename)}">${folderIcon}</a>
          </article>`).join("")}
      </section>`).join("")
    : '<p class="empty">暂无下载文件</p>';
  const html = `<!doctype html>
    <html lang="zh-CN">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'">
        <title>下载</title>
        <style>
          ${menuTypographyCss()}
          * { box-sizing: border-box; }
          html, body { width: 100%; height: 100%; margin: 0; overflow: hidden; background: #fdfefc; }
          body { color: #1d211e; font-family: "Brizo Menu Latin", "Source Han Serif SC VF", "Source Han Serif SC", "思源宋体 VF", "思源宋体", serif; -webkit-font-smoothing: antialiased; }
          header { height: 46px; padding: 0 13px 0 15px; display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid #e8ebe7; }
          header strong { font-size: 14px; font-weight: 600; }
          header small { color: #858d86; font-size: 10px; }
          main { height: calc(100% - 46px); padding: 7px; overflow-y: auto; }
          .group + .group { margin-top: 10px; }
          h2 { margin: 0; padding: 5px 7px; color: #7e867f; font-size: 10px; font-weight: 600; letter-spacing: .06em; }
          .row { min-height: 62px; padding: 5px; display: grid; grid-template-columns: minmax(0, 1fr) 30px; gap: 4px; align-items: center; border-radius: 8px; }
          .row:hover { background: #f0f2ef; }
          .row-main { min-width: 0; min-height: 52px; display: grid; grid-template-columns: 44px minmax(0, 1fr); gap: 10px; align-items: center; border-radius: 7px; color: inherit; text-decoration: none; }
          .row-main:focus-visible, .folder-button:focus-visible { outline: 2px solid rgba(165,140,94,.55); outline-offset: -2px; }
          .icon { width: 40px; height: 40px; display: grid; place-items: center; overflow: hidden; border-radius: 8px; background: #e8ece7; color: #617062; }
          .icon img { width: 100%; height: 100%; display: block; object-fit: cover; }
          .icon svg { width: 22px; height: 22px; fill: none; stroke: currentColor; stroke-width: 1.6; stroke-linecap: round; stroke-linejoin: round; }
          .copy { min-width: 0; }
          .copy strong, .copy em { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
          .copy strong { color: #343a35; font-size: 12px; font-weight: 600; }
          .copy em { margin-top: 5px; color: #858d86; font-size: 10px; font-style: normal; }
          .folder-button { width: 28px; height: 28px; display: grid; place-items: center; border-radius: 7px; color: #737c74; text-decoration: none; }
          .folder-button:hover { background: #e3e7e2; color: #4f5d51; }
          .folder-button svg { width: 17px; height: 17px; fill: none; stroke: currentColor; stroke-width: 1.6; stroke-linecap: round; stroke-linejoin: round; }
          .missing .copy { color: #929992; text-decoration: line-through; }
          .missing .copy strong, .missing .copy em { color: inherit; }
          .missing .row-main, .missing .folder-button { pointer-events: none; }
          .empty { margin: 0; padding: 30px 12px; color: #899089; font-size: 11px; text-align: center; }
          ::-webkit-scrollbar { width: 10px; background: transparent; }
          ::-webkit-scrollbar-thumb { border: 3px solid transparent; border-radius: 999px; background: rgba(37, 44, 39, .5); background-clip: content-box; }
        </style>
      </head>
      <body>
        <header><strong>下载</strong><small>${records.length ? `${records.length} 个文件` : "暂无下载"}</small></header>
        <main>${content}</main>
      </body>
    </html>`;
  return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
}

async function showDownloadsWindow(anchorBounds, { toggle = false } = {}) {
  if (downloadsWindow && !downloadsWindow.isDestroyed()) {
    if (toggle) {
      downloadsWindow.close();
      return { open: false };
    }
    const records = await getDownloadRecords();
    await downloadsWindow.loadURL(createDownloadsPageUrl(records));
    downloadsWindow.show();
    downloadsWindow.focus();
    return { open: true };
  }
  if (toggle && Date.now() - downloadsWindowClosedAt < 220) return { open: false };
  const records = await getDownloadRecords();
  const width = 424;
  const estimatedHeight = 60 + records.length * 67 + groupDownloadRecords(records).length * 30;
  const height = Math.max(150, Math.min(560, estimatedHeight));
  const mainBounds = mainWindow.getBounds();
  const anchor = {
    bottom: Number(anchorBounds?.bottom) || 106,
    left: Number(anchorBounds?.left) || mainBounds.width - 94,
    right: Number(anchorBounds?.right) || mainBounds.width - 60,
  };
  const centeredX = Math.round(
    mainBounds.x + ((anchor.left + anchor.right) / 2) - (width / 2),
  );
  const windowRightAlignedX = mainBounds.x + mainBounds.width - width - 8;
  const fitsCenteredInWindow = centeredX >= mainBounds.x + 8
    && centeredX + width <= mainBounds.x + mainBounds.width - 8;
  const intendedBounds = {
    x: fitsCenteredInWindow ? centeredX : windowRightAlignedX,
    y: Math.round(mainBounds.y + anchor.bottom + 5),
    width,
    height,
  };
  const display = screen.getDisplayMatching(intendedBounds);
  const x = Math.min(
    Math.max(intendedBounds.x, display.workArea.x + 8),
    display.workArea.x + display.workArea.width - width - 8,
  );
  const y = Math.min(
    Math.max(intendedBounds.y, display.workArea.y + 8),
    display.workArea.y + display.workArea.height - height - 8,
  );
  downloadsWindow = new BrowserWindow({
    backgroundColor: "#fdfefc",
    frame: false,
    height,
    parent: mainWindow,
    resizable: false,
    roundedCorners: true,
    show: false,
    skipTaskbar: true,
    transparent: false,
    width,
    x,
    y,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  downloadsWindow.setAlwaysOnTop(true, "pop-up-menu");
  downloadsWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  downloadsWindow.webContents.on("will-navigate", (event, url) => {
    event.preventDefault();
    let action = "";
    let id = "";
    try {
      const parsed = new URL(url);
      action = parsed.hostname;
      id = parsed.searchParams.get("id") || "";
    } catch {
      return;
    }
    const record = downloadRecords.find((item) => item.id === id);
    if (!record || record.state !== "completed" || !existsSync(record.savePath)) return;
    downloadsWindow?.close();
    if (action === "folder") shell.showItemInFolder(record.savePath);
    if (action === "open") {
      void shell.openPath(record.savePath).then((error) => {
        if (error) console.error("[downloads]", error);
      });
    }
  });
  downloadsWindow.on("blur", () => downloadsWindow?.close());
  downloadsWindow.on("closed", () => {
    downloadsWindow = undefined;
    downloadsWindowClosedAt = Date.now();
  });
  await downloadsWindow.loadURL(createDownloadsPageUrl(records));
  downloadsWindow.show();
  return { open: true };
}

function toggleDownloadsWindow(anchorBounds) {
  return showDownloadsWindow(anchorBounds, { toggle: true });
}

async function autoShowDownloadsWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  let anchorBounds;
  try {
    anchorBounds = await mainWindow.webContents.executeJavaScript(`
      (() => {
        const button = document.querySelector('[aria-label="Downloads"]');
        if (!button) return null;
        const bounds = button.getBoundingClientRect();
        return { bottom: bounds.bottom, left: bounds.left, right: bounds.right };
      })()
    `);
  } catch {
    anchorBounds = undefined;
  }
  await showDownloadsWindow(anchorBounds);
}

function getAvailableDownloadPath(filename) {
  const directory = app.getPath("downloads");
  const safeFilename = path.basename(filename || "download");
  const extension = path.extname(safeFilename);
  const stem = path.basename(safeFilename, extension) || "download";
  let candidate = path.join(directory, safeFilename);
  let index = 1;
  while (existsSync(candidate)) {
    candidate = path.join(directory, `${stem} (${index})${extension}`);
    index += 1;
  }
  return candidate;
}

function trackDownload(item) {
  const savePath = getAvailableDownloadPath(item.getFilename());
  item.setSavePath(savePath);
  const record = {
    createdAt: new Date().toISOString(),
    filename: path.basename(savePath),
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    savePath,
    sourceUrl: item.getURL(),
    state: "downloading",
  };
  const recordReady = loadDownloadRecords().then(() => {
    downloadRecords = [record, ...downloadRecords.filter((entry) => entry.id !== record.id)].slice(0, 500);
  });
  const update = async (state) => {
    await recordReady;
    record.state = state;
    await saveDownloadRecords();
    publishDownloads();
    if (state === "completed") await autoShowDownloadsWindow();
  };

  item.on("updated", (_event, state) => {
    if (state === "interrupted") void update("interrupted");
  });
  item.once("done", (_event, state) => { void update(state); });

  void recordReady.then(() => {
    void saveDownloadRecords();
    publishDownloads();
  });
}

function isExampleLoadingUrl(url) {
  try {
    const parsed = new URL(url);
    return ["http:", "https:"].includes(parsed.protocol)
      && ["example.com", "www.example.com"].includes(parsed.hostname);
  } catch {
    return false;
  }
}

function getExampleLoadingPageUrl() {
  if (!exampleLoadingPageUrlPromise) {
    exampleLoadingPageUrlPromise = readFile(loadingLogoPath).then((logo) => {
      const logoDataUrl = `data:image/png;base64,${logo.toString("base64")}`;
      const html = `<!doctype html>
        <html lang="zh-CN">
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'">
            <title>example.com</title>
            <style>
              html, body { width: 100%; height: 100%; margin: 0; background: #fff; }
              body { display: grid; place-items: center; overflow: hidden; }
              img { width: 116px; height: 116px; object-fit: contain; }
            </style>
          </head>
          <body><img src="${logoDataUrl}" alt=""></body>
        </html>`;
      return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
    });
  }
  return exampleLoadingPageUrlPromise;
}

function describeBrowserFailure({ statusCode = 0, errorCode = 0, errorDescription = "" } = {}) {
  const httpFailures = {
    401: ["401", "需要授权", "请登录或取得授权后再访问。", "Sign in or request access to view this page."],
    403: ["403", "禁止访问", "此网页不允许当前访问。", "This page does not allow the current access."],
    404: ["404", "页面不存在", "找不到你要访问的网页。", "The requested page could not be found."],
    408: ["408", "请求超时", "网页响应时间过长，请稍后重试。", "The page took too long to respond."],
    429: ["429", "请求过多", "访问过于频繁，请稍后重试。", "Too many requests. Please try again later."],
    451: ["451", "访问受限", "此网页因地区或法律原因不可用。", "This page is unavailable for legal or regional reasons."],
    500: ["500", "网站出错", "网站暂时无法处理请求。", "The website could not process the request."],
    502: ["502", "网关错误", "网站服务暂时无法连接。", "The website service is temporarily unreachable."],
    503: ["503", "服务不可用", "网站暂时无法提供服务。", "The website is temporarily unavailable."],
    504: ["504", "网关超时", "网站响应时间过长，请稍后重试。", "The website took too long to respond."],
  };
  if (httpFailures[statusCode]) return httpFailures[statusCode];
  if (statusCode >= 500) return [String(statusCode), "网站出错", "网站暂时无法处理请求。", "The website could not process the request."];
  if (statusCode >= 400) return [String(statusCode), "无法读取", "此网页当前无法读取。", "This page cannot be read right now."];
  const networkError = String(errorDescription).toUpperCase();
  if ([-7, -118].includes(errorCode) || networkError.includes("TIMED_OUT")) return ["TIMEOUT", "连接超时", "网页响应时间过长，请稍后重试。", "The page took too long to respond."];
  if ([-105, -137].includes(errorCode) || networkError.includes("NAME_NOT_RESOLVED")) return ["DNS", "找不到网站", "无法解析这个网站的地址。", "The website address could not be resolved."];
  if (errorCode === -106 || networkError.includes("INTERNET_DISCONNECTED")) return ["OFFLINE", "网络不可用", "请检查网络连接后重试。", "Check your internet connection and try again."];
  if ([-102, -111].includes(errorCode) || networkError.includes("CONNECTION_")) return ["CONNECTION", "无法连接", "网站拒绝或未能建立连接。", "The website refused or could not establish a connection."];
  if ([-10, -20, -138].includes(errorCode)) return ["BLOCKED", "访问被阻止", "此网页不允许当前访问。", "Access to this page was blocked."];
  return ["ERROR", "无法读取", "此网页当前无法读取。", "This page cannot be read right now."];
}

async function writeBrowserErrorPage(failure) {
  const [code, reason, chinese, english] = failure;
  const [logo, background] = await Promise.all([
    readFile(loadingLogoPath),
    readFile(browserErrorBackgroundPath),
  ]);
  const logoUrl = `data:image/png;base64,${logo.toString("base64")}`;
  const backgroundUrl = `data:image/png;base64,${background.toString("base64")}`;
  const html = `<!doctype html>
    <html lang="zh-CN">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'">
        <title>${escapeHtml(code)} · Brizo</title>
        <style>
          * { box-sizing: border-box; }
          html, body { width: 100%; height: 100%; margin: 0; background: #fff; }
          body { overflow: hidden; color: #252a26; font-family: "Source Han Serif SC", "思源宋体", serif; -webkit-font-smoothing: antialiased; }
          body::before { content: ""; position: fixed; inset: 0; background: url("${backgroundUrl}") center / cover no-repeat; opacity: .2; pointer-events: none; }
          main { position: absolute; z-index: 1; top: 50%; left: 50%; width: min(560px, calc(100% - 48px)); transform: translate(-50%, calc(-50% - 7.5vh)); text-align: center; }
          img { width: 116px; height: 116px; object-fit: contain; }
          h1 { margin: 25px 0 10px; font-size: 25px; font-weight: 500; letter-spacing: .02em; }
          p { margin: 0; color: #4d554f; font-size: 14px; line-height: 1.6; }
          p[lang="en"] { margin-top: 2px; color: #737b75; font-size: 13px; }
        </style>
      </head>
      <body>
        <main>
          <img src="${logoUrl}" alt="Brizo">
          <h1>${escapeHtml(code)} · ${escapeHtml(reason)}</h1>
          <p>${escapeHtml(chinese)}</p>
          <p lang="en">${escapeHtml(english)}</p>
        </main>
      </body>
    </html>`;
  const pagePath = path.join(app.getPath("userData"), "browser-error.html");
  await writeFile(pagePath, html, "utf8");
  return pagePath;
}

function isInternalBrowserErrorUrl(value) {
  if (typeof value !== "string" || !value.startsWith("file:")) return false;
  try {
    return fileURLToPath(value) === path.join(app.getPath("userData"), "browser-error.html");
  } catch {
    return false;
  }
}

function clearBrowserNavigationTimeout(view = browserView) {
  if (view?.__brizoNavigationTimeout) clearTimeout(view.__brizoNavigationTimeout);
  if (view) view.__brizoNavigationTimeout = undefined;
}

async function showBrowserErrorPage(details = {}) {
  if (!browserView || browserView.webContents.isDestroyed() || browserErrorPageActive) return;
  const errorView = browserView;
  browserErrorPageActive = true;
  errorView.__brizoErrorPageActive = true;
  clearBrowserNavigationTimeout(errorView);
  const detailUrl = isInternalBrowserErrorUrl(details.url) ? "" : details.url;
  const originalUrl = detailUrl
    || errorView.__brizoRequestedUrl
    || (isInternalBrowserErrorUrl(browserDisplayUrl) ? "" : browserDisplayUrl);
  const failure = describeBrowserFailure(details);
  browserError = `${failure[0]} · ${failure[1]}`;
  errorView.__brizoError = browserError;
  pageBackgroundColor = "#ffffff";
  pageFaviconUrl = "";
  publishBrowserState();
  try {
    const pagePath = await writeBrowserErrorPage(failure);
    if (!errorView.__brizoErrorPageActive || errorView.webContents.isDestroyed()) return;
    await errorView.webContents.loadFile(pagePath);
    errorView.__brizoDisplayUrl = originalUrl;
    errorView.__brizoError = `${failure[0]} · ${failure[1]}`;
    errorView.__brizoBackgroundColor = "#ffffff";
    errorView.__brizoFaviconUrl = "";
    if (browserView !== errorView) return;
    browserDisplayUrl = originalUrl;
    browserError = `${failure[0]} · ${failure[1]}`;
    pageBackgroundColor = "#ffffff";
    pageFaviconUrl = "";
    publishBrowserState();
  } catch (error) {
    errorView.__brizoErrorPageActive = false;
    if (browserView === errorView) browserErrorPageActive = false;
    browserError = error instanceof Error ? error.message : String(error);
    publishBrowserState();
  }
}

async function loadBrowserUrl(webContents, url) {
  const destination = isExampleLoadingUrl(url)
    ? await getExampleLoadingPageUrl()
    : url;
  return webContents.loadURL(destination);
}

async function installPageScrollbarBehavior(webContents) {
  if (!webContents || webContents.isDestroyed()) return;
  const previousKey = scrollbarCssKeys.get(webContents.id);
  if (previousKey) {
    try {
      await webContents.removeInsertedCSS(previousKey);
    } catch {
      // Navigation may already have discarded the previous document stylesheet.
    }
  }
  const cssKey = await webContents.insertCSS(pageScrollbarCss);
  scrollbarCssKeys.set(webContents.id, cssKey);
  await webContents.executeJavaScript(`
    (() => {
      if (window.__beanScrollbarBehaviorInstalled) return;
      window.__beanScrollbarBehaviorInstalled = true;
      const timers = new WeakMap();
      const markScrolling = (event) => {
        const target = event.target === document
          ? document.scrollingElement || document.documentElement
          : event.target;
        if (!(target instanceof Element)) return;
        target.classList.add("bean-scroll-active");
        window.clearTimeout(timers.get(target));
        timers.set(target, window.setTimeout(() => {
          target.classList.remove("bean-scroll-active");
        }, 520));
      };
      document.addEventListener("scroll", markScrolling, { capture: true, passive: true });
      document.documentElement.dataset.beanScrollbars = "ready";
    })()
  `);
}

function getBrowserState() {
  if (!browserView || browserView.webContents.isDestroyed()) {
    return {
      canGoBack: false,
      canGoForward: false,
      error: browserError,
      isLoading: false,
      pageBackgroundColor,
      pageFaviconUrl,
      title: "",
      url: "",
      documentUrl: "",
      ownerTabId: browserOwnerTabId,
    };
  }

  const { webContents } = browserView;
  const { navigationHistory } = webContents;
  const displayUrl = isInternalBrowserErrorUrl(browserDisplayUrl)
    ? browserView.__brizoRequestedUrl || ""
    : browserDisplayUrl;
  const documentUrl = browserErrorPageActive
    ? displayUrl
    : webContents.getURL();
  return {
    canGoBack: navigationHistory.canGoBack(),
    canGoForward: navigationHistory.canGoForward(),
    error: browserError,
    isLoading: webContents.isLoading(),
    pageBackgroundColor,
    pageFaviconUrl,
    title: webContents.getTitle(),
    url: displayUrl || (isInternalBrowserErrorUrl(webContents.getURL()) ? "" : webContents.getURL()),
    documentUrl,
    ownerTabId: browserOwnerTabId,
  };
}

function publishBrowserState() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send("bean-browser:state", getBrowserState());
}

function publishBrowserActivation() {
  browserInteractionCount += 1;
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send("bean-browser:activated");
}

async function updatePageBackgroundColor() {
  if (!browserView || browserView.webContents.isDestroyed()) return;

  const sampledView = browserView;
  const sampledWebContents = sampledView.webContents;
  const sampledGeneration = browserNavigationGeneration;
  const sampledOwnerTabId = browserOwnerTabId;
  const sampledDocumentUrl = sampledWebContents.getURL();
  const sampleIsCurrent = () =>
    browserView === sampledView &&
    !sampledWebContents.isDestroyed() &&
    browserNavigationGeneration === sampledGeneration &&
    browserOwnerTabId === sampledOwnerTabId &&
    sampledWebContents.getURL() === sampledDocumentUrl;

  try {
    const color = await sampledWebContents.executeJavaScript(`
      (() => {
        const isVisibleColor = (value) => {
          if (!value) return false;
          const normalized = value.replace(/\\s+/g, "").toLowerCase();
          if (normalized === "transparent" || normalized === "rgba(0,0,0,0)" || normalized === "rgb(0,0,0,0)") return false;
          const alpha = normalized.match(/^rgba\\([^,]+,[^,]+,[^,]+,([^)]+)\\)$/)?.[1];
          return alpha == null || Number(alpha) > 0.08;
        };
        const colorTouchingTopEdge = (x) => {
          let element = document.elementFromPoint(x, 1);
          while (element) {
            const rect = element.getBoundingClientRect();
            const color = getComputedStyle(element).backgroundColor;
            if (rect.top <= 1.5 && rect.bottom > 1 && isVisibleColor(color)) return color;
            element = element.parentElement;
          }
          return "";
        };
        const width = Math.max(document.documentElement.clientWidth, 1);
        const edgeColors = [0.08, 0.25, 0.5, 0.75, 0.92]
          .map((ratio) => colorTouchingTopEdge(Math.min(width - 1, Math.max(0, width * ratio))))
          .filter(Boolean);
        if (edgeColors.length) {
          const counts = new Map();
          edgeColors.forEach((value) => counts.set(value, (counts.get(value) || 0) + 1));
          return [...counts].sort((a, b) => b[1] - a[1])[0][0];
        }

        const colors = [
          document.body && getComputedStyle(document.body).backgroundColor,
          document.documentElement && getComputedStyle(document.documentElement).backgroundColor,
          document.querySelector('meta[name="theme-color"]')?.content
        ];
        return colors.find(isVisibleColor) || "#ffffff";
      })()
    `);

    if (sampleIsCurrent() && typeof color === "string" && color.length <= 64) {
      pageBackgroundColor = color;
      sampledView.__brizoBackgroundColor = color;
      publishBrowserState();
    }
  } catch {
    if (!sampleIsCurrent()) return;
    pageBackgroundColor = "#ffffff";
    sampledView.__brizoBackgroundColor = "#ffffff";
    publishBrowserState();
  }
}

function setBrowserViewVisible(visible) {
  browserVisible = Boolean(visible);
  for (const view of browserViews.values()) {
    if (view.webContents.isDestroyed()) continue;
    const isActive = view === browserView && browserVisible;
    view.webContents.setBackgroundThrottling(!isActive);
    view.setBounds(isActive ? browserBounds : { x: 0, y: 0, width: 0, height: 0 });
  }
}

function activateBrowserView(view, ownerTabId) {
  if (view.__brizoSleepTimer) clearTimeout(view.__brizoSleepTimer);
  view.__brizoSleepTimer = undefined;
  browserView = view;
  browserOwnerTabId = ownerTabId;
  browserDisplayUrl = isInternalBrowserErrorUrl(view.__brizoDisplayUrl)
    ? view.__brizoRequestedUrl || ""
    : view.__brizoDisplayUrl || "";
  browserError = view.__brizoError || "";
  pageBackgroundColor = view.__brizoBackgroundColor || "#ffffff";
  pageFaviconUrl = view.__brizoFaviconUrl || "";
  browserErrorPageActive = Boolean(view.__brizoErrorPageActive);
  setBrowserViewVisible(browserVisible);
  for (const [tabId, backgroundView] of browserViews) {
    if (backgroundView === view || backgroundView.__brizoSleepTimer) continue;
    backgroundView.__brizoSleepTimer = setTimeout(() => {
      if (browserView === backgroundView || backgroundView.webContents.isDestroyed()) return;
      browserViews.delete(tabId);
      backgroundView.webContents.close();
    }, browserTabSleepDelayMs);
  }
  publishBrowserState();
}

function ensureBrowserView(ownerTabId) {
  const tabId = typeof ownerTabId === "string" && ownerTabId ? ownerTabId : "__default__";
  let view = browserViews.get(tabId);
  if (!view || view.webContents.isDestroyed()) {
    view = createBrowserView(mainWindow, tabId);
    browserViews.set(tabId, view);
  }
  activateBrowserView(view, tabId);
  return view;
}

function setBrowserBounds(bounds) {
  if (!mainWindow || !browserView) return;

  const contentBounds = mainWindow.getContentBounds();
  const nextBounds = {
    x: Math.max(0, Math.round(Number(bounds?.x) || 0)),
    y: Math.max(0, Math.round(Number(bounds?.y) || 0)),
    width: Math.max(1, Math.round(Number(bounds?.width) || 1)),
    height: Math.max(1, Math.round(Number(bounds?.height) || 1)),
  };

  nextBounds.width = Math.min(nextBounds.width, Math.max(1, contentBounds.width - nextBounds.x));
  nextBounds.height = Math.min(nextBounds.height, Math.max(1, contentBounds.height - nextBounds.y));
  browserBounds = nextBounds;
  setBrowserViewVisible(browserVisible);
}

function navigateBrowser(input, ownerTabId) {
  const url = normalizeBrowserInput(input);
  return navigateBrowserUrl(url, ownerTabId);
}

function navigateBrowserUrl(url, ownerTabId) {
  if (!url || !mainWindow) return false;
  const targetView = ensureBrowserView(ownerTabId);
  if (
    targetView.__brizoDisplayUrl === url
    && !targetView.__brizoError
    && targetView.webContents.getURL()
  ) {
    publishBrowserState();
    return true;
  }
  browserErrorPageActive = false;
  clearBrowserNavigationTimeout(targetView);
  if (typeof ownerTabId === "string" && ownerTabId) browserOwnerTabId = ownerTabId;
  browserNavigationGeneration += 1;
  browserError = "";
  pageBackgroundColor = "#ffffff";
  pageFaviconUrl = "";
  browserDisplayUrl = url;
  targetView.__brizoDisplayUrl = url;
  targetView.__brizoRequestedUrl = url;
  targetView.__brizoError = "";
  targetView.__brizoErrorPageActive = false;
  publishBrowserState();
  targetView.__brizoNavigationTimeout = setTimeout(() => {
    if (targetView.webContents.isDestroyed() || targetView.__brizoErrorPageActive) return;
    targetView.webContents.stop();
    if (browserView === targetView) void showBrowserErrorPage({ errorCode: -118, url });
    else targetView.__brizoError = "TIMEOUT · 连接超时";
  }, 20_000);
  loadBrowserUrl(targetView.webContents, url).catch(() => {
    if (browserView === targetView && !targetView.__brizoErrorPageActive) {
      void showBrowserErrorPage({ url });
    }
  });
  return true;
}

function createIncognitoWindow(input, { show = !headlessTest } = {}) {
  const startUrl = normalizeBrowserInput(input) || "https://example.com/";
  const window = new BrowserWindow({
    title: "Brizo - Incognito",
    icon: appIconPath,
    width: 1280,
    height: 840,
    minWidth: 760,
    minHeight: 520,
    show: false,
    backgroundColor: "#1e211f",
    titleBarStyle: "hiddenInset",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: incognitoPreloadEntry,
      sandbox: true,
    },
  });
  const view = new WebContentsView({
    webPreferences: {
      backgroundThrottling: false,
      contextIsolation: true,
      nodeIntegration: false,
      partition: `bean-incognito-${Date.now()}-${incognitoSequence += 1}`,
      sandbox: true,
    },
  });
  const context = { view, window };
  const shellWebContentsId = window.webContents.id;
  const viewWebContentsId = view.webContents.id;
  incognitoContexts.set(shellWebContentsId, context);
  view.webContents.once("destroyed", () => scrollbarCssKeys.delete(viewWebContentsId));
  window.contentView.addChildView(view);
  view.setBackgroundColor("#ffffff");

  const updateBounds = () => {
    if (window.isDestroyed()) return;
    const bounds = window.getContentBounds();
    view.setBounds({
      x: 0,
      y: 58,
      width: Math.max(1, bounds.width),
      height: Math.max(1, bounds.height - 58),
    });
  };
  const publishState = () => {
    if (window.isDestroyed() || view.webContents.isDestroyed()) return;
    const { navigationHistory } = view.webContents;
    window.webContents.send("bean-incognito:state", {
      canGoBack: navigationHistory.canGoBack(),
      canGoForward: navigationHistory.canGoForward(),
      isLoading: view.webContents.isLoading(),
      title: view.webContents.getTitle(),
      url: view.webContents.getURL(),
    });
  };
  const navigate = (value) => {
    const url = normalizeBrowserInput(value);
    if (!url) return false;
    loadBrowserUrl(view.webContents, url).catch(() => {});
    return true;
  };

  context.navigate = navigate;
  const browserSession = view.webContents.session;
  browserSession.setPermissionCheckHandler(() => false);
  browserSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(false);
  });
  view.webContents.setWindowOpenHandler(({ url }) => {
    navigate(url);
    return { action: "deny" };
  });
  for (const eventName of [
    "did-start-loading",
    "did-stop-loading",
    "did-navigate",
    "did-navigate-in-page",
    "page-title-updated",
  ]) {
    view.webContents.on(eventName, publishState);
  }
  view.webContents.on("did-finish-load", () => {
    installPageScrollbarBehavior(view.webContents).catch((error) => {
      console.error("[scrollbars]", error instanceof Error ? error.message : String(error));
    });
  });

  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (event, url) => {
    if (!url.startsWith("file://")) event.preventDefault();
  });
  window.on("resize", updateBounds);
  window.once("ready-to-show", () => {
    if (show) window.show();
  });
  window.on("closed", () => {
    incognitoContexts.delete(shellWebContentsId);
    if (!view.webContents.isDestroyed()) view.webContents.close();
  });
  window.webContents.once("did-finish-load", publishState);
  window.loadFile(incognitoEntry);
  updateBounds();
  loadBrowserUrl(view.webContents, startUrl).catch(() => {});
  return window;
}

function createBrowserView(window, ownerTabId = "__default__") {
  const view = new WebContentsView({
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: browserPagePreloadEntry,
      sandbox: true,
      partition: "persist:bean-browser",
      backgroundThrottling: false,
    },
  });

  browserView = view;
  browserOwnerTabId = ownerTabId;
  view.__brizoDisplayUrl = "";
  view.__brizoRequestedUrl = "";
  view.__brizoError = "";
  view.__brizoBackgroundColor = "#ffffff";
  view.__brizoFaviconUrl = "";
  view.__brizoErrorPageActive = false;
  view.__brizoSleepTimer = undefined;
  const viewWebContentsId = view.webContents.id;
  view.webContents.once("destroyed", () => scrollbarCssKeys.delete(viewWebContentsId));
  window.contentView.addChildView(view);
  view.setBackgroundColor("#ffffff");
  setBrowserViewVisible(browserVisible);

  const browserSession = view.webContents.session;
  if (!browserSessionHandlersInstalled) {
    browserSessionHandlersInstalled = true;
    browserSession.on("will-download", (_event, item) => trackDownload(item));
    const findRequestView = (webContentsId) =>
      [...browserViews.values()].find((candidate) =>
        !candidate.webContents.isDestroyed() && candidate.webContents.id === webContentsId,
      );
    browserSession.webRequest.onCompleted(
      { urls: ["http://*/*", "https://*/*"] },
      (details) => {
        if (details.resourceType !== "mainFrame" || details.statusCode < 400) return;
        const requestView = findRequestView(details.webContentsId);
        if (!requestView || requestView.__brizoErrorPageActive) return;
        if (requestView === browserView) {
          void showBrowserErrorPage({ statusCode: details.statusCode, url: details.url });
        } else {
          const failure = describeBrowserFailure({ statusCode: details.statusCode });
          requestView.__brizoError = `${failure[0]} · ${failure[1]}`;
        }
      },
    );
    browserSession.webRequest.onErrorOccurred(
      { urls: ["http://*/*", "https://*/*"] },
      (details) => {
        if (details.resourceType !== "mainFrame" || details.error === "net::ERR_ABORTED") return;
        const requestView = findRequestView(details.webContentsId);
        if (!requestView || requestView.__brizoErrorPageActive) return;
        if (requestView === browserView) {
          void showBrowserErrorPage({ errorDescription: details.error, url: details.url });
        } else {
          const failure = describeBrowserFailure({ errorDescription: details.error });
          requestView.__brizoError = `${failure[0]} · ${failure[1]}`;
        }
      },
    );
  }
  browserSession.setPermissionCheckHandler(() => false);
  browserSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(false);
  });

  view.webContents.setWindowOpenHandler(({ url }) => {
    navigateBrowser(url);
    return { action: "deny" };
  });
  installWebContextMenus(view.webContents, window, (url) => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    mainWindow.webContents.send("bean-browser:open-url-tab", url);
  }, (selectedText) => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    mainWindow.webContents.send("bean-browser:ask-selection", selectedText);
  });

  view.webContents.on("before-input-event", (_event, input) => {
    if (input.type === "keyDown" || input.type === "rawKeyDown") {
      publishBrowserActivation();
    }
  });
  view.webContents.on("did-start-navigation", (_event, _url, isSameDocument, isMainFrame) => {
    if (!isMainFrame || isSameDocument) return;
    if (browserView !== view) return;
    browserNavigationGeneration += 1;
    if (!browserErrorPageActive) browserError = "";
    pageBackgroundColor = "#ffffff";
    pageFaviconUrl = "";
    publishBrowserState();
  });
  view.webContents.on("did-finish-load", () => {
    clearBrowserNavigationTimeout(view);
    installPageScrollbarBehavior(view.webContents).catch((error) => {
      console.error("[scrollbars]", error instanceof Error ? error.message : String(error));
    });
    if (browserView !== view) return;
    setTimeout(() => updatePageBackgroundColor(), 80);
    setTimeout(() => updatePageBackgroundColor(), 420);
    setTimeout(() => updatePageBackgroundColor(), 1_200);
    setTimeout(() => updatePageBackgroundColor(), 2_500);
  });
  view.webContents.on("page-favicon-updated", (_event, favicons) => {
    const nextFavicon = favicons.find((url) => /^(https?:|data:image\/)/i.test(url)) || "";
    view.__brizoFaviconUrl = nextFavicon;
    if (browserView !== view) return;
    pageFaviconUrl = nextFavicon;
    publishBrowserState();
  });

  view.webContents.on("did-navigate", (_event, url, httpResponseCode) => {
    if (!view.__brizoErrorPageActive
      && !isInternalBrowserErrorUrl(url)
      && typeof url === "string"
      && !url.startsWith("data:text/html;charset=utf-8,")) {
      view.__brizoDisplayUrl = url;
    }
    if (browserView !== view) return;
    if (Number(httpResponseCode) >= 400) {
      void showBrowserErrorPage({ statusCode: Number(httpResponseCode), url });
      return;
    }
    if (!browserErrorPageActive) browserError = "";
    if (!browserErrorPageActive && typeof url === "string" && !url.startsWith("data:text/html;charset=utf-8,")) browserDisplayUrl = url;
    publishBrowserState();
  });
  view.webContents.on("did-navigate-in-page", (_event, url) => {
    if (!view.__brizoErrorPageActive
      && !isInternalBrowserErrorUrl(url)
      && typeof url === "string"
      && !url.startsWith("data:text/html;charset=utf-8,")) {
      view.__brizoDisplayUrl = url;
    }
    if (browserView !== view) return;
    if (!browserErrorPageActive) browserError = "";
    if (!browserErrorPageActive && typeof url === "string" && !url.startsWith("data:text/html;charset=utf-8,")) browserDisplayUrl = url;
    publishBrowserState();
  });
  for (const eventName of ["did-start-loading", "did-stop-loading", "page-title-updated"]) {
    view.webContents.on(eventName, () => {
      if (browserView !== view) return;
      if (!browserErrorPageActive) browserError = "";
      publishBrowserState();
    });
  }

  view.webContents.on(
    "did-fail-load",
    (_event, errorCode, errorDescription, validatedUrl, isMainFrame) => {
      if (!isMainFrame || errorCode === -3) return;
      if (browserView !== view) {
        view.__brizoError = `${errorDescription} (${errorCode})`;
        return;
      }
      if (browserSmokeTest) {
        failTest(`external page failed to load: ${validatedUrl} — ${errorDescription} (${errorCode})`);
        return;
      }
      void showBrowserErrorPage({ errorCode, url: validatedUrl });
    },
  );

  if (browserSmokeTest) {
    const timeout = setTimeout(() => failTest("external page load timed out"), 20_000);
    view.webContents.once("did-finish-load", async () => {
      clearTimeout(timeout);
      try {
        await installPageScrollbarBehavior(view.webContents);
        await updatePageBackgroundColor();
        const result = await view.webContents.executeJavaScript(`
          ({
            backgroundColor: getComputedStyle(document.body).backgroundColor,
            beanScrollbars: document.documentElement.dataset.beanScrollbars || "",
            title: document.title,
            heading: document.querySelector("h1")?.textContent?.trim() ?? "",
            url: location.href
          })
        `);
        await new Promise((resolve) => setTimeout(resolve, 200));
        result.addressValue = await mainWindow.webContents.executeJavaScript(
          `document.querySelector(".address-bar input")?.value ?? ""`,
        );
        result.startupNewTabPageVisible = await mainWindow.webContents.executeJavaScript(
          `Boolean(document.querySelector(".new-tab-page"))`,
        );
        result.sidebarCollapsedAfterLoad = await mainWindow.webContents.executeJavaScript(
          `document.querySelector(".app-shell")?.classList.contains("spaces-collapsed") ?? true`,
        );
        result.sidebarHoverBehavior = await mainWindow.webContents.executeJavaScript(`
          (async () => {
            const panel = document.querySelector(".spaces-panel");
            const shell = document.querySelector(".app-shell");
            panel?.dispatchEvent(new PointerEvent("pointerover", { bubbles: true }));
            await new Promise((resolve) => setTimeout(resolve, 30));
            const expandedOnEnter = !shell?.classList.contains("spaces-collapsed");
            panel?.dispatchEvent(new PointerEvent("pointerout", { bubbles: true, relatedTarget: document.body }));
            // Pointer leave intentionally keeps the complete bookmark rail open
            // for a 500 ms re-entry grace period.
            await new Promise((resolve) => setTimeout(resolve, 520));
            return {
              collapsedOnLeave: shell?.classList.contains("spaces-collapsed") ?? false,
              expandedOnEnter,
            };
          })()
        `);
        result.backgroundThrottling = view.webContents.getBackgroundThrottling();
        result.browserViewHiddenAtStartup = !browserVisible
          && browserView.getBounds().width === 0
          && browserView.getBounds().height === 0;
        result.reportedBackgroundColor = pageBackgroundColor;
        setBrowserViewVisible(true);
        await new Promise((resolve) => setTimeout(resolve, 50));
        await view.webContents.executeJavaScript(`
          (() => {
            const banner = document.createElement("div");
            banner.id = "brizo-hydrated-top-edge-fixture";
            banner.style.cssText = "position:fixed;inset:0 0 auto;height:48px;background:rgb(36,41,47);z-index:2147483647";
            document.body.appendChild(banner);
          })()
        `);
        await new Promise((resolve) => setTimeout(resolve, 520));
        await updatePageBackgroundColor();
        result.hydratedTopEdgeColorDetected = pageBackgroundColor === "rgb(36, 41, 47)";
        await view.webContents.executeJavaScript(
          `document.querySelector("#brizo-hydrated-top-edge-fixture")?.remove()`,
        );
        await updatePageBackgroundColor();
        setBrowserViewVisible(false);
        result.interactionsAfterLoad = browserInteractionCount;
        view.webContents.focus();
        view.webContents.sendInputEvent({
          type: "keyDown",
          keyCode: "A",
        });
        view.webContents.sendInputEvent({
          type: "keyUp",
          keyCode: "A",
        });
        await new Promise((resolve) => setTimeout(resolve, 180));
        result.interactionsAfterTrustedInput = browserInteractionCount;
        result.sidebarCollapsedAfterTrustedInput =
          await mainWindow.webContents.executeJavaScript(
            `document.querySelector(".app-shell")?.classList.contains("spaces-collapsed") ?? false`,
          );
        setBrowserViewVisible(true);
        await new Promise((resolve) => setTimeout(resolve, 50));
        result.backgroundThrottlingWhileVisible = view.webContents.getBackgroundThrottling();
        const screenshotDirectory = app.isPackaged
          ? path.join(app.getPath("temp"), "brizo-browser-smoke")
          : path.join(projectRoot, "tmp", "screenshots");
        await mkdir(screenshotDirectory, { recursive: true });
        const { captureAndSaveScreenshot } = await loadBrowserToolsModule();
        const visibleScreenshot = await captureAndSaveScreenshot({
          mode: "visible",
          outputPath: path.join(screenshotDirectory, "browser-visible-smoke.png"),
          webContents: view.webContents,
          window: mainWindow,
        });
        const fullPageScreenshot = await captureAndSaveScreenshot({
          mode: "full-page",
          outputPath: path.join(screenshotDirectory, "browser-full-page-smoke.png"),
          webContents: view.webContents,
          window: mainWindow,
        });
        setBrowserViewVisible(false);
        const incognitoWindow = createIncognitoWindow("https://example.com/", { show: false });
        const incognitoContext = incognitoContexts.get(incognitoWindow.webContents.id);
        result.incognitoIsolated = Boolean(
          incognitoContext &&
          incognitoContext.view.webContents.session !== view.webContents.session &&
          incognitoContext.view.webContents.session.storagePath === null,
        );
        incognitoWindow.close();
        result.visibleScreenshotBytes = visibleScreenshot.bytes;
        result.fullPageScreenshotBytes = fullPageScreenshot.bytes;
        result.newTabPageVisible = await mainWindow.webContents.executeJavaScript(
          `Boolean(document.querySelector(".new-tab-page"))`,
        );
        await new Promise((resolve) => setTimeout(resolve, 80));
        result.browserViewHiddenForNewTab = !browserVisible
          && browserView.getBounds().width === 0
          && browserView.getBounds().height === 0;
        result.imageContextMenuInstalled = view.webContents.listenerCount("context-menu") > 0;
        result.imageContextMenuLabels = imageContextMenuItems.map(({ label }) => label);
        result.linkContextMenuLabels = linkContextMenuItems.map(({ label }) => label);
        result.selectionContextMenuLabels = selectionContextMenuItems.map(({ label }) => label);
        const downloadMenuFixture = decodeURIComponent(createDownloadsPageUrl([{
          createdAt: new Date().toISOString(),
          filename: "sample.png",
          id: "download-smoke",
          isMissing: false,
          savePath: "/tmp/sample.png",
          sourceUrl: "https://source.example/sample.png",
          state: "completed",
          thumbnailDataUrl: "data:image/png;base64,iVBORw0KGgo=",
        }]).split(",").slice(1).join(","));
        result.downloadMenuActions = {
          folder: downloadMenuFixture.includes("brizo-download://folder?id=download-smoke"),
          open: downloadMenuFixture.includes("brizo-download://open?id=download-smoke"),
          savePath: downloadMenuFixture.includes("/tmp/sample.png"),
          sourceHidden: !downloadMenuFixture.includes("https://source.example/sample.png"),
          thumbnail: downloadMenuFixture.includes("data:image/png;base64,iVBORw0KGgo="),
        };
        const retainedUrl = `data:text/html;charset=utf-8,${encodeURIComponent("<title>Retained A</title><main>state</main>")}`;
        const secondUrl = `data:text/html;charset=utf-8,${encodeURIComponent("<title>Retained B</title><main>other</main>")}`;
        navigateBrowserUrl(retainedUrl, "retention-a");
        const retainedView = browserViews.get("retention-a");
        if (retainedView.webContents.isLoading()) {
          await new Promise((resolve) => retainedView.webContents.once("did-finish-load", resolve));
        }
        await retainedView.webContents.executeJavaScript("window.__brizoRetainedState = 47");
        navigateBrowserUrl(secondUrl, "retention-b");
        const secondView = browserViews.get("retention-b");
        if (secondView.webContents.isLoading()) {
          await new Promise((resolve) => secondView.webContents.once("did-finish-load", resolve));
        }
        navigateBrowserUrl(retainedUrl, "retention-a");
        result.multiTabStateRetained =
          await retainedView.webContents.executeJavaScript("window.__brizoRetainedState === 47");
        result.multiTabViewCount = ["retention-a", "retention-b"]
          .filter((tabId) => browserViews.has(tabId)).length;
        const failedUrl = "https://does-not-resolve.invalid/test";
        await showBrowserErrorPage({ errorCode: -105, url: failedUrl });
        const errorState = getBrowserState();
        result.errorPageKeepsRequestedUrl =
          errorState.url === failedUrl
          && errorState.documentUrl === failedUrl
          && browserView.__brizoDisplayUrl === failedUrl
          && !errorState.url.startsWith("file:");
        result.errorPageLogoLoaded = await browserView.webContents.executeJavaScript(`
          (() => {
            const logo = document.querySelector("main img");
            return Boolean(logo && logo.complete && logo.naturalWidth > 0);
          })()
        `);
        const passed =
          result.title === "Example Domain" &&
          result.heading === "Example Domain" &&
          result.addressValue === "" &&
          result.startupNewTabPageVisible &&
          result.beanScrollbars === "ready" &&
          result.backgroundThrottling === true &&
          result.backgroundThrottlingWhileVisible === false &&
          result.browserViewHiddenAtStartup &&
          result.hydratedTopEdgeColorDetected &&
          result.interactionsAfterLoad === 0 &&
          result.interactionsAfterTrustedInput > result.interactionsAfterLoad &&
          result.sidebarCollapsedAfterLoad === true &&
          Object.values(result.sidebarHoverBehavior).every(Boolean) &&
          result.sidebarCollapsedAfterTrustedInput === true &&
          result.visibleScreenshotBytes > 1_000 &&
          result.fullPageScreenshotBytes > 1_000 &&
          result.incognitoIsolated &&
          result.newTabPageVisible &&
          result.browserViewHiddenForNewTab &&
          result.imageContextMenuInstalled &&
          result.imageContextMenuLabels.join(",") ===
            "新标签页中打开图片,下载该图片,复制该图片,复制图片地址" &&
          result.linkContextMenuLabels.join(",") ===
            "在新标签页打开链接,复制链接地址" &&
          result.selectionContextMenuLabels.join(",") ===
            "复制文字,向 Brizo 询问,翻译" &&
          Object.values(result.downloadMenuActions).every(Boolean) &&
          result.multiTabStateRetained &&
          result.multiTabViewCount === 2 &&
          result.errorPageLogoLoaded &&
          result.errorPageKeepsRequestedUrl &&
          result.reportedBackgroundColor === result.backgroundColor &&
          result.url.startsWith("https://example.org/");
        console.log(`[browser-smoke] ${JSON.stringify(result)}`);
        app.exit(passed ? 0 : 1);
      } catch (error) {
        failTest(error instanceof Error ? error.message : String(error));
      }
    });
  }

  if (pdfSmokeTest) {
    const timeout = setTimeout(() => failTest("PDF export smoke test timed out"), 25_000);
    view.webContents.once("did-finish-load", async () => {
      clearTimeout(timeout);
      try {
        const { extractReadableArticle, renderArticlePdf } = await loadArticlePdfModule();
        const article = await extractReadableArticle(view.webContents);
        const pdf = await renderArticlePdf(article);
        const outputDirectory = app.isPackaged
          ? path.join(app.getPath("temp"), "brizo-pdf-smoke")
          : path.join(projectRoot, "output", "pdf");
        const outputPath = path.join(outputDirectory, "bean-article-export-smoke.pdf");
        await mkdir(outputDirectory, { recursive: true });
        await writeFile(outputPath, pdf);

        const fixturePassed = pdfSmokeUrl
          ? (!pdfSmokeExpectedTitle || article.title === pdfSmokeExpectedTitle)
          : (
              article.title === "A clean article export" &&
              /Ada Example/.test(article.byline) &&
              article.content.includes("<strong>important argument</strong>") &&
              article.content.includes("<em>original emphasis</em>") &&
              article.content.includes("<img") &&
              !article.content.includes("Products Pricing Sign in") &&
              !article.content.includes("Advertisement: remove this content.")
            );
        const passed =
          fixturePassed &&
          pdf.subarray(0, 4).toString() === "%PDF" &&
          pdf.length > 5_000;

        console.log(`[pdf-smoke] ${JSON.stringify({
          byline: article.byline,
          bytes: pdf.length,
          outputPath,
          title: article.title,
          titleSource: article.titleSource,
        })}`);
        app.exit(passed ? 0 : 1);
      } catch (error) {
        failTest(error instanceof Error ? error.message : String(error));
      }
    });
  }

  if (headlessTest) {
    browserDisplayUrl = initialUrl;
    view.__brizoDisplayUrl = initialUrl;
    loadBrowserUrl(view.webContents, initialUrl).catch((error) => {
      browserError = error instanceof Error ? error.message : String(error);
      publishBrowserState();
    });
  }
  return view;
}

async function readModelGuardStore() {
  try {
    const parsed = JSON.parse(await readFile(modelGuardPath(), "utf8"));
    return {
      defaultId: typeof parsed?.defaultId === "string" ? parsed.defaultId : "",
      providers: Array.isArray(parsed?.providers) ? parsed.providers : [],
    };
  } catch {
    return { defaultId: "", providers: [] };
  }
}

async function writeModelGuardStore(store) {
  await mkdir(path.dirname(modelGuardPath()), { recursive: true });
  await writeFile(modelGuardPath(), JSON.stringify(store, null, 2), { mode: 0o600 });
}

function decryptModelKey(provider) {
  if (!provider?.encryptedKey || !safeStorage.isEncryptionAvailable()) return "";
  try {
    return safeStorage.decryptString(Buffer.from(provider.encryptedKey, "base64"));
  } catch {
    return "";
  }
}

function withKnownProviderDefaults(provider) {
  const name = String(provider?.name || "").toLowerCase();
  if (name.includes("deepseek") || name.includes("deep seek")) {
    const models = Array.isArray(provider.models) && provider.models.length
      ? provider.models
      : ["deepseek-v4-flash"];
    return {
      ...provider,
      baseUrl: provider.baseUrl || "https://api.deepseek.com",
      models,
      selectedModel: chooseFastModel(models, provider.name),
    };
  }
  return provider;
}

function sanitizeModelProviders(store) {
  return store.providers.map((storedProvider) => {
    const provider = withKnownProviderDefaults(storedProvider);
    return {
      id: provider.id,
      name: provider.name,
      baseUrl: provider.baseUrl,
      isDefault: provider.id === store.defaultId,
      keyMask: provider.keyMask || "••••••••",
      models: sortFastModels(Array.isArray(provider.models) ? provider.models : [], provider.name),
      selectedModel: chooseFastModel(Array.isArray(provider.models) ? provider.models : [], provider.name) || "",
    };
  });
}

function modelSpeedScore(model, providerName = "") {
  const name = String(model || "").toLowerCase();
  const provider = String(providerName || "").toLowerCase();
  let score = 0;
  if (provider.includes("qwen") || provider.includes("tongyi") || provider.includes("通义")) {
    score += name.startsWith("qwen") ? 220 : -120;
  } else if (provider.includes("deepseek") || provider.includes("deep seek")) {
    score += name.includes("deepseek") ? 220 : -120;
  } else if (provider.includes("minimax")) {
    score += name.includes("minimax") ? 220 : -120;
  }
  if (name.includes("flash")) score += 120;
  if (name.includes("instant")) score += 105;
  if (name.includes("turbo")) score += 95;
  if (/(^|[/_.-])mini($|[/_.-])/.test(name)) score += 90;
  if (name.includes("fast")) score += 85;
  if (name.includes("chat")) score += 70;
  if (name.includes("lite")) score += 65;
  if (name.includes("haiku")) score += 60;
  if (name.includes("small")) score += 45;
  if (name.includes("reasoner") || name.includes("reasoning")) score -= 140;
  if (name.includes("thinking") || name.includes("-r1") || name.endsWith("r1")) score -= 130;
  if (name.includes("pro") || name.includes("max") || name.includes("ultra")) score -= 25;
  if (/(speech|audio|asr|tts|realtime|embedding|image|ocr|livetranslate)/.test(name)) score -= 400;
  if (/-(19|20)\d{2}-\d{2}-\d{2}$/.test(name)) score -= 4;
  return score;
}

function sortFastModels(models, providerName = "") {
  return [...new Set(models.filter((model) => typeof model === "string" && model))]
    .sort((left, right) => modelSpeedScore(right, providerName) - modelSpeedScore(left, providerName));
}

function chooseFastModel(models, providerName = "") {
  return sortFastModels(models, providerName)[0] || "";
}

function readAssistantMessage(body) {
  const content = body?.choices?.[0]?.message?.content;
  if (typeof content === "string") return content.trim();
  if (Array.isArray(content)) {
    return content
      .map((item) => typeof item === "string" ? item : item?.text || "")
      .filter(Boolean)
      .join("\n")
      .trim();
  }
  return "";
}

function normalizeModelApiUrl(input) {
  const value = String(input || "").trim().replace(/\/$/, "");
  if (!value) return "";
  const url = new URL(value);
  const local = ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
  if (url.protocol !== "https:" && !(local && url.protocol === "http:")) {
    throw new Error("API 地址必须使用 HTTPS；本机地址可以使用 HTTP。" );
  }
  return url.href.replace(/\/$/, "");
}

async function discoverCompatibleModels(baseUrl, apiKey) {
  if (!baseUrl || !apiKey) return [];
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch(`${baseUrl}/models`, {
      headers: { Accept: "application/json", Authorization: `Bearer ${apiKey}` },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`模型接口返回 HTTP ${response.status}`);
    const body = await response.json();
    return sortFastModels((Array.isArray(body?.data) ? body.data : Array.isArray(body?.models) ? body.models : [])
      .map((model) => typeof model === "string" ? model : model?.id || model?.name || "")
      .filter(Boolean)
      .slice(0, 100));
  } finally {
    clearTimeout(timeout);
  }
}

async function saveModelProvider(payload) {
  if (!safeStorage.isEncryptionAvailable()) {
    return { status: "error", message: "当前系统无法使用安全凭证存储。" };
  }
  const store = await readModelGuardStore();
  const id = typeof payload?.id === "string" && payload.id
    ? payload.id
    : `provider-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const existing = store.providers.find((provider) => provider.id === id);
  const apiKey = typeof payload?.apiKey === "string" && payload.apiKey.trim()
    ? payload.apiKey.trim()
    : decryptModelKey(existing);
  if (!apiKey) return { status: "error", message: "请输入 API Key。" };

  const providerName = String(payload?.name || existing?.name || "自定义 API").trim().slice(0, 80) || "自定义 API";
  const knownDefaults = withKnownProviderDefaults({ name: providerName });
  let baseUrl = "";
  try {
    baseUrl = normalizeModelApiUrl(payload?.baseUrl || knownDefaults?.baseUrl);
  } catch (error) {
    return { status: "error", message: error.message };
  }
  let models = existing?.models?.length ? existing.models : knownDefaults?.models || [];
  let discoveryMessage = "";
  if (baseUrl) {
    try {
      models = await discoverCompatibleModels(baseUrl, apiKey);
      if (!models.length) {
        models = knownDefaults?.models || [];
        discoveryMessage = "API 已保存，已使用服务商的快速模型默认值。";
      }
    } catch (error) {
      models = knownDefaults?.models || [];
      discoveryMessage = error?.name === "AbortError"
        ? "API 已保存，模型识别超时。"
        : `API 已保存，暂时无法识别模型：${error.message}`;
    }
  }
  const selectedModel = chooseFastModel(models, providerName);
  const provider = {
    id,
    name: providerName,
    baseUrl,
    encryptedKey: safeStorage.encryptString(apiKey).toString("base64"),
    keyMask: `••••${apiKey.slice(-4)}`,
    models,
    selectedModel,
  };
  store.providers = [...store.providers.filter((item) => item.id !== id), provider];
  if (!store.defaultId || payload?.makeDefault) store.defaultId = id;
  await writeModelGuardStore(store);
  return { status: "saved", message: discoveryMessage, providers: sanitizeModelProviders(store) };
}

async function searchWithBoundModel(payload) {
  const store = await readModelGuardStore();
  const requestedModel = typeof payload?.model === "string" ? payload.model : "";
  const storedProvider = store.providers.find((item) =>
    Array.isArray(item.models) && item.models.includes(requestedModel)
  ) || store.providers.find((item) => item.id === store.defaultId) || store.providers[0];
  const provider = withKnownProviderDefaults(storedProvider);
  if (!provider?.baseUrl) return null;
  const apiKey = decryptModelKey(storedProvider);
  if (!apiKey) return null;
  const model = provider.models?.includes(requestedModel)
    ? requestedModel
    : chooseFastModel(provider.models || [], provider.name);
  if (!model) return null;

  const query = typeof payload?.query === "string" ? payload.query.trim().slice(0, 12_000) : "";
  if (!query) return { status: "error", message: "请输入搜索内容。" };
  const contextTab = payload?.context?.tab;
  const attachmentNames = Array.isArray(payload?.context?.attachmentNames)
    ? payload.context.attachmentNames.filter((name) => typeof name === "string").slice(0, 8)
    : [];
  const context = [
    contextTab?.url ? `用户插入的标签页：${contextTab.title || contextTab.url}（${contextTab.url}）` : "",
    attachmentNames.length ? `用户附加的文件名：${attachmentNames.join("、")}。不要声称读取了文件内容。` : "",
  ].filter(Boolean).join("\n");
  const controller = new AbortController();
  const requestTimeoutMs = Math.min(90_000, Math.max(5_000, Number(payload?.timeoutMs) || 45_000));
  const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);
  try {
    const response = await fetch(`${provider.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "system",
            content: payload?.systemPrompt || "你是 Brizo 的快速回答模型。优先使用中文，明确区分已知事实与推测。当前是模型直连回答，不要声称已经联网搜索或引用了网页来源。",
          },
          { role: "user", content: context ? `${query}\n\n${context}` : query },
        ],
        stream: false,
      }),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`模型接口返回 HTTP ${response.status}`);
    const body = await response.json();
    const message = readAssistantMessage(body);
    if (!message) throw new Error("模型没有返回文字内容");
    return {
      status: "success",
      message,
      sources: [],
      providerLabel: `${provider.name || "自定义 API"} · 直接回答`,
      modelLabel: model,
      mode: "direct",
    };
  } catch (error) {
    console.error("[bound-model-search]", error instanceof Error ? error.message : String(error));
    return {
      status: "error",
      message: error?.name === "AbortError"
        ? "默认模型响应超时，请稍后再试。"
        : `默认模型调用失败：${error.message}`,
      providerLabel: provider.name || "自定义 API",
      modelLabel: model,
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function searchWithQwenEditorialModel(payload) {
  const store = await readModelGuardStore();
  const candidates = store.providers
    .filter((provider) => provider.id !== store.defaultId)
    .map(withKnownProviderDefaults)
    .map((provider) => ({
      model: chooseFastModel(
        (Array.isArray(provider.models) ? provider.models : []).filter((model) => /qwen/i.test(model)),
        provider.name,
      ),
      provider,
    }))
    .filter(({ model, provider }) =>
      model
      && /qwen|通义|dashscope/i.test(`${provider?.name || ""} ${provider?.baseUrl || ""}`)
      && provider?.baseUrl
      && decryptModelKey(provider),
    );
  const selected = candidates[0];
  if (!selected) {
    return { status: "error", message: "未配置可用于 Brief 中文编辑的 Qwen 文本模型。" };
  }
  return searchWithBoundModel({ ...payload, model: selected.model });
}

async function askCurrentPageWithBoundModel(payload) {
  if (!browserView || browserView.webContents.isDestroyed()) {
    return { status: "error", message: "当前没有可以提问的网页。" };
  }
  const question = typeof payload?.question === "string"
    ? payload.question.trim().slice(0, 4_000)
    : "";
  if (!question) return { status: "error", message: "请输入关于当前网页的问题。" };

  const store = await readModelGuardStore();
  const storedProvider = store.providers.find((provider) => provider.id === store.defaultId)
    || store.providers[0];
  const provider = withKnownProviderDefaults(storedProvider);
  const apiKey = decryptModelKey(storedProvider);
  if (!provider?.baseUrl || !apiKey) {
    return { status: "error", message: "请先在“大模型护航”中绑定并选择默认 API。" };
  }
  const model = chooseFastModel(provider.models || [], provider.name);
  if (!model) {
    return {
      status: "error",
      message: "默认 API 中没有可用的文本模型。",
      providerLabel: provider.name || "默认 API",
    };
  }

  try {
    const page = await browserView.webContents.executeJavaScript(`
      (() => {
        const fullText = String(document.body?.innerText || "")
          .replace(/[ \\t]+/g, " ")
          .replace(/\\n{3,}/g, "\\n\\n")
          .trim();
        return {
          text: fullText.slice(0, 120000),
          textTruncated: fullText.length > 120000,
          title: document.title || "",
          url: location.href,
        };
      })()
    `);
    const pageContext = [
      `用户问题：${question}`,
      `网页标题：${page.title || "未命名网页"}`,
      `网页地址：${page.url || browserDisplayUrl}`,
      `网页文字${page.textTruncated ? "（内容过长，已截取前 120000 个字符）" : ""}：\n${page.text || "页面没有可读取的文字。"}`,
    ].filter(Boolean).join("\n\n");

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 90_000);
    try {
      const response = await fetch(`${provider.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages: [
            {
              role: "system",
              content: "你是 Brizo 的当前页面阅读助手。只根据提供的网页文字回答。默认使用简洁中文，不要声称看到了图片、图表或访问了未提供的外部信息。",
            },
            {
              role: "user",
              content: pageContext,
            },
          ],
          stream: false,
        }),
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`模型接口返回 HTTP ${response.status}`);
      const body = await response.json();
      const message = readAssistantMessage(body);
      if (!message) throw new Error("模型没有返回文字内容");
      return {
        message,
        mode: "page",
        modelLabel: model,
        pageTitle: page.title || "当前网页",
        pageUrl: page.url || browserDisplayUrl,
        providerLabel: `${provider.name || "默认 API"} · 页面问答`,
        status: "success",
      };
    } finally {
      clearTimeout(timeout);
    }
  } catch (error) {
    console.error("[ask-current-page]", error instanceof Error ? error.message : String(error));
    return {
      status: "error",
      message: error?.name === "AbortError"
        ? "页面分析超时，请稍后再试。"
        : `无法分析当前网页：${error.message}`,
      providerLabel: provider.name || "默认 API",
      modelLabel: model,
    };
  }
}

function normalizeSearchResultUrl(rawUrl) {
  try {
    const url = new URL(rawUrl, "https://html.duckduckgo.com");
    if (url.hostname.endsWith("duckduckgo.com") && url.searchParams.get("uddg")) {
      return decodeURIComponent(url.searchParams.get("uddg"));
    }
    return url.href;
  } catch {
    return "";
  }
}

async function searchDuckDuckGoHtml(query) {
  const { stdout } = await execFileAsync("/usr/bin/curl", [
    "-L",
    "--silent",
    "--show-error",
    "--max-time",
    "6",
    "-A",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
    "--data-urlencode",
    `q=${query}`,
    "https://lite.duckduckgo.com/lite/",
  ], {
    encoding: "utf8",
    maxBuffer: 4 * 1024 * 1024,
    timeout: 8_000,
  });
  const { load } = await loadCheerioModule();
  const $ = load(stdout);
  const results = [];
  $(".result").each((_, element) => {
    const anchor = $(element).find(".result-link").first();
    const url = normalizeSearchResultUrl(anchor.attr("href") || "");
    const title = anchor.text().replace(/\s+/g, " ").trim();
    const snippet = $(element).find(".result__snippet").text().replace(/\s+/g, " ").trim();
    if (url && title) results.push({ title, url, snippet });
  });
  if (!results.length) {
    $(".result-link").each((_, anchorElement) => {
      const anchor = $(anchorElement);
      const url = normalizeSearchResultUrl(anchor.attr("href") || "");
      const title = anchor.text().replace(/\s+/g, " ").trim();
      const snippet = anchor.closest("tr").nextAll("tr").first().find(".result-snippet").text().replace(/\s+/g, " ").trim();
      if (url && title) results.push({ title, url, snippet });
    });
  }
  return results.slice(0, 10);
}

async function searchBingRss(query) {
  const url = new URL("https://www.bing.com/search");
  url.searchParams.set("q", query);
  url.searchParams.set("format", "rss");
  url.searchParams.set("setlang", "zh-Hans");
  const response = await fetch(url, {
    headers: {
      Accept: "application/rss+xml,application/xml,text/xml",
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/126 Safari/537.36",
    },
    signal: AbortSignal.timeout(6_000),
  });
  if (!response.ok) throw new Error(`Bing 返回 HTTP ${response.status}`);
  const { load } = await loadCheerioModule();
  const $ = load(await response.text(), { xmlMode: true });
  const results = [];
  $("item").each((_, element) => {
    const title = $(element).find("title").first().text().replace(/\s+/g, " ").trim();
    const resultUrl = $(element).find("link").first().text().trim();
    const snippet = $(element).find("description").first().text().replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    if (title && resultUrl) results.push({ title, url: resultUrl, snippet });
  });
  return results.slice(0, 10);
}

const webSearchResultCache = new Map();
const WEB_SEARCH_CACHE_TTL_MS = 10 * 60_000;

async function searchWebQuery(query, { force = false } = {}) {
  const cacheKey = String(query || "").replace(/\s+/g, " ").trim().toLowerCase();
  const cached = webSearchResultCache.get(cacheKey);
  if (!force && cached?.results && cached.expiresAt > Date.now()) return cached.results;
  if (!force && cached?.promise) return cached.promise;
  const promise = Promise.allSettled([
    searchDuckDuckGoHtml(query),
    searchBingRss(query),
  ]).then((settled) => {
    const results = settled.flatMap((item) => item.status === "fulfilled" ? item.value : []);
    if (!results.length) {
      const reason = settled.find((item) => item.status === "rejected")?.reason;
      throw reason || new Error("搜索引擎没有返回结果");
    }
    webSearchResultCache.set(cacheKey, {
      expiresAt: Date.now() + WEB_SEARCH_CACHE_TTL_MS,
      results,
    });
    if (webSearchResultCache.size > 160) webSearchResultCache.delete(webSearchResultCache.keys().next().value);
    return results;
  }).catch((error) => {
    webSearchResultCache.delete(cacheKey);
    throw error;
  });
  webSearchResultCache.set(cacheKey, { promise });
  return promise;
}

function tokenizeForSearchScore(text) {
  const normalized = String(text || "").toLowerCase();
  return [...new Set(normalized.match(/[a-z0-9][a-z0-9._+-]{1,}|[\u3400-\u9fff]{2,}/g) || [])];
}

function rankAndDedupeSearchResults(query, groups) {
  const queryTokens = tokenizeForSearchScore(query);
  const seenUrls = new Set();
  const domainCounts = new Map();
  return groups.flatMap((results, groupIndex) => results.map((result, rank) => {
    const haystack = `${result.title} ${result.snippet}`.toLowerCase();
    const matches = queryTokens.filter((token) => haystack.includes(token)).length;
    return { ...result, score: matches * 4 + 3 / (rank + 1) - groupIndex * 0.12 };
  })).sort((left, right) => right.score - left.score).filter((result) => {
    let normalized;
    try {
      const url = new URL(result.url);
      url.hash = "";
      normalized = url.href.replace(/\/$/, "");
      const domain = url.hostname.replace(/^www\./i, "");
      if (seenUrls.has(normalized) || (domainCounts.get(domain) || 0) >= 2) return false;
      seenUrls.add(normalized);
      domainCounts.set(domain, (domainCounts.get(domain) || 0) + 1);
    } catch {
      return false;
    }
    return true;
  }).slice(0, 12).map(({ score: _score, ...result }) => result);
}

function parseModelLines(message, limit) {
  return String(message || "").split("\n")
    .map((item) => item.replace(/^\s*(?:[-*•]|\d+[.)、])\s*/, "").trim())
    .filter((item) => item.length > 2 && item.length < 180)
    .slice(0, limit);
}

async function searchWithVaneAlgorithm(payload) {
  const query = typeof payload?.query === "string" ? payload.query.trim().slice(0, 4000) : "";
  if (!query) return { status: "error", message: "请输入搜索内容。" };

  const queryPlan = await searchWithBoundModel({
    ...payload,
    systemPrompt: "你是网页搜索查询规划器。将用户问题改写成最多三条适合搜索引擎的精确关键词查询。每行一条，不要编号或解释；保留必要的人名、产品名、日期和限定词。",
    query,
  });
  const plannedQueries = queryPlan?.status === "success"
    ? parseModelLines(queryPlan.message, 3)
    : [];
  const queries = [...new Set([query, ...plannedQueries])].slice(0, 3);

  let searchGroups;
  try {
    searchGroups = await Promise.all(queries.map((plannedQuery) => searchWebQuery(plannedQuery)));
  } catch (error) {
    console.error("[web-search]", error instanceof Error ? error.message : String(error));
    return { status: "error", message: `网页检索失败：${error.message}`, providerLabel: "Brizo Web" };
  }
  const sources = rankAndDedupeSearchResults(query, searchGroups);
  if (!sources.length) {
    return { status: "error", message: "没有找到可用于回答的网页结果，请换一种问法重试。", providerLabel: "Brizo Web" };
  }

  const context = sources.map((source, index) => [
    `[${index + 1}] ${source.title}`,
    `URL: ${source.url}`,
    `摘要: ${source.snippet || source.title}`,
  ].join("\n")).join("\n\n");
  const answer = await searchWithBoundModel({
    ...payload,
    systemPrompt: [
      "你是 Brizo 的网页答案引擎，采用 Vane 的搜索写作原则。",
      "只使用给定网页搜索上下文回答；不得把模型记忆伪装成检索事实。",
      "使用中文，先给简洁结论，再按需要使用小标题和项目符号。",
      "每个事实句末必须使用与上下文对应的 [数字] 引用；可以一处使用多个引用，如 [1][3]。",
      "如果上下文不足，明确说明限制，不要编造。不要输出主标题。",
    ].join("\n"),
    query: `用户问题：${query}\n\n网页搜索上下文：\n${context}`,
  });
  if (answer?.status !== "success") {
    return answer || { status: "error", message: "默认模型无法生成搜索答案。" };
  }

  const suggestionResult = await searchWithBoundModel({
    ...payload,
    systemPrompt: "你是 AI 搜索引擎的延伸问题生成器。根据原问题和搜索答案生成三个有价值、可继续进行网页搜索的中文问题。每行一条，不要编号或解释。",
    query: `原问题：${query}\n\n搜索答案：${answer.message.slice(0, 3000)}`,
  });

  return {
    status: "success",
    message: answer.message,
    sources: sources.map((source) => {
      let domain = "";
      try { domain = new URL(source.url).hostname.replace(/^www\./i, ""); } catch { domain = source.url; }
      return { ...source, domain };
    }),
    relatedQuestions: suggestionResult?.status === "success"
      ? parseModelLines(suggestionResult.message, 3)
      : [],
    providerLabel: "Brizo Web · Vane 算法",
    modelLabel: answer.modelLabel,
    mode: "web",
  };
}

async function searchWithVane(payload) {
  return await searchWithVaneAlgorithm(payload);
}

const countryLanguageMap = {
  AT: ["de", "德语"], AU: ["en", "英语"], BR: ["pt-BR", "葡萄牙语"],
  CA: ["en", "英语"], CH: ["de", "德语"], CN: ["zh-CN", "中文"],
  DE: ["de", "德语"], EG: ["ar", "阿拉伯语"], ES: ["es", "西班牙语"],
  FR: ["fr", "法语"], GB: ["en", "英语"], HK: ["zh-HK", "中文"],
  ID: ["id", "印度尼西亚语"], IN: ["hi", "印地语"], IT: ["it", "意大利语"],
  JP: ["ja", "日语"], KR: ["ko", "韩语"], MX: ["es", "西班牙语"],
  MY: ["ms", "马来语"], NL: ["nl", "荷兰语"], PH: ["en", "英语"],
  PL: ["pl", "波兰语"], PT: ["pt", "葡萄牙语"], RU: ["ru", "俄语"],
  SA: ["ar", "阿拉伯语"], SG: ["en", "英语"], TH: ["th", "泰语"],
  TR: ["tr", "土耳其语"], TW: ["zh-TW", "中文"], US: ["en", "英语"],
  VN: ["vi", "越南语"], ZA: ["en", "英语"],
};

async function detectUserLocale() {
  try {
    const response = await fetch("https://www.cloudflare.com/cdn-cgi/trace", {
      signal: AbortSignal.timeout(3500),
    });
    if (!response.ok) throw new Error(`IP locale lookup returned ${response.status}`);
    const country = (await response.text()).match(/^loc=([A-Z]{2})$/m)?.[1] || "";
    const [language, label] = countryLanguageMap[country] || ["en", "英语"];
    return { country, language, label };
  } catch {
    const locale = app.getLocale() || "zh-CN";
    const language = locale.toLowerCase().startsWith("zh") ? locale : locale.split("-")[0] || "en";
    const label = language.startsWith("zh") ? "中文" : "本地语言";
    return { country: "", language, label };
  }
}

async function fetchSearchSuggestions(input) {
  const query = String(input || "").trim().slice(0, 160);
  if (query.length < 2) return [];
  const cacheKey = query.toLocaleLowerCase();
  const cached = searchSuggestionCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.suggestions;
  if (searchSuggestionCooldownUntil > Date.now()) return [];
  try {
    if (await suggestionRegionPromise === "CN") {
      const baiduUrl = new URL("https://suggestion.baidu.com/su");
      baiduUrl.searchParams.set("action", "opensearch");
      baiduUrl.searchParams.set("wd", query);
      const response = await fetch(baiduUrl, { signal: AbortSignal.timeout(3500) });
      if (!response.ok) return [];
      const payload = JSON.parse(new TextDecoder("gbk").decode(await response.arrayBuffer()));
      const suggestions = Array.isArray(payload?.[1])
        ? payload[1].filter((item) => typeof item === "string" && item.trim()).slice(0, 8)
        : [];
      searchSuggestionCache.set(cacheKey, {
        suggestions,
        expiresAt: Date.now() + SEARCH_SUGGESTION_CACHE_TTL,
      });
      return suggestions;
    }
    const { language = "zh-CN" } = await userLocalePromise;
    const url = new URL("https://api.bing.com/osjson.aspx");
    url.searchParams.set("query", query);
    url.searchParams.set("language", language);
    const response = await fetch(url, {
      headers: { "Accept": "application/json" },
      signal: AbortSignal.timeout(3500),
    });
    if (response.status === 429) {
      searchSuggestionCooldownUntil = Date.now() + 30 * 60 * 1000;
      return [];
    }
    if (!response.ok) return [];
    const payload = await response.json();
    const suggestions = Array.isArray(payload?.[1])
      ? payload[1].filter((item) => typeof item === "string" && item.trim()).slice(0, 8)
      : [];
    searchSuggestionCache.set(cacheKey, {
      suggestions,
      expiresAt: Date.now() + SEARCH_SUGGESTION_CACHE_TTL,
    });
    if (searchSuggestionCache.size > 200) {
      searchSuggestionCache.delete(searchSuggestionCache.keys().next().value);
    }
    return suggestions;
  } catch {
    return [];
  }
}

function registerBrowserIpc() {
  const isTrustedSender = (event) =>
    Boolean(mainWindow && !mainWindow.isDestroyed() && event.sender === mainWindow.webContents);

  ipcMain.on("bean-browser:page-interaction", (event, interactionType) => {
    if (!browserView || browserView.webContents.isDestroyed()) return;
    if (event.sender !== browserView.webContents) return;
    if (interactionType !== "top-edge-change") publishBrowserActivation();
    if (["wheel", "scroll", "touchstart", "top-edge-change"].includes(interactionType)) {
      clearTimeout(pageEdgeColorUpdateTimer);
      pageEdgeColorUpdateTimer = setTimeout(() => updatePageBackgroundColor(), 90);
    }
  });

  ipcMain.handle("bean-browser:get-state", (event) =>
    isTrustedSender(event) ? getBrowserState() : null,
  );
  ipcMain.handle("bean-browser:preconnect", (event, input) => {
    if (!isTrustedSender(event)) return false;
    const url = normalizeBrowserInput(input);
    if (!url || !/^https?:\/\//i.test(url)) return false;
    try {
      session.fromPartition("persist:bean-browser").preconnect({ numSockets: 1, url });
      return true;
    } catch {
      return false;
    }
  });
  ipcMain.handle("bean-browser:close-tab-view", (event, tabId) => {
    if (!isTrustedSender(event) || typeof tabId !== "string") return false;
    const view = browserViews.get(tabId);
    if (!view) return false;
    browserViews.delete(tabId);
    if (view === browserView) browserView = undefined;
    if (!view.webContents.isDestroyed()) view.webContents.close();
    return true;
  });
  ipcMain.handle("bean-browser:capture-preview", async (event) => {
    if (!isTrustedSender(event) || !browserView || browserView.webContents.isDestroyed()) return "";
    try {
      return (await browserView.webContents.capturePage()).toDataURL();
    } catch {
      return "";
    }
  });
  ipcMain.handle("bean-browser:navigate", (event, input, tabId) =>
    isTrustedSender(event) ? navigateBrowser(input, tabId) : false,
  );
  ipcMain.handle("bean-browser:navigate-image", (event, input, tabId) =>
    isTrustedSender(event)
      ? navigateBrowserUrl(normalizeImageSourceUrl(input), tabId)
      : false,
  );
  ipcMain.handle("bean-browser:list-downloads", (event) =>
    isTrustedSender(event) ? getDownloadRecords() : [],
  );
  ipcMain.handle("bean-browser:toggle-downloads", (event, anchorBounds) =>
    isTrustedSender(event) ? toggleDownloadsWindow(anchorBounds) : { open: false },
  );
  ipcMain.handle("bean-browser:back", (event) => {
    if (!isTrustedSender(event) || !browserView?.webContents.navigationHistory.canGoBack()) return false;
    browserView.webContents.navigationHistory.goBack();
    return true;
  });
  ipcMain.handle("bean-browser:forward", (event) => {
    if (!isTrustedSender(event) || !browserView?.webContents.navigationHistory.canGoForward()) return false;
    browserView.webContents.navigationHistory.goForward();
    return true;
  });
  ipcMain.handle("bean-browser:reload", (event) => {
    if (!isTrustedSender(event) || !browserView) return false;
    if (browserErrorPageActive && browserDisplayUrl) {
      return navigateBrowserUrl(browserDisplayUrl, browserOwnerTabId);
    }
    browserView.webContents.reload();
    return true;
  });
  ipcMain.handle("bean-browser:get-app-info", (event) => {
    if (!isTrustedSender(event)) return null;
    return {
      chrome: process.versions.chrome,
      electron: process.versions.electron,
      name: app.getName(),
      version: app.getVersion(),
    };
  });
  ipcMain.handle("bean-browser:choose-download-directory", async (event) => {
    if (!isTrustedSender(event)) return { status: "error" };
    const result = await dialog.showOpenDialog(mainWindow, {
      defaultPath: app.getPath("downloads"),
      properties: ["openDirectory", "createDirectory"],
      title: "选择下载位置",
    });
    if (result.canceled || !result.filePaths[0]) return { status: "cancelled" };
    app.setPath("downloads", result.filePaths[0]);
    return { path: result.filePaths[0], status: "selected" };
  });
  ipcMain.handle("bean-browser:set-download-directory", async (event, directory) => {
    if (!isTrustedSender(event) || typeof directory !== "string" || !directory) return false;
    try {
      const details = await stat(directory);
      if (!details.isDirectory()) return false;
      app.setPath("downloads", directory);
      return true;
    } catch {
      return false;
    }
  });
  ipcMain.handle("bean-browser:search-vane", async (event, payload) => {
    if (!isTrustedSender(event)) {
      return { status: "error", message: "搜索请求未获授权。" };
    }
    return await searchWithVane(payload);
  });
  ipcMain.handle("bean-browser:brief-sync-signals", async (event, payload) => {
    if (!isTrustedSender(event)) return { status: "error", message: "简报画像同步未获授权。" };
    const result = await briefService.syncSignals(payload);
    briefService.maybeGenerateCurrent().catch(() => {});
    return result;
  });
  ipcMain.handle("bean-browser:brief-get-edition", async (event, payload) => {
    if (!isTrustedSender(event)) return { status: "error", message: "简报请求未获授权。" };
    if (payload?.background) return await briefService.refreshEditionInBackground(payload);
    return await briefService.getEdition(payload);
  });
  ipcMain.handle("bean-browser:brief-get-report", async (event, payload) => {
    if (!isTrustedSender(event)) return { status: "error", message: "专报请求未获授权。" };
    return await briefService.getReport(payload || {});
  });
  ipcMain.handle("bean-browser:brief-save-preferences", async (event, payload) => {
    if (!isTrustedSender(event)) return { mutedTopicIds: [], pinnedTopicIds: [], reducedTopicIds: [] };
    return await briefService.savePreferences(payload || {});
  });
  ipcMain.handle("bean-browser:ask-current-page", async (event, payload) => {
    if (!isTrustedSender(event)) {
      return { status: "error", message: "页面提问请求未获授权。" };
    }
    return await askCurrentPageWithBoundModel(payload);
  });
  ipcMain.handle("bean-browser:suggest-queries", async (event, input) =>
    isTrustedSender(event) ? await fetchSearchSuggestions(input) : [],
  );
  ipcMain.handle("bean-browser:list-model-providers", async (event) => {
    if (!isTrustedSender(event)) return [];
    return sanitizeModelProviders(await readModelGuardStore());
  });
  ipcMain.handle("bean-browser:save-model-provider", async (event, payload) => {
    if (!isTrustedSender(event)) return { status: "error", message: "请求未获授权。" };
    return await saveModelProvider(payload);
  });
  ipcMain.handle("bean-browser:set-default-model-provider", async (event, id) => {
    if (!isTrustedSender(event) || typeof id !== "string") return [];
    const store = await readModelGuardStore();
    if (store.providers.some((provider) => provider.id === id)) {
      store.defaultId = id;
      await writeModelGuardStore(store);
    }
    return sanitizeModelProviders(store);
  });
  ipcMain.handle("bean-browser:delete-model-provider", async (event, id) => {
    if (!isTrustedSender(event) || typeof id !== "string") return [];
    const store = await readModelGuardStore();
    store.providers = store.providers.filter((provider) => provider.id !== id);
    if (!store.providers.some((provider) => provider.id === store.defaultId)) {
      store.defaultId = store.providers[0]?.id || "";
    }
    await writeModelGuardStore(store);
    return sanitizeModelProviders(store);
  });
  ipcMain.handle("bean-browser:list-bookmark-sources", async (event) => {
    if (!isTrustedSender(event)) return [];
    const { listBookmarkSources } = await loadBrowserToolsModule();
    return await listBookmarkSources();
  });
  ipcMain.handle("bean-browser:import-bookmarks", async (event, sourceIds) => {
    if (!isTrustedSender(event)) return { bookmarks: [], errors: ["Unauthorized"] };
    const ids = Array.isArray(sourceIds)
      ? sourceIds.filter((value) => typeof value === "string").slice(0, 12)
      : [];
    const { importDetectedBookmarks } = await loadBrowserToolsModule();
    return await importDetectedBookmarks(ids);
  });
  ipcMain.handle("bean-browser:import-bookmarks-html", async (event) => {
    if (!isTrustedSender(event)) {
      return { bookmarks: [], canceled: true, errors: ["Unauthorized"] };
    }
    const { importBookmarksFromHtml } = await loadBrowserToolsModule();
    return await importBookmarksFromHtml(mainWindow);
  });
  ipcMain.handle("bean-browser:print", async (event) => {
    if (!isTrustedSender(event) || !browserView) {
      return { status: "error", message: "Printing is not available right now." };
    }
    return await new Promise((resolve) => {
      browserView.webContents.print(
        { printBackground: true },
        (success, failureReason) => resolve(
          success
            ? { status: "printed" }
            : { status: "error", message: failureReason || "Printing was canceled." },
        ),
      );
    });
  });
  ipcMain.handle("bean-browser:screenshot", async (event, mode) => {
    if (!isTrustedSender(event) || !browserView) {
      return { status: "error", message: "Screenshot is not available right now." };
    }
    const screenshotMode = ["selection", "visible", "full-page"].includes(mode)
      ? mode
      : "visible";
    try {
      const { captureAndSaveScreenshot } = await loadBrowserToolsModule();
      return await captureAndSaveScreenshot({
        mode: screenshotMode,
        webContents: browserView.webContents,
        window: mainWindow,
      });
    } catch (error) {
      console.error("[screenshot]", error instanceof Error ? error.message : String(error));
      return {
        status: "error",
        message: error instanceof Error ? error.message : "Screenshot failed.",
      };
    }
  });
  ipcMain.handle("bean-browser:open-incognito", (event) => {
    if (!isTrustedSender(event)) return false;
    createIncognitoWindow(browserView?.webContents.getURL());
    return true;
  });
  ipcMain.handle("bean-browser:export-article-pdf", async (event) => {
    if (!isTrustedSender(event) || !browserView || pdfExportInProgress) {
      return { status: "error", message: "PDF export is not available right now." };
    }

    pdfExportInProgress = true;
    try {
      const {
        createPdfFilename,
        extractReadableArticle,
        renderArticlePdf,
      } = await loadArticlePdfModule();
      const article = await extractReadableArticle(browserView.webContents);
      const saveResult = await dialog.showSaveDialog(mainWindow, {
        defaultPath: path.join(app.getPath("documents"), createPdfFilename(article.title)),
        filters: [{ name: "PDF document", extensions: ["pdf"] }],
        properties: ["createDirectory", "showOverwriteConfirmation"],
        title: "Save clean article as PDF",
      });

      if (saveResult.canceled || !saveResult.filePath) {
        return { status: "canceled" };
      }

      const pdf = await renderArticlePdf(article);
      await writeFile(saveResult.filePath, pdf);
      return { status: "saved" };
    } catch (error) {
      console.error(
        "[pdf-export]",
        error instanceof Error ? error.message : String(error),
      );
      return {
        status: "error",
        message: error instanceof Error
          ? error.message
          : "The article could not be converted to PDF.",
      };
    } finally {
      pdfExportInProgress = false;
    }
  });
  ipcMain.on("bean-browser:set-bounds", (event, bounds) => {
    if (isTrustedSender(event)) setBrowserBounds(bounds);
  });
  ipcMain.on("bean-browser:set-visible", (event, visible) => {
    if (isTrustedSender(event)) setBrowserViewVisible(visible);
  });

  const getIncognitoContext = (event) => incognitoContexts.get(event.sender.id);
  ipcMain.handle("bean-incognito:navigate", (event, input) =>
    getIncognitoContext(event)?.navigate(input) || false,
  );
  ipcMain.handle("bean-incognito:back", (event) => {
    const context = getIncognitoContext(event);
    if (!context?.view.webContents.navigationHistory.canGoBack()) return false;
    context.view.webContents.navigationHistory.goBack();
    return true;
  });
  ipcMain.handle("bean-incognito:forward", (event) => {
    const context = getIncognitoContext(event);
    if (!context?.view.webContents.navigationHistory.canGoForward()) return false;
    context.view.webContents.navigationHistory.goForward();
    return true;
  });
  ipcMain.handle("bean-incognito:reload", (event) => {
    const context = getIncognitoContext(event);
    if (!context) return false;
    context.view.webContents.reload();
    return true;
  });
}

function createWindow() {
  const initialWindowWidth = 1440;
  const windowButtonRightInset = 70;
  const windowButtonTopInset = 16;
  const window = new BrowserWindow({
    title: "Brizo",
    icon: appIconPath,
    width: initialWindowWidth,
    height: 960,
    minWidth: 760,
    minHeight: 640,
    show: false,
    backgroundColor: "#f8f9f7",
    ...(process.platform === "darwin" ? {
      titleBarStyle: "hidden",
      trafficLightPosition: {
        x: initialWindowWidth - windowButtonRightInset,
        y: windowButtonTopInset,
      },
    } : {}),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: shellSmokeTest ? undefined : preloadEntry,
      sandbox: true,
    },
  });

  mainWindow = window;
  const positionMacWindowButtons = () => {
    if (process.platform !== "darwin" || window.isDestroyed()) return;
    const { width } = window.getContentBounds();
    window.setWindowButtonPosition({
      x: Math.max(12, width - windowButtonRightInset),
      y: windowButtonTopInset,
    });
  };
  positionMacWindowButtons();
  window.on("resize", positionMacWindowButtons);
  window.on("focus", () => { briefService.maybeGenerateCurrent().catch(() => {}); });
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (event, url) => {
    if (!url.startsWith("file://")) event.preventDefault();
  });
  window.webContents.on("before-input-event", (event, input) => {
    if (!input.meta || input.type !== "keyDown") return;
    const key = input.key.toLowerCase();
    if (key === "p" && !input.shift && browserView) {
      event.preventDefault();
      browserView.webContents.print({ printBackground: true });
    }
    if (key === "n" && input.shift) {
      event.preventDefault();
      createIncognitoWindow(browserView?.webContents.getURL());
    }
  });

  window.webContents.once("did-fail-load", (_event, errorCode, errorDescription) => {
    if (headlessTest) {
      failTest(`renderer failed to load (${errorCode}): ${errorDescription}`);
    }
  });

  window.webContents.once("did-finish-load", async () => {
    if (startupBenchmark) {
      console.log(`[startup-benchmark] ${JSON.stringify({ milliseconds: Date.now() - processStartedAt })}`);
      app.exit(0);
      return;
    }
    if (shellSmokeTest) {
      try {
        const result = await window.webContents.executeJavaScript(`
          (async () => {
            const startup = {
              addressValue: document.querySelector(".address-bar input")?.value ?? "",
              heading: document.querySelector(".new-tab-compose h1")?.textContent?.trim() ?? "",
              newTabVisible: Boolean(document.querySelector(".new-tab-page")),
              tabCount: document.querySelectorAll(".top-tab").length,
            };
            document.querySelector('.new-tab-button')?.click();
            await new Promise((resolve) => setTimeout(resolve, 40));
            const initialExpandedFolderCount =
              document.querySelectorAll('.bookmark-folder-row[aria-expanded="true"]').length;
            const bookmarkSidebar = document.querySelector(".bookmark-sidebar-body");
            document.querySelector(".spaces-panel")?.dispatchEvent(
              new PointerEvent("pointerover", { bubbles: true }),
            );
            // Folder interaction intentionally activates only after the 180 ms
            // collapsed-to-expanded sidebar transition has completed.
            await new Promise((resolve) => setTimeout(resolve, 200));
            const rootBookmarkLinkCount =
              bookmarkSidebar?.querySelectorAll(":scope > .bookmark-link-row").length || 0;
            const firstRootItemIsBookmark =
              bookmarkSidebar?.firstElementChild?.classList.contains("bookmark-link-row") || false;
            const hasVisibleBookmarkBarFolder = [
              ...document.querySelectorAll(".bookmark-folder-row .bookmark-tree-copy"),
            ].some((element) => element.textContent.trim() === "书签栏");
            for (let depth = 0; depth < 8; depth += 1) {
              if (document.querySelector(".bookmark-link-row")) break;
              const collapsedFolder = document.querySelector(
                '.bookmark-folder-row[aria-expanded="false"]',
              );
              collapsedFolder?.click();
              await new Promise((resolve) => setTimeout(resolve, 10));
            }
            const bookmarkLinkCount = document.querySelectorAll(".bookmark-link-row").length;
            const bookmarkFaviconCount =
              document.querySelectorAll(".bookmark-link-row .bookmark-favicon img").length;
            const firstBookmarkRow = document.querySelector(".bookmark-link-row");
            const firstBookmarkCopy = firstBookmarkRow?.querySelector(".bookmark-tree-copy");
            const firstBookmarkFavicon = firstBookmarkRow?.querySelector(".bookmark-favicon");
            const bookmarkCenterDelta = firstBookmarkCopy && firstBookmarkFavicon
              ? Math.abs(
                firstBookmarkCopy.getBoundingClientRect().top
                  + firstBookmarkCopy.getBoundingClientRect().height / 2
                  - firstBookmarkFavicon.getBoundingClientRect().top
                  - firstBookmarkFavicon.getBoundingClientRect().height / 2
              )
              : 99;
            const draggableBookmarkCount = document.querySelectorAll(
              '.bookmark-folder-row[draggable="true"], .bookmark-link-row[draggable="true"]',
            ).length;
            bookmarkSidebar?.dispatchEvent(new Event("scroll"));
            await new Promise((resolve) => setTimeout(resolve, 20));
            const appScrollbarActive =
              bookmarkSidebar?.classList.contains("is-scrolling") || false;
            return {
            startup,
            title: document.title,
            uiFontFamily: getComputedStyle(document.documentElement).fontFamily,
            hasRoot: Boolean(document.querySelector("#root")),
            hasApp: Boolean(document.querySelector(".app-shell")),
            brandAssetsLoaded: (() => {
              const mark = document.querySelector(".brizo-mark");
              const wordmark = document.querySelector(".brizo-wordmark");
              const markUrl = decodeURIComponent(mark?.currentSrc || "");
              const wordmarkUrl = decodeURIComponent(wordmark?.currentSrc || "");
              return Boolean(
                mark?.complete
                && wordmark?.complete
                && mark.naturalWidth > 0
                && wordmark.naturalWidth > 0
                && /\\/logo(?:-[^/]+)?\\.png$/.test(markUrl)
                && /\\/logo brizo(?:-[^/]+)?\\.png$/.test(wordmarkUrl),
              );
            })(),
            heading: document.querySelector("h1")?.textContent?.trim() ?? "",
            addressValue: document.querySelector(".address-bar input")?.value ?? "",
            appScrollbarActive,
            bookmarkFaviconCount,
            bookmarkLinkCount,
            bookmarkCenterDelta,
            bookmarkSidebarWidth: Math.round(
              document.querySelector(".spaces-panel")?.getBoundingClientRect().width || 0,
            ),
            draggableBookmarkCount,
            initialExpandedFolderCount,
            firstRootItemIsBookmark,
            hasVisibleBookmarkBarFolder,
            rootBookmarkLinkCount,
            bookmarkModeControlsRemoved: !document.querySelector(
              ".bookmark-explorer-controls, .bookmark-mode-menu, .smart-bookmarks-placeholder",
            ),
            tabCount: document.querySelectorAll(".top-tab").length,
            draggablePageTabs: [...document.querySelectorAll(".top-tab")]
              .every((tab) => tab.draggable),
            tabListDragRegion: getComputedStyle(
              document.querySelector(".top-tab-list"),
            ).webkitAppRegion === "drag",
            tabNoDragRegion: getComputedStyle(
              document.querySelector(".top-tab"),
            ).webkitAppRegion === "no-drag",
            toolbarDragRegion: getComputedStyle(
              document.querySelector(".browser-toolbar"),
            ).webkitAppRegion === "drag",
            legacyTopTabControlsRemoved: !document.querySelector(
              '.top-tabs-bar [aria-label="Search web and saved sources"], .tab-count-button',
            ),
            tabsAboveAddress: (() => {
              const tabStrip = document.querySelector(".top-tabs-bar");
              const addressBar = document.querySelector(".address-bar");
              if (!tabStrip || !addressBar) return false;
              return tabStrip.getBoundingClientRect().bottom
                <= addressBar.getBoundingClientRect().top;
            })(),
            activeTabTopRadius: parseFloat(
              getComputedStyle(document.querySelector(".top-tab.active"))
                .borderTopLeftRadius || "0",
            ),
            activeTabHeightRatio: (() => {
              const activeTab = document.querySelector(".top-tab.active");
              const inactiveTab = document.querySelector(".top-tab:not(.active)");
              if (!activeTab || !inactiveTab) return 0;
              return activeTab.getBoundingClientRect().height
                / inactiveTab.getBoundingClientRect().height;
            })(),
            activeTabMatchesPageBackground: (() => {
              const activeFill = document.querySelector(".top-tab-outline-fill");
              const tabStrip = document.querySelector(".top-tabs-bar");
              if (!activeFill || !tabStrip) return false;
              const expected = getComputedStyle(tabStrip)
                .getPropertyValue("--page-background-color")
                .trim();
              const probe = document.createElement("span");
              probe.style.color = expected;
              document.body.appendChild(probe);
              const expectedColor = getComputedStyle(probe).color;
              probe.remove();
              return getComputedStyle(activeFill).fill === expectedColor;
            })(),
            activeTabHasBottomShoulders: (() => {
              const outline = document.querySelector(".top-tab-outline");
              const stroke = outline?.querySelector(".top-tab-outline-stroke");
              const path = stroke?.getAttribute("d") || "";
              return Boolean(
                outline
                && stroke
                && (path.match(/A 11 11/g) || []).length === 2
                && (path.match(/A 8 8/g) || []).length === 2,
              );
            })(),
            activeTabAndAddressHaveLightBorders: (() => {
              const activeStroke = document.querySelector(".top-tab-outline-stroke");
              const addressBar = document.querySelector(".address-bar");
              if (!activeStroke || !addressBar) return false;
              const activeBorder = getComputedStyle(activeStroke).stroke;
              const addressBorder = getComputedStyle(addressBar).borderTopColor;
              return activeBorder === "rgb(212, 216, 211)"
                && addressBorder === "rgb(217, 221, 216)";
            })(),
            activeTabOutlineJoinsToolbar: (() => {
              const activeTab = document.querySelector(".top-tab.active");
              const toolbar = document.querySelector(".browser-toolbar");
              const tabStrip = document.querySelector(".top-tabs-bar");
              const tabList = document.querySelector(".top-tab-list");
              const outline = document.querySelector(".top-tab-outline");
              const stroke = outline?.querySelector(".top-tab-outline-stroke");
              if (!activeTab || !toolbar || !tabStrip || !tabList || !stroke) return false;
              const activeStyle = getComputedStyle(activeTab);
              const toolbarStyle = getComputedStyle(toolbar);
              const activeRect = activeTab.getBoundingClientRect();
              const toolbarRect = toolbar.getBoundingClientRect();
              const strokeStyle = getComputedStyle(stroke);
              const strokePath = stroke.getAttribute("d") || "";
              return activeStyle.borderBottomWidth === "0px"
                && toolbarStyle.borderTopWidth === "0px"
                && getComputedStyle(tabList).zIndex === "auto"
                && Number(activeStyle.zIndex) > Number(getComputedStyle(outline).zIndex)
                && Math.abs(activeRect.bottom - toolbarRect.top) <= 0.5
                && strokeStyle.fill === "none"
                && (strokePath.match(/M /g) || []).length === 1
                && !strokePath.includes(" Z");
            })(),
            imageLoaded: (() => {
              const image = document.querySelector(".protein-figure img");
              return Boolean(image && image.complete && image.naturalWidth > 0);
            })()
            };
          })()
        `);

        result.pageAskTool = await window.webContents.executeJavaScript(`
          (() => {
            const trigger = document.querySelector('[aria-label="询问当前页面"]');
            const disabledOnNewTab = Boolean(trigger?.disabled);
            const fixture = document.createElement('div');
            fixture.className = 'settings-dialog-content';
            fixture.style.cssText = 'position:fixed;left:-10000px;top:0;width:520px';
            fixture.innerHTML = '<form class="page-ask-form">'
              + '<article class="page-ask-answer"><div class="new-tab-answer-bullet"><span>•</span><p><strong>要点：</strong>'
              + '这是一段用于验证页面回答不会横向溢出的超长中文内容'.repeat(80)
              + '</p></div></article>'
              + '<div class="settings-dialog-actions"><button>关闭</button><button>Ask Brizo</button></div>'
              + '</form>';
            document.body.appendChild(fixture);
            const form = fixture.querySelector('.page-ask-form');
            const fits = form.scrollWidth <= form.clientWidth + 1
              && fixture.scrollWidth <= fixture.clientWidth + 1;
            fixture.remove();
            return { available: Boolean(trigger), disabledOnNewTab, fits };
          })()
        `);

        result.macWindowButtonsRightAligned = process.platform !== "darwin" || (() => {
          const position = window.getWindowButtonPosition();
          return Boolean(
            position
            && Math.abs(position.x - (window.getContentBounds().width - windowButtonRightInset)) <= 1
            && position.y === windowButtonTopInset,
          );
        })();
        result.newTabDefault = await window.webContents.executeJavaScript(`
          (async () => {
            document.querySelector(".new-tab-button")?.click();
            await new Promise((resolve) => setTimeout(resolve, 40));
            document.querySelector('[aria-label="插入已有标签页"]')?.click();
            await new Promise((resolve) => setTimeout(resolve, 20));
            const surface = document.querySelector(".new-tab-command-surface");
            const beam = surface?.parentElement?.matches('[data-beam]')
              ? surface.parentElement
              : null;
            const insertButton = document.querySelector('[aria-label="插入文件或图片"]');
            const submitButton = document.querySelector('.new-tab-submit-button');
            const surfaceRect = surface?.getBoundingClientRect();
            const insertRect = insertButton?.getBoundingClientRect();
            const submitRect = submitButton?.getBoundingClientRect();
            return {
              addressPlaceholder: document.querySelector('.address-bar input')?.placeholder || "",
              bottomInsetLeft: Math.round((surfaceRect?.bottom || 0) - (insertRect?.bottom || 0)),
              bottomInsetRight: Math.round((surfaceRect?.bottom || 0) - (submitRect?.bottom || 0)),
              beamActive: beam?.hasAttribute('data-active') || false,
              beamStrength: beam?.style.getPropertyValue('--beam-strength') || "",
              beamWidth: Math.round(beam?.getBoundingClientRect().width || 0),
              contextMenuItems: document.querySelectorAll('.new-tab-tab-menu [role="menuitem"]').length,
              heading: document.querySelector(".new-tab-compose h1")?.textContent?.trim() || "",
              leftInset: Math.round((insertRect?.left || 0) - (surfaceRect?.left || 0)),
              modelOptions: document.querySelectorAll('.new-tab-model-menu [role="menuitemradio"]').length,
              rightInset: Math.round((surfaceRect?.right || 0) - (submitRect?.right || 0)),
              surfaceHeight: Math.round(surfaceRect?.height || 0),
              surfaceWidth: Math.round(surface?.getBoundingClientRect().width || 0),
              tabCount: document.querySelectorAll(".top-tab").length
            };
          })()
        `);
        result.brief = await window.webContents.executeJavaScript(`
          (async () => {
            const plus = document.querySelector('.new-tab-button');
            const brief = document.querySelector('.brief-utility-tab');
            const tabCountBefore = document.querySelectorAll('.top-tab').length;
            const fixedAfterPlus = brief?.previousElementSibling === plus;
            brief?.click();
            await new Promise((resolve) => setTimeout(resolve, 90));
            const stream = document.querySelector('.brief-stream');
            if (stream) stream.scrollTop = 320;
            await new Promise((resolve) => setTimeout(resolve, 80));
            const scrollBeforeReport = stream?.scrollTop || 0;
            document.querySelector('.brief-stream-story button')?.click();
            await new Promise((resolve) => setTimeout(resolve, 80));
            const reportOpened = Boolean(document.querySelector('.brief-report-layer'));
            document.querySelector('.brief-report-layer > header button')?.click();
            await new Promise((resolve) => setTimeout(resolve, 40));
            const categoryLabels = [...document.querySelectorAll('.brief-stream-sidebar button')].map((button) => button.textContent.trim());
            const scrollAfterReport = stream?.scrollTop || 0;
            document.querySelector('.top-tab-select')?.click();
            await new Promise((resolve) => setTimeout(resolve, 40));
            return {
              categoryLabels,
              fixedAfterPlus,
              fixedTabCount: document.querySelectorAll('.brief-utility-tab').length,
              hasClose: Boolean(brief?.querySelector('.top-tab-close')),
              hasInfiniteSentinel: Boolean(document.querySelector('.brief-stream-loader')),
              hasMarketWidgets: Boolean(document.querySelector('.brief-market-widget, .brief-weather-widget')),
              isDraggable: brief?.draggable || false,
              leadHasExcerpt: (document.querySelector('.brief-stream-story-lead p')?.textContent?.trim().length || 0) > 20,
              reportOpened,
              scrollAfterReport,
              scrollBeforeReport,
              scrollRestored: Math.abs(scrollAfterReport - scrollBeforeReport) <= 2,
              streamExists: Boolean(stream),
              restoredNormalTab: Boolean(document.querySelector('.top-tab.active')),
              tabCountBefore,
            };
          })()
        `);
        const passed =
          result.title === "Brizo" &&
          result.uiFontFamily.includes("Brizo EB Garamond") &&
          result.hasRoot &&
          result.hasApp &&
          result.brandAssetsLoaded &&
          result.heading.length > 0 &&
          result.appScrollbarActive &&
          result.bookmarkFaviconCount > 0 &&
          result.bookmarkLinkCount > 0 &&
          result.bookmarkCenterDelta <= 1 &&
          result.bookmarkSidebarWidth === 150 &&
          result.draggableBookmarkCount > 0 &&
          result.initialExpandedFolderCount === 0 &&
          result.tabsAboveAddress &&
          result.activeTabTopRadius === 8 &&
          Math.abs(result.activeTabHeightRatio - (37.4 / 30.6)) <= 0.002 &&
          result.activeTabMatchesPageBackground &&
          result.activeTabHasBottomShoulders &&
          result.activeTabAndAddressHaveLightBorders &&
          result.activeTabOutlineJoinsToolbar &&
          !result.hasVisibleBookmarkBarFolder &&
          result.bookmarkModeControlsRemoved &&
          result.startup.addressValue === "" &&
          result.startup.heading.startsWith("今天") &&
          result.startup.newTabVisible &&
          result.startup.tabCount === 1 &&
          result.tabCount === 2 &&
          result.draggablePageTabs &&
          result.tabListDragRegion &&
          result.tabNoDragRegion &&
          result.toolbarDragRegion &&
          result.pageAskTool.available &&
          result.pageAskTool.disabledOnNewTab &&
          result.pageAskTool.fits &&
          result.legacyTopTabControlsRemoved &&
          result.macWindowButtonsRightAligned &&
          result.newTabDefault.addressPlaceholder === "搜索或输入网址" &&
          result.newTabDefault.contextMenuItems === 0 &&
          Math.abs(result.newTabDefault.bottomInsetLeft - result.newTabDefault.bottomInsetRight) <= 1 &&
          result.newTabDefault.beamActive &&
          result.newTabDefault.beamStrength === "0.7" &&
          result.newTabDefault.beamWidth === 760 &&
          result.newTabDefault.heading.length > 0 &&
          !result.newTabDefault.heading.startsWith("今天") &&
          Math.abs(result.newTabDefault.leftInset - result.newTabDefault.rightInset) <= 1 &&
          result.newTabDefault.surfaceHeight === 132 &&
          result.newTabDefault.surfaceWidth === 760 &&
          result.newTabDefault.tabCount === 3 &&
          result.brief.fixedAfterPlus &&
          result.brief.fixedTabCount === 1 &&
          !result.brief.hasClose &&
          !result.brief.isDraggable &&
          result.brief.streamExists &&
          result.brief.hasInfiniteSentinel &&
          result.brief.leadHasExcerpt &&
          !result.brief.hasMarketWidgets &&
          ["科学与技术", "商业", "艺术与文化", "体育", "娱乐"].every((label) => result.brief.categoryLabels.includes(label)) &&
          result.brief.reportOpened &&
          result.brief.scrollRestored &&
          result.brief.restoredNormalTab &&
          result.brief.tabCountBefore === 3 &&
          !result.addressValue.includes("://") &&
          !result.addressValue.startsWith("www.");

        console.log(`[desktop-smoke] ${JSON.stringify(result)}`);
        app.exit(passed ? 0 : 1);
      } catch (error) {
        failTest(error instanceof Error ? error.message : String(error));
      }
      return;
    }

    if (browserSmokeTest) {
      const { parseChromiumBookmarkObject } = await loadBrowserToolsModule();
      const importFixture = parseChromiumBookmarkObject({
        roots: {
          bookmark_bar: {
            children: [{
              children: [{
                name: "Bar page",
                type: "url",
                date_added: "13348540800000000",
                url: "https://bar.example/",
              }],
              name: "书签栏",
              type: "folder",
            }],
            name: "Bookmarks bar",
            type: "folder",
          },
          other: {
            children: [{
              name: "Other page",
              type: "url",
              url: "https://other.example/",
            }],
            name: "Other bookmarks",
            type: "folder",
          },
        },
      }, "chrome");
      const bridgeCheck = await window.webContents.executeJavaScript(`
        (async () => {
          const api = window.beanBrowser;
          const requiredMethods = [
            "capturePreview",
            "captureScreenshot",
            "closeTabView",
            "exportArticlePdf",
            "getAppInfo",
            "getBriefEdition",
            "getBriefReport",
            "importBookmarks",
            "deleteModelProvider",
            "importBookmarksFromHtml",
            "listBookmarkSources",
            "listModelProviders",
            "openIncognito",
            "onBriefEditionUpdated",
            "print",
            "preconnect",
            "saveModelProvider",
            "saveBriefPreferences",
            "searchVane",
            "setDefaultModelProvider",
            "syncBriefSignals"
          ];
          const sources = await api?.listBookmarkSources?.();
          const appInfo = await api?.getAppInfo?.();
          return {
            methodsAvailable: Boolean(api) &&
              requiredMethods.every((method) => typeof api[method] === "function"),
            sourceIds: Array.isArray(sources) ? sources.map((source) => source.id) : [],
            version: appInfo?.version || ""
          };
        })()
      `);
      if (
        !bridgeCheck.methodsAvailable ||
        !["chrome", "safari", "atlas"].every((id) => bridgeCheck.sourceIds.includes(id)) ||
        !bridgeCheck.version ||
        importFixture.map((bookmark) => bookmark.folder).join(",") !== ",其他书签" ||
        importFixture[0]?.createdAt <= 0 ||
        !importFixture.every((bookmark) => bookmark.faviconUrl)
      ) {
        failTest("desktop preload bridge is unavailable");
        return;
      }
    }

    if (shellSmokeTest || browserSmokeTest || pdfSmokeTest) {
      const view = createBrowserView(window, "__smoke__");
      browserViews.set("__smoke__", view);
    }
  });

  window.once("ready-to-show", () => {
    if (!headlessTest) window.show();
  });

  window.on("closed", () => {
    for (const view of browserViews.values()) {
      if (!view.webContents.isDestroyed()) view.webContents.close();
    }
    browserViews.clear();
    browserView = undefined;
    mainWindow = undefined;
  });

  window.loadFile(rendererEntry);
  return window;
}

app.whenReady().then(() => {
  userLocalePromise = detectUserLocale();
  suggestionRegionPromise = userLocalePromise.then(({ country }) =>
    country === "CN" ? "CN" : "GLOBAL",
  );
  const appIcon = nativeImage.createFromPath(appIconPath);
  if (headlessTest && appIcon.isEmpty()) {
    failTest(`App icon failed to load: ${appIconPath}`);
    return;
  }
  if (process.platform === "darwin" && !appIcon.isEmpty()) {
    app.dock.setIcon(appIcon);
  }
  registerBrowserIpc();
  briefService.startScheduler();
  powerMonitor.on("resume", () => { briefService.maybeGenerateCurrent().catch(() => {}); });
  createWindow();
});

app.on("window-all-closed", () => {
  briefService.stopScheduler();
  app.quit();
});
