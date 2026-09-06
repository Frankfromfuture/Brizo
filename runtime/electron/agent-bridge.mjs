import { createAgentSandbox } from "./agent-browser.mjs";
import { startAgentBridgeCore } from "./agent-bridge-core.mjs";

export { startAgentBridgeCore } from "./agent-bridge-core.mjs";

export function startAgentBridge(options) {
  return startAgentBridgeCore({ ...options, createSandbox: createAgentSandbox });
}
