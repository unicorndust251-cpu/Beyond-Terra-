import type { MissionConstraintsSnapshot } from '../../shared';
import type { EnvInputs } from './inputs';

/* ------------------------------------------------------------------ energy */

export interface EnergyRow {
  key: string;
  name: string;
  powerW: number | null;
  hours: number | null;
  hoursSource: 'planner schedule' | 'user' | 'missing';
  wh: number | null;
}

export interface EnergyBudget {
  rows: EnergyRow[];
  /** Sum of rows with both power and hours */
  knownWh: number;
  /** Rows missing power or hours */
  missing: string[];
  /** Losses added to the requirement (only when not already in availableWh) */
  lossesWh: number | null;
  requiredWh: number | null;
  availableWh: number | null;
  remainingWh: number | null;
  reserveWh: number | null;
  marginAboveReserveWh: number | null;
  /** Why a figure could not be computed */
  problems: string[];
  /** Cumulative scheduled equipment energy at each stop (planner-scheduled items with known power only) */
  byStop: { key: string; label: string; cumulativeWh: number }[];
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

/** requiredWh = Σ powerW × hours (+ losses only when not already allowed for); remaining = available − required. */
export function energyBudget(snap: MissionConstraintsSnapshot | null, inputs: EnvInputs): EnergyBudget {
  const e = inputs.energy;
  const rows: EnergyRow[] = [];
  for (const item of snap?.items ?? []) {
    const cfg = e.items[item.uid] ?? { powerW: null, hoursOverride: null };
    const scheduledMin = sum(Object.values(item.minutesByStop));
    const fromPlanner = scheduledMin > 0 && !item.unknownTime ? scheduledMin / 60 : null;
    const hours = cfg.hoursOverride ?? fromPlanner;
    const hoursSource: EnergyRow['hoursSource'] = cfg.hoursOverride != null ? 'user' : fromPlanner != null ? 'planner schedule' : 'missing';
    rows.push({
      key: item.uid,
      name: item.quantity > 1 ? `${item.name} × ${item.quantity}` : item.name,
      powerW: cfg.powerW,
      hours,
      hoursSource,
      wh: cfg.powerW != null && hours != null ? cfg.powerW * hours : null,
    });
  }
  for (const o of e.other) {
    rows.push({
      key: o.id,
      name: o.name || 'Other load',
      powerW: o.powerW,
      hours: o.hours,
      hoursSource: o.hours != null ? 'user' : 'missing',
      wh: o.powerW != null && o.hours != null ? o.powerW * o.hours : null,
    });
  }
  // Only rows with an entered power count as loads; rows without power are listed as missing
  const counted = rows.filter((r) => r.powerW != null);
  const missing = rows.filter((r) => r.wh == null).map((r) => r.name);
  const knownWh = sum(counted.filter((r) => r.wh != null).map((r) => r.wh!));
  const problems: string[] = [];
  if (!counted.length) problems.push('Enter equipment power and battery energy.');
  if (e.availableWh == null) problems.push('Enter the usable energy available (Wh).');
  let lossesWh: number | null = null;
  if (e.lossesIncluded === null) problems.push('State whether the available energy already allows for derating and losses.');
  else if (e.lossesIncluded) lossesWh = 0;
  else if (e.lossPercent == null) problems.push('Enter the documented loss percentage, or mark losses as already included.');
  else lossesWh = (knownWh * e.lossPercent) / 100;
  const requiredWh = counted.length && lossesWh != null ? knownWh + lossesWh : null;
  const remainingWh = requiredWh != null && e.availableWh != null ? e.availableWh - requiredWh : null;
  const marginAboveReserveWh = remainingWh != null && e.reserveWh != null ? remainingWh - e.reserveWh : null;

  // Schedule: planner-scheduled items with entered power and no user hours override
  const byStop: EnergyBudget['byStop'] = [];
  let cum = 0;
  for (const st of snap?.stops ?? []) {
    for (const item of snap!.items) {
      const cfg = e.items[item.uid];
      if (!cfg || cfg.powerW == null || cfg.hoursOverride != null) continue;
      cum += (cfg.powerW * (item.minutesByStop[st.key] ?? 0)) / 60;
    }
    byStop.push({ key: st.key, label: st.name ?? st.label, cumulativeWh: cum });
  }
  return { rows, knownWh, missing, lossesWh, requiredWh, availableWh: e.availableWh, remainingWh, reserveWh: e.reserveWh, marginAboveReserveWh, problems, byStop };
}

/* -------------------------------------------------------------- timeline */

export interface TimelineStop {
  key: string;
  label: string;
  /** Minutes from departure; null once an unknown task time is reached */
  arriveMin: number | null;
  departMin: number | null;
}

export interface LoadTimeline {
  stops: TimelineStop[];
  travelMin: number;
  taskMin: number;
  breakMin: number | null;
  contingencyMin: number | null;
  returnMin: number | null;
  /** travel + task + break + contingency (+ return once, if chosen) */
  missionMin: number | null;
  availableMin: number;
  marginMin: number | null;
  missing: string[];
}

/** segmentMinutes = 60 × km / speed; mission = travel + tasks + breaks + contingency (+ return once). */
export function loadTimeline(snap: MissionConstraintsSnapshot, inputs: EnvInputs): LoadTimeline {
  const speed = snap.speedKmh;
  const stops: TimelineStop[] = [];
  let t: number | null = 0;
  let travel = 0;
  let task = 0;
  let unknownTask = false;
  for (const st of snap.stops) {
    if (st.legKm != null) {
      const m = speed > 0 ? (60 * st.legKm) / speed : NaN;
      travel += m;
      if (t != null) t += m;
    }
    const arrive = t;
    if (st.taskMinutes == null) {
      unknownTask = true;
      t = null;
    } else {
      task += st.taskMinutes;
      if (t != null) t += st.taskMinutes;
    }
    stops.push({ key: st.key, label: st.name ?? st.label, arriveMin: arrive, departMin: t });
  }
  const l = inputs.load;
  const missing: string[] = [];
  if (!(speed > 0)) missing.push('Assumed travel speed');
  if (unknownTask) missing.push('Task durations (some tasks have an unknown time)');
  if (l.breakMinutes == null) missing.push('Break time');
  if (l.contingencyMinutes == null) missing.push('Contingency time');
  const returnMin = l.includeReturn ? snap.returnHours * 60 : 0;
  const missionMin =
    !unknownTask && l.breakMinutes != null && l.contingencyMinutes != null && speed > 0 ? travel + task + l.breakMinutes + l.contingencyMinutes + returnMin : null;
  const availableMin = snap.availableHours * 60;
  return {
    stops,
    travelMin: travel,
    taskMin: task,
    breakMin: l.breakMinutes,
    contingencyMin: l.contingencyMinutes,
    returnMin: l.includeReturn ? returnMin : null,
    missionMin,
    availableMin,
    marginMin: missionMin != null ? availableMin - missionMin : null,
    missing,
  };
}

/* ------------------------------------------------------------------ dose */

/** Constant-rate approximation: dose = rate × duration. Units follow the rate (here µGy/day → µGy). */
export function constantRateDose(ratePerDay: number, hours: number): number {
  return (ratePerDay * hours) / 24;
}

/* ------------------------------------------------------------- terrain LOS */

export const MARS_MEAN_RADIUS_M = 3389500;

/**
 * Is a straight radio path between two antennas clear of the terrain profile?
 * profile: elevations (m) at evenly spaced points from A (index 0) to B (last), over
 * distance `distM`. The spherical bulge (d1·d2 / 2R) is added to the terrain; no
 * refraction or Fresnel zone is modelled.
 */
export function profileClear(profile: number[], distM: number, hA: number, hB: number, R = MARS_MEAN_RADIUS_M): boolean {
  const n = profile.length - 1;
  if (n < 1) return true;
  const a = profile[0] + hA;
  const b = profile[n] + hB;
  for (let i = 1; i < n; i++) {
    const f = i / n;
    const d1 = f * distM;
    const d2 = distM - d1;
    const ground = profile[i] + (d1 * d2) / (2 * R);
    if (ground > a + (b - a) * f) return false;
  }
  return true;
}

/**
 * Elevation angle (degrees) of the terrain horizon seen from distance 0 along a profile,
 * with the curvature drop d² / 2R. profile[k] is at distance stepM × k.
 */
export function horizonAngle(profile: number[], stepM: number, observerHeightM = 0, R = MARS_MEAN_RADIUS_M): number {
  const z0 = profile[0] + observerHeightM;
  let best = -90;
  for (let k = 1; k < profile.length; k++) {
    const d = k * stepM;
    const a = (Math.atan2(profile[k] - z0 - (d * d) / (2 * R), d) * 180) / Math.PI;
    if (a > best) best = a;
  }
  return best;
}

/** "3 h 05 min" */
export function fmtMinutes(min: number): string {
  if (!Number.isFinite(min)) return '—';
  const m = Math.round(Math.abs(min));
  const s = `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} min`;
  return min < 0 ? `−${s}` : s;
}
