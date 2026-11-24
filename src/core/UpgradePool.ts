/**
 * Upgrade draft pool (§5) and damage/multishot math (§7.4).
 * Upgrades add weapons and effects to a persistent arsenal instead of replacing
 * the character's starting weapon. All values are derived per-weapon at fire time.
 */

import type { Entity, WeaponKind, WeaponProfile } from './types';
import { COMBAT, WEAPONS } from './constants';
import type { RNG } from './WorldState';

export type UpgradeCategory = 'multishot' | 'physics' | 'arsenal' | 'weapon' | 'effect' | 'pet' | 'stats';
/**
 * common   — the rest of the pool; all share equal draft odds.
 * rare     — character stats only.
 * super_rare — weapon effects and the Magic Arrow.
 */
export type Rarity = 'common' | 'rare' | 'super_rare';

export interface Upgrade {
  id: string;
  name: string;
  category: UpgradeCategory;
  description: string;
  rarity: Rarity;
  maxStacks: number;
  tags: string[];
  apply: (entity: Entity) => void;
}

/** Record one stack so drafts, synergy scoring and respawn rebuilds stay correct. */
function inc(e: Entity, id: string): void {
  e.upgrades[id] = (e.upgrades[id] ?? 0) + 1;
}

function addWeapon(e: Entity, kind: WeaponKind, id: string): void {
  inc(e, id);
  if (!e.arsenal.includes(kind)) e.arsenal.push(kind);
}

/** Concrete stats for one owned weapon, derived from shared character modifiers. */
export function weaponProfile(entity: Entity, kind: WeaponKind): WeaponProfile {
  const def = WEAPONS[kind];
  return {
    kind,
    speed: def.speed * entity.stats.speedMult,
    range: def.range * entity.stats.rangeMult,
    radius: def.radius * entity.stats.sizeMult,
    damage: def.damage * entity.stats.damageMult,
    fireRate: entity.stats.fireRate,
    subStep: def.subStep,
    // Magic arrows track targets on their own without needing the homing upgrade.
    homing: entity.stats.homing + (kind === 'magic' ? 7 : 0),
  };
}

