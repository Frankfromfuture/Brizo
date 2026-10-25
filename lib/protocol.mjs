export const BRIZO_PROTOCOL_VERSION = 1;
export const BRIZO_MIN_PROTOCOL_VERSION = 1;
export const BRIZO_MAX_PROTOCOL_VERSION = 1;
export const BRIZO_PRODUCT_NAME = "Brizo";

export const BRIDGE_METHOD_NAMES = Object.freeze([
  "ping",
  "create",
  "status",
  "observe",
  "screenshot",
  "act",
  "batch",
  "wait",
  "diagnostics",
  "open",
  "switch",
  "close-tab",
  "handoff",
  "finish",
  "close",
]);

export const JSON_INPUT_METHOD_NAMES = Object.freeze([
  "create",
  "act",
  "batch",
  "wait",
  "observe",
  "screenshot",
  "open",
  "switch",
  "close-tab",
  "handoff",
  "finish",
]);

const BRIDGE_METHOD_SET = new Set(BRIDGE_METHOD_NAMES);
const JSON_INPUT_METHOD_SET = new Set(JSON_INPUT_METHOD_NAMES);

export function isBridgeMethod(value) {
  return BRIDGE_METHOD_SET.has(value);
}

export function bridgeMethodReadsJson(value) {
  return JSON_INPUT_METHOD_SET.has(value);
}

export function supportsBrizoProtocol(value) {
  return Number.isInteger(value)
    && value >= BRIZO_MIN_PROTOCOL_VERSION
    && value <= BRIZO_MAX_PROTOCOL_VERSION;
}

// Additive extensions are negotiated separately from the authenticated wire protocol.
export const BRIZO_AGENT_CAPABILITIES = Object.freeze({
  version: 1,
  actions: ["click", "fill", "select", "press", "scroll", "navigate", "back", "forward", "reload", "hover", "double-click", "drag"],
  methods: BRIDGE_METHOD_NAMES,
  targets: ["ref", "role/name", "text", "fieldName", "href"],
  observations: ["compact", "full", "filter", "delta", "text"],
  waits: ["text", "url", "target", "value", "checked", "enabled", "stable"],
  batch: { maxActions: 20, timeoutMs: 24000, stopOnError: true },
  visual: { units: "css-pixels", coordinates: "viewport", surface: "canvas", screenshotObservation: true, scales: ["css", "device"] },
});
