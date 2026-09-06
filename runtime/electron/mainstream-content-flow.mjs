import { detectBrowserSecurityBlock } from "./browser-security-block.mjs";

const SITE_CONFIG = Object.freeze({
  xiaohongshu: Object.freeze({
    id: "xiaohongshu",
    label: "小红书",
    entryUrl: "https://www.xiaohongshu.com/",
    searchBase: "https://www.xiaohongshu.com/search_result",
    queryParameter: "keyword",
    hostnames: ["xiaohongshu.com"],
    cardSelectors: [
      "section.note-item",
      ".feeds-container .note-item",
      "section[class*='note-item']",
      "section[class*='noteItem']",
    ],
    linkSelectors: ["a.cover[href]", "a[href*='/explore/']", "a[href]"],
    titleSelectors: [".title", "[class*='title']", "[class*='Title']"],
    authorSelectors: [".author-wrapper .name", ".author .name", "[class*='author'] [class*='name']", "[class*='author']"],
    summarySelectors: [".desc", "[class*='desc']", "[class*='content']"],
    metricSelectors: [".like-wrapper", "[class*='like']", "[class*='count']"],
    dateSelectors: ["time", "[class*='date']", "[class*='time']"],
  }),
  douban: Object.freeze({
    id: "douban",
    label: "豆瓣",
    entryUrl: "https://www.douban.com/",
    searchBase: "https://www.douban.com/search",
    queryParameter: "q",
    hostnames: ["douban.com"],
    cardSelectors: [".result-list .result", ".search-result .result", ".result", ".item-root"],
    linkSelectors: ["h3 a[href]", ".title a[href]", "a[href*='/subject/']", "a[href]"],
    titleSelectors: ["h3", ".title", "[class*='title']"],
    authorSelectors: [".subject-cast", ".meta", "[class*='author']", "[class*='cast']"],
    summarySelectors: [".content", ".subject-cast", ".desc", "p"],
    metricSelectors: [".rating_nums", ".rating_num", ".rating-info", "[class*='rating']"],
    dateSelectors: ["time", "[class*='date']", ".pub"],
  }),
  bilibili: Object.freeze({
    id: "bilibili",
    label: "B站",
    entryUrl: "https://www.bilibili.com/",
    searchBase: "https://search.bilibili.com/all",
    queryParameter: "keyword",
    hostnames: ["bilibili.com"],
    cardSelectors: [
      ".video-list-item",
      ".bili-video-card",
      ".video-item",
      "[data-video-id]",
    ],
    linkSelectors: ["a[href*='/video/']", "a[href*='bilibili.com/video/']", "a[href]"],
    titleSelectors: ["h3", ".bili-video-card__info--tit", ".title", "[class*='title']"],
    authorSelectors: [".bili-video-card__info--author", ".up-name", ".up-name__text", "[class*='author']"],
    summarySelectors: [".desc", ".description", "[class*='desc']"],
    metricSelectors: [".bili-video-card__stats--item", ".so-icon", "[class*='stat']", "[class*='play']"],
    dateSelectors: ["time", ".pubdate", "[class*='date']", "[class*='time']"],
  }),
  weibo: Object.freeze({
    id: "weibo",
    label: "微博",
    entryUrl: "https://weibo.com/",
    searchBase: "https://s.weibo.com/weibo",
    queryParameter: "q",
    hostnames: ["weibo.com"],
    cardSelectors: [
      ".card-wrap[action-type='feed_list_item']",
      ".card-wrap[mid]",
      "[action-type='feed_list_item']",
    ],
    linkSelectors: [".from a[href]", "a[href*='weibo.com/'][href]", "a[href]"],
    titleSelectors: [".txt[node-type='feed_list_content']", ".txt", "[class*='content']"],
    authorSelectors: [".info .name", "a.name", "[class*='author']", "[class*='name']"],
    summarySelectors: [".txt[node-type='feed_list_content_full']", ".txt", "[class*='content']"],
    metricSelectors: [".card-act li", "[class*='toolbar']", "[class*='count']"],
    dateSelectors: [".from a[href]", "time", "[class*='date']", "[class*='time']"],
  }),
});

export const MAINSTREAM_CONTENT_SITES = Object.freeze(Object.fromEntries(
  Object.entries(SITE_CONFIG).map(([id, site]) => [id, Object.freeze({
    id,
    label: site.label,
    entryUrl: site.entryUrl,
    searchBase: site.searchBase,
  })]),
));

