import { ipcMain } from "electron";
import { isAppUrl } from "./assets.mjs";

export function registerDesktopIpc(
  overlay,
  previousStorage,
  quit,
  logControls,
) {
  const trusted = (event) =>
    event.sender === overlay.window.webContents &&
    event.senderFrame === overlay.window.webContents.mainFrame &&
    isAppUrl(event.senderFrame?.url);
  for (const [channel, callback] of Object.entries({
    "overlay:state": overlay.state,
    "overlay:previous-storage": previousStorage,
    "overlay:toggle-lock": overlay.toggleLock,
    "overlay:hide": overlay.toggleHidden,
    "overlay:quit": quit,
    "tracking:refresh": logControls.refresh,
    "tracking:automatic": logControls.automatic,
    "tracking:choose": logControls.choose,
    "tracking:reveal": logControls.reveal,
  })) {
    ipcMain.handle(channel, (event) => {
      if (!trusted(event)) throw new Error("Untrusted desktop request");
      return callback();
    });
  }
  for (const [channel, callback] of Object.entries({
    "overlay:renderer-ready": overlay.replayLatestArea,
    "overlay:resize-begin": () => {
      if (!overlay.state().locked) overlay.resize.begin();
    },
    "overlay:resize-update": overlay.resize.update,
    "overlay:resize-end": overlay.resize.end,
    "overlay:resize-by": (_event, dx, dy) => {
      if (!overlay.state().locked) overlay.resize.resizeBy(dx, dy);
    },
  })) {
    ipcMain.on(channel, (event, ...args) => {
      if (trusted(event)) callback(event, ...args);
    });
  }
}
