/**
 * Phase 2 transport stub. The interface is already wired into main.ts; the
 * game remains fully playable offline by falling back to a local loop.
 *
 * Planned authoritative stack (§9):
 *   - Colyseus + @colyseus/uwebsockets-transport (shares the TypeScript /core),
 *     or Rust tokio / Go websockets for lower memory.
 *   - Supabase Auth or Hono/Fastify + PostgreSQL issues a signed JWT containing
 *     { userId, unlockedCharacters, equippedSkin }.
 *   - Client sends InputCommands; server runs /core and broadcasts binary snapshots.
 */

import type { InputCommand } from '../core/types';
import type { GameConfig } from '../core/GameModes';
import type { World } from '../core/World';
import type { TransportAdapter } from './TransportAdapter';
import { LocalLoopAdapter } from './LocalLoopAdapter';

export interface SocketAdapterOptions {
  url: string;
  jwt?: string;
  /** When true, throw instead of falling back to offline play. */
  strict?: boolean;
}

export class SocketAdapter implements TransportAdapter {
  readonly name = 'Socket';
  readonly isAuthoritative = false;
  private fallback: LocalLoopAdapter;

  constructor(config: GameConfig, options: SocketAdapterOptions) {
    this.fallback = new LocalLoopAdapter(config);
    if (options.strict) {
      throw new Error('SocketAdapter multiplayer transport is not implemented yet (Phase 2).');
    }
    console.warn(
      `[Dart.io] SocketAdapter (${options.url}) is a Phase 2 stub — falling back to offline local simulation.`,
    );
  }

  start(): World {
    return this.fallback.start();
  }

  stop(): void {
    this.fallback.stop();
  }

  submitInput(input: InputCommand): void {
    this.fallback.submitInput(input);
  }

  step(): void {
    this.fallback.step();
  }

  getWorld(): World {
    return this.fallback.getWorld();
  }
}
