import { BrowserWindow } from "electron";

// Preserve settings from the previous desktop release's localhost origin. This
// response is intercepted inside this app's session: no socket is opened and no
// browser profile is read. The migration is removed after this one page is read.
export async function readPreviousDesktopStorage(protocol) {
  const oldUrl = "http://127.0.0.1:5179/exile-leveling/";
  let reader;
  try {
    protocol.handle(
      "http",
      (request) =>
        new Response(
          request.url === oldUrl
            ? "<!doctype html><title>Settings migration</title>"
            : null,
          { status: request.url === oldUrl ? 200 : 403 },
        ),
    );
    reader = new BrowserWindow({
      show: false,
      skipTaskbar: true,
      webPreferences: {
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
      },
    });
    await reader.loadURL(oldUrl);
    return await reader.webContents.executeJavaScript(
      "Object.fromEntries(Object.entries(localStorage))",
    );
  } catch (error) {
    console.warn(
      "Previous desktop settings could not be migrated:",
      error.message,
    );
    return {};
  } finally {
    reader?.destroy();
    protocol.unhandle("http");
  }
}
