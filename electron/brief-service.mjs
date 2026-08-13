import { load } from "cheerio";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  canonicalizeUrl,
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
const EDITION_CONTENT_VERSION = 24;
const REPORT_CONTENT_VERSION = 5;
const EMM_TOP_STORIES_URL = "https://media-monitor.europa.eu/api/stories/top-stories";
const OPEN_NEWSWIRE_ARTICLES_URL = "https://feed.opennewswire.org/api/articles";
const EVENT_SIGNAL_CACHE_TTL_MS = 10 * 60_000;
const OPEN_NEWSWIRE_COMMERCIAL_LICENSES = new Set(["pd", "cc-by", "cc-by-sa"]);
const SIGNAL_KIND_SHARES = { bookmark: 0.45, search: 0.35, history: 0.2 };
const DEFAULT_TOPICS = [
  { id: "technology", label: "AI 与科技产业", weight: 0.34 },
  { id: "markets", label: "商业与全球市场", weight: 0.26 },
  { id: "china", label: "中国社会与政策", weight: 0.18 },
  { id: "world", label: "国际事务", weight: 0.12 },
  { id: "science", label: "科学、气候与文化", weight: 0.1 },
];

const EDITORIAL_SECTIONS = [
  { id: "technology", label: "科技与技术", page: 2, query: "global technology science AI semiconductor major event", openNewswireQuery: "technology", serperGl: "us", serperHl: "en", region: "国际", slots: 3, weight: 0.17 },
  { id: "business-finance", label: "商业与金融", page: 2, query: "global business economy companies markets major event", openNewswireQuery: "economy", serperGl: "us", serperHl: "en", region: "国际", slots: 3, weight: 0.16 },
  { id: "international", label: "国际重要新闻", page: 3, query: "今天 国际重大新闻 全球热点", openNewswireQuery: "international", serperQuery: "top world news today Reuters AP BBC", serperGl: "us", serperHl: "en", region: "国际", slots: 4, weight: 0.24 },
  { id: "domestic", label: "国内重要新闻", page: 3, query: "今天 中国 重大新闻 政策 社会 新华社 人民日报 中新网", openNewswireQuery: "China", serperGl: "cn", serperHl: "zh-cn", region: "国内", slots: 2, weight: 0.14 },
  { id: "arts-culture", label: "艺术与文化", page: 4, query: "今天 艺术 文化 设计 文学 电影 重要新闻 澎湃 界面", openNewswireQuery: "culture", serperGl: "cn", serperHl: "zh-cn", region: "国际", slots: 3, weight: 0.15 },
  { id: "sports-entertainment", label: "体育与娱乐", page: 4, query: "今天 体育 赛事 娱乐 电影 重要新闻 中新网", openNewswireQuery: "sport", serperGl: "cn", serperHl: "zh-cn", region: "国际", slots: 3, weight: 0.14 },
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
  ["sifted.eu", 0.86], ["restofworld.org", 0.88], ["fortune.com", 0.86],
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
  // Openly licensed reporting and analysis. These are discovery/context sources;
  // a major Brief event still needs EMM reach or independent authoritative confirmation.
  ["theconversation.com", 0.84], ["voanews.com", 0.86], ["meduza.io", 0.82],
  ["agenciabrasil.ebc.com.br", 0.84], ["propublica.org", 0.9],
  ["insideclimatenews.org", 0.84], ["africaisacountry.com", 0.8],
]);

