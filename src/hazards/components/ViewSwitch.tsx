import { patchHazardState, useHazardState, type AppView } from '../../shared';

const VIEWS: { id: AppView; label: string }[] = [
  { id: 'planner', label: 'Mission Planner' },
  { id: 'hazards', label: 'Hazards' },
];

/** Switches between the two views of the same map. Routes, stops and hazard layers stay put. */
export default function ViewSwitch() {
  const { view } = useHazardState();
  return (
    <nav className="hz-views" aria-label="Views">
      {VIEWS.map((v) => (
        <button
          key={v.id}
          type="button"
          className={view === v.id ? 'is-active' : ''}
          aria-current={view === v.id ? 'page' : undefined}
          onClick={() => patchHazardState({ view: v.id })}
        >
          {v.label}
        </button>
      ))}
    </nav>
  );
}
