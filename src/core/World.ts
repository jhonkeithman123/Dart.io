/**
 * Deterministic simulation orchestrator. Owns a fixed-step `step()` that
 * advances entities, projectiles, gems, buffs, zone damage and mode rules.
 * Has zero Three.js/DOM dependencies.
 */

import type {
  Entity,
  GemKind,
  InputCommand,
  OrbSize,
  PetKind,
  Projectile,
  Vec2,
  WeaponKind,
  WeaponProfile,
} from './types';
import {
  ARCHETYPES,
  ARENA,
  BASE_STATS,
  COMBAT,
  GEM_VALUES,
  MAX_LEVEL,
  hpBarsForLevel,
  MELEE,
  MODE,
  MOVEMENT,
  ORB_VALUES,
  ROTATING,
  SPAWNING,
  SPIKES,
  killXp,
  sizeForLevel,
  xpRequired,
} from './constants';
import { buildMap, type MapData } from './MapData';
import { GameModeController, type GameConfig } from './GameModes';
import { RNG, WorldState } from './WorldState';
import { SpatialGrid } from './SpatialGrid';
import {
  circleVsBox,
  circlesOverlap,
  reflect,
  subStepsFor,
} from './PhysicsEngine';
import { UPGRADES, buildShotPattern, finalDamage, getUpgrade, weaponProfile } from './UpgradePool';

export type BotInputProvider = (world: World, entity: Entity) => InputCommand;

const BOT_NAMES = [
  'PixelFury', 'N0VA', 'GhostByte', 'AimBot', 'Vex', 'Rook', 'Zephyr', 'Bolt',
  'Shade', 'Cipher', 'Rogue', 'Echo', 'Fang', 'Blitz', 'Nyx', 'Quill',
  'Sable', 'Drift', 'Havoc', 'Onyx', 'Rift', 'Talon', 'Wraith', 'Kestrel',
];

const EMPTY_INPUT: InputCommand = { moveX: 0, moveZ: 0, aimX: 1, aimZ: 0, firing: false, firePressed: false };

function len(x: number, z: number): number {
  return Math.hypot(x, z);
}

export class World {
  readonly state: WorldState;
  readonly controller: GameModeController;
  readonly config: GameConfig;
  readonly map: MapData;
  readonly rng: RNG;

  botInputProvider: BotInputProvider | null = null;

  private wallGrid = new SpatialGrid();
  private entityGrid = new SpatialGrid();
  private queryBuf: number[] = [];
  private gemSpawnTimer = 0;
  private heartSpawnTimer = 0;
  private orbSpawnTimer = 0;
  private reinforceTimer = 0;

  constructor(config: GameConfig) {
    this.config = config;
    this.map = buildMap(config.mode);
    this.state = new WorldState(this.map, config.seed);
    this.rng = this.state.rng;
    this.controller = new GameModeController(config, this.state);

    let wallId = 0;
    for (const wall of this.map.walls) this.wallGrid.insertBox(wallId++, wall);

    this.spawnEntities();
    this.seedPickups();
    this.controller.start();
  }

  // ---------------------------------------------------------------- entities

  private createEntity(isBot: boolean, archetypeId: string, difficulty: Entity['difficulty'], pos: Vec2, index: number): Entity {
    const arch = ARCHETYPES[archetypeId];
    const stats: Entity['stats'] = { ...BASE_STATS };
    Object.assign(stats, arch.stats);

    const entity: Entity = {
      id: this.state.id(),
      isBot,
      difficulty,
      alive: true,
      name: isBot ? (BOT_NAMES[index % BOT_NAMES.length] + (index >= BOT_NAMES.length ? String(index) : '')) : 'You',
      archetype: archetypeId as Entity['archetype'],
      weapon: arch.weapon as WeaponKind,
      arsenal: [arch.weapon as WeaponKind],
      pos: { ...pos },
      vel: { x: 0, z: 0 },
      facing: 0,
      radius: ARENA.ENTITY_RADIUS,
      stats,
      hp: stats.maxHp,
      level: 0,
      xp: 0,
      xpToNext: xpRequired(0),
      pendingDrafts: 0,
      kills: 0,
      score: 0,
      killStreak: 0,
      lastKillTime: -100,
      orbitHitTimes: new Map<number, number>(),
      shurikenHitTimes: new Map<number, number>(),
      shieldHitTimes: new Map<number, number>(),
      respawnTimer: 0,
      fireCooldown: this.rng.range(0, 0.4),
      upgrades: {},
      element: 'none',
      slowUntil: 0,
      slowFactor: 1,
      burnUntil: 0,
      burnDps: 0,
      hitFlash: 0,
      // Brief spawn protection so matches don't end before the player can react.
      invulnUntil: this.state.time + 3,
      brainTimer: this.rng.range(0, 0.2),
      brain: {
        feelers: new Array(16).fill(0),
        steerX: 0,
        steerZ: 0,
        desiredAimX: 1,
        desiredAimZ: 0,
        firing: false,
        targetId: 0,
        tacticalState: 'forage',
      },
    };
    this.state.entities.push(entity);
    return entity;
  }

  private safeSpawn(forEntity: Entity): Vec2 {
    const others = this.state.livingEntities.filter((e) => e.id !== forEntity.id);
    const valid: Array<{ node: Vec2; nearest: number }> = [];

    for (const node of this.map.spawns) {
      if (this.state.zone.active) {
        const dz = len(node.x - this.state.zone.center.x, node.z - this.state.zone.center.z);
        if (dz > this.state.zone.radius - 2) continue;
      }
      let nearest = Infinity;
      for (const e of others) {
        const d = len(node.x - e.pos.x, node.z - e.pos.z);
        if (d < nearest) nearest = d;
      }
      valid.push({ node, nearest });
    }
    if (valid.length === 0) return { x: 0, z: 0 };

    // Only nodes strictly farther than the minimum separation are eligible.
    const separated = valid.filter((v) => v.nearest >= SPAWNING.MIN_SPAWN_DISTANCE);
    if (separated.length > 0) {
      const choice = this.rng.pick(separated);
      return { x: choice.node.x, z: choice.node.z };
    }
    // Fallback: use the farthest available node rather than spawning beside anyone.
    valid.sort((a, b) => b.nearest - a.nearest);
    return { x: valid[0].node.x, z: valid[0].node.z };
  }

