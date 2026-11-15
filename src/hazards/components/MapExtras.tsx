import { useEffect, useState } from 'react';
import {
  patchHazardState,
  requestHazardFocus,
  useHazardState,
  usePlannedRoute,
  usePlannedRouteTotals,
  useRouteHazardReport,
} from '../../shared';
import { CATEGORY_BY_CODE, DRAWABLE } from '../categories';
import { swatchUrl } from '../patterns';

const isPhone = () => window.matchMedia?.('(max-width: 640px)').matches ?? false;

const KIND: Partial<Record<string, string>> = {
  L: 'NASA location markers only',
  S: 'USGS outlines: fill, waves, outline; plus markers',
  B: 'NASA location markers only',
  G: 'NASA location markers only',
  I: 'NASA location markers only',
  D: 'NASA location markers only',
  F: 'Mapped line (trough axis)',
  P: 'Mapped line (pit chain axis)',
  SL: 'Shaded cells with outline',
  U: 'Grey crosshatch over all terrain',
};

/** Compact, expandable key in the map corner: what is drawn now, and the map symbols. */
export function MapLegend({ shifted }: { shifted: boolean }) {
  const hz = useHazardState();
  const [open, setOpen] = useState(() => !isPhone());
  // Fold away when an information panel opens, so the map stays visible; the user can reopen it
  useEffect(() => {
    if (shifted) setOpen(false);
  }, [shifted]);
  const shown = DRAWABLE.filter((c) => hz.active.includes(c));
  return (
    <div className={`hz-legend${shifted ? ' is-shifted' : ''}`}>
      <button type="button" className="hz-legend__toggle" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span>Map legend</span>
        <span className="hz-legend__mini" aria-hidden="true">
          {shown.slice(0, 5).map((c) => (
            <img key={c} src={swatchUrl(c)} alt="" width={12} height={12} />
          ))}
        </span>
        <svg viewBox="0 0 20 20" aria-hidden="true" className="hz-chev">
          <path d="m7 5 5 5-5 5" />
        </svg>
      </button>
      {open && (
        <div className="hz-legend__body">
          <p className="hz-legend__h">Hazards drawn now</p>
          {shown.length ? (
            <ul>
              {shown.map((c) => (
                <li key={c}>
                  <img className="hz-swatch hz-swatch--sm" src={swatchUrl(c)} alt="" width={16} height={16} />
                  <span>
                    {CATEGORY_BY_CODE[c].name}
                    <small>{KIND[c]}</small>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="hz-muted">No hazard layer is shown. Switch one on under Hazard layers.</p>
          )}
          <p className="hz-legend__h">Symbols</p>
          <ul>
            <li>
              <span className="hz-obs-pin hz-obs-pin--legend" aria-hidden="true">
                <span style={{ ['--c' as string]: '#A3E635' }} />
              </span>
              <span>
                NASA observation location<small>Ring in the category colour; a point, not an area. Boundary not mapped</small>
              </span>
            </li>
            <li>
              <span className="hz-sym hz-sym--point" aria-hidden="true" />
              <span>Selected point</span>
            </li>
            <li>
              <span className="hz-sym hz-sym--sel" aria-hidden="true" />
              <span>Selected feature</span>
            </li>
            <li>
              <span className="hz-sym hz-sym--cross" aria-hidden="true" />
              <span>Route crosses a mapped line</span>
            </li>
            <li>
              <span className="hz-sym hz-sym--steep" aria-hidden="true" />
              <span>Route passes through steep cells</span>
            </li>
          </ul>
          <p className="hz-legend__note">Orange pins are landmarks and burgundy markers are curvature sites. They are other layers, not hazards.</p>
        </div>
      )}
    </div>
  );
}

const fmtKm = (km: number) => `${km < 10 ? km.toFixed(2) : km.toFixed(1)} km`;
function fmtHours(h: number) {
  if (!Number.isFinite(h)) return '—';
  const total = Math.round(h * 60);
  const hh = Math.floor(total / 60);
  const mm = total % 60;
  return hh ? `${hh} h ${mm} min` : `${mm} min`;
}

/** Below the map: the planner's distance and time, and which segments meet mapped hazards. */
export function RouteStrip() {
  const route = usePlannedRoute();
  const totals = usePlannedRouteTotals();
  const report = useRouteHazardReport();
  const [open, setOpen] = useState(false);

  if (!route || route.stops.length < 2) {
    return (
      <div className="hz-strip is-empty">
        <p>No route planned. Plan one in the Mission Planner and it is tested against the mapped layers here.</p>
        <button type="button" className="hz-btn hz-btn--ghost hz-btn--sm" onClick={() => patchHazardState({ view: 'planner' })}>
          Open Mission Planner
        </button>
      </div>
    );
  }

  const segments = route.stops.length - 1;
  const ready = report?.status === 'ready';
  const hits = ready ? report.hits : [];
  const affected = new Set(hits.map((h) => h.segmentIndex)).size;
  const excluded = ready ? report.checks.filter((c) => c.state === 'excluded') : [];

  return (
    <section className={`hz-strip${open ? ' is-open' : ''}`} aria-label="Planned route">
      <div className="hz-strip__row">
        <p className="hz-strip__title">
          Planned route
          <small>
            {route.stops[0].name ?? route.stops[0].label} → {route.stops[route.stops.length - 1].name ?? route.stops[route.stops.length - 1].label}
          </small>
        </p>
        <dl className="hz-strip__figs">
          <div>
            <dt>Distance</dt>
            <dd>{totals ? fmtKm(totals.distanceKm) : '—'}</dd>
          </div>
          <div>
            <dt>Travel time</dt>
            <dd>{totals ? fmtHours(totals.travelHours) : '—'}</dd>
          </div>
          <div>
            <dt>With tasks</dt>
            <dd>{totals ? fmtHours(totals.totalHours) : '—'}</dd>
          </div>
          <div>
            <dt>Mapped findings</dt>
            <dd>
              {!report
                ? 'Not tested'
                : !ready
                  ? 'Testing…'
                  : hits.length
                    ? `${hits.length} on ${affected} of ${segments} segment${segments === 1 ? '' : 's'}`
                    : `None on ${segments} segment${segments === 1 ? '' : 's'}`}
            </dd>
          </div>
        </dl>
        <div className="hz-strip__btns">
          <button type="button" className="hz-btn hz-btn--ghost hz-btn--sm" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
            {open ? 'Hide details' : 'Affected segments'}
          </button>
          <button type="button" className="hz-btn hz-btn--ghost hz-btn--sm" onClick={() => patchHazardState({ view: 'planner' })}>
            Mission Planner
          </button>
        </div>
      </div>
      {open && (
        <div className="hz-strip__more">
          {!ready ? (
            <p className="hz-muted" role="status">
              Testing the route against the mapped layers…
            </p>
          ) : hits.length ? (
            <ol className="hz-strip__hits">
              {hits.map((h) => (
                <li key={h.id}>
                  <img className="hz-swatch hz-swatch--sm" src={swatchUrl(h.code)} alt="" width={16} height={16} />
                  <span>
                    <strong>{CATEGORY_BY_CODE[h.code].name}</strong> · {h.segmentLabel} ·{' '}
                    {h.fromKm === h.toKm ? `at about ${fmtKm(h.fromKm)}` : `about ${fmtKm(h.fromKm)} to ${fmtKm(h.toKm)}`} from the start
                  </span>
                  <button type="button" className="hz-link" onClick={() => requestHazardFocus(h.at)}>
                    Show on map
                  </button>
                </li>
              ))}
            </ol>
          ) : (
            <p>The route line meets no mapped trough line or steep-slope cell. That is not a statement that it is safe.</p>
          )}
          {excluded.length > 0 && <p className="hz-muted">Excluded by you: {excluded.map((c) => CATEGORY_BY_CODE[c.code].name).join(', ')}.</p>}
          {report?.slope && (
            <p className="hz-muted">
              Under the line: {fmtKm(report.slope.steepKm)} above {report.slope.thresholdDeg}° · {fmtKm(report.slope.belowKm)} below ·{' '}
              {fmtKm(report.slope.unavailableKm)} without slope data. Distances and times are the planner’s straight-line estimates.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
