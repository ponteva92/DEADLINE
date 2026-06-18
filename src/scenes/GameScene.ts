import Phaser from 'phaser';
import {
  WORLD, TICK, WEAPON, PROJECTILE_POOL, ENEMY_POOL,
  TOWER_POOL, TOWERS, GRID, NODE, PHASE, PLAYER, ENEMY,
  TOWER_MAX_LEVEL, towerStat, towerUpgradeCost, towerRepairCost, towerSellRefund,
} from '../sim/constants';
import { Simulation } from '../sim/Simulation';
import type { InputCommand, SimEffect } from '../sim/types';
import { MovementStick } from '../ui/MovementStick';
import { createTextures } from '../render/textures';
import { tex } from '../render/assets';
import { createCharacterFrames } from '../render/sprites';
import { getDom } from '../ui/dom';
import { getAudio } from '../audio/AudioManager';
import { NetClient } from '../net/NetClient';

const LOCAL_ID = 'p1';
const DMG_POOL = 56;
const TRACERS = 64;
const SIZE = { player: 46, enemy: 40, node: 46, tower: 46, proj: 28 };
const NODE_GLOW = [0xffb060, 0xcfe0ff, 0x6ff0ff, 0xb8c2cc];
const RES_NAME = ['Wood', 'Metal', 'Tech', 'Stone'];
const RES_COLOR = ['#ffb060', '#cfe0ff', '#6ff0ff', '#cfd6e0'];
const HARVEST_SFX = ['chop', 'clank', 'click', 'clank'] as const;

interface FloatText { text: Phaser.GameObjects.Text; vy: number; life: number; max: number; }
interface Tracer { x1: number; y1: number; x2: number; y2: number; life: number; max: number; team: number; }

/** Thin renderer + input + JUICE layer. UI lives in the DOM overlay (src/ui/dom.ts). */
export class GameScene extends Phaser.Scene {
  private sim!: Simulation;
  private stick!: MovementStick;
  private dom = getDom();
  private pre = 'hk';

  private kProj = 'proj';
  private kNode: string[] = [];
  private kTower: string[] = [];

  private playerSprite!: Phaser.GameObjects.Sprite;
  private playerShadow!: Phaser.GameObjects.Ellipse;
  private enemySprites: Phaser.GameObjects.Sprite[] = [];
  private projSprites: Phaser.GameObjects.Image[] = [];
  private towerSprites: Phaser.GameObjects.Image[] = [];
  private nodeSprites: Phaser.GameObjects.Image[] = [];
  private nodeGlows: Phaser.GameObjects.Image[] = [];
  private enemyHpGfx!: Phaser.GameObjects.Graphics;
  private worldHpGfx!: Phaser.GameObjects.Graphics;
  private coreGfx!: Phaser.GameObjects.Graphics;
  private reticle!: Phaser.GameObjects.Graphics;
  private ghost!: Phaser.GameObjects.Image;
  private ghostGfx!: Phaser.GameObjects.Graphics;
  private cueGfx!: Phaser.GameObjects.Graphics;
  private cueText!: Phaser.GameObjects.Text;
  private tracerGfx!: Phaser.GameObjects.Graphics;
  private tracers: Tracer[] = [];

  private blood!: Phaser.GameObjects.Particles.ParticleEmitter;
  private sparks!: Phaser.GameObjects.Particles.ParticleEmitter;
  private muzzle!: Phaser.GameObjects.Particles.ParticleEmitter;
  private chips!: Phaser.GameObjects.Particles.ParticleEmitter;

  private floats: FloatText[] = [];
  private grade!: Phaser.GameObjects.Rectangle;
  private redFlash!: Phaser.GameObjects.Rectangle;
  private banner!: Phaser.GameObjects.Text;
  private deadText!: Phaser.GameObjects.Text;

  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private keys!: {
    W: Phaser.Input.Keyboard.Key; A: Phaser.Input.Keyboard.Key;
    S: Phaser.Input.Keyboard.Key; D: Phaser.Input.Keyboard.Key; SPACE: Phaser.Input.Keyboard.Key;
  };

  private acc = 0;
  private now = 0;
  private hitStop = 0;
  private aimX = 0;
  private aimY = -1;
  private aimPointerId = -1;
  private lastManual = -10;
  private shootHeld = false;
  private shootPointerId = -1;
  private isTouch = false;
  private gradeAlpha = 0;
  private coreFlash = 0;
  private warned: Record<number, boolean> = {};
  private inspectActive = false;
  private inspectX = 0;
  private inspectY = 0;
  private net = new NetClient();
  private mode: 'pending' | 'solo' | 'net' = 'pending';
  private connecting = false;
  private localId = LOCAL_ID;
  private remoteSprites: Phaser.GameObjects.Sprite[] = [];
  private remoteShadows: Phaser.GameObjects.Ellipse[] = [];

  constructor() { super('game'); }

