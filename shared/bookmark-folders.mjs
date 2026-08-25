export const CHROMIUM_BOOKMARK_ROOT_LABELS = Object.freeze({
  bookmark_bar: "书签栏",
  other: "其他书签",
  synced: "移动设备书签",
});

function canonicalRootFolder(value) {
  const normalized = String(value || "")
    .normalize("NFKC")
    .trim()
    .toLocaleLowerCase()
    .replace(/[\s_-]+/g, "");

  if ([
    "bookmarksbar",
    "bookmarkbar",
    "favoritesbar",
    "favoritebar",
    "favouritesbar",
    "favouritebar",
    "书签栏",
    "收藏夹栏",
    "收藏栏",
  ].includes(normalized)) return "书签栏";
  if (["otherbookmarks", "otherbookmark", "其他书签"].includes(normalized)) {
    return "其他书签";
  }
  if ([
    "mobilebookmarks",
    "syncedbookmarks",
    "mobilebookmark",
    "移动设备书签",
    "移动书签",
  ].includes(normalized)) {
    return "移动设备书签";
  }
  return String(value || "").normalize("NFKC").replace(/\s+/g, " ").trim();
}

export function getChromiumBookmarkRootLabel(rootName, nodeName = "") {
  return CHROMIUM_BOOKMARK_ROOT_LABELS[rootName]
    || canonicalRootFolder(nodeName)
    || "未分类";
}

export function normalizeImportedBookmarkFolder(folder) {
  const rawParts = String(folder || "")
    .split("/")
    .map(canonicalRootFolder)
    .filter(Boolean);
  const parts = [];
  for (const part of rawParts) {
    if (parts.at(-1) !== part) parts.push(part);
  }

  // “书签栏” is structural in Brizo: display its contents directly at the root.
  if (parts[0] === "书签栏") {
    parts.shift();
  }
  return parts.join(" / ");
}

export function getDefaultBookmarkFaviconUrl(pageUrl) {
  try {
    const url = new URL(String(pageUrl || ""));
    if (!["http:", "https:"].includes(url.protocol)) return "";
    return new URL("/favicon.ico", url.origin).href;
  } catch {
    return "";
  }
}

function normalizeBookmarkFaviconUrl(value, pageUrl) {
  const faviconUrl = String(value || "").trim();
  if (/bing\.com\/favicon\.ico/i.test(faviconUrl)) return "";
  if (
    /^https?:\/\//i.test(faviconUrl)
    || (faviconUrl.length <= 50_000 && /^data:image\//i.test(faviconUrl))
  ) {
    return faviconUrl;
  }
  return "";
}

export function normalizeImportedBookmark(bookmark) {
  const createdAt = Number(bookmark?.createdAt);
  const openCount = Number(bookmark?.openCount);
  const smartPromotionSeenAt = Number(bookmark?.smartPromotionSeenAt);
  const updatedAt = Number(bookmark?.updatedAt);
  const sourceOrder = Number(bookmark?.sourceOrder);
  const manualOrder = bookmark?.manualOrder == null ? Number.NaN : Number(bookmark.manualOrder);
  return {
    ...bookmark,
    createdAt: Number.isFinite(createdAt) && createdAt > 0 ? createdAt : 0,
    faviconUrl: normalizeBookmarkFaviconUrl(bookmark?.faviconUrl, bookmark?.url),
    folder: normalizeImportedBookmarkFolder(bookmark?.folder),
    manualOrder: Number.isFinite(manualOrder) && manualOrder >= 0 ? manualOrder : null,
    openCount: Number.isFinite(openCount) && openCount > 0 ? Math.floor(openCount) : 0,
    sourceOrder: Number.isFinite(sourceOrder) && sourceOrder >= 0 ? sourceOrder : 0,
    smartPromotionSeenAt: Number.isFinite(smartPromotionSeenAt) && smartPromotionSeenAt > 0
      ? smartPromotionSeenAt
      : 0,
    updatedAt: Number.isFinite(updatedAt) && updatedAt > 0 ? updatedAt : 0,
  };
}
