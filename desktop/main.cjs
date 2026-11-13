const {
  app,
  BrowserWindow,
  dialog,
  globalShortcut,
  ipcMain,
  Menu,
  nativeImage,
  screen,
  shell,
  Tray,
} = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { parseArgs } = require("node:util");

const smokeTest = process.argv.includes("--smoke-test");
const smokeDirectory = path.resolve(process.cwd(), ".overlay-smoke");
app.setName("Exile Leveling Overlay");
app.setPath(
  "userData",
  path.join(app.getPath("appData"), "Exile Leveling Overlay"),
);
if (smokeTest) app.setPath("userData", path.join(smokeDirectory, "profile"));

let window;
let tray;
let helper;
let server;
let locked = false;
let quitting = false;
let exitCode = 0;
const settingsPath = () =>
  path.join(app.getPath("userData"), "overlay-window.json");
const state = () => ({ locked });

function defaultBounds() {
  const { workArea } = screen.getPrimaryDisplay();
  return {
    x: workArea.x + 12,
    y: workArea.y + 140,
    width: Math.min(460, workArea.width),
    height: Math.max(220, Math.min(570, workArea.height - 150)),
  };
}

function saveBounds() {
  if (!window || window.isDestroyed() || smokeTest) return;
  fs.mkdirSync(app.getPath("userData"), { recursive: true });
  fs.writeFileSync(settingsPath(), JSON.stringify(window.getBounds()));
}

function setLocked(value) {
  locked = value;
  window.setIgnoreMouseEvents(locked, { forward: true });
  window.setFocusable(!locked);
  window.webContents.send("overlay:state-changed", state());
  updateTray();
  return state();
}

function toggleVisible() {
  if (window.isVisible()) window.hide();
  else window.showInactive();
}

function updateTray() {
  tray?.setContextMenu(
    Menu.buildFromTemplate([
      { label: "Show / hide overlay (Ctrl+Alt+O)", click: toggleVisible },
      {
        label: "Click through to game (Ctrl+Alt+I)",
        type: "checkbox",
        checked: locked,
        click: () => setLocked(!locked),
      },
      {
        label: "Reset position below status icons",
        click: () => {
          window.setBounds(defaultBounds());
          window.showInactive();
        },
      },
      { type: "separator" },
      { label: "Quit overlay", click: () => app.quit() },
    ]),
  );
}

function trusted(event) {
  return (
    event.sender === window.webContents &&
    event.senderFrame === window.webContents.mainFrame
  );
}

