import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import {
  ArrowBendDownLeft,
  ArrowLeft,
  ArrowRight,
  ArrowSquareOut,
  ArrowsOut,
  ArrowsClockwise,
  ArrowUUpLeft,
  BellSimple,
  BookmarkSimple,
  Brain,
  Browsers,
  Camera,
  CaretDown,
  CaretLeft,
  CaretUp,
  CaretRight,
  Check,
  CheckCircle,
  CheckSquare,
  CirclesFour,
  ClockCounterClockwise,
  Compass,
  CopySimple,
  DownloadSimple,
  DotsThreeVertical,
  EyeSlash,
  FilePdf,
  Flask,
  FolderSimple,
  FolderOpen,
  GearSix,
  GlobeHemisphereWest,
  Key,
  Leaf,
  LinkSimple,
  ListBullets,
  LockKey,
  MagnifyingGlass,
  Minus,
  MoonStars,
  NewspaperClipping,
  Paperclip,
  Pause,
  Play,
  PencilSimple,
  Plus,
  PushPin,
  PuzzlePiece,
  Rocket,
  Selection,
  ShareNetwork,
  ShieldCheck,
  Sparkle,
  Square,
  SquaresFour,
  UploadSimple,
  UserCircle,
  Trash,
  X,
} from "@phosphor-icons/react";
import { BorderBeam } from "border-beam";
import { ArrowLeftIcon } from "./components/remocn/icon-arrow-left";
import { ArrowRightIcon } from "./components/remocn/icon-arrow-right";
import { BookmarkIcon } from "./components/remocn/icon-bookmark";
import { DownloadIcon } from "./components/remocn/icon-download";
import { FileTextIcon } from "./components/remocn/icon-file-text";
import { MoreHorizontalIcon } from "./components/remocn/icon-more-horizontal";
import { MonitorIcon } from "./components/remocn/icon-monitor";
import { PlusIcon } from "./components/remocn/icon-plus";
import { RefreshCwIcon } from "./components/remocn/icon-refresh-cw";
import { SparklesIcon } from "./components/remocn/icon-sparkles";
import { SoftBlurIn } from "./components/remocn/soft-blur-in";
import { NewTabParticleBackground } from "./components/NewTabParticleBackground";
import brizoLogoUrl from "../logo.svg";
import brizoWordLogoUrl from "../logo word.svg";
import logoPicUrl from "../logo pic.svg";
import modelGuardIconUrl from "../logo.svg";
import errorTabIconUrl from "./anchor.svg";
import newTabIconUrl from "./compass-alt.svg";
import downloadIconUrl from "./icons/download.svg";
import refreshIconUrl from "./icons/refresh.svg";
import {
  getDefaultBookmarkFaviconUrl,
  normalizeImportedBookmark,
  normalizeImportedBookmarkFolder,
} from "../shared/bookmark-folders.mjs";
import { shouldUseLightForeground } from "../shared/page-color.mjs";
import {
  canonicalizeUrl,
  createSearchShareUrl,
  isZhihuSource,
  languageForInput,
  matchesRequestedLanguage,
  queryFromSearchShareUrl,
} from "../shared/search-text.mjs";
import { BriefPage, createBriefPreviewEdition } from "./BriefPage.jsx";
import { BookmarkSemanticIcon } from "./BookmarkSemanticIcon.jsx";

const NEW_TAB_CHROME_COLOR = "rgb(252, 250, 250)";
const BOOKMARK_FOLDER_HOVER_DELAY_MS = 45;
const BOOKMARK_SIDEBAR_EXPAND_MS = 140;
const BOOKMARK_CASCADE_EXIT_DELAY_MS = 650;
const BOOKMARK_FLYOUT_ROW_HEIGHT = 35;
const BOOKMARK_FLYOUT_WIDTH = 180;
const BOOKMARK_FLYOUT_VIEWPORT_INSET = 8;

const BROWSER_ERROR_COPY = {
  401: ["需要授权", "请登录或取得授权后再访问。", "Sign in or request access to view this page."],
  403: ["禁止访问", "此网页不允许当前访问。", "This page does not allow the current access."],
  404: ["页面不存在", "找不到你要访问的网页。", "The requested page could not be found."],
  408: ["请求超时", "网页响应时间过长，请稍后重试。", "The page took too long to respond."],
  429: ["请求过多", "访问过于频繁，请稍后重试。", "Too many requests. Please try again later."],
  451: ["访问受限", "此网页因地区或法律原因不可用。", "This page is unavailable for legal or regional reasons."],
  500: ["网站出错", "网站暂时无法处理请求。", "The website could not process the request."],
  502: ["网关错误", "网站服务暂时无法连接。", "The website service is temporarily unreachable."],
  503: ["服务不可用", "网站暂时无法提供服务。", "The website is temporarily unavailable."],
  504: ["网关超时", "网站响应时间过长，请稍后重试。", "The website took too long to respond."],
  TIMEOUT: ["连接超时", "网页响应时间过长，请稍后重试。", "The page took too long to respond."],
  DNS: ["找不到网站", "无法解析这个网站的地址。", "The website address could not be resolved."],
  OFFLINE: ["网络不可用", "请检查网络连接后重试。", "Check your internet connection and try again."],
  CONNECTION: ["无法连接", "网站拒绝或未能建立连接。", "The website refused or could not establish a connection."],
  BLOCKED: ["访问被阻止", "此网页不允许当前访问。", "Access to this page was blocked."],
  ERROR: ["无法读取", "此网页当前无法读取。", "This page cannot be read right now."],
};

function getBrowserErrorCopy(error) {
  const [rawCode = "ERROR"] = String(error || "ERROR").split("·").map((value) => value.trim());
  const code = rawCode || "ERROR";
  const copy = BROWSER_ERROR_COPY[code]
    || (Number(code) >= 500
      ? ["网站出错", "网站暂时无法处理请求。", "The website could not process the request."]
      : ["无法读取", "此网页当前无法读取。", "This page cannot be read right now."]);
  return { code, reason: copy[0], chinese: copy[1], english: copy[2] };
}

const articles = [
  {
    id: 1,
    favicon: "n",
    title: "Neural networks find hidden patterns in protein structures",
    shortTitle: "Neural networks find hidden patterns in protein structures",
    domain: "nature.com",
    url: "https://www.nature.com/",
    unread: true,
  },
  {
    id: 2,
    favicon: "S",
    title: "AI model predicts protein structures with experimental accuracy",
    shortTitle: "AI model predicts protein structures with experimental accuracy",
    domain: "science.org",
    url: "https://www.science.org/",
  },
  {
    id: 3,
    favicon: "●",
    title: "AlphaFold 3 technical report",
    shortTitle: "AlphaFold 3 technical report",
    domain: "deepmind.google",
    url: "https://deepmind.google/technologies/alphafold/",
  },
  {
    id: 4,
    favicon: "R",
    title: "Protein structure prediction in the post-AlphaFold era",
    shortTitle: "Protein structure prediction in the post-AlphaFold era",
    domain: "nature reviews | genetics",
    url: "https://www.nature.com/nrg/",
  },
  {
    id: 5,
    favicon: "C",
    title: "High-accuracy structure prediction of biomolecular complexes",
    shortTitle: "High-accuracy structure prediction of biomolecular complexes",
    domain: "cell.com",
    url: "https://www.cell.com/structure/home",
    unread: true,
  },
  {
    id: 6,
    favicon: "b",
    title: "Esm3: Scale meets biology in protein language models",
    shortTitle: "Esm3: Scale meets biology in protein language models",
    domain: "biorxiv.org",
    url: "https://www.biorxiv.org/",
  },
  {
    id: 7,
    favicon: "n",
    title: "AI for protein design: opportunities and challenges",
    shortTitle: "AI for protein design: opportunities and challenges",
    domain: "nature.com",
    url: "https://www.nature.com/subjects/protein-design",
  },
];

const starterBookmarks = articles.map((article, index) => ({
  createdAt: 0,
  folder: index < 4
    ? "Research / Protein structure / Papers"
    : index < 6
      ? "Research / Protein structure / Tools"
      : "Research / Reading list",
  source: "brizo",
  sourceOrder: index,
  title: article.title,
  updatedAt: 0,
  url: article.url,
}));

function formatAddressForDisplay(address) {
  try {
    const url = new URL(address);
    return url.host;
  } catch {
    return address;
  }
}

const COMMON_WEBSITES = [
  ["google.com", "Google"], ["baidu.com", "百度"], ["bilibili.com", "哔哩哔哩"],
  ["github.com", "GitHub"], ["youtube.com", "YouTube"], ["wikipedia.org", "Wikipedia"],
  ["zhihu.com", "知乎"], ["weibo.com", "微博"], ["douban.com", "豆瓣"],
  ["taobao.com", "淘宝"], ["jd.com", "京东"], ["xiaohongshu.com", "小红书"],
].map(([domain, title]) => ({ title, url: `https://${domain}` }));

function addressSuggestionsFor(rawInput, bookmarks, tabs) {
  const input = rawInput.trim().toLocaleLowerCase();
  if (!input || /\s/.test(input)) return [];
  const comparable = input.replace(/^https?:\/\//, "").replace(/^www\./, "");
  const candidates = [
    ...bookmarks.map(({ title, url }) => ({ title, url })),
    ...tabs.filter((tab) => !tab.isNewTab && tab.url).map(({ title, url }) => ({ title, url })),
    ...COMMON_WEBSITES,
  ];
  if (/^[\w-]+(?:\.[\w-]+)+(?:[/:?#].*)?$/i.test(comparable)) {
    const url = /^https?:\/\//i.test(rawInput) ? rawInput.trim() : `https://${rawInput.trim()}`;
    let hostname = comparable.split(/[/:?#]/)[0];
    const known = candidates.find((candidate) => {
      try { return new URL(candidate.url).hostname.replace(/^www\./i, "") === hostname; } catch { return false; }
    });
    return [{ title: known?.title || hostname, url }];
  }
  const seen = new Set();
  return candidates.filter((candidate) => {
    try {
      const domain = new URL(candidate.url).hostname.replace(/^www\./i, "");
      const matches = domain.startsWith(comparable) || candidate.title.toLocaleLowerCase().startsWith(input);
      if (!matches || seen.has(domain)) return false;
      seen.add(domain);
      return true;
    } catch { return false; }
  }).slice(0, 5);
}

function looksLikeWebsiteInput(value) {
  const input = String(value || "").trim();
  return /^https?:\/\//i.test(input)
    || /^[\w-]+(?:\.[\w-]+)+(?:[/:?#]|$)/i.test(input);
}

function looksLikePdfInput(value) {
  const input = String(value || "").trim();
  if (/^data:application\/pdf(?:;|,)/i.test(input)) return true;
  try {
    return decodeURIComponent(new URL(input).pathname).toLowerCase().endsWith(".pdf");
  } catch {
    return input.toLowerCase().split(/[?#]/, 1)[0].endsWith(".pdf");
  }
}

const browserSuggestionCache = new Map();
const BROWSER_SUGGESTION_CACHE_TTL = 5 * 60 * 1000;

function requestJsonpSuggestions({ callbackParam, endpoint, params, scriptCharset }) {
  return new Promise((resolve) => {
    const callbackName = `__brizoSuggest${Date.now()}${Math.random().toString(36).slice(2)}`;
    const script = document.createElement("script");
    const finish = (suggestions) => {
      window.clearTimeout(timeout);
      script.remove();
      delete window[callbackName];
      resolve(Array.isArray(suggestions) ? suggestions : []);
    };
    const timeout = window.setTimeout(() => finish([]), 3500);
    window[callbackName] = (payload) => finish(payload?.[1] || payload?.s);
    script.onerror = () => finish([]);
    if (scriptCharset) script.charset = scriptCharset;
    const query = new URLSearchParams({ ...params, [callbackParam]: callbackName });
    script.src = `${endpoint}?${query}`;
    document.head.appendChild(script);
  });
}

async function requestBrowserSuggestions(input) {
  const inputLanguage = languageForInput(input);
  const cacheKey = `${inputLanguage}:${String(input || "").trim().toLocaleLowerCase()}`;
  const cached = browserSuggestionCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.suggestions;
  let suggestions;
  if (inputLanguage === "zh") {
    suggestions = await requestJsonpSuggestions({
      callbackParam: "cb",
      endpoint: "https://suggestion.baidu.com/su",
      params: { wd: input },
      scriptCharset: "gbk",
    });
  } else {
    suggestions = await requestJsonpSuggestions({
      callbackParam: "JsonCallback",
      endpoint: "https://api.bing.com/osjson.aspx",
      params: {
        JsonType: "callback",
        language: inputLanguage === "ja" ? "ja-JP" : inputLanguage === "ko" ? "ko-KR" : "en-US",
        query: input,
      },
    });
  }
  suggestions = suggestions.filter((item) => matchesRequestedLanguage(item, inputLanguage));
  browserSuggestionCache.set(cacheKey, {
    suggestions,
    expiresAt: Date.now() + BROWSER_SUGGESTION_CACHE_TTL,
  });
  if (browserSuggestionCache.size > 200) {
    browserSuggestionCache.delete(browserSuggestionCache.keys().next().value);
  }
  return suggestions;
}

function newTabSuggestionsFor(rawInput, bookmarks, tabs, history, onlineSuggestions) {
  const input = rawInput.trim();
  if (!input) return [];
  const websiteMatches = addressSuggestionsFor(input, bookmarks, tabs);
  const looksLikeWebsite = !/\s/.test(input) && (
    /[./]/.test(input)
    || websiteMatches.some((item) => item.title.toLocaleLowerCase().startsWith(input.toLocaleLowerCase()))
  );
  if (looksLikeWebsite && websiteMatches.length) {
    const urlSuggestions = websiteMatches.slice(0, 3).map((item) => ({ ...item, type: "url", value: item.url }));
    const fallbackSuggestions = [
      { title: "搜索网站", type: "query", value: `${input} 官网` },
      { title: "了解更多", type: "query", value: `${input}是什么？` },
    ];
    return [...urlSuggestions, ...fallbackSuggestions].slice(0, 3);
  }
  if (input.length < 2) return [];
  const historyMatches = history
    .filter((item) => item.query.toLocaleLowerCase().includes(input.toLocaleLowerCase()))
    .sort((left, right) => {
      const leftPrefix = left.query.toLocaleLowerCase().startsWith(input.toLocaleLowerCase()) ? 1 : 0;
      const rightPrefix = right.query.toLocaleLowerCase().startsWith(input.toLocaleLowerCase()) ? 1 : 0;
      return rightPrefix - leftPrefix || right.count - left.count || right.updatedAt - left.updatedAt;
    })
    .map((item) => ({ title: "你的记录", type: "query", value: item.query }));
  const onlineMatches = onlineSuggestions.map((value) => ({ title: "热门联想", type: "query", value }));
  const seen = new Set();
  return [...historyMatches, ...onlineMatches].filter((item) => {
    const key = item.value.trim().toLocaleLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 3).map((item, index) => ({ ...item, title: index === 0 ? "最可能" : item.title }));
}

function createSearchHistorySnapshot(result) {
  if (!result || result.status === "navigated") return null;
  return {
    message: String(result.message || "").slice(0, 50_000),
    mode: typeof result.mode === "string" ? result.mode : "",
    relatedQuestions: Array.isArray(result.relatedQuestions)
      ? result.relatedQuestions.filter((item) => typeof item === "string").slice(0, 5)
      : [],
    cards: Array.isArray(result.cards)
      ? result.cards.slice(0, 2).map((group) => ({
        kind: String(group?.kind || ""),
        items: Array.isArray(group?.items) ? group.items.slice(0, 8).map((item) => ({
          ...item,
          title: String(item?.title || "").slice(0, 500),
          url: String(item?.url || "").slice(0, 4_000),
          imageUrl: String(item?.imageUrl || item?.thumbnailUrl || "").slice(0, 4_000),
        })) : [],
      }))
      : [],
    visualEntity: result.visualEntity && typeof result.visualEntity === "object"
      ? {
        name: String(result.visualEntity.name || "").slice(0, 100),
        kind: String(result.visualEntity.kind || "none").slice(0, 40),
        confidence: Math.min(1, Math.max(0, Number(result.visualEntity.confidence) || 0)),
      }
      : null,
    entityImages: Array.isArray(result.entityImages)
      ? result.entityImages.slice(0, 3).map((item) => ({
        authority: String(item?.authority || "").slice(0, 40),
        domain: String(item?.domain || "").slice(0, 300),
        imageUrl: String(item?.imageUrl || item?.thumbnailUrl || "").slice(0, 4_000),
        source: String(item?.source || "").slice(0, 300),
        title: String(item?.title || "").slice(0, 500),
        url: String(item?.url || "").slice(0, 4_000),
      }))
      : [],
    depth: ["fast", "balanced", "deep"].includes(result.depth) ? result.depth : "",
    degraded: Boolean(result.degraded),
    grounded: result.grounded !== false,
    notices: Array.isArray(result.notices) ? result.notices.slice(0, 4).map((item) => String(item).slice(0, 500)) : [],
    sources: Array.isArray(result.sources)
      ? result.sources.slice(0, 12).map((source) => ({
        domain: String(source?.domain || "").slice(0, 300),
        imageUrl: String(source?.imageUrl || "").slice(0, 4_000),
        rank: Number.isInteger(source?.rank) ? source.rank : null,
        snippet: String(source?.snippet || "").slice(0, 2_000),
        title: String(source?.title || "").slice(0, 500),
        url: String(source?.url || "").slice(0, 4_000),
      }))
      : [],
    status: result.status === "success" || result.status === "preview" ? result.status : "error",
  };
}

function persistSearchHistory(items) {
  const next = items.slice(0, 100);
  try {
    localStorage.setItem("bean:search-history", JSON.stringify(next));
    return next;
  } catch {
    const compact = next.slice(0, 50);
    try {
      localStorage.setItem("bean:search-history", JSON.stringify(compact));
    } catch {
      // Keep the current session usable when the browser storage quota is exhausted.
    }
    return compact;
  }
}

function formatHistoryTime(timestamp) {
  if (!timestamp) return "";
  try {
    const d = new Date(timestamp);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    if (isToday) {
      return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    }
    return `${d.getMonth() + 1}/${d.getDate()}`;
  } catch {
    return "";
  }
}

function Logo() {
  return (
    <div className="brand" aria-label="Brizo home">
      <img className="brizo-wordmark" src={brizoWordLogoUrl} alt="Brizo" />
    </div>
  );
}

function CitedAnswerText({ onOpenSource, sources, streaming = false, text }) {
  const parts = String(text || "").split(/(\[\d+\]|\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\(https?:\/\/[^)]+\))/g).filter(Boolean);
  return parts.map((part, index) => {
    const citation = part.match(/^\[(\d+)\]$/);
    if (citation) {
      const source = sources[Number(citation[1]) - 1];
      return source ? (
        <button
          className={`new-tab-inline-citation${streaming ? " is-streaming" : ""}`}
          data-context-url={source.url}
          key={`${part}-${index}`}
          type="button"
          aria-label={`打开来源 ${citation[1]}：${source.title || source.domain}`}
          onClick={() => onOpenSource(source.url)}
        >
          {citation[1]}
        </button>
      ) : <span key={`${part}-${index}`}>{part}</span>;
    }
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={`${part}-${index}`}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return <code key={`${part}-${index}`}>{part.slice(1, -1)}</code>;
    }
    const link = part.match(/^\[([^\]]+)\]\((https?:\/\/[^)]+)\)$/);
    if (link) {
      return (
        <a
          href={link[2]}
          key={`${part}-${index}`}
          onClick={(event) => {
            event.preventDefault();
            onOpenSource(link[2]);
          }}
        >
          {link[1]}
        </a>
      );
    }
    if (streaming) return <span key={`${index}-stream`}>{part}</span>;
    return <span key={`${part}-${index}`}>{part}</span>;
  });
}

function SearchAnswer({ message, onOpenSource, sources, streaming = false }) {
  const blocks = useMemo(() => {
    const lines = String(message || "").split("\n")
      .map((line) => line.trim())
      .filter((line) => line && !/^#(?!#)\s+/.test(line));
    const parsed = [];
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      const next = lines[index + 1] || "";
      if (line.includes("|") && /^\|?\s*:?-{3,}/.test(next)) {
        const rows = [];
        const splitRow = (value) => value.replace(/^\||\|$/g, "").split("|").map((cell) => cell.trim());
        const headers = splitRow(line);
        index += 2;
        while (index < lines.length && lines[index].includes("|")) {
          rows.push(splitRow(lines[index]));
          index += 1;
        }
        index -= 1;
        parsed.push({ type: "table", headers, rows });
      } else {
        parsed.push({ type: "line", value: line });
      }
    }
    return parsed;
  },
    [message],
  );
  return blocks.map((block, index) => {
    if (block.type === "table") {
      return (
        <div className="new-tab-answer-table-wrap" key={`table-${index}`}>
          <table>
            <thead><tr>{block.headers.map((cell, cellIndex) => <th key={cellIndex}><CitedAnswerText text={cell} sources={sources} onOpenSource={onOpenSource} streaming={streaming} /></th>)}</tr></thead>
            <tbody>{block.rows.map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, cellIndex) => <td key={cellIndex}><CitedAnswerText text={cell} sources={sources} onOpenSource={onOpenSource} streaming={streaming} /></td>)}</tr>)}</tbody>
          </table>
        </div>
      );
    }
    const line = block.value;
    if (/^-{3,}$/.test(line)) {
      return <hr className="new-tab-answer-divider" key={`divider-${index}`} aria-hidden="true" />;
    }
    const heading = line.match(/^#{2,4}\s+(.+)$/);
    if (heading) {
      return <h3 key={`heading-${index}`}><CitedAnswerText text={heading[1]} sources={sources} onOpenSource={onOpenSource} streaming={streaming} /></h3>;
    }
    const bullet = line.match(/^[-*•]\s+(.+)$/);
    if (bullet) {
      return <div className="new-tab-answer-bullet" key={`bullet-${index}`}><span>•</span><p><CitedAnswerText text={bullet[1]} sources={sources} onOpenSource={onOpenSource} streaming={streaming} /></p></div>;
    }
    const ordered = line.match(/^(\d+)[.)、]\s+(.+)$/);
    if (ordered) {
      return <div className="new-tab-answer-bullet is-ordered" key={`ordered-${index}`}><span>{ordered[1]}.</span><p><CitedAnswerText text={ordered[2]} sources={sources} onOpenSource={onOpenSource} streaming={streaming} /></p></div>;
    }
    return <p key={`paragraph-${index}`}><CitedAnswerText text={line} sources={sources} onOpenSource={onOpenSource} streaming={streaming} /></p>;
  });
}

function SearchVerticalCards({ cards, onOpenSource }) {
  if (!Array.isArray(cards) || !cards.length) return null;
  return cards.map((group) => (
    <section className={`new-tab-cards is-${group.kind}`} key={group.kind} aria-label="专项搜索结果">
      <h3>{{ news: "最新动态", images: "图片", videos: "视频", scholar: "研究论文", places: "地点" }[group.kind] || "相关结果"}</h3>
      <div>
        {(group.items || []).slice(0, 8).map((item, index) => {
          const canOpen = Boolean(item.url);
          const Component = canOpen ? "button" : "article";
          return (
            <Component
              key={`${item.url || item.title}-${index}`}
              {...(canOpen ? { "data-context-url": item.url, type: "button", onClick: () => onOpenSource(item.url) } : {})}
            >
              {(item.imageUrl || item.thumbnailUrl) && <img src={item.thumbnailUrl || item.imageUrl} alt="" />}
              <span>
                <strong>{item.title || item.address || "相关结果"}</strong>
                <small>{item.source || item.domain || item.publicationInfo || item.address || item.category || ""}</small>
                {(item.dateLabel || item.duration || item.year || item.rating) && (
                  <em>{item.dateLabel || item.duration || item.year || `${item.rating} 分`}</em>
                )}
              </span>
            </Component>
          );
        })}
      </div>
    </section>
  ));
}

function SearchEntityImages({ entity, images, onOpenSource }) {
  const items = Array.isArray(images) ? images.slice(0, 3) : [];
  const [failedImages, setFailedImages] = useState(() => new Set());
  useEffect(() => setFailedImages(new Set()), [images]);
  const visibleItems = items.filter((_, index) => !failedImages.has(index));
  if (!visibleItems.length) return null;
  const isPerson = entity?.kind === "person";
  return (
    <aside className="new-tab-entity-images" aria-label={`${entity?.name || "实体"}${isPerson ? "人物照片" : "示意图片"}`}>
      <h3>{isPerson ? "人物照片" : "示意图片"}</h3>
      <div>
        {visibleItems.map((item, index) => (
          <button
            data-context-url={item.url}
            key={`${item.imageUrl}-${index}`}
            type="button"
            onClick={() => onOpenSource(item.url)}
          >
            <img
              src={item.imageUrl || item.thumbnailUrl}
              alt={item.title || entity?.name || (isPerson ? "人物照片" : "实体示意图片")}
              onError={() => setFailedImages((current) => new Set([...current, index]))}
            />
            <span>
              <strong>{item.title || entity?.name}</strong>
              <small>{item.authority === "official" ? "官方来源" : "权威来源"} · {item.source || item.domain}</small>
            </span>
          </button>
        ))}
      </div>
    </aside>
  );
}

function SourceFavicon({ className = "", source }) {
  const [failed, setFailed] = useState(false);
  const faviconUrl = source.imageUrl || getDefaultBookmarkFaviconUrl(source.url);
  const fallback = (source.domain || source.title || "网").slice(0, 1).toUpperCase();
  return (
    <span className={className}>
      {faviconUrl && !failed
        ? <img src={faviconUrl} alt="" onError={() => setFailed(true)} />
        : <span>{fallback}</span>}
    </span>
  );
}

function SearchSources({ expanded, id, onOpenSource, onToggle, sources }) {
  const rankedSources = useMemo(() => sources.map((source, citationIndex) => ({
    ...source,
    citationIndex: citationIndex + 1,
    displayRank: Number.isInteger(source?.rank) ? source.rank : citationIndex,
  })).sort((left, right) => left.displayRank - right.displayRank), [sources]);
  const visibleSources = expanded ? rankedSources : rankedSources.slice(0, 3);
  if (!rankedSources.length) return null;
  return (
    <section className={`new-tab-sources${expanded ? " is-expanded" : ""}`} aria-label="来源">
      <div className="new-tab-sources-heading">
        <h3>来源</h3>
        <span>按权威性与相关度排序</span>
      </div>
      <div className="new-tab-source-list" id={id}>
        {visibleSources.map((source) => {
          return (
            <button
              data-context-url={source.url}
              key={`${source.url}-${source.citationIndex}`}
              type="button"
              onClick={() => onOpenSource(source.url)}
            >
              <span className="new-tab-source-card-meta">
                <SourceFavicon className="new-tab-source-favicon" source={source} />
                <small>{source.domain || source.url}</small>
                <span className="new-tab-source-index">{source.citationIndex}</span>
              </span>
              <strong>{source.title || source.domain || "网页来源"}</strong>
              {source.snippet && <em>{source.snippet}</em>}
              <LinkSimple size={14} />
            </button>
          );
        })}
      </div>
      <div className="new-tab-source-summary">
        <span className="new-tab-source-stack" aria-hidden="true">
          {rankedSources.slice(0, 5).map((source, index) => (
            <SourceFavicon
              className="new-tab-source-stack-icon"
              key={`${source.url}-stack-${index}`}
              source={source}
            />
          ))}
        </span>
        <span>{rankedSources.length} 个来源</span>
        {rankedSources.length > 3 && (
          <button
            type="button"
            aria-controls={id}
            aria-expanded={expanded}
            onClick={onToggle}
          >
            {expanded ? "收起来源" : `展开其余 ${rankedSources.length - 3} 个`}
            <CaretDown size={13} />
          </button>
        )}
      </div>
    </section>
  );
}

const START_TAB = {
  domain: "brizo",
  id: "brizo-start",
  isNewTab: true,
  isPinned: false,
  useTodayGreeting: true,
  shortTitle: "新标签页",
  title: "新标签页",
  url: "",
};

const INITIAL_TABS = [
  {
    domain: "calendar.google.com",
    id: "pinned-calendar",
    isPinned: true,
    shortTitle: "Google 日历",
    title: "Google 日历",
    url: "https://calendar.google.com",
    iconKey: "calendar",
  },
  {
    domain: "mail.google.com",
    id: "pinned-gmail",
    isPinned: true,
    shortTitle: "Gmail",
    title: "Gmail",
    url: "https://mail.google.com",
    iconKey: "gmail",
  },
  {
    domain: "slack.com",
    id: "pinned-slack",
    isPinned: true,
    shortTitle: "Slack",
    title: "Slack",
    url: "https://slack.com",
    iconKey: "slack",
  },
  {
    domain: "bilibili.com",
    id: "pinned-bilibili",
    isPinned: true,
    shortTitle: "哔哩哔哩",
    title: "哔哩哔哩",
    url: "https://www.bilibili.com",
    iconKey: "bilibili",
  },
  {
    domain: "microsoft.com",
    id: "pinned-edge",
    isPinned: true,
    shortTitle: "Edge",
    title: "Microsoft Edge",
    url: "https://www.microsoft.com/edge",
    iconKey: "edge",
  },
  {
    domain: "wx.qq.com",
    id: "pinned-chat",
    isPinned: true,
    shortTitle: "微信",
    title: "微信网页版",
    url: "https://wx.qq.com",
    iconKey: "chat",
  },
  {
    domain: "brizo",
    id: "pinned-brizo",
    isPinned: true,
    isNewTab: true,
    shortTitle: "Brizo",
    title: "Brizo",
    url: "",
    iconKey: "brizo",
  },
  {
    domain: "gemini.google.com",
    id: "tab-gemini",
    isPinned: false,
    shortTitle: "Google Gemini",
    title: "Google Gemini",
    url: "https://gemini.google.com",
    iconKey: "gemini",
  },
  {
    domain: "taobao.com",
    id: "tab-taobao",
    isPinned: false,
    shortTitle: "淘宝",
    title: "淘宝网",
    url: "https://www.taobao.com",
    iconKey: "taobao",
  },
  {
    domain: "youdao.com",
    id: "tab-youdao",
    isPinned: false,
    shortTitle: "网易有道",
    title: "网易有道",
    url: "https://fanyi.youdao.com",
    iconKey: "youdao",
  },
  {
    domain: "maps.google.com",
    id: "tab-maps",
    isPinned: false,
    shortTitle: "Google 地图",
    title: "Google 地图",
    url: "https://maps.google.com",
    iconKey: "maps",
  },
];

const NEW_TAB_GREETINGS = [
  ["今天有什么冒险？", "有什么冒险在等着你？"],
  ["今天要探索些什么？", "想探索些什么？"],
  ["今天有什么新奇的问题？", "有什么新奇的问题？"],
  ["今天我能帮助你什么？", "我能帮助你什么？"],
  ["今天心情如何？", "心情如何？"],
  ["今天想从哪里出发？", "想从哪里出发？"],
  ["今天有什么值得发现？", "有什么值得发现？"],
  ["今天想了解什么？", "想了解什么？"],
  ["今天准备去往哪里？", "准备去往哪里？"],
  ["今天想寻找什么答案？", "想寻找什么答案？"],
  ["今天有什么好奇心要满足？", "有什么好奇心要满足？"],
  ["今天想打开哪扇门？", "想打开哪扇门？"],
  ["今天要追寻什么灵感？", "要追寻什么灵感？"],
  ["今天想研究什么？", "想研究什么？"],
  ["今天有什么计划？", "有什么计划？"],
  ["今天想看见怎样的世界？", "想看见怎样的世界？"],
  ["今天有什么难题要解决？", "有什么难题要解决？"],
  ["今天想读点什么？", "想读点什么？"],
  ["今天要找些什么？", "要找些什么？"],
  ["今天想去一个新地方吗？", "想去一个新地方吗？"],
  ["今天有什么念头值得展开？", "有什么念头值得展开？"],
  ["今天想发现什么惊喜？", "想发现什么惊喜？"],
  ["今天从哪个问题开始？", "从哪个问题开始？"],
  ["今天想让什么变得更清楚？", "想让什么变得更清楚？"],
  ["今天有什么故事想听？", "有什么故事想听？"],
  ["今天想认识什么新事物？", "想认识什么新事物？"],
  ["今天要把目光投向哪里？", "要把目光投向哪里？"],
  ["今天想和我聊些什么？", "想和我聊些什么？"],
  ["今天有什么想法要实现？", "有什么想法要实现？"],
  ["今天想先做哪件事？", "想先做哪件事？"],
];

const DOWNLOAD_GROUPS = [
  ["today", "今日"],
  ["yesterday", "昨日"],
  ["week", "本周"],
  ["month", "本月"],
  ["history", "历史"],
];

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function groupDownloads(downloads) {
  const now = new Date();
  const today = startOfDay(now);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const week = new Date(today);
  week.setDate(week.getDate() - ((week.getDay() + 6) % 7));
  const month = new Date(now.getFullYear(), now.getMonth(), 1);
  const groups = Object.fromEntries(DOWNLOAD_GROUPS.map(([key]) => [key, []]));

  downloads
    .slice()
    .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))
    .forEach((download) => {
      const createdAt = new Date(download.createdAt);
      const group = createdAt >= today
        ? "today"
        : createdAt >= yesterday
          ? "yesterday"
          : createdAt >= week
            ? "week"
            : createdAt >= month
              ? "month"
              : "history";
      groups[group].push(download);
    });

  return DOWNLOAD_GROUPS.map(([key, label]) => ({
    downloads: groups[key],
    key,
    label,
  })).filter((group) => group.downloads.length);
}

function DownloadPanel({ downloadGroups, onAction, onOpenDirectory }) {
  return (
    <>
      <header className="downloads-popover-header">
        <strong>下载</strong>
        <button
          className="downloads-folder-button"
          type="button"
          aria-label="打开下载目录"
          title="打开下载目录"
          onClick={onOpenDirectory}
        >
          <FolderOpen size={17} />
        </button>
      </header>
      <div className="downloads-list">
        {downloadGroups.length ? downloadGroups.map((group) => (
          <section className="download-group" key={group.key}>
            <h3>{group.label}</h3>
            {group.downloads.map((download) => {
              const isActive = download.state === "downloading" || download.state === "paused";
              const isCompleted = download.state === "completed" && !download.isMissing;
              return (
                <div
                  className={`download-row${download.isMissing ? " is-missing" : ""}`}
                  data-state={download.state}
                  key={download.id}
                >
                  <span className="download-row-icon" aria-hidden="true">
                    <AttachedIcon src={downloadIconUrl} size={16} />
                  </span>
                  <span className="download-row-copy" title={download.filename}>
                    <strong>{download.filename}</strong>
                  </span>
                  <span className="download-row-actions">
                    {isActive && (
                      <button
                        type="button"
                        aria-label={download.state === "paused" ? `继续下载 ${download.filename}` : `暂停下载 ${download.filename}`}
                        title={download.state === "paused" ? "继续" : "暂停"}
                        onClick={() => onAction(download.state === "paused" ? "resume" : "pause", download)}
                      >
                        {download.state === "paused" ? <Play size={15} weight="fill" /> : <Pause size={15} weight="fill" />}
                      </button>
                    )}
                    {isActive && (
                      <button
                        type="button"
                        aria-label={`取消下载 ${download.filename}`}
                        title="关闭"
                        onClick={() => onAction("cancel", download)}
                      >
                        <X size={15} />
                      </button>
                    )}
                    {isCompleted && (
                      <button
                        type="button"
                        aria-label={`打开 ${download.filename}`}
                        title="打开"
                        onClick={() => onAction("open", download)}
                      >
                        <ArrowSquareOut size={15} />
                      </button>
                    )}
                    {(isCompleted || download.isMissing || download.state === "interrupted" || download.state === "cancelled") && (
                      <button
                        type="button"
                        aria-label={`删除 ${download.filename}`}
                        title="删除"
                        onClick={() => onAction("delete", download)}
                      >
                        <Trash size={15} />
                      </button>
                    )}
                  </span>
                </div>
              );
            })}
          </section>
        )) : (
          <p className="downloads-empty">暂无下载文件</p>
        )}
      </div>
    </>
  );
}

