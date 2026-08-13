import { createHash } from "node:crypto";
import path from "node:path";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { readAssistantMessage, sortFastModels } from "./secret-store.mjs";

export const SMART_BOOKMARK_SCHEMA_VERSION = 1;
export const SMART_BOOKMARK_BATCH_SIZE = 60;
export const SMART_BOOKMARK_CONFIDENCE_THRESHOLD = 0.72;
export const SMART_BOOKMARK_REFINEMENT_LIMIT = 48;
const SMART_BOOKMARK_REQUEST_TIMEOUT_MS = 55_000;
const SMART_BOOKMARK_TOTAL_TIMEOUT_MS = 95_000;
const SMART_BOOKMARK_CLUSTER_SIZE_LIMIT = 6;

export const SMART_INDUSTRIES = Object.freeze([
  { id: "technology", label: "科技与互联网", iconId: "computing" },
  { id: "business", label: "商业与金融", iconId: "business" },
  { id: "education", label: "教育与科研", iconId: "education" },
  { id: "health", label: "医疗与生命科学", iconId: "medicine" },
  { id: "design", label: "设计与创意", iconId: "design" },
  { id: "media", label: "媒体与娱乐", iconId: "broadcast" },
  { id: "consumer", label: "消费与生活", iconId: "shopping" },
  { id: "travel", label: "旅行与交通", iconId: "travel" },
  { id: "industry", label: "工业与工程", iconId: "tools" },
  { id: "energy", label: "能源与环境", iconId: "environment" },
  { id: "public", label: "政府、法律与公共事务", iconId: "security" },
  { id: "property", label: "房产与建筑", iconId: "companies" },
  { id: "sports", label: "体育与健身", iconId: "cycling" },
  { id: "other-industry", label: "其他行业", iconId: "archive" },
]);

export const SMART_FUNCTIONS = Object.freeze([
  { id: "news", label: "资讯与阅读", iconId: "news" },
  { id: "search", label: "搜索与导航", iconId: "search" },
  { id: "learning", label: "学习与参考", iconId: "reading" },
  { id: "tools", label: "工具与应用", iconId: "settings" },
  { id: "analytics", label: "数据与分析", iconId: "analytics" },
  { id: "development", label: "开发与运维", iconId: "terminal" },
  { id: "creation", label: "创作与发布", iconId: "presentation" },
  { id: "collaboration", label: "协作与办公", iconId: "people" },
  { id: "community", label: "社区与交流", iconId: "chat" },
  { id: "transaction", label: "交易与服务", iconId: "stores" },
  { id: "entertainment", label: "影音娱乐", iconId: "video" },
  { id: "download", label: "下载与资源", iconId: "document" },
  { id: "admin", label: "管理后台", iconId: "private" },
  { id: "other-function", label: "其他功能", iconId: "folder" },
]);

const industryById = new Map(SMART_INDUSTRIES.map((item, index) => [item.id, { ...item, order: index }]));
const functionById = new Map(SMART_FUNCTIONS.map((item, index) => [item.id, { ...item, order: index }]));

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, Number(value) || 0));
}

export function canonicalSmartBookmarkUrl(value) {
  try {
    const url = new URL(String(value || ""));
    if (!["http:", "https:"].includes(url.protocol)) return "";
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      if (/^(utm_|fbclid$|gclid$|mc_cid$|mc_eid$|ref$|source$)/i.test(key)) {
        url.searchParams.delete(key);
      }
    }
    if (url.pathname !== "/") url.pathname = url.pathname.replace(/\/+$/, "");
    url.hostname = url.hostname.toLowerCase().replace(/^www\./, "");
    return url.href;
  } catch {
    return "";
  }
}

export function smartBookmarkKey(value) {
  const canonicalUrl = canonicalSmartBookmarkUrl(value);
  return canonicalUrl ? createHash("sha256").update(canonicalUrl).digest("hex") : "";
}

export function sanitizeSmartBookmark(bookmark) {
  const canonicalUrl = canonicalSmartBookmarkUrl(bookmark?.url);
  if (!canonicalUrl) return null;
  const url = new URL(canonicalUrl);
  return {
    key: smartBookmarkKey(canonicalUrl),
    title: String(bookmark?.title || url.hostname).replace(/\s+/g, " ").trim().slice(0, 160),
    domain: url.hostname,
    path: url.pathname.slice(0, 120),
    originalFolder: String(bookmark?.folder || "").replace(/\s+/g, " ").trim().slice(0, 120),
    fingerprint: createHash("sha256").update(JSON.stringify([
      String(bookmark?.title || "").trim(),
      url.hostname,
      url.pathname.slice(0, 120),
      String(bookmark?.folder || "").trim(),
    ])).digest("hex"),
  };
}

