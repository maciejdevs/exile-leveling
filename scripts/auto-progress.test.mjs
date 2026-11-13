import assert from "node:assert/strict";
import { once } from "node:events";
import { appendFile, mkdtemp, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { WebSocket } from "ws";
import { createLogTail, startAutoProgress } from "./auto-progress.mjs";

const area = (name) =>
  `2026/11/13 [DEBUG Client] Generating level 2 area "${name}" with seed 123`;

async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), "exile-auto-progress-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return join(directory, "LatestClient.txt");
}

test("skips history and emits only complete, new area lines, including split UTF-8", async (t) => {
  const path = await fixture(t);
  await writeFile(path, `${area("old")}\n`);
  const lines = [];
  const tail = createLogTail((line) => lines.push(line));
  await tail(path);
  assert.deepEqual(lines, []);
  const line = area("côte");
  const bytes = Buffer.from(`unrelated\n${line}\r\n`);
  const split = bytes.indexOf(Buffer.from("ô")) + 1;
  await appendFile(path, bytes.subarray(0, split));
  await tail(path);
  assert.deepEqual(lines, []);
  await appendFile(path, bytes.subarray(split));
  await tail(path);
  await tail(path);
  assert.deepEqual(lines, [line]);
});

test("handles truncation and replacement without replaying previous entries", async (t) => {
  const path = await fixture(t);
  await writeFile(path, "old history".repeat(100));
  const lines = [];
  const tail = createLogTail((line) => lines.push(line));
  await tail(path);
  await writeFile(path, `${area("truncated")}\n`);
  await tail(path);
  await rename(path, `${path}.old`);
  await writeFile(path, `${area("replacement")}\n`);
  await tail(path);
  assert.deepEqual(lines, [area("truncated"), area("replacement")]);
});

test(
  "waits for a missing log, broadcasts to clients, and supports reconnecting",
  { timeout: 10000 },
  async (t) => {
    const path = await fixture(t);
    const logs = [];
    const helper = await startAutoProgress({
      logPath: path,
      port: 0,
      interval: 10,
      log: (line) => logs.push(line),
    });
    t.after(() => helper.close());
    const connect = async () => {
      const socket = new WebSocket(`ws://127.0.0.1:${helper.port}`);
      t.after(() => socket.terminate());
      await once(socket, "open");
      return socket;
    };
    const first = await connect();
    await writeFile(path, `${area("history")}\n`);
    while (!logs.some((line) => line.startsWith("Watching "))) await delay(10);
    const second = await connect();
    const messages = [once(first, "message"), once(second, "message")];
    await appendFile(path, `${area("next")}\n`);
    for (const result of await Promise.all(messages))
      assert.equal(result[0].toString(), area("next"));
    first.close();
    await once(first, "close");
    const reconnected = await connect();
    const received = once(reconnected, "message");
    await appendFile(path, `${area("later")}\n`);
    assert.equal((await received)[0].toString(), area("later"));
  },
);
