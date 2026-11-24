/** Persisted UI preference for the in-game measurement system. */

import type { UnitSystem } from '../core/Units';

const KEY = 'dart-io:units';

function load(): UnitSystem {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === 'metric' || saved === 'imperial') return saved;
  } catch { /* localStorage unavailable */ }
  return 'imperial';
}

class UnitSettingsStore {
  system: UnitSystem = load();
  private listeners = new Set<() => void>();

  toggle(): void {
    this.set(this.system === 'imperial' ? 'metric' : 'imperial');
  }

  set(system: UnitSystem): void {
    this.system = system;
    try { localStorage.setItem(KEY, system); } catch { /* ignore */ }
    for (const fn of this.listeners) fn();
  }

  onChange(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
}

export const unitSettings = new UnitSettingsStore();
