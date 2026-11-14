import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createShortcutController, normalizeShortcut } from "../shortcuts.mjs";
import { shortcutFromKey } from "../../web/src/utility/shortcut.ts";

test("accepts backtick and combinations, and rejects invalid/reserved bindings", () => {
  assert.equal(normalizeShortcut("`"), "`");
  assert.equal(normalizeShortcut("Alt+Ctrl+i"), "Control+Alt+I");
  assert.equal(normalizeShortcut("F8"), "F8");
  for (const value of [
    "",
    "InvalidKey",
    "Control+Control+I",
    "Ctrl+Alt+O",
    null,
  ])
    assert.throws(() => normalizeShortcut(value));
  const event = {
    key: "`",
    code: "Backquote",
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    metaKey: false,
  };
  assert.equal(shortcutFromKey(event), "`");
  assert.equal(shortcutFromKey({ ...event, key: "Dead" }), "`");
  assert.equal(shortcutFromKey({ ...event, key: "Shift" }), null);
});

test("shortcuts pause for recording/other apps and persist across restarts", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "exile-shortcut-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const file = join(directory, "shortcuts.json");
  const keys = new Map();
  let toggles = 0;
  const options = {
    file,
    register: (key, callback) => {
      if (keys.has(key)) return false;
      keys.set(key, callback);
      return true;
    },
    unregister: (key) => keys.delete(key),
    toggleLock: () => toggles++,
    toggleHidden: () => {},
    onChange: () => {},
  };
  const shortcuts = await createShortcutController(options);
  t.after(shortcuts.close);
  assert.equal(keys.size, 0);
  shortcuts.setActive(true);
  const toggle = keys.get("`");
  toggle();
  assert.equal(toggles, 1);
  shortcuts.record(true);
  assert.equal(keys.size, 0);
  toggle();
  assert.equal(toggles, 1);
  shortcuts.record(false);
  await shortcuts.save("F8");
  assert.equal(keys.has("`"), false);
  assert.equal(keys.has("F8"), true);
  assert.equal(JSON.parse(await readFile(file, "utf8")).clickThrough, "F8");
  shortcuts.setActive(false);
  assert.equal(keys.size, 0);
  shortcuts.close();
  const restarted = await createShortcutController(options);
  t.after(restarted.close);
  assert.equal(restarted.state().clickThroughShortcut, "F8");
});

test("a conflicting replacement preserves the previous working shortcut", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "exile-shortcut-conflict-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const keys = new Map([["F9", () => {}]]);
  const shortcuts = await createShortcutController({
    file: join(directory, "shortcuts.json"),
    register: (key, action) => {
      if (keys.has(key)) return false;
      keys.set(key, action);
      return true;
    },
    unregister: (key) => keys.delete(key),
    toggleLock: () => {},
    toggleHidden: () => {},
    onChange: () => {},
  });
  t.after(shortcuts.close);
  shortcuts.setActive(true);
  await assert.rejects(shortcuts.save("F9"), /another application/);
  assert.equal(shortcuts.state().clickThroughShortcut, "`");
  assert.equal(keys.has("`"), true);
  assert.equal(
    keys.has("F9"),
    true,
    "Must not unregister another application's binding",
  );
});
