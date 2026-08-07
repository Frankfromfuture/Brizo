import assert from "node:assert/strict";
import test from "node:test";

import { makeResult } from "../electron/search/normalize.mjs";
import { createSearchService, officialIntentQuery } from "../electron/search/search-service.mjs";

const result = (provider, rank, url, title) => makeResult({
  url,
  title,
  snippet: `${title} 的真实摘要`,
  hits: [{ provider, rank, query: "问题" }],
});

function makeHarness({ keys = ["serper", "bocha"], failProfessional = false, hangProfessional = false } = {}) {
  const events = [];
  let answerCalls = 0;
  let legacyCalls = 0;
  const answerEngine = {
    async plan(_query, { depth }) {
      return {
        language: "zh",
        intent: "news",
        vertical: "news",
        freshness: "week",
        depth: depth === "auto" ? "balanced" : depth,
        queries: ["问题", "问题 最新"],
      };
    },
    async streamAnswer({ onToken }) {
      answerCalls += 1;
      onToken("# 问题\n\n结论来自第二个来源[2]，也参考第一个来源[1]。");
      return { content: "# 问题\n\n结论来自第二个来源[2]，也参考第一个来源[1]。" };
    },
    async followups() {
      return ["追问一？", "追问二？", "追问三？", "追问四？", "追问五？"];
    },
  };
  const serper = {
    async batchSearch() {
      if (hangProfessional) return new Promise((_resolve, reject) => {
        arguments[0];
        const options = arguments[1] || {};
        options.signal?.addEventListener("abort", () => reject(new Error("serper timed out")), { once: true });
      });
      if (failProfessional) throw new Error("serper down");
      return {
        groups: [[result("serper", 0, "https://one.example/a", "来源一")]],
        blocks: { peopleAlsoAsk: [], relatedSearches: [] },
      };
    },
    async scrape(url) {
      return { markdown: `full text for ${url}`, metadata: {} };
    },
    async vertical() {
      return { kind: "news", items: [{ title: "新闻卡", url: "https://cards.example" }] };
    },
  };
  const bocha = {
    async webSearch() {
      if (hangProfessional) return new Promise((_resolve, reject) => {
        const options = arguments[1] || {};
        options.signal?.addEventListener("abort", () => reject(new Error("bocha timed out")), { once: true });
      });
      if (failProfessional) throw new Error("bocha down");
      return { results: [result("bocha", 0, "https://two.example/b", "来源二")], images: [] };
    },
  };
  const legacy = {
    async search() {
      legacyCalls += 1;
      return { results: [result("legacy", 0, "https://legacy.example", "公开结果")] };
    },
  };
  const cache = {
    async get() { return null; },
    async set() {},
  };
  const service = createSearchService({
    answerEngine,
    serper,
    bocha,
    legacy,
    scrapeCache: cache,
    hasServiceKey: async (id) => keys.includes(id),
    retrievalTimeoutMs: 25,
  });
  return {
    answerCalls: () => answerCalls,
    events,
    legacyCalls: () => legacyCalls,
    run: (payload = {}) => service.run({ query: "问题", depth: "auto", ...payload }, {
      emit: (event) => events.push(event),
      signal: new AbortController().signal,
    }),
  };
}

test("emits sources before answer tokens and preserves authority-ranked citation numbers", async () => {
  const harness = makeHarness();
  const output = await harness.run();
  const sourceEvent = harness.events.findIndex((event) => event.type === "sources");
  const tokenEvent = harness.events.findIndex((event) => event.type === "token");
  assert.ok(sourceEvent >= 0 && tokenEvent > sourceEvent);
  assert.equal(output.status, "success");
  assert.equal(output.grounded, true);
  assert.equal(output.sources[0].domain, "one.example", "model citation order must not reorder ranked sources");
  assert.match(output.message, /\[2\].*\[1\]/);
  assert.doesNotMatch(output.message, /^#\s/m);
  assert.equal(output.relatedQuestions.length, 5);
  assert.equal(harness.answerCalls(), 1);
});

test("navigational community queries reserve an official-site retrieval query", () => {
  assert.equal(officialIntentQuery("v0 社区"), "v0 社区 官方网站");
  assert.equal(officialIntentQuery("OpenAI docs"), "OpenAI docs official website");
  assert.equal(officialIntentQuery("深圳市的产业结构是什么"), "");
});

test("manual depth overrides the planner and controls scraping", async () => {
  const harness = makeHarness();
  const output = await harness.run({ depth: "fast" });
  assert.equal(output.depth, "fast");
  assert.equal(harness.events.some((event) => event.stage === "reading"), false);
});

test("when configured professional retrieval entirely fails, synthesis is never called", async () => {
  const harness = makeHarness({ failProfessional: true });
  await assert.rejects(() => harness.run(), /down/);
  assert.equal(harness.answerCalls(), 0);
  assert.equal(harness.legacyCalls(), 0, "a configured-but-failed service is not silently replaced");
});

test("the retrieval stage watchdog prevents provider promises from hanging forever", async () => {
  const harness = makeHarness({ hangProfessional: true });
  const startedAt = Date.now();
  await assert.rejects(() => harness.run(), /timed out/);
  assert.ok(Date.now() - startedAt < 250);
  assert.equal(harness.answerCalls(), 0);
});

test("when no professional key exists, real public retrieval is used and disclosed", async () => {
  const harness = makeHarness({ keys: [] });
  const output = await harness.run({ depth: "fast" });
  assert.equal(output.degraded, true);
  assert.equal(harness.legacyCalls(), 2, "every same-language planned query is searched in parallel");
  assert.ok(harness.events.some((event) => event.type === "notice"));
});
