import type { MarsCoordinate } from '../shared';
import { catalogItem } from './data/equipment';
import { OBJECTIVES, TASK_IDS, type ObjectiveId, type TaskId } from './data/science';
import { haversineKm } from './geo';
import {
  availableCarriers,
  clampAllocation,
  itemFromCatalog,
  massSummary,
  newId,
  resetToDefaults,
  taskTiming,
  type Carrier,
  type LoadoutItem,
  type MassSummary,
  type NumKey,
  type TaskTiming,
  type Valued,
} from './loadout';

/**
 * Mission-planning state and calculations. Everything here is a planning estimate:
 * straight-line distances, assumed speeds and demo or user-supplied equipment values.
 * Nothing assesses whether a route is traversable or a mission is safe.
 */

export type TravelMode = 'walking' | 'rover';
export type SuitProfile = 'standard' | 'enhanced';
/** A stop on the route: 'start', 'destination' or a waypoint id. */
export type StopKey = string;

export interface PlannedLocation {
  coordinate: MarsCoordinate;
  name?: string;
}

export interface Checkpoint {
  id: string;
  location: PlannedLocation | null;
}

export interface MissionState {
  start: PlannedLocation | null;
  destination: PlannedLocation | null;
  checkpoints: Checkpoint[];
  /** Signature of the route when "Calculate route" was last pressed. */
  calculatedSignature: string | null;
  travelMode: TravelMode;
  /** Assumed speeds (km/h), editable planning assumptions. */
  speedKmh: Record<TravelMode, number>;
  crew: 1 | 2;
  suit: SuitProfile;
  objectives: ObjectiveId[];
  availableHours: number;
  /** Equipment instances with their values, carriers and task assignments. */
  loadout: LoadoutItem[];
  /** No verified suit mass exists in this project: only a value the user states as an assumption. */
  suitMassAssumptionKg: number | null;
  /** Tasks scheduled at each stop. */
  tasks: Record<StopKey, TaskId[]>;
}

/** Planning assumptions, not validated EVA rates. */
export const DEFAULT_SPEED_KMH: Record<TravelMode, number> = { walking: 2, rover: 8 };
/** Surface gravity of Mars (m/s²), NASA Mars Fact Sheet: 3.71. Used only to show weight, never mass. */
export const MARS_GRAVITY = 3.71;

export const SUIT_PROFILES: Record<SuitProfile, { name: string; note: string }> = {
  standard: {
    name: 'Standard planetary suit (concept)',
    note: 'Conceptual profile. No validated performance data: it does not change any calculation.',
  },
  enhanced: {
    name: 'Enhanced-mobility suit (concept)',
    note: 'Conceptual profile. No validated mobility or life-support data: it does not change any calculation.',
  },
};

export function initialMissionState(): MissionState {
  return {
    start: null,
    destination: null,
    checkpoints: [],
    calculatedSignature: null,
    travelMode: 'walking',
    speedKmh: { ...DEFAULT_SPEED_KMH },
    crew: 2,
    suit: 'standard',
    objectives: [],
    availableHours: 6,
    loadout: [],
    suitMassAssumptionKg: null,
    tasks: {},
  };
}

export type ItemPatch = Partial<
  Pick<LoadoutItem, 'name' | 'category' | 'purpose' | 'tasks' | 'currency' | 'timingMode' | 'attended' | 'includesBatteries' | 'inSuit' | 'notes'>
>;

export type MissionAction =
  | { type: 'set-start'; location: PlannedLocation | null }
  | { type: 'set-destination'; location: PlannedLocation | null }
  | { type: 'add-checkpoint'; location?: PlannedLocation }
  | { type: 'set-checkpoint'; id: string; location: PlannedLocation | null }
  | { type: 'remove-checkpoint'; id: string }
  | { type: 'move-checkpoint'; id: string; by: -1 | 1 }
  | { type: 'calculate' }
  | { type: 'reset-route' }
  | { type: 'set-travel-mode'; mode: TravelMode }
  | { type: 'set-speed'; mode: TravelMode; kmh: number }
  | { type: 'set-crew'; crew: 1 | 2 }
  | { type: 'set-suit'; suit: SuitProfile }
  | { type: 'toggle-objective'; id: ObjectiveId }
  | { type: 'set-available-hours'; hours: number }
  | { type: 'add-suggested-equipment'; objective: ObjectiveId }
  | { type: 'set-suit-mass'; massKg: number | null }
  | { type: 'toggle-task'; stop: StopKey; task: TaskId }
  // Loadout
  | { type: 'add-catalog-item'; catalogId: string }
  | { type: 'add-custom-item'; item: LoadoutItem }
  | { type: 'remove-item'; uid: string }
  | { type: 'reset-item'; uid: string }
  | { type: 'set-item-field'; uid: string; key: NumKey; value: Valued }
  | { type: 'patch-item'; uid: string; patch: ItemPatch }
  | { type: 'set-allocation'; uid: string; carrier: Carrier; units: number }
  | { type: 'add-assignment'; uid: string; stop: StopKey; task: TaskId; uses: number }
  | { type: 'set-assignment-uses'; uid: string; assignmentId: string; uses: number }
  | { type: 'remove-assignment'; uid: string; assignmentId: string }
  // Saved routes
  | { type: 'load'; state: MissionState }
  | { type: 'new-mission' };

