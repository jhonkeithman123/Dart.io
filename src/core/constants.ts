/** All tunable simulation constants. Mirrors §7 of the architecture plan. */

export const SIM = {
  /** Fixed simulation step: 1/60 s. */
  DT: 1 / 60,
  /** Maximum catch-up steps per render frame (spiral-of-death guard). */
  MAX_CATCHUP_STEPS: 4,
  TICK_RATE: 60,
} as const;

export const ARENA = {
  STANDARD_SIZE: 96,
  ROYALE_SIZE: 120,
  ENTITY_RADIUS: 0.55,
  WALL_HEIGHT: 1.1,
  BORDER_HEIGHT: 1.6,
} as const;

export const PROJECTILE_RADII: Record<string, number> = {
  bow: 0.18,
  bolt: 0.24,
  shuriken: 0.22,
  scythe: 0.45,
  // laser is hitscan
};

/** Baseline weapon stats keyed by weapon kind. */
export const WEAPONS: Record<string, {
  speed: number;
  range: number;
  radius: number;
  damage: number;
  fireRate: number;
  subStep: boolean;
}> = {
  // Base damage is intentionally tiny (1–2). Upgrades provide all scaling.
  bow: { speed: 18, range: 16, radius: 0.18, damage: 1, fireRate: 1, subStep: true },
  bolt: { speed: 15, range: 15, radius: 0.24, damage: 2, fireRate: 1, subStep: true },
  shuriken: { speed: 21, range: 14, radius: 0.22, damage: 1, fireRate: 1, subStep: true },
  scythe: { speed: 12.5, range: 13, radius: 0.45, damage: 2, fireRate: 1, subStep: false },
  laser: { speed: 999, range: 18, radius: 0.18, damage: 1, fireRate: 1, subStep: false },
  // Super-rare tracking arrow: hard to obtain, strong and self-guiding.
  magic: { speed: 16, range: 20, radius: 0.26, damage: 2, fireRate: 1, subStep: true },
  // Melee: short reach, instant arc (speed unused).
  sword: { speed: 0, range: 2.8, radius: 0.6, damage: 2, fireRate: 1, subStep: false },
  hammer: { speed: 0, range: 3.3, radius: 0.8, damage: 2, fireRate: 1, subStep: false },
  // Spikes are placed on the ground rather than fired.
  spike: { speed: 0, range: 3.5, radius: 0.42, damage: 1, fireRate: 1, subStep: false },
};

export const ROTATING = {
  SHURIKEN_RANGE: 2.7,
  SHURIKEN_DAMAGE: 1,
  SHURIKEN_INTERVAL: 0.5,
  SHIELD_RANGE: 2.1,
  SHIELD_DAMAGE: 1,
  SHIELD_INTERVAL: 0.85,
  SHIELD_REDUCTION_PER_STACK: 0.12,
} as const;

export const SPIKES = {
  LIFE: 12,
  MAP_COUNT: 18,
  MAP_DAMAGE: 1,
  RADIUS: 0.5,
  ORBIT_RANGE: 2.2,
  ORBIT_HIT_INTERVAL: 0.8,
  ORBIT_DAMAGE_MULT: 0.6,
} as const;

export const MELEE = {
  ARC_HALF_ANGLE_DEG: 65,
  SWING_VISUAL_LIFE: 0.22,
} as const;

export const MOVEMENT = {
  // Fixed, deliberately slow baseline for every character. Speed upgrades (or
  // other modifiers) can be layered on later without rebalancing the world.
  BASE_SPEED: 3.6,
  ACCELERATION: 30,
  DAMPING: 0.85,
} as const;

export const PHYSICS = {
  GRID_CELL_SIZE: 8,
  /** Projectiles faster than this integrate in two half-steps. */
  SUBSTEP_SPEED: 20,
  HAZARD_FEELER_RANGE: 1.2,
} as const;

