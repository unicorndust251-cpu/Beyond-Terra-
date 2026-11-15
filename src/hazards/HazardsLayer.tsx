import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as L from 'leaflet';
import { useMarsMap } from '../map/MarsMapContext';
import { usePrefersReducedMotion } from '../map/usePrefersReducedMotion';
import type { DemStore } from '../science/molaDem';
import {
  fromMapLatLng,
  hazardFocusStore,
  hazardStore,
  patchHazardState,
  toMapLatLng,
  useHazardState,
  useMissionConstraints,
  useUiMode,
  usePlannedRoute,
  type HazardSelection,
  type MarsCoordinate,
} from '../shared';
import HazardPanel from './components/HazardPanel';
import HazardDrawer from './components/HazardDrawer';
import HazardToolbar from './components/HazardToolbar';
import { MapLegend, RouteStrip } from './components/MapExtras';
import { DuneLayer, duneBounds, hitTestDunes, loadDunes, selectedDuneOverlay, type DuneData, type DuneFeature } from './dunes';
import { ObservationMarkers } from './observationMarkers';
import { OBSERVATION_BY_ID } from './observations';
import {
  CoverageLayer,
  SlopeCellLayer,
  loadSlopeStore,
  sampleSlope,
  type SlopeCell,
  type SlopeSample,
} from './slopeCells';
import {
  HAZARD_PANES,
  StructureLayer,
  ensureHazardPanes,
  hitTestLines,
  loadStructures,
  selectedLineOverlay,
  type LineHit,
  type StructureData,
} from './structures';
import { useRouteHazards } from './useRouteHazards';
import { useEnvInputs } from './env/inputs';
import { useEnvLayers } from './env/useEnvLayers';
import { categoryName } from './categories';
import './hazards.css';

export type LoadState<T> = { state: 'loading' } | { state: 'error'; message: string } | { state: 'ready'; data: T };

/** What lies under a tapped or typed point. */
export interface PointResult {
  at: MarsCoordinate;
  lines: LineHit[];
  dunes: DuneFeature[];
  slope: SlopeSample | { state: 'inactive' } | { state: 'pending' };
}

export interface HazardContext {
  map: L.Map;
  structures: LoadState<StructureData>;
  slopeStore: LoadState<DemStore>;
  dunes: LoadState<DuneData>;
  point: PointResult | null;
  /** The slope cell currently selected (kept so its card can show it). */
  slopeCell: SlopeCell | null;
  retryStructures(): void;
  retrySlope(): void;
  retryDunes(): void;
  /** Frame a mapped dune field (it may be far from the current view). */
  locateDune(f: DuneFeature): void;
  /** What is on the map now, for the data check. */
  rendered: { markers: number; markersInView: number; dunesInView: number; linesInView: number };
  /** Select a typed or tapped point: tests every active layer there. */
  inspectPoint(at: MarsCoordinate, opts?: { centre?: boolean }): void;
  focusObservation(id: string): void;
  cursor: MarsCoordinate | null;
}

const isTouch = () => window.matchMedia?.('(pointer: coarse)').matches ?? false;

/**
 * The Hazards module: its layers are on the shared map in both views (planner and
 * hazards), so calculating or clearing a route never removes them. The key, catalogue and
 * information drawer appear in the Hazards view, where map taps inspect hazards.
 */
