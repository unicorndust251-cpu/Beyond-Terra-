import { catalogItem, MASS_GROUP_OF, type CatalogItem, type EquipCategory, type MassGroup } from './data/equipment';
import { TASKS, type TaskId } from './data/science';

/**
 * The mission loadout: equipment instances with editable values, carriers, and task
 * assignments, plus every mass, time and cost calculation.
 *
 * Rules (stated in the interface too):
 * - item mass = unit mass × quantity. Unknown (blank) values stay unknown, never zero.
 * - Carrying equipment adds no time. Equipment time counts only when the item is assigned
 *   to a scheduled checkpoint task, and then it replaces that task's own estimate (never
 *   added to it).
 * - Activity per assignment: per task = setup + operating × uses + packing;
 *   per use = uses × (setup + operating + packing). Quantity does not multiply time.
 * - Within a task, attended work is done one after another; an unattended item's operating
 *   time may overlap it (its setup and packing are attended). Tasks at a stop run one after
 *   another, so no astronaut or unit is ever booked twice at once.
 * - Cost is optional, kept apart from route and time, and summed per currency only.
 */

export type ValueStatus = 'published' | 'demo' | 'user' | 'unknown';

export const STATUS_LABELS: Record<ValueStatus, string> = {
  published: 'Published reference',
  demo: 'Demo estimate — editable',
  user: 'User supplied',
  unknown: 'Unknown',
};

export interface Valued {
  /** null = unknown / not provided (never treated as zero). */
  value: number | null;
  status: ValueStatus;
  source?: string;
}

export type NumKey = 'unitMassKg' | 'quantity' | 'setupMin' | 'operatingMin' | 'packingMin' | 'unitCost';

export const FIELD_LABELS: Record<NumKey, string> = {
  unitMassKg: 'Unit mass (kg)',
  quantity: 'Quantity',
  setupMin: 'Setup (min)',
  operatingMin: 'Operating per use (min)',
  packingMin: 'Packing (min)',
  unitCost: 'Unit cost',
};

export type Carrier = 'astronaut-1' | 'astronaut-2' | 'rover';

export const CARRIER_LABELS: Record<Carrier, string> = {
  'astronaut-1': 'Astronaut 1',
  'astronaut-2': 'Astronaut 2',
  rover: 'Rover',
};

export type TimingMode = 'per-task' | 'per-use';

export interface Assignment {
  id: string;
  /** Route stop key: 'start', 'destination' or a waypoint id. */
  stop: string;
  task: TaskId;
  /** Number of uses during the task: a positive whole number. */
  uses: number;
}

export interface LoadoutItem {
  uid: string;
  /** Menu id, or null for custom equipment. */
  catalogId: string | null;
  name: string;
  category: EquipCategory;
  purpose: string;
  /** Tasks the item can be used for. */
  tasks: TaskId[];
  fields: Record<NumKey, Valued>;
  currency: string;
  timingMode: TimingMode;
  /** Units per carrier; their sum never exceeds the quantity. */
  allocation: Partial<Record<Carrier, number>>;
  /** Needs an astronaut's continuous attention while operating. */
  attended: boolean;
  /** Its batteries and accessories are part of this item (not carried separately). */
  includesBatteries: boolean;
  /** Part of the spacesuit: counted with the suit, not as carried equipment. */
  inSuit: boolean;
  notes: string;
  assignments: Assignment[];
}

export function newId(prefix: string): string {
  const random =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `${prefix}-${Date.now().toString(36)}-${random}`;
}

const demo = (value: number): Valued => ({ value, status: 'demo' });
const notProvided: Valued = { value: null, status: 'unknown' };

/** Default values for a menu item (all demo estimates unless a source is recorded). */
export function catalogFields(c: CatalogItem): Record<NumKey, Valued> {
  const fromCatalog = (v: number): Valued => (c.source ? { value: v, status: 'published', source: c.source } : demo(v));
  return {
    unitMassKg: fromCatalog(c.demo.unitMassKg),
    quantity: { value: 1, status: 'demo' },
    setupMin: fromCatalog(c.demo.setupMin),
    operatingMin: fromCatalog(c.demo.operatingMin),
    packingMin: fromCatalog(c.demo.packingMin),
    unitCost: { ...notProvided },
  };
}

export function itemFromCatalog(c: CatalogItem): LoadoutItem {
  return {
    uid: newId('eq'),
    catalogId: c.id,
    name: c.name,
    category: c.category,
    purpose: c.purpose,
    tasks: [...c.tasks],
    fields: catalogFields(c),
    currency: '',
    timingMode: 'per-task',
    allocation: { 'astronaut-1': 1 },
    attended: c.attended ?? true,
    includesBatteries: false,
    inSuit: false,
    notes: '',
    assignments: [],
  };
}

