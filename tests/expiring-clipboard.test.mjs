import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import {
  createExpiringClipboard,
  PASSWORD_CLIPBOARD_TTL_MS,
} from "../electron/expiring-clipboard.mjs";

function createClipboardHarness() {
  let text = "";
  const writes = [];
  return {
    clipboard: {
      readText: () => text,
      writeText: (value) => {
        text = value;
        writes.push(value);
      },
    },
    get text() {
      return text;
    },
    set text(value) {
      text = value;
    },
    writes,
  };
}

function createTimerHarness() {
  const records = [];
  return {
    clearTimeoutFn: (handle) => {
      handle.cleared = true;
    },
    records,
    setTimeoutFn: (callback, delay) => {
      const handle = {
        callback,
        cleared: false,
        delay,
        unrefCalled: false,
        unref() {
          this.unrefCalled = true;
        },
      };
      records.push(handle);
      return handle;
    },
  };
}

test("sensitive clipboard uses a 30 second unrefed expiry and clears its own value", () => {
  const sensitiveValue = randomUUID();
  const target = createClipboardHarness();
  const timers = createTimerHarness();
  const expiringClipboard = createExpiringClipboard({
    clipboard: target.clipboard,
    clearTimeoutFn: timers.clearTimeoutFn,
    setTimeoutFn: timers.setTimeoutFn,
  });

  assert.equal(expiringClipboard.writeSensitiveText(sensitiveValue), true);
  assert.equal(target.text, sensitiveValue);
  assert.equal(timers.records[0].delay, PASSWORD_CLIPBOARD_TTL_MS);
  assert.equal(timers.records[0].unrefCalled, true);

  timers.records[0].callback();
  assert.equal(target.text, "");
});

test("expiry never removes newer clipboard content copied by the user", () => {
  const sensitiveValue = randomUUID();
  const target = createClipboardHarness();
  const timers = createTimerHarness();
  const expiringClipboard = createExpiringClipboard({
    clipboard: target.clipboard,
    clearTimeoutFn: timers.clearTimeoutFn,
    setTimeoutFn: timers.setTimeoutFn,
  });

  expiringClipboard.writeSensitiveText(sensitiveValue);
  target.text = "the user's later copy";
  timers.records[0].callback();

  assert.equal(target.text, "the user's later copy");
  assert.deepEqual(target.writes, [sensitiveValue]);
});

test("a repeated sensitive copy invalidates the old timer even if its callback still runs", () => {
  const firstSensitiveValue = randomUUID();
  const secondSensitiveValue = randomUUID();
  const target = createClipboardHarness();
  const timers = createTimerHarness();
  const expiringClipboard = createExpiringClipboard({
    clipboard: target.clipboard,
    clearTimeoutFn: timers.clearTimeoutFn,
    setTimeoutFn: timers.setTimeoutFn,
  });

  expiringClipboard.writeSensitiveText(firstSensitiveValue);
  expiringClipboard.writeSensitiveText(secondSensitiveValue);
  assert.equal(timers.records[0].cleared, true);

  target.text = firstSensitiveValue;
  timers.records[0].callback();
  assert.equal(target.text, firstSensitiveValue);

  target.text = secondSensitiveValue;
  timers.records[1].callback();
  assert.equal(target.text, "");
});

test("clearIfOwned supports safe shutdown cleanup without deleting unrelated content", () => {
  const ownedSensitiveValue = randomUUID();
  const owned = createClipboardHarness();
  const ownedTimers = createTimerHarness();
  const ownedClipboard = createExpiringClipboard({
    clipboard: owned.clipboard,
    clearTimeoutFn: ownedTimers.clearTimeoutFn,
    setTimeoutFn: ownedTimers.setTimeoutFn,
  });
  ownedClipboard.writeSensitiveText(ownedSensitiveValue);
  assert.equal(ownedClipboard.clearIfOwned(), true);
  assert.equal(owned.text, "");

  const changed = createClipboardHarness();
  const changedSensitiveValue = randomUUID();
  const changedTimers = createTimerHarness();
  const changedClipboard = createExpiringClipboard({
    clipboard: changed.clipboard,
    clearTimeoutFn: changedTimers.clearTimeoutFn,
    setTimeoutFn: changedTimers.setTimeoutFn,
  });
  changedClipboard.writeSensitiveText(changedSensitiveValue);
  changed.text = "unrelated";
  assert.equal(changedClipboard.clearIfOwned(), false);
  assert.equal(changed.text, "unrelated");
});
