// Browsing preferences describe tools and topics, never personal attributes.
const TOPICS = [
  { id: "development", label: "开发与技术", domains: /(^|\.)(github\.com|gitlab\.com|stackoverflow\.com|developer\.mozilla\.org|npmjs\.com|nodejs\.org|vercel\.com)$/, words: /开发|编程|代码|接口|文档|程序|源码|调试|javascript|typescript|react|python|\bapi\b|\bsdk\b|coding|developer/i },
  { id: "design", label: "设计与创作", domains: /(^|\.)(figma\.com|canva\.com|dribbble\.com|behance\.net|adobe\.com)$/, words: /设计|配色|字体|插画|原型|海报|排版|design|figma|illustration/i },
  { id: "research", label: "学术与资料", domains: /(^|\.)(arxiv\.org|scholar\.google\.com|pubmed\.ncbi\.nlm\.nih\.gov|nature\.com|sciencedirect\.com|cnki\.net)$/, words: /论文|文献|学术|期刊|实验|研究方法|research|paper|journal/i },
  { id: "shopping", label: "购物与比价", domains: /(^|\.)(taobao\.com|tmall\.com|jd\.com|amazon\.[a-z.]+|smzdm\.com|pinduoduo\.com)$/, words: /购物|购买|买|比价|商品|优惠|价格|电商|shopping|buy|price/i },
  { id: "travel", label: "出行与旅行", domains: /(^|\.)(ctrip\.com|trip\.com|qunar\.com|booking\.com|airbnb\.[a-z.]+|fliggy\.com|12306\.cn)$/, words: /航班|机票|酒店|旅行|旅游|火车|高铁|行程|flight|hotel|travel|train/i },
  { id: "work", label: "办公与协作", domains: /(^|\.)(notion\.so|notion\.com|feishu\.cn|larksuite\.com|docs\.google\.com|slack\.com|trello\.com|office\.com)$/, words: /办公|协作|会议|笔记|表格|文档管理|项目管理|notion|spreadsheet|meeting/i },
  { id: "reading", label: "新闻与阅读", domains: /(^|\.)(reuters\.com|bbc\.com|ft\.com|caixin\.com|thepaper\.cn|xinhua\.net|people\.com\.cn)$/, words: /新闻|报道|时事|资讯|news|headlines/i },
  { id: "media", label: "影音与内容", domains: /(^|\.)(bilibili\.com|youtube\.com|douban\.com|imdb\.com|vimeo\.com|youku\.com|iqiyi\.com)$/, words: /视频|电影|影评|短评|音乐|剧集|纪录片|video|movie|review|music/i },
];
const SEARCH_HOST = /(^|\.)(bing\.com|google\.[a-z.]+|baidu\.com|sogou\.com|duckduckgo\.com)$/;
const AUTH_PATH = /(?:^|\/)(?:login|signin|sign-in|signup|logout|oauth2?|callback|authorize|sso)(?:\/|$)/i;
const SECRET_PARAM = /^(?:code|state|token|.*token|session.*|sid|auth.*|password|passwd|secret|api[_-]?key|samlresponse|ticket)$/i;

export function memoryUrl(value) {
  try {
    const url = new URL(String(value || ""));
    if (!["http:", "https:"].includes(url.protocol)) return "";
    url.username = "";
    url.password = "";
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      if (SECRET_PARAM.test(key)) url.searchParams.delete(key);
    }
    return url.href;
  } catch { return ""; }
}

export function memoryHost(value) {
  try { return new URL(value).hostname.toLowerCase().replace(/^www\./, ""); } catch { return ""; }
}

