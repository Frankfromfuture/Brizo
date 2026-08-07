import { load } from "cheerio";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  clamp,
  domainFor,
  mapWithConcurrency,
  normalizeUrl,
  parseModelJson,
  safeText,
  slugify,
  tokenSimilarity,
  tokenize,
} from "../shared/search-text.mjs";

const DAY_MS = 24 * 60 * 60 * 1000;
const OVERNIGHT_REFRESH_MS = 30 * 60 * 1000;
const MAX_SIGNAL_ITEMS = 300;
const MAX_STORED_DAYS = 14;
const METADATA_FETCH_TIMEOUT_MS = 2_800;
const METADATA_CACHE_TTL_MS = 30 * 60_000;
const TOPIC_PROFILE_TTL_MS = 7 * DAY_MS;
const TOPIC_PROFILE_VERSION = 5;
const EDITION_CONTENT_VERSION = 20;
const REPORT_CONTENT_VERSION = 4;
const SIGNAL_KIND_SHARES = { bookmark: 0.45, search: 0.35, history: 0.2 };
const DEFAULT_TOPICS = [
  { id: "technology", label: "AI 与科技产业", weight: 0.34 },
  { id: "markets", label: "商业与全球市场", weight: 0.26 },
  { id: "china", label: "中国社会与政策", weight: 0.18 },
  { id: "world", label: "国际事务", weight: 0.12 },
  { id: "science", label: "科学、气候与文化", weight: 0.1 },
];

const EDITORIAL_SECTIONS = [
  { id: "technology", label: "科技与技术", page: 2, query: "今天 人工智能 芯片 科技产业 重大进展 权威媒体", serperGl: "cn", serperHl: "zh-cn", region: "国际", slots: 3, weight: 0.17 },
  { id: "business-finance", label: "商业与金融", page: 2, query: "今天 财经 公司 金融市场 重要新闻 界面 财新 第一财经", serperGl: "cn", serperHl: "zh-cn", region: "国际", slots: 3, weight: 0.16 },
  { id: "international", label: "国际重要新闻", page: 3, query: "今天 国际重大新闻 全球热点", serperQuery: "top world news today Reuters AP BBC", serperGl: "us", serperHl: "en", region: "国际", slots: 4, weight: 0.24 },
  { id: "domestic", label: "国内重要新闻", page: 3, query: "今天 中国 重大新闻 政策 社会 新华社 人民日报 中新网", serperGl: "cn", serperHl: "zh-cn", region: "国内", slots: 2, weight: 0.14 },
  { id: "arts-culture", label: "艺术与文化", page: 4, query: "今天 艺术 文化 设计 文学 电影 重要新闻 澎湃 界面", serperGl: "cn", serperHl: "zh-cn", region: "国际", slots: 3, weight: 0.15 },
  { id: "sports-entertainment", label: "体育与娱乐", page: 4, query: "今天 体育 赛事 娱乐 电影 重要新闻 中新网", serperGl: "cn", serperHl: "zh-cn", region: "国际", slots: 3, weight: 0.14 },
];

// Hard allowlist: Brief stories and citations may only come from these news domains.
const SOURCE_AUTHORITY = new Map([
  // Wire / global news
  ["reuters.com", 1], ["apnews.com", 0.98], ["afp.com", 0.96],
  ["bbc.com", 0.96], ["bbc.co.uk", 0.96], ["cnn.com", 0.9],
  ["nytimes.com", 0.92], ["washingtonpost.com", 0.9], ["theguardian.com", 0.9],
  ["ft.com", 0.96], ["wsj.com", 0.94], ["bloomberg.com", 0.96],
  ["cnbc.com", 0.88], ["economist.com", 0.94], ["time.com", 0.86],
  ["npr.org", 0.9], ["aljazeera.com", 0.88], ["politico.com", 0.86],
  ["axios.com", 0.84], ["scmp.com", 0.9], ["nikkei.com", 0.9],
  ["asia.nikkei.com", 0.9], ["japantimes.co.jp", 0.82],
  ["channelnewsasia.com", 0.86], ["straitstimes.com", 0.86], ["zaobao.com.sg", 0.88],
  ["dw.com", 0.88], ["france24.com", 0.86], ["euronews.com", 0.84],
  // China mainstream / finance
  ["news.cn", 0.96], ["xinhuanet.com", 0.95], ["people.com.cn", 0.92],
  ["cctv.com", 0.92], ["chinanews.com.cn", 0.9], ["chinanews.com", 0.9],
  ["chinadaily.com.cn", 0.9], ["globaltimes.cn", 0.84], ["gmw.cn", 0.86],
  ["thepaper.cn", 0.88], ["caixin.com", 0.92], ["yicai.com", 0.88],
  ["jiemian.com", 0.86], ["cls.cn", 0.9], ["stcn.com", 0.86],
  ["wallstreetcn.com", 0.88], ["ftchinese.com", 0.9], ["cn.nytimes.com", 0.9],
  ["sina.com.cn", 0.8], ["163.com", 0.8], ["qq.com", 0.8],
  ["sohu.com", 0.78], ["ifeng.com", 0.8], ["huanqiu.com", 0.82],
  ["bjnews.com.cn", 0.84], ["nfcmag.com", 0.8], ["infzm.com", 0.84],
  ["gov.cn", 1],
  // Tech / science
  ["techcrunch.com", 0.9], ["theverge.com", 0.88], ["wired.com", 0.88],
  ["arstechnica.com", 0.88], ["technologyreview.com", 0.92],
  ["cnet.com", 0.82], ["engadget.com", 0.82], ["zdnet.com", 0.8],
  ["nature.com", 0.96], ["science.org", 0.95], ["scientificamerican.com", 0.9],
  ["newscientist.com", 0.88], ["who.int", 1], ["un.org", 1],
  ["quantamagazine.org", 0.9], ["lwn.net", 0.86], ["krebsonsecurity.com", 0.88],
  ["developer.nvidia.com", 0.84],
  ["36kr.com", 0.86], ["huxiu.com", 0.84], ["jiqizhixin.com", 0.86],
  ["ithome.com", 0.82], ["pingwest.com", 0.8], ["geekpark.net", 0.8],
  // Arts / sports / entertainment
  ["espn.com", 0.88], ["skysports.com", 0.86], ["goal.com", 0.8],
  ["fifa.com", 0.86], ["nba.com", 0.84], ["olympics.com", 0.88],
  ["variety.com", 0.86], ["hollywoodreporter.com", 0.86], ["deadline.com", 0.84],
  ["rollingstone.com", 0.82], ["billboard.com", 0.82],
  ["artnews.com", 0.84], ["artforum.com", 0.82], ["theartnewspaper.com", 0.84],
]);

const BLOCKED_SOURCE_PATTERNS = [
  /(^|\.)wikipedia\.org$/i, /(^|\.)wikimedia\.org$/i, /(^|\.)wikidata\.org$/i,
  /(^|\.)wikihow\.com$/i, /(^|\.)baike\.baidu\.com$/i, /(^|\.)baike\.com$/i,
  /(^|\.)zhihu\.com$/i, /(^|\.)zhuanlan\.zhihu\.com$/i,
  /(^|\.)quora\.com$/i, /(^|\.)reddit\.com$/i,
  /(^|\.)stackoverflow\.com$/i, /(^|\.)stackexchange\.com$/i,
  /(^|\.)csdn\.net$/i, /(^|\.)juejin\.cn$/i, /(^|\.)segmentfault\.com$/i,
  /(^|\.)douban\.com$/i, /(^|\.)tieba\.baidu\.com$/i, /(^|\.)weibo\.com$/i,
  /(^|\.)bilibili\.com$/i, /(^|\.)youtube\.com$/i, /(^|\.)youtu\.be$/i,
  /(^|\.)facebook\.com$/i, /(^|\.)instagram\.com$/i, /(^|\.)twitter\.com$/i,
  /(^|\.)x\.com$/i, /(^|\.)linkedin\.com$/i, /(^|\.)pinterest\./i,
  /(^|\.)medium\.com$/i, /(^|\.)substack\.com$/i, /(^|\.)wordpress\.com$/i,
  /(^|\.)blogspot\./i, /(^|\.)tumblr\.com$/i, /(^|\.)github\.com$/i,
  /(^|\.)gitlab\.com$/i, /(^|\.)amazon\./i, /(^|\.)taobao\.com$/i,
  /(^|\.)tmall\.com$/i, /(^|\.)jd\.com$/i, /(^|\.)qcc\.com$/i,
  /(^|\.)tianyancha\.com$/i, /(^|\.)news\.google\./i, /(^|\.)google\./i,
  /(^|\.)bing\.com$/i, /(^|\.)duckduckgo\.com$/i, /(^|\.)baidu\.com$/i,
  /(^|\.)naver\.com$/i, /(^|\.)naver\.co\.kr$/i, /(^|\.)daum\.net$/i,
  /(^|\.)apple\.com$/i, /(^|\.)microsoft\.com$/i, /(^|\.)support\./i,
];

const LOW_QUALITY_BRIEF_HEADLINE = /(?:今日|每日|早间|午间|晚间|盘前|盘后).{0,14}(?:早报|晚报|简报|快讯|热点|要闻|新闻)|(?:早报|晚报|简报|一览|汇总|盘点).{0,18}(?:\d+[条个]|美股|天下事|热点)|\d+[条个].{0,10}(?:国际热点|新闻简报|每日热点)|(?:^|[_|｜])标签(?:[_|｜]|$)|网易出品$/i;

