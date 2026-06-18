# DEADLINE — LAN couch co-op (run guide)

## Status (be clear-eyed)
- ✅ **Monorepo + authoritative server: built & verified.** `tsc` compiles the
  server with 0 errors; it boots, binds `0.0.0.0`, logs your LAN IP, serves the
  PWA, and a connecting client receives synced state — verified headless:
  building a Plasma tower over the wire and `startNight` spawning the wave both
  worked against the live server.
- ⏳ **Client render-from-server: NOT wired yet.** Today the served client still
  runs its own local simulation, so two phones = two *independent* games. The
  remaining step is pointing the renderer at `room.state` and sending input via
  `room.send` (the connector `src/net/connect.ts` is ready). That part can only
  be validated on real devices, so it's the next on-device iteration.

## One-time setup (Host PC)
1. Install **Node.js LTS** (https://nodejs.org) — verify `node -v`.
2. In the project root: `npm install`  (installs client + server + shared workspaces).
3. Windows firewall: allow Node.js on Private networks (first run prompts you).

## Play
```bash
npm run play
```
This builds the client (`vite build` → `/dist`), compiles the server (`tsc`),
and starts it. You'll see:
```
🎮 COUCH CO-OP READY: Open http://192.168.1.X:2567 on your phones!
```
Open that URL on each phone (same Wi-Fi). Host/solo: `http://localhost:2567`.

## Layout (npm workspaces)
```
package.json            # root: workspaces + scripts (play / build:client / build:server)
packages/shared/        # pure sim (Simulation, flow, constants…) + RoomState schema + ipv4 util
packages/server/        # Express + Colyseus authoritative room (compiles to dist/, run with node)
src/                    # the client (Phaser PWA); src/net/connect.ts = dynamic ws://hostname
```

## How the LAN connect works
`src/net/connect.ts` reads `window.location.hostname` + port, so a phone hitting
`http://192.168.1.X:2567` automatically connects to `ws://192.168.1.X:2567` — no
hardcoded IPs. Solo falls back to localhost.

## Next step to finish shared co-op
In `GameScene`, on DEPLOY call `joinGame(character)`; each frame `room.send('input', cmd)`
and render players/zombies/towers/resources from `room.state` instead of the local
`Simulation`; route build/upgrade/startNight through `room.send`. The server already
accepts all those messages (see `packages/server/src/DeadlineRoom.ts`).
