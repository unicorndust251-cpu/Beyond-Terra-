import { Suspense, lazy, useCallback, useEffect, useMemo, useState } from 'react';
import type * as L from 'leaflet';
import { useMarsMap } from '../map/MarsMapContext';
import { HOME_CENTER, IMAGERY_PANE, TREK_LAYERS, jezeroOrbitZoom } from '../map/marsTrek';
import { DEM_LEVEL_IDS, DemStore, demSupported, loadManifest } from './molaDem';
import {
  CTX_GLOBAL,
  DemLayer,
  GEOLOGY_TILES,
  RELIEF_INTENSITY,
  ReliefLayer,
  createCtxGlobalLayer,
  createGeologyLayer,
  ctxGlobalOpacityAt,
  ensurePanes,
  metresPerPixel,
  prefetchRelief,
  type DemMode,
} from './layers';
import LocationSearch from './LocationSearch';
import TopBar, { type StatusItem } from './workspace/TopBar';
import LayersMenu, { type LayerItem, type LoadStatus } from './workspace/LayersMenu';
import MapLegend from './workspace/MapLegend';
import './workspace/workspace.css';
import './science.css';

// Loaded the first time the Curvature layer is switched on
const CurvatureLayer = lazy(() => import('./curvature/CurvatureLayer'));
// Loaded the first time the Geology layer is switched on
const GeologyLegend = lazy(() => import('./geology/GeologyLegend'));

type LayerKey = 'imagery' | 'elevation' | 'relief' | 'slope' | 'geology' | 'curvature';
/** `amount` is opacity (0…1), except for relief, where it is the shading intensity (unused for curvature). */
type LayerState = Record<LayerKey, { on: boolean; amount: number }>;

/** Coloured data surfaces: one at a time, each with its own key. */
const SURFACES: LayerKey[] = ['elevation', 'slope', 'geology'];

