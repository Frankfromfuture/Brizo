import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const DEFAULT_CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export function createAdblockManager({
  cachePath,
  cacheMaxAgeMs = DEFAULT_CACHE_MAX_AGE_MS,
  fetchImpl,
  importEngine = () => import("@ghostery/adblocker"),
  now = () => Date.now(),
} = {}) {
  let api = null;
  let blocker = null;
  let loadPromise = null;
  let lastError = "";
  let blockedCount = 0;

  const resolveCachePath = () => typeof cachePath === "function" ? cachePath() : cachePath;

  async function readFreshCache(filePath) {
    const details = await stat(filePath);
    if (now() - details.mtimeMs > cacheMaxAgeMs) {
      const error = new Error("adblock cache is stale");
      error.code = "STALE_ADBLOCK_CACHE";
      throw error;
    }
    return await readFile(filePath);
  }

  async function writeCache(filePath, data) {
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, data, { mode: 0o600 });
  }

  async function load() {
    if (blocker) return blocker;
    if (loadPromise) return loadPromise;
    loadPromise = (async () => {
      api = await importEngine();
      const filePath = resolveCachePath();
      if (!filePath) throw new Error("adblock cache path is unavailable");
      try {
        blocker = await api.FiltersEngine.fromPrebuiltAdsAndTracking(fetchImpl, {
          path: filePath,
          read: readFreshCache,
          write: writeCache,
        });
      } catch (error) {
        // A stale compiled ruleset is safer than silently dropping protection
        // during a transient list-update outage.
        try {
          blocker = api.FiltersEngine.deserialize(new Uint8Array(await readFile(filePath)));
        } catch {
          throw error;
        }
      }
      lastError = "";
      return blocker;
    })().catch((error) => {
      lastError = error instanceof Error ? error.message : String(error);
      loadPromise = null;
      throw error;
    });
    return loadPromise;
  }

  function match(details) {
    if (!blocker || !api || !details || details.resourceType === "mainFrame") return null;
    try {
      const request = api.Request.fromRawDetails({
        _originalRequestDetails: details,
        requestId: String(details.id || details.requestId || ""),
        sourceUrl: details.referrer || details.pageUrl || "",
        tabId: Number(details.webContentsId) || 0,
        type: details.resourceType || "other",
        url: details.url,
      });
      if (blocker.config?.guessRequestTypeFromUrl === true && request.type === "other") {
        request.guessTypeOfRequest();
      }
      const result = blocker.match(request);
      if (result?.redirect?.dataUrl) {
        blockedCount += 1;
        return { redirectURL: result.redirect.dataUrl };
      }
      if (result?.match) {
        blockedCount += 1;
        return { cancel: true };
      }
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    return null;
  }

  return {
    load,
    match,
    status: () => ({
      blockedCount,
      error: lastError,
      ready: Boolean(blocker),
    }),
  };
}