  private spawnEntities(): void {
    const population = this.controller.rules.population;
    const player = this.createEntity(false, this.config.archetype, this.config.difficulty, { x: 0, z: 0 }, 0);
    this.recomputeStats(player);
    this.updateSize(player);

    // Place the player at a spawn node away from the center cluster.
    const pSpawn = this.safeSpawn(player);
    player.pos = { ...pSpawn };

    const archetypeIds = Object.keys(ARCHETYPES);
    for (let i = 1; i < population; i++) {
      const botArch = archetypeIds[this.rng.int(0, archetypeIds.length - 1)];
      const bot = this.createEntity(true, botArch, this.config.difficulty, { x: 0, z: 0 }, i);
      bot.pos = { ...this.safeSpawn(bot) };
      this.recomputeStats(bot);
      this.updateSize(bot);
    }
  }

  /** Recompute all derived stats from archetype baseline + owned upgrade stacks. */
  private recomputeStats(entity: Entity): void {
    const arch = ARCHETYPES[entity.archetype];
    entity.stats = { ...BASE_STATS, ...arch.stats };
    entity.stats.maxHp = hpBarsForLevel(entity.level);
    entity.hp = Math.min(entity.hp, entity.stats.maxHp);
    entity.element = 'none';
    entity.arsenal = [entity.weapon];
    // Canonical order keeps replay deterministic.
    for (const upgrade of UPGRADES) {
      const n = entity.upgrades[upgrade.id] ?? 0;
      for (let i = 0; i < n; i++) upgrade.apply(entity);
    }
    entity.hp = Math.min(entity.hp, entity.stats.maxHp);
  }

  /** Characters grow with level — update the physics hitbox to match the visual. */
  private updateSize(entity: Entity): void {
    entity.radius = ARENA.ENTITY_RADIUS * sizeForLevel(entity.level);
  }

  // ----------------------------------------------------------------- pickups

  private randomOpenPoint(): Vec2 {
    const half = this.map.halfSize - 3;
    for (let attempt = 0; attempt < 30; attempt++) {
      const p = { x: this.rng.range(-half, half), z: this.rng.range(-half, half) };
      let clear = true;
      for (const w of this.map.walls) {
        if (circleVsBox(p, 0.9, w, false).hit) { clear = false; break; }
      }
      if (clear) return p;
    }
    return { x: this.rng.range(-half, half), z: this.rng.range(-half, half) };
  }

  private randomGemKind(): GemKind {
    const r = this.rng.next();
    return r < 0.7 ? 'cyan' : r < 0.92 ? 'green' : 'gold';
  }

  private spawnGem(pos?: Vec2, kind?: GemKind): void {
    if (this.state.gems.length >= SPAWNING.GEM_CAP) return;
    const k = kind ?? this.randomGemKind();
    const p = pos ?? this.randomOpenPoint();
    this.state.gems.push({
      id: this.state.id(),
      pos: { ...p },
      kind: k,
      value: GEM_VALUES[k],
      bob: this.rng.range(0, Math.PI * 2),
    });
  }

  private spawnHeart(pos?: Vec2): void {
    if (this.state.hearts.length >= SPAWNING.HEART_CAP) return;
    const p = pos ?? this.randomOpenPoint();
    this.state.hearts.push({ id: this.state.id(), pos: { ...p }, heal: 2, bob: this.rng.range(0, Math.PI * 2) });
  }

  private spawnOrb(pos?: Vec2, size?: OrbSize): void {
    if (this.state.orbs.length >= SPAWNING.ORB_CAP) return;
    const roll = this.rng.next();
    const s: OrbSize = size ?? (roll < 0.55 ? 'small' : roll < 0.85 ? 'medium' : 'large');
    const p = pos ?? this.randomOpenPoint();
    this.state.orbs.push({
      id: this.state.id(),
      pos: { ...p },
      size: s,
      value: ORB_VALUES[s],
      bob: this.rng.range(0, Math.PI * 2),
      spin: this.rng.range(0, Math.PI * 2),
      collected: false,
      collectAnim: 0,
      targetId: 0,
      absorbFrom: { ...p },
    });
  }

  private seedPickups(): void {
    for (let i = 0; i < SPAWNING.INITIAL_GEMS; i++) this.spawnGem();
    for (let i = 0; i < SPAWNING.INITIAL_HEARTS; i++) this.spawnHeart();
    for (let i = 0; i < SPAWNING.INITIAL_ORBS; i++) this.spawnOrb();
    for (let i = 0; i < SPIKES.MAP_COUNT; i++) {
      const pos = this.randomOpenPoint();
      this.state.spikes.push({
        id: this.state.id(),
        ownerId: 0, // map-owned: nobody is immune except with Metal Shoes
        pos,
        radius: SPIKES.RADIUS,
        damage: SPIKES.MAP_DAMAGE,
        age: 0,
        life: Infinity,
        hitEntities: new Set<number>(),
      });
    }
  }

  // -------------------------------------------------------------------- step

  step(playerInput: InputCommand = EMPTY_INPUT): void {
    if (this.controller.finished) return;
    const dt = 1 / 60;
    this.state.time += dt;
    this.controller.tick();

    this.rebuildEntityGrid();
    this.updateEntities(dt, playerInput);
    this.rebuildEntityGrid();
    this.updatePets(dt);
    this.updateProjectiles(dt);
    this.updateLasers(dt);
    this.updateMeleeSwings(dt);
    this.updateSpikes(dt);
    this.updateOrbitWeapons(dt);
    this.updateRotatingOrnaments(dt);
    this.updatePickups(dt);
    this.applyZoneDamage(dt);
    this.updateRespawns(dt);
    this.maybeReinforce(dt);
    this.cleanup();
  }

  private rebuildEntityGrid(): void {
    this.entityGrid.clear();
    for (const e of this.state.entities) {
      if (e.alive) this.entityGrid.insertPoint(e.id, e.pos, e.radius);
    }
  }