function NewTabCommandLight({ active }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!active || !canvas) return undefined;
    const context = canvas.getContext("2d", { alpha: true });
    if (!context) return undefined;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reducedMotion) return undefined;
    const startedAt = performance.now();
    let animationFrame = 0;
    let width = 0;
    let height = 0;
    let pixelRatio = 1;

    const resize = () => {
      const bounds = canvas.getBoundingClientRect();
      width = Math.max(1, bounds.width);
      height = Math.max(1, bounds.height);
      pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
      const nextWidth = Math.round(width * pixelRatio);
      const nextHeight = Math.round(height * pixelRatio);
      if (canvas.width !== nextWidth || canvas.height !== nextHeight) {
        canvas.width = nextWidth;
        canvas.height = nextHeight;
      }
    };

    const draw = (now) => {
      resize();
      const elapsed = Math.max(0, now - startedAt);
      const progress = Math.min(1, elapsed / 850);
      const fade = Math.sin(progress * Math.PI);
      const lightWidth = Math.max(1, width - 2);
      const lightHeight = Math.max(1, height - 2);
      const cornerRadius = Math.min(12, lightHeight / 2);

      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      context.clearRect(0, 0, width, height);

      context.save();
      context.translate(width / 2, height / 2);
      context.globalCompositeOperation = "source-over";
      context.beginPath();
      context.roundRect(-lightWidth / 2, -lightHeight / 2, lightWidth, lightHeight, cornerRadius);
      context.fillStyle = `rgba(231, 213, 171, ${0.104 * fade})`;
      context.shadowBlur = 38;
      context.shadowColor = `rgba(177, 143, 77, ${0.182 * fade})`;
      context.fill();
      context.shadowBlur = 0;
      context.lineWidth = 18;
      context.strokeStyle = `rgba(205, 178, 119, ${0.0715 * fade})`;
      context.stroke();
      context.lineWidth = 1.5;
      context.strokeStyle = `rgba(221, 199, 150, ${0.169 * fade})`;
      context.stroke();
      context.restore();

      context.globalCompositeOperation = "source-over";
      context.shadowBlur = 0;
      if (elapsed < 850) animationFrame = window.requestAnimationFrame(draw);
      else context.clearRect(0, 0, width, height);
    };

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(canvas);
    draw(startedAt);
    return () => {
      resizeObserver.disconnect();
      window.cancelAnimationFrame(animationFrame);
      context.clearRect(0, 0, canvas.width, canvas.height);
    };
  }, [active]);

  return <canvas className={`new-tab-area-light${active ? " is-active" : ""}`} ref={canvasRef} aria-hidden="true" />;
}

const SEARCH_LOADING_DELAYS = Array.from({ length: 9 }, (_, index) => {
  const row = Math.floor(index / 3);
  const column = index % 3;
  return (column + Math.abs(row - 1)) * 90;
});

function formatSearchElapsed(milliseconds) {
  const totalSeconds = Math.max(0, milliseconds) / 1_000;
  if (totalSeconds < 60) return `${totalSeconds.toFixed(1)}s`;
  return `${Math.floor(totalSeconds / 60)}m ${(totalSeconds % 60).toFixed(1)}s`;
}

function SearchLoadingState({ label, startedAt }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 100);
    return () => window.clearInterval(timer);
  }, [startedAt]);

  return (
    <div className="new-tab-search-loading-state">
      <span className="new-tab-search-pixel-grid" aria-hidden="true">
        {SEARCH_LOADING_DELAYS.map((delay, index) => (
          <span key={index} style={{ animationDelay: `${delay}ms` }} />
        ))}
      </span>
      <span className="new-tab-search-loading-text">{label}</span>
      <span className="new-tab-search-loading-time">
        {formatSearchElapsed(now - (startedAt || now))}
      </span>
    </div>
  );
}

function NewTabPage({ active, activeTabId, availableModels, bookmarks, history, initialMode = "ask", initialPrompt, initialUseCommand = "", onNotify, onOpenSource, onRestoreHistory, onSearchComplete, onSubmit, onUseSubmit, prefillPrompt = "", restoredResult = null, tabs, useExecutionSpace = false, useTodayGreeting }) {
  const [greeting] = useState(() => {
    const pair = NEW_TAB_GREETINGS[Math.floor(Math.random() * NEW_TAB_GREETINGS.length)];
    return pair[useTodayGreeting ? 0 : 1];
  });
  const [prompt, setPrompt] = useState(prefillPrompt || initialUseCommand || restoredResult?.query || "");
  const [commandMode, setCommandMode] = useState(initialMode === "use" ? "use" : "ask");
  const [promptFocused, setPromptFocused] = useState(false);
  const [onlineSuggestions, setOnlineSuggestions] = useState([]);
  const [attachments, setAttachments] = useState([]);
  const [contextTab, setContextTab] = useState(null);
  const [tabMenuOpen, setTabMenuOpen] = useState(false);
  const [historyMenuOpen, setHistoryMenuOpen] = useState(false);
  const model = availableModels[0] || "";
  const [searchQuery, setSearchQuery] = useState(restoredResult?.query || "");
  const [searchResult, setSearchResult] = useState(restoredResult?.result || null);
  const [searchState, setSearchState] = useState(restoredResult?.result ? "success" : "idle");
  const [searchStage, setSearchStage] = useState("");
  const [searchStartedAt, setSearchStartedAt] = useState(0);
  const [usePaused, setUsePaused] = useState(false);
  const [useTraceExpanded, setUseTraceExpanded] = useState(true);
  const [useSandboxView, setUseSandboxView] = useState({ embeddedSandbox: false, title: "", url: "", steps: [] });
  const [searchThread, setSearchThread] = useState(() => restoredResult?.result ? [{
    query: restoredResult.query,
    answer: restoredResult.result.message,
    sources: restoredResult.result.sources || [],
  }] : []);
  const [sourcesExpanded, setSourcesExpanded] = useState(false);
  const [resultPdfExporting, setResultPdfExporting] = useState(false);
  const fileInputRef = useRef(null);
  const historyMenuRef = useRef(null);
  const promptInputRef = useRef(null);
  const resultsRef = useRef(null);
  const useSandboxHostRef = useRef(null);
  const useStepsRef = useRef(null);
  const followStream = useRef(true);
  const searchSequence = useRef(0);
  const activeSearchId = useRef("");
  const searchQueryRef = useRef("");
  const tokenBuffer = useRef("");
  const tokenFrame = useRef(0);
  const initialPromptStarted = useRef(false);
  const usePauseRequest = useRef(false);
  const initialUseStarted = useRef(false);
  const availableTabs = tabs
    .filter((tab) => tab.id !== activeTabId && !tab.isNewTab)
    .slice(0, 3);
  const promptSuggestions = useMemo(
    () => commandMode === "ask" && promptFocused && searchState === "idle"
      ? newTabSuggestionsFor(prompt, bookmarks, tabs, history, onlineSuggestions)
      : [],
    [bookmarks, commandMode, history, onlineSuggestions, prompt, promptFocused, searchState, tabs],
  );

  useEffect(() => {
    const query = prompt.trim();
    setOnlineSuggestions([]);
    if (commandMode !== "ask" || !promptFocused || searchState !== "idle" || query.length < 2) return undefined;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      const suggestions = window.beanBrowser?.suggestQueries
        ? await window.beanBrowser.suggestQueries(query)
        : await requestBrowserSuggestions(query);
      if (!cancelled && Array.isArray(suggestions)) setOnlineSuggestions(suggestions);
    }, 450);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [commandMode, prompt, promptFocused, searchState]);

  useEffect(() => {
    if (!historyMenuOpen) return undefined;
    const closeOnOutsidePointer = (event) => {
      if (!historyMenuRef.current?.contains(event.target)) setHistoryMenuOpen(false);
    };
    const closeOnEscape = (event) => {
      if (event.key === "Escape") setHistoryMenuOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer, true);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer, true);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [historyMenuOpen]);

  useEffect(() => {
    if (!window.beanBrowser?.onSearchStream) return undefined;
    const unsubscribe = window.beanBrowser.onSearchStream((event) => {
      if (!event || event.searchId !== activeSearchId.current) return;
      if (event.type === "stage") {
        setSearchStage(event.detail || "");
      } else if (event.type === "plan") {
        setSearchResult((current) => ({ ...current, plan: event, depth: event.depth }));
      } else if (event.type === "sources") {
        setSearchResult((current) => ({ ...current, sources: event.sources || [] }));
      } else if (event.type === "cards") {
        setSearchResult((current) => ({ ...current, cards: event.cards || [] }));
      } else if (event.type === "entity-images") {
        setSearchResult((current) => ({
          ...current,
          visualEntity: event.entity || null,
          entityImages: Array.isArray(event.images) ? event.images.slice(0, 3) : [],
        }));
      } else if (event.type === "notice") {
        setSearchResult((current) => ({
          ...current,
          notices: [...(current?.notices || []), event.message].filter(Boolean).slice(-4),
        }));
      } else if (event.type === "token") {
        tokenBuffer.current += event.text || "";
        if (!tokenFrame.current) {
          tokenFrame.current = window.requestAnimationFrame(() => {
            const text = tokenBuffer.current;
            tokenBuffer.current = "";
            tokenFrame.current = 0;
            setSearchResult((current) => ({ ...current, message: `${current?.message || ""}${text}` }));
            setSearchState("streaming");
          });
        }
      } else if (event.type === "done") {
        if (tokenFrame.current) window.cancelAnimationFrame(tokenFrame.current);
        tokenFrame.current = 0;
        tokenBuffer.current = "";
        const result = { ...event.result, notices: event.result?.notices || [] };
        setSearchResult((current) => ({ ...current, ...result, notices: current?.notices || result.notices || [] }));
        setSearchState("success");
        setSearchStage("");
        activeSearchId.current = "";
        setSearchThread((current) => [...current, {
          query: searchQueryRef.current,
          answer: result.message,
          sources: result.sources,
        }].slice(-4));
        onSearchComplete?.({ query: searchQueryRef.current, result });
      } else if (event.type === "error") {
        setSearchResult((current) => ({
          ...current,
          status: "error",
          message: event.message || "搜索暂时不可用。",
        }));
        setSearchState("error");
        setSearchStage("");
        activeSearchId.current = "";
      }
    });
    return () => {
      unsubscribe?.();
      if (activeSearchId.current) window.beanBrowser?.cancelSearch?.(activeSearchId.current);
      if (tokenFrame.current) window.cancelAnimationFrame(tokenFrame.current);
    };
  }, [onSearchComplete]);

  useEffect(() => {
    if (!window.beanBrowser?.onBrizoUseProgress) return undefined;
    return window.beanBrowser.onBrizoUseProgress((event) => {
      if (event?.sessionId !== activeTabId) return;
      if (typeof event?.paused === "boolean") setUsePaused(event.paused);
      if (event?.detail) setSearchStage(event.detail);
      if (event?.embeddedSandbox || event?.title || event?.url) {
        setUseSandboxView((current) => ({
          title: event.title || current.title,
          url: event.url || current.url,
          embeddedSandbox: event.embeddedSandbox || current.embeddedSandbox,
          steps: event.detail && current.steps.at(-1) !== event.detail
            ? [...current.steps, event.detail]
            : current.steps,
        }));
      } else if (event?.detail) {
        setUseSandboxView((current) => ({
          ...current,
          embeddedSandbox: event.embeddedSandbox || current.embeddedSandbox,
          steps: current.steps.at(-1) === event.detail
            ? current.steps
            : [...current.steps, event.detail],
        }));
      }
    });
  }, [activeTabId]);

  useEffect(() => {
    const list = useStepsRef.current;
    if (!list || !useTraceExpanded) return;
    const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    list.scrollTo({ top: list.scrollHeight, behavior: reducedMotion ? "auto" : "smooth" });
  }, [useSandboxView.steps.length, useTraceExpanded]);

  useEffect(() => {
    if (!window.beanBrowser?.setBrizoUseSandboxLayout) return undefined;
    const host = useSandboxHostRef.current;
    const running = commandMode === "use" && searchState === "loading" && useSandboxView.embeddedSandbox;
    if (!host || !running) {
      window.beanBrowser.setBrizoUseSandboxLayout({ sessionId: activeTabId, visible: false });
      return undefined;
    }
    let frame = 0;
    const publishLayout = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        const bounds = host.getBoundingClientRect();
        const resultsBounds = resultsRef.current?.getBoundingClientRect();
        const pageBounds = host.closest(".web-content-host")?.getBoundingClientRect();
        const fullyVisible = bounds.bottom > 0
          && bounds.right > 0
          && bounds.top >= (resultsBounds?.top || 0)
          && bounds.bottom <= Math.min(window.innerHeight, resultsBounds?.bottom || window.innerHeight);
        window.beanBrowser.setBrizoUseSandboxLayout({
          sessionId: activeTabId,
          visible: fullyVisible,
          bounds: { x: bounds.left, y: bounds.top, width: bounds.width, height: bounds.height },
          sourceViewport: {
            width: pageBounds?.width || window.innerWidth,
            height: pageBounds?.height || window.innerHeight,
          },
        });
      });
    };
    const observer = new ResizeObserver(publishLayout);
    observer.observe(host);
    resultsRef.current?.addEventListener("scroll", publishLayout, { passive: true });
    window.addEventListener("resize", publishLayout);
    publishLayout();
    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
      resultsRef.current?.removeEventListener("scroll", publishLayout);
      window.removeEventListener("resize", publishLayout);
      window.beanBrowser.setBrizoUseSandboxLayout({ sessionId: activeTabId, visible: false });
    };
  }, [activeTabId, commandMode, searchState, useSandboxView.embeddedSandbox]);

  useEffect(() => {
    if (searchState !== "streaming" || !followStream.current || !resultsRef.current) return;
    resultsRef.current.scrollTop = resultsRef.current.scrollHeight;
  }, [searchResult?.message, searchState]);

  const runPrompt = async (rawValue) => {
    const value = rawValue.trim();
    if (!value) {
      promptInputRef.current?.focus();
      return;
    }
    const sequence = searchSequence.current + 1;
    searchSequence.current = sequence;
    if (activeSearchId.current) window.beanBrowser?.cancelSearch?.(activeSearchId.current);
    const searchId = `search-${window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
    activeSearchId.current = searchId;
    searchQueryRef.current = value;
    tokenBuffer.current = "";
    setTabMenuOpen(false);
    setHistoryMenuOpen(false);
    setSearchQuery(value);
    setSearchResult(null);
    setUseSandboxView({ embeddedSandbox: false, title: "", url: "", steps: [] });
    setSearchStartedAt(Date.now());
    setSearchState("loading");
    setSourcesExpanded(false);
    followStream.current = true;
    setSearchStage("正在启动检索");
    const result = await onSubmit({ attachments, contextTab, depth: "fast", model, searchId, tabId: activeTabId, thread: searchThread, value });
    if (searchSequence.current !== sequence || result?.status === "navigated") return;
    if (result?.status === "started" || result?.status === "streaming") return;
    activeSearchId.current = "";
    setSearchResult(result);
    setSearchState(result?.status === "success" || result?.status === "preview" ? "success" : "error");
    if (result?.status === "success" || result?.status === "preview") {
      onSearchComplete?.({ query: value, result });
    }
  };

  const runUsePrompt = async (rawValue) => {
    const value = rawValue.trim();
    if (!value) {
      promptInputRef.current?.focus();
      return;
    }
    setTabMenuOpen(false);
    setHistoryMenuOpen(false);
    setSearchQuery(value);
    setSearchResult(null);
    setSearchStartedAt(Date.now());
    setUsePaused(false);
    setUseTraceExpanded(true);
    setSearchState("loading");
    setUseSandboxView({ embeddedSandbox: false, title: "", url: "", steps: [] });
    setSourcesExpanded(false);
    setSearchStage(useExecutionSpace ? "正在创建 Brizo 独立沙箱" : "正在创建独立 Use 标签");
    let result;
    try {
      result = await onUseSubmit?.({
        command: value,
        executeInPlace: useExecutionSpace,
        sessionId: activeTabId,
        tabId: activeTabId,
      });
    } catch (error) {
      result = {
        status: "error",
        message: `Use 启动失败：${error instanceof Error ? error.message : String(error)}`,
        sources: [],
      };
    }
    if (result?.status === "delegated") {
      setSearchState("idle");
      setSearchStage("");
      return;
    }
    setSearchResult(result || { status: "error", message: "Use 运行时不可用。", sources: [] });
    setUsePaused(false);
    setSearchState(result?.status === "success" || result?.status === "preview" ? "success" : "error");
    setSearchStage("");
  };

  useEffect(() => {
    if (!initialPrompt || restoredResult?.result || initialPromptStarted.current) return;
    initialPromptStarted.current = true;
    setPrompt(initialPrompt);
    runPrompt(initialPrompt);
  }, [initialPrompt, restoredResult]);

  useEffect(() => {
    if (!initialUseCommand || initialUseStarted.current) return;
    initialUseStarted.current = true;
    setCommandMode("use");
    setPrompt(initialUseCommand);
    runUsePrompt(initialUseCommand);
  }, [initialUseCommand]);

  const toggleUsePause = async () => {
    if (usePauseRequest.current) return;
    usePauseRequest.current = true;
    try {
      if (usePaused) {
        const resumed = await window.beanBrowser?.resumeBrizoUseCommand?.(activeTabId);
        if (resumed) {
          setUsePaused(false);
          setSearchStage("BrowserSkill 已继续");
        }
      } else {
        const paused = await window.beanBrowser?.pauseBrizoUseCommand?.(activeTabId);
        if (paused) {
          setUsePaused(true);
          setSearchStage("BrowserSkill 已暂停");
        }
      }
    } finally {
      usePauseRequest.current = false;
    }
  };

  const submitPrompt = async (event) => {
    event.preventDefault();
    if (commandMode === "use" && (searchState === "loading" || searchState === "streaming")) {
      await toggleUsePause();
      return;
    }
    if (commandMode === "use") {
      await runUsePrompt(prompt);
      return;
    }
    await runPrompt(prompt);
  };

  const searchWithEngine = (engine) => {
    const query = prompt.trim();
    if (!query) {
      promptInputRef.current?.focus();
      return;
    }
    const searchUrl = engine === "bing"
      ? `https://www.bing.com/search?q=${encodeURIComponent(query)}`
      : `https://www.google.com/search?q=${encodeURIComponent(query)}`;
    setTabMenuOpen(false);
    setHistoryMenuOpen(false);
    onOpenSource?.(searchUrl);
  };

  const hasResults = searchState !== "idle";
  const sourceItems = Array.isArray(searchResult?.sources) ? searchResult.sources : [];
  const visibleSourceItems = sourceItems.filter((source) => !isZhihuSource(source));
  const waitingForEvidence = searchState === "loading" && !sourceItems.length && !searchResult?.message;
  const copyText = async (value) => {
    if (window.beanBrowser?.copyText) return await window.beanBrowser.copyText(value);
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return true;
    }
    return false;
  };
  const copySearchResult = async () => {
    const sourceText = commandMode === "use" ? "" : visibleSourceItems.map((source, index) =>
      `[${index + 1}] ${source.title || source.domain || "网页来源"}\n${source.url || ""}`
    ).join("\n\n");
    const text = [searchQuery, searchResult?.message, sourceText ? `来源\n${sourceText}` : ""]
      .filter(Boolean)
      .join("\n\n");
    try {
      const copied = await copyText(text);
      onNotify?.(copied ? "搜索结果已复制" : "无法复制搜索结果");
    } catch {
      onNotify?.("无法复制搜索结果");
    }
  };
  useEffect(() => {
    if (!active || !window.beanBrowser?.onRendererContextAction) return undefined;
    return window.beanBrowser.onRendererContextAction((action) => {
      if (action === "copy-search-result") void copySearchResult();
    });
  }, [active, commandMode, searchQuery, searchResult, visibleSourceItems]);

  const openResultContextMenu = (event) => {
    if (!window.beanBrowser?.showRendererContextMenu) return;
    const target = event.target instanceof Element ? event.target : null;
    const image = target?.closest("img");
    const link = target?.closest("[data-context-url], a[href]");
    const selectedText = String(window.getSelection?.()?.toString() || "").trim();
    const linkUrl = link?.getAttribute("data-context-url") || link?.getAttribute("href") || "";
    event.preventDefault();
    void window.beanBrowser.showRendererContextMenu({
      imageUrl: image?.currentSrc || image?.src || "",
      linkUrl,
      selectedText,
      surface: "search-result",
      x: event.clientX,
      y: event.clientY,
    });
  };
  const shareSearchResult = async () => {
    const url = createSearchShareUrl(searchQuery);
    try {
      const copied = await copyText(url);
      onNotify?.(copied ? "搜索地址已复制" : "无法复制搜索地址");
    } catch {
      onNotify?.("无法复制搜索地址");
    }
  };
  const exportSearchPdf = async () => {
    if (!window.beanBrowser?.exportSearchPdf) {
      onNotify?.("PDF 下载仅在桌面版可用");
      return;
    }
    setResultPdfExporting(true);
    try {
      const result = await window.beanBrowser.exportSearchPdf({
        answer: searchResult?.message || "",
        query: searchQuery,
        sources: visibleSourceItems,
      });
      if (result?.status === "saved") onNotify?.("搜索结果 PDF 已保存");
      else if (result?.status === "error") onNotify?.(result.message || "无法生成 PDF");
    } catch {
      onNotify?.("无法生成 PDF");
    } finally {
      setResultPdfExporting(false);
    }
  };

  return (
    <section className={`new-tab-page${hasResults ? " has-results" : ""}`} aria-label="Brizo new tab">
      {!hasResults && <NewTabParticleBackground active={active} />}
      <div className="new-tab-history-dock" ref={historyMenuRef}>
        <button
          className="new-tab-history-trigger"
          type="button"
          aria-label="历史搜索记录"
          aria-expanded={historyMenuOpen}
          aria-haspopup="menu"
          title="历史搜索记录"
          onClick={() => {
            setTabMenuOpen(false);
            setHistoryMenuOpen((open) => !open);
          }}
        >
          <ClockCounterClockwise size={19} />
        </button>
        {historyMenuOpen && (
          <div className="new-tab-history-menu" role="menu" aria-label="历史搜索记录">
            <header>
              <strong>历史搜索</strong>
            </header>
            <div className="new-tab-history-list">
              {history.length ? history.map((item) => (
                <button
                  key={item.query}
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setPrompt(item.query);
                    setHistoryMenuOpen(false);
                    if (item.result) {
                      setSearchQuery(item.query);
                      setSearchResult(item.result);
                      setSearchThread([{ query: item.query, answer: item.result.message, sources: item.result.sources || [] }]);
                      setSearchState(
                        item.result.status === "success" || item.result.status === "preview"
                          ? "success"
                          : "error",
                      );
                      setSourcesExpanded(false);
                      onRestoreHistory?.({ query: item.query, tabId: activeTabId });
                    }
                    window.requestAnimationFrame(() => promptInputRef.current?.focus());
                  }}
                >
                  <ClockCounterClockwise size={15} />
                  <span>{item.query}</span>
                </button>
              )) : (
                <span className="new-tab-history-empty">暂无历史</span>
              )}
            </div>
          </div>
        )}
      </div>
      <section
        className="new-tab-results"
        ref={resultsRef}
        aria-live="polite"
        aria-label={commandMode === "use" ? "Use 执行结果" : "搜索结果"}
        aria-hidden={!hasResults}
        onContextMenu={openResultContextMenu}
        onScroll={(event) => {
          const node = event.currentTarget;
          followStream.current = node.scrollHeight - node.scrollTop - node.clientHeight < 90;
        }}
      >
        {hasResults && <div className={`new-tab-results-content${searchResult?.entityImages?.length ? " has-entity-images" : ""}${commandMode === "use" && searchState === "loading" ? " is-use-running" : ""}${usePaused ? " is-use-paused" : ""}`}>
        <header className="new-tab-results-header">
          <span>{commandMode === "use" ? "Brizo Use · 独立沙箱" : "Brizo Scout AI"}</span>
          <h2>{searchQuery}</h2>
        </header>

        {waitingForEvidence ? (
          <div className="new-tab-loading-result">
            <SearchLoadingState
              label={searchStage || "正在搜索网页并组织答案…"}
              startedAt={searchStartedAt}
            />
            {commandMode === "use" && (
              <div className={`brizo-use-sandbox-stage ${usePaused ? "is-paused" : "is-running"}`} aria-label="Brizo 独立沙箱实时画面">
                <div className="brizo-use-sandbox-viewport">
                  <div className="brizo-use-sandbox-toolbar">
                    <span className="brizo-use-sandbox-status"><i />{usePaused ? "已暂停" : "实时运行"}</span>
                    <span title={useSandboxView.url}>{useSandboxView.title || useSandboxView.url || "正在打开沙箱网页"}</span>
                  </div>
                  <div className="brizo-use-sandbox-canvas" ref={useSandboxHostRef}>
                    {!useSandboxView.embeddedSandbox && (
                      <div className="brizo-use-sandbox-empty"><ArrowsClockwise size={18} /><span>正在准备独立浏览器页面</span></div>
                    )}
                  </div>
                </div>
                <aside className="brizo-use-sandbox-process" aria-label="沙箱操作过程">
                  <div className={`brizo-use-process-trace${useTraceExpanded ? " is-expanded" : ""}`}>
                    <button
                      className="brizo-use-process-trace-toggle"
                      type="button"
                      aria-expanded={useTraceExpanded}
                      onClick={() => setUseTraceExpanded((expanded) => !expanded)}
                    >
                      <Sparkle size={16} weight="fill" aria-hidden="true" />
                      <span>{usePaused ? "执行已暂停" : "正在执行"}</span>
                      <CaretDown size={14} aria-hidden="true" />
                    </button>
                    <div className="brizo-use-process-trace-body">
                      <ol className="brizo-use-sandbox-steps" aria-label="沙箱执行步骤" ref={useStepsRef}>
                        {useSandboxView.steps.map((step, index) => {
                          const activeStep = index === useSandboxView.steps.length - 1;
                          return (
                            <li className={`${activeStep ? "is-active" : "is-complete"}${activeStep && usePaused ? " is-paused" : ""}`} key={`${index}-${step}`}>
                              <span className="brizo-use-step-marker" aria-hidden="true">
                                {activeStep && !usePaused ? <i /> : activeStep ? <b /> : <Check size={14} weight="bold" />}
                              </span>
                              <p>{step}</p>
                            </li>
                          );
                        })}
                      </ol>
                    </div>
                  </div>
                  <button className={`brizo-use-process-pause${usePaused ? " is-paused" : ""}`} type="button" onClick={toggleUsePause}>
                    {usePaused ? <Play size={14} weight="fill" /> : <Pause size={14} weight="fill" />}
                    <span>{usePaused ? "继续" : "暂停"}</span>
                  </button>
                </aside>
              </div>
            )}
            <i /><i /><i /><i />
          </div>
        ) : (
          <>
            {(searchState === "loading" || searchState === "streaming") && (
              <div className="new-tab-live-stage" role="status">
                <SearchLoadingState
                  label={searchStage || "正在组织答案"}
                  startedAt={searchStartedAt}
                />
              </div>
            )}
            {searchResult?.notices?.map((notice) => (
              <p className="new-tab-search-notice" key={notice}>{notice}</p>
            ))}

            {commandMode === "use" && searchResult?.processSteps?.length > 0 && (
              <details className="brizo-use-process-summary">
                <summary>查看独立沙箱执行过程（{searchResult.processSteps.length} 步）</summary>
                <ol>{searchResult.processSteps.map((step, index) => <li key={`${index}-${step}`}>{step}</li>)}</ol>
              </details>
            )}

            {commandMode !== "use" && (
              <SearchSources
                expanded={sourcesExpanded}
                id={`new-tab-source-list-${activeTabId}`}
                sources={visibleSourceItems}
                onOpenSource={onOpenSource}
                onToggle={() => setSourcesExpanded((value) => !value)}
              />
            )}

            <div className="new-tab-answer-layout">
              <article className={`new-tab-answer${searchState === "error" ? " is-error" : ""}`}>
                {searchResult?.message ? (
                  <SearchAnswer
                    message={searchResult.message}
                    sources={commandMode === "use" ? [] : sourceItems}
                    onOpenSource={onOpenSource}
                    streaming={commandMode !== "use" && searchState === "streaming"}
                  />
                ) : searchState === "error" ? (
                  <p>{commandMode === "use" ? "Use 运行时暂时不可用。" : "搜索服务暂时不可用。"}</p>
                ) : null}
                {commandMode !== "use" && searchState === "streaming" && searchResult?.message && (
                  <span className="new-tab-stream-caret" aria-hidden="true" />
                )}
              </article>
              <SearchEntityImages
                entity={searchResult?.visualEntity}
                images={searchResult?.entityImages}
                onOpenSource={onOpenSource}
              />
            </div>

            <SearchVerticalCards cards={searchResult?.cards} onOpenSource={onOpenSource} />

            {searchState === "success" && searchResult?.message && (
              <div className="new-tab-result-actions" aria-label="搜索结果操作">
                <button type="button" title="复制搜索结果" aria-label="复制搜索结果" onClick={copySearchResult}>
                  <CopySimple size={15} />
                </button>
                <button
                  type="button"
                  title="下载 PDF"
                  aria-label="下载 PDF"
                  disabled={resultPdfExporting}
                  onClick={exportSearchPdf}
                >
                  {resultPdfExporting
                    ? <ArrowsClockwise className="is-spinning" size={15} />
                    : <FilePdf size={15} />}
                </button>
                <button type="button" title="分享：复制搜索地址" aria-label="分享并复制搜索地址" onClick={shareSearchResult}>
                  <ShareNetwork size={15} />
                </button>
              </div>
            )}

            {searchResult?.relatedQuestions?.length > 0 && (
              <section className="new-tab-related" aria-label="延伸话题">
                <h3>继续探索</h3>
                <div>
                  {searchResult.relatedQuestions.map((question) => (
                    <button
                      key={question}
                      type="button"
                      onClick={() => {
                        setPrompt(question);
                        runPrompt(question);
                      }}
                    >
                      <span>{question}</span>
                      <ArrowRight size={15} />
                    </button>
                  ))}
                </div>
              </section>
            )}
          </>
        )}
        </div>}
      </section>

      <div className="new-tab-compose">
      <div className="new-tab-intro" aria-hidden={hasResults}>
          <img className="new-tab-logo" src={logoPicUrl} alt="" />
          <h1>{greeting}</h1>
        </div>

        <BorderBeam
          className="new-tab-beam"
          size="md"
          colorVariant="colorful"
          theme="light"
          strength={0.7}
          borderRadius={10}
        >
          <form className={`new-tab-command-surface is-${commandMode}-mode`} onSubmit={submitPrompt}>
          <NewTabCommandLight active={active && !hasResults} />
          <div className="new-tab-prompt-row">
            <textarea
              ref={promptInputRef}
              aria-label="输入网址、搜索内容或提出问题"
              autoFocus
              rows={2}
              value={prompt}
              placeholder={commandMode === "ask"
                ? "输入 URL、搜索内容或提出问题…"
                : "描述希望 Brizo 在独立沙盒页面中完成的操作…"}
              onChange={(event) => setPrompt(event.target.value)}
              onFocus={() => setPromptFocused(true)}
              onBlur={() => setPromptFocused(false)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  submitPrompt(event);
                }
              }}
            />
          </div>

          {promptSuggestions.length > 0 && (
            <div className="new-tab-prompt-suggestions" role="listbox" aria-label="输入联想">
              {promptSuggestions.map((suggestion) => (
                <button
                  key={`${suggestion.type}-${suggestion.value}`}
                  type="button"
                  role="option"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    setPrompt(suggestion.value);
                    runPrompt(suggestion.value);
                  }}
                >
                  {suggestion.type === "url"
                    ? <GlobeHemisphereWest size={16} />
                    : <MagnifyingGlass size={16} />}
                  <span>{suggestion.type === "url" ? suggestion.value.replace(/^https?:\/\//i, "") : suggestion.value}</span>
                </button>
              ))}
            </div>
          )}

          <div className="new-tab-command-actions">
            <div className="new-tab-action-group">
              <div className="new-tab-mode-toggle" role="radiogroup" aria-label="命令模式">
                {[
                  ["ask", "ASK"],
                  ["use", "USE"],
                ].map(([mode, label]) => (
                  <label
                    key={mode}
                    className="new-tab-mode-option"
                  >
                    <input
                      type="radio"
                      name={`command-mode-${activeTabId}`}
                      value={mode}
                      checked={commandMode === mode}
                      onChange={() => {
                        setCommandMode(mode);
                        setTabMenuOpen(false);
                        setOnlineSuggestions([]);
                        window.requestAnimationFrame(() => promptInputRef.current?.focus());
                      }}
                    />
                    <span className="new-tab-mode-name">{label}</span>
                  </label>
                ))}
              </div>

              <div className={`new-tab-ask-tools${commandMode === "ask" ? " is-visible" : ""}`} aria-hidden={commandMode !== "ask"}>
                <input
                  ref={fileInputRef}
                  className="new-tab-file-input"
                  type="file"
                  multiple
                  accept="image/*,.pdf,.txt,.md,.doc,.docx"
                  tabIndex={commandMode === "ask" ? 0 : -1}
                  onChange={(event) => setAttachments(Array.from(event.target.files || []))}
                />
                <button
                  className={attachments.length ? "new-tab-tool-button has-selection" : "new-tab-tool-button"}
                  type="button"
                  tabIndex={commandMode === "ask" ? 0 : -1}
                  aria-label="插入文件或图片"
                  title={attachments.length ? `已插入 ${attachments.length} 个文件` : "插入文件或图片"}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Paperclip size={20} />
                  {attachments.length > 0 && <span className="new-tab-tool-count">{attachments.length}</span>}
                </button>

                <div className="new-tab-menu-anchor">
                  <button
                    className={contextTab ? "new-tab-tool-button has-selection" : "new-tab-tool-button"}
                    type="button"
                    tabIndex={commandMode === "ask" ? 0 : -1}
                    aria-expanded={tabMenuOpen}
                    aria-haspopup="menu"
                    aria-label="插入已有标签页"
                    title={contextTab ? `已插入：${contextTab.shortTitle}` : "插入已有标签页"}
                    onClick={() => {
                      setTabMenuOpen((value) => !value);
                    }}
                  >
                    <Browsers size={20} />
                    {contextTab && <span className="new-tab-selection-dot" />}
                  </button>
                  {tabMenuOpen && commandMode === "ask" && (
                    <div className="new-tab-tab-menu" role="menu" aria-label="选择已有标签页">
                      {availableTabs.length ? availableTabs.map((tab) => (
                        <button
                          key={tab.id}
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            setContextTab(tab);
                            setTabMenuOpen(false);
                            promptInputRef.current?.focus();
                          }}
                        >
                          <SiteIcon id={tab.id} faviconUrl={tab.faviconUrl} isError={tab.loadError} isNewTab={tab.isNewTab} isPdf={tab.isPdf} />
                          <span>{tab.shortTitle}</span>
                          {contextTab?.id === tab.id && <Check size={15} weight="bold" />}
                        </button>
                      )) : <span className="new-tab-menu-empty">没有可插入的标签页</span>}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="new-tab-action-group new-tab-submit-group">
              {commandMode === "ask" && (
                <>
                  <button className="new-tab-engine-button is-bing" type="button" aria-label="使用 Bing 搜索当前内容" title="Bing 搜索" disabled={searchState === "loading" || searchState === "streaming"} onClick={() => searchWithEngine("bing")}>
                    <span aria-hidden="true">B</span>
                  </button>
                  <button className="new-tab-engine-button is-google" type="button" aria-label="使用 Google 搜索当前内容" title="Google 搜索" disabled={searchState === "loading" || searchState === "streaming"} onClick={() => searchWithEngine("google")}>
                    <span aria-hidden="true">G</span>
                  </button>
                </>
              )}
              <button
                className={`new-tab-submit-button is-primary${commandMode === "use" && (searchState === "loading" || searchState === "streaming") ? " is-pause" : ""}`}
                type="submit"
                aria-label={commandMode === "use" && (searchState === "loading" || searchState === "streaming") ? `${usePaused ? "继续" : "暂停"} BrowserSkill` : commandMode === "ask" ? "确认" : "执行 Use"}
                disabled={commandMode === "ask" && (searchState === "loading" || searchState === "streaming")}
              >
                <span className="new-tab-submit-label" aria-hidden="true">{commandMode === "use" && (searchState === "loading" || searchState === "streaming") ? (usePaused ? "继续" : "暂停") : commandMode === "ask" ? "Ask Brizo" : "Use Brizo"}</span>
                <span className="new-tab-submit-visual" aria-hidden="true">
                  <span className="new-tab-submit-transition" />
                  <span className="new-tab-submit-gradient" />
                </span>
                {commandMode === "use" && (searchState === "loading" || searchState === "streaming")
                  ? (usePaused ? <Play size={18} weight="fill" /> : <Pause size={18} weight="fill" />)
                  : commandMode === "ask"
                    ? <SparklesIcon className="new-tab-submit-sparkles" size={20.4} strokeWidth={1.9} />
                    : <MonitorIcon className="new-tab-submit-monitor" size={20.4} strokeWidth={1.9} />}
              </button>
            </div>
          </div>
          </form>
        </BorderBeam>
      </div>
      {!hasResults && (
        <SoftBlurIn
          as="p"
          blur={12}
          className="new-tab-mythic-tagline"
          distance={8}
          duration={900}
          fontWeight="600"
          selector={`[data-new-tab-tagline="${activeTabId}"]`}
          speed={1}
          stagger={0}
          data-new-tab-tagline={activeTabId}
        >
          Brizo, navigate beyond the known.
        </SoftBlurIn>
      )}
    </section>
  );
}

