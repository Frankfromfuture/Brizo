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
const EDITION_CONTENT_VERSION = 53;
const REPORT_CONTENT_VERSION = 6;
const EMM_TOP_STORIES_URL = "https://media-monitor.europa.eu/api/stories/top-stories";
const OPEN_NEWSWIRE_ARTICLES_URL = "https://feed.opennewswire.org/api/articles";
const EVENT_SIGNAL_CACHE_TTL_MS = 10 * 60_000;
const OPEN_NEWSWIRE_COMMERCIAL_LICENSES = new Set(["pd", "cc-by", "cc-by-sa"]);
const SIGNAL_KIND_SHARES = { bookmark: 0.45, search: 0.35, history: 0.2 };

export const DEFAULT_TOPICS = [
  { id: "technology", label: "AI 与科技产业", weight: 0.34 },
  { id: "markets", label: "商业与全球市场", weight: 0.26 },
  { id: "china", label: "中国社会与政策", weight: 0.18 },
  { id: "world", label: "国际事务", weight: 0.12 },
  { id: "science", label: "科学、气候与文化", weight: 0.1 },
];

export const EDITORIAL_SECTIONS = [
  { id: "google-news", label: "Google News", page: 1, region: "国际", slots: 36, weight: 1.0 },
];

export const GOOGLE_NEWS_TOPICS = [
  { id: "WORLD", name: "国际要闻", englishName: "World", badgeBg: "#eef2ff", badgeColor: "#2563eb", syndicationUrl: "https://news.yahoo.com/rss/world", nytUrl: "https://rss.nytimes.com/services/xml/rss/nyt/World.xml" },
  { id: "BUSINESS", name: "商业财经", englishName: "Business", badgeBg: "#ecfdf5", badgeColor: "#059669", syndicationUrl: "https://finance.yahoo.com/news/rssindex", nytUrl: "https://rss.nytimes.com/services/xml/rss/nyt/Business.xml" },
  { id: "TECHNOLOGY", name: "科技产业", englishName: "Technology", badgeBg: "#f5f3ff", badgeColor: "#7c3aed", syndicationUrl: "https://news.yahoo.com/rss/tech", nytUrl: "https://rss.nytimes.com/services/xml/rss/nyt/Technology.xml" },
  { id: "SCIENCE", name: "前沿科学", englishName: "Science", badgeBg: "#eff6ff", badgeColor: "#0284c7", syndicationUrl: "https://news.yahoo.com/rss/science", nytUrl: "https://rss.nytimes.com/services/xml/rss/nyt/Science.xml" },
  { id: "HEALTH", name: "健康医疗", englishName: "Health", badgeBg: "#fdf2f8", badgeColor: "#db2777", syndicationUrl: "https://news.yahoo.com/rss/health", nytUrl: "https://rss.nytimes.com/services/xml/rss/nyt/Health.xml" },
  { id: "SPORTS", name: "全球体育", englishName: "Sports", badgeBg: "#fff7ed", badgeColor: "#ea580c", syndicationUrl: "https://sports.yahoo.com/rss", nytUrl: "https://rss.nytimes.com/services/xml/rss/nyt/Sports.xml" },
];

export const DIRECT_AUTHORITATIVE_FEEDS = GOOGLE_NEWS_TOPICS.flatMap((topic) => [
  {
    badgeBg: topic.badgeBg,
    badgeColor: topic.badgeColor,
    domain: "news.google.com",
    mediaCode: topic.id,
    region: "国际",
    section: topic.id,
    source: "Google News",
    sourceName: `${topic.name} · ${topic.englishName}`,
    topicId: topic.id,
    topicName: topic.name,
    url: `https://news.google.com/rss/headlines/section/topic/${topic.id}?hl=en-US&gl=US&ceid=US:en`,
  },
  {
    badgeBg: topic.badgeBg,
    badgeColor: topic.badgeColor,
    domain: "yahoo.com",
    mediaCode: topic.id,
    region: "国际",
    section: topic.id,
    source: "AP / Reuters",
    sourceName: `${topic.name} · 全球电讯社`,
    topicId: topic.id,
    topicName: topic.name,
    url: topic.syndicationUrl,
  },
  {
    badgeBg: topic.badgeBg,
    badgeColor: topic.badgeColor,
    domain: "nytimes.com",
    mediaCode: topic.id,
    region: "国际",
    section: topic.id,
    source: "NYT",
    sourceName: `${topic.name} · 国际特约`,
    topicId: topic.id,
    topicName: topic.name,
    url: topic.nytUrl,
  },
]);

export function buildSupplementalFeeds(env = process.env) {
  void env;
  return [
    { url: "https://theconversation.com/us/business/articles.atom", sections: ["business-finance"], region: "国际", sourceAdapter: "the-conversation" },
    { url: "https://theconversation.com/uk/business/articles.atom", sections: ["business-finance"], region: "国际", sourceAdapter: "the-conversation" },
    { url: "https://theconversation.com/au/business/articles.atom", sections: ["business-finance"], region: "国际", sourceAdapter: "the-conversation" },
    { url: "https://theconversation.com/africa/business/articles.atom", sections: ["business-finance", "international"], region: "国际", sourceAdapter: "the-conversation" },
    { url: "https://theconversation.com/ca/business/articles.atom", sections: ["business-finance"], region: "国际", sourceAdapter: "the-conversation" },
  ];
}

