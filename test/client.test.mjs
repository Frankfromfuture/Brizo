import assert from "node:assert/strict";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import {
  connectBridge,
  executeBrowserCommand,
  validateLaunchConfig,
  validateRuntimeDescriptor,
} from "../lib/client.mjs";

test("validates local runtime descriptors and launch paths", () => {
  const directory = path.join(os.tmpdir(), "brizo-test");
  const valid = {
    protocol: 1,
    socketPath: path.join(directory, "bridge-a1b2c3.sock"),
    token: "a".repeat(64),
    pid: 42,
  };
  assert.equal(validateRuntimeDescriptor(valid, directory), valid);
  assert.throws(
    () => validateRuntimeDescriptor({ ...valid, socketPath: "/tmp/other.sock" }, directory),
    error => error.code === "RUNTIME_INVALID",
  );
  assert.throws(
    () => validateRuntimeDescriptor({ ...valid, protocol: 99 }, directory),
    error => error.code === "PROTOCOL_MISMATCH",
  );
  assert.deepEqual(
    validateLaunchConfig({ executable: "/Applications/Brizo", args: [] }),
    { executable: "/Applications/Brizo", args: ["--agent-bridge-start"] },
  );
  assert.throws(
    () => validateLaunchConfig({ executable: "Brizo" }),
    error => error.code === "LAUNCH_INVALID",
  );
});

test("sends an authenticated ping over the local bridge", async t => {
  if (process.platform === "win32") {
    t.skip("Unix socket fixture");
    return;
  }
  const directory = await mkdtemp(path.join(os.tmpdir(), "brizo-client-"));
  const socketPath = path.join(directory, "bridge-aabbcc.sock");
  const token = "b".repeat(64);
  const server = net.createServer(socket => {
    socket.setEncoding("utf8");
    socket.on("data", input => {
      const request = JSON.parse(input.trim());
      assert.equal(request.method, "ping");
      assert.equal(request.token, token);
      socket.end('{"ok":true,"result":{"protocol":1,"product":"Brizo","pid":123}}\n');
    });
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(socketPath, resolve);
  });
  t.after(async () => {
    await new Promise(resolve => server.close(resolve));
    await rm(directory, { recursive: true, force: true });
  });

  const result = await connectBridge({ socketPath, token }, { method: "ping" });
  assert.equal(result.product, "Brizo");
});

test("stores create capabilities outside command output", async t => {
  if (process.platform === "win32") {
    t.skip("Unix socket fixture");
    return;
  }
  const directory = await mkdtemp(path.join(os.tmpdir(), "brizo-session-"));
  const socketPath = path.join(directory, "bridge-abcdef.sock");
  const token = "c".repeat(64);
  const sessionId = "12345678-1234-1234-1234-123456789abc";
  const capability = "secret-capability";
  const server = net.createServer(socket => {
    socket.setEncoding("utf8");
    socket.on("data", input => {
      const request = JSON.parse(input.trim());
      if (request.method === "ping") {
        socket.end(`{"ok":true,"result":{"protocol":1,"product":"Brizo","pid":${process.pid}}}\n`);
      } else {
        socket.end(`${JSON.stringify({
          ok: true,
          result: { sessionId, capability, state: { status: "agent" } },
        })}\n`);
      }
    });
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(socketPath, resolve);
  });
  await writeFile(
    path.join(directory, "runtime.json"),
    JSON.stringify({ protocol: 1, socketPath, token, pid: process.pid }),
  );
  t.after(async () => {
    await new Promise(resolve => server.close(resolve));
    await rm(directory, { recursive: true, force: true });
  });

  const result = await executeBrowserCommand(
    "create",
    undefined,
    { goal: "test", client: "test" },
    { directory },
  );
  assert.equal(result.capability, undefined);
  const saved = JSON.parse(
    await readFile(path.join(directory, "sessions", `${sessionId}.json`), "utf8"),
  );
  assert.equal(saved.capability, capability);
});
