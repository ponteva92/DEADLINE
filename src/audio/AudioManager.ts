/**
 * AudioManager — Web Audio synthesis engine (no asset files needed, so it works
 * offline and in the inlined preview). Exposes a simple play(name) API plus a
 * day/night music crossfade. To use recorded .ogg/.mp3 later, swap the synth
 * bodies for buffer playback behind the same method names.
 *
 * Realism touches: gunshots layer a noise "crack" + body thump and randomize
 * pitch every shot (detune) so repeats never sound identical.
 */
export type Sfx = 'shot' | 'hit' | 'kill' | 'chop' | 'clank' | 'thump' | 'click' | 'core' | 'hurt';

export class AudioManager {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfxBus!: GainNode;
  private musicBus!: GainNode;
  private dayGain!: GainNode;
  private nightGain!: GainNode;
  private noise!: AudioBuffer;
  private started = false;
  private muted = false;

  /** Call from a user gesture (the DEPLOY click) so mobile browsers allow audio. */
  init(): void {
    if (this.ctx) { void this.ctx.resume(); return; }
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctor();
    this.ctx = ctx;
    this.master = ctx.createGain(); this.master.gain.value = 0.55; this.master.connect(ctx.destination);
    this.sfxBus = ctx.createGain(); this.sfxBus.gain.value = 0.7; this.sfxBus.connect(this.master);
    this.musicBus = ctx.createGain(); this.musicBus.gain.value = 0.32; this.musicBus.connect(this.master);
    this.noise = this.makeNoise(ctx);
    this.startMusic();
  }

  toggleMute(): boolean { this.muted = !this.muted; if (this.master) this.master.gain.value = this.muted ? 0 : 0.55; return this.muted; }

  // ---- music ------------------------------------------------------------
  private startMusic(): void {
    if (!this.ctx || this.started) return;
    this.started = true;
    const ctx = this.ctx;
    this.dayGain = ctx.createGain(); this.dayGain.gain.value = 1; this.dayGain.connect(this.musicBus);
    this.nightGain = ctx.createGain(); this.nightGain.gain.value = 0; this.nightGain.connect(this.musicBus);

    // Day bed: low, tense, slow-breathing drone.
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 540; lp.Q.value = 4; lp.connect(this.dayGain);
    for (const f of [55, 82.5, 110.3]) { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; const g = ctx.createGain(); g.gain.value = 0.18; o.connect(g); g.connect(lp); o.start(); }
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.08; const lg = ctx.createGain(); lg.gain.value = 180; lfo.connect(lg); lg.connect(lp.frequency); lfo.start();

    // Night bed: higher tension + a 2 Hz pulse for cinematic urgency.
    const hp = ctx.createGain(); hp.connect(this.nightGain);
    for (const f of [73.4, 110, 146.8]) { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; const g = ctx.createGain(); g.gain.value = 0.16; o.connect(g); g.connect(hp); o.start(); }
    const pulse = ctx.createOscillator(); pulse.type = 'sine'; pulse.frequency.value = 2; const pg = ctx.createGain(); pg.gain.value = 0.5;
    const pBase = ctx.createConstantSource(); pBase.offset.value = 0.5; pBase.connect(hp.gain); pulse.connect(pg); pg.connect(hp.gain); pulse.start(); pBase.start();
  }

  setPhase(phase: 'day' | 'night'): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, dur = 1.6;
    this.dayGain.gain.cancelScheduledValues(t); this.nightGain.gain.cancelScheduledValues(t);
    this.dayGain.gain.setValueAtTime(this.dayGain.gain.value, t);
    this.nightGain.gain.setValueAtTime(this.nightGain.gain.value, t);
    this.dayGain.gain.linearRampToValueAtTime(phase === 'day' ? 1 : 0, t + dur);
    this.nightGain.gain.linearRampToValueAtTime(phase === 'night' ? 1 : 0, t + dur);
  }

  // ---- sfx --------------------------------------------------------------
  play(name: Sfx): void {
    const ctx = this.ctx; if (!ctx || this.muted) return;
    const t = ctx.currentTime;
    switch (name) {
      case 'shot': this.shot(ctx, t); break;
      case 'hit': this.burst(ctx, t, 1600, 0.05, 0.18, 'highpass'); break;
      case 'kill': this.burst(ctx, t, 500, 0.14, 0.3, 'bandpass'); break;
      case 'chop': this.burst(ctx, t, 900, 0.12, 0.4, 'bandpass'); this.tone(ctx, t, 160, 70, 0.12, 0.18, 'triangle'); break;
      case 'clank': this.tone(ctx, t, 2400 + Math.random() * 400, 1600, 0.12, 0.16, 'square'); this.burst(ctx, t, 3000, 0.05, 0.12, 'highpass'); break;
      case 'thump': this.tone(ctx, t, 150, 45, 0.32, 0.5, 'sine'); break;
      case 'click': this.tone(ctx, t, 1500, 1100, 0.05, 0.12, 'triangle'); break;
      case 'core': this.tone(ctx, t, 110, 40, 0.4, 0.5, 'sine'); break;
      case 'hurt': this.tone(ctx, t, 240, 80, 0.18, 0.35, 'sawtooth'); break;
    }
  }

  private shot(ctx: AudioContext, t: number): void {
    const detune = 1 + (Math.random() - 0.5) * 0.18; // ±9% pitch variance
    // crack (noise through bandpass)
    const src = ctx.createBufferSource(); src.buffer = this.noise; src.playbackRate.value = detune;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1800 * detune; bp.Q.value = 0.8;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.9, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
    src.connect(bp); bp.connect(g); g.connect(this.sfxBus); src.start(t); src.stop(t + 0.2);
    // body thump
    this.tone(ctx, t, 180 * detune, 55, 0.14, 0.5, 'sine');
  }

  private burst(ctx: AudioContext, t: number, freq: number, dur: number, vol: number, type: BiquadFilterType): void {
    const src = ctx.createBufferSource(); src.buffer = this.noise; src.playbackRate.value = 0.9 + Math.random() * 0.3;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = 1.2;
    const g = ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f); f.connect(g); g.connect(this.sfxBus); src.start(t); src.stop(t + dur + 0.05);
  }

  private tone(ctx: AudioContext, t: number, f0: number, f1: number, dur: number, vol: number, type: OscillatorType): void {
    const o = ctx.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.sfxBus); o.start(t); o.stop(t + dur + 0.05);
  }

  private makeNoise(ctx: AudioContext): AudioBuffer {
    const len = ctx.sampleRate * 0.4;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }
}

let inst: AudioManager | null = null;
export function getAudio(): AudioManager { if (!inst) inst = new AudioManager(); return inst; }
