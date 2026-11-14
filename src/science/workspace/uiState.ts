import { createStore, useStore } from '../../shared';

/**
 * Workspace display settings. Display only: they change how values are
 * written, never the values themselves.
 */

export interface DisplaySettings {
  /** How longitudes are written: east 0…360° (MOLA, IAU) or east −180…180° (Mars Trek) */
  longitude: 'east-360' | 'east-180';
  /** Elevation unit for readouts */
  elevationUnit: 'km' | 'm';
}

export const displaySettingsStore = createStore<DisplaySettings>({ longitude: 'east-360', elevationUnit: 'km' });

export function useDisplaySettings(): DisplaySettings {
  return useStore(displaySettingsStore);
}

/* ------------------------------------------------------------------ format */

const minus = (s: string) => s.replace('-', '−');

/** "18.4446° N" with fixed precision. */
export function formatLatitude(lat: number, digits = 4): string {
  return `${Math.abs(lat).toFixed(digits)}° ${lat >= 0 ? 'N' : 'S'}`;
}

/** "77.4509° E" in the chosen convention, from any (wrapped) east longitude. */
export function formatLongitude(lonEast: number, convention: DisplaySettings['longitude'], digits = 4): string {
  const e360 = ((lonEast % 360) + 360) % 360;
  return convention === 'east-360' ? `${e360.toFixed(digits)}° E` : `${minus((e360 > 180 ? e360 - 360 : e360).toFixed(digits))}° E`;
}

/** Elevation in metres, written in the chosen unit. */
export function formatElevation(metres: number, unit: DisplaySettings['elevationUnit']): { value: string; unit: string } {
  return unit === 'km'
    ? { value: minus((metres / 1000).toFixed(3)), unit: 'km' }
    : { value: minus(Math.round(metres).toLocaleString('en-US')), unit: 'm' };
}
