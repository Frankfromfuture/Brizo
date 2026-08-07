import {
  languageForInput,
  mapWithConcurrency,
  matchesRequestedLanguage,
  safeText,
} from "../../shared/search-text.mjs";
import { FRESHNESS_TO_BOCHA } from "./bocha-client.mjs";
import { fuseResults, isEntityOfficialSource } from "./fusion.mjs";
import { FRESHNESS_TO_TBS } from "./serper-client.mjs";

const DEPTH_SCRAPE_COUNT = { fast: 0, balanced: 3, deep: 7 };

function publicSource(result) {
  return {
    title: result.title,
    url: result.url,
    domain: result.domain,
    snippet: result.summary || result.snippet,
    publishedAt: result.publishedAt || "",
    imageUrl: result.faviconUrl || result.imageUrl || "",
    rank: Number.isInteger(result.displayRank) ? result.displayRank : null,
    evidence: result.bodySource,
  };
}

function validateCitations(answer, sources) {
  let grounded = false;
  const cleaned = answer.replace(/\[(\d+)\]/g, (match, raw) => {
    const index = Number(raw) - 1;
    if (!Number.isInteger(index) || index < 0 || index >= sources.length) return "";
    grounded = true;
    return match;
  });
  return {
    answer: cleaned,
    sources,
    grounded,
  };
}

