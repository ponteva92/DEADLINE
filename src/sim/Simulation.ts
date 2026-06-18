import {
  WORLD, PLAYER, WEAPON, PROJECTILE, PROJECTILE_POOL,
  ENEMY, ENEMY_POOL, ENEMY_MAX_ALIVE, PHASE, CORE, NODE,
  GRID, TOWER_POOL, TOWERS, TOWER_MAX_LEVEL, towerStat, towerUpgradeCost, towerBlockCost, towerRepairCost, towerSellRefund,
} from './constants';
import { FlowField } from './flow';
import type {
  InputCommand, PlayerState, Projectile, Enemy, Obstacle,
  SimEffect, ResourceNode, Tower, Core, Resources,
} from './types';
import { emptyInput } from './types';
import { resolveCircleAabb, clamp, makeRng } from './collision';

export type Phase = 'day' | 'night';

/**
 * Authoritative game simulation. PURE TypeScript - no Phaser, no DOM.
 * Now models the full loop: gather (day) -> build -> survive (night) -> defend the Core.
 * Reports gameplay EVENTS via an effects queue the renderer drains for juice.
 */
export class Simulation {
  readonly players = new Map<string, PlayerState>();
  readonly projectiles: Projectile[] = [];
  readonly enemies: Enemy[] = [];
  readonly towers: Tower[] = [];
  readonly nodes: ResourceNode[] = [];
  readonly obstacles: Obstacle[] = [];
  readonly resources: Resources = { wood: 120, metal: 60, tech: 20, stone: 80 };
  readonly core: Core;

  phase: Phase = 'day';
  day = 1;
  dayTimer = PHASE.dayLength;
  gameOver = false;

  private nightBudget = 0;
  private spawnTimer = 0;
  private trickleTimer = 0;
  private readonly inputs = new Map<string, InputCommand>();
  private effects: SimEffect[] = [];
  private rng: () => number;
  private flow = new FlowField();
  private flowDirty = true;

  constructor(seed = 1337) {
    this.rng = makeRng(seed);
    this.core = { x: WORLD.width / 2, y: WORLD.height / 2, radius: CORE.radius, hp: CORE.maxHp, maxHp: CORE.maxHp };
    for (let i = 0; i < PROJECTILE_POOL; i++) {
      this.projectiles.push({ active: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, damage: 0, team: 0 });
    }
    for (let i = 0; i < ENEMY_POOL; i++) {
      this.enemies.push({
        active: false, x: 0, y: 0, vx: 0, vy: 0, hp: 0, maxHp: 0,
        radius: ENEMY.radius, speed: ENEMY.baseSpeed, hitFlash: 0, attackCd: 0, slowT: 0, slowAmt: 0, stunT: 0, dotT: 0, dotDps: 0, target: 0, kind: 0,
      });
    }
    for (let i = 0; i < TOWER_POOL; i++) {
      this.towers.push({ active: false, x: 0, y: 0, kind: 0, level: 0, hp: 0, maxHp: 0, cooldown: 0 });
    }
    for (let i = 0; i < NODE.pool; i++) {
      this.nodes.push({ active: false, x: 0, y: 0, kind: 0, amount: 0, progress: 0 });
    }
    this.buildArena();
    this.scatterNodes();
    this.flow.setStatic(this.obstacles, this.core);
  }

  private buildArena(): void {
    const c = this.core;
    const crates = [[320, 260], [1180, 300], [400, 760], [1230, 740], [780, 180], [820, 820]];
    for (const cr of crates) this.obstacles.push({ x: cr[0], y: cr[1], w: 56, h: 56 });
    void c;
  }

