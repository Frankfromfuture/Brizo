import assert from "node:assert/strict";
import test from "node:test";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const iconDirectory = path.join(root, "src", "bookmark-icons");

test("local bookmark icon manifest provides default and active SVGs for every category", async () => {
  const manifest = JSON.parse(await readFile(path.join(iconDirectory, "manifest.json"), "utf8"));
  assert.ok(manifest.length >= 83);
  assert.equal(new Set(manifest.map((entry) => entry.id)).size, manifest.length);
  for (const entry of manifest) {
    await access(path.join(iconDirectory, entry.default));
    await access(path.join(iconDirectory, entry.active));
  }
});
