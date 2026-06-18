# PROJECT: NIGHTFALL — GDD & Technical Architecture

*Working title (placeholder): **Nightfall** / alt: "Hold the Core", "Last Light". A 2D top-down co-op survival tower defense.*

**Pitch:** Two players scavenge a procedurally-generated wasteland by day and defend a central Core Wall against 360° zombie hordes by night. Gather → build → survive. The night gets worse, forever. Breach the Core = permadeath.

**Pillars:** (1) Tense day/night rhythm, (2) shared-fate co-op, (3) readable mobile combat, (4) endless escalation.

This is a living document. Update it as the design changes — paper is a starting point, fun is found by playtesting.

---

## PART 1 — MECHANICS DEEP DIVE

### 1.1 The Core Loop (≈ one day+night = one "round")

```
DAY (timeboxed, ~4–5 min)              NIGHT (survival, until wave cleared)
┌─────────────────────────────┐        ┌──────────────────────────────┐
│ Venture out → scavenge nodes │        │ 360° horde converges on Core │
│ Shoot day-trickle zombies    │   →    │ Towers + players defend      │
│ Deposit into Shared Pool     │        │ NO repairs, NO building*     │
│ Build / upgrade / REPAIR     │        │ Survive → back to DAY (N+1)  │
└─────────────────────────────┘        └──────────────────────────────┘
        warnings: 90s / 60s / 30s / 10s → night falls regardless of location
```
\*Design decision to confirm: can you *build* (not repair) during night? Recommendation: **no** building and **no** repair at night — night is pure execution of your daytime plan. This is what makes the day timer scary.

### 1.2 Resource Economy

Three resources, one **Shared Pool** (both players draw from the same bank). **Zombies drop nothing** — every material is scavenged from the map. This is the core tension engine: to get stronger you must leave the safety of the base and spend your scarce daytime.

| Resource | Rarity | Found in | Primarily spent on |
|----------|--------|----------|--------------------|
| **Wood** | Common (near base) | Trees, pallets, furniture, fences | Barricades, basic walls, light/fast turrets, early repairs |
| **Metal** | Uncommon (mid-ring) | Car wrecks, scrap piles, appliances, pipes | Core Wall upgrades, heavy/slow towers, structural repairs |
| **Tech** | Rare (far ring, dangerous) | Electronics, server racks, military caches | Poison/slow towers, **personal weapon & gear upgrades**, special abilities |

**Spatial risk/reward (procedural map):** resource value increases with distance from the Core. Wood is plentiful in the inner ring; Tech only spawns in the dangerous outer ring where day-zombies are denser. This makes "how far do we push before the timer forces us back?" the central daytime decision.

**Sources (nodes):** finite per run, scattered by the procedural generator. A node yields a fixed amount over a short hold-to-harvest (e.g., 1.5s) or instant pickup for small drops. Nodes do **not** respawn within a run (scarcity drives expansion outward each day).

**Sinks (priority order players will feel):**
1. **Repairs** (day only) — keep Core Wall + towers alive. Recurring tax.
2. **Towers** — build/upgrade the defensive grid.
3. **Personal upgrades** — weapons & gear (the long-term power curve).
4. **Core Wall upgrades** — raise the literal lose-condition HP.

**Starting-point economy (all values are first-pass — playtest and tune):**

| Item | Wood | Metal | Tech | Notes |
|------|-----:|------:|-----:|-------|
| Barricade (wall segment) | 15 | – | – | HP soak, reshapes pathing, no damage |
| Light/Fast turret | 25 | 10 | – | Anti-swarm |
| Heavy/Slow turret | 40 | 35 | – | Anti-tank, splash |
| Frost/Slow tower | 30 | 20 | 10 | AoE slow, no/low damage |
| Poison tower | 30 | 15 | 25 | DoT, ramps vs high-HP/bosses |
| Tower upgrade (per level) | +50% of base cost | | | 3 levels each |
| Repair (per 25% HP) | 10 | 8 | – | Day only |
| Core Wall upgrade (per level) | – | 60 | 20 | Raises max HP + regen cap |
| Personal weapon upgrade | – | 20 | 30 | dmg / fire-rate / mag / reload |
| Personal gear upgrade | 10 | 20 | 25 | move speed / max HP / revive speed / carry cap |

**Day budget reality check:** tune node density so a focused 2-player day yields roughly *one meaningful build + one repair pass*, not everything. Scarcity is the game.

### 1.3 Towers (build grid around the Core)

