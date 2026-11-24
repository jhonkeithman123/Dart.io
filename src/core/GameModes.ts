/**
 * Game mode rulesets and controller state machine (§4).
 * Modes share the core combat loop but override population, respawn,
 * zone, timer, and win-condition behavior.
 */

import type { ArchetypeId, BotDifficulty, GameModeId } from './types';
import type { WorldState } from './WorldState';
import { ARENA, MODE, SPAWNING } from './constants';
import type { Entity } from './types';

// Re-export a convenient alias since WorldState the class lives elsewhere.
export type WorldRef = WorldState;

export interface GameConfig {
  mode: GameModeId;
  archetype: ArchetypeId;
  difficulty: BotDifficulty;
  themeId: string;
  seed?: number;
}

export interface ModeContext {
  world: WorldState;
  config: GameConfig;
  controller: GameModeController;
}

export interface GameModeRules {
  id: GameModeId;
  name: string;
  population: number;
  respawns: boolean;
  arenaSize: number;
  xpMultiplier: number;
  timeLimit: number;
  onStart(ctx: ModeContext): void;
  onTick(ctx: ModeContext): void;
  onDeath(ctx: ModeContext, victim: Entity, killer: Entity | undefined): void;
  isFinished(ctx: ModeContext): boolean;
  resultLabel(ctx: ModeContext): string;
}

function zoneSetup(world: WorldState): void {
  const half = world.map.halfSize;
  world.zone.active = true;
  world.zone.radius = half * 1.05;
  world.zone.targetRadius = half * 1.05;
  world.zone.center = { ...world.map.center };
  world.zone.timer = 0;
  world.zone.phase = 0;
  world.zone.damagePerSec = MODE.ZONE_BASE_DPS;
}

const endless: GameModeRules = {
  id: 'endless',
  name: 'Endless Arena',
  population: SPAWNING.ENDLESS_POPULATION,
  respawns: true,
  arenaSize: ARENA.STANDARD_SIZE,
  xpMultiplier: 1,
  timeLimit: 0,
  onStart(ctx) {
    ctx.world.zone.active = false;
  },
  onTick() { /* pure survival — nothing mode-specific */ },
  onDeath(ctx, victim, killer) {
    if (killer && killer.id !== victim.id && !victim.isBot) {
      ctx.controller.finish('Defeated — score ' + Math.round(victim.score));
    }
  },
  isFinished() { return false; },
  resultLabel(ctx) {
    const p = ctx.world.player;
    return p ? `Score ${Math.round(p.score)} · Level ${p.level} · ${p.kills} kills` : 'Game over';
  },
};

const battleRoyale: GameModeRules = {
  id: 'battle_royale',
  name: 'Battle Royale',
  population: SPAWNING.ROYALE_POPULATION,
  respawns: false,
  arenaSize: ARENA.ROYALE_SIZE,
  xpMultiplier: 1,
  timeLimit: 0,
  onStart(ctx) {
    zoneSetup(ctx.world);
  },
  onTick(ctx) {
    const z = ctx.world.zone;
    z.timer += 1 / 60;
    // Ease radius toward the current target every tick.
    z.radius += (z.targetRadius - z.radius) * 0.04;
    if (z.timer >= MODE.ZONE_SHRINK_INTERVAL) {
      z.timer = 0;
      z.phase += 1;
      z.targetRadius = Math.max(6, z.targetRadius * 0.68);
      // Drift the safe point toward a random offset, clamped inside the arena.
      const drift = 6 + z.phase * 1.5;
      const a = ctx.world.rng.range(0, Math.PI * 2);
      const half = ctx.world.map.halfSize - z.targetRadius - 1;
      const nx = z.center.x + Math.cos(a) * drift;
      const nz = z.center.z + Math.sin(a) * drift;
      z.center.x = Math.max(-half, Math.min(half, nx));
      z.center.z = Math.max(-half, Math.min(half, nz));
      z.damagePerSec = MODE.ZONE_BASE_DPS * Math.pow(MODE.ZONE_DPS_RAMP, z.phase);
      ctx.world.events.emit({ type: 'zone-shrink', phase: z.phase, radius: z.targetRadius });
    }
  },
  onDeath(ctx) {
    const living = ctx.world.livingEntities;
    if (living.length <= 1) {
      const winner = living[0];
      const won = winner && !winner.isBot;
      ctx.controller.finish(won ? 'Victory Royale!' : 'Eliminated', winner?.id);
    }
  },
  isFinished(ctx) { return ctx.world.livingEntities.length <= 1; },
  resultLabel(ctx) {
    const p = ctx.world.player;
    return p && p.alive ? 'Victory Royale!' : `${p?.kills ?? 0} eliminations`;
  },
};