  private updateEntities(dt: number, playerInput: InputCommand): void {
    for (const e of this.state.entities) {
      if (!e.alive) continue;
      e.hitFlash = Math.max(0, e.hitFlash - dt);
      e.fireCooldown -= dt;

      // Buffs / damage-over-time.
      if (e.burnUntil > this.state.time) {
        e.hp -= e.burnDps * dt;
        if (e.hp <= 0) { this.killEntity(e, undefined); continue; }
      }
      const slowed = e.slowUntil > this.state.time;

      const input = e.isBot
        ? (this.botInputProvider?.(this, e) ?? EMPTY_INPUT)
        : playerInput;

      // Movement: accelerate toward desired velocity, damp when idle.
      const ml = len(input.moveX, input.moveZ);
      const nx = ml > 1 ? input.moveX / ml : input.moveX;
      const nz = ml > 1 ? input.moveZ / ml : input.moveZ;
      // All characters share the same fixed base speed; growing larger slows you down.
      const speed = (e.stats.moveSpeed / sizeForLevel(e.level)) * (slowed ? e.slowFactor : 1);
      const targetX = nx * speed;
      const targetZ = nz * speed;
      const accel = e.stats.acceleration * dt;
      if (ml > 0.01) {
        e.vel.x += Math.max(-accel, Math.min(accel, targetX - e.vel.x));
        e.vel.z += Math.max(-accel, Math.min(accel, targetZ - e.vel.z));
      } else {
        e.vel.x *= MOVEMENT.DAMPING;
        e.vel.z *= MOVEMENT.DAMPING;
      }
      e.pos.x += e.vel.x * dt;
      e.pos.z += e.vel.z * dt;

      // Characters phase through interior walls: no collision resolution, so
      // they can never get stuck inside cover. Only the arena perimeter clamps
      // them. Projectiles still collide and bounce off walls.
      const limit = this.map.halfSize - e.radius;
      e.pos.x = Math.max(-limit, Math.min(limit, e.pos.x));
      e.pos.z = Math.max(-limit, Math.min(limit, e.pos.z));

      // Aim & face.
      const al = len(input.aimX, input.aimZ);
      if (al > 0.01) {
        e.facing = Math.atan2(input.aimZ / al, input.aimX / al);
      }

      if (e.isBot) {
        // Bots fire on their own cadence.
        if (input.firing && e.fireCooldown <= 0) {
          this.fire(e, input.aimX, input.aimZ);
          e.fireCooldown = 1 / Math.max(0.1, e.stats.fireRate);
        }
      } else if (input.firePressed) {
        // Human: exactly one shot per press/click/tap — no cooldown gate.
        // The cooldown value is still set to drive the recoil animation.
        this.fire(e, input.aimX, input.aimZ);
        e.fireCooldown = 1 / Math.max(0.1, e.stats.fireRate);
      }
    }
  }

  // ------------------------------------------------------------------ combat

  /** Point just ahead of and to the side of the held weapon — the visible muzzle. */
  private muzzlePosition(entity: Entity, angle: number, sideOffset: number): Vec2 {
    const dirX = Math.cos(angle);
    const dirZ = Math.sin(angle);
    const forward = entity.radius + 0.55;
    const side = 0.3 + sideOffset;
    return {
      x: entity.pos.x + dirX * forward - dirZ * side,
      z: entity.pos.z + dirZ * forward + dirX * side,
    };
  }

  private fire(entity: Entity, aimX: number, aimZ: number): void {
    const al = len(aimX, aimZ) || 1;
    const baseAngle = Math.atan2(aimZ / al, aimX / al);

    // Every weapon in the arsenal fires on each attack — this is the core
    // strength gain from picking up new weapons during a run.
    entity.arsenal.forEach((weapon, weaponIndex) => {
      const profile = weaponProfile(entity, weapon);
      const shots = buildShotPattern(entity);
      // Fan simultaneous shots out sideways so a full arsenal stays readable
      // instead of collapsing into one invisible stack at a single muzzle.
      const muzzle = this.muzzlePosition(entity, baseAngle, weaponIndex * 0.28);
      this.state.events.emit({
        type: 'shoot', weapon, x: muzzle.x, z: muzzle.z, ownerId: entity.id,
      });
      this.state.events.emit({ type: 'muzzle', weapon, x: muzzle.x, z: muzzle.z, ownerId: entity.id });

      if (weapon === 'laser') {
        this.fireLaser(entity, baseAngle, shots.length, profile, muzzle);
        return;
      }
      if (weapon === 'sword' || weapon === 'hammer') {
        this.fireMelee(entity, baseAngle, profile);
        return;
      }
      if (weapon === 'spike') {
        this.placeSpike(entity, baseAngle, profile);
        return;
      }

      // Spread each shot from the character's centre along its OWN direction.
      // Rear/diagonal shots no longer start inside the body (and instantly
      // vanish) — they emerge just outside the hitbox facing where they travel.
      const weaponSide = weaponIndex * 0.28 - 0.3;
      for (const shot of shots) {
        const a = baseAngle + shot.angleOffset;
        const dirX = Math.cos(a);
        const dirZ = Math.sin(a);
        const perpX = -Math.sin(a);
        const perpZ = Math.cos(a);
        const forward = entity.radius + 0.7 + profile.radius;
        const side = weaponSide + shot.perpOffset;
        const isCrit = this.rng.next() < entity.stats.critChance;
        const proj: Projectile = {
          id: this.state.id(),
          ownerId: entity.id,
          kind: weapon,
          pos: {
            x: entity.pos.x + dirX * forward + perpX * side,
            z: entity.pos.z + dirZ * forward + perpZ * side,
          },
          vel: { x: dirX * profile.speed, z: dirZ * profile.speed },
          radius: profile.radius,
          damage: finalDamage(entity, profile.damage, shot.damageMult, isCrit),
          traveled: 0,
          maxRange: profile.range,
          bouncesRemaining: entity.stats.bounce,
          pierceRemaining: entity.stats.pierce,
          hitEntities: new Set<number>(),
          isCrit,
          element: entity.element,
          homing: profile.homing,
          alive: true,
          age: 0,
        };
        this.state.projectiles.push(proj);
      }
    });
  }

  /** Drop a spike just ahead of the character; only the owner is immune. */
  private placeSpike(entity: Entity, angle: number, profile: WeaponProfile): void {
    const stacks = entity.upgrades.weapon_spike ?? 0;
    for (let i = 0; i < Math.max(1, stacks); i++) {
      const a = angle + (i === 0 ? 0 : (i % 2 === 0 ? 1 : -1) * 0.45);
      this.state.spikes.push({
        id: this.state.id(),
        ownerId: entity.id,
        pos: {
          x: entity.pos.x + Math.cos(a) * (entity.radius + 0.8),
          z: entity.pos.z + Math.sin(a) * (entity.radius + 0.8),
        },
        radius: profile.radius,
        damage: profile.damage,
        age: 0,
        life: SPIKES.LIFE,
        hitEntities: new Set<number>(),
      });
    }
    this.state.events.emit({ type: 'spike-place', x: entity.pos.x, z: entity.pos.z, ownerId: entity.id });
  }

