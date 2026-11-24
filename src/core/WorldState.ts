/**
 * Mutable world container: entity/projectile/gem stores, RNG, and event bus.
 * Contains no logic — all behavior lives in World / PhysicsEngine / AI.
 */

import type {
  Entity,
  EventListener,
  GameEvent,
  Gem,
  Heart,
  LaserBeam,
  MeleeSwing,
  Orb,
  Pet,
  Projectile,
  ShrinkingZone,
  Spike,
} from './types';
import type { MapData } from './MapData';

/** Deterministic PRNG (mulberry32) so offline sims can be replayed/seeded. */
export class RNG {
  private state: number;

  constructor(seed = 0x9e3779b9) {
    this.state = seed >>> 0;
  }

  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  int(min: number, maxInclusive: number): number {
    return Math.floor(this.range(min, maxInclusive + 1));
  }

  pick<T>(items: readonly T[]): T {
    return items[Math.floor(this.next() * items.length)];
  }

  shuffle<T>(items: T[]): T[] {
    for (let i = items.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [items[i], items[j]] = [items[j], items[i]];
    }
    return items;
  }
}

export class EventBus {
  private listeners = new Map<string, EventListener[]>();

  on(type: string, fn: EventListener): () => void {
    let list = this.listeners.get(type);
    if (!list) {
      list = [];
      this.listeners.set(type, list);
    }
    list.push(fn);
    return () => this.off(type, fn);
  }

  off(type: string, fn: EventListener): void {
    const list = this.listeners.get(type);
    if (!list) return;
    const i = list.indexOf(fn);
    if (i >= 0) list.splice(i, 1);
  }

  emit(event: GameEvent): void {
    const list = this.listeners.get(event.type);
    if (list) for (const fn of list) fn(event);
  }

  clear(): void {
    this.listeners.clear();
  }
}

export class WorldState {
  readonly entities: Entity[] = [];
  readonly projectiles: Projectile[] = [];
  readonly lasers: LaserBeam[] = [];
  readonly meleeSwings: MeleeSwing[] = [];
  readonly spikes: Spike[] = [];
  readonly gems: Gem[] = [];
  readonly hearts: Heart[] = [];
  readonly orbs: Orb[] = [];
  readonly pets: Pet[] = [];
  readonly rng: RNG;
  readonly events = new EventBus();

  map: MapData;
  zone: ShrinkingZone;
  time = 0;
  private nextId = 1;

  constructor(map: MapData, seed = Date.now() >>> 0) {
    this.map = map;
    this.rng = new RNG(seed);
    this.zone = {
      center: { ...map.center },
      radius: map.halfSize * 1.05,
      targetRadius: map.halfSize * 1.05,
      damagePerSec: 0,
      phase: 0,
      timer: 0,
      active: false,
    };
  }

  id(): number {
    return this.nextId++;
  }

  getEntity(id: number): Entity | undefined {
    return this.entities.find((e) => e.id === id);
  }

  get player(): Entity | undefined {
    return this.entities.find((e) => !e.isBot);
  }

  get livingEntities(): Entity[] {
    return this.entities.filter((e) => e.alive);
  }
}
