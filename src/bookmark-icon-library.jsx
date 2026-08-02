import {
  Airplane,
  Archive,
  Article,
  Atom,
  Baby,
  Bank,
  Bed,
  Bicycle,
  BookOpen,
  BookmarkSimple,
  Books,
  Brain,
  Briefcase,
  Broadcast,
  Buildings,
  Calculator,
  Calendar,
  Camera,
  Car,
  ChartBar,
  ChartLine,
  ChatCircle,
  Clock,
  CloudSun,
  Code,
  Coffee,
  Coins,
  Compass,
  Cpu,
  CurrencyDollar,
  Database,
  Dna,
  EnvelopeSimple,
  FileText,
  FirstAid,
  Flask,
  FolderSimple,
  ForkKnife,
  GameController,
  Gear,
  Gift,
  Globe,
  GlobeHemisphereWest,
  GraduationCap,
  Headphones,
  Heart,
  House,
  Image,
  Leaf,
  Lightbulb,
  LinkSimple,
  Lock,
  MagnifyingGlass,
  MapPin,
  Megaphone,
  Microphone,
  Mountains,
  MusicNote,
  Newspaper,
  Palette,
  PawPrint,
  PencilSimple,
  Phone,
  Plant,
  PresentationChart,
  Robot,
  Rocket,
  ShieldCheck,
  ShoppingBag,
  Smiley,
  Sparkle,
  SquaresFour,
  Star,
  Storefront,
  Tag,
  Terminal,
  Train,
  Tree,
  TrendUp,
  User,
  Users,
  Video,
  Wrench,
} from "@phosphor-icons/react";

const icon = (id, label, labelZh, category, Icon, keywords = [], legacy = false) => ({
  category,
  Icon,
  id,
  keywords,
  label,
  labelZh,
  legacy,
});

