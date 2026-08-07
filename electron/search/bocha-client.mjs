// 博查 (Bocha) client — Chinese-web retrieval.
//
// Two things make Bocha complementary to Serper rather than redundant:
//   * `summary` returns ~420 characters of real page content per result, versus
//     ~100 for a snippet. That is free grounding on every hit, and it is what makes
//     the no-scrape "fast" tier produce a usable answer.
//   * `datePublished` is a real ISO timestamp; Serper only offers fuzzy relative
//     dates ("4 hours ago"), so Bocha anchors recency ranking.
//
// The `/v1/ai-search` and `/v1/rerank` endpoints require a funded balance and
// currently return HTTP 200 with an in-body 403. They are exposed here but latch
// off after one refusal so the pipeline never depends on them or retries in a loop.

import { domainFor, parsePublishedDate, safeText } from "../../shared/search-text.mjs";
import { makeResult } from "./normalize.mjs";

const WEB_SEARCH_ENDPOINT = "https://api.bochaai.com/v1/web-search";
const RERANK_ENDPOINT = "https://api.bochaai.com/v1/rerank";

export const FRESHNESS_TO_BOCHA = {
  day: "oneDay",
  week: "oneWeek",
  month: "oneMonth",
  year: "oneYear",
  any: "noLimit",
};

export class BochaQuotaError extends Error {
  constructor(message) {
    super(message || "博查账户额度不足。");
    this.name = "BochaQuotaError";
    this.code = "bocha_quota";
  }
}

export function createBochaClient({
  fetchImpl = fetch,
  getApiKey,
  now = Date.now,
  logger = console,
}) {
  // Session-scoped latches. A funded key flips these back on next launch.
  const capabilities = { webSearch: true, rerank: true };
  const warned = new Set();

  const warnOnce = (key, message) => {
    if (warned.has(key)) return;
    warned.add(key);
    logger.warn?.("[bocha]", message);
  };

  const post = async (endpoint, payload, { signal, timeoutMs = 10_000 } = {}) => {
    const apiKey = await getApiKey();
    if (!apiKey) throw new Error("未配置博查 API Key。");
    const controller = new AbortController();
    const abortOuter = () => controller.abort();
    signal?.addEventListener("abort", abortOuter, { once: true });
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      if (!response.ok) {
        const detail = await response.text().catch(() => "");
        if (response.status === 401 || response.status === 403) {
          throw new BochaQuotaError(`博查返回 HTTP ${response.status}：${detail.slice(0, 200)}`);
        }
        throw new Error(`博查返回 HTTP ${response.status}：${detail.slice(0, 200)}`);
      }
      const body = await response.json();
      // Bocha reports quota failures as HTTP 200 with an in-body error code.
      const code = String(body?.code ?? "200");
      if (code !== "200") {
        const message = String(body?.message || body?.msg || `博查返回错误码 ${code}`);
        if (code === "403" || code === "401" || /money|quota/i.test(message)) {
          throw new BochaQuotaError(message);
        }
        throw new Error(message);
      }
      return body;
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", abortOuter);
    }
  };

  return {
    capabilities: () => ({ ...capabilities }),

    /** @returns {{results: SearchResult[], images: object[], credits: number}} */
    async webSearch(query, { freshness = "noLimit", count = 15, signal } = {}) {
      if (!query || !capabilities.webSearch) return { results: [], images: [] };
      let body;
      try {
        body = await post(
          WEB_SEARCH_ENDPOINT,
          { query, summary: true, count, freshness },
          { signal },
        );
      } catch (error) {
        if (error instanceof BochaQuotaError) {
          capabilities.webSearch = false;
          warnOnce("webSearch", `web-search 已停用：${error.message}`);
        }
        throw error;
      }

      const timestamp = now();
      const values = body?.data?.webPages?.value || [];
      const results = values.map((item, index) => {
        const { publishedAt, publishedConfidence } = parsePublishedDate(
          item?.datePublished || item?.dateLastCrawled,
          timestamp,
        );
        return makeResult({
          url: item?.url,
          title: item?.name,
          snippet: item?.snippet,
          // The long-form field is the reason Bocha is worth calling.
          summary: item?.summary,
          siteName: item?.siteName,
          domain: domainFor(item?.url),
          // A site icon must never be mistaken for an article hero image. Search
          // source cards can still use it, while Brief enriches a real OG image.
          faviconUrl: item?.siteIcon || "",
          publishedAt,
          publishedConfidence,
          hits: [{ provider: "bocha", rank: index, query }],
        });
      });

      const images = (body?.data?.images?.value || []).map((item) => ({
        title: safeText(item?.name, 200),
        imageUrl: item?.contentUrl || "",
        thumbnailUrl: item?.thumbnailUrl || "",
        width: Number(item?.width) || 0,
        height: Number(item?.height) || 0,
        url: item?.hostPageUrl || "",
        domain: domainFor(item?.hostPageUrl),
      }));

      return { results, images };
    },

    /**
     * Semantic reranking. Unavailable on an unfunded key; callers must treat a null
     * return as "keep the existing order" rather than as an error.
     * @returns {number[]|null} indices into `documents`, best first
     */
    async rerank(query, documents, { model = "gte-rerank", topN = 10, signal } = {}) {
      if (!capabilities.rerank || !documents.length) return null;
      try {
        const body = await post(
          RERANK_ENDPOINT,
          { model, query, documents, top_n: topN, return_documents: false },
          { signal, timeoutMs: 8_000 },
        );
        const results = body?.data?.results || body?.results || [];
        const order = results
          .map((item) => Number(item?.index))
          .filter((index) => Number.isInteger(index) && index >= 0 && index < documents.length);
        return order.length ? order : null;
      } catch (error) {
        if (error instanceof BochaQuotaError) {
          capabilities.rerank = false;
          warnOnce("rerank", `语义重排不可用，改用本地排序：${error.message}`);
        } else {
          warnOnce("rerank-error", `语义重排失败，改用本地排序：${error?.message || error}`);
        }
        return null;
      }
    },
  };
}
