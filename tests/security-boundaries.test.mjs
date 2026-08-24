import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const readProjectFile = (relativePath) => readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");

test("sandboxed browser preload uses Web Crypto and never requires Node crypto", async () => {
  const source = await readProjectFile("electron/browser-page-preload.cjs");
  assert.doesNotMatch(source, /require\(["'](?:node:)?crypto["']\)/u);
  assert.match(source, /globalThis\.crypto\.subtle\.digest/u);
});

test("credential IPC rechecks the exact frame URL after asynchronous vault access", async () => {
  const source = await readProjectFile("electron/main.mjs");
  assert.ok((source.match(/frame\.url !== pageUrl/gu)?.length || 0) >= 2);
});

test("external page console output is not forwarded and renderer diagnostics are sanitized", async () => {
  const source = await readProjectFile("electron/main.mjs");
  assert.doesNotMatch(source, /createdWebContents\.on\(["']console-message["']/u);
  assert.match(source, /if \(browserDiagnosticsEnabled\)/u);
  assert.match(source, /sanitizeDiagnosticText\(message\)/u);
  assert.match(source, /summarizeDiagnosticUrl\(sourceId\)/u);
});

test("privileged renderer CSP forbids arbitrary network connections", async () => {
  const source = await readProjectFile("index.html");
  const content = source.match(/http-equiv="Content-Security-Policy"\s+content="([^"]+)"/u)?.[1] || "";
  assert.match(content, /default-src 'self'/u);
  assert.match(content, /base-uri 'none'/u);
  assert.match(content, /object-src 'none'/u);
  assert.match(content, /form-action 'none'/u);
  assert.match(content, /connect-src 'self' ws:\/\/127\.0\.0\.1:5173/u);
  assert.doesNotMatch(content.match(/connect-src[^;]*/u)?.[0] || "", /https:/u);
  assert.match(content, /img-src 'self' data: blob:/u);
  assert.doesNotMatch(content.match(/img-src[^;]*/u)?.[0] || "", /https:/u);
});

test("renderer images and page favicons cross the main-process safe image boundary", async () => {
  const main = await readProjectFile("electron/main.mjs");
  const search = await readProjectFile("electron/search/search-service.mjs");
  assert.match(main, /createRemoteImageProxy\(\)/u);
  assert.match(main, /createRendererImageLocalizer\(\{ proxy: remoteImageProxy \}\)/u);
  assert.match(main, /remoteImageProxy\.getDataUrl\(source\)/u);
  assert.match(main, /localizeSearchImages: rendererImageLocalizer\.localizeSearchImages/u);
  assert.doesNotMatch(search, /fetch\(url,[\s\S]{0,220}Accept: "image/u);
});

test("external navigation stays behind the warm shell until compositor-ready frames", async () => {
  const main = await readProjectFile("electron/main.mjs");
  const app = await readProjectFile("src/App.jsx");
  const styles = await readProjectFile("src/styles.css");

  assert.match(main, /view\.__brizoNavigationPending = true;\s+view\.__brizoContentReady = false;/u);
  assert.match(main, /browserVisible\s+&&\s+\(view\.__brizoContentReady \|\| view\.__brizoErrorPageActive\)/u);
  assert.match(main, /captureMeaningfulPaint[\s\S]*captureMeaningfulPaint/u);
  assert.match(app, /className="browser-navigation-loading"/u);
  assert.match(styles, /\.browser-navigation-loading\s*\{[\s\S]*background:\s*#f1e7e1;/u);
  assert.match(styles, /prefers-reduced-motion:\s*reduce[\s\S]*\.browser-navigation-loading > i[\s\S]*animation:\s*none/u);
});

test("private-window shell CSP denies unspecified resources", async () => {
  const source = await readProjectFile("electron/incognito.html");
  const content = source.match(/http-equiv="Content-Security-Policy"\s+content="([^"]+)"/u)?.[1] || "";
  assert.match(content, /default-src 'none'/u);
  assert.match(content, /base-uri 'none'/u);
  assert.match(content, /object-src 'none'/u);
  assert.match(content, /form-action 'none'/u);
  assert.match(content, /script-src 'self'/u);
});