  create(): void {
    createTextures(this);
    createCharacterFrames(this);
    this.dom.bind({
      startNight: () => { if (this.mode === 'net') this.net.send('startNight'); else this.sim.skipToNight(); },
      restart: () => this.scene.restart(),
    });
    this.dom.bindUpgrade(() => {
      if (!this.inspectActive) return;
      if (this.mode === 'net') { this.net.send('upgrade', { x: this.inspectX, y: this.inspectY }); getAudio().play('thump'); }
      else { const i = this.sim.towerAt(this.inspectX, this.inspectY); if (i >= 0 && this.sim.upgradeTower(i)) { getAudio().play('thump'); this.refreshPanel(); } }
    });
    this.dom.bindRepair(() => {
      if (!this.inspectActive) return;
      if (this.mode === 'net') this.net.send('repair', { x: this.inspectX, y: this.inspectY });
      else { const i = this.sim.towerAt(this.inspectX, this.inspectY); if (i >= 0) this.sim.repairTower(i); }
      getAudio().play('thump'); this.refreshPanel();
    });
    this.dom.bindSell(() => {
      if (!this.inspectActive) return;
      if (this.mode === 'net') this.net.send('sell', { x: this.inspectX, y: this.inspectY });
      else { const i = this.sim.towerAt(this.inspectX, this.inspectY); if (i >= 0) this.sim.sellTower(i); }
      getAudio().play('click'); this.inspectActive = false; this.dom.setTowerPanel(null);
    });
    this.pre = this.dom.getCharacter() === 'heikki' ? 'hk' : 'sh';

    this.kProj = tex(this, 'img_projectile', 'proj');
    this.kNode = [tex(this, 'img_node_wood', 'node_wood'), tex(this, 'img_node_metal', 'node_metal'), tex(this, 'img_node_tech', 'node_tech'), tex(this, 'img_node_stone', 'node_stone')];
    this.kTower = [tex(this, 'img_tower_rail', 'tower_rail'), tex(this, 'img_tower_artillery', 'tower_artillery'), tex(this, 'img_tower_cryo', 'tower_cryo'), tex(this, 'img_tower_toxic', 'tower_toxic'), tex(this, 'img_tower_tesla', 'tower_tesla'), tex(this, 'img_tower_bastion', 'tower_bastion')];

    this.isTouch = this.sys.game.device.input.touch;
    this.input.addPointer(2);
    this.cameras.main.setBounds(0, 0, WORLD.width, WORLD.height);
    this.cameras.main.setBackgroundColor('#0a0e14');
    this.warned = {};

    const grid = this.add.graphics().setDepth(-10);
    grid.lineStyle(1, 0x18202b, 1);
    for (let x = 0; x <= WORLD.width; x += 64) grid.lineBetween(x, 0, x, WORLD.height);
    for (let y = 0; y <= WORLD.height; y += 64) grid.lineBetween(0, y, WORLD.width, y);
    this.add.image(WORLD.width / 2, WORLD.height / 2, 'corelight').setDepth(-9).setBlendMode(Phaser.BlendModes.ADD);
    // Ambient rubble-fire lights for atmosphere.
    for (const p of [[260, 300], [1340, 280], [360, 820], [1280, 760]]) {
      this.add.image(p[0], p[1], 'glow').setDepth(-8).setBlendMode(Phaser.BlendModes.ADD).setTint(0xff8a3a).setScale(2.2).setAlpha(0.22);
    }

    this.sim = new Simulation(0xC0FFEE);
    this.sim.addPlayer(LOCAL_ID, WORLD.width / 2, WORLD.height / 2 + 170);

    const obs = this.add.graphics().setDepth(2);
    for (const o of this.sim.obstacles) {
      obs.fillStyle(0x222b36, 1).fillRoundedRect(o.x, o.y, o.w, o.h, 6);
      obs.lineStyle(3, 0x46586c, 1).strokeRoundedRect(o.x, o.y, o.w, o.h, 6);
    }

    this.coreGfx = this.add.graphics().setDepth(2);
    for (let i = 0; i < this.sim.nodes.length; i++) {
      this.nodeGlows.push(this.add.image(0, 0, 'glow').setDepth(1).setBlendMode(Phaser.BlendModes.ADD).setVisible(false));
      this.nodeSprites.push(this.add.image(0, 0, this.kNode[0]).setDepth(2).setVisible(false));
    }
    for (let i = 0; i < TOWER_POOL; i++) {
      this.towerSprites.push(this.add.image(0, 0, this.kTower[0]).setDepth(3).setVisible(false));
    }
    this.worldHpGfx = this.add.graphics().setDepth(4);
    this.cueGfx = this.add.graphics().setDepth(2);

    this.playerShadow = this.add.ellipse(0, 0, 40, 20, 0x000000, 0.35).setDepth(3);
    this.playerSprite = this.add.sprite(0, 0, this.pre + '_idle').setDepth(5);
    this.playerSprite.play(this.pre + '_idle');
    for (let i = 0; i < 4; i++) {
      this.remoteShadows.push(this.add.ellipse(0, 0, 40, 20, 0x000000, 0.35).setDepth(3).setVisible(false));
      this.remoteSprites.push(this.add.sprite(0, 0, 'hk_idle').setDepth(5).setVisible(false));
    }

    for (let i = 0; i < ENEMY_POOL; i++) {
      const z = this.add.sprite(0, 0, 'zo_walk0').setDepth(4).setVisible(false);
      z.play('zombie_walk');
      this.enemySprites.push(z);
    }
    this.enemyHpGfx = this.add.graphics().setDepth(4);
    this.tracerGfx = this.add.graphics().setDepth(6);
    for (let i = 0; i < PROJECTILE_POOL; i++) {
      this.projSprites.push(this.add.image(0, 0, this.kProj).setDepth(6).setBlendMode(Phaser.BlendModes.ADD).setVisible(false));
    }
    for (let i = 0; i < TRACERS; i++) this.tracers.push({ x1: 0, y1: 0, x2: 0, y2: 0, life: 0, max: 1, team: 0 });

    this.reticle = this.add.graphics().setDepth(7);
    this.ghostGfx = this.add.graphics().setDepth(7);
    this.ghost = this.add.image(0, 0, this.kTower[0]).setDepth(7).setAlpha(0.5).setVisible(false);
    this.cueText = this.add.text(0, 0, '!', { fontFamily: 'monospace', fontSize: '30px', color: '#ffe066', fontStyle: 'bold' })
      .setOrigin(0.5).setDepth(8).setVisible(false);

    this.blood = this.add.particles(0, 0, 'particle', {
      lifespan: 430, speed: { min: 50, max: 250 }, angle: { min: 0, max: 360 },
      scale: { start: 1.7, end: 0 }, alpha: { start: 1, end: 0 }, tint: 0x8ed14f, emitting: false,
    }).setDepth(7);
    this.sparks = this.add.particles(0, 0, 'particle', {
      lifespan: 240, speed: { min: 80, max: 300 }, angle: { min: 0, max: 360 },
      scale: { start: 1.2, end: 0 }, alpha: { start: 1, end: 0 }, tint: 0xfff0a0, blendMode: 'ADD', emitting: false,
    }).setDepth(7);
    this.chips = this.add.particles(0, 0, 'particle', {
      lifespan: 520, speed: { min: 60, max: 180 }, angle: { min: 200, max: 340 },
      gravityY: 320, scale: { start: 1.4, end: 0 }, alpha: { start: 1, end: 0 }, tint: 0xd2a06a, emitting: false,
    }).setDepth(7);
    this.muzzle = this.add.particles(0, 0, 'glow', {
      lifespan: 100, scale: { start: 0.5, end: 0 }, alpha: { start: 0.9, end: 0 }, speed: 0, blendMode: 'ADD', emitting: false,
    }).setDepth(6);

    for (let i = 0; i < DMG_POOL; i++) {
      const t = this.add.text(0, 0, '', { fontFamily: 'monospace', fontSize: '20px', color: '#fff', fontStyle: 'bold' })
        .setOrigin(0.5).setDepth(9).setVisible(false);
      this.floats.push({ text: t, vy: 0, life: 0, max: 1 });
    }

    this.grade = this.add.rectangle(0, 0, WORLD.width, WORLD.height, 0x0a1430).setOrigin(0).setScrollFactor(0).setDepth(52).setAlpha(0);
    this.redFlash = this.add.rectangle(0, 0, WORLD.width, WORLD.height, 0xff2030).setOrigin(0).setScrollFactor(0).setDepth(60).setAlpha(0);
    this.add.image(WORLD.width / 2, WORLD.height / 2, 'vignette').setDisplaySize(WORLD.width, WORLD.height).setScrollFactor(0).setDepth(55);
    this.banner = this.add.text(WORLD.width / 2, WORLD.height / 2 - 130, '', { fontFamily: 'monospace', fontSize: '40px', color: '#ffd166', fontStyle: 'bold' }).setOrigin(0.5).setScrollFactor(0).setDepth(46).setAlpha(0);
    this.deadText = this.add.text(WORLD.width / 2, WORLD.height / 2 - 40, '', { fontFamily: 'monospace', fontSize: '28px', color: '#ff8080', fontStyle: 'bold' }).setOrigin(0.5).setScrollFactor(0).setDepth(45).setVisible(false);

    this.cursors = this.input.keyboard!.createCursorKeys();
    this.keys = this.input.keyboard!.addKeys('W,A,S,D,SPACE') as typeof this.keys;
    this.stick = new MovementStick();
    this.input.on('pointerdown', this.onDown, this);
    this.input.on('pointermove', this.onMove, this);
    this.input.on('pointerup', (p: Phaser.Input.Pointer) => {
      if (p.id === this.shootPointerId) { this.shootHeld = false; this.shootPointerId = -1; }
      if (p.id === this.aimPointerId) this.aimPointerId = -1;
    });

  }

