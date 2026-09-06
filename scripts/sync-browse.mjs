#!/usr/bin/env node

import { createHash, randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import {
  chmod,
  cp,
  lstat,
  mkdir,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  rmdir,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const SYNC_SCHEMA_VERSION = 1;
export const DEFAULT_PROTOCOL_VERSION = 1;
export const MIRROR_RELATIVE_PATH = path.join("packages", "brizo");
export const MANIFEST_NAME = ".brizo-sync.json";

export const PUBLIC_TRACKED_ALLOWLIST = Object.freeze({
  files: Object.freeze([
    ".gitignore",
    "ARCHITECTURE.md",
    "CHANGELOG.md",
    "CONTRIBUTING.md",
    "LICENSE",
    "README.md",
    "README.en.md",
    "SECURITY.md",
    "npm-shrinkwrap.json",
    "package-lock.json",
    "package.json",
  ]),
  directories: Object.freeze([
    ".github",
    "bin",
    "contracts",
    "core",
    "docs",
    "lib",
    "runtime",
    "scripts",
    "skill",
    "test",
  ]),
});

const SOURCE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const HEX_64 = /^[a-f0-9]{64}$/u;

function syncError(code, message, details) {
  return Object.assign(new Error(message), { code, ...(details ? { details } : {}) });
}

async function entryOrNull(target) {
  try {
    return await lstat(target);
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

function safeRelativePath(value) {
  if (typeof value !== "string" || !value || value.includes("\0") || value.includes("\\")) {
    throw syncError("PATH_INVALID", `不安全的公开文件路径：${JSON.stringify(value)}`);
  }
  const normalized = path.posix.normalize(value);
  if (
    normalized !== value
    || normalized === "."
    || normalized.startsWith("/")
    || normalized === ".."
    || normalized.startsWith("../")
    || normalized.split("/").includes("..")
  ) {
    throw syncError("PATH_INVALID", `不安全的公开文件路径：${value}`);
  }
  return normalized;
}

export function isAllowedPublicPath(value) {
  const relativePath = safeRelativePath(value);
  if (PUBLIC_TRACKED_ALLOWLIST.files.includes(relativePath)) return true;
  return PUBLIC_TRACKED_ALLOWLIST.directories.some(directory => relativePath.startsWith(`${directory}/`));
}

function inside(root, relativePath) {
  const target = path.resolve(root, ...safeRelativePath(relativePath).split("/"));
  const relative = path.relative(path.resolve(root), target);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw syncError("PATH_INVALID", `路径超出同步目录：${relativePath}`);
  }
  return target;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function overallDigest(files) {
  return sha256(files.map(file => `${file.path}\0${file.sha256}\n`).join(""));
}

function normalizeSourceUrl(value) {
  const input = String(value || "").trim();
  if (!input) return "";
  const ssh = input.match(/^git@github\.com:([^/]+\/[\w.-]+?)(?:\.git)?$/u);
  if (ssh) return `https://github.com/${ssh[1].replace(/\.git$/u, "")}`;
  return input.replace(/\/$/u, "").replace(/\.git$/u, "");
}

async function execGit(args, cwd) {
  return new Promise((resolve, reject) => {
    execFile("git", args, { cwd, encoding: "utf8", maxBuffer: 8 * 1024 * 1024 }, (error, stdout) => {
      if (error) reject(error);
      else resolve(stdout);
    });
  });
}

export async function gitTrackedFiles(sourceRoot) {
  let output;
  try {
    output = await execGit(["ls-files", "-z"], sourceRoot);
  } catch (error) {
    throw syncError("SOURCE_GIT_INVALID", `无法读取公开仓库 tracked 文件：${error.message}`);
  }
  return output.split("\0").filter(Boolean);
}

async function sourceUrlFor(sourceRoot, supplied) {
  if (supplied) return normalizeSourceUrl(supplied);
  try {
    return normalizeSourceUrl(await execGit(["config", "--get", "remote.origin.url"], sourceRoot));
  } catch {
    throw syncError("SOURCE_URL_MISSING", "公开仓库缺少 origin URL。");
  }
}

async function readJson(target, code) {
  try {
    return JSON.parse(await readFile(target, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") throw syncError(code, `缺少文件：${target}`);
    if (error instanceof SyntaxError) throw syncError(code, `JSON 无效：${target}`);
    throw error;
  }
}

async function assertRegularSourceFile(sourceRoot, relativePath) {
  const target = inside(sourceRoot, relativePath);
  const info = await entryOrNull(target);
  if (!info?.isFile() || info.isSymbolicLink()) {
    throw syncError("SOURCE_FILE_INVALID", `公开 tracked 路径必须是普通文件：${relativePath}`);
  }
  const resolvedRoot = await realpath(sourceRoot);
  const resolvedTarget = await realpath(target);
  const relative = path.relative(resolvedRoot, resolvedTarget);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw syncError("PATH_INVALID", `公开文件解析到了仓库之外：${relativePath}`);
  }
  return { target, info };
}

export async function createSourceSnapshot(options = {}) {
  const sourceRoot = path.resolve(options.sourceRoot || SOURCE_ROOT);
  const packageJson = await readJson(path.join(sourceRoot, "package.json"), "SOURCE_PACKAGE_INVALID");
  if (packageJson.name !== "brizo" || typeof packageJson.version !== "string" || !packageJson.version) {
    throw syncError("SOURCE_PACKAGE_INVALID", "公开源必须是带有效版本号的 brizo 包。");
  }
  const protocolVersion = options.protocolVersion
    ?? packageJson.brizoProtocolVersion
    ?? DEFAULT_PROTOCOL_VERSION;
  if (!Number.isInteger(protocolVersion) || protocolVersion < 1) {
    throw syncError("SOURCE_PACKAGE_INVALID", "Brizo protocolVersion 必须是正整数。");
  }

  const rawTrackedFiles = options.trackedFiles || await gitTrackedFiles(sourceRoot);
  const trackedFiles = [...new Set(rawTrackedFiles.map(safeRelativePath))].sort((left, right) => left.localeCompare(right, "en"));
  const rejected = trackedFiles.filter(file => !isAllowedPublicPath(file));
  if (rejected.length) {
    throw syncError(
      "PUBLIC_PATH_NOT_ALLOWED",
      `公开仓库含有不在发布白名单中的 tracked 文件：${rejected.join("、")}`,
      { rejected },
    );
  }
  if (!trackedFiles.includes("package.json")) {
    throw syncError("SOURCE_PACKAGE_INVALID", "公开 tracked 文件必须包含 package.json。");
  }

  const files = [];
  for (const relativePath of trackedFiles) {
    const { target, info } = await assertRegularSourceFile(sourceRoot, relativePath);
    const contents = await readFile(target);
    files.push({
      path: relativePath,
      sha256: sha256(contents),
      mode: info.mode & 0o111 ? 0o755 : 0o644,
      contents,
    });
  }
  const manifestFiles = files.map(({ path: filePath, sha256: digest }) => ({ path: filePath, sha256: digest }));
  const source = await sourceUrlFor(sourceRoot, options.sourceUrl);
  if (!source) throw syncError("SOURCE_URL_MISSING", "公开仓库 origin URL 为空。");

  return {
    sourceRoot,
    files,
    manifest: {
      schemaVersion: SYNC_SCHEMA_VERSION,
      source,
      packageVersion: packageJson.version,
      protocolVersion,
      files: manifestFiles,
      overallDigest: overallDigest(manifestFiles),
    },
  };
}

export async function validateBrowseTarget(browseRoot) {
  if (!path.isAbsolute(String(browseRoot || ""))) {
    throw syncError("BROWSE_PATH_INVALID", "--browse 必须使用 Brizo-Browse 的绝对路径。");
  }
  const root = path.resolve(browseRoot);
  const info = await entryOrNull(root);
  if (!info?.isDirectory() || info.isSymbolicLink()) {
    throw syncError("BROWSE_TARGET_INVALID", `Brizo-Browse 目录无效：${root}`);
  }
  const packageJson = await readJson(path.join(root, "package.json"), "BROWSE_TARGET_INVALID");
  if (packageJson.private !== true || packageJson.productName !== "Brizo") {
    throw syncError(
      "BROWSE_TARGET_INVALID",
      "目标 package.json 必须同时包含 private: true 和 productName: \"Brizo\"。",
    );
  }
  const packagesRoot = path.join(root, "packages");
  const packagesInfo = await entryOrNull(packagesRoot);
  if (packagesInfo && (!packagesInfo.isDirectory() || packagesInfo.isSymbolicLink())) {
    throw syncError("MIRROR_PATH_INVALID", `packages 目录无效：${packagesRoot}`);
  }
  const mirrorRoot = path.join(root, MIRROR_RELATIVE_PATH);
  const mirrorInfo = await entryOrNull(mirrorRoot);
  if (mirrorInfo && (!mirrorInfo.isDirectory() || mirrorInfo.isSymbolicLink())) {
    throw syncError("MIRROR_PATH_INVALID", `镜像目录无效：${mirrorRoot}`);
  }
  return {
    root,
    mirrorRoot,
    manifestPath: path.join(root, MANIFEST_NAME),
  };
}

function validateManifest(value) {
  if (
    !value
    || value.schemaVersion !== SYNC_SCHEMA_VERSION
    || typeof value.source !== "string"
    || typeof value.packageVersion !== "string"
    || !Number.isInteger(value.protocolVersion)
    || !Array.isArray(value.files)
    || !HEX_64.test(String(value.overallDigest || ""))
  ) {
    throw syncError("MANIFEST_INVALID", "现有 .brizo-sync.json 无效。");
  }
  const files = value.files.map(file => {
    const relativePath = safeRelativePath(file?.path);
    if (!HEX_64.test(String(file?.sha256 || ""))) {
      throw syncError("MANIFEST_INVALID", `同步清单中的 SHA-256 无效：${relativePath}`);
    }
    return { path: relativePath, sha256: file.sha256 };
  });
  const sorted = [...files].sort((left, right) => left.path.localeCompare(right.path, "en"));
  if (
    new Set(files.map(file => file.path)).size !== files.length
    || files.some((file, index) => file.path !== sorted[index].path)
    || overallDigest(files) !== value.overallDigest
  ) {
    throw syncError("MANIFEST_INVALID", "同步清单的文件顺序、重复项或 overallDigest 无效。");
  }
  return { ...value, files };
}

async function readManifestOrNull(manifestPath) {
  const info = await entryOrNull(manifestPath);
  if (!info) return null;
  if (!info.isFile() || info.isSymbolicLink()) {
    throw syncError("MANIFEST_INVALID", ".brizo-sync.json 必须是普通文件。");
  }
  return validateManifest(await readJson(manifestPath, "MANIFEST_INVALID"));
}

async function assertSafeExistingPath(root, relativePath, allowMissing = true) {
  const segments = safeRelativePath(relativePath).split("/");
  let current = root;
  for (let index = 0; index < segments.length; index += 1) {
    current = path.join(current, segments[index]);
    const info = await entryOrNull(current);
    if (!info) {
      if (allowMissing) return null;
      throw syncError("MIRROR_MISSING", `镜像缺少文件：${relativePath}`);
    }
    if (info.isSymbolicLink()) {
      throw syncError("MIRROR_PATH_INVALID", `镜像路径包含符号链接：${relativePath}`);
    }
    if (index < segments.length - 1 && !info.isDirectory()) {
      throw syncError("MIRROR_PATH_INVALID", `镜像父路径不是目录：${relativePath}`);
    }
    if (index === segments.length - 1) return info;
  }
  return null;
}

async function hashMirrorFile(mirrorRoot, relativePath) {
  const info = await assertSafeExistingPath(mirrorRoot, relativePath);
  if (!info) return { status: "missing" };
  if (!info.isFile()) return { status: "drift", actual: "not-a-regular-file" };
  return { status: "present", actual: sha256(await readFile(inside(mirrorRoot, relativePath))) };
}

async function listMirrorFiles(root, prefix = "") {
  const directory = prefix ? inside(root, prefix) : root;
  const info = await entryOrNull(directory);
  if (!info) return [];
  if (!info.isDirectory() || info.isSymbolicLink()) {
    throw syncError("MIRROR_PATH_INVALID", `镜像根目录无效：${root}`);
  }
  const output = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
    safeRelativePath(relativePath);
    if (entry.isDirectory()) output.push(...await listMirrorFiles(root, relativePath));
    else output.push(relativePath);
  }
  return output.sort((left, right) => left.localeCompare(right, "en"));
}

function sameManifest(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export async function inspectBrowseMirror(snapshot, target) {
  const storedManifest = await readManifestOrNull(target.manifestPath);
  const expectedByPath = new Map(snapshot.manifest.files.map(file => [file.path, file.sha256]));
  const missing = [];
  const drift = [];
  for (const [relativePath, expected] of expectedByPath) {
    const current = await hashMirrorFile(target.mirrorRoot, relativePath);
    if (current.status === "missing") missing.push(relativePath);
    else if (current.actual !== expected) drift.push({ path: relativePath, expected, actual: current.actual });
  }
  const mirrorFiles = await listMirrorFiles(target.mirrorRoot);
  const extra = mirrorFiles.filter(file => !expectedByPath.has(file));
  const manifestMatches = Boolean(storedManifest && sameManifest(storedManifest, snapshot.manifest));
  return {
    ok: manifestMatches && missing.length === 0 && drift.length === 0 && extra.length === 0,
    manifestMatches,
    missing,
    drift,
    extra,
    storedManifest,
  };
}

async function assertManagedFilesUntouched(mirrorRoot, manifest) {
  const problems = [];
  for (const file of manifest.files) {
    const current = await hashMirrorFile(mirrorRoot, file.path);
    if (current.status === "missing") problems.push({ path: file.path, status: "missing" });
    else if (current.actual !== file.sha256) problems.push({ path: file.path, status: "drift" });
  }
  if (problems.length) {
    throw syncError(
      "MANAGED_FILE_DRIFT",
      `私有镜像含有未同步的手工修改：${problems.map(item => item.path).join("、")}`,
      { problems },
    );
  }
}

async function assertNoUnknownCollisions(mirrorRoot, oldManifest, desiredFiles) {
  const managed = new Set(oldManifest?.files.map(file => file.path) || []);
  const collisions = [];
  for (const file of desiredFiles) {
    if (managed.has(file.path)) continue;
    const info = await assertSafeExistingPath(mirrorRoot, file.path);
    if (info) collisions.push(file.path);
  }
  if (collisions.length) {
    throw syncError(
      "PRIVATE_FILE_COLLISION",
      `公开文件会覆盖未知私有文件，已停止同步：${collisions.join("、")}`,
      { collisions },
    );
  }
}

async function copySnapshotFile(file, destinationRoot) {
  const destination = inside(destinationRoot, file.path);
  await mkdir(path.dirname(destination), { recursive: true });
  const existing = await entryOrNull(destination);
  if (existing) await rm(destination, { recursive: existing.isDirectory(), force: true });
  await writeFile(destination, file.contents, { mode: file.mode });
  await chmod(destination, file.mode);
}

async function removeEmptyParents(start, stop) {
  let current = path.dirname(start);
  const boundary = path.resolve(stop);
  while (current !== boundary && current.startsWith(`${boundary}${path.sep}`)) {
    try {
      await rmdir(current);
    } catch (error) {
      if (!["ENOTEMPTY", "EEXIST", "ENOENT"].includes(error.code)) throw error;
      break;
    }
    current = path.dirname(current);
  }
}

async function writeManifestAtomically(manifestPath, manifest) {
  const temporary = `${manifestPath}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o644 });
    await rename(temporary, manifestPath);
  } finally {
    await rm(temporary, { force: true });
  }
}

export async function writeBrowseMirror(snapshot, target) {
  const oldManifest = await readManifestOrNull(target.manifestPath);
  const mirrorInfo = await entryOrNull(target.mirrorRoot);
  if (mirrorInfo && (!mirrorInfo.isDirectory() || mirrorInfo.isSymbolicLink())) {
    throw syncError("MIRROR_PATH_INVALID", `镜像目录无效：${target.mirrorRoot}`);
  }
  if (oldManifest) await assertManagedFilesUntouched(target.mirrorRoot, oldManifest);
  await assertNoUnknownCollisions(target.mirrorRoot, oldManifest, snapshot.files);

  const packagesRoot = path.dirname(target.mirrorRoot);
  await mkdir(packagesRoot, { recursive: true });
  const packagesInfo = await entryOrNull(packagesRoot);
  if (!packagesInfo?.isDirectory() || packagesInfo.isSymbolicLink()) {
    throw syncError("MIRROR_PATH_INVALID", `packages 目录无效：${packagesRoot}`);
  }

  const transaction = randomUUID();
  const stage = path.join(packagesRoot, `.brizo-stage-${transaction}`);
  const backup = path.join(packagesRoot, `.brizo-backup-${transaction}`);
  let oldMoved = false;
  let newMoved = false;
  let committed = false;
  try {
    if (mirrorInfo) await cp(target.mirrorRoot, stage, { recursive: true, dereference: false, preserveTimestamps: true });
    else await mkdir(stage, { recursive: true });

    const desiredPaths = new Set(snapshot.files.map(file => file.path));
    const stale = (oldManifest?.files || []).filter(file => !desiredPaths.has(file.path));
    for (const file of stale) {
      const stagedPath = inside(stage, file.path);
      await rm(stagedPath, { force: true });
      await removeEmptyParents(stagedPath, stage);
    }
    for (const file of snapshot.files) await copySnapshotFile(file, stage);

    if (mirrorInfo) {
      await rename(target.mirrorRoot, backup);
      oldMoved = true;
    }
    await rename(stage, target.mirrorRoot);
    newMoved = true;
    await writeManifestAtomically(target.manifestPath, snapshot.manifest);
    committed = true;
  } catch (error) {
    if (newMoved) {
      await rm(target.mirrorRoot, { recursive: true, force: true });
      newMoved = false;
    }
    if (oldMoved) {
      await rename(backup, target.mirrorRoot);
      oldMoved = false;
    }
    throw error;
  } finally {
    if (!newMoved) await rm(stage, { recursive: true, force: true });
    if (committed && oldMoved) await rm(backup, { recursive: true, force: true });
  }

  const mirrorFiles = await listMirrorFiles(target.mirrorRoot);
  const desired = new Set(snapshot.files.map(file => file.path));
  return {
    ok: true,
    mode: "write",
    mirror: target.mirrorRoot,
    manifest: target.manifestPath,
    fileCount: snapshot.files.length,
    overallDigest: snapshot.manifest.overallDigest,
    preserved: mirrorFiles.filter(file => !desired.has(file)),
  };
}

export async function syncBrowse(options = {}) {
  const mode = options.mode;
  if (!new Set(["write", "check"]).has(mode)) {
    throw syncError("ARGUMENT_INVALID", "必须选择 --write 或 --check。");
  }
  const target = await validateBrowseTarget(options.browseRoot);
  const snapshot = await createSourceSnapshot(options);
  if (mode === "write") return writeBrowseMirror(snapshot, target);

  const report = await inspectBrowseMirror(snapshot, target);
  if (!report.ok) {
    throw syncError("MIRROR_OUT_OF_SYNC", "Brizo-Browse 中的公开镜像未同步。", report);
  }
  return {
    ok: true,
    mode: "check",
    mirror: target.mirrorRoot,
    fileCount: snapshot.files.length,
    overallDigest: snapshot.manifest.overallDigest,
  };
}

export function parseArguments(argv) {
  let mode = "";
  let browseRoot = "";
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--write" || argument === "--check") {
      const nextMode = argument.slice(2);
      if (mode && mode !== nextMode) throw syncError("ARGUMENT_INVALID", "--write 与 --check 不能同时使用。");
      mode = nextMode;
      continue;
    }
    if (argument === "--browse" && argv[index + 1]) {
      browseRoot = argv[index + 1];
      index += 1;
      continue;
    }
    throw syncError("ARGUMENT_INVALID", `未知参数：${argument}`);
  }
  if (!mode || !browseRoot) {
    throw syncError("ARGUMENT_INVALID", "用法：node scripts/sync-browse.mjs --write|--check --browse <绝对路径>");
  }
  if (!path.isAbsolute(browseRoot)) {
    throw syncError("BROWSE_PATH_INVALID", "--browse 必须使用绝对路径。");
  }
  return { mode, browseRoot };
}

async function runCli() {
  try {
    const result = await syncBrowse(parseArguments(process.argv.slice(2)));
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${JSON.stringify({
      ok: false,
      error: { code: error.code || "SYNC_FAILED", message: error.message, details: error.details },
    }, null, 2)}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await runCli();
}
