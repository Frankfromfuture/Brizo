import { runBenchmarkCli } from "./benchmark-browser-performance.mjs";

// Preserve the historical command while using the same isolated-profile,
// wall-clock methodology as the complete browser comparison.
await runBenchmarkCli(["--startup-only", ...process.argv.slice(2)]);