const blitz: GameModeRules = {
  id: 'blitz',
  name: '3-Minute Blitz',
  population: SPAWNING.BLITZ_POPULATION,
  respawns: true,
  arenaSize: ARENA.STANDARD_SIZE,
  xpMultiplier: SPAWNING.BLITZ_XP_MULTIPLIER,
  timeLimit: MODE.BLITZ_DURATION,
  onStart(ctx) {
    ctx.world.zone.active = false;
  },
  onTick(ctx) {
    const remaining = ctx.controller.timeLimit - ctx.controller.elapsed;
    if (remaining <= 0) {
      const p = ctx.world.player;
      ctx.controller.finish('Time!', p?.id);
    }
  },
  onDeath(_ctx, victim) {
    if (victim.isBot) return;
    // Instant respawn, retaining half the earned upgrades (handled by World).
    victim.respawnTimer = 0.05;
  },
  isFinished(ctx) { return ctx.controller.elapsed >= ctx.controller.timeLimit; },
  resultLabel(ctx) {
    const p = ctx.world.player;
    return p ? `Score ${Math.round(p.score)} · ${p.kills} kills` : 'Match complete';
  },
};

export const MODE_RULES: Record<GameModeId, GameModeRules> = {
  endless,
  battle_royale: battleRoyale,
  blitz,
};

export class GameModeController {
  readonly config: GameConfig;
  readonly rules: GameModeRules;
  elapsed = 0;
  timeLimit = 0;
  finished = false;
  finishMessage = '';
  winnerId?: number;
  private ctx: ModeContext;

  constructor(config: GameConfig, world: WorldState) {
    this.config = config;
    this.rules = MODE_RULES[config.mode];
    this.timeLimit = this.rules.timeLimit;
    this.ctx = { world, config, controller: this };
  }

  start(): void {
    this.rules.onStart(this.ctx);
    this.ctx.world.events.emit({ type: 'mode-start', mode: this.rules.id, name: this.rules.name });
  }

  tick(): void {
    if (this.finished) return;
    this.elapsed += 1 / 60;
    this.rules.onTick(this.ctx);
    if (!this.finished && this.rules.isFinished(this.ctx)) {
      this.finish(this.rules.resultLabel(this.ctx));
    }
  }

  onDeath(victim: Entity, killer: Entity | undefined): void {
    this.rules.onDeath(this.ctx, victim, killer);
    if (!this.finished && this.rules.isFinished(this.ctx)) {
      this.finish(this.rules.resultLabel(this.ctx));
    }
  }

  finish(message: string, winnerId?: number): void {
    if (this.finished) return;
    this.finished = true;
    this.finishMessage = message;
    this.winnerId = winnerId;
    this.ctx.world.events.emit({ type: 'game-over', message, winnerId });
  }

  get remaining(): number {
    return Math.max(0, this.timeLimit - this.elapsed);
  }

  get resultLabel(): string {
    return this.rules.resultLabel(this.ctx);
  }
}

export type { ArchetypeId, BotDifficulty, GameModeId };
