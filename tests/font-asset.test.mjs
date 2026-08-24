import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const projectRoot = path.resolve(import.meta.dirname, "..");

test("Brizo uses the complete WOFF2 UI font instead of shipping the TTF in the renderer", async () => {
  const css = await readFile(path.join(projectRoot, "src", "styles.css"), "utf8");
  const main = await readFile(path.join(projectRoot, "electron", "main.mjs"), "utf8");
  const fontPath = path.join(projectRoot, "src", "assets", "fonts", "HarmonyOS_Sans_SC_Regular.woff2");
  const details = await stat(fontPath);
  assert.match(css, /HarmonyOS_Sans_SC_Regular\.woff2/);
  assert.match(main, /HarmonyOS_Sans_SC_Regular\.woff2/);
  assert.ok(details.size > 1_000_000, "the full Chinese glyph repertoire should be retained");
  assert.ok(details.size < 6_000_000, "WOFF2 compression should materially reduce the asset");
});
