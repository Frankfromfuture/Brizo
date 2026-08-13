import { DatabaseSync } from "node:sqlite";
import { copyFile, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const CHROMIUM_EPOCH_OFFSET_MS = 11_644_473_600_000;
const SAFARI_EPOCH_OFFSET_MS = 978_307_200_000;

function canonicalHistoryUrl(value) {
  try {
    const url = new URL(String(value || ""));
    if (!["http:", "https:"].includes(url.protocol)) return "";
    url.hash = "";
    url.hostname = url.hostname.toLowerCase().replace(/^www\./, "");
    if (url.pathname !== "/") url.pathname = url.pathname.replace(/\/+$/, "");
    return url.href;
  } catch {
    return "";
  }
}

function historyQueryUrl(value) {
  try {
    const url = new URL(String(value || ""));
    if (!["http:", "https:"].includes(url.protocol)) return "";
    url.hash = "";
    return url.href;
  } catch {
    return "";
  }
}

function chromiumTimestamp(value) {
  const micros = Number(value);
  return Number.isFinite(micros) && micros > 0 ? Math.max(0, Math.round(micros / 1_000 - CHROMIUM_EPOCH_OFFSET_MS)) : 0;
}

function safariTimestamp(value) {
  const seconds = Number(value);
  return Number.isFinite(seconds) && seconds > 0 ? Math.round(seconds * 1_000 + SAFARI_EPOCH_OFFSET_MS) : 0;
}

function mergeRows(target, rows, timestampReader) {
  for (const row of rows) {
    const url = canonicalHistoryUrl(row.url);
    if (!url) continue;
    const current = target.get(url) || { lastVisitedAt: 0, url, visits: 0 };
    target.set(url, {
      lastVisitedAt: Math.max(current.lastVisitedAt, timestampReader(row.last_visit_time)),
      url,
      visits: Math.max(current.visits, Math.max(0, Number(row.visit_count) || 0)),
    });
  }
}

async function queryCopiedDatabase(filePath, query) {
  const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "brizo-bookmark-history-"));
  const copiedPath = path.join(temporaryDirectory, "History.sqlite");
  try {
    await copyFile(filePath, copiedPath);
    const database = new DatabaseSync(copiedPath, { readOnly: true });
    try {
      return query(database);
    } finally {
      database.close();
    }
  } finally {
    await rm(temporaryDirectory, { force: true, recursive: true }).catch(() => {});
  }
}

function queryInBatches(database, sqlForSize, urls) {
  const rows = [];
  for (let index = 0; index < urls.length; index += 300) {
    const batch = urls.slice(index, index + 300);
    if (!batch.length) continue;
    const statement = database.prepare(sqlForSize(batch.length));
    statement.setReadBigInts(true);
    rows.push(...statement.all(...batch));
  }
  return rows;
}

export async function readChromiumVisitWeights(historyFiles, bookmarkUrls) {
  const urls = [...new Set(bookmarkUrls.map(historyQueryUrl).filter(Boolean))];
  const merged = new Map();
  for (const filePath of historyFiles || []) {
    try {
      const rows = await queryCopiedDatabase(filePath, (database) => queryInBatches(
        database,
        (size) => `SELECT url, visit_count, last_visit_time FROM urls WHERE url IN (${Array(size).fill("?").join(",")})`,
        urls,
      ));
      mergeRows(merged, rows, chromiumTimestamp);
    } catch {
      // A browser profile may be protected or use an incompatible schema.
    }
  }
  return [...merged.values()];
}

export async function readSafariVisitWeights(historyFiles, bookmarkUrls) {
  const urls = [...new Set(bookmarkUrls.map(historyQueryUrl).filter(Boolean))];
  const merged = new Map();
  for (const filePath of historyFiles || []) {
    try {
      const rows = await queryCopiedDatabase(filePath, (database) => queryInBatches(
        database,
        (size) => `
          SELECT history_items.url AS url,
                 COUNT(history_visits.id) AS visit_count,
                 MAX(history_visits.visit_time) AS last_visit_time
          FROM history_items
          JOIN history_visits ON history_visits.history_item = history_items.id
          WHERE history_items.url IN (${Array(size).fill("?").join(",")})
          GROUP BY history_items.url
        `,
        urls,
      ));
      mergeRows(merged, rows, safariTimestamp);
    } catch {
      // Safari commonly requires extra filesystem permission; degrade locally.
    }
  }
  return [...merged.values()];
}

export function mergeSourceVisitWeights(groups = []) {
  const merged = new Map();
  for (const entries of groups) {
    for (const entry of entries || []) {
      const url = canonicalHistoryUrl(entry?.url);
      if (!url) continue;
      const current = merged.get(url) || { lastVisitedAt: 0, url, visits: 0 };
      merged.set(url, {
        lastVisitedAt: Math.max(current.lastVisitedAt, Number(entry?.lastVisitedAt) || 0),
        url,
        visits: Math.max(current.visits, Number(entry?.visits) || 0),
      });
    }
  }
  return [...merged.values()];
}
