import type { MissionConstraintsSnapshot } from '../../shared';
import { constantRateDose, energyBudget, horizonAngle, loadTimeline, profileClear } from './calc';
import { EMPTY_INPUTS, type EnvInputs } from './inputs';

const results: { name: string; ok: boolean; detail: string }[] = [];
const near = (name: string, got: number | null, want: number, tol = 1e-9) =>
  results.push({ name, ok: got != null && Math.abs(got - want) <= tol, detail: `got ${got}, want ${want}` });
const truthy = (name: string, ok: boolean, detail = '') => results.push({ name, ok, detail });

const snap: MissionConstraintsSnapshot = {
  crew: 2,
  travelMode: 'walking',
  speedKmh: 2,
  availableHours: 6,
  travelHours: 2,
  taskHours: 1,
  totalHours: 3,
  marginHours: 3,
  unknownTasks: 0,
  returnKm: 4,
  returnHours: 2,
  stops: [
    { key: 'start', label: 'Start', coordinate: { latitude: 0, longitudeEast: 0 }, legKm: null, taskMinutes: 0, tasks: [] },
    { key: 'cp1', label: 'Waypoint 1', coordinate: { latitude: 0, longitudeEast: 0.03 }, legKm: 1, taskMinutes: 60, tasks: ['Rock sampling'] },
    { key: 'destination', label: 'Destination', coordinate: { latitude: 0, longitudeEast: 0.06 }, legKm: 3, taskMinutes: 0, tasks: [] },
  ],
  carriers: [],
  knownKg: 0,
  unknownMassItems: [],
  unallocatedKg: 0,
  inSuitKg: 0,
  suitMassAssumptionKg: null,
  items: [
    { uid: 'drill', name: 'Drill', quantity: 1, unitMassKg: 6, massStatus: 'Demo', minutesByStop: { cp1: 30 }, unknownTime: false },
    { uid: 'lamp', name: 'Lamp', quantity: 1, unitMassKg: 1, massStatus: 'Demo', minutesByStop: {}, unknownTime: false },
  ],
};

const withEnergy = (energy: Partial<EnvInputs['energy']>): EnvInputs => ({ ...EMPTY_INPUTS, energy: { ...EMPTY_INPUTS.energy, ...energy } });

// Energy: drill 100 W × 0.5 h (planner schedule) = 50 Wh; lamp 10 W × 3 h (user) = 30 Wh
{
  const b = energyBudget(
    snap,
    withEnergy({ availableWh: 200, lossesIncluded: true, reserveWh: 40, items: { drill: { powerW: 100, hoursOverride: null }, lamp: { powerW: 10, hoursOverride: 3 } } }),
  );
  near('Energy: required = Σ power × hours', b.requiredWh, 80);
  near('Energy: remaining = available − required', b.remainingWh, 120);
  near('Energy: margin above reserve shown separately', b.marginAboveReserveWh, 80);
  near('Energy: schedule puts drill energy at its stop', b.byStop[1].cumulativeWh, 50);
  near('Energy: losses not subtracted twice when already included', b.lossesWh, 0);
}
{
  const b = energyBudget(snap, withEnergy({ availableWh: 200, lossesIncluded: false, lossPercent: 10, items: { drill: { powerW: 100, hoursOverride: null } } }));
  near('Energy: documented losses added to the requirement', b.requiredWh, 55);
  truthy('Energy: no reserve entered → no reserve margin (not zero)', b.marginAboveReserveWh === null);
}
{
  const b = energyBudget(snap, withEnergy({ items: { drill: { powerW: 0, hoursOverride: null } }, availableWh: 10, lossesIncluded: true }));
  near('Energy: a valid zero power stays zero', b.requiredWh, 0);
}
{
  const b = energyBudget(snap, EMPTY_INPUTS);
  truthy('Energy: missing inputs give no figures', b.requiredWh === null && b.remainingWh === null && b.problems.includes('Enter equipment power and battery energy.'));
}

// Timeline: legs 1 km and 3 km at 2 km/h = 30 + 90 min; tasks 60 min
{
  const t = loadTimeline(snap, { ...EMPTY_INPUTS, load: { breakMinutes: 15, contingencyMinutes: 30, includeReturn: true, sampleKg: null } });
  near('Timeline: travel = 60 × km / speed', t.travelMin, 120);
  near('Timeline: arrive at waypoint after first leg', t.stops[1].arriveMin, 30);
  near('Timeline: arrive at destination after tasks and second leg', t.stops[2].arriveMin, 180);
  near('Timeline: mission = travel + tasks + breaks + contingency + return once', t.missionMin, 120 + 60 + 15 + 30 + 120);
  near('Timeline: margin against available time', t.marginMin, 360 - 345);
}
{
  const t = loadTimeline(snap, EMPTY_INPUTS);
  truthy('Timeline: missing break/contingency → no mission total', t.missionMin === null && t.missing.includes('Break time'));
}

near('Dose: constant rate × duration (210 µGy/day × 12 h)', constantRateDose(210, 12), 105);

// Line of sight over a flat sphere: 10 km apart, 2 m antennas, flat terrain
{
  const flat = new Array(11).fill(0);
  truthy('LOS: flat ground, 5 km apart is clear (radio horizon of two 2 m antennas ≈ 7.4 km)', profileClear(new Array(11).fill(0), 5000, 2, 2));
  truthy('LOS: flat ground, 10 km apart is below the horizon', !profileClear(flat, 10000, 2, 2));
  const ridge = [...flat];
  ridge[5] = 50;
  truthy('LOS: a 50 m ridge midway blocks 2 m antennas', !profileClear(ridge, 10000, 2, 2));
  // Curvature alone: two 2 m antennas 20 km apart on a smooth sphere are below each other's horizon (bulge ≈ 14.7 m)
  truthy('LOS: Mars curvature blocks 2 m antennas 20 km apart', !profileClear(new Array(21).fill(0), 20000, 2, 2));
}
{
  near('Horizon: flat sphere horizon is just below level', Math.round(horizonAngle(new Array(50).fill(0), 1000) * 1000) / 1000, -0.008, 0.001);
  near('Horizon: a 1 km wall 10 km away, less 14.75 m curvature drop', horizonAngle([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1000], 1000), 5.627, 0.001);
}

export { results };
