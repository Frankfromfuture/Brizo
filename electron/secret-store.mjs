// Encrypted credential storage for bound model providers and search services.
//
// Hard rule (AGENTS.md 36/37): a plaintext key must never leave the main process.
// Only `sanitizeProviders` / `sanitizeServices` output may cross the IPC boundary;
// they emit a `keyMask` and never an `encryptedKey`.

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

export const SEARCH_SERVICE_IDS = ["serper", "bocha"];

const SEARCH_SERVICE_META = {
  serper: { name: "Serper.dev", homepage: "https://serper.dev" },
  bocha: { name: "博查", homepage: "https://bochaai.com" },
};

export function modelSpeedScore(model, providerName = "") {
  const name = String(model || "").toLowerCase();
  const provider = String(providerName || "").toLowerCase();
  let score = 0;
  if (provider.includes("qwen") || provider.includes("tongyi") || provider.includes("通义")) {
    score += name.startsWith("qwen") ? 220 : -120;
  } else if (provider.includes("deepseek") || provider.includes("deep seek")) {
    score += name.includes("deepseek") ? 220 : -120;
  } else if (provider.includes("minimax")) {
    score += name.includes("minimax") ? 220 : -120;
  }
  if (name.includes("flash")) score += 120;
  if (name.includes("instant")) score += 105;
  if (name.includes("turbo")) score += 95;
  if (/(^|[/_.-])mini($|[/_.-])/.test(name)) score += 90;
  if (name.includes("fast")) score += 85;
  if (name.includes("chat")) score += 70;
  if (name.includes("lite")) score += 65;
  if (name.includes("haiku")) score += 60;
  if (name.includes("small")) score += 45;
  if (name.includes("reasoner") || name.includes("reasoning")) score -= 140;
  if (name.includes("thinking") || name.includes("-r1") || name.endsWith("r1")) score -= 130;
  if (name.includes("pro") || name.includes("max") || name.includes("ultra")) score -= 25;
  if (/(speech|audio|asr|tts|realtime|embedding|image|ocr|livetranslate)/.test(name)) score -= 400;
  if (/-(19|20)\d{2}-\d{2}-\d{2}$/.test(name)) score -= 4;
  return score;
}

export function sortFastModels(models, providerName = "") {
  return [...new Set(models.filter((model) => typeof model === "string" && model))]
    .sort((left, right) => modelSpeedScore(right, providerName) - modelSpeedScore(left, providerName));
}

export function chooseFastModel(models, providerName = "") {
  return sortFastModels(models, providerName)[0] || "";
}

export function withKnownProviderDefaults(provider) {
  const name = String(provider?.name || "").toLowerCase();
  if (name.includes("deepseek") || name.includes("deep seek")) {
    const models = Array.isArray(provider.models) && provider.models.length
      ? provider.models
      : ["deepseek-v4-flash", "deepseek-chat", "deepseek-reasoner"];
    return {
      ...provider,
      baseUrl: provider.baseUrl || "https://api.deepseek.com",
      models,
      selectedModel: provider.selectedModel || chooseFastModel(models, provider.name) || "deepseek-v4-flash",
    };
  }
  return provider;
}

export function readAssistantMessage(body) {
  const content = body?.choices?.[0]?.message?.content;
  if (typeof content === "string") return content.trim();
  if (Array.isArray(content)) {
    return content
      .map((item) => typeof item === "string" ? item : item?.text || "")
      .filter(Boolean)
      .join("\n")
      .trim();
  }
  return "";
}

export function normalizeModelApiUrl(input) {
  const value = String(input || "").trim().replace(/\/$/, "");
  if (!value) return "";
  const url = new URL(value);
  const local = ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
  if (url.protocol !== "https:" && !(local && url.protocol === "http:")) {
    throw new Error("API 地址必须使用 HTTPS；本机地址可以使用 HTTP。");
  }
  return url.href.replace(/\/$/, "");
}

export function maskApiKey(apiKey) {
  const value = String(apiKey || "");
  return value ? `••••${value.slice(-4)}` : "••••••••";
}

/**
 * @param {object} deps
 * @param {() => string} deps.storePath   resolves the model-guard.json path lazily,
 *   because Electron's userData path is only valid after `app` is ready.
 * @param {object} deps.safeStorage       Electron safeStorage (injectable for tests).
 * @param {object} [deps.env]             process.env, for dev-only key overrides.
 */