const INDUSTRY_HINTS = [
  ["technology", /(软件|科技|互联网|ai|人工智能|developer|programming|code|cloud|saas|api)/i],
  ["business", /(商业|金融|投资|股票|基金|银行|finance|business|market|venture|capital)/i],
  ["education", /(教育|学习|课程|学校|大学|论文|研究|education|learn|course|research|paper)/i],
  ["health", /(医疗|健康|生物|医药|医院|health|medical|biotech|medicine)/i],
  ["design", /(设计|创意|摄影|字体|素材|design|creative|photo|font)/i],
  ["media", /(媒体|新闻|电影|音乐|视频|播客|media|news|movie|music|video|podcast)/i],
  ["consumer", /(购物|美食|生活|消费|电商|shop|food|life|store)/i],
  ["travel", /(旅行|旅游|酒店|航班|地图|交通|travel|hotel|flight|map)/i],
  ["industry", /(工业|制造|工程|机械|供应链|manufactur|engineering|robot)/i],
  ["energy", /(能源|环境|气候|电力|碳|energy|climate|environment)/i],
  ["public", /(政府|法律|法院|法规|政策|政务|government|legal|law|policy)/i],
  ["property", /(房产|建筑|住宅|地产|property|real estate|architecture)/i],
  ["sports", /(体育|健身|运动|足球|篮球|sports|fitness|football|basketball)/i],
];

const FUNCTION_HINTS = [
  ["news", /(资讯|新闻|阅读|文章|博客|日报|news|article|blog|read)/i],
  ["search", /(搜索|导航|目录|search|directory|navigation)/i],
  ["learning", /(学习|教程|课程|文档|百科|论文|learn|tutorial|course|docs?|wiki|paper)/i],
  ["analytics", /(数据|分析|统计|图表|行情|analytics|data|dashboard|chart|metrics)/i],
  ["development", /(开发|代码|编程|部署|运维|仓库|developer|code|programming|deploy|devops|github|gitlab)/i],
  ["creation", /(创作|写作|发布|设计|编辑|生成|create|write|publish|editor|design)/i],
  ["collaboration", /(协作|办公|项目|会议|文档|collaborat|office|project|meeting|notion|slack)/i],
  ["community", /(社区|论坛|问答|聊天|社交|community|forum|chat|social)/i],
  ["transaction", /(购买|交易|支付|预订|商城|服务|buy|trade|payment|booking|shop)/i],
  ["entertainment", /(视频|音乐|电影|游戏|直播|video|music|movie|game|stream)/i],
  ["download", /(下载|资源|素材|模板|网盘|download|resource|asset|template)/i],
  ["admin", /(后台|管理|控制台|仪表盘|admin|console|dashboard)/i],
  ["tools", /(工具|应用|转换|计算|生成器|tool|app|convert|calculator|generator)/i],
];

function hintFromRules(value, rules, fallback) {
  return rules.find(([, pattern]) => pattern.test(value))?.[0] || fallback;
}

function bookmarkIntent(bookmark) {
  const text = `${bookmark.title} ${bookmark.domain} ${bookmark.path} ${bookmark.originalFolder}`;
  return {
    functionId: hintFromRules(text, FUNCTION_HINTS, "other-function"),
    industryId: hintFromRules(text, INDUSTRY_HINTS, "other-industry"),
  };
}

function bookmarkPathFamily(value) {
  return String(value || "").split("/").filter(Boolean).slice(0, 2)
    .map((segment) => /^(?:\d{3,}|[0-9a-f]{8,}|[0-9a-z_-]{24,})$/i.test(segment) ? ":id" : segment.toLowerCase())
    .join("/");
}

function bookmarkFolderRoot(value) {
  return String(value || "").split("/").map((part) => part.trim().toLowerCase()).filter(Boolean)[0] || "";
}

