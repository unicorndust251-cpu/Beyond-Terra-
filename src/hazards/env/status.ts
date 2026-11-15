import type { DemStore } from '../../science/molaDem';
import type { HazardCode, MissionConstraintsSnapshot, PlannedRoute } from '../../shared';
import type { LoadState } from '../HazardsLayer';
import { energyBudget, loadTimeline } from './calc';
import type { EnvInputs } from './inputs';

export type DataStatus =
  | 'Loading'
  | 'Historical Observation'
  | 'Calculated'
  | 'Modelled'
  | 'User Input'
  | 'Missing Input'
  | 'Data Not Loaded'
  | 'Load Failed';

export interface EnvStatus {
  status: DataStatus;
  /** One line naming what is shown, or exactly what is missing */
  text: string;
  tone: 'ok' | 'warn' | 'error' | 'muted';
  retry?: () => void;
}

export interface EnvContext {
  plannedTime: string | null;
  dem: LoadState<DemStore>;
  retryDem(): void;
  inputs: EnvInputs;
  snapshot: MissionConstraintsSnapshot | null;
  route: PlannedRoute | null;
  commReady: boolean;
}

export const MEDA_NOTE =
  'No MEDA observations are loaded: the PDS Atmospheres Node could not be reached securely when this was built (TLS certificate not verifiable), so no MEDA product was retrieved or adapted.';

/** The status line under a category's switch. Every missing case names its dependency. */
export function envStatus(code: HazardCode, c: EnvContext): EnvStatus | null {
  const comm = c.inputs.comm;
  switch (code) {
    case 'V':
      if (!c.plannedTime) return { status: 'Missing Input', text: 'Set a planned date and time in the top bar to calculate the Sun’s position.', tone: 'warn' };
      if (c.dem.state === 'error')
        return { status: 'Calculated', text: 'Solar position calculated; terrain-shadow model unavailable (MOLA failed to load).', tone: 'warn', retry: c.retryDem };
      return { status: 'Calculated', text: 'Sun position and night side calculated (Mars24). Terrain horizon at a selected point only; no dust visibility data.', tone: 'ok' };
    case 'T':
      return { status: 'Data Not Loaded', text: 'Select a date with available observations: none are loaded. MEDA products could not be retrieved.', tone: 'warn' };
    case 'R':
      return { status: 'Historical Observation', text: 'One measurement: Curiosity RAD at Gale, 2012–13, about 210 µGy/day. Not a radiation map.', tone: 'ok' };
    case 'C': {
      const nodes = comm.nodes.filter((n) => n.antennaM != null);
      if (!comm.nodes.length) return { status: 'Missing Input', text: 'Coverage not calculated — habitat/relay configuration required.', tone: 'warn' };
      if (nodes.length < comm.nodes.length || comm.crewAntennaM == null)
        return { status: 'Missing Input', text: 'Enter antenna heights for every node and for the crew.', tone: 'warn' };
      if (c.dem.state === 'error') return { status: 'Load Failed', text: 'Terrain model required for line of sight (MOLA failed to load).', tone: 'error', retry: c.retryDem };
      if (!c.route) return { status: 'User Input', text: `${nodes.length} configured node${nodes.length > 1 ? 's' : ''}. Plan a route to calculate terrain line of sight along it.`, tone: 'muted' };
      return { status: 'Calculated', text: 'Terrain line of sight calculated along the route. Not a full radio-link assessment.', tone: 'ok' };
    }
    case 'N':
      if (c.inputs.nav.uncertaintyM == null) return { status: 'Missing Input', text: 'Position uncertainty has not been quantified.', tone: 'warn' };
      return { status: 'User Input', text: `Stated uncertainty ${c.inputs.nav.uncertaintyM} m${c.inputs.nav.definition ? ` (${c.inputs.nav.definition})` : ''}, drawn around the route’s stops.`, tone: 'ok' };
    case 'E': {
      if (!c.snapshot) return { status: 'Missing Input', text: 'Add route and task durations in the Mission Planner, then enter equipment power and battery energy.', tone: 'warn' };
      const b = energyBudget(c.snapshot, c.inputs);
      if (b.problems.length) return { status: 'Missing Input', text: b.problems[0], tone: 'warn' };
      return {
        status: 'Calculated',
        text: b.remainingWh! < 0 ? `Plan exceeds the entered budget by ${Math.abs(b.remainingWh!).toFixed(0)} Wh.` : `${b.remainingWh!.toFixed(0)} Wh remaining of ${b.availableWh} Wh entered.`,
        tone: b.remainingWh! < 0 || (b.marginAboveReserveWh != null && b.marginAboveReserveWh < 0) ? 'error' : 'ok',
      };
    }
    case 'M': {
      if (!c.snapshot) return { status: 'Missing Input', text: 'Add route and task durations in the Mission Planner.', tone: 'warn' };
      const t = loadTimeline(c.snapshot, c.inputs);
      if (t.missionMin == null) return { status: 'Calculated', text: `Load and timeline from the planner. Missing: ${t.missing.join(', ').toLowerCase()}.`, tone: 'warn' };
      return {
        status: 'Calculated',
        text: t.marginMin! < 0 ? `Plan exceeds the available time by ${Math.round(-t.marginMin! / 6) / 10} h.` : `${Math.round(t.marginMin! / 6) / 10} h left of the available time.`,
        tone: t.marginMin! < 0 ? 'error' : 'ok',
      };
    }
    case 'U':
      return { status: 'Calculated', text: 'Covers all terrain: nothing is assessed at walking scale.', tone: 'muted' };
    default:
      return null;
  }
}
