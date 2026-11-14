import {
  app,
  dialog,
  globalShortcut,
  Menu,
  nativeImage,
  protocol,
  shell,
  Tray,
} from "electron";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { APP_URL, createAssetHandler, isAppUrl } from "./assets.mjs";
import { registerDesktopIpc } from "./ipc.mjs";
import { startLogMonitor } from "./log-reader.mjs";
import { createOverlayWindow } from "./overlay-window.mjs";
import { readPreviousDesktopStorage } from "./storage-migration.mjs";
import { startFocusMonitor } from "./windows-focus.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const smokeTest = process.argv.includes("--smoke-test");
const smokeDirectory = resolve(process.cwd(), ".overlay-smoke");
app.setName("Exile Leveling Overlay");
app.setPath(
  "userData",
  smokeTest
    ? join(smokeDirectory, "profile")
    : join(app.getPath("appData"), "Exile Leveling Overlay"),
);
protocol.registerSchemesAsPrivileged([
  {
    scheme: "exile",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
    },
  },
]);

let overlay;
let logs;
let focus;
let tray;
let nativeSnapshot;
let gameDirectories = [];
let quitting = false;
let exitCode = 0;

function updateTray() {
  if (!tray || tray.isDestroyed() || !overlay) return;
  const state = overlay.state();
  const status = state.focusError
    ? "Focus detection unavailable"
    : state.gameActive
      ? "PoE focused"
      : "Waiting for PoE focus";
  tray.setToolTip(`Exile Leveling: ${status}`);
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: status, enabled: false },
      { label: state.log.message, enabled: false },
      { type: "separator" },
      {
        label: "Hide while playing (Ctrl+Alt+O)",
        type: "checkbox",
        checked: state.manuallyHidden,
        click: overlay.toggleHidden,
      },
      {
        label: "Click through to game (Ctrl+Alt+I)",
        type: "checkbox",
        checked: state.locked,
        click: overlay.toggleLock,
      },
      {
        label: "Reset position below status icons",
        click: overlay.resetPosition,
      },
      { type: "separator" },
      { label: "Quit", click: () => app.quit() },
    ]),
  );
}

async function start() {
  if (!app.requestSingleInstanceLock()) {
    app.quit();
    return;
  }
  await app.whenReady();
  if (process.platform !== "win32")
    throw new Error("This standalone overlay supports Windows only.");
  const { values } = parseArgs({
    args: process.argv.slice(app.isPackaged ? 1 : 2),
    options: {
      "log-path": { type: "string" },
      "smoke-test": { type: "boolean" },
    },
  });
  app.setAppUserModelId("exile-leveling.overlay");
  protocol.handle("exile", createAssetHandler(join(root, "web/dist")));
  overlay = await createOverlayWindow({
    root,
    profile: app.getPath("userData"),
    savePreferences: !smokeTest,
    allowShow: !smokeTest,
  });
  const { window } = overlay;
  let migration;
  const previousStorage = () => {
    migration ??= smokeTest
      ? Promise.resolve({})
      : readPreviousDesktopStorage(protocol);
    return migration;
  };
  registerDesktopIpc(overlay, previousStorage, () => app.quit());
  window.webContents.session.setPermissionRequestHandler(
    (contents, permission, callback) =>
      callback(
        contents === window.webContents &&
          permission === "clipboard-sanitized-write",
      ),
  );
  window.webContents.session.setPermissionCheckHandler(
    (contents, permission) =>
      contents === window.webContents &&
      permission === "clipboard-sanitized-write",
  );
  const openExternal = (url) => {
    try {
      if (new URL(url).protocol === "https:")
        void shell.openExternal(url).catch(console.error);
    } catch {
      /* Invalid link. */
    }
  };
  window.webContents.setWindowOpenHandler(({ url }) => {
    openExternal(url);
    return { action: "deny" };
  });
  window.webContents.on("will-navigate", (event, url) => {
    if (!isAppUrl(url)) {
      event.preventDefault();
      openExternal(url);
    }
  });

  let logPath = values["log-path"] || process.env.POE_LOG_PATH;
  if (smokeTest) {
    await mkdir(smokeDirectory, { recursive: true });
    logPath = join(smokeDirectory, "LatestClient.txt");
    await writeFile(logPath, 'Generating level 1 area "old-history"\n');
  }
  logs = startLogMonitor({
    logPath,
    directories: () => gameDirectories,
    onArea: overlay.sendArea,
    onStatus: overlay.setLogStatus,
  });
  focus = await startFocusMonitor({
    onChange(snapshot) {
      nativeSnapshot = snapshot;
      gameDirectories = snapshot.directories;
      overlay.setForeground(snapshot.foreground);
    },
    onError(message) {
      nativeSnapshot = undefined;
      gameDirectories = [];
      console.warn(message);
      overlay.setFocusError(message);
    },
  });
  if (!smokeTest) {
    tray = new Tray(
      nativeImage.createFromPath(join(root, "web/dist/favicon-32x32.png")),
    );
    tray.on("double-click", overlay.toggleHidden);
    overlay.onState(updateTray);
    updateTray();
    for (const [key, callback] of [
      ["CommandOrControl+Alt+O", overlay.toggleHidden],
      ["CommandOrControl+Alt+I", overlay.toggleLock],
    ]) {
      if (!globalShortcut.register(key, callback))
        console.warn(`Shortcut unavailable: ${key}; use the tray menu.`);
    }
  }
  app.on("second-instance", updateTray); // Never force the overlay over another app.
  await window.loadURL(APP_URL);
  overlay.ready();
  if (smokeTest) {
    const { runSmokeTest } = await import("./smoke-test.mjs");
    await runSmokeTest({
      overlay,
      directory: smokeDirectory,
      logPath,
      nativeSnapshot: () => nativeSnapshot,
      packaged: app.isPackaged,
    });
    app.quit();
  }
}

app.on("window-all-closed", () => app.quit());
app.on("before-quit", (event) => {
  if (quitting) return;
  quitting = true;
  event.preventDefault();
  globalShortcut.unregisterAll();
  tray?.destroy();
  focus?.close();
  Promise.allSettled([logs?.close(), overlay?.close()]).then(() =>
    app.exit(exitCode),
  );
});
start().catch((error) => {
  console.error(error);
  exitCode = 1;
  if (!smokeTest)
    dialog.showErrorBox("Could not start Exile Leveling", error.message);
  app.quit();
});
