/** Headless simulation smoke test with assertions for the tuned gameplay rules. */
import { World } from '../src/core/World';
import { computeBotInput } from '../src/ai/BotBrain';
import { MAX_LEVEL, MOVEMENT, SPAWNING, WEAPONS, hpBarsForLevel, xpRequired } from '../src/core/constants';
import { UPGRADES, RARITY_WEIGHTS, rollDraft, weaponProfile } from '../src/core/UpgradePool';
import type { GameModeId } from '../src/core/types';

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error('ASSERTION FAILED: ' + message);
}

assert(xpRequired(0) === 10, '0→1 should require 10 XP');
assert(xpRequired(1) === 200, '1→2 should require 200 XP');
assert(xpRequired(5) === 1000, '5→6 should require 1000 XP');
assert(MOVEMENT.BASE_SPEED < 4, 'base move speed should be slow and fixed');

// Arsenal: upgrades add weapons and every owned weapon fires each attack.
{
  const w = new World({ mode: 'endless', archetype: 'archer', difficulty: 'easy', themeId: 'classic' });
  w.botInputProvider = null;
  const p = w.state.player;
  const initialArsenal = p.arsenal.length;
  p.pendingDrafts = 4;
  assert(w.chooseUpgrade(p, 'weapon_shuriken'), 'shuriken upgrade accepted');
  assert(w.chooseUpgrade(p, 'weapon_laser'), 'laser upgrade accepted');
  assert(w.chooseUpgrade(p, 'damage_up'), 'damage upgrade accepted');
  assert(p.arsenal.length === initialArsenal + 2, 'arsenal grew by two weapons');
  assert(p.arsenal.includes('shuriken') && p.arsenal.includes('laser'), 'new weapons owned');
  p.fireCooldown = 0;
  w.step({ moveX: 0, moveZ: 0, aimX: 1, aimZ: 0, firing: false, firePressed: true });
  const kinds = new Set(w.state.projectiles.map((pr) => pr.kind));
  assert(kinds.has('bow') && kinds.has('shuriken'), 'bow and shuriken both fired');
  assert(w.state.lasers.some((b) => b.ownerId === p.id), 'laser fired from arsenal');
  console.log(`arsenal: ${p.arsenal.join('+')} · projectile kinds=${[...kinds].join(',')} · dmgMult=${p.stats.damageMult.toFixed(2)}`);
}

// Orb absorb animation: the orb homes into the character that collected it.
{
  const w = new World({ mode: 'endless', archetype: 'archer', difficulty: 'easy', themeId: 'classic' });
  w.botInputProvider = null;
  const p = w.state.player;
  const orb = w.state.orbs[0];
  orb.pos = { x: p.pos.x + 0.4, z: p.pos.z };
  w.step({ moveX: 0, moveZ: 0, aimX: 1, aimZ: 0, firing: false, firePressed: false });
  assert(orb.collected && orb.targetId === p.id, 'orb marked as collected by the player');
  const d0 = Math.hypot(orb.pos.x - p.pos.x, orb.pos.z - p.pos.z);
  for (let i = 0; i < 8; i++) w.step({ moveX: 0, moveZ: 0, aimX: 1, aimZ: 0, firing: false, firePressed: false });
  const d1 = Math.hypot(orb.pos.x - p.pos.x, orb.pos.z - p.pos.z);
  assert(d1 < d0, `absorb animation moves orb toward the character (${d0.toFixed(2)} → ${d1.toFixed(2)})`);
  console.log(`orb absorb: target=${orb.targetId}, distance ${d0.toFixed(2)} → ${d1.toFixed(2)}`);
}

