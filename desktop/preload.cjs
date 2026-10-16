const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("piWebDesktop", {
  getHistory: () => ipcRenderer.invoke("get-history"),
  saveMode: (mode) => ipcRenderer.invoke("save-mode", mode),
  connect: (payload) => ipcRenderer.invoke("connect", payload),
  connectRecent: (index) => ipcRenderer.invoke("connect-recent", index),
  deleteConnection: (index) => ipcRenderer.invoke("delete-connection", index),
  clearHistory: () => ipcRenderer.invoke("clear-history"),
  detectEnvironment: () => ipcRenderer.invoke("ssh-detect"),
  // Capabilities the shared connect page negotiates with each shell. The
  // desktop client always has an ssh client, ~/.ssh/config and identity files.
  capabilities: () => Promise.resolve({
    sshConfig: true,
    identityFile: true,
    shortcutHints: true,
    appTitle: "PI Desktop",
  }),
});
