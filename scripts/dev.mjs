import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { readOptions, startAutoProgress } from "./auto-progress.mjs";

let helper;
let web;
try {
  const options = readOptions();
  if (options) {
    helper = await startAutoProgress(options);
    const require = createRequire(
      new URL("../web/package.json", import.meta.url),
    );
    const { createServer } = await import(
      pathToFileURL(require.resolve("vite")).href
    );
    web = await createServer({
      root: fileURLToPath(new URL("../web", import.meta.url)),
    });
    await web.listen();
    web.printUrls();
    let stopping = false;
    async function stop(code = 0) {
      if (stopping) return;
      stopping = true;
      await Promise.all([web.close(), helper.close()]);
      process.exitCode = code;
    }
    process.once("SIGINT", () => {
      void stop();
    });
    process.once("SIGTERM", () => {
      void stop();
    });
  }
} catch (error) {
  await Promise.all([web?.close(), helper?.close()]);
  console.error(`Could not start: ${error.message}`);
  process.exitCode = 1;
}
