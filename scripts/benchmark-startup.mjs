import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const electronPath = path.join(projectRoot, "node_modules", ".bin", "electron");
const chromePath = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

function run(command, args) {
  return new Promise((resolve, reject) => {
    const startedAt = performance.now();
    const child = spawn(command, args, { cwd: projectRoot, stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    child.stdout.on("data", (chunk) => { output += chunk; });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code !== 0) reject(new Error(`${command} exited with ${code}`));
      else resolve({ elapsed: performance.now() - startedAt, output });
    });
  });
}

const rounds = 3;
const brizo = [];
const chrome = [];
for (let index = 0; index < rounds; index += 1) {
  const result = await run(electronPath, ["electron/main.mjs", "--startup-benchmark"]);
  const reported = Number(result.output.match(/"milliseconds":(\d+)/)?.[1]);
  brizo.push(Number.isFinite(reported) ? reported : Math.round(result.elapsed));
  try {
    const chromeResult = await run(chromePath, [
      "--headless=new",
      "--disable-gpu",
      "--dump-dom",
      "data:text/html,<title>startup</title>",
    ]);
    chrome.push(Math.round(chromeResult.elapsed));
  } catch {
    // Chrome is optional on non-macOS development hosts.
  }
}

const average = (values) => Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
console.log(JSON.stringify({
  brizoAverageMs: average(brizo),
  brizoRunsMs: brizo,
  chromeAverageMs: chrome.length ? average(chrome) : null,
  chromeRunsMs: chrome,
  note: "Cold-process shell benchmark; webpage network time is intentionally excluded.",
}, null, 2));