export default function HazardsLayer() {
  const { map } = useMarsMap();
  const hz = useHazardState();
  const reduced = usePrefersReducedMotion();
  const [structures, setStructures] = useState<LoadState<StructureData>>({ state: 'loading' });
  const [slopeStore, setSlopeStore] = useState<LoadState<DemStore>>({ state: 'loading' });
  const [dunes, setDunes] = useState<LoadState<DuneData>>({ state: 'loading' });
  const [attempt, setAttempt] = useState({ s: 0, d: 0, u: 0 });
  const [rendered, setRendered] = useState({ markers: 0, markersInView: 0, dunesInView: 0, linesInView: 0 });
  const [point, setPoint] = useState<PointResult | null>(null);
  const [slopeCell, setSlopeCell] = useState<SlopeCell | null>(null);
  const [hover, setHover] = useState<{ x: number; y: number; label: string } | null>(null);
  const [cursor, setCursor] = useState<MarsCoordinate | null>(null);
  const inHazards = hz.view === 'hazards';
  const uiMode = useUiMode();

  /* ---------------------------------------------------------------- data */
  useEffect(() => {
    let live = true;
    setStructures({ state: 'loading' });
    loadStructures().then(
      (data) => live && setStructures({ state: 'ready', data }),
      (err: Error) => live && setStructures({ state: 'error', message: err.message }),
    );
    return () => {
      live = false;
    };
  }, [attempt.s]);

  useEffect(() => {
    let live = true;
    setSlopeStore({ state: 'loading' });
    loadSlopeStore().then(
      (data) => live && setSlopeStore({ state: 'ready', data }),
      (err: Error) => live && setSlopeStore({ state: 'error', message: err.message }),
    );
    return () => {
      live = false;
    };
  }, [attempt.d]);

  useEffect(() => {
    let live = true;
    setDunes({ state: 'loading' });
    loadDunes().then(
      (data) => live && setDunes({ state: 'ready', data }),
      (err: Error) => live && setDunes({ state: 'error', message: err.message }),
    );
    return () => {
      live = false;
    };
  }, [attempt.u]);

  useEffect(() => ensureHazardPanes(map), [map]);

  // The view is marked on the map root so each module's own panels can step aside
  useEffect(() => {
    const root = map.getContainer().closest('.bt-map') as HTMLElement | null;
    if (root) root.dataset.btView = hz.view;
  }, [map, hz.view]);

  /* -------------------------------------------------------------- layers */
  const lineLayer = useMemo(() => (structures.state === 'ready' ? new StructureLayer(map, structures.data) : null), [map, structures]);
  useEffect(() => () => lineLayer?.remove(), [lineLayer]);
  const activeKey = hz.active.join(',');
  useEffect(() => {
    lineLayer?.setActive(hz.active);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lineLayer, activeKey]);

  const slopeLayer = useMemo(() => (slopeStore.state === 'ready' ? new SlopeCellLayer(slopeStore.data) : null), [slopeStore]);
  const slopeOn = hz.active.includes('SL');
  useEffect(() => {
    if (!slopeLayer || !slopeOn) return undefined;
    slopeLayer.addTo(map);
    return () => {
      slopeLayer.remove();
    };
  }, [map, slopeLayer, slopeOn]);
  const shading = hz.outlinesOnly ? 0 : hz.fillOpacity;
  useEffect(() => slopeLayer?.setParams(hz.slopeThresholdDeg, shading), [slopeLayer, hz.slopeThresholdDeg, shading]);

  // S: every mapped USGS dune field, in both views; shading follows the appearance settings
  const duneLayer = useMemo(() => (dunes.state === 'ready' ? new DuneLayer(dunes.data) : null), [dunes]);
  const dunesOn = hz.active.includes('S');
  useEffect(() => {
    if (!duneLayer || !dunesOn) return undefined;
    duneLayer.addTo(map);
    return () => {
      duneLayer.remove();
    };
  }, [map, duneLayer, dunesOn]);
  useEffect(() => duneLayer?.setFill(shading), [duneLayer, shading]);

  // Location markers for all 60 NASA records (interactive only in the Hazards view, where taps inspect)
  const focusRef = useRef<(id: string) => void>(() => undefined);
  const markers = useMemo(() => new ObservationMarkers(map, (id) => focusRef.current(id)), [map]);
  useEffect(() => () => markers.remove(), [markers]);
  const selectedObs = hz.selection?.kind === 'observation' ? hz.selection.id : null;
  useEffect(() => {
    const refresh = () => {
      const st = hazardStore.get();
      markers.update(st.active, st.view === 'hazards', selectedObs);
      setRendered({
        markers: markers.count,
        markersInView: markers.countInView(),
        dunesInView: duneLayer && st.active.includes('S') ? duneLayer.countInView(map) : 0,
        linesInView: lineLayer ? lineLayer.countInView(map, st.active) : 0,
      });
    };
    refresh();
    map.on('moveend', refresh);
    return () => {
      map.off('moveend', refresh);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, markers, activeKey, inHazards, selectedObs, duneLayer, lineLayer]);

  const coverage = useMemo(() => new CoverageLayer(), []);
  const coverageOn = hz.active.includes('U');
  useEffect(() => {
    if (!coverageOn) return undefined;
    coverage.addTo(map);
    return () => {
      coverage.remove();
    };
  }, [map, coverage, coverageOn]);

  /* ----------------------------------------------------------- inspection */
  const structuresRef = useRef(structures);
  structuresRef.current = structures;
  const slopeRef = useRef(slopeStore);
  slopeRef.current = slopeStore;
  const dunesRef = useRef(dunes);
  dunesRef.current = dunes;

  const inspectPoint = useCallback(
    (at: MarsCoordinate, opts: { centre?: boolean } = {}) => {
      const state = hazardStore.get();
      if (opts.centre) map.setView(toMapLatLng(at, map.getCenter().lng), Math.max(map.getZoom(), 6), { animate: false });
      const latlng = L.latLng(toMapLatLng(at, map.getCenter().lng));
      const s = structuresRef.current;
      const lines = s.state === 'ready' ? hitTestLines(map, s.data, state.active, latlng, isTouch() ? 16 : 8) : [];
      const du = dunesRef.current;
      const duneHits = du.state === 'ready' && state.active.includes('S') ? hitTestDunes(map, du.data, latlng, isTouch() ? 10 : 4) : [];
      const slopeActive = state.active.includes('SL');
      const result: PointResult = { at, lines, dunes: duneHits, slope: slopeActive ? { state: 'pending' } : { state: 'inactive' } };
      setPoint(result);
      setSlopeCell(null);

      const finish = (slope: PointResult['slope']) => {
        const done = { ...result, slope };
        setPoint(done);
        const cell = slope.state === 'classified' ? slope.cell : null;
        const count = lines.length + duneHits.length + (cell ? 1 : 0);
        if (count === 1) {
          if (duneHits.length) {
            patchHazardState({ selection: { kind: 'feature', id: duneHits[0].id, at } });
          } else if (cell) {
            setSlopeCell(cell);
            patchHazardState({ selection: { kind: 'feature', id: `SL:${cell.i}:${cell.j}`, at } });
          } else {
            patchHazardState({ selection: { kind: 'feature', id: lines[0].feature.id, at } });
          }
        } else {
          patchHazardState({ selection: { kind: 'point', at } });
        }
      };

      const d = slopeRef.current;
      if (!slopeActive) finish({ state: 'inactive' });
      else if (d.state !== 'ready') finish({ state: 'unavailable', reason: d.state === 'error' ? d.message : 'MOLA elevations are still loading.' });
      else sampleSlope(d.data, at, state.slopeThresholdDeg).then(finish);
    },
    [map],
  );

  const focusObservation = useCallback(
    (id: string) => {
      const o = OBSERVATION_BY_ID[id];
      if (!o) return;
      setPoint(null);
      setSlopeCell(null);
      patchHazardState({ selection: { kind: 'observation', id } });
      const target = toMapLatLng(o.observationCentre, map.getCenter().lng);
      if (reduced) map.setView(target, Math.max(map.getZoom(), 7), { animate: false });
      else map.flyTo(target, Math.max(map.getZoom(), 7), { duration: 1.2 });
    },
    [map, reduced],
  );

  focusRef.current = focusObservation;

  // Taps on the map inspect hazards in the Hazards view only (the planner uses taps to pick stops)
  useEffect(() => {
    if (!inHazards) return undefined;
    const onClick = (e: L.LeafletMouseEvent) => inspectPoint(fromMapLatLng(e.latlng));
    map.on('click', onClick);
    return () => {
      map.off('click', onClick);
    };
  }, [map, inHazards, inspectPoint]);

  // Hover: a short label and a brighter line; the cursor coordinate for the readout
  useEffect(() => {
    if (!inHazards) {
      setHover(null);
      setCursor(null);
      lineLayer?.setHovered(null);
      return undefined;
    }
    let frame = 0;
    const onMove = (e: L.LeafletMouseEvent) => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        setCursor(fromMapLatLng(e.latlng));
        const s = structuresRef.current;
        if (s.state !== 'ready' || isTouch()) return;
        const hit = hitTestLines(map, s.data, hazardStore.get().active, e.latlng, 6)[0];
        lineLayer?.setHovered(hit ? hit.feature.id : null);
        const du = dunesRef.current;
        const dune = !hit && du.state === 'ready' && hazardStore.get().active.includes('S') ? hitTestDunes(map, du.data, e.latlng, 2)[0] : undefined;
        const label = hit
          ? `${categoryName(hit.feature.category)} · ${hit.feature.interpretation}`
          : dune
            ? `Sand & Dunes · USGS dune field ${dune.duneId}`
            : null;
        setHover(label ? { x: e.containerPoint.x, y: e.containerPoint.y, label } : null);
        map.getContainer().style.cursor = label ? 'pointer' : '';
      });
    };
    const onOut = () => {
      setHover(null);
      setCursor(null);
      lineLayer?.setHovered(null);
    };
    map.on('mousemove', onMove);
    map.on('mouseout', onOut);
    return () => {
      cancelAnimationFrame(frame);
      map.off('mousemove', onMove);
      map.off('mouseout', onOut);
      map.getContainer().style.cursor = '';
    };
  }, [map, inHazards, lineLayer]);

  /* ---------------------------------------------------- selection overlay */
  const sel = hz.selection;
  const selKey = JSON.stringify(sel);
  useEffect(() => {
    if (!sel) return undefined;
    const near = map.getCenter().lng;
    const layers: L.Layer[] = [];
    const crosshairAt = sel.kind === 'observation' ? OBSERVATION_BY_ID[sel.id]?.observationCentre : sel.kind === 'category' ? undefined : sel.at;
    if (sel.kind === 'feature' && sel.id.startsWith('MGD3-') && dunes.state === 'ready') {
      const f = dunes.data.features.find((x) => x.id === sel.id);
      if (f) layers.push(selectedDuneOverlay(f, near));
    }
    if (sel.kind === 'feature' && structures.state === 'ready') {
      const f = structures.data.features.find((x) => x.id === sel.id);
      if (f) layers.push(selectedLineOverlay(f, near, reduced));
    }
    if (sel.kind === 'feature' && sel.id.startsWith('SL:') && slopeCell) {
      const b = slopeCell.bounds;
      const offset = 360 * Math.round((near - (b.west + b.east) / 2) / 360);
      const rect: L.LatLngBoundsExpression = [
        [b.south, b.west + offset],
        [b.north, b.east + offset],
      ];
      layers.push(L.rectangle(rect, { pane: HAZARD_PANES.selection.name, color: '#F3E5DC', weight: 7, opacity: 0.85, fill: false, interactive: false }));
      layers.push(L.rectangle(rect, { pane: HAZARD_PANES.selection.name, color: '#22C55E', weight: 3.5, fillOpacity: 0.12, interactive: false }));
    }
    if (crosshairAt) {
      // A temporary crosshair on the chosen coordinate, gone when the selection closes
      layers.push(
        L.marker(toMapLatLng(crosshairAt, near), {
          pane: HAZARD_PANES.selection.name,
          interactive: false,
          keyboard: false,
          icon: L.divIcon({
            className: `hz-crosshair${sel.kind === 'observation' ? ' hz-crosshair--centre' : ''}`,
            html: '<span></span>',
            iconSize: [30, 30],
            iconAnchor: [15, 15],
          }),
        }),
      );
    }
    layers.forEach((l) => l.addTo(map));
    return () => layers.forEach((l) => l.remove());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, selKey, structures, dunes, slopeCell, reduced]);

  // The planner's route, tested against the mapped layers (both views)
  const envInputs = useEnvInputs();
  const snapshot = useMissionConstraints();
  const plannedRoute = usePlannedRoute();
  useRouteHazards(map, structures, slopeStore, dunes, hz.slopeThresholdDeg, hz.routeExcluded, envInputs.comm, hz.active);

  // Environmental conditions and mission constraints, on the shared map (both views)
  useEnvLayers({ map, active: hz.active, plannedTime: hz.plannedTime, shading, dem: slopeStore, inputs: envInputs, snapshot, route: plannedRoute });

  // "Show on map" from the route summary: open the point in the Hazards view
  useEffect(
    () =>
      hazardFocusStore.subscribe(() => {
        const req = hazardFocusStore.get();
        if (req) inspectPoint(req.at, { centre: true });
      }),
    [inspectPoint],
  );

  // Re-test a tapped point when the active categories or the threshold change
  const lastPoint = useRef<PointResult | null>(null);
  lastPoint.current = point;
  useEffect(() => {
    const p = lastPoint.current;
    const s = hazardStore.get().selection;
    if (p && s && (s.kind === 'feature' || s.kind === 'point')) inspectPoint(p.at);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeKey, hz.slopeThresholdDeg]);

  const ctx: HazardContext = {
    map,
    structures,
    slopeStore,
    dunes,
    point,
    slopeCell,
    rendered,
    cursor,
    inspectPoint,
    focusObservation,
    retryStructures: () => setAttempt((a) => ({ ...a, s: a.s + 1 })),
    retrySlope: () => setAttempt((a) => ({ ...a, d: a.d + 1 })),
    retryDunes: () => setAttempt((a) => ({ ...a, u: a.u + 1 })),
    locateDune: (f) => {
      map.fitBounds(duneBounds(f, map.getCenter().lng), { padding: [80, 80], maxZoom: 9, animate: !reduced });
    },
  };

  if (!inHazards) return null;
  return (
    <div className="hz-root">
      <HazardToolbar ctx={ctx} simple={uiMode === 'simple'} />
      <HazardPanel ctx={ctx} />
      <MapLegend shifted={!!sel} />
      {uiMode === 'advanced' && <RouteStrip />}
      {sel && <HazardDrawer ctx={ctx} selection={sel} onClose={() => closeSelection(setPoint, setSlopeCell)} onPick={(s) => pick(s, setSlopeCell, point)} />}
      {hover && (
        <div className="hz-hover" style={{ transform: `translate(${hover.x + 14}px, ${hover.y + 14}px)` }} aria-hidden="true">
          {hover.label}
        </div>
      )}
    </div>
  );
}

function closeSelection(setPoint: (p: PointResult | null) => void, setCell: (c: SlopeCell | null) => void) {
  setPoint(null);
  setCell(null);
  patchHazardState({ selection: null });
}

/** Choose one candidate from an overlap picker. */
function pick(s: HazardSelection, setCell: (c: SlopeCell | null) => void, point: PointResult | null) {
  if (s.kind === 'feature' && s.id.startsWith('SL:') && point?.slope.state === 'classified') setCell(point.slope.cell);
  patchHazardState({ selection: s });
}
