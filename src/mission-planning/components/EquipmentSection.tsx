import { useMemo, useState, type Dispatch, type FormEvent } from 'react';
import { CATALOG, CATEGORY_LABELS, MASS_GROUP_LABELS, MENU_GROUPS, type EquipCategory, type MassGroup } from '../data/equipment';
import { TASK_IDS, TASKS, type TaskId } from '../data/science';
import { formatDuration } from '../geo';
import {
  activityMinutes,
  allocatedUnits,
  CARRIER_LABELS,
  costSummary,
  describeKnownMass,
  FIELD_LABELS,
  newId,
  parseFieldInput,
  quantity,
  STATUS_LABELS,
  type Carrier,
  type LoadoutItem,
  type NumKey,
  type Valued,
} from '../loadout';
import { equipmentSummary, MARS_GRAVITY, routeStops, type DurationSummary, type ItemPatch, type MissionAction, type MissionState } from '../model';
import { InfoTip, Stat } from './ui';
import ValueField from './ValueField';

interface Props {
  state: MissionState;
  dispatch: Dispatch<MissionAction>;
  duration: DurationSummary;
}

type View = 'loadout' | 'menu' | 'custom';

const kg = (v: number) => `${v.toFixed(1)} kg`;
const SHORT_CARRIER: Record<Carrier, string> = { 'astronaut-1': 'A1', 'astronaut-2': 'A2', rover: 'Rover' };
const TIME_KEYS: NumKey[] = ['setupMin', 'operatingMin', 'packingMin'];

function totalMass(item: LoadoutItem): number | null {
  const unit = item.fields.unitMassKg.value;
  return unit === null ? null : unit * quantity(item);
}

function carrierText(item: LoadoutItem): string {
  const parts = (Object.entries(item.allocation) as [Carrier, number][])
    .filter(([, n]) => n > 0)
    .map(([c, n]) => (quantity(item) > 1 ? `${SHORT_CARRIER[c]} ×${n}` : SHORT_CARRIER[c]));
  if (item.inSuit) return 'Suit';
  return parts.length ? parts.join(', ') : '—';
}

/* ------------------------------------------------------------------- menu */