export const BOOKMARK_ICON_LIBRARY = [
  icon("research", "Research", "研究", "knowledge", SquaresFour, ["papers", "sources"], true),
  icon("ai", "Artificial intelligence", "人工智能", "technology", Brain, ["machine learning", "model"], true),
  icon("biotech", "Biotechnology", "生物科技", "science", Leaf, ["biology", "life science"], true),
  icon("climate", "Climate", "气候", "science", GlobeHemisphereWest, ["earth", "environment"], true),
  icon("space", "Space", "航天", "science", Rocket, ["aerospace", "launch"], true),
  icon("design", "Design", "设计", "creative", PencilSimple, ["drawing", "edit"], true),

  icon("reading", "Reading", "阅读", "knowledge", BookOpen, ["book", "read"]),
  icon("library", "Library", "书库", "knowledge", Books, ["books", "collection"]),
  icon("article", "Article", "文章", "knowledge", Article, ["essay", "post"]),
  icon("news", "News", "新闻", "knowledge", Newspaper, ["media", "current affairs"]),
  icon("education", "Education", "教育", "knowledge", GraduationCap, ["course", "school"]),
  icon("idea", "Ideas", "灵感", "knowledge", Lightbulb, ["insight", "inspiration"]),
  icon("document", "Documents", "文档", "knowledge", FileText, ["file", "text"]),
  icon("presentation", "Presentations", "演示", "knowledge", PresentationChart, ["slides", "deck"]),
  icon("bookmark", "Bookmarks", "收藏", "knowledge", BookmarkSimple, ["saved", "favorite"]),
  icon("folder", "Folder", "文件夹", "knowledge", FolderSimple, ["directory", "collection"]),
  icon("archive", "Archive", "归档", "knowledge", Archive, ["storage", "history"]),
  icon("link", "Links", "链接", "knowledge", LinkSimple, ["url", "web"]),
  icon("search", "Search", "搜索", "knowledge", MagnifyingGlass, ["find", "query"]),
  icon("tag", "Tags", "标签", "knowledge", Tag, ["label", "topic"]),

  icon("science", "Science", "科学", "science", Flask, ["experiment", "lab"]),
  icon("physics", "Physics", "物理", "science", Atom, ["quantum", "particle"]),
  icon("genetics", "Genetics", "基因", "science", Dna, ["genome", "bioinformatics"]),
  icon("medicine", "Medicine", "医疗", "science", FirstAid, ["health", "clinical"]),
  icon("environment", "Environment", "环境", "science", Plant, ["sustainability", "green"]),
  icon("nature", "Nature", "自然", "science", Tree, ["forest", "ecology"]),
  icon("weather", "Weather", "天气", "science", CloudSun, ["forecast", "meteorology"]),
  icon("geography", "Geography", "地理", "science", Globe, ["world", "location"]),
  icon("mountains", "Outdoors", "户外", "science", Mountains, ["hiking", "landscape"]),

  icon("code", "Programming", "编程", "technology", Code, ["developer", "software"]),
  icon("terminal", "Developer tools", "开发工具", "technology", Terminal, ["cli", "shell"]),
  icon("robotics", "Robotics", "机器人", "technology", Robot, ["automation", "hardware"]),
  icon("computing", "Computing", "计算机", "technology", Cpu, ["chip", "processor"]),
  icon("data", "Data", "数据", "technology", Database, ["database", "storage"]),
  icon("settings", "Settings", "设置", "technology", Gear, ["configuration", "preferences"]),
  icon("tools", "Tools", "工具", "technology", Wrench, ["utility", "maintenance"]),
  icon("security", "Security", "安全", "technology", ShieldCheck, ["privacy", "protection"]),
  icon("private", "Private", "隐私", "technology", Lock, ["secure", "confidential"]),

  icon("business", "Business", "商业", "business", Briefcase, ["work", "company"]),
  icon("companies", "Companies", "公司", "business", Buildings, ["enterprise", "organization"]),
  icon("finance", "Finance", "金融", "business", CurrencyDollar, ["money", "market"]),
  icon("banking", "Banking", "银行", "business", Bank, ["financial institution", "credit"]),
  icon("investing", "Investing", "投资", "business", TrendUp, ["stocks", "growth"]),
  icon("assets", "Assets", "资产", "business", Coins, ["capital", "wealth"]),
  icon("analytics", "Analytics", "分析", "business", ChartLine, ["metrics", "trend"]),
  icon("reports", "Reports", "报告", "business", ChartBar, ["dashboard", "statistics"]),
  icon("calculation", "Calculation", "计算", "business", Calculator, ["numbers", "math"]),

  icon("art", "Art", "艺术", "creative", Palette, ["painting", "color"]),
  icon("photography", "Photography", "摄影", "creative", Camera, ["photo", "camera"]),
  icon("images", "Images", "图片", "creative", Image, ["gallery", "visual"]),
  icon("music", "Music", "音乐", "creative", MusicNote, ["song", "audio"]),
  icon("video", "Video", "视频", "creative", Video, ["film", "movie"]),
  icon("audio", "Audio", "音频", "creative", Headphones, ["podcast", "listening"]),
  icon("gaming", "Games", "游戏", "creative", GameController, ["play", "esports"]),
  icon("favorites", "Favorites", "喜爱", "creative", Star, ["featured", "top"]),
  icon("magic", "Smart", "智能", "creative", Sparkle, ["ai organize", "automatic"]),

  icon("travel", "Travel", "旅行", "lifestyle", Airplane, ["flight", "trip"]),
  icon("places", "Places", "地点", "lifestyle", MapPin, ["map", "location"]),
  icon("navigation", "Navigation", "导航", "lifestyle", Compass, ["direction", "explore"]),
  icon("cycling", "Cycling", "骑行", "lifestyle", Bicycle, ["bike", "sport"]),
  icon("driving", "Driving", "驾车", "lifestyle", Car, ["auto", "vehicle"]),
  icon("rail", "Rail travel", "铁路", "lifestyle", Train, ["transit", "transport"]),
  icon("hotels", "Hotels", "酒店", "lifestyle", Bed, ["stay", "accommodation"]),
  icon("food", "Food", "美食", "lifestyle", ForkKnife, ["restaurant", "dining"]),
  icon("coffee", "Coffee", "咖啡", "lifestyle", Coffee, ["cafe", "drink"]),
  icon("shopping", "Shopping", "购物", "lifestyle", ShoppingBag, ["commerce", "buy"]),
  icon("stores", "Stores", "商店", "lifestyle", Storefront, ["retail", "shop"]),
  icon("gifts", "Gifts", "礼物", "lifestyle", Gift, ["present", "celebration"]),

  icon("personal", "Personal", "个人", "personal", User, ["profile", "me"]),
  icon("people", "People", "人物", "personal", Users, ["team", "community"]),
  icon("home", "Home", "家庭", "personal", House, ["household", "family"]),
  icon("wellbeing", "Wellbeing", "身心健康", "personal", Heart, ["health", "wellness"]),
  icon("family", "Family", "亲子", "personal", Baby, ["children", "parenting"]),
  icon("pets", "Pets", "宠物", "personal", PawPrint, ["animals", "care"]),
  icon("fun", "Fun", "娱乐", "personal", Smiley, ["happy", "leisure"]),
  icon("calendar", "Calendar", "日程", "personal", Calendar, ["date", "schedule"]),
  icon("later", "Read later", "稍后阅读", "personal", Clock, ["queue", "time"]),
  icon("email", "Email", "邮件", "communication", EnvelopeSimple, ["inbox", "message"]),
  icon("chat", "Chat", "聊天", "communication", ChatCircle, ["conversation", "community"]),
  icon("phone", "Phone", "电话", "communication", Phone, ["call", "contact"]),
  icon("marketing", "Marketing", "营销", "communication", Megaphone, ["promotion", "campaign"]),
  icon("broadcast", "Broadcast", "播客与直播", "communication", Broadcast, ["stream", "radio"]),
  icon("microphone", "Voice", "语音", "communication", Microphone, ["recording", "speech"]),
];