// Upgrade draft revamp: three tiers, equal odds for the common pool.
{
  const stats = UPGRADES.filter((u) => u.category === 'stats');
  const effects = UPGRADES.filter((u) => u.category === 'effect');
  const magic = UPGRADES.find((u) => u.id === 'magic_arrow')!;
  assert(stats.every((u) => u.rarity === 'rare'), 'character stats are rare');
  assert(effects.every((u) => u.rarity === 'super_rare'), 'weapon effects are super rare');
  assert(magic.rarity === 'super_rare', 'magic arrow is super rare');
  assert(
    UPGRADES.filter((u) => u.rarity === 'common').every((u) => RARITY_WEIGHTS.common === 1),
    'all common cards share the same weight',
  );
  assert(RARITY_WEIGHTS.rare < RARITY_WEIGHTS.common && RARITY_WEIGHTS.super_rare < RARITY_WEIGHTS.rare,
    'rarer tiers have lower odds');

  const w = new World({ mode: 'endless', archetype: 'archer', difficulty: 'easy', themeId: 'classic' });
  const p = w.state.player;
  const counts = { common: 0, rare: 0, super_rare: 0 };
  for (let i = 0; i < 2000; i++) {
    for (const card of rollDraft(p, w.rng, 3, 'random')) counts[card.rarity]++;
  }
  assert(counts.common > counts.rare && counts.rare > counts.super_rare, `odds ordering ${JSON.stringify(counts)}`);
  assert(counts.super_rare > 0 && counts.super_rare / 6000 < 0.12, 'super rare is rare but obtainable');

  p.pendingDrafts = 2;
  assert(w.chooseUpgrade(p, 'magic_arrow'), 'magic arrow upgrade accepted');
  assert(p.arsenal.includes('magic'), 'magic arrow added to arsenal');
  assert(weaponProfile(p, 'magic').homing >= 7, 'magic arrow tracks targets');
  p.fireCooldown = 0;
  w.step({ moveX: 0, moveZ: 0, aimX: 1, aimZ: 0, firing: false, firePressed: true });
  const magicShots = w.state.projectiles.filter((pr) => pr.kind === 'magic');
  assert(magicShots.length > 0 && magicShots[0].homing >= 7, 'magic arrow fired with tracking');
  console.log(`draft odds over 6000 offers: ${JSON.stringify(counts)} · magic homing=${magicShots[0]?.homing}`);
}

// Full arsenal: simultaneous shots must fan out instead of stacking invisibly.
{
  const w = new World({ mode: 'endless', archetype: 'archer', difficulty: 'easy', themeId: 'classic' });
  w.botInputProvider = null;
  const p = w.state.player;
  p.pendingDrafts = 8;
  ['weapon_shuriken', 'weapon_scythe', 'weapon_laser', 'weapon_bolt', 'magic_arrow']
    .forEach((id) => w.chooseUpgrade(p, id));
  w.state.projectiles.length = 0;
  p.fireCooldown = 0;
  w.step({ moveX: 0, moveZ: 0, aimX: 1, aimZ: 0, firing: false, firePressed: true });
  const kinds = new Set(w.state.projectiles.map((pr) => pr.kind));
  assert(kinds.has('bow') && kinds.has('shuriken') && kinds.has('scythe') && kinds.has('bolt') && kinds.has('magic'),
    `full arsenal fired: ${[...kinds].join(',')}`);
  const positions = [...new Set(w.state.projectiles.map((pr) => `${pr.pos.x.toFixed(2)},${pr.pos.z.toFixed(2)}`))];
  assert(positions.length >= 4, `muzzles fanned out (${positions.length} distinct spawn points)`);
  console.log(`full arsenal: ${[...kinds].join(',')} · ${positions.length} distinct muzzles · laser=${w.state.lasers.length}`);
}

// Multishot: rear/diagonal/etc must spawn outside the body and survive release.
{
  const w = new World({ mode: 'endless', archetype: 'archer', difficulty: 'easy', themeId: 'classic' });
  w.botInputProvider = null;
  const p = w.state.player;
  p.pendingDrafts = 8;
  ['front_arrow', 'front_arrow', 'diagonal_arrows', 'rear_arrow', 'side_arrows']
    .forEach((id) => w.chooseUpgrade(p, id));
  p.pos = { x: 0, z: 0 };
  w.state.projectiles.length = 0;
  p.fireCooldown = 0;
  w.step({ moveX: 0, moveZ: 0, aimX: 1, aimZ: 0, firing: false, firePressed: true });
  const shots = w.state.projectiles;
  assert(shots.length >= 10, `multishot produced ${shots.length} projectiles`);
  const minDist = Math.min(...shots.map((pr) => Math.hypot(pr.pos.x - p.pos.x, pr.pos.z - p.pos.z)));
  assert(minDist >= p.radius + 0.5, `all shots spawn outside the body (min ${minDist.toFixed(2)})`);
  const initial = shots.length;
  for (let i = 0; i < 3; i++) w.step({ moveX: 0, moveZ: 0, aimX: 1, aimZ: 0, firing: false, firePressed: false });
  assert(w.state.projectiles.length >= initial, `shots survive the first ticks (${initial} → ${w.state.projectiles.length})`);
  console.log(`multishot: ${shots.length} shots, min spawn distance ${minDist.toFixed(2)}, survived 3 ticks`);
}

