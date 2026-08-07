import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  allocateStorySlots,
  briefSourcePriority,
  buildSupplementalFeeds,
  createExtractiveSummary,
  createBriefService,
  getEditionDescriptor,
  groundModelTopics,
  inferTopicsFromSignals,
  isAllowedBriefSource,
  isLowQualityBriefResult,
  isLikelyArticleUrl,
  scoreBriefSignals,
  selectFrontStories,
  selectTopics,
} from "../electron/brief-service.mjs";

function localTime(year, month, day, hour, minute) {
  return new Date(year, month - 1, day, hour, minute).getTime();
}

function createRssFetchFixture({ chinese = true } = {}) {
  const domains = [
    "reuters.com", "apnews.com", "bbc.com", "bloomberg.com", "ft.com",
    "nytimes.com", "caixin.com", "thepaper.cn", "xinhuanet.com", "techcrunch.com",
    "nature.com", "wsj.com", "scmp.com", "yicai.com", "36kr.com", "espn.com",
  ];
  let feedCalls = 0;
  let articleCalls = 0;
  const fetch = async (input) => {
    const url = String(input);
    if (/rss-article-/i.test(url)) {
      articleCalls += 1;
      return new Response("<!doctype html><html><head><meta property=\"og:image\" content=\"https://images.example/rss.jpg\"></head></html>", {
        headers: { "content-type": "text/html" },
        status: 200,
      });
    }
    feedCalls += 1;
    const items = Array.from({ length: 4 }, (_, index) => {
      const domain = domains[(feedCalls + index) % domains.length];
      const id = `${feedCalls}-${index}`;
      const title = chinese ? `微软公司发布 RSS 产品更新 ${id}` : `Microsoft releases RSS product update ${id}`;
      const body = chinese
        ? `微软公司通过出版商 RSS 发布产品更新 ${id}，正文包含具体公司、发布时间和功能变化。`
        : `Microsoft published product update ${id} through its publisher RSS feed with release timing and feature details.`;
      return `<item><title>${title}</title><link>https://www.${domain}/world/rss-article-${id}-2026-08-03/</link><description><![CDATA[${body}]]></description><pubDate>Mon, 03 Aug 2026 06:00:00 GMT</pubDate><enclosure type="image/jpeg" url="https://images.example/${id}.jpg" /></item>`;
    }).join("");
    return new Response(`<?xml version="1.0"?><rss><channel>${items}</channel></rss>`, {
      headers: { "content-type": "application/rss+xml" },
      status: 200,
    });
  };
  return { fetch, stats: () => ({ articleCalls, feedCalls }) };
}

test("edition boundaries follow local 09:00 and 18:00 schedule", () => {
  assert.equal(getEditionDescriptor(localTime(2026, 8, 2, 8, 59)).kind, "overnight");
  assert.equal(getEditionDescriptor(localTime(2026, 8, 2, 9, 0)).kind, "morning");
  assert.equal(getEditionDescriptor(localTime(2026, 8, 2, 17, 59)).kind, "morning");
  assert.equal(getEditionDescriptor(localTime(2026, 8, 2, 18, 0)).kind, "evening");
});

test("supplemental feeds include Horizon presets and only accept local HTTP or HTTPS RSSHub bases", () => {
  const local = buildSupplementalFeeds({ BRIZO_RSSHUB_BASE_URL: "http://127.0.0.1:1200/" });
  assert.ok(local.some((feed) => feed.sourceAdapter === "horizon-preset"));
  assert.ok(local.some((feed) => feed.url === "http://127.0.0.1:1200/reuters/world" && feed.sourceAdapter === "rsshub"));
  const remote = buildSupplementalFeeds({ BRIZO_RSSHUB_BASE_URL: "https://rsshub.example.com/base/" });
  assert.ok(remote.some((feed) => feed.url === "https://rsshub.example.com/base/reuters/world"));
  const rejected = buildSupplementalFeeds({ BRIZO_RSSHUB_BASE_URL: "http://rsshub.example.com" });
  assert.equal(rejected.some((feed) => feed.sourceAdapter === "rsshub"), false);
});

