import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowsClockwise,
  Check,
  Clock,
  DotsThree,
  GearSix,
  Heart,
  LinkSimple,
  Minus,
  PushPin,
  ShieldCheck,
  X,
} from "@phosphor-icons/react";
import brizoLogoUrl from "../hermes logo.svg";

const PREVIEW_IMAGES = [
  "https://images.unsplash.com/photo-1578575437130-527eed3abbec?auto=format&fit=crop&w=1400&q=82",
  "https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=800&q=80",
  "https://images.unsplash.com/photo-1521295121783-8a321d551ad2?auto=format&fit=crop&w=800&q=80",
  "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=800&q=80",
  "https://images.unsplash.com/photo-1451187580459-43490279c0fa?auto=format&fit=crop&w=800&q=80",
];

const PREVIEW_SOURCE_SETS = [
  ["新华社", "https://www.news.cn/"],
  ["央视新闻", "https://news.cctv.com/"],
  ["界面新闻", "https://www.jiemian.com/"],
  ["澎湃新闻", "https://www.thepaper.cn/"],
  ["财新", "https://www.caixin.com/"],
  ["Reuters", "https://www.reuters.com/"],
  ["AP News", "https://apnews.com/"],
  ["BBC News", "https://www.bbc.com/news"],
  ["Nature", "https://www.nature.com/"],
];

