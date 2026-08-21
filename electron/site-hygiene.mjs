import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

export const DEFAULT_SITE_HYGIENE_SETTINGS = Object.freeze({
  cleanupLevel: "balanced",
  cookieConsent: "essential",
  credentialAutofill: true,
  enabled: true,
  siteOverrides: {},
});

const CLEANUP_LEVELS = new Set(["off", "balanced", "strict"]);
const COOKIE_CHOICES = new Set(["ask", "essential", "allow-all"]);

export function normalizeSiteOrigin(value) {
  try {
    const url = new URL(String(value || ""));
    return ["http:", "https:"].includes(url.protocol) ? url.origin.toLowerCase() : "";
  } catch {
    return "";
  }
}

export function sanitizeSiteHygieneSettings(value = {}) {
  const source = value && typeof value === "object" ? value : {};
  const siteOverrides = {};
  if (source.siteOverrides && typeof source.siteOverrides === "object") {
    for (const [rawOrigin, rawOverride] of Object.entries(source.siteOverrides)) {
      const origin = normalizeSiteOrigin(rawOrigin);
      if (!origin || !rawOverride || typeof rawOverride !== "object") continue;
      siteOverrides[origin] = {
        enabled: rawOverride.enabled !== false,
      };
    }
  }
  return {
    cleanupLevel: CLEANUP_LEVELS.has(source.cleanupLevel) ? source.cleanupLevel : DEFAULT_SITE_HYGIENE_SETTINGS.cleanupLevel,
    cookieConsent: COOKIE_CHOICES.has(source.cookieConsent) ? source.cookieConsent : DEFAULT_SITE_HYGIENE_SETTINGS.cookieConsent,
    credentialAutofill: source.credentialAutofill !== false,
    enabled: source.enabled !== false,
    siteOverrides,
  };
}

export function resolveSiteHygieneSettings(settings, pageUrl) {
  const normalized = sanitizeSiteHygieneSettings(settings);
  const origin = normalizeSiteOrigin(pageUrl);
  const override = origin ? normalized.siteOverrides[origin] : null;
  return {
    cleanupLevel: normalized.cleanupLevel,
    cookieConsent: normalized.cookieConsent,
    credentialAutofill: normalized.credentialAutofill,
    enabled: normalized.enabled && override?.enabled !== false,
    origin,
  };
}

const AD_HOST_SUFFIXES = [
  "2mdn.net",
  "adnxs.com",
  "adsrvr.org",
  "amazon-adsystem.com",
  "casalemedia.com",
  "criteo.com",
  "criteo.net",
  "doubleclick.net",
  "googleadservices.com",
  "googlesyndication.com",
  "moatads.com",
  "openx.net",
  "outbrain.com",
  "pubmatic.com",
  "rubiconproject.com",
  "scorecardresearch.com",
  "taboola.com",
  "zedo.com",
];

const STRICT_TRACKER_HOST_SUFFIXES = [
  "branch.io",
  "hotjar.com",
  "mixpanel.com",
  "segment.io",
];

function hostMatches(hostname, suffix) {
  return hostname === suffix || hostname.endsWith(`.${suffix}`);
}

export function shouldBlockPageRequest(details, settings) {
  if (!details || details.resourceType === "mainFrame") return false;
  const resolved = resolveSiteHygieneSettings(settings, details.referrer || details.pageUrl || "");
  if (!resolved.enabled || resolved.cleanupLevel === "off") return false;
  let target;
  try {
    target = new URL(String(details.url || ""));
  } catch {
    return false;
  }
  if (!["http:", "https:"].includes(target.protocol)) return false;
  const hostname = target.hostname.toLowerCase();
  if (AD_HOST_SUFFIXES.some((suffix) => hostMatches(hostname, suffix))) return true;
  return resolved.cleanupLevel === "strict"
    && STRICT_TRACKER_HOST_SUFFIXES.some((suffix) => hostMatches(hostname, suffix));
}

export function createSiteHygieneStore(storePath) {
  let cached;
  let writeQueue = Promise.resolve();

  async function read() {
    if (cached) return cached;
    try {
      cached = sanitizeSiteHygieneSettings(JSON.parse(await readFile(storePath, "utf8")));
    } catch {
      cached = sanitizeSiteHygieneSettings();
    }
    return cached;
  }

  async function write(value) {
    cached = sanitizeSiteHygieneSettings(value);
    writeQueue = writeQueue.catch(() => {}).then(async () => {
      await mkdir(path.dirname(storePath), { recursive: true });
      const temporaryPath = `${storePath}.tmp`;
      await writeFile(temporaryPath, `${JSON.stringify(cached, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
      await rename(temporaryPath, storePath);
    });
    await writeQueue;
    return cached;
  }

  return { read, write };
}
