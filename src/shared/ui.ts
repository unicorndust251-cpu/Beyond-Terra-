import { createStore, useStore } from './store';

/**
 * Interface-wide settings shared by every section.
 *
 * Simple / Advanced changes only how much is shown at once. Both modes use the same data,
 * mission state and features; nothing is removed in Simple mode, only folded away.
 */
export type UiMode = 'simple' | 'advanced';

const MODE_KEY = 'bt.uiMode.v1';

function readMode(): UiMode {
  try {
    return window.localStorage.getItem(MODE_KEY) === 'advanced' ? 'advanced' : 'simple';
  } catch {
    return 'simple';
  }
}

export const uiModeStore = createStore<UiMode>(typeof window === 'undefined' ? 'simple' : readMode());

export function setUiMode(mode: UiMode): void {
  uiModeStore.set(mode);
  try {
    window.localStorage.setItem(MODE_KEY, mode);
  } catch {
    /* storage unavailable: the choice lasts for this visit */
  }
}

export function useUiMode(): UiMode {
  return useStore(uiModeStore);
}

/** The four destinations of the main navigation. */
export type Section = 'explore' | 'planner' | 'hazards' | 'dashboard';

export const SECTIONS: { id: Section; label: string; hint: string }[] = [
  { id: 'explore', label: 'Explore Mars', hint: 'Mars map, search, landmarks and map layers' },
  { id: 'planner', label: 'Plan Mission', hint: 'Route, checkpoints, equipment and crew' },
  { id: 'hazards', label: 'Check Hazards', hint: 'Terrain hazards and route assessment' },
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
