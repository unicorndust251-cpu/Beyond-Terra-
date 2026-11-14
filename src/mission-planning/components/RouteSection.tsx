import type { Dispatch } from 'react';
import { formatCoordinate, formatDuration, formatKm, MARS_MEAN_RADIUS_KM } from '../geo';
import {
  DEFAULT_SPEED_KMH,
  ROUTE_STATUS_LABELS,
  routeStatus,
  type MissionAction,
  type MissionState,
  type RouteMetrics,
  type StopKey,
  type TravelMode,
} from '../model';
import LocationField from './LocationField';

interface Props {
  state: MissionState;
  dispatch: Dispatch<MissionAction>;
  metrics: RouteMetrics;
  picking: StopKey | null;
  onPick: (stop: StopKey) => void;
  onCalculate: () => void;
}

const MODE_LABELS: Record<TravelMode, string> = { walking: 'Walking', rover: 'Rover-assisted' };

export default function RouteSection({ state, dispatch, metrics, picking, onPick, onCalculate }: Props) {
  const status = routeStatus(state);
  const mode = state.travelMode;

  return (
    <div className="mp-route">
      <LocationField
        label="Start"
        accent="start"
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
          Planning assumption (default {DEFAULT_SPEED_KMH[mode]} km/h), not a validated EVA or rover rate. No terrain or
          hazard adjustment is applied.
        </p>
      </div>

      <div className="mp-actions">
        <button type="button" className="mp-btn mp-btn--primary" onClick={onCalculate} disabled={status === 'incomplete'}>
          Calculate route
        </button>
        <button type="button" className="mp-btn mp-btn--ghost" onClick={() => dispatch({ type: 'reset-route' })}>
          Reset route
        </button>
      </div>

      <dl className="mp-facts">
        <div>
          <dt>Route status</dt>
          <dd className={`mp-status mp-status--${status}`}>{ROUTE_STATUS_LABELS[status]}</dd>
        </div>
        <div>
          <dt>Start</dt>
          <dd className="mp-data">{state.start ? formatCoordinate(state.start.coordinate) : '—'}</dd>
        </div>
        <div>
          <dt>Destination</dt>
          <dd className="mp-data">{state.destination ? formatCoordinate(state.destination.coordinate) : '—'}</dd>
        </div>
        <div>
          <dt>Checkpoints</dt>
          <dd className="mp-data">{state.checkpoints.length}</dd>
        </div>
        <div>
          <dt>Travel mode</dt>
          <dd>{MODE_LABELS[mode]}</dd>
        </div>
        <div>
          <dt>Total distance</dt>
          <dd className="mp-data">{metrics.segments.length ? formatKm(metrics.totalKm) : '—'}</dd>
        </div>
        <div>
          <dt>Estimated travel time</dt>
          <dd className="mp-data">{metrics.segments.length ? formatDuration(metrics.travelHours) : '—'}</dd>
        </div>
      </dl>

      {metrics.segments.length > 0 && (
        <table className="mp-table">
          <caption>Segments</caption>
          <thead>
            <tr>
              <th scope="col">Segment</th>
              <th scope="col">Distance</th>
              <th scope="col">Time</th>
            </tr>
          </thead>
          <tbody>
            {metrics.segments.map((s) => (
              <tr key={`${s.from.key}-${s.to.key}`}>
                <td>
                  {s.from.label} → {s.to.label}
                </td>
                <td className="mp-data">{formatKm(s.km)}</td>
                <td className="mp-data">{formatDuration(s.hours)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row">Total</th>
              <td className="mp-data">{formatKm(metrics.totalKm)}</td>
              <td className="mp-data">{formatDuration(metrics.travelHours)}</td>
            </tr>
          </tfoot>
        </table>
      )}

      <p className="mp-note">
        Great-circle (Haversine) distances on a sphere of Mars’s mean radius, R = {MARS_MEAN_RADIUS_KM} km. These are
        straight-line geographic estimates, not terrain-following walking distances, and say nothing about whether the
        route is safe or traversable.
      </p>
    </div>
  );
}
