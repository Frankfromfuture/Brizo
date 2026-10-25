import { evaluateBrowserPage } from "./browser-command-agent.mjs";
import { withPageInput } from "./agent-page-input.mjs";
import { agentError } from "./agent-session-tools.mjs";

export function authorizeVisualIntent(command, action) {
  if (action.action === "hover") return;
  const pattern = action.action === "drag" ? /drag|move|拖|移动|挪/iu
    : action.action === "double-click" ? /double[ -]?click|dblclick|双击/iu
      : /click|tap|点击|点选|点按/iu;
  if (!pattern.test(String(command || ""))) throw agentError("VISUAL_INTENT_REQUIRED", "The original user goal must authorize the requested canvas input.");
}

// Deliberately bounded page input, never native mouse/keyboard automation.
export async function executeVisualAction(contents, action, snapshot, signal) {
  const point = value => {
    const { x, y } = value || {};
    if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0 || x >= snapshot.viewport.width || y >= snapshot.viewport.height) {
      throw agentError("COORDINATE_INVALID", "Coordinates must be viewport CSS pixels inside the observed viewport.");
    }
    return { x, y };
  };
  const from = point(action.from || action);
  const to = action.action === "drag" ? point(action.to) : from;
  const canvas = await evaluateBrowserPage(contents, `(() => {
    const from = ${JSON.stringify(from)}, to = ${JSON.stringify(to)};
    const first = document.elementFromPoint(from.x, from.y);
    const last = document.elementFromPoint(to.x, to.y);
    if (first?.tagName !== 'CANVAS' || first !== last) return false;
    const rect = first.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  })()`);
  if (!canvas) throw agentError("VISUAL_TARGET_INVALID", "Coordinate input is limited to one visible canvas. Use a ref or semantic target for DOM controls.");
  return withPageInput(contents, signal, async send => {
    const mouse = (type, p, extras = {}) => send("Input.dispatchMouseEvent", { type, ...p, button: "none", ...extras });
    await mouse("mouseMoved", from);
    let down = false;
    try {
      if (action.action !== "hover") {
        const count = action.action === "double-click" ? 2 : 1;
        for (let clickCount = 1; clickCount <= count; clickCount++) {
          await mouse("mousePressed", from, { button: "left", buttons: 1, clickCount });
          down = true;
          if (action.action === "drag") {
            const steps = action.steps ?? 2;
            for (let step = 1; step <= steps; step++) await mouse("mouseMoved", {
              x: from.x + (to.x - from.x) * step / steps,
              y: from.y + (to.y - from.y) * step / steps,
            }, { button: "left", buttons: 1 });
          }
          await mouse("mouseReleased", to, { button: "left", buttons: 0, clickCount });
          down = false;
        }
      }
    } finally {
      // Release a pressed pointer even when cancellation prevents further actions.
      if (down && !contents.isDestroyed() && contents.debugger.isAttached()) {
        await contents.debugger.sendCommand("Input.dispatchMouseEvent", { type: "mouseReleased", ...to, button: "left", buttons: 0, clickCount: 1 }).catch(() => {});
      }
    }
    return { status: "continued", result: "input-dispatched", postcondition: { kind: "visual", verified: false, requiresScreenshot: true } };
  });
}
