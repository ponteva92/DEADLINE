import { Room, Client } from 'colyseus';
import { Simulation } from '../../shared/src/Simulation';
import { TICK } from '../../shared/src/constants';
import { RoomState, Player, Zombie, TowerState, NodeState, ProjState } from '../../shared/src/RoomState';

interface InputMsg { moveX: number; moveY: number; aimX: number; aimY: number; manualAim: boolean; shooting: boolean; }

/** Authoritative game room: the server OWNS the simulation; clients send inputs. */
export class DeadlineRoom extends Room<RoomState> {
  maxClients = 4;
  private sim = new Simulation(Math.floor(Math.random() * 1e9));
  private acc = 0;

  onCreate(): void {
    this.setState(new RoomState());
    this.onMessage('input', (c, m: InputMsg) => this.sim.setInput(c.sessionId, m));
    this.onMessage('build', (_c, m: { kind: number; x: number; y: number }) => this.sim.tryBuild(m.kind, m.x, m.y));
    this.onMessage('upgrade', (_c, m: { x: number; y: number }) => { const i = this.sim.towerAt(m.x, m.y); if (i >= 0) this.sim.upgradeTower(i); });
    this.onMessage('repair', (_c, m: { x: number; y: number }) => { const i = this.sim.towerAt(m.x, m.y); if (i >= 0) this.sim.repairTower(i); });
    this.onMessage('sell', (_c, m: { x: number; y: number }) => { const i = this.sim.towerAt(m.x, m.y); if (i >= 0) this.sim.sellTower(i); });
    this.onMessage('startNight', () => this.sim.skipToNight());
    this.setSimulationInterval((dtMs) => this.tick(dtMs / 1000), 1000 / 30);
  }

  onJoin(c: Client, opt: { character?: string }): void {
    const a = Math.random() * Math.PI * 2;
    this.sim.addPlayer(c.sessionId, 800 + Math.cos(a) * 130, 670 + Math.sin(a) * 130);
    const p = new Player(); p.id = c.sessionId; p.character = opt?.character === 'shane' ? 'shane' : 'heikki';
    this.state.players.set(c.sessionId, p);
    console.log(`+ player ${c.sessionId} (${p.character}) — ${this.clients.length} in room`);
  }

  onLeave(c: Client): void {
    this.sim.removePlayer(c.sessionId);
    this.state.players.delete(c.sessionId);
  }

  private tick(dt: number): void {
    this.acc += dt;
    let n = 0;
    while (this.acc >= TICK && n < 5) { this.sim.step(TICK); this.acc -= TICK; n++; }
    this.mirror();
  }

  private mirror(): void {
    const s = this.state, sim = this.sim;
    s.phase = sim.phase; s.day = sim.day; s.dayTimer = sim.dayTimer;
    s.coreHp = sim.core.hp; s.coreMax = sim.core.maxHp; s.gameOver = sim.gameOver;
    s.resources.wood = sim.resources.wood; s.resources.metal = sim.resources.metal;
    s.resources.tech = sim.resources.tech; s.resources.stone = sim.resources.stone;

    for (const [id, p] of sim.players) {
      let sp = s.players.get(id);
      if (!sp) { sp = new Player(); sp.id = id; s.players.set(id, sp); }
      sp.x = p.x; sp.y = p.y; sp.aimX = p.aimX; sp.aimY = p.aimY; sp.hp = p.hp; sp.dead = p.dead;
    }

    const az = sim.enemies.filter((e) => e.active);
    while (s.zombies.length > az.length) s.zombies.pop();
    for (let i = 0; i < az.length; i++) {
      let z = s.zombies[i]; if (!z) { z = new Zombie(); s.zombies.push(z); }
      const e = az[i]; z.x = e.x; z.y = e.y; z.hp = e.hp; z.kind = e.kind; z.slowT = e.slowT; z.stunT = e.stunT; z.dotT = e.dotT;
    }

    const at = sim.towers.filter((t) => t.active);
    while (s.towers.length > at.length) s.towers.pop();
    for (let i = 0; i < at.length; i++) {
      let t = s.towers[i]; if (!t) { t = new TowerState(); s.towers.push(t); }
      const o = at[i]; t.x = o.x; t.y = o.y; t.type = o.kind; t.level = o.level; t.hp = o.hp; t.maxHp = o.maxHp;
    }

    const an = sim.nodes.filter((nd) => nd.active);
    while (s.nodes.length > an.length) s.nodes.pop();
    for (let i = 0; i < an.length; i++) {
      let nn = s.nodes[i]; if (!nn) { nn = new NodeState(); s.nodes.push(nn); }
      const o = an[i]; nn.x = o.x; nn.y = o.y; nn.kind = o.kind;
    }

    const ap = sim.projectiles.filter((p) => p.active);
    while (s.projectiles.length > ap.length) s.projectiles.pop();
    for (let i = 0; i < ap.length; i++) {
      let pp = s.projectiles[i]; if (!pp) { pp = new ProjState(); s.projectiles.push(pp); }
      const o = ap[i]; pp.x = o.x; pp.y = o.y; pp.team = o.team;
    }
  }
}
