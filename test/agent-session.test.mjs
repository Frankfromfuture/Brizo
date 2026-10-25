import assert from "node:assert/strict";
import test from "node:test";
import { createAgentSession } from "../lib/agent-session.mjs";
import { main } from "../lib/cli.mjs";
import { authorizeVisualIntent } from "../runtime/electron/agent-visual-input.mjs";
import { findTarget, matchesWait, presentObservation, validateAgentAction, validateBatch, waitForObservation } from "../runtime/electron/agent-session-tools.mjs";

const snapshot = (value = "") => ({ title: "Fixture", url: "https://example.com/", pageText: "Search products", viewport: { width: 800, height: 600 }, frames: [], elements: [
  { ref: "@e1", domRef: "private", tag: "input", type: "search", role: "", name: "Search", fieldName: "q", value, disabled: false, sensitive: false },
  { ref: "@e2", domRef: "private2", tag: "button", role: "", name: "Search", fieldName: "", value: "", disabled: false },
] });

test("semantic targets disambiguate a search field from an equally named button", () => {
  assert.equal(findTarget(snapshot(), { role: "textbox", name: "Search" }).ref, "@e1");
  assert.throws(() => findTarget(snapshot(), { name: "Search" }), { code: "TARGET_AMBIGUOUS" });
  assert.throws(() => findTarget(snapshot(), { role: "link", name: "Missing" }), { code: "TARGET_NOT_FOUND" });
  assert.throws(() => findTarget(snapshot(), { css: "input" }), { code: "TARGET_INVALID" });
});

test("visual input derives authorization from the original user goal", () => {
  assert.throws(() => authorizeVisualIntent("Read this chart", { action: "click" }), { code: "VISUAL_INTENT_REQUIRED" });
  assert.doesNotThrow(() => authorizeVisualIntent("Drag the card", { action: "drag" }));
});

test("CLI exposes local help without claiming the runtime has been probed", async () => {
  const chunks = [];
  const output = { write: value => chunks.push(value) };
  await main(["capabilities"], { output });
  assert.equal(JSON.parse(chunks.pop()).runtimeVerified, false);
  await main(["help", "batch"], { output });
  assert.equal(JSON.parse(chunks.pop()).result.example.actions.length, 2);
});

test("compact observations retain actionable values and strip private DOM identifiers", () => {
  const output = presentObservation(snapshot("Brizo"), { tabId: "tab", snapshotId: "s1" });
  assert.equal(output.elements[0].value, "Brizo");
  assert.equal(output.elements[0].role, "textbox");
  assert.equal(JSON.stringify(output).includes("private"), false);
  assert.equal(output.viewport.units, "css-pixels");
});

test("text observations retain action refs and field values without duplicating JSON controls", () => {
  const output = presentObservation(snapshot("Brizo"), { tabId: "tab", snapshotId: "s1", options: { format: "text" } });
  assert.match(output.controls, /@e1 textbox "Search" fieldName="q" value="Brizo"/u);
  assert.match(output.controls, /@e2 button "Search"/u);
  assert.equal(output.elements, undefined);
  assert.equal(output.counts.returned, 2);
  assert.equal(output.pageText, "Search products");
  assert.throws(() => presentObservation(snapshot(), { options: { format: "invented" } }), { code: "ARGUMENT_INVALID" });
});

test("text control names cannot inject another apparent control line", () => {
  const page = snapshot();
  page.elements[0].name = 'Label\n@e99 button "Injected"';
  const output = presentObservation(page, { options: { format: "text" } });
  assert.equal(output.controls.split("\n").length, 2);
  assert.match(output.controls, /Label\\n@e99/u);
});

test("filtered observations preserve original refs and disclose truncation", () => {
  const output = presentObservation(snapshot(), { tabId: "tab", snapshotId: "s1", options: { filter: { role: "button" }, maxChars: 3 } });
  assert.equal(output.elements[0].ref, "@e2");
  assert.equal(output.truncated.text, true);
  assert.throws(() => presentObservation(snapshot(), { options: { maxElements: -1 } }), { code: "ARGUMENT_INVALID" });
});

