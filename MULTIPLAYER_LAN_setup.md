# LAN / Offline Co-op — Colyseus + Express scaffold (Phase 6)

The current `peli2` build is a single Vite package running the sim client-side
(perfect for offline solo). To get couch co-op, split into a tiny monorepo where
**one Node process** runs the Colyseus server AND serves the built PWA. Phones
join via the host PC's LAN IP. No cloud, no Vercel/Fly.

```
deadline/
  packages/
    shared/   # RoomState schema + sim constants (imported by client & server)
    client/   # this Vite/Phaser app
    server/   # Express + Colyseus, also serves client/dist
```

## 1. Dynamic LAN connection (client)
Read the host from the page URL so a phone hitting `http://192.168.1.20:2567`
auto-connects to `ws://192.168.1.20:2567`; offline solo falls back to localhost.

```ts
// packages/client/src/net/connect.ts
import { Client, Room } from 'colyseus.js';

export function serverUrl(): string {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  const host = location.hostname || 'localhost';   // 192.168.x.x on a phone, localhost solo
  const port = 2567;                               // same Node process
  return `${proto}://${host}:${port}`;
}
export async function joinGame(character: 'heikki' | 'shane'): Promise<Room> {
  const client = new Client(serverUrl());
  return client.joinOrCreate('deadline', { character });
}
```
DEPLOY in the lobby calls `joinGame(getDom().getCharacter())`. Solo = the host's
own browser joins its own localhost server (single code path, no "offline mode").

## 2. RoomState schema (packages/shared)
```ts
import { Schema, MapSchema, ArraySchema, type } from '@colyseus/schema';

export class Player extends Schema {
  @type('string') id = ''; @type('string') character = 'heikki';
  @type('number') x = 0; @type('number') y = 0;
  @type('number') aimX = 1; @type('number') aimY = 0;
  @type('number') hp = 100; @type('boolean') dead = false;
}
export class Zombie extends Schema {
  @type('number') x = 0; @type('number') y = 0;
  @type('number') hp = 0; @type('number') kind = 0; @type('number') slowT = 0;
}
export class Tower extends Schema {
  @type('number') x = 0; @type('number') y = 0;
  @type('number') kind = 0; @type('number') level = 1; @type('number') hp = 0;
}
export class SharedResourcePool extends Schema {
  @type('number') wood = 120; @type('number') metal = 60; @type('number') tech = 20; @type('number') stone = 80;
}
export class RoomState extends Schema {
  @type('string') phase = 'day'; @type('number') day = 1; @type('number') dayTimer = 420;
  @type('number') coreHp = 1000;
  @type(SharedResourcePool) resources = new SharedResourcePool();
  @type({ map: Player }) players = new MapSchema<Player>();
  @type([Zombie]) zombies = new ArraySchema<Zombie>();
  @type([Tower]) towers = new ArraySchema<Tower>();
}
```

## 3. Authoritative server room (packages/server)
The server OWNS zombies, tower HP, flow-field, resources. Clients send only
inputs/commands. Re-use the existing `Simulation` class verbatim on the server
and mirror its arrays into the schema each tick (sim stays Phaser-free already).

```ts
import { Room, Client } from 'colyseus';
import { Simulation } from '@deadline/shared/Simulation';
import { RoomState, Player } from '@deadline/shared/state';

export class DeadlineRoom extends Room<RoomState> {
  sim = new Simulation();
  onCreate() {
    this.setState(new RoomState());
    this.setSimulationInterval((dtMs) => this.tick(dtMs / 1000), 1000 / 30); // 30 Hz net tick
    this.onMessage('input', (c, cmd) => this.sim.setInput(c.sessionId, cmd));
    this.onMessage('build', (_c, m) => this.sim.tryBuild(m.kind, m.x, m.y));
    this.onMessage('upgrade', (_c, m) => this.sim.upgradeTower(m.index));
    this.onMessage('startNight', () => this.sim.skipToNight());
  }
  onJoin(c: Client, opt: { character: 'heikki' | 'shane' }) {
    this.sim.addPlayer(c.sessionId, 800, 670);
    const p = new Player(); p.id = c.sessionId; p.character = opt.character;
    this.state.players.set(c.sessionId, p);
  }
  onLeave(c: Client) { this.state.players.delete(c.sessionId); /* sim.removePlayer */ }
  tick(dt: number) {
    this.sim.step(dt);                 // runs at fixed step internally; accumulate if needed
    this.mirrorSimIntoState();         // copy sim.players/enemies/towers/resources -> schema
  }
}
```

## 4. One process serves PWA + Colyseus
```ts
import express from 'express';
import { createServer } from 'http';
import { Server } from 'colyseus';
import path from 'path';

const app = express();
app.use(express.static(path.join(__dirname, '../../client/dist'))); // built PWA
const httpServer = createServer(app);
const game = new Server({ server: httpServer });
game.define('deadline', DeadlineRoom);
httpServer.listen(2567, '0.0.0.0', () => console.log('DEADLINE host on :2567 (LAN)'));
```
Host runs `node server`, reads their LAN IP (`ipconfig`/`ifconfig`), and both
phones open `http://<that-ip>:2567`. `0.0.0.0` bind = reachable across the Wi-Fi.

## 5. Latency strategy (LAN is forgiving)
- Client-side **prediction** for your own player (the local `Simulation` already
  advances on input — keep predicting locally, reconcile on server snapshots).
- **Interpolation** for the remote player + zombies (lerp between 30 Hz snapshots).
- Server is authoritative for zombie HP, tower HP, resources, day/night — clients
  never decide those, preventing desync. On LAN (1–5 ms) this is effectively instant.

Everything the server needs (`Simulation`, `FlowField`, tower stats) is already
Phaser-free in `src/sim/`, so moving it to `packages/shared` is a copy, not a rewrite.
