import assert from "node:assert/strict";
import test from "node:test";

import {
  createSearchShareUrl,
  isZhihuSource,
  languageForInput,
  matchesRequestedLanguage,
  queryFromSearchShareUrl,
} from "../shared/search-text.mjs";
import { makeResult } from "../electron/search/normalize.mjs";
import { createSearchService } from "../electron/search/search-service.mjs";

test("input script, not geography, determines the requested language", () => {
  assert.equal(languageForInput("深圳市的产业结构是什么"), "zh");
  assert.equal(languageForInput("東京の産業はどうなっていますか"), "ja");
  assert.equal(languageForInput("서울의 산업 구조는 무엇인가요"), "ko");
  assert.equal(languageForInput("What is Shenzhen's industrial structure?"), "en");
});

test("the Chinese display gate accepts Chinese and rejects Japanese, Korean, and pure English", () => {
  assert.equal(matchesRequestedLanguage("深圳产业结构持续优化，高新技术产业增长。", "zh"), true);
  assert.equal(matchesRequestedLanguage("深圳產業結構持續優化。", "zh"), true);
  assert.equal(matchesRequestedLanguage("深圳市の産業構造について", "zh"), false);
  assert.equal(matchesRequestedLanguage("선전 산업 구조", "zh"), false);
  assert.equal(matchesRequestedLanguage("Shenzhen industrial structure", "zh"), false);
});

test("a Brizo search share address round-trips the original question", () => {
  const query = "深圳市的产业结构是什么？";
  const address = createSearchShareUrl(query);
  assert.match(address, /^brizo:\/\/search\?/);
  assert.equal(queryFromSearchShareUrl(address), query);
  assert.equal(queryFromSearchShareUrl("https://example.com/?q=test"), "");
});

test("Zhihu is recognized for presentation filtering without excluding it from retrieval", () => {
  assert.equal(isZhihuSource({ domain: "zhihu.com" }), true);
  assert.equal(isZhihuSource({ url: "https://zhuanlan.zhihu.com/p/123" }), true);
  assert.equal(isZhihuSource({ domain: "sz.gov.cn" }), false);
});

test("a Chinese query overrides a mistaken Japanese plan and removes foreign-language sources", async () => {
  const events = [];
  let receivedQueries = [];
  let receivedLocale = null;
  const chineseSource = makeResult({
    title: "深圳市产业结构持续优化",
    url: "https://example.cn/shenzhen-industry",
    snippet: "深圳形成以先进制造业和现代服务业为主体的产业结构。",
    hits: [{ provider: "serper", rank: 0, query: "深圳市的产业结构是什么" }],
  });
  const japaneseSource = makeResult({
    title: "深圳市の産業構造",
    url: "https://example.jp/shenzhen",
    snippet: "ハイテク産業について紹介します。",
    hits: [{ provider: "serper", rank: 1, query: "深圳市の産業構造" }],
  });
  const service = createSearchService({
    answerEngine: {
      async plan() {
        return {
          language: "ja",
          intent: "factual",
          vertical: "web",
          freshness: "any",
          depth: "fast",
          queries: ["深圳市の産業構造", "深圳产业结构 统计公报"],
        };
      },
      async streamAnswer({ onToken }) {
        onToken("深圳产业结构以先进制造业和现代服务业为主体[1]。");
        return { content: "深圳产业结构以先进制造业和现代服务业为主体[1]。" };
      },
      async followups() { return ["深圳先进制造业有哪些？"]; },
    },
    serper: {
      async batchSearch(queries, options) {
        receivedQueries = queries;
        receivedLocale = { gl: options.gl, hl: options.hl };
        return {
          groups: [[japaneseSource, chineseSource]],
          blocks: { peopleAlsoAsk: [], relatedSearches: [] },
        };
      },
    },
    bocha: { async webSearch() { return { results: [], images: [] }; } },
    legacy: { async search() { return { results: [] }; } },
    scrapeCache: { async get() { return null; }, async set() {} },
    hasServiceKey: async (id) => id === "serper",
  });

  const output = await service.run({
    query: "深圳市的产业结构是什么",
    region: { country: "JP", language: "ja" },
  }, {
    emit: (event) => events.push(event),
    signal: new AbortController().signal,
  });

  assert.deepEqual(receivedLocale, { gl: "cn", hl: "zh-cn" });
  assert.deepEqual(receivedQueries, ["深圳市的产业结构是什么", "深圳产业结构 统计公报"]);
  assert.equal(events.find((event) => event.type === "plan")?.language, "zh");
  assert.equal(output.sources.length, 1);
  assert.equal(output.sources[0].title, "深圳市产业结构持续优化");
  assert.doesNotMatch(JSON.stringify(output), /[\u3040-\u30ff\u31f0-\u31ff]/);
});
