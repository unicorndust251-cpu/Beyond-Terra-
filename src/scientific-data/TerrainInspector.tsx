import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { selectedLocationStore, useMapBridge, useSelectedLocation, type MapOverlayHandle } from '../shared';
import { ANCHORS } from './anchors';
import { describeCoordinate, parseCoordinate, type LatitudeSystem, type LongitudeConvention } from './coordinateInput';
import { GEOLOGIC_MAP, JEZERO_CTX_DTM, MOLA_MEGDR } from './datasets';
import {
  DATASET_LINKS,
  STATUS_LABEL,
  inspectTerrain,
  type ElevationReading,
  type Reading,
  type ReliefReading,
  type SlopeReading,
  type TerrainInspection,
} from './terrain';
import './inspector.css';

const MARKER_ID = 'sd:inspect';

/**
 * Inspect the terrain at a point: by clicking the map, typing coordinates or picking a
 * reference point. Values come from numerical datasets only; each reading says whether it
 * is available, unavailable, not mapped, outside coverage or not assessed.
 */
export default function TerrainInspector() {
  const bridge = useMapBridge();
  const selected = useSelectedLocation();
  const [open, setOpen] = useState(() => window.matchMedia('(min-width: 721px)').matches);
  const [result, setResult] = useState<TerrainInspection | null>(null);
  const [loading, setLoading] = useState(false);
  const [label, setLabel] = useState<string | undefined>();
  const request = useRef(0);
  const marker = useRef<MapOverlayHandle | null>(null);

  // Whatever picks a location (map click, entry, reference point, search), inspect it
  useEffect(() => {
    if (!selected) return;
    const id = ++request.current;
    setLoading(true);
    setLabel(selected.name);
    setOpen(true);
    inspectTerrain(selected.coordinate).then((r) => {
      if (id !== request.current) return;
      setResult(r);
      setLoading(false);
    });
    if (bridge) marker.current = bridge.addMarker(MARKER_ID, selected.coordinate, { label: selected.name ?? 'Inspected point', color: '#e8c2ad' });
  }, [selected, bridge]);

  useEffect(() => () => marker.current?.remove(), []);

  const clear = () => {
    request.current++;
    setResult(null);
    setLoading(false);
    marker.current?.remove();
    marker.current = null;
  };

  return (
    <section className={`sd-inspect${open ? ' is-open' : ''}`} aria-label="Terrain inspection">
      <button type="button" className="sd-inspect__head" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <circle cx="10" cy="10" r="6" />
          <path d="M10 1.5v4M10 14.5v4M1.5 10h4M14.5 10h4" />
        </svg>
        <span>Inspect terrain</span>
        <svg className="sd-inspect__chev" viewBox="0 0 20 20" aria-hidden="true">
          <path d="m6 8 4 4 4-4" />
        </svg>
      </button>
      {open && (
        <div className="sd-inspect__body">
          <PickPoint bridgeReady={Boolean(bridge)} />
          {loading && (
            <p className="sd-inspect__loading" role="status">
              Reading the datasets…
            </p>
          )}
          {result && !loading && <Results r={result} label={label} onClear={clear} />}
        </div>
      )}
    </section>
  );
}

/* ----------------------------------------------------------------- inputs */

