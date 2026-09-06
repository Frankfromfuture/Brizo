import net from "node:net";
import os from "node:os";
import path from "node:path";
import { constants as fsConstants } from "node:fs";
import { access, chmod, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import {
  BRIDGE_METHOD_NAMES,
  BRIZO_MAX_PROTOCOL_VERSION,
  BRIZO_MIN_PROTOCOL_VERSION,
  bridgeMethodReadsJson,
  isBridgeMethod,
  supportsBrizoProtocol,
} from "./protocol.mjs";

export const BRIDGE_METHODS = new Set(BRIDGE_METHOD_NAMES);

const exists = async target => {
  try {
    await access(target, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
};

export function stateDirectory(env = process.env, homeDirectory = os.homedir()) {
  return env.BRIZO_STATE_DIR
    ? path.resolve(env.BRIZO_STATE_DIR)
    : path.join(homeDirectory, ".brizo");
}

export function validateRuntimeDescriptor(value, directory, platform = process.platform) {
  const socketPath = String(value?.socketPath || "");
  const localSocket = platform === "win32"
    ? /^\\\\\.\\pipe\\brizo-[a-f0-9]+$/.test(socketPath)
    : path.dirname(socketPath) === directory
      && /^bridge-[a-f0-9]+\.sock$/.test(path.basename(socketPath));
  if (!supportsBrizoProtocol(value?.protocol)) {
    throw Object.assign(
      new Error(`Brizo 协议版本不兼容：桌面端为 ${value?.protocol ?? "未知"}，CLI 支持 ${BRIZO_MIN_PROTOCOL_VERSION}–${BRIZO_MAX_PROTOCOL_VERSION}。`),
      { code: "PROTOCOL_MISMATCH" },
    );
  }
  if (
    !localSocket
    || !/^[a-f0-9]{64}$/.test(String(value?.token || ""))
    || !Number.isInteger(value?.pid)
    || value.pid <= 0
  ) {
    throw Object.assign(new Error("Brizo 本机连接信息无效。"), { code: "RUNTIME_INVALID" });
  }
  return value;
}

export async function readJsonInput(stream = process.stdin) {
  let input = "";
  for await (const chunk of stream) {
    input += chunk;
    if (Buffer.byteLength(input) > 60 * 1024) {
      throw Object.assign(new Error("命令参数超过 60 KB。"), { code: "INPUT_TOO_LARGE" });
    }
  }
  return parseJsonInput(input);
}

export function parseJsonInput(input) {
  input = String(input || "");
  if (Buffer.byteLength(input) > 60 * 1024) {
    throw Object.assign(new Error("命令参数超过 60 KB。"), { code: "INPUT_TOO_LARGE" });
  }
  if (!input.trim()) return {};
  try {
    return JSON.parse(input);
  } catch {
    throw Object.assign(new Error("标准输入必须是有效的 JSON。"), { code: "INPUT_INVALID" });
  }
}

export async function readRuntimeDescriptor(directory) {
  const raw = await readFile(path.join(directory, "runtime.json"), "utf8");
  return validateRuntimeDescriptor(JSON.parse(raw), directory);
}

export function connectBridge(descriptor, payload) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection(descriptor.socketPath);
    let input = "";
    let settled = false;

    const finish = (error, result) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      if (error) reject(error);
      else resolve(result);
    };

    socket.setEncoding("utf8");
    socket.setTimeout(32_000, () => finish(
      Object.assign(
        new Error("Brizo 未返回操作结果。请先检查 status/observe，不要直接重试同一动作。"),
        { code: "TIMEOUT" },
      ),
    ));
    socket.once("connect", () => {
      socket.write(`${JSON.stringify({ ...payload, token: descriptor.token })}\n`);
    });
    socket.on("error", error => finish(error));
    socket.on("end", () => {
      if (!settled) finish(Object.assign(new Error("Brizo 连接已断开。"), { code: "DISCONNECTED" }));
    });
    socket.on("data", chunk => {
      input += chunk;
      if (Buffer.byteLength(input) > 12 * 1024 * 1024) {
        finish(Object.assign(new Error("浏览器返回内容过大。"), { code: "OUTPUT_TOO_LARGE" }));
        return;
      }
      const newline = input.indexOf("\n");
      if (newline < 0) return;
      try {
        const response = JSON.parse(input.slice(0, newline));
        if (!response.ok) {
          finish(Object.assign(
            new Error(response.error?.message || "浏览器操作失败。"),
            { code: response.error?.code || "BRIZO_ERROR" },
          ));
        } else {
          finish(null, response.result);
        }
      } catch (error) {
        finish(Object.assign(error, { code: "RESPONSE_INVALID" }));
      }
    });
  });
}

async function executableFromAppPath(input, platform = process.platform) {
  const requested = path.resolve(input);
  if (platform === "darwin" && requested.endsWith(".app")) {
    return path.join(requested, "Contents", "MacOS", "Brizo");
  }
  return requested;
}

async function detectedLaunch(env = process.env, homeDirectory = os.homedir(), platform = process.platform) {
  const requested = String(env.BRIZO_APP_PATH || "").trim();
  const candidates = requested
    ? [await executableFromAppPath(requested, platform)]
    : platform === "darwin"
      ? [
          "/Applications/Brizo.app/Contents/MacOS/Brizo",
          path.join(homeDirectory, "Applications", "Brizo.app", "Contents", "MacOS", "Brizo"),
        ]
      : platform === "win32"
        ? [
            env.LOCALAPPDATA && path.join(env.LOCALAPPDATA, "Programs", "Brizo", "Brizo.exe"),
            env.ProgramFiles && path.join(env.ProgramFiles, "Brizo", "Brizo.exe"),
          ].filter(Boolean)
        : ["/opt/Brizo/brizo", "/usr/local/bin/brizo-browser", "/usr/bin/brizo-browser"];

  for (const executable of candidates) {
    if (await exists(executable)) return { executable, args: ["--agent-bridge-start"] };
  }
  return null;
}

