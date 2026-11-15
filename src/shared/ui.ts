import { createStore } from './store';

/** The four destinations of the main navigation. */
export type Section = 'explore' | 'planner' | 'hazards' | 'dashboard';

export const SECTIONS: { id: Section; label: string; hint: string }[] = [
  { id: 'explore', label: 'Explore Mars', hint: 'Mars map, search, landmarks and map layers' },
  { id: 'planner', label: 'Mission Planner', hint: 'Route, checkpoints, equipment and crew' },
  { id: 'hazards', label: 'Hazards', hint: 'Terrain hazards and route assessment' },
  { id: 'dashboard', label: 'Mars Dashboard', hint: 'Conditions, terrain and scientific information' },
];

/**
 * A request to go to a section, handled by the app shell (which owns the globe and dashboard
 * overlays). `globe` opens the landmark globe within Explore Mars.
 */
export const navRequestStore = createStore<{ section: Section; globe?: boolean; n: number } | null>(null);

export function navigate(section: Section, opts: { globe?: boolean } = {}): void {
  navRequestStore.set({ section, globe: opts.globe, n: (navRequestStore.get()?.n ?? 0) + 1 });
}
