import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowsClockwise,
  Check,
  GearSix,
  LinkSimple,
  Minus,
  PushPin,
  ShieldCheck,
  X,
} from "@phosphor-icons/react";
import brizoLogoUrl from "../logo.png";

const PREVIEW_IMAGES = [
  "https://images.unsplash.com/photo-1578575437130-527eed3abbec?auto=format&fit=crop&w=1400&q=82",
  "https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=800&q=80",
  "https://images.unsplash.com/photo-1521295121783-8a321d551ad2?auto=format&fit=crop&w=800&q=80",
  "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=800&q=80",
  "https://images.unsplash.com/photo-1451187580459-43490279c0fa?auto=format&fit=crop&w=800&q=80",
];

const PREVIEW_SOURCE_SETS = [
  ["Reuters", "https://www.reuters.com/"],
  ["新华社", "https://www.news.cn/"],
  ["Financial Times", "https://www.ft.com/"],
  ["Nature", "https://www.nature.com/"],
  ["BBC News", "https://www.bbc.com/news"],
];

function previewSources(seed = 0) {
  return PREVIEW_SOURCE_SETS.slice(seed % 2, seed % 2 + 3).map(([title, url], index) => ({
    domain: new URL(url).hostname.replace(/^www\./, ""),
    id: `preview-source-${seed}-${index}`,
    snippet: "用于展示引用排版的界面预览来源，桌面版会替换为真实检索结果。",
    title,
    url,
  }));
}

function makePreviewStory({ headline, id, index, region, summary, topicId, topicLabel }) {
  const sources = previewSources(index);
  return {
    headline,
    id,
    imageUrl: PREVIEW_IMAGES[index % PREVIEW_IMAGES.length],
    publishedAt: new Date(Date.now() - (index + 1) * 18 * 60_000).toISOString(),
    region,
    score: 1 - index * 0.02,
    sources,
    summary,
    topicId,
    topicLabel,
    url: `${sources[0].url}?brizo-preview=${encodeURIComponent(id)}`,
  };
}

const PREVIEW_TOPIC_CONTENT = [
  {
    id: "technology",
    label: "科学与技术",
    weight: 0.17,
    headlines: [
      "新一轮智能基础设施建设进入规模化阶段",
      "芯片制造协作网络出现新的区域化布局",
      "企业软件开始从助手转向可执行工作流",
    ],
  },
  {
    id: "business-finance",
    label: "商业与金融",
    weight: 0.16,
    headlines: [
      "全球供应链重构加快，企业重新平衡效率与韧性",
      "主要市场关注利率路径与企业盈利修复节奏",
      "跨境投资开始重新评估制造业与数字服务机会",
    ],
  },
  {
    id: "international",
    label: "国际重要新闻",
    weight: 0.24,
    headlines: [
      "跨区域合作议题重新聚焦贸易、能源与数字规则",
      "多边机构讨论新一阶段经济与人道协调方案",
      "主要经济体在产业政策与开放之间寻找平衡",
      "全球前沿议题加速进入公共政策讨论",
    ],
  },
  {
    id: "domestic",
    label: "国内重要新闻",
    weight: 0.14,
    headlines: [
      "先进制造业支持政策聚焦创新投入与长期能力",
      "多地完善公共服务供给与青年就业支持措施",
    ],
  },
  {
    id: "arts-culture",
    label: "艺术与文化",
    weight: 0.15,
    headlines: [
      "国际艺术展览以技术和公共空间回应时代议题",
      "电影与出版市场出现新的跨文化表达",
      "设计机构重新讨论人工智能时代的创作边界",
    ],
  },
  {
    id: "sports-entertainment",
    label: "体育与娱乐",
    weight: 0.14,
    headlines: [
      "全球重要赛事进入关键阶段",
      "流行文化平台加快争夺国际受众",
      "娱乐产业重新评估内容制作与发行模式",
    ],
  },
];

