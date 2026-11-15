import { createStore, useStore, type MarsCoordinate } from '../../shared';

/**
 * Mission inputs the user supplies for the environmental and mission-constraint categories.
 * Nothing here has a default value: an empty field is a missing input, never zero.
 * Stored in this browser only (localStorage), so it survives reloads, tab and view changes.
 */

export interface EnergyItemInput {
  /** Average electrical power while operating, W */
  powerW: number | null;
  /** Operating hours; null = use the planner's scheduled operating time */
  hoursOverride: number | null;
}

export interface OtherLoad {
  id: string;
  name: string;
  powerW: number | null;
  hours: number | null;
}

export interface CommNode {
  id: string;
  name: string;
  kind: 'habitat' | 'rover' | 'relay';
  at: MarsCoordinate;
  /** Antenna height above the ground, m */
  antennaM: number | null;
}

export interface EnvInputs {
  energy: {
    /** Usable energy available at departure, Wh */
    availableWh: number | null;
    /** Does availableWh already allow for derating and losses? null = not stated */
    lossesIncluded: boolean | null;
    /** Losses to apply when not already included, % of required energy */
    lossPercent: number | null;
    /** Mission-defined reserve, Wh */
    reserveWh: number | null;
    items: Record<string, EnergyItemInput>;
    other: OtherLoad[];
  };
  comm: {
    nodes: CommNode[];
    /** Crew antenna height above the ground, m */
    crewAntennaM: number | null;
  };
  nav: {
    method: string;
    /** Stated horizontal position uncertainty, m */
    uncertaintyM: number | null;
    /** What the number means, as stated by its source */
    definition: string;
    lastUpdate: string;
    source: string;
  };
  load: {
    breakMinutes: number | null;
    contingencyMinutes: number | null;
    includeReturn: boolean;
    /** Sample mass expected to be collected, kg */
    sampleKg: number | null;
  };
  temperature: {
    /** Equipment operating limits, °C */
    minC: number | null;
    maxC: number | null;
  };
}

export const EMPTY_INPUTS: EnvInputs = {
  energy: { availableWh: null, lossesIncluded: null, lossPercent: null, reserveWh: null, items: {}, other: [] },
  comm: { nodes: [], crewAntennaM: null },
  nav: { method: '', uncertaintyM: null, definition: '', lastUpdate: '', source: '' },
  load: { breakMinutes: null, contingencyMinutes: null, includeReturn: false, sampleKg: null },
  temperature: { minC: null, maxC: null },
};

const KEY = 'bt.hazardInputs.v1';

function read(): EnvInputs {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return EMPTY_INPUTS;
    const v = JSON.parse(raw) as Partial<EnvInputs>;
    return {
      energy: { ...EMPTY_INPUTS.energy, ...v.energy },
      comm: { ...EMPTY_INPUTS.comm, ...v.comm },
      nav: { ...EMPTY_INPUTS.nav, ...v.nav },
      load: { ...EMPTY_INPUTS.load, ...v.load },
      temperature: { ...EMPTY_INPUTS.temperature, ...v.temperature },
    };
  } catch {
    return EMPTY_INPUTS;
  }
}

export const envInputsStore = createStore<EnvInputs>(typeof window === 'undefined' ? EMPTY_INPUTS : read());

export function patchInputs<K extends keyof EnvInputs>(key: K, patch: Partial<EnvInputs[K]>): void {
  const next = { ...envInputsStore.get(), [key]: { ...envInputsStore.get()[key], ...patch } };
  envInputsStore.set(next);
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* storage unavailable: inputs still work for this visit */
  }
}

export function useEnvInputs(): EnvInputs {
  return useStore(envInputsStore);
}

/** Parse a number field: '' → null; invalid → undefined (reject). Zero stays zero. */
export function parseNum(text: string, { min = -Infinity, max = Infinity } = {}): number | null | undefined {
  const t = text.trim().replace('−', '-');
  if (t === '') return null;
  const n = Number(t);
  if (!Number.isFinite(n) || n < min || n > max) return undefined;
  return n;
}
