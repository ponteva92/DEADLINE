import { TOWERS } from '../sim/constants';
import { getAudio } from '../audio/AudioManager';

export interface HudState {
  phase: 'day' | 'night';
  day: number; dayTimer: number;
  wood: number; metal: number; tech: number; stone: number;
  hp: number; maxHp: number; core: number; coreMax: number;
  gameOver: boolean;
}
export interface DomActions { startNight: () => void; restart: () => void; }
export interface TowerPanel { name: string; level: number; max: number; stats: string; cost: string; affordable: boolean; maxed: boolean; repairCost: string; canRepair: boolean; sellRefund: string; }
export type CharId = 'heikki' | 'shane';

const RES = [
  { key: 'wood', icon: '🪵' }, { key: 'metal', icon: '⚙️' },
  { key: 'tech', icon: '🔩' }, { key: 'stone', icon: '🪨' },
];
const TOWER_ICON = ['🔫', '💥', '❄️', '☣️', '⚡', '🛡️'];

function avatarSvg(id: CharId): string {
  if (id === 'heikki') {
    return `<svg viewBox="0 0 120 140" xmlns="http://www.w3.org/2000/svg">
      <ellipse cx="60" cy="128" rx="34" ry="8" fill="rgba(0,0,0,.5)"/>
      <line x1="44" y1="34" x2="34" y2="12" stroke="#6ff0ff" stroke-width="3"/><circle cx="34" cy="11" r="4" fill="#6ff0ff"/>
      <rect x="26" y="44" width="68" height="62" rx="16" fill="#123a3a"/>
      <rect x="31" y="49" width="58" height="52" rx="13" fill="#2f8f8f"/>
      <rect x="38" y="40" width="44" height="20" rx="9" fill="#123a3a"/><rect x="44" y="44" width="32" height="12" rx="6" fill="#1f6a6a"/>
      <circle cx="60" cy="30" r="15" fill="#123a3a"/><circle cx="60" cy="30" r="11" fill="#c9a36b"/><rect x="50" y="26" width="20" height="6" rx="3" fill="#6ff0ff"/>
      <rect x="20" y="66" width="14" height="34" rx="7" fill="#1f6a6a"/><rect x="86" y="66" width="14" height="34" rx="7" fill="#1f6a6a"/></svg>`;
  }
  return `<svg viewBox="0 0 120 140" xmlns="http://www.w3.org/2000/svg">
    <ellipse cx="60" cy="130" rx="26" ry="7" fill="rgba(0,0,0,.5)"/>
    <rect x="38" y="50" width="44" height="58" rx="18" fill="#4a2410"/><rect x="42" y="54" width="36" height="50" rx="15" fill="#e07b3a"/>
    <rect x="54" y="60" width="12" height="30" fill="#fff"/><rect x="46" y="68" width="28" height="10" fill="#fff"/>
    <rect x="57" y="62" width="6" height="26" fill="#ff5a5a"/><rect x="48" y="70" width="24" height="6" fill="#ff5a5a"/>
    <circle cx="60" cy="36" r="13" fill="#4a2410"/><circle cx="60" cy="36" r="9.5" fill="#d9a86b"/><path d="M46 33 q14 -12 28 0 z" fill="#ffd24a"/>
    <rect x="30" y="68" width="11" height="30" rx="5" fill="#b85e26"/><rect x="79" y="68" width="11" height="30" rx="5" fill="#b85e26"/></svg>`;
}

class Dom {
  private root: HTMLDivElement;
  private lobby!: HTMLDivElement;
  private hud!: HTMLDivElement;
  private dock!: HTMLDivElement;
  private info!: HTMLDivElement;
  private over!: HTMLDivElement;
  private el: Record<string, HTMLElement> = {};
  private dockBtns: HTMLDivElement[] = [];

  private char: CharId = 'heikki';
  private started = false;
  private selected = -1;
  private buildOpen = false;
  private shooting = false;
  private interacting = false;
  private actions: DomActions = { startNight: () => {}, restart: () => {} };
  private towerPanel!: HTMLDivElement;
  private onUpg: () => void = () => {};
  private onRepair: () => void = () => {};
  private onSell: () => void = () => {};
  private netChoice = false;

