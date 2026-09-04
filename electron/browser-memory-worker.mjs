import { parentPort, workerData } from "node:worker_threads";
import { DatabaseSync, backup } from "node:sqlite";
import { mkdir, readdir, readFile, access, mkdtemp, rm, chmod } from "node:fs/promises";
import { createHash } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { memoryUrl, memoryHost, preferenceEligible, topicsFor, queryWords, preferenceScore, hasExplicitSiteTarget } from "../shared/browser-memory.mjs";
import { bookmarkHistorySite } from "../shared/bookmark-visit-weights.mjs";

await mkdir(path.dirname(workerData.storePath), { recursive: true });
const db = new DatabaseSync(workerData.storePath);
await chmod(workerData.storePath, 0o600).catch(() => {});
db.exec(`PRAGMA journal_mode = WAL;
  PRAGMA busy_timeout = 3000;
  CREATE TABLE IF NOT EXISTS pages (
    source TEXT NOT NULL, url TEXT NOT NULL, title TEXT NOT NULL, host TEXT NOT NULL,
    visits INTEGER NOT NULL, last_visit INTEGER NOT NULL, eligible INTEGER NOT NULL,
    PRIMARY KEY(source, url));
  CREATE INDEX IF NOT EXISTS pages_host ON pages(host);
  CREATE INDEX IF NOT EXISTS pages_recent ON pages(last_visit DESC);
  CREATE TABLE IF NOT EXISTS visits (
    source TEXT NOT NULL, visit_id TEXT NOT NULL, url TEXT NOT NULL, visited_at INTEGER NOT NULL,
    PRIMARY KEY(source, visit_id));
  CREATE INDEX IF NOT EXISTS visits_recent ON visits(visited_at DESC);
  CREATE TABLE IF NOT EXISTS sources (id TEXT PRIMARY KEY, name TEXT NOT NULL, imported_at INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS excluded (host TEXT PRIMARY KEY);`);
let siteCache = null;
const cleanTitle = (title, url) => String(title || memoryHost(url)).replace(/\s+/g, " ").trim().slice(0, 500);
const exists = async file => { try { await access(file); return true; } catch { return false; } };
const directories = async root => { try { return (await readdir(root, { withFileTypes: true })).filter(item => item.isDirectory()).map(item => item.name); } catch { return []; } };
const epoch = value => Math.max(0, typeof value === "bigint"
  ? Number(value / 1000n - 11644473600000n)
  : Math.round(Number(value) / 1000 - 11644473600000));

async function detectSources() {
  const home = os.homedir();
  const mac = path.join(home, "Library", "Application Support");
  const win = process.env.LOCALAPPDATA || path.join(home, "AppData", "Local");
  const linux = process.env.XDG_CONFIG_HOME || path.join(home, ".config");
  const definitions = [
    ["chrome", "Google Chrome", [mac, "Google/Chrome"], [win, "Google/Chrome/User Data"], [linux, "google-chrome"]],
    ["edge", "Microsoft Edge", [mac, "Microsoft Edge"], [win, "Microsoft/Edge/User Data"], [linux, "microsoft-edge"]],
    ["brave", "Brave", [mac, "BraveSoftware/Brave-Browser"], [win, "BraveSoftware/Brave-Browser/User Data"], [linux, "BraveSoftware/Brave-Browser"]],
    ["chromium", "Chromium", [mac, "Chromium"], [win, "Chromium/User Data"], [linux, "chromium"]],
    ["vivaldi", "Vivaldi", [mac, "Vivaldi"], [win, "Vivaldi/User Data"], [linux, "vivaldi"]],
    ["arc", "Arc", [mac, "Arc/User Data"], null, null],
  ];
  const sources = [];
  for (const [browser, name, macRoot, winRoot, linuxRoot] of definitions) {
    const parts = process.platform === "darwin" ? macRoot : process.platform === "win32" ? winRoot : linuxRoot;
    if (!parts) continue;
    const root = path.join(...parts);
    let profiles = {};
    try { profiles = JSON.parse(await readFile(path.join(root, "Local State"), "utf8")).profile?.info_cache || {}; } catch {}
    for (const profile of await directories(root)) {
      const file = path.join(root, profile, "History");
      if (!await exists(file)) continue;
      sources.push({ id: createHash("sha256").update(file).digest("hex").slice(0, 24), browser, name: `${name} · ${profiles[profile]?.name || profile}`, file, format: "chromium" });
    }
  }
  const firefoxRoot = process.platform === "darwin" ? path.join(mac, "Firefox/Profiles")
    : process.platform === "win32" ? path.join(process.env.APPDATA || path.join(home, "AppData/Roaming"), "Mozilla/Firefox/Profiles") : path.join(home, ".mozilla/firefox");
  for (const profile of await directories(firefoxRoot)) {
    const file = path.join(firefoxRoot, profile, "places.sqlite");
    if (await exists(file)) sources.push({ id: createHash("sha256").update(file).digest("hex").slice(0, 24), browser: "firefox", name: `Firefox · ${profile}`, file, format: "firefox" });
  }
  return sources;
}