// The map opens on the imagery itself. Elevation, slope and geology are one switch away,
// at full opacity so their colours match their legends; the elevation value under the
// cursor is in the information card either way.
const DEFAULTS: LayerState = {
  imagery: { on: true, amount: 1 },
  elevation: { on: false, amount: 1 },
  relief: { on: false, amount: RELIEF_INTENSITY.default },
  slope: { on: false, amount: 1 },
  geology: { on: false, amount: 0.85 },
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
  const { map, status: mapStatus } = useMarsMap();
  const [layers, setLayers] = useState<LayerState>(DEFAULTS);
  const [dem, setDem] = useState<DemData>(() => (demSupported() ? { state: 'loading' } : { state: 'unsupported' }));
  const [demAttempt, setDemAttempt] = useState(0);
  const [zoom, setZoom] = useState(() => map.getZoom());

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
  const geology = useMemo(() => createGeologyLayer(), []);
  const ctxGlobal = useMemo(() => createCtxGlobalLayer(), []);
  const demLayers = useMemo(() => {
    if (dem.state !== 'ready') return null;
    return { elevation: new DemLayer(dem.stores, 'elevation'), slope: new DemLayer(dem.stores, 'slope') };
  }, [dem]);

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
    const wanted: Array<[L.GridLayer, boolean]> = [
      [relief, layers.relief.on && inFocus],
      [geology, layers.geology.on && inFocus],
    ];
    if (demLayers) {
      wanted.push([demLayers.elevation, layers.elevation.on], [demLayers.slope, layers.slope.on]);
    }
    for (const [layer, on] of wanted) {
      if (on && !map.hasLayer(layer)) layer.addTo(map);
      if (!on && map.hasLayer(layer)) map.removeLayer(layer);
    }
  }, [map, relief, geology, demLayers, layers.relief.on, layers.geology.on, layers.elevation.on, layers.slope.on, inFocus]);

  useEffect(() => {
    relief.setIntensity(layers.relief.amount);
    geology.setOpacity(layers.geology.amount);
    demLayers?.elevation.setOpacity(layers.elevation.amount);
    demLayers?.slope.setOpacity(layers.slope.amount);
  }, [relief, geology, demLayers, layers.relief.amount, layers.geology.amount, layers.elevation.amount, layers.slope.amount]);

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
    !layers.imagery.on || SURFACES.some((k) => layers[k].on && layers[k].amount >= 1);
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
      [relief, geology, demLayers?.elevation, demLayers?.slope].forEach((l) => l && map.hasLayer(l) && map.removeLayer(l));
      const pane = map.getPane(IMAGERY_PANE);
      if (pane) {
        pane.style.display = '';
        pane.style.opacity = '';
      }
    },
    [map, relief, geology, demLayers]
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
  const [geologyStatus, retryGeology] = useLayerStatus(geology, layers.geology.on);
  const [elevStatus, retryElev] = useLayerStatus(demLayers?.elevation ?? null, layers.elevation.on);
  const [slopeStatus, retrySlope] = useLayerStatus(demLayers?.slope ?? null, layers.slope.on);

  /* ------------------------------------------------------------ actions */
  const toggle = (key: LayerKey) =>
    setLayers((s) => {
      const next = { ...s, [key]: { ...s[key], on: !s[key].on } };
      // Elevation, slope and geology have separate colour keys: never blend one into another
      if (SURFACES.includes(key) && next[key].on) {
        for (const other of SURFACES) if (other !== key) next[other] = { ...s[other], on: false };
      }
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

  const activeMode: DemMode | null = layers.slope.on && dem.state === 'ready' ? 'slope' : layers.elevation.on && dem.state === 'ready' ? 'elevation' : null;

  const showCtxCredit = !imageryHidden && ctxGlobalOpacityAt(zoom) > 0.02;

  const statuses: StatusItem[] = [
    { label: 'Imagery', status: mapStatus === 'error' ? 'error' : mapStatus === 'loading' ? 'loading' : 'ready', detail: 'NASA Mars Trek imagery tiles.' },
    {
      label: 'MOLA elevation',
      status: dem.state === 'ready' ? 'ready' : dem.state === 'loading' ? 'loading' : 'error',
      detail: 'MOLA MEGDR elevation data, bundled with the site.',
    },
  ];
  if (layers.relief.on) statuses.push({ label: 'Topography', status: asStatus(reliefStatus), detail: 'Trek MOLA–HRSC hillshade tiles.' });
  if (layers.geology.on) statuses.push({ label: 'Geology', status: asStatus(geologyStatus), detail: 'USGS SIM 3292 tiles from Trek.' });

  const demRetry = dem.state === 'error' ? () => setDemAttempt((a) => a + 1) : undefined;
  const items: LayerItem[] = [
    {
      key: 'imagery',
      label: 'Standard Imagery',
      group: 'Surface',
      ...layers.imagery,
      status: 'idle',
      onToggle: () => toggle('imagery'),
      onAmount: (v) => setAmount('imagery', v),
      info: {
        text: 'Visible-light mosaics: Viking colour globally, the CTX mosaic as you zoom in, and HiRISE and CTX mosaics at Jezero.',
        resolution: 'Viking 326 m/px · CTX 5 m/px · HiRISE 0.3 m/px',
        source: { name: 'NASA Mars Trek', url: 'https://trek.nasa.gov/mars/' },
      },
    },
    {
      key: 'elevation',
      label: 'Elevation',
      group: 'Terrain',
      ...layers.elevation,
      status: dem.state === 'loading' ? 'loading' : elevStatus,
      unavailable: demUnavailable,
      onRetry: demRetry ?? retryElev,
      onToggle: () => toggle('elevation'),
      onAmount: (v) => setAmount('elevation', v),
      info: {
        text: 'Height above the MOLA areoid from laser altimetry, coloured from −8 to +16 km.',
        resolution: '3.7 km bins (16 px/deg)',
        source: { name: 'MGS MOLA MEGDR, NASA PDS', url: 'https://pds-geosciences.wustl.edu/mgs/mgs-m-mola-5-megdr-l3-v1/mgsl_300x/meg016/' },
      },
    },
    {
      key: 'relief',
      label: 'Topography',
      group: 'Terrain',
      ...layers.relief,
      status: reliefStatus,
      onRetry: retryRelief,
      onToggle: () => toggle('relief'),
      onAmount: (v) => setAmount('relief', v),
      slider: { name: 'Intensity', ...RELIEF_INTENSITY, step: 0.25 },
      info: {
        text: 'Relief shading from a MOLA–HRSC elevation model. Visual only: it shows shape, not steepness.',
        resolution: '200 m/px',
        source: { name: 'NASA Mars Trek', url: 'https://trek.nasa.gov/mars/' },
      },
    },
    {
      key: 'slope',
      label: 'Slope',
      group: 'Terrain',
      ...layers.slope,
      status: dem.state === 'loading' ? 'loading' : slopeStatus,
      unavailable: demUnavailable,
      onRetry: demRetry ?? retrySlope,
      onToggle: () => toggle('slope'),
      onAmount: (v) => setAmount('slope', v),
      info: {
        text: 'Steepness in degrees, calculated from MOLA elevations with true ground distances. Too coarse to show rocks or local obstacles.',
        resolution: 'Measured over 7.4 km',
        source: { name: 'Calculated from MGS MOLA MEGDR', url: 'https://pds-geosciences.wustl.edu/mgs/mgs-m-mola-5-megdr-l3-v1/mgsl_300x/meg016/' },
      },
    },
    {
      key: 'geology',
      label: 'Geological Information',
      group: 'Science',
      ...layers.geology,
      status: geologyStatus,
      onRetry: retryGeology,
      onToggle: () => toggle('geology'),
      onAmount: (v) => setAmount('geology', v),
      info: {
        text: 'Geologic units of the USGS Geologic Map of Mars. Colours identify mapped units and age assignments, not elevation, curvature, mineral concentration or hazard severity.',
        resolution: 'Mapped at 1:20,000,000',
        source: { name: 'USGS SIM 3292 via NASA Mars Trek', url: 'https://pubs.usgs.gov/sim/3292/' },
      },
    },
    {
      key: 'curvature',
      label: 'Curvature Sites',
      group: 'Science',
      ...layers.curvature,
      status: 'idle',
      onToggle: () => toggle('curvature'),
      onAmount: () => undefined,
      slider: false,
      swatch: <span className="bt-layer__swatch" aria-hidden="true" />,
      info: {
        text: 'Eighteen places whose landforms suit a terrain-curvature study. Markers are reference points; no curvature has been calculated.',
        resolution: 'Reference positions',
        source: { name: 'IAU Gazetteer, NASA, ESA, Mars Odyssey THEMIS', url: 'https://planetarynames.wr.usgs.gov/' },
      },
    },
  ];

  return (
    <div className="bt-sci">
      <TopBar map={map} search={<LocationSearch />} statuses={statuses} />

      <div className="bt-sci-top">
        <LayersMenu items={items} onReset={reset} footer={<ViewResolution zoom={zoom} center={center} layers={layers} />} />
        {layers.curvature.on && (
          <Suspense fallback={null}>
            <CurvatureLayer />
          </Suspense>
        )}
      </div>

      {layers.geology.on && (
        <Suspense fallback={null}>
          <GeologyLegend />
        </Suspense>
      )}

      <div className="bt-sci-bottom">
        {activeMode && <MapLegend mode={activeMode} blended={activeMode ? layers[activeMode].amount < 1 || layers.relief.on : false} />}
        {(showCtxCredit || layers.geology.on) && (
          <p className="bt-sci-credit">{[showCtxCredit && CTX_GLOBAL.credit, layers.geology.on && GEOLOGY_TILES.credit].filter(Boolean).join(' · ')}</p>
        )}
      </div>
    </div>
  );
}

function asStatus(s: LoadStatus): StatusItem['status'] {
  return s === 'idle' ? 'ready' : s;
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
