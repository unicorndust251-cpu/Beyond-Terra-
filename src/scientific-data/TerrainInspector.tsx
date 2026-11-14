import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useMapBridge, useSelectedLocation, type MapOverlayHandle } from '../shared';
import { describeCoordinate } from './coordinateInput';
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
import { formatElevation, formatLatitude, formatLongitude, useDisplaySettings } from '../science/workspace/uiState';
import './inspector.css';

const MARKER_ID = 'sd:inspect';

/**
 * The location card. Nothing is shown until a place is picked (map click, search or a
 * marker); then a small card gives location, elevation, terrain and the science available
 * there, with the full readings one click away. Values come from numerical datasets only;
 * a missing value says so.
 */
export default function TerrainInspector() {
  const bridge = useMapBridge();
  const selected = useSelectedLocation();
  const displaySettings = useDisplaySettings();
  const [result, setResult] = useState<TerrainInspection | null>(null);
  const [loading, setLoading] = useState(false);
  const [visible, setVisible] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [details, setDetails] = useState(false);
  const request = useRef(0);
  const marker = useRef<MapOverlayHandle | null>(null);

  useEffect(() => {
    if (!selected) return;
    const id = ++request.current;
    setVisible(true);
    setLoading(true);
    inspectTerrain(selected.coordinate).then((r) => {
      if (id !== request.current) return;
      setResult(r);
      setLoading(false);
    });
    if (bridge) marker.current = bridge.addMarker(MARKER_ID, selected.coordinate, { label: selected.name ?? 'Selected point', color: '#c58b70' });
  }, [selected, bridge]);

  const close = () => {
    request.current++;
    setVisible(false);
    setExpanded(false);
    setDetails(false);
  };

  // Escape closes the card
  useEffect(() => {
    if (!visible) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [visible]);

  useEffect(() => () => marker.current?.remove(), []);

  if (!selected) return null;

  const locationLabel = selected.name
    ? `${selected.name} · ${formatLatitude(selected.coordinate.latitude)} · ${formatLongitude(selected.coordinate.longitudeEast, displaySettings.longitude)}`
    : `${formatLatitude(selected.coordinate.latitude)} · ${formatLongitude(selected.coordinate.longitudeEast, displaySettings.longitude)}`;

  if (!visible) {
    const name = locationLabel;
    return (
      <button
        type="button"
        className="sd-card-reopen"
        onClick={() => setVisible(true)}
        aria-label={`Show details for ${name}`}
        title={`Show details for ${name}`}
      >
        {name}
      </button>
    );
  }

  return (
    <section className={`sd-card${expanded ? ' is-expanded' : ''}${details ? ' is-detailed' : ''}`} aria-label={`${locationLabel}, location details`}>
      <header className="sd-card__head">
        <h2>{locationLabel}</h2>
        <div className="sd-card__actions">
          <button
            type="button"
            className="sd-card__summary-toggle"
            aria-expanded={expanded}
            aria-label={expanded ? 'Hide point summary' : 'Show point summary'}
            onClick={() => {
              setExpanded((value) => !value);
              setDetails(false);
            }}
          >
            <svg viewBox="0 0 20 20" aria-hidden="true">
              <path d="m6 8 4 4 4-4" />
            </svg>
          </button>
          <button type="button" className="sd-card__close" onClick={close} aria-label="Hide selected point panel">
            <svg viewBox="0 0 20 20" aria-hidden="true">
              <path d="m6 6 8 8M14 6l-8 8" />
            </svg>
          </button>
        </div>
      </header>
      {expanded && (loading || !result ? (
        <p className="sd-card__loading" role="status">
          Reading the terrain…
        </p>
      ) : (
        <>
          <Summary r={result} />
          <button type="button" className="sd-card__more" aria-expanded={details} onClick={() => setDetails((d) => !d)}>
            {details ? 'Hide detailed information' : 'View detailed information'}
            <svg viewBox="0 0 20 20" aria-hidden="true">
              <path d="m6 8 4 4 4-4" />
            </svg>
          </button>
          {details && <Details r={result} />}
        </>
      ))}
    </section>
  );
}

/* ---------------------------------------------------------------- summary */

const UNAVAILABLE = 'Data unavailable';

function Summary({ r }: { r: TerrainInspection }) {
  const s = useDisplaySettings();
  const local = r.local.elevation.status === 'available' ? r.local.elevation.value : undefined;
  const regional = r.regional.elevation.status === 'available' ? r.regional.elevation.value : undefined;
  const best = local ?? regional;
  const elev = best ? formatElevation(best.metres, s.elevationUnit) : null;
  const slope = r.local.slope.status === 'available' ? r.local.slope.value : r.regional.slope.status === 'available' ? r.regional.slope.value : undefined;

  // What actually holds data at this point
  const science: string[] = [];
  if (local) science.push('20 m terrain model');
  if (regional) science.push(r.regional.shots.value?.startsWith('0') ? 'MOLA (interpolated)' : 'MOLA laser altimetry');
  if (r.geology.status === 'available') science.push('Geologic map');

  return (
    <dl className="sd-summary">
      <div>
        <dt>Location</dt>
        <dd className="sd-mono">
          {formatLatitude(r.coordinate.latitude)} · {formatLongitude(r.coordinate.longitudeEast, s.longitude)}
        </dd>
      </div>
      <div>
        <dt>Elevation</dt>
        <dd>
          {elev ? (
            <>
              <span>
                <span className="sd-value">{elev.value}</span> <span className="sd-unit">{elev.unit}</span>
              </span>
              <span className="sd-sub">{local ? '20 m terrain model' : 'MOLA, 3.7 km'} · above MOLA areoid</span>
            </>
          ) : (
            <span className="sd-na">{UNAVAILABLE}</span>
          )}
        </dd>
      </div>
      <div>
        <dt>Terrain</dt>
        <dd>
          {r.geology.status === 'available' && r.geology.value ? r.geology.value.description : <span className="sd-na">{STATUS_LABEL[r.geology.status]}</span>}
          {slope && (
            <span className="sd-sub">
              Slope {slope.degrees.toFixed(1)}° over {slope.baselineM >= 1000 ? `${(slope.baselineM / 1000).toFixed(1)} km` : `${slope.baselineM} m`}
            </span>
          )}
        </dd>
      </div>
      <div>
        <dt>Science</dt>
        <dd>{science.length ? science.join(' · ') : <span className="sd-na">{UNAVAILABLE}</span>}</dd>
      </div>
    </dl>
  );
}

/* ---------------------------------------------------------------- details */

const km = (m: number) => `${(m / 1000).toFixed(3).replace('-', '−')} km`;
const metres = (m: number) => `${m >= 0 ? '' : '−'}${Math.abs(m).toFixed(m < 100 && m > -100 ? 1 : 0)} m`;

function Details({ r }: { r: TerrainInspection }) {
  const d = describeCoordinate(r.coordinate);
  return (
    <div className="sd-results">
      <p className="sd-results__alt">
        {d.lat} · {d.east360} · {d.east180} · {d.west360} · planetocentric
      </p>

      <Group title="Local terrain" source={`Jezero CTX DTM · ${JEZERO_CTX_DTM.resolution.value} m`} href={DATASET_LINKS.jezeroDtm}>
        <Row name="Elevation" reading={r.local.elevation} render={(v: ElevationReading) => [km(v.metres), v.method]} />
        <Row name="Slope" reading={r.local.slope} render={(v: SlopeReading) => [`${v.degrees.toFixed(1)}°`, `over ${v.baselineM} m`]} />
        <Row name="Relief" reading={r.local.relief} render={reliefText} />
      </Group>

      <Group title="Regional terrain" source="MOLA MEGDR · 3.7 km bins" href={DATASET_LINKS.megdr}>
        <Row name="Elevation" reading={r.regional.elevation} render={(v: ElevationReading) => [km(v.metres), v.method]} />
        <Row name="MOLA shots" reading={r.regional.shots} render={(v: string) => [v, 'laser measurements in the bin']} />
        <Row name="Slope" reading={r.regional.slope} render={(v: SlopeReading) => [`${v.degrees.toFixed(1)}°`, `over ${(v.baselineM / 1000).toFixed(1)} km`]} />
        <Row name="Relief" reading={r.regional.relief} render={reliefText} />
      </Group>

      <Group title="Geology" source="USGS SIM 3292 · 1:20 M" href={DATASET_LINKS.geology}>
        <Row name="Unit" reading={r.geology} render={(v) => [v.code, v.description]} />
        <p className="sd-caveat">{GEOLOGIC_MAP.limitations[1]}</p>
      </Group>

      <Group title="Rocks and obstacles">
        <Row name="Boulders" reading={r.smallObstacles} render={() => ['', '']} />
      </Group>

      <p className="sd-datum">Elevations are metres above the MOLA areoid. {MOLA_MEGDR.limitations[0]}</p>
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
