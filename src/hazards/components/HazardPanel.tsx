import { useEffect, useId, useState } from 'react';
import { MARS_LOCATIONS, locationCoordinate } from '../../science/locations';
import {
  HAZARD_DEFAULTS,
  SLOPE_LIMIT_SOURCE_LABEL,
  greatCircleDistanceM,
  patchHazardState,
  useHazardState,
  useMissionConstraints,
  usePlannedRoute,
  useUiMode,
  type HazardCode,
  type MarsCoordinate,
  type SlopeLimitSource,
} from '../../shared';
import {
  AVAILABILITY_LABEL,
  CATEGORIES,
  CATEGORY_BY_CODE,
  DRAWABLE,
  GROUPS,
  ROUTE_TESTABLE,
  categoryName,
  type CategoryGroup,
  type HazardCategory,
} from '../categories';
import { formatCoord } from '../coordinateInput';
import type { HazardContext } from '../HazardsLayer';
import { OBSERVATIONS, OBSERVATION_BY_ID, type HazardObservationRecord } from '../observations';
import { swatchUrl } from '../patterns';
import { SLOPE_CELL_KM, SLOPE_MIN_ZOOM } from '../slopeCells';
import { ImageViewer } from './RouteLinks';
import { DataCheck } from './DataCheck';
import SimpleHazards from './SimpleHazards';
import { useEnvInputs } from '../env/inputs';
import { envStatus } from '../env/status';

/** Categories whose details (inputs, calculation, sources) open in the information panel. */
const ENV_CODES: HazardCode[] = ['V', 'T', 'R', 'C', 'N', 'E', 'M', 'U'];

type Tab = 'layers' | 'settings' | 'observations';

const isPhone = () => window.matchMedia?.('(max-width: 640px)').matches ?? false;
const observationsOf = (code: HazardCode) => OBSERVATIONS.filter((o) => o.categories.includes(code));

export default function HazardPanel({ ctx }: { ctx: HazardContext }) {
  const hz = useHazardState();
  const [tab, setTab] = useState<Tab>('layers');
  const simple = useUiMode() === 'simple';
  // Advanced Details: folded in Simple mode (opened on request), always open in Advanced mode
  const [advOpen, setAdvOpen] = useState(false);
  const showAdvanced = !simple || advOpen;
  const [collapsed, setCollapsed] = useState(isPhone);
  const [filter, setFilter] = useState<HazardCode | 'all'>('all');
  const [zoom, setZoom] = useState(() => ctx.map.getZoom());
  useEffect(() => {
    const update = () => setZoom(ctx.map.getZoom());
    ctx.map.on('zoomend', update);
    return () => {
      ctx.map.off('zoomend', update);
    };
  }, [ctx.map]);

  const viewObservations = (code: HazardCode) => {
    setFilter(code);
    setTab('observations');
  };

  const advanced = (
    <>
      <div className="hz-tabs" role="tablist" aria-label="Hazard panel sections">
        {(
          [
            ['layers', 'Hazard layers'],
            ['settings', 'Display & route'],
            ['observations', `Observations (${OBSERVATIONS.length})`],
          ] as const
        ).map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} className={tab === id ? 'is-active' : ''} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>
      {/* keyed by tab, so each tab opens at its top */}
      <div className="hz-panel__body" role="tabpanel" key={tab}>
        {tab === 'layers' && <Layers ctx={ctx} zoom={zoom} onViewObservations={viewObservations} />}
        {tab === 'settings' && <Settings ctx={ctx} />}
        {tab === 'observations' && <Observations ctx={ctx} filter={filter} setFilter={setFilter} />}
      </div>
      <Readout ctx={ctx} selectedObservation={hz.selection?.kind === 'observation' ? hz.selection.id : null} />
    </>
  );

  return (
    <aside className={`hz-panel${collapsed ? ' is-collapsed' : ''}`} aria-label="Hazard layers and observations">
      <header className="hz-panel__head">
        <div>
          <h2 className="hz-panel__title">Mars Hazards</h2>
          <p className="hz-panel__sub">Explore terrain risks and check your mission route.</p>
        </div>
        <button
          type="button"
          className="hz-icon-btn"
          aria-expanded={!collapsed}
          aria-label={collapsed ? 'Expand hazard panel' : 'Collapse hazard panel'}
          onClick={() => setCollapsed((c) => !c)}
        >
          <svg viewBox="0 0 20 20" aria-hidden="true">
            <path d={collapsed ? 'm6 8 4 4 4-4' : 'm6 12 4-4 4 4'} />
          </svg>
        </button>
      </header>

      {!collapsed &&
        (simple ? (
          <div className={`hz-panel__simple${showAdvanced ? ' has-advanced' : ''}`}>
            {!showAdvanced && <SimpleHazards ctx={ctx} />}
            <button type="button" className="hz-adv-toggle" aria-expanded={showAdvanced} onClick={() => setAdvOpen((o) => !o)}>
              <svg viewBox="0 0 20 20" aria-hidden="true" className="hz-chev">
                <path d="m7 5 5 5-5 5" />
              </svg>
              {showAdvanced ? 'Back to the simple view' : 'Advanced Details'}
              {!showAdvanced && <small>All hazard categories, display and route settings, {OBSERVATIONS.length} observations, sources</small>}
            </button>
            {showAdvanced && advanced}
          </div>
        ) : (
          advanced
        ))}
    </aside>
  );
}