function PickPoint({ bridgeReady }: { bridgeReady: boolean }) {
  const bridge = useMapBridge();
  const [lat, setLat] = useState('');
  const [lon, setLon] = useState('');
  const [lonConv, setLonConv] = useState<LongitudeConvention>('east-360');
  const [latSys, setLatSys] = useState<LatitudeSystem>('planetocentric');
  const [error, setError] = useState<string | null>(null);
  const uid = useId();

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const p = parseCoordinate(lat, lon, lonConv, latSys);
    if (!p.ok) return setError(p.error);
    setError(null);
    selectedLocationStore.set({ coordinate: p.coordinate, source: 'manual' });
    bridge?.flyTo(p.coordinate, { zoom: Math.max(bridge.getView().zoom, 8) });
  };

  const pickAnchor = (id: string) => {
    const a = ANCHORS.find((x) => x.id === id);
    if (!a) return;
    selectedLocationStore.set({ coordinate: a.coordinate, name: a.name, source: 'scientific-layer' });
    bridge?.flyTo(a.coordinate, { zoom: a.zoom });
  };

  return (
    <div className="sd-pick">
      <label className="sd-field">
        <span>Reference point</span>
        <select value="" onChange={(e) => pickAnchor(e.target.value)} disabled={!bridgeReady}>
          <option value="" disabled>
            Choose a place…
          </option>
          {(['Jezero and Perseverance', 'Other regions'] as const).map((g) => (
            <optgroup key={g} label={g}>
              {ANCHORS.filter((a) => a.group === g).map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} · {a.type}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>

      <form className="sd-coords" onSubmit={submit} noValidate>
        <div className="sd-coords__row">
          <label className="sd-field">
            <span>Latitude</span>
            <input value={lat} onChange={(e) => setLat(e.target.value)} placeholder="18.4446" inputMode="decimal" aria-describedby={`${uid}-err`} />
          </label>
          <label className="sd-field">
            <span>Longitude</span>
            <input value={lon} onChange={(e) => setLon(e.target.value)} placeholder="77.4509" inputMode="decimal" aria-describedby={`${uid}-err`} />
          </label>
        </div>
        <div className="sd-coords__row">
          <label className="sd-field">
            <span>Longitude as</span>
            <select value={lonConv} onChange={(e) => setLonConv(e.target.value as LongitudeConvention)}>
              <option value="east-360">East 0…360°</option>
              <option value="east-180">East −180…180°</option>
              <option value="west-360">West 0…360°</option>
            </select>
          </label>
          <label className="sd-field">
            <span>Latitude as</span>
            <select value={latSys} onChange={(e) => setLatSys(e.target.value as LatitudeSystem)}>
              <option value="planetocentric">Planetocentric</option>
              <option value="planetographic">Planetographic</option>
            </select>
          </label>
        </div>
        <button type="submit" className="sd-btn" disabled={!bridgeReady}>
          Inspect coordinates
        </button>
        {error && (
          <p id={`${uid}-err`} className="sd-error" role="alert">
            {error}
          </p>
        )}
      </form>
      <p className="sd-hint">Or click anywhere on the map.</p>
    </div>
  );
}

/* ---------------------------------------------------------------- results */

const km = (m: number) => `${(m / 1000).toFixed(3).replace('-', '−')} km`;
const metres = (m: number) => `${m >= 0 ? '' : '−'}${Math.abs(m).toFixed(m < 100 && m > -100 ? 1 : 0)} m`;

function Results({ r, label, onClear }: { r: TerrainInspection; label?: string; onClear(): void }) {
  const d = describeCoordinate(r.coordinate);
  return (
    <div className="sd-results" aria-live="polite">
      <div className="sd-results__point">
        <div>
          {label && <p className="sd-results__name">{label}</p>}
          <p className="sd-results__coord">
            {d.lat} · {d.east360}
          </p>
          <p className="sd-results__alt">
            {d.east180} · {d.west360} · planetocentric
          </p>
        </div>
        <button type="button" className="sd-link" onClick={onClear}>
          Clear
        </button>
      </div>

      <Group title="Local terrain" source={`Jezero CTX DTM · ${JEZERO_CTX_DTM.resolution.value} m`} href={DATASET_LINKS.jezeroDtm}>
        <Row name="Elevation" reading={r.local.elevation} render={(v: ElevationReading) => [km(v.metres), v.method]} />
        <Row name="Slope" reading={r.local.slope} render={(v: SlopeReading) => [`${v.degrees.toFixed(1)}°`, `over ${v.baselineM} m`]} />
        <Row name="Relief" reading={r.local.relief} render={reliefText} />
      </Group>

      <Group title="Regional terrain" source={`MOLA MEGDR · 3.7 km bins`} href={DATASET_LINKS.megdr}>
        <Row name="Elevation" reading={r.regional.elevation} render={(v: ElevationReading) => [km(v.metres), v.method]} />
        <Row name="MOLA shots" reading={r.regional.shots} render={(v: string) => [v, 'laser measurements in the bin']} />
        <Row name="Slope" reading={r.regional.slope} render={(v: SlopeReading) => [`${v.degrees.toFixed(1)}°`, `over ${(v.baselineM / 1000).toFixed(1)} km`]} />
        <Row name="Relief" reading={r.regional.relief} render={reliefText} />
      </Group>

      <Group title="Mapped geology" source="USGS SIM 3292 · 1:20 M" href={DATASET_LINKS.geology}>
        <Row name="Unit" reading={r.geology} render={(v) => [v.code, v.description]} />
        <p className="sd-caveat">{GEOLOGIC_MAP.limitations[1]}</p>
      </Group>

      <Group title="Rocks and small obstacles">
        <Row name="Boulders, rocks" reading={r.smallObstacles} render={() => ['', '']} />
      </Group>

      <p className="sd-datum">
        Elevations: metres above the MOLA areoid (both DEMs). {MOLA_MEGDR.limitations[0]}
      </p>
    </div>
  );
}

function reliefText(v: ReliefReading): [string, string] {
  const w = v.windowM >= 1000 ? `${(v.windowM / 1000).toFixed(1)} km` : `${v.windowM} m`;
  const rel = v.offsetFromMeanM >= 0 ? 'above' : 'below';
  return [`${metres(v.rangeM)} range`, `in a ${w} square; this point is ${metres(Math.abs(v.offsetFromMeanM))} ${rel} its mean`];
}

function Group({ title, source, href, children }: { title: string; source?: string; href?: string; children: ReactNode }) {
  return (
    <section className="sd-group">
      <h3>
        {title}
        {source && href && (
          <a href={href} target="_blank" rel="noreferrer">
            {source}
          </a>
        )}
      </h3>
      <dl>{children}</dl>
    </section>
  );
}

function Row<T>({ name, reading, render }: { name: string; reading: Reading<T>; render(v: T): [string, string] }) {
  const ok = reading.status === 'available' && reading.value !== undefined;
  const [value, detail] = ok ? render(reading.value as T) : ['', ''];
  return (
    <div className={`sd-row sd-row--${reading.status}`}>
      <dt>{name}</dt>
      <dd>
        {ok ? (
          <>
            <span className="sd-row__value">{value}</span>
            {detail && <span className="sd-row__detail">{detail}</span>}
          </>
        ) : (
          <span className={`sd-chip sd-chip--${reading.status}`}>{STATUS_LABEL[reading.status]}</span>
        )}
        {reading.note && <span className="sd-row__note">{reading.note}</span>}
      </dd>
    </div>
  );
}
