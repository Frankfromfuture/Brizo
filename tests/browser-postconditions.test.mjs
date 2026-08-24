import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { verifyBrowserActionPostcondition } from "../electron/browser-action-postcondition.mjs";
import { executeBrowserCommandAction, runBrowserCommandAgent } from "../electron/browser-command-agent.mjs";
import {
  parseCtripFlightCommand,
  selectCtripFlights,
  verifyCtripFlightObservation,
  verifyCtripFlightSelection,
  waitForCtripFlightResults,
} from "../electron/ctrip-flight-flow.mjs";
import {
  selectDistinctPriceItems,
  verifyTaobaoPriceObservation,
  verifyTaobaoPriceSelection,
  waitForTaobaoPriceResults,
} from "../electron/taobao-price-flow.mjs";

function page(overrides = {}) {
  return {
    elements: [],
    pageText: "unchanged",
    title: "Example",
    url: "https://example.com/",
    viewport: { scrollY: 0 },
    ...overrides,
  };
}

test("a fill is not verified when the executor claims success but the observed control stayed unchanged", () => {
  const before = page({
    elements: [{ ref: "@e1", tag: "input", type: "text", fieldName: "name", value: "", valueLength: 0 }],
  });
  const verification = verifyBrowserActionPostcondition({
    action: { action: "fill", ref: "@e1", value: "Alice" },
    beforeSnapshot: before,
    afterSnapshot: structuredClone(before),
    outcome: { postcondition: { verified: true } },
  });
  assert.equal(verification.verified, false);
  assert.equal(verification.reason, "snapshot-control-state-mismatch");
});

test("sensitive fill verification uses only hasValue and length", () => {
  const before = page({
    elements: [{ ref: "@e1", tag: "input", type: "password", fieldName: "password", sensitive: true, hasValue: false, valueLength: 0 }],
  });
  const after = page({
    elements: [{ ref: "@e1", tag: "input", type: "password", fieldName: "password", sensitive: true, hasValue: true, valueLength: 12 }],
  });
  const verification = verifyBrowserActionPostcondition({
    action: { action: "fill", ref: "@e1", value: "not-recorded" },
    beforeSnapshot: before,
    afterSnapshot: after,
    outcome: { postcondition: { verified: true } },
  });
  assert.equal(verification.verified, true);
  assert.doesNotMatch(JSON.stringify(verification), /not-recorded/);
});

test("a click with no observable result cannot satisfy a later done claim", async () => {
  const snapshot = page({
    elements: [{ ref: "@e1", domRef: "snapshot-1", tag: "button", type: "button", name: "查看详情", disabled: false }],
  });
  const webContents = {
    executeJavaScript: async (script = "") => {
      if (script.includes("const loginPattern")) return null;
      if (script.includes("const snapshotId")) return structuredClone(snapshot);
      if (script.includes("getBoundingClientRect") && script.includes("data-brizo-agent-ref")) return { x: 20, y: 20 };
      return null;
    },
    getURL: () => snapshot.url,
    isDestroyed: () => false,
    isLoading: () => false,
    sendInputEvent: () => {},
  };
  let plans = 0;
  const result = await runBrowserCommandAgent({
    command: "点击查看详情",
    planNextAction: async () => (++plans === 1
      ? { action: "click", ref: "@e1" }
      : { action: "done", message: "已打开详情" }),
    webContents,
  });
  assert.equal(result.status, "error");
  assert.equal(result.verification.ok, false);
  assert.equal(result.evidenceLedger.find((entry) => entry.action === "click")?.postcondition.verified, false);
});

test("fill executor rejects a controlled input that reverts before verification", async () => {
  const webContents = {
    executeJavaScript: async () => ({ filled: true, matched: false }),
  };
  await assert.rejects(executeBrowserCommandAction({
    action: { action: "fill", ref: "@e1", value: "Alice" },
    command: "填写姓名",
    snapshot: {
      elements: [{ ref: "@e1", domRef: "snapshot-1", tag: "input", type: "text", value: "", disabled: false, readOnly: false }],
    },
    webContents,
  }), /实际值未通过后置验证/);
});

const ctripIntent = parseCtripFlightCommand(
  "查找从北京到上海的 2026-08-11 最便宜机票",
  new Date(2026, 7, 1),
);
const ctripCards = [
  { flightNumber: "KN5977", index: 0, price: 400, times: ["09:00", "11:10"] },
  { flightNumber: "HO1260", index: 1, price: 400, times: ["13:00", "15:05"] },
  { flightNumber: "MU5101", index: 2, price: 460, times: ["16:20", "18:30"] },
];
const ctripResult = {
  cards: ctripCards,
  url: "https://flights.ctrip.com/online/list/oneway-bjs-sha?depdate=2026-08-11",
};

