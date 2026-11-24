/**
 * In-game measurement system. One world unit == one arena tile == one meter.
 * Imperial (US customary) is the default display; metric is a toggleable option.
 * Pure functions only — no DOM access (the preference is held by the UI layer).
 */

export type UnitSystem = 'imperial' | 'metric';

export const UNIT_SCALE = {
  metersPerWorldUnit: 1,
  feetPerMeter: 3.280839895,
  inchesPerMeter: 39.37007874,
} as const;

export function toMeters(worldUnits: number): number {
  return worldUnits * UNIT_SCALE.metersPerWorldUnit;
}

export function toFeet(worldUnits: number): number {
  return toMeters(worldUnits) * UNIT_SCALE.feetPerMeter;
}

export function toInches(worldUnits: number): number {
  return toMeters(worldUnits) * UNIT_SCALE.inchesPerMeter;
}

/** Compact distance label, e.g. "24.0 m" or "78.7 ft". */
export function formatDistance(worldUnits: number, system: UnitSystem): string {
  return system === 'metric'
    ? `${toMeters(worldUnits).toFixed(1)} m`
    : `${toFeet(worldUnits).toFixed(1)} ft`;
}

/** Speed label, e.g. "3.6 m/s" or "11.8 ft/s". */
export function formatSpeed(worldUnitsPerSecond: number, system: UnitSystem): string {
  return system === 'metric'
    ? `${toMeters(worldUnitsPerSecond).toFixed(1)} m/s`
    : `${toFeet(worldUnitsPerSecond).toFixed(1)} ft/s`;
}

/** Human height label, e.g. "5 ft 11 in" or "1.80 m". */
export function formatHeight(worldUnits: number, system: UnitSystem): string {
  if (system === 'metric') return `${toMeters(worldUnits).toFixed(2)} m`;
  const totalInches = Math.round(toInches(worldUnits));
  const feet = Math.floor(totalInches / 12);
  const inches = totalInches % 12;
  return `${feet} ft ${inches} in`;
}

/** The scale caption shown under the HUD. */
export function formatScale(system: UnitSystem): string {
  return system === 'metric'
    ? '1 unit = 1 m = 100 cm'
    : '1 unit = 1 m = 39.37 in (3.28 ft)';
}
