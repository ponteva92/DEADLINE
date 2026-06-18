import Phaser from 'phaser';

/**
 * Maps logical art to image files under /assets. Every file is OPTIONAL:
 * if it is missing, the game falls back to the built-in procedural texture,
 * so the project always runs. Drop PNGs at these paths to override.
 */
export interface AssetDef { key: string; path: string; }

export const ASSETS: AssetDef[] = [
  { key: 'img_player',      path: 'assets/characters/player.png' },
  { key: 'img_zombie',      path: 'assets/characters/zombie.png' },
  { key: 'img_node_wood',   path: 'assets/environment/tree.png' },
  { key: 'img_node_metal',  path: 'assets/environment/metal.png' },
  { key: 'img_node_tech',   path: 'assets/environment/tech.png' },
  { key: 'img_node_stone',  path: 'assets/environment/stone.png' },
  { key: 'img_tower_light', path: 'assets/towers/tower_light.png' },
  { key: 'img_tower_heavy', path: 'assets/towers/tower_heavy.png' },
  { key: 'img_tower_wall',  path: 'assets/towers/wall.png' },
  { key: 'img_projectile',  path: 'assets/effects/projectile.png' },
];

/** Returns the loaded file texture key if present, else the procedural fallback. */
export function tex(scene: Phaser.Scene, fileKey: string, fallback: string): string {
  return scene.textures.exists(fileKey) ? fileKey : fallback;
}
