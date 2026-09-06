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