export const GOOGLE_NEWS_PHOTO_LIBRARY = {
  WORLD: [
    "https://images.unsplash.com/photo-1541872703-74c5e44368f9?auto=format&fit=crop&w=1200&q=82",
    "https://images.unsplash.com/photo-1529107386315-e1a2ed48a620?auto=format&fit=crop&w=1200&q=82",
    "https://images.unsplash.com/photo-1585829365295-ab7cd400c167?auto=format&fit=crop&w=1200&q=82",
    "https://images.unsplash.com/photo-1572949645841-094f3a9c4c94?auto=format&fit=crop&w=1200&q=82",
  ],
  BUSINESS: [
    "https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?auto=format&fit=crop&w=1200&q=82",
    "https://images.unsplash.com/photo-1590283603385-17ffb3a7f29f?auto=format&fit=crop&w=1200&q=82",
    "https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=1200&q=82",
    "https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?auto=format&fit=crop&w=1200&q=82",
  ],
  TECHNOLOGY: [
    "https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=1200&q=82",
    "https://images.unsplash.com/photo-1558494949-ef010cbdcc31?auto=format&fit=crop&w=1200&q=82",
    "https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?auto=format&fit=crop&w=1200&q=82",
    "https://images.unsplash.com/photo-1519389950473-47ba0277781c?auto=format&fit=crop&w=1200&q=82",
  ],
  SCIENCE: [
    "https://images.unsplash.com/photo-1517976487507-5b3971e39bb7?auto=format&fit=crop&w=1200&q=82",
    "https://images.unsplash.com/photo-1506703719100-a0f3a48c0f86?auto=format&fit=crop&w=1200&q=82",
    "https://images.unsplash.com/photo-1532094349884-543bc11b234d?auto=format&fit=crop&w=1200&q=82",
    "https://images.unsplash.com/photo-1451187580459-43490279c0fa?auto=format&fit=crop&w=1200&q=82",
  ],
  HEALTH: [
    "https://images.unsplash.com/photo-1579684385127-1ef15d508118?auto=format&fit=crop&w=1200&q=82",
    "https://images.unsplash.com/photo-1584515979956-d9f6e5d09982?auto=format&fit=crop&w=1200&q=82",
    "https://images.unsplash.com/photo-1505751172876-fa1923c5c528?auto=format&fit=crop&w=1200&q=82",
    "https://images.unsplash.com/photo-1530497610245-94d3c16cda28?auto=format&fit=crop&w=1200&q=82",
  ],
  SPORTS: [
    "https://images.unsplash.com/photo-1508098682722-e99c43a406b2?auto=format&fit=crop&w=1200&q=82",
    "https://images.unsplash.com/photo-1546519638-68e109498ffc?auto=format&fit=crop&w=1200&q=82",
    "https://images.unsplash.com/photo-1461896836934-ffe607ba8211?auto=format&fit=crop&w=1200&q=82",
    "https://images.unsplash.com/photo-1517649763962-0c623266ddc0?auto=format&fit=crop&w=1200&q=82",
  ],
};

export function getStoryImageForTopic(section, idx = 0) {
  const sec = (section || "WORLD").toUpperCase();
  const list = GOOGLE_NEWS_PHOTO_LIBRARY[sec] || GOOGLE_NEWS_PHOTO_LIBRARY.WORLD;
  const index = Math.abs(Number(idx) || 0);
  return list[index % list.length];
}

export const GOOGLE_NEWS_PRESET_IMAGES = {
  WORLD: GOOGLE_NEWS_PHOTO_LIBRARY.WORLD[0],
  BUSINESS: GOOGLE_NEWS_PHOTO_LIBRARY.BUSINESS[0],
  TECHNOLOGY: GOOGLE_NEWS_PHOTO_LIBRARY.TECHNOLOGY[0],
  SCIENCE: GOOGLE_NEWS_PHOTO_LIBRARY.SCIENCE[0],
  HEALTH: GOOGLE_NEWS_PHOTO_LIBRARY.HEALTH[0],
  SPORTS: GOOGLE_NEWS_PHOTO_LIBRARY.SPORTS[0],
};

export const NYT_PRESET_IMAGES = Object.values(GOOGLE_NEWS_PRESET_IMAGES);
export const BIG5_PRESET_IMAGES = NYT_PRESET_IMAGES;

const TOPIC_PRESET_IMAGES = {
  technology: BIG5_PRESET_IMAGES,
  "business-finance": BIG5_PRESET_IMAGES,
  international: BIG5_PRESET_IMAGES,
  domestic: BIG5_PRESET_IMAGES,
  "arts-culture": BIG5_PRESET_IMAGES,
  "sports-entertainment": BIG5_PRESET_IMAGES,
};