/* ------------------------------------------------------------------ layers */

type Tone = 'ok' | 'warn' | 'error' | 'muted';

function useLayerStatus(ctx: HazardContext, zoom: number) {
  const hz = useHazardState();
  const inputs = useEnvInputs();
  const snapshot = useMissionConstraints();
  const route = usePlannedRoute();
  return (cat: HazardCategory): { text: string; tone: Tone; retry?: () => void; label?: string } => {
    const env = envStatus(cat.code, { plannedTime: hz.plannedTime, dem: ctx.slopeStore, retryDem: ctx.retrySlope, inputs, snapshot, route, commReady: true });
    if (env) return { text: env.text, tone: env.tone, retry: env.retry, label: env.status };
    if (cat.code === 'F' || cat.code === 'P') {
      if (ctx.structures.state === 'loading') return { text: 'Loading USGS map lines…', tone: 'muted' };
      if (ctx.structures.state === 'error') return { text: `Could not load the mapped lines: ${ctx.structures.message}`, tone: 'error', retry: ctx.retryStructures };
      const n = ctx.structures.data.features.filter((f) => f.category === cat.code).length;
      return { text: `${n} mapped trough lines (USGS)`, tone: 'ok' };
    }
    if (cat.code === 'SL') {
      if (ctx.slopeStore.state === 'loading') return { text: 'Loading MOLA elevations…', tone: 'muted' };
      if (ctx.slopeStore.state === 'error')
        return { text: 'A suitable elevation model is required to calculate slope coverage.', tone: 'error', retry: ctx.retrySlope };
      if (zoom < SLOPE_MIN_ZOOM) return { text: `Zoom in further to see slope cells (level ${SLOPE_MIN_ZOOM}+)`, tone: 'warn' };
      return { text: `Slopes above ${hz.slopeThresholdDeg}° highlighted in view`, tone: 'ok' };
    }
    if (cat.code === 'S') {
      const n = observationsOf('S').length;
      if (ctx.dunes.state === 'loading') return { text: 'Loading USGS dune-field outlines…', tone: 'muted' };
      if (ctx.dunes.state === 'error') return { text: `Could not load the dune-field outlines: ${ctx.dunes.message}`, tone: 'error', retry: ctx.retryDunes };
      return { text: `${ctx.dunes.data.count} mapped dune fields (USGS) · ${n} NASA location markers`, tone: 'ok' };
    }
    if (cat.code === 'U') return { text: 'Covers all terrain when shown', tone: 'muted' };
    if (cat.availability === 'observations') {
      const n = observationsOf(cat.code).length;
      return { text: `${n} NASA location marker${n === 1 ? '' : 's'} · boundary not mapped`, tone: 'muted' };
    }
    if (cat.code === 'E' || cat.code === 'M') return { text: 'A mission-plan constraint, not a map area', tone: 'muted' };
    return { text: 'Not assessed: no dataset is loaded', tone: 'muted' };
  };
}