export function buildSmartBookmarkClusters(bookmarks = []) {
  const sanitized = bookmarks.map((bookmark) => bookmark?.fingerprint ? bookmark : sanitizeSmartBookmark(bookmark)).filter(Boolean);
  const domainCounts = new Map();
  for (const bookmark of sanitized) domainCounts.set(bookmark.domain, (domainCounts.get(bookmark.domain) || 0) + 1);
  const groups = new Map();
  const baseCounts = new Map();
  for (const bookmark of sanitized) {
    const intent = bookmarkIntent(bookmark);
    const folderRoot = bookmarkFolderRoot(bookmark.originalFolder);
    const repeatedDomain = (domainCounts.get(bookmark.domain) || 0) > 1;
    const hasSemanticAnchor = folderRoot || intent.industryId !== "other-industry" || intent.functionId !== "other-function";
    const baseSignature = repeatedDomain
      ? `domain:${bookmark.domain}|path:${bookmarkPathFamily(bookmark.path)}|fn:${intent.functionId}`
      : hasSemanticAnchor
        ? `single:${folderRoot}|industry:${intent.industryId}|fn:${intent.functionId}`
        : `item:${bookmark.key}`;
    const existingCount = baseCounts.get(baseSignature) || 0;
    const signature = `${baseSignature}|part:${Math.floor(existingCount / SMART_BOOKMARK_CLUSTER_SIZE_LIMIT)}`;
    if (!groups.has(signature)) groups.set(signature, []);
    groups.get(signature).push(bookmark);
    baseCounts.set(baseSignature, existingCount + 1);
  }
  return [...groups.entries()].map(([signature, members]) => ({
    id: `c${createHash("sha256").update(signature).digest("hex").slice(0, 12)}`,
    members,
    representative: {
      domain: [...new Set(members.map((item) => item.domain))].join(" | ").slice(0, 360),
      fingerprint: createHash("sha256").update(members.map((item) => item.fingerprint).join("|")).digest("hex"),
      key: `c${createHash("sha256").update(signature).digest("hex").slice(0, 12)}`,
      originalFolder: [...new Set(members.map((item) => item.originalFolder).filter(Boolean))].join(" | ").slice(0, 360),
      path: members.map((item) => item.path).join(" | ").slice(0, 480),
      title: members.map((item) => item.title).join(" | ").slice(0, 720),
    },
  }));
}

function visitEntryMap(entries = []) {
  const map = new Map();
  for (const entry of Array.isArray(entries) ? entries : []) {
    const canonicalUrl = canonicalSmartBookmarkUrl(entry?.url);
    if (!canonicalUrl) continue;
    const current = map.get(canonicalUrl) || { lastVisitedAt: 0, visits: 0 };
    map.set(canonicalUrl, {
      lastVisitedAt: Math.max(current.lastVisitedAt, Number(entry?.lastVisitedAt || entry?.updatedAt) || 0),
      visits: Math.max(current.visits, Number(entry?.visits) || 0),
    });
  }
  return map;
}

export function mergeVisitWeights(bookmarks, history = [], sourceHistory = []) {
  const brizo = visitEntryMap(history);
  const source = visitEntryMap(sourceHistory);
  const weights = {};
  for (const bookmark of bookmarks) {
    const canonicalUrl = canonicalSmartBookmarkUrl(bookmark?.url);
    const key = smartBookmarkKey(canonicalUrl);
    if (!key) continue;
    const local = brizo.get(canonicalUrl) || { lastVisitedAt: 0, visits: 0 };
    const imported = source.get(canonicalUrl) || { lastVisitedAt: 0, visits: 0 };
    weights[key] = {
      lastVisitedAt: Math.max(local.lastVisitedAt, imported.lastVisitedAt),
      visitWeight: Math.max(0, imported.visits) + Math.max(0, local.visits),
    };
  }
  return weights;
}

function normalizeAssignment(candidate, bookmark) {
  if (!candidate || candidate.key !== bookmark.key) return null;
  const industryId = industryById.has(candidate.industryId) ? candidate.industryId : "other-industry";
  const functionId = functionById.has(candidate.functionId) ? candidate.functionId : "other-function";
  return {
    confidence: clamp(candidate.confidence, 0, 1),
    fingerprint: bookmark.fingerprint,
    functionId,
    industryId,
    key: bookmark.key,
  };
}

function categoryScore(assignments, visitWeights, field, id) {
  const matches = assignments.filter((item) => item[field] === id);
  return {
    count: matches.length,
    visits: matches.reduce((sum, item) => sum + (visitWeights[item.key]?.visitWeight || 0), 0),
  };
}

function selectCategoryIds(assignments, visitWeights, field, catalog, limit, otherId) {
  const ids = [...new Set(assignments.map((item) => item[field]))].filter((id) => id !== otherId);
  ids.sort((left, right) => {
    const a = categoryScore(assignments, visitWeights, field, left);
    const b = categoryScore(assignments, visitWeights, field, right);
    return b.count - a.count
      || b.visits - a.visits
      || (catalog.get(left)?.order ?? 999) - (catalog.get(right)?.order ?? 999);
  });
  const selected = ids.slice(0, limit);
  const needsOther = assignments.some((item) => item[field] === otherId) || ids.length > limit;
  if (needsOther) selected.push(otherId);
  return selected;
}

