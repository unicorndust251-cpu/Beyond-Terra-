import { useEffect, useId, useState, type ReactNode } from 'react';
import { formatClock, localSolar, marsTime } from '../../dashboard/science/marsTime';
import { solarEvents } from '../../dashboard/science/solarEvents';
import { sampleBin } from '../../science/molaDem';
import {
  fromEast360,
  greatCircleDistanceM,
  patchHazardState,
  toMapLatLng,
  useHazardState,
  useMissionConstraints,
  usePlannedRoute,
  useRouteHazardReport,
  type HazardCode,
  type MarsCoordinate,
} from '../../shared';
import { CATEGORY_BY_CODE } from '../categories';
import { formatCoord } from '../coordinateInput';
import { Actions, Alternatives, CrewOptions, Head, Rows, Section } from '../components/HazardDrawer';
import type { HazardContext } from '../HazardsLayer';
import { constantRateDose, energyBudget, fmtMinutes, loadTimeline } from './calc';
import { RAD_REFERENCE, terrainHorizon, type HorizonResult } from './envMap';
import { patchInputs, parseNum, useEnvInputs, type CommNode } from './inputs';
import { MEDA_NOTE, envStatus } from './status';
import { parsePlannedUtc } from './time';

const NA = (t: string) => <span className="hz-unavailable">{t}</span>;
const fmtWh = (x: number) => `${x.toFixed(x < 10 ? 1 : 0)} Wh`;

/* ---------------------------------------------------------------- inputs */

/** A number field: empty means "not entered" (null), invalid input is rejected, 0 stays 0. */
function NumField({
  label,
  value,
  unit,
  min,
  max,
  onChange,
  hint,
}: {
  label: string;
  value: number | null;
  unit?: string;
  min?: number;
  max?: number;
  onChange(v: number | null): void;
  hint?: string;
}) {
  const id = useId();
  const [text, setText] = useState(value == null ? '' : String(value));
  const [bad, setBad] = useState(false);
  useEffect(() => {
    setText(value == null ? '' : String(value));
  }, [value]);
  return (
    <div className="hz-numfield">
      <label htmlFor={id}>{label}</label>
      <span className="hz-numfield__in">
        <input
          id={id}
          inputMode="decimal"
          value={text}
          aria-invalid={bad}
          placeholder="Not entered"
          onChange={(e) => {
            setText(e.target.value);
            const v = parseNum(e.target.value, { min, max });
            setBad(v === undefined);
            if (v !== undefined) onChange(v);
          }}
        />
        {unit && <span>{unit}</span>}
      </span>
      {bad && <span className="hz-error">Enter a number{min != null ? ` ≥ ${min}` : ''}{max != null ? ` and ≤ ${max}` : ''}.</span>}
      {hint && <span className="hz-muted">{hint}</span>}
    </div>
  );
}

function StatusBox({ code, ctx }: { code: HazardCode; ctx: HazardContext }) {
  const hz = useHazardState();
  const inputs = useEnvInputs();
  const snapshot = useMissionConstraints();
  const route = usePlannedRoute();
  const st = envStatus(code, {
    plannedTime: hz.plannedTime,
    dem: ctx.slopeStore,
    retryDem: ctx.retrySlope,
    inputs,
    snapshot,
    route,
    commReady: true,
  });
  if (!st) return null;
  const shown = hz.active.includes(code);
  return (
    <div className={`hz-callout hz-statusbox hz-tone-box--${st.tone}`}>
      <span className="hz-status-chip">{st.status}</span> <span className="hz-status-chip hz-status-chip--vis">{shown ? 'Shown on map' : 'Hidden on map'}</span>
      <p>{st.text}</p>
      {st.retry && (
        <button type="button" className="hz-link" onClick={st.retry}>
          Retry loading
        </button>
      )}
    </div>
  );
}

function RouteEffect({ code }: { code: HazardCode }) {
  const route = usePlannedRoute();
  const report = useRouteHazardReport();
  if (!route) return <p>No route is planned. Plan one in the Mission Planner.</p>;
  if (!report || report.status !== 'ready') return <p role="status">Testing the planned route…</p>;
  const check = report.checks.find((c) => c.code === code);
  const hits = report.hits.filter((h) => h.code === code);
  return (
    <>
      {check && (
        <p>
          <strong>{check.state === 'checked' ? 'Tested' : check.state === 'excluded' ? 'Excluded by you' : check.state === 'unavailable' ? 'Unavailable' : 'Not tested'}:</strong>{' '}
          {check.note}
        </p>
      )}
      {hits.length > 0 && (
        <ul className="hz-list">
          {hits.map((h) => (
            <li key={h.id}>
              {h.segmentLabel}: about {h.fromKm.toFixed(1)} to {h.toKm.toFixed(1)} km from the start
            </li>
          ))}
        </ul>
      )}
      <p className="hz-muted">Showing or hiding this layer never changes this result.</p>
    </>
  );
}

