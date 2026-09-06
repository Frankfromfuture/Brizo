import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { mkdir, mkdtemp, readFile, rm, unlink, writeFile } from "node:fs/promises";
import {
  MANIFEST_NAME,
  createSourceSnapshot,
  parseArguments,
  syncBrowse,
} from "../scripts/sync-browse.mjs";

const SOURCE_URL = "https://github.com/Frankfromfuture/Brizo.git";

async function writeFixtureFile(root, relativePath, contents) {
  const target = path.join(root, ...relativePath.split("/"));
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, contents);
}

async function fixture(t, options = {}) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "brizo-sync-"));
  const sourceRoot = path.join(directory, "source");
  const browseRoot = path.join(directory, "browse");
  await mkdir(sourceRoot, { recursive: true });
  await mkdir(browseRoot, { recursive: true });
  await writeFixtureFile(sourceRoot, "package.json", `${JSON.stringify({
    name: "brizo",
    version: options.version || "2.4.0",
    brizoProtocolVersion: options.protocolVersion || 3,
  }, null, 2)}\n`);
  await writeFixtureFile(sourceRoot, "README.md", "# Brizo public\n");
  await writeFixtureFile(sourceRoot, "lib/client.mjs", "export const client = true;\n");
  await writeFixtureFile(sourceRoot, "bin/brizo.mjs", "#!/usr/bin/env node\n");
  await writeFixtureFile(browseRoot, "package.json", `${JSON.stringify({
    name: "brizo-browse",
    private: options.privateTarget ?? true,
    productName: options.productName || "Brizo",
  }, null, 2)}\n`);
  t.after(() => rm(directory, { recursive: true, force: true }));
  return {
    directory,
    sourceRoot,
    browseRoot,
    trackedFiles: ["package.json", "README.md", "lib/client.mjs", "bin/brizo.mjs"],
  };
}

function optionsFor(item, mode, trackedFiles = item.trackedFiles) {
  return {
    mode,
    sourceRoot: item.sourceRoot,
    browseRoot: item.browseRoot,
    sourceUrl: SOURCE_URL,
    trackedFiles,
  };
}

test("writes a sorted, hashed public snapshot and checks it offline", async t => {
  const item = await fixture(t);
  const written = await syncBrowse(optionsFor(item, "write"));
  assert.equal(written.ok, true);
  assert.equal(written.fileCount, item.trackedFiles.length);
  assert.match(written.overallDigest, /^[a-f0-9]{64}$/u);

  const mirror = path.join(item.browseRoot, "packages", "brizo");
  assert.equal(await readFile(path.join(mirror, "README.md"), "utf8"), "# Brizo public\n");
  assert.equal(await readFile(path.join(mirror, "lib", "client.mjs"), "utf8"), "export const client = true;\n");

  const manifest = JSON.parse(await readFile(path.join(item.browseRoot, MANIFEST_NAME), "utf8"));
  assert.equal(manifest.source, "https://github.com/Frankfromfuture/Brizo");
  assert.equal(manifest.packageVersion, "2.4.0");
  assert.equal(manifest.protocolVersion, 3);
  assert.deepEqual(
    manifest.files.map(file => file.path),
    [...item.trackedFiles].sort((left, right) => left.localeCompare(right, "en")),
  );
  assert.equal(manifest.files.every(file => /^[a-f0-9]{64}$/u.test(file.sha256)), true);

  const checked = await syncBrowse(optionsFor(item, "check"));
  assert.equal(checked.ok, true);
  assert.equal(checked.overallDigest, written.overallDigest);
  assert.deepEqual(parseArguments(["--check", "--browse", item.browseRoot]), {
    mode: "check",
    browseRoot: item.browseRoot,
  });
});

test("reports mirrored content drift and refuses to overwrite it", async t => {
  const item = await fixture(t);
  await syncBrowse(optionsFor(item, "write"));
  const mirroredClient = path.join(item.browseRoot, "packages", "brizo", "lib", "client.mjs");
  await writeFile(mirroredClient, "private edit\n");

  await assert.rejects(
    syncBrowse(optionsFor(item, "check")),
    error => error.code === "MIRROR_OUT_OF_SYNC"
      && error.details.drift.some(entry => entry.path === "lib/client.mjs"),
  );
  await assert.rejects(
    syncBrowse(optionsFor(item, "write")),
    error => error.code === "MANAGED_FILE_DRIFT"
      && error.details.problems.some(entry => entry.path === "lib/client.mjs"),
  );
  assert.equal(await readFile(mirroredClient, "utf8"), "private edit\n");
});

test("preserves unknown private files and reports them as extras", async t => {
  const item = await fixture(t);
  await syncBrowse(optionsFor(item, "write"));
  const privateFile = path.join(item.browseRoot, "packages", "brizo", "private", "note.txt");
  await mkdir(path.dirname(privateFile), { recursive: true });
  await writeFile(privateFile, "keep me\n");
  await writeFile(path.join(item.sourceRoot, "README.md"), "# Brizo public v2\n");

  const written = await syncBrowse(optionsFor(item, "write"));
  assert.deepEqual(written.preserved, ["private/note.txt"]);
  assert.equal(await readFile(privateFile, "utf8"), "keep me\n");
  assert.equal(
    await readFile(path.join(item.browseRoot, "packages", "brizo", "README.md"), "utf8"),
    "# Brizo public v2\n",
  );
  await assert.rejects(
    syncBrowse(optionsFor(item, "check")),
    error => error.code === "MIRROR_OUT_OF_SYNC"
      && error.details.extra.includes("private/note.txt"),
  );
});

test("deletes only stale files recorded by the previous manifest", async t => {
  const item = await fixture(t);
  await writeFixtureFile(item.sourceRoot, "lib/old.mjs", "old public file\n");
  const firstTracked = [...item.trackedFiles, "lib/old.mjs"];
  await syncBrowse(optionsFor(item, "write", firstTracked));

  const mirror = path.join(item.browseRoot, "packages", "brizo");
  const unknown = path.join(mirror, "lib", "private-helper.mjs");
  await writeFile(unknown, "private helper\n");
  await unlink(path.join(item.sourceRoot, "lib", "old.mjs"));
  const written = await syncBrowse(optionsFor(item, "write"));

  await assert.rejects(readFile(path.join(mirror, "lib", "old.mjs")), error => error.code === "ENOENT");
  assert.equal(await readFile(unknown, "utf8"), "private helper\n");
  assert.deepEqual(written.preserved, ["lib/private-helper.mjs"]);
});

test("rejects a target that is not the private Brizo product", async t => {
  const item = await fixture(t, { privateTarget: false });
  await assert.rejects(
    syncBrowse(optionsFor(item, "write")),
    error => error.code === "BROWSE_TARGET_INVALID",
  );
  await assert.rejects(
    Promise.resolve().then(() => parseArguments(["--write", "--browse", "relative/path"])),
    error => error.code === "BROWSE_PATH_INVALID",
  );
});

test("rejects tracked paths that could escape the public source", async t => {
  const item = await fixture(t);
  await assert.rejects(
    createSourceSnapshot({
      sourceRoot: item.sourceRoot,
      sourceUrl: SOURCE_URL,
      trackedFiles: ["package.json", "../outside.txt"],
    }),
    error => error.code === "PATH_INVALID",
  );
  await assert.rejects(
    createSourceSnapshot({
      sourceRoot: item.sourceRoot,
      sourceUrl: SOURCE_URL,
      trackedFiles: ["package.json", "src/private-browser.mjs"],
    }),
    error => error.code === "PUBLIC_PATH_NOT_ALLOWED",
  );
});
