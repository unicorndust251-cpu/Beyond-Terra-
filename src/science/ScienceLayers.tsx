import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type * as L from 'leaflet';
import { useMarsMap } from '../map/MarsMapContext';
import { IMAGERY_PANE } from '../map/marsTrek';
import { DEM_LEVEL_IDS, DemStore, demSupported, loadManifest, sampleBin, type PointSample } from './molaDem';
import { DemLayer, createReliefLayer, ensurePanes, levelIndexForZoom, type DemMode } from './layers';
import { ELEVATION_SCALE, SLOPE_SCALE, cssGradient, type ColorScale } from './colorScales';
import { DATASETS } from './datasets';
import './science.css';

type LayerKey = 'imagery' | 'elevation' | 'relief' | 'slope';
type LayerState = Record<LayerKey, { on: boolean; opacity: number }>;
type LoadStatus = 'idle' | 'loading' | 'ready' | 'partial' | 'error';

const DEFAULTS: LayerState = {
  imagery: { on: true, opacity: 1 },
  elevation: { on: true, opacity: 0.8 },
  relief: { on: false, opacity: 0.7 },
  slope: { on: false, opacity: 0.85 },
};

type DemData =
  | { state: 'loading' }
  | { state: 'unsupported' }
  | { state: 'error'; message: string }
  | { state: 'ready'; stores: [DemStore, DemStore] };

/** Tracks a Leaflet layer's tile loading. Missing tiles are reported, never filled in. */
function useLayerStatus(layer: L.GridLayer | null, active: boolean): [LoadStatus, () => void] {
  const [status, setStatus] = useState<LoadStatus>('idle');
  useEffect(() => {
    if (!layer || !active) {
      setStatus('idle');
      return undefined;
    }
    let loaded = 0;
    let failed = 0;
    const onLoading = () => {
      loaded = 0;
      failed = 0;
      setStatus('loading');
    };
    const onTile = () => {
      loaded += 1;
    };
    const onError = () => {
      failed += 1;
    };
    const onLoad = () => setStatus(failed === 0 ? 'ready' : loaded === 0 ? 'error' : 'partial');
    layer.on('loading', onLoading).on('tileload', onTile).on('tileerror', onError).on('load', onLoad);
    setStatus(layer.isLoading() ? 'loading' : 'ready');
    return () => {
      layer.off('loading', onLoading).off('tileload', onTile).off('tileerror', onError).off('load', onLoad);
    };
  }, [layer, active]);
  const retry = useCallback(() => layer?.redraw(), [layer]);
  return [status, retry];
}