  // ---- Input -------------------------------------------------------------
  private onDown(p: Phaser.Input.Pointer): void {
    if (this.sim.gameOver || !this.dom.isStarted()) return;
    const sel = this.dom.selectedTower();
    if (sel >= 0) {
      if (this.sim.phase === 'day') {
        if (this.mode === 'net') this.net.send('build', { kind: sel, x: p.worldX, y: p.worldY });
        else this.sim.tryBuild(sel, p.worldX, p.worldY);
      }
      return;
    }
    const ti = this.sim.towerAt(p.worldX, p.worldY);
    if (ti >= 0) { getAudio().play('click'); const t = this.sim.towers[ti]; this.inspectActive = true; this.inspectX = t.x; this.inspectY = t.y; this.refreshPanel(); return; }
    if (this.inspectActive) { this.inspectActive = false; this.dom.setTowerPanel(null); }
    this.aimFrom(p, true);
  }

  private onMove(p: Phaser.Input.Pointer): void {
    if (this.dom.selectedTower() >= 0) return;
    this.aimFrom(p, false);
  }

  private aimFrom(p: Phaser.Input.Pointer, down: boolean): void {
    if (p.id === this.shootPointerId) return;
    const player = this.sim.players.get(this.localId);
    if (!player) return;
    if (this.isTouch) {
      if (!p.isDown) return;
      if (p.x < WORLD.width * 0.5) return;
      if (down && this.aimPointerId === -1) this.aimPointerId = p.id;
      if (p.id !== this.aimPointerId) return;
    }
    const dx = p.worldX - player.x, dy = p.worldY - player.y;
    if (dx !== 0 || dy !== 0) { const l = Math.hypot(dx, dy) || 1; this.aimX = dx / l; this.aimY = dy / l; this.lastManual = this.now; }
  }

