import { useEffect, useId, useState } from 'react';
import * as L from 'leaflet';
import {
  navigate,
  patchHazardState,
  requestHazardFocus,
  useHazardState,
  usePlannedRoute,
  useRouteHazardReport,
  type HazardCode,
} from '../../shared';
import { ROUTE_TESTABLE, SIMPLE_GROUPS, TERRAIN_CODES, displayName } from '../categories';
import type { HazardContext } from '../HazardsLayer';
import { swatchUrl } from '../patterns';

/** The terrain categories last shown, restored when hazards are shown again. */
let lastShown: HazardCode[] = TERRAIN_CODES;

/**
 * Simple mode: show hazards, choose a hazard type, check the route. Every control maps onto
 * the existing categories and route assessment; nothing here is a new classification.
 */
export default function SimpleHazards({ ctx }: { ctx: HazardContext }) {
  const hz = useHazardState();
  const shownTerrain = hz.active.filter((c) => TERRAIN_CODES.includes(c));
  const on = shownTerrain.length > 0;
  const others = hz.active.filter((c) => !TERRAIN_CODES.includes(c));
  const group = SIMPLE_GROUPS.find((g) => g.codes.length === shownTerrain.length && g.codes.every((c) => shownTerrain.includes(c)));
  const switchId = useId();

  const setShown = (codes: HazardCode[]) => patchHazardState({ active: [...others, ...codes] });
  const toggle = () => {
    if (on) {
      lastShown = shownTerrain;
      setShown([]);
    } else setShown(lastShown.length ? lastShown : TERRAIN_CODES);
  };

  return (
    <div className="hz-simple">
      <div className="hz-simple__row">
        <label className="hz-simple__label" htmlFor={switchId}>
          Show Hazards
          <small>Choose which hazards appear on the map.</small>
        </label>
        <label className="hz-toggle">
          <input id={switchId} type="checkbox" role="switch" checked={on} onChange={toggle} />
          <span className="hz-toggle__track" aria-hidden="true" />
          <span className="hz-toggle__text">{on ? 'On' : 'Off'}</span>
        </label>
      </div>

      <fieldset className="hz-simple__types" disabled={!on}>
        <legend>Hazard Types</legend>
        <div className="hz-seg hz-seg--stack" role="radiogroup" aria-label="Hazard types">
          {SIMPLE_GROUPS.map((g) => (
            <button key={g.id} type="button" role="radio" aria-checked={group?.id === g.id} className={group?.id === g.id ? 'is-active' : ''} onClick={() => setShown(g.codes)}>
              {g.label}
            </button>
          ))}
        </div>
        {on && !group && <p className="hz-muted">A custom selection is set under Advanced Details.</p>}
        {on && (
          <ul className="hz-simple__chips" aria-label="Hazards on the map">
            {shownTerrain.map((c) => (
              <li key={c}>
                <img src={swatchUrl(c)} alt="" width={12} height={12} />
                {displayName(c, true)}
              </li>
            ))}
          </ul>
        )}
      </fieldset>

      <CheckRoute ctx={ctx} />
    </div>
  );
}

function CheckRoute({ ctx }: { ctx: HazardContext }) {
  const route = usePlannedRoute();
  const report = useRouteHazardReport();
  const [checked, setChecked] = useState<string | null>(null);
  // A changed route needs checking again
  useEffect(() => {
    if (route && checked && checked !== route.signature) setChecked(null);
  }, [route, checked]);

  if (!route || route.stops.length < 2) {
    return (
      <section className="hz-simple__route" aria-label="Check my route">
        <h3>Check My Route</h3>
        <p>No mission route yet. Create a route to check its hazards.</p>
        <button type="button" className="hz-btn hz-btn--ghost" onClick={() => navigate('planner')}>
          Open Mission Planner
        </button>
      </section>
    );
  }

  const run = () => {
    setChecked(route.signature);
    const near = ctx.map.getCenter().lng;
    let ref = route.stops[0].coordinate.longitudeEast + 360 * Math.round((near - route.stops[0].coordinate.longitudeEast) / 360);
    const pts = route.stops.map((s) => {
      ref = s.coordinate.longitudeEast + 360 * Math.round((ref - s.coordinate.longitudeEast) / 360);
      return L.latLng(s.coordinate.latitude, ref);
    });
    ctx.map.fitBounds(L.latLngBounds(pts), { padding: [80, 80], maxZoom: 10 });
  };

  const ready = report?.status === 'ready';
  const tested = ready ? report.checks.filter((c) => ROUTE_TESTABLE.includes(c.code)) : [];
  const untestable = tested.filter((c) => c.state === 'unavailable');
  const hits = ready ? report.hits : [];

  return (
    <section className="hz-simple__route" aria-label="Check my route">
      <h3>Check My Route</h3>
      <button type="button" className="hz-btn hz-btn--wide" onClick={run}>
        Check My Route
      </button>
      {checked && (
        <div className="hz-simple__result" role="status">
          {!ready ? (
            <p>Checking the route against the mapped hazards…</p>
          ) : hits.length > 0 ? (
            <>
              <p className="hz-result-line hz-result-line--concern">
                <strong>Mapped concern detected</strong> · {hits.length} along the route
              </p>
              <ul className="hz-simple__hits">
                {hits.map((h) => (
                  <li key={h.id}>
                    <img src={swatchUrl(h.code)} alt="" width={14} height={14} />
                    <span>
                      {displayName(h.code, true)} · about {h.fromKm === h.toKm ? h.fromKm.toFixed(1) : `${h.fromKm.toFixed(1)}–${h.toKm.toFixed(1)}`} km from the start
                    </span>
                    <button type="button" className="hz-link" onClick={() => requestHazardFocus(h.at)}>
                      Show
                    </button>
                  </li>
                ))}
              </ul>
            </>
          ) : untestable.length ? (
            <p className="hz-result-line hz-result-line--unknown">
              <strong>Insufficient data</strong> · some hazard layers could not be checked ({untestable.map((c) => displayName(c.code, true)).join(', ')}).
            </p>
          ) : (
            <p className="hz-result-line hz-result-line--clear">
              <strong>No mapped concern detected</strong> within the assessed coverage.
            </p>
          )}
          {ready && untestable.length > 0 && hits.length > 0 && (
            <p className="hz-muted">Not checked: {untestable.map((c) => displayName(c.code, true)).join(', ')} (data unavailable).</p>
          )}
          <p className="hz-muted">
            This is not a safety rating. Rocks smaller than the image resolution, local slopes and unmapped hazards are not covered, and most terrain is unassessed at
            walking scale.
          </p>
        </div>
      )}
    </section>
  );
}
