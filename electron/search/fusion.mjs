// Cross-provider result fusion.
//
// Replaces main.mjs's `rankAndDedupeSearchResults`, whose score was
// `tokenMatches * 4 + 3/(rank+1)`. That raw match count grows with document length,
// so it systematically favored Bocha results purely because their `summary` field is
// ~4x longer than a Serper `snippet` — a length artifact, not relevance. BM25 with
// length normalization (b = 0.75) removes it.
//
// Ranking is Reciprocal Rank Fusion plus multiplicative boosts. RRF is rank-based,
// so it needs no comparable score scale across providers, which is exactly the
// situation here (Serper exposes `position`, Bocha only array order).

import { tokenCounts, tokenize, tokenSimilarity } from "../../shared/search-text.mjs";
import { dedupeResults } from "./normalize.mjs";

const RRF_K = 60;

export const PROVIDER_WEIGHTS = {
  serper: 1,
  bocha: 0.9,
  local: 0.85,
  legacy: 0.5,
};

// Deliberately NOT the Brief authority table. Brief hard-rejects wikis, Q&A, and
// encyclopedias (AGENTS.md 128) because it is a newspaper; for general-purpose
// search Wikipedia and Zhihu are legitimate, often ideal, sources. Only content
// farms and scraper mirrors are demoted here.
const DEMOTED_DOMAINS = new Set([
  "answers.com", "ask.com", "coursehero.com", "quizlet.com", "scribd.com",
  "slideshare.net", "studocu.com", "chegg.com", "docin.com", "doc88.com",
  "wenku.baidu.com", "renrendoc.com", "book118.com",
]);

const PROMOTED_DOMAINS = new Set([
  "wikipedia.org", "arxiv.org", "nature.com", "science.org", "nih.gov",
  "who.int", "github.com", "stackoverflow.com", "developer.mozilla.org",
  "reuters.com", "apnews.com", "bloomberg.com", "ft.com", "wsj.com",
  "gov.cn", "stats.gov.cn", "xinhuanet.com", "caixin.com",
]);

const OFFICIAL_DOMAIN_SUFFIXES = [
  ".gov", ".gov.cn", ".gov.hk", ".gov.uk", ".gouv.fr", ".go.jp", ".go.kr",
  ".mil", ".edu", ".edu.cn", ".ac.uk",
];

const OFFICIAL_INSTITUTION_DOMAINS = new Set([
  "gov.cn", "stats.gov.cn", "pbc.gov.cn", "samr.gov.cn", "csrc.gov.cn",
  "who.int", "un.org", "worldbank.org", "imf.org", "oecd.org", "wto.org",
  "europa.eu", "nih.gov", "cdc.gov", "sec.gov", "fda.gov",
]);

const AUTHORITATIVE_MEDIA_DOMAINS = new Set([
  "reuters.com", "apnews.com", "bloomberg.com", "ft.com", "wsj.com",
  "nytimes.com", "bbc.com", "bbc.co.uk", "economist.com", "theguardian.com",
  "xinhuanet.com", "people.com.cn", "cctv.com", "chinanews.com.cn",
  "caixin.com", "yicai.com", "thepaper.cn", "sina.com.cn",
]);

function domainMatches(domain, entry) {
  return domain === entry || domain.endsWith(`.${entry}`);
}

export function authorityFactor(domain) {
  const host = String(domain || "").toLowerCase();
  if (!host) return 1;
  for (const entry of DEMOTED_DOMAINS) if (domainMatches(host, entry)) return 0.75;
  for (const entry of PROMOTED_DOMAINS) if (domainMatches(host, entry)) return 1.25;
  return 1;
}

function registrableLabel(domain) {
  const parts = String(domain || "").toLowerCase().split(".").filter(Boolean);
  if (parts.length < 2) return parts[0] || "";
  const compoundSuffix = /^(?:com|org|net|gov|edu|ac)\.(?:cn|hk|uk|jp|kr|au)$/.test(parts.slice(-2).join("."));
  return parts[compoundSuffix ? parts.length - 3 : parts.length - 2] || "";
}

const GENERIC_DOMAIN_LABELS = new Set([
  "ai", "app", "api", "blog", "community", "docs", "download", "help",
  "home", "login", "news", "official", "support", "web", "www",
]);

/**
 * Detect a first-party product/entity domain from the user's own wording. Exact
 * brand-token matching is intentionally stricter than fuzzy relevance: `v0.app`
 * matches “v0 社区”, while `v0zh.cn` and an article merely mentioning v0 do not.
 */