  /** Instant close-range arc that hits every enemy in a forward cone. */
  private fireMelee(entity: Entity, angle: number, profile: WeaponProfile): void {
    const half = (MELEE.ARC_HALF_ANGLE_DEG * Math.PI) / 180;
    for (const target of this.state.livingEntities) {
      if (target.id === entity.id) continue;
      const dx = target.pos.x - entity.pos.x;
      const dz = target.pos.z - entity.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > profile.range + target.radius) continue;
      const toTarget = Math.atan2(dz, dx);
      const diff = Math.atan2(Math.sin(toTarget - angle), Math.cos(toTarget - angle));
      if (Math.abs(diff) > half) continue;
      const isCrit = this.rng.next() < entity.stats.critChance;
      this.damageEntity(target, finalDamage(entity, profile.damage, 1, isCrit), entity, entity.element, isCrit);
    }
    this.state.meleeSwings.push({
      id: this.state.id(),
      ownerId: entity.id,
      from: { ...entity.pos },
      angle,
      range: profile.range,
      kind: profile.kind,
      age: 0,
      life: MELEE.SWING_VISUAL_LIFE,
    });
    this.state.events.emit({ type: 'melee-swing', x: entity.pos.x, z: entity.pos.z, kind: profile.kind, ownerId: entity.id });
  }

  private fireLaser(
    entity: Entity,
    angle: number,
    shotCount: number,
    profile: WeaponProfile,
    muzzle: Vec2,
  ): void {
    const dirX = Math.cos(angle);
    const dirZ = Math.sin(angle);
    const maxRange = profile.range;
    let endX = muzzle.x + dirX * maxRange;
    let endZ = muzzle.z + dirZ * maxRange;
    let bestDist = maxRange;

    for (const w of this.map.walls) {
      const hit = rayVsBox(muzzle, dirX, dirZ, maxRange, w);
      if (hit !== null && hit < bestDist) {
        bestDist = hit;
        endX = muzzle.x + dirX * hit;
        endZ = muzzle.z + dirZ * hit;
      }
    }

    const targets: Entity[] = [];
    for (const other of this.state.livingEntities) {
      if (other.id === entity.id) continue;
      const t = rayCircle(muzzle, dirX, dirZ, other.pos, other.radius + 0.1);
      if (t !== null && t >= 0 && t <= bestDist) targets.push(other);
    }
    targets.sort((a, b) => {
      const ta = rayCircle(muzzle, dirX, dirZ, a.pos, a.radius) ?? Infinity;
      const tb = rayCircle(muzzle, dirX, dirZ, b.pos, b.radius) ?? Infinity;
      return ta - tb;
    });

    let pierce = entity.stats.pierce + Math.max(0, shotCount - 1);
    for (const target of targets) {
      const isCrit = this.rng.next() < entity.stats.critChance;
      const dmg = finalDamage(entity, profile.damage, 1, isCrit);
      this.damageEntity(target, dmg, entity, entity.element);
      if (pierce-- <= 0) break;
    }

    this.state.lasers.push({
      id: this.state.id(),
      ownerId: entity.id,
      from: { ...muzzle },
      to: { x: endX, z: endZ },
      element: entity.element,
      age: 0,
      life: COMBAT.LASER_VISUAL_LIFE,
    });
    this.state.events.emit({ type: 'laser', from: { ...muzzle }, to: { x: endX, z: endZ }, ownerId: entity.id });
  }

  /** Create/remove orbiting pets to match an owner's purchased pet upgrades. */
  private ensurePets(owner: Entity): void {
    const kinds: PetKind[] = ['sickle', 'laser', 'shuriken', 'bomb'];
    const wanted: PetKind[] = [];
    for (const kind of kinds) {
      const stacks = owner.upgrades[`pet_${kind}`] ?? 0;
      for (let i = 0; i < stacks; i++) wanted.push(kind);
    }
    const owned = this.state.pets.filter((p) => p.ownerId === owner.id);
    for (const pet of owned.slice(wanted.length)) {
      const index = this.state.pets.indexOf(pet);
      if (index >= 0) this.state.pets.splice(index, 1);
    }
    while (owned.length < wanted.length) {
      const slot = owned.length;
      const pet = {
        id: this.state.id(),
        ownerId: owner.id,
        kind: wanted[slot],
        angle: (slot / Math.max(1, wanted.length)) * Math.PI * 2,
        radius: 1.6 + slot * 0.35,
        cooldown: this.rng.range(0, 0.8),
        stack: slot,
      };
      this.state.pets.push(pet);
      owned.push(pet);
    }
  }

  /** Orbit pets and let them fire independent projectiles at nearby enemies. */
  private updatePets(dt: number): void {
    for (const owner of this.state.entities) {
      if (owner.alive) this.ensurePets(owner);
    }
    for (let i = this.state.pets.length - 1; i >= 0; i--) {
      const pet = this.state.pets[i];
      const owner = this.state.getEntity(pet.ownerId);
      if (!owner || !owner.alive) { this.state.pets.splice(i, 1); continue; }
      pet.angle += dt * 2.4;
      pet.cooldown -= dt;
      if (pet.cooldown > 0) continue;

      let target: Entity | undefined;
      let bestD = 10;
      for (const e of this.state.livingEntities) {
        if (e.id === owner.id) continue;
        const d = len(e.pos.x - owner.pos.x, e.pos.z - owner.pos.z);
        if (d < bestD) { bestD = d; target = e; }
      }
      if (!target) continue;

      const petPos = {
        x: owner.pos.x + Math.cos(pet.angle) * pet.radius,
        z: owner.pos.z + Math.sin(pet.angle) * pet.radius,
      };
      const kind: WeaponKind = pet.kind === 'sickle' ? 'scythe'
        : pet.kind === 'laser' ? 'shuriken'
          : pet.kind === 'shuriken' ? 'shuriken' : 'bolt';
      const profile = weaponProfile(owner, kind);
      const dx = target.pos.x - petPos.x;
      const dz = target.pos.z - petPos.z;
      const d = Math.hypot(dx, dz) || 1;
      const isCrit = this.rng.next() < owner.stats.critChance;
      this.state.projectiles.push({
        id: this.state.id(),
        ownerId: owner.id,
        kind,
        pos: { ...petPos },
        vel: { x: (dx / d) * profile.speed, z: (dz / d) * profile.speed },
        radius: profile.radius * 0.8,
        damage: finalDamage(owner, profile.damage * 0.55, 1, isCrit),
        traveled: 0,
        maxRange: 9,
        bouncesRemaining: 0,
        pierceRemaining: 0,
        hitEntities: new Set<number>(),
        isCrit,
        element: pet.kind === 'bomb' ? 'fire' : 'none',
        homing: pet.kind === 'sickle' ? 3 : 0,
        alive: true,
        age: 0,
      });
      this.state.events.emit({ type: 'pet-shot', x: petPos.x, z: petPos.z, kind: pet.kind });
      pet.cooldown = pet.kind === 'laser' ? 0.55 : 0.9;
    }
  }

  private updateProjectiles(dt: number): void {
    for (const p of this.state.projectiles) {
      if (!p.alive) continue;
      p.age += dt;
      const speed = len(p.vel.x, p.vel.z);
      const steps = subStepsFor(speed);
      const h = dt / steps;

      for (let s = 0; s < steps && p.alive; s++) {
        // Homing: steer velocity toward the nearest living enemy.
        if (p.homing > 0) {
          const target = this.nearestEnemy(p, p.ownerId);
          if (target) {
            const desired = Math.atan2(target.pos.z - p.pos.z, target.pos.x - p.pos.x);
            const current = Math.atan2(p.vel.z, p.vel.x);
            const diff = Math.atan2(Math.sin(desired - current), Math.cos(desired - current));
            const turn = Math.max(-p.homing * h, Math.min(p.homing * h, diff));
            const a = current + turn;
            const sp = len(p.vel.x, p.vel.z);
            p.vel.x = Math.cos(a) * sp;
            p.vel.z = Math.sin(a) * sp;
          }
        }

        p.pos.x += p.vel.x * h;
        p.pos.z += p.vel.z * h;
        p.traveled += speed * h;

        // Wall collision — brief grace so shots spawned near cover aren't
        // destroyed on their very first tick before they're ever seen.
        let wallHit = false;
        if (p.age > 0.04) {
          this.queryBuf.length = 0;
          const wallIds = this.wallGrid.queryNearby(p.pos, this.queryBuf);
          for (const id of wallIds) {
            const hit = circleVsBox(p.pos, p.radius, this.map.walls[id], false);
            if (!hit.hit) continue;
            wallHit = true;
            if (p.bouncesRemaining > 0) {
              p.pos.x += hit.nx * hit.depth;
              p.pos.z += hit.nz * hit.depth;
              reflect(p.vel, hit.nx, hit.nz);
              p.bouncesRemaining -= 1;
              p.hitEntities.clear();
              this.state.events.emit({ type: 'bounce', x: p.pos.x, z: p.pos.z });
            } else {
              p.alive = false;
              this.state.events.emit({ type: 'impact', x: p.pos.x, z: p.pos.z, element: p.element });
              const owner = this.state.getEntity(p.ownerId);
              const explosive = owner?.upgrades.explosive_tip ?? 0;
              if (owner && explosive > 0) {
                this.explode(p.pos, p.damage * 0.6 * explosive, 2.2, owner, -1);
              }
            }
            break;
          }
        }
        if (wallHit && !p.alive) break;

        // Entity collision.
        this.queryBuf.length = 0;
        const entityIds = this.entityGrid.queryNearby(p.pos, this.queryBuf);
        for (const id of entityIds) {
          if (id === p.ownerId || p.hitEntities.has(id)) continue;
          const target = this.state.getEntity(id);
          if (!target || !target.alive) continue;
          if (!circlesOverlap(p.pos, p.radius, target.pos, target.radius)) continue;
          p.hitEntities.add(id);
          this.damageEntity(target, p.damage, this.state.getEntity(p.ownerId), p.element, p.isCrit);
          if (p.pierceRemaining > 0) {
            p.pierceRemaining -= 1;
          } else {
            p.alive = false;
            break;
          }
        }
        if (!p.alive) break;
        if (p.traveled >= p.maxRange) {
          p.alive = false;
          break;
        }
      }
    }
  }

  private nearestEnemy(p: Projectile, ownerId: number): Entity | undefined {
    let best: Entity | undefined;
    let bestD = Infinity;
    for (const e of this.state.livingEntities) {
      if (e.id === ownerId) continue;
      const d = len(e.pos.x - p.pos.x, e.pos.z - p.pos.z);
      if (d < bestD && d < 12) { bestD = d; best = e; }
    }
    return best;
  }

  private damageEntity(
    target: Entity,
    amount: number,
    source: Entity | undefined,
    element: string,
    isCrit = false,
    allowEffects = true,
  ): void {
    if (!target.alive || this.state.time < target.invulnUntil) return;
    const shieldStacks = target.upgrades.rotating_shield ?? 0;
    if (shieldStacks > 0) {
      amount *= Math.max(0.2, 1 - shieldStacks * ROTATING.SHIELD_REDUCTION_PER_STACK);
    }
    target.hp -= amount;
    target.hitFlash = 0.14;
    this.state.events.emit({
      type: 'hit', x: target.pos.x, z: target.pos.z, targetId: target.id,
      amount, crit: isCrit, sourceId: source?.id,
    });
    if (element === 'fire') {
      target.burnUntil = this.state.time + COMBAT.BURN_DURATION;
      target.burnDps = COMBAT.BURN_DPS;
    } else if (element === 'frost') {
      target.slowUntil = this.state.time + COMBAT.FROST_DURATION;
      target.slowFactor = 1 - COMBAT.FROST_SLOW_FACTOR;
    }

    if (allowEffects && source) {
      const up = source.upgrades;
      const vamp = up.vampiric_tip ?? 0;
      if (vamp > 0) source.hp = Math.min(source.stats.maxHp, source.hp + vamp * 0.25);
      const chain = up.chain_tip ?? 0;
      if (chain > 0) this.chainHit(target, source, amount * 0.5, chain);
      const explosive = up.explosive_tip ?? 0;
      if (explosive > 0) this.explode(target.pos, amount * 0.6 * explosive, 2.2, source, target.id);
    }

    if (target.hp <= 0) this.killEntity(target, source);
  }

  /** Arc a hit to nearby enemies; chained damage does not re-trigger effects. */
  private chainHit(from: Entity, owner: Entity, damage: number, count: number): void {
    let current = from;
    const chained = new Set<number>([from.id]);
    for (let i = 0; i < count; i++) {
      let next: Entity | undefined;
      let bestD = 4.5;
      for (const e of this.state.livingEntities) {
        if (e.id === owner.id || chained.has(e.id)) continue;
        const d = len(e.pos.x - current.pos.x, e.pos.z - current.pos.z);
        if (d < bestD) { bestD = d; next = e; }
      }
      if (!next) break;
      this.state.events.emit({
        type: 'chain', from: { ...current.pos }, to: { ...next.pos }, ownerId: owner.id,
      });
      this.damageEntity(next, damage, owner, 'none', false, false);
      chained.add(next.id);
      current = next;
    }
  }

  /** Area damage around an impact; explosion damage does not re-trigger effects. */
  private explode(pos: Vec2, damage: number, radius: number, owner: Entity, excludeId: number): void {
    this.state.events.emit({ type: 'explosion', x: pos.x, z: pos.z, radius });
    for (const e of this.state.livingEntities) {
      if (e.id === owner.id || e.id === excludeId) continue;
      if (len(e.pos.x - pos.x, e.pos.z - pos.z) <= radius) {
        this.damageEntity(e, damage, owner, 'none', false, false);
      }
    }
  }

  private killEntity(victim: Entity, killer: Entity | undefined): void {
    if (!victim.alive) return;
    victim.alive = false;
    victim.hp = 0;
    victim.respawnTimer = this.controller.rules.respawns ? SPAWNING.RESPAWN_SECONDS : Infinity;
    this.state.events.emit({ type: 'death', x: victim.pos.x, z: victim.pos.z, victimId: victim.id, killerId: killer?.id });

    if (killer && killer.id !== victim.id) {
      killer.kills += 1;
      killer.score += MODE.SCORE_PER_KILL;
      killer.killStreak = this.state.time - killer.lastKillTime < 5 ? killer.killStreak + 1 : 1;
      killer.lastKillTime = this.state.time;
      if (killer.killStreak >= 1) {
        this.state.events.emit({
          type: 'kill-streak', streak: killer.killStreak,
          name: killer.name, entityId: killer.id,
        });
      }
      const reward = killXp(victim.level);
      this.addXp(killer, reward);
      this.state.events.emit({ type: 'kill-xp', x: victim.pos.x, z: victim.pos.z, value: reward, entityId: killer.id });
      if (killer.archetype === 'knight') {
        killer.hp = Math.min(killer.stats.maxHp, killer.hp + killer.stats.maxHp * 0.12);
      }
    }

    // Drop a small XP cluster.
    const drops = victim.isBot ? 3 : 4;
    for (let i = 0; i < drops; i++) {
      this.spawnGem({
        x: victim.pos.x + this.rng.range(-0.8, 0.8),
        z: victim.pos.z + this.rng.range(-0.8, 0.8),
      }, i === 0 ? 'green' : this.randomGemKind());
    }

    this.controller.onDeath(victim, killer);
  }

  // ------------------------------------------------------------------ lasers

  private updateLasers(dt: number): void {
    for (const beam of this.state.lasers) beam.age += dt;
  }

  private updateSpikes(dt: number): void {
    for (let i = this.state.spikes.length - 1; i >= 0; i--) {
      const spike = this.state.spikes[i];
      spike.age += dt;
      if (spike.age >= spike.life) { this.state.spikes.splice(i, 1); continue; }
      for (const e of this.state.livingEntities) {
        if (spike.hitEntities.has(e.id)) continue;
        if (spike.ownerId === e.id) continue; // owner is immune to their own spikes
        if ((e.upgrades.metal_shoes ?? 0) > 0) continue; // Metal Shoes: immune to all spikes
        if (len(e.pos.x - spike.pos.x, e.pos.z - spike.pos.z) > spike.radius + e.radius) continue;
        spike.hitEntities.add(e.id);
        const owner = spike.ownerId === 0 ? undefined : this.state.getEntity(spike.ownerId);
        this.damageEntity(e, spike.damage, owner, 'none');
        this.state.events.emit({ type: 'spike-hit', x: spike.pos.x, z: spike.pos.z, entityId: e.id });
      }
    }
  }

  /** An orbiting weapon damages enemies it sweeps past. */
  private updateOrbitWeapons(_dt: number): void {
    for (const e of this.state.livingEntities) {
      const stacks = e.upgrades.weapon_orbit ?? 0;
      if (stacks <= 0) continue;
      const profile = weaponProfile(e, e.weapon);
      const damage = Math.max(6, profile.damage * SPIKES.ORBIT_DAMAGE_MULT * stacks);
      for (const target of this.state.livingEntities) {
        if (target.id === e.id) continue;
        if (len(target.pos.x - e.pos.x, target.pos.z - e.pos.z) > SPIKES.ORBIT_RANGE + target.radius) continue;
        const last = e.orbitHitTimes.get(target.id) ?? -100;
        if (this.state.time - last < SPIKES.ORBIT_HIT_INTERVAL) continue;
        e.orbitHitTimes.set(target.id, this.state.time);
        this.damageEntity(target, damage, e, 'none');
        this.state.events.emit({ type: 'orbit-hit', x: target.pos.x, z: target.pos.z, ownerId: e.id });
      }
    }
  }

  /** Rotating shurikens and shields sweep nearby enemies on their own timers. */
  private updateRotatingOrnaments(_dt: number): void {
    for (const owner of this.state.entities) {
      if (!owner.alive) continue;
      const shurikens = owner.upgrades.rotating_shuriken ?? 0;
      const shields = owner.upgrades.rotating_shield ?? 0;
      if (shurikens === 0 && shields === 0) continue;

      for (const target of this.state.livingEntities) {
        if (target.id === owner.id) continue;
        const d = len(target.pos.x - owner.pos.x, target.pos.z - owner.pos.z);

        if (shurikens > 0 && d <= ROTATING.SHURIKEN_RANGE + target.radius) {
          const last = owner.shurikenHitTimes.get(target.id) ?? -100;
          if (this.state.time - last >= ROTATING.SHURIKEN_INTERVAL) {
            owner.shurikenHitTimes.set(target.id, this.state.time);
            const dmg = ROTATING.SHURIKEN_DAMAGE * shurikens;
            this.damageEntity(target, dmg, owner, 'none');
            this.state.events.emit({ type: 'rotating-shuriken-hit', x: target.pos.x, z: target.pos.z, ownerId: owner.id });
          }
        }

        if (shields > 0 && d <= ROTATING.SHIELD_RANGE + target.radius) {
          const last = owner.shieldHitTimes.get(target.id) ?? -100;
          if (this.state.time - last >= ROTATING.SHIELD_INTERVAL) {
            owner.shieldHitTimes.set(target.id, this.state.time);
            const dmg = ROTATING.SHIELD_DAMAGE * shields;
            this.damageEntity(target, dmg, owner, 'none');
            this.state.events.emit({ type: 'rotating-shield-hit', x: target.pos.x, z: target.pos.z, ownerId: owner.id });
          }
        }
      }
    }
  }

  private updateMeleeSwings(dt: number): void {
    for (let i = this.state.meleeSwings.length - 1; i >= 0; i--) {
      const swing = this.state.meleeSwings[i];
      swing.age += dt;
      if (swing.age >= swing.life) this.state.meleeSwings.splice(i, 1);
    }
  }

  // ----------------------------------------------------------------- pickups

  private updatePickups(dt: number): void {
    for (const gem of this.state.gems) {
      gem.bob += dt * 3;
      // Magnet: nearest living entity within range pulls the gem in.
      let puller: Entity | undefined;
      let bestD = Infinity;
      for (const e of this.state.livingEntities) {
        const d = len(e.pos.x - gem.pos.x, e.pos.z - gem.pos.z);
        if (d < e.stats.magnetRange && d < bestD) { bestD = d; puller = e; }
      }
      if (puller) {
        if (bestD < 0.55) {
          const collected = gem.value;
          this.addXp(puller, collected);
          gem.value = -1; // mark collected; removed in cleanup()
          this.state.events.emit({ type: 'xp', x: gem.pos.x, z: gem.pos.z, value: collected, entityId: puller.id });
        } else {
          const pull = Math.min(1, (8 * dt) / Math.max(0.1, bestD));
          gem.pos.x += (puller.pos.x - gem.pos.x) * pull;
          gem.pos.z += (puller.pos.z - gem.pos.z) * pull;
        }
      }
    }
    for (const heart of this.state.hearts) {
      heart.bob += dt * 2.4;
      for (const e of this.state.livingEntities) {
        if (e.hp >= e.stats.maxHp) continue;
        if (len(e.pos.x - heart.pos.x, e.pos.z - heart.pos.z) < 0.8) {
          e.hp = Math.min(e.stats.maxHp, e.hp + heart.heal);
          heart.heal = -1;
          this.state.events.emit({ type: 'heart', x: heart.pos.x, z: heart.pos.z, entityId: e.id });
          break;
        }
      }
    }

    // Animated EXP orbs: gentle standby drift, then a pickup animation on collect.
    for (const orb of this.state.orbs) {
      orb.bob += dt * 2.5;
      orb.spin += dt * (orb.size === 'large' ? 1.6 : 2.2);
      if (orb.collected) {
        orb.collectAnim -= dt;
        const target = this.state.getEntity(orb.targetId);
        if (target) {
          const raw = 1 - Math.max(0, orb.collectAnim) / SPAWNING.ORB_ABSORB_TIME;
          const t = raw * raw * (3 - 2 * raw); // smoothstep ease-in-out
          orb.pos.x = orb.absorbFrom.x + (target.pos.x - orb.absorbFrom.x) * t;
          orb.pos.z = orb.absorbFrom.z + (target.pos.z - orb.absorbFrom.z) * t;
        }
        if (orb.collectAnim <= 0 && target) {
          this.state.events.emit({
            type: 'orb-absorb', x: target.pos.x, z: target.pos.z,
            size: orb.size, entityId: target.id,
          });
        }
        continue;
      }
      orb.pos.x += Math.sin(orb.bob * 0.7) * dt * 0.3;
      orb.pos.z += Math.cos(orb.bob * 0.6) * dt * 0.3;
      for (const e of this.state.livingEntities) {
        if (len(e.pos.x - orb.pos.x, e.pos.z - orb.pos.z) < 0.7 + e.radius) {
          const collected = orb.value;
          this.addXp(e, collected);
          orb.collected = true;
          orb.collectAnim = SPAWNING.ORB_ABSORB_TIME;
          orb.targetId = e.id;
          orb.absorbFrom = { ...orb.pos };
          this.state.events.emit({
            type: 'orb-pickup', x: orb.pos.x, z: orb.pos.z,
            value: collected, size: orb.size, entityId: e.id,
          });
          break;
        }
      }
    }

    // Regrow pickups over time.
    this.gemSpawnTimer += dt;
    this.heartSpawnTimer += dt;
    this.orbSpawnTimer += dt;
    if (this.gemSpawnTimer >= SPAWNING.GEM_RESPAWN_INTERVAL) {
      this.gemSpawnTimer = 0;
      if (this.state.gems.length < SPAWNING.INITIAL_GEMS) {
        if (this.state.zone.active && this.rng.next() < 0.35) {
          const a = this.rng.range(0, Math.PI * 2);
          const r = this.rng.range(0, Math.max(1, this.state.zone.targetRadius * 0.6));
          this.spawnGem({ x: this.state.zone.center.x + Math.cos(a) * r, z: this.state.zone.center.z + Math.sin(a) * r }, 'gold');
        } else {
          this.spawnGem();
        }
      }
    }
    if (this.heartSpawnTimer >= SPAWNING.HEART_RESPAWN_INTERVAL) {
      this.heartSpawnTimer = 0;
      if (this.state.hearts.length < SPAWNING.INITIAL_HEARTS) this.spawnHeart();
    }
    if (this.orbSpawnTimer >= SPAWNING.ORB_RESPAWN_INTERVAL) {
      this.orbSpawnTimer = 0;
      if (this.state.orbs.length < SPAWNING.INITIAL_ORBS) this.spawnOrb();
    }
  }

  private addXp(entity: Entity, amount: number): void {
    if (entity.level >= MAX_LEVEL) return;
    entity.xp += amount * (1 + entity.stats.xpBonus);
    let levels = 0;
    while (entity.level < MAX_LEVEL && entity.xp >= entity.xpToNext) {
      entity.xp -= entity.xpToNext;
      entity.level += 1;
      entity.xpToNext = xpRequired(entity.level);
      entity.pendingDrafts += 1;
      const previousMax = entity.stats.maxHp;
      entity.stats.maxHp = hpBarsForLevel(entity.level);
      entity.hp = Math.min(entity.stats.maxHp, entity.hp + (entity.stats.maxHp - previousMax));
      this.updateSize(entity);
      levels += 1;
    }
    if (entity.level >= MAX_LEVEL) entity.xp = 0;
    if (levels > 0) {
      this.state.events.emit({ type: 'levelup', entityId: entity.id, level: entity.level });
    }
  }

  /** Apply a chosen upgrade to an entity and consume a pending draft. */
  chooseUpgrade(entity: Entity, upgradeId: string): boolean {
    const upgrade = getUpgrade(upgradeId);
    if (!upgrade || entity.pendingDrafts <= 0) return false;
    if ((entity.upgrades[upgradeId] ?? 0) >= upgrade.maxStacks) return false;
    upgrade.apply(entity);
    entity.pendingDrafts -= 1;
    this.state.events.emit({ type: 'upgrade', entityId: entity.id, upgradeId });
    return true;
  }

  // --------------------------------------------------------------- zone / respawn

  private applyZoneDamage(dt: number): void {
    const z = this.state.zone;
    if (!z.active) return;
    for (const e of this.state.livingEntities) {
      const d = len(e.pos.x - z.center.x, e.pos.z - z.center.z);
      if (d > z.radius) {
        this.damageEntity(e, z.damagePerSec * dt, undefined, 'none');
        this.state.events.emit({ type: 'zone-damage', entityId: e.id });
      }
    }
  }

  private updateRespawns(dt: number): void {
    for (const e of this.state.entities) {
      if (e.alive || !isFinite(e.respawnTimer)) continue;
      e.respawnTimer -= dt;
      if (e.respawnTimer > 0) continue;

      if (this.config.mode === 'blitz' && !e.isBot) {
        // Retain 50% of stacked upgrades.
        for (const key of Object.keys(e.upgrades)) {
          e.upgrades[key] = Math.floor(e.upgrades[key] / 2);
          if (e.upgrades[key] === 0) delete e.upgrades[key];
        }
      }
      this.recomputeStats(e);
      this.updateSize(e);
      e.hp = e.stats.maxHp;
      e.alive = true;
      e.killStreak = 0;
      e.pos = { ...this.safeSpawn(e) };
      e.vel = { x: 0, z: 0 };
      e.burnUntil = 0;
      e.slowUntil = 0;
      e.invulnUntil = this.state.time + 1;
      e.score = Math.max(0, e.score);
      this.state.events.emit({ type: 'respawn', entityId: e.id, x: e.pos.x, z: e.pos.z });
    }
  }

  /**
   * Keep the arena populated. New bots are spawned at levels at or just below
   * the player's current level (never above it, never above MAX_LEVEL).
   */
  private maybeReinforce(dt: number): void {
    if (this.config.mode === 'battle_royale' || this.controller.finished) return;
    this.reinforceTimer += dt;
    if (this.reinforceTimer < SPAWNING.REINFORCE_INTERVAL) return;
    if (this.state.livingEntities.length >= SPAWNING.MIN_POPULATION) {
      this.reinforceTimer = 0;
      return;
    }

    const playerLevel = this.state.player?.level ?? 0;
    const maxLevel = Math.min(playerLevel, MAX_LEVEL);
    const minLevel = Math.max(0, maxLevel - 2);
    const level = this.rng.int(minLevel, maxLevel);
    const archetypeIds = Object.keys(ARCHETYPES);
    const botArch = archetypeIds[this.rng.int(0, archetypeIds.length - 1)];
    const index = this.state.entities.length;
    const bot = this.createEntity(true, botArch, this.config.difficulty, { x: 0, z: 0 }, index);
    bot.level = level;
    bot.xpToNext = xpRequired(level);
    bot.xp = 0;
    this.recomputeStats(bot);
    this.updateSize(bot);
    bot.hp = bot.stats.maxHp;
    bot.pos = { ...this.safeSpawn(bot) };
    bot.invulnUntil = this.state.time + 1;
    this.state.events.emit({ type: 'reinforce', entityId: bot.id, level, x: bot.pos.x, z: bot.pos.z });
    this.reinforceTimer = 0;
  }

  private cleanup(): void {
    for (let i = this.state.projectiles.length - 1; i >= 0; i--) {
      if (!this.state.projectiles[i].alive) this.state.projectiles.splice(i, 1);
    }
    for (let i = this.state.lasers.length - 1; i >= 0; i--) {
      if (this.state.lasers[i].age >= this.state.lasers[i].life) this.state.lasers.splice(i, 1);
    }
    for (let i = this.state.gems.length - 1; i >= 0; i--) {
      if (this.state.gems[i].value < 0) this.state.gems.splice(i, 1);
    }
    for (let i = this.state.hearts.length - 1; i >= 0; i--) {
      if (this.state.hearts[i].heal < 0) this.state.hearts.splice(i, 1);
    }
    for (let i = this.state.orbs.length - 1; i >= 0; i--) {
      const orb = this.state.orbs[i];
      if (orb.collected && orb.collectAnim <= 0) this.state.orbs.splice(i, 1);
    }
  }

  // -------------------------------------------------------------------- utils

  getLeaderboard(limit = 8): Entity[] {
    return [...this.state.entities]
      .sort((a, b) => b.score - a.score || b.kills - a.kills)
      .slice(0, limit);
  }
}

