import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";

import { connectBridge } from "../../lib/client.mjs";
import { startAgentBridgeCore } from "../../runtime/electron/agent-bridge-core.mjs";

test("local bridge authenticates the process token and isolates session capabilities", async t => {
  if (process.platform === "win32") {
    t.skip("Unix socket fixture");
    return;
  }

  const directory = await mkdtemp(path.join(os.tmpdir(), "brizo-runtime-"));
  const destroyed = [];
  const bridge = await startAgentBridgeCore({
    directory,
    createSandbox: async ({ id, goal }) => ({
      control: (action) => ({ action, id }),
      destroy: () => destroyed.push(id),
      request: async method => ({ method, status: "agent" }),
      state: () => ({ goal, id, status: "agent" }),
    }),
  });
  t.after(async () => {
    await bridge.close();
    await rm(directory, { recursive: true, force: true });
  });

  const descriptor = JSON.parse(await readFile(path.join(directory, "runtime.json"), "utf8"));
  const pong = await connectBridge(descriptor, { method: "ping" });
  assert.equal(pong.protocol, 1);
  assert.equal(pong.product, "Brizo");

  await assert.rejects(
    connectBridge({ ...descriptor, token: "0".repeat(64) }, { method: "ping" }),
    error => error.code === "UNAUTHORIZED",
  );
  await assert.rejects(
    connectBridge(descriptor, { method: "unknown" }),
    error => error.code === "METHOD_UNKNOWN",
  );

  const created = await connectBridge(descriptor, {
    args: { client: "test", goal: "读取标题" },
    method: "create",
  });
  assert.match(created.sessionId, /^[a-f0-9-]{36}$/u);
  assert.match(created.capability, /^[a-f0-9]{64}$/u);

  await assert.rejects(
    connectBridge(descriptor, {
      capability: "0".repeat(64),
      method: "status",
      sessionId: created.sessionId,
    }),
    error => error.code === "SESSION_SCOPE",
  );
  const status = await connectBridge(descriptor, {
    capability: created.capability,
    method: "status",
    sessionId: created.sessionId,
  });
  assert.deepEqual(status, { method: "status", status: "agent" });
  assert.deepEqual(destroyed, []);
});