export default function ScienceLayers() {
  const { map } = useMarsMap();
  const [layers, setLayers] = useState<LayerState>(DEFAULTS);
  const [dem, setDem] = useState<DemData>(() => (demSupported() ? { state: 'loading' } : { state: 'unsupported' }));
  const [demAttempt, setDemAttempt] = useState(0);
  const [zoom, setZoom] = useState(() => map.getZoom());
  const [open, setOpen] = useState(() => window.matchMedia('(min-width: 721px)').matches);

  /* --------------------------------------------------------------- data */
  useEffect(() => {
    if (!demSupported()) return undefined;
    const ctrl = new AbortController();
    setDem({ state: 'loading' });
    Promise.all(DEM_LEVEL_IDS.map((id) => loadManifest(id, ctrl.signal)))
      .then((levels) => setDem({ state: 'ready', stores: [new DemStore(levels[0]), new DemStore(levels[1])] }))
      .catch((err: Error) => !ctrl.signal.aborted && setDem({ state: 'error', message: err.message }));
    return () => ctrl.abort();
  }, [demAttempt]);

  /* ------------------------------------------------------------- layers */
  const relief = useMemo(() => createReliefLayer(), []);
  const demLayers = useMemo(() => {
    if (dem.state !== 'ready') return null;
    return { elevation: new DemLayer(dem.stores, 'elevation'), slope: new DemLayer(dem.stores, 'slope') };
  }, [dem]);
  const demLayerList = useMemo(() => (demLayers ? [demLayers.elevation, demLayers.slope] : []), [demLayers]);

  useEffect(() => ensurePanes(map), [map]);

  // Add and remove layers as they are switched on and off
  useEffect(() => {
    const wanted: Array<[L.GridLayer, boolean]> = [[relief, layers.relief.on]];
    if (demLayers) {
      wanted.push([demLayers.elevation, layers.elevation.on], [demLayers.slope, layers.slope.on]);
    }
    for (const [layer, on] of wanted) {
      if (on && !map.hasLayer(layer)) layer.addTo(map);
      if (!on && map.hasLayer(layer)) map.removeLayer(layer);
    }
  }, [map, relief, demLayers, layers.relief.on, layers.elevation.on, layers.slope.on]);

  useEffect(() => {
    relief.setOpacity(layers.relief.opacity);
    demLayers?.elevation.setOpacity(layers.elevation.opacity);
    demLayers?.slope.setOpacity(layers.slope.opacity);
  }, [relief, demLayers, layers.relief.opacity, layers.elevation.opacity, layers.slope.opacity]);

  // Imagery is owned by the map; it is shown or hidden as a whole through its pane
  useEffect(() => {
    const pane = map.getPane(IMAGERY_PANE);
    if (!pane) return;
    pane.style.display = layers.imagery.on ? '' : 'none';
    pane.style.opacity = String(layers.imagery.opacity);
  }, [map, layers.imagery.on, layers.imagery.opacity]);

  // Remove everything this module added when it unmounts
  useEffect(
    () => () => {
      [relief, demLayers?.elevation, demLayers?.slope].forEach((l) => l && map.hasLayer(l) && map.removeLayer(l));
      const pane = map.getPane(IMAGERY_PANE);
      if (pane) {
        pane.style.display = '';
        pane.style.opacity = '';
      }
    },
    [map, relief, demLayers]
  );

  useEffect(() => {
    const update = () => setZoom(map.getZoom());
    map.on('zoomend', update);
    return () => {
      map.off('zoomend', update);
    };
  }, [map]);

  const [reliefStatus, retryRelief] = useLayerStatus(relief, layers.relief.on);
  const [elevStatus, retryElev] = useLayerStatus(demLayers?.elevation ?? null, layers.elevation.on);
  const [slopeStatus, retrySlope] = useLayerStatus(demLayers?.slope ?? null, layers.slope.on);

  /* ------------------------------------------------------------ actions */
  const toggle = (key: LayerKey) =>
    setLayers((s) => {
      const next = { ...s, [key]: { ...s[key], on: !s[key].on } };
      // Elevation and slope use separate colour scales: never blend one into the other
      if (key === 'elevation' && next.elevation.on) next.slope = { ...s.slope, on: false };
      if (key === 'slope' && next.slope.on) next.elevation = { ...s.elevation, on: false };
      return next;
    });
  const setOpacity = (key: LayerKey, opacity: number) => setLayers((s) => ({ ...s, [key]: { ...s[key], opacity } }));
  const reset = () => setLayers(DEFAULTS);

  const demUnavailable =
    dem.state === 'unsupported'
      ? 'Needs a browser with DecompressionStream (Chrome 80+, Firefox 113+, Safari 16.4+).'
      : dem.state === 'error'
        ? 'MOLA data could not be loaded.'
        : null;

  const activeMode: DemMode | null = layers.slope.on ? 'slope' : layers.elevation.on ? 'elevation' : null;
  const stores = dem.state === 'ready' ? dem.stores : null;
  const store = stores ? stores[levelIndexForZoom(zoom)] : null;

  return (
    <div className="bt-sci">
      <section className={`bt-sci-panel${open ? ' is-open' : ''}`} aria-label="Map layers">
        <button
          type="button"
          className="bt-sci-panel__head"
          aria-expanded={open}
          aria-controls="bt-sci-panel-body"
          onClick={() => setOpen((o) => !o)}
        >
          <svg viewBox="0 0 20 20" aria-hidden="true">
            <path d="M10 3 2.5 7 10 11l7.5-4L10 3ZM2.5 10.5 10 14.5l7.5-4M2.5 14 10 18l7.5-4" />
          </svg>
          <span>Layers</span>
          <svg className="bt-sci-panel__chev" viewBox="0 0 20 20" aria-hidden="true">
            <path d="m6 8 4 4 4-4" />
          </svg>
        </button>

        <div id="bt-sci-panel-body" className="bt-sci-panel__body" hidden={!open}>
          <LayerRow
            label="Surface Imagery"
            detail="Viking MDIM 2.1 · CTX · HiRISE"
            state={layers.imagery}
            status="idle"
            onToggle={() => toggle('imagery')}
            onOpacity={(v) => setOpacity('imagery', v)}
          />
          <LayerRow
            label="Elevation"
            detail="MOLA MEGDR, metres above areoid"
            state={layers.elevation}
            status={dem.state === 'loading' ? 'loading' : elevStatus}
            unavailable={demUnavailable}
            onRetry={dem.state === 'error' ? () => setDemAttempt((a) => a + 1) : retryElev}
            onToggle={() => toggle('elevation')}
            onOpacity={(v) => setOpacity('elevation', v)}
          />
          <LayerRow
            label="Relief Shading"
            detail="MOLA–HRSC hillshade · 200 m"
            state={layers.relief}
            status={reliefStatus}
            onRetry={retryRelief}
            onToggle={() => toggle('relief')}
            onOpacity={(v) => setOpacity('relief', v)}
          />
          <LayerRow
            label="Slope"
            detail="Computed from MOLA MEGDR"
            state={layers.slope}
            status={dem.state === 'loading' ? 'loading' : slopeStatus}
            unavailable={demUnavailable}
            onRetry={dem.state === 'error' ? () => setDemAttempt((a) => a + 1) : retrySlope}
            onToggle={() => toggle('slope')}
            onOpacity={(v) => setOpacity('slope', v)}
          />
          <button type="button" className="bt-sci-reset" onClick={reset}>
            Reset Layers
          </button>
        </div>
      </section>

      <div className="bt-sci-bottom">
        {activeMode && store && (
          <Legend mode={activeMode} store={store} blended={layers[activeMode].opacity < 1 || layers.relief.on} />
        )}
        {stores && store && <Readout map={map} store={store} layers={demLayerList} />}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- pieces */

function LayerRow(props: {
  label: string;
  detail: string;
  state: { on: boolean; opacity: number };
  status: LoadStatus;
  unavailable?: string | null;
  onRetry?: () => void;
  onToggle(): void;
  onOpacity(v: number): void;
}) {
  const { label, detail, state, status, unavailable, onRetry, onToggle, onOpacity } = props;
  const id = `bt-sci-${label.toLowerCase().replace(/\W+/g, '-')}`;
  const disabled = Boolean(unavailable);
  const on = state.on && !disabled;
  const showRetry = onRetry && (status === 'error' || status === 'partial' || (disabled && unavailable?.includes('could not')));
  return (
    <div className={`bt-sci-row${on ? ' is-on' : ''}${disabled ? ' is-disabled' : ''}`}>
      <label className="bt-sci-row__main" htmlFor={id}>
        <input id={id} type="checkbox" checked={on} disabled={disabled} onChange={onToggle} />
        <span className="bt-sci-row__switch" aria-hidden="true" />
        <span className="bt-sci-row__text">
          <span className="bt-sci-row__label">{label}</span>
          <span className="bt-sci-row__detail">{unavailable ?? detail}</span>
        </span>
        <StatusDot status={disabled ? 'error' : on ? status : 'idle'} />
      </label>
      {showRetry && (
        <button type="button" className="bt-sci-row__retry" onClick={onRetry}>
          {status === 'partial' ? 'Some tiles failed · Retry' : 'Retry'}
        </button>
      )}
      {on && (
        <label className="bt-sci-row__opacity">
          <span className="bt-sr">{label} opacity</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={state.opacity}
            onChange={(e) => onOpacity(Number(e.target.value))}
          />
          <span className="bt-sci-row__pct" aria-hidden="true">
            {Math.round(state.opacity * 100)}%
          </span>
        </label>
      )}
    </div>
  );
}

function StatusDot({ status }: { status: LoadStatus }) {
  if (status === 'idle' || status === 'ready') return null;
  const text = { loading: 'Loading', partial: 'Some tiles failed', error: 'Unavailable' }[status];
  return (
    <span className={`bt-sci-status bt-sci-status--${status}`} role="status">
      <span className="bt-sr">{text}</span>
    </span>
  );
}

function Legend({ mode, store, blended }: { mode: DemMode; store: DemStore; blended: boolean }) {
  const scale: ColorScale = mode === 'elevation' ? ELEVATION_SCALE : SLOPE_SCALE;
  const m = store.manifest;
  const [a, b] = scale.domain;
  const dataset = DATASETS.mola;
  return (
    <figure className="bt-sci-legend" aria-label={`${mode === 'elevation' ? 'Elevation' : 'Slope'} legend`}>
      <figcaption className="bt-sci-legend__title">
        {mode === 'elevation' ? 'Elevation' : 'Slope'}
        <span className="bt-sci-legend__unit">{mode === 'elevation' ? 'km above the MOLA areoid' : 'degrees'}</span>
      </figcaption>
      <div className="bt-sci-legend__bar" style={{ background: cssGradient(scale) }} />
      <span className="bt-sr">
        Continuous colour scale from {scale.formatTick(a)} to {scale.formatTick(b)} {scale.unit}.
      </span>
      <div className="bt-sci-legend__ticks" aria-hidden="true">
        {scale.ticks.map((t) => (
          <span key={t} style={{ left: `${((t - a) / (b - a)) * 100}%` }}>
            {scale.formatTick(t)}
          </span>
        ))}
      </div>
      <p className="bt-sci-legend__note">
        {mode === 'elevation'
          ? 'Below −8 km and above +12 km drawn in the end colours.'
          : `Steeper than ${b}° drawn in the top colour. Central differences over neighbouring bins (${(2 * m.mapScaleKm).toFixed(1)} km N–S).`}
        {blended && ' Opacity below 100% or relief shading changes the colours; the readout gives exact values.'}
      </p>
      <dl className="bt-sci-legend__meta">
        <dt>Source</dt>
        <dd>
          <a href={m.source} target="_blank" rel="noreferrer">
            {dataset.shortName} {m.product}
          </a>
        </dd>
        <dt>Grid</dt>
        <dd>
          {m.pixelsPerDegree} px/deg · {m.mapScaleKm.toFixed(1)} km at equator
        </dd>
        <dt>Coverage</dt>
        <dd>Global, 90° S – 90° N</dd>
        {mode === 'elevation' && (
          <>
            <dt>Datum</dt>
            <dd>MOLA areoid (GMM3)</dd>
          </>
        )}
      </dl>
    </figure>
  );
}

/** Values of the native MEGDR bin under the cursor (or the last tap). */
function Readout({ map, store, layers }: { map: L.Map; store: DemStore; layers: L.GridLayer[] }) {
  const [here, setHere] = useState<{ lat: number; lng: number } | null>(null);
  const [bin, setBin] = useState<PointSample | null>(null);
  const frame = useRef(0);
  // Kept in screen space, so the readout follows the ground when the map moves under a still cursor
  const last = useRef<L.Point | null>(null);

  useEffect(() => {
    const run = () => {
      frame.current = 0;
      if (!last.current) return;
      const ll = map.containerPointToLatLng(last.current);
      setHere({ lat: ll.lat, lng: ll.lng });
      setBin(sampleBin(store, ll.lat, ll.lng));
    };
    const schedule = () => {
      if (last.current && !frame.current) frame.current = requestAnimationFrame(run);
    };
    const onMove = (e: L.LeafletMouseEvent) => {
      last.current = e.containerPoint;
      schedule();
    };
    const onOut = () => {
      last.current = null;
      setHere(null);
    };
    map.on('mousemove', onMove).on('click', onMove).on('mouseout', onOut).on('move', schedule);
    // Data that finishes loading under a still cursor
    layers.forEach((l) => l.on('tileload', schedule));
    run();
    return () => {
      map.off('mousemove', onMove).off('click', onMove).off('mouseout', onOut).off('move', schedule);
      layers.forEach((l) => l.off('tileload', schedule));
      cancelAnimationFrame(frame.current);
      frame.current = 0;
    };
  }, [map, store, layers]);

  if (!here) return null;
  const lat = here.lat;
  const lon = ((((here.lng + 180) % 360) + 360) % 360) - 180;
  return (
    <div className="bt-sci-readout" aria-live="off">
      <span>
        {Math.abs(lat).toFixed(3)}° {lat >= 0 ? 'N' : 'S'} · {Math.abs(lon).toFixed(3)}° {lon >= 0 ? 'E' : 'W'}
      </span>
      {bin ? (
        <>
          <span>
            <b>{bin.elevation.toLocaleString('en-US').replace('-', '−')} m</b> elevation
          </span>
          <span>
            <b>{Number.isNaN(bin.slope) ? '—' : `${bin.slope.toFixed(1)}°`}</b> slope
          </span>
        </>
      ) : (
        <span className="bt-sci-readout__muted">MOLA bin not loaded</span>
      )}
    </div>
  );
}
