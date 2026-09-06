import assert from "node:assert/strict";
import test from "node:test";

import {
  buildBilibiliSearchUrl,
  buildDoubanSearchUrl,
  buildWeiboSearchUrl,
  buildXiaohongshuSearchUrl,
  mainstreamContentQueryFromUrl,
  mainstreamContentSearchUrlMatches,
  parseBilibiliContentCommand,
  parseDoubanContentCommand,
  parseMainstreamContentCommand,
  parseWeiboContentCommand,
  parseXiaohongshuContentCommand,
  selectMainstreamContentItems,
  verifyMainstreamContentObservation,
  verifyMainstreamContentSelection,
  waitForMainstreamContentResults,
} from "../../runtime/electron/mainstream-content-flow.mjs";

const cases = [
  {
    build: buildXiaohongshuSearchUrl,
    command: "在小红书搜索“上海周末露营”，找3篇最新笔记",
    itemUrl: "https://www.xiaohongshu.com/explore/68bca001",
    parse: parseXiaohongshuContentCommand,
    query: "上海周末露营",
    searchUrl: "https://www.xiaohongshu.com/search_result?keyword=%E4%B8%8A%E6%B5%B7%E5%91%A8%E6%9C%AB%E9%9C%B2%E8%90%A5",
    site: "xiaohongshu",
    sort: "recent",
  },
  {
    build: buildDoubanSearchUrl,
    command: "去豆瓣找三体，列出两部电影",
    itemUrl: "https://movie.douban.com/subject/2567698/",
    parse: parseDoubanContentCommand,
    query: "三体",
    searchUrl: "https://www.douban.com/search?q=%E4%B8%89%E4%BD%93",
    site: "douban",
    sort: "default",
  },
  {
    build: buildBilibiliSearchUrl,
    command: "在B站搜索 Rust 教程，找4个最多播放的视频",
    itemUrl: "https://www.bilibili.com/video/BV1example/",
    parse: parseBilibiliContentCommand,
    query: "Rust 教程",
    searchUrl: "https://search.bilibili.com/all?keyword=Rust+%E6%95%99%E7%A8%8B",
    site: "bilibili",
    sort: "popular",
  },
  {
    build: buildWeiboSearchUrl,
    command: "微博搜索人工智能，列出5条最新微博",
    itemUrl: "https://weibo.com/1234567890/AbCdEf",
    parse: parseWeiboContentCommand,
    query: "人工智能",
    searchUrl: "https://s.weibo.com/weibo?q=%E4%BA%BA%E5%B7%A5%E6%99%BA%E8%83%BD",
    site: "weibo",
    sort: "recent",
  },
];

test("parses and builds exact search intents for four mainstream content sites", () => {
  for (const fixture of cases) {
    const intent = fixture.parse(fixture.command);
    assert.equal(intent.site, fixture.site);
    assert.equal(intent.query, fixture.query);
    assert.equal(intent.sort, fixture.sort);
    assert.equal(fixture.build(intent.query), fixture.searchUrl);
    assert.equal(parseMainstreamContentCommand(fixture.command).site, fixture.site);
    assert.equal(mainstreamContentQueryFromUrl(fixture.searchUrl, fixture.site), fixture.query);
    assert.equal(mainstreamContentSearchUrlMatches(fixture.searchUrl, intent), true);
  }
  assert.equal(parseXiaohongshuContentCommand(cases[1].command), null);
});

test("rejects a lookalike search URL and item URL outside the intended site", () => {
  const intent = parseWeiboContentCommand(cases[3].command);
  assert.equal(mainstreamContentSearchUrlMatches(
    "https://example.com/weibo?q=%E4%BA%BA%E5%B7%A5%E6%99%BA%E8%83%BD",
    intent,
  ), false);
  const result = {
    activeControls: ["最新"],
    items: [{ index: 0, title: "人工智能进展", url: "https://example.com/123" }],
    loginRequired: false,
    url: cases[3].searchUrl,
  };
  assert.equal(verifyMainstreamContentObservation(result, intent).checks.observedItems, false);
});

test("verifies selected content against a fresh observation for every supported site", () => {
  for (const fixture of cases) {
    const intent = fixture.parse(fixture.command);
    const result = {
      activeControls: intent.sort === "recent" ? ["最新发布"]
        : intent.sort === "popular" ? ["最多播放"] : [],
      items: [{
        author: "作者",
        date: "2026-09-06",
        index: 0,
        metrics: ["1.2万"],
        summary: "页面中可见的内容摘要",
        title: `${fixture.query} 结果`,
        url: fixture.itemUrl,
      }],
      loginRequired: false,
      url: fixture.searchUrl,
    };
    const selected = selectMainstreamContentItems(result.items, intent);
    assert.equal(verifyMainstreamContentObservation(result, intent).ok, true);
    assert.equal(verifyMainstreamContentSelection(result, intent, selected).ok, true);
  }
});

test("selection preserves page order while removing duplicate content", () => {
  const intent = parseBilibiliContentCommand("在B站搜索 Rust，找3个视频");
  const items = [
    { index: 0, title: "Rust 入门", url: "https://www.bilibili.com/video/BV1a/" },
    { index: 1, title: "Rust 入门", url: "https://www.bilibili.com/video/BV1a/" },
    { index: 2, title: "Rust 所有权", url: "https://www.bilibili.com/video/BV1b/" },
  ];
  assert.deepEqual(
    selectMainstreamContentItems(items, intent).map((item) => item.index),
    [0, 2],
  );
});

test("wait ignores stale-query results until the intended result is stable", async () => {
  const intent = parseWeiboContentCommand("在微博搜索人工智能，找1条微博");
  const intended = {
    activeControls: [],
    items: [{ index: 0, title: "人工智能进展", url: "https://weibo.com/123/AbC" }],
    loginRequired: false,
    url: buildWeiboSearchUrl("人工智能"),
  };
  const stale = { ...intended, url: buildWeiboSearchUrl("其他话题") };
  const reads = [stale, stale, intended, intended];
  let index = 0;
  const result = await waitForMainstreamContentResults({
    executeJavaScript: async () => reads[Math.min(index++, reads.length - 1)],
    isDestroyed: () => false,
  }, { expectedIntent: intent, observationTimeout: 20, pollInterval: 5, timeout: 100 });
  assert.equal(result.url, intended.url);
  assert.equal(index, 4);
});
