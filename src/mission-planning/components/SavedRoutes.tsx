import { useCallback, useEffect, useState, type Dispatch } from 'react';
import { formatDuration, formatKm, locationName } from '../geo';
import { durationSummary, routeMetrics, type MissionAction, type MissionState } from '../model';
import { createLocalRouteStore, hasContent, missionFingerprint, type RouteStore, type SavedRoute } from '../savedRoutes';
import ResetRouteButton from './ResetRouteButton';

/** The saved route the working mission came from, and what it looked like when saved. */
interface Current {
  id: string;
  name: string;
  fingerprint: string;
}

export interface SavedRoutesApi {
  store: RouteStore;
  routes: SavedRoute[];
  current: Current | null;
  /** True when the working mission holds changes that are not in a saved route. */
  dirty: boolean;
  notice: string | null;
  saveNew: (name: string) => void;
  saveChanges: () => void;
  saveBeforeReset: () => void;
  open: (route: SavedRoute) => void;
  remove: (id: string) => void;
  clear: () => void;
}

const stamp = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

/** Saved-route state for the planner; the store is created once per visit. */
export function useSavedRoutes(state: MissionState, dispatch: Dispatch<MissionAction>, onOpened: () => void): SavedRoutesApi {
  const [store] = useState(createLocalRouteStore);
  const [routes, setRoutes] = useState(() => store.list());
  const [current, setCurrent] = useState<Current | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const fingerprint = missionFingerprint(state);
  const dirty = current ? current.fingerprint !== fingerprint : hasContent(state);

  useEffect(() => {
    if (!notice) return undefined;
    const t = window.setTimeout(() => setNotice(null), 4000);
    return () => window.clearTimeout(t);
  }, [notice]);

  // Leaving the page with unsaved work asks first
  useEffect(() => {
    if (!dirty) return undefined;
    const onUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onUnload);
    return () => window.removeEventListener('beforeunload', onUnload);
  }, [dirty]);

  const saved = (r: SavedRoute, verb: string) => {
    setCurrent({ id: r.id, name: r.name, fingerprint: missionFingerprint(r.mission) });
    setRoutes(store.list());
    setNotice(`${verb} “${r.name}” · ${new Date(r.updatedAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`);
  };

  return {
    store,
    routes,
    current,
    dirty,
    notice,
    saveNew: (name) => saved(store.create(name, state), 'Saved'),
    saveChanges: () => {
      if (!current) return;
      const r = store.update(current.id, current.name, state);
      // The saved route was deleted elsewhere: keep the work by saving it anew
      saved(r ?? store.create(current.name, state), 'Saved changes to');
    },
    saveBeforeReset: () => {
      if (!hasContent(state)) return;
      if (current) {
        if (!dirty) {
          setNotice(`“${current.name}” is already saved`);
          return;
        }
        const r = store.update(current.id, current.name, state);
        saved(r ?? store.create(current.name, state), 'Saved changes to');
        return;
      }
      saved(store.create(defaultName(state), state), 'Saved');
    },
    open: useCallback(
      (route: SavedRoute) => {
        dispatch({ type: 'load', state: JSON.parse(JSON.stringify(route.mission)) as MissionState });
        setCurrent({ id: route.id, name: route.name, fingerprint: missionFingerprint(route.mission) });
        setNotice(`Opened “${route.name}”`);
        onOpened();
      },
      [dispatch, onOpened],
    ),
    remove: (id) => {
      store.remove(id);
      setRoutes(store.list());
      if (current?.id === id) setCurrent(null);
    },
    clear: () => {
      dispatch({ type: 'new-mission' });
      setCurrent(null);
    },
  };
}

function defaultName(state: MissionState): string {
  const a = state.start?.name;
  const b = state.destination?.name;
  if (a && b) return `${a} to ${b}`;
  return `Marswalk ${new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`;
}

function NameForm({ initial, submitLabel, onSubmit, onCancel }: { initial: string; submitLabel: string; onSubmit: (name: string) => void; onCancel: () => void }) {
  const [name, setName] = useState(initial);
  const valid = name.trim().length > 0;
  return (
    <form
      className="mp-save__form"
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) onSubmit(name.trim().slice(0, 80));
      }}
    >
      <label>
        <span className="mp-sr">Route name</span>
        <input type="text" value={name} maxLength={80} autoFocus aria-label="Route name" onChange={(e) => setName(e.target.value)} />
      </label>
      <button type="submit" className="mp-btn mp-btn--small mp-btn--accent" disabled={!valid}>
        {submitLabel}
      </button>
      <button type="button" className="mp-btn mp-btn--small" onClick={onCancel}>
        Cancel
      </button>
    </form>
  );
}

