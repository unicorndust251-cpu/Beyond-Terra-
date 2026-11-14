import { useCallback, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from 'react';
import {
  normalizeLongitudeEast,
  selectedLocationStore,
  useMapBridge,
  useSelectedLocation,
  type CoordinateBounds,
  type MarsCoordinate,
  type SelectedLocation,
} from '../../shared';
import { formatDuration, formatKm } from '../geo';
import {
  durationSummary,
  initialMissionState,
  massBreakdown,
  missionReducer,
  routeMetrics,
  routeStops,
  type StopKey,
} from '../model';
import { useMapSync } from '../useMapSync';
import EquipmentSection from './EquipmentSection';
import { MissionConfigSection, ObjectivesSection } from './MissionConfigSection';
import RouteSection from './RouteSection';
import RouteSummary from './RouteSummary';
import { ReviewSection, TasksSection } from './TasksAndReview';
import '../missionPlanner.css';

type SectionId = 'route' | 'config' | 'objectives' | 'equipment' | 'tasks' | 'review';

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

/** The Marswalk route planner and mission loadout, beside the Mars Trek map. */
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
  const [section, setSection] = useState<SectionId | null>(() => 'route');
  const [picking, setPicking] = useState<StopKey | null>(null);

  useEffect(() => {
    if (!section) setSection('route');
  }, [section]);
  const bridge = useMapBridge();
  const selection = useSelectedLocation();
  const armedWith = useRef<SelectedLocation | null>(null);
  const panelRef = useRef<HTMLElement>(null);

  const metrics = useMemo(() => routeMetrics(state), [state]);
  const duration = useMemo(() => durationSummary(state, metrics), [state, metrics]);
  const mass = useMemo(() => massBreakdown(state), [state]);

  useMapSync(state);

  const setStop = useCallback((stop: StopKey, coordinate: MarsCoordinate) => {
    const location = { coordinate };
    if (stop === 'start') dispatch({ type: 'set-start', location });
    else if (stop === 'destination') dispatch({ type: 'set-destination', location });
    else dispatch({ type: 'set-checkpoint', id: stop, location });
  }, []);

  // "Pick on map": the next map click after arming sets that stop
  useEffect(() => {
    if (!picking || !selection || selection === armedWith.current || selection.source !== 'map-click') return;
    setStop(picking, selection.coordinate);
    setPicking(null);
  }, [selection, picking, setStop]);

  useEffect(() => {
    if (!picking) return undefined;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setPicking(null);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [picking]);

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

  const sections: { id: SectionId; title: string; summary: string; body: ReactNode }[] = [
    {
      id: 'route',
      title: 'Route',
      summary: metrics.segments.length ? `${formatKm(metrics.totalKm)} · ${formatDuration(metrics.travelHours)}` : 'Set start and destination',
      body: (
        <RouteSection state={state} dispatch={dispatch} picking={picking} onPick={pick} onCalculate={calculate} />
      ),
    },
    {
      id: 'config',
      title: 'Mission configuration',
      summary: `${state.crew} astronaut${state.crew > 1 ? 's' : ''} · ${state.availableHours} h available`,
      body: <MissionConfigSection state={state} dispatch={dispatch} />,
    },
    {
      id: 'objectives',
      title: 'Scientific objectives',
      summary: state.objectives.length ? `${state.objectives.length} selected` : 'None selected',
      body: <ObjectivesSection state={state} dispatch={dispatch} />,
    },
    {
      id: 'equipment',
      title: 'Scientific equipment & mission loadout',
      summary: `${Object.keys(state.equipment).length} items · ${mass.carriedKg.toFixed(1)} kg`,
      body: <EquipmentSection state={state} dispatch={dispatch} />,
    },
    {
      id: 'tasks',
      title: 'Checkpoint tasks',
      summary: `${Object.values(state.tasks).flat().length} assigned · ${formatDuration(duration.taskHours)}`,
      body: <TasksSection state={state} dispatch={dispatch} />,
    },
    {
      id: 'review',
      title: 'Review Marswalk',
      summary: metrics.segments.length ? `${formatDuration(duration.totalHours)} estimated` : 'Plan incomplete',
      body: <ReviewSection state={state} metrics={metrics} duration={duration} />,
    },
  ];

  return (
    <>
      {pickingLabel && (
        <p className="mp-pick-hint" role="status">
          Click the map to set <strong>{pickingLabel}</strong> · <kbd>Esc</kbd> to cancel
        </p>
      )}
      <aside ref={panelRef} className={`mp-panel${open ? ' is-open' : ''}`} aria-label="Marswalk mission planner">
        <header className="mp-panel__header">
          <div>
            <p className="mp-panel__eyebrow">Marswalk planner</p>
            <h2 className="mp-panel__title">Mission planning</h2>
          </div>
          <button
            type="button"
            className="mp-btn mp-btn--icon"
            onClick={() => showPanel(!open)}
            aria-expanded={open}
            aria-label={open ? 'Collapse mission planner' : 'Expand mission planner'}
          >
            {open ? '‹' : '›'}
          </button>
        </header>

        {open && (
          <div className="mp-panel__body">
            {sections.map((s, i) => {
              const expanded = section === s.id;
              return (
                <section key={s.id} className={`mp-section${expanded ? ' is-open' : ''}`}>
                  <h3>
                    <button type="button" aria-expanded={expanded} onClick={() => setSection(expanded ? null : s.id)}>
                      <span className="mp-section__index">{String(i + 1).padStart(2, '0')}</span>
                      <span className="mp-section__title">{s.title}</span>
                      <span className="mp-section__summary">{s.summary}</span>
                    </button>
                  </h3>
                  {expanded && <div className="mp-section__body">{s.body}</div>}
                </section>
              );
            })}
          </div>
        )}
      </aside>
      <RouteSummary
        state={state}
        metrics={metrics}
        besidePanel={open}
        expanded={summaryOpen}
        onToggle={() => showSummary(!summaryOpen)}
      />
    </>
  );
}
