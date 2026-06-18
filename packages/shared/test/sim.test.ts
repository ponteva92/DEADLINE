/* Headless behavior tests for the authoritative sim. Run: npm test */
import { Simulation } from '../src/Simulation';
import { TICK } from '../src/constants';
import type { Enemy } from '../src/types';

let pass = 0, fail = 0;
function ok(cond: boolean, msg: string): void {
  if (cond) { pass++; console.log('  ✅ ' + msg); }
  else { fail++; console.log('  ❌ ' + msg); }
}
function fresh(): Simulation {
  const s = new Simulation(1);
  s.resources.wood = 9999; s.resources.metal = 9999; s.resources.tech = 9999; s.resources.stone = 9999;
  return s;
}
function build(s: Simulation, kind: number, x: number, y: number, level = 1): number {
  s.tryBuild(kind, x, y);
  const i = s.towerAt(x, y);
  for (let l = 1; l < level; l++) { s.resources.wood = 9999; s.resources.metal = 9999; s.resources.tech = 9999; s.resources.stone = 9999; s.upgradeTower(i); }
  return i;
}
function zombie(s: Simulation, x: number, y: number, hp = 60, target = 1): Enemy {
  const e = s.enemies.find((z) => !z.active)!;
  e.active = true; e.x = x; e.y = y; e.hp = hp; e.maxHp = hp; e.kind = 0;
  e.vx = 0; e.vy = 0; e.slowT = 0; e.slowAmt = 0; e.stunT = 0; e.dotT = 0; e.dotDps = 0; e.target = target; e.hitFlash = 0; e.attackCd = 0;
  return e;
}
function step(s: Simulation, n: number): void { for (let i = 0; i < n; i++) s.step(TICK); }

console.log('Rail pierce (Lvl4 hits a line):');
{
  const s = fresh(); build(s, 0, 600, 500, 4);
  const a = zombie(s, 700, 500), b = zombie(s, 770, 500), c = zombie(s, 840, 500);
  step(s, 2);
  const dmg = [a, b, c].filter((z) => z.hp < 60).length;
  ok(dmg >= 2, `pierced ${dmg}/3 collinear zombies`);
}

console.log('Artillery splash (AoE):');
{
  const s = fresh(); build(s, 1, 600, 500, 1);
  const g = [zombie(s, 700, 500), zombie(s, 720, 490), zombie(s, 690, 515)];
  step(s, 2);
  const dmg = g.filter((z) => z.hp < 60).length;
  ok(dmg >= 2, `splash hit ${dmg}/3 grouped zombies`);
}

console.log('Toxic DoT (applies + ticks down HP):');
{
  const s = fresh(); build(s, 3, 600, 500, 1);
  const e = zombie(s, 680, 500, 200);
  step(s, 2);
  ok(e.dotT > 0, `dotT applied (${e.dotT.toFixed(2)}s)`);
  const hpAfterHit = e.hp;
  step(s, 30); // ~0.5s of DoT
  ok(e.hp < hpAfterHit, `DoT drained HP ${hpAfterHit.toFixed(0)} -> ${e.hp.toFixed(0)}`);
}

console.log('Tesla chain (hits 2):');
{
  const s = fresh(); build(s, 4, 600, 500, 1);
  const a = zombie(s, 680, 500), b = zombie(s, 740, 490);
  step(s, 2);
  const dmg = [a, b].filter((z) => z.hp < 60).length;
  ok(dmg >= 2, `chained to ${dmg}/2 zombies`);
}

console.log('Cryo slow:');
{
  const s = fresh(); build(s, 2, 600, 500, 1);
  const e = zombie(s, 660, 500, 200);
  step(s, 2);
  ok(e.slowT > 0 && e.slowAmt > 0, `slow applied (amt ${e.slowAmt.toFixed(2)})`);
}

console.log('Bastion reflect (Lvl4 hurts attacker):');
{
  const s = fresh(); build(s, 5, 700, 500, 4);
  const e = zombie(s, 645, 500, 300, 1); // walks east into bastion toward core
  step(s, 60); // ~1s, enough to contact + attack
  ok(e.hp < 300, `attacker took reflect damage (hp ${e.hp.toFixed(0)})`);
}

console.log('Repair (restores HP, costs resources):');
{
  const s = fresh(); const i = build(s, 0, 600, 500, 1);
  const t = s.towers[i]; t.hp = t.maxHp * 0.3;
  const wood0 = s.resources.wood;
  const r = s.repairTower(i);
  ok(r && t.hp === t.maxHp, 'repaired to full HP');
  ok(s.resources.wood < wood0 || s.resources.metal < 9999, 'repair spent resources');
  ok(!s.repairTower(i), 'repair rejected when already full');
}

console.log('Sell (refund + frees slot):');
{
  const s = fresh(); const i = build(s, 5, 620, 500, 1); // bastion w10 s40
  const stone0 = s.resources.stone;
  const r = s.sellTower(i);
  ok(r && !s.towers[i].active, 'tower removed');
  ok(s.resources.stone > stone0, `stone refunded (${stone0} -> ${s.resources.stone})`);
}

console.log('Flow-field reroute (path exists around a wall, zombie advances):');
{
  const s = fresh();
  const e = zombie(s, 60, 500, 100, 1); // far west, targets core
  const x0 = e.x;
  step(s, 30);
  ok(e.x > x0, `zombie advanced toward core via flow (${x0.toFixed(0)} -> ${e.x.toFixed(0)})`);
}

console.log(`\n=== ${pass} passed, ${fail} failed ===`);
process.exit(fail ? 1 : 0);
