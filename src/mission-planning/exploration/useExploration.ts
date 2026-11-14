import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { useMapBridge } from '../../shared';
import { routeStatus, routeStops, type MissionState } from '../model';
import { ExplorationEngine, type ExplorationSnapshot } from './engine';
import type { PathStop } from './path';

const noop = () => () => undefined;

/**
 * The centre of the part of the map not covered by the planner, the route summary or the
 * top bar, relative to the map's centre (pixels).
 */
function clearAreaOffset(): { x: number; y: number } {
  const map = document.querySelector('.leaflet-container')?.getBoundingClientRect();
  if (!map) return { x: 0, y: 0 };
  const panel = document.querySelector('.mp-panel.is-open')?.getBoundingClientRect();
  const summary = document.querySelector('.mp-sum')?.getBoundingClientRect();
  const phone = window.innerWidth <= 640;
  let left = map.left;
  let top = map.top + 56;
  let bottom = map.bottom - 24;
  const right = map.right - 64; // zoom controls
  if (panel && !phone) left = Math.max(left, panel.right + 12);
  if (panel && phone) top = Math.max(top, panel.bottom + 12);
  if (summary) bottom = Math.min(bottom, summary.top - 12);
  // A figure is ~110 px tall above its feet: aim the feet a little below the middle
  if (bottom - top < 140 || right - left < 120) return { x: 0, y: 0 };
  return { x: (left + right) / 2 - (map.left + map.width / 2), y: (top + bottom) / 2 + 45 - (map.top + map.height / 2) };
}

/**
 * The route preview astronaut for the planner. Lives above the planner's tabs, so switching
 * tabs never interrupts or restarts it. Returns the engine (for controls), its snapshot (for
 * display) and the stop to highlight on the map.
 */
export function useExploration(state: MissionState) {
  const bridge = useMapBridge();
  const [highlight, setHighlight] = useState<string | null>(null);
  const [engine, setEngine] = useState<ExplorationEngine | null>(null);

  useEffect(() => {
    if (!bridge) return undefined;
    const e = new ExplorationEngine(bridge, setHighlight, clearAreaOffset);
    setEngine(e);
    return () => {
      e.dispose();
      setEngine(null);
    };
  }, [bridge]);

  const snapshot: ExplorationSnapshot | null = useSyncExternalStore(
    engine ? (fn) => engine.subscribe(fn) : noop,
    () => engine?.snapshot ?? null,
  );

  const stops: PathStop[] = useMemo(
    () =>
      routeStops(state)
        .filter((s) => s.location)
        .map((s) => ({ key: s.key, label: s.label, name: s.location!.name, coordinate: s.location!.coordinate })),
    [state],
  );
  const calculated = routeStatus(state) === 'calculated';
  const speed = state.speedKmh[state.travelMode];

  useEffect(() => {
    engine?.setRoute(stops, calculated, speed);
  }, [engine, stops, calculated, speed]);

  return { engine, snapshot, highlight };
}
