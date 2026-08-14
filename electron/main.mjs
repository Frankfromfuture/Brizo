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
  View,
  WebContentsView,
} from "electron";
import { createBriefService } from "./brief-service.mjs";
import {
  parseBrowserCommandAction,
  readBrowserActionCandidates,
  runBrowserCommandAgent,
  snapshotBrowserPage,
} from "./browser-command-agent.mjs";
import {
  buildCtripFlightUrl,
  clearCtripFlightHighlights,
  collectCtripFlightResults,
  highlightCtripFlights,
  parseCtripFlightCommand,
  selectCtripFlights,
  waitForCtripFlightResults,
} from "./ctrip-flight-flow.mjs";
import {
  buildTaobaoSearchUrl,
  clearTaobaoHighlights,
  highlightTaobaoItems,
  parseTaobaoPriceCommand,
  selectDistinctPriceItems,
  taobaoQueryFromUrl,
  waitForTaobaoPriceResults,
} from "./taobao-price-flow.mjs";
import { createAnswerEngine } from "./search/answer-engine.mjs";
import { createBochaClient } from "./search/bocha-client.mjs";
import { createLegacyClient } from "./search/legacy-client.mjs";
import {
  capabilitiesFor,
  createLlmClient,
  thinkingOffParams,
} from "./search/llm-client.mjs";
import { makeResult } from "./search/normalize.mjs";
import { createScrapeCache } from "./search/scrape-cache.mjs";
import { createSearchService } from "./search/search-service.mjs";
import { createSerperClient } from "./search/serper-client.mjs";
import { chooseDeepSeekTextModel, createSmartBookmarkService } from "./smart-bookmark-service.mjs";
import { createPasswordVault } from "./password-vault.mjs";
import { isZhihuSource, languageForInput, matchesRequestedLanguage } from "../shared/search-text.mjs";
import { stripTrailingLinkPunctuation } from "../shared/browser-input.mjs";
import {
  chooseFastModel,
  createModelGuard,
  normalizeModelApiUrl,
  readAssistantMessage,
  sortFastModels,
  withKnownProviderDefaults,
} from "./secret-store.mjs";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { copyFile, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rendererEntry = path.join(projectRoot, "dist", "client", "index.html");
const preloadEntry = path.join(projectRoot, "electron", "preload.cjs");
const browserPagePreloadEntry = path.join(projectRoot, "electron", "browser-page-preload.cjs");
const incognitoEntry = path.join(projectRoot, "electron", "incognito.html");
const incognitoPreloadEntry = path.join(projectRoot, "electron", "incognito-preload.cjs");
const appIconPath = app.isPackaged
  ? path.join(process.resourcesPath, "icon.png")
  : path.join(projectRoot, "build", "icon.png");
function findBundledRendererAsset(stem, extension = "png") {
  const assetsPath = path.join(projectRoot, "dist", "client", "assets");
  const escapedStem = stem.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const escapedExtension = extension.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const assetPattern = new RegExp(`^${escapedStem}-[^.]+\\.${escapedExtension}$`, "i");
  const filename = readdirSync(assetsPath).find((name) => assetPattern.test(name));
  if (!filename) throw new Error(`Bundled renderer asset was not found: ${stem}`);
  return path.join(assetsPath, filename);
}

const loadingLogoPath = app.isPackaged
  ? findBundledRendererAsset("hermes logo", "svg")
  : path.join(projectRoot, "hermes logo.svg");
const browserErrorBackgroundPath = app.isPackaged
  ? findBundledRendererAsset("404")
  : path.join(projectRoot, "404.png");
const shellSmokeTest = process.argv.includes("--smoke-test");
const browserSmokeTest = process.argv.includes("--browser-smoke");
const pdfSmokeTest = process.argv.includes("--pdf-smoke");
const startupBenchmark = process.argv.includes("--startup-benchmark");
const searchSmokeTest = process.argv.includes("--search-smoke");
const configureSearchKeys = process.argv.includes("--configure-search-keys");
const processStartedAt = Date.now();
const headlessTest = shellSmokeTest
  || browserSmokeTest
  || pdfSmokeTest
  || startupBenchmark
  || searchSmokeTest
  || configureSearchKeys;

const hasSingleInstanceLock = headlessTest || app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) app.exit(0);

app.on("second-instance", () => {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
});
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
const browserContentBorderRadius = 15;
const browserFrameInset = 2;
const pdfReaderBackgroundColor = "rgb(63, 63, 63)";
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
let defaultPageZoomFactor = 1;
let pageEdgeColorUpdateTimer;
let exampleLoadingPageUrlPromise;
let browserErrorPageActive = false;
let browserSessionHandlersInstalled = false;
let downloadRecords = [];
const activeDownloads = new Map();
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
const linkBrowserWindows = new Set();
const scrollbarCssKeys = new Map();
const modelGuardPath = () => path.join(app.getPath("userData"), "model-guard.json");
const modelGuard = createModelGuard({ storePath: modelGuardPath, safeStorage, env: process.env });
const readModelGuardStore = modelGuard.readStore;
const writeModelGuardStore = modelGuard.writeStore;
const decryptModelKey = modelGuard.decryptKey;
const sanitizeModelProviders = modelGuard.sanitizeProviders;
const activeSearchControllers = new Map();
const brizoUseSandboxes = new Map();
const brizoUseControllers = new Map();
let appQuitRequested = false;

app.on("before-quit", () => {
  appQuitRequested = true;
});

function createBrizoUseRunControl() {
  const controller = new AbortController();
  const waiters = new Set();
  let paused = false;
  let stateListener = () => {};
  const releaseWaiters = () => {
    for (const resolve of waiters) resolve();
    waiters.clear();
  };
  return {
    get paused() { return paused; },
    get signal() { return controller.signal; },
    abort(reason = new DOMException("Stopped", "AbortError")) {
      paused = false;
      controller.abort(reason);
      releaseWaiters();
    },
    pause() {
      if (controller.signal.aborted) return false;
      if (!paused) {
        paused = true;
        stateListener(true);
      }
      return true;
    },
    resume() {
      if (controller.signal.aborted) return false;
      if (paused) {
        paused = false;
        releaseWaiters();
        stateListener(false);
      }
      return true;
    },
    setStateListener(listener) {
      stateListener = typeof listener === "function" ? listener : () => {};
    },
    async waitIfPaused() {
      controller.signal.throwIfAborted();
      while (paused) {
        await new Promise((resolve) => waiters.add(resolve));
        controller.signal.throwIfAborted();
      }
    },
  };
}
const faviconCacheDirectory = () => path.join(app.getPath("appData"), "bean", "favicon-cache");
const faviconCacheManifestPath = () => path.join(faviconCacheDirectory(), "manifest.json");
let faviconCacheManifestPromise;
let faviconCacheWritePromise = Promise.resolve();

function faviconCacheKey(pageUrl) {
  try {
    const url = new URL(String(pageUrl || ""));
    return ["http:", "https:"].includes(url.protocol) ? url.origin.toLowerCase() : "";
  } catch {
    return "";
  }
}

async function readFaviconCacheManifest() {
  if (!faviconCacheManifestPromise) {
    faviconCacheManifestPromise = (async () => {
      try {
        const parsed = JSON.parse(await readFile(faviconCacheManifestPath(), "utf8"));
        return parsed && typeof parsed === "object" ? parsed : {};
      } catch {
        return {};
      }
    })();
  }
  return await faviconCacheManifestPromise;
}

async function cachedFaviconDataUrl(pageUrl) {
  const key = faviconCacheKey(pageUrl);
  if (!key) return "";
  const manifest = await readFaviconCacheManifest();
  const item = manifest[key];
  if (!item?.file || !item?.mimeType) return "";
  try {
    const bytes = await readFile(path.join(faviconCacheDirectory(), path.basename(item.file)));
    if (!bytes.length) return "";
    return `data:${item.mimeType};base64,${bytes.toString("base64")}`;
  } catch {
    delete manifest[key];
    return "";
  }
}

async function cacheFaviconForPage(pageUrl, faviconUrl) {
  const key = faviconCacheKey(pageUrl);
  const source = String(faviconUrl || "");
  if (!key || !/^(https?:|data:image\/)/i.test(source)) return "";
  const existing = await cachedFaviconDataUrl(pageUrl);
  if (existing) return existing;
  try {
    const response = await fetch(source, {
      headers: /^https?:/i.test(source) ? { "user-agent": "Mozilla/5.0 Brizo/1.0" } : undefined,
      redirect: "follow",
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) return "";
    const bytes = Buffer.from(await response.arrayBuffer());
    if (!bytes.length || bytes.length > 512_000) return "";
    const declaredType = String(response.headers.get("content-type") || "").split(";", 1)[0].trim().toLowerCase();
    const mimeType = declaredType.startsWith("image/") ? declaredType : "image/x-icon";
    const extension = mimeType.includes("svg") ? "svg"
      : mimeType.includes("png") ? "png"
        : mimeType.includes("jpeg") ? "jpg"
          : mimeType.includes("webp") ? "webp"
            : "ico";
    const file = `${createHash("sha256").update(key).digest("hex")}.${extension}`;
    await mkdir(faviconCacheDirectory(), { recursive: true });
    await writeFile(path.join(faviconCacheDirectory(), file), bytes);
    const manifest = await readFaviconCacheManifest();
    manifest[key] = { file, mimeType, source, updatedAt: new Date().toISOString() };
    faviconCacheWritePromise = faviconCacheWritePromise
      .catch(() => {})
      .then(() => writeFile(faviconCacheManifestPath(), JSON.stringify(manifest, null, 2), "utf8"));
    await faviconCacheWritePromise;
    return `data:${mimeType};base64,${bytes.toString("base64")}`;
  } catch {
    return "";
  }
}
const llmClient = createLlmClient({ resolveProvider: resolveBoundModelProvider });
const smartBookmarkStorePath = () => path.join(app.getPath("appData"), "bean", "smart-bookmarks-v1.json");
const smartBookmarkService = createSmartBookmarkService({
  notify: (progress) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("bean-browser:smart-bookmarks-progress", progress);
    }
  },
  readSourceHistory: async (bookmarks) => {
    const { resolveBookmarkVisitWeights } = await loadBrowserToolsModule();
    return await resolveBookmarkVisitWeights(bookmarks);
  },
  resolveDeepSeekProvider,
  storePath: smartBookmarkStorePath(),
});
const briefSerperClient = createSerperClient({ getApiKey: () => modelGuard.readServiceKey("serper") });
const briefBochaClient = createBochaClient({ getApiKey: () => modelGuard.readServiceKey("bocha") });
let scoutSearchService;
const downloadStorePath = () => path.join(app.getPath("userData"), "downloads.json");
const passwordVaultPath = () => path.join(app.getPath("userData"), "password-vault.json");
const passwordVault = createPasswordVault({ safeStorage, storePath: passwordVaultPath });
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
  search: {
    bocha: async (query, options = {}) => {
      const response = await briefBochaClient.webSearch(query, {
        count: options.count || 16,
        freshness: options.freshness || "oneDay",
      });
      return response.results || [];
    },
    serper: async (query, options = {}) => {
      const response = await briefSerperClient.vertical("news", query, {
        gl: options.gl || "cn",
        hl: options.hl || "zh-cn",
        num: options.count || 12,
      });
      return response.items || [];
    },
  },
  userDataPath: app.getPath("userData"),
});

let articlePdfModulePromise;
let browserToolsModulePromise;
let pdfJsModulePromise;

function loadArticlePdfModule() {
  articlePdfModulePromise ??= import("./article-pdf.mjs");
  return articlePdfModulePromise;
}

function loadBrowserToolsModule() {
  browserToolsModulePromise ??= import("./browser-tools.mjs");
  return browserToolsModulePromise;
}

function loadPdfJsModule() {
  pdfJsModulePromise ??= import("pdfjs-dist/legacy/build/pdf.mjs");
  return pdfJsModulePromise;
}

function failTest(message) {
  console.error(`[desktop-test] ${message}`);
  app.exit(1);
}

function readOneJsonLineFromStdin(timeoutMs = 60_000) {
  return new Promise((resolve, reject) => {
    let buffer = "";
    const wasRaw = Boolean(process.stdin.isRaw);
    process.stdin.setRawMode?.(true);
    const cleanup = () => {
      clearTimeout(timeout);
      process.stdin.off("data", onData);
      if (!wasRaw) process.stdin.setRawMode?.(false);
    };
    const onData = (chunk) => {
      buffer += String(chunk || "");
      const newline = buffer.indexOf("\n");
      if (newline < 0) return;
      cleanup();
      try {
        resolve(JSON.parse(buffer.slice(0, newline)));
      } catch {
        reject(new Error("输入格式无效。"));
      }
    };
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error("等待凭据输入超时。"));
    }, timeoutMs);
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", onData);
    process.stdin.resume();
  });
}

