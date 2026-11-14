import assert from "node:assert/strict";
import {
  appendFile,
  mkdir,
  mkdtemp,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import test from "node:test";
import {
  areaMessage,
  createLogTail,
  findGameLog,
  startLogMonitor,
} from "../log-reader.mjs";

const line = (name) =>
  `2026/11/14 [DEBUG Client] Generating level 2 area "${name}" with seed 123`;
const message = (name) => `Generating level 2 area "${name}"`;
async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), "exile-log-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return { directory, path: join(directory, "LatestClient.txt") };
}

test("forwards only sanitized area fields, never unrelated log content", () => {
  assert.equal(areaMessage(line("1_1_town")), message("1_1_town"));
  assert.equal(areaMessage("Private chat message"), null);
  assert.equal(areaMessage('Generating level 2 area "invalid\narea"'), null);
  assert.equal(
    areaMessage(`Generating level 2 area "${"a".repeat(129)}"`),
    null,
  );
});

test("skips history, buffers partial UTF-8 lines, and never duplicates or writes", async (t) => {
  const { path } = await fixture(t);
  await writeFile(path, `${line("history")}\n`);
  const areas = [];
  const poll = createLogTail((area) => areas.push(area));
  await poll(path);
  assert.deepEqual(areas, []);
  const bytes = Buffer.from(`unrelated\n${line("côte")}\r\n`);
  const split = bytes.indexOf(Buffer.from("ô")) + 1;
  await appendFile(path, bytes.subarray(0, split));
  await poll(path);
  assert.deepEqual(areas, []);
  await appendFile(path, bytes.subarray(split));
  const contents = await readFile(path);
  await poll(path);
  await poll(path);
  assert.deepEqual(areas, [message("côte")]);
  assert.deepEqual(await readFile(path), contents);
});

test("recovers after truncation/replacement and skips history when switching files", async (t) => {
  const { path, directory } = await fixture(t);
  await writeFile(path, "history".repeat(100));
  const areas = [];
  const poll = createLogTail((area) => areas.push(area));
  await poll(path);
  await writeFile(path, `${line("truncated")}\n`);
  await poll(path);
  await rename(path, `${path}.old`);
  await writeFile(path, `${line("replacement")}\n`);
  await poll(path);
  const second = join(directory, "Client.txt");
  await writeFile(second, `${line("other-session-history")}\n`);
  await poll(second);
  await appendFile(second, `${line("new-session")}\n`);
  await poll(second);
  assert.deepEqual(areas, [
    message("truncated"),
    message("replacement"),
    message("new-session"),
  ]);
});

test("discards oversized lines and bounds work per poll during large bursts", async (t) => {
  const { path } = await fixture(t);
  await writeFile(path, "");
  const areas = [];
  const poll = createLogTail((area) => areas.push(area));
  await poll(path);
  await appendFile(path, "x".repeat(20000));
  await poll(path);
  await appendFile(path, `${line("discard-me")}\n${line("good")}\n`);
  await poll(path);
  assert.deepEqual(areas, [message("good")]);
  await appendFile(path, `${line("burst")}\n`.repeat(6000));
  await poll(path);
  assert.ok(areas.length < 6001);
  for (let i = 0; i < 4; i++) await poll(path);
  assert.equal(areas.length, 6001);
});

test(
  "discovers preferred logs and waits safely for a missing file",
  { timeout: 5000 },
  async (t) => {
    const { path, directory } = await fixture(t);
    await mkdir(join(directory, "logs"));
    await writeFile(join(directory, "logs", "Client.txt"), "");
    assert.equal(
      await findGameLog(["relative", directory]),
      join(directory, "logs", "Client.txt"),
    );
    await writeFile(join(directory, "logs", "LatestClient.txt"), "");
    assert.equal(
      await findGameLog([directory]),
      join(directory, "logs", "LatestClient.txt"),
    );
    const statuses = [];
    const areas = [];
    const monitor = startLogMonitor({
      logPath: path,
      onStatus: (value) => statuses.push(value),
      onArea: (value) => areas.push(value),
      interval: 10,
    });
    t.after(() => monitor.close());
    while (!statuses.length) await delay(10);
    assert.equal(statuses[0].state, "waiting");
    // Publish history atomically: a write after an empty file is first opened
    // would correctly count as a new live event rather than startup history.
    await writeFile(`${path}.ready`, `${line("old")}\n`);
    await rename(`${path}.ready`, path);
    while (!statuses.some((value) => value.state === "watching"))
      await delay(10);
    await appendFile(path, `${line("next")}\n`);
    while (!areas.length) await delay(10);
    assert.deepEqual(areas, [message("next")]);
    assert.equal(monitor.status().lastAreaId, "next");
    assert.equal(monitor.status().areaEvents, 1);
    assert.equal((await monitor.refresh()).lastAreaId, "next");
    assert.deepEqual(
      areas,
      [message("next")],
      "Refreshing must not replay events",
    );
    await monitor.close();
    await appendFile(path, `${line("after-close")}\n`);
    await delay(30);
    assert.deepEqual(areas, [message("next")]);
  },
);

test(
  "switches tracking files without replaying history",
  { timeout: 5000 },
  async (t) => {
    const { path, directory } = await fixture(t);
    const second = join(directory, "Client.txt");
    await writeFile(path, `${line("first-history")}\n`);
    await writeFile(second, `${line("second-history")}\n`);
    const areas = [];
    const monitor = startLogMonitor({
      logPath: path,
      interval: 10,
      onArea: (value) => areas.push(value),
      onStatus: () => {},
    });
    t.after(() => monitor.close());
    while (!monitor.status()) await delay(10);
    assert.equal(monitor.status().lastAreaId, "first-history");
    const selected = await monitor.selectPath(second);
    assert.equal(selected.mode, "manual");
    assert.equal(selected.lastAreaId, "second-history");
    assert.deepEqual(areas, []);
    await appendFile(second, `${line("live")}\n`);
    while (!areas.length) await delay(10);
    assert.deepEqual(areas, [message("live")]);
  },
);
