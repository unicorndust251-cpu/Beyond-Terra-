import { useEffect, useMemo, useState } from 'react';
import { createStore, useStore, type MarsCoordinate } from '../../shared';
import {
  latestPeriod,
  loadIndex,
  loadSol,
  matchObservations,
  observationPeriod,
  resetCache,
  type EnvField,
  type FieldResult,
  type MedaIndex,
  type MedaSol,
  type ObservationPeriod,
  type ObservationSlot,
} from './meda';

export type MedaState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; index: MedaIndex; fields: Record<EnvField, FieldResult> };

/**
 * The historical observation period the weather cards show: a sol file and a record time in
 * it. null means automatic (the latest period, at its suggested time). This is separate from
 * the astronomy clock (timeStore): the live clock never changes it, and choosing a period
 * never changes the date used for Mars time or the day/night view.
 */
export const weatherSelectionStore = createStore<{ file: string; slotUtc: number } | null>(null);

interface Archive {
  index: MedaIndex;
  sols: Map<string, MedaSol>;
  periods: ObservationPeriod[];
}

let archivePromise: Promise<Archive> | null = null;

/** The index and every sol it lists, with the periods built from their valid records. */
function loadArchive(): Promise<Archive> {
  if (!archivePromise) {
    archivePromise = (async () => {
      const index = await loadIndex();
      const sols = new Map<string, MedaSol>();
      const periods: ObservationPeriod[] = [];
      for (const entry of index.sols) {
        const sol = await loadSol(entry.file);
        sols.set(entry.file, sol);
        const p = observationPeriod(entry, sol);
        if (p) periods.push(p);
      }
      return { index, sols, periods };
    })();
    archivePromise.catch(() => (archivePromise = null));
  }
  return archivePromise;
}

export interface WeatherSelection {
  periods: ObservationPeriod[];
  period: ObservationPeriod;
  slot: ObservationSlot;
  /** True until the visitor chooses a period or time. */
  automatic: boolean;
}

/**
 * MEDA readings for a place, at the selected historical observation period. Requests are
 * cached; Retry clears failed ones.
 */
export function useMedaObservations(place: MarsCoordinate | null): {
  state: MedaState;
  selection: WeatherSelection | null;
  select: (file: string, slotUtc?: number) => void;
  retry: () => void;
} {
  const [attempt, setAttempt] = useState(0);
  const [archive, setArchive] = useState<Archive | null>(null);
  const [error, setError] = useState<string | null>(null);
  const chosen = useStore(weatherSelectionStore);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    loadArchive().then(
      (a) => !cancelled && setArchive(a),
      (e) => !cancelled && setError(e instanceof Error ? e.message : String(e)),
    );
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const selection = useMemo<WeatherSelection | null>(() => {
    if (!archive) return null;
    const auto = latestPeriod(archive.periods);
    const period = (chosen && archive.periods.find((p) => p.file === chosen.file)) || auto;
    if (!period) return null;
    const slot = (chosen && period.slots.find((s) => s.utcMs === chosen.slotUtc)) || period.defaultSlot;
    return { periods: archive.periods, period, slot, automatic: !chosen };
  }, [archive, chosen]);

  const key = place ? `${place.latitude},${place.longitudeEast}` : '';
  const state = useMemo<MedaState>(() => {
    if (error) return { status: 'error', message: error };
    if (!archive || !place) return { status: 'loading' };
    if (!selection) {
      const r: FieldResult = { state: 'unavailable', reason: 'The bundled MEDA archive holds no valid records.' };
      return { status: 'ready', index: archive.index, fields: { airTemperatureC: r, surfaceTemperatureC: r, windSpeedMs: r, pressurePa: r } };
    }
    const sol = archive.sols.get(selection.period.file)!;
    return { status: 'ready', index: archive.index, fields: matchObservations(archive.index, sol, place, selection.slot.utcMs) };
    // key captures the place
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [archive, error, selection, key]);

  return {
    state,
    selection,
    select: (file, slotUtc) => {
      const period = archive?.periods.find((p) => p.file === file);
      if (period) weatherSelectionStore.set({ file, slotUtc: slotUtc ?? period.defaultSlot.utcMs });
    },
    retry: () => {
      resetCache();
      archivePromise = null;
      setArchive(null);
      setAttempt((n) => n + 1);
    },
  };
}