const SECTION_HUB_PATHS = new Set([
  "news", "world", "sports", "tech", "technology", "business", "finance",
  "entertainment", "culture", "science", "ai", "opinion", "politics", "china",
  "global", "stock", "video", "live", "photo", "photos", "topic", "topics",
  "tag", "tags", "category", "latest", "home", "index", "about", "search",
  "daily-news", "international", "national", "society", "economy", "arts",
]);

const LOCAL_TOPIC_TAXONOMY = [
  { id: "technology", label: "AI 与科技产业", query: "人工智能 芯片 科技产业", patterns: /AI|人工智能|模型|芯片|算力|软件|科技|机器人|数据中心|互联网/i },
  { id: "markets", label: "商业与全球市场", query: "商业 全球市场 公司 经济", patterns: /市场|商业|公司|企业|经济|供应链|消费|品牌|贸易|制造/i },
  { id: "china", label: "中国社会与政策", query: "中国 政策 社会 最新", patterns: /中国|国内|政策|社会|城市|就业|教育|地方|政府/i },
  { id: "world", label: "国际事务", query: "国际事务 地缘政治 全球 最新", patterns: /国际|全球|美国|欧洲|亚洲|外交|战争|地缘|联合国/i },
  { id: "science", label: "科学、气候与文化", query: "科学 气候 文化 最新", patterns: /科学|研究|气候|能源|环境|文化|航天|生物|材料/i },
  { id: "finance", label: "金融与投资", query: "金融 投资 资本市场 最新", patterns: /投资|金融|股票|基金|估值|资本|利率|债券|并购|融资/i },
];

const AUTHORITY_FEEDS = [
  { url: "https://feeds.bbci.co.uk/news/technology/rss.xml", sections: ["technology"], region: "国际" },
  { url: "https://feeds.bbci.co.uk/news/business/rss.xml", sections: ["business-finance"], region: "国际" },
  { url: "https://feeds.bbci.co.uk/news/world/rss.xml", sections: ["international"], region: "国际" },
  { url: "https://feeds.bbci.co.uk/news/world/asia/rss.xml", sections: ["international", "domestic"], region: "国际" },
  { url: "https://feeds.bbci.co.uk/news/science_and_environment/rss.xml", sections: ["technology"], region: "国际" },
  { url: "https://feeds.bbci.co.uk/news/entertainment_and_arts/rss.xml", sections: ["arts-culture", "sports-entertainment"], region: "国际" },
  { url: "https://feeds.bbci.co.uk/sport/rss.xml", sections: ["sports-entertainment"], region: "国际" },
  { url: "https://www.theguardian.com/world/rss", sections: ["international"], region: "国际" },
  { url: "https://www.theguardian.com/technology/rss", sections: ["technology"], region: "国际" },
  { url: "https://www.theguardian.com/business/rss", sections: ["business-finance"], region: "国际" },
  { url: "https://www.theguardian.com/culture/rss", sections: ["arts-culture"], region: "国际" },
  { url: "https://www.theguardian.com/sport/rss", sections: ["sports-entertainment"], region: "国际" },
  { url: "https://rss.nytimes.com/services/xml/rss/nyt/Technology.xml", sections: ["technology"], region: "国际" },
  { url: "https://rss.nytimes.com/services/xml/rss/nyt/Business.xml", sections: ["business-finance"], region: "国际" },
  { url: "https://rss.nytimes.com/services/xml/rss/nyt/World.xml", sections: ["international"], region: "国际" },
  { url: "https://rss.nytimes.com/services/xml/rss/nyt/Arts.xml", sections: ["arts-culture"], region: "国际" },
  { url: "https://rss.nytimes.com/services/xml/rss/nyt/Sports.xml", sections: ["sports-entertainment"], region: "国际" },
  { url: "https://www.aljazeera.com/xml/rss/all.xml", sections: ["international"], region: "国际" },
  { url: "https://www.npr.org/rss/rss.php?id=1001", sections: ["international"], region: "国际" },
  { url: "https://www.chinanews.com.cn/rss/scroll-news.xml", sections: ["domestic", "international", "business-finance"], region: "国内" },
  { url: "http://www.people.com.cn/rss/politics.xml", sections: ["domestic"], region: "国内" },
  { url: "http://www.people.com.cn/rss/society.xml", sections: ["domestic"], region: "国内" },
  { url: "http://www.people.com.cn/rss/finance.xml", sections: ["business-finance", "domestic"], region: "国内" },
  { url: "https://www.espn.com/espn/rss/news", sections: ["sports-entertainment"], region: "国际" },
];

// Curated direct RSS sources published in Horizon's MIT-licensed example and preset configs.
// Brizo consumes the original feeds directly and runs them through its own allowlist and editorial pipeline.
const HORIZON_CURATED_FEEDS = [
  { url: "https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=10000664", sections: ["business-finance"], region: "国际", sourceAdapter: "horizon-preset" },
  { url: "https://developer.nvidia.com/blog/tag/cuda/feed/", sections: ["technology"], region: "国际", sourceAdapter: "horizon-preset" },
  { url: "https://lwn.net/headlines/rss", sections: ["technology"], region: "国际", sourceAdapter: "horizon-preset" },
  { url: "https://krebsonsecurity.com/feed/", sections: ["technology"], region: "国际", sourceAdapter: "horizon-preset" },
  { url: "https://www.nature.com/nature.rss", sections: ["technology"], region: "国际", sourceAdapter: "horizon-preset" },
  { url: "https://api.quantamagazine.org/feed/", sections: ["technology", "arts-culture"], region: "国际", sourceAdapter: "horizon-preset" },
  { url: "https://feeds.feedburner.com/TechCrunch/", sections: ["technology"], region: "国际", sourceAdapter: "horizon-preset" },
  { url: "https://www.theverge.com/rss/index.xml", sections: ["technology"], region: "国际", sourceAdapter: "horizon-preset" },
  { url: "https://rss.nytimes.com/services/xml/rss/nyt/World.xml", sections: ["international"], region: "国际", sourceAdapter: "horizon-preset" },
  { url: "https://rss.nytimes.com/services/xml/rss/nyt/Technology.xml", sections: ["technology"], region: "国际", sourceAdapter: "horizon-preset" },
];

const RSSHUB_ROUTES = [
  { path: "/reuters/world", sections: ["international"], region: "国际" },
  { path: "/reuters/world/china", sections: ["international", "domestic"], region: "国际" },
  { path: "/reuters/business", sections: ["business-finance"], region: "国际" },
  { path: "/reuters/technology", sections: ["technology"], region: "国际" },
  { path: "/bloomberg/business", sections: ["business-finance"], region: "国际" },
  { path: "/thepaper/featured", sections: ["domestic", "international"], region: "国内" },
  { path: "/36kr/newsflashes", sections: ["technology", "business-finance"], region: "国内" },
  { path: "/caixin/latest", sections: ["business-finance", "domestic"], region: "国内" },
  { path: "/jiemian/lists/65", sections: ["technology"], region: "国内" },
  { path: "/jiemian/lists/800", sections: ["business-finance"], region: "国内" },
  { path: "/huxiu/moment", sections: ["technology", "business-finance"], region: "国内" },
  { path: "/wallstreetcn/news/global", sections: ["business-finance"], region: "国内" },
  { path: "/cls/telegraph", sections: ["business-finance"], region: "国内" },
  { path: "/zaobao/realtime/china", sections: ["domestic", "international"], region: "国际" },
  { path: "/zaobao/realtime/world", sections: ["international"], region: "国际" },
  { path: "/bbc/chinese", sections: ["international"], region: "国际" },
  { path: "/ithome/ranking/24h", sections: ["technology"], region: "国内" },
  { path: "/jiqizhixin", sections: ["technology"], region: "国内" },
];

export function buildSupplementalFeeds(env = process.env) {
  const configured = safeText(env?.BRIZO_RSSHUB_BASE_URL, 500);
  const baseCandidate = configured || "http://127.0.0.1:1200";
  let rssHubBaseUrl = "";
  try {
    const parsed = new URL(baseCandidate);
    if (parsed.protocol === "https:" || (parsed.protocol === "http:" && ["127.0.0.1", "localhost", "::1"].includes(parsed.hostname))) {
      rssHubBaseUrl = parsed.href.replace(/\/$/, "");
    }
  } catch {
    rssHubBaseUrl = "";
  }
  const rssHubFeeds = rssHubBaseUrl ? RSSHUB_ROUTES.map((route) => ({
    ...route,
    sourceAdapter: "rsshub",
    url: `${rssHubBaseUrl}${route.path}`,
  })) : [];
  return [...HORIZON_CURATED_FEEDS, ...rssHubFeeds];
}

const FEED_CACHE_TTL_MS = 20 * 60_000;
const feedCache = new Map();
const PERSONAL_TOPIC_FEED_SECTIONS = {
  technology: ["technology"],
  science: ["technology"],
  markets: ["business-finance"],
  finance: ["business-finance"],
  world: ["international"],
  china: ["domestic"],
};

const metadataCache = new Map();

function editionKindAt(input = Date.now()) {
  const date = new Date(input);
  const hour = date.getHours();
  if (hour < 9) return "overnight";
  if (hour < 18) return "morning";
  return "evening";
}

