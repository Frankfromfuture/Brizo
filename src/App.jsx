import { createBookmarkVisitWeights } from "../shared/bookmark-visit-weights.mjs";
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { BorderBeam } from "border-beam";
import { ASK_BEAM_PRESET } from "./components/ask-beam-preset.mjs";
import { formatUseUsage, normalizeUseUsage } from "../shared/use-usage.mjs";
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
  SidebarSimple,
  Sparkle,
  Square,
  SquaresFour,
  UploadSimple,
  UserCircle,
  Trash,
  X,
} from "@phosphor-icons/react";
import { ArrowLeftIcon } from "./components/remocn/icon-arrow-left";
import { ArrowRightIcon } from "./components/remocn/icon-arrow-right";
import { StarIcon } from "./components/remocn/icon-star";
import { DownloadIcon } from "./components/remocn/icon-download";
import { FileTextIcon } from "./components/remocn/icon-file-text";
import { MoreHorizontalIcon } from "./components/remocn/icon-more-horizontal";
import { MonitorIcon } from "./components/remocn/icon-monitor";
import { PlusIcon } from "./components/remocn/icon-plus";
import { RefreshCwIcon } from "./components/remocn/icon-refresh-cw";
import { SparklesIcon } from "./components/remocn/icon-sparkles";
import { CompassIcon } from "./components/remocn/icon-compass";
import { SoftBlurIn } from "./components/remocn/soft-blur-in";
import { RemocnSelect } from "./components/remocn/RemocnSelect";
import { NewTabParticleBackground } from "./components/NewTabParticleBackground";
import { UseTaskIcon } from "./components/UseTaskIcon.jsx";
import { BookmarkFolderIcon } from "./components/BookmarkFolderIcon.jsx";
import { LibraryPageFrame } from "./LibraryPageFrame.jsx";
import { SettingsPage } from "./SettingsPage.jsx";
import {
  DEFAULT_APP_PREFERENCES,
  DEFAULT_SITE_HYGIENE_PREFERENCES,
  SETTINGS_SECTIONS,
} from "./settings/settingsCatalog.js";
import brizoLogoUrl from "../logo pic.svg";
import brizoWordLogoUrl from "../logo word.svg";
import errorTabIconUrl from "./anchor.svg";
import brizoStarIconUrl from "./icons/brizo-star.svg";
import bingSearchIconUrl from "./icons/search-bing.svg";
import bingSearchColorIconUrl from "./icons/search-bing-color.svg";
import googleSearchIconUrl from "./icons/search-google.svg";
import googleSearchColorIconUrl from "./icons/search-google-color.svg";
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
  languageForInput,
  matchesRequestedLanguage,
  queryFromSearchShareUrl,
} from "../shared/search-text.mjs";

const LazyBriefPage = lazy(() => import("./BriefPage.jsx").then((module) => ({ default: module.BriefPage })));

const IDLE_BENCHMARK_MODE = window.location.hash === "#idle-benchmark";
const NEW_TAB_CHROME_COLOR = "rgb(252, 250, 250)";
const BOOKMARK_SMART_RANK_THRESHOLD = 5;
const COLLAPSED_TAB_HOVER_DELAY_MS = 500;
const COLLAPSED_TAB_FOCUS_DELAY_MS = 120;
const COLLAPSED_TAB_HOVER_DISMISS_DELAY_MS = 600;
const COLLAPSED_TAB_HOVERCARD_ID = "brizo-collapsed-tab-hovercard";
const COLLAPSED_TAB_HOVERCARD_WIDTH = 180;
const COLLAPSED_TAB_HOVERCARD_GAP = 10;
const COLLAPSED_TAB_HOVERCARD_VIEWPORT_INSET = 8;
const SIDEBAR_AUTO_COLLAPSE_WIDTH = 860;

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

const LANGUAGE_OPTIONS = [
  { value: "zh-CN", label: "简体中文" },
  { value: "en", label: "English" },
  { value: "system", label: "跟随系统" },
];

const COOKIE_CHOICE_OPTIONS = [
  { value: "essential", label: "仅必要（推荐）" },
  { value: "ask", label: "每次询问" },
  { value: "allow-all", label: "全部允许" },
];

const PAGE_CLEANUP_OPTIONS = [
  { value: "balanced", label: "平衡（推荐）" },
  { value: "strict", label: "严格" },
  { value: "off", label: "关闭" },
];

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
  if (/^brizo:\/\/(?:settings|bookmarks|history|downloads)(?:\/|$)/i.test(address || "")) return address;
  if (!address || address.startsWith("brizo://")) {
    return "";
  }
  try {
    const url = new URL(address);
    return url.host;
  } catch {
    return address;
  }
}

function formatCollapsedTabHoverAddress(tab) {
  const address = String(tab?.url || "").trim();
  if (!address) return "";
  return getPrimaryDomain(address || tab?.domain);
}

function getCollapsedTabHovercardPosition(anchor) {
  const rect = anchor.getBoundingClientRect();
  const sidebarRect = document.querySelector(".spaces-panel")?.getBoundingClientRect();
  const tabsRect = document.querySelector(".sidebar-tabs-section")?.getBoundingClientRect();
  const browserSurfaceRect = document.querySelector(".browser-surface")?.getBoundingClientRect();
  const viewportInset = COLLAPSED_TAB_HOVERCARD_VIEWPORT_INSET;
  const width = Math.min(
    COLLAPSED_TAB_HOVERCARD_WIDTH,
    Math.max(0, window.innerWidth - (viewportInset * 2)),
  );
  const estimatedHeight = 115;
  const visualSidebarBoundary = Math.max(
    sidebarRect?.right || rect.right,
    tabsRect?.right || 0,
    browserSurfaceRect?.left || 0,
  );
  const preferredLeft = visualSidebarBoundary + COLLAPSED_TAB_HOVERCARD_GAP;
  const left = preferredLeft + width <= window.innerWidth - viewportInset
    ? preferredLeft
    : Math.max(viewportInset, rect.left - width - COLLAPSED_TAB_HOVERCARD_GAP);
  const preferredTop = rect.top + ((rect.height - estimatedHeight) / 2);
  const top = Math.min(
    Math.max(viewportInset, preferredTop),
    Math.max(viewportInset, window.innerHeight - estimatedHeight - viewportInset),
  );
  return {
    left: Math.round(left),
    top: Math.round(top),
    width: Math.round(width),
  };
}

const COMMON_WEBSITES = [
  ["google.com", "Google"], ["baidu.com", "百度"], ["bilibili.com", "哔哩哔哩"],
  ["github.com", "GitHub"], ["youtube.com", "YouTube"], ["wikipedia.org", "Wikipedia"],
  ["zhihu.com", "知乎"], ["weibo.com", "微博"], ["douban.com", "豆瓣"],
  ["taobao.com", "淘宝"], ["jd.com", "京东"], ["xiaohongshu.com", "小红书"],
].map(([domain, title]) => ({ title, url: `https://${domain}` }));

const SITE_BRAND_NAMES = {
  "google.com": "Google",
  "google.com.hk": "Google",
  "google.cn": "Google",
  "baidu.com": "百度",
  "bilibili.com": "哔哩哔哩",
  "github.com": "GitHub",
  "youtube.com": "YouTube",
  "wikipedia.org": "维基百科",
  "zhihu.com": "知乎",
  "weibo.com": "微博",
  "douban.com": "豆瓣",
  "taobao.com": "淘宝",
  "jd.com": "京东",
  "tmall.com": "天猫",
  "xiaohongshu.com": "小红书",
  "twitter.com": "X (Twitter)",
  "x.com": "X",
  "openai.com": "OpenAI",
  "chatgpt.com": "ChatGPT",
  "claude.ai": "Claude",
  "anthropic.com": "Anthropic",
  "microsoft.com": "Microsoft",
  "bing.com": "Bing",
  "apple.com": "Apple",
  "v2ex.com": "V2EX",
  "juejin.cn": "稀土掘金",
  "sspai.com": "少数派",
  "reddit.com": "Reddit",
  "notion.so": "Notion",
  "figma.com": "Figma",
  "medium.com": "Medium",
  "stackoverflow.com": "Stack Overflow",
  "qq.com": "腾讯",
  "163.com": "网易",
  "sina.com.cn": "新浪",
  "sohu.com": "搜狐",
  "ftchinese.com": "FT中文网",
  "nytimes.com": "纽约时报",
  "wsj.com": "华尔街日报",
  "bloomberg.com": "Bloomberg",
  "reuters.com": "Reuters",
  "huggingface.co": "Hugging Face",
  "deepseek.com": "DeepSeek",
};

function getPrimaryDomain(urlOrDomain) {
  if (!urlOrDomain || typeof urlOrDomain !== "string") return "";
  let host = "";
  try {
    if (urlOrDomain.startsWith("http://") || urlOrDomain.startsWith("https://") || urlOrDomain.startsWith("brizo://")) {
      host = new URL(urlOrDomain).hostname;
    } else {
      host = urlOrDomain.split("/")[0].split(":")[0];
    }
  } catch {
    host = urlOrDomain;
  }
  if (typeof host !== "string") return "";
  host = host.toLowerCase().replace(/^www\./, "");
  if (!host || host === "brizo") return "";

  const parts = host.split(".");
  if (parts.length <= 2) return host;
  const multiPartTlds = ["com.cn", "com.hk", "co.uk", "co.jp", "edu.cn", "org.cn", "net.cn", "gov.cn", "org.uk", "ac.uk"];
  const lastTwo = parts.slice(-2).join(".");
  if (multiPartTlds.includes(lastTwo) && parts.length >= 3) {
    return parts.slice(-3).join(".");
  }
  return parts.slice(-2).join(".");
}

function getSiteDisplayName(primaryDomain, fallbackTab) {
  if (!primaryDomain || typeof primaryDomain !== "string") return fallbackTab?.shortTitle || fallbackTab?.title || "标签组";
  if (SITE_BRAND_NAMES[primaryDomain]) return SITE_BRAND_NAMES[primaryDomain];

  if (fallbackTab?.title && typeof fallbackTab.title === "string") {
    const parts = fallbackTab.title.split(/\s*[-|_—·]\s*/);
    if (parts.length > 1) {
      const lastPart = parts[parts.length - 1].trim();
      if (lastPart && lastPart.length <= 15 && !lastPart.includes("/")) {
        return lastPart;
      }
    }
  }

  const mainPart = String(primaryDomain).split(".")[0];
  if (mainPart) {
    return mainPart.charAt(0).toUpperCase() + mainPart.slice(1);
  }
  return primaryDomain;
}

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