  constructor() {
    this.injectStyle();
    this.root = document.createElement('div'); this.root.id = 'nf-ui';
    document.body.appendChild(this.root);
    this.buildLobby(); this.buildHud(); this.buildDock(); this.buildActions(); this.buildGameOver(); this.buildTowerPanel();
  }

  getCharacter(): CharId { return this.char; }
  isStarted(): boolean { return this.started; }
  selectedTower(): number { return this.selected; }
  isShooting(): boolean { return this.shooting; }
  isInteracting(): boolean { return this.interacting; }
  bind(a: DomActions): void { this.actions = a; }

  update(s: HudState): void {
    if (!this.started) return;
    for (const r of RES) this.el[r.key].textContent = String((s as unknown as Record<string, number>)[r.key]);
    const hpf = Math.max(0, s.hp / s.maxHp), cf = Math.max(0, s.core / s.coreMax);
    (this.el.hpfill as HTMLElement).style.width = `${hpf * 100}%`;
    (this.el.corefill as HTMLElement).style.width = `${cf * 100}%`;
    this.el.hptxt.textContent = `${Math.ceil(s.hp)}`; this.el.coretxt.textContent = `${Math.ceil(s.core)}`;
    const day = s.phase === 'day';
    this.el.phase.textContent = day ? `DAY ${s.day} · night in ${Math.ceil(s.dayTimer)}s` : `NIGHT ${s.day} · survive`;
    this.el.phase.className = 'nf-pill ' + (day ? 'nf-day' : 'nf-night');
    (this.el.skip as HTMLElement).style.display = day ? 'inline-flex' : 'none';
    (this.el.build as HTMLElement).style.display = day ? 'flex' : 'none';
    if (!day) { this.buildOpen = false; if (this.selected >= 0) this.select(-1); }
    this.dock.style.display = (day && this.buildOpen) ? 'flex' : 'none';
    for (let k = 0; k < TOWERS.length; k++) {
      const c = TOWERS[k].cost;
      const ok = s.wood >= c.wood && s.metal >= c.metal && s.tech >= c.tech && s.stone >= c.stone;
      this.dockBtns[k].classList.toggle('nf-dis', !ok);
    }
    this.over.style.display = s.gameOver ? 'flex' : 'none';
    if (s.gameOver) this.el.overtxt.textContent = `Reached Day ${s.day}`;
  }

  private select(k: number): void {
    this.selected = this.selected === k ? -1 : k;
    this.dockBtns.forEach((b, i) => b.classList.toggle('nf-sel', i === this.selected));
    if (this.selected < 0) { this.info.style.display = 'none'; return; }
    const d = TOWERS[this.selected];
    this.info.style.display = 'block';
    this.el.infoName.textContent = d.name;
    const cost = `${d.cost.wood}🪵${d.cost.metal ? ' ' + d.cost.metal + '⚙️' : ''}${d.cost.stone ? ' ' + d.cost.stone + '🪨' : ''}${d.cost.tech ? ' ' + d.cost.tech + '🔩' : ''}`;
    const info = d.gun ? `<span>DMG ${d.damage}</span><span>RNG ${d.range}</span><span>HP ${d.baseHp}</span>` : d.slow > 0 ? `<span>SLOW ${(d.slow * 100) | 0}%</span><span>RNG ${d.range}</span><span>HP ${d.baseHp}</span>` : `<span>Barrier</span><span>HP ${d.baseHp}</span>`;
    this.el.infoStats.innerHTML = info + `<span>${cost}</span>`;
  }