function normalizeBrowserInput(input) {
  const value = stripTrailingLinkPunctuation(String(input ?? "").trim()).slice(0, 2048);
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

function normalizePdfSourceUrl(input) {
  const value = String(input ?? "").trim();
  if (!value || value.length > 20_000_000) return null;

  if (path.isAbsolute(value)) return pathToFileURL(value).href;
  try {
    const url = new URL(value);
    if (["http:", "https:", "file:"].includes(url.protocol)) return url.href;
    if (url.protocol === "data:" && /^data:application\/pdf(?:;|,)/i.test(value)) return value;
  } catch {
    // Ignore malformed or unsupported PDF sources.
  }
  return null;
}

function isLikelyPdfUrl(input) {
  const value = String(input || "").trim();
  if (/^data:application\/pdf(?:;|,)/i.test(value)) return true;
  try {
    const parsed = new URL(value);
    return decodeURIComponent(parsed.pathname).toLowerCase().endsWith(".pdf");
  } catch {
    return value.toLowerCase().split(/[?#]/, 1)[0].endsWith(".pdf");
  }
}

function responseHeadersContainPdf(headers) {
  return Object.entries(headers || {}).some(([name, values]) =>
    name.toLowerCase() === "content-type"
    && (Array.isArray(values) ? values : [values]).some((value) =>
      /application\/pdf/i.test(String(value || "")),
    ),
  );
}

function filenameForPdfSource(input, fallback = "document.pdf") {
  try {
    const parsed = new URL(input);
    const filename = path.basename(decodeURIComponent(parsed.pathname));
    return filename.toLowerCase().endsWith(".pdf") ? filename : fallback;
  } catch {
    const filename = path.basename(String(input || ""));
    return filename.toLowerCase().endsWith(".pdf") ? filename : fallback;
  }
}

const imageContextMenuItems = [
  { action: "download", label: "下载图片" },
  { action: "copy-image", label: "复制图片" },
  { action: "copy-address", label: "复制图片地址" },
  { action: "open", label: "在新标签页中打开图片" },
];
const linkContextMenuItems = [
  { action: "copy-link", label: "复制链接地址" },
  { action: "open-link-tab", label: "在新标签页中打开链接" },
  { action: "open-link-window", label: "新窗口打开链接" },
];
const imageLinkContextMenuItems = [
  ...imageContextMenuItems,
  ...linkContextMenuItems.map((item, index) => ({
    ...item,
    separatorBefore: index === 0,
  })),
];
const selectionContextMenuItems = [
  { action: "copy-text", label: "复制文字" },
  { action: "ask-brizo", label: "向 Brizo 询问" },
  { action: "translate", label: "翻译" },
];
const pageContextMenuItems = [
  { action: "back", label: "返回上一页" },
  { action: "reload", label: "重新加载网页" },
  { action: "copy-page-address", label: "复制网页地址", separatorBefore: true },
];
const searchResultContextMenuItems = [
  { action: "copy-search-result", label: "复制搜索结果" },
];
const copyFeedbackContextActions = new Set([
  "copy-address",
  "copy-image",
  "copy-link",
  "copy-page-address",
  "copy-search-result",
  "copy-text",
]);

function menuTypographyCss() {
  if (menuTypographyCssCache !== undefined) return menuTypographyCssCache;
  const directFontPath = path.join(
    projectRoot,
    "src",
    "assets",
    "fonts",
    "HarmonyOS_Sans_SC_Regular.ttf",
  );
  let fontPath = existsSync(directFontPath) ? directFontPath : "";
  if (!fontPath) {
    try {
      const assetsPath = path.join(projectRoot, "dist", "client", "assets");
      const bundledName = readdirSync(assetsPath).find((name) =>
        /^HarmonyOS_Sans_SC_Regular-.*\.ttf$/i.test(name),
      );
      if (bundledName) fontPath = path.join(assetsPath, bundledName);
    } catch {
      // The system-installed HarmonyOS Sans remains the final fallback.
    }
  }
  const source = fontPath
    ? `url("${pathToFileURL(fontPath).href}") format("truetype")`
    : 'local("HarmonyOS Sans SC")';
  menuTypographyCssCache = `
    @font-face {
      font-family: "Brizo HarmonyOS Sans";
      src: ${source};
      font-style: normal;
      font-weight: 400;
    }
  `;
  return menuTypographyCssCache;
}

function createWebContextMenuPageHtml(items, ariaLabel) {
  const links = items.map(({ action, label, separatorBefore }) => `
    ${separatorBefore ? '<span class="separator" aria-hidden="true"></span>' : ""}
    <a href="brizo-context-menu://${action}" data-action="${escapeHtml(action)}" role="menuitem">${label}</a>
  `).join("");
  const html = `<!doctype html>
    <html lang="zh-CN">
      <head>
        <meta charset="utf-8">
        <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; font-src file:">
        <style>
          ${menuTypographyCss()}
          * { box-sizing: border-box; }
          html, body { min-width: 0; min-height: 0; height: auto; margin: 0; overflow: hidden; background: transparent; }
          body {
            width: max-content;
            padding: 16px;
            color: #272727;
            font-family: "Brizo HarmonyOS Sans", "HarmonyOS Sans SC", sans-serif;
            font-size: 12px;
            font-style: normal;
            outline: none;
            -webkit-font-smoothing: antialiased;
          }
          main {
            width: max-content;
            height: auto;
            padding: 8px 5px 8px 7px;
            border: 1px solid rgba(0,0,0,.16);
            border-radius: 10px;
            background: #f8f8f8;
            box-shadow:
              0 4px 10px rgba(0,0,0,.13),
              0 1px 4px rgba(0,0,0,.08);
            transform-origin: top left;
            animation: soft-blur-surface-in 300ms cubic-bezier(.22, 1, .36, 1) both;
          }
          a { position: relative; height: 29px; padding: 0 28px 0 12px; display: flex; align-items: center; border-radius: 8px; color: inherit; font-size: 12px; font-weight: 400; line-height: 29px; text-decoration: none; white-space: nowrap; transition: background-color 120ms ease; animation: soft-blur-item-in 300ms cubic-bezier(.22, 1, .36, 1) both; }
          a::after { content: ""; position: absolute; top: 8px; right: 11px; width: 5px; height: 9px; border-right: 1.5px solid rgba(255,255,255,.96); border-bottom: 1.5px solid rgba(255,255,255,.96); opacity: 0; filter: drop-shadow(0 1px 1px rgba(0,0,0,.12)); transform: rotate(45deg) scale(.55); transform-origin: center; }
          a:nth-of-type(2) { animation-delay: 12ms; }
          a:nth-of-type(3) { animation-delay: 24ms; }
          a:nth-of-type(4) { animation-delay: 36ms; }
          a:nth-of-type(5) { animation-delay: 48ms; }
          a:nth-of-type(n+6) { animation-delay: 60ms; }
          a:hover, a:focus-visible { outline: none; background: rgba(0,0,0,.035); }
          a.is-copy-confirmed { background: rgba(84,91,86,.18); }
          a.is-copy-confirmed::after { animation: copy-check-in 420ms cubic-bezier(.22,1,.36,1) both; }
          .separator { height: 1px; margin: 4px 10px; display: block; background: #d8d8d8; }
          @keyframes soft-blur-surface-in {
            from { opacity: 0; filter: blur(6px); transform: translate3d(0, 8px, 0); }
            to { opacity: 1; filter: blur(0); transform: translate3d(0, 0, 0); }
          }
          @keyframes soft-blur-item-in {
            from { opacity: 0; filter: blur(4px); transform: translate3d(0, 4px, 0); }
            to { opacity: 1; filter: blur(0); transform: translate3d(0, 0, 0); }
          }
          @keyframes copy-check-in {
            0% { opacity: 0; transform: rotate(45deg) scale(.45) translate3d(1px,1px,0); }
            55% { opacity: 1; transform: rotate(45deg) scale(1.08) translate3d(0,0,0); }
            100% { opacity: .92; transform: rotate(45deg) scale(1) translate3d(0,0,0); }
          }
          @media (prefers-reduced-motion: reduce) {
            main, a, a.is-copy-confirmed::after { animation: none; }
            a.is-copy-confirmed::after { opacity: .92; transform: rotate(45deg) scale(1); }
          }
        </style>
      </head>
      <body tabindex="-1"><main role="menu" aria-label="${escapeHtml(ariaLabel)}">${links}</main></body>
    </html>`;
  return html;
}

function showWebContextMenu({ actions, ariaLabel, contentOffset = browserBounds, items, params, window }) {
  webContextMenuWindow?.close();
  const initialWidth = 480;
  const initialHeight = 360;
  const parentBounds = window.getContentBounds();
  const point = {
    x: parentBounds.x + contentOffset.x + params.x,
    y: parentBounds.y + contentOffset.y + params.y,
  };
  const workArea = screen.getDisplayNearestPoint(point).workArea;
  const popup = new BrowserWindow({
    parent: window,
    width: initialWidth,
    height: initialHeight,
    x: Math.min(Math.max(point.x, workArea.x + 8), workArea.x + workArea.width - initialWidth - 8),
    y: Math.min(Math.max(point.y, workArea.y + 8), workArea.y + workArea.height - initialHeight - 8),
    frame: false,
    hasShadow: false,
    opacity: 1,
    resizable: false,
    roundedCorners: false,
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
    actions[action]?.();
    if (copyFeedbackContextActions.has(action)) {
      void popup.webContents.executeJavaScript(`
        document.querySelector('[data-action=${JSON.stringify(action)}]')?.classList.add('is-copy-confirmed')
      `).catch(() => {});
      setTimeout(() => {
        if (!popup.isDestroyed()) popup.close();
      }, 480);
      return;
    }
    popup.close();
  });
  popup.webContents.on("before-input-event", (_event, input) => {
    if (input.type === "keyDown" && input.key === "Escape") popup.close();
  });
  const closeFromParentFocus = () => {
    if (!popup.isDestroyed()) popup.close();
  };
  popup.on("closed", () => {
    window.removeListener("focus", closeFromParentFocus);
    if (webContextMenuWindow === popup) webContextMenuWindow = undefined;
  });
  const menuDocumentPath = path.join(app.getPath("temp"), "brizo-context-menu.html");
  writeFile(menuDocumentPath, createWebContextMenuPageHtml(items, ariaLabel), "utf8")
    .then(() => popup.loadFile(menuDocumentPath))
    .then(async () => {
      const measuredSize = await popup.webContents.executeJavaScript(`(() => ({
        width: Math.ceil(document.body.offsetWidth || document.body.scrollWidth || 0),
        height: Math.ceil(document.body.offsetHeight || document.body.scrollHeight || 0),
      }))()`);
      const width = Math.min(
        Math.max(120, workArea.width - 16),
        Math.max(120, Number(measuredSize?.width) || 120),
      );
      const height = Math.min(
        Math.max(72, workArea.height - 16),
        Math.max(72, Number(measuredSize?.height) || 72),
      );
      popup.setBounds({
        x: Math.min(Math.max(point.x, workArea.x + 8), workArea.x + workArea.width - width - 8),
        y: Math.min(Math.max(point.y, workArea.y + 8), workArea.y + workArea.height - height - 8),
        width,
        height,
      });
      popup.show();
      popup.focus();
      void popup.webContents.executeJavaScript(
        "document.activeElement?.blur(); document.body.focus({ preventScroll: true })",
      ).catch(() => {});
      setTimeout(() => {
        if (!popup.isDestroyed() && popup.isVisible()) window.once("focus", closeFromParentFocus);
      }, 200);
    })
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
          font-family: "Brizo HarmonyOS Sans", "HarmonyOS Sans SC", sans-serif;
          font-style: normal;
        }
        .translation-original {
          color: #6f776f;
          font-style: normal;
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
        "background:#f0e8e2",
        "box-shadow:0 1px 3px rgba(120,80,40,.08),0 4px 16px rgba(120,80,40,.05),0 0 0 1px rgba(120,80,40,.04)",
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

function installWebContextMenus(
  webContents,
  window,
  onOpenInNewTab,
  onAskBrizo,
  contentOffset = browserBounds,
) {
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
      items = linkUrl ? imageLinkContextMenuItems : imageContextMenuItems;
      ariaLabel = linkUrl ? "图片与链接操作" : "图片操作";
      actions = {
        open: () => onOpenInNewTab(imageUrl),
        download: () => webContents.downloadURL(imageUrl),
        "copy-image": () => webContents.copyImageAt(params.x, params.y),
        "copy-address": () => clipboard.writeText(imageUrl),
        "copy-link": () => clipboard.writeText(linkUrl),
        "open-link-tab": () => onOpenInNewTab(linkUrl),
        "open-link-window": () => createBrowserLinkWindow(linkUrl),
      };
    } else if (linkUrl) {
      items = linkContextMenuItems;
      ariaLabel = "链接操作";
      actions = {
        "copy-link": () => clipboard.writeText(linkUrl),
        "open-link-tab": () => onOpenInNewTab(linkUrl),
        "open-link-window": () => createBrowserLinkWindow(linkUrl),
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
      const pageUrl = normalizeBrowserInput(params.pageURL || webContents.getURL());
      items = pageContextMenuItems.filter((item) => item.action !== "back"
        || webContents.navigationHistory.canGoBack());
      ariaLabel = "网页操作";
      actions = {
        back: () => webContents.navigationHistory.goBack(),
        reload: () => webContents.reload(),
        "copy-page-address": () => {
          if (pageUrl) clipboard.writeText(pageUrl);
        },
      };
    }

    event.preventDefault();
    showWebContextMenu({ actions, ariaLabel, contentOffset, items, params, window });
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
  const hasDownloadsWindow = downloadsWindow && !downloadsWindow.isDestroyed();
  const hasMainWindow = mainWindow && !mainWindow.isDestroyed();
  if (!hasDownloadsWindow && !hasMainWindow) return;
  getDownloadRecords()
    .then((records) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("bean-browser:downloads", records);
      }
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
          html, body { width: 100%; height: 100%; margin: 0; overflow: hidden; background: #f0e8e2; }
          body { border: 0; border-radius: 10px; background: #f0e8e2; color: #1d211e; font-family: "Brizo HarmonyOS Sans", "HarmonyOS Sans SC", sans-serif; font-style: normal; -webkit-font-smoothing: antialiased; }
          header { height: 35px; margin-bottom: 3px; padding: 0 8px 0 12px; display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid rgba(134,141,135,.2); }
          header strong, header a { font-size: 13px; font-weight: 500; }
          header a { padding: 4px 7px; border-radius: 7px; color: #747c75; text-decoration: none; }
          header a:hover, header a:focus-visible { outline: 0; background: rgba(95,102,95,.1); color: #303832; }
          main { height: calc(100% - 38px); padding: 5px; overflow-y: auto; }
          .group + .group { margin-top: 3px; padding-top: 3px; border-top: 1px solid rgba(134,141,135,.2); }
          h2 { margin: 0; padding: 5px 7px 3px; color: #747c75; font-size: 13px; font-weight: 500; }
          .row { height: 35px; padding: 0 3px; display: grid; grid-template-columns: minmax(0, 1fr) 28px; gap: 3px; align-items: center; border-radius: 8px; }
          .row:hover { background: rgba(95,102,95,.1); }
          .row-main { min-width: 0; height: 35px; display: grid; grid-template-columns: 26px minmax(0, 1fr); gap: 7px; align-items: center; border-radius: 8px; color: inherit; text-decoration: none; }
          .row-main:focus-visible, .folder-button:focus-visible { outline: 2px solid rgba(165,140,94,.55); outline-offset: -2px; }
          .icon { width: 24px; height: 24px; display: grid; place-items: center; overflow: hidden; border-radius: 7px; background: #e8ece7; color: #617062; }
          .icon img { width: 100%; height: 100%; display: block; object-fit: cover; }
          .icon svg { width: 15px; height: 15px; fill: none; stroke: currentColor; stroke-width: 1.6; stroke-linecap: round; stroke-linejoin: round; }
          .copy { min-width: 0; display: grid; grid-template-columns: minmax(0,.8fr) minmax(0,1.2fr); gap: 9px; align-items: center; }
          .copy strong, .copy em { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
          .copy strong { color: #343a35; font-size: 13px; font-weight: 500; }
          .copy em { color: #858d86; font-size: 11px; font-style: normal; }
          .folder-button { width: 28px; height: 28px; display: grid; place-items: center; border-radius: 7px; color: #737c74; text-decoration: none; }
          .folder-button:hover { background: #e3e7e2; color: #4f5d51; }
          .folder-button svg { width: 17px; height: 17px; fill: none; stroke: currentColor; stroke-width: 1.6; stroke-linecap: round; stroke-linejoin: round; }
          .missing .copy { color: #929992; text-decoration: line-through; }
          .missing .copy strong, .missing .copy em { color: inherit; }
          .missing .row-main, .missing .folder-button { pointer-events: none; }
          .empty { margin: 0; padding: 30px 12px; color: #899089; font-size: 13px; text-align: center; }
          ::-webkit-scrollbar { width: 10px; background: transparent; }
          ::-webkit-scrollbar-thumb { border: 3px solid transparent; border-radius: 999px; background: rgba(37, 44, 39, .5); background-clip: content-box; }
        </style>
      </head>
      <body>
        <header><strong>下载</strong>${records.length ? '<a href="brizo-download://clear">清除记录</a>' : ""}</header>
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
  const width = 360;
  const estimatedHeight = 48 + records.length * 35 + groupDownloadRecords(records).length * 28;
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
    backgroundColor: "#faf9f6",
    frame: false,
    hasShadow: true,
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
    if (action === "clear") {
      downloadRecords = [];
      void saveDownloadRecords();
      downloadsWindow?.close();
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send("bean-browser:downloads", []);
      return;
    }
    const record = downloadRecords.find((item) => item.id === id);
    if (!record || record.state !== "completed" || !existsSync(record.savePath)) return;
    downloadsWindow?.close();
    if (action === "folder") shell.showItemInFolder(record.savePath);
    if (action === "open") {
      if (record.filename.toLowerCase().endsWith(".pdf")) {
        requestOpenPdfTab(pathToFileURL(record.savePath).href, {
          title: record.filename,
        });
      } else {
        void shell.openPath(record.savePath).then((error) => {
          if (error) console.error("[downloads]", error);
        });
      }
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
  mainWindow.webContents.send("bean-browser:open-downloads");
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
  activeDownloads.set(record.id, { item, record, recordReady });
  const update = async (state) => {
    await recordReady;
    if (record.state === state) return;
    record.state = state;
    await saveDownloadRecords();
    publishDownloads();
    if (state === "completed") {
      await autoShowDownloadsWindow();
      if (record.filename.toLowerCase().endsWith(".pdf")) {
        requestOpenPdfTab(pathToFileURL(record.savePath).href, {
          title: record.filename,
        });
      }
    }
  };

  item.on("updated", (_event, state) => {
    if (state === "interrupted") {
      void update("interrupted");
      return;
    }
    void update(item.isPaused() ? "paused" : "downloading");
  });
  item.once("done", (_event, state) => {
    activeDownloads.delete(record.id);
    void update(state);
  });

  void recordReady.then(() => {
    void saveDownloadRecords();
    publishDownloads();
  });
}

async function openDownloadsDirectory() {
  const directory = app.getPath("downloads");
  const error = await shell.openPath(directory);
  return { error, opened: !error };
}

async function setDownloadPaused(id, paused) {
  const activeDownload = activeDownloads.get(String(id || ""));
  if (!activeDownload) return { status: "unavailable" };
  const { item, record, recordReady } = activeDownload;
  if (item.isDestroyed?.()) return { status: "unavailable" };
  if (paused) item.pause();
  else item.resume();
  await recordReady;
  record.state = paused ? "paused" : "downloading";
  await saveDownloadRecords();
  publishDownloads();
  return { status: record.state };
}

async function cancelDownload(id) {
  const downloadId = String(id || "");
  const activeDownload = activeDownloads.get(downloadId);
  if (!activeDownload) return { status: "unavailable" };
  activeDownload.item.cancel();
  await activeDownload.recordReady;
  activeDownloads.delete(downloadId);
  downloadRecords = downloadRecords.filter((record) => record.id !== downloadId);
  await saveDownloadRecords();
  publishDownloads();
  return { status: "cancelled" };
}

async function openDownloadedFile(id) {
  await loadDownloadRecords();
  const record = downloadRecords.find((entry) => entry.id === String(id || ""));
  if (!record || record.state !== "completed") return { status: "unavailable" };
  const error = await shell.openPath(record.savePath);
  return { error, status: error ? "failed" : "opened" };
}

async function deleteDownloadedFile(id) {
  const downloadId = String(id || "");
  await loadDownloadRecords();
  const record = downloadRecords.find((entry) => entry.id === downloadId);
  if (!record) return { status: "unavailable" };
  if (record.state === "completed" && existsSync(record.savePath)) {
    await shell.trashItem(record.savePath);
  }
  downloadThumbnailCache.delete(record.savePath);
  downloadRecords = downloadRecords.filter((entry) => entry.id !== downloadId);
  await saveDownloadRecords();
  publishDownloads();
  return { status: "deleted" };
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
      const logoDataUrl = `data:image/svg+xml;base64,${logo.toString("base64")}`;
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
  const logoUrl = `data:image/svg+xml;base64,${logo.toString("base64")}`;
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
          body { overflow: hidden; color: #252a26; font-family: "HarmonyOS Sans SC", sans-serif; font-style: normal; -webkit-font-smoothing: antialiased; }
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

function navigationLogUrl(value) {
  try {
    const parsed = new URL(String(value || ""));
    for (const key of [...parsed.searchParams.keys()]) {
      parsed.searchParams.set(key, "[redacted]");
    }
    return parsed.toString();
  } catch {
    return String(value || "").slice(0, 240);
  }
}

function standardBrowserUserAgent(browserSession) {
  const userAgent = browserSession?.getUserAgent?.() || "";
  return userAgent
    .replace(/\sElectron\/[^\s]+/gi, "")
    .replace(/\sBrizo\/[^\s]+/gi, "")
    .trim();
}

function logBrowserNavigation(eventName, view, url, details = {}) {
  console.info("[browser-navigation]", eventName, {
    tabId: view?.__brizoOwnerTabId || "",
    generation: view?.__brizoNavigationGeneration ?? -1,
    url: navigationLogUrl(url),
    ...details,
  });
}

function getLiveViewWebContents(view) {
  try {
    const webContents = view?.webContents;
    return webContents && !webContents.isDestroyed() ? webContents : null;
  } catch {
    return null;
  }
}

function isPageZoomShortcut(input) {
  if (!input || (!input.meta && !input.control) || input.alt) return false;
  if (input.type !== "keyDown" && input.type !== "rawKeyDown") return false;
  const key = String(input.key || "").toLowerCase();
  const code = String(input.code || "").toLowerCase();
  return ["+", "=", "-", "_", "0"].includes(key)
    || ["equal", "minus", "digit0", "numpadadd", "numpadsubtract", "numpad0"].includes(code);
}

function normalizePageZoomFactor(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 1;
  return Math.min(2, Math.max(0.5, Math.round(numeric * 10) / 10));
}

function applyBrowserPageZoomPolicy(view, { allowZoom = Boolean(view?.__brizoIsPdf) } = {}) {
  const webContents = getLiveViewWebContents(view);
  if (!webContents) return false;

  // Chromium remembers page zoom per origin in a persistent session. Reapply
  // the policy at navigation commit and tab activation so an old site-specific
  // zoom cannot return for one compositor frame while a page is updating.
  const requestedZoom = normalizePageZoomFactor(view?.__brizoUserZoomFactor || defaultPageZoomFactor);
  const visualZoomLimits = allowZoom ? [0.5, 3] : [requestedZoom, requestedZoom];
  try {
    const pendingLimits = webContents.setVisualZoomLevelLimits(...visualZoomLimits);
    pendingLimits?.catch(() => {});
  } catch {
    // The view may be closing between the liveness check and the native call.
  }
  if (allowZoom && !view?.__brizoUserZoomFactor) return true;

  try {
    if (Math.abs(webContents.getZoomFactor() - requestedZoom) > 0.001) {
      webContents.setZoomFactor(requestedZoom);
    }
  } catch {
    return false;
  }
  return true;
}

async function showBrowserErrorPage(details = {}) {
  const activeWebContents = getLiveViewWebContents(browserView);
  if (!activeWebContents || browserErrorPageActive) return;
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
    const errorWebContents = getLiveViewWebContents(errorView);
    if (!errorView.__brizoErrorPageActive || !errorWebContents) return;
    await errorWebContents.loadFile(pagePath);
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

async function readPdfSource(source, browserSession = session.fromPartition("persist:bean-browser")) {
  const normalized = normalizePdfSourceUrl(source);
  if (!normalized) throw new Error("PDF 地址无效或不受支持。");
  if (normalized.startsWith("file:")) return await readFile(fileURLToPath(normalized));
  if (normalized.startsWith("data:application/pdf")) {
    const comma = normalized.indexOf(",");
    if (comma < 0) throw new Error("PDF 数据无效。");
    const metadata = normalized.slice(0, comma);
    const payload = normalized.slice(comma + 1);
    return Buffer.from(
      /;base64/i.test(metadata) ? payload : decodeURIComponent(payload),
      /;base64/i.test(metadata) ? "base64" : "utf8",
    );
  }

  const response = await browserSession.fetch(normalized, { redirect: "follow" });
  if (!response.ok) throw new Error(`PDF 下载返回 HTTP ${response.status}`);
  const declaredSize = Number(response.headers.get("content-length")) || 0;
  if (declaredSize > 64 * 1024 * 1024) throw new Error("PDF 超过 64 MB，暂不支持提炼。");
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > 64 * 1024 * 1024) throw new Error("PDF 超过 64 MB，暂不支持提炼。");
  if (bytes.subarray(0, 5).toString() !== "%PDF-") throw new Error("文件内容不是有效的 PDF。");
  return bytes;
}

async function extractPdfText(source, browserSession) {
  const bytes = await readPdfSource(source, browserSession);
  const { getDocument } = await loadPdfJsModule();
  const loadingTask = getDocument({ data: new Uint8Array(bytes), disableWorker: true });
  const document = await loadingTask.promise;
  const chunks = [];
  let characterCount = 0;
  let processedPages = 0;
  try {
    const pageLimit = Math.min(document.numPages, 120);
    for (let pageNumber = 1; pageNumber <= pageLimit && characterCount < 48_000; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      const text = content.items
        .map((item) => typeof item?.str === "string" ? item.str : "")
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
      if (text) {
        const pageText = `第 ${pageNumber} 页\n${text}`;
        chunks.push(pageText.slice(0, Math.max(0, 48_000 - characterCount)));
        characterCount += pageText.length;
      }
      processedPages = pageNumber;
      page.cleanup();
    }
    return {
      bytes,
      pageCount: document.numPages,
      processedPages,
      text: chunks.join("\n\n").slice(0, 48_000),
      textTruncated: processedPages < document.numPages || characterCount > 48_000,
    };
  } finally {
    await document.destroy();
  }
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
  const webContents = getLiveViewWebContents(browserView);
  if (!webContents) {
    return {
      canGoBack: false,
      canGoForward: false,
      error: browserError,
      isContentReady: false,
      isPdf: false,
      isLoading: false,
      navigationPreview: "",
      pagePreview: "",
      pageBackgroundColor,
      pageFaviconUrl,
      title: "",
      url: "",
      documentUrl: "",
      ownerTabId: browserOwnerTabId,
      pdfSourceUrl: "",
    };
  }

  const { navigationHistory } = webContents;
  const displayUrl = isInternalBrowserErrorUrl(browserDisplayUrl)
    ? browserView.__brizoRequestedUrl || ""
    : browserDisplayUrl;
  const documentUrl = browserErrorPageActive
    ? displayUrl
    : browserView.__brizoIsPdf && browserView.__brizoPdfSource
      ? browserView.__brizoPdfSource
      : webContents.getURL();
  return {
    canGoBack: navigationHistory.canGoBack(),
    canGoForward: navigationHistory.canGoForward(),
    error: browserError,
    isContentReady: Boolean(browserView.__brizoContentReady),
    isPdf: Boolean(browserView.__brizoIsPdf),
    // UI progress tracks the incoming document becoming paint-ready, not every
    // late analytics/image request a site may keep open indefinitely.
    isLoading: Boolean(browserView.__brizoNavigationPending),
    navigationPreview: browserView.__brizoNavigationPreview || "",
    // Keep the last compositor-confirmed page bitmap behind the native view.
    // The native surface needs one uniform macOS radius for its real bottom
    // corners; this underlay fills only the two top cut-outs, while the renderer
    // host's bottom-only clip continues to expose the warm shell below.
    pagePreview: browserView.__brizoLastPaintPreview || "",
    pageBackgroundColor,
    pageFaviconUrl,
    title: webContents.getTitle(),
    url: displayUrl || (isInternalBrowserErrorUrl(webContents.getURL()) ? "" : webContents.getURL()),
    documentUrl,
    ownerTabId: browserOwnerTabId,
    pdfSourceUrl: browserView.__brizoPdfSource || "",
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

function requestOpenUrlTab(url, options = {}) {
  if (!mainWindow || mainWindow.isDestroyed() || !url) return;
  mainWindow.webContents.send("bean-browser:open-url-tab", {
    kind: options.kind || "web",
    title: options.title || "",
    url,
  });
}

function requestOpenPdfTab(input, options = {}) {
  const url = normalizePdfSourceUrl(input);
  if (!url || !mainWindow || mainWindow.isDestroyed()) return false;
  const tabId = options.tabId
    || `pdf-tab-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  // Start the native PDF navigation before the renderer creates its matching
  // tab. This removes a renderer -> preload -> IPC round trip from first paint.
  navigateBrowserPdf(url, tabId);
  mainWindow.webContents.send("bean-browser:open-url-tab", {
    alreadyNavigated: true,
    kind: "pdf",
    tabId,
    title: options.title || filenameForPdfSource(url),
    url,
  });
  return true;
}

async function sampleRenderedTopEdgeColor(webContents) {
  if (!webContents || webContents.isDestroyed() || browserBounds.width <= 0 || browserBounds.height <= 0) return "";
  try {
    const image = await webContents.capturePage({
      x: 0,
      y: 0,
      width: Math.max(1, Math.round(browserBounds.width)),
      height: Math.min(6, Math.max(1, Math.round(browserBounds.height))),
    });
    if (!image || image.isEmpty()) return "";
    const bitmap = image.resize({ width: 120, height: 4, quality: "good" }).toBitmap();
    const buckets = new Map();
    const bucketSize = 24;
    for (let offset = 0; offset + 3 < bitmap.length; offset += 4) {
      const blue = bitmap[offset];
      const green = bitmap[offset + 1];
      const red = bitmap[offset + 2];
      const alpha = bitmap[offset + 3];
      if (alpha < 128) continue;
      const key = `${Math.floor(red / bucketSize)}:${Math.floor(green / bucketSize)}:${Math.floor(blue / bucketSize)}`;
      const bucket = buckets.get(key) || { blue: 0, count: 0, green: 0, red: 0 };
      bucket.blue += blue;
      bucket.green += green;
      bucket.red += red;
      bucket.count += 1;
      buckets.set(key, bucket);
    }
    const dominant = [...buckets.values()].sort((left, right) => right.count - left.count)[0];
    if (!dominant || dominant.count < 4) return "";
    return `rgb(${Math.round(dominant.red / dominant.count)}, ${Math.round(dominant.green / dominant.count)}, ${Math.round(dominant.blue / dominant.count)})`;
  } catch {
    return "";
  }
}

async function updatePageBackgroundColor() {
  const sampledWebContents = getLiveViewWebContents(browserView);
  if (!sampledWebContents) return;

  const sampledView = browserView;
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
    const domSample = await sampledWebContents.executeJavaScript(`
      (() => {
        const isVisibleColor = (value) => {
          if (!value) return false;
          const normalized = value.replace(/\\s+/g, "").toLowerCase();
          if (normalized === "transparent" || normalized === "rgba(0,0,0,0)" || normalized === "rgb(0,0,0,0)") return false;
          const alpha = normalized.match(/^rgba\\([^,]+,[^,]+,[^,]+,([^)]+)\\)$/)?.[1];
          return alpha == null || Number(alpha) > 0.08;
        };
        const colorTouchingTopEdge = (x) => {
          const topElement = document.elementFromPoint(x, 1);
          const topStyle = topElement ? getComputedStyle(topElement) : null;
          let element = topElement;
          while (element) {
            const rect = element.getBoundingClientRect();
            const color = getComputedStyle(element).backgroundColor;
            if (rect.top <= 1.5 && rect.bottom > 1 && isVisibleColor(color)) {
              return {
                color,
                sourceTag: element.tagName || "",
                topHasRenderedContent: ["CANVAS", "IFRAME", "IMG", "SVG", "VIDEO"].includes(topElement?.tagName)
                  || (topStyle?.backgroundImage && topStyle.backgroundImage !== "none"),
              };
            }
            element = element.parentElement;
          }
          return null;
        };
        const width = Math.max(document.documentElement.clientWidth, 1);
        const edgeSamples = [0.08, 0.25, 0.5, 0.75, 0.92]
          .map((ratio) => colorTouchingTopEdge(Math.min(width - 1, Math.max(0, width * ratio))))
          .filter(Boolean);
        if (edgeSamples.length) {
          const counts = new Map();
          edgeSamples.forEach((sample) => counts.set(sample.color, (counts.get(sample.color) || 0) + 1));
          const color = [...counts].sort((a, b) => b[1] - a[1])[0][0];
          const matchingSamples = edgeSamples.filter((sample) => sample.color === color);
          return {
            color,
            needsRenderedPixels: matchingSamples.some((sample) =>
              sample.topHasRenderedContent || ["BODY", "HTML"].includes(sample.sourceTag)
            ),
          };
        }

        const colors = [
          document.body && getComputedStyle(document.body).backgroundColor,
          document.documentElement && getComputedStyle(document.documentElement).backgroundColor,
          document.querySelector('meta[name="theme-color"]')?.content
        ];
        return { color: colors.find(isVisibleColor) || "#ffffff", needsRenderedPixels: true };
      })()
    `);
    const domColor = typeof domSample?.color === "string" ? domSample.color : "#ffffff";
    const renderedColor = sampleIsCurrent() && domSample?.needsRenderedPixels
      ? await sampleRenderedTopEdgeColor(sampledWebContents)
      : "";
    const color = renderedColor || domColor;

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
  for (const [tabId, view] of browserViews) {
    const webContents = getLiveViewWebContents(view);
    if (!webContents) {
      browserViews.delete(tabId);
      if (browserView === view) {
        browserView = undefined;
        browserOwnerTabId = "";
      }
      continue;
    }
    const isSelected = view === browserView && browserVisible;
    const isPaintReady = isSelected && Boolean(view.__brizoContentReady);
    const isPreparingReplacement = view === browserView
      && browserVisible
      && Boolean(view.__brizoNavigationPending);
    const frameView = view.__brizoFrameView;
    const layoutBounds = view.__brizoNavigationViewport || browserBounds;
    const frameTopOverlap = Math.min(browserContentBorderRadius, layoutBounds.y);
    const frameBounds = {
      x: Math.max(0, layoutBounds.x - browserFrameInset),
      y: layoutBounds.y - frameTopOverlap,
      // The native frame may overlap the content on its left/top to preserve
      // rounded clipping, but it must never cover the renderer-owned 6 px
      // warm shell gutters on the right or bottom. Transparent native Views
      // composite as gray under macOS vibrancy instead of revealing the CSS.
      width: layoutBounds.width + browserFrameInset,
      height: layoutBounds.height + frameTopOverlap,
    };
    const contentBounds = {
      x: browserFrameInset,
      y: frameTopOverlap,
      width: layoutBounds.width,
      height: layoutBounds.height,
    };
    const shouldShowFrame = isPaintReady || isPreparingReplacement;
    const snapshotVisible = isPreparingReplacement
      && Boolean(view.__brizoSnapshotReady);

    // Keep every native webpage at its real viewport size while overlays or
    // another tab hide it. Resizing a WebContentsView to 0 × 0 triggers a
    // responsive reflow; View visibility preserves layout, scroll, and DOM.
    webContents.setBackgroundThrottling(!(isSelected || (browserVisible && view.__brizoNavigationPending)));
    frameView?.setBounds(frameBounds);
    view.setBounds(contentBounds);
    view.__brizoSnapshotView?.setBounds(contentBounds);

    view.setVisible(shouldShowFrame);
    view.__brizoSnapshotView?.setVisible(snapshotVisible);
    frameView?.setVisible(shouldShowFrame);
  }
}

function freezeBrowserNavigationViewport(view) {
  if (!view?.__brizoNavigationViewport) {
    view.__brizoNavigationViewport = { ...browserBounds };
  }
}

function releaseBrowserNavigationViewportAfterPaint(view, navigationGeneration) {
  void (async () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      try {
        await mainWindow.webContents.executeJavaScript(`
          new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
        `);
      } catch {
        // The shell may be closing while the final incoming frame settles.
      }
    }
    const webContents = getLiveViewWebContents(view);
    if (
      !webContents
      || view.__brizoNavigationGeneration !== navigationGeneration
      || view.__brizoNavigationPending
    ) return;
    view.__brizoNavigationViewport = null;
    if (browserView === view) setBrowserViewVisible(browserVisible);
  })();
}

function meaningfulPaintPreview(image) {
  if (!image || image.isEmpty()) return "";
  try {
    const bitmap = image.resize({ width: 64, height: 64, quality: "good" }).toBitmap();
    let paintedSamples = 0;
    for (let offset = 0; offset + 3 < bitmap.length; offset += 4) {
      const blue = bitmap[offset];
      const green = bitmap[offset + 1];
      const red = bitmap[offset + 2];
      const alpha = bitmap[offset + 3];
      if (alpha > 20 && (red < 245 || green < 245 || blue < 245)) paintedSamples += 1;
      if (paintedSamples >= 2) return image.toDataURL();
    }
  } catch {
    return "";
  }
  return "";
}

async function prepareBrowserSnapshotOverlay(view, preview) {
  const overlayWebContents = getLiveViewWebContents(view?.__brizoSnapshotView);
  if (!overlayWebContents || !preview) return false;
  if (view.__brizoSnapshotPreview === preview && view.__brizoSnapshotReady) return true;
  view.__brizoSnapshotPreview = preview;
  view.__brizoSnapshotReady = false;
  const html = `<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:"><style>html,body,img{margin:0;width:100%;height:100%;overflow:hidden}body{background:#fff}img{display:block;object-fit:fill}</style><img src="${preview}" alt="">`;
  try {
    await overlayWebContents.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    if (view.__brizoSnapshotPreview !== preview || overlayWebContents.isDestroyed()) return false;
    view.__brizoSnapshotReady = true;
    return true;
  } catch {
    return false;
  }
}

async function prepareBrowserLoadingOverlay(view) {
  const overlayWebContents = getLiveViewWebContents(view?.__brizoSnapshotView);
  if (!overlayWebContents) return false;
  const loadingPreview = "brizo-loading";
  if (view.__brizoSnapshotPreview === loadingPreview && view.__brizoSnapshotReady) return true;
  view.__brizoSnapshotPreview = loadingPreview;
  view.__brizoSnapshotReady = false;
  const html = `<!doctype html>
    <meta charset="utf-8">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">
    <style>
      html,body{width:100%;height:100%;margin:0;overflow:hidden;background:#fcfafa}
      body{display:grid;place-items:center}
      i{width:22px;height:22px;border:1px solid rgba(165,140,94,.22);border-top-color:#a58c5e;border-radius:50%;animation:spin .8s linear infinite}
      @keyframes spin{to{transform:rotate(360deg)}}
      @media(prefers-reduced-motion:reduce){i{animation:none;border-color:rgba(165,140,94,.5)}}
    </style>
    <i aria-label="网页加载中"></i>`;
  try {
    await overlayWebContents.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    if (view.__brizoSnapshotPreview !== loadingPreview || overlayWebContents.isDestroyed()) return false;
    view.__brizoSnapshotReady = true;
    return true;
  } catch {
    return false;
  }
}

async function captureMeaningfulPreview(webContents, trustVisualPaint = false) {
  if (!webContents || webContents.isDestroyed()) return "";
  try {
    const image = await webContents.capturePage();
    const meaningfulPreview = meaningfulPaintPreview(image);
    if (meaningfulPreview) return meaningfulPreview;
    // Chromium's visual-paint event is a stronger signal than Brizo's generic
    // near-white bitmap heuristic for sparse pages such as Bing results.
    return trustVisualPaint && !image.isEmpty() ? image.toDataURL() : "";
  } catch {
    return "";
  }
}

async function hasRenderablePageStructure(webContents) {
  if (!webContents || webContents.isDestroyed()) return false;
  try {
    return Boolean(await webContents.executeJavaScript(`
      (() => {
        const body = document.body;
        if (!body || document.readyState === "loading") return false;
        const rect = body.getBoundingClientRect();
        if (rect.width < 2 || rect.height < 2) return false;
        const text = (body.innerText || "").trim();
        const visibleContent = [...body.querySelectorAll(
          "main, form, input, button, a[href], h1, h2, p, img, svg, canvas, video, iframe"
        )].some((element) => {
          const elementRect = element.getBoundingClientRect();
          if (elementRect.width < 2 || elementRect.height < 2) return false;
          const style = getComputedStyle(element);
          return style.display !== "none"
            && style.visibility !== "hidden"
            && Number.parseFloat(style.opacity || "1") > 0.02;
        });
        return visibleContent && (
          text.length >= 8
          || Boolean(body.querySelector("img, svg, canvas, video, iframe"))
        );
      })()
    `));
  } catch {
    return false;
  }
}

async function waitForPageAnimationFrames(webContents, frameCount = 2) {
  if (!webContents || webContents.isDestroyed()) return false;
  try {
    return Boolean(await webContents.executeJavaScript(`
      new Promise((resolve) => {
        let remaining = ${Math.max(1, Number(frameCount) || 1)};
        const timeout = setTimeout(() => resolve(false), 750);
        const next = () => {
          remaining -= 1;
          if (remaining <= 0) {
            clearTimeout(timeout);
            resolve(true);
          }
          else requestAnimationFrame(next);
        };
        requestAnimationFrame(next);
      })
    `));
  } catch {
    return false;
  }
}

function revealBrowserViewAfterFirstFrame(view, navigationGeneration) {
  const webContents = getLiveViewWebContents(view);
  if (!webContents) return;
  if (view.__brizoRevealGeneration === navigationGeneration) return;
  view.__brizoRevealGeneration = navigationGeneration;
  const waitForLivePageReady = async () => {
    const deadline = Date.now() + 20_000;
    let stableDomFrames = 0;
    while (!webContents.isDestroyed() && Date.now() < deadline) {
      const visuallyPainted = view.__brizoVisualPaintGeneration === navigationGeneration;
      const domLifecycleReady = view.__brizoDomReadyGeneration === navigationGeneration
        || view.__brizoFinishedGeneration === navigationGeneration;
      const renderableDom = domLifecycleReady && await hasRenderablePageStructure(webContents);
      if (renderableDom) stableDomFrames += 1;
      else stableDomFrames = 0;
      if (visuallyPainted || renderableDom) {
        await waitForPageAnimationFrames(webContents, 2);
        const firstPaintPreview = await captureMeaningfulPreview(webContents, visuallyPainted);
        if (!firstPaintPreview) {
          // Some animation-heavy pages have a fully laid-out, visible DOM while
          // an overlapping native loading surface prevents capturePage() from
          // returning the live compositor bitmap. Two consecutive observations
          // plus two page animation frames are sufficient to reveal that page;
          // blank or hidden documents never satisfy hasRenderablePageStructure.
          if (
            stableDomFrames >= 2
            && view.__brizoNavigationGeneration === navigationGeneration
            && await hasRenderablePageStructure(webContents)
          ) return "stable-renderable-dom-two-frames";
          await new Promise((resolve) => setTimeout(resolve, 80));
          continue;
        }
        // A completed DOM is not the same thing as a compositor-ready page.
        // Require a second real bitmap after another pair of page frames so a
        // redirecting/search page cannot expose its blank or pre-layout frame.
        await waitForPageAnimationFrames(webContents, 2);
        const settledPaintPreview = await captureMeaningfulPreview(webContents, visuallyPainted);
        if (
          settledPaintPreview
          && !webContents.isDestroyed()
          && view.__brizoNavigationGeneration === navigationGeneration
          && (visuallyPainted || await hasRenderablePageStructure(webContents))
        ) {
          view.__brizoLastPaintPreview = settledPaintPreview;
          return visuallyPainted
            ? "chromium-visual-paint-live-view"
            : "finished-renderable-dom-two-painted-frames";
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 80));
    }
    return "";
  };
  // The incoming WebContents is never captured while it is navigating. Chromium
  // navigation/DOM/paint signals decide readiness; the snapshot is only an
  // optional frozen image of the outgoing document.
  waitForLivePageReady().then(async (readySignal) => {
    if (!readySignal) return;
    if (mainWindow && !mainWindow.isDestroyed()) {
      try {
        await mainWindow.webContents.executeJavaScript(`
          new Promise((resolve) => requestAnimationFrame(resolve))
        `);
      } catch {
        // The shell may be closing while a navigation settles.
      }
    }
    if (
      webContents.isDestroyed()
      || view.__brizoNavigationGeneration !== navigationGeneration
    ) return;
    view.__brizoContentReady = true;
    view.__brizoNavigationPending = false;
    view.__brizoNavigationPreview = "";
    clearBrowserNavigationTimeout(view);
    logBrowserNavigation("paint-ready", view, webContents.getURL(), {
      signal: readySignal,
    });
    if (browserView === view) {
      setBrowserViewVisible(browserVisible);
      publishBrowserState();
    }
    releaseBrowserNavigationViewportAfterPaint(view, navigationGeneration);
  }).finally(() => {
    if (
      webContents.isDestroyed()
      || view.__brizoNavigationGeneration !== navigationGeneration
      || view.__brizoContentReady
      || view.__brizoErrorPageActive
    ) return;
    if (browserView === view) {
      void showBrowserErrorPage({
        errorCode: -118,
        url: view.__brizoRequestedUrl || view.__brizoDisplayUrl || webContents.getURL(),
      });
    } else {
      view.__brizoError = "TIMEOUT · 页面长时间没有产生有效画面";
    }
  });
}

function beginBrowserNavigation(view, action) {
  const webContents = getLiveViewWebContents(view);
  if (!webContents) return false;
  const requestGeneration = (view.__brizoNavigationRequestGeneration || 0) + 1;
  view.__brizoNavigationRequestGeneration = requestGeneration;
  freezeBrowserNavigationViewport(view);
  view.__brizoNavigationPending = true;
  if (browserView === view) publishBrowserState();

  void (async () => {
    let preview = view.__brizoNavigationPreview || view.__brizoLastPaintPreview || "";
    if (view.__brizoContentReady && webContents.getURL()) {
      preview = await captureMeaningfulPreview(webContents) || preview;
    }
    if (
      webContents.isDestroyed()
      || view.__brizoNavigationRequestGeneration !== requestGeneration
    ) return;
    view.__brizoNavigationPreview = preview;
    if (preview) view.__brizoLastPaintPreview = preview;
    view.__brizoContentReady = false;
    if (browserView === view) publishBrowserState();
    if (preview) await prepareBrowserSnapshotOverlay(view, preview);
    else await prepareBrowserLoadingOverlay(view);
    if (view.__brizoSnapshotReady && mainWindow && !mainWindow.isDestroyed()) {
      try {
        // Let React paint the frozen outgoing frame underneath the still-visible
        // native page before removing that native layer. This closes the single
        // compositor-frame gap that would otherwise flash the host background.
        await mainWindow.webContents.executeJavaScript(`
          new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
        `);
      } catch {
        // Continue navigation if the shell is closing or temporarily unavailable.
      }
    }
    if (
      webContents.isDestroyed()
      || view.__brizoNavigationRequestGeneration !== requestGeneration
    ) return;
    setBrowserViewVisible(browserVisible);
    action();
  })();
  return true;
}

function activateBrowserView(view, ownerTabId) {
  if (view.__brizoSleepTimer) clearTimeout(view.__brizoSleepTimer);
  view.__brizoSleepTimer = undefined;
  browserView = view;
  browserOwnerTabId = ownerTabId;
  applyBrowserPageZoomPolicy(view);
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
      const backgroundWebContents = getLiveViewWebContents(backgroundView);
      if (browserView === backgroundView || !backgroundWebContents) return;
      browserViews.delete(tabId);
      backgroundWebContents.close();
    }, browserTabSleepDelayMs);
  }
  publishBrowserState();
}

function ensureBrowserView(ownerTabId) {
  const tabId = typeof ownerTabId === "string" && ownerTabId ? ownerTabId : "__default__";
  let view = browserViews.get(tabId);
  if (!getLiveViewWebContents(view)) {
    browserViews.delete(tabId);
    view = createBrowserView(mainWindow, tabId);
    browserViews.set(tabId, view);
  }
  view.__brizoOwnerTabId = tabId;
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

function navigateBrowserPdf(input, ownerTabId) {
  const url = normalizePdfSourceUrl(input);
  if (!url) return false;
  return navigateBrowserUrl(url, ownerTabId, { pdfSource: url });
}

function navigateBrowserUrl(url, ownerTabId, { pdfSource = "" } = {}) {
  if (!url || !mainWindow) return false;
  const targetView = ensureBrowserView(ownerTabId);
  targetView.__brizoIsPdf = Boolean(pdfSource);
  targetView.__brizoPdfSource = pdfSource;
  applyBrowserPageZoomPolicy(targetView);
  if (pdfSource) {
    targetView.__brizoBackgroundColor = pdfReaderBackgroundColor;
    if (browserView === targetView) pageBackgroundColor = pdfReaderBackgroundColor;
  }
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
  pageFaviconUrl = "";
  browserDisplayUrl = url;
  targetView.__brizoDisplayUrl = url;
  targetView.__brizoRequestedUrl = url;
  targetView.__brizoError = "";
  targetView.__brizoErrorPageActive = false;
  logBrowserNavigation("requested", targetView, url);
  return beginBrowserNavigation(targetView, () => {
    const targetWebContents = getLiveViewWebContents(targetView);
    if (!targetWebContents) return;
    targetView.__brizoNavigationTimeout = setTimeout(() => {
      if (targetWebContents.isDestroyed() || targetView.__brizoErrorPageActive) return;
      logBrowserNavigation("timeout", targetView, url, {
        currentUrl: navigationLogUrl(targetWebContents.getURL()),
        contentReady: Boolean(targetView.__brizoContentReady),
      });
      targetWebContents.stop();
      if (browserView === targetView) void showBrowserErrorPage({ errorCode: -118, url });
      else targetView.__brizoError = "TIMEOUT · 连接超时";
    }, 20_000);
    loadBrowserUrl(targetWebContents, url).catch(() => {
      if (browserView === targetView && !targetView.__brizoErrorPageActive) {
        void showBrowserErrorPage({ url });
      }
    });
  });
}

function createBrowserLinkWindow(input) {
  const url = normalizeBrowserInput(input);
  if (!url) return null;
  const window = new BrowserWindow({
    title: "Brizo",
    icon: appIconPath,
    width: 1280,
    height: 840,
    minWidth: 520,
    minHeight: 360,
    show: false,
    backgroundColor: "#f1e7e1",
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
      partition: "persist:bean-browser",
      plugins: true,
      sandbox: true,
    },
  });
  const context = { mode: "link", view, window };
  const shellWebContentsId = window.webContents.id;
  const viewWebContentsId = view.webContents.id;
  linkBrowserWindows.add(window);
  incognitoContexts.set(shellWebContentsId, context);
  view.webContents.once("destroyed", () => scrollbarCssKeys.delete(viewWebContentsId));
  window.contentView.addChildView(view);
  view.setBackgroundColor("#ffffff");
  applyBrowserPageZoomPolicy(view);
  const compatibleUserAgent = standardBrowserUserAgent(view.webContents.session);
  if (compatibleUserAgent) view.webContents.setUserAgent(compatibleUserAgent);

  const updateBounds = () => {
    if (window.isDestroyed()) return;
    const bounds = window.getContentBounds();
    view.setBounds({
      x: 0,
      y: 86,
      width: Math.max(1, bounds.width),
      height: Math.max(1, bounds.height - 86),
    });
  };
  const publishState = () => {
    const webContents = getLiveViewWebContents(view);
    if (window.isDestroyed() || !webContents) return;
    const { navigationHistory } = webContents;
    window.webContents.send("bean-incognito:state", {
      canGoBack: navigationHistory.canGoBack(),
      canGoForward: navigationHistory.canGoForward(),
      isLoading: webContents.isLoading(),
      mode: "link",
      title: webContents.getTitle(),
      url: webContents.getURL(),
    });
  };
  const navigate = (value) => {
    const nextUrl = normalizeBrowserInput(value);
    if (!nextUrl) return false;
    loadBrowserUrl(view.webContents, nextUrl).catch(() => {});
    return true;
  };

  context.navigate = navigate;
  const browserSession = view.webContents.session;
  browserSession.setPermissionCheckHandler(() => false);
  browserSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(false);
  });
  view.webContents.setWindowOpenHandler(({ url: nextUrl }) => {
    if (nextUrl) createBrowserLinkWindow(nextUrl);
    return { action: "deny" };
  });
  installWebContextMenus(
    view.webContents,
    window,
    (imageUrl) => requestOpenUrlTab(imageUrl, { kind: "image" }),
    (selectedText) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("bean-browser:ask-selection", selectedText);
      }
    },
    { x: 0, y: 86 },
  );
  view.webContents.on("zoom-changed", (event) => {
    event.preventDefault();
    applyBrowserPageZoomPolicy(view);
  });
  view.webContents.on("before-input-event", (event, keyInput) => {
    if (!isPageZoomShortcut(keyInput)) return;
    event.preventDefault();
    applyBrowserPageZoomPolicy(view);
  });
  view.webContents.on("did-navigate", () => applyBrowserPageZoomPolicy(view));
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
    installPageScrollbarBehavior(view.webContents).catch(() => {});
  });
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (event, nextUrl) => {
    if (!nextUrl.startsWith("file://")) event.preventDefault();
  });
  window.on("resize", updateBounds);
  window.once("ready-to-show", () => {
    if (!window.isDestroyed()) {
      window.show();
      window.focus();
    }
  });
  window.on("closed", () => {
    linkBrowserWindows.delete(window);
    incognitoContexts.delete(shellWebContentsId);
    getLiveViewWebContents(view)?.close();
  });
  window.webContents.once("did-finish-load", publishState);
  window.loadFile(incognitoEntry, { query: { mode: "link" } });
  updateBounds();
  navigate(url);
  return window;
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
      plugins: true,
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
  applyBrowserPageZoomPolicy(view, { allowZoom: false });

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
    const webContents = getLiveViewWebContents(view);
    if (window.isDestroyed() || !webContents) return;
    const { navigationHistory } = webContents;
    window.webContents.send("bean-incognito:state", {
      canGoBack: navigationHistory.canGoBack(),
      canGoForward: navigationHistory.canGoForward(),
      isLoading: webContents.isLoading(),
      title: webContents.getTitle(),
      url: webContents.getURL(),
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
  view.webContents.on("zoom-changed", (event) => {
    event.preventDefault();
    applyBrowserPageZoomPolicy(view, { allowZoom: false });
  });
  view.webContents.on("before-input-event", (event, input) => {
    if (!isPageZoomShortcut(input)) return;
    event.preventDefault();
    applyBrowserPageZoomPolicy(view, { allowZoom: false });
  });
  view.webContents.on("did-navigate", () => {
    applyBrowserPageZoomPolicy(view, { allowZoom: false });
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
    getLiveViewWebContents(view)?.close();
  });
  window.webContents.once("did-finish-load", publishState);
  window.loadFile(incognitoEntry);
  updateBounds();
  loadBrowserUrl(view.webContents, startUrl).catch(() => {});
  return window;
}

function createBrowserView(window, ownerTabId = "__default__") {
  const frameView = new View();
  const view = new WebContentsView({
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: browserPagePreloadEntry,
      plugins: true,
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
  view.__brizoIsPdf = false;
  view.__brizoPdfSource = "";
  view.__brizoContentReady = false;
  view.__brizoNavigationGeneration = 0;
  view.__brizoNavigationPending = false;
  view.__brizoNavigationViewport = null;
  view.__brizoNavigationPreview = "";
  view.__brizoLastPaintPreview = "";
  view.__brizoNavigationRequestGeneration = 0;
  view.__brizoRevealGeneration = -1;
  view.__brizoVisualPaintGeneration = -1;
  view.__brizoDomReadyGeneration = -1;
  view.__brizoFinishedGeneration = -1;
  view.__brizoPaintReadySignal = "";
  view.__brizoSnapshotPreview = "";
  view.__brizoSnapshotReady = false;
  view.__brizoOwnerTabId = ownerTabId;
  view.__brizoSleepTimer = undefined;
  view.__brizoFrameView = frameView;
  applyBrowserPageZoomPolicy(view);
  const createdWebContents = view.webContents;
  const compatibleUserAgent = standardBrowserUserAgent(createdWebContents.session);
  if (compatibleUserAgent) createdWebContents.setUserAgent(compatibleUserAgent);
  const viewWebContentsId = createdWebContents.id;
  createdWebContents.once("destroyed", () => {
    scrollbarCssKeys.delete(viewWebContentsId);
    for (const [tabId, candidate] of browserViews) {
      if (candidate === view) browserViews.delete(tabId);
    }
    if (browserView === view) {
      browserView = undefined;
      browserOwnerTabId = "";
      browserDisplayUrl = "";
      browserError = "";
      pageFaviconUrl = "";
    }
    const snapshotView = view.__brizoSnapshotView;
    const snapshotWebContents = getLiveViewWebContents(snapshotView);
    try { window.contentView.removeChildView(frameView); } catch {}
    snapshotWebContents?.close();
  });
  frameView.setBackgroundColor("#00000000");
  window.contentView.addChildView(frameView);
  // Radius must live on each Chromium compositor surface itself. On macOS a
  // child WebContentsView can bypass a rounded parent View during compositing,
  // which leaves rectangular corner pixels even though the parent is rounded.
  view.setBorderRadius(browserContentBorderRadius);
  frameView.addChildView(view);
  const snapshotView = new WebContentsView({
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
    },
  });
  snapshotView.setBackgroundColor("#ffffff");
  snapshotView.setBorderRadius(browserContentBorderRadius);
  snapshotView.setBounds({ x: 0, y: 0, width: 0, height: 0 });
  frameView.addChildView(snapshotView);
  view.__brizoSnapshotView = snapshotView;
  view.setBackgroundColor("#ffffff");
  setBrowserViewVisible(browserVisible);

  const browserSession = view.webContents.session;
  if (!browserSessionHandlersInstalled) {
    browserSessionHandlersInstalled = true;
    browserSession.on("will-download", (_event, item) => trackDownload(item));
    const findRequestView = (webContentsId) =>
      [...browserViews.values()].find((candidate) =>
        getLiveViewWebContents(candidate)?.id === webContentsId,
      );
    browserSession.webRequest.onHeadersReceived(
      { urls: ["http://*/*", "https://*/*"] },
      (details, callback) => {
        const requestView = details.resourceType === "mainFrame"
          ? findRequestView(details.webContentsId)
          : null;
        if (
          requestView
          && !requestView.__brizoIsPdf
          && responseHeadersContainPdf(details.responseHeaders)
        ) {
          callback({ cancel: true });
          clearBrowserNavigationTimeout(requestView);
          requestView.__brizoNavigationPending = false;
          requestView.__brizoNavigationViewport = null;
          requestView.__brizoContentReady = true;
          requestView.__brizoNavigationPreview = "";
          if (requestView === browserView) setBrowserViewVisible(browserVisible);
          requestOpenPdfTab(details.url, {
            title: filenameForPdfSource(details.url),
          });
          return;
        }
        callback({});
      },
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
    if (isLikelyPdfUrl(url)) {
      requestOpenPdfTab(url, { title: filenameForPdfSource(url) });
    } else {
      requestOpenUrlTab(url, { kind: "web" });
    }
    return { action: "deny" };
  });
  installWebContextMenus(view.webContents, window, (url) => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    mainWindow.webContents.send("bean-browser:open-url-tab", url);
  }, (selectedText) => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    mainWindow.webContents.send("bean-browser:ask-selection", selectedText);
  });

  view.webContents.on("before-input-event", (event, input) => {
    if (input.type === "keyDown" || input.type === "rawKeyDown") {
      publishBrowserActivation();
    }
    if (view.__brizoIsPdf || !isPageZoomShortcut(input)) return;
    event.preventDefault();
    applyBrowserPageZoomPolicy(view);
  });
  view.webContents.on("zoom-changed", (event) => {
    if (view.__brizoIsPdf) return;
    event.preventDefault();
    applyBrowserPageZoomPolicy(view);
  });
  view.webContents.on("will-navigate", (event, url) => {
    if (view.__brizoIsPdf || !isLikelyPdfUrl(url)) return;
    event.preventDefault();
    requestOpenPdfTab(url, { title: filenameForPdfSource(url) });
  });
  view.webContents.on("did-start-navigation", (_event, url, isSameDocument, isMainFrame) => {
    if (!isMainFrame || isSameDocument) return;
    applyBrowserPageZoomPolicy(view);
    view.__brizoNavigationGeneration += 1;
    view.__brizoRevealGeneration = -1;
    view.__brizoPaintReadySignal = "";
    logBrowserNavigation("started", view, url);
    // Toolbar/history navigation has already installed a frozen outgoing frame.
    // Site links, script reloads and redirects reuse the last verified painted
    // frame so every main-frame transition follows the same no-white-screen path.
    if (!view.__brizoNavigationPending) {
      freezeBrowserNavigationViewport(view);
      view.__brizoNavigationPending = true;
      view.__brizoNavigationPreview = view.__brizoNavigationPreview
        || view.__brizoLastPaintPreview
        || "";
      view.__brizoContentReady = false;
      if (browserView === view) setBrowserViewVisible(browserVisible);
    }
    if (browserView !== view) return;
    browserNavigationGeneration += 1;
    if (!browserErrorPageActive) browserError = "";
    pageFaviconUrl = "";
    publishBrowserState();
  });
  view.webContents.on("did-first-visually-non-empty-paint", () => {
    view.__brizoVisualPaintGeneration = view.__brizoNavigationGeneration;
    logBrowserNavigation("first-visual-paint", view, view.webContents.getURL());
    if (!view.__brizoContentReady && view.__brizoNavigationPending) {
      revealBrowserViewAfterFirstFrame(view, view.__brizoNavigationGeneration);
    }
  });
  view.webContents.on("dom-ready", () => {
    applyBrowserPageZoomPolicy(view);
    view.__brizoDomReadyGeneration = view.__brizoNavigationGeneration;
    if (view.__brizoIsPdf) {
      clearBrowserNavigationTimeout(view);
      view.__brizoContentReady = true;
      view.__brizoNavigationPending = false;
      view.__brizoNavigationPreview = "";
      if (browserView === view) {
        pageBackgroundColor = view.__brizoBackgroundColor || pdfReaderBackgroundColor;
        setBrowserViewVisible(browserVisible);
        publishBrowserState();
      }
      releaseBrowserNavigationViewportAfterPaint(view, view.__brizoNavigationGeneration);
      setTimeout(async () => {
        const webContents = getLiveViewWebContents(view);
        if (!webContents || !view.__brizoIsPdf) return;
        const sampledColor = await sampleRenderedTopEdgeColor(webContents);
        if (!sampledColor) return;
        view.__brizoBackgroundColor = sampledColor;
        if (browserView === view) {
          pageBackgroundColor = sampledColor;
          publishBrowserState();
        }
      }, 80);
      return;
    }
    revealBrowserViewAfterFirstFrame(view, view.__brizoNavigationGeneration);
  });
  view.webContents.on("did-finish-load", () => {
    view.__brizoFinishedGeneration = view.__brizoNavigationGeneration;
    logBrowserNavigation("finished", view, view.webContents.getURL());
    clearBrowserNavigationTimeout(view);
    if (!view.__brizoContentReady) {
      revealBrowserViewAfterFirstFrame(view, view.__brizoNavigationGeneration);
    }
    if (view.__brizoIsPdf) return;
    installPageScrollbarBehavior(view.webContents).catch((error) => {
      console.error("[scrollbars]", error instanceof Error ? error.message : String(error));
    });
    if (browserView !== view) return;
    setTimeout(() => updatePageBackgroundColor(), 80);
    setTimeout(() => updatePageBackgroundColor(), 420);
    setTimeout(() => updatePageBackgroundColor(), 1_200);
    setTimeout(() => updatePageBackgroundColor(), 2_500);
  });
  view.webContents.on("page-favicon-updated", async (_event, favicons) => {
    const nextFavicon = favicons.find((url) => /^(https?:|data:image\/)/i.test(url)) || "";
    const localFavicon = await cacheFaviconForPage(view.webContents.getURL(), nextFavicon);
    view.__brizoFaviconUrl = localFavicon || nextFavicon;
    if (browserView !== view) return;
    pageFaviconUrl = view.__brizoFaviconUrl;
    publishBrowserState();
  });

  view.webContents.on("did-navigate", async (_event, url, httpResponseCode) => {
    logBrowserNavigation("committed", view, url, { httpResponseCode });
    applyBrowserPageZoomPolicy(view);
    if (view.__brizoIsPdf && view.__brizoPdfSource) {
      view.__brizoDisplayUrl = view.__brizoPdfSource;
    } else if (!view.__brizoErrorPageActive
      && !isInternalBrowserErrorUrl(url)
      && typeof url === "string"
      && !url.startsWith("data:text/html;charset=utf-8,")) {
      view.__brizoDisplayUrl = url;
    }
    const localFavicon = await cachedFaviconDataUrl(url);
    if (localFavicon && !view.webContents.isDestroyed() && view.webContents.getURL() === url) {
      view.__brizoFaviconUrl = localFavicon;
      if (browserView === view) {
        pageFaviconUrl = localFavicon;
        publishBrowserState();
      }
    }
    if (browserView !== view) return;
    if (Number(httpResponseCode) >= 400) {
      void showBrowserErrorPage({ statusCode: Number(httpResponseCode), url });
      return;
    }
    if (!browserErrorPageActive) browserError = "";
    if (!browserErrorPageActive) {
      browserDisplayUrl = view.__brizoIsPdf && view.__brizoPdfSource
        ? view.__brizoPdfSource
        : typeof url === "string" && !url.startsWith("data:text/html;charset=utf-8,")
          ? url
          : browserDisplayUrl;
    }
    publishBrowserState();
  });
  view.webContents.on("did-navigate-in-page", (_event, url) => {
    if (view.__brizoIsPdf && view.__brizoPdfSource) {
      view.__brizoDisplayUrl = view.__brizoPdfSource;
    } else if (!view.__brizoErrorPageActive
      && !isInternalBrowserErrorUrl(url)
      && typeof url === "string"
      && !url.startsWith("data:text/html;charset=utf-8,")) {
      view.__brizoDisplayUrl = url;
    }
    if (browserView !== view) return;
    if (!browserErrorPageActive) browserError = "";
    if (!browserErrorPageActive) {
      browserDisplayUrl = view.__brizoIsPdf && view.__brizoPdfSource
        ? view.__brizoPdfSource
        : typeof url === "string" && !url.startsWith("data:text/html;charset=utf-8,")
          ? url
          : browserDisplayUrl;
    }
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
      logBrowserNavigation("failed", view, validatedUrl, { errorCode, errorDescription });
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

  if (browserSmokeTest && ownerTabId === "__smoke__") {
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
          && browserView.getVisible() === false
          && browserView.getBounds().width === browserBounds.width
          && browserView.getBounds().height === browserBounds.height;
        result.reportedBackgroundColor = pageBackgroundColor;
        setBrowserViewVisible(true);
        await new Promise((resolve) => setTimeout(resolve, 50));
        result.initialExternalPageZoomFactor = view.webContents.getZoomFactor();
        view.webContents.setZoomFactor(1.8);
        result.externalPageZoomMutationApplied =
          Math.abs(view.webContents.getZoomFactor() - 1.8) <= 0.001;
        activateBrowserView(view, "__smoke__");
        result.externalPageZoomResetOnActivation =
          Math.abs(view.webContents.getZoomFactor() - 1) <= 0.001;
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
        await view.webContents.executeJavaScript(`
          (() => {
            const canvas = document.createElement("canvas");
            canvas.id = "brizo-rendered-top-edge-fixture";
            canvas.width = Math.max(1, innerWidth);
            canvas.height = 48;
            canvas.style.cssText = "position:fixed;inset:0 0 auto;width:100%;height:48px;z-index:2147483647";
            const context = canvas.getContext("2d");
            context.fillStyle = "rgb(112,176,230)";
            context.fillRect(0, 0, canvas.width, canvas.height);
            document.body.appendChild(canvas);
          })()
        `);
        await new Promise((resolve) => setTimeout(resolve, 120));
        await updatePageBackgroundColor();
        result.renderedTopEdgeColorDetected = (() => {
          const channels = pageBackgroundColor.match(/\d+(?:\.\d+)?/g)?.map(Number) || [];
          return channels.length >= 3
            && Math.abs(channels[0] - 112) <= 8
            && Math.abs(channels[1] - 176) <= 8
            && Math.abs(channels[2] - 230) <= 8;
        })();
        await view.webContents.executeJavaScript(
          `document.querySelector("#brizo-rendered-top-edge-fixture")?.remove()`,
        );
        await updatePageBackgroundColor();
        result.interactionsAfterLoad = browserInteractionCount;
        const layoutBeforeOverlay = await view.webContents.executeJavaScript(`
          (() => {
            const spacer = document.createElement("div");
            spacer.id = "brizo-overlay-retention-fixture";
            spacer.style.height = "2400px";
            document.body.appendChild(spacer);
            window.__brizoOverlayRetainedState = 73;
            scrollTo(0, 320);
            return { height: innerHeight, scrollY, width: innerWidth };
          })()
        `);
        setBrowserViewVisible(false);
        const layoutWhileOverlay = await view.webContents.executeJavaScript(`
          ({
            height: innerHeight,
            retainedState: window.__brizoOverlayRetainedState,
            scrollY,
            width: innerWidth,
          })
        `);
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
        const layoutAfterOverlay = await view.webContents.executeJavaScript(`
          ({
            height: innerHeight,
            retainedState: window.__brizoOverlayRetainedState,
            scrollY,
            width: innerWidth,
          })
        `);
        result.overlayHidePreservesLayoutState =
          layoutBeforeOverlay.width === layoutWhileOverlay.width
          && layoutBeforeOverlay.width === layoutAfterOverlay.width
          && layoutBeforeOverlay.height === layoutWhileOverlay.height
          && layoutBeforeOverlay.height === layoutAfterOverlay.height
          && layoutBeforeOverlay.scrollY === layoutWhileOverlay.scrollY
          && layoutBeforeOverlay.scrollY === layoutAfterOverlay.scrollY
          && layoutWhileOverlay.retainedState === 73
          && layoutAfterOverlay.retainedState === 73;
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
          && browserView.getVisible() === false
          && browserView.getBounds().width === browserBounds.width
          && browserView.getBounds().height === browserBounds.height;
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
        setBrowserViewVisible(true);
        navigateBrowserUrl(retainedUrl, "retention-a");
        const retainedView = browserViews.get("retention-a");
        result.navigationWaitsForFirstFrame =
          retainedView.__brizoNavigationPending === true
          && retainedView.__brizoContentReady === false;
        if (retainedView.webContents.isLoading()) {
          await new Promise((resolve) => retainedView.webContents.once("did-finish-load", resolve));
        }
        for (let attempt = 0; attempt < 25 && !retainedView.__brizoContentReady; attempt += 1) {
          await new Promise((resolve) => setTimeout(resolve, 40));
        }
        setBrowserViewVisible(true);
        result.navigationViewRevealedAfterFirstFrame =
          retainedView.__brizoContentReady === true
          && retainedView.getBounds().width > 0
          && retainedView.getBounds().height > 0;
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
        const retainedPreview = await captureMeaningfulPreview(retainedView.webContents);
        retainedView.__brizoLastPaintPreview = retainedPreview;
        retainedView.__brizoNavigationPreview = retainedPreview;
        retainedView.__brizoContentReady = false;
        retainedView.__brizoNavigationPending = true;
        beginBrowserNavigation(retainedView, () => {});
        await new Promise((resolve) => setTimeout(resolve, 120));
        result.repeatedNavigationKeepsLastPaint = Boolean(retainedPreview)
          && retainedView.__brizoNavigationPreview === retainedPreview;
        setBrowserViewVisible(true);
        const pendingBounds = retainedView.getBounds();
        const snapshotBounds = retainedView.__brizoSnapshotView.getBounds();
        result.pendingNavigationKeepsFullPaintBounds =
          pendingBounds.width === browserBounds.width
          && pendingBounds.height === browserBounds.height
          && pendingBounds.x === browserFrameInset
          && snapshotBounds.width === browserBounds.width
          && snapshotBounds.height === browserBounds.height;
        const boundsBeforeNavigationResize = { ...browserBounds };
        setBrowserBounds({
          ...browserBounds,
          width: Math.max(320, browserBounds.width - 96),
        });
        result.pendingNavigationFreezesViewport =
          retainedView.getBounds().width === pendingBounds.width
          && retainedView.__brizoSnapshotView.getBounds().width === snapshotBounds.width;
        setBrowserBounds(boundsBeforeNavigationResize);
        retainedView.__brizoNavigationPending = false;
        retainedView.__brizoContentReady = true;
        retainedView.__brizoNavigationPreview = "";
        retainedView.__brizoNavigationViewport = null;
        setBrowserViewVisible(true);
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
        const pdfReaderDirectory = path.join(projectRoot, "tmp", "pdfs");
        await mkdir(pdfReaderDirectory, { recursive: true });
        const pdfReaderPath = path.join(pdfReaderDirectory, "brizo-reader-smoke.pdf");
        const pdfReaderScreenshotPath = path.join(pdfReaderDirectory, "brizo-reader-smoke.png");
        const { createSearchResultArticle, renderArticlePdf } = await loadArticlePdfModule();
        const pdfReaderBytes = await renderArticlePdf(createSearchResultArticle({
          answer: "Brizo PDF reader fixture keeps printable text and extracts key points.",
          query: "Brizo PDF Reader",
          sources: [],
        }));
        await writeFile(pdfReaderPath, pdfReaderBytes);
        const pdfReaderUrl = pathToFileURL(pdfReaderPath).href;
        const pdfReaderStartedAt = Date.now();
        requestOpenPdfTab(pdfReaderUrl, { title: "Brizo PDF Reader" });
        for (let attempt = 0; attempt < 80; attempt += 1) {
          const state = getBrowserState();
          if (state.isPdf && state.pdfSourceUrl === pdfReaderUrl && browserView?.__brizoContentReady) break;
          await new Promise((resolve) => setTimeout(resolve, 50));
        }
        const pdfReaderView = browserView;
        result.pdfReaderReadyMs = Date.now() - pdfReaderStartedAt;
        const extractedPdfReader = await extractPdfText(pdfReaderUrl, pdfReaderView.webContents.session);
        const pdfReaderState = getBrowserState();
        result.pdfReaderDiagnostics = {
          bounds: pdfReaderView.getBounds(),
          browserBounds,
          contentReady: pdfReaderView.__brizoContentReady,
          isPdf: pdfReaderState.isPdf,
          sourceMatches: pdfReaderState.pdfSourceUrl === pdfReaderUrl,
          visible: pdfReaderView.getVisible(),
        };
        result.pdfReaderOpened =
          pdfReaderState.isPdf === true
          && pdfReaderState.pdfSourceUrl === pdfReaderUrl
          && pdfReaderView.getVisible() === true
          && pdfReaderView.getBounds().width === browserBounds.width;
        result.pdfReaderExtractedText =
          extractedPdfReader.pageCount >= 1
          && extractedPdfReader.text.includes("Brizo PDF Reader")
          && extractedPdfReader.text.includes("extracts key points");
        result.pdfReaderToolbar = await mainWindow.webContents.executeJavaScript(`
          (() => {
            const actions = document.querySelector(".browser-actions");
            const bookmark = actions?.querySelector(".bookmark-control");
            const pdf = actions?.querySelector(".pdf-export-button");
            return Boolean(bookmark && pdf)
              && Boolean(bookmark.compareDocumentPosition(pdf) & Node.DOCUMENT_POSITION_FOLLOWING)
              && !actions.querySelector('[aria-label="总结当前页面"]')
              && !actions.querySelector('[aria-label="BrowserSkill 浏览器命令"]')
              && !document.querySelector('[aria-label="打印 PDF"]');
          })()
        `);
        result.pdfReaderForegroundScopes = await mainWindow.webContents.executeJavaScript(`
          (() => {
            const shell = document.querySelector(".app-shell");
            const toolbar = document.querySelector(".browser-toolbar");
            const foreground = shell
              ? getComputedStyle(shell).getPropertyValue("--shell-foreground").trim()
              : "";
            return {
              bookmarksStayDark: !shell?.classList.contains("uses-light-shell-foreground")
                && foreground === "#5f665f",
              toolbarUsesPdfContrast: toolbar?.classList.contains("uses-light-foreground") === true,
            };
          })()
        `);
        await new Promise((resolve) => setTimeout(resolve, 1_200));
        const pdfReaderScreenshot = await pdfReaderView.webContents.capturePage();
        await writeFile(pdfReaderScreenshotPath, pdfReaderScreenshot.toPNG());
        result.pdfReaderScreenshotBytes = pdfReaderScreenshot.toPNG().length;
        const staleView = createBrowserView(mainWindow, "destroyed-view-fixture");
        browserViews.set("destroyed-view-fixture", staleView);
        const staleWebContents = staleView.webContents;
        await new Promise((resolve) => {
          staleWebContents.once("destroyed", resolve);
          staleWebContents.close();
        });
        // Recreate the exact stale-Map condition that previously crashed when
        // selecting a Scout search tab and publishing new browser bounds.
        browserViews.set("destroyed-view-fixture", staleView);
        setBrowserViewVisible(true);
        result.destroyedViewPrunedSafely = !browserViews.has("destroyed-view-fixture");
        const passed =
          result.title === "Example Domain" &&
          result.heading === "Example Domain" &&
          result.addressValue === "" &&
          result.startupNewTabPageVisible &&
          result.beanScrollbars === "ready" &&
          result.backgroundThrottling === true &&
          result.backgroundThrottlingWhileVisible === false &&
          Math.abs(result.initialExternalPageZoomFactor - 1) <= 0.001 &&
          result.externalPageZoomMutationApplied &&
          result.externalPageZoomResetOnActivation &&
          result.browserViewHiddenAtStartup &&
          result.hydratedTopEdgeColorDetected &&
          result.renderedTopEdgeColorDetected &&
          result.overlayHidePreservesLayoutState &&
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
          result.navigationWaitsForFirstFrame &&
          result.navigationViewRevealedAfterFirstFrame &&
          result.repeatedNavigationKeepsLastPaint &&
          result.pendingNavigationKeepsFullPaintBounds &&
          result.multiTabStateRetained &&
          result.multiTabViewCount === 2 &&
          result.errorPageLogoLoaded &&
          result.errorPageKeepsRequestedUrl &&
          result.pdfReaderOpened &&
          result.pdfReaderExtractedText &&
          result.pdfReaderToolbar &&
          Object.values(result.pdfReaderForegroundScopes).every(Boolean) &&
          result.pdfReaderReadyMs < 2_500 &&
          result.pdfReaderScreenshotBytes > 1_000 &&
          result.destroyedViewPrunedSafely &&
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
        const {
          createSearchResultArticle,
          extractReadableArticle,
          renderArticlePdf,
        } = await loadArticlePdfModule();
        const article = await extractReadableArticle(view.webContents);
        const pdf = await renderArticlePdf(article);
        const searchArticle = createSearchResultArticle({
          query: "深圳市的产业结构是什么",
          answer: "深圳产业结构以第三产业为主[1]。\n\n## 核心特征\n- 先进制造业提供重要支撑。",
          sources: [{
            domain: "sz.gov.cn",
            title: "深圳市国民经济和社会发展统计公报",
            url: "https://www.sz.gov.cn/",
          }],
        });
        const searchPdf = await renderArticlePdf(searchArticle);
        const outputDirectory = app.isPackaged
          ? path.join(app.getPath("temp"), "brizo-pdf-smoke")
          : path.join(projectRoot, "output", "pdf");
        const outputPath = path.join(outputDirectory, "bean-article-export-smoke.pdf");
        const searchOutputPath = path.join(outputDirectory, "brizo-search-result-smoke.pdf");
        await mkdir(outputDirectory, { recursive: true });
        await writeFile(outputPath, pdf);
        await writeFile(searchOutputPath, searchPdf);

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
          pdf.length > 5_000 &&
          searchArticle.content.includes("深圳产业结构以第三产业为主") &&
          searchArticle.content.includes("深圳市国民经济和社会发展统计公报") &&
          searchPdf.subarray(0, 4).toString() === "%PDF" &&
          searchPdf.length > 5_000;

        console.log(`[pdf-smoke] ${JSON.stringify({
          byline: article.byline,
          bytes: pdf.length,
          outputPath,
          searchBytes: searchPdf.length,
          searchOutputPath,
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

async function resolveBoundModelProvider(request = {}) {
  const store = await readModelGuardStore();
  const requestedModel = typeof request?.model === "string" ? request.model : "";
  const storedProvider = store.providers.find((item) =>
    Array.isArray(item.models) && item.models.includes(requestedModel)
  ) || store.providers.find((item) => item.id === store.defaultId) || store.providers[0];
  const provider = withKnownProviderDefaults(storedProvider);
  if (!provider?.baseUrl) return null;
  const apiKey = decryptModelKey(storedProvider);
  const model = provider.models?.includes(requestedModel)
    ? requestedModel
    : chooseFastModel(provider.models || [], provider.name);
  if (!apiKey || !model) return null;
  return {
    apiKey,
    baseUrl: provider.baseUrl,
    model,
    providerName: provider.name || "默认 API",
  };
}

async function resolveDeepSeekProvider() {
  const store = await readModelGuardStore();
  const storedProvider = store.providers.find((candidate) => {
    const provider = withKnownProviderDefaults(candidate);
    return /deepseek|deep seek/i.test([
      provider?.name,
      provider?.baseUrl,
      ...(Array.isArray(provider?.models) ? provider.models : []),
    ].filter(Boolean).join(" "));
  });
  if (!storedProvider) return null;
  const provider = withKnownProviderDefaults(storedProvider);
  const apiKey = decryptModelKey(storedProvider);
  const model = chooseDeepSeekTextModel(provider.models || [], provider.name);
  if (!provider?.baseUrl || !apiKey || !model) return null;
  return { apiKey, baseUrl: provider.baseUrl, model, providerName: provider.name || "DeepSeek" };
}

async function selectedTabLocalResults(payload) {
  const tab = payload?.context?.tab;
  if (!tab?.url) return [];
  const view = typeof tab.id === "string" ? browserViews.get(tab.id) : null;
  const webContents = getLiveViewWebContents(view);
  let body = "";
  if (webContents) {
    try {
      body = await webContents.executeJavaScript(`String(document.body?.innerText || "").replace(/\\s+/g, " ").trim().slice(0, 24000)`);
    } catch {
      body = "";
    }
  }
  return [makeResult({
    url: tab.url,
    title: tab.title || tab.url,
    snippet: body.slice(0, 400) || "用户主动插入的浏览器标签页。",
    body,
    bodySource: body ? "cheerio" : "snippet",
    hits: [{ provider: "local", rank: 0, query: payload.query }],
  })];
}

function getScoutSearchService() {
  if (scoutSearchService) return scoutSearchService;
  const serper = createSerperClient({ getApiKey: () => modelGuard.readServiceKey("serper") });
  const bocha = createBochaClient({ getApiKey: () => modelGuard.readServiceKey("bocha") });
  const legacy = createLegacyClient();
  const scrapeCache = createScrapeCache({
    filePath: path.join(app.getPath("userData"), "scout-scrape-cache.json"),
  });
  scoutSearchService = createSearchService({
    answerEngine: createAnswerEngine({ llm: llmClient }),
    serper,
    bocha,
    legacy,
    scrapeCache,
    hasServiceKey: async (id) => Boolean(await modelGuard.readServiceKey(id)),
    getLocalResults: selectedTabLocalResults,
  });
  return scoutSearchService;
}

async function searchWithBoundModel(payload) {
  const query = typeof payload?.query === "string" ? payload.query.trim() : "";
  if (!query) return { status: "error", message: "请输入搜索内容。" };
  const contextTab = payload?.context?.tab;
  const attachmentNames = Array.isArray(payload?.context?.attachmentNames)
    ? payload.context.attachmentNames.filter((name) => typeof name === "string").slice(0, 8)
    : [];
  const context = [
    contextTab?.url ? `用户插入的标签页：${contextTab.title || contextTab.url}（${contextTab.url}）` : "",
    attachmentNames.length ? `用户附加的文件名：${attachmentNames.join("、")}。不要声称读取了文件内容。` : "",
  ].filter(Boolean).join("\n");
  try {
    const response = await llmClient.callChat({
      model: typeof payload?.model === "string" ? payload.model : "",
      messages: [
        {
          role: "system",
          content: payload?.systemPrompt || "你是 Brizo 的快速回答模型。明确区分已知事实与推测。当前是模型直连回答，不要声称已经联网搜索或引用了网页来源。",
        },
        { role: "user", content: context ? `${query}\n\n${context}` : query },
      ],
      timeoutMs: Math.min(90_000, Math.max(5_000, Number(payload?.timeoutMs) || 45_000)),
    });
    const message = response.content;
    if (!message) throw new Error("模型没有返回文字内容");
    return {
      status: "success",
      message,
      sources: [],
      providerLabel: `${response.providerName || "自定义 API"} · 直接回答`,
      modelLabel: response.model,
      mode: "direct",
    };
  } catch (error) {
    console.error("[bound-model-search]", error instanceof Error ? error.message : String(error));
    return {
      status: "error",
      message: error?.name === "AbortError"
        ? "默认模型响应超时，请稍后再试。"
        : `默认模型调用失败：${error.message}`,
    };
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

async function saveCurrentPdf() {
  const source = browserView?.__brizoPdfSource;
  const activeWebContents = getLiveViewWebContents(browserView);
  if (!source || !activeWebContents) {
    return { status: "error", message: "当前页面不是可下载的 PDF。" };
  }
  const filename = filenameForPdfSource(source);
  const result = await dialog.showSaveDialog(mainWindow, {
    defaultPath: path.join(app.getPath("downloads"), filename),
    filters: [{ name: "PDF 文档", extensions: ["pdf"] }],
    properties: ["createDirectory", "showOverwriteConfirmation"],
    title: "下载 PDF",
  });
  if (result.canceled || !result.filePath) return { status: "canceled" };
  try {
    if (source.startsWith("file:")) {
      const sourcePath = fileURLToPath(source);
      if (path.resolve(sourcePath) !== path.resolve(result.filePath)) {
        await copyFile(sourcePath, result.filePath);
      }
    } else {
      const bytes = await readPdfSource(source, activeWebContents.session);
      await writeFile(result.filePath, bytes);
    }
    return { status: "saved", filePath: result.filePath };
  } catch (error) {
    return {
      status: "error",
      message: `PDF 下载失败：${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

function isCtripPage(webContents) {
  try {
    const hostname = new URL(webContents.getURL()).hostname.toLocaleLowerCase();
    return hostname === "ctrip.com" || hostname.endsWith(".ctrip.com");
  } catch {
    return false;
  }
}

function isTaobaoPage(webContents) {
  try {
    const hostname = new URL(webContents.getURL()).hostname.toLocaleLowerCase();
    return hostname === "taobao.com" || hostname.endsWith(".taobao.com");
  } catch {
    return false;
  }
}

async function withBrowserCommandDeadline(promise, timeout, message) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(message)), timeout);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function runCtripFlightCommand({ activeWebContents, intent }) {
  const url = buildCtripFlightUrl(intent);
  const previousBackgroundThrottling = activeWebContents.getBackgroundThrottling();
  activeWebContents.setBackgroundThrottling(false);
  try {
    if (!navigateBrowserUrl(url, browserOwnerTabId)) {
      throw new Error("无法打开携程航班结果页。");
    }
    const initialResult = await waitForCtripFlightResults(activeWebContents);
    const result = await collectCtripFlightResults(activeWebContents) || initialResult;
    const expectedRoute = `oneway-${intent.origin.code.toLocaleLowerCase()}-${intent.destination.code.toLocaleLowerCase()}`;
    const resultUrl = new URL(result.url || initialResult.url);
    if (!resultUrl.href.toLocaleLowerCase().includes(expectedRoute)
      || resultUrl.searchParams.get("depdate") !== intent.date) {
      throw new Error("携程返回的路线或日期与命令不一致，已停止生成结果截图。");
    }
    const flights = selectCtripFlights(result.cards, intent);
    if (!flights.length) {
      throw new Error(intent.departureWindow
        ? `没有找到 ${intent.departureWindow.label} 起飞的合格航班。`
        : "没有从携程结果中识别到有效航班价格。");
    }
    const highlightedCount = await highlightCtripFlights(
      activeWebContents,
      flights.map((flight) => flight.index),
    );
    if (!highlightedCount) throw new Error("最低价航班已找到，但无法在页面中定位对应卡片。");

    const screenshotDirectory = path.join(app.getPath("pictures"), "Brizo Screenshots");
    await mkdir(screenshotDirectory, { recursive: true });
    const screenshotPath = path.join(
      screenshotDirectory,
      `Brizo-${intent.origin.code}-${intent.destination.code}-${intent.date}-${Date.now()}.png`,
    );
    const { captureAndSaveScreenshot } = await loadBrowserToolsModule();
    await captureAndSaveScreenshot({
      mode: "visible-debugger",
      outputPath: screenshotPath,
      webContents: activeWebContents,
      window: mainWindow,
    });
    const screenshotBytes = await readFile(screenshotPath);
    const flightDetails = flights.map(({ airline, airports, flightNumber, price, times }) => ({
      airline, airports, flightNumber, price, times,
    }));
    const priceSummary = [...new Set(flights.map((flight) => `¥${flight.price}`))].join("、");
    const resultSummary = intent.wantsCheapest
      ? `最低价为 ${priceSummary}，共 ${flights.length} 个并列最低价航班`
      : intent.departureWindow
        ? `${intent.departureWindow.label} 起飞的航班共 ${flights.length} 个，价格为 ${priceSummary}`
        : `找到 ${flights.length} 个航班，价格为 ${priceSummary}`;
    return {
      status: "success",
      message: `已确认 ${intent.date} ${intent.origin.names[0]}→${intent.destination.names[0]}：${resultSummary}；截图中的红框为合格结果。`,
      date: intent.date,
      flights: flightDetails,
      screenshotDataUrl: `data:image/png;base64,${screenshotBytes.toString("base64")}`,
      screenshotPath,
      url: result.url,
    };
  } finally {
    await clearCtripFlightHighlights(activeWebContents);
    if (!activeWebContents.isDestroyed()) {
      activeWebContents.setBackgroundThrottling(previousBackgroundThrottling);
    }
  }
}

async function runTaobaoPriceCommand({ activeWebContents, intent }) {
  const previousBackgroundThrottling = activeWebContents.getBackgroundThrottling();
  activeWebContents.setBackgroundThrottling(false);
  try {
    const currentQuery = taobaoQueryFromUrl(activeWebContents.getURL());
    if (currentQuery.toLocaleLowerCase() !== intent.query.toLocaleLowerCase()) {
      const url = buildTaobaoSearchUrl(intent.query);
      if (!navigateBrowserUrl(url, browserOwnerTabId)) throw new Error("无法打开淘宝搜索页。");
    }
    const result = await waitForTaobaoPriceResults(activeWebContents);
    const resultQuery = taobaoQueryFromUrl(result.url);
    if (resultQuery.toLocaleLowerCase() !== intent.query.toLocaleLowerCase()) {
      throw new Error("淘宝返回的搜索词与命令不一致，已停止读取。");
    }
    const items = selectDistinctPriceItems(result.items, 5);
    if (items.length < 2) throw new Error("当前页面没有足够的不同商品价格可供比较。");
    const highlightedCount = await highlightTaobaoItems(
      activeWebContents,
      items.map((item) => item.index),
    );
    if (!highlightedCount) throw new Error("已读取商品价格，但无法在当前视口标出对应商品。");

    const screenshotDirectory = path.join(app.getPath("pictures"), "Brizo Screenshots");
    await mkdir(screenshotDirectory, { recursive: true });
    const screenshotPath = path.join(
      screenshotDirectory,
      `Brizo-Taobao-${intent.query.replace(/[^\p{Letter}\p{Number}]+/gu, "-").slice(0, 40)}-${Date.now()}.png`,
    );
    const { captureAndSaveScreenshot } = await loadBrowserToolsModule();
    await captureAndSaveScreenshot({
      mode: "visible-debugger",
      outputPath: screenshotPath,
      webContents: activeWebContents,
      window: mainWindow,
    });
    const screenshotBytes = await readFile(screenshotPath);
    return {
      status: "success",
      message: `已从当前淘宝“${intent.query}”结果中找到 ${items.length} 个不同价格：${items.map((item) => `¥${item.price}`).join("、")}。截图中的红框为对应商品。`,
      items: items.map(({ price, title, url }) => ({ price, title, url })),
      screenshotDataUrl: `data:image/png;base64,${screenshotBytes.toString("base64")}`,
      screenshotPath,
      url: result.url,
    };
  } finally {
    await clearTaobaoHighlights(activeWebContents);
    if (!activeWebContents.isDestroyed()) {
      activeWebContents.setBackgroundThrottling(previousBackgroundThrottling);
    }
  }
}

async function runBrowserCommandWithBoundModel(payload, options = {}) {
  const explicitWebContents = options.webContents;
  const activeWebContents = explicitWebContents || getLiveViewWebContents(browserView);
  const usesCurrentBrowserTab = !explicitWebContents;
  if (!activeWebContents || activeWebContents.isDestroyed() || (usesCurrentBrowserTab && browserView?.__brizoIsPdf)) {
    return { status: "error", message: "请先打开一个普通网页，再运行浏览器命令。" };
  }
  const ctripIntent = options.webContents ? null : parseCtripFlightCommand(payload?.command);
  if (ctripIntent && isCtripPage(activeWebContents)) {
    try {
      return await withBrowserCommandDeadline(
        runCtripFlightCommand({ activeWebContents, intent: ctripIntent }),
        40_000,
        "携程页面在 40 秒内没有完成结果读取，已自动停止。",
      );
    } catch (error) {
      return {
        status: "error",
        message: `携程航班查询失败：${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }
  const taobaoIntent = options.webContents
    ? null
    : parseTaobaoPriceCommand(payload?.command, activeWebContents.getURL());
  if (taobaoIntent && isTaobaoPage(activeWebContents)) {
    try {
      return await withBrowserCommandDeadline(
        runTaobaoPriceCommand({ activeWebContents, intent: taobaoIntent }),
        35_000,
        "淘宝页面在 35 秒内没有完成价格读取，已自动停止。",
      );
    } catch (error) {
      return {
        status: "error",
        message: `淘宝价格读取失败：${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }
  const store = await readModelGuardStore();
  const storedProvider = store.providers.find((provider) => provider.id === store.defaultId)
    || store.providers[0];
  const provider = withKnownProviderDefaults(storedProvider);
  const apiKey = decryptModelKey(storedProvider);
  if (!provider?.baseUrl || !apiKey) {
    return { status: "error", message: "请先在“大模型护航”中绑定并选择默认 API。" };
  }
  const model = sortFastModels(provider.models || [], provider.name).find((candidate) =>
    !/(reasoner|reasoning|thinking|(^|[/_.-])r1($|[/_.-])|(^|[/_.-])o[134]($|[/_.-]))/i.test(candidate)
  ) || "";
  if (!model) return { status: "error", message: "默认 API 中没有可用的快速文本模型。" };

  const planNextAction = async ({ command, history, snapshot, step }) => {
    options.signal?.throwIfAborted();
    const controller = new AbortController();
    const abortPlanner = () => controller.abort(options.signal?.reason);
    options.signal?.addEventListener("abort", abortPlanner, { once: true });
    const timeout = setTimeout(() => controller.abort(), 40_000);
    try {
      const messages = [
        {
          role: "system",
          content: [
            "你是 Brizo 内置的腾讯 BrowserSkill 规则适配器。根据用户给出的一个有边界目标和当前页面快照，一次只规划一个最短动作。",
            "严格遵循 BrowserSkill 生命周期：建立隔离会话；需要找网站时先用搜索引擎找到最相关的真实网站；每次动作前观察当前页面；页面或 DOM 变化后旧引用立即失效并重新观察；目标满足立即停止；最后清理会话。",
            "只输出一个 JSON 对象，不要 Markdown、解释或思考。",
            "可用动作：navigate(url)、click(ref)、fill(ref,value)、select(ref,value)、press(key)、scroll(amount)、back、forward、reload、done(message)。",
            "只能使用快照中当前可见的 @eN 引用；页面变化后旧引用失效。先完成目标，确认已完成后立即 done，禁止成功后继续操作。",
            "快照中的 value 是控件当前值，历史中的 result 是动作结果。result 为 already-satisfied 时禁止重复同一动作；如果整个目标已满足必须立即 done，否则规划一个不同的必要动作。",
            "不要为了验证而重复填写、重复导航或重复点击。根据当前 URL、标题、页面文字、控件值和执行历史判断是否完成。",
            "填写搜索框后，Brizo 会自动点击其右侧搜索键或按 Enter 提交；不要再次填写相同文字，也绝不能把设置、偏好或更多菜单当作搜索按钮反复点击。",
            "遇到覆盖当前网页的登录或注册弹窗时，优先关闭或取消弹窗后继续原目标；禁止填写账号密码、尝试登录、绕过认证或把整页登录页面误当作弹窗关闭。",
            "不要索取、读取或泄露密码、Cookie、令牌和认证信息。不要绕过验证码、登录、系统确认或网站安全机制。",
            "对于付款、购买、发送、发布、删除、授权等有外部影响的动作，只有用户命令明确要求时才可规划；否则 done 并说明需要用户明确确认。",
            "JSON 格式固定为：{\"action\":\"click|fill|select|press|scroll|navigate|back|forward|reload|done\",\"ref\":\"@e1\",\"value\":\"\",\"url\":\"\",\"key\":\"Enter\",\"amount\":560,\"message\":\"\"}",
          ].join("\n"),
        },
        {
          role: "user",
          content: [
            `目标：${command}`,
            `当前步骤：${step + 1}`,
            `已执行：${JSON.stringify(history)}`,
            `页面快照：${JSON.stringify(snapshot)}`,
          ].join("\n\n"),
        },
      ];

      const browserActionTool = {
        type: "function",
        function: {
          name: "browser_action",
          description: "返回下一步唯一且有边界的浏览器动作",
          parameters: {
            type: "object",
            properties: {
              action: {
                type: "string",
                enum: ["click", "fill", "select", "press", "scroll", "navigate", "back", "forward", "reload", "done"],
              },
              ref: { type: "string", description: "当前页面快照中的 @eN 引用" },
              value: { type: "string" },
              url: { type: "string" },
              key: { type: "string" },
              amount: { type: "number" },
              message: { type: "string" },
            },
            required: ["action"],
            additionalProperties: false,
          },
        },
      };
      const modelCapabilities = capabilitiesFor(provider.baseUrl);

      const requestPlanner = async (requestMessages, mode = "tool", thinkingVariant = 0) => {
        const requestBody = {
          model,
          messages: requestMessages,
          max_tokens: 1_024,
          stream: false,
          temperature: 0,
          ...thinkingOffParams(modelCapabilities, thinkingVariant),
          ...(mode === "tool" ? {
            tools: [browserActionTool],
            tool_choice: { type: "function", function: { name: "browser_action" } },
          } : {}),
          ...(mode === "json" ? { response_format: { type: "json_object" } } : {}),
        };
        const response = await fetch(`${provider.baseUrl}/chat/completions`, {
          method: "POST",
          headers: {
            Accept: "application/json",
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(requestBody),
          signal: controller.signal,
        });
        if (!response.ok) {
          const responseText = await response.text().catch(() => "");
          const thinkingParameterRejected = thinkingVariant === 0
            && modelCapabilities.disableThinking
            && [400, 422].includes(response.status)
            && /reasoning[_ ]effort|thinking/i.test(responseText);
          if (thinkingParameterRejected) return requestPlanner(requestMessages, mode, 1);
          const toolModeUnsupported = mode === "tool" && (
            [400, 404, 415, 422].includes(response.status)
            || /tool[_ ]choice|function[_ ]call|tools? (?:is|are )?unsupported/i.test(responseText)
          );
          if (toolModeUnsupported) return requestPlanner(requestMessages, "json", thinkingVariant);
          const jsonModeUnsupported = mode === "json" && (
            [400, 404, 415, 422].includes(response.status)
            || /response[_ ]format|json[_ ]object|unsupported/i.test(responseText)
          );
          if (jsonModeUnsupported) return requestPlanner(requestMessages, "plain", thinkingVariant);
          throw new Error(`模型接口返回 HTTP ${response.status}`);
        }
        return await response.json();
      };

      const responseDiagnostic = (body) => {
        const choice = body?.choices?.[0];
        const finishReason = String(choice?.finish_reason || body?.status || "未知");
        const candidates = readBrowserActionCandidates(body);
        const toolCalls = Array.isArray(choice?.message?.tool_calls) ? choice.message.tool_calls.length : 0;
        return `结束原因 ${finishReason}，动作候选 ${candidates.length}，函数调用 ${toolCalls}`;
      };

      const parseResponse = (body) => {
        for (const candidate of readBrowserActionCandidates(body)) {
          try {
            return parseBrowserCommandAction(candidate);
          } catch {
            // Try every common OpenAI-compatible response shape before repairing it.
          }
        }
        throw new Error("模型没有返回有效的 JSON 浏览器动作。");
      };

      const firstBody = await requestPlanner(messages, "tool");
      try {
        return parseResponse(firstBody);
      } catch {
        const invalidOutput = readBrowserActionCandidates(firstBody).join("\n").slice(0, 4_000);
        const repairedBody = await requestPlanner([
          {
            role: "system",
            content: [
              "你是 JSON 格式纠正器。根据原始浏览器控制请求和无效输出，只返回一个合法 JSON 对象。若当前状态或历史表明目标已完成，action 必须为 done。",
              "禁止 Markdown、解释和思考。不得增加原始请求未授权的操作。",
              "action 只能是 click、fill、select、press、scroll、navigate、back、forward、reload 或 done。",
            ].join("\n"),
          },
          {
            role: "user",
            content: [
              messages[1].content,
              `需要纠正的输出：${invalidOutput || "（模型返回为空）"}`,
            ].join("\n\n"),
          },
        ], "json");
        try {
          return parseResponse(repairedBody);
        } catch {
          throw new Error(
            `模型 ${model} 未生成可执行动作（首次：${responseDiagnostic(firstBody)}；纠正：${responseDiagnostic(repairedBody)}）。`,
          );
        }
      }
    } finally {
      clearTimeout(timeout);
      options.signal?.removeEventListener("abort", abortPlanner);
    }
  };

  try {
    return await runBrowserCommandAgent({
      command: payload?.command,
      onProgress: options.onProgress,
      planNextAction,
      signal: options.signal,
      waitIfPaused: options.waitIfPaused,
      webContents: activeWebContents,
    });
  } catch (error) {
    return {
      status: "error",
      message: error?.name === "AbortError" || options.signal?.aborted
        ? "BrowserSkill 已停止当前自动运行。"
        : `浏览器命令执行失败：${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

async function collectBrizoUseEvidence(webContents) {
  if (!webContents || webContents.isDestroyed()) return null;
  return await webContents.executeJavaScript(`
    (() => {
      const clean = (value, limit = 500) => String(value || "").replace(/\\s+/g, " ").trim().slice(0, limit);
      const links = [...document.querySelectorAll("a[href]")]
        .map((link) => ({
          title: clean(link.innerText || link.getAttribute("aria-label") || link.title, 240),
          url: link.href,
        }))
        .filter((link) => /^https?:/i.test(link.url))
        .filter((link, index, all) => all.findIndex((candidate) => candidate.url === link.url) === index)
        .slice(0, 40);
      const tables = [...document.querySelectorAll("table")].slice(0, 16).map((table, tableIndex) => ({
        label: clean(table.getAttribute("aria-label") || table.querySelector("caption")?.innerText || "表格 " + (tableIndex + 1), 160),
        rows: [...table.querySelectorAll("tr")].slice(0, 80).map((row) =>
          [...row.querySelectorAll("th,td")].map((cell) => clean(cell.innerText, 500))
        ).filter((row) => row.some(Boolean)),
      })).filter((table) => table.rows.length);
      return {
        title: clean(document.title, 240),
        url: location.href,
        pageText: clean(document.body?.innerText || "", 30000),
        links,
        tables,
      };
    })()
  `);
}

async function installEgoSpaceRunningEffect(webContents, sessionId = "") {
  if (!webContents || webContents.isDestroyed()) return;
  await webContents.executeJavaScript(`
    (() => {
      document.getElementById("brizo-ego-space-running-effect")?.remove();
      document.getElementById("brizo-ego-space-running-style")?.remove();
      const style = document.createElement("style");
      style.id = "brizo-ego-space-running-style";
      style.textContent = ${JSON.stringify(`
        @keyframes brizo-ego-space-travel {
          0%, 100% { opacity: .22; transform: scale(.94); }
          18% { opacity: .96; transform: scale(1); }
          42% { opacity: .48; transform: scale(.98); }
          72% { opacity: .16; transform: scale(.95); }
        }
        @keyframes brizo-ego-space-base {
          0%, 100% { opacity: .78; }
          50% { opacity: 1; }
        }
        #brizo-ego-space-running-effect {
          position: fixed !important;
          z-index: 2147483647 !important;
          inset: 0 !important;
          overflow: hidden !important;
          border-radius: 14px !important;
          pointer-events: none !important;
          contain: strict !important;
          isolation: isolate !important;
        }
        #brizo-ego-space-running-effect .ego-space-veil {
          position: absolute;
          inset: 0;
          background:
            radial-gradient(circle, rgba(255,255,255,.34) 0 .7px, transparent .85px) 0 0 / 4px 4px,
            rgba(217, 219, 222, .30);
          backdrop-filter: grayscale(.72) saturate(.66) blur(1.15px);
          -webkit-backdrop-filter: grayscale(.72) saturate(.66) blur(1.15px);
        }
        #brizo-ego-space-running-effect .ego-space-base {
          position: absolute;
          inset: 0;
          border: 1px solid rgba(165, 140, 94, .92);
          border-radius: inherit;
          box-shadow:
            inset 0 0 9px 3px rgba(165, 140, 94, .83),
            inset 0 0 28px 10px rgba(181, 155, 103, .55),
            inset 0 0 58px 25px rgba(195, 171, 119, .30),
            inset 0 0 104px 48px rgba(211, 191, 151, .14);
          animation: brizo-ego-space-base 2.4s ease-in-out infinite;
        }
        #brizo-ego-space-running-effect .ego-space-wave {
          position: absolute;
          filter: blur(5px);
          opacity: .2;
          transform-origin: center;
          animation: brizo-ego-space-travel 2.4s cubic-bezier(.45, 0, .55, 1) infinite;
        }
        #brizo-ego-space-running-effect .ego-space-wave.top {
          top: -30px; left: 7%; width: 72%; height: 150px;
          background: radial-gradient(ellipse at 50% 0%, rgba(165, 140, 94, .96) 0, rgba(181, 155, 103, .62) 30%, rgba(195, 171, 119, .24) 58%, transparent 76%);
          animation-delay: 0s;
        }
        #brizo-ego-space-running-effect .ego-space-wave.right {
          top: 7%; right: -34px; width: 150px; height: 74%;
          background: radial-gradient(ellipse at 100% 50%, rgba(165, 140, 94, .96) 0, rgba(181, 155, 103, .62) 30%, rgba(195, 171, 119, .24) 58%, transparent 76%);
          animation-delay: -.6s;
        }
        #brizo-ego-space-running-effect .ego-space-wave.bottom {
          right: 7%; bottom: -34px; width: 72%; height: 155px;
          background: radial-gradient(ellipse at 50% 100%, rgba(165, 140, 94, .96) 0, rgba(181, 155, 103, .62) 30%, rgba(195, 171, 119, .24) 58%, transparent 76%);
          animation-delay: -1.2s;
        }
        #brizo-ego-space-running-effect .ego-space-wave.left {
          bottom: 7%; left: -34px; width: 150px; height: 74%;
          background: radial-gradient(ellipse at 0% 50%, rgba(165, 140, 94, .96) 0, rgba(181, 155, 103, .62) 30%, rgba(195, 171, 119, .24) 58%, transparent 76%);
          animation-delay: -1.8s;
        }
        @media (prefers-reduced-motion: reduce) {
          #brizo-ego-space-running-effect .ego-space-base,
          #brizo-ego-space-running-effect .ego-space-wave { animation: none; }
        }
      `)};
      const effect = document.createElement("div");
      effect.id = "brizo-ego-space-running-effect";
      effect.setAttribute("aria-hidden", "true");
      effect.innerHTML = '<div class="ego-space-veil"></div><div class="ego-space-base"></div><div class="ego-space-wave top"></div><div class="ego-space-wave right"></div><div class="ego-space-wave bottom"></div><div class="ego-space-wave left"></div>';
      (document.head || document.documentElement).append(style);
      (document.body || document.documentElement).append(effect);
    })()
  `).catch(() => {});
}

async function setEgoSpaceRunningPaused(webContents, paused) {
  if (!webContents || webContents.isDestroyed()) return;
  await webContents.executeJavaScript(`
    (() => {
      const effect = document.getElementById("brizo-ego-space-running-effect");
      if (!effect) return;
      effect.querySelectorAll(".ego-space-base,.ego-space-wave").forEach((node) => {
        node.style.animationPlayState = ${paused ? '"paused"' : '"running"'};
      });
    })()
  `).catch(() => {});
}

async function organizeBrizoUseResult({ command, executionSummary, history, modelContext }) {
  const sourceSites = [...new Set((modelContext.sources || []).map((source) => {
    try {
      return new URL(source.url).hostname.replace(/^www\./i, "");
    } catch {
      return String(source.title || "").trim();
    }
  }).filter(Boolean))].slice(0, 8);
  const sourceIntro = sourceSites.length
    ? `信息来源于：${sourceSites.join("、")}。`
    : "信息来源于当前沙箱实际运行网页。";
  const safeCell = (value) => String(value || "未披露").replace(/\|/g, "／").replace(/\s+/g, " ").trim() || "未披露";
  const fallbackRows = history.length
    ? history.map((item, index) => `| ${index + 1} | ${safeCell(item.action)} | ${safeCell(item.target || item.ref)} | ${safeCell(item.value)} | ${safeCell(item.result)} |`)
    : ["| 1 | 未披露 | 未披露 | 未披露 | 未获得可整理的动作数据 |"];
  const fallback = [
    sourceIntro,
    "",
    "## 执行结论",
    safeCell(executionSummary),
    "",
    "## 相关数据",
    "| 序号 | 动作/项目 | 对象 | 数据 | 结果 |",
    "|---:|---|---|---|---|",
    ...fallbackRows,
    "",
    "## 最佳建议",
    "当前证据不足以进行可靠比较，暂不指定最佳结果。建议补充候选项的价格、时间、关键参数与可用性后再比较。",
    "",
    "## 注意事项",
    "默认模型未能完成证据整理；以上仅保留沙箱实际执行记录，缺失字段均标记为“未披露”。",
  ].join("\n");
  const store = await readModelGuardStore();
  const storedProvider = store.providers.find((provider) => provider.id === store.defaultId)
    || store.providers[0];
  const provider = withKnownProviderDefaults(storedProvider);
  const apiKey = decryptModelKey(storedProvider);
  const model = sortFastModels(provider?.models || [], provider?.name).find((candidate) =>
    !/(reasoner|reasoning|thinking|(^|[/_.-])r1($|[/_.-])|(^|[/_.-])o[134]($|[/_.-]))/i.test(candidate)
  ) || "";
  if (!provider?.baseUrl || !apiKey || !model) {
    return fallback;
  }
  const evidenceSources = (modelContext.sources || []).map((source) => ({
    title: source.title,
    url: source.url,
  }));
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
        messages: [{
        role: "system",
        content: [
          "你是 Brizo Use 的结果整理器。只能使用提供的页面证据和执行历史，不得补造价格、日期、时间、库存、评分、参数或链接。",
          "输出中文 Markdown，必须依次包含：简短结论、完整相关数据表格、最佳建议及理由、注意事项。",
          "表格必须逐项列出页面证据中的候选数据；字段缺失写“未披露”，不要只给一个汇总数字。",
          `正文第一行必须且只能集中写一次“${sourceIntro}”，之后不要再显示来源标签、引用编号、脚注或逐项来源。`,
          "最佳建议必须说明比较标准；证据不足时明确写无法可靠推荐，并列出还需确认的字段。",
          "不要重复用户问题，不要输出隐藏思考。",
        ].join("\n"),
      }, {
        role: "user",
        content: [
          `用户目标：${String(command || "").slice(0, 2000)}`,
          `执行摘要：${String(executionSummary || "").slice(0, 4000)}`,
          `动作历史：${JSON.stringify(history).slice(0, 6000)}`,
          `页面标题：${modelContext.snapshot?.title || ""}`,
          `页面地址：${modelContext.snapshot?.url || ""}`,
          `页面文字证据：${String(modelContext.snapshot?.pageText || "").slice(0, 30_000)}`,
          `页面原生表格：${JSON.stringify(modelContext.snapshot?.tables || []).slice(0, 18_000)}`,
          `页面来源证据：${JSON.stringify(evidenceSources).slice(0, 8000)}`,
        ].join("\n\n"),
        }],
        max_tokens: 2_800,
        stream: false,
        temperature: 0,
        ...thinkingOffParams(capabilitiesFor(provider.baseUrl), 0),
      }),
    });
    if (!response.ok) return fallback;
    const body = await response.json();
    const organized = readAssistantMessage(body).trim();
    if (!organized) return fallback;
    const withoutCitationTags = organized
      .replace(/^信息来源于[^\n]*\n*/u, "")
      .replace(/\s*\[\d+\]/g, "")
      .trim();
    return `${sourceIntro}\n\n${withoutCitationTags}`;
  } catch {
    return fallback;
  }
}

async function runBrizoUseWithBoundModel(payload, onProgress) {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return { status: "error", message: "Brizo 沙箱窗口当前不可用。" };
  }
  const sessionId = String(payload?.sessionId || `${Date.now()}`).replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 80);
  const partition = `brizo-use-${sessionId}-${Date.now()}`;
  const runControl = createBrizoUseRunControl();
  brizoUseControllers.get(sessionId)?.abort(new DOMException("Replaced", "AbortError"));
  brizoUseControllers.set(sessionId, runControl);
  const view = new WebContentsView({
    webPreferences: {
      backgroundThrottling: false,
      contextIsolation: true,
      nodeIntegration: false,
      partition,
      sandbox: true,
    },
  });
  const webContents = view.webContents;
  view.setBackgroundColor("#faf9f6");
  view.setBorderRadius(10);
  view.setBounds({ x: 0, y: 0, width: 1, height: 1 });
  view.setVisible(false);
  mainWindow.contentView.addChildView(view);
  brizoUseSandboxes.set(sessionId, { view, visible: false });
  const sandboxSession = webContents.session;
  sandboxSession.setPermissionCheckHandler(() => false);
  sandboxSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) void webContents.loadURL(url);
    return { action: "deny" };
  });
  webContents.on("did-finish-load", () => {
    void installEgoSpaceRunningEffect(webContents, sessionId).then(() =>
      setEgoSpaceRunningPaused(webContents, runControl.paused)
    );
  });
  const processSteps = [];
  const progress = (value) => {
    const event = typeof value === "string" ? {
      detail: value,
      title: webContents.isDestroyed() ? "" : webContents.getTitle(),
      url: webContents.isDestroyed() ? "" : webContents.getURL(),
    } : value;
    if (event?.detail && processSteps.at(-1) !== event.detail) processSteps.push(event.detail);
    onProgress({ ...event, embeddedSandbox: true });
  };
  runControl.setStateListener((paused) => {
    void setEgoSpaceRunningPaused(webContents, paused);
    progress({
      detail: paused ? "BrowserSkill 已暂停" : "BrowserSkill 已继续",
      paused,
      title: webContents.isDestroyed() ? "" : webContents.getTitle(),
      url: webContents.isDestroyed() ? "" : webContents.getURL(),
    });
  });
  try {
    progress("正在创建 Brizo 独立沙箱");
    await runControl.waitIfPaused();
    await webContents.loadURL("https://www.bing.com/");
    await installEgoSpaceRunningEffect(webContents, sessionId);
    await setEgoSpaceRunningPaused(webContents, runControl.paused);
    await runControl.waitIfPaused();
    progress("Brizo 沙箱已创建");
    const result = await runBrowserCommandWithBoundModel(payload, {
      onProgress: progress,
      signal: runControl.signal,
      waitIfPaused: () => runControl.waitIfPaused(),
      webContents,
    });
    await runControl.waitIfPaused();
    const url = webContents.isDestroyed() ? "" : webContents.getURL();
    const title = webContents.isDestroyed() ? "Brizo Use 结果" : webContents.getTitle();
    const finalSnapshot = result?.finalSnapshot || await snapshotBrowserPage(webContents).catch(() => null);
    const fullEvidence = await collectBrizoUseEvidence(webContents).catch(() => null);
    const snapshot = { ...(finalSnapshot || {}), ...(fullEvidence || {}) };
    progress("正在整理完整数据表");
    const evidenceSources = [...new Map((snapshot?.links || [])
      .filter((item) => /^https?:/i.test(item.url || ""))
      .map((item) => [item.url, {
        title: item.title || (() => { try { return new URL(item.url).hostname; } catch { return "网页来源"; } })(),
        url: item.url,
      }])).values()].slice(0, 12);
    const sources = evidenceSources.length
      ? evidenceSources
      : (/^https?:/i.test(url) ? [{ title, url }] : []);
    const organizedMessage = result?.status === "success"
      ? await (async () => {
        await runControl.waitIfPaused();
        return organizeBrizoUseResult({
        command: payload?.command,
        executionSummary: result.message,
        history: result.history || [],
        modelContext: { snapshot, sources },
        });
      })()
      : result?.message;
    return {
      ...result,
      finalSnapshot: undefined,
      history: undefined,
      message: organizedMessage,
      sources,
      processSteps,
      sandbox: "brizo",
      url,
    };
  } catch (error) {
    return {
      status: "error",
      message: `Brizo 沙箱执行失败：${error instanceof Error ? error.message : String(error)}`,
      sources: [],
    };
  } finally {
    if (brizoUseControllers.get(sessionId) === runControl) brizoUseControllers.delete(sessionId);
    brizoUseSandboxes.delete(sessionId);
    try { mainWindow.contentView.removeChildView(view); } catch {}
    if (!webContents.isDestroyed()) webContents.close();
  }
}

async function searchWithVane(payload) {
  try {
    return await getScoutSearchService().run(payload, {
      emit: () => {},
      signal: new AbortController().signal,
    });
  } catch (error) {
    return { status: "error", message: error?.message || "搜索暂时不可用。" };
  }
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
  const inputLanguage = languageForInput(query);
  const cacheKey = `${inputLanguage}:${query.toLocaleLowerCase()}`;
  const cached = searchSuggestionCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.suggestions;
  if (searchSuggestionCooldownUntil > Date.now()) return [];
  try {
    if (inputLanguage === "zh") {
      const baiduUrl = new URL("https://suggestion.baidu.com/su");
      baiduUrl.searchParams.set("action", "opensearch");
      baiduUrl.searchParams.set("wd", query);
      const response = await fetch(baiduUrl, { signal: AbortSignal.timeout(3500) });
      if (!response.ok) return [];
      const payload = JSON.parse(new TextDecoder("gbk").decode(await response.arrayBuffer()));
      const suggestions = Array.isArray(payload?.[1])
        ? payload[1].filter((item) =>
          typeof item === "string" && matchesRequestedLanguage(item, inputLanguage)
        ).slice(0, 8)
        : [];
      searchSuggestionCache.set(cacheKey, {
        suggestions,
        expiresAt: Date.now() + SEARCH_SUGGESTION_CACHE_TTL,
      });
      return suggestions;
    }
    const url = new URL("https://api.bing.com/osjson.aspx");
    url.searchParams.set("query", query);
    url.searchParams.set("language", inputLanguage === "ja"
      ? "ja-JP"
      : inputLanguage === "ko" ? "ko-KR" : "en-US");
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
      ? payload[1].filter((item) =>
        typeof item === "string" && matchesRequestedLanguage(item, inputLanguage)
      ).slice(0, 8)
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
    const webContents = getLiveViewWebContents(browserView);
    if (!webContents || event.sender !== webContents) return;
    if (interactionType !== "top-edge-change") publishBrowserActivation();
    if (["wheel", "scroll", "touchstart", "top-edge-change"].includes(interactionType)) {
      clearTimeout(pageEdgeColorUpdateTimer);
      pageEdgeColorUpdateTimer = setTimeout(() => updatePageBackgroundColor(), 90);
    }
  });

  ipcMain.on("bean-browser:selection-menu", (event, payload) => {
    const webContents = getLiveViewWebContents(browserView);
    if (!webContents || event.sender !== webContents || !mainWindow || mainWindow.isDestroyed()) return;
    const selectedText = String(payload?.text || "").trim().slice(0, 12_000);
    if (!selectedText) return;
    const params = {
      x: Math.max(0, Math.round(Number(payload?.x) || 0)),
      y: Math.max(0, Math.round(Number(payload?.y) || 0)),
    };
    showWebContextMenu({
      actions: {
        "copy-text": () => clipboard.writeText(selectedText),
        "ask-brizo": () => {
          if (!mainWindow || mainWindow.isDestroyed()) return;
          mainWindow.webContents.send("bean-browser:ask-selection", selectedText);
        },
        translate: () => { void translateSelectedText(webContents, selectedText); },
      },
      ariaLabel: "文字操作",
      items: selectionContextMenuItems,
      params,
      window: mainWindow,
    });
  });

  ipcMain.handle("bean-browser:show-renderer-context-menu", (event, payload) => {
    if (!isTrustedSender(event) || !mainWindow || mainWindow.isDestroyed()) return false;
    const params = {
      x: Math.max(0, Math.round(Number(payload?.x) || 0)),
      y: Math.max(0, Math.round(Number(payload?.y) || 0)),
    };
    const imageUrl = normalizeImageSourceUrl(payload?.imageUrl);
    const linkUrl = normalizeBrowserInput(payload?.linkUrl);
    const selectedText = String(payload?.selectedText || "").trim().slice(0, 12_000);
    let items;
    let ariaLabel;
    let actions;

    if (imageUrl) {
      items = linkUrl ? imageLinkContextMenuItems : imageContextMenuItems;
      ariaLabel = linkUrl ? "图片与链接操作" : "图片操作";
      actions = {
        open: () => requestOpenUrlTab(imageUrl, { kind: "image" }),
        download: () => event.sender.downloadURL(imageUrl),
        "copy-image": () => event.sender.copyImageAt(params.x, params.y),
        "copy-address": () => clipboard.writeText(imageUrl),
        "copy-link": () => clipboard.writeText(linkUrl),
        "open-link-tab": () => requestOpenUrlTab(linkUrl, { kind: "web" }),
        "open-link-window": () => createBrowserLinkWindow(linkUrl),
      };
    } else if (linkUrl) {
      items = linkContextMenuItems;
      ariaLabel = "链接操作";
      actions = {
        "copy-link": () => clipboard.writeText(linkUrl),
        "open-link-tab": () => requestOpenUrlTab(linkUrl, { kind: "web" }),
        "open-link-window": () => createBrowserLinkWindow(linkUrl),
      };
    } else if (selectedText) {
      items = selectionContextMenuItems;
      ariaLabel = "文字操作";
      actions = {
        "copy-text": () => clipboard.writeText(selectedText),
        "ask-brizo": () => mainWindow.webContents.send("bean-browser:ask-selection", selectedText),
        translate: () => { void translateSelectedText(event.sender, selectedText); },
      };
    } else if (payload?.surface === "search-result") {
      items = searchResultContextMenuItems;
      ariaLabel = "搜索结果操作";
      actions = {
        "copy-search-result": () => mainWindow.webContents.send(
          "bean-browser:renderer-context-action",
          "copy-search-result",
        ),
      };
    } else {
      return false;
    }

    showWebContextMenu({
      actions,
      ariaLabel,
      contentOffset: { x: 0, y: 0 },
      items,
      params,
      window: mainWindow,
    });
    return true;
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
    const useControl = brizoUseControllers.get(tabId);
    useControl?.abort(new DOMException("Tab closed", "AbortError"));
    const view = browserViews.get(tabId);
    if (!view) return Boolean(useControl);
    const webContents = getLiveViewWebContents(view);
    browserViews.delete(tabId);
    if (view === browserView) browserView = undefined;
    webContents?.close();
    return true;
  });
  ipcMain.handle("bean-browser:capture-preview", async (event) => {
    const webContents = getLiveViewWebContents(browserView);
    if (!isTrustedSender(event) || !webContents) return "";
    try {
      return (await webContents.capturePage()).toDataURL();
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
  ipcMain.handle("bean-browser:navigate-pdf", (event, input, tabId) =>
    isTrustedSender(event) ? navigateBrowserPdf(input, tabId) : false,
  );
  ipcMain.handle("bean-browser:list-downloads", (event) =>
    isTrustedSender(event) ? getDownloadRecords() : [],
  );
  ipcMain.handle("bean-browser:open-downloads-directory", (event) =>
    isTrustedSender(event) ? openDownloadsDirectory() : { opened: false },
  );
  ipcMain.handle("bean-browser:set-download-paused", (event, id, paused) =>
    isTrustedSender(event) ? setDownloadPaused(id, Boolean(paused)) : { status: "unavailable" },
  );
  ipcMain.handle("bean-browser:cancel-download", (event, id) =>
    isTrustedSender(event) ? cancelDownload(id) : { status: "unavailable" },
  );
  ipcMain.handle("bean-browser:open-downloaded-file", (event, id) =>
    isTrustedSender(event) ? openDownloadedFile(id) : { status: "unavailable" },
  );
  ipcMain.handle("bean-browser:delete-downloaded-file", (event, id) =>
    isTrustedSender(event) ? deleteDownloadedFile(id) : { status: "unavailable" },
  );
  ipcMain.handle("bean-browser:toggle-downloads", (event, anchorBounds) =>
    isTrustedSender(event) ? toggleDownloadsWindow(anchorBounds) : { open: false },
  );
  ipcMain.handle("bean-browser:back", (event) => {
    if (!isTrustedSender(event) || !browserView?.webContents.navigationHistory.canGoBack()) return false;
    const targetView = browserView;
    return beginBrowserNavigation(targetView, () => {
      targetView.webContents.navigationHistory.goBack();
    });
  });
  ipcMain.handle("bean-browser:forward", (event) => {
    if (!isTrustedSender(event) || !browserView?.webContents.navigationHistory.canGoForward()) return false;
    const targetView = browserView;
    return beginBrowserNavigation(targetView, () => {
      targetView.webContents.navigationHistory.goForward();
    });
  });
  ipcMain.handle("bean-browser:reload", (event) => {
    if (!isTrustedSender(event) || !browserView) return false;
    if (browserErrorPageActive && browserDisplayUrl) {
      return navigateBrowserUrl(browserDisplayUrl, browserOwnerTabId);
    }
    const targetView = browserView;
    return beginBrowserNavigation(targetView, () => {
      targetView.webContents.reload();
    });
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
  ipcMain.handle("bean-browser:start-search", async (event, payload) => {
    if (!isTrustedSender(event)) return { status: "error", message: "搜索请求未获授权。" };
    const requestedId = typeof payload?.searchId === "string" ? payload.searchId : "";
    const searchId = /^[a-zA-Z0-9_-]{8,120}$/.test(requestedId)
      ? requestedId
      : `search-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    activeSearchControllers.get(searchId)?.abort();
    const controller = new AbortController();
    activeSearchControllers.set(searchId, controller);
    const sender = event.sender;
    const region = await userLocalePromise.catch(() => ({ country: "", language: "" }));
    const emit = (message) => {
      if (!sender.isDestroyed()) sender.send("bean-browser:search-stream", { searchId, ...message });
    };
    // Search depth is intentionally product-controlled for now. Do not trust a
    // stale renderer or restored payload to re-enable the removed slower modes.
    void getScoutSearchService().run({ ...payload, depth: "fast", region, searchId }, { emit, signal: controller.signal })
      .catch((error) => {
        if (controller.signal.aborted) return;
        emit({
          type: "error",
          message: error?.message || "搜索暂时不可用。",
          stage: "searching",
        });
      })
      .finally(() => activeSearchControllers.delete(searchId));
    return { searchId, status: "started" };
  });
  ipcMain.handle("bean-browser:cancel-search", (event, searchId) => {
    if (!isTrustedSender(event) || typeof searchId !== "string") return false;
    const controller = activeSearchControllers.get(searchId);
    if (!controller) return false;
    controller.abort();
    activeSearchControllers.delete(searchId);
    return true;
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
  ipcMain.handle("bean-browser:run-brizo-use-command", async (event, payload) => {
    if (!isTrustedSender(event)) {
      return { status: "error", message: "Use 浏览器控制请求未获授权。" };
    }
    const sessionId = String(payload?.sessionId || "");
    return await runBrizoUseWithBoundModel(payload, (progress) => {
      if (!event.sender.isDestroyed()) {
        event.sender.send("bean-browser:brizo-use-progress", {
          ...(typeof progress === "string" ? { detail: progress } : progress),
          sessionId,
        });
      }
    });
  });
  ipcMain.handle("bean-browser:pause-brizo-use-command", (event, sessionId) => {
    if (!isTrustedSender(event)) return false;
    const key = String(sessionId || "");
    const control = brizoUseControllers.get(key);
    return control?.pause() || false;
  });
  ipcMain.handle("bean-browser:resume-brizo-use-command", (event, sessionId) => {
    if (!isTrustedSender(event)) return false;
    const key = String(sessionId || "");
    const control = brizoUseControllers.get(key);
    return control?.resume() || false;
  });
  ipcMain.handle("bean-browser:suggest-queries", async (event, input) =>
    isTrustedSender(event) ? await fetchSearchSuggestions(input) : [],
  );
  ipcMain.handle("bean-browser:get-page-zoom", (event) => {
    if (!isTrustedSender(event)) return 1;
    return normalizePageZoomFactor(browserView?.__brizoUserZoomFactor || defaultPageZoomFactor);
  });
  ipcMain.handle("bean-browser:set-page-zoom", (event, factor) => {
    if (!isTrustedSender(event)) return 1;
    const nextFactor = normalizePageZoomFactor(factor);
    defaultPageZoomFactor = nextFactor;
    if (browserView) {
      browserView.__brizoUserZoomFactor = nextFactor;
      applyBrowserPageZoomPolicy(browserView);
    }
    return nextFactor;
  });
  ipcMain.handle("bean-browser:list-passwords", async (event) => {
    if (!isTrustedSender(event)) return [];
    return await passwordVault.list();
  });
  ipcMain.handle("bean-browser:save-password", async (event, payload) => {
    if (!isTrustedSender(event)) return { status: "error", message: "请求未获授权。" };
    return await passwordVault.save(payload);
  });
  ipcMain.handle("bean-browser:delete-password", async (event, id) => {
    if (!isTrustedSender(event) || typeof id !== "string") return [];
    return await passwordVault.remove(id);
  });
  ipcMain.handle("bean-browser:copy-password", async (event, id) => {
    if (!isTrustedSender(event) || typeof id !== "string") return false;
    const password = await passwordVault.reveal(id);
    if (!password) return false;
    clipboard.writeText(password);
    return true;
  });
  ipcMain.handle("bean-browser:list-model-providers", async (event) => {
    if (!isTrustedSender(event)) return [];
    return sanitizeModelProviders(await readModelGuardStore());
  });
  ipcMain.handle("bean-browser:smart-bookmarks-get", async (event) => {
    if (!isTrustedSender(event)) return null;
    return await smartBookmarkService.readSnapshot();
  });
  ipcMain.handle("bean-browser:smart-bookmarks-sync", async (event, payload) => {
    if (!isTrustedSender(event)) return { status: "error", message: "智能收藏夹请求未获授权。" };
    return await smartBookmarkService.sync(payload || {});
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
  ipcMain.handle("bean-browser:resolve-bookmark-favicons", async (event, bookmarks) => {
    if (!isTrustedSender(event)) return [];
    const candidates = Array.isArray(bookmarks) ? bookmarks.slice(0, 5_000) : [];
    const resolved = [];
    const missing = [];
    for (const bookmark of candidates) {
      const localFavicon = await cachedFaviconDataUrl(bookmark?.url);
      if (localFavicon) resolved.push({ faviconUrl: localFavicon, url: bookmark.url });
      else if (bookmark?.faviconUrl) {
        const migratedFavicon = await cacheFaviconForPage(bookmark.url, bookmark.faviconUrl);
        if (migratedFavicon) resolved.push({ faviconUrl: migratedFavicon, url: bookmark.url });
        else missing.push(bookmark);
      } else missing.push(bookmark);
    }
    if (!missing.length) return resolved;
    const { resolveBookmarkFavicons } = await loadBrowserToolsModule();
    const remoteResolved = await resolveBookmarkFavicons(missing);
    for (const item of remoteResolved) {
      const localFavicon = await cacheFaviconForPage(item.url, item.faviconUrl);
      if (localFavicon) resolved.push({ ...item, faviconUrl: localFavicon });
    }
    return resolved;
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
  ipcMain.handle("bean-browser:download-current-pdf", async (event) =>
    isTrustedSender(event)
      ? await saveCurrentPdf()
      : { status: "error", message: "PDF 下载请求未获授权。" },
  );
  ipcMain.handle("bean-browser:copy-text", (event, value) => {
    if (!isTrustedSender(event) || typeof value !== "string") return false;
    clipboard.writeText(value.slice(0, 200_000));
    return true;
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
      requestOpenPdfTab(pathToFileURL(saveResult.filePath).href, {
        title: path.basename(saveResult.filePath),
      });
      return { status: "saved", filePath: saveResult.filePath };
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
  ipcMain.handle("bean-browser:export-search-pdf", async (event, payload) => {
    if (!isTrustedSender(event) || pdfExportInProgress) {
      return { status: "error", message: "PDF 导出当前不可用。" };
    }
    pdfExportInProgress = true;
    try {
      const {
        createPdfFilename,
        createSearchResultArticle,
        renderArticlePdf,
      } = await loadArticlePdfModule();
      const article = createSearchResultArticle(payload);
      const saveResult = await dialog.showSaveDialog(mainWindow, {
        defaultPath: path.join(app.getPath("documents"), createPdfFilename(`${article.title} - Brizo`)),
        filters: [{ name: "PDF 文档", extensions: ["pdf"] }],
        properties: ["createDirectory", "showOverwriteConfirmation"],
        title: "下载 Brizo 搜索结果 PDF",
      });
      if (saveResult.canceled || !saveResult.filePath) return { status: "canceled" };
      const pdf = await renderArticlePdf(article);
      await writeFile(saveResult.filePath, pdf);
      requestOpenPdfTab(pathToFileURL(saveResult.filePath).href, {
        title: path.basename(saveResult.filePath),
      });
      return { status: "saved", filePath: saveResult.filePath };
    } catch (error) {
      console.error("[search-pdf-export]", error instanceof Error ? error.message : String(error));
      return {
        status: "error",
        message: error instanceof Error ? error.message : "无法生成搜索结果 PDF。",
      };
    } finally {
      pdfExportInProgress = false;
    }
  });
  ipcMain.on("bean-browser:set-bounds", (event, bounds) => {
    if (isTrustedSender(event)) setBrowserBounds(bounds);
  });
  ipcMain.on("bean-browser:set-brizo-use-sandbox-layout", (event, payload) => {
    if (!isTrustedSender(event)) return;
    const sessionId = String(payload?.sessionId || "");
    const sandbox = brizoUseSandboxes.get(sessionId);
    if (!sandbox || sandbox.view.webContents.isDestroyed()) return;
    const visible = Boolean(payload?.visible);
    const raw = payload?.bounds || {};
    const frameInset = 11;
    const outerWidth = Math.max(1, Math.round(Number(raw.width) || 1));
    const outerHeight = Math.max(1, Math.round(Number(raw.height) || 1));
    const sourceViewport = payload?.sourceViewport || {};
    const bounds = {
      x: Math.max(0, Math.round(Number(raw.x) || 0) + frameInset),
      y: Math.max(0, Math.round(Number(raw.y) || 0) + frameInset),
      width: Math.max(1, outerWidth - frameInset * 2),
      height: Math.max(1, outerHeight - frameInset * 2),
    };
    sandbox.view.setBounds(bounds);
    sandbox.view.setVisible(visible && bounds.width > 2 && bounds.height > 2);
    const sourceWidth = Math.max(bounds.width, Math.round(Number(sourceViewport.width) || 1310));
    const sourceHeight = Math.max(bounds.height, Math.round(Number(sourceViewport.height) || 810));
    const fitZoom = Math.max(0.25, Math.min(1, Math.min(bounds.width / sourceWidth, bounds.height / sourceHeight)));
    sandbox.view.webContents.setZoomFactor(fitZoom);
    sandbox.visible = visible;
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
    backgroundColor: "#00000000",
    transparent: true,
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

  // Keep every native layer behind the renderer transparent. The visible
  // application silhouette is owned by the 22 px rounded `.app-shell`; an
  // under-window vibrancy layer would reveal macOS's separate native curve in
  // the renderer's transparent corner pixels and produce two mismatched arcs.
  window.setBackgroundColor("#00000000");
  window.contentView.setBackgroundColor("#00000000");

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
  window.on("close", (event) => {
    console.info("[window-close]", {
      activeSearches: activeSearchControllers.size,
      appQuitRequested,
    });
  });
  window.webContents.on("render-process-gone", (_event, details) => {
    console.error("[renderer-process-gone]", {
      exitCode: details.exitCode,
      reason: details.reason,
    });
  });
  window.webContents.on("unresponsive", () => {
    console.error("[renderer-unresponsive]");
  });
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (event, url) => {
    if (!url.startsWith("file://")) event.preventDefault();
  });
  window.webContents.on("before-input-event", (event, input) => {
    if (browserView && !browserView.__brizoIsPdf && isPageZoomShortcut(input)) {
      event.preventDefault();
      applyBrowserPageZoomPolicy(browserView);
      return;
    }
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
                && /\\/hermes logo(?:-[^/]+)?\\.svg$/.test(decodeURIComponent(markUrl))
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
              const host = document.querySelector(".web-content-host");
              const leftFramePseudo = getComputedStyle(document.querySelector(".spaces-panel"), "::after");
              const rightFramePseudo = getComputedStyle(toolbar, "::after");
              return activeStyle.borderBottomWidth === "0px"
                && toolbarStyle.borderTopWidth === "0px"
                && getComputedStyle(tabList).zIndex === "auto"
                && Number(activeStyle.zIndex) > Number(getComputedStyle(outline).zIndex)
                && Math.abs(activeRect.bottom - toolbarRect.top) <= 0.5
                && strokeStyle.fill === "none"
                && (strokePath.match(/M /g) || []).length === 1
                && (strokePath.match(/A 12 12/g) || []).length === 2
                && strokePath.trim().endsWith("Z")
                && getComputedStyle(host).boxShadow === "none"
                && leftFramePseudo.content === "none"
                && rightFramePseudo.content === "none";
            })(),
            imageLoaded: (() => {
              const image = document.querySelector(".protein-figure img");
              return Boolean(image && image.complete && image.naturalWidth > 0);
            })()
            };
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
        const shellPixel = await window.webContents.capturePage({ x: 4, y: 4, width: 1, height: 1 });
        result.shellCaptureAlpha = shellPixel.toBitmap()[3] ?? 255;
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
            const page = document.querySelector('.new-tab-page');
            const insertRect = insertButton?.getBoundingClientRect();
            const submitRect = submitButton?.getBoundingClientRect();
            return {
              addressPlaceholder: document.querySelector('.address-bar input')?.placeholder || "",
              bottomInsetLeft: Math.round((surfaceRect?.bottom || 0) - (insertRect?.bottom || 0)),
              bottomInsetRight: Math.round((surfaceRect?.bottom || 0) - (submitRect?.bottom || 0)),
              beamActive: beam?.hasAttribute('data-active') || false,
              beamStrength: beam?.style.getPropertyValue('--beam-strength') || "",
              beamWidth: Math.round(beam?.getBoundingClientRect().width || 0),
              backgroundOpacity: page ? getComputedStyle(page, '::before').opacity : "",
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
          result.uiFontFamily.includes("Brizo HarmonyOS Sans") &&
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
          result.legacyTopTabControlsRemoved &&
          result.macWindowButtonsRightAligned &&
          result.newTabDefault.addressPlaceholder === "搜索或输入网址" &&
          result.newTabDefault.contextMenuItems === 0 &&
          Math.abs(result.newTabDefault.bottomInsetLeft - result.newTabDefault.bottomInsetRight) <= 1 &&
          result.newTabDefault.beamActive &&
          result.newTabDefault.beamStrength === "0.7" &&
          result.newTabDefault.beamWidth === 760 &&
          result.newTabDefault.backgroundOpacity === "0.1" &&
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
            "startSearch",
            "cancelSearch",
            "onSearchStream",
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
        // Imported bookmarks keep an honest empty favicon until a verified
        // site-declared asset is resolved by the depth-first favicon pass.
        !importFixture.every((bookmark) => !bookmark.faviconUrl)
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
      getLiveViewWebContents(view)?.close();
    }
    browserViews.clear();
    browserView = undefined;
    mainWindow = undefined;
  });

  window.loadFile(rendererEntry);
  return window;
}

if (hasSingleInstanceLock) app.whenReady().then(async () => {
  if (configureSearchKeys) {
    try {
      if (!safeStorage.isEncryptionAvailable()) throw new Error("系统加密存储当前不可用。");
      const input = await readOneJsonLineFromStdin();
      const source = input?.services && typeof input.services === "object" ? input.services : input;
      const configured = [];
      for (const serviceId of ["serper", "bocha"]) {
        const apiKey = typeof source?.[serviceId] === "string" ? source[serviceId].trim() : "";
        if (!apiKey) continue;
        await modelGuard.saveServiceKey(serviceId, apiKey);
        configured.push(serviceId);
      }
      if (!configured.length) throw new Error("未收到可配置的检索凭据。");
      console.log(`[search-credentials] ${JSON.stringify({ configured, encrypted: true })}`);
      app.exit(0);
    } catch (error) {
      console.error(`[search-credentials] ${error?.message || "配置失败。"}`);
      app.exit(1);
    }
    return;
  }
  await modelGuard.seedServicesFromFile(path.join(projectRoot, "search-keys.local.json"));
  userLocalePromise = detectUserLocale();
  const appIcon = nativeImage.createFromPath(appIconPath);
  if (headlessTest && appIcon.isEmpty()) {
    failTest(`App icon failed to load: ${appIconPath}`);
    return;
  }
  if (process.platform === "darwin" && !appIcon.isEmpty()) {
    app.dock.setIcon(appIcon);
  }
  if (searchSmokeTest) {
    const events = [];
    try {
      const result = await getScoutSearchService().run({
        depth: "fast",
        query: process.env.BEAN_SEARCH_SMOKE_QUERY?.trim()
          || "DeepSeek V4 最新发布信息与主要变化",
        region: await userLocalePromise,
      }, {
        emit: (event) => events.push(event.type),
        signal: new AbortController().signal,
      });
      const summary = {
        degraded: Boolean(result.degraded),
        entityImageCount: result.entityImages?.length || 0,
        followupCount: result.relatedQuestions?.length || 0,
        grounded: Boolean(result.grounded),
        nonMatchingSourceCount: (result.sources || []).filter((source) =>
          !matchesRequestedLanguage(`${source.title} ${source.snippet || ""}`, languageForInput(result.plan?.queries?.[0] || ""))
        ).length,
        providers: result.retrievalProviders || [],
        sourceCount: result.sources?.length || 0,
        status: result.status,
        streamEvents: events.filter((type) => type === "token").length,
        stages: [...new Set(events.filter((type) => ["stage", "sources", "done"].includes(type)))],
        topLevelHeadingCount: String(result.message || "").split("\n")
          .filter((line) => /^\s*#(?!#)\s+/.test(line)).length,
        zhihuEvidenceCount: (result.sources || []).filter(isZhihuSource).length,
        visualEntity: result.visualEntity?.name || "",
      };
      console.log(`[search-smoke] ${JSON.stringify(summary)}`);
      if (process.env.BEAN_SEARCH_SMOKE_VERBOSE === "1") {
        console.log(`[search-smoke-result] ${JSON.stringify({
          answer: result.message,
          queries: result.plan?.queries || [],
          sources: (result.sources || []).map(({ domain, title, url }) => ({ domain, title, url })),
        })}`);
      }
      app.exit(result.status === "success" && result.sources?.length && result.message ? 0 : 1);
    } catch (error) {
      console.error(`[search-smoke] ${error?.message || error}`);
      app.exit(1);
    }
    return;
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
