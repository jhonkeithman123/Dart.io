/**
 * Transport adapter pattern (§9): the game loop talks to this interface, never
 * directly to World. Phase 1 uses LocalLoopAdapter; Phase 2 swaps in SocketAdapter.
 */

import type { InputCommand } from '../core/types';
import type { World } from '../core/World';

export interface TransportAdapter {
  readonly name: string;
  /** Create/attach a simulation world and wire bot controllers. */
  start(): World;
  stop(): void;
  /** Submit the local player's intent for the next tick. */
  submitInput(input: InputCommand): void;
  /** Advance exactly one fixed simulation tick. */
  step(): void;
  getWorld(): World;
  readonly isAuthoritative: boolean;
}
