import Phaser from 'phaser';
import { ASSETS } from '../render/assets';

/**
 * Loads optional art from /assets. Missing files are non-fatal (we log + fall
 * back to procedural textures), so the game runs with or without real sprites.
 */
export class BootScene extends Phaser.Scene {
  constructor() { super('boot'); }

  preload(): void {
    this.add.text(this.scale.width / 2, this.scale.height / 2, 'NIGHTFALL', {
      fontFamily: 'monospace', fontSize: '44px', color: '#53e07a', fontStyle: 'bold',
    }).setOrigin(0.5);
    this.load.on('loaderror', (file: Phaser.Loader.File) => {
      console.warn('[assets] missing, using fallback:', file.key);
    });
    for (const a of ASSETS) this.load.image(a.key, a.path);
  }

  create(): void { this.scene.start('game'); }
}