function previewSources(seed = 0) {
  return Array.from({ length: 3 }, (_, index) => PREVIEW_SOURCE_SETS[(seed + index) % PREVIEW_SOURCE_SETS.length])
    .map(([title, url], index) => ({
    domain: new URL(url).hostname.replace(/^www\./, ""),
    id: `preview-source-${seed}-${index}`,
    snippet: "来自权威媒体与官方机构的公开报道；桌面版会通过 Serper News 实时检索并综合原始来源。",
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
      "大模型推理成本持续下降，智能体应用加速进入产业场景",
      "量子计算与经典超级计算机混合架构在科研领域取得新突破",
      "开源大模型生态蓬勃发展，挑战传统封闭商业模型垄断",
    ],
    summaries: [
      "多家科技企业与研究机构的公开信息显示，随着专用芯片架构升级与量化算法突破，AI 推理成本持续下降。越来越多的企业开始部署能够独立规划与执行工作流的智能体应用。",
      "国际顶级实验室联合发布报告，展示了量子加速器在药物分子筛选与复杂材料模拟中的实际成果，标志着混合计算正走向实用化阶段。",
      "最新的全球开发者调查表明，高水平开源模型的性能提升正在缩小与顶级商业模型的差距，越来越多的企业选择部署自建安全模型。",
    ],
  },
  {
    id: "business-finance",
    label: "商业与金融",
    weight: 0.16,
    headlines: [
      "全球半导体与算力供应链迎来新一轮区域化整合",
      "美联储与欧洲央行降息预期重构全球资本流动格局",
      "跨境电商与数字服务成为亚洲市场出口增长新引擎",
    ],
    summaries: [
      "多家权威媒体与行业机构的公开信息显示，受产业政策与供应链安全考量影响，全球半导体制造与高能耗 AI 数据中心正在加快区域化布局。企业开始更重视电力供给稳定性与供应链冗余。",
      "全球主要央行最新政策信号显示，利率走势的分化正引导国际资本重新流向新兴市场科技资产与债券市场。投资者正在密切评估企业盈利修复的实际节奏。",
      "亚洲主要经济体最新的贸易数据显示，云端软件、跨境电商与数字服务正在逐步替代传统制造业出口，成为推动区域经济回升的核心驱动力。",
    ],
  },
  {
    id: "international",
    label: "国际重要新闻",
    weight: 0.24,
    headlines: [
      "多边气候与能源峰会达成新框架：承诺加大绿色算力投资",
      "全球贸易规则重新谈判，聚焦数据跨境流动与人工智能治理",
      "欧洲科技法案生效，对人工智能透明度与合成内容提出强制要求",
    ],
    summaries: [
      "全球能源与环境峰会上，各国代表就绿色数据中心建设与清洁能源转型达成一致，计划在未来三年内追加数千亿美元基础设施投资。",
      "跨国贸易谈判代表在最新一轮会议中将数据安全与 AI 道德规范纳入核心条款，标志着全球数字经济治理正在进入新阶段。",
      "欧盟 AI 法案相关透明度条款正式施行，要求所有合成内容与智能体系统必须明确标识非人类身份，引发行业广泛关注与合规调整。",
    ],
  },
  {
    id: "domestic",
    label: "国内重要新闻",
    weight: 0.14,
    headlines: [
      "中国先进制造业支持政策加码：聚焦长板技术与产业集群",
      "多地推出青年科技人才培育计划与公共数字基础设施共享平台",
    ],
    summaries: [
      "国家最新发布的产业指南强调，将重点扶持高精尖制造、新能源及核心零部件领域，鼓励企业加大研发投入并深化产业链协同。",
      "地方政府出台一系列政策，向初创科技团队开放高性能算力资源与公共数据集，助力中小企业低成本进行技术创新。",
    ],
  },
  {
    id: "arts-culture",
    label: "艺术与文化",
    weight: 0.15,
    headlines: [
      "数字沉浸艺术与传统博物馆重塑全球公共文化空间",
      "跨国出版与影视制作展现新的全球化叙事与多元文化表达",
    ],
    summaries: [
      "全球顶级博物馆与艺术机构联合推出数字化展览，通过生成式技术还原历史艺术遗产，吸引新一代泛年轻人入场。",
      "国际电影节与出版行业最新趋势表明，非英语原版影视作品与文学翻译在国际流媒体平台上播放量持续创出历史新高。",
    ],
  },
  {
    id: "sports-entertainment",
    label: "体育与娱乐",
    weight: 0.14,
    headlines: [
      "全球体育科技投资提速：数据分析与智能转播重塑观赛体验",
      "流媒体平台版权竞争进入新阶段，聚焦顶级赛事直播与优质原创",
    ],
    summaries: [
      "体育科技资本正加速流向实时数据分析、球员健康预测以及多视角 AI 转播系统，提升全球观众的互动体验。",
      "各大娱乐流媒体巨头调整内容发行策略，通过独家体育赛事直播吸引高粘性订阅者，推动订阅模式多元化。",
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
      summary: topic.summaries[index] || "综合多家权威来源的公开报道，全球市场与科技产业正经历深层次调整。",
      topicId: topic.id,
      topicLabel: topic.label,
    })),
  );
  const frontStories = [
    makePreviewStory({
      headline: "全球半导体与算力供应链迎来新一轮区域化整合",
      id: "front-lead",
      index: 0,
      region: "国际",
      summary: "多家权威媒体与行业机构的公开信息显示，受产业政策与供应链安全考量影响，全球半导体制造与高能耗 AI 数据中心正在加快区域化布局。企业开始更重视电力供给稳定性与供应链冗余。",
      topicId: "business-finance",
      topicLabel: "商业与金融",
    }),
    makePreviewStory({
      headline: "中国先进制造业支持政策加码：聚焦长板技术与产业集群",
      id: "front-china",
      index: 6,
      region: "国内",
      summary: "国家最新发布的产业指南强调，将重点扶持高精尖制造、新能源及核心零部件领域，鼓励企业加大研发投入并深化产业链协同，建立长期竞争优势。",
      topicId: "domestic",
      topicLabel: "国内重要新闻",
    }),
    makePreviewStory({
      headline: "大模型推理成本持续下降，智能体应用加速进入产业场景",
      id: "front-world",
      index: 8,
      region: "国际",
      summary: "多家科技企业与研究机构的公开信息显示，随着专用芯片架构升级与量化算法突破，AI 推理成本持续下降。越来越多的企业开始部署能够独立规划与执行工作流的智能体应用。",
      topicId: "technology",
      topicLabel: "科学与技术",
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
    topics: PREVIEW_TOPIC_CONTENT.map(({ headlines: _headlines, summaries: _summaries, ...topic }) => topic),
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
      <Clock size={14} />
      <span>已发布 {relativeTime(story.publishedAt)}</span>
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
  const sourceAdapter = story.sources?.[0]?.sourceAdapter;
  const professionalRetrieval = sourceAdapter === "serper-news" ? 1.5 : sourceAdapter === "bocha-news" ? 0.75 : 0;
  const freshness = Math.max(0, 1 - ((Date.now() - Date.parse(story.publishedAt || 0)) / 86_400_000)) * 0.2;
  return pinned + reduced + professionalRetrieval + topicWeight * 3 + (Number(story.score) || 0) + freshness;
}

function StorySources({ story }) {
  const sources = story.sources || [];
  return (
    <div className="brief-stream-sources" aria-label={`${sources.length} 个来源`}>
      <span className="brief-source-stack" aria-hidden="true">
        {sources.slice(0, 3).map((source, index) => (
          <img
            alt=""
            key={`${source.url || source.domain}-${index}`}
            src={source.faviconUrl || `https://www.bing.com/favicon.ico?domain=${encodeURIComponent(source.domain || "")}`}
            referrerPolicy="no-referrer"
            onError={(event) => { event.currentTarget.hidden = true; }}
          />
        ))}
      </span>
      <span>{sources.length || 1} 个来源</span>
    </div>
  );
}

function StreamStoryCard({ story, layout = "card", onOpenStory }) {
  const storyFooter = (
    <footer className="brief-stream-story-footer">
      <StorySources story={story} />
      {layout === "card" && <StoryMeta story={story} />}
      <span className="brief-stream-story-actions" aria-hidden="true">
        <Heart size={17} />
        <DotsThree size={18} />
      </span>
    </footer>
  );
  return (
    <article className={`brief-stream-story brief-stream-story-${layout}`}>
      <button type="button" onClick={() => onOpenStory(story)}>
        <StoryImage story={story} />
        <span className="brief-stream-story-copy">
          <h2>{story.headline}</h2>
          {layout !== "card" && <StoryMeta story={story} />}
          <p>{storyExcerpt(story)}</p>
          {layout === "lead" && storyFooter}
        </span>
      </button>
      {layout !== "lead" && storyFooter}
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

function ReportOverlay({ loading, onClose, onOpenRelated, onOpenSource, relatedStories, report, story }) {
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
      <article className="brief-report-paper">
          {loading && (
            <div className="brief-report-live-status" role="status">
              <ArrowsClockwise className="is-spinning" size={15} />
              正在综合 {story.sources?.length || 1} 个来源，正文会自动更新
            </div>
          )}
          {report?.status === "error" && (
            <div className="brief-report-inline-error">综合正文暂时不可用：{report.message}</div>
          )}
          <div className="brief-report-kicker">{story.region} · {story.topicLabel}</div>
          <h1>{report?.headline || story.headline}</h1>
          <div className="brief-report-meta-row">
            <StoryMeta story={story} />
            <StorySources story={{ ...story, sources: report?.sources || story.sources }} />
          </div>
          <p className="brief-report-lead">
            <CitationText text={report?.lead || story.summary} sources={report?.sources || story.sources || []} onOpenSource={onOpenSource} />
          </p>
          <StoryImage className="brief-report-image" story={{ ...story, imageUrl: report?.imageUrl || story.imageUrl }} />
          <div className="brief-report-body is-article-body">
            {(report?.body || [report?.lead || story.summary]).map((text, index) => (
              <div key={`${index}-${text.slice(0, 20)}`}>
                <p>
                  <CitationText text={text} sources={report?.sources || story.sources || []} onOpenSource={onOpenSource} />
                </p>
                {index === 1 && report?.images?.[1] && (
                  <img className="brief-report-inline-image" src={report.images[1]} alt="" referrerPolicy="no-referrer" />
                )}
              </div>
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
          <section className="brief-report-related">
            <h2>相关新闻</h2>
            <div>
              {(report?.relatedStories || relatedStories || []).slice(0, 5).map((related) => (
                <button key={storyKey(related)} type="button" onClick={() => onOpenRelated(related)}>
                  <StoryImage story={related} />
                  <span>
                    <strong>{related.headline}</strong>
                    <p>{storyExcerpt(related)}</p>
                    <StoryMeta story={related} />
                  </span>
                </button>
              ))}
            </div>
          </section>
        </article>
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
        lead: story.summary,
        body: [
          story.summary,
          `根据上述权威来源的公开报道，${story.headline} 正引发产业界与相关机构的广泛讨论。多方信息显示，这项发展可能对技术演进、商业化落地与监管合规产生持续影响。[1]`,
          `在供应链与经营成本层面，企业正在面临多重结构性挑战。为了适应最新的竞争格局，业内领先的机构正在加快研发投入与产业布局重构，试图在保持效率的同时建立更高的安全防线。[2]`,
          `国际政策制定者与行业协会也相继对此发表看法，强调了透明度、数据合规以及跨区域协作的重要性。随之而来的监管新规将促使相关企业进一步规范治理体系。[3]`,
          `综合多方观察，未来半年内的市场表现与核心指标将成为检验这一趋势的关键。各方将持续关注后续的技术演进、战略并购及政策落地细节。[1][2]`,
        ],
        sources: story.sources,
        status: "success",
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

  const relatedStoriesForSelected = useMemo(() => {
    if (!selectedStory) return [];
    return rankedStories
      .filter((story) => storyKey(story) !== storyKey(selectedStory) && story.imageUrl)
      .map((story) => ({
        ...story,
        relatedScore: (story.topicId === selectedStory.topicId ? 1 : 0)
          + (story.region === selectedStory.region ? 0.15 : 0),
      }))
      .sort((left, right) => right.relatedScore - left.relatedScore
        || Date.parse(right.publishedAt || 0) - Date.parse(left.publishedAt || 0))
      .slice(0, 5)
      .map(({ relatedScore: _relatedScore, ...story }) => story);
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
