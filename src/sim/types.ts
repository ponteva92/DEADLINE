// Shared simulation types. InputCommands go in; state + effects come out.

export interface InputCommand {
  moveX: number;
  moveY: number;
  aimX: number;
  aimY: number;
  manualAim: boolean;
  shooting: boolean;
}

export interface PlayerState {
  id: string;
  x: number; y: number;
  vx: number; vy: number;
  aimX: number; aimY: number;
  hp: number; maxHp: number;
  cooldown: number; invuln: number;
  dead: boolean; respawn: number;
}

export interface Enemy {
  active: boolean;
  x: number; y: number;
  vx: number; vy: number;
  hp: number; maxHp: number;
  radius: number; speed: number;
  hitFlash: number; attackCd: number;
  slowT: number; slowAmt: number;
  stunT: number; dotT: number; dotDps: number;
  target: number; // 0 = player, 1 = core
  kind: number;
}

export interface Projectile {
  active: boolean;
  x: number; y: number;
  vx: number; vy: number;
  life: number;
  damage: number;
  team: number; // 0 = player, 1 = tower
}

export interface ResourceNode {
  active: boolean;
  x: number; y: number;
  kind: number; // 0 wood, 1 metal, 2 tech
  amount: number;
  progress: number;
}

export interface Tower {
  active: boolean;
  x: number; y: number;
  kind: number;
  level: number;
  hp: number; maxHp: number;
  cooldown: number;
}

export interface Core {
  x: number; y: number;
  radius: number;
  hp: number; maxHp: number;
}

export interface Resources {
  wood: number;
  metal: number;
  tech: number;
  stone: number;
}

export interface Obstacle { x: number; y: number; w: number; h: number; }

export type EffectType =
  | 'fire' | 'hit' | 'kill'
  | 'playerHit' | 'playerDeath'
  | 'spawn' | 'harvest' | 'build' | 'buildFail'
  | 'towerFire' | 'towerHit' | 'coreHit' | 'phase' | 'gameover' | 'upgrade' | 'cryo' | 'rail' | 'boom' | 'arc' | 'spray' | 'stun' | 'repair' | 'sell';

export interface SimEffect {
  type: EffectType;
  x: number; y: number;
  dx: number; dy: number;
  amount: number;
}

export const emptyInput = (): InputCommand => ({
  moveX: 0, moveY: 0, aimX: 0, aimY: -1, manualAim: false, shooting: false,
});