const upsertPage = db.prepare(`INSERT INTO pages VALUES (?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(source, url) DO UPDATE SET
    title = CASE WHEN excluded.last_visit >= pages.last_visit THEN excluded.title ELSE pages.title END,
    visits = MAX(pages.visits, excluded.visits), last_visit = MAX(pages.last_visit, excluded.last_visit), eligible = excluded.eligible`);
const addVisit = db.prepare("INSERT OR IGNORE INTO visits VALUES (?, ?, ?, ?)");

async function importSources(ids, notify) {
  const available = await detectSources();
  const selected = available.filter(source => Array.isArray(ids) && ids.includes(source.id));
  if (!selected.length) throw new Error("没有选中可读取的浏览器配置，请刷新列表后重试。");
  const errors = [];
  let addedPages = 0;
  let addedVisits = 0;
  for (let index = 0; index < selected.length; index++) {
    const source = selected[index];
    notify({ message: `正在导入 ${source.name}`, current: index + 1, total: selected.length });
    const temp = await mkdtemp(path.join(os.tmpdir(), "brizo-history-"));
    let original;
    let snapshot;
    let transaction = false;
    try {
      // SQLite backup captures a consistent snapshot, including WAL, without
      // closing the other browser or copying cookies / login databases.
      original = new DatabaseSync(source.file, { readOnly: true });
      original.exec("PRAGMA busy_timeout = 3000; PRAGMA query_only = ON;");
      const file = path.join(temp, "history.sqlite");
      await backup(original, file);
      original.close(); original = null;
      snapshot = new DatabaseSync(file, { readOnly: true });
      const beforePages = db.prepare("SELECT COUNT(*) AS n FROM pages WHERE source = ?").get(source.id).n;
      const beforeVisits = db.prepare("SELECT COUNT(*) AS n FROM visits WHERE source = ?").get(source.id).n;
      const rows = source.format === "firefox"
        ? "SELECT url, title, visit_count, last_visit_date AS last_visit_time FROM moz_places"
        : "SELECT url, title, visit_count, last_visit_time FROM urls";
      db.exec("BEGIN IMMEDIATE"); transaction = true;
      let processed = 0;
      const pageRows = snapshot.prepare(rows);
      // Chromium's microseconds since 1601 exceed Number.MAX_SAFE_INTEGER.
      // SQLite must return int64 values losslessly before conversion to ms.
      pageRows.setReadBigInts(true);
      for (const row of pageRows.iterate()) {
        const url = memoryUrl(row.url);
        if (!url) continue;
        const lastVisit = source.format === "firefox" ? Math.round(Number(row.last_visit_time) / 1000) : epoch(row.last_visit_time);
        if (!lastVisit || !Number.isFinite(lastVisit)) continue;
        upsertPage.run(source.id, url, cleanTitle(row.title, url), memoryHost(url), Math.max(1, Number(row.visit_count) || 1), lastVisit, Number(preferenceEligible(url)));
        if (++processed % 10000 === 0) notify({ message: `${source.name}：已读取 ${processed.toLocaleString()} 个网页`, current: index + 1, total: selected.length });
      }
      const visitsQuery = source.format === "firefox"
        ? "SELECT v.id, p.url, v.visit_date AS time FROM moz_historyvisits v JOIN moz_places p ON p.id = v.place_id"
        : "SELECT v.id, p.url, v.visit_time AS time FROM visits v JOIN urls p ON p.id = v.url";
      const visitRows = snapshot.prepare(visitsQuery);
      visitRows.setReadBigInts(true);
      for (const row of visitRows.iterate()) {
        const url = memoryUrl(row.url);
        const time = source.format === "firefox" ? Math.round(Number(row.time) / 1000) : epoch(row.time);
        if (url && Number.isFinite(time) && time > 0) addVisit.run(source.id, `${row.id}:${time}`, url, time);
      }
      db.prepare("INSERT OR REPLACE INTO sources VALUES (?, ?, ?)").run(source.id, source.name, Date.now());
      db.exec("COMMIT"); transaction = false;
      addedPages += db.prepare("SELECT COUNT(*) AS n FROM pages WHERE source = ?").get(source.id).n - beforePages;
      addedVisits += db.prepare("SELECT COUNT(*) AS n FROM visits WHERE source = ?").get(source.id).n - beforeVisits;
      siteCache = null;
    } catch (error) {
      if (transaction) db.exec("ROLLBACK");
      const code = /^[A-Z_0-9]+$/.test(String(error?.code || "")) ? `（${error.code}）` : "";
      errors.push(`${source.name} 导入失败${code}。请检查文件权限；若浏览器正占用记录，请关闭后重试。`);
    } finally {
      snapshot?.close(); original?.close();
      await rm(temp, { recursive: true, force: true });
    }
  }
  return { addedPages, addedVisits, errors, profile: profile() };
}