function Layers({ ctx, zoom, onViewObservations }: { ctx: HazardContext; zoom: number; onViewObservations(code: HazardCode): void }) {
  const hz = useHazardState();
  const [open, setOpen] = useState<CategoryGroup[]>(['terrain']);
  const status = useLayerStatus(ctx, zoom);
  const toggleGroup = (g: CategoryGroup) => setOpen((o) => (o.includes(g) ? o.filter((x) => x !== g) : [...o, g]));

  return (
    <div className="hz-layers">
      <p className="hz-note">
        Choose which hazards appear on the map. Route checks are set separately under <em>Display &amp; route</em>.
      </p>
      {GROUPS.map((g) => {
        const cats = CATEGORIES.filter((c) => c.group === g.id);
        const drawable = cats.filter((c) => DRAWABLE.includes(c.code));
        const shown = drawable.filter((c) => hz.active.includes(c.code)).length;
        const expanded = open.includes(g.id);
        return (
          <section key={g.id} className="hz-grp">
            <button type="button" className="hz-grp__head" aria-expanded={expanded} onClick={() => toggleGroup(g.id)}>
              <svg viewBox="0 0 20 20" aria-hidden="true" className="hz-chev">
                <path d="m7 5 5 5-5 5" />
              </svg>
              <span className="hz-grp__title">{g.title}</span>
              <span className="hz-grp__count">{drawable.length ? `${shown} of ${drawable.length} shown` : `${cats.length} not mappable`}</span>
            </button>
            {expanded && (
              <>
                <p className="hz-grp__intro">{g.intro}</p>
                {g.id === 'environment' && (
                  <p className="hz-grp__intro">
                    {hz.plannedTime
                      ? `Planned for ${hz.plannedTime.replace('T', ' ')} UTC: no dated data is loaded for that time.`
                      : 'Set a planned date and time in the top bar to record it with the plan.'}
                  </p>
                )}
                <ul className="hz-cats">
                  {cats.map((cat) => (
                    <CategoryRow key={cat.code} cat={cat} status={status(cat)} onViewObservations={onViewObservations} />
                  ))}
                </ul>
              </>
            )}
          </section>
        );
      })}
      <DataCheck ctx={ctx} />
      <p className="hz-note">Colours and patterns are this project’s design choices, not NASA symbology. They identify a category; they never mean severity, and green never means safe.</p>
    </div>
  );
}

