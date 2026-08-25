const LOCAL_IMAGE_PATTERN = /^(?:data:image\/(?:avif|gif|jpeg|png|webp);base64,|blob:)/iu;

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

export function createRendererImageLocalizer({ proxy, concurrency = 4, logger = console } = {}) {
  if (!proxy || typeof proxy.getDataUrl !== "function") {
    throw new TypeError("A main-process remote image proxy is required.");
  }
  const width = Math.max(1, Math.min(8, Number(concurrency) || 4));

  async function mapLimited(items, mapper) {
    const values = safeArray(items);
    const output = new Array(values.length);
    let cursor = 0;
    await Promise.all(Array.from({ length: Math.min(width, values.length) }, async () => {
      while (cursor < values.length) {
        const index = cursor;
        cursor += 1;
        output[index] = await mapper(values[index], index);
      }
    }));
    return output;
  }

  async function localizeUrlDetailed(value, options) {
    const url = String(value || "").trim();
    if (LOCAL_IMAGE_PATTERN.test(url)) return { dataUrl: url, errorCode: "" };
    if (!url.startsWith("https://")) return { dataUrl: "", errorCode: "url" };
    try {
      return { dataUrl: (await proxy.getDataUrl(url, options)).dataUrl || "", errorCode: "" };
    } catch (error) {
      return { dataUrl: "", errorCode: String(error?.code || "fetch") };
    }
  }

  async function localizeUrl(value, options) {
    return (await localizeUrlDetailed(value, options)).dataUrl;
  }

  async function localizeItem(item) {
    if (!item || typeof item !== "object") return item;
    const localized = await localizeUrl(item.imageUrl || item.thumbnailUrl || item.faviconUrl);
    return {
      ...item,
      ...(Object.hasOwn(item, "faviconUrl") ? { faviconUrl: localized } : {}),
      ...(Object.hasOwn(item, "imageUrl") || Object.hasOwn(item, "thumbnailUrl")
        ? { imageUrl: localized, thumbnailUrl: "" }
        : {}),
    };
  }

  async function localizeSearchCards(cards) {
    return await mapLimited(cards, async (group) => ({
      ...group,
      items: await mapLimited(group?.items, localizeItem),
    }));
  }

  async function localizeSearchImages(images) {
    // First try the small provider thumbnails across the verified reserve. Only
    // if fewer than three are readable do we start original-image requests.
    // Both waves are bounded and their transport is cancelled at the deadline.
    const items = safeArray(images);
    const thumbnailResults = await Promise.all(items.map((item) => {
      const thumbnailUrl = String(item?.thumbnailUrl || "").trim();
      return thumbnailUrl
        ? localizeUrlDetailed(thumbnailUrl, { timeoutMs: 2_500 })
        : { dataUrl: "", errorCode: "missing_thumbnail" };
    }));
    const localizedByIndex = thumbnailResults.map((item) => item.dataUrl);
    const errorCodes = thumbnailResults.map((item) => item.errorCode).filter(Boolean);
    if (localizedByIndex.filter(Boolean).length < 3) {
      const originals = await Promise.all(items.map((item, index) => {
        if (localizedByIndex[index]) return { dataUrl: "", errorCode: "" };
        const originalUrl = String(item?.imageUrl || "").trim();
        const thumbnailUrl = String(item?.thumbnailUrl || "").trim();
        return originalUrl && originalUrl !== thumbnailUrl
          ? localizeUrlDetailed(originalUrl, { timeoutMs: 3_800 })
          : { dataUrl: "", errorCode: "missing_original" };
      }));
      originals.forEach((result, index) => {
        if (!localizedByIndex[index] && result.dataUrl) localizedByIndex[index] = result.dataUrl;
        if (result.errorCode) errorCodes.push(result.errorCode);
      });
    }
    logger.info?.("[search-image-localization]", {
      candidates: items.length,
      readable: localizedByIndex.filter(Boolean).length,
      failures: Object.fromEntries([...new Set(errorCodes)].map((code) => [code, errorCodes.filter((item) => item === code).length])),
    });
    return items
      .map((item, index) => ({ ...item, imageUrl: localizedByIndex[index] || "", thumbnailUrl: "" }))
      .filter((item) => item?.imageUrl);
  }

  async function localizeSearchSources(sources) {
    return await mapLimited(sources, async (source) => ({
      ...source,
      imageUrl: await localizeUrl(source?.imageUrl),
    }));
  }

  async function localizeBriefStory(story, storyPromises) {
    if (!story || typeof story !== "object") return story;
    const key = String(story.id || story.url || story.headline || "");
    if (key && storyPromises.has(key)) return await storyPromises.get(key);
    const task = (async () => ({
      ...story,
      faviconUrl: await localizeUrl(story.faviconUrl),
      imageUrl: await localizeUrl(story.imageUrl),
      sources: await mapLimited(story.sources, async (source) => ({
        ...source,
        faviconUrl: await localizeUrl(source?.faviconUrl),
      })),
    }))();
    if (key) storyPromises.set(key, task);
    return await task;
  }

  async function localizeBriefEdition(edition) {
    if (!edition || typeof edition !== "object") return edition;
    const storyPromises = new Map();
    return {
      ...edition,
      pages: await mapLimited(edition.pages, async (page) => ({
        ...page,
        stories: await mapLimited(page?.stories, (story) => localizeBriefStory(story, storyPromises)),
        sections: await mapLimited(page?.sections, async (section) => ({
          ...section,
          stories: await mapLimited(section?.stories, (story) => localizeBriefStory(story, storyPromises)),
        })),
      })),
    };
  }

  async function localizeBriefReport(report) {
    if (!report || typeof report !== "object") return report;
    const storyPromises = new Map();
    const images = await mapLimited(report.images, localizeUrl);
    return {
      ...report,
      imageUrl: await localizeUrl(report.imageUrl),
      images: images.filter(Boolean),
      relatedStories: await mapLimited(
        report.relatedStories,
        (story) => localizeBriefStory(story, storyPromises),
      ),
      sources: await mapLimited(report.sources, async (source) => ({
        ...source,
        faviconUrl: await localizeUrl(source?.faviconUrl),
      })),
    };
  }

  return {
    localizeBriefEdition,
    localizeBriefReport,
    localizeSearchCards,
    localizeSearchImages,
    localizeSearchSources,
    localizeUrl,
  };
}
