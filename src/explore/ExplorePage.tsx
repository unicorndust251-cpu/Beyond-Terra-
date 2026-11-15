import { useEffect, useMemo, useRef, useState } from 'react';
import {
  formatLandmarkCoordinates,
  LANDMARKS,
  landmarkById,
  searchLandmarks,
  selectedLandmarkStore,
  useSelectedLandmark,
  type Landmark,
} from '../shared/landmarks';
import LandmarkPanel from './LandmarkPanel';
import { MarsGlobe } from './marsGlobe';
import './explore.css';

interface Props {
  /** The page is on screen (it stays mounted underneath the map, keeping its state). */
  active: boolean;
  onExploreOnMap: (landmark: Landmark) => void;
  onOpenPlanner: () => void;
}

/** Zoom to use when the globe turns to a landmark: closer for small features. */
function focusDistance(l: Landmark): number {
  if (/Crater/.test(l.name)) return 1.7;
  if (/Planitia|Planum|Valles Marineris|Formation|Eridania/.test(l.name)) return 2.6;
  return 2.1;
}

/** The Explore page: catalogue, interactive globe and Scientific Importance panel. */
export default function ExplorePage({ active, onExploreOnMap, onOpenPlanner }: Props) {
  const root = useRef<HTMLDivElement>(null);
  const host = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const markerEls = useRef(new Map<string, HTMLButtonElement>());
  const globe = useRef<MarsGlobe | null>(null);
  const [ready, setReady] = useState(false);
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState(false);
  const [catalogueOpen, setCatalogueOpen] = useState(false);
  const [hovered, setHovered] = useState<string | null>(null);
  const selected = useSelectedLandmark();
  const results = useMemo(() => searchLandmarks(query), [query]);

  useEffect(() => {
    if (!canvas.current || !host.current) return undefined;
    const g = new MarsGlobe(canvas.current, host.current);
    g.onReady = () => setReady(true);
    g.setMarkers(
      LANDMARKS.map((l) => ({ id: l.id, lat: l.latitude, lon: l.longitudeEast360, el: markerEls.current.get(l.id)! })),
    );
    globe.current = g;
    // Coming back to the page: face the landmark that was selected
    const current = landmarkById(selectedLandmarkStore.get());
    if (current) g.flyTo(current.latitude, current.longitudeEast360, focusDistance(current));
    return () => {
      g.dispose();
      globe.current = null;
    };
  }, []);

  useEffect(() => {
    globe.current?.setActive(active);
    // `inert` keeps keyboard focus out of the page while the map is in front
    if (root.current) root.current.inert = !active;
  }, [active]);

  const select = (id: string, fly = true) => {
    const l = landmarkById(id);
    if (!l) return;
    selectedLandmarkStore.set(id);
    if (fly) globe.current?.flyTo(l.latitude, l.longitudeEast360, focusDistance(l));
    setCatalogueOpen(false);
  };

  const onGlobeKey = (e: React.KeyboardEvent) => {
    if (e.target !== e.currentTarget) return;
    if (globe.current?.handleKey(e.key)) e.preventDefault();
  };

  return (
    <div ref={root} className={`ex${selected ? ' has-selection' : ''}${expanded ? ' is-expanded' : ''}`} aria-hidden={!active}>
      <header className="ex-top">
        <span className="ex-top__brand">BEYOND TERRA</span>
        <nav className="ex-top__nav" aria-label="Sections">
          <button type="button" className="is-active" aria-current="page">
            Explore
          </button>
          <button type="button" onClick={onOpenPlanner}>
            Mission Planner
          </button>
        </nav>
      </header>

      <aside className={`ex-cat${catalogueOpen ? ' is-open' : ''}`} aria-label="Landmark catalogue">
        <div className="ex-cat__search">
          <input
            type="search"
            value={query}
            placeholder="Search 46 landmarks"
            aria-label="Search landmarks"
            onChange={(e) => {
              setQuery(e.target.value);
              setCatalogueOpen(true);
            }}
            onFocus={() => setCatalogueOpen(true)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && results[0]) select(results[0].id);
              if (e.key === 'Escape') setCatalogueOpen(false);
            }}
          />
          <button type="button" className="ex-cat__toggle" aria-expanded={catalogueOpen} onClick={() => setCatalogueOpen((o) => !o)}>
            {catalogueOpen ? 'Hide list' : 'All 46'}
          </button>
        </div>
        <p className="ex-cat__count" aria-live="polite">
          {results.length === LANDMARKS.length ? `${LANDMARKS.length} landmarks` : `${results.length} of ${LANDMARKS.length}`}
        </p>
        <ul className="ex-cat__list">
          {results.map((l) => (
            <li key={l.id}>
              <button
                type="button"
                className={selected?.id === l.id ? 'is-selected' : ''}
                aria-current={selected?.id === l.id ? 'true' : undefined}
                onClick={() => select(l.id)}
                onMouseEnter={() => setHovered(l.id)}
                onMouseLeave={() => setHovered(null)}
              >
                <span className="ex-cat__name">{l.name}</span>
                <span className="ex-cat__meta">
                  {l.category.split(' · ')[0]} · {formatLandmarkCoordinates(l)}
                </span>
              </button>
            </li>
          ))}
          {results.length === 0 && <li className="ex-cat__empty">No landmark matches “{query}”.</li>}
        </ul>
      </aside>

      <section className="ex-globe" aria-label="Interactive Mars globe">
        <div
          ref={host}
          className="ex-globe__stage"
          tabIndex={0}
          role="application"
          aria-label="Mars globe. Arrow keys turn it, plus and minus zoom, 0 resets. Tab moves through the visible landmarks."
          onKeyDown={onGlobeKey}
        >
          <canvas ref={canvas} className="ex-globe__canvas" />
          <div className="ex-markers">
            {LANDMARKS.map((l) => (
              <button
                key={l.id}
                ref={(el) => {
                  if (el) markerEls.current.set(l.id, el);
                }}
                type="button"
                className={`ex-marker${selected?.id === l.id ? ' is-selected' : ''}${hovered === l.id ? ' is-hovered' : ''}`}
                aria-label={`${l.name}, ${formatLandmarkCoordinates(l)}`}
                aria-pressed={selected?.id === l.id}
                hidden
                onClick={() => select(l.id)}
                onMouseEnter={() => setHovered(l.id)}
                onMouseLeave={() => setHovered(null)}
              >
                <span className="ex-marker__dot" aria-hidden="true" />
                <span className="ex-marker__label" aria-hidden="true">
                  {l.name}
                </span>
              </button>
            ))}
          </div>
          {!ready && <p className="ex-globe__loading">Loading Mars imagery…</p>}
        </div>
        <div className="ex-controls" role="group" aria-label="Globe view">
          <button type="button" aria-label="Zoom in" onClick={() => globe.current?.zoomBy(0.8)}>
            +
          </button>
          <button type="button" aria-label="Zoom out" onClick={() => globe.current?.zoomBy(1.25)}>
            −
          </button>
          <button type="button" aria-label="Reset view" title="Reset view" onClick={() => globe.current?.resetView()}>
            ⟲
          </button>
        </div>
        <p className="ex-hint">Drag to turn · scroll or pinch to zoom · select an orange marker</p>
      </section>

      {selected && (
        <div className="ex-side">
          <LandmarkPanel
            landmark={selected}
            expanded={expanded}
            onExpand={setExpanded}
            onSelect={(id) => select(id)}
            onClose={() => {
              selectedLandmarkStore.set(null);
              setExpanded(false);
            }}
            onExploreOnMap={onExploreOnMap}
          />
        </div>
      )}
    </div>
  );
}
