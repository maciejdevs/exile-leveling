import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export async function buildRenderer() {
  const require = createRequire(join(root, "web/package.json"));
  const typescript = dirname(require.resolve("typescript/package.json"));
  await new Promise((resolve, reject) => {
    const check = spawn(
      process.execPath,
      [join(typescript, "bin/tsc"), "--build"],
      { cwd: join(root, "web"), stdio: "inherit", windowsHide: true },
    );
    check.once("error", reject);
    check.once("exit", (code) =>
      code === 0 ? resolve() : reject(new Error("Renderer type check failed")),
    );
  });
  const { build } = await import(pathToFileURL(require.resolve("vite")).href);
  await build({ root: join(root, "web") });
}
