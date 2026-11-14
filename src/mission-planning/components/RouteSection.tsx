import type { Dispatch } from 'react';
import {
  DEFAULT_SPEED_KMH,
  ROUTE_STATUS_LABELS,
  routeStatus,
  type MissionAction,
  type MissionState,
  type StopKey,
  type TravelMode,
} from '../model';
import LocationField from './LocationField';

interface Props {
  state: MissionState;
  dispatch: Dispatch<MissionAction>;
  picking: StopKey | null;
  onPick: (stop: StopKey) => void;
  onCalculate: () => void;
}

export const MODE_LABELS: Record<TravelMode, string> = { walking: 'Walking', rover: 'Rover-assisted' };

/** Route inputs only: the results live in the route summary below the map. */
export default function RouteSection({ state, dispatch, picking, onPick, onCalculate }: Props) {
  const status = routeStatus(state);
  const mode = state.travelMode;

  return (
    <div className="mp-route">
      <LocationField
        label="Start"
        accent="start"
        symbol="S"
        location={state.start}
        onChange={(location) => dispatch({ type: 'set-start', location })}
        picking={picking === 'start'}
        onPick={() => onPick('start')}
      />

      {state.checkpoints.map((c, i) => (
        <LocationField
          key={c.id}
          label={`Checkpoint ${i + 1}`}
          accent="checkpoint"
          symbol={String(i + 1)}
          location={c.location}
          onChange={(location) => dispatch({ type: 'set-checkpoint', id: c.id, location })}
          picking={picking === c.id}
          onPick={() => onPick(c.id)}
          onRemove={() => dispatch({ type: 'remove-checkpoint', id: c.id })}
          onMove={(by) => dispatch({ type: 'move-checkpoint', id: c.id, by })}
        />
      ))}

      <button type="button" className="mp-btn mp-btn--ghost mp-btn--wide" onClick={() => dispatch({ type: 'add-checkpoint' })}>
        + Add checkpoint
      </button>

      <LocationField
        label="Destination"
        accent="destination"
        symbol="D"
        location={state.destination}
        onChange={(location) => dispatch({ type: 'set-destination', location })}
        picking={picking === 'destination'}
        onPick={() => onPick('destination')}
      />

      <div className="mp-group">
        <p className="mp-group__title">Travel mode</p>
        <div className="mp-segmented" role="radiogroup" aria-label="Travel mode">
          {(Object.keys(MODE_LABELS) as TravelMode[]).map((m) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={mode === m}
              className={mode === m ? 'is-active' : ''}
              onClick={() => dispatch({ type: 'set-travel-mode', mode: m })}
            >
              {MODE_LABELS[m]}
            </button>
          ))}
        </div>
        <label className="mp-field">
          <span>Assumed {MODE_LABELS[mode].toLowerCase()} speed (km/h)</span>
          <input
            type="number"
            min={0.1}
            step={0.1}
            value={state.speedKmh[mode]}
            onChange={(e) => dispatch({ type: 'set-speed', mode, kmh: Math.max(0, Number(e.target.value) || 0) })}
          />
        </label>
        <p className="mp-note">
          Planning assumption (default {DEFAULT_SPEED_KMH[mode]} km/h), not a validated EVA or rover rate.
        </p>
      </div>

      <div className="mp-actions">
        <button type="button" className="mp-btn mp-btn--primary" onClick={onCalculate} disabled={status === 'incomplete'}>
          {status === 'changed' ? 'Recalculate route' : 'Calculate route'}
        </button>
        <button type="button" className="mp-btn mp-btn--ghost" onClick={() => dispatch({ type: 'reset-route' })}>
          Reset route
        </button>
      </div>
      <p className={`mp-status mp-status--${status}`} role="status">
        {ROUTE_STATUS_LABELS[status]}. Results appear in the route summary below the map.
      </p>
    </div>
  );
}
