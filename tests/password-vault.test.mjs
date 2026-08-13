import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createPasswordVault } from "../electron/password-vault.mjs";

const safeStorage = {
  decryptString: (buffer) => Buffer.from(buffer.toString(), "base64").toString("utf8"),
  encryptString: (value) => Buffer.from(Buffer.from(value, "utf8").toString("base64")),
  isEncryptionAvailable: () => true,
};

test("password vault encrypts, masks, edits without replacement, reveals and deletes", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "brizo-password-vault-"));
  const storePath = path.join(directory, "vault.json");
  const vault = createPasswordVault({ safeStorage, storePath });

  const created = await vault.save({ site: "example.com", username: "alex", password: "secret" });
  assert.equal(created.status, "saved");
  assert.equal(created.entries[0].passwordMask, "********");
  assert.equal(JSON.stringify(created.entries).includes("secret"), false);
  assert.equal((await readFile(storePath, "utf8")).includes('"password":"secret"'), false);

  const id = created.entries[0].id;
  const edited = await vault.save({ id, site: "login.example.com", username: "alex", password: "" });
  assert.equal(edited.entries[0].site, "login.example.com");
  assert.equal(await vault.reveal(id), "secret");

  assert.deepEqual(await vault.remove(id), []);
});
