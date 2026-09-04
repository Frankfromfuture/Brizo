import { getDomain } from "tldts";
import { memoryHost, memoryUrl, preferenceEligible } from "./browser-memory.mjs";

const count = value => Number.isFinite(Number(value)) ? Math.max(0, Math.floor(Number(value))) : 0;

export function bookmarkHistorySite(value) {
  const host = memoryHost(value);
  return host ? getDomain(host, { allowPrivateDomains: true }) || host : "";
}

function pageKey(value) {
  const normalized = memoryUrl(value);
  if (!normalized) return "";
  const url = new URL(normalized);
  return `${memoryHost(normalized)}${url.pathname.replace(/\/+$/, "") || "/"}${url.search}`;
}

export function createBookmarkVisitWeights(bookmarks, stored = {}, browserHistory = []) {
  const excluded = new Set(stored.excludedHosts || []);
  const eligible = url => preferenceEligible(url) && !excluded.has(memoryHost(url));
  const pages = new Map();
  const getPage = url => {
    const key = pageKey(url);
    if (!key || !eligible(url)) return null;
    if (!pages.has(key)) pages.set(key, { site: bookmarkHistorySite(url), host: memoryHost(url), imported: 0, local: 0, opens: 0 });
    return pages.get(key);
  };
  for (const row of stored.records || []) {
    const page = getPage(row.url);
    if (!page) continue;
    page.imported += count(row.importedVisits);
    page.local = Math.max(page.local, count(row.brizoVisits));
  }
  for (const row of browserHistory) {
    const page = getPage(row.url);
    if (page) page.local = Math.max(page.local, count(row.visits));
  }
  for (const bookmark of bookmarks) {
    const page = getPage(bookmark.url);
    if (page) page.opens = Math.max(page.opens, count(bookmark.openCount));
  }
  const siteTotals = new Map();
  const hostTotals = new Map();
  for (const page of pages.values()) {
    // Brizo's history, learned history and bookmark clicks can describe the
    // same visit. Preserve the largest local count, then add external history.
    page.total = page.imported + Math.max(page.local, page.opens);
    siteTotals.set(page.site, (siteTotals.get(page.site) || 0) + page.total);
    hostTotals.set(page.host, (hostTotals.get(page.host) || 0) + page.total);
  }
  return new Map(bookmarks.map(bookmark => {
    const normalized = memoryUrl(bookmark.url);
    if (!normalized || !eligible(normalized)) return [bookmark.url, 0];
    const url = new URL(normalized);
    const homepage = url.pathname === "/" && !url.search;
    const host = memoryHost(normalized);
    const site = bookmarkHistorySite(normalized);
    const total = host === site ? siteTotals.get(site) : hostTotals.get(host);
    return [bookmark.url, homepage ? total || 0 : pages.get(pageKey(normalized))?.total || 0];
  }));
}
