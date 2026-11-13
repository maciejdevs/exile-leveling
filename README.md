## Getting Started

- `npm ci`
- `npm run seed tree -w seeding` (first run; downloads passive-tree data)
- `npm run dev` (starts the web app and the built-in auto-progress helper)
- Open http://localhost:5173/exile-leveling/ (or the address printed in the terminal).

On Windows PowerShell, use `npm.cmd` instead of `npm` if script execution is disabled.

### Auto-progress

No separate executable is needed. Start Path of Exile and leave `npm run dev` running.
The helper detects the running game's installation on Windows and checks common Steam
and standalone install locations for `logs/LatestClient.txt` (falling back to `Client.txt`).
It prints the log path it is watching. For other locations or operating systems, pass
the full path explicitly:

```powershell
npm.cmd run dev -- --log-path "D:\Games\Path of Exile\logs\LatestClient.txt"
```

You can also set the `POE_LOG_PATH` environment variable. To run just the helper,
use `npm run auto-progress -- --log-path "..."`; `npm run dev -w web` still runs
just the website. The helper listens only on `127.0.0.1:6754` and sends newly appended
area-generation entries to the app. It waits if the game/log is not available yet.
Existing log history is skipped at startup. Stop both services with Ctrl+C.

Progress advances when you enter the next expected area in the route. If you start
midway through the campaign, click the circle beside your current route step first.
The connected notification confirms the socket connection; check the terminal for
`Watching ...` to confirm the game log was found.

Run `npm run test:auto-progress` to test the log reader and WebSocket delivery.

## Seeding

### Passive Tree

- `npm run seed tree -w seeding`

### General

- Find the list of required `dat` files in `seeding/data/index.ts`
- Use https://github.com/HeartofPhos/exile-export to get required `.dat.json` files
- `npm run seed data -w seeding`

## Route

I'm not currently taking PRs related to route changes, my intention is to keep the base route in line with current speed running strategies.

Users are encourged to use the [Edit Route Tab](https://heartofphos.github.io/exile-leveling/#/edit-route) in the deployed app to update the route to their preferred playstyle.
