const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("exileOverlay", {
  getState: () => ipcRenderer.invoke("overlay:state"),
  refreshLogs: () => ipcRenderer.invoke("tracking:refresh"),
  detectLogs: () => ipcRenderer.invoke("tracking:automatic"),
  chooseLog: () => ipcRenderer.invoke("tracking:choose"),
  revealLog: () => ipcRenderer.invoke("tracking:reveal"),
  previousStorage: () => ipcRenderer.invoke("overlay:previous-storage"),
  toggleLock: () => ipcRenderer.invoke("overlay:toggle-lock"),
  hide: () => ipcRenderer.invoke("overlay:hide"),
  quit: () => ipcRenderer.invoke("overlay:quit"),
  beginResize: () => ipcRenderer.send("overlay:resize-begin"),
  updateResize: () => ipcRenderer.send("overlay:resize-update"),
  endResize: () => ipcRenderer.send("overlay:resize-end"),
  resizeBy: (dx, dy) => ipcRenderer.send("overlay:resize-by", dx, dy),
  onArea: (callback) => {
    const listener = (_event, message) => callback(message);
    ipcRenderer.on("overlay:area", listener);
    ipcRenderer.send("overlay:renderer-ready");
    return () => ipcRenderer.removeListener("overlay:area", listener);
  },
  onState: (callback) => {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on("overlay:state-changed", listener);
    return () => ipcRenderer.removeListener("overlay:state-changed", listener);
  },
});