  private buildInput(): InputCommand {
    let mx = 0, my = 0;
    if (this.cursors.left.isDown || this.keys.A.isDown) mx -= 1;
    if (this.cursors.right.isDown || this.keys.D.isDown) mx += 1;
    if (this.cursors.up.isDown || this.keys.W.isDown) my -= 1;
    if (this.cursors.down.isDown || this.keys.S.isDown) my += 1;
    mx += this.stick.moveX; my += this.stick.moveY;
    const manualAim = this.isTouch ? this.aimPointerId !== -1 : this.now - this.lastManual < 0.4;
    const desktopFire = !this.isTouch && this.dom.selectedTower() < 0 && this.input.activePointer.leftButtonDown();
    const shooting = this.dom.isShooting() || this.keys.SPACE.isDown || desktopFire;
    return { moveX: mx, moveY: my, aimX: this.aimX, aimY: this.aimY, manualAim, shooting };
  }

  // ---- Loop --------------------------------------------------------------
  update(_t: number, deltaMs: number): void {
    const dt = deltaMs / 1000;
    this.now += dt;
    if (this.coreFlash > 0) this.coreFlash -= dt;

    if (this.dom.isStarted() && this.mode === 'pending' && !this.connecting) {
      if (this.dom.wantsNet()) { this.connecting = true; void this.tryConnect(); }
      else this.mode = 'solo';
    }

    if (this.mode === 'net') {
      this.applyServerState();
      this.net.send('input', this.buildInput());
      this.checkWarnings();
    } else if (this.mode === 'solo' && this.dom.isStarted() && !this.sim.gameOver) {
      if (this.hitStop > 0) this.hitStop -= dt;
      else {
        this.acc += dt;
        let steps = 0;
        while (this.acc >= TICK && steps < 5) {
          this.sim.setInput(this.localId, this.buildInput());
          this.sim.step(TICK);
          this.acc -= TICK; steps++;
        }
      }
      this.checkWarnings();
    }

    this.processEffects(this.sim.consumeEffects());
    this.draw(dt);
    this.updateFloats(dt);
    this.updateTracers(dt);

    const pl = this.sim.players.get(this.localId);
    this.dom.update({
      phase: this.sim.phase, day: this.sim.day, dayTimer: this.sim.dayTimer,
      wood: this.sim.resources.wood, metal: this.sim.resources.metal, tech: this.sim.resources.tech, stone: this.sim.resources.stone,
      hp: pl?.hp ?? 0, maxHp: pl?.maxHp ?? 100, core: this.sim.core.hp, coreMax: this.sim.core.maxHp, gameOver: this.sim.gameOver,
    });
    if (this.inspectActive) this.refreshPanel();
  }

  private async tryConnect(): Promise<void> {
    this.showBanner('CONNECTING…', '#9fb6cc');
    const ok = await this.net.connect(this.dom.getCharacter());
    this.mode = ok ? 'net' : 'solo';
    this.connecting = false;
    if (ok) this.localId = this.net.sessionId;
  }

  private applyServerState(): void {
    const r = this.net.room; if (!r) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const st = r.state as any; const sim = this.sim;
    if (st.phase && st.phase !== sim.phase) {
      if (st.phase === 'night') { this.showBanner(`NIGHT ${st.day}`, '#7da0ff'); getAudio().setPhase('night'); }
      else { this.showBanner(`DAY ${st.day} — SCAVENGE & BUILD`, '#ffd166'); this.warned = {}; getAudio().setPhase('day'); }
    }
    sim.phase = st.phase; sim.day = st.day; sim.dayTimer = st.dayTimer;
    sim.core.hp = st.coreHp; sim.core.maxHp = st.coreMax || sim.core.maxHp; sim.gameOver = st.gameOver;
    sim.resources.wood = st.resources.wood; sim.resources.metal = st.resources.metal;
    sim.resources.tech = st.resources.tech; sim.resources.stone = st.resources.stone;
    const seen = new Set<string>();
    st.players.forEach((p: any, id: string) => {
      let sp = sim.players.get(id); if (!sp) sp = sim.addPlayer(id, p.x, p.y);
      sp.x = p.x; sp.y = p.y; sp.aimX = p.aimX; sp.aimY = p.aimY; sp.hp = p.hp; sp.dead = p.dead;
      (sp as unknown as { character: string }).character = p.character; seen.add(id);
    });
    for (const id of Array.from(sim.players.keys())) if (!seen.has(id)) sim.removePlayer(id);
    for (let i = 0; i < sim.enemies.length; i++) {
      const e = sim.enemies[i]; const z = st.zombies[i];
      if (z) { if (!e.active) e.maxHp = z.hp; e.active = true; e.x = z.x; e.y = z.y; e.hp = z.hp; if (z.hp > e.maxHp) e.maxHp = z.hp; e.kind = z.kind; e.slowT = z.slowT; e.stunT = z.stunT; e.dotT = z.dotT; e.hitFlash = 0; e.attackCd = 0; e.vx = 0; e.vy = 0; }
      else e.active = false;
    }
    for (let i = 0; i < sim.towers.length; i++) {
      const t = sim.towers[i]; const o = st.towers[i];
      if (o) { t.active = true; t.x = o.x; t.y = o.y; t.kind = o.type; t.level = o.level; t.hp = o.hp; t.maxHp = o.maxHp; }
      else t.active = false;
    }
    for (let i = 0; i < sim.nodes.length; i++) {
      const n = sim.nodes[i]; const o = st.nodes[i];
      if (o) { n.active = true; n.x = o.x; n.y = o.y; n.kind = o.kind; } else n.active = false;
    }
    for (let i = 0; i < sim.projectiles.length; i++) {
      const pr = sim.projectiles[i]; const o = st.projectiles[i];
      if (o) { pr.active = true; pr.x = o.x; pr.y = o.y; pr.team = o.team; pr.vx = 0; pr.vy = 0; } else pr.active = false;
    }
  }

