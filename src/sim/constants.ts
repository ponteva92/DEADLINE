// Central tuning constants. Pure data - no Phaser, no DOM.

export const WORLD = { width: 1600, height: 1000 };
export const TICK = 1 / 60;

export const PLAYER = {
  speed: 305,
  accelTau: 0.04,
  radius: 18,
  maxHp: 100,
  invuln: 0.7,
  respawnTime: 3,
};

export const WEAPON = {
  cooldown: 0.12,
  autoAimRange: 560,
  aimLerp: 0.22,
  damage: 22,
};

export const PROJECTILE = {
  speed: 790,
  life: 0.95,
  radius: 5,
};
export const PROJECTILE_POOL = 320;

export const ENEMY = {
  radius: 16,
  baseSpeed: 52, // nerfed 40% from 86 for a manageable ramp
  baseHp: 55,
  damagePlayer: 12,
  damageTower: 14,
  damageCore: 9,
  attackCooldown: 0.7,
  knockbackHit: 175,
  separation: 0.55,
};
export const ENEMY_POOL = 260;
export const ENEMY_MAX_ALIVE = 170;

// Day/Night cycle.
export const PHASE = {
  dayLength: 420, // 7 minutes of daylight
  warnAt: [60, 30, 10, 5],
  dayTrickle: 3.4, // sec between daytime wandering zombies (sparser now)
  nightSpawnInterval: 0.62,
  // Horde size scales mathematically: baseCount * night^exp  (Night 1 = ~7, a tutorial).
  nightBaseCount: 7,
  nightExp: 1.2,
};

export const CORE = { radius: 30, maxHp: 1000 };

// Resource gathering.  index 0=wood, 1=metal, 2=tech, 3=stone
export const NODE = {
  radius: 24,
  pool: 48,
  perDay: 18,
  harvestTime: 0.85,
  chunk: 10,
  harvestReach: 96, // generous interaction radius (fixes the gather "bug")
  amount: [60, 40, 24, 55],
  minCoreDist: 150,
};

// Build grid + towers.
export const GRID = 48;
export const TOWER_POOL = 80;
export const TOWER_MAX_LEVEL = 4;

export type TowerRole = 'rail' | 'artillery' | 'cryo' | 'toxic' | 'tesla' | 'bastion';

export interface TowerDef {
  name: string;
  role: TowerRole;
  cost: { wood: number; metal: number; tech: number; stone: number };
  baseHp: number;
  range: number;
  cooldown: number;
  damage: number;
  radius: number;
  gun: boolean;     // emits a projectile/attack
  splash: number;   // artillery AoE radius
  slow: number;     // cryo slow fraction
  dotDps: number;   // toxic damage-per-second
  chain: number;    // tesla chain targets
}

// 0 Railgun · 1 Artillery · 2 Cryo · 3 Toxic · 4 Tesla · 5 Bastion
export const TOWERS: TowerDef[] = [
  { name: 'Railgun',   role: 'rail',      cost: { wood: 0,  metal: 40, tech: 30, stone: 0 },  baseHp: 90,  range: 4000, cooldown: 1.7, damage: 120, radius: 18, gun: true,  splash: 0,  slow: 0,    dotDps: 0, chain: 0 },
  { name: 'Artillery', role: 'artillery', cost: { wood: 0,  metal: 50, tech: 20, stone: 20 }, baseHp: 130, range: 380,  cooldown: 1.5, damage: 42,  radius: 20, gun: true,  splash: 95, slow: 0,    dotDps: 0, chain: 0 },
  { name: 'Cryo',      role: 'cryo',      cost: { wood: 20, metal: 10, tech: 20, stone: 0 },  baseHp: 130, range: 200,  cooldown: 0,   damage: 5,   radius: 18, gun: false, splash: 0,  slow: 0.5,  dotDps: 0, chain: 0 },
  { name: 'Toxic',     role: 'toxic',     cost: { wood: 10, metal: 20, tech: 25, stone: 0 },  baseHp: 120, range: 220,  cooldown: 0.5, damage: 4,   radius: 18, gun: true,  splash: 0,  slow: 0,    dotDps: 9, chain: 0 },
  { name: 'Tesla',     role: 'tesla',     cost: { wood: 0,  metal: 30, tech: 30, stone: 0 },  baseHp: 110, range: 260,  cooldown: 0.4, damage: 16,  radius: 18, gun: true,  splash: 0,  slow: 0,    dotDps: 0, chain: 2 },
  { name: 'Bastion',   role: 'bastion',   cost: { wood: 10, metal: 0,  tech: 0,  stone: 40 }, baseHp: 600, range: 0,    cooldown: 0,   damage: 0,   radius: 20, gun: false, splash: 0,  slow: 0,    dotDps: 0, chain: 0 },
];

