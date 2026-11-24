/**
 * Ballistic aim solving (§7.3A): quadratic intercept with velocity lead,
 * plus hard-AI wall-bounce bank-shot raycasting.
 */

import type { AABB, Entity, Vec2 } from '../core/types';
import type { World } from '../core/World';
import { AI_MATRIX } from '../core/constants';
import { weaponProfile } from '../core/UpgradePool';

/** Solve the quadratic intercept equation and return the predicted aim point. */
export function quadraticIntercept(
  from: Vec2,
  target: Vec2,
  targetVel: Vec2,
  speed: number,
  leadFactor: number,
): Vec2 | null {
  const dx = target.x - from.x;
  const dz = target.z - from.z;
  const a = targetVel.x * targetVel.x + targetVel.z * targetVel.z - speed * speed;
  const b = 2 * (dx * targetVel.x + dz * targetVel.z);
  const c = dx * dx + dz * dz;

  let t: number;
  if (Math.abs(a) < 1e-6) {
    if (Math.abs(b) < 1e-6) return { x: target.x, z: target.z };
    t = -c / b;
  } else {
    const disc = b * b - 4 * a * c;
    if (disc < 0) return { x: target.x, z: target.z };
    const sq = Math.sqrt(disc);
    const t1 = (-b - sq) / (2 * a);
    const t2 = (-b + sq) / (2 * a);
    const positives = [t1, t2].filter((v) => v > 0);
    if (positives.length === 0) return { x: target.x, z: target.z };
    t = Math.min(...positives);
  }
  if (!isFinite(t) || t < 0 || t > 4) t = Math.min(2, Math.sqrt(c) / Math.max(1, speed));

  return {
    x: target.x + targetVel.x * t * leadFactor,
    z: target.z + targetVel.z * t * leadFactor,
  };
}

function rayVsBox(origin: Vec2, dx: number, dz: number, maxDist: number, box: AABB): number | null {
  let tmin = 0;
  let tmax = maxDist;
  const invX = Math.abs(dx) < 1e-9 ? 1e9 : 1 / dx;
  const invZ = Math.abs(dz) < 1e-9 ? 1e9 : 1 / dz;
  let t1 = (box.minX - origin.x) * invX;
  let t2 = (box.maxX - origin.x) * invX;
  tmin = Math.max(tmin, Math.min(t1, t2));
  tmax = Math.min(tmax, Math.max(t1, t2));
  t1 = (box.minZ - origin.z) * invZ;
  t2 = (box.maxZ - origin.z) * invZ;
  tmin = Math.max(tmin, Math.min(t1, t2));
  tmax = Math.min(tmax, Math.max(t1, t2));
  return tmax >= tmin && tmin >= 0 && tmin <= maxDist ? tmin : null;
}

export function hasLineOfSight(world: World, from: Vec2, to: Vec2): boolean {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const dist = Math.hypot(dx, dz) || 1;
  const nx = dx / dist;
  const nz = dz / dist;
  for (const wall of world.map.walls) {
    const t = rayVsBox(from, nx, nz, dist - 0.4, wall);
    if (t !== null) return false;
  }
  return true;
}

/** Mirror a point across one of a wall's four planes. */
function mirrorAcrossWall(point: Vec2, wall: AABB, plane: 0 | 1 | 2 | 3): Vec2 {
  switch (plane) {
    case 0: return { x: 2 * wall.minX - point.x, z: point.z };
    case 1: return { x: 2 * wall.maxX - point.x, z: point.z };
    case 2: return { x: point.x, z: 2 * wall.minZ - point.z };
    case 3: return { x: point.x, z: 2 * wall.maxZ - point.z };
  }
}

/**
 * Hard-AI bank shot: if line-of-sight is blocked, mirror the target across the
 * four nearest wall planes and use the first virtual point reachable by a clear ray.
 */
export function solveBankShot(world: World, bot: Entity, target: Entity, baseAim: Vec2): Vec2 {
  if (hasLineOfSight(world, bot.pos, baseAim)) return baseAim;

  const walls = world.map.walls
    .map((w) => ({ w, d: distanceToBox(bot.pos, w) }))
    .filter((x) => x.d < 12)
    .sort((a, b) => a.d - b.d)
    .slice(0, 4)
    .map((x) => x.w);

  for (const wall of walls) {
    for (const plane of [0, 1, 2, 3] as const) {
      const virtual = mirrorAcrossWall(target.pos, wall, plane);
      if (hasLineOfSight(world, bot.pos, virtual)) return virtual;
    }
  }
  return baseAim;
}

function distanceToBox(p: Vec2, b: AABB): number {
  const dx = Math.max(b.minX - p.x, 0, p.x - b.maxX);
  const dz = Math.max(b.minZ - p.z, 0, p.z - b.maxZ);
  return Math.hypot(dx, dz);
}

/** Full aim pipeline: intercept → optional bank shot → difficulty spread jitter. */
export function computeAimPoint(world: World, bot: Entity, target: Entity, rng: () => number): Vec2 {
  const params = AI_MATRIX[bot.difficulty];
  const predicted = quadraticIntercept(
    bot.pos,
    target.pos,
    target.vel,
    Math.max(1, weaponProfile(bot, bot.weapon).speed),
    params.leadFactor,
  ) ?? target.pos;

  let aim = predicted;
  if (params.bankShots && bot.stats.bounce > 0) {
    aim = solveBankShot(world, bot, target, predicted);
  }

  const spread = (params.spreadDeg * Math.PI) / 180;
  const jitter = (rng() * 2 - 1) * spread;
  const dx = aim.x - bot.pos.x;
  const dz = aim.z - bot.pos.z;
  const a = Math.atan2(dz, dx) + jitter;
  const d = Math.hypot(dx, dz) || 1;
  return { x: bot.pos.x + Math.cos(a) * d, z: bot.pos.z + Math.sin(a) * d };
}