  private scatterNodes(): void {
    let placed = 0;
    let guard = 0;
    for (const n of this.nodes) n.active = false;
    while (placed < Math.min(NODE.perDay, this.nodes.length) && guard < 400) {
      guard++;
      const n = this.nodes[placed];
      const x = NODE.radius + this.rng() * (WORLD.width - 2 * NODE.radius);
      const y = NODE.radius + this.rng() * (WORLD.height - 2 * NODE.radius);
      if (Math.hypot(x - this.core.x, y - this.core.y) < NODE.minCoreDist) continue;
      // Tech (rarer) biased to the edges; wood common near center.
      const edge = Math.min(x, WORLD.width - x, y, WORLD.height - y) < 220;
      const r = this.rng();
      const kind = edge
        ? (r < 0.28 ? 2 : r < 0.52 ? 1 : r < 0.78 ? 3 : 0)
        : (r < 0.42 ? 0 : r < 0.7 ? 3 : r < 0.9 ? 1 : 2);
      n.active = true;
      n.x = x; n.y = y; n.kind = kind;
      n.amount = NODE.amount[kind];
      n.progress = 0;
      placed++;
    }
  }

  addPlayer(id: string, x: number, y: number): PlayerState {
    const p: PlayerState = {
      id, x, y, vx: 0, vy: 0, aimX: 0, aimY: -1,
      hp: PLAYER.maxHp, maxHp: PLAYER.maxHp, cooldown: 0, invuln: 0, dead: false, respawn: 0,
    };
    this.players.set(id, p);
    this.inputs.set(id, emptyInput());
    return p;
  }

  setInput(id: string, cmd: InputCommand): void { this.inputs.set(id, cmd); }

  removePlayer(id: string): void { this.players.delete(id); this.inputs.delete(id); }

  /** Day-only: jump straight to the horde (Start Night button). */
  skipToNight(): void { if (this.phase === 'day' && !this.gameOver) this.startNight(); }

  consumeEffects(): SimEffect[] {
    if (this.effects.length === 0) return EMPTY;
    const out = this.effects; this.effects = []; return out;
  }
  private emit(type: SimEffect['type'], x: number, y: number, dx = 0, dy = 0, amount = 0): void {
    this.effects.push({ type, x, y, dx, dy, amount });
  }

  /** Attempt to place a tower (called by the renderer; future-network: becomes a command). */
  tryBuild(kind: number, wx: number, wy: number): boolean {
    if (this.phase !== 'day' || this.gameOver) { this.emit('buildFail', wx, wy); return false; }
    const def = TOWERS[kind];
    if (!def) return false;
    const x = Math.floor(wx / GRID) * GRID + GRID / 2;
    const y = Math.floor(wy / GRID) * GRID + GRID / 2;
    if (this.resources.wood < def.cost.wood || this.resources.metal < def.cost.metal || this.resources.tech < def.cost.tech || this.resources.stone < def.cost.stone) {
      this.emit('buildFail', x, y); return false;
    }
    if (Math.hypot(x - this.core.x, y - this.core.y) < this.core.radius + def.radius + 6) { this.emit('buildFail', x, y); return false; }
    for (const t of this.towers) {
      if (t.active && Math.hypot(t.x - x, t.y - y) < def.radius * 1.6) { this.emit('buildFail', x, y); return false; }
    }
    for (const o of this.obstacles) {
      if (x > o.x - def.radius && x < o.x + o.w + def.radius && y > o.y - def.radius && y < o.y + o.h + def.radius) {
        this.emit('buildFail', x, y); return false;
      }
    }
    const slot = this.towers.find((t) => !t.active);
    if (!slot) return false;
    this.resources.wood -= def.cost.wood;
    this.resources.metal -= def.cost.metal;
    this.resources.tech -= def.cost.tech;
    this.resources.stone -= def.cost.stone;
    const st = towerStat(kind, 1);
    slot.active = true; slot.x = x; slot.y = y; slot.kind = kind; slot.level = 1; slot.hp = st.hp; slot.maxHp = st.hp; slot.cooldown = 0;
    this.flowDirty = true;
    this.emit('build', x, y);
    return true;
  }

  /** Index of the active tower under a world point, or -1. */
  towerAt(wx: number, wy: number): number {
    for (let i = 0; i < this.towers.length; i++) {
      const t = this.towers[i];
      if (t.active && Math.hypot(t.x - wx, t.y - wy) < TOWERS[t.kind].radius + 10) return i;
    }
    return -1;
  }

