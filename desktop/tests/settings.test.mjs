import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createBoundsStore, readSavedBounds } from "../settings.mjs";

test("preferences recover from invalid files and save the newest bounds atomically", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "exile-settings-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const file = join(directory, "bounds.json");
  assert.equal(await readSavedBounds(file), null);
  await writeFile(file, "invalid");
  assert.equal(await readSavedBounds(file), null);
  const errors = [];
  const store = createBoundsStore(file, (error) => errors.push(error));
  store.schedule({ x: 1, y: 2, width: 400, height: 500 });
  const first = store.flush();
  const newest = { x: 3, y: 4, width: 350, height: 300 };
  store.schedule(newest);
  await Promise.all([first, store.flush()]);
  assert.deepEqual(await readSavedBounds(file), newest);
  assert.deepEqual(errors, []);
});