export const COMBAT = {
  MULTISHOT_PERPENDICULAR_OFFSET: 0.22,
  MULTISHOT_STACK_DAMAGE_MULT: 0.85,
  DIAGONAL_ANGLE_DEG: 30,
  SIDE_ANGLE_DEG: 90,
  REAR_ANGLE_DEG: 180,
  CRIT_MULTIPLIER: 1.75,
  GIANT_SIZE_MULTIPLIER: 1.6,
  GIANT_DAMAGE_MULTIPLIER: 1.35,
  BURN_DURATION: 2.5,
  BURN_DPS: 4,
  FROST_DURATION: 1.5,
  FROST_SLOW_FACTOR: 0.3,
  LASER_VISUAL_LIFE: 0.14,
  NOVA_ANGLE_COUNT: 12,
} as const;

/** Characters advance from level 0 up to level 20. */
export const MAX_LEVEL = 20;

/**
 * XP required to advance FROM `level` TO `level + 1`.
 * 0→1 = 10, 1→2 = 200, 2→3 = 400 … 19→20 = 3800.
 */
export function xpRequired(level: number): number {
  if (level <= 0) return 10;
  return 200 * level;
}

/** Kill reward scales with the victim's level: 50 … 1000 XP. */
export function killXp(victimLevel: number): number {
  return Math.min(1000, 50 + 50 * Math.max(0, victimLevel));
}

/** Visual/hitbox scale multiplier from character level. */
export function sizeForLevel(level: number): number {
  return 1 + Math.max(0, Math.min(MAX_LEVEL, level)) * 0.04;
}

/** Character height in world units/meters at a given level. */
export function heightForLevel(level: number): number {
  return 1.8 * sizeForLevel(level);
}

export const GEM_VALUES: Record<string, number> = {
  cyan: 1,
  green: 5,
  gold: 15,
};

export const SPAWNING = {
  ENDLESS_POPULATION: 16,
  ROYALE_POPULATION: 24,
  BLITZ_POPULATION: 16,
  RESPAWN_SECONDS: 3,
  GEM_CAP: 220,
  HEART_CAP: 24,
  INITIAL_GEMS: 90,
  // Health orbs are deliberately rarer than EXP orbs (40 / 2.5s).
  INITIAL_HEARTS: 5,
  GEM_RESPAWN_INTERVAL: 0.6,
  HEART_RESPAWN_INTERVAL: 6.5,
  BLITZ_XP_MULTIPLIER: 2,
  /** Minimum center-to-center distance when placing any character. */
  MIN_SPAWN_DISTANCE: 7,
  /** Always maintain at least this many living characters (Endless/Blitz). */
  MIN_POPULATION: 8,
  REINFORCE_INTERVAL: 1.5,
  /** Big animated EXP orbs: 10 / 25 / 50 XP. */
  INITIAL_ORBS: 40,
  ORB_CAP: 90,
  ORB_RESPAWN_INTERVAL: 2.5,
  /** Duration of the shared fly-into-the-character absorb animation. */
  ORB_ABSORB_TIME: 0.35,
} as const;

export const ORB_VALUES = { small: 10, medium: 25, large: 50 } as const;

export const MODE = {
  BLITZ_DURATION: 180,
  ZONE_SHRINK_INTERVAL: 45,
  ZONE_BASE_DPS: 2,
  ZONE_DPS_RAMP: 1.35,
  SCORE_PER_KILL: 100,
  BLITZ_RETAIN_UPGRADES: 0.5,
} as const;

export const AI_MATRIX = {
  easy: {
    brainInterval: 0.45,
    leadFactor: 0,
    spreadDeg: 16,
    dodge: 'none',
    bankShots: false,
    draft: 'random',
  },
  normal: {
    brainInterval: 0.2,
    leadFactor: 0.65,
    spreadDeg: 6,
    dodge: 'slow',
    bankShots: false,
    draft: 'weighted',
  },
  hard: {
    brainInterval: 0.08,
    leadFactor: 1,
    spreadDeg: 1.2,
    dodge: 'full',
    bankShots: true,
    draft: 'synergy',
  },
} as const;

export interface ArchetypeDef {
  id: string;
  name: string;
  weapon: string;
  stats: Partial<import('./types').EntityStats>;
  description: string;
  ability: string;
  passive: string;
  color: number;
  accent: number;
}

