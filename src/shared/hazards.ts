import { createStore, useStore } from './store';
import type { MarsCoordinate } from './types';

/**
 * State shared between the Mission Planner view and the Hazards view. Both views use the
 * same map; switching view never removes a hazard layer, a route or a stop.
 *
 * Owned by `shared` so any module may read it (the planner can later read the active
 * categories or the selected hazard without importing the hazards module).
 */

export type AppView = 'planner' | 'hazards';

/** Category codes of the hazard key (project design choices, not NASA symbology). */
export type HazardCode = 'L' | 'S' | 'B' | 'P' | 'F' | 'G' | 'I' | 'D' | 'SL' | 'V' | 'T' | 'R' | 'C' | 'N' | 'E' | 'M' | 'U';

/** What is selected in the hazard views. */
export type HazardSelection =
  /** One of the 60 catalogue observations (H001…H060). */
  | { kind: 'observation'; id: string }
  /** A mapped feature (a USGS structure line or a derived slope cell), with the tapped point. */
  | { kind: 'feature'; id: string; at: MarsCoordinate }
  /** A tapped or typed point with no single feature chosen yet (zero or several candidates). */
  | { kind: 'point'; at: MarsCoordinate };

export interface HazardState {
  view: AppView;
  /** Categories whose geometry is drawn. Hiding one is a display choice only. */
  active: HazardCode[];
  /** Fill opacity of shaded areas, 0…0.6 (a display setting, not a physical quantity). */
  fillOpacity: number;
  /** Slope classification threshold in degrees over the MOLA 3.7 km baseline: an editable assumption. */
  slopeThresholdDeg: number;
  /** Where the slope limit comes from. 'illustrative' is the demonstration default. */
  slopeLimitSource: SlopeLimitSource;
  /** Citation for a documented mission limit. */
  slopeLimitReference: string;
  /** Shading + outlines, or outlines only (appearance only). */
  outlinesOnly: boolean;
  /** Categories the user excluded from route assessment (separate from what is shown). */
  routeExcluded: HazardCode[];
  /** Planned date and time (UTC, ISO without zone), or null. No loaded dataset uses it yet. */
  plannedTime: string | null;
  selection: HazardSelection | null;
}

export type SlopeLimitSource = 'illustrative' | 'user' | 'scenario' | 'documented';

export const SLOPE_LIMIT_SOURCE_LABEL: Record<SlopeLimitSource, string> = {
  illustrative: 'Illustrative planning assumption',
  user: 'User supplied',
  scenario: 'Scenario assumption',
  documented: 'Documented mission limit',
};

export const HAZARD_DEFAULTS: HazardState = {
  view: 'planner',
  active: ['L', 'S', 'B', 'P', 'F', 'G', 'I', 'D', 'SL'],
  fillOpacity: 0.2,
  slopeThresholdDeg: 8,
  slopeLimitSource: 'illustrative',
  slopeLimitReference: '',
  outlinesOnly: false,
  routeExcluded: [],
  plannedTime: null,
  selection: null,
};

export const hazardStore = createStore<HazardState>(HAZARD_DEFAULTS);

export function useHazardState(): HazardState {
  return useStore(hazardStore);
}

export function patchHazardState(patch: Partial<HazardState>): void {
  hazardStore.set({ ...hazardStore.get(), ...patch });
}

/* ------------------------------------------------------------------ route */

/** A stop of the route the planner is drawing, published so other modules can test it. */
export interface PlannedRouteStop {
  key: string;
  label: string;
  coordinate: MarsCoordinate;
  name?: string;
}

export interface PlannedRoute {
  /** Stops with a location, in travel order (as drawn on the map). */
  stops: PlannedRouteStop[];
  /** The planner's own route status. */
  status: 'incomplete' | 'ready' | 'calculated' | 'changed';
  /** Changes whenever a stop moves. */
  signature: string;
}

/** Written by the planner, read by the hazards module. Null when fewer than two stops are set. */
export const plannedRouteStore = createStore<PlannedRoute | null>(null);

/** The planner's own distance and time figures, so the Hazards view can show them unchanged. */
export interface PlannedRouteTotals {
  distanceKm: number;
  travelHours: number;
  taskHours: number;
  totalHours: number;
  speedKmh: number;
  mode: string;
}