  private checkWarnings(): void {
    if (this.sim.phase !== 'day') return;
    for (const thr of PHASE.warnAt) {
      if (!this.warned[thr] && this.sim.dayTimer <= thr) {
        this.warned[thr] = true;
        this.showBanner(`NIGHT IN ${thr}s`, '#ff9a4d');
        this.cameras.main.shake(120, 0.004);
      }
    }
  }

  private pushTracer(x: number, y: number, dx: number, dy: number, len: number, team: number): void {
    const t = this.tracers.find((tr) => tr.life <= 0);
    if (!t) return;
    t.x1 = x; t.y1 = y; t.x2 = x + dx * len; t.y2 = y + dy * len; t.life = 0.07; t.max = 0.07; t.team = team;
  }

  private pushSeg(x1: number, y1: number, x2: number, y2: number, team: number, life: number): void {
    const t = this.tracers.find((tr) => tr.life <= 0);
    if (!t) return;
    t.x1 = x1; t.y1 = y1; t.x2 = x2; t.y2 = y2; t.life = life; t.max = life; t.team = team;
  }

  private processEffects(fx: SimEffect[]): void {
    const cam = this.cameras.main;
    const A = getAudio();
    for (const e of fx) {
      switch (e.type) {
        case 'fire': this.muzzle.explode(1, e.x + e.dx * 16, e.y + e.dy * 16); this.pushTracer(e.x, e.y, e.dx, e.dy, 70, 0); A.play('shot'); break;
        case 'towerFire': this.muzzle.explode(1, e.x + e.dx * 18, e.y + e.dy * 18); this.pushTracer(e.x, e.y, e.dx, e.dy, 90, 1); break;
        case 'hit': this.sparks.explode(7, e.x, e.y); if (e.amount > 0) this.spawnFloat(e.x, e.y, String(Math.round(e.amount)), '#ffe08a'); break;
        case 'towerHit': this.sparks.explode(4, e.x, e.y); break;
        case 'kill': this.blood.explode(16, e.x, e.y); this.addSplat(e.x, e.y); cam.shake(45, 0.004); this.hitStop = Math.min(this.hitStop + 0.02, 0.05); A.play('kill'); break;
        case 'playerHit': cam.shake(150, 0.012); this.flashRed(0.34); this.spawnFloat(e.x, e.y - 24, String(Math.round(e.amount)), '#ff6060'); A.play('hurt'); break;
        case 'playerDeath': cam.shake(430, 0.02); this.flashRed(0.6); break;
        case 'harvest': {
          const k = e.amount | 0;
          this.chips.setParticleTint(NODE_GLOW[k]); this.chips.explode(8, e.x, e.y); A.play(HARVEST_SFX[k]);
          this.spawnFloat(e.x, e.y - 18, `+${NODE.chunk} ${RES_NAME[k]}`, RES_COLOR[k]);
          break;
        }
        case 'build': this.muzzle.explode(4, e.x, e.y); cam.shake(70, 0.004); A.play('thump'); break;
        case 'buildFail': this.spawnFloat(e.x, e.y, 'X', '#ff6060'); break;
        case 'coreHit': cam.shake(70, 0.005); this.coreFlash = 0.15; A.play('core'); break;
        case 'phase':
          if (e.amount === 1) { this.showBanner(`NIGHT ${this.sim.day}`, '#7da0ff'); A.setPhase('night'); }
          else { this.showBanner(`DAY ${this.sim.day} — SCAVENGE & BUILD`, '#ffd166'); this.warned = {}; A.setPhase('day'); }
          break;
        case 'cryo': { const ring = this.add.image(e.x, e.y, 'glow').setTint(0x7df0f0).setBlendMode(Phaser.BlendModes.ADD).setDepth(2).setScale(e.amount / 56); this.tweens.add({ targets: ring, alpha: 0, scale: ring.scale * 1.5, duration: 420, onComplete: () => ring.destroy() }); break; }
        case 'upgrade': this.muzzle.explode(8, e.x, e.y); cam.shake(90, 0.005); A.play('thump'); this.spawnFloat(e.x, e.y - 24, `LVL ${e.amount | 0}`, '#9bf5b8'); break;
        case 'rail': this.pushSeg(e.x, e.y, e.x + e.dx * e.amount, e.y + e.dy * e.amount, 2, 0.13); cam.shake(60, 0.005); A.play('shot'); break;
        case 'boom': { const b = this.add.image(e.x, e.y, 'glow').setTint(0xffd080).setBlendMode(Phaser.BlendModes.ADD).setDepth(7).setScale(e.amount / 40); this.tweens.add({ targets: b, alpha: 0, scale: b.scale * 1.5, duration: 320, onComplete: () => b.destroy() }); cam.shake(120, 0.012); A.play('kill'); break; }
        case 'arc': this.pushSeg(e.x, e.y, e.x + e.dx, e.y + e.dy, 3, 0.1); break;
        case 'spray': this.chips.setParticleTint(0x9bff5a); this.chips.explode(10, e.x, e.y); break;
        case 'stun': this.sparks.explode(6, e.x, e.y); break;
        case 'repair': this.sparks.explode(10, e.x, e.y); this.spawnFloat(e.x, e.y - 22, 'REPAIRED', '#9bf5b8'); break;
        case 'sell': this.chips.setParticleTint(0xffe066); this.chips.explode(14, e.x, e.y); this.spawnFloat(e.x, e.y - 22, '+50% REFUND', '#ffe066'); cam.shake(40, 0.003); break;
        default: break;
      }
    }
  }