function BrandCustomIcon({ name }) {
  if (name === "calendar") {
    return (
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none">
        <rect x="2" y="3" width="20" height="18" rx="4.5" fill="#4285F4" />
        <rect x="2" y="3" width="20" height="6" fill="#1A73E8" />
        <text x="12" y="17.5" fill="#ffffff" fontSize="9.5" fontWeight="bold" textAnchor="middle" fontFamily="sans-serif">31</text>
      </svg>
    );
  }
  if (name === "gmail") {
    return (
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none">
        <path d="M4 6C2.9 6 2 6.9 2 8V18C2 19.1 2.9 20 4 20H6V11.5L12 16L18 11.5V20H20C21.1 20 22 19.1 22 18V8C22 6.9 21.1 6 20 6H18L12 10.5L6 6H4Z" fill="#EA4335" />
        <path d="M2 8V18C2 19.1 2.9 20 4 20H6V11.5L2 8.5V8Z" fill="#4285F4" />
        <path d="M22 8V18C22 19.1 21.1 20 20 20H18V11.5L22 8.5V8Z" fill="#34A853" />
        <path d="M6 11.5V20H4C2.9 20 2 19.1 2 18V8.5L6 11.5Z" fill="#FBBC05" />
      </svg>
    );
  }
  if (name === "slack") {
    return (
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none">
        <path d="M5.5 10.5C6.33 10.5 7 9.83 7 9V5.5C7 4.67 6.33 4 5.5 4S4 4.67 4 5.5V9C4 9.83 4.67 10.5 5.5 10.5Z" fill="#E01E5A"/>
        <path d="M4 12.5C4 13.33 4.67 14 5.5 14H9C9.83 14 10.5 13.33 10.5 12.5S9.83 11 9 11H5.5C4.67 11 4 11.67 4 12.5Z" fill="#E01E5A"/>
        <path d="M10.5 5.5C10.5 4.67 9.83 4 9 4H5.5C4.67 4 4 4.67 4 5.5S4.67 7 5.5 7H9C9.83 7 10.5 6.33 10.5 5.5Z" fill="#36C5F0"/>
        <path d="M12.5 4C11.67 4 11 4.67 11 5.5V9C11 9.83 11.67 10.5 12.5 10.5S14 9.83 14 9V5.5C14 4.67 13.33 4 12.5 4Z" fill="#36C5F0"/>
        <path d="M18.5 10.5C17.67 10.5 17 9.83 17 9V5.5C17 4.67 17.67 4 18.5 4S20 4.67 20 5.5V9C20 9.83 19.33 10.5 18.5 10.5Z" fill="#2EB67D"/>
        <path d="M20 12.5C20 11.67 19.33 11 18.5 11H15C14.17 11 13.5 11.67 13.5 12.5S14.17 14 15 14H18.5C19.33 14 20 13.33 20 12.5Z" fill="#2EB67D"/>
        <path d="M13.5 18.5C13.5 19.33 14.17 20 15 20H18.5C19.33 20 20 19.33 20 18.5S19.33 17 18.5 17H15C14.17 17 13.5 17.67 13.5 18.5Z" fill="#ECB22E"/>
        <path d="M11.5 20C12.33 20 13 19.33 13 18.5V15C13 14.17 12.33 13.5 11.5 13.5S10 14.17 10 15V18.5C10 19.33 10.67 20 11.5 20Z" fill="#ECB22E"/>
      </svg>
    );
  }
  if (name === "bilibili") {
    return (
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none">
        <rect x="2" y="5" width="20" height="15" rx="5" fill="#00AEEC" />
        <circle cx="8" cy="11.5" r="1.5" fill="#ffffff" />
        <circle cx="16" cy="11.5" r="1.5" fill="#ffffff" />
        <path d="M10 15C10.5 15.8 11.2 16 12 16C12.8 16 13.5 15.8 14 15" stroke="#ffffff" strokeWidth="1.5" strokeLinecap="round" />
        <path d="M7 2.5L9.5 5" stroke="#00AEEC" strokeWidth="2" strokeLinecap="round" />
        <path d="M17 2.5L14.5 5" stroke="#00AEEC" strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  }
  if (name === "edge") {
    return (
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none">
        <circle cx="12" cy="12" r="10" fill="#0078D7" />
        <path d="M12 4C7.58 4 4 7.58 4 12C4 16.42 7.58 20 12 20C15.5 20 18.44 17.76 19.46 14.62C18.66 15.48 17.2 16 15.5 16C12.5 16 10 13.5 10 10.5C10 8.5 11 6.8 12.6 5.8C12.4 5.8 12.2 4 12 4Z" fill="#50E6FF" />
        <circle cx="13" cy="11" r="5" fill="#ffffff" />
      </svg>
    );
  }
  if (name === "chat") {
    return (
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none">
        <circle cx="12" cy="12" r="10" fill="#C0C5C2" />
        <path d="M12 6C8.68 6 6 8.24 6 11C6 12.56 6.86 13.94 8.22 14.85L7.5 17.5L10.3 16.1C10.84 16.24 11.41 16.3 12 16.3C15.32 16.3 18 14.06 18 11.3C18 8.54 15.32 6 12 6Z" fill="#ffffff" />
      </svg>
    );
  }
  if (name === "brizo") {
    return (
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none">
        <rect x="2" y="2" width="20" height="20" rx="6" fill="#111111" />
        <path d="M7 12C7 9.24 9.24 7 12 7C14.76 7 17 9.24 17 12V16C17 16.55 16.55 17 16 17H8C7.45 17 7 16.55 7 16V12Z" fill="#ffffff" />
        <circle cx="12" cy="13" r="2.5" fill="#111111" />
      </svg>
    );
  }
  if (name === "gemini") {
    return (
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none">
        <path d="M12 2C12 7.52 7.52 12 2 12C7.52 12 12 16.48 12 22C12 16.48 16.48 12 22 12C16.48 12 12 7.52 12 2Z" fill="url(#gemini-grad-brand)" />
        <defs>
          <linearGradient id="gemini-grad-brand" x1="2" y1="2" x2="22" y2="22" gradientUnits="userSpaceOnUse">
            <stop stopColor="#4E82EE" />
            <stop offset="0.5" stopColor="#9B72CB" />
            <stop offset="1" stopColor="#D96570" />
          </linearGradient>
        </defs>
      </svg>
    );
  }
  if (name === "taobao") {
    return (
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none">
        <rect width="24" height="24" rx="5" fill="#FF5000" />
        <text x="12" y="17" fill="#ffffff" fontSize="13" fontWeight="900" textAnchor="middle" fontFamily="sans-serif">淘</text>
      </svg>
    );
  }
  if (name === "youdao") {
    return (
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none">
        <text x="12" y="18" fill="#E02020" fontSize="18" fontWeight="900" fontStyle="italic" textAnchor="middle" fontFamily="sans-serif">y</text>
      </svg>
    );
  }
  if (name === "maps") {
    return (
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none">
        <path d="M12 2C8.13 2 5 5.13 5 9C5 14.25 12 22 12 22C12 22 19 14.25 19 9C19 5.13 15.87 2 12 2Z" fill="#34A853" />
        <path d="M12 2C8.13 2 5 5.13 5 9C5 10.3 5.35 11.5 5.96 12.55L12 5.5V2Z" fill="#4285F4" />
        <path d="M12 22C12 22 19 14.25 19 9C19 8.1 18.8 7.25 18.45 6.5L12 14V22Z" fill="#FBBC05" />
        <path d="M12 5.5L5.96 12.55C7.2 14.7 9.3 18.1 12 22V14L18.45 6.5C17.65 5.1 16.3 3.9 14.7 3.1L12 5.5Z" fill="#EA4335" />
        <circle cx="12" cy="9" r="3.5" fill="#ffffff" />
      </svg>
    );
  }
  return null;
}

function SiteIcon({ id = 1, iconKey = "", url = "", faviconUrl = "", isError = false, isNewTab = false, isPdf = false }) {
  let matchedKey = iconKey;
  if (!matchedKey && url) {
    if (url.includes("calendar.google.com")) matchedKey = "calendar";
    else if (url.includes("mail.google.com")) matchedKey = "gmail";
    else if (url.includes("slack.com")) matchedKey = "slack";
    else if (url.includes("bilibili.com")) matchedKey = "bilibili";
    else if (url.includes("microsoft.com") || url.includes("edge")) matchedKey = "edge";
    else if (url.includes("wx.qq.com") || url.includes("weixin")) matchedKey = "chat";
    else if (url.includes("gemini.google.com")) matchedKey = "gemini";
    else if (url.includes("taobao.com")) matchedKey = "taobao";
    else if (url.includes("youdao.com")) matchedKey = "youdao";
    else if (url.includes("maps.google.com")) matchedKey = "maps";
  }

  if (matchedKey) {
    const brandSvg = <BrandCustomIcon name={matchedKey} />;
    if (brandSvg) {
      return <span className="site-icon is-brand" aria-hidden="true">{brandSvg}</span>;
    }
  }

  const icons = {
    1: Flask,
    2: Brain,
    3: Sparkle,
    4: ListBullets,
    5: CirclesFour,
    6: MoonStars,
    7: Leaf,
  };
  const Icon = icons[id] ?? Compass;
  return (
    <span className={`site-icon${faviconUrl ? " has-favicon" : ""}${isNewTab ? " is-new-tab" : ""}${isError ? " is-error" : ""}`} aria-hidden="true">
      {isPdf
        ? <FilePdf size={14} weight="fill" />
        : isNewTab
        ? <img src={logoPicUrl} alt="" />
        : isError
          ? <img src={errorTabIconUrl} alt="" />
        : faviconUrl
          ? <img src={faviconUrl} alt="" />
          : <Icon size={14} weight="bold" />}
    </span>
  );
}

function TabContextMenu({ contextMenu, onClose, onTogglePin, onCloseTab, onCloseOtherTabs, onNewTab, onReload, onCopyUrl }) {
  if (!contextMenu) return null;
  const { x, y, tab } = contextMenu;
  return createPortal(
    <>
      <div className="tab-context-backdrop" onClick={onClose} onContextMenu={(e) => { e.preventDefault(); onClose(); }} />
      <div
        className="tab-context-menu"
        style={{ left: `${x}px`, top: `${y}px` }}
        role="menu"
      >
        <button
          type="button"
          className="tab-context-item"
          role="menuitem"
          onClick={() => onTogglePin(tab.id)}
        >
          <PushPin size={15} weight={tab.isPinned ? "fill" : "regular"} />
          <span>{tab.isPinned ? "取消常驻置顶" : "常驻置顶"}</span>
        </button>
        <button
          type="button"
          className="tab-context-item"
          role="menuitem"
          onClick={onNewTab}
        >
          <Plus size={15} />
          <span>新建标签页</span>
        </button>
        <button
          type="button"
          className="tab-context-item"
          role="menuitem"
          onClick={() => onReload(tab)}
        >
          <ArrowsClockwise size={15} />
          <span>重新加载</span>
        </button>
        {tab.url ? (
          <button
            type="button"
            className="tab-context-item"
            role="menuitem"
            onClick={() => onCopyUrl(tab.url)}
          >
            <CopySimple size={15} />
            <span>复制网址</span>
          </button>
        ) : null}
        <div className="tab-context-divider" />
        <button
          type="button"
          className="tab-context-item is-danger"
          role="menuitem"
          onClick={() => onCloseTab(tab.id)}
        >
          <X size={15} />
          <span>关闭标签页</span>
        </button>
        <button
          type="button"
          className="tab-context-item"
          role="menuitem"
          onClick={() => onCloseOtherTabs(tab.id)}
        >
          <Square size={15} />
          <span>关闭其他标签页</span>
        </button>
      </div>
    </>,
    document.body
  );
}

const MARQUEE_SPEED_PX_PER_SEC = 36;
const MARQUEE_SCROLL_RATIO = 0.3;

function applyMarqueeMetrics(text, distance) {
  const duration = distance / (MARQUEE_SCROLL_RATIO * MARQUEE_SPEED_PX_PER_SEC);
  text.style.setProperty("--marquee-distance", `${distance}px`);
  text.style.setProperty("--marquee-duration", `${Math.max(1.5, duration)}s`);
}

function startTabTitleMarquee(event) {
  const label = event.currentTarget.querySelector(".sidebar-tab-title");
  const text = label?.firstElementChild;
  if (!label || !text) return;
  const distance = text.scrollWidth - label.clientWidth;
  if (distance > 0) {
    applyMarqueeMetrics(text, distance);
    event.currentTarget.classList.add("is-marquee");
  }
}

function stopTabTitleMarquee(event) {
  event.currentTarget.classList.remove("is-marquee");
}

function findBookmarkTreeNode(root, folderPath) {
  if (!folderPath) return root;
  let node = root;
  for (const folderName of splitFolderPath(folderPath)) {
    if (!node?.folders?.[folderName]) return null;
    node = node.folders[folderName];
  }
  return node;
}

function sortBookmarkFolderEntries(node, folderOrders, folderPath = "") {
  const manualOrder = folderOrders?.[folderPath] || [];
  const manualRanks = new Map(
    manualOrder.map((folderName, index) => [folderName, index]),
  );
  return Object.entries(node?.folders || {}).sort(
    ([leftName, leftNode], [rightName, rightNode]) => {
      const leftRank = manualRanks.get(leftName);
      const rightRank = manualRanks.get(rightName);
      if (leftRank !== undefined || rightRank !== undefined) {
        if (leftRank === undefined) return 1;
        if (rightRank === undefined) return -1;
        return leftRank - rightRank;
      }
      const leftOrder = Number(leftNode?.sourceOrder);
      const rightOrder = Number(rightNode?.sourceOrder);
      if (Number.isFinite(leftOrder) && Number.isFinite(rightOrder) && leftOrder !== rightOrder) {
        return leftOrder - rightOrder;
      }
      return String(leftName).localeCompare(String(rightName), "zh-CN");
    },
  );
}

function HorizontalBookmarksBar({
  bookmarkTree,
  folderOrders = {},
  dragItem,
  dropTarget,
  lightForeground = false,
  onDragEnd,
  onDragOver,
  onVerticalDragOver,
  onDragStart,
  onDrop,
  onDropdownOpenChange = () => {},
  onOpenBookmark,
  onOpenBookmarkContextEditor,
}) {
  const [activeDropdownFolder, setActiveDropdownFolder] = useState(null);
  const [openFolderPaths, setOpenFolderPaths] = useState([]);
  const [menuAnchor, setMenuAnchor] = useState(null);
  const [menuScroll, setMenuScroll] = useState({ top: false, bottom: false });
  const folderDropdownRef = useRef(null);
  const scrollContentRef = useRef(null);
  const triggerRef = useRef(null);
  const autoScrollRef = useRef(0);
  const hoverCloseTimer = useRef(0);

  useEffect(() => {
    onDropdownOpenChange(Boolean(activeDropdownFolder));
    return () => onDropdownOpenChange(false);
  }, [activeDropdownFolder, onDropdownOpenChange]);

  const stopAutoScroll = () => {
    if (autoScrollRef.current) {
      window.clearInterval(autoScrollRef.current);
      autoScrollRef.current = 0;
    }
  };

  const updateScrollFlags = () => {
    const menu = scrollContentRef.current;
    if (!menu) return;
    const top = menu.scrollTop > 0;
    const bottom = menu.scrollTop + menu.clientHeight < menu.scrollHeight - 1;
    setMenuScroll((current) => (
      current.top === top && current.bottom === bottom ? current : { top, bottom }
    ));
  };

  const startAutoScroll = (direction) => {
    stopAutoScroll();
    const menu = scrollContentRef.current;
    if (!menu) return;
    autoScrollRef.current = window.setInterval(() => {
      const el = scrollContentRef.current;
      if (!el) {
        stopAutoScroll();
        return;
      }
      const maxTop = el.scrollHeight - el.clientHeight;
      const next = direction > 0
        ? Math.min(el.scrollTop + 10, maxTop)
        : Math.max(el.scrollTop - 10, 0);
      el.scrollTop = next;
      updateScrollFlags();
      if ((direction > 0 && next >= maxTop) || (direction < 0 && next <= 0)) {
        stopAutoScroll();
      }
    }, 40);
  };

  const startNameMarquee = (event) => {
    const label = event.currentTarget.querySelector(
      ".bookmarks-bar-dropdown-folder-name, .bookmarks-bar-dropdown-item-name",
    );
    const text = label?.firstElementChild;
    if (!label || !text) return;
    const distance = text.scrollWidth - label.clientWidth;
    if (distance > 0) {
      applyMarqueeMetrics(text, distance);
      event.currentTarget.classList.add("is-marquee");
    }
  };

  const stopNameMarquee = (event) => event.currentTarget.classList.remove("is-marquee");

  useEffect(() => {
    if (!activeDropdownFolder) return undefined;
    const handleClickOutside = (event) => {
      if (
        folderDropdownRef.current?.contains(event.target)
        || triggerRef.current?.contains(event.target)
      ) {
        return;
      }
      setActiveDropdownFolder(null);
      setOpenFolderPaths([]);
      setMenuAnchor(null);
      stopAutoScroll();
    };
    const repositionMenu = () => {
      const trigger = triggerRef.current;
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      const menuWidth = folderDropdownRef.current?.getBoundingClientRect().width || 190;
      const top = Math.round(rect.bottom + 4);
      const maxHeight = Math.max(120, Math.min(540, Math.round(window.innerHeight - top - 8)));
      const left = Math.max(
        8,
        Math.min(Math.round(rect.left), Math.round(window.innerWidth - menuWidth - 8)),
      );
      setMenuAnchor((current) => (
        current && current.top === top && current.left === left && current.maxHeight === maxHeight
          ? current
          : { top, left, maxHeight }
      ));
    };
    window.addEventListener("pointerdown", handleClickOutside);
    window.addEventListener("resize", repositionMenu);
    window.addEventListener("scroll", repositionMenu, true);
    repositionMenu();
    return () => {
      stopAutoScroll();
      window.removeEventListener("pointerdown", handleClickOutside);
      window.removeEventListener("resize", repositionMenu);
      window.removeEventListener("scroll", repositionMenu, true);
    };
  }, [activeDropdownFolder]);

  useLayoutEffect(() => {
    updateScrollFlags();
    return () => stopAutoScroll();
  }, [activeDropdownFolder, openFolderPaths]);

  useEffect(() => () => {
    if (hoverCloseTimer.current) {
      window.clearTimeout(hoverCloseTimer.current);
    }
  }, []);

  const rootFolderEntries = sortBookmarkFolderEntries(bookmarkTree, folderOrders);
  const rootBookmarks = [...(bookmarkTree?.bookmarks || [])].sort(compareBookmarks);
  const dropClassFor = (key) => (
    dropTarget?.key === key ? ` is-drop-${dropTarget.position}` : ""
  );

  if (rootFolderEntries.length === 0 && rootBookmarks.length === 0) {
    return null;
  }

  const closeMenu = () => {
    setActiveDropdownFolder(null);
    setOpenFolderPaths([]);
    setMenuAnchor(null);
  };

  const openDropdown = (folderName, trigger) => {
    const rect = trigger.getBoundingClientRect();
    const top = Math.round(rect.bottom + 4);
    setMenuAnchor({
      top,
      left: Math.max(8, Math.round(rect.left)),
      maxHeight: Math.max(120, Math.min(540, Math.round(window.innerHeight - top - 8))),
    });
    setActiveDropdownFolder(folderName);
    setOpenFolderPaths([]);
  };

  const openFolderPathAt = (level, path) => {
    setOpenFolderPaths((current) => {
      const next = current.slice(0, level);
      next.push(path);
      return next;
    });
  };

  const clearHoverClose = () => {
    if (hoverCloseTimer.current) {
      window.clearTimeout(hoverCloseTimer.current);
      hoverCloseTimer.current = 0;
    }
  };

  const scheduleHoverClose = () => {
    clearHoverClose();
    hoverCloseTimer.current = window.setTimeout(closeMenu, 500);
  };

  return (
    <div
      className={`horizontal-bookmarks-bar${lightForeground ? " uses-light-foreground" : ""}`}
      role="navigation"
      aria-label="收藏夹栏"
    >
      {rootFolderEntries.map(([folderName, folderNode]) => {
        const isOpen = activeDropdownFolder === folderName;
        const activeNode = isOpen ? folderNode : null;
        const activeEntries = activeNode
          ? sortBookmarkFolderEntries(activeNode, folderOrders, folderName)
          : [];
        const activeBookmarks = activeNode
          ? [...activeNode.bookmarks].sort(compareBookmarks)
          : [];
        const openChildPath = isOpen ? openFolderPaths[0] : null;
        const openChildNode = openChildPath
          ? activeNode?.folders?.[splitFolderPath(openChildPath).at(-1)]
          : null;

        return (
          <div
            key={folderName}
            className={`bookmarks-bar-folder-wrapper${isOpen ? " is-open" : ""}`}
          >
            <button
              className={`bookmarks-bar-folder-btn${dropClassFor(`folder:${folderName}`)}`}
              type="button"
              aria-expanded={isOpen}
              ref={isOpen ? triggerRef : null}
              draggable
              onMouseEnter={(event) => {
                if (activeDropdownFolder !== folderName) {
                  openDropdown(folderName, event.currentTarget);
                }
                clearHoverClose();
              }}
              onMouseLeave={scheduleHoverClose}
              onClick={(event) => {
                if (isOpen) {
                  closeMenu();
                  return;
                }
                openDropdown(folderName, event.currentTarget);
              }}
              onContextMenu={(event) => onOpenBookmarkContextEditor(
                event,
                { type: "folder", path: folderName, title: folderName },
                { fromBar: true },
              )}
              onDragStart={(event) => onDragStart(event, {
                type: "folder",
                path: folderName,
                title: folderName,
              })}
              onDragOver={(event) => {
                if (activeDropdownFolder !== folderName) {
                  openDropdown(folderName, event.currentTarget);
                }
                clearHoverClose();
                onDragOver(event, {
                  type: "folder",
                  path: folderName,
                  key: `folder:${folderName}`,
                });
              }}
              onDrop={(event) => onDrop(event, {
                type: "folder",
                path: folderName,
                key: `folder:${folderName}`,
              })}
              onDragEnd={onDragEnd}
            >
              <FolderSimple size={18} weight="fill" />
              <span>{folderName}</span>
              <CaretDown size={10} weight="bold" />
            </button>
            {isOpen && activeNode && menuAnchor && createPortal(
              <div
                className="bookmarks-bar-dropdown-menu"
                role="menu"
                ref={folderDropdownRef}
                onMouseEnter={clearHoverClose}
                onMouseLeave={scheduleHoverClose}
                style={{ position: "fixed", top: menuAnchor.top, left: menuAnchor.left }}
              >
                <div
                  className="bookmarks-bar-dropdown-scroll"
                  ref={scrollContentRef}
                  onScroll={updateScrollFlags}
                  style={{ maxHeight: menuAnchor.maxHeight }}
                >
                  {activeEntries.map(([subFolderName, subFolderNode]) => {
                    const subFolderPath = `${folderName} / ${subFolderName}`;
                    return (
                      <button
                        key={subFolderName}
                        className={`bookmarks-bar-dropdown-folder${dropClassFor(`folder:${subFolderPath}`)}`}
                        type="button"
                        role="menuitem"
                        aria-haspopup="true"
                        draggable
                        onClick={() => openFolderPathAt(0, subFolderPath)}
                        onContextMenu={(event) => onOpenBookmarkContextEditor(
                          event,
                          { type: "folder", path: subFolderPath, title: subFolderName },
                          { fromBar: true },
                        )}
                        onMouseEnter={(event) => {
                          openFolderPathAt(0, subFolderPath);
                          startNameMarquee(event);
                        }}
                        onMouseLeave={stopNameMarquee}
                        onDragStart={(event) => onDragStart(event, {
                          type: "folder",
                          path: subFolderPath,
                          title: subFolderName,
                        })}
                        onDragOver={(event) => {
                          openFolderPathAt(0, subFolderPath);
                          clearHoverClose();
                          (onVerticalDragOver || onDragOver)(event, {
                            type: "folder",
                            path: subFolderPath,
                            key: `folder:${subFolderPath}`,
                          });
                        }}
                        onDrop={(event) => onDrop(event, {
                          type: "folder",
                          path: subFolderPath,
                          key: `folder:${subFolderPath}`,
                        })}
                        onDragEnd={onDragEnd}
                      >
                        <FolderSimple size={18} weight="fill" />
                        <span className="bookmarks-bar-dropdown-folder-name"><span>{subFolderName}</span></span>
                        <CaretRight size={11} weight="bold" />
                      </button>
                    );
                  })}
                  {activeBookmarks.map((bookmark) => (
                    <button
                      key={bookmark.id || bookmark.url}
                      className={`bookmarks-bar-dropdown-item${dropClassFor(`bookmark:${bookmark.url}`)}`}
                      type="button"
                      role="menuitem"
                      title={bookmark.url}
                      draggable
                      onClick={() => {
                        closeMenu();
                        onOpenBookmark(bookmark);
                      }}
                      onContextMenu={(event) => {
                        closeMenu();
                        onOpenBookmarkContextEditor(
                          event,
                          { type: "bookmark", bookmark },
                          { fromBar: true },
                        );
                      }}
                      onMouseEnter={startNameMarquee}
                      onMouseLeave={stopNameMarquee}
                      onDragStart={(event) => onDragStart(event, {
                        type: "bookmark",
                        url: bookmark.url,
                        folder: bookmark.folder || "",
                        title: bookmark.title || bookmark.url,
                      })}
                      onDragOver={(event) => {
                        clearHoverClose();
                        (onVerticalDragOver || onDragOver)(event, {
                          type: "bookmark",
                          url: bookmark.url,
                          folder: bookmark.folder || "",
                          key: `bookmark:${bookmark.url}`,
                        });
                      }}
                      onDrop={(event) => onDrop(event, {
                        type: "bookmark",
                        url: bookmark.url,
                        folder: bookmark.folder || "",
                        key: `bookmark:${bookmark.url}`,
                      })}
                      onDragEnd={onDragEnd}
                    >
                      <BookmarkFavicon bookmark={bookmark} />
                      <span className="bookmarks-bar-dropdown-item-name"><span>{bookmark.title || bookmark.url}</span></span>
                    </button>
                  ))}
                  {activeEntries.length === 0 && activeBookmarks.length === 0 && (
                    <div className="bookmarks-bar-dropdown-empty">此文件夹为空</div>
                  )}
                </div>
                <div
                  className={`bookmarks-bar-dropdown-edge is-top${menuScroll.top ? " is-visible" : ""}`}
                  onPointerEnter={() => startAutoScroll(-1)}
                  onPointerLeave={stopAutoScroll}
                >
                  <CaretUp size={12} weight="bold" />
                </div>
                <div
                  className={`bookmarks-bar-dropdown-edge is-bottom${menuScroll.bottom ? " is-visible" : ""}`}
                  onPointerEnter={() => startAutoScroll(1)}
                  onPointerLeave={stopAutoScroll}
                >
                  <CaretDown size={12} weight="bold" />
                </div>
                {openChildNode && (
                  <BookmarkDropdownCascade
                    level={1}
                    path={openChildPath}
                    node={openChildNode}
                    folderOrders={folderOrders}
                    openFolderPaths={openFolderPaths}
                    onOpenFolderPath={openFolderPathAt}
                    onClose={closeMenu}
                    onOpenBookmark={onOpenBookmark}
                    onOpenBookmarkContextEditor={onOpenBookmarkContextEditor}
                    parentRef={folderDropdownRef}
                    dropClassFor={dropClassFor}
                    onDragStart={onDragStart}
                    onDragOver={onVerticalDragOver || onDragOver}
                    onDrop={onDrop}
                    onDragEnd={onDragEnd}
                  />
                )}
              </div>,
              document.getElementById("root"),
            )}
          </div>
        );
      })}
      {rootBookmarks.map((bookmark) => (
        <button
          key={bookmark.id || bookmark.url}
          className={`bookmarks-bar-item${dropClassFor(`bookmark:${bookmark.url}`)}`}
          type="button"
          title={bookmark.url}
          onClick={() => onOpenBookmark(bookmark)}
          onContextMenu={(event) => onOpenBookmarkContextEditor(
            event,
            { type: "bookmark", bookmark },
            { fromBar: true },
          )}
          draggable
          onDragStart={(event) => onDragStart(event, {
            type: "bookmark",
            url: bookmark.url,
            folder: bookmark.folder || "",
            title: bookmark.title || bookmark.url,
          })}
          onDragOver={(event) => onDragOver(event, {
            type: "bookmark",
            url: bookmark.url,
            folder: bookmark.folder || "",
            key: `bookmark:${bookmark.url}`,
          })}
          onDrop={(event) => onDrop(event, {
            type: "bookmark",
            url: bookmark.url,
            folder: bookmark.folder || "",
            key: `bookmark:${bookmark.url}`,
          })}
          onDragEnd={onDragEnd}
        >
          <BookmarkFavicon bookmark={bookmark} />
          <span>{bookmark.title || bookmark.url}</span>
        </button>
      ))}
    </div>
  );
}

function BookmarkDropdownCascade({
  level,
  path,
  node,
  folderOrders,
  openFolderPaths,
  onOpenFolderPath,
  onClose,
  onOpenBookmark,
  onOpenBookmarkContextEditor,
  parentRef,
  dropClassFor = () => "",
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}) {
  const selfRef = useRef(null);
  const scrollRef = useRef(null);
  const autoScrollRef = useRef(0);
  const [menuScroll, setMenuScroll] = useState({ top: false, bottom: false });
  const [side, setSide] = useState("right");

  const updateScrollFlags = () => {
    const el = scrollRef.current;
    if (!el) return;
    const top = el.scrollTop > 0;
    const bottom = el.scrollTop + el.clientHeight < el.scrollHeight - 1;
    setMenuScroll((current) => (
      current.top === top && current.bottom === bottom ? current : { top, bottom }
    ));
  };

  const stopAutoScroll = () => {
    if (autoScrollRef.current) {
      window.clearInterval(autoScrollRef.current);
      autoScrollRef.current = 0;
    }
  };

  const startAutoScroll = (direction) => {
    stopAutoScroll();
    const el = scrollRef.current;
    if (!el) return;
    autoScrollRef.current = window.setInterval(() => {
      const current = scrollRef.current;
      if (!current) {
        stopAutoScroll();
        return;
      }
      const maxTop = current.scrollHeight - current.clientHeight;
      const next = direction > 0
        ? Math.min(current.scrollTop + 10, maxTop)
        : Math.max(current.scrollTop - 10, 0);
      current.scrollTop = next;
      updateScrollFlags();
      if ((direction > 0 && next >= maxTop) || (direction < 0 && next <= 0)) {
        stopAutoScroll();
      }
    }, 40);
  };

  const startNameMarquee = (event) => {
    const label = event.currentTarget.querySelector(
      ".bookmarks-bar-dropdown-folder-name, .bookmarks-bar-dropdown-item-name",
    );
    const text = label?.firstElementChild;
    if (!label || !text) return;
    const distance = text.scrollWidth - label.clientWidth;
    if (distance > 0) {
      applyMarqueeMetrics(text, distance);
      event.currentTarget.classList.add("is-marquee");
    }
  };

  const stopNameMarquee = (event) => event.currentTarget.classList.remove("is-marquee");

  useLayoutEffect(() => {
    const computeSide = () => {
      const parent = parentRef?.current;
      const self = selfRef.current;
      if (!parent || !self) return;
      const parentRect = parent.getBoundingClientRect();
      const selfWidth = self.getBoundingClientRect().width;
      const fitsRight = parentRect.right + selfWidth + 8 <= window.innerWidth;
      setSide(fitsRight ? "right" : "left");
    };
    computeSide();
    window.addEventListener("resize", computeSide);
    return () => {
      stopAutoScroll();
      window.removeEventListener("resize", computeSide);
    };
  }, []);

  useLayoutEffect(() => {
    updateScrollFlags();
    return () => stopAutoScroll();
  }, [node]);

  const entries = sortBookmarkFolderEntries(node, folderOrders, path);
  const bookmarks = [...(node?.bookmarks || [])].sort(compareBookmarks);
  const openChildPath = openFolderPaths[level];
  const openChildNode = openChildPath
    ? node?.folders?.[splitFolderPath(openChildPath).at(-1)]
    : null;

  return (
    <div
      className={`bookmarks-bar-dropdown-menu is-cascade is-${side}`}
      role="menu"
      ref={selfRef}
    >
      <div
        className="bookmarks-bar-dropdown-scroll"
        ref={scrollRef}
        onScroll={updateScrollFlags}
      >
        {entries.map(([subFolderName, subFolderNode]) => {
          const childPath = path ? `${path} / ${subFolderName}` : subFolderName;
          return (
            <button
              key={subFolderName}
              className={`bookmarks-bar-dropdown-folder${dropClassFor(`folder:${childPath}`)}`}
              type="button"
              role="menuitem"
              aria-haspopup="true"
              draggable
              onClick={() => onOpenFolderPath(level, childPath)}
              onContextMenu={(event) => onOpenBookmarkContextEditor(
                event,
                { type: "folder", path: childPath, title: subFolderName },
                { fromBar: true },
              )}
              onMouseEnter={(event) => {
                onOpenFolderPath(level, childPath);
                startNameMarquee(event);
              }}
              onMouseLeave={stopNameMarquee}
              onDragStart={(event) => onDragStart?.(event, {
                type: "folder",
                path: childPath,
                title: subFolderName,
              })}
              onDragOver={(event) => {
                onOpenFolderPath(level, childPath);
                onDragOver?.(event, {
                  type: "folder",
                  path: childPath,
                  key: `folder:${childPath}`,
                });
              }}
              onDrop={(event) => onDrop?.(event, {
                type: "folder",
                path: childPath,
                key: `folder:${childPath}`,
              })}
              onDragEnd={onDragEnd}
            >
              <FolderSimple size={18} weight="fill" />
              <span className="bookmarks-bar-dropdown-folder-name"><span>{subFolderName}</span></span>
              <CaretRight size={11} weight="bold" />
            </button>
          );
        })}
        {bookmarks.map((bookmark) => (
          <button
            key={bookmark.id || bookmark.url}
            className={`bookmarks-bar-dropdown-item${dropClassFor(`bookmark:${bookmark.url}`)}`}
            type="button"
            role="menuitem"
            title={bookmark.url}
            draggable
            onClick={() => {
              onClose();
              onOpenBookmark(bookmark);
            }}
            onContextMenu={(event) => {
              onClose();
              onOpenBookmarkContextEditor(
                event,
                { type: "bookmark", bookmark },
                { fromBar: true },
              );
            }}
            onMouseEnter={startNameMarquee}
            onMouseLeave={stopNameMarquee}
            onDragStart={(event) => onDragStart?.(event, {
              type: "bookmark",
              url: bookmark.url,
              folder: bookmark.folder || "",
              title: bookmark.title || bookmark.url,
            })}
            onDragOver={(event) => onDragOver?.(event, {
              type: "bookmark",
              url: bookmark.url,
              folder: bookmark.folder || "",
              key: `bookmark:${bookmark.url}`,
            })}
            onDrop={(event) => onDrop?.(event, {
              type: "bookmark",
              url: bookmark.url,
              folder: bookmark.folder || "",
              key: `bookmark:${bookmark.url}`,
            })}
            onDragEnd={onDragEnd}
          >
            <BookmarkFavicon bookmark={bookmark} />
            <span className="bookmarks-bar-dropdown-item-name"><span>{bookmark.title || bookmark.url}</span></span>
          </button>
        ))}
        {entries.length === 0 && bookmarks.length === 0 && (
          <div className="bookmarks-bar-dropdown-empty">此文件夹为空</div>
        )}
      </div>
      <div
        className={`bookmarks-bar-dropdown-edge is-top${menuScroll.top ? " is-visible" : ""}`}
        onPointerEnter={() => startAutoScroll(-1)}
        onPointerLeave={stopAutoScroll}
      >
        <CaretUp size={12} weight="bold" />
      </div>
      <div
        className={`bookmarks-bar-dropdown-edge is-bottom${menuScroll.bottom ? " is-visible" : ""}`}
        onPointerEnter={() => startAutoScroll(1)}
        onPointerLeave={stopAutoScroll}
      >
        <CaretDown size={12} weight="bold" />
      </div>
      {openChildNode && (
        <BookmarkDropdownCascade
          level={level + 1}
          path={openChildPath}
          node={openChildNode}
          folderOrders={folderOrders}
          openFolderPaths={openFolderPaths}
          onOpenFolderPath={onOpenFolderPath}
          onClose={onClose}
          onOpenBookmark={onOpenBookmark}
          onOpenBookmarkContextEditor={onOpenBookmarkContextEditor}
          parentRef={selfRef}
          dropClassFor={dropClassFor}
          onDragStart={onDragStart}
          onDragOver={onDragOver}
          onDrop={onDrop}
          onDragEnd={onDragEnd}
        />
      )}
    </div>
  );
}

function BookmarkFavicon({ bookmark }) {
  const candidates = [bookmark.faviconUrl].filter(Boolean);
  const candidateKey = candidates.join("|");
  const [candidateIndex, setCandidateIndex] = useState(0);

  useEffect(() => {
    setCandidateIndex(0);
  }, [candidateKey]);

  const faviconUrl = candidates[candidateIndex];
  if (!faviconUrl) {
    return (
      <span className="bookmark-favicon is-fallback" aria-hidden="true">
        <LinkSimple size={12} weight="bold" />
      </span>
    );
  }

  return (
    <span className="bookmark-favicon" aria-hidden="true">
      <img
        alt=""
        src={faviconUrl}
        onError={() => setCandidateIndex((current) => current + 1)}
      />
    </span>
  );
}

function IconButton({ label, children, className = "", disabled = false, onClick }) {
  return (
    <button
      className={`icon-button ${className}`}
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function AttachedIcon({ src, size = 20 }) {
  return (
    <span
      className="attached-icon"
      aria-hidden="true"
      style={{
        "--attached-icon-url": `url("${src}")`,
        height: size,
        width: size,
      }}
    />
  );
}

function SettingsDialog({ children, className = "", description, onBack, onClose, title }) {
  return (
    <div className="settings-dialog-layer" role="presentation">
      <button
        className="settings-dialog-backdrop"
        type="button"
        aria-label="Close dialog"
        onClick={onClose}
      />
      <section
        className={`settings-dialog ${className}`.trim()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-dialog-title"
      >
        <header>
          <div className="settings-dialog-heading">
            {onBack && (
              <IconButton label="返回设置菜单" onClick={onBack}>
                <ArrowLeft size={18} />
              </IconButton>
            )}
            <div>
              <h2 id="settings-dialog-title">{title}</h2>
              {description && <p>{description}</p>}
            </div>
          </div>
          <IconButton label="Close" onClick={onClose}>
            <X size={18} />
          </IconButton>
        </header>
        <div className="settings-dialog-content">{children}</div>
      </section>
    </div>
  );
}

function BookmarkManagerTree({ bookmarks, expanded, folder, folders, onDragEnd, onDragStart, onDrop, onSelect, onToggle }) {
  const renderBranch = (parent = "", depth = 0) => {
    const children = folders.filter((path) => parentFolderPath(path) === parent);
    return children.map((path) => {
      const name = folderNameFromPath(path);
      const hasChildren = folders.some((candidate) => parentFolderPath(candidate) === path);
      const isExpanded = expanded.has(path);
      const count = bookmarks.filter((bookmark) => bookmark.folder === path || bookmark.folder.startsWith(`${path} / `)).length;
      return (
        <div className="bookmark-organizer-tree-branch" key={path}>
          <button
            className={`bookmark-organizer-folder${folder === path ? " is-selected" : ""}`}
            type="button"
            draggable
            style={{ "--tree-depth": depth }}
            onClick={() => onSelect(path)}
            onDragStart={(event) => { event.stopPropagation(); event.dataTransfer.effectAllowed = "move"; onDragStart(path); }}
            onDragEnd={onDragEnd}
            onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "move"; }}
            onDrop={(event) => { event.preventDefault(); event.stopPropagation(); onDrop(path); }}
          >
            <span
              className={`bookmark-organizer-caret${hasChildren ? "" : " is-empty"}`}
              onClick={(event) => { event.stopPropagation(); if (hasChildren) onToggle(path); }}
            >{hasChildren ? (isExpanded ? <CaretDown size={11} /> : <CaretRight size={11} />) : null}</span>
            {folder === path ? <FolderOpen size={17} weight="fill" /> : <FolderSimple size={17} />}
            <span>{name}</span>
            <small>{count}</small>
          </button>
          {isExpanded && renderBranch(path, depth + 1)}
        </div>
      );
    });
  };

  const rootCount = bookmarks.filter((bookmark) => !bookmark.folder).length;
  return (
    <div className="bookmark-organizer-tree">
      <button
        className={`bookmark-organizer-folder${folder === "" ? " is-selected" : ""}`}
        type="button"
        style={{ "--tree-depth": 0 }}
        onClick={() => onSelect("")}
        onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "move"; }}
        onDrop={(event) => { event.preventDefault(); event.stopPropagation(); onDrop(""); }}
      >
        <span className="bookmark-organizer-caret is-empty" />
        {folder === "" ? <FolderOpen size={17} weight="fill" /> : <FolderSimple size={17} />}
        <span>书签栏</span>
        <small>{rootCount}</small>
      </button>
      {renderBranch()}
    </div>
  );
}

