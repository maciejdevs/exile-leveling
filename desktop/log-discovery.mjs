import { readFile } from "node:fs/promises";
import { isAbsolute, join, win32 } from "node:path";

export function steamLibraryPaths(contents) {
  return Array.from(
    contents.matchAll(/"path"\s+"((?:\\.|[^"\\])*)"/g),
    (match) => match[1].replace(/\\\\/g, "\\"),
  ).filter((path) => win32.isAbsolute(path));
}

// Search known locations only. Never crawl disks or inspect unrelated files.
export async function gameInstallDirectories(
  active = [],
  environment = process.env,
) {
  const programs = [
    environment.ProgramFiles,
    environment["ProgramFiles(x86)"],
  ].filter(Boolean);
  const steamRoots = programs.map((base) => join(base, "Steam"));
  const libraries = [...steamRoots];
  for (const steam of steamRoots) {
    try {
      libraries.push(
        ...steamLibraryPaths(
          await readFile(
            join(steam, "steamapps", "libraryfolders.vdf"),
            "utf8",
          ),
        ),
      );
    } catch {
      /* Steam may not be installed in this location. */
    }
  }
  return [
    ...new Set(
      [
        ...active,
        ...libraries.map((library) =>
          join(library, "steamapps", "common", "Path of Exile"),
        ),
        ...programs.flatMap((base) => [
          join(base, "Grinding Gear Games", "Path of Exile"),
          join(base, "Path of Exile"),
        ]),
      ].filter((path) => typeof path === "string" && isAbsolute(path)),
    ),
  ];
}
