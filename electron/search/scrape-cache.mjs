import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import { canonicalizeUrl } from "../../shared/search-text.mjs";

const DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1_000;

export function createScrapeCache({
  filePath,
  now = Date.now,
  ttlMs = DEFAULT_TTL_MS,
  maxEntries = 500,
  logger = console,
}) {
  let loaded = false;
  let entries = new Map();
  let writeQueue = Promise.resolve();

  const load = async () => {
    if (loaded) return;
    loaded = true;
    try {
      const parsed = JSON.parse(await readFile(filePath, "utf8"));
      entries = new Map((Array.isArray(parsed?.entries) ? parsed.entries : [])
        .filter(([key, value]) => key && value?.fetchedAt));
    } catch {
      entries = new Map();
    }
  };

  const persist = () => {
    writeQueue = writeQueue.then(async () => {
      await mkdir(path.dirname(filePath), { recursive: true });
      const temporary = `${filePath}.tmp`;
      await writeFile(temporary, JSON.stringify({ version: 1, entries: [...entries] }), { mode: 0o600 });
      await rename(temporary, filePath);
    }).catch((error) => logger.warn?.("[scrape-cache]", error?.message || error));
    return writeQueue;
  };

  return {
    async get(rawUrl) {
      await load();
      const key = canonicalizeUrl(rawUrl);
      const value = entries.get(key);
      if (!value) return null;
      if (now() - Date.parse(value.fetchedAt) > ttlMs) {
        entries.delete(key);
        persist();
        return null;
      }
      entries.delete(key);
      entries.set(key, { ...value, lastUsedAt: new Date(now()).toISOString() });
      return value;
    },

    async set(rawUrl, value) {
      await load();
      const key = canonicalizeUrl(rawUrl);
      if (!key || !value) return;
      entries.delete(key);
      entries.set(key, {
        markdown: String(value.markdown || ""),
        text: String(value.text || ""),
        metadata: value.metadata && typeof value.metadata === "object" ? value.metadata : {},
        fetchedAt: new Date(now()).toISOString(),
        lastUsedAt: new Date(now()).toISOString(),
      });
      while (entries.size > maxEntries) entries.delete(entries.keys().next().value);
      await persist();
    },

    async flush() {
      await writeQueue;
    },
  };
}
