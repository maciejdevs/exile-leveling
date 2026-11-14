import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { join } from "node:path";
import { buildRenderer, root } from "./renderer.mjs";

try {
  await buildRenderer();
  process.env.ELECTRON_CACHE ??= join(root, ".electron-cache");
  const require = createRequire(import.meta.url);
  const child = spawn(
    require("electron"),
    [join(root, "desktop/main.mjs"), ...process.argv.slice(2)],
    {
      stdio: "inherit",
      windowsHide: false,
    },
  );
  child.once("error", (error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
  child.once("exit", (code) => {
    process.exitCode = code ?? 0;
  });
  // Match Electron's launcher. The owned focus helper also exits if its parent
  // disappears, including forced terminal shutdowns on Windows.
  for (const signal of ["SIGINT", "SIGTERM"])
    process.once(signal, () => child.kill(signal));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
