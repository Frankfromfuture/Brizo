import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  median,
  parseCpuTime,
  parseProcessTable,
  percentile,
  selectProcessTree,
  summarizeProcessTree,
  summarizeSamples,
} from "../scripts/browser-performance-metrics.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("sample summaries use median and nearest-rank p95 without hiding raw runs", () => {
  assert.equal(median([7, 1, 5, 3]), 4);
  assert.equal(percentile([1, 2, 3, 4, 90], 0.95), 90);
  assert.deepEqual(summarizeSamples([3.125, 1.111, 2.222], 2), {
    max: 3.13,
    median: 2.22,
    min: 1.11,
    p95: 3.13,
    runs: [3.13, 1.11, 2.22],
  });
});

test("macOS ps CPU times and descendant process trees are aggregated deterministically", () => {
  assert.equal(parseCpuTime("01:02.50"), 62.5);
  assert.equal(parseCpuTime("02:03:04.25"), 7_384.25);
  assert.equal(parseCpuTime("1-02:03:04.25"), 93_784.25);

  const rows = parseProcessTable(`
    100 1 1024 00:01.00 /Applications/Brizo.app/Contents/MacOS/Brizo
    101 100 2048 00:00.50 Brizo Helper (Renderer)
    102 101 4096 00:00.25 Brizo Helper (GPU)
    200 1 8192 00:09.00 unrelated
  `);
  assert.deepEqual(selectProcessTree(rows, 100).map((row) => row.pid), [100, 101, 102]);
  assert.deepEqual(summarizeProcessTree(rows, 100), {
    cpuSeconds: 1.75,
    processCount: 3,
    rssBytes: 7 * 1024 * 1024,
  });
});

test("idle measurements use a visible isolated Brizo profile", async () => {
  const [benchmarkSource, mainSource, appSource] = await Promise.all([
    readFile(path.join(projectRoot, "scripts", "benchmark-browser-performance.mjs"), "utf8"),
    readFile(path.join(projectRoot, "electron", "main.mjs"), "utf8"),
    readFile(path.join(projectRoot, "src", "App.jsx"), "utf8"),
  ]);

  assert.match(benchmarkSource, /\.\.\.invocation\.args,\s*"--idle-benchmark"/);
  assert.match(mainSource, /const idleBenchmark = process\.argv\.includes\("--idle-benchmark"\)/);
  assert.match(mainSource, /const isolatedHeadlessTest =[\s\S]*?\|\| idleBenchmark;/);
  assert.match(mainSource, /headlessTest \|\| idleBenchmark \|\| app\.requestSingleInstanceLock\(\)/);
  assert.doesNotMatch(
    mainSource.match(/const headlessTest =[\s\S]*?;\nconst isolatedHeadlessTest/)?.[0] || "",
    /idleBenchmark/,
  );
  assert.match(
    mainSource,
    /loadFile\(rendererEntry, idleBenchmark \? \{ hash: "idle-benchmark" \} : undefined\)/,
  );
  assert.match(appSource, /window\.location\.hash === "#idle-benchmark"/);
  assert.match(
    appSource,
    /const \[activeTab, setActiveTab\] = useState\(\(\) => \{\s*if \(IDLE_BENCHMARK_MODE\) return "pinned-brizo";/,
  );
  assert.match(benchmarkSource, /function chromeVisibleShellReady\(processes\)/);
  assert.match(benchmarkSource, /command\.includes\("--top-chrome-webui"\)/);
  assert.match(benchmarkSource, /chrome-idle-profile-\$\{index\}-\$\{attempt\}/);
  assert.match(benchmarkSource, /idleChromeVisibleShellGate: true/);
});
