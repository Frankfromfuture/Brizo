import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const PASSWORD_CLIPBOARD_TTL_MS = 30_000;

function fingerprint(key, value) {
  return createHmac("sha256", key).update(value, "utf8").digest();
}

export function createExpiringClipboard({
  clipboard,
  timeoutMs = PASSWORD_CLIPBOARD_TTL_MS,
  setTimeoutFn = setTimeout,
  clearTimeoutFn = clearTimeout,
} = {}) {
  if (!clipboard || typeof clipboard.readText !== "function" || typeof clipboard.writeText !== "function") {
    throw new TypeError("A readable and writable clipboard is required.");
  }

  const expiryMs = Number.isFinite(timeoutMs) && timeoutMs >= 0
    ? timeoutMs
    : PASSWORD_CLIPBOARD_TTL_MS;
  const fingerprintKey = randomBytes(32);
  let generation = 0;
  let ownedFingerprint = null;
  let expiryTimer = null;

  const cancelExpiry = () => {
    generation += 1;
    ownedFingerprint = null;
    if (expiryTimer) clearTimeoutFn(expiryTimer);
    expiryTimer = null;
  };

  const clearIfOwned = () => {
    const expectedFingerprint = ownedFingerprint;
    if (!Buffer.isBuffer(expectedFingerprint)) return false;

    let currentText;
    try {
      currentText = clipboard.readText();
    } catch {
      cancelExpiry();
      return false;
    }
    const currentFingerprint = typeof currentText === "string"
      ? fingerprint(fingerprintKey, currentText)
      : null;
    if (!currentFingerprint
      || currentFingerprint.length !== expectedFingerprint.length
      || !timingSafeEqual(currentFingerprint, expectedFingerprint)) {
      cancelExpiry();
      return false;
    }

    clipboard.writeText("");
    cancelExpiry();
    return true;
  };

  const writeSensitiveText = (value) => {
    if (typeof value !== "string" || !value) return false;
    cancelExpiry();
    clipboard.writeText(value);

    ownedFingerprint = fingerprint(fingerprintKey, value);
    const scheduledGeneration = generation;
    expiryTimer = setTimeoutFn(() => {
      if (scheduledGeneration !== generation) return;
      expiryTimer = null;
      clearIfOwned();
    }, expiryMs);
    expiryTimer?.unref?.();
    return true;
  };

  return {
    cancel: cancelExpiry,
    clearIfOwned,
    writeSensitiveText,
  };
}
