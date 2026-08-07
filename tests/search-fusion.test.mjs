import assert from "node:assert/strict";
import test from "node:test";

import {
  applyRerankOrder,
  authorityFactor,
  bm25Factor,
  fuseResults,
  isEntityOfficialSource,
  recencyFactor,
  sourceAuthorityTier,
} from "../electron/search/fusion.mjs";
import { dedupeResults, makeResult, mergeResults } from "../electron/search/normalize.mjs";
import { tokenize } from "../shared/search-text.mjs";

const NOW = Date.parse("2026-08-04T00:00:00Z");

const result = (partial) => makeResult({
  title: "标题",
  snippet: "摘要",
  ...partial,
});

test("dedupes URL variants that differ only by tracking params, slash, scheme, or host prefix", () => {
  const merged = dedupeResults([
    result({ url: "https://ex.com/a?utm_source=x&b=2#frag", hits: [{ provider: "serper", rank: 0, query: "q" }] }),
    result({ url: "http://www.ex.com/a/?b=2", hits: [{ provider: "bocha", rank: 3, query: "q" }] }),
    result({ url: "https://m.ex.com/a?b=2&fbclid=zz", hits: [{ provider: "legacy", rank: 5, query: "q" }] }),
  ]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].hits.length, 3, "all provider hits are preserved on the survivor");
});

test("merging keeps the longer summary and the higher-confidence timestamp", () => {
  const serper = result({
    url: "https://ex.com/a",
    snippet: "短摘要",
    publishedAt: "2026-08-01T00:00:00.000Z",
    publishedConfidence: 0.6,
    hits: [{ provider: "serper", rank: 0, query: "q" }],
  });
  const bocha = result({
    url: "https://ex.com/a",
    summary: "这是一段长得多的正文摘要".repeat(10),
    publishedAt: "2026-08-02T09:30:00.000Z",
    publishedConfidence: 1,
    hits: [{ provider: "bocha", rank: 2, query: "q" }],
  });
  const merged = mergeResults(serper, bocha);
  assert.ok(merged.summary.length > 100, "Bocha's long summary survives the merge");
  assert.equal(merged.publishedConfidence, 1);
  assert.equal(merged.publishedAt, "2026-08-02T09:30:00.000Z");
});

test("BM25 does not reward a longer field for the same term density", () => {
  // The exact failure of the old `matches * 4` scorer: identical relevance, but one
  // document repeats the surrounding prose so its raw term count is far higher.
  const tokens = tokenize("量子计算");
  const short = result({ url: "https://a.com/1", title: "量子计算", snippet: "量子计算简介" });
  const long = result({
    url: "https://b.com/1",
    title: "量子计算",
    snippet: "量子计算简介",
    summary: `量子计算的背景说明。${"这是与问题无关的补充描述。".repeat(40)}`,
  });

  const averageLength = 80;
  const shortScore = bm25Factor(tokens, short, averageLength);
  const longScore = bm25Factor(tokens, long, averageLength);
  assert.ok(
    longScore <= shortScore + 1e-9,
    `padding must not raise the score (short=${shortScore}, long=${longScore})`,
  );
});

test("recency boost is damped by timestamp confidence", () => {
  const fresh = { publishedAt: new Date(NOW - 3_600_000).toISOString(), publishedConfidence: 1 };
  const guessed = { publishedAt: new Date(NOW - 3_600_000).toISOString(), publishedConfidence: 0.6 };
  const exact = recencyFactor(fresh, "day", NOW);
  const fuzzy = recencyFactor(guessed, "day", NOW);
  assert.ok(exact > fuzzy, "an exact timestamp outweighs a parsed relative one");
  assert.equal(recencyFactor(fresh, "any", NOW), 1, "no recency weighting when freshness is 'any'");
});

test("a fresh result outranks a stale higher-ranked one when freshness is 'day'", () => {
  const stale = result({
    url: "https://stale.com/a",
    title: "英伟达 财报",
    snippet: "英伟达 财报 分析",
    publishedAt: new Date(NOW - 400 * 86_400_000).toISOString(),
    publishedConfidence: 1,
    hits: [{ provider: "serper", rank: 0, query: "英伟达 财报" }],
  });
  const fresh = result({
    url: "https://fresh.com/a",
    title: "英伟达 财报",
    snippet: "英伟达 财报 分析",
    publishedAt: new Date(NOW - 2 * 3_600_000).toISOString(),
    publishedConfidence: 1,
    hits: [{ provider: "bocha", rank: 4, query: "英伟达 财报" }],
  });
  const fused = fuseResults([stale, fresh], { query: "英伟达 财报", freshness: "day", now: NOW });
  assert.equal(fused[0].domain, "fresh.com");
});

test("a result found by two providers outranks an equal result found by one", () => {
  const both = result({
    url: "https://both.com/a",
    title: "量子计算 是什么",
    snippet: "量子计算 是什么 介绍",
    hits: [
      { provider: "serper", rank: 2, query: "量子计算" },
      { provider: "bocha", rank: 2, query: "量子计算" },
    ],
  });
  const single = result({
    url: "https://single.com/a",
    title: "量子计算 是什么",
    snippet: "量子计算 是什么 介绍",
    hits: [{ provider: "serper", rank: 2, query: "量子计算" }],
  });
  const fused = fuseResults([both, single], { query: "量子计算", now: NOW });
  assert.equal(fused[0].domain, "both.com");
});