export function createModelGuard({ storePath, safeStorage, env = {} }) {
  const readStore = async () => {
    try {
      const parsed = JSON.parse(await readFile(storePath(), "utf8"));
      return {
        defaultId: typeof parsed?.defaultId === "string" ? parsed.defaultId : "",
        providers: Array.isArray(parsed?.providers) ? parsed.providers : [],
        services: parsed?.services && typeof parsed.services === "object" ? parsed.services : {},
      };
    } catch {
      return { defaultId: "", providers: [], services: {} };
    }
  };

  const writeStore = async (store) => {
    await mkdir(path.dirname(storePath()), { recursive: true });
    const temporary = `${storePath()}.tmp`;
    await writeFile(temporary, JSON.stringify(store, null, 2), { mode: 0o600 });
    await rename(temporary, storePath());
  };

  const encrypt = (plaintext) => {
    if (!plaintext || !safeStorage.isEncryptionAvailable()) return "";
    return safeStorage.encryptString(plaintext).toString("base64");
  };

  const decrypt = (encryptedKey) => {
    if (!encryptedKey || !safeStorage.isEncryptionAvailable()) return "";
    try {
      return safeStorage.decryptString(Buffer.from(encryptedKey, "base64"));
    } catch {
      return "";
    }
  };

  const decryptKey = (provider) => decrypt(provider?.encryptedKey);

  const sanitizeProviders = (store) => store.providers.map((storedProvider) => {
    const provider = withKnownProviderDefaults(storedProvider);
    const models = Array.isArray(provider.models) ? provider.models : [];
    return {
      id: provider.id,
      name: provider.name,
      baseUrl: provider.baseUrl,
      isDefault: provider.id === store.defaultId,
      keyMask: provider.keyMask || "••••••••",
      models: sortFastModels(models, provider.name),
      selectedModel: chooseFastModel(models, provider.name) || "",
    };
  });

  /** Main-process only. Never reachable from an ipcMain handler. */
  const readServiceKey = async (serviceId) => {
    const envKey = env[`BRIZO_${String(serviceId).toUpperCase()}_API_KEY`];
    const store = await readStore();
    const stored = decrypt(store.services?.[serviceId]?.encryptedKey);
    // Stored keys win over env so an in-app rotation takes effect without a restart.
    return stored || String(envKey || "").trim();
  };

  /** An empty `apiKey` keeps the existing key, mirroring the provider edit rule. */
  const saveServiceKey = async (serviceId, apiKey, patch = {}) => {
    if (!SEARCH_SERVICE_IDS.includes(serviceId)) {
      throw new Error(`未知的检索服务：${serviceId}`);
    }
    const store = await readStore();
    const existing = store.services?.[serviceId] || {};
    const key = String(apiKey || "").trim();
    store.services = {
      ...store.services,
      [serviceId]: {
        ...existing,
        ...patch,
        ...(key ? { encryptedKey: encrypt(key), keyMask: maskApiKey(key) } : {}),
        updatedAt: new Date().toISOString(),
      },
    };
    await writeStore(store);
    return store;
  };

  const deleteServiceKey = async (serviceId) => {
    const store = await readStore();
    if (store.services?.[serviceId]) {
      const next = { ...store.services };
      delete next[serviceId];
      store.services = next;
      await writeStore(store);
    }
    return store;
  };

  /** The only service shape allowed to cross IPC. Carries no key material. */
  const sanitizeServices = (store) => SEARCH_SERVICE_IDS.map((id) => {
    const entry = store.services?.[id] || {};
    const envConfigured = Boolean(String(env[`BRIZO_${id.toUpperCase()}_API_KEY`] || "").trim());
    return {
      id,
      name: SEARCH_SERVICE_META[id]?.name || id,
      homepage: SEARCH_SERVICE_META[id]?.homepage || "",
      configured: Boolean(entry.encryptedKey) || envConfigured,
      fromEnvironment: !entry.encryptedKey && envConfigured,
      keyMask: entry.keyMask || (envConfigured ? "••••环境变量" : ""),
      lastStatus: entry.lastStatus || "",
      updatedAt: entry.updatedAt || "",
    };
  });

  /**
   * One-time developer bootstrap from a gitignored file. The file is never copied,
   * returned, logged, or read again after both service entries exist in the encrypted
   * store. Supported shapes: {serper, bocha} and {services:{serper, bocha}}.
   */
  const seedServicesFromFile = async (filePath) => {
    if (!safeStorage.isEncryptionAvailable()) return { seeded: [] };
    const store = await readStore();
    const missing = SEARCH_SERVICE_IDS.filter((id) => !store.services?.[id]?.encryptedKey);
    if (!missing.length) return { seeded: [] };
    let parsed;
    try {
      parsed = JSON.parse(await readFile(filePath, "utf8"));
    } catch {
      return { seeded: [] };
    }
    const source = parsed?.services && typeof parsed.services === "object" ? parsed.services : parsed;
    const seeded = [];
    for (const id of missing) {
      const key = String(source?.[id] || source?.[`${id}ApiKey`] || "").trim();
      if (!key) continue;
      store.services = {
        ...store.services,
        [id]: {
          encryptedKey: encrypt(key),
          keyMask: maskApiKey(key),
          updatedAt: new Date().toISOString(),
        },
      };
      seeded.push(id);
    }
    if (seeded.length) await writeStore(store);
    return { seeded };
  };

  return {
    readStore,
    writeStore,
    encrypt,
    decrypt,
    decryptKey,
    sanitizeProviders,
    readServiceKey,
    saveServiceKey,
    deleteServiceKey,
    sanitizeServices,
    seedServicesFromFile,
  };
}