/** Restores a menu item's original values and labels; keeps its carriers' total within the quantity. */
export function resetToDefaults(item: LoadoutItem): LoadoutItem {
  const c = catalogItem(item.catalogId);
  if (!c) return item;
  return {
    ...item,
    name: c.name,
    category: c.category,
    purpose: c.purpose,
    tasks: [...c.tasks],
    fields: catalogFields(c),
    timingMode: 'per-task',
    attended: c.attended ?? true,
    allocation: clampAllocation(item.allocation, 1),
  };
}

/* ------------------------------------------------------------------ input */

export type ParseResult = { value: number | null } | { error: string };

/**
 * Validates a typed value. Blank = unknown (null). Decimals are accepted; negative,
 * non-numeric and infinite values are rejected. Quantity must be a positive whole number
 * and cannot be blank.
 */
export function parseFieldInput(key: NumKey, text: string): ParseResult {
  const t = text.trim().replace(',', '.');
  if (t === '') return key === 'quantity' ? { error: 'Quantity must be a positive whole number.' } : { value: null };
  if (!/^[+]?(\d+(\.\d*)?|\.\d+)$/.test(t)) {
    return { error: t.startsWith('-') || t.startsWith('−') ? 'Negative values are not allowed.' : 'Enter a number, or leave it blank if unknown.' };
  }
  const v = Number(t);
  if (!Number.isFinite(v)) return { error: 'Enter a finite number.' };
  if (key === 'quantity' && (!Number.isInteger(v) || v < 1)) return { error: 'Quantity must be a positive whole number.' };
  return { value: v };
}

/** Units per carrier, trimmed so their sum never exceeds `quantity`. */
export function clampAllocation(allocation: Partial<Record<Carrier, number>>, quantity: number): Partial<Record<Carrier, number>> {
  let left = quantity;
  const out: Partial<Record<Carrier, number>> = {};
  (Object.keys(CARRIER_LABELS) as Carrier[]).forEach((c) => {
    const units = Math.max(0, Math.min(left, Math.floor(allocation[c] ?? 0)));
    if (units > 0) out[c] = units;
    left -= units;
  });
  return out;
}

export function allocatedUnits(item: LoadoutItem): number {
  return Object.values(item.allocation).reduce((s, n) => s + (n ?? 0), 0);
}

export function quantity(item: LoadoutItem): number {
  return item.fields.quantity.value ?? 1;
}

/** Carriers available with this crew and travel mode. */
export function availableCarriers(crew: 1 | 2, rover: boolean): Carrier[] {
  return [...(crew === 2 ? (['astronaut-1', 'astronaut-2'] as Carrier[]) : (['astronaut-1'] as Carrier[])), ...(rover ? (['rover'] as Carrier[]) : [])];
}

/* ------------------------------------------------------------------ mass */

export interface MassSummary {
  /** Known mass per group (excluding suit-integrated items). */
  byGroup: Record<MassGroup, number>;
  knownKg: number;
  /** Items (not in the suit) whose unit mass is unknown. */
  unknownItems: string[];
  /** Known mass per carrier, from allocated units. */
  byCarrier: Partial<Record<Carrier, number>>;
  /** Units not allocated to any carrier, and their known mass. */
  unallocatedUnits: number;
  unallocatedKg: number;
  /** Items counted as part of the suit, and their known mass. */
  inSuitItems: string[];
  inSuitKg: number;
  /** Allocations to a carrier that is not configured (e.g. Astronaut 2 with a crew of one). */
  invalidCarrierItems: string[];
}

export function massSummary(items: LoadoutItem[], carriers: Carrier[]): MassSummary {
  const byGroup: Record<MassGroup, number> = { science: 0, navcomm: 0, support: 0, storage: 0 };
  const byCarrier: Partial<Record<Carrier, number>> = {};
  const out: MassSummary = {
    byGroup,
    knownKg: 0,
    unknownItems: [],
    byCarrier,
    unallocatedUnits: 0,
    unallocatedKg: 0,
    inSuitItems: [],
    inSuitKg: 0,
    invalidCarrierItems: [],
  };
  items.forEach((item) => {
    const unit = item.fields.unitMassKg.value;
    const qty = quantity(item);
    if (item.inSuit) {
      out.inSuitItems.push(item.name);
      if (unit !== null) out.inSuitKg += unit * qty;
      return;
    }
    if (unit === null) {
      out.unknownItems.push(item.name);
    } else {
      byGroup[MASS_GROUP_OF[item.category]] += unit * qty;
      out.knownKg += unit * qty;
    }
    let allocated = 0;
    (Object.entries(item.allocation) as [Carrier, number][]).forEach(([carrier, units]) => {
      if (!units) return;
      allocated += units;
      if (!carriers.includes(carrier)) {
        if (!out.invalidCarrierItems.includes(item.name)) out.invalidCarrierItems.push(item.name);
      }
      if (unit !== null) byCarrier[carrier] = (byCarrier[carrier] ?? 0) + unit * units;
    });
    const rest = Math.max(0, qty - allocated);
    out.unallocatedUnits += rest;
    if (unit !== null) out.unallocatedKg += unit * rest;
  });
  return out;
}