function removeTopLevelMarkdownHeadings(answer) {
  return String(answer || "")
    .split("\n")
    .filter((line) => !/^\s*#(?!#)\s+/.test(line))
    .join("\n")
    .trim();
}

function localeFor(language) {
  // Search display language follows the query text, never the user's IP country.
  if (language === "zh") return { gl: "cn", hl: "zh-cn" };
  if (language === "ja") return { gl: "jp", hl: "ja" };
  if (language === "ko") return { gl: "kr", hl: "ko" };
  return { gl: "us", hl: "en" };
}

function languageTextFor(item) {
  return [
    item?.title,
    item?.summary,
    item?.snippet,
    item?.source,
    item?.siteName,
    item?.address,
    item?.category,
    item?.publicationInfo,
    item?.channel,
  ].filter(Boolean).join(" ");
}

function keepRequestedLanguage(items, language, query = "") {
  return (Array.isArray(items) ? items : [])
    .filter((item) => matchesRequestedLanguage(languageTextFor(item), language)
      || isEntityOfficialSource(item, query));
}

export function officialIntentQuery(query) {
  const text = safeText(query, 300).trim();
  if (!text || !/(?:官网|官方网站|官方|社区|论坛|文档|下载|登录|主页|网站|community|forum|docs?|documentation|download|login|official|website)/i.test(text)) {
    return "";
  }
  return /[\u3400-\u9fff]/u.test(text) ? `${text} 官方网站` : `${text} official website`;
}

export function createSearchService({
  answerEngine,
  serper,
  bocha,
  legacy,
  scrapeCache,
  hasServiceKey,
  getLocalResults = async () => [],
  logger = console,
  retrievalTimeoutMs = 20_000,
}) {
  return {
    async run(payload, { emit, signal }) {
      const query = safeText(payload?.query, 4_000);
      if (!query) throw new Error("请输入搜索内容。");
      const contextLabel = payload?.context?.tab?.url
        ? `${safeText(payload.context.tab.title || payload.context.tab.url, 300)} (${safeText(payload.context.tab.url, 2_000)})`
        : "";
      const threadContext = (Array.isArray(payload?.thread) ? payload.thread : []).slice(-3).map((turn) => [
        `Earlier question: ${safeText(turn?.query, 800)}`,
        `Earlier answer: ${safeText(turn?.answer, 3_000)}`,
      ].join("\n")).join("\n\n");
      const researchContext = [contextLabel, threadContext].filter(Boolean).join("\n\n");

      emit({ type: "stage", stage: "planning", detail: "正在理解问题并规划检索" });
      const planned = await answerEngine.plan(query, {
        depth: payload?.depth || "auto",
        context: researchContext,
        signal,
      });
      const requestedLanguage = languageForInput(query);
      const plannedQueries = (Array.isArray(planned?.queries) ? planned.queries : [])
        .map((item) => safeText(item, 180))
        .filter((item) => item && matchesRequestedLanguage(item, requestedLanguage));
      const officialQuery = officialIntentQuery(query);
      const plan = {
        ...planned,
        language: requestedLanguage,
        queries: [...new Set([query, officialQuery, ...plannedQueries].filter(Boolean))].slice(0, 3),
      };
      emit({ type: "plan", ...plan });

      const locale = localeFor(plan.language);
      const [serperConfigured, bochaConfigured] = await Promise.all([
        hasServiceKey("serper"),
        hasServiceKey("bocha"),
      ]);
      const professionalConfigured = serperConfigured || bochaConfigured;
      emit({ type: "stage", stage: "searching", detail: `正在并行检索 ${plan.queries.length} 组查询` });

      // Provider clients have their own per-request deadlines. This outer watchdog
      // is the final guard against a custom fetch implementation or local source
      // that ignores those deadlines: the UI must never remain in searching forever.
      const retrievalController = new AbortController();
      const abortRetrieval = () => retrievalController.abort(signal?.reason);
      signal?.addEventListener("abort", abortRetrieval, { once: true });
      const effectiveRetrievalTimeoutMs = plan.depth === "fast"
        ? Math.min(retrievalTimeoutMs, 8_000)
        : retrievalTimeoutMs;
      const retrievalTimeout = setTimeout(
        () => retrievalController.abort(new Error("retrieval_stage_timeout")),
        effectiveRetrievalTimeoutMs,
      );
      const retrievalSignal = retrievalController.signal;
      const tasks = [];
      const taskProviders = [];
      if (serperConfigured) {
        taskProviders.push("serper");
        tasks.push(serper.batchSearch(plan.queries, {
          ...locale,
          tbs: FRESHNESS_TO_TBS[plan.freshness] || "",
          num: plan.depth === "deep" ? 12 : 10,
          signal: retrievalSignal,
        }).then((value) => ({ provider: "serper", value })));
      }
      if (bochaConfigured) {
        taskProviders.push("bocha");
        tasks.push(bocha.webSearch(plan.queries[0], {
          freshness: FRESHNESS_TO_BOCHA[plan.freshness] || "noLimit",
          count: plan.depth === "deep" ? 20 : 15,
          signal: retrievalSignal,
        }).then((value) => ({ provider: "bocha", value })));
      }
      if (!professionalConfigured) {
        taskProviders.push("legacy");
        tasks.push(Promise.allSettled(plan.queries.map((plannedQuery) =>
          legacy.search(plannedQuery, { hl: locale.hl, signal: retrievalSignal })
        )).then((queryResults) => {
          const results = queryResults
            .filter((item) => item.status === "fulfilled")
            .flatMap((item) => item.value?.results || []);
          if (!results.length) {
            const reason = queryResults.find((item) => item.status === "rejected")?.reason;
            throw reason instanceof Error ? reason : new Error("公开检索没有返回结果");
          }
          return { provider: "legacy", value: { results } };
        }));
        emit({ type: "notice", level: "warning", message: "未配置专业检索服务，正在使用公开网页检索，覆盖与时效性会受限。" });
      }
      const localPromise = getLocalResults(payload, plan, retrievalSignal).catch(() => []);
      const settled = await Promise.allSettled(tasks);
      clearTimeout(retrievalTimeout);
      signal?.removeEventListener("abort", abortRetrieval);
      const fulfilled = settled.filter((item) => item.status === "fulfilled").map((item) => item.value);
      const retrievalProviders = settled.map((item, index) => ({
        provider: taskProviders[index],
        status: item.status,
        resultCount: item.status === "fulfilled"
          ? (item.value?.value?.results || item.value?.value?.groups?.flat() || []).length
          : 0,
        errorCode: item.status === "rejected" ? safeText(item.reason?.code, 80) : "",
      }));
      const unfilteredRetrievalResults = fulfilled.flatMap(
        ({ value }) => value.results || value.groups?.flat() || [],
      );
      const retrievalResults = keepRequestedLanguage(unfilteredRetrievalResults, requestedLanguage, query);
      const localResults = keepRequestedLanguage(await localPromise, requestedLanguage, query);
      const serperResult = fulfilled.find((item) => item.provider === "serper")?.value;
      const bochaResult = fulfilled.find((item) => item.provider === "bocha")?.value;

      if (!retrievalResults.length && !localResults.length) {
        const reasons = settled.filter((item) => item.status === "rejected")
          .map((item) => item.reason?.message).filter(Boolean).join("；");
        if (unfilteredRetrievalResults.length) {
          throw new Error("检索结果与问题语言不一致，已拦截这些结果；请稍后重试或配置专业检索服务。");
        }
        throw new Error(reasons || "没有找到可用于回答的真实网页结果。");
      }

      let ranked = fuseResults([...retrievalResults, ...localResults], {
        query,
        freshness: plan.freshness,
        blocks: serperResult?.blocks,
        limit: plan.depth === "deep" ? 12 : 10,
      }).map((result, index) => ({ ...result, displayRank: index }));
      if (!ranked.length) throw new Error("没有找到可用于回答的真实网页结果。");

      const cards = [];
      if (serperConfigured && plan.vertical !== "web") {
        try {
          const vertical = await serper.vertical(plan.vertical, plan.queries[0], { ...locale, signal });
          const items = keepRequestedLanguage(vertical.items, requestedLanguage, query);
          if (items.length) cards.push({ kind: vertical.kind, items });
        } catch (error) {
          logger.warn?.("[search-vertical]", error?.message || error);
        }
      } else if (plan.vertical === "images" && bochaResult?.images?.length) {
        const items = keepRequestedLanguage(bochaResult.images, requestedLanguage);
        if (items.length) cards.push({ kind: "images", items });
      }
      if (cards.length) emit({ type: "cards", cards });
      emit({ type: "sources", sources: ranked.map(publicSource), count: ranked.length });

      const scrapeCount = serperConfigured ? DEPTH_SCRAPE_COUNT[plan.depth] || 0 : 0;
      if (scrapeCount > 0) {
        emit({ type: "stage", stage: "reading", detail: `正在阅读 ${Math.min(scrapeCount, ranked.length)} 篇高相关网页` });
        const enriched = await mapWithConcurrency(ranked.slice(0, scrapeCount), 3, async (result) => {
          const cached = await scrapeCache.get(result.url);
          if (cached?.markdown || cached?.text) {
            return { ...result, body: (cached.markdown || cached.text).slice(0, 24_000), bodySource: "scrape" };
          }
          try {
            const scraped = await serper.scrape(result.url, { signal });
            if (scraped.markdown || scraped.text) {
              await scrapeCache.set(result.url, scraped);
              return { ...result, body: (scraped.markdown || scraped.text).slice(0, 24_000), bodySource: "scrape" };
            }
          } catch (error) {
            logger.warn?.("[search-scrape]", result.domain, error?.message || error);
          }
          return result;
        });
        ranked = [...enriched, ...ranked.slice(scrapeCount)];
        ranked = fuseResults(ranked, {
          query,
          freshness: plan.freshness,
          blocks: serperResult?.blocks,
          limit: plan.depth === "deep" ? 12 : 10,
        }).map((result, index) => ({ ...result, displayRank: index }));
        emit({ type: "sources", sources: ranked.map(publicSource), count: ranked.length });
      }

      const freeSignals = [
        ...(serperResult?.blocks?.peopleAlsoAsk || []),
        ...(serperResult?.blocks?.relatedSearches || []),
      ].filter((item) => matchesRequestedLanguage(
        item?.question || item?.query || item,
        requestedLanguage,
      ));
      let followupsPromise = null;
      const startFollowups = () => {
        if (!followupsPromise) {
          followupsPromise = answerEngine.followups({
            query,
            answer: "",
            plan,
            freeSignals,
            signal,
          });
        }
        return followupsPromise;
      };

      emit({ type: "stage", stage: "writing", detail: "正在撰写带引用的答案" });
      let streamedAnswer = "";
      const streamed = await answerEngine.streamAnswer({
        query,
        plan,
        sources: ranked,
        context: researchContext,
        signal,
        onToken: (text) => {
          streamedAnswer += text;
          emit({ type: "token", text });
          // The answer is already visible at this point. Generate the five
          // follow-ups alongside the remaining stream instead of adding another
          // serial model round-trip after the answer has finished.
          startFollowups();
        },
        onRetry: () => emit({ type: "stage", stage: "writing", detail: "模型思考模式未关闭，正在切换兼容方式重试" }),
      });
      const checked = validateCitations(streamed.content || streamedAnswer, ranked);
      const cleanedAnswer = removeTopLevelMarkdownHeadings(checked.answer);
      if (!matchesRequestedLanguage(cleanedAnswer, requestedLanguage)) {
        throw new Error("生成答案与问题语言不一致，已拦截该答案，请重试。");
      }
      const sources = checked.sources.map(publicSource);
      if (!checked.grounded) {
        emit({ type: "notice", level: "warning", message: "答案已生成，但模型没有给出有效编号引用，请谨慎核对下方来源。" });
      }
      const relatedQuestions = (await (followupsPromise || answerEngine.followups({
        query,
        answer: cleanedAnswer,
        plan,
        freeSignals,
        signal,
      }))).filter((item) => matchesRequestedLanguage(item, requestedLanguage)).slice(0, 5);
      const result = {
        status: "success",
        mode: "scout",
        message: cleanedAnswer,
        sources,
        relatedQuestions,
        cards,
        depth: plan.depth,
        plan,
        retrievalProviders,
        grounded: checked.grounded,
        degraded: !professionalConfigured,
      };
      emit({ type: "done", result });
      return result;
    },
  };
}
