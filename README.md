# Nightfall

2D top-down co-op survival tower defense — Phaser 3 + TypeScript + Vite, wrapped to Android with Capacitor.

See `GDD_and_Tech_Architecture.md` for the full design and the phased roadmap.

---

## Phase 0 — "Hello Android"

Goal: prove the whole toolchain by getting a controllable square running in the browser **and** on a real Android phone before any real game code.

### Prerequisites (one-time)
- **Node.js 18+** (`node -v`)
- For the Android build: **Android Studio** (includes the Android SDK + platform tools). On first launch, let it install the SDK.
- Shane's phone with **Developer Options + USB debugging** enabled, plugged in via USB (and "Allow" the debugging prompt).

### Run in the browser
```bash
npm install
npm run dev
```
Open the printed `http://localhost:5173`. Move with **WASD / arrows**, or click-and-hold to move toward the cursor.

> Tip: the dev server is exposed on your LAN (`host: true`). Vite also prints a `Network:` URL — open that on your phone's browser (same Wi-Fi) to test touch instantly, no APK needed.

### Put it on the phone (APK via Capacitor)
```bash
# one-time: add the native Android project
npx cap add android

# build the web app + copy into the native shell, then launch on the connected phone
npm run cap:run
```
Or open it in Android Studio and press Run:
```bash
npm run cap:sync
npm run cap:open
```

### Scripts
| Command | Does |
|---------|------|
| `npm run dev` | Vite dev server (hot reload) |
| `npm run build` | Production web build → `dist/` |
| `npm run typecheck` | TypeScript check, no emit |
| `npm run cap:sync` | Build + copy web assets into the Android project |
| `npm run cap:run` | Build + run on the connected Android device |
| `npm run cap:open` | Open the Android project in Android Studio |

### Definition of done for Phase 0
- [ ] Square moves smoothly in the browser (keyboard + touch)
- [ ] Same build runs on Shane's phone via Capacitor
- [ ] Camera follows the player; the Core marker is centered

---

## Phase 1 — Twin-stick controller + Simulation/renderer split

Adds the real control scheme and the architectural keystone.

**Controls**
- **Move:** left-thumb virtual joystick (nipplejs) — full analog, all 8 directions incl. NE/NW/SE/SW. Desktop: WASD / arrows (also diagonal).
- **Aim:** mouse (desktop) or drag the right side of the screen (touch). A reticle shows the aim direction.
- **Fire:** hold the **FIRE** button (bottom-right), or SPACE / left-click on desktop. Auto-fires at the weapon's cadence.

**Architecture**
- `src/sim/` — pure TypeScript `Simulation` (no Phaser/DOM): players, projectiles (pooled), fixed-timestep `step(dt)`, driven only by `InputCommand`s. This is what the host will run over the network later.
- `src/scenes/GameScene.ts` — thin renderer: gathers input → `InputCommand`, advances the sim on a fixed timestep, draws from sim state.
- `src/ui/MovementStick.ts` — nipplejs joystick wrapper.

**Definition of done**
- [ ] Smooth analog movement in all directions (stick + keyboard diagonals)
- [ ] Aim reticle follows mouse / right-drag
- [ ] Holding FIRE / SPACE emits pooled projectiles in the aim direction
- [ ] All gameplay state lives in the sim; the scene only renders

Run it the same way: `npm install && npm run dev` (then test touch via the `Network:` URL on your phone, or `npm run cap:run` for the APK).

Next: **Phase 2** — stand up the host-authoritative WebRTC link so you and Shane share one world across two phones.

---

## Polish Pass — Game Feel, Combat & Visuals

A full juice + content pass. Everything below is authoritative in `src/sim/`
and rendered/felt in `src/scenes/GameScene.ts`.