export const plannedRouteTotalsStore = createStore<PlannedRouteTotals | null>(null);

export function usePlannedRouteTotals(): PlannedRouteTotals | null {
  return useStore(plannedRouteTotalsStore);
}

/** One place where the route line meets mapped hazard geometry. */
export interface RouteHazardHit {
  id: string;
  code: HazardCode;
  /** Interface colour of the category (a BEYOND TERRA display choice). */
  colour: string;
  /** The mapped feature: a USGS line id, or 'SL' for a run of slope cells. */
  featureId: string;
  title: string;
  detail: string;
  /** Index of the stop-to-stop segment (0 = first segment). */
  segmentIndex: number;
  segmentLabel: string;
  /** Along-route position, km from the start (great-circle approximation). */
  fromKm: number;
  toKm: number;
  /** A representative point (the crossing, or the steepest cell of a run). */
  at: MarsCoordinate;
  /** The affected part of the route line, for highlighting (a single point for a crossing). */
  path: MarsCoordinate[];
}

export type RouteCheckState = 'checked' | 'unavailable' | 'no-geometry' | 'excluded';

export interface RouteHazardReport {
  signature: string;
  status: 'checking' | 'ready';
  hits: RouteHazardHit[];
  /** How each category was (or could not be) tested against the route. */
  checks: { code: HazardCode; name: string; colour: string; state: RouteCheckState; note: string }[];
  /** Slope cells along the route line, by classification (km, great-circle approximation). */
  slope: { thresholdDeg: number; steepKm: number; belowKm: number; unavailableKm: number } | null;
  /** Catalogue observations whose centre lies near the line: context only, no mapped extent. */
  nearbyObservations: { id: string; title: string; distanceKm: number }[];
  /** Routing alternatives: none can be assessed with the data in this project. */
  alternative: { available: false; message: string };
}

/** Written by the hazards module, read by the planner's route summary. */
export const routeHazardStore = createStore<RouteHazardReport | null>(null);

/** Ask the hazards view to open at a point and show what is mapped there. */
export const hazardFocusStore = createStore<{ at: MarsCoordinate; nonce: number } | null>(null);

export function requestHazardFocus(at: MarsCoordinate): void {
  patchHazardState({ view: 'hazards' });
  hazardFocusStore.set({ at, nonce: (hazardFocusStore.get()?.nonce ?? 0) + 1 });
}

/* ------------------------------------------------------ saved to mission */

/** A hazard record the user attached to the mission plan from the information panel. */
export interface MissionHazardNote {
  /** The selection id (observation id, USGS line id or SL cell id). */
  id: string;
  code: HazardCode;
  title: string;
  at: MarsCoordinate;
  sourceUrl?: string;
  /** What the record is, in a few words (e.g. "Observation centre only, boundary not mapped"). */
  status: string;
  savedAt: string;
}

const NOTES_KEY = 'bt.missionHazardNotes.v1';

function readNotes(): MissionHazardNote[] {
  try {
    const raw = window.localStorage.getItem(NOTES_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed) ? (parsed as MissionHazardNote[]) : [];
  } catch {
    return [];
  }
}

export const missionHazardNotesStore = createStore<MissionHazardNote[]>(typeof window === 'undefined' ? [] : readNotes());

function writeNotes(next: MissionHazardNote[]) {
  missionHazardNotesStore.set(next);
  try {
    window.localStorage.setItem(NOTES_KEY, JSON.stringify(next));
  } catch {
    /* storage unavailable: the list still works for this visit */
  }
}

export function saveMissionHazardNote(note: Omit<MissionHazardNote, 'savedAt'>): void {
  const rest = missionHazardNotesStore.get().filter((n) => n.id !== note.id);
  writeNotes([...rest, { ...note, savedAt: new Date().toISOString() }]);
}

export function removeMissionHazardNote(id: string): void {
  writeNotes(missionHazardNotesStore.get().filter((n) => n.id !== id));
}

export function useMissionHazardNotes(): MissionHazardNote[] {
  return useStore(missionHazardNotesStore);
}

export function usePlannedRoute(): PlannedRoute | null {
  return useStore(plannedRouteStore);
}

export function useRouteHazardReport(): RouteHazardReport | null {
  return useStore(routeHazardStore);
}
