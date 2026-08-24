import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, stat, writeFile } from "node:fs/promises";
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
  assert.equal(edited.entries[0].site, "https://login.example.com");
  assert.equal(await vault.reveal(id), "secret");
  assert.equal((await vault.matches("https://login.example.com/account")).length, 1);
  assert.equal((await vault.matches("https://evil-example.com/login")).length, 0);
  assert.deepEqual(await vault.revealForUrl(id, "https://login.example.com/sign-in"), {
    password: "secret",
    username: "alex",
  });
  assert.equal(await vault.revealForUrl(id, "https://phishing.example.net/"), null);

  assert.deepEqual(await vault.remove(id), []);
});

test("password vault binds credentials to one exact HTTPS origin including non-default ports", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "brizo-password-vault-origin-"));
  const storePath = path.join(directory, "vault.json");
  const vault = createPasswordVault({ safeStorage, storePath });

  const created = await vault.save({
    site: "https://login.example.com:8443/session?next=%2Faccount#sign-in",
    username: "alex",
    password: "secret",
  });
  assert.equal(created.status, "saved");
  assert.equal(created.entries[0].site, "https://login.example.com:8443");
  const id = created.entries[0].id;

  assert.equal((await vault.matches("https://login.example.com:8443/account")).length, 1);
  assert.equal((await vault.matches("https://login.example.com/account")).length, 0);
  assert.equal((await vault.matches("https://sub.login.example.com:8443/account")).length, 0);
  assert.equal((await vault.matches("https://example.com:8443/account")).length, 0);
  assert.equal((await vault.matches("http://login.example.com:8443/account")).length, 0);
  assert.equal(await vault.revealForUrl(id, "https://login.example.com:8444/account"), null);

  const defaultPort = await vault.save({ site: "https://shop.example.com:443/login", username: "sam", password: "pw" });
  assert.equal(defaultPort.entries[0].site, "https://shop.example.com");
  assert.equal((await vault.matches("https://shop.example.com/cart")).length, 1);
});

test("password vault rejects HTTP, embedded credentials, IPs, local names and public-suffix-like scopes", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "brizo-password-vault-reject-"));
  const storePath = path.join(directory, "vault.json");
  const vault = createPasswordVault({ safeStorage, storePath });
  const unsafeSites = [
    "http://example.com",
    "https://user:secret@example.com",
    "https://localhost",
    "https://router.local",
    "https://127.0.0.1",
    "https://[::1]",
    "https://com",
    "https://co.uk",
    "https://github.io",
    "https://-bad.example.com",
    "file:///tmp/login.html",
  ];

  for (const site of unsafeSites) {
    const result = await vault.save({ site, username: "alex", password: "secret" });
    assert.equal(result.status, "error", site);
  }
  assert.deepEqual(await vault.list(), []);

  const privateSuffixAccount = await vault.save({
    site: "https://frankfan.github.io/login",
    username: "alex",
    password: "secret",
  });
  assert.equal(privateSuffixAccount.status, "saved");
  assert.equal((await vault.matches("https://frankfan.github.io/account")).length, 1);
  assert.equal((await vault.matches("https://other.github.io/account")).length, 0);
});

test("legacy host entries match only their exact HTTPS origin and never silently broaden", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "brizo-password-vault-legacy-"));
  const storePath = path.join(directory, "vault.json");
  const encryptedPassword = safeStorage.encryptString("legacy-secret").toString("base64");
  await writeFile(storePath, JSON.stringify({
    entries: [
      { id: "legacy-host", site: "legacy.example.com", username: "alex", encryptedPassword },
      { id: "legacy-port", site: "https://secure.example.com:9443/login", username: "sam", encryptedPassword },
      { id: "legacy-http", site: "http://old.example.com", username: "lee", encryptedPassword },
    ],
  }), { mode: 0o600 });
  const vault = createPasswordVault({ safeStorage, storePath });

  assert.equal((await vault.matches("https://legacy.example.com/login")).length, 1);
  assert.equal((await vault.matches("https://sub.legacy.example.com/login")).length, 0);
  assert.equal((await vault.matches("http://legacy.example.com/login")).length, 0);
  assert.equal((await vault.matches("https://secure.example.com:9443/account")).length, 1);
  assert.equal((await vault.matches("https://secure.example.com/account")).length, 0);
  assert.equal((await vault.matches("http://old.example.com/login")).length, 0);
  assert.equal(await vault.revealForUrl("legacy-http", "https://old.example.com/login"), null);
});

test("password vault serializes concurrent mutations and atomically persists mode 0600 files", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "brizo-password-vault-atomic-"));
  const storePath = path.join(directory, "vault.json");
  const vault = createPasswordVault({ safeStorage, storePath });

  const results = await Promise.all(Array.from({ length: 40 }, (_, index) => vault.save({
    site: `https://account-${index}.example.com/login`,
    username: `user-${index}`,
    password: `secret-${index}`,
  })));
  assert.equal(results.every((result) => result.status === "saved"), true);
  assert.equal((await vault.list()).length, 40);

  const raw = await readFile(storePath, "utf8");
  const persisted = JSON.parse(raw);
  assert.equal(persisted.version, 2);
  assert.equal(persisted.entries.length, 40);
  assert.equal(raw.includes("secret-"), false);
  assert.equal((await stat(storePath)).mode & 0o777, 0o600);
  assert.deepEqual(await readdir(directory), ["vault.json"]);
});

test("password vault never replaces an unreadable or malformed store with an empty file", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "brizo-password-vault-corrupt-"));
  const storePath = path.join(directory, "vault.json");
  const original = "{not valid json";
  await writeFile(storePath, original, { mode: 0o600 });
  const vault = createPasswordVault({ safeStorage, storePath });

  await assert.rejects(() => vault.save({ site: "https://example.com", username: "alex", password: "secret" }), SyntaxError);
  assert.equal(await readFile(storePath, "utf8"), original);
  assert.deepEqual(await readdir(directory), ["vault.json"]);
});
