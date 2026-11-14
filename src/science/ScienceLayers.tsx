import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type * as L from 'leaflet';
import { useMarsMap } from '../map/MarsMapContext';
import { HOME_CENTER, IMAGERY_PANE, TREK_LAYERS, jezeroOrbitZoom } from '../map/marsTrek';
import { DEM_LEVEL_IDS, DemStore, demSupported, loadManifest, sampleBin, type PointSample } from './molaDem';
import {
  CTX_GLOBAL,
  DemLayer,
  RELIEF_INTENSITY,
  ReliefLayer,
  createCtxGlobalLayer,
  ctxGlobalOpacityAt,
  ensurePanes,
  levelIndexForZoom,
  metresPerPixel,
  prefetchRelief,
  type DemMode,
} from './layers';
import { ELEVATION_SCALE, SLOPE_SCALE, cssGradient, legendPercent, type ColorScale } from './colorScales';
import { DATASETS } from './datasets';
import LocationSearch from './LocationSearch';
import './science.css';

// Loaded the first time the Curvature layer is switched on
const CurvatureLayer = lazy(() => import('./curvature/CurvatureLayer'));

type LayerKey = 'imagery' | 'elevation' | 'relief' | 'slope' | 'curvature';
/** `amount` is opacity (0…1), except for relief, where it is the shading intensity (unused for curvature). */
type LayerState = Record<LayerKey, { on: boolean; amount: number }>;
type LoadStatus = 'idle' | 'loading' | 'ready' | 'partial' | 'error';