function splitFolderPath(folder) {
  return String(folder || "")
    .split("/")
    .map((part) => part.trim())
    .filter(Boolean);
}

function joinFolderPath(parts) {
  return parts.filter(Boolean).join(" / ");
}

function parentFolderPath(folder) {
  const parts = splitFolderPath(folder);
  return joinFolderPath(parts.slice(0, -1));
}

function folderNameFromPath(folder) {
  return splitFolderPath(folder).at(-1) || "";
}

function compareBookmarks(left, right) {
  const leftManual = Number.isFinite(left.manualOrder);
  const rightManual = Number.isFinite(right.manualOrder);
  if (leftManual || rightManual) {
    if (!leftManual) return -1;
    if (!rightManual) return 1;
    if (left.manualOrder !== right.manualOrder) return left.manualOrder - right.manualOrder;
  }
  const leftTime = Math.max(left.updatedAt || 0, left.createdAt || 0);
  const rightTime = Math.max(right.updatedAt || 0, right.createdAt || 0);
  if (leftTime !== rightTime) return rightTime - leftTime;
  if (left.sourceOrder !== right.sourceOrder) return left.sourceOrder - right.sourceOrder;
  return left.title.localeCompare(right.title);
}

function getDirectFolderNames(bookmarks, parentPath, folderOrders = {}) {
  const parentParts = splitFolderPath(parentPath);
  const names = [];
  const seen = new Set();
  for (const bookmark of bookmarks) {
    const parts = splitFolderPath(bookmark.folder);
    const isChild = parentParts.every((part, index) => parts[index] === part);
    if (!isChild || parts.length <= parentParts.length) continue;
    const name = parts[parentParts.length];
    if (!seen.has(name)) {
      seen.add(name);
      names.push(name);
    }
  }
  const manualOrder = folderOrders[parentPath] || [];
  const rank = new Map(manualOrder.map((name, index) => [name, index]));
  return names.sort((left, right) => {
    const leftRank = rank.get(left);
    const rightRank = rank.get(right);
    if (leftRank === undefined && rightRank === undefined) return 0;
    if (leftRank === undefined) return 1;
    if (rightRank === undefined) return -1;
    return leftRank - rightRank;
  });
}

function replaceFolderPrefix(folder, sourcePath, destinationPath) {
  if (folder === sourcePath) return destinationPath;
  const prefix = `${sourcePath} / `;
  return folder.startsWith(prefix)
    ? `${destinationPath}${folder.slice(sourcePath.length)}`
    : folder;
}

function migrateBookmarkFolderOrders(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const migrated = {};
  const entries = Object.entries(value).sort(([left], [right]) => {
    const leftIsBookmarkBar = left && normalizeImportedBookmarkFolder(left) === "";
    const rightIsBookmarkBar = right && normalizeImportedBookmarkFolder(right) === "";
    return Number(rightIsBookmarkBar) - Number(leftIsBookmarkBar);
  });
  for (const [folderPath, order] of entries) {
    if (!Array.isArray(order)) continue;
    const normalizedPath = normalizeImportedBookmarkFolder(folderPath);
    const normalizedOrder = order
      .map((name) => normalizeImportedBookmarkFolder(name))
      .filter(Boolean);
    migrated[normalizedPath] = [
      ...(migrated[normalizedPath] || []),
      ...normalizedOrder,
    ].filter((name, index, names) => names.indexOf(name) === index);
  }
  return migrated;
}

function buildBookmarkTree(bookmarks) {
  const root = { bookmarks: [], folders: Object.create(null), sourceOrder: 0 };
  for (const candidate of bookmarks) {
    const bookmark = normalizeImportedBookmark(candidate);
    const folderParts = splitFolderPath(bookmark.folder);
    let node = root;
    for (const folder of folderParts) {
      node.folders[folder] ||= {
        bookmarks: [],
        folders: Object.create(null),
        sourceOrder: bookmark.sourceOrder,
      };
      node.folders[folder].sourceOrder = Math.min(
        node.folders[folder].sourceOrder,
        bookmark.sourceOrder,
      );
      node = node.folders[folder];
    }
    node.bookmarks.push(bookmark);
  }
  return root;
}

function BookmarkTree({
  canExpandFolders = true,
  depth = 0,
  dragItem,
  dropTarget,
  expandedFolders,
  folderOrders,
  node,
  onDragEnd,
  onDragOverTarget,
  onDragStart,
  onDropTarget,
  onEdit,
  onOpen,
  onToggle,
  onCascadePointerEnter,
  onCascadePointerLeave,
  path = "",
  folderIconIds = {},
  readOnly = false,
}) {
  const [flyoutPositions, setFlyoutPositions] = useState({});
  const folderHoverTimer = useRef(0);
  const pendingFolderPath = useRef("");

  useEffect(() => () => window.clearTimeout(folderHoverTimer.current), []);
  const manualFolderOrder = folderOrders[path] || [];
  const manualFolderRanks = new Map(
    manualFolderOrder.map((folderName, index) => [folderName, index]),
  );
  const folders = Object.entries(node.folders).sort(
    ([leftName, leftNode], [rightName, rightNode]) => {
      const leftRank = manualFolderRanks.get(leftName);
      const rightRank = manualFolderRanks.get(rightName);
      if (leftRank !== undefined || rightRank !== undefined) {
        if (leftRank === undefined) return 1;
        if (rightRank === undefined) return -1;
        return leftRank - rightRank;
      }
      return leftNode.sourceOrder - rightNode.sourceOrder;
    },
  );
  const bookmarks = [...node.bookmarks].sort(compareBookmarks);

  const getDropClass = (targetKey) => {
    if (dropTarget?.key !== targetKey) return "";
    return `is-drop-${dropTarget.position}`;
  };

  const openFolderFlyout = (target, folderPath, folderNode, delay = 0) => {
    window.clearTimeout(folderHoverTimer.current);
    pendingFolderPath.current = folderPath;
    folderHoverTimer.current = window.setTimeout(() => {
      if (
        pendingFolderPath.current !== folderPath
        || !target?.isConnected
        || (delay > 0 && !target.matches(":hover"))
      ) return;
      // Measure only when the menu is about to open. The bookmark rail may still
      // be animating when pointerenter fires, and measuring that stale width is
      // what previously sent a first nested flyout below its parent.
      const rect = target.getBoundingClientRect();
      const maxHeight = Math.max(160, Math.floor(window.innerHeight / 2));
      const itemCount = folderNode.bookmarks.length + Object.keys(folderNode.folders).length;
      const naturalHeight = itemCount * BOOKMARK_FLYOUT_ROW_HEIGHT + 6;
      const menuHeight = Math.min(naturalHeight, maxHeight);
      const top = Math.round(Math.max(
        BOOKMARK_FLYOUT_VIEWPORT_INSET,
        Math.min(
          rect.top - 2,
          window.innerHeight - menuHeight - BOOKMARK_FLYOUT_VIEWPORT_INSET,
        ),
      ));
      const preferredLeft = Math.round(rect.right - 2);
      const opensRight = preferredLeft + BOOKMARK_FLYOUT_WIDTH + BOOKMARK_FLYOUT_VIEWPORT_INSET
        <= window.innerWidth;
      const left = opensRight
        ? preferredLeft
        : Math.max(
          BOOKMARK_FLYOUT_VIEWPORT_INSET,
          Math.round(rect.left - BOOKMARK_FLYOUT_WIDTH + 2),
        );
      setFlyoutPositions((current) => ({
        ...current,
        [folderPath]: {
          "--bookmark-flyout-origin": opensRight ? "left top" : "right top",
          bottom: "auto",
          left,
          maxHeight,
          top,
        },
      }));
      onToggle(folderPath, true);
    }, delay);
  };

  const renderBookmarks = () => bookmarks.map((bookmark) => (
    <button
      className={`bookmark-link-row ${getDropClass(`bookmark:${bookmark.url}`)} ${
        dragItem?.type === "bookmark" && dragItem.url === bookmark.url ? "is-dragging" : ""
      }`}
      style={{ "--bookmark-depth": depth }}
      type="button"
      key={bookmark.url}
      title={bookmark.title}
      draggable={!readOnly}
      onDragEnd={readOnly ? undefined : onDragEnd}
      onDragOver={readOnly ? undefined : (event) => onDragOverTarget(event, {
        folder: bookmark.folder,
        key: `bookmark:${bookmark.url}`,
        type: "bookmark",
        url: bookmark.url,
      })}
      onDragStart={readOnly ? undefined : (event) => onDragStart(event, {
        folder: bookmark.folder,
        title: bookmark.title,
        type: "bookmark",
        url: bookmark.url,
      })}
      onDrop={readOnly ? undefined : (event) => onDropTarget(event, {
        folder: bookmark.folder,
        key: `bookmark:${bookmark.url}`,
        type: "bookmark",
        url: bookmark.url,
      })}
      onContextMenu={readOnly ? undefined : (event) => onEdit(event, {
        bookmark,
        type: "bookmark",
      })}
      onPointerEnter={() => onToggle(bookmark.folder || "", true)}
      onClick={() => onOpen(bookmark)}
    >
      <BookmarkFavicon bookmark={bookmark} />
      <span className="bookmark-tree-copy">{bookmark.title}</span>
    </button>
  ));

  return (
    <>
      {depth === 0 && renderBookmarks()}
      {folders.map(([folderName, folderNode]) => {
        const folderPath = path ? `${path} / ${folderName}` : folderName;
        const isExpanded = canExpandFolders && expandedFolders.has(folderPath);
        return (
          <div className="bookmark-tree-node" key={folderPath}>
            <button
              className={`bookmark-folder-row ${getDropClass(`folder:${folderPath}`)} ${
                dragItem?.type === "folder" && dragItem.path === folderPath ? "is-dragging" : ""
              }`}
              style={{ "--bookmark-depth": depth }}
              type="button"
              aria-expanded={isExpanded}
              draggable={!readOnly}
              onDragEnd={readOnly ? undefined : onDragEnd}
              onDragOver={readOnly ? undefined : (event) => onDragOverTarget(event, {
                key: `folder:${folderPath}`,
                path: folderPath,
                type: "folder",
              })}
              onDragStart={readOnly ? undefined : (event) => onDragStart(event, {
                path: folderPath,
                type: "folder",
              })}
              onDrop={readOnly ? undefined : (event) => onDropTarget(event, {
                key: `folder:${folderPath}`,
                path: folderPath,
                type: "folder",
              })}
              onContextMenu={readOnly ? undefined : (event) => {
                window.clearTimeout(folderHoverTimer.current);
                onEdit(event, {
                  path: folderPath,
                  type: "folder",
                });
              }}
              onPointerEnter={(event) => {
                if (!canExpandFolders) return;
                openFolderFlyout(
                  event.currentTarget,
                  folderPath,
                  folderNode,
                  BOOKMARK_FOLDER_HOVER_DELAY_MS,
                );
              }}
              onPointerMove={(event) => {
                if (
                  !canExpandFolders
                  || isExpanded
                  || pendingFolderPath.current === folderPath
                ) return;
                openFolderFlyout(
                  event.currentTarget,
                  folderPath,
                  folderNode,
                  BOOKMARK_FOLDER_HOVER_DELAY_MS,
                );
              }}
              onPointerLeave={() => {
                pendingFolderPath.current = "";
                window.clearTimeout(folderHoverTimer.current);
              }}
              onClick={(event) => {
                if (canExpandFolders) {
                  openFolderFlyout(event.currentTarget, folderPath, folderNode, 0);
                }
              }}
            >
              {folderIconIds[folderPath]
                ? <BookmarkSemanticIcon active={isExpanded} id={folderIconIds[folderPath]} size={18} />
                : isExpanded
                  ? <FolderOpen size={17} weight="fill" />
                  : <FolderSimple size={17} weight="fill" />}
              <span className="bookmark-tree-copy">{folderName}</span>
            </button>
            {isExpanded && (() => {
              const flyout = (
                <div
                  className="bookmark-folder-flyout"
                  role="menu"
                  style={{
                    ...flyoutPositions[folderPath],
                    zIndex: 90 + depth,
                  }}
                  onPointerEnter={depth > 0 ? onCascadePointerEnter : undefined}
                  onPointerLeave={depth > 0 ? onCascadePointerLeave : undefined}
                >
                  <BookmarkTree
                    canExpandFolders={canExpandFolders}
                    depth={depth + 1}
                    dragItem={dragItem}
                    dropTarget={dropTarget}
                    expandedFolders={expandedFolders}
                    folderOrders={folderOrders}
                    node={folderNode}
                    onDragEnd={onDragEnd}
                    onDragOverTarget={onDragOverTarget}
                    onDragStart={onDragStart}
                    onDropTarget={onDropTarget}
                    onEdit={onEdit}
                    onOpen={onOpen}
                    onToggle={onToggle}
                    onCascadePointerEnter={onCascadePointerEnter}
                    onCascadePointerLeave={onCascadePointerLeave}
                    path={folderPath}
                    folderIconIds={folderIconIds}
                    readOnly={readOnly}
                  />
                </div>
              );
              // A nested flyout cannot stay inside an overflowing parent menu:
              // browsers clip it before the pointer can reach the next level.
              // Portal it to the app root while retaining the same React cascade.
              const portalRoot = typeof document === "undefined"
                ? null
                : document.getElementById("root");
              return depth > 0 && portalRoot ? createPortal(flyout, portalRoot) : flyout;
            })()}
          </div>
        );
      })}
      {depth > 0 && renderBookmarks()}
    </>
  );
}