test("signal scoring favors bookmarks and recent question intent", () => {
  const now = localTime(2026, 8, 2, 12, 0);
  const scored = scoreBriefSignals({
    bookmarks: [{ title: "AI infrastructure", updatedAt: now }],
    history: [{ title: "AI infrastructure", updatedAt: now, visits: 1 }],
    searches: [{ query: "AI infrastructure outlook", updatedAt: now, count: 1 }],
  }, now);
  const bookmark = scored.find((item) => item.kind === "bookmark");
  const history = scored.find((item) => item.kind === "history");
  const search = scored.find((item) => item.kind === "search");
  assert.ok(bookmark.score > search.score);
  assert.ok(search.score > history.score);
});

test("signal families are normalized so bookmark volume cannot monopolize the profile", () => {
  const now = localTime(2026, 8, 2, 12, 0);
  const scored = scoreBriefSignals({
    bookmarks: Array.from({ length: 300 }, (_, index) => ({ title: `Bookmark ${index}`, updatedAt: now })),
    history: Array.from({ length: 20 }, (_, index) => ({ title: `History ${index}`, updatedAt: now })),
    searches: [{ query: "semiconductor outlook", updatedAt: now }],
  }, now);
  const totals = Object.fromEntries(["bookmark", "search", "history"].map((kind) => [
    kind,
    scored.filter((signal) => signal.kind === kind).reduce((sum, signal) => sum + signal.score, 0),
  ]));
  assert.ok(totals.bookmark < 50);
  assert.ok(totals.search > 30);
  assert.ok(totals.history >= 19);
});

test("topic selection keeps 3 to 6 topics and honors pin and mute", () => {
  const topics = Array.from({ length: 8 }, (_, index) => ({
    id: `topic-${index}`,
    label: `主题 ${index}`,
    query: `query ${index}`,
    weight: index === 7 ? 0.01 : 0.14,
  }));
  const selected = selectTopics(topics, {
    mutedTopicIds: ["topic-0"],
    pinnedTopicIds: ["topic-7"],
  });
  assert.ok(selected.length >= 3 && selected.length <= 6);
  assert.equal(selected.some((topic) => topic.id === "topic-0"), false);
  assert.equal(selected.some((topic) => topic.id === "topic-7"), true);
});

test("reduced topics remain available with a lower normalized weight", () => {
  const topics = [
    { id: "alpha", label: "Alpha", weight: 0.4 },
    { id: "beta", label: "Beta", weight: 0.35 },
    { id: "gamma", label: "Gamma", weight: 0.25 },
  ];
  const selected = selectTopics(topics, { reducedTopicIds: ["alpha"] });
  assert.ok(selected.find((topic) => topic.id === "alpha").weight < selected.find((topic) => topic.id === "beta").weight);
});

test("local fast topic inference stays personalized without a model round trip", () => {
  const topics = inferTopicsFromSignals([
    { domain: "example.com", kind: "search", score: 12, text: "AI 芯片与数据中心能源" },
    { domain: "example.com", kind: "bookmark", score: 10, text: "人工智能模型基础设施" },
    { domain: "example.com", kind: "history", score: 1, text: "全球市场" },
  ]);
  assert.equal(topics[0].id, "technology");
  assert.ok(topics.length >= 3 && topics.length <= 6);
});