export function buildSmartBookmarkSnapshot({
  assignments,
  bookmarks,
  forceFull = false,
  generatedAt = Date.now(),
  previousSnapshot = null,
  sourceHistory = [],
  history = [],
}) {
  const sanitized = bookmarks.map(sanitizeSmartBookmark).filter(Boolean);
  const bookmarkByKey = new Map(sanitized.map((bookmark) => [bookmark.key, bookmark]));
  const rawBookmarkByKey = new Map(bookmarks.map((bookmark) => [smartBookmarkKey(bookmark?.url), bookmark]));
  const visitWeights = mergeVisitWeights(bookmarks, history, sourceHistory);
  const previousAssignments = new Map((previousSnapshot?.assignments || []).map((item) => [item.key, item]));
  const incoming = new Map();
  for (const candidate of assignments || []) {
    const bookmark = bookmarkByKey.get(candidate?.key);
    const normalized = bookmark ? normalizeAssignment(candidate, bookmark) : null;
    if (normalized) incoming.set(normalized.key, normalized);
  }
  const merged = sanitized.map((bookmark) => {
    const candidate = incoming.get(bookmark.key);
    if (candidate) return candidate;
    const previous = previousAssignments.get(bookmark.key);
    if (previous && previous.fingerprint === bookmark.fingerprint) return previous;
    return {
      confidence: 0,
      fingerprint: bookmark.fingerprint,
      functionId: "other-function",
      industryId: "other-industry",
      key: bookmark.key,
    };
  });

  let industryIds;
  const lockedIndustries = !forceFull && previousSnapshot?.folders?.map((folder) => folder.id).filter(Boolean);
  if (lockedIndustries?.length) {
    industryIds = [...lockedIndustries];
    if (merged.some((item) => !industryIds.includes(item.industryId)) && !industryIds.includes("other-industry")) {
      industryIds.push("other-industry");
    }
  } else {
    industryIds = selectCategoryIds(merged, visitWeights, "industryId", industryById, 8, "other-industry");
  }

  const normalizedForTree = merged.map((item) => ({
    ...item,
    industryId: industryIds.includes(item.industryId) ? item.industryId : "other-industry",
  }));
  const folders = industryIds.map((industryId) => {
    const industry = industryById.get(industryId) || industryById.get("other-industry");
    const industryAssignments = normalizedForTree.filter((item) => item.industryId === industryId);
    const previousFolder = previousSnapshot?.folders?.find((folder) => folder.id === industryId);
    let functionIds = !forceFull && previousFolder?.children?.map((folder) => folder.id).filter(Boolean);
    if (functionIds?.length) {
      if (industryAssignments.some((item) => !functionIds.includes(item.functionId)) && !functionIds.includes("other-function")) {
        functionIds = [...functionIds, "other-function"];
      }
    } else {
      functionIds = selectCategoryIds(industryAssignments, visitWeights, "functionId", functionById, 5, "other-function");
    }
    const normalizedIndustryAssignments = industryAssignments.map((item) => ({
      ...item,
      functionId: functionIds.includes(item.functionId) ? item.functionId : "other-function",
    }));
    return {
      children: functionIds.map((functionId) => {
        const definition = functionById.get(functionId) || functionById.get("other-function");
        const bookmarkKeys = normalizedIndustryAssignments
          .filter((item) => item.functionId === functionId)
          .sort((left, right) => {
            const a = visitWeights[left.key] || {};
            const b = visitWeights[right.key] || {};
            const leftBookmark = rawBookmarkByKey.get(left.key) || {};
            const rightBookmark = rawBookmarkByKey.get(right.key) || {};
            return (b.visitWeight || 0) - (a.visitWeight || 0)
              || (b.lastVisitedAt || 0) - (a.lastVisitedAt || 0)
              || (Number(rightBookmark.updatedAt) || 0) - (Number(leftBookmark.updatedAt) || 0)
              || String(leftBookmark.title || "").localeCompare(String(rightBookmark.title || ""), "zh-CN");
          })
          .map((item) => item.key);
        return { bookmarkKeys, iconId: definition.iconId, id: definition.id, label: definition.label };
      }),
      iconId: industry.iconId,
      id: industry.id,
      label: industry.label,
    };
  });

  return {
    assignments: normalizedForTree,
    folders,
    generatedAt,
    schemaVersion: SMART_BOOKMARK_SCHEMA_VERSION,
    stats: {
      bookmarkCount: sanitized.length,
      lowConfidenceCount: normalizedForTree.filter((item) => item.confidence < SMART_BOOKMARK_CONFIDENCE_THRESHOLD).length,
    },
    visitWeights,
  };
}

