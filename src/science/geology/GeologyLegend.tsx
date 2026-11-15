import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useMarsMap } from '../../map/MarsMapContext';
import { useSelectedLocation, type MarsCoordinate } from '../../shared';
import { formatLatitude, formatLongitude, useDisplaySettings } from '../workspace/uiState';
import { GeologyHighlightLayer, identifyUnit, type Identification } from './geologyGrid';
import { GEOLOGY_GROUPS, GEOLOGY_SOURCE, GEOLOGY_UNITS, UNIT_BY_CODE, ageAssignment, searchUnits, type GeologyGroup, type GeologyUnit } from './geologyUnits';
import './geology.css';

type PointState = { coordinate: MarsCoordinate } & ({ status: 'loading' } | Identification);

const narrow = () => typeof window !== 'undefined' && !!window.matchMedia?.('(max-width: 760px)').matches;

/**
 * The geology layer's key: a compact panel (title, the unit under the selected point, and
 * the full legend button) and a full legend drawer (search, grouped units, the selected
 * point's unit, code guide and source). Units at a point come from the mapped polygons
 * (see geologyGrid), never from screen colour. Rendered only while the layer is on.
 */
export default function GeologyLegend() {
  const { map } = useMarsMap();
  const selected = useSelectedLocation();
  const [collapsed, setCollapsed] = useState(narrow);
  const [drawer, setDrawer] = useState(false);
  const [point, setPoint] = useState<PointState | null>(null);
  const [highlight, setHighlight] = useState<string | null>(null);
  const openButton = useRef<HTMLButtonElement>(null);

  // Identify the unit at each newly selected point
  useEffect(() => {
    if (!selected) return undefined;
    let live = true;
    const coordinate = selected.coordinate;
    setPoint({ coordinate, status: 'loading' });
    identifyUnit(coordinate).then((r) => live && setPoint({ coordinate, ...r }));
    return () => {
      live = false;
    };
  }, [selected]);

  // One unit's occurrences, dimming the rest; never touches routes or the selection
  useEffect(() => {
    if (!highlight) return undefined;
    const layer = new GeologyHighlightLayer(highlight).addTo(map);
    return () => {
      layer.remove();
    };
  }, [map, highlight]);

  // On small screens the full legend is a bottom sheet; the map's controls step aside
  useEffect(() => {
    if (!drawer) return undefined;
    const root = map.getContainer().closest('.bt-map');
    root?.classList.add('bt-geo-sheet-open');
    return () => root?.classList.remove('bt-geo-sheet-open');
  }, [map, drawer]);

  const pointUnit = point?.status === 'unit' ? UNIT_BY_CODE.get(point.code) : undefined;

  const closeDrawer = () => {
    setDrawer(false);
    openButton.current?.focus();
  };

  return (
    <>
      <section className={`bt-geo${collapsed ? ' is-collapsed' : ''}`} aria-label="Geology legend">
        <header className="bt-geo__head">
          <h2>Geology — USGS SIM 3292</h2>
          <button
            type="button"
            className="bt-geo__icon-btn"
            aria-expanded={!collapsed}
            aria-label={collapsed ? 'Expand geology legend' : 'Collapse geology legend'}
            title={collapsed ? 'Expand' : 'Collapse'}
            onClick={() => setCollapsed((c) => !c)}
          >
            <svg viewBox="0 0 20 20" aria-hidden="true">
              <path d={collapsed ? 'm6 12 4-4 4 4' : 'm6 8 4 4 4-4'} />
            </svg>
          </button>
        </header>

        {!collapsed && (
          <>
            <p className="bt-geo__sub">Geological units · 2014 map</p>
            <p className="bt-geo__text">Colours identify mapped geological units and age assignments.</p>
          </>
        )}

        {point && <PointSummary point={point} unit={pointUnit} compact={collapsed} />}

        <button ref={openButton} type="button" className="bt-geo__btn" aria-haspopup="dialog" aria-expanded={drawer} onClick={() => setDrawer(true)}>
          Open Full Legend
        </button>
        {!collapsed && <p className="bt-geo__fine">{GEOLOGY_SOURCE.colours}</p>}
      </section>

      {drawer && (
        <FullLegend
          point={point}
          pointUnit={pointUnit}
          highlight={highlight}
          onHighlight={setHighlight}
          onClose={closeDrawer}
        />
      )}
    </>
  );
}

