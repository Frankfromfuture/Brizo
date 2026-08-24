import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { build } from "vite";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("the fixed Brizo beam preserves its approved appearance without the generic runtime", async () => {
  const [appSource, beamSource, packageSource, styleSource] = await Promise.all([
    readFile(path.join(projectRoot, "src", "App.jsx"), "utf8"),
    readFile(path.join(projectRoot, "src", "components", "BrizoBorderBeam.jsx"), "utf8"),
    readFile(path.join(projectRoot, "package.json"), "utf8"),
    readFile(path.join(projectRoot, "src", "styles.css"), "utf8"),
  ]);

  assert.doesNotMatch(appSource, /from ["']border-beam["']/);
  assert.match(appSource, /<BrizoBorderBeam active=\{active\} className="new-tab-beam">/);
  assert.doesNotMatch(packageSource, /"border-beam"/);
  assert.match(beamSource, /"--brizo-beam-strength": 0\.7/);
  assert.match(styleSource, /border-radius: 10px/);
  assert.match(styleSource, /brizo-beam-spin 1\.96s linear 2 forwards/);
  assert.match(styleSource, /brizo-beam-hue-shift 3\.92s ease-in-out forwards/);
  assert.doesNotMatch(styleSource, /brizo-beam-(?:spin|hue-shift)[^;{]*infinite/);
  assert.match(styleSource, /\.brizo-border-beam\.is-paused[\s\S]*?animation-play-state: paused !important/);
  assert.match(styleSource, /radial-gradient\(ellipse 70px 40px at 33% -7\.4%, rgb\(255, 50, 100\), transparent\)/);
  assert.match(styleSource, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.brizo-border-beam[\s\S]*?animation: none/);
});

test("dead semantic bookmark UI no longer emits its eager SVG glob", async () => {
  const [appSource, sourceAssets] = await Promise.all([
    readFile(path.join(projectRoot, "src", "App.jsx"), "utf8"),
    readdir(path.join(projectRoot, "src", "bookmark-icons")),
  ]);

  assert.doesNotMatch(appSource, /BookmarkSemanticIcon/);
  assert.doesNotMatch(appSource, /function BookmarkTree\s*\(/);
  assert.equal(sourceAssets.filter((name) => name.endsWith(".svg")).length, 166);

  const buildResult = await build({
    logLevel: "silent",
    root: projectRoot,
    build: { write: false },
  });
  const outputs = (Array.isArray(buildResult) ? buildResult : [buildResult])
    .flatMap((result) => result.output || []);
  const chunks = outputs.filter((output) => output.type === "chunk");
  const emittedBookmarkIcons = outputs.filter((output) =>
    output.type === "asset"
      && /\/(?:[a-z-]+)-(?:active|default)-[^/]+\.svg$/.test(output.fileName));

  assert.equal(emittedBookmarkIcons.length, 0);
  assert.equal(chunks.some((chunk) => Object.keys(chunk.modules).some((id) =>
    id.includes("BookmarkSemanticIcon") || id.includes("node_modules/border-beam"))), false);
});