export interface TowerLive {
  hp: number; range: number; cooldown: number; damage: number;
  slow: number; splash: number; dotDps: number; chain: number;
  pierce: number; reflect: number; stunChance: number; cluster: boolean; deepFreeze: boolean;
}

/** Level-scaled live stats (level 1..4) incl. Lvl-4 unique modifiers. */
export function towerStat(kind: number, level: number): TowerLive {
  const d = TOWERS[kind]; const s = level - 1; const L = level;
  return {
    hp: Math.round(d.baseHp * (1 + 0.6 * s)),
    range: d.role === 'rail' ? d.range : d.range * (1 + 0.1 * s),
    cooldown: d.cooldown * (1 - 0.1 * s),
    damage: d.damage * (1 + 0.5 * s),
    slow: d.slow ? Math.min(0.85, d.slow + 0.07 * s) : 0,
    splash: d.splash ? d.splash * (1 + 0.12 * s) : 0,
    dotDps: d.dotDps ? d.dotDps * (1 + 0.5 * s) : 0,
    chain: d.chain ? d.chain + (s >= 2 ? 1 : 0) : 0,
    pierce: d.role === 'rail' && L >= 4 ? 3 : 0,
    reflect: d.role === 'bastion' && L >= 4 ? 0.2 : 0,
    stunChance: d.role === 'tesla' && L >= 4 ? 0.1 : 0,
    cluster: d.role === 'artillery' && L >= 4,
    deepFreeze: d.role === 'cryo' && L >= 4,
  };
}

export function towerUpgradeCost(kind: number, level: number): { wood: number; metal: number; tech: number; stone: number } {
  const d = TOWERS[kind].cost; const m = 0.7 * level;
  return { wood: Math.round(d.wood * m), metal: Math.round(d.metal * m), tech: Math.round(d.tech * m), stone: Math.round(d.stone * m) };
}

export function towerBlockCost(kind: number, level: number): number {
  return (TOWERS[kind].gun ? 16 : 50) * level;
}

/** Repair cost scales with missing HP fraction (60% of build cost at 0 HP). */
export function towerRepairCost(kind: number, missingFrac: number): { wood: number; metal: number; tech: number; stone: number } {
  const d = TOWERS[kind].cost; const m = missingFrac * 0.6;
  return { wood: Math.ceil(d.wood * m), metal: Math.ceil(d.metal * m), tech: Math.ceil(d.tech * m), stone: Math.ceil(d.stone * m) };
}

/** Sell refunds 50% of everything invested (base build + all upgrades). */
export function towerSellRefund(kind: number, level: number): { wood: number; metal: number; tech: number; stone: number } {
  const base = TOWERS[kind].cost; let w = base.wood, m = base.metal, t = base.tech, s = base.stone;
  for (let l = 1; l < level; l++) { const c = towerUpgradeCost(kind, l); w += c.wood; m += c.metal; t += c.tech; s += c.stone; }
  return { wood: Math.floor(w * 0.5), metal: Math.floor(m * 0.5), tech: Math.floor(t * 0.5), stone: Math.floor(s * 0.5) };
}
