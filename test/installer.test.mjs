import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { lstat, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { HARNESS_ADAPTERS, selectHarnessAdapters } from "../lib/platforms.mjs";
import { installIntegration, integrationStatus, uninstallIntegration } from "../lib/installer.mjs";
import { main } from "../lib/cli.mjs";
import { BRIZO_PACKAGE_VERSION } from "../lib/version.mjs";

const packageRoot = path.resolve(import.meta.dirname, "..");

async function exists(target) {
  try {
    await lstat(target);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}

test("installs native adapters and removes only managed files", async t => {
  const homeDirectory = await mkdtemp(path.join(os.tmpdir(), "brizo-install-"));
  t.after(() => rm(homeDirectory, { recursive: true, force: true }));

  const installed = await installIntegration({ homeDirectory, packageRoot, env: {} });
  assert.equal(installed.adapters.length, HARNESS_ADAPTERS.length);
  assert.equal(installed.skipped.length, 0);
  assert.match(await readFile(path.join(installed.bundle, "SKILL.md"), "utf8"), /# Brizo/);

  const nativeSkillPaths = [
    [".agents", "skills", "brizo"],
    [".codex", "skills", "brizo"],
    [".claude", "skills", "brizo"],
    [".cursor", "skills", "brizo"],
    [".trae-cn", "skills", "brizo"],
    [".traecli", "skills", "brizo"],
    [".codebuddy", "skills", "brizo"],
    [".lingma", "skills", "brizo"],
    [".qoder-cn", "skills", "brizo"],
    [".qwen", "skills", "brizo"],
    [".kimi", "skills", "brizo"],
    [".gemini", "skills", "brizo"],
    [".gemini", "config", "skills", "brizo"],
    [".gemini", "antigravity-cli", "skills", "brizo"],
    [".config", "opencode", "skills", "brizo"],
    [".codeium", "windsurf", "skills", "brizo"],
    [".copilot", "skills", "brizo"],
    [".kiro", "skills", "brizo"],
    [".junie", "skills", "brizo"],
    [".roo", "skills", "brizo"],
    [".cline", "skills", "brizo"],
  ];
  for (const segments of nativeSkillPaths) {
    const target = path.join(homeDirectory, ...segments);
    assert.equal((await lstat(target)).isDirectory(), true, target);
    assert.equal((await lstat(target)).isSymbolicLink(), false, target);
    assert.equal(await exists(path.join(target, ".brizo-managed")), true, target);
  }
  assert.equal(await exists(path.join(homeDirectory, ".trae", "skills", "brizo")), false);

  assert.match(
    await readFile(path.join(homeDirectory, ".trae-cn", "commands", "brizo.md"), "utf8"),
    /\$ARGUMENTS/,
  );
  const gemini = await readFile(path.join(homeDirectory, ".gemini", "commands", "brizo.toml"), "utf8");
  assert.match(gemini, /installed-by-brizo-npm/);
  assert.match(gemini, /\{\{args\}\}/);
  assert.match(
    await readFile(path.join(homeDirectory, ".config", "opencode", "commands", "brizo.md"), "utf8"),
    /\$ARGUMENTS/,
  );
  assert.doesNotMatch(
    await readFile(path.join(homeDirectory, ".codeium", "windsurf", "global_workflows", "brizo.md"), "utf8"),
    /\$ARGUMENTS/,
  );

  const archive = await readFile(installed.workBuddyArchive);
  assert.equal(archive.subarray(0, 2).toString(), "PK");
  assert.notEqual(archive.readUInt16LE(12), 0);
  assert.equal(archive.includes(Buffer.from("brizo/SKILL.md")), true);
  assert.equal(archive.includes(Buffer.from("brizo/scripts/brizo.mjs")), true);

  const status = await integrationStatus({ homeDirectory });
  assert.equal(status.skillInstalled, true);
  assert.equal(status.slashCommandInstalled, true);
  assert.equal(status.adapterCount, HARNESS_ADAPTERS.length);

  await uninstallIntegration({ homeDirectory });
  const removed = await integrationStatus({ homeDirectory });
  assert.equal(removed.skillInstalled, false);
  assert.equal(removed.adapterCount, 0);
  assert.equal(await exists(installed.workBuddyArchive), false);
});

test("keeps conflicting user files while installing other platforms", async t => {
  const homeDirectory = await mkdtemp(path.join(os.tmpdir(), "brizo-conflict-"));
  t.after(() => rm(homeDirectory, { recursive: true, force: true }));
  const cursorSkill = path.join(homeDirectory, ".cursor", "skills", "brizo");
  const geminiCommand = path.join(homeDirectory, ".gemini", "commands", "brizo.toml");
  const workBuddyArchive = path.join(homeDirectory, ".local", "share", "brizo", "imports", "brizo-workbuddy.zip");
  await mkdir(cursorSkill, { recursive: true });
  await writeFile(path.join(cursorSkill, "SKILL.md"), "user cursor skill\n");
  await mkdir(path.dirname(geminiCommand), { recursive: true });
  await writeFile(geminiCommand, "# user gemini command\n# mentions installed-by-brizo-npm in prose\n");
  await mkdir(path.dirname(workBuddyArchive), { recursive: true });
  await writeFile(workBuddyArchive, "user archive\n");

  const installed = await installIntegration({ homeDirectory, packageRoot, env: {} });
  assert.equal(installed.skipped.length, 3);
  assert.equal(await readFile(path.join(cursorSkill, "SKILL.md"), "utf8"), "user cursor skill\n");
  assert.match(await readFile(geminiCommand, "utf8"), /user gemini command/);
  assert.equal(await readFile(workBuddyArchive, "utf8"), "user archive\n");
  assert.equal(await exists(path.join(homeDirectory, ".claude", "skills", "brizo", "SKILL.md")), true);

  const status = await integrationStatus({ homeDirectory });
  assert.equal(status.adapters.find(item => item.id === "cursor").status, "conflict");
  assert.equal(status.adapters.find(item => item.id === "gemini").status, "partial");
  assert.equal(status.adapters.find(item => item.id === "workbuddy").status, "conflict");

  await uninstallIntegration({ homeDirectory });
  assert.equal(await readFile(path.join(cursorSkill, "SKILL.md"), "utf8"), "user cursor skill\n");
  assert.match(await readFile(geminiCommand, "utf8"), /user gemini command/);
  assert.equal(await readFile(workBuddyArchive, "utf8"), "user archive\n");
});

test("supports targeted installs and aliases", async t => {
  const homeDirectory = await mkdtemp(path.join(os.tmpdir(), "brizo-targets-"));
  t.after(() => rm(homeDirectory, { recursive: true, force: true }));
  const legacyBundle = path.join(homeDirectory, ".local", "share", "brizo", "skills", "brizo");
  await mkdir(legacyBundle, { recursive: true });
  await writeFile(path.join(legacyBundle, ".brizo-managed"), "Brizo agent skill\n");
  await writeFile(path.join(legacyBundle, "old.txt"), "legacy\n");

  const installed = await installIntegration({
    homeDirectory,
    packageRoot,
    env: {},
    targets: ["claude", "cursor"],
  });
  assert.deepEqual(installed.adapters.map(item => item.id), ["claude-code", "cursor"]);
  assert.equal(await exists(path.join(homeDirectory, ".claude", "skills", "brizo", "SKILL.md")), true);
  assert.equal(await exists(path.join(homeDirectory, ".cursor", "skills", "brizo", "SKILL.md")), true);
  assert.equal(await exists(path.join(homeDirectory, ".qwen", "skills", "brizo")), false);
  assert.equal(await exists(path.join(legacyBundle, "old.txt")), false);
  assert.deepEqual(
    JSON.parse(await readFile(path.join(legacyBundle, ".brizo-managed"), "utf8")),
    { managedBy: "installed-by-brizo-npm", packageVersion: BRIZO_PACKAGE_VERSION, protocolVersion: 1 },
  );
  assert.equal(selectHarnessAdapters(["ALL"]).length, HARNESS_ADAPTERS.length);
  assert.throws(() => selectHarnessAdapters(["unknown"]), error => error.code === "TARGET_INVALID");
});

test("CLI exposes platform discovery, targeted install, and universal prompts", async t => {
  const homeDirectory = await mkdtemp(path.join(os.tmpdir(), "brizo-cli-"));
  t.after(() => rm(homeDirectory, { recursive: true, force: true }));
  const output = { text: "", write(value) { this.text += value; } };
  const installOptions = { homeDirectory, packageRoot, env: {} };

  await main(["platforms"], { output, installOptions });
  assert.match(output.text, /claude-code\tClaude Code\t\/brizo/);
  assert.match(output.text, /qwen-code\tQwen Code\t\/brizo/);

  output.text = "";
  await main(["prompt", "打开百度"], { output, installOptions });
  assert.equal(output.text.includes(path.join(homeDirectory, ".local", "share", "brizo")), true);
  assert.match(output.text, /打开百度/);

  output.text = "";
  await main(["install", "--target", "claude,cursor"], { output, installOptions });
  assert.match(output.text, /Claude Code、Cursor/);
  assert.equal(await exists(path.join(homeDirectory, ".claude", "skills", "brizo", "SKILL.md")), true);
  assert.equal(await exists(path.join(homeDirectory, ".qwen", "skills", "brizo")), false);
});

test("CLI accepts inline and file JSON on every platform", async t => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "brizo-json-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const inputFile = path.join(directory, "request.json");
  await writeFile(inputFile, '{"snapshotId":"snap-1","action":"reload"}\n');
  const calls = [];
  const output = { text: "", write(value) { this.text += value; } };
  const executeBrowserCommand = async (method, sessionId, args) => {
    calls.push({ method, sessionId, args });
    return { accepted: true };
  };

  await main([
    "create",
    "--json",
    '{"goal":"读取标题","client":"PowerShell"}',
  ], { executeBrowserCommand, output });
  await main([
    "act",
    "12345678-1234-1234-1234-123456789abc",
    "--input",
    inputFile,
  ], { executeBrowserCommand, output });

  assert.deepEqual(calls, [
    {
      args: { client: "PowerShell", goal: "读取标题" },
      method: "create",
      sessionId: undefined,
    },
    {
      args: { action: "reload", snapshotId: "snap-1" },
      method: "act",
      sessionId: "12345678-1234-1234-1234-123456789abc",
    },
  ]);
  assert.equal(output.text.match(/"accepted":true/gu)?.length, 2);
});

test("doctor reports copied adapters from an older package as outdated", async t => {
  const homeDirectory = await mkdtemp(path.join(os.tmpdir(), "brizo-outdated-"));
  t.after(() => rm(homeDirectory, { recursive: true, force: true }));
  await installIntegration({
    homeDirectory,
    packageRoot,
    env: {},
    targets: ["claude-code"],
  });
  await writeFile(
    path.join(homeDirectory, ".claude", "skills", "brizo", ".brizo-managed"),
    "Brizo npm integration\n",
  );

  const status = await integrationStatus({ homeDirectory });
  assert.equal(status.adapters.find(item => item.id === "claude-code").status, "outdated");
  assert.equal(status.outdatedCount, 1);
});

test("upgrades versioned command adapters from an older package", async t => {
  const homeDirectory = await mkdtemp(path.join(os.tmpdir(), "brizo-command-upgrade-"));
  t.after(() => rm(homeDirectory, { recursive: true, force: true }));
  const commandPath = path.join(homeDirectory, ".gemini", "commands", "brizo.toml");
  await mkdir(path.dirname(commandPath), { recursive: true });
  await writeFile(
    commandPath,
    '# installed-by-brizo-npm version=0.3.0 protocol=1\ndescription = "old managed command"\n',
  );

  const installed = await installIntegration({
    homeDirectory,
    packageRoot,
    env: {},
    targets: ["gemini"],
  });

  assert.equal(installed.skipped.length, 0);
  const upgraded = await readFile(commandPath, "utf8");
  assert.match(upgraded, new RegExp(`version=${BRIZO_PACKAGE_VERSION}`));
  assert.doesNotMatch(upgraded, /old managed command/u);
});
