import { execFile } from "node:child_process";
import { open, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { promisify } from "node:util";
import { parseArgs } from "node:util";
import { pathToFileURL } from "node:url";
import { WebSocket, WebSocketServer } from "ws";

const execFileAsync = promisify(execFile);
const areaPattern = /Generating level \d+ area "[^"]+"/;

// Start at EOF: old campaign entries must never advance a newly opened guide.
export function createLogTail(onLine) {
  let position = null;
  let identity;
  let pending = Buffer.alloc(0);
  return async (filePath) => {
    const file = await open(filePath, "r");
    try {
      const info = await file.stat();
      const nextIdentity = `${filePath}:${info.dev}:${info.ino}:${info.birthtimeMs}`;
      if (position === null) {
        position = info.size;
      } else if (identity !== nextIdentity || info.size < position) {
        position = 0;
        pending = Buffer.alloc(0);
      }
      identity = nextIdentity;
      // Bound allocations even when Client.txt is large or grows in a burst.
      while (position < info.size) {
        const buffer = Buffer.alloc(Math.min(64 * 1024, info.size - position));
        const { bytesRead } = await file.read(
          buffer,
          0,
          buffer.length,
          position,
        );
        if (!bytesRead) break;
        position += bytesRead;
        pending = Buffer.concat([pending, buffer.subarray(0, bytesRead)]);
        let newline;
        while ((newline = pending.indexOf(10)) !== -1) {
          const line = pending
            .subarray(0, newline)
            .toString("utf8")
            .replace(/\r$/, "");
          pending = pending.subarray(newline + 1);
          if (areaPattern.test(line)) onLine(line);
        }
        if (pending.length > 1024 * 1024) pending = Buffer.alloc(0);
      }
    } finally {
      await file.close();
    }
  };
}

async function findLog() {
  const roots = [];
  if (process.platform === "win32") {
    try {
      const { stdout } = await execFileAsync(
        "powershell.exe",
        [
          "-NoProfile",
          "-NonInteractive",
          "-Command",
          "Get-Process -Name 'PathOfExile*' -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Path -Unique",
        ],
        { windowsHide: true, timeout: 5000 },
      );
      roots.push(...stdout.trim().split(/\r?\n/).filter(Boolean).map(dirname));
    } catch {
      /* The game may not be running yet. */
    }
    for (const base of [
      process.env.ProgramFiles,
      process.env["ProgramFiles(x86)"],
    ].filter(Boolean)) {
      roots.push(join(base, "Grinding Gear Games", "Path of Exile"));
      roots.push(join(base, "Steam", "steamapps", "common", "Path of Exile"));
    }
  }
  for (const root of roots) {
    for (const name of ["LatestClient.txt", "Client.txt"]) {
      const candidate = join(root, "logs", name);
      try {
        if ((await stat(candidate)).isFile()) return candidate;
      } catch {
        /* Try the next install location. */
      }
    }
  }
  return null;
}

export function readOptions() {
  const { values } = parseArgs({
    options: {
      "log-path": { type: "string" },
      help: { type: "boolean", short: "h" },
    },
  });
  if (values.help) {
    console.log(
      'Usage: npm run dev -- --log-path "D:\\Games\\Path of Exile\\logs\\LatestClient.txt"',
    );
    console.log(
      "The log path is optional on Windows; POE_LOG_PATH is also supported.",
    );
    return null;
  }
  return { logPath: values["log-path"] || process.env.POE_LOG_PATH };
}

export async function startAutoProgress({
  logPath,
  port = 6754,
  interval = 500,
  log = console.log,
} = {}) {
  const server = new WebSocketServer({ host: "127.0.0.1", port });
  await new Promise((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  server.on("error", (error) => log(`Auto-progress: ${error.message}`));
  server.on("connection", (socket) => socket.on("error", () => {}));
  log(`Auto-progress listening on ws://127.0.0.1:${server.address().port}`);
  let selectedPath = logPath ? resolve(logPath) : null;
  let lastDiscovery = 0;
  let lastStatus;
  let stopped = false;
  let timer;
  let activePoll;
  const status = (message) => {
    if (message !== lastStatus) log(message);
    lastStatus = message;
  };
  const tail = createLogTail((line) => {
    for (const client of server.clients) {
      if (client.readyState === WebSocket.OPEN) client.send(line);
    }
  });
  async function poll() {
    try {
      if (!selectedPath && Date.now() - lastDiscovery >= 5000) {
        lastDiscovery = Date.now();
        selectedPath = await findLog();
      }
      if (selectedPath) {
        await tail(selectedPath);
        status(`Watching ${selectedPath}`);
      } else {
        status(
          'Waiting for PoE. If detection fails, pass --log-path "...\\logs\\LatestClient.txt".',
        );
      }
    } catch (error) {
      status(`Waiting for readable game log: ${error.message}`);
    } finally {
      if (!stopped)
        timer = setTimeout(() => {
          activePoll = poll();
        }, interval);
    }
  }
  activePoll = poll();
  return {
    port: server.address().port,
    async close() {
      stopped = true;
      clearTimeout(timer);
      await activePoll;
      for (const client of server.clients) client.terminate();
      await new Promise((resolve) => server.close(resolve));
    },
  };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  try {
    const options = readOptions();
    if (options) {
      const helper = await startAutoProgress(options);
      for (const signal of ["SIGINT", "SIGTERM"]) {
        process.once(signal, () => {
          void helper.close();
        });
      }
    }
  } catch (error) {
    console.error(`Auto-progress failed: ${error.message}`);
    process.exitCode = 1;
  }
}
