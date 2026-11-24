/**
 * Data-driven arena maps. Pure 2D AABBs + spawn nodes (§8).
 * Walls are mirrored into four symmetric quadrants around a central crossroads.
 */

import type { AABB, GameModeId, SpawnPoint, ThemePalette, Vec2 } from './types';
import { ARENA } from './constants';

export interface MapData {
  id: string;
  halfSize: number;
  walls: AABB[];
  spawns: SpawnPoint[];
  center: Vec2;
}

export const THEMES: ThemePalette[] = [
  {
    id: 'classic',
    name: 'Classic Grid',
    floor: 0xf8fafc,
    grid: 0xcbd5e1,
    wallSide: 0x7c93b5,
    wallTop: 0xb9c9de,
    accent: 0x38bdf8,
  },
  {
    id: 'sandstone',
    name: 'Sandstone Ruins',
    floor: 0xf5efe6,
    grid: 0xdccdb8,
    wallSide: 0xc2855a,
    wallTop: 0xd9a978,
    accent: 0xf59e0b,
  },
  {
    id: 'cyber',
    name: 'Cyber Neon',
    floor: 0x0f172a,
    grid: 0x1e293b,
    wallSide: 0x0b1220,
    wallTop: 0x06b6d4,
    accent: 0x22d3ee,
  },
];

function box(
  id: string,
  x0: number,
  z0: number,
  x1: number,
  z1: number,
  kind: AABB['kind'],
  height: number = ARENA.WALL_HEIGHT,
): AABB {
  return {
    id,
    minX: Math.min(x0, x1),
    maxX: Math.max(x0, x1),
    minZ: Math.min(z0, z1),
    maxZ: Math.max(z0, z1),
    height,
    kind,
  };
}

/** Mirror a local [x0,x1] interval by sign (+1 / -1) and sort. */
function span(a: number, b: number, sign: number): [number, number] {
  const p = a * sign;
  const q = b * sign;
  return [Math.min(p, q), Math.max(p, q)];
}

function insideWall(point: Vec2, wall: AABB, pad: number): boolean {
  return (
    point.x > wall.minX - pad &&
    point.x < wall.maxX + pad &&
    point.z > wall.minZ - pad &&
    point.z < wall.maxZ + pad
  );
}

/** Build the full arena: border frame, center crossroads, mirrored quadrant mazes. */
export function buildMap(mode: GameModeId): MapData {
  const halfSize = mode === 'battle_royale' ? ARENA.ROYALE_SIZE / 2 : ARENA.STANDARD_SIZE / 2;
  const walls: AABB[] = [];
  const spawns: SpawnPoint[] = [];
  const outer = halfSize;
  const borderW = 2;

  // 1. Perimeter border frame.
  walls.push(box('border-n', -outer - borderW, -outer - borderW, outer + borderW, -outer, 'border', ARENA.BORDER_HEIGHT));
  walls.push(box('border-s', -outer - borderW, outer, outer + borderW, outer + borderW, 'border', ARENA.BORDER_HEIGHT));
  walls.push(box('border-w', -outer - borderW, -outer, -outer, outer, 'border', ARENA.BORDER_HEIGHT));
  walls.push(box('border-e', outer, -outer, outer + borderW, outer, 'border', ARENA.BORDER_HEIGHT));

  // 2. Center crossroads (16x16 plaza) framed by 4 L-shaped cover pillars.
  const cp = 6.2;
  const cl = 2.4;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const tag = `center-${sx > 0 ? 'e' : 'w'}${sz > 0 ? 's' : 'n'}`;
      const [ax, bx] = span(cp, cp + cl, sx);
      walls.push(box(`${tag}-a`, ax, sz * cp, bx, sz * (cp + cl), 'pillar'));
      const [cx, dx] = span(cp - cl, cp + cl, sx);
      walls.push(box(`${tag}-b`, cx, sz * (cp + cl), dx, sz * (cp + cl + 1.8), 'pillar'));
    }
  }

  // 3. Mid-ring labyrinth: a pattern defined in the +x/+z quadrant, mirrored 4×.
  const inner = 9;
  const limit = outer - 2.5;
  const s = limit - inner; // quadrant span

  const quadrantPattern: Array<{
    x0: number; z0: number; x1: number; z1: number; kind: AABB['kind'];
  }> = [
    { x0: 0.04, z0: 0.05, x1: 0.34, z1: 0.14, kind: 'maze' },
    { x0: 0.5, z0: 0.18, x1: 0.6, z1: 0.54, kind: 'maze' },
    { x0: 0.5, z0: 0.45, x1: 0.82, z1: 0.55, kind: 'maze' },
    { x0: 0.76, z0: 0.7, x1: 0.96, z1: 0.95, kind: 'cover' },
    { x0: 0.2, z0: 0.7, x1: 0.29, z1: 0.86, kind: 'cover' },
    { x0: 0.14, z0: 0.34, x1: 0.22, z1: 0.56, kind: 'maze' },
  ];

  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const qtag = `${sx > 0 ? 'e' : 'w'}${sz > 0 ? 's' : 'n'}`;
      quadrantPattern.forEach((p, i) => {
        const lx0 = inner + p.x0 * s;
        const lx1 = inner + p.x1 * s;
        const lz0 = inner + p.z0 * s;
        const lz1 = inner + p.z1 * s;
        const [ax, bx] = span(lx0, lx1, sx);
        const [az, bz] = span(lz0, lz1, sz);
        walls.push(box(`q-${qtag}-${i}`, ax, az, bx, bz, p.kind));
      });
    }
  }

  // 4. Spawn nodes at corridor intersections (mirrored), filtered against walls.
  const candidates: Vec2[] = [
    { x: 0, z: 0 },
    { x: 0, z: inner + s * 0.45 },
    { x: 0, z: -(inner + s * 0.45) },
    { x: inner + s * 0.45, z: 0 },
    { x: -(inner + s * 0.45), z: 0 },
  ];
  const diag = inner + s * 0.62;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      candidates.push({ x: sx * diag, z: sz * diag });
      candidates.push({ x: sx * (outer - 4), z: sz * (outer - 4) });
    }
  }
  // Dense grid of corridor intersections so even a full 24-player royale match
  // can place every character at least MIN_SPAWN_DISTANCE away from the others.
  const ring = outer - 5;
  for (const gx of [-ring, -ring / 2, 0, ring / 2, ring]) {
    for (const gz of [-ring, -ring / 2, 0, ring / 2, ring]) {
      candidates.push({ x: gx, z: gz });
    }
  }

  const pad = ARENA.ENTITY_RADIUS + 0.35;
  candidates.forEach((c, i) => {
    if (walls.some((w) => insideWall(c, w, pad))) return;
    spawns.push({ id: `spawn-${i}`, x: c.x, z: c.z });
  });

  // Guarantee a usable set of spawns even if geometry changes drastically.
  if (spawns.length < 6) {
    const ring = outer - 4;
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      spawns.push({ id: `spawn-fallback-${i}`, x: Math.cos(a) * ring, z: Math.sin(a) * ring });
    }
  }

  return {
    id: mode,
    halfSize: outer,
    walls,
    spawns,
    center: { x: 0, z: 0 },
  };
}
