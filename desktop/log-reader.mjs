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
      const previousPosition = position;
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
      return {
        size: info.size,
        modifiedAt: info.mtimeMs,
        bytesRead: position - previousPosition,
      };
    } finally {
      await file.close();
    }
  };
}

export async function findGameLog(directories) {
  for (const directory of directories) {
    if (!isAbsolute(directory)) continue;
    const candidates = [];
    for (const name of ["LatestClient.txt", "Client.txt"]) {
      const candidate = join(directory, "logs", name);
      try {
        const info = await stat(candidate);
        if (info.isFile())
          candidates.push({ name, path: candidate, modifiedAt: info.mtimeMs });
      } catch {
        /* Game not started yet. */
      }
    }
    // Prefer the live file if an old LatestClient.txt was left behind. Equal
    // timestamps keep LatestClient first, as it is smaller and session-specific.
    const latest = candidates.find(
      (candidate) => candidate.name === "LatestClient.txt",
    );
    candidates.sort((a, b) => b.modifiedAt - a.modifiedAt);
    if (latest && latest.modifiedAt >= candidates[0].modifiedAt - 2000)
      return latest.path;
    if (candidates.length) return candidates[0].path;
  }
  return null;
}

export async function readLastArea(filePath) {
  const file = await open(filePath, "r");
  try {
    const info = await file.stat();
    if (!info.isFile())
      throw new Error("The selected log is not a regular file.");
    const start = Math.max(0, info.size - MAX_READ);
    const buffer = Buffer.alloc(info.size - start);
    const { bytesRead } = await file.read(buffer, 0, buffer.length, start);
    let lines = buffer.subarray(0, bytesRead).toString("utf8").split(/\r?\n/);
    if (start > 0) lines = lines.slice(1);
    // Only complete lines count, including when the game is currently writing.
    if (lines.at(-1) !== "") lines.pop();
    for (let index = lines.length - 1; index >= 0; index--) {
      if (lines[index].length > MAX_LINE) continue;
      const message = areaMessage(lines[index]);
      if (message) return message;
    }
    return null;
  } finally {
    await file.close();
  }
}

export function startLogMonitor({
  logPath,
  directories = () => [],
  onArea,
  onStatus,
  interval = 500,
}) {
  let explicitPath = logPath ? resolve(logPath) : null;
  let selectedPath = explicitPath;
  let lastDiscovery = 0;
  let lastStatus;
  let closed = false;
  let timer;
  let active;
  let operation = Promise.resolve();
  let refreshRequested = true;
  let previousPath;
  let latestArea = null;
  let latestAreaAt = null;
  let areaEvents = 0;
  let fileInfo = {};
  let currentStatus;
  const tail = createLogTail((message) => {
    latestArea = message;
    latestAreaAt = Date.now();
    areaEvents++;
    onArea(message);
  });
  function status(state, message) {
    const value = {
      state,
      message,
      path: selectedPath,
      mode: explicitPath ? "manual" : "auto",
      lastArea: latestArea,
      lastAreaId: latestArea ? (AREA.exec(latestArea)?.[2] ?? null) : null,
      lastAreaAt: latestAreaAt,
      areaEvents,
      fileSize: fileInfo.size ?? null,
      modifiedAt: fileInfo.modifiedAt ?? null,
    };
    currentStatus = value;
    const key = JSON.stringify(value);
    if (lastStatus !== key) onStatus(value);
    lastStatus = key;
  }
  async function read() {
    try {
      if (
        !explicitPath &&
        (refreshRequested || Date.now() - lastDiscovery >= 3000)
      ) {
        lastDiscovery = Date.now();
        selectedPath = await findGameLog(await directories());
      }
      if (selectedPath) {
        const changed = selectedPath !== previousPath;
        fileInfo = await tail(selectedPath);
        if (changed || refreshRequested) {
          // Display one recent area for diagnostics. Never replay history into
          // route progress; the user can explicitly synchronize from the menu.
          latestArea = await readLastArea(selectedPath);
          latestAreaAt = latestArea ? Date.now() : null;
          previousPath = selectedPath;
        }
        refreshRequested = false;
        status("watching", "Auto-progress active");
      } else {
        latestArea = null;
        latestAreaAt = null;
        fileInfo = {};
        status("waiting", "Waiting for the PoE game log");
      }
    } catch (error) {
      status(
        "waiting",
        `Waiting for a readable game log (${error.code || "read failed"})`,
      );
    }
    return currentStatus;
  }
  function enqueueRead() {
    operation = operation.then(read);
    return operation;
  }
  async function poll() {
    try {
      await enqueueRead();
    } finally {
      if (!closed)
        timer = setTimeout(() => {
          active = poll();
        }, interval);
    }
  }
  active = poll();
  return {
    refresh() {
      operation = operation.then(() => {
        refreshRequested = true;
        return read();
      });
      return operation;
    },
    selectPath(path) {
      operation = operation.then(() => {
        explicitPath = path ? resolve(path) : null;
        selectedPath = explicitPath;
        refreshRequested = true;
        return read();
      });
      return operation;
    },
    status() {
      return currentStatus;
    },
    async close() {
      closed = true;
      clearTimeout(timer);
      await active;
      await operation;
    },
  };
}
