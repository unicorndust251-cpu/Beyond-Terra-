import type { Dispatch } from 'react';
import { equipmentById, OBJECTIVES } from '../data/science';
import { SUIT_PROFILES, type MissionAction, type MissionState, type SuitProfile } from '../model';

interface Props {
  state: MissionState;
  dispatch: Dispatch<MissionAction>;
}

export function MissionConfigSection({ state, dispatch }: Props) {
  return (
    <div className="mp-config">
      <div className="mp-group">
        <p className="mp-group__title">Crew</p>
        <div className="mp-segmented" role="radiogroup" aria-label="Crew size">
          {([1, 2] as const).map((n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={state.crew === n}
              className={state.crew === n ? 'is-active' : ''}
              onClick={() => dispatch({ type: 'set-crew', crew: n })}
            >
              {n === 1 ? 'One astronaut' : 'Two astronauts'}
            </button>
          ))}
        </div>
      </div>

      <div className="mp-group">
        <p className="mp-group__title">Spacesuit profile</p>
        <div className="mp-segmented" role="radiogroup" aria-label="Spacesuit profile">
          {(Object.keys(SUIT_PROFILES) as SuitProfile[]).map((s) => (
            <button
              key={s}
              type="button"
              role="radio"
              aria-checked={state.suit === s}
              className={state.suit === s ? 'is-active' : ''}
              onClick={() => dispatch({ type: 'set-suit', suit: s })}
            >
              {s === 'standard' ? 'Standard' : 'Enhanced mobility'}
            </button>
          ))}
        </div>
        <p className="mp-note">
          {SUIT_PROFILES[state.suit].name}. {SUIT_PROFILES[state.suit].note} Selecting a suit does not make a mission
          safe.
        </p>
      </div>

      <label className="mp-field">
        <span>Available mission duration (hours)</span>
        <input
          type="number"
          min={0.5}
          step={0.5}
          value={state.availableHours}
          onChange={(e) => dispatch({ type: 'set-available-hours', hours: Math.max(0, Number(e.target.value) || 0) })}
        />
      </label>
      <p className="mp-note">Your own time budget for the route; the planner compares the plan against it.</p>
    </div>
  );
}

export function ObjectivesSection({ state, dispatch }: Props) {
  return (
    <ul className="mp-objectives">
      {OBJECTIVES.map((o) => {
        const selected = state.objectives.includes(o.id);
        const missing = o.suggestedEquipment.filter((id) => !state.equipment[id]);
        return (
          <li key={o.id} className={selected ? 'is-selected' : ''}>
            <label className="mp-check">
              <input type="checkbox" checked={selected} onChange={() => dispatch({ type: 'toggle-objective', id: o.id })} />
              <span>
                <strong>{o.name}</strong>
                <small>{o.description}</small>
              </span>
            </label>
            <p className="mp-objectives__kit">
              Suggested equipment: {o.suggestedEquipment.map((id) => equipmentById(id)?.name ?? id).join(', ')}
            </p>
            {selected && missing.length > 0 && (
              <button
                type="button"
                className="mp-btn mp-btn--small"
                onClick={() => dispatch({ type: 'add-suggested-equipment', objective: o.id })}
              >
                Add {missing.length} suggested item{missing.length > 1 ? 's' : ''} to loadout
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