const MAJOR_BUSINESS_CONFIRMATION_DOMAINS = new Set([
  "reuters.com", "apnews.com", "afp.com", "bbc.com", "bbc.co.uk",
  "bloomberg.com", "ft.com", "wsj.com", "cnbc.com", "economist.com",
  "nytimes.com", "nikkei.com", "asia.nikkei.com", "channelnewsasia.com",
  "techcrunch.com", "sifted.eu", "restofworld.org", "fortune.com",
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

// Brief is intentionally an importance-filtered event feed, not a firehose. These
// patterns only demote obvious lifestyle filler, promotional copy and curiosity
// bait; emergencies, public safety and material local policy remain eligible.
const LOW_VALUE_NEWS_PATTERN = /(?:网红|明星穿搭|恋情曝光|粉丝热议|网友笑称|看哭了|太好笑|萌宠|星座运势|生活妙招|必看攻略|打卡圣地|探店|优惠券|促销|限时秒杀|新品种草|又美又飒|颜值爆表|神仙颜值|剧透|花絮|票房破\d|综艺路透|手游礼包|抽奖|奇闻趣事|冷知识|你不知道的|盘点\d|top\s*\d|震惊[！!]?|竟然|万万没想到)/i;
const HIGH_IMPACT_NEWS_PATTERN = /(?:国务院|中央政府|全国人大|最高人民法院|最高人民检察院|央行|人民银行|财政部|证监会|国家统计局|联合国|世界卫生组织|欧盟委员会|白宫|国会|美联储|欧洲央行|政府|监管|法院|议会|总统|总理|首相|政策|法案|法规|裁决|处罚|罚款|反垄断|儿童安全|数据保护|制裁|关税|利率|通胀|就业|失业|GDP|经济增长|财政|货币政策|并购|收购|破产|上市|退市|裁员|召回|财报|芯片|人工智能|半导体|能源|气候|地震|洪水|台风|火灾|事故|疫情|战争|停火|选举|外交|贸易|供应链|数据泄露|网络攻击|科研突破|临床试验|航天|卫星|世界杯|奥运会|Reuters|Associated Press|Federal Reserve|central bank|rate cut|rate hike|White House|Congress|European Union|\bWHO\b|\bUN\b|court ruling|regulator|regulation|fine|penalty|antitrust|child safety|data protection|jobs|employment|unemployment|election|war|ceasefire|sanction|tariff|inflation|interest rate|merger|acquisition|bankruptcy|layoff|recall|earnings|semiconductor|artificial intelligence|cyberattack|earthquake|wildfire|flood|climate|clinical trial|World Cup|Olympic)/i;
const EVENT_ACTION_PATTERN = /(?:发布|宣布|通过|批准|否决|启动|暂停|停止|签署|达成|上调|下调|增长|下降|突破|发现|调查|起诉|判决|逮捕|撤离|袭击|爆炸|关闭|开放|收购|合并|裁员|召回|警告|确认|回应|公布|实施|生效|launch|announce|approve|reject|sign|agree|raise|cut|grow|fall|discover|investigate|charge|rule|arrest|attack|explode|close|open|acquire|merge|lay off|recall|warn|confirm|release|report)/i;
const CLUSTER_NOISE_TOKENS = new Set(["今天", "今日", "最新", "消息", "新闻", "报道", "记者", "表示", "the", "and", "for", "with", "from", "news", "says", "said"]);

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

const OPEN_LICENSE_FEEDS = [
  { url: "https://theconversation.com/us/business/articles.atom", sections: ["business-finance"], region: "国际", sourceAdapter: "the-conversation" },
  { url: "https://theconversation.com/uk/business/articles.atom", sections: ["business-finance"], region: "国际", sourceAdapter: "the-conversation" },
  { url: "https://theconversation.com/au/business/articles.atom", sections: ["business-finance"], region: "国际", sourceAdapter: "the-conversation" },
  { url: "https://theconversation.com/africa/business/articles.atom", sections: ["business-finance", "international"], region: "国际", sourceAdapter: "the-conversation" },
  { url: "https://theconversation.com/ca/business/articles.atom", sections: ["business-finance"], region: "国际", sourceAdapter: "the-conversation" },
  { url: "https://theconversation.com/us/technology/articles.atom", sections: ["technology"], region: "国际", sourceAdapter: "the-conversation" },
  { url: "https://theconversation.com/us/science/articles.atom", sections: ["technology"], region: "国际", sourceAdapter: "the-conversation" },
  { url: "https://theconversation.com/us/arts/articles.atom", sections: ["arts-culture"], region: "国际", sourceAdapter: "the-conversation" },
];

export function buildSupplementalFeeds(env = process.env) {
  void env;
  return [...OPEN_LICENSE_FEEDS];
}

const FEED_CACHE_TTL_MS = 20 * 60_000;
const feedCache = new Map();
const eventSignalCache = new Map();
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
  const text = `${title} ${safeText(result?.snippet || result?.summary, 1_000)}`;
  return title.replace(/[\s\p{P}\p{S}]/gu, "").length < 8
    || LOW_QUALITY_BRIEF_HEADLINE.test(title)
    || (LOW_VALUE_NEWS_PATTERN.test(text) && !HIGH_IMPACT_NEWS_PATTERN.test(text));
}

function sourceAuthority(domain) {
  return matchedAuthority(domain) || 0;
}

function isMajorBusinessConfirmationDomain(domain) {
  const host = String(domain || "").toLowerCase();
  return [...MAJOR_BUSINESS_CONFIRMATION_DOMAINS].some((known) => matchesDomainEntry(host, known));
}

function countryBreadth(value) {
  if (Array.isArray(value)) return value.length;
  if (value && typeof value === "object") return Object.keys(value).length;
  return Math.max(0, Number(value) || 0);
}

export function parseEmmEventSignals(payload) {
  const candidates = [
    ...(Array.isArray(payload?.topStories) ? payload.topStories.map((item) => ({ ...item, signalType: "top" })) : []),
    ...(Array.isArray(payload?.trendingStories) ? payload.trendingStories.map((item) => ({ ...item, signalType: "trending" })) : []),
    ...(Array.isArray(payload?.topSources) ? payload.topSources.map((item) => ({ ...item, signalType: "sources" })) : []),
  ];
  const signals = [];
  for (const item of candidates) {
    const title = safeText(item?.title, 400);
    if (!title || isLowQualityBriefResult({ title })) continue;
    const signal = {
      id: `emm-${slugify(title, fastFingerprint(title))}`,
      countryCount: countryBreadth(item?.sourceCountries),
      growth: Math.max(0, Number(item?.speedOfGrowth) || 0),
      liveArticles: Math.max(0, Number(item?.liveArticles) || 0),
      signalType: item.signalType,
      sourceCount: Math.max(0, Number(item?.numberOfSources) || 0),
      title,
      totalCount: Math.max(0, Number(item?.totalCount) || 0),
    };
    const duplicate = signals.find((existing) => tokenSimilarity(existing.title, title) >= 0.66);
    if (!duplicate) signals.push(signal);
    else {
      duplicate.countryCount = Math.max(duplicate.countryCount, signal.countryCount);
      duplicate.growth = Math.max(duplicate.growth, signal.growth);
      duplicate.liveArticles = Math.max(duplicate.liveArticles, signal.liveArticles);
      duplicate.sourceCount = Math.max(duplicate.sourceCount, signal.sourceCount);
      duplicate.totalCount = Math.max(duplicate.totalCount, signal.totalCount);
      if (signal.signalType === "top") duplicate.signalType = "top";
    }
  }
  return signals.slice(0, 15);
}

function emmSignalStrength(signal) {
  if (!signal) return 0;
  const breadth = clamp((Number(signal.countryCount) || 0) / 20, 0, 1);
  const sources = clamp((Number(signal.sourceCount) || 0) / 20, 0, 1);
  const volume = clamp((Number(signal.totalCount) || 0) / 500, 0, 1);
  const growth = clamp((Number(signal.growth) || 0) / 0.08, 0, 1);
  const placement = signal.signalType === "top" ? 1 : signal.signalType === "trending" ? 0.82 : 0.68;
  return clamp(placement * 0.35 + breadth * 0.25 + sources * 0.18 + volume * 0.14 + growth * 0.08, 0, 1);
}

function isStrongEmmSignal(signal) {
  return Boolean(signal) && (
    signal.countryCount >= 8
    || signal.sourceCount >= 10
    || signal.totalCount >= 200
    || (signal.signalType === "top" && signal.totalCount >= 80)
  );
}

function emmSignalsForTopic(signals, topic) {
  const id = topic?.id || "";
  const pattern = id === "business-finance"
    ? /business|company|companies|econom|market|trade|tariff|jobs?|employment|unemployment|bank|finance|merger|acquisition|industry|export|import|boeing|meta|tesla|apple|microsoft|amazon|google|nvidia/i
    : id === "technology"
      ? /technology|science|research|AI|artificial intelligence|chip|semiconductor|space|software|cyber|data|robot/i
      : id === "arts-culture"
        ? /culture|art|film|music|museum|book|literature|heritage/i
        : id === "sports-entertainment"
          ? /sport|football|soccer|basketball|olympic|world cup|film|music|entertainment/i
          : id === "domestic"
            ? /中国|China|Chinese|Beijing|Shanghai|中国香港|Hong Kong/i
            : null;
  return signals.map((signal) => ({
    ...signal,
    topicMatch: Math.max(
      pattern?.test(signal.title) ? 0.72 : 0,
      tokenSimilarity(`${topic?.label || ""} ${topic?.query || ""}`, signal.title),
    ),
  })).filter((signal) => id === "international" || signal.topicMatch >= 0.12)
    .sort((left, right) => (emmSignalStrength(right) + right.topicMatch * 0.3)
      - (emmSignalStrength(left) + left.topicMatch * 0.3));
}

function attachEmmSignal(result, signals) {
  let best = null;
  let bestMatch = 0;
  for (const signal of signals) {
    const match = tokenSimilarity(
      normalizeEventText(`${result?.title || ""} ${safeText(result?.snippet, 260)}`),
      normalizeEventText(signal.title),
    );
    if (match > bestMatch) {
      best = signal;
      bestMatch = match;
    }
  }
  return bestMatch >= 0.16 ? { ...result, emmMatch: bestMatch, emmSignal: best } : result;
}

function publishedRecency(publishedAt, now) {
  const timestamp = Date.parse(publishedAt || "");
  if (!Number.isFinite(timestamp)) return 0.45;
  const hours = Math.max(0, now - timestamp) / 3_600_000;
  return clamp(1 - hours / 72, 0.08, 1);
}

function publishedAgeHours(publishedAt, now = Date.now()) {
  const timestamp = Date.parse(publishedAt || "");
  if (!Number.isFinite(timestamp)) return null;
  return Math.max(0, now - timestamp) / 3_600_000;
}

function distinctSourceCount(results = []) {
  return new Set(results.map((result) => result?.domain || domainFor(result?.url)).filter(Boolean)).size;
}

function normalizeEventText(value) {
  return safeText(value, 2_000)
    .replace(/(?:美联储|Federal Reserve|\bFed\b)/gi, "美国央行")
    .replace(/(?:欧洲央行|European Central Bank|\bECB\b)/gi, "欧洲央行")
    .replace(/(?:世卫组织|World Health Organization|\bWHO\b)/gi, "世界卫生组织")
    .replace(/(?:联合国|United Nations|\bUN\b)/gi, "联合国")
    .replace(/(?:人工智能|Artificial Intelligence|生成式AI|generative AI)/gi, "AI")
    .replace(/(?:基点|basis points?|\bbps\b)/gi, "基点");
}

function eventKeyTokens(result) {
  return tokenize(normalizeEventText(`${result?.title || ""} ${safeText(result?.snippet, 260)}`))
    .filter((token) => !CLUSTER_NOISE_TOKENS.has(token));
}

function eventNumbers(result) {
  return new Set(`${result?.title || ""} ${result?.snippet || ""}`.match(/\d+(?:\.\d+)?%?|\b[A-Z]{2,8}\b/g) || []);
}

function eventTimeDistanceHours(left, right) {
  const a = Date.parse(left?.publishedAt || "");
  const b = Date.parse(right?.publishedAt || "");
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.abs(a - b) / 3_600_000;
}

export function briefEventSimilarity(left, right) {
  if (!left || !right) return 0;
  if (eventTimeDistanceHours(left, right) > 96) return 0;
  const titleScore = tokenSimilarity(normalizeEventText(left.title), normalizeEventText(right.title));
  const contextScore = tokenSimilarity(
    normalizeEventText(`${left.title} ${safeText(left.snippet, 260)}`),
    normalizeEventText(`${right.title} ${safeText(right.snippet, 260)}`),
  );
  const leftTokens = new Set(eventKeyTokens(left));
  const rightTokens = new Set(eventKeyTokens(right));
  let shared = 0;
  for (const token of leftTokens) if (rightTokens.has(token)) shared += 1;
  const entitySupport = clamp(shared / 4, 0, 1);
  const leftNumbers = eventNumbers(left);
  const rightNumbers = eventNumbers(right);
  const numberConflict = leftNumbers.size && rightNumbers.size
    && ![...leftNumbers].some((number) => rightNumbers.has(number));
  const score = titleScore * 0.5 + contextScore * 0.3 + entitySupport * 0.2;
  return clamp(score - (numberConflict ? 0.12 : 0), 0, 1);
}

export function clusterBriefEvents(results) {
  const ordered = [...results].sort((left, right) =>
    Date.parse(right.publishedAt || 0) - Date.parse(left.publishedAt || 0)
      || sourceAuthority(right.domain) - sourceAuthority(left.domain)
  );
  const clusters = [];
  for (const result of ordered) {
    let bestCluster = null;
    let bestScore = 0;
    for (const cluster of clusters) {
      const score = Math.max(...cluster.slice(0, 4).map((candidate) => briefEventSimilarity(candidate, result)));
      if (score > bestScore) {
        bestCluster = cluster;
        bestScore = score;
      }
    }
    if (bestCluster && bestScore >= 0.46) bestCluster.push(result);
    else clusters.push([result]);
  }
  return clusters.map((cluster) => cluster.sort((left, right) =>
    sourceAuthority(right.domain) - sourceAuthority(left.domain)
      || publishedRecency(right.publishedAt, Date.now()) - publishedRecency(left.publishedAt, Date.now())
  ));
}

export function briefEventImportance(result, { cluster = [result], now = Date.now(), topic } = {}) {
  const text = `${result?.title || ""} ${result?.snippet || ""} ${result?.bodyExcerpt || ""}`;
  const authority = sourceAuthority(result?.domain || domainFor(result?.url));
  const recency = publishedRecency(result?.publishedAt, now);
  const sourceCount = distinctSourceCount(cluster);
  const crossSource = clamp((sourceCount - 1) / 3, 0, 1);
  const impact = HIGH_IMPACT_NEWS_PATTERN.test(text) ? 1 : EVENT_ACTION_PATTERN.test(text) ? 0.58 : 0.18;
  const relevance = topic ? Math.max(0.1, tokenSimilarity(topic.query || topic.label, text)) : 0.5;
  const detail = clamp((safeText(result?.snippet || result?.bodyExcerpt, 1_000).length - 45) / 260, 0, 1);
  const eventSignal = emmSignalStrength(result?.emmSignal);
  const lowValuePenalty = LOW_VALUE_NEWS_PATTERN.test(text) && !HIGH_IMPACT_NEWS_PATTERN.test(text) ? 0.52 : 0;
  return clamp(
    authority * 0.22 + recency * 0.14 + crossSource * 0.18 + impact * 0.2
      + eventSignal * 0.14 + relevance * 0.07 + detail * 0.05 - lowValuePenalty,
    0,
    1,
  );
}

export function isHighValueBriefEvent(cluster, topic, now = Date.now()) {
  if (!Array.isArray(cluster) || !cluster.length) return false;
  const primary = cluster[0];
  const importance = briefEventImportance(primary, { cluster, now, topic });
  const ageHours = publishedAgeHours(primary.publishedAt, now);
  if (ageHours != null && ageHours > 120) return false;
  const hasMaterialImpact = HIGH_IMPACT_NEWS_PATTERN.test(
    `${primary.title || ""} ${primary.snippet || ""} ${primary.bodyExcerpt || ""}`,
  );
  if (!hasMaterialImpact) return false;
  const independentlyReported = distinctSourceCount(cluster) >= 2;
  const strongGlobalSignal = isStrongEmmSignal(primary?.emmSignal);
  const authoritativeMajorEvent = sourceAuthority(primary.domain) >= 0.92
    && HIGH_IMPACT_NEWS_PATTERN.test(`${primary.title} ${primary.snippet}`);
  if (topic?.id === "business-finance" || /商业|金融|business|finance/i.test(topic?.label || "")) {
    const threeIndependentSources = distinctSourceCount(cluster) >= 3;
    const confirmedByMajorBusinessDesk = cluster.some((item) => isMajorBusinessConfirmationDomain(item.domain));
    return importance >= 0.5 && (
      threeIndependentSources
      || (confirmedByMajorBusinessDesk && independentlyReported)
      || (confirmedByMajorBusinessDesk && strongGlobalSignal)
    );
  }
  return importance >= 0.5 && (
    independentlyReported || authoritativeMajorEvent || strongGlobalSignal || importance >= 0.68
  );
}

function resultScore(result, topic, resultIndex, cluster, now) {
  const title = `${result.title} ${result.snippet}`;
  const relevance = Math.max(0.12, tokenSimilarity(topic.query || topic.label, title));
  const independentCoverage = clamp(distinctSourceCount(cluster) / 4, 0.15, 1);
  const recency = publishedRecency(result.publishedAt, now);
  const authority = sourceAuthority(result.domain);
  const importance = briefEventImportance(result, { cluster, now, topic });
  if (!authority) return 0;
  return importance * 0.35 + authority * 0.22 + independentCoverage * 0.18
    + recency * 0.15 + relevance * 0.1 - resultIndex * 0.001;
}

export function briefSourcePriority(sourceAdapter) {
  if (sourceAdapter === "serper-news") return 4;
  if (sourceAdapter === "bocha-news") return 3;
  if (sourceAdapter === "open-newswire") return 2;
  if (sourceAdapter === "the-conversation") return 1;
  return 0;
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

async function fetchEmmEventSignals(force = false) {
  const cacheKey = "emm-top-stories";
  const cached = eventSignalCache.get(cacheKey);
  if (!force && cached?.value && cached.expiresAt > Date.now()) return cached.value;
  if (cached?.promise) return cached.promise;
  const promise = (async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 7_000);
    try {
      const response = await fetch(EMM_TOP_STORIES_URL, {
        headers: { Accept: "application/json", "User-Agent": "Brizo Brief/1.0" },
        redirect: "follow",
        signal: controller.signal,
      });
      if (!response.ok) return [];
      const signals = parseEmmEventSignals(await response.json());
      eventSignalCache.set(cacheKey, { expiresAt: Date.now() + EVENT_SIGNAL_CACHE_TTL_MS, value: signals });
      return signals;
    } catch {
      return [];
    } finally {
      clearTimeout(timeout);
    }
  })().catch((error) => {
    eventSignalCache.delete(cacheKey);
    throw error;
  });
  eventSignalCache.set(cacheKey, { promise });
  return promise;
}

