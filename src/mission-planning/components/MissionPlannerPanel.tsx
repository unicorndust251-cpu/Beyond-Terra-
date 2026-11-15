import { useCallback, useEffect, useMemo, useReducer, useRef, useState, type CSSProperties } from 'react';
import {
  normalizeLongitudeEast,
  selectedLocationStore,
  useMapBridge,
  useSelectedLocation,
  type CoordinateBounds,
  type MarsCoordinate,
  type SelectedLocation,
} from '../../shared';
import { durationSummary, initialMissionState, missionReducer, routeMetrics, routeStops, type StopKey } from '../model';
import ExplorationPanel from '../exploration/ExplorationPanel';
import { useExploration } from '../exploration/useExploration';
import { activeMissionStore } from '../missionBridge';
import { useMapSync } from '../useMapSync';
import EquipmentSection from './EquipmentSection';
import LandmarkLocationCard, { type LandmarkRole } from './LandmarkLocationCard';
import RouteSection, { type RouteRow } from './RouteSection';
import RouteSummary from './RouteSummary';
import { SavedRoutesSection, SaveControls, useSavedRoutes } from './SavedRoutes';
import { ReviewSection } from './TasksAndReview';
import '../missionPlanner.css';

type Tab = 'route' | 'equipment' | 'summary' | 'saved';
const TABS: { id: Tab; label: string }[] = [
  { id: 'route', label: 'Route' },
  { id: 'equipment', label: 'Equipment' },
  { id: 'summary', label: 'Summary' },
  { id: 'saved', label: 'Saved' },
];

/** A box around the points, unwrapped so routes crossing ±180° stay compact. */
function boundsAround(points: MarsCoordinate[]): CoordinateBounds {
  let ref = points[0].longitudeEast;
  const lons = points.map((p) => {
    const l = p.longitudeEast + 360 * Math.round((ref - p.longitudeEast) / 360);
    ref = l;
    return l;
  });
  const lats = points.map((p) => p.latitude);
  const padLat = Math.max(0.05, (Math.max(...lats) - Math.min(...lats)) * 0.15);
  const padLon = Math.max(0.05, (Math.max(...lons) - Math.min(...lons)) * 0.15);
  return {
    south: Math.max(-90, Math.min(...lats) - padLat),
    north: Math.min(90, Math.max(...lats) + padLat),
    west: normalizeLongitudeEast(Math.min(...lons) - padLon),
    east: normalizeLongitudeEast(Math.max(...lons) + padLon),
  };
}

/**
 * Widens a box so the route lands in the part of the map left visible by the planner: to
 * the west for the side panel (desktop) or to the north for the top sheet (narrow
 * screens), and to the south for the route summary along the bottom. The map is
 * equirectangular, so degrees scale linearly with pixels.
 */
function makeRoomForPanel(b: CoordinateBounds, panel: DOMRect | undefined, summary: DOMRect | undefined): CoordinateBounds {
  const out = { ...b };
  const W = window.innerWidth;
  const H = window.innerHeight;
  if (panel && W > 640) {
    const covered = Math.min(0.6, (panel.right + 16) / W);
    const span = (((b.east - b.west) % 360) + 360) % 360 || 360;
    out.west = normalizeLongitudeEast(b.east - span / (1 - covered));
  }
  const top = panel && W <= 640 ? Math.min(0.5, (panel.bottom + 16) / H) : 0;
  const bottom = summary ? Math.min(0.5, (H - summary.top + 16) / H) : 0;
  const latSpan = b.north - b.south;
  const fullSpan = latSpan / Math.max(0.2, 1 - top - bottom);
  out.north = Math.min(90, b.north + fullSpan * top);
  out.south = Math.max(-90, b.south - fullSpan * bottom);
  return out;
}

const isPhone = () => window.innerWidth <= 640;

