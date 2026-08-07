// Serper.dev client — Google results, vertical endpoints, and page scraping.
//
// The batch form is the latency lever: POSTing a JSON *array* of query objects runs
// N searches in one HTTP round-trip (still billed 1 credit each), replacing the old
// sequential fan-out. Scraping costs 2 credits and is the only expensive call here,
// so it goes through the ledger's reserve/commit path.

import { domainFor, parsePublishedDate, safeText } from "../../shared/search-text.mjs";
import { makeResult } from "./normalize.mjs";

const SEARCH_ENDPOINT = "https://google.serper.dev/search";
const SCRAPE_ENDPOINT = "https://scrape.serper.dev";
const VERTICAL_ENDPOINTS = {
  news: "https://google.serper.dev/news",
  images: "https://google.serper.dev/images",
  videos: "https://google.serper.dev/videos",
  places: "https://google.serper.dev/places",
  scholar: "https://google.serper.dev/scholar",
};

export const FRESHNESS_TO_TBS = {
  day: "qdr:d",
  week: "qdr:w",
  month: "qdr:m",
  year: "qdr:y",
  any: "",
};

export class SerperQuotaError extends Error {
  constructor(message) {
    super(message || "Serper 检索额度不足。");
    this.name = "SerperQuotaError";
    this.code = "serper_quota";
  }
}

function organicToResults(block, query, now) {
  const items = Array.isArray(block?.organic) ? block.organic : [];
  return items.map((item, index) => {
    const { publishedAt, publishedConfidence } = parsePublishedDate(item?.date, now);
    return makeResult({
      url: item?.link,
      title: item?.title,
      snippet: item?.snippet,
      publishedAt,
      publishedConfidence,
      hits: [{ provider: "serper", rank: Number(item?.position) - 1 || index, query }],
    });
  });
}

/** Blocks Serper returns for free alongside organic results. */
function extractBlocks(block) {
  return {
    answerBox: block?.answerBox || null,
    knowledgeGraph: block?.knowledgeGraph || null,
    peopleAlsoAsk: Array.isArray(block?.peopleAlsoAsk) ? block.peopleAlsoAsk : [],
    relatedSearches: Array.isArray(block?.relatedSearches) ? block.relatedSearches : [],
  };
}