function localDateKey(input = Date.now()) {
  const date = new Date(input);
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

export function getEditionDescriptor(input = Date.now()) {
  const date = new Date(input);
  const kind = editionKindAt(date);
  const keyDate = kind === "overnight"
    ? new Date(date.getFullYear(), date.getMonth(), date.getDate())
    : date;
  const publicationHour = kind === "morning" ? 9 : kind === "evening" ? 18 : 0;
  const publishedAt = new Date(
    keyDate.getFullYear(),
    keyDate.getMonth(),
    keyDate.getDate(),
    publicationHour,
  ).toISOString();
  return {
    id: `${localDateKey(keyDate)}:${kind}`,
    kind,
    label: kind === "morning"
      ? "THE MORNING POST"
      : kind === "evening"
        ? "THE EVENING POST"
        : "OVERNIGHT UPDATE",
    publishedAt,
  };
}

function recencyMultiplier(timestamp, halfLifeDays, now) {
  const age = Math.max(0, now - Number(timestamp || now));
  return 2 ** (-(age / DAY_MS) / halfLifeDays);
}

export function scoreBriefSignals(payload, now = Date.now()) {
  const signals = [];
  const add = ({ base, count = 1, domain = "", halfLife, kind, text, timestamp }) => {
    const label = safeText(text, 280);
    if (!label) return;
    const frequency = clamp(1 + Math.log(Math.max(1, Number(count) || 1)), 1, 2.5);
    signals.push({
      domain: safeText(domain, 160),
      kind,
      score: base * frequency * recencyMultiplier(timestamp, halfLife, now),
      text: label,
      timestamp: Number(timestamp) || now,
    });
  };

  (Array.isArray(payload?.bookmarks) ? payload.bookmarks : []).slice(0, MAX_SIGNAL_ITEMS)
    .forEach((item) => add({
      base: 5,
      domain: item.domain,
      halfLife: 180,
      kind: "bookmark",
      text: [item.title, item.folder].filter(Boolean).join(" · "),
      timestamp: Math.max(Number(item.updatedAt) || 0, Number(item.createdAt) || 0) || now,
    }));
  (Array.isArray(payload?.searches) ? payload.searches : []).slice(0, MAX_SIGNAL_ITEMS)
    .forEach((item) => add({
      base: 4,
      count: item.count,
      halfLife: 60,
      kind: "search",
      text: item.query,
      timestamp: item.updatedAt,
    }));
  (Array.isArray(payload?.history) ? payload.history : []).slice(0, MAX_SIGNAL_ITEMS)
    .forEach((item) => add({
      base: 1,
      count: item.visits,
      domain: item.domain,
      halfLife: 30,
      kind: "history",
      text: item.title,
      timestamp: item.updatedAt,
    }));
  // Normalize each signal family before combining them. A large imported bookmark
  // library should remain useful without drowning out recent explicit searches.
  const totals = new Map();
  for (const signal of signals) totals.set(signal.kind, (totals.get(signal.kind) || 0) + signal.score);
  const availableShare = [...totals.keys()].reduce((sum, kind) => sum + (SIGNAL_KIND_SHARES[kind] || 0), 0) || 1;
  return signals.map((signal) => ({
    ...signal,
    score: signal.score / Math.max(0.001, totals.get(signal.kind) || 1)
      * ((SIGNAL_KIND_SHARES[signal.kind] || 0) / availableShare) * 100,
  })).sort((left, right) => right.score - left.score).slice(0, 360);
}

function fastFingerprint(value) {
  let hash = 2_166_136_261;
  const text = String(value || "");
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return (hash >>> 0).toString(36);
}

export function inferTopicsFromSignals(signals, preferences = {}) {
  const weighted = LOCAL_TOPIC_TAXONOMY.map((topic, index) => ({
    ...topic,
    weight: 0.08 + (DEFAULT_TOPICS[index]?.weight || 0.08) * 0.25,
  }));
  for (const signal of signals.slice(0, 180)) {
    const haystack = `${signal.text || ""} ${signal.domain || ""}`;
    for (const topic of weighted) {
      if (topic.patterns.test(haystack)) topic.weight += Math.min(12, Number(signal.score) || 0);
    }
  }
  return selectTopics(weighted.map(({ patterns: _patterns, ...topic }) => topic), preferences);
}

function topicProfileFingerprint(signals, preferences) {
  return fastFingerprint(JSON.stringify({
    preferences: {
      muted: preferences?.mutedTopicIds || [],
      pinned: preferences?.pinnedTopicIds || [],
      reduced: preferences?.reducedTopicIds || [],
    },
    signals: signals.slice(0, 120).map((signal) => [
      signal.kind,
      signal.text,
      signal.domain,
      Math.round(signal.score * 10),
    ]),
  }));
}

function normalizeTopic(topic, index) {
  const label = safeText(topic?.label || topic?.name, 60) || DEFAULT_TOPICS[index]?.label || `关注主题 ${index + 1}`;
  return {
    id: slugify(topic?.id || label, `topic-${index + 1}`),
    label,
    query: safeText(topic?.query || label, 100),
    evidenceTerms: (Array.isArray(topic?.evidenceTerms) ? topic.evidenceTerms : [])
      .map((term) => safeText(term, 40)).filter((term) => term.length >= 2).slice(0, 6),
    weight: Math.max(0, Number(topic?.weight) || 0),
  };
}

function topicTextSimilarity(left, right) {
  const tokenScore = tokenSimilarity(`${left.label} ${left.query}`, `${right.label} ${right.query}`);
  const bigrams = (value) => {
    const compact = safeText(value, 200).toLowerCase().replace(/[\s、，,·与和及的]/g, "");
    return new Set(Array.from({ length: Math.max(0, compact.length - 1) }, (_, index) => compact.slice(index, index + 2)));
  };
  const a = bigrams(left.label);
  const b = bigrams(right.label);
  let overlap = 0;
  for (const pair of a) if (b.has(pair)) overlap += 1;
  return Math.max(tokenScore, overlap / Math.max(1, Math.min(a.size, b.size)));
}

function capTopicConcentration(topics, cap = 0.45) {
  let weights = topics.map((topic) => Math.max(0, topic.weight));
  for (let pass = 0; pass < 8; pass += 1) {
    const total = weights.reduce((sum, weight) => sum + weight, 0) || 1;
    weights = weights.map((weight) => weight / total);
    const excess = weights.reduce((sum, weight) => sum + Math.max(0, weight - cap), 0);
    if (excess < 0.0001) break;
    const recipients = weights.map((weight, index) => ({ index, room: Math.max(0, cap - weight) }))
      .filter((item) => item.room > 0);
    const roomTotal = recipients.reduce((sum, item) => sum + item.room, 0) || 1;
    weights = weights.map((weight) => Math.min(cap, weight));
    for (const recipient of recipients) weights[recipient.index] += excess * recipient.room / roomTotal;
  }
  return topics.map((topic, index) => ({ ...topic, weight: weights[index] }));
}

export function groundModelTopics(rawTopics, signals, preferences = {}) {
  const signalTexts = signals.slice(0, 240).map((signal) => ({
    score: Number(signal.score) || 0,
    text: `${signal.text || ""} ${signal.domain || ""}`.toLowerCase(),
  }));
  const grounded = [];
  for (const [index, rawTopic] of (Array.isArray(rawTopics) ? rawTopics : []).slice(0, 10).entries()) {
    const topic = normalizeTopic(rawTopic, index);
    const terms = [...topic.evidenceTerms, ...tokenize(`${topic.label} ${topic.query}`)]
      .map((term) => term.toLowerCase()).filter((term) => term.length >= 2);
    const uniqueTerms = [...new Set(terms)];
    const supportingSignals = signalTexts.filter((signal) => uniqueTerms.some((term) => signal.text.includes(term)));
    const support = supportingSignals.reduce((sum, signal) => sum + signal.score, 0);
    if (support < 0.75 || supportingSignals.length < 1) continue;
    const duplicate = grounded.find((existing) => topicTextSimilarity(existing, topic) >= 0.5);
    const candidate = { ...topic, support, weight: Math.sqrt(Math.max(0.001, topic.weight) * support) };
    if (!duplicate) grounded.push(candidate);
    else if (candidate.support > duplicate.support) Object.assign(duplicate, candidate);
  }
  if (grounded.length < 3) return inferTopicsFromSignals(signals, preferences);
  const local = inferTopicsFromSignals(signals, preferences);
  // Keep a modest general-news prior so a narrow recent streak cannot consume the paper.
  const blended = grounded.map((topic) => ({ ...topic, weight: topic.weight * 0.82 }));
  for (const fallback of local) {
    if (blended.some((topic) => topicTextSimilarity(topic, fallback) >= 0.5)) continue;
    blended.push({ ...fallback, weight: fallback.weight * 0.18 });
  }
  return selectTopics(capTopicConcentration(blended), preferences);
}

export function selectTopics(rawTopics, preferences = {}) {
  const pinned = new Set(Array.isArray(preferences?.pinnedTopicIds) ? preferences.pinnedTopicIds : []);
  const reduced = new Set(Array.isArray(preferences?.reducedTopicIds) ? preferences.reducedTopicIds : []);
  const muted = new Set(Array.isArray(preferences?.mutedTopicIds) ? preferences.mutedTopicIds : []);
  let topics = (Array.isArray(rawTopics) ? rawTopics : DEFAULT_TOPICS)
    .slice(0, 10)
    .map(normalizeTopic)
    .filter((topic) => !muted.has(topic.id));
  if (topics.length < 3) {
    const existing = new Set(topics.map((topic) => topic.id));
    topics = [...topics, ...DEFAULT_TOPICS.map(normalizeTopic).filter((topic) => !existing.has(topic.id) && !muted.has(topic.id))];
  }
  topics = topics.map((topic) => ({
    ...topic,
    weight: topic.weight * (reduced.has(topic.id) && !pinned.has(topic.id) ? 0.45 : 1),
  }));
  const total = topics.reduce((sum, topic) => sum + topic.weight, 0) || topics.length;
  topics = topics.map((topic) => ({
    ...topic,
    weight: topic.weight ? topic.weight / total : 1 / topics.length,
  })).sort((left, right) => {
    const pinDifference = Number(pinned.has(right.id)) - Number(pinned.has(left.id));
    return pinDifference || right.weight - left.weight;
  });
  const selected = topics.slice(0, 3);
  for (const topic of topics.slice(3)) {
    if (selected.length >= 6) break;
    if (pinned.has(topic.id) || topic.weight >= 0.08) selected.push(topic);
  }
  const selectedTotal = selected.reduce((sum, topic) => sum + topic.weight, 0) || 1;
  return capTopicConcentration(selected.map((topic) => ({ ...topic, weight: topic.weight / selectedTotal })));
}

export function allocateStorySlots(topics, totalSlots = 18) {
  if (!topics.length) return [];
  const allocation = topics.map((topic) => ({
    id: topic.id,
    ideal: topic.weight * totalSlots,
    slots: 3,
  }));
  let remaining = totalSlots - allocation.reduce((sum, item) => sum + item.slots, 0);
  while (remaining > 0) {
    const candidate = allocation
      .filter((item) => item.slots < 6)
      .sort((left, right) => (right.ideal - right.slots) - (left.ideal - left.slots))[0];
    if (!candidate) break;
    candidate.slots += 1;
    remaining -= 1;
  }
  return topics.map((topic) => ({
    ...topic,
    slots: allocation.find((item) => item.id === topic.id)?.slots || 3,
  }));
}

function matchesDomainEntry(domain, knownDomain) {
  return domain === knownDomain || domain.endsWith(`.${knownDomain}`);
}

function isBlockedBriefDomain(domain) {
  const host = String(domain || "").toLowerCase();
  return BLOCKED_SOURCE_PATTERNS.some((pattern) => pattern.test(host));
}

function matchedAuthority(domain) {
  const host = String(domain || "").toLowerCase();
  for (const [knownDomain, score] of SOURCE_AUTHORITY) {
    if (matchesDomainEntry(host, knownDomain)) return score;
  }
  return 0;
}

export function isLikelyArticleUrl(rawUrl) {
  try {
    const url = new URL(rawUrl);
    const path = url.pathname.replace(/\/+$/, "");
    if (!path) return false;
    const segments = path.split("/").filter(Boolean);
    if (!segments.length) return false;
    if (segments.length === 1 && SECTION_HUB_PATHS.has(segments[0].toLowerCase())) return false;
    if (segments.length === 1) {
      const only = segments[0];
      if (!/\d{3,}|article|story|content|detail|doc|shtml|html|post|report/i.test(only)
        && !(only.length >= 18 && /[-_]/.test(only))) {
        return false;
      }
    }
    if (segments.length === 2 && SECTION_HUB_PATHS.has(segments[0].toLowerCase())
      && SECTION_HUB_PATHS.has(segments[1].toLowerCase())) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

export function isAllowedBriefSource(rawUrl, domain = "") {
  const url = normalizeUrl(rawUrl);
  const host = String(domain || domainFor(url || rawUrl)).toLowerCase();
  if (!url || !host) return false;
  if (isBlockedBriefDomain(host)) return false;
  if (!matchedAuthority(host)) return false;
  return isLikelyArticleUrl(url);
}

export function isLowQualityBriefResult(result) {
  const title = safeText(result?.title || result?.name, 400);
  return title.replace(/[\s\p{P}\p{S}]/gu, "").length < 8 || LOW_QUALITY_BRIEF_HEADLINE.test(title);
}

function sourceAuthority(domain) {
  return matchedAuthority(domain) || 0;
}

function publishedRecency(publishedAt, now) {
  const timestamp = Date.parse(publishedAt || "");
  if (!Number.isFinite(timestamp)) return 0.45;
  const hours = Math.max(0, now - timestamp) / 3_600_000;
  return clamp(1 - hours / 72, 0.08, 1);
}

function resultScore(result, topic, resultIndex, groupSize, now) {
  const title = `${result.title} ${result.snippet}`;
  const relevance = Math.max(0.12, tokenSimilarity(topic.query || topic.label, title));
  const attention = clamp(groupSize / 4, 0.2, 1);
  const recency = publishedRecency(result.publishedAt, now);
  const authority = sourceAuthority(result.domain);
  if (!authority) return 0;
  return relevance * 0.35 + attention * 0.25 + recency * 0.25 + authority * 0.15 - resultIndex * 0.002;
}

export function briefSourcePriority(sourceAdapter) {
  if (sourceAdapter === "serper-news") return 2;
  if (sourceAdapter === "bocha-news") return 1;
  return 0;
}

function clusterResults(results) {
  const clusters = [];
  for (const result of results) {
    const match = clusters.find((cluster) => tokenSimilarity(cluster[0].title, result.title) >= 0.42);
    if (match) match.push(result);
    else clusters.push([result]);
  }
  return clusters;
}

function readMetaContent($, selectors) {
  for (const selector of selectors) {
    const value = $(selector).first().attr("content")
      || $(selector).first().attr("href")
      || $(selector).first().attr("src")
      || $(selector).first().text();
    if (safeText(value, 4_000)) return safeText(value, 4_000);
  }
  return "";
}

async function fetchEnrichedResult(result) {
  const url = normalizeUrl(result.url);
  if (!url) return { ...result, domain: domainFor(result.url) };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), METADATA_FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/126 Safari/537.36",
      },
      redirect: "follow",
      signal: controller.signal,
    });
    if (!response.ok || !String(response.headers.get("content-type") || "").includes("text/html")) {
      return { ...result, domain: domainFor(url), url };
    }
    const html = (await response.text()).slice(0, 600_000);
    const $ = load(html);
    let jsonLd = {};
    $("script[type='application/ld+json']").each((_, element) => {
      if (jsonLd.datePublished && jsonLd.image) return;
      try {
        const parsed = JSON.parse($(element).text());
        const items = Array.isArray(parsed) ? parsed : parsed?.["@graph"] || [parsed];
        const article = items.find((item) => /Article|NewsArticle|ReportageNewsArticle/i.test(String(item?.["@type"] || "")));
        if (article) jsonLd = article;
      } catch {
        // Ignore invalid structured data.
      }
    });
    const imageCandidate = Array.isArray(jsonLd.image) ? jsonLd.image[0] : jsonLd.image;
    const imageUrl = typeof imageCandidate === "string" ? imageCandidate : imageCandidate?.url;
    const rawImageUrl = imageUrl || readMetaContent($, [
      "meta[property='og:image']",
      "meta[name='twitter:image']",
      "article img[src]",
      "main img[src]",
      "figure img[src]",
    ]);
    let resolvedImageUrl = "";
    try { resolvedImageUrl = new URL(rawImageUrl, url).href; } catch { resolvedImageUrl = ""; }
    const structuredBody = safeText(jsonLd.articleBody, 6_000);
    const paragraphBody = $("article p, [itemprop='articleBody'] p, main p").toArray()
      .map((element) => safeText($(element).text(), 1_000))
      .filter((text) => text.length >= 35)
      .slice(0, 12)
      .join("\n");
    return {
      ...result,
      author: safeText(jsonLd.author?.name || jsonLd.author?.[0]?.name || readMetaContent($, ["meta[name='author']"]), 140),
      bodyExcerpt: safeText(structuredBody || paragraphBody, 6_000),
      domain: domainFor(url),
      imageUrl: normalizeUrl(resolvedImageUrl),
      publishedAt: safeText(jsonLd.datePublished || readMetaContent($, ["meta[property='article:published_time']", "time[datetime]"]), 100),
      title: safeText(readMetaContent($, ["meta[property='og:title']", "meta[name='twitter:title']"]) || result.title, 400),
      url,
    };
  } catch {
    return { ...result, domain: domainFor(url), url };
  } finally {
    clearTimeout(timeout);
  }
}