export function parseOpenNewswireArticles(payload, topic = {}) {
  const items = Array.isArray(payload?.results) ? payload.results : [];
  return items.flatMap((item) => {
    const license = safeText(item?.feed?.license?.slug, 40).toLowerCase();
    if (!OPEN_NEWSWIRE_COMMERCIAL_LICENSES.has(license)) return [];
    const url = normalizeUrl(item?.link || item?.url);
    const domain = domainFor(url);
    if (!url || !isAllowedBriefSource(url, domain)) return [];
    const title = safeText(item?.title, 400);
    if (!title || isLowQualityBriefResult({ title })) return [];
    return [{
      author: safeText(item?.author, 140),
      bodyExcerpt: safeText(item?.description || item?.summary, 6_000),
      domain,
      imageUrl: normalizeUrl(item?.imageUrl),
      license,
      licenseUrl: normalizeUrl(item?.feed?.licenseUrl),
      publishedAt: safeText(item?.publishedAt || item?.published || item?.date, 100),
      region: topic.region || "国际",
      sections: [topic.id].filter(Boolean),
      snippet: safeText(item?.description || item?.summary || title, 1_000),
      sourceAdapter: "open-newswire",
      sourceName: safeText(item?.feed?.title, 140),
      title,
      url,
    }];
  });
}

