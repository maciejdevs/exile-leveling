import { packager } from "@electron/packager";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const output = join(root, "release");
await mkdir(output, { recursive: true });
const staging = await mkdtemp(join(output, ".overlay-stage-"));
try {
  const electron = JSON.parse(
    await readFile(join(root, "node_modules/electron/package.json"), "utf8"),
  );
  const ws = JSON.parse(
    await readFile(join(root, "node_modules/ws/package.json"), "utf8"),
  );
  await cp(join(root, "desktop"), join(staging, "desktop"), {
    recursive: true,
    filter: (source) => !source.endsWith(".test.mjs"),
  });
  await mkdir(join(staging, "scripts"), { recursive: true });
  await cp(
    join(root, "scripts/auto-progress.mjs"),
    join(staging, "scripts/auto-progress.mjs"),
  );
  await cp(join(root, "web/dist-desktop"), join(staging, "web/dist-desktop"), {
    recursive: true,
  });
  await cp(join(root, "node_modules/ws"), join(staging, "node_modules/ws"), {
    recursive: true,
  });
  await writeFile(
    join(staging, "package.json"),
    JSON.stringify(
      {
        name: "exile-leveling-overlay",
        productName: "Exile Leveling Overlay",
        version: "0.1.0",
        description: "External Path of Exile leveling overlay",
        main: "desktop/main.cjs",
        dependencies: { ws: ws.version },
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
    overwrite: true,
    prune: false,
    asar: true,
  });
  console.log(
    `Standalone app: ${join(paths[0], "Exile Leveling Overlay.exe")}`,
  );
  console.log(
    "Keep the entire output folder together. No Node.js or browser is needed to run it.",
  );
} finally {
  // Only remove the unique temporary directory we created inside release.
  if (resolve(staging).startsWith(output + sep))
    await rm(staging, { recursive: true, force: true });
}