function CategoryRow({
  cat,
  status,
  onViewObservations,
}: {
  cat: HazardCategory;
  status: { text: string; tone: Tone; retry?: () => void; label?: string };
  onViewObservations(code: HazardCode): void;
}) {
  const hasDetails = ENV_CODES.includes(cat.code);
  const hz = useHazardState();
  const [more, setMore] = useState(false);
  const id = useId();
  const drawable = DRAWABLE.includes(cat.code);
  const on = drawable && hz.active.includes(cat.code);
  const nObs = observationsOf(cat.code).length;
  const toggle = () => patchHazardState({ active: on ? hz.active.filter((c) => c !== cat.code) : [...hz.active, cat.code] });

  return (
    <li className={`hz-cat${drawable ? '' : ' is-static'}`}>
      <div className="hz-cat__row">
        <img className="hz-swatch" src={swatchUrl(cat.code)} alt="" width={28} height={28} />
        <div className="hz-cat__text">
          <p className="hz-cat__name" id={`${id}-n`}>
            {cat.name}
          </p>
          <p className="hz-cat__short">{cat.short}</p>
        </div>
        <label className={`hz-toggle${drawable ? '' : ' is-disabled'}`}>
          <input
            type="checkbox"
            role="switch"
            checked={on}
            disabled={!drawable}
            onChange={toggle}
            aria-labelledby={`${id}-n`}
            aria-describedby={`${id}-s`}
          />
          <span className="hz-toggle__track" aria-hidden="true" />
          <span className="hz-toggle__text">{drawable ? (on ? 'Shown' : 'Hidden') : 'No map'}</span>
        </label>
      </div>
      <div className="hz-cat__meta">
        <span className={`hz-avail hz-avail--${cat.availability}`}>{status.label ?? AVAILABILITY_LABEL[cat.availability]}</span>
        <span className={`hz-tone--${status.tone}`} id={`${id}-s`}>
          {status.text}
        </span>
        {status.retry && (
          <button type="button" className="hz-link" onClick={status.retry}>
            Retry
          </button>
        )}
      </div>
      <div className="hz-cat__actions">
        {nObs > 0 && (
          <button type="button" className="hz-link" onClick={() => onViewObservations(cat.code)}>
            View observations ({nObs})
          </button>
        )}
        {hasDetails ? (
          <button type="button" className="hz-link" onClick={() => patchHazardState({ selection: { kind: 'category', code: cat.code } })}>
            View details
          </button>
        ) : (
          <button type="button" className="hz-link" aria-expanded={more} onClick={() => setMore((m) => !m)}>
            {more ? 'Less' : 'About this layer'}
          </button>
        )}
      </div>
      {more && (
        <div className="hz-cat__more">
          <p>{cat.description}</p>
          <p>
            <strong>On this map:</strong> {cat.mappingNote}
          </p>
          <p>
            <strong>Locations:</strong> {cat.locationBasis}
            {nObs > 0 ? ` (${nObs} record${nObs === 1 ? '' : 's'})` : ''}
          </p>
          <p>
            <strong>Pattern:</strong> {cat.patternLabel} · <span className="hz-hex">{cat.colour}</span>
          </p>
        </div>
      )}
    </li>
  );
}

/* ---------------------------------------------------------------- settings */

function Settings({ ctx }: { ctx: HazardContext }) {
  return (
    <div className="hz-settings">
      <Appearance />
      <SlopeLimit ctx={ctx} />
      <RouteAssessment />
    </div>
  );
}

function Appearance() {
  const hz = useHazardState();
  const id = useId();
  const pct = Math.round(hz.fillOpacity * 100);
  return (
    <section className="hz-set">
      <h3 className="hz-set__title">Hazard shading strength</h3>
      <p className="hz-set__help">Adjust how strongly hazard areas appear over the terrain.</p>
      <div className="hz-seg" role="radiogroup" aria-label="Hazard appearance">
        {(
          [
            [false, 'Shading + outlines'],
            [true, 'Outlines only'],
          ] as const
        ).map(([value, label]) => (
          <button key={label} type="button" role="radio" aria-checked={hz.outlinesOnly === value} className={hz.outlinesOnly === value ? 'is-active' : ''} onClick={() => patchHazardState({ outlinesOnly: value })}>
            {label}
          </button>
        ))}
      </div>
      <div className="hz-range">
        <label htmlFor={id}>Shading</label>
        <input
          id={id}
          type="range"
          min={0}
          max={0.6}
          step={0.05}
          value={hz.fillOpacity}
          disabled={hz.outlinesOnly}
          aria-valuetext={`${pct}%`}
          onChange={(e) => patchHazardState({ fillOpacity: Number(e.target.value) })}
        />
        <output htmlFor={id}>{hz.outlinesOnly ? 'Off' : `${pct}%`}</output>
      </div>
      <p className="hz-set__note">
        This changes appearance only, not hazard severity. Outlines stay visible at 0%. Steep-slope cells are the only areas drawn; mapped troughs are lines.
      </p>
      <button type="button" className="hz-btn hz-btn--ghost hz-btn--sm" onClick={() => patchHazardState({ fillOpacity: HAZARD_DEFAULTS.fillOpacity, outlinesOnly: false })}>
        Reset appearance
      </button>
    </section>
  );
}

