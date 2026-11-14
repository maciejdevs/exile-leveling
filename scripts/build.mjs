import { buildRenderer } from "./renderer.mjs";
import { packageApp } from "./package.mjs";

try {
  await buildRenderer();
  await packageApp();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
