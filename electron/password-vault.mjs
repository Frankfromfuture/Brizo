import { chmod, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { isIP } from "node:net";
import { domainToASCII } from "node:url";
import { getDomain } from "tldts";

const STORE_VERSION = 2;

const UNSAFE_TLDS = new Set([
  "corp", "home", "internal", "invalid", "lan", "local", "localhost", "test",
]);

function validateHostname(rawHostname) {
  const hostname = domainToASCII(String(rawHostname || "").toLowerCase());
  if (!hostname || hostname.endsWith(".") || hostname.length > 253 || isIP(hostname)) {
    return false;
  }
  const labels = hostname.split(".");
  const registrableDomain = getDomain(hostname, { allowPrivateDomains: true });
  if (labels.length < 2 || !registrableDomain) return false;
  if (UNSAFE_TLDS.has(labels.at(-1))) return false;
  if (!/^(?:[a-z]{2,63}|xn--[a-z0-9-]{2,59})$/.test(labels.at(-1))) return false;
  return labels.every((label) => label.length > 0
    && label.length <= 63
    && /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label));
}

function normalizeHttpsOrigin(value) {
  const raw = String(value || "").trim();
  if (!raw || /[\u0000-\u001f\u007f\s]/.test(raw)) return null;
  let parsed;
  try {
    parsed = new URL(raw.includes("://") ? raw : `https://${raw}`);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password || !validateHostname(parsed.hostname)) {
    return null;
  }
  return parsed.origin;
}

export function createPasswordVault({ safeStorage, storePath }) {
  const resolveStorePath = () => typeof storePath === "function" ? storePath() : storePath;
  let mutationQueue = Promise.resolve();

  const readStore = async () => {
    try {
      const parsed = JSON.parse(await readFile(resolveStorePath(), "utf8"));
      return {
        version: Number(parsed?.version) || 1,
        entries: Array.isArray(parsed?.entries)
          ? parsed.entries.filter((entry) => entry?.id && entry?.encryptedPassword)
          : [],
      };
    } catch (error) {
      if (error?.code === "ENOENT") return { version: STORE_VERSION, entries: [] };
      throw error;
    }
  };

  const writeStore = async (store) => {
    const targetPath = resolveStorePath();
    const temporaryPath = `${targetPath}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    try {
      await writeFile(temporaryPath, JSON.stringify({ ...store, version: STORE_VERSION }, null, 2), {
        encoding: "utf8",
        flag: "wx",
        mode: 0o600,
      });
      await chmod(temporaryPath, 0o600);
      await rename(temporaryPath, targetPath);
      await chmod(targetPath, 0o600);
    } catch (error) {
      await unlink(temporaryPath).catch(() => {});
      throw error;
    }
  };

  const mutate = (operation) => {
    const result = mutationQueue.then(operation, operation);
    mutationQueue = result.then(() => undefined, () => undefined);
    return result;
  };

  const readCurrentStore = async () => {
    await mutationQueue;
    return readStore();
  };

  const sanitize = (store) => (store?.entries || []).map((entry) => ({
    id: entry.id,
    site: entry.site,
    username: entry.username,
    passwordMask: "********",
    updatedAt: entry.updatedAt,
  }));

  const decrypt = (entry) => {
    try {
      return safeStorage.decryptString(Buffer.from(entry?.encryptedPassword || "", "base64"));
    } catch {
      return "";
    }
  };

  const list = async () => sanitize(await readCurrentStore());

  const save = (payload) => mutate(async () => {
    if (!safeStorage.isEncryptionAvailable()) {
      return { status: "error", message: "系统安全存储当前不可用。" };
    }
    const store = await readStore();
    const id = typeof payload?.id === "string" && payload.id
      ? payload.id
      : `password-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const existing = store.entries.find((entry) => entry.id === id);
    const siteInput = String(payload?.site || existing?.origin || existing?.site || "").trim().slice(0, 240);
    const origin = normalizeHttpsOrigin(siteInput);
    const username = String(payload?.username || existing?.username || "").trim().slice(0, 240);
    const password = typeof payload?.password === "string" && payload.password
      ? payload.password
      : decrypt(existing);
    if (!siteInput || !username || !password) {
      return { status: "error", message: "请填写网站、账号和密码。" };
    }
    if (!origin) {
      return { status: "error", message: "只支持具有有效公共域名的 HTTPS 网站，且地址中不能包含账号或密码。" };
    }
    const now = Date.now();
    const next = {
      id,
      site: origin,
      origin,
      username,
      encryptedPassword: safeStorage.encryptString(password).toString("base64"),
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    };
    store.entries = [next, ...store.entries.filter((entry) => entry.id !== id)].slice(0, 500);
    await writeStore(store);
    return { status: "saved", entries: sanitize(store) };
  });

  const remove = (id) => mutate(async () => {
    const store = await readStore();
    store.entries = store.entries.filter((entry) => entry.id !== id);
    await writeStore(store);
    return sanitize(store);
  });

  const reveal = async (id) => {
    const store = await readCurrentStore();
    return decrypt(store.entries.find((entry) => entry.id === id));
  };

  const entryMatchesUrl = (entry, pageUrl) => {
    // Version 2 entries always carry their canonical origin. Legacy entries
    // are interpreted as one exact HTTPS origin and never inherit to subdomains.
    const savedOrigin = normalizeHttpsOrigin(entry?.origin || entry?.site);
    const pageOrigin = normalizeHttpsOrigin(pageUrl);
    return Boolean(savedOrigin && pageOrigin && pageOrigin === savedOrigin);
  };

  const matches = async (pageUrl) => {
    const store = await readCurrentStore();
    return sanitize({ entries: store.entries.filter((entry) => entryMatchesUrl(entry, pageUrl)) });
  };

  const revealForUrl = async (id, pageUrl) => {
    const store = await readCurrentStore();
    const entry = store.entries.find((candidate) => candidate.id === id && entryMatchesUrl(candidate, pageUrl));
    const password = decrypt(entry);
    return entry && password ? { password, username: entry.username } : null;
  };

  return { list, matches, remove, reveal, revealForUrl, save };
}
