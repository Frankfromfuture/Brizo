import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowSquareOut,
  ArrowsClockwise,
  Check,
  Clock,
  ShieldCheck,
  Sparkle,
  X,
} from "@phosphor-icons/react";
import { getDefaultBookmarkFaviconUrl } from "../shared/bookmark-folders.mjs";

const GOOGLE_NEWS_PREVIEW_STORIES = [
  {
    id: "gnews-tech-apple-ios",
    section: "TECHNOLOGY",
    sourceName: "MacRumors",
    domain: "macrumors.com",
    headline: "苹果推送 iOS 与 iPadOS 开发者测试版：系统底层优化与锁屏新交互",
    originalTitle: "Apple Seeds Sixth iOS and iPadOS Betas to Developers",
    summary: "苹果今日面向全球注册开发者推送了最新系统测试版本，重点优化了锁屏实时活动通知、电量管理算法以及系统级隐私沙箱隔离机制。",
    imageUrl: "https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=1200&q=82",
    publishedAt: new Date(Date.now() - 12 * 60_000).toISOString(),
    url: "https://news.google.com/rss/headlines/section/topic/TECHNOLOGY?hl=en-US&gl=US&ceid=US:en",
    keyPoints: [
      "新版本大幅增强了锁屏状态下的实时活动控件与多媒体控制交互。",
      "针对前沿机型的芯片能效调度策略进行了底层固件优化。",
      "开发者可通过苹果开发者门户或系统内置通道进行空中升级（OTA）。",
    ],
  },
  {
    id: "gnews-biz-meta-antitrust",
    section: "BUSINESS",
    sourceName: "Bloomberg",
    domain: "bloomberg.com",
    headline: "Meta 面临万亿美元级反垄断世纪审判：社交生态格局或迎变局",
    originalTitle: "Meta Stares Down Trillion-Dollar Threat as Landmark Social Media Trial Begins",
    summary: "彭博社报道：美国联邦监管机构针对 Meta 历史并购案的反垄断诉讼正式开庭审理。司法部与各州总检察长聚焦于跨平台网络效应与潜在拆分风险。",
    imageUrl: "https://images.unsplash.com/photo-1590283603385-17ffb3a7f29f?auto=format&fit=crop&w=1200&q=82",
    publishedAt: new Date(Date.now() - 28 * 60_000).toISOString(),
    url: "https://news.google.com/rss/headlines/section/topic/BUSINESS?hl=en-US&gl=US&ceid=US:en",
    keyPoints: [
      "审判焦点集中于 Instagram 与 WhatsApp 历史收购案对市场竞争格局的长期影响。",
      "华尔街投行正在评估诉讼进展对大型科技巨头估值与未来并购通道的连锁效应。",
      "Meta 法律团队强调其在开源人工智能和跨平台通信领域的巨额投资与创新贡献。",
    ],
  },
  {
    id: "gnews-world-diplomacy",
    section: "WORLD",
    sourceName: "AP News",
    domain: "apnews.com",
    headline: "联合国安理会召开中东地缘安全紧急磋商：多方呼吁保障人道走廊",
    originalTitle: "UN Security Council Holds Emergency Talks on Middle East Security and Humanitarian Aid",
    summary: "美联社发自纽约联合国总部：围绕热点地区局势发展，安理会召开闭门紧急磋商。多国代表呼吁各方保持最大限度克制，尽快恢复陆路与海运关键物流通道。",
    imageUrl: "https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=1200&q=82",
    publishedAt: new Date(Date.now() - 45 * 60_000).toISOString(),
    url: "https://news.google.com/rss/headlines/section/topic/WORLD?hl=en-US&gl=US&ceid=US:en",
    keyPoints: [
      "国际救援组织在会中通报了前线物资调拨与医疗救护设施运行的最新评估。",
      "各方就建立更为透明的停火监督机制与人道走廊安全保障方案展开深入磋商。",
      "联合国秘书长呼吁国际社会加大对冲突地区流离失所人员的专项资金支持。",
    ],
  },
  {
    id: "gnews-science-space",
    section: "SCIENCE",
    sourceName: "Nature",
    domain: "nature.com",
    headline: "国际射电天文学团队捕获百亿光年外超大质量黑洞喷流偏振光谱",
    originalTitle: "Astronomers Detect Polarized Emission Jet from Supermassive Black Hole",
    summary: "由全球多国天文台联合组成的射电望远镜阵列成功观测到遥远活跃星系核的高能等离子体喷流精细磁场结构，为广义相对论极端引力场理论提供了关键验证数据。",
    imageUrl: "https://images.unsplash.com/photo-1451187580459-43490279c0fa?auto=format&fit=crop&w=1200&q=82",
    publishedAt: new Date(Date.now() - 65 * 60_000).toISOString(),
    url: "https://news.google.com/rss/headlines/section/topic/SCIENCE?hl=en-US&gl=US&ceid=US:en",
    keyPoints: [
      "观测分辨率达到前所未有的微角秒级别，直接解析了事件视界边缘的螺旋磁力线。",
      "研究证实强磁场在黑洞吸积盘能量提取与超相对论喷流加速中发挥决定性作用。",
      "新研究成果已在国际顶级权威学术期刊《自然》以封面文章形式正式发表。",
    ],
  },
  {
    id: "gnews-health-vaccines",
    section: "HEALTH",
    sourceName: "The Washington Post",
    domain: "washingtonpost.com",
    headline: "公共卫生机构发布儿童免疫规划评估：新型长效抗体保护效果显著",
    originalTitle: "Public Health Officials Report Strong Efficacy for Next-Generation Pediatric Antibodies",
    summary: "华盛顿邮报报道：国际公共卫生联合研究团队公布了大规模追踪数据，新一代单克隆抗体在预防婴幼儿呼吸道合胞病毒（RSV）重症住院方面展现出高达 80% 的防护有效率。",
    imageUrl: "https://images.unsplash.com/photo-1505751172876-fa1923c5c528?auto=format&fit=crop&w=1200&q=82",
    publishedAt: new Date(Date.now() - 95 * 60_000).toISOString(),
    url: "https://news.google.com/rss/headlines/section/topic/HEALTH?hl=en-US&gl=US&ceid=US:en",
    keyPoints: [
      "单剂注射即可为整个流行季提供持久稳定的中和抗体保护屏障。",
      "儿科专家建议将该项预防手段纳入常规新生儿健康体检与公共医保覆盖范畴。",
      "多国药品监管部门正在加快同类靶点生物制剂的审评审批通道。",
    ],
  },
  {
    id: "gnews-sports-championship",
    section: "SPORTS",
    sourceName: "ESPN",
    domain: "espn.com",
    headline: "全球顶级足球联赛季前热身与转会窗口动态：各路豪门加速阵容重组",
    originalTitle: "European Football Transfer Window Highlights: Major Clubs Finalize Rosters",
    summary: "ESPN 深度报道：随着新赛季临近，欧洲五大联赛各大俱乐部正密集展开阵容磨合与关键位置引援。多名超级巨星的转会交易进入最后签约倒计时。",
    imageUrl: "https://images.unsplash.com/photo-1461896836934-ffe607ba8211?auto=format&fit=crop&w=1200&q=82",
    publishedAt: new Date(Date.now() - 130 * 60_000).toISOString(),
    url: "https://news.google.com/rss/headlines/section/topic/SPORTS?hl=en-US&gl=US&ceid=US:en",
    keyPoints: [
      "中场组织核心与年轻边锋成为今年夏季转会市场溢价最高的焦点位置。",
      "财务公平法案（FFP）监管规则促使各俱乐部在引援时更注重薪资结构与分期摊销。",
      "季前巡回热身赛上多位青训新秀表现亮眼，有望在新赛季跻身一线队轮换阵容。",
    ],
  },
];