export function isEntityOfficialSource(result, query = "") {
  const host = String(result?.domain || "").toLowerCase().replace(/^www\./, "");
  const label = registrableLabel(host).replace(/-/g, "");
  if (!label || GENERIC_DOMAIN_LABELS.has(label)) return false;
  const queryTokens = new Set(
    String(query || "").toLowerCase().match(/[a-z][a-z0-9-]*/g)?.map((token) => token.replace(/-/g, "")) || [],
  );
  const distinctiveShortBrand = label.length >= 3 || /[a-z]\d|\d[a-z]/.test(label);
  return distinctiveShortBrand && queryTokens.has(label);
}

/**
 * Strict presentation tier: first-party/official sources, recognized major media,
 * then everything else. Relevance still determines order inside each tier.
 */
export function sourceAuthorityTier(result, query = "") {
  const host = String(result?.domain || "").toLowerCase().replace(/^www\./, "");
  const label = registrableLabel(host);
  const sourceName = `${result?.title || ""} ${result?.siteName || ""}`;
  const queryNamesDomain = isEntityOfficialSource(result, query);
  const explicitlyOfficial = /(?:官方网站|官方站点|官网|official\s+(?:site|website))/i.test(sourceName);
  const officialSuffix = OFFICIAL_DOMAIN_SUFFIXES.some((suffix) => host.endsWith(suffix));
  const knownOfficial = [...OFFICIAL_INSTITUTION_DOMAINS].some((domain) => domainMatches(host, domain));
  const institutionalDomain = /(?:^|\.)(?:org|int)$/.test(host);
  const institutionalName = /(?:协会|学会|委员会|研究院|研究所|大学|基金会|association|society|institute|university|foundation|commission)/i.test(sourceName);
  if (officialSuffix || knownOfficial || explicitlyOfficial || queryNamesDomain || (institutionalDomain && institutionalName)) return 0;

  const majorMedia = [...AUTHORITATIVE_MEDIA_DOMAINS].some((domain) => domainMatches(host, domain));
  if (majorMedia) return 1;
  return 2;
}

/**
 * Okapi BM25 over a single result's searchable text, scaled into a bounded
 * multiplier. `b = 0.75` is the length-normalization term that keeps a long summary
 * from outscoring a short snippet on term count alone.
 */
export function bm25Factor(queryTokens, result, averageLength) {
  if (!queryTokens.length) return 1;
  const text = `${result.title} ${result.snippet} ${result.summary}`;
  const counts = tokenCounts(text);
  let length = 0;
  for (const value of counts.values()) length += value;
  if (!length) return 0.85;

  const k1 = 1.2;
  const b = 0.75;
  const norm = averageLength > 0 ? length / averageLength : 1;
  let score = 0;
  for (const token of queryTokens) {
    const frequency = counts.get(token) || 0;
    if (!frequency) continue;
    score += (frequency * (k1 + 1)) / (frequency + k1 * (1 - b + b * norm));
  }
  const saturated = score / (score + queryTokens.length * 0.6);
  return 0.85 + saturated * 0.45;
}

const FRESHNESS_HALF_LIFE_HOURS = {
  day: 12,
  week: 84,
  month: 360,
  year: 4_320,
  any: 0,
};

/**
 * Recency boost, damped by how confident we are in the timestamp. A Serper string
 * parsed from "4 hours ago" (confidence 0.6) must not be weighted like a real ISO
 * timestamp from Bocha (confidence 1).
 */
export function recencyFactor(result, freshness, now) {
  const halfLife = FRESHNESS_HALF_LIFE_HOURS[freshness] || 0;
  if (!halfLife || !result.publishedAt) return 1;
  const ageHours = (now - Date.parse(result.publishedAt)) / 3_600_000;
  if (!Number.isFinite(ageHours) || ageHours < 0) return 1;
  const decay = Math.pow(0.5, ageHours / halfLife);
  const confidence = Math.max(0, Math.min(1, result.publishedConfidence || 0));
  return 1 + 0.8 * decay * confidence;
}

function baseRrfScore(result) {
  let score = 0;
  for (const hit of result.hits) {
    const weight = PROVIDER_WEIGHTS[hit.provider] ?? 0.5;
    score += weight / (RRF_K + (Number(hit.rank) || 0));
  }
  return score;
}