| Tower | Role | Damage | Rate | Counters | Weak to |
|-------|------|--------|------|----------|---------|
| **Barricade** | Wall / path-shaper / damage soak | none | – | Buys time, funnels horde | Brutes chew it fast |
| **Light/Fast** | Anti-swarm | low | very high | Walkers, Runners | Tanky enemies |
| **Heavy/Slow** | Anti-tank, splash | high | low | Brutes, clusters | Fast swarms slip between shots |
| **Frost/Slow** | Force-multiplier | low/none | aura | Everything (debuff) | Does no killing alone |
| **Poison** | DoT, anti-fat | ramping | tick | Brutes, Boss | Low burst, slow on swarms |

Towers have **HP** and are placed on a grid. Zombies attack towers that block their shortest path to the Core (see pathfinding). Towers are **repaired only during the day**. The metagame is composition + placement: barricades to funnel, slows to hold the funnel, heavies + poison to delete what's stuck in it, light turrets to mop the swarm.

### 1.4 Enemy Roster & Scaling Logic

Difficulty escalates **every night**. Scaling is driven by a single **Threat Budget** that the wave spawner "spends" on enemies, plus mild global stat-creep, plus roster unlocks and boss cadence.

**Threat Budget per night N (1-indexed):**
```
TP(N) = TP_base × growth^(N − 1)
   TP_base = 100,  growth = 1.18   (≈ +18% threat each night, ~2× every 4–5 nights)
```
The spawner spends `TP(N)` by buying enemies from the unlocked roster (weighted by night, biased toward variety so later nights mix types).

**Global stat-creep (applies on top of budget so even basic enemies stay relevant):**
```
HP_mult(N)  = 1 + 0.06 × (N − 1)     # +6%/night, compounding tankiness
DMG_mult(N) = 1 + 0.04 × (N − 1)     # +4%/night, gentler
SPEED:        mostly FIXED            # speed-creep feels unfair — change composition, not footspeed
```

**Roster (base stats × the multipliers above):**

| Enemy | Cost (TP) | Base HP | Speed | Damage | Unlocks | Behavior |
|-------|----------:|--------:|-------|-------:|---------|----------|
| **Walker** (basic) | 1 | 30 | 1.0× | 5 | Night 1 | Shortest path to Core, attacks blockers |
| **Runner** (special) | 2 | 20 | 1.8× | 4 | Night 3 | Fast; punishes gaps in the wall |
| **Brute** (special) | 5 | 150 | 0.6× | 20 | Night 4 | Tank; smashes barricades/towers |
| **Spitter** (special) | 4 | 40 | 0.8× | 6 ranged | Night 6 | Hits towers/players from range |
| **Boss** | scripted | see below | 0.5× | huge | Every 5th night | Tanky, special mechanic, targets Core |

**Boss nights (5, 10, 15, …):** one Boss + a reduced trickle. Boss HP scales on its own curve so it stays a wall:
```
Boss_HP(N) = 1500 × 1.5^( (N / 5) − 1 )     # night 5 ≈ 1500, night 10 ≈ 2250, night 15 ≈ 3375
```
Give each boss a readable mechanic (e.g., a "Charger" that smashes a tower line, a "Summoner" that periodically spawns Walkers, a "Bloater" that AoEs on death). Telegraph everything — mobile readability first.

**Wave shape (night):** spawn from the **map perimeter in multiple simultaneous arcs** (true 360°), in pulses rather than one blob, so players must cover angles and can't stack everything on one side. Night ends when the wave is fully cleared → return to Day N+1.

### 1.5 Pathfinding (the important one)

The brief says zombies **do not maze** — they take the shortest route to the Core and destroy anything blocking it. With hundreds of agents converging on **one** target, do **not** run A* per zombie (it will melt a phone). Use a **flow field / Dijkstra map**:

- Compute one vector field over the build grid with the **Core as the single goal**, treating walls/towers as high-cost or impassable cells.
- Every zombie just **samples the field cell under it** and walks down-gradient — O(1) per agent, scales to huge hordes.
- A zombie whose next path cell is a tower/barricade **attacks that structure** instead of walking through it.
- **Recompute the field only when the grid changes** (tower built/destroyed), not every frame.

This single choice is what lets the 360° horde stay smooth on mobile, and it makes "build to funnel them" emergent and correct.

### 1.6 Players, Death & Game Over

- **No classes.** Both players are identical; power comes from **shared-resource upgrades** to personal weapons & gear. Co-op divergence is emergent (one specializes in scavenging routes, one in base defense) not enforced.
- **Player death:** downed → **10-second respawn** at the Core. The other player keeps fighting. (Optional later: revive-by-teammate for a resource cost — flag as future.)
- **Game Over:** Core Wall HP hits 0 → **instant permadeath**, run ends, full reset. The Core is the only thing that truly matters.

