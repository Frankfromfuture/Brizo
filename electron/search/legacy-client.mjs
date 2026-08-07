// Keyless fallback retrieval: DuckDuckGo Lite + Bing RSS.
//
// This is the degraded tier used only when neither Serper nor Bocha is configured.
// Results are markedly worse (snippet-only, no dates, no structured blocks), so the
// UI must badge this state honestly rather than presenting it as normal retrieval.
//
// Ported from main.mjs's `searchDuckDuckGoHtml`, which shelled out to the absolute
// path /usr/bin/curl — that does not exist on the Windows and Linux targets this
// project already builds (`dist:win`, `dist:linux`). This uses fetch instead.

import { load } from "cheerio";

import { domainFor, safeText } from "../../shared/search-text.mjs";
import { makeResult } from "./normalize.mjs";

const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

function normalizeDuckDuckGoUrl(rawUrl) {
  try {
    const url = new URL(rawUrl, "https://lite.duckduckgo.com");
    if (url.hostname.endsWith("duckduckgo.com") && url.searchParams.get("uddg")) {
      return decodeURIComponent(url.searchParams.get("uddg"));
    }
    return url.href;
  } catch {
    return "";
  }
}

function createTimedSignal(outerSignal, timeoutMs) {
  const controller = new AbortController();
  const abortOuter = () => controller.abort(outerSignal?.reason);
  outerSignal?.addEventListener("abort", abortOuter, { once: true });
  const timer = setTimeout(() => controller.abort(new Error("retrieval_timeout")), timeoutMs);
  return {
    signal: controller.signal,
    cleanup() {
      clearTimeout(timer);
      outerSignal?.removeEventListener("abort", abortOuter);
    },
  };
}

export function createLegacyClient({
  fetchImpl = fetch,
  logger = console,
  duckTimeoutMs = 8_000,
  bingTimeoutMs = 6_000,
} = {}) {
  const searchDuckDuckGo = async (query, { signal, hl = "zh-Hans" } = {}) => {
    const timed = createTimedSignal(signal, duckTimeoutMs);
    try {
      const response = await fetchImpl("https://lite.duckduckgo.com/lite/", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": BROWSER_UA,
          Accept: "text/html",
        },
        body: new URLSearchParams({
          q: query,
          ...(String(hl).toLowerCase().startsWith("zh") ? { kl: "cn-zh" } : {}),
        }).toString(),
        redirect: "follow",
        signal: timed.signal,
      });
      if (!response.ok) throw new Error(`DuckDuckGo 返回 HTTP ${response.status}`);
      const $ = load(await response.text());
      const results = [];

      $(".result").each((_, element) => {
        const anchor = $(element).find(".result-link").first();
        const url = normalizeDuckDuckGoUrl(anchor.attr("href") || "");
        const title = safeText(anchor.text(), 300);
        const snippet = safeText($(element).find(".result__snippet").text(), 400);
        if (url && title) results.push({ title, url, snippet });
      });

      if (!results.length) {
        // Lite occasionally serves a table layout instead of .result blocks.
        $(".result-link").each((_, anchorElement) => {
          const anchor = $(anchorElement);
          const url = normalizeDuckDuckGoUrl(anchor.attr("href") || "");
          const title = safeText(anchor.text(), 300);
          const snippet = safeText(
            anchor.closest("tr").nextAll("tr").first().find(".result-snippet").text(),
            400,
          );
          if (url && title) results.push({ title, url, snippet });
        });
      }
      return results.slice(0, 10);
    } finally {
      timed.cleanup();
    }
  };

  const searchBingRss = async (query, { signal, hl = "zh-Hans" } = {}) => {
    const url = new URL("https://www.bing.com/search");
    url.searchParams.set("q", query);
    url.searchParams.set("format", "rss");
    url.searchParams.set("setlang", hl);
    if (String(hl).toLowerCase().startsWith("zh")) url.searchParams.set("cc", "CN");
    const timed = createTimedSignal(signal, bingTimeoutMs);
    try {
      const response = await fetchImpl(url, {
        headers: {
          Accept: "application/rss+xml,application/xml,text/xml",
          "User-Agent": BROWSER_UA,
        },
        signal: timed.signal,
      });
      if (!response.ok) throw new Error(`Bing 返回 HTTP ${response.status}`);
      const $ = load(await response.text(), { xmlMode: true });
      const results = [];
      $("item").each((_, element) => {
        const title = safeText($(element).find("title").first().text(), 300);
        const resultUrl = $(element).find("link").first().text().trim();
        const snippet = safeText(
          $(element).find("description").first().text().replace(/<[^>]+>/g, " "),
          400,
        );
        if (title && resultUrl) results.push({ title, url: resultUrl, snippet });
      });
      return results.slice(0, 10);
    } finally {
      timed.cleanup();
    }
  };

  return {
    /** @returns {{results: SearchResult[]}} */
    async search(query, { signal, hl = "zh-Hans" } = {}) {
      const settled = await Promise.allSettled([
        searchDuckDuckGo(query, { signal, hl }),
        searchBingRss(query, { signal, hl }),
      ]);
      const groups = settled.map((item) => (item.status === "fulfilled" ? item.value : []));
      if (!groups.some((group) => group.length)) {
        const reason = settled.find((item) => item.status === "rejected")?.reason;
        throw reason instanceof Error ? reason : new Error("公开检索没有返回结果");
      }
      for (const item of settled) {
        if (item.status === "rejected") {
          logger.warn?.("[legacy-search]", item.reason?.message || item.reason);
        }
      }
      const results = groups.flatMap((group, groupIndex) =>
        group.map((item, index) =>
          makeResult({
            url: item.url,
            title: item.title,
            snippet: item.snippet,
            domain: domainFor(item.url),
            hits: [{ provider: "legacy", rank: index + groupIndex * 0.5, query }],
          }),
        ),
      );
      return { results };
    },
  };
}
