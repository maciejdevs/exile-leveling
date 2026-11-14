import { open, stat } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";

const AREA = /\bGenerating level (\d{1,3}) area "([^"\r\n]{1,128})"/;
const MAX_LINE = 16 * 1024;
const MAX_READ = 256 * 1024;

export function areaMessage(line) {
  const match = AREA.exec(line);
  // Forward only the two fields the route parser needs, never entire log lines.
  return match ? `Generating level ${match[1]} area "${match[2]}"` : null;
}

export function createLogTail(onArea) {
  let position = null;
  let lastPath;
  let identity;
  let pending = Buffer.alloc(0);
  let dropping = false;
  return async (filePath) => {
    const file = await open(filePath, "r");
    try {
      const info = await file.stat();
      if (!info.isFile())
        throw new Error("The selected game log is not a regular file.");
      const nextIdentity = `${info.dev}:${info.ino}:${info.birthtimeMs}`;
      if (position === null || lastPath !== filePath) {
        position = info.size; // Never replay campaign history on startup or path changes.
        pending = Buffer.alloc(0);
        dropping = false;
      } else if (identity !== nextIdentity || info.size < position) {
        position = 0;
        pending = Buffer.alloc(0);
        dropping = false;
      }
      lastPath = filePath;
      identity = nextIdentity;
      const end = Math.min(info.size, position + MAX_READ);
      while (position < end) {
        const buffer = Buffer.alloc(Math.min(64 * 1024, end - position));
        const { bytesRead } = await file.read(
          buffer,
          0,
          buffer.length,
          position,
        );
        if (!bytesRead) break;
        position += bytesRead;
        let chunk = buffer.subarray(0, bytesRead);
        if (dropping) {
          const newline = chunk.indexOf(10);
          if (newline < 0) continue;
          dropping = false;
          chunk = chunk.subarray(newline + 1);
        }
        pending = Buffer.concat([pending, chunk]);
        let newline;
        while ((newline = pending.indexOf(10)) !== -1) {
          if (newline <= MAX_LINE) {
            const message = areaMessage(
              pending.subarray(0, newline).toString("utf8"),
            );
            if (message) onArea(message);
          }
          pending = pending.subarray(newline + 1);
        }
        if (pending.length > MAX_LINE) {
          pending = Buffer.alloc(0);
          dropping = true;
        }
      }
    } finally {
      await file.close();
    }
  };
}

export async function findGameLog(directories) {
  for (const directory of directories) {
    if (!isAbsolute(directory)) continue;
    for (const name of ["LatestClient.txt", "Client.txt"]) {
      const candidate = join(directory, "logs", name);
      try {
        if ((await stat(candidate)).isFile()) return candidate;
      } catch {
        /* Game not started yet. */
      }
    }
  }
  return null;
}

export function startLogMonitor({
  logPath,
  directories = () => [],
  onArea,
  onStatus,
  interval = 500,
}) {
  const explicitPath = logPath ? resolve(logPath) : null;
  let selectedPath = explicitPath;
  let lastDiscovery = 0;
  let lastStatus;
  let closed = false;
  let timer;
  let active;
  const tail = createLogTail(onArea);
  function status(state, message) {
    const value = { state, message, path: selectedPath };
    const key = JSON.stringify(value);
    if (lastStatus !== key) onStatus(value);
    lastStatus = key;
  }
  async function poll() {
    try {
      if (!explicitPath && Date.now() - lastDiscovery >= 3000) {
        lastDiscovery = Date.now();
        selectedPath = await findGameLog(directories());
      }
      if (selectedPath) {
        await tail(selectedPath);
        status("watching", "Auto-progress active");
      } else status("waiting", "Waiting for the PoE game log");
    } catch (error) {
      status(
        "waiting",
        `Waiting for a readable game log (${error.code || "read failed"})`,
      );
    } finally {
      if (!closed)
        timer = setTimeout(() => {
          active = poll();
        }, interval);
    }
  }
  active = poll();
  return {
    async close() {
      closed = true;
      clearTimeout(timer);
      await active;
    },
  };
}
