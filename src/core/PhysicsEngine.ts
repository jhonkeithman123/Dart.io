/**
 * 2D circle-vs-AABB / circle-vs-circle collision engine (§7.2).
 * Combat happens on X–Z; Y is purely visual. All functions are pure-ish and
 * deterministic so they can run unmodified on an authoritative server.
 */

import type { AABB, Vec2 } from './types';
import { PHYSICS } from './constants';

export interface BoxHit {
  hit: boolean;
  nx: number;
  nz: number;
  depth: number;
}

function closestPoint(pos: Vec2, box: AABB): Vec2 {
  return {
    x: Math.max(box.minX, Math.min(pos.x, box.maxX)),
    z: Math.max(box.minZ, Math.min(pos.z, box.maxZ)),
  };
}

/**
 * Resolve a circle against one AABB. When `resolve` is true the circle's
 * position is displaced outward by the penetration depth (smooth wall sliding).
 */
export function circleVsBox(pos: Vec2, radius: number, box: AABB, resolve: boolean): BoxHit {
  const c = closestPoint(pos, box);
  let dx = pos.x - c.x;
  let dz = pos.z - c.z;
  const d2 = dx * dx + dz * dz;

  if (d2 > radius * radius) {
    return { hit: false, nx: 0, nz: 0, depth: 0 };
  }

  let nx: number;
  let nz: number;
  let depth: number;

  if (d2 > 1e-10) {
    const d = Math.sqrt(d2);
    nx = dx / d;
    nz = dz / d;
    depth = radius - d;
  } else {
    // Center is inside the box: eject along the minimum-overlap axis.
    const left = pos.x - box.minX;
    const right = box.maxX - pos.x;
    const top = pos.z - box.minZ;
    const bottom = box.maxZ - pos.z;
    const min = Math.min(left, right, top, bottom);
    if (min === left) { nx = -1; nz = 0; depth = left + radius; }
    else if (min === right) { nx = 1; nz = 0; depth = right + radius; }
    else if (min === top) { nx = 0; nz = -1; depth = top + radius; }
    else { nx = 0; nz = 1; depth = bottom + radius; }
  }

  if (resolve) {
    pos.x += nx * depth;
    pos.z += nz * depth;
  }
  return { hit: true, nx, nz, depth };
}

/** Push an entity circle out of every overlapping wall (2 iterations for corners). */
export function resolveEntityWalls(pos: Vec2, radius: number, walls: readonly AABB[]): boolean {
  let collided = false;
  for (let pass = 0; pass < 2; pass++) {
    let any = false;
    for (const w of walls) {
      const r = circleVsBox(pos, radius, w, true);
      if (r.hit) {
        any = true;
        collided = true;
      }
    }
    if (!any) break;
  }
  return collided;
}

/** Find the first/deepest wall a projectile circle is penetrating. */
export function projectileVsWalls(
  pos: Vec2,
  radius: number,
  walls: readonly AABB[],
): BoxHit {
  let best: BoxHit = { hit: false, nx: 0, nz: 0, depth: 0 };
  for (const w of walls) {
    const r = circleVsBox(pos, radius, w, false);
    if (r.hit && r.depth > best.depth) best = r;
  }
  return best;
}

/** Reflect velocity about a surface normal: v' = v - 2(v·n)n. */
export function reflect(v: Vec2, nx: number, nz: number): void {
  const dot = v.x * nx + v.z * nz;
  v.x -= 2 * dot * nx;
  v.z -= 2 * dot * nz;
}

export function circlesOverlap(a: Vec2, ra: number, b: Vec2, rb: number): boolean {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  const r = ra + rb;
  return dx * dx + dz * dz <= r * r;
}

export function distance(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

/** Number of integration sub-steps required to avoid tunneling at this speed. */
export function subStepsFor(speed: number): number {
  return speed > PHYSICS.SUBSTEP_SPEED ? 2 : 1;
}
