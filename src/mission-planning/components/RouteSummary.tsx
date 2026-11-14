import type { ReactNode } from 'react';
import { formatDuration, formatKm, formatLatitude, formatLongitude, locationName, MARS_MEAN_RADIUS_KM } from '../geo';
import { ROUTE_STATUS_LABELS, routeStatus, type MissionState, type PlannedLocation, type RouteMetrics } from '../model';
import ResetRouteButton from './ResetRouteButton';
import { hasAnyStop, MODE_LABELS } from './RouteSection';

interface Props {
  state: MissionState;
  metrics: RouteMetrics;
  /** The planner panel is open beside the map (desktop): leave room for it. */
  besidePanel: boolean;
  expanded: boolean;
  onToggle: () => void;
  onReset: () => void;
  onKeep: () => void;
  /** The route preview controls, shown first in the summary. */
  exploration?: ReactNode;
  explorationPlaying?: boolean;
  onPauseExploration?: () => void;
}

function Place({ symbol, role, location }: { symbol: string; role: string; location: PlannedLocation | null }) {
  return (
    <div className={`mp-sum__place mp-sum__place--${role.toLowerCase()}`}>
      <span className="mp-sum__pin" aria-hidden="true">
        {symbol}
      </span>
      <div>
        <p className="mp-sum__label">{role}</p>
        {location ? (
          <>
            <p className="mp-sum__name">{locationName(location.name)}</p>
            <p className="mp-data">
              {formatLatitude(location.coordinate)}, {formatLongitude(location.coordinate)}
            </p>
          </>
        ) : (
          <p className="mp-sum__empty">Not set</p>
        )}
      </div>
    </div>
  );
}

/** The route results, docked along the bottom of the map and always in view. */
export default function RouteSummary({
  state,
  metrics,
  besidePanel,
  expanded,
  onToggle,
  onReset,
  onKeep,
  exploration,
  explorationPlaying,
  onPauseExploration,
}: Props) {
  const status = routeStatus(state);
  const hasRoute = metrics.segments.length > 0;
  const scienceStops = Object.entries(state.tasks).filter(
    ([stop, tasks]) => tasks.length > 0 && (stop === 'start' || stop === 'destination' || state.checkpoints.some((c) => c.id === stop)),
  ).length;

  return (
    <section
      className={`mp-sum${besidePanel ? ' is-beside-panel' : ''}${expanded ? ' is-expanded' : ''}`}
      aria-label="Route summary"
    >
      <header className="mp-sum__header">
        <h2>Route summary</h2>
        <span className={`mp-status mp-status--${status}`}>{ROUTE_STATUS_LABELS[status]}</span>
        <p className="mp-sum__headline mp-data" aria-live="polite">
          {hasRoute ? `${formatKm(metrics.totalKm)} · ${formatDuration(metrics.travelHours)}` : '—'}
        </p>
        {hasAnyStop(state) && <ResetRouteButton onReset={onReset} onKeep={onKeep} label="New route" className="mp-sum__reset" />}
        {!expanded && explorationPlaying && (
          <button type="button" className="mp-btn mp-btn--small" onClick={onPauseExploration}>
            Pause preview
          </button>
        )}
        <button
          type="button"
          className="mp-btn mp-btn--icon"
          onClick={onToggle}
          aria-expanded={expanded}
          aria-label={expanded ? 'Collapse route summary' : 'Expand route summary'}
        >
          {expanded ? '▾' : '▴'}
        </button>
      </header>

      {expanded && (
        <div className="mp-sum__body">
          {exploration}
          <div className="mp-sum__grid">
            <Place symbol="S" role="Start" location={state.start} />
            <Place symbol="D" role="Destination" location={state.destination} />
            <dl className="mp-sum__figures">
              <div>
                <dt>Total distance</dt>
                <dd className="mp-data">{hasRoute ? formatKm(metrics.totalKm) : '—'}</dd>
              </div>
              <div>
                <dt>Estimated travel time</dt>
                <dd className="mp-data">{hasRoute ? formatDuration(metrics.travelHours) : '—'}</dd>
              </div>
              <div>
                <dt>Waypoints</dt>
                <dd className="mp-data">{state.checkpoints.length}</dd>
              </div>
              <div>
                <dt>Science stops</dt>
                <dd className="mp-data">{scienceStops}</dd>
              </div>
            </dl>
          </div>

          <p className="mp-sum__assumptions">
            <strong>Direct surface-distance estimate</strong>: great-circle (Haversine) distance between consecutive stops
            on a sphere of R = {MARS_MEAN_RADIUS_KM} km. It does not follow the terrain, and the line on the map only
            connects the stops. Time = distance ÷ assumed {MODE_LABELS[state.travelMode].toLowerCase()} speed of{' '}
            {state.speedKmh[state.travelMode]} km/h, with no terrain or hazard adjustment. Not a safety or traversability
            assessment.
          </p>

          {metrics.segments.length > 1 && (
            <details className="mp-sum__segments">
              <summary>{metrics.segments.length} segments</summary>
              <table className="mp-table">
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
              </table>
            </details>
          )}
        </div>
      )}
    </section>
  );
}
