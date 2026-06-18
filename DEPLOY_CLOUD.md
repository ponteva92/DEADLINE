# DEADLINE — Free Cloud Co-op (Render backend + Vercel frontend)

Goal: you + Shane play co-op over the internet with **nothing running on your PC**, on free tiers.
Split deploy: the Colyseus server → **Render**, the Vite PWA → **Vercel**. Solo & LAN modes are untouched.

Prereqs: push this repo to **GitHub** (Render + Vercel deploy from a Git repo).

## 1. Backend → Render.com (free Web Service)
1. render.com → **New → Blueprint** → connect your GitHub repo. It auto-reads `render.yaml`.
   (Or **New → Web Service** manually with: Build `npm install && npm run build:server`,
   Start `node packages/server/dist/server/src/index.js`, Health check `/health`.)
2. Deploy. When live you'll get a URL like `https://deadline-server.onrender.com`.
3. Verify: open `https://deadline-server.onrender.com/health` → `{"ok":true}`.
- Render injects `PORT`; the server already reads it + binds `0.0.0.0`, and now sends `Access-Control-Allow-Origin: *` so the Vercel client can reach matchmaking. WebSockets are supported on Render web services.
- ⚠️ Free tier **sleeps after ~15 min idle** → first connection cold-starts (~30-50s). The lobby just waits; it'll connect once awake.

## 2. Frontend → Vercel (free)
1. vercel.com → **Add New → Project** → import the same repo. It reads `vercel.json`
   (Build `npm run build`, Output `dist`).
2. **Settings → Environment Variables** add:
   `VITE_SERVER_URL = wss://deadline-server.onrender.com`  (use YOUR Render URL; `https://` also works — it's auto-upgraded to `wss://`).
3. Deploy. You get e.g. `https://deadline.vercel.app`.
4. You + Shane both open that URL on your phones → pick a character → **LAN CO-OP** button now reaches the cloud server (the button connects to `VITE_SERVER_URL` in production).

## 3. How the connection resolves (`src/net/connect.ts`)
```
VITE_SERVER_URL set?  ── yes ─▶  wss://deadline-server.onrender.com   (Vercel production)
        │ no
        ▼
served from a LAN IP?  ─────────▶  ws://<that-ip>:2567                 (npm run play on your PC)
        │ otherwise
        ▼
                                   ws://localhost:2567                  (local dev / solo fallback)
```
- **Solo** (offline / Capacitor APK): the lobby's **PLAY SOLO** button never connects — runs the sim in-browser. Cloud env has zero effect on it.
- **LAN**: unchanged — `npm run play` on a PC still hosts for same-Wi-Fi phones.

## Notes
- Both tiers are free; the only cost is the Render cold-start delay. Keep it warm with a free uptime pinger (e.g. cron-job.org hitting `/health` every 10 min) if you want instant joins.
- The server still serves a static `/dist` if present (harmless on Render; the real client is on Vercel).