const mapItem = (state: MissionState, uid: string, fn: (item: LoadoutItem) => LoadoutItem): MissionState => ({
  ...state,
  loadout: state.loadout.map((i) => (i.uid === uid ? fn(i) : i)),
});

/** Drops tasks and equipment assignments at stops that no longer exist. */
function pruneStops(state: MissionState): MissionState {
  const keys = new Set(routeStops(state).map((s) => s.key));
  const tasks = Object.fromEntries(Object.entries(state.tasks).filter(([k]) => keys.has(k)));
  const loadout = state.loadout.map((i) =>
    i.assignments.every((a) => keys.has(a.stop)) ? i : { ...i, assignments: i.assignments.filter((a) => keys.has(a.stop)) },
  );
  return { ...state, tasks, loadout };
}

export function missionReducer(state: MissionState, action: MissionAction): MissionState {
  switch (action.type) {
    case 'set-start':
      return { ...state, start: action.location };
    case 'set-destination':
      return { ...state, destination: action.location };
    case 'add-checkpoint':
      return { ...state, checkpoints: [...state.checkpoints, { id: newId('cp'), location: action.location ?? null }] };
    case 'set-checkpoint':
      return {
        ...state,
        checkpoints: state.checkpoints.map((c) => (c.id === action.id ? { ...c, location: action.location } : c)),
      };
    case 'remove-checkpoint':
      return pruneStops({ ...state, checkpoints: state.checkpoints.filter((c) => c.id !== action.id) });
    case 'move-checkpoint': {
      const i = state.checkpoints.findIndex((c) => c.id === action.id);
      const j = i + action.by;
      if (i < 0 || j < 0 || j >= state.checkpoints.length) return state;
      const checkpoints = [...state.checkpoints];
      [checkpoints[i], checkpoints[j]] = [checkpoints[j], checkpoints[i]];
      return { ...state, checkpoints };
    }
    case 'calculate':
      return routeIsComplete(state) ? { ...state, calculatedSignature: routeSignature(state) } : state;
    case 'reset-route':
      return {
        ...state,
        start: null,
        destination: null,
        checkpoints: [],
        calculatedSignature: null,
        tasks: {},
        loadout: state.loadout.map((i) => ({ ...i, assignments: [] })),
      };
    case 'set-travel-mode':
      return { ...state, travelMode: action.mode };
    case 'set-speed':
      return { ...state, speedKmh: { ...state.speedKmh, [action.mode]: action.kmh } };
    case 'set-crew':
      return { ...state, crew: action.crew };
    case 'set-suit':
      return { ...state, suit: action.suit };
    case 'toggle-objective':
      return {
        ...state,
        objectives: state.objectives.includes(action.id)
          ? state.objectives.filter((o) => o !== action.id)
          : [...state.objectives, action.id],
      };
    case 'set-available-hours':
      return { ...state, availableHours: action.hours };
    case 'add-suggested-equipment': {
      const objective = OBJECTIVES.find((o) => o.id === action.objective);
      if (!objective) return state;
      const have = new Set(state.loadout.map((i) => i.catalogId));
      const added = objective.suggestedEquipment
        .filter((id) => !have.has(id))
        .map((id) => catalogItem(id))
        .filter((c): c is NonNullable<typeof c> => !!c)
        .map(itemFromCatalog);
      return { ...state, loadout: [...state.loadout, ...added] };
    }
    case 'set-suit-mass':
      return { ...state, suitMassAssumptionKg: action.massKg };
    case 'toggle-task': {
      const current = state.tasks[action.stop] ?? [];
      const removing = current.includes(action.task);
      const next = removing ? current.filter((t) => t !== action.task) : [...current, action.task];
      // Unscheduling a task also releases the equipment booked for it
      const loadout = removing
        ? state.loadout.map((i) => ({ ...i, assignments: i.assignments.filter((a) => !(a.stop === action.stop && a.task === action.task)) }))
        : state.loadout;
      return { ...state, tasks: { ...state.tasks, [action.stop]: next }, loadout };
    }

    case 'add-catalog-item': {
      const c = catalogItem(action.catalogId);
      return c ? { ...state, loadout: [...state.loadout, itemFromCatalog(c)] } : state;
    }
    case 'add-custom-item':
      return { ...state, loadout: [...state.loadout, action.item] };
    case 'remove-item':
      return { ...state, loadout: state.loadout.filter((i) => i.uid !== action.uid) };
    case 'reset-item':
      return mapItem(state, action.uid, resetToDefaults);
    case 'set-item-field':
      return mapItem(state, action.uid, (i) => {
        const fields = { ...i.fields, [action.key]: action.value };
        // A smaller quantity releases units from the carriers, last carrier first
        const allocation = action.key === 'quantity' ? clampAllocation(i.allocation, action.value.value ?? 1) : i.allocation;
        return { ...i, fields, allocation };
      });
    case 'patch-item':
      return mapItem(state, action.uid, (i) => {
        const next = { ...i, ...action.patch };
        // Narrowing the item's tasks drops assignments to tasks it no longer supports
        if (action.patch.tasks) next.assignments = i.assignments.filter((a) => action.patch.tasks!.includes(a.task));
        return next;
      });
    case 'set-allocation':
      return mapItem(state, action.uid, (i) => {
        const others = Object.entries(i.allocation)
          .filter(([c]) => c !== action.carrier)
          .reduce((s, [, n]) => s + (n ?? 0), 0);
        // Never more units than exist: the same unit cannot go to two carriers
        const units = Math.max(0, Math.min(Math.floor(action.units), (i.fields.quantity.value ?? 1) - others));
        const allocation = { ...i.allocation, [action.carrier]: units };
        if (!units) delete allocation[action.carrier];
        return { ...i, allocation };
      });
    case 'add-assignment': {
      // An item is booked once per task at a stop; the task is scheduled if it was not
      const target = state.loadout.find((i) => i.uid === action.uid);
      if (!target || target.assignments.some((a) => a.stop === action.stop && a.task === action.task)) return state;
      const uses = Math.max(1, Math.floor(action.uses));
      const scheduled = state.tasks[action.stop] ?? [];
      const tasks = scheduled.includes(action.task) ? state.tasks : { ...state.tasks, [action.stop]: [...scheduled, action.task] };
      return {
        ...mapItem(state, action.uid, (i) => ({
          ...i,
          assignments: [...i.assignments, { id: newId('as'), stop: action.stop, task: action.task, uses }],
        })),
        tasks,
      };
    }
    case 'set-assignment-uses':
      return mapItem(state, action.uid, (i) => ({
        ...i,
        assignments: i.assignments.map((a) => (a.id === action.assignmentId ? { ...a, uses: Math.max(1, Math.floor(action.uses)) } : a)),
      }));
    case 'remove-assignment':
      return mapItem(state, action.uid, (i) => ({ ...i, assignments: i.assignments.filter((a) => a.id !== action.assignmentId) }));

    case 'load':
      return action.state;
    case 'new-mission':
      return initialMissionState();
  }
}

