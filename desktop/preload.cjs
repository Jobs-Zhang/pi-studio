const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("piWebDesktop", {
  getHistory: () => ipcRenderer.invoke("get-history"),
  saveMode: (mode) => ipcRenderer.invoke("save-mode", mode),
  connect: (payload) => ipcRenderer.invoke("connect", payload),
  connectRecent: (index) => ipcRenderer.invoke("connect-recent", index),
  deleteConnection: (index) => ipcRenderer.invoke("delete-connection", index),
  clearHistory: () => ipcRenderer.invoke("clear-history"),
  detectEnvironment: () => ipcRenderer.invoke("ssh-detect"),
});