async function enrichResult(result) {
  const url = normalizeUrl(result.url);
  if (!url) return { ...result, domain: domainFor(result.url) };
  const cached = metadataCache.get(url);
  if (cached?.value && cached.expiresAt > Date.now()) return { ...result, ...cached.value };
  if (cached?.promise) return { ...result, ...(await cached.promise) };
  const promise = fetchEnrichedResult({ ...result, url }).then((value) => {
    metadataCache.set(url, { expiresAt: Date.now() + METADATA_CACHE_TTL_MS, value });
    if (metadataCache.size > 400) metadataCache.delete(metadataCache.keys().next().value);
    return value;
  }).catch((error) => {
    metadataCache.delete(url);
    throw error;
  });
  metadataCache.set(url, { promise });
  return { ...result, ...(await promise) };
}

function feedSectionIdsForTopic(topic) {
  if (EDITORIAL_SECTIONS.some((section) => section.id === topic.id)) return [topic.id];
  return PERSONAL_TOPIC_FEED_SECTIONS[topic.id] || EDITORIAL_SECTIONS.map((section) => section.id);
}

function parseAuthorityFeedXml(xml, feedMeta) {
  const $ = load(String(xml || ""), { xmlMode: true });
  const items = [];
  const nodes = $("item").length ? $("item") : $("entry");
  nodes.each((_, element) => {
    if (items.length >= 24) return;
    const node = $(element);
    const title = safeText(node.find("title").first().text(), 400);
    const linkText = node.find("link").first().text()
      || node.find("link").first().attr("href")
      || node.find("guid").first().text()
      || "";
    const url = normalizeUrl(linkText);
    const domain = domainFor(url);
    if (!title || !isAllowedBriefSource(url, domain)) return;
    const rawBody = node.find("content\\:encoded").first().text()
      || node.find("content").first().text()
      || node.find("description").first().text()
      || node.find("summary").first().text()
      || title;
    const bodyExcerpt = safeText(load(`<body>${rawBody}</body>`)("body").text() || rawBody, 6_000);
    const snippet = safeText(bodyExcerpt, 1_000);
    const rawImage = node.find("media\\:content").first().attr("url")
      || node.find("media\\:thumbnail").first().attr("url")
      || node.find("enclosure[type^='image']").first().attr("url")
      || "";
    const publishedAt = safeText(
      node.find("pubDate").first().text()
        || node.find("published").first().text()
        || node.find("updated").first().text(),
      100,
    );
    items.push({
      bodyExcerpt,
      domain,
      imageUrl: normalizeUrl(rawImage),
      publishedAt,
      region: feedMeta.region,
      sections: feedMeta.sections,
      snippet: safeText(snippet, 1_000),
      sourceAdapter: feedMeta.sourceAdapter || "publisher-rss",
      title,
      url,
    });
  });
  return items;
}