/* --------------------------------------------------------------- route */

export interface RouteStop {
  key: StopKey;
  label: string;
  location: PlannedLocation | null;
}

export function routeStops(state: MissionState): RouteStop[] {
  return [
    { key: 'start', label: 'Start', location: state.start },
    ...state.checkpoints.map((c, i) => ({ key: c.id, label: `Waypoint ${i + 1}`, location: c.location })),
    { key: 'destination', label: 'Destination', location: state.destination },
  ];
}

export function routeIsComplete(state: MissionState): boolean {
  return routeStops(state).every((s) => s.location !== null);
}

export function routeSignature(state: MissionState): string {
  return JSON.stringify(routeStops(state).map((s) => s.location?.coordinate ?? null));
}

export type RouteStatus = 'incomplete' | 'ready' | 'calculated' | 'changed';

export function routeStatus(state: MissionState): RouteStatus {
  if (!routeIsComplete(state)) return 'incomplete';
  if (state.calculatedSignature === null) return 'ready';
  return state.calculatedSignature === routeSignature(state) ? 'calculated' : 'changed';
}

export const ROUTE_STATUS_LABELS: Record<RouteStatus, string> = {
  incomplete: 'Incomplete: set every location',
  ready: 'Ready to calculate',
  calculated: 'Calculated',
  changed: 'Changed since calculation',
};

