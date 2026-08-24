import { spawn } from "node:child_process";
import { constants as fsConstants } from "node:fs";
import {
  access,
  lstat,
  mkdtemp,
  opendir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  parseProcessTable,
  selectProcessTree,
  summarizeProcessTree,
  summarizeSamples,
} from "./browser-performance-metrics.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const electronPath = path.join(projectRoot, "node_modules", ".bin", "electron");
const electronBuilderPath = path.join(projectRoot, "node_modules", ".bin", "electron-builder");
const defaultChromePaths = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  path.join(os.homedir(), "Applications", "Google Chrome.app", "Contents", "MacOS", "Google Chrome"),
  "/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary",
];
const chromiumStabilityFlags = [
  "--disable-background-networking",
  "--disable-component-update",
  "--disable-default-apps",
  "--disable-extensions",
  "--disable-sync",
  "--metrics-recording-only",
  "--no-default-browser-check",
  "--no-first-run",
];
const brizoDiagnosticFlags = process.env.BRIZO_PERF_REDUCED_MOTION === "1"
  ? ["--force-prefers-reduced-motion"]
  : [];

function parseOptions(args) {
  const options = {};
  for (const argument of args) {
    if (!argument.startsWith("--")) continue;
    const [key, value] = argument.slice(2).split("=", 2);
    options[key] = value === undefined ? true : value;
  }
  return options;
}