test("delta observations report changed controls without repeating unchanged page text", () => {
  const before = snapshot();
  const after = snapshot("Brizo");
  const output = presentObservation(after, { tabId: "tab", snapshotId: "s2", options: { since: "s1" }, previous: before });
  assert.equal(output.pageText, "");
  assert.deepEqual(output.elements.map(item => item.ref), ["@e1"]);
  assert.equal(output.changes.textChanged, false);
  assert.throws(() => presentObservation(after, { options: { since: "missing" } }), { code: "SNAPSHOT_UNKNOWN" });
});

test("wait observes actual control state and does not turn a read timeout into user control", async () => {
  let reads = 0;
  const result = await waitForObservation(async () => snapshot(++reads > 1 ? "ready" : ""), { target: { fieldName: "q" }, value: "ready", timeoutMs: 1000 });
  assert.equal(result.snapshot.elements[0].value, "ready");
  await assert.rejects(waitForObservation(async () => snapshot(), { text: "missing", timeoutMs: 0 }), { code: "CONDITION_TIMEOUT" });
  assert.equal(matchesWait(snapshot(), { target: { role: "link" }, state: "hidden" }), true);
});

test("wait supports cancellation and rejects an unbounded timeout", async () => {
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(waitForObservation(async () => snapshot(), { text: "missing" }, controller.signal), { name: "AbortError" });
  await assert.rejects(waitForObservation(async () => snapshot(), { text: "missing", timeoutMs: 50000 }), { code: "ARGUMENT_INVALID" });
});

test("batch rejects stale refs in later steps before dispatching any action", () => {
  assert.throws(() => validateBatch({ actions: [{ action: "click", ref: "@e1" }, { action: "click", ref: "@e2" }] }), { code: "ARGUMENT_INVALID" });
  assert.throws(() => validateBatch({ actions: Array.from({ length: 21 }, () => ({ action: "scroll" })) }), { code: "ARGUMENT_INVALID" });
});

test("batch preflight rejects an invalid later step and an invalid post-action wait", () => {
  assert.throws(() => validateBatch({ actions: [{ action: "fill", target: { fieldName: "q" }, value: "first" }, { action: "invented" }] }), { code: "ACTION_INVALID" });
  assert.throws(() => validateAgentAction({ action: "click", ref: "@e1", wait: { text: "ready", timeoutMs: 90000 } }), { code: "ARGUMENT_INVALID" });
  assert.throws(() => validateAgentAction({ action: "drag", from: { x: 1, y: 1 }, to: { x: 2, y: 2 }, steps: 61 }), { code: "ARGUMENT_INVALID" });
});

test("SDK reuses create evidence, follows screenshot evidence, and never replays failed actions", async () => {
  const calls = [];
  const command = async (method, id, args) => {
    calls.push({ method, id, args });
    if (method === "create") return { sessionId: "task", observation: { snapshotId: "s1" } };
    if (method === "screenshot") return { path: "/tmp/s.png", observation: { snapshotId: "s2" } };
    if (method === "act") throw Object.assign(new Error("changed"), { code: "STALE_SNAPSHOT" });
    return { status: "closed" };
  };
  const session = await createAgentSession({ goal: "fixture" }, { command });
  await session.screenshot();
  await assert.rejects(session.act({ action: "click", ref: "@e1" }), { code: "STALE_SNAPSHOT" });
  assert.equal(calls.at(-1).args.snapshotId, "s2");
  assert.equal(calls.filter(item => item.method === "act").length, 1);
  assert.equal(session.observation, undefined);
  await session.close();
  await assert.rejects(session.observe(), { code: "CLOSED" });
});