function Common({ code, n0, children, route }: { code: HazardCode; n0: number; children?: ReactNode; route?: ReactNode }) {
  const cat = CATEGORY_BY_CODE[code];
  return (
    <>
      <Section n={n0} title="Why it matters for this mission">
        <p>{cat.whyItMatters}</p>
        {children}
      </Section>
      <Section n={n0 + 1} title="What can the crew do?" id="hz-crew">
        <CrewOptions cats={[cat]} />
      </Section>
      <Section n={n0 + 2} title="Alternative approaches or mission options">
        <Alternatives cats={[cat]} />
      </Section>
      <Section n={n0 + 3} title="Effect on the planned route">
        {route ?? <RouteEffect code={code} />}
      </Section>
    </>
  );
}

/* ------------------------------------------------------------------ view */

export default function CategoryView({ ctx, code, onClose }: { ctx: HazardContext; code: HazardCode; onClose(): void }) {
  const cat = CATEGORY_BY_CODE[code];
  const hz = useHazardState();
  const on = hz.active.includes(code);
  const toggle = () => patchHazardState({ active: on ? hz.active.filter((c) => c !== code) : [...hz.active, code] });
  const body =
    code === 'V' ? <VisibilityDetails ctx={ctx} /> :
    code === 'T' ? <TemperatureDetails /> :
    code === 'R' ? <RadiationDetails ctx={ctx} /> :
    code === 'C' ? <CommDetails ctx={ctx} /> :
    code === 'N' ? <NavDetails /> :
    code === 'E' ? <EnergyDetails /> :
    code === 'M' ? <LoadDetails /> :
    code === 'U' ? <CoverageDetails /> : <p className="hz-muted">No details view for this category.</p>;
  return (
    <>
      <Head cats={[cat]} title={cat.name} id={`Category ${code}`} kind={cat.group === 'mission' ? 'Mission constraint' : cat.group === 'coverage' ? 'Data coverage' : 'Environmental condition'} />
      <p className="hz-d-short">{cat.short}</p>
      <StatusBox code={code} ctx={ctx} />
      {body}
      <Actions
        actions={[
          { label: on ? 'Hide on map' : 'Show on map', onClick: toggle, pressed: on },
          { label: 'Close', onClick: onClose },
        ]}
      />
    </>
  );
}

/* ------------------------------------------------------------ visibility */

type Where = 'centre' | 'start' | 'destination';