export function createSerperClient({
  fetchImpl = fetch,
  getApiKey,
  ledger = null,
  now = Date.now,
  logger = console,
}) {
  let lastAccount = { remaining: null, rateLimit: null };

  const post = async (endpoint, payload, { signal, timeoutMs = 12_000 } = {}) => {
    const apiKey = await getApiKey();
    if (!apiKey) throw new Error("未配置 Serper API Key。");
    const controller = new AbortController();
    const abortOuter = () => controller.abort();
    signal?.addEventListener("abort", abortOuter, { once: true });
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(endpoint, {
        method: "POST",
        headers: {
          "X-API-KEY": apiKey,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      if (response.status === 402 || response.status === 429) {
        const detail = await response.text().catch(() => "");
        throw new SerperQuotaError(`Serper 返回 HTTP ${response.status}：${detail.slice(0, 200)}`);
      }
      if (!response.ok) {
        const detail = await response.text().catch(() => "");
        throw new Error(`Serper 返回 HTTP ${response.status}：${detail.slice(0, 200)}`);
      }
      return await response.json();
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", abortOuter);
    }
  };

  /** Serper reports remaining credits on every response; trust it over local counting. */
  const syncCredits = (blocks) => {
    const spent = blocks.reduce((total, block) => total + (Number(block?.credits) || 0), 0);
    if (spent && ledger) ledger.recordSpend("serper", spent);
    return spent;
  };

  return {
    /**
     * One HTTP round-trip for N queries.
     * @returns {{groups: SearchResult[][], blocks: object, credits: number}}
     */
    async batchSearch(queries, { gl = "us", hl = "en", tbs = "", num = 10, signal } = {}) {
      const list = queries.filter(Boolean).slice(0, 6);
      if (!list.length) return { groups: [], blocks: extractBlocks(null), credits: 0 };

      const payload = list.map((q) => ({
        q,
        gl,
        hl,
        num,
        ...(tbs ? { tbs } : {}),
      }));
      // A single-element array still returns an array, so the shape stays uniform.
      const raw = await post(SEARCH_ENDPOINT, payload.length === 1 ? payload[0] : payload, { signal });
      const blocks = Array.isArray(raw) ? raw : [raw];
      const timestamp = now();

      const merged = {
        answerBox: null,
        knowledgeGraph: null,
        peopleAlsoAsk: [],
        relatedSearches: [],
      };
      const groups = blocks.map((block, index) => {
        const extracted = extractBlocks(block);
        merged.answerBox = merged.answerBox || extracted.answerBox;
        merged.knowledgeGraph = merged.knowledgeGraph || extracted.knowledgeGraph;
        merged.peopleAlsoAsk.push(...extracted.peopleAlsoAsk);
        merged.relatedSearches.push(...extracted.relatedSearches);
        return organicToResults(block, list[index] || list[0], timestamp);
      });

      return { groups, blocks: merged, credits: syncCredits(blocks) };
    },

    /** news | images | videos | places | scholar — returned as typed cards, not results. */
    async vertical(kind, query, { gl = "us", hl = "en", num = 8, signal } = {}) {
      const endpoint = VERTICAL_ENDPOINTS[kind];
      if (!endpoint || !query) return { kind, items: [], credits: 0 };
      const raw = await post(endpoint, { q: query, gl, hl, num }, { signal });
      const timestamp = now();
      let items = [];
      if (kind === "news") {
        items = (raw?.news || []).map((item) => {
          const { publishedAt, publishedConfidence } = parsePublishedDate(item?.date, timestamp);
          return {
            title: safeText(item?.title, 300),
            url: item?.link || "",
            domain: domainFor(item?.link),
            snippet: safeText(item?.snippet, 400),
            source: safeText(item?.source, 120),
            imageUrl: item?.imageUrl || "",
            dateLabel: safeText(item?.date, 60),
            publishedAt,
            publishedConfidence,
          };
        });
      } else if (kind === "images") {
        items = (raw?.images || []).map((item) => ({
          title: safeText(item?.title, 300),
          imageUrl: item?.imageUrl || "",
          thumbnailUrl: item?.thumbnailUrl || "",
          width: Number(item?.imageWidth) || 0,
          height: Number(item?.imageHeight) || 0,
          url: item?.link || "",
          domain: item?.domain || domainFor(item?.link),
          source: safeText(item?.source, 120),
        }));
      } else if (kind === "videos") {
        items = (raw?.videos || []).map((item) => ({
          title: safeText(item?.title, 300),
          url: item?.link || "",
          snippet: safeText(item?.snippet, 300),
          imageUrl: item?.imageUrl || "",
          duration: safeText(item?.duration, 20),
          channel: safeText(item?.channel, 120),
          dateLabel: safeText(item?.date, 60),
        }));
      } else if (kind === "places") {
        items = (raw?.places || []).map((item) => ({
          title: safeText(item?.title, 200),
          address: safeText(item?.address, 300),
          latitude: Number(item?.latitude) || null,
          longitude: Number(item?.longitude) || null,
          rating: Number(item?.rating) || null,
          ratingCount: Number(item?.ratingCount) || 0,
          category: safeText(item?.category, 80),
          priceLevel: safeText(item?.priceLevel, 40),
          cid: String(item?.cid || ""),
        }));
      } else if (kind === "scholar") {
        items = (raw?.organic || []).map((item) => ({
          title: safeText(item?.title, 300),
          url: item?.link || "",
          snippet: safeText(item?.snippet, 500),
          publicationInfo: safeText(item?.publicationInfo, 300),
          year: Number(item?.year) || null,
          citedBy: Number(item?.citedBy) || 0,
        }));
      }
      return { kind, items, credits: syncCredits([raw]) };
    },

    /** 2 credits. Returns clean article markdown plus Open Graph metadata. */
    async scrape(url, { signal, timeoutMs = 15_000 } = {}) {
      const raw = await post(SCRAPE_ENDPOINT, { url, includeMarkdown: true }, { signal, timeoutMs });
      const markdown = typeof raw?.markdown === "string" ? raw.markdown : "";
      const text = typeof raw?.text === "string" ? raw.text : "";
      // Only charge when content actually came back.
      const credits = markdown || text ? syncCredits([raw]) : 0;
      return {
        markdown,
        text,
        metadata: raw?.metadata || {},
        credits,
      };
    },

    async autocomplete(query, { gl = "us", hl = "en", signal } = {}) {
      try {
        const raw = await post(
          "https://google.serper.dev/autocomplete",
          { q: query, gl, hl },
          { signal, timeoutMs: 4_000 },
        );
        return (raw?.suggestions || [])
          .map((item) => safeText(item?.value, 120))
          .filter(Boolean)
          .slice(0, 8);
      } catch (error) {
        logger.warn?.("[serper-autocomplete]", error?.message || error);
        return [];
      }
    },

    /** Live balance check; also refreshes the cached account snapshot. */
    async account({ signal } = {}) {
      const apiKey = await getApiKey();
      if (!apiKey) return { remaining: null, rateLimit: null };
      const response = await fetchImpl("https://google.serper.dev/account", {
        headers: { "X-API-KEY": apiKey },
        signal,
      });
      if (!response.ok) return lastAccount;
      const body = await response.json();
      lastAccount = {
        remaining: Number(body?.balance) ?? null,
        rateLimit: Number(body?.rateLimit) ?? null,
      };
      if (ledger) ledger.setRemaining("serper", lastAccount.remaining);
      return lastAccount;
    },

    lastAccount: () => lastAccount,
  };
}
