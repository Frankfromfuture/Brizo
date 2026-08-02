const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("beanIncognito", {
  back: () => ipcRenderer.invoke("bean-incognito:back"),
  forward: () => ipcRenderer.invoke("bean-incognito:forward"),
  navigate: (input) => ipcRenderer.invoke("bean-incognito:navigate", input),
  onState: (callback) => {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on("bean-incognito:state", listener);
    return () => ipcRenderer.removeListener("bean-incognito:state", listener);
  },
  reload: () => ipcRenderer.invoke("bean-incognito:reload"),
});