export const NYT_PREVIEW_STORIES = GOOGLE_NEWS_PREVIEW_STORIES;
export const BIG5_PREVIEW_STORIES = GOOGLE_NEWS_PREVIEW_STORIES;

export function createBriefPreviewEdition() {
  const stories = GOOGLE_NEWS_PREVIEW_STORIES.map((story, idx) => ({
    ...story,
    importance: 0.95 - idx * 0.02,
    score: 1 - idx * 0.03,
    sources: [
      {
        authorityLabel: "权威新闻来源",
        domain: story.domain || "news.google.com",
        faviconUrl: getDefaultBookmarkFaviconUrl(`https://${story.domain || "news.google.com"}`),
        title: story.sourceName || story.section,
        url: story.url,
      },
    ],
    sourceCount: 1,
    topicId: story.section,
    topicLabel: story.section,
  }));

  return {
    id: "preview-gnews",
    kind: "morning",
    label: "全球焦点资讯 · 六大专题",
    pages: [
      { id: "page-1", pageNumber: 1, title: "全球焦点资讯", stories },
    ],
    preview: true,
    publishedAt: new Date().toISOString(),
    status: "success",
    topics: [
      { id: "WORLD", label: "国际要闻", weight: 0.2 },
      { id: "BUSINESS", label: "商业财经", weight: 0.2 },
      { id: "TECHNOLOGY", label: "科技产业", weight: 0.2 },
      { id: "SCIENCE", label: "前沿科学", weight: 0.15 },
      { id: "HEALTH", label: "健康医疗", weight: 0.15 },
      { id: "SPORTS", label: "全球体育", weight: 0.1 },
    ],
    updatedAt: new Date().toISOString(),
  };
}