function preferences() {
  const values = Object.fromEntries(db.prepare("SELECT * FROM settings").all().map(row => [row.key, row.value === "true"]));
  return { ask: values.ask !== false, use: values.use !== false, address: values.address !== false, learning: values.learning !== false };
}

function sites() {
  if (siteCache) return siteCache;
  const byHost = new Map();
  for (const row of db.prepare("SELECT * FROM pages WHERE eligible = 1 AND host NOT IN (SELECT host FROM excluded)").iterate()) {
    let site = byHost.get(row.host);
    if (!site) {
      site = { host: row.host, url: `https://${row.host}/`, visits: 0, lastVisit: 0, topics: [], searchText: "" };
      byHost.set(row.host, site);
    }
    site.visits += row.visits;
    if (row.last_visit >= site.lastVisit) { site.lastVisit = row.last_visit; site.url = new URL(row.url).origin + "/"; }
    const topics = topicsFor(row.host, row.title);
    for (const topic of topics) if (!site.topics.some(t => t.id === topic.id)) site.topics.push(topic);
    if (site.searchText.length < 6000) site.searchText += ` ${row.title}`;
  }
  siteCache = [...byHost.values()].sort((a, b) => b.visits - a.visits || b.lastVisit - a.lastVisit);
  return siteCache;
}