async function fetchOpenNewswireResults(topic, force = false) {
  const query = safeText(topic?.openNewswireQuery || topic?.query || topic?.label, 180);
  if (!query) return [];
  const cacheKey = `open-newswire:${query}`;
  const cached = eventSignalCache.get(cacheKey);
  if (!force && cached?.value && cached.expiresAt > Date.now()) return cached.value;
  if (cached?.promise) return cached.promise;
  const promise = (async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 7_000);
    try {
      const url = new URL(OPEN_NEWSWIRE_ARTICLES_URL);
      url.searchParams.set("search", query);
      url.searchParams.set("languages", "en");
      url.searchParams.set("licenses", [...OPEN_NEWSWIRE_COMMERCIAL_LICENSES].join(","));
      url.searchParams.set("page", "1");
      const response = await fetch(url, {
        headers: { Accept: "application/json", "User-Agent": "Brizo Brief/1.0" },
        redirect: "follow",
        signal: controller.signal,
      });
      if (!response.ok) return [];
      const items = parseOpenNewswireArticles(await response.json(), topic);
      eventSignalCache.set(cacheKey, { expiresAt: Date.now() + FEED_CACHE_TTL_MS, value: items });
      return items;
    } catch {
      return [];
    } finally {
      clearTimeout(timeout);
    }
  })().catch((error) => {
    eventSignalCache.delete(cacheKey);
    throw error;
  });
  eventSignalCache.set(cacheKey, { promise });
  return promise;
}