function VisibilityDetails({ ctx }: { ctx: HazardContext }) {
  const hz = useHazardState();
  const route = usePlannedRoute();
  const [where, setWhere] = useState<Where>(route ? 'start' : 'centre');
  const [centre, setCentre] = useState<MarsCoordinate>(() => {
    const c = ctx.map.getCenter();
    return { latitude: c.lat, longitudeEast: ((((c.lng + 180) % 360) + 360) % 360) - 180 };
  });
  const at: MarsCoordinate =
    where === 'start' && route ? route.stops[0].coordinate : where === 'destination' && route ? route.stops[route.stops.length - 1].coordinate : centre;
  const ms = parsePlannedUtc(hz.plannedTime);
  const sun = ms != null ? localSolar(marsTime(ms), at.latitude, at.longitudeEast) : null;
  const events = ms != null ? solarEvents(ms, at.latitude, at.longitudeEast) : null;
  const [horizon, setHorizon] = useState<{ state: 'idle' | 'loading' | 'done' | 'none'; r?: HorizonResult | null }>({ state: 'idle' });
  const key = `${at.latitude},${at.longitudeEast},${sun?.azimuth}`;
  useEffect(() => {
    if (!sun || sun.azimuth == null || ctx.slopeStore.state !== 'ready') return setHorizon({ state: 'idle' });
    let live = true;
    setHorizon({ state: 'loading' });
    terrainHorizon(ctx.slopeStore.data, at, sun.azimuth).then(
      (r) => live && setHorizon({ state: r ? 'done' : 'none', r }),
      () => live && setHorizon({ state: 'none' }),
    );
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, ctx.slopeStore.state]);

  const useNow = () => {
    const d = new Date();
    const iso = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), d.getUTCHours(), d.getUTCMinutes())).toISOString().slice(0, 16);
    patchHazardState({ plannedTime: iso });
  };
  const shadowed = sun && horizon.state === 'done' && horizon.r ? sun.elevation > 0 && sun.elevation < horizon.r.horizonDeg : null;

  return (
    <>
      <Section n={1} title="Location and time">
        <div className="hz-seg" role="radiogroup" aria-label="Location for the calculation">
          {(
            [
              ['start', 'Route start'],
              ['destination', 'Destination'],
              ['centre', 'Map centre'],
            ] as [Where, string][]
          ).map(([w, label]) => (
            <button key={w} type="button" role="radio" aria-checked={where === w} className={where === w ? 'is-active' : ''} disabled={w !== 'centre' && !route} onClick={() => setWhere(w)}>
              {label}
            </button>
          ))}
        </div>
        {where === 'centre' && (
          <button
            type="button"
            className="hz-link"
            onClick={() => {
              const c = ctx.map.getCenter();
              setCentre({ latitude: c.lat, longitudeEast: ((((c.lng + 180) % 360) + 360) % 360) - 180 });
            }}
          >
            Update to the current map centre
          </button>
        )}
        <Rows
          rows={[
            ['Selected coordinates', formatCoord(at, 3)],
            [
              'Selected time',
              hz.plannedTime ? (
                `${hz.plannedTime.replace('T', ' ')} UTC`
              ) : (
                <>
                  {NA('Not set')}{' '}
                  <button type="button" className="hz-link" onClick={useNow}>
                    Use the current time
                  </button>
                </>
              ),
            ],
          ]}
        />
      </Section>
      <Section n={2} title="A. Calculated solar illumination">
        {!sun || !events ? (
          <p className="hz-callout">Set a planned date and time in the top bar to calculate the Sun’s position.</p>
        ) : (
          <Rows
            rows={[
              ['Solar elevation', `${sun.elevation.toFixed(1)}° above the smooth horizon`],
              ['Solar azimuth', sun.azimuth == null ? 'Sun at the zenith' : `${sun.azimuth.toFixed(1)}° (clockwise from north)`],
              ['Status', sun.elevation > 0 ? 'Daylight' : 'Night (Sun below the horizon)'],
              ['Local true solar time', formatClock(sun.LTST)],
              [
                'Sunrise / sunset (LTST)',
                events.status === 'normal'
                  ? `${events.sunriseLTST != null ? formatClock(events.sunriseLTST) : '—'} / ${events.sunsetLTST != null ? formatClock(events.sunsetLTST) : '—'}`
                  : events.status === 'polar-day'
                    ? 'Polar day: the Sun does not set this sol'
                    : 'Polar night: the Sun does not rise this sol',
              ],
              ['Method', 'NASA GISS Mars24 (Allison & McEwen 2000); planetographic latitude; idealised horizon'],
            ]}
          />
        )}
      </Section>
      <Section n={3} title="B. Terrain-derived shadow">
        {!sun ? (
          <p className="hz-muted">Needs the Sun’s position first.</p>
        ) : ctx.slopeStore.state === 'error' ? (
          <p className="hz-callout hz-callout--error">Solar position calculated; terrain-shadow model unavailable.</p>
        ) : sun.elevation <= 0 ? (
          <p>The Sun is below the horizon: no terrain-shadow check is needed.</p>
        ) : horizon.state === 'loading' ? (
          <p role="status">Checking the MOLA terrain horizon toward the Sun…</p>
        ) : horizon.state === 'done' && horizon.r ? (
          <Rows
            rows={[
              ['Terrain horizon toward the Sun', `${horizon.r.horizonDeg.toFixed(2)}° (checked to ${horizon.r.rangeKm.toFixed(0)} km, every ${horizon.r.stepKm.toFixed(2)} km)`],
              ['Result', shadowed ? 'In terrain shadow at this resolution' : 'Not shadowed by terrain resolvable at this resolution'],
              ['Terrain model', 'NASA MOLA MEGDR, 16 px/deg (~3.7 km cells); curvature included'],
              ['Horizon', 'Terrain-aware at 3.7 km; boulders, crater rims and slopes smaller than a cell are not resolved'],
            ]}
          />
        ) : (
          <p className="hz-callout">Solar position calculated; terrain-shadow model unavailable for this point.</p>
        )}
        <p className="hz-muted">Terrain shadow is checked for this point only. The map layer shows the night side, not terrain shadows.</p>
      </Section>
      <Section n={4} title="C. Atmospheric visibility">
        <p className="hz-callout">No atmospheric visibility data is loaded (dust optical depth, dust storms, fog). A Sun-position calculation does not provide visibility.</p>
      </Section>
      <Common code="V" n0={5} />
      <Section n={9} title="Source and limitations">
        <ul className="hz-list hz-list--plain">
          <li>
            Mars24 algorithm:{' '}
            <a href="https://www.giss.nasa.gov/tools/mars24/help/algorithm.html" target="_blank" rel="noreferrer">
              giss.nasa.gov/tools/mars24
            </a>{' '}
            (verified against its worked examples in this project’s tests).
          </li>
          <li>The night-side map uses the smooth horizon, sampled on a grid of 8 px squares per tile; its edge is approximate at that spacing.</li>
          <li>The subsolar point uses the planetographic declination as latitude (within about 0.4°).</li>
        </ul>
      </Section>
    </>
  );
}

/* ----------------------------------------------------------- temperature */

function TemperatureDetails() {
  const inputs = useEnvInputs();
  const t = inputs.temperature;
  return (
    <>
      <Section n={1} title="Location and time">
        <p className="hz-callout">Select a date with available observations: none are loaded.</p>
        <p className="hz-muted">{MEDA_NOTE}</p>
      </Section>
      <Section n={2} title="Air and surface temperature">
        <Rows
          rows={[
            ['Air temperature', NA('No observation loaded')],
            ['Surface (ground) temperature', NA('No observation loaded')],
            ['Measurement location and time', NA('Not available')],
            ['Quality flags', NA('Not available')],
          ]}
        />
        <p className="hz-muted">
          Air and surface temperatures are separate measurements: neither is copied into the other, and no offset between them is assumed. Kelvin values would be
          converted with °C = K − 273.15, only when the source unit is kelvin. A rover reading applies to its own location and time, not to other landmarks.
        </p>
      </Section>
      <Section n={3} title="Equipment operating limits">
        <div className="hz-form">
          <NumField label="Lowest operating temperature" unit="°C" value={t.minC} min={-273.15} max={200} onChange={(v) => patchInputs('temperature', { minC: v })} />
          <NumField label="Highest operating temperature" unit="°C" value={t.maxC} min={-273.15} max={200} onChange={(v) => patchInputs('temperature', { maxC: v })} />
        </div>
        <p className="hz-muted">
          {t.minC != null || t.maxC != null ? 'Limits saved. ' : ''}Comparison not possible: no temperature readings are loaded.
        </p>
      </Section>
      <Common code="T" n0={4} />
      <Section n={8} title="Source and missing dependency">
        <ul className="hz-list hz-list--plain">
          <li>
            Identified source: Perseverance MEDA products (air temperature ATS, ground temperature TIRS) at the{' '}
            <a href="https://pds-atmospheres.nmsu.edu/data_and_services/atmospheres_data/PERSEVERANCE/meda.html" target="_blank" rel="noreferrer">
              PDS Atmospheres Node
            </a>
            . That page is a data-discovery page, not an API.
          </li>
          <li>Missing: the MEDA product files and an adapter for them. No readings are simulated in their place.</li>
        </ul>
      </Section>
    </>
  );
}

