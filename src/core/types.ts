/**
 * Shared type definitions for the deterministic simulation core.
 * This module (and all of /core) must remain free of Three.js and DOM imports.
 */

export interface Vec2 {
  x: number;
  z: number;
}

export type ArchetypeId = 'archer' | 'shinobi' | 'reaper' | 'cyborg' | 'knight'
  | 'jackal' | 'sovereign' | 'commando';
export type WeaponKind = 'bow' | 'shuriken' | 'scythe' | 'laser' | 'bolt' | 'magic'
  | 'sword' | 'hammer' | 'spike';
export type GameModeId = 'endless' | 'battle_royale' | 'blitz';
export type BotDifficulty = 'easy' | 'normal' | 'hard';
export type WallKind = 'border' | 'cover' | 'maze' | 'pillar';
export type GemKind = 'cyan' | 'green' | 'gold';
export type ElementKind = 'none' | 'fire' | 'frost';

/** A static, axis-aligned wall rectangle on the X–Z plane. */
export interface AABB {
  id: string;
  minX: number;
  minZ: number;
  maxX: number;
  maxZ: number;
  height: number;
  kind: WallKind;
}

export interface SpawnPoint extends Vec2 {
  id: string;
}

export interface ThemePalette {
  id: string;
  name: string;
  floor: number;
  grid: number;
  wallSide: number;
  wallTop: number;
  accent: number;
}

/** Normalized intent produced by human input or a bot brain. */
export interface InputCommand {
  moveX: number;
  moveZ: number;
  aimX: number;
  aimZ: number;
  /** Held fire (used by bot brains which fire on their own cadence). */
  firing: boolean;
  /** Edge-triggered: exactly one shot per press/click/tap, no cooldown. */
  firePressed: boolean;
}

/** Shared, modifier-style combat statistics for one entity. */
export interface EntityStats {
  maxHp: number;
  moveSpeed: number;
  acceleration: number;
  fireRate: number;
  magnetRange: number;
  critChance: number;
  critMult: number;
  bounce: number;
  pierce: number;
  homing: number;
  xpBonus: number;
  damageMult: number;
  sizeMult: number;
  speedMult: number;
  rangeMult: number;
}

/** Concrete numbers for one weapon in an entity's arsenal. */
export interface WeaponProfile {
  kind: WeaponKind;
  speed: number;
  range: number;
  radius: number;
  damage: number;
  fireRate: number;
  subStep: boolean;
  homing: number;
}

export interface Entity {
  id: number;
  isBot: boolean;
  difficulty: BotDifficulty;
  alive: boolean;
  name: string;
  archetype: ArchetypeId;
  /** Primary weapon (used for the held model); all arsenal entries fire each attack. */
  weapon: WeaponKind;
  arsenal: WeaponKind[];

  pos: Vec2;
  vel: Vec2;
  facing: number;
  radius: number;
  stats: EntityStats;
  hp: number;

  level: number;
  xp: number;
  xpToNext: number;
  pendingDrafts: number;

  kills: number;
  score: number;
  killStreak: number;
  lastKillTime: number;
  /** Last tick an orbiting weapon damaged each target. */
  orbitHitTimes: Map<number, number>;
  shurikenHitTimes: Map<number, number>;
  shieldHitTimes: Map<number, number>;
  respawnTimer: number;

  fireCooldown: number;
  upgrades: Record<string, number>;
  element: ElementKind;
  slowUntil: number;
  slowFactor: number;
  burnUntil: number;
  burnDps: number;
  hitFlash: number;
  invulnUntil: number;

  /** Per-bot steering state and timing (unused by the human player). */
  brainTimer: number;
  brain: BotBrainState;
}

export interface BotBrainState {
  feelers: number[];
  steerX: number;
  steerZ: number;
  desiredAimX: number;
  desiredAimZ: number;
  firing: boolean;
  targetId: number;
  tacticalState: 'forage' | 'combat' | 'retreat';
}

export interface Projectile {
  id: number;
  ownerId: number;
  kind: WeaponKind;
  pos: Vec2;
  vel: Vec2;
  radius: number;
  damage: number;
  traveled: number;
  maxRange: number;
  bouncesRemaining: number;
  pierceRemaining: number;
  hitEntities: Set<number>;
  isCrit: boolean;
  element: ElementKind;
  homing: number;
  alive: boolean;
  age: number;
}

/** A ground spike hazard. ownerId 0 means it belongs to the map. */
export interface Spike {
  id: number;
  ownerId: number;
  pos: Vec2;
  radius: number;
  damage: number;
  age: number;
  life: number;
  hitEntities: Set<number>;
}

/** Short-lived visual for a melee swing arc. */
export interface MeleeSwing {
  id: number;
  ownerId: number;
  from: Vec2;
  angle: number;
  range: number;
  kind: WeaponKind;
  age: number;
  life: number;
}

export interface LaserBeam {
  id: number;
  ownerId: number;
  from: Vec2;
  to: Vec2;
  element: ElementKind;
  age: number;
  life: number;
}

export interface Gem {
  id: number;
  pos: Vec2;
  kind: GemKind;
  value: number;
  bob: number;
}

export interface Heart {
  id: number;
  pos: Vec2;
  heal: number;
  bob: number;
}

export type PetKind = 'sickle' | 'laser' | 'shuriken' | 'bomb';

/** Orbiting sidekick that auto-fires at nearby enemies. */
export interface Pet {
  id: number;
  ownerId: number;
  kind: PetKind;
  angle: number;
  radius: number;
  cooldown: number;
  stack: number;
}

export type OrbSize = 'small' | 'medium' | 'large';

/** Animated 3D XP orb that drifts around the arena and grants 10/25/50 XP. */
export interface Orb {
  id: number;
  pos: Vec2;
  size: OrbSize;
  value: number;
  bob: number;
  spin: number;
  /** True once picked up; the orb flies into the collecting character. */
  collected: boolean;
  /** Remaining seconds of the absorb animation. */
  collectAnim: number;
  /** Character id that collected this orb. */
  targetId: number;
  /** Orb position at the moment of collection (absorb interpolation origin). */
  absorbFrom: Vec2;
}

export interface ShrinkingZone {
  center: Vec2;
  radius: number;
  targetRadius: number;
  damagePerSec: number;
  phase: number;
  timer: number;
  active: boolean;
}

export interface GameEvent {
  type: string;
  [key: string]: unknown;
}

export type EventListener = (event: GameEvent) => void;
