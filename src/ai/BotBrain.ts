/**
 * Bot controller (§7.3B/C): perception → 16-ray context steering → ballistic
 * aim, interpolated at 60Hz. Reads WorldState, outputs an InputCommand.
 */

import type { Entity, InputCommand, Vec2 } from '../core/types';
import type { World } from '../core/World';
import { AI_MATRIX, PHYSICS } from '../core/constants';
import { rollDraft, weaponProfile } from '../core/UpgradePool';
import { computeAimPoint, hasLineOfSight } from './AimSolver';

const FEELER_COUNT = 16;
const FEELER_LEN = 6;
const FEELER_STEP = (Math.PI * 2) / FEELER_COUNT;

function norm(x: number, z: number): Vec2 {
  const l = Math.hypot(x, z) || 1;
  return { x: x / l, z: z / l };
}

function aligned(a: number, b: number): number {
  return Math.cos(a - b); // 1 = same direction, -1 = opposite
}

/** Distance from a point to a box (0 when inside). */
function distToBox(p: Vec2, b: { minX: number; maxX: number; minZ: number; maxZ: number }): number {
  const dx = Math.max(b.minX - p.x, 0, p.x - b.maxX);
  const dz = Math.max(b.minZ - p.z, 0, p.z - b.maxZ);
  return Math.hypot(dx, dz);
}

function chooseTarget(world: World, bot: Entity): Entity | undefined {
  let best: Entity | undefined;
  let bestScore = -Infinity;
  for (const e of world.state.livingEntities) {
    if (e.id === bot.id) continue;
    // Short opening grace: bots fight each other before focusing the human.
    if (!e.isBot && world.state.time < 4) continue;
    const d = Math.hypot(e.pos.x - bot.pos.x, e.pos.z - bot.pos.z);
    const visible = hasLineOfSight(world, bot.pos, e.pos) ? 5 : 0;
    const weak = (1 - e.hp / Math.max(1, e.stats.maxHp)) * 4;
    const score = -d + visible + weak;
    if (score > bestScore) { bestScore = score; best = e; }
  }
  return best;
}

function bestGemCluster(world: World, bot: Entity): Vec2 | undefined {
  let best: Vec2 | undefined;
  let bestScore = 0;
  for (const gem of world.state.gems) {
    const d = Math.hypot(gem.pos.x - bot.pos.x, gem.pos.z - bot.pos.z);
    if (d > 14) continue;
    const score = gem.value * 8 - d * 2;
    if (score > bestScore) { bestScore = score; best = gem.pos; }
  }
  return best;
}

function nearestHeart(world: World, bot: Entity): Vec2 | undefined {
  let best: Vec2 | undefined;
  let bestD = Infinity;
  for (const h of world.state.hearts) {
    const d = Math.hypot(h.pos.x - bot.pos.x, h.pos.z - bot.pos.z);
    if (d < bestD) { bestD = d; best = h.pos; }
  }
  return best;
}

type Params = (typeof AI_MATRIX)[Entity['difficulty']];