  // ---- builders ---------------------------------------------------------
  private buildLobby(): void {
    this.lobby = div('nf-lobby');
    this.lobby.innerHTML = `<div class="nf-logo">DEADLINE</div><div class="nf-sub">Choose your survivor</div><div class="nf-cards"></div><div class="nf-row"><button class="nf-deploy nf-pick" id="nf-solo" disabled>PLAY SOLO</button><button class="nf-deploy nf-pick" id="nf-lan" disabled>LAN CO-OP</button></div>`;
    const cards = this.lobby.querySelector('.nf-cards') as HTMLDivElement;
    const solo = this.lobby.querySelector('#nf-solo') as HTMLButtonElement;
    const lan = this.lobby.querySelector('#nf-lan') as HTMLButtonElement;
    const make = (id: CharId, name: string, role: string) => {
      const c = div('nf-card');
      c.innerHTML = `<div class="nf-av">${avatarSvg(id)}</div><div class="nf-name">${name}</div><div class="nf-role">${role}</div>`;
      c.onclick = () => { this.char = id; cards.querySelectorAll('.nf-card').forEach((n) => n.classList.remove('nf-active')); c.classList.add('nf-active'); solo.disabled = false; lan.disabled = false; getAudio().init(); getAudio().play('click'); };
      return c;
    };
    cards.appendChild(make('heikki', 'HEIKKI', 'Heavy-duty tech survivor'));
    cards.appendChild(make('shane', 'SHANE', 'Nimble scout-medic'));
    const start = (net: boolean) => { this.netChoice = net; this.started = true; this.lobby.style.display = 'none'; this.hud.style.display = 'block'; getAudio().init(); getAudio().setPhase('day'); getAudio().play('click'); };
    solo.onclick = () => start(false);
    lan.onclick = () => start(true);
    this.root.appendChild(this.lobby);
  }

  private buildHud(): void {
    this.hud = div('nf-hud'); this.hud.style.display = 'none';
    const chips = RES.map((r) => `<div class="nf-chip"><span>${r.icon}</span><b id="nf-${r.key}">0</b></div>`).join('');
    this.hud.innerHTML = `
      <div class="nf-res">${chips}</div>
      <div class="nf-bars">
        <div class="nf-bar"><i>HP</i><div class="nf-track"><div class="nf-fill hp" id="nf-hpfill"></div></div><u id="nf-hptxt">0</u></div>
        <div class="nf-bar"><i>CORE</i><div class="nf-track"><div class="nf-fill core" id="nf-corefill"></div></div><u id="nf-coretxt">0</u></div>
      </div>
      <div class="nf-top"><div class="nf-pill nf-day" id="nf-phase">DAY 1</div><button class="nf-skip" id="nf-skip">⚔ START NIGHT</button></div>`;
    this.root.appendChild(this.hud);
    for (const k of ['wood', 'metal', 'tech', 'stone', 'hpfill', 'corefill', 'hptxt', 'coretxt', 'phase', 'skip']) this.el[k] = this.hud.querySelector('#nf-' + k) as HTMLElement;
    (this.el.skip as HTMLButtonElement).onclick = () => { getAudio().play('click'); this.actions.startNight(); };
  }

  private buildDock(): void {
    this.info = div('nf-info'); this.info.style.display = 'none';
    this.info.innerHTML = `<b id="nf-infoname"></b><div class="nf-infostats" id="nf-infostats"></div><span class="nf-hint">Tap a tile to place · tap again to cancel</span>`;
    this.el.infoName = this.info.querySelector('#nf-infoname') as HTMLElement;
    this.el.infoStats = this.info.querySelector('#nf-infostats') as HTMLElement;
    this.root.appendChild(this.info);
    this.dock = div('nf-dock'); this.dock.style.display = 'none';
    for (let k = 0; k < TOWERS.length; k++) {
      const d = TOWERS[k]; const b = div('nf-tbtn');
      b.innerHTML = `<span class="nf-ticon">${TOWER_ICON[k]}</span><span class="nf-tname">${d.name}</span>`;
      b.onclick = () => { getAudio().play('click'); this.select(k); };
      this.dockBtns.push(b); this.dock.appendChild(b);
    }
    this.root.appendChild(this.dock);
  }