function profile() {
  const list = sites();
  const topicCounts = new Map();
  for (const site of list) for (const topic of site.topics) {
    const item = topicCounts.get(topic.id) || { ...topic, sites: 0, visits: 0 };
    item.sites++; item.visits += site.visits;
    topicCounts.set(topic.id, item);
  }
  const topics = [...topicCounts.values()].sort((a, b) => b.visits - a.visits).slice(0, 6);
  const counts = db.prepare("SELECT COUNT(DISTINCT url) AS pages, COALESCE(SUM(visits), 0) AS visits, MIN(last_visit) AS firstVisit, MAX(last_visit) AS lastVisit FROM pages").get();
  const eventCount = db.prepare("SELECT COUNT(*) AS n FROM visits").get().n;
  return { ...counts, eventCount, siteCount: list.length, preferences: preferences(), topics,
    summary: list.length ? `常用网站包括 ${list.slice(0, 3).map(s => s.host).join("、")}。${topics.length ? `浏览较多的内容是${topics.slice(0, 3).map(t => t.label).join("、")}。` : "继续使用后，这里会逐步整理你的内容偏好。"}` : "导入后，这里会列出常用网站和浏览偏好。",
    topSites: list.slice(0, 12).map(({ searchText, ...site }) => site),
    sources: db.prepare("SELECT id, name, imported_at AS importedAt FROM sources ORDER BY imported_at DESC").all(),
    excluded: db.prepare("SELECT host FROM excluded ORDER BY host").all().map(row => row.host) };
}

