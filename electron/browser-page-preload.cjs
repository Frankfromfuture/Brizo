const { ipcRenderer } = require("electron");

let lastInteractionAt = 0;

function reportPageInteraction(event) {
  if (!event.isTrusted) return;

  const now = Date.now();
  if (now - lastInteractionAt < 120) return;
  lastInteractionAt = now;
  ipcRenderer.send("bean-browser:page-interaction", event.type);
}

window.addEventListener("pointerdown", reportPageInteraction, true);
window.addEventListener("mousedown", reportPageInteraction, true);
window.addEventListener("wheel", reportPageInteraction, {
  capture: true,
  passive: true,
});
window.addEventListener("touchstart", reportPageInteraction, {
  capture: true,
  passive: true,
});
window.addEventListener("scroll", reportPageInteraction, {
  capture: true,
  passive: true,
});

let lastSelectionMenuSignature = "";
function reportCompletedSelection(event) {
  if (event && !event.isTrusted) return;
  window.requestAnimationFrame(() => {
    const selection = window.getSelection();
    const text = String(selection?.toString() || "").trim().slice(0, 12_000);
    if (!text || !selection?.rangeCount || selection.isCollapsed) {
      lastSelectionMenuSignature = "";
      return;
    }
    const range = selection.getRangeAt(selection.rangeCount - 1);
    const rects = range.getClientRects();
    const rect = rects.length ? rects[rects.length - 1] : range.getBoundingClientRect();
    const x = Math.round(Math.min(window.innerWidth - 8, Math.max(8, rect.right)));
    const y = Math.round(Math.min(window.innerHeight - 8, Math.max(8, rect.bottom + 4)));
    const signature = `${text}\u0000${x}\u0000${y}`;
    if (signature === lastSelectionMenuSignature) return;
    lastSelectionMenuSignature = signature;
    ipcRenderer.send("bean-browser:selection-menu", { text, x, y });
  });
}

window.addEventListener("pointerup", reportCompletedSelection, true);
window.addEventListener("keyup", (event) => {
  if (event.shiftKey || ["Shift", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) {
    reportCompletedSelection(event);
  }
}, true);

let topEdgeChangeTimer = 0;
function reportTopEdgeChange() {
  window.clearTimeout(topEdgeChangeTimer);
  topEdgeChangeTimer = window.setTimeout(() => {
    ipcRenderer.send("bean-browser:page-interaction", "top-edge-change");
  }, 180);
}

window.addEventListener("DOMContentLoaded", () => {
  const observer = new MutationObserver(reportTopEdgeChange);
  observer.observe(document.documentElement, {
    attributes: true,
    childList: true,
    subtree: true,
  });
  window.addEventListener("load", reportTopEdgeChange, { once: true });
  window.addEventListener("transitionend", reportTopEdgeChange, true);
}, { once: true });
