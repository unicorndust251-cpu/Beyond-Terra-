import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useMapBridge, useSelectedLocation, type MapOverlayHandle } from '../shared';
import { inspectTerrain, type Reading, type TerrainInspection } from './terrain';
import { formatElevation, formatLatitude, formatLongitude, useDisplaySettings } from '../science/workspace/uiState';
import './inspector.css';

const MARKER_ID = 'sd:inspect';

/**
 * The selected-point card. Nothing is shown until a place is picked (map click, search or
 * a marker); then a compact readout gives the place, its coordinates, elevation, slope,
 * terrain and hazards. Values come from numerical datasets only; a missing value says so.
 */
export default function TerrainInspector() {
  const bridge = useMapBridge();
  const selected = useSelectedLocation();
  const displaySettings = useDisplaySettings();
  const [result, setResult] = useState<TerrainInspection | null>(null);
  const [loading, setLoading] = useState(false);
  const [visible, setVisible] = useState(false);
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

  const title = selected.name ?? 'Selected point';
  const { latitude, longitudeEast } = selected.coordinate;
  const coords = `${formatLatitude(latitude, 3)}, ${formatLongitude(longitudeEast, displaySettings.longitude, 3)}`;

  if (!visible) {
    return (
      <button type="button" className="sd-reopen" onClick={() => setVisible(true)} aria-label={`Show details for ${title}`} title={`Show details for ${title}`}>
        <PinIcon />
        <span>{title}</span>
      </button>
    );
  }

  return (
    <section className="sd-card" aria-label={`${title}, selected point`}>
      <header className="sd-card__head">
        <PinIcon />
        <div className="sd-card__title">
          <h2 title={title}>{title}</h2>
          <p className="sd-card__coords">{coords}</p>
        </div>
        <button type="button" className="sd-card__close" onClick={close} aria-label="Close" title="Close">
          <svg viewBox="0 0 20 20" aria-hidden="true">
            <path d="m6 6 8 8M14 6l-8 8" />
          </svg>
        </button>
      </header>

      {loading || !result ? (
        <dl className="sd-rows is-loading" role="status" aria-label="Loading terrain data">
          {['Elevation', 'Slope', 'Terrain', 'Hazards'].map((label) => (
            <Row key={label} label={label}>
              <span className="sd-placeholder" />
            </Row>
          ))}
        </dl>
      ) : (
        <Readings key={`${latitude},${longitudeEast}`} r={result} />
      )}
    </section>
  );
}

/* ---------------------------------------------------------------- readings */

const pick = <T,>(...readings: Reading<T>[]) => readings.find((x) => x.status === 'available' && x.value !== undefined)?.value;

/** Steepness class from a measured slope (degrees). */
function slopeClass(deg: number): string {
  if (deg < 2) return 'Flat';
  if (deg < 5) return 'Gently sloping';
  if (deg < 15) return 'Moderately sloping';
  if (deg < 25) return 'Steep';
  return 'Very steep';
}

const STEEP_DEG = 15;

function Readings({ r }: { r: TerrainInspection }) {
  const s = useDisplaySettings();
  const elevation = pick(r.local.elevation, r.regional.elevation);
  const slope = pick(r.local.slope, r.regional.slope);
  const unit = pick(r.geology);
  const elev = elevation ? formatElevation(elevation.metres, s.elevationUnit) : null;
  const steep = slope && slope.degrees >= STEEP_DEG;

  return (
    <dl className="sd-rows">
      <Row label="Elevation">
        {elev ? (
          <span className="sd-num">
            {elev.value}
            <span className="sd-num__unit">{elev.unit}</span>
          </span>
        ) : (
          <Unavailable />
        )}
      </Row>

      <Row label="Slope">
        {slope ? <span className="sd-num">{slope.degrees.toFixed(1)}°</span> : <Unavailable />}
      </Row>

      <Row label="Terrain">
        {slope || unit ? (
          <>
            {slope && <span>{slopeClass(slope.degrees)}</span>}
            {unit && (
              <span className={slope ? 'sd-secondary' : undefined} title={unit.description}>
                {unit.description}
              </span>
            )}
          </>
        ) : (
          <Unavailable />
        )}
      </Row>

      <Row label="Hazards">
        {slope ? <span className={steep ? 'sd-warn' : undefined}>{steep ? 'Steep slope' : 'No steep slopes'}</span> : <Unavailable />}
      </Row>
    </dl>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="sd-row">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

const Unavailable = () => <span className="sd-muted">Data unavailable</span>;

const PinIcon = () => (
  <svg className="sd-pin" viewBox="0 0 20 20" aria-hidden="true">
    <path d="M10 17.5s5.5-5 5.5-9.25a5.5 5.5 0 0 0-11 0C4.5 12.5 10 17.5 10 17.5Z" />
    <circle cx="10" cy="8.25" r="2" />
  </svg>
);
