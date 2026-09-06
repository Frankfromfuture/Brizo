import assert from "node:assert/strict";
import test from "node:test";

import {
  dispatchPageEvents,
  withPageInput,
} from "../../runtime/electron/agent-page-input.mjs";

test("page input owns and releases a temporary CDP attachment", async () => {
  const calls = [];
  let attached = false;
  const contents = {
    debugger: {
      attach(version) { attached = true; calls.push(["attach", version]); },
      detach() { attached = false; calls.push(["detach"]); },
      isAttached: () => attached,
      async sendCommand(method, params) { calls.push([method, params]); },
    },
    isDestroyed: () => false,
  };

  const result = await withPageInput(contents, new AbortController().signal, async send => {
    await send("Input.dispatchKeyEvent", { key: "A", type: "char" });
    return "done";
  });

  assert.equal(result, "done");
  assert.deepEqual(calls, [
    ["attach", "1.3"],
    ["Emulation.setFocusEmulationEnabled", { enabled: true }],
    ["Input.dispatchKeyEvent", { key: "A", type: "char" }],
    ["Emulation.setFocusEmulationEnabled", { enabled: false }],
    ["detach"],
  ]);
});

test("event dispatch scales mouse coordinates and sends Enter once", async () => {
  const calls = [];
  await dispatchPageEvents({ getZoomFactor: () => 2 }, [
    { button: "left", clickCount: 1, type: "mouseDown", x: 40, y: 20 },
    { keyCode: "Enter", type: "keyDown" },
    { keyCode: "Enter", type: "char" },
  ], undefined, async (method, params) => calls.push([method, params]));

  assert.equal(calls.length, 2);
  assert.deepEqual(calls[0], ["Input.dispatchMouseEvent", {
    button: "left",
    buttons: 1,
    clickCount: 1,
    type: "mousePressed",
    x: 20,
    y: 10,
  }]);
  assert.equal(calls[1][0], "Input.dispatchKeyEvent");
  assert.equal(calls[1][1].key, "Enter");
  assert.equal(calls[1][1].text, "\r");
});
