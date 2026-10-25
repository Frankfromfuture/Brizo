import { app, BrowserWindow } from "electron";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { startAgentBridge } from "../runtime/electron/agent-bridge.mjs";
import { executeBrowserCommand } from "../lib/client.mjs";
import { createAgentSession } from "../lib/agent-session.mjs";

const argument = name => process.argv.find(value => value.startsWith(`${name}=`))?.slice(name.length + 1);
const output = argument("--report");
const profile = argument("--qa-profile");
if (!output || !profile) throw new Error("--report and --qa-profile are required");
app.setPath("userData", profile);
app.commandLine.appendSwitch("disable-renderer-backgrounding");
app.commandLine.appendSwitch("disable-background-timer-throttling");
app.commandLine.appendSwitch("disable-features", "CalculateNativeWinOcclusion");
const foregroundCalls = [];
for (const method of ["show", "showInactive", "focus", "moveTop"]) BrowserWindow.prototype[method] = () => { foregroundCalls.push(method); throw new Error(`Foreground API ${method} is forbidden in acceptance`); };
app.focus = () => { foregroundCalls.push("app.focus"); throw new Error("Foreground activation is forbidden in acceptance"); };
async function run() {
await app.whenReady();
app.dock?.hide();
const window = new BrowserWindow({ width: 900, height: 700, show: false });
await window.loadURL("data:text/html,<title>Hidden agent acceptance</title>");
const views = new Map();
const results = [];
let bridge;
let session;

try {
  const fixture = await readFile(new URL("./fixtures/agent-workbench.html", import.meta.url), "utf8");
  const directory = await mkdtemp(path.join(os.tmpdir(), "brizo-agent-qa-"));
  const longFixture = `<a href="#tail">Deep section</a><span id="control-label">Label from ID</span><button aria-labelledby="control-label" title="Tooltip">Child</button><a href="https://example.com/" title="External link"><span>Visible link name</span></a>${Array.from({length:180},(_,i)=>`<button style="font-size:4px;padding:0">B${i}</button>`).join("")}<p>${"Document beginning. ".repeat(1000)}</p><div style="height:10000px"></div><h2 id="tail">Tail section</h2><p>UNIQUE_VISIBLE_TAIL_EVIDENCE</p><a href="#access_token=fixture-secret">Auth fragment</a><button style="position:fixed;left:600px;top:100px;width:140px;height:40px" onclick="window.coverClicks=(window.coverClicks||0)+1">Covered control</button><div style="position:fixed;left:600px;top:100px;width:140px;height:40px;z-index:999;background:white">Cover</div>`;
  bridge = await startAgentBridge({
    directory,
    // This fixture adapter resolves one synthetic public origin entirely in
    // memory. Production navigation and network policies remain unchanged.
    installNetworkPolicy(partition) {
      partition.protocol.handle("https", request => new URL(request.url).origin === "https://fixture.brizo.example"
        ? new Response(new URL(request.url).pathname === "/long" ? longFixture : new URL(request.url).searchParams.has("login")
          ? fixture.replace("</html>", '<dialog open aria-label="Sign in"><form><label>Password<input type="password" value="login-fixture-value"></label></form></dialog></html>') : fixture,
          { headers: { "Content-Type": "text/html; charset=utf-8" } })
        : new Response("Blocked fixture request", { status: 403 }));
    },
    validateTarget(address) {
      if (new URL(address).origin !== "https://fixture.brizo.example") throw new Error("Fixture origin only");
      return address;
    },
    host: {
      offscreenRendering: true,
      attachTab({ tabId, view, shield }) {
        views.set(tabId, view);
        window.contentView.addChildView(view);
        window.contentView.addChildView(shield);
        view.setBounds({ x: 0, y: 0, width: 900, height: 700 });
        view.setVisible(true);
      },
      detachTab(view) { view.webContents.close(); },
      loadRunningEffect: async () => {},
      updateTab: () => {},
      publish: () => {},
    },
  });
  const clientOptions = { directory };
  let calls = 0;
  let outputBytes = 0;
  const command = async (...args) => {
    calls++;
    const result = await executeBrowserCommand(...args);
    outputBytes += Buffer.byteLength(JSON.stringify(result));
    return result;
  };
  const started = performance.now();
  session = await createAgentSession({ goal: "Click Search in the fixture, fill fields, and drag the card on the canvas", client: "acceptance", url: "https://fixture.brizo.example/" }, { command, clientOptions });
  assert.ok(session.observation?.elements.some(element => element.fieldName === "q"));
  results.push({ scenario: "create-includes-observation", passed: true });

  const capture = await session.screenshot({ maxChars: 300 });
  assert.ok(capture.path && capture.observation.snapshotId && capture.imageScale.x > 0);
  const pixels = await readFile(capture.path);
  assert.equal(pixels.readUInt32BE(16), capture.viewport.width);
  assert.equal(pixels.readUInt32BE(20), capture.viewport.height);
  const device = await session.screenshot({ scale: "device", maxChars: 300 });
  const devicePixels = await readFile(device.path);
  assert.equal(devicePixels.readUInt32BE(16), device.imageSize.width);
  assert.ok(device.imageSize.width >= capture.imageSize.width);
  results.push({ scenario: "css-and-device-screenshot-metadata", passed: true });
  const filled = await session.act({ action: "fill", target: { fieldName: "q" }, value: "Brizo" });
  assert.equal(filled.outcome.postcondition.verified, true);
  results.push({ scenario: "screenshot-then-action", passed: true });

  const batch = await session.batch([
    { action: "fill", target: { fieldName: "city" }, value: "Shanghai" },
    { action: "select", target: { role: "combobox", name: "Sort" }, value: "newest" },
    { action: "click", target: { role: "button", name: "Search" }, wait: { text: "Found Brizo in Shanghai (newest)", timeoutMs: 2000 } },
  ]);
  assert.equal(batch.completed.length, 3);
  results.push({ scenario: "semantic-batch-with-async-result", passed: true });

  const full = await session.observe({ detail: "full" });
  const compact = await session.observe();
  const filtered = await session.observe({ filter: { role: "button", text: "Search" }, maxChars: 0 });
  const bytes = item => Buffer.byteLength(JSON.stringify(item));
  assert.ok(bytes(compact) < bytes(full));
  assert.ok(bytes(filtered) < bytes(compact));
  results.push({ scenario: "observation-budget", passed: true, bytes: { full: bytes(full), compact: bytes(compact), filtered: bytes(filtered) } });

  const before = await session.observe();
  await session.act({ action: "fill", target: { fieldName: "city" }, value: "Beijing" });
  const delta = await session.observe({ since: before.snapshotId });
  assert.ok(delta.elements.some(element => element.fieldName === "city" && element.value === "Beijing"));
  assert.ok(delta.elements.length < before.elements.length);
  results.push({ scenario: "delta-after-edit", passed: true });

  await assert.rejects(session.wait({ text: "never-appears", timeoutMs: 100 }), error => {
    assert.equal(error.code, "CONDITION_TIMEOUT");
    assert.ok(error.details.observation.snapshotId);
    return true;
  });
  assert.equal((await session.diagnostics()).state.status, "agent");
  assert.ok(session.observation.snapshotId);
  results.push({ scenario: "wait-timeout-keeps-agent-control", passed: true });

  const stale = session.observation.snapshotId;
  await session.act({ action: "fill", target: { fieldName: "q" }, value: "New" });
  await assert.rejects(executeBrowserCommand("act", session.sessionId, { snapshotId: stale, action: "fill", ref: "@e1", value: "wrong" }, clientOptions), { code: "STALE_SNAPSHOT" });
  results.push({ scenario: "stale-snapshot-rejected", passed: true });

  await session.observe();
  await assert.rejects(session.batch([
    { action: "fill", target: { fieldName: "q" }, value: "partial" },
    { action: "click", target: { role: "button", name: "Missing" } },
    { action: "fill", target: { fieldName: "q" }, value: "must-not-run" },
  ]), error => error.code === "TARGET_NOT_FOUND" && error.details.completed.length === 1 && error.details.failedIndex === 1);
  assert.equal(session.observation.elements.find(element => element.fieldName === "q").value, "partial");
  results.push({ scenario: "batch-stops-and-returns-partial-evidence", passed: true });

  await assert.rejects(session.batch([
    { action: "fill", target: { fieldName: "q" }, value: "must-not-run" },
    { action: "click", target: { role: "button", name: "Search" }, wait: { text: "anything", timeoutMs: 90000 } },
  ]), { code: "ARGUMENT_INVALID" });
  const afterPreflight = await session.observe();
  assert.equal(afterPreflight.elements.find(element => element.fieldName === "q").value, "partial");
  results.push({ scenario: "invalid-later-step-has-no-earlier-effects", passed: true });

  const view = [...views.values()][0];
  view.webContents.setZoomFactor(1.25);
  const visual = await session.screenshot({ maxChars: 1000 });
  await session.act({ action: "drag", from: { x: 70, y: 300 }, to: { x: 220, y: 350 }, wait: { text: "Card dragged", timeoutMs: 2000 } });
  const afterDrag = await session.screenshot();
  results.push({ scenario: "canvas-drag-at-125-percent-zoom", passed: true, screenshot: afterDrag.path, before: visual.path });
  await assert.rejects(session.act({ action: "click", x: 5, y: 5 }), { code: "VISUAL_TARGET_INVALID" });
  results.push({ scenario: "coordinates-cannot-bypass-dom-controls", passed: true });

  await session.observe();
  view.webContents.setZoomFactor(1);
  await session.act({ action: "navigate", url: "https://fixture.brizo.example/long" });
  assert.equal(session.observation.truncated.elements, true);
  assert.equal(session.observation.truncated.text, true);
  assert.ok(session.observation.elements.some(e => e.name === "Label from ID"));
  assert.ok(session.observation.elements.some(e => e.name === "Visible link name"));
  assert.equal(session.observation.elements.some(e => e.tag === "span" && e.name === "Label from ID"), false);
  assert.equal(session.observation.elements.find(e => e.name === "Deep section").href, "https://fixture.brizo.example/long#tail");
  results.push({ scenario: "semantic-labels-and-upstream-truncation", passed: true });
  await session.act({ action: "click", target: { role: "link", name: "Deep section" } });
  assert.equal(session.observation.url, "https://fixture.brizo.example/long#tail");
  assert.ok(session.observation.pageText.startsWith("Tail section"));
  assert.ok(session.observation.pageText.includes("UNIQUE_VISIBLE_TAIL_EVIDENCE"));
  assert.equal(JSON.stringify(session.observation).includes("fixture-secret"), false);
  results.push({ scenario: "deep-section-text-and-safe-fragments", passed: true });
  await assert.rejects(session.act({ action: "click", target: { role: "button", name: "Covered control" } }), { code: "TARGET_OCCLUDED" });
  assert.equal(await view.webContents.executeJavaScript("window.coverClicks || 0"), 0);
  await session.observe();
  results.push({ scenario: "covered-control-never-receives-click", passed: true });
  await session.act({ action: "navigate", url: "https://fixture.brizo.example/" });
  await session.observe();
  await assert.rejects(session.act({ action: "click", target: { role: "button", name: "Submit" } }), { code: "NEEDS_CONFIRMATION" });
  const status = await executeBrowserCommand("status", session.sessionId, {}, clientOptions);
  assert.equal(status.pauseReason.code, "NEEDS_CONFIRMATION");
  results.push({ scenario: "unauthorized-submit-constraint-preserved", passed: true });
  await bridge.control(session.sessionId, "resume");
  await session.observe();
  await assert.rejects(session.act({ action: "navigate", url: "https://fixture.brizo.example/?login=1" }), error => {
    assert.equal(error.code, "NEEDS_LOGIN");
    assert.equal(`${error.message} ${JSON.stringify(error.details)}`.includes("login-fixture-value"), false);
    return true;
  });
  results.push({ scenario: "parallel-observation-stops-at-login", passed: true });
  assert.equal(window.isVisible(), false);
  assert.deepEqual(foregroundCalls, []);
  results.push({ scenario: "entire-run-hidden", passed: true });

  const report = { ok: true, date: new Date().toISOString(), platform: process.platform, electron: process.versions.electron, chromium: process.versions.chrome,
    scenarios: results, metrics: { calls, outputBytes, elapsedMs: Math.round(performance.now() - started) }, profileIsolated: true, foregroundCalls: foregroundCalls.length };
  await writeFile(output, `${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify({ ok: true, scenarios: results.length, report: output })}\n`);
} catch (error) {
  await writeFile(output, `${JSON.stringify({ ok: false, scenarios: results, error: { code: error.code, message: error.message, stack: error.stack, details: error.details } }, null, 2)}\n`);
  process.stderr.write(`${error.stack}\n`);
  process.exitCode = 1;
} finally {
  await bridge?.close();
  for (const view of views.values()) if (view.webContents && !view.webContents.isDestroyed()) view.webContents.close();
  window.destroy();
  app.exit(process.exitCode || 0);
}
}
void run().catch(error => { process.stderr.write(`${error.stack}\n`); app.exit(1); });