// Nostalgia: sidekick pets orbit and fire on their own.
{
  const w = new World({ mode: 'endless', archetype: 'jackal', difficulty: 'easy', themeId: 'classic' });
  w.botInputProvider = null;
  const p = w.state.player;
  p.pendingDrafts = 4;
  w.chooseUpgrade(p, 'pet_sickle');
  w.chooseUpgrade(p, 'pet_laser');
  const dummy = w.state.entities.find((e) => e.isBot)!;
  dummy.pos = { x: p.pos.x + 4, z: p.pos.z };
  let petShots = 0;
  w.state.events.on('pet-shot', () => { petShots++; });
  for (let i = 0; i < 180; i++) w.step({ moveX: 0, moveZ: 0, aimX: 1, aimZ: 0, firing: false, firePressed: false });
  assert(p.arsenal.includes('bolt'), 'jackal archetype uses original bolt weapon');
  assert(w.state.pets.length >= 2, `pets spawned (${w.state.pets.length})`);
  assert(petShots > 0, 'pets fire projectiles at nearby enemies');
  assert(w.state.pets.some((pet) => pet.kind === 'sickle' || pet.kind === 'laser'), 'pet kinds correct');
  console.log(`pets: ${w.state.pets.map((pet) => pet.kind).join(',')} · pet shots=${petShots}`);
}

// Innate abilities shouldn't be offered as upgrades (e.g. Sovereign's homing).
{
  const w = new World({ mode: 'endless', archetype: 'sovereign', difficulty: 'easy', themeId: 'classic' });
  const p = w.state.player;
  assert(p.stats.homing > 0, 'sovereign has innate homing');
  for (let i = 0; i < 300; i++) {
    const cards = rollDraft(p, w.rng, 3, 'random');
    assert(!cards.some((c) => c.id === 'homing'), 'homing upgrade not offered to sovereign');
  }
  console.log(`innate filter: sovereign homing=${p.stats.homing}, homing never offered in 300 drafts`);
}

// Melee weapons hit in a close-range forward arc.
{
  const w = new World({ mode: 'endless', archetype: 'archer', difficulty: 'easy', themeId: 'classic' });
  w.botInputProvider = null;
  const p = w.state.player;
  p.pendingDrafts = 2;
  w.chooseUpgrade(p, 'weapon_sword');
  p.pos = { x: 0, z: 0 };
  const enemy = w.state.entities.find((e) => e.isBot)!;
  enemy.pos = { x: 1.8, z: 0 };
  enemy.invulnUntil = 0;
  const hpBefore = enemy.hp;
  p.fireCooldown = 0;
  w.step({ moveX: 0, moveZ: 0, aimX: 1, aimZ: 0, firing: false, firePressed: true });
  assert(enemy.hp < hpBefore, `sword arc damaged enemy (${hpBefore} → ${enemy.hp})`);
  assert(w.state.meleeSwings.length > 0, 'melee swing visual queued');
  console.log(`melee: sword hit for ${(hpBefore - enemy.hp).toFixed(1)}, swings=${w.state.meleeSwings.length}`);
}

// Characters phase through interior walls instead of getting stuck.
{
  const w = new World({ mode: 'endless', archetype: 'archer', difficulty: 'easy', themeId: 'classic' });
  w.botInputProvider = null;
  const p = w.state.player;
  const wall = w.map.walls.find((b) => b.kind === 'maze')!;
  p.pos = { x: (wall.minX + wall.maxX) / 2, z: (wall.minZ + wall.maxZ) / 2 };
  const startX = p.pos.x;
  for (let i = 0; i < 90; i++) w.step({ moveX: 1, moveZ: 0, aimX: 1, aimZ: 0, firing: false, firePressed: false });
  assert(p.pos.x > startX + 2, `character walked through wall (${startX.toFixed(1)} → ${p.pos.x.toFixed(1)})`);
  console.log(`wall phase: ${startX.toFixed(1)} → ${p.pos.x.toFixed(1)}`);
}

