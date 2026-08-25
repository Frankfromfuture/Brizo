import {
  languageForInput,
  mapWithConcurrency,
  matchesRequestedLanguage,
  safeText,
  tokenize,
  tokenSimilarity,
} from "../../shared/search-text.mjs";
import { FRESHNESS_TO_BOCHA } from "./bocha-client.mjs";
import { fuseResults, isEntityOfficialSource, sourceAuthorityTier } from "./fusion.mjs";
import { FRESHNESS_TO_TBS } from "./serper-client.mjs";
import { isPrimarySourceQueryCandidate } from "./answer-engine.mjs";
import { auditAnswerCitations, selectRelevantPassages } from "./evidence.mjs";
import { makeResult } from "./normalize.mjs";

const DEPTH_SCRAPE_COUNT = { fast: 0, balanced: 3, deep: 7 };
const TRUSTED_ENTITY_IMAGE_DOMAINS = new Set([
  "wikimedia.org", "wikipedia.org", "britannica.com", "loc.gov",
  "si.edu", "metmuseum.org", "nationalgeographic.com",
]);
const COMMUNITY_ENTITY_IMAGE_DOMAINS = new Set([
  "zhihu.com", "bilibili.com", "toutiao.com", "xiaohongshu.com", "weibo.com",
  "pinterest.com", "instagram.com", "facebook.com", "reddit.com", "flickr.com",
  "douban.com", "tieba.baidu.com", "lofter.com", "duitang.com", "smzdm.com",
  "jd.com", "1688.com", "taobao.com", "tmall.com", "alibaba.com", "pinduoduo.com",
]);
const INVALID_ENTITY_IMAGE_HINTS = /(?:二维码|qr(?:[-_ ]?code)?|barcode|条码|captcha|验证码|screenshot|截图|placeholder|占位|not[-_ ]?found|404|error|错误|sprite|icon|图标|avatar|头像|logo|标志|banner|横幅|watermark|水印)/iu;
const CONCRETE_VISUAL_EVIDENCE = /(?:猫|犬|狗|宠物|动物|品种|毛色|被毛|鸟类|鱼类|植物|花卉|车型|汽车|手机|相机|设备|产品|建筑|景区|服装|家具|器物|cat|dog|pet|animal|breed|coat|bird|fish|plant|flower|vehicle|phone|camera|device|product|building|clothing|furniture)/iu;
const ANIMAL_VISUAL_EVIDENCE = /(?:猫|犬|狗|宠物|动物|品种|毛色|被毛|血统|猫舍|犬舍|cat|dog|pet|animal|breed|coat|kennel|cattery)/iu;
const CAT_ENTITY_NAME = /(?:猫|渐层|布偶|英短|美短|缅因|暹罗|狸花|橘猫|蓝猫)/iu;
const DOG_ENTITY_NAME = /(?:犬|狗|柯基|柴犬|哈士奇|萨摩耶|贵宾|金毛|拉布拉多)/iu;
const ABSTRACT_VISUAL_QUERY = /(?:人工智能|产业结构|投资流程|法律|法规|政策|制度|社保|市场|经济|管理|方法|原因|区别|关系|进度|进程|供应商|api|流程|结构|规则|analysis|policy|law|process|economy|market|management|method|difference|relationship)/iu;

function domainMatches(domain, candidate) {
  const host = String(domain || "").toLowerCase().replace(/^www\./, "");
  const expected = String(candidate || "").toLowerCase().replace(/^www\./, "");
  return Boolean(host && expected && (host === expected || host.endsWith(`.${expected}`)));
}

function normalizedEntityText(value) {
  return safeText(value, 300).toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
}

function entityNameMatches(title, entity) {
  const entityKey = normalizedEntityText(entity?.name);
  const titleKey = normalizedEntityText(title);
  if (!entityKey || !titleKey) return false;
  if (titleKey.includes(entityKey)) return true;
  // Search engines often correct one mistyped Han character or return a
  // simplified/traditional name variant. For a person only, two matching name
  // bigrams out of three is strong enough when the source itself is trusted.
  if (entity?.kind === "person" && entityKey.length >= 3) {
    const entityBigrams = tokenize(entityKey);
    if (!entityBigrams.length) return false;
    for (let offset = 0; offset <= titleKey.length - entityKey.length; offset += 1) {
      const window = titleKey.slice(offset, offset + entityKey.length);
      const windowBigrams = tokenize(window);
      const matched = windowBigrams.filter((token) => entityBigrams.includes(token)).length;
      if (matched / entityBigrams.length >= 0.66) return true;
    }
  }
  return false;
}