const SITE_MENTIONS = Object.freeze([
  ["xiaohongshu", /(?:小红书|xiaohongshu|rednote)/iu],
  ["douban", /(?:豆瓣|douban)/iu],
  ["bilibili", /(?:哔哩哔哩|bilibili|b\s*站)/iu],
  ["weibo", /(?:新浪微博|微博|weibo)/iu],
]);

const SITE_MENTION_GLOBALS = Object.freeze([
  /(?:小红书|xiaohongshu|rednote)/giu,
  /(?:豆瓣|douban)/giu,
  /(?:哔哩哔哩|bilibili|b\s*站)/giu,
  /(?:新浪微博|微博|weibo)/giu,
]);

const SEARCH_ACTION_PATTERN = /(?:搜索|搜一搜|搜一下|搜|查找|查一下|检索|找一下|找)/u;
const CONTENT_NOUN_PATTERN = /(?:笔记|视频|微博|帖子|动态|广播|结果|条目|电影|书籍|影评|书评|内容)/u;
const COUNT_PATTERN = /(\d{1,2}|[一二三四五六七八九十两]{1,3})\s*(?:篇|条|个|部|本)\s*(?:相关的?)?(?:笔记|视频|微博|帖子|动态|广播|结果|条目|电影|书籍|影评|书评|内容)?/u;
const IMPLICIT_LOOKUP_DETAIL_PATTERN = /(?:多少分|评分|分数|评价|影评|短评|书评|简介|资料|信息|播放量|观看数|点赞数|收藏数|热度|作者|导演|演员|电影|影片|剧集|电视剧|书籍|图书|视频|笔记|帖子|动态|条目|作品|score|rating|review|details?|information|views?)/iu;
const SINGLE_ITEM_DETAIL_PATTERN = /(?:多少分|评分|分数|简介|播放量|观看数|点赞数|收藏数|作者|导演|演员|score|rating|views?)\s*[?？]?$/iu;

function compactVerification(checks) {
  const failures = Object.entries(checks).filter(([, passed]) => !passed).map(([name]) => name);
  return Object.freeze({
    ok: failures.length === 0,
    checks: Object.freeze({ ...checks }),
    failures: Object.freeze(failures),
  });
}

function hostnameMatches(hostname, roots) {
  return roots.some((root) => hostname === root || hostname.endsWith(`.${root}`));
}

function normalizedQuery(value) {
  return String(value || "")
    .normalize("NFKC")
    .replace(/\s+/gu, " ")
    .replace(/[，。；、!?！？]+$/gu, "")
    .trim()
    .slice(0, 160);
}

function siteMentionedBy(text) {
  return SITE_MENTIONS.find(([, pattern]) => pattern.test(text))?.[0] || "";
}

export function mainstreamContentSiteFromUrl(value) {
  try {
    const url = new URL(String(value || ""));
    if (!/^https?:$/u.test(url.protocol) || url.username || url.password) return "";
    const hostname = url.hostname.toLocaleLowerCase();
    return Object.values(SITE_CONFIG).find((site) => hostnameMatches(hostname, site.hostnames))?.id || "";
  } catch {
    return "";
  }
}

function searchPathMatches(site, url) {
  const pathname = url.pathname.replace(/\/+$/u, "") || "/";
  if (site === "xiaohongshu") return pathname === "/search_result";
  if (site === "douban") return pathname === "/search";
  if (site === "bilibili") return url.hostname.toLocaleLowerCase() === "search.bilibili.com"
    && ["/", "/all", "/video"].includes(pathname);
  if (site === "weibo") return url.hostname.toLocaleLowerCase() === "s.weibo.com" && pathname === "/weibo";
  return false;
}

export function mainstreamContentQueryFromUrl(value, expectedSite = "") {
  try {
    const url = new URL(String(value || ""));
    if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443")) return "";
    const site = mainstreamContentSiteFromUrl(url.href);
    if (!site || (expectedSite && site !== expectedSite) || !searchPathMatches(site, url)) return "";
    const parameter = site === "douban" && url.searchParams.has("query")
      ? "query"
      : SITE_CONFIG[site].queryParameter;
    return normalizedQuery(url.searchParams.get(parameter));
  } catch {
    return "";
  }
}