test("model topics without supporting user signals are rejected and near-duplicates do not dominate", () => {
  const signals = [
    { kind: "search", score: 35, text: "AI 芯片与数据中心能源", domain: "example.com" },
    { kind: "bookmark", score: 20, text: "全球奢侈品品牌与消费市场", domain: "example.com" },
    { kind: "history", score: 12, text: "资本市场和公司估值", domain: "example.com" },
  ];
  const topics = groundModelTopics([
    { id: "protein-structure", label: "蛋白质结构预测", query: "蛋白质结构预测", evidenceTerms: ["蛋白质"], weight: 0.8 },
    { id: "protein-design", label: "AI 蛋白质设计", query: "AI 蛋白质设计", evidenceTerms: ["蛋白质设计"], weight: 0.1 },
    { id: "protein-model", label: "蛋白质语言模型", query: "蛋白质语言模型", evidenceTerms: ["蛋白质语言"], weight: 0.1 },
  ], signals);
  assert.equal(topics.some((topic) => /蛋白质/.test(topic.label)), false);
  assert.ok(Math.max(...topics.map((topic) => topic.weight)) <= 0.451);
});

test("topic concentration is capped even when a model assigns an extreme weight", () => {
  const selected = selectTopics([
    { id: "ai", label: "AI 与科技", weight: 0.98 },
    { id: "markets", label: "商业市场", weight: 0.01 },
    { id: "world", label: "国际事务", weight: 0.01 },
  ]);
  assert.ok(Math.max(...selected.map((topic) => topic.weight)) <= 0.451);
  assert.ok(Math.abs(selected.reduce((sum, topic) => sum + topic.weight, 0) - 1) < 0.001);
});

test("fast extractive summaries preserve real source citation mapping", () => {
  const summary = createExtractiveSummary([
    { snippet: "第一家媒体披露了事件的主要时间线" },
    { snippet: "第二家媒体补充了相关主体的公开回应" },
    { snippet: "第三家媒体说明了后续需要观察的节点" },
  ]);
  assert.match(summary, /\[1\]/);
  assert.match(summary, /\[2\]/);
  assert.doesNotMatch(summary, /\[3\]/);
  assert.equal(summary.includes("undefined"), false);
});

test("story slots total 18 with 3 to 6 stories per section", () => {
  for (let topicCount = 3; topicCount <= 6; topicCount += 1) {
    const weight = 1 / topicCount;
    const allocation = allocateStorySlots(
      Array.from({ length: topicCount }, (_, index) => ({ id: `t${index}`, label: `T${index}`, weight })),
    );
    assert.equal(allocation.reduce((sum, topic) => sum + topic.slots, 0), 18);
    assert.equal(allocation.every((topic) => topic.slots >= 3 && topic.slots <= 6), true);
  }
});

test("front page keeps domestic and international balance", () => {
  const stories = [
    ...Array.from({ length: 5 }, (_, index) => ({ id: `cn-${index}`, region: "国内", score: 1 - index * 0.05 })),
    ...Array.from({ length: 5 }, (_, index) => ({ id: `world-${index}`, region: "国际", score: 0.9 - index * 0.05 })),
  ];
  const selected = selectFrontStories(stories, 8);
  assert.equal(selected.length, 8);
  assert.ok(selected.filter((story) => story.region === "国内").length >= 2);
  assert.ok(selected.filter((story) => story.region === "国际").length >= 2);
});

test("front page prioritizes Serper stories over RSS fallback", () => {
  const stories = [
    { id: "rss-cn", region: "国内", score: 1, sources: [{ sourceAdapter: "publisher-rss" }] },
    { id: "bocha-cn", region: "国内", score: 0.7, sources: [{ sourceAdapter: "bocha-news" }] },
    { id: "rss-world", region: "国际", score: 0.98, sources: [{ sourceAdapter: "publisher-rss" }] },
    { id: "serper-world", region: "国际", score: 0.65, sources: [{ sourceAdapter: "serper-news" }] },
  ];
  const selected = selectFrontStories(stories, 4);
  assert.deepEqual(selected.slice(0, 2).map((story) => story.id), ["serper-world", "bocha-cn"]);
});

test("Brief source priority keeps Serper primary and RSS as fallback", () => {
  assert.ok(briefSourcePriority("serper-news") > briefSourcePriority("bocha-news"));
  assert.ok(briefSourcePriority("bocha-news") > briefSourcePriority("publisher-rss"));
});

