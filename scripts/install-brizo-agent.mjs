import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { chmod, cp, lstat, mkdir, readFile, readlink, symlink, writeFile } from "node:fs/promises";

const require = createRequire(import.meta.url);
const root = path.resolve(import.meta.dirname, "..");
const userDirectory = os.homedir();
const bundle = path.join(userDirectory, ".local/share/brizo/skills/brizo");
const destinations = [".agents", ".codex", ".codebuddy", ".workbuddy"].map(name => path.join(userDirectory, name, "skills/brizo"));
const command = path.join(userDirectory, ".codebuddy/commands/brizo.md");
const marker = "<!-- installed-by-brizo-agent -->";
const exists = async target => { try { return await lstat(target); } catch (error) { if (error.code !== "ENOENT") throw error; return null; } };

// Never replace an unrelated skill or user-written slash command.
if (await exists(bundle)) {
  if (!await exists(path.join(bundle, ".brizo-managed"))) throw new Error(`保留已有目录，未安装：${bundle}`);
}
for (const target of destinations) {
  const current = await exists(target);
  if (current && (!current.isSymbolicLink() || path.resolve(path.dirname(target), await readlink(target)) !== bundle)) throw new Error(`保留已有 skill，未安装：${target}`);
}
if (await exists(command)) {
  if (!(await readFile(command, "utf8")).includes(marker)) throw new Error(`保留已有命令，未安装：${command}`);
}

await mkdir(bundle, { recursive: true });
await cp(path.join(root, "skills/brizo"), bundle, { recursive: true });
await writeFile(path.join(bundle, ".brizo-managed"), "Brizo agent skill\n");
for (const target of destinations) {
  await mkdir(path.dirname(target), { recursive: true });
  if (!await exists(target)) await symlink(bundle, target, process.platform === "win32" ? "junction" : "dir");
}
await mkdir(path.dirname(command), { recursive: true });
await writeFile(command, `---\ndescription: 使用 Brizo 独立浏览器沙箱执行网页任务\nargument-hint: 网页任务\n---\n${marker}\n\n读取并遵守 ${path.join(bundle, "SKILL.md")}，使用其中的本机 CLI 操作 Brizo 独立沙箱。用户任务：\n\n$ARGUMENTS\n`);
const bridge = path.join(userDirectory, ".brizo");
await mkdir(bridge, { recursive: true, mode: 0o700 });
await chmod(bridge, 0o700);
const launch = path.join(bridge, "launch.json");
await writeFile(launch, JSON.stringify({ executable: require("electron"), entry: path.join(root, "electron/main.mjs") }), { mode: 0o600 });
await chmod(launch, 0o600);
console.log(`已安装 brizo skill：\n${destinations.join("\n")}\n已注册 CodeBuddy /brizo 命令。`);