function formatDate(value) {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date(value));
}

function formatTime(value) {
  return new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(value));
}

function relativeTime(value) {
  const minutes = Math.max(1, Math.round((Date.now() - Date.parse(value || "")) / 60_000));
  if (!Number.isFinite(minutes)) return "刚刚";
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.round(minutes / 60);
  return hours < 24 ? `${hours} 小时前` : `${Math.round(hours / 24)} 天前`;
}

function CitationText({ sources, text, onOpenSource }) {
  return String(text || "").split(/(\[\d+\])/g).filter(Boolean).map((part, index) => {
    const match = part.match(/^\[(\d+)\]$/);
    const source = match ? sources[Number(match[1]) - 1] : null;
    return source ? (
      <button
        className="brief-inline-citation"
        key={`${part}-${index}`}
        type="button"
        onClick={() => onOpenSource(source.url)}
        aria-label={`打开来源 ${match[1]}：${source.title}`}
      >
        {match[1]}
      </button>
    ) : <span key={`${part}-${index}`}>{part}</span>;
  });
}

function StoryMeta({ story }) {
  return (
    <span className="brief-story-meta">
      <Clock size={13} />
      <span>{relativeTime(story.publishedAt)}</span>
    </span>
  );
}

function StoryImage({ className = "", story }) {
  if (!story.imageUrl) return null;
  return (
    <img
      className={className}
      src={story.imageUrl}
      alt=""
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={(event) => { event.currentTarget.closest(".brief-story-image-wrap")?.classList.add("is-missing"); }}
    />
  );
}

function getSourcePresentation(story, source) {
  const resolvedSource = source || story?.sources?.[0] || {};
  const name = resolvedSource.title || story?.sourceName || resolvedSource.domain || story?.domain || "新闻来源";
  const domain = resolvedSource.domain || story?.domain || "";
  const origin = /^https?:\/\//i.test(domain) ? domain : domain ? `https://${domain}` : "";
  return {
    faviconUrl: resolvedSource.faviconUrl || story?.faviconUrl || getDefaultBookmarkFaviconUrl(origin),
    name,
  };
}

function BriefSourceIcon({ className = "", source, story }) {
  const { faviconUrl, name } = getSourcePresentation(story, source);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [faviconUrl]);

  return (
    <span
      className={`brief-source-icon${className ? ` ${className}` : ""}${failed || !faviconUrl ? " is-fallback" : ""}`}
      aria-label={`来源：${name}`}
      title={name}
    >
      {!failed && faviconUrl
        ? <img src={faviconUrl} alt="" referrerPolicy="no-referrer" onError={() => setFailed(true)} />
        : <span aria-hidden="true">{String(name).trim().slice(0, 1).toUpperCase()}</span>}
    </span>
  );
}

function storyKey(story) {
  return story.id || story.url || story.headline;
}

export function getTopicBadgeClass(topic = "") {
  const t = String(topic).toUpperCase();
  if (t.includes("WORLD") || t.includes("国际")) return "is-world";
  if (t.includes("BUSINESS") || t.includes("商业") || t.includes("FINANCE")) return "is-business";
  if (t.includes("TECH") || t.includes("科技")) return "is-technology";
  if (t.includes("SCIENCE") || t.includes("科学")) return "is-science";
  if (t.includes("HEALTH") || t.includes("健康") || t.includes("医疗")) return "is-health";
  if (t.includes("SPORTS") || t.includes("体育")) return "is-sports";
  return "is-world";
}

export const getMediaBadgeClass = getTopicBadgeClass;

