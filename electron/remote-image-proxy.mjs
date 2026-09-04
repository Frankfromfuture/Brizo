import { createHash } from "node:crypto";
import { lookup as dnsLookup } from "node:dns/promises";
import { isIP } from "node:net";
import { request as httpsRequest } from "node:https";
import {
  assertBrowserNavigationUrl,
  assertResolvedNavigationAddress,
} from "./browser-navigation-policy.mjs";

export const REMOTE_IMAGE_MAX_BYTES = 6 * 1024 * 1024;
export const REMOTE_IMAGE_TIMEOUT_MS = 8_000;
export const REMOTE_IMAGE_MAX_REDIRECTS = 3;
export const REMOTE_IMAGE_CACHE_TTL_MS = 30 * 60 * 1_000;
export const REMOTE_IMAGE_CACHE_ENTRIES = 128;
export const REMOTE_IMAGE_CACHE_BYTES = 32 * 1024 * 1024;
export const REMOTE_IMAGE_MAX_URL_LENGTH = 4_096;

// Main-process only. Call this with image URLs already present in main-owned
// search/Brief result pipelines; never expose arbitrary URL fetching to
// renderer IPC, because a compromised renderer could otherwise encode private
// data in a public URL. Node HTTPS plus a pinned lookup intentionally bypasses
// Chromium cookies, referrers, authentication state, and a second unvalidated
// DNS lookup.

const ACCEPT_HEADER = "image/avif,image/webp,image/png,image/jpeg,image/gif,image/x-icon;q=0.8";
const IMAGE_FETCH_USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36";
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const CONTENT_TYPES = new Map([
  ["image/avif", "image/avif"],
  ["image/gif", "image/gif"],
  ["image/jpeg", "image/jpeg"],
  ["image/jpg", "image/jpeg"],
  ["image/pjpeg", "image/jpeg"],
  ["image/png", "image/png"],
  ["image/webp", "image/webp"],
  ["image/x-icon", "image/x-icon"],
  ["image/vnd.microsoft.icon", "image/x-icon"],
]);

const ERROR_MESSAGES = {
  content_type: "远程资源不是受支持的栅格图片。",
  dns: "远程图片域名没有可验证的公共网络地址。",
  fetch: "远程图片获取失败。",
  magic: "远程图片内容与声明的格式不一致。",
  redirect: "远程图片重定向无效或次数过多。",
  size: "远程图片超过允许的体积。",
  status: "远程图片服务器返回了不可用状态。",
  timeout: "远程图片获取超时。",
  url: "远程图片地址不符合安全策略。",
};

export class RemoteImageProxyError extends Error {
  constructor(code) {
    super(ERROR_MESSAGES[code] || ERROR_MESSAGES.fetch);
    this.name = "RemoteImageProxyError";
    this.code = code;
  }
}

function normalizeRemoteImageUrl(value) {
  try {
    if (typeof value !== "string" || !value || value.length > REMOTE_IMAGE_MAX_URL_LENGTH) {
      throw new Error("Invalid remote image URL length.");
    }
    const safeUrl = assertBrowserNavigationUrl(value);
    const parsed = new URL(safeUrl);
    if (parsed.protocol !== "https:") throw new Error("HTTPS is required.");
    parsed.hash = "";
    return parsed;
  } catch {
    throw new RemoteImageProxyError("url");
  }
}

function cacheKeyForUrl(url) {
  return createHash("sha256").update(url.href, "utf8").digest("base64url");
}

function headerValue(headers, name) {
  const normalizedName = String(name || "").toLowerCase();
  const directValue = headers?.[name] ?? headers?.[normalizedName];
  const value = directValue ?? Object.entries(headers || {})
    .find(([headerName]) => headerName.toLowerCase() === normalizedName)?.[1];
  return Array.isArray(value) ? value[0] : typeof value === "string" ? value : "";
}

function normalizeContentType(value) {
  return CONTENT_TYPES.get(String(value || "").split(";", 1)[0].trim().toLowerCase()) || "";
}