function chineseNumber(value) {
  if (/^\d+$/u.test(value)) return Number(value);
  const digits = { 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
  if (value === "十") return 10;
  const parts = value.split("十");
  if (parts.length === 2) return (digits[parts[0]] || 1) * 10 + (digits[parts[1]] || 0);
  return digits[value] || 0;
}

function requestedCount(command) {
  const match = command.match(COUNT_PATTERN);
  const explicitCount = chineseNumber(match?.[1] || "");
  if (explicitCount) return Math.max(1, Math.min(10, explicitCount));
  return SINGLE_ITEM_DETAIL_PATTERN.test(command) ? 1 : 5;
}

function requestedSort(command) {
  if (/(?:最新|最近|新发布|按时间|时间倒序)/u.test(command)) return "recent";
  if (/(?:热门|热度|最热|最多播放|播放最多|高赞|点赞最多)/u.test(command)) return "popular";
  return "default";
}

function contentTypeFor(site, command) {
  if (site === "xiaohongshu") return "note";
  if (site === "bilibili") return "video";
  if (site === "weibo") return "post";
  if (/(?:影评|短评|评论)/u.test(command)) return "review";
  if (/(?:书|读书|书籍)/u.test(command)) return "book";
  if (/(?:电影|影片)/u.test(command)) return "movie";
  return "subject";
}

function queryFromCommand(command) {
  const quoted = command.match(/[“「『"']([^”」』"']{1,160})[”」』"']/u)?.[1]
    || command.match(/《([^》]{1,160})》/u)?.[1];
  if (quoted) return normalizedQuery(quoted);

  let withoutSites = command;
  for (const pattern of SITE_MENTION_GLOBALS) withoutSites = withoutSites.replace(pattern, " ");
  const action = withoutSites.match(SEARCH_ACTION_PATTERN);
  if (!action) return "";
  let suffix = withoutSites.slice(action.index + action[0].length)
    .replace(/^\s*(?:一下|一搜|关于|有关|：|:)\s*/u, "")
    .replace(/^\s*(?:前)?(?:\d{1,2}|[一二三四五六七八九十两]{1,3})\s*(?:篇|条|个|部|本)\s*(?:关于)?\s*/u, "");
  suffix = suffix.split(/[，,。；;]/u)[0];
  suffix = suffix.replace(
    /\s*(?:并且?|然后|再)?\s*(?:给我|找|列出|返回|查看|看看|筛选|选出|打开)\s*(?:前)?(?:\d{1,2}|[一二三四五六七八九十两]{1,3})?\s*(?:篇|条|个|部|本)?\s*(?:相关的?)?(?:笔记|视频|微博|帖子|动态|广播|结果|条目|电影|书籍|影评|书评|内容)?.*$/u,
    "",
  );
  suffix = suffix
    .replace(/^\s*(?:上的?|里的?|中的?)\s*/u, "")
    .replace(/\s*(?:的)?(?:相关)?(?:笔记|视频|微博|帖子|动态|广播|结果|条目|影评|书评|内容)\s*$/u, "")
    .replace(/^[“「『"']|[”」』"']$/gu, "");
  return normalizedQuery(suffix);
}

function queryFromImplicitLookup(command) {
  let query = command;
  for (const pattern of SITE_MENTION_GLOBALS) query = query.replace(pattern, " ");
  query = query
    .replace(/^(?:请(?:帮我)?|帮我|麻烦(?:你)?|给我)?\s*(?:看看?|了解|告诉我|想知道)?\s*/u, "")
    .replace(/[?？]+$/u, "")
    .replace(
      /\s*(?:(?:这部|这个|该)?(?:最新|热门|相关)?(?:电影|影片|剧集|电视剧|书籍|图书|书|视频|笔记|微博|帖子|动态|条目|作品)(?:的)?(?:多少分|评分|分数|评价|影评|短评|书评|简介|资料|信息|播放量|观看数|点赞数|收藏数|热度|作者|导演|演员)?|(?:多少分|评分|分数|评价|影评|短评|书评|简介|资料|信息|播放量|观看数|点赞数|收藏数|热度|作者|导演|演员|score|rating|reviews?|details?|information|views?))\s*$/iu,
      "",
    )
    .replace(/^[\s:：]+|[\s:：]+$/gu, "");
  return normalizedQuery(query);
}

function parseForSite(value, currentUrl = "", forcedSite = "") {
  const command = String(value || "").replace(/\s+/gu, " ").trim();
  if (!command) return null;
  const mentionedSite = siteMentionedBy(command);
  if (forcedSite && mentionedSite && forcedSite !== mentionedSite) return null;
  const currentSite = mainstreamContentSiteFromUrl(currentUrl);
  const site = forcedSite || mentionedSite || currentSite;
  if (!SITE_CONFIG[site]) return null;
  const currentQuery = mainstreamContentQueryFromUrl(currentUrl, site);
  const hasSearchAction = SEARCH_ACTION_PATTERN.test(command);
  const explicitQuery = queryFromCommand(command);
  const implicitQuery = !hasSearchAction && IMPLICIT_LOOKUP_DETAIL_PATTERN.test(command)
    ? queryFromImplicitLookup(command)
    : "";
  if (!hasSearchAction
    && !(currentQuery && CONTENT_NOUN_PATTERN.test(command))
    && !implicitQuery
    && !(mentionedSite && explicitQuery)) return null;
  const query = explicitQuery || implicitQuery || currentQuery;
  if (!query) return null;
  return Object.freeze({
    command,
    contentType: contentTypeFor(site, command),
    count: requestedCount(command),
    query,
    site,
    siteLabel: SITE_CONFIG[site].label,
    sort: requestedSort(command),
  });
}

export function parseMainstreamContentCommand(value, currentUrl = "") {
  return parseForSite(value, currentUrl);
}

export function parseXiaohongshuContentCommand(value, currentUrl = "") {
  return parseForSite(value, currentUrl, "xiaohongshu");
}

export function parseDoubanContentCommand(value, currentUrl = "") {
  return parseForSite(value, currentUrl, "douban");
}

export function parseBilibiliContentCommand(value, currentUrl = "") {
  return parseForSite(value, currentUrl, "bilibili");
}

export function parseWeiboContentCommand(value, currentUrl = "") {
  return parseForSite(value, currentUrl, "weibo");
}

export function buildMainstreamContentSearchUrl(intentOrSite, queryValue = "") {
  const site = typeof intentOrSite === "string" ? intentOrSite : intentOrSite?.site;
  const query = normalizedQuery(queryValue || intentOrSite?.query);
  const config = SITE_CONFIG[site];
  if (!config || !query) throw new Error("站点或搜索词不完整。");
  const url = new URL(config.searchBase);
  url.searchParams.set(config.queryParameter, query);
  return url.href;
}

export function buildXiaohongshuSearchUrl(query) {
  return buildMainstreamContentSearchUrl("xiaohongshu", query);
}

export function buildDoubanSearchUrl(query) {
  return buildMainstreamContentSearchUrl("douban", query);
}

export function buildBilibiliSearchUrl(query) {
  return buildMainstreamContentSearchUrl("bilibili", query);
}

export function buildWeiboSearchUrl(query) {
  return buildMainstreamContentSearchUrl("weibo", query);
}

export function mainstreamContentSearchUrlMatches(value, intent) {
  const site = mainstreamContentSiteFromUrl(value);
  return Boolean(site && site === intent?.site
    && normalizedQuery(mainstreamContentQueryFromUrl(value, site)).toLocaleLowerCase()
      === normalizedQuery(intent?.query).toLocaleLowerCase());
}

function safeContentItemUrl(value, site) {
  try {
    const url = new URL(String(value || ""));
    const config = SITE_CONFIG[site];
    return Boolean(config)
      && url.protocol === "https:"
      && !url.username
      && !url.password
      && (!url.port || url.port === "443")
      && hostnameMatches(url.hostname.toLocaleLowerCase(), config.hostnames);
  } catch {
    return false;
  }
}

function validObservedItem(item, site) {
  return Boolean(item)
    && Number.isInteger(item.index)
    && item.index >= 0
    && Boolean(normalizedQuery(item.title || item.summary))
    && safeContentItemUrl(item.url, site);
}

function sortMatches(result, intent) {
  if (!intent?.sort || intent.sort === "default") return true;
  const active = (Array.isArray(result?.activeControls) ? result.activeControls : [])
    .join(" ").replace(/\s+/gu, " ");
  let parameterText = "";
  try {
    const url = new URL(String(result?.url || ""));
    parameterText = ["order", "sort", "xsort", "search_type", "type"]
      .filter((key) => url.searchParams.has(key))
      .map((key) => `${key}=${url.searchParams.get(key)}`).join(" ");
  } catch {}
  const evidence = `${active} ${parameterText}`;
  return intent.sort === "recent"
    ? /(?:最新|最近|新发布|按时间|pubdate|new|recent|time)/iu.test(evidence)
    : /(?:热门|热度|最热|最多播放|播放最多|高赞|点赞最多|click|hot|popular)/iu.test(evidence);
}

export function verifyMainstreamContentObservation(result, intent) {
  const items = Array.isArray(result?.items) ? result.items : [];
  return compactVerification({
    queryUrl: mainstreamContentSearchUrlMatches(result?.url, intent),
    observedItems: items.length > 0 && items.every((item) => validObservedItem(item, intent?.site)),
    requestedSort: sortMatches(result, intent),
    loginClear: result?.loginRequired !== true,
  });
}

export function selectMainstreamContentItems(items, intentOrCount = 5) {
  const intent = typeof intentOrCount === "object" ? intentOrCount : null;
  const site = intent?.site || mainstreamContentSiteFromUrl(items?.[0]?.url);
  const count = Math.max(1, Math.min(10, Number(intent?.count ?? intentOrCount) || 5));
  const selected = [];
  const seen = new Set();
  for (const item of Array.isArray(items) ? items : []) {
    if (!validObservedItem(item, site)) continue;
    const key = `${item.url}\0${normalizedQuery(item.title).toLocaleLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    selected.push(item);
    if (selected.length >= count) break;
  }
  return selected;
}

export function verifyMainstreamContentSelection(result, intent, selectedItems) {
  const observation = verifyMainstreamContentObservation(result, intent);
  const observed = Array.isArray(result?.items)
    ? result.items.filter((item) => validObservedItem(item, intent?.site))
    : [];
  const selected = Array.isArray(selectedItems) ? selectedItems : [];
  const required = Math.min(Math.max(1, Number(intent?.count) || 5), observed.length);
  const fromObservation = selected.length > 0 && selected.every((item) =>
    observed.some((candidate) => candidate.index === item.index
      && String(candidate.url) === String(item.url)
      && normalizedQuery(candidate.title) === normalizedQuery(item.title))
  );
  return compactVerification({
    ...observation.checks,
    selectedCount: selected.length === required,
    selectionFromObservation: fromObservation,
    uniqueItems: fromObservation && new Set(selected.map((item) => item.url)).size === selected.length,
  });
}

function readScriptFor(site) {
  const config = SITE_CONFIG[site];
  if (!config) throw new Error("不支持的内容站点。");
  const publicConfig = {
    authorSelectors: config.authorSelectors,
    cardSelectors: config.cardSelectors,
    dateSelectors: config.dateSelectors,
    linkSelectors: config.linkSelectors,
    metricSelectors: config.metricSelectors,
    summarySelectors: config.summarySelectors,
    titleSelectors: config.titleSelectors,
    site,
  };
  return `
    (() => {
      const config = ${JSON.stringify(publicConfig)};
      const clean = (value, limit = 800) => String(value || "").replace(/\\s+/g, " ").trim().slice(0, limit);
      const visible = (element) => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return style.display !== "none" && style.visibility !== "hidden"
          && Number(style.opacity || 1) > 0.02 && rect.width > 70 && rect.height > 32;
      };
      const visibleControl = (element) => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return style.display !== "none" && style.visibility !== "hidden"
          && Number(style.opacity || 1) > 0.02 && rect.width > 1 && rect.height > 1;
      };
      const findNode = (root, selectors) => {
        for (const selector of selectors) {
          if (root.matches?.(selector)) return root;
          const node = root.querySelector(selector);
          if (node) return node;
        }
        return null;
      };
      const findText = (root, selectors, limit = 800) => clean(findNode(root, selectors)?.innerText, limit);
      let cards = [];
      for (const selector of config.cardSelectors) {
        const matches = [...document.querySelectorAll(selector)].filter(visible);
        if (matches.length > cards.length) cards = matches;
      }
      const rawItems = cards.slice(0, 80).map((card, index) => {
        const link = findNode(card, config.linkSelectors);
        const summary = findText(card, config.summarySelectors, 1200);
        const fallbackText = clean(card.innerText, 1200);
        const title = findText(card, config.titleSelectors, 300)
          || clean(link?.getAttribute("title") || link?.getAttribute("aria-label") || link?.innerText, 300)
          || summary.slice(0, 300)
          || fallbackText.slice(0, 300);
        const metrics = [...new Set(config.metricSelectors.flatMap((selector) =>
          [...card.querySelectorAll(selector)].map((node) => clean(node.innerText, 120)).filter(Boolean)
        ))].slice(0, 6);
        return {
          author: findText(card, config.authorSelectors, 160),
          date: findText(card, config.dateSelectors, 100),
          index,
          metrics,
          summary: summary && summary !== title ? summary : "",
          title,
          url: clean(link?.href, 1200),
        };
      }).filter((item) => item.title && /^https?:/i.test(item.url));
      const seen = new Set();
      const items = rawItems.filter((item) => {
        const key = item.url + "\\0" + item.title;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      const activeControls = [...document.querySelectorAll([
        "[role='tab'][aria-selected='true']", "[aria-pressed='true']",
        "[class*='filter'] .active", "[class*='filter'][class*='active']",
        "[class*='sort'] .active", "[class*='sort'][class*='active']",
        ".filter-item.active", ".search-condition-row button.active",
        ".vui_button--active", ".lev a.cur",
      ].join(","))].filter(visibleControl).map((node) => clean(node.innerText || node.getAttribute("aria-label"), 100)).filter(Boolean).slice(0, 40);
      const pageText = clean(document.body?.innerText, 12000);
      const frames = [...document.querySelectorAll("iframe,frame")].filter(visible).slice(0, 24).map((frame) => ({
        name: clean(frame.getAttribute("aria-label") || frame.title || frame.name, 240),
        url: clean(frame.src, 1000),
      }));
      return {
        activeControls,
        frames,
        items,
        loginRequired: items.length === 0 && /(?:请先登录|登录后(?:查看|继续)|扫码登录|登录\\s*[\\/／]\\s*注册)/.test(pageText),
        pageText,
        site: config.site,
        title: clean(document.title, 240),
        url: location.href,
      };
    })()
  `;
}

function throwIfBlocked(observation, intent) {
  const block = detectBrowserSecurityBlock(observation);
  if (block) {
    throw Object.assign(new Error(block.message), {
      code: "BRIZO_SITE_SECURITY_BLOCK",
      blockCode: block.code,
      progress: block.progress,
    });
  }
  if (observation?.loginRequired) {
    throw Object.assign(
      new Error(`${intent?.siteLabel || "目标网站"}要求登录，请先在当前页面完成登录后再继续。`),
      { code: "BRIZO_LOGIN_REQUIRED" },
    );
  }
}

async function boundedResult(promise, timeout) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((resolve) => { timer = setTimeout(() => resolve(null), timeout); }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function sleep(milliseconds) {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export async function readMainstreamContentResults(webContents, siteOrIntent = "") {
  const site = typeof siteOrIntent === "string" ? siteOrIntent : siteOrIntent?.site;
  const resolvedSite = site || mainstreamContentSiteFromUrl(webContents?.getURL?.());
  return await webContents.executeJavaScript(readScriptFor(resolvedSite));
}

export async function waitForMainstreamContentResults(webContents, {
  expectedIntent,
  observationTimeout = 2_500,
  pollInterval = 450,
  timeout = 25_000,
} = {}) {
  if (!expectedIntent?.site || !expectedIntent?.query) throw new Error("内容搜索意图不完整。");
  const deadline = Date.now() + timeout;
  let latest = null;
  let lastSignature = "";
  while (!webContents.isDestroyed() && Date.now() < deadline) {
    latest = await boundedResult(
      readMainstreamContentResults(webContents, expectedIntent).catch(() => null),
      Math.max(10, Math.min(observationTimeout, deadline - Date.now())),
    );
    if (latest) throwIfBlocked(latest, expectedIntent);
    const verified = verifyMainstreamContentObservation(latest, expectedIntent).ok;
    if (verified) {
      const signature = latest.items.map((item) => `${item.url}:${item.title}`).join("|");
      if (signature === lastSignature) return latest;
      lastSignature = signature;
    } else {
      lastSignature = "";
    }
    await sleep(Math.max(10, Math.min(pollInterval, deadline - Date.now())));
  }
  throw new Error(latest && mainstreamContentSiteFromUrl(latest.url) === expectedIntent.site
    ? `${expectedIntent.siteLabel}搜索结果在限定时间内没有稳定显示。`
    : `${expectedIntent.siteLabel}搜索页没有成功打开。`);
}

function highlightScriptFor(site, indexes) {
  const config = SITE_CONFIG[site];
  if (!config) throw new Error("不支持的内容站点。");
  return `
    (() => {
      document.querySelectorAll("[data-brizo-content-highlight]").forEach((node) => node.remove());
      const visible = (element) => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return style.display !== "none" && style.visibility !== "hidden"
          && Number(style.opacity || 1) > 0.02 && rect.width > 70 && rect.height > 32;
      };
      let cards = [];
      for (const selector of ${JSON.stringify(config.cardSelectors)}) {
        const matches = [...document.querySelectorAll(selector)].filter(visible);
        if (matches.length > cards.length) cards = matches;
      }
      const selected = ${JSON.stringify(indexes)}.map((index) => cards[index]).filter(Boolean);
      selected[0]?.scrollIntoView({ block: "center", behavior: "instant" });
      return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => {
        for (const card of selected) {
          const rect = card.getBoundingClientRect();
          if (rect.bottom < 0 || rect.top > innerHeight) continue;
          const overlay = document.createElement("div");
          overlay.dataset.brizoContentHighlight = "true";
          const left = Math.max(0, rect.left);
          const top = Math.max(0, rect.top);
          const right = Math.min(innerWidth, rect.right);
          const bottom = Math.min(innerHeight, rect.bottom);
          overlay.style.cssText = [
            "position:fixed", "pointer-events:none", "z-index:2147483647",
            "border:3px solid #e53935", "border-radius:8px", "box-sizing:border-box",
            "box-shadow:0 0 0 1px rgba(255,255,255,.9),0 2px 8px rgba(150,20,20,.2)",
            "left:" + left + "px", "top:" + top + "px",
            "width:" + Math.max(0, right - left) + "px",
            "height:" + Math.max(0, bottom - top) + "px",
          ].join(";");
          document.body.appendChild(overlay);
        }
        resolve(document.querySelectorAll("[data-brizo-content-highlight]").length);
      })));
    })()
  `;
}

export async function highlightMainstreamContentItems(webContents, intent, indexes) {
  const safeIndexes = (Array.isArray(indexes) ? indexes : [])
    .filter((index) => Number.isInteger(index) && index >= 0)
    .slice(0, 10);
  return await webContents.executeJavaScript(highlightScriptFor(intent?.site, safeIndexes));
}

export async function clearMainstreamContentHighlights(webContents) {
  if (!webContents || webContents.isDestroyed()) return;
  await webContents.executeJavaScript(
    `document.querySelectorAll("[data-brizo-content-highlight]").forEach((node) => node.remove())`,
  ).catch(() => {});
}

function safeMarkdownText(value, limit = 500) {
  return String(value || "")
    .replace(/\s+/gu, " ")
    .replace(/[\[\]]/gu, (character) => character === "[" ? "［" : "］")
    .trim()
    .slice(0, limit);
}

export function formatMainstreamContentResult(intent, items) {
  const selected = Array.isArray(items) ? items : [];
  const requested = Math.max(1, Number(intent?.count) || 5);
  const heading = intent?.contentType === "video" ? "视频"
    : intent?.contentType === "note" ? "笔记"
      : intent?.contentType === "post" ? "微博"
        : intent?.contentType === "review" ? "评论" : "条目";
  const lines = [
    `信息来源于：${intent?.siteLabel || "目标网站"}。`,
    "",
    `已核对“${safeMarkdownText(intent?.query, 160)}”的搜索结果，取得 ${selected.length} 条${heading}${selected.length < requested ? `；当前页面少于要求的 ${requested} 条` : ""}。`,
    "",
    `## ${heading}结果`,
  ];
  selected.forEach((item, index) => {
    const details = [item.author, item.date, ...(Array.isArray(item.metrics) ? item.metrics : [])]
      .map((value) => safeMarkdownText(value, 160)).filter(Boolean).slice(0, 5);
    lines.push(`${index + 1}. [${safeMarkdownText(item.title, 300)}](${item.url})${details.length ? ` — ${details.join(" · ")}` : ""}`);
    if (item.summary) lines.push(`   ${safeMarkdownText(item.summary, 500)}`);
  });
  return lines.join("\n");
}