async function fetchAuthorityFeed(feedMeta, force = false) {
  const cached = feedCache.get(feedMeta.url);
  if (!force && cached?.value && cached.expiresAt > Date.now()) return cached.value;
  if (!force && cached?.promise) return cached.promise;
  const promise = (async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6_000);
    try {
      const response = await fetch(feedMeta.url, {
        headers: {
          Accept: "application/rss+xml,application/atom+xml,application/xml,text/xml;q=0.9,*/*;q=0.8",
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/126 Safari/537.36",
        },
        redirect: "follow",
        signal: controller.signal,
      });
      if (!response.ok) return [];
      const items = parseAuthorityFeedXml(await response.text(), feedMeta);
      feedCache.set(feedMeta.url, { expiresAt: Date.now() + FEED_CACHE_TTL_MS, value: items });
      if (feedCache.size > 80) feedCache.delete(feedCache.keys().next().value);
      return items;
    } catch {
      return [];
    } finally {
      clearTimeout(timeout);
    }
  })().catch((error) => {
    feedCache.delete(feedMeta.url);
    throw error;
  });
  feedCache.set(feedMeta.url, { promise });
  return promise;
}

async function collectAuthorityFeedResults(topic, force = false) {
  const sectionIds = new Set(feedSectionIdsForTopic(topic));
  const feeds = [...AUTHORITY_FEEDS, ...buildSupplementalFeeds()]
    .filter((feed) => feed.sections.some((section) => sectionIds.has(section)));
  const groups = await mapWithConcurrency(feeds, 6, (feed) => fetchAuthorityFeed(feed, force));
  const deduped = [];
  const seen = new Set();
  for (const item of groups.flat()) {
    if (!item?.url || seen.has(item.url)) continue;
    seen.add(item.url);
    deduped.push(item);
  }
  return deduped;
}

function sourcesForCluster(cluster, allResults, limit = 12) {
  const combined = [...cluster].filter((item) => isAllowedBriefSource(item.url, item.domain));
  const seenDomains = new Set(combined.map((item) => item.domain));
  for (const candidate of allResults) {
    if (combined.length >= limit) break;
    if (!isAllowedBriefSource(candidate.url, candidate.domain)) continue;
    if (seenDomains.has(candidate.domain)) continue;
    if (tokenSimilarity(cluster[0]?.title, `${candidate.title} ${candidate.snippet}`) < 0.24) continue;
    combined.push(candidate);
    seenDomains.add(candidate.domain);
  }
  return combined.slice(0, limit).map((source, index) => ({
    author: safeText(source.author, 120),
    bodyExcerpt: safeText(source.bodyExcerpt, 6_000),
    id: `source-${index + 1}`,
    domain: source.domain,
    imageUrl: normalizeUrl(source.imageUrl),
    faviconUrl: normalizeUrl(source.faviconUrl),
    publishedAt: source.publishedAt || "",
    snippet: safeText(source.snippet, 1_000),
    sourceAdapter: safeText(source.sourceAdapter, 40),
    title: safeText(source.title, 400),
    url: normalizeUrl(source.url),
  })).filter((source) => source.url);
}

function fallbackSummary(result) {
  return `${safeText(result.snippet || result.title, 500)} [1]`;
}

function cleanBriefHeadline(value) {
  return safeText(value, 400)
    .replace(/\s*[_|｜]\s*(?:手机)?(?:网易|腾讯|界面|新浪|搜狐|凤凰|澎湃|财联社|第一财经)(?:新闻|网)?(?:[_|｜].*)?$/i, "")
    .trim();
}

export function createExtractiveSummary(sources) {
  const used = new Set();
  const parts = [];
  for (const [index, source] of sources.slice(0, 2).entries()) {
    const text = safeText(source.snippet || source.title, 54);
    const normalized = text.toLowerCase();
    if (!text || used.has(normalized)) continue;
    used.add(normalized);
    parts.push(`${text.replace(/[。；;，,\s]+$/, "")}。[${index + 1}]`);
  }
  return parts.join("");
}

function containsChinese(value) {
  return /[\u3400-\u9fff]/u.test(String(value || ""));
}

async function translateStoriesForPublication(stories, callModel, fallbackModel) {
  const unique = [...new Map(stories.map((story) => [story.url || story.id, story])).values()];
  const publishedIds = new Set();
  const foreignStories = [];
  let directChineseCount = 0;
  for (const story of unique) {
    const primary = story.sources?.[0];
    const sourceTitle = safeText(primary?.title || story.headline, 220);
    const sourceExcerpt = safeText(primary?.bodyExcerpt || primary?.snippet || story.summary, 1_000);
    if (containsChinese(sourceTitle) && containsChinese(sourceExcerpt)) {
      story.headline = cleanBriefHeadline(sourceTitle);
      story.summary = `${sourceExcerpt.replace(/\s*\[\d+\]\s*$/g, "")} [1]`;
      story.translationState = "source-chinese";
      publishedIds.add(story.url || story.id);
      directChineseCount += 1;
    } else {
      foreignStories.push(story);
    }
  }
  const systemPrompt = [
    "你是新闻翻译员，只做忠实的英译中或其他外语译中，不选稿、不改写、不概括、不补充事实。",
    "逐条翻译输入的原始标题和正文摘录，保留公司、人名、数字、时间、引语归属和不确定性。不得合并不同来源，不得加入评价、背景、趋势或解释。",
    "返回严格 JSON：{\"stories\":[{\"id\":\"输入短编号\",\"headline\":\"中文直译标题\",\"excerpt\":\"中文直译正文摘录\"}]}，不要输出 markdown。",
  ].join("\n");
  const translateBatch = async (batch, translate) => {
    if (!translate) return [];
    try {
      const keyed = batch.map((story, index) => ({ key: `s${index + 1}`, story }));
      const response = await translate({
        systemPrompt,
        query: JSON.stringify(keyed.map(({ key, story }) => ({
          id: key,
          excerpt: safeText(story.sources?.[0]?.bodyExcerpt || story.sources?.[0]?.snippet || story.summary, 180),
          title: safeText(story.sources?.[0]?.title || story.headline, 180),
        }))),
        timeoutMs: 15_000,
      });
      const parsed = response?.status === "success" ? parseModelJson(response.message) : null;
      if (!parsed) {
        console.warn("[brief-translation]", safeText(response?.message || "翻译接口没有返回可解析的 JSON", 240));
      }
      const returned = new Map((Array.isArray(parsed?.stories) ? parsed.stories : []).map((item) => [item?.id, item]));
      const pairs = keyed.flatMap(({ key, story }) => {
        const item = returned.get(key);
        if (!item || !containsChinese(item.headline) || !containsChinese(item.excerpt)) return [];
        return [[story.url || story.id, item]];
      });
      return pairs;
    } catch (err) {
      console.warn("[brief-translation] Model call error:", err?.message || String(err));
      return [];
    }
  };
  const translated = new Map(foreignStories.length ? await translateBatch(foreignStories, callModel) : []);
  const missingAfterPrimary = foreignStories.filter((story) => !translated.has(story.url || story.id));
  if (missingAfterPrimary.length && fallbackModel && fallbackModel !== callModel) {
    for (const [key, item] of await translateBatch(missingAfterPrimary, fallbackModel)) translated.set(key, item);
  }
  for (const story of foreignStories) {
    const translation = translated.get(story.url || story.id);
    if (translation) {
      story.headline = cleanBriefHeadline(translation.headline);
      story.summary = `${safeText(translation.excerpt, 1_000).replace(/\s*\[\d+\]\s*$/g, "")} [1]`;
      story.translationState = "translated";
    } else {
      story.headline = safeText(story.sources?.[0]?.title || story.headline, 220);
      story.summary = `${safeText(story.sources?.[0]?.bodyExcerpt || story.summary, 1_000).replace(/\s*\[\d+\]\s*$/g, "")} [1]`;
      story.translationState = "source-untranslated";
    }
    publishedIds.add(story.url || story.id);
  }
  return {
    candidateCount: unique.length,
    directChineseCount,
    publishedIds,
    translatedCount: translated.size,
    translationFailureCount: foreignStories.length - translated.size,
  };
}

const DEFAULT_SECTION_IMAGES = [
  "https://images.unsplash.com/photo-1578575437130-527eed3abbec?auto=format&fit=crop&w=1400&q=82",
  "https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=800&q=80",
  "https://images.unsplash.com/photo-1521295121783-8a321d551ad2?auto=format&fit=crop&w=800&q=80",
  "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=800&q=80",
  "https://images.unsplash.com/photo-1451187580459-43490279c0fa?auto=format&fit=crop&w=800&q=80",
];