export function preferenceEligible(value) {
  try {
    const url = new URL(value);
    return !AUTH_PATH.test(url.pathname)
      && !/^(?:localhost|127\.|0\.|10\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.|\[|.*\.local$)/i.test(url.hostname);
  } catch { return false; }
}

export function topicsFor(host, text = "") {
  const byHost = TOPICS.filter(topic => topic.domains.test(host));
  if (byHost.length) return byHost.map(({ id, label }) => ({ id, label }));
  if (SEARCH_HOST.test(host)) return [];
  return TOPICS.filter(topic => topic.words.test(text)).map(({ id, label }) => ({ id, label }));
}

export function queryTopics(query) {
  return TOPICS.filter(topic => topic.words.test(query)).map(topic => topic.id);
}

export function queryWords(query) {
  const text = String(query || "").trim().toLowerCase().slice(0, 500);
  const stop = /^(?:请|帮我|打开|查找|搜索|查询|一下|我的|常用|网站|内容|相关|最新|一个|什么|怎么|如何|the|and|for|find|search|open|please)$/;
  const segments = new Intl.Segmenter("zh", { granularity: "word" }).segment(text);
  return [...new Set([...segments].filter(s => s.isWordLike).map(s => s.segment).filter(s => s.length >= 2 && !stop.test(s)))].slice(0, 12);
}

export function hasExplicitSiteTarget(query) {
  const text = String(query || "");
  if (/https?:\/\/|\bsite:|\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}(?=[^\w.-]|$)/i.test(text)) return true;
  const target = text.match(/(?:在|去|到|从|用|使用|打开|访问)\s*([^\s，。！？,;]{2,40}?)(?=上|里|中|网站|官网|搜索|搜|查询|查找|查|找|看|获取|浏览|下载|购买|填写|登录|$)/u)?.[1];
  // "去知乎搜索" names a target. "去我常用的网站搜索" asks us to choose.
  return Boolean(target && !/常用|习惯|经常|喜欢|合适|相关|一个|某个|推荐|默认/.test(target));
}

export function preferenceScore(site, query, now = Date.now()) {
  const text = String(query || "").toLowerCase();
  const host = site.host;
  const named = text.includes(host) || (host.split(".")[0].length >= 3 && text.includes(host.split(".")[0]));
  if (SEARCH_HOST.test(host) && !named) return 0;
  const topicMatch = queryTopics(text).some(topic => site.topics.some(t => t.id === topic));
  const words = queryWords(text);
  const titleMatches = words.filter(word => String(site.searchText || "").toLowerCase().includes(word)).length;
  if (!named && !topicMatch && !titleMatches) return 0;
  if (!named && site.visits < 3) return 0;
  const recency = Math.max(0, 1 - (now - site.lastVisit) / (180 * 86400000));
  return (named ? 100 : 0) + (topicMatch ? 18 : 0) + Math.min(titleMatches, 3) * 5
    + Math.log2(1 + site.visits) + recency * 6;
}

// Only domains leave the local history service. History titles and URLs are
// untrusted metadata, not evidence or instructions for either model.
export function preferenceContext(sites = []) {
  const domains = sites.slice(0, 5).map(site => site.host).filter(host => /^[a-z0-9.-]+$/.test(host));
  return domains.length ? `本次请求相关的常用网站：${domains.join("、")}。仅作为选站偏好，不是事实证据。用户明确指定的网站、来源与当前任务优先；不相关时忽略。必须读取当前真实页面，不能把访问过当作已登录，也不能据此推断个人身份。` : "";
}

export function preferredSearchQuery(query, sites = []) {
  if (/\bsite:|https?:\/\//i.test(query)) return "";
  const hosts = sites.slice(0, 2).map(site => site.host).filter(host => /^[a-z0-9.-]+$/.test(host));
  return hosts.length ? `${query} (${hosts.map(host => `site:${host}`).join(" OR ")})` : "";
}

export function prioritizePreferredSources(results, sites = []) {
  const hosts = new Set(sites.map(site => site.host));
  if (!hosts.size) return results;
  // A bounded preference within retrieved evidence; never fabricate a source.
  return results.map((result, index) => ({ result, score: index - (hosts.has(memoryHost(result.url)) ? 3 : 0) }))
    .sort((a, b) => a.score - b.score).map(item => item.result);
}