/** The route planner and mission loadout, beside the Mars Trek map. */
export default function MissionPlannerPanel() {
  const [state, dispatch] = useReducer(missionReducer, undefined, initialMissionState);
  // Default to an open planner so the route editor is immediately usable; users can collapse it manually.
  const [open, setOpen] = useState(true);
  // On phones the planner and the route summary take turns, so the map stays visible
  const [summaryOpen, setSummaryOpen] = useState(() => !isPhone());
  const [fitRequest, setFitRequest] = useState(0);
  const showPanel = (v: boolean) => {
    setOpen(v);
    if (v && isPhone()) setSummaryOpen(false);
  };
  const showSummary = (v: boolean) => {
    setSummaryOpen(v);
    if (v && isPhone()) setOpen(false);
  };
  // The open tab and the open row of the Route tab; switching tabs keeps every value,
  // since all mission state lives here, above the tabs
  const [tab, setTab] = useState<Tab>('route');
  const [openRow, setOpenRow] = useState<RouteRow>(null);
  const [picking, setPicking] = useState<StopKey | null>(null);
  const bridge = useMapBridge();
  const selection = useSelectedLocation();
  const armedWith = useRef<SelectedLocation | null>(null);
  const panelRef = useRef<HTMLElement>(null);

  const metrics = useMemo(() => routeMetrics(state), [state]);
  const duration = useMemo(() => durationSummary(state, metrics), [state, metrics]);
  const hasRoute = metrics.segments.length > 0;
  // Opening a saved route shows it on the Route tab and frames it on the map
  const onOpened = useCallback(() => {
    setPicking(null);
    setTab('route');
    setOpenRow(null);
    setFitRequest((n) => n + 1);
  }, []);
  const saved = useSavedRoutes(state, dispatch, onOpened);

  // Publish the live mission for read-only views (the Mars Dashboard)
  useEffect(() => {
    activeMissionStore.set({
      state,
      dispatch,
      savedName: saved.current?.name ?? null,
      dirty: saved.dirty,
      openTab: (t) => {
        showPanel(true);
        setTab(t);
      },
    });
    // showPanel only sets state
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, saved.current, saved.dirty]);
  useEffect(() => () => activeMissionStore.set(null), []);

  // The summary appears with the route: open on desktop so the results are in view at once;
  // on phones it opens when the route is calculated, taking turns with the planner
  useEffect(() => {
    setSummaryOpen(hasRoute && !isPhone());
  }, [hasRoute]);

  // The route preview astronaut, kept here (above the tabs) so tab changes never interrupt it
  const exploration = useExploration(state);
  useMapSync(state, exploration.highlight);

  const setStop = useCallback((stop: StopKey, coordinate: MarsCoordinate, name?: string) => {
    const location = name ? { coordinate, name } : { coordinate };
    if (stop === 'start') dispatch({ type: 'set-start', location });
    else if (stop === 'destination') dispatch({ type: 'set-destination', location });
    else dispatch({ type: 'set-checkpoint', id: stop, location });
  }, []);

  // "Pick on map": the next map click after arming sets that stop. A landmark marker gives
  // its stored coordinate and name; anywhere else, the clicked point
  useEffect(() => {
    if (!picking || !selection || selection === armedWith.current) return;
    if (selection.source === 'landmark') setStop(picking, selection.coordinate, selection.name);
    else if (selection.source === 'map-click') setStop(picking, selection.coordinate);
    else return;
    setPicking(null);
  }, [selection, picking, setStop]);

  /** A landmark picked from its marker, assigned to a mission role with its stored coordinate. */
  const assignLandmark = (role: LandmarkRole) => {
    if (selection?.source !== 'landmark') return;
    const location = { coordinate: selection.coordinate, name: selection.name };
    if (role === 'start') dispatch({ type: 'set-start', location });
    else if (role === 'destination') dispatch({ type: 'set-destination', location });
    else dispatch({ type: 'add-checkpoint', location });
    showPanel(true);
    setTab('route');
    setOpenRow(null);
  };

  useEffect(() => {
    if (!picking) return undefined;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setPicking(null);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [picking]);

  /** Clears the stops and their tasks (mission setup and loadout are kept) and opens the planner on Start. */
  const resetRoute = () => {
    dispatch({ type: 'reset-route' });
    setPicking(null);
    showPanel(true);
    setTab('route');
    setOpenRow('start');
    requestAnimationFrame(() => document.querySelector<HTMLInputElement>('.mp-loc--start .mp-loc__search input')?.focus());
  };

  const pick = (stop: StopKey) => {
    if (picking === stop) {
      setPicking(null);
      return;
    }
    armedWith.current = selectedLocationStore.get();
    setPicking(stop);
  };

  // Typed coordinates and landmarks bring the camera to the location; map picks stay put
  const lastCoords = useRef(new Map<StopKey, string>());
  useEffect(() => {
    const seen = new Map<StopKey, string>();
    routeStops(state).forEach((s) => {
      if (!s.location) return;
      const k = JSON.stringify(s.location.coordinate);
      seen.set(s.key, k);
      const before = lastCoords.current.get(s.key);
      const fromMap = selection?.source === 'map-click' && JSON.stringify(selection.coordinate) === k;
      if (before !== k && !fromMap && bridge) bridge.flyTo(s.location.coordinate, { zoom: Math.max(bridge.getView().zoom, 5) });
    });
    lastCoords.current = seen;
    // only when the stops change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.start, state.destination, state.checkpoints]);

  const calculate = () => {
    dispatch({ type: 'calculate' });
    // On phones, show the result: the summary opens and the planner folds away
    if (isPhone()) showSummary(true);
    setFitRequest((n) => n + 1);
  };

  // Frame the route once the panel and summary have their new sizes
  useEffect(() => {
    if (!fitRequest) return undefined;
    const frame = requestAnimationFrame(() => {
      const points = routeStops(state)
        .filter((s) => s.location)
        .map((s) => s.location!.coordinate);
      if (!bridge || points.length < 2) return;
      bridge.fitBounds(
        makeRoomForPanel(
          boundsAround(points),
          panelRef.current?.getBoundingClientRect(),
          document.querySelector('.mp-sum')?.getBoundingClientRect(),
        ),
      );
    });
    return () => cancelAnimationFrame(frame);
    // only when a fit is requested
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitRequest]);

  const pickingLabel = picking ? routeStops(state).find((s) => s.key === picking)?.label : null;

  return (
    <>
      {selection?.source === 'landmark' && !picking && <LandmarkLocationCard selection={selection} onAssign={assignLandmark} />}
      {pickingLabel && (
        <p className="mp-pick-hint" role="status">
          Click the map to set <strong>{pickingLabel}</strong> · <kbd>Esc</kbd> to cancel
        </p>
      )}
      <aside ref={panelRef} className={`mp-panel${open ? ' is-open' : ''}${open && tab === 'equipment' ? ' is-wide' : ''}`} aria-label="Route planner">
        <header className="mp-panel__header">
          <div>
            <p className="mp-panel__eyebrow">
              Beyond Terra <span aria-hidden="true">/</span> Missions
            </p>
            <h2 className="mp-panel__title">Plan a Marswalk</h2>
          </div>
          <button
            type="button"
            className="mp-icon-btn mp-panel__collapse"
            onClick={() => showPanel(!open)}
            aria-expanded={open}
            aria-label={open ? 'Collapse route planner' : 'Expand route planner'}
          >
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <path d={open ? 'M10 4L6 8l4 4' : 'M6 4l4 4-4 4'} />
            </svg>
          </button>
        </header>

        {open && (
          <>
            <div
              className="mp-tabs"
              role="tablist"
              aria-label="Planner sections"
              // Positions the sliding indicator under the open tab
              style={{ '--mp-tab': TABS.findIndex((t) => t.id === tab) } as CSSProperties}
            >
              {TABS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  id={`mp-tab-${t.id}`}
                  aria-selected={tab === t.id}
                  aria-controls="mp-tabpanel"
                  className={tab === t.id ? 'is-active' : ''}
                  onClick={() => setTab(t.id)}
                >
                  {t.label}
                  {t.id === 'saved' && saved.routes.length > 0 && <span className="mp-tabs__count">{saved.routes.length}</span>}
                </button>
              ))}
            </div>
            <div className="mp-panel__body" id="mp-tabpanel" role="tabpanel" aria-labelledby={`mp-tab-${tab}`}>
              {tab === 'route' && (
                <RouteSection
                  state={state}
                  dispatch={dispatch}
                  duration={duration}
                  picking={picking}
                  onPick={pick}
                  onCalculate={calculate}
                  onReset={resetRoute}
                  onKeep={saved.saveBeforeReset}
                  onOpenEquipment={() => setTab('equipment')}
                  openRow={openRow}
                  setOpenRow={setOpenRow}
                  saveControls={<SaveControls api={saved} state={state} />}
                />
              )}
              {tab === 'equipment' && <EquipmentSection state={state} dispatch={dispatch} duration={duration} />}
              {tab === 'summary' && <ReviewSection state={state} metrics={metrics} duration={duration} />}
              {tab === 'saved' && <SavedRoutesSection api={saved} />}
            </div>
          </>
        )}
      </aside>
      {hasRoute && (
        <RouteSummary
          state={state}
          metrics={metrics}
          besidePanel={open}
          expanded={summaryOpen}
          onToggle={() => showSummary(!summaryOpen)}
          onReset={resetRoute}
          onKeep={saved.saveBeforeReset}
          exploration={
            exploration.engine && exploration.snapshot ? (
              <ExplorationPanel engine={exploration.engine} x={exploration.snapshot} state={state} travelHours={metrics.travelHours} />
            ) : null
          }
          explorationPlaying={exploration.snapshot?.play === 'playing'}
          onPauseExploration={() => exploration.engine?.pause()}
        />
      )}
    </>
  );
}
