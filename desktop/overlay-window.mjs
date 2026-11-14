import { BrowserWindow, screen } from "electron";
import { join } from "node:path";
import { createBoundsStore, readSavedBounds } from "./settings.mjs";
import { createResizeController } from "./resize.mjs";
import { clampBounds, defaultBounds } from "./window-bounds.mjs";
import { shouldShowOverlay, updateGameFocus } from "./visibility.mjs";

export async function createOverlayWindow({
  root,
  profile,
  savePreferences = true,
  allowShow = true,
}) {
  const settings = join(profile, "overlay-window.json");
  const saved = await readSavedBounds(settings);
  const area = saved
    ? screen.getDisplayMatching(saved).workArea
    : screen.getPrimaryDisplay().workArea;
  const window = new BrowserWindow({
    ...(saved ? clampBounds(saved, area) : defaultBounds(area)),
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
    hasShadow: false,
    // Native resizing of transparent Electron windows is unreliable on Windows.
    // Our resize controller applies validated bounds in both directions instead.
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    alwaysOnTop: true,
    show: false,
    autoHideMenuBar: true,
    icon: join(root, "web/dist/favicon-32x32.png"),
    webPreferences: {
      preload: join(root, "desktop/preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
    },
  });
  window.setAlwaysOnTop(true, "screen-saver");
  window.setMenu(null);
  const store = createBoundsStore(settings);
  const save = () => {
    if (savePreferences && !window.isDestroyed())
      store.schedule(window.getBounds());
  };
  const resize = createResizeController({
    getBounds: () => window.getBounds(),
    getCursor: () => screen.getCursorScreenPoint(),
    getArea: () => screen.getDisplayMatching(window.getBounds()).workArea,
    applyBounds: (bounds) => {
      window.setBounds(bounds);
      save();
    },
  });
  const state = {
    locked: false,
    gameActive: false,
    manuallyHidden: false,
    focusError: null,
    log: {
      state: "waiting",
      message: "Waiting for the PoE game log",
      path: null,
    },
  };
  let ready = false;
  let lastArea;
  let onState = () => {};
  const snapshot = () => ({ ...state, log: { ...state.log } });
  const publish = () => {
    if (ready && !window.isDestroyed())
      window.webContents.send("overlay:state-changed", snapshot());
    onState(snapshot());
  };
  function syncVisibility() {
    if (!ready || !allowShow || window.isDestroyed()) return;
    if (shouldShowOverlay(state)) {
      if (!window.isVisible()) window.showInactive();
    } else {
      resize.end();
      if (window.isVisible()) window.hide();
    }
  }
  window.on("moved", save);
  window.on("blur", resize.end);
  return {
    window,
    resize,
    state: snapshot,
    onState(callback) {
      onState = callback;
    },
    ready() {
      ready = true;
      publish();
      syncVisibility();
    },
    setForeground(foreground) {
      state.gameActive = updateGameFocus(state.gameActive, foreground);
      state.focusError = null;
      syncVisibility();
      publish();
    },
    setFocusError(message) {
      state.gameActive = false;
      state.focusError = message;
      syncVisibility();
      publish();
    },
    toggleLock() {
      state.locked = !state.locked;
      resize.end();
      window.setIgnoreMouseEvents(state.locked, { forward: true });
      window.setFocusable(!state.locked);
      publish();
      return snapshot();
    },
    toggleHidden() {
      state.manuallyHidden = !state.manuallyHidden;
      syncVisibility();
      publish();
    },
    resetPosition() {
      resize.end();
      window.setBounds(defaultBounds(screen.getPrimaryDisplay().workArea));
      save();
      syncVisibility();
    },
    setLogStatus(status) {
      state.log = status;
      publish();
    },
    sendArea(message) {
      lastArea = message;
      if (ready) window.webContents.send("overlay:area", message);
    },
    replayLatestArea() {
      if (lastArea) window.webContents.send("overlay:area", lastArea);
    },
    async close() {
      resize.end();
      save();
      await store.flush();
    },
  };
}
