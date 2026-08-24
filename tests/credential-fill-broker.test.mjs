import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";
import {
  CREDENTIAL_FILL_NONCE_TTL_MS,
  createCredentialFillBroker,
} from "../electron/credential-fill-broker.mjs";

const binding = (overrides = {}) => ({
  credentialId: "credential-1",
  formFingerprint: "sha256:form-1",
  frameProcessId: 100,
  frameRoutingId: 7,
  origin: "https://login.example.com:8443",
  webContentsId: 42,
  ...overrides,
});

function createTimerHarness() {
  const timers = [];
  return {
    clearTimeoutFn: (timer) => {
      timer.cleared = true;
    },
    setTimeoutFn: (callback, delay) => {
      const timer = {
        callback,
        cleared: false,
        delay,
        unrefCalled: false,
        unref() {
          this.unrefCalled = true;
        },
      };
      timers.push(timer);
      return timer;
    },
    timers,
  };
}

test("credential fill nonce is random, one-time and bound to every authorization field", () => {
  const broker = createCredentialFillBroker();
  const nonce = broker.issue(binding());

  assert.match(nonce, /^[A-Za-z0-9_-]{43}$/u);
  assert.equal(broker.consume(nonce, binding()), true);
  assert.equal(broker.consume(nonce, binding()), false);
  assert.equal(broker.pendingCount(), 0);
  broker.dispose();
});

test("any mismatched field rejects and consumes the nonce", () => {
  const mutations = [
    { webContentsId: 43 },
    { frameProcessId: 101 },
    { frameRoutingId: 8 },
    { origin: "https://sub.login.example.com:8443" },
    { origin: "https://login.example.com:9443" },
    { credentialId: "credential-2" },
    { formFingerprint: "sha256:form-2" },
  ];

  for (const mutation of mutations) {
    const broker = createCredentialFillBroker();
    const nonce = broker.issue(binding());
    assert.equal(broker.consume(nonce, binding(mutation)), false, JSON.stringify(mutation));
    assert.equal(broker.consume(nonce, binding()), false, "mismatch must burn the nonce");
    broker.dispose();
  }
});

test("only canonical HTTPS origins and complete bindings can be issued", () => {
  const invalidBindings = [
    binding({ origin: "http://login.example.com" }),
    binding({ origin: "https://login.example.com/path" }),
    binding({ origin: "https://user:pass@login.example.com" }),
    binding({ origin: "null" }),
    binding({ webContentsId: 0 }),
    binding({ frameProcessId: -1 }),
    binding({ frameRoutingId: -1 }),
    binding({ credentialId: "" }),
    binding({ formFingerprint: " fingerprint-with-leading-space" }),
  ];
  const broker = createCredentialFillBroker();
  for (const claims of invalidBindings) {
    assert.throws(() => broker.issue(claims), /Invalid credential fill binding/u);
  }
  assert.equal(broker.pendingCount(), 0);
  broker.dispose();
});

test("default 15 second timer is unrefed and evicts an expired nonce", () => {
  let now = 1_000;
  const timers = createTimerHarness();
  const broker = createCredentialFillBroker({
    clearTimeoutFn: timers.clearTimeoutFn,
    nowFn: () => now,
    setTimeoutFn: timers.setTimeoutFn,
  });
  const nonce = broker.issue(binding());

  assert.equal(timers.timers[0].delay, CREDENTIAL_FILL_NONCE_TTL_MS);
  assert.equal(timers.timers[0].unrefCalled, true);
  now += CREDENTIAL_FILL_NONCE_TTL_MS;
  timers.timers[0].callback();
  assert.equal(broker.pendingCount(), 0);
  assert.equal(broker.consume(nonce, binding()), false);
  broker.dispose();
});

test("capacity eviction removes the oldest pending nonce", () => {
  let counter = 0;
  const broker = createCredentialFillBroker({
    maxEntries: 2,
    randomBytesFn: () => {
      counter += 1;
      return Buffer.alloc(32, counter);
    },
  });
  const first = broker.issue(binding({ credentialId: "credential-1" }));
  const second = broker.issue(binding({ credentialId: "credential-2" }));
  const third = broker.issue(binding({ credentialId: "credential-3" }));

  assert.equal(broker.pendingCount(), 2);
  assert.equal(broker.consume(first, binding({ credentialId: "credential-1" })), false);
  assert.equal(broker.consume(second, binding({ credentialId: "credential-2" })), true);
  assert.equal(broker.consume(third, binding({ credentialId: "credential-3" })), true);
  broker.dispose();
});

test("navigation can revoke one frame and contents destruction can revoke every frame", () => {
  const broker = createCredentialFillBroker();
  const frameOneFirst = broker.issue(binding({ credentialId: "credential-1" }));
  const frameOneSecond = broker.issue(binding({ credentialId: "credential-2" }));
  const frameTwo = broker.issue(binding({ credentialId: "credential-3", frameRoutingId: 8 }));
  const otherContents = broker.issue(binding({ credentialId: "credential-4", webContentsId: 99 }));

  assert.equal(broker.revokeFrame({ webContentsId: 42, frameProcessId: 100, frameRoutingId: 7 }), 2);
  assert.equal(broker.consume(frameOneFirst, binding({ credentialId: "credential-1" })), false);
  assert.equal(broker.consume(frameOneSecond, binding({ credentialId: "credential-2" })), false);
  assert.equal(broker.consume(frameTwo, binding({ credentialId: "credential-3", frameRoutingId: 8 })), true);

  assert.equal(broker.revokeWebContents(99), 1);
  assert.equal(broker.consume(otherContents, binding({ credentialId: "credential-4", webContentsId: 99 })), false);
  broker.dispose();
});

test("issuing copies only authorization metadata and ignores unrelated caller data", () => {
  const broker = createCredentialFillBroker();
  const claims = binding({ unrelatedSensitiveValue: randomBytes(32).toString("base64url") });
  const expected = binding();
  const nonce = broker.issue(claims);

  claims.credentialId = "mutated-after-issue";
  claims.formFingerprint = "mutated-after-issue";
  claims.unrelatedSensitiveValue = "mutated-after-issue";
  assert.equal(broker.consume(nonce, expected), true);
  broker.dispose();
});