export interface RouteSegment {
  from: RouteStop;
  to: RouteStop;
  km: number;
  hours: number;
}

export interface RouteMetrics {
  segments: RouteSegment[];
  totalKm: number;
  travelHours: number;
  speedKmh: number;
}

/** Segment-by-segment great-circle distances and travel times (only between set stops). */
export function routeMetrics(state: MissionState): RouteMetrics {
  const stops = routeStops(state).filter((s) => s.location);
  const speedKmh = state.speedKmh[state.travelMode];
  const segments: RouteSegment[] = [];
  for (let i = 1; i < stops.length; i++) {
    const km = haversineKm(stops[i - 1].location!.coordinate, stops[i].location!.coordinate);
    segments.push({ from: stops[i - 1], to: stops[i], km, hours: speedKmh > 0 ? km / speedKmh : Infinity });
  }
  const totalKm = segments.reduce((s, x) => s + x.km, 0);
  return { segments, totalKm, travelHours: speedKmh > 0 ? totalKm / speedKmh : Infinity, speedKmh };
}

/* ----------------------------------------------------------- equipment */

export function missionCarriers(state: MissionState): Carrier[] {
  return availableCarriers(state.crew, state.travelMode === 'rover');
}

export interface EquipmentSummary extends MassSummary {
  carriers: Carrier[];
  suitKg: number | null;
}

export function equipmentSummary(state: MissionState): EquipmentSummary {
  const carriers = missionCarriers(state);
  return { ...massSummary(state.loadout, carriers), carriers, suitKg: state.suitMassAssumptionKg };
}

/** Menu equipment the selected objectives suggest but that is not in the loadout. */
export function missingSuggestedEquipment(state: MissionState): string[] {
  const wanted = new Set(OBJECTIVES.filter((o) => state.objectives.includes(o.id)).flatMap((o) => o.suggestedEquipment));
  const have = new Set(state.loadout.map((i) => i.catalogId));
  return [...wanted].filter((id) => !have.has(id));
}

/** Tasks the loadout's equipment makes possible. */
export function availableTasks(state: MissionState): TaskId[] {
  const ids = new Set<TaskId>();
  state.loadout.forEach((i) => i.tasks.forEach((t) => ids.add(t)));
  return TASK_IDS.filter((t) => ids.has(t));
}

/* ------------------------------------------------------------ duration */

export interface DurationSummary {
  travelHours: number;
  /** Known task time. */
  taskHours: number;
  totalHours: number;
  availableHours: number;
  /** Positive: hours to spare; negative: hours over the available time. */
  marginHours: number;
  /** Scheduled tasks no loadout item can perform. */
  tasksWithoutEquipment: { stop: StopKey; task: TaskId }[];
  /** Every scheduled task with its time and where it comes from. */
  timings: TaskTiming[];
  /** Tasks whose time is unknown (an assigned item has an unknown value). */
  unknownTasks: number;
}

export function durationSummary(state: MissionState, metrics: RouteMetrics): DurationSummary {
  const stops = routeStops(state).map((s) => s.key);
  const usable = new Set(availableTasks(state));
  let taskMinutes = 0;
  let unknownTasks = 0;
  const timings: TaskTiming[] = [];
  const tasksWithoutEquipment: { stop: StopKey; task: TaskId }[] = [];
  stops.forEach((stop) => {
    (state.tasks[stop] ?? []).forEach((task) => {
      const timing = taskTiming(state.loadout, stop, task);
      timings.push(timing);
      if (timing.minutes === null) unknownTasks++;
      else taskMinutes += timing.minutes;
      if (!usable.has(task)) tasksWithoutEquipment.push({ stop, task });
    });
  });
  const taskHours = taskMinutes / 60;
  const totalHours = metrics.travelHours + taskHours;
  return {
    travelHours: metrics.travelHours,
    taskHours,
    totalHours,
    availableHours: state.availableHours,
    marginHours: state.availableHours - totalHours,
    tasksWithoutEquipment,
    timings,
    unknownTasks,
  };
}
