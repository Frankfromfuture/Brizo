import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { createModelGuard } from "../electron/secret-store.mjs";

const fakeSafeStorage = {
  isEncryptionAvailable: () => true,
  encryptString: (value) => Buffer.from(`encrypted:${value}`),
  decryptString: (value) => value.toString().replace(/^encrypted:/, ""),
};

test("search service keys seed into encrypted storage and never cross the sanitized boundary", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "brizo-search-secret-"));
  const storePath = path.join(directory, "model-guard.json");
  const seedPath = path.join(directory, "search-keys.local.json");
  const plaintext = "test-secret-that-must-not-leak";
  await writeFile(seedPath, JSON.stringify({ serper: plaintext }));
  const guard = createModelGuard({ storePath: () => storePath, safeStorage: fakeSafeStorage });

  const seeded = await guard.seedServicesFromFile(seedPath);
  assert.deepEqual(seeded.seeded, ["serper"]);
  assert.equal(await guard.readServiceKey("serper"), plaintext);

  const store = await guard.readStore();
  const sanitized = guard.sanitizeServices(store);
  assert.equal(JSON.stringify(sanitized).includes(plaintext), false);
  assert.equal(JSON.stringify(sanitized).includes("encryptedKey"), false);
  assert.equal((await readFile(storePath, "utf8")).includes(plaintext), false);
});