/* ---------------------------------------------------------------- compact */

function PointSummary({ point, unit, compact }: { point: PointState; unit?: GeologyUnit; compact: boolean }) {
  return (
    <div className="bt-geo__point" aria-live="polite">
      {!compact && <p className="bt-geo__label">Selected point</p>}
      {point.status === 'loading' && <p className="bt-geo__state">Loading geological information…</p>}
      {point.status === 'not-mapped' && <p className="bt-geo__state">No mapped unit at this point.</p>}
      {point.status === 'error' && <p className="bt-geo__state">Geological dataset unavailable.</p>}
      {point.status === 'unit' && (
        <p className="bt-geo__unit">
          <Swatch colour={unit?.colour} />
          <code>{point.code}</code>
          <span>{unit?.name ?? 'Unit not in legend'}</span>
        </p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------ full legend */

function FullLegend({
  point,
  pointUnit,
  highlight,
  onHighlight,
  onClose,
}: {
  point: PointState | null;
  pointUnit?: GeologyUnit;
  highlight: string | null;
  onHighlight(code: string | null): void;
  onClose(): void;
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<Set<GeologyGroup>>(() => new Set(pointUnit ? [pointUnit.group] : []));
  const [active, setActive] = useState<string | null>(pointUnit?.code ?? null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const matches = useMemo(() => searchUnits(query), [query]);
  const searching = query.trim().length > 0;

  useEffect(() => closeRef.current?.focus(), []);

  // A unit picked on the map while the legend is open: open its group, select it and bring
  // it into view. On opening, the selected point's details at the top stay in view.
  const opened = useRef(true);
  const [scrollTo, setScrollTo] = useState<string | null>(null);
  useEffect(() => {
    if (opened.current) {
      opened.current = false;
      return;
    }
    if (!pointUnit) return;
    setOpen((s) => new Set(s).add(pointUnit.group));
    setActive(pointUnit.code);
    setScrollTo(pointUnit.code);
  }, [pointUnit]);

  useEffect(() => {
    if (!scrollTo) return;
    const el = listRef.current?.querySelector<HTMLElement>(`[data-code="${CSS.escape(scrollTo)}"]`);
    el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    setScrollTo(null);
  }, [scrollTo, open]);

  const toggleGroup = (g: GeologyGroup) =>
    setOpen((s) => {
      const next = new Set(s);
      if (next.has(g)) next.delete(g);
      else next.add(g);
      return next;
    });

  return (
    <aside
      className="bt-geo-drawer"
      role="dialog"
      aria-modal="false"
      aria-labelledby="bt-geo-drawer-title"
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          // Close only the legend, not other panels listening for Escape
          e.stopPropagation();
          onClose();
        }
      }}
    >
      <header className="bt-geo-drawer__head">
        <div>
          <h2 id="bt-geo-drawer-title">Geology — USGS SIM 3292</h2>
          <p>Geological units · 2014 map · {GEOLOGY_UNITS.length} units</p>
        </div>
        <button ref={closeRef} type="button" className="bt-geo__icon-btn bt-geo__icon-btn--lg" onClick={onClose} aria-label="Close full legend" title="Close">
          <svg viewBox="0 0 20 20" aria-hidden="true">
            <path d="m6 6 8 8M14 6l-8 8" />
          </svg>
        </button>
      </header>

      <div className="bt-geo-drawer__body" ref={listRef}>
        {point && <PointDetails point={point} unit={pointUnit} highlight={highlight} onHighlight={onHighlight} />}

        <section className="bt-geo-drawer__section">
          <h3>All units</h3>
          <label className="bt-geo__search">
            <span className="bt-sr">Search by code or unit name</span>
            <svg viewBox="0 0 20 20" aria-hidden="true">
              <circle cx="9" cy="9" r="5.5" />
              <path d="m13 13 4 4" />
            </svg>
            <input type="search" placeholder="Search by code or name" value={query} onChange={(e) => setQuery(e.target.value)} autoComplete="off" spellCheck={false} />
          </label>

          {searching ? (
            matches.length ? (
              <ul className="bt-geo__list" aria-label="Search results">
                {matches.map((x) => (
                  <Entry key={x.code} unit={x} active={active === x.code} onSelect={setActive} highlight={highlight} onHighlight={onHighlight} showGroup />
                ))}
              </ul>
            ) : (
              <p className="bt-geo__state">No unit matches “{query}”.</p>
            )
          ) : (
            GEOLOGY_GROUPS.map(({ group, note }) => {
              const units = GEOLOGY_UNITS.filter((x) => x.group === group);
              const expanded = open.has(group);
              return (
                <div key={group} className="bt-geo__group">
                  <button type="button" className="bt-geo__group-btn" aria-expanded={expanded} onClick={() => toggleGroup(group)}>
                    <span className="bt-geo__strip" aria-hidden="true">
                      {units.slice(0, 6).map((x) => (
                        <span key={x.code} style={{ background: x.colour }} />
                      ))}
                    </span>
                    <span className="bt-geo__group-name">{group} units</span>
                    <span className="bt-geo__count">{units.length}</span>
                    <svg viewBox="0 0 20 20" aria-hidden="true">
                      <path d="m6 8 4 4 4-4" />
                    </svg>
                  </button>
                  {expanded && (
                    <>
                      {note && <p className="bt-geo__group-note">{note}</p>}
                      <ul className="bt-geo__list">
                        {units.map((x) => (
                          <Entry key={x.code} unit={x} active={active === x.code} onSelect={setActive} highlight={highlight} onHighlight={onHighlight} />
                        ))}
                      </ul>
                    </>
                  )}
                </div>
              );
            })
          )}
        </section>

        <section className="bt-geo-drawer__section">
          <h3>Reading the codes</h3>
          <dl className="bt-geo__codes">
            <dt>A · H · N</dt>
            <dd>Amazonian, Hesperian, Noachian: the three main periods, youngest to oldest.</dd>
            <dt>e · m · l</dt>
            <dd>Early, Middle, Late.</dd>
            <dt>AH, HN …</dt>
            <dd>Combined capitals: a unit assigned across more than one period.</dd>
          </dl>
          <p className="bt-geo__text">
            Codes are case-sensitive. A lowercase <code>l</code> means Late; it is not the number 1 or a capital I. These are geological age
            assignments for each mapped unit, not exact dates for every point.
          </p>
        </section>

        <section className="bt-geo-drawer__section">
          <h3>Source</h3>
          <p className="bt-geo__text">
            <a href={GEOLOGY_SOURCE.url} target="_blank" rel="noreferrer">
              {GEOLOGY_SOURCE.citation}
            </a>
          </p>
          <p className="bt-geo__text">{GEOLOGY_SOURCE.meaning}</p>
          <p className="bt-geo__text">{GEOLOGY_SOURCE.limitation}</p>
          <p className="bt-geo__text">
            Point identification and highlighting use the map’s unit polygons, rasterised to a 32 px/degree grid (about 1.85 km), so highlighted
            edges are stepped and approximate.
          </p>
          <p className="bt-geo__text">
            {GEOLOGY_SOURCE.colours} Map tiles: NASA Mars Trek rendering of SIM 3292. Three swatches (eHv, lHv, eHt) use the colour shown on the
            map tiles, which differs from the PDF sample.
          </p>
        </section>
      </div>
    </aside>
  );
}

function PointDetails({
  point,
  unit,
  highlight,
  onHighlight,
}: {
  point: PointState;
  unit?: GeologyUnit;
  highlight: string | null;
  onHighlight(code: string | null): void;
}) {
  const s = useDisplaySettings();
  const coords = `${formatLatitude(point.coordinate.latitude, 4)}, ${formatLongitude(point.coordinate.longitudeEast, s.longitude, 4)}`;
  return (
    <section className="bt-geo-drawer__section bt-geo-drawer__section--point" aria-live="polite">
      <h3>Geological unit</h3>
      <p className="bt-geo__coords">Selected point · {coords}</p>

      {point.status === 'loading' && <p className="bt-geo__state">Loading geological information…</p>}
      {point.status === 'error' && (
        <p className="bt-geo__state">
          Geological dataset unavailable, so this point cannot be identified. The legend below still works. ({point.message})
        </p>
      )}
      {point.status === 'not-mapped' && <p className="bt-geo__state">No mapped unit at this point: no unit polygon of SIM 3292 covers it.</p>}

      {point.status === 'unit' && (
        <>
          <div className="bt-geo__hero">
            <Swatch colour={unit?.colour} large />
            <div>
              <code className="bt-geo__code">{point.code}</code>
              <p className="bt-geo__name">{unit?.name ?? 'This code is not in the legend dataset.'}</p>
            </div>
          </div>
          {unit && (
            <dl className="bt-geo__facts">
              <Fact label="Group">{unit.group} units</Fact>
              <Fact label="Age assignment">{ageAssignment(unit.code)}</Fact>
              <Fact label="Mapped unit description">{unit.description}</Fact>
            </dl>
          )}
          {unit && (
            <button type="button" className="bt-geo__btn bt-geo__btn--quiet" aria-pressed={highlight === unit.code} onClick={() => onHighlight(highlight === unit.code ? null : unit.code)}>
              {highlight === unit.code ? 'Clear highlight' : 'Highlight this unit on the map'}
            </button>
          )}
        </>
      )}

      {point.status !== 'loading' && point.status !== 'error' && point.adjacent.length > 0 && (
        <div className="bt-geo__contact">
          <p>
            <strong>Near a mapped contact.</strong> Contacts on this 1:20,000,000 map are uncertain by kilometres, and within about 2 km the map
            also shows:
          </p>
          <ul>
            {point.adjacent.map((code) => (
              <li key={code}>
                <Swatch colour={UNIT_BY_CODE.get(code)?.colour} />
                <code>{code}</code> {UNIT_BY_CODE.get(code)?.name}
              </li>
            ))}
          </ul>
        </div>
      )}

      <dl className="bt-geo__facts">
        <Fact label="Measurements at the selected point">
          Elevation and slope are in the location card, measured from elevation data. Nothing here is derived from the geological unit: it
          gives no elevation, slope, curvature, mineral abundance, ice depth or safety rating.
        </Fact>
        <Fact label="Source">
          <a href={GEOLOGY_SOURCE.url} target="_blank" rel="noreferrer">
            {GEOLOGY_SOURCE.citation}
          </a>
          <span className="bt-geo__muted">{GEOLOGY_SOURCE.version}</span>
        </Fact>
        <Fact label="Scale">{GEOLOGY_SOURCE.limitation}</Fact>
      </dl>
    </section>
  );
}

function Entry({
  unit,
  active,
  onSelect,
  highlight,
  onHighlight,
  showGroup,
}: {
  unit: GeologyUnit;
  active: boolean;
  onSelect(code: string | null): void;
  highlight: string | null;
  onHighlight(code: string | null): void;
  showGroup?: boolean;
}) {
  return (
    <li className={`bt-geo__entry${active ? ' is-active' : ''}`} data-code={unit.code}>
      <button type="button" className="bt-geo__entry-btn" aria-expanded={active} onClick={() => onSelect(active ? null : unit.code)}>
        <Swatch colour={unit.colour} />
        <code>{unit.code}</code>
        <span>
          {unit.name}
          {showGroup && <span className="bt-geo__muted"> · {unit.group}</span>}
        </span>
      </button>
      {active && (
        <div className="bt-geo__entry-body">
          <p>{unit.description}</p>
          <p className="bt-geo__muted">
            Age assignment: {ageAssignment(unit.code)} · {unit.colour}
          </p>
          {unit.note && <p className="bt-geo__muted">{unit.note}</p>}
          <button type="button" className="bt-geo__btn bt-geo__btn--quiet" aria-pressed={highlight === unit.code} onClick={() => onHighlight(highlight === unit.code ? null : unit.code)}>
            {highlight === unit.code ? 'Clear highlight' : 'Highlight occurrences on the map'}
          </button>
        </div>
      )}
    </li>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function Swatch({ colour, large }: { colour?: string; large?: boolean }) {
  return <span className={`bt-geo__swatch${large ? ' bt-geo__swatch--lg' : ''}${colour ? '' : ' is-missing'}`} style={colour ? { background: colour } : undefined} aria-hidden="true" />;
}
