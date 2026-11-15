import { useState, useEffect, useRef, type ReactNode } from 'react';
import { patchHazardState, toMapLatLng, usePlannedRoute, useHazardState, type HazardSelection, type MarsCoordinate } from '../../shared';
import { AVAILABILITY_LABEL, CATEGORY_BY_CODE, displayName, type HazardCategory } from '../categories';
import { formatCoord } from '../coordinateInput';
import type { HazardContext } from '../HazardsLayer';
import { OBSERVATION_BY_ID, type HazardObservationRecord, type Sourced } from '../observations';
import { swatchUrl } from '../patterns';
import { NO_ALTERNATIVE } from '../routeCheck';
import { SLOPE_CELL_KM, type SlopeCell } from '../slopeCells';
import { drawnLengthKm, featureBounds, type StructureData, type StructureFeature } from '../structures';
import { NEAR_FIELD_KM, associateDunes, type DuneData, type DuneFeature } from '../dunes';
import { ImageViewer, RouteInteraction, useMissionActions, type Action } from './RouteLinks';
import CategoryView from '../env/CategoryDetails';

interface Props {
  ctx: HazardContext;
  selection: HazardSelection;
  onClose(): void;
  onPick(s: HazardSelection): void;
}

/** The information view: a side drawer on wide screens, a dismissible bottom sheet on phones. */
export default function HazardDrawer({ ctx, selection, onClose, onPick }: Props) {
  const ref = useRef<HTMLElement>(null);
  const key = JSON.stringify(selection);
  useEffect(() => {
    ref.current?.scrollTo({ top: 0 });
    ref.current?.focus({ preventScroll: true });
  }, [key]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  let body: ReactNode;
  if (selection.kind === 'category') {
    body = <CategoryView ctx={ctx} code={selection.code} onClose={onClose} />;
  } else if (selection.kind === 'observation') {
    const o = OBSERVATION_BY_ID[selection.id];
    body = o ? <ObservationView ctx={ctx} o={o} onClose={onClose} /> : <p>Unknown observation.</p>;
  } else if (selection.kind === 'point') {
    body = <PointView ctx={ctx} at={selection.at} onPick={onPick} />;
  } else if (selection.id.startsWith('MGD3-')) {
    const f = ctx.dunes.state === 'ready' ? ctx.dunes.data.features.find((x) => x.id === selection.id) : undefined;
    body =
      f && ctx.dunes.state === 'ready' ? (
        <DuneView ctx={ctx} f={f} data={ctx.dunes.data} at={selection.at} onClose={onClose} />
      ) : ctx.dunes.state === 'error' ? (
        <p className="hz-callout hz-callout--error">The USGS dune-field outlines could not be loaded: {ctx.dunes.message}</p>
      ) : (
        <p className="hz-muted">Loading dune field…</p>
      );
  } else if (selection.id.startsWith('SL:')) {
    body = ctx.slopeCell ? <SlopeView ctx={ctx} cell={ctx.slopeCell} at={selection.at} onClose={onClose} /> : <p className="hz-muted">Loading slope cell…</p>;
  } else {
    const f = ctx.structures.state === 'ready' ? ctx.structures.data.features.find((x) => x.id === selection.id) : undefined;
    body =
      f && ctx.structures.state === 'ready' ? (
        <LineView ctx={ctx} f={f} data={ctx.structures.data} at={selection.at} onClose={onClose} />
      ) : (
        <p className="hz-muted">Loading feature…</p>
      );
  }

  return (
    <section
      ref={ref}
      className={`hz-drawer${selection.kind === 'point' ? ' hz-drawer--location' : ''}`}
      aria-label={selection.kind === 'point' ? 'Location inspection' : 'Hazard information'}
      tabIndex={-1}
    >
      <span className="hz-drawer__grip" aria-hidden="true" />
      <button type="button" className="hz-icon-btn hz-drawer__close" aria-label="Close" onClick={onClose}>
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <path d="m6 6 8 8M14 6l-8 8" />
        </svg>
      </button>
      {body}
    </section>
  );
}

/* ------------------------------------------------------------------ pieces */

export function Head({ cats, title, id, kind, simpleTitle }: { cats: HazardCategory[]; title: string; id: string; kind: string; simpleTitle?: string }) {
  return (
    <header className="hz-d-head">
      <img className="hz-swatch" src={swatchUrl(cats[0].code)} alt="" width={32} height={32} />
      <div>
        <p className="hz-eyebrow">{cats.map((c) => c.name).join(' + ')}</p>
        <h2 className="hz-d-title">{simpleTitle ?? title}</h2>
        <p className="hz-d-sub">
          <span className="hz-chip">{kind}</span> <span className="hz-id">{id}</span>
        </p>
      </div>
    </header>
  );
}

/** The brief: what it is, why it matters, what the crew can do. Detail follows in Scientific Details. */
export function Glance({ concern, evidence, cats }: { concern: ReactNode; evidence: ReactNode; cats: HazardCategory[] }) {
  void evidence; // kept for callers: the evidence is in Scientific Information, section 9
  const jump = () => {
    const sci = document.getElementById('hz-sci') as HTMLDetailsElement | null;
    if (sci) sci.open = true;
    requestAnimationFrame(() => document.getElementById('hz-crew')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };
  return (
    <div className="hz-brief">
      <p className="hz-brief__lead">{concern}</p>
      <dl className="hz-glance">
        <div>
          <dt>Why it matters</dt>
          <dd>{cats[0].whyItMatters}</dd>
        </div>
        <div>
          <dt>What can the crew do?</dt>
          <dd>
            {cats[0].responses[0]}{' '}
            <button type="button" className="hz-link" onClick={jump}>
              All options
            </button>
          </dd>
        </div>
      </dl>
    </div>
  );
}

/** The numbered scientific sections: evidence, coordinates, sources and limitations, on request. */
export function SciDetails({ children }: { children: ReactNode }) {
  return (
    <details className="hz-sci" id="hz-sci">
      <summary>Scientific Information</summary>
      {children}
    </details>
  );
}

export function Section({ n, title, id, children }: { n: number; title: string; id?: string; children: ReactNode }) {
  return (
    <section className={`hz-d-sec${id === 'hz-crew' ? ' hz-d-sec--crew' : ''}`} id={id}>
      <h3>
        <span className="hz-d-num" aria-hidden="true">
          {n}
        </span>
        {title}
      </h3>
      {children}
    </section>
  );
}

export function Rows({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="hz-d-rows">
      {rows.map(([k, v]) => (
        <div key={k}>
          <dt>{k}</dt>
          <dd>{v ?? <span className="hz-unavailable">Not available</span>}</dd>
        </div>
      ))}
    </dl>
  );
}

function src<T extends ReactNode>(s: Sourced<T>, missing = 'Not stated on the source page'): ReactNode {
  if (s.value == null) return <span className="hz-unavailable">{missing}</span>;
  return (
    <>
      {s.value}
      <span className="hz-prov">{s.from === 'catalogue' ? ' (supplied record)' : ' (source page)'}</span>
    </>
  );
}

const NA = (text: string) => <span className="hz-unavailable">{text}</span>;

export function CategoryRows({ cats }: { cats: HazardCategory[] }) {
  return (
    <ul className="hz-list hz-list--plain">
      {cats.map((c) => (
        <li key={c.code}>
          <strong>{c.name}</strong>: {c.short.charAt(0).toLowerCase() + c.short.slice(1)}. <span className="hz-muted">({AVAILABILITY_LABEL[c.availability]})</span>
        </li>
      ))}
    </ul>
  );
}

export function Checks({ cats, extra }: { cats: HazardCategory[]; extra?: string[] }) {
  const items = [...new Set([...cats.flatMap((c) => c.checks), ...(extra ?? [])])];
  return (
    <ul className="hz-list">
      {items.map((p) => (
        <li key={p}>{p}</li>
      ))}
    </ul>
  );
}

/** Section 6: the crew's options, made prominent. */
export function CrewOptions({ cats }: { cats: HazardCategory[] }) {
  return (
    <>
      {cats.map((c) => (
        <div key={c.code} className="hz-crew">
          {cats.length > 1 && <p className="hz-sub">{c.name}</p>}
          <ul className="hz-list hz-list--do">
            {c.responses.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </div>
      ))}
      <p className="hz-sub">Uncertainty that remains</p>
      <ul className="hz-list hz-list--caution">
        {[...new Set(cats.flatMap((c) => c.cautions))].map((p) => (
          <li key={p}>{p}</li>
        ))}
      </ul>
      <p className="hz-muted">These are proposed planning responses, not NASA-approved procedures. None of them removes the hazard.</p>
    </>
  );
}

/** Section 7: an assessed alternative where data exists; otherwise the honest options. */
export function Alternatives({ cats }: { cats: HazardCategory[] }) {
  const route = usePlannedRoute();
  const hasRoute = !!route && route.stops.length >= 2;
  return (
    <>
      <div className="hz-callout">
        <strong>Compare Alternative Route:</strong> {hasRoute ? NO_ALTERNATIVE : 'No route is planned, so there is nothing to compare.'}
        {hasRoute && (
          <span className="hz-muted">
            {' '}
            Missing: walking-scale elevation and obstacle data for the ground around the route. No detour is drawn without it.
          </span>
        )}
      </div>
      <p className="hz-sub">Options that need no new route</p>
      <ul className="hz-list">
        {[...new Set(cats.flatMap((c) => c.alternatives))].map((p) => (
          <li key={p}>{p}</li>
        ))}
        <li>Observe the feature remotely instead of visiting it.</li>
        <li>Choose another science target.</li>
        <li>Choose a different departure time.</li>
        <li>Postpone, or reassess the mission.</li>
      </ul>
    </>
  );
}

function ActionButton({ a, primary }: { a: Action; primary?: boolean }) {
  return a.href && !a.disabled ? (
    <a className={`hz-btn${primary ? '' : ' hz-btn--ghost'}`} href={a.href} target="_blank" rel="noreferrer">
      {a.label}
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  ) : (
    <button
      type="button"
      className={`hz-btn${primary ? '' : ' hz-btn--ghost'}${a.pressed ? ' is-on' : ''}`}
      onClick={a.onClick}
      disabled={!!a.disabled}
      title={a.disabled}
      aria-pressed={a.pressed}
    >
      {a.label}
    </button>
  );
}

const SECONDARY = ['View NASA imagery', 'View Source'];

/**
 * The panel's actions: the main one (Add to Mission where it applies), the source and imagery
 * when they are available, and everything else under More options with any reason it is
 * unavailable. Every existing action stays reachable.
 */
export function Actions({ actions }: { actions: Action[] }) {
  const [more, setMore] = useState(false);
  const relabel = (a: Action): Action =>
    a.label === 'Save to Mission' ? { ...a, label: 'Add to Mission' } : a;
  const list = actions.map(relabel);
  const primary =
    list.find((a) => !a.disabled && (a.label === 'Add to Mission' || a.label === 'Remove from Mission')) ?? list.find((a) => !a.disabled && a.label !== 'Close');
  const secondary = list.filter((a) => a !== primary && !a.disabled && SECONDARY.includes(a.label));
  const rest = list.filter((a) => a !== primary && !secondary.includes(a));
  return (
    <section className="hz-d-actions" aria-label="Actions">
      <div className="hz-actions">
        {primary && <ActionButton a={primary} primary />}
        {secondary.map((a) => (
          <ActionButton key={a.label} a={a} />
        ))}
        {rest.length > 0 && (
          <button type="button" className="hz-btn hz-btn--ghost hz-more" aria-expanded={more} onClick={() => setMore((m) => !m)}>
            More options
          </button>
        )}
      </div>
      {more && (
        <div className="hz-more__body">
          <div className="hz-actions">
            {rest.map((a) => (
              <ActionButton key={a.label} a={a} />
            ))}
          </div>
          {rest
            .filter((a) => a.disabled)
            .map((a) => (
              <p key={a.label} className="hz-disabled-reason">
                <strong>{a.label}:</strong> {a.disabled}
              </p>
            ))}
        </div>
      )}
    </section>
  );
}

/* -------------------------------------------------------------- observation */

function ObservationView({ ctx, o, onClose }: { ctx: HazardContext; o: HazardObservationRecord; onClose(): void }) {
  const cats = o.categories.map((c) => CATEGORY_BY_CODE[c]);
  const focus = () => ctx.map.setView(toMapLatLng(o.observationCentre, ctx.map.getCenter().lng), Math.max(ctx.map.getZoom(), 8));
  const [viewing, setViewing] = useState(false);
  const mission = useMissionActions({
    id: o.id,
    code: o.categories[0],
    title: `${o.id} · ${o.name}`,
    at: o.observationCentre,
    sourceUrl: o.sourceUrl,
    status: 'Observation available · boundary not yet mapped',
  });
  const date = o.observationDate.value ?? o.publicationDate.value;
  return (
    <>
      {viewing && o.imageUrl && (
        <ImageViewer
          src={o.imageUrl}
          alt={`${o.id}: ${o.name}`}
          caption={[o.imageId.value, o.instrument.value, o.credit.value].filter(Boolean).join(' · ') || o.name}
          sourceUrl={o.sourceUrl}
          onClose={() => setViewing(false)}
        />
      )}
      <Head cats={cats} title={o.name} id={o.id} kind="NASA observation" />
      <p className="hz-callout">
        <strong>Observation available — boundary not mapped.</strong> The marker shows where the image was taken; this record has no outline of its own, so
        no area is drawn for it.
      </p>
      {o.categories.includes('S') && <DuneContext ctx={ctx} o={o} />}
      {o.sourceIssues.map((s) => (
        <p key={s} className="hz-callout hz-callout--error" role="note">
          {s}
        </p>
      ))}
      <Glance
        cats={cats}
        concern={`${o.observedFeature}, seen in a NASA image (${cats.map((c) => c.name).join(' + ')}).`}
        evidence={
          <>
            {[o.instrument.value, o.imageId.value].filter(Boolean).join(' ') || 'NASA source page'}
            {date ? `, ${date}` : ''}.{' '}
            <a href={o.sourceUrl} target="_blank" rel="noreferrer">
              Source page
            </a>
          </>
        }
      />

      <SciDetails>
      <Section n={1} title="Hazard name and category">
        <Rows
          rows={[
            ['Feature', o.observedFeature],
            ['Category', <CategoryRows cats={cats} />],
            ['Record', `${o.id} (one of 60 NASA observation records)`],
          ]}
        />
      </Section>
      <Section n={2} title="Latitude and longitude">
        <Rows
          rows={[
            ['Observation location', `${o.centreText.latitude}, ${o.centreText.longitude}`],
            ['Stated on the source page', src(o.statedCentre)],
            ['Convention', o.coordinateConvention],
          ]}
        />
        <p className="hz-muted">This is the centre of the image, not a hazard boundary or vertex.</p>
      </Section>
      <Section n={3} title="What was observed">
        {o.sourceSummary.value ? <blockquote className="hz-quote">{o.sourceSummary.value}</blockquote> : <p>{o.observedFeature}.</p>}
        <p className="hz-muted">{o.timeValidity}</p>
      </Section>
      <Section n={4} title="Why it matters for this mission">
        {cats.map((c) => (
          <p key={c.code}>{c.whyItMatters}</p>
        ))}
        <p className="hz-muted">Current condition: unknown. This record has not been assessed for a crew visit.</p>
      </Section>
      <Section n={5} title="What to check before proceeding">
        <Checks cats={cats} extra={['The feature’s extent on the ground: it is not mapped from this record.']} />
      </Section>
      <Section n={6} title="What can the crew do?" id="hz-crew">
        <CrewOptions cats={cats} />
      </Section>
      <Section n={7} title="Alternative approaches or mission options">
        <Alternatives cats={cats} />
      </Section>
      <Section n={8} title="Effect on the planned route">
        <RouteInteraction match={{ kind: 'observation', id: o.id }} />
      </Section>
      <Section n={9} title="Source, observation date and limitations">
        <Rows
          rows={[
            ['Agency', 'NASA'],
            ['Mission', src(o.mission)],
            ['Spacecraft', src(o.spacecraft)],
            ['Instrument', src(o.instrument)],
            ['Image ID', src(o.imageId)],
            ['Credit', src(o.credit)],
            ['Observation date', src(o.observationDate)],
            ['Publication date', src(o.publicationDate)],
            ['Retrieved', o.retrievedDate],
            ['Resolution', src(o.sourceResolution)],
            [
              'URL',
              <a href={o.sourceUrl} target="_blank" rel="noreferrer">
                {o.sourceUrl.replace('https://', '')}
              </a>,
            ],
          ]}
        />
        <p className="hz-sub">Limitations</p>
        <ul className="hz-list hz-list--plain">
          <li>Extent, depth, width and slope are not established from this record.</li>
          <li>No confidence value is provided by the source.</li>
          {o.limitations.map((l) => (
            <li key={l}>{l}</li>
          ))}
          {o.imageUrl && <li>The NASA image is context only: it is not georeferenced or aligned to this map.</li>}
        </ul>
      </Section>
      </SciDetails>
      <Actions
        actions={[
          { label: 'View Source', href: o.sourceUrl },
          o.imageUrl ? { label: 'View NASA imagery', onClick: () => setViewing(true) } : { label: 'View NASA imagery', disabled: 'No image file was found on the source page.' },
          { label: 'Focus Map', onClick: focus },
          ...mission,
          { label: 'Close', onClick: onClose },
        ]}
      />
    </>
  );
}

/* --------------------------------------------------------------------- line */

function LineView({ ctx, f, data, at, onClose }: { ctx: HazardContext; f: StructureFeature; data: StructureData; at: MarsCoordinate; onClose(): void }) {
  const cat = CATEGORY_BY_CODE[f.category];
  const hit = ctx.point?.lines.find((h) => h.feature.id === f.id);
  const drawn = drawnLengthKm(f);
  const focus = () => ctx.map.fitBounds(featureBounds(f, ctx.map.getCenter().lng), { padding: [60, 60], maxZoom: 9 });
  const pit = f.interpretation === 'Pit crater chain';
  const mission = useMissionActions({
    id: f.id,
    code: f.category,
    title: `${f.id} · ${f.interpretation}`,
    at: hit?.nearest ?? at,
    sourceUrl: data.url,
    status: 'USGS SIM 3292 mapped axis (line; width not mapped)',
  });
  return (
    <>
      <Head cats={[cat]} title={`Mapped ${f.interpretation.toLowerCase()}`} simpleTitle={displayName(f.category)} id={f.id} kind="Mapped line (USGS)" />
      <Glance
        cats={[cat]}
        concern={pit ? 'A line of collapse pits mapped by the USGS from orbit. Pit edges can be steep and their depth is unknown.' : 'A long trough between faults (a graben), mapped by the USGS from orbit. Steep walls and drops may lie along it.'}
        evidence={
          <>
            USGS global geologic map of Mars (SIM 3292), {data.scale}.{' '}
            <a href={data.url} target="_blank" rel="noreferrer">
              Source
            </a>
          </>
        }
      />
      <SciDetails>
      <Section n={1} title="Hazard name and category">
        <Rows
          rows={[
            ['Feature', `Mapped ${f.interpretation.toLowerCase()} — USGS feature ${f.id}`],
            ['Category', <CategoryRows cats={[cat]} />],
            ['Preservation (USGS)', f.preservation],
            ['Size class (USGS)', f.dimension],
          ]}
        />
      </Section>
      <Section n={2} title="Latitude and longitude">
        <Rows
          rows={[
            ['Selected point', formatCoord(at, 3)],
            ['Nearest point on the line', hit ? `${formatCoord(hit.nearest, 3)} (${hit.distancePx.toFixed(0)} px from the tap)` : null],
          ]}
        />
      </Section>
      <Section n={3} title="What was mapped">
        <p>
          The USGS global geologic map interprets this line as the axis of {pit ? 'a chain of pit craters' : 'a graben, a fault-bounded trough'}. The line marks
          the trough’s centre; its walls and width are not mapped.
        </p>
      </Section>
      <Section n={4} title="Why it matters for this mission">
        <p>{cat.whyItMatters}</p>
      </Section>
      <Section n={5} title="What to check before proceeding">
        <Checks cats={[cat]} />
      </Section>
      <Section n={6} title="What can the crew do?" id="hz-crew">
        <CrewOptions cats={[cat]} />
      </Section>
      <Section n={7} title="Alternative approaches or mission options">
        <Alternatives cats={[cat]} />
      </Section>
      <Section n={8} title="Effect on the planned route">
        <RouteInteraction match={{ kind: 'line', id: f.id }} />
      </Section>
      <Section n={9} title="Source, observation date and limitations">
        <Rows
          rows={[
            ['Agency', 'USGS Astrogeology Science Center, with NASA support'],
            ['Dataset', data.source],
            ['Basis', 'Compiled from orbital data (THEMIS daytime infrared, MOLA and others)'],
            ['Observation date', NA('Not applicable: a compiled map, published 2014')],
            ['Scale', data.scale],
            ['Frame', data.frame],
            ['Length (USGS)', f.lengthKm != null ? `${f.lengthKm} km` : null],
            ['Length as drawn', `${drawn.toFixed(1)} km (great circle)`],
            [
              'URL',
              <a href={data.url} target="_blank" rel="noreferrer">
                {data.url.replace('https://', '')}
              </a>,
            ],
          ]}
        />
        <p className="hz-sub">Limitations</p>
        <ul className="hz-list hz-list--plain">
          <li>Width, depth and wall slope are not established from this record.</li>
          <li>At 1:20,000,000, mapped positions are uncertain by kilometres.</li>
          <li>Display simplified: {data.simplification}.</li>
          <li>No confidence value is provided by the source.</li>
        </ul>
      </Section>
      </SciDetails>
      <Actions
        actions={[
          { label: 'View Source', href: data.url },
          { label: 'View NASA imagery', disabled: 'No image is linked to this mapped line; the map’s own imagery is underneath.' },
          { label: 'Focus Map', onClick: focus },
          ...mission,
          { label: 'Close', onClick: onClose },
        ]}
      />
    </>
  );
}

/* -------------------------------------------------------------------- slope */

function SlopeView({ ctx, cell, at, onClose }: { ctx: HazardContext; cell: SlopeCell; at: MarsCoordinate; onClose(): void }) {
  const hz = useHazardState();
  const cat = CATEGORY_BY_CODE.SL;
  const store = ctx.slopeStore.state === 'ready' ? ctx.slopeStore.data.manifest : null;
  const focus = () => ctx.map.setView(toMapLatLng(cell.centre, ctx.map.getCenter().lng), Math.max(ctx.map.getZoom(), 8));
  const lon = (x: number) => formatCoord({ latitude: 0, longitudeEast: x }, 4).split(', ')[1];
  const mission = useMissionActions({
    id: `SL:${cell.i}:${cell.j}`,
    code: 'SL',
    title: `Steep slope ${cell.slopeDeg.toFixed(1)}° (MOLA cell)`,
    at: cell.centre,
    sourceUrl: store?.source,
    status: `Derived: ${cell.slopeDeg.toFixed(1)}° over 3.7 km; highlight limit ${hz.slopeThresholdDeg}°`,
  });
  return (
    <>
      <Head cats={[cat]} title={`Slope ${cell.slopeDeg.toFixed(1)}°, above your ${hz.slopeThresholdDeg}° limit`} id={`MOLA cell ${cell.i}, ${cell.j}`} kind="Derived from elevation model" />
      <Glance
        cats={[cat]}
        concern={`Ground averaging ${cell.slopeDeg.toFixed(1)}° across a ${SLOPE_CELL_KM} km cell, steeper than the planning limit you set.`}
        evidence="Calculated from NASA MOLA laser altimetry (Mars Global Surveyor, 1997–2001)."
      />
      <SciDetails>
      <Section n={1} title="Hazard name and category">
        <Rows
          rows={[
            ['Feature', 'Elevation-model cell above the slope limit'],
            ['Category', <CategoryRows cats={[cat]} />],
            ['Classification', `${cell.slopeDeg.toFixed(1)}° is above ${hz.slopeThresholdDeg}° (your limit)`],
          ]}
        />
      </Section>
      <Section n={2} title="Latitude and longitude">
        <Rows
          rows={[
            ['Selected point', formatCoord(at, 3)],
            ['Cell centre', formatCoord(cell.centre, 4)],
            ['Cell edges', `${cell.bounds.south.toFixed(4)}° to ${cell.bounds.north.toFixed(4)}° latitude; ${lon(cell.bounds.west)} to ${lon(cell.bounds.east)}`],
          ]}
        />
      </Section>
      <Section n={3} title="What was derived">
        <p>The average slope of this {SLOPE_CELL_KM} km elevation cell, from MOLA laser altimetry, is above the limit you set.</p>
      </Section>
      <Section n={4} title="Why it matters for this mission">
        <p>{cat.whyItMatters}</p>
      </Section>
      <Section n={5} title="What to check before proceeding">
        <Checks cats={[cat]} />
      </Section>
      <Section n={6} title="What can the crew do?" id="hz-crew">
        <CrewOptions cats={[cat]} />
      </Section>
      <Section n={7} title="Alternative approaches or mission options">
        <Alternatives cats={[cat]} />
      </Section>
      <Section n={8} title="Effect on the planned route">
        <RouteInteraction match={{ kind: 'slope', bounds: cell.bounds }} />
      </Section>
      <Section n={9} title="Source, observation date and limitations">
        <Rows
          rows={[
            ['Agency / mission', 'NASA · Mars Global Surveyor'],
            ['Instrument', 'MOLA (Mars Orbiter Laser Altimeter)'],
            ['Dataset', store ? `${store.dataSetId}, ${store.product}` : null],
            ['Observation dates', '1997–2001 (mapping mission)'],
            ['Resolution', `${store?.pixelsPerDegree ?? 16} px per degree, ${SLOPE_CELL_KM} km cells`],
            ['Method', 'Slope from neighbouring cells on the sphere; each cell classified on its own value; outlines follow cell edges'],
            [
              'URL',
              store ? (
                <a href={store.source} target="_blank" rel="noreferrer">
                  {store.source.replace('https://', '')}
                </a>
              ) : null,
            ],
          ]}
        />
        <p className="hz-sub">Limitations</p>
        <ul className="hz-list hz-list--plain">
          <li>Local slopes inside a {SLOPE_CELL_KM} km cell can be much steeper or gentler than the cell value.</li>
          <li>The limit is your planning setting; there is no universal safe walking angle.</li>
          <li>Confidence is not quantified.</li>
        </ul>
      </Section>
      </SciDetails>
      <Actions
        actions={[
          { label: 'View Source', href: store?.source, disabled: store ? undefined : 'Elevation data not loaded.' },
          { label: 'View NASA imagery', disabled: 'No separate image is linked to an elevation cell; the map’s own imagery is underneath.' },
          { label: 'Focus Map', onClick: focus },
          ...mission,
          { label: 'Close', onClick: onClose },
        ]}
      />
    </>
  );
}

/* --------------------------------------------------------------------- point */

interface PointCandidate {
  id: string;
  label: string;
  sel: HazardSelection;
  code: 'F' | 'P' | 'SL' | 'S';
}

interface PointFinding {
  code: 'F' | 'P' | 'SL' | 'S';
  detail: string;
  candidates?: PointCandidate[];
}

function PointView({ ctx, at, onPick }: { ctx: HazardContext; at: MarsCoordinate; onPick(s: HazardSelection): void }) {
  const hazard = useHazardState();
  const mission = useMissionActions(null);
  const p = ctx.point?.at.latitude === at.latitude && ctx.point.at.longitudeEast === at.longitudeEast ? ctx.point : null;
  const slope = p?.slope;
  const candidates: PointCandidate[] = [
    ...(p?.dunes.map((f) => ({
      id: f.id,
      label: `USGS dune field ${f.duneId}`,
      sel: { kind: 'feature' as const, id: f.id, at },
      code: 'S' as const,
    })) ?? []),
    ...(p?.lines.map((h) => ({
      id: h.feature.id,
      label: `${h.feature.interpretation} · ${h.feature.id}`,
      sel: { kind: 'feature' as const, id: h.feature.id, at },
      code: h.feature.category,
    })) ?? []),
    ...(slope?.state === 'classified'
      ? [{ id: `SL:${slope.cell.i}:${slope.cell.j}`, label: `Slope cell ${slope.cell.slopeDeg.toFixed(1)}°`, sel: { kind: 'feature' as const, id: `SL:${slope.cell.i}:${slope.cell.j}`, at }, code: 'SL' as const }]
      : []),
  ];
  const findings: PointFinding[] = [];

  for (const code of ['F', 'P'] as const) {
    if (!hazard.active.includes(code)) {
      findings.push({ code, detail: 'Not assessed — layer hidden.' });
    } else if (!p || ctx.structures.state === 'loading') {
      findings.push({ code, detail: 'Checking mapped line data…' });
    } else if (ctx.structures.state === 'error') {
      findings.push({ code, detail: `Not assessed — ${ctx.structures.message}` });
    } else {
      const matches = candidates.filter((candidate) => candidate.code === code);
      findings.push({
        code,
        detail: matches.length ? 'Mapped feature detected within the tested reach.' : 'No mapped feature detected within the tested reach.',
        candidates: matches,
      });
    }
  }

  if (!hazard.active.includes('SL')) {
    findings.push({ code: 'SL', detail: 'Not assessed — layer hidden.' });
  } else if (!slope || slope.state === 'pending') {
    findings.push({ code: 'SL', detail: 'Checking the MOLA slope cell…' });
  } else if (slope.state === 'inactive') {
    findings.push({ code: 'SL', detail: 'Not assessed — layer hidden.' });
  } else if (slope.state === 'unavailable') {
    findings.push({ code: 'SL', detail: `Not assessed — ${slope.reason}` });
  } else if (slope.state === 'classified') {
    findings.push({
      code: 'SL',
      detail: `MOLA slope is ${slope.cell.slopeDeg.toFixed(1)}°; this cell meets the selected ${hazard.slopeThresholdDeg}° threshold.`,
      candidates: candidates.filter((candidate) => candidate.code === 'SL'),
    });
  } else {
    findings.push({
      code: 'SL',
      detail: `No steep-slope cell detected: ${slope.cell.slopeDeg.toFixed(1)}° is below the selected ${hazard.slopeThresholdDeg}° threshold.`,
    });
  }

  if (!hazard.active.includes('S')) {
    findings.push({ code: 'S', detail: 'Not assessed — layer hidden.' });
  } else if (!p || ctx.dunes.state === 'loading') {
    findings.push({ code: 'S', detail: 'Checking mapped dune-field outlines…' });
  } else if (ctx.dunes.state === 'error') {
    findings.push({ code: 'S', detail: `Not assessed — ${ctx.dunes.message}` });
  } else {
    const matches = candidates.filter((candidate) => candidate.code === 'S');
    findings.push({
      code: 'S',
      detail: matches.length ? 'Location intersects a mapped USGS dune field.' : 'No mapped intersection detected.',
      candidates: matches,
    });
  }

  const found = candidates.length > 0;
  const pending = findings.some((finding) => finding.detail.startsWith('Checking'));
  const assessed = findings.some((finding) => !finding.detail.startsWith('Not assessed') && !finding.detail.startsWith('Checking'));
  const assessment = found
    ? 'Mapped feature detected within the tested reach.'
    : pending
      ? 'Assessment in progress.'
      : assessed
        ? 'No mapped hazard detected in the available, tested layers.'
        : 'No active, available mapped layer could assess this point.';
  const details = mission.filter((action) => action.label !== 'Save to Mission');
  const addAction = mission.find((action) => action.label === 'Save to Mission');
  const sourceRows: [string, ReactNode][] = [];
  if (ctx.structures.state === 'ready') {
    sourceRows.push([
      'USGS mapped lines',
      <>
        <a href={ctx.structures.data.url} target="_blank" rel="noreferrer">{ctx.structures.data.source}</a>; scale {ctx.structures.data.scale}; {ctx.structures.data.frame}.
      </>,
    ]);
  }
  if (ctx.dunes.state === 'ready') {
    sourceRows.push([
      'USGS dune fields',
      <>
        <a href={ctx.dunes.data.url} target="_blank" rel="noreferrer">{ctx.dunes.data.source}</a>; {ctx.dunes.data.coverage}
      </>,
    ]);
  }
  if (ctx.slopeStore.state === 'ready') {
    const manifest = ctx.slopeStore.data.level.manifest;
    sourceRows.push([
      'MOLA elevation model',
      <>
        {manifest.source.startsWith('https://') ? <a href={manifest.source} target="_blank" rel="noreferrer">{manifest.dataSetId}</a> : manifest.dataSetId}
        ; {manifest.pixelsPerDegree} px/degree, {manifest.mapScaleKm} km map scale; {manifest.verticalDatum}.
      </>,
    ]);
  }
  const categoryDetails = findings.map((finding) => [CATEGORY_BY_CODE[finding.code].name, finding.detail] as [string, ReactNode]);

  return (
    <div className="hz-location">
      <header className="hz-d-head">
        <div>
          <p className="hz-eyebrow">Location inspection</p>
          <h2 className="hz-d-title">Selected location</h2>
          <p className="hz-location__coords">{formatCoord(at, 3)}</p>
        </div>
      </header>
      <section className="hz-location__assessment" aria-labelledby="hz-location-assessment-title">
        <h3 id="hz-location-assessment-title">Assessment</h3>
        <p role="status">
          <span className={`hz-location__status${found ? ' is-found' : ''}`} aria-hidden="true" />
          {assessment}
        </p>
        <p className="hz-location__caveat">No mapped finding is not evidence that the terrain is safe.</p>
      </section>

      <section className="hz-location__findings" aria-labelledby="hz-location-findings-title">
        <h3 id="hz-location-findings-title">Hazard findings</h3>
        <ul>
          {findings.map((finding) => (
            <li key={finding.code}>
              <strong>{CATEGORY_BY_CODE[finding.code].name}</strong>
              <span>{finding.detail}</span>
              {finding.candidates?.map((candidate) => (
                <button key={candidate.id} type="button" className="hz-location__record" onClick={() => onPick(candidate.sel)}>
                  View mapped record: {candidate.label}
                </button>
              ))}
            </li>
          ))}
        </ul>
      </section>

      <details className="hz-location__scientific">
        <summary>Scientific details</summary>
        <div className="hz-location__scientific-body">
          <Rows
            rows={[
              ['Hazard categories', categoryDetails.length ? <Rows rows={categoryDetails} /> : 'No assessment results yet.'],
              ['Observation ID', 'No observation record is attached to a coordinate inspection. NASA observation markers open their own sourced records.'],
              ['Coordinates', formatCoord(at, 6)],
              [
                'Dataset resolution',
                <>
                  {CATEGORY_BY_CODE.F.name} and {CATEGORY_BY_CODE.P.name}: {ctx.structures.state === 'ready' ? ctx.structures.data.scale : 'USGS SIM 3292 mapped axes; dataset scale unavailable.'}
                  <br />
                  {CATEGORY_BY_CODE.S.name}: {ctx.dunes.state === 'ready' ? '100 m/px THEMIS mapping.' : 'USGS MGD³ mapped outlines; resolution unavailable.'}
                  <br />
                  {CATEGORY_BY_CODE.SL.name}: {ctx.slopeStore.state === 'ready' ? `${ctx.slopeStore.data.level.manifest.mapScaleKm} km map scale (${SLOPE_CELL_KM} km equatorial cells).` : `${SLOPE_CELL_KM} km equatorial cells; MOLA manifest unavailable.`}
                </>,
              ],
              [
                'Assessment method',
                <>
                  USGS line axes are tested against the tap tolerance, not buffered into an area. Dune results use the mapped USGS outline. Steep slopes use the MOLA elevation bin and central-difference calculation against the selected threshold.
                  {ctx.dunes.state === 'ready' && <> {ctx.dunes.data.method}</>}
                </>,
              ],
              [
                'Coverage limitations',
                <>
                  {CATEGORY_BY_CODE.F.mappingNote} {CATEGORY_BY_CODE.P.mappingNote} {ctx.dunes.state === 'ready' ? ctx.dunes.data.completeness : CATEGORY_BY_CODE.S.mappingNote} {CATEGORY_BY_CODE.SL.mappingNote} Other hazard categories have no mapped boundary here and are not assessed by this point test.
                </>,
              ],
              ['Source references', sourceRows.length ? <Rows rows={sourceRows} /> : 'Dataset sources are not loaded.'],
              [
                'Technical hazard descriptions',
                candidates.length
                  ? candidates.map((candidate) => <p key={candidate.id}>{CATEGORY_BY_CODE[candidate.code].description} <span className="hz-muted">({candidate.label})</span></p>)
                  : 'No mapped feature record was returned for this point.',
              ],
              ['Scientific caveat', 'This assessment covers only the mapped or modelled layers listed above. It does not assess walking-scale terrain or establish safety.'],
            ]}
          />
        </div>
      </details>

      <div className="hz-location__actions" aria-label="Location actions">
        <button
          type="button"
          className="hz-btn hz-location__focus"
          onClick={() => ctx.map.setView(toMapLatLng(at, ctx.map.getCenter().lng), Math.max(ctx.map.getZoom(), 7))}
        >
          Focus Map
        </button>
        <details className="hz-location__options">
          <summary>More options</summary>
          <div className="hz-location__option-list">
            {addAction && <UnavailableLocationAction label="Add to Mission" reason="Select a mapped feature to add its hazard record to the mission." />}
            {details.map((action) => (
              <UnavailableLocationAction key={action.label} label={action.label} reason={action.disabled ?? 'This action is not available for a coordinate-only inspection.'} />
            ))}
          </div>
        </details>
      </div>
    </div>
  );
}

function UnavailableLocationAction({ label, reason }: { label: string; reason: string }) {
  const id = `hz-location-reason-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
  return (
    <button
      type="button"
      className="hz-btn hz-btn--ghost hz-location__unavailable"
      aria-disabled="true"
      aria-describedby={id}
      title={reason}
      onClick={(event) => event.preventDefault()}
    >
      {label}
      <span className="hz-sr-only" id={id}>{reason}</span>
    </button>
  );
}

/* ------------------------------------------------------------- dune field */

function DuneContext({ ctx, o }: { ctx: HazardContext; o: HazardObservationRecord }) {
  if (ctx.dunes.state === 'loading') return <p className="hz-muted">Checking the USGS dune-field outlines near this location…</p>;
  if (ctx.dunes.state === 'error') return <p className="hz-callout hz-callout--error">USGS dune-field outlines unavailable: {ctx.dunes.message}</p>;
  const a = associateDunes(ctx.dunes.data, o.observationCentre);
  const open = (f: DuneFeature) => {
    ctx.locateDune(f);
    patchHazardState({ selection: { kind: 'feature', id: f.id, at: o.observationCentre } });
  };
  if (a.kind === 'none' || !a.field)
    return (
      <p className="hz-callout">
        <strong>No mapped dune field within {NEAR_FIELD_KM} km.</strong> The nearest USGS MGD³ outline is about {Math.round(a.distanceKm)} km away. That database leaves out
        small dune fields, so this does not mean there are no dunes here; the dunes in this image are simply not outlined.
      </p>
    );
  return (
    <p className="hz-callout">
      {a.kind === 'inside' ? (
        <>
          <strong>This location lies inside a mapped dune field</strong> (USGS MGD³ {a.field.duneId}). The field’s outline is drawn on the map; it is the database’s
          outline, not this image’s footprint.
        </>
      ) : (
        <>
          <strong>A mapped dune field lies about {a.distanceKm.toFixed(1)} km from this location</strong> (USGS MGD³ {a.field.duneId}). It may or may not be the
          dunes in this image: the image has no footprint to compare.
        </>
      )}{' '}
      <button type="button" className="hz-link" onClick={() => open(a.field!)}>
        Locate the mapped field
      </button>
    </p>
  );
}

function DuneView({ ctx, f, data, at, onClose }: { ctx: HazardContext; f: DuneFeature; data: DuneData; at: MarsCoordinate; onClose(): void }) {
  const cat = CATEGORY_BY_CODE.S;
  const centre = { latitude: f.centre[1], longitudeEast: f.centre[0] };
  const mission = useMissionActions({
    id: f.id,
    code: 'S',
    title: `USGS dune field ${f.duneId}`,
    at: centre,
    sourceUrl: data.url,
    status: 'USGS MGD³ mapped dune-field outline',
  });
  const imgs = [f.images.themisIR && `THEMIS IR ${f.images.themisIR}`, f.images.themisVIS && `THEMIS VIS ${f.images.themisVIS}`, f.images.moc && `MOC ${f.images.moc}`].filter(Boolean);
  return (
    <>
      <Head cats={[cat]} title={`Mapped dune field ${f.duneId}`} simpleTitle={`Dune field ${f.duneId}`} id={f.id} kind="Mapped outline (USGS)" />
      <Glance
        cats={[cat]}
        concern={`A field of ${f.types.length ? f.types.join(', ').toLowerCase() : 'unclassified'} dunes${f.areaKm2 ? `, about ${Math.round(f.areaKm2)} km²` : ''}: loose sand of unknown strength, with locally steep dune slopes.`}
        evidence={
          <>
            USGS Mars Global Digital Dune Database, outlined on THEMIS images.{' '}
            <a href={data.url} target="_blank" rel="noreferrer">
              Source
            </a>
          </>
        }
      />
      <SciDetails>
      <Section n={1} title="Hazard name and category">
        <Rows
          rows={[
            ['Feature', `Dune field${f.environment.length ? ` (${f.environment.join(', ').toLowerCase()})` : ''}`],
            ['Category', <CategoryRows cats={[cat]} />],
            ['Dune types', f.types.length ? f.types.join(', ') : NA('Not recorded')],
            ['USGS Dune_ID', f.duneId],
          ]}
        />
      </Section>
      <Section n={2} title="Latitude and longitude">
        <Rows
          rows={[
            ['Selected point', formatCoord(at, 3)],
            ['Field centroid (database)', formatCoord(centre, 3)],
          ]}
        />
      </Section>
      <Section n={3} title="What was mapped">
        <p>
          USGS mappers outlined this field where dune forms or thermal contrast with the surrounding ground were visible in THEMIS infrared images, checking
          doubtful fields with higher-resolution images.
        </p>
        <Rows
          rows={[
            ['Mapping confidence', f.confidenceText ? `${f.confidence}: ${f.confidenceText}` : NA('Not recorded')],
            ['Area (database)', f.areaKm2 != null ? `${f.areaKm2.toFixed(1)} km²` : null],
            ['Host crater diameter', f.craterDiameterKm ? `${f.craterDiameterKm.toFixed(1)} km` : NA('Not in a mapped crater')],
          ]}
        />
      </Section>
      <Section n={4} title="Why it matters for this mission">
        <p>{cat.whyItMatters}</p>
      </Section>
      <Section n={5} title="What to check before proceeding">
        <Checks cats={[cat]} />
      </Section>
      <Section n={6} title="What can the crew do?" id="hz-crew">
        <CrewOptions cats={[cat]} />
      </Section>
      <Section n={7} title="Alternative approaches or mission options">
        <Alternatives cats={[cat]} />
      </Section>
      <Section n={8} title="Effect on the planned route">
        <RouteInteraction match={{ kind: 'dune', id: f.id }} />
      </Section>
      <Section n={9} title="Source, observation date and limitations">
        <Rows
          rows={[
            ['Agency', 'USGS Astrogeology Science Center, with NASA support'],
            ['Dataset', data.source],
            ['Images used', imgs.length ? imgs.join('; ') : NA('Not listed')],
            ['Observation dates', NA('Not given per field: THEMIS and MOC images acquired 1997–2006')],
            ['Coverage', data.coverage],
            ['Frame', data.frame],
            [
              'URL',
              <a href={data.url} target="_blank" rel="noreferrer">
                {data.url.replace('https://', '')}
              </a>,
            ],
          ]}
        />
        <p className="hz-sub">Limitations</p>
        <ul className="hz-list hz-list--plain">
          <li>{data.method}</li>
          <li>{data.completeness}</li>
          <li>Display simplified: {data.simplification}.</li>
          <li>Ground strength, dune heights and slip-face slopes are not mapped here.</li>
        </ul>
      </Section>
      </SciDetails>
      <Actions
        actions={[
          { label: 'View Source', href: data.url },
          { label: 'View NASA imagery', disabled: 'The database lists THEMIS/MOC image IDs (section 9) but links no image file; the map’s own imagery is underneath.' },
          { label: 'Focus Map', onClick: () => ctx.locateDune(f) },
          ...mission,
          { label: 'Close', onClick: onClose },
        ]}
      />
    </>
  );
}