function confirmedPersonAliases(entity, ranked) {
  if (entity?.kind !== "person") return new Map();
  const entityKey = normalizedEntityText(entity?.name);
  if (entityKey.length < 3 || entityKey.length > 8) return new Map();
  const occurrences = new Map();
  for (const source of Array.isArray(ranked) ? ranked : []) {
    const domain = safeText(source?.domain, 240);
    if (!domain) continue;
    const text = `${source?.title || ""} ${source?.summary || source?.snippet || ""}`;
    for (const sequence of text.match(/[\p{Script=Han}]{3,}/gu) || []) {
      for (let offset = 0; offset <= sequence.length - entityKey.length; offset += 1) {
        const alias = sequence.slice(offset, offset + entityKey.length);
        const sameEnding = alias.slice(-2) === entityKey.slice(-2);
        if (!sameEnding && tokenSimilarity(alias, entity.name) < 0.5) continue;
        if (!occurrences.has(alias)) occurrences.set(alias, new Set());
        occurrences.get(alias).add(domain);
      }
    }
  }
  return new Map([...occurrences].filter(([, domains]) => domains.size >= 2));
}

function resolveEntityKind(entity, query, ranked) {
  if (!entity || entity.kind === "none") {
    const queryText = safeText(query, 100);
    const queryKey = normalizedEntityText(queryText);
    if (queryKey.length < 2 || queryKey.length > 32 || ABSTRACT_VISUAL_QUERY.test(queryText)) return entity;
    const confirmingDomains = new Set();
    for (const source of Array.isArray(ranked) ? ranked : []) {
      const evidence = `${source?.title || ""} ${source?.summary || source?.snippet || ""}`;
      if (CONCRETE_VISUAL_EVIDENCE.test(evidence) && source?.domain) confirmingDomains.add(source.domain);
    }
    return confirmingDomains.size >= 2
      ? { name: queryText, kind: "concept", confidence: 0.78 }
      : entity;
  }
  if (entity.kind !== "concept") return entity;
  const queryKey = normalizedEntityText(query);
  if (!/^[\p{Script=Han}]{2,8}$/u.test(queryKey)) return entity;
  const animalDomains = new Set();
  for (const source of Array.isArray(ranked) ? ranked : []) {
    const evidence = `${source?.title || ""} ${source?.summary || source?.snippet || ""}`;
    if (ANIMAL_VISUAL_EVIDENCE.test(evidence) && source?.domain) animalDomains.add(source.domain);
  }
  if (ANIMAL_VISUAL_EVIDENCE.test(query) || animalDomains.size >= 2) return entity;
  const personSignals = /(?:演员|歌手|艺人|导演|主持人|运动员|作家|画家|科学家|企业家|政治家|出生|生于|履历|生平|主演|出道|事务所|女優|俳優|artist|actor|actress|born|biography)/iu;
  const confirmingDomains = new Set();
  for (const source of Array.isArray(ranked) ? ranked : []) {
    const evidence = `${source?.title || ""} ${source?.summary || source?.snippet || ""}`;
    if (personSignals.test(evidence) && source?.domain) confirmingDomains.add(source.domain);
  }
  return confirmingDomains.size >= 2
    ? { ...entity, kind: "person", confidence: Math.max(0.78, Number(entity.confidence) || 0) }
    : entity;
}

export function isEntityVisualEligible(entity) {
  return Boolean(
    safeText(entity?.name, 100)
    && entity?.kind !== "none"
    && Number(entity?.confidence) >= 0.72,
  );
}