test("SDK keeps partial batch evidence available for explicit recovery", async () => {
  const observation = { snapshotId: "after-error" };
  const session = await createAgentSession({}, { command: async method => {
    if (method === "create") return { sessionId: "task", observation: { snapshotId: "start" } };
    throw Object.assign(new Error("missing"), { details: { completed: [{ index: 0 }], failedIndex: 1, observation } });
  } });
  await assert.rejects(session.batch([{ action: "click", target: { name: "Next" } }]), error => error.details.failedIndex === 1);
  assert.equal(session.observation, observation);
});

test("legacy hosts retain basic actions and recover refs after screenshot without unsupported dispatch", async () => {
  const calls = [];
  let observations = 0;
  const task = await createAgentSession({ goal: "fixture" }, { command: async (method, id, args) => {
    calls.push({ method, args });
    if (method === "create") return { sessionId: "old-task", state: { status: "agent" } };
    if (method === "observe") return { snapshotId: `old-${++observations}`, elements: [{ ref: "@e1", name: "Search" }] };
    if (method === "screenshot") return { path: "/tmp/old.png" };
    return { observation: { snapshotId: "after-action" } };
  } });
  assert.equal(task.observation.snapshotId, "old-1");
  const capture = await task.screenshot();
  assert.equal(capture.observation.snapshotId, "old-2");
  await assert.rejects(task.batch([{ action: "click", ref: "@e1" }]), { code: "CAPABILITY_UNAVAILABLE" });
  await assert.rejects(task.act({ action: "click", target: { name: "Search" } }), { code: "CAPABILITY_UNAVAILABLE" });
  await task.act({ action: "click", ref: "@e1" });
  assert.equal(calls.at(-1).args.snapshotId, "old-2");
  assert.equal(calls.some(call => call.method === "batch"), false);
});


test("observations retain upstream collection truncation even at the presentation limit", () => {
  const page = { ...snapshot(), truncated: { elements: true, text: true } };
  const output = presentObservation(page, {});
  assert.equal(output.truncated.elements, true);
  assert.equal(output.truncated.text, true);
});


test("existence waits accept multiple links while actions and value waits stay unambiguous", () => {
  const page = snapshot();
  page.elements = [1, 2].map(i => ({ ref: `@e${i}`, tag: "a", name: `Release ${i}`, href: `https://example.com/releases/tag/v${i}` }));
  const target = { role: "link", href: "/releases/tag/", exact: false };
  assert.equal(matchesWait(page, { target }), true);
  assert.equal(matchesWait(page, { target, state: "hidden" }), false);
  assert.throws(() => findTarget(page, target), { code: "TARGET_AMBIGUOUS" });
  assert.throws(() => matchesWait(page, { target, value: "x" }), { code: "TARGET_AMBIGUOUS" });
});

test("scope options are bounded and subtree roots are explicit", () => {
  assert.throws(() => presentObservation(snapshot(), {options:{scope:"all"}}), {code:"ARGUMENT_INVALID"});
  assert.throws(() => presentObservation(snapshot(), {options:{scope:"subtree",root:"body"}}), {code:"ARGUMENT_INVALID"});
  assert.throws(() => presentObservation(snapshot(), {options:{maxElements:1001}}), {code:"ARGUMENT_INVALID"});
  const result=presentObservation({...snapshot(),scope:"subtree",regions:[{ref:"@r1",domRef:"private",role:"main"}],frames:[{ref:"@f1",domRef:"private-frame",url:"https://example.com/"}]},{options:{scope:"subtree",root:"@r1"}});
  assert.equal(JSON.stringify(result).includes("private"),false);
});

test("SDK binds subtree requests to the current observation", async () => {
  const sent=[];
  const session=await createAgentSession({goal:"Read"},{command:async(method,id,args)=>{sent.push({method,args});return method==="create"?{sessionId:"s",observation:{snapshotId:"latest"},capabilities:{methods:["observe"],observations:["subtree"]}}:{snapshotId:"next"};}});
  await session.observe({scope:"subtree",root:"@r1"});
  assert.equal(sent[1].args.snapshotId,"latest");
});
