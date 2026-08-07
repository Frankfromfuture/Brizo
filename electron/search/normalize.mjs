// The single canonical search-result shape. Every provider normalizes into this
// inside its own client, so fusion, grounding, and the answer engine never branch
// on which provider a result came from.

import { canonicalizeUrl, domainFor, safeText } from "../../shared/search-text.mjs";

/**
 * @typedef {object} SearchResult
 * @property {string} url                 original URL, used for opening/scraping
 * @property {string} key                 canonical URL, used only for dedupe
 * @property {string} title
 * @property {string} domain
 * @property {string} snippet             ~100 chars, always present
 * @property {string} summary             ~420 chars, "" unless Bocha supplied one
 * @property {string} body                markdown, "" until grounded
 * @property {"scrape"|"cheerio"|"summary"|"snippet"} bodySource
 * @property {string} publishedAt         ISO-8601, "" when unknown
 * @property {number} publishedConfidence 1 exact, 0.85 day-level, 0.6 guessed, 0 none
 * @property {Array<{provider:string, rank:number, query:string}>} hits
 * @property {number} score               assigned by fusion
 * @property {string} imageUrl
 * @property {string} faviconUrl
 * @property {string} siteName
 */

export const BODY_SOURCE_STRENGTH = {
  scrape: 4,
  cheerio: 3,
  summary: 2,
  snippet: 1,
};

export function makeResult(partial = {}) {
  const url = String(partial.url || "").trim();
  const summary = safeText(partial.summary, 1_200);
  const snippet = safeText(partial.snippet, 400);
  const body = typeof partial.body === "string" ? partial.body : "";
  return {
    url,
    key: canonicalizeUrl(url),
    title: safeText(partial.title, 300),
    domain: partial.domain || domainFor(url),
    snippet,
    summary,
    body,
    bodySource: partial.bodySource || (body ? "scrape" : summary ? "summary" : "snippet"),
    publishedAt: partial.publishedAt || "",
    publishedConfidence: Number(partial.publishedConfidence) || 0,
    hits: Array.isArray(partial.hits) ? partial.hits : [],
    score: Number(partial.score) || 0,
    imageUrl: String(partial.imageUrl || ""),
    faviconUrl: String(partial.faviconUrl || ""),
    siteName: safeText(partial.siteName, 120),
  };
}

/** True when `result` has a usable http(s) URL and a title. */
export function isUsableResult(result) {
  return Boolean(result?.key && result.title);
}

/**
 * Union two records of the same canonical URL. This is where the providers'
 * complementary strengths combine: Serper contributes rank position, Bocha
 * contributes a ~420-char `summary` and a real ISO `datePublished`. Every overlap
 * therefore yields free grounding at no extra credit.
 */
export function mergeResults(left, right) {
  const preferLonger = (a, b) => (b || "").length > (a || "").length ? b : a;
  const strongerBody =
    BODY_SOURCE_STRENGTH[right.bodySource] > BODY_SOURCE_STRENGTH[left.bodySource] ? right : left;
  const betterDate =
    right.publishedConfidence > left.publishedConfidence ? right : left;
  return {
    ...left,
    title: preferLonger(left.title, right.title),
    snippet: preferLonger(left.snippet, right.snippet),
    summary: preferLonger(left.summary, right.summary),
    body: strongerBody.body,
    bodySource: strongerBody.bodySource,
    publishedAt: betterDate.publishedAt,
    publishedConfidence: betterDate.publishedConfidence,
    imageUrl: left.imageUrl || right.imageUrl,
    faviconUrl: left.faviconUrl || right.faviconUrl,
    siteName: left.siteName || right.siteName,
    hits: [...left.hits, ...right.hits],
  };
}

/** Collapse a flat list into one record per canonical URL, preserving all hits. */
export function dedupeResults(results) {
  const byKey = new Map();
  for (const result of results) {
    if (!isUsableResult(result)) continue;
    const existing = byKey.get(result.key);
    byKey.set(result.key, existing ? mergeResults(existing, result) : result);
  }
  return [...byKey.values()];
}