/** Ray vs AABB slab test on the X–Z plane; returns entry distance or null. */
function rayVsBox(origin: Vec2, dx: number, dz: number, maxDist: number, box: { minX: number; maxX: number; minZ: number; maxZ: number }): number | null {
  let tmin = 0;
  let tmax = maxDist;
  const inv = (d: number) => (Math.abs(d) < 1e-9 ? 1e9 : 1 / d);
  const ix = inv(dx);
  const iz = inv(dz);
  let t1 = (box.minX - origin.x) * ix;
  let t2 = (box.maxX - origin.x) * ix;
  tmin = Math.max(tmin, Math.min(t1, t2));
  tmax = Math.min(tmax, Math.max(t1, t2));
  t1 = (box.minZ - origin.z) * iz;
  t2 = (box.maxZ - origin.z) * iz;
  tmin = Math.max(tmin, Math.min(t1, t2));
  tmax = Math.min(tmax, Math.max(t1, t2));
  if (tmax >= tmin && tmin >= 0 && tmin <= maxDist) return tmin;
  return null;
}

/** Ray vs circle; returns nearest positive intersection distance or null. */
function rayCircle(origin: Vec2, dx: number, dz: number, center: Vec2, radius: number): number | null {
  const ox = origin.x - center.x;
  const oz = origin.z - center.z;
  const b = 2 * (ox * dx + oz * dz);
  const c = ox * ox + oz * oz - radius * radius;
  const disc = b * b - 4 * c;
  if (disc < 0) return null;
  const sq = Math.sqrt(disc);
  const t1 = (-b - sq) / 2;
  const t2 = (-b + sq) / 2;
  if (t1 >= 0) return t1;
  if (t2 >= 0) return t2;
  return null;
}

