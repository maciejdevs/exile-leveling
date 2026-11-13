import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

// Include passive-tree assets in the standalone app, including on a fresh clone.
const data = fileURLToPath(new URL("../common/data/", import.meta.url));
if (!existsSync(new URL("../common/data/tree/3_30.json", import.meta.url))) {
  console.log(
    "Downloading passive-tree data for the standalone app (first build only)...",
  );
  const require = createRequire(
    new URL("../seeding/package.json", import.meta.url),
  );
  const result = spawnSync(
    process.execPath,
    [
      require.resolve("tsx/cli"),
      fileURLToPath(new URL("../seeding/src/index.ts", import.meta.url)),
      data,
      "tree",
    ],
    { stdio: "inherit" },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
