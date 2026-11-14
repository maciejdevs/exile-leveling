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
  assert.equal(overlay.toggleLock().locked, false);
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
  const style = await window.webContents.executeJavaScript(
    "getComputedStyle(document.documentElement).backgroundColor",
  );
  assert.equal(style, "rgba(0, 0, 0, 0)");
  assert.ok(window.isAlwaysOnTop());
  const report = {
    packaged,
    storageMigration: true,
    transparent: true,
    grew: true,
    shrank: true,
    logProgressOverIpc: true,
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