export const TOPIC_NAMES = {
  WORLD: "国际要闻",
  BUSINESS: "商业财经",
  TECHNOLOGY: "科技产业",
  SCIENCE: "前沿科学",
  HEALTH: "健康医疗",
  SPORTS: "全球体育",
};

function Masthead({ edition, onRefresh, refreshing, onClose }) {
  const displayLabel = edition?.label && !edition.label.includes("POST") && !edition.label.includes("UPDATE")
    ? edition.label
    : "全球焦点资讯 · 六大专题";
  return (
    <header className="brief-masthead">
      <div className="brief-edition-scope">
        {onClose && (
          <button type="button" className="brief-back-btn" onClick={onClose} title="返回网页">
            <ArrowLeft size={16} />
            <span>返回网页</span>
          </button>
        )}
        <span className="brief-edition-mark">DAILY EDITION · 每日情报</span>
      </div>
      <div className="brief-masthead-center">
        <small>BRIZO INTELLIGENCE</small>
        <h1>Brizo Brief</h1>
        <p>{displayLabel}</p>
      </div>
      <div className="brief-edition-clock">
        <span>{formatDate(edition?.publishedAt || Date.now())}</span>
        <strong>{formatTime(new Date())}</strong>
        <div className="brief-clock-actions">
          <button type="button" onClick={onRefresh} disabled={refreshing}>
            <ArrowsClockwise className={refreshing ? "is-spinning" : ""} size={13} />
            {refreshing ? "正在刷新" : "刷新最新"}
          </button>
        </div>
      </div>
    </header>
  );
}

function GoogleNewsStoryCard({
  story,
  layout = "column",
  onOpenStory,
  storyNumber,
  showImage = false,
  imageVariant = "landscape",
}) {
  const topicCode = (story.section || story.topicId || "WORLD").toUpperCase();
  const badgeClass = getTopicBadgeClass(topicCode);
  const topicChineseName = TOPIC_NAMES[topicCode] || topicCode;
  const hasImage = Boolean(showImage && story.imageUrl);

  return (
    <article className={`brief-stream-story brief-stream-story-${layout} ${hasImage ? "has-image" : "is-text-only"}`}>
      <button type="button" className="brief-story-card-btn" onClick={() => onOpenStory(story)}>
        {hasImage && (
          <div className={`brief-story-image-wrap brief-story-image-${imageVariant}`}>
            <StoryImage story={story} />
            <BriefSourceIcon className="brief-story-image-credit" story={story} />
          </div>
        )}
        <div className="brief-stream-story-copy">
          <div className="brief-newspaper-kicker">
            {storyNumber && <span className="brief-newspaper-number">{String(storyNumber).padStart(2, "0")}</span>}
            <span className={`brief-newspaper-section ${badgeClass}`}>{topicChineseName}</span>
            <span>{topicCode}</span>
          </div>
          <h2>{story.headline || story.title}</h2>
          {story.summary ? <p className="brief-story-summary">{story.summary}</p> : null}
          <footer className="brief-stream-story-footer">
            <div className="brief-stream-footer-meta">
              <BriefSourceIcon story={story} />
              <span className="brief-story-meta">
                <span>{formatDate(story.publishedAt)} · {formatTime(story.publishedAt)} ({relativeTime(story.publishedAt)})</span>
              </span>
            </div>
          </footer>
        </div>
      </button>
    </article>
  );
}

const Big5StoryCard = GoogleNewsStoryCard;
const NytStoryCard = GoogleNewsStoryCard;

