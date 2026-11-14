import { packager } from "@electron/packager";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import {
  access,
  cp,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { root } from "./renderer.mjs";

async function verifiedCachedRuntime(version) {
  const cache = join(root, ".electron-cache");
  const name = `electron-v${version}-win32-x64.zip`;
  const checksums = JSON.parse(
    await readFile(join(root, "node_modules/electron/checksums.json"), "utf8"),
  );
  let entries;
  try {
    entries = await readdir(cache, { withFileTypes: true });
  } catch {
    return undefined;
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const directory = join(cache, entry.name);
    const zip = join(directory, name);
    try {
      await access(zip);
    } catch {
      continue;
    }
    const hash = createHash("sha256");
    for await (const chunk of createReadStream(zip)) hash.update(chunk);
    if (hash.digest("hex") !== checksums[name])
      throw new Error(
        "Cached Electron runtime checksum mismatch. Remove the damaged cached ZIP before rebuilding.",
      );
    return directory;
  }
  return undefined;
}

// Stage an explicit allowlist. No workspace secrets, caches, test files, or
// development dependencies belong in the distributable app.
export async function packageApp() {
  const output = join(root, "release");
  await mkdir(output, { recursive: true });
  const staging = await mkdtemp(join(output, ".stage-"));
  try {
    const electron = JSON.parse(
      await readFile(join(root, "node_modules/electron/package.json"), "utf8"),
    );
    const electronZipDir = await verifiedCachedRuntime(electron.version);
    await cp(join(root, "desktop"), join(staging, "desktop"), {
      recursive: true,
      filter: (source) => !source.startsWith(join(root, "desktop/tests")),
    });
    await cp(join(root, "web/dist"), join(staging, "web/dist"), {
      recursive: true,
    });
    await writeFile(
      join(staging, "package.json"),
      JSON.stringify(
        {
          name: "exile-leveling-overlay",
          productName: "Exile Leveling Overlay",
          version: "0.2.0",
          description: "External Path of Exile leveling overlay",
          main: "desktop/main.mjs",
        },
        null,
        2,
      ),
    );
    const paths = await packager({
      dir: staging,
      out: output,
      name: "Exile Leveling Overlay",
      platform: "win32",
      arch: "x64",
      electronVersion: electron.version,
      download: { cacheRoot: join(root, ".electron-cache") },
      electronZipDir,
      overwrite: true,
      prune: false,
      asar: true,
    });
    console.log(
      `Standalone app: ${join(paths[0], "Exile Leveling Overlay.exe")}`,
    );
    console.log(
      "Keep the entire folder together. The app waits in the tray until PoE is focused.",
    );
  } finally {
    if (resolve(staging).startsWith(output + sep))
      await rm(staging, { recursive: true, force: true });
  }
}
