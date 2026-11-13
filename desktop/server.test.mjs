import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { startAppServer } from "./server.mjs";

test("desktop server serves the app and rejects file traversal and writes", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "exile-overlay-"));
  await writeFile(join(directory, "index.html"), "<h1>Guide</h1>");
  const server = await startAppServer(directory, 0);
  t.after(async () => {
    await server.close();
    await rm(directory, { recursive: true, force: true });
  });
  const page = await fetch(server.url);
  assert.equal(page.status, 200);
  assert.equal(await page.text(), "<h1>Guide</h1>");
  assert.equal(page.headers.get("content-type"), "text/html");
  assert.match(
    page.headers.get("content-security-policy"),
    /frame-ancestors 'none'/,
  );
  assert.equal(
    (await fetch(server.url, { method: "POST", body: "overwrite" })).status,
    405,
  );
  assert.equal((await fetch(`${server.url}..%2fsecret.txt`)).status, 403);
  assert.equal(
    (await fetch(`${server.url}..%5csecret.txt`)).status,
    process.platform === "win32" ? 403 : 404,
  );
  assert.equal((await fetch(`${server.url}missing.js`)).status, 404);
  assert.equal((await fetch(new URL("/package.json", server.url))).status, 404);
  assert.equal((await fetch(server.url, { method: "HEAD" })).status, 200);
});
