import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export async function readSavedBounds(file) {
  try {
    const value = JSON.parse(await readFile(file, "utf8"));
    if (
      [value.x, value.y, value.width, value.height].every(Number.isFinite) &&
      value.width > 0 &&
      value.height > 0
    )
      return value;
  } catch {
    /* Missing or invalid preferences should not prevent startup. */
  }
  return null;
}

// Debounce resize/move events and serialize atomic writes in the app's own profile.
export function createBoundsStore(file, onError = console.error) {
  let pending;
  let timer;
  let writing = Promise.resolve();
  function flush() {
    clearTimeout(timer);
    if (pending) {
      const bounds = pending;
      pending = undefined;
      writing = writing
        .then(async () => {
          await mkdir(dirname(file), { recursive: true });
          await writeFile(`${file}.tmp`, JSON.stringify(bounds));
          await rename(`${file}.tmp`, file);
        })
        .catch(onError);
    }
    return writing;
  }
  return {
    schedule(bounds) {
      pending = bounds;
      clearTimeout(timer);
      timer = setTimeout(() => void flush(), 250);
    },
    flush,
  };
}
