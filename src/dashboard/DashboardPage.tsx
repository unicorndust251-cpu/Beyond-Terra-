import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { selectedLocationStore, useMapBridge, type MarsCoordinate, type SelectedLocation } from '../shared';
import { useFocusedLocation } from '../shared/focus';
import { formatLandmarkCoordinates, landmarkById, searchLandmarks, selectedLandmarkStore } from '../shared/landmarks';
import { useActiveMission } from '../mission-planning';
import { CARRIER_LABELS, describeKnownMass, provenanceCounts } from '../mission-planning/loadout';
import { MASS_GROUP_LABELS, type MassGroup } from '../mission-planning/data/equipment';
import { TASKS } from '../mission-planning/data/science';
import { formatDuration, formatKm, locationName, parseCoordinate } from '../mission-planning/geo';
import {
  durationSummary,
  equipmentSummary,
  missingSuggestedEquipment,
  ROUTE_STATUS_LABELS,
  routeMetrics,
  routeStatus,
  routeStops,
} from '../mission-planning/model';
import { quadrangleAt } from '../science/workspace/quadrangles';
import MetricCard from './MetricCard';
import { environmentalUnavailable, fmtCoord, terrainValues, useTerrain, type SciValue } from './metrics';
import { formatClock, localSolar, marsTime, SOL_SECONDS } from './science/marsTime';
import { EARTH_GRAVITY, MARS_GRAVITY, martianSeason, weightNewtons } from './science/seasonsAndUnits';
import { solarEvents } from './science/solarEvents';
import SolarCyclePanel from './SolarCyclePanel';
import { SOURCES } from './sources';
import { useSimTime } from './timeStore';
import './dashboard.css';

interface Props {
  active: boolean;
  /** Leave the dashboard for the map (optionally the planner on a tab). */
  onOpenMap: () => void;
  onOpenExplore: () => void;
}

function Section({ title, children, defaultOpen = false, id }: { title: string; children: ReactNode; defaultOpen?: boolean; id?: string }) {
  return (
    <details className="md-sec" open={defaultOpen} id={id}>
      <summary>{title}</summary>
      <div className="md-sec__body">{children}</div>
    </details>
  );
}


/** Preset Help Corner explanations (not an AI assistant). */
const HELP: Array<[string, string]> = [
  ['What are LMST and LTST?', 'Local Mean Solar Time follows a uniform “average Sun”: noon every 24 Mars hours. Local True Solar Time follows the real Sun, which runs up to ~50 minutes ahead or behind because Mars’s orbit is elliptical and its axis tilted (the equation of time). Sundials and the day/night panel use LTST.'],
  ['What is solar longitude Ls?', 'Ls is Mars’s position around the Sun, from 0° at the northern spring equinox to 360°. Seasons are defined by Ls: 0–90° northern spring, 90–180° summer, 180–270° autumn, 270–360° winter. Because the orbit is eccentric, the seasons are not equally long.'],
  ['How are sunrise and sunset found?', 'The Sun’s elevation is computed with NASA’s Mars24 algorithm through the whole sol, and the moments its centre crosses a flat horizon are found numerically. Hills, crater walls and refraction are not included, so a real horizon can change the times.'],
  ['What is solar elevation?', 'The Sun’s angle above the horizon: 0° on the horizon, 90° straight overhead, negative below the horizon (night).'],
  ['Air temperature vs surface temperature', 'Air temperature is measured in the atmosphere about 1–2 m up; ground (surface) temperature is the soil or rock itself, which swings much more between day and night. They are different quantities and are never mixed here.'],
  ['Elevation vs slope', 'Elevation is height above the Mars reference surface (the areoid). Slope is how steep the ground is, computed from neighbouring elevations over a stated horizontal distance — a coarse grid can hide steep ground.'],
  ['What is the areoid?', 'Mars has no sea level. Heights are measured from the areoid, a reference surface of equal gravitational potential defined from MOLA data.'],
  ['Surface Material', 'The card shows the mapped geologic unit from the USGS Geologic Map of Mars. Units describe age and geologic setting at a 1:20 million scale, not the exact rock or soil under your feet.'],
  ['Why is data unavailable?', 'Weather instruments only measure where a lander or rover is, and this build has not yet connected an extracted MEDA dataset or a climate model. Rather than invent a number, the dashboard says so.'],
  ['How do I choose a location?', 'Search a landmark or type coordinates above, pick a landmark on the globe (Explore), click the map, or use a stop of your mission plan.'],
  ['How do I open the Mission Planner?', 'Use “Mission Planner” in the top bar, or “Open Mission Planner” in the Current Mission section. Your plan is kept while you switch views.'],
];