export const ARCHETYPES: Record<string, ArchetypeDef> = {
  archer: {
    id: 'archer',
    name: 'Classic Archer',
    weapon: 'bow',
    stats: { xpBonus: 0.1 },
    description: 'Balanced ranged fighter with a reliable wooden bow.',
    ability: 'Standard Wooden Arrows',
    passive: '+10% XP gain',
    color: 0x3b82f6,
    accent: 0xfbbf24,
  },
  shinobi: {
    id: 'shinobi',
    name: 'Shinobi',
    weapon: 'shuriken',
    stats: { speedMult: 1.15 },
    description: 'Fast, evasive ninja who throws razor-sharp shurikens.',
    ability: 'Throwing Shurikens',
    passive: 'Faster projectile velocity (movement speed is fixed for all characters)',
    color: 0x1f2937,
    accent: 0xef4444,
  },
  reaper: {
    id: 'reaper',
    name: 'Reaper',
    weapon: 'scythe',
    stats: { sizeMult: 1.25, damageMult: 1.15 },
    description: 'Hooded reaper wielding wide, heavy spinning scythes.',
    ability: 'Spinning Scythes',
    passive: '+25% projectile size, +15% damage',
    color: 0x111827,
    accent: 0x22d3ee,
  },
  cyborg: {
    id: 'cyborg',
    name: 'Cyborg',
    weapon: 'laser',
    stats: { pierce: 1 },
    description: 'Chrome-visored energy specialist with an instant beam.',
    ability: 'Instant Hitscan Laser',
    passive: 'Beam pierces 1 target by default',
    color: 0x94a3b8,
    accent: 0x06b6d4,
  },
  knight: {
    id: 'knight',
    name: 'Crimson Knight',
    weapon: 'bolt',
    stats: { damageMult: 1.1 },
    description: 'Armored bulwark firing heavy broadhead bolts.',
    ability: 'Heavy Broadhead Bolts',
    passive: '+10% damage, heals on elimination',
    color: 0xdc2626,
    accent: 0xfca5a5,
  },
  jackal: {
    id: 'jackal',
    name: 'Jackal Warden',
    weapon: 'bolt',
    stats: { damageMult: 1.05 },
    description: 'A desert guardian with a gilded collar and heavy bolts.',
    ability: 'Guardian Bolts',
    passive: '+5% damage',
    color: 0x0f766e,
    accent: 0xfbbf24,
  },
  sovereign: {
    id: 'sovereign',
    name: 'Sun Sovereign',
    weapon: 'bow',
    stats: { homing: 2, rangeMult: 1.1 },
    description: 'A crowned ruler whose arrows curve toward their target.',
    ability: 'Guided Royal Arrows',
    passive: 'Arrows track enemies, +10% range',
    color: 0xb45309,
    accent: 0xfde68a,
  },
  commando: {
    id: 'commando',
    name: 'Strike Commando',
    weapon: 'laser',
    stats: { damageMult: 1.1, speedMult: 1.05 },
    description: 'An elite operator carrying a rapid energy rifle.',
    ability: 'Pulse Rifle',
    passive: '+10% damage, +5% projectile velocity',
    color: 0x334155,
    accent: 0x4ade80,
  },
};

/** 3 bars at level 0, +2 per level through 10, then +1 per level to 20. */
export function hpBarsForLevel(level: number): number {
  const lv = Math.max(0, Math.min(MAX_LEVEL, level));
  return 3 + Math.min(lv, 10) * 2 + Math.max(0, lv - 10);
}

export const BASE_STATS: import('./types').EntityStats = {
  maxHp: 3,
  moveSpeed: MOVEMENT.BASE_SPEED,
  acceleration: MOVEMENT.ACCELERATION,
  fireRate: 1,
  magnetRange: 2.5,
  critChance: 0.05,
  critMult: COMBAT.CRIT_MULTIPLIER,
  bounce: 0,
  pierce: 0,
  homing: 0,
  xpBonus: 0,
  damageMult: 1,
  sizeMult: 1,
  speedMult: 1,
  rangeMult: 1,
};
