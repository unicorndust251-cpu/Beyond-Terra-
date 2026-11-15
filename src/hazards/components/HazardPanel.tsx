import { useEffect, useId, useMemo, useState } from 'react';
import { MARS_LOCATIONS, locationCoordinate } from '../../science/locations';
import { greatCircleDistanceM, patchHazardState, useHazardState, type HazardCode, type MarsCoordinate } from '../../shared';
import { CATEGORIES, DRAWABLE, MAPPING_LABEL, type HazardCategory } from '../categories';
import { formatCoord, looksLikeCoordinate, parseCoordinateText } from '../coordinateInput';
import type { HazardContext } from '../HazardsLayer';
import { OBSERVATIONS, OBSERVATION_BY_ID, searchObservations } from '../observations';
import { swatchUrl } from '../patterns';
import { SLOPE_MIN_ZOOM } from '../slopeCells';

type Tab = 'key' | 'catalogue';

export default function HazardPanel({ ctx }: { ctx: HazardContext; zoomTooLowForSlope: boolean }) {
  const hz = useHazardState();
  const [tab, setTab] = useState<Tab>('key');
  const [collapsed, setCollapsed] = useState(false);
  const [zoom, setZoom] = useState(() => ctx.map.getZoom());
  useEffect(() => {
    const update = () => setZoom(ctx.map.getZoom());
    ctx.map.on('zoomend', update);
    return () => {
      ctx.map.off('zoomend', update);
    };
  }, [ctx.map]);

  return (
    <aside className={`hz-panel${collapsed ? ' is-collapsed' : ''}`} aria-label="Hazards">
      <header className="hz-panel__head">
        <div>
          <p className="hz-eyebrow">
            Beyond Terra <span aria-hidden="true">/</span> Hazards
          </p>
          <h2 className="hz-panel__title">Hazard map</h2>
        </div>
        <button
          type="button"
          className="hz-icon-btn"
          aria-expanded={!collapsed}
          aria-label={collapsed ? 'Expand hazard panel' : 'Collapse hazard panel'}
          onClick={() => setCollapsed((c) => !c)}
        >
          <svg viewBox="0 0 20 20" aria-hidden="true">
            <path d={collapsed ? 'm8 5 5 5-5 5' : 'm12 5-5 5 5 5'} />
          </svg>
        </button>
      </header>

      {!collapsed && (
        <>
          <Search ctx={ctx} />
          <div className="hz-tabs" role="tablist" aria-label="Hazard panel sections">
            {(
              [
                ['key', 'Key & layers'],
                ['catalogue', `Observations (${OBSERVATIONS.length})`],
              ] as const
            ).map(([id, label]) => (
              <button key={id} type="button" role="tab" aria-selected={tab === id} className={tab === id ? 'is-active' : ''} onClick={() => setTab(id)}>
                {label}
              </button>
            ))}
          </div>
          <div className="hz-panel__body">
            {tab === 'key' ? <Key ctx={ctx} zoom={zoom} /> : <Catalogue ctx={ctx} />}
          </div>
          <Readout ctx={ctx} selectedObservation={hz.selection?.kind === 'observation' ? hz.selection.id : null} />
        </>
      )}
    </aside>
  );
}

/* ------------------------------------------------------------------ search */

