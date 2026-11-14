import { dialog, shell } from "electron";
import { open } from "node:fs/promises";
import { basename } from "node:path";
import { saveLogPreference } from "./log-settings.mjs";

export function createLogControls({ monitor, window, preferencesFile }) {
  let changing = Promise.resolve();
  function configure(path) {
    changing = changing
      .catch(() => {})
      .then(async () => {
        await saveLogPreference(preferencesFile, {
          mode: path ? "manual" : "auto",
          path,
        });
        return monitor.selectPath(path);
      });
    return changing;
  }
  return {
    refresh: () => monitor.refresh(),
    automatic: () => configure(null),
    async choose() {
      const options = {
        title: "Select Path of Exile client log",
        defaultPath: monitor.status()?.path || undefined,
        properties: ["openFile"],
        filters: [
          {
            name: "PoE client log (Client.txt / LatestClient.txt)",
            extensions: ["txt"],
          },
        ],
      };
      const result = await dialog.showOpenDialog(
        ...(window.isVisible() ? [window, options] : [options]),
      );
      if (result.canceled || !result.filePaths.length) return monitor.status();
      const path = result.filePaths[0];
      if (
        !["client.txt", "latestclient.txt"].includes(
          basename(path).toLowerCase(),
        )
      ) {
        throw new Error(
          "Choose Client.txt or LatestClient.txt from the game's logs folder.",
        );
      }
      const file = await open(path, "r");
      try {
        if (!(await file.stat()).isFile())
          throw new Error("The selected log is not a regular file.");
      } finally {
        await file.close();
      }
      return configure(path);
    },
    reveal() {
      const path = monitor.status()?.path;
      if (path) shell.showItemInFolder(path);
    },
  };
}
