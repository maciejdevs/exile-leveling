import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createAssetHandler, isAppUrl } from "../assets.mjs";

test("private asset scheme serves bundled files and rejects writes and traversal", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "exile-assets-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await writeFile(join(directory, "index.html"), "<h1>Guide</h1>");
  const handler = createAssetHandler(directory);
  const request = (url, method = "GET") => handler({ url, method });
  const page = await request("exile://app/");
  assert.equal(page.status, 200);
  assert.equal(await page.text(), "<h1>Guide</h1>");
  assert.match(
    page.headers.get("content-security-policy"),
    /object-src 'none'/,
  );
  assert.equal((await request("exile://app/", "POST")).status, 405);
  assert.equal((await request("exile://app/..%2fsecret.txt")).status, 403);
  assert.equal((await request("exile://app/..%5csecret.txt")).status, 403);
  assert.equal((await request("exile://other/")).status, 403);
  assert.equal((await request("exile://app/missing.js")).status, 404);
  assert.equal((await request("exile://app/", "HEAD")).status, 200);
  assert.equal(isAppUrl("exile://app/#/build"), true);
  assert.equal(isAppUrl("https://app/"), false);
  assert.equal(isAppUrl("exile://user@app/"), false);
});
