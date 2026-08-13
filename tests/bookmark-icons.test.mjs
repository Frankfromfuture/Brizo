import assert from "node:assert/strict";
import test from "node:test";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SMART_FUNCTIONS, SMART_INDUSTRIES } from "../electron/smart-bookmark-service.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const iconDirectory = path.join(root, "src", "bookmark-icons");

test("local bookmark icon manifest provides default and active SVGs for every smart category", async () => {
  const manifest = JSON.parse(await readFile(path.join(iconDirectory, "manifest.json"), "utf8"));
  assert.ok(manifest.length >= 83);
  assert.equal(new Set(manifest.map((entry) => entry.id)).size, manifest.length);
  const available = new Set(manifest.map((entry) => entry.id));
  const smartIconIds = [...SMART_INDUSTRIES, ...SMART_FUNCTIONS].map((entry) => entry.iconId);
  for (const iconId of smartIconIds) {
    assert.ok(available.has(iconId), `missing icon manifest entry: ${iconId}`);
    await access(path.join(iconDirectory, `${iconId}-default.svg`));
    await access(path.join(iconDirectory, `${iconId}-active.svg`));
  }
});