class SmartBookmarkModelOutputError extends Error {}

function unwrapJsonValue(value) {
  let parsed = value;
  for (let depth = 0; depth < 2 && typeof parsed === "string"; depth += 1) {
    parsed = JSON.parse(parsed);
  }
  return parsed;
}

function findBalancedJsonObject(source) {
  let start = -1;
  let depth = 0;
  let quoted = false;
  let escaped = false;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (quoted) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') quoted = false;
      continue;
    }
    if (character === '"') {
      quoted = true;
      continue;
    }
    if (character === "{") {
      if (depth === 0) start = index;
      depth += 1;
    } else if (character === "}" && depth > 0) {
      depth -= 1;
      if (depth === 0 && start >= 0) return source.slice(start, index + 1);
    }
  }
  return "";
}

function extractJsonObject(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) return value;
  const source = String(value || "")
    .replace(/^\uFEFF/, "")
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
  if (!source) throw new SmartBookmarkModelOutputError("DeepSeek 返回了空内容。");
  try {
    const parsed = unwrapJsonValue(source);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
  } catch { /* Try the first complete JSON object embedded in surrounding prose. */ }
  const objectSource = findBalancedJsonObject(source);
  if (objectSource) {
    try {
      const parsed = unwrapJsonValue(objectSource);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
    } catch { /* Fall through to a stable model-output error. */ }
  }
  throw new SmartBookmarkModelOutputError("DeepSeek 没有返回有效 JSON。");
}

function readSmartAssistantPayload(body) {
  const parsed = body?.choices?.[0]?.message?.parsed;
  if (parsed && typeof parsed === "object") return parsed;
  const standardContent = readAssistantMessage(body);
  if (standardContent) return standardContent;
  const message = body?.choices?.[0]?.message;
  const responseOutput = Array.isArray(body?.output)
    ? body.output.flatMap((item) => Array.isArray(item?.content) ? item.content : [])
      .map((item) => item?.text?.value || item?.text || item?.content || "")
      .filter((item) => typeof item === "string" && item)
      .join("\n")
    : "";
  return body?.choices?.[0]?.text
    || body?.output_text
    || responseOutput
    || message?.reasoning_content
    || "";
}

function parseDeepSeekResponseText(text) {
  const source = String(text || "").trim();
  try {
    return JSON.parse(source);
  } catch { /* Some OpenAI-compatible gateways return SSE despite stream: false. */ }
  const eventPayloads = source.split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trim())
    .filter((line) => line && line !== "[DONE]");
  if (!eventPayloads.length) {
    throw new SmartBookmarkModelOutputError("DeepSeek 接口没有返回 JSON 响应。");
  }
  let content = "";
  let reasoningContent = "";
  let finishReason = "";
  for (const payload of eventPayloads) {
    let event;
    try { event = JSON.parse(payload); }
    catch { throw new SmartBookmarkModelOutputError("DeepSeek 的分段响应不完整。"); }
    const choice = event?.choices?.[0];
    content += typeof choice?.delta?.content === "string"
      ? choice.delta.content
      : typeof choice?.message?.content === "string" ? choice.message.content : "";
    reasoningContent += typeof choice?.delta?.reasoning_content === "string"
      ? choice.delta.reasoning_content
      : typeof choice?.message?.reasoning_content === "string" ? choice.message.reasoning_content : "";
    finishReason = choice?.finish_reason || finishReason;
  }
  if (!content && !reasoningContent) {
    throw new SmartBookmarkModelOutputError("DeepSeek 的分段响应没有内容。");
  }
  return {
    choices: [{
      finish_reason: finishReason,
      message: { content, ...(reasoningContent ? { reasoning_content: reasoningContent } : {}) },
    }],
  };
}

function buildClassificationPrompt(bookmarks) {
  return JSON.stringify({
    industries: SMART_INDUSTRIES.map(({ id, label }) => ({ id, label })),
    functions: SMART_FUNCTIONS.map(({ id, label }) => ({ id, label })),
    bookmarks: bookmarks.map(({ key, title, domain, path: pagePath, originalFolder, description }) => ({
      key, title, domain, path: pagePath, originalFolder, ...(description ? { description } : {}),
    })),
  });
}