function Search({ ctx }: { ctx: HazardContext }) {
  const [q, setQ] = useState('');
  const id = useId();
  const coordinate = looksLikeCoordinate(q) ? parseCoordinateText(q) : null;
  const hits = useMemo(() => (q.trim() && !coordinate ? searchObservations(q).slice(0, 8) : []), [q, coordinate]);

  return (
    <div className="hz-search">
      <label htmlFor={id} className="hz-label">
        Search observations or enter coordinates
      </label>
      <input
        id={id}
        type="text"
        value={q}
        placeholder="H001, Ganges, or 8.6 S, 315.7 E"
        autoComplete="off"
        spellCheck={false}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => {
          if (e.key !== 'Enter') return;
          if (coordinate?.ok) ctx.inspectPoint(coordinate.coordinate, { centre: true });
          else if (hits[0]) ctx.focusObservation(hits[0].id);
        }}
      />
      {coordinate && !coordinate.ok && (
        <p className="hz-error" role="alert">
          {coordinate.error}
        </p>
      )}
      {coordinate?.ok && (
        <button type="button" className="hz-result" onClick={() => ctx.inspectPoint(coordinate.coordinate, { centre: true })}>
          <span className="hz-result__title">Inspect {formatCoord(coordinate.coordinate, Math.max(coordinate.latDecimals, coordinate.lonDecimals))}</span>
          <span className="hz-result__meta">Typed coordinate · {coordinate.east360.toFixed(Math.max(coordinate.lonDecimals, 0))}° E (0–360)</span>
        </button>
      )}
      {hits.length > 0 && (
        <ul className="hz-results" aria-label="Matching observations">
          {hits.map((o) => (
            <li key={o.id}>
              <button type="button" className="hz-result" onClick={() => ctx.focusObservation(o.id)}>
                <span className="hz-result__title">
                  <span className="hz-id">{o.id}</span> {o.name}
                </span>
                <span className="hz-result__meta">
                  {o.observedFeature} · {o.centreText.latitude}, {o.centreText.longitude}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {q.trim() && !coordinate && hits.length === 0 && <p className="hz-muted">No observation matches “{q.trim()}”.</p>}
    </div>
  );
}

/* --------------------------------------------------------------------- key */

function Key({ ctx, zoom }: { ctx: HazardContext; zoom: number }) {
  const hz = useHazardState();
  const [open, setOpen] = useState<HazardCode | null>(null);
  const toggle = (code: HazardCode) =>
    patchHazardState({ active: hz.active.includes(code) ? hz.active.filter((c) => c !== code) : [...hz.active, code] });

  const status = (cat: HazardCategory): { text: string; tone: 'ok' | 'warn' | 'error' | 'muted'; retry?: () => void } => {
    if (cat.code === 'F' || cat.code === 'P') {
      if (ctx.structures.state === 'loading') return { text: 'Loading USGS lines…', tone: 'muted' };
      if (ctx.structures.state === 'error') return { text: `Could not load: ${ctx.structures.message}`, tone: 'error', retry: ctx.retryStructures };
      const n = ctx.structures.data.features.filter((f) => f.category === cat.code).length;
      return { text: `${n} mapped lines`, tone: 'ok' };
    }
    if (cat.code === 'SL') {
      if (ctx.slopeStore.state === 'loading') return { text: 'Loading MOLA elevations…', tone: 'muted' };
      if (ctx.slopeStore.state === 'error') return { text: `Could not load: ${ctx.slopeStore.message}`, tone: 'error', retry: ctx.retrySlope };
      if (zoom < SLOPE_MIN_ZOOM) return { text: `Zoom in to level ${SLOPE_MIN_ZOOM} to see cells`, tone: 'warn' };
      return { text: 'Cells drawn in view', tone: 'ok' };
    }
    return { text: MAPPING_LABEL[cat.mapping], tone: 'muted' };
  };

  return (
    <div className="hz-key">
      <div className="hz-settings">
        <label className="hz-setting">
          <span>
            Fill opacity <output>{Math.round(hz.fillOpacity * 100)}%</output>
          </span>
          <input
            type="range"
            min={0}
            max={0.6}
            step={0.05}
            value={hz.fillOpacity}
            onChange={(e) => patchHazardState({ fillOpacity: Number(e.target.value) })}
          />
        </label>
        <label className="hz-setting">
          <span>
            SL threshold <output>{hz.slopeThresholdDeg}°</output>
          </span>
          <input
            type="range"
            min={2}
            max={30}
            step={1}
            value={hz.slopeThresholdDeg}
            onChange={(e) => patchHazardState({ slopeThresholdDeg: Number(e.target.value) })}
          />
        </label>
        <p className="hz-note">
          Display settings and an editable planning assumption: the threshold is applied to MOLA slopes over a 3.7 km baseline. It is not an
          astronaut limit, and ground below it is not “safe”.
        </p>
      </div>

      <ul className="hz-cats" aria-label="Hazard categories">
        {CATEGORIES.map((cat) => {
          const drawable = DRAWABLE.includes(cat.code);
          const on = hz.active.includes(cat.code);
          const st = status(cat);
          const expanded = open === cat.code;
          return (
            <li key={cat.code} className={`hz-cat${drawable ? '' : ' is-catalogue'}`}>
              <div className="hz-cat__row">
                <img className="hz-swatch" src={swatchUrl(cat.code)} alt="" width={28} height={28} />
                <button type="button" className="hz-cat__name" aria-expanded={expanded} onClick={() => setOpen(expanded ? null : cat.code)}>
                  <span className="hz-code">{cat.code}</span>
                  <span>{cat.name}</span>
                </button>
                {drawable ? (
                  <label className="hz-switch" title={on ? 'Hide on map (display only)' : 'Show on map'}>
                    <input type="checkbox" checked={on} onChange={() => toggle(cat.code)} aria-label={`Show ${cat.name}`} />
                    <span aria-hidden="true" />
                  </label>
                ) : (
                  <span className="hz-badge" title={cat.mappingNote}>
                    {MAPPING_LABEL[cat.mapping]}
                  </span>
                )}
              </div>
              {drawable && (
                <p className={`hz-cat__status hz-tone--${st.tone}`}>
                  {st.text}
                  {st.retry && (
                    <button type="button" className="hz-link" onClick={st.retry}>
                      Retry
                    </button>
                  )}
                </p>
              )}
              {expanded && (
                <div className="hz-cat__more">
                  <p>
                    <strong>Pattern:</strong> {cat.patternLabel} · <span className="hz-hex">{cat.colour}</span>
                  </p>
                  <p>{cat.description}</p>
                  <p>
                    <strong>On this map:</strong> {cat.mappingNote}
                  </p>
                  <p className="hz-muted">Colour and pattern identify the category only: they are not a severity or confidence score.</p>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <p className="hz-note">
        Codes, colours and patterns are this project’s design choices, not NASA-issued symbology. Green marks a category, never safety.
      </p>
    </div>
  );
}

/* --------------------------------------------------------------- catalogue */

function Catalogue({ ctx }: { ctx: HazardContext }) {
  const hz = useHazardState();
  const selected = hz.selection?.kind === 'observation' ? hz.selection.id : null;
  const groups = CATEGORIES.filter((c) => OBSERVATIONS.some((o) => o.categories[0] === c.code));
  return (
    <div className="hz-catalogue">
      <p className="hz-note">
        NASA image and observation centres. They are not hazard boundaries or current alerts; choosing one centres the map on it.
      </p>
      {groups.map((cat) => (
        <section key={cat.code} className="hz-group">
          <h3 className="hz-group__title">
            <img className="hz-swatch hz-swatch--sm" src={swatchUrl(cat.code)} alt="" width={16} height={16} />
            {cat.code} · {cat.name}
          </h3>
          <ul>
            {OBSERVATIONS.filter((o) => o.categories[0] === cat.code).map((o) => (
              <li key={o.id}>
                <button
                  type="button"
                  className={`hz-obs${selected === o.id ? ' is-selected' : ''}`}
                  aria-current={selected === o.id ? 'true' : undefined}
                  onClick={() => ctx.focusObservation(o.id)}
                >
                  <span className="hz-id">{o.id}</span>
                  <span className="hz-obs__name">
                    {o.name}
                    {o.sourceIssues.length > 0 && <span className="hz-flag"> · source issue</span>}
                  </span>
                  <span className="hz-obs__meta">
                    {o.categories.join(' + ')} · {o.centreText.latitude}, {o.centreText.longitude}
                  </span>
                </button>
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

/** Cursor, selected point, observation centre and nearest named feature: four separate things. */
function Readout({ ctx, selectedObservation }: { ctx: HazardContext; selectedObservation: string | null }) {
  const hz = useHazardState();
  const selectedAt = hz.selection && hz.selection.kind !== 'observation' ? hz.selection.at : null;
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
        <dt>Observation centre</dt>
        <dd>{obs ? `${obs.id} · ${obs.centreText.latitude}, ${obs.centreText.longitude}` : '—'}</dd>
      </div>
      <div>
        <dt>Nearest named feature</dt>
        <dd>{near ? `${near.name} (${near.km < 10 ? near.km.toFixed(1) : Math.round(near.km)} km; reference only)` : '—'}</dd>
      </div>
    </dl>
  );
}