function matches(query, limit = 8, respectExclusions = true) {
  const words = queryWords(query);
  const raw = String(query || "").trim().toLowerCase().slice(0, 500);
  if (!raw) return [];
  const tokens = [...new Set([raw, ...words])];
  const escape = text => `%${text.replace(/[\\%_]/g, "\\$&")}%`;
  const where = tokens.map(() => "(LOWER(url) LIKE ? ESCAPE '\\' OR LOWER(title) LIKE ? ESCAPE '\\')").join(" OR ");
  const rows = db.prepare(`SELECT url, title, SUM(visits) AS visits, MAX(last_visit) AS updatedAt, host FROM pages
    WHERE ${respectExclusions ? "eligible = 1 AND host NOT IN (SELECT host FROM excluded) AND" : ""} (${where})
    GROUP BY url ORDER BY updatedAt DESC LIMIT 500`).all(...tokens.flatMap(word => [escape(word), escape(word)]));
  const comparable = raw.replace(/^https?:\/\//, "").replace(/^www\./, "");
  return rows.map(row => ({ ...row, score: (row.host.startsWith(comparable) ? 80 : 0)
    + (row.title.toLowerCase().includes(raw) ? 45 : 0)
    + words.filter(word => `${row.title} ${row.url}`.toLowerCase().includes(word)).length * 8
    + Math.log2(1 + row.visits) + Math.max(0, 8 - (Date.now() - row.updatedAt) / 86400000 / 14) }))
    .sort((a, b) => b.score - a.score).slice(0, limit).map(({ score, ...row }) => row);
}

const operations = {
  bookmarkWeights: ({ urls = [] }) => {
    const wantedSites = new Set((Array.isArray(urls) ? urls : []).map(bookmarkHistorySite).filter(Boolean));
    const excludedHosts = db.prepare("SELECT host FROM excluded").all().map(row => row.host);
    if (!wantedSites.size) return { records: [], excludedHosts };
    const records = [];
    for (const row of db.prepare(`SELECT url,
      SUM(CASE WHEN source <> 'brizo' THEN visits ELSE 0 END) AS importedVisits,
      MAX(CASE WHEN source = 'brizo' THEN visits ELSE 0 END) AS brizoVisits
      FROM pages WHERE eligible = 1 AND host NOT IN (SELECT host FROM excluded) GROUP BY url`).iterate()) {
      if (wantedSites.has(bookmarkHistorySite(row.url))) records.push(row);
    }
    return { records, excludedHosts };
  },
  sources: async () => (await detectSources()).map(({ file, format, ...source }) => source),
  profile,
  import: (payload, notify) => importSources(payload.sourceIds, notify),
  suggest: ({ query }) => preferences().address ? matches(query) : [],
  preferred: ({ query, mode }) => {
    if (!['ask', 'use'].includes(mode) || !preferences()[mode]) return [];
    if (hasExplicitSiteTarget(query)) return [];
    return sites().map(site => ({ site, score: preferenceScore(site, query) })).filter(item => item.score > 0)
      .sort((a, b) => b.score - a.score).slice(0, 5).map(({ site }) => ({ host: site.host, url: site.url }));
  },
  settings: ({ changes }) => {
    for (const key of ["ask", "use", "address", "learning"]) if (typeof changes?.[key] === "boolean") {
      db.prepare("INSERT OR REPLACE INTO settings VALUES (?, ?)").run(key, String(changes[key]));
    }
    return profile();
  },
  exclude: ({ host, excluded }) => {
    if (!/^[a-z0-9.-]+$/.test(String(host || ""))) throw new Error("网址格式不正确。");
    db.prepare(excluded ? "INSERT OR IGNORE INTO excluded VALUES (?)" : "DELETE FROM excluded WHERE host = ?").run(host);
    siteCache = null;
    return profile();
  },
  history: ({ query = "", offset = 0 } = {}) => {
    const needle = `%${String(query).slice(0, 500).replace(/[\\%_]/g, "\\$&")}%`;
    const where = "WHERE p.url LIKE ? ESCAPE '\\' OR p.title LIKE ? ESCAPE '\\'";
    const total = db.prepare(`SELECT COUNT(*) AS n FROM (SELECT p.url FROM pages p ${where} GROUP BY p.url)`).get(needle, needle).n;
    const items = db.prepare(`SELECT p.url, p.title, SUM(p.visits) AS visits, MAX(p.last_visit) AS updatedAt,
      GROUP_CONCAT(DISTINCT s.name) AS sourceName FROM pages p LEFT JOIN sources s ON s.id = p.source ${where}
      GROUP BY p.url ORDER BY updatedAt DESC LIMIT 50 OFFSET ?`).all(needle, needle, Math.max(0, Math.floor(Number(offset) || 0)));
    return { items, total };
  },
  record: ({ url: value, title, updatedAt }) => {
    if (!preferences().learning || !db.prepare("SELECT 1 FROM sources LIMIT 1").get()) return false;
    const url = memoryUrl(value);
    if (!url || !preferenceEligible(url)) return false;
    const time = Math.min(Date.now(), Number(updatedAt) || Date.now());
    const existing = db.prepare("SELECT visits, last_visit FROM pages WHERE source = 'brizo' AND url = ?").get(url);
    // Renderer readiness can update several times for one navigation.
    if (existing && time - existing.last_visit < 30000) return false;
    upsertPage.run("brizo", url, cleanTitle(title, url), memoryHost(url), (existing?.visits || 0) + 1, time, 1);
    addVisit.run("brizo", `${time}:${url}`, url, time);
    db.prepare("INSERT OR REPLACE INTO sources VALUES ('brizo', 'Brizo', ?)").run(time);
    siteCache = null;
    return true;
  },
  remove: ({ url: value }) => {
    const url = memoryUrl(value);
    db.exec("BEGIN IMMEDIATE");
    try {
      db.prepare("DELETE FROM pages WHERE url = ?").run(url);
      db.prepare("DELETE FROM visits WHERE url = ?").run(url);
      db.exec("COMMIT");
    } catch (error) { db.exec("ROLLBACK"); throw error; }
    siteCache = null;
    return profile();
  },
  clear: () => {
    db.exec("PRAGMA secure_delete = ON; BEGIN IMMEDIATE; DELETE FROM pages; DELETE FROM visits; DELETE FROM sources; DELETE FROM excluded; COMMIT; PRAGMA wal_checkpoint(TRUNCATE); VACUUM;");
    siteCache = null;
    return profile();
  },
};

let queue = Promise.resolve();
parentPort.on("message", ({ id, method, payload }) => {
  queue = queue.then(async () => {
    try {
      if (!Object.hasOwn(operations, method)) throw new Error("不支持的历史操作。");
      const result = await operations[method](payload, progress => parentPort.postMessage({ id, progress }));
      parentPort.postMessage({ id, result });
    } catch (error) {
      parentPort.postMessage({ id, error: error.message || "本地历史操作失败，请重试。" });
    }
  });
});
