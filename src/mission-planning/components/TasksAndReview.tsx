import type { Dispatch, ReactNode } from 'react';
import { CATALOG, catalogItem, MASS_GROUP_LABELS, type MassGroup } from '../data/equipment';
import { OBJECTIVES, TASKS, type TaskId } from '../data/science';
import {
  CARRIER_LABELS,
  costSummary,
  describeKnownMass,
  provenanceCounts,
  STATUS_LABELS,
  taskTiming,
  type TaskTiming,
} from '../loadout';
import { formatDuration, formatKm, formatLatitude, formatLongitude, locationName, MARS_MEAN_RADIUS_KM } from '../geo';
import {
  availableTasks,
  MARS_GRAVITY,
  equipmentSummary,
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
import { MODE_LABELS } from './RouteSection';
import RouteHazards from './RouteHazards';
import { InfoTip, Stat } from './ui';

interface Props {
  state: MissionState;
  dispatch: Dispatch<MissionAction>;
}

export function TasksSection({ state, dispatch }: Props) {
  const usable = availableTasks(state);
  const stops = routeStops(state);

  const anyAssigned = stops.some((s) => (state.tasks[s.key] ?? []).length > 0);
  if (usable.length === 0 && !anyAssigned) {
    return <p className="mp-hint">Add equipment first: tasks become available with the equipment that performs them.</p>;
  }
  return (
    <div className="mp-tasks">
      {usable.length === 0 && <p className="mp-hint">Add equipment first: tasks become available with the equipment that performs them.</p>}
      {stops.map((stop) => {
        const assigned = state.tasks[stop.key] ?? [];
        const stale = assigned.filter((t) => !usable.includes(t));
        // With no equipment at all, only stops that still hold (orphaned) tasks are listed
        if (usable.length === 0 && stale.length === 0) return null;
        return (
          <fieldset key={stop.key} className="mp-tasks__stop">
            <legend>
              {stop.label}
              {stop.location?.name ? ` · ${stop.location.name}` : ''}
            </legend>
            <div className="mp-chips">
              {[...usable, ...stale].map((task: TaskId) => {
                const on = assigned.includes(task);
                const timing = taskTiming(state.loadout, stop.key, task);
                return (
                  <label key={task} className={`mp-chip${on ? ' is-on' : ''}${stale.includes(task) ? ' is-stale' : ''}`}>
                    <input type="checkbox" checked={on} onChange={() => dispatch({ type: 'toggle-task', stop: stop.key, task })} />
                    {TASKS[task].name} <small>{taskMinutesLabel(timing)}</small>
                  </label>
                );
              })}
            </div>
            {assigned.map((task) => {
              const timing = taskTiming(state.loadout, stop.key, task);
              return timing.activities.length ? (
                <p key={task} className="mp-tasks__equip">
                  {TASKS[task].name}: {timing.activities.map((a) => `${a.item} ×${a.uses} use${a.uses > 1 ? 's' : ''}`).join(', ')}
                </p>
              ) : null;
            })}
            {stale.length > 0 && (
              <p className="mp-loc__error">
                Missing equipment: {stale.map((t) => `${TASKS[t].name} needs ${equipmentFor(t)}`).join('; ')}.
              </p>
            )}
          </fieldset>
        );
      })}
      <p className="mp-hint">
        A task with equipment assigned takes that equipment's time; otherwise its demo estimate. Assign equipment to tasks in the
        Equipment tab.
      </p>
    </div>
  );
}

/** Menu items that can perform a task, for "missing equipment" notes. */
function equipmentFor(task: TaskId): string {
  const names = CATALOG.filter((c) => c.tasks.includes(task)).map((c) => c.name);
  return names.length ? names.join(' or ') : 'suitable equipment';
}

function taskMinutesLabel(t: TaskTiming): string {
  if (t.minutes === null) return 'time unknown';
  return t.source === 'equipment' ? `${Math.round(t.minutes)} min · equipment` : `${t.minutes} min · estimate`;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mp-sheet">
      <h4 className="mp-sheet__title">{title}</h4>
      {children}
    </section>
  );
}

/** One chapter of the briefing: a heading and its sections. */
function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mp-group">
      <h3 className="mp-group__title">{title}</h3>
      <div className="mp-group__body">{children}</div>
    </section>
  );
}

interface ReviewProps {
  state: MissionState;
  metrics: RouteMetrics;
  duration: DurationSummary;
}