test("caps results per domain", () => {
  // Titles must be genuinely unrelated, otherwise title clustering collapses them
  // before the domain cap is ever reached.
  const titles = [
    "量子计算入门指南",
    "英伟达发布新一代显卡",
    "上海地铁运营时间调整",
    "咖啡烘焙曲线详解",
    "南极冰盖融化最新观测",
  ];
  const results = titles.map((title, index) => result({
    url: `https://same.com/${index}`,
    title,
    snippet: title,
    hits: [{ provider: "serper", rank: index, query: "q" }],
  }));
  const fused = fuseResults(results, { query: "q", now: NOW, perDomain: 2 });
  assert.equal(fused.filter((item) => item.domain === "same.com").length, 2);
});

test("content farms are demoted and primary sources promoted", () => {
  assert.ok(authorityFactor("coursehero.com") < 1);
  assert.ok(authorityFactor("en.wikipedia.org") > 1, "subdomains match the promoted entry");
  assert.equal(authorityFactor("example.com"), 1);
});

test("source authority tiers classify official, major media, and other sources", () => {
  assert.equal(sourceAuthorityTier(result({ url: "https://www.stats.gov.cn/data" }), "人口数据"), 0);
  assert.equal(sourceAuthorityTier(result({ url: "https://www.deepseek.com/news", title: "DeepSeek 官方网站" }), "DeepSeek V4"), 0);
  assert.equal(sourceAuthorityTier(result({ url: "https://tica.org/breeds", siteName: "The International Cat Association" }), "英短三花猫"), 0);
  assert.equal(sourceAuthorityTier(result({ url: "https://www.reuters.com/world/story" }), "国际新闻"), 1);
  assert.equal(sourceAuthorityTier(result({ url: "https://example.com/post" }), "国际新闻"), 2);
});

test("short product brands resolve their exact first-party domain as official", () => {
  const official = result({
    url: "https://v0.app/community",
    title: "Community - v0 by Vercel",
    snippet: "Explore what the v0 community is building",
  });
  const thirdParty = result({
    url: "https://v0zh.cn/community",
    title: "v0.app 中文社区",
    snippet: "中文学习资源与案例分享",
  });
  assert.equal(isEntityOfficialSource(official, "v0 社区"), true);
  assert.equal(isEntityOfficialSource(thirdParty, "v0 社区"), false);
  assert.equal(sourceAuthorityTier(official, "v0 社区"), 0);
  assert.equal(sourceAuthorityTier(thirdParty, "v0 社区"), 2);
});

test("an exact entity official domain always sorts before third-party commentary", () => {
  const thirdParty = result({
    url: "https://ucloud.cn/yun/123.html",
    title: "网页开发助手 v0 社区介绍",
    snippet: "v0 社区评论",
    hits: [{ provider: "serper", rank: 0, query: "v0 社区" }],
  });
  const official = result({
    url: "https://v0.app/community",
    title: "Community - v0 by Vercel",
    snippet: "Explore what our community is building",
    hits: [{ provider: "serper", rank: 9, query: "v0 社区 官方网站" }],
  });
  const fused = fuseResults([thirdParty, official], { query: "v0 社区", now: NOW });
  assert.equal(fused[0].domain, "v0.app");
});

test("official sources sort before authoritative media and other results", () => {
  const other = result({
    url: "https://example.com/industry",
    title: "大湾区城市发展随笔",
    snippet: "深圳 产业 数据",
    hits: [{ provider: "serper", rank: 0, query: "深圳产业数据" }],
  });
  const media = result({
    url: "https://www.reuters.com/world/china/industry",
    title: "路透观察深圳制造业",
    snippet: "深圳 产业 数据",
    hits: [{ provider: "serper", rank: 5, query: "深圳产业数据" }],
  });
  const official = result({
    url: "https://www.stats.gov.cn/sj/industry",
    title: "深圳市统计局发布产业数据",
    snippet: "深圳 产业 数据",
    hits: [{ provider: "serper", rank: 9, query: "深圳产业数据" }],
  });
  const fused = fuseResults([other, media, official], {
    query: "深圳产业数据",
    now: NOW,
    perDomain: 2,
  });
  assert.deepEqual(fused.map((item) => item.domain), [
    "stats.gov.cn",
    "reuters.com",
    "example.com",
  ]);
});

test("a malformed rerank order never drops or duplicates results", () => {
  const items = [{ id: 0 }, { id: 1 }, { id: 2 }];
  assert.deepEqual(applyRerankOrder(items, [2, 0]).map((i) => i.id), [2, 0, 1]);
  assert.deepEqual(applyRerankOrder(items, [9, -1, "x"]).map((i) => i.id), [0, 1, 2]);
  assert.deepEqual(applyRerankOrder(items, [1, 1, 1]).map((i) => i.id), [1, 0, 2]);
  assert.deepEqual(applyRerankOrder(items, null).map((i) => i.id), [0, 1, 2]);
});

test("results without a usable http URL are discarded", () => {
  const fused = fuseResults([
    result({ url: "mailto:someone@example.com", hits: [{ provider: "serper", rank: 0, query: "q" }] }),
    result({ url: "https://ok.com/a", hits: [{ provider: "serper", rank: 1, query: "q" }] }),
  ], { query: "q", now: NOW });
  assert.equal(fused.length, 1);
  assert.equal(fused[0].domain, "ok.com");
});

test("near-duplicate coverage collapses into one result with alsoCoveredBy", () => {
  const fused = fuseResults([
    result({
      url: "https://a.com/1",
      title: "DeepSeek V4 正式发布并同步开源",
      hits: [{ provider: "serper", rank: 0, query: "q" }],
    }),
    result({
      url: "https://b.com/1",
      title: "DeepSeek V4 正式发布 并同步开源",
      hits: [{ provider: "bocha", rank: 1, query: "q" }],
    }),
  ], { query: "DeepSeek V4", now: NOW });
  assert.equal(fused.length, 1);
  assert.equal(fused[0].alsoCoveredBy.length, 1);
});