export const UPGRADES: Upgrade[] = [
  // COMMON — the rest of the pool, all with equal draft odds.
  // 1. Multishot & angles
  { id: 'front_arrow', name: 'Front Arrows +1', category: 'multishot', description: '+1 parallel projectile on each side (85% dmg each).', rarity: 'common', maxStacks: 4, tags: ['projectile', 'multishot'], apply: (e) => inc(e, 'front_arrow') },
  { id: 'diagonal_arrows', name: 'Diagonal Arrows +2', category: 'multishot', description: '+2 projectiles fired at ±30°.', rarity: 'common', maxStacks: 3, tags: ['projectile', 'multishot', 'angle'], apply: (e) => inc(e, 'diagonal_arrows') },
  { id: 'rear_arrow', name: 'Rear Arrow +1', category: 'multishot', description: '+1 projectile fired backwards (180°).', rarity: 'common', maxStacks: 2, tags: ['projectile', 'multishot', 'angle'], apply: (e) => inc(e, 'rear_arrow') },
  { id: 'side_arrows', name: 'Side Arrows +2', category: 'multishot', description: '+2 projectiles fired at ±90°.', rarity: 'common', maxStacks: 2, tags: ['projectile', 'multishot', 'angle'], apply: (e) => inc(e, 'side_arrows') },
  { id: 'nova_burst', name: '360° Nova Burst', category: 'multishot', description: 'Fire a radial ring of 12 projectiles.', rarity: 'common', maxStacks: 1, tags: ['projectile', 'multishot', 'aoe'], apply: (e) => inc(e, 'nova_burst') },

  // 2. Projectile physics
  { id: 'wall_bounce', name: 'Wall Bounce +1', category: 'physics', description: 'Projectiles ricochet off walls one more time.', rarity: 'common', maxStacks: 4, tags: ['projectile', 'bounce'], apply: (e) => { inc(e, 'wall_bounce'); e.stats.bounce += 1; } },
  { id: 'piercing', name: 'Piercing Shot', category: 'physics', description: 'Projectiles pass through one extra enemy.', rarity: 'common', maxStacks: 3, tags: ['projectile', 'pierce'], apply: (e) => { inc(e, 'piercing'); e.stats.pierce += 1; } },
  { id: 'homing', name: 'Homing Projectiles', category: 'physics', description: 'Projectiles curve toward nearby enemies.', rarity: 'common', maxStacks: 3, tags: ['projectile', 'homing'], apply: (e) => { inc(e, 'homing'); e.stats.homing += 2.2; } },

  // 3. Arsenal — every one of the five character weapons is available.
  { id: 'weapon_bow', name: 'Add: Wooden Bow', category: 'arsenal', description: 'Add balanced wooden arrows to your arsenal.', rarity: 'common', maxStacks: 1, tags: ['weapon', 'bow'], apply: (e) => addWeapon(e, 'bow', 'weapon_bow') },
  { id: 'weapon_shuriken', name: 'Add: Throwing Shurikens', category: 'arsenal', description: 'Add fast, light shurikens to your arsenal.', rarity: 'common', maxStacks: 1, tags: ['weapon', 'shuriken'], apply: (e) => addWeapon(e, 'shuriken', 'weapon_shuriken') },
  { id: 'weapon_scythe', name: 'Add: Spinning Scythes', category: 'arsenal', description: 'Add wide, heavy spinning scythes to your arsenal.', rarity: 'common', maxStacks: 1, tags: ['weapon', 'scythe'], apply: (e) => addWeapon(e, 'scythe', 'weapon_scythe') },
  { id: 'weapon_laser', name: 'Add: Laser Beam', category: 'arsenal', description: 'Add an instant piercing hitscan beam to your arsenal.', rarity: 'common', maxStacks: 1, tags: ['weapon', 'laser'], apply: (e) => addWeapon(e, 'laser', 'weapon_laser') },
  { id: 'weapon_bolt', name: 'Add: Heavy Bolts', category: 'arsenal', description: 'Add slow, hard-hitting broadhead bolts to your arsenal.', rarity: 'common', maxStacks: 1, tags: ['weapon', 'bolt'], apply: (e) => addWeapon(e, 'bolt', 'weapon_bolt') },
  { id: 'weapon_sword', name: 'Add: Steel Sword', category: 'arsenal', description: 'Add a fast, close-range sword arc to your arsenal.', rarity: 'common', maxStacks: 1, tags: ['weapon', 'melee', 'sword'], apply: (e) => addWeapon(e, 'sword', 'weapon_sword') },
  { id: 'weapon_hammer', name: 'Add: War Hammer', category: 'arsenal', description: 'Add a heavy, devastating close-range hammer swing.', rarity: 'common', maxStacks: 1, tags: ['weapon', 'melee', 'hammer'], apply: (e) => addWeapon(e, 'hammer', 'weapon_hammer') },
  { id: 'weapon_spike', name: 'Add: Ground Spikes', category: 'arsenal', description: 'Place spikes that hurt everyone except you.', rarity: 'common', maxStacks: 1, tags: ['weapon', 'spike', 'trap'], apply: (e) => addWeapon(e, 'spike', 'weapon_spike') },

  // 4. Weapon tuning
  { id: 'damage_up', name: 'Damage Up', category: 'weapon', description: '+20% damage for every weapon.', rarity: 'common', maxStacks: 6, tags: ['weapon', 'damage', 'offense'], apply: (e) => { inc(e, 'damage_up'); e.stats.damageMult *= 1.2; } },
  { id: 'size_up', name: 'Projectile Size Up', category: 'weapon', description: '+15% size for every projectile.', rarity: 'common', maxStacks: 4, tags: ['weapon', 'size'], apply: (e) => { inc(e, 'size_up'); e.stats.sizeMult *= 1.15; } },
  { id: 'range_up', name: 'Range Up', category: 'weapon', description: '+20% range for every weapon.', rarity: 'common', maxStacks: 4, tags: ['weapon', 'range'], apply: (e) => { inc(e, 'range_up'); e.stats.rangeMult *= 1.2; } },
  { id: 'velocity_up', name: 'Velocity Up', category: 'weapon', description: '+15% projectile velocity for every weapon.', rarity: 'common', maxStacks: 4, tags: ['weapon', 'velocity'], apply: (e) => { inc(e, 'velocity_up'); e.stats.speedMult *= 1.15; } },
  { id: 'giant_arrows', name: 'Giant Projectiles', category: 'weapon', description: '+60% projectile size, +35% damage.', rarity: 'common', maxStacks: 2, tags: ['projectile', 'size', 'damage', 'weapon'], apply: (e) => { inc(e, 'giant_arrows'); e.stats.sizeMult *= COMBAT.GIANT_SIZE_MULTIPLIER; e.stats.damageMult *= COMBAT.GIANT_DAMAGE_MULTIPLIER; } },
  { id: 'weapon_orbit', name: 'Orbiting Weapon', category: 'weapon', description: 'Your weapon circles you and strikes nearby enemies.', rarity: 'common', maxStacks: 2, tags: ['weapon', 'orbit', 'melee'], apply: (e) => inc(e, 'weapon_orbit') },
  { id: 'rotating_shuriken', name: 'Rotating Shuriken', category: 'weapon', description: '+1 shuriken orbiting you (max 6). Each one slices nearby enemies.', rarity: 'common', maxStacks: 6, tags: ['weapon', 'shuriken', 'orbit'], apply: (e) => inc(e, 'rotating_shuriken') },

  // RARE — character stats only.
  { id: 'magnet_range', name: 'Magnet Range', category: 'stats', description: '+50% XP gem pickup radius.', rarity: 'rare', maxStacks: 4, tags: ['stat', 'utility'], apply: (e) => { inc(e, 'magnet_range'); e.stats.magnetRange *= 1.5; } },
  { id: 'critical', name: 'Critical Strike', category: 'stats', description: '+15% chance for 1.75× damage.', rarity: 'rare', maxStacks: 4, tags: ['stat', 'offense', 'damage'], apply: (e) => { inc(e, 'critical'); e.stats.critChance += 0.15; } },
  { id: 'metal_shoes', name: 'Metal Shoes', category: 'stats', description: 'Full immunity to all ground spikes.', rarity: 'rare', maxStacks: 1, tags: ['stat', 'defense', 'spike'], apply: (e) => inc(e, 'metal_shoes') },
  { id: 'rotating_shield', name: 'Rotating Shield', category: 'stats', description: '+1 orbiting shield (max 4). Reduces damage and strikes enemies.', rarity: 'rare', maxStacks: 4, tags: ['stat', 'defense', 'orbit', 'shield'], apply: (e) => inc(e, 'rotating_shield') },

  // SUPER RARE — weapon effects and the self-tracking Magic Arrow.
  { id: 'magic_arrow', name: 'Magic Arrow', category: 'arsenal', description: 'A super-rare arrow that tracks enemies on its own.', rarity: 'super_rare', maxStacks: 1, tags: ['weapon', 'magic', 'homing'], apply: (e) => addWeapon(e, 'magic', 'magic_arrow') },
  { id: 'fire_tip', name: 'Fire Tip', category: 'effect', description: 'Hits apply a 4 dps burn for 2.5s.', rarity: 'super_rare', maxStacks: 2, tags: ['effect', 'element', 'damage'], apply: (e) => { inc(e, 'fire_tip'); e.element = 'fire'; } },
  { id: 'frost_tip', name: 'Frost Tip', category: 'effect', description: 'Hits slow enemies by 30% for 1.5s.', rarity: 'super_rare', maxStacks: 1, tags: ['effect', 'element', 'control'], apply: (e) => { inc(e, 'frost_tip'); e.element = 'frost'; } },
  { id: 'explosive_tip', name: 'Explosive Tip', category: 'effect', description: 'Hits explode for area damage around the target.', rarity: 'super_rare', maxStacks: 2, tags: ['effect', 'aoe', 'damage'], apply: (e) => { inc(e, 'explosive_tip'); } },
  { id: 'chain_tip', name: 'Chain Lightning', category: 'effect', description: 'Hits arc to a nearby enemy for half damage.', rarity: 'super_rare', maxStacks: 2, tags: ['effect', 'chain', 'damage'], apply: (e) => { inc(e, 'chain_tip'); } },
  { id: 'vampiric_tip', name: 'Vampiric Tip', category: 'effect', description: 'Heal 1 HP per successful hit.', rarity: 'super_rare', maxStacks: 2, tags: ['effect', 'heal'], apply: (e) => { inc(e, 'vampiric_tip'); } },

  // 7. Sidekick pets — orbiting companions that fire on their own.
  { id: 'pet_sickle', name: 'Sickle Familiar', category: 'pet', description: 'A spinning scythe companion orbits and attacks for you.', rarity: 'super_rare', maxStacks: 2, tags: ['pet', 'sickle'], apply: (e) => inc(e, 'pet_sickle') },
  { id: 'pet_laser', name: 'Laser Wisp', category: 'pet', description: 'A hovering wisp fires quick energy bolts.', rarity: 'super_rare', maxStacks: 2, tags: ['pet', 'laser'], apply: (e) => inc(e, 'pet_laser') },
  { id: 'pet_shuriken', name: 'Shuriken Sprite', category: 'pet', description: 'A tiny ninja star circles and throws shurikens.', rarity: 'super_rare', maxStacks: 2, tags: ['pet', 'shuriken'], apply: (e) => inc(e, 'pet_shuriken') },
  { id: 'pet_bomb', name: 'Bomb Orbit', category: 'pet', description: 'A floating bomb drops explosive rounds on enemies.', rarity: 'super_rare', maxStacks: 2, tags: ['pet', 'bomb', 'aoe'], apply: (e) => inc(e, 'pet_bomb') },
];