test("brief sources allow authoritative newsrooms and reject wiki/zhihu hubs", () => {
  assert.equal(isAllowedBriefSource("https://www.reuters.com/world/asia/china-policy-update-2026-08-03/"), true);
  assert.equal(isAllowedBriefSource("https://www.thepaper.cn/newsDetail_forward_31234567"), true);
  assert.equal(isAllowedBriefSource("https://www.caixin.com/2026-08-03/102345678.html"), true);
  assert.equal(isAllowedBriefSource("https://zh.wikipedia.org/wiki/%E4%B8%AD%E5%9B%BD"), false);
  assert.equal(isAllowedBriefSource("https://www.zhihu.com/question/123456"), false);
  assert.equal(isAllowedBriefSource("https://baike.baidu.com/item/%E4%BA%BA%E5%B7%A5%E6%99%BA%E8%83%BD"), false);
  assert.equal(isAllowedBriefSource("https://news.google.com/topics/CAAqJgg"), false);
  assert.equal(isAllowedBriefSource("https://www.reuters.com/world"), false);
  assert.equal(isLikelyArticleUrl("https://www.bbc.com/news"), false);
  assert.equal(isLikelyArticleUrl("https://www.bbc.com/news/articles/c1234567890"), true);
});

test("Brief filters roundup and daily-digest headlines instead of treating them as one event", () => {
  assert.equal(isLowQualityBriefResult({ title: "今日早报每日热点15条新闻简报，每天一分钟知晓天下事" }), true);
  assert.equal(isLowQualityBriefResult({ title: "「早报」美股半导体集体爆发，油价大跌，黄金走强" }), true);
  assert.equal(isLowQualityBriefResult({ title: "导读" }), true);
  assert.equal(isLowQualityBriefResult({ title: "认识自我_标签_网易出品" }), true);
  assert.equal(isLowQualityBriefResult({ title: "三星与SK海力士测试中国芯片设备" }), false);
});

test("signal persistence enforces limits, excludes private records, and stores no sensitive payload fields", async (t) => {
  const userDataPath = await mkdtemp(path.join(os.tmpdir(), "brizo-brief-signals-"));
  t.after(() => rm(userDataPath, { force: true, recursive: true }));
  const service = createBriefService({
    callModel: async () => null,
    search: async () => [],
    userDataPath,
  });
  await service.syncSignals({
    apiKey: "top-secret-key",
    attachments: [{ name: "secret.pdf" }],
    body: "private page body",
    history: [
      { domain: "public.example", title: "Public title", updatedAt: Date.now(), url: "https://public.example/full/path" },
      { domain: "private.example", private: true, title: "Private title" },
    ],
    searches: Array.from({ length: 305 }, (_, index) => ({
      private: index === 0,
      query: index === 0 ? "private query" : `query ${index}`,
      updatedAt: Date.now(),
    })),
  });
  const filePath = path.join(userDataPath, "brief-signals.json");
  const raw = await readFile(filePath, "utf8");
  const saved = JSON.parse(raw);
  assert.equal(saved.searches.length, 300);
  assert.equal(saved.history.length, 1);
  assert.equal(raw.includes("top-secret-key"), false);
  assert.equal(raw.includes("private page body"), false);
  assert.equal(raw.includes("secret.pdf"), false);
  assert.equal(raw.includes("full/path"), false);
  assert.equal(raw.includes("Private title"), false);
  assert.equal(raw.includes("private query"), false);
  assert.equal((await stat(filePath)).mode & 0o777, 0o600);
});

