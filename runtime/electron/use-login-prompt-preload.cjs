const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("useLoginPrompt", {
  subscribe(callback) {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on("brizo-use-login:state", listener);
    ipcRenderer.send("brizo-use-login:ready");
    return () => ipcRenderer.removeListener("brizo-use-login:state", listener);
  },
  resize: (height) => ipcRenderer.send("brizo-use-login:size", height),
  dismiss: () => ipcRenderer.send("brizo-use-login:action", "dismiss"),
  resume: () => ipcRenderer.send("brizo-use-login:action", "resume"),
});
