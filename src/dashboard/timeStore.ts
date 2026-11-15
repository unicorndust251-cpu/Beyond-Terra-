import { useEffect, useState } from 'react';
import { createStore, useStore } from '../shared';
import { SOL_SECONDS } from './science/marsTime';

/**
 * Two separate clocks for the Mars Dashboard.
 *
 * 1. The SELECTED time: either the current UTC (live, the default) or a fixed date/time the
 *    visitor picked. Live time is always read from Date.now() — never accumulated — and
 *    re-read every second and as soon as the tab becomes visible again, so it cannot drift.
 * 2. The PREVIEW time: an explicitly started, accelerated walk through one sol. It is derived
 *    from elapsed performance.now() × rate, and never changes the selected time.
 */

export interface SelectedClock {
  mode: 'live' | 'fixed';
  fixedUtc: number;
}

export const selectedClockStore = createStore<SelectedClock>({ mode: 'live', fixedUtc: 0 });

export const selectedClock = {
  /** A fixed date/time (UTC ms). */
  setTime(utcMs: number) {
    selectedClockStore.set({ mode: 'fixed', fixedUtc: utcMs });
  },
  /** Back to the current time. */
  live() {
    selectedClockStore.set({ mode: 'live', fixedUtc: 0 });
  },
};

/** Re-renders once per second (aligned to the second) and on returning to the tab. */
function useSecondTick(enabled: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!enabled) return undefined;
    let timer = 0;
    const tick = () => {
      setNow(Date.now());
      // Align to the next whole second, so the clock never skips or repeats a second
      timer = window.setTimeout(tick, 1000 - (Date.now() % 1000) + 5);
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        window.clearTimeout(timer);
        tick();
      }
    };
    tick();
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, [enabled]);
  return now;
}

/** The selected instant (live: the current UTC, refreshed every second). */
export function useSelectedUtc(): { utcMs: number; mode: SelectedClock['mode'] } {
  const c = useStore(selectedClockStore);
  const now = useSecondTick(c.mode === 'live');
  return { utcMs: c.mode === 'live' ? now : c.fixedUtc, mode: c.mode };
}

/* ------------------------------------------------------------------ preview */

export interface PreviewState {
  active: boolean;
  playing: boolean;
  /** Simulated seconds per real second. */
  rate: number;
  /** Simulated UTC at the anchor. */
  anchorUtc: number;
  /** performance.now() at the anchor. */
  anchorPerf: number;
  /** The sol being previewed (UTC ms of its local midnight and the next). */
  solStartMs: number;
  solEndMs: number;
}

export const PREVIEW_RATES: Array<{ rate: number; label: string }> = [
  { rate: 60, label: '60× (1 Mars hour ≈ 1 min)' },
  { rate: 600, label: '600×' },
  { rate: SOL_SECONDS / 60, label: 'One sol in 1 minute' },
  { rate: SOL_SECONDS / 20, label: 'One sol in 20 seconds' },
];

export const previewStore = createStore<PreviewState>({
  active: false,
  playing: false,
  rate: SOL_SECONDS / 60,
  anchorUtc: 0,
  anchorPerf: 0,
  solStartMs: 0,
  solEndMs: 0,
});

export function previewUtc(p: PreviewState, perf = performance.now()): number {
  if (!p.playing) return p.anchorUtc;
  const t = p.anchorUtc + (perf - p.anchorPerf) * p.rate;
  // Loop within the previewed sol
  const span = p.solEndMs - p.solStartMs;
  return span > 0 ? p.solStartMs + ((((t - p.solStartMs) % span) + span) % span) : t;
}

export const preview = {
  /** Starts a preview of the sol [solStartMs, solEndMs), from its local midnight. */
  start(solStartMs: number, solEndMs: number) {
    const p = previewStore.get();
    previewStore.set({ ...p, active: true, playing: true, anchorUtc: solStartMs, anchorPerf: performance.now(), solStartMs, solEndMs });
  },
  play() {
    const p = previewStore.get();
    previewStore.set({ ...p, playing: true, anchorUtc: previewUtc(p), anchorPerf: performance.now() });
  },
  pause() {
    const p = previewStore.get();
    previewStore.set({ ...p, playing: false, anchorUtc: previewUtc(p), anchorPerf: performance.now() });
  },
  setRate(rate: number) {
    const p = previewStore.get();
    previewStore.set({ ...p, rate, anchorUtc: previewUtc(p), anchorPerf: performance.now() });
  },
  seek(utcMs: number) {
    const p = previewStore.get();
    previewStore.set({ ...p, anchorUtc: utcMs, anchorPerf: performance.now() });
  },
  exit() {
    previewStore.set({ ...previewStore.get(), active: false, playing: false });
  },
};

/** The preview instant, updated about 20 times a second while playing. */
export function usePreview(): { p: PreviewState; utcMs: number } {
  const p = useStore(previewStore);
  const [utcMs, setUtc] = useState(() => previewUtc(p));
  useEffect(() => {
    setUtc(previewUtc(p));
    if (!p.active || !p.playing) return undefined;
    let raf = 0;
    let last = 0;
    const frame = (t: number) => {
      if (t - last >= 50) {
        last = t;
        setUtc(previewUtc(previewStore.get(), t));
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [p]);
  return { p, utcMs };
}
