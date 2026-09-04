export const SETTINGS_SECTIONS = [
  { id: "people", label: "您与 Brizo", keywords: "账号 个人资料 同步 服务 跨设备 导入书签 整理收藏夹" },
  { id: "smartBrowsing", label: "智能浏览", keywords: "收藏夹 浏览权重 排序 历史 导入 常用 自动 手动" },
  { id: "memory", label: "浏览记忆", keywords: "历史 导入 Chrome Edge Firefox 浏览器 常用网站 画像 偏好 Ask Use 地址栏 联想" },
  { id: "autofill", label: "自动填充和密码", keywords: "密码 密钥 通行密钥 付款方式 信用卡 会员卡 地址 身份 驾照 证件 护照 旅行 交通工具 购物 钱包 Gemini 登录信息 自动填充" },
  { id: "privacy", label: "隐私与安全", keywords: "删除浏览数据 历史 cookie 隐私保护指南 安全 HTTPS DNS 证书 网站设置 权限 页面清理 无痕" },
  { id: "performance", label: "性能", pending: true, keywords: "性能 问题提醒 闲置 标签页悬停 预览卡片 内存 省内存 节能 电源 预加载 活跃网站" },
  { id: "ai", label: "AI 创新功能", keywords: "AI DeepSeek 博查 API Key Pilot 技能 Google 搜索 历史记录 帮我写 Gemini 建议 内联提示 听写 设备端 更改密码" },
  { id: "appearance", label: "外观", keywords: "主题 工具栏 模式 主页 书签栏 置顶 文件夹 标签页 分组 搜索 纵向 侧边栏 悬停 预览图片 Ctrl Tab Everything 整理面板 字体 字号 缩放 横向满铺 窗口拆分" },
  { id: "search", label: "搜索引擎", keywords: "地址栏 搜索引擎 博查 Bing Google 网站搜索 管理搜索" },
  { id: "defaultBrowser", label: "默认浏览器", pending: true, keywords: "默认浏览器 链接" },
  { id: "onStartup", label: "起始页面", pending: true, keywords: "启动 登录计算机 新标签页 继续浏览 恢复网页 特定网页" },
  { id: "languages", label: "语言", pending: true, dividerBefore: true, keywords: "语言 添加语言 排序 显示 移除 翻译 拼写检查 基本 增强 自定义词典" },
  { id: "downloads", label: "下载内容", keywords: "下载 位置 文件夹 保存 询问 下载完成 自动打开 文件类型" },
  { id: "accessibility", label: "无障碍", pending: true, keywords: "实时字幕 实时翻译 字幕偏好 焦点 文本光标 图片说明 屏幕阅读器 滑动 剪贴板 确认消息" },
  { id: "system", label: "系统", pending: true, keywords: "后台应用 图形加速 功能通知 网站隔离 代理 设备端 AI" },
  { id: "reset", label: "重置设置", keywords: "重置 恢复 默认" },
  { id: "extensions", label: "扩展程序", pending: true, dividerBefore: true, keywords: "扩展 插件 应用商店" },
  { id: "help", label: "关于 Brizo", keywords: "关于 版本 Chromium Electron 更新 报告问题 帮助中心 隐私权政策 服务条款 组织管理" },
];

export const DEFAULT_APP_PREFERENCES = {
  autoFitZoom: false,
  downloadLocation: "",
  language: "zh-CN",
  pilotAssist: true,
  showBookmarksBar: true,
  showDownloadsWhenComplete: true,
  smartBookmarkSorting: true,
};

export const DEFAULT_SITE_HYGIENE_PREFERENCES = {
  cleanupLevel: "balanced",
  cookieConsent: "essential",
  credentialAutofill: true,
  enabled: true,
  siteOverrides: {},
};
