import MissionPlannerPanel from './components/MissionPlannerPanel';

/**
 * Mission planning's entry point, rendered inside the map (see components/MarsMapWithFeatures).
 *
 * Uses the map only through `useMapBridge()` and the visitor's picks through
 * `useSelectedLocation()`, both from `../shared`. Does not import `../scientific-data`:
 * the planner works without elevation, terrain or hazard layers.
 */
export default function MissionPlanningLayer() {
  return <MissionPlannerPanel />;
}
