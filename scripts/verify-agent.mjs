#!/usr/bin/env node
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const run = promisify(execFile);
const option = name => { const index = process.argv.indexOf(name); return index < 0 ? undefined : process.argv[index + 1]; };
const directory = await mkdtemp(path.join(os.tmpdir(), "brizo-agent-validation-"));
const report = path.resolve(option("--output") || path.join(directory, "report.json"));
try {
  const electron = option("--electron") || (await import("electron")).default;
  const { ELECTRON_RUN_AS_NODE, ...env } = process.env;
  await run(electron, [fileURLToPath(new URL("./agent-acceptance-host.mjs", import.meta.url)), `--report=${report}`, `--qa-profile=${path.join(directory, "profile")}`], {
    cwd: fileURLToPath(new URL("..", import.meta.url)), env, timeout: 60000, maxBuffer: 1024 * 1024,
  });
  const result = JSON.parse(await readFile(report, "utf8"));
  if (!result.ok) throw new Error("Hidden Agent acceptance failed; inspect the report.");
  process.stdout.write(`${JSON.stringify({ ok: true, scenarios: result.scenarios.length, metrics: result.metrics, report })}\n`);
} catch (error) {
  process.stderr.write(`${error.stderr || error.message}\nReport: ${report}\n`);
  process.exitCode = 1;
} finally {
  await rm(path.join(directory, "profile"), { recursive: true, force: true });
}