function ReportOverlay({
  loading,
  onClose,
  onOpenRelated,
  onOpenSource,
  relatedStories,
  report,
  story,
}) {
  const bodyParagraphs = report?.body?.length
    ? report.body
    : [story.summary].filter(Boolean);

  const topicCode = (story.section || story.topicId || "WORLD").toUpperCase();
  const badgeClass = getTopicBadgeClass(topicCode);
  const topicChineseName = TOPIC_NAMES[topicCode] || topicCode;
  const sourceName = story.sourceName || story.domain || "新闻来源";

  return (
    <section className="brief-report-layer" role="dialog" aria-modal="true" aria-label={story.headline}>
      <header className="brief-report-header">
        <button type="button" className="brief-report-back-btn" onClick={onClose}>
          <ArrowLeft size={16} />
          <span>返回 Brief</span>
        </button>
        <div className="brief-report-header-center">
          <Sparkle className="brief-sparkle-icon" size={16} weight="fill" />
          <span>权威媒体深度整理</span>
        </div>
        <div className="brief-report-header-actions">
          {story.url && (
            <button
              type="button"
              className="brief-report-open-tab"
              onClick={() => onOpenSource(story.url)}
              title="在浏览器中打开外媒原文"
            >
              <ArrowSquareOut size={15} />
              <span>打开原文</span>
            </button>
          )}
          <button type="button" className="brief-report-close" onClick={onClose} aria-label="关闭">
            <X size={18} />
          </button>
        </div>
      </header>

      <div className="brief-report-scroll-container">
        <article className="brief-report-paper">
          <div className="brief-report-header-meta">
            <span className={`brief-report-kicker ${badgeClass}`}>
              {topicChineseName}
              <BriefSourceIcon story={story} />
            </span>
            <h1 className="brief-report-main-title">{story.headline || story.title}</h1>
            <div className="brief-story-meta">
              <Clock size={14} />
              <span>发布于 {formatDate(story.publishedAt)} · {formatTime(story.publishedAt)} ({relativeTime(story.publishedAt)})</span>
              <BriefSourceIcon story={story} />
            </div>
          </div>

          {story.imageUrl && (
            <div className="brief-report-cover-image">
              <StoryImage story={story} />
            </div>
          )}

          {/* Deep Insights Card */}
          {report?.keyPoints && report.keyPoints.length > 0 && (
            <section className="brief-deepseek-insights-card">
              <div className="brief-ai-card-title">
                <Sparkle size={15} weight="fill" />
                <strong>核心事实提炼与深度解析</strong>
              </div>

              <div className="brief-ai-section">
                <div className="brief-ai-section-label">核心要点速览</div>
                <ul className="brief-ai-keypoints-list">
                  {report.keyPoints.slice(0, 3).map((point, index) => (
                    <li key={index}>
                      <span className="brief-ai-num">{index + 1}</span>
                      <p>
                        <CitationText
                          text={point}
                          sources={report?.sources || story.sources || []}
                          onOpenSource={onOpenSource}
                        />
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
            </section>
          )}

          {/* Full Text Body */}
          <div className="brief-report-body is-article-body">
            <div className="brief-body-section-heading">新闻整理精读</div>
            {bodyParagraphs.map((para, index) => (
              <p key={index}>
                <CitationText sources={report?.sources || story.sources} text={para} onOpenSource={onOpenSource} />
              </p>
            ))}
          </div>

          {/* Original Sources */}
          <section className="brief-report-sources">
            <h2>引用来源与原始发布</h2>
            <div className="brief-sources-list">
              {(report?.sources || story.sources || []).map((source, index) => (
                <button
                  key={`${source.url}-${index}`}
                  type="button"
                  className="brief-source-card-btn"
                  onClick={() => onOpenSource(source.url)}
                  aria-label={`打开来源：${source.title || source.domain || sourceName}`}
                  title={source.title || source.domain || sourceName}
                >
                  <BriefSourceIcon className="brief-source-list-icon" source={source} story={story} />
                  <div className="brief-source-info">
                    <strong>原始报道 {index + 1}</strong>
                    <small>
                      <b>{source.authorityLabel || "权威新闻来源"}</b>
                    </small>
                  </div>
                  <ArrowSquareOut size={15} />
                </button>
              ))}
            </div>
          </section>

          {/* Related Stories */}
          {relatedStories?.length > 0 && (
            <section className="brief-report-related">
              <h2>相关焦点报道</h2>
              <div className="brief-related-grid">
                {relatedStories.slice(0, 4).map((related) => (
                  <button
                    key={storyKey(related)}
                    type="button"
                    className="brief-related-card"
                    onClick={() => onOpenRelated(related)}
                  >
                    <StoryImage story={related} />
                    <div className="brief-related-copy">
                      <strong>{related.headline || related.title}</strong>
                      <p>{related.summary}</p>
                      <StoryMeta story={related} />
                    </div>
                  </button>
                ))}
              </div>
            </section>
          )}
        </article>
      </div>
    </section>
  );
}

function editionStories(edition) {
  if (!edition) return [];
  if (Array.isArray(edition.pages)) {
    const rawList = edition.pages.flatMap((page) => [
      ...(page.stories || []),
      ...(page.sections || []).flatMap((sec) => sec.stories || []),
    ]);
    const seen = new Set();
    const unique = [];
    for (const st of rawList) {
      if (!st) continue;
      const key = st.id || st.url || st.headline || st.title;
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(st);
      }
    }
    return unique;
  }
  return [];
}

export function BriefPage({
  active,
  edition,
  loading,
  onClose,
  onGetReport,
  onOpenModelGuard,
  onOpenSource,
  onRefresh,
  refreshing,
}) {
  const streamRef = useRef(null);
  const loadMoreRef = useRef(null);
  const reportScrollRef = useRef(0);
  const refreshCooldownRef = useRef(0);
  const [storyArchive, setStoryArchive] = useState(() => {
    const raw = editionStories(edition);
    return raw.length ? raw : BIG5_PREVIEW_STORIES;
  });
  const [visibleCount, setVisibleCount] = useState(16);
  const [selectedStory, setSelectedStory] = useState(null);
  const [report, setReport] = useState(null);
  const [reportLoading, setReportLoading] = useState(false);

  useEffect(() => {
    if (!active || !onClose) return undefined;
    const handleKeyDown = (e) => {
      if (e.key === "Escape" && !selectedStory) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [active, onClose, selectedStory]);

  // Automatically trigger refresh on active / entry
  useEffect(() => {
    if (active && onRefresh) {
      const now = Date.now();
      if (now - refreshCooldownRef.current >= 4000) {
        refreshCooldownRef.current = now;
        onRefresh();
      }
    }
  }, [active, onRefresh]);

  useEffect(() => {
    const incoming = editionStories(edition);
    if (incoming.length) {
      setStoryArchive(incoming);
    } else if (edition?.preview) {
      setStoryArchive(GOOGLE_NEWS_PREVIEW_STORIES);
    }
  }, [edition]);

  const rankedStories = useMemo(() => {
    return storyArchive.slice().sort((left, right) => {
      return Date.parse(right.publishedAt || 0) - Date.parse(left.publishedAt || 0);
    });
  }, [storyArchive]);

  const visibleStories = rankedStories.slice(0, visibleCount);

  useEffect(() => {
    const sentinel = loadMoreRef.current;
    const root = streamRef.current;
    if (!active || !sentinel || !root) return undefined;
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      if (visibleCount < rankedStories.length) {
        setVisibleCount((count) => Math.min(count + 8, rankedStories.length));
        return;
      }
      const now = Date.now();
      if (!refreshing && now >= refreshCooldownRef.current) {
        refreshCooldownRef.current = now + 30_000;
        onRefresh?.();
      }
    }, { root, rootMargin: "500px 0px", threshold: 0.01 });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [active, onRefresh, rankedStories.length, refreshing, visibleCount]);

  const openStory = async (story) => {
    reportScrollRef.current = streamRef.current?.scrollTop || 0;
    setSelectedStory(story);
    const initialReport = {
      headline: story.headline || story.title,
      imageUrl: story.imageUrl,
      lead: story.summary,
      keyPoints: story.keyPoints || [],
      body: [story.summary].filter(Boolean),
      sources: story.sources || [{ title: story.sourceName || "新闻来源", domain: story.domain || "news.google.com", url: story.url }],
      sourceCount: (story.sources || []).length || 1,
      status: "success",
      verificationLabel: "原始来源已载入",
    };
    setReport(initialReport);

    if (!edition?.preview && onGetReport && edition?.id) {
      setReportLoading(true);
      try {
        const fullReport = await onGetReport({ editionId: edition.id, storyId: story.id });
        if (fullReport && fullReport.status === "success") {
          setReport(fullReport);
        }
      } catch {} finally {
        setReportLoading(false);
      }
    }
  };

  const relatedStoriesForSelected = useMemo(() => {
    if (!selectedStory) return [];
    return rankedStories
      .filter((s) => storyKey(s) !== storyKey(selectedStory))
      .slice(0, 4);
  }, [rankedStories, selectedStory]);

  const closeStory = () => {
    setSelectedStory(null);
    setReport(null);
    window.requestAnimationFrame(() => {
      if (streamRef.current) streamRef.current.scrollTop = reportScrollRef.current;
    });
  };

  if (loading && !edition) {
    return (
      <section className="brief-state-page" aria-live="polite">
        <ArrowsClockwise className="is-spinning" size={24} />
        <h1>正在获取最新焦点报道</h1>
        <p>Brizo 正在从 WORLD、BUSINESS、TECHNOLOGY、SCIENCE、HEALTH、SPORTS 六大专题实时同步全球要闻。</p>
      </section>
    );
  }
  if (!edition || edition.status === "error") {
    return (
      <section className="brief-state-page" aria-live="polite">
        <ShieldCheck size={28} />
        <h1>本期 Brief 尚未生成</h1>
        <p>{edition?.message || "请保持网络连接并重试。"}</p>
        <div>
          <button type="button" onClick={onRefresh}>重新生成</button>
        </div>
      </section>
    );
  }

  const leadStory = visibleStories[0];
  const secondaryStories = visibleStories.slice(1, 4);
  const columnStories = visibleStories.slice(4);

  return (
    <section className="brief-page" aria-label="Brizo Brief">
      {edition.staleReason && <div className="brief-stale-notice">更新失败，正在显示上一版：{edition.staleReason}</div>}
      <div className="brief-stream" ref={streamRef}>
        <div className="brief-stream-header-wrap">
          <Masthead edition={edition} onRefresh={onRefresh} refreshing={refreshing} onClose={onClose} />
        </div>
        <div className="brief-stream-shell is-single-page">
          <div className="brief-newspaper-sections" aria-label="Brief 新闻版面">
            {Object.entries(TOPIC_NAMES).map(([code, label]) => (
              <span key={code}><b>{code === "TECHNOLOGY" ? "TECH" : code}</b>{label}</span>
            ))}
          </div>
          <main className="brief-stream-main">
            {visibleStories.length ? (
              <>
                <div className="brief-newspaper-dateline">
                  <span>TOP STORIES · 今日头条</span>
                  <small>{formatDate(edition?.publishedAt || Date.now())} · UPDATED {formatTime(edition?.updatedAt || edition?.publishedAt || Date.now())}</small>
                </div>
                <section className="brief-newspaper-hero" aria-label="今日头条">
                  {leadStory && (
                    <Big5StoryCard
                      layout="lead"
                      story={leadStory}
                      storyNumber={1}
                      showImage
                      imageVariant="cinema"
                      onOpenStory={openStory}
                    />
                  )}
                  {secondaryStories.length > 0 && (
                    <div className="brief-newspaper-secondary">
                      {secondaryStories.map((story, index) => (
                        <Big5StoryCard
                          key={storyKey(story)}
                          layout={index === 0 ? "secondary-feature" : "secondary"}
                          story={story}
                          storyNumber={index + 2}
                          showImage={index === 0}
                          imageVariant="landscape"
                          onOpenStory={openStory}
                        />
                      ))}
                    </div>
                  )}
                </section>
                {columnStories.length > 0 && (
                  <>
                    <div className="brief-newspaper-divider">
                      <span>THE DAILY FILE</span>
                      <strong>更多要闻</strong>
                      <small>{columnStories.length} STORIES</small>
                    </div>
                    <div className="brief-newspaper-columns">
                      {columnStories.map((story, index) => {
                        const layoutPattern = ["feature", "compact", "portrait", "column", "horizontal", "compact"];
                        const layout = layoutPattern[index % layoutPattern.length];
                        return (
                          <Big5StoryCard
                            key={storyKey(story)}
                            layout={layout}
                            story={story}
                            storyNumber={index + 5}
                            showImage={!layout.includes("compact")}
                            imageVariant={layout === "portrait" ? "portrait" : "landscape"}
                            onOpenStory={openStory}
                          />
                        );
                      })}
                    </div>
                  </>
                )}
              </>
            ) : (
              <div className="brief-stream-empty">
                <h2>正在同步六大专题要闻</h2>
                <p>点击上方刷新按钮即可重新拉取最新全球焦点资讯。</p>
              </div>
            )}
            <div className="brief-stream-loader" ref={loadMoreRef} aria-live="polite">
              <ArrowsClockwise className={refreshing ? "is-spinning" : ""} size={15} />
              <span>{refreshing ? "正在获取更多全球焦点新闻" : "已加载全部焦点要闻"}</span>
            </div>
          </main>
        </div>
      </div>
      {selectedStory && (
        <ReportOverlay
          loading={reportLoading}
          onClose={closeStory}
          onOpenRelated={openStory}
          onOpenSource={onOpenSource}
          relatedStories={relatedStoriesForSelected}
          report={report}
          story={selectedStory}
        />
      )}
    </section>
  );
}
