import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { build } from "vite";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("the new-tab composer uses the approved border-beam preset", async () => {
  const [appSource, packageSource, styleSource] = await Promise.all([
    readFile(path.join(projectRoot, "src", "App.jsx"), "utf8"),
    readFile(path.join(projectRoot, "package.json"), "utf8"),
    readFile(path.join(projectRoot, "src", "styles.css"), "utf8"),
  ]);

  assert.match(appSource, /import \{ BorderBeam \} from "border-beam"/);
  assert.match(appSource, /<BorderBeam[\s\S]*?colorVariant="sunset"[\s\S]*?size=\{commandMode === "use" \? "pulse-outside" : "md"\}[\s\S]*?strength=\{commandMode === "use" \? 0\.84 : 0\.85\}/);
  assert.match(packageSource, /"border-beam": "\^1\.3\.0"/);
  assert.doesNotMatch(styleSource, /\.brizo-border-beam/);
  assert.match(styleSource, /\.new-tab-beam \{\s*width: 100%;\s*\}/);
});

test("dead semantic bookmark UI is absent from the renderer bundle", async () => {
  const appSource = await readFile(path.join(projectRoot, "src", "App.jsx"), "utf8");

  assert.doesNotMatch(appSource, /BookmarkSemanticIcon/);
  assert.doesNotMatch(appSource, /function BookmarkTree\s*\(/);

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
    id.includes("BookmarkSemanticIcon"))), false);
});
