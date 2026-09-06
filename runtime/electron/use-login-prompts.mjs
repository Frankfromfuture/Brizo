import { ipcMain, WebContentsView } from "electron";
import path from "node:path";

// Native cards remain above WebContentsView without replacing the live login
// page with a screenshot or taking focus away from its fields.
export function createUseLoginPrompts({ getWindow, rendererEntry, onResume, ipc = ipcMain }) {
  const prompts = new Map();
  const findSender = (event) => [...prompts.values()].find((item) => item.view?.webContents === event.sender);
  const closeView = (item) => {
    if (!item.view) return;
    try { getWindow()?.contentView.removeChildView(item.view); } catch {}
    if (!item.view.webContents.isDestroyed()) item.view.webContents.close();
    item.view = null;
  };
  const position = (item) => {
    const window = getWindow();
    if (!window || window.isDestroyed() || !item.view || !item.layout) return;
    const [width, height] = window.getContentSize();
    const cardHeight = item.height || 172;
    item.view.setBounds({
      x: Math.round(Math.max(0, Math.min(width - 212, item.layout.left - 16))),
      y: Math.round(Math.max(0, Math.min(height - cardHeight - 32, item.layout.top - 16))),
      width: 212,
      height: cardHeight + 32,
    });
    window.contentView.addChildView(item.view);
    item.view.setVisible(true);
  };
  ipc.on("brizo-use-login:ready", (event) => {
    const item = findSender(event);
    if (item) event.sender.send("brizo-use-login:state", { domain: item.domain });
  });
  ipc.on("brizo-use-login:size", (event, height) => {
    const item = findSender(event);
    if (!item || !Number.isFinite(height)) return;
    item.height = Math.max(100, Math.min(280, Math.ceil(height)));
    position(item);
  });
  ipc.on("brizo-use-login:action", (event, action) => {
    const item = findSender(event);
    if (!item) return;
    if (action === "dismiss") {
      item.dismissed = true;
      closeView(item);
    } else if (action === "resume") onResume(item.sessionId);
  });
  const show = (item) => {
    const window = getWindow();
    if (item.dismissed || !item.layout || !window || window.isDestroyed()) return;
    if (!item.view) {
      item.view = new WebContentsView({ webPreferences: {
        contextIsolation: true, nodeIntegration: false, sandbox: true,
        preload: path.join(import.meta.dirname, "use-login-prompt-preload.cjs"),
      } });
      item.view.setBackgroundColor("#00000000");
      item.view.setVisible(false);
      item.view.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
      item.view.webContents.on("will-navigate", (event) => event.preventDefault());
      window.contentView.addChildView(item.view);
      void item.view.webContents.loadFile(rendererEntry, { query: { surface: "use-login-prompt" } })
        .then(() => { if (item.view) position(item); })
        .catch(() => closeView(item));
    } else position(item);
  };
  return {
    setWaiting(sessionId, waiting, url = "") {
      const old = prompts.get(sessionId);
      if (!waiting) {
        if (old) closeView(old);
        prompts.delete(sessionId);
        return;
      }
      let domain = "当前网站";
      try { domain = new URL(url).hostname; } catch {}
      const item = old || { sessionId, dismissed: false };
      item.domain = domain;
      prompts.set(sessionId, item);
      show(item);
    },
    setLayout(sessionId, layout, reopen = false) {
      const item = prompts.get(sessionId);
      if (!item || !Number.isFinite(layout?.left) || !Number.isFinite(layout?.top)) return;
      item.layout = { left: layout.left, top: layout.top };
      if (reopen) item.dismissed = false;
      show(item);
    },
  };
}