/* ------------------------------------------------------------- radiation */

function RadiationDetails({ ctx }: { ctx: HazardContext }) {
  const route = usePlannedRoute();
  const snapshot = useMissionConstraints();
  const inputs = useEnvInputs();
  const r = RAD_REFERENCE;
  const farthest = route ? Math.max(...route.stops.map((s) => greatCircleDistanceM(s.coordinate, r.at) / 1000)) : null;
  const compatible = farthest != null && farthest <= r.compatibleKm;
  const hours = snapshot ? snapshot.totalHours + (inputs.load.includeReturn ? snapshot.returnHours : 0) : null;
  const dem = ctx.slopeStore.state === 'ready' ? ctx.slopeStore.data : null;
  const elevAt = (c: MarsCoordinate) => (dem ? sampleBin(dem, c.latitude, c.longitudeEast)?.elevation ?? null : null);
  const siteZ = elevAt(r.at);
  const startZ = route ? elevAt(route.stops[0].coordinate) : null;
  return (
    <>
      <Section n={1} title="Measurement">
        <Rows
          rows={[
            ['Quantity', r.quantity],
            ['Value', `${r.approx} ${r.ratePerDay} ${r.unit} (absorbed dose, grays)`],
            ['Dose equivalent (Sv)', NA('Not given by this source; not converted')],
            ['Status', 'Measurement (historical), not a model'],
            ['Where', `${r.place}, ${formatCoord(r.at, 4)}`],
            ['When', r.period],
            ['Instrument', r.instrument],
          ]}
        />
        <ul className="hz-list hz-list--plain">
          {r.notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      </Section>
      <Section n={2} title="Exposure for the planned excursion">
        {!route || hours == null ? (
          <p className="hz-callout">Add route and task durations in the Mission Planner.</p>
        ) : !compatible ? (
          <p className="hz-callout">
            Radiation model or measurement required for this location. The only measurement loaded is about {Math.round(farthest!)} km from the route; a single local
            measurement is not applied elsewhere.
          </p>
        ) : (
          <>
            <Rows
              rows={[
                ['Exposure interval', `${hours.toFixed(1)} h (planner duration${inputs.load.includeReturn ? ' + return' : ''})`],
                ['Absorbed dose (constant-rate approximation)', `≈ ${constantRateDose(r.ratePerDay, hours).toFixed(0)} µGy = ${r.ratePerDay} µGy/day × ${hours.toFixed(1)} h ÷ 24`],
              ]}
            />
            <p className="hz-muted">dose = doseRate × duration, assuming the 2012–13 average rate. Solar particle events and the present solar-cycle phase are not included.</p>
          </>
        )}
      </Section>
      <Section n={3} title="Shielding">
        <Rows
          rows={[
            [
              'Atmospheric',
              siteZ != null && startZ != null
                ? `Route start ${Math.round(startZ)} m vs measurement site ${Math.round(siteZ)} m (MOLA). Lower ground has more atmosphere overhead; no model of its effect is loaded.`
                : 'Lower ground has more atmosphere overhead; no model of its effect is loaded.',
            ],
            ['Natural terrain', 'Shielding effectiveness not assessed.'],
            ['Habitat / shelter', 'Shielding effectiveness not assessed.'],
            ['Suit', 'Shielding effectiveness not assessed.'],
          ]}
        />
        <p className="hz-muted">Caves, overhangs and crater walls are not identified as shelters. No place is rated as the “highest” or “safest” for radiation.</p>
      </Section>
      <Common code="R" n0={4} />
      <Section n={8} title="Source and limitations">
        <ul className="hz-list hz-list--plain">
          <li>
            <a href={r.source} target="_blank" rel="noreferrer">
              NASA: Radiation Measurements on Mars
            </a>{' '}
            ({r.credit}). The page explains measurements; it is not a live radiation feed.
          </li>
          <li>Absorbed dose (Gy) and dose equivalent (Sv) are kept separate; no conversion model is loaded.</li>
        </ul>
      </Section>
    </>
  );
}

/* --------------------------------------------------------- communication */

const newId = () => Math.random().toString(36).slice(2, 9);

function CommDetails({ ctx }: { ctx: HazardContext }) {
  const inputs = useEnvInputs();
  const route = usePlannedRoute();
  const comm = inputs.comm;
  const [lat, setLat] = useState('');
  const [lon, setLon] = useState('');
  const [kind, setKind] = useState<CommNode['kind']>('habitat');
  const [err, setErr] = useState<string | null>(null);
  const setNodes = (nodes: CommNode[]) => patchInputs('comm', { nodes });
  const add = (at: MarsCoordinate) => setNodes([...comm.nodes, { id: newId(), name: kind === 'habitat' ? 'Habitat' : kind === 'rover' ? 'Rover' : `Relay ${comm.nodes.length + 1}`, kind, at, antennaM: null }]);
  const addTyped = () => {
    const la = Number(lat);
    const lo = Number(lon);
    if (!lat.trim() || !Number.isFinite(la) || Math.abs(la) > 90) return setErr('Latitude must be between −90 and 90.');
    if (!lon.trim() || !Number.isFinite(lo) || lo < 0 || lo > 360) return setErr('Longitude must be between 0 and 360 °E.');
    setErr(null);
    add(fromEast360(la, lo));
    setLat('');
    setLon('');
  };
  return (
    <>
      <Section n={1} title="Configured network">
        {comm.nodes.length === 0 && <p className="hz-callout">Coverage not calculated — habitat/relay configuration required.</p>}
        <ul className="hz-nodes">
          {comm.nodes.map((n) => (
            <li key={n.id}>
              <p>
                <strong>{n.name}</strong> ({n.kind}) · {formatCoord(n.at, 3)}{' '}
                <button type="button" className="hz-link" onClick={() => ctx.map.setView(toMapLatLng(n.at, ctx.map.getCenter().lng), Math.max(ctx.map.getZoom(), 7))}>
                  Locate on map
                </button>{' '}
                <button type="button" className="hz-link" onClick={() => setNodes(comm.nodes.filter((x) => x.id !== n.id))} aria-label={`Remove ${n.name}`}>
                  Remove
                </button>
              </p>
              <NumField
                label="Antenna height above ground"
                unit="m"
                value={n.antennaM}
                min={0}
                max={1000}
                onChange={(v) => setNodes(comm.nodes.map((x) => (x.id === n.id ? { ...x, antennaM: v } : x)))}
              />
            </li>
          ))}
        </ul>
        <div className="hz-addnode">
          <label>
            Add
            <select className="hz-select" value={kind} onChange={(e) => setKind(e.target.value as CommNode['kind'])}>
              <option value="habitat">Habitat</option>
              <option value="rover">Rover</option>
              <option value="relay">Surface relay</option>
            </select>
          </label>
          <span className="hz-row-btns">
            <button type="button" className="hz-btn hz-btn--ghost hz-btn--sm" disabled={!route} onClick={() => route && add(route.stops[0].coordinate)}>
              At route start
            </button>
            <input className="hz-text hz-text--sm" placeholder="Lat °N" value={lat} onChange={(e) => setLat(e.target.value.replace('−', '-'))} aria-label="Latitude, degrees north" />
            <input className="hz-text hz-text--sm" placeholder="Lon °E" value={lon} onChange={(e) => setLon(e.target.value.replace('−', '-'))} aria-label="Longitude, degrees east 0–360" />
            <button type="button" className="hz-btn hz-btn--sm" onClick={addTyped}>
              Add
            </button>
          </span>
          {err && <p className="hz-error">{err}</p>}
        </div>
        <NumField label="Crew antenna height above ground" unit="m" value={comm.crewAntennaM} min={0} max={10} onChange={(v) => patchInputs('comm', { crewAntennaM: v })} />
      </Section>
      <Section n={2} title="Links">
        <Rows
          rows={[
            ['Crew ↔ habitat / rover / relay', comm.nodes.length ? 'Terrain line of sight along the route (MOLA 3.7 km, spherical bulge)' : NA('Habitat/relay configuration required')],
            ['Crew ↔ crew', NA('Not modelled: radio configuration and crew positions required')],
            ['Orbital relay passes', NA('Not modelled: orbiter ephemerides and pass schedule required')],
            ['Earth', NA('Not modelled: Deep Space Network schedule and Earth–Mars geometry required')],
          ]}
        />
        <p className="hz-muted">
          Line of sight is not a radio-link assessment: frequency, transmit power, antenna patterns, Fresnel-zone clearance and multipath are not modelled. Terrain
          features smaller than a 3.7 km MOLA cell are not resolved.
        </p>
      </Section>
      <Common code="C" n0={3} />
      <Section n={7} title="Source and limitations">
        <ul className="hz-list hz-list--plain">
          <li>
            Network background:{' '}
            <a href="https://science.nasa.gov/mars/mars-relay-network/" target="_blank" rel="noreferrer">
              NASA Mars Relay Network
            </a>
            . No relay schedule is loaded.
          </li>
          <li>Positions and antenna heights are your inputs; they are saved in this browser only.</li>
        </ul>
      </Section>
    </>
  );
}

/* ------------------------------------------------------------ navigation */

function NavDetails() {
  const inputs = useEnvInputs();
  const nav = inputs.nav;
  const id = useId();
  return (
    <>
      <Section n={1} title="Positioning">
        <div className="hz-form">
          <label className="hz-field" htmlFor={`${id}-m`}>
            Positioning method
          </label>
          <select id={`${id}-m`} className="hz-select" value={nav.method} onChange={(e) => patchInputs('nav', { method: e.target.value })}>
            <option value="">Not stated</option>
            <option value="Visual landmark navigation">Visual landmark navigation</option>
            <option value="Inertial measurement + odometry">Inertial measurement + odometry</option>
            <option value="Surface radio beacons">Surface radio beacons</option>
            <option value="Orbital imaging fix">Orbital imaging fix</option>
            <option value="Other (see source)">Other (see source)</option>
          </select>
          <NumField label="Stated horizontal uncertainty" unit="m" value={nav.uncertaintyM} min={0} max={100000} onChange={(v) => patchInputs('nav', { uncertaintyM: v })} />
          <label className="hz-field" htmlFor={`${id}-d`}>
            What the number means
          </label>
          <select id={`${id}-d`} className="hz-select" value={nav.definition} onChange={(e) => patchInputs('nav', { definition: e.target.value })}>
            <option value="">Not stated</option>
            <option value="1σ">1σ (one standard deviation)</option>
            <option value="2σ">2σ</option>
            <option value="95% confidence">95% confidence</option>
            <option value="maximum error">Maximum error</option>
          </select>
          <label className="hz-field" htmlFor={`${id}-u`}>
            Last reliable update
          </label>
          <input id={`${id}-u`} className="hz-text" value={nav.lastUpdate} placeholder="e.g. 2041-03-02 14:20 UTC" onChange={(e) => patchInputs('nav', { lastUpdate: e.target.value })} />
          <label className="hz-field" htmlFor={`${id}-s`}>
            Source of the estimate
          </label>
          <input id={`${id}-s`} className="hz-text" value={nav.source} placeholder="Document or model" onChange={(e) => patchInputs('nav', { source: e.target.value })} />
        </div>
        {nav.uncertaintyM == null ? (
          <p className="hz-callout">Position uncertainty has not been quantified.</p>
        ) : (
          <p className="hz-muted">Drawn as dashed rings of {nav.uncertaintyM} m around each route stop (user input{nav.definition ? `, ${nav.definition}` : ', definition not stated'}).</p>
        )}
      </Section>
      <Section n={2} title="Map registration and coverage">
        <Rows
          rows={[
            ['USGS fault and pit lines', 'Mapped at 1:20,000,000: positions uncertain by kilometres'],
            ['USGS dune-field outlines', 'Outlined at about 1:75,000 on 100 m/px THEMIS images'],
            ['MOLA terrain', '16 px per degree: ~3.7 km cells'],
            ['Base imagery', NA('Registration accuracy not quantified in this project')],
          ]}
        />
        <p className="hz-muted">No percentage or metre value is derived from the map’s appearance. Earth GPS is not available on Mars.</p>
      </Section>
      <Common code="N" n0={3} />
    </>
  );
}

/* ---------------------------------------------------------------- energy */

function EnergyDetails() {
  const snapshot = useMissionConstraints();
  const inputs = useEnvInputs();
  const e = inputs.energy;
  const b = energyBudget(snapshot, inputs);
  const setItem = (uid: string, patch: Partial<{ powerW: number | null; hoursOverride: number | null }>) =>
    patchInputs('energy', { items: { ...e.items, [uid]: { ...(e.items[uid] ?? { powerW: null, hoursOverride: null }), ...patch } } });
  return (
    <>
      <Section n={1} title="Energy available">
        <div className="hz-form">
          <NumField label="Usable energy at departure" unit="Wh" value={e.availableWh} min={0} onChange={(v) => patchInputs('energy', { availableWh: v })} />
          <fieldset className="hz-radios">
            <legend>Does this figure already allow for derating and losses?</legend>
            {(
              [
                [true, 'Yes, already included'],
                [false, 'No: apply a documented loss'],
                [null, 'Not stated'],
              ] as [boolean | null, string][]
            ).map(([v, label]) => (
              <label key={label}>
                <input type="radio" name="hz-losses" checked={e.lossesIncluded === v} onChange={() => patchInputs('energy', { lossesIncluded: v })} /> {label}
              </label>
            ))}
          </fieldset>
          {e.lossesIncluded === false && (
            <NumField label="Documented losses" unit="% of required" value={e.lossPercent} min={0} max={100} onChange={(v) => patchInputs('energy', { lossPercent: v })} />
          )}
          <NumField label="Mission-defined reserve" unit="Wh" value={e.reserveWh} min={0} onChange={(v) => patchInputs('energy', { reserveWh: v })} />
        </div>
      </Section>
      <Section n={2} title="Consumption">
        {!snapshot ? (
          <p className="hz-callout">Add route and task durations in the Mission Planner; its equipment list appears here.</p>
        ) : (
          <table className="hz-table">
            <thead>
              <tr>
                <th>Item</th>
                <th>Power</th>
                <th>Hours</th>
                <th>Energy</th>
              </tr>
            </thead>
            <tbody>
              {b.rows
                .filter((r) => snapshot.items.some((i) => i.uid === r.key))
                .map((r) => (
                  <tr key={r.key}>
                    <td>{r.name}</td>
                    <td>
                      <NumField label={`${r.name} power`} unit="W" value={e.items[r.key]?.powerW ?? null} min={0} onChange={(v) => setItem(r.key, { powerW: v })} />
                    </td>
                    <td>
                      <NumField
                        label={`${r.name} hours`}
                        unit="h"
                        value={e.items[r.key]?.hoursOverride ?? null}
                        min={0}
                        onChange={(v) => setItem(r.key, { hoursOverride: v })}
                        hint={r.hoursSource === 'planner schedule' && e.items[r.key]?.hoursOverride == null ? `${r.hours!.toFixed(2)} h from the planner` : r.hoursSource === 'missing' ? 'Not scheduled' : undefined}
                      />
                    </td>
                    <td>{r.wh != null ? fmtWh(r.wh) : NA('—')}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        )}
        <OtherLoads />
      </Section>
      <Section n={3} title="Budget">
        {b.problems.length ? (
          <ul className="hz-list">
            {b.problems.map((p) => (
              <li key={p} className="hz-tone--warn">
                {p}
              </li>
            ))}
          </ul>
        ) : null}
        <Rows
          rows={[
            ['Required (known items)', b.rows.some((r) => r.powerW != null) ? fmtWh(b.knownWh) : NA('Enter equipment power')],
            ['Losses added', b.lossesWh != null ? (e.lossesIncluded ? 'None (already included in the available energy)' : fmtWh(b.lossesWh)) : NA('Not determined')],
            ['Total required', b.requiredWh != null ? fmtWh(b.requiredWh) : NA('Not calculated')],
            ['Available', e.availableWh != null ? fmtWh(e.availableWh) : NA('Not entered')],
            ['Remaining', b.remainingWh != null ? <span className={b.remainingWh < 0 ? 'hz-tone--error' : ''}>{fmtWh(b.remainingWh)}{b.remainingWh < 0 ? ' (plan exceeds the budget)' : ''}</span> : NA('Not calculated')],
            ['Reserve', e.reserveWh != null ? fmtWh(e.reserveWh) : NA('Not entered')],
            ['Margin above reserve', b.marginAboveReserveWh != null ? <span className={b.marginAboveReserveWh < 0 ? 'hz-tone--error' : ''}>{fmtWh(b.marginAboveReserveWh)}</span> : NA('Not calculated')],
          ]}
        />
        {b.missing.length > 0 && <p className="hz-muted">Without power or hours: {b.missing.join(', ')}.</p>}
        <p className="hz-muted">requiredEnergy = Σ power × hours; remaining = available − required; margin above reserve = remaining − reserve. No charging is assumed.</p>
      </Section>
      <Common
        code="E"
        n0={4}
        route={
          snapshot ? (
            <ul className="hz-list hz-list--plain">
              {b.byStop.map((s) => (
                <li key={s.key}>
                  {s.label}: scheduled equipment energy by here {fmtWh(s.cumulativeWh)}
                </li>
              ))}
              <li className="hz-muted">From items with entered power and the planner’s schedule; items with your own hours are counted in the total only.</li>
            </ul>
          ) : (
            <p>No route is planned.</p>
          )
        }
      />
    </>
  );
}

function OtherLoads() {
  const inputs = useEnvInputs();
  const other = inputs.energy.other;
  const set = (o: typeof other) => patchInputs('energy', { other: o });
  return (
    <div className="hz-other">
      <p className="hz-sub">Other loads (lights, heaters, radios)</p>
      {other.map((o) => (
        <div key={o.id} className="hz-other__row">
          <input className="hz-text hz-text--sm" value={o.name} placeholder="Name" aria-label="Load name" onChange={(e) => set(other.map((x) => (x.id === o.id ? { ...x, name: e.target.value } : x)))} />
          <NumField label="Power" unit="W" value={o.powerW} min={0} onChange={(v) => set(other.map((x) => (x.id === o.id ? { ...x, powerW: v } : x)))} />
          <NumField label="Hours" unit="h" value={o.hours} min={0} onChange={(v) => set(other.map((x) => (x.id === o.id ? { ...x, hours: v } : x)))} />
          <button type="button" className="hz-link" onClick={() => set(other.filter((x) => x.id !== o.id))}>
            Remove
          </button>
        </div>
      ))}
      <button type="button" className="hz-btn hz-btn--ghost hz-btn--sm" onClick={() => set([...other, { id: newId(), name: '', powerW: null, hours: null }])}>
        Add a load
      </button>
    </div>
  );
}

/* -------------------------------------------------------- load and time */

function LoadDetails() {
  const snapshot = useMissionConstraints();
  const inputs = useEnvInputs();
  const l = inputs.load;
  if (!snapshot)
    return (
      <Section n={1} title="Load and timeline">
        <p className="hz-callout">Add route and task durations in the Mission Planner.</p>
      </Section>
    );
  const t = loadTimeline(snapshot, inputs);
  return (
    <>
      <Section n={1} title="Carried load">
        <Rows
          rows={[
            ...snapshot.carriers.map((c) => [c.label, `${c.kg.toFixed(1)} kg`] as [string, ReactNode]),
            ['Not assigned to a carrier', `${snapshot.unallocatedKg.toFixed(1)} kg`],
            ['Equipment with unknown mass', snapshot.unknownMassItems.length ? snapshot.unknownMassItems.join(', ') : 'None'],
            ['Counted with the suit', `${snapshot.inSuitKg.toFixed(1)} kg (not added again)`],
            ['Suit mass', snapshot.suitMassAssumptionKg != null ? `${snapshot.suitMassAssumptionKg} kg (your assumption)` : NA('No verified value; none entered in the planner')],
          ]}
        />
        <NumField label="Expected sample mass collected" unit="kg" value={l.sampleKg} min={0} onChange={(v) => patchInputs('load', { sampleKg: v })} />
        <p className="hz-muted">Masses in kg are not reduced on Mars; weight there is mass × 3.71 N/kg. Equipment masses come from the planner (many are demo estimates there).</p>
      </Section>
      <Section n={2} title="Timeline">
        <table className="hz-table">
          <thead>
            <tr>
              <th>Stop</th>
              <th>Arrive</th>
              <th>Leave</th>
            </tr>
          </thead>
          <tbody>
            {t.stops.map((s, i) => (
              <tr key={s.key}>
                <td>{s.label}</td>
                <td>{i === 0 ? '—' : s.arriveMin != null ? `+${fmtMinutes(s.arriveMin)}` : NA('Unknown')}</td>
                <td>{s.departMin != null ? `+${fmtMinutes(s.departMin)}` : NA('Unknown')}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="hz-form">
          <NumField label="Breaks" unit="min" value={l.breakMinutes} min={0} onChange={(v) => patchInputs('load', { breakMinutes: v })} />
          <NumField label="Contingency" unit="min" value={l.contingencyMinutes} min={0} onChange={(v) => patchInputs('load', { contingencyMinutes: v })} />
          <label className="hz-check">
            <input type="checkbox" checked={l.includeReturn} onChange={(e) => patchInputs('load', { includeReturn: e.target.checked })} />
            <span>Add the return to the start along the same line ({fmtMinutes(snapshot.returnHours * 60)}, the planner’s estimate)</span>
          </label>
        </div>
        <Rows
          rows={[
            ['Travel', fmtMinutes(t.travelMin)],
            ['Tasks', snapshot.unknownTasks ? <>{fmtMinutes(t.taskMin)} {NA(`+ ${snapshot.unknownTasks} with unknown time`)}</> : fmtMinutes(t.taskMin)],
            ['Breaks', t.breakMin != null ? fmtMinutes(t.breakMin) : NA('Not entered')],
            ['Contingency', t.contingencyMin != null ? fmtMinutes(t.contingencyMin) : NA('Not entered')],
            ['Return', t.returnMin != null ? fmtMinutes(t.returnMin) : 'Not included'],
            ['Mission total', t.missionMin != null ? fmtMinutes(t.missionMin) : NA(`Missing: ${t.missing.join(', ').toLowerCase()}`)],
            ['Available (planner)', fmtMinutes(t.availableMin)],
            ['Margin', t.marginMin != null ? <span className={t.marginMin < 0 ? 'hz-tone--error' : ''}>{fmtMinutes(t.marginMin)}</span> : NA('Not calculated')],
          ]}
        />
        <p className="hz-muted">segment time = 60 × km ÷ speed ({snapshot.speedKmh} km/h, the planner’s assumption). No fatigue percentage or minutes-per-kilogram penalty is used; the timeline is a plan, not physiological telemetry.</p>
      </Section>
      <Common code="M" n0={3} />
    </>
  );
}

/* ------------------------------------------------------------- coverage */

function CoverageDetails() {
  return (
    <>
      <Section n={1} title="What each dataset covers">
        <table className="hz-table hz-table--wide">
          <thead>
            <tr>
              <th>Dataset</th>
              <th>Footprint</th>
              <th>Resolution / scale</th>
              <th>Date</th>
              <th>What it assesses</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>MOLA MEGDR (terrain)</td>
              <td>Global</td>
              <td>~3.7 km cells</td>
              <td>1997–2001</td>
              <td>Elevation; slope derived from it</td>
            </tr>
            <tr>
              <td>USGS SIM 3292 (geologic map)</td>
              <td>Global</td>
              <td>1:20,000,000</td>
              <td>Published 2014</td>
              <td>Mapped trough and pit-chain axes</td>
            </tr>
            <tr>
              <td>USGS MGD³ (dunes)</td>
              <td>65° N–65° S</td>
              <td>~1:75,000 (THEMIS 100 m/px)</td>
              <td>Published 2007</td>
              <td>Dune-field outlines ≳ 1 km²</td>
            </tr>
            <tr>
              <td>NASA image records (60)</td>
              <td>Image locations only</td>
              <td>Varies by image</td>
              <td>Per record</td>
              <td>Presence of a feature; no extent</td>
            </tr>
          </tbody>
        </table>
      </Section>
      <Section n={2} title="What remains unassessed">
        <p>
          Image coverage, terrain-data coverage and a walking assessment are different things. None of the data here assesses ground at walking scale: footing,
          small obstacles, local slopes and current conditions are unknown everywhere. The grey crosshatch therefore covers all terrain when shown.
        </p>
        <Rows rows={[['Suitability for a local task', 'Not suitable on its own: local imagery or reconnaissance is required']]} />
      </Section>
      <Common code="U" n0={3} />
    </>
  );
}
