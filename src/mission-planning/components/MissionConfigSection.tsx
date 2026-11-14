import type { Dispatch } from 'react';
import { catalogItem } from '../data/equipment';
import { OBJECTIVES } from '../data/science';
import { SUIT_PROFILES, type MissionAction, type MissionState, type SuitProfile } from '../model';
import { InfoTip } from './ui';

interface Props {
  state: MissionState;
  dispatch: Dispatch<MissionAction>;
}

export function MissionConfigSection({ state, dispatch }: Props) {
  return (
    <div className="mp-config">
      <div className="mp-field">
        <span>Crew</span>
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

      <div className="mp-field">
        <span>
          Spacesuit profile
          <InfoTip label="About suit profiles">
            {SUIT_PROFILES[state.suit].name}. {SUIT_PROFILES[state.suit].note} Selecting a suit does not make a mission safe.
          </InfoTip>
        </span>
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
      </div>

      <label className="mp-field mp-field--inline">
        <span>
          Available time
          <InfoTip label="About available time">
            Your own time budget for the route; the planner compares the plan against it.
          </InfoTip>
        </span>
        <span className="mp-unit-input">
          <input
            type="number"
            min={0.5}
            step={0.5}
            aria-label="Available mission duration in hours"
            value={state.availableHours}
            onChange={(e) => dispatch({ type: 'set-available-hours', hours: Math.max(0, Number(e.target.value) || 0) })}
          />
          h
        </span>
      </label>
    </div>
  );
}

export function ObjectivesSection({ state, dispatch }: Props) {
  return (
    <ul className="mp-checklist">
      {OBJECTIVES.map((o) => {
        const selected = state.objectives.includes(o.id);
        const missing = o.suggestedEquipment.filter((id) => !state.loadout.some((i) => i.catalogId === id));
        return (
          <li key={o.id} className={selected ? 'is-selected' : ''}>
            <div className="mp-checklist__row">
              <label className="mp-check">
                <input type="checkbox" checked={selected} onChange={() => dispatch({ type: 'toggle-objective', id: o.id })} />
                <span>{o.name}</span>
              </label>
              <InfoTip label={`About ${o.name}`}>
                {o.description} Suggested equipment: {o.suggestedEquipment.map((id) => catalogItem(id)?.name ?? id).join(', ')}.
              </InfoTip>
            </div>
            {selected && missing.length > 0 && (
              <button type="button" className="mp-link mp-checklist__action" onClick={() => dispatch({ type: 'add-suggested-equipment', objective: o.id })}>
                + Add {missing.length} suggested item{missing.length > 1 ? 's' : ''} to loadout
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