function detectedImageType(buffer) {
  if (buffer.length >= 6
    && buffer[0] === 0x00
    && buffer[1] === 0x00
    && buffer[2] === 0x01
    && buffer[3] === 0x00
    && buffer.readUInt16LE(4) > 0) {
    return "image/x-icon";
  }
  if (buffer.length >= 8
    && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return "image/png";
  }
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "image/jpeg";
  }
  if (buffer.length >= 6 && ["GIF87a", "GIF89a"].includes(buffer.subarray(0, 6).toString("ascii"))) {
    return "image/gif";
  }
  if (buffer.length >= 12
    && buffer.subarray(0, 4).toString("ascii") === "RIFF"
    && buffer.subarray(8, 12).toString("ascii") === "WEBP") {
    return "image/webp";
  }
  if (buffer.length >= 16 && buffer.subarray(4, 8).toString("ascii") === "ftyp") {
    const brands = buffer.subarray(8, Math.min(buffer.length, 40)).toString("ascii");
    if (brands.includes("avif") || brands.includes("avis")) return "image/avif";
  }
  return "";
}

function normalizeResolvedAddresses(result) {
  const candidates = Array.isArray(result)
    ? result
    : Array.isArray(result?.endpoints)
      ? result.endpoints
      : [];
  return candidates.flatMap((candidate) => {
    const address = typeof candidate === "string" ? candidate : candidate?.address;
    if (typeof address !== "string" || !address) return [];
    const family = Number(candidate?.family) || isIP(address);
    return family === 4 || family === 6 ? [{ address, family }] : [];
  });
}

function createPinnedLookup(addresses) {
  return (_hostname, options, callback) => {
    const requestedFamily = Number(options?.family) || 0;
    const eligible = requestedFamily
      ? addresses.filter((entry) => entry.family === requestedFamily)
      : addresses;
    if (!eligible.length) {
      const error = new Error("No validated address for the requested family.");
      error.code = "ENOTFOUND";
      callback(error);
      return;
    }
    if (options?.all) {
      callback(null, eligible.map((entry) => ({ ...entry })));
      return;
    }
    callback(null, eligible[0].address, eligible[0].family);
  };
}

function timeoutPromise(promise, milliseconds, { setTimeoutFn, clearTimeoutFn }) {
  if (!(milliseconds > 0)) return Promise.reject(new RemoteImageProxyError("timeout"));
  return new Promise((resolve, reject) => {
    const timer = setTimeoutFn(() => reject(new RemoteImageProxyError("timeout")), milliseconds);
    timer?.unref?.();
    Promise.resolve(promise).then(
      (value) => {
        clearTimeoutFn(timer);
        resolve(value);
      },
      (error) => {
        clearTimeoutFn(timer);
        reject(error);
      },
    );
  });
}

function cacheTtlForHeaders(headers, defaultTtlMs) {
  const cacheControl = headerValue(headers, "cache-control").toLowerCase();
  if (/(?:^|,)\s*(?:no-cache|no-store|private)(?:\s|,|$)/u.test(cacheControl)) return 0;
  const maxAge = cacheControl.match(/(?:^|,)\s*max-age\s*=\s*(\d+)/u)?.[1];
  if (maxAge === undefined) return defaultTtlMs;
  return Math.min(defaultTtlMs, Number(maxAge) * 1_000);
}

