import assert from "node:assert/strict";
import test from "node:test";
import {
  executeBrowserCommandAction,
  parseBrowserCommandAction,
  readBrowserActionCandidates,
  runBrowserCommandAgent,
} from "../electron/browser-command-agent.mjs";
import {
  buildCtripFlightUrl,
  collectCtripFlightResults,
  parseCtripFlightCommand,
  selectCtripFlights,
  selectCheapestFlights,
  waitForCtripFlightResults,
} from "../electron/ctrip-flight-flow.mjs";
import {
  buildTaobaoSearchUrl,
  parseTaobaoPriceCommand,
  selectDistinctPriceItems,
  taobaoQueryFromUrl,
  waitForTaobaoPriceResults,
} from "../electron/taobao-price-flow.mjs";
import { stripTrailingLinkPunctuation } from "../shared/browser-input.mjs";

function mockWebContents(snapshot = { elements: [], pageText: "", title: "Test", url: "https://example.com/" }) {
  const inputs = [];
  return {
    inputs,
    executeJavaScript: async () => snapshot,
    isDestroyed: () => false,
    isLoading: () => false,
    sendInputEvent: (event) => inputs.push(event),
  };
}

test("stops immediately when the planner reports the bounded goal complete", async () => {
  const webContents = mockWebContents();
  const result = await runBrowserCommandAgent({
    command: "读取当前标题",
    planNextAction: async () => ({ action: "done", message: "已读取。" }),
    webContents,
  });
  assert.equal(result.status, "success");
  assert.equal(result.steps, 0);
  assert.equal(result.message, "已读取。");
});

test("blocks an external-impact click unless the command explicitly requests it", async () => {
  const webContents = mockWebContents();
  const snapshot = {
    elements: [{ disabled: false, name: "删除账户", ref: "@e1", x: 20, y: 20 }],
  };
  const result = await executeBrowserCommandAction({
    action: { action: "click", ref: "@e1" },
    command: "检查账户设置",
    snapshot,
    webContents,
  });
  assert.equal(result.status, "needs-confirmation");
  assert.equal(webContents.inputs.length, 0);
});

test("permits an explicitly requested external-impact click", async () => {
  const webContents = mockWebContents();
  const snapshot = {
    elements: [{ disabled: false, name: "提交表单", ref: "@e1", x: 20, y: 20 }],
  };
  const result = await executeBrowserCommandAction({
    action: { action: "click", ref: "@e1" },
    command: "填写完成后提交表单",
    snapshot,
    webContents,
  });
  assert.equal(result.status, "continued");
  assert.equal(webContents.inputs.filter((event) => event.type === "mouseDown").length, 1);
});

test("rejects navigation outside http and https", async () => {
  const webContents = mockWebContents();
  await assert.rejects(
    executeBrowserCommandAction({
      action: { action: "navigate", url: "file:///etc/passwd" },
      command: "打开文件",
      snapshot: { elements: [] },
      webContents,
    }),
    /只能导航到 http 或 https/,
  );
});

test("parses a fenced JSON action surrounded by model prose", () => {
  const action = parseBrowserCommandAction(`我将执行以下动作：\n\`\`\`json\n{"action":"click","ref":"@e2"}\n\`\`\``);
  assert.deepEqual(action, { action: "click", ref: "@e2" });
});

test("ignores reasoning blocks and braces inside JSON strings", () => {
  const action = parseBrowserCommandAction('<think>{not json}</think>结果：{"action":"done","message":"已读取 {标题}"}');
  assert.deepEqual(action, { action: "done", message: "已读取 {标题}" });
});

test("reads tool-call and Responses API browser actions", () => {
  const toolCall = readBrowserActionCandidates({
    choices: [{ message: { tool_calls: [{ function: { arguments: '{"action":"reload"}' } }] } }],
  });
  const responseOutput = readBrowserActionCandidates({
    output: [{ content: [{ type: "output_text", text: '{"action":"back"}' }] }],
  });
  assert.equal(parseBrowserCommandAction(toolCall[0]).action, "reload");
  assert.equal(parseBrowserCommandAction(responseOutput[0]).action, "back");
});

