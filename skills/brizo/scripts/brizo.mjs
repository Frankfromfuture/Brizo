#!/usr/bin/env node
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { mkdir, readFile, writeFile, chmod, rm } from "node:fs/promises";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";

const directory = path.join(os.homedir(), ".brizo");
const [method, sessionId] = process.argv.slice(2);
const methods = new Set(["ping", "create", "status", "observe", "screenshot", "act", "open", "switch", "close-tab", "handoff", "finish", "close"]);
const readJson = async () => {
  let input = "";
  for await (const chunk of process.stdin) {
    input += chunk;
    if (Buffer.byteLength(input) > 60 * 1024) throw new Error("命令参数超过 60 KB。");
  }
  return input.trim() ? JSON.parse(input) : {};
};
const connect = (descriptor, payload) => new Promise((resolve, reject) => {
  const socket = net.createConnection(descriptor.socketPath);
  let input = "", settled = false;
  const finish = (error, result) => {
    if (settled) return; settled = true; socket.destroy();
    if (error) reject(error); else resolve(result);
  };
  socket.setEncoding("utf8"); socket.setTimeout(32_000, () => finish(new Error("Brizo 未返回操作结果。请先检查 status/observe，不要直接重试同一动作。")));
  socket.once("connect", () => socket.write(`${JSON.stringify({ ...payload, token: descriptor.token })}\n`));
  socket.on("error", error => finish(error));
  socket.on("end", () => { if (!settled) finish(new Error("Brizo 连接已断开。")); });
  socket.on("data", chunk => {
    input += chunk;
    if (Buffer.byteLength(input) > 12 * 1024 * 1024) { finish(new Error("浏览器返回内容过大。")); return; }
    if (!input.includes("\n")) return;
    try {
      const response = JSON.parse(input.slice(0, input.indexOf("\n")));
      if (!response.ok) finish(Object.assign(new Error(response.error?.message || "浏览器操作失败。"), { code: response.error?.code }));
      else finish(null, response.result);
    } catch (error) { finish(error); }
  });
});
const descriptor = async () => {
  const value = JSON.parse(await readFile(path.join(directory, "runtime.json"), "utf8"));
  const localSocket = process.platform === "win32" ? /^\\\\\.\\pipe\\brizo-/.test(value.socketPath || "") : path.dirname(value.socketPath || "") === directory && /^bridge-[a-f0-9]+\.sock$/.test(path.basename(value.socketPath));
  if (value.protocol !== 1 || !localSocket || !/^[a-f0-9]{64}$/.test(value.token || "")) throw new Error("Brizo 本机连接信息无效。");
  return value;
};
const runningBridge = async () => {
  try { const current = await descriptor(); await connect(current, { method: "ping" }); return current; } catch {}
  let launch;
  try { launch = JSON.parse(await readFile(path.join(directory, "launch.json"), "utf8")); }
  catch { throw new Error("请先启动 Brizo 桌面版，或重新运行项目中的 agent:install。"); }
  if (!path.isAbsolute(launch.executable || "") || !path.isAbsolute(launch.entry || "")) throw new Error("Brizo 启动配置无效，请重新安装 skill。");
  const child = spawn(launch.executable, [launch.entry, "--agent-bridge-start"], { detached: true, stdio: "ignore", shell: false });
  let launchError;
  child.once("error", error => { launchError = error; }); child.unref();
  for (let attempt = 0; attempt < 30; attempt += 1) {
    if (launchError) throw new Error(`Brizo 启动失败：${launchError.message}`);
    await delay(300);
    try { const current = await descriptor(); await connect(current, { method: "ping" }); return current; } catch {}
  }
  throw new Error("Brizo 尚未提供本机桥接，请确认桌面版已更新并运行。");
};

try {
  if (!methods.has(method)) throw new Error("用法：node brizo.mjs create|observe|act|open|switch|status|screenshot|handoff|finish|close [sessionId]；参数通过标准输入传入 JSON。");
  const args = ["create", "act", "open", "switch", "close-tab", "handoff", "finish"].includes(method) ? await readJson() : {};
  const connection = await runningBridge();
  let capability;
  if (!["ping", "create"].includes(method)) {
    if (!/^[a-f0-9-]{36}$/.test(sessionId || "")) throw new Error("请使用 create 返回的 sessionId。");
    const saved = JSON.parse(await readFile(path.join(directory, "sessions", `${sessionId}.json`), "utf8"));
    capability = saved.capability;
    if (saved.pid !== connection.pid) throw new Error("Brizo 已重启，原沙箱会话已失效。请创建新沙箱。");
  }
  let result = await connect(connection, { method, sessionId, capability, args });
  if (method === "create") {
    const sessions = path.join(directory, "sessions");
    await mkdir(sessions, { recursive: true, mode: 0o700 }); await chmod(sessions, 0o700);
    await writeFile(path.join(sessions, `${result.sessionId}.json`), JSON.stringify({ capability: result.capability, pid: connection.pid }), { mode: 0o600 });
    delete result.capability;
  }
  if (method === "screenshot") {
    const captures = path.join(directory, "captures");
    await mkdir(captures, { recursive: true, mode: 0o700 });
    const file = path.join(captures, `${sessionId}-${Date.now()}.png`);
    await writeFile(file, Buffer.from(result.data, "base64"), { mode: 0o600 });
    result = { path: file, mimeType: "image/png" };
  }
  if (sessionId && result?.status === "closed") await rm(path.join(directory, "sessions", `${sessionId}.json`), { force: true });
  process.stdout.write(`${JSON.stringify({ ok: true, result })}\n`);
} catch (error) {
  process.stdout.write(`${JSON.stringify({ ok: false, error: { code: error.code || "CLIENT_ERROR", message: error.message } })}\n`);
  process.exitCode = 1;
}