/** The Summary tab: the whole mission, in compact rows. */
export function ReviewSection({ state, metrics, duration }: ReviewProps) {
  const status = routeStatus(state);
  const mass = equipmentSummary(state);
  const cost = costSummary(state.loadout);
  const prov = provenanceCounts(state.loadout);
  const knownMass = describeKnownMass(mass.knownKg, mass.unknownItems.length);
  const missing = missingSuggestedEquipment(state);
  const hasRoute = metrics.segments.length > 0;
  const over = duration.marginHours < 0;
  const stops = routeStops(state);
  const assigned = Object.values(state.tasks).flat().length;
  const objectives = OBJECTIVES.filter((o) => state.objectives.includes(o.id));

  return (
    <div className="mp-review">
      <Group title="Route overview">
      <Section title="At a glance">
        <dl className="mp-stats">
          <Stat label="Route status">
            <span className={`mp-status mp-status--${status}`}>{ROUTE_STATUS_LABELS[status]}</span>
          </Stat>
          <Stat label="Estimated mission duration" emphasis>
            {hasRoute ? formatDuration(duration.totalHours) : '—'}
          </Stat>
          <Stat label="Distance">{hasRoute ? formatKm(metrics.totalKm) : '—'}</Stat>
          <Stat label="Carried equipment (excl. suit)">{knownMass}</Stat>
        </dl>
      </Section>

      <Section title="Stops">
        <ol className="mp-stoplist">
          {stops.map((s) => (
            <li key={s.key}>
              <span className="mp-stoplist__label">{s.label}</span>
              <span className="mp-stoplist__place">
                {s.location ? (
                  <>
                    {locationName(s.location.name)}
                    <span className="mp-num">
                      {formatLatitude(s.location.coordinate, 2)}, {formatLongitude(s.location.coordinate, 2)}
                    </span>
                  </>
                ) : (
                  'not set'
                )}
              </span>
              {(state.tasks[s.key] ?? []).length > 0 && (
                <span className="mp-stoplist__tasks">{(state.tasks[s.key] ?? []).map((t) => TASKS[t].name).join(', ')}</span>
              )}
            </li>
          ))}
        </ol>
      </Section>

      <Section title="Travel estimates">
        <dl className="mp-stats">
          <Stat label="Total distance">{hasRoute ? formatKm(metrics.totalKm) : '—'}</Stat>
          <Stat label="Travel time">{hasRoute ? formatDuration(duration.travelHours) : '—'}</Stat>
          <Stat label="Travel mode">
            {MODE_LABELS[state.travelMode]} · {state.speedKmh[state.travelMode]} km/h
          </Stat>
          {metrics.segments.map((s) => (
            <Stat key={`${s.from.key}-${s.to.key}`} label={`${s.from.label} → ${s.to.label}`}>
              {formatKm(s.km)} · {formatDuration(s.hours)}
            </Stat>
          ))}
        </dl>
        <p className="mp-hint">
          Direct surface distance: great-circle (Haversine) between consecutive stops, R = {MARS_MEAN_RADIUS_KM} km. Not along the
          terrain.
        </p>
      </Section>
      </Group>

      <Group title="Mission preparation">
      <Section title="Crew">
        <dl className="mp-stats">
          <Stat label="Crew">{state.crew === 1 ? 'One astronaut' : 'Two astronauts'}</Stat>
          <Stat
            label={
              <>
                Spacesuit
                <InfoTip label="About the suit profile">{SUIT_PROFILES[state.suit].note}</InfoTip>
              </>
            }
          >
            {SUIT_PROFILES[state.suit].name}
          </Stat>
        </dl>
      </Section>

      <Section title="Scientific objectives">
        {objectives.length ? (
          <ul className="mp-plainlist">
            {objectives.map((o) => (
              <li key={o.id}>{o.name}</li>
            ))}
          </ul>
        ) : (
          <p className="mp-hint">None selected</p>
        )}
      </Section>

      <Section title="Equipment and payload">
        {state.loadout.length ? (
          <ul className="mp-plainlist mp-review__items">
            {state.loadout.map((i) => (
              <li key={i.uid}>
                <span>
                  {i.name} ×{i.fields.quantity.value ?? 1}
                  {i.inSuit ? ' · in suit' : ''}
                </span>
                <span className="mp-num">
                  {i.fields.unitMassKg.value === null ? 'mass unknown' : `${(i.fields.unitMassKg.value * (i.fields.quantity.value ?? 1)).toFixed(1)} kg`}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mp-hint">No equipment selected</p>
        )}
        <dl className="mp-stats">
          <Stat label="Carried equipment" emphasis>
            {knownMass}
          </Stat>
          {mass.carriers.map((c) => (
            <Stat key={c} label={CARRIER_LABELS[c]}>
              {(mass.byCarrier[c] ?? 0).toFixed(1)} kg
            </Stat>
          ))}
          {mass.unallocatedUnits > 0 && <Stat label="Not assigned to a carrier">{mass.unallocatedUnits} unit(s)</Stat>}
        </dl>
        <details className="mp-more">
          <summary>Mass breakdown, values and cost</summary>
        <dl className="mp-stats">
          {(Object.keys(MASS_GROUP_LABELS) as MassGroup[]).map((g) => (
            <Stat key={g} label={MASS_GROUP_LABELS[g]}>
              {mass.byGroup[g].toFixed(1)} kg
            </Stat>
          ))}
          {mass.inSuitItems.length > 0 && <Stat label="Counted with the suit">{mass.inSuitKg.toFixed(1)} kg</Stat>}
          <Stat label="Spacesuit">{mass.suitKg !== null ? `${mass.suitKg.toFixed(1)} kg (your assumption)` : 'No verified value'}</Stat>
          <Stat label="Sample mass">Not estimated</Stat>
          <Stat label="Weight on Mars">{(mass.knownKg * MARS_GRAVITY).toFixed(0)} N (known mass)</Stat>
        </dl>
        <dl className="mp-stats">
          <Stat label="Values">
            {(Object.keys(prov) as (keyof typeof prov)[])
              .filter((k) => prov[k] > 0)
              .map((k) => `${prov[k]} ${STATUS_LABELS[k].replace(' — editable', '').toLowerCase()}`)
              .join(' · ') || '—'}
          </Stat>
          <Stat label="Cost">
            {Object.entries(cost.byCurrency)
              .map(([code, v]) => `${v.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${code}`)
              .join(' + ') || 'Not provided'}
          </Stat>
        </dl>
        {(cost.noCurrency.length > 0 || (cost.notProvided > 0 && Object.keys(cost.byCurrency).length > 0)) && (
          <p className="mp-hint">
            {cost.noCurrency.length > 0 && `Not summed (no currency): ${cost.noCurrency.join(', ')}. `}
            {cost.notProvided > 0 && `${cost.notProvided} item(s) have no cost provided.`}
          </p>
        )}
        </details>
      </Section>
      </Group>

      <Group title="Mission activities">
      <Section title="Checkpoint tasks">
        <dl className="mp-stats">
          <Stat label="Scheduled">{assigned}</Stat>
          <Stat label="Task time">
            {formatDuration(duration.taskHours)}
            {duration.unknownTasks ? ` + ${duration.unknownTasks} unknown` : ''}
          </Stat>
        </dl>
        {duration.timings.length > 0 && (
          <ul className="mp-plainlist mp-review__items">
            {duration.timings.map((t) => (
              <li key={`${t.stop}-${t.task}`}>
                <span>
                  {stops.find((s) => s.key === t.stop)?.label} · {TASKS[t.task].name}
                  {t.activities.length > 0 && <small> — {t.activities.map((a) => `${a.item} ×${a.uses}${a.attended ? '' : ' (unattended)'}`).join(', ')}</small>}
                </span>
                <span className="mp-num">{taskMinutesLabel(t)}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Time budget">
        <dl className="mp-stats">
          <Stat label="Travel">{hasRoute ? formatDuration(duration.travelHours) : '—'}</Stat>
          <Stat label="Tasks">{formatDuration(duration.taskHours)}</Stat>
          <Stat label="Estimated total" emphasis>
            {hasRoute ? formatDuration(duration.totalHours) : '—'}
          </Stat>
          <Stat label="Available">{formatDuration(duration.availableHours)}</Stat>
        </dl>
        {hasRoute && (
          <p className={`mp-budget${over ? ' is-over' : ''}`} role="status">
            {over
              ? `The plan exceeds the available time by ${formatDuration(-duration.marginHours)}.`
              : `The plan fits the available time with ${formatDuration(duration.marginHours)} to spare.`}
          </p>
        )}
      </Section>
      </Group>

      <Group title="Terrain assessment">
      <RouteHazards />
      <Section title="Warnings and limitations">
        <ul className="mp-warnings">
          {missing.length > 0 && (
            <li className="is-alert">Suggested for your objectives but not in the loadout: {missing.map((id) => catalogItem(id)?.name ?? id).join(', ')}.</li>
          )}
          {duration.tasksWithoutEquipment.length > 0 && (
            <li className="is-alert">{duration.tasksWithoutEquipment.length} scheduled task(s) are missing equipment.</li>
          )}
          <li>
            A simulated plan built from straight-line distances and stated assumptions. It is a time and mass budget only, not a safety
            or traversability assessment: terrain, slopes and hazards are not yet included.
          </li>
          {mass.unknownItems.length > 0 && <li className="is-alert">Unknown mass: {mass.unknownItems.join(', ')}.</li>}
          {duration.unknownTasks > 0 && <li className="is-alert">{duration.unknownTasks} task(s) have an unknown equipment time and are not in the total.</li>}
          {mass.unallocatedUnits > 0 && <li className="is-alert">{mass.unallocatedUnits} equipment unit(s) are not assigned to a carrier.</li>}
          {mass.invalidCarrierItems.length > 0 && (
            <li className="is-alert">Assigned to a carrier not in this mission: {mass.invalidCarrierItems.join(', ')}.</li>
          )}
          <li>Speeds, equipment masses and task times are demo estimates or your own values, not NASA specifications.</li>
        </ul>
      </Section>
      </Group>
    </div>
  );
}
