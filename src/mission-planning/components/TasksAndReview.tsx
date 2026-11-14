import type { Dispatch } from 'react';
import { equipmentById, equipmentForTask, OBJECTIVES, TASKS, type TaskId } from '../data/science';
import { formatCoordinate, formatDuration, formatKm } from '../geo';
import {
  availableTasks,
  massBreakdown,
  missingSuggestedEquipment,
  ROUTE_STATUS_LABELS,
  routeStatus,
  routeStops,
  SUIT_PROFILES,
  type DurationSummary,
  type MissionAction,
  type MissionState,
  type RouteMetrics,
} from '../model';

interface Props {
  state: MissionState;
  dispatch: Dispatch<MissionAction>;
}

export function TasksSection({ state, dispatch }: Props) {
  const usable = availableTasks(state);
  const stops = routeStops(state);

  if (usable.length === 0) {
    return <p className="mp-note">Select scientific equipment first: tasks become available with the equipment that performs them.</p>;
  }
  return (
    <div className="mp-tasks">
      {stops.map((stop) => {
        const assigned = state.tasks[stop.key] ?? [];
        const stale = assigned.filter((t) => !usable.includes(t));
        return (
          <fieldset key={stop.key} className="mp-tasks__stop">
            <legend>
              {stop.label}
              {stop.location?.name ? ` · ${stop.location.name}` : ''}
            </legend>
            <div className="mp-chips">
              {[...usable, ...stale].map((task: TaskId) => (
                <label key={task} className={`mp-chip${assigned.includes(task) ? ' is-on' : ''}${stale.includes(task) ? ' is-stale' : ''}`}>
                  <input
                    type="checkbox"
                    checked={assigned.includes(task)}
                    onChange={() => dispatch({ type: 'toggle-task', stop: stop.key, task })}
                  />
                  {TASKS[task].name} <small>{TASKS[task].assumedMinutes} min</small>
                </label>
              ))}
            </div>
            {stale.length > 0 && (
              <p className="mp-loc__error">
                Needs equipment no longer in the loadout: {stale.map((t) => equipmentForTask(t).map((e) => e.name).join(' or ')).join('; ')}
              </p>
            )}
          </fieldset>
        );
      })}
      <p className="mp-note">Task times are assumed per task at one stop and added in sequence.</p>
    </div>
  );
}

interface ReviewProps {
  state: MissionState;
  metrics: RouteMetrics;
  duration: DurationSummary;
}

export function ReviewSection({ state, metrics, duration }: ReviewProps) {
  const status = routeStatus(state);
  const mass = massBreakdown(state);
  const missing = missingSuggestedEquipment(state);
  const over = duration.marginHours < 0;

  return (
    <div className="mp-review">
      <dl className="mp-facts">
        <div>
          <dt>Route</dt>
          <dd className={`mp-status mp-status--${status}`}>{ROUTE_STATUS_LABELS[status]}</dd>
        </div>
        <div>
          <dt>Stops</dt>
          <dd>
            <ol className="mp-review__stops">
              {routeStops(state).map((s) => (
                <li key={s.key}>
                  <span>{s.label}</span>
                  <span className="mp-data">{s.location ? formatCoordinate(s.location.coordinate, 2) : 'not set'}</span>
                  {(state.tasks[s.key] ?? []).length > 0 && (
                    <small>{(state.tasks[s.key] ?? []).map((t) => TASKS[t].name).join(', ')}</small>
                  )}
                </li>
              ))}
            </ol>
          </dd>
        </div>
        <div>
          <dt>Crew and suit</dt>
          <dd>
            {state.crew === 1 ? 'One astronaut' : 'Two astronauts'} · {SUIT_PROFILES[state.suit].name}
          </dd>
        </div>
        <div>
          <dt>Objectives</dt>
          <dd>{state.objectives.length ? OBJECTIVES.filter((o) => state.objectives.includes(o.id)).map((o) => o.name).join(', ') : 'None selected'}</dd>
        </div>
        <div>
          <dt>Distance</dt>
          <dd className="mp-data">{metrics.segments.length ? formatKm(metrics.totalKm) : '—'}</dd>
        </div>
        <div>
          <dt>Travel time</dt>
          <dd className="mp-data">{metrics.segments.length ? formatDuration(duration.travelHours) : '—'}</dd>
        </div>
        <div>
          <dt>Task time</dt>
          <dd className="mp-data">{formatDuration(duration.taskHours)}</dd>
        </div>
        <div>
          <dt>Estimated mission duration</dt>
          <dd className="mp-data">{metrics.segments.length ? formatDuration(duration.totalHours) : '—'}</dd>
        </div>
        <div>
          <dt>Available time</dt>
          <dd className="mp-data">{formatDuration(duration.availableHours)}</dd>
        </div>
        <div>
          <dt>Carried mass (excl. suit)</dt>
          <dd className="mp-data">
            {mass.carriedKg.toFixed(1)} kg · {mass.perAstronautKg.toFixed(1)} kg per astronaut
          </dd>
        </div>
      </dl>

      {metrics.segments.length > 0 && (
        <p className={`mp-budget${over ? ' is-over' : ''}`} role="status">
          {over
            ? `The plan exceeds the available time by ${formatDuration(-duration.marginHours)}.`
            : `The plan fits the available time with ${formatDuration(duration.marginHours)} to spare.`}
        </p>
      )}
      {missing.length > 0 && (
        <p className="mp-loc__error">Suggested for your objectives but not in the loadout: {missing.map((id) => equipmentById(id)?.name).join(', ')}.</p>
      )}
      {duration.tasksWithoutEquipment.length > 0 && (
        <p className="mp-loc__error">{duration.tasksWithoutEquipment.length} assigned task(s) need equipment that is not selected.</p>
      )}

      <p className="mp-note mp-note--strong">
        A simulated plan built from straight-line distances and stated assumptions. It is a time and mass budget only, not
        a safety or traversability assessment: terrain, slopes and hazards are not yet included.
      </p>
    </div>
  );
}
