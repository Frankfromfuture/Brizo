import { randomBytes } from "node:crypto";

export const CREDENTIAL_FILL_NONCE_TTL_MS = 15_000;
export const CREDENTIAL_FILL_NONCE_CAPACITY = 256;

const NONCE_BYTES = 32;
const MAX_IDENTIFIER_LENGTH = 512;

function normalizeInteger(value, { positive = false } = {}) {
  if (!Number.isSafeInteger(value)) return null;
  if (positive ? value <= 0 : value < 0) return null;
  return value;
}

function normalizeOpaqueIdentifier(value) {
  if (typeof value !== "string"
    || !value
    || value.length > MAX_IDENTIFIER_LENGTH
    || value !== value.trim()
    || /[\u0000-\u001f\u007f]/u.test(value)) return null;
  return value;
}

function normalizeHttpsOrigin(value) {
  if (typeof value !== "string" || !value || value !== value.trim()) return null;
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "https:"
      || parsed.username
      || parsed.password
      || parsed.pathname !== "/"
      || parsed.search
      || parsed.hash
      || parsed.origin === "null") return null;
    return parsed.origin;
  } catch {
    return null;
  }
}

function normalizeBinding(value) {
  if (!value || typeof value !== "object") return null;
  const webContentsId = normalizeInteger(value.webContentsId, { positive: true });
  const frameProcessId = normalizeInteger(value.frameProcessId, { positive: true });
  const frameRoutingId = normalizeInteger(value.frameRoutingId);
  const origin = normalizeHttpsOrigin(value.origin);
  const credentialId = normalizeOpaqueIdentifier(value.credentialId);
  const formFingerprint = normalizeOpaqueIdentifier(value.formFingerprint);
  if (webContentsId === null
    || frameProcessId === null
    || frameRoutingId === null
    || !origin
    || !credentialId
    || !formFingerprint) return null;
  return {
    credentialId,
    formFingerprint,
    frameProcessId,
    frameRoutingId,
    origin,
    webContentsId,
  };
}

function bindingsMatch(left, right) {
  return left.webContentsId === right.webContentsId
    && left.frameProcessId === right.frameProcessId
    && left.frameRoutingId === right.frameRoutingId
    && left.origin === right.origin
    && left.credentialId === right.credentialId
    && left.formFingerprint === right.formFingerprint;
}

export function createCredentialFillBroker({
  ttlMs = CREDENTIAL_FILL_NONCE_TTL_MS,
  maxEntries = CREDENTIAL_FILL_NONCE_CAPACITY,
  nowFn = Date.now,
  randomBytesFn = randomBytes,
  setTimeoutFn = setTimeout,
  clearTimeoutFn = clearTimeout,
} = {}) {
  if (!Number.isFinite(ttlMs) || ttlMs <= 0) throw new TypeError("ttlMs must be positive.");
  if (!Number.isSafeInteger(maxEntries) || maxEntries <= 0) throw new TypeError("maxEntries must be positive.");
  if (typeof nowFn !== "function"
    || typeof randomBytesFn !== "function"
    || typeof setTimeoutFn !== "function"
    || typeof clearTimeoutFn !== "function") {
    throw new TypeError("Credential fill broker dependencies must be functions.");
  }

  const records = new Map();
  let expiryTimer = null;
  let timerGeneration = 0;

  const pruneExpired = (now = nowFn()) => {
    for (const [nonce, record] of records) {
      if (record.expiresAt <= now) records.delete(nonce);
    }
  };

  const scheduleExpiry = () => {
    timerGeneration += 1;
    const scheduledGeneration = timerGeneration;
    if (expiryTimer) clearTimeoutFn(expiryTimer);
    expiryTimer = null;
    if (!records.size) return;

    let nextExpiry = Infinity;
    for (const record of records.values()) nextExpiry = Math.min(nextExpiry, record.expiresAt);
    expiryTimer = setTimeoutFn(() => {
      if (scheduledGeneration !== timerGeneration) return;
      expiryTimer = null;
      pruneExpired();
      scheduleExpiry();
    }, Math.max(0, nextExpiry - nowFn()));
    expiryTimer?.unref?.();
  };

  const createNonce = () => {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const bytes = randomBytesFn(NONCE_BYTES);
      if (!(bytes instanceof Uint8Array) || bytes.byteLength !== NONCE_BYTES) {
        throw new TypeError(`randomBytesFn must return ${NONCE_BYTES} bytes.`);
      }
      const nonce = Buffer.from(bytes).toString("base64url");
      if (!records.has(nonce)) return nonce;
    }
    throw new Error("Unable to allocate a unique credential fill nonce.");
  };

  const issue = (claims) => {
    const binding = normalizeBinding(claims);
    if (!binding) throw new TypeError("Invalid credential fill binding.");
    const now = nowFn();
    pruneExpired(now);
    const nonce = createNonce();
    while (records.size >= maxEntries) records.delete(records.keys().next().value);
    records.set(nonce, {
      ...binding,
      expiresAt: now + ttlMs,
    });
    scheduleExpiry();
    return nonce;
  };

  const consume = (nonce, claims) => {
    if (typeof nonce !== "string" || !nonce) return false;
    const record = records.get(nonce);
    if (!record) return false;

    // Every attempted use consumes the capability, including an expired or
    // mismatched request. A caller must obtain a fresh user-authorized nonce.
    records.delete(nonce);
    const binding = normalizeBinding(claims);
    const accepted = record.expiresAt > nowFn()
      && Boolean(binding)
      && bindingsMatch(record, binding);
    scheduleExpiry();
    return accepted;
  };

  const revokeFrame = ({ webContentsId, frameProcessId, frameRoutingId } = {}) => {
    const normalizedWebContentsId = normalizeInteger(webContentsId, { positive: true });
    const normalizedFrameProcessId = normalizeInteger(frameProcessId, { positive: true });
    const normalizedFrameRoutingId = normalizeInteger(frameRoutingId);
    if (normalizedWebContentsId === null
      || normalizedFrameProcessId === null
      || normalizedFrameRoutingId === null) return 0;
    let revoked = 0;
    for (const [nonce, record] of records) {
      if (record.webContentsId === normalizedWebContentsId
        && record.frameProcessId === normalizedFrameProcessId
        && record.frameRoutingId === normalizedFrameRoutingId) {
        records.delete(nonce);
        revoked += 1;
      }
    }
    if (revoked) scheduleExpiry();
    return revoked;
  };

  const revokeWebContents = (webContentsId) => {
    const normalizedWebContentsId = normalizeInteger(webContentsId, { positive: true });
    if (normalizedWebContentsId === null) return 0;
    let revoked = 0;
    for (const [nonce, record] of records) {
      if (record.webContentsId === normalizedWebContentsId) {
        records.delete(nonce);
        revoked += 1;
      }
    }
    if (revoked) scheduleExpiry();
    return revoked;
  };

  const dispose = () => {
    records.clear();
    timerGeneration += 1;
    if (expiryTimer) clearTimeoutFn(expiryTimer);
    expiryTimer = null;
  };

  return {
    consume,
    dispose,
    issue,
    pendingCount: () => records.size,
    revokeFrame,
    revokeWebContents,
  };
}
