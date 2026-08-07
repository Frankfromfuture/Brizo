// Text, URL, and tokenization helpers shared by the Brief pipeline and the Scout AI
// search pipeline. Kept dependency-free so both the Electron main process and the
// Vite-bundled renderer can import it.

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function safeText(value, limit = 500) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, limit);
}

export function slugify(value, fallback = "topic") {
  const slug = safeText(value, 80).toLowerCase()
    .replace(/[^a-z0-9\u3400-\u9fff]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return slug || fallback;
}

export function domainFor(rawUrl) {
  try {
    return new URL(rawUrl).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return safeText(rawUrl, 120);
  }
}

export function normalizeUrl(rawUrl) {
  try {
    const url = new URL(rawUrl);
    if (!/^https?:$/.test(url.protocol)) return "";
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      if (/^(utm_|spm$|from$|ref$|source$|at_|traffic_source$|ceid$)/i.test(key)) {
        url.searchParams.delete(key);
      }
    }
    return url.href.replace(/\/$/, "");
  } catch {
    return "";
  }
}

const TRACKING_PARAM_PATTERN =
  /^(utm_|spm$|from$|ref$|referrer$|source$|at_|traffic_source$|ceid$|fbclid$|gclid$|gbraid$|wbraid$|msclkid$|yclid$|igshid$|mc_[ce]id$|_hs[a-z]+$|vero_|oly_|piwik_|pk_|s_cid$|cmpid$|campaign_?id$)/i;

/**
 * Aggressive canonical form used as the cross-provider dedupe key. Unlike
 * `normalizeUrl` (whose exact output the Brief store depends on), this also folds
 * scheme, mobile/AMP subdomains, and a wider tracking-parameter set so that the
 * same article arriving from Serper and Bocha collapses into one result.
 * Returns "" for anything that is not an http(s) URL.
 */
export function canonicalizeUrl(rawUrl) {
  try {
    const url = new URL(String(rawUrl || "").trim());
    if (!/^https?:$/.test(url.protocol)) return "";
    url.protocol = "https:";
    url.hash = "";
    url.username = "";
    url.password = "";
    if (url.port === "80" || url.port === "443") url.port = "";
    url.hostname = url.hostname
      .toLowerCase()
      .replace(/^(www|m|mobile|amp)\./, "");
    for (const key of [...url.searchParams.keys()]) {
      if (TRACKING_PARAM_PATTERN.test(key)) url.searchParams.delete(key);
    }
    // Strip the trailing slash on the path itself, not on the final href: otherwise
    // "/a/?b=2" and "/a?b=2" hash to different keys and fail to dedupe.
    if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/, "");
    url.searchParams.sort();
    let href = url.href;
    if (url.search === "") href = href.replace(/\?$/, "");
    return href;
  } catch {
    return "";
  }
}

/** Stable cache key for a query string: collapses whitespace and case. */
export function normalizeQueryKey(query) {
  return String(query || "").replace(/\s+/g, " ").trim().toLowerCase();
}

export function createSearchShareUrl(query) {
  const value = safeText(query, 4_000);
  if (!value) return "";
  const url = new URL("brizo://search");
  url.searchParams.set("q", value);
  return url.href;
}

export function queryFromSearchShareUrl(value) {
  try {
    const url = new URL(String(value || "").trim());
    if (url.protocol !== "brizo:" || url.hostname !== "search") return "";
    return safeText(url.searchParams.get("q"), 4_000);
  } catch {
    return "";
  }
}

export function isZhihuSource(source) {
  const domain = String(source?.domain || "").toLowerCase().replace(/^www\./, "");
  if (domain === "zhihu.com" || domain.endsWith(".zhihu.com")) return true;
  try {
    const hostname = new URL(String(source?.url || "")).hostname.toLowerCase().replace(/^www\./, "");
    return hostname === "zhihu.com" || hostname.endsWith(".zhihu.com");
  } catch {
    return false;
  }
}

const JAPANESE_KANA_PATTERN = /[\u3040-\u30ff\u31f0-\u31ff]/;
const KOREAN_HANGUL_PATTERN = /[\u1100-\u11ff\u3130-\u318f\uac00-\ud7af]/;
const HAN_PATTERN = /[\u3400-\u9fff\uf900-\ufaff]/;

/**
 * Infer the language the user chose by typing, independently of IP country or
 * operating-system locale. Kana and Hangul are checked before Han because a
 * Japanese query can contain Kanji as well as Kana.
 */
export function languageForInput(value) {
  const text = safeText(value, 4_000);
  if (JAPANESE_KANA_PATTERN.test(text)) return "ja";
  if (KOREAN_HANGUL_PATTERN.test(text)) return "ko";
  if (HAN_PATTERN.test(text)) return "zh";
  if (/[a-z]/i.test(text)) return "en";
  return "other";
}

/**
 * Strict display-language gate for search titles, snippets, cards, and online
 * suggestions. Chinese accepts both simplified and traditional Han text while
 * rejecting Japanese/Korean script and pure foreign-language entries.
 */
export function matchesRequestedLanguage(value, language) {
  const text = safeText(value, 4_000);
  if (!text) return false;
  if (language === "zh") {
    const hanCount = (text.match(/[\u3400-\u9fff\uf900-\ufaff]/g) || []).length;
    return hanCount >= 2
      && !JAPANESE_KANA_PATTERN.test(text)
      && !KOREAN_HANGUL_PATTERN.test(text);
  }
  if (language === "ja") return JAPANESE_KANA_PATTERN.test(text);
  if (language === "ko") return KOREAN_HANGUL_PATTERN.test(text);
  if (language === "en") {
    return /[a-z]/i.test(text)
      && !JAPANESE_KANA_PATTERN.test(text)
      && !KOREAN_HANGUL_PATTERN.test(text)
      && !HAN_PATTERN.test(text);
  }
  return true;
}