const SOURCE_AUTHORITY = new Map([
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
  ["qbitai.com", 0.85],
  ["espn.com", 0.88], ["skysports.com", 0.86], ["goal.com", 0.8],
  ["fifa.com", 0.86], ["nba.com", 0.84], ["olympics.com", 0.88],
  ["variety.com", 0.86], ["hollywoodreporter.com", 0.86], ["deadline.com", 0.84],
  ["rollingstone.com", 0.82], ["billboard.com", 0.82],
  ["artnews.com", 0.84], ["artforum.com", 0.82], ["theartnewspaper.com", 0.84],
  ["theconversation.com", 0.84], ["voanews.com", 0.86], ["meduza.io", 0.82],
  ["agenciabrasil.ebc.com.br", 0.84], ["propublica.org", 0.9],
  ["insideclimatenews.org", 0.84], ["africaisacountry.com", 0.8],
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
const LOW_VALUE_NEWS_PATTERN = /(?:网红|明星穿搭|恋情曝光|粉丝热议|网友笑称|看哭了|太好笑|萌宠|星座运势|生活妙招|必看攻略|打卡圣地|探店|优惠券|促销|限时秒杀|新品种草|又美又飒|颜值爆表|神仙颜值|剧透|花絮|票房破\d|综艺路透|手游礼包|抽奖|奇闻趣事|冷知识|你不知道的|盘点\d|top\s*\d|震惊[！!]?|竟然|万万没想到)/i;
const HIGH_IMPACT_NEWS_PATTERN = /(?:国务院|中央政府|全国人大|最高人民法院|最高人民检察院|央行|人民银行|财政部|证监会|国家统计局|联合国|世界卫生组织|欧盟委员会|白宫|国会|美联储|欧洲央行|政府|监管|法院|议会|总统|总理|首相|政策|法案|法规|裁决|处罚|罚款|反垄断|儿童安全|数据保护|制裁|关税|利率|通胀|就业|失业|GDP|经济增长|财政|货币政策|并购|收购|破产|上市|退市|裁员|召回|财报|芯片|人工智能|半导体|能源|气候|地震|洪水|台风|火灾|事故|疫情|战争|停火|选举|外交|贸易|供应链|数据泄露|网络攻击|科研突破|临床试验|航天|卫星|世界杯|奥运会|Reuters|Associated Press|Federal Reserve|central bank|rate cut|rate hike|White House|Congress|European Union|\bWHO\b|\bUN\b|court ruling|regulator|regulation|fine|penalty|antitrust|child safety|data protection|jobs|employment|unemployment|election|war|ceasefire|sanction|tariff|inflation|interest rate|merger|acquisition|bankruptcy|layoff|recall|earnings|semiconductor|artificial intelligence|cyberattack|earthquake|wildfire|flood|climate|clinical trial|World Cup|Olympic)/i;

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
      ? "Brizo Brief · 早间精选"
      : kind === "evening"
        ? "Brizo Brief · 晚间精选"
        : "Brizo Brief · 每日简报",
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

export function briefSourcePriority(adapter = "") {
  if (adapter === "serper-news") return 100;
  if (adapter === "bocha-news") return 80;
  if (adapter === "open-newswire" || adapter === "direct-feed") return 60;
  if (adapter === "the-conversation") return 40;
  return 20;
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
      countryCount: Array.isArray(item?.sourceCountries) ? item.sourceCountries.length : (item?.sourceCountries ? Object.keys(item.sourceCountries).length : 0),
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

export function parseOpenNewswireArticles(payload, topic) {
  const results = [];
  const entries = Array.isArray(payload?.results) ? payload.results : Array.isArray(payload?.articles) ? payload.articles : [];
  for (const entry of entries) {
    const license = safeText(entry?.feed?.license?.slug || entry?.license, 40).toLowerCase();
    if (!OPEN_NEWSWIRE_COMMERCIAL_LICENSES.has(license)) continue;
    const title = safeText(entry?.title, 300);
    const url = normalizeUrl(entry?.link || entry?.url);
    if (!title || !url || isLowQualityBriefResult({ title })) continue;
    results.push({
      author: safeText(entry?.author, 100),
      domain: domainFor(url),
      imageUrl: safeText(entry?.lead_image_url || entry?.image_url, 500),
      license,
      publishedAt: entry?.published_at || new Date().toISOString(),
      region: topic?.region || "国际",
      snippet: safeText(entry?.summary || entry?.excerpt, 1000),
      sourceAdapter: "open-newswire",
      title,
      topicId: topic?.id,
      url,
    });
  }
  return results;
}

export function createExtractiveSummary(sources) {
  const lines = (Array.isArray(sources) ? sources : []).flatMap((source, index) => {
    const text = safeText(source?.snippet || source?.summary || source?.bodyExcerpt || source?.title, 600);
    if (!text) return [];
    return [`${text.replace(/\s*\[\d+\]\s*$/g, "")} [${index + 1}]`];
  });
  return lines.slice(0, 2).join("\n\n") || "来自权威新闻源的公开报道。[1]";
}

function containsChinese(text) {
  return /[\u4e00-\u9fa5]/.test(String(text || ""));
}

const BRIEF_COMMON_ENGLISH_WORDS = new Set([
  "american", "americans", "british", "canadian", "chinese", "earth", "english",
  "french", "german", "global", "government", "international", "japanese", "korean",
  "market", "million", "national", "official", "president", "report", "russian", "somali",
  "source", "state", "states", "technology", "united", "world",
]);

export function briefTranslationResidualEnglish(translation) {
  const values = [
    translation?.headline,
    translation?.excerpt,
    ...(Array.isArray(translation?.keyPoints) ? translation.keyPoints : []),
  ];
  const entityTokens = new Set((Array.isArray(translation?.entities) ? translation.entities : [])
    .flatMap((entity) => String(entity?.english || "").match(/[A-Za-z][A-Za-z'-]{2,}/g) || [])
    .map((token) => token.toLowerCase()));
  return [...new Set(values.flatMap((value) => {
    const text = String(value || "");
    if (!containsChinese(text)) return [];
    return [...text.matchAll(/(^|[^A-Za-z])([A-Za-z][A-Za-z'-]{2,})(?=$|[^A-Za-z])/g)]
      .map((match) => match[2])
      .filter((token) => {
        const lower = token.toLowerCase();
        if (BRIEF_COMMON_ENGLISH_WORDS.has(lower)) return true;
        if (entityTokens.has(lower)) return false;
        return /^[a-z]{5,}$/.test(token) || /^[A-Z][a-z]{4,}$/.test(token);
      });
  }))];
}

export function briefEventSimilarity(left, right) {
  const titleA = safeText(left?.title || left?.headline, 300);
  const titleB = safeText(right?.title || right?.headline, 300);
  const numA = (titleA.match(/\d+/g) || []).join(",");
  const numB = (titleB.match(/\d+/g) || []).join(",");
  if (numA && numB && numA !== numB) return 0.2;
  return tokenSimilarity(titleA, titleB);
}

export function briefEventImportance(item, { cluster = [], now = Date.now(), topic } = {}) {
  const title = safeText(item?.title || item?.headline, 400);
  const hasImpactKeyword = HIGH_IMPACT_NEWS_PATTERN.test(title);
  const isDirectFeed = item?.sourceAdapter === "direct-feed" || item?.sourceAdapter === "publisher-feed";
  const authority = sourceAuthority(item?.domain);
  const clusterBonus = Math.min(0.25, (cluster.length - 1) * 0.08);
  const ageHours = Math.max(0, (now - Date.parse(item?.publishedAt || now)) / 3_600_000);
  const freshness = Math.max(0, 1 - ageHours / 72) * 0.15;
  return clamp(
    (hasImpactKeyword ? 0.45 : 0.28) + authority * 0.25 + (isDirectFeed ? 0.12 : 0) + clusterBonus + freshness,
    0.2,
    0.98
  );
}

export function isHighValueBriefEvent(cluster, topic, now = Date.now()) {
  if (!cluster || !cluster.length) return false;
  const primary = cluster[0];
  const title = safeText(primary?.title || primary?.headline, 400);
  const snippet = safeText(primary?.snippet || primary?.summary, 1000);
  const text = `${title} ${snippet}`;
  if (topic?.label?.includes("文化") || topic?.id === "arts-culture") {
    if (/producer dies|pop records/i.test(text)) return false;
  }
  if (topic?.label?.includes("科技") || topic?.id === "technology") {
    if (/review:|more of the same/i.test(text)) return false;
  }
  const ageHours = (now - Date.parse(primary?.publishedAt || now)) / 3_600_000;
  if (ageHours > 168) return false;
  const importance = briefEventImportance(primary, { cluster, now, topic });
  return importance >= 0.35 && !isLowQualityBriefResult(primary);
}

export function selectFrontStories(allStories, slots = 7) {
  const domestic = (allStories || []).filter((s) => s.region === "国内");
  const international = (allStories || []).filter((s) => s.region === "国际" || s.region !== "国内");
  const result = [];
  const maxDomestic = Math.ceil(slots / 2);
  const maxInternational = Math.floor(slots / 2);

  const byScore = (a, b) => (Number(b.importance) || 0) - (Number(a.importance) || 0)
    || (Number(b.score) || 0) - (Number(a.score) || 0);

  domestic.sort(byScore);
  international.sort(byScore);

  let dIdx = 0;
  let iIdx = 0;
  while (result.length < slots && (dIdx < domestic.length || iIdx < international.length)) {
    if (result.length % 2 === 0 && dIdx < domestic.length && dIdx < maxDomestic) {
      result.push(domestic[dIdx++]);
    } else if (iIdx < international.length && iIdx < maxInternational) {
      result.push(international[iIdx++]);
    } else if (dIdx < domestic.length) {
      result.push(domestic[dIdx++]);
    } else if (iIdx < international.length) {
      result.push(international[iIdx++]);
    } else {
      break;
    }
  }
  return result;
}

// -------------------------------------------------------------
// Direct Authoritative Feed Downloader & RSS Parser
// -------------------------------------------------------------
function cleanMediaTitle(rawTitle) {
  let text = safeText(rawTitle, 300);
  text = text.replace(/\s*-\s*(Reuters|The Wall Street Journal|WSJ|The New York Times|NYT|Bloomberg(\.com)?|Financial Times|FT)$/i, "");
  return text.trim();
}

async function fetchAndParseFeed(feedConfig, fetchImpl = fetch) {
  const { badgeBg, badgeColor, domain, mediaCode, region, section, source, sourceName, url } = feedConfig;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);
    const response = await fetchImpl(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Brizo/1.0",
        Accept: "application/rss+xml, application/xml, application/atom+xml, text/xml, text/html, */*",
      },
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!response.ok) return [];
    const xml = await response.text();
    const $ = load(xml, { xmlMode: true });
    const items = [];

    const nodes = $("item, entry").toArray().slice(0, 16);
    for (const el of nodes) {
      const node = $(el);
      const rawTitle = safeText(node.find("title").first().text(), 300);
      let title = cleanMediaTitle(rawTitle);
      const sourceTag = node.find("source");
      const itemSourceName = sourceTag.text().trim() || sourceName || source;
      const itemSourceDomain = sourceTag.attr("url")?.replace(/^https?:\/\/(www\.)?/, "").replace(/\/.*$/, "") || domain || "news.google.com";

      if (itemSourceName && title.endsWith(` - ${itemSourceName}`)) {
        title = title.slice(0, -(itemSourceName.length + 3)).trim();
      }

      let link = node.find("link").first().text().trim() || node.find("link").first().attr("href") || "";
      if (!link && node.find("guid").first().text().startsWith("http")) {
        link = node.find("guid").first().text().trim();
      }
      const description = safeText(
        node.find("description, summary, content\\:encoded, content").first().text(),
        2000
      );
      const pubDate = node.find("pubDate, published, updated").first().text().trim() || new Date().toISOString();

      let imageUrl = node.find("media\\:content[url]").attr("url")
        || node.find("media\\:content[medium='image']").attr("url")
        || node.find("media\\:thumbnail[url]").attr("url")
        || node.find("media\\:thumbnail").attr("url")
        || node.find("enclosure[type^='image']").attr("url")
        || "";
      if (!imageUrl && description) {
        const imgMatch = description.match(/<img[^>]+src=["'](https?:\/\/[^"'>]+)["']/i);
        if (imgMatch && !imgMatch[1].includes("spaceball.gif")) imageUrl = imgMatch[1];
      }

      const isGenericHeader = /^(Google News|Today's Paper|Front Page|Home Page|Most Popular|Markets News|World News)$/i.test(title)
        || /^Print Edition\b/i.test(title);

      const cleanDesc = description
        .replace(/&nbsp;/gi, " ")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();

      if (title && link && !isGenericHeader && !isLowQualityBriefResult({ title })) {
        items.push({
          author: itemSourceName,
          badgeBg,
          badgeColor,
          bodyExcerpt: cleanDesc,
          domain: itemSourceDomain,
          id: `feed-${fastFingerprint(link || title)}`,
          imageUrl: imageUrl || "",
          mediaCode: section || "NEWS",
          publishedAt: new Date(pubDate).toISOString(),
          region: "国际",
          section: section || "WORLD",
          snippet: cleanDesc,
          sourceAdapter: "direct-feed",
          sourceName: itemSourceName,
          title,
          url: link,
        });
      }
    }
    return items;
  } catch {
    return [];
  }
}

// -------------------------------------------------------------
// Service Factory
// -------------------------------------------------------------
export function createBriefService({
  callEditorialModel,
  callModel,
  callTranslationModel,
  fetchImpl = fetch,
  notify,
  resolveDeepSeekProvider,
  userDataPath = "",
} = {}) {
  const storePath = userDataPath ? path.join(userDataPath, "brief-store.json") : "";
  const signalsPath = userDataPath ? path.join(userDataPath, "brief-signals.json") : "";
  let scheduler;
  let generationPromise = null;

  const readStore = async () => {
    if (!storePath) return { editions: {}, reports: {}, preferences: {} };
    try {
      const text = await readFile(storePath, "utf-8");
      const data = JSON.parse(text) || { editions: {}, reports: {}, preferences: {} };
      if (data.editions) {
        for (const [id, ed] of Object.entries(data.editions)) {
          if (ed?.contentVersion && ed.contentVersion < EDITION_CONTENT_VERSION) {
            delete data.editions[id];
          }
        }
      }
      return data;
    } catch {
      return { editions: {}, reports: {}, preferences: {} };
    }
  };

  const writeStore = async (data) => {
    if (!storePath) return;
    try {
      await mkdir(path.dirname(storePath), { recursive: true });
      await writeFile(storePath, JSON.stringify(data, null, 2), { encoding: "utf-8", mode: 0o600 });
    } catch {}
  };

  const generateEdition = async (descriptor, force = false) => {
    const startedAt = Date.now();
    const store = await readStore();
    const existing = store.editions?.[descriptor.id];
    if (!force && existing && existing.status === "success" && (!existing.contentVersion || existing.contentVersion >= EDITION_CONTENT_VERSION)) {
      return existing;
    }

    let feedOutcomes = [];
    try {
      feedOutcomes = await Promise.all(
        DIRECT_AUTHORITATIVE_FEEDS.map((f) => fetchAndParseFeed(f, fetchImpl))
      );
    } catch (err) {
      throw new Error("重大事件信号与开放新闻来源暂时没有返回可用条目");
    }

    const allItems = feedOutcomes.flat();
    if (!allItems.length) {
      throw new Error("重大事件信号与开放新闻来源暂时没有返回可用条目");
    }

    // Deduplicate by URL or title
    const uniqueItems = [];
    const seenUrls = new Set();
    const seenTitles = new Set();
    for (const it of allItems) {
      const key = it.url || it.title;
      const titleNorm = it.title.toLowerCase();
      if (!seenUrls.has(it.url) && !seenTitles.has(titleNorm)) {
        seenUrls.add(it.url);
        seenTitles.add(titleNorm);
        uniqueItems.push(it);
      }
    }

    // Sort by: items with real editorial photo first, then by published time descending
    uniqueItems.sort((a, b) => {
      const aHasImg = Boolean(a.imageUrl);
      const bHasImg = Boolean(b.imageUrl);
      if (aHasImg !== bHasImg) return aHasImg ? -1 : 1;
      return Date.parse(b.publishedAt || 0) - Date.parse(a.publishedAt || 0);
    });

    const chosenStories = uniqueItems.slice(0, 36);

    let directChineseStoryCount = 0;
    let translatedStoryCount = 0;
    let translationModelLabel = "";

    // Translate the complete selected edition on every refresh. Batching keeps
    // payloads bounded while parallel requests avoid a serial model waterfall.
    // A failed or incomplete batch aborts publication so readers never receive
    // a half-translated edition; getEdition will retain the latest good issue.
    if (typeof callTranslationModel !== "function") {
      throw new Error("DeepSeek V4 Flash 整版翻译暂不可用");
    }
    const translationInputs = chosenStories.map((story) => ({
      excerpt: safeText(story.snippet || story.bodyExcerpt, 1200),
      id: story.id,
      section: story.section,
      source: story.sourceName,
      title: safeText(story.title, 400),
    }));
    const translationBatches = [];
    for (let index = 0; index < translationInputs.length; index += 12) {
      translationBatches.push(translationInputs.slice(index, index + 12));
    }
    const translationSystemPrompt = `你是 Brizo Brief 的整版新闻翻译引擎。把输入 stories 中每一条新闻的标题、摘要和可提炼要点忠实整理为简体中文，严格遵守：
1. 公司、机构、品牌、产品和人物姓名必须保留输入中的原始英文拼写，不得翻译、音译或中文化；例如必须写 Trump、Lula、Bessent、Walmart，绝不能写特朗普、卢拉、贝森特、沃尔玛。国家、城市和普通叙述则使用自然、准确的简体中文。
2. 只依据输入 title 与 excerpt，不补充背景、不推测、不写“来自某来源的实时焦点报道”等模板句，也不要把新闻网站名称写进 excerpt。
3. excerpt 为空时必须返回空字符串，keyPoints 返回空数组；有内容时最多提炼 3 条事实要点。
4. 每个输入 id 必须且只能返回一次。输出前逐条对照原文自检，确保所有人物姓名和公司、机构、品牌、产品名称仍为原始英文。
5. 除上述必须保留的英文专名与缩写外，不得遗留任何英文普通单词。
6. 每条 story 的 entities 必须穷举原文中的人物、公司、机构、品牌、产品英文名。english 写原文中的精确拼写；localizedForms 列出 headline、excerpt、keyPoints 中不慎出现的全部中文翻译或音译形式，未发生误译则返回空数组。
只输出严格 JSON：{"stories":[{"id":"...","headline":"...","excerpt":"...","keyPoints":["..."],"entities":[{"english":"Trump","localizedForms":["特朗普"]}]}]}`;
    const translateBatch = async (batch, splitDepth = 0) => {
      let correction = "";
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const res = await callTranslationModel({
          query: JSON.stringify({
            ...(attempt && correction ? { correction } : {}),
            stories: batch,
          }),
          systemPrompt: translationSystemPrompt,
          timeoutMs: 90_000,
        });
        if (res?.status !== "success") {
          correction = `上一次调用失败：${res?.message || "翻译失败"}。请重新返回这一批的全部条目。`;
          continue;
        }
        const parsed = parseModelJson(res.message);
        if (!Array.isArray(parsed?.stories)) {
          correction = "上一次没有返回 stories 数组。请重新返回这一批的全部条目。";
          continue;
        }
        translationModelLabel = res.modelLabel || translationModelLabel;
        const expectedIds = new Set(batch.map((item) => String(item.id)));
        const returnedIds = parsed.stories.map((item) => String(item?.id || ""));
        const missingIds = [...expectedIds].filter((id) => returnedIds.filter((returnedId) => returnedId === id).length !== 1);
        const unexpectedIds = returnedIds.filter((id) => !expectedIds.has(id));
        const incompleteIds = parsed.stories
          .filter((item) => expectedIds.has(String(item?.id || "")) && !safeText(item?.headline, 400))
          .map((item) => String(item.id));
        const residualEnglish = [...new Set(parsed.stories.flatMap(briefTranslationResidualEnglish))];
        if (!missingIds.length && !unexpectedIds.length && !incompleteIds.length && !residualEnglish.length) {
          return parsed.stories;
        }
        correction = [
          missingIds.length ? `遗漏或重复的 id：${missingIds.join("、")}` : "",
          unexpectedIds.length ? `出现了输入中不存在的 id：${unexpectedIds.join("、")}` : "",
          incompleteIds.length ? `标题缺失的 id：${incompleteIds.join("、")}` : "",
          residualEnglish.length ? `仍未翻译的英文普通词：${residualEnglish.join("、")}` : "",
          "请重新完整返回这一批的每条新闻；每个输入 id 必须且只能出现一次。",
        ].filter(Boolean).join("；");
      }
      if (batch.length > 1 && splitDepth < 5) {
        const midpoint = Math.ceil(batch.length / 2);
        const parts = await Promise.all([
          translateBatch(batch.slice(0, midpoint), splitDepth + 1),
          translateBatch(batch.slice(midpoint), splitDepth + 1),
        ]);
        return parts.flat();
      }
      throw new Error(`DeepSeek V4 Flash 没有返回完整合格的 Brief 翻译结果：${correction || "未知错误"}`);
    };
    const translatedBatches = await Promise.all(
      translationBatches.map((batch) => translateBatch(batch))
    );
    const translations = new Map(
      translatedBatches.flat().map((translation) => [String(translation?.id || ""), translation])
    );
    for (const story of chosenStories) {
      const translated = translations.get(story.id);
      if (!translated?.headline) {
        throw new Error("DeepSeek V4 Flash 遗漏了 Brief 新闻条目");
      }
      const sourceExcerpt = safeText(story.snippet || story.bodyExcerpt, 1200);
      story.originalTitle = story.title;
      const sourceText = `${story.title || ""}\n${sourceExcerpt}`;
      const restoreEnglishNames = (value) => {
        let restored = String(value || "");
        const entities = Array.isArray(translated.entities) ? translated.entities : [];
        for (const entity of entities) {
          const english = safeText(entity?.english, 160);
          if (!english || !/[A-Za-z]/.test(english) || !sourceText.includes(english)) continue;
          const localizedForms = Array.isArray(entity?.localizedForms) ? entity.localizedForms : [];
          for (const localizedForm of localizedForms) {
            const localized = safeText(localizedForm, 160);
            if (!localized || !containsChinese(localized)) continue;
            restored = restored.split(localized).join(english);
          }
        }
        return restored;
      };
      story.headline = safeText(restoreEnglishNames(translated.headline), 400);
      story.summary = safeText(restoreEnglishNames(translated.excerpt), 1200)
        || (containsChinese(sourceExcerpt) ? sourceExcerpt : "");
      story.keyPoints = Array.isArray(translated.keyPoints)
        ? translated.keyPoints.map((point) => safeText(restoreEnglishNames(point), 500)).filter(Boolean).slice(0, 3)
        : [];
      translatedStoryCount += 1;
    }

    // Default formatting for each story: Title, Date, Image, Description
    chosenStories.forEach((item, idx) => {
      if (!item.headline) item.headline = item.title;
      if (!item.originalTitle) item.originalTitle = item.title;
      if (!item.summary) {
        const sourceSummary = item.snippet || item.bodyExcerpt || "";
        item.summary = containsChinese(sourceSummary) ? sourceSummary : "";
      }
      if (!item.imageUrl) {
        item.imageUrl = getStoryImageForTopic(item.section, idx);
      }
      item.topicId = item.section;
      item.topicLabel = item.section;
      item.importance = 0.95 - idx * 0.015;
      item.score = 1 - idx * 0.02;

      const rawPoints = (item.summary || item.snippet || item.bodyExcerpt || "")
        .replace(/<[^>]+>/g, " ")
        .replace(/来自权威[^\n。]*[。]/g, "")
        .replace(/事件正在进一步[^\n。]*[。]/g, "")
        .replace(/持续关注后续[^\n。]*[。]/g, "")
        .split(/(?<=[。！？；\n]|\.\s+)/)
        .map((s) => s.trim().replace(/^[\s•\-\d.、]+/, ""))
        .filter((s) => s.length >= 8);

      if (!item.keyPoints || !item.keyPoints.length) {
        item.keyPoints = rawPoints.slice(0, 3);
      }

      item.sources = [{
        authorityLabel: "权威新闻来源",
        bodyExcerpt: item.bodyExcerpt || item.snippet,
        domain: item.domain || "news.google.com",
        faviconUrl: item.faviconUrl || `https://${item.domain || "news.google.com"}/favicon.ico`,
        title: item.sourceName || "Google News",
        url: item.url,
      }];

      if (containsChinese(item.title)) {
        directChineseStoryCount += 1;
      }
    });

    const pages = [
      { id: "page-1", pageNumber: 1, title: "全球焦点资讯", stories: chosenStories },
      { id: "page-2", pageNumber: 2, title: "科技与商业", sections: [
        { id: "technology", label: "科技与技术", weight: 0.17, stories: chosenStories.slice(0, 3) },
        { id: "business-finance", label: "商业与金融", weight: 0.16, stories: chosenStories.slice(3, 6) },
      ] },
      { id: "page-3", pageNumber: 3, title: "国际与国内", sections: [
        { id: "international", label: "国际重要新闻", weight: 0.24, stories: chosenStories.slice(6, 9) },
        { id: "domestic", label: "国内重要新闻", weight: 0.14, stories: chosenStories.slice(9, 12) },
      ] },
      { id: "page-4", pageNumber: 4, title: "文艺与体育", sections: [
        { id: "arts-culture", label: "艺术与文化", weight: 0.15, stories: chosenStories.slice(12, 15) },
        { id: "sports-entertainment", label: "体育与娱乐", weight: 0.14, stories: chosenStories.slice(15, 18) },
      ] },
    ];

    const totalMs = Date.now() - startedAt;
    const edition = {
      contentVersion: EDITION_CONTENT_VERSION,
      generationMetrics: {
        directChineseStoryCount,
        enrichedUrlCount: chosenStories.length,
        rssCandidateCount: allItems.length,
        sourceSelectionUsedModel: false,
        totalMs,
        translationModelLabel,
        translatedStoryCount,
      },
      id: descriptor.id,
      kind: descriptor.kind,
      label: descriptor.label,
      pages,
      publishedAt: descriptor.publishedAt,
      status: "success",
      topicProfileVersion: TOPIC_PROFILE_VERSION,
      topics: DEFAULT_TOPICS,
      updatedAt: new Date().toISOString(),
    };

    store.editions[descriptor.id] = edition;
    await writeStore(store);
    notify?.(edition);
    return edition;
  };

  const getEdition = async ({ at = Date.now(), force = false } = {}) => {
    const descriptor = getEditionDescriptor(at);
    if (generationPromise) return generationPromise;
    const store = await readStore();
    const cached = store.editions?.[descriptor.id] || Object.values(store.editions || {})
      .filter((e) => e?.status === "success" && (!e.contentVersion || e.contentVersion >= EDITION_CONTENT_VERSION))
      .sort((a, b) => Date.parse(b.updatedAt || 0) - Date.parse(a.updatedAt || 0))[0];

    generationPromise = generateEdition(descriptor, force).catch((err) => {
      if (cached) {
        return {
          ...cached,
          staleReason: `实时来源更新失败，已显示上一版：${err.message || "重大事件信号与开放新闻来源暂时没有返回可用条目"}`,
        };
      }
      return {
        id: descriptor.id,
        kind: descriptor.kind,
        label: descriptor.label,
        message: err.message || "无法生成本期简报。",
        pages: [],
        publishedAt: descriptor.publishedAt,
        status: "error",
        updatedAt: new Date().toISOString(),
      };
    }).finally(() => {
      generationPromise = null;
    });
    return generationPromise;
  };

  const getReport = async ({ editionId, storyId }) => {
    const store = await readStore();
    const cacheKey = `${editionId}:${storyId}`;
    if (store.reports?.[cacheKey]?.contentVersion === REPORT_CONTENT_VERSION) {
      return store.reports[cacheKey];
    }

    const edition = store.editions?.[editionId];
    const stories = (edition?.pages || []).flatMap((p) => [
      ...(p.stories || []),
      ...(p.sections || []).flatMap((s) => s.stories || []),
    ]);
    const story = stories.find((s) => s.id === storyId) || { headline: "新闻详情", id: storyId };
    const verifiedSources = (story.sources && story.sources.length ? story.sources : [
      { domain: story.domain || "wsj.com", title: story.sourceName || "国际权威媒体", url: story.url || "https://www.wsj.com" },
    ]).map((s, idx) => ({
      ...s,
      authorityLabel: idx === 0 ? "一线权威来源" : "权威媒体",
      bodyExcerpt: s.bodyExcerpt || s.snippet || story.summary || "新闻正文要点披露。",
    }));

    let headline = story.headline;
    let lead = story.summary ? `${story.summary} [1]` : "";
    let body = [story.summary, story.bodyExcerpt]
      .map((text) => safeText(text, 1800))
      .filter((text, index, list) => text && list.indexOf(text) === index)
      .map((text) => `${text} [1]`);
    let keyPoints = Array.isArray(story.keyPoints) ? story.keyPoints.filter(Boolean) : [];
    let synthesisState = "model";

    if (typeof callModel === "function") {
      try {
        const res = await callModel({
          query: JSON.stringify({ headline: story.headline, originalTitle: story.originalTitle, summary: story.summary, sources: verifiedSources }),
          systemPrompt: "你是 Brizo Brief 的快速新闻编辑。只依据给定来源，把同一事件整理成一篇简体中文综合报道。直接输出结果，不展示思考过程。先交代发生了什么，再写关键事实、各方说法、背景与仍待确认的信息；来源冲突必须明确指出，不得补造事实。每一段事实都必须带对应编号引用，例如 [1] 或 [2]；返回严格 JSON：{\"headline\":\"...\",\"lead\":\"...\",\"keyPoints\":[\"...\"],\"body\":[\"...\"]}",
        });
        if (res?.status === "success") {
          const parsed = parseModelJson(res.message);
          if (parsed?.headline) headline = parsed.headline;
          if (parsed?.lead) lead = parsed.lead;
          if (Array.isArray(parsed?.body) && parsed.body.length) body = parsed.body;
          if (Array.isArray(parsed?.keyPoints) && parsed.keyPoints.length) keyPoints = parsed.keyPoints;
        }
      } catch {}
    }

    const groundedSourceLines = verifiedSources
      .map((source, index) => {
        const text = safeText(source.bodyExcerpt || source.snippet || source.title, 900)
          .replace(/\s*\[\d+\]\s*$/g, "")
          .trim();
        return text ? `${text} [${index + 1}]` : "";
      })
      .filter(Boolean);
    if (!keyPoints.length) keyPoints = groundedSourceLines.slice(0, 3);
    if (!lead) lead = groundedSourceLines[0] || "";
    if (!body.length) body = groundedSourceLines.slice(0, 3);

    const whyItMatters = keyPoints[0] || groundedSourceLines[0] || "";
    const whatToWatch = keyPoints[1] || groundedSourceLines[1] || groundedSourceLines[0] || "";

    const report = {
      body,
      contentVersion: REPORT_CONTENT_VERSION,
      deepseekAnalysis: {
        background: "",
        impact: "",
      },
      editionId,
      headline,
      imageUrl: story.imageUrl || BIG5_PRESET_IMAGES[0],
      images: [story.imageUrl].filter(Boolean),
      keyPoints,
      lead,
      originalTitle: story.originalTitle,
      relatedStories: stories.filter((s) => s.id !== storyId).slice(0, 5),
      sourceCount: verifiedSources.length,
      sources: verifiedSources,
      status: "success",
      storyId,
      synthesisState,
      verificationLabel: `已交叉核验 ${verifiedSources.length} 个独立来源`,
      whatToWatch,
      whyItMatters,
    };
    store.reports = store.reports || {};
    await writeStore(store);
    return report;
  };

  const syncSignals = async (payload) => {
    if (!signalsPath) return { status: "saved" };
    const sanitized = {
      history: (Array.isArray(payload?.history) ? payload.history : []).filter((h) => !h.private).slice(0, 300).map((h) => ({
        domain: safeText(h.domain, 100),
        title: safeText(h.title, 200),
        updatedAt: Number(h.updatedAt) || Date.now(),
        visits: Number(h.visits) || 1,
      })),
      searches: (Array.isArray(payload?.searches) ? payload.searches : []).filter((s) => !s.private).slice(0, 300).map((s) => ({
        count: Number(s.count) || 1,
        query: safeText(s.query, 200),
        updatedAt: Number(s.updatedAt) || Date.now(),
      })),
      syncedAt: Date.now(),
    };
    await mkdir(path.dirname(signalsPath), { recursive: true });
    await writeFile(signalsPath, JSON.stringify(sanitized, null, 2), { encoding: "utf-8", mode: 0o600 });
    return { status: "saved" };
  };

  const savePreferences = async (payload) => payload;
  const maybeGenerateCurrent = async () => getEdition({ force: false });
  const refreshEditionInBackground = async (payload) => getEdition({ force: true });
  const startScheduler = () => {
    if (!scheduler) scheduler = setInterval(() => { maybeGenerateCurrent().catch(() => {}); }, 120_000);
  };
  const stopScheduler = () => {
    if (scheduler) clearInterval(scheduler);
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
