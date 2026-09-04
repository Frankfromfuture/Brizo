import net from "node:net";
import { randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { chmod, mkdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { createAgentSandbox } from "./agent-browser.mjs";

const sameSecret = (a, b) => {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const left = Buffer.from(a), right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
};

// Local IPC only: no HTTP listener, browser-accessible port, or raw CDP proxy.
export async function startAgentBridge({ directory, host, installNetworkPolicy, validateTarget }) {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await chmod(directory, 0o700);
  const nonce = randomBytes(6).toString("hex");
  const socketPath = process.platform === "win32" ? `\\\\.\\pipe\\brizo-${nonce}` : path.join(directory, `bridge-${nonce}.sock`);
  const descriptorPath = path.join(directory, "runtime.json");
  const token = randomBytes(32).toString("hex");
  const sessions = new Map();
  const connections = new Set();
  let creating = 0, stopping = false;
  const dispatch = async (request, signal) => {
    if (stopping || !sameSecret(request?.token, token)) throw Object.assign(new Error("本机连接未获授权。"), { code: "UNAUTHORIZED" });
    if (request.method === "ping") return { protocol: 1, product: "Brizo", pid: process.pid };
    if (request.method === "create") {
      if (sessions.size + creating >= 4) throw Object.assign(new Error("最多同时打开四组 Agent 沙箱。"), { code: "SESSION_LIMIT" });
      const goal = typeof request.args?.goal === "string" ? request.args.goal.trim().slice(0, 2000) : "";
      if (!goal) throw new Error("创建沙箱时必须给出用户的原始任务。");
      const id = randomUUID(), capability = randomBytes(32).toString("hex");
      creating += 1;
      try {
        const sandbox = await createAgentSandbox({ id, goal, client: String(request.args?.client || "外部 Agent").slice(0, 80), url: request.args?.url,
          host, installNetworkPolicy, validateTarget, onClose: closedId => sessions.delete(closedId) });
        if (signal.aborted || stopping) { sandbox.destroy(); throw new Error("创建请求已取消。"); }
        sessions.set(id, { capability, sandbox });
        return { sessionId: id, capability, state: sandbox.state() };
      } finally { creating -= 1; }
    }
    const item = sessions.get(request.sessionId);
    if (!item || !sameSecret(request.capability, item.capability)) throw Object.assign(new Error("沙箱不存在或不属于此连接。"), { code: "SESSION_SCOPE" });
    return item.sandbox.request(request.method, request.args, signal);
  };
  const server = net.createServer(socket => {
    connections.add(socket);
    const controller = new AbortController();
    let input = "", accepted = false, answered = false;
    socket.setEncoding("utf8"); socket.setTimeout(35_000, () => socket.destroy());
    socket.on("error", () => {});
    socket.once("close", () => { connections.delete(socket); if (!answered) controller.abort(); });
    socket.on("data", chunk => {
      if (accepted) return;
      input += chunk;
      if (Buffer.byteLength(input) > 64 * 1024) { socket.destroy(); return; }
      const end = input.indexOf("\n");
      if (end < 0) return;
      accepted = true;
      void (async () => {
        let response;
        try { response = { ok: true, result: await dispatch(JSON.parse(input.slice(0, end)), controller.signal) }; }
        catch (error) { response = { ok: false, error: { code: error.code || "BRIZO_ERROR", message: error.message || "浏览器操作失败。" } }; }
        answered = true;
        if (!socket.destroyed) socket.end(`${JSON.stringify(response)}\n`);
      })();
    });
  });
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(socketPath, resolve); });
  server.on("error", () => {});
  try {
    if (process.platform !== "win32") await chmod(socketPath, 0o600);
    const temp = `${descriptorPath}.${process.pid}.tmp`;
    await writeFile(temp, JSON.stringify({ protocol: 1, socketPath, token, pid: process.pid }), { mode: 0o600 });
    await rename(temp, descriptorPath);
  } catch (error) { server.close(); if (process.platform !== "win32") await rm(socketPath, { force: true }); throw error; }
  return {
    states: () => [...sessions.values()].map(item => item.sandbox.state()),
    control: (id, action, payload) => {
      const item = sessions.get(id);
      if (!item) throw new Error("本次 Agent 连接已结束。");
      return item.sandbox.control(action, payload);
    },
    async close() {
      stopping = true;
      for (const { sandbox } of sessions.values()) sandbox.destroy();
      for (const socket of connections) socket.destroy();
      server.close();
      // Keep the stale descriptor until the next process atomically replaces
      // it. Unlinking after an async read can delete a new process's descriptor
      // during a quick restart; the CLI already detects a closed socket.
      if (process.platform !== "win32") await rm(socketPath, { force: true });
    },
  };
}
