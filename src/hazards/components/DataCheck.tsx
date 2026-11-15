import { useMemo, useState } from 'react';
import type { HazardCode } from '../../shared';
import { CATEGORIES, CATEGORY_BY_CODE, DRAWABLE, HAS_EXTENT, categoryName } from '../categories';
import { NEAR_FIELD_KM, associateDunes, type DuneAssociation } from '../dunes';
import type { HazardContext, LoadState } from '../HazardsLayer';
import { OBSERVATIONS } from '../observations';

/**
 * Diagnostic summary: what the data contains, what is drawn, and what is missing. Every
 * number here is computed from the loaded data at run time.
 */
export function DataCheck({ ctx }: { ctx: HazardContext }) {
  const [open, setOpen] = useState(false);

  const coordsOk = OBSERVATIONS.filter(
    (o) =>
      Number.isFinite(o.observationCentre.latitude) &&
      Number.isFinite(o.observationCentre.longitudeEast) &&
      Math.abs(o.observationCentre.latitude) <= 90 &&
      Math.abs(o.observationCentre.longitudeEast) <= 180,
  ).length;

  const dunes = ctx.dunes;
  const assoc = useMemo(() => {
    if (dunes.state !== 'ready') return null;
    const m = new Map<string, DuneAssociation>();
    for (const o of OBSERVATIONS) if (o.categories.includes('S')) m.set(o.id, associateDunes(dunes.data, o.observationCentre));
    return m;
  }, [dunes]);

  // Style and identity checks
  const errors: string[] = [];
  const ids = new Set<string>();
  for (const o of OBSERVATIONS) {
    if (ids.has(o.id)) errors.push(`Duplicate observation ID ${o.id}`);
    ids.add(o.id);
    for (const c of o.categories) if (!CATEGORY_BY_CODE[c]) errors.push(`${o.id}: unknown category “${c}”`);
  }
  for (const c of CATEGORIES) if (!/^#[0-9A-F]{6}$/i.test(c.colour) || !c.pattern) errors.push(`${c.name}: colour or pattern missing`);
  if (ctx.structures.state === 'ready') {
    const seen = new Set<string>();
    for (const f of ctx.structures.data.features) {
      if (seen.has(f.id)) errors.push(`Duplicate USGS line ID ${f.id}`);
      seen.add(f.id);
      if (!CATEGORY_BY_CODE[f.category]) errors.push(`USGS line ${f.id}: unknown category`);
    }
  }
  if (dunes.state === 'ready') {
    const seen = new Set<string>();
    for (const f of dunes.data.features) {
      if (seen.has(f.id)) errors.push(`Duplicate dune field ID ${f.id}`);
      seen.add(f.id);
      if (!f.rings.length || f.rings.some((r) => r.length < 4)) errors.push(`Dune field ${f.id}: invalid outline`);
    }
  }

  const failed = (
    [
      ['USGS fault and pit lines', ctx.structures, ctx.retryStructures],
      ['USGS dune-field outlines', ctx.dunes, ctx.retryDunes],
      ['MOLA elevations (slope)', ctx.slopeStore, ctx.retrySlope],
    ] as [string, LoadState<unknown>, () => void][]
  ).filter(([, s]) => s.state === 'error');

  const byCategory = CATEGORIES.filter((c) => OBSERVATIONS.some((o) => o.categories[0] === c.code)).map((c) => ({
    cat: c,
    n: OBSERVATIONS.filter((o) => o.categories[0] === c.code).length,
  }));

  const nLines = (code: HazardCode) => (ctx.structures.state === 'ready' ? ctx.structures.data.features.filter((f) => f.category === code).length : null);
  const inside = assoc ? [...assoc.entries()].filter(([, a]) => a.kind === 'inside') : [];
  const near = assoc ? [...assoc.entries()].filter(([, a]) => a.kind === 'near') : [];
  const none = assoc ? [...assoc.entries()].filter(([, a]) => a.kind === 'none') : [];
  const noExtentCats = CATEGORIES.filter((c) => !HAS_EXTENT.includes(c.code) && OBSERVATIONS.some((o) => o.categories[0] === c.code));

  return (
    <section className="hz-grp hz-check-sec">
      <button type="button" className="hz-grp__head" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <svg viewBox="0 0 20 20" aria-hidden="true" className="hz-chev">
          <path d="m7 5 5 5-5 5" />
        </svg>
        <span className="hz-grp__title">Map data check</span>
        <span className={`hz-grp__count${failed.length || errors.length ? ' hz-tone--error' : ''}`}>
          {failed.length ? `${failed.length} failed load${failed.length > 1 ? 's' : ''}` : errors.length ? `${errors.length} errors` : 'No load or style errors'}
        </span>
      </button>
      {open && (
        <div className="hz-check-body">
          <h4>NASA observation records</h4>
          <dl className="hz-facts">
            <div>
              <dt>Total records</dt>
              <dd>{OBSERVATIONS.length}</dd>
            </div>
            <div>
              <dt>Valid coordinates</dt>
              <dd>{coordsOk} of {OBSERVATIONS.length}</dd>
            </div>
            <div>
              <dt>Location markers drawn</dt>
              <dd>
                {ctx.rendered.markers} ({ctx.rendered.markersInView} in this view). Hidden categories account for the rest.
              </dd>
            </div>
            <div>
              <dt>With their own boundary</dt>
              <dd>0: no record includes boundary geometry. All {OBSERVATIONS.length} are listed as “boundary not mapped”.</dd>
            </div>
          </dl>
          <p className="hz-sub">Records by category (missing their own geometry)</p>
          <ul className="hz-list hz-list--plain">
            {byCategory.map(({ cat, n }) => (
              <li key={cat.code}>
                {cat.name}: {n}
              </li>
            ))}
          </ul>

          <h4>Sand &amp; Dunes records against USGS dune-field outlines</h4>
          {!assoc ? (
            <p className="hz-muted">{dunes.state === 'error' ? `Not checked: ${dunes.message}` : 'Checking…'}</p>
          ) : (
            <ul className="hz-list hz-list--plain">
              <li>
                Inside a mapped field: {inside.length ? inside.map(([id, a]) => `${id} (${a.field!.duneId})`).join(', ') : 'none'}
              </li>
              <li>
                Within {NEAR_FIELD_KM} km of one: {near.length ? near.map(([id, a]) => `${id} (${a.distanceKm.toFixed(1)} km)`).join(', ') : 'none'}
              </li>
              <li>
                No mapped field within {NEAR_FIELD_KM} km: {none.length ? none.map(([id, a]) => `${id} (${Math.round(a.distanceKm)} km)`).join(', ') : 'none'}
              </li>
            </ul>
          )}

          <h4>Mapped datasets</h4>
          <dl className="hz-facts">
            <div>
              <dt>{categoryName('S')}</dt>
              <dd>{dunes.state === 'ready' ? `${dunes.data.count} USGS outlines loaded; ${ctx.rendered.dunesInView} in this view` : dunes.state === 'error' ? 'Failed to load' : 'Loading…'}</dd>
            </div>
            <div>
              <dt>{categoryName('F')}</dt>
              <dd>{nLines('F') ?? 'Not loaded'} USGS lines</dd>
            </div>
            <div>
              <dt>{categoryName('P')}</dt>
              <dd>{nLines('P') ?? 'Not loaded'} USGS lines</dd>
            </div>
            <div>
              <dt>Lines in this view</dt>
              <dd>{ctx.rendered.linesInView}</dd>
            </div>
            <div>
              <dt>{categoryName('SL')}</dt>
              <dd>{ctx.slopeStore.state === 'ready' ? 'MOLA cells derived per view (from zoom 4)' : ctx.slopeStore.state === 'error' ? 'Failed to load' : 'Loading…'}</dd>
            </div>
          </dl>
          <p className="hz-sub">No boundary data in this project</p>
          <p className="hz-muted">
            {noExtentCats.map((c) => c.name).join(', ')}: their records appear only as location markers. Environmental conditions and mission constraints
            ({CATEGORIES.filter((c) => !DRAWABLE.includes(c.code)).map((c) => c.name).join(', ')}) have no dataset.
          </p>

          <h4>Failed loads</h4>
          {failed.length ? (
            <ul className="hz-list">
              {failed.map(([name, st, retry]) => (
                <li key={name} className="hz-tone--error">
                  {name}: {st.state === 'error' ? st.message : ''}{' '}
                  <button type="button" className="hz-link" onClick={retry}>
                    Retry
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="hz-muted">None.</p>
          )}
          <h4>Category and style errors</h4>
          {errors.length ? (
            <ul className="hz-list">
              {errors.slice(0, 20).map((e) => (
                <li key={e} className="hz-tone--error">
                  {e}
                </li>
              ))}
            </ul>
          ) : (
            <p className="hz-muted">None: every record and feature resolves to a category with a colour and pattern; no duplicate IDs.</p>
          )}
        </div>
      )}
    </section>
  );
}
