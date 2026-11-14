import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const DEFAULT_CLICK_THROUGH = "`";
const HIDE = "Control+Alt+O";
const MODIFIERS = ["Control", "Alt", "Shift", "Super"];
const KEYS = new Set([
  "Space",
  "Tab",
  "Backspace",
  "Delete",
  "Insert",
  "Home",
  "End",
  "PageUp",
  "PageDown",
  "Up",
  "Down",
  "Left",
  "Right",
  "Escape",
  "Plus",
]);
export const shortcutLabel = (key) =>
  key?.replaceAll("Control", "Ctrl") || "Not set";

export function normalizeShortcut(value) {
  if (typeof value !== "string" || value.length > 80)
    throw new Error("Choose a valid shortcut.");
  const parts = value.trim().split("+");
  const key = parts.pop();
  if (
    !key ||
    !(
      KEYS.has(key) ||
      /^[A-Za-z0-9]$/.test(key) ||
      /^F(?:[1-9]|1\d|2[0-4])$/.test(key) ||
      /^[`~!@#$%^&*()_\-=\[\]{}\\|;:'",.<>/?]$/.test(key)
    )
  )
    throw new Error("That key cannot be used as a shortcut.");
  const aliases = {
    Ctrl: "Control",
    CommandOrControl: "Control",
    Win: "Super",
    Meta: "Super",
  };
  for (let index = 0; index < parts.length; index++)
    parts[index] = aliases[parts[index]] || parts[index];
  if (
    parts.some((part) => !MODIFIERS.includes(part)) ||
    new Set(parts).size !== parts.length
  )
    throw new Error("Invalid shortcut modifiers.");
  const normalized = [
    ...MODIFIERS.filter((part) => parts.includes(part)),
    /^[a-z]$/.test(key) ? key.toUpperCase() : key,
  ].join("+");
  if (normalized === HIDE)
    throw new Error("Ctrl+Alt+O is already used to hide the overlay.");
  return normalized;
}

// All bindings are owned by this controller and are released outside a PoE
// session and while recording a replacement. No low-level keyboard hook is used.
export async function createShortcutController({
  file,
  register,
  unregister,
  toggleLock,
  toggleHidden,
  onChange,
}) {
  let binding = DEFAULT_CLICK_THROUGH;
  try {
    binding = normalizeShortcut(
      JSON.parse(await readFile(file, "utf8")).clickThrough,
    );
  } catch {
    /* First run or invalid preferences. */
  }
  let active = false;
  let recording = false;
  let error = null;
  let timer;
  let saving = Promise.resolve();
  const owned = new Set();
  const state = () => ({
    clickThroughShortcut: binding,
    shortcutRecording: recording,
    shortcutError: error,
  });
  const publish = () => onChange(state());
  function clear() {
    for (const key of owned) unregister(key);
    owned.clear();
  }
  function install(key, action) {
    if (
      register(key, () => {
        if (active && !recording) action();
      })
    )
      owned.add(key);
    else
      error = `${shortcutLabel(key)} is unavailable. Choose another shortcut in Settings.`;
  }
  function sync() {
    clear();
    error = null;
    if (active && !recording) {
      install(binding, toggleLock);
      install(HIDE, toggleHidden);
    }
    publish();
  }
  return {
    state,
    setActive(value) {
      if (active === value) return;
      active = value;
      if (!active) {
        recording = false;
        clearTimeout(timer);
      }
      sync();
    },
    record(value) {
      recording = value === true;
      clearTimeout(timer);
      if (recording)
        timer = setTimeout(() => {
          recording = false;
          sync();
        }, 30000);
      sync();
    },
    save(value) {
      saving = saving
        .catch(() => {})
        .then(async () => {
          const candidate = normalizeShortcut(value);
          clear();
          try {
            // Probe availability before replacing the saved working binding.
            if (!register(candidate, () => {}))
              throw new Error(
                `${shortcutLabel(candidate)} is already used by another application.`,
              );
            unregister(candidate);
            await mkdir(dirname(file), { recursive: true });
            await writeFile(
              `${file}.tmp`,
              JSON.stringify({ clickThrough: candidate }),
            );
            await rename(`${file}.tmp`, file);
            binding = candidate;
          } finally {
            sync();
          }
          return state();
        });
      return saving;
    },
    close() {
      clearTimeout(timer);
      clear();
    },
  };
}
