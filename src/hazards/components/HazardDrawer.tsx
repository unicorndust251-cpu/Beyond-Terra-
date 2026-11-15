import { useState, useEffect, useRef, type ReactNode } from 'react';
import { patchHazardState, toMapLatLng, usePlannedRoute, useHazardState, type HazardSelection, type MarsCoordinate } from '../../shared';
import { AVAILABILITY_LABEL, CATEGORY_BY_CODE, categoryName, type HazardCategory } from '../categories';
import { formatCoord } from '../coordinateInput';
import type { HazardContext } from '../HazardsLayer';
import { OBSERVATION_BY_ID, type HazardObservationRecord, type Sourced } from '../observations';
import { swatchUrl } from '../patterns';
import { NO_ALTERNATIVE } from '../routeCheck';
import { SLOPE_CELL_KM, type SlopeCell } from '../slopeCells';
import { drawnLengthKm, featureBounds, type StructureData, type StructureFeature } from '../structures';
import { NEAR_FIELD_KM, associateDunes, type DuneData, type DuneFeature } from '../dunes';
import { ImageViewer, RouteInteraction, useMissionActions, type Action } from './RouteLinks';

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
  if (selection.kind === 'observation') {
    const o = OBSERVATION_BY_ID[selection.id];
    body = o ? <ObservationView ctx={ctx} o={o} onClose={onClose} /> : <p>Unknown observation.</p>;
  } else if (selection.kind === 'point') {
    body = <PointView ctx={ctx} onPick={onPick} onClose={onClose} />;
  } else if (selection.id.startsWith('MGD3-')) {
    const f = ctx.dunes.state === 'ready' ? ctx.dunes.data.features.find((x) => x.id === selection.id) : undefined;
    body =
      f && ctx.dunes.state === 'ready' ? (
        <DuneView ctx={ctx} f={f} data={ctx.dunes.data} at={selection.at} onClose={onClose} />
      ) : ctx.dunes.state === 'error' ? (
        <p className="hz-callout hz-callout--error">The USGS dune-field outlines could not be loaded: {ctx.dunes.message}</p>
      ) : (
        <p className="hz-muted">Loading dune fieldâ€¦</p>
      );
  } else if (selection.id.startsWith('SL:')) {
    body = ctx.slopeCell ? <SlopeView ctx={ctx} cell={ctx.slopeCell} at={selection.at} onClose={onClose} /> : <p className="hz-muted">Loading slope cellâ€¦</p>;
  } else {
    const f = ctx.structures.state === 'ready' ? ctx.structures.data.features.find((x) => x.id === selection.id) : undefined;
    body =
      f && ctx.structures.state === 'ready' ? (
        <LineView ctx={ctx} f={f} data={ctx.structures.data} at={selection.at} onClose={onClose} />
      ) : (
        <p className="hz-muted">Loading featureâ€¦</p>
      );
  }

  return (
    <section ref={ref} className="hz-drawer" aria-label="Hazard information" tabIndex={-1}>
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

function Head({ cats, title, id, kind }: { cats: HazardCategory[]; title: string; id: string; kind: string }) {
  return (
    <header className="hz-d-head">
      <img className="hz-swatch" src={swatchUrl(cats[0].code)} alt="" width={32} height={32} />
      <div>
        <p className="hz-eyebrow">{cats.map((c) => c.name).join(' + ')}</p>
        <h2 className="hz-d-title">{title}</h2>
        <p className="hz-d-sub">
          <span className="hz-chip">{kind}</span> <span className="hz-id">{id}</span>
        </p>
      </div>
    </header>
  );
}

/** The three questions, answered before any detail. */
function Glance({ concern, evidence, cats }: { concern: ReactNode; evidence: ReactNode; cats: HazardCategory[] }) {
  const jump = () => document.getElementById('hz-crew')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  return (
    <dl className="hz-glance">
      <div>
        <dt>What is this concern?</dt>
        <dd>{concern}</dd>
      </div>
      <div>
        <dt>Where is the evidence?</dt>
        <dd>{evidence}</dd>
      </div>
      <div>
        <dt>What options does the crew have?</dt>
        <dd>
          {cats[0].responses[0]}{' '}
          <button type="button" className="hz-link" onClick={jump}>
            All options
          </button>
        </dd>
      </div>
    </dl>
  );
}

function Section({ n, title, id, children }: { n: number; title: string; id?: string; children: ReactNode }) {
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

function Rows({ rows }: { rows: [string, ReactNode][] }) {
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

function CategoryRows({ cats }: { cats: HazardCategory[] }) {
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

function Checks({ cats, extra }: { cats: HazardCategory[]; extra?: string[] }) {
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
function CrewOptions({ cats }: { cats: HazardCategory[] }) {
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
function Alternatives({ cats }: { cats: HazardCategory[] }) {
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

function Actions({ actions }: { actions: Action[] }) {
  return (
    <>
      <section className="hz-d-actions" aria-label="Actions">
        <div className="hz-actions">
        {actions.map((a) =>
          a.href && !a.disabled ? (
            <a key={a.label} className="hz-btn" href={a.href} target="_blank" rel="noreferrer">
              {a.label}
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
          ) : (
            <button
              key={a.label}
              type="button"
              className={`hz-btn${a.pressed ? ' is-on' : ''}`}
              onClick={a.onClick}
              disabled={!!a.disabled}
              title={a.disabled}
              aria-pressed={a.pressed}
            >
              {a.label}
            </button>
          ),
        )}
        </div>
      </section>
      <div className="hz-d-reasons">
        {actions
          .filter((a) => a.disabled)
          .map((a) => (
            <p key={a.label} className="hz-disabled-reason">
              <strong>{a.label}:</strong> {a.disabled}
            </p>
          ))}
      </div>
    </>
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
    title: `${o.id} Â· ${o.name}`,
    at: o.observationCentre,
    sourceUrl: o.sourceUrl,
    status: 'Observation available Â· boundary not yet mapped',
  });
  const date = o.observationDate.value ?? o.publicationDate.value;
  return (
    <>
      {viewing && o.imageUrl && (
        <ImageViewer
          src={o.imageUrl}
          alt={`${o.id}: ${o.name}`}
          caption={[o.imageId.value, o.instrument.value, o.credit.value].filter(Boolean).join(' Â· ') || o.name}
          sourceUrl={o.sourceUrl}
          onClose={() => setViewing(false)}
        />
      )}
      <Head cats={cats} title={o.name} id={o.id} kind="NASA observation" />
      <p className="hz-callout">
        <strong>Observation available â€” boundary not mapped.</strong> The marker shows where the image was taken; this record has no outline of its own, so
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
        <Checks cats={cats} extra={['The featureâ€™s extent on the ground: it is not mapped from this record.']} />
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
    title: `${f.id} Â· ${f.interpretation}`,
    at: hit?.nearest ?? at,
    sourceUrl: data.url,
    status: 'USGS SIM 3292 mapped axis (line; width not mapped)',
  });
  return (
    <>
      <Head cats={[cat]} title={`Mapped ${f.interpretation.toLowerCase()}`} id={f.id} kind="Mapped line (USGS)" />
      <Glance
        cats={[cat]}
        concern={`The axis of ${pit ? 'a chain of pit craters' : 'a graben, a fault-bounded trough'}: steep walls and drops may lie along it.`}
        evidence={
          <>
            USGS global geologic map of Mars (SIM 3292), {data.scale}.{' '}
            <a href={data.url} target="_blank" rel="noreferrer">
              Source
            </a>
          </>
        }
      />
      <Section n={1} title="Hazard name and category">
        <Rows
          rows={[
            ['Feature', `${f.interpretation}, mapped as a line`],
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
          the troughâ€™s centre; its walls and width are not mapped.
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
      <Actions
        actions={[
          { label: 'View Source', href: data.url },
          { label: 'View NASA imagery', disabled: 'No image is linked to this mapped line; the mapâ€™s own imagery is underneath.' },
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
    title: `Steep slope ${cell.slopeDeg.toFixed(1)}Â° (MOLA cell)`,
    at: cell.centre,
    sourceUrl: store?.source,
    status: `Derived: ${cell.slopeDeg.toFixed(1)}Â° over 3.7 km; highlight limit ${hz.slopeThresholdDeg}Â°`,
  });
  return (
    <>
      <Head cats={[cat]} title={`Slope ${cell.slopeDeg.toFixed(1)}Â°, above your ${hz.slopeThresholdDeg}Â° limit`} id={`MOLA cell ${cell.i}, ${cell.j}`} kind="Derived from elevation model" />
      <Glance
        cats={[cat]}
        concern={`Ground averaging ${cell.slopeDeg.toFixed(1)}Â° across a ${SLOPE_CELL_KM} km cell, steeper than the planning limit you set.`}
        evidence="Calculated from NASA MOLA laser altimetry (Mars Global Surveyor, 1997â€“2001)."
      />
      <Section n={1} title="Hazard name and category">
        <Rows
          rows={[
            ['Feature', 'Elevation-model cell above the slope limit'],
            ['Category', <CategoryRows cats={[cat]} />],
            ['Classification', `${cell.slopeDeg.toFixed(1)}Â° is above ${hz.slopeThresholdDeg}Â° (your limit)`],
          ]}
        />
      </Section>
      <Section n={2} title="Latitude and longitude">
        <Rows
          rows={[
            ['Selected point', formatCoord(at, 3)],
            ['Cell centre', formatCoord(cell.centre, 4)],
            ['Cell edges', `${cell.bounds.south.toFixed(4)}Â° to ${cell.bounds.north.toFixed(4)}Â° latitude; ${lon(cell.bounds.west)} to ${lon(cell.bounds.east)}`],
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
            ['Agency / mission', 'NASA Â· Mars Global Surveyor'],
            ['Instrument', 'MOLA (Mars Orbiter Laser Altimeter)'],
            ['Dataset', store ? `${store.dataSetId}, ${store.product}` : null],
            ['Observation dates', '1997â€“2001 (mapping mission)'],
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
      <Actions
        actions={[
          { label: 'View Source', href: store?.source, disabled: store ? undefined : 'Elevation data not loaded.' },
          { label: 'View NASA imagery', disabled: 'No separate image is linked to an elevation cell; the mapâ€™s own imagery is underneath.' },
          { label: 'Focus Map', onClick: focus },
          ...mission,
          { label: 'Close', onClick: onClose },
        ]}
      />
    </>
  );
}

/* --------------------------------------------------------------------- point */

function PointView({ ctx, onPick, onClose }: { ctx: HazardContext; onPick(s: HazardSelection): void; onClose(): void }) {
  const threshold = useHazardState().slopeThresholdDeg;
  const mission = useMissionActions(null);
  const p = ctx.point;
  if (!p) return <p className="hz-muted">Checkingâ€¦</p>;
  const slope = p.slope;
  const candidates: { label: string; sel: HazardSelection; code: 'F' | 'P' | 'SL' | 'S' }[] = [
    ...p.dunes.map((f) => ({ label: `USGS dune field ${f.duneId}`, sel: { kind: 'feature' as const, id: f.id, at: p.at }, code: 'S' as const })),
    ...p.lines.map((h) => ({
      label: `${h.feature.interpretation} Â· ${h.feature.id}`,
      sel: { kind: 'feature' as const, id: h.feature.id, at: p.at },
      code: h.feature.category,
    })),
    ...(slope.state === 'classified'
      ? [{ label: `Slope cell ${slope.cell.slopeDeg.toFixed(1)}Â°`, sel: { kind: 'feature' as const, id: `SL:${slope.cell.i}:${slope.cell.j}`, at: p.at }, code: 'SL' as const }]
      : []),
  ];

  const lineCoverage = ctx.structures.state === 'ready';
  const slopeAssessed = slope.state === 'below' || slope.state === 'classified';

  return (
    <>
      <header className="hz-d-head">
        <div>
          <p className="hz-eyebrow">Selected point</p>
          <h2 className="hz-d-title">{formatCoord(p.at, 3)}</h2>
        </div>
      </header>
      {slope.state === 'pending' ? (
        <p className="hz-muted" role="status">
          Checking the layers at this pointâ€¦
        </p>
      ) : candidates.length > 1 ? (
        <>
          <p>Several mapped records overlap here. Choose one:</p>
          <ul className="hz-pick">
            {candidates.map((c) => (
              <li key={c.label}>
                <button type="button" className="hz-result" onClick={() => onPick(c.sel)}>
                  <img className="hz-swatch hz-swatch--sm" src={swatchUrl(c.code)} alt="" width={16} height={16} />
                  <span className="hz-result__title">
                    {categoryName(c.code)} Â· {c.label}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <>
          {lineCoverage || slopeAssessed ? (
            <p className="hz-callout">No mapped hazard at this point in the available coverage.</p>
          ) : (
            <p className="hz-callout hz-callout--error">Assessment unavailable: the mapped layers have not loaded.</p>
          )}
          <Rows
            rows={[
              [
                'Steep Slopes',
                slope.state === 'inactive'
                  ? 'Layer hidden: show Steep Slopes to test this point'
                  : slope.state === 'below'
                    ? `${slope.cell.slopeDeg.toFixed(1)}Â°, below your ${threshold}Â° limit`
                    : slope.state === 'unavailable'
                      ? `Assessment unavailable: ${slope.reason}`
                      : 'â€”',
              ],
              ['Fractures & Fault Troughs, Pits & Depressions', lineCoverage ? 'No mapped line within reach of the tap' : 'Assessment unavailable: lines not loaded'],
              [
                'Sand & Dunes',
                ctx.dunes.state === 'ready'
                  ? 'Not inside a mapped USGS dune field (small fields are not in that database)'
                  : ctx.dunes.state === 'error'
                    ? `Assessment unavailable: ${ctx.dunes.message}`
                    : 'Loading dune-field outlinesâ€¦',
              ],
              ['Other categories', 'No mapped boundary: not assessed here'],
            ]}
          />
          <p className="hz-muted">This is not a statement that the ground is safe: categories without mapped data are unknown here.</p>
          <Actions
            actions={[
              { label: 'View Source', disabled: 'No record is selected at this point.' },
              { label: 'View NASA imagery', disabled: 'No record is selected at this point.' },
              { label: 'Focus Map', onClick: () => ctx.map.setView(toMapLatLng(p.at, ctx.map.getCenter().lng), Math.max(ctx.map.getZoom(), 7)) },
              ...mission,
              { label: 'Close', onClick: onClose },
            ]}
          />
        </>
      )}
    </>
  );
}

/* ------------------------------------------------------------- dune field */

function DuneContext({ ctx, o }: { ctx: HazardContext; o: HazardObservationRecord }) {
  if (ctx.dunes.state === 'loading') return <p className="hz-muted">Checking the USGS dune-field outlines near this locationâ€¦</p>;
  if (ctx.dunes.state === 'error') return <p className="hz-callout hz-callout--error">USGS dune-field outlines unavailable: {ctx.dunes.message}</p>;
  const a = associateDunes(ctx.dunes.data, o.observationCentre);
  const open = (f: DuneFeature) => {
    ctx.locateDune(f);
    patchHazardState({ selection: { kind: 'feature', id: f.id, at: o.observationCentre } });
  };
  if (a.kind === 'none' || !a.field)
    return (
      <p className="hz-callout">
        <strong>No mapped dune field within {NEAR_FIELD_KM} km.</strong> The nearest USGS MGDÂ³ outline is about {Math.round(a.distanceKm)} km away. That database leaves out
        small dune fields, so this does not mean there are no dunes here; the dunes in this image are simply not outlined.
      </p>
    );
  return (
    <p className="hz-callout">
      {a.kind === 'inside' ? (
        <>
          <strong>This location lies inside a mapped dune field</strong> (USGS MGDÂ³ {a.field.duneId}). The fieldâ€™s outline is drawn on the map; it is the databaseâ€™s
          outline, not this imageâ€™s footprint.
        </>
      ) : (
        <>
          <strong>A mapped dune field lies about {a.distanceKm.toFixed(1)} km from this location</strong> (USGS MGDÂ³ {a.field.duneId}). It may or may not be the
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
    status: 'USGS MGDÂ³ mapped dune-field outline',
  });
  const imgs = [f.images.themisIR && `THEMIS IR ${f.images.themisIR}`, f.images.themisVIS && `THEMIS VIS ${f.images.themisVIS}`, f.images.moc && `MOC ${f.images.moc}`].filter(Boolean);
  return (
    <>
      <Head cats={[cat]} title={`Mapped dune field ${f.duneId}`} id={f.id} kind="Mapped outline (USGS)" />
      <Glance
        cats={[cat]}
        concern={`A field of ${f.types.length ? f.types.join(', ').toLowerCase() : 'unclassified'} dunes${f.areaKm2 ? `, about ${Math.round(f.areaKm2)} kmÂ²` : ''}: loose sand of unknown strength, with locally steep dune slopes.`}
        evidence={
          <>
            USGS Mars Global Digital Dune Database, outlined on THEMIS images.{' '}
            <a href={data.url} target="_blank" rel="noreferrer">
              Source
            </a>
          </>
        }
      />
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
            ['Area (database)', f.areaKm2 != null ? `${f.areaKm2.toFixed(1)} kmÂ²` : null],
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
            ['Observation dates', NA('Not given per field: THEMIS and MOC images acquired 1997â€“2006')],
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
      <Actions
        actions={[
          { label: 'View Source', href: data.url },
          { label: 'View NASA imagery', disabled: 'The database lists THEMIS/MOC image IDs (section 9) but links no image file; the mapâ€™s own imagery is underneath.' },
          { label: 'Focus Map', onClick: () => ctx.locateDune(f) },
          ...mission,
          { label: 'Close', onClick: onClose },
        ]}
      />
    </>
  );
}