async function classifyBatch(provider, bookmarks, fetchImpl, { deadlineAt = Number.POSITIVE_INFINITY, repair = false } = {}) {
  const requestBookmarks = bookmarks.map((bookmark, index) => ({
    ...bookmark,
    key: `b${index.toString(36)}`,
  }));
  const originalByRequestKey = new Map(requestBookmarks.map((bookmark, index) => [bookmark.key, bookmarks[index]]));
  const remainingTime = deadlineAt - Date.now();
  if (remainingTime <= 0) throw new SmartBookmarkModelOutputError("智能整理已暂停，进度已经保存。");
  let response;
  try {
    response = await fetchImpl(`${provider.baseUrl}/chat/completions`, {
      method: "POST",
      headers: { Accept: "application/json", Authorization: `Bearer ${provider.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: provider.model,
        messages: [
          {
            role: "system",
            content: `${repair ? "上一次请求未能完成，请简洁作答。" : ""}你是网页收藏夹分类器。只能使用给定的 industryId 和 functionId。每条输入必须且只能输出一次，key 必须原样返回。confidence 必须是 0 到 1 的数字。只输出 JSON 对象：{\"assignments\":[{\"key\":\"b0\",\"industryId\":\"technology\",\"functionId\":\"tools\",\"confidence\":0.9}]}。禁止 Markdown、解释和额外字段。`,
          },
          { role: "user", content: buildClassificationPrompt(requestBookmarks) },
        ],
        max_tokens: 8_000,
        response_format: { type: "json_object" },
        stream: false,
        temperature: 0,
      }),
      signal: AbortSignal.timeout(Math.max(1_000, Math.min(SMART_BOOKMARK_REQUEST_TIMEOUT_MS, remainingTime))),
    });
  } catch (error) {
    if (error?.name === "TimeoutError" || error?.name === "AbortError" || /aborted due to timeout/i.test(error?.message || "")) {
      throw new SmartBookmarkModelOutputError("DeepSeek 请求超时，请稍后重试。");
    }
    throw error;
  }
  if (!response.ok) throw new Error(`DeepSeek 接口返回 HTTP ${response.status}`);
  const body = parseDeepSeekResponseText(await response.text());
  const finishReason = String(body?.choices?.[0]?.finish_reason || "");
  if (finishReason === "length" || finishReason === "max_tokens") {
    throw new SmartBookmarkModelOutputError("DeepSeek 分类输出被截断。");
  }
  const parsed = extractJsonObject(readSmartAssistantPayload(body));
  const candidates = Array.isArray(parsed?.assignments) ? parsed.assignments : [];
  const byKey = new Map(candidates.map((item) => [item?.key, item]));
  if (candidates.length !== requestBookmarks.length || byKey.size !== candidates.length) {
    throw new SmartBookmarkModelOutputError("DeepSeek 返回的分类缺失或重复。");
  }
  const normalized = requestBookmarks.map((requestBookmark) => {
    const candidate = byKey.get(requestBookmark.key);
    const originalBookmark = originalByRequestKey.get(requestBookmark.key);
    if (!candidate
      || !originalBookmark
      || candidate.key !== requestBookmark.key
      || !industryById.has(candidate.industryId)
      || !functionById.has(candidate.functionId)
      || typeof candidate.confidence !== "number"
      || !Number.isFinite(candidate.confidence)
      || candidate.confidence < 0
      || candidate.confidence > 1) return null;
    return {
      confidence: candidate.confidence,
      fingerprint: originalBookmark.fingerprint,
      functionId: candidate.functionId,
      industryId: candidate.industryId,
      key: originalBookmark.key,
    };
  });
  if (normalized.some((item) => !item)) throw new SmartBookmarkModelOutputError("DeepSeek 返回了越界或无效分类。");
  return normalized;
}

async function classifyBatchWithRetry(provider, bookmarks, fetchImpl, deadlineAt = Number.POSITIVE_INFINITY) {
  try {
    return await classifyBatch(provider, bookmarks, fetchImpl, { deadlineAt });
  } catch (error) {
    if (!(error instanceof SmartBookmarkModelOutputError)) throw error;
    if (bookmarks.length <= 1) return await classifyBatch(provider, bookmarks, fetchImpl, { deadlineAt, repair: true });
    const midpoint = Math.ceil(bookmarks.length / 2);
    const repaired = [];
    for (const smallerBatch of [bookmarks.slice(0, midpoint), bookmarks.slice(midpoint)]) {
      repaired.push(...await classifyBatch(provider, smallerBatch, fetchImpl, { deadlineAt, repair: true }));
    }
    return repaired;
  }
}

async function mapWithConcurrency(items, concurrency, task) {
  const output = new Array(items.length);
  let cursor = 0;
  let failure = null;
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length && !failure) {
      const index = cursor++;
      try {
        output[index] = await task(items[index], index);
      } catch (error) {
        failure ||= error;
      }
    }
  }));
  if (failure) throw failure;
  return output;
}