function SlopeLimit({ ctx }: { ctx: HazardContext }) {
  const hz = useHazardState();
  const [draft, setDraft] = useState(String(hz.slopeThresholdDeg));
  const [source, setSource] = useState<SlopeLimitSource>(hz.slopeLimitSource);
  const [reference, setReference] = useState(hz.slopeLimitReference);
  const ids = { value: useId(), source: useId(), ref: useId() };
  useEffect(() => {
    setDraft(String(hz.slopeThresholdDeg));
    setSource(hz.slopeLimitSource);
    setReference(hz.slopeLimitReference);
  }, [hz.slopeThresholdDeg, hz.slopeLimitSource, hz.slopeLimitReference]);

  const store = ctx.slopeStore;
  const manifest = store.state === 'ready' ? store.data.manifest : null;
  const value = Number(draft);
  const valueError = draft.trim() === '' || !Number.isFinite(value) || value < 1 || value > 45 ? 'Enter a slope between 1° and 45°.' : null;
  const refError = source === 'documented' && !reference.trim() ? 'Name the document this limit comes from.' : null;
  const dirty = value !== hz.slopeThresholdDeg || source !== hz.slopeLimitSource || reference.trim() !== hz.slopeLimitReference;
  const unavailable = store.state === 'error';

  const apply = () => {
    if (valueError || refError) return;
    patchHazardState({ slopeThresholdDeg: value, slopeLimitSource: source, slopeLimitReference: source === 'documented' ? reference.trim() : '' });
  };

  return (
    <section className="hz-set">
      <h3 className="hz-set__title">Highlight slopes above</h3>
      <p className="hz-set__help">Highlights terrain exceeding your selected planning limit. This is not a universal safe walking angle.</p>
      {unavailable && (
        <div className="hz-callout hz-callout--error" role="alert">
          A suitable elevation model is required to calculate slope coverage.
          <span className="hz-muted"> ({store.message})</span>
          <button type="button" className="hz-link" onClick={ctx.retrySlope}>
            Retry
          </button>
        </div>
      )}
      <fieldset className="hz-fieldset" disabled={unavailable}>
        <div className="hz-slope-in">
          <label htmlFor={ids.value} className="sr-only">
            Slope limit in degrees
          </label>
          <span className="hz-num">
            <input
              id={ids.value}
              type="number"
              min={1}
              max={45}
              step={0.5}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && apply()}
              aria-invalid={!!valueError}
            />
            <span aria-hidden="true">°</span>
          </span>
          <input
            type="range"
            min={1}
            max={45}
            step={0.5}
            value={Number.isFinite(value) ? Math.min(45, Math.max(1, value)) : hz.slopeThresholdDeg}
            onChange={(e) => setDraft(e.target.value)}
            aria-label="Slope limit slider"
            aria-valuetext={`${draft} degrees`}
          />
        </div>
        {valueError && <p className="hz-error">{valueError}</p>}
        <label className="hz-field" htmlFor={ids.source}>
          Source of this limit
        </label>
        <select id={ids.source} className="hz-select" value={source} onChange={(e) => setSource(e.target.value as SlopeLimitSource)}>
          {(Object.keys(SLOPE_LIMIT_SOURCE_LABEL) as SlopeLimitSource[]).map((s) => (
            <option key={s} value={s}>
              {SLOPE_LIMIT_SOURCE_LABEL[s]}
            </option>
          ))}
        </select>
        {source === 'documented' && (
          <>
            <label className="hz-field" htmlFor={ids.ref}>
              Document reference
            </label>
            <input id={ids.ref} className="hz-text" type="text" value={reference} placeholder="e.g. mission rules document and section" onChange={(e) => setReference(e.target.value)} />
            {refError && <p className="hz-error">{refError}</p>}
          </>
        )}
        <dl className="hz-facts">
          <div>
            <dt>Terrain dataset</dt>
            <dd>{manifest ? `NASA MOLA MEGDR ${manifest.product} (${manifest.dataSetId})` : store.state === 'loading' ? 'Loading MOLA elevations…' : 'MOLA MEGDR (not loaded)'}</dd>
          </div>
          <div>
            <dt>Resolution</dt>
            <dd>
              {manifest?.pixelsPerDegree ?? 16} px per degree: cells about {SLOPE_CELL_KM} km across; slope over that distance
            </dd>
          </div>
          <div>
            <dt>Now applied</dt>
            <dd>
              {hz.slopeThresholdDeg}° · {SLOPE_LIMIT_SOURCE_LABEL[hz.slopeLimitSource]}
              {hz.slopeLimitReference ? ` (${hz.slopeLimitReference})` : ''}
            </dd>
          </div>
        </dl>
        <div className="hz-row-btns">
          <button type="button" className="hz-btn hz-btn--sm" onClick={apply} disabled={!dirty || !!valueError || !!refError}>
            Apply
          </button>
          <button
            type="button"
            className="hz-btn hz-btn--ghost hz-btn--sm"
            onClick={() => patchHazardState({ slopeThresholdDeg: HAZARD_DEFAULTS.slopeThresholdDeg, slopeLimitSource: 'illustrative', slopeLimitReference: '' })}
          >
            Reset
          </button>
          {dirty && !valueError && <span className="hz-muted">Not applied yet</span>}
        </div>
        <p className="hz-set__note">
          The starting value of {HAZARD_DEFAULTS.slopeThresholdDeg}° is an illustrative planning assumption, not a NASA-approved limit. Within one {SLOPE_CELL_KM} km cell,
          local slopes can be much steeper.
        </p>
      </fieldset>
    </section>
  );
}