---

## PART 2 — STACK RECOMMENDATION

Tailored to your strengths (web dev + automation), Android deployment, and **netcode-from-day-1**. Everything is JS/TS, AI-friendly, and free/open-source.

| Layer | Pick | Why this, for you |
|-------|------|-------------------|
| **Language** | **TypeScript** | Types are the single biggest accelerator for AI-assisted coding — they let the model (and you) catch contract breaks instantly. Non-negotiable. |
| **Engine / renderer** | **Phaser 3.90** to start → migrate to **Phaser 4** later | See the call-out below. Scene model, Arcade physics, input, tilemaps, audio — batteries included. |
| **Dev server / bundler** | **Vite** | Instant HMR, trivial TS setup, the standard you already know from web. |
| **Mobile wrap → APK** | **Capacitor 8.4** | Wraps your web build into a native Android shell; one command to run on a device. v8 has built-in edge-to-edge Android handling. |
| **Multiplayer server** | **Colyseus 0.17** | Authoritative Node.js game server with automatic state sync (delta-compressed), rooms, matchmaking, and a JS client SDK. **This is the key to "Wi-Fi now, online later."** |
| **Authoritative simulation** | **Plain TypeScript module** (engine-agnostic) | Your game logic lives *outside* Phaser so it can run on the server. Phaser only renders + captures input. |
| **Pathfinding** | **Custom flow-field** (small module) | Right tool for one-goal hordes; ~100 lines, fully AI-codable. |
| **ECS (optional, later)** | **bitECS** *only if profiling demands it* | Don't start here. Begin with simple structured entities; adopt bitECS if large hordes cause GC stutter. |
| **Touch controls** | **`nipplejs`** (virtual joystick) + custom aim/shoot | Left-thumb joystick out of the box; right-thumb aim cursor + Shoot button you build. |
| **Audio** | Phaser sound (WebAudio) | Sufficient; revisit Howler only if you need advanced mixing. |
| **Art pipeline** | Figma / Inkscape / Illustrator → PNG sprite atlas (+ Kenney.nl free assets to start) | Vector style = bold outlines, flat fills, high contrast for mobile readability. Prototype with Phaser Graphics shapes before art exists. |
| **Tooling** | VS Code + this AI workflow, ESLint + Prettier, Git from commit #1 | — |

### ⚠️ Engine call-out: Phaser 3.90 vs Phaser 4 (one of your real decisions to steer)

Phaser **4.1** ("Salusa") is the current stable release (April 2026) with a rewritten WebGL renderer; Phaser **3.90** ("Tsugumi", May 2025) was the final v3 and is now unmaintained. **The public API is mostly the same between them** — sprites, scenes, tilemaps, input all look identical; the breaking changes are in renderer internals, custom shaders, and a few removed classes.

For *your stated #1 priority — AI-assisted vibe coding* — I recommend **starting on Phaser 3.90**, because:
- The training corpus, tutorials, and Q&A for Phaser 3 are an order of magnitude larger, so AI-generated code is far more reliable on it.
- "Unmaintained" is a non-issue for a 2D hobby co-op game — v3 is rock-solid and won't break.
- Phaser's own guidance puts a v3→v4 migration at *"a few hours / an afternoon"* for standard-API games, and they ship an official migration guide + skill. So you lose nothing by upgrading later once you want the new renderer.