export function tokenize(value) {
  const text = safeText(value, 2_000).toLowerCase();
  const latin = text.match(/[a-z0-9][a-z0-9.+_-]{1,}/g) || [];
  const chinese = text.match(/[\u3400-\u9fff]+/g) || [];
  const chineseBigrams = chinese.flatMap((segment) => Array.from(
    { length: Math.max(1, segment.length - 1) },
    (_, index) => segment.length === 1 ? segment : segment.slice(index, index + 2),
  ));
  return [...new Set([...latin, ...chineseBigrams])];
}

export function tokenSimilarity(left, right) {
  const leftTokens = new Set(tokenize(left));
  const rightTokens = new Set(tokenize(right));
  if (!leftTokens.size || !rightTokens.size) return 0;
  let overlap = 0;
  for (const token of leftTokens) if (rightTokens.has(token)) overlap += 1;
  return overlap / Math.max(1, Math.min(leftTokens.size, rightTokens.size));
}

/**
 * Token frequencies, preserving repeats. `tokenize` de-duplicates, which is the
 * right behavior for similarity but discards the term frequency that BM25 needs.
 */
export function tokenCounts(value) {
  const text = safeText(value, 20_000).toLowerCase();
  const latin = text.match(/[a-z0-9][a-z0-9.+_-]{1,}/g) || [];
  const chinese = text.match(/[\u3400-\u9fff]+/g) || [];
  const chineseBigrams = chinese.flatMap((segment) => Array.from(
    { length: Math.max(1, segment.length - 1) },
    (_, index) => segment.length === 1 ? segment : segment.slice(index, index + 2),
  ));
  const counts = new Map();
  for (const token of [...latin, ...chineseBigrams]) {
    counts.set(token, (counts.get(token) || 0) + 1);
  }
  return counts;
}

export function parseModelJson(message) {
  const text = String(message || "").replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  const start = Math.min(...[text.indexOf("{"), text.indexOf("[")].filter((value) => value >= 0));
  const sliced = Number.isFinite(start) ? text.slice(start) : text;
  try {
    return JSON.parse(sliced);
  } catch {
    const objectEnd = sliced.lastIndexOf("}");
    const arrayEnd = sliced.lastIndexOf("]");
    const end = Math.max(objectEnd, arrayEnd);
    if (end < 0) return null;
    try { return JSON.parse(sliced.slice(0, end + 1)); } catch { return null; }
  }
}

export async function mapWithConcurrency(items, limit, mapper) {
  const output = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      output[index] = await mapper(items[index], index);
    }
  });
  await Promise.all(workers);
  return output;
}

const RELATIVE_DATE_UNITS = [
  [/(\d+)\s*(?:second|sec)s?\s*ago/i, 1_000],
  [/(\d+)\s*(?:minute|min)s?\s*ago/i, 60_000],
  [/(\d+)\s*(?:hour|hr)s?\s*ago/i, 3_600_000],
  [/(\d+)\s*days?\s*ago/i, 86_400_000],
  [/(\d+)\s*weeks?\s*ago/i, 604_800_000],
  [/(\d+)\s*months?\s*ago/i, 2_592_000_000],
  [/(\d+)\s*years?\s*ago/i, 31_536_000_000],
  [/(\d+)\s*秒前/, 1_000],
  [/(\d+)\s*分钟前/, 60_000],
  [/(\d+)\s*小时前/, 3_600_000],
  [/(\d+)\s*天前/, 86_400_000],
  [/(\d+)\s*周前/, 604_800_000],
  [/(\d+)\s*个?月前/, 2_592_000_000],
  [/(\d+)\s*年前/, 31_536_000_000],
];

/**
 * Serper returns fuzzy strings ("4 hours ago", "2026年4月24日"); Bocha returns real
 * ISO timestamps. Normalize both to ISO so recency scoring has one field, and report
 * a confidence so a guessed timestamp never gets weighted like a known one.
 * @returns {{publishedAt: string, publishedConfidence: number}}
 */
export function parsePublishedDate(raw, now = Date.now()) {
  const text = safeText(raw, 80);
  if (!text) return { publishedAt: "", publishedConfidence: 0 };

  for (const [pattern, unitMs] of RELATIVE_DATE_UNITS) {
    const match = text.match(pattern);
    if (match) {
      const amount = Number(match[1]);
      if (!Number.isFinite(amount)) break;
      return {
        publishedAt: new Date(now - amount * unitMs).toISOString(),
        publishedConfidence: 0.6,
      };
    }
  }
  if (/^(just now|刚刚|刚才)$/i.test(text)) {
    return { publishedAt: new Date(now).toISOString(), publishedConfidence: 0.6 };
  }
  if (/^(yesterday|昨天)$/i.test(text)) {
    return { publishedAt: new Date(now - 86_400_000).toISOString(), publishedConfidence: 0.6 };
  }

  const cjkDate = text.match(/(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/);
  if (cjkDate) {
    const parsed = Date.UTC(Number(cjkDate[1]), Number(cjkDate[2]) - 1, Number(cjkDate[3]));
    if (Number.isFinite(parsed)) {
      return { publishedAt: new Date(parsed).toISOString(), publishedConfidence: 0.85 };
    }
  }

  const parsed = Date.parse(text);
  if (Number.isFinite(parsed)) {
    // A full ISO-8601 timestamp is authoritative; a bare date is a day-level guess.
    const isIsoInstant = /\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(text);
    return {
      publishedAt: new Date(parsed).toISOString(),
      publishedConfidence: isIsoInstant ? 1 : 0.85,
    };
  }
  return { publishedAt: "", publishedConfidence: 0 };
}