async function writeSnapshotAtomic(storePath, snapshot) {
  await mkdir(path.dirname(storePath), { recursive: true });
  const temporaryPath = `${storePath}.${process.pid}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(snapshot)}\n`, { mode: 0o600 });
  await rename(temporaryPath, storePath);
}

function smartBookmarkCollectionFingerprint(bookmarks) {
  return createHash("sha256")
    .update(bookmarks.map((bookmark) => `${bookmark.key}:${bookmark.fingerprint}`).sort().join("|"))
    .digest("hex");
}

async function readSmartBookmarkCheckpoint(checkpointPath, collectionFingerprint, bookmarksByKey) {
  try {
    const checkpoint = JSON.parse(await readFile(checkpointPath, "utf8"));
    if (checkpoint?.schemaVersion !== SMART_BOOKMARK_SCHEMA_VERSION
      || checkpoint?.collectionFingerprint !== collectionFingerprint
      || !Array.isArray(checkpoint?.assignments)) return [];
    return checkpoint.assignments.map((candidate) => {
      const bookmark = bookmarksByKey.get(candidate?.key);
      return bookmark ? normalizeAssignment(candidate, bookmark) : null;
    }).filter(Boolean);
  } catch {
    return [];
  }
}

async function removeSmartBookmarkCheckpoint(checkpointPath) {
  await unlink(checkpointPath).catch(() => {});
}

