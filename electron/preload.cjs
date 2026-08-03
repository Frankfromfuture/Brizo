const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("beanBrowser", {
  back: () => ipcRenderer.invoke("bean-browser:back"),
  askCurrentPage: (payload) => ipcRenderer.invoke("bean-browser:ask-current-page", payload),
  getBriefEdition: (payload) => ipcRenderer.invoke("bean-browser:brief-get-edition", payload),
  getBriefReport: (payload) => ipcRenderer.invoke("bean-browser:brief-get-report", payload),
  saveBriefPreferences: (payload) =>
    ipcRenderer.invoke("bean-browser:brief-save-preferences", payload),
  syncBriefSignals: (payload) => ipcRenderer.invoke("bean-browser:brief-sync-signals", payload),
  captureScreenshot: (mode) => ipcRenderer.invoke("bean-browser:screenshot", mode),
  capturePreview: () => ipcRenderer.invoke("bean-browser:capture-preview"),
  closeTabView: (tabId) => ipcRenderer.invoke("bean-browser:close-tab-view", tabId),
  chooseDownloadDirectory: () => ipcRenderer.invoke("bean-browser:choose-download-directory"),
  forward: () => ipcRenderer.invoke("bean-browser:forward"),
  getAppInfo: () => ipcRenderer.invoke("bean-browser:get-app-info"),
  getState: () => ipcRenderer.invoke("bean-browser:get-state"),
  importBookmarks: (sourceIds) =>
    ipcRenderer.invoke("bean-browser:import-bookmarks", sourceIds),
  importBookmarksFromHtml: () =>
    ipcRenderer.invoke("bean-browser:import-bookmarks-html"),
  listDownloads: () => ipcRenderer.invoke("bean-browser:list-downloads"),
  listBookmarkSources: () =>
    ipcRenderer.invoke("bean-browser:list-bookmark-sources"),
  listModelProviders: () => ipcRenderer.invoke("bean-browser:list-model-providers"),
  navigate: (input, tabId) => ipcRenderer.invoke("bean-browser:navigate", input, tabId),
  navigateImage: (input, tabId) =>
    ipcRenderer.invoke("bean-browser:navigate-image", input, tabId),
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
  onBriefEditionUpdated: (callback) => {
    const listener = (_event, edition) => callback(edition);
    ipcRenderer.on("bean-browser:brief-edition-updated", listener);
    return () => ipcRenderer.removeListener("bean-browser:brief-edition-updated", listener);
  },
  exportArticlePdf: () => ipcRenderer.invoke("bean-browser:export-article-pdf"),
  openIncognito: () => ipcRenderer.invoke("bean-browser:open-incognito"),
  print: () => ipcRenderer.invoke("bean-browser:print"),
  preconnect: (input) => ipcRenderer.invoke("bean-browser:preconnect", input),
  reload: () => ipcRenderer.invoke("bean-browser:reload"),
  saveModelProvider: (payload) => ipcRenderer.invoke("bean-browser:save-model-provider", payload),
  searchVane: (payload) => ipcRenderer.invoke("bean-browser:search-vane", payload),
  suggestQueries: (input) => ipcRenderer.invoke("bean-browser:suggest-queries", input),
  setDefaultModelProvider: (id) => ipcRenderer.invoke("bean-browser:set-default-model-provider", id),
  setDownloadDirectory: (directory) => ipcRenderer.invoke("bean-browser:set-download-directory", directory),
  deleteModelProvider: (id) => ipcRenderer.invoke("bean-browser:delete-model-provider", id),
  setBounds: (bounds) => ipcRenderer.send("bean-browser:set-bounds", bounds),
  setVisible: (visible) => ipcRenderer.send("bean-browser:set-visible", visible),
  toggleDownloads: (anchorBounds) =>
    ipcRenderer.invoke("bean-browser:toggle-downloads", anchorBounds),
});