  private buildActions(): void {
    const wrap = div('nf-actions');
    wrap.innerHTML = `<button class="nf-act nf-bld" id="nf-build">🔨</button><button class="nf-act nf-int" id="nf-interact">✋</button><button class="nf-act nf-sht" id="nf-shoot">🔥</button>`;
    this.root.appendChild(wrap);
    this.el.build = wrap.querySelector('#nf-build') as HTMLElement;
    const shoot = wrap.querySelector('#nf-shoot') as HTMLElement;
    const interact = wrap.querySelector('#nf-interact') as HTMLElement;
    const hold = (elm: HTMLElement, set: (v: boolean) => void) => {
      const on = (e: Event) => { e.preventDefault(); set(true); elm.classList.add('nf-press'); };
      const off = () => { set(false); elm.classList.remove('nf-press'); };
      elm.addEventListener('pointerdown', on); elm.addEventListener('pointerup', off);
      elm.addEventListener('pointerleave', off); elm.addEventListener('pointercancel', off);
    };
    hold(shoot, (v) => { this.shooting = v; });
    hold(interact, (v) => { this.interacting = v; });
    (this.el.build as HTMLButtonElement).onclick = () => {
      getAudio().play('click'); this.buildOpen = !this.buildOpen;
      if (!this.buildOpen) this.select(-1);
      (this.el.build as HTMLElement).classList.toggle('nf-press', this.buildOpen);
    };
  }

  bindUpgrade(cb: () => void): void { this.onUpg = cb; }
  bindRepair(cb: () => void): void { this.onRepair = cb; }
  bindSell(cb: () => void): void { this.onSell = cb; }
  wantsNet(): boolean { return this.netChoice; }

  setTowerPanel(p: TowerPanel | null): void {
    if (!p) { this.towerPanel.style.display = 'none'; return; }
    this.towerPanel.style.display = 'flex';
    this.el.twName.textContent = `${p.name} · Lvl ${p.level}/${p.max}`;
    this.el.twPips.innerHTML = Array.from({ length: p.max }, (_v, i) => `<span class="${i < p.level ? 'on' : ''}"></span>`).join('');
    this.el.twStats.innerHTML = p.stats;
    const up = this.el.twUp as HTMLButtonElement;
    if (p.maxed) { up.textContent = 'MAX LEVEL'; up.disabled = true; }
    else { up.textContent = `UPGRADE  ${p.cost}`; up.disabled = !p.affordable; }
    const rp = this.el.twRep as HTMLButtonElement;
    rp.textContent = p.canRepair ? `REPAIR  ${p.repairCost}` : 'REPAIR';
    rp.disabled = !p.canRepair;
    this.el.twSell.textContent = `SELL  +${p.sellRefund}`;
  }

  private buildTowerPanel(): void {
    this.towerPanel = div('nf-tower'); this.towerPanel.style.display = 'none';
    this.towerPanel.innerHTML = `<button class="nf-x" id="nf-tx">✕</button><b id="nf-twn"></b><div class="nf-pips" id="nf-twp"></div><div class="nf-infostats" id="nf-tws"></div><button class="nf-upg" id="nf-twu"></button><div class="nf-row"><button class="nf-rep" id="nf-twr"></button><button class="nf-sell" id="nf-twsell"></button></div>`;
    this.root.appendChild(this.towerPanel);
    (this.towerPanel.querySelector('#nf-tx') as HTMLButtonElement).onclick = () => { getAudio().play('click'); this.setTowerPanel(null); };
    (this.towerPanel.querySelector('#nf-twu') as HTMLButtonElement).onclick = () => { this.onUpg(); };
    (this.towerPanel.querySelector('#nf-twr') as HTMLButtonElement).onclick = () => { this.onRepair(); };
    (this.towerPanel.querySelector('#nf-twsell') as HTMLButtonElement).onclick = () => { this.onSell(); };
    this.el.twName = this.towerPanel.querySelector('#nf-twn') as HTMLElement;
    this.el.twPips = this.towerPanel.querySelector('#nf-twp') as HTMLElement;
    this.el.twStats = this.towerPanel.querySelector('#nf-tws') as HTMLElement;
    this.el.twUp = this.towerPanel.querySelector('#nf-twu') as HTMLElement;
    this.el.twRep = this.towerPanel.querySelector('#nf-twr') as HTMLElement;
    this.el.twSell = this.towerPanel.querySelector('#nf-twsell') as HTMLElement;
  }

