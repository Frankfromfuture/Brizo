import os from "node:os";
import path from "node:path";
import { constants as fsConstants } from "node:fs";
import {
  access, chmod, cp, lstat, mkdir, readFile, readlink, rm, writeFile,
} from "node:fs/promises";
import { HARNESS_ADAPTERS, selectHarnessAdapters } from "./platforms.mjs";
import { BRIZO_PROTOCOL_VERSION } from "./protocol.mjs";
import { BRIZO_PACKAGE_VERSION } from "./version.mjs";
import { createSkillArchive } from "./zip.mjs";

export const MANAGED_MARKER = "installed-by-brizo-npm";
const LEGACY_MARKER = "installed-by-brizo-agent";
const PACKAGE_ROOT = path.resolve(import.meta.dirname, "..");
const MANAGED_SIGNATURE = `${MANAGED_MARKER} version=${BRIZO_PACKAGE_VERSION} protocol=${BRIZO_PROTOCOL_VERSION}`;

const markerContents = () => `${JSON.stringify({
  managedBy: MANAGED_MARKER,
  packageVersion: BRIZO_PACKAGE_VERSION,
  protocolVersion: BRIZO_PROTOCOL_VERSION,
})}\n`;

const statOrNull = async target => {
  try {
    return await lstat(target);
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
};

const fileExists = async target => {
  try {
    await access(target, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
};

async function resolvesTo(linkPath, targetPath) {
  try {
    const value = await readlink(linkPath);
    return path.resolve(path.dirname(linkPath), value) === targetPath;
  } catch {
    return false;
  }
}

async function managedFileStatus(filePath) {
  try {
    const contents = await readFile(filePath, "utf8");
    const lines = contents.split(/\r?\n/u).map(line => line.trim());
    if (lines.includes(`# ${MANAGED_SIGNATURE}`) || lines.includes(`<!-- ${MANAGED_SIGNATURE} -->`)) {
      return "installed";
    }
    if (
      lines.includes(`# ${MANAGED_MARKER}`)
      || lines.includes(`<!-- ${MANAGED_MARKER} -->`)
      || lines.includes(`<!-- ${LEGACY_MARKER} -->`)
    ) return "outdated";
    return null;
  } catch {
    return null;
  }
}

async function managedMarkerStatus(markerPath) {
  try {
    const marker = await readFile(markerPath, "utf8");
    if (marker === "Brizo npm integration\n" || marker === "Brizo agent skill\n") return "outdated";
    const parsed = JSON.parse(marker);
    if (parsed?.managedBy !== MANAGED_MARKER) return null;
    return parsed.packageVersion === BRIZO_PACKAGE_VERSION
      && parsed.protocolVersion === BRIZO_PROTOCOL_VERSION
      ? "installed"
      : "outdated";
  } catch {
    return null;
  }
}

const isManagedFile = async filePath => Boolean(await managedFileStatus(filePath));
const isManagedMarker = async markerPath => Boolean(await managedMarkerStatus(markerPath));

async function isManagedSkill(skillPath, bundlePath) {
  return await resolvesTo(skillPath, bundlePath)
    || await isManagedMarker(path.join(skillPath, ".brizo-managed"));
}

const archiveMarker = archivePath => `${archivePath}.brizo-managed`;

function integrationPaths(homeDirectory) {
  return {
    bundle: path.join(homeDirectory, ".local", "share", "brizo", "skills", "brizo"),
    state: path.join(homeDirectory, ".brizo"),
    workBuddyArchive: path.join(homeDirectory, ".local", "share", "brizo", "imports", "brizo-workbuddy.zip"),
  };
}

function absoluteEntry(homeDirectory, entry) {
  return { ...entry, absolutePath: path.join(homeDirectory, ...entry.path) };
}

function renderCommand(template, bundle) {
  const skillPath = path.join(bundle, "SKILL.md");
  const instruction = `读取并严格遵守 ${skillPath}，使用其中的本机 CLI 操作 Brizo 独立沙箱。`;
  if (template === "gemini") {
    const prompt = `${instruction}\n处理这次 /brizo 命令中的用户任务：{{args}}`;
    return `# ${MANAGED_SIGNATURE}\ndescription = "使用 Brizo 独立沙箱执行网页任务"\nprompt = ${JSON.stringify(prompt)}\n`;
  }
  const argumentsSection = template === "markdown-arguments"
    ? "\n\n用户任务：\n\n$ARGUMENTS"
    : "\n\n处理用户随本次 /brizo 命令提供的任务；若宿主未单独传递参数，就询问用户要 Brizo 完成什么。";
  return `---\ndescription: 使用 Brizo 独立沙箱执行网页任务\nargument-hint: 网页任务\n---\n<!-- ${MANAGED_SIGNATURE} -->\n\n${instruction}${argumentsSection}\n`;
}

export async function resolveDesktopExecutable(appPath, options = {}) {
  const platform = options.platform || process.platform;
  const homeDirectory = options.homeDirectory || os.homedir();
  const env = options.env || process.env;
  const explicit = String(appPath || env.BRIZO_APP_PATH || "").trim();

  const candidates = explicit
    ? [path.resolve(explicit)]
    : platform === "darwin"
      ? [
          "/Applications/Brizo.app",
          path.join(homeDirectory, "Applications", "Brizo.app"),
        ]
      : platform === "win32"
        ? [
            env.LOCALAPPDATA && path.join(env.LOCALAPPDATA, "Programs", "Brizo", "Brizo.exe"),
            env.ProgramFiles && path.join(env.ProgramFiles, "Brizo", "Brizo.exe"),
          ].filter(Boolean)
        : ["/opt/Brizo/brizo", "/usr/local/bin/brizo-browser", "/usr/bin/brizo-browser"];

  for (const candidate of candidates) {
    const executable = platform === "darwin" && candidate.endsWith(".app")
      ? path.join(candidate, "Contents", "MacOS", "Brizo")
      : candidate;
    if (await fileExists(executable)) return executable;
  }

  if (explicit) {
    throw Object.assign(new Error(`找不到 Brizo 桌面程序：${explicit}`), { code: "APP_NOT_FOUND" });
  }
  return null;
}

async function prepareBundle(paths, packageRoot) {
  const currentBundle = await statOrNull(paths.bundle);
  if (currentBundle && !await isManagedMarker(path.join(paths.bundle, ".brizo-managed"))) {
    throw Object.assign(
      new Error(`保留已有目录，未安装：${paths.bundle}`),
      { code: "SKILL_CONFLICT" },
    );
  }
  if (!await fileExists(path.join(packageRoot, "skill", "SKILL.md"))) {
    throw Object.assign(new Error("npm 包缺少 skill 文件，请重新安装 brizo。"), { code: "PACKAGE_INVALID" });
  }

  if (currentBundle) await rm(paths.bundle, { recursive: true });
  await mkdir(paths.bundle, { recursive: true, mode: 0o700 });
  await cp(path.join(packageRoot, "skill", "SKILL.md"), path.join(paths.bundle, "SKILL.md"));
  const agentsSource = path.join(packageRoot, "skill", "agents");
  if (await fileExists(agentsSource)) {
    await cp(agentsSource, path.join(paths.bundle, "agents"), { recursive: true });
  }
  await cp(path.join(packageRoot, "lib"), path.join(paths.bundle, "lib"), { recursive: true });
  await mkdir(path.join(paths.bundle, "scripts"), { recursive: true });
  await cp(path.join(packageRoot, "bin", "brizo.mjs"), path.join(paths.bundle, "scripts", "brizo.mjs"));
  await chmod(path.join(paths.bundle, "scripts", "brizo.mjs"), 0o755);
  await writeFile(path.join(paths.bundle, ".brizo-managed"), markerContents());
}

async function installEntry(entry, paths, homeDirectory) {
  const target = absoluteEntry(homeDirectory, entry).absolutePath;
  if (entry.type === "skill") {
    const current = await statOrNull(target);
    if (current && !await isManagedSkill(target, paths.bundle)) {
      return { path: target, type: entry.type, status: "conflict" };
    }
    await mkdir(path.dirname(target), { recursive: true });
    if (current) await rm(target, { recursive: true });
    await cp(paths.bundle, target, { recursive: true });
    return { path: target, type: entry.type, status: "installed" };
  }
  if (entry.type === "command") {
    const current = await statOrNull(target);
    if (current && !await isManagedFile(target)) {
      return { path: target, type: entry.type, status: "conflict" };
    }
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, renderCommand(entry.template, paths.bundle));
    return { path: target, type: entry.type, status: "installed" };
  }
  const current = await statOrNull(target);
  if (current && !await isManagedMarker(archiveMarker(target))) {
    return { path: target, type: entry.type, status: "conflict" };
  }
  await createSkillArchive(paths.bundle, target);
  await writeFile(archiveMarker(target), markerContents(), { mode: 0o600 });
  return { path: target, type: entry.type, status: "installed" };
}

async function removeObsoleteEntries(homeDirectory, paths) {
  const obsoleteSkill = path.join(homeDirectory, ".workbuddy", "skills", "brizo");
  if (await resolvesTo(obsoleteSkill, paths.bundle)) await rm(obsoleteSkill);
  const obsoleteCommand = path.join(homeDirectory, ".codebuddy", "commands", "brizo.md");
  if (await isManagedFile(obsoleteCommand)) await rm(obsoleteCommand);
}

export async function installIntegration(options = {}) {
  const homeDirectory = options.homeDirectory || os.homedir();
  const packageRoot = options.packageRoot || PACKAGE_ROOT;
  const paths = integrationPaths(homeDirectory);
  const adapters = selectHarnessAdapters(options.targets);
  await prepareBundle(paths, packageRoot);

  const results = [];
  for (const adapter of adapters) {
    const entries = [];
    for (const entry of adapter.entries) entries.push(await installEntry(entry, paths, homeDirectory));
    results.push({
      id: adapter.id,
      name: adapter.name,
      invocation: adapter.invocation,
      status: entries.every(item => item.status === "installed") ? "installed" : "partial",
      entries,
    });
  }
  await removeObsoleteEntries(homeDirectory, paths);

  await mkdir(paths.state, { recursive: true, mode: 0o700 });
  await chmod(paths.state, 0o700);
  let executable = null;
  const launchPath = path.join(paths.state, "launch.json");
  const currentLaunch = await statOrNull(launchPath);
  if (options.appPath || !currentLaunch) {
    executable = await resolveDesktopExecutable(options.appPath, { homeDirectory, env: options.env });
    if (executable) {
      await writeFile(
        launchPath,
        JSON.stringify({ executable, args: ["--agent-bridge-start"], managedBy: "brizo-npm" }, null, 2),
        { mode: 0o600 },
      );
      await chmod(launchPath, 0o600);
    }
  }

  return {
    bundle: paths.bundle,
    adapters: results,
    installed: results.filter(item => item.status === "installed"),
    skipped: results.flatMap(item => item.entries
      .filter(entry => entry.status === "conflict")
      .map(entry => ({ platform: item.name, path: entry.path }))),
    executable,
    launchConfigured: Boolean(executable || currentLaunch),
    workBuddyArchive: paths.workBuddyArchive,
  };
}

async function removeManagedEntry(entry, paths, homeDirectory) {
  const target = absoluteEntry(homeDirectory, entry).absolutePath;
  if (entry.type === "skill") {
    if (await isManagedSkill(target, paths.bundle)) await rm(target, { recursive: true });
    return;
  }
  if (entry.type === "command") {
    if (await isManagedFile(target)) await rm(target);
    return;
  }
  if (target === paths.workBuddyArchive && await isManagedMarker(archiveMarker(target))) {
    await rm(target, { force: true });
    await rm(archiveMarker(target), { force: true });
  }
}

export async function uninstallIntegration(options = {}) {
  const homeDirectory = options.homeDirectory || os.homedir();
  const paths = integrationPaths(homeDirectory);
  for (const adapter of HARNESS_ADAPTERS) {
    for (const entry of adapter.entries) await removeManagedEntry(entry, paths, homeDirectory);
  }
  await removeObsoleteEntries(homeDirectory, paths);
  if (await isManagedMarker(path.join(paths.bundle, ".brizo-managed"))) {
    await rm(paths.bundle, { recursive: true });
  }

  const launchPath = path.join(paths.state, "launch.json");
  try {
    const launch = JSON.parse(await readFile(launchPath, "utf8"));
    if (launch.managedBy === "brizo-npm") await rm(launchPath);
  } catch (error) {
    if (error.code !== "ENOENT" && error.name !== "SyntaxError") throw error;
  }
  return { removed: true };
}

async function entryStatus(entry, paths, homeDirectory) {
  const target = absoluteEntry(homeDirectory, entry).absolutePath;
  if (entry.type === "skill") {
    if (await resolvesTo(target, paths.bundle)) return "installed";
    const markerStatus = await managedMarkerStatus(path.join(target, ".brizo-managed"));
    if (markerStatus) return markerStatus;
    return await statOrNull(target) ? "conflict" : "missing";
  }
  if (entry.type === "command") {
    const fileStatus = await managedFileStatus(target);
    if (fileStatus) return fileStatus;
    return await statOrNull(target) ? "conflict" : "missing";
  }
  const archiveStatus = await managedMarkerStatus(archiveMarker(target));
  if (await fileExists(target) && archiveStatus) return archiveStatus;
  return await statOrNull(target) ? "conflict" : "missing";
}

export async function integrationStatus(options = {}) {
  const homeDirectory = options.homeDirectory || os.homedir();
  const paths = integrationPaths(homeDirectory);
  let launch = null;
  try {
    launch = JSON.parse(await readFile(path.join(paths.state, "launch.json"), "utf8"));
  } catch {
    // Missing or malformed launch configuration is reported as absent.
  }

  const adapters = [];
  for (const adapter of HARNESS_ADAPTERS) {
    const states = [];
    for (const entry of adapter.entries) states.push(await entryStatus(entry, paths, homeDirectory));
    const status = states.every(value => value === "installed")
      ? "installed"
      : states.some(value => value === "outdated") ? "outdated"
      : states.some(value => value === "installed") ? "partial"
        : states.some(value => value === "conflict") ? "conflict" : "missing";
    adapters.push({ id: adapter.id, name: adapter.name, invocation: adapter.invocation, status });
  }
  return {
    skillInstalled: await managedMarkerStatus(path.join(paths.bundle, ".brizo-managed")) === "installed",
    skillStatus: await managedMarkerStatus(path.join(paths.bundle, ".brizo-managed")) || "missing",
    slashCommandInstalled: adapters.some(item => item.status === "installed" && item.invocation.includes("/brizo")),
    adapterCount: adapters.filter(item => item.status === "installed").length,
    outdatedCount: adapters.filter(item => item.status === "outdated").length,
    adapters,
    launchConfigured: Boolean(launch?.executable),
    executable: launch?.executable || null,
    workBuddyArchive: paths.workBuddyArchive,
  };
}

export function universalPrompt(task = "", options = {}) {
  const homeDirectory = options.homeDirectory || os.homedir();
  const skillPath = path.join(integrationPaths(homeDirectory).bundle, "SKILL.md");
  const request = String(task).trim();
  return `读取并遵守 ${skillPath}，使用 Brizo 独立沙箱完成网页任务${request ? `：${request}` : "。先询问我要完成什么。"}`;
}
