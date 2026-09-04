// All input stays in the selected Chromium page. No native activation or pointer.
export async function withPageInput(contents, signal, callback) {
  signal?.throwIfAborted();
  const debuggerApi = contents.debugger;
  const owned = !debuggerApi.isAttached();
  if (owned) debuggerApi.attach("1.3");
  const send = async (method, params) => {
    signal?.throwIfAborted();
    return debuggerApi.sendCommand(method, params);
  };
  const releaseFocus = () => {
    if (!contents.isDestroyed() && debuggerApi.isAttached()) void debuggerApi.sendCommand("Emulation.setFocusEmulationEnabled", { enabled: false }).catch(() => {});
  };
  signal?.addEventListener("abort", releaseFocus, { once: true });
  try {
    await send("Emulation.setFocusEmulationEnabled", { enabled: true });
    return await callback(send);
  } finally {
    signal?.removeEventListener("abort", releaseFocus);
    if (!contents.isDestroyed() && debuggerApi.isAttached()) {
      await debuggerApi.sendCommand("Emulation.setFocusEmulationEnabled", { enabled: false }).catch(() => {});
      if (owned) debuggerApi.detach();
    }
  }
}

export async function dispatchPageEvents(contents, events, signal, existingSend) {
  const dispatch = async (send) => {
    const zoom = contents.getZoomFactor() || 1;
    const mouseTypes = { mouseMove: "mouseMoved", mouseDown: "mousePressed", mouseUp: "mouseReleased" };
    const codes = { Enter: 13, Escape: 27, Tab: 9, Backspace: 8, Delete: 46, ArrowLeft: 37, ArrowUp: 38, ArrowRight: 39, ArrowDown: 40, Home: 36, End: 35, PageUp: 33, PageDown: 34, " ": 32 };
    for (const event of events) {
      if (mouseTypes[event.type]) {
        await send("Input.dispatchMouseEvent", { type: mouseTypes[event.type], x: event.x / zoom, y: event.y / zoom, button: event.button || "none", buttons: event.type === "mouseDown" ? 1 : 0, clickCount: event.clickCount || 0 });
      } else {
        const rawKey = String(event.keyCode || "");
        const key = /^(Return|Enter|\r)$/i.test(rawKey) ? "Enter" : ({ Up: "ArrowUp", Down: "ArrowDown", Left: "ArrowLeft", Right: "ArrowRight", Space: " " })[rawKey] || rawKey;
        if (key === "Enter" && event.type === "char") continue;
        await send("Input.dispatchKeyEvent", { type: event.type === "keyDown" ? key === "Enter" ? "keyDown" : "rawKeyDown" : event.type, key, code: key === " " ? "Space" : key, windowsVirtualKeyCode: codes[key] || (key.length === 1 ? key.toUpperCase().charCodeAt(0) : 0), ...(key === "Enter" && event.type === "keyDown" ? { text: "\r", unmodifiedText: "\r" } : event.type === "char" ? { text: rawKey, unmodifiedText: rawKey } : {}) });
      }
    }
  };
  return existingSend ? dispatch(existingSend) : withPageInput(contents, signal, dispatch);
}