function newTabSuggestionsFor(rawInput, bookmarks, tabs, history) {
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
  const seen = new Set();
  return historyMatches.filter((item) => {
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
    useUsage: normalizeUseUsage(result.useUsage),
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
          imageUrl: "",
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
        imageUrl: "",
        source: String(item?.source || "").slice(0, 300),
        title: String(item?.title || "").slice(0, 500),
        url: String(item?.url || "").slice(0, 4_000),
      }))
      : [],
    depth: ["fast", "balanced", "deep"].includes(result.depth) ? result.depth : "",
    degraded: Boolean(result.degraded),
    grounded: result.grounded !== false,
    notices: Array.isArray(result.notices)
      ? result.notices
        .map((item) => String(item).slice(0, 500))
        .filter((item) => !item.startsWith("答案的结构化引用覆盖率为"))
        .slice(0, 4)
      : [],
    sources: Array.isArray(result.sources)
      ? result.sources.slice(0, 12).map((source) => ({
        domain: String(source?.domain || "").slice(0, 300),
        imageUrl: "",
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

function Logo({ collapsed = false }) {
  return (
    <div className={`brand${collapsed ? " is-collapsed" : ""}`} aria-label="Brizo home">
      <img className="brizo-mark" src={brizoLogoUrl} alt="Brizo" />
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
  const visibleItems = items
    .map((item, originalIndex) => ({ item, originalIndex }))
    .filter(({ originalIndex }) => !failedImages.has(originalIndex));
  if (!visibleItems.length) return null;
  const isPerson = entity?.kind === "person";
  return (
    <aside className="new-tab-entity-images" aria-label={`${entity?.name || "实体"}${isPerson ? "人物照片" : "示意图片"}`}>
      <h3>{isPerson ? "人物照片" : "示意图片"}</h3>
      <div>
        {visibleItems.map(({ item, originalIndex }) => (
          <button
            data-context-url={item.url}
            key={`${item.imageUrl}-${originalIndex}`}
            type="button"
            onClick={() => onOpenSource(item.url)}
          >
            <img
              src={item.imageUrl || item.thumbnailUrl}
              alt={item.title || entity?.name || (isPerson ? "人物照片" : "实体示意图片")}
              onError={() => setFailedImages((current) => new Set([...current, originalIndex]))}
            />
            <span>
              <strong>{item.title || entity?.name}</strong>
              <small>{item.authority === "official" ? "官方来源" : item.authority === "related" ? "相关来源" : "权威来源"} · {item.source || item.domain}</small>
            </span>
          </button>
        ))}
      </div>
    </aside>
  );
}

const sourceFaviconRequests = new Map();

function resolveSourceFavicon(origin) {
  if (!window.beanBrowser?.resolveBookmarkFavicons) return Promise.resolve("");
  if (!sourceFaviconRequests.has(origin)) {
    // Share both pending requests and resolved icons across cards and the stack.
    // The existing native resolver also reuses the on-disk website-icon cache.
    const request = Promise.resolve()
      .then(() => window.beanBrowser.resolveBookmarkFavicons([{ url: `${origin}/` }]))
      .then((items) => items?.find((item) => item?.faviconUrl)?.faviconUrl || "")
      .catch(() => "");
    sourceFaviconRequests.set(origin, request);
    if (sourceFaviconRequests.size > 128) sourceFaviconRequests.delete(sourceFaviconRequests.keys().next().value);
  }
  return sourceFaviconRequests.get(origin);
}

function SourceFavicon({ className = "", source }) {
  const [resolved, setResolved] = useState({ origin: "", url: "" });
  const [failedUrl, setFailedUrl] = useState("");
  const suppliedIcon = /^(?:data:image\/|blob:)/iu.test(source.imageUrl || "") ? source.imageUrl : "";
  let origin = "";
  try {
    const page = new URL(source.url);
    if (["http:", "https:"].includes(page.protocol)) origin = page.origin;
  } catch { /* A source without a web address keeps its fallback glyph. */ }
  useEffect(() => {
    if (suppliedIcon || !origin) return undefined;
    let cancelled = false;
    // Presentation-only work: never await icons in the search/token pipeline.
    resolveSourceFavicon(origin).then((url) => {
      if (!cancelled && /^(?:data:image\/|blob:)/iu.test(url)) setResolved({ origin, url });
    });
    return () => { cancelled = true; };
  }, [origin, suppliedIcon]);
  const faviconUrl = suppliedIcon || (resolved.origin === origin ? resolved.url : "");
  const fallback = (source.domain || source.title || "网").slice(0, 1).toUpperCase();
  return (
    <span className={`${className}${faviconUrl && failedUrl !== faviconUrl ? " has-image" : ""}`} aria-hidden="true">
      {faviconUrl && failedUrl !== faviconUrl
        ? <img src={faviconUrl} alt="" decoding="async" onError={() => setFailedUrl(faviconUrl)} />
        : <span>{fallback}</span>}
    </span>
  );
}

function SearchSources({ expanded, id, onOpenSource, onToggle, sources }) {
  const rankedSources = useMemo(() => sources.map((source, citationIndex) => ({
    ...source,
    citationIndex: Number.isInteger(source?.rank) ? source.rank + 1 : citationIndex + 1,
    displayRank: Number.isInteger(source?.rank) ? source.rank : citationIndex,
  })).sort((left, right) => left.displayRank - right.displayRank), [sources]);
  const visibleSources = expanded ? rankedSources : rankedSources.slice(0, 3);
  if (!rankedSources.length) return null;
  return (
    <section className={`new-tab-sources${expanded ? " is-expanded" : ""}`} aria-label="来源">
      <div className="new-tab-sources-heading">
        <h3>来源</h3>
      </div>
      <div className="new-tab-source-list" id={id}>
        {visibleSources.map((source) => {
          return (
            <button
              data-context-url={source.url}
              key={`${source.url}-${source.citationIndex}`}
              type="button"
              aria-label={`打开来源 ${source.citationIndex}：${source.title || source.domain || source.url}`}
              onClick={() => onOpenSource(source.url)}
            >
              <span className="new-tab-source-card-meta">
                <SourceFavicon className="new-tab-source-favicon" source={source} />
                <small>{source.domain || source.url}</small>
              </span>
              <strong>{source.title || source.domain || "网页来源"}</strong>
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
    domain: "brief",
    id: "pinned-brief",
    isPinned: true,
    isBrief: true,
    shortTitle: "Brief",
    title: "Brizo Brief 简报",
    url: "brizo://brief",
    iconKey: "brief",
  },
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

const DOWNLOAD_PAGE_SECTIONS = [
  { id: "all", label: "全部" },
  { id: "active", label: "进行中" },
  { id: "completed", label: "已完成" },
  { id: "unavailable", label: "不可用" },
];

function isActiveDownload(download) {
  return download?.state === "downloading" || download?.state === "paused";
}

function isCompletedDownload(download) {
  return download?.state === "completed" && !download?.isMissing;
}

function isUnavailableDownload(download) {
  return Boolean(download?.isMissing)
    || download?.state === "interrupted"
    || download?.state === "cancelled";
}

function downloadMatchesSection(download, section) {
  if (section === "active") return isActiveDownload(download);
  if (section === "completed") return isCompletedDownload(download);
  if (section === "unavailable") return isUnavailableDownload(download);
  return true;
}

function downloadStatusLabel(download) {
  if (download?.isMissing) return "文件已移动或删除";
  if (download?.state === "downloading") return "正在下载";
  if (download?.state === "paused") return "已暂停";
  if (download?.state === "completed") return "已完成";
  if (download?.state === "interrupted") return "下载中断";
  if (download?.state === "cancelled") return "已取消";
  return "状态未知";
}

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

function DownloadPanel({ downloads, onAction, onOpenDirectory, onOpenDownloads }) {
  return (
    <>
      <header className="downloads-popover-header">
        <h2>最近下载</h2>
        <div className="downloads-popover-header-actions">
          <button
            className="downloads-header-button"
            type="button"
            aria-label="显示下载内容"
            title="显示下载内容"
            onClick={onOpenDownloads}
          >
            <ListBullets size={17} />
          </button>
          <button
            className="downloads-header-button"
            type="button"
            aria-label="打开下载目录"
            title="打开下载目录"
            onClick={onOpenDirectory}
          >
            <FolderOpen size={17} />
          </button>
        </div>
      </header>
      <div className="downloads-list">
        {downloads.length ? downloads.map((download) => {
          const isActive = download.state === "downloading" || download.state === "paused";
          const isCompleted = download.state === "completed" && !download.isMissing;
          return (
            <div
              className={`download-row${download.isMissing ? " is-missing" : ""}`}
              data-state={download.state}
              key={download.id}
            >
              <span className="download-row-icon" aria-hidden="true">
                {download.thumbnailDataUrl && !download.isMissing
                  ? <img className="is-thumbnail" src={download.thumbnailDataUrl} alt="" />
                  : download.fileIconDataUrl && !download.isMissing
                    ? <img className="is-file-icon" src={download.fileIconDataUrl} alt="" />
                    : <AttachedIcon src={downloadIconUrl} size={16} />}
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
        }) : (
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
      const cornerRadius = Math.min(24, lightHeight / 2);

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

function NewTabPage({ active, activeTabId, availableModels, bookmarks, history, initialContextTab = null, initialMode = "ask", initialPrompt, initialUseCommand = "", onNotify, onOpenSource, onRestoreHistory, onRestorePreviousSession, onSearchComplete, onSubmit, onUseProgress, onUseSubmit, prefillPrompt = "", restoredResult = null, tabs, useTodayGreeting }) {
  const [greeting] = useState(() => {
    const pair = NEW_TAB_GREETINGS[Math.floor(Math.random() * NEW_TAB_GREETINGS.length)];
    return pair[useTodayGreeting ? 0 : 1];
  });
  const [prompt, setPrompt] = useState(prefillPrompt || initialUseCommand || restoredResult?.query || "");
  const [commandMode, setCommandMode] = useState(initialMode === "use" ? "use" : "ask");
  const [promptFocused, setPromptFocused] = useState(false);
  const [attachments, setAttachments] = useState([]);
  const [contextTabs, setContextTabs] = useState(() => initialContextTab ? [initialContextTab] : []);
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
  const historyMenuRef = useRef(null);
  const tabMenuRef = useRef(null);
  const promptInputRef = useRef(null);
  const resultsRef = useRef(null);
  const useStepsRef = useRef(null);
  const followStream = useRef(true);
  const searchSequence = useRef(0);
  const activeSearchId = useRef("");
  const searchQueryRef = useRef("");
  const tokenBuffer = useRef("");
  const tokenFrame = useRef(0);
  const initialPromptStarted = useRef(false);
  const usePauseRequest = useRef(false);
  const activeUseSessionId = useRef("");
  const useRunPending = useRef(false);
  const useSequence = useRef(0);
  const initialUseStarted = useRef(false);
  const useRunActive = useRunPending.current
    && (searchState === "loading" || searchState === "streaming");
  const availableTabs = useMemo(
    () => tabs.filter((tab) =>
      tab.id !== activeTabId
      && !tab.isNewTab
      && /^https?:\/\//i.test(tab.url || "")
    ),
    [activeTabId, tabs],
  );
  const selectedContextTabIds = useMemo(
    () => new Set(contextTabs.map((tab) => tab.id)),
    [contextTabs],
  );
  const promptSuggestions = useMemo(
    () => commandMode === "ask" && promptFocused && searchState === "idle"
      ? newTabSuggestionsFor(prompt, bookmarks, tabs, history)
      : [],
    [bookmarks, commandMode, history, prompt, promptFocused, searchState, tabs],
  );

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
    const availableById = new Map(availableTabs.map((tab) => [tab.id, tab]));
    setContextTabs((current) => {
      const next = current
        .filter((tab) => availableById.has(tab.id))
        .map((tab) => availableById.get(tab.id) || tab);
      const unchanged = next.length === current.length
        && next.every((tab, index) => tab === current[index]);
      return unchanged ? current : next;
    });
  }, [availableTabs]);

  useEffect(() => {
    if (!tabMenuOpen) return undefined;
    const closeOnOutsidePointer = (event) => {
      if (!tabMenuRef.current?.contains(event.target)) setTabMenuOpen(false);
    };
    const closeOnEscape = (event) => {
      if (event.key === "Escape") setTabMenuOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer, true);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer, true);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [tabMenuOpen]);

  const onSearchCompleteRef = useRef(onSearchComplete);
  useEffect(() => {
    onSearchCompleteRef.current = onSearchComplete;
  }, [onSearchComplete]);

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
        onSearchCompleteRef.current?.({ query: searchQueryRef.current, result });
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
      if (tokenFrame.current) window.cancelAnimationFrame(tokenFrame.current);
    };
  }, []);

  useEffect(() => {
    if (!window.beanBrowser?.onBrizoUseProgress) return undefined;
    return window.beanBrowser.onBrizoUseProgress((event) => {
      if (!activeUseSessionId.current || event?.sessionId !== activeUseSessionId.current) return;
      onUseProgress?.(event);
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
  }, [onUseProgress]);

  useEffect(() => {
    const list = useStepsRef.current;
    if (!list || !useTraceExpanded) return;
    const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    list.scrollTo({ top: list.scrollHeight, behavior: reducedMotion ? "auto" : "smooth" });
  }, [useSandboxView.steps.length, useTraceExpanded]);

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
    const result = await onSubmit({ attachments, contextTabs, depth: "auto", model, searchId, tabId: activeTabId, thread: searchThread, value });
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
    if (useRunPending.current) return;
    const sequence = useSequence.current + 1;
    useSequence.current = sequence;
    useRunPending.current = true;
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
    const sessionId = `use-${activeTabId}-${window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
    activeUseSessionId.current = sessionId;
    setSearchStage("正在创建下级自动操作标签");
    let result;
    try {
      result = await onUseSubmit?.({
        command: value,
        sessionId,
        tabId: activeTabId,
      });
    } catch (error) {
      result = {
        status: "error",
        message: `Use 启动失败：${error instanceof Error ? error.message : String(error)}`,
        sources: [],
      };
    }
    if (useSequence.current !== sequence) return;
    useRunPending.current = false;
    setSearchResult(result || { status: "error", message: "Use 运行时不可用。", sources: [] });
    setUsePaused(false);
    setUseTraceExpanded(false);
    setSearchState(result?.status === "success" || result?.status === "preview" ? "success" : "error");
    setSearchStage("");
  };

  const chooseAttachments = async () => {
    if (!window.beanBrowser?.chooseSearchAttachments) {
      onNotify?.("本地附件读取仅在 Brizo 桌面版可用");
      return;
    }
    const result = await window.beanBrowser.chooseSearchAttachments();
    if (result?.status === "cancelled") return;
    const selected = Array.isArray(result?.attachments) ? result.attachments : [];
    setAttachments(selected);
    if (selected.length) onNotify?.(`已选择 ${selected.length} 个本地附件`);
    const firstError = Array.isArray(result?.errors) ? result.errors[0] : null;
    if (firstError) onNotify?.(`${firstError.name}：${firstError.message}`);
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
        const resumed = await window.beanBrowser?.resumeBrizoUseCommand?.(activeUseSessionId.current);
        if (resumed) {
          setUsePaused(false);
          setSearchStage("BrowserSkill 已继续");
        }
      } else {
        const paused = await window.beanBrowser?.pauseBrizoUseCommand?.(activeUseSessionId.current);
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
    if (useRunActive) {
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
  const visibleSourceItems = sourceItems;
  const completedUseSteps = Array.isArray(searchResult?.processSteps) && searchResult.processSteps.length
    ? searchResult.processSteps
    : useSandboxView.steps;
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
      `[${Number.isInteger(source?.rank) ? source.rank + 1 : index + 1}] ${source.title || source.domain || "网页来源"}\n${source.url || ""}`
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
          data-tooltip="历史搜索记录"
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
          <span>{commandMode === "use" ? "Brizo Use · 父标签记录" : "Brizo Scout AI"}</span>
          <h2>{searchQuery}</h2>
        </header>

        {waitingForEvidence ? (
          <div className="new-tab-loading-result">
            <SearchLoadingState
              label={searchStage || "正在搜索网页并组织答案…"}
              startedAt={searchStartedAt}
            />
            {commandMode === "use" && (
              <div className={`brizo-use-origin-process ${usePaused ? "is-paused" : "is-running"}`} aria-label="Use 操作记录">
                <div className="brizo-use-origin-process-heading">
                  <span className="brizo-use-sandbox-status"><i />{usePaused ? "下级标签已暂停" : "下级标签正在自动操作"}</span>
                  <span title={useSandboxView.url}>{useSandboxView.title || useSandboxView.url || "正在准备隔离网页"}</span>
                </div>
                <div className="brizo-use-origin-process-body">
                  <div className={`brizo-use-process-trace${useTraceExpanded ? " is-expanded" : ""}`}>
                    <button
                      className="brizo-use-process-trace-toggle"
                      type="button"
                      aria-expanded={useTraceExpanded}
                      onClick={() => setUseTraceExpanded((expanded) => !expanded)}
                    >
                      <Sparkle size={16} weight="fill" aria-hidden="true" />
                      <span>{usePaused ? "操作记录已暂停" : "实时操作记录"}</span>
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
                </div>
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

            {commandMode === "use" && completedUseSteps.length > 0 && (
              <details className="brizo-use-process-summary">
                <summary>查看已折叠的操作记录（{completedUseSteps.length} 步）</summary>
                <ol>{completedUseSteps.map((step, index) => <li key={`${index}-${step}`}>{step}</li>)}</ol>
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
              {searchState === "error" ? (
                <p className="new-tab-error-message">
                  {searchResult?.message || (commandMode === "use" ? "Use 运行时暂时不可用。" : "搜索服务暂时不可用。")}
                </p>
              ) : (
                <article className="new-tab-answer">
                  {searchResult?.message ? (
                    <SearchAnswer
                      message={searchResult.message}
                      sources={commandMode === "use" ? [] : sourceItems}
                      onOpenSource={onOpenSource}
                      streaming={commandMode !== "use" && searchState === "streaming"}
                    />
                  ) : null}
                  {commandMode !== "use" && searchState === "streaming" && searchResult?.message && (
                    <span className="new-tab-stream-caret" aria-hidden="true" />
                  )}
                </article>
              )}
              {searchState !== "error" && (
                <SearchEntityImages
                  entity={searchResult?.visualEntity}
                  images={searchResult?.entityImages}
                  onOpenSource={onOpenSource}
                />
              )}
            </div>

            <SearchVerticalCards cards={searchResult?.cards} onOpenSource={onOpenSource} />

            {commandMode === "use" && ["success", "error"].includes(searchState) && (
              <p className="brizo-use-usage-footer" role="note" aria-label="Use 模型与 token 用量">
                {formatUseUsage(searchResult?.useUsage)}
              </p>
            )}

            {searchState === "success" && searchResult?.message && (
              <div className="new-tab-result-actions" aria-label="搜索结果操作">
                <button type="button" data-tooltip="复制搜索结果" aria-label="复制搜索结果" onClick={copySearchResult}>
                  <CopySimple size={15} />
                </button>
                <button
                  type="button"
                  data-tooltip="下载 PDF"
                  aria-label="下载 PDF"
                  disabled={resultPdfExporting}
                  onClick={exportSearchPdf}
                >
                  {resultPdfExporting
                    ? <ArrowsClockwise className="is-spinning" size={15} />
                    : <FilePdf size={15} />}
                </button>
                <button type="button" data-tooltip="分享并复制搜索地址" aria-label="分享并复制搜索地址" onClick={shareSearchResult}>
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
          <img className="new-tab-logo" src={brizoLogoUrl} alt="" />
          <h1>{greeting}</h1>
        </div>

        <BorderBeam
          {...ASK_BEAM_PRESET}
          active={active}
          borderRadius={24}
          className="new-tab-beam"
          size={commandMode === "use" ? "pulse-outside" : ASK_BEAM_PRESET.size}
          strength={commandMode === "use" ? 0.84 : ASK_BEAM_PRESET.strength}
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
              <div
                className={`new-tab-mode-toggle is-${commandMode}-active${useRunActive ? " is-disabled" : ""}`}
                role="radiogroup"
                aria-label="命令模式"
              >
                {[
                  ["ask", "ASK"],
                  ["use", "USE"],
                ].map(([mode, label]) => {
                  const isSelected = commandMode === mode;
                  return (
                    <label
                      key={mode}
                      className={`new-tab-mode-option${isSelected ? " is-selected" : ""}`}
                    >
                      <input
                        type="radio"
                        name={`command-mode-${activeTabId}`}
                        value={mode}
                        aria-label={`${label} 模式`}
                        checked={isSelected}
                        disabled={useRunActive}
                        onChange={() => {
                          setCommandMode(mode);
                          setTabMenuOpen(false);
                          window.requestAnimationFrame(() => promptInputRef.current?.focus());
                        }}
                      />
                      <span className="new-tab-mode-name" aria-hidden="true">
                        <span className="new-tab-mode-content">
                          {isSelected
                            ? label
                            : mode === "ask"
                              ? <StarIcon className="new-tab-mode-icon" size={16} strokeWidth={1.9} />
                              : <UseTaskIcon className="new-tab-mode-icon" size={17} />}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>

              <div className={`new-tab-ask-tools${commandMode === "ask" ? " is-visible" : ""}`} aria-hidden={commandMode !== "ask"}>
                <button
                  className={attachments.length ? "new-tab-tool-button has-selection" : "new-tab-tool-button"}
                  type="button"
                  tabIndex={commandMode === "ask" ? 0 : -1}
                  aria-label="插入本地文档"
                  data-tooltip={attachments.length ? `已选择 ${attachments.length} 个文档` : "插入 PDF 或文本文件"}
                  onClick={() => void chooseAttachments()}
                >
                  <Paperclip size={20} />
                  {attachments.length > 0 && <span className="new-tab-tool-count">{attachments.length}</span>}
                </button>

                <div className="new-tab-menu-anchor" ref={tabMenuRef}>
                  <button
                    className={contextTabs.length ? "new-tab-tool-button has-selection" : "new-tab-tool-button"}
                    type="button"
                    tabIndex={commandMode === "ask" ? 0 : -1}
                    aria-expanded={tabMenuOpen}
                    aria-haspopup="listbox"
                    aria-label="插入已有标签页"
                    data-tooltip={contextTabs.length ? `已插入 ${contextTabs.length} 个标签页` : "插入已有标签页"}
                    onClick={() => {
                      setTabMenuOpen((value) => !value);
                    }}
                  >
                    <Browsers size={20} />
                    {contextTabs.length > 0 && <span className="new-tab-tool-count">{contextTabs.length}</span>}
                  </button>
                  {tabMenuOpen && commandMode === "ask" && (
                    <div className="new-tab-tab-menu" aria-label="选择已有标签页">
                      <div className="new-tab-tab-menu-list" role="listbox" aria-label="选择已有标签页" aria-multiselectable="true">
                        {availableTabs.length ? availableTabs.map((tab) => {
                          const selected = selectedContextTabIds.has(tab.id);
                          const selectionLimitReached = contextTabs.length >= 8 && !selected;
                          return (
                            <button
                              key={tab.id}
                              type="button"
                              role="option"
                              aria-selected={selected}
                              disabled={selectionLimitReached}
                              onClick={() => {
                                setContextTabs((current) => selected
                                  ? current.filter((item) => item.id !== tab.id)
                                  : current.length < 8 ? [...current, tab] : current);
                              }}
                            >
                              <SiteIcon id={tab.id} faviconUrl={tab.faviconUrl} isError={tab.loadError} isNewTab={tab.isNewTab} isPdf={tab.isPdf} />
                              <span>{tab.shortTitle || tab.title || tab.url}</span>
                              {selected && <Check size={15} weight="bold" />}
                            </button>
                          );
                        }) : <span className="new-tab-menu-empty">没有可插入的网页标签</span>}
                      </div>
                      {availableTabs.length > 0 && (
                        <div className="new-tab-tab-menu-footer">
                          <span>已选 {contextTabs.length}/8</span>
                          {contextTabs.length > 0 && (
                            <button type="button" className="new-tab-tab-menu-clear" onClick={() => setContextTabs([])}>清除</button>
                          )}
                          <button
                            type="button"
                            className="new-tab-tab-menu-done"
                            onClick={() => {
                              setTabMenuOpen(false);
                              promptInputRef.current?.focus();
                            }}
                          >
                            完成
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="new-tab-action-group new-tab-submit-group">
              {commandMode === "ask" && (
                <>
                  <button className="new-tab-engine-button is-bing" type="button" aria-label="使用 Bing 搜索当前内容" data-tooltip="Bing 搜索" disabled={searchState === "loading" || searchState === "streaming"} onClick={() => searchWithEngine("bing")}>
                    <span className="new-tab-engine-icon-stack" aria-hidden="true">
                      <img className="is-muted" src={bingSearchIconUrl} alt="" />
                      <img className="is-color" src={bingSearchColorIconUrl} alt="" />
                    </span>
                  </button>
                  <button className="new-tab-engine-button is-google" type="button" aria-label="使用 Google 搜索当前内容" data-tooltip="Google 搜索" disabled={searchState === "loading" || searchState === "streaming"} onClick={() => searchWithEngine("google")}>
                    <span className="new-tab-engine-icon-stack" aria-hidden="true">
                      <img className="is-muted" src={googleSearchIconUrl} alt="" />
                      <img className="is-color" src={googleSearchColorIconUrl} alt="" />
                    </span>
                  </button>
                </>
              )}
              <button
                className={`new-tab-submit-button is-primary${commandMode === "use" && (searchState === "loading" || searchState === "streaming") ? " is-pause" : ""}`}
                type="submit"
                aria-label={commandMode === "use" && (searchState === "loading" || searchState === "streaming") ? `${usePaused ? "继续" : "暂停"} BrowserSkill` : commandMode === "ask" ? "确认" : "执行 Use"}
                data-tooltip={commandMode === "use" && (searchState === "loading" || searchState === "streaming") ? (usePaused ? "继续 Use" : "暂停 Use") : commandMode === "ask" ? "Ask Brizo" : "Use Brizo"}
                disabled={commandMode === "ask" && (searchState === "loading" || searchState === "streaming")}
              >
                <span className="new-tab-submit-label" aria-hidden="true">{commandMode === "use" && (searchState === "loading" || searchState === "streaming") ? (usePaused ? "继续" : "暂停") : commandMode === "ask" ? "Ask Brizo" : "Use Brizo"}</span>
                <span className="new-tab-submit-visual" aria-hidden="true">
                  <span className="new-tab-submit-transition" />
                  <span className="new-tab-submit-gradient" />
                </span>
                {commandMode === "ask"
                  ? <SparklesIcon className="new-tab-submit-sparkles" size={20.4} softLoop={active} strokeWidth={1.9} />
                  : <UseTaskIcon className="new-tab-submit-use" size={20.4} animate={active && useRunActive && !usePaused} />}
              </button>
            </div>
          </div>
          </form>
        </BorderBeam>
      </div>
      {!hasResults && onRestorePreviousSession && (
        <button className="new-tab-restore-session" type="button" onClick={onRestorePreviousSession}>
          是否恢复上次打开的标签页？
        </button>
      )}
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
  if (name === "downloads") {
    return <DownloadSimple data-brizo-tab-icon="downloads" size={16} weight="regular" />;
  }
  if (name === "history") {
    return <ClockCounterClockwise data-brizo-tab-icon="history" size={16} weight="regular" />;
  }
  if (name === "settings") {
    return <GearSix data-brizo-tab-icon="settings" size={16} weight="regular" />;
  }
  if (name === "bookmarks") {
    return <BookmarkSimple data-brizo-tab-icon="bookmarks" size={16} weight="regular" />;
  }
  if (name === "calendar") {
    return (
      <svg viewBox="0 0 24 24" width="24" height="24" fill="none">
        <rect x="2" y="3" width="20" height="18" rx="4.5" fill="#4285F4" />
        <rect x="2" y="3" width="20" height="6" fill="#1A73E8" />
        <text x="12" y="17.5" fill="#ffffff" fontSize="9.5" fontWeight="bold" textAnchor="middle" fontFamily="sans-serif">31</text>
      </svg>
    );
  }
  if (name === "gmail") {
    return (
      <svg viewBox="0 0 24 24" width="24" height="24" fill="none">
        <path d="M4 6C2.9 6 2 6.9 2 8V18C2 19.1 2.9 20 4 20H6V11.5L12 16L18 11.5V20H20C21.1 20 22 19.1 22 18V8C22 6.9 21.1 6 20 6H18L12 10.5L6 6H4Z" fill="#EA4335" />
        <path d="M2 8V18C2 19.1 2.9 20 4 20H6V11.5L2 8.5V8Z" fill="#4285F4" />
        <path d="M22 8V18C22 19.1 21.1 20 20 20H18V11.5L22 8.5V8Z" fill="#34A853" />
        <path d="M6 11.5V20H4C2.9 20 2 19.1 2 18V8.5L6 11.5Z" fill="#FBBC05" />
      </svg>
    );
  }
  if (name === "slack") {
    return (
      <svg viewBox="0 0 24 24" width="24" height="24" fill="none">
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
      <svg viewBox="0 0 24 24" width="24" height="24" fill="none">
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
      <svg viewBox="0 0 24 24" width="24" height="24" fill="none">
        <circle cx="12" cy="12" r="10" fill="#0078D7" />
        <path d="M12 4C7.58 4 4 7.58 4 12C4 16.42 7.58 20 12 20C15.5 20 18.44 17.76 19.46 14.62C18.66 15.48 17.2 16 15.5 16C12.5 16 10 13.5 10 10.5C10 8.5 11 6.8 12.6 5.8C12.4 5.8 12.2 4 12 4Z" fill="#50E6FF" />
        <circle cx="13" cy="11" r="5" fill="#ffffff" />
      </svg>
    );
  }
  if (name === "chat") {
    return (
      <svg viewBox="0 0 24 24" width="24" height="24" fill="none">
        <circle cx="12" cy="12" r="10" fill="#C0C5C2" />
        <path d="M12 6C8.68 6 6 8.24 6 11C6 12.56 6.86 13.94 8.22 14.85L7.5 17.5L10.3 16.1C10.84 16.24 11.41 16.3 12 16.3C15.32 16.3 18 14.06 18 11.3C18 8.54 15.32 6 12 6Z" fill="#ffffff" />
      </svg>
    );
  }
  if (name === "brizo") {
    return (
      <svg viewBox="0 0 24 24" width="24" height="24" fill="none">
        <rect x="2" y="2" width="20" height="20" rx="6" fill="#111111" />
        <path d="M7 12C7 9.24 9.24 7 12 7C14.76 7 17 9.24 17 12V16C17 16.55 16.55 17 16 17H8C7.45 17 7 16.55 7 16V12Z" fill="#ffffff" />
        <circle cx="12" cy="13" r="2.5" fill="#111111" />
      </svg>
    );
  }
  if (name === "gemini") {
    return (
      <svg viewBox="0 0 24 24" width="24" height="24" fill="none">
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
      <svg viewBox="0 0 24 24" width="24" height="24" fill="none">
        <rect width="24" height="24" rx="5" fill="#FF5000" />
        <text x="12" y="17" fill="#ffffff" fontSize="13" fontWeight="900" textAnchor="middle" fontFamily="sans-serif">淘</text>
      </svg>
    );
  }
  if (name === "youdao") {
    return (
      <svg viewBox="0 0 24 24" width="24" height="24" fill="none">
        <text x="12" y="18" fill="#E02020" fontSize="18" fontWeight="900" fontStyle="italic" textAnchor="middle" fontFamily="sans-serif">y</text>
      </svg>
    );
  }
  if (name === "maps") {
    return (
      <svg viewBox="0 0 24 24" width="24" height="24" fill="none">
        <path d="M12 2C8.13 2 5 5.13 5 9C5 14.25 12 22 12 22C12 22 19 14.25 19 9C19 5.13 15.87 2 12 2Z" fill="#34A853" />
        <path d="M12 2C8.13 2 5 5.13 5 9C5 10.3 5.35 11.5 5.96 12.55L12 5.5V2Z" fill="#4285F4" />
        <path d="M12 22C12 22 19 14.25 19 9C19 8.1 18.8 7.25 18.45 6.5L12 14V22Z" fill="#FBBC05" />
        <path d="M12 5.5L5.96 12.55C7.2 14.7 9.3 18.1 12 22V14L18.45 6.5C17.65 5.1 16.3 3.9 14.7 3.1L12 5.5Z" fill="#EA4335" />
        <circle cx="12" cy="9" r="3.5" fill="#ffffff" />
      </svg>
    );
  }
  if (name === "brief" || name === "news" || name === "newspaper" || name === "compass") {
    return (
      <CompassIcon size={35} color="#2E3330" highlightColor="#a58c5e" strokeWidth={18} />
    );
  }
  return null;
}

function isTabAutomating(tab) {
  return tab?.agentStatus === "agent" || (tab?.isUseAutomationTab && ["running", "paused"].includes(tab.useStatus));
}

function useIconStatusForTab(tab, tabs) {
  if (tab.isUseAutomationTab) return tab.useStatus || "idle";
  if ((tab.isNewTab || tab.hasNewTabSession)
    && (tab.initialMode === "use" || tab.initialUseCommand || tab.title?.startsWith("Use: "))) {
    const children = tabs.filter((child) => child.parentTabId === tab.id);
    return children.find((child) => child.useStatus === "running")?.useStatus
      || children.find((child) => child.useStatus === "paused")?.useStatus
      || "idle";
  }
  return "";
}

function SiteIcon({ id = 1, iconKey = "", url = "", faviconUrl = "", isError = false, isNewTab = false, isPdf = false, isAutomating = false, useIconStatus = "" }) {
  if (useIconStatus) return <span className="site-icon is-use-task" aria-hidden="true"><UseTaskIcon size={20} animate={useIconStatus === "running"} /></span>;
  if (isAutomating) return <span className="site-icon is-automating" aria-hidden="true"><MonitorIcon size={20} strokeWidth={1.9} /></span>;
  let matchedKey = iconKey;
  if (/^brizo:\/\/downloads(?:\/|$)/i.test(url)) matchedKey = "downloads";
  else if (/^brizo:\/\/history(?:\/|$)/i.test(url)) matchedKey = "history";
  else if (/^brizo:\/\/settings(?:\/|$)/i.test(url)) matchedKey = "settings";
  else if (/^brizo:\/\/bookmarks(?:\/|$)/i.test(url)) matchedKey = "bookmarks";
  else if (!matchedKey && url) {
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
    else if (url.includes("brief") || url.includes("news")) matchedKey = "brief";
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
  const usesDefaultCompass = !isPdf && !isNewTab && !isError && !faviconUrl && Icon === Compass;
  return (
    <span className={`site-icon${faviconUrl ? " has-favicon" : ""}${isNewTab ? " is-new-tab" : ""}${isError ? " is-error" : ""}${usesDefaultCompass ? " is-default-compass" : ""}`} aria-hidden="true">
      {isPdf
        ? <FilePdf size={14} weight="fill" />
        : isNewTab
        ? <img className="brizo-new-tab-star" src={brizoStarIconUrl} alt="" />
        : isError
          ? <img src={errorTabIconUrl} alt="" />
        : faviconUrl
          ? <img src={faviconUrl} alt="" />
          : <Icon size={14} weight="bold" />}
    </span>
  );
}

function TabContextMenu({ contextMenu, onClose, onTogglePin, onCloseTab, onCloseOtherTabs, onNewTab, onReload, onCopyUrl }) {
  if (!contextMenu || typeof document === "undefined") return null;
  const { x, y, tab } = contextMenu;
  return createPortal(
    <>
      <div className="tab-context-backdrop" onClick={onClose} onContextMenu={(e) => { e.preventDefault(); onClose(); }} />
      <div
        className="tab-context-menu"
        style={{ left: `${x}px`, top: `${y}px` }}
        role="menu"
      >
        {!tab.isUseAutomationTab && (
          <button
            type="button"
            className="tab-context-item"
            role="menuitem"
            onClick={() => onTogglePin(tab.id)}
          >
            <PushPin size={15} weight={tab.isPinned ? "fill" : "regular"} />
            <span>{tab.isPinned ? "取消常驻置顶" : "常驻置顶"}</span>
          </button>
        )}
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

function bookmarkOpenCount(bookmark) {
  const count = Number(bookmark?.openCount);
  return Number.isFinite(count) && count > 0 ? Math.floor(count) : 0;
}

function bookmarkDisplayWeight(bookmark, ranking) {
  return ranking?.weights?.get(bookmark.url) ?? bookmarkOpenCount(bookmark);
}

function createBookmarkRankingContext(bookmarkTree, enabled, weights) {
  const folderTotals = new WeakMap();
  const collectFolderTotal = (node) => {
    if (!node || typeof node !== "object") return 0;
    const bookmarkTotal = (node.bookmarks || []).reduce(
      (sum, bookmark) => sum + (weights.get(bookmark.url) || 0),
      0,
    );
    const childTotal = Object.values(node.folders || {}).reduce(
      (sum, child) => sum + collectFolderTotal(child),
      0,
    );
    const total = bookmarkTotal + childTotal;
    folderTotals.set(node, total);
    return total;
  };
  collectFolderTotal(bookmarkTree);
  return { enabled: Boolean(enabled), folderTotals, weights };
}

function compareBookmarksForDisplay(left, right, ranking) {
  if (ranking?.enabled) {
    const leftCount = bookmarkDisplayWeight(left, ranking);
    const rightCount = bookmarkDisplayWeight(right, ranking);
    if (leftCount !== rightCount) return rightCount - leftCount;
  }
  return compareBookmarks(left, right);
}

function sortBookmarkFolderEntries(node, folderOrders, folderPath = "", ranking = null) {
  const manualOrder = folderOrders?.[folderPath] || [];
  const manualRanks = new Map(
    manualOrder.map((folderName, index) => [folderName, index]),
  );
  return Object.entries(node?.folders || {}).sort(
    ([leftName, leftNode], [rightName, rightNode]) => {
      if (ranking?.enabled) {
        const leftTotal = ranking.folderTotals.get(leftNode) || 0;
        const rightTotal = ranking.folderTotals.get(rightNode) || 0;
        if (leftTotal !== rightTotal) return rightTotal - leftTotal;
      }
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
  bookmarkRanking = null,
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
  onRankGlowComplete,
}) {
  const [activeDropdownFolder, setActiveDropdownFolder] = useState(null);
  const [openFolderPaths, setOpenFolderPaths] = useState([]);
  const [menuAnchor, setMenuAnchor] = useState(null);
  const [menuScroll, setMenuScroll] = useState({ top: false, bottom: false });
  const [bookmarkBarScrollState, setBookmarkBarScrollState] = useState({
    canScrollForward: false,
    overflowing: false,
  });
  const folderDropdownRef = useRef(null);
  const scrollContentRef = useRef(null);
  const triggerRef = useRef(null);
  const autoScrollRef = useRef(0);
  const bookmarkBarAutoScrollRef = useRef(0);
  const bookmarkBarContentRef = useRef(null);
  const bookmarkBarViewportRef = useRef(null);
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

  const stopBookmarkBarAutoScroll = useCallback(() => {
    if (!bookmarkBarAutoScrollRef.current) return;
    window.clearInterval(bookmarkBarAutoScrollRef.current);
    bookmarkBarAutoScrollRef.current = 0;
  }, []);

  const updateBookmarkBarScrollState = useCallback(() => {
    const viewport = bookmarkBarViewportRef.current;
    if (!viewport) return;
    const overflowing = viewport.scrollWidth - viewport.clientWidth > 1;
    if (!overflowing && viewport.scrollLeft !== 0) viewport.scrollLeft = 0;
    const canScrollForward = overflowing
      && viewport.scrollLeft < viewport.scrollWidth - viewport.clientWidth - 1;
    setBookmarkBarScrollState((current) => (
      current.overflowing === overflowing && current.canScrollForward === canScrollForward
        ? current
        : { canScrollForward, overflowing }
    ));
  }, []);

  const scrollBookmarkBarForward = useCallback(() => {
    const viewport = bookmarkBarViewportRef.current;
    if (!viewport) return;
    const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    viewport.scrollBy({
      behavior: reducedMotion ? "auto" : "smooth",
      left: Math.max(96, Math.round(viewport.clientWidth * 0.6)),
    });
  }, []);

  const startBookmarkBarAutoScroll = () => {
    const viewport = bookmarkBarViewportRef.current;
    if (!viewport || !bookmarkBarScrollState.canScrollForward) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      scrollBookmarkBarForward();
      return;
    }
    stopBookmarkBarAutoScroll();
    bookmarkBarAutoScrollRef.current = window.setInterval(() => {
      const current = bookmarkBarViewportRef.current;
      if (!current) {
        stopBookmarkBarAutoScroll();
        return;
      }
      const maxLeft = current.scrollWidth - current.clientWidth;
      const next = Math.min(current.scrollLeft + 10, maxLeft);
      current.scrollLeft = next;
      updateBookmarkBarScrollState();
      if (next >= maxLeft - 1) stopBookmarkBarAutoScroll();
    }, 40);
  };

  useLayoutEffect(() => {
    const viewport = bookmarkBarViewportRef.current;
    const content = bookmarkBarContentRef.current;
    if (!viewport || !content) return undefined;
    const frame = window.requestAnimationFrame(updateBookmarkBarScrollState);
    const resizeObserver = typeof ResizeObserver === "function"
      ? new ResizeObserver(updateBookmarkBarScrollState)
      : null;
    resizeObserver?.observe(viewport);
    resizeObserver?.observe(content);
    window.addEventListener("resize", updateBookmarkBarScrollState);
    return () => {
      window.cancelAnimationFrame(frame);
      resizeObserver?.disconnect();
      window.removeEventListener("resize", updateBookmarkBarScrollState);
    };
  }, [bookmarkTree, updateBookmarkBarScrollState]);

  useEffect(() => {
    const stopWhenHidden = () => {
      if (document.hidden) stopBookmarkBarAutoScroll();
    };
    window.addEventListener("blur", stopBookmarkBarAutoScroll);
    document.addEventListener("visibilitychange", stopWhenHidden);
    return () => {
      stopBookmarkBarAutoScroll();
      window.removeEventListener("blur", stopBookmarkBarAutoScroll);
      document.removeEventListener("visibilitychange", stopWhenHidden);
    };
  }, [stopBookmarkBarAutoScroll]);

  useEffect(() => {
    if (!bookmarkBarScrollState.canScrollForward) stopBookmarkBarAutoScroll();
  }, [bookmarkBarScrollState.canScrollForward, stopBookmarkBarAutoScroll]);

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

  const rootFolderEntries = sortBookmarkFolderEntries(bookmarkTree, folderOrders, "", bookmarkRanking);
  const rootBookmarks = [...(bookmarkTree?.bookmarks || [])]
    .sort((left, right) => compareBookmarksForDisplay(left, right, bookmarkRanking));
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
      <div
        className="horizontal-bookmarks-viewport"
        id="brizo-bookmarks-viewport"
        ref={bookmarkBarViewportRef}
        onScroll={updateBookmarkBarScrollState}
      >
        <div className="horizontal-bookmarks-content" ref={bookmarkBarContentRef}>
        {rootFolderEntries.map(([folderName, folderNode]) => {
        const isOpen = activeDropdownFolder === folderName;
        const activeNode = isOpen ? folderNode : null;
        const activeEntries = activeNode
          ? sortBookmarkFolderEntries(activeNode, folderOrders, folderName, bookmarkRanking)
          : [];
        const activeBookmarks = activeNode
          ? [...activeNode.bookmarks]
            .sort((left, right) => compareBookmarksForDisplay(left, right, bookmarkRanking))
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
              <BookmarkFolderIcon size={16} aria-hidden="true" />
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
                        <BookmarkFolderIcon size={16} aria-hidden="true" />
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
                      <BookmarkFavicon
                        bookmark={bookmark}
                        rankGlow={bookmarkRanking?.enabled
                          && bookmarkDisplayWeight(bookmark, bookmarkRanking) >= BOOKMARK_SMART_RANK_THRESHOLD
                          && !bookmark.smartPromotionSeenAt}
                        onRankGlowComplete={onRankGlowComplete}
                      />
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
                    bookmarkRanking={bookmarkRanking}
                    openFolderPaths={openFolderPaths}
                    onOpenFolderPath={openFolderPathAt}
                    onClose={closeMenu}
                    onOpenBookmark={onOpenBookmark}
                    onOpenBookmarkContextEditor={onOpenBookmarkContextEditor}
                    onRankGlowComplete={onRankGlowComplete}
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
          <BookmarkFavicon
            bookmark={bookmark}
            rankGlow={bookmarkRanking?.enabled
              && bookmarkDisplayWeight(bookmark, bookmarkRanking) >= BOOKMARK_SMART_RANK_THRESHOLD
              && !bookmark.smartPromotionSeenAt}
            onRankGlowComplete={onRankGlowComplete}
          />
          <span>{bookmark.title || bookmark.url}</span>
        </button>
        ))}
        </div>
      </div>
      {bookmarkBarScrollState.overflowing && (
        <button
          className={`bookmarks-bar-forward-edge${bookmarkBarScrollState.canScrollForward ? " is-visible" : ""}`}
          type="button"
          aria-controls="brizo-bookmarks-viewport"
          aria-label="向后浏览收藏夹"
          title="向后浏览收藏夹"
          disabled={!bookmarkBarScrollState.canScrollForward}
          onBlur={stopBookmarkBarAutoScroll}
          onClick={scrollBookmarkBarForward}
          onPointerCancel={stopBookmarkBarAutoScroll}
          onPointerEnter={startBookmarkBarAutoScroll}
          onPointerLeave={stopBookmarkBarAutoScroll}
        >
          <CaretRight size={13} weight="bold" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

function BookmarkDropdownCascade({
  level,
  path,
  node,
  folderOrders,
  bookmarkRanking,
  openFolderPaths,
  onOpenFolderPath,
  onClose,
  onOpenBookmark,
  onOpenBookmarkContextEditor,
  onRankGlowComplete,
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

  const entries = sortBookmarkFolderEntries(node, folderOrders, path, bookmarkRanking);
  const bookmarks = [...(node?.bookmarks || [])]
    .sort((left, right) => compareBookmarksForDisplay(left, right, bookmarkRanking));
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
              <BookmarkFolderIcon size={16} aria-hidden="true" />
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
            <BookmarkFavicon
              bookmark={bookmark}
              rankGlow={bookmarkRanking?.enabled
                && bookmarkDisplayWeight(bookmark, bookmarkRanking) >= BOOKMARK_SMART_RANK_THRESHOLD
                && !bookmark.smartPromotionSeenAt}
              onRankGlowComplete={onRankGlowComplete}
            />
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
          bookmarkRanking={bookmarkRanking}
          openFolderPaths={openFolderPaths}
          onOpenFolderPath={onOpenFolderPath}
          onClose={onClose}
          onOpenBookmark={onOpenBookmark}
          onOpenBookmarkContextEditor={onOpenBookmarkContextEditor}
          onRankGlowComplete={onRankGlowComplete}
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

function BookmarkFavicon({ bookmark, rankGlow = false, onRankGlowComplete }) {
  const candidates = [bookmark.faviconUrl].filter(Boolean);
  const candidateKey = candidates.join("|");
  const rankKey = String(bookmark?.url || "").trim();
  const [candidateIndex, setCandidateIndex] = useState(0);

  useEffect(() => {
    setCandidateIndex(0);
  }, [candidateKey]);

  useEffect(() => {
    if (!rankGlow || !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    onRankGlowComplete?.(rankKey);
  }, [onRankGlowComplete, rankGlow, rankKey]);

  const rankGlowClass = rankGlow ? " is-smart-promoted" : "";
  const completeRankGlow = (event) => {
    if (event.animationName === "bookmark-smart-glint") onRankGlowComplete?.(rankKey);
  };

  const faviconUrl = candidates[candidateIndex];
  if (!faviconUrl) {
    return (
      <span className={`bookmark-favicon is-fallback${rankGlowClass}`} aria-hidden="true" onAnimationEnd={completeRankGlow}>
        <LinkSimple size={12} weight="bold" />
      </span>
    );
  }

  return (
    <span className={`bookmark-favicon${rankGlowClass}`} aria-hidden="true" onAnimationEnd={completeRankGlow}>
      <img
        alt=""
        src={faviconUrl}
        onError={() => setCandidateIndex((current) => current + 1)}
      />
    </span>
  );
}

function IconButton({ label, tooltip = label, children, className = "", disabled = false, onClick }) {
  return (
    <button
      className={`icon-button ${className}`}
      type="button"
      aria-label={label}
      data-tooltip={tooltip}
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
  const dialogRef = useRef(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return undefined;
    const previouslyFocused = document.activeElement;
    const focusableSelector = [
      "button:not([disabled])",
      "input:not([disabled])",
      "select:not([disabled])",
      "textarea:not([disabled])",
      "[href]",
      "[tabindex]:not([tabindex='-1'])",
    ].join(",");
    const focusable = () => [...dialog.querySelectorAll(focusableSelector)]
      .filter((element) => !element.hasAttribute("hidden") && element.getAttribute("aria-hidden") !== "true");
    (focusable()[0] || dialog).focus({ preventScroll: true });

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current?.();
        return;
      }
      if (event.key !== "Tab") return;
      const items = focusable();
      if (!items.length) {
        event.preventDefault();
        dialog.focus({ preventScroll: true });
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus({ preventScroll: true });
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus({ preventScroll: true });
      }
    };
    dialog.addEventListener("keydown", handleKeyDown);
    return () => {
      dialog.removeEventListener("keydown", handleKeyDown);
      window.requestAnimationFrame(() => {
        const replacementDialog = document.querySelector('[role="dialog"][aria-modal="true"]');
        if (!replacementDialog && previouslyFocused instanceof HTMLElement && previouslyFocused.isConnected) {
          previouslyFocused.focus({ preventScroll: true });
        }
      });
    };
  }, []);

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
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-dialog-title"
        tabIndex={-1}
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
            {folder === path ? <FolderOpen size={17} weight="fill" /> : <BookmarkFolderIcon size={17} aria-hidden="true" />}
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
        {folder === "" ? <FolderOpen size={17} weight="fill" /> : <BookmarkFolderIcon size={17} aria-hidden="true" />}
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

export function App() {
  const browserApi = window.beanBrowser;
  const desktopMode = Boolean(browserApi);
  const [windowLaunch] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    if (!desktopMode || !params.get("windowId")) return null;
    const url = params.get("startUrl") || "";
    if (!/^https?:\/\//i.test(url)) return null;
    const domain = new URL(url).hostname.replace(/^www\./i, "");
    return { id: `window-tab-${params.get("windowId")}`, domain, title: domain, shortTitle: domain, url };
  });
  const tabStorage = windowLaunch ? sessionStorage : localStorage;
  const initialAddress = windowLaunch?.url || "";
  const [startupSession] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("bean:open-tabs") || "null");
      const savedPinned = JSON.parse(localStorage.getItem("bean:pinned-tabs") || "null");
      const savedTabs = Array.isArray(saved)
        ? saved.filter((tab) => tab && typeof tab.id === "string" && !tab.isUseAutomationTab)
        : [];
      let pinned = Array.isArray(savedPinned)
        ? savedPinned.filter((tab) => tab?.isPinned && !tab.isUseAutomationTab)
        : savedTabs.filter((tab) => tab.isPinned);
      if (!Array.isArray(savedPinned) && !pinned.length) pinned = INITIAL_TABS.filter((tab) => tab.isPinned);
      if (!pinned.some((tab) => tab.id === "pinned-brief" || tab.isBrief || tab.url === "brizo://brief")) {
        pinned = [INITIAL_TABS[0], ...pinned];
      }
      const previousTabs = savedTabs.filter((tab) => !tab.isPinned && tab.id !== "pinned-brief");
      const hasPreviousContent = previousTabs.some((tab) => tab.url || tab.searchQuery
        || tab.initialPrompt || tab.initialUseCommand || tab.prefillPrompt || tab.restoredResult
        || (tab.title && tab.title !== "新标签页"));
      return {
        pinned,
        previousTabs: !windowLaunch && hasPreviousContent ? previousTabs : [],
        activeId: localStorage.getItem("bean:active-tab") || "",
      };
    } catch {
      return { pinned: INITIAL_TABS.filter((tab) => tab.isPinned), previousTabs: [], activeId: "" };
    }
  });
  // Capture the previous session before the first persistence effect writes
  // the new, empty session. Restoration is explicitly requested by the user.
  const previousSessionTabs = useRef(startupSession.previousTabs);
  const [previousSessionAvailable, setPreviousSessionAvailable] = useState(startupSession.previousTabs.length > 0);
  const [tabs, setTabsState] = useState(() => [
    ...startupSession.pinned,
    windowLaunch || { ...START_TAB },
  ]);
  const [activeTab, setActiveTab] = useState(windowLaunch?.id || START_TAB.id);
  const tabsRef = useRef(tabs);
  const activeTabRef = useRef(activeTab);
  const setTabs = useCallback((nextValue) => {
    const nextTabs = typeof nextValue === "function"
      ? nextValue(tabsRef.current)
      : nextValue;
    if (!Array.isArray(nextTabs)) return;
    tabsRef.current = nextTabs;
    setTabsState(nextTabs);
  }, []);
  const activateTabId = useCallback((tabId) => {
    activeTabRef.current = tabId;
    setActiveTab(tabId);
  }, []);
  const [activeSurface, setActiveSurface] = useState("tab");
  const [tabContextMenu, setTabContextMenu] = useState(null);
  const [draggedTabId, setDraggedTabId] = useState("");
  const [draggedGroupId, setDraggedGroupId] = useState("");
  const [agentStates, setAgentStates] = useState({});
  useEffect(() => {
    if (!browserApi?.onAgentState) return undefined;
    let live = true;
    const receive = state => {
      if (!live || !state?.id) return;
      const previous = tabsRef.current.filter(tab => tab.agentSessionId === state.id);
      const selected = tabsRef.current.find(tab => tab.id === activeTabRef.current);
      setAgentStates(current => ({ ...current, [state.id]: state }));
      const groupTabs = (state.status === "closed" ? [] : state.tabs).map(tab => ({
        id: tab.id, title: tab.title, shortTitle: tab.title, url: tab.url, domain: "brizo-agent",
        isUseAutomationTab: true, useSandboxReady: true, useStatus: state.status,
        agentSessionId: state.id, agentClient: state.client, agentStatus: state.status,
      }));
      setTabs(current => {
        const index = current.findIndex(tab => tab.agentSessionId === state.id);
        const next = current.filter(tab => tab.agentSessionId !== state.id);
        next.splice(index < 0 ? next.filter(tab => tab.isPinned).length : index, 0, ...groupTabs);
        return next;
      });
      if (groupTabs.length && (!previous.length || (state.focusTab && selected?.agentSessionId === state.id))) {
        setActiveSurface("tab"); activateTabId(state.activeId);
      } else if (selected?.agentSessionId === state.id && !groupTabs.some(tab => tab.id === selected.id)) {
        const fallback = groupTabs[0] || tabsRef.current.find(tab => !tab.isPinned) || tabsRef.current[0];
        if (fallback) selectArticle(fallback);
      }
    };
    const unsubscribe = browserApi.onAgentState(receive);
    browserApi.getAgentStates().then(states => states.forEach(receive)).catch(() => {});
    return () => { live = false; unsubscribe(); };
  }, [browserApi, setTabs, activateTabId]);

  const pinnedTabs = useMemo(() => tabs.filter((tab) => tab.isPinned), [tabs]);
  const unpinnedTabs = useMemo(() => tabs.filter((tab) => !tab.isPinned), [tabs]);
  const pinnedGridRows = Math.max(1, Math.ceil(pinnedTabs.length / 3));
  const pinnedGridHeight = 14 + (pinnedGridRows * 44) + ((pinnedGridRows - 1) * 6);

  useEffect(() => {
    tabsRef.current = tabs;
  }, [tabs]);

  useEffect(() => {
    activeTabRef.current = activeTab;
  }, [activeTab]);

  useEffect(() => {
    try {
      tabStorage.setItem("bean:open-tabs", JSON.stringify(tabs.filter((tab) => !tab.isUseAutomationTab)));
      const pinned = tabs.filter((t) => t.isPinned && !t.isUseAutomationTab);
      localStorage.setItem("bean:pinned-tabs", JSON.stringify(pinned));
    } catch {
      // ignore
    }
  }, [tabs]);

  useEffect(() => {
    try { tabStorage.setItem("bean:active-tab", activeTab); } catch { /* Keep navigation usable without storage. */ }
  }, [activeTab, tabStorage]);

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
    if (tabsRef.current.some((tab) => tab.id === tabId && tab.isUseAutomationTab)) {
      setTabContextMenu(null);
      return;
    }
    setTabs((currentTabs) =>
      currentTabs.map((t) => (t.id === tabId ? { ...t, isPinned: !t.isPinned } : t))
    );
    setTabContextMenu(null);
  };

  const closeOtherTabs = (tabId) => {
    const targetTab = tabs.find((t) => t.id === tabId);
    const tabsToClose = tabs
      .map((t, index) => ({ tab: { ...t }, index }))
      .filter((item) => item.tab.id !== tabId && !item.tab.isPinned);
    const closed = tabsToClose.filter((item) => !item.tab.isUseAutomationTab);
    if (closed.length > 0) {
      setClosedTabs((prev) => [...prev, ...closed]);
    }
    tabsToClose.forEach((item) => {
      browserApi?.closeTabView?.(item.tab.id);
    });
    setTabs((currentTabs) => currentTabs
      .filter((t) => t.id === tabId || t.isPinned)
      .map((t) => t.id === tabId ? { ...t, parentTabId: "" } : t));
    if (targetTab) selectArticle(targetTab);
    setTabContextMenu(null);
  };

  const reloadTab = (tab) => {
    const lockedUseTab = tabsRef.current.find((candidate) => (
      ["running", "paused"].includes(candidate.useStatus)
      && (candidate.id === tab?.id || candidate.parentTabId === tab?.id)
    ));
    if (lockedUseTab) {
      showToast("Use 运行期间不能重新加载父子标签");
      setTabContextMenu(null);
      return;
    }
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
  const [addressText, setAddressText] = useState(() => formatAddressForDisplay(initialAddress));
  const [memorySuggestions, setMemorySuggestions] = useState({ query: "", items: [] });
  const [memoryRevision, setMemoryRevision] = useState(0);
  const [storedBookmarkVisits, setStoredBookmarkVisits] = useState({ records: [], excludedHosts: [] });
  const [addressSuggestionIndex, setAddressSuggestionIndex] = useState(-1);
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
  const [collapsedGroups, setCollapsedGroups] = useState(() => new Set());
  const [appPreferences, setAppPreferences] = useState(() => {
    try {
      return {
        ...DEFAULT_APP_PREFERENCES,
        ...JSON.parse(localStorage.getItem("bean:app-preferences") || "{}"),
      };
    } catch {
      return { ...DEFAULT_APP_PREFERENCES };
    }
  });
  const [siteHygienePreferences, setSiteHygienePreferences] = useState({
    ...DEFAULT_SITE_HYGIENE_PREFERENCES,
  });
  const siteHygienePreferencesRef = useRef(siteHygienePreferences);
  const siteHygieneWriteQueueRef = useRef(Promise.resolve());
  const [addressFocused, setAddressFocused] = useState(false);
  const [addressInputDirty, setAddressInputDirty] = useState(false);
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
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [collapsedTabHover, setCollapsedTabHover] = useState(null);
  const [viewportTooltip, setViewportTooltip] = useState(null);
  const [systemUsesDarkAppearance, setSystemUsesDarkAppearance] = useState(() => (
    window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false
  ));
  const [browserPreview, setBrowserPreview] = useState("");
  const [settingsMenuOpen, setSettingsMenuOpen] = useState(false);
  const [settingsMenuLevel, setSettingsMenuLevel] = useState("root");
  const [settingsPanel, setSettingsPanel] = useState("");
  const [settingsQuery, setSettingsQuery] = useState("");
  const [bookmarkBarDropdownOpen, setBookmarkBarDropdownOpen] = useState(false);
  const [pageZoom, setPageZoom] = useState(() => {
    const stored = Number(localStorage.getItem("bean:page-zoom"));
    return Number.isFinite(stored) && stored >= 0.5 && stored <= 2 ? stored : 1;
  });
  const [historyPageQuery, setHistoryPageQuery] = useState("");
  const [downloadPageQuery, setDownloadPageQuery] = useState("");
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
  const [searchServices, setSearchServices] = useState([]);
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
  const [briefEdition, setBriefEdition] = useState(null);
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
  const currentSiteOrigin = useMemo(() => {
    try {
      const url = new URL(navigationState.documentUrl || navigationState.url || "");
      return ["http:", "https:"].includes(url.protocol) ? url.origin.toLowerCase() : "";
    } catch {
      return "";
    }
  }, [navigationState.documentUrl, navigationState.url]);
  const addressEditing = useRef(false);
  const addressInput = useRef(null);
  const addressValue = useRef(initialAddress);
  const bookmarkDragJustEnded = useRef(false);
  const bookmarkControlRef = useRef(null);
  const bookmarkEditorRef = useRef(null);
  const bookmarkFolderTriggerRef = useRef(null);
  const bookmarkNameInputRef = useRef(null);
  const bookmarkContextFolderTriggerRef = useRef(null);
  const bookmarkContextNameInputRef = useRef(null);
  const bookmarkFaviconAttempts = useRef(new Set());
  const bookmarkFaviconResolution = useRef(null);
  const downloadsMenuRef = useRef(null);
  const downloadsPopoverRef = useRef(null);
  const browserSurfaceRef = useRef(null);
  const browserPreviewReleaseFrame = useRef(0);
  const browserMenuRef = useRef(null);
  const sidebarSettingsRef = useRef(null);
  const sidebarHistoryPopoverRef = useRef(null);
  const settingsPopoverRef = useRef(null);
  const topTabsBarRef = useRef(null);
  const tabHistoryRef = useRef(null);
  const modelGuardDockRef = useRef(null);
  const collapsedTabHoverTimer = useRef(0);
  const viewportTooltipRef = useRef(null);
  const webContentHost = useRef(null);
  const addressBarRef = useRef(null);
  const addressLoadAnimation = useRef(0);
  const addressLoadFadeTimer = useRef(0);
  const addressLoadAngle = useRef(0);
  const addressLoadWasActive = useRef(false);
  const [addressLoadPhase, setAddressLoadPhase] = useState("idle");
  const [activeIndicatorY, setActiveIndicatorY] = useState(null);
  const [activeIndicatorX, setActiveIndicatorX] = useState(10);
  const [activeIndicatorWidth, setActiveIndicatorWidth] = useState(null);
  const [activeIndicatorHeight, setActiveIndicatorHeight] = useState(35);
  const tabRowRefs = useRef({});
  const tabLayoutItemRefs = useRef({});
  const tabLayoutPositions = useRef({ groups: new Map(), rows: new Map() });
  const tabRemovalAnimationPending = useRef(false);
  const sidebarTabsListRef = useRef(null);
  const [tabsScrollFlags, setTabsScrollFlags] = useState({ top: false, bottom: false });
  const tabsAutoScrollTimer = useRef(null);

  const clearCollapsedTabHoverTimer = useCallback(() => {
    window.clearTimeout(collapsedTabHoverTimer.current);
    collapsedTabHoverTimer.current = 0;
  }, []);

  const dismissCollapsedTabHover = useCallback(() => {
    clearCollapsedTabHoverTimer();
    setCollapsedTabHover((current) => (current ? null : current));
  }, [clearCollapsedTabHoverTimer]);

  const scheduleCollapsedTabHoverDismiss = useCallback(() => {
    clearCollapsedTabHoverTimer();
    collapsedTabHoverTimer.current = window.setTimeout(() => {
      setCollapsedTabHover((current) => (current ? null : current));
      collapsedTabHoverTimer.current = 0;
    }, COLLAPSED_TAB_HOVER_DISMISS_DELAY_MS);
  }, [clearCollapsedTabHoverTimer]);

  const scheduleCollapsedTabHover = useCallback((event, tab, delay = COLLAPSED_TAB_HOVER_DELAY_MS) => {
    clearCollapsedTabHoverTimer();
    if (draggedTabId || draggedGroupId) return;
    const anchor = event.currentTarget;
    const tabId = tab?.id;
    if (!anchor || !tabId) return;
    const showHovercard = () => {
      const liveTab = tabsRef.current.find((candidate) => candidate.id === tabId);
      if (!anchor.isConnected || !liveTab) return;
      const title = liveTab.title || liveTab.shortTitle || "新标签页";
      const address = formatCollapsedTabHoverAddress(liveTab);
      const position = getCollapsedTabHovercardPosition(anchor);
      if (liveTab.useLoginRequired) {
        setCollapsedTabHover(null);
        browserApi?.setUseLoginPromptLayout?.({ sessionId: liveTab.useSessionId, ...position, reopen: true });
        return;
      }
      setCollapsedTabHover({
        address,
        canOpenWindow: /^https?:\/\//i.test(String(liveTab.url || "")),
        isPinned: Boolean(liveTab.isPinned),
        isUseAutomationTab: Boolean(liveTab.isUseAutomationTab),
        tabId,
        title,
        url: liveTab.url || "",
        ...position,
      });
      collapsedTabHoverTimer.current = 0;
    };
    if (collapsedTabHover) {
      showHovercard();
      return;
    }
    setCollapsedTabHover(null);
    collapsedTabHoverTimer.current = window.setTimeout(showHovercard, delay);
  }, [browserApi, clearCollapsedTabHoverTimer, collapsedTabHover, draggedGroupId, draggedTabId]);

  useEffect(() => {
    const dismissOnEscape = (event) => {
      if (event.key === "Escape") dismissCollapsedTabHover();
    };
    const dismissOnVisibilityChange = () => {
      if (document.hidden) dismissCollapsedTabHover();
    };
    window.addEventListener("blur", dismissCollapsedTabHover);
    window.addEventListener("resize", dismissCollapsedTabHover);
    document.addEventListener("keydown", dismissOnEscape);
    document.addEventListener("visibilitychange", dismissOnVisibilityChange);
    return () => {
      window.removeEventListener("blur", dismissCollapsedTabHover);
      window.removeEventListener("resize", dismissCollapsedTabHover);
      document.removeEventListener("keydown", dismissOnEscape);
      document.removeEventListener("visibilitychange", dismissOnVisibilityChange);
      clearCollapsedTabHoverTimer();
    };
  }, [clearCollapsedTabHoverTimer, dismissCollapsedTabHover]);

  useEffect(() => {
    dismissCollapsedTabHover();
  }, [activeTab, collapsedGroups, draggedGroupId, draggedTabId, sidebarCollapsed, dismissCollapsedTabHover]);

  useEffect(() => {
    const collapseSidebarWhenNarrow = () => {
      if (window.innerWidth <= SIDEBAR_AUTO_COLLAPSE_WIDTH) {
        setSidebarCollapsed(true);
      }
    };
    collapseSidebarWhenNarrow();
    window.addEventListener("resize", collapseSidebarWhenNarrow);
    return () => window.removeEventListener("resize", collapseSidebarWhenNarrow);
  }, []);

  useEffect(() => {
    if (collapsedTabHover && !tabs.some((tab) => tab.id === collapsedTabHover.tabId)) {
      dismissCollapsedTabHover();
    }
  }, [collapsedTabHover, dismissCollapsedTabHover, tabs]);

  const showViewportTooltip = useCallback((target) => {
    const anchor = target?.currentTarget || target;
    const text = String(
      anchor?.dataset?.tooltip
      || anchor?.getAttribute?.("title")
      || anchor?.getAttribute?.("aria-label")
      || "",
    ).trim();
    if (!anchor || !text) return;
    if (anchor.hasAttribute("title")) anchor.removeAttribute("title");
    setViewportTooltip({
      anchor,
      left: 0,
      placement: "above",
      positioned: false,
      text,
      top: 0,
    });
  }, []);

  const hideViewportTooltip = useCallback(() => {
    setViewportTooltip(null);
  }, []);

  useEffect(() => {
    const tooltipTargetForEvent = (event) => {
      if (!(event.target instanceof Element)) return null;
      const explicitTarget = event.target.closest("[data-tooltip]");
      if (explicitTarget) return explicitTarget;
      const iconButton = event.target.closest("button[aria-label], button[title]");
      return iconButton && !String(iconButton.textContent || "").trim() ? iconButton : null;
    };
    const enteredFromOutside = (target, relatedTarget) => (
      !(relatedTarget instanceof Node) || !target.contains(relatedTarget)
    );
    const showFromEvent = (event) => {
      const target = tooltipTargetForEvent(event);
      if (target && enteredFromOutside(target, event.relatedTarget)) {
        showViewportTooltip(target);
      }
    };
    const hideFromEvent = (event) => {
      const target = tooltipTargetForEvent(event);
      if (target && enteredFromOutside(target, event.relatedTarget)) {
        hideViewportTooltip();
      }
    };

    document.addEventListener("pointerover", showFromEvent, true);
    document.addEventListener("pointerout", hideFromEvent, true);
    document.addEventListener("focusin", showFromEvent, true);
    document.addEventListener("focusout", hideFromEvent, true);
    document.addEventListener("click", hideViewportTooltip, true);
    return () => {
      document.removeEventListener("pointerover", showFromEvent, true);
      document.removeEventListener("pointerout", hideFromEvent, true);
      document.removeEventListener("focusin", showFromEvent, true);
      document.removeEventListener("focusout", hideFromEvent, true);
      document.removeEventListener("click", hideViewportTooltip, true);
    };
  }, [hideViewportTooltip, showViewportTooltip]);

  useLayoutEffect(() => {
    if (!viewportTooltip) return undefined;
    const tooltip = viewportTooltipRef.current;
    const anchor = viewportTooltip.anchor;
    if (!tooltip || !anchor?.isConnected) {
      setViewportTooltip(null);
      return undefined;
    }

    const reposition = () => {
      if (!anchor.isConnected) {
        setViewportTooltip(null);
        return;
      }
      const anchorBounds = anchor.getBoundingClientRect();
      const tooltipBounds = tooltip.getBoundingClientRect();
      const inset = 8;
      const gap = 7;
      const roomAbove = anchorBounds.top - inset - gap;
      const roomBelow = window.innerHeight - inset - anchorBounds.bottom - gap;
      const placement = roomAbove >= tooltipBounds.height || roomAbove >= roomBelow
        ? "above"
        : "below";
      const preferredTop = placement === "above"
        ? anchorBounds.top - gap - tooltipBounds.height
        : anchorBounds.bottom + gap;
      const maximumLeft = Math.max(inset, window.innerWidth - inset - tooltipBounds.width);
      const maximumTop = Math.max(inset, window.innerHeight - inset - tooltipBounds.height);
      const left = Math.min(
        Math.max(inset, anchorBounds.left + ((anchorBounds.width - tooltipBounds.width) / 2)),
        maximumLeft,
      );
      const top = Math.min(Math.max(inset, preferredTop), maximumTop);
      setViewportTooltip((current) => {
        if (!current || current.anchor !== anchor) return current;
        const nextLeft = Math.round(left);
        const nextTop = Math.round(top);
        if (
          current.left === nextLeft
          && current.top === nextTop
          && current.placement === placement
          && current.positioned
        ) return current;
        return {
          ...current,
          left: nextLeft,
          placement,
          positioned: true,
          top: nextTop,
        };
      });
    };

    reposition();
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("blur", hideViewportTooltip);
    return () => {
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("blur", hideViewportTooltip);
    };
  }, [hideViewportTooltip, viewportTooltip?.anchor, viewportTooltip?.text]);

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
  const briefOpen = Boolean(currentArticle?.isBrief || currentArticle?.url === "brizo://brief" || currentArticle?.id === "pinned-brief");
  const newTabOpen = !briefOpen && Boolean(currentArticle?.isNewTab);
  const useAutomationOpen = !briefOpen && Boolean(currentArticle?.isUseAutomationTab);
  const currentAgent = agentStates[currentArticle?.agentSessionId];
  const markUseChildUnavailable = useCallback((tabId) => {
    browserApi?.setVisible?.(false);
    setTabs((currentTabs) => currentTabs.map((tab) => tab.id === tabId ? {
      ...tab,
      useSandboxReady: false,
      useStatus: "error",
      useViewMissing: true,
    } : tab));
  }, [browserApi, setTabs]);
  const useFamilyNavigationLocked = currentAgent?.status === "agent" || tabs.some((tab) => (
    ["running", "paused"].includes(tab.useStatus)
    && (tab.id === currentArticle?.id || tab.parentTabId === currentArticle?.id)
  ));
  const bookmarksPageOpen = !briefOpen && Boolean(
    currentArticle?.isBookmarksPage || /^brizo:\/\/bookmarks(?:\/|$)/i.test(currentArticle?.url || ""),
  );
  const historyPageOpen = !briefOpen && Boolean(
    currentArticle?.isHistoryPage || /^brizo:\/\/history(?:\/|$)/i.test(currentArticle?.url || ""),
  );
  const downloadsPageOpen = !briefOpen && Boolean(
    currentArticle?.isDownloadsPage || /^brizo:\/\/downloads(?:\/|$)/i.test(currentArticle?.url || ""),
  );
  const internalLibraryPageOpen = bookmarksPageOpen || historyPageOpen || downloadsPageOpen;
  const historyPageSection = /^brizo:\/\/history\/search(?:\/|$)/i.test(currentArticle?.url || "")
    ? "search"
    : "browser";
  const downloadPageSectionMatch = String(currentArticle?.url || "")
    .match(/^brizo:\/\/downloads(?:\/(active|completed|unavailable))?(?:\/|$)/i);
  const downloadPageSection = downloadPageSectionMatch?.[1]?.toLocaleLowerCase() || "all";
  const settingsPageOpen = !briefOpen && Boolean(
    currentArticle?.isSettingsPage || /^brizo:\/\/settings(?:\/|$)/i.test(currentArticle?.url || ""),
  );
  const settingsPageSection = useMemo(() => {
    const match = String(currentArticle?.url || "").match(/^brizo:\/\/settings(?:\/([^/?#]+))?/i);
    const requested = match?.[1] || "people";
    return SETTINGS_SECTIONS.some((section) => section.id === requested) ? requested : "people";
  }, [currentArticle?.url]);
  const settingsRouteHistory = settingsPageOpen
    ? (Array.isArray(currentArticle?.settingsHistory) && currentArticle.settingsHistory.length
      ? currentArticle.settingsHistory
      : [currentArticle?.url || "brizo://settings"])
    : [];
  const settingsRouteHistoryIndex = settingsPageOpen
    ? Math.min(
      settingsRouteHistory.length - 1,
      Math.max(0, Number.isInteger(currentArticle?.settingsHistoryIndex)
        ? currentArticle.settingsHistoryIndex
        : settingsRouteHistory.length - 1),
    )
    : -1;
  const canSettingsGoBack = settingsPageOpen && settingsRouteHistoryIndex > 0;
  const canSettingsGoForward = settingsPageOpen && settingsRouteHistoryIndex < settingsRouteHistory.length - 1;
  const canReturnToNewTab = !briefOpen
    && !newTabOpen
    && !useAutomationOpen
    && !internalLibraryPageOpen
    && !settingsPageOpen
    && Boolean(currentArticle?.returnToNewTab);
  const navigationOwnsActiveTab = navigationState.ownerTabId === currentArticle?.id;
  const currentPageUrl = !briefOpen && !newTabOpen && !internalLibraryPageOpen && !settingsPageOpen
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
  const collapsedTabHoverBookmarkKey = useMemo(
    () => canonicalizeUrl(collapsedTabHover?.url || ""),
    [collapsedTabHover?.url],
  );
  const collapsedTabHoverIsBookmarked = useMemo(
    () => Boolean(collapsedTabHoverBookmarkKey && bookmarkLibrary.some((bookmark) => (
      canonicalizeUrl(bookmark.url) === collapsedTabHoverBookmarkKey
    ))),
    [bookmarkLibrary, collapsedTabHoverBookmarkKey],
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
    ? "var(--brizo-brief-paper)"
    : newTabOpen
    ? "#f1f1f1"
    : useAutomationOpen && !currentArticle?.useSandboxReady
    ? "#f1e7e1"
    : internalLibraryPageOpen
    ? "#ffffff"
    : settingsPageOpen
    ? "#ffffff"
    : navigationOwnsActiveTab
      ? navigationState.pageBackgroundColor || "#ffffff"
      : "#ffffff";
  const toolbarBackgroundColor = pageBackgroundColor;
  const pageUsesLightForeground = !briefOpen
    && !newTabOpen
    && !internalLibraryPageOpen
    && !settingsPageOpen
    && navigationOwnsActiveTab
    && shouldUseLightForeground(pageBackgroundColor);
  const shellUsesLightForeground = !navigationState.isPdf
    && (pageUsesLightForeground || systemUsesDarkAppearance);
  const filteredBookmarkLibrary = bookmarkLibrary;

  const groupedTabItems = useMemo(() => {
    const unpinnedList = unpinnedTabs || [];
    const tabIds = new Set(unpinnedList.map((tab) => tab?.id).filter(Boolean));
    const domainCounts = new Map();
    unpinnedList.forEach((tab) => {
      if (!tab || tab.isNewTab || tab.isBookmarksPage || tab.isHistoryPage || tab.isDownloadsPage || tab.isUseAutomationTab || tab.parentTabId || !tab.url) return;
      const pd = getPrimaryDomain(tab.url || tab.domain);
      if (pd) {
        domainCounts.set(pd, (domainCounts.get(pd) || 0) + 1);
      }
    });

    const items = [];
    const processedGroups = new Set();

    unpinnedList.forEach((tab) => {
      if (!tab) return;
      if (tab.agentSessionId) {
        const groupId = `agent-${tab.agentSessionId}`;
        if (!processedGroups.has(groupId)) {
          processedGroups.add(groupId);
          items.push({ type: "group", groupId, primaryDomain: "brizo-agent", siteName: `${tab.agentClient || "AI"} 操作`, iconTab: tab,
            tabs: unpinnedList.filter(item => item.agentSessionId === tab.agentSessionId) });
        }
        return;
      }
      if (tab.parentTabId && tabIds.has(tab.parentTabId)) return;
      const useChildren = unpinnedList.filter((candidate) => candidate?.parentTabId === tab.id);
      if (useChildren.length > 0) {
        items.push({
          type: "group",
          groupId: `use-group-${tab.id}`,
          primaryDomain: "brizo-use",
          siteName: tab.shortTitle || tab.title || "Brizo Use",
          iconTab: tab,
          tabs: [tab, ...useChildren],
          isUseFamily: true,
        });
        return;
      }
      const pd = !tab.isNewTab
        && !tab.isBookmarksPage
        && !tab.isHistoryPage
        && !tab.isDownloadsPage
        && !tab.isUseAutomationTab
        && !tab.parentTabId
        && tab.url
        ? getPrimaryDomain(tab.url || tab.domain)
        : "";
      if (pd && domainCounts.get(pd) >= 2) {
        if (!processedGroups.has(pd)) {
          processedGroups.add(pd);
          const groupTabs = unpinnedList.filter(
            (t) => t
              && !t.isNewTab
              && !t.isBookmarksPage
              && !t.isHistoryPage
              && !t.isDownloadsPage
              && !t.isUseAutomationTab
              && !t.parentTabId
              && t.url
              && getPrimaryDomain(t.url || t.domain) === pd
          );
          const firstTab = groupTabs[0] || tab;
          items.push({
            type: "group",
            groupId: `group-${pd}`,
            primaryDomain: pd,
            siteName: getSiteDisplayName(pd, firstTab),
            iconTab: firstTab,
            tabs: groupTabs,
          });
        }
      } else {
        items.push({
          type: "tab",
          tab,
        });
      }
    });

    return items;
  }, [unpinnedTabs]);
  const activeTabIsGrouped = useMemo(() => groupedTabItems.some((item) => (
    item.type === "group" && item.tabs.some((tab) => tab.id === activeTab)
  )), [activeTab, groupedTabItems]);

  const toggleGroupCollapse = useCallback((groupId) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  }, []);

  const updateActiveIndicator = useCallback(() => {
    if (briefOpen || !activeTab) {
      setActiveIndicatorY(null);
      return;
    }
    const activeEl = tabRowRefs.current?.[activeTab];
    const listEl = sidebarTabsListRef.current;
    if (activeEl && typeof activeEl.getBoundingClientRect === "function" && listEl && typeof listEl.getBoundingClientRect === "function") {
      try {
        const activeRect = activeEl.getBoundingClientRect();
        const listRect = listEl.getBoundingClientRect();
        if (activeRect.width > 0 && activeRect.height > 0) {
          const relativeTop = activeRect.top - listRect.top + listEl.scrollTop;
          const relativeLeft = activeRect.left - listRect.left + listEl.scrollLeft;
          setActiveIndicatorY(relativeTop);
          setActiveIndicatorX(relativeLeft);
          setActiveIndicatorWidth(activeRect.width);
          setActiveIndicatorHeight(activeRect.height || 35);
        } else {
          setActiveIndicatorY(null);
        }
      } catch {
        setActiveIndicatorY(null);
      }
    } else {
      setActiveIndicatorY(null);
    }
  }, [activeTab, briefOpen]);

  useLayoutEffect(() => {
    updateActiveIndicator();
    updateTabsScrollFlags();
  }, [activeTab, briefOpen, unpinnedTabs, groupedTabItems, collapsedGroups, sidebarCollapsed, updateActiveIndicator, updateTabsScrollFlags]);

  useLayoutEffect(() => {
    const listEl = sidebarTabsListRef.current;
    if (!listEl) return;
    const listRect = listEl.getBoundingClientRect();
    const readTop = (element) => {
      const rect = element?.getBoundingClientRect?.();
      return rect ? rect.top - listRect.top + listEl.scrollTop : null;
    };
    const nextGroups = new Map();
    const nextRows = new Map();
    Object.entries(tabLayoutItemRefs.current).forEach(([key, element]) => {
      const top = readTop(element);
      if (top === null) return;
      if (key.startsWith("group:")) nextGroups.set(key.slice(6), top);
    });
    Object.entries(tabRowRefs.current).forEach(([tabId, element]) => {
      const top = readTop(element);
      if (top !== null) nextRows.set(tabId, top);
    });

    if (tabRemovalAnimationPending.current) {
      const prefersReducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
      if (!prefersReducedMotion) {
        const previous = tabLayoutPositions.current;
        const animateUpwardFill = (element, previousTop, nextTop) => {
          const delta = previousTop - nextTop;
          if (delta <= 0.5) return;
          element.animate(
            [
              { transform: `translateY(${delta}px)` },
              { transform: "translateY(0)" },
            ],
            { duration: 280, easing: "cubic-bezier(0.22, 1, 0.36, 1)" },
          );
        };

        groupedTabItems.forEach((item) => {
          if (item.type === "group") {
            const groupElement = tabLayoutItemRefs.current[`group:${item.groupId}`];
            const previousGroupTop = previous.groups.get(item.groupId);
            const nextGroupTop = nextGroups.get(item.groupId);
            const groupDelta = previousGroupTop !== undefined && nextGroupTop !== undefined
              ? previousGroupTop - nextGroupTop
              : 0;
            if (groupElement && previousGroupTop !== undefined && nextGroupTop !== undefined) {
              animateUpwardFill(groupElement, previousGroupTop, nextGroupTop);
            }
            if (groupDelta <= 0.5) {
              item.tabs.forEach((tab) => {
                const element = tabRowRefs.current[tab.id];
                const previousTop = previous.rows.get(tab.id);
                const nextTop = nextRows.get(tab.id);
                if (element && previousTop !== undefined && nextTop !== undefined) {
                  animateUpwardFill(element, previousTop, nextTop);
                }
              });
            }
            return;
          }

          const tabId = item.tab.id;
          const element = tabRowRefs.current[tabId];
          const previousTop = previous.rows.get(tabId);
          const nextTop = nextRows.get(tabId);
          if (element && previousTop !== undefined && nextTop !== undefined) {
            animateUpwardFill(element, previousTop, nextTop);
          }
        });
      }
      tabRemovalAnimationPending.current = false;
    }

    tabLayoutPositions.current = { groups: nextGroups, rows: nextRows };
  }, [collapsedGroups, groupedTabItems, sidebarCollapsed]);

  useEffect(() => {
    const el = sidebarTabsListRef.current;
    if (!el) return undefined;
    updateActiveIndicator();
    updateTabsScrollFlags();
    const rafId = requestAnimationFrame(() => {
      updateActiveIndicator();
      updateTabsScrollFlags();
    });
    const handleScroll = () => {
      updateTabsScrollFlags();
      updateActiveIndicator();
    };
    el.addEventListener("scroll", handleScroll, { passive: true });
    let ro = null;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(() => {
        updateActiveIndicator();
        updateTabsScrollFlags();
      });
      ro.observe(el);
      const activeEl = tabRowRefs.current?.[activeTab];
      if (activeEl) {
        ro.observe(activeEl);
      }
    }
    const t1 = setTimeout(updateActiveIndicator, 40);
    const t2 = setTimeout(updateActiveIndicator, 100);
    const t3 = setTimeout(updateActiveIndicator, 180);
    const t4 = setTimeout(updateActiveIndicator, 240);
    return () => {
      cancelAnimationFrame(rafId);
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      clearTimeout(t4);
      el.removeEventListener("scroll", handleScroll);
      if (ro) ro.disconnect();
      stopTabsAutoScroll();
    };
  }, [tabs, unpinnedTabs, groupedTabItems, collapsedGroups, sidebarCollapsed, activeTab, updateActiveIndicator, updateTabsScrollFlags]);

  useEffect(() => {
    if (activeTab && tabRowRefs.current?.[activeTab] && sidebarTabsListRef.current) {
      const activeEl = tabRowRefs.current[activeTab];
      const listEl = sidebarTabsListRef.current;
      if (!activeEl || typeof activeEl.getBoundingClientRect !== "function" || !listEl || typeof listEl.getBoundingClientRect !== "function") return;
      try {
        const activeRect = activeEl.getBoundingClientRect();
        const listRect = listEl.getBoundingClientRect();
        const activeTop = activeRect.top - listRect.top + listEl.scrollTop;
        const activeBottom = activeTop + (activeEl.offsetHeight || 35);
        if (activeTop < listEl.scrollTop) {
          listEl.scrollTo({ top: activeTop - 6, behavior: "smooth" });
        } else if (activeBottom > listEl.scrollTop + listEl.clientHeight) {
          listEl.scrollTo({ top: activeBottom - listEl.clientHeight + 6, behavior: "smooth" });
        }
      } catch {}
    }
  }, [activeTab, groupedTabItems, collapsedGroups]);

  useEffect(() => {
    const appearanceQuery = window.matchMedia?.("(prefers-color-scheme: dark)");
    if (!appearanceQuery) return undefined;
    const syncAppearance = () => setSystemUsesDarkAppearance(appearanceQuery.matches);
    syncAppearance();
    appearanceQuery.addEventListener("change", syncAppearance);
    return () => appearanceQuery.removeEventListener("change", syncAppearance);
  }, []);

  useEffect(() => browserApi?.onBrowserMemoryChanged?.(() => {
    setMemorySuggestions({ query: "", items: [] });
    setMemoryRevision(value => value + 1);
  }), [browserApi]);

  useEffect(() => {
    const query = addressText.trim();
    setAddressSuggestionIndex(-1);
    if (!addressFocused || !addressInputDirty || !query || !browserApi?.suggestHistory) return;
    let live = true;
    const timer = window.setTimeout(() => {
      browserApi.suggestHistory(query).then(items => {
        if (live) setMemorySuggestions({ query, items });
      }).catch(() => { if (live) setMemorySuggestions({ query, items: [] }); });
    }, 120);
    return () => { live = false; window.clearTimeout(timer); };
  }, [addressFocused, addressInputDirty, addressText, browserApi, memoryRevision]);

  const addressInputIntent = useMemo(() => {
    const input = addressText.trim();
    if (!addressFocused || !addressInputDirty || !input) return { kind: "idle", suggestions: [] };
    const websiteMatches = addressSuggestionsFor(input, bookmarkLibrary, tabs);
    const historyMatches = memorySuggestions.query === input ? memorySuggestions.items : [];
    const resemblesWebsite = !/\s/.test(input) && (looksLikeWebsiteInput(input) || websiteMatches.length > 0
      || historyMatches.some(item => item.host.startsWith(input.toLowerCase()) || item.title.toLowerCase() === input.toLowerCase()));
    const candidates = looksLikeWebsiteInput(input)
      ? [...websiteMatches, ...historyMatches.map(item => ({ ...item, fromMemory: true }))]
      : [...historyMatches.map(item => ({ ...item, fromMemory: true })), ...websiteMatches];
    const seen = new Set();
    const suggestions = candidates.filter(item => {
      if (seen.has(item.url)) return false;
      seen.add(item.url); return true;
    }).slice(0, 6).map(item => ({ ...item, type: "url", value: item.url }));
    return { kind: resemblesWebsite ? "website" : "search", suggestions };
  }, [addressFocused, addressInputDirty, addressText, bookmarkLibrary, tabs, memorySuggestions]);
  const addressSuggestions = addressInputIntent.suggestions;

  useEffect(() => {
    window.cancelAnimationFrame(addressLoadAnimation.current);
    window.clearTimeout(addressLoadFadeTimer.current);
    const setProgressAngle = (angle) => {
      addressLoadAngle.current = angle;
      addressBarRef.current?.style.setProperty("--address-load-angle", `${angle}deg`);
    };
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (newTabOpen) {
      addressLoadWasActive.current = false;
      setAddressLoadPhase("idle");
      setProgressAngle(0);
      return undefined;
    }
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
  }, [navigationState.isLoading, newTabOpen]);

  useEffect(() => {
    if (!addressFocused || !addressInputDirty || !looksLikeWebsiteInput(addressText)) return undefined;
    const timer = window.setTimeout(() => browserApi?.preconnect?.(addressText), 120);
    return () => window.clearTimeout(timer);
  }, [addressFocused, addressInputDirty, addressText, browserApi]);
  const bookmarkTree = useMemo(
    () => buildBookmarkTree(filteredBookmarkLibrary),
    [filteredBookmarkLibrary],
  );
  const bookmarkVisitUrls = useMemo(() => JSON.stringify([...new Set(bookmarkLibrary.map(item => item.url))].sort()), [bookmarkLibrary]);
  useEffect(() => {
    if (!browserApi?.getBookmarkVisitWeights) return;
    let live = true;
    const timer = window.setTimeout(() => {
      browserApi.getBookmarkVisitWeights(JSON.parse(bookmarkVisitUrls)).then(value => {
        if (live) setStoredBookmarkVisits(value);
      }).catch(() => { if (live) setStoredBookmarkVisits({ records: [], excludedHosts: [] }); });
    }, 120);
    return () => { live = false; window.clearTimeout(timer); };
  }, [browserApi, bookmarkVisitUrls, memoryRevision, browserHistory]);
  const bookmarkVisitWeights = useMemo(
    () => createBookmarkVisitWeights(bookmarkLibrary, storedBookmarkVisits, browserHistory),
    [bookmarkLibrary, storedBookmarkVisits, browserHistory],
  );
  const bookmarkRanking = useMemo(
    () => createBookmarkRankingContext(
      bookmarkTree,
      appPreferences.smartBookmarkSorting !== false,
      bookmarkVisitWeights,
    ),
    [appPreferences.smartBookmarkSorting, bookmarkTree, bookmarkVisitWeights],
  );
  const acknowledgeBookmarkSmartPromotion = useCallback((url) => {
    const seenAt = Date.now();
    setBookmarkLibrary((current) => current.map((bookmark) => (
      bookmark.url === url
        && bookmarkDisplayWeight(bookmark, bookmarkRanking) >= BOOKMARK_SMART_RANK_THRESHOLD
        && !bookmark.smartPromotionSeenAt
        ? { ...bookmark, smartPromotionSeenAt: seenAt }
        : bookmark
    )));
  }, [bookmarkRanking]);
  const otherBrowserShellOverlayOpen = bookmarkEditorOpen
    || Boolean(bookmarkContextEditor)
    || downloadsOpen
    || sidebarHistoryOpen
    || Boolean(tabContextMenu)
    || bookmarkBarDropdownOpen
    || settingsMenuOpen
    || Boolean(settingsPanel)
    || addressSuggestions.length > 0;
  const browserShellOverlayOpen = otherBrowserShellOverlayOpen
    || Boolean(collapsedTabHover)
    || Boolean(viewportTooltip);

  useEffect(() => {
    if (otherBrowserShellOverlayOpen) dismissCollapsedTabHover();
  }, [dismissCollapsedTabHover, otherBrowserShellOverlayOpen]);

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
    browserApi?.setFullWidth?.(Boolean(appPreferences.autoFitZoom));
  }, [appPreferences, browserApi]);

  useEffect(() => {
    if (!browserApi?.getSiteHygiene) return undefined;
    let active = true;
    browserApi.getSiteHygiene().then((value) => {
      if (active && value) {
        siteHygienePreferencesRef.current = value;
        setSiteHygienePreferences(value);
      }
    });
    return () => { active = false; };
  }, [browserApi]);

  useEffect(() => {
    localStorage.setItem("bean:page-zoom", String(pageZoom));
    if (!appPreferences.autoFitZoom) {
      browserApi?.setPageZoom?.(pageZoom);
    }
  }, [activeSurface, activeTab, appPreferences.autoFitZoom, browserApi, pageZoom]);

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
      let cancelled = false;
      import("./BriefPage.jsx").then(({ createBriefPreviewEdition }) => {
        if (!cancelled) setBriefEdition((current) => current || createBriefPreviewEdition());
      });
      return () => { cancelled = true; };
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
    browserApi?.setDownloadDirectory?.(appPreferences.downloadLocation || "");
  }, [appPreferences.downloadLocation, browserApi]);

  useEffect(() => {
    const url = navigationState.documentUrl || navigationState.url;
    if (
      useAutomationOpen
      ||
      navigationState.isLoading
      || navigationState.error
      || !navigationState.title
      || !/^https?:\/\//i.test(url || "")
    ) return;
    void browserApi?.recordBrowserMemory?.({ url, title: navigationState.title, updatedAt: Date.now() }).catch(() => {});
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
  }, [navigationState.documentUrl, navigationState.error, navigationState.isLoading, navigationState.pageFaviconUrl, navigationState.title, navigationState.url, useAutomationOpen]);

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
    if (!settingsPageOpen || addressEditing.current) return;
    const route = /^brizo:\/\/settings(?:\/|$)/i.test(currentArticle?.url || "")
      ? currentArticle.url
      : "brizo://settings/people";
    addressValue.current = route;
    setAddressText(formatAddressForDisplay(route));
  }, [activeTab, currentArticle?.url, settingsPageOpen]);

  useEffect(() => {
    if (!internalLibraryPageOpen || addressEditing.current) return;
    const route = /^brizo:\/\/(?:bookmarks|history|downloads)(?:\/|$)/i.test(currentArticle?.url || "")
      ? currentArticle.url
      : downloadsPageOpen
        ? "brizo://downloads"
        : historyPageOpen
          ? "brizo://history"
          : "brizo://bookmarks";
    addressValue.current = route;
    setAddressText(formatAddressForDisplay(route));
  }, [
    activeTab,
    currentArticle?.url,
    downloadsPageOpen,
    historyPageOpen,
    internalLibraryPageOpen,
  ]);

  useEffect(() => {
    if (!browserApi) return undefined;

    const applyState = (state) => {
      if (!state) return;
      setNavigationState(state);
      if (state.url && !briefOpen && !newTabOpen && !internalLibraryPageOpen && !settingsPageOpen && !addressEditing.current) {
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
  }, [briefOpen, browserApi, internalLibraryPageOpen, newTabOpen, settingsPageOpen]);

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
    if (appPreferences.showDownloadsWhenComplete === false) return;
    setSettingsMenuOpen(false);
    setDownloadsOpen(true);
  }), [appPreferences.showDownloadsWhenComplete, browserApi]);

  useEffect(() => {
    if ((!downloadsOpen && !downloadsPageOpen) || !browserApi?.listDownloads) return;
    browserApi.listDownloads().then((nextDownloads) => {
      if (Array.isArray(nextDownloads)) setDownloads(nextDownloads);
    });
  }, [browserApi, downloadsOpen, downloadsPageOpen]);

  useEffect(() => {
    if (!downloadsPageOpen || !browserApi?.listDownloads) return undefined;
    const refreshDownloads = () => {
      browserApi.listDownloads().then((nextDownloads) => {
        if (Array.isArray(nextDownloads)) setDownloads(nextDownloads);
      });
    };
    const refreshVisibleDownloads = () => {
      if (document.visibilityState === "visible") refreshDownloads();
    };
    window.addEventListener("focus", refreshDownloads);
    document.addEventListener("visibilitychange", refreshVisibleDownloads);
    return () => {
      window.removeEventListener("focus", refreshDownloads);
      document.removeEventListener("visibilitychange", refreshVisibleDownloads);
    };
  }, [browserApi, downloadsPageOpen]);

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
      internalLibraryPageOpen ||
      settingsPageOpen ||
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
              shortTitle: tab.isUseAutomationTab && ["running", "paused"].includes(tab.useStatus)
                ? "沙箱操作中"
                : navigationState.title,
              title: navigationState.title,
              url: navigationState.url,
            }
          : tab,
      ),
    );
  }, [
    briefOpen,
    internalLibraryPageOpen,
    desktopMode,
    newTabOpen,
    settingsPageOpen,
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
    let frame = 0;
    const publishBounds = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        const host = webContentHost.current
          || document.querySelector(".browser-surface .web-content-host:not([aria-hidden='true'])")
          || document.querySelector(".browser-surface .web-content-host")
          || document.querySelector(".browser-surface");
        if (!host || typeof host.getBoundingClientRect !== "function") return;
        const bounds = host.getBoundingClientRect();
        if (bounds.width > 0 && bounds.height > 0) {
          if (browserApi) {
            browserApi.setBounds({
              x: bounds.left,
              y: bounds.top,
              width: Math.max(1, bounds.width),
              height: Math.max(1, bounds.height),
            });
          }
        }
      });
    };

    const host = webContentHost.current
      || document.querySelector(".browser-surface .web-content-host:not([aria-hidden='true'])")
      || document.querySelector(".browser-surface");
    const observer = host ? new ResizeObserver(publishBounds) : null;
    if (host && observer) observer.observe(host);

    window.addEventListener("resize", publishBounds);
    publishBounds();
    const t1 = setTimeout(publishBounds, 50);
    const t2 = setTimeout(publishBounds, 150);
    const t3 = setTimeout(publishBounds, 300);

    return () => {
      window.cancelAnimationFrame(frame);
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      if (observer) observer.disconnect();
      window.removeEventListener("resize", publishBounds);
    };
  }, [activeTab, briefOpen, browserApi, internalLibraryPageOpen, newTabOpen, settingsPageOpen, sidebarCollapsed]);

  useEffect(() => {
    if (!browserApi?.capturePreview || briefOpen || newTabOpen || internalLibraryPageOpen || settingsPageOpen) {
      setBrowserPreview("");
      return undefined;
    }
    if (!browserShellOverlayOpen) return undefined;
    let cancelled = false;
    browserApi.capturePreview().then((preview) => {
      if (!cancelled && typeof preview === "string") setBrowserPreview(preview);
    });
    return () => { cancelled = true; };
  }, [browserShellOverlayOpen, briefOpen, browserApi, internalLibraryPageOpen, newTabOpen, settingsPageOpen]);

  useEffect(() => {
    if (!browserApi?.activateBrizoUseTabView || !useAutomationOpen || !currentArticle?.useSandboxReady) return;
    let cancelled = false;
    void browserApi.activateBrizoUseTabView(currentArticle.id).then((activated) => {
      if (!cancelled && !activated) markUseChildUnavailable(currentArticle.id);
    });
    return () => { cancelled = true; };
  }, [browserApi, currentArticle?.id, currentArticle?.useSandboxReady, markUseChildUnavailable, useAutomationOpen]);

  useEffect(() => {
    const shouldShowBrowser = !briefOpen
      && !newTabOpen
      && !internalLibraryPageOpen
      && !settingsPageOpen
      && (!useAutomationOpen || Boolean(currentArticle?.useSandboxReady))
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
  }, [briefOpen, browserApi, browserPreview, browserShellOverlayOpen, currentArticle?.useSandboxReady, internalLibraryPageOpen, navigationState.error, newTabOpen, settingsPageOpen, useAutomationOpen]);

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

  useLayoutEffect(() => {
    if (!bookmarkEditorOpen) return undefined;
    const editor = bookmarkEditorRef.current;
    const anchor = editor?.parentElement;
    if (!editor || !anchor) return undefined;

    const keepEditorInViewport = () => {
      const viewportInset = 8;
      const viewportWidth = document.documentElement.clientWidth;
      const anchorBounds = anchor.getBoundingClientRect();
      const editorWidth = editor.getBoundingClientRect().width;
      const centeredLeft = anchorBounds.left + (anchorBounds.width - editorWidth) / 2;
      const maximumLeft = Math.max(viewportInset, viewportWidth - viewportInset - editorWidth);
      const clampedLeft = Math.min(Math.max(centeredLeft, viewportInset), maximumLeft);
      editor.style.setProperty("--bookmark-editor-shift-x", `${clampedLeft - centeredLeft}px`);
    };

    keepEditorInViewport();
    window.addEventListener("resize", keepEditorInViewport);
    return () => window.removeEventListener("resize", keepEditorInViewport);
  }, [bookmarkEditorOpen]);

  useLayoutEffect(() => {
    if (!downloadsOpen) return undefined;
    const anchor = downloadsMenuRef.current;
    const popover = downloadsPopoverRef.current;
    if (!anchor || !popover) return undefined;

    const keepPopoverInViewport = () => {
      const viewportInset = 8;
      const viewportWidth = document.documentElement.clientWidth;
      const anchorBounds = anchor.getBoundingClientRect();
      const popoverWidth = popover.getBoundingClientRect().width;
      const centeredLeft = anchorBounds.left + (anchorBounds.width - popoverWidth) / 2;
      const maximumLeft = Math.max(viewportInset, viewportWidth - viewportInset - popoverWidth);
      const clampedLeft = Math.min(Math.max(centeredLeft, viewportInset), maximumLeft);
      popover.style.setProperty("--downloads-popover-shift-x", `${clampedLeft - centeredLeft}px`);
    };

    keepPopoverInViewport();
    window.addEventListener("resize", keepPopoverInViewport);
    return () => window.removeEventListener("resize", keepPopoverInViewport);
  }, [downloadsOpen]);

  useEffect(() => {
    if (!bookmarkEditorOpen) return undefined;
    const closeOnOutsidePointer = (event) => {
      const editor = bookmarkEditorRef.current;
      const trigger = bookmarkControlRef.current?.querySelector(".bookmark-action-button");
      if (editor?.contains(event.target) || trigger?.contains(event.target)) return;
      setBookmarkFolderMenuOpen(false);
      setBookmarkEditorOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer, true);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePointer, true);
  }, [bookmarkEditorOpen]);

  useEffect(() => {
    if (!downloadsOpen) return undefined;
    const closeOnOutsidePointer = (event) => {
      const popover = downloadsPopoverRef.current;
      const trigger = downloadsMenuRef.current?.querySelector(":scope > .icon-button");
      if (popover?.contains(event.target) || trigger?.contains(event.target)) return;
      setDownloadsOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer, true);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePointer, true);
  }, [downloadsOpen]);

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
    const scrollTargets = document.querySelectorAll(".article-page");
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
    const bookmarkImportOpen = (settingsMenuOpen && settingsMenuLevel === "bookmark-import")
      || settingsPanel === "bookmark-import";
    if (!bookmarkImportOpen || !browserApi?.listBookmarkSources) return;
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
  }, [browserApi, settingsMenuLevel, settingsMenuOpen, settingsPanel]);

  useEffect(() => {
    if (!(settingsPanel === "password-vault" || settingsPageOpen) || !browserApi?.listPasswords) return;
    let active = true;
    browserApi.listPasswords().then((entries) => {
      if (active) setPasswordEntries(Array.isArray(entries) ? entries : []);
    });
    return () => { active = false; };
  }, [browserApi, settingsPageOpen, settingsPanel]);

  useEffect(() => {
    if (!(["about", "preferences"].includes(settingsPanel)
      || settingsPageOpen
      || (settingsMenuOpen && settingsMenuLevel === "preferences"))
      || !browserApi?.getAppInfo) return;
    browserApi.getAppInfo().then(setAppInfo);
  }, [browserApi, settingsMenuLevel, settingsMenuOpen, settingsPageOpen, settingsPanel]);

  useEffect(() => {
    if (!browserApi?.listModelProviders) return;
    browserApi.listModelProviders().then((providers) => {
      setModelProviders(Array.isArray(providers) ? providers : []);
    });
  }, [browserApi]);

  useEffect(() => {
    if (!browserApi?.listSearchServices) return;
    browserApi.listSearchServices().then((services) => {
      setSearchServices(Array.isArray(services) ? services : []);
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
  };

  const openBookmarkContextEditor = (event, item) => {
    event.preventDefault();
    event.stopPropagation();
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

  const analysisProvider = modelProviders.find((provider) => (
    /deepseek|deep seek/i.test([
      provider?.name,
      provider?.baseUrl,
      ...(Array.isArray(provider?.models) ? provider.models : []),
    ].filter(Boolean).join(" "))
  ));
  const bochaSearchService = searchServices.find((service) => service.id === "bocha");

  const saveAnalysisApiKey = async (apiKey) => {
    if (!browserApi?.saveModelProvider) {
      return { status: "error", message: "请在 Brizo 桌面版中保存。" };
    }
    const result = await browserApi.saveModelProvider({
      apiKey,
      baseUrl: analysisProvider?.baseUrl || "https://api.deepseek.com",
      id: analysisProvider?.id || "",
      makeDefault: false,
      name: analysisProvider?.name || "DeepSeek",
    });
    if (result?.status === "saved") {
      setModelProviders(Array.isArray(result.providers) ? result.providers : []);
      showToast("分析 API Key 已保存");
    }
    return result;
  };

  const saveSearchApiKey = async (apiKey) => {
    if (!browserApi?.saveSearchServiceKey) {
      return { status: "error", message: "请在 Brizo 桌面版中保存。" };
    }
    const result = await browserApi.saveSearchServiceKey({ serviceId: "bocha", apiKey });
    if (result?.status === "saved") {
      setSearchServices(Array.isArray(result.services) ? result.services : []);
      showToast("搜索 API Key 已保存");
    }
    return result;
  };

  const defaultModelProvider = modelProviders.find((provider) => provider.isDefault)
    || modelProviders[0];
  const boundModels = useMemo(() => {
    const orderedProviders = defaultModelProvider
      ? [defaultModelProvider, ...modelProviders.filter((provider) => provider.id !== defaultModelProvider.id)]
      : modelProviders;
    return [...new Set(orderedProviders.flatMap((provider) => provider.models || []))];
  }, [defaultModelProvider, modelProviders]);
  const recentDownloads = useMemo(() => downloads
    .slice()
    .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))
    .slice(0, 5), [downloads]);
  const downloadPageCounts = useMemo(() => ({
    active: downloads.filter(isActiveDownload).length,
    all: downloads.length,
    completed: downloads.filter(isCompletedDownload).length,
    unavailable: downloads.filter(isUnavailableDownload).length,
  }), [downloads]);
  const visibleDownloadGroups = useMemo(() => {
    const needle = downloadPageQuery.trim().toLocaleLowerCase();
    const visibleDownloads = downloads.filter((download) => (
      downloadMatchesSection(download, downloadPageSection)
      && (!needle || String(download.filename || "").toLocaleLowerCase().includes(needle))
    ));
    return {
      count: visibleDownloads.length,
      groups: groupDownloads(visibleDownloads),
    };
  }, [downloadPageQuery, downloadPageSection, downloads]);
  const bookmarkManageFolders = useMemo(() => {
    const paths = new Set();
    bookmarkLibrary.forEach((bookmark) => {
      const parts = splitFolderPath(bookmark.folder);
      parts.forEach((_part, index) => paths.add(parts.slice(0, index + 1).join(" / ")));
    });
    if (bookmarkRanking.enabled) {
      const ordered = [];
      const collect = (node, parent = "") => {
        for (const [name, child] of sortBookmarkFolderEntries(node, folderOrders, parent, bookmarkRanking)) {
          const path = parent ? `${parent} / ${name}` : name;
          ordered.push(path); collect(child, path);
        }
      };
      collect(bookmarkTree);
      return ordered;
    }
    return [...paths].sort((left, right) => left.localeCompare(right, "zh-CN"));
  }, [bookmarkLibrary, bookmarkRanking, bookmarkTree, folderOrders]);
  const managedBookmarks = useMemo(() => {
    const needle = bookmarkManageQuery.trim().toLocaleLowerCase();
    return bookmarkLibrary
      .filter((bookmark) => needle
        ? [bookmark.title, bookmark.url, bookmark.folder]
          .some((value) => String(value || "").toLocaleLowerCase().includes(needle))
        : bookmark.folder === bookmarkManageFolder)
      .sort((left, right) => compareBookmarksForDisplay(left, right, bookmarkRanking));
  }, [bookmarkLibrary, bookmarkManageFolder, bookmarkManageQuery, bookmarkRanking]);
  const bookmarkManageChildFolders = useMemo(() => bookmarkManageQuery.trim()
    ? []
    : bookmarkManageFolders.filter((path) => parentFolderPath(path) === bookmarkManageFolder),
  [bookmarkManageFolder, bookmarkManageFolders, bookmarkManageQuery]);
  const filteredBrowserHistory = useMemo(() => {
    const needle = historyPageQuery.trim().toLocaleLowerCase();
    if (!needle) return browserHistory;
    return browserHistory.filter((item) => [item.title, item.url]
      .some((value) => String(value || "").toLocaleLowerCase().includes(needle)));
  }, [browserHistory, historyPageQuery]);
  const filteredSearchHistory = useMemo(() => {
    const needle = historyPageQuery.trim().toLocaleLowerCase();
    if (!needle) return searchHistory;
    return searchHistory.filter((item) => String(item.query || "").toLocaleLowerCase().includes(needle));
  }, [historyPageQuery, searchHistory]);

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
    setTabs((currentTabs) => [nextTab, ...currentTabs]);
    setActiveSurface("tab");
    activateTabId(nextTab.id);
    addressEditing.current = false;
    addressValue.current = url;
    setAddressText(formatAddressForDisplay(url));
    if (browserApi?.navigatePdf && !options.alreadyNavigated) browserApi.navigatePdf(url, nextTab.id);
    else if (!browserApi) window.open(url, "_blank", "noopener,noreferrer");
  };

  const selectArticle = (article) => {
    if (!article) return;
    setActiveSurface("tab");
    activateTabId(article.id);
    addressEditing.current = false;
    addressValue.current = article.isNewTab ? "" : article.url;
    setAddressText(article.isNewTab ? "" : formatAddressForDisplay(article.url));
    if (browserApi && article.isUseAutomationTab) {
      if (article.useSandboxReady && browserApi.activateBrizoUseTabView) {
        void Promise.resolve(browserApi.activateBrizoUseTabView(article.id)).then((activated) => {
          if (!activated) markUseChildUnavailable(article.id);
        });
      } else {
        browserApi.setVisible?.(false);
      }
    } else if (browserApi && !article.isNewTab && !article.isBookmarksPage && !article.isHistoryPage && !article.isDownloadsPage && !article.isSettingsPage && !article.isBrief && article.id !== "pinned-brief" && article.url !== "brizo://brief" && !/^brizo:\/\/(?:settings|bookmarks|history|downloads)(?:\/|$)/i.test(article.url || "")) {
      if (article.isPdf && browserApi.navigatePdf) browserApi.navigatePdf(article.url, article.id);
      else browserApi.navigate(article.url, article.id);
    } else if (!browserApi && !article.isNewTab && !article.isBookmarksPage && !article.isHistoryPage && !article.isDownloadsPage && !article.isSettingsPage && !article.isBrief && article.id !== "pinned-brief" && article.url !== "brizo://brief" && !/^brizo:\/\/(?:settings|bookmarks|history|downloads)(?:\/|$)/i.test(article.url || "")) {
      showToast(`Opened ${article.domain}`);
    }
  };

  const windowLaunchStarted = useRef(false);
  useEffect(() => {
    if (!windowLaunch || windowLaunchStarted.current) return;
    windowLaunchStarted.current = true;
    selectArticle(windowLaunch);
  }, [windowLaunch]);

  const restorePreviousSession = () => {
    const previous = previousSessionTabs.current;
    if (!previous.length) return;
    previousSessionTabs.current = [];
    setPreviousSessionAvailable(false);
    const restored = previous.map((tab) => {
      const query = tab.searchQuery || tab.initialPrompt || tab.initialUseCommand || tab.prefillPrompt
        || (tab.title?.startsWith("Use: ") ? tab.title.slice(5) : "");
      const savedResult = tab.restoredResult || (query
        ? searchHistory.find((entry) => entry.query === query && entry.result)
        : null);
      return {
        ...tab,
        id: `restored-tab-${window.crypto.randomUUID()}`,
        parentTabId: "",
        initialPrompt: "",
        initialUseCommand: "",
        initialContextTab: null,
        initialMode: tab.initialMode || (tab.title?.startsWith("Use: ") ? "use" : "ask"),
        prefillPrompt: savedResult?.result ? "" : query,
        restoredResult: savedResult?.result ? { query: savedResult.query || query, result: savedResult.result } : null,
        useSessionId: "",
        useStatus: "",
        useSandboxReady: false,
        useLoginRequired: false,
      };
    });
    const selectedIndex = previous.findIndex((tab) => tab.id === startupSession.activeId);
    setTabs((current) => {
      const retained = current.filter((tab) => !(tab.id === START_TAB.id && tab.isNewTab && !tab.searchQuery));
      return [...retained.filter((tab) => tab.isPinned), ...restored, ...retained.filter((tab) => !tab.isPinned)];
    });
    selectArticle(restored[Math.max(0, selectedIndex)]);
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
    const unpinnedToClose = tabs.filter((tab) => !tab.isPinned);
    if (unpinnedToClose.length === 0) {
      showToast("暂无可清空的非置顶标签页");
      return;
    }
    setClosedTabs((prev) => [
      ...prev,
      ...unpinnedToClose
        .filter((tab) => !tab.isUseAutomationTab)
        .map((tab, index) => ({ tab: { ...tab }, index })),
    ]);

    unpinnedToClose.forEach((tab) => {
      browserApi?.closeTabView?.(tab.id);
    });

    const retainedPinnedTabs = tabs.filter((tab) => tab.isPinned);
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
    const nextTabs = [freshTab, ...retainedPinnedTabs];
    setTabs(nextTabs);
    selectArticle(freshTab);
    showToast("已清空全部非置顶标签页");
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
    const existing = tabs.find((tab) => tab.isBookmarksPage || /^brizo:\/\/bookmarks(?:\/|$)/i.test(tab.url || ""));
    const tabId = existing?.id || `bookmarks-tab-${Date.now()}`;
    if (!existing) {
      setTabs((currentTabs) => [{
        domain: "brizo",
        id: tabId,
        iconKey: "bookmarks",
        isBookmarksPage: true,
        shortTitle: "收藏夹",
        title: "收藏夹",
        url: "brizo://bookmarks",
      }, ...currentTabs]);
    }
    setActiveSurface("tab");
    activateTabId(tabId);
    setSettingsMenuOpen(false);
    setSettingsMenuLevel("root");
    setSettingsPanel("");
    addressEditing.current = false;
    addressValue.current = "brizo://bookmarks";
    setAddressText("brizo://bookmarks");
  };

  const openHistoryPage = (section = "browser") => {
    const resolvedSection = section === "search" ? "search" : "browser";
    const route = resolvedSection === "search" ? "brizo://history/search" : "brizo://history";
    const existing = tabs.find((tab) => tab.isHistoryPage || /^brizo:\/\/history(?:\/|$)/i.test(tab.url || ""));
    const tabId = existing?.id || `history-page-${Date.now()}`;
    if (!existing) {
      setTabs((currentTabs) => [{
        domain: "brizo",
        id: tabId,
        iconKey: "history",
        isHistoryPage: true,
        shortTitle: "历史记录",
        title: "历史记录",
        url: route,
      }, ...currentTabs]);
    } else if (existing.url !== route) {
      setTabs((currentTabs) => currentTabs.map((tab) => (
        tab.id === tabId ? { ...tab, isHistoryPage: true, url: route } : tab
      )));
    }
    setActiveSurface("tab");
    activateTabId(tabId);
    setSidebarHistoryOpen(false);
    setSettingsMenuOpen(false);
    setSettingsMenuLevel("root");
    setSettingsPanel("");
    addressEditing.current = false;
    addressValue.current = route;
    setAddressText(route);
  };

  const openDownloadsPage = (section = "all") => {
    const resolvedSection = ["active", "completed", "unavailable"].includes(section)
      ? section
      : "all";
    const route = resolvedSection === "all"
      ? "brizo://downloads"
      : `brizo://downloads/${resolvedSection}`;
    const existing = tabs.find((tab) => (
      tab.isDownloadsPage || /^brizo:\/\/downloads(?:\/|$)/i.test(tab.url || "")
    ));
    const tabId = existing?.id || `downloads-page-${Date.now()}`;
    if (!existing) {
      setTabs((currentTabs) => [{
        domain: "brizo",
        id: tabId,
        iconKey: "downloads",
        isDownloadsPage: true,
        shortTitle: "下载内容",
        title: "下载内容",
        url: route,
      }, ...currentTabs]);
    } else if (existing.url !== route) {
      setTabs((currentTabs) => currentTabs.map((tab) => (
        tab.id === tabId ? { ...tab, isDownloadsPage: true, url: route } : tab
      )));
    }
    setActiveSurface("tab");
    activateTabId(tabId);
    setDownloadsOpen(false);
    setSettingsMenuOpen(false);
    setSettingsMenuLevel("root");
    setSettingsPanel("");
    addressEditing.current = false;
    addressValue.current = route;
    setAddressText(route);
  };

  const openSettingsPage = (sectionId = "people") => {
    const resolvedSection = SETTINGS_SECTIONS.some((section) => section.id === sectionId)
      ? sectionId
      : "people";
    const route = resolvedSection === "people" ? "brizo://settings" : `brizo://settings/${resolvedSection}`;
    const existing = tabs.find((tab) => tab.isSettingsPage || /^brizo:\/\/settings(?:\/|$)/i.test(tab.url || ""));
    const tabId = existing?.id || `settings-tab-${Date.now()}`;
    if (!existing) {
      setTabs((currentTabs) => [{
        domain: "brizo",
        id: tabId,
        iconKey: "settings",
        isSettingsPage: true,
        shortTitle: "设置",
        settingsHistory: [route],
        settingsHistoryIndex: 0,
        title: "设置",
        url: route,
      }, ...currentTabs]);
    } else if (existing.url !== route) {
      setTabs((currentTabs) => currentTabs.map((tab) => (
        tab.id === tabId ? (() => {
          const history = Array.isArray(tab.settingsHistory) && tab.settingsHistory.length
            ? tab.settingsHistory
            : [tab.url || "brizo://settings"];
          const index = Number.isInteger(tab.settingsHistoryIndex)
            ? tab.settingsHistoryIndex
            : history.length - 1;
          const nextHistory = [...history.slice(0, index + 1), route];
          return {
            ...tab,
            isSettingsPage: true,
            settingsHistory: nextHistory,
            settingsHistoryIndex: nextHistory.length - 1,
            url: route,
          };
        })() : tab
      )));
    }
    setActiveSurface("tab");
    activateTabId(tabId);
    setSettingsMenuOpen(false);
    setSettingsMenuLevel("root");
    setSettingsPanel("");
    addressEditing.current = false;
    addressValue.current = route;
    setAddressText(formatAddressForDisplay(route));
  };

  const updateSettingsRoute = (sectionId) => {
    if (!SETTINGS_SECTIONS.some((section) => section.id === sectionId)) return;
    const route = sectionId === "people" ? "brizo://settings" : `brizo://settings/${sectionId}`;
    setTabs((currentTabs) => currentTabs.map((tab) => (
      tab.id === activeTab ? (() => {
        if (tab.url === route) return tab;
        const history = Array.isArray(tab.settingsHistory) && tab.settingsHistory.length
          ? tab.settingsHistory
          : [tab.url || "brizo://settings"];
        const index = Number.isInteger(tab.settingsHistoryIndex)
          ? tab.settingsHistoryIndex
          : history.length - 1;
        const nextHistory = [...history.slice(0, index + 1), route];
        return {
          ...tab,
          isSettingsPage: true,
          settingsHistory: nextHistory,
          settingsHistoryIndex: nextHistory.length - 1,
          url: route,
        };
      })() : tab
    )));
    addressEditing.current = false;
    addressValue.current = route;
    setAddressText(formatAddressForDisplay(route));
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
    setTabs((currentTabs) => [nextTab, ...currentTabs]);
    setActiveSurface("tab");
    activateTabId(nextTab.id);
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
    const settingsRouteMatch = nextAddress.match(/^brizo(?::\/\/|\/)settings(?:\/([^/?#]+))?\/?$/i);
    if (settingsRouteMatch) {
      setAddressFocused(false);
      openSettingsPage(settingsRouteMatch[1] || "people");
      return;
    }
    if (/^brizo(?::\/\/|\/)bookmarks\/?$/i.test(nextAddress)) {
      setAddressFocused(false);
      openBookmarkOrganizerPage();
      return;
    }
    const historyRouteMatch = nextAddress.match(/^brizo(?::\/\/|\/)history(?:\/(search))?\/?$/i);
    if (historyRouteMatch) {
      setAddressFocused(false);
      openHistoryPage(historyRouteMatch[1] || "browser");
      return;
    }
    const downloadsRouteMatch = nextAddress.match(/^brizo(?::\/\/|\/)downloads(?:\/(active|completed|unavailable))?\/?$/i);
    if (downloadsRouteMatch) {
      setAddressFocused(false);
      openDownloadsPage(downloadsRouteMatch[1]?.toLocaleLowerCase() || "all");
      return;
    }
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
    if (internalLibraryPageOpen || settingsPageOpen) {
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
        iconKey: "",
        isBookmarksPage: false,
        isDownloadsPage: false,
        isHistoryPage: false,
        isSettingsPage: false,
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
    activateTabId(nextTab.id);
  };

  const submitAddressValue = (value) => {
    const selectedTabId = activeTabRef.current;
    const lockedUseTab = tabsRef.current.find((tab) => (
      (["running", "paused"].includes(tab.useStatus) || tab.agentStatus === "agent")
      && (tab.id === selectedTabId || tab.parentTabId === selectedTabId)
    ));
    if (lockedUseTab) {
      const selectedTab = tabsRef.current.find((tab) => tab.id === selectedTabId);
      setAddressFocused(false);
      addressEditing.current = false;
      addressValue.current = selectedTab?.url || "";
      setAddressText(selectedTab?.isNewTab ? "" : formatAddressForDisplay(selectedTab?.url || ""));
      showToast(lockedUseTab.agentSessionId ? "请先点击「接管网页」，再手动导航" : "Use 运行期间请在父标签查看记录；完成后可继续导航");
      return;
    }
    const sharedQuery = queryFromSearchShareUrl(value);
    if (sharedQuery) exploreFromAddress(sharedQuery);
    else if (/^brizo(?::\/\/|\/)(?:settings|bookmarks|history|downloads)(?:\/|$)/i.test(value) || looksLikeWebsiteInput(value)) navigateFromAddress(value);
    else exploreFromAddress(value);
  };

  const submitAddress = (event) => {
    event.preventDefault();
    const selected = addressSuggestions[addressSuggestionIndex];
    submitAddressValue(selected?.value || (addressInputIntent.kind === "website" ? addressSuggestions[0]?.value : "") || addressValue.current);
  };

  const submitAddressQuickAction = (engine) => {
    const query = addressValue.current.trim();
    if (!query) {
      addressInput.current?.focus();
      return;
    }
    if (engine === "ask") {
      submitAddressValue(query);
      return;
    }
    const searchUrl = engine === "bing"
      ? `https://www.bing.com/search?q=${encodeURIComponent(query)}`
      : `https://www.google.com/search?q=${encodeURIComponent(query)}`;
    submitAddressValue(searchUrl);
  };

  const saveCompletedSearch = useCallback(({ query: completedQuery, result }) => {
    const snapshot = createSearchHistorySnapshot(result);
    if (!snapshot) return;
    setSearchHistory((current) => {
      const existing = current.find((item) => item.query === completedQuery);
      return persistSearchHistory([
        { ...existing, query: completedQuery, result: snapshot, updatedAt: Date.now() },
        ...current.filter((item) => item.query !== completedQuery),
      ]);
    });
  }, []);

  const submitNewTabPrompt = async ({ attachments, contextTabs = [], depth, model, searchId, tabId, thread, value }) => {
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
    const selectedTabs = contextTabs.slice(0, 8);
    const contextCount = attachments.length + selectedTabs.length;
    if (contextCount) {
      showToast(`${model} · 已加入 ${contextCount} 项上下文`);
    }

    let result;
    if (browserApi?.startSearch) {
      result = await browserApi.startSearch({
        context: {
          attachmentTokens: attachments.map((file) => file.token).filter(Boolean).slice(0, 8),
          tab: selectedTabs[0] ? { id: selectedTabs[0].id, title: selectedTabs[0].title, url: selectedTabs[0].url } : null,
          tabs: selectedTabs.map((tab) => ({ id: tab.id, title: tab.title, url: tab.url })),
        },
        depth,
        model,
        query: value,
        searchId,
        tabId,
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

  const handleUseProgress = useCallback((event) => {
    const sessionId = String(event?.sessionId || "");
    if (!sessionId) return;
    setTabs((currentTabs) => currentTabs.map((tab) => {
      if (!tab.isUseAutomationTab || tab.useSessionId !== sessionId) return tab;
      if (event?.viewGone) {
        return {
          ...tab,
          useSandboxReady: false,
          useStatus: "error",
          useViewMissing: true,
          useLoginRequired: false,
        };
      }
      return {
        ...tab,
        title: event?.title || tab.title,
        url: event?.url || tab.url,
        useSandboxReady: Boolean(event?.embeddedSandbox) || tab.useSandboxReady,
        useViewMissing: event?.embeddedSandbox ? false : tab.useViewMissing,
        useStatus: typeof event?.paused === "boolean"
          ? (event.paused ? "paused" : "running")
          : tab.useStatus,
        useLoginRequired: typeof event?.loginRequired === "boolean" ? event.loginRequired : tab.useLoginRequired,
      };
    }));
  }, []);

  useEffect(() => {
    const waitingTabs = tabs.filter((tab) => tab.useLoginRequired);
    if (!waitingTabs.length) return undefined;
    const positionPrompts = () => {
      for (const tab of waitingTabs) {
        const anchor = document.querySelector(`[data-use-login-tab="${CSS.escape(tab.id)}"]`)
          || document.querySelector(`[data-use-login-group="${CSS.escape(tab.parentTabId)}"]`)
          || document.querySelector(".sidebar-tabs-section");
        if (!anchor) continue;
        browserApi?.setUseLoginPromptLayout?.({ sessionId: tab.useSessionId, ...getCollapsedTabHovercardPosition(anchor) });
      }
    };
    const frame = requestAnimationFrame(positionPrompts);
    window.addEventListener("resize", positionPrompts);
    document.addEventListener("scroll", positionPrompts, true);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", positionPrompts);
      document.removeEventListener("scroll", positionPrompts, true);
    };
  }, [tabs, activeTab, sidebarCollapsed, collapsedGroups, browserApi]);

  const submitNewTabUse = async ({ command, sessionId, tabId }) => {
    const value = String(command || "").trim();
    if (!value) return { status: "error", message: "请输入 Use 指令。", sources: [] };
    if (!browserApi?.runBrizoUseCommand) {
      return {
        status: "error",
        message: "Use 需要 Brizo 桌面版的独立浏览器沙箱，网页预览不会模拟浏览器操作。",
        sources: [],
      };
    }
    const childTabId = `use-page-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const parentTitle = `Use: ${value}`;
    const childTab = {
      domain: "brizo-use",
      id: childTabId,
      isUseAutomationTab: true,
      parentTabId: tabId,
      shortTitle: "沙箱操作中",
      title: "下级标签正在自动操作",
      url: "",
      useCommand: value,
      useSandboxReady: false,
      useSessionId: sessionId,
      useStatus: "running",
    };
    setTabs((currentTabs) => {
      const parentIndex = currentTabs.findIndex((tab) => tab.id === tabId);
      const updated = currentTabs.map((tab) => tab.id === tabId ? {
        ...tab,
        shortTitle: parentTitle,
        title: parentTitle,
      } : tab);
      const insertAt = parentIndex >= 0 ? parentIndex + 1 : 0;
      updated.splice(insertAt, 0, childTab);
      return updated;
    });
    setActiveSurface("tab");
    activateTabId(childTabId);
    addressEditing.current = false;
    addressValue.current = "";
    setAddressText("");

    let ipcFailed = false;
    let result;
    try {
      result = await browserApi.runBrizoUseCommand({
        command: value,
        originTabId: tabId,
        sessionId,
        viewTabId: childTabId,
      });
    } catch (error) {
      ipcFailed = true;
      result = {
        status: "error",
        message: `Use 启动失败：${error instanceof Error ? error.message : String(error)}`,
        processSteps: ["下级隔离网页创建失败"],
        sources: [],
      };
    }
    const retainedTitle = String(result?.pageTitle || "").trim() || "Use 操作页";
    const retainedUrl = String(result?.url || "").trim();
    setTabs((currentTabs) => currentTabs.map((tab) => tab.id === childTabId ? {
      ...tab,
      domain: (() => {
        try { return new URL(retainedUrl).hostname.replace(/^www\./i, "") || tab.domain; }
        catch { return tab.domain; }
      })(),
      shortTitle: retainedTitle,
      title: retainedTitle,
      url: retainedUrl || tab.url,
      useSandboxReady: !ipcFailed,
      useViewMissing: ipcFailed,
      useStatus: result?.status === "success" || result?.status === "preview" ? "complete" : "error",
      useLoginRequired: false,
    } : tab));

    if (activeTabRef.current === childTabId && tabsRef.current.some((tab) => tab.id === tabId)) {
      activateTabId(tabId);
      addressEditing.current = false;
      addressValue.current = "";
      setAddressText("");
    }
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

  const navigateSettingsHistory = (delta) => {
    if (!settingsPageOpen) return;
    const nextIndex = Math.min(
      settingsRouteHistory.length - 1,
      Math.max(0, settingsRouteHistoryIndex + delta),
    );
    if (nextIndex === settingsRouteHistoryIndex) return;
    const route = settingsRouteHistory[nextIndex];
    setTabs((currentTabs) => currentTabs.map((tab) => (
      tab.id === activeTab
        ? {
          ...tab,
          isSettingsPage: true,
          settingsHistory: settingsRouteHistory,
          settingsHistoryIndex: nextIndex,
          url: route,
        }
        : tab
    )));
    addressEditing.current = false;
    addressValue.current = route;
    setAddressText(formatAddressForDisplay(route));
  };

  const navigateBack = () => {
    if (useFamilyNavigationLocked) {
      showToast("Use 运行期间不能切换父子标签的网页历史");
      return;
    }
    if (briefOpen) {
      setActiveSurface("tab");
      return;
    }
    if (settingsPageOpen) {
      navigateSettingsHistory(-1);
      return;
    }
    if (restoreNewTabSession()) return;
    if (desktopMode) browserApi.back();
    else showToast("Back");
  };

  const navigateForward = () => {
    if (useFamilyNavigationLocked) {
      showToast("Use 运行期间不能切换父子标签的网页历史");
      return;
    }
    if (settingsPageOpen) {
      navigateSettingsHistory(1);
      return;
    }
    if (desktopMode) browserApi.forward();
    else showToast("Forward");
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

  const updateSiteHygiene = async (changes) => {
    const next = { ...siteHygienePreferencesRef.current, ...changes };
    siteHygienePreferencesRef.current = next;
    setSiteHygienePreferences(next);
    if (!browserApi?.setSiteHygiene) return next;
    const save = siteHygieneWriteQueueRef.current.then(() => browserApi.setSiteHygiene(next));
    siteHygieneWriteQueueRef.current = save.catch(() => undefined);
    try {
      const saved = await save;
      if (saved && siteHygienePreferencesRef.current === next) {
        siteHygienePreferencesRef.current = saved;
        setSiteHygienePreferences(saved);
      }
      return saved || next;
    } catch {
      if (siteHygienePreferencesRef.current === next) {
        const restored = await browserApi.getSiteHygiene?.().catch(() => null);
        if (restored) {
          siteHygienePreferencesRef.current = restored;
          setSiteHygienePreferences(restored);
        }
        showToast("设置保存失败");
      }
      return null;
    }
  };

  const resetBrizoSettings = async () => {
    const confirmed = window.confirm("将 Brizo 设置还原为默认值？API Key、密码、收藏夹和历史记录会保留。");
    if (!confirmed) return;
    setAppPreferences({ ...DEFAULT_APP_PREFERENCES });
    setPageZoom(1);
    const hygieneReset = await updateSiteHygiene({ ...DEFAULT_SITE_HYGIENE_PREFERENCES });
    const downloadReset = browserApi?.setDownloadDirectory
      ? await browserApi.setDownloadDirectory("")
      : true;
    showToast(hygieneReset && downloadReset
      ? "设置已还原为默认值"
      : "部分设置未能还原，请稍后重试");
  };

  const toggleSiteHygieneForCurrentSite = () => {
    if (!currentSiteOrigin) return;
    const currentlyEnabled = siteHygienePreferences.siteOverrides?.[currentSiteOrigin]?.enabled !== false;
    void updateSiteHygiene({
      siteOverrides: {
        ...(siteHygienePreferences.siteOverrides || {}),
        [currentSiteOrigin]: { enabled: !currentlyEnabled },
      },
    });
    showToast(currentlyEnabled ? "已暂停此网站的智能处理" : "已恢复此网站的智能处理");
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
    activateTabId(tabId);
    setSettingsPanel("");
    addressValue.current = "";
    setAddressText("");
  };

  const selectManagedBookmarkFolder = (path) => {
    const parts = splitFolderPath(path);
    setBookmarkManageExpanded((current) => {
      const next = new Set(current);
      for (let index = 1; index < parts.length; index += 1) {
        next.add(joinFolderPath(parts.slice(0, index)));
      }
      return next;
    });
    setBookmarkManageFolder(path);
    setBookmarkManageQuery("");
    setBookmarkManageSelection(new Set());
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
    const nextUrl = bookmarkManageDraft.url.trim();
    setBookmarkLibrary((current) => current.map((bookmark) => {
      if (bookmark.url !== bookmarkManageDraft.originalUrl) return bookmark;
      const urlChanged = bookmark.url !== nextUrl;
      return {
        ...bookmark,
        folder: normalizeImportedBookmarkFolder(bookmarkManageDraft.folder),
        openCount: urlChanged ? 0 : bookmarkOpenCount(bookmark),
        smartPromotionSeenAt: urlChanged ? 0 : bookmark.smartPromotionSeenAt,
        title: bookmarkManageDraft.title.trim(),
        url: nextUrl,
        updatedAt: Date.now(),
      };
    }));
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

  const backToSettingsMenu = () => {
    setSettingsPanel("");
    if (settingsPageOpen) return;
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
    try {
      let result;
      if (action === "pause" || action === "resume") {
        result = await browserApi?.setDownloadPaused?.(download.id, action === "pause");
      } else if (action === "cancel") {
        result = await browserApi?.cancelDownload?.(download.id);
      } else if (action === "open") {
        result = await browserApi?.openDownloadedFile?.(download.id);
      } else if (action === "reveal") {
        result = await browserApi?.revealDownloadedFile?.(download.id);
      } else if (action === "delete") {
        result = await browserApi?.deleteDownloadedFile?.(download.id);
      }
      if (result?.status === "unavailable" || result?.status === "failed") {
        showToast(action === "reveal" ? "无法打开文件所在目录" : "此下载项目当前不可用");
      } else if (action === "delete" && result?.status === "deleted") {
        showToast(result.trashed ? "已移到废纸篓并清除记录" : "已清除下载记录");
      }
    } catch {
      showToast(action === "delete" ? "删除失败，文件与记录均已保留" : "此下载项目当前不可用");
    } finally {
      if (browserApi?.listDownloads) {
        const nextDownloads = await browserApi.listDownloads().catch(() => null);
        if (Array.isArray(nextDownloads)) setDownloads(nextDownloads);
      }
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
    setBookmarkLibrary((current) => current.map((item) => (
      item.url === bookmark.url
        ? { ...item, openCount: bookmarkOpenCount(item) + 1 }
        : item
    )));
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
    setTabs((currentTabs) => [nextTab, ...currentTabs]);
    selectArticle(nextTab);
  };

  const closeTab = (tabId) => {
    const closingIndex = tabs.findIndex((tab) => tab.id === tabId);
    if (closingIndex < 0 || tabs.length === 1) return;

    tabRemovalAnimationPending.current = true;
    const closingTab = tabs[closingIndex];
    if (!closingTab.isUseAutomationTab) {
      setClosedTabs((prev) => [...prev, { tab: { ...closingTab }, index: closingIndex }]);
    }

    const nextTabs = tabs
      .filter((tab) => tab.id !== tabId)
      .map((tab) => tab.parentTabId === tabId ? { ...tab, parentTabId: "" } : tab);
    browserApi?.closeTabView?.(tabId);
    setTabs(nextTabs);
    if (tabId !== activeTab) return;

    const nextArticle = closingTab.parentTabId
      ? nextTabs.find((tab) => tab.id === closingTab.parentTabId)
        || nextTabs[Math.min(closingIndex, nextTabs.length - 1)]
      : nextTabs[Math.min(closingIndex, nextTabs.length - 1)];
    selectArticle(nextArticle);
  };

  const openHoveredTabInWindow = () => {
    const hoveredTab = tabsRef.current.find((tab) => tab.id === collapsedTabHover?.tabId);
    const url = String(hoveredTab?.url || "").trim();
    if (!/^https?:\/\//i.test(url)) return;
    dismissCollapsedTabHover();
    if (browserApi?.openLinkWindow) {
      void Promise.resolve(browserApi.openLinkWindow(url)).then((opened) => {
        if (!opened) showToast("无法在新窗口打开此网页");
      });
      return;
    }
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const toggleHoveredTabBookmark = () => {
    const hoveredTab = tabsRef.current.find((tab) => tab.id === collapsedTabHover?.tabId);
    const url = String(hoveredTab?.url || "").trim();
    if (!/^https?:\/\//i.test(url)) return;
    const bookmarkKey = canonicalizeUrl(url);
    const existing = bookmarkLibrary.find((bookmark) => canonicalizeUrl(bookmark.url) === bookmarkKey);
    if (existing) {
      setBookmarkLibrary((library) => library.filter((bookmark) => canonicalizeUrl(bookmark.url) !== bookmarkKey));
      showToast("已移除书签");
    } else {
      const now = Date.now();
      const bookmark = normalizeImportedBookmark({
        createdAt: now,
        faviconUrl: hoveredTab.faviconUrl || "",
        folder: "",
        manualOrder: null,
        source: "brizo",
        sourceOrder: bookmarkLibrary.length,
        title: hoveredTab.title || hoveredTab.shortTitle || url,
        updatedAt: now,
        url,
      });
      setBookmarkLibrary((library) => [bookmark, ...library]);
      setBookmarkCelebrationUrl(url);
      showToast("已加入收藏");
    }
    dismissCollapsedTabHover();
  };

  const closeTabGroup = (groupTabs) => {
    if (!groupTabs || groupTabs.length === 0) return;
    tabRemovalAnimationPending.current = true;
    const groupRecords = groupTabs.map((t) => {
      const idx = tabs.findIndex((item) => item.id === t.id);
      return { tab: { ...t }, index: idx >= 0 ? idx : 0 };
    }).filter((item) => !item.tab.isUseAutomationTab);
    setClosedTabs((prev) => [...prev, ...groupRecords]);

    const closingIds = new Set(groupTabs.map((t) => t.id));
    groupTabs.forEach((t) => {
      browserApi?.closeTabView?.(t.id);
    });

    const nextTabs = tabs.filter((t) => !closingIds.has(t.id));
    if (nextTabs.length === 0) {
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
      selectArticle(freshTab);
    } else {
      setTabs(nextTabs);
      if (closingIds.has(activeTab)) {
        const nextActive = nextTabs[0];
        selectArticle(nextActive);
      }
    }
    showToast(`已关闭「${getSiteDisplayName(getPrimaryDomain(groupTabs[0]?.url), groupTabs[0])}」分组 (${groupTabs.length} 个标签)`);
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

  const moveGroupBefore = (groupTabs, targetTabId) => {
    if (!groupTabs || groupTabs.length === 0 || !targetTabId) return;
    const groupIds = new Set(groupTabs.map((t) => t.id));
    if (groupIds.has(targetTabId)) return;

    setTabs((currentTabs) => {
      const remainingTabs = currentTabs.filter((t) => !groupIds.has(t.id));
      const targetIndex = remainingTabs.findIndex((t) => t.id === targetTabId);
      if (targetIndex < 0) return currentTabs;

      const orderedGroupTabs = groupTabs
        .map((t) => currentTabs.find((ct) => ct.id === t.id))
        .filter(Boolean);

      const nextTabs = [...remainingTabs];
      nextTabs.splice(targetIndex, 0, ...orderedGroupTabs);
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

  const openPilotForCurrentPage = () => {
    if (!currentArticle || !/^https?:\/\//i.test(currentPageUrl)) {
      showToast("Pilot 需要一个已打开的网页");
      return;
    }
    const sourceTab = {
      id: currentArticle.id,
      title: navigationState.title || currentArticle.title || currentPageUrl,
      url: currentPageUrl,
    };
    const nextTab = {
      domain: "brizo",
      id: `pilot-tab-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      initialContextTab: sourceTab,
      initialPrompt: "请阅读并核验我插入的当前网页：先用五句话以内给出核心结论，再列出关键事实与数字、证据不足或可能误导之处，最后给出三个可执行的下一步。明确区分网页原文、外部核验与推断。",
      isNewTab: true,
      shortTitle: "Pilot: 阅读当前页",
      title: "Pilot: 阅读当前页",
      url: "",
      useTodayGreeting: false,
    };
    setTabs((currentTabs) => [nextTab, ...currentTabs]);
    setActiveSurface("tab");
    activateTabId(nextTab.id);
    addressEditing.current = false;
    addressValue.current = "";
    setAddressText("");
  };

  const openBrief = () => {
    const existing = tabs.find((tab) => tab.id === "pinned-brief" || tab.isBrief || tab.url === "brizo://brief");
    const tabId = existing?.id || "pinned-brief";
    if (!existing) {
      setTabs((currentTabs) => [{
        domain: "brief",
        id: tabId,
        isBrief: true,
        shortTitle: "Brief",
        title: "Brizo Brief 简报",
        url: "brizo://brief",
        iconKey: "brief",
      }, ...currentTabs]);
    }
    setActiveSurface("tab");
    activateTabId(tabId);
    setSettingsMenuOpen(false);
    setSettingsPanel("");
    addressEditing.current = false;
    addressValue.current = "brizo://brief";
    setAddressText(formatAddressForDisplay("brizo://brief"));
  };

  const refreshBrief = async () => {
    if (!browserApi?.getBriefEdition) {
      const { createBriefPreviewEdition } = await import("./BriefPage.jsx");
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
      setTabs((currentTabs) => [nextTab, ...currentTabs]);
      setActiveSurface("tab");
      activateTabId(nextTab.id);
      addressEditing.current = false;
      addressValue.current = url;
      setAddressText(formatAddressForDisplay(url));
      browserApi.navigateImage(url, nextTab.id);
    });
  }, [browserApi]);

  useEffect(() => {
    if (!browserApi?.onRequestCloseTab) return undefined;
    return browserApi.onRequestCloseTab((tabId) => {
      if (typeof tabId === "string" && tabId) {
        closeTab(tabId);
      }
    });
  }, [browserApi, closeTab]);

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
      activateTabId(nextTab.id);
      addressEditing.current = false;
      addressValue.current = "";
      setAddressText("");
    });
  }, [browserApi]);

  return (
    <SoftBlurIn
      as="main"
      className={`app-shell ${sidebarCollapsed ? "is-sidebar-collapsed" : ""}${shellUsesLightForeground ? " uses-light-shell-foreground" : ""}`}
      style={{
        "--tab-seam-color": pageUsesLightForeground
          ? "rgba(255, 255, 255, 0.44)"
          : "#dde0dc",
        "--page-background-color": pageBackgroundColor,
      }}
    >
      <aside className="spaces-panel">
        <header className="spaces-header">
          <Logo collapsed={sidebarCollapsed} />
        </header>

        {pinnedTabs.length > 0 && (
          <div
            className="pinned-tabs-grid"
            role="tablist"
            aria-label="常驻标签"
            style={{ "--pinned-grid-expanded-height": `${pinnedGridHeight}px` }}
          >
            {pinnedTabs.map((tab) => {
              const isSelected = briefOpen
                ? Boolean(tab.isBrief || tab.id === "pinned-brief" || tab.url === "brizo://brief")
                : activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  className={`pinned-tab-btn${isSelected ? " is-active" : ""}${isSelected && pageUsesLightForeground ? " uses-light-foreground" : ""}`}
                  role="tab"
                  aria-selected={isSelected}
                  aria-label={tab.title || tab.shortTitle || "标签页"}
                  aria-controls={collapsedTabHover?.tabId === tab.id ? COLLAPSED_TAB_HOVERCARD_ID : undefined}
                  aria-haspopup="dialog"
                  onMouseEnter={(event) => scheduleCollapsedTabHover(event, tab)}
                  onMouseLeave={scheduleCollapsedTabHoverDismiss}
                  onFocus={(event) => scheduleCollapsedTabHover(event, tab, COLLAPSED_TAB_FOCUS_DELAY_MS)}
                  onBlur={scheduleCollapsedTabHoverDismiss}
                  onClick={() => {
                    dismissCollapsedTabHover();
                    selectArticle(tab);
                  }}
                  onContextMenu={(event) => {
                    dismissCollapsedTabHover();
                    handleTabContextMenu(event, tab);
                  }}
                >
                  <SiteIcon
                    id={tab.id}
                    iconKey={tab.iconKey}
                    url={tab.url}
                    faviconUrl={tab.faviconUrl}
                    isError={tab.loadError}
                    isNewTab={tab.isNewTab}
                    isPdf={tab.isPdf}
                    isAutomating={isTabAutomating(tab)}
                    useIconStatus={useIconStatusForTab(tab, tabs)}
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
            onScroll={() => {
              updateTabsScrollFlags();
              dismissCollapsedTabHover();
            }}
          >
            {activeIndicatorY !== null && (
              <div
                className={`sidebar-tab-active-indicator${activeTabIsGrouped ? " is-grouped-tab" : ""}${pageUsesLightForeground ? " uses-light-foreground" : ""}`}
                style={{
                  "--indicator-x": `${activeIndicatorX}px`,
                  "--indicator-y": `${activeIndicatorY}px`,
                  ...(activeIndicatorWidth ? { width: `${activeIndicatorWidth}px` } : {}),
                  height: `${activeIndicatorHeight}px`,
                }}
                aria-hidden="true"
              />
            )}
            {groupedTabItems.map((item) => {
              if (item.type === "group") {
                const isCollapsed = collapsedGroups.has(item.groupId);
                const runningUseTab = item.isUseFamily
                  ? item.tabs.find((tab) => ["running", "paused"].includes(tab.useStatus))
                  : null;
                return (
                  <div
                    className={`sidebar-tab-group${isCollapsed ? " is-collapsed" : ""}${draggedGroupId === item.groupId ? " is-dragging" : ""}`}
                    data-use-login-group={item.isUseFamily ? item.tabs.find((tab) => tab.parentTabId)?.parentTabId : undefined}
                    key={item.groupId}
                    ref={(el) => {
                      const key = `group:${item.groupId}`;
                      if (el) {
                        tabLayoutItemRefs.current[key] = el;
                      } else {
                        delete tabLayoutItemRefs.current[key];
                      }
                    }}
                    onDragOver={(event) => {
                      event.preventDefault();
                      event.dataTransfer.dropEffect = "move";
                    }}
                    onDragEnter={() => {
                      if (draggedGroupId && draggedGroupId !== item.groupId) {
                        const draggedGroup = groupedTabItems.find((g) => g.type === "group" && g.groupId === draggedGroupId);
                        if (draggedGroup && draggedGroup.tabs && item.tabs?.[0]?.id) {
                          moveGroupBefore(draggedGroup.tabs, item.tabs[0].id);
                        }
                      } else if (draggedTabId && !item.tabs.some((t) => t.id === draggedTabId)) {
                        moveTabBefore(draggedTabId, item.tabs[0].id);
                      }
                    }}
                    onDrop={(event) => {
                      event.preventDefault();
                      setDraggedGroupId("");
                      setDraggedTabId("");
                    }}
                  >
                    <div
                      className="sidebar-tab-group-header"
                      role="button"
                      tabIndex={0}
                      draggable
                      aria-expanded={!isCollapsed}
                      onMouseEnter={(event) => {
                        if (runningUseTab?.useLoginRequired) scheduleCollapsedTabHover(event, runningUseTab);
                      }}
                      onMouseLeave={scheduleCollapsedTabHoverDismiss}
                      onFocus={(event) => {
                        if (runningUseTab?.useLoginRequired) scheduleCollapsedTabHover(event, runningUseTab, 0);
                      }}
                      onClick={() => toggleGroupCollapse(item.groupId)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          toggleGroupCollapse(item.groupId);
                        }
                      }}
                      onDragStart={(event) => {
                        event.dataTransfer.effectAllowed = "move";
                        event.dataTransfer.setData("application/x-brizo-group-id", item.groupId);
                        setDraggedGroupId(item.groupId);
                      }}
                      onDragEnd={() => {
                        setDraggedGroupId("");
                      }}
                    >
                      <span className="sidebar-tab-group-icon">
                        <SiteIcon
                          id={item.iconTab.id}
                          iconKey={item.iconTab.iconKey}
                          url={item.iconTab.url}
                          faviconUrl={item.iconTab.faviconUrl}
                          isError={item.iconTab.loadError}
                          isNewTab={item.iconTab.isNewTab}
                          isPdf={item.iconTab.isPdf}
                          isAutomating={isTabAutomating(item.iconTab)}
                          useIconStatus={useIconStatusForTab(item.iconTab, tabs)}
                        />
                      </span>
                      <span className="sidebar-tab-group-title" title={`${item.siteName} (${item.tabs.length})`}>
                        {item.siteName}
                      </span>
                      {runningUseTab && (
                        <span className={`sidebar-tab-use-status is-${runningUseTab.useStatus}`} aria-label={runningUseTab.useLoginRequired ? "Use 等待登录" : runningUseTab.useStatus === "paused" ? "Use 已暂停" : "Use 正在自动操作"} />
                      )}
                      <span className="sidebar-tab-group-toggle" aria-hidden="true">
                        <CaretDown size={13} weight="bold" />
                      </span>
                      <button
                        type="button"
                        className="sidebar-tab-group-close"
                        aria-label={`关闭 ${item.siteName} 标签组`}
                        title="关闭标签组"
                        onClick={(event) => {
                          event.stopPropagation();
                          closeTabGroup(item.tabs);
                        }}
                      >
                        <X size={13} weight="bold" />
                      </button>
                    </div>

                    {!isCollapsed && (
                      <div className="sidebar-tab-group-items">
                        {item.tabs.map((tab) => {
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
                                dismissCollapsedTabHover();
                                event.dataTransfer.effectAllowed = "move";
                                event.dataTransfer.setData("application/x-brizo-tab-id", tab.id);
                                setDraggedTabId(tab.id);
                              }}
                              onDragEnter={() => {
                                if (draggedGroupId) {
                                  const draggedGroup = groupedTabItems.find((g) => g.type === "group" && g.groupId === draggedGroupId);
                                  if (draggedGroup && !draggedGroup.tabs.some((t) => t.id === tab.id)) {
                                    moveGroupBefore(draggedGroup.tabs, tab.id);
                                  }
                                } else if (draggedTabId) {
                                  moveTabBefore(draggedTabId, tab.id);
                                }
                              }}
                              onDragOver={(event) => {
                                event.preventDefault();
                                event.dataTransfer.dropEffect = "move";
                              }}
                              onDrop={(event) => {
                                event.preventDefault();
                                setDraggedTabId("");
                                setDraggedGroupId("");
                              }}
                              onDragEnd={() => {
                                setDraggedTabId("");
                                setDraggedGroupId("");
                              }}
                              onContextMenu={(event) => {
                                dismissCollapsedTabHover();
                                handleTabContextMenu(event, tab);
                              }}
                              onMouseEnter={(event) => {
                                if (!sidebarCollapsed) startTabTitleMarquee(event);
                              }}
                              onMouseLeave={stopTabTitleMarquee}
                            >
                              <button
                                type="button"
                                className="sidebar-tab-select"
                                data-use-login-tab={tab.id}
                                role="tab"
                                aria-selected={isSelected}
                                aria-label={tab.title || tab.shortTitle || "标签页"}
                                aria-controls={collapsedTabHover?.tabId === tab.id ? COLLAPSED_TAB_HOVERCARD_ID : undefined}
                                aria-haspopup="dialog"
                                onMouseEnter={(event) => scheduleCollapsedTabHover(event, tab)}
                                onMouseLeave={scheduleCollapsedTabHoverDismiss}
                                onFocus={(event) => scheduleCollapsedTabHover(event, tab, COLLAPSED_TAB_FOCUS_DELAY_MS)}
                                onBlur={scheduleCollapsedTabHoverDismiss}
                                onClick={() => {
                                  dismissCollapsedTabHover();
                                  selectArticle(tab);
                                }}
                              >
                                <SiteIcon
                                  id={tab.id}
                                  iconKey={tab.iconKey}
                                  url={tab.url}
                                  faviconUrl={tab.faviconUrl}
                                  isError={tab.loadError}
                                  isNewTab={tab.isNewTab}
                                  isPdf={tab.isPdf}
                                  isAutomating={isTabAutomating(tab)}
                                  useIconStatus={useIconStatusForTab(tab, tabs)}
                                />
                                <span className="sidebar-tab-title"><span>{tab.shortTitle || tab.title}</span></span>
                                {tab.isUseAutomationTab && ["running", "paused"].includes(tab.useStatus) && (
                                  <span className={`sidebar-tab-use-status is-${tab.useStatus}`} aria-label={tab.useStatus === "paused" ? "Use 已暂停" : "Use 正在自动操作"} />
                                )}
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
                    )}
                  </div>
                );
              }

              const tab = item.tab;
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
                    dismissCollapsedTabHover();
                    event.dataTransfer.effectAllowed = "move";
                    event.dataTransfer.setData("application/x-brizo-tab-id", tab.id);
                    setDraggedTabId(tab.id);
                  }}
                  onDragEnter={() => {
                    if (draggedGroupId) {
                      const draggedGroup = groupedTabItems.find((g) => g.type === "group" && g.groupId === draggedGroupId);
                      if (draggedGroup) {
                        moveGroupBefore(draggedGroup.tabs, tab.id);
                      }
                    } else if (draggedTabId) {
                      moveTabBefore(draggedTabId, tab.id);
                    }
                  }}
                  onDragOver={(event) => {
                    event.preventDefault();
                    event.dataTransfer.dropEffect = "move";
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    setDraggedTabId("");
                    setDraggedGroupId("");
                  }}
                  onDragEnd={() => {
                    setDraggedTabId("");
                    setDraggedGroupId("");
                  }}
                  onContextMenu={(event) => {
                    dismissCollapsedTabHover();
                    handleTabContextMenu(event, tab);
                  }}
                  onMouseEnter={(event) => {
                    if (!sidebarCollapsed) startTabTitleMarquee(event);
                  }}
                  onMouseLeave={stopTabTitleMarquee}
                >
                  <button
                    type="button"
                    className="sidebar-tab-select"
                    data-use-login-tab={tab.id}
                    role="tab"
                    aria-selected={isSelected}
                    aria-label={tab.title || tab.shortTitle || "标签页"}
                    aria-controls={collapsedTabHover?.tabId === tab.id ? COLLAPSED_TAB_HOVERCARD_ID : undefined}
                    aria-haspopup="dialog"
                    onMouseEnter={(event) => scheduleCollapsedTabHover(event, tab)}
                    onMouseLeave={scheduleCollapsedTabHoverDismiss}
                    onFocus={(event) => scheduleCollapsedTabHover(event, tab, COLLAPSED_TAB_FOCUS_DELAY_MS)}
                    onBlur={scheduleCollapsedTabHoverDismiss}
                    onClick={() => {
                      dismissCollapsedTabHover();
                      selectArticle(tab);
                    }}
                  >
                    <SiteIcon
                      id={tab.id}
                      iconKey={tab.iconKey}
                      url={tab.url}
                      faviconUrl={tab.faviconUrl}
                      isError={tab.loadError}
                      isNewTab={tab.isNewTab}
                      isPdf={tab.isPdf}
                      isAutomating={isTabAutomating(tab)}
                    useIconStatus={useIconStatusForTab(tab, tabs)}
                    />
                    <span className="sidebar-tab-title"><span>{tab.shortTitle || tab.title}</span></span>
                    {tab.isUseAutomationTab && ["running", "paused"].includes(tab.useStatus) && (
                      <span className={`sidebar-tab-use-status is-${tab.useStatus}`} aria-label={tab.useStatus === "paused" ? "Use 已暂停" : "Use 正在自动操作"} />
                    )}
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
            data-tooltip="设置"
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
            data-tooltip="恢复关闭标签"
            onClick={restoreClosedTab}
          >
            <ArrowUUpLeft size={18} weight="bold" />
          </button>

          <button
            className={`sidebar-dock-btn sidebar-dock-history-btn${sidebarHistoryOpen ? " is-active" : ""}`}
            type="button"
            aria-label="历史记录"
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
            data-tooltip="删除全部标签"
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
                              : <BookmarkFolderIcon size={15} aria-hidden="true" />}
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
          ref={browserSurfaceRef}
          style={{ "--page-background-color": pageBackgroundColor }}
        >
          <header
            className={`browser-toolbar${pageUsesLightForeground ? " uses-light-foreground" : ""}`}
            style={{ "--page-background-color": toolbarBackgroundColor }}
          >
            <div className="browser-toolbar-left">
              <IconButton
                label={sidebarCollapsed ? "展开侧边栏" : "收起侧边栏"}
                className="browser-sidebar-toggle-btn"
                onClick={() => setSidebarCollapsed((prev) => !prev)}
              >
                <SidebarSimple className="remocn-toolbar-icon" size={18} weight={sidebarCollapsed ? "fill" : "regular"} />
              </IconButton>
            </div>

            <div className="browser-toolbar-center">
              <div className="browser-nav">
                <IconButton
                  label="Back"
                  tooltip="后退"
                  disabled={useFamilyNavigationLocked || briefOpen || newTabOpen || internalLibraryPageOpen || (settingsPageOpen ? !canSettingsGoBack : (desktopMode && !navigationState.canGoBack && !canReturnToNewTab))}
                  onClick={navigateBack}
                >
                  <ArrowLeftIcon className="remocn-toolbar-icon remocn-arrow-left-icon" size={20} strokeWidth={1.9} />
                </IconButton>
                <IconButton
                  label="Forward"
                  tooltip="前进"
                  disabled={useFamilyNavigationLocked || briefOpen || newTabOpen || internalLibraryPageOpen || (settingsPageOpen ? !canSettingsGoForward : (desktopMode && !navigationState.canGoForward))}
                  onClick={navigateForward}
                >
                  <ArrowRightIcon className="remocn-toolbar-icon remocn-arrow-right-icon" size={20} strokeWidth={1.9} />
                </IconButton>
                <IconButton
                  label="Reload"
                  tooltip="重新加载"
                  disabled={useFamilyNavigationLocked || briefOpen || newTabOpen || internalLibraryPageOpen || settingsPageOpen}
                  onClick={() => desktopMode ? browserApi.reload() : showToast("Page refreshed")}
                >
                  <RefreshCwIcon className="remocn-toolbar-icon remocn-refresh-icon" size={20} strokeWidth={1.8} />
                </IconButton>
              </div>

            <form
              ref={addressBarRef}
              className={`address-bar address-load-${addressLoadPhase}${currentPageUrl && /^https?:\/\//i.test(currentPageUrl) && !newTabOpen && !internalLibraryPageOpen && !settingsPageOpen && !briefOpen ? " is-site-address" : ""}${addressFocused ? " is-editing" : ""}`}
              onSubmit={submitAddress}
            >
              {newTabOpen || internalLibraryPageOpen || settingsPageOpen || briefOpen || !(currentPageUrl && /^https?:\/\//i.test(currentPageUrl)) || addressFocused ? (
                <MagnifyingGlass className="address-search-icon" size={15} />
              ) : null}
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
                  if (briefOpen || internalLibraryPageOpen || settingsPageOpen || newTabOpen) {
                    setAddressText(addressValue.current || "");
                  }
                }}
                onPointerDown={(event) => {
                  const input = event.currentTarget;
                  addressEditing.current = true;
                  setAddressInputDirty(false);
                  setAddressFocused(true);
                  setAddressText(addressValue.current || "");
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
                role="combobox"
                aria-autocomplete="list"
                aria-expanded={addressSuggestions.length > 0}
                aria-controls={addressSuggestions.length ? "brizo-address-suggestions" : undefined}
                aria-activedescendant={addressSuggestionIndex >= 0 ? `brizo-address-option-${addressSuggestionIndex}` : undefined}
                onKeyDown={(event) => {
                  if (event.key === "ArrowDown" && addressSuggestions.length) {
                    event.preventDefault(); setAddressSuggestionIndex(index => (index + 1) % addressSuggestions.length);
                  } else if (event.key === "ArrowUp" && addressSuggestions.length) {
                    event.preventDefault(); setAddressSuggestionIndex(index => index <= 0 ? addressSuggestions.length - 1 : index - 1);
                  } else if (event.key === "Escape") {
                    event.preventDefault(); setAddressInputDirty(false); setAddressSuggestionIndex(-1);
                  }
                }}
                aria-label="Address"
                placeholder={!(currentPageUrl && /^https?:\/\//i.test(currentPageUrl)) || newTabOpen || internalLibraryPageOpen || settingsPageOpen || briefOpen ? "搜索或输入网址" : ""}
              />
              {addressInputIntent.kind === "search" && (
                <div className="address-quick-actions" aria-label="搜索方式">
                  <button
                    className="address-engine-button is-bing"
                    type="button"
                    aria-label="使用 Bing 搜索"
                    data-tooltip="Bing 搜索"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => submitAddressQuickAction("bing")}
                  >
                    <span className="address-engine-icon-stack" aria-hidden="true">
                      <img className="is-muted" src={bingSearchIconUrl} alt="" />
                      <img className="is-color" src={bingSearchColorIconUrl} alt="" />
                    </span>
                  </button>
                  <button
                    className="address-engine-button is-google"
                    type="button"
                    aria-label="使用 Google 搜索"
                    data-tooltip="Google 搜索"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => submitAddressQuickAction("google")}
                  >
                    <span className="address-engine-icon-stack" aria-hidden="true">
                      <img className="is-muted" src={googleSearchIconUrl} alt="" />
                      <img className="is-color" src={googleSearchColorIconUrl} alt="" />
                    </span>
                  </button>
                  <button
                    className="address-engine-button is-ask"
                    type="button"
                    aria-label="使用 Brizo Ask"
                    data-tooltip="Ask Brizo"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => submitAddressQuickAction("ask")}
                  >
                    <SparklesIcon size={13} strokeWidth={1.9} aria-hidden="true" />
                  </button>
                </div>
              )}
              {addressInputIntent.kind === "website" && addressSuggestions.length > 0 && (
                <button
                  className="address-go-button"
                  type="submit"
                  aria-label="确认输入"
                  data-tooltip="打开网址"
                  onMouseDown={(event) => event.preventDefault()}
                >
                  <ArrowRight size={12} weight="bold" />
                </button>
              )}
              {addressSuggestions.length > 0 && (
                <div className="address-suggestions" id="brizo-address-suggestions" role="listbox" aria-label="网站与历史联想">
                  {addressSuggestions.map((suggestion, index) => (
                    <button
                      key={`${suggestion.type}-${suggestion.value}`}
                      id={`brizo-address-option-${index}`}
                      aria-selected={addressSuggestionIndex === index}
                      type="button"
                      role="option"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => submitAddressValue(suggestion.value)}
                    >
                      {suggestion.type === "url"
                        ? <GlobeHemisphereWest size={16} />
                        : <MagnifyingGlass size={16} />}
                      {suggestion.fromMemory ? <span className="address-memory-copy"><strong>{suggestion.title}</strong><small>访问过 · {suggestion.value.replace(/^https?:\/\//i, "")}</small></span> : <span>{suggestion.type === "url"
                        ? suggestion.value.replace(/^https?:\/\//i, "")
                        : suggestion.value}</span>}
                    </button>
                  ))}
                </div>
              )}
            </form>

            <div className="browser-actions">
              {currentAgent && ["agent", "user"].includes(currentAgent.status) && <>
                <IconButton
                  label={currentAgent.status === "agent" ? "接管网页" : "交还 AI"}
                  disabled={currentAgent.status === "user" && currentAgent.busy}
                  onClick={() => browserApi.controlAgent(currentAgent.id, currentAgent.status === "agent" ? "takeover" : "resume").then(result => result.error && showToast(result.error))}
                >
                  {currentAgent.status === "agent" ? <Pause size={18} weight="regular" /> : <Play size={18} weight="regular" />}
                </IconButton>
                <IconButton label="停止连接" onClick={() => browserApi.controlAgent(currentAgent.id, "stop").then(result => result.error && showToast(result.error))}>
                  <Square size={16} weight="regular" />
                </IconButton>
              </>}
              {appPreferences.pilotAssist !== false && !briefOpen && !newTabOpen && !internalLibraryPageOpen && !settingsPageOpen && !navigationState.isPdf && (
                <IconButton
                  label="用 Brizo Pilot 阅读当前页"
                  className="pilot-action-button"
                  disabled={navigationState.isLoading || Boolean(navigationState.error) || !/^https?:\/\//i.test(currentPageUrl)}
                  onClick={openPilotForCurrentPage}
                >
                  <SparklesIcon className="remocn-toolbar-icon" size={19} strokeWidth={1.8} />
                </IconButton>
              )}
              <div
                className={`bookmark-control${bookmarkEditorOpen ? " is-open" : ""}`}
                ref={bookmarkControlRef}
              >
                <IconButton
                  label={currentBookmark ? "编辑书签" : "添加书签"}
                  className={`bookmark-action-button${currentBookmark ? " is-active" : ""}`}
                  disabled={briefOpen || newTabOpen || internalLibraryPageOpen || settingsPageOpen}
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
                    <StarIcon
                      className="remocn-toolbar-icon remocn-star-icon"
                      filled={Boolean(currentBookmark)}
                      size={19}
                      strokeWidth={1.8}
                    />
                  </span>
                </IconButton>
                {bookmarkEditorOpen && (
                  <>
                    {browserSurfaceRef.current && createPortal(
                      <button
                        className="bookmark-editor-backdrop global-menu-backdrop"
                        type="button"
                        aria-label="关闭书签菜单"
                        onPointerDown={() => {
                          setBookmarkFolderMenuOpen(false);
                          setBookmarkEditorOpen(false);
                        }}
                      />,
                      browserSurfaceRef.current,
                    )}
                    <section
                      className="bookmark-editor bookmark-toolbar-editor"
                      ref={bookmarkEditorRef}
                      role="dialog"
                      aria-modal="true"
                      aria-label="编辑收藏夹"
                    >
                      <header className="bookmark-editor-header">
                        <h2>编辑收藏夹</h2>
                        <button
                          className="bookmark-editor-close"
                          type="button"
                          aria-label="关闭收藏夹编辑器"
                          onClick={() => {
                            setBookmarkFolderMenuOpen(false);
                            setBookmarkEditorOpen(false);
                          }}
                        >
                          <X size={18} weight="regular" aria-hidden="true" />
                        </button>
                      </header>
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
                            <span className="bookmark-editor-folder-value">
                              <BookmarkFolderIcon size={16} aria-hidden="true" />
                              <span>{bookmarkDraft.folder || "书签栏"}</span>
                            </span>
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
                                        : <BookmarkFolderIcon size={15} aria-hidden="true" />}
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
                        <button
                          className="bookmark-editor-manage"
                          type="button"
                          onClick={() => {
                            setBookmarkFolderMenuOpen(false);
                            setBookmarkEditorOpen(false);
                            openBookmarkOrganizerPage();
                          }}
                        >
                          管理收藏夹
                        </button>
                        <div className="bookmark-editor-actions-primary">
                          <button className="bookmark-editor-remove" type="button" onClick={removeCurrentBookmark}>
                            删除
                          </button>
                          <button className="bookmark-editor-done" type="button" onClick={() => {
                            setBookmarkFolderMenuOpen(false);
                            setBookmarkEditorOpen(false);
                          }}>
                            <span>完成</span>
                          </button>
                        </div>
                      </footer>
                    </section>
                  </>
                )}
              </div>
              <IconButton
                label={pdfExporting ? "Creating clean article PDF" : "Export clean article PDF"}
                tooltip={pdfExporting ? "正在生成 PDF" : navigationState.isPdf ? "下载 PDF" : "导出文章 PDF"}
                className={pdfExporting ? "pdf-export-button is-exporting" : "pdf-export-button"}
                disabled={
                  briefOpen ||
                  newTabOpen ||
                  internalLibraryPageOpen ||
                  settingsPageOpen ||
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
              <div className="downloads-menu" ref={downloadsMenuRef}>
                <IconButton
                  label="Downloads"
                  tooltip="最近下载"
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
                {downloadsOpen && (
                  <>
                    {browserSurfaceRef.current && createPortal(
                      <button
                        className="downloads-menu-backdrop global-menu-backdrop"
                        type="button"
                        aria-label="关闭下载窗口"
                        onPointerDown={() => setDownloadsOpen(false)}
                      />,
                      browserSurfaceRef.current,
                    )}
                    <section
                      className="downloads-popover"
                      ref={downloadsPopoverRef}
                      role="dialog"
                      aria-label="最近下载"
                    >
                      <DownloadPanel
                        downloads={recentDownloads}
                        onAction={handleDownloadAction}
                        onOpenDirectory={openDownloadsDirectory}
                        onOpenDownloads={() => openDownloadsPage()}
                      />
                    </section>
                  </>
                )}
              </div>
            </div>
          </div>

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
                          openHistoryPage();
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
                  {["root", "preferences"].includes(settingsMenuLevel) ? <>
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
                      <span>页面缩放</span>
                      <div className="settings-zoom-controls">
                        <button type="button" aria-label="缩小" disabled={pageZoom <= 0.5} onClick={() => updatePageZoom(pageZoom - 0.1)}>
                          <Minus size={13} weight="bold" />
                        </button>
                        <button
                          className="settings-zoom-value"
                          type="button"
                          aria-label="恢复 100%"
                          onClick={() => updatePageZoom(1)}
                        >
                          {Math.round(pageZoom * 100)}%
                        </button>
                        <button type="button" aria-label="放大" disabled={pageZoom >= 2} onClick={() => updatePageZoom(pageZoom + 0.1)}>
                          <Plus size={13} weight="bold" />
                        </button>
                      </div>
                    </div>
                    <button
                      className={appPreferences.autoFitZoom ? "is-selected" : ""}
                      type="button"
                      role="menuitemcheckbox"
                      aria-checked={Boolean(appPreferences.autoFitZoom)}
                      onClick={() => {
                        const next = !appPreferences.autoFitZoom;
                        setAppPreferences((curr) => ({ ...curr, autoFitZoom: next }));
                        if (next) {
                          showToast("已开启网页横向满铺（纵向不变）");
                        } else {
                          showToast("已恢复默认网页布局");
                        }
                      }}
                    >
                      <ArrowsOut size={20} />
                      <span>网页横向满铺</span>
                      {appPreferences.autoFitZoom ? <Check size={16} weight="bold" /> : null}
                    </button>
                  </div>

                  <div className="settings-menu-group">
                    <button type="button" role="menuitem" onClick={() => openSettingsPanel("password-vault")}>
                      <Key size={20} />
                      <span>密码箱</span>
                      <CaretRight size={16} />
                    </button>
                    <button type="button" role="menuitem" onClick={() => openHistoryPage()}>
                      <ClockCounterClockwise size={20} />
                      <span>历史记录</span>
                      <CaretRight size={16} />
                    </button>
                    <button type="button" role="menuitem" onClick={() => openDownloadsPage()}>
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
                    <button type="button" role="menuitem" onClick={openSettingsPage}>
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
                {settingsMenuLevel === "preferences" && (
                  <section className="settings-menu-side-popover settings-preferences-side" role="menu" aria-label="设置">
                    <header><GearSix size={17} /><strong>设置</strong></header>
                    <div className="preferences-settings">
                      <section className="preference-section">
                        <h3><Sparkle size={14} />智能浏览</h3>
                        <label className="preference-row">
                          <span><strong>收藏夹按浏览权重排序</strong></span>
                          <input type="checkbox" checked={appPreferences.smartBookmarkSorting !== false}
                            onChange={(event) => setAppPreferences(current => ({ ...current, smartBookmarkSorting: event.target.checked }))} />
                        </label>
                        <div className="preference-row">
                          <span><strong>自动选择 Cookie</strong></span>
                          <RemocnSelect
                            value={siteHygienePreferences.cookieConsent}
                            options={COOKIE_CHOICE_OPTIONS}
                            onChange={(value) => void updateSiteHygiene({ cookieConsent: value })}
                            ariaLabel="自动选择 Cookie"
                          />
                        </div>
                        <div className="preference-row">
                          <span><strong>页面智能清理</strong></span>
                          <RemocnSelect
                            value={siteHygienePreferences.cleanupLevel}
                            options={PAGE_CLEANUP_OPTIONS}
                            onChange={(value) => void updateSiteHygiene({ cleanupLevel: value })}
                            ariaLabel="页面智能清理"
                          />
                        </div>
                        <label className="preference-row">
                          <span><strong>登录信息智能填充</strong></span>
                          <input
                            type="checkbox"
                            checked={siteHygienePreferences.credentialAutofill !== false}
                            onChange={(event) => void updateSiteHygiene({ credentialAutofill: event.target.checked })}
                          />
                        </label>
                        <label className="preference-row">
                          <span><strong>Pilot 阅读入口</strong></span>
                          <input
                            type="checkbox"
                            checked={appPreferences.pilotAssist !== false}
                            onChange={(event) => setAppPreferences((current) => ({ ...current, pilotAssist: event.target.checked }))}
                          />
                        </label>
                        {currentSiteOrigin && (
                          <label className="preference-row">
                            <span><strong>当前网站</strong><small>{new URL(currentSiteOrigin).hostname}</small></span>
                            <input
                              type="checkbox"
                              checked={siteHygienePreferences.siteOverrides?.[currentSiteOrigin]?.enabled !== false}
                              onChange={toggleSiteHygieneForCurrentSite}
                            />
                          </label>
                        )}
                      </section>

                      <section className="preference-section">
                        <h3><Brain size={14} />搜索与 AI</h3>
                        <button type="button" className="preference-destination" onClick={() => openSettingsPanel("model-guard")}>
                          <span>模型与检索服务</span><CaretRight size={14} />
                        </button>
                      </section>

                      <section className="preference-section">
                        <h3><ShieldCheck size={14} />隐私与安全</h3>
                        <button type="button" className="preference-destination" onClick={() => openSettingsPanel("password-vault")}>
                          <span>密码箱</span><CaretRight size={14} />
                        </button>
                        <button type="button" className="preference-destination" onClick={() => browserApi?.openIncognito?.()}>
                          <span>打开无痕窗口</span><CaretRight size={14} />
                        </button>
                      </section>

                      <section className="preference-section">
                        <h3><Leaf size={14} />外观与性能</h3>
                        <div className="preference-row">
                          <span><strong>语言</strong></span>
                          <RemocnSelect
                            value={appPreferences.language}
                            options={LANGUAGE_OPTIONS}
                            onChange={(val) => setAppPreferences((current) => ({ ...current, language: val }))}
                            ariaLabel="语言"
                          />
                        </div>
                        <label className="preference-row">
                          <span><strong>网页横向满铺</strong></span>
                          <input type="checkbox" checked={Boolean(appPreferences.autoFitZoom)} onChange={(event) => setAppPreferences((current) => ({ ...current, autoFitZoom: event.target.checked }))} />
                        </label>
                      </section>

                      <section className="preference-section">
                        <h3><DownloadSimple size={14} />下载与数据</h3>
                        <div className="preference-row">
                          <span><strong>下载位置</strong><small title={appPreferences.downloadLocation}>{appPreferences.downloadLocation || "系统默认"}</small></span>
                          <button type="button" onClick={chooseDownloadLocation}>选择…</button>
                        </div>
                        <button type="button" className="preference-destination" onClick={() => openHistoryPage()}><span>历史记录</span><CaretRight size={14} /></button>
                        <button type="button" className="preference-destination" onClick={openBookmarkOrganizerPage}><span>整理收藏夹</span><CaretRight size={14} /></button>
                      </section>

                      <section className="preference-section">
                        <h3><Compass size={14} />关于</h3>
                        <button type="button" className="preference-destination" onClick={() => openSettingsPanel("about")}>
                          <span>Brizo {appInfo?.version || "0.0.0"}</span><CaretRight size={14} />
                        </button>
                      </section>
                    </div>
                  </section>
                )}
              </>,
              document.body,
            )}
          </div>
          </header>

          {appPreferences.showBookmarksBar !== false && (
            <HorizontalBookmarksBar
              bookmarkTree={bookmarkTree}
              folderOrders={folderOrders}
              bookmarkRanking={bookmarkRanking}
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
              onRankGlowComplete={acknowledgeBookmarkSmartPromotion}
            />
          )}

        <div
          className={`web-content-host brief-host${briefOpen ? " is-active" : ""}`}
          aria-hidden={!briefOpen}
        >
          <div className="page-zoom-layer" style={{ height: `${100 / pageZoom}%`, width: `${100 / pageZoom}%`, zoom: pageZoom }}>
            <Suspense fallback={<div className="brief-loading-state"><strong>正在打开 Brizo Brief</strong></div>}>
              <LazyBriefPage
                active={briefOpen}
                edition={briefEdition}
                loading={briefLoading}
                onClose={() => setActiveSurface("tab")}
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
            </Suspense>
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
                initialContextTab={tab.initialContextTab || null}
                initialPrompt={tab.initialPrompt || ""}
                initialUseCommand={tab.initialUseCommand || ""}
                onNotify={showToast}
                tabs={tabs}
                onOpenSource={openNewTabSource}
                onRestoreHistory={restoreSearchHistoryTab}
                onRestorePreviousSession={previousSessionAvailable ? restorePreviousSession : undefined}
                onSearchComplete={saveCompletedSearch}
                onSubmit={submitNewTabPrompt}
                onUseProgress={handleUseProgress}
                onUseSubmit={submitNewTabUse}
                prefillPrompt={tab.prefillPrompt || ""}
                restoredResult={tab.restoredResult || null}
                useTodayGreeting={Boolean(tab.useTodayGreeting)}
              />
            </div>
          </div>
        ))}

        {bookmarksPageOpen && (
          <div
            className="web-content-host brizo-settings-host brizo-library-host is-active"
            ref={webContentHost}
          >
            <div className="page-zoom-layer" style={{ height: `${100 / pageZoom}%`, width: `${100 / pageZoom}%`, zoom: pageZoom }}>
              <LibraryPageFrame
                className="brizo-bookmarks-page is-wide"
                title="收藏夹"
                titleIcon={<img src={brizoLogoUrl} alt="" aria-hidden="true" />}
                query={bookmarkManageQuery}
                onQueryChange={(value) => {
                  setBookmarkManageQuery(value);
                  setBookmarkManageSelection(new Set());
                }}
                searchLabel="搜索收藏夹"
                navigation={(
                  <BookmarkManagerTree
                    bookmarks={bookmarkLibrary}
                    expanded={bookmarkManageExpanded}
                    folder={bookmarkManageFolder}
                    folders={bookmarkManageFolders}
                    onDragEnd={() => setBookmarkManageDragItem(null)}
                    onDragStart={(path) => setBookmarkManageDragItem({ type: "folder", path })}
                    onDrop={(path) => dropManagedItem({ type: "folder", path })}
                    onSelect={selectManagedBookmarkFolder}
                    onToggle={(path) => setBookmarkManageExpanded((current) => {
                      const next = new Set(current);
                      if (next.has(path)) next.delete(path);
                      else next.add(path);
                      return next;
                    })}
                  />
                )}
              >
                <section className="brizo-settings-section brizo-library-section" aria-label={bookmarkManageFolder || "书签栏"}>
                  <div className="brizo-library-section-heading">
                    <div>
                      <h2>{bookmarkManageQuery ? "搜索结果" : folderNameFromPath(bookmarkManageFolder) || "书签栏"}</h2>
                      <p>{bookmarkManageQuery
                        ? `找到 ${managedBookmarks.length} 个收藏`
                        : `${bookmarkManageChildFolders.length + managedBookmarks.length} 个项目`}</p>
                    </div>
                    {bookmarkManageSelection.size > 0 && (
                      <div className="brizo-library-actions" aria-label="所选收藏操作">
                        <span>已选 {bookmarkManageSelection.size}</span>
                        <button type="button" onClick={() => copyManagedBookmarks([...bookmarkManageSelection])}>
                          <CopySimple size={14} />复制
                        </button>
                        <button type="button" onClick={() => removeManagedBookmarks([...bookmarkManageSelection])}>
                          <Trash size={14} />删除
                        </button>
                      </div>
                    )}
                  </div>

                  {bookmarkManageDraft && (
                    <div className="brizo-settings-card brizo-bookmark-editor">
                      <label>
                        <span>名称</span>
                        <input aria-label="名称" value={bookmarkManageDraft.title} onChange={(event) => setBookmarkManageDraft((draft) => ({ ...draft, title: event.target.value }))} />
                      </label>
                      <label>
                        <span>网址</span>
                        <input aria-label="网址" value={bookmarkManageDraft.url} onChange={(event) => setBookmarkManageDraft((draft) => ({ ...draft, url: event.target.value }))} />
                      </label>
                      <div className="brizo-library-actions">
                        <button type="button" onClick={() => setBookmarkManageDraft(null)}>取消</button>
                        <button className="is-primary" type="button" onClick={saveManagedBookmark}>保存</button>
                      </div>
                    </div>
                  )}

                  {(bookmarkManageChildFolders.length > 0 || managedBookmarks.length > 0) ? (
                    <div className="brizo-settings-card bookmark-manage-list brizo-library-card">
                      {bookmarkManageChildFolders.map((path) => (
                        <div
                          className="bookmark-manage-row brizo-library-row is-folder"
                          key={path}
                          draggable
                          onDragStart={(event) => {
                            setBookmarkManageDragItem({ type: "folder", path });
                            event.dataTransfer.effectAllowed = "move";
                          }}
                          onDragEnd={() => setBookmarkManageDragItem(null)}
                          onDragOver={(event) => {
                            event.preventDefault();
                            event.dataTransfer.dropEffect = "move";
                          }}
                          onDrop={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            dropManagedItem({ type: "folder", path, position: "before" });
                          }}
                        >
                          <button className="bookmark-manage-main" type="button" onClick={() => selectManagedBookmarkFolder(path)}>
                            <BookmarkFolderIcon size={18} aria-hidden="true" />
                            <span><strong>{folderNameFromPath(path)}</strong><small>文件夹</small></span>
                          </button>
                          <button className="brizo-library-row-action" type="button" aria-label={`打开 ${folderNameFromPath(path)}`} onClick={() => selectManagedBookmarkFolder(path)}>
                            <CaretRight size={15} />
                          </button>
                        </div>
                      ))}
                      {managedBookmarks.map((bookmark) => {
                        const selected = bookmarkManageSelection.has(bookmark.url);
                        return (
                          <div
                            className={`bookmark-manage-row brizo-library-row${selected ? " is-selected" : ""}`}
                            key={bookmark.url}
                            draggable
                            onDragStart={(event) => {
                              setBookmarkManageDragItem({ type: "bookmark", url: bookmark.url });
                              event.dataTransfer.effectAllowed = "move";
                            }}
                            onDragEnd={() => setBookmarkManageDragItem(null)}
                            onDragOver={(event) => {
                              event.preventDefault();
                              event.dataTransfer.dropEffect = "move";
                            }}
                            onDrop={(event) => {
                              event.preventDefault();
                              dropManagedItem({ type: "bookmark", url: bookmark.url, folder: bookmark.folder });
                            }}
                            onContextMenu={(event) => {
                              event.preventDefault();
                              if (!selected) setBookmarkManageSelection(new Set([bookmark.url]));
                              setBookmarkManageContext({
                                x: event.clientX,
                                y: event.clientY,
                                urls: selected ? [...bookmarkManageSelection] : [bookmark.url],
                              });
                            }}
                          >
                            <button
                              className="bookmark-organizer-check"
                              type="button"
                              role="checkbox"
                              aria-checked={selected}
                              aria-label={`选择 ${bookmark.title}`}
                              onClick={() => setBookmarkManageSelection((current) => {
                                const next = new Set(current);
                                if (next.has(bookmark.url)) next.delete(bookmark.url);
                                else next.add(bookmark.url);
                                return next;
                              })}
                            >
                              {selected ? <CheckSquare size={15} weight="fill" /> : <Square size={15} />}
                            </button>
                            <button className="bookmark-manage-main" type="button" title="双击打开" onDoubleClick={() => openBookmark(bookmark)}>
                              <BookmarkFavicon bookmark={bookmark} />
                              <span><strong>{bookmark.title}</strong><small>{bookmark.url}</small></span>
                            </button>
                            <button className="brizo-library-row-action" type="button" aria-label={`打开 ${bookmark.title}`} onClick={() => openBookmark(bookmark)}>
                              <ArrowSquareOut size={15} />
                            </button>
                            <button className="bookmark-organizer-edit brizo-library-row-action" type="button" aria-label={`编辑 ${bookmark.title}`} onClick={() => setBookmarkManageDraft({ originalUrl: bookmark.url, url: bookmark.url, title: bookmark.title, folder: bookmark.folder || "" })}>
                              <PencilSimple size={15} />
                            </button>
                            <button className="brizo-library-row-action" type="button" aria-label={`更多 ${bookmark.title}`} onClick={(event) => setBookmarkManageContext({ x: event.clientX, y: event.clientY, urls: selected ? [...bookmarkManageSelection] : [bookmark.url] })}>
                              <DotsThreeVertical size={17} weight="bold" />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="brizo-library-empty">
                      <BookmarkSimple size={25} />
                      <strong>{bookmarkManageQuery ? "没有匹配的收藏" : "此文件夹为空"}</strong>
                      <span>{bookmarkManageQuery ? "换一个关键词试试" : "从地址栏添加收藏后会显示在这里"}</span>
                    </div>
                  )}
                </section>
              </LibraryPageFrame>
            </div>
            {bookmarkManageContext && (
              <>
                <button className="bookmark-organizer-context-backdrop" type="button" aria-label="关闭菜单" onClick={() => setBookmarkManageContext(null)} />
                <div className="bookmark-organizer-context" role="menu" style={{ left: Math.min(bookmarkManageContext.x, window.innerWidth - 150), top: Math.min(bookmarkManageContext.y, window.innerHeight - 90) }}>
                  <button type="button" role="menuitem" onClick={() => copyManagedBookmarks(bookmarkManageContext.urls)}><CopySimple size={15} />复制</button>
                  <button type="button" role="menuitem" onClick={() => removeManagedBookmarks(bookmarkManageContext.urls)}><Trash size={15} />删除</button>
                </div>
              </>
            )}
          </div>
        )}

        {historyPageOpen && (
          <div
            className="web-content-host brizo-settings-host brizo-library-host is-active"
            ref={webContentHost}
          >
            <div className="page-zoom-layer" style={{ height: `${100 / pageZoom}%`, width: `${100 / pageZoom}%`, zoom: pageZoom }}>
              <LibraryPageFrame
                className="brizo-history-page"
                title="历史记录"
                titleIcon={<img src={brizoLogoUrl} alt="" aria-hidden="true" />}
                query={historyPageQuery}
                onQueryChange={setHistoryPageQuery}
                searchLabel="搜索历史记录"
                navigation={(
                  <>
                    <div className="brizo-settings-nav-item">
                      <button className={historyPageSection === "browser" ? "is-active" : ""} type="button" onClick={() => openHistoryPage("browser")}>
                        <GlobeHemisphereWest size={17} weight={historyPageSection === "browser" ? "bold" : "regular"} />
                        <span>浏览记录</span>
                        <small>{browserHistory.length}</small>
                      </button>
                    </div>
                    <div className="brizo-settings-nav-item">
                      <button className={historyPageSection === "search" ? "is-active" : ""} type="button" onClick={() => openHistoryPage("search")}>
                        <MagnifyingGlass size={17} weight={historyPageSection === "search" ? "bold" : "regular"} />
                        <span>搜索记录</span>
                        <small>{searchHistory.length}</small>
                      </button>
                    </div>
                    <div className="brizo-settings-nav-item">
                      <button type="button" onClick={() => openSettingsPage("memory")}>
                        <DownloadSimple size={17} /><span>导入记录与画像</span>
                      </button>
                    </div>
                  </>
                )}
              >
                {(() => {
                  const isBrowserHistory = historyPageSection === "browser";
                  const visibleItems = isBrowserHistory ? filteredBrowserHistory : filteredSearchHistory;
                  const totalItems = isBrowserHistory ? browserHistory : searchHistory;
                  return (
                    <section className="brizo-settings-section brizo-library-section">
                      <div className="brizo-library-section-heading">
                        <div>
                          <h2>{isBrowserHistory ? "浏览记录" : "搜索记录"}</h2>
                          <p>{historyPageQuery.trim()
                            ? `找到 ${visibleItems.length} 条记录`
                            : `${totalItems.length} 条记录`}</p>
                        </div>
                        {totalItems.length > 0 && (
                          <div className="brizo-library-actions">
                            <button type="button" onClick={() => {
                              if (isBrowserHistory) {
                                setBrowserHistory([]);
                                localStorage.removeItem("bean:browser-history");
                                showToast("已清空浏览记录");
                              } else {
                                setSearchHistory([]);
                                localStorage.removeItem("bean:search-history");
                                showToast("已清空搜索记录");
                              }
                            }}>
                              <Trash size={14} />清除全部
                            </button>
                          </div>
                        )}
                      </div>

                      {visibleItems.length > 0 ? (
                        <div className="brizo-settings-card brizo-library-card brizo-history-list">
                          {visibleItems.map((item) => isBrowserHistory ? (
                            <div className="brizo-history-row" key={`${item.url}-${item.updatedAt || ""}`}>
                              <button className="brizo-history-main" type="button" onClick={() => openHistoryItemInTab(item)}>
                                <BookmarkFavicon bookmark={item} />
                                <span><strong>{item.title || item.url}</strong><small>{item.url}</small></span>
                              </button>
                              <time>{formatHistoryTime(item.updatedAt)}</time>
                              <button className="brizo-library-row-action" type="button" aria-label={`删除 ${item.title || item.url}`} onClick={() => removeBrowserHistoryItem(item.url)}>
                                <Trash size={14} />
                              </button>
                            </div>
                          ) : (
                            <div className="brizo-history-row" key={`${item.query}-${item.updatedAt || ""}`}>
                              <button className="brizo-history-main" type="button" onClick={() => openSearchHistoryItem(item)}>
                                <span className="brizo-history-search-icon"><MagnifyingGlass size={15} /></span>
                                <span><strong>{item.query}</strong><small>{item.result ? "已保存完整结果" : "仅保留搜索词"}</small></span>
                              </button>
                              <time>{formatHistoryTime(item.updatedAt)}</time>
                              <button className="brizo-library-row-action" type="button" aria-label={`删除 ${item.query}`} onClick={() => removeSearchHistoryItem(item.query)}>
                                <Trash size={14} />
                              </button>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="brizo-library-empty">
                          {isBrowserHistory ? <ClockCounterClockwise size={25} /> : <MagnifyingGlass size={25} />}
                          <strong>{historyPageQuery.trim() ? "没有匹配的记录" : isBrowserHistory ? "暂无浏览记录" : "暂无搜索记录"}</strong>
                          <span>{historyPageQuery.trim() ? "换一个关键词试试" : "新的记录会自动保存在这里"}</span>
                        </div>
                      )}
                    </section>
                  );
                })()}
              </LibraryPageFrame>
            </div>
          </div>
        )}

        {downloadsPageOpen && (
          <div
            className="web-content-host brizo-settings-host brizo-library-host is-active"
            ref={webContentHost}
          >
            <div className="page-zoom-layer" style={{ height: `${100 / pageZoom}%`, width: `${100 / pageZoom}%`, zoom: pageZoom }}>
              <LibraryPageFrame
                className="brizo-downloads-page"
                title="下载内容"
                titleIcon={<img src={brizoLogoUrl} alt="" aria-hidden="true" />}
                query={downloadPageQuery}
                onQueryChange={setDownloadPageQuery}
                searchLabel="搜索下载文件"
                navigation={DOWNLOAD_PAGE_SECTIONS.map((section) => {
                  const isActive = downloadPageSection === section.id;
                  const SectionIcon = section.id === "active"
                    ? DownloadSimple
                    : section.id === "completed"
                      ? CheckCircle
                      : section.id === "unavailable"
                        ? X
                        : ListBullets;
                  return (
                    <div className="brizo-settings-nav-item" key={section.id}>
                      <button className={isActive ? "is-active" : ""} type="button" onClick={() => openDownloadsPage(section.id)}>
                        <SectionIcon size={17} weight={isActive ? "bold" : "regular"} />
                        <span>{section.label}</span>
                        <small>{downloadPageCounts[section.id]}</small>
                      </button>
                    </div>
                  );
                })}
              >
                <section className="brizo-settings-section brizo-library-section" aria-label="下载文件">
                  <div className="brizo-library-section-heading">
                    <div>
                      <h2>{downloadPageSection === "all"
                        ? "全部下载"
                        : DOWNLOAD_PAGE_SECTIONS.find((section) => section.id === downloadPageSection)?.label}</h2>
                      <p>{downloadPageQuery.trim()
                        ? `找到 ${visibleDownloadGroups.count} 个文件`
                        : `${visibleDownloadGroups.count} 个文件`}</p>
                    </div>
                    <div className="brizo-library-actions">
                      <button type="button" onClick={openDownloadsDirectory}>
                        <FolderOpen size={14} />打开下载目录
                      </button>
                    </div>
                  </div>

                  {visibleDownloadGroups.groups.length > 0 ? (
                    <div className="brizo-download-groups">
                      {visibleDownloadGroups.groups.map((group) => (
                        <section className="brizo-download-group" key={group.key} aria-label={group.label}>
                          <h3>{group.label}</h3>
                          <div className="brizo-settings-card brizo-library-card brizo-download-list">
                            {group.downloads.map((download) => {
                              const isActive = isActiveDownload(download);
                              const isCompleted = isCompletedDownload(download);
                              return (
                                <div
                                  className={`brizo-download-row${download.isMissing ? " is-missing" : ""}${isUnavailableDownload(download) ? " is-unavailable" : ""}`}
                                  key={download.id}
                                >
                                  <span className="brizo-download-file-icon" aria-hidden="true">
                                    {download.thumbnailDataUrl && !download.isMissing
                                      ? <img src={download.thumbnailDataUrl} alt="" />
                                      : <AttachedIcon src={downloadIconUrl} size={19} />}
                                  </span>
                                  <span className="brizo-download-copy">
                                    <strong title={download.filename}>{download.filename}</strong>
                                    <small>
                                      <span>{downloadStatusLabel(download)}</span>
                                      {formatHistoryTime(download.createdAt) && <><span aria-hidden="true">·</span><time>{formatHistoryTime(download.createdAt)}</time></>}
                                    </small>
                                  </span>
                                  <span className="brizo-download-actions" aria-label={`${download.filename} 操作`}>
                                    {isActive && (
                                      <button
                                        type="button"
                                        aria-label={download.state === "paused" ? `继续下载 ${download.filename}` : `暂停下载 ${download.filename}`}
                                        title={download.state === "paused" ? "继续" : "暂停"}
                                        onClick={() => handleDownloadAction(download.state === "paused" ? "resume" : "pause", download)}
                                      >
                                        {download.state === "paused" ? <Play size={15} weight="fill" /> : <Pause size={15} weight="fill" />}
                                      </button>
                                    )}
                                    {isCompleted && (
                                      <button type="button" aria-label={`打开 ${download.filename}`} title="打开文件" onClick={() => handleDownloadAction("open", download)}>
                                        <ArrowSquareOut size={15} />
                                      </button>
                                    )}
                                    <button
                                      type="button"
                                      aria-label={`打开 ${download.filename} 所在目录`}
                                      title={download.isMissing ? "打开原所在目录" : "打开所在目录"}
                                      onClick={() => handleDownloadAction("reveal", download)}
                                    >
                                      <FolderOpen size={15} />
                                    </button>
                                    {isActive ? (
                                      <button type="button" aria-label={`取消下载 ${download.filename}`} title="取消下载" onClick={() => handleDownloadAction("cancel", download)}>
                                        <X size={15} />
                                      </button>
                                    ) : (
                                      <button type="button" aria-label={`删除 ${download.filename}`} title="删除" onClick={() => handleDownloadAction("delete", download)}>
                                        <Trash size={15} />
                                      </button>
                                    )}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </section>
                      ))}
                    </div>
                  ) : (
                    <div className="brizo-library-empty">
                      <DownloadSimple size={25} />
                      <strong>{downloadPageQuery.trim()
                        ? "没有匹配的文件"
                        : downloadPageSection === "active"
                          ? "没有进行中的下载"
                          : downloadPageSection === "completed"
                            ? "暂无已完成文件"
                            : downloadPageSection === "unavailable"
                              ? "没有不可用文件"
                              : "暂无下载文件"}</strong>
                      <span>{downloadPageQuery.trim()
                        ? "换一个文件名试试"
                        : downloadPageSection === "active"
                          ? "新下载会在这里显示进度"
                          : downloadPageSection === "completed"
                            ? "完成的下载会保留在这里"
                            : downloadPageSection === "unavailable"
                              ? "移动或删除的文件会显示在这里"
                              : "下载的文件会显示在这里"}</span>
                    </div>
                  )}
                </section>
              </LibraryPageFrame>
            </div>
          </div>
        )}

        {settingsPageOpen && (
          <div
            className="web-content-host brizo-settings-host is-active"
            ref={webContentHost}
          >
            <div className="page-zoom-layer" style={{ height: `${100 / pageZoom}%`, width: `${100 / pageZoom}%`, zoom: pageZoom }}>
              <SettingsPage
                activeSection={settingsPageSection}
                onSectionChange={updateSettingsRoute}
                state={{
                  accountProfile,
                  analysisProvider,
                  appInfo,
                  appPreferences,
                  downloadCount: downloads.length,
                  pageZoom,
                  passwordCount: passwordEntries.length,
                  searchService: bochaSearchService,
                  settingsQuery,
                  siteHygienePreferences,
                }}
                actions={{
                  chooseDownloadLocation,
                  openAccount: () => {
                    setAccountDraft(accountProfile);
                    setSettingsPanel("account");
                  },
                  openBookmarkImport: () => setSettingsPanel("bookmark-import"),
                  openBookmarkOrganizer: openBookmarkOrganizerPage,
                  openMemoryUrl: (url) => openHistoryItemInTab({ url, title: url }),
                  openDownloads: () => openDownloadsPage(),
                  openHistory: () => openHistoryPage(),
                  openIncognito: async () => {
                    const opened = await browserApi?.openIncognito?.();
                    showToast(opened ? "已打开无痕窗口" : "无痕窗口仅在桌面版可用");
                  },
                  openPasswordVault: () => setSettingsPanel("password-vault"),
                  resetSettings: resetBrizoSettings,
                  saveAnalysisKey: saveAnalysisApiKey,
                  saveSearchKey: saveSearchApiKey,
                  updateAppPreferences: (changes) => setAppPreferences((current) => ({ ...current, ...changes })),
                  updatePageZoom,
                  updateSettingsQuery: setSettingsQuery,
                  updateSiteHygiene: (changes) => void updateSiteHygiene(changes),
                }}
              />
            </div>
          </div>
        )}

          {!briefOpen && !newTabOpen && !internalLibraryPageOpen && !settingsPageOpen && (desktopMode ? (
          <div
            className={`web-content-host${useAutomationOpen ? " brizo-use-child-host" : ""}`}
            ref={webContentHost}
          >
            {useAutomationOpen && !currentArticle?.useSandboxReady && !currentArticle?.useViewMissing && (
              <div className="brizo-use-child-loading" aria-label="正在创建下级自动操作标签" aria-live="polite" role="status">
                <Sparkle size={18} weight="fill" aria-hidden="true" />
                <span>正在打开隔离网页</span>
              </div>
            )}
            {useAutomationOpen && currentArticle?.useViewMissing && (
              <div className="browser-error-page" aria-label="Use 操作页面已不可用" aria-live="polite" role="status">
                <div className="browser-error-content">
                  <img src={brizoLogoUrl} alt="Brizo" />
                  <h1>Use 页面已停止</h1>
                  <p>隔离网页进程已关闭，无法恢复这一临时页面。</p>
                  <p lang="en">The isolated Use page is no longer available.</p>
                </div>
              </div>
            )}
            {browserPreview && (
              <div
                className="web-content-preview browser-preview"
                style={{ backgroundImage: `url(${browserPreview})` }}
                aria-hidden="true"
              />
            )}
            {(!useAutomationOpen || currentArticle?.useSandboxReady) && !navigationState.isContentReady && navigationState.navigationPreview && (
              <div
                className="web-content-preview navigation-preview"
                style={{ backgroundImage: `url(${navigationState.navigationPreview})` }}
                aria-hidden="true"
              />
            )}
            {(!useAutomationOpen || currentArticle?.useSandboxReady) && navigationState.error && (
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

      </section>

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
            <div className="preference-row">
              <span><strong>语言</strong></span>
              <RemocnSelect
                value={appPreferences.language}
                options={LANGUAGE_OPTIONS}
                onChange={(val) => setAppPreferences((current) => ({ ...current, language: val }))}
                ariaLabel="语言"
              />
            </div>
            <div className="preference-row">
              <span><strong>下载位置</strong><small title={appPreferences.downloadLocation}>{appPreferences.downloadLocation || "系统默认下载文件夹"}</small></span>
              <button type="button" onClick={chooseDownloadLocation}>选择…</button>
            </div>
            <label className="preference-row">
              <span><strong>Pilot 阅读入口</strong><small>仅在点击后读取当前页</small></span>
              <input
                type="checkbox"
                checked={appPreferences.pilotAssist !== false}
                onChange={(event) => setAppPreferences((current) => ({ ...current, pilotAssist: event.target.checked }))}
              />
            </label>
            <label className="preference-row">
              <span><strong>网页横向满铺</strong><small>纵向尺寸不变，网页横向从左到右铺满</small></span>
              <input
                type="checkbox"
                checked={Boolean(appPreferences.autoFitZoom)}
                onChange={(event) => {
                  const next = event.target.checked;
                  setAppPreferences((current) => ({ ...current, autoFitZoom: next }));
                  if (next) {
                    showToast("已开启网页横向满铺（纵向不变）");
                  } else {
                    showToast("已恢复默认网页布局");
                  }
                }}
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
              <div><dt>Updates</dt><dd>Manual signed release</dd></div>
            </dl>
            <p>
              Private windows use an isolated in-memory browser session. Bookmark imports and
              screenshots stay on this Mac unless you choose to move them. Automatic updates are
              not advertised until a signed release feed is configured.
            </p>
          </div>
        </SettingsDialog>
      )}

      {toast && <div className="toast" role="status">{toast}</div>}

      {viewportTooltip && createPortal(
        <div
          className={`viewport-tooltip soft-blur-in-skip is-${viewportTooltip.placement}${viewportTooltip.positioned ? " is-positioned" : ""}`}
          ref={viewportTooltipRef}
          role="tooltip"
          style={{
            left: `${viewportTooltip.left}px`,
            top: `${viewportTooltip.top}px`,
          }}
        >
          {viewportTooltip.text}
        </div>,
        document.body,
      )}

      {collapsedTabHover && createPortal(
        <div
          className="collapsed-tab-hovercard"
          id={COLLAPSED_TAB_HOVERCARD_ID}
          role="dialog"
          aria-label={`${collapsedTabHover.title} 标签页操作`}
          style={{
            left: `${collapsedTabHover.left}px`,
            top: `${collapsedTabHover.top}px`,
            width: `${collapsedTabHover.width}px`,
          }}
          onMouseEnter={clearCollapsedTabHoverTimer}
          onMouseLeave={scheduleCollapsedTabHoverDismiss}
          onFocus={clearCollapsedTabHoverTimer}
          onBlur={scheduleCollapsedTabHoverDismiss}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <div className="collapsed-tab-hovercard-copy">
            <strong>{collapsedTabHover.title}</strong>
            {collapsedTabHover.address && <span dir="ltr">{collapsedTabHover.address}</span>}
          </div>
          <div className="collapsed-tab-hovercard-actions" role="toolbar" aria-label="标签页操作">
            <button
              type="button"
              className={collapsedTabHover.isPinned ? "is-active" : undefined}
              aria-label={collapsedTabHover.isPinned ? "取消置顶" : "置顶"}
              data-tooltip={collapsedTabHover.isPinned ? "取消置顶" : "置顶"}
              disabled={collapsedTabHover.isUseAutomationTab}
              onClick={() => {
                const tabId = collapsedTabHover.tabId;
                dismissCollapsedTabHover();
                toggleTabPinned(tabId);
              }}
            >
              <PushPin size={17} weight={collapsedTabHover.isPinned ? "fill" : "regular"} />
            </button>
            <button
              type="button"
              aria-label="在新窗口显示"
              data-tooltip="在新窗口显示"
              disabled={!collapsedTabHover.canOpenWindow}
              onClick={openHoveredTabInWindow}
            >
              <ArrowSquareOut size={17} weight="regular" />
            </button>
            <button
              type="button"
              className={collapsedTabHoverIsBookmarked ? "is-active" : undefined}
              aria-label={collapsedTabHoverIsBookmarked ? "移出收藏" : "加入收藏"}
              data-tooltip={collapsedTabHoverIsBookmarked ? "移出收藏" : "加入收藏"}
              disabled={!collapsedTabHover.canOpenWindow}
              onClick={toggleHoveredTabBookmark}
            >
              <BookmarkSimple size={17} weight={collapsedTabHoverIsBookmarked ? "fill" : "regular"} />
            </button>
            <button
              type="button"
              className="is-destructive"
              aria-label="删除标签页"
              data-tooltip="删除标签页"
              disabled={tabs.length === 1}
              onClick={() => {
                const tabId = collapsedTabHover.tabId;
                dismissCollapsedTabHover();
                closeTab(tabId);
              }}
            >
              <Trash size={17} weight="regular" />
            </button>
          </div>
        </div>,
        document.body,
      )}

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
