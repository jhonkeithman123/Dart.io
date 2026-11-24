/**
 * Uniform spatial hash grid (§7.2). Indexes dynamic entities and static walls
 * into 8×8 unit cells so projectile collision queries touch only nearby cells.
 */

import type { AABB, Vec2 } from './types';
import { PHYSICS } from './constants';

const CELL = PHYSICS.GRID_CELL_SIZE;

function key(cx: number, cz: number): number {
  // Cantor-like pairing of signed cell coordinates into a single number key.
  const a = cx >= 0 ? cx * 2 : -cx * 2 - 1;
  const b = cz >= 0 ? cz * 2 : -cz * 2 - 1;
  return (a + b) * (a + b + 1) / 2 + b;
}

export class SpatialGrid {
  private cells = new Map<number, number[]>();

  clear(): void {
    this.cells.clear();
  }

  private cellCoords(x: number, z: number): [number, number] {
    return [Math.floor(x / CELL), Math.floor(z / CELL)];
  }

  insertPoint(id: number, pos: Vec2, radius = 0): void {
    const [cx, cz] = this.cellCoords(pos.x - radius, pos.z - radius);
    const [cx2, cz2] = this.cellCoords(pos.x + radius, pos.z + radius);
    for (let x = cx; x <= cx2; x++) {
      for (let z = cz; z <= cz2; z++) {
        const k = key(x, z);
        let bucket = this.cells.get(k);
        if (!bucket) {
          bucket = [];
          this.cells.set(k, bucket);
        }
        bucket.push(id);
      }
    }
  }

  insertBox(id: number, box: AABB): void {
    const [cx, cz] = this.cellCoords(box.minX, box.minZ);
    const [cx2, cz2] = this.cellCoords(box.maxX, box.maxZ);
    for (let x = cx; x <= cx2; x++) {
      for (let z = cz; z <= cz2; z++) {
        const k = key(x, z);
        let bucket = this.cells.get(k);
        if (!bucket) {
          bucket = [];
          this.cells.set(k, bucket);
        }
        bucket.push(id);
      }
    }
  }

  /** Collect unique ids from the 3×3 cell neighborhood around a point. */
  queryNearby(pos: Vec2, out: number[]): number[] {
    out.length = 0;
    const [cx, cz] = this.cellCoords(pos.x, pos.z);
    const seen = new Set<number>();
    for (let x = cx - 1; x <= cx + 1; x++) {
      for (let z = cz - 1; z <= cz + 1; z++) {
        const bucket = this.cells.get(key(x, z));
        if (!bucket) continue;
        for (const id of bucket) {
          if (!seen.has(id)) {
            seen.add(id);
            out.push(id);
          }
        }
      }
    }
    return out;
  }
}