  // ---- Draw --------------------------------------------------------------
  private draw(dt: number): void {
    const sim = this.sim;
    const player = sim.players.get(this.localId);
    const sel = this.dom.selectedTower();

    let targetA = 0;
    if (sim.phase === 'night') { this.grade.fillColor = 0x0a1330; targetA = 0.5; }
    else { this.grade.fillColor = 0x1a1208; targetA = 0.34 * (1 - sim.dayTimer / PHASE.dayLength); }
    this.gradeAlpha += (targetA - this.gradeAlpha) * Math.min(1, dt * 2.5);
    this.grade.setAlpha(this.gradeAlpha);

    const c = sim.core;
    const cg = this.coreGfx; cg.clear();
    const pulse = 30 + Math.sin(this.now * 3) * 2;
    cg.fillStyle(this.coreFlash > 0 ? 0xff5050 : 0x1f6feb, 0.25).fillCircle(c.x, c.y, pulse + 10);
    cg.fillStyle(this.coreFlash > 0 ? 0xff8080 : 0x2b7bff, 1).fillCircle(c.x, c.y, pulse);
    cg.lineStyle(4, 0x9ec3ff, 1).strokeCircle(c.x, c.y, pulse);
    this.bar(cg, c.x - 50, c.y - 52, 100, 8, c.hp / c.maxHp, 0x53e07a);

    // Nodes with bloom glow + interaction cue.
    this.cueGfx.clear();
    let cueNode: { x: number; y: number } | null = null; let cueDist = 1e9;
    const reach = NODE.harvestReach;
    for (let i = 0; i < this.nodeSprites.length; i++) {
      const n = sim.nodes[i];
      const s = this.nodeSprites[i]; const gl = this.nodeGlows[i];
      if (!n.active) { s.setVisible(false); gl.setVisible(false); continue; }
      const bob = 1 + Math.sin(this.now * 4 + i) * 0.04;
      s.setVisible(true).setTexture(this.kNode[n.kind]).setPosition(n.x, n.y).setDisplaySize(SIZE.node, SIZE.node * bob);
      gl.setVisible(true).setPosition(n.x, n.y).setTint(NODE_GLOW[n.kind])
        .setScale(0.9 + Math.sin(this.now * 3 + i) * 0.12).setAlpha(0.5);
      if (player && !player.dead) {
        const d = Math.hypot(n.x - player.x, n.y - player.y);
        if (d < reach) {
          this.cueGfx.lineStyle(3, 0xffe066, 0.85).strokeCircle(n.x, n.y, 28 * (1 + Math.sin(this.now * 7) * 0.12));
          if (d < cueDist) { cueDist = d; cueNode = n; }
        }
      }
    }
    if (cueNode) this.cueText.setVisible(true).setPosition(cueNode.x, cueNode.y - 44 + Math.sin(this.now * 7) * 3);
    else this.cueText.setVisible(false);

    this.worldHpGfx.clear();
    for (let i = 0; i < this.towerSprites.length; i++) {
      const t = sim.towers[i]; const s = this.towerSprites[i];
      if (!t.active) { s.setVisible(false); continue; }
      const def = TOWERS[t.kind];
      const ts = SIZE.tower * (1 + 0.05 * (t.level - 1));
      s.setVisible(true).setTexture(this.kTower[t.kind]).setPosition(t.x, t.y).setDisplaySize(ts, ts);
      if (def.gun) { const tg = this.nearestEnemyTo(t.x, t.y, def.range); if (tg) s.setRotation(Math.atan2(tg.y - t.y, tg.x - t.x)); }
      if (t.hp < t.maxHp) this.bar(this.worldHpGfx, t.x - 18, t.y - 30, 36, 5, t.hp / t.maxHp, 0x7ec8ff);
      for (let lp = 0; lp < t.level; lp++) this.worldHpGfx.fillStyle(0xffe066, 1).fillCircle(t.x - 12 + lp * 8, t.y - 34, 2.6);
    }

    if (!player || player.dead) {
      this.playerSprite.setVisible(false); this.playerShadow.setVisible(false);
      if (player && player.dead)
        this.deadText.setVisible(true).setText(`DOWN - respawning ${Math.ceil(player.respawn)}`);
      else this.deadText.setVisible(false);
    } else {
      this.deadText.setVisible(false);
      const moving = Math.hypot(player.vx, player.vy) > 25;
      const akey = this.pre + (moving ? '_walk' : '_idle');
      if (this.playerSprite.anims.currentAnim?.key !== akey) this.playerSprite.play(akey);
      this.playerSprite.setVisible(true).setPosition(player.x, player.y).setDisplaySize(SIZE.player, SIZE.player).setRotation(Math.atan2(player.aimY, player.aimX));
      this.playerShadow.setVisible(true).setPosition(player.x, player.y + 16);
      this.playerSprite.setAlpha(player.invuln > 0 && Math.floor(this.now * 20) % 2 === 0 ? 0.4 : 1);
    }

    let ri = 0;
    for (const [id, rp] of sim.players) {
      if (id === this.localId) continue;
      if (ri >= this.remoteSprites.length) break;
      const rs = this.remoteSprites[ri]; const rsh = this.remoteShadows[ri]; ri++;
      if (rp.dead) { rs.setVisible(false); rsh.setVisible(false); continue; }
      const rpre = (rp as unknown as { character?: string }).character === 'shane' ? 'sh' : 'hk';
      const ak = rpre + '_idle';
      if (rs.anims.currentAnim?.key !== ak) rs.play(ak);
      rs.setVisible(true).setPosition(rp.x, rp.y).setDisplaySize(SIZE.player, SIZE.player).setRotation(Math.atan2(rp.aimY, rp.aimX));
      rsh.setVisible(true).setPosition(rp.x, rp.y + 16);
    }
    for (; ri < this.remoteSprites.length; ri++) { this.remoteSprites[ri].setVisible(false); this.remoteShadows[ri].setVisible(false); }

    this.enemyHpGfx.clear();
    for (let i = 0; i < this.enemySprites.length; i++) {
      const e = sim.enemies[i]; const s = this.enemySprites[i];
      if (!e.active) { s.setVisible(false); continue; }
      const ek = e.attackCd > ENEMY.attackCooldown * 0.7 ? 'zombie_attack' : 'zombie_walk';
      if (s.anims.currentAnim?.key !== ek) s.play(ek, true);
      const ang = (e.vx !== 0 || e.vy !== 0) ? Math.atan2(e.vy, e.vx) : 0;
      s.setVisible(true).setPosition(e.x, e.y).setRotation(ang).setDisplaySize(SIZE.enemy, SIZE.enemy * (1 + Math.sin(this.now * 9 + i) * 0.06));
      if (e.hitFlash > 0) s.setTintFill(0xffffff);
      else if (e.stunT > 0) s.setTint(0x9be0ff);
      else if (e.dotT > 0) s.setTint(0x9bff5a);
      else if (e.slowT > 0) s.setTint(0xbfe6ff);
      else s.clearTint();
      if (e.hp < e.maxHp) this.bar(this.enemyHpGfx, e.x - 15, e.y - 28, 30, 5, e.hp / e.maxHp, 0x7ef08a);
    }

    const tintProj = this.kProj === 'proj';
    for (let i = 0; i < this.projSprites.length; i++) {
      const pr = sim.projectiles[i]; const g = this.projSprites[i];
      if (!pr.active) { g.setVisible(false); continue; }
      g.setVisible(true).setPosition(pr.x, pr.y).setDisplaySize(SIZE.proj, SIZE.proj * 0.45).setRotation(Math.atan2(pr.vy, pr.vx));
      if (tintProj) g.setTint(pr.team === 1 ? 0x7df0f0 : 0xffd166); else g.clearTint();
    }

    this.reticle.clear(); this.ghostGfx.clear();
    if (sel >= 0 && sim.phase === 'day') {
      this.drawGhost(sel);
    } else {
      this.ghost.setVisible(false);
      if (player && !player.dead) {
        const best = this.nearestEnemyTo(player.x, player.y, WEAPON.autoAimRange);
        this.reticle.lineStyle(2, 0x8ab4ff, 0.35);
        this.reticle.lineBetween(player.x, player.y, player.x + player.aimX * 70, player.y + player.aimY * 70);
        if (best) {
          this.reticle.lineStyle(3, 0xff6b6b, 0.9);
          const r = 22;
          this.brk(best.x - r, best.y - r, 8, 8); this.brk(best.x + r, best.y - r, -8, 8);
          this.brk(best.x - r, best.y + r, 8, -8); this.brk(best.x + r, best.y + r, -8, -8);
        }
      }
    }
  }