function buildStoriesForTopic({ results, topic, allResults, now }) {
  const prepared = results.map((result, index) => {
    const primary = {
      ...result.primary,
      imageUrl: result.primary.imageUrl || DEFAULT_SECTION_IMAGES[index % DEFAULT_SECTION_IMAGES.length],
    };
    return {
      id: `story-${index + 1}`,
      primary,
      region: result.region,
      sources: sourcesForCluster([{ ...primary }, ...result.cluster.slice(1)], allResults, 12),
    };
  });
  return prepared.map((item, index) => {
    const summary = createExtractiveSummary(item.sources) || fallbackSummary(item.primary);
    return {
      id: `${topic.id}-${index + 1}-${slugify(item.primary.title, "story")}`,
      author: safeText(item.primary.author, 120),
      headline: cleanBriefHeadline(item.primary.title),
      imageUrl: normalizeUrl(item.primary.imageUrl),
      publishedAt: item.primary.publishedAt || new Date(now).toISOString(),
      region: item.region,
      score: Number(item.primary.score) || 0,
      sources: item.sources,
      summary: safeText(summary, 1_000),
      topicId: topic.id,
      topicLabel: topic.label,
      url: normalizeUrl(item.primary.url),
    };
  });
}

function packTopicPages(sections) {
  const pages = [[], [], []];
  const totals = [0, 0, 0];
  [...sections].sort((left, right) => right.stories.length - left.stories.length).forEach((section) => {
    const target = totals.indexOf(Math.min(...totals));
    pages[target].push(section);
    totals[target] += section.stories.length;
  });
  return pages;
}

export function selectFrontStories(stories, limit = 8) {
  const compareStories = (left, right) => {
    const providerDelta = briefSourcePriority(right.sources?.[0]?.sourceAdapter)
      - briefSourcePriority(left.sources?.[0]?.sourceAdapter);
    return providerDelta || (right.score || 0) - (left.score || 0);
  };
  const ranked = [...stories].sort(compareStories);
  const selected = [];
  const topicCounts = new Map();
  const topicCount = new Set(ranked.map((story) => story.topicId).filter(Boolean)).size;
  const topicCap = topicCount ? Math.max(2, Math.ceil(limit / topicCount)) : Number.POSITIVE_INFINITY;
  const add = (story) => {
    if (!story || selected.some((item) => item.id === story.id)) return;
    if (story.topicId && (topicCounts.get(story.topicId) || 0) >= topicCap) return;
    selected.push(story);
    if (story.topicId) topicCounts.set(story.topicId, (topicCounts.get(story.topicId) || 0) + 1);
  };
  const addRegion = (region) => {
    for (const story of ranked.filter((item) => item.region === region)) {
      if (selected.filter((item) => item.region === region).length >= 2) break;
      add(story);
    }
  };
  addRegion("国内");
  addRegion("国际");
  ranked.forEach((story) => { if (selected.length < limit) add(story); });
  return selected.slice(0, limit).sort(compareStories);
}

function sanitizeSignals(payload) {
  return {
    bookmarks: (Array.isArray(payload?.bookmarks) ? payload.bookmarks : []).filter((item) => !item?.private && !item?.isPrivate).slice(0, MAX_SIGNAL_ITEMS).map((item) => ({
      createdAt: Number(item.createdAt) || 0,
      domain: safeText(item.domain, 160),
      folder: safeText(item.folder, 200),
      title: safeText(item.title, 280),
      updatedAt: Number(item.updatedAt) || 0,
    })),
    history: (Array.isArray(payload?.history) ? payload.history : []).filter((item) => !item?.private && !item?.isPrivate).slice(0, MAX_SIGNAL_ITEMS).map((item) => ({
      domain: safeText(item.domain, 160),
      title: safeText(item.title, 280),
      updatedAt: Number(item.updatedAt) || 0,
      visits: clamp(Number(item.visits) || 1, 1, 10_000),
    })),
    searches: (Array.isArray(payload?.searches) ? payload.searches : []).filter((item) => !item?.private && !item?.isPrivate).slice(0, MAX_SIGNAL_ITEMS).map((item) => ({
      count: clamp(Number(item.count) || 1, 1, 10_000),
      query: safeText(item.query, 500),
      updatedAt: Number(item.updatedAt) || 0,
    })),
    syncedAt: new Date().toISOString(),
  };
}

function emptyStore() {
  return { editions: {}, preferences: { mutedTopicIds: [], pinnedTopicIds: [], reducedTopicIds: [] }, reports: {} };
}

export function normalizeBriefNewsResult(item, { adapter, region } = {}) {
  const url = normalizeUrl(item?.url || item?.link);
  const domain = safeText(item?.domain || domainFor(url), 180);
  return {
    author: safeText(item?.author || item?.source, 140),
    bodyExcerpt: safeText(item?.body || item?.summary || item?.snippet, 6_000),
    domain,
    faviconUrl: normalizeUrl(item?.faviconUrl || item?.siteIcon),
    imageUrl: normalizeUrl(item?.imageUrl || item?.thumbnailUrl),
    publishedAt: safeText(item?.publishedAt || item?.datePublished || item?.date, 100),
    region: region || "",
    snippet: safeText(item?.summary || item?.snippet, 1_000),
    sourceAdapter: adapter || "news-search",
    title: safeText(item?.title || item?.name, 400),
    url,
  };
}