function RouteAssessment() {
  const hz = useHazardState();
  const toggle = (code: HazardCode) =>
    patchHazardState({ routeExcluded: hz.routeExcluded.includes(code) ? hz.routeExcluded.filter((c) => c !== code) : [...hz.routeExcluded, code] });
  return (
    <section className="hz-set">
      <h3 className="hz-set__title">Route assessment</h3>
      <p className="hz-set__help">
        Choose which mapped layers the planned route is tested against. This is separate from Shown / Hidden: hiding a layer on the map never removes it from
        the route test.
      </p>
      <ul className="hz-checks">
        {ROUTE_TESTABLE.map((code) => {
          const cat = CATEGORY_BY_CODE[code];
          const included = !hz.routeExcluded.includes(code);
          return (
            <li key={code}>
              <label className="hz-check">
                <input type="checkbox" checked={included} onChange={() => toggle(code)} />
                <img className="hz-swatch hz-swatch--sm" src={swatchUrl(code)} alt="" width={16} height={16} />
                <span>Test the route against {cat.name}</span>
              </label>
            </li>
          );
        })}
      </ul>
      {hz.routeExcluded.length > 0 && (
        <p className="hz-callout">Excluded: {hz.routeExcluded.map(categoryName).join(', ')}. The route summary lists these as “Excluded by you”.</p>
      )}
      <p className="hz-set__note">Other categories have no mapped boundary, so the route cannot be tested against them; the summary says so.</p>
    </section>
  );
}

/* ------------------------------------------------------------ observations */