async function collectAuthorityFeedResults(topic, force = false) {
  const sectionIds = new Set(feedSectionIdsForTopic(topic));
  const feeds = buildSupplementalFeeds()
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
    if (briefEventSimilarity(cluster[0], candidate) < 0.46) continue;
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
    license: safeText(source.license, 40),
    licenseUrl: normalizeUrl(source.licenseUrl),
    publishedAt: source.publishedAt || "",
    snippet: safeText(source.snippet, 1_000),
    sourceAdapter: safeText(source.sourceAdapter, 40),
    sourceName: safeText(source.sourceName, 140),
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
      importance: result.importance || result.primary.importance || 0,
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
      importance: Number(item.importance) || 0,
      eventSignal: item.primary.emmSignal ? {
        countryCount: item.primary.emmSignal.countryCount,
        signalType: item.primary.emmSignal.signalType,
        sourceCount: item.primary.emmSignal.sourceCount,
        title: item.primary.emmSignal.title,
        totalCount: item.primary.emmSignal.totalCount,
      } : null,
      publishedAt: item.primary.publishedAt || new Date(now).toISOString(),
      region: item.region,
      score: Number(item.primary.score) || 0,
      sourceCount: distinctSourceCount(item.sources),
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
    const qualityDelta = (right.importance || right.score || 0) - (left.importance || left.score || 0);
    const providerDelta = briefSourcePriority(right.sources?.[0]?.sourceAdapter)
      - briefSourcePriority(left.sources?.[0]?.sourceAdapter);
    return qualityDelta || providerDelta || (right.score || 0) - (left.score || 0);
  };
  const ranked = [...stories].sort(compareStories);
  const selected = [];
  const topicCounts = new Map();
  const topicCount = new Set(ranked.map((story) => story.topicId).filter(Boolean)).size;
  const topicCap = topicCount ? Math.max(2, Math.ceil(limit / topicCount)) : Number.POSITIVE_INFINITY;
  const add = (story, enforceCap = true) => {
    if (!story || selected.some((item) => item.id === story.id)) return;
    if (enforceCap && story.topicId && (topicCounts.get(story.topicId) || 0) >= topicCap) return;
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
  while (selected.length < limit) {
    const candidates = ranked.filter((story) => !selected.some((item) => item.id === story.id)
      && (!story.topicId || (topicCounts.get(story.topicId) || 0) < topicCap));
    if (!candidates.length) break;
    const next = candidates.map((story) => {
      const nearest = selected.length
        ? Math.max(...selected.map((chosen) => tokenSimilarity(
          `${chosen.headline} ${chosen.summary}`,
          `${story.headline} ${story.summary}`,
        )))
        : 0;
      const samePublisher = selected.some((chosen) => chosen.sources?.[0]?.domain
        && chosen.sources[0].domain === story.sources?.[0]?.domain);
      const base = story.importance || story.score || 0;
      return { story, value: base - nearest * 0.24 - (samePublisher ? 0.06 : 0) };
    }).sort((left, right) => right.value - left.value || compareStories(left.story, right.story))[0]?.story;
    add(next);
  }
  ranked.forEach((story) => { if (selected.length < limit) add(story, false); });
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

function filterCachedEditionForDisplay(edition, now = Date.now()) {
  if (!edition) return null;
  const keepStory = (story) => {
    const ageHours = publishedAgeHours(story?.publishedAt, now);
    if (ageHours != null && ageHours > 120) return false;
    if (isLowQualityBriefResult({ title: story?.headline, snippet: story?.summary })) return false;
    const sources = Array.isArray(story?.sources) ? story.sources : [];
    const text = `${story?.headline || ""} ${story?.summary || ""}`;
    if (!HIGH_IMPACT_NEWS_PATTERN.test(text)) return false;
    return distinctSourceCount(sources) >= 2
      || sourceAuthority(sources[0]?.domain || domainFor(story?.url)) >= 0.9;
  };
  const pages = (edition.pages || []).map((page) => ({
    ...page,
    stories: (page.stories || []).filter(keepStory),
    sections: (page.sections || []).map((section) => ({
      ...section,
      stories: (section.stories || []).filter(keepStory),
    })),
  }));
  return { ...edition, pages };
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
    void descriptor;
    const searchResults = [];
    const searchFailures = [];
    const allEmmSignals = await fetchEmmEventSignals(force);
    const topicEmmSignals = emmSignalsForTopic(allEmmSignals, topic).slice(0, 3);
    const seedTitle = safeText(topicEmmSignals[0]?.title, 220);
    const retrievalQuery = seedTitle
      ? `${topic.serperQuery || topic.query} "${seedTitle.replace(/"/g, "")}"`
      : topic.serperQuery || topic.query;
    const bochaQuery = seedTitle ? `${topic.query} ${seedTitle}` : topic.query;
    const [serperOutcome, bochaOutcome, feedOutcome, openNewswireOutcome] = await Promise.allSettled([
      typeof search?.serper === "function"
        ? search.serper(retrievalQuery, {
          count: Math.max(16, slots + 10),
          gl: topic.serperGl || "cn",
          hl: topic.serperHl || "zh-cn",
        })
        : [],
      typeof search?.bocha === "function"
        ? search.bocha(bochaQuery, { count: Math.max(16, slots + 10), freshness: "oneDay" })
        : [],
      // Openly licensed analysis provides context; it cannot by itself make a
      // story eligible for Brief's major-event stream.
      collectAuthorityFeedResults(topic, force),
      fetchOpenNewswireResults(topic, force),
    ]);
    if (serperOutcome.status === "fulfilled") {
      searchResults.push(...(Array.isArray(serperOutcome.value) ? serperOutcome.value : []).map((item) => normalizeBriefNewsResult(item, {
        adapter: "serper-news",
        region: topic.region,
      })));
    } else {
      searchFailures.push(`Serper：${safeText(serperOutcome.reason?.message || "新闻检索失败", 120)}`);
    }
    if (bochaOutcome.status === "fulfilled") {
      searchResults.push(...(Array.isArray(bochaOutcome.value) ? bochaOutcome.value : []).map((item) => normalizeBriefNewsResult(item, {
        adapter: "bocha-news",
        region: topic.region,
      })));
    } else {
      searchFailures.push(`博查：${safeText(bochaOutcome.reason?.message || "新闻检索失败", 120)}`);
    }
    const feedResults = feedOutcome.status === "fulfilled" ? feedOutcome.value : [];
    const openNewswireResults = openNewswireOutcome.status === "fulfilled" ? openNewswireOutcome.value : [];
    const combinedResults = [...searchResults, ...openNewswireResults, ...feedResults]
      .map((result) => attachEmmSignal(result, topicEmmSignals));
    const deduped = [];
    const seen = new Set();
    for (const result of combinedResults) {
      const url = normalizeUrl(result.url);
      const canonicalUrl = canonicalizeUrl(url);
      if (!url || !canonicalUrl || seen.has(canonicalUrl) || isLowQualityBriefResult(result)) continue;
      const ageHours = publishedAgeHours(result.publishedAt, now);
      if (ageHours != null && ageHours > 168) continue;
      const domain = result.domain || domainFor(url);
      if (!isAllowedBriefSource(url, domain)) continue;
      seen.add(canonicalUrl);
      deduped.push({
        ...result,
        domain,
        region: result.region || topic.region || "",
        url,
      });
    }
    if (!deduped.length) {
      throw new Error(searchFailures.join("；") || "重大事件信号与开放新闻来源暂时没有返回可用条目");
    }
    let clusters = clusterBriefEvents(deduped)
      .filter((cluster) => isHighValueBriefEvent(cluster, topic, now));
    // A sparse cycle stays sparse: never pad the edition with lower-value items.
    return clusters.map((cluster, index) => {
      const primary = cluster[0];
      const region = topic.region || primary.region || (index % 3 === 0 ? "国内" : "国际");
      const importance = briefEventImportance(primary, { cluster, now, topic });
      return {
        cluster,
        importance,
        primary: {
          ...primary,
          domain: primary.domain,
          importance,
          score: resultScore(primary, topic, index, cluster, now),
        },
        region,
      };
    }).sort((left, right) => right.primary.score - left.primary.score
      || briefSourcePriority(right.primary.sourceAdapter) - briefSourcePriority(left.primary.sourceAdapter)
    ).slice(0, slots);
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
    if (!frontStories.length && !sectionStoryCount) throw new Error("新闻检索已返回结果，但没有条目通过本期重大性、来源与翻译门槛；已保留上一期 Brief。");
    const publishedStoryCount = frontStories.length + sectionStoryCount;
    const contentNotice = sectionStoryCount < 18 || frontStories.length < 8
      ? `${searchFailures.length ? "部分新闻源暂时不可用" : "本期仅保留通过重大性与来源门槛的事件"}；共更新 ${publishedStoryCount} 条。`
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
        rssCandidateCount: displayedStories.filter((story) => ["the-conversation", "publisher-rss"].includes(story.sources?.[0]?.sourceAdapter)).length,
        emmBackedStoryCount: displayedStories.filter((story) => story.eventSignal).length,
        openNewswireStoryCount: displayedStories.filter((story) => story.sources?.some((source) => source.sourceAdapter === "open-newswire")).length,
        conversationStoryCount: displayedStories.filter((story) => story.sources?.some((source) => source.sourceAdapter === "the-conversation")).length,
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
      if (existing || latestSuccessful) {
        return {
          ...filterCachedEditionForDisplay(existing || latestSuccessful),
          staleReason: `实时来源更新失败，已隐藏过期与低价值条目：${error.message}`,
        };
      }
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

    const verifiedSources = usableSources.map((source) => {
      const authority = sourceAuthority(source.domain || domainFor(source.url));
      return {
        ...source,
        authority,
        authorityLabel: authority >= 0.96 ? "一线权威来源" : authority >= 0.9 ? "权威媒体" : "可信新闻来源",
      };
    });
    const sourcePayload = verifiedSources.map((source, index) => ({
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
        "提炼3到5条最关键事实，并分别说明这件事为什么重要、下一步值得关注什么；所有内容都必须带引用。",
        "返回严格 JSON：{\"headline\":\"中文标题\",\"lead\":\"2到3句导语，含引用\",\"keyPoints\":[\"关键事实1，含引用\"],\"whyItMatters\":\"重要性，含引用\",\"whatToWatch\":\"后续观察，含引用\",\"body\":[\"段落1，含引用\",\"段落2，含引用\"]}。正文写4到7段，不要 markdown。",
      ].join("\n"),
      query: JSON.stringify({ originalHeadline: story.headline, sources: sourcePayload }),
      timeoutMs: 45_000,
    };
    let response = await callModel(synthesisPayload);
    if ((!response || response.status !== "success") && callEditorialModel !== callModel) {
      response = await callEditorialModel(synthesisPayload);
    }
    const synthesized = response?.status === "success" ? parseModelJson(response.message) : null;
    const validCitation = new RegExp(`\\[(?:${verifiedSources.map((_, index) => index + 1).join("|")})\\]`);
    const cleanCitations = (value) => safeText(value, 2_400).replace(/\[(\d+)\]/g, (match, raw) => {
      const index = Number(raw);
      return index >= 1 && index <= verifiedSources.length ? match : "";
    });
    let body = (Array.isArray(synthesized?.body) ? synthesized.body : [])
      .map(cleanCitations)
      .filter((paragraph) => containsChinese(paragraph) && validCitation.test(paragraph))
      .slice(0, 8);
    let lead = cleanCitations(synthesized?.lead);
    let headline = safeText(synthesized?.headline || story.headline, 220);
    let keyPoints = (Array.isArray(synthesized?.keyPoints) ? synthesized.keyPoints : [])
      .map(cleanCitations)
      .filter((point) => containsChinese(point) && validCitation.test(point))
      .slice(0, 5);
    let whyItMatters = cleanCitations(synthesized?.whyItMatters);
    let whatToWatch = cleanCitations(synthesized?.whatToWatch);
    let synthesisState = "model";
    if (!containsChinese(headline) || !body.length || !validCitation.test(lead)) {
      synthesisState = "extractive-fallback";
      headline = story.headline;
      const fallbackParagraphs = verifiedSources.slice(0, 4).map((source, index) => {
        const excerpt = safeText(source.bodyExcerpt || source.snippet || source.title, 800);
        return excerpt ? `${excerpt.replace(/\s*\[\d+\]\s*$/g, "")} [${index + 1}]` : "";
      }).filter((paragraph) => containsChinese(paragraph));
      body = fallbackParagraphs.length ? fallbackParagraphs : [`${safeText(story.summary, 1_200)} [1]`];
      lead = `${safeText(story.summary || body[0], 1_200).replace(/\s*\[\d+\]\s*$/g, "")} [1]`;
    }
    if (!keyPoints.length) keyPoints = body.slice(0, 3);
    if (!validCitation.test(whyItMatters)) {
      whyItMatters = `这是一项经过权威来源报道、可能影响公共政策、产业或社会运行的重要进展，实际影响仍取决于后续执行与各方回应。[1]`;
    }
    if (!validCitation.test(whatToWatch)) {
      whatToWatch = `后续应关注官方文件、关键数据和事件相关方的进一步披露，避免把尚未确认的细节当作既定事实。[1]`;
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
      ...verifiedSources.map((source) => source.imageUrl),
    ].filter(Boolean))].slice(0, 3);
    const report = {
      contentVersion: REPORT_CONTENT_VERSION,
      editionId,
      generatedAt: new Date().toISOString(),
      headline,
      imageUrl: images[0] || story.imageUrl,
      images,
      keyPoints,
      lead: safeText(lead, 1_500),
      body,
      relatedStories,
      sourceCount: distinctSourceCount(verifiedSources),
      sources: verifiedSources,
      status: "success",
      storyId,
      synthesisState,
      verificationLabel: distinctSourceCount(verifiedSources) >= 2
        ? `已交叉核验 ${distinctSourceCount(verifiedSources)} 个独立来源`
        : "单一权威来源，尚待更多独立报道",
      whatToWatch: safeText(whatToWatch, 1_500),
      whyItMatters: safeText(whyItMatters, 1_500),
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
    const cacheMatchesCurrentPipeline = cached?.id === descriptor.id
      && cached?.contentVersion === EDITION_CONTENT_VERSION
      && cached?.topicProfileVersion === TOPIC_PROFILE_VERSION;
    if (!cacheMatchesCurrentPipeline) return getEdition({ at, force: true });
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