const BY_ID = new Map(UPGRADES.map((u) => [u.id, u]));

export function getUpgrade(id: string): Upgrade | undefined {
  return BY_ID.get(id);
}

export interface Shot {
  angleOffset: number;
  perpOffset: number;
  damageMult: number;
}

/** Build the firing pattern for one weapon from the entity's stacked upgrades. */
export function buildShotPattern(entity: Entity): Shot[] {
  const u = entity.upgrades;
  const shots: Shot[] = [{ angleOffset: 0, perpOffset: 0, damageMult: 1 }];

  const front = u.front_arrow ?? 0;
  for (let i = 1; i <= front; i++) {
    shots.push({ angleOffset: 0, perpOffset: COMBAT.MULTISHOT_PERPENDICULAR_OFFSET * i, damageMult: COMBAT.MULTISHOT_STACK_DAMAGE_MULT });
    shots.push({ angleOffset: 0, perpOffset: -COMBAT.MULTISHOT_PERPENDICULAR_OFFSET * i, damageMult: COMBAT.MULTISHOT_STACK_DAMAGE_MULT });
  }
  const addAngles = (count: number, deg: number, dmg: number) => {
    for (let i = 1; i <= count; i++) {
      const a = (deg * Math.PI) / 180;
      shots.push({ angleOffset: a, perpOffset: 0, damageMult: dmg });
      shots.push({ angleOffset: -a, perpOffset: 0, damageMult: dmg });
    }
  };
  addAngles(u.diagonal_arrows ?? 0, COMBAT.DIAGONAL_ANGLE_DEG, 1);
  addAngles(u.side_arrows ?? 0, COMBAT.SIDE_ANGLE_DEG, 1);
  if (u.rear_arrow) shots.push({ angleOffset: Math.PI, perpOffset: 0, damageMult: 1 });
  if (u.nova_burst) {
    const n = COMBAT.NOVA_ANGLE_COUNT;
    for (let i = 0; i < n; i++) shots.push({ angleOffset: (i / n) * Math.PI * 2, perpOffset: 0, damageMult: 0.55 });
  }
  return shots;
}