  private drawGhost(sel: number): void {
    const def = TOWERS[sel];
    const p = this.input.activePointer;
    const gx = Math.floor(p.worldX / GRID) * GRID + GRID / 2;
    const gy = Math.floor(p.worldY / GRID) * GRID + GRID / 2;
    this.ghost.setVisible(true).setTexture(this.kTower[sel]).setPosition(gx, gy).setDisplaySize(SIZE.tower, SIZE.tower);
    if (def.range > 0) {
      this.ghostGfx.lineStyle(2, 0x8ab4ff, 0.5).strokeCircle(gx, gy, def.range);
      this.ghostGfx.fillStyle(0x8ab4ff, 0.08).fillCircle(gx, gy, def.range);
    }
    this.ghostGfx.lineStyle(2, 0x53e07a, 0.8).strokeRect(gx - GRID / 2, gy - GRID / 2, GRID, GRID);
  }

  private nearestEnemyTo(x: number, y: number, range: number): { x: number; y: number } | null {
    let best: { x: number; y: number } | null = null; let bd2 = range * range;
    for (const e of this.sim.enemies) {
      if (!e.active) continue;
      const d2 = (e.x - x) ** 2 + (e.y - y) ** 2;
      if (d2 < bd2) { bd2 = d2; best = e; }
    }
    return best;
  }