  /** Upgrade an existing tower (spends the shared pool). */
  upgradeTower(index: number): boolean {
    const t = this.towers[index];
    if (!t || !t.active || t.level >= TOWER_MAX_LEVEL) return false;
    const c = towerUpgradeCost(t.kind, t.level);
    const r = this.resources;
    if (r.wood < c.wood || r.metal < c.metal || r.tech < c.tech || r.stone < c.stone) return false;
    r.wood -= c.wood; r.metal -= c.metal; r.tech -= c.tech; r.stone -= c.stone;
    t.level += 1;
    const ratio = Math.max(0.5, t.hp / t.maxHp);
    const st = towerStat(t.kind, t.level);
    t.maxHp = st.hp; t.hp = Math.min(st.hp, st.hp * ratio);
    this.flowDirty = true;
    this.emit('upgrade', t.x, t.y, 0, 0, t.level);
    return true;
  }

  /** Restore a damaged tower to full HP for resources. */
  repairTower(index: number): boolean {
    const t = this.towers[index];
    if (!t || !t.active || t.hp >= t.maxHp) return false;
    const c = towerRepairCost(t.kind, 1 - t.hp / t.maxHp);
    const r = this.resources;
    if (r.wood < c.wood || r.metal < c.metal || r.tech < c.tech || r.stone < c.stone) return false;
    r.wood -= c.wood; r.metal -= c.metal; r.tech -= c.tech; r.stone -= c.stone;
    t.hp = t.maxHp;
    this.emit('repair', t.x, t.y);
    return true;
  }

  /** Destroy a tower, refund 50% of all invested resources, update the flow-field. */
  sellTower(index: number): boolean {
    const t = this.towers[index];
    if (!t || !t.active) return false;
    const ref = towerSellRefund(t.kind, t.level);
    this.resources.wood += ref.wood; this.resources.metal += ref.metal; this.resources.tech += ref.tech; this.resources.stone += ref.stone;
    const x = t.x, y = t.y;
    t.active = false;
    this.flowDirty = true;
    this.emit('sell', x, y);
    return true;
  }

  step(dt: number): void {
    if (this.gameOver) return;
    this.updatePhase(dt);
    this.updatePlayers(dt);
    this.updateEnemies(dt);
    this.updateTowers(dt);
    this.updateProjectiles(dt);
  }

  // ---- Phase machine ----------------------------------------------------
  private updatePhase(dt: number): void {
    if (this.phase === 'day') {
      this.dayTimer -= dt;
      this.trickleTimer -= dt;
      if (this.trickleTimer <= 0 && this.aliveEnemies() < 30) {
        this.trickleTimer = PHASE.dayTrickle;
        this.spawnEnemy(0);
      }
      if (this.dayTimer <= 0) this.startNight();
    } else {
      this.spawnTimer -= dt;
      if (this.nightBudget > 0 && this.spawnTimer <= 0 && this.aliveEnemies() < ENEMY_MAX_ALIVE) {
        this.spawnTimer = PHASE.nightSpawnInterval * (0.5 + this.rng() * 0.8);
        const n = 1 + Math.floor(this.rng() * 3);
        for (let i = 0; i < n && this.nightBudget > 0; i++) { this.spawnEnemy(1); this.nightBudget -= 1; }
      }
      if (this.nightBudget <= 0 && this.aliveEnemies() === 0) this.startDay();
    }
  }

  private startNight(): void {
    this.phase = 'night';
    this.nightBudget = Math.round(PHASE.nightBaseCount * Math.pow(this.day, PHASE.nightExp));
    this.spawnTimer = 0;
    this.flowDirty = true;
    this.emit('phase', 0, 0, 0, 0, 1);
  }

  private startDay(): void {
    this.phase = 'day';
    this.day += 1;
    this.dayTimer = PHASE.dayLength;
    this.scatterNodes();
    this.emit('phase', 0, 0, 0, 0, 0);
  }