test("report synthesizes multiple sources and returns five related image stories", async (t) => {
  const userDataPath = await mkdtemp(path.join(os.tmpdir(), "brizo-brief-report-"));
  t.after(() => rm(userDataPath, { force: true, recursive: true }));
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response("<!doctype html><html><head><meta property=\"og:image\" content=\"https://images.example/report.jpg\"></head><body><article><p>来源正文补充。</p></article></body></html>", {
    headers: { "content-type": "text/html" },
    status: 200,
  });
  t.after(() => { globalThis.fetch = originalFetch; });
  const relatedStories = Array.from({ length: 5 }, (_, index) => ({
    headline: `相关新闻 ${index + 1}`,
    id: `related-${index + 1}`,
    imageUrl: `https://images.example/related-${index + 1}.jpg`,
    publishedAt: new Date(Date.now() - index * 60_000).toISOString(),
    summary: `相关新闻摘要 ${index + 1}`,
    topicId: "technology",
    url: `https://www.bbc.com/news/articles/related-${index + 1}`,
  }));
  const edition = {
    id: "edition-1",
    pages: [{
      stories: [{
        headline: "微软发布产品更新",
        id: "story-1",
        summary: "微软发布产品更新。 [1]",
        topicId: "technology",
        sources: [
          {
            bodyExcerpt: "Microsoft released a product update with a new workflow feature.",
            domain: "reuters.com",
            snippet: "Microsoft released a product update.",
            title: "Microsoft releases product update",
            url: "https://www.reuters.com/technology/rss-product-update-2026-08-03/",
          },
          {
            bodyExcerpt: "The product adds workflow controls for enterprise customers.",
            domain: "apnews.com",
            snippet: "The update adds enterprise workflow controls.",
            title: "Microsoft adds enterprise workflow controls",
            url: "https://apnews.com/article/microsoft-product-workflow-update",
          },
        ],
      }, ...relatedStories],
    }],
    status: "success",
    updatedAt: new Date().toISOString(),
  };
  await writeFile(path.join(userDataPath, "brief-store.json"), JSON.stringify({
    editions: { [edition.id]: edition },
    preferences: {},
    reports: {},
  }), { mode: 0o600 });
  let synthesisPrompt = "";
  const service = createBriefService({
    callModel: async ({ systemPrompt }) => {
      synthesisPrompt = systemPrompt;
      return ({
        message: JSON.stringify({
          headline: "微软推出企业工作流产品更新",
          lead: "微软发布了新的工作流功能，并面向企业客户增加控制能力。[1][2]",
          body: [
            "微软公布了产品更新的主要功能与发布时间。[1]",
            "另一家媒体补充称，新功能重点服务企业客户。[2]",
          ],
        }),
        status: "success",
      });
    },
    search: async () => [],
    userDataPath,
  });
  const report = await service.getReport({ editionId: edition.id, storyId: "story-1" });
  assert.equal(report.status, "success");
  assert.equal(report.synthesisState, "model");
  assert.equal(report.sources.length, 2);
  assert.equal(report.relatedStories.length, 5);
  assert.match(report.lead, /\[1\]\[2\]/);
  assert.match(report.body.join(" "), /\[1\].*\[2\]/);
  assert.match(synthesisPrompt, /整理成一篇简体中文综合报道/);
  assert.match(synthesisPrompt, /来源冲突必须明确指出/);
});

test("generation failure keeps the latest successful cached edition", async (t) => {
  const userDataPath = await mkdtemp(path.join(os.tmpdir(), "brizo-brief-stale-"));
  t.after(() => rm(userDataPath, { force: true, recursive: true }));
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error("offline fixture"); };
  t.after(() => { globalThis.fetch = originalFetch; });
  const cached = {
    id: "2026-08-01:evening",
    pages: [{ stories: [] }],
    status: "success",
    updatedAt: new Date(2026, 7, 1, 19).toISOString(),
  };
  await writeFile(path.join(userDataPath, "brief-store.json"), JSON.stringify({
    editions: { [cached.id]: cached },
    preferences: {},
    reports: {},
  }), { mode: 0o600 });
  const service = createBriefService({
    callModel: async () => null,
    search: async () => [],
    userDataPath,
  });
  const result = await service.getEdition({ at: localTime(2026, 8, 2, 12, 0) });
  assert.equal(result.id, cached.id);
  assert.match(result.staleReason, /专业新闻检索与 RSS/);
});