test("Ctrip verifies exact host/path/date and the selected cheapest flights against a fresh observation", () => {
  const selected = selectCtripFlights(ctripCards, ctripIntent);
  assert.equal(verifyCtripFlightObservation(ctripResult, ctripIntent).ok, true);
  assert.equal(verifyCtripFlightSelection(ctripResult, ctripIntent, selected).ok, true);

  const querySpoof = {
    ...ctripResult,
    url: "https://example.com/search?next=oneway-bjs-sha&depdate=2026-08-11",
  };
  assert.equal(verifyCtripFlightObservation(querySpoof, ctripIntent).checks.routeAndDate, false);
  assert.equal(verifyCtripFlightSelection(ctripResult, ctripIntent, [{ ...selected[0], price: 1 }]).ok, false);
});

test("Ctrip wait ignores stable stale-route cards until two consecutive intended observations", async () => {
  const stale = {
    ...ctripResult,
    url: "https://flights.ctrip.com/online/list/oneway-bjs-can?depdate=2026-08-11",
  };
  const reads = [stale, stale, ctripResult, ctripResult];
  let index = 0;
  const result = await waitForCtripFlightResults({
    executeJavaScript: async () => reads[Math.min(index++, reads.length - 1)],
    isDestroyed: () => false,
  }, { expectedIntent: ctripIntent, observationTimeout: 20, pollInterval: 5, timeout: 100 });
  assert.equal(result.url, ctripResult.url);
  assert.equal(index, 4);
});

const taobaoIntent = { query: "背背佳", wantsDistinct: true };
const taobaoItems = [
  { index: 0, price: 89, title: "背背佳 A", url: "https://item.taobao.com/item.htm?id=1" },
  { index: 1, price: 129.9, title: "背背佳 B", url: "https://detail.tmall.com/item.htm?id=2" },
  { index: 2, price: 159, title: "背背佳 C", url: "https://item.taobao.com/item.htm?id=3" },
];
const taobaoResult = {
  items: taobaoItems,
  loginRequired: false,
  url: "https://s.taobao.com/search?q=%E8%83%8C%E8%83%8C%E4%BD%B3",
};

test("Taobao verifies the exact search URL and distinct selected prices against observed cards", () => {
  const selected = selectDistinctPriceItems(taobaoItems, 3);
  assert.equal(verifyTaobaoPriceObservation(taobaoResult, taobaoIntent).ok, true);
  assert.equal(verifyTaobaoPriceSelection(taobaoResult, taobaoIntent, selected, 2).ok, true);
  assert.equal(verifyTaobaoPriceObservation({
    ...taobaoResult,
    url: "https://s.taobao.com/search?q=%E5%85%B6%E4%BB%96",
  }, taobaoIntent).checks.queryUrl, false);
  assert.equal(verifyTaobaoPriceSelection(taobaoResult, taobaoIntent, [
    selected[0],
    { ...selected[1], price: selected[0].price },
  ], 2).checks.distinctPrices, false);
});

test("Taobao wait ignores two stable stale-query observations", async () => {
  const stale = {
    ...taobaoResult,
    url: "https://s.taobao.com/search?q=%E5%85%B6%E4%BB%96",
  };
  const reads = [stale, stale, taobaoResult, taobaoResult];
  let index = 0;
  const result = await waitForTaobaoPriceResults({
    executeJavaScript: async () => reads[Math.min(index++, reads.length - 1)],
    isDestroyed: () => false,
  }, { expectedIntent: taobaoIntent, observationTimeout: 20, pollInterval: 5, timeout: 100 });
  assert.equal(result.url, taobaoResult.url);
  assert.equal(index, 4);
});

test("main requires every success path to carry a passing verification object", async () => {
  const source = await readFile(new URL("../electron/main.mjs", import.meta.url), "utf8");
  assert.match(source, /result\?\.status !== "success"\s*\n\s*\|\| result\?\.verification\?\.ok === true/);
  assert.doesNotMatch(source, /\|\| !result\?\.verification/);
  assert.match(source, /verifyCtripFlightSelection\(finalObservation, intent, flights\)/);
  assert.match(source, /verifyTaobaoPriceSelection\(finalObservation, intent, items, 2\)/);
});
