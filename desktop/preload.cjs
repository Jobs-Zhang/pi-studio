const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("piStudioDesktop", {
  // Raise the app window to the foreground (restore + focus); used when the
  // user clicks a desktop notification.
  focusWindow: () => ipcRenderer.invoke("show-window"),
  getHistory: () => ipcRenderer.invoke("get-history"),
  saveMode: (mode) => ipcRenderer.invoke("save-mode", mode),
  connect: (payload) => ipcRenderer.invoke("connect", payload),
  connectRecent: (index) => ipcRenderer.invoke("connect-recent", index),
  deleteConnection: (index) => ipcRenderer.invoke("delete-connection", index),
  clearHistory: () => ipcRenderer.invoke("clear-history"),
  detectEnvironment: () => ipcRenderer.invoke("ssh-detect"),
  detectLocal: () => ipcRenderer.invoke("detect-local"),
  // Capabilities the shared connect page negotiates with each shell. The
  // desktop client always has an ssh client, ~/.ssh/config and identity files.
  capabilities: () => Promise.resolve({
    sshConfig: true,
    identityFile: true,
    shortcutHints: true,
    appTitle: "Pi 工作台",
  }),
});