export function validateLaunchConfig(value) {
  const executable = String(value?.executable || "");
  if (!path.isAbsolute(executable)) {
    throw Object.assign(new Error("Brizo 启动配置中的 executable 必须是绝对路径。"), { code: "LAUNCH_INVALID" });
  }

  if (value.entry !== undefined) {
    const entry = String(value.entry || "");
    if (!path.isAbsolute(entry)) {
      throw Object.assign(new Error("Brizo 启动配置中的 entry 必须是绝对路径。"), { code: "LAUNCH_INVALID" });
    }
    return { executable, args: [entry, "--agent-bridge-start"] };
  }

  const args = value.args === undefined ? [] : value.args;
  if (!Array.isArray(args) || args.length > 8 || args.some(arg => typeof arg !== "string" || arg.length > 4096)) {
    throw Object.assign(new Error("Brizo 启动配置中的 args 无效。"), { code: "LAUNCH_INVALID" });
  }
  return {
    executable,
    args: args.includes("--agent-bridge-start") ? [...args] : [...args, "--agent-bridge-start"],
  };
}

export async function resolveLaunch(directory, options = {}) {
  try {
    const configured = JSON.parse(await readFile(path.join(directory, "launch.json"), "utf8"));
    return validateLaunchConfig(configured);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }

  const detected = await detectedLaunch(options.env, options.homeDirectory, options.platform);
  if (detected) return detected;
  throw Object.assign(
    new Error("未找到 Brizo 桌面版。请先启动 Brizo，或运行 brizo install --app <Brizo 路径>。"),
    { code: "BRIZO_NOT_FOUND" },
  );
}

export async function runningBridge(directory, options = {}) {
  try {
    const current = await readRuntimeDescriptor(directory);
    await connectBridge(current, { method: "ping" });
    return current;
  } catch {
    // A stale descriptor is expected after Brizo exits; launch the desktop app.
  }

  const launch = await resolveLaunch(directory, options);
  const child = spawn(launch.executable, launch.args, {
    detached: true,
    stdio: "ignore",
    shell: false,
  });
  let launchError;
  child.once("error", error => {
    launchError = error;
  });
  child.unref();

  for (let attempt = 0; attempt < 30; attempt += 1) {
    if (launchError) {
      throw Object.assign(new Error(`Brizo 启动失败：${launchError.message}`), { code: "LAUNCH_FAILED" });
    }
    await delay(300);
    try {
      const current = await readRuntimeDescriptor(directory);
      await connectBridge(current, { method: "ping" });
      return current;
    } catch {
      // Wait for the desktop bridge to publish a fresh descriptor.
    }
  }
  throw Object.assign(
    new Error("Brizo 尚未提供本机桥接，请确认桌面版已更新并运行。"),
    { code: "BRIDGE_UNAVAILABLE" },
  );
}

function validateSessionId(value) {
  if (!/^[a-f0-9-]{36}$/.test(String(value || ""))) {
    throw Object.assign(new Error("请使用 create 返回的 sessionId。"), { code: "SESSION_INVALID" });
  }
}

export async function executeBrowserCommand(method, sessionId, args = {}, options = {}) {
  if (!isBridgeMethod(method)) {
    throw Object.assign(new Error("不支持的命令。运行 brizo help 查看用法。"), { code: "METHOD_UNKNOWN" });
  }

  const directory = options.directory || stateDirectory(options.env, options.homeDirectory);
  const connection = await runningBridge(directory, options);
  let capability;

  if (!["ping", "create"].includes(method)) {
    validateSessionId(sessionId);
    const saved = JSON.parse(
      await readFile(path.join(directory, "sessions", `${sessionId}.json`), "utf8"),
    );
    capability = saved.capability;
    if (saved.pid !== connection.pid) {
      throw Object.assign(
        new Error("Brizo 已重启，原沙箱会话已失效。请创建新沙箱。"),
        { code: "SESSION_EXPIRED" },
      );
    }
  }

  let result = await connectBridge(connection, { method, sessionId, capability, args });

  if (method === "create") {
    const sessions = path.join(directory, "sessions");
    await mkdir(sessions, { recursive: true, mode: 0o700 });
    await chmod(sessions, 0o700);
    await writeFile(
      path.join(sessions, `${result.sessionId}.json`),
      JSON.stringify({ capability: result.capability, pid: connection.pid }),
      { mode: 0o600 },
    );
    delete result.capability;
  }

  if (method === "screenshot") {
    const captures = path.join(directory, "captures");
    await mkdir(captures, { recursive: true, mode: 0o700 });
    const file = path.join(captures, `${sessionId}-${Date.now()}.png`);
    await writeFile(file, Buffer.from(result.data, "base64"), { mode: 0o600 });
    result = { path: file, mimeType: "image/png" };
  }

  if (sessionId && result?.status === "closed") {
    await rm(path.join(directory, "sessions", `${sessionId}.json`), { force: true });
  }
  return result;
}

export function methodReadsJson(method) {
  return bridgeMethodReadsJson(method);
}
