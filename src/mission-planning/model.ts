import type { MarsCoordinate } from '../shared';
import { EQUIPMENT, equipmentById, OBJECTIVES, TASKS, type MassGroup, type ObjectiveId, type TaskId } from './data/science';
import { haversineKm } from './geo';

/**
 * Mission-planning state and calculations. Everything here is a planning estimate:
 * straight-line distances, assumed speeds and assumed task times. Nothing assesses
 * whether a route is traversable or a mission is safe.
 */

export type TravelMode = 'walking' | 'rover';
export type SuitProfile = 'standard' | 'enhanced';
/** A stop on the route: 'start', 'destination' or a checkpoint id. */
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
  /** Selected equipment and its (editable, assumed) mass. */
  equipment: Record<string, { massKg: number }>;
  /** No verified suit mass exists in this project: only a value the user states as an assumption. */
  suitMassAssumptionKg: number | null;
  /** Tasks assigned to each stop. */
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
    equipment: {},
    suitMassAssumptionKg: null,
    tasks: {},
  };
}

export type MissionAction =
  | { type: 'set-start'; location: PlannedLocation | null }
  | { type: 'set-destination'; location: PlannedLocation | null }
  | { type: 'add-checkpoint' }
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
  | { type: 'toggle-equipment'; id: string }
  | { type: 'set-equipment-mass'; id: string; massKg: number }
  | { type: 'add-suggested-equipment'; objective: ObjectiveId }
  | { type: 'set-suit-mass'; massKg: number | null }
  | { type: 'toggle-task'; stop: StopKey; task: TaskId };

let nextCheckpoint = 1;

export function missionReducer(state: MissionState, action: MissionAction): MissionState {
  switch (action.type) {
    case 'set-start':
      return { ...state, start: action.location };
    case 'set-destination':
      return { ...state, destination: action.location };
    case 'add-checkpoint':
      return { ...state, checkpoints: [...state.checkpoints, { id: `cp-${nextCheckpoint++}`, location: null }] };
    case 'set-checkpoint':
      return {
        ...state,
        checkpoints: state.checkpoints.map((c) => (c.id === action.id ? { ...c, location: action.location } : c)),
      };
    case 'remove-checkpoint': {
      const tasks = { ...state.tasks };
      delete tasks[action.id];
      return { ...state, checkpoints: state.checkpoints.filter((c) => c.id !== action.id), tasks };
    }
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
      return { ...state, start: null, destination: null, checkpoints: [], calculatedSignature: null, tasks: {} };
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
    case 'toggle-equipment': {
      const equipment = { ...state.equipment };
      if (equipment[action.id]) delete equipment[action.id];
      else equipment[action.id] = { massKg: equipmentById(action.id)?.assumedMassKg ?? 0 };
      return { ...state, equipment };
    }
    case 'set-equipment-mass':
      return state.equipment[action.id]
        ? { ...state, equipment: { ...state.equipment, [action.id]: { massKg: action.massKg } } }
        : state;
    case 'add-suggested-equipment': {
      const objective = OBJECTIVES.find((o) => o.id === action.objective);
      if (!objective) return state;
      const equipment = { ...state.equipment };
      objective.suggestedEquipment.forEach((id) => {
        if (!equipment[id]) equipment[id] = { massKg: equipmentById(id)?.assumedMassKg ?? 0 };
      });
      return { ...state, equipment };
    }
    case 'set-suit-mass':
      return { ...state, suitMassAssumptionKg: action.massKg };
    case 'toggle-task': {
      const current = state.tasks[action.stop] ?? [];
      const next = current.includes(action.task) ? current.filter((t) => t !== action.task) : [...current, action.task];
      return { ...state, tasks: { ...state.tasks, [action.stop]: next } };
    }
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
    ...state.checkpoints.map((c, i) => ({ key: c.id, label: `Checkpoint ${i + 1}`, location: c.location })),
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

export interface MassBreakdown {
  byGroup: Record<MassGroup, number>;
  /** Scientific equipment + sample storage + supplies (the suit is separate). */
  carriedKg: number;
  /** Shared evenly between the crew: an assumption. */
  perAstronautKg: number;
  suitKg: number | null;
}

export function massBreakdown(state: MissionState): MassBreakdown {
  const byGroup: Record<MassGroup, number> = { science: 0, 'sample-storage': 0, supplies: 0 };
  Object.entries(state.equipment).forEach(([id, { massKg }]) => {
    const item = equipmentById(id);
    if (item) byGroup[item.massGroup] += massKg;
  });
  const carriedKg = byGroup.science + byGroup['sample-storage'] + byGroup.supplies;
  return { byGroup, carriedKg, perAstronautKg: carriedKg / state.crew, suitKg: state.suitMassAssumptionKg };
}

/** Equipment the selected objectives suggest but that is not selected. */
export function missingSuggestedEquipment(state: MissionState): string[] {
  const wanted = new Set(OBJECTIVES.filter((o) => state.objectives.includes(o.id)).flatMap((o) => o.suggestedEquipment));
  return [...wanted].filter((id) => !state.equipment[id]);
}

/** Tasks the selected equipment makes possible. */
export function availableTasks(state: MissionState): TaskId[] {
  const ids = new Set<TaskId>();
  EQUIPMENT.filter((e) => state.equipment[e.id]).forEach((e) => e.tasks.forEach((t) => ids.add(t)));
  return (Object.keys(TASKS) as TaskId[]).filter((t) => ids.has(t));
}

/* ------------------------------------------------------------ duration */

export interface DurationSummary {
  travelHours: number;
  taskHours: number;
  totalHours: number;
  availableHours: number;
  /** Positive: hours to spare; negative: hours over the available time. */
  marginHours: number;
  /** Tasks assigned at stops whose equipment is no longer selected. */
  tasksWithoutEquipment: { stop: StopKey; task: TaskId }[];
}

export function durationSummary(state: MissionState, metrics: RouteMetrics): DurationSummary {
  const stops = new Set(routeStops(state).map((s) => s.key));
  const usable = new Set(availableTasks(state));
  let taskMinutes = 0;
  const tasksWithoutEquipment: { stop: StopKey; task: TaskId }[] = [];
  Object.entries(state.tasks).forEach(([stop, tasks]) => {
    if (!stops.has(stop)) return;
    tasks.forEach((task) => {
      taskMinutes += TASKS[task].assumedMinutes;
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
  };
}