test("reads legacy function arguments and object content from compatible providers", () => {
  const legacy = readBrowserActionCandidates({
    choices: [{ message: { function_call: { arguments: '{"action":"forward"}' } } }],
  });
  const objectContent = readBrowserActionCandidates({
    choices: [{ message: { content: { action: "scroll", amount: 480 } } }],
  });
  assert.equal(parseBrowserCommandAction(legacy[0]).action, "forward");
  assert.deepEqual(parseBrowserCommandAction(objectContent[0]), { action: "scroll", amount: 480 });
});

test("reads providers that place the final action in analysis fields", () => {
  const candidates = readBrowserActionCandidates({
    choices: [{ message: { analysis: '{"action":"done","message":"完成"}' } }],
  });
  assert.deepEqual(parseBrowserCommandAction(candidates[0]), { action: "done", message: "完成" });
});

test("rejects unsupported or non-JSON browser actions", () => {
  assert.throws(() => parseBrowserCommandAction("点击第二个按钮"), /有效的 JSON/);
  assert.throws(() => parseBrowserCommandAction('{"action":"runScript"}'), /有效的 JSON/);
});

test("gives the planner one final completion check after the action budget", async () => {
  const snapshot = {
    elements: [{ disabled: false, name: "名称", ref: "@e1", value: "", x: 20, y: 20 }],
    pageText: "",
    title: "Test",
    url: "https://example.com/",
  };
  const webContents = mockWebContents(snapshot);
  let calls = 0;
  const result = await runBrowserCommandAgent({
    command: "填写名称",
    maxSteps: 2,
    planNextAction: async () => {
      calls += 1;
      return calls <= 2
        ? { action: "fill", ref: "@e1", value: `测试${calls}` }
        : { action: "done", message: "填写完成。" };
    },
    webContents,
  });
  assert.equal(calls, 3);
  assert.equal(result.status, "success");
  assert.equal(result.steps, 2);
});

test("does not refill a control whose current value already matches", async () => {
  const webContents = mockWebContents();
  const result = await executeBrowserCommandAction({
    action: { action: "fill", ref: "@e1", value: "Brizo" },
    command: "填写名称",
    snapshot: { elements: [{ name: "名称", ref: "@e1", value: "Brizo" }] },
    webContents,
  });
  assert.equal(result.result, "already-satisfied");
  assert.equal(webContents.inputs.length, 0);
});

test("parses a relative-date Ctrip cheapest-flight command deterministically", () => {
  const intent = parseCtripFlightCommand(
    "查找从北京到上海的后天最便宜的机票",
    new Date(2026, 7, 9, 9, 30),
  );
  assert.equal(intent.origin.code, "BJS");
  assert.equal(intent.destination.code, "SHA");
  assert.equal(intent.date, "2026-08-11");
  assert.equal(intent.wantsCheapest, true);
  assert.equal(
    buildCtripFlightUrl(intent),
    "https://flights.ctrip.com/online/list/oneway-bjs-sha?depdate=2026-08-11",
  );
});

test("keeps every flight tied at the minimum displayed price", () => {
  const cheapest = selectCheapestFlights([
    { flightNumber: "KN5977", price: 400 },
    { flightNumber: "HO1260", price: 400 },
    { flightNumber: "MU0001", price: 420 },
  ]);
  assert.equal(cheapest.price, 400);
  assert.deepEqual(cheapest.flights.map((flight) => flight.flightNumber), ["KN5977", "HO1260"]);
});

test("parses next Wednesday, route markers after a time range, and an afternoon window", () => {
  const intent = parseCtripFlightCommand(
    "帮我去携程查下周三下午2 点到 8 点机票，从上海到青岛",
    new Date(2026, 7, 9, 9, 30),
  );
  assert.equal(intent.origin.code, "SHA");
  assert.equal(intent.destination.code, "TAO");
  assert.equal(intent.date, "2026-08-12");
  assert.deepEqual(intent.departureWindow, { start: 840, end: 1200, label: "14:00–20:00" });
  assert.equal(intent.wantsCheapest, false);
});