export function createBriefPreviewEdition() {
  const stories = PREVIEW_TOPIC_CONTENT.flatMap((topic, topicIndex) =>
    topic.headlines.map((headline, index) => makePreviewStory({
      headline,
      id: `${topic.id}-${index}`,
      index: topicIndex * 6 + index,
      region: topic.id === "domestic" ? "国内" : "国际",
      summary: "界面预览采用简洁摘要；桌面版会从真实来源提炼关键事实，并保留时间与出处。",
      topicId: topic.id,
      topicLabel: topic.label,
    })),
  );
  const frontStories = [
    makePreviewStory({
      headline: "全球供应链重构加速，关键产业区域化趋势增强",
      id: "front-lead",
      index: 0,
      region: "国际",
      summary: "多重因素正推动企业重新安排生产、物流与能源采购。新的布局不只追求成本，也强调供应连续性、关键零部件冗余和跨区域协作能力。企业开始在效率与韧性之间重新计算长期成本，并更重视能源、港口与数字基础设施的稳定性。此处为界面预览文字，桌面版将依据真实来源生成带编号引用的综合摘要。",
      topicId: "business-finance",
      topicLabel: "商业与金融",
    }),
    makePreviewStory({
      headline: "先进制造业发展方案聚焦长期创新能力",
      id: "front-china",
      index: 6,
      region: "国内",
      summary: "政策重点从单点投入转向研发、人才、标准和供应链协同，帮助企业建立更稳定的长期能力。多地方案同时强调成果转化与中小企业配套，桌面版会以真实报道和公开信息交叉整理。",
      topicId: "domestic",
      topicLabel: "国内重要新闻",
    }),
    makePreviewStory({
      headline: "主要市场重新评估增长、就业与利率预期",
      id: "front-world",
      index: 8,
      region: "国际",
      summary: "新的经济数据让投资者重新审视增长韧性和政策节奏，市场关注点逐渐转向行业分化、就业质量与企业现金流。政策预期仍有弹性，但后续路径需要更多连续数据确认。此处仅展示版式。",
      topicId: "business-finance",
      topicLabel: "商业与金融",
    }),
    ...stories.slice(1, 6),
  ];
  const previewSlots = [3, 3, 4, 2, 3, 3];
  const sections = PREVIEW_TOPIC_CONTENT.map((topic, index) => ({
    id: topic.id,
    label: topic.label,
    stories: stories.filter((story) => story.topicId === topic.id).slice(0, previewSlots[index]),
    weight: topic.weight,
  }));
  return {
    id: "preview-evening",
    kind: "evening",
    label: "THE EVENING POST",
    pages: [
      { id: "front", kind: "front", stories: frontStories.slice(0, 8) },
      { id: "editorial-2", kind: "topics", sections: sections.slice(0, 2) },
      { id: "editorial-3", kind: "topics", sections: sections.slice(2, 4) },
      { id: "editorial-4", kind: "topics", sections: sections.slice(4, 6) },
    ],
    preview: true,
    publishedAt: new Date(new Date().setHours(18, 0, 0, 0)).toISOString(),
    status: "success",
    topics: PREVIEW_TOPIC_CONTENT.map(({ headlines: _headlines, ...topic }) => topic),
    updatedAt: new Date().toISOString(),
  };
}

