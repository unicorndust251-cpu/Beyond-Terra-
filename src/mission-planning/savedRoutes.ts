import { isValidCoordinate, type MarsCoordinate } from '../shared';
import { CATEGORY_LABELS } from './data/equipment';
import { OBJECTIVES, TASK_IDS, type TaskId } from './data/science';
import { CARRIER_LABELS, newId, type LoadoutItem, type NumKey, type Valued } from './loadout';
import { initialMissionState, type MissionState, type PlannedLocation } from './model';

/**
 * Saved Marswalks. Stored in this browser only (localStorage): they survive reloads and
 * restarts but do not sync between devices or accounts. The interface below is all the
 * planner uses, so a server-backed store can replace this one later.
 */

export interface SavedRoute {
  id: string;
  name: string;
  /** ISO 8601 times. */
  savedAt: string;
  updatedAt: string;
  mission: MissionState;
}

export interface RouteStore {
  /** False when the browser refuses storage: routes then last only for this visit. */
  readonly persistent: boolean;
  list(): SavedRoute[];
  /** Saves a new route and returns it. */
  create(name: string, mission: MissionState): SavedRoute;
  /** Replaces a saved route's mission (and name). */
  update(id: string, name: string, mission: MissionState): SavedRoute | null;
  remove(id: string): void;
  /** Saved entries that could not be read (corrupted or from an unknown version). */
  readonly skipped: number;
}

const KEY = 'beyond-terra:saved-marswalks';
const VERSION = 1;

interface StoredFile {
  version: number;
  routes: unknown[];
}

/* ------------------------------------------------------------ validation */

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isStr = (v: unknown): v is string => typeof v === 'string';

function readLocation(v: unknown): PlannedLocation | null | undefined {
  if (v === null) return null;
  if (!isObj(v) || !isObj(v.coordinate)) return undefined;
  const c = v.coordinate as Partial<MarsCoordinate>;
  if (!isNum(c.latitude) || !isNum(c.longitudeEast) || !isValidCoordinate(c as MarsCoordinate)) return undefined;
  return { coordinate: { latitude: c.latitude, longitudeEast: c.longitudeEast }, ...(isStr(v.name) ? { name: v.name } : {}) };
}

function readValued(v: unknown, key: NumKey): Valued | undefined {
  if (!isObj(v)) return undefined;
  const status = v.status;
  if (status !== 'published' && status !== 'demo' && status !== 'user' && status !== 'unknown') return undefined;
  if (v.value !== null && !(isNum(v.value) && v.value >= 0)) return undefined;
  if (key === 'quantity' && !(isNum(v.value) && Number.isInteger(v.value) && v.value >= 1)) return undefined;
  return { value: v.value as number | null, status, ...(isStr(v.source) ? { source: v.source } : {}) };
}

const isTask = (t: unknown): t is TaskId => isStr(t) && (TASK_IDS as string[]).includes(t);

function readItem(v: unknown): LoadoutItem | undefined {
  if (!isObj(v) || !isStr(v.uid) || !isStr(v.name) || !isStr(v.category) || !(v.category in CATEGORY_LABELS)) return undefined;
  if (!isObj(v.fields)) return undefined;
  const fields = {} as Record<NumKey, Valued>;
  for (const k of ['unitMassKg', 'quantity', 'setupMin', 'operatingMin', 'packingMin', 'unitCost'] as NumKey[]) {
    const f = readValued((v.fields as Record<string, unknown>)[k], k);
    if (!f) return undefined;
    fields[k] = f;
  }
  const allocation: LoadoutItem['allocation'] = {};
  if (isObj(v.allocation)) {
    Object.entries(v.allocation).forEach(([c, n]) => {
      if (c in CARRIER_LABELS && isNum(n) && n > 0) allocation[c as keyof typeof CARRIER_LABELS] = Math.floor(n);
    });
  }
  const assignments = Array.isArray(v.assignments)
    ? v.assignments
        .filter((a): a is Record<string, unknown> => isObj(a) && isStr(a.stop) && isTask(a.task) && isNum(a.uses) && a.uses >= 1)
        .map((a) => ({ id: isStr(a.id) ? a.id : newId('as'), stop: a.stop as string, task: a.task as TaskId, uses: Math.floor(a.uses as number) }))
    : [];
  return {
    uid: v.uid,
    catalogId: isStr(v.catalogId) ? v.catalogId : null,
    name: v.name,
    category: v.category as LoadoutItem['category'],
    purpose: isStr(v.purpose) ? v.purpose : '',
    tasks: Array.isArray(v.tasks) ? v.tasks.filter(isTask) : [],
    fields,
    currency: isStr(v.currency) ? v.currency : '',
    timingMode: v.timingMode === 'per-use' ? 'per-use' : 'per-task',
    allocation,
    attended: v.attended !== false,
    includesBatteries: v.includesBatteries === true,
    inSuit: v.inSuit === true,
    notes: isStr(v.notes) ? v.notes : '',
    assignments,
  };
}