// Ground spikes: owner immune, others vulnerable, Metal Shoes immune to all.
{
  const w = new World({ mode: 'endless', archetype: 'archer', difficulty: 'easy', themeId: 'classic' });
  w.botInputProvider = null;
  const p = w.state.player;
  p.pendingDrafts = 2;
  w.chooseUpgrade(p, 'weapon_spike');
  p.pos = { x: 0, z: 0 };
  p.fireCooldown = 0;
  w.step({ moveX: 0, moveZ: 0, aimX: 1, aimZ: 0, firing: false, firePressed: true });
  const spike = w.state.spikes.find((s) => s.ownerId === p.id);
  assert(spike !== undefined, 'spike placed by player');
  const ownerHp = p.hp;
  const enemy = w.state.entities.find((e) => e.isBot)!;
  enemy.invulnUntil = 0;
  enemy.pos = { ...spike!.pos };
  const enemyHp = enemy.hp;
  for (let i = 0; i < 3; i++) w.step({ moveX: 0, moveZ: 0, aimX: 1, aimZ: 0, firing: false, firePressed: false });
  assert(enemy.hp < enemyHp, `enemy hurt by spike (${enemyHp} → ${enemy.hp})`);
  assert(p.hp === ownerHp, 'owner immune to own spike');

  p.pendingDrafts = 1;
  w.chooseUpgrade(p, 'metal_shoes');
  const mapSpike = { ...spike!, id: 99999, ownerId: 0, hitEntities: new Set<number>(), age: 0, life: Infinity };
  w.state.spikes.push(mapSpike);
  p.pos = { ...mapSpike.pos };
  const platedHp = p.hp;
  for (let i = 0; i < 3; i++) w.step({ moveX: 0, moveZ: 0, aimX: 1, aimZ: 0, firing: false, firePressed: false });
  assert(p.hp === platedHp, 'metal shoes grant spike immunity');
  console.log(`spikes: enemy ${enemyHp.toFixed(0)}→${enemy.hp.toFixed(0)}, owner ${ownerHp.toFixed(0)} safe, metal shoes safe`);
}

// Orbiting weapon damages nearby enemies.
{
  const w = new World({ mode: 'endless', archetype: 'archer', difficulty: 'easy', themeId: 'classic' });
  w.botInputProvider = null;
  const p = w.state.player;
  p.pendingDrafts = 2;
  w.chooseUpgrade(p, 'weapon_orbit');
  p.pos = { x: 0, z: 0 };
  const enemy = w.state.entities.find((e) => e.isBot)!;
  enemy.invulnUntil = 0;
  enemy.pos = { x: 1.6, z: 0 };
  const hp = enemy.hp;
  for (let i = 0; i < 30; i++) w.step({ moveX: 0, moveZ: 0, aimX: 1, aimZ: 0, firing: false, firePressed: false });
  assert(enemy.hp < hp, `orbiting weapon damaged nearby enemy (${hp} → ${enemy.hp})`);
  console.log(`orbit: enemy ${hp.toFixed(0)}→${enemy.hp.toFixed(0)}`);
}

// Rotating shuriken (max 6) and rotating shield (max 4).
{
  const shuriken = UPGRADES.find((u) => u.id === 'rotating_shuriken')!;
  const shield = UPGRADES.find((u) => u.id === 'rotating_shield')!;
  assert(shuriken.maxStacks === 6 && shield.maxStacks === 4, 'stack caps are 6 and 4');

  const w = new World({ mode: 'endless', archetype: 'archer', difficulty: 'easy', themeId: 'classic' });
  w.botInputProvider = null;
  const p = w.state.player;
  p.pendingDrafts = 20;
  for (let i = 0; i < 8; i++) w.chooseUpgrade(p, 'rotating_shuriken');
  for (let i = 0; i < 8; i++) w.chooseUpgrade(p, 'rotating_shield');
  assert(p.upgrades.rotating_shuriken === 6, 'shuriken capped at 6');
  assert(p.upgrades.rotating_shield === 4, 'shield capped at 4');

  p.pos = { x: 0, z: 0 };
  const enemy = w.state.entities.find((e) => e.isBot)!;
  enemy.invulnUntil = 0;
  enemy.pos = { x: 1.8, z: 0 };
  const hp = enemy.hp;
  for (let i = 0; i < 30; i++) w.step({ moveX: 0, moveZ: 0, aimX: 1, aimZ: 0, firing: false, firePressed: false });
  assert(enemy.hp < hp, `rotating ornaments damaged enemy (${hp} → ${enemy.hp})`);
  console.log(`rotating: shuriken=${p.upgrades.rotating_shuriken}, shield=${p.upgrades.rotating_shield}, enemy ${hp.toFixed(0)}→${enemy.hp.toFixed(0)}`);
}

