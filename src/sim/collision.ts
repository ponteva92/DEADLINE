import type { Obstacle } from './types';

export function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

/**
 * Push a circle out of an AABB along the contact normal only.
 * Because we resolve along the normal, tangential motion is preserved — i.e.
 * the body SLIDES along walls/corners instead of snagging. Returns the
 * corrected center.
 */
export function resolveCircleAabb(
  cx: number,
  cy: number,
  r: number,
  rect: Obstacle,
): { x: number; y: number } {
  const nearX = clamp(cx, rect.x, rect.x + rect.w);
  const nearY = clamp(cy, rect.y, rect.y + rect.h);
  const dx = cx - nearX;
  const dy = cy - nearY;
  const d2 = dx * dx + dy * dy;

  if (d2 > r * r) return { x: cx, y: cy }; // no overlap

  if (d2 > 0.0001) {
    const d = Math.sqrt(d2);
    const overlap = r - d;
    return { x: cx + (dx / d) * overlap, y: cy + (dy / d) * overlap };
  }

  // Center is inside the rect: eject along the shallowest axis.
  const left = cx - rect.x;
  const right = rect.x + rect.w - cx;
  const top = cy - rect.y;
  const bottom = rect.y + rect.h - cy;
  const m = Math.min(left, right, top, bottom);
  if (m === left) return { x: rect.x - r, y: cy };
  if (m === right) return { x: rect.x + rect.w + r, y: cy };
  if (m === top) return { x: cx, y: rect.y - r };
  return { x: cx, y: rect.y + rect.h + r };
}

/** Tiny deterministic RNG (mulberry32) so spawns can later be network-synced. */
export function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