function formatDate(value) {
  return new Intl.DateTimeFormat("en", {
    day: "numeric",
    month: "long",
    weekday: "long",
    year: "numeric",
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
      <span>{story.sources?.[0]?.domain || "Brizo source"}</span>
      <span>{relativeTime(story.publishedAt)}</span>
      <span>{story.region}</span>
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
      onError={(event) => { event.currentTarget.hidden = true; }}
    />
  );
}

function Masthead({ edition, onRefresh, refreshing }) {
  return (
    <header className="brief-masthead">
      <div className="brief-edition-scope">BrizoAI</div>
      <div className="brief-masthead-center">
        <h1>{edition.label}</h1>
      </div>
      <div className="brief-edition-clock">
        <span>{formatDate(edition.publishedAt)}</span>
        <strong>{formatTime(new Date())}</strong>
        <small>出版 {formatTime(edition.publishedAt)} · 更新 {formatTime(edition.updatedAt)}</small>
        <button type="button" onClick={onRefresh} disabled={refreshing}>
          <ArrowsClockwise className={refreshing ? "is-spinning" : ""} size={13} />
          {refreshing ? "正在刷新" : "刷新本期"}
        </button>
      </div>
    </header>
  );
}

const BRIEF_CATEGORIES = [
  { id: "all", label: "全部" },
  { id: "science-technology", label: "科学与技术" },
  { id: "business", label: "商业" },
  { id: "arts-culture", label: "艺术与文化" },
  { id: "sports", label: "体育" },
  { id: "entertainment", label: "娱乐" },
];

const SPORTS_PATTERN = /体育|赛事|球队|球员|联赛|冠军|奥运|世界杯|NBA|足球|篮球|网球|赛车|F1/i;
const ENTERTAINMENT_PATTERN = /娱乐|电影|影视|音乐|艺人|明星|票房|流媒体|综艺|剧集|游戏/i;

function storyKey(story) {
  return story?.url || story?.id;
}

function editionStories(edition) {
  const stories = (edition?.pages || []).flatMap((page) => [
    ...(page.stories || []),
    ...(page.sections || []).flatMap((section) => section.stories || []),
  ]);
  return [...new Map(stories.filter(Boolean).map((story) => [storyKey(story), story])).values()];
}

function matchesCategory(story, categoryId) {
  if (categoryId === "all") return true;
  if (categoryId === "science-technology") return story.topicId === "technology";
  if (categoryId === "business") return story.topicId === "business-finance";
  if (categoryId === "arts-culture") return story.topicId === "arts-culture";
  const searchable = `${story.headline || ""} ${story.summary || ""} ${story.topicLabel || ""}`;
  if (categoryId === "sports") return story.topicId === "sports-entertainment" && SPORTS_PATTERN.test(searchable);
  if (categoryId === "entertainment") {
    return story.topicId === "sports-entertainment" && (ENTERTAINMENT_PATTERN.test(searchable) || !SPORTS_PATTERN.test(searchable));
  }
  return false;
}

function storyExcerpt(story) {
  return story.bodyExcerpt
    || story.sources?.find((source) => source.bodyExcerpt)?.bodyExcerpt
    || story.summary
    || "";
}

function storyRank(story, edition, preferences) {
  const topicWeight = edition?.topics?.find((topic) => topic.id === story.topicId)?.weight || 0;
  const pinned = preferences?.pinnedTopicIds?.includes(story.topicId) ? 4 : 0;
  const reduced = preferences?.reducedTopicIds?.includes(story.topicId) ? -2 : 0;
  const freshness = Math.max(0, 1 - ((Date.now() - Date.parse(story.publishedAt || 0)) / 86_400_000)) * 0.2;
  return pinned + reduced + topicWeight * 3 + (Number(story.score) || 0) + freshness;
}

function StorySources({ story }) {
  const sources = story.sources || [];
  return (
    <div className="brief-stream-sources" aria-label={`${sources.length} 个来源`}>
      <span className="brief-source-stack" aria-hidden="true">
        {sources.slice(0, 3).map((source, index) => (
          <i key={`${source.url || source.domain}-${index}`}>{(source.domain || source.title || "B").slice(0, 1).toUpperCase()}</i>
        ))}
      </span>
      <span>{sources.length || 1} 个来源</span>
    </div>
  );
}

function StreamStoryCard({ story, layout = "card", onOpenStory }) {
  return (
    <article className={`brief-stream-story brief-stream-story-${layout}`}>
      <button type="button" onClick={() => onOpenStory(story)}>
        <StoryImage story={story} />
        <span className="brief-stream-story-copy">
          <h2>{story.headline}</h2>
          {layout !== "card" && <StoryMeta story={story} />}
          <p>{storyExcerpt(story)}</p>
        </span>
      </button>
      <StorySources story={story} />
    </article>
  );
}

function BriefCategorySwitch({ activeCategory, onChange }) {
  return (
    <aside className="brief-stream-sidebar" aria-label="题材选择">
      <h2>题材</h2>
      <nav>
        {BRIEF_CATEGORIES.map((category) => (
          <button
            className={activeCategory === category.id ? "is-active" : ""}
            key={category.id}
            type="button"
            onClick={() => onChange(category.id)}
          >
            {category.label}
          </button>
        ))}
      </nav>
    </aside>
  );
}

function FrontPage({ edition, onOpenStory, onRefresh, refreshing }) {
  const stories = edition.pages[0]?.stories || [];
  const [lead, firstSecondary, secondSecondary, ...wire] = stories;
  if (!lead) return null;
  return (
    <section className="brief-paper-page brief-front-page" data-brief-page="1">
      <Masthead edition={edition} pageNumber={1} onRefresh={onRefresh} refreshing={refreshing} />
      {edition.preview && <div className="brief-preview-notice">界面预览 · 桌面版将使用实时检索与绑定模型生成内容</div>}
      <div className="brief-front-grid">
        <button className="brief-lead-image" type="button" onClick={() => onOpenStory(lead)}>
          <StoryImage story={lead} />
        </button>
        <article className="brief-lead-copy">
          <button type="button" onClick={() => onOpenStory(lead)}>
            <h2>{lead.headline}</h2>
            <p>{lead.summary}</p>
          </button>
          <StoryMeta story={lead} />
        </article>
        <aside className="brief-news-wire">
          <h2>Now <span>/ 正在发生</span></h2>
          {wire.slice(0, 5).map((story) => (
            <button key={story.id} type="button" onClick={() => onOpenStory(story)}>
              <StoryImage story={story} />
              <span><StoryMeta story={story} /><strong>{story.headline}</strong><p>{story.summary}</p></span>
            </button>
          ))}
        </aside>
        {[firstSecondary, secondSecondary].filter(Boolean).map((story) => (
          <article className="brief-secondary-story" key={story.id}>
            <StoryImage story={story} />
            <button type="button" onClick={() => onOpenStory(story)}>
              <h2>{story.headline}</h2>
              <p>{story.summary}</p>
            </button>
            <StoryMeta story={story} />
          </article>
        ))}
      </div>
    </section>
  );
}

function TopicPage({ edition, onOpenStory, page, pageNumber, onRefresh, refreshing }) {
  return (
    <section className="brief-paper-page brief-topic-page" data-brief-page={pageNumber}>
      <Masthead edition={edition} pageNumber={pageNumber} onRefresh={onRefresh} refreshing={refreshing} />
      <div className={`brief-topic-grid brief-topic-grid-${page.sections?.length || 1}`}>
        {(page.sections || []).map((section) => (
          <section className="brief-topic-section" key={section.id}>
            <header>
              <div>
                <span>{section.label}</span>
                <strong>{pageNumber === 3 && section.id === "international" ? "GLOBAL FIRST" : "BRIZO DESK"}</strong>
              </div>
              <i><span style={{ width: `${Math.max(18, section.weight * 100)}%` }} /></i>
              <small>{section.stories.length} 篇</small>
            </header>
            <div className="brief-topic-stories">
              {section.stories.map((story, index) => (
                <article className={index === 0 ? "is-featured" : ""} key={story.id}>
                  <StoryImage story={story} />
                  <button type="button" onClick={() => onOpenStory(story)}>
                    <span className="brief-story-index">{String(index + 1).padStart(2, "0")}</span>
                    <span>
                      <strong>{story.headline}</strong>
                      <p>{story.summary}</p>
                      <StoryMeta story={story} />
                    </span>
                  </button>
                </article>
              ))}
            </div>
          </section>
        ))}
      </div>
      <footer className="brief-topic-footer">BRIZO BRIEF · PAGE {String(pageNumber).padStart(2, "0")}</footer>
    </section>
  );
}

function ReportOverlay({ loading, onClose, onOpenSource, report, story }) {
  useEffect(() => {
    const close = (event) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, [onClose]);

  return (
    <section className="brief-report-layer" role="dialog" aria-modal="true" aria-label="Brizo 图文专报">
      <header>
        <button type="button" onClick={onClose}><ArrowLeft size={16} /> 返回本期</button>
        <span>BRIZO · SHORT REPORT</span>
        <button className="brief-report-close" type="button" onClick={onClose} aria-label="关闭专报"><X size={16} /></button>
      </header>
      {loading ? (
        <div className="brief-report-loading">
          <ArrowsClockwise className="is-spinning" size={22} />
          <strong>正在交叉阅读来源并组织专报…</strong>
          <p>已保存的报纸页会保持原位。</p>
        </div>
      ) : report?.status === "error" ? (
        <div className="brief-report-error">
          <h2>暂时无法生成专报</h2>
          <p>{report.message}</p>
          <button type="button" onClick={onClose}>返回本期</button>
        </div>
      ) : (
        <article className="brief-report-paper">
          <div className="brief-report-kicker">{story.region} · {story.topicLabel}</div>
          <h1>{report?.headline || story.headline}</h1>
          <p className="brief-report-lead">
            <CitationText text={report?.lead || story.summary} sources={story.sources || []} onOpenSource={onOpenSource} />
          </p>
          <StoryImage className="brief-report-image" story={{ ...story, imageUrl: report?.imageUrl || story.imageUrl }} />
          <div className="brief-report-body is-article-body">
            {(report?.body || [report?.whatHappened, report?.whyItMatters, report?.whatNext].filter(Boolean)).map((text, index) => (
              <p key={`${index}-${text.slice(0, 20)}`}>
                <CitationText text={text} sources={story.sources || []} onOpenSource={onOpenSource} />
              </p>
            ))}
          </div>
          <section className="brief-report-sources">
            <h2>引用来源</h2>
            {(report?.sources || story.sources || []).map((source, index) => (
              <button key={`${source.url}-${index}`} type="button" onClick={() => onOpenSource(source.url)}>
                <span>{index + 1}</span>
                <strong>{source.title}</strong>
                <small>{source.domain}</small>
                <LinkSimple size={13} />
              </button>
            ))}
          </section>
        </article>
      )}
    </section>
  );
}

function TopicEditor({ edition, onClose, onSave, preferences }) {
  const [draft, setDraft] = useState(() => ({
    mutedTopicIds: [...(preferences.mutedTopicIds || [])],
    pinnedTopicIds: [...(preferences.pinnedTopicIds || [])],
    reducedTopicIds: [...(preferences.reducedTopicIds || [])],
  }));
  const update = (topicId, action) => {
    setDraft((current) => {
      const pinned = new Set(current.pinnedTopicIds);
      const reduced = new Set(current.reducedTopicIds);
      const muted = new Set(current.mutedTopicIds);
      pinned.delete(topicId);
      reduced.delete(topicId);
      muted.delete(topicId);
      if (action === "pin") pinned.add(topicId);
      if (action === "reduce") reduced.add(topicId);
      if (action === "mute") muted.add(topicId);
      return { mutedTopicIds: [...muted], pinnedTopicIds: [...pinned], reducedTopicIds: [...reduced] };
    });
  };
  return (
    <div className="brief-editor-layer" role="dialog" aria-modal="true" aria-label="编辑关注主题">
      <button className="brief-editor-backdrop" type="button" onClick={onClose} aria-label="关闭" />
      <section className="brief-topic-editor">
        <header><div><h2>编辑关注主题</h2><p>调整只保存在这台设备上，下期简报生效。</p></div><button type="button" onClick={onClose}><X size={16} /></button></header>
        <div>
          {(edition.topics || []).map((topic) => {
            const state = draft.pinnedTopicIds.includes(topic.id)
              ? "pin"
              : draft.mutedTopicIds.includes(topic.id)
                ? "mute"
                : draft.reducedTopicIds.includes(topic.id) ? "reduce" : "auto";
            return (
              <article key={topic.id}>
                <span><strong>{topic.label}</strong><small>{Math.round(topic.weight * 100)}% 当前权重</small></span>
                <div>
                  <button className={state === "pin" ? "is-active" : ""} type="button" onClick={() => update(topic.id, "pin")}><PushPin size={13} />置顶</button>
                  <button className={state === "auto" ? "is-active" : ""} type="button" onClick={() => update(topic.id, "auto")}><Check size={13} />自动</button>
                  <button className={state === "reduce" ? "is-active" : ""} type="button" onClick={() => update(topic.id, "reduce")}><Minus size={13} />减少</button>
                  <button className={state === "mute" ? "is-active" : ""} type="button" onClick={() => update(topic.id, "mute")}><Minus size={13} />屏蔽</button>
                </div>
              </article>
            );
          })}
        </div>
        <footer><button type="button" onClick={() => { setDraft({ mutedTopicIds: [], pinnedTopicIds: [], reducedTopicIds: [] }); }}>恢复自动判断</button><button className="primary" type="button" onClick={() => onSave(draft)}>保存设置</button></footer>
      </section>
    </div>
  );
}

export function BriefPage({
  active,
  edition,
  loading,
  onGetReport,
  onOpenModelGuard,
  onOpenSource,
  onRefresh,
  onSavePreferences,
  preferences,
  refreshing,
}) {
  const streamRef = useRef(null);
  const loadMoreRef = useRef(null);
  const reportScrollRef = useRef(0);
  const refreshCooldownRef = useRef(0);
  const [activeCategory, setActiveCategory] = useState("all");
  const [storyArchive, setStoryArchive] = useState(() => editionStories(edition));
  const [visibleCount, setVisibleCount] = useState(12);
  const [selectedStory, setSelectedStory] = useState(null);
  const [report, setReport] = useState(null);
  const [reportLoading, setReportLoading] = useState(false);

  useEffect(() => {
    const incoming = editionStories(edition);
    if (!incoming.length) return;
    setStoryArchive((current) => {
      const merged = new Map(current.map((story) => [storyKey(story), story]));
      incoming.forEach((story) => merged.set(storyKey(story), story));
      return [...merged.values()].slice(-240);
    });
  }, [edition]);

  const rankedStories = useMemo(() => {
    const muted = new Set(preferences?.mutedTopicIds || []);
    return storyArchive
      .filter((story) => !muted.has(story.topicId) && matchesCategory(story, activeCategory))
      .sort((left, right) => {
        const rankDelta = storyRank(right, edition, preferences) - storyRank(left, edition, preferences);
        if (rankDelta) return rankDelta;
        return Date.parse(right.publishedAt || 0) - Date.parse(left.publishedAt || 0);
      });
  }, [activeCategory, edition, preferences, storyArchive]);

  const visibleStories = rankedStories.slice(0, visibleCount);

  useEffect(() => {
    const sentinel = loadMoreRef.current;
    const root = streamRef.current;
    if (!active || !sentinel || !root) return undefined;
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      if (visibleCount < rankedStories.length) {
        setVisibleCount((count) => Math.min(count + 9, rankedStories.length));
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

  const changeCategory = (categoryId) => {
    setActiveCategory(categoryId);
    setVisibleCount(12);
    streamRef.current?.scrollTo({ behavior: "auto", top: 0 });
  };

  const openStory = async (story) => {
    reportScrollRef.current = streamRef.current?.scrollTop || 0;
    setSelectedStory(story);
    setReport(null);
    if (edition.preview) {
      setReport({
        headline: story.headline,
        imageUrl: story.imageUrl,
        lead: `${story.summary} [1]`,
        sources: story.sources,
        status: "success",
        whatHappened: "界面预览展示专报的正文结构。真实桌面版会读取多个搜索来源，对一致事实进行归纳，并在句末保留引用编号。[1][2]",
        whatNext: "后续更新将继续检查权威来源；若信息不足或来源冲突，Brizo 会在结果中直接说明，不会补造事实。[2]",
        whyItMatters: "这条新闻与用户近期关注主题的权重较高，因此进入本期版面。推荐解释只展示主题层面的原因。[3]",
      });
      return;
    }
    setReportLoading(true);
    try {
      setReport(await onGetReport({ editionId: edition.id, storyId: story.id }));
    } finally {
      setReportLoading(false);
    }
  };

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
        <h1>正在编辑本期 Brief</h1>
        <p>Brizo 正在整理真实新闻、来源与您的关注主题。</p>
      </section>
    );
  }
  if (!edition || edition.status === "error") {
    return (
      <section className="brief-state-page" aria-live="polite">
        <ShieldCheck size={28} />
        <h1>本期 Brief 尚未生成</h1>
        <p>{edition?.message || "请先绑定默认模型，并保持网络连接后重试。"}</p>
        <div><button type="button" onClick={onOpenModelGuard}>打开大模型护航</button><button type="button" onClick={onRefresh}>重新生成</button></div>
      </section>
    );
  }

  return (
    <section className="brief-page" aria-label="Brizo Brief">
      {edition.staleReason && <div className="brief-stale-notice">更新失败，正在显示上一版：{edition.staleReason}</div>}
      {!edition.staleReason && edition.contentNotice && <div className="brief-stale-notice">{edition.contentNotice}</div>}
      <div className="brief-stream" ref={streamRef}>
        <div className="brief-stream-header-wrap">
          <Masthead edition={edition} onRefresh={onRefresh} refreshing={refreshing} />
          {edition.preview && <div className="brief-preview-notice">界面预览，桌面版使用实时来源</div>}
        </div>
        <div className="brief-stream-shell">
          <main className="brief-stream-main">
            {visibleStories.length ? (
              <>
                <StreamStoryCard layout="lead" story={visibleStories[0]} onOpenStory={openStory} />
                <div className="brief-stream-card-grid">
                  {visibleStories.slice(1, 4).map((story) => (
                    <StreamStoryCard key={storyKey(story)} story={story} onOpenStory={openStory} />
                  ))}
                </div>
                <div className="brief-stream-feed">
                  {visibleStories.slice(4).map((story, index) => (
                    <StreamStoryCard
                      key={storyKey(story)}
                      layout={index % 4 === 0 ? "wide" : "row"}
                      story={story}
                      onOpenStory={openStory}
                    />
                  ))}
                </div>
              </>
            ) : (
              <div className="brief-stream-empty">
                <h2>这个题材暂时没有新报道</h2>
                <p>继续刷新来源后，新事件会自动进入新闻流。</p>
              </div>
            )}
            <div className="brief-stream-loader" ref={loadMoreRef} aria-live="polite">
              <ArrowsClockwise className={refreshing ? "is-spinning" : ""} size={15} />
              <span>{refreshing ? "正在获取更多新闻" : "继续向下浏览"}</span>
            </div>
          </main>
          <BriefCategorySwitch activeCategory={activeCategory} onChange={changeCategory} />
        </div>
      </div>
      {selectedStory && (
        <ReportOverlay
          loading={reportLoading}
          onClose={closeStory}
          onOpenSource={onOpenSource}
          report={report}
          story={selectedStory}
        />
      )}
    </section>
  );
}