/**
 * Cross-provider agreement bonus. Measured overlap between Serper and Bocha on the
 * same query is near zero (they cover different halves of the web), so this fires
 * rarely and is weighted modestly rather than as a primary signal.
 */
function agreementFactor(result) {
  const providers = new Set(result.hits.map((hit) => hit.provider));
  return providers.size > 1 ? 1.18 : 1;
}

function blockFactor(result, blocks) {
  const url = result.url;
  if (!url) return 1;
  const inAnswerBox = blocks?.answerBox?.link === url;
  const inKnowledgeGraph = blocks?.knowledgeGraph?.descriptionLink === url;
  if (inAnswerBox || inKnowledgeGraph) return 1.35;
  const inPaa = (blocks?.peopleAlsoAsk || []).some((item) => item?.link === url);
  return inPaa ? 1.15 : 1;
}

/** Grounded text is worth a small thumb on the scale, not a dominant term. */
function groundingFactor(result) {
  if (result.body) return 1.1;
  if (result.summary && result.summary.length > 200) return 1.06;
  return 1;
}

/**
 * Collapse near-duplicate coverage of one story. The survivor keeps the highest
 * score; the rest are attached as `alsoCoveredBy` so the source card can show them.
 */
export function clusterByTitle(results, threshold = 0.62) {
  const clusters = [];
  for (const result of results) {
    const match = clusters.find((cluster) =>
      tokenSimilarity(cluster.leader.title, result.title) >= threshold);
    if (match) match.members.push(result);
    else clusters.push({ leader: result, members: [] });
  }
  return clusters.map((cluster) => ({
    ...cluster.leader,
    alsoCoveredBy: cluster.members.map((member) => ({
      domain: member.domain,
      title: member.title,
      url: member.url,
    })),
  }));
}

/**
 * @param {SearchResult[]} results   flat, pre-dedupe
 * @param {object} options
 * @returns {SearchResult[]} ranked, deduped, domain-capped
 */
export function fuseResults(results, {
  query = "",
  freshness = "any",
  blocks = null,
  now = Date.now(),
  limit = 10,
  perDomain = 2,
  rerankOrder = null,
} = {}) {
  const deduped = dedupeResults(results);
  if (!deduped.length) return [];

  const queryTokens = tokenize(query);
  const lengths = deduped.map((result) => {
    let total = 0;
    for (const value of tokenCounts(`${result.title} ${result.snippet} ${result.summary}`).values()) {
      total += value;
    }
    return total;
  });
  const averageLength = lengths.reduce((sum, value) => sum + value, 0) / (lengths.length || 1);

  const scored = deduped.map((result) => ({
    ...result,
    authorityTier: sourceAuthorityTier(result, query),
    score: baseRrfScore(result)
      * bm25Factor(queryTokens, result, averageLength)
      * recencyFactor(result, freshness, now)
      * authorityFactor(result.domain)
      * agreementFactor(result)
      * blockFactor(result, blocks)
      * groundingFactor(result),
  }));

  scored.sort((left, right) => right.score - left.score);

  // An external reranker may reorder, but must never add or drop results.
  const ordered = applyRerankOrder(scored, rerankOrder);
  // Array#sort is stable in supported Chromium/Node runtimes, so this strict tier
  // partition preserves relevance or reranker order within each authority class.
  ordered.sort((left, right) => left.authorityTier - right.authorityTier);
  const clustered = clusterByTitle(ordered);

  const domainCounts = new Map();
  const output = [];
  for (const result of clustered) {
    const count = domainCounts.get(result.domain) || 0;
    if (count >= perDomain) continue;
    domainCounts.set(result.domain, count + 1);
    output.push(result);
    if (output.length >= limit) break;
  }
  return output;
}

/**
 * Reorders by an index list from a reranker. Any malformed, partial, or duplicated
 * order is rejected wholesale in favor of the existing order — a rerank failure must
 * never silently drop results.
 */
export function applyRerankOrder(results, order) {
  if (!Array.isArray(order) || !order.length) return results;
  const seen = new Set();
  const picked = [];
  for (const index of order) {
    if (!Number.isInteger(index) || index < 0 || index >= results.length) continue;
    if (seen.has(index)) continue;
    seen.add(index);
    picked.push(results[index]);
  }
  if (!picked.length) return results;
  for (let index = 0; index < results.length; index += 1) {
    if (!seen.has(index)) picked.push(results[index]);
  }
  return picked;
}