**Net:** build on Phaser 3.90 for momentum and reliability now; plan a low-effort Phaser 4 migration once the game is real. *(If you'd rather future-proof from line one, Phaser 4 is a legitimate choice — just expect occasional AI suggestions that need a small v3→v4 fix.)*

### The architectural keystone — why this stack makes multiplayer painless

> **Separate the SIMULATION from the RENDERER from day one.**

- The **Simulation** (movement, combat, horde, economy, build grid, scaling) is pure TypeScript with **no Phaser imports**. It advances on a **fixed timestep** and only ever changes state in response to **input commands**.
- **Phaser** is a thin client: it captures touch input → sends commands, and draws sprites from the simulation's state. It owns *nothing* authoritative.
- This same Simulation runs **inside a Colyseus room on the server**. Therefore:
  - **Single player / testing:** client connects to a Colyseus room on `localhost`.
  - **Local Wi-Fi co-op:** one device (or a laptop on the same network) runs the server; the other player connects to its **LAN IP**. *(Phones can both connect to a laptop host for stability.)*
  - **Online later:** deploy the *exact same* server to Colyseus Cloud or a cheap VPS. **Only the connection URL changes — zero gameplay rewrite.**

The classic mistake is bolting multiplayer on at the end; it forces a ground-up rewrite. We avoid it by making the server-authoritative boundary real **early** (Phase 2), so every gameplay system after it is born multiplayer-correct. Server is always the source of truth; clients predict their own player and interpolate everything else.

---

## PART 3 — VIBE CODING ROADMAP

Each phase is a self-contained chunk you can feed me as "build Phase N." Cross-cutting golden rules apply throughout: **fixed-timestep sim, server authority, pool everything spawned (zombies/projectiles/particles), config-driven balance, use `delta` for all motion.**

| Phase | Goal | You can play / see… |
|------:|------|---------------------|
| **0** | **Scaffold + "Hello Android."** Vite + TS + Phaser project; render a moving rectangle; wrap with Capacitor; **side-load to Shane's phone.** Prove the whole toolchain end-to-end *before* writing real game code. | A colored square moving on your actual phones |
| **1** | **Twin-stick controller + top-down world.** Player sprite, left virtual joystick (nipplejs) 4/8-way move, right-thumb aim cursor + Shoot button, camera follow, a test arena. **Establish the Sim/Render split** (pure-TS `Simulation`, Phaser renders from it). No network yet. | Driving a character around, aiming, shooting blanks |
| **2** | **Authoritative loop via Colyseus (the netcode spine).** Stand up the Colyseus server running the `Simulation`. Client sends input commands; server simulates; client renders synced state with prediction (self) + interpolation (remote). Test 2 browsers on localhost, then **2 phones over Wi-Fi.** | You + Shane moving around the same world on two devices |
| **3** | **Day/Night cycle + phase FSM.** Day→warning→Night→wave→Day state machine on the server; day timer with **90/60/30/10s** UI warnings; night falls regardless of position; horde spawner stub. | The clock, the dread, the warnings firing |
| **4** | **Resources, scavenging & shared pool.** Resource nodes (wood/metal/tech) in the arena, hold-to-harvest, shared pool state, HUD with counts. Day-zombie trickle with simple chase AI you shoot. | Gathering loot, watching the shared bank tick up |
| **5** | **Base building + Core Wall.** Build-mode UI, grid placement around the Core, costs deducted from pool, towers + Core Wall as HP entities, **day-only repair.** Tower types as data-driven configs. | Placing turrets and barricades around your Core |
| **6** | **Night horde + flow-field pathfinding.** Flow field targeting the Core; 360° pulsed waves; zombies follow field, attack blocking towers, attack the Core; towers acquire + fire at enemies. The combat centerpiece. | A real horde night you actually have to survive |
| **7** | **Scaling, specials & bosses + fail states.** Threat-budget spawner + stat-creep formulas; Runner/Brute/Spitter unlocks; **Boss every 5th night**; Core breach → permadeath → reset. | The "one more night" endless escalation |
| **8** | **Procedural world generation.** Replace the test arena with a per-run seeded map (resource distribution, obstacles, danger gradient outward). **Server owns the seed** so both clients generate identical worlds. | A fresh, fair map every run |
| **9** | **Personal progression.** Weapon & gear upgrade UI spending shared resources (damage, fire rate, mag, reload, move speed, max HP, revive). | Getting visibly stronger run over run |
| **10** | **Juice, feel & audio.** Hit flashes, screen shake, particles, muzzle flashes, SFX, day/night ambience, music, UI polish. (This is where it starts to feel *good*.) | A game that punches |
| **11** | **Android optimization & release.** Pooling pass for large hordes, touch tuning, battery/thermal profiling, signed APK, side-load to both phones for keeps. | A real APK on both your home screens |

**Suggested first message after this doc:** *"Build Phase 0."* I'll generate the full project scaffold (Vite + TS + Phaser 3.90 + Capacitor config) and the exact terminal commands to get a rectangle running on Shane's phone.

---

## Open decisions for you to steer
1. **Engine:** start on Phaser 3.90 (my rec, for AI reliability) or jump straight to Phaser 4?
2. **Night actions:** confirm *no building and no repair* at night (recommended) vs. allow building.
3. **Co-op host model for Wi-Fi:** both phones connect to a **laptop** host on the LAN (most stable), or one phone acts as host?
4. **Revive mechanic:** keep simple 10s auto-respawn only, or add teammate-revive-for-resources later?
5. **Title:** Nightfall / Hold the Core / Last Light / something of your own?

*Sources for tool versions: Phaser 4.1.0 (phaser.io), Phaser 3.90 / v3→v4 migration (phaser.io), Capacitor 8.4 (ionic.io), Colyseus 0.17 (colyseus.io).*
