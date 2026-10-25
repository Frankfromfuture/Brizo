import { executeBrowserCommand } from "./client.mjs";

// Each method returns evidence and updates the current single-use observation.
// No automatic action retries, implicit task creation, or hidden model calls.
export class AgentSession {
  constructor(sessionId, { command = executeBrowserCommand, clientOptions, observation, capabilities, legacy = false } = {}) {
    this.sessionId = sessionId;
    this.command = command;
    this.clientOptions = clientOptions;
    this.observation = observation;
    this.closed = false;
    this.capabilities = capabilities;
    this.legacy = legacy;
  }

  async call(method, args = {}) {
    if (this.closed) throw Object.assign(new Error("This Agent session is closed."), { code: "CLOSED" });
    if (this.legacy && (["batch", "wait", "diagnostics"].includes(method) || (method === "act" && args.target))) throw Object.assign(new Error("The desktop runtime supports single ref-based actions only. Use a fresh ref or update the host runtime."), { code: "CAPABILITY_UNAVAILABLE" });
    if (this.capabilities && !this.capabilities.methods.includes(method)) throw Object.assign(new Error(`The desktop runtime does not support ${method}. Update the host runtime.`), { code: "CAPABILITY_UNAVAILABLE" });
    try {
      const result = await this.command(method, this.sessionId, args, this.clientOptions);
      if (result.observation) this.observation = result.observation;
      else if (method === "observe") this.observation = result;
      if (["finish", "close"].includes(method)) this.closed = true;
      return result;
    } catch (error) {
      // Never reuse a pre-action observation when the dispatched action failed.
      this.observation = error.details?.observation;
      throw error;
    }
  }

  observe(options) { return this.call("observe", options); }
  async screenshot(options) {
    const result = await this.call("screenshot", { observe: options });
    // Legacy capture replaces refs internally but does not return its snapshot.
    if (this.legacy && !result.observation) return { ...result, observation: await this.observe() };
    return result;
  }
  wait(condition) { return this.call("wait", condition); }
  act(action) { return this.call("act", { ...action, snapshotId: this.observation?.snapshotId }); }
  batch(actions, observe) { return this.call("batch", { actions, observe, snapshotId: this.observation?.snapshotId }); }
  open(url) { return this.call("open", { url }); }
  switch(tabId) { return this.call("switch", { tabId }); }
  diagnostics() { return this.call("diagnostics"); }
  finish(summary, { keep = false, ...rest } = {}) { return this.call("finish", { summary, keep, ...rest }); }
  close() { return this.call("close"); }
}

export async function createAgentSession(args, options = {}) {
  const command = options.command || executeBrowserCommand;
  const created = await command("create", undefined, args, options.clientOptions);
  const session = new AgentSession(created.sessionId, { ...options, observation: created.observation, capabilities: created.capabilities, legacy: !created.capabilities && !created.observation });
  session.state = created.state;
  if (!created.observation && created.state?.status === "agent") await session.observe();
  return session;
}