/** Save Route / Save Changes / Save as New / Clear Current Route, beside the route actions. */
export function SaveControls({ api, state }: { api: SavedRoutesApi; state: MissionState }) {
  const [naming, setNaming] = useState<'new' | 'copy' | null>(null);
  const { current, dirty } = api;
  const empty = !hasContent(state);

  return (
    <div className="mp-save">
      {naming ? (
        <NameForm
          initial={naming === 'copy' && current ? `${current.name} (copy)` : defaultName(state)}
          submitLabel="Save"
          onSubmit={(name) => {
            api.saveNew(name);
            setNaming(null);
          }}
          onCancel={() => setNaming(null)}
        />
      ) : current ? (
        <>
          <p className="mp-save__state">
            <span className="mp-save__name">{current.name}</span>
            <span className={dirty ? 'is-dirty' : ''}>{dirty ? 'Unsaved changes' : 'Saved'}</span>
          </p>
          <div className="mp-save__actions">
            <button type="button" className="mp-btn mp-btn--small mp-btn--accent" disabled={!dirty} onClick={api.saveChanges}>
              Save Changes
            </button>
            <button type="button" className="mp-btn mp-btn--small" onClick={() => setNaming('copy')}>
              Save as New
            </button>
          </div>
        </>
      ) : (
        <div className="mp-save__actions">
          <button type="button" className="mp-btn mp-btn--small mp-btn--accent" disabled={empty} onClick={() => setNaming('new')}>
            Save Route
          </button>
        </div>
      )}
      {!naming && (
        <ResetRouteButton
          onReset={api.clear}
          disabled={empty && !current}
          label="Clear current route"
          className="mp-link mp-save__clear"
          confirm={dirty}
          question="Discard unsaved changes?"
        />
      )}
      {api.notice && (
        <p className="mp-save__notice" role="status">
          {api.notice}
        </p>
      )}
    </div>
  );
}

function SavedRow({ route, api }: { route: SavedRoute; api: SavedRoutesApi }) {
  const [asking, setAsking] = useState<'open' | 'delete' | null>(null);
  const m = route.mission;
  const metrics = routeMetrics(m);
  const duration = durationSummary(m, metrics);
  const isCurrent = api.current?.id === route.id;
  const stops = m.checkpoints.length;
  const open = () => {
    setAsking(null);
    api.open(route);
  };

  return (
    <li className={`mp-saved__row${isCurrent ? ' is-current' : ''}`}>
      <div className="mp-saved__main">
        <p className="mp-saved__name">
          {route.name}
          {isCurrent && <span className="mp-saved__badge">Open</span>}
        </p>
        <p className="mp-saved__route">
          {m.start ? locationName(m.start.name) : 'No start'} → {m.destination ? locationName(m.destination.name) : 'No destination'}
        </p>
        <p className="mp-saved__meta mp-num">
          {metrics.segments.length ? formatKm(metrics.totalKm) : '—'} · {metrics.segments.length ? formatDuration(duration.totalHours) : '—'} ·{' '}
          {stops} checkpoint{stops === 1 ? '' : 's'}
        </p>
        <p className="mp-saved__date">Saved {stamp(route.updatedAt)}</p>
      </div>
      {asking ? (
        <span className="mp-confirm mp-confirm--block" role="group" aria-label={asking === 'open' ? 'Confirm opening' : 'Confirm deleting'}>
          <span className="mp-confirm__question">
            {asking === 'open' ? 'Discard your unsaved changes and open this route?' : `Delete “${route.name}”? This cannot be undone.`}
          </span>
          <button
            type="button"
            className="mp-btn mp-btn--small mp-btn--danger"
            autoFocus
            onClick={() => (asking === 'open' ? open() : api.remove(route.id))}
          >
            {asking === 'open' ? 'Open' : 'Delete'}
          </button>
          <button type="button" className="mp-btn mp-btn--small" onClick={() => setAsking(null)}>
            Cancel
          </button>
        </span>
      ) : (
        <div className="mp-saved__actions">
          <button
            type="button"
            className="mp-btn mp-btn--small"
            aria-label={`Open ${route.name}`}
            onClick={() => (api.dirty ? setAsking('open') : open())}
          >
            Open
          </button>
          <button type="button" className="mp-link mp-link--danger" aria-label={`Delete ${route.name}`} onClick={() => setAsking('delete')}>
            Delete
          </button>
        </div>
      )}
    </li>
  );
}

/** The Saved tab. */
export function SavedRoutesSection({ api }: { api: SavedRoutesApi }) {
  return (
    <div className="mp-saved">
      {!api.store.persistent && (
        <p className="mp-hint mp-hint--alert">This browser is not allowing storage, so saved routes last only until you close the page.</p>
      )}
      {api.store.skipped > 0 && (
        <p className="mp-hint mp-hint--alert">
          {api.store.skipped} saved entr{api.store.skipped === 1 ? 'y' : 'ies'} could not be read and {api.store.skipped === 1 ? 'was' : 'were'} skipped.
        </p>
      )}
      {api.routes.length === 0 ? (
        <div className="mp-saved__empty">
          <p className="mp-saved__empty-title">No saved Marswalks yet.</p>
          <p className="mp-hint">Plan your first mission and save it here for future exploration.</p>
        </div>
      ) : (
        <ul className="mp-saved__list">
          {api.routes.map((r) => (
            <SavedRow key={r.id} route={r} api={api} />
          ))}
        </ul>
      )}
      <p className="mp-hint">Saved in this browser only: routes are not synced to other devices or browsers.</p>
    </div>
  );
}