function think(world: World, bot: Entity, params: Params): void {
  const brain = bot.brain;
  const target = chooseTarget(world, bot);
  const hpFrac = bot.hp / Math.max(1, bot.stats.maxHp);

  brain.tacticalState = hpFrac < 0.3 ? 'retreat' : target ? 'combat' : 'forage';
  brain.targetId = target?.id ?? 0;

  // Aim via the ballistic solver (with jitter and optional bank shots).
  if (target) {
    const aim = computeAimPoint(world, bot, target, () => world.rng.next());
    const dir = norm(aim.x - bot.pos.x, aim.z - bot.pos.z);
    brain.desiredAimX = dir.x;
    brain.desiredAimZ = dir.z;
    const d = Math.hypot(target.pos.x - bot.pos.x, target.pos.z - bot.pos.z);
    const inRange = d < weaponProfile(bot, bot.weapon).range * 1.05;
    brain.firing = inRange && (params.bankShots || hasLineOfSight(world, bot.pos, target.pos) || d < 4);
  } else {
    brain.firing = false;
  }

  const gems = brain.tacticalState === 'forage' ? bestGemCluster(world, bot) : undefined;
  const heart = brain.tacticalState === 'retreat' ? nearestHeart(world, bot) : undefined;
  const enemyDir = target ? norm(target.pos.x - bot.pos.x, target.pos.z - bot.pos.z) : undefined;
  const enemyDist = target ? Math.hypot(target.pos.x - bot.pos.x, target.pos.z - bot.pos.z) : Infinity;
  const melee = ['scythe', 'sword', 'hammer', 'spike'].includes(bot.weapon);
  const minSpacing = melee ? 3 : 9;
  const maxSpacing = melee ? 5 : 12;

  // Projectile threat vectors projected 0.45s forward.
  const threats: Vec2[] = [];
  if (params.dodge !== 'none') {
    for (const p of world.state.projectiles) {
      if (p.ownerId === bot.id || !p.alive) continue;
      const d = Math.hypot(p.pos.x - bot.pos.x, p.pos.z - bot.pos.z);
      if (d > 8) continue;
      if (params.dodge === 'slow' && p.kind !== 'scythe') continue;
      threats.push({ x: p.pos.x + p.vel.x * 0.45 - bot.pos.x, z: p.pos.z + p.vel.z * 0.45 - bot.pos.z });
    }
  }

  let sx = 0;
  let sz = 0;
  for (let i = 0; i < FEELER_COUNT; i++) {
    const angle = i * FEELER_STEP;
    const fx = Math.cos(angle);
    const fz = Math.sin(angle);
    let score = 0;
    brain.feelers[i] = 0;

    // Sample along the feeler for wall hazards and zone boundary.
    for (let s = 1; s <= 5; s++) {
      const dist = (s / 5) * FEELER_LEN;
      const px = bot.pos.x + fx * dist;
      const pz = bot.pos.z + fz * dist;
      for (const wall of world.map.walls) {
        if (distToBox({ x: px, z: pz }, wall) < PHYSICS.HAZARD_FEELER_RANGE) {
          score -= 100 / s;
          break;
        }
      }
      const zone = world.state.zone;
      if (zone.active && Math.hypot(px - zone.center.x, pz - zone.center.z) > zone.radius) {
        score -= 100 / s;
      }
    }

    // Incoming projectile dodge: penalize aligned feelers, reward perpendicular.
    for (const t of threats) {
      const tn = norm(t.x, t.z);
      const a = aligned(angle, Math.atan2(tn.z, tn.x));
      if (a > 0.9) score -= 80;
      else if (Math.abs(a) < 0.4) score += 60;
    }

    // Tactical steering.
    if (gems) {
      const g = norm(gems.x - bot.pos.x, gems.z - bot.pos.z);
      score += aligned(angle, Math.atan2(g.z, g.x)) * 45;
    }
    if (heart) {
      const h = norm(heart.x - bot.pos.x, heart.z - bot.pos.z);
      score += aligned(angle, Math.atan2(h.z, h.x)) * 70;
    }
    if (enemyDir) {
      const ea = Math.atan2(enemyDir.z, enemyDir.x);
      if (brain.tacticalState === 'retreat' || enemyDist < minSpacing) {
        score += aligned(angle, ea + Math.PI) * 60;
      } else if (enemyDist > maxSpacing) {
        score += aligned(angle, ea) * 35;
      }
      // Strafe perpendicular to the enemy while fighting.
      if (brain.tacticalState === 'combat') score += Math.abs(aligned(angle, ea + Math.PI / 2)) * 22;
    }

    brain.feelers[i] = score;
    sx += fx * score;
    sz += fz * score;
  }

  const sl = Math.hypot(sx, sz);
  if (sl > 1e-4) {
    // Smoothly interpolate steering toward the newly computed direction.
    const tx = sx / sl;
    const tz = sz / sl;
    brain.steerX += (tx - brain.steerX) * 0.5;
    brain.steerZ += (tz - brain.steerZ) * 0.5;
  }
}

/** Produce this tick's movement/aim intent for a bot. */
export function computeBotInput(world: World, bot: Entity): InputCommand {
  const params = AI_MATRIX[bot.difficulty];

  if (bot.pendingDrafts > 0) {
    const cards = rollDraft(bot, world.rng, 3, params.draft);
    if (cards.length > 0) world.chooseUpgrade(bot, cards[0].id);
  }

  bot.brainTimer -= 1 / 60;
  if (bot.brainTimer <= 0) {
    bot.brainTimer = params.brainInterval;
    think(world, bot, params);
  }

  const b = bot.brain;
  return {
    moveX: b.steerX,
    moveZ: b.steerZ,
    aimX: b.desiredAimX,
    aimZ: b.desiredAimZ,
    firing: b.firing,
    firePressed: false,
  };
}
