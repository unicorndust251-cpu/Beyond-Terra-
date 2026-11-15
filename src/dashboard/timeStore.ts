import { useEffect, useState } from 'react';
import { createStore, useStore } from '../shared';
import { SOL_SECONDS } from './science/marsTime';

/**
 * The dashboard's single simulation clock. The Mars clock, the Sun's position, the
 * day/night panel and the sunrise/sunset context all read this one instant, so they cannot
 * disagree. It survives leaving and reopening the dashboard (memory only, this visit).
 */
export interface SimClock {
  /** UTC at the anchor (ms). */
  anchorUtc: number;
  /** performance.now() at the anchor, while playing. */
  anchorPerf: number;
  playing: boolean;
  /** Simulated seconds per real second. */
  rate: number;
  /** Following the real current time (Now). */
  live: boolean;
}

export const PLAYBACK_RATES: Array<{ rate: number; label: string }> = [
  { rate: 1, label: '1× (real time)' },
  { rate: 10, label: '10×' },
  { rate: 60, label: '60×' },
  { rate: SOL_SECONDS / 60, label: 'Full sol in 1 min' },
];

export const clockStore = createStore<SimClock>({ anchorUtc: Date.now(), anchorPerf: 0, playing: false, rate: 1, live: true });

export function simUtc(c: SimClock, now = performance.now()): number {
  if (c.live) return Date.now();
  return c.playing ? c.anchorUtc + (now - c.anchorPerf) * c.rate : c.anchorUtc;
}

export const clock = {
  setTime(utcMs: number) {
    const c = clockStore.get();
    clockStore.set({ ...c, anchorUtc: utcMs, anchorPerf: performance.now(), live: false });
  },
  now() {
    clockStore.set({ ...clockStore.get(), live: true, playing: false, rate: 1 });
  },
  play() {
    const c = clockStore.get();
    clockStore.set({ ...c, anchorUtc: simUtc(c), anchorPerf: performance.now(), playing: true, live: false });
  },
  pause() {
    const c = clockStore.get();
    clockStore.set({ ...c, anchorUtc: simUtc(c), anchorPerf: performance.now(), playing: false });
  },
  setRate(rate: number) {
    const c = clockStore.get();
    clockStore.set({ ...c, anchorUtc: simUtc(c), anchorPerf: performance.now(), rate, live: c.live && rate === 1 });
  },
};

/**
 * The simulation instant, re-read every `intervalMs` while time moves (live or playing).
 * Throttled so the whole dashboard does not re-render at 60 Hz.
 */
export function useSimTime(intervalMs = 250): { utcMs: number; clock: SimClock } {
  const c = useStore(clockStore);
  const [utcMs, setUtc] = useState(() => simUtc(c));
  useEffect(() => {
    setUtc(simUtc(c));
    if (!c.live && !c.playing) return undefined;
    const t = window.setInterval(() => setUtc(simUtc(clockStore.get())), c.live ? 1000 : intervalMs);
    return () => window.clearInterval(t);
  }, [c, intervalMs]);
  return { utcMs, clock: c };
}