export function createSmartBookmarkService({
  fetchImpl = fetch,
  notify = () => {},
  readSourceHistory = async () => [],
  resolveDeepSeekProvider,
  storePath,
}) {
  const readSnapshot = async () => {
    try {
      const snapshot = JSON.parse(await readFile(storePath, "utf8"));
      return snapshot?.schemaVersion === SMART_BOOKMARK_SCHEMA_VERSION ? snapshot : null;
    } catch {
      return null;
    }
  };

  const emit = (progress) => notify({ at: Date.now(), ...progress });

  const sync = async ({ bookmarks = [], forceFull = false, history = [] } = {}) => {
    const safeBookmarks = (Array.isArray(bookmarks) ? bookmarks : []).slice(0, 5_000);
    emit({ completed: 0, stage: "preparing", total: safeBookmarks.length });
    const sanitized = safeBookmarks.map(sanitizeSmartBookmark).filter(Boolean);
    const previousSnapshot = await readSnapshot();
    const checkpointPath = `${storePath}.progress`;
    const bookmarksByKey = new Map(sanitized.map((bookmark) => [bookmark.key, bookmark]));
    const collectionFingerprint = smartBookmarkCollectionFingerprint(sanitized);
    const resumedAssignments = await readSmartBookmarkCheckpoint(checkpointPath, collectionFingerprint, bookmarksByKey);
    const resumedByKey = new Map(resumedAssignments.map((assignment) => [assignment.key, assignment]));
    const previousAssignments = new Map((previousSnapshot?.assignments || []).map((item) => [item.key, item]));
    const changed = sanitized.filter((bookmark) => {
      if (resumedByKey.get(bookmark.key)?.fingerprint === bookmark.fingerprint) return false;
      return forceFull || previousAssignments.get(bookmark.key)?.fingerprint !== bookmark.fingerprint;
    });
    if (!sanitized.length || !changed.length) {
      const sourceHistory = await readSourceHistory(safeBookmarks).catch(() => []);
      const snapshot = buildSmartBookmarkSnapshot({
        assignments: resumedAssignments,
        bookmarks: safeBookmarks,
        forceFull: forceFull || !previousSnapshot,
        history,
        previousSnapshot,
        sourceHistory,
      });
      await writeSnapshotAtomic(storePath, snapshot);
      await removeSmartBookmarkCheckpoint(checkpointPath);
      emit({ completed: sanitized.length, stage: "complete", total: sanitized.length });
      return { snapshot, status: "success" };
    }

    const provider = await resolveDeepSeekProvider?.();
    if (!provider?.baseUrl || !provider.apiKey || !provider.model) {
      return { message: "请先在“大模型护航”中绑定 DeepSeek API。", snapshot: previousSnapshot, status: "missing-provider" };
    }

    const clusters = buildSmartBookmarkClusters(changed);
    emit({ completed: 0, itemTotal: changed.length, stage: "classifying", total: clusters.length });
    const deadlineAt = Date.now() + SMART_BOOKMARK_TOTAL_TIMEOUT_MS;
    const workingAssignments = new Map(resumedAssignments.map((assignment) => [assignment.key, assignment]));
    let checkpointWrite = Promise.resolve();
    const persistCheckpoint = () => {
      const checkpoint = {
        assignments: [...workingAssignments.values()],
        collectionFingerprint,
        schemaVersion: SMART_BOOKMARK_SCHEMA_VERSION,
        updatedAt: Date.now(),
      };
      checkpointWrite = checkpointWrite.then(() => writeSnapshotAtomic(checkpointPath, checkpoint));
      return checkpointWrite;
    };
    let completedClusters = 0;
    let completedBookmarks = resumedAssignments.length;
    try {
      const batches = [];
      for (let index = 0; index < clusters.length; index += SMART_BOOKMARK_BATCH_SIZE) {
        batches.push(clusters.slice(index, index + SMART_BOOKMARK_BATCH_SIZE));
      }
      await mapWithConcurrency(batches, 2, async (batch) => {
        const representatives = batch.map((cluster) => cluster.representative);
        const clusterAssignments = await classifyBatchWithRetry(provider, representatives, fetchImpl, deadlineAt);
        const assignmentByCluster = new Map(clusterAssignments.map((assignment) => [assignment.key, assignment]));
        for (const cluster of batch) {
          const assignment = assignmentByCluster.get(cluster.id);
          if (!assignment) throw new SmartBookmarkModelOutputError("DeepSeek 遗漏了用途簇分类。");
          for (const bookmark of cluster.members) {
            workingAssignments.set(bookmark.key, {
              confidence: assignment.confidence,
              fingerprint: bookmark.fingerprint,
              functionId: assignment.functionId,
              industryId: assignment.industryId,
              key: bookmark.key,
            });
          }
        }
        completedClusters += batch.length;
        completedBookmarks += batch.reduce((sum, cluster) => sum + cluster.members.length, 0);
        await persistCheckpoint();
        emit({
          completed: completedClusters,
          itemCompleted: completedBookmarks,
          itemTotal: changed.length,
          stage: "classifying",
          total: clusters.length,
        });
      });
      await checkpointWrite;
      const assignments = [...workingAssignments.values()];
      const sourceHistory = await readSourceHistory(safeBookmarks).catch(() => []);
      const snapshot = buildSmartBookmarkSnapshot({
        assignments,
        bookmarks: safeBookmarks,
        forceFull: forceFull || !previousSnapshot,
        history,
        previousSnapshot,
        sourceHistory,
      });
      await writeSnapshotAtomic(storePath, snapshot);
      await removeSmartBookmarkCheckpoint(checkpointPath);
      emit({ completed: clusters.length, stage: "complete", total: clusters.length });

      const refinementCandidates = changed
        .filter((bookmark) => (workingAssignments.get(bookmark.key)?.confidence || 0) < 0.55)
        .slice(0, SMART_BOOKMARK_REFINEMENT_LIMIT);
      if (refinementCandidates.length) {
        void (async () => {
          try {
            emit({ completed: 0, stage: "refining", total: refinementCandidates.length });
            const refined = await classifyBatchWithRetry(
              provider,
              refinementCandidates,
              fetchImpl,
              Date.now() + Math.min(45_000, SMART_BOOKMARK_TOTAL_TIMEOUT_MS),
            );
            const refinedAssignments = new Map(assignments.map((assignment) => [assignment.key, assignment]));
            for (const assignment of refined) refinedAssignments.set(assignment.key, assignment);
            const refinedSnapshot = buildSmartBookmarkSnapshot({
              assignments: [...refinedAssignments.values()],
              bookmarks: safeBookmarks,
              forceFull: false,
              history,
              previousSnapshot: snapshot,
              sourceHistory,
            });
            await writeSnapshotAtomic(storePath, refinedSnapshot);
            emit({ completed: refinementCandidates.length, snapshot: refinedSnapshot, stage: "refined", total: refinementCandidates.length });
          } catch {
            // The first successful snapshot stays visible; optional refinement never blocks it.
          }
        })();
      }
      return { snapshot, status: "success" };
    } catch (error) {
      await checkpointWrite.catch(() => {});
      emit({ message: error.message, stage: "error" });
      const saved = workingAssignments.size ? `已保存 ${workingAssignments.size} 项进度。` : "";
      return {
        message: `${error.message}${saved ? ` ${saved}` : ""}`,
        snapshot: previousSnapshot,
        status: previousSnapshot ? "stale" : "error",
      };
    }
  };

  return { readSnapshot, sync };
}

export function chooseDeepSeekTextModel(models, providerName = "") {
  return sortFastModels(models || [], providerName).find((model) =>
    /deepseek/i.test(model) && !/(reasoner|reasoning|thinking|(^|[/_.-])r1($|[/_.-]))/i.test(model)
  ) || "";
}
