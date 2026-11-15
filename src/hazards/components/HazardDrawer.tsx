import { useState, useEffect, useRef, type ReactNode } from 'react';
import { toMapLatLng, useHazardState, type HazardSelection } from '../../shared';
import { CATEGORY_BY_CODE, type HazardCategory } from '../categories';
import { formatCoord } from '../coordinateInput';
import type { HazardContext } from '../HazardsLayer';
import { OBSERVATION_BY_ID, type HazardObservationRecord, type Sourced } from '../observations';
import { swatchUrl } from '../patterns';
import { SLOPE_CELL_KM, type SlopeCell } from '../slopeCells';
import { drawnLengthKm, featureBounds, type StructureData, type StructureFeature } from '../structures';
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
  } else if (selection.id.startsWith('SL:')) {
    body = ctx.slopeCell ? <SlopeView ctx={ctx} cell={ctx.slopeCell} at={selection.at} onClose={onClose} /> : <p className="hz-muted">Loading slope cell…</p>;
  } else {
    const f = ctx.structures.state === 'ready' ? ctx.structures.data.features.find((x) => x.id === selection.id) : undefined;
    body = f && ctx.structures.state === 'ready' ? <LineView ctx={ctx} f={f} data={ctx.structures.data} at={selection.at} onClose={onClose} /> : <p className="hz-muted">Loading feature…</p>;
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

function Head({ cat, title, id, sub }: { cat: HazardCategory; title: string; id: string; sub?: string }) {
  return (
    <header className="hz-d-head">
      <img className="hz-swatch" src={swatchUrl(cat.code)} alt="" width={28} height={28} />
      <div>
        <p className="hz-eyebrow">
          {cat.code} · {cat.name}
        </p>
        <h2 className="hz-d-title">{title}</h2>
        <p className="hz-d-sub">
          <span className="hz-id">{id}</span>
          {sub ? ` · ${sub}` : ''} · {cat.patternLabel} · <span className="hz-hex">{cat.colour}</span>
        </p>
      </div>
    </header>
  );
}

function Section({ letter, title, children }: { letter: string; title: string; children: ReactNode }) {
  return (
    <section className="hz-d-sec">
      <h3>
        <span className="hz-d-letter" aria-hidden="true">
          {letter}
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
      <span className="hz-prov">{s.from === 'catalogue' ? ' (supplied catalogue)' : ' (source page)'}</span>
    </>
  );
}

function Guidance({ cat }: { cat: HazardCategory }) {
  return (
    <>
      <Section letter="H" title="Precautions & Proposed Responses">
        <p className="hz-muted">Proposed planning actions for this category. They are not NASA-approved procedures and do not remove the hazard.</p>
        <ul className="hz-list">
          {cat.precautions.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
        <p className="hz-sub">Remaining uncertainty</p>
        <ul className="hz-list hz-list--caution">
          {cat.cautions.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      </Section>
      <Section letter="I" title="Alternative Options">
        <p className="hz-muted">No assessed route comparison is available here. Conceptual alternatives:</p>
        <ul className="hz-list">
          {cat.alternatives.map((p) => (
            <li key={p}>{p}</li>
          ))}
          <li>Remote observation, another science target, changed timing or postponement.</li>
        </ul>
      </Section>
    </>
  );
}

function Actions({ actions }: { actions: Action[] }) {
  return (
    <Section letter="J" title="Actions">
      <div className="hz-actions">
        {actions.map((a) =>
          a.href && !a.disabled ? (
            <a key={a.label} className="hz-btn" href={a.href} target="_blank" rel="noreferrer">
              {a.label}
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
          ) : (
            <button key={a.label} type="button" className={`hz-btn${a.pressed ? ' is-on' : ''}`} onClick={a.onClick} disabled={!!a.disabled} title={a.disabled} aria-pressed={a.pressed}>
              {a.label}
            </button>
          ),
        )}
      </div>
      {actions
        .filter((a) => a.disabled)
        .map((a) => (
          <p key={a.label} className="hz-disabled-reason">
            <strong>{a.label}:</strong> {a.disabled}
          </p>
        ))}
    </Section>
  );
}

/* -------------------------------------------------------------- observation */

function ObservationView({ ctx, o, onClose }: { ctx: HazardContext; o: HazardObservationRecord; onClose(): void }) {
  const cat = CATEGORY_BY_CODE[o.categories[0]];
  const focus = () => ctx.map.setView(toMapLatLng(o.observationCentre, ctx.map.getCenter().lng), Math.max(ctx.map.getZoom(), 8));
  const [viewing, setViewing] = useState(false);
  const mission = useMissionActions({
    id: o.id,
    code: o.categories[0],
    title: `${o.id} · ${o.name}`,
    at: o.observationCentre,
    sourceUrl: o.sourceUrl,
    status: 'Observation centre only; hazard boundary not mapped',
  });
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
      <Head cat={cat} title={o.name} id={o.id} sub={o.categories.length > 1 ? `Categories ${o.categories.join(' + ')}` : undefined} />
      <p className="hz-callout">Observation location available; hazard boundary not mapped.</p>
      {o.sourceIssues.map((s) => (
        <p key={s} className="hz-callout hz-callout--error" role="note">
          {s}
        </p>
      ))}

      <Section letter="A" title="Feature and category">
        <Rows
          rows={[
            ['Observed feature', o.observedFeature],
            ['Categories', o.categories.map((c) => `${c} · ${CATEGORY_BY_CODE[c].name}`).join('; ')],
            ['Observation ID', o.id],
          ]}
        />
      </Section>
      <Section letter="B" title="Coordinates">
        <Rows
          rows={[
            ['Observation centre', `${o.centreText.latitude}, ${o.centreText.longitude} (as supplied)`],
            ['Centre stated on source page', src(o.statedCentre)],
            ['Tapped point', <span className="hz-unavailable">None: this record was chosen from the catalogue</span>],
            ['Convention', o.coordinateConvention],
          ]}
        />
      </Section>
      <Section letter="C" title="What was observed and why it may matter">
        {o.sourceSummary.value && <blockquote className="hz-quote">{o.sourceSummary.value}</blockquote>}
        <p>{cat.whyItMatters}</p>
        <p className="hz-muted">{o.timeValidity}</p>
      </Section>
      <Section letter="D" title="Data status">
        <Rows
          rows={[
            ['Data status', 'Observed feature (NASA image), observation centre only'],
            ['Assessment status', 'Not assessed'],
            ['Current condition', 'Unknown'],
            ['Confidence', <span className="hz-unavailable">Not provided by the source</span>],
          ]}
        />
      </Section>
      <Section letter="E" title="Source">
        <Rows
          rows={[
            ['Agency', 'NASA'],
            ['Mission', src(o.mission)],
            ['Spacecraft', src(o.spacecraft)],
            ['Instrument', src(o.instrument)],
            ['Image / dataset ID', src(o.imageId)],
            ['Credit', src(o.credit)],
            ['Observation date', src(o.observationDate, 'Not stated on the source page')],
            ['Publication date', src(o.publicationDate)],
            ['Retrieved', o.retrievedDate],
            ['Resolution', src(o.sourceResolution)],
            ['Mapping method', 'None: no boundary mapped'],
            [
              'URL',
              <a href={o.sourceUrl} target="_blank" rel="noreferrer">
                {o.sourceUrl.replace('https://', '')}
              </a>,
            ],
          ]}
        />
      </Section>
      <Section letter="F" title="Extent and measurements">
        <ul className="hz-list hz-list--plain">
          <li>Mapped extent not established from this record.</li>
          <li>Depth not established from this record.</li>
          <li>Width not established from this record.</li>
          <li>Slope not established from this record.</li>
        </ul>
      </Section>
      <Section letter="G" title="Route interaction">
        <RouteInteraction match={{ kind: 'observation', id: o.id }} />
      </Section>
      {o.categories.map((c) => (
        <Guidance key={c} cat={CATEGORY_BY_CODE[c]} />
      ))}
      <Actions
        actions={[
          { label: 'View Source', href: o.sourceUrl },
          o.imageUrl
            ? { label: 'View Imagery', onClick: () => setViewing(true) }
            : { label: 'View Imagery', disabled: 'No image file was found on the source page.' },
          { label: 'Focus Map', onClick: focus },
          ...mission,
          { label: 'Close', onClick: onClose },
        ]}
      />
      {o.imageUrl && <p className="hz-muted">The NASA image is contextual imagery: it is not georeferenced or aligned to this map.</p>}
    </>
  );
}

/* --------------------------------------------------------------------- line */

function LineView({ ctx, f, data, at, onClose }: { ctx: HazardContext; f: StructureFeature; data: StructureData; at: import('../../shared').MarsCoordinate; onClose(): void }) {
  const cat = CATEGORY_BY_CODE[f.category];
  const hit = ctx.point?.lines.find((h) => h.feature.id === f.id);
  const drawn = drawnLengthKm(f);
  const focus = () => ctx.map.fitBounds(featureBounds(f, ctx.map.getCenter().lng), { padding: [60, 60], maxZoom: 9 });
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
      <Head cat={cat} title={`Mapped ${f.interpretation.toLowerCase()}`} id={f.id} sub="USGS SIM 3292" />
      <Section letter="A" title="Feature and category">
        <Rows
          rows={[
            ['Feature', `${f.interpretation} (tectonic trough), mapped as a line`],
            ['Category', `${cat.code} · ${cat.name}`],
            ['Preservation (USGS)', f.preservation],
            ['Dimension class (USGS)', f.dimension],
            ['Feature ID', f.id],
          ]}
        />
      </Section>
      <Section letter="B" title="Coordinates">
        <Rows
          rows={[
            ['Tapped point', formatCoord(at, 3)],
            ['Nearest point on mapped line', hit ? `${formatCoord(hit.nearest, 3)} (${hit.distancePx.toFixed(0)} px from tap)` : null],
            ['Observation centre', <span className="hz-unavailable">None: this is a mapped line, not a catalogue observation</span>],
          ]}
        />
      </Section>
      <Section letter="C" title="What was mapped and why it may matter">
        <p>
          The USGS global geologic map interprets this line as the axis of a {f.interpretation === 'Pit crater chain' ? 'chain of pit craters' : 'graben, a fault-bounded trough'}.
          The line marks the trough’s axis; its walls and width are not mapped.
        </p>
        <p>{cat.whyItMatters}</p>
      </Section>
      <Section letter="D" title="Data status">
        <Rows
          rows={[
            ['Data status', 'Mapped interpretation (geologic map line)'],
            ['Assessment status', 'Not assessed at walking scale'],
            ['Confidence', <span className="hz-unavailable">Not provided by the source</span>],
          ]}
        />
      </Section>
      <Section letter="E" title="Source">
        <Rows
          rows={[
            ['Agency', 'USGS (Astrogeology Science Center), with NASA support'],
            ['Dataset', `${data.source}`],
            ['Instrument / basis', 'Compiled from orbital datasets (THEMIS daytime IR mosaic, MOLA, others) as described in SIM 3292'],
            ['Observation date', <span className="hz-unavailable">Not applicable: a compiled map (published 2014)</span>],
            ['Scale', data.scale],
            ['Frame', data.frame],
            ['Mapping method', `Mapped line copied unchanged; display simplified (${data.simplification})`],
            [
              'URL',
              <a href={data.url} target="_blank" rel="noreferrer">
                {data.url.replace('https://', '')}
              </a>,
            ],
          ]}
        />
      </Section>
      <Section letter="F" title="Extent and measurements">
        <Rows
          rows={[
            ['Length (USGS SphLen_km)', f.lengthKm != null ? `${f.lengthKm} km` : null],
            ['Length as drawn', `${drawn.toFixed(1)} km (great circle, IAU sphere)`],
            ['Width', <span className="hz-unavailable">Width not established from this record</span>],
            ['Depth', <span className="hz-unavailable">Depth not established from this record</span>],
            ['Wall slope', <span className="hz-unavailable">Slope not established from this record</span>],
          ]}
        />
        <p className="hz-muted">At 1:20,000,000, mapped positions are uncertain by kilometres.</p>
      </Section>
      <Section letter="G" title="Route interaction">
        <RouteInteraction match={{ kind: 'line', id: f.id }} />
      </Section>
      <Guidance cat={cat} />
      <Actions
        actions={[
          { label: 'View Source', href: data.url },
          { label: 'View Imagery', disabled: 'No imagery is linked to this mapped line; the map’s own imagery is underneath.' },
          { label: 'Focus Map', onClick: focus },
          ...mission,
          { label: 'Close', onClick: onClose },
        ]}
      />
    </>
  );
}

/* -------------------------------------------------------------------- slope */

function SlopeView({ ctx, cell, at, onClose }: { ctx: HazardContext; cell: SlopeCell; at: import('../../shared').MarsCoordinate; onClose(): void }) {
  const hz = useHazardState();
  const cat = CATEGORY_BY_CODE.SL;
  const store = ctx.slopeStore.state === 'ready' ? ctx.slopeStore.data.manifest : null;
  const focus = () => ctx.map.setView(toMapLatLng(cell.centre, ctx.map.getCenter().lng), Math.max(ctx.map.getZoom(), 8));
  const mission = useMissionActions({
    id: `SL:${cell.i}:${cell.j}`,
    code: 'SL',
    title: `MOLA slope cell ${cell.slopeDeg.toFixed(1)}°`,
    at: cell.centre,
    sourceUrl: store?.source,
    status: `Derived: slope ${cell.slopeDeg.toFixed(1)}° over 3.7 km, threshold ${hz.slopeThresholdDeg}°`,
  });
  return (
    <>
      <Head cat={cat} title={`Slope ${cell.slopeDeg.toFixed(1)}° (≥ ${hz.slopeThresholdDeg}° threshold)`} id={`MOLA bin ${cell.i}, ${cell.j}`} sub="Derived" />
      <Section letter="A" title="Feature and category">
        <Rows
          rows={[
            ['Feature', 'Elevation-model cell meeting the steep-slope threshold'],
            ['Category', `${cat.code} · ${cat.name}`],
            ['Classification', `Slope ${cell.slopeDeg.toFixed(1)}° ≥ ${hz.slopeThresholdDeg}° (your threshold)`],
          ]}
        />
      </Section>
      <Section letter="B" title="Coordinates">
        <Rows
          rows={[
            ['Tapped point', formatCoord(at, 3)],
            ['Cell centre', formatCoord(cell.centre, 4)],
            [
              'Cell bounds',
              `${cell.bounds.south.toFixed(4)}° to ${cell.bounds.north.toFixed(4)}° lat, ${formatCoord({ latitude: 0, longitudeEast: cell.bounds.west }, 4).split(', ')[1]} to ${formatCoord({ latitude: 0, longitudeEast: cell.bounds.east }, 4).split(', ')[1]}`,
            ],
            ['Observation centre', <span className="hz-unavailable">None: a derived cell, not a catalogue observation</span>],
          ]}
        />
      </Section>
      <Section letter="C" title="What was derived and why it may matter">
        <p>The slope of this 3.7 km elevation bin, from MOLA laser altimetry, meets the threshold you set.</p>
        <p>{cat.whyItMatters}</p>
      </Section>
      <Section letter="D" title="Data status">
        <Rows
          rows={[
            ['Data status', 'Derived classification (documented method)'],
            ['Assessment status', 'Slope assessment available; nothing else assessed'],
            ['Confidence', <span className="hz-unavailable">Not quantified</span>],
          ]}
        />
      </Section>
      <Section letter="E" title="Source">
        <Rows
          rows={[
            ['Agency / mission', 'NASA · Mars Global Surveyor'],
            ['Instrument', 'MOLA (Mars Orbiter Laser Altimeter)'],
            ['Dataset ID', store ? `${store.dataSetId}, ${store.product}` : null],
            ['Observation dates', '1997–2001 (MGS mapping mission)'],
            ['Resolution', `${store?.pixelsPerDegree ?? 16} px/deg, ${SLOPE_CELL_KM} km bins`],
            ['Mapping method', 'Central differences over neighbouring bins on the sphere; each bin classified on its own value; outlines follow cell edges'],
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
      </Section>
      <Section letter="F" title="Extent and measurements">
        <Rows
          rows={[
            ['Slope', `${cell.slopeDeg.toFixed(1)}° over a ${SLOPE_CELL_KM} km baseline`],
            ['Cell size', `${SLOPE_CELL_KM} km north–south; ${(SLOPE_CELL_KM * Math.cos((cell.centre.latitude * Math.PI) / 180)).toFixed(2)} km east–west here`],
            ['Depth', <span className="hz-unavailable">Not applicable</span>],
          ]}
        />
        <p className="hz-muted">Local slopes within a 3.7 km bin can be far steeper than the bin value. There is no universal astronaut-safe slope.</p>
      </Section>
      <Section letter="G" title="Route interaction">
        <RouteInteraction match={{ kind: 'slope', bounds: cell.bounds }} />
      </Section>
      <Guidance cat={cat} />
      <Actions
        actions={[
          { label: 'View Source', href: store?.source, disabled: store ? undefined : 'Elevation data not loaded.' },
          { label: 'View Imagery', disabled: 'The map’s own imagery is underneath; no separate image is linked to an elevation cell.' },
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
  if (!p) return <p className="hz-muted">Inspecting…</p>;
  const slope = p.slope;
  const candidates: { label: string; sel: HazardSelection; code: 'F' | 'P' | 'SL' }[] = [
    ...p.lines.map((h) => ({
      label: `${h.feature.interpretation} · ${h.feature.id}`,
      sel: { kind: 'feature' as const, id: h.feature.id, at: p.at },
      code: h.feature.category,
    })),
    ...(slope.state === 'classified'
      ? [{ label: `Slope cell ${slope.cell.slopeDeg.toFixed(1)}°`, sel: { kind: 'feature' as const, id: `SL:${slope.cell.i}:${slope.cell.j}`, at: p.at }, code: 'SL' as const }]
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
          Checking layers at this point…
        </p>
      ) : candidates.length > 1 ? (
        <>
          <p>Several mapped records overlap here. Choose one to inspect:</p>
          <ul className="hz-pick">
            {candidates.map((c) => (
              <li key={c.label}>
                <button type="button" className="hz-result" onClick={() => onPick(c.sel)}>
                  <img className="hz-swatch hz-swatch--sm" src={swatchUrl(c.code)} alt="" width={16} height={16} />
                  <span className="hz-result__title">
                    {c.code} · {c.label}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <>
          {lineCoverage || slopeAssessed ? (
            <p className="hz-callout">No mapped hazard at this point in available coverage.</p>
          ) : (
            <p className="hz-callout hz-callout--error">Assessment unavailable.</p>
          )}
          <Rows
            rows={[
              [
                'Steep slope (SL)',
                slope.state === 'inactive'
                  ? 'Layer hidden: switch SL on to test this point'
                  : slope.state === 'below'
                    ? `${slope.cell.slopeDeg.toFixed(1)}°, below your ${threshold}° threshold`
                    : slope.state === 'unavailable'
                      ? `Assessment unavailable: ${slope.reason}`
                      : '—',
              ],
              ['USGS mapped troughs (F, P)', lineCoverage ? 'No mapped line within the tap tolerance' : 'Assessment unavailable: lines not loaded'],
              ['Other categories', 'Not mapped on this map: not assessed'],
            ]}
          />
          <p className="hz-muted">This is not a statement that the ground is safe. Unmapped categories are unknown here.</p>
          <Actions
            actions={[
              { label: 'View Source', disabled: 'No record is selected at this point.' },
              { label: 'View Imagery', disabled: 'No record is selected at this point.' },
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
