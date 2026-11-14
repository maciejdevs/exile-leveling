import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { isAbsolute, join } from "node:path";

export function parseFocusMessage(line) {
  const value = JSON.parse(line);
  if (
    !["game", "overlay", "other"].includes(value.foreground) ||
    !Array.isArray(value.directories)
  ) {
    throw new Error("Invalid foreground-window response");
  }
  return {
    foreground: value.foreground,
    directories: value.directories.filter(
      (directory) => typeof directory === "string" && isAbsolute(directory),
    ),
  };
}

// One owned, hidden helper instead of starting PowerShell on every poll. Its
// Win32 calls read foreground ownership and limited executable-path metadata.
// Failure always hides the overlay; game memory is never opened or inspected.
export async function startFocusMonitor({ onChange, onError = console.error }) {
  if (process.platform !== "win32")
    throw new Error("This overlay supports Windows only.");
  const script =
    `$overlayProcessId = ${process.pid}\n` +
    (await readFile(new URL("./windows-focus.ps1", import.meta.url), "utf8"));
  const executable = join(
    process.env.SystemRoot || "C:\\Windows",
    "System32",
    "WindowsPowerShell",
    "v1.0",
    "powershell.exe",
  );
  let child;
  let restart;
  let closed = false;
  function launch() {
    let pending = "";
    let failed = false;
    let diagnostics = "";
    let startupTimer;
    const fail = (message) => {
      if (failed || closed) return;
      failed = true;
      onError(`Focus detection unavailable: ${message}`);
    };
    child = spawn(
      executable,
      [
        "-NoProfile",
        "-NonInteractive",
        "-EncodedCommand",
        Buffer.from(script, "utf16le").toString("base64"),
      ],
      {
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    child.stdout.setEncoding("utf8");
    startupTimer = setTimeout(() => {
      fail("Windows did not answer the foreground-window query");
      child.kill();
    }, 15000);
    child.stdout.on("data", (chunk) => {
      if (closed || failed) return;
      pending += chunk;
      if (pending.length > 64 * 1024) {
        fail("Oversized helper response");
        child.kill();
        return;
      }
      let newline;
      while ((newline = pending.indexOf("\n")) !== -1) {
        const line = pending.slice(0, newline).trim();
        pending = pending.slice(newline + 1);
        if (!line) continue;
        try {
          const snapshot = parseFocusMessage(line);
          clearTimeout(startupTimer);
          onChange(snapshot);
        } catch (error) {
          fail(error.message);
          child.kill();
        }
      }
    });
    // PowerShell also writes benign CLIXML progress records to stderr while
    // preparing .NET modules. Only a failed exit or missing response is fatal.
    child.stderr.on("data", (chunk) => {
      diagnostics = (diagnostics + chunk).slice(-2048);
    });
    child.on("error", (error) => fail(error.message));
    child.on("close", () => {
      clearTimeout(startupTimer);
      if (closed) return;
      fail(`Foreground helper stopped${diagnostics ? `: ${diagnostics}` : ""}`);
      restart = setTimeout(launch, 3000);
    });
  }
  launch();
  return {
    close() {
      closed = true;
      clearTimeout(restart);
      child?.kill();
    },
  };
}
