import { useEffect, useRef, type Dispatch, type ReactNode } from 'react';
import { formatDuration } from '../geo';
import {
  DEFAULT_SPEED_KMH,
  equipmentSummary,
  ROUTE_STATUS_LABELS,
  routeStatus,
  type DurationSummary,
  type MissionAction,
  type MissionState,
  type StopKey,
  type TravelMode,
} from '../model';
import LocationField from './LocationField';
import { MissionConfigSection, ObjectivesSection } from './MissionConfigSection';
import ResetRouteButton from './ResetRouteButton';
import { TasksSection } from './TasksAndReview';
import { Chevron, Disclosure, InfoTip } from './ui';

/** Which row of the Route tab is open: a stop key, a setting, or none. */
export type RouteRow = StopKey | 'travel' | 'config' | 'objectives' | 'tasks' | null;

interface Props {
  state: MissionState;
  dispatch: Dispatch<MissionAction>;
  duration: DurationSummary;
  picking: StopKey | null;
  onPick: (stop: StopKey) => void;
  onCalculate: () => void;
  onReset: () => void;
  onKeep: () => void;
  onOpenEquipment: () => void;
  openRow: RouteRow;
  setOpenRow: (row: RouteRow) => void;
  /** Save Route controls, shown with the route actions. */
  saveControls?: ReactNode;
}

/** True once any stop has been set, i.e. there is a route to clear. */
export function hasAnyStop(state: MissionState): boolean {
  return !!(state.start || state.destination || state.checkpoints.length);
}

export const MODE_LABELS: Record<TravelMode, string> = { walking: 'Walking', rover: 'Rover-assisted' };