export const ORIGINAL_BOOKMARK_ICON_IDS = [
  "research",
  "ai",
  "biotech",
  "climate",
  "space",
  "design",
];

const iconById = new Map(BOOKMARK_ICON_LIBRARY.map((definition) => [definition.id, definition]));

export function getBookmarkIconDefinition(id) {
  return iconById.get(id) || iconById.get("folder");
}

export function findBookmarkIcons(query) {
  const normalized = String(query || "").trim().toLocaleLowerCase();
  if (!normalized) return BOOKMARK_ICON_LIBRARY;
  return BOOKMARK_ICON_LIBRARY.filter((definition) =>
    [
      definition.id,
      definition.label,
      definition.labelZh,
      definition.category,
      ...definition.keywords,
    ].some((value) => value.toLocaleLowerCase().includes(normalized)),
  );
}

export function BookmarkSemanticIcon({ active = false, id, size = 18 }) {
  const definition = getBookmarkIconDefinition(id);
  const Icon = definition.Icon;
  return (
    <span
      className={`bookmark-semantic-icon ${active ? "is-active" : ""}`}
      aria-hidden="true"
      data-icon-id={definition.id}
    >
      <Icon className="bookmark-icon-outline" size={size} weight="regular" />
      <Icon className="bookmark-icon-fill" size={size} weight="fill" />
    </span>
  );
}

export function BookmarkIconPreview({ bookmarkCount = 0 }) {
  return (
    <>
      <div className="bookmark-icon-preview" aria-label="Reserved semantic bookmark icons">
        {ORIGINAL_BOOKMARK_ICON_IDS.map((iconId) => {
          const definition = getBookmarkIconDefinition(iconId);
          return (
            <span
              className="bookmark-icon-option"
              key={iconId}
              role="img"
              aria-label={`${definition.labelZh} · ${definition.label}`}
              title={`${definition.labelZh} · ${definition.label}`}
            >
              <BookmarkSemanticIcon id={iconId} />
            </span>
          );
        })}
      </div>
      <small>
        {bookmarkCount} bookmarks · {BOOKMARK_ICON_LIBRARY.length} named icons ready
      </small>
    </>
  );
}
