import Phaser from 'phaser';

/**
 * Programmatic vector character spritesheets (idle/walk) for two BESPOKE,
 * visually-distinct survivors plus the zombie, in a dark post-apoc palette.
 * Drawn top-down facing +X. Registers looping Phaser animations.
 *  - Heikki: heavy-duty tech survivor (bulky, teal/steel, antenna).
 *  - Shane:  nimble scout-medic (slim, orange, red-cross).
 */
interface CharOpt {
  body: number; dark: number; limb: number; head: number; accent: number;
  bulk: number; emblem: 'antenna' | 'cross';
}
const HEIKKI: CharOpt = { body: 0x2f8f8f, dark: 0x123a3a, limb: 0x1f6a6a, head: 0xc9a36b, accent: 0x6ff0ff, bulk: 1.18, emblem: 'antenna' };
const SHANE: CharOpt = { body: 0xe07b3a, dark: 0x4a2410, limb: 0xb85e26, head: 0xd9a86b, accent: 0xffd24a, bulk: 0.84, emblem: 'cross' };
const ZOMBIE = { body: 0x5d7a39, dark: 0x1c2912, limb: 0x44602a, head: 0x86a052, accent: 0x9bff5a };

function drawChar(g: Phaser.GameObjects.Graphics, o: CharOpt, legPhase: number): void {
  g.clear();
  const cx = 32, cy = 32, b = o.bulk, lp = legPhase * 5;
  g.fillStyle(o.dark, 1);
  g.fillEllipse(cx - 6 + lp, cy + 11 * b, 10 * b, 8 * b);
  g.fillEllipse(cx - 6 - lp, cy - 11 * b, 10 * b, 8 * b);
  g.fillStyle(o.dark, 1); g.fillEllipse(cx, cy, 36 * b, 32 * b);
  g.fillStyle(o.body, 1); g.fillEllipse(cx, cy, 30 * b, 26 * b);
  g.fillStyle(o.dark, 1); g.fillCircle(cx - 11 * b, cy, 6 * b);
  g.fillStyle(o.limb, 1);
  g.fillRoundedRect(cx + 4, cy - 12 * b, 16, 6, 3);
  g.fillRoundedRect(cx + 4, cy + 6 * b, 16, 6, 3);
  g.fillStyle(o.dark, 1); g.fillRoundedRect(cx + 18, cy - 4, 20, 8, 2);
  g.fillStyle(o.accent, 1); g.fillRect(cx + 36, cy - 2, 4, 4);
  g.fillStyle(o.dark, 1); g.fillCircle(cx + 15, cy, 9 * b);
  g.fillStyle(o.head, 1); g.fillCircle(cx + 15, cy, 7 * b);
  if (o.emblem === 'antenna') {
    g.lineStyle(2, o.accent, 1); g.lineBetween(cx - 12, cy - 6, cx - 17, cy - 17);
    g.fillStyle(o.accent, 1); g.fillCircle(cx - 17, cy - 17, 2.5);
  } else {
    g.fillStyle(0xffffff, 1); g.fillRect(cx - 3, cy - 7, 6, 14); g.fillRect(cx - 8, cy - 2, 16, 4);
    g.fillStyle(0xff5a5a, 1); g.fillRect(cx - 1.5, cy - 6, 3, 12); g.fillRect(cx - 7, cy - 0.5, 14, 3);
  }
}

function drawZombie(g: Phaser.GameObjects.Graphics, legPhase: number, thrust: number): void {
  g.clear();
  const cx = 32, cy = 32, lp = legPhase * 5;
  g.fillStyle(ZOMBIE.dark, 1);
  g.fillEllipse(cx - 6 + lp, cy + 11, 10, 8); g.fillEllipse(cx - 6 - lp, cy - 11, 10, 8);
  g.fillStyle(ZOMBIE.dark, 1); g.fillEllipse(cx, cy, 36, 32);
  g.fillStyle(ZOMBIE.body, 1); g.fillEllipse(cx, cy, 30, 26);
  const ax = thrust * 6;
  g.fillStyle(ZOMBIE.limb, 1);
  g.fillRoundedRect(cx + 4, cy - 12, 16 + ax, 6, 3); g.fillRoundedRect(cx + 4, cy + 6, 16 + ax, 6, 3);
  g.fillStyle(ZOMBIE.dark, 1); g.fillCircle(cx + 15, cy, 9);
  g.fillStyle(ZOMBIE.head, 1); g.fillCircle(cx + 15, cy, 7);
  g.fillStyle(ZOMBIE.accent, 1); g.fillCircle(cx + 17, cy - 2.5, 1.7); g.fillCircle(cx + 17, cy + 2.5, 1.7);
}

export function createCharacterFrames(scene: Phaser.Scene): void {
  if (!scene.textures.exists('hk_idle')) {
    const g = scene.make.graphics({ x: 0, y: 0 }, false);
    const ph = [0, 1, 0, -1];
    const chars: [string, CharOpt][] = [['hk', HEIKKI], ['sh', SHANE]];
    for (const [pre, opt] of chars) {
      for (let i = 0; i < 4; i++) { drawChar(g, opt, ph[i]); g.generateTexture(pre + '_walk' + i, 64, 64); }
      drawChar(g, opt, 0); g.generateTexture(pre + '_idle', 64, 64);
    }
    for (let i = 0; i < 4; i++) { drawZombie(g, ph[i], 0.3); g.generateTexture('zo_walk' + i, 64, 64); }
    drawZombie(g, 0, 1); g.generateTexture('zo_atk', 64, 64);
    g.destroy();
  }
  for (const pre of ['hk', 'sh']) {
    mk(scene, pre + '_idle', [pre + '_idle'], 3, -1);
    mk(scene, pre + '_walk', [pre + '_walk0', pre + '_walk1', pre + '_walk2', pre + '_walk3'], 12, -1);
  }
  mk(scene, 'zombie_walk', ['zo_walk0', 'zo_walk1', 'zo_walk2', 'zo_walk3'], 10, -1);
  mk(scene, 'zombie_attack', ['zo_atk', 'zo_walk0'], 16, 0);
}

function mk(scene: Phaser.Scene, key: string, frames: string[], fps: number, repeat: number): void {
  if (scene.anims.exists(key)) return;
  scene.anims.create({ key, frames: frames.map((f) => ({ key: f })), frameRate: fps, repeat });
}
