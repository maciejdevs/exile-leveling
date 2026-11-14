import assert from "node:assert/strict";
import { appendFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { BrowserWindow, protocol } from "electron";
import { readPreviousDesktopStorage } from "./storage-migration.mjs";

async function until(check, message) {
  const end = Date.now() + 12000;
  while (Date.now() < end) {
    if (await check()) return;
    await delay(100);
  }
  throw new Error(message);
}

// Uses a synthetic log and an isolated app profile. No game input or focus changes.
export async function runSmokeTest({
  overlay,
  directory,
  logPath,
  nativeSnapshot,
  packaged,
}) {
  const { window } = overlay;
  // Check one-time settings migration using only this disposable test profile.
  protocol.handle(
    "http",
    () => new Response("<!doctype html><title>Migration test</title>"),
  );
  const legacy = new BrowserWindow({
    show: false,
    skipTaskbar: true,
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  try {
    await legacy.loadURL("http://127.0.0.1:5179/exile-leveling/");
    await legacy.webContents.executeJavaScript(
      "localStorage.setItem('migration-check', 'preserved')",
    );
  } finally {
    legacy.destroy();
    protocol.unhandle("http");
  }
  assert.equal(
    (await readPreviousDesktopStorage(protocol))["migration-check"],
    "preserved",
  );
  await window.webContents.executeJavaScript("localStorage.clear()");
  await window.loadURL("exile://app/");
  await until(
    () =>
      window.webContents.executeJavaScript(
        "!!document.querySelector('li[id=\"edge-0\"]')?.getBoundingClientRect().height",
      ),
    "Route did not render",
  );
  await until(
    () => nativeSnapshot(),
    "Windows foreground helper did not respond",
  );
  const initial = window.getBounds();
  overlay.resize.resizeBy(80, 60);
  const larger = window.getBounds();
  assert.equal(larger.width, initial.width + 80, "Window must grow");
  overlay.resize.resizeBy(-80, -60);
  const smaller = window.getBounds();
  assert.deepEqual(
    smaller,
    initial,
    "Window must shrink back to its original dimensions",
  );
  assert.equal(overlay.toggleLock().locked, true);
  await until(
    () =>
      window.webContents.executeJavaScript(
        "getComputedStyle(document.querySelector('.overlay-toolbar')).display === 'none'",
      ),
    "Locked view did not hide the top bar",
  );
  const minimal = await window.webContents.executeJavaScript(
    "({ top: document.getElementById('app-scroll').getBoundingClientRect().top, navigation: getComputedStyle(document.querySelector('[data-overlay-navigation]')).display, scrollbar: getComputedStyle(document.getElementById('app-scroll')).scrollbarWidth })",
  );
  assert.equal(minimal.top, 0);
  assert.equal(minimal.navigation, "none");
  assert.equal(minimal.scrollbar, "none");
  assert.equal(overlay.toggleLock().locked, false);
  await until(
    () =>
      window.webContents.executeJavaScript(
        "getComputedStyle(document.querySelector('.overlay-toolbar')).display !== 'none'",
      ),
    "Unlocked view did not restore the top bar",
  );
  assert.ok(
    await window.webContents.executeJavaScript(
      "document.getElementById('app-scroll').getBoundingClientRect().top >= document.querySelector('.overlay-toolbar').getBoundingClientRect().bottom",
    ),
    "Scrollbar must begin below the top bar",
  );
  await until(
    () => overlay.state().log.state === "watching",
    "Log monitor did not start",
  );
  await appendFile(logPath, 'Generating level 1 area "1_1_town"\n');
  await until(
    () =>
      window.webContents.executeJavaScript(
        "document.querySelector('[aria-current=step]')?.id === 'edge-1'",
      ),
    "New log entries did not advance the guide over IPC",
  );
  overlay.toggleLock();
  await until(
    () =>
      window.webContents.executeJavaScript(
        "getComputedStyle(document.querySelector('.overlay-toolbar')).display === 'none'",
      ),
    "Minimal mode did not activate before the area change",
  );
  await appendFile(logPath, 'Generating level 4 area "1_1_3"\n');
  await until(
    () =>
      window.webContents.executeJavaScript(
        "document.querySelector('[aria-current=step]')?.id === 'edge-3'",
      ),
    "Skipped route step did not catch up",
  );
  const entryIsBelowHeaders = () =>
    window.webContents.executeJavaScript(`(() => {
    const entry = document.querySelector('[aria-current="step"]');
    const header = entry?.closest('[data-route-section]')?.querySelector('[data-route-header]');
    const viewport = document.getElementById('app-scroll');
    return !!entry && entry.getBoundingClientRect().top >= Math.max(header.getBoundingClientRect().bottom, viewport.getBoundingClientRect().top) - 1;
  })()`);
  await until(
    entryIsBelowHeaders,
    "Minimal-mode scrolling clipped the current green entry under the act header",
  );
  overlay.toggleLock();
  await until(
    () =>
      window.webContents.executeJavaScript(
        "getComputedStyle(document.querySelector('.overlay-toolbar')).display !== 'none'",
      ),
    "Normal mode was not restored",
  );
  await until(entryIsBelowHeaders, "Unlocking clipped the current entry");
  overlay.toggleLock();
  await until(
    () =>
      window.webContents.executeJavaScript(
        "getComputedStyle(document.querySelector('.overlay-toolbar')).display === 'none'",
      ),
    "Minimal mode was not restored",
  );
  await until(
    entryIsBelowHeaders,
    "Switching to minimal mode clipped the current entry",
  );
  await writeFile(
    join(directory, "minimal.png"),
    (await window.webContents.capturePage()).toPNG(),
  );
  overlay.toggleLock();
  await until(
    () =>
      window.webContents.executeJavaScript(
        "getComputedStyle(document.querySelector('.overlay-toolbar')).display !== 'none'",
      ),
    "Normal mode was not restored after the clipping check",
  );
  // Reset only the disposable guide through its own UI, then exercise the new
  // tracking page and its explicit synchronization control.
  await window.webContents.executeJavaScript(
    "document.querySelector('li#edge-0 span[aria-hidden]').click(); location.hash = '#/tracking';",
  );
  await until(
    () =>
      window.webContents.executeJavaScript(
        "document.querySelector('h1')?.textContent === 'Log tracking'",
      ),
    "Log tracking menu page did not render",
  );
  const tracking = await window.webContents.executeJavaScript(
    "window.exileOverlay.refreshLogs()",
  );
  assert.equal(tracking.state, "watching");
  assert.equal(tracking.path, logPath);
  assert.equal(tracking.lastAreaId, "1_1_3");
  assert.equal(tracking.areaEvents, 2);
  await window.webContents.executeJavaScript(
    "Array.from(document.querySelectorAll('button')).find(button => button.textContent === 'Sync guide to this area').click()",
  );
  await until(
    () =>
      window.webContents.executeJavaScript(
        "document.querySelector('[aria-current=step]')?.id === 'edge-3'",
      ),
    "Guide synchronization did not work",
  );
  const style = await window.webContents.executeJavaScript(
    "getComputedStyle(document.documentElement).backgroundColor",
  );
  assert.equal(style, "rgba(0, 0, 0, 0)");
  assert.ok(window.isAlwaysOnTop());
  await window.webContents.executeJavaScript(
    "window.exileOverlay.saveShortcut('F8')",
  );
  await window.webContents.executeJavaScript("location.hash = '#/settings'");
  await until(
    () =>
      window.webContents.executeJavaScript(
        "document.querySelector('h1')?.textContent === 'Settings' && document.querySelector('input[aria-label=\"Click-through shortcut\"]')?.value === 'F8'",
      ),
    "Settings did not show the saved shortcut",
  );
  await window.webContents.executeJavaScript(
    "Array.from(document.querySelectorAll('button')).find(button => button.textContent === 'Record shortcut').click()",
  );
  await until(
    () =>
      window.webContents.executeJavaScript(
        "window.exileOverlay.getState().then(state => state.shortcutRecording)",
      ),
    "Shortcut recording did not start",
  );
  await window.webContents.executeJavaScript(
    "Array.from(document.querySelectorAll('button')).find(button => button.textContent.startsWith('Press a key')).dispatchEvent(new KeyboardEvent('keydown', { key: String.fromCharCode(96), code: 'Backquote', bubbles: true }))",
  );
  await until(
    () =>
      window.webContents.executeJavaScript(
        "document.querySelector('input[aria-label=\"Click-through shortcut\"]')?.value === String.fromCharCode(96)",
      ),
    "Backtick capture failed",
  );
  await window.webContents.executeJavaScript(
    "Array.from(document.querySelectorAll('button')).find(button => button.textContent === 'Save shortcut').click()",
  );
  await until(
    () =>
      window.webContents.executeJavaScript(
        "window.exileOverlay.getState().then(state => state.clickThroughShortcut === String.fromCharCode(96))",
      ),
    "Shortcut was not saved",
  );
  assert.equal(
    JSON.parse(
      await (
        await import("node:fs/promises")
      ).readFile(join(directory, "profile", "shortcuts.json"), "utf8"),
    ).clickThrough,
    "`",
  );
  const report = {
    packaged,
    storageMigration: true,
    transparent: true,
    grew: true,
    shrank: true,
    logProgressOverIpc: true,
    skippedStepCatchUp: true,
    logTrackingMenu: true,
    explicitGuideSync: true,
    configurableShortcut: true,
    minimalClickThroughView: true,
    scrollbarBelowToolbar: true,
    currentEntryFullyVisible: true,
    nativeFocus: nativeSnapshot().foreground,
    alwaysOnTop: true,
    visible: window.isVisible(),
  };
  await writeFile(
    join(directory, "report.json"),
    JSON.stringify(report, null, 2),
  );
  await writeFile(
    join(directory, "overlay.png"),
    (await window.webContents.capturePage()).toPNG(),
  );
  console.log("Desktop checks passed:", report);
}