test("Chinese RSS items publish without any AI call", async (t) => {
  const userDataPath = await mkdtemp(path.join(os.tmpdir(), "brizo-brief-partial-"));
  t.after(() => rm(userDataPath, { force: true, recursive: true }));
  const originalFetch = globalThis.fetch;
  const fixture = createRssFetchFixture({ chinese: true });
  globalThis.fetch = fixture.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  let modelCalls = 0;
  const service = createBriefService({
    callModel: async () => { modelCalls += 1; return null; },
    search: async () => { throw new Error("web search must not be called"); },
    userDataPath,
  });
  const edition = await service.getEdition({ at: localTime(2026, 8, 3, 12, 0), force: true });
  assert.equal(edition.status, "success");
  assert.equal(edition.pages.length, 4);
  assert.equal(modelCalls, 0);
  assert.ok(edition.generationMetrics.rssCandidateCount > 0);
  assert.ok(edition.generationMetrics.directChineseStoryCount > 0);
  assert.equal(Boolean(edition.staleReason), false);
});

test("foreign RSS items use AI only for translation and never call web search", async (t) => {
  const userDataPath = await mkdtemp(path.join(os.tmpdir(), "brizo-brief-fast-"));
  t.after(() => rm(userDataPath, { force: true, recursive: true }));
  const originalFetch = globalThis.fetch;
  const fixture = createRssFetchFixture({ chinese: false });
  globalThis.fetch = fixture.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  let translationCalls = 0;
  let searchCalls = 0;
  const service = createBriefService({
    callModel: async ({ query, systemPrompt }) => {
      translationCalls += 1;
      assert.match(systemPrompt, /只做忠实/);
      assert.doesNotMatch(systemPrompt, /选择值得进入|综合互相印证|为什么重要/);
      return {
        status: "success",
        message: JSON.stringify({
          stories: JSON.parse(query).map((item) => ({
            excerpt: "微软公司通过出版商 RSS 发布产品更新，包含发布时间和功能变化。",
            headline: `微软公司发布产品更新 ${item.id}`,
            id: item.id,
          })),
        }),
      };
    },
    callEditorialModel: async () => { throw new Error("fallback translator should not run"); },
    search: async () => { searchCalls += 1; return []; },
    userDataPath,
  });
  const edition = await service.getEdition({ at: localTime(2026, 8, 3, 12, 0), force: true });
  assert.equal(edition.status, "success", edition.message || edition.staleReason || "fast edition failed");
  assert.equal(edition.pages.length, 4);
  assert.ok(translationCalls >= 1);
  assert.equal(searchCalls, 0);
  assert.equal(edition.generationMetrics.sourceSelectionUsedModel, false);
  assert.ok(edition.generationMetrics.translatedStoryCount > 0);
  assert.ok(edition.generationMetrics.enrichedUrlCount > 0);
  assert.ok(edition.generationMetrics.totalMs < 1_000);
  assert.deepEqual(edition.pages.slice(1).map((page) => page.sections.map((section) => section.label)), [
    ["科技与技术", "商业与金融"],
    ["国际重要新闻", "国内重要新闻"],
    ["艺术与文化", "体育与娱乐"],
  ]);
  const stories = edition.pages.flatMap((page) => [
    ...(page.stories || []),
    ...(page.sections || []).flatMap((section) => section.stories || []),
  ]);
  assert.equal(stories.every((story) => story.imageUrl && story.headline && story.summary), true);
  assert.equal(stories.every((story) => /[\u3400-\u9fff]/u.test(story.headline) && /[\u3400-\u9fff]/u.test(story.summary)), true);
  assert.equal(stories.every((story) => /Microsoft published product update/.test(story.sources?.[0]?.bodyExcerpt || "")), true);
  assert.equal(stories.every((story) => isAllowedBriefSource(story.url)), true);
  assert.equal(stories.some((story) => Object.hasOwn(story, "recommendationReason")), false);
});
