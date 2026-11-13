const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("exileOverlay", {
  autoProgressUrl: "ws://127.0.0.1:6755",
  getState: () => ipcRenderer.invoke("overlay:state"),
  toggleLock: () => ipcRenderer.invoke("overlay:toggle-lock"),
  hide: () => ipcRenderer.invoke("overlay:hide"),
  quit: () => ipcRenderer.invoke("overlay:quit"),
  resize: (width, height) =>
    ipcRenderer.send("overlay:resize", { width, height }),
  onState: (callback) => {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on("overlay:state-changed", listener);
    return () => ipcRenderer.removeListener("overlay:state-changed", listener);
  },
});