  private spawnEnemy(target: number): void {
    const e = this.enemies.find((z) => !z.active);
    if (!e) return;
    const m = 60;
    const side = Math.floor(this.rng() * 4);
    if (side === 0) { e.x = m + this.rng() * (WORLD.width - 2 * m); e.y = m; }
    else if (side === 1) { e.x = WORLD.width - m; e.y = m + this.rng() * (WORLD.height - 2 * m); }
    else if (side === 2) { e.x = m + this.rng() * (WORLD.width - 2 * m); e.y = WORLD.height - m; }
    else { e.x = m; e.y = m + this.rng() * (WORLD.height - 2 * m); }
    const hpMul = 1 + (this.day - 1) * 0.14;
    const spMul = 1 + (this.day - 1) * 0.045;
    e.active = true;
    e.maxHp = Math.round(ENEMY.baseHp * hpMul);
    e.hp = e.maxHp;
    e.speed = ENEMY.baseSpeed * spMul + this.rng() * 16;
    e.vx = 0; e.vy = 0; e.hitFlash = 0; e.attackCd = 0; e.slowT = 0; e.slowAmt = 0; e.stunT = 0; e.dotT = 0; e.dotDps = 0; e.target = target; e.kind = 0;
    this.emit('spawn', e.x, e.y);
  }

  private aliveEnemies(): number {
    let n = 0;
    for (const e of this.enemies) if (e.active) n++;
    return n;
  }

  // ---- Players ----------------------------------------------------------
  private updatePlayers(dt: number): void {
    const accel = 1 - Math.exp(-dt / PLAYER.accelTau);
    for (const p of this.players.values()) {
      const cmd = this.inputs.get(p.id) ?? emptyInput();
      if (p.dead) {
        p.respawn -= dt;
        if (p.respawn <= 0) {
          p.dead = false; p.hp = p.maxHp;
          p.x = this.core.x; p.y = this.core.y + 170; p.invuln = 1.2;
        }
        continue;
      }

      let mx = cmd.moveX, my = cmd.moveY;
      const len = Math.hypot(mx, my);
      if (len > 1) { mx /= len; my /= len; }
      p.vx += (mx * PLAYER.speed - p.vx) * accel;
      p.vy += (my * PLAYER.speed - p.vy) * accel;
      p.x += p.vx * dt; p.y += p.vy * dt;
      this.collideObstacles(p, PLAYER.radius);
      this.collideTowers(p, PLAYER.radius);
      this.collideCircle(p, PLAYER.radius, this.core.x, this.core.y, this.core.radius);
      p.x = clamp(p.x, PLAYER.radius, WORLD.width - PLAYER.radius);
      p.y = clamp(p.y, PLAYER.radius, WORLD.height - PLAYER.radius);

      // Aim: manual override, else smooth auto-aim onto closest enemy.
      if (cmd.manualAim && (cmd.aimX !== 0 || cmd.aimY !== 0)) {
        const al = Math.hypot(cmd.aimX, cmd.aimY) || 1;
        p.aimX = cmd.aimX / al; p.aimY = cmd.aimY / al;
      } else {
        const t = this.nearestEnemy(p.x, p.y, WEAPON.autoAimRange);
        if (t) {
          const ax = t.x - p.x, ay = t.y - p.y;
          const al = Math.hypot(ax, ay) || 1;
          p.aimX += (ax / al - p.aimX) * WEAPON.aimLerp;
          p.aimY += (ay / al - p.aimY) * WEAPON.aimLerp;
          const nl = Math.hypot(p.aimX, p.aimY) || 1;
          p.aimX /= nl; p.aimY /= nl;
        }
      }

      // Harvest any node we're standing on.
      for (const nd of this.nodes) {
        if (!nd.active) continue;
        if (Math.hypot(nd.x - p.x, nd.y - p.y) < NODE.harvestReach) {
          nd.progress += dt;
          if (nd.progress >= NODE.harvestTime) {
            nd.progress = 0;
            const got = Math.min(NODE.chunk, nd.amount);
            nd.amount -= got;
            if (nd.kind === 0) this.resources.wood += got;
            else if (nd.kind === 1) this.resources.metal += got;
            else if (nd.kind === 2) this.resources.tech += got;
            else this.resources.stone += got;
            this.emit('harvest', nd.x, nd.y, 0, 0, nd.kind);
            if (nd.amount <= 0) nd.active = false;
          }
          break;
        }
      }

      if (p.invuln > 0) p.invuln -= dt;
      p.cooldown -= dt;
      if (cmd.shooting && p.cooldown <= 0) {
        this.fire(p.x + p.aimX * (PLAYER.radius + 6), p.y + p.aimY * (PLAYER.radius + 6), p.aimX, p.aimY, WEAPON.damage, 0, true);
        p.cooldown = WEAPON.cooldown;
      }
    }
  }