/** Final damage per §7.4. */
export function finalDamage(entity: Entity, baseDamage: number, multishotFactor: number, isCrit: boolean): number {
  return baseDamage * multishotFactor * (isCrit ? entity.stats.critMult : 1);
}

/**
 * Draft odds. Every common card has the same weight (1); rare and super-rare
 * cards are progressively less likely. Export so tests can verify the tiers.
 */
export const RARITY_WEIGHTS: Record<Rarity, number> = {
  common: 1,
  rare: 0.35,
  super_rare: 0.05,
};

function rarityWeight(rarity: Rarity): number {
  return RARITY_WEIGHTS[rarity];
}

/** Roll a 3-card draft using weighted sampling without replacement. */
export function rollDraft(
  entity: Entity,
  rng: RNG,
  count = 3,
  strategy: 'random' | 'weighted' | 'synergy' = 'random',
): Upgrade[] {
  const available = UPGRADES.filter((u) => {
    if ((entity.upgrades[u.id] ?? 0) >= u.maxStacks) return false;
    // Don't offer a weapon already in the arsenal.
    if (u.category === 'arsenal' && entity.arsenal.length >= 9) return false;
    // Don't offer an upgrade the character already has innately.
    if (u.id === 'homing' && entity.stats.homing > 0) return false;
    return true;
  });
  if (available.length <= count) return available.slice();

  const ownedTags = new Set<string>();
  if (strategy === 'synergy') {
    for (const owned of UPGRADES) {
      if ((entity.upgrades[owned.id] ?? 0) > 0) for (const t of owned.tags) ownedTags.add(t);
    }
  }

  // Equal jitter for every card keeps common cards equally likely; the weight
  // only encodes rarity. Hard bots get a synergy multiplier on top.
  const pool = available.map((u) => {
    let weight = rarityWeight(u.rarity) * (0.85 + rng.next() * 0.3);
    if (strategy === 'synergy') {
      let synergy = 0;
      for (const t of u.tags) if (ownedTags.has(t)) synergy++;
      weight *= 1 + synergy * 0.35;
    }
    return { u, weight };
  });

  const picked: Upgrade[] = [];
  while (picked.length < count && pool.length > 0) {
    const total = pool.reduce((sum, entry) => sum + entry.weight, 0);
    let roll = rng.next() * total;
    let index = pool.length - 1;
    for (let i = 0; i < pool.length; i++) {
      roll -= pool[i].weight;
      if (roll <= 0) { index = i; break; }
    }
    picked.push(pool[index].u);
    pool.splice(index, 1);
  }
  return picked;
}
