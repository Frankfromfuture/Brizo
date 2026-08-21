const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("beanBrowser", {
  back: () => ipcRenderer.invoke("bean-browser:back"),
  runBrizoUseCommand: (payload) => ipcRenderer.invoke("bean-browser:run-brizo-use-command", payload),
  pauseBrizoUseCommand: (sessionId) => ipcRenderer.invoke("bean-browser:pause-brizo-use-command", sessionId),
  resumeBrizoUseCommand: (sessionId) => ipcRenderer.invoke("bean-browser:resume-brizo-use-command", sessionId),
  setBrizoUseSandboxLayout: (payload) => ipcRenderer.send("bean-browser:set-brizo-use-sandbox-layout", payload),
  getBriefEdition: (payload) => ipcRenderer.invoke("bean-browser:brief-get-edition", payload),
  getBriefReport: (payload) => ipcRenderer.invoke("bean-browser:brief-get-report", payload),
  saveBriefPreferences: (payload) =>
    ipcRenderer.invoke("bean-browser:brief-save-preferences", payload),
  syncBriefSignals: (payload) => ipcRenderer.invoke("bean-browser:brief-sync-signals", payload),
  captureScreenshot: (mode) => ipcRenderer.invoke("bean-browser:screenshot", mode),
  capturePreview: () => ipcRenderer.invoke("bean-browser:capture-preview"),
  copyText: (text) => ipcRenderer.invoke("bean-browser:copy-text", text),
  closeTabView: (tabId) => ipcRenderer.invoke("bean-browser:close-tab-view", tabId),
  chooseDownloadDirectory: () => ipcRenderer.invoke("bean-browser:choose-download-directory"),
  forward: () => ipcRenderer.invoke("bean-browser:forward"),
  getAppInfo: () => ipcRenderer.invoke("bean-browser:get-app-info"),
  getPageZoom: () => ipcRenderer.invoke("bean-browser:get-page-zoom"),
  getSiteHygiene: () => ipcRenderer.invoke("bean-browser:get-site-hygiene"),
  getState: () => ipcRenderer.invoke("bean-browser:get-state"),
  getSmartBookmarkSnapshot: () => ipcRenderer.invoke("bean-browser:smart-bookmarks-get"),
  importBookmarks: (sourceIds) =>
    ipcRenderer.invoke("bean-browser:import-bookmarks", sourceIds),
  importBookmarksFromHtml: () =>
    ipcRenderer.invoke("bean-browser:import-bookmarks-html"),
  listDownloads: () => ipcRenderer.invoke("bean-browser:list-downloads"),
  openDownloadsDirectory: () => ipcRenderer.invoke("bean-browser:open-downloads-directory"),
  setDownloadPaused: (id, paused) =>
    ipcRenderer.invoke("bean-browser:set-download-paused", id, paused),
  cancelDownload: (id) => ipcRenderer.invoke("bean-browser:cancel-download", id),
  openDownloadedFile: (id) => ipcRenderer.invoke("bean-browser:open-downloaded-file", id),
  deleteDownloadedFile: (id) => ipcRenderer.invoke("bean-browser:delete-downloaded-file", id),
  listPasswords: () => ipcRenderer.invoke("bean-browser:list-passwords"),
  listBookmarkSources: () =>
    ipcRenderer.invoke("bean-browser:list-bookmark-sources"),
  resolveBookmarkFavicons: (bookmarks) =>
    ipcRenderer.invoke("bean-browser:resolve-bookmark-favicons", bookmarks),
  listModelProviders: () => ipcRenderer.invoke("bean-browser:list-model-providers"),
  navigate: (input, tabId) => ipcRenderer.invoke("bean-browser:navigate", input, tabId),
  navigateImage: (input, tabId) =>
    ipcRenderer.invoke("bean-browser:navigate-image", input, tabId),
  navigatePdf: (input, tabId) =>
    ipcRenderer.invoke("bean-browser:navigate-pdf", input, tabId),
  onActivated: (callback) => {
    const listener = () => callback();
    ipcRenderer.on("bean-browser:activated", listener);
    return () => ipcRenderer.removeListener("bean-browser:activated", listener);
  },
  onState: (callback) => {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on("bean-browser:state", listener);
    return () => ipcRenderer.removeListener("bean-browser:state", listener);
  },
  onDownloads: (callback) => {
    const listener = (_event, downloads) => callback(downloads);
    ipcRenderer.on("bean-browser:downloads", listener);
    return () => ipcRenderer.removeListener("bean-browser:downloads", listener);
  },
  onOpenDownloads: (callback) => {
    const listener = () => callback();
    ipcRenderer.on("bean-browser:open-downloads", listener);
    return () => ipcRenderer.removeListener("bean-browser:open-downloads", listener);
  },
  onRequestCloseTab: (callback) => {
    const listener = (_event, tabId) => callback(tabId);
    ipcRenderer.on("bean-browser:request-close-tab", listener);
    return () => ipcRenderer.removeListener("bean-browser:request-close-tab", listener);
  },
  onOpenUrlTab: (callback) => {
    const listener = (_event, url) => callback(url);
    ipcRenderer.on("bean-browser:open-url-tab", listener);
    return () => ipcRenderer.removeListener("bean-browser:open-url-tab", listener);
  },
  onAskSelection: (callback) => {
    const listener = (_event, selectedText) => callback(selectedText);
    ipcRenderer.on("bean-browser:ask-selection", listener);
    return () => ipcRenderer.removeListener("bean-browser:ask-selection", listener);
  },
  onRendererContextAction: (callback) => {
    const listener = (_event, action) => callback(action);
    ipcRenderer.on("bean-browser:renderer-context-action", listener);
    return () => ipcRenderer.removeListener("bean-browser:renderer-context-action", listener);
  },
  onBriefEditionUpdated: (callback) => {
    const listener = (_event, edition) => callback(edition);
    ipcRenderer.on("bean-browser:brief-edition-updated", listener);
    return () => ipcRenderer.removeListener("bean-browser:brief-edition-updated", listener);
  },
  onSearchStream: (callback) => {
    const listener = (_event, message) => callback(message);
    ipcRenderer.on("bean-browser:search-stream", listener);
    return () => ipcRenderer.removeListener("bean-browser:search-stream", listener);
  },
  onBrizoUseProgress: (callback) => {
    const listener = (_event, message) => callback(message);
    ipcRenderer.on("bean-browser:brizo-use-progress", listener);
    return () => ipcRenderer.removeListener("bean-browser:brizo-use-progress", listener);
  },
  onSmartBookmarkProgress: (callback) => {
    const listener = (_event, progress) => callback(progress);
    ipcRenderer.on("bean-browser:smart-bookmarks-progress", listener);
    return () => ipcRenderer.removeListener("bean-browser:smart-bookmarks-progress", listener);
  },
  exportArticlePdf: () => ipcRenderer.invoke("bean-browser:export-article-pdf"),
  exportSearchPdf: (payload) => ipcRenderer.invoke("bean-browser:export-search-pdf", payload),
  downloadCurrentPdf: () => ipcRenderer.invoke("bean-browser:download-current-pdf"),
  openIncognito: () => ipcRenderer.invoke("bean-browser:open-incognito"),
  print: () => ipcRenderer.invoke("bean-browser:print"),
  preconnect: (input) => ipcRenderer.invoke("bean-browser:preconnect", input),
  reload: () => ipcRenderer.invoke("bean-browser:reload"),
  savePassword: (payload) => ipcRenderer.invoke("bean-browser:save-password", payload),
  saveModelProvider: (payload) => ipcRenderer.invoke("bean-browser:save-model-provider", payload),
  showRendererContextMenu: (payload) =>
    ipcRenderer.invoke("bean-browser:show-renderer-context-menu", payload),
  startSearch: (payload) => ipcRenderer.invoke("bean-browser:start-search", payload),
  cancelSearch: (searchId) => ipcRenderer.invoke("bean-browser:cancel-search", searchId),
  searchVane: (payload) => ipcRenderer.invoke("bean-browser:search-vane", payload),
  suggestQueries: (input) => ipcRenderer.invoke("bean-browser:suggest-queries", input),
  syncSmartBookmarks: (payload) => ipcRenderer.invoke("bean-browser:smart-bookmarks-sync", payload),
  setDefaultModelProvider: (id) => ipcRenderer.invoke("bean-browser:set-default-model-provider", id),
  setDownloadDirectory: (directory) => ipcRenderer.invoke("bean-browser:set-download-directory", directory),
  setPageZoom: (factor) => ipcRenderer.invoke("bean-browser:set-page-zoom", factor),
  setSiteHygiene: (value) => ipcRenderer.invoke("bean-browser:set-site-hygiene", value),
  setFullWidth: (enabled) => ipcRenderer.invoke("bean-browser:set-full-width", enabled),
  copyPassword: (id) => ipcRenderer.invoke("bean-browser:copy-password", id),
  deletePassword: (id) => ipcRenderer.invoke("bean-browser:delete-password", id),
  deleteModelProvider: (id) => ipcRenderer.invoke("bean-browser:delete-model-provider", id),
  setBounds: (bounds) => ipcRenderer.send("bean-browser:set-bounds", bounds),
  setVisible: (visible) => ipcRenderer.send("bean-browser:set-visible", visible),
  toggleDownloads: (anchorBounds) =>
    ipcRenderer.invoke("bean-browser:toggle-downloads", anchorBounds),
});