function EquipmentMenu({ state, dispatch }: { state: MissionState; dispatch: Dispatch<MissionAction> }) {
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const matches = (name: string, purpose: string, group: string) =>
    !q || name.toLowerCase().includes(q) || purpose.toLowerCase().includes(q) || group.toLowerCase().includes(q);
  const custom = state.loadout.filter((i) => i.catalogId === null);
  let shown = 0;

  return (
    <div className="mp-menu">
      <input
        type="search"
        className="mp-menu__search"
        placeholder="Search equipment"
        aria-label="Search equipment"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {MENU_GROUPS.map((g) => {
        if (g.id === 'custom') {
          const items = custom.filter((i) => matches(i.name, i.purpose, g.label));
          if (q && !items.length) return null;
          shown += items.length || 1;
          return (
            <section key={g.id} className="mp-menu__group" aria-label={g.label}>
              <h4 className="mp-eyebrow">{g.label}</h4>
              {items.length ? (
                <ul>
                  {items.map((i) => (
                    <li key={i.uid} className="mp-menu__item">
                      <div>
                        <strong>{i.name}</strong>
                        <p>{i.purpose || 'No purpose given'}</p>
                      </div>
                      <span className="mp-menu__added">In loadout</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mp-hint">Equipment you define appears here.</p>
              )}
            </section>
          );
        }
        const items = CATALOG.filter((c) => c.category === g.id && matches(c.name, c.purpose, g.label));
        if (!items.length) return null;
        shown += items.length;
        return (
          <section key={g.id} className="mp-menu__group" aria-label={g.label}>
            <h4 className="mp-eyebrow">{g.label}</h4>
            <ul>
              {items.map((c) => {
                const count = state.loadout.filter((i) => i.catalogId === c.id).length;
                return (
                  <li key={c.id} className="mp-menu__item">
                    <div>
                      <strong>{c.name}</strong>
                      <p>{c.purpose}</p>
                    </div>
                    <button
                      type="button"
                      className="mp-btn mp-btn--small"
                      aria-label={`Add ${c.name} to loadout`}
                      onClick={() => {
                        dispatch({ type: 'add-catalog-item', catalogId: c.id });
                      }}
                    >
                      {count ? `Add another (${count})` : 'Add to Loadout'}
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
      {shown === 0 && <p className="mp-hint">No equipment matches “{query}”.</p>}
    </div>
  );
}

/* ----------------------------------------------------------- custom form */

type CustomText = Record<NumKey, string>;
const BLANK_TEXT: CustomText = { unitMassKg: '', quantity: '1', setupMin: '', operatingMin: '', packingMin: '', unitCost: '' };

function CustomForm({ state, dispatch, onDone }: { state: MissionState; dispatch: Dispatch<MissionAction>; onDone: (uid: string) => void }) {
  const carriers = equipmentSummary(state).carriers;
  const [name, setName] = useState('');
  const [category, setCategory] = useState<EquipCategory>('geological');
  const [purpose, setPurpose] = useState('');
  const [text, setText] = useState<CustomText>(BLANK_TEXT);
  const [carrier, setCarrier] = useState<Carrier | ''>(carriers[0] ?? '');
  const [tasks, setTasks] = useState<TaskId[]>([]);
  const [currency, setCurrency] = useState('');
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState<Partial<Record<NumKey | 'name', string>>>({});

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const errs: typeof errors = {};
    if (!name.trim()) errs.name = 'Give the equipment a name.';
    const fields = {} as Record<NumKey, Valued>;
    (Object.keys(BLANK_TEXT) as NumKey[]).forEach((k) => {
      const r = parseFieldInput(k, text[k]);
      if ('error' in r) errs[k] = r.error;
      else fields[k] = r.value === null ? { value: null, status: 'unknown' } : { value: r.value, status: 'user' };
    });
    setErrors(errs);
    if (Object.keys(errs).length) return;
    const uid = newId('eq');
    const item: LoadoutItem = {
      uid,
      catalogId: null,
      name: name.trim(),
      category,
      purpose: purpose.trim(),
      tasks,
      fields,
      currency: currency.trim().toUpperCase(),
      timingMode: 'per-task',
      allocation: carrier ? { [carrier]: fields.quantity.value ?? 1 } : {},
      attended: true,
      includesBatteries: false,
      inSuit: false,
      notes: notes.trim(),
      assignments: [],
    };
    dispatch({ type: 'add-custom-item', item });
    onDone(uid);
  };

  const num = (k: NumKey, suffix?: string) => (
    <label className="mp-vf">
      <span>{FIELD_LABELS[k]}</span>
      <span className="mp-unit-input">
        <input
          inputMode={k === 'quantity' ? 'numeric' : 'decimal'}
          value={text[k]}
          placeholder={k === 'unitCost' ? 'not provided' : 'unknown'}
          aria-invalid={!!errors[k]}
          onChange={(e) => setText({ ...text, [k]: e.target.value })}
        />
        {suffix}
      </span>
      {errors[k] && <span className="mp-vf__status is-error">{errors[k]}</span>}
    </label>
  );

  return (
    <form className="mp-custom" onSubmit={submit} noValidate>
      <p className="mp-hint">Every value you enter is marked “User supplied”. Leave a value blank if it is unknown.</p>
      <label className="mp-field">
        <span>Name</span>
        <input type="text" value={name} aria-invalid={!!errors.name} onChange={(e) => setName(e.target.value)} />
        {errors.name && <span className="mp-vf__status is-error">{errors.name}</span>}
      </label>
      <label className="mp-field">
        <span>Category</span>
        <select value={category} onChange={(e) => setCategory(e.target.value as EquipCategory)}>
          {(Object.keys(CATEGORY_LABELS) as EquipCategory[]).map((c) => (
            <option key={c} value={c}>
              {CATEGORY_LABELS[c]}
            </option>
          ))}
        </select>
      </label>
      <label className="mp-field">
        <span>Purpose</span>
        <input type="text" value={purpose} onChange={(e) => setPurpose(e.target.value)} />
      </label>
      <div className="mp-vgrid">
        {num('unitMassKg', 'kg')}
        {num('quantity')}
        {num('setupMin', 'min')}
        {num('operatingMin', 'min')}
        {num('packingMin', 'min')}
        {num('unitCost')}
        <label className="mp-vf">
          <span>Currency</span>
          <input type="text" maxLength={8} placeholder="e.g. USD" value={currency} onChange={(e) => setCurrency(e.target.value)} />
        </label>
        <label className="mp-vf">
          <span>Carrier</span>
          <select value={carrier} onChange={(e) => setCarrier(e.target.value as Carrier | '')}>
            <option value="">Not assigned</option>
            {carriers.map((c) => (
              <option key={c} value={c}>
                {CARRIER_LABELS[c]}
              </option>
            ))}
          </select>
        </label>
      </div>
      <fieldset className="mp-custom__tasks">
        <legend>Checkpoint tasks it can perform</legend>
        <div className="mp-chips">
          {TASK_IDS.map((t) => (
            <label key={t} className={`mp-chip${tasks.includes(t) ? ' is-on' : ''}`}>
              <input
                type="checkbox"
                checked={tasks.includes(t)}
                onChange={() => setTasks(tasks.includes(t) ? tasks.filter((x) => x !== t) : [...tasks, t])}
              />
              {TASKS[t].name}
            </label>
          ))}
        </div>
        <p className="mp-hint">After adding, open the item to assign it to tasks at specific checkpoints.</p>
      </fieldset>
      <label className="mp-field">
        <span>Source / notes</span>
        <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </label>
      <div className="mp-custom__actions">
        <button type="submit" className="mp-btn mp-btn--accent">
          Add Custom Equipment
        </button>
      </div>
    </form>
  );
}

/* ----------------------------------------------------------- item editor */

function ItemEditor({ item, state, dispatch }: { item: LoadoutItem; state: MissionState; dispatch: Dispatch<MissionAction> }) {
  const summary = equipmentSummary(state);
  const stops = routeStops(state);
  const qty = quantity(item);
  const allocated = allocatedUnits(item);
  const shownCarriers = [
    ...summary.carriers,
    ...(Object.keys(item.allocation) as Carrier[]).filter((c) => !summary.carriers.includes(c)),
  ];
  const [stop, setStop] = useState(stops[0]?.key ?? '');
  const [task, setTask] = useState<TaskId | ''>(item.tasks[0] ?? '');
  const [uses, setUses] = useState('1');
  const usesValid = /^\d+$/.test(uses.trim()) && Number(uses) >= 1;
  const patch = (p: ItemPatch) => dispatch({ type: 'patch-item', uid: item.uid, patch: p });
  const field = (k: NumKey) => (v: Valued) => dispatch({ type: 'set-item-field', uid: item.uid, key: k, value: v });
  const stopLabel = (key: string) => stops.find((s) => s.key === key)?.label ?? 'Removed stop';
  const isDefault = item.catalogId !== null;

  return (
    <div className="mp-editor">
      <p className="mp-editor__purpose">
        {item.purpose || 'No purpose given.'}
        <span className="mp-editor__cat"> · {CATEGORY_LABELS[item.category]}</span>
      </p>

      {item.catalogId === null && (
        <label className="mp-field">
          <span>Category</span>
          <select value={item.category} onChange={(e) => patch({ category: e.target.value as EquipCategory })}>
            {(Object.keys(CATEGORY_LABELS) as EquipCategory[]).map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABELS[c]}
              </option>
            ))}
          </select>
        </label>
      )}

      <h5 className="mp-editor__h">Values</h5>
      <div className="mp-vgrid">
        <ValueField fieldKey="unitMassKg" value={item.fields.unitMassKg} onChange={field('unitMassKg')} suffix="kg" />
        <ValueField fieldKey="quantity" value={item.fields.quantity} onChange={field('quantity')} />
        {TIME_KEYS.map((k) => (
          <ValueField key={k} fieldKey={k} value={item.fields[k]} onChange={field(k)} suffix="min" />
        ))}
        <ValueField fieldKey="unitCost" value={item.fields.unitCost} onChange={field('unitCost')} />
        <label className="mp-vf">
          <span>Currency</span>
          <input
            type="text"
            maxLength={8}
            placeholder="e.g. USD"
            value={item.currency}
            onChange={(e) => patch({ currency: e.target.value.toUpperCase() })}
          />
        </label>
      </div>

      <h5 className="mp-editor__h">
        Timing
        <InfoTip label="How equipment time is counted">
          Carrying equipment adds no time. Its time counts only when it is assigned to a scheduled checkpoint task, and it then
          replaces that task's estimate. Quantity does not multiply time.
        </InfoTip>
      </h5>
      <div className="mp-segmented" role="group" aria-label="Timing mode">
        <button type="button" className={item.timingMode === 'per-task' ? 'is-active' : ''} aria-pressed={item.timingMode === 'per-task'} onClick={() => patch({ timingMode: 'per-task' })}>
          Per task
        </button>
        <button type="button" className={item.timingMode === 'per-use' ? 'is-active' : ''} aria-pressed={item.timingMode === 'per-use'} onClick={() => patch({ timingMode: 'per-use' })}>
          Per use
        </button>
      </div>
      <p className="mp-hint">
        {item.timingMode === 'per-task'
          ? 'Selected: per task = setup + operating × uses + packing (set up once).'
          : 'Selected: per use = uses × (setup + operating + packing) (set up for each use).'}
      </p>
      <div className="mp-toggles">
        <label className="mp-check">
          <input type="checkbox" checked={item.attended} onChange={(e) => patch({ attended: e.target.checked })} />
          <span>Needs continuous attention while operating</span>
        </label>
        <label className="mp-check">
          <input type="checkbox" checked={item.includesBatteries} onChange={(e) => patch({ includesBatteries: e.target.checked })} />
          <span>Batteries and accessories included in this item</span>
        </label>
        <label className="mp-check">
          <input type="checkbox" checked={item.inSuit} onChange={(e) => patch({ inSuit: e.target.checked })} />
          <span>Already part of the spacesuit (not counted as carried)</span>
        </label>
      </div>
      {!item.attended && <p className="mp-hint">Unattended: its operating time may overlap other work in the same task; setup and packing are attended.</p>}

      {!item.inSuit && (
        <>
          <h5 className="mp-editor__h">Carriers</h5>
          <p className="mp-hint">
            {allocated} of {qty} unit{qty > 1 ? 's' : ''} allocated. Each unit goes to one carrier only.
          </p>
          <div className="mp-carriers">
            {shownCarriers.map((c) => {
              const units = item.allocation[c] ?? 0;
              const invalid = !summary.carriers.includes(c);
              return (
                <div key={c} className={`mp-carrier${invalid ? ' is-invalid' : ''}`}>
                  <span>
                    {CARRIER_LABELS[c]}
                    {invalid && <small> · not in this mission</small>}
                  </span>
                  <span className="mp-stepper">
                    <button
                      type="button"
                      className="mp-icon-btn"
                      aria-label={`One fewer unit for ${CARRIER_LABELS[c]}`}
                      disabled={units === 0}
                      onClick={() => dispatch({ type: 'set-allocation', uid: item.uid, carrier: c, units: units - 1 })}
                    >
                      −
                    </button>
                    <span className="mp-num" aria-live="polite">
                      {units}
                    </span>
                    <button
                      type="button"
                      className="mp-icon-btn"
                      aria-label={`One more unit for ${CARRIER_LABELS[c]}`}
                      disabled={allocated >= qty || invalid}
                      onClick={() => dispatch({ type: 'set-allocation', uid: item.uid, carrier: c, units: units + 1 })}
                    >
                      +
                    </button>
                  </span>
                </div>
              );
            })}
          </div>
        </>
      )}

      <h5 className="mp-editor__h">Checkpoint tasks</h5>
      {item.tasks.length === 0 ? (
        <p className="mp-hint">Not used in a checkpoint task: carrying it adds mass but no time.</p>
      ) : (
        <>
          {item.assignments.length > 0 && (
            <ul className="mp-assign">
              {item.assignments.map((a) => {
                const m = activityMinutes(item, a.uses).total;
                return (
                  <li key={a.id}>
                    <span>
                      {stopLabel(a.stop)} · {TASKS[a.task].name}
                    </span>
                    <span className="mp-unit-input">
                      <input
                        type="number"
                        min={1}
                        step={1}
                        aria-label={`Uses at ${stopLabel(a.stop)}, ${TASKS[a.task].name}`}
                        value={a.uses}
                        onChange={(e) => {
                          const n = Number(e.target.value);
                          if (Number.isInteger(n) && n >= 1) dispatch({ type: 'set-assignment-uses', uid: item.uid, assignmentId: a.id, uses: n });
                        }}
                      />
                      uses
                    </span>
                    <span className="mp-num mp-assign__min">{m === null ? 'time unknown' : `${Math.round(m)} min`}</span>
                    <button
                      type="button"
                      className="mp-icon-btn"
                      aria-label={`Remove assignment ${stopLabel(a.stop)}, ${TASKS[a.task].name}`}
                      onClick={() => dispatch({ type: 'remove-assignment', uid: item.uid, assignmentId: a.id })}
                    >
                      ×
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          <div className="mp-assign__add">
            <select aria-label="Checkpoint" value={stop} onChange={(e) => setStop(e.target.value)}>
              {stops.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                  {s.location?.name ? ` · ${s.location.name}` : ''}
                </option>
              ))}
            </select>
            <select aria-label="Task" value={task} onChange={(e) => setTask(e.target.value as TaskId)}>
              {item.tasks.map((t) => (
                <option key={t} value={t}>
                  {TASKS[t].name}
                </option>
              ))}
            </select>
            <span className="mp-unit-input">
              <input type="number" min={1} step={1} aria-label="Number of uses" aria-invalid={!usesValid} value={uses} onChange={(e) => setUses(e.target.value)} />
              uses
            </span>
            <button
              type="button"
              className="mp-btn mp-btn--small"
              disabled={!stop || !task || !usesValid || item.assignments.some((a) => a.stop === stop && a.task === task)}
              onClick={() => task && dispatch({ type: 'add-assignment', uid: item.uid, stop, task, uses: Number(uses) })}
            >
              Assign
            </button>
          </div>
          <p className="mp-hint">Assigning schedules the task at that checkpoint if it was not already.</p>
        </>
      )}

      <label className="mp-field">
        <span>Source / notes</span>
        <textarea rows={2} value={item.notes} onChange={(e) => patch({ notes: e.target.value })} />
      </label>

      <div className="mp-editor__actions">
        {isDefault && (
          <button type="button" className="mp-link" onClick={() => dispatch({ type: 'reset-item', uid: item.uid })}>
            Reset to Demo Values
          </button>
        )}
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- loadout */

function RemoveButton({ item, state, dispatch }: { item: LoadoutItem; state: MissionState; dispatch: Dispatch<MissionAction> }) {
  const [asking, setAsking] = useState(false);
  const stops = routeStops(state);
  const remove = () => dispatch({ type: 'remove-item', uid: item.uid });
  if (!asking) {
    return (
      <button
        type="button"
        className="mp-icon-btn mp-icon-btn--danger"
        aria-label={`Remove ${item.name}`}
        title="Remove"
        onClick={() => (item.assignments.length ? setAsking(true) : remove())}
      >
        ×
      </button>
    );
  }
  return (
    <span className="mp-confirm mp-confirm--block" role="alertdialog" aria-label={`Remove ${item.name}?`}>
      <span className="mp-confirm__question">
        Remove {item.name}? These tasks will lose it and be flagged as missing equipment:{' '}
        {item.assignments.map((a) => `${stops.find((s) => s.key === a.stop)?.label} · ${TASKS[a.task].name}`).join('; ')}.
      </span>
      <button type="button" className="mp-btn mp-btn--small mp-btn--danger" onClick={remove}>
        Remove
      </button>
      <button type="button" className="mp-btn mp-btn--small" onClick={() => setAsking(false)}>
        Keep
      </button>
    </span>
  );
}

function LoadoutTable({
  state,
  dispatch,
  openUid,
  setOpenUid,
}: {
  state: MissionState;
  dispatch: Dispatch<MissionAction>;
  openUid: string | null;
  setOpenUid: (uid: string | null) => void;
}) {
  if (!state.loadout.length) {
    return <p className="mp-hint">The loadout is empty. Add equipment from the menu, or define your own.</p>;
  }
  return (
    <table className="mp-ltable">
      <thead>
        <tr>
          <th scope="col">Equipment</th>
          <th scope="col">Unit mass</th>
          <th scope="col">Qty</th>
          <th scope="col">Total mass</th>
          <th scope="col">Carrier</th>
          <th scope="col">Assigned tasks</th>
          <th scope="col">
            <span className="mp-sr">Edit</span>
          </th>
          <th scope="col">
            <span className="mp-sr">Remove</span>
          </th>
        </tr>
      </thead>
      {state.loadout.map((item) => {
        const open = openUid === item.uid;
        const total = totalMass(item);
        const editorId = `mp-ed-${item.uid}`;
        return (
          <tbody key={item.uid} className={open ? 'is-open' : ''}>
            <tr>
              <th scope="row" data-label="Equipment">
                <span className="mp-ltable__name">{item.name}</span>
                <span className={`mp-tag mp-tag--${item.fields.unitMassKg.status}`}>
                  {item.catalogId === null ? 'Custom' : STATUS_LABELS[item.fields.unitMassKg.status].replace(' — editable', '')}
                </span>
              </th>
              <td data-label="Unit mass" className="mp-num">
                {item.fields.unitMassKg.value === null ? 'unknown' : kg(item.fields.unitMassKg.value)}
              </td>
              <td data-label="Qty" className="mp-num">
                {quantity(item)}
              </td>
              <td data-label="Total mass" className="mp-num">
                {total === null ? 'unknown' : kg(total)}
              </td>
              <td data-label="Carrier">{carrierText(item)}</td>
              <td data-label="Assigned tasks" className="mp-num">
                {item.assignments.length || '—'}
              </td>
              <td className="mp-ltable__act">
                <button
                  type="button"
                  className={`mp-icon-btn${open ? ' is-active' : ''}`}
                  aria-expanded={open}
                  aria-controls={editorId}
                  aria-label={`Edit ${item.name}`}
                  title="Edit"
                  onClick={() => setOpenUid(open ? null : item.uid)}
                >
                  <svg viewBox="0 0 16 16" aria-hidden="true">
                    <path d="M3 13l1-3.5 6.5-6.5 2.5 2.5L6.5 12z" />
                  </svg>
                </button>
              </td>
              <td className="mp-ltable__act">
                <RemoveButton item={item} state={state} dispatch={dispatch} />
              </td>
            </tr>
            {open && (
              <tr className="mp-ltable__details">
                <td colSpan={8} id={editorId}>
                  <ItemEditor item={item} state={state} dispatch={dispatch} />
                </td>
              </tr>
            )}
          </tbody>
        );
      })}
    </table>
  );
}

/* ------------------------------------------------------------------ main */

/** The Equipment tab: a live summary, the loadout, the equipment menu and the custom form. */
export default function EquipmentSection({ state, dispatch, duration }: Props) {
  const [view, setView] = useState<View>(state.loadout.length ? 'loadout' : 'menu');
  const [openUid, setOpenUid] = useState<string | null>(null);
  const mass = useMemo(() => equipmentSummary(state), [state]);
  const cost = useMemo(() => costSummary(state.loadout), [state.loadout]);
  const activityMin = duration.timings.filter((t) => t.source === 'equipment').reduce((s, t) => s + (t.minutes ?? 0), 0);
  const unknownActivity = duration.timings.filter((t) => t.source === 'equipment' && t.minutes === null).length;
  const costText = Object.entries(cost.byCurrency)
    .map(([code, v]) => `${v.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${code}`)
    .join(' + ');

  return (
    <div className="mp-equipment">
      <section className="mp-loadout" aria-label="Loadout summary" aria-live="polite">
        <div className="mp-loadout__head">
          <span className="mp-eyebrow">Loadout · {state.loadout.length} item{state.loadout.length === 1 ? '' : 's'}</span>
          <span className="mp-loadout__total mp-num">{kg(mass.knownKg)}</span>
        </div>
        {mass.unknownItems.length > 0 && <p className="mp-hint mp-hint--alert">{describeKnownMass(mass.knownKg, mass.unknownItems.length)}.</p>}
        <dl className="mp-stats">
          {(Object.keys(MASS_GROUP_LABELS) as MassGroup[]).map((g) => (
            <Stat key={g} label={MASS_GROUP_LABELS[g]}>
              {kg(mass.byGroup[g])}
            </Stat>
          ))}
          {mass.carriers.map((c) => (
            <Stat key={c} label={CARRIER_LABELS[c]}>
              {kg(mass.byCarrier[c] ?? 0)}
            </Stat>
          ))}
          {mass.unallocatedUnits > 0 && (
            <Stat label="Not on a carrier">
              {mass.unallocatedUnits} unit{mass.unallocatedUnits > 1 ? 's' : ''} · {kg(mass.unallocatedKg)}
            </Stat>
          )}
          {mass.inSuitItems.length > 0 && <Stat label="Counted with the suit">{kg(mass.inSuitKg)}</Stat>}
          <Stat
            label={
              <>
                Spacesuit
                <InfoTip label="About the suit mass">
                  No verified suit mass is available, so none is included unless you enter one as your own assumption. It is shown
                  separately and never added to the equipment.
                </InfoTip>
              </>
            }
          >
            <span className="mp-unit-input">
              <input
                type="number"
                min={0}
                step={1}
                placeholder="none"
                aria-label="Suit mass assumption in kilograms (optional)"
                value={state.suitMassAssumptionKg ?? ''}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  dispatch({ type: 'set-suit-mass', massKg: e.target.value === '' || !Number.isFinite(v) || v < 0 ? null : v });
                }}
              />
              kg
            </span>
          </Stat>
          <Stat label="Sample mass">
            Not estimated
          </Stat>
          <Stat
            label={
              <>
                Weight on Mars
                <InfoTip label="Mass and weight">
                  Mass is the same on Mars as on Earth; only weight changes. Weight = mass × {MARS_GRAVITY} m/s², for the known
                  equipment mass only.
                </InfoTip>
              </>
            }
          >
            {(mass.knownKg * MARS_GRAVITY).toFixed(0)} N
          </Stat>
          <Stat label="Scheduled equipment time" emphasis>
            {formatDuration(activityMin / 60)}
            {unknownActivity ? ` + ${unknownActivity} unknown` : ''}
          </Stat>
          <Stat label="Cost">{costText || 'Not provided'}</Stat>
        </dl>
        {cost.noCurrency.length > 0 && <p className="mp-hint">Cost without a currency is not summed: {cost.noCurrency.join(', ')}.</p>}
      </section>

      <p className="mp-disclaimer">
        Values marked “Demo estimate — editable” are not NASA specifications.
        <InfoTip label="About these figures">
          Demo estimates are plausible orders of magnitude for hand-carried field equipment, for planning practice only. Items marked
          “concept” are not existing EVA hardware, and rover instruments are not astronaut-portable packages. Blank values are
          unknown, never zero.
        </InfoTip>
      </p>

      <div className="mp-segmented mp-equipment__views" role="tablist" aria-label="Equipment views">
        {(
          [
            ['loadout', `Loadout (${state.loadout.length})`],
            ['menu', 'Equipment menu'],
            ['custom', '+ Custom'],
          ] as [View, string][]
        ).map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={view === id} className={view === id ? 'is-active' : ''} onClick={() => setView(id)}>
            {label}
          </button>
        ))}
      </div>

      {view === 'loadout' && <LoadoutTable state={state} dispatch={dispatch} openUid={openUid} setOpenUid={setOpenUid} />}
      {view === 'menu' && <EquipmentMenu state={state} dispatch={dispatch} />}
      {view === 'custom' && (
        <CustomForm
          state={state}
          dispatch={dispatch}
          onDone={(uid) => {
            setView('loadout');
            setOpenUid(uid);
          }}
        />
      )}
    </div>
  );
}
