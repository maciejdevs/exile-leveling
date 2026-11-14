# Exile Leveling Overlay

A standalone Windows overlay for Path of Exile in windowed fullscreen mode.
The background is transparent, current-zone steps are green, and the next zone
entry is amber. Auto-progress is always enabled.

## Run

From this folder, install dependencies once and start the app:

```powershell
npm.cmd ci
npm.cmd start
```

The app starts in the **system tray** and appears when Path of Exile is focused.
Switching to another application hides it within the foreground polling interval
(about 200ms). Clicking its own controls keeps it visible for editing; switching
to any other application hides it again. It never forces PoE into focus.

Drag the title to position it below your status icons. Drag the bottom-right
triangle to grow **or shrink** it (minimum 300 × 220). Arrow keys on the resize
handle adjust its size too. Position and size are remembered.

- **Ctrl+Alt+I / Lock:** toggle click-through for gameplay.
- **Ctrl+Alt+O:** toggle manual hiding while PoE is focused.
- **Tray menu:** see log/focus status, reset the position, or quit.
- **×:** quit.

If log discovery needs help, the only optional startup setting is a log path:

```powershell
npm.cmd start -- --log-path "D:\Games\Path of Exile\logs\LatestClient.txt"
```

`POE_LOG_PATH` is also supported. A green dot in the title bar confirms that the
log is being read; hover over it to see the path. Auto-progress follows the expected
area and catches up to an unambiguous later visit when optional steps were skipped.
It will not guess between repeated visits or move backwards automatically.

Open **Menu → Log tracking** to see the selected file, file-update time, latest
detected area, new area-event count, and the guide's current/next areas. Detection
checks the running game, standard Steam/standalone installs, and Steam's configured
libraries. You can retry detection, select `Client.txt` / `LatestClient.txt`, or open
the log folder. A selected file is remembered. The system tray has these controls too.

If tracking works but the guide is at a different point, use **Sync guide to this
area** on that page. Select the correct visit explicitly for repeated areas.
Existing history is shown for diagnosis, not replayed into progress automatically.

## Commands

| Command             | Purpose                                                                          |
| ------------------- | -------------------------------------------------------------------------------- |
| `npm.cmd start`     | Build the renderer and run the standalone app.                                   |
| `npm.cmd run build` | Create the standalone Windows executable folder.                                 |
| `npm.cmd test`      | Run regression tests for logs, visibility, resizing, settings, and asset access. |

After building, launch `release/Exile Leveling Overlay-win32-x64/Exile Leveling Overlay.exe`.
Keep that entire folder together. Running the executable requires neither Node.js
nor a browser. The first dependency installation/build needs the Electron runtime;
subsequent builds reuse a cached ZIP after verifying its SHA-256 checksum.

There is no browser/PWA mode, separate log-helper command, local web server, or
WebSocket port. The `web/` directory is just the Electron renderer; its name and
upstream source layout are retained to reduce merge conflicts.

## What the downloaded tree assets are

The JSON files in `common/data/tree/` describe passive-skill-tree nodes and their
connections for different PoE versions. The upstream seeding utility derives them
from Grinding Gear Games' public skill-tree exports. They let the app draw the
tree contained in an imported Path of Building build. They are not your personal
builds, executable code, or files installed into PoE.

They are **optional for the route, gem instructions, and auto-progress**. Existing
downloaded files are kept and bundled, but starting/building the app no longer
downloads them automatically. Without them, imported builds still provide their
other information; unavailable passive-tree previews are skipped.

Maintainers who want to refresh those optional previews can use the unchanged
upstream data utility, then rebuild:

```powershell
npm.cmd run seed -w seeding -- tree
```

## Boundaries and upstream updates

The app only reads the game log. It does not inject into the client, install game
hooks, read/write game memory, modify game files, or send game input. A small owned
Windows helper queries foreground-window ownership and executable-path metadata
with limited query rights. If detection fails, the overlay stays hidden.

The renderer is sandboxed with Node integration disabled and an isolated preload
bridge. Only that renderer's main frame can invoke the small allowlist of desktop
controls. Settings are stored in `%APPDATA%\Exile Leveling Overlay`; previous desktop
settings are migrated without reading your browser's profile.

`common/` and `seeding/` retain the original upstream logic and data. See
[the maintenance guide](docs/maintenance.md) for safe route/data updates and the
desktop module layout.