async function start() {
  if (!app.requestSingleInstanceLock()) {
    app.quit();
    return;
  }
  await app.whenReady();
  app.setAppUserModelId("exile-leveling.overlay");
  const { values } = parseArgs({
    args: process.argv.slice(app.isPackaged ? 1 : 2),
    options: {
      "log-path": { type: "string" },
      "smoke-test": { type: "boolean" },
    },
  });
  const { startAutoProgress } = await import(
    pathToFileURL(path.join(__dirname, "../scripts/auto-progress.mjs")).href
  );
  helper = await startAutoProgress({
    logPath: values["log-path"] || process.env.POE_LOG_PATH,
    port: 6755,
  });
  const { startAppServer } = await import("./server.mjs");
  server = await startAppServer(
    path.join(__dirname, "../web/dist-desktop"),
    smokeTest ? 0 : 5179,
  );

  let bounds = defaultBounds();
  try {
    const saved = JSON.parse(fs.readFileSync(settingsPath(), "utf8"));
    if (
      [saved.x, saved.y, saved.width, saved.height].every(Number.isFinite) &&
      saved.width >= 300 &&
      saved.height >= 220
    ) {
      const display = screen.getDisplayMatching(saved).workArea;
      const width = Math.min(saved.width, display.width);
      const height = Math.min(saved.height, display.height);
      bounds = {
        width,
        height,
        x: Math.max(
          display.x,
          Math.min(saved.x, display.x + display.width - width),
        ),
        y: Math.max(
          display.y,
          Math.min(saved.y, display.y + display.height - height),
        ),
      };
    }
  } catch {
    /* First launch uses the position below the status icons. */
  }
  window = new BrowserWindow({
    ...bounds,
    minWidth: 300,
    minHeight: 220,
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
    hasShadow: false,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    alwaysOnTop: true,
    show: false,
    autoHideMenuBar: true,
    icon: path.join(__dirname, "../web/dist-desktop/favicon-32x32.png"),
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
    },
  });
  window.setAlwaysOnTop(true, "screen-saver");
  window.setMenu(null);
  window.webContents.session.setPermissionRequestHandler(
    (_contents, _permission, callback) => callback(false),
  );
  const openExternal = (url) => {
    try {
      if (["https:", "http:"].includes(new URL(url).protocol))
        void shell.openExternal(url);
    } catch {
      /* Invalid link. */
    }
  };
  window.webContents.setWindowOpenHandler(({ url }) => {
    openExternal(url);
    return { action: "deny" };
  });
  window.webContents.on("will-navigate", (event, url) => {
    if (!url.startsWith(server.url)) {
      event.preventDefault();
      openExternal(url);
    }
  });
  window.on("moved", saveBounds);
  window.on("close", saveBounds);

  for (const [channel, callback] of Object.entries({
    "overlay:state": state,
    "overlay:toggle-lock": () => setLocked(!locked),
    "overlay:hide": () => window.hide(),
    "overlay:quit": () => app.quit(),
  })) {
    ipcMain.handle(channel, (event) => {
      if (!trusted(event)) throw new Error("Untrusted overlay request");
      return callback();
    });
  }
  ipcMain.on("overlay:resize", (event, size) => {
    if (
      !trusted(event) ||
      locked ||
      !size ||
      !Number.isFinite(size.width) ||
      !Number.isFinite(size.height)
    )
      return;
    const { workArea } = screen.getDisplayMatching(window.getBounds());
    window.setSize(
      Math.round(Math.max(300, Math.min(size.width, workArea.width))),
      Math.round(Math.max(220, Math.min(size.height, workArea.height))),
    );
    saveBounds();
  });

  if (!smokeTest) {
    tray = new Tray(
      nativeImage.createFromPath(
        path.join(__dirname, "../web/dist-desktop/favicon-32x32.png"),
      ),
    );
    tray.setToolTip("Exile Leveling — Ctrl+Alt+I to toggle click-through");
    tray.on("double-click", toggleVisible);
    updateTray();
    for (const [key, callback] of [
      ["CommandOrControl+Alt+O", toggleVisible],
      ["CommandOrControl+Alt+I", () => setLocked(!locked)],
    ]) {
      if (!globalShortcut.register(key, callback))
        console.warn(
          `Shortcut unavailable: ${key}. Use the tray menu instead.`,
        );
    }
  }
  app.on("second-instance", () => window.showInactive());
  await window.loadURL(server.url);
  if (smokeTest) {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    const report = await window.webContents.executeJavaScript(
      `({ transparent: getComputedStyle(document.documentElement).backgroundColor, toolbar: !!document.querySelector('.overlay-toolbar'), route: !!document.querySelector('li[id^="edge-"]'), bridge: !!window.exileOverlay })`,
    );
    report.packaged = app.isPackaged;
    report.alwaysOnTop = window.isAlwaysOnTop();
    report.autoProgress = await window.webContents.executeJavaScript(`new Promise(resolve => {
      const socket = new WebSocket(window.exileOverlay.autoProgressUrl);
      socket.onopen = () => { socket.close(); resolve(true); };
      socket.onerror = () => resolve(false);
      setTimeout(() => { socket.close(); resolve(false); }, 2000);
    })`);
    const originalBounds = window.getBounds();
    window.setSize(originalBounds.width + 20, originalBounds.height + 20);
    report.resized = window.getBounds().width === originalBounds.width + 20;
    window.setBounds(originalBounds);
    setLocked(true);
    report.locked = locked;
    setLocked(false);
    report.unlocked = !locked;
    await new Promise((resolve) => setTimeout(resolve, 1000));
    report.routeVisible = await window.webContents.executeJavaScript(
      `Array.from(document.querySelectorAll('li[id^="edge-"]')).some(element => element.getBoundingClientRect().height > 0)`,
    );
    fs.mkdirSync(smokeDirectory, { recursive: true });
    fs.writeFileSync(
      path.join(smokeDirectory, "report.json"),
      JSON.stringify(report, null, 2),
    );
    fs.writeFileSync(
      path.join(smokeDirectory, "overlay.png"),
      (await window.webContents.capturePage()).toPNG(),
    );
    if (
      !report.toolbar ||
      !report.routeVisible ||
      !report.bridge ||
      !report.resized ||
      !report.alwaysOnTop ||
      !report.autoProgress ||
      report.transparent !== "rgba(0, 0, 0, 0)"
    )
      throw new Error(`Overlay smoke test failed: ${JSON.stringify(report)}`);
    console.log("Overlay smoke test passed:", report);
    app.quit();
  } else window.showInactive();
}

app.on("window-all-closed", () => app.quit());
app.on("before-quit", (event) => {
  if (quitting) return;
  quitting = true;
  event.preventDefault();
  saveBounds();
  globalShortcut.unregisterAll();
  tray?.destroy();
  Promise.all([helper?.close(), server?.close()]).finally(() =>
    app.exit(exitCode),
  );
});
start().catch((error) => {
  console.error(error);
  if (!smokeTest)
    dialog.showErrorBox(
      "Could not start Exile Leveling Overlay",
      error.message,
    );
  exitCode = 1;
  app.quit();
});
