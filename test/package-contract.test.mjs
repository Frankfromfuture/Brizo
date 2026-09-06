import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { BRIZO_PROTOCOL_VERSION } from "../lib/protocol.mjs";
import { BRIZO_PACKAGE_VERSION } from "../lib/version.mjs";

test("package, CLI, and bridge protocol versions have one contract", async () => {
  const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  assert.equal(packageJson.version, BRIZO_PACKAGE_VERSION);
  assert.equal(packageJson.brizoProtocolVersion, BRIZO_PROTOCOL_VERSION);
});
