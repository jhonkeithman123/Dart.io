/** Phase 1 transport: runs the deterministic core + AI entirely in-browser at 60Hz. */

import type { InputCommand } from '../core/types';
import { World } from '../core/World';
import type { GameConfig } from '../core/GameModes';
import { computeBotInput } from '../ai/BotBrain';
import type { TransportAdapter } from './TransportAdapter';

const NEUTRAL: InputCommand = { moveX: 0, moveZ: 0, aimX: 1, aimZ: 0, firing: false, firePressed: false };

export class LocalLoopAdapter implements TransportAdapter {
  readonly name = 'LocalLoop';
  readonly isAuthoritative = true;
  private world: World | null = null;
  private input: InputCommand = { ...NEUTRAL };
  private config: GameConfig;

  constructor(config: GameConfig) {
    this.config = config;
  }

  start(): World {
    this.world = new World(this.config);
    this.world.botInputProvider = computeBotInput;
    return this.world;
  }

  stop(): void {
    this.world = null;
  }

  submitInput(input: InputCommand): void {
    this.input = input;
  }

  step(): void {
    this.world?.step(this.input);
  }

  getWorld(): World {
    if (!this.world) throw new Error('LocalLoopAdapter not started');
    return this.world;
  }
}