export function App() {
  const browserApi = window.beanBrowser;
  const desktopMode = Boolean(browserApi);
  const initialAddress = "";
  const [tabs, setTabs] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("bean:open-tabs") || "null");
      return Array.isArray(saved) && saved.length ? saved : INITIAL_TABS;
    } catch {
      return INITIAL_TABS;
    }
  });
  const [activeTab, setActiveTab] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("bean:open-tabs") || "null");
      return saved?.find((t) => !t.isPinned)?.id || saved?.[0]?.id || "tab-maps";
    } catch {
      return "tab-maps";
    }
  });
  const [activeSurface, setActiveSurface] = useState("tab");
  const [tabContextMenu, setTabContextMenu] = useState(null);
  const [draggedTabId, setDraggedTabId] = useState("");

  const pinnedTabs = useMemo(() => tabs.filter((tab) => tab.isPinned), [tabs]);
  const unpinnedTabs = useMemo(() => tabs.filter((tab) => !tab.isPinned), [tabs]);

  useEffect(() => {
    try {
      localStorage.setItem("bean:open-tabs", JSON.stringify(tabs));
    } catch {
      // ignore
    }
  }, [tabs]);

  const handleTabContextMenu = (e, tab) => {
    e.preventDefault();
    e.stopPropagation();
    setTabContextMenu({
      x: Math.min(window.innerWidth - 170, Math.max(10, e.clientX)),
      y: Math.min(window.innerHeight - 240, Math.max(10, e.clientY)),
      tab,
    });
  };

  const toggleTabPinned = (tabId) => {
    setTabs((currentTabs) =>
      currentTabs.map((t) => (t.id === tabId ? { ...t, isPinned: !t.isPinned } : t))
    );
    setTabContextMenu(null);
  };

  const closeOtherTabs = (tabId) => {
    const closed = tabs
      .map((t, index) => ({ tab: { ...t }, index }))
      .filter((item) => item.tab.id !== tabId && !item.tab.isPinned);
    if (closed.length > 0) {
      setClosedTabs((prev) => [...prev, ...closed]);
    }
    setTabs((currentTabs) =>
      currentTabs.filter((t) => t.id === tabId || t.isPinned)
    );
    setActiveTab(tabId);
    setTabContextMenu(null);
  };

  const reloadTab = (tab) => {
    if (desktopMode) {
      browserApi.reload();
    } else {
      showToast("标签页已重新加载");
    }
    setTabContextMenu(null);
  };

  const copyTabUrl = (url) => {
    if (url) {
      navigator.clipboard?.writeText(url);
      showToast("已复制网址");
    }
    setTabContextMenu(null);
  };
  const [query, setQuery] = useState("");
  const [addressText, setAddressText] = useState(() => formatAddressForDisplay(initialAddress));
  const [searchHistory, setSearchHistory] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("bean:search-history") || "[]");
      return Array.isArray(saved) ? saved.slice(0, 200) : [];
    } catch { return []; }
  });
  const [browserHistory, setBrowserHistory] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("bean:browser-history") || "[]");
      return Array.isArray(saved) ? saved.slice(0, 500) : [];
    } catch { return []; }
  });
  const [sessionBrowserHistory, setSessionBrowserHistory] = useState([]);
  const [closedTabs, setClosedTabs] = useState([]);
  const [sidebarHistoryOpen, setSidebarHistoryOpen] = useState(false);
  const [tabHistoryOpen, setTabHistoryOpen] = useState(false);
  const [appPreferences, setAppPreferences] = useState(() => {
    try {
      return {
        autoUpdate: true,
        downloadLocation: "",
        language: "zh-CN",
        ...JSON.parse(localStorage.getItem("bean:app-preferences") || "{}"),
      };
    } catch {
      return { autoUpdate: true, downloadLocation: "", language: "zh-CN" };
    }
  });
  const [addressFocused, setAddressFocused] = useState(false);
  const [addressInputDirty, setAddressInputDirty] = useState(false);
  const [addressOnlineSuggestions, setAddressOnlineSuggestions] = useState([]);
  const [aiOpen, setAiOpen] = useState(false);
  const [downloads, setDownloads] = useState([]);
  const [downloadsOpen, setDownloadsOpen] = useState(false);
  const [downloadIconActivityKey, setDownloadIconActivityKey] = useState(0);
  const downloadActivityStatesRef = useRef(new Map());
  const [bookmarkEditorOpen, setBookmarkEditorOpen] = useState(false);
  const [bookmarkCelebrationUrl, setBookmarkCelebrationUrl] = useState("");
  const [bookmarkDraft, setBookmarkDraft] = useState({ folder: "", title: "", url: "" });
  const [bookmarkFolderMenuOpen, setBookmarkFolderMenuOpen] = useState(false);
  const [bookmarkFolderMenuMaxHeight, setBookmarkFolderMenuMaxHeight] = useState(320);
  const [bookmarkContextEditor, setBookmarkContextEditor] = useState(null);
  const [bookmarkContextDraft, setBookmarkContextDraft] = useState({ folder: "", title: "" });
  const [bookmarkContextFolderMenuOpen, setBookmarkContextFolderMenuOpen] = useState(false);
  const [bookmarkContextFolderMenuMaxHeight, setBookmarkContextFolderMenuMaxHeight] = useState(320);
  const [following, setFollowing] = useState(false);
  const [pdfExporting, setPdfExporting] = useState(false);
  const [toast, setToast] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sidebarFoldersActive, setSidebarFoldersActive] = useState(false);
  const [systemUsesDarkAppearance, setSystemUsesDarkAppearance] = useState(() => (
    window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false
  ));
  const [bookmarkView, setBookmarkView] = useState(() => {
    return window.localStorage.getItem("bean:bookmark-view") === "smart" ? "smart" : "traditional";
  });
  const [smartBookmarkConsent, setSmartBookmarkConsent] = useState(() => (
    window.localStorage.getItem("bean:smart-bookmark-consent") === "accepted"
  ));
  const [smartBookmarkSnapshot, setSmartBookmarkSnapshot] = useState(null);
  const [smartBookmarkProgress, setSmartBookmarkProgress] = useState(null);
  const [smartBookmarkStatus, setSmartBookmarkStatus] = useState("idle");
  const [smartBookmarkMessage, setSmartBookmarkMessage] = useState("");
  const [smartBookmarkLookup, setSmartBookmarkLookup] = useState({});
  const [browserPreview, setBrowserPreview] = useState("");
  const [settingsMenuOpen, setSettingsMenuOpen] = useState(false);
  const [settingsMenuLevel, setSettingsMenuLevel] = useState("root");
  const [settingsPanel, setSettingsPanel] = useState("");
  const [bookmarkBarDropdownOpen, setBookmarkBarDropdownOpen] = useState(false);
  const [pageZoom, setPageZoom] = useState(() => {
    const stored = Number(localStorage.getItem("bean:page-zoom"));
    return Number.isFinite(stored) && stored >= 0.5 && stored <= 2 ? stored : 1;
  });
  const [historySection, setHistorySection] = useState("browser");
  const [bookmarkManageQuery, setBookmarkManageQuery] = useState("");
  const [bookmarkManageDraft, setBookmarkManageDraft] = useState(null);
  const [bookmarkManageFolder, setBookmarkManageFolder] = useState("");
  const [bookmarkManageSelection, setBookmarkManageSelection] = useState(() => new Set());
  const [bookmarkManageExpanded, setBookmarkManageExpanded] = useState(() => new Set());
  const [bookmarkManageContext, setBookmarkManageContext] = useState(null);
  const [bookmarkManageDragItem, setBookmarkManageDragItem] = useState(null);
  const [bookmarkSources, setBookmarkSources] = useState([]);
  const [selectedBookmarkSources, setSelectedBookmarkSources] = useState([]);
  const [bookmarkImporting, setBookmarkImporting] = useState(false);
  const [passwordEntries, setPasswordEntries] = useState([]);
  const [passwordDraft, setPasswordDraft] = useState(null);
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordError, setPasswordError] = useState("");
  const [modelProviders, setModelProviders] = useState([]);
  const [modelProviderDraft, setModelProviderDraft] = useState({
    apiKey: "",
    baseUrl: "",
    id: "",
    makeDefault: true,
    name: "",
  });
  const [modelProviderSaving, setModelProviderSaving] = useState(false);
  const [modelProviderError, setModelProviderError] = useState("");
  const [modelGuardMenuOpen, setModelGuardMenuOpen] = useState(false);
  const [briefEdition, setBriefEdition] = useState(() => desktopMode ? null : createBriefPreviewEdition());
  const [briefLoading, setBriefLoading] = useState(false);
  const [briefRefreshing, setBriefRefreshing] = useState(false);
  const [briefPreferences, setBriefPreferences] = useState(() => {
    try {
      return {
        mutedTopicIds: [],
        pinnedTopicIds: [],
        reducedTopicIds: [],
        ...JSON.parse(localStorage.getItem("bean:brief-preferences") || "{}"),
      };
    } catch {
      return { mutedTopicIds: [], pinnedTopicIds: [], reducedTopicIds: [] };
    }
  });
  const [bookmarkLibrary, setBookmarkLibrary] = useState(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem("bean:bookmark-library") || "[]");
      const library = Array.isArray(saved) && saved.length ? saved : starterBookmarks;
      const normalized = library.map((bookmark, index) => normalizeImportedBookmark({
        ...bookmark,
        sourceOrder: Number.isFinite(Number(bookmark?.sourceOrder))
          ? bookmark.sourceOrder
          : index,
      }));
      window.localStorage.setItem("bean:bookmark-library", JSON.stringify(normalized));
      return normalized;
    } catch {
      return starterBookmarks;
    }
  });
  const [folderOrders, setFolderOrders] = useState(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem("bean:bookmark-folder-orders") || "{}");
      return migrateBookmarkFolderOrders(saved);
    } catch {
      return {};
    }
  });
  const [dragItem, setDragItem] = useState(null);
  const [dropTarget, setDropTarget] = useState(null);
  const [expandedFolders, setExpandedFolders] = useState(() => new Set());
  const [accountProfile, setAccountProfile] = useState(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem("bean:account-profile"));
      if (saved) {
        return {
          ...saved,
          email: saved.email === "alex@bean.local" ? "alex@brizo.local" : saved.email,
        };
      }
      return {
        email: "alex@brizo.local",
        name: "Alex",
      };
    } catch {
      return { email: "alex@brizo.local", name: "Alex" };
    }
  });
  const [accountDraft, setAccountDraft] = useState(accountProfile);
  const [appInfo, setAppInfo] = useState(null);
  const [navigationState, setNavigationState] = useState({
    canGoBack: false,
    canGoForward: false,
    error: "",
    isContentReady: false,
    isPdf: false,
    isLoading: false,
    navigationPreview: "",
    pagePreview: "",
    pageBackgroundColor: "#ffffff",
    pageFaviconUrl: "",
    title: "",
    url: "",
    documentUrl: "",
    ownerTabId: "",
    pdfSourceUrl: "",
  });
  const addressEditing = useRef(false);
  const addressInput = useRef(null);
  const addressValue = useRef(initialAddress);
  const bookmarkDragJustEnded = useRef(false);
  const bookmarkFolderTriggerRef = useRef(null);
  const bookmarkNameInputRef = useRef(null);
  const bookmarkContextFolderTriggerRef = useRef(null);
  const bookmarkContextNameInputRef = useRef(null);
  const bookmarkFaviconAttempts = useRef(new Set());
  const bookmarkFaviconResolution = useRef(null);
  const browserPreviewReleaseFrame = useRef(0);
  const browserMenuRef = useRef(null);
  const sidebarSettingsRef = useRef(null);
  const sidebarHistoryPopoverRef = useRef(null);
  const settingsPopoverRef = useRef(null);
  const topTabsBarRef = useRef(null);
  const tabHistoryRef = useRef(null);
  const modelGuardDockRef = useRef(null);
  const smartBookmarkSyncInFlight = useRef(false);
  const sidebarActivationTimer = useRef(0);
  const sidebarCollapseTimer = useRef(0);
  const webContentHost = useRef(null);
  const addressBarRef = useRef(null);
  const addressLoadAnimation = useRef(0);
  const addressLoadFadeTimer = useRef(0);
  const addressLoadAngle = useRef(0);
  const addressLoadWasActive = useRef(false);
  const [addressLoadPhase, setAddressLoadPhase] = useState("idle");
  const [activeIndicatorY, setActiveIndicatorY] = useState(null);
  const [activeIndicatorHeight, setActiveIndicatorHeight] = useState(35);
  const tabRowRefs = useRef({});
  const sidebarTabsListRef = useRef(null);
  const [tabsScrollFlags, setTabsScrollFlags] = useState({ top: false, bottom: false });
  const tabsAutoScrollTimer = useRef(null);

  const updateTabsScrollFlags = useCallback(() => {
    const el = sidebarTabsListRef.current;
    if (!el) return;
    const top = el.scrollTop > 0;
    const bottom = el.scrollTop + el.clientHeight < el.scrollHeight - 1;
    setTabsScrollFlags((current) => (
      current.top === top && current.bottom === bottom ? current : { top, bottom }
    ));
  }, []);

  const stopTabsAutoScroll = () => {
    if (tabsAutoScrollTimer.current) {
      window.clearInterval(tabsAutoScrollTimer.current);
      tabsAutoScrollTimer.current = null;
    }
  };

  const startTabsAutoScroll = (direction) => {
    stopTabsAutoScroll();
    const el = sidebarTabsListRef.current;
    if (!el) return;
    tabsAutoScrollTimer.current = window.setInterval(() => {
      const target = sidebarTabsListRef.current;
      if (!target) {
        stopTabsAutoScroll();
        return;
      }
      const maxTop = target.scrollHeight - target.clientHeight;
      const next = direction > 0
        ? Math.min(target.scrollTop + 10, maxTop)
        : Math.max(target.scrollTop - 10, 0);
      target.scrollTop = next;
      updateTabsScrollFlags();
      if ((direction > 0 && next >= maxTop) || (direction < 0 && next <= 0)) {
        stopTabsAutoScroll();
      }
    }, 35);
  };

  const resolveMissingBookmarkFavicons = () => {
    if (!browserApi?.resolveBookmarkFavicons || bookmarkFaviconResolution.current) return;
    const candidates = bookmarkLibrary.filter((bookmark) => {
      return bookmark.url && !bookmarkFaviconAttempts.current.has(bookmark.url);
    });
    if (!candidates.length) return;
    for (const bookmark of candidates) bookmarkFaviconAttempts.current.add(bookmark.url);
    const byDepth = new Map();
    for (const bookmark of candidates) {
      const depth = String(bookmark.folder || "").split("/").filter(Boolean).length;
      if (!byDepth.has(depth)) byDepth.set(depth, []);
      byDepth.get(depth).push(bookmark);
    }
    bookmarkFaviconResolution.current = (async () => {
      for (const depth of [...byDepth.keys()].sort((left, right) => left - right)) {
        const resolved = await browserApi.resolveBookmarkFavicons(byDepth.get(depth));
        if (!Array.isArray(resolved) || !resolved.length) continue;
        const byUrl = new Map(resolved.map((item) => [item.url, item.faviconUrl]));
        setBookmarkLibrary((current) => current.map((bookmark) => {
          const faviconUrl = byUrl.get(bookmark.url);
          return faviconUrl ? { ...bookmark, faviconUrl } : bookmark;
        }));
      }
    })()
      .catch(() => {
        for (const bookmark of candidates) bookmarkFaviconAttempts.current.delete(bookmark.url);
      })
      .finally(() => {
        bookmarkFaviconResolution.current = null;
      });
  };

  const currentArticle = useMemo(
    () => tabs.find((article) => article.id === activeTab) ?? tabs[0],
    [activeTab, tabs],
  );
  const briefOpen = activeSurface === "brief";
  const newTabOpen = !briefOpen && Boolean(currentArticle?.isNewTab);
  const bookmarksPageOpen = !briefOpen && Boolean(currentArticle?.isBookmarksPage);
  const canReturnToNewTab = !briefOpen
    && !newTabOpen
    && !bookmarksPageOpen
    && Boolean(currentArticle?.returnToNewTab);
  const navigationOwnsActiveTab = navigationState.ownerTabId === currentArticle?.id;
  const currentPageUrl = !briefOpen && !newTabOpen && !bookmarksPageOpen
    ? (navigationOwnsActiveTab
      ? navigationState.url || navigationState.documentUrl || currentArticle?.url
      : currentArticle?.url) || ""
    : "";
  const currentPageBookmarkKey = useMemo(
    () => canonicalizeUrl(currentPageUrl),
    [currentPageUrl],
  );
  const currentBookmark = useMemo(
    () => currentPageBookmarkKey
      ? bookmarkLibrary.find((bookmark) => (
        canonicalizeUrl(bookmark.url) === currentPageBookmarkKey
      )) || null
      : null,
    [bookmarkLibrary, currentPageBookmarkKey],
  );
  const bookmarkFolderRows = useMemo(() => {
    const rows = [{ depth: 0, name: "书签栏", path: "" }];
    const appendChildren = (parentPath, depth) => {
      for (const folderName of getDirectFolderNames(bookmarkLibrary, parentPath, folderOrders)) {
        const path = joinFolderPath([...splitFolderPath(parentPath), folderName]);
        rows.push({ depth, name: folderName, path });
        appendChildren(path, depth + 1);
      }
    };
    appendChildren("", 1);
    return rows;
  }, [bookmarkLibrary, folderOrders]);
  const bookmarkContextFolderRows = useMemo(() => {
    if (bookmarkContextEditor?.type !== "folder") return bookmarkFolderRows;
    const sourcePath = bookmarkContextEditor.path;
    return bookmarkFolderRows.filter((folder) => (
      folder.path !== sourcePath && !folder.path.startsWith(`${sourcePath} / `)
    ));
  }, [bookmarkContextEditor, bookmarkFolderRows]);
  const pageBackgroundColor = briefOpen
    ? "#ffffff"
    : newTabOpen
    ? "#f1f1f1"
    : bookmarksPageOpen
    ? "#faf9f6"
    : navigationOwnsActiveTab
      ? navigationState.pageBackgroundColor || "#ffffff"
      : "#ffffff";
  const toolbarBackgroundColor = pageBackgroundColor;
  const pageUsesLightForeground = !briefOpen
    && !newTabOpen
    && !bookmarksPageOpen
    && navigationOwnsActiveTab
    && shouldUseLightForeground(pageBackgroundColor);
  const shellUsesLightForeground = !navigationState.isPdf
    && (pageUsesLightForeground || systemUsesDarkAppearance);
  const filteredBookmarkLibrary = bookmarkLibrary;

  useLayoutEffect(() => {
    if (briefOpen || !activeTab) {
      setActiveIndicatorY(null);
      return;
    }
    const activeEl = tabRowRefs.current[activeTab];
    if (activeEl) {
      setActiveIndicatorY(activeEl.offsetTop);
      setActiveIndicatorHeight(activeEl.offsetHeight || 35);
    }
    updateTabsScrollFlags();
  }, [activeTab, briefOpen, unpinnedTabs, updateTabsScrollFlags]);

  useEffect(() => {
    const el = sidebarTabsListRef.current;
    if (!el) return undefined;
    updateTabsScrollFlags();
    const rafId = requestAnimationFrame(updateTabsScrollFlags);
    const handleScroll = () => updateTabsScrollFlags();
    el.addEventListener("scroll", handleScroll, { passive: true });
    let ro = null;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(() => {
        updateTabsScrollFlags();
      });
      ro.observe(el);
    }
    return () => {
      cancelAnimationFrame(rafId);
      el.removeEventListener("scroll", handleScroll);
      if (ro) ro.disconnect();
      stopTabsAutoScroll();
    };
  }, [tabs, unpinnedTabs, updateTabsScrollFlags]);

  useEffect(() => {
    if (activeTab && tabRowRefs.current[activeTab] && sidebarTabsListRef.current) {
      const activeEl = tabRowRefs.current[activeTab];
      const listEl = sidebarTabsListRef.current;
      const activeTop = activeEl.offsetTop;
      const activeBottom = activeTop + activeEl.offsetHeight;
      if (activeTop < listEl.scrollTop) {
        listEl.scrollTo({ top: activeTop - 6, behavior: "smooth" });
      } else if (activeBottom > listEl.scrollTop + listEl.clientHeight) {
        listEl.scrollTo({ top: activeBottom - listEl.clientHeight + 6, behavior: "smooth" });
      }
    }
  }, [activeTab]);

  useEffect(() => {
    const appearanceQuery = window.matchMedia?.("(prefers-color-scheme: dark)");
    if (!appearanceQuery) return undefined;
    const syncAppearance = () => setSystemUsesDarkAppearance(appearanceQuery.matches);
    syncAppearance();
    appearanceQuery.addEventListener("change", syncAppearance);
    return () => appearanceQuery.removeEventListener("change", syncAppearance);
  }, []);

  const selectBookmarkView = (view) => {
    setBookmarkView(view);
    window.localStorage.setItem("bean:bookmark-view", view);
    setExpandedFolders(new Set());
    if (view === "smart" && smartBookmarkConsent && !smartBookmarkSnapshot) {
      window.setTimeout(() => syncSmartBookmarks(false), 0);
    }
  };

  async function syncSmartBookmarks(forceFull = false) {
    if (!browserApi?.syncSmartBookmarks) {
      setSmartBookmarkStatus("desktop-only");
      setSmartBookmarkMessage("智能整理仅在 Brizo 桌面版中可用。");
      return;
    }
    if (smartBookmarkSyncInFlight.current) return;
    smartBookmarkSyncInFlight.current = true;
    setSmartBookmarkStatus("loading");
    setSmartBookmarkMessage("");
    try {
      const result = await browserApi.syncSmartBookmarks({
        bookmarks: bookmarkLibrary,
        forceFull,
        history: browserHistory,
      }).catch(() => ({ status: "error", message: "智能整理暂时不可用。" }));
      if (result?.snapshot) setSmartBookmarkSnapshot(result.snapshot);
      setSmartBookmarkStatus(result?.status || "error");
      setSmartBookmarkMessage(result?.message || "");
    } finally {
      smartBookmarkSyncInFlight.current = false;
    }
  }

  const addressSuggestions = useMemo(() => {
    if (!addressFocused || !addressInputDirty) return [];
    if (looksLikeWebsiteInput(addressText)) {
      return addressSuggestionsFor(addressText, bookmarkLibrary, tabs)
        .slice(0, 3)
        .map((item) => ({ ...item, type: "url", value: item.url }));
    }
    return newTabSuggestionsFor(
      addressText,
      bookmarkLibrary,
      tabs,
      searchHistory,
      addressOnlineSuggestions,
    );
  }, [addressFocused, addressInputDirty, addressOnlineSuggestions, addressText, bookmarkLibrary, searchHistory, tabs]);

  useEffect(() => {
    window.cancelAnimationFrame(addressLoadAnimation.current);
    window.clearTimeout(addressLoadFadeTimer.current);
    const setProgressAngle = (angle) => {
      addressLoadAngle.current = angle;
      addressBarRef.current?.style.setProperty("--address-load-angle", `${angle}deg`);
    };
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (navigationState.isLoading) {
      addressLoadWasActive.current = true;
      setAddressLoadPhase("loading");
      setProgressAngle(0);
      if (reduceMotion) {
        setProgressAngle(340);
        return undefined;
      }
      const startedAt = performance.now();
      const advance = (now) => {
        // Advance quickly at first, then approach the end without ever closing
        // the ring. Only a paint-ready document is allowed to reach 360°.
        const elapsed = Math.max(0, now - startedAt);
        setProgressAngle(Math.min(340, 340 * (1 - Math.exp(-elapsed / 1_800))));
        addressLoadAnimation.current = window.requestAnimationFrame(advance);
      };
      addressLoadAnimation.current = window.requestAnimationFrame(advance);
      return () => window.cancelAnimationFrame(addressLoadAnimation.current);
    }
    if (!addressLoadWasActive.current) return undefined;
    addressLoadWasActive.current = false;
    if (reduceMotion) {
      setProgressAngle(360);
      setAddressLoadPhase("complete");
      addressLoadFadeTimer.current = window.setTimeout(() => {
        setAddressLoadPhase("idle");
        setProgressAngle(0);
      }, 260);
      return () => window.clearTimeout(addressLoadFadeTimer.current);
    }
    const startedAt = performance.now();
    const startingAngle = addressLoadAngle.current;
    const complete = (now) => {
      const progress = Math.min(1, (now - startedAt) / 260);
      const eased = 1 - ((1 - progress) ** 3);
      setProgressAngle(startingAngle + ((360 - startingAngle) * eased));
      if (progress < 1) {
        addressLoadAnimation.current = window.requestAnimationFrame(complete);
        return;
      }
      setAddressLoadPhase("complete");
      addressLoadFadeTimer.current = window.setTimeout(() => {
        setAddressLoadPhase("idle");
        setProgressAngle(0);
      }, 260);
    };
    addressLoadAnimation.current = window.requestAnimationFrame(complete);
    return () => {
      window.cancelAnimationFrame(addressLoadAnimation.current);
      window.clearTimeout(addressLoadFadeTimer.current);
    };
  }, [navigationState.isLoading]);

  useEffect(() => {
    const query = addressText.trim();
    setAddressOnlineSuggestions([]);
    if (!addressFocused || !addressInputDirty || looksLikeWebsiteInput(query) || query.length < 2) return undefined;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      const suggestions = window.beanBrowser?.suggestQueries
        ? await window.beanBrowser.suggestQueries(query)
        : await requestBrowserSuggestions(query);
      if (!cancelled && Array.isArray(suggestions)) setAddressOnlineSuggestions(suggestions);
    }, 450);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [addressFocused, addressInputDirty, addressText]);
  useEffect(() => {
    if (!addressFocused || !addressInputDirty || !looksLikeWebsiteInput(addressText)) return undefined;
    const timer = window.setTimeout(() => browserApi?.preconnect?.(addressText), 120);
    return () => window.clearTimeout(timer);
  }, [addressFocused, addressInputDirty, addressText, browserApi]);
  const bookmarkTree = useMemo(
    () => buildBookmarkTree(filteredBookmarkLibrary),
    [filteredBookmarkLibrary],
  );
  const smartBookmarkView = useMemo(() => {
    if (!smartBookmarkSnapshot?.folders?.length) return null;
    const library = [];
    const folderOrders = { "": smartBookmarkSnapshot.folders.map((folder) => folder.label) };
    const folderIconIds = {};
    for (const industry of smartBookmarkSnapshot.folders) {
      folderIconIds[industry.label] = industry.iconId;
      folderOrders[industry.label] = industry.children.map((folder) => folder.label);
      for (const functionality of industry.children) {
        const folderPath = `${industry.label} / ${functionality.label}`;
        folderIconIds[folderPath] = functionality.iconId;
        functionality.bookmarkKeys.forEach((key, index) => {
          const bookmark = smartBookmarkLookup[key];
          if (!bookmark) return;
          library.push({ ...bookmark, folder: folderPath, manualOrder: index });
        });
      }
    }
    return { folderIconIds, folderOrders, tree: buildBookmarkTree(library) };
  }, [smartBookmarkLookup, smartBookmarkSnapshot]);
  const visibleExpandedFolders = expandedFolders;
  const bookmarkCascadeOpen = expandedFolders.size > 0;
  const browserShellOverlayOpen = bookmarkCascadeOpen
    || bookmarkEditorOpen
    || Boolean(bookmarkContextEditor)
    || aiOpen
    || downloadsOpen
    || sidebarHistoryOpen
    || Boolean(tabContextMenu)
    || bookmarkBarDropdownOpen
    || settingsMenuOpen
    || Boolean(settingsPanel)
    || addressSuggestions.length > 0;

  useEffect(() => () => {
    window.clearTimeout(sidebarActivationTimer.current);
    window.clearTimeout(sidebarCollapseTimer.current);
  }, []);

  useEffect(() => {
    let cancelled = false;
    Promise.all(bookmarkLibrary.map(async (bookmark) => {
      try {
        const url = new URL(bookmark.url);
        url.hash = "";
        for (const key of [...url.searchParams.keys()]) {
          if (/^(utm_|fbclid$|gclid$|mc_cid$|mc_eid$|ref$|source$)/i.test(key)) url.searchParams.delete(key);
        }
        if (url.pathname !== "/") url.pathname = url.pathname.replace(/\/+$/, "");
        url.hostname = url.hostname.toLowerCase().replace(/^www\./, "");
        const bytes = new TextEncoder().encode(url.href);
        const digest = await window.crypto.subtle.digest("SHA-256", bytes);
        const key = [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
        return [key, bookmark];
      } catch {
        return null;
      }
    })).then((entries) => {
      if (!cancelled) setSmartBookmarkLookup(Object.fromEntries(entries.filter(Boolean)));
    });
    return () => { cancelled = true; };
  }, [bookmarkLibrary]);

  useEffect(() => {
    if (!browserApi?.getSmartBookmarkSnapshot) return undefined;
    let cancelled = false;
    browserApi.getSmartBookmarkSnapshot().then((snapshot) => {
      if (!cancelled && snapshot) setSmartBookmarkSnapshot(snapshot);
    });
    return () => { cancelled = true; };
  }, [browserApi]);

  useEffect(() => {
    if (!browserApi?.onSmartBookmarkProgress) return undefined;
    return browserApi.onSmartBookmarkProgress((progress) => {
      setSmartBookmarkProgress(progress);
      if (progress?.snapshot) setSmartBookmarkSnapshot(progress.snapshot);
    });
  }, [browserApi]);

  useEffect(() => {
    if (
      bookmarkView === "smart"
      && smartBookmarkConsent
      && !smartBookmarkSnapshot
      && smartBookmarkStatus === "idle"
    ) {
      void syncSmartBookmarks(false);
    }
  }, [bookmarkView, smartBookmarkConsent, smartBookmarkSnapshot, smartBookmarkStatus]);

  useEffect(() => {
    if (!smartBookmarkConsent || !smartBookmarkSnapshot || !browserApi?.syncSmartBookmarks) return undefined;
    const timer = window.setTimeout(() => syncSmartBookmarks(false), 1_500);
    return () => window.clearTimeout(timer);
  }, [bookmarkLibrary, browserHistory]);

  useEffect(() => {
    if (!modelGuardMenuOpen) return undefined;
    const closeOnOutsidePointer = (event) => {
      if (!modelGuardDockRef.current?.contains(event.target)) setModelGuardMenuOpen(false);
    };
    const closeOnEscape = (event) => {
      if (event.key === "Escape") setModelGuardMenuOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer, true);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer, true);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [modelGuardMenuOpen]);

  useEffect(() => {
    localStorage.setItem("bean:app-preferences", JSON.stringify(appPreferences));
    document.documentElement.lang = appPreferences.language;
  }, [appPreferences]);

  useEffect(() => {
    localStorage.setItem("bean:page-zoom", String(pageZoom));
    browserApi?.setPageZoom?.(pageZoom);
  }, [activeSurface, activeTab, browserApi, pageZoom]);

  useEffect(() => {
    try {
      localStorage.setItem("bean:brief-preferences", JSON.stringify(briefPreferences));
    } catch {
      // Keep the Brief usable when local storage is unavailable.
    }
  }, [briefPreferences]);

  useEffect(() => {
    if (!browserApi?.syncBriefSignals) return undefined;
    const timer = window.setTimeout(() => {
      const domainFromUrl = (url) => {
        try { return new URL(url).hostname.replace(/^www\./i, ""); } catch { return ""; }
      };
      browserApi.syncBriefSignals({
        bookmarks: bookmarkLibrary.slice(0, 300).map((bookmark) => ({
          createdAt: bookmark.createdAt,
          domain: domainFromUrl(bookmark.url),
          folder: bookmark.folder,
          title: bookmark.title,
          updatedAt: bookmark.updatedAt,
        })),
        history: browserHistory.slice(0, 300).map((item) => ({
          domain: domainFromUrl(item.url),
          title: item.title,
          updatedAt: item.updatedAt,
          visits: item.visits,
        })),
        searches: searchHistory.slice(0, 300).map((item) => ({
          count: item.count,
          query: item.query,
          updatedAt: item.updatedAt,
        })),
      });
    }, 650);
    return () => window.clearTimeout(timer);
  }, [bookmarkLibrary, browserApi, browserHistory, searchHistory]);

  useEffect(() => {
    if (!briefOpen) return undefined;
    if (!browserApi?.getBriefEdition) {
      setBriefEdition((current) => current || createBriefPreviewEdition());
      return undefined;
    }
    let cancelled = false;
    setBriefLoading(true);
    setBriefRefreshing(true);
    browserApi.getBriefEdition({ at: Date.now(), background: true, force: true }).then((edition) => {
      if (!cancelled && edition) setBriefEdition(edition);
    }).finally(() => {
      if (!cancelled) {
        setBriefLoading(false);
        if (!briefEdition) setBriefRefreshing(false);
      }
    });
    return () => { cancelled = true; };
  }, [briefOpen, browserApi]);

  useEffect(() => {
    if (!browserApi?.onBriefEditionUpdated) return undefined;
    return browserApi.onBriefEditionUpdated((edition) => {
      if (edition) {
        setBriefEdition(edition);
        setBriefLoading(false);
        setBriefRefreshing(false);
      }
    });
  }, [browserApi]);

  useEffect(() => {
    if (appPreferences.downloadLocation) {
      browserApi?.setDownloadDirectory?.(appPreferences.downloadLocation);
    }
  }, [appPreferences.downloadLocation, browserApi]);

  useEffect(() => {
    const url = navigationState.documentUrl || navigationState.url;
    if (
      navigationState.isLoading
      || navigationState.error
      || !navigationState.title
      || !/^https?:\/\//i.test(url || "")
    ) return;
    setBrowserHistory((current) => {
      const existing = current.find((item) => item.url === url);
      const next = [{
        faviconUrl: navigationState.pageFaviconUrl || existing?.faviconUrl || "",
        title: navigationState.title,
        updatedAt: Date.now(),
        url,
        visits: (existing?.visits || 0) + (current[0]?.url === url ? 0 : 1),
      }, ...current.filter((item) => item.url !== url)].slice(0, 500);
      localStorage.setItem("bean:browser-history", JSON.stringify(next));
      return next;
    });
    setSessionBrowserHistory((current) => {
      const existing = current.find((item) => item.url === url);
      return [{
        faviconUrl: navigationState.pageFaviconUrl || existing?.faviconUrl || "",
        title: navigationState.title,
        updatedAt: Date.now(),
        url,
      }, ...current.filter((item) => item.url !== url)].slice(0, 300);
    });
  }, [navigationState.documentUrl, navigationState.error, navigationState.isLoading, navigationState.pageFaviconUrl, navigationState.title, navigationState.url]);

  useEffect(() => {
    try {
      window.localStorage.setItem("bean:bookmark-library", JSON.stringify(bookmarkLibrary));
    } catch {
      // Keep the current session usable if local storage is unavailable.
    }
  }, [bookmarkLibrary]);

  useEffect(() => {
    try {
      window.localStorage.setItem("bean:bookmark-folder-orders", JSON.stringify(folderOrders));
    } catch {
      // Keep the current session usable if local storage is unavailable.
    }
  }, [folderOrders]);

  useEffect(() => {
    if (!browserApi) return undefined;

    const applyState = (state) => {
      if (!state) return;
      setNavigationState(state);
      if (state.url && !briefOpen && !newTabOpen && !bookmarksPageOpen && !addressEditing.current) {
        addressValue.current = state.url;
        setAddressText(formatAddressForDisplay(state.url));
      }
    };

    browserApi.getState().then(applyState);
    const removeStateListener = browserApi.onState(applyState);
    const removeActivationListener = browserApi.onActivated?.(() => {
      if (addressEditing.current || document.activeElement === addressInput.current) return;
      addressEditing.current = false;
      setAddressText(formatAddressForDisplay(addressValue.current));
      addressInput.current?.blur();
    });

    return () => {
      removeStateListener?.();
      removeActivationListener?.();
    };
  }, [bookmarksPageOpen, briefOpen, browserApi, newTabOpen]);

  useEffect(() => {
    if (!browserApi?.listDownloads) return undefined;
    let active = true;
    const refreshDownloads = async () => {
      const nextDownloads = await browserApi.listDownloads();
      if (active && Array.isArray(nextDownloads)) {
        downloadActivityStatesRef.current = new Map(
          nextDownloads.map((download) => [download.id, download.state]),
        );
        setDownloads(nextDownloads);
      }
    };
    refreshDownloads();
    const removeDownloadListener = browserApi.onDownloads?.((nextDownloads) => {
      if (!Array.isArray(nextDownloads)) return;
      const previousStates = downloadActivityStatesRef.current;
      const hasNewActiveDownload = nextDownloads.some((download) => (
        download?.state === "downloading"
        && previousStates.get(download.id) !== "downloading"
      ));
      downloadActivityStatesRef.current = new Map(
        nextDownloads.map((download) => [download.id, download.state]),
      );
      setDownloads(nextDownloads);
      if (hasNewActiveDownload) {
        setDownloadIconActivityKey((current) => current + 1);
      }
    });
    return () => {
      active = false;
      removeDownloadListener?.();
    };
  }, [browserApi]);

  useEffect(() => browserApi?.onOpenDownloads?.(() => {
    setSettingsMenuOpen(false);
    setDownloadsOpen(true);
  }), [browserApi]);

  useEffect(() => {
    if ((!downloadsOpen && !(settingsMenuOpen && settingsMenuLevel === "downloads")) || !browserApi?.listDownloads) return;
    browserApi.listDownloads().then((nextDownloads) => {
      if (Array.isArray(nextDownloads)) setDownloads(nextDownloads);
    });
  }, [browserApi, downloadsOpen, settingsMenuLevel, settingsMenuOpen]);

  useEffect(() => {
    const leaveEditMode = () => {
      addressEditing.current = false;
      setAddressText(formatAddressForDisplay(addressValue.current));
    };
    const settleInitialFocus = window.setTimeout(leaveEditMode, 150);
    window.addEventListener("blur", leaveEditMode);
    return () => {
      window.clearTimeout(settleInitialFocus);
      window.removeEventListener("blur", leaveEditMode);
    };
  }, []);

  useEffect(() => {
    if (
      !desktopMode ||
      briefOpen ||
      newTabOpen ||
      bookmarksPageOpen ||
      navigationState.isLoading ||
      !navigationState.url ||
      !navigationState.title
    ) return;

    let domain = navigationState.url;
    try {
      domain = new URL(navigationState.url).hostname.replace(/^www\./, "");
    } catch {
      // Keep the complete URL when the browser reports a non-standard location.
    }

    const ownerTabId = navigationState.ownerTabId;
    if (!ownerTabId) return;
    const actualUrl = navigationState.documentUrl;
    if (actualUrl?.startsWith("data:text/html")
      && !/^https?:\/\/(?:www\.)?example\.com(?:[/:?#]|$)/i.test(navigationState.url)) return;
    if (actualUrl && !actualUrl.startsWith("data:text/html") && actualUrl !== navigationState.url) return;

    setTabs((currentTabs) =>
      currentTabs.map((tab) =>
        tab.id === ownerTabId
          ? {
              ...tab,
              domain,
              faviconUrl: navigationState.pageFaviconUrl || "",
              isPdf: Boolean(navigationState.isPdf),
              shortTitle: navigationState.title,
              title: navigationState.title,
              url: navigationState.url,
            }
          : tab,
      ),
    );
  }, [
    briefOpen,
    bookmarksPageOpen,
    desktopMode,
    newTabOpen,
    navigationState.isLoading,
    navigationState.isPdf,
    navigationState.pageFaviconUrl,
    navigationState.title,
    navigationState.url,
    navigationState.documentUrl,
    navigationState.ownerTabId,
  ]);

  useEffect(() => {
    const ownerTabId = navigationState.ownerTabId;
    if (!ownerTabId) return;
    const loadError = Boolean(navigationState.error);
    setTabs((currentTabs) => currentTabs.map((tab) => (
      tab.id === ownerTabId && Boolean(tab.loadError) !== loadError
        ? { ...tab, loadError }
        : tab
    )));
  }, [navigationState.error, navigationState.ownerTabId]);

  useEffect(() => {
    if (!browserApi || !webContentHost.current) return undefined;

    const host = webContentHost.current;
    let frame = 0;
    const publishBounds = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        const bounds = host.getBoundingClientRect();
        browserApi.setBounds({
          x: bounds.left,
          y: bounds.top,
          width: Math.max(1, bounds.width),
          height: Math.max(1, bounds.height),
        });
      });
    };

    const observer = new ResizeObserver(publishBounds);
    observer.observe(host);
    window.addEventListener("resize", publishBounds);
    publishBounds();

    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("resize", publishBounds);
    };
  }, [bookmarksPageOpen, briefOpen, browserApi, newTabOpen, sidebarOpen]);

  useEffect(() => {
    if (!browserApi?.capturePreview || briefOpen || newTabOpen || bookmarksPageOpen) {
      setBrowserPreview("");
      return undefined;
    }
    if (!browserShellOverlayOpen) return undefined;
    let cancelled = false;
    browserApi.capturePreview().then((preview) => {
      if (!cancelled && typeof preview === "string") setBrowserPreview(preview);
    });
    return () => { cancelled = true; };
  }, [bookmarksPageOpen, browserShellOverlayOpen, briefOpen, browserApi, newTabOpen]);

  useEffect(() => {
    const shouldShowBrowser = !briefOpen
      && !newTabOpen
      && !bookmarksPageOpen
      && !navigationState.error;
    window.cancelAnimationFrame(browserPreviewReleaseFrame.current);
    if (shouldShowBrowser && !browserShellOverlayOpen && browserPreview) {
      // Restore the retained native page first. Keeping its pixel-aligned
      // snapshot for two compositor frames prevents a white flash on close.
      browserApi?.setVisible(true);
      browserPreviewReleaseFrame.current = window.requestAnimationFrame(() => {
        browserPreviewReleaseFrame.current = window.requestAnimationFrame(() => {
          setBrowserPreview("");
        });
      });
      return () => window.cancelAnimationFrame(browserPreviewReleaseFrame.current);
    }
    browserApi?.setVisible(shouldShowBrowser && !(browserShellOverlayOpen && browserPreview));
    return undefined;
  }, [bookmarksPageOpen, briefOpen, browserApi, browserPreview, browserShellOverlayOpen, navigationState.error, newTabOpen]);

  useEffect(() => {
    if (!settingsMenuOpen) return undefined;
    const closeOnOutsidePointer = (event) => {
      if (
        browserMenuRef.current?.contains(event.target)
        || sidebarSettingsRef.current?.contains(event.target)
        || settingsPopoverRef.current?.contains(event.target)
      ) return;
      setSettingsMenuOpen(false);
      setSettingsMenuLevel("root");
      setSettingsPanel("");
    };
    window.addEventListener("pointerdown", closeOnOutsidePointer, true);
    return () => window.removeEventListener("pointerdown", closeOnOutsidePointer, true);
  }, [settingsMenuOpen]);

  useEffect(() => {
    if (!sidebarHistoryOpen) return undefined;
    const closeOnOutsidePointer = (event) => {
      if (
        !sidebarHistoryPopoverRef.current?.contains(event.target) &&
        !event.target.closest?.(".sidebar-dock-history-btn")
      ) {
        setSidebarHistoryOpen(false);
      }
    };
    const closeOnEscape = (event) => {
      if (event.key === "Escape") setSidebarHistoryOpen(false);
    };
    window.addEventListener("pointerdown", closeOnOutsidePointer, true);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("pointerdown", closeOnOutsidePointer, true);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [sidebarHistoryOpen]);

  useEffect(() => {
    const closeOnEscape = (event) => {
      if (event.key !== "Escape") return;
      setSettingsMenuOpen(false);
      setSidebarHistoryOpen(false);
      setSettingsMenuLevel("root");
      setSettingsPanel("");
      setBookmarkFolderMenuOpen(false);
      setBookmarkEditorOpen(false);
      setBookmarkContextFolderMenuOpen(false);
      setBookmarkContextEditor(null);
      setDownloadsOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, []);

  useEffect(() => {
    if (!bookmarkEditorOpen) return undefined;
    const frame = window.requestAnimationFrame(() => {
      bookmarkNameInputRef.current?.focus();
      bookmarkNameInputRef.current?.select();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [bookmarkEditorOpen]);

  useEffect(() => {
    if (!bookmarkContextEditor) return undefined;
    const frame = window.requestAnimationFrame(() => {
      bookmarkContextNameInputRef.current?.focus();
      bookmarkContextNameInputRef.current?.select();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [bookmarkContextEditor]);

  useEffect(() => {
    if (!bookmarkFolderMenuOpen) return undefined;
    const updateAvailableHeight = () => {
      const bounds = bookmarkFolderTriggerRef.current?.getBoundingClientRect();
      if (!bounds) return;
      setBookmarkFolderMenuMaxHeight(Math.max(96, Math.floor(window.innerHeight - bounds.bottom - 8)));
    };
    updateAvailableHeight();
    window.addEventListener("resize", updateAvailableHeight);
    return () => window.removeEventListener("resize", updateAvailableHeight);
  }, [bookmarkFolderMenuOpen]);

  useEffect(() => {
    const scrollTargets = document.querySelectorAll(
      ".bookmark-sidebar-body, .article-page",
    );
    const timers = new Map();
    const markScrolling = (event) => {
      const target = event.currentTarget;
      target.classList.add("is-scrolling");
      window.clearTimeout(timers.get(target));
      timers.set(
        target,
        window.setTimeout(() => {
          target.classList.remove("is-scrolling");
          timers.delete(target);
        }, 520),
      );
    };
    scrollTargets.forEach((target) => target.addEventListener("scroll", markScrolling, {
      passive: true,
    }));
    return () => {
      scrollTargets.forEach((target) => {
        target.removeEventListener("scroll", markScrolling);
        window.clearTimeout(timers.get(target));
      });
    };
  }, [desktopMode]);

  useEffect(() => {
    if (!settingsMenuOpen || settingsMenuLevel !== "bookmark-import" || !browserApi?.listBookmarkSources) return;
    let active = true;
    setBookmarkSources([]);
    browserApi.listBookmarkSources().then((sources) => {
      if (!active) return;
      const nextSources = Array.isArray(sources) ? sources : [];
      setBookmarkSources(nextSources);
      setSelectedBookmarkSources(
        nextSources.filter((source) => source.available && source.readable).map((source) => source.id),
      );
    });
    return () => {
      active = false;
    };
  }, [browserApi, settingsMenuLevel, settingsMenuOpen]);

  useEffect(() => {
    if (settingsPanel !== "password-vault" || !browserApi?.listPasswords) return;
    let active = true;
    browserApi.listPasswords().then((entries) => {
      if (active) setPasswordEntries(Array.isArray(entries) ? entries : []);
    });
    return () => { active = false; };
  }, [browserApi, settingsPanel]);

  useEffect(() => {
    if (!(["about", "preferences"].includes(settingsPanel)
      || (settingsMenuOpen && settingsMenuLevel === "preferences"))
      || !browserApi?.getAppInfo) return;
    browserApi.getAppInfo().then(setAppInfo);
  }, [browserApi, settingsMenuLevel, settingsMenuOpen, settingsPanel]);

  useEffect(() => {
    if (!browserApi?.listModelProviders) return;
    browserApi.listModelProviders().then((providers) => {
      setModelProviders(Array.isArray(providers) ? providers : []);
    });
  }, [browserApi]);

  const showToast = (message) => {
    setToast(message);
    window.clearTimeout(window.__beanToast);
    window.__beanToast = window.setTimeout(() => setToast(""), 2200);
  };

  const updateBookmarkDraft = (changes) => {
    setBookmarkDraft((current) => ({ ...current, ...changes }));
    setBookmarkLibrary((library) => library.map((bookmark) => (
      bookmark.url === bookmarkDraft.url
        ? normalizeImportedBookmark({
            ...bookmark,
            ...changes,
            title: changes.title?.trim() || bookmark.title,
            updatedAt: Date.now(),
          })
        : bookmark
    )));
  };

  const openBookmarkEditor = () => {
    if (!currentPageUrl) return;
    const now = Date.now();
    const existing = currentBookmark;
    const title = existing?.title
      || navigationState.title
      || currentArticle?.title
      || currentArticle?.shortTitle
      || currentPageUrl;
    const bookmark = existing || normalizeImportedBookmark({
      createdAt: now,
      faviconUrl: navigationState.pageFaviconUrl || currentArticle?.faviconUrl || "",
      folder: "",
      manualOrder: null,
      source: "brizo",
      sourceOrder: bookmarkLibrary.length,
      title,
      updatedAt: now,
      url: currentPageUrl,
    });
    if (!existing) {
      setBookmarkLibrary((library) => [bookmark, ...library]);
      setBookmarkCelebrationUrl(currentPageUrl);
    }
    setBookmarkDraft({ folder: bookmark.folder || "", title: bookmark.title, url: bookmark.url });
    setBookmarkFolderMenuOpen(false);
    setBookmarkContextFolderMenuOpen(false);
    setBookmarkContextEditor(null);
    setDownloadsOpen(false);
    setSettingsMenuOpen(false);
    setBookmarkEditorOpen(true);
  };

  const removeCurrentBookmark = () => {
    const url = bookmarkDraft.url || currentPageUrl;
    setBookmarkLibrary((library) => library.filter((bookmark) => bookmark.url !== url));
    setBookmarkFolderMenuOpen(false);
    setBookmarkEditorOpen(false);
    showToast("已移除书签");
  };

  const closeBookmarkContextEditor = () => {
    setBookmarkContextFolderMenuOpen(false);
    setBookmarkContextEditor(null);
    setSidebarFoldersActive(false);
    setExpandedFolders(new Set());
  };

  const openBookmarkContextEditor = (event, item, options = {}) => {
    event.preventDefault();
    event.stopPropagation();
    const fromBar = Boolean(options.fromBar);
    const bounds = event.currentTarget.getBoundingClientRect();
    const panelWidth = 273;
    const panelHeight = 162;
    const left = Math.max(8, Math.min(bounds.left, window.innerWidth - panelWidth - 8));
    const top = Math.max(8, Math.min(bounds.bottom + 8, window.innerHeight - panelHeight - 8));
    const isFolder = item.type === "folder";
    setBookmarkDraft({ folder: "", title: "", url: "" });
    setBookmarkFolderMenuOpen(false);
    setBookmarkEditorOpen(false);
    setBookmarkContextFolderMenuOpen(false);
    setBookmarkContextDraft(isFolder ? {
      folder: parentFolderPath(item.path),
      title: folderNameFromPath(item.path),
    } : {
      folder: item.bookmark.folder || "",
      title: item.bookmark.title || item.bookmark.url,
    });
    setBookmarkContextEditor({
      ...item,
      left: Math.max(8, left),
      top,
    });
    if (isFolder && !fromBar) {
      setExpandedFolders((current) => new Set(
        [...current].filter((openPath) => item.path.startsWith(`${openPath} / `)),
      ));
    }
    if (!fromBar) {
      window.clearTimeout(sidebarCollapseTimer.current);
      setSidebarOpen(true);
      setSidebarFoldersActive(true);
    }
  };

  const saveBookmarkContextEditor = () => {
    if (!bookmarkContextEditor) return;
    const nextTitle = bookmarkContextDraft.title.trim();
    if (!nextTitle) {
      showToast("名称不能为空");
      bookmarkContextNameInputRef.current?.focus();
      return;
    }
    if (bookmarkContextEditor.type === "bookmark") {
      const url = bookmarkContextEditor.bookmark.url;
      setBookmarkLibrary((library) => library.map((bookmark) => (
        bookmark.url === url
          ? normalizeImportedBookmark({
              ...bookmark,
              folder: bookmarkContextDraft.folder,
              title: nextTitle,
              updatedAt: Date.now(),
            })
          : bookmark
      )));
      closeBookmarkContextEditor();
      showToast("书签已更新");
      return;
    }

    const sourcePath = bookmarkContextEditor.path;
    const sourceParent = parentFolderPath(sourcePath);
    const sourceName = folderNameFromPath(sourcePath);
    const destinationParent = bookmarkContextDraft.folder;
    if (destinationParent === sourcePath || destinationParent.startsWith(`${sourcePath} / `)) {
      showToast("文件夹不能移入自身或下级目录");
      return;
    }
    const destinationPath = destinationParent
      ? `${destinationParent} / ${nextTitle}`
      : nextTitle;
    const siblingNames = getDirectFolderNames(bookmarkLibrary, destinationParent, folderOrders);
    if (destinationPath !== sourcePath && siblingNames.includes(nextTitle)) {
      showToast(`此处已有名为“${nextTitle}”的文件夹`);
      return;
    }

    setBookmarkLibrary((library) => library.map((bookmark) => ({
      ...bookmark,
      folder: replaceFolderPrefix(bookmark.folder, sourcePath, destinationPath),
      updatedAt: Date.now(),
    })));
    setFolderOrders((current) => {
      const remapped = {};
      for (const [folderPath, order] of Object.entries(current)) {
        remapped[replaceFolderPrefix(folderPath, sourcePath, destinationPath)] = [...order];
      }
      const sourceOrder = [...(remapped[sourceParent] || [])]
        .filter((name) => name !== sourceName);
      remapped[sourceParent] = sourceOrder;
      const destinationOrder = sourceParent === destinationParent
        ? sourceOrder
        : [...(remapped[destinationParent] || [])].filter((name) => name !== nextTitle);
      const originalIndex = (current[sourceParent] || []).indexOf(sourceName);
      destinationOrder.splice(
        sourceParent === destinationParent && originalIndex >= 0
          ? Math.min(originalIndex, destinationOrder.length)
          : destinationOrder.length,
        0,
        nextTitle,
      );
      remapped[destinationParent] = destinationOrder;
      return remapped;
    });
    closeBookmarkContextEditor();
    showToast("文件夹已更新");
  };

  const removeBookmarkContextItem = () => {
    if (!bookmarkContextEditor) return;
    if (bookmarkContextEditor.type === "bookmark") {
      const url = bookmarkContextEditor.bookmark.url;
      setBookmarkLibrary((library) => library.filter((bookmark) => bookmark.url !== url));
      closeBookmarkContextEditor();
      showToast("已移除书签");
      return;
    }
    const sourcePath = bookmarkContextEditor.path;
    setBookmarkLibrary((library) => library.filter((bookmark) => (
      bookmark.folder !== sourcePath && !bookmark.folder.startsWith(`${sourcePath} / `)
    )));
    setFolderOrders((current) => Object.fromEntries(
      Object.entries(current).filter(([folderPath]) => (
        folderPath !== sourcePath && !folderPath.startsWith(`${sourcePath} / `)
      )),
    ));
    closeBookmarkContextEditor();
    showToast("已移除文件夹及其中内容");
  };

  const saveModelProvider = async (event) => {
    event.preventDefault();
    setModelProviderError("");
    if (!modelProviderDraft.id && !modelProviderDraft.apiKey.trim()) {
      setModelProviderError("请输入 API Key。");
      return;
    }
    setModelProviderSaving(true);
    try {
      if (!browserApi?.saveModelProvider) {
        setModelProviders((current) => {
          const makeDefault = current.length === 0 || modelProviderDraft.makeDefault;
          const id = modelProviderDraft.id || `preview-${Date.now()}`;
          const nextProvider = {
              id,
              name: modelProviderDraft.name.trim() || "自定义 API",
              baseUrl: modelProviderDraft.baseUrl.trim(),
              isDefault: makeDefault,
              keyMask: "********",
              models: [],
              selectedModel: "",
            };
          return [
            ...current
              .filter((provider) => provider.id !== id)
              .map((provider) => makeDefault ? { ...provider, isDefault: false } : provider),
            nextProvider,
          ];
        });
        setModelProviderDraft({ apiKey: "", baseUrl: "", id: "", makeDefault: false, name: "" });
        showToast("网页预览不会保存 API Key");
        return;
      }
      const result = await browserApi.saveModelProvider(modelProviderDraft);
      if (result?.status !== "saved") {
        setModelProviderError(result?.message || "API 配置保存失败。");
        return;
      }
      setModelProviders(result.providers || []);
      setModelProviderDraft({ apiKey: "", baseUrl: "", id: "", makeDefault: false, name: "" });
      showToast(result.message || "API 配置已安全保存");
    } finally {
      setModelProviderSaving(false);
    }
  };

  const editModelProvider = (provider) => {
    setModelProviderError("");
    setModelProviderDraft({
      apiKey: "",
      baseUrl: provider.baseUrl || "",
      id: provider.id,
      makeDefault: Boolean(provider.isDefault),
      name: provider.name || "",
    });
  };

  const cancelModelProviderEdit = () => {
    setModelProviderError("");
    setModelProviderDraft({ apiKey: "", baseUrl: "", id: "", makeDefault: false, name: "" });
  };

  const setDefaultModelProvider = async (id) => {
    if (browserApi?.setDefaultModelProvider) {
      setModelProviders(await browserApi.setDefaultModelProvider(id));
    } else {
      setModelProviders((current) => current.map((provider) => ({
        ...provider,
        isDefault: provider.id === id,
      })));
    }
  };

  const deleteModelProvider = async (id) => {
    if (browserApi?.deleteModelProvider) {
      setModelProviders(await browserApi.deleteModelProvider(id));
    } else {
      setModelProviders((current) => {
        const next = current.filter((provider) => provider.id !== id);
        return next.some((provider) => provider.isDefault) || !next.length
          ? next
          : next.map((provider, index) => ({ ...provider, isDefault: index === 0 }));
      });
    }
  };

  const defaultModelProvider = modelProviders.find((provider) => provider.isDefault)
    || modelProviders[0];
  const boundModels = useMemo(() => {
    const orderedProviders = defaultModelProvider
      ? [defaultModelProvider, ...modelProviders.filter((provider) => provider.id !== defaultModelProvider.id)]
      : modelProviders;
    return [...new Set(orderedProviders.flatMap((provider) => provider.models || []))];
  }, [defaultModelProvider, modelProviders]);
  const downloadGroups = useMemo(() => groupDownloads(downloads), [downloads]);
  const bookmarkManageFolders = useMemo(() => {
    const paths = new Set();
    bookmarkLibrary.forEach((bookmark) => {
      const parts = splitFolderPath(bookmark.folder);
      parts.forEach((_part, index) => paths.add(parts.slice(0, index + 1).join(" / ")));
    });
    return [...paths].sort((left, right) => left.localeCompare(right, "zh-CN"));
  }, [bookmarkLibrary]);
  const managedBookmarks = useMemo(() => {
    const needle = bookmarkManageQuery.trim().toLocaleLowerCase();
    return bookmarkLibrary
      .filter((bookmark) => needle
        ? [bookmark.title, bookmark.url, bookmark.folder]
          .some((value) => String(value || "").toLocaleLowerCase().includes(needle))
        : bookmark.folder === bookmarkManageFolder)
      .sort(compareBookmarks);
  }, [bookmarkLibrary, bookmarkManageFolder, bookmarkManageQuery]);
  const bookmarkManageChildFolders = useMemo(() => bookmarkManageQuery.trim()
    ? []
    : bookmarkManageFolders.filter((path) => parentFolderPath(path) === bookmarkManageFolder),
  [bookmarkManageFolder, bookmarkManageFolders, bookmarkManageQuery]);

  const openPdfInNewTab = (rawUrl, title = "PDF 文档", options = {}) => {
    const url = String(rawUrl || "").trim();
    if (!url) return;
    const filename = (() => {
      try {
        return decodeURIComponent(new URL(url).pathname.split("/").filter(Boolean).pop() || "") || title;
      } catch {
        return title;
      }
    })();
    const nextTab = {
      domain: "PDF",
      id: options.tabId || `pdf-tab-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      isPdf: true,
      shortTitle: filename || title,
      title: filename || title,
      url,
    };
    setTabs((currentTabs) => [...currentTabs, nextTab]);
    setActiveSurface("tab");
    setActiveTab(nextTab.id);
    addressEditing.current = false;
    addressValue.current = url;
    setAddressText(formatAddressForDisplay(url));
    if (browserApi?.navigatePdf && !options.alreadyNavigated) browserApi.navigatePdf(url, nextTab.id);
    else if (!browserApi) window.open(url, "_blank", "noopener,noreferrer");
  };

  const selectArticle = (article) => {
    setActiveSurface("tab");
    setActiveTab(article.id);
    addressEditing.current = false;
    addressValue.current = article.isNewTab ? "" : article.url;
    setAddressText(article.isNewTab ? "" : formatAddressForDisplay(article.url));
    if (browserApi && !article.isNewTab && !article.isBookmarksPage) {
      if (article.isPdf && browserApi.navigatePdf) browserApi.navigatePdf(article.url, article.id);
      else browserApi.navigate(article.url, article.id);
    } else if (!browserApi && !article.isNewTab && !article.isBookmarksPage) {
      showToast(`Opened ${article.domain}`);
    }
  };

  const restoreClosedTab = useCallback(() => {
    if (closedTabs.length === 0) {
      showToast("暂无可恢复的标签页");
      return;
    }
    const lastItem = closedTabs[closedTabs.length - 1];
    setClosedTabs((prev) => prev.slice(0, -1));
    const restoredTab = { ...lastItem.tab };

    setTabs((currentTabs) => {
      const targetIndex = Math.min(
        Math.max(0, lastItem.index ?? currentTabs.length),
        currentTabs.length
      );
      const nextTabs = [...currentTabs];
      nextTabs.splice(targetIndex, 0, restoredTab);
      return nextTabs;
    });

    selectArticle(restoredTab);
    showToast(`已恢复: ${restoredTab.shortTitle || restoredTab.title || "新标签页"}`);
  }, [closedTabs]);

  const closeAllTabs = () => {
    if (tabs.length === 0) return;
    setClosedTabs((prev) => [
      ...prev,
      ...tabs.map((tab, index) => ({ tab: { ...tab }, index })),
    ]);

    tabs.forEach((tab) => {
      browserApi?.closeTabView?.(tab.id);
    });

    const freshTab = {
      domain: "brizo",
      id: `new-tab-${Date.now()}`,
      isNewTab: true,
      isPinned: false,
      useTodayGreeting: false,
      shortTitle: "新标签页",
      title: "新标签页",
      url: "",
    };
    setTabs([freshTab]);
    setActiveSurface("tab");
    setActiveTab(freshTab.id);
    addressEditing.current = false;
    addressValue.current = "";
    setAddressText("");
    showToast("已清空全部标签页");
  };

  const openHistoryItemInTab = (item) => {
    setSidebarHistoryOpen(false);
    if (newTabOpen && !tabs.find((t) => t.id === activeTab)?.url) {
      navigateFromAddress(item.url);
    } else {
      openUrlInNewTab(item.url, item.title || item.url);
    }
  };

  useEffect(() => {
    const handleUndoTabShortcut = (event) => {
      if ((event.metaKey || event.ctrlKey) && event.shiftKey && (event.key === "T" || event.key === "t")) {
        event.preventDefault();
        restoreClosedTab();
      }
    };
    window.addEventListener("keydown", handleUndoTabShortcut);
    return () => window.removeEventListener("keydown", handleUndoTabShortcut);
  }, [restoreClosedTab]);

  const openBookmarkOrganizerPage = () => {
    const existing = tabs.find((tab) => tab.isBookmarksPage);
    const tabId = existing?.id || `bookmarks-tab-${Date.now()}`;
    if (!existing) {
      setTabs((currentTabs) => [...currentTabs, {
        domain: "brizo",
        id: tabId,
        isBookmarksPage: true,
        shortTitle: "收藏夹",
        title: "收藏夹",
        url: "brizo://bookmarks",
      }]);
    }
    setActiveSurface("tab");
    setActiveTab(tabId);
    setSettingsMenuOpen(false);
    setSettingsMenuLevel("root");
    setSettingsPanel("");
    addressEditing.current = false;
    addressValue.current = "brizo://bookmarks";
    setAddressText("brizo://bookmarks");
  };

  const openUrlInNewTab = (rawUrl, title = "网页") => {
    const url = String(rawUrl || "").trim();
    if (!url) return;
    if (looksLikePdfInput(url)) {
      openPdfInNewTab(url, title || "PDF 文档");
      return;
    }
    let domain = url;
    try { domain = new URL(url).hostname.replace(/^www\./i, ""); } catch { /* Keep the URL label. */ }
    const nextTab = {
      domain,
      id: `brief-source-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      shortTitle: title || domain,
      title: title || domain,
      url,
    };
    setTabs((currentTabs) => [...currentTabs, nextTab]);
    setActiveSurface("tab");
    setActiveTab(nextTab.id);
    addressEditing.current = false;
    addressValue.current = url;
    setAddressText(formatAddressForDisplay(url));
    if (browserApi) browserApi.navigate(url, nextTab.id);
    else window.open(url, "_blank", "noopener,noreferrer");
  };

  const leaveNewTabMode = (destination) => {
    let domain = destination;
    try {
      domain = new URL(
        destination.match(/^https?:\/\//i) ? destination : `https://${destination}`,
      ).hostname.replace(/^www\./i, "");
    } catch {
      // Keep the entered destination as the temporary tab label.
    }
    setTabs((currentTabs) => currentTabs.map((tab) => tab.id === activeTab ? {
      ...tab,
      domain,
      isNewTab: false,
      shortTitle: destination,
      title: destination,
      url: destination,
    } : tab));
  };

  const navigateFromAddress = (rawAddress) => {
    const nextAddress = rawAddress.trim();
    if (!nextAddress) return;
    if (looksLikePdfInput(nextAddress)) {
      setAddressFocused(false);
      openPdfInNewTab(nextAddress);
      return;
    }
    if (briefOpen) {
      setAddressFocused(false);
      openUrlInNewTab(nextAddress, nextAddress);
      return;
    }
    addressValue.current = nextAddress;
    setAddressFocused(false);
    addressEditing.current = false;
    setAddressText(formatAddressForDisplay(nextAddress));
    if (newTabOpen) leaveNewTabMode(nextAddress);
    if (bookmarksPageOpen) {
      let domain = nextAddress;
      try {
        domain = new URL(nextAddress.match(/^https?:\/\//i) ? nextAddress : `https://${nextAddress}`)
          .hostname.replace(/^www\./i, "");
      } catch {
        // Keep the entered destination as the temporary tab label.
      }
      setTabs((currentTabs) => currentTabs.map((tab) => tab.id === activeTab ? {
        ...tab,
        domain,
        isBookmarksPage: false,
        shortTitle: nextAddress,
        title: nextAddress,
        url: nextAddress,
      } : tab));
    }
    if (browserApi) {
      browserApi.navigate(nextAddress, activeTab);
    } else {
      showToast(`Navigated to ${nextAddress}`);
    }
  };

  const exploreFromAddress = (rawQuery) => {
    const searchQuery = rawQuery.trim();
    if (!searchQuery) return;
    const nextTab = {
      domain: "brizo",
      id: `explore-tab-${Date.now()}`,
      initialPrompt: searchQuery,
      isNewTab: true,
      shortTitle: `搜索: ${searchQuery}`,
      title: `搜索: ${searchQuery}`,
      url: "",
      useTodayGreeting: false,
    };
    setAddressFocused(false);
    addressEditing.current = false;
    addressValue.current = "";
    setAddressText("");
    setTabs((currentTabs) => [nextTab, ...currentTabs]);
    setActiveSurface("tab");
    setActiveTab(nextTab.id);
  };

  const submitAddressValue = (value) => {
    const sharedQuery = queryFromSearchShareUrl(value);
    if (sharedQuery) exploreFromAddress(sharedQuery);
    else if (looksLikeWebsiteInput(value)) navigateFromAddress(value);
    else exploreFromAddress(value);
  };

  const submitAddress = (event) => {
    event.preventDefault();
    submitAddressValue(addressValue.current);
  };

  const saveCompletedSearch = ({ query: completedQuery, result }) => {
    const snapshot = createSearchHistorySnapshot(result);
    if (!snapshot) return;
    setSearchHistory((current) => {
      const existing = current.find((item) => item.query === completedQuery);
      return persistSearchHistory([
        { ...existing, query: completedQuery, result: snapshot, updatedAt: Date.now() },
        ...current.filter((item) => item.query !== completedQuery),
      ]);
    });
  };

  const submitNewTabPrompt = async ({ attachments, contextTab, depth, model, searchId, tabId, thread, value }) => {
    const looksLikeDestination = looksLikeWebsiteInput(value);

    if (looksLikeDestination) {
      if (looksLikePdfInput(value)) {
        openPdfInNewTab(value);
        return { status: "navigated" };
      }
      leaveNewTabMode(value);
      addressValue.current = value;
      setAddressText(formatAddressForDisplay(value));
      if (browserApi) browserApi.navigate(value, tabId);
      else showToast(`Navigated to ${value}`);
      return { status: "navigated" };
    }

    setSearchHistory((current) => {
      const now = Date.now();
      const existing = current.find((item) => item.query === value);
      return persistSearchHistory([
        { ...existing, query: value, count: (existing?.count || 0) + 1, updatedAt: now },
        ...current.filter((item) => item.query !== value),
      ]);
    });

    const searchTitle = `搜索: ${value}`;
    setTabs((currentTabs) => currentTabs.map((tab) => tab.id === tabId ? {
      ...tab,
      searchQuery: value,
      shortTitle: searchTitle,
      title: searchTitle,
    } : tab));
    setQuery(value);
    const contextCount = attachments.length + (contextTab ? 1 : 0);
    if (contextCount) {
      showToast(`${model} · 已加入 ${contextCount} 项上下文`);
    }

    let result;
    if (browserApi?.startSearch) {
      result = await browserApi.startSearch({
        context: {
          attachmentNames: attachments.map((file) => file.name).slice(0, 8),
          tab: contextTab ? { id: contextTab.id, title: contextTab.title, url: contextTab.url } : null,
        },
        depth,
        model,
        query: value,
        searchId,
        thread,
      });
    } else {
      await new Promise((resolve) => window.setTimeout(resolve, 420));
      result = {
        status: "preview",
        message: "这是 Brizo Scout AI 的浏览器预览状态。桌面版会并行检索真实网页、融合排序，并流式生成带编号引用和延伸问题的答案；当前网页预览不会发起搜索，也不会伪造来源。",
        sources: [],
      };
    }

    return result;
  };

  const submitNewTabUse = async ({ command, executeInPlace, sessionId, tabId }) => {
    const value = String(command || "").trim();
    if (!value) return { status: "error", message: "请输入 Use 指令。", sources: [] };
    if (!executeInPlace) {
      const nextTab = {
        domain: "brizo",
        id: `use-tab-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        initialMode: "use",
        initialUseCommand: value,
        isNewTab: true,
        shortTitle: "沙箱操作中",
        title: "沙箱操作中",
        url: "",
        useExecutionSpace: true,
        useTodayGreeting: false,
      };
      setTabs((currentTabs) => [nextTab, ...currentTabs]);
      setActiveSurface("tab");
      setActiveTab(nextTab.id);
      addressEditing.current = false;
      addressValue.current = "";
      setAddressText("");
      return { status: "delegated" };
    }

    if (!browserApi?.runBrizoUseCommand) {
      return {
        status: "error",
        message: "Use 需要 Brizo 桌面版的独立浏览器沙箱，网页预览不会模拟浏览器操作。",
        sources: [],
      };
    }
    setTabs((currentTabs) => currentTabs.map((tab) => tab.id === tabId ? {
      ...tab,
      shortTitle: "沙箱操作中",
      title: "沙箱操作中",
    } : tab));
    const result = await browserApi.runBrizoUseCommand({ command: value, sessionId });
    const completedTitle = `Use: ${value}`;
    setTabs((currentTabs) => currentTabs.map((tab) => tab.id === tabId ? {
      ...tab,
      shortTitle: completedTitle,
      title: completedTitle,
    } : tab));
    return result;
  };

  const restoreSearchHistoryTab = ({ query: restoredQuery, tabId }) => {
    const searchTitle = `搜索: ${restoredQuery}`;
    setTabs((currentTabs) => currentTabs.map((tab) => tab.id === tabId ? {
      ...tab,
      searchQuery: restoredQuery,
      shortTitle: searchTitle,
      title: searchTitle,
    } : tab));
    setQuery(restoredQuery);
  };

  const openNewTabSource = (url) => {
    if (!url) return;
    let domain = url;
    try { domain = new URL(url).hostname.replace(/^www\./i, ""); } catch { /* Keep the URL label. */ }
    setTabs((currentTabs) => currentTabs.map((tab) => tab.id === activeTab ? {
      ...tab,
      domain,
      hasNewTabSession: true,
      isNewTab: false,
      newTabSessionShortTitle: tab.shortTitle,
      newTabSessionTitle: tab.title,
      returnToNewTab: true,
      shortTitle: domain || url,
      title: domain || url,
      url,
    } : tab));
    addressValue.current = url;
    setAddressText(formatAddressForDisplay(url));
    if (browserApi) browserApi.navigate(url, activeTab);
    else window.open(url, "_blank", "noopener,noreferrer");
  };

  const restoreNewTabSession = () => {
    if (!currentArticle?.returnToNewTab) return false;
    const tabId = currentArticle.id;
    browserApi?.closeTabView?.(tabId);
    setTabs((currentTabs) => currentTabs.map((tab) => {
      if (tab.id !== tabId) return tab;
      const fallbackTitle = tab.searchQuery ? `搜索: ${tab.searchQuery}` : "新标签页";
      return {
        ...tab,
        domain: "brizo",
        faviconUrl: "",
        isNewTab: true,
        loadError: false,
        returnToNewTab: false,
        shortTitle: tab.newTabSessionShortTitle || fallbackTitle,
        title: tab.newTabSessionTitle || fallbackTitle,
        url: "",
      };
    }));
    addressEditing.current = false;
    addressValue.current = "";
    setAddressFocused(false);
    setAddressText("");
    return true;
  };

  const navigateBack = () => {
    if (restoreNewTabSession()) return;
    if (desktopMode) browserApi.back();
    else showToast("Back");
  };

  const submitSearch = (event) => {
    event.preventDefault();
    setAiOpen(true);
  };

  const exportArticlePdf = async () => {
    if (!browserApi?.exportArticlePdf) {
      showToast("PDF export is available in the desktop app");
      return;
    }

    setPdfExporting(true);
    try {
      const result = await browserApi.exportArticlePdf();
      if (result?.status === "saved") {
        showToast("Clean article PDF saved");
      } else if (result?.status === "error") {
        showToast(result.message || "Could not create PDF");
      }
    } catch {
      showToast("Could not create PDF");
    } finally {
      setPdfExporting(false);
    }
  };

  const downloadCurrentPdf = async () => {
    if (!browserApi?.downloadCurrentPdf) {
      showToast("PDF 下载仅在桌面版可用");
      return;
    }
    setPdfExporting(true);
    try {
      const result = await browserApi.downloadCurrentPdf();
      if (result?.status === "saved") showToast("PDF 已保存");
      else if (result?.status === "error") showToast(result.message || "PDF 下载失败");
    } catch {
      showToast("PDF 下载失败");
    } finally {
      setPdfExporting(false);
    }
  };

  const openSettingsPanel = (panel) => {
    setSettingsMenuOpen(false);
    setSettingsPanel(panel);
  };

  const updatePageZoom = (nextValue) => {
    const next = Math.min(2, Math.max(0.5, Math.round(Number(nextValue) * 10) / 10));
    setPageZoom(next);
    showToast(`页面缩放 ${Math.round(next * 100)}%`);
  };

  const removeBrowserHistoryItem = (url) => {
    setBrowserHistory((current) => {
      const next = current.filter((item) => item.url !== url);
      localStorage.setItem("bean:browser-history", JSON.stringify(next));
      return next;
    });
  };

  const removeSearchHistoryItem = (queryValue) => {
    setSearchHistory((current) => {
      const next = current.filter((item) => item.query !== queryValue);
      localStorage.setItem("bean:search-history", JSON.stringify(next));
      return next;
    });
  };

  const openSearchHistoryItem = (item) => {
    const tabId = `history-tab-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const nextTab = {
      domain: "brizo",
      id: tabId,
      isNewTab: true,
      prefillPrompt: item.result ? "" : item.query,
      restoredResult: item.result ? { query: item.query, result: item.result } : null,
      searchQuery: item.query,
      shortTitle: `搜索: ${item.query}`,
      title: `搜索: ${item.query}`,
      url: "",
      useTodayGreeting: false,
    };
    setTabs((current) => [nextTab, ...current]);
    setActiveSurface("tab");
    setActiveTab(tabId);
    setSettingsPanel("");
    addressValue.current = "";
    setAddressText("");
  };

  const removeManagedBookmark = (url) => {
    setBookmarkLibrary((current) => current.filter((bookmark) => bookmark.url !== url));
    if (bookmarkManageDraft?.url === url) setBookmarkManageDraft(null);
  };

  const removeManagedBookmarks = (urls) => {
    const targets = new Set(urls);
    setBookmarkLibrary((current) => current.filter((bookmark) => !targets.has(bookmark.url)));
    setBookmarkManageSelection(new Set());
    setBookmarkManageContext(null);
    showToast(`已删除 ${targets.size} 项`);
  };

  const copyManagedBookmarks = async (urls) => {
    const targets = new Set(urls);
    const text = bookmarkLibrary
      .filter((bookmark) => targets.has(bookmark.url))
      .map((bookmark) => `${bookmark.title}\n${bookmark.url}`)
      .join("\n\n");
    if (!text) return;
    await navigator.clipboard?.writeText(text);
    setBookmarkManageContext(null);
    showToast(`已复制 ${targets.size} 项`);
  };

  const saveManagedBookmark = () => {
    if (!bookmarkManageDraft?.url?.trim() || !bookmarkManageDraft.title.trim()) return;
    setBookmarkLibrary((current) => current.map((bookmark) => bookmark.url === bookmarkManageDraft.originalUrl
      ? {
          ...bookmark,
          folder: normalizeImportedBookmarkFolder(bookmarkManageDraft.folder),
          title: bookmarkManageDraft.title.trim(),
          url: bookmarkManageDraft.url.trim(),
          updatedAt: Date.now(),
        }
      : bookmark));
    setBookmarkManageDraft(null);
    showToast("收藏夹已更新");
  };

  const dropManagedItem = (target) => {
    if (!bookmarkManageDragItem) return;
    if (bookmarkManageDragItem.type === "folder") {
      const folderTarget = target.type === "folder"
        ? { type: "folder", path: target.path }
        : { type: "folder", path: target.folder };
      moveBookmarkFolder(bookmarkManageDragItem, folderTarget, target.position || "inside");
    } else {
      moveBookmarkItem(
        bookmarkManageDragItem,
        target.type === "folder"
          ? { type: "folder", path: target.path }
          : { type: "bookmark", url: target.url, folder: target.folder },
        target.type === "folder" ? "inside" : "before",
      );
    }
    setBookmarkManageFolder(target.type === "folder"
      ? (target.position && target.position !== "inside" ? parentFolderPath(target.path) : target.path)
      : target.folder);
    setBookmarkManageDragItem(null);
  };

  const savePasswordDraft = async (event) => {
    event?.preventDefault?.();
    if (!passwordDraft || passwordSaving) return;
    setPasswordSaving(true);
    setPasswordError("");
    try {
      const result = await browserApi?.savePassword?.(passwordDraft);
      if (result?.status !== "saved") {
        setPasswordError(result?.message || "密码保存失败。");
        return;
      }
      setPasswordEntries(Array.isArray(result.entries) ? result.entries : []);
      setPasswordDraft(null);
      showToast("密码已安全保存");
    } catch {
      setPasswordError("密码保存失败。");
    } finally {
      setPasswordSaving(false);
    }
  };

  const deletePasswordEntry = async (id) => {
    const entries = await browserApi?.deletePassword?.(id);
    if (Array.isArray(entries)) setPasswordEntries(entries);
    if (passwordDraft?.id === id) setPasswordDraft(null);
  };

  const copySavedPassword = async (id) => {
    const copied = await browserApi?.copyPassword?.(id);
    showToast(copied ? "密码已复制" : "无法复制密码");
  };

  const openDownloadsFromSettings = () => {
    setDownloadsOpen(false);
    setSettingsMenuLevel((level) => level === "downloads" ? "root" : "downloads");
  };

  const backToSettingsMenu = () => {
    setSettingsPanel("");
    setSettingsMenuOpen(true);
  };

  const chooseDownloadLocation = async () => {
    const result = await browserApi?.chooseDownloadDirectory?.();
    if (result?.path) {
      setAppPreferences((current) => ({ ...current, downloadLocation: result.path }));
      showToast("下载位置已更新");
    }
  };

  const openDownloadsDirectory = async () => {
    const result = await browserApi?.openDownloadsDirectory?.();
    if (result && !result.opened) showToast("无法打开下载目录");
  };

  const handleDownloadAction = async (action, download) => {
    if (!download?.id) return;
    let result;
    if (action === "pause" || action === "resume") {
      result = await browserApi?.setDownloadPaused?.(download.id, action === "pause");
    } else if (action === "cancel") {
      result = await browserApi?.cancelDownload?.(download.id);
    } else if (action === "open") {
      result = await browserApi?.openDownloadedFile?.(download.id);
    } else if (action === "delete") {
      result = await browserApi?.deleteDownloadedFile?.(download.id);
    }
    if (result?.status === "unavailable" || result?.status === "failed") {
      showToast("此下载项目当前不可用");
    }
  };

  const addImportedBookmarks = (bookmarks) => {
    const incoming = Array.isArray(bookmarks)
      ? bookmarks.map(normalizeImportedBookmark)
      : [];
    const existingUrls = new Set(bookmarkLibrary.map((bookmark) => bookmark.url));
    const fresh = incoming.filter((bookmark) => bookmark?.url && !existingUrls.has(bookmark.url));
    const incomingByUrl = new Map(
      incoming.filter((bookmark) => bookmark?.url).map((bookmark) => [bookmark.url, bookmark]),
    );
    const enrichedExisting = bookmarkLibrary.map((bookmark) => {
      const imported = incomingByUrl.get(bookmark.url);
      if (!imported) return bookmark;
      return normalizeImportedBookmark({
        ...bookmark,
        createdAt: imported.createdAt || bookmark.createdAt,
        faviconUrl: imported.faviconUrl || bookmark.faviconUrl,
        source: imported.source || bookmark.source,
        sourceOrder: imported.sourceOrder,
        updatedAt: Math.max(imported.updatedAt || 0, bookmark.updatedAt || 0),
      });
    });
    const nextLibrary = [...enrichedExisting, ...fresh].slice(0, 5_000);
    setBookmarkLibrary(nextLibrary);

    try {
      window.localStorage.setItem(
        "bean:bookmark-library",
        JSON.stringify(nextLibrary),
      );
    } catch {
      // The in-memory import still succeeds if local storage is unavailable.
    }

    setExpandedFolders((current) => {
      const next = new Set(current);
      for (const bookmark of fresh) {
        const parts = String(bookmark.folder || "")
          .split("/")
          .map((part) => part.trim())
          .filter(Boolean);
        if (parts[0]) next.add(parts[0]);
      }
      return next;
    });
    return fresh.length;
  };

  const importFromBrowsers = async () => {
    if (!browserApi?.importBookmarks || selectedBookmarkSources.length === 0) return;
    setBookmarkImporting(true);
    try {
      const result = await browserApi.importBookmarks(selectedBookmarkSources);
      const count = addImportedBookmarks(result?.bookmarks);
      if (count) {
        setSettingsMenuOpen(false);
        setSettingsMenuLevel("root");
      }
      showToast(
        count
          ? `${count} bookmarks imported`
          : result?.errors?.length
            ? `Could not read ${result.errors.join(", ")}`
            : "No new bookmarks found",
      );
    } catch {
      showToast("Bookmark import failed");
    } finally {
      setBookmarkImporting(false);
    }
  };

  const importFromHtml = async () => {
    if (!browserApi?.importBookmarksFromHtml) return;
    setBookmarkImporting(true);
    try {
      const result = await browserApi.importBookmarksFromHtml();
      if (result?.canceled) return;
      const count = addImportedBookmarks(result?.bookmarks);
      if (count) {
        setSettingsMenuOpen(false);
        setSettingsMenuLevel("root");
      }
      showToast(count ? `${count} bookmarks imported` : "No new bookmarks found");
    } catch {
      showToast("Bookmark import failed");
    } finally {
      setBookmarkImporting(false);
    }
  };

  const printCurrentPage = async () => {
    setSettingsMenuOpen(false);
    if (!browserApi?.print) {
      showToast("Printing is available in the desktop app");
      return;
    }
    const result = await browserApi.print();
    if (result?.status === "error" && result.message !== "cancelled") {
      showToast(result.message || "Printing failed");
    }
  };

  const captureScreenshot = async (mode) => {
    setSettingsPanel("");
    setSettingsMenuOpen(false);
    if (!browserApi?.captureScreenshot) {
      showToast("Screenshots are available in the desktop app");
      return;
    }
    browserApi.setVisible(true);
    await new Promise((resolve) => window.setTimeout(resolve, 180));
    const result = await browserApi.captureScreenshot(mode);
    if (result?.status === "saved") {
      showToast("Screenshot saved");
    } else if (result?.status === "error") {
      showToast(result.message || "Screenshot failed");
    }
  };

  const saveAccountProfile = (event) => {
    event.preventDefault();
    const nextProfile = {
      email: accountDraft.email.trim(),
      name: accountDraft.name.trim() || "Alex",
    };
    setAccountProfile(nextProfile);
    window.localStorage.setItem("bean:account-profile", JSON.stringify(nextProfile));
    setSettingsPanel("");
    showToast("Account updated");
  };

  const toggleBookmarkFolder = (folderPath, forceOpen = false) => {
    setExpandedFolders((current) => {
      if (forceOpen) {
        if (!folderPath) return new Set();
        const next = new Set(
          [...current].filter((openPath) =>
            folderPath === openPath || folderPath.startsWith(`${openPath} /`),
          ),
        );
        next.add(folderPath);
        return next;
      }
      const next = new Set(current);
      if (next.has(folderPath)) next.delete(folderPath);
      else next.add(folderPath);
      return next;
    });
  };

  const keepBookmarkCascadeOpen = () => {
    window.clearTimeout(sidebarCollapseTimer.current);
  };

  const scheduleBookmarkCascadeClose = (event) => {
    if (bookmarkContextEditor) return;
    // React portals place deeper flyouts outside the sidebar in the DOM. Moving
    // between two cascade levels is still inside the same visual interaction,
    // so never arm a close timer for that short pointer transition.
    if (event?.relatedTarget?.closest?.(".spaces-panel, .bookmark-folder-flyout")) {
      window.clearTimeout(sidebarCollapseTimer.current);
      return;
    }
    window.clearTimeout(sidebarActivationTimer.current);
    window.clearTimeout(sidebarCollapseTimer.current);
    sidebarCollapseTimer.current = window.setTimeout(() => {
      setSidebarFoldersActive(false);
      setSidebarOpen(false);
      setExpandedFolders(new Set());
    }, BOOKMARK_CASCADE_EXIT_DELAY_MS);
  };

  const handleBookmarkDragStart = (event, item) => {
    bookmarkDragJustEnded.current = false;
    setDragItem(item);
    setDropTarget(null);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("application/x-bean-bookmark", JSON.stringify(item));
    event.dataTransfer.setData("text/plain", item.title || item.path || item.url || "");
  };

  const handleBookmarkDragEnd = () => {
    bookmarkDragJustEnded.current = true;
    setDragItem(null);
    setDropTarget(null);
    window.setTimeout(() => {
      bookmarkDragJustEnded.current = false;
    }, 0);
  };

  const handleBookmarkDragOver = (event, target) => {
    if (!dragItem) return;
    if (dragItem.type === "folder") {
      if (target.type !== "folder" || target.path === dragItem.path) return;
      if (target.path.startsWith(`${dragItem.path} / `)) return;
    }
    if (dragItem.type === "bookmark" && target.type === "bookmark" && target.url === dragItem.url) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "move";
    const bounds = event.currentTarget.getBoundingClientRect();
    const ratio = bounds.height
      ? (event.clientY - bounds.top) / bounds.height
      : 0.5;
    let position = ratio < 0.5 ? "before" : "after";
    if (target.type === "folder") {
      if (dragItem.type === "bookmark") position = "inside";
      else if (ratio >= 0.25 && ratio <= 0.75) position = "inside";
    }
    setDropTarget({ ...target, position });
  };

  const handleHorizontalBookmarkDragOver = (event, target) => {
    if (!dragItem) return;
    if (dragItem.type === "folder") {
      if (target.type !== "folder" || target.path === dragItem.path) return;
      if (target.path.startsWith(`${dragItem.path} / `)) return;
    }
    if (dragItem.type === "bookmark" && target.type === "bookmark" && target.url === dragItem.url) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "move";
    const bounds = event.currentTarget.getBoundingClientRect();
    const ratio = bounds.width
      ? (event.clientX - bounds.left) / bounds.width
      : 0.5;
    let position = ratio < 0.5 ? "before" : "after";
    if (target.type === "folder") {
      if (ratio < 0.25) position = "before";
      else if (ratio > 0.75) position = "after";
      else position = "inside";
    }
    setDropTarget({ ...target, position });
  };

  const moveBookmarkItem = (item, target, position) => {
    const moving = bookmarkLibrary.find((bookmark) => bookmark.url === item.url);
    if (!moving) return;
    const destinationFolder = target.type === "folder"
      ? (position === "inside" ? target.path : parentFolderPath(target.path))
      : target.folder;
    if (destinationFolder == null) return;

    const sourceFolder = moving.folder;
    const destinationItems = bookmarkLibrary
      .filter((bookmark) => bookmark.folder === destinationFolder && bookmark.url !== moving.url)
      .sort(compareBookmarks);
    let insertionIndex = 0;
    if (target.type === "bookmark") {
      const targetIndex = destinationItems.findIndex((bookmark) => bookmark.url === target.url);
      insertionIndex = targetIndex < 0
        ? destinationItems.length
        : targetIndex + (position === "after" ? 1 : 0);
    }
    destinationItems.splice(insertionIndex, 0, {
      ...moving,
      folder: destinationFolder,
      updatedAt: Date.now(),
    });

    const destinationRanks = new Map(
      destinationItems.map((bookmark, index) => [bookmark.url, index]),
    );
    const sourceItems = sourceFolder === destinationFolder
      ? []
      : bookmarkLibrary
        .filter((bookmark) => bookmark.folder === sourceFolder && bookmark.url !== moving.url)
        .sort(compareBookmarks);
    const sourceRanks = new Map(
      sourceItems.map((bookmark, index) => [bookmark.url, index]),
    );

    setBookmarkLibrary((current) => current.map((bookmark) => {
      if (bookmark.url === moving.url) {
        return normalizeImportedBookmark({
          ...bookmark,
          folder: destinationFolder,
          manualOrder: destinationRanks.get(bookmark.url),
          updatedAt: Date.now(),
        });
      }
      if (bookmark.folder === destinationFolder && destinationRanks.has(bookmark.url)) {
        return { ...bookmark, manualOrder: destinationRanks.get(bookmark.url) };
      }
      if (sourceFolder !== destinationFolder
        && bookmark.folder === sourceFolder
        && sourceRanks.has(bookmark.url)) {
        return { ...bookmark, manualOrder: sourceRanks.get(bookmark.url) };
      }
      return bookmark;
    }));
    setExpandedFolders((current) => new Set(current).add(destinationFolder));
    showToast("Bookmark moved");
  };

  const moveBookmarkFolder = (item, target, position) => {
    const sourcePath = item.path;
    const sourceName = folderNameFromPath(sourcePath);
    const sourceParent = parentFolderPath(sourcePath);
    const destinationParent = position === "inside"
      ? target.path
      : parentFolderPath(target.path);
    if (
      !sourceName
      || destinationParent === sourcePath
      || destinationParent.startsWith(`${sourcePath} / `)
    ) return;

    const destinationPath = destinationParent
      ? `${destinationParent} / ${sourceName}`
      : sourceName;
    const destinationSiblings = getDirectFolderNames(
      bookmarkLibrary,
      destinationParent,
      folderOrders,
    );
    if (destinationPath !== sourcePath && destinationSiblings.includes(sourceName)) {
      showToast(`A folder named “${sourceName}” already exists here`);
      return;
    }

    const sourceSiblings = getDirectFolderNames(
      bookmarkLibrary,
      sourceParent,
      folderOrders,
    ).filter((name) => name !== sourceName);
    const nextDestinationSiblings = sourceParent === destinationParent
      ? [...sourceSiblings]
      : destinationSiblings.filter((name) => name !== sourceName);
    if (position === "inside") {
      nextDestinationSiblings.push(sourceName);
    } else {
      const targetName = folderNameFromPath(target.path);
      const targetIndex = nextDestinationSiblings.indexOf(targetName);
      const insertionIndex = targetIndex < 0
        ? nextDestinationSiblings.length
        : targetIndex + (position === "after" ? 1 : 0);
      nextDestinationSiblings.splice(insertionIndex, 0, sourceName);
    }

    setBookmarkLibrary((current) => current.map((bookmark) => ({
      ...bookmark,
      folder: replaceFolderPrefix(bookmark.folder, sourcePath, destinationPath),
    })));
    setFolderOrders((current) => {
      const remapped = {};
      for (const [folderPath, order] of Object.entries(current)) {
        remapped[replaceFolderPrefix(folderPath, sourcePath, destinationPath)] = order;
      }
      remapped[sourceParent] = sourceSiblings;
      remapped[destinationParent] = nextDestinationSiblings;
      return remapped;
    });
    setExpandedFolders((current) => {
      const next = new Set();
      for (const folderPath of current) {
        next.add(replaceFolderPrefix(folderPath, sourcePath, destinationPath));
      }
      if (destinationParent) next.add(destinationParent);
      return next;
    });
    showToast("Folder moved");
  };

  const handleBookmarkDrop = (event, target) => {
    event.preventDefault();
    event.stopPropagation();
    let item = dragItem;
    if (!item) {
      try {
        item = JSON.parse(event.dataTransfer.getData("application/x-bean-bookmark"));
      } catch {
        item = null;
      }
    }
    if (!item) return;
    const position = dropTarget?.key === target.key
      ? dropTarget.position
      : target.type === "folder" ? "inside" : "before";
    if (item.type === "folder") moveBookmarkFolder(item, target, position);
    else moveBookmarkItem(item, target, position);
    handleBookmarkDragEnd();
  };

  const openBookmark = (bookmark) => {
    if (bookmarkDragJustEnded.current) return;
    setExpandedFolders(new Set());
    setBrowserPreview("");
    browserApi?.setVisible(true);
    const existingTab = tabs.find((tab) => tab.url === bookmark.url);
    if (existingTab) {
      selectArticle(existingTab);
      return;
    }

    let domain = bookmark.url;
    try {
      domain = new URL(bookmark.url).hostname.replace(/^www\./i, "");
    } catch {
      // Keep the URL if parsing fails.
    }
    const nextTab = {
      domain,
      id: `bookmark-tab-${Date.now()}`,
      shortTitle: bookmark.title,
      title: bookmark.title,
      url: bookmark.url,
    };
    setTabs((currentTabs) => [...currentTabs, nextTab]);
    selectArticle(nextTab);
  };

  const closeTab = (tabId) => {
    const closingIndex = tabs.findIndex((tab) => tab.id === tabId);
    if (closingIndex < 0 || tabs.length === 1) return;

    const closingTab = tabs[closingIndex];
    setClosedTabs((prev) => [...prev, { tab: { ...closingTab }, index: closingIndex }]);

    const nextTabs = tabs.filter((tab) => tab.id !== tabId);
    browserApi?.closeTabView?.(tabId);
    setTabs(nextTabs);
    if (tabId !== activeTab) return;

    const nextArticle = nextTabs[Math.min(closingIndex, nextTabs.length - 1)];
    if (briefOpen) {
      setActiveTab(nextArticle.id);
      return;
    }
    selectArticle(nextArticle);
  };

  const moveTabBefore = (draggedId, targetId) => {
    if (!draggedId || !targetId || draggedId === targetId) return;
    setTabs((currentTabs) => {
      const draggedIndex = currentTabs.findIndex((tab) => tab.id === draggedId);
      const targetIndex = currentTabs.findIndex((tab) => tab.id === targetId);
      if (draggedIndex < 0 || targetIndex < 0) return currentTabs;
      const nextTabs = [...currentTabs];
      const [draggedTab] = nextTabs.splice(draggedIndex, 1);
      nextTabs.splice(targetIndex, 0, draggedTab);
      return nextTabs;
    });
  };

  const openNewTab = () => {
    const nextTab = {
      domain: "brizo",
      id: `new-tab-${Date.now()}`,
      isNewTab: true,
      isPinned: false,
      useTodayGreeting: false,
      shortTitle: "新标签页",
      title: "新标签页",
      url: "",
    };
    setTabs((currentTabs) => [nextTab, ...currentTabs]);
    selectArticle(nextTab);
  };

  const openBrief = () => {
    const shouldRefreshAgain = activeSurface === "brief";
    setActiveSurface("brief");
    setAddressFocused(false);
    addressEditing.current = false;
    addressValue.current = "";
    setAddressText("");
    setSettingsMenuOpen(false);
    setSettingsPanel("");
    if (shouldRefreshAgain) void refreshBrief();
  };

  const refreshBrief = async () => {
    if (!browserApi?.getBriefEdition) {
      setBriefEdition(createBriefPreviewEdition());
      showToast("界面预览已刷新");
      return;
    }
    setBriefRefreshing(true);
    try {
      const edition = await browserApi.getBriefEdition({ at: Date.now(), background: true, force: true });
      if (edition) setBriefEdition(edition);
      if (!edition?.refreshPending) setBriefRefreshing(false);
    } catch {
      setBriefRefreshing(false);
    }
  };

  const saveBriefPreferences = async (nextPreferences) => {
    setBriefPreferences(nextPreferences);
    await browserApi?.saveBriefPreferences?.(nextPreferences);
    showToast("关注主题设置将在下一期生效");
  };

  useEffect(() => {
    if (!browserApi?.onOpenUrlTab) return undefined;
    return browserApi.onOpenUrlTab((request) => {
      const payload = typeof request === "string" ? { kind: "image", url: request } : request || {};
      const url = payload.url;
      if (typeof url !== "string" || !url) return;
      if (payload.kind === "pdf" || looksLikePdfInput(url)) {
        openPdfInNewTab(url, payload.title || "PDF 文档", payload);
        return;
      }
      if (payload.kind === "web") {
        openUrlInNewTab(url, payload.title || "网页");
        return;
      }
      let domain = "图片";
      try {
        domain = new URL(url).hostname.replace(/^www\./i, "") || domain;
      } catch {
        // Data-backed images use the generic image label.
      }
      const nextTab = {
        domain,
        id: `image-tab-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        shortTitle: "图片",
        title: "图片",
        url,
      };
      setTabs((currentTabs) => [...currentTabs, nextTab]);
      setActiveSurface("tab");
      setActiveTab(nextTab.id);
      addressEditing.current = false;
      addressValue.current = url;
      setAddressText(formatAddressForDisplay(url));
      browserApi.navigateImage(url, nextTab.id);
    });
  }, [browserApi]);

  useEffect(() => {
    if (!browserApi?.onAskSelection) return undefined;
    return browserApi.onAskSelection((selectedText) => {
      if (typeof selectedText !== "string" || !selectedText.trim()) return;
      const prompt = `请解释并回答关于以下文字的问题：\n\n${selectedText.trim()}`;
      const nextTab = {
        domain: "brizo",
        id: `selection-tab-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        initialPrompt: prompt,
        isNewTab: true,
        shortTitle: "搜索: 选中文字",
        title: "搜索: 选中文字",
        url: "",
        useTodayGreeting: false,
      };
      setTabs((currentTabs) => [nextTab, ...currentTabs]);
      setActiveSurface("tab");
      setActiveTab(nextTab.id);
      addressEditing.current = false;
      addressValue.current = "";
      setAddressText("");
    });
  }, [browserApi]);

  return (
    <SoftBlurIn
      as="main"
      className={`app-shell ${sidebarOpen ? "" : "spaces-collapsed"}${shellUsesLightForeground ? " uses-light-shell-foreground" : ""}`}
      style={{
        "--tab-seam-color": pageUsesLightForeground
          ? "rgba(255, 255, 255, 0.44)"
          : "#dde0dc",
        "--page-background-color": pageBackgroundColor,
      }}
    >
      <aside
        className="spaces-panel"
      >
        <header className="spaces-header">
          <Logo />
        </header>

        {pinnedTabs.length > 0 && (
          <div className="pinned-tabs-grid" role="tablist" aria-label="常驻标签">
            {pinnedTabs.map((tab) => {
              const isSelected = !briefOpen && activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  className={`pinned-tab-btn${isSelected ? " is-active" : ""}${isSelected && pageUsesLightForeground ? " uses-light-foreground" : ""}`}
                  role="tab"
                  aria-selected={isSelected}
                  title={tab.title || tab.shortTitle}
                  onClick={() => selectArticle(tab)}
                  onContextMenu={(e) => handleTabContextMenu(e, tab)}
                >
                  <SiteIcon
                    id={tab.id}
                    iconKey={tab.iconKey}
                    url={tab.url}
                    faviconUrl={tab.faviconUrl}
                    isError={tab.loadError}
                    isNewTab={tab.isNewTab}
                    isPdf={tab.isPdf}
                  />
                </button>
              );
            })}
          </div>
        )}

        {pinnedTabs.length > 0 && (
          <div className="sidebar-pinned-divider" role="separator" aria-label="置顶区与标签页区分隔线" />
        )}

        <button
          type="button"
          className="sidebar-new-tab-btn"
          onClick={openNewTab}
          title="新建标签页"
        >
          <Plus size={16} weight="bold" />
          <span>New Tab</span>
        </button>

        <div className="sidebar-tabs-section">
          <div
            className={`sidebar-tabs-scroll-edge is-top${tabsScrollFlags.top ? " is-visible" : ""}`}
            onPointerEnter={() => startTabsAutoScroll(-1)}
            onPointerLeave={stopTabsAutoScroll}
          >
            <CaretUp size={12} weight="bold" />
          </div>

          <div
            className="sidebar-tabs-list"
            role="tablist"
            aria-label="标签页"
            ref={sidebarTabsListRef}
            onScroll={updateTabsScrollFlags}
          >
            {activeIndicatorY !== null && (
              <div
                className={`sidebar-tab-active-indicator${pageUsesLightForeground ? " uses-light-foreground" : ""}`}
                style={{
                  "--indicator-y": `${activeIndicatorY}px`,
                  height: `${activeIndicatorHeight}px`,
                }}
                aria-hidden="true"
              />
            )}
            {unpinnedTabs.map((tab) => {
              const isSelected = !briefOpen && activeTab === tab.id;
              return (
                <div
                  key={tab.id}
                  ref={(el) => {
                    if (el) {
                      tabRowRefs.current[tab.id] = el;
                    } else {
                      delete tabRowRefs.current[tab.id];
                    }
                  }}
                  className={`sidebar-tab-row${isSelected ? " is-active" : ""}${isSelected && pageUsesLightForeground ? " uses-light-foreground" : ""}${draggedTabId === tab.id ? " is-dragging" : ""}`}
                  draggable
                  onDragStart={(event) => {
                    event.dataTransfer.effectAllowed = "move";
                    event.dataTransfer.setData("application/x-brizo-tab-id", tab.id);
                    setDraggedTabId(tab.id);
                  }}
                  onDragEnter={() => moveTabBefore(draggedTabId, tab.id)}
                  onDragOver={(event) => {
                    event.preventDefault();
                    event.dataTransfer.dropEffect = "move";
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    setDraggedTabId("");
                  }}
                  onDragEnd={() => setDraggedTabId("")}
                  onContextMenu={(e) => handleTabContextMenu(e, tab)}
                  onMouseEnter={startTabTitleMarquee}
                  onMouseLeave={stopTabTitleMarquee}
                >
                  <button
                    type="button"
                    className="sidebar-tab-select"
                    role="tab"
                    aria-selected={isSelected}
                    title={tab.title || tab.shortTitle}
                    onClick={() => selectArticle(tab)}
                  >
                    <SiteIcon
                      id={tab.id}
                      iconKey={tab.iconKey}
                      url={tab.url}
                      faviconUrl={tab.faviconUrl}
                      isError={tab.loadError}
                      isNewTab={tab.isNewTab}
                      isPdf={tab.isPdf}
                    />
                    <span className="sidebar-tab-title"><span>{tab.shortTitle || tab.title}</span></span>
                    {tab.unread && <span className="sidebar-tab-unread" aria-label="Updated" />}
                  </button>
                  {tabs.length > 1 && (
                    <button
                      type="button"
                      className="sidebar-tab-close"
                      aria-label={`关闭 ${tab.shortTitle || tab.title}`}
                      title="关闭标签页"
                      onClick={(event) => {
                        event.stopPropagation();
                        closeTab(tab.id);
                      }}
                    >
                      <X size={13} weight="bold" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          <div
            className={`sidebar-tabs-scroll-edge is-bottom${tabsScrollFlags.bottom ? " is-visible" : ""}`}
            onPointerEnter={() => startTabsAutoScroll(1)}
            onPointerLeave={stopTabsAutoScroll}
          >
            <CaretDown size={12} weight="bold" />
          </div>
        </div>

        <footer className="sidebar-settings-dock">
          <button
            className={`sidebar-dock-btn sidebar-settings-btn${settingsMenuOpen ? " is-active" : ""}`}
            type="button"
            aria-label="打开设置菜单"
            title="设置"
            data-tooltip="设置"
            data-tooltip-pos="left"
            onClick={() => {
              setSidebarHistoryOpen(false);
              setSettingsMenuOpen((value) => {
                if (!value) setSettingsMenuLevel("root");
                return !value;
              });
            }}
          >
            <MoreHorizontalIcon className="remocn-toolbar-icon remocn-more-icon" size={20} strokeWidth={1.9} />
          </button>

          <button
            className={`sidebar-dock-btn${closedTabs.length === 0 ? " is-empty" : ""}`}
            type="button"
            aria-label="恢复关闭的标签页"
            title="恢复关闭的标签页"
            data-tooltip="恢复关闭标签"
            onClick={restoreClosedTab}
          >
            <ArrowUUpLeft size={18} weight="bold" />
          </button>

          <button
            className={`sidebar-dock-btn sidebar-dock-history-btn${sidebarHistoryOpen ? " is-active" : ""}`}
            type="button"
            aria-label="历史记录"
            title="历史记录"
            data-tooltip="历史记录"
            onClick={() => {
              setSettingsMenuOpen(false);
              setSidebarHistoryOpen((open) => !open);
            }}
          >
            <ClockCounterClockwise size={19} />
          </button>

          <button
            className="sidebar-dock-btn is-danger"
            type="button"
            aria-label="删除全部标签"
            title="删除全部标签"
            data-tooltip="删除全部标签"
            data-tooltip-pos="right"
            onClick={closeAllTabs}
          >
            <Trash size={18} />
          </button>
        </footer>
      </aside>

      {bookmarkContextEditor && (
        <>
          <button
            className="bookmark-editor-backdrop bookmark-context-editor-backdrop"
            type="button"
            aria-label="关闭收藏夹编辑菜单"
            onClick={closeBookmarkContextEditor}
          />
          <section
            className="bookmark-editor bookmark-context-editor"
            role="menu"
            aria-label={bookmarkContextEditor.type === "folder" ? "编辑文件夹" : "编辑书签"}
            style={{
              "--bookmark-context-left": `${bookmarkContextEditor.left}px`,
              "--bookmark-context-top": `${bookmarkContextEditor.top}px`,
            }}
          >
            <div className="bookmark-editor-fields">
              <label htmlFor="bookmark-context-editor-name">名称</label>
              <input
                id="bookmark-context-editor-name"
                ref={bookmarkContextNameInputRef}
                value={bookmarkContextDraft.title}
                onChange={(event) => setBookmarkContextDraft((draft) => ({
                  ...draft,
                  title: event.target.value,
                }))}
                onKeyDown={(event) => {
                  if (event.key === "Enter") saveBookmarkContextEditor();
                }}
              />
              <label htmlFor="bookmark-context-editor-folder">文件夹</label>
              <div className={`bookmark-editor-folder-picker${bookmarkContextFolderMenuOpen ? " is-open" : ""}`}>
                <button
                  className="bookmark-editor-folder-trigger"
                  id="bookmark-context-editor-folder"
                  ref={bookmarkContextFolderTriggerRef}
                  type="button"
                  aria-haspopup="listbox"
                  aria-expanded={bookmarkContextFolderMenuOpen}
                  onClick={(event) => {
                    const bounds = event.currentTarget.getBoundingClientRect();
                    setBookmarkContextFolderMenuMaxHeight(
                      Math.max(96, Math.floor(window.innerHeight - bounds.bottom - 8)),
                    );
                    setBookmarkContextFolderMenuOpen((open) => !open);
                  }}
                >
                  <span>{bookmarkContextDraft.folder || "书签栏"}</span>
                  <CaretDown size={15} weight="bold" aria-hidden="true" />
                </button>
                {bookmarkContextFolderMenuOpen && (
                  <div
                    className="bookmark-folder-menu"
                    role="listbox"
                    aria-label="选择所属文件夹"
                    style={{ "--bookmark-folder-menu-max-height": `${bookmarkContextFolderMenuMaxHeight}px` }}
                  >
                    <div className="bookmark-folder-menu-header">
                      <strong>全部文件夹</strong>
                    </div>
                    <div className="bookmark-folder-menu-list">
                      {bookmarkContextFolderRows.map((folder) => {
                        const selected = bookmarkContextDraft.folder === folder.path;
                        return (
                          <button
                            className={selected ? "is-selected" : ""}
                            key={folder.path || "__context_bookmark_bar__"}
                            type="button"
                            role="option"
                            aria-selected={selected}
                            style={{ "--bookmark-folder-depth": folder.depth }}
                            onClick={() => {
                              setBookmarkContextDraft((draft) => ({ ...draft, folder: folder.path }));
                              setBookmarkContextFolderMenuOpen(false);
                            }}
                          >
                            {selected
                              ? <FolderOpen size={15} weight="fill" aria-hidden="true" />
                              : <FolderSimple size={15} weight="fill" aria-hidden="true" />}
                            <span>{folder.name}</span>
                            {selected ? <Check size={12} weight="bold" aria-hidden="true" /> : null}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>
            <footer className="bookmark-editor-actions">
              <button className="bookmark-editor-remove" type="button" onClick={removeBookmarkContextItem}>
                移除
              </button>
              <button className="bookmark-editor-done" type="button" onClick={saveBookmarkContextEditor}>
                <span>完成</span>
                <ArrowBendDownLeft size={18} weight="bold" aria-hidden="true" />
              </button>
            </footer>
          </section>
        </>
      )}

      <section
        className={`browser-panel ${desktopMode ? "desktop-browser" : ""}`}
      >
        <div
          className="browser-surface"
          style={{ "--page-background-color": pageBackgroundColor }}
        >
          <header
            className={`browser-toolbar${pageUsesLightForeground ? " uses-light-foreground" : ""}`}
            style={{ "--page-background-color": toolbarBackgroundColor }}
          >
          <div className="browser-toolbar-center">
            <div className="browser-nav">
              <IconButton
                label="Back"
                disabled={briefOpen || newTabOpen || bookmarksPageOpen || (desktopMode && !navigationState.canGoBack && !canReturnToNewTab)}
                onClick={navigateBack}
              >
                <ArrowLeftIcon className="remocn-toolbar-icon remocn-arrow-left-icon" size={20} strokeWidth={1.9} />
              </IconButton>
              <IconButton
                label="Forward"
                disabled={briefOpen || newTabOpen || bookmarksPageOpen || (desktopMode && !navigationState.canGoForward)}
                onClick={() => desktopMode ? browserApi.forward() : showToast("Forward")}
              >
                <ArrowRightIcon className="remocn-toolbar-icon remocn-arrow-right-icon" size={20} strokeWidth={1.9} />
              </IconButton>
              <IconButton
                label="Reload"
                disabled={briefOpen || newTabOpen || bookmarksPageOpen}
                onClick={() => desktopMode ? browserApi.reload() : showToast("Page refreshed")}
              >
                <RefreshCwIcon className="remocn-toolbar-icon remocn-refresh-icon" size={20} strokeWidth={1.8} />
              </IconButton>
            </div>

            <form
              ref={addressBarRef}
              className={`address-bar address-load-${addressLoadPhase}${!briefOpen && !newTabOpen ? " is-site-address" : ""}${addressFocused ? " is-editing" : ""}`}
              onSubmit={submitAddress}
            >
              {briefOpen || newTabOpen
                ? <MagnifyingGlass className="address-search-icon" size={15} />
                : null}
              <input
                ref={addressInput}
                value={addressText}
                onChange={(event) => {
                  addressValue.current = event.target.value;
                  setAddressInputDirty(true);
                  setAddressText(event.target.value);
                }}
                onFocus={() => {
                  addressEditing.current = true;
                  setAddressInputDirty(false);
                  setAddressFocused(true);
                }}
                onPointerDown={(event) => {
                  const input = event.currentTarget;
                  addressEditing.current = true;
                  setAddressInputDirty(false);
                  setAddressFocused(true);
                  setAddressText(addressValue.current);
                  window.requestAnimationFrame(() => {
                    input.focus();
                    input.select();
                  });
                }}
                onBlur={() => {
                  addressEditing.current = false;
                  setAddressInputDirty(false);
                  setAddressFocused(false);
                  setAddressText(formatAddressForDisplay(addressValue.current));
                }}
                aria-label="Address"
                placeholder={briefOpen || newTabOpen ? "搜索或输入网址" : ""}
              />
              {addressSuggestions.length > 0 && (
                <button
                  className="address-go-button"
                  type="submit"
                  aria-label="确认输入"
                  onMouseDown={(event) => event.preventDefault()}
                >
                  <ArrowRight size={12} weight="bold" />
                </button>
              )}
              {addressSuggestions.length > 0 && (
                <div className="address-suggestions" role="listbox" aria-label="网站联想">
                  {addressSuggestions.map((suggestion) => (
                    <button
                      key={`${suggestion.type}-${suggestion.value}`}
                      type="button"
                      role="option"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => submitAddressValue(suggestion.value)}
                    >
                      {suggestion.type === "url"
                        ? <GlobeHemisphereWest size={16} />
                        : <MagnifyingGlass size={16} />}
                      <span>{suggestion.type === "url"
                        ? suggestion.value.replace(/^https?:\/\//i, "")
                        : suggestion.value}</span>
                    </button>
                  ))}
                </div>
              )}
            </form>

            <div className="browser-actions">
              <div className={`bookmark-control${bookmarkEditorOpen ? " is-open" : ""}`}>
                <IconButton
                  label={currentBookmark ? "编辑书签" : "添加书签"}
                  className={`bookmark-action-button${currentBookmark ? " is-active" : ""}`}
                  disabled={briefOpen || newTabOpen || bookmarksPageOpen}
                  onClick={openBookmarkEditor}
                >
                  <span
                    className={`bookmark-action-icon${bookmarkCelebrationUrl === currentPageUrl ? " is-celebrating" : ""}`}
                    onAnimationEnd={(event) => {
                      if (event.animationName === "brizo-bookmark-pop") {
                        setBookmarkCelebrationUrl((url) => (url === currentPageUrl ? "" : url));
                      }
                    }}
                  >
                    <BookmarkIcon
                      className="remocn-toolbar-icon remocn-bookmark-icon"
                      filled={Boolean(currentBookmark)}
                      size={19}
                      strokeWidth={1.8}
                    />
                  </span>
                </IconButton>
                {bookmarkEditorOpen && (
                  <>
                    <button
                      className="bookmark-editor-backdrop"
                      type="button"
                      aria-label="关闭书签菜单"
                      onClick={() => {
                        setBookmarkFolderMenuOpen(false);
                        setBookmarkEditorOpen(false);
                      }}
                    />
                    <section className="bookmark-editor" role="menu" aria-label="编辑书签">
                      <div className="bookmark-editor-fields">
                        <label htmlFor="bookmark-editor-name">名称</label>
                        <input
                          id="bookmark-editor-name"
                          ref={bookmarkNameInputRef}
                          value={bookmarkDraft.title}
                          onChange={(event) => updateBookmarkDraft({ title: event.target.value })}
                        />
                        <label htmlFor="bookmark-editor-folder">文件夹</label>
                        <div className={`bookmark-editor-folder-picker${bookmarkFolderMenuOpen ? " is-open" : ""}`}>
                          <button
                            className="bookmark-editor-folder-trigger"
                            id="bookmark-editor-folder"
                            ref={bookmarkFolderTriggerRef}
                            type="button"
                            aria-haspopup="listbox"
                            aria-expanded={bookmarkFolderMenuOpen}
                            onClick={() => {
                              setBookmarkFolderMenuOpen((open) => !open);
                            }}
                          >
                            <span>{bookmarkDraft.folder || "书签栏"}</span>
                            <CaretDown size={15} weight="bold" aria-hidden="true" />
                          </button>
                          {bookmarkFolderMenuOpen && (
                            <div
                              className="bookmark-folder-menu"
                              role="listbox"
                              aria-label="选择书签文件夹"
                              style={{ "--bookmark-folder-menu-max-height": `${bookmarkFolderMenuMaxHeight}px` }}
                            >
                              <div className="bookmark-folder-menu-header">
                                <strong>全部文件夹</strong>
                              </div>
                              <div className="bookmark-folder-menu-list">
                                {bookmarkFolderRows.map((folder) => {
                                  const selected = bookmarkDraft.folder === folder.path;
                                  return (
                                    <button
                                      className={selected ? "is-selected" : ""}
                                      key={folder.path || "__bookmark_bar__"}
                                      type="button"
                                      role="option"
                                      aria-selected={selected}
                                      style={{ "--bookmark-folder-depth": folder.depth }}
                                      onClick={() => {
                                        updateBookmarkDraft({ folder: folder.path });
                                        setBookmarkFolderMenuOpen(false);
                                      }}
                                    >
                                      {selected
                                        ? <FolderOpen size={15} weight="fill" aria-hidden="true" />
                                        : <FolderSimple size={15} weight="fill" aria-hidden="true" />}
                                      <span>{folder.name}</span>
                                      {selected ? <Check size={12} weight="bold" aria-hidden="true" /> : null}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                      <footer className="bookmark-editor-actions">
                        <button className="bookmark-editor-remove" type="button" onClick={removeCurrentBookmark}>
                          移除
                        </button>
                        <button className="bookmark-editor-done" type="button" onClick={() => {
                          setBookmarkFolderMenuOpen(false);
                          setBookmarkEditorOpen(false);
                        }}>
                          <span>完成</span>
                          <ArrowBendDownLeft size={18} weight="bold" aria-hidden="true" />
                        </button>
                      </footer>
                    </section>
                  </>
                )}
              </div>
              <IconButton
                label={pdfExporting ? "Creating clean article PDF" : "Export clean article PDF"}
                className={pdfExporting ? "pdf-export-button is-exporting" : "pdf-export-button"}
                disabled={
                  briefOpen ||
                  newTabOpen ||
                  bookmarksPageOpen ||
                  pdfExporting ||
                  (desktopMode && (
                    navigationState.isLoading ||
                    Boolean(navigationState.error) ||
                    !navigationState.url
                  ))
                }
                onClick={navigationState.isPdf ? downloadCurrentPdf : exportArticlePdf}
              >
                <FileTextIcon className="remocn-toolbar-icon remocn-file-text-icon" size={20} strokeWidth={1.8} />
              </IconButton>
              <div className="downloads-menu">
                <IconButton
                  label="Downloads"
                  className={downloadsOpen ? "is-active" : ""}
                  onClick={() => {
                    setSettingsMenuOpen(false);
                    setDownloadsOpen((open) => !open);
                  }}
                >
                  <DownloadIcon
                    key={downloadIconActivityKey}
                    className={`toolbar-download-icon${downloadIconActivityKey ? " is-download-active" : ""}`}
                    size={19}
                    strokeWidth={1.8}
                    onAnimationEnd={() => {
                      if (downloadIconActivityKey) setDownloadIconActivityKey(0);
                    }}
                  />
                </IconButton>
              </div>
            </div>
          </div>

          {downloadsOpen && (
            <>
              <button
                className="downloads-menu-backdrop"
                type="button"
                aria-label="Close downloads"
                onClick={() => setDownloadsOpen(false)}
              />
              <section className="downloads-popover" role="menu" aria-label="Downloads">
                <DownloadPanel
                  downloadGroups={downloadGroups}
                  onAction={handleDownloadAction}
                  onOpenDirectory={openDownloadsDirectory}
                />
              </section>
            </>
          )}

          <div className="browser-menu" ref={browserMenuRef}>
            {sidebarHistoryOpen && createPortal(
              <>
                <button
                  className="settings-menu-backdrop"
                  type="button"
                  aria-label="关闭历史记录菜单"
                  onPointerDown={() => setSidebarHistoryOpen(false)}
                />
                <div
                  className="sidebar-history-popover"
                  ref={sidebarHistoryPopoverRef}
                  role="menu"
                  aria-label="历史记录"
                >
                  <header className="sidebar-history-header">
                    <div className="sidebar-history-title">
                      <ClockCounterClockwise size={16} />
                      <strong>历史记录</strong>
                    </div>
                    <div className="sidebar-history-actions">
                      {browserHistory.length > 0 && (
                        <button
                          type="button"
                          className="sidebar-history-action-btn"
                          onClick={() => {
                            setBrowserHistory([]);
                            localStorage.removeItem("bean:browser-history");
                            showToast("已清空浏览记录");
                          }}
                        >
                          清除
                        </button>
                      )}
                      <button
                        type="button"
                        className="sidebar-history-action-btn"
                        onClick={() => {
                          setSidebarHistoryOpen(false);
                          openSettingsPanel("history");
                        }}
                      >
                        全部...
                      </button>
                    </div>
                  </header>

                  <div className="sidebar-history-list">
                    {browserHistory.length > 0 ? (
                      browserHistory.slice(0, 30).map((item) => (
                        <div className="sidebar-history-row" key={`${item.url}-${item.updatedAt || ""}`}>
                          <button
                            className="sidebar-history-item-btn"
                            type="button"
                            role="menuitem"
                            title={item.url}
                            onClick={() => openHistoryItemInTab(item)}
                          >
                            <BookmarkFavicon bookmark={item} />
                            <span className="sidebar-history-copy">
                              <strong>{item.title || item.url}</strong>
                              <small>{formatAddressForDisplay(item.url)}</small>
                            </span>
                            <time>{formatHistoryTime(item.updatedAt)}</time>
                          </button>
                          <button
                            className="sidebar-history-item-remove"
                            type="button"
                            aria-label={`删除 ${item.title || item.url}`}
                            title="删除此记录"
                            onClick={(e) => {
                              e.stopPropagation();
                              removeBrowserHistoryItem(item.url);
                            }}
                          >
                            <X size={13} />
                          </button>
                        </div>
                      ))
                    ) : (
                      <div className="sidebar-history-empty">
                        <ClockCounterClockwise size={22} />
                        <span>暂无浏览记录</span>
                      </div>
                    )}
                  </div>
                </div>
              </>,
              document.body
            )}
            {settingsMenuOpen && createPortal(
              <>
                <button
                  className="settings-menu-backdrop"
                  type="button"
                  aria-label="Close settings menu"
                  onPointerDown={() => {
                    setSettingsMenuOpen(false);
                    setSettingsMenuLevel("root");
                    setSettingsPanel("");
                  }}
                />
                <div className="settings-menu-popover" ref={settingsPopoverRef} role="menu" aria-label="Settings and tools">
                  {["root", "downloads", "preferences"].includes(settingsMenuLevel) ? <>
                  <button
                    className="settings-account-row"
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setAccountDraft(accountProfile);
                      openSettingsPanel("account");
                    }}
                  >
                    <span className="settings-account-avatar">
                      {accountProfile.name.slice(0, 1).toUpperCase()}
                    </span>
                    <strong>{accountProfile.email || accountProfile.name}</strong>
                    <CheckCircle className="settings-account-check" size={22} weight="fill" />
                  </button>

                  <div className="settings-menu-group">
                    <button type="button" role="menuitem" onClick={() => {
                      setAccountDraft(accountProfile);
                      openSettingsPanel("account");
                    }}>
                      <UserCircle size={20} />
                      <span>编辑或添加个人资料</span>
                    </button>
                  </div>

                  <div className="settings-menu-group">
                    <div className="settings-zoom-row" role="group" aria-label="页面缩放">
                      <ArrowsOut size={20} />
                      <span>缩放</span>
                      <button type="button" aria-label="缩小" disabled={pageZoom <= 0.5} onClick={() => updatePageZoom(pageZoom - 0.1)}>
                        <Minus size={14} weight="bold" />
                      </button>
                      <button className="settings-zoom-value" type="button" aria-label="恢复 100%" onClick={() => updatePageZoom(1)}>
                        {Math.round(pageZoom * 100)}%
                      </button>
                      <button type="button" aria-label="放大" disabled={pageZoom >= 2} onClick={() => updatePageZoom(pageZoom + 0.1)}>
                        <Plus size={14} weight="bold" />
                      </button>
                    </div>
                  </div>

                  <div className="settings-menu-group">
                    <button type="button" role="menuitem" onClick={() => openSettingsPanel("password-vault")}>
                      <Key size={20} />
                      <span>密码箱</span>
                      <CaretRight size={16} />
                    </button>
                    <button type="button" role="menuitem" onClick={() => openSettingsPanel("history")}>
                      <ClockCounterClockwise size={20} />
                      <span>历史记录</span>
                      <CaretRight size={16} />
                    </button>
                    <button className={settingsMenuLevel === "downloads" ? "is-current" : ""} type="button" role="menuitem" onClick={openDownloadsFromSettings}>
                      <DownloadSimple size={20} />
                      <span>下载内容</span>
                      <CaretRight size={16} />
                    </button>
                    <button type="button" role="menuitem" onClick={() => setSettingsMenuLevel("bookmarks")}>
                      <BookmarkSimple size={20} />
                      <span>收藏夹</span>
                      <CaretRight size={16} />
                    </button>
                    <button type="button" role="menuitem" onClick={() => openSettingsPanel("model-guard")}>
                      <PuzzlePiece size={20} />
                      <span>大模型护航</span>
                      <CaretRight size={16} />
                    </button>
                  </div>

                  <div className="settings-menu-group">
                    <button className={settingsMenuLevel === "preferences" ? "is-current" : ""} type="button" role="menuitem" onClick={() => setSettingsMenuLevel((level) => level === "preferences" ? "root" : "preferences")}>
                      <GearSix size={20} />
                      <span>设置</span>
                      <CaretRight size={16} />
                    </button>
                  </div>

                  <div className="settings-menu-group">
                    <button
                      type="button"
                      role="menuitem"
                      onClick={async () => {
                        setSettingsMenuOpen(false);
                        if (await browserApi?.openIncognito?.()) {
                          showToast("Private window opened");
                        } else {
                          showToast("Private windows are available in the desktop app");
                        }
                      }}
                    >
                      <EyeSlash size={20} />
                      <span>无痕窗口</span>
                    </button>
                  </div>
                  </> : settingsMenuLevel === "bookmarks" ? (
                    <div className="settings-nested-menu">
                      <button className="settings-nested-menu-header" type="button" role="menuitem" onClick={() => setSettingsMenuLevel("root")}>
                        <CaretLeft size={16} />
                        <strong>收藏夹</strong>
                      </button>
                      <div className="settings-menu-group">
                        <button type="button" role="menuitem" onClick={() => setSettingsMenuLevel("bookmark-import")}>
                          <UploadSimple size={20} />
                          <span>收藏夹导入</span>
                          <CaretRight size={16} />
                        </button>
                        <button type="button" role="menuitem" onClick={openBookmarkOrganizerPage}>
                          <FolderOpen size={20} />
                          <span>整理收藏夹</span>
                          <CaretRight size={16} />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="settings-nested-menu settings-bookmark-import-menu">
                      <button className="settings-nested-menu-header" type="button" role="menuitem" onClick={() => setSettingsMenuLevel("bookmarks")}>
                        <CaretLeft size={16} />
                        <strong>收藏夹导入</strong>
                      </button>
                      <div className="settings-bookmark-source-list">
                        {bookmarkSources.length === 0 ? (
                          <div className="settings-bookmark-source-status"><Browsers size={18} /><span>正在查找浏览器</span></div>
                        ) : bookmarkSources.map((source) => {
                          const selected = selectedBookmarkSources.includes(source.id);
                          return (
                            <button
                              className={selected ? "is-selected" : ""}
                              key={source.id}
                              type="button"
                              role="menuitemcheckbox"
                              aria-checked={selected}
                              disabled={!source.available || !source.readable}
                              onClick={() => setSelectedBookmarkSources((current) => selected
                                ? current.filter((id) => id !== source.id)
                                : [...current, source.id])}
                            >
                              <span className="browser-source-icon">{source.name.slice(0, 1)}</span>
                              <span>{source.name}</span>
                              {selected ? <Check size={15} weight="bold" /> : null}
                            </button>
                          );
                        })}
                      </div>
                      <div className="settings-menu-group">
                        <button type="button" role="menuitem" disabled={bookmarkImporting} onClick={importFromHtml}>
                          <UploadSimple size={20} />
                          <span>从 HTML 导入</span>
                        </button>
                        <button type="button" role="menuitem" disabled={bookmarkImporting || selectedBookmarkSources.length === 0} onClick={importFromBrowsers}>
                          <CheckCircle size={20} />
                          <span>{bookmarkImporting ? "导入中" : "导入所选"}</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
                {settingsMenuLevel === "downloads" && (
                  <section className="settings-menu-side-popover settings-downloads-side" role="menu" aria-label="下载内容">
                    <DownloadPanel
                      downloadGroups={downloadGroups}
                      onAction={handleDownloadAction}
                      onOpenDirectory={openDownloadsDirectory}
                    />
                  </section>
                )}
                {settingsMenuLevel === "preferences" && (
                  <section className="settings-menu-side-popover settings-preferences-side" role="menu" aria-label="设置">
                    <header><GearSix size={17} /><strong>设置</strong></header>
                    <div className="preferences-settings">
                      <label className="preference-row">
                        <span><strong>语言</strong></span>
                        <select value={appPreferences.language} onChange={(event) => setAppPreferences((current) => ({ ...current, language: event.target.value }))}>
                          <option value="zh-CN">简体中文</option><option value="en">English</option><option value="system">跟随系统</option>
                        </select>
                      </label>
                      <div className="preference-row">
                        <span><strong>下载位置</strong><small title={appPreferences.downloadLocation}>{appPreferences.downloadLocation || "系统默认下载文件夹"}</small></span>
                        <button type="button" onClick={chooseDownloadLocation}>选择…</button>
                      </div>
                      <label className="preference-row">
                        <span><strong>自动更新</strong></span>
                        <input type="checkbox" checked={appPreferences.autoUpdate} onChange={(event) => setAppPreferences((current) => ({ ...current, autoUpdate: event.target.checked }))} />
                      </label>
                      <div className="preference-row">
                        <span><strong>当前版本</strong><small>{appInfo?.version || "Brizo 0.0.0"}</small></span>
                        <button type="button" onClick={() => openSettingsPanel("about")}>关于</button>
                      </div>
                    </div>
                  </section>
                )}
              </>,
              document.getElementById("root"),
            )}
          </div>
          </header>

          <HorizontalBookmarksBar
            bookmarkTree={bookmarkTree}
            folderOrders={folderOrders}
            dragItem={dragItem}
            dropTarget={dropTarget}
            lightForeground={pageUsesLightForeground}
            onDragEnd={handleBookmarkDragEnd}
            onDragOver={handleHorizontalBookmarkDragOver}
            onVerticalDragOver={handleBookmarkDragOver}
            onDragStart={handleBookmarkDragStart}
            onDrop={handleBookmarkDrop}
            onDropdownOpenChange={setBookmarkBarDropdownOpen}
            onOpenBookmark={openBookmark}
            onOpenBookmarkContextEditor={openBookmarkContextEditor}
          />

        <div
          className={`web-content-host brief-host${briefOpen ? " is-active" : ""}`}
          aria-hidden={!briefOpen}
        >
          <div className="page-zoom-layer" style={{ height: `${100 / pageZoom}%`, width: `${100 / pageZoom}%`, zoom: pageZoom }}>
            <BriefPage
              active={briefOpen}
              edition={briefEdition}
              loading={briefLoading}
              onGetReport={(payload) => browserApi?.getBriefReport?.(payload)}
              onOpenModelGuard={() => {
                setActiveSurface("tab");
                openSettingsPanel("model-guard");
              }}
              onOpenSource={(url) => openUrlInNewTab(url, "Brief 来源")}
              onRefresh={refreshBrief}
              onSavePreferences={saveBriefPreferences}
              preferences={briefPreferences}
              refreshing={briefRefreshing}
            />
          </div>
        </div>

        {tabs.filter((tab) => tab.isNewTab || tab.hasNewTabSession).map((tab) => (
          <div
            className={`web-content-host new-tab-host new-tab-session ${newTabOpen && activeTab === tab.id ? "is-active" : ""}`}
            key={tab.id}
            ref={newTabOpen && activeTab === tab.id ? webContentHost : null}
            aria-hidden={!(newTabOpen && activeTab === tab.id)}
          >
            <div className="page-zoom-layer" style={{ height: `${100 / pageZoom}%`, width: `${100 / pageZoom}%`, zoom: pageZoom }}>
              <NewTabPage
                active={newTabOpen && activeTab === tab.id}
                activeTabId={tab.id}
                availableModels={boundModels}
                bookmarks={bookmarkLibrary}
                history={searchHistory}
                initialMode={tab.initialMode || "ask"}
                initialPrompt={tab.initialPrompt || ""}
                initialUseCommand={tab.initialUseCommand || ""}
                onNotify={showToast}
                tabs={tabs}
                onOpenSource={openNewTabSource}
                onRestoreHistory={restoreSearchHistoryTab}
                onSearchComplete={saveCompletedSearch}
                onSubmit={submitNewTabPrompt}
                onUseSubmit={submitNewTabUse}
                prefillPrompt={tab.prefillPrompt || ""}
                restoredResult={tab.restoredResult || null}
                useExecutionSpace={Boolean(tab.useExecutionSpace)}
                useTodayGreeting={Boolean(tab.useTodayGreeting)}
              />
            </div>
          </div>
        ))}

          {!briefOpen && !newTabOpen && !bookmarksPageOpen && (desktopMode ? (
          <div
            className="web-content-host"
            ref={webContentHost}
          >
            {browserPreview && (
              <div
                className="web-content-preview browser-preview"
                style={{ backgroundImage: `url(${browserPreview})` }}
                aria-hidden="true"
              />
            )}
            {!navigationState.isContentReady && navigationState.navigationPreview && (
              <div
                className="web-content-preview navigation-preview"
                style={{ backgroundImage: `url(${navigationState.navigationPreview})` }}
                aria-hidden="true"
              />
            )}
            {navigationState.error && (
              <div className="browser-error-page" aria-label="网页读取失败" aria-live="polite" role="status">
                <div className="browser-error-content">
                  <img src={brizoLogoUrl} alt="Brizo" />
                  {(() => {
                    const copy = getBrowserErrorCopy(navigationState.error);
                    return (
                      <>
                        <h1>{copy.code} · {copy.reason}</h1>
                        <p>{copy.chinese}</p>
                        <p lang="en">{copy.english}</p>
                      </>
                    );
                  })()}
                </div>
              </div>
            )}
          </div>
        ) : null)}
        </div>

        {aiOpen && (
          <div className="ai-layer" role="dialog" aria-modal="true" aria-label="Brizo AI search">
            <button className="ai-backdrop" type="button" aria-label="Close AI search" onClick={() => setAiOpen(false)} />
            <div className="ai-panel">
              <header>
                <div className="ai-title"><Sparkle size={19} weight="fill" /> Ask Brizo</div>
                <IconButton label="Close AI search" onClick={() => setAiOpen(false)}>
                  <X size={18} />
                </IconButton>
              </header>
              <div className="ai-query">
                <MagnifyingGlass size={20} />
                <input
                  autoFocus
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Ask across the web and your saved sources"
                />
              </div>
              <div className="ai-answer">
                <span className="answer-label"><Sparkle size={15} /> Suggested answer</span>
                <p>
                  StructureNet improves protein prediction by preserving fine-grained geometric relationships,
                  particularly around flexible loops and ligand-binding sites.
                </p>
                <div className="source-row">
                  <SiteIcon id={1} />
                  <div><strong>Current Nature article</strong><small>Open tab · cited twice</small></div>
                  <CaretRight size={17} />
                </div>
                <div className="source-row">
                  <BookmarkSimple size={20} />
                  <div><strong>5 related saved sources</strong><small>Research space</small></div>
                  <CaretRight size={17} />
                </div>
              </div>
            </div>
          </div>
        )}
      </section>

      {settingsPanel === "history" && (
        <SettingsDialog
          title="历史记录"
          onBack={backToSettingsMenu}
          onClose={() => setSettingsPanel("")}
        >
          <div className="settings-history-panel">
            <div className="settings-panel-tabs" role="tablist" aria-label="历史记录类型">
              <button className={historySection === "browser" ? "is-active" : ""} type="button" role="tab" aria-selected={historySection === "browser"} onClick={() => setHistorySection("browser")}>网页</button>
              <button className={historySection === "search" ? "is-active" : ""} type="button" role="tab" aria-selected={historySection === "search"} onClick={() => setHistorySection("search")}>搜索</button>
            </div>
            <div className="settings-secondary-heading">
              <span>{historySection === "browser" ? `${browserHistory.length} 个页面` : `${searchHistory.length} 条搜索`}</span>
              {(historySection === "browser" ? browserHistory.length : searchHistory.length) > 0 && (
                <button type="button" onClick={() => {
                  if (historySection === "browser") {
                    setBrowserHistory([]);
                    localStorage.removeItem("bean:browser-history");
                  } else {
                    setSearchHistory([]);
                    localStorage.removeItem("bean:search-history");
                  }
                }}>清除</button>
              )}
            </div>
            <div className={`settings-history-list${historySection === "search" ? " is-search-history" : ""}`}>
              {historySection === "browser" ? (browserHistory.length ? browserHistory.map((item) => (
                <div className="history-entry-row" key={item.url}>
                  <button className="history-entry-main" type="button" onClick={() => {
                    setSettingsPanel("");
                    navigateFromAddress(item.url);
                  }}>
                    <BookmarkFavicon bookmark={item} />
                    <span>
                      <strong>{item.title || item.url}</strong>
                      <small>{item.url}</small>
                    </span>
                    <time>{new Date(item.updatedAt).toLocaleDateString()}</time>
                  </button>
                  <button className="history-entry-remove" type="button" aria-label={`删除 ${item.title || item.url}`} onClick={() => removeBrowserHistoryItem(item.url)}><X size={14} /></button>
                </div>
              )) : <div className="settings-secondary-empty"><ClockCounterClockwise size={22} /><span>暂无网页历史</span></div>) : (searchHistory.length ? searchHistory.map((item) => (
                <div className="history-entry-row" key={item.query}>
                  <button className="history-entry-main" type="button" onClick={() => openSearchHistoryItem(item)}>
                    <MagnifyingGlass size={16} />
                    <span>
                      <strong>{item.query}</strong>
                      <small>{item.result ? "已保存完整结果" : "仅保留搜索词"}</small>
                    </span>
                    <time>{new Date(item.updatedAt || Date.now()).toLocaleDateString()}</time>
                  </button>
                  <button className="history-entry-remove" type="button" aria-label={`删除 ${item.query}`} onClick={() => removeSearchHistoryItem(item.query)}><X size={14} /></button>
                </div>
              )) : <div className="settings-secondary-empty"><MagnifyingGlass size={22} /><span>暂无搜索历史</span></div>)}
            </div>
          </div>
        </SettingsDialog>
      )}

      {settingsPanel === "password-vault" && (
        <SettingsDialog
          title="密码箱"
          onBack={backToSettingsMenu}
          onClose={() => setSettingsPanel("")}
        >
          <div className="password-vault-panel">
            <div className="settings-secondary-heading">
              <span>{passwordEntries.length} 项</span>
              <button type="button" onClick={() => {
                setPasswordError("");
                setPasswordDraft({ id: "", site: currentPageUrl || "", username: "", password: "" });
              }}><Plus size={13} />添加</button>
            </div>
            {passwordDraft && (
              <form className="password-vault-form" onSubmit={savePasswordDraft}>
                <input aria-label="网站" placeholder="网站或登录地址" value={passwordDraft.site} onChange={(event) => setPasswordDraft((draft) => ({ ...draft, site: event.target.value }))} />
                <input aria-label="账号" placeholder="账号" value={passwordDraft.username} onChange={(event) => setPasswordDraft((draft) => ({ ...draft, username: event.target.value }))} />
                <input aria-label="密码" type="password" placeholder={passwordDraft.id ? "新密码（留空则保留）" : "密码"} value={passwordDraft.password} onChange={(event) => setPasswordDraft((draft) => ({ ...draft, password: event.target.value }))} />
                {passwordError && <p role="alert">{passwordError}</p>}
                <div className="password-vault-form-actions">
                  <button type="button" onClick={() => { setPasswordDraft(null); setPasswordError(""); }}>取消</button>
                  <button className="primary" type="submit" disabled={passwordSaving}>{passwordSaving ? "保存中" : "保存"}</button>
                </div>
              </form>
            )}
            <div className="password-vault-list">
              {passwordEntries.length ? passwordEntries.map((entry) => (
                <div className="password-vault-row" key={entry.id}>
                  <button className="password-vault-site" type="button" onClick={() => {
                    setSettingsPanel("");
                    navigateFromAddress(entry.site);
                  }}>
                    <span><LockKey size={16} /></span>
                    <span><strong>{entry.site}</strong><small>{entry.username}</small></span>
                  </button>
                  <div className="password-vault-actions">
                    <button type="button" aria-label="复制账号" title="复制账号" onClick={() => browserApi?.copyText?.(entry.username)}><UserCircle size={15} /></button>
                    <button type="button" aria-label="复制密码" title="复制密码" onClick={() => copySavedPassword(entry.id)}><CopySimple size={15} /></button>
                    <button type="button" aria-label="编辑" title="编辑" onClick={() => {
                      setPasswordError("");
                      setPasswordDraft({ id: entry.id, site: entry.site, username: entry.username, password: "" });
                    }}><PencilSimple size={15} /></button>
                    <button type="button" aria-label="删除" title="删除" onClick={() => deletePasswordEntry(entry.id)}><Trash size={15} /></button>
                  </div>
                </div>
              )) : !passwordDraft && (
                <div className="settings-secondary-empty"><LockKey size={22} /><span>暂无密码</span></div>
              )}
            </div>
          </div>
        </SettingsDialog>
      )}

      {settingsPanel === "preferences" && (
        <SettingsDialog
          title="设置"
          onBack={backToSettingsMenu}
          onClose={() => setSettingsPanel("")}
        >
          <div className="preferences-settings">
            <label className="preference-row">
              <span><strong>语言</strong></span>
              <select
                value={appPreferences.language}
                onChange={(event) => setAppPreferences((current) => ({ ...current, language: event.target.value }))}
              >
                <option value="zh-CN">简体中文</option>
                <option value="en">English</option>
                <option value="system">跟随系统</option>
              </select>
            </label>
            <div className="preference-row">
              <span><strong>下载位置</strong><small title={appPreferences.downloadLocation}>{appPreferences.downloadLocation || "系统默认下载文件夹"}</small></span>
              <button type="button" onClick={chooseDownloadLocation}>选择…</button>
            </div>
            <label className="preference-row">
              <span><strong>自动更新</strong></span>
              <input
                type="checkbox"
                checked={appPreferences.autoUpdate}
                onChange={(event) => setAppPreferences((current) => ({ ...current, autoUpdate: event.target.checked }))}
              />
            </label>
            <div className="preference-row">
              <span><strong>当前版本</strong><small>{appInfo?.version || "Brizo 0.0.0"}</small></span>
              <button type="button" onClick={() => openSettingsPanel("about")}>关于</button>
            </div>
          </div>
        </SettingsDialog>
      )}

      {settingsPanel === "account" && (
        <SettingsDialog
          title="个人资料"
          onBack={backToSettingsMenu}
          onClose={() => setSettingsPanel("")}
        >
          <form className="account-settings-form" onSubmit={saveAccountProfile}>
            <div className="account-profile-preview">
              <span>{(accountDraft.name || "A").slice(0, 1).toUpperCase()}</span>
              <div>
                <strong>{accountDraft.name || "Alex"}</strong>
              </div>
            </div>
            <label>
              显示名称
              <input
                value={accountDraft.name}
                onChange={(event) => setAccountDraft((profile) => ({
                  ...profile,
                  name: event.target.value,
                }))}
                autoComplete="name"
              />
            </label>
            <label>
              邮箱
              <input
                value={accountDraft.email}
                onChange={(event) => setAccountDraft((profile) => ({
                  ...profile,
                  email: event.target.value,
                }))}
                autoComplete="email"
                type="email"
              />
            </label>
            <div className="settings-dialog-actions">
              <button type="button" onClick={() => setSettingsPanel("")}>取消</button>
              <button className="primary" type="submit">保存</button>
            </div>
          </form>
        </SettingsDialog>
      )}

      {settingsPanel === "bookmarks" && (
        <SettingsDialog
          title="收藏夹"
          onBack={backToSettingsMenu}
          onClose={() => setSettingsPanel("")}
        >
          <div className="bookmark-submenu" role="menu">
            <button type="button" role="menuitem" onClick={() => setSettingsPanel("bookmark-import")}>
              <UploadSimple size={18} /><span>收藏夹导入</span><CaretRight size={15} />
            </button>
            <button type="button" role="menuitem" onClick={() => setSettingsPanel("bookmark-organizer")}>
              <FolderOpen size={18} /><span>整理收藏夹</span><CaretRight size={15} />
            </button>
          </div>
        </SettingsDialog>
      )}

      {settingsPanel === "bookmark-import" && (
        <SettingsDialog title="收藏夹导入" onBack={() => setSettingsPanel("bookmarks")} onClose={() => setSettingsPanel("")}>
          <div className="bookmark-settings-panel">
            <div className="bookmark-import-list">
              {bookmarkSources.length === 0 ? (
                <div className="settings-loading-row"><Browsers size={20} /><span>正在查找浏览器</span></div>
              ) : bookmarkSources.map((source) => (
                <label className={`bookmark-source-row ${source.available ? "" : "is-unavailable"}`} key={source.id}>
                  <input type="checkbox" checked={selectedBookmarkSources.includes(source.id)} disabled={!source.available || !source.readable} onChange={(event) => {
                    setSelectedBookmarkSources((current) => event.target.checked
                      ? [...current, source.id]
                      : current.filter((id) => id !== source.id));
                  }} />
                  <span className="browser-source-icon">{source.name.slice(0, 1)}</span>
                  <span><strong>{source.name}</strong><small>{!source.available ? "未安装" : !source.readable ? "需要权限" : `${source.count} 项`}</small></span>
                  {selectedBookmarkSources.includes(source.id) && <Check size={17} />}
                </label>
              ))}
            </div>
            <button className="html-import-button" type="button" disabled={bookmarkImporting} onClick={importFromHtml}><UploadSimple size={18} />从 HTML 导入</button>
            <div className="settings-dialog-actions">
              <button type="button" onClick={() => setSettingsPanel("bookmarks")}>返回</button>
              <button className="primary" type="button" disabled={bookmarkImporting || selectedBookmarkSources.length === 0} onClick={importFromBrowsers}>{bookmarkImporting ? "导入中" : "导入所选"}</button>
            </div>
          </div>
        </SettingsDialog>
      )}

      {bookmarksPageOpen && (
        <section className="bookmarks-page" aria-label="收藏夹">
          <header className="bookmarks-page-header">
            <BookmarkSimple size={20} weight="fill" />
            <h1>收藏夹</h1>
          </header>
          <div className="bookmark-organizer">
            <div className="bookmark-organizer-toolbar">
              <div className="bookmark-manage-search"><MagnifyingGlass size={15} /><input value={bookmarkManageQuery} onChange={(event) => setBookmarkManageQuery(event.target.value)} placeholder="搜索收藏夹" aria-label="搜索收藏夹" /><span>{managedBookmarks.length}</span></div>
              {bookmarkManageSelection.size > 0 && (
                <div className="bookmark-organizer-selection-actions">
                  <span>已选 {bookmarkManageSelection.size}</span>
                  <button type="button" onClick={() => copyManagedBookmarks([...bookmarkManageSelection])}><CopySimple size={15} />复制</button>
                  <button type="button" onClick={() => removeManagedBookmarks([...bookmarkManageSelection])}><Trash size={15} />删除</button>
                </div>
              )}
            </div>
            <div className="bookmark-organizer-body">
              <aside aria-label="收藏夹目录">
                <BookmarkManagerTree
                  bookmarks={bookmarkLibrary}
                  expanded={bookmarkManageExpanded}
                  folder={bookmarkManageFolder}
                  folders={bookmarkManageFolders}
                  onDragEnd={() => setBookmarkManageDragItem(null)}
                  onDragStart={(path) => setBookmarkManageDragItem({ type: "folder", path })}
                  onDrop={(path) => dropManagedItem({ type: "folder", path })}
                  onSelect={(path) => { setBookmarkManageFolder(path); setBookmarkManageQuery(""); setBookmarkManageSelection(new Set()); }}
                  onToggle={(path) => setBookmarkManageExpanded((current) => { const next = new Set(current); if (next.has(path)) next.delete(path); else next.add(path); return next; })}
                />
              </aside>
              <section className="bookmark-organizer-content" aria-label={bookmarkManageFolder || "书签栏"}>
                <div className="bookmark-organizer-column-heading"><FolderOpen size={17} /><strong>{bookmarkManageQuery ? "搜索结果" : folderNameFromPath(bookmarkManageFolder) || "书签栏"}</strong></div>
                {bookmarkManageDraft && (
                  <div className="bookmark-manage-editor">
                    <input aria-label="名称" value={bookmarkManageDraft.title} onChange={(event) => setBookmarkManageDraft((draft) => ({ ...draft, title: event.target.value }))} />
                    <input aria-label="网址" value={bookmarkManageDraft.url} onChange={(event) => setBookmarkManageDraft((draft) => ({ ...draft, url: event.target.value }))} />
                    <button type="button" onClick={() => setBookmarkManageDraft(null)}>取消</button><button className="primary" type="button" onClick={saveManagedBookmark}>保存</button>
                  </div>
                )}
                <div className="bookmark-manage-list">
                  {bookmarkManageChildFolders.map((path) => (
                    <div className="bookmark-manage-row is-folder" key={path} draggable onDragStart={(event) => { setBookmarkManageDragItem({ type: "folder", path }); event.dataTransfer.effectAllowed = "move"; }} onDragEnd={() => setBookmarkManageDragItem(null)} onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "move"; }} onDrop={(event) => { event.preventDefault(); event.stopPropagation(); dropManagedItem({ type: "folder", path, position: "before" }); }}>
                      <span className="bookmark-organizer-folder-spacer" />
                      <button className="bookmark-manage-main" type="button" onDoubleClick={() => setBookmarkManageFolder(path)}><FolderSimple size={18} /><span><strong>{folderNameFromPath(path)}</strong><small>文件夹</small></span></button>
                      <span />
                      <button type="button" aria-label={`打开 ${folderNameFromPath(path)}`} onClick={() => setBookmarkManageFolder(path)}><CaretRight size={15} /></button>
                    </div>
                  ))}
                  {managedBookmarks.map((bookmark) => {
                    const selected = bookmarkManageSelection.has(bookmark.url);
                    return (
                      <div className={`bookmark-manage-row${selected ? " is-selected" : ""}`} key={bookmark.url} draggable onDragStart={(event) => { setBookmarkManageDragItem({ type: "bookmark", url: bookmark.url }); event.dataTransfer.effectAllowed = "move"; }} onDragEnd={() => setBookmarkManageDragItem(null)} onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "move"; }} onDrop={(event) => { event.preventDefault(); dropManagedItem({ type: "bookmark", url: bookmark.url, folder: bookmark.folder }); }} onContextMenu={(event) => { event.preventDefault(); if (!selected) setBookmarkManageSelection(new Set([bookmark.url])); setBookmarkManageContext({ x: event.clientX, y: event.clientY, urls: selected ? [...bookmarkManageSelection] : [bookmark.url] }); }}>
                        <button className="bookmark-organizer-check" type="button" role="checkbox" aria-checked={selected} aria-label={`选择 ${bookmark.title}`} onClick={() => setBookmarkManageSelection((current) => { const next = new Set(current); if (next.has(bookmark.url)) next.delete(bookmark.url); else next.add(bookmark.url); return next; })}>{selected ? <CheckSquare size={15} weight="fill" /> : <Square size={15} />}</button>
                        <button className="bookmark-manage-main" type="button" onDoubleClick={() => openBookmark(bookmark)}><BookmarkFavicon bookmark={bookmark} /><span><strong>{bookmark.title}</strong><small>{bookmark.url}</small></span></button>
                        <button className="bookmark-organizer-edit" type="button" aria-label={`编辑 ${bookmark.title}`} onClick={() => setBookmarkManageDraft({ originalUrl: bookmark.url, url: bookmark.url, title: bookmark.title, folder: bookmark.folder || "" })}><PencilSimple size={15} /></button>
                        <button type="button" aria-label={`更多 ${bookmark.title}`} onClick={(event) => setBookmarkManageContext({ x: event.clientX, y: event.clientY, urls: selected ? [...bookmarkManageSelection] : [bookmark.url] })}><DotsThreeVertical size={17} weight="bold" /></button>
                      </div>
                    );
                  })}
                  {!bookmarkManageChildFolders.length && !managedBookmarks.length && <div className="settings-secondary-empty"><BookmarkSimple size={22} /><span>此文件夹为空</span></div>}
                </div>
              </section>
            </div>
            {bookmarkManageContext && (
              <><button className="bookmark-organizer-context-backdrop" type="button" aria-label="关闭菜单" onClick={() => setBookmarkManageContext(null)} /><div className="bookmark-organizer-context" role="menu" style={{ left: Math.min(bookmarkManageContext.x, window.innerWidth - 150), top: Math.min(bookmarkManageContext.y, window.innerHeight - 90) }}><button type="button" role="menuitem" onClick={() => copyManagedBookmarks(bookmarkManageContext.urls)}><CopySimple size={15} />复制</button><button type="button" role="menuitem" onClick={() => removeManagedBookmarks(bookmarkManageContext.urls)}><Trash size={15} />删除</button></div></>
            )}
          </div>
        </section>
      )}

      {settingsPanel === "model-guard" && (
        <SettingsDialog
          title="大模型护航"
          onBack={backToSettingsMenu}
          onClose={() => setSettingsPanel("")}
        >
          <div className="model-guard-settings">
            <section className="model-provider-list" aria-label="已添加的 API">
              <div className="model-guard-section-title">
                <span>已添加的 API</span>
                <small>{modelProviders.length ? `${modelProviders.length} 项` : "暂无"}</small>
              </div>
              {modelProviders.map((provider) => (
                <div className={`model-provider-row${provider.isDefault ? " is-default" : ""}`} key={provider.id}>
                  <button
                    className="model-provider-radio"
                    type="button"
                    role="radio"
                    aria-checked={provider.isDefault}
                    aria-label={`设为默认：${provider.name}`}
                    onClick={() => setDefaultModelProvider(provider.id)}
                  >
                    {provider.isDefault && <span />}
                  </button>
                  <span className="model-provider-icon"><Key size={16} /></span>
                  <span className="model-provider-copy">
                    <strong>{provider.name}</strong>
                    <small>******** · {provider.baseUrl || "尚未填写 API 地址"}</small>
                    <em>{provider.selectedModel || provider.models?.[0] || "暂未绑定模型"}</em>
                  </span>
                  <span className="model-provider-actions">
                    <button
                      type="button"
                      aria-label={`编辑 ${provider.name}`}
                      onClick={() => editModelProvider(provider)}
                    >
                      <PencilSimple size={15} />
                    </button>
                    <button
                      type="button"
                      aria-label={`删除 ${provider.name}`}
                      onClick={() => deleteModelProvider(provider.id)}
                    >
                      <Trash size={15} />
                    </button>
                  </span>
                </div>
              ))}
              {!modelProviders.length && (
                <div className="model-provider-empty">
                  <ShieldCheck size={21} />
                  <span>暂未绑定模型</span>
                </div>
              )}
            </section>

            <form className="model-provider-form" onSubmit={saveModelProvider}>
              <div className="model-guard-section-title">
                <span>{modelProviderDraft.id ? "编辑 API" : "添加 API"}</span>
                {modelProviderDraft.id && <small>API Key 不会显示在界面中</small>}
              </div>
              <label>
                名称
                <input
                  value={modelProviderDraft.name}
                  placeholder="例如：我的模型 API"
                  onChange={(event) => setModelProviderDraft((draft) => ({ ...draft, name: event.target.value }))}
                />
              </label>
              <label>
                OpenAI-compatible API 地址
                <input
                  value={modelProviderDraft.baseUrl}
                  placeholder="https://api.example.com/v1"
                  inputMode="url"
                  onChange={(event) => setModelProviderDraft((draft) => ({ ...draft, baseUrl: event.target.value }))}
                />
                <small>填写后将通过 `/models` 自动识别真实模型。</small>
              </label>
              <label>
                API Key
                <input
                  value={modelProviderDraft.apiKey}
                  placeholder={modelProviderDraft.id ? "********（留空则保留原 Key）" : "粘贴 API Key"}
                  type="password"
                  autoComplete="off"
                  spellCheck="false"
                  onChange={(event) => setModelProviderDraft((draft) => ({ ...draft, apiKey: event.target.value }))}
                />
                {modelProviderDraft.id && <small>只有输入新的 API Key 才会替换原凭证。</small>}
              </label>
              <label className="model-provider-default-toggle">
                <input
                  type="checkbox"
                  checked={modelProviderDraft.makeDefault}
                  onChange={(event) => setModelProviderDraft((draft) => ({ ...draft, makeDefault: event.target.checked }))}
                />
                <span>{modelProviderDraft.id ? "设为默认 API" : "添加后设为默认"}</span>
              </label>
              {modelProviderError && <p className="model-provider-error">{modelProviderError}</p>}
              <div className="settings-dialog-actions">
                <button
                  type="button"
                  onClick={modelProviderDraft.id ? cancelModelProviderEdit : () => setSettingsPanel("")}
                >
                  {modelProviderDraft.id ? "取消编辑" : "取消"}
                </button>
                <button className="primary" type="submit" disabled={modelProviderSaving}>
                  {modelProviderSaving ? "识别模型中…" : modelProviderDraft.id ? "保存修改" : "安全保存"}
                </button>
              </div>
            </form>
          </div>
        </SettingsDialog>
      )}

      {settingsPanel === "screenshot" && (
        <SettingsDialog
          title="截图"
          onBack={backToSettingsMenu}
          onClose={() => setSettingsPanel("")}
        >
          <div className="screenshot-choice-list">
            <button type="button" onClick={() => captureScreenshot("selection")}>
              <Selection size={22} />
              <span>
                <strong>选择区域</strong>
              </span>
              <CaretRight size={17} />
            </button>
            <button type="button" onClick={() => captureScreenshot("visible")}>
              <Camera size={22} />
              <span>
                <strong>可见页面</strong>
              </span>
              <CaretRight size={17} />
            </button>
            <button type="button" onClick={() => captureScreenshot("full-page")}>
              <ArrowsOut size={22} />
              <span>
                <strong>完整页面</strong>
              </span>
              <CaretRight size={17} />
            </button>
          </div>
        </SettingsDialog>
      )}

      {settingsPanel === "about" && (
        <SettingsDialog title="关于 Brizo" onBack={backToSettingsMenu} onClose={() => setSettingsPanel("")}>
          <div className="about-brizo">
            <div className="about-brand">
              <img className="about-brand-mark" src={brizoLogoUrl} alt="" />
              <div>
                <strong>Brizo {appInfo?.version || ""}</strong>
                <small>A focused browser for research and saved knowledge.</small>
              </div>
            </div>
            <dl>
              <div><dt>Electron</dt><dd>{appInfo?.electron || "—"}</dd></div>
              <div><dt>Chromium</dt><dd>{appInfo?.chrome || "—"}</dd></div>
              <div><dt>Privacy</dt><dd>Remote permissions denied by default</dd></div>
            </dl>
            <p>
              Private windows use an isolated in-memory browser session. Bookmark imports and
              screenshots stay on this Mac unless you choose to move them.
            </p>
          </div>
        </SettingsDialog>
      )}

      {toast && <div className="toast" role="status">{toast}</div>}

      <TabContextMenu
        contextMenu={tabContextMenu}
        onClose={() => setTabContextMenu(null)}
        onTogglePin={toggleTabPinned}
        onCloseTab={closeTab}
        onCloseOtherTabs={closeOtherTabs}
        onNewTab={openNewTab}
        onReload={reloadTab}
        onCopyUrl={copyTabUrl}
      />
    </SoftBlurIn>
  );
}