export function selectEntityImages(items, { entity, query, ranked = [] } = {}) {
  if (!isEntityVisualEligible(entity)) return [];
  const confirmedAliases = confirmedPersonAliases(entity, ranked);
  const officialDomains = ranked
    .filter((source) => sourceAuthorityTier(source, query || entity.name) === 0)
    .map((source) => source.domain)
    .filter(Boolean);
  const candidates = (Array.isArray(items) ? items : [])
    .map((item, index) => {
      const originalImageUrl = safeText(item?.imageUrl, 4_000);
      const thumbnailUrl = safeText(item?.thumbnailUrl, 4_000);
      // Search providers sometimes expose an HTTP original alongside an HTTPS
      // thumbnail. Prefer the full image when it is safe, otherwise retain the
      // usable HTTPS thumbnail instead of discarding the whole candidate.
      const imageUrl = [originalImageUrl, thumbnailUrl].find((candidate) => /^https:\/\//i.test(candidate)) || "";
      const url = safeText(item?.url, 4_000);
      const domain = safeText(item?.domain, 240);
      let imageDomain = "";
      try {
        imageDomain = new URL(imageUrl).hostname;
      } catch {
        imageDomain = "";
      }
      // Different pages often reuse the same concise title (for example every
      // result may simply be titled “布偶猫”). Dedupe by source page URL rather
      // than title so those valid independent image candidates survive.
      const pageKey = url.replace(/[?#].*$/, "").replace(/\/$/, "").toLowerCase();
      const imageHint = `${item?.title || ""} ${item?.source || ""} ${item?.url || ""} ${item?.imageUrl || ""}`;
      const official = officialDomains.some((candidate) => domainMatches(domain, candidate));
      const institutional = sourceAuthorityTier(item, entity.name) === 0;
      const trustedReference = [...TRUSTED_ENTITY_IMAGE_DOMAINS].some((candidate) => domainMatches(domain, candidate));
      const authoritativeMedia = sourceAuthorityTier(item, entity.name) === 1;
      const candidateText = normalizedEntityText(item?.title || "");
      const matchedAlias = [...confirmedAliases.keys()].find((alias) => candidateText.includes(alias));
      const namesEntity = entityNameMatches(candidateText, entity) || Boolean(matchedAlias);
      const corroboratedDomain = Boolean(matchedAlias
        && [...confirmedAliases.get(matchedAlias)].some((candidate) => domainMatches(domain, candidate)));
      const corroboratedEntityPage = item?.corroboratedEntityPage === true;
      const usableSize = !(Number(item?.width) > 0 && Number(item?.width) < 240)
        && !(Number(item?.height) > 0 && Number(item?.height) < 140)
        && (!(Number(item?.width) > 0 && Number(item?.height) > 0)
          || (Number(item.width) / Number(item.height) <= 4 && Number(item.width) / Number(item.height) >= 0.25));
      if (!/^https:\/\//i.test(imageUrl) || !/^https?:\/\//i.test(url) || !usableSize) return null;
      if (INVALID_ENTITY_IMAGE_HINTS.test(imageHint) || /\.(?:svg|ico)(?:[?#]|$)/iu.test(imageUrl)) return null;
      if ([...COMMUNITY_ENTITY_IMAGE_DOMAINS]
        .some((candidate) => domainMatches(domain, candidate) || domainMatches(imageDomain, candidate))) return null;
      const strictMatch = official || namesEntity;
      if (!strictMatch && !corroboratedEntityPage) return null;
      return {
        title: safeText(item?.title || entity.name, 180),
        imageUrl,
        thumbnailUrl,
        url,
        domain,
        source: safeText(item?.source || domain, 120),
        authority: official
          ? "official"
          : institutional || trustedReference || corroboratedDomain
            ? "reference"
            : authoritativeMedia
              ? "media"
              : "related",
        pageKey,
        strictMatch,
        score: (official ? 100 : institutional ? 82 : trustedReference ? 72 : corroboratedDomain ? 64 : authoritativeMedia ? 52 : 42)
          + (namesEntity ? 16 : 0)
          + (Number(item?.width) >= 800 ? 4 : 0)
          - index * 0.01,
      };
    })
    .filter(Boolean)
    .sort((left, right) => Number(right.strictMatch) - Number(left.strictMatch) || right.score - left.score);

  // Keep a verified reserve beyond the three visible slots so unreadable or
  // hotlink-blocked candidates can be replaced without weakening relevance.
  const seen = new Set();
  const seenPages = new Set();
  const selected = [];
  for (const candidate of candidates) {
    const key = candidate.imageUrl.replace(/[?#].*$/, "");
    if (seen.has(key) || (candidate.pageKey && seenPages.has(candidate.pageKey))) continue;
    seen.add(key);
    if (candidate.pageKey) seenPages.add(candidate.pageKey);
    const { pageKey: _pageKey, score: _score, strictMatch: _strictMatch, ...item } = candidate;
    selected.push(item);
    if (selected.length >= 9) break;
  }
  return selected;
}

function entityImageQuery(entity, language) {
  if (!isEntityVisualEligible(entity)) return "";
  if (entity.kind === "person") {
    if (language === "zh") return `${entity.name} 人物 照片`;
    if (language === "ja") return `${entity.name} 人物 写真`;
    if (language === "ko") return `${entity.name} 인물 사진`;
    return `${entity.name} portrait photo`;
  }
  if (language === "zh" && CAT_ENTITY_NAME.test(entity.name)) return `${entity.name} 猫 品种 图片`;
  if (language === "zh" && DOG_ENTITY_NAME.test(entity.name)) return `${entity.name} 犬种 图片`;
  if (language === "zh") return `${entity.name} 官方 图片`;
  if (language === "ja") return `${entity.name} 公式 画像`;
  if (language === "ko") return `${entity.name} 공식 이미지`;
  return `${entity.name} official image`;
}

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
    .filter((item) => {
      const text = languageTextFor(item);
      if (matchesRequestedLanguage(text, language) || isEntityOfficialSource(item, query)) return true;
      if (sourceAuthorityTier(item, query) !== 0) return false;
      const explicitlyPlannedPrimarySource = (Array.isArray(item?.hits) ? item.hits : [])
        .some((hit) => !matchesRequestedLanguage(hit?.query, language)
          && isPrimarySourceQueryCandidate(hit?.query, language));
      return explicitlyPlannedPrimarySource || tokenSimilarity(text, query) >= 0.12;
    });
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
  localizeSearchCards = async (cards) => cards,
  localizeSearchImages = async (images) => images,
  localizeSearchSources = async (sources) => sources,
  logger = console,
  retrievalTimeoutMs = 20_000,
}) {
  return {
    async run(payload, { emit, signal }) {
      const searchStartedAt = Date.now();
      let planningDurationMs = 0;
      let retrievalDurationMs = 0;
      let readingDurationMs = 0;
      let synthesisDurationMs = 0;
      const query = safeText(payload?.query, 4_000);
      if (!query) throw new Error("请输入搜索内容。");
      const contextLabel = payload?.context?.tab?.url
        ? `${safeText(payload.context.tab.title || payload.context.tab.url, 300)} (${safeText(payload.context.tab.url, 2_000)})`
        : "";
      const attachmentContext = safeText(payload?.context?.attachmentText, 100_000);
      const threadContext = (Array.isArray(payload?.thread) ? payload.thread : []).slice(-3).map((turn) => [
        `Earlier question: ${safeText(turn?.query, 800)}`,
        `Earlier answer: ${safeText(turn?.answer, 3_000)}`,
      ].join("\n")).join("\n\n");
      const researchContext = [contextLabel, attachmentContext, threadContext].filter(Boolean).join("\n\n");

      emit({ type: "stage", stage: "planning", detail: "正在理解问题并规划检索" });
      const planningStartedAt = Date.now();
      const planned = await answerEngine.plan(query, {
        depth: payload?.depth || "auto",
        context: researchContext,
        signal,
      });
      planningDurationMs = Date.now() - planningStartedAt;
      const requestedLanguage = languageForInput(query);
      const plannedQueries = (Array.isArray(planned?.queries) ? planned.queries : [])
        .map((item) => safeText(item, 180))
        .filter((item) => item && isPrimarySourceQueryCandidate(item, requestedLanguage));
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
      const retrievalStartedAt = Date.now();

      // Provider clients have their own per-request deadlines. This outer watchdog
      // is the final guard against a custom fetch implementation or local source
      // that ignores those deadlines: the UI must never remain in searching forever.
      const retrievalController = new AbortController();
      const abortRetrieval = () => retrievalController.abort(signal?.reason);
      signal?.addEventListener("abort", abortRetrieval, { once: true });
      const effectiveRetrievalTimeoutMs = plan.depth === "fast"
        ? Math.min(retrievalTimeoutMs, 8_000)
        : retrievalTimeoutMs;
      let retrievalTimeout;
      const retrievalSignal = retrievalController.signal;
      const tasks = [];
      const taskProviders = [];
      if (serperConfigured) {
        taskProviders.push("serper");
        tasks.push(serper.batchSearch(plan.queries, {
          ...locale,
          tbs: FRESHNESS_TO_TBS[plan.freshness] || "",
          num: plan.depth === "deep" ? 12 : plan.depth === "fast" ? 8 : 10,
          signal: retrievalSignal,
        }).then((value) => ({ provider: "serper", value })));
      }
      if (bochaConfigured) {
        taskProviders.push("bocha");
        tasks.push(bocha.webSearch(plan.queries[0], {
          freshness: FRESHNESS_TO_BOCHA[plan.freshness] || "noLimit",
          count: plan.depth === "deep" ? 20 : plan.depth === "fast" ? 10 : 15,
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
      const fetchEntityImages = async (entity) => {
        if (!entity) return [];
        const imageController = new AbortController();
        const abortImages = () => imageController.abort(signal?.reason);
        signal?.addEventListener("abort", abortImages, { once: true });
        const timeout = setTimeout(() => imageController.abort(new Error("实体图片检索超时")), 4_500);
        try {
          const imageQuery = entityImageQuery(entity, requestedLanguage);
          const tasks = [];
          const imageProviders = [];
          if (serperConfigured) {
            imageProviders.push("serper");
            tasks.push(serper.vertical("images", imageQuery, {
              ...locale,
              num: 18,
              signal: imageController.signal,
            }).then((value) => ({ images: value?.items || [], pages: [], provider: "serper" })));
          }
          if (bochaConfigured) {
            imageProviders.push("bocha");
            tasks.push(bocha.webSearch(imageQuery, {
              freshness: "noLimit",
              count: 12,
              signal: imageController.signal,
            }).then((value) => ({
              images: value?.images || [],
              pages: value?.results || [],
              provider: "bocha",
            })));
          }
          imageProviders.push("bing-public");
          tasks.push(legacy.imageSearch(imageQuery, {
            hl: locale.hl,
            signal: imageController.signal,
          }).then((value) => ({ images: value?.items || [], pages: [], provider: "bing-public" })));
          const settledImages = await Promise.allSettled(tasks);
          logger.info?.("[search-entity-image-providers]", settledImages.map((item, index) => ({
            provider: imageProviders[index],
            status: item.status,
            candidateCount: item.status === "fulfilled" ? item.value?.images?.length || 0 : 0,
            errorCode: item.status === "rejected" ? safeText(item.reason?.code, 80) : "",
          })));
          return settledImages
            .filter((item) => item.status === "fulfilled")
            .flatMap((item) => {
              const { images = [], pages = [], provider } = item.value;
              return images.map((image) => {
                if (provider !== "bocha") return { ...image, imageProvider: provider };
                const imagePageUrl = safeText(image?.url, 4_000).replace(/[?#].*$/, "").replace(/\/$/, "").toLowerCase();
                const matchingPage = pages.find((page) => {
                  const pageUrl = safeText(page?.url, 4_000).replace(/[?#].*$/, "").replace(/\/$/, "").toLowerCase();
                  if (!imagePageUrl || pageUrl !== imagePageUrl) return false;
                  return entityNameMatches(`${page?.title || ""} ${page?.summary || page?.snippet || ""}`, entity);
                });
                return {
                  ...image,
                  imageProvider: provider,
                  corroboratedEntityPage: Boolean(matchingPage),
                  source: image?.source || matchingPage?.siteName || matchingPage?.domain || image?.domain,
                  title: image?.title || matchingPage?.title || "",
                };
              });
            });
        } catch (error) {
          if (!imageController.signal.aborted || signal?.aborted) {
            logger.warn?.("[search-entity-images]", error?.message || error);
          }
          return [];
        } finally {
          clearTimeout(timeout);
          signal?.removeEventListener("abort", abortImages);
        }
      };
      const visualEntity = isEntityVisualEligible(plan.visualEntity) ? plan.visualEntity : null;
      const entityImagesPromise = visualEntity
        ? fetchEntityImages(visualEntity)
        : Promise.resolve([]);
      const localPromise = getLocalResults(payload, plan, retrievalSignal).catch(() => []);
      let settled;
      let resolvedLocalResults;
      try {
        [settled, resolvedLocalResults] = await Promise.race([
          Promise.all([Promise.allSettled(tasks), localPromise]),
          new Promise((_, reject) => {
            retrievalTimeout = setTimeout(() => {
              const error = new Error("检索阶段超时（timed out），已停止仍未响应的数据源。");
              error.code = "retrieval_stage_timeout";
              retrievalController.abort(error);
              reject(error);
            }, effectiveRetrievalTimeoutMs);
          }),
        ]);
      } finally {
        clearTimeout(retrievalTimeout);
        signal?.removeEventListener("abort", abortRetrieval);
      }
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
      const localResults = keepRequestedLanguage(resolvedLocalResults, requestedLanguage, query);
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

      const resolvedVisualEntity = resolveEntityKind(visualEntity, query, ranked);
      const resolvedEntityImagesPromise = !visualEntity && isEntityVisualEligible(resolvedVisualEntity)
        ? fetchEntityImages(resolvedVisualEntity)
        : entityImagesPromise;

      const entityImagesTask = (async () => {
        const rawEntityImages = [
          ...await resolvedEntityImagesPromise,
          ...(bochaResult?.images || []),
        ];
        const selectedEntityImages = selectEntityImages(rawEntityImages, { entity: resolvedVisualEntity, query, ranked });
        // The main-process localizer performs HTTPS-only DNS pinning, response
        // validation, size limits, and caching. Do not preflight these
        // provider-owned URLs with an unrestricted fetch.
        const rendererImages = (await localizeSearchImages(selectedEntityImages)).slice(0, 3);
        logger.info?.("[search-entity-images]", {
          entityKind: resolvedVisualEntity?.kind || "none",
          eligible: Boolean(resolvedVisualEntity),
          candidates: rawEntityImages.length,
          selected: selectedEntityImages.length,
          readable: rendererImages.length,
        });
        if (rendererImages.length) emit({ type: "entity-images", entity: resolvedVisualEntity, images: rendererImages });
        return rendererImages;
      })();

      const cards = [];
      const verticalEvidence = [];
      if (serperConfigured && plan.vertical !== "web") {
        try {
          const vertical = await serper.vertical(plan.vertical, plan.queries[0], { ...locale, signal });
          const items = keepRequestedLanguage(vertical.items, requestedLanguage, query);
          if (items.length) {
            cards.push({ kind: vertical.kind, items });
            items.forEach((item, index) => {
              const url = safeText(item?.url || item?.link, 4_000);
              if (!/^https?:\/\//iu.test(url)) return;
              verticalEvidence.push(makeResult({
                url,
                title: item?.title || item?.name,
                snippet: item?.snippet || item?.description || item?.publicationInfo,
                summary: item?.summary,
                publishedAt: item?.publishedAt || item?.date,
                publishedConfidence: item?.publishedAt || item?.date ? 0.85 : 0,
                imageUrl: item?.imageUrl || item?.thumbnailUrl,
                siteName: item?.source || item?.siteName,
                hits: [{ provider: `serper-${vertical.kind}`, rank: index, query: plan.queries[0] }],
              }));
            });
          }
        } catch (error) {
          logger.warn?.("[search-vertical]", error?.message || error);
        }
      } else if (plan.vertical === "images" && bochaResult?.images?.length) {
        const items = keepRequestedLanguage(bochaResult.images, requestedLanguage);
        if (items.length) cards.push({ kind: "images", items });
      }
      const rendererCards = cards.length ? await localizeSearchCards(cards) : [];
      if (rendererCards.length) emit({ type: "cards", cards: rendererCards });
      if (verticalEvidence.length) {
        ranked = fuseResults([...ranked, ...verticalEvidence], {
          query,
          freshness: plan.freshness,
          blocks: serperResult?.blocks,
          limit: plan.depth === "deep" ? 12 : 10,
        }).map((result, index) => ({ ...result, displayRank: index }));
      }
      emit({
        type: "sources",
        // Favicons are presentation-only and remote hosts frequently stall or
        // reject hotlink requests. Never block grounded answer generation on
        // them; SourceFavicon already renders a deterministic letter fallback.
        sources: ranked.map(publicSource).map((source) => ({ ...source, imageUrl: "" })),
        count: ranked.length,
      });
      retrievalDurationMs = Date.now() - retrievalStartedAt;

      const scrapeCount = serperConfigured ? DEPTH_SCRAPE_COUNT[plan.depth] || 0 : 0;
      if (scrapeCount > 0) {
        emit({ type: "stage", stage: "reading", detail: `正在阅读 ${Math.min(scrapeCount, ranked.length)} 篇高相关网页` });
        const readingStartedAt = Date.now();
        const enriched = await mapWithConcurrency(ranked.slice(0, scrapeCount), 3, async (result) => {
          const cached = await scrapeCache.get(result.url);
          if (cached?.markdown || cached?.text) {
            return {
              ...result,
              body: selectRelevantPassages(cached.markdown || cached.text, query, {
                maxPassages: plan.depth === "deep" ? 8 : 5,
                maxChars: plan.depth === "deep" ? 12_000 : 8_000,
              }),
              bodySource: "scrape",
            };
          }
          try {
            const scraped = await serper.scrape(result.url, { signal });
            if (scraped.markdown || scraped.text) {
              await scrapeCache.set(result.url, scraped);
              return {
                ...result,
                body: selectRelevantPassages(scraped.markdown || scraped.text, query, {
                  maxPassages: plan.depth === "deep" ? 8 : 5,
                  maxChars: plan.depth === "deep" ? 12_000 : 8_000,
                }),
                bodySource: "scrape",
              };
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
        emit({
          type: "sources",
          sources: ranked.map(publicSource).map((source) => ({ ...source, imageUrl: "" })),
          count: ranked.length,
        });
        readingDurationMs = Date.now() - readingStartedAt;
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
      const synthesisStartedAt = Date.now();
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
      const answerWithoutTopHeading = removeTopLevelMarkdownHeadings(streamed.content || streamedAnswer);
      const checked = auditAnswerCitations(answerWithoutTopHeading, ranked);
      const cleanedAnswer = checked.answer.trim();
      if (!matchesRequestedLanguage(cleanedAnswer, requestedLanguage)) {
        throw new Error("生成答案与问题语言不一致，已拦截该答案，请重试。");
      }
      const sources = ranked.map(publicSource).map((source) => ({ ...source, imageUrl: "" }));
      const relatedQuestions = (await (followupsPromise || answerEngine.followups({
        query,
        answer: cleanedAnswer,
        plan,
        freeSignals,
        signal,
      }))).filter((item) => matchesRequestedLanguage(item, requestedLanguage)).slice(0, 5);
      synthesisDurationMs = Date.now() - synthesisStartedAt;
      const entityImages = await entityImagesTask;
      const totalDurationMs = Date.now() - searchStartedAt;

      const timingSummary = `[search-timing] 字符数: ${query.length} | 总耗时: ${totalDurationMs}ms (规划: ${planningDurationMs}ms | 检索: ${retrievalDurationMs}ms${readingDurationMs ? ` | 阅读: ${readingDurationMs}ms` : ""} | 生成: ${synthesisDurationMs}ms)`;
      logger.info?.(timingSummary);

      const result = {
        status: "success",
        mode: "scout",
        message: cleanedAnswer,
        sources,
        relatedQuestions,
        visualEntity: resolvedVisualEntity,
        entityImages,
        cards: rendererCards,
        depth: plan.depth,
        plan,
        retrievalProviders,
        grounded: checked.grounded,
        citationAudit: {
          verificationLevel: checked.verificationLevel,
          coverage: checked.coverage,
          precision: checked.precision,
          claimCount: checked.claimCount,
          citedClaimCount: checked.citedClaimCount,
          invalidCitationCount: checked.invalidCitationCount,
          unsupportedNumericClaimCount: checked.unsupportedNumericClaimCount,
        },
        degraded: !professionalConfigured,
        timing: {
          totalMs: totalDurationMs,
          planningMs: planningDurationMs,
          retrievalMs: retrievalDurationMs,
          readingMs: readingDurationMs,
          synthesisMs: synthesisDurationMs,
        },
      };
      emit({ type: "done", result });
      return result;
    },
  };
}