function Observations({ ctx, filter, setFilter }: { ctx: HazardContext; filter: HazardCode | 'all'; setFilter(f: HazardCode | 'all'): void }) {
  const hz = useHazardState();
  const [viewing, setViewing] = useState<HazardObservationRecord | null>(null);
  const id = useId();
  const selected = hz.selection?.kind === 'observation' ? hz.selection.id : null;
  const withObs = CATEGORIES.filter((c) => observationsOf(c.code).length > 0);
  const groups = (filter === 'all' ? withObs : [CATEGORY_BY_CODE[filter]]).map((cat) => ({
    cat,
    items: filter === 'all' ? OBSERVATIONS.filter((o) => o.categories[0] === cat.code) : observationsOf(cat.code),
  }));

  return (
    <div className="hz-catalogue">
      {viewing?.imageUrl && (
        <ImageViewer
          src={viewing.imageUrl}
          alt={`${viewing.id}: ${viewing.name}`}
          caption={[viewing.imageId.value, viewing.instrument.value, viewing.credit.value].filter(Boolean).join(' · ') || viewing.name}
          sourceUrl={viewing.sourceUrl}
          onClose={() => setViewing(null)}
        />
      )}
      <h3 className="hz-set__title">Explore observed features</h3>
      <p className="hz-note">
        Places where NASA images show each feature. A location marks the image, not the hazard’s edge: no boundary is mapped for these records.
      </p>
      <label className="hz-field" htmlFor={id}>
        Show
      </label>
      <select id={id} className="hz-select" value={filter} onChange={(e) => setFilter(e.target.value as HazardCode | 'all')}>
        <option value="all">All categories ({OBSERVATIONS.length})</option>
        {withObs.map((c) => (
          <option key={c.code} value={c.code}>
            {c.name} ({observationsOf(c.code).length})
          </option>
        ))}
      </select>
      {groups.map(({ cat, items }) => (
        <section key={cat.code} className="hz-group">
          <h4 className="hz-group__title">
            <img className="hz-swatch hz-swatch--sm" src={swatchUrl(cat.code)} alt="" width={16} height={16} />
            {cat.name}
          </h4>
          <ul>
            {items.map((o) => (
              <li key={o.id} className={`hz-obs${selected === o.id ? ' is-selected' : ''}`} aria-current={selected === o.id ? 'true' : undefined}>
                <p className="hz-obs__name">
                  <span className="hz-id">{o.id}</span> {o.name}
                </p>
                <p className="hz-obs__meta">
                  {o.categories.map(categoryName).join(' + ')} · {o.centreText.latitude}, {o.centreText.longitude}
                </p>
                <p className="hz-obs__status">
                  Observation available — boundary not mapped
                  {o.sourceIssues.length > 0 && <span className="hz-flag"> · source issue</span>}
                </p>
                <div className="hz-obs__actions">
                  <button type="button" className="hz-btn hz-btn--sm" onClick={() => ctx.focusObservation(o.id)}>
                    Locate on map
                  </button>
                  <button
                    type="button"
                    className="hz-btn hz-btn--ghost hz-btn--sm"
                    disabled={!o.imageUrl}
                    title={o.imageUrl ? undefined : 'No image file was found on the source page.'}
                    onClick={() => setViewing(o)}
                  >
                    View NASA imagery
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

/* ----------------------------------------------------------------- readout */

function nearestNamed(c: MarsCoordinate) {
  let best: { name: string; km: number } | null = null;
  for (const loc of MARS_LOCATIONS) {
    const km = greatCircleDistanceM(c, locationCoordinate(loc)) / 1000;
    if (!best || km < best.km) best = { name: loc.name, km };
  }
  return best;
}

/** Cursor, selected point, observation location and nearest named feature: four separate things. */
function Readout({ ctx, selectedObservation }: { ctx: HazardContext; selectedObservation: string | null }) {
  const hz = useHazardState();
  const selectedAt = hz.selection && (hz.selection.kind === 'feature' || hz.selection.kind === 'point') ? hz.selection.at : null;
  const obs = selectedObservation ? OBSERVATION_BY_ID[selectedObservation] : null;
  const ref = selectedAt ?? obs?.observationCentre ?? null;
  const near = ref ? nearestNamed(ref) : null;
  return (
    <dl className="hz-readout">
      <div>
        <dt>Cursor</dt>
        <dd>{ctx.cursor ? formatCoord(ctx.cursor, 3) : '—'}</dd>
      </div>
      <div>
        <dt>Selected point</dt>
        <dd>{selectedAt ? formatCoord(selectedAt, 3) : '—'}</dd>
      </div>
      <div>
        <dt>Observation location</dt>
        <dd>{obs ? `${obs.id} · ${obs.centreText.latitude}, ${obs.centreText.longitude}` : '—'}</dd>
      </div>
      <div>
        <dt>Nearest named feature</dt>
        <dd>{near ? `${near.name} (${near.km < 10 ? near.km.toFixed(1) : Math.round(near.km)} km)` : '—'}</dd>
      </div>
    </dl>
  );
}
