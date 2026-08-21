import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const electronBinary = require("electron");
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const devUrl = process.env.BRIZO_DEV_SERVER_URL?.trim() || "http://127.0.0.1:5173/";
const viteBinary = path.join(projectRoot, "node_modules", "vite", "bin", "vite.js");

let viteProcess = null;
let desktopProcess = null;
let shuttingDown = false;

async function serverIsReady() {
  try {
    const response = await fetch(devUrl, { signal: AbortSignal.timeout(800) });
    return response.ok;
  } catch {
    return false;
  }
}

async function waitForServer(timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await serverIsReady()) return;
    await new Promise((resolve) => setTimeout(resolve, 180));
  }
  throw new Error(`Vite development server did not become ready at ${devUrl}`);
}

function stopChild(child) {
  if (child && child.exitCode == null && !child.killed) child.kill("SIGTERM");
}

function shutdown(exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  stopChild(desktopProcess);
  stopChild(viteProcess);
  process.exitCode = exitCode;
}

process.once("SIGINT", () => shutdown(130));
process.once("SIGTERM", () => shutdown(143));

try {
  if (!(await serverIsReady())) {
    viteProcess = spawn(process.execPath, [viteBinary, "--host", "127.0.0.1"], {
      cwd: projectRoot,
      env: process.env,
      stdio: "inherit",
    });
    viteProcess.once("exit", (code) => {
      if (!shuttingDown && code) shutdown(code);
    });
  }

  await waitForServer();
  desktopProcess = spawn(electronBinary, [path.join(projectRoot, "electron", "main.mjs")], {
    cwd: projectRoot,
    env: {
      ...process.env,
      BRIZO_DEV_SERVER_URL: devUrl,
    },
    stdio: "inherit",
  });
  desktopProcess.once("exit", (code) => {
    stopChild(viteProcess);
    if (!shuttingDown) process.exit(code ?? 0);
  });
} catch (error) {
  console.error(`[desktop:dev] ${error?.message || error}`);
  shutdown(1);
}