// Segmented health bars follow 3 at level 0, +2 to 10, +1 from 11-20.
{
  assert(hpBarsForLevel(0) === 3, 'level 0 has 3 bars');
  assert(hpBarsForLevel(10) === 23, 'level 10 has 23 bars');
  assert(hpBarsForLevel(20) === 33, 'level 20 has 33 bars');
  assert(WEAPONS.bow.damage >= 1 && WEAPONS.hammer.damage <= 2, 'base damage is 1-2');
  const w = new World({ mode: 'endless', archetype: 'archer', difficulty: 'easy', themeId: 'classic' });
  const p = w.state.player;
  assert(p.stats.maxHp === 3 && p.hp === 3, 'player starts with 3 health bars');
  for (let level = 0; level < 20; level++) {
    assert(hpBarsForLevel(level + 1) - hpBarsForLevel(level) === (level < 10 ? 2 : 1),
      `level ${level}→${level + 1} adds ${level < 10 ? 2 : 1} bars`);
  }
  console.log(`health bars: L0=${hpBarsForLevel(0)}, L10=${hpBarsForLevel(10)}, L20=${hpBarsForLevel(20)}`);
}

// Health hearts are heart-shaped and rarer than EXP orbs; removed stat cards stay gone.
{
  assert(!UPGRADES.some((u) => u.id === 'max_hp' || u.id === 'move_speed'), 'max hp and move speed upgrades removed');
  assert(SPAWNING.INITIAL_HEARTS < SPAWNING.INITIAL_ORBS, 'fewer health pickups than EXP orbs');
  assert(SPAWNING.HEART_RESPAWN_INTERVAL > SPAWNING.ORB_RESPAWN_INTERVAL, 'health pickups respawn more slowly');
  const w = new World({ mode: 'endless', archetype: 'archer', difficulty: 'easy', themeId: 'classic' });
  for (let i = 0; i < 200; i++) {
    const cards = rollDraft(w.state.player, w.rng, 3, 'random');
    assert(!cards.some((c) => c.id === 'max_hp' || c.id === 'move_speed'), 'removed upgrades never drafted');
  }
  console.log(`health: hearts=${w.state.hearts.length} vs orbs=${w.state.orbs.length}, removed upgrades absent`);
}

const modes: GameModeId[] = ['endless', 'battle_royale', 'blitz'];

for (const mode of modes) {
  const world = new World({
    mode,
    archetype: 'archer',
    difficulty: 'normal',
    themeId: 'classic',
  });
  world.botInputProvider = computeBotInput;

  // Initial spawn separation.
  const chars = world.state.livingEntities;
  let minDist = Infinity;
  for (let i = 0; i < chars.length; i++) {
    for (let j = i + 1; j < chars.length; j++) {
      minDist = Math.min(minDist, Math.hypot(
        chars[i].pos.x - chars[j].pos.x, chars[i].pos.z - chars[j].pos.z,
      ));
    }
  }
  assert(minDist >= SPAWNING.MIN_SPAWN_DISTANCE - 0.01, `${mode}: initial spawn separation (${minDist.toFixed(2)})`);

  for (let i = 0; i < 3600; i++) {
    world.step({
      moveX: Math.sin(i / 60), moveZ: Math.cos(i / 90), aimX: 1, aimZ: 0.2,
      firing: false, firePressed: i % 30 === 0,
    });
  }

  const p = world.state.player;
  const levels = world.state.entities.map((e) => e.level);
  assert(Math.max(...levels) <= MAX_LEVEL, `${mode}: no level above ${MAX_LEVEL}`);
  assert(world.state.orbs.length > 0, `${mode}: orbs remain in the world`);
  assert(p.level >= 0, `${mode}: level starts at 0`);

  if (mode !== 'battle_royale') {
    const bots = world.state.entities.filter((e) => e.isBot);
    assert(bots.length >= SPAWNING.MIN_POPULATION, `${mode}: population reinforced to ${SPAWNING.MIN_POPULATION}`);
  }

  console.log(
    `${mode}: t=${world.state.time.toFixed(1)}s chars=${world.state.livingEntities.length}`,
    `orbs=${world.state.orbs.length} gems=${world.state.gems.length}`,
    `playerLv=${p.level} maxLv=${Math.max(...levels)} radius=${p.radius.toFixed(2)}`,
    `finished=${world.controller.finished}`,
  );
}
console.log('SMOKE OK');