test("filters Ctrip cards to the requested departure window", () => {
  const flights = selectCtripFlights([
    { flightNumber: "A", price: 500, times: ["13:55", "15:20"] },
    { flightNumber: "B", price: 600, times: ["14:00", "15:30"] },
    { flightNumber: "C", price: 700, times: ["20:00", "21:30"] },
    { flightNumber: "D", price: 800, times: ["20:05", "21:35"] },
  ], { departureWindow: { start: 840, end: 1200 } });
  assert.deepEqual(flights.map((flight) => flight.flightNumber), ["B", "C"]);
});

test("Ctrip observation cannot hang when the page never answers", async () => {
  const webContents = {
    executeJavaScript: () => new Promise(() => {}),
    isDestroyed: () => false,
  };
  const startedAt = Date.now();
  await assert.rejects(
    waitForCtripFlightResults(webContents, {
      observationTimeout: 15,
      pollInterval: 10,
      timeout: 55,
    }),
    /限定时间内/,
  );
  assert.ok(Date.now() - startedAt < 250);
});

test("Ctrip observation returns after two stable result reads", async () => {
  const pageResult = {
    cards: [{ flightNumber: "KN5977", index: 0, price: 400 }],
    title: "北京到上海机票",
    url: "https://flights.ctrip.com/online/list/oneway-bjs-sha?depdate=2026-08-11",
  };
  let reads = 0;
  const result = await waitForCtripFlightResults({
    executeJavaScript: async () => {
      reads += 1;
      return pageResult;
    },
    isDestroyed: () => false,
  }, { observationTimeout: 20, pollInterval: 10, timeout: 100 });
  assert.equal(result.cards[0].price, 400);
  assert.equal(reads, 2);
});

test("Ctrip lazy-result collection cannot hang when the page stops answering", async () => {
  const startedAt = Date.now();
  const result = await collectCtripFlightResults({
    executeJavaScript: () => new Promise(() => {}),
    isDestroyed: () => false,
  }, { pollInterval: 10, timeout: 55 });
  assert.equal(result, null);
  assert.ok(Date.now() - startedAt < 250);
});

test("strips pasted sentence punctuation from a web URL", () => {
  const url = "https://s.taobao.com/search?q=%E8%83%8C%E8%83%8C%E4%BD%B3&usePreLoad=true，";
  assert.equal(
    stripTrailingLinkPunctuation(url),
    "https://s.taobao.com/search?q=%E8%83%8C%E8%83%8C%E4%BD%B3&usePreLoad=true",
  );
  assert.equal(stripTrailingLinkPunctuation("帮我搜索背背佳，"), "帮我搜索背背佳，");
  assert.equal(
    stripTrailingLinkPunctuation("https://s.taobao.com/search?q=x&usePreLoad=true%EF%BC%8C"),
    "https://s.taobao.com/search?q=x&usePreLoad=true",
  );
});

test("parses a Taobao distinct-price request from the current search", () => {
  const currentUrl = "https://s.taobao.com/search?q=%E8%83%8C%E8%83%8C%E4%BD%B3";
  const intent = parseTaobaoPriceCommand("帮我搜几个不同的背背佳的价格", currentUrl);
  assert.equal(intent.query, "背背佳");
  assert.equal(intent.wantsDistinct, true);
  assert.equal(taobaoQueryFromUrl(currentUrl), "背背佳");
  assert.equal(buildTaobaoSearchUrl(intent.query), currentUrl);
});

test("selects unique Taobao prices without sorting away page order", () => {
  const selected = selectDistinctPriceItems([
    { price: 89, title: "A" },
    { price: 89, title: "B" },
    { price: 129.9, title: "C" },
    { price: 59, title: "D" },
  ], 3);
  assert.deepEqual(selected.map((item) => item.price), [89, 129.9, 59]);
});

test("Taobao observation cannot hang when the page never answers", async () => {
  const startedAt = Date.now();
  await assert.rejects(
    waitForTaobaoPriceResults({
      executeJavaScript: () => new Promise(() => {}),
      isDestroyed: () => false,
    }, { observationTimeout: 15, pollInterval: 10, timeout: 55 }),
    /没有成功打开|自动停止/,
  );
  assert.ok(Date.now() - startedAt < 250);
});