/** "12.4 kg" or "Known equipment mass: 12.4 kg + 2 items with unknown mass". */
export function describeKnownMass(kg: number, unknownCount: number): string {
  const known = `${kg.toFixed(1)} kg`;
  if (!unknownCount) return known;
  return `Known equipment mass: ${known} + ${unknownCount} item${unknownCount > 1 ? 's' : ''} with unknown mass`;
}

/* ------------------------------------------------------------------ time */

/** Minutes for one assignment, or null if a needed value is unknown. */
export function activityMinutes(item: LoadoutItem, uses: number): { total: number | null; attendedPart: number | null } {
  const { setupMin, operatingMin, packingMin } = item.fields;
  if (setupMin.value === null || operatingMin.value === null || packingMin.value === null) return { total: null, attendedPart: null };
  const s = setupMin.value;
  const o = operatingMin.value;
  const p = packingMin.value;
  if (item.timingMode === 'per-use') return { total: uses * (s + o + p), attendedPart: uses * (s + p) };
  return { total: s + o * uses + p, attendedPart: s + p };
}

export interface ScheduledActivity {
  stop: string;
  task: TaskId;
  item: string;
  itemUid: string;
  uses: number;
  minutes: number | null;
  attended: boolean;
}

export interface TaskTiming {
  stop: string;
  task: TaskId;
  /** Where the time comes from. */
  source: 'equipment' | 'task-estimate';
  /** null if an assigned item has an unknown time. */
  minutes: number | null;
  activities: ScheduledActivity[];
}

/**
 * The time of one scheduled task at one stop. With equipment assigned, it comes from the
 * equipment (attended work in sequence; unattended operating may overlap it); without,
 * it is the task's own estimate. The two are never added together.
 */
export function taskTiming(items: LoadoutItem[], stop: string, task: TaskId): TaskTiming {
  const activities: ScheduledActivity[] = [];
  items.forEach((item) =>
    item.assignments
      .filter((a) => a.stop === stop && a.task === task)
      .forEach((a) =>
        activities.push({
          stop,
          task,
          item: item.name,
          itemUid: item.uid,
          uses: a.uses,
          minutes: activityMinutes(item, a.uses).total,
          attended: item.attended,
        }),
      ),
  );
  if (!activities.length) return { stop, task, source: 'task-estimate', minutes: TASKS[task].assumedMinutes, activities };
  if (activities.some((a) => a.minutes === null)) return { stop, task, source: 'equipment', minutes: null, activities };

  let attendedSum = 0;
  let longestUnattended = 0;
  activities.forEach((a) => {
    const item = items.find((i) => i.uid === a.itemUid)!;
    if (a.attended) attendedSum += a.minutes!;
    else {
      attendedSum += activityMinutes(item, a.uses).attendedPart!;
      longestUnattended = Math.max(longestUnattended, a.minutes!);
    }
  });
  return { stop, task, source: 'equipment', minutes: Math.max(attendedSum, longestUnattended), activities };
}

/* ------------------------------------------------------------------ cost */

export interface CostSummary {
  /** Totals per currency code (only same-currency values are added). */
  byCurrency: Record<string, number>;
  /** Items with a cost but no currency, which cannot be summed. */
  noCurrency: string[];
  /** Items whose cost was not provided. */
  notProvided: number;
}

export function costSummary(items: LoadoutItem[]): CostSummary {
  const out: CostSummary = { byCurrency: {}, noCurrency: [], notProvided: 0 };
  items.forEach((item) => {
    const unit = item.fields.unitCost.value;
    if (unit === null) {
      out.notProvided++;
      return;
    }
    const code = item.currency.trim().toUpperCase();
    if (!code) {
      out.noCurrency.push(item.name);
      return;
    }
    out.byCurrency[code] = (out.byCurrency[code] ?? 0) + unit * quantity(item);
  });
  return out;
}

/** Counts of each value status across the loadout. */
export function provenanceCounts(items: LoadoutItem[]): Record<ValueStatus, number> {
  const out: Record<ValueStatus, number> = { published: 0, demo: 0, user: 0, unknown: 0 };
  items.forEach((item) => (Object.keys(item.fields) as NumKey[]).forEach((k) => out[item.fields[k].status]++));
  return out;
}
