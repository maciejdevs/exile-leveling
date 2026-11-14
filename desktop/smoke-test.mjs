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
  assert.equal(
    await window.webContents.executeJavaScript(
      "!!document.querySelector('.route-detour-border')",
    ),
    false,
    "Historical startup areas must not trigger a warning",
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
  let enteredAreas = 1;
  async function enter(area) {
    await appendFile(logPath, `Generating level 4 area "${area}"\n`);
    enteredAreas++;
    await until(
      () => overlay.state().log.areaEvents === enteredAreas,
      "Log entry was not received",
    );
  }
  const border = (shown) =>
    until(
      () =>
        window.webContents.executeJavaScript(
          `!!document.querySelector('.route-detour-border') === ${shown}`,
        ),
      shown ? "Detour border did not appear" : "Detour border did not clear",
    );
  const current = (id) =>
    until(
      () =>
        window.webContents.executeJavaScript(
          `document.querySelector('[aria-current=step]')?.id === ${JSON.stringify(id)}`,
        ),
      `Guide did not reach ${id}`,
    );
  const guideSnapshot = () =>
    window.webContents.executeJavaScript(`({
    cursor: document.querySelector('[aria-current=step]')?.id,
    scrollTop: document.getElementById('app-scroll').scrollTop,
    highlights: Array.from(document.querySelectorAll('li')).map((row, index) => ({ index, color: getComputedStyle(row.firstElementChild || row).backgroundColor })).filter(row => !['transparent', 'rgba(0, 0, 0, 0)'].includes(row.color))
  })`);
  await delay(100); // Let the mode-change scroll alignment settle.
  const frozen = await guideSnapshot();
  await enter("1_1_3"); // Wrong future zone: Coast is awaited, not Mud Flats.
  await border(true);
  assert.deepEqual(
    await guideSnapshot(),
    frozen,
    "A detour must preserve cursor, green/amber highlights, and scroll",
  );
  const warningStyle = await window.webContents.executeJavaScript(`(() => {
    const border = document.querySelector('.route-detour-border');
    const style = getComputedStyle(border);
    return { pointerEvents: style.pointerEvents, width: style.borderTopWidth, color: style.borderTopColor };
  })()`);
  assert.deepEqual(warningStyle, {
    pointerEvents: "none",
    width: "2px",
    color: "rgb(239, 68, 68)",
  });
  overlay.sendArea("not a valid area message");
  await delay(100);
  await border(true);
  assert.deepEqual(
    await guideSnapshot(),
    frozen,
    "Invalid messages must not alter an existing detour warning",
  );
  overlay.setForeground("other");
  await border(true);
  overlay.setForeground(nativeSnapshot().foreground);
  overlay.toggleLock();
  await until(
    () =>
      window.webContents.executeJavaScript(
        "getComputedStyle(document.querySelector('.overlay-toolbar')).display !== 'none'",
      ),
    "Normal view did not return during detour",
  );
  await border(true);
  overlay.toggleLock();
  await until(
    () =>
      window.webContents.executeJavaScript(
        "getComputedStyle(document.querySelector('.overlay-toolbar')).display === 'none'",
      ),
    "Minimal view did not return during detour",
  );
  await border(true);
  await writeFile(
    join(directory, "detour.png"),
    (await window.webContents.capturePage()).toPNG(),
  );
  await enter("1_1_town"); // Return to the current guide area, without advancing.
  await border(false);
  await current("edge-1");
  await enter("1_1_3");
  await border(true);
  await enter("1_1_2"); // Enter the awaited Coast directly from a wrong turn.
  await current("edge-2");
  await border(false);
  await enter("1_1_town"); // Unplanned selling trip from the Coast.
  await border(true);
  await current("edge-2");
  await enter("1_1_2"); // Coming back clears the warning, not the next step.
  await border(false);
  await current("edge-2");
  await enter("1_1_4_1"); // Another unique later area must not be a shortcut.
  await border(true);
  await current("edge-2");
  await enter("1_1_3");
  await until(
    () =>
      window.webContents.executeJavaScript(
        "document.querySelector('[aria-current=step]')?.id === 'edge-3'",
      ),
    "The expected next zone did not advance by one step",
  );
  await border(false);
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
  // Explicit manual sync remains an override and clears a resolved mismatch.
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
  assert.equal(tracking.areaEvents, enteredAreas);
  await border(true);
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
  await border(false);
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
    strictRouteProgress: true,
    detourPreservesGuide: true,
    detourWarning: true,
    townReturnRecovery: true,
    warningSurvivesModeChange: true,
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