/** Checks a stored mission field by field; returns null if it cannot be trusted. */
export function readMission(v: unknown): MissionState | null {
  if (!isObj(v)) return null;
  const base = initialMissionState();
  const start = readLocation(v.start);
  const destination = readLocation(v.destination);
  if (start === undefined || destination === undefined || !Array.isArray(v.checkpoints)) return null;
  const checkpoints = [];
  for (const c of v.checkpoints) {
    if (!isObj(c) || !isStr(c.id)) return null;
    const location = readLocation(c.location);
    if (location === undefined) return null;
    checkpoints.push({ id: c.id, location });
  }
  const loadout: LoadoutItem[] = [];
  if (Array.isArray(v.loadout)) {
    for (const raw of v.loadout) {
      const item = readItem(raw);
      if (!item) return null;
      loadout.push(item);
    }
  }
  const tasks: Record<string, TaskId[]> = {};
  if (isObj(v.tasks)) Object.entries(v.tasks).forEach(([stop, list]) => Array.isArray(list) && (tasks[stop] = list.filter(isTask)));
  const speed = isObj(v.speedKmh) ? v.speedKmh : {};
  return {
    ...base,
    start,
    destination,
    checkpoints,
    calculatedSignature: isStr(v.calculatedSignature) ? v.calculatedSignature : null,
    travelMode: v.travelMode === 'rover' ? 'rover' : 'walking',
    speedKmh: {
      walking: isNum(speed.walking) && speed.walking > 0 ? speed.walking : base.speedKmh.walking,
      rover: isNum(speed.rover) && speed.rover > 0 ? speed.rover : base.speedKmh.rover,
    },
    crew: v.crew === 1 ? 1 : 2,
    suit: v.suit === 'enhanced' ? 'enhanced' : 'standard',
    objectives: Array.isArray(v.objectives) ? v.objectives.filter((o): o is MissionState['objectives'][number] => OBJECTIVES.some((x) => x.id === o)) : [],
    availableHours: isNum(v.availableHours) && v.availableHours >= 0 ? v.availableHours : base.availableHours,
    loadout,
    suitMassAssumptionKg: isNum(v.suitMassAssumptionKg) && v.suitMassAssumptionKg >= 0 ? v.suitMassAssumptionKg : null,
    tasks,
  };
}

function readRoute(v: unknown): SavedRoute | null {
  if (!isObj(v) || !isStr(v.id) || !isStr(v.name) || !isStr(v.savedAt)) return null;
  const mission = readMission(v.mission);
  if (!mission) return null;
  return { id: v.id, name: v.name, savedAt: v.savedAt, updatedAt: isStr(v.updatedAt) ? v.updatedAt : v.savedAt, mission };
}

/* --------------------------------------------------------------- storage */

function getStorage(): Storage | null {
  try {
    const s = window.localStorage;
    const probe = `${KEY}:probe`;
    s.setItem(probe, '1');
    s.removeItem(probe);
    return s;
  } catch {
    return null;
  }
}

/** localStorage, with a memory fallback when the browser blocks storage. */
export function createLocalRouteStore(): RouteStore {
  const storage = getStorage();
  let routes: SavedRoute[] = [];
  let skipped = 0;
  // Unreadable entries are written back untouched, so a later fix can still recover them
  const unreadable: unknown[] = [];

  if (storage) {
    try {
      const raw = storage.getItem(KEY);
      if (raw) {
        const file = JSON.parse(raw) as StoredFile;
        if (isObj(file) && file.version === VERSION && Array.isArray(file.routes)) {
          file.routes.forEach((r) => {
            const route = readRoute(r);
            if (route) routes.push(route);
            else {
              skipped++;
              unreadable.push(r);
            }
          });
        } else {
          skipped++;
          storage.setItem(`${KEY}:backup`, raw);
        }
      }
    } catch {
      skipped++;
      try {
        const raw = storage.getItem(KEY);
        if (raw) storage.setItem(`${KEY}:backup`, raw);
      } catch {
        /* nothing more to keep */
      }
    }
  }

  const persist = () => {
    if (!storage) return;
    try {
      storage.setItem(KEY, JSON.stringify({ version: VERSION, routes: [...routes, ...unreadable] } satisfies StoredFile));
    } catch {
      /* quota exceeded or storage revoked: the routes remain for this visit */
    }
  };

  const copy = (m: MissionState): MissionState => JSON.parse(JSON.stringify(m)) as MissionState;

  return {
    persistent: !!storage,
    get skipped() {
      return skipped;
    },
    list: () => [...routes].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    create(name, mission) {
      const now = new Date().toISOString();
      const route: SavedRoute = { id: newId('route'), name, savedAt: now, updatedAt: now, mission: copy(mission) };
      routes = [...routes, route];
      persist();
      return route;
    },
    update(id, name, mission) {
      const existing = routes.find((r) => r.id === id);
      if (!existing) return null;
      const route: SavedRoute = { ...existing, name, updatedAt: new Date().toISOString(), mission: copy(mission) };
      routes = routes.map((r) => (r.id === id ? route : r));
      persist();
      return route;
    },
    remove(id) {
      routes = routes.filter((r) => r.id !== id);
      persist();
    },
  };
}

/** A stable fingerprint of a mission, to tell whether it has unsaved changes. */
export function missionFingerprint(m: MissionState): string {
  return JSON.stringify(m);
}

/** True when a mission holds anything worth keeping. */
export function hasContent(m: MissionState): boolean {
  return missionFingerprint(m) !== missionFingerprint(initialMissionState());
}