export function createBriefService({ callModel, callEditorialModel = callModel, notify, search = {}, userDataPath }) {
  const signalsPath = path.join(userDataPath, "brief-signals.json");
  const storePath = path.join(userDataPath, "brief-store.json");
  let generationPromise = null;
  let scheduler;

  const readJson = async (filePath, fallback) => {
    try { return JSON.parse(await readFile(filePath, "utf8")); } catch { return fallback; }
  };
  const atomicWrite = async (filePath, value) => {
    await mkdir(path.dirname(filePath), { recursive: true });
    const temporaryPath = `${filePath}.tmp`;
    await writeFile(temporaryPath, JSON.stringify(value, null, 2), { mode: 0o600 });
    await rename(temporaryPath, filePath);
  };
  const readStore = () => readJson(storePath, emptyStore());
  const trimStore = (store, now = Date.now()) => {
    const cutoff = now - MAX_STORED_DAYS * DAY_MS;
    for (const [id, edition] of Object.entries(store.editions || {})) {
      if (Date.parse(edition.updatedAt || edition.publishedAt || "") < cutoff) delete store.editions[id];
    }
    const validIds = new Set(Object.keys(store.editions || {}));
    for (const [id, report] of Object.entries(store.reports || {})) {
      if (!validIds.has(report.editionId)) delete store.reports[id];
    }
    return store;
  };

  const inferTopics = async (signals, preferences, store, force = false) => {
    const fingerprint = topicProfileFingerprint(signals, preferences);
    const cachedProfile = store.topicProfile;
    if (!force && cachedProfile?.version === TOPIC_PROFILE_VERSION
      && cachedProfile?.fingerprint === fingerprint
      && Date.now() - Date.parse(cachedProfile.updatedAt || 0) < TOPIC_PROFILE_TTL_MS
      && Array.isArray(cachedProfile.topics)) {
      return selectTopics(cachedProfile.topics, preferences);
    }
    const topics = signals.length
      ? inferTopicsFromSignals(signals, preferences)
      : selectTopics(DEFAULT_TOPICS, preferences);
    store.topicProfile = {
      fingerprint,
      version: TOPIC_PROFILE_VERSION,
      source: "local-signal-weights",
      topics,
      updatedAt: new Date().toISOString(),
    };
    return topics;
  };

  const collectTopicResults = async (topic, slots, descriptor, now, force) => {
    const searchResults = [];
    const searchFailures = [];
    if (typeof search?.serper === "function") {
      try {
        const items = await search.serper(topic.serperQuery || topic.query, {
          count: Math.max(12, slots + 6),
          gl: topic.serperGl || "cn",
          hl: topic.serperHl || "zh-cn",
        });
        searchResults.push(...(Array.isArray(items) ? items : []).map((item) => normalizeBriefNewsResult(item, {
          adapter: "serper-news",
          region: topic.region,
        })));
      } catch (error) {
        searchFailures.push(`Serper：${safeText(error?.message || "新闻检索失败", 120)}`);
      }
    }

    // Publisher RSS remains a resilient fallback and source supplement, but the
    // discovery feed is driven primarily by the professional news search calls.
    let feedResults = [];
    const usableProfessionalResultCount = searchResults.filter((result) => {
      const url = normalizeUrl(result.url);
      return url && !isLowQualityBriefResult(result)
        && isAllowedBriefSource(url, result.domain || domainFor(url));
    }).length;
    if (usableProfessionalResultCount < Math.max(4, (topic.slots || 0) + 2)) {
      feedResults = await collectAuthorityFeedResults(topic, force);
    }
    const combinedResults = [...searchResults, ...feedResults];
    const deduped = [];
    const seen = new Set();
    for (const result of combinedResults) {
      const url = normalizeUrl(result.url);
      if (!url || seen.has(url) || isLowQualityBriefResult(result)) continue;
      const domain = result.domain || domainFor(url);
      if (!isAllowedBriefSource(url, domain)) continue;
      seen.add(url);
      deduped.push({
        ...result,
        domain,
        region: result.region || topic.region || "",
        url,
      });
    }
    if (!deduped.length) {
      throw new Error(searchFailures.join("；") || "专业新闻检索与 RSS 暂时没有返回可用条目");
    }
    const clusters = clusterResults(deduped);
    return clusters.map((cluster, index) => {
      const primary = cluster[0];
      const region = topic.region || primary.region || (index % 3 === 0 ? "国内" : "国际");
      return {
        cluster,
        primary: {
          ...primary,
          domain: primary.domain,
          score: resultScore(primary, topic, index, cluster.length, now),
        },
        region,
      };
    }).sort((left, right) => {
      const providerDelta = briefSourcePriority(right.primary.sourceAdapter)
        - briefSourcePriority(left.primary.sourceAdapter);
      return providerDelta || right.primary.score - left.primary.score;
    }).slice(0, slots);
  };

  const generateEdition = async (descriptor, force = false) => {
    const generationStartedAt = Date.now();
    const now = Date.now();
    const [signalsPayload, store] = await Promise.all([
      readJson(signalsPath, sanitizeSignals({})),
      readStore(),
    ]);
    const existing = store.editions?.[descriptor.id];
    if (!force && existing?.contentVersion === EDITION_CONTENT_VERSION
      && existing?.topicProfileVersion === TOPIC_PROFILE_VERSION) {
      const isFreshOvernight = descriptor.kind !== "overnight"
        || now - Date.parse(existing.updatedAt || 0) < OVERNIGHT_REFRESH_MS;
      if (isFreshOvernight) return existing;
    }
    const signals = scoreBriefSignals(signalsPayload, now);
    const topicStartedAt = Date.now();
    const topics = await inferTopics(signals, store.preferences, store, force);
    const topicInferenceMs = Date.now() - topicStartedAt;
    const searchStartedAt = Date.now();
    const searchFailures = [];
    const collectSafely = async (topic, limit) => {
      try {
        return { results: await collectTopicResults(topic, limit, descriptor, now, force), topic };
      } catch (error) {
        searchFailures.push(`${topic.label}: ${safeText(error?.message || "检索失败", 160)}`);
        return { results: [], topic };
      }
    };
    let personalCollections = [];
    let editorialCollections = await Promise.all(
      EDITORIAL_SECTIONS.map((topic) => collectSafely(topic, Math.max(6, topic.slots + 3))),
    );
    const searchMs = Date.now() - searchStartedAt;
    const primaryByUrl = new Map();
    for (const { results } of [...personalCollections, ...editorialCollections]) {
      for (const result of results) primaryByUrl.set(result.primary.url, result.primary);
    }
    const enrichStartedAt = Date.now();
    const enrichedPrimaries = await mapWithConcurrency([...primaryByUrl.values()], 12, enrichResult);
    const enrichedByUrl = new Map(enrichedPrimaries.map((result) => [result.url, result]));
    const applyEnrichment = (collections) => collections.map(({ results, topic }) => ({
      topic,
      results: results.map((result) => {
        const enrichment = enrichedByUrl.get(result.primary.url) || {};
        const primary = {
          ...result.primary,
          author: result.primary.author || enrichment.author,
          bodyExcerpt: result.primary.bodyExcerpt || enrichment.bodyExcerpt,
          imageUrl: result.primary.imageUrl || enrichment.imageUrl,
          publishedAt: result.primary.publishedAt || enrichment.publishedAt,
          title: result.primary.title || enrichment.title,
        };
        return {
          ...result,
          cluster: [primary, ...result.cluster.filter((item) => item.url !== primary.url)],
          primary: { ...primary, score: result.primary.score },
        };
      }),
    }));
    personalCollections = applyEnrichment(personalCollections);
    editorialCollections = applyEnrichment(editorialCollections);
    const enrichmentMs = Date.now() - enrichStartedAt;
    const allRawResults = [...personalCollections, ...editorialCollections]
      .flatMap(({ results }) => results.map(({ primary }) => primary));
    if (!allRawResults.length) throw new Error(searchFailures[0] || "搜索引擎没有返回任何真实新闻");

    const makeSections = (collections) => collections.map(({ results, topic }) => {
      const stories = buildStoriesForTopic({ allResults: allRawResults, now, results, topic });
      return {
        id: topic.id,
        label: topic.label,
        stories,
        page: topic.page,
        targetSlots: topic.slots || 0,
        weight: topic.weight,
      };
    });
    const personalSections = makeSections(personalCollections);
    const editorialSections = makeSections(editorialCollections);

    const uniqueStories = [];
    const seenUrls = new Set();
    for (const story of personalSections.flatMap((section) => section.stories)
      .map((story) => ({ ...story, score: story.score + (story.region === "国际" ? 0.08 : 0) }))
      .sort((a, b) => b.score - a.score)) {
      if (!story.url || seenUrls.has(story.url)) continue;
      seenUrls.add(story.url);
      uniqueStories.push(story);
    }
    const editorialCandidates = editorialSections.flatMap((section) => section.stories)
      .map((story) => ({ ...story, score: story.score + (story.region === "国际" ? 0.06 : 0) }));
    let frontCandidates = [...uniqueStories, ...editorialCandidates].filter((story, index, list) =>
      story.url && isAllowedBriefSource(story.url, domainFor(story.url))
        && list.findIndex((candidate) => candidate.url === story.url) === index,
    );
    if (descriptor.kind === "overnight") {
      const previous = new Date(now);
      previous.setDate(previous.getDate() - 1);
      const previousEvening = store.editions?.[`${localDateKey(previous)}:evening`];
      const carried = (previousEvening?.pages?.[0]?.stories || []).slice(0, 2)
        .filter((story) => story.sources?.[0]?.sourceAdapter !== "bocha-news"
          && isAllowedBriefSource(story.url, domainFor(story.url)))
        .map((story) => ({ ...story, carriedOver: true }));
      const seen = new Set();
      frontCandidates = [...carried, ...editorialCandidates].filter((story) => {
        const key = story.url || story.id;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    }
    const frontStories = selectFrontStories(frontCandidates, 8);
    const frontUrls = new Set(frontStories.map((story) => story.url));
    const usedUrls = new Set(frontUrls);
    const topicSections = editorialSections.map((section) => {
      const stories = [];
      for (const story of section.stories) {
        if (!story.url || usedUrls.has(story.url)) continue;
        if (!isAllowedBriefSource(story.url, domainFor(story.url))) continue;
        usedUrls.add(story.url);
        stories.push(story);
        if (stories.length >= section.targetSlots) break;
      }
      return { ...section, stories };
    });
    const previousEditions = Object.values(store.editions || {})
      .filter((edition) => edition?.status === "success")
      .sort((left, right) => Date.parse(right.updatedAt || 0) - Date.parse(left.updatedAt || 0));
    for (const section of topicSections) {
      if (section.stories.length >= section.targetSlots) continue;
      const previousStories = previousEditions.flatMap((edition) => (edition.pages || [])
        .flatMap((page) => page.sections || [])
        .filter((candidate) => candidate.id === section.id)
        .flatMap((candidate) => candidate.stories || []));
      for (const story of previousStories) {
        if (!story.url || usedUrls.has(story.url)) continue;
        if (!isAllowedBriefSource(story.url, domainFor(story.url))) continue;
        usedUrls.add(story.url);
        section.stories.push({ ...story, carriedOver: true });
        if (section.stories.length >= section.targetSlots) break;
      }
    }
    const displayedStories = [
      ...frontStories,
      ...topicSections.flatMap((section) => section.stories),
    ];
    const translationResult = await translateStoriesForPublication(displayedStories, callModel, callEditorialModel);
    const chineseStoryIds = translationResult.publishedIds;
    frontStories.splice(0, frontStories.length, ...frontStories.filter((story) => chineseStoryIds.has(story.url || story.id)));
    for (const section of topicSections) {
      section.stories = section.stories.filter((story) => chineseStoryIds.has(story.url || story.id));
    }
    const sectionStoryCount = topicSections.reduce((sum, section) => sum + section.stories.length, 0);
    if (!frontStories.length && !sectionStoryCount) throw new Error("新闻检索已返回结果，但外文内容暂时无法翻译；已保留上一期 Brief。");
    const publishedStoryCount = frontStories.length + sectionStoryCount;
    const contentNotice = sectionStoryCount < 18 || frontStories.length < 8
      ? `${searchFailures.length ? "部分专业新闻源暂时不可用" : "部分外文新闻暂时无法翻译"}；本期已更新 ${publishedStoryCount} 条新闻。`
      : "";
    const edition = {
      id: descriptor.id,
      kind: descriptor.kind,
      label: descriptor.label,
      pages: [
        { id: "front", kind: "front", stories: frontStories },
        ...[2, 3, 4].map((page) => ({
          id: `editorial-${page}`,
          kind: "topics",
          sections: topicSections.filter((section) => section.page === page),
        })),
      ],
      preview: false,
      generationMetrics: {
        enrichedUrlCount: primaryByUrl.size,
        directChineseStoryCount: translationResult.directChineseCount,
        newsCandidateCount: translationResult.candidateCount,
        rssCandidateCount: displayedStories.filter((story) => story.sources?.[0]?.sourceAdapter?.includes("rss")).length,
        bochaStoryCount: displayedStories.filter((story) => story.sources?.[0]?.sourceAdapter === "bocha-news").length,
        serperStoryCount: displayedStories.filter((story) => story.sources?.[0]?.sourceAdapter === "serper-news").length,
        translatedStoryCount: translationResult.translatedCount,
        translationFailureCount: translationResult.translationFailureCount,
        sourceSelectionUsedModel: false,
        enrichmentMs,
        searchMs,
        topicInferenceMs,
        totalMs: Date.now() - generationStartedAt,
        searchFailureCount: searchFailures.length,
      },
      contentNotice,
      publishedAt: descriptor.publishedAt,
      revision: force ? (Number(existing?.revision) || 1) + 1 : Number(existing?.revision) || 1,
      status: "success",
      contentVersion: EDITION_CONTENT_VERSION,
      topicProfileVersion: TOPIC_PROFILE_VERSION,
      topics,
      updatedAt: new Date().toISOString(),
    };
    store.editions ||= {};
    store.editions[descriptor.id] = edition;
    await atomicWrite(storePath, trimStore(store, now));
    notify?.(edition);
    return edition;
  };

  const getEdition = async ({ at = Date.now(), force = false } = {}) => {
    const descriptor = getEditionDescriptor(at);
    const store = await readStore();
    const existing = store.editions?.[descriptor.id];
    if (!force && existing?.contentVersion === EDITION_CONTENT_VERSION
      && existing?.topicProfileVersion === TOPIC_PROFILE_VERSION && (descriptor.kind !== "overnight"
      || Date.now() - Date.parse(existing.updatedAt || 0) < OVERNIGHT_REFRESH_MS)) return existing;
    if (generationPromise) return generationPromise;
    const latestSuccessful = Object.values(store.editions || {})
      .filter((edition) => edition?.status === "success")
      .sort((left, right) => Date.parse(right.updatedAt || 0) - Date.parse(left.updatedAt || 0))[0];
    generationPromise = generateEdition(descriptor, force).catch((error) => {
      if (existing || latestSuccessful) return { ...(existing || latestSuccessful), staleReason: error.message };
      return {
        id: descriptor.id,
        kind: descriptor.kind,
        label: descriptor.label,
        message: error.message || "无法生成本期简报。",
        pages: [],
        publishedAt: descriptor.publishedAt,
        status: "error",
        updatedAt: new Date().toISOString(),
      };
    }).finally(() => { generationPromise = null; });
    return generationPromise;
  };

  const syncSignals = async (payload) => {
    await atomicWrite(signalsPath, sanitizeSignals(payload));
    return { status: "saved" };
  };

  const savePreferences = async (payload) => {
    const store = await readStore();
    store.preferences = {
      mutedTopicIds: (Array.isArray(payload?.mutedTopicIds) ? payload.mutedTopicIds : []).map((id) => safeText(id, 80)).slice(0, 20),
      pinnedTopicIds: (Array.isArray(payload?.pinnedTopicIds) ? payload.pinnedTopicIds : []).map((id) => safeText(id, 80)).slice(0, 20),
      reducedTopicIds: (Array.isArray(payload?.reducedTopicIds) ? payload.reducedTopicIds : []).map((id) => safeText(id, 80)).slice(0, 20),
    };
    await atomicWrite(storePath, store);
    return store.preferences;
  };

  const getReport = async ({ editionId, storyId }) => {
    const store = await readStore();
    const cacheKey = `${safeText(editionId, 100)}:${safeText(storyId, 140)}`;
    if (store.reports?.[cacheKey]?.contentVersion === REPORT_CONTENT_VERSION) return store.reports[cacheKey];
    const edition = store.editions?.[editionId];
    const stories = (edition?.pages || []).flatMap((page) => [
      ...(page.stories || []),
      ...(page.sections || []).flatMap((section) => section.stories || []),
    ]);
    const story = stories.find((item) => item.id === storyId);
    if (!story) return { status: "error", message: "找不到这条新闻的本地快照。" };
    if (!Array.isArray(story.sources) || story.sources.length < 1) {
      return { status: "error", message: "这条新闻目前没有可核验的真实来源，无法生成正文。" };
    }
    const sourceCandidates = story.sources.slice(0, 6);
    const enrichedSources = await mapWithConcurrency(sourceCandidates, 4, async (source) => {
      try {
        const enriched = await enrichResult(source);
        return {
          ...source,
          author: source.author || enriched.author,
          bodyExcerpt: enriched.bodyExcerpt || source.bodyExcerpt || source.snippet,
          faviconUrl: source.faviconUrl || enriched.faviconUrl,
          imageUrl: enriched.imageUrl || source.imageUrl,
          publishedAt: source.publishedAt || enriched.publishedAt,
          title: source.title || enriched.title,
        };
      } catch {
        return source;
      }
    });
    const usableSources = enrichedSources.filter((source) =>
      safeText(source.bodyExcerpt || source.snippet || source.title, 6_000).length >= 20
    );
    if (!usableSources.length) {
      return { status: "error", message: "这些来源暂时没有可用于整理的正文内容。" };
    }

    const sourcePayload = usableSources.map((source, index) => ({
      id: index + 1,
      excerpt: safeText(source.bodyExcerpt || source.snippet || source.title, 3_200),
      publisher: source.domain,
      publishedAt: source.publishedAt || "",
      title: source.title,
    }));
    const synthesisPayload = {
      systemPrompt: [
        "你是 Brizo Brief 的快速新闻编辑。只依据给定来源，把同一事件整理成一篇简体中文综合报道。",
        "直接输出结果，不展示思考过程。先交代发生了什么，再写关键事实、各方说法、背景与仍待确认的信息；来源冲突必须明确指出，不得补造事实。",
        "每一段事实都必须带对应编号引用，例如 [1] 或 [2][4]；编号只能引用输入中的来源。",
        "返回严格 JSON：{\"headline\":\"中文标题\",\"lead\":\"2到3句导语，含引用\",\"body\":[\"段落1，含引用\",\"段落2，含引用\"]}。正文写5到8段，不要 markdown。",
      ].join("\n"),
      query: JSON.stringify({ originalHeadline: story.headline, sources: sourcePayload }),
      timeoutMs: 45_000,
    };
    let response = await callModel(synthesisPayload);
    if ((!response || response.status !== "success") && callEditorialModel !== callModel) {
      response = await callEditorialModel(synthesisPayload);
    }
    const synthesized = response?.status === "success" ? parseModelJson(response.message) : null;
    const validCitation = new RegExp(`\\[(?:${usableSources.map((_, index) => index + 1).join("|")})\\]`);
    const cleanCitations = (value) => safeText(value, 2_400).replace(/\[(\d+)\]/g, (match, raw) => {
      const index = Number(raw);
      return index >= 1 && index <= usableSources.length ? match : "";
    });
    let body = (Array.isArray(synthesized?.body) ? synthesized.body : [])
      .map(cleanCitations)
      .filter((paragraph) => containsChinese(paragraph) && validCitation.test(paragraph))
      .slice(0, 8);
    let lead = cleanCitations(synthesized?.lead);
    let headline = safeText(synthesized?.headline || story.headline, 220);
    let synthesisState = "model";
    if (!containsChinese(headline) || !body.length || !validCitation.test(lead)) {
      synthesisState = "extractive-fallback";
      headline = story.headline;
      const fallbackParagraphs = usableSources.slice(0, 4).map((source, index) => {
        const excerpt = safeText(source.bodyExcerpt || source.snippet || source.title, 800);
        return excerpt ? `${excerpt.replace(/\s*\[\d+\]\s*$/g, "")} [${index + 1}]` : "";
      }).filter((paragraph) => containsChinese(paragraph));
      body = fallbackParagraphs.length ? fallbackParagraphs : [`${safeText(story.summary, 1_200)} [1]`];
      lead = `${safeText(story.summary || body[0], 1_200).replace(/\s*\[\d+\]\s*$/g, "")} [1]`;
    }

    const relatedStories = stories
      .filter((candidate) => candidate.id !== story.id && candidate.imageUrl)
      .map((candidate) => ({
        ...candidate,
        relatedScore: (candidate.topicId === story.topicId ? 1 : 0)
          + tokenSimilarity(`${story.headline} ${story.summary}`, `${candidate.headline} ${candidate.summary}`),
      }))
      .sort((left, right) => right.relatedScore - left.relatedScore
        || Date.parse(right.publishedAt || 0) - Date.parse(left.publishedAt || 0))
      .slice(0, 5)
      .map(({ relatedScore: _relatedScore, ...candidate }) => candidate);
    const images = [...new Set([
      story.imageUrl,
      ...usableSources.map((source) => source.imageUrl),
    ].filter(Boolean))].slice(0, 3);
    const report = {
      contentVersion: REPORT_CONTENT_VERSION,
      editionId,
      generatedAt: new Date().toISOString(),
      headline,
      imageUrl: images[0] || story.imageUrl,
      images,
      lead: safeText(lead, 1_500),
      body,
      relatedStories,
      sources: usableSources,
      status: "success",
      storyId,
      synthesisState,
    };
    store.reports ||= {};
    store.reports[cacheKey] = report;
    await atomicWrite(storePath, trimStore(store));
    return report;
  };

  const maybeGenerateCurrent = async () => {
    const signals = await readJson(signalsPath, null);
    if (!signals?.syncedAt) return null;
    return getEdition({ at: Date.now(), force: false });
  };

  const refreshEditionInBackground = async ({ at = Date.now(), force = false } = {}) => {
    const descriptor = getEditionDescriptor(at);
    const store = await readStore();
    const cached = store.editions?.[descriptor.id] || Object.values(store.editions || {})
      .filter((edition) => edition?.status === "success")
      .sort((left, right) => Date.parse(right.updatedAt || 0) - Date.parse(left.updatedAt || 0))[0];
    if (!cached) return getEdition({ at, force });
    getEdition({ at, force }).then((edition) => {
      if (edition?.staleReason) notify?.(edition);
    }).catch(() => {});
    return { ...cached, refreshPending: true };
  };

  const startScheduler = () => {
    if (scheduler) return;
    scheduler = setInterval(() => { maybeGenerateCurrent().catch(() => {}); }, 60_000);
  };
  const stopScheduler = () => {
    clearInterval(scheduler);
    scheduler = undefined;
  };

  return {
    getEdition,
    getReport,
    maybeGenerateCurrent,
    refreshEditionInBackground,
    savePreferences,
    startScheduler,
    stopScheduler,
    syncSignals,
  };
}