function positiveInteger(value, fallback, minimum = 1, maximum = 120_000) {
  const parsed = Number(value);
  return Number.isFinite(parsed)
    ? Math.max(minimum, Math.min(maximum, Math.round(parsed)))
    : fallback;
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function appendLimited(current, chunk, limit = 256_000) {
  const next = `${current}${chunk}`;
  return next.length > limit ? next.slice(-limit) : next;
}

async function terminateProcessGroup(child) {
  if (!child?.pid || child.exitCode !== null) return;
  try { process.kill(-child.pid, "SIGTERM"); } catch {}
  for (let attempt = 0; attempt < 20 && child.exitCode === null; attempt += 1) {
    await wait(100);
  }
  if (child.exitCode === null) {
    try { process.kill(-child.pid, "SIGKILL"); } catch {}
  }
}

function spawnTracked(command, args, options = {}) {
  const child = spawn(command, args, {
    cwd: projectRoot,
    detached: true,
    env: { ...process.env, ...(options.env || {}) },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => { stdout = appendLimited(stdout, chunk); });
  child.stderr.on("data", (chunk) => { stderr = appendLimited(stderr, chunk); });
  return { child, output: () => ({ stderr, stdout }) };
}

async function runUntilExit(command, args, options = {}) {
  const startedAt = performance.now();
  const tracked = spawnTracked(command, args, options);
  const { child } = tracked;
  let timer;
  let timedOut = false;
  try {
    const result = await new Promise((resolve, reject) => {
      timer = setTimeout(async () => {
        timedOut = true;
        await terminateProcessGroup(child);
        reject(new Error(`${path.basename(command)} timed out after ${options.timeoutMs || 30_000} ms`));
      }, options.timeoutMs || 30_000);
      child.once("error", reject);
      child.once("exit", (code, signal) => {
        if (!timedOut) resolve({ code, signal });
      });
    });
    const output = tracked.output();
    if (result.code !== 0) {
      throw new Error(
        `${path.basename(command)} exited with ${result.code ?? result.signal}: `
        + (output.stderr || output.stdout).slice(-2_000),
      );
    }
    return { ...output, elapsedMs: performance.now() - startedAt };
  } finally {
    clearTimeout(timer);
  }
}

async function runUntilMarker(command, args, marker, options = {}) {
  const startedAt = performance.now();
  const tracked = spawnTracked(command, args, options);
  const { child } = tracked;
  let seen = "";
  let timer;
  try {
    const elapsedMs = await new Promise((resolve, reject) => {
      const inspect = (chunk) => {
        seen = appendLimited(seen, chunk, 32_000);
        if (seen.includes(marker)) resolve(performance.now() - startedAt);
      };
      child.stdout.on("data", inspect);
      child.once("error", reject);
      child.once("exit", (code, signal) => {
        if (!seen.includes(marker)) {
          reject(new Error(
            `${path.basename(command)} exited before readiness (${code ?? signal})`,
          ));
        }
      });
      timer = setTimeout(() => {
        reject(new Error(`${path.basename(command)} readiness timed out after ${options.timeoutMs || 30_000} ms`));
      }, options.timeoutMs || 30_000);
    });
    const output = tracked.output();
    await terminateProcessGroup(child);
    return { ...output, elapsedMs };
  } catch (error) {
    await terminateProcessGroup(child);
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function executableExists(filename) {
  try {
    await access(filename, fsConstants.X_OK);
    return true;
  } catch {
    return false;
  }
}

async function findChrome() {
  const candidates = process.env.BRIZO_CHROME_PATH
    ? [process.env.BRIZO_CHROME_PATH]
    : defaultChromePaths;
  for (const candidate of candidates) {
    if (await executableExists(candidate)) return candidate;
  }
  return "";
}

async function captureProcessTable() {
  const result = await runUntilExit("/bin/ps", ["-axo", "pid=,ppid=,rss=,time=,command="], {
    timeoutMs: 5_000,
  });
  return parseProcessTable(result.stdout);
}

async function snapshotProcessTree(rootPid) {
  const rows = await captureProcessTable();
  return {
    ...summarizeProcessTree(rows, rootPid),
    processes: selectProcessTree(rows, rootPid),
  };
}

async function measureIdle(command, args, {
  cpuWindowMs,
  idleWarmupMs,
  isReady = () => true,
  label,
  readinessTimeoutMs = 5_000,
}) {
  const tracked = spawnTracked(command, args);
  const { child } = tracked;
  try {
    await wait(idleWarmupMs);
    if (child.exitCode !== null) {
      const output = tracked.output();
      throw new Error(`${label} exited before idle sampling: ${output.stderr || output.stdout}`);
    }
    let before = await snapshotProcessTree(child.pid);
    const readinessDeadline = performance.now() + readinessTimeoutMs;
    while (!isReady(before.processes) && performance.now() < readinessDeadline) {
      await wait(250);
      before = await snapshotProcessTree(child.pid);
    }
    if (!isReady(before.processes)) {
      throw new Error(`${label} did not reach the required visible-shell process state`);
    }
    await wait(cpuWindowMs);
    const after = await snapshotProcessTree(child.pid);
    if (after.processCount === 0 || !isReady(after.processes)) {
      throw new Error(`${label} process tree disappeared or regressed during sampling`);
    }
    const cpuPercentOneCore = Math.max(
      0,
      ((after.cpuSeconds - before.cpuSeconds) / (cpuWindowMs / 1_000)) * 100,
    );
    return {
      cpuPercentOneCore,
      cpuPercentMachine: cpuPercentOneCore / Math.max(1, os.cpus().length),
      processCount: after.processCount,
      rssBytes: after.rssBytes,
    };
  } finally {
    await terminateProcessGroup(child);
  }
}

function chromeVisibleShellReady(processes) {
  const commands = processes.map((process) => process.command);
  return commands.some((command) => command.includes("--top-chrome-webui"))
    && commands.some((command) => command.includes("--type=renderer") && !command.includes("--top-chrome-webui"));
}

async function logicalSize(target) {
  const details = await lstat(target);
  if (!details.isDirectory()) return details.size;
  let total = details.size;
  const directory = await opendir(target);
  for await (const entry of directory) {
    total += await logicalSize(path.join(target, entry.name));
  }
  return total;
}

async function allocatedSize(target) {
  const result = await runUntilExit("/usr/bin/du", ["-sk", target], { timeoutMs: 30_000 });
  return Number(result.stdout.trim().split(/\s+/, 1)[0]) * 1024;
}

async function sizeRecord(target) {
  if (!target) return null;
  return {
    allocatedBytes: await allocatedSize(target),
    logicalBytes: await logicalSize(target),
    path: target,
  };
}

async function findFirstApp(directory) {
  const entries = await opendir(directory);
  for await (const entry of entries) {
    const candidate = path.join(directory, entry.name);
    if (entry.isDirectory() && entry.name.endsWith(".app")) return candidate;
    if (entry.isDirectory()) {
      const nested = await findFirstApp(candidate).catch(() => "");
      if (nested) return nested;
    }
  }
  return "";
}

async function packageCurrentApp(tempRoot) {
  if (process.platform !== "darwin") return "";
  if (!(await executableExists(electronBuilderPath))) {
    throw new Error("electron-builder is unavailable; cannot create a current packaged artifact");
  }
  const outputDirectory = path.join(tempRoot, "packaged");
  const archFlag = process.arch === "arm64" ? "--arm64" : "--x64";
  await runUntilExit(electronBuilderPath, [
    "--mac",
    archFlag,
    "--dir",
    `--config.directories.output=${outputDirectory}`,
  ], {
    env: { CSC_IDENTITY_AUTO_DISCOVERY: "false" },
    timeoutMs: 180_000,
  });
  const appPath = await findFirstApp(outputDirectory);
  if (!appPath) throw new Error("electron-builder completed without producing an app bundle");
  return appPath;
}

async function rendererAssetSizes() {
  const assetsDirectory = path.join(projectRoot, "dist", "client", "assets");
  const totals = { cssBytes: 0, fontBytes: 0, jsBytes: 0 };
  const directory = await opendir(assetsDirectory);
  for await (const entry of directory) {
    if (!entry.isFile()) continue;
    const details = await lstat(path.join(assetsDirectory, entry.name));
    if (entry.name.endsWith(".js")) totals.jsBytes += details.size;
    else if (entry.name.endsWith(".css")) totals.cssBytes += details.size;
    else if (/\.(?:otf|ttf|woff2?)$/i.test(entry.name)) totals.fontBytes += details.size;
  }
  return totals;
}

function brizoInvocation(packagedAppPath) {
  if (packagedAppPath) {
    return {
      args: [],
      command: path.join(packagedAppPath, "Contents", "MacOS", "Brizo"),
      mode: "temporary-packaged-app",
    };
  }
  return {
    args: ["electron/main.mjs"],
    command: electronPath,
    mode: "development-electron-runtime",
  };
}

async function benchmarkBrizoStartup(invocation, profilePath) {
  const result = await runUntilMarker(invocation.command, [
    ...chromiumStabilityFlags,
    ...brizoDiagnosticFlags,
    `--user-data-dir=${profilePath}`,
    ...invocation.args,
    "--startup-benchmark",
  ], "[startup-benchmark]", { timeoutMs: 30_000 });
  const internalMs = Number(result.stdout.match(/"milliseconds":\s*(\d+)/)?.[1]);
  if (!Number.isFinite(internalMs)) {
    throw new Error(`Brizo did not report renderer readiness: ${result.stderr || result.stdout}`);
  }
  return { internalMs, wallMs: result.elapsedMs };
}

async function benchmarkChromeStartup(chromePath, profilePath, pageUrl) {
  const marker = "brizo-browser-benchmark-ready";
  const result = await runUntilMarker(chromePath, [
    ...chromiumStabilityFlags,
    "--headless=new",
    `--user-data-dir=${profilePath}`,
    "--dump-dom",
    pageUrl,
  ], marker, { timeoutMs: 30_000 });
  if (!result.stdout.includes(marker)) {
    throw new Error("Chrome exited without rendering the local benchmark document");
  }
  return result.elapsedMs;
}

async function runStartupRounds({ chromePath, invocation, pageUrl, rounds, tempRoot }) {
  const brizoInternalMs = [];
  const brizoWallMs = [];
  const chromeWallMs = [];
  for (let index = 0; index < rounds; index += 1) {
    const runBrizo = async () => {
      const result = await benchmarkBrizoStartup(
        invocation,
        path.join(tempRoot, `brizo-startup-profile-${index}`),
      );
      brizoInternalMs.push(result.internalMs);
      brizoWallMs.push(result.wallMs);
    };
    const runChrome = async () => {
      chromeWallMs.push(await benchmarkChromeStartup(
        chromePath,
        path.join(tempRoot, `chrome-startup-profile-${index}`),
        pageUrl,
      ));
    };
    // Alternate order to reduce systematic thermal/cache bias.
    if (index % 2 === 0) {
      await runBrizo();
      await runChrome();
    } else {
      await runChrome();
      await runBrizo();
    }
  }
  return {
    brizoDidFinishLoadMs: summarizeSamples(brizoInternalMs),
    brizoReadyWallMs: summarizeSamples(brizoWallMs),
    chromeReadyWallMs: summarizeSamples(chromeWallMs),
  };
}

async function runIdleRounds({
  chromePath,
  cpuWindowMs,
  idleRounds,
  idleWarmupMs,
  invocation,
  pageUrl,
  tempRoot,
}) {
  const results = { brizo: [], chrome: [] };
  for (let index = 0; index < idleRounds; index += 1) {
    const brizoArgs = [
      ...chromiumStabilityFlags,
      ...brizoDiagnosticFlags,
      `--user-data-dir=${path.join(tempRoot, `brizo-idle-profile-${index}`)}`,
      ...invocation.args,
      "--idle-benchmark",
    ];
    const measureBrizo = () => measureIdle(invocation.command, brizoArgs, {
      cpuWindowMs,
      idleWarmupMs,
      label: "Brizo",
    });
    const measureChrome = async () => {
      let lastError;
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const chromeArgs = [
          ...chromiumStabilityFlags,
          `--user-data-dir=${path.join(tempRoot, `chrome-idle-profile-${index}-${attempt}`)}`,
          pageUrl,
        ];
        try {
          return await measureIdle(chromePath, chromeArgs, {
            cpuWindowMs,
            idleWarmupMs,
            isReady: chromeVisibleShellReady,
            label: "Chrome",
          });
        } catch (error) {
          lastError = error;
        }
      }
      throw lastError;
    };
    if (index % 2 === 0) {
      results.brizo.push(await measureBrizo());
      results.chrome.push(await measureChrome());
    } else {
      results.chrome.push(await measureChrome());
      results.brizo.push(await measureBrizo());
    }
  }
  const summarize = (samples) => ({
    cpuPercentMachine: summarizeSamples(samples.map((sample) => sample.cpuPercentMachine), 3),
    cpuPercentOneCore: summarizeSamples(samples.map((sample) => sample.cpuPercentOneCore), 2),
    processCount: summarizeSamples(samples.map((sample) => sample.processCount), 0),
    rssMiB: summarizeSamples(samples.map((sample) => sample.rssBytes / 1024 / 1024), 1),
  });
  return { brizo: summarize(results.brizo), chrome: summarize(results.chrome) };
}

export async function runBenchmarkCli(args = process.argv.slice(2)) {
  if (process.platform !== "darwin") {
    throw new Error("This comparison currently supports macOS process and app-bundle metrics only");
  }
  const options = parseOptions(args);
  const startupOnly = Boolean(options["startup-only"]);
  const rounds = positiveInteger(options.rounds || process.env.BRIZO_PERF_ROUNDS, startupOnly ? 3 : 5, 1, 20);
  const idleRounds = positiveInteger(options["idle-rounds"] || process.env.BRIZO_PERF_IDLE_ROUNDS, 3, 1, 10);
  const idleWarmupMs = positiveInteger(options["idle-warmup-ms"], 8_000, 1_000, 60_000);
  const cpuWindowMs = positiveInteger(options["cpu-window-ms"], 5_000, 1_000, 30_000);
  const chromePath = await findChrome();
  if (!chromePath) {
    throw new Error("Google Chrome was not found. Set BRIZO_CHROME_PATH to its executable.");
  }
  await access(path.join(projectRoot, "dist", "client", "index.html"));
  await access(electronPath, fsConstants.X_OK);

  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "brizo-perf-"));
  try {
    const benchmarkPage = path.join(tempRoot, "benchmark.html");
    await writeFile(
      benchmarkPage,
      "<!doctype html><meta charset=utf-8><title>brizo-browser-benchmark-ready</title><main>brizo-browser-benchmark-ready</main>",
      "utf8",
    );
    const pageUrl = pathToFileURL(benchmarkPage).href;
    const packagedAppPath = options.pack && !startupOnly ? await packageCurrentApp(tempRoot) : "";
    const invocation = brizoInvocation(packagedAppPath);
    const startup = await runStartupRounds({ chromePath, invocation, pageUrl, rounds, tempRoot });
    const packageJson = JSON.parse(await readFile(path.join(projectRoot, "package.json"), "utf8"));
    const chromeVersion = (await runUntilExit(chromePath, ["--version"], { timeoutMs: 5_000 })).stdout.trim();
    const report = {
      benchmark: "Brizo vs local Chrome directional browser baseline",
      generatedAt: new Date().toISOString(),
      machine: {
        architecture: process.arch,
        cpu: os.cpus()[0]?.model || "",
        logicalCpuCount: os.cpus().length,
        memoryGiB: Number((os.totalmem() / 1024 ** 3).toFixed(1)),
        os: `${os.type()} ${os.release()}`,
      },
      versions: {
        brizo: packageJson.version,
        chrome: chromeVersion,
        electron: process.versions.electron || JSON.parse(
          (await readFile(path.join(projectRoot, "node_modules", "electron", "package.json"), "utf8")),
        ).version,
      },
      configuration: {
        brizoRuntime: invocation.mode,
        cpuWindowMs,
        freshProfilePerRun: true,
        idleRounds: startupOnly ? 0 : idleRounds,
        idleWarmupMs,
        idleChromeVisibleShellGate: true,
        startupRounds: rounds,
      },
      startup,
      limitations: [
        "Every run starts a fresh process and profile, but macOS filesystem caches are not purged; this is cold-process, not cold-disk, timing.",
        "Brizo readiness is its renderer did-finish-load marker; Chrome readiness is the local document appearing in headless --dump-dom. Both use spawn-to-marker wall time, but the lifecycle and rendering modes are not fully isomorphic.",
        "Idle Brizo renders its real new-tab product surface while Chrome renders a minimal local document. This measures each browser's baseline shell, not equal page complexity.",
        "Chrome idle samples are accepted only after both its visible top-chrome UI renderer and a content renderer appear; incomplete macOS launch handoffs are retried and never treated as lightweight samples.",
        "RSS is summed across descendant processes and can double-count shared mappings. CPU is the process-tree CPU-time delta and is reported both as one-core and whole-machine percentage.",
        "Bundle sizes compare a current single-architecture Brizo app with the installed Chrome bundle, which may include additional architectures, updater code, locales, and bundled features.",
      ],
    };
    if (!startupOnly) {
      report.idle = await runIdleRounds({
        chromePath,
        cpuWindowMs,
        idleRounds,
        idleWarmupMs,
        invocation,
        pageUrl,
        tempRoot,
      });
      report.size = {
        brizoApp: await sizeRecord(packagedAppPath),
        chromeApp: await sizeRecord(path.resolve(chromePath, "..", "..", "..")),
        rendererAssets: await rendererAssetSizes(),
        rendererDist: await sizeRecord(path.join(projectRoot, "dist")),
      };
      const brizoStartup = startup.brizoReadyWallMs.median;
      const chromeStartup = startup.chromeReadyWallMs.median;
      report.directionalRatios = {
        idleCpuBrizoToChrome: Number((
          report.idle.brizo.cpuPercentOneCore.median
          / Math.max(0.001, report.idle.chrome.cpuPercentOneCore.median)
        ).toFixed(2)),
        idleRssBrizoToChrome: Number((
          report.idle.brizo.rssMiB.median / report.idle.chrome.rssMiB.median
        ).toFixed(2)),
        startupWallBrizoToChrome: Number((brizoStartup / chromeStartup).toFixed(2)),
      };
    }
    console.log(JSON.stringify(report, null, 2));
    return report;
  } finally {
    const expectedPrefix = path.join(os.tmpdir(), "brizo-perf-");
    if (tempRoot.startsWith(expectedPrefix)) {
      await rm(tempRoot, { force: true, recursive: true });
    }
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runBenchmarkCli().catch((error) => {
    console.error(`[perf:compare] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
