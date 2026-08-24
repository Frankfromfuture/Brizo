import { dialog } from "electron";
import { execFile } from "node:child_process";
import {
  access,
  readFile,
  readdir,
  stat,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import {
  getChromiumBookmarkRootLabel,
  normalizeImportedBookmark,
} from "../shared/bookmark-folders.mjs";

const execFileAsync = promisify(execFile);

function normalizeBookmarkUrl(value) {
  try {
    const url = new URL(String(value || ""));
    return ["http:", "https:"].includes(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
}

function cleanTitle(value, url) {
  const title = String(value || "").replace(/\s+/g, " ").trim();
  if (title) return title.slice(0, 240);
  try {
    return new URL(url).hostname.replace(/^www\./i, "");
  } catch {
    return "Untitled bookmark";
  }
}

function chromiumTimeToUnixMilliseconds(value) {
  const timestamp = Number(value);
  if (!Number.isFinite(timestamp) || timestamp <= 0) return 0;
  return Math.max(0, Math.round(timestamp / 1_000 - 11_644_473_600_000));
}

function unixTimeToMilliseconds(value) {
  const timestamp = Number(value);
  if (!Number.isFinite(timestamp) || timestamp <= 0) return 0;
  return timestamp > 10_000_000_000 ? Math.round(timestamp) : Math.round(timestamp * 1_000);
}

function safariTimeToUnixMilliseconds(value) {
  if (typeof value === "string" && /[-T:]/.test(value)) {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  const timestamp = Number(value);
  if (!Number.isFinite(timestamp) || timestamp <= 0) return 0;
  if (timestamp > 10_000_000_000) return Math.round(timestamp);
  // Safari property-list dates may use seconds since 2001-01-01.
  return Math.round((timestamp + 978_307_200) * 1_000);
}

function collectChromiumBookmarks(node, source, folders = [], output = []) {
  if (!node || typeof node !== "object") return output;
  if (node.type === "url" || node.url) {
    const url = normalizeBookmarkUrl(node.url);
    if (url) {
      output.push({
        createdAt: chromiumTimeToUnixMilliseconds(node.date_added),
        faviconUrl: node.favicon_url || node.icon_url || "",
        folder: folders.filter(Boolean).join(" / "),
        source,
        sourceOrder: output.length,
        title: cleanTitle(node.name, url),
        updatedAt: chromiumTimeToUnixMilliseconds(node.date_modified),
        url,
      });
    }
    return output;
  }

  const nextFolders = node.name && !["root", "Bookmarks"].includes(node.name)
    ? [...folders, node.name]
    : folders;
  for (const child of node.children || []) {
    collectChromiumBookmarks(child, source, nextFolders, output);
  }
  return output;
}

async function parseChromiumBookmarks(filePath, source) {
  const contents = JSON.parse(await readFile(filePath, "utf8"));
  return parseChromiumBookmarkObject(contents, source);
}

export function parseChromiumBookmarkObject(contents, source = "chromium") {
  const output = [];
  for (const [rootName, rootNode] of Object.entries(contents.roots || {})) {
    const rootFolder = getChromiumBookmarkRootLabel(rootName, rootNode?.name);
    for (const child of rootNode?.children || []) {
      collectChromiumBookmarks(child, source, [rootFolder], output);
    }
  }
  return output.map(normalizeImportedBookmark);
}

function collectSafariBookmarks(node, source, folders = [], output = []) {
  if (!node || typeof node !== "object") return output;
  const url = normalizeBookmarkUrl(node.URLString);
  if (url) {
    output.push({
      createdAt: safariTimeToUnixMilliseconds(
        node.DateAdded || node.dateAdded || node.ReadingList?.DateAdded,
      ),
      faviconUrl: node.Icon || node.icon || "",
      folder: folders.filter(Boolean).join(" / "),
      source,
      sourceOrder: output.length,
      title: cleanTitle(node.URIDictionary?.title || node.Title, url),
      updatedAt: safariTimeToUnixMilliseconds(
        node.DateModified || node.dateModified || node.ReadingList?.DateModified,
      ),
      url,
    });
    return output;
  }

  const folderName = node.Title || "";
  const nextFolders = folderName ? [...folders, folderName] : folders;
  for (const child of node.Children || []) {
    collectSafariBookmarks(child, source, nextFolders, output);
  }
  return output;
}

async function parseSafariBookmarks(filePath) {
  const { stdout } = await execFileAsync(
    "/usr/bin/plutil",
    ["-convert", "json", "-o", "-", filePath],
    { maxBuffer: 32 * 1024 * 1024 },
  );
  return collectSafariBookmarks(JSON.parse(stdout), "safari");
}

function decodeHtml(value) {
  return String(value || "")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_match, code) => String.fromCodePoint(Number(code)));
}

function parseBookmarkHtml(contents) {
  const output = [];
  const folderStack = [];
  const levelStack = [];
  const tokenPattern = /<H3\b[^>]*>([\s\S]*?)<\/H3>|<DL\b[^>]*>|<\/DL>|<A\b([^>]*)>([\s\S]*?)<\/A>/gi;
  let pendingFolder = "";
  let match;

  while ((match = tokenPattern.exec(contents))) {
    if (match[1] !== undefined) {
      pendingFolder = decodeHtml(match[1].replace(/<[^>]+>/g, "")).trim();
      continue;
    }
    if (/^<DL/i.test(match[0])) {
      const hasFolder = Boolean(pendingFolder);
      if (hasFolder) folderStack.push(pendingFolder);
      levelStack.push(hasFolder);
      pendingFolder = "";
      continue;
    }
    if (/^<\/DL/i.test(match[0])) {
      if (levelStack.pop()) folderStack.pop();
      continue;
    }

    const href = match[2]?.match(/\bHREF\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
    const url = normalizeBookmarkUrl(decodeHtml(href?.[1] || href?.[2] || href?.[3] || ""));
    if (!url) continue;
    const createdAt = match[2]?.match(/\bADD_DATE\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
    const updatedAt = match[2]?.match(
      /\bLAST_MODIFIED\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i,
    );
    const icon = match[2]?.match(/\bICON\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
    output.push({
      createdAt: unixTimeToMilliseconds(
        createdAt?.[1] || createdAt?.[2] || createdAt?.[3],
      ),
      faviconUrl: decodeHtml(icon?.[1] || icon?.[2] || icon?.[3] || ""),
      folder: folderStack.filter(Boolean).join(" / "),
      source: "html",
      sourceOrder: output.length,
      title: cleanTitle(decodeHtml(match[3].replace(/<[^>]+>/g, "")), url),
      updatedAt: unixTimeToMilliseconds(
        updatedAt?.[1] || updatedAt?.[2] || updatedAt?.[3],
      ),
      url,
    });
  }

  return output;
}

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function findProfileBookmarkFiles(basePath) {
  if (!(await exists(basePath))) return [];
  const entries = await readdir(basePath, { withFileTypes: true });
  const profileNames = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => name === "Default" || /^Profile \d+$/.test(name));
  const files = [];
  for (const profileName of profileNames) {
    const filePath = path.join(basePath, profileName, "Bookmarks");
    if (await exists(filePath)) files.push(filePath);
  }
  return files;
}

async function findAtlasBookmarkFiles() {
  const atlasHost = path.join(
    os.homedir(),
    "Library",
    "Application Support",
    "com.openai.atlas",
    "browser-data",
    "host",
  );
  if (!(await exists(atlasHost))) return [];
  const entries = await readdir(atlasHost, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || !entry.name.startsWith("user-")) continue;
    const filePath = path.join(atlasHost, entry.name, "Bookmarks");
    if (await exists(filePath)) files.push(filePath);
  }
  return files;
}

async function discoverBookmarkSourceFiles() {
  const applicationSupport = path.join(os.homedir(), "Library", "Application Support");
  const chromeFiles = await findProfileBookmarkFiles(path.join(applicationSupport, "Google", "Chrome"));
  const atlasFiles = await findAtlasBookmarkFiles();
  const edgeFiles = await findProfileBookmarkFiles(path.join(applicationSupport, "Microsoft Edge"));
  const braveFiles = await findProfileBookmarkFiles(path.join(applicationSupport, "BraveSoftware", "Brave-Browser"));
  const arcFiles = await findProfileBookmarkFiles(path.join(applicationSupport, "Arc", "User Data"));
  const definitions = [
    {
      id: "chrome",
      name: "Google Chrome",
      files: chromeFiles,
      parser: parseChromiumBookmarks,
    },
    {
      id: "atlas",
      name: "ChatGPT Atlas",
      files: atlasFiles,
      parser: parseChromiumBookmarks,
    },
    {
      id: "safari",
      name: "Safari",
      files: [path.join(os.homedir(), "Library", "Safari", "Bookmarks.plist")],
      parser: parseSafariBookmarks,
    },
    {
      id: "edge",
      name: "Microsoft Edge",
      files: edgeFiles,
      parser: parseChromiumBookmarks,
    },
    {
      id: "brave",
      name: "Brave",
      files: braveFiles,
      parser: parseChromiumBookmarks,
    },
    {
      id: "arc",
      name: "Arc",
      files: arcFiles,
      parser: parseChromiumBookmarks,
    },
  ];

  for (const definition of definitions) {
    definition.files = (
      await Promise.all(
        definition.files.map(async (filePath) => (
          await exists(filePath) ? filePath : ""
        )),
      )
    ).filter(Boolean);
  }
  return definitions;
}

function dedupeBookmarks(bookmarks) {
  const seen = new Set();
  const output = [];
  for (const candidate of bookmarks) {
    const bookmark = normalizeImportedBookmark(candidate);
    if (!bookmark.url || seen.has(bookmark.url)) continue;
    seen.add(bookmark.url);
    output.push(bookmark);
  }
  return output;
}

export async function listBookmarkSources() {
  const definitions = await discoverBookmarkSourceFiles();
  const sources = [];
  for (const definition of definitions) {
    let count = 0;
    let readable = false;
    for (const filePath of definition.files) {
      try {
        const bookmarks = await definition.parser(filePath, definition.id);
        count += bookmarks.length;
        readable = true;
      } catch {
        // A browser may protect its profile; keep scanning other profiles.
      }
    }
    sources.push({
      available: definition.files.length > 0,
      count,
      id: definition.id,
      name: definition.name,
      readable,
    });
  }
  return sources;
}

export async function importDetectedBookmarks(sourceIds = []) {
  const allowedIds = new Set(sourceIds);
  const definitions = await discoverBookmarkSourceFiles();
  const imported = [];
  const errors = [];

  for (const definition of definitions) {
    if (allowedIds.size && !allowedIds.has(definition.id)) continue;
    for (const filePath of definition.files) {
      try {
        imported.push(...await definition.parser(filePath, definition.id));
      } catch {
        errors.push(definition.name);
      }
    }
  }

  return {
    bookmarks: dedupeBookmarks(imported).slice(0, 5_000),
    errors: [...new Set(errors)],
  };
}

export async function importBookmarksFromHtml(window) {
  const result = await dialog.showOpenDialog(window, {
    filters: [{ name: "Bookmark HTML", extensions: ["html", "htm"] }],
    properties: ["openFile"],
    title: "Import bookmarks from HTML",
  });
  if (result.canceled || !result.filePaths[0]) {
    return { bookmarks: [], canceled: true, errors: [] };
  }
  const contents = await readFile(result.filePaths[0], "utf8");
  return {
    bookmarks: dedupeBookmarks(parseBookmarkHtml(contents)).slice(0, 5_000),
    canceled: false,
    errors: [],
  };
}

function faviconCandidatesFromHtml(html, pageUrl) {
  const candidates = [];
  const linkPattern = /<link\b[^>]*>/gi;
  for (const tag of String(html || "").match(linkPattern) || []) {
    const rel = tag.match(/\brel\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
    const relValue = String(rel?.[1] || rel?.[2] || rel?.[3] || "").toLowerCase();
    if (!/(?:^|\s)(?:shortcut\s+icon|icon|apple-touch-icon)(?:\s|$)/.test(relValue)) continue;
    const href = tag.match(/\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
    const rawHref = decodeHtml(href?.[1] || href?.[2] || href?.[3] || "");
    try {
      const resolved = new URL(rawHref, pageUrl);
      if (["http:", "https:"].includes(resolved.protocol)) candidates.push(resolved.href);
    } catch {
      // Ignore malformed icon declarations.
    }
  }
  try {
    candidates.push(new URL("/favicon.ico", pageUrl).href);
  } catch {
    // The caller already validates page URLs.
  }
  return [...new Set(candidates)];
}

function readImageDimensions(bytes, mimeType = "") {
  const buffer = Buffer.from(bytes);
  if (buffer.length >= 24 && buffer.subarray(1, 4).toString("ascii") === "PNG") {
    return { height: buffer.readUInt32BE(20), width: buffer.readUInt32BE(16) };
  }
  if (buffer.length >= 10 && ["GIF87a", "GIF89a"].includes(buffer.subarray(0, 6).toString("ascii"))) {
    return { height: buffer.readUInt16LE(8), width: buffer.readUInt16LE(6) };
  }
  if (buffer.length >= 8 && buffer.readUInt16LE(0) === 0 && buffer.readUInt16LE(2) === 1) {
    return { height: buffer[7] || 256, width: buffer[6] || 256 };
  }
  if (buffer.length >= 4 && buffer[0] === 0xff && buffer[1] === 0xd8) {
    let offset = 2;
    while (offset + 9 < buffer.length) {
      if (buffer[offset] !== 0xff) { offset += 1; continue; }
      const marker = buffer[offset + 1];
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
        return { height: buffer.readUInt16BE(offset + 5), width: buffer.readUInt16BE(offset + 7) };
      }
      const length = buffer.readUInt16BE(offset + 2);
      if (!Number.isFinite(length) || length < 2) break;
      offset += length + 2;
    }
  }
  if (mimeType === "image/svg+xml" || buffer.subarray(0, 512).toString("utf8").includes("<svg")) {
    const svg = buffer.subarray(0, 4_096).toString("utf8");
    const width = Number(svg.match(/\bwidth=["']([\d.]+)/i)?.[1]);
    const height = Number(svg.match(/\bheight=["']([\d.]+)/i)?.[1]);
    const viewBox = svg.match(/\bviewBox=["'][^"']*?([\d.]+)[ ,]+([\d.]+)["']/i);
    return {
      height: height || Number(viewBox?.[2]) || 256,
      width: width || Number(viewBox?.[1]) || 256,
    };
  }
  return { height: 0, width: 0 };
}

async function inspectFaviconUrl(iconUrl) {
  try {
    const response = await fetch(iconUrl, {
      headers: { "user-agent": "Mozilla/5.0 Brizo/1.0" },
      redirect: "follow",
      signal: AbortSignal.timeout(4_500),
    });
    if (!response.ok) return "";
    const contentLength = Number(response.headers.get("content-length"));
    if (Number.isFinite(contentLength) && (contentLength <= 0 || contentLength > 512_000)) return "";
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (!bytes.length || bytes.length > 512_000) return "";
    const declaredType = String(response.headers.get("content-type") || "")
      .split(";", 1)[0]
      .trim()
      .toLowerCase();
    const extension = new URL(response.url || iconUrl).pathname.match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase();
    const inferredType = extension === "svg" ? "image/svg+xml"
      : extension === "png" ? "image/png"
        : ["jpg", "jpeg"].includes(extension) ? "image/jpeg"
          : extension === "webp" ? "image/webp"
            : "image/x-icon";
    const mimeType = declaredType.startsWith("image/") ? declaredType : inferredType;
    if (!mimeType.startsWith("image/")) return null;
    const dimensions = readImageDimensions(bytes, mimeType);
    return { ...dimensions, url: response.url || iconUrl };
  } catch {
    return null;
  }
}

async function resolveOriginFavicon(pageUrl) {
  let html = "";
  try {
    const response = await fetch(pageUrl, {
      headers: {
        accept: "text/html,application/xhtml+xml",
        "user-agent": "Mozilla/5.0 Brizo/1.0",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(5_000),
    });
    if (response.ok) html = (await response.text()).slice(0, 1_000_000);
  } catch {
    // The conventional origin favicon remains a valid fallback candidate.
  }
  for (const candidate of faviconCandidatesFromHtml(html, pageUrl).slice(0, 8)) {
    const inspected = await inspectFaviconUrl(candidate);
    if (inspected) return inspected.url;
  }
  return "";
}

export async function resolveBookmarkFavicons(bookmarks = []) {
  const byOrigin = new Map();
  for (const bookmark of bookmarks) {
    try {
      const url = new URL(String(bookmark?.url || ""));
      if (!["http:", "https:"].includes(url.protocol)) continue;
      if (!byOrigin.has(url.origin)) byOrigin.set(url.origin, []);
      byOrigin.get(url.origin).push({
        faviconUrl: String(bookmark?.faviconUrl || ""),
        url: url.href,
      });
    } catch {
      // Ignore invalid bookmark URLs.
    }
  }

  const origins = [...byOrigin.entries()];
  const resolved = [];
  let cursor = 0;
  const worker = async () => {
    while (cursor < origins.length) {
      const [origin, items] = origins[cursor++];
      const replacements = [];
      for (const item of items) {
        const current = item.faviconUrl ? await inspectFaviconUrl(item.faviconUrl) : null;
        if (!current || current.width < 20 || current.height < 20) replacements.push(item);
      }
      if (!replacements.length) continue;
      const faviconUrl = await resolveOriginFavicon(replacements[0]?.url || origin);
      if (faviconUrl) resolved.push(...replacements.map((item) => ({ faviconUrl, url: item.url })));
    }
  };
  await Promise.all(Array.from({ length: Math.min(10, origins.length) }, worker));
  return resolved;
}

function screenshotFilename(title, suffix) {
  const safeTitle = String(title || "Web page")
    .normalize("NFKC")
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
  return `${safeTitle || "Web page"} - ${suffix}.png`;
}

async function selectScreenshotRange(webContents) {
  return await webContents.executeJavaScript(`
    new Promise((resolve) => {
      window.__beanScreenshotCleanup?.();
      const overlay = document.createElement("div");
      const selection = document.createElement("div");
      let startX = 0;
      let startY = 0;
      let dragging = false;

      Object.assign(overlay.style, {
        position: "fixed",
        inset: "0",
        zIndex: "2147483647",
        cursor: "crosshair",
        background: "rgba(17, 22, 18, 0.18)",
        userSelect: "none"
      });
      Object.assign(selection.style, {
        position: "fixed",
        display: "none",
        border: "2px solid #ffffff",
        boxShadow: "0 0 0 1px rgba(34, 58, 39, 0.75), 0 8px 28px rgba(0, 0, 0, 0.24)",
        background: "rgba(255, 255, 255, 0.08)",
        pointerEvents: "none"
      });
      overlay.appendChild(selection);
      document.documentElement.appendChild(overlay);

      const cleanup = () => {
        overlay.remove();
        window.removeEventListener("keydown", onKeyDown, true);
        delete window.__beanScreenshotCleanup;
      };
      const finish = (value) => {
        cleanup();
        window.setTimeout(() => resolve(value), 80);
      };
      const updateSelection = (x, y) => {
        const left = Math.min(startX, x);
        const top = Math.min(startY, y);
        const width = Math.abs(x - startX);
        const height = Math.abs(y - startY);
        Object.assign(selection.style, {
          display: "block",
          left: left + "px",
          top: top + "px",
          width: width + "px",
          height: height + "px"
        });
      };
      const onKeyDown = (event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          finish(null);
        }
      };

      window.__beanScreenshotCleanup = () => finish(null);
      window.addEventListener("keydown", onKeyDown, true);
      overlay.addEventListener("pointerdown", (event) => {
        event.preventDefault();
        dragging = true;
        startX = event.clientX;
        startY = event.clientY;
        overlay.setPointerCapture(event.pointerId);
        updateSelection(event.clientX, event.clientY);
      });
      overlay.addEventListener("pointermove", (event) => {
        if (dragging) updateSelection(event.clientX, event.clientY);
      });
      overlay.addEventListener("pointerup", (event) => {
        if (!dragging) return;
        dragging = false;
        const x = Math.round(Math.min(startX, event.clientX));
        const y = Math.round(Math.min(startY, event.clientY));
        const width = Math.round(Math.abs(event.clientX - startX));
        const height = Math.round(Math.abs(event.clientY - startY));
        finish(width >= 8 && height >= 8 ? { x, y, width, height } : null);
      });
    })
  `, true);
}

async function captureFullPage(webContents) {
  const debuggerApi = webContents.debugger;
  const attachedHere = !debuggerApi.isAttached();
  if (attachedHere) debuggerApi.attach("1.3");
  try {
    await debuggerApi.sendCommand("Page.enable");
    const metrics = await debuggerApi.sendCommand("Page.getLayoutMetrics");
    const size = metrics.cssContentSize || metrics.contentSize;
    const width = Math.max(1, Math.ceil(size.width));
    const height = Math.max(1, Math.ceil(size.height));
    const scale = Math.min(
      1,
      30_000 / width,
      30_000 / height,
      Math.sqrt(90_000_000 / (width * height)),
    );
    const result = await debuggerApi.sendCommand("Page.captureScreenshot", {
      captureBeyondViewport: true,
      clip: { x: 0, y: 0, width, height, scale },
      format: "png",
      fromSurface: true,
    });
    return Buffer.from(result.data, "base64");
  } finally {
    if (attachedHere && debuggerApi.isAttached()) debuggerApi.detach();
  }
}

async function captureVisiblePage(webContents) {
  try {
    const image = await webContents.capturePage();
    const png = image.toPNG();
    if (png.length > 0) return png;
  } catch {
    // Hidden or fully occluded windows can lack a display surface; CDP still has one.
  }

  return captureVisiblePageViaDebugger(webContents);
}

async function captureVisiblePageViaDebugger(webContents) {
  const debuggerApi = webContents.debugger;
  const attachedHere = !debuggerApi.isAttached();
  if (attachedHere) debuggerApi.attach("1.3");
  try {
    await debuggerApi.sendCommand("Page.enable");
    const metrics = await debuggerApi.sendCommand("Page.getLayoutMetrics");
    const viewport = metrics.cssVisualViewport || metrics.visualViewport;
    const result = await debuggerApi.sendCommand("Page.captureScreenshot", {
      captureBeyondViewport: false,
      clip: {
        x: Math.max(0, viewport?.pageX || 0),
        y: Math.max(0, viewport?.pageY || 0),
        width: Math.max(1, viewport?.clientWidth || viewport?.width || 1),
        height: Math.max(1, viewport?.clientHeight || viewport?.height || 1),
        scale: 1,
      },
      format: "png",
      fromSurface: true,
    });
    return Buffer.from(result.data, "base64");
  } finally {
    if (attachedHere && debuggerApi.isAttached()) debuggerApi.detach();
  }
}

export async function captureAndSaveScreenshot({ mode, outputPath = "", webContents, window }) {
  let png;
  let suffix;
  if (mode === "selection") {
    const range = await selectScreenshotRange(webContents);
    if (!range) return { status: "canceled" };
    png = (await webContents.capturePage(range)).toPNG();
    suffix = "selection";
  } else if (mode === "full-page") {
    png = await captureFullPage(webContents);
    suffix = "full page";
  } else if (mode === "visible-debugger") {
    // Shell overlays intentionally hide the retained WebContentsView. CDP
    // captures its current compositor surface without resizing or revealing it.
    png = await captureVisiblePageViaDebugger(webContents);
    suffix = "visible page";
  } else {
    png = await captureVisiblePage(webContents);
    suffix = "visible page";
  }

  let filePath = outputPath;
  if (!filePath) {
    const saveResult = await dialog.showSaveDialog(window, {
      defaultPath: path.join(
        os.homedir(),
        "Pictures",
        screenshotFilename(webContents.getTitle(), suffix),
      ),
      filters: [{ name: "PNG image", extensions: ["png"] }],
      properties: ["createDirectory", "showOverwriteConfirmation"],
      title: "Save screenshot",
    });
    if (saveResult.canceled || !saveResult.filePath) return { status: "canceled" };
    filePath = saveResult.filePath;
  }
  await writeFile(filePath, png);
  const details = await stat(filePath);
  return { bytes: details.size, status: "saved" };
}
