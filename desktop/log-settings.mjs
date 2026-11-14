import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, isAbsolute } from "node:path";

export async function readLogPreference(file) {
  try {
    const value = JSON.parse(await readFile(file, "utf8"));
    if (
      value.mode === "manual" &&
      typeof value.path === "string" &&
      isAbsolute(value.path)
    )
      return value;
  } catch {
    /* Default to automatic detection if preferences are missing/invalid. */
  }
  return { mode: "auto", path: null };
}

export async function saveLogPreference(file, value) {
  await mkdir(dirname(file), { recursive: true });
  await writeFile(`${file}.tmp`, JSON.stringify(value));
  await rename(`${file}.tmp`, file);
}