/** The Mars Dashboard: location, terrain, solar time and the active mission in one view. */
export default function DashboardPage({ active, onOpenMap, onOpenExplore }: Props) {
  const root = useRef<HTMLDivElement>(null);
  const focus = useFocusedLocation();
  const mission = useActiveMission();
  const bridge = useMapBridge();
  const { utcMs, clock: sim } = useSimTime();
  const [query, setQuery] = useState('');
  const [latText, setLatText] = useState('');
  const [lonText, setLonText] = useState('');
  const [coordError, setCoordError] = useState<string | null>(null);
  const [massKg, setMassKg] = useState('10');
  const [helpTopic, setHelpTopic] = useState(0);

  useEffect(() => {
    if (root.current) root.current.inert = !active;
  }, [active]);

  // The location: the shared focus, or else the mission's start
  const location: SelectedLocation | null = useMemo(() => {
    if (focus) return focus;
    const s = mission?.state.start;
    return s ? { coordinate: s.coordinate, name: s.name, source: 'mission-plan' } : null;
  }, [focus, mission?.state.start]);
  const c = location?.coordinate ?? null;
  const landmark = landmarkById(location?.landmarkId);

  // Solar time
  const t = useMemo(() => marsTime(utcMs), [utcMs]);
  const solar = c ? localSolar(t, c.latitude, c.longitudeEast) : null;
  // Sol events: recomputed only when the place changes or time leaves the current sol
  const [events, setEvents] = useState<ReturnType<typeof solarEvents> | null>(null);
  useEffect(() => {
    if (!c) return;
    if (events && events.solStartMs <= utcMs && utcMs < events.solEndMs && (events as { key?: string }).key === `${c.latitude},${c.longitudeEast}`) return;
    const ev = Object.assign(solarEvents(utcMs, c.latitude, c.longitudeEast), { key: `${c.latitude},${c.longitudeEast}` });
    setEvents(ev);
    // events is compared above
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [utcMs, c?.latitude, c?.longitudeEast]);
  const season = c ? martianSeason(t.Ls, c.latitude) : null;

  const { terrain, loading, error } = useTerrain(c);
  const tv = terrainValues(terrain, loading);
  const quad = c ? quadrangleAt(c.latitude, c.longitudeEast) : null;

  /* ---------------------------------------------------------- selection */
  const chooseLandmark = (id: string) => {
    selectedLandmarkStore.set(id);
    setQuery('');
  };
  const chooseCoordinate = () => {
    const r = parseCoordinate(latText, lonText);
    if ('coordinate' in r) {
      setCoordError(null);
      selectedLocationStore.set({ coordinate: r.coordinate, source: 'manual' });
    } else setCoordError([r.latError, r.lonError].filter(Boolean).join(' '));
  };
  const chooseStop = (coordinate: MarsCoordinate, name?: string) => selectedLocationStore.set({ coordinate, name, source: 'mission-plan' });
  const viewOnMap = () => {
    if (!c || !location) return;
    // Show it on the map with the map's own selected-point card; a landmark keeps its catalogue record
    selectedLocationStore.set({ ...location });
    bridge?.flyTo(c, { zoom: Math.max(bridge.getView().zoom, 6) });
    onOpenMap();
  };
  const suggestions = query.trim() ? searchLandmarks(query).slice(0, 6) : [];

  /* ------------------------------------------------------------- cards */
  const locationValue: SciValue = c
    ? {
        value: landmark ? landmark.name : locationName(location?.name),
        detail: `${fmtCoord(c)}${quad ? ` · ${quad.code} ${quad.name}` : ''}`,
        status: 'observed',
        sourceName: landmark ? 'USGS/IAU Gazetteer feature centre (landmark catalogue)' : location?.source === 'mission-plan' ? 'Mission plan stop' : 'Selected point',
        sourceUrl: landmark?.coordinateSource,
        appliesTo: landmark ? 'Feature centre — not a landing or sampling site' : 'The selected point',
        method: 'Planetocentric latitude, east longitude 0–360°. Region: USGS Mars chart quadrangle.',
      }
    : { value: null, status: 'unavailable', detail: 'Select a location' };
  const airT = environmentalUnavailable('air temperature');
  const groundT = environmentalUnavailable('ground (surface) temperature');
  const wind = environmentalUnavailable('wind');
  const pressure = environmentalUnavailable('pressure');
  const timeValue: SciValue = solar
    ? {
        value: formatClock(solar.LTST),
        detail: `LTST · LMST ${formatClock(solar.LMST)} · MST ${formatClock(t.MST)}`,
        status: 'calculated',
        sourceName: 'NASA GISS Mars24 algorithm',
        sourceUrl: SOURCES[0].url,
        method: 'LMST = MST + λE/15; LTST = LMST + EOT/15 (Mars24 C-1…C-4).',
        uncertainty: 'Validated against both Mars24 worked examples (to < 1 s).',
        appliesTo: c ? fmtCoord(c) : undefined,
      }
    : { value: null, status: 'unavailable', detail: 'Select a location' };
  const seasonValue: SciValue = season
    ? {
        value: `${season.hemisphere} ${season.season}`,
        detail: `Ls = ${t.Ls.toFixed(1)}°${season.equatorConvention ? ' · equator: northern naming convention' : ''}`,
        status: 'calculated',
        sourceName: 'Ls from NASA Mars24 (B-5)',
        sourceUrl: SOURCES[0].url,
        method: 'Northern spring Ls 0–90°, summer 90–180°, autumn 180–270°, winter 270–360°; the south has the opposite season.',
        limitations: 'Astronomical season only; it says nothing about local weather.',
      }
    : { value: null, status: 'unavailable', detail: 'Select a location' };
  const mass = Number(massKg);
  const gravityValue: SciValue = {
    value: `${MARS_GRAVITY} m/s²`,
    detail: `${((MARS_GRAVITY / EARTH_GRAVITY) * 100).toFixed(0)} % of Earth’s ${EARTH_GRAVITY.toFixed(2)} m/s²`,
    status: 'assumed',
    sourceName: 'NASA Mars Fact Sheet (mean surface reference)',
    sourceUrl: 'https://nssdc.gsfc.nasa.gov/planetary/factsheet/marsfact.html',
    method: 'Weight (N) = mass (kg) × 3.71 m/s². Mass does not change on Mars.',
    limitations: 'A planet-wide reference value, not a measurement at this point (local gravity varies slightly with latitude and elevation).',
  };

  /* ----------------------------------------------------------- mission */
  const m = mission?.state;
  const metrics = m ? routeMetrics(m) : null;
  const duration = m && metrics ? durationSummary(m, metrics) : null;
  const eq = m ? equipmentSummary(m) : null;
  const stops = m ? routeStops(m) : [];
  const hasMission = !!m && stops.some((s) => s.location);

  return (
    <div ref={root} className="md" aria-hidden={!active}>
      <header className="md-top">
        <span className="md-top__brand">BEYOND TERRA</span>
        <nav className="md-top__nav" aria-label="Sections">
          <button type="button" onClick={onOpenExplore}>
            Explore
          </button>
          <button type="button" onClick={onOpenMap}>
            Mission Planner
          </button>
          <button type="button" className="is-active" aria-current="page">
            Mars Dashboard
          </button>
        </nav>
      </header>

      <main className="md-main">
        <section className="md-head" aria-label="Location and time">
          <div className="md-head__title">
            <h1>Mars Dashboard</h1>
            <p className="md-head__place">
              {c ? (
                <>
                  <strong>{landmark ? landmark.name : locationName(location?.name)}</strong>{' '}
                  <span className="md-num">{landmark ? formatLandmarkCoordinates(landmark) : fmtCoord(c)}</span>
                  {landmark && <span className="md-tag">Landmark</span>}
                  {!landmark && location?.source === 'mission-plan' && <span className="md-tag">Mission stop</span>}
                  {!landmark && location?.source !== 'mission-plan' && <span className="md-tag">Custom location</span>}
                </>
              ) : (
                'No location selected'
              )}
            </p>
            <p className="md-head__time md-num">
              UTC {new Date(utcMs).toISOString().replace('T', ' ').slice(0, 19)}
              {solar && ` · LTST ${formatClock(solar.LTST)}`} · <span className="md-mode">{sim.live ? 'Live clock' : sim.playing ? 'Simulated time' : 'Selected time'}</span> ·
              terrain from archived datasets · no live weather
            </p>
          </div>
          <div className="md-head__find">
            <div className="md-search">
              <input
                type="search"
                value={query}
                placeholder="Search the 46 landmarks"
                aria-label="Search landmarks"
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && suggestions[0] && chooseLandmark(suggestions[0].id)}
              />
              {suggestions.length > 0 && (
                <ul className="md-search__list">
                  {suggestions.map((l) => (
                    <li key={l.id}>
                      <button type="button" onClick={() => chooseLandmark(l.id)}>
                        {l.name} <small>{formatLandmarkCoordinates(l)}</small>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <form
              className="md-coords"
              onSubmit={(e) => {
                e.preventDefault();
                chooseCoordinate();
              }}
            >
              <input aria-label="Latitude" placeholder="Lat, e.g. 18.4" value={latText} onChange={(e) => setLatText(e.target.value)} />
              <input aria-label="Longitude (east)" placeholder="Lon E, e.g. 77.5" value={lonText} onChange={(e) => setLonText(e.target.value)} />
              <button type="submit" className="md-btn">
                Go
              </button>
            </form>
            {coordError && (
              <p className="md-error" role="alert">
                {coordError}
              </p>
            )}
            <div className="md-head__actions">
              <button type="button" className="md-btn" onClick={onOpenMap} title="The next point you click on the map becomes the dashboard location">
                Select on Map
              </button>
              <button type="button" className="md-btn md-btn--primary" disabled={!c} onClick={viewOnMap}>
                View on Map
              </button>
            </div>
            {hasMission && (
              <div className="md-stops" aria-label="Mission stops">
                <span>Mission stops:</span>
                {stops
                  .filter((s) => s.location)
                  .map((s) => (
                    <button key={s.key} type="button" className="md-chip" onClick={() => chooseStop(s.location!.coordinate, s.location!.name ?? s.label)}>
                      {s.label}
                    </button>
                  ))}
              </div>
            )}
          </div>
        </section>

        {!c ? (
          <p className="md-empty">Choose a landmark, enter coordinates, or select a point on the map to see its dashboard.</p>
        ) : (
          <>
            <div className="md-row md-row--six">
              <MetricCard title="Location" v={locationValue} />
              <MetricCard title="Elevation" v={tv.elevation} />
              <MetricCard title="Slope" v={tv.slope} />
              <MetricCard title="Surface Material" v={tv.material} />
              <MetricCard title="Air Temperature" v={airT} />
              <MetricCard title="Surface Temperature" v={groundT} />
            </div>
            {error && <p className="md-error">Terrain data could not be loaded: {error}</p>}

            {events && solar && <SolarCyclePanel utcMs={utcMs} sim={sim} latitude={c.latitude} longitudeEast={c.longitudeEast} events={events} />}

            <div className="md-row md-row--five">
              <MetricCard title="Local Mars Time" v={timeValue} />
              <MetricCard title="Martian Season" v={seasonValue} />
              <MetricCard title="Wind" v={wind} />
              <MetricCard title="Pressure" v={pressure} />
              <MetricCard title="Gravity" v={gravityValue}>
                <label className="md-calc">
                  <span>Mass</span>
                  <input inputMode="decimal" value={massKg} aria-label="Equipment mass in kilograms" onChange={(e) => setMassKg(e.target.value)} />
                  <span>kg →</span>
                  <strong className="md-num">{Number.isFinite(mass) && mass >= 0 ? `${weightNewtons(mass).toFixed(1)} N` : '—'}</strong>
                </label>
              </MetricCard>
            </div>

            <div className="md-secs">
              <Section title="Environmental Conditions">
                <p>
                  No temperature, pressure, wind, humidity, dust-opacity or visibility value is shown for this location: no suitable observation or
                  documented model is connected to this build, and nothing is estimated in its place.
                </p>
                <ul className="md-list">
                  <li>
                    <strong>Perseverance MEDA</strong> measures air and ground temperature, pressure, wind, humidity and radiation/dust — but only at the
                    rover in Jezero crater. Its archive (CSV, multi-GB) has no API and needs an offline, quality-filtered extract before it can be shown,
                    labelled as a Jezero observation with its date.
                  </li>
                  <li>
                    <strong>Mars Climate Database</strong> model output could give modelled values anywhere; it is not connected, and would be labelled
                    Modelled.
                  </li>
                  <li>Pressure is not computed from elevation alone: actual pressure depends on season and weather.</li>
                </ul>
              </Section>

              <Section title="Terrain and Surface" defaultOpen>
                <dl className="md-facts md-num">
                  <div>
                    <dt>Elevation</dt>
                    <dd>{tv.elevation.value ?? tv.elevation.detail}</dd>
                  </div>
                  <div>
                    <dt>Slope</dt>
                    <dd>
                      {tv.slope.value ?? tv.slope.detail} {tv.slope.value && <small>({tv.slope.detail})</small>}
                    </dd>
                  </div>
                  <div>
                    <dt>Local relief</dt>
                    <dd>
                      {tv.relief.value ?? tv.relief.detail} {tv.relief.value && <small>({tv.relief.detail})</small>}
                    </dd>
                  </div>
                  <div>
                    <dt>Local 20 m DTM</dt>
                    <dd>{terrain?.local.elevation.status === 'available' ? 'Inside the Jezero CTX DTM footprint' : 'Outside the only local DTM (western Jezero); regional MOLA values shown'}</dd>
                  </div>
                  <div>
                    <dt>MOLA shots in bin</dt>
                    <dd>{terrain?.regional.shots.value ?? '—'}</dd>
                  </div>
                  <div>
                    <dt>Contours, curvature</dt>
                    <dd>Not assessed at this point (no curvature product is read here). Curvature is not depth.</dd>
                  </div>
                  <div>
                    <dt>Rocks and small obstacles</dt>
                    <dd>{terrain?.smallObstacles.note ?? 'Not assessed'}</dd>
                  </div>
                </dl>
                <p className="md-note">Elevation, slope and relief layers can be turned on in the map’s Layers menu.</p>
                <button type="button" className="md-btn" onClick={viewOnMap}>
                  View on Map
                </button>
              </Section>

              <Section title="Geology, Minerals and Ice">
                <h4>Observed (mapped)</h4>
                <p>{tv.material.value ? `${tv.material.value}: ${tv.material.detail}` : tv.material.detail}</p>
                <p className="md-note">USGS Geologic Map of Mars (1:20 M): a geologic unit by age and setting, not a measured composition.</p>
                {landmark ? (
                  <>
                    <h4>Mapped terrain context (landmark record)</h4>
                    <p>{landmark.terrain}</p>
                    <h4>Interpreted (scientific significance)</h4>
                    <p>{landmark.importance}</p>
                    <h4>Possible (proposed investigation)</h4>
                    <p>{landmark.investigation}</p>
                  </>
                ) : (
                  <p className="md-note">No mineral, water or ice record is attached to this exact location.</p>
                )}
                <p className="md-note">Evidence of ice or water-related minerals is not evidence of accessible or usable water.</p>
              </Section>

              <Section title="Hazards">
                <p>
                  The Hazards module is not part of this build, so no hazard observations are shown. The absence of a marker does not mean a location or
                  route is safe.
                </p>
              </Section>

              <Section title="Radiation">
                <p>
                  No radiation dataset or model is connected, so no dose rate or dose is shown. (Surface radiation measurements exist only where
                  instruments operated, e.g. Curiosity’s RAD at Gale crater, and are not transferable to other places.)
                </p>
              </Section>

              <Section title="Rover Imagery">
                <p>No rover-imagery service is connected to this build, so no ground image is shown for this location.</p>
              </Section>

              <Section title="Scientific Importance" defaultOpen={!!landmark}>
                {landmark ? (
                  <>
                    <h4>{landmark.name}</h4>
                    <p>{landmark.importance}</p>
                    <p className="md-note">Proposed investigation: {landmark.investigation}</p>
                    {landmark.qualification && <p className="md-note">About this coordinate: {landmark.qualification}</p>}
                    <button
                      type="button"
                      className="md-btn"
                      onClick={() => {
                        selectedLandmarkStore.set(landmark.id);
                        onOpenExplore();
                      }}
                    >
                      Open Landmark Flashcard
                    </button>
                  </>
                ) : (
                  <p>No landmark-specific scientific summary available for this exact location.</p>
                )}
              </Section>
            </div>
          </>
        )}

        <h2 className="md-h2">Mission</h2>
        {!hasMission || !m || !metrics || !duration || !eq ? (
          <div className="md-mission-empty">
            <p>
              <strong>No active mission</strong>
            </p>
            <button
              type="button"
              className="md-btn md-btn--primary"
              onClick={() => {
                mission?.openTab('route');
                onOpenMap();
              }}
            >
              Plan a Mission
            </button>
          </div>
        ) : (
          <div className="md-secs">
            <Section title="Current Mission and Route" defaultOpen>
              <dl className="md-facts md-num">
                <div>
                  <dt>Mission</dt>
                  <dd>
                    {mission?.savedName ?? 'Unsaved plan'}
                    {mission?.dirty && mission.savedName ? ' (unsaved changes)' : ''}
                  </dd>
                </div>
                <div>
                  <dt>Status</dt>
                  <dd>{ROUTE_STATUS_LABELS[routeStatus(m)]}</dd>
                </div>
                <div>
                  <dt>Start</dt>
                  <dd>{m.start ? `${locationName(m.start.name)} · ${fmtCoord(m.start.coordinate)}` : 'Not set'}</dd>
                </div>
                <div>
                  <dt>Destination</dt>
                  <dd>{m.destination ? `${locationName(m.destination.name)} · ${fmtCoord(m.destination.coordinate)}` : 'Not set'}</dd>
                </div>
                <div>
                  <dt>Checkpoints</dt>
                  <dd>{m.checkpoints.length}</dd>
                </div>
                <div>
                  <dt>Route distance</dt>
                  <dd>{metrics.segments.length ? `${formatKm(metrics.totalKm)} (direct great-circle estimate)` : '—'}</dd>
                </div>
                <div>
                  <dt>Travel time</dt>
                  <dd>{metrics.segments.length ? `${formatDuration(duration.travelHours)} at ${m.speedKmh[m.travelMode]} km/h (${m.travelMode})` : '—'}</dd>
                </div>
                <div>
                  <dt>Science tasks</dt>
                  <dd>
                    {formatDuration(duration.taskHours)}
                    {duration.unknownTasks ? ` + ${duration.unknownTasks} unknown` : ''}
                  </dd>
                </div>
                <div>
                  <dt>Total planned</dt>
                  <dd>
                    {metrics.segments.length ? formatDuration(duration.totalHours) : '—'} of {formatDuration(duration.availableHours)} available
                  </dd>
                </div>
                <div>
                  <dt>Breaks, contingency, return</dt>
                  <dd>Not modelled by the planner</dd>
                </div>
              </dl>
              <div className="md-actions">
                <button type="button" className="md-btn md-btn--primary" onClick={() => { mission?.openTab('route'); onOpenMap(); }}>
                  Open Mission Planner
                </button>
                <button type="button" className="md-btn" onClick={() => { mission?.openTab('summary'); onOpenMap(); }}>
                  Review Mission
                </button>
                <button type="button" className="md-btn" onClick={() => { mission?.openTab('saved'); onOpenMap(); }}>
                  Saved Missions
                </button>
              </div>
              <p className="md-note">Distances and times come from the planner’s own calculations. Plans are saved in this browser only.</p>
            </Section>

            <Section title="Checkpoints and Science Tasks">
              {m.checkpoints.length === 0 && Object.values(m.tasks).flat().length === 0 ? (
                <p>No checkpoints or tasks planned.</p>
              ) : (
                <ol className="md-cps">
                  {stops.map((s, i) => {
                    const seg = metrics.segments.find((x) => x.to.key === s.key);
                    const tasks = m.tasks[s.key] ?? [];
                    const timings = duration.timings.filter((x) => x.stop === s.key);
                    return (
                      <li key={s.key}>
                        <div className="md-cps__head">
                          <strong>{s.label}</strong>
                          <span>{s.location ? `${locationName(s.location.name)} · ${fmtCoord(s.location.coordinate)}` : 'Not set'}</span>
                          {seg && i > 0 && <span className="md-num">{formatKm(seg.km)} from previous stop</span>}
                        </div>
                        {tasks.length > 0 && (
                          <ul>
                            {timings.map((x) => (
                              <li key={x.task}>
                                {TASKS[x.task].name} · {x.minutes === null ? 'time unknown' : `${Math.round(x.minutes)} min`} ({x.source === 'equipment' ? 'equipment time' : 'task estimate'})
                                {x.activities.length > 0 && <small> — {x.activities.map((a) => a.item).join(', ')}</small>}
                              </li>
                            ))}
                          </ul>
                        )}
                      </li>
                    );
                  })}
                </ol>
              )}
              <p className="md-note">Planned order only: there is no mission telemetry, so nothing here shows tasks being carried out.</p>
            </Section>

            <Section title="Equipment and Loadout">
              <dl className="md-facts md-num">
                {(Object.keys(MASS_GROUP_LABELS) as MassGroup[]).map((g) => (
                  <div key={g}>
                    <dt>{MASS_GROUP_LABELS[g]}</dt>
                    <dd>{eq.byGroup[g].toFixed(1)} kg</dd>
                  </div>
                ))}
                <div>
                  <dt>Carried equipment</dt>
                  <dd>{describeKnownMass(eq.knownKg, eq.unknownItems.length)}</dd>
                </div>
                {eq.carriers.map((cr) => (
                  <div key={cr}>
                    <dt>{CARRIER_LABELS[cr]}</dt>
                    <dd>{(eq.byCarrier[cr] ?? 0).toFixed(1)} kg</dd>
                  </div>
                ))}
                <div>
                  <dt>Counted with the suit</dt>
                  <dd>{eq.inSuitKg.toFixed(1)} kg (not added to carried mass)</dd>
                </div>
                <div>
                  <dt>Spacesuit</dt>
                  <dd>{eq.suitKg !== null ? `${eq.suitKg.toFixed(1)} kg (user assumption)` : 'No verified value'}</dd>
                </div>
                <div>
                  <dt>Samples, batteries, oxygen</dt>
                  <dd>Not modelled</dd>
                </div>
                <div>
                  <dt>Missing suggested items</dt>
                  <dd>{missingSuggestedEquipment(m).length || 'None'}</dd>
                </div>
                <div>
                  <dt>Value sources</dt>
                  <dd>
                    {(() => {
                      const p = provenanceCounts(m.loadout);
                      return `${p.demo} demo estimates · ${p.user} user supplied · ${p.unknown} unknown`;
                    })()}
                  </dd>
                </div>
              </dl>
              <button type="button" className="md-btn" onClick={() => { mission?.openTab('equipment'); onOpenMap(); }}>
                Edit Loadout
              </button>
            </Section>
          </div>
        )}

        <h2 className="md-h2">Help Corner</h2>
        <section className="md-help" aria-label="Help Corner">
          <p className="md-note">Preset explanations — not a live AI assistant.</p>
          <div className="md-help__grid">
            <ul className="md-help__topics">
              {HELP.map(([q], i) => (
                <li key={q}>
                  <button type="button" className={i === helpTopic ? 'is-active' : ''} aria-pressed={i === helpTopic} onClick={() => setHelpTopic(i)}>
                    {q}
                  </button>
                </li>
              ))}
            </ul>
            <p className="md-help__answer" aria-live="polite">
              {HELP[helpTopic][1]}
            </p>
          </div>
        </section>

        <h2 className="md-h2">Data sources</h2>
        <div className="md-sources">
          {SOURCES.map((s) => (
            <article key={s.id} className={`md-source${s.integrated ? ' is-on' : ''}`}>
              <header>
                <a href={s.url} target="_blank" rel="noreferrer noopener">
                  {s.name}
                </a>
                <span className={`md-badge ${s.integrated ? 'md-badge--calculated' : 'md-badge--unavailable'}`}>{s.integrated ? 'Integrated' : 'Not integrated'}</span>
              </header>
              <p>
                {s.provider} · {s.productType}
              </p>
              <p className="md-note">
                Coverage: {s.coverage} · Time: {s.temporal} · Resolution: {s.resolution} · Units: {s.units}
              </p>
              <p className="md-note">Access: {s.access}. {s.limitations}</p>
            </article>
          ))}
        </div>
        <p className="md-note md-foot">
          Selected location and simulation time are kept for this visit; mission plans are saved in this browser only. Sol length {(SOL_SECONDS / 3600).toFixed(4)} Earth hours.
        </p>
      </main>
    </div>
  );
}