  private refreshPanel(): void {
    const idx = this.sim.towerAt(this.inspectX, this.inspectY);
    if (idx < 0) { this.inspectActive = false; this.dom.setTowerPanel(null); return; }
    const t = this.sim.towers[idx];
    const def = TOWERS[t.kind];
    const st = towerStat(t.kind, t.level);
    const hp = `<span>HP ${Math.ceil(t.hp)}/${st.hp}</span>`;
    const stats = def.gun
      ? `<span>DMG ${st.damage.toFixed(0)}</span><span>RNG ${st.range.toFixed(0)}</span>${hp}`
      : def.slow > 0
        ? `<span>SLOW ${(st.slow * 100) | 0}%</span><span>RNG ${st.range.toFixed(0)}</span>${hp}`
        : `<span>Barrier</span>${hp}`;
    const maxed = t.level >= TOWER_MAX_LEVEL;
    let cost = ''; let afford = false;
    if (!maxed) {
      const c = towerUpgradeCost(t.kind, t.level); const r = this.sim.resources;
      afford = r.wood >= c.wood && r.metal >= c.metal && r.tech >= c.tech && r.stone >= c.stone;
      cost = `${c.wood ? c.wood + '🪵 ' : ''}${c.metal ? c.metal + '⚙️ ' : ''}${c.stone ? c.stone + '🪨 ' : ''}${c.tech ? c.tech + '🔩' : ''}`.trim();
    }
    const missing = 1 - t.hp / t.maxHp;
    const rc = towerRepairCost(t.kind, missing); const rr = this.sim.resources;
    const canRepair = t.hp < t.maxHp && rr.wood >= rc.wood && rr.metal >= rc.metal && rr.tech >= rc.tech && rr.stone >= rc.stone;
    const fmt = (c2: { wood: number; metal: number; tech: number; stone: number }) => `${c2.wood ? c2.wood + '🪵 ' : ''}${c2.metal ? c2.metal + '⚙️ ' : ''}${c2.stone ? c2.stone + '🪨 ' : ''}${c2.tech ? c2.tech + '🔩' : ''}`.trim();
    const sref = towerSellRefund(t.kind, t.level);
    this.dom.setTowerPanel({ name: def.name, level: t.level, max: TOWER_MAX_LEVEL, stats, cost, affordable: afford, maxed, repairCost: fmt(rc), canRepair, sellRefund: fmt(sref) });
  }

  private bar(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, f: number, col: number): void {
    const k = Math.max(0, Math.min(1, f));
    g.fillStyle(0x000000, 0.6).fillRect(x - 1, y - 1, w + 2, h + 2);
    g.fillStyle(col, 1).fillRect(x, y, w * k, h);
  }
  private brk(x: number, y: number, ex: number, ey: number): void {
    this.reticle.lineBetween(x, y, x + ex, y); this.reticle.lineBetween(x, y, x, y + ey);
  }

  // ---- FX ----------------------------------------------------------------
  private updateTracers(dt: number): void {
    this.tracerGfx.clear();
    for (const t of this.tracers) {
      if (t.life <= 0) continue;
      t.life -= dt;
      const a = Math.max(0, t.life / t.max);
      const col = t.team === 1 ? 0x7df0f0 : t.team === 2 ? 0xffffff : t.team === 3 ? 0x9bd0ff : 0xfff0a0;
      const w = t.team === 2 ? 5 * a + 1 : t.team === 3 ? 2.6 : 3 * a + 0.5;
      this.tracerGfx.lineStyle(w, col, a);
      this.tracerGfx.lineBetween(t.x1, t.y1, t.x2, t.y2);
    }
  }
  private addSplat(x: number, y: number): void {
    const s = this.add.image(x, y, 'splat').setDepth(1).setRotation(Math.random() * Math.PI).setScale(0.7 + Math.random() * 0.5).setAlpha(0.85);
    this.tweens.add({ targets: s, alpha: 0, duration: 4000, onComplete: () => s.destroy() });
  }
  private flashRed(a: number): void {
    this.redFlash.setAlpha(a); this.tweens.add({ targets: this.redFlash, alpha: 0, duration: 260 });
  }
  private showBanner(text: string, color: string): void {
    this.banner.setText(text).setColor(color).setAlpha(1).setScale(1.2);
    this.tweens.add({ targets: this.banner, alpha: 0, scale: 1, duration: 1300, ease: 'Quad.easeIn' });
  }
  private spawnFloat(x: number, y: number, str: string, color: string): void {
    const d = this.floats.find((n) => n.life <= 0);
    if (!d) return;
    d.text.setText(str).setColor(color).setPosition(x + (Math.random() * 16 - 8), y).setVisible(true).setAlpha(1).setScale(1.25);
    d.vy = -46; d.life = 0.8; d.max = 0.8;
  }
  private updateFloats(dt: number): void {
    for (const d of this.floats) {
      if (d.life <= 0) continue;
      d.life -= dt; d.text.y += d.vy * dt; d.vy += 60 * dt;
      const k = Math.max(0, d.life / d.max);
      d.text.setAlpha(k).setScale(0.9 + k * 0.4);
      if (d.life <= 0) d.text.setVisible(false);
    }
  }
}
