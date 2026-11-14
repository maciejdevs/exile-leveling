# Maintaining the standalone fork

## Ownership of code

| Path                               | Responsibility                                                                               |
| ---------------------------------- | -------------------------------------------------------------------------------------------- |
| `common/data/routes/`              | Upstream campaign routes.                                                                    |
| `common/data/json/`, `common/src/` | Upstream game data, route parsing, and build processing.                                     |
| `seeding/`                         | Upstream utilities for generating game/tree data.                                            |
| `web/src/`                         | Electron renderer based on the upstream UI; desktop-specific UI changes live here.           |
| `desktop/`                         | Window lifecycle, safe IPC, focus detection, log reading, settings, and packaged-app checks. |
| `scripts/`                         | Shared renderer build, desktop launch, and packaging.                                        |

`common/` and `seeding/` are deliberately not rewritten for desktop integration.
The renderer consumes the same route parser and build data. Updating a route does
not require changing any desktop code.

## Bringing in upstream changes

The existing `upstream` remote points at `HeartofPhos/exile-leveling`. Commit your
local work first, then fetch and review the files you want:

```powershell
git fetch upstream
git diff HEAD upstream/main -- common/data/routes
```

After reviewing, this replaces only the selected route files with upstream's
versions; it does not bring back their browser UI or deployment setup:

```powershell
git restore --source=upstream/main -- common/data/routes
npm.cmd test
npm.cmd run build
```

For other non-UI updates, apply the same review-and-restore workflow to the
specific paths under `common/src/`, `common/data/json/`, or `seeding/src/`.
Review data-schema changes together with their parser changes. Changes to package
manifests/dependencies need a deliberate lockfile update, rather than restoring
upstream's root manifest or lockfile wholesale.

Avoid restoring `web/`, `desktop/`, root build scripts, or deployment workflows
from upstream wholesale: those are the standalone fork's integration boundary.
This makes selective updates straightforward, but does not make arbitrary
upstream UI or schema changes automatically compatible.

Custom routes saved using Edit Route override the bundled default route. If you
want the refreshed default, reset the custom route in Edit Route after updating.

## Desktop modules

- `main.mjs`: app lifecycle, wiring, shortcuts, and tray menu.
- `overlay-window.mjs`: window state and visibility; `visibility.mjs` contains the
  tested foreground/manual-hide rules.
- `windows-focus.ps1` / `windows-focus.mjs`: one hidden helper polls foreground
  ownership every 200ms and scans known PoE process names every 3 seconds. The
  only process handle requests use `PROCESS_QUERY_LIMITED_INFORMATION`, solely
  for executable paths. There are no memory-access rights or input hooks.
- `log-reader.mjs`: read-only log discovery/tailing; bounded reads and line sizes,
  no startup replay, partial UTF-8 buffering, truncation/rotation handling, and
  sanitized area messages. It keeps running while the overlay is hidden.
- `preload.cjs` / `ipc.mjs`: explicit IPC methods, main-frame/origin checks, and
  subscription cleanup. No generic Electron, filesystem, or shell API is exposed.
- `assets.mjs`: serves bundled files through the private `exile://app/` protocol
  with path checks and a CSP. No TCP server is started. `unsafe-eval` is retained
  for the upstream Handlebars tree-template compiler, not for remote scripts.
- `resize.mjs` / `window-bounds.mjs`: resize from OS cursor positions in desktop
  DIP coordinates, with size/display limits. Renderer viewport sizes are not
  mixed with screen coordinates. Resizing ends on release, cancellation, blur,
  locking, hiding, or timeout.
- `settings.mjs`: debounced, serialized, atomic writes in the app's own profile.
- `storage-migration.mjs`: one-origin migration from the previous desktop release;
  the old HTTP origin is intercepted in this app's session without opening a
  server or reading another application's storage.

The focus rules allow the overlay itself to receive focus after PoE, so controls
and dragging remain usable. Focusing a different application clears that session.
Manually hiding the overlay never causes it to appear over another application.

## Validation

`npm test` runs the Node regression suite without launching PoE or a desktop UI.
The packaged-app check uses an isolated test profile and synthetic log, verifies
actual native growth **and shrinkage**, settings migration, private-protocol
rendering, log-to-renderer IPC, transparency, and the Windows focus helper:

```powershell
$check = Start-Process -FilePath '.\release\Exile Leveling Overlay-win32-x64\Exile Leveling Overlay.exe' -ArgumentList '--smoke-test' -WindowStyle Hidden -Wait -PassThru
if ($check.ExitCode -ne 0) { throw 'Packaged app check failed' }
```

It does not change the foreground application, move your pointer, or generate
game input. Focus transition rules are tested with synthetic snapshots; a manual
Alt+Tab check during gameplay remains useful when changing platform/window code.
The Windows CI workflow builds and checks the same executable.