export function createRemoteImageProxy({
  requestImpl = httpsRequest,
  resolveHostFn = (hostname) => dnsLookup(hostname, { all: true, verbatim: true }),
  nowFn = Date.now,
  setTimeoutFn = setTimeout,
  clearTimeoutFn = clearTimeout,
  maxBytes = REMOTE_IMAGE_MAX_BYTES,
  timeoutMs = REMOTE_IMAGE_TIMEOUT_MS,
  maxRedirects = REMOTE_IMAGE_MAX_REDIRECTS,
  cacheTtlMs = REMOTE_IMAGE_CACHE_TTL_MS,
  maxCacheEntries = REMOTE_IMAGE_CACHE_ENTRIES,
  maxCacheBytes = REMOTE_IMAGE_CACHE_BYTES,
} = {}) {
  if (typeof requestImpl !== "function"
    || typeof resolveHostFn !== "function"
    || typeof nowFn !== "function"
    || typeof setTimeoutFn !== "function"
    || typeof clearTimeoutFn !== "function") {
    throw new TypeError("Remote image proxy dependencies must be functions.");
  }
  for (const [name, value] of Object.entries({
    maxBytes,
    timeoutMs,
    cacheTtlMs,
    maxCacheEntries,
    maxCacheBytes,
  })) {
    if (!Number.isSafeInteger(value) || value <= 0) throw new TypeError(`${name} must be a positive integer.`);
  }
  if (!Number.isSafeInteger(maxRedirects) || maxRedirects < 0) {
    throw new TypeError("maxRedirects must be a non-negative integer.");
  }

  const cache = new Map();
  const inflight = new Map();
  let cacheBytes = 0;
  let cacheGeneration = 0;

  const deleteCacheEntry = (key) => {
    const entry = cache.get(key);
    if (!entry) return;
    cache.delete(key);
    cacheBytes -= entry.cacheCost;
  };

  const pruneCache = () => {
    const now = nowFn();
    for (const [key, entry] of cache) {
      if (entry.expiresAt <= now) deleteCacheEntry(key);
    }
    while (cache.size > maxCacheEntries || cacheBytes > maxCacheBytes) {
      deleteCacheEntry(cache.keys().next().value);
    }
  };

  const readCache = (key) => {
    const entry = cache.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= nowFn()) {
      deleteCacheEntry(key);
      return null;
    }
    cache.delete(key);
    cache.set(key, entry);
    return {
      byteLength: entry.byteLength,
      dataUrl: entry.dataUrl,
      expiresAt: entry.expiresAt,
      fromCache: true,
      mimeType: entry.mimeType,
    };
  };

  const storeCache = (key, result, ttlMs) => {
    if (!(ttlMs > 0)) return;
    deleteCacheEntry(key);
    const entry = {
      byteLength: result.byteLength,
      cacheCost: Buffer.byteLength(result.dataUrl, "utf8"),
      dataUrl: result.dataUrl,
      expiresAt: nowFn() + ttlMs,
      mimeType: result.mimeType,
    };
    if (entry.cacheCost > maxCacheBytes) return;
    cache.set(key, entry);
    cacheBytes += entry.cacheCost;
    pruneCache();
  };

  const remainingTime = (deadline) => Math.max(0, deadline - nowFn());

  const resolveAddresses = async (url, deadline) => {
    const hostname = url.hostname.replace(/^\[|\]$/gu, "");
    if (isIP(hostname)) {
      const address = assertResolvedNavigationAddress(hostname);
      return [{ address, family: isIP(address) }];
    }
    let resolved;
    try {
      resolved = await timeoutPromise(
        resolveHostFn(hostname),
        remainingTime(deadline),
        { clearTimeoutFn, setTimeoutFn },
      );
    } catch (error) {
      if (error instanceof RemoteImageProxyError) throw error;
      throw new RemoteImageProxyError("dns");
    }
    const addresses = normalizeResolvedAddresses(resolved);
    if (!addresses.length) throw new RemoteImageProxyError("dns");
    try {
      addresses.forEach((entry) => assertResolvedNavigationAddress(entry.address));
    } catch {
      throw new RemoteImageProxyError("dns");
    }
    return addresses;
  };

  const requestOnce = (url, addresses, deadline) => new Promise((resolve, reject) => {
    let settled = false;
    let request;
    let timer = null;
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeoutFn(timer);
      if (error) reject(error);
      else resolve(value);
    };
    timer = setTimeoutFn(() => {
      const error = new RemoteImageProxyError("timeout");
      request?.destroy?.(error);
      finish(error);
    }, remainingTime(deadline));
    timer?.unref?.();
    try {
      const servername = url.hostname.replace(/^\[|\]$/gu, "");
      request = requestImpl(url, {
        agent: false,
        headers: {
          Accept: ACCEPT_HEADER,
          "Accept-Encoding": "identity",
          "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
          // Some public image CDNs reject the default Node client even though
          // the same image is publicly readable in Chromium. This fixed,
          // non-identifying UA preserves cookie/referrer isolation.
          "User-Agent": IMAGE_FETCH_USER_AGENT,
          "Sec-Fetch-Dest": "image",
          "Sec-Fetch-Mode": "no-cors",
        },
        lookup: createPinnedLookup(addresses),
        method: "GET",
        rejectUnauthorized: true,
        ...(isIP(servername) ? {} : { servername }),
      }, (response) => {
        // Keep an error listener installed even for redirect/status branches
        // that are drained after this function has already settled.
        response.once("error", () => finish(new RemoteImageProxyError("fetch")));
        const statusCode = Number(response.statusCode) || 0;
        if (REDIRECT_STATUSES.has(statusCode)) {
          const location = headerValue(response.headers, "location");
          response.resume?.();
          finish(null, { location, redirect: true });
          return;
        }
        if (statusCode !== 200) {
          response.resume?.();
          finish(new RemoteImageProxyError("status"));
          return;
        }
        const rawContentType = headerValue(response.headers, "content-type").split(";", 1)[0].trim().toLowerCase();
        const declaredType = normalizeContentType(rawContentType);
        const genericBinaryType = !rawContentType
          || rawContentType === "application/octet-stream"
          || rawContentType === "binary/octet-stream";
        if (!declaredType && !genericBinaryType) {
          response.resume?.();
          finish(new RemoteImageProxyError("content_type"));
          return;
        }
        const declaredLength = Number(headerValue(response.headers, "content-length"));
        if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
          response.resume?.();
          finish(new RemoteImageProxyError("size"));
          return;
        }

        const chunks = [];
        let byteLength = 0;
        response.on("data", (chunk) => {
          if (settled) return;
          const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
          byteLength += bytes.length;
          if (byteLength > maxBytes) {
            response.destroy?.();
            finish(new RemoteImageProxyError("size"));
            return;
          }
          chunks.push(bytes);
        });
        response.once("end", () => {
          if (settled) return;
          const bytes = Buffer.concat(chunks, byteLength);
          const detectedType = detectedImageType(bytes);
          if (!detectedType || (declaredType && detectedType !== declaredType)) {
            finish(new RemoteImageProxyError("magic"));
            return;
          }
          finish(null, {
            bytes,
            cacheTtlMs: cacheTtlForHeaders(response.headers, cacheTtlMs),
            mimeType: detectedType,
          });
        });
      });
      request.once("error", (error) => {
        finish(error instanceof RemoteImageProxyError ? error : new RemoteImageProxyError("fetch"));
      });
      request.end();
    } catch (error) {
      finish(error instanceof RemoteImageProxyError ? error : new RemoteImageProxyError("fetch"));
    }
  });

  const fetchUncached = async (initialUrl, operationTimeoutMs = timeoutMs) => {
    const deadline = nowFn() + operationTimeoutMs;
    let currentUrl = initialUrl;
    const visited = new Set();
    for (let redirectCount = 0; redirectCount <= maxRedirects; redirectCount += 1) {
      const visitKey = cacheKeyForUrl(currentUrl);
      if (visited.has(visitKey)) throw new RemoteImageProxyError("redirect");
      visited.add(visitKey);
      const addresses = await resolveAddresses(currentUrl, deadline);
      const response = await requestOnce(currentUrl, addresses, deadline);
      if (!response.redirect) {
        const dataUrl = `data:${response.mimeType};base64,${response.bytes.toString("base64")}`;
        return {
          byteLength: response.bytes.length,
          cacheTtlMs: response.cacheTtlMs,
          dataUrl,
          mimeType: response.mimeType,
        };
      }
      if (!response.location || redirectCount >= maxRedirects) {
        throw new RemoteImageProxyError("redirect");
      }
      try {
        currentUrl = normalizeRemoteImageUrl(new URL(response.location, currentUrl).href);
      } catch (error) {
        throw error instanceof RemoteImageProxyError
          ? error
          : new RemoteImageProxyError("redirect");
      }
    }
    throw new RemoteImageProxyError("redirect");
  };

  const getDataUrl = async (value, options = {}) => {
    const url = normalizeRemoteImageUrl(value);
    const key = cacheKeyForUrl(url);
    const cached = readCache(key);
    if (cached) return cached;
    const pending = inflight.get(key);
    if (pending) return await pending;

    const requestedTimeoutMs = Number(options?.timeoutMs);
    const operationTimeoutMs = Number.isSafeInteger(requestedTimeoutMs) && requestedTimeoutMs >= 250
      ? Math.min(timeoutMs, requestedTimeoutMs)
      : timeoutMs;
    const operationGeneration = cacheGeneration;
    const operation = fetchUncached(url, operationTimeoutMs).then((result) => {
      if (operationGeneration === cacheGeneration) {
        storeCache(key, result, result.cacheTtlMs);
      }
      return {
        byteLength: result.byteLength,
        dataUrl: result.dataUrl,
        expiresAt: result.cacheTtlMs > 0 ? nowFn() + result.cacheTtlMs : 0,
        fromCache: false,
        mimeType: result.mimeType,
      };
    });
    inflight.set(key, operation);
    try {
      return await operation;
    } finally {
      if (inflight.get(key) === operation) inflight.delete(key);
    }
  };

  return {
    clear: () => {
      cacheGeneration += 1;
      cache.clear();
      cacheBytes = 0;
    },
    getDataUrl,
    stats: () => {
      pruneCache();
      return {
        bytes: cacheBytes,
        entries: cache.size,
        inflight: inflight.size,
      };
    },
  };
}
