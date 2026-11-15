import { useEffect, useState } from 'react';
import type { MarsCoordinate } from '../../shared';
import { loadIndex, loadSol, matchObservations, resetCache, solFor, type EnvField, type FieldResult, type MedaIndex } from './meda';

export type MedaState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; index: MedaIndex; fields: Record<EnvField, FieldResult> };

const ALL: EnvField[] = ['airTemperatureC', 'surfaceTemperatureC', 'windSpeedMs', 'pressurePa'];

/**
 * MEDA readings for a place and time. Re-matched when the place changes or the time moves to
 * another minute; requests are cached, and Retry clears failed ones.
 */
export function useMedaObservations(place: MarsCoordinate | null, utcMs: number): { state: MedaState; retry: () => void } {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<MedaState>({ status: 'loading' });
  const minute = Math.floor(utcMs / 60000);
  const key = place ? `${place.latitude},${place.longitudeEast}` : '';

  useEffect(() => {
    if (!place) return undefined;
    let cancelled = false;
    setState((s) => (s.status === 'ready' ? s : { status: 'loading' }));
    (async () => {
      try {
        const index = await loadIndex();
        const t = minute * 60000 + (utcMs % 60000);
        const entry = solFor(index, t);
        let fields: Record<EnvField, FieldResult>;
        if (!entry) {
          const covered = index.sols.map((s) => `sol ${s.sol} (${s.startUtc.slice(0, 10)})`).join(', ');
          const r: FieldResult = { state: 'unavailable', reason: `No MEDA record at the selected time. This build holds archived Jezero observations for ${covered}.` };
          fields = Object.fromEntries(ALL.map((f) => [f, r])) as Record<EnvField, FieldResult>;
        } else {
          const sol = await loadSol(entry.file);
          fields = matchObservations(index, sol, place, t);
        }
        if (!cancelled) setState({ status: 'ready', index, fields });
      } catch (e) {
        if (!cancelled) setState({ status: 'error', message: e instanceof Error ? e.message : String(e) });
      }
    })();
    return () => {
      cancelled = true;
    };
    // minute and key capture the inputs; attempt re-runs after Retry
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, minute, attempt]);

  return {
    state: place ? state : { status: 'loading' },
    retry: () => {
      resetCache();
      setState({ status: 'loading' });
      setAttempt((n) => n + 1);
    },
  };
}