**Now playable:** zombies spawn from all edges and chase you; shoot them, they
die. Survive escalating waves (wave # steps up every 30s). Single-screen arena
with placeholder structures + a central Core.

**Combat & juice**
- Closest-enemy **auto-aim** with smooth aim-swing + on-target red bracket reticle.
- **Hit feedback:** white flash, knockback, spark burst, floating damage numbers.
- **Death:** green gib particle explosion, fading ground splat, micro screen-shake + hitstop.
- **Player feedback:** red screen flash + shake on damage, i-frame blink, bigger shake on death, 3s respawn.
- **Muzzle flash** glow on every shot; additive glowing projectiles.

**Controls feel**
- Joystick deadzone + response curve; velocity acceleration smoothing (snappy but not robotic).
- Circle-vs-AABB collision **sliding** for player and zombies — no snagging on corners.
- Twin-stick: hold FIRE (aim is automatic), or right-side drag to aim manually; desktop = WASD + mouse + click/SPACE.

**Vector art**
- Procedurally generated textures (player, zombie, projectile, crate, particles).
- Radial-gradient glow / vignette / core light via canvas textures; styled rounded HUD + health bar.

**Architecture note:** the sim reports gameplay **events** (`SimEffect`: fire/hit/kill/playerHit/...)
that the renderer turns into feel. Sim stays pure and deterministic (seeded RNG) — still network-ready.

**Tuning knobs:** all in `src/sim/constants.ts` (player speed, fire cadence, enemy hp/speed/damage,
spawn interval, wave ramp). Tweak freely while playtesting with Shane.

---

## Phase 3 — Day/Night, Gathering, Building & the Core

The shooter becomes the actual game: **gather -> build -> survive -> defend the Core.**

**Loop**
- **DAY (45s):** color-graded daylight, light wandering zombies. Walk onto wood/metal/tech
  nodes to auto-harvest into a shared pool. "NIGHT IN Xs" warnings count down.
- **NIGHT:** screen darkens, a budgeted horde streams in from all sides and marches on the
  central **Core**. You + your towers defend. Cleared the wave -> back to DAY (day++ , harder).
- **Game over:** Core HP hits 0 -> tap to restart.

**Building (day only)**
- Bottom build bar: **Light** (fast, cheap, anti-swarm), **Heavy** (slow, big damage), **Wall** (cheap HP block).
- Tap a tower button to select, then tap the field to place on the grid (ghost + range preview).
  Costs deduct from the shared pool; towers have HP, auto-fire at enemies, and zombies attack them.

**Art / feel (game-art pass)**
- Day/night color grading with a dusk ramp; vector node/tower/Core sprites; gun towers rotate to track targets.
- Core pulse + hit-flash + HP bar; resource HUD; phase banners; build affordability dimming.

**Tuning:** day length, night budget/growth, node yields, tower stats & costs all in `src/sim/constants.ts` (`PHASE`, `NODE`, `TOWERS`).

**Known simplifications (next):** night zombies home straight at the Core (flow-field pathfinding is the planned upgrade so they intelligently route around / prioritize blocking towers); no repair UI yet; still single-player (two-phone co-op is the networking phase).

---

## Phase 2 — Core Overhaul, Asset Integration & QoL

**Pacing**
- Day lengthened to **90s** (from 45) for real scavenging time.
- **START NIGHT** button (top-right, day only) — finish early and trigger the horde instantly (`sim.skipToNight()`).

**Asset integration**
- `BootScene` loads optional PNGs from `/assets`; `tex()` falls back to the procedural art per-sprite if a file is missing, so the project always runs.
- Drop files per `assets/README.md`. Sprites are auto-scaled (`setDisplaySize`), so source resolution is flexible.

**Responsiveness**
- Movement is vector-normalized (diagonals are NOT faster than cardinals) with snappier acceleration + collision sliding vs walls/towers.
- Auto-aim reliably snaps to the closest enemy in range; added **shot tracers** (player = warm, tower = cyan) so you see every line of fire.
- Gathering shows a pulsing ring + **"!"** cue over any node in reach; harvest is proximity-based (no button hunt).
- Build placement is instant grid-snap with live ghost + range preview.

**Known flaws to look for when testing** (next-iteration candidates)
- Night zombies path straight at the Core (no flow-field yet) — they can bunch on walls rather than routing smartly.
- No tower/Core **repair** UI yet; no tower sell/refund.
- Single-screen arena (no scrolling camera); still single-player (co-op networking pending).
- Balance is first-pass: tune `PHASE`, `NODE`, `TOWERS`, `ENEMY` in `src/sim/constants.ts`.

---

## Phase (Premium) — DOM Overlay UI, Lobby & Visual Overhaul

**DOM overlay (`src/ui/dom.ts`, hand-rolled premium CSS)** sits above the Phaser canvas:
- **Lobby / character select** with two bespoke SVG avatars — **Heikki** (heavy-duty tech survivor) and **Shane** (nimble scout-medic). Pick → DEPLOY starts the run.
- **Glossy HUD:** glass resource chips (wood/metal/tech), HP + Core bars, day/night phase pill, **START NIGHT** button.
- **Build dock:** large thumb-friendly glass tower buttons + a glass **info card** (stats) on select; tap a tile to place.
- **Game-over panel** with RESTART. Overlay is pointer-events-transparent except its controls, so movement/aim/fire still hit the canvas.

**Characters in-game:** the chosen avatar renders with a distinct silhouette/palette via `'hk_'`/`'sh_'` animated frame prefixes (`src/render/sprites.ts`). Cosmetic only.

**Visual overhaul (Phaser):** additive **bloom glow** behind each resource node (color-keyed), **ambient rubble-fire lights**, dusk→night color grade + vignette, and **gather juice** — wood-chip particles + floating **"+10 Wood/Metal/Tech"** text. Screen shake on impacts/build/core hits.

**Multiplayer:** no server yet — character choice is local. `MULTIPLAYER_character_sync.md` has the drop-in Colyseus schema/room/client to sync avatars once networking is built.

**Note:** DOM visuals were verified by typecheck+build, not visually QA'd here — playtest and tell me what to nudge (sizing, overlap on small screens, colors).

---

## Architecture Completion Phase — status of the old "Known Flaws"

- ✅ **Hybrid Solo / LAN** — the lobby now offers **PLAY SOLO** and **LAN CO-OP**.
  Solo instantiates `src/sim` in-browser (pure offline, Capacitor-friendly) and feeds
  it local input. LAN connects to the Colyseus server (`packages/server`) which runs
  `src/sim` authoritatively; both avatars spawn in one synced arena (`window.location.hostname`
  → `ws://…`). Verified headless: two clients see each other + shared towers/resources.
- ✅ **Flow-field pathfinding** — `src/sim/flow.ts`: cost grid (towers add HP/level-based
  cost), Dijkstra integration field to the Core, per-cell vectors, rebuilt **only** on
  build/upgrade/sell/destroy. Walled-in case: zombies follow vectors to the cheapest
  blocking structure and attack it until it breaks.
- ✅ **Tower Sell & Repair** — tapping a placed tower's Info Card now shows:
  **REPAIR** (costs 60%×missing-HP of build cost, restores to full, disabled when full) and
  **SELL** (destroys it, refunds **50%** of everything invested, rebuilds the flow-field,
  pops a gold refund effect). Verified headless over the network.

Remaining honest caveats: visuals (the 6 towers' FX, status tints, refund pops) are
verified-by-compile, not eyeballed here — playtest on device. Repair's refund math is
unit-verified; I couldn't headless-damage a tower to watch the HP restore live.
