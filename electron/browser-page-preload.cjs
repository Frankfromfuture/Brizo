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
