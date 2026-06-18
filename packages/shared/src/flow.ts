import { WORLD, GRID } from './constants';
import type { Obstacle, Tower, Core } from './types';

/**
 * Server-style Flow-Field (vector field) pathfinding toward the Core.
 *
 * A* per-zombie would melt the CPU with a 360° horde, so instead we run ONE
 * Dijkstra integration pass over the grid (goal = Core, distance 0) and store a
 * direction vector per cell. Every zombie just samples the vector under it — O(1).
 *
 * Towers add traversal COST (not a hard wall): if walking around is a short
 * detour the field routes around them; if a tower sits on the cheapest path the
 * field points straight at it and the zombie attacks it. Rebuilt only when the
 * structure layout changes (build / upgrade / destroy).
 */
const INF = 1e9;

export class FlowField {
  readonly cols = Math.ceil(WORLD.width / GRID);
  readonly rows = Math.ceil(WORLD.height / GRID);
  private readonly n = this.cols * this.rows;
  private baseCost: Float64Array;        // static: 1, or INF for obstacles
  private cost: Float64Array;            // dynamic: base + tower block cost
  private integration: Float64Array;
  private fx: Float64Array;
  private fy: Float64Array;
  private core!: Core;

  constructor() {
    this.baseCost = new Float64Array(this.n).fill(1);
    this.cost = new Float64Array(this.n);
    this.integration = new Float64Array(this.n);
    this.fx = new Float64Array(this.n);
    this.fy = new Float64Array(this.n);
  }

  private idx(c: number, r: number): number { return r * this.cols + c; }
  private cellX(x: number): number { return Math.min(this.cols - 1, Math.max(0, Math.floor(x / GRID))); }
  private cellY(y: number): number { return Math.min(this.rows - 1, Math.max(0, Math.floor(y / GRID))); }

  /** One-time: bake impassable static obstacles + remember the Core goal. */
  setStatic(obstacles: Obstacle[], core: Core): void {
    this.core = core;
    this.baseCost.fill(1);
    for (const o of obstacles) {
      const c0 = this.cellX(o.x), c1 = this.cellX(o.x + o.w);
      const r0 = this.cellY(o.y), r1 = this.cellY(o.y + o.h);
      for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) this.baseCost[this.idx(c, r)] = INF;
    }
  }

  /** Rebuild the field. Call when towers change (build/upgrade/destroy). */
  rebuild(towers: Tower[], blockCost: (t: Tower) => number): void {
    this.cost.set(this.baseCost);
    for (const t of towers) {
      if (!t.active) continue;
      const i = this.idx(this.cellX(t.x), this.cellY(t.y));
      if (this.cost[i] < INF) this.cost[i] += blockCost(t);
    }
    this.dijkstra();
    this.buildVectors();
  }

  private dijkstra(): void {
    const integ = this.integration; integ.fill(INF);
    // Binary min-heap of [dist, idx].
    const heap: number[] = []; // flattened pairs
    const push = (d: number, i: number) => {
      heap.push(d, i); let c = heap.length / 2 - 1;
      while (c > 0) { const p = (Math.floor((c - 1) / 2)); if (heap[p * 2] <= heap[c * 2]) break;
        [heap[p * 2], heap[c * 2]] = [heap[c * 2], heap[p * 2]]; [heap[p * 2 + 1], heap[c * 2 + 1]] = [heap[c * 2 + 1], heap[p * 2 + 1]]; c = p; }
    };
    const pop = (): [number, number] => {
      const d = heap[0], i = heap[1]; const last = heap.length / 2 - 1;
      heap[0] = heap[last * 2]; heap[1] = heap[last * 2 + 1]; heap.length -= 2;
      let p = 0; const len = heap.length / 2;
      for (;;) { const l = p * 2 + 1, r = p * 2 + 2; let s = p;
        if (l < len && heap[l * 2] < heap[s * 2]) s = l; if (r < len && heap[r * 2] < heap[s * 2]) s = r;
        if (s === p) break;
        [heap[p * 2], heap[s * 2]] = [heap[s * 2], heap[p * 2]]; [heap[p * 2 + 1], heap[s * 2 + 1]] = [heap[s * 2 + 1], heap[p * 2 + 1]]; p = s; }
      return [d, i];
    };
    // Seed: all cells overlapping the Core are goals (distance 0).
    const cc = this.cellX(this.core.x), cr = this.cellY(this.core.y);
    const span = Math.ceil(this.core.radius / GRID);
    for (let r = cr - span; r <= cr + span; r++) for (let c = cc - span; c <= cc + span; c++) {
      if (c < 0 || r < 0 || c >= this.cols || r >= this.rows) continue;
      const i = this.idx(c, r); if (this.cost[i] >= INF) continue; integ[i] = 0; push(0, i);
    }
    const SQ2 = Math.SQRT2;
    while (heap.length) {
      const [d, i] = pop();
      if (d > integ[i]) continue;
      const c = i % this.cols, r = (i - c) / this.cols;
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
        if (!dc && !dr) continue;
        const nc = c + dc, nr = r + dr; if (nc < 0 || nr < 0 || nc >= this.cols || nr >= this.rows) continue;
        const ni = this.idx(nc, nr); const ec = this.cost[ni]; if (ec >= INF) continue;
        const nd = d + ec * (dc && dr ? SQ2 : 1);
        if (nd < integ[ni]) { integ[ni] = nd; push(nd, ni); }
      }
    }
  }

  private buildVectors(): void {
    const integ = this.integration;
    for (let r = 0; r < this.rows; r++) for (let c = 0; c < this.cols; c++) {
      const i = this.idx(c, r); this.fx[i] = 0; this.fy[i] = 0;
      if (integ[i] >= INF) continue;
      let best = integ[i], bc = 0, br = 0;
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
        if (!dc && !dr) continue;
        const nc = c + dc, nr = r + dr; if (nc < 0 || nr < 0 || nc >= this.cols || nr >= this.rows) continue;
        const v = integ[this.idx(nc, nr)];
        if (v < best) { best = v; bc = dc; br = dr; }
      }
      const l = Math.hypot(bc, br) || 1; this.fx[i] = bc / l; this.fy[i] = br / l;
    }
  }

  /** Direction a zombie at (x,y) should travel. {0,0} means "no path — fall back". */
  sample(x: number, y: number): { x: number; y: number } {
    const i = this.idx(this.cellX(x), this.cellY(y));
    return { x: this.fx[i], y: this.fy[i] };
  }
}