/** The Route tab: stops, travel, mission settings and the calculation. Results show below the map. */
export default function RouteSection({
  state,
  dispatch,
  duration,
  picking,
  onPick,
  onCalculate,
  onReset,
  onKeep,
  onOpenEquipment,
  openRow,
  setOpenRow,
  saveControls,
}: Props) {
  const status = routeStatus(state);
  const mode = state.travelMode;
  const mass = equipmentSummary(state);
  /** Opens a row (closing any other), or closes it if it is the open one. */
  const toggle = (row: Exclude<RouteRow, null>) => (open?: boolean) => {
    if (open ?? openRow !== row) setOpenRow(row);
    else if (openRow === row) setOpenRow(null);
  };
  const tasksAssigned = Object.values(state.tasks).flat().length;

  // A newly added waypoint opens straight away, ready to be set
  const waypointCount = useRef(state.checkpoints.length);
  useEffect(() => {
    if (state.checkpoints.length > waypointCount.current) setOpenRow(state.checkpoints[state.checkpoints.length - 1].id);
    waypointCount.current = state.checkpoints.length;
    // only when the number of waypoints changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.checkpoints.length]);

  return (
    <div className="mp-route">
      {/* Listed in travel order, so the rail reads start → waypoints → destination */}
      <div className="mp-stops">
        <LocationField
          label="Starting point"
          placeholder="Choose your starting point"
          accent="start"
          symbol="S"
          location={state.start}
          onChange={(location) => dispatch({ type: 'set-start', location })}
          picking={picking === 'start'}
          onPick={() => onPick('start')}
          open={openRow === 'start'}
          onToggle={toggle('start')}
        />
        {state.checkpoints.map((c, i) => (
          <LocationField
            key={c.id}
            label={`Waypoint ${i + 1}`}
            placeholder="Choose this stop"
            accent="checkpoint"
            symbol={String(i + 1)}
            location={c.location}
            onChange={(location) => dispatch({ type: 'set-checkpoint', id: c.id, location })}
            picking={picking === c.id}
            onPick={() => onPick(c.id)}
            onRemove={() => dispatch({ type: 'remove-checkpoint', id: c.id })}
            onMove={(by) => dispatch({ type: 'move-checkpoint', id: c.id, by })}
            open={openRow === c.id}
            onToggle={toggle(c.id)}
          />
        ))}
        <button type="button" className="mp-add" onClick={() => dispatch({ type: 'add-checkpoint' })}>
          <span className="mp-add__node" aria-hidden="true">
            <svg viewBox="0 0 16 16">
              <path d="M8 4v8M4 8h8" />
            </svg>
          </span>
          Add a stop along the way
        </button>
        <LocationField
          label="Destination"
          placeholder="Choose your destination"
          accent="destination"
          symbol="D"
          location={state.destination}
          onChange={(location) => dispatch({ type: 'set-destination', location })}
          picking={picking === 'destination'}
          onPick={() => onPick('destination')}
          open={openRow === 'destination'}
          onToggle={toggle('destination')}
        />
        {state.checkpoints.length > 0 && <p className="mp-hint">Waypoints are visited in order, between the starting point and the destination.</p>}
      </div>

      <div className="mp-rows">
        <Disclosure label="Travel mode" value={MODE_LABELS[mode]} open={openRow === 'travel'} onToggle={() => toggle('travel')()}>
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
          <label className="mp-field mp-field--inline">
            <span>
              Assumed speed
              <InfoTip label="About the speed">
                Planning assumption (default {DEFAULT_SPEED_KMH[mode]} km/h), not a validated EVA or rover rate.
              </InfoTip>
            </span>
            <span className="mp-unit-input">
              <input
                type="number"
                min={0.1}
                step={0.1}
                aria-label={`Assumed ${MODE_LABELS[mode].toLowerCase()} speed in km/h`}
                value={state.speedKmh[mode]}
                onChange={(e) => dispatch({ type: 'set-speed', mode, kmh: Math.max(0, Number(e.target.value) || 0) })}
              />
              km/h
            </span>
          </label>
        </Disclosure>

        <Disclosure
          label="Mission configuration"
          value={`${state.crew} astronaut${state.crew > 1 ? 's' : ''} · ${state.availableHours} h`}
          open={openRow === 'config'}
          onToggle={() => toggle('config')()}
        >
          <MissionConfigSection state={state} dispatch={dispatch} />
        </Disclosure>

        <Disclosure
          label="Scientific objectives"
          value={state.objectives.length ? `${state.objectives.length} selected` : 'Choose'}
          open={openRow === 'objectives'}
          onToggle={() => toggle('objectives')()}
        >
          <ObjectivesSection state={state} dispatch={dispatch} />
        </Disclosure>

        <Disclosure
          label="Checkpoint tasks"
          value={tasksAssigned ? `${tasksAssigned} · ${formatDuration(duration.taskHours)}` : 'Assign'}
          open={openRow === 'tasks'}
          onToggle={() => toggle('tasks')()}
        >
          <TasksSection state={state} dispatch={dispatch} />
        </Disclosure>

        <div className="mp-row">
          <button type="button" className="mp-row__head" onClick={onOpenEquipment}>
            <span className="mp-row__label">Scientific equipment</span>
            <span className="mp-row__value">
              {state.loadout.length
                ? `${state.loadout.length} · ${mass.knownKg.toFixed(1)} kg${mass.unknownItems.length ? ` + ${mass.unknownItems.length} unknown` : ''}`
                : 'Configure'}
            </span>
            <Chevron open={false} />
          </button>
        </div>
      </div>

      <div className="mp-cta">
        <button type="button" className="mp-btn mp-btn--primary" onClick={onCalculate} disabled={status === 'incomplete'}>
          {status === 'changed' ? 'Recalculate Route' : 'Calculate Route'}
        </button>
        <div className="mp-cta__meta">
          <p className={`mp-status mp-status--${status}`} role="status">
            {ROUTE_STATUS_LABELS[status]}
          </p>
          <ResetRouteButton onReset={onReset} onKeep={onKeep} disabled={!hasAnyStop(state)} className="mp-link" />
        </div>
        {saveControls}
      </div>
    </div>
  );
}
