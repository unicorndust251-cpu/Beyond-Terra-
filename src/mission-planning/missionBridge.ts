import type { Dispatch } from 'react';
import { createStore, useStore } from '../shared';
import type { MissionAction, MissionState } from './model';

export type PlannerTab = 'route' | 'equipment' | 'summary' | 'saved';

/**
 * The planner's live mission, published for read-only views elsewhere (the Mars Dashboard).
 * There is still one mission: this is the planner's own state and dispatcher, not a copy.
 */
export interface ActiveMission {
  state: MissionState;
  dispatch: Dispatch<MissionAction>;
  /** Name of the saved route the plan came from, if any, and whether it has unsaved changes. */
  savedName: string | null;
  dirty: boolean;
  /** Opens the planner panel on a tab. */
  openTab: (tab: PlannerTab) => void;
}

export const activeMissionStore = createStore<ActiveMission | null>(null);

export function useActiveMission(): ActiveMission | null {
  return useStore(activeMissionStore);
}
