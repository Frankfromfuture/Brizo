import { readFile, writeFile } from "node:fs/promises";

export function createPasswordVault({ safeStorage, storePath }) {
  const resolveStorePath = () => typeof storePath === "function" ? storePath() : storePath;

  const readStore = async () => {
    try {
      const parsed = JSON.parse(await readFile(resolveStorePath(), "utf8"));
      return {
        entries: Array.isArray(parsed?.entries)
          ? parsed.entries.filter((entry) => entry?.id && entry?.encryptedPassword)
          : [],
      };
    } catch {
      return { entries: [] };
    }
  };

  const writeStore = (store) => writeFile(resolveStorePath(), JSON.stringify(store, null, 2), "utf8");

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

  const list = async () => sanitize(await readStore());

  const save = async (payload) => {
    if (!safeStorage.isEncryptionAvailable()) {
      return { status: "error", message: "系统安全存储当前不可用。" };
    }
    const store = await readStore();
    const id = typeof payload?.id === "string" && payload.id
      ? payload.id
      : `password-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const existing = store.entries.find((entry) => entry.id === id);
    const site = String(payload?.site || existing?.site || "").trim().slice(0, 240);
    const username = String(payload?.username || existing?.username || "").trim().slice(0, 240);
    const password = typeof payload?.password === "string" && payload.password
      ? payload.password
      : decrypt(existing);
    if (!site || !username || !password) {
      return { status: "error", message: "请填写网站、账号和密码。" };
    }
    const now = Date.now();
    const next = {
      id,
      site,
      username,
      encryptedPassword: safeStorage.encryptString(password).toString("base64"),
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    };
    store.entries = [next, ...store.entries.filter((entry) => entry.id !== id)].slice(0, 500);
    await writeStore(store);
    return { status: "saved", entries: sanitize(store) };
  };

  const remove = async (id) => {
    const store = await readStore();
    store.entries = store.entries.filter((entry) => entry.id !== id);
    await writeStore(store);
    return sanitize(store);
  };

  const reveal = async (id) => {
    const store = await readStore();
    return decrypt(store.entries.find((entry) => entry.id === id));
  };

  return { list, remove, reveal, save };
}
