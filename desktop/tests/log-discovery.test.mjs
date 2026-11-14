import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  gameInstallDirectories,
  steamLibraryPaths,
} from "../log-discovery.mjs";
import { findGameLog } from "../log-reader.mjs";
import { readLogPreference, saveLogPreference } from "../log-settings.mjs";

test("parses configured Steam library paths", () => {
  const paths = ["C:\\Steam", "D:\\SteamLibrary"];
  const configuration = paths
    .map((path) => '"path" ' + JSON.stringify(path))
    .join("\n");
  assert.deepEqual(steamLibraryPaths(configuration), paths);
});
test("detects standard installs without a running game and avoids a stale session log", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "exile-detection-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const install = join(
    directory,
    "Steam",
    "steamapps",
    "common",
    "Path of Exile",
  );
  await mkdir(join(install, "logs"), { recursive: true });
  const latest = join(install, "logs", "LatestClient.txt");
  const client = join(install, "logs", "Client.txt");
  await writeFile(latest, "");
  await writeFile(client, "");
  const directories = await gameInstallDirectories([], {
    ProgramFiles: directory,
  });
  assert.equal(await findGameLog(directories), latest);
  const old = new Date(Date.now() - 3600000);
  await utimes(latest, old, old);
  assert.equal(await findGameLog(directories), client);
  assert.equal(
    (await gameInstallDirectories([install], { ProgramFiles: directory }))[0],
    install,
  );
});
test("remembers manual selection and can reset to automatic detection", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "exile-log-prefs-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const file = join(directory, "log-tracking.json");
  assert.deepEqual(await readLogPreference(file), { mode: "auto", path: null });
  const manual = { mode: "manual", path: join(directory, "LatestClient.txt") };
  await saveLogPreference(file, manual);
  assert.deepEqual(await readLogPreference(file), manual);
  await saveLogPreference(file, { mode: "auto", path: null });
  assert.deepEqual(await readLogPreference(file), { mode: "auto", path: null });
});