  // ---- Enemies ----------------------------------------------------------
  private updateEnemies(dt: number): void {
    if (this.flowDirty) { this.flow.rebuild(this.towers, (t) => towerBlockCost(t.kind, t.level)); this.flowDirty = false; }
    const list = this.enemies;
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      if (!a.active) continue;
      for (let j = i + 1; j < list.length; j++) {
        const b = list[j];
        if (!b.active) continue;
        const dx = b.x - a.x, dy = b.y - a.y;
        const minD = a.radius + b.radius;
        const d2 = dx * dx + dy * dy;
        if (d2 > 0 && d2 < minD * minD) {
          const d = Math.sqrt(d2);
          const push = ((minD - d) / d) * 0.5 * ENEMY.separation;
          a.x -= dx * push; a.y -= dy * push;
          b.x += dx * push; b.y += dy * push;
        }
      }
    }

    for (const e of list) {
      if (!e.active) continue;
      if (e.hitFlash > 0) e.hitFlash -= dt;
      if (e.attackCd > 0) e.attackCd -= dt;

      if (e.slowT > 0) e.slowT -= dt; else e.slowAmt = 0;
      if (e.stunT > 0) e.stunT -= dt;
      if (e.dotT > 0) { e.dotT -= dt; e.hp -= e.dotDps * dt; if (e.hp <= 0) { this.killEnemy(e, true); continue; } }
      const spd = e.stunT > 0 ? 0 : e.speed * (e.slowT > 0 ? 1 - e.slowAmt : 1);
      let dirx: number; let diry: number;
      if (e.target === 1) {
        const f = this.flow.sample(e.x, e.y);
        if (f.x !== 0 || f.y !== 0) { dirx = f.x; diry = f.y; }
        else { const dx = this.core.x - e.x, dy = this.core.y - e.y; const d = Math.hypot(dx, dy) || 1; dirx = dx / d; diry = dy / d; }
      } else {
        const p = this.nearestPlayer(e.x, e.y);
        const tx = p ? p.x : this.core.x, ty = p ? p.y : this.core.y;
        const dx = tx - e.x, dy = ty - e.y; const d = Math.hypot(dx, dy) || 1; dirx = dx / d; diry = dy / d;
      }
      e.vx = dirx * spd; e.vy = diry * spd;
      e.x += e.vx * dt; e.y += e.vy * dt;

      this.collideObstacles(e, e.radius);

      // Attack towers it presses against.
      for (const t of this.towers) {
        if (!t.active) continue;
        const td = TOWERS[t.kind].radius + e.radius;
        const ddx = e.x - t.x, ddy = e.y - t.y;
        const dd2 = ddx * ddx + ddy * ddy;
        if (dd2 < td * td) {
          const dist = Math.sqrt(dd2) || 0.001;
          const ov = td - dist;
          e.x += (ddx / dist) * ov; e.y += (ddy / dist) * ov;
          if (e.attackCd <= 0) {
            t.hp -= ENEMY.damageTower; e.attackCd = ENEMY.attackCooldown;
            this.emit('towerHit', t.x, t.y);
            if (t.level >= 4 && TOWERS[t.kind].role === 'bastion') { e.hp -= ENEMY.damageTower * 0.2; if (e.hp <= 0) this.killEnemy(e, e.dotT > 0); }
            if (t.hp <= 0) { t.active = false; this.flowDirty = true; }
          }
        }
      }

      // Core contact.
      const cdx = e.x - this.core.x, cdy = e.y - this.core.y;
      const cmin = this.core.radius + e.radius;
      if (cdx * cdx + cdy * cdy < cmin * cmin) {
        const dist = Math.hypot(cdx, cdy) || 0.001;
        const ov = cmin - dist;
        e.x += (cdx / dist) * ov; e.y += (cdy / dist) * ov;
        if (e.attackCd <= 0) {
          this.damageCore(ENEMY.damageCore);
          e.attackCd = ENEMY.attackCooldown;
        }
      }

      // Player contact.
      if (e.attackCd <= 0) {
        const p = this.nearestPlayer(e.x, e.y);
        if (p && !p.dead && p.invuln <= 0) {
          const pd = Math.hypot(p.x - e.x, p.y - e.y);
          if (pd < e.radius + PLAYER.radius) {
            this.damagePlayer(p, ENEMY.damagePlayer, (p.x - e.x) / (pd || 1), (p.y - e.y) / (pd || 1));
            e.attackCd = ENEMY.attackCooldown;
          }
        }
      }

      e.x = clamp(e.x, e.radius, WORLD.width - e.radius);
      e.y = clamp(e.y, e.radius, WORLD.height - e.radius);
    }
  }

  // ---- Towers (6 classes + Lvl-4 uniques) -------------------------------
  private updateTowers(dt: number): void {
    for (const t of this.towers) {
      if (!t.active) continue;
      const def = TOWERS[t.kind];
      const st = towerStat(t.kind, t.level);

      if (def.role === 'bastion') continue;

      if (def.role === 'cryo') {
        const r2 = st.range * st.range;
        for (const e of this.enemies) {
          if (!e.active) continue;
          if ((e.x - t.x) ** 2 + (e.y - t.y) ** 2 <= r2) {
            e.slowT = 0.5; e.slowAmt = Math.max(e.slowAmt, st.slow);
            if (st.deepFreeze) e.stunT = Math.max(e.stunT, 0.6); // Lvl4: root in aura
            e.hp -= st.damage * dt;
            if (e.hp <= 0) this.killEnemy(e, e.dotT > 0);
          }
        }
        t.cooldown -= dt;
        if (t.cooldown <= 0) { this.emit('cryo', t.x, t.y, 0, 0, st.range); t.cooldown = 0.5; }
        continue;
      }

      if (!def.gun) continue;
      t.cooldown -= dt;
      if (t.cooldown > 0) continue;
      const target = this.nearestEnemy(t.x, t.y, st.range);
      if (!target) continue;
      t.cooldown = st.cooldown;
      const dx = target.x - t.x, dy = target.y - t.y;
      const l = Math.hypot(dx, dy) || 1; const ux = dx / l, uy = dy / l;

      if (def.role === 'rail') {
        this.emit('rail', t.x, t.y, ux, uy, l);
        const maxP = 1 + st.pierce; let pierced = 0;
        const hits = this.enemies
          .filter((e) => e.active && this.nearLine(t.x, t.y, ux, uy, e.x, e.y, e.radius + 9))
          .sort((a, b) => ((a.x - t.x) ** 2 + (a.y - t.y) ** 2) - ((b.x - t.x) ** 2 + (b.y - t.y) ** 2));
        for (const e of hits) {
          if (pierced >= maxP) break;
          e.hp -= st.damage; e.hitFlash = 0.12; this.emit('hit', e.x, e.y, ux, uy, st.damage);
          if (e.hp <= 0) this.killEnemy(e, e.dotT > 0);
          pierced++;
        }
      } else if (def.role === 'artillery') {
        this.explode(target.x, target.y, st.splash, st.damage);
        if (st.cluster) {
          for (let k = 0; k < 3; k++) {
            const a = (this.rng() * Math.PI * 2);
            this.explode(target.x + Math.cos(a) * st.splash, target.y + Math.sin(a) * st.splash, st.splash * 0.6, st.damage * 0.5);
          }
        }
      } else if (def.role === 'toxic') {
        for (const e of this.enemies) {
          if (!e.active) continue;
          const ex = e.x - t.x, ey = e.y - t.y; const ed = Math.hypot(ex, ey);
          if (ed > st.range) continue;
          if ((ex * ux + ey * uy) / (ed || 1) < 0.55) continue; // ~57deg cone
          e.hp -= st.damage; e.dotT = 3; e.dotDps = Math.max(e.dotDps, st.dotDps);
          if (e.hp <= 0) this.killEnemy(e, true);
        }
        this.emit('spray', t.x, t.y, ux, uy, st.range);
      } else if (def.role === 'tesla') {
        const chained = new Set<Enemy>([target]); let prev = target;
        target.hp -= st.damage; target.hitFlash = 0.12;
        if (st.stunChance > 0 && this.rng() < st.stunChance) { target.stunT = Math.max(target.stunT, 0.5); this.emit('stun', target.x, target.y); }
        this.emit('arc', t.x, t.y, target.x - t.x, target.y - t.y);
        if (target.hp <= 0) this.killEnemy(target, target.dotT > 0);
        for (let c = 0; c < st.chain; c++) {
          const next = this.nearestEnemyExcept(prev.x, prev.y, 190, chained);
          if (!next) break;
          next.hp -= st.damage * 0.7; next.hitFlash = 0.12; chained.add(next);
          this.emit('arc', prev.x, prev.y, next.x - prev.x, next.y - prev.y);
          if (next.hp <= 0) this.killEnemy(next, next.dotT > 0);
          prev = next;
        }
      }
    }
  }

  private nearLine(x0: number, y0: number, ux: number, uy: number, px: number, py: number, tol: number): boolean {
    const rx = px - x0, ry = py - y0; const proj = rx * ux + ry * uy;
    if (proj < 0) return false;
    return Math.abs(rx * uy - ry * ux) <= tol;
  }

  private explode(x: number, y: number, radius: number, damage: number): void {
    this.emit('boom', x, y, 0, 0, radius);
    const r2 = radius * radius;
    for (const e of this.enemies) {
      if (!e.active) continue;
      if ((e.x - x) ** 2 + (e.y - y) ** 2 <= r2) { e.hp -= damage; e.hitFlash = 0.12; if (e.hp <= 0) this.killEnemy(e, e.dotT > 0); }
    }
  }

  private nearestEnemyExcept(x: number, y: number, range: number, exclude: Set<Enemy>): Enemy | null {
    let best: Enemy | null = null; let bd2 = range * range;
    for (const e of this.enemies) {
      if (!e.active || exclude.has(e)) continue;
      const d2 = (e.x - x) ** 2 + (e.y - y) ** 2;
      if (d2 < bd2) { bd2 = d2; best = e; }
    }
    return best;
  }

  private hasToxicBloom(): boolean {
    for (const t of this.towers) if (t.active && TOWERS[t.kind].role === 'toxic' && t.level >= 4) return true;
    return false;
  }

  private killEnemy(e: Enemy, fromDot: boolean): void {
    e.active = false;
    this.emit('kill', e.x, e.y, 0, 0);
    if (fromDot && this.hasToxicBloom()) {
      this.emit('spray', e.x, e.y, 0, 0, 60);
      for (const o of this.enemies) {
        if (!o.active || o === e) continue;
        if ((o.x - e.x) ** 2 + (o.y - e.y) ** 2 < 70 * 70) { o.dotT = Math.max(o.dotT, 2); o.dotDps = Math.max(o.dotDps, 8); }
      }
    }
  }

  private fire(x: number, y: number, dx: number, dy: number, damage: number, team: number, playerShot: boolean): void {
    const pr = this.projectiles.find((p) => !p.active);
    if (!pr) return;
    pr.active = true; pr.x = x; pr.y = y;
    pr.vx = dx * PROJECTILE.speed; pr.vy = dy * PROJECTILE.speed;
    pr.life = PROJECTILE.life; pr.damage = damage; pr.team = team;
    this.emit(playerShot ? 'fire' : 'towerFire', x, y, dx, dy);
  }

  private updateProjectiles(dt: number): void {
    for (const pr of this.projectiles) {
      if (!pr.active) continue;
      pr.x += pr.vx * dt; pr.y += pr.vy * dt; pr.life -= dt;
      let hit = false;
      for (const e of this.enemies) {
        if (!e.active) continue;
        const rr = e.radius + PROJECTILE.radius;
        const dx = e.x - pr.x, dy = e.y - pr.y;
        if (dx * dx + dy * dy <= rr * rr) {
          const d = Math.hypot(pr.vx, pr.vy) || 1;
          const kx = pr.vx / d, ky = pr.vy / d;
          e.hp -= pr.damage; e.hitFlash = 0.12;
          e.x += kx * ENEMY.knockbackHit * dt; e.y += ky * ENEMY.knockbackHit * dt;
          this.emit('hit', pr.x, pr.y, kx, ky, pr.damage);
          if (e.hp <= 0) this.killEnemy(e, e.dotT > 0);
          hit = true; break;
        }
      }
      if (!hit) {
        for (const o of this.obstacles) {
          if (pr.x >= o.x && pr.x <= o.x + o.w && pr.y >= o.y && pr.y <= o.y + o.h) {
            this.emit('hit', pr.x, pr.y, 0, 0, 0); hit = true; break;
          }
        }
      }
      if (hit || pr.life <= 0 || pr.x < 0 || pr.x > WORLD.width || pr.y < 0 || pr.y > WORLD.height) pr.active = false;
    }
  }

  // ---- Damage -----------------------------------------------------------
  private damagePlayer(p: PlayerState, dmg: number, nx: number, ny: number): void {
    p.hp -= dmg; p.invuln = PLAYER.invuln; p.vx += nx * 90; p.vy += ny * 90;
    if (p.hp <= 0) { p.hp = 0; p.dead = true; p.respawn = PLAYER.respawnTime; this.emit('playerDeath', p.x, p.y); }
    else this.emit('playerHit', p.x, p.y, nx, ny, dmg);
  }

  private damageCore(dmg: number): void {
    this.core.hp -= dmg;
    this.emit('coreHit', this.core.x, this.core.y, 0, 0, dmg);
    if (this.core.hp <= 0) { this.core.hp = 0; this.gameOver = true; this.emit('gameover', this.core.x, this.core.y); }
  }

  // ---- Shared -----------------------------------------------------------
  private nearestEnemy(x: number, y: number, range: number): Enemy | null {
    let best: Enemy | null = null; let bd2 = range * range;
    for (const e of this.enemies) {
      if (!e.active) continue;
      const dx = e.x - x, dy = e.y - y, d2 = dx * dx + dy * dy;
      if (d2 < bd2) { bd2 = d2; best = e; }
    }
    return best;
  }
  private nearestPlayer(x: number, y: number): PlayerState | null {
    let best: PlayerState | null = null; let bd2 = Infinity;
    for (const p of this.players.values()) {
      if (p.dead) continue;
      const dx = p.x - x, dy = p.y - y, d2 = dx * dx + dy * dy;
      if (d2 < bd2) { bd2 = d2; best = p; }
    }
    return best;
  }
  private collideObstacles(body: { x: number; y: number }, r: number): void {
    for (const o of this.obstacles) {
      const res = resolveCircleAabb(body.x, body.y, r, o);
      body.x = res.x; body.y = res.y;
    }
  }
  private collideTowers(body: { x: number; y: number }, r: number): void {
    for (const t of this.towers) {
      if (!t.active) continue;
      this.collideCircle(body, r, t.x, t.y, TOWERS[t.kind].radius);
    }
  }
  private collideCircle(body: { x: number; y: number }, r: number, cx: number, cy: number, cr: number): void {
    const dx = body.x - cx, dy = body.y - cy;
    const min = r + cr;
    const d2 = dx * dx + dy * dy;
    if (d2 > 0 && d2 < min * min) {
      const d = Math.sqrt(d2);
      const ov = min - d;
      body.x += (dx / d) * ov; body.y += (dy / d) * ov;
    }
  }
}

const EMPTY: SimEffect[] = [];