// Elevation opens at full opacity: its colours are then exactly the legend's (on flat
// ground; relief shades slopes), and the 3.7 km MEGDR does not wash over sharper imagery.
const DEFAULTS: LayerState = {
  imagery: { on: true, amount: 1 },
  elevation: { on: true, amount: 1 },
  relief: { on: true, amount: RELIEF_INTENSITY.default },
  slope: { on: false, amount: 0.85 },
  curvature: { on: false, amount: 1 },
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
  const relief = useMemo(() => new ReliefLayer(), []);
  const ctxGlobal = useMemo(() => createCtxGlobalLayer(), []);
  const demLayers = useMemo(() => {
    if (dem.state !== 'ready') return null;
    return { elevation: new DemLayer(dem.stores, 'elevation'), slope: new DemLayer(dem.stores, 'slope') };
  }, [dem]);
  const demLayerList = useMemo(() => (demLayers ? [demLayers.elevation, demLayers.slope] : []), [demLayers]);

  useEffect(() => ensurePanes(map), [map]);

  // The map mounts blurred, high above the planet, while the globe is still on screen.
  // Trek relief tiles wait until it is in focus: requested earlier, they only queue ahead
  // of the tiles of the view the descent lands on (Trek answers about one tile a second).
  const [inFocus, setInFocus] = useState(false);
  useEffect(() => {
    const root = map.getContainer().closest('.bt-map');
    if (!root) {
      setInFocus(true);
      return undefined;
    }
    const check = () => setInFocus(!root.classList.contains('bt-map--blurred'));
    check();
    // Still blurred: the descent will land on the opening view, so fetch its relief now
    if (root.classList.contains('bt-map--blurred')) prefetchRelief(map, HOME_CENTER, jezeroOrbitZoom(map));
    const obs = new MutationObserver(check);
    obs.observe(root, { attributes: true, attributeFilter: ['class'] });
    return () => obs.disconnect();
  }, [map]);

  // Add and remove layers as they are switched on and off
  useEffect(() => {
    const wanted: Array<[L.GridLayer, boolean]> = [[relief, layers.relief.on && inFocus]];
    if (demLayers) {
      wanted.push([demLayers.elevation, layers.elevation.on], [demLayers.slope, layers.slope.on]);
    }
    for (const [layer, on] of wanted) {
      if (on && !map.hasLayer(layer)) layer.addTo(map);
      if (!on && map.hasLayer(layer)) map.removeLayer(layer);
    }
  }, [map, relief, demLayers, layers.relief.on, layers.elevation.on, layers.slope.on, inFocus]);

  useEffect(() => {
    relief.setIntensity(layers.relief.amount);
    demLayers?.elevation.setOpacity(layers.elevation.amount);
    demLayers?.slope.setOpacity(layers.slope.amount);
  }, [relief, demLayers, layers.relief.amount, layers.elevation.amount, layers.slope.amount]);

  // Imagery is owned by the map; it is shown or hidden as a whole through its pane
  useEffect(() => {
    const pane = map.getPane(IMAGERY_PANE);
    if (!pane) return;
    pane.style.display = layers.imagery.on ? '' : 'none';
    pane.style.opacity = String(layers.imagery.amount);
  }, [map, layers.imagery.on, layers.imagery.amount]);

  // Global CTX (5 m/px) joins the imagery, taking over from Viking (326 m/px at Trek's
  // deepest level) as you zoom in. Not requested while fully hidden under elevation or slope.
  const imageryHidden =
    !layers.imagery.on || (layers.elevation.on && layers.elevation.amount >= 1) || (layers.slope.on && layers.slope.amount >= 1);
  useEffect(() => {
    if (imageryHidden) return undefined;
    ctxGlobal.addTo(map);
    const fade = () => ctxGlobal.setOpacity(ctxGlobalOpacityAt(map.getZoom()));
    fade();
    map.on('zoom', fade);
    return () => {
      map.off('zoom', fade);
      ctxGlobal.remove();
    };
  }, [map, ctxGlobal, imageryHidden]);

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

  const [center, setCenter] = useState(() => map.getCenter());
  useEffect(() => {
    const update = () => {
      setZoom(map.getZoom());
      setCenter(map.getCenter());
    };
    map.on('zoomend moveend', update);
    return () => {
      map.off('zoomend moveend', update);
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
  const setAmount = (key: LayerKey, amount: number) => setLayers((s) => ({ ...s, [key]: { ...s[key], amount } }));
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

  const showCtxCredit = !imageryHidden && ctxGlobalOpacityAt(zoom) > 0.02;

  return (
    <div className="bt-sci">
      <div className="bt-sci-top">
      <LocationSearch />
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
            detail="Viking · CTX global 5 m · Jezero HiRISE"
            state={layers.imagery}
            status="idle"
            onToggle={() => toggle('imagery')}
            onAmount={(v) => setAmount('imagery', v)}
          />
          <LayerRow
            label="Elevation"
            detail="MOLA MEGDR, km above areoid"
            state={layers.elevation}
            status={dem.state === 'loading' ? 'loading' : elevStatus}
            unavailable={demUnavailable}
            onRetry={dem.state === 'error' ? () => setDemAttempt((a) => a + 1) : retryElev}
            onToggle={() => toggle('elevation')}
            onAmount={(v) => setAmount('elevation', v)}
          />
          <LayerRow
            label="Relief Shading"
            detail="MOLA–HRSC hillshade · 200 m · visual only"
            state={layers.relief}
            status={reliefStatus}
            onRetry={retryRelief}
            onToggle={() => toggle('relief')}
            onAmount={(v) => setAmount('relief', v)}
            slider={{ name: 'intensity', ...RELIEF_INTENSITY, step: 0.25 }}
          />
          <LayerRow
            label="Slope"
            detail="Computed from MOLA MEGDR"
            state={layers.slope}
            status={dem.state === 'loading' ? 'loading' : slopeStatus}
            unavailable={demUnavailable}
            onRetry={dem.state === 'error' ? () => setDemAttempt((a) => a + 1) : retrySlope}
            onToggle={() => toggle('slope')}
            onAmount={(v) => setAmount('slope', v)}
          />
          <LayerRow
            label="Curvature"
            detail="Investigation sites · not measured"
            state={layers.curvature}
            status="idle"
            onToggle={() => toggle('curvature')}
            onAmount={() => undefined}
            slider={false}
            indicator={<span className="bt-sci-row__swatch bt-sci-row__swatch--curvature" aria-hidden="true" />}
          />
          <ViewResolution zoom={zoom} center={center} layers={layers} />
          <button type="button" className="bt-sci-reset" onClick={reset}>
            Reset Layers
          </button>
        </div>
      </section>
      {layers.curvature.on && (
        <Suspense fallback={null}>
          <CurvatureLayer />
        </Suspense>
      )}
      </div>

      <div className="bt-sci-bottom">
        {activeMode && store && (
          <Legend mode={activeMode} store={store} blended={layers[activeMode].amount < 1 || layers.relief.on} />
        )}
        {stores && store && <Readout map={map} store={store} layers={demLayerList} />}
        {showCtxCredit && <p className="bt-sci-credit">{CTX_GLOBAL.credit}</p>}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- pieces */

/**
 * How fine the view is against the source actually on top at its centre, so blur from
 * magnifying coarse data is explained rather than hidden. Resolutions are what each
 * service delivers at its deepest tile level, not the instruments' nominal figures.
 */
function ViewResolution({ zoom, center, layers }: { zoom: number; center: L.LatLng; layers: LayerState }) {
  const screen = metresPerPixel(zoom);
  let best: { name: string; m: number } | undefined;
  if (layers.imagery.on && !(layers.elevation.on && layers.elevation.amount >= 1) && !layers.slope.on) {
    // Top-most first: the map's regional Jezero mosaics where the centre lies inside them
    const lng = ((((center.lng + 180) % 360) + 360) % 360) - 180;
    const regional = [...TREK_LAYERS]
      .filter((d) => d.bounds)
      .sort((a, b) => b.zIndex - a.zIndex)
      .find((d) => {
        const [[s, w], [n, e]] = d.bounds!;
        return center.lat >= s && center.lat <= n && lng >= w && lng <= e && zoom >= (d.fadeIn?.[1] ?? d.minZoom ?? 0);
      });
    if (regional) {
      best = { name: regional.key.startsWith('hirise') ? 'HiRISE' : 'CTX Jezero', m: metresPerPixel(regional.maxNativeZoom) };
    } else if (ctxGlobalOpacityAt(zoom) >= 0.99) {
      best = { name: 'CTX global', m: CTX_GLOBAL.metresPerPixel };
    } else {
      best = { name: 'Viking', m: metresPerPixel(7) };
    }
  } else if (layers.relief.on) {
    best = { name: 'Relief', m: 200 };
  } else if (layers.elevation.on || layers.slope.on) {
    best = { name: 'MOLA', m: 3705 };
  }
  const fmt = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(1)} km` : m >= 10 ? `${Math.round(m)} m` : `${m.toFixed(m < 1 ? 2 : 1)} m`);
  const magnified = best ? best.m / screen : 0;
  return (
    <p className="bt-sci-res" title="Metres per screen pixel, against the finest data under the centre of the view">
      View {fmt(screen)}/px
      {best && (
        <>
          {' · '}
          {best.name} {fmt(best.m)}/px
          {magnified > 1.5 && <span className="bt-sci-res__warn"> · magnified {magnified.toFixed(magnified < 10 ? 1 : 0)}×</span>}
        </>
      )}
    </p>
  );
}

function LayerRow(props: {
  label: string;
  detail: string;
  state: { on: boolean; amount: number };
  status: LoadStatus;
  unavailable?: string | null;
  onRetry?: () => void;
  onToggle(): void;
  onAmount(v: number): void;
  /** Defaults to an opacity slider, 0–100 %; false for a layer without one */
  slider?: { name: string; min: number; max: number; step: number } | false;
  /** Small swatch after the label, e.g. a layer's marker colour */
  indicator?: ReactNode;
}) {
  const { label, detail, state, status, unavailable, onRetry, onToggle, onAmount, indicator } = props;
  const slider = props.slider === false ? null : props.slider ?? { name: 'opacity', min: 0, max: 1, step: 0.05 };
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
          <span className="bt-sci-row__label">
            {label}
            {indicator}
          </span>
          <span className="bt-sci-row__detail">{unavailable ?? detail}</span>
        </span>
        <StatusDot status={disabled ? 'error' : on ? status : 'idle'} />
      </label>
      {showRetry && (
        <button type="button" className="bt-sci-row__retry" onClick={onRetry}>
          {status === 'partial' ? 'Some tiles failed · Retry' : 'Retry'}
        </button>
      )}
      {on && slider && (
        <label className="bt-sci-row__opacity">
          <span className="bt-sci-row__slider-name">{slider.name === 'opacity' ? 'Opacity' : 'Intensity'}</span>
          <span className="bt-sr">{label}</span>
          <input
            type="range"
            min={slider.min}
            max={slider.max}
            step={slider.step}
            value={state.amount}
            onChange={(e) => onAmount(Number(e.target.value))}
          />
          <span className="bt-sci-row__pct" aria-hidden="true">
            {slider.name === 'opacity' ? `${Math.round(state.amount * 100)}%` : `${state.amount.toFixed(2).replace(/0$/, '')}×`}
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
          <span key={t} style={{ left: `${legendPercent(scale, t)}%` }}>
            {scale.formatTick(t)}
          </span>
        ))}
      </div>
      <p className="bt-sci-legend__note">
        {mode === 'elevation'
          ? `Data ${(m.min / 1000).toFixed(2).replace('-', '−')} to +${(m.max / 1000).toFixed(2)} km; beyond −8 / +16 km in the end colours.`
          : `Steeper than ${b}° in the top colour. Baseline ${(2 * m.mapScaleKm).toFixed(1)} km N–S.`}
        {blended && (
          <span title="Opacity below 100% mixes in the imagery. Relief shading darkens and lightens slopes but leaves flat ground unchanged; it is visual, not a measure of steepness.">
            {' '}
            Shading and opacity alter colours on screen; the readout is exact.
          </span>
        )}
      </p>
      <p className="bt-sci-legend__meta">
        <a href={m.source} target="_blank" rel="noreferrer">
          {dataset.shortName} {m.product.replace('.IMG', '')}
        </a>
        {' · '}
        {m.pixelsPerDegree} px/deg ({m.mapScaleKm.toFixed(1)} km) · global
        {mode === 'elevation' && ' · MOLA areoid datum'}
      </p>
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
            <b>{(bin.elevation / 1000).toFixed(3).replace('-', '−')} km</b> elevation
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