  private buildGameOver(): void {
    this.over = div('nf-over'); this.over.style.display = 'none';
    this.over.innerHTML = `<div class="nf-overcard"><b>CORE DESTROYED</b><span id="nf-overtxt"></span><button class="nf-deploy" id="nf-restart">RESTART</button></div>`;
    this.el.overtxt = this.over.querySelector('#nf-overtxt') as HTMLElement;
    (this.over.querySelector('#nf-restart') as HTMLButtonElement).onclick = () => { getAudio().play('click'); this.over.style.display = 'none'; this.actions.restart(); };
    this.root.appendChild(this.over);
  }

  private injectStyle(): void {
    if (document.getElementById('nf-style')) return;
    const s = document.createElement('style'); s.id = 'nf-style'; s.textContent = CSS; document.head.appendChild(s);
  }
}

function div(cls: string): HTMLDivElement { const d = document.createElement('div'); d.className = cls; return d; }

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@600;800;900&display=swap');
#nf-ui{position:fixed;inset:0;z-index:20;pointer-events:none;font-family:'Inter','Segoe UI',system-ui,sans-serif;color:#eaf2ff;-webkit-user-select:none;user-select:none}
#nf-ui button,#nf-ui .nf-card,#nf-ui .nf-tbtn{pointer-events:auto;cursor:pointer;font-family:inherit}
.nf-lobby{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;background:radial-gradient(120% 90% at 50% 0%,#13202e 0%,#070b11 70%);pointer-events:auto}
.nf-logo{font-size:64px;font-weight:900;letter-spacing:10px;color:#eaf6ff;text-shadow:0 0 24px rgba(110,240,255,.55)}
.nf-sub{font-size:18px;color:#8fb3cc;letter-spacing:3px;text-transform:uppercase}
.nf-cards{display:flex;gap:26px;margin-top:8px}
.nf-card{width:230px;padding:20px;border-radius:22px;text-align:center;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.12);backdrop-filter:blur(14px);box-shadow:0 16px 50px rgba(0,0,0,.5);transition:transform .12s,border-color .12s,box-shadow .12s}
.nf-card:hover{transform:translateY(-6px)}
.nf-card.nf-active{border-color:#6ff0ff;box-shadow:0 0 0 2px #6ff0ff,0 18px 60px rgba(110,240,255,.35)}
.nf-av svg{width:150px;height:175px;filter:drop-shadow(0 8px 18px rgba(0,0,0,.6))}
.nf-name{font-size:26px;font-weight:800;letter-spacing:3px;margin-top:6px}.nf-role{font-size:13px;color:#9fb6cc;margin-top:4px}
.nf-deploy{margin-top:10px;padding:16px 60px;font-size:22px;font-weight:800;letter-spacing:3px;border:none;border-radius:16px;color:#04121a;background:linear-gradient(180deg,#7df0ff,#27b6cf);box-shadow:0 10px 30px rgba(110,240,255,.45);transition:filter .12s,transform .08s}
.nf-deploy:hover{filter:brightness(1.08)}.nf-deploy:active{transform:scale(.97)}.nf-deploy:disabled{filter:grayscale(.8) brightness(.6);cursor:not-allowed;box-shadow:none}
.nf-hud{position:absolute;inset:0}
.nf-res{position:absolute;top:14px;left:14px;display:flex;gap:9px;flex-wrap:wrap;max-width:60vw}
.nf-chip{display:flex;align-items:center;gap:7px;padding:8px 13px;border-radius:14px;font-size:17px;font-weight:800;background:linear-gradient(180deg,rgba(30,42,58,.85),rgba(16,22,32,.85));border:1px solid rgba(255,255,255,.14);backdrop-filter:blur(10px);box-shadow:0 6px 18px rgba(0,0,0,.45),inset 0 1px 0 rgba(255,255,255,.18)}
.nf-bars{position:absolute;top:62px;left:14px;display:flex;flex-direction:column;gap:6px}
.nf-bar{display:flex;align-items:center;gap:8px}.nf-bar i{width:42px;font-style:normal;font-size:12px;color:#9fb6cc;letter-spacing:1px}
.nf-track{width:220px;height:18px;border-radius:10px;background:rgba(10,14,20,.8);border:1px solid rgba(255,255,255,.14);overflow:hidden;box-shadow:inset 0 2px 6px rgba(0,0,0,.6)}
.nf-fill{height:100%;border-radius:9px;transition:width .15s}.nf-fill.hp{background:linear-gradient(90deg,#53e07a,#9bf5b8)}.nf-fill.core{background:linear-gradient(90deg,#2b7bff,#7df0ff)}
.nf-bar u{width:42px;text-decoration:none;font-size:13px;font-weight:700;color:#cfe2ff}
.nf-top{position:absolute;top:14px;left:50%;transform:translateX(-50%);display:flex;flex-direction:column;align-items:center;gap:8px}
.nf-pill{padding:9px 22px;border-radius:999px;font-weight:800;letter-spacing:1px;border:1px solid rgba(255,255,255,.16);backdrop-filter:blur(10px);box-shadow:0 6px 18px rgba(0,0,0,.45)}
.nf-day{background:linear-gradient(180deg,rgba(70,58,20,.85),rgba(40,32,12,.85));color:#ffe6a0}.nf-night{background:linear-gradient(180deg,rgba(24,34,72,.9),rgba(12,18,40,.9));color:#9ab8ff}
.nf-skip{padding:11px 22px;font-size:16px;font-weight:800;letter-spacing:1px;border:none;border-radius:13px;color:#1a1206;background:linear-gradient(180deg,#ffcf7a,#f29d2e);box-shadow:0 8px 24px rgba(242,157,46,.5);transition:transform .08s;animation:nfpulse 1.8s ease-in-out infinite}
.nf-skip:active{transform:scale(.95)}
@keyframes nfpulse{0%,100%{box-shadow:0 8px 24px rgba(242,157,46,.4)}50%{box-shadow:0 8px 34px rgba(242,157,46,.85)}}
.nf-dock{position:absolute;bottom:150px;left:50%;transform:translateX(-50%);display:flex;gap:14px}
.nf-tbtn{display:flex;flex-direction:column;align-items:center;gap:2px;width:100px;height:84px;justify-content:center;border-radius:18px;background:linear-gradient(180deg,rgba(30,42,58,.92),rgba(14,20,30,.94));border:1px solid rgba(255,255,255,.14);backdrop-filter:blur(12px);box-shadow:0 10px 28px rgba(0,0,0,.5),inset 0 1px 0 rgba(255,255,255,.15);transition:transform .1s,border-color .1s}
.nf-tbtn:active{transform:scale(.95)}.nf-tbtn.nf-sel{border-color:#53e07a;box-shadow:0 0 0 2px #53e07a,0 10px 28px rgba(83,224,122,.4)}.nf-tbtn.nf-dis{filter:grayscale(.7) brightness(.6)}
.nf-ticon{font-size:26px}.nf-tname{font-size:15px;font-weight:800;letter-spacing:1px}
.nf-info{position:absolute;bottom:246px;left:50%;transform:translateX(-50%);min-width:240px;text-align:center;padding:12px 18px;border-radius:16px;background:rgba(16,24,36,.7);border:1px solid rgba(255,255,255,.16);backdrop-filter:blur(16px);box-shadow:0 14px 40px rgba(0,0,0,.55)}
.nf-info b{font-size:20px;letter-spacing:1px}.nf-infostats{display:flex;gap:12px;justify-content:center;flex-wrap:wrap;margin:6px 0;color:#bcd;font-size:14px;font-weight:700}.nf-hint{font-size:12px;color:#8fb3cc}
.nf-actions{position:absolute;right:22px;bottom:26px;width:230px;height:230px;pointer-events:none}
.nf-act{position:absolute;border:none;border-radius:50%;color:#fff;font-size:30px;backdrop-filter:blur(8px);transition:transform .08s,box-shadow .12s;display:flex;align-items:center;justify-content:center}
.nf-act.nf-press{transform:scale(.9)}
.nf-sht{right:0;bottom:0;width:122px;height:122px;font-size:46px;background:radial-gradient(circle at 35% 30%,#ff8b6a,#d83a2a);box-shadow:0 0 28px rgba(255,90,60,.6),inset 0 3px 8px rgba(255,255,255,.35)}
.nf-int{right:120px;bottom:36px;width:78px;height:78px;background:radial-gradient(circle at 35% 30%,#7df0a0,#27a35a);box-shadow:0 0 22px rgba(83,224,122,.55),inset 0 2px 6px rgba(255,255,255,.3)}
.nf-bld{right:40px;bottom:124px;width:78px;height:78px;background:radial-gradient(circle at 35% 30%,#9ab8ff,#3a5fcf);box-shadow:0 0 22px rgba(90,130,255,.55),inset 0 2px 6px rgba(255,255,255,.3)}
.nf-over{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(4,7,12,.78);pointer-events:auto}
.nf-overcard{display:flex;flex-direction:column;align-items:center;gap:14px;padding:38px 54px;border-radius:24px;text-align:center;background:rgba(20,12,16,.8);border:1px solid rgba(255,120,120,.3);backdrop-filter:blur(16px)}
.nf-overcard b{font-size:40px;font-weight:900;letter-spacing:3px;color:#ff8a8a;text-shadow:0 0 22px rgba(255,80,80,.5)}
.nf-tower{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);display:flex;flex-direction:column;align-items:center;gap:10px;min-width:260px;padding:22px 26px;border-radius:20px;background:rgba(14,22,34,.82);border:1px solid rgba(255,255,255,.18);backdrop-filter:blur(18px);box-shadow:0 18px 50px rgba(0,0,0,.6);pointer-events:auto}
.nf-tower b{font-size:22px;letter-spacing:1px}
.nf-x{position:absolute;top:8px;right:10px;width:30px;height:30px;border:none;border-radius:50%;background:rgba(255,255,255,.1);color:#cfe2ff;font-size:15px}
.nf-pips{display:flex;gap:7px}.nf-pips span{width:14px;height:14px;border-radius:50%;background:rgba(255,255,255,.15);border:1px solid rgba(255,255,255,.25)}.nf-pips span.on{background:#ffe066;box-shadow:0 0 10px rgba(255,224,102,.8)}
.nf-upg{padding:13px 26px;font-size:17px;font-weight:800;letter-spacing:1px;border:none;border-radius:13px;color:#04121a;background:linear-gradient(180deg,#9bf5b8,#27b06a);box-shadow:0 8px 22px rgba(39,176,106,.45);transition:transform .08s}
.nf-upg:active{transform:scale(.96)}.nf-upg:disabled{filter:grayscale(.7) brightness(.6);cursor:not-allowed}
.nf-row{display:flex;gap:12px}
.nf-rep{padding:11px 18px;font-size:15px;font-weight:800;border:none;border-radius:11px;color:#04121a;background:linear-gradient(180deg,#9bd0ff,#3a7fd0);box-shadow:0 6px 16px rgba(58,127,208,.4)}
.nf-rep:disabled{filter:grayscale(.7) brightness(.6);cursor:not-allowed}
.nf-sell{padding:11px 18px;font-size:15px;font-weight:800;border:none;border-radius:11px;color:#2a1206;background:linear-gradient(180deg,#ffd166,#e0962a);box-shadow:0 6px 16px rgba(224,150,42,.4)}
@media (max-width:600px){.nf-logo{font-size:44px}.nf-cards{gap:14px}.nf-card{width:160px;padding:12px}.nf-av svg{width:110px;height:128px}.nf-track{width:150px}}
`;

let inst: Dom | null = null;
export function getDom(): Dom { if (!inst) inst = new Dom(); return inst; }
export type { Dom };
