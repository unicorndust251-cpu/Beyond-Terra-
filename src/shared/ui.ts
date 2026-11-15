import { createStore, useStore } from './store';

/** The four section destinations; Layers is a map-panel action, not a separate view. */
export type Section = 'explore' | 'planner' | 'hazards' | 'dashboard';

export const SECTIONS: { id: Section; label: string; hint: string }[] = [
  { id: 'explore', label: 'Explore Mars', hint: 'Mars map, search, landmarks and map layers' },
  { id: 'planner', label: 'Mission Planner', hint: 'Route, checkpoints, equipment and crew' },
  { id: 'hazards', label: 'Hazards', hint: 'Terrain hazards and route assessment' },
  { id: 'dashboard', label: 'Mars Dashboard', hint: 'Conditions, terrain and scientific information' },
];

export type NavigationRequest =
  | { type: 'section'; section: Section; globe?: boolean; n: number }
  | { type: 'layers'; n: number };

/** The app shell handles section and map-layer requests without recreating shared map state. */
export const navRequestStore = createStore<NavigationRequest | null>(null);

const mapLayersPanelStore = createStore(false);

export function setMapLayersPanelOpen(open: boolean): void {
  mapLayersPanelStore.set(open);
}

export function useMapLayersPanelOpen(): boolean {
  return useStore(mapLayersPanelStore);
}

export function navigate(section: Section, opts: { globe?: boolean } = {}): void {
  navRequestStore.set({ type: 'section', section, globe: opts.globe, n: (navRequestStore.get()?.n ?? 0) + 1 });
}

export function openMapLayersPanel(): void {
  setMapLayersPanelOpen(true);
  navRequestStore.set({ type: 'layers', n: (navRequestStore.get()?.n ?? 0) + 1 });
}
