import { useEffect, useMemo, useRef, useState } from 'react';
import * as L from 'leaflet';
import { useMarsMap } from '../../map/MarsMapContext';
import { toMapLatLng, useMapBridge } from '../../shared';
import { CURVATURE_SITES, formatSite, searchSites, siteCoordinate, type CurvatureSite } from './curvatureSites';
import './curvature.css';

/** Zoom that frames each site's landforms when it is viewed. */
const VIEW_ZOOM: Record<string, number> = {
  jezero: 9,
  gale: 7.5,
  'aeolis-mons': 8,
  'olympus-mons': 6,
  'elysium-mons': 6.5,
  'valles-marineris': 4.5,
  'coprates-observation': 9,
  'hebes-chasma': 6.5,
  korolev: 7.5,
  moreux: 7,
};

/**
 * The CURVATURE layer: burgundy markers at the curvature investigation sites, a legend,
 * a searchable list and a details card. Markers are reference anchors, not measurements.
 * Mounted only while the layer is on; unmounting removes everything it added.
 */
export default function CurvatureLayer() {
  const { map } = useMarsMap();
  const bridge = useMapBridge();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const markers = useRef(new Map<string, L.Marker>());
  const matches = useMemo(() => searchSites(query), [query]);
  const selected = CURVATURE_SITES.find((s) => s.id === selectedId) ?? null;

  // Markers, in their own pane above the scientific layers; created once, never re-rendered
  useEffect(() => {
    const pane = map.getPane('btCurvature') ?? map.createPane('btCurvature');
    pane.style.zIndex = '620';
    const near = map.getCenter().lng;
    for (const site of CURVATURE_SITES) {
      const m = L.marker(toMapLatLng(siteCoordinate(site), near), {
        pane: 'btCurvature',
        icon: L.divIcon({ className: 'bt-curv-marker', html: '<span></span>', iconSize: [16, 16], iconAnchor: [8, 8] }),
        title: `${site.name}: curvature investigation site`,
        alt: site.name,
        keyboard: true,
        riseOnHover: true,
        // A marker click selects the site; it is not also a click on the terrain
        bubblingMouseEvents: false,
      });
      m.on('click', () => setSelectedId(site.id));
      m.addTo(map);
      markers.current.set(site.id, m);
    }
    const all = markers.current;
    // Keep each marker in the copy of the planet being viewed, so panning past ±180° or
    // flying the short way round never leaves it a world away
    const reanchor = () => {
      const lng = map.getCenter().lng;
      for (const site of CURVATURE_SITES) all.get(site.id)?.setLatLng(toMapLatLng(siteCoordinate(site), lng));
    };
    map.on('moveend', reanchor);
    return () => {
      map.off('moveend', reanchor);
      all.forEach((m) => m.remove());
      all.clear();
    };
  }, [map]);

  // Bring a newly selected site's card into view inside the scrolling panel stack
  const cardRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (selectedId) cardRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [selectedId]);

  // Selected state on the marker itself
  useEffect(() => {
    markers.current.forEach((m, id) => {
      const el = m.getElement();
      el?.classList.toggle('is-selected', id === selectedId);
      if (id === selectedId) m.setZIndexOffset(1000);
      else m.setZIndexOffset(0);
    });
  }, [selectedId]);

  const view = (site: CurvatureSite) => {
    setSelectedId(site.id);
    const zoom = VIEW_ZOOM[site.id] ?? 7;
    // The flight takes the short way round; put the marker in that copy before it lands
    const target = toMapLatLng(siteCoordinate(site), map.getCenter().lng);
    markers.current.get(site.id)?.setLatLng(target);
    if (bridge) bridge.flyTo(siteCoordinate(site), { zoom });
    else map.setView(target, zoom);
  };

  return (
    <section className="bt-curv" aria-label="Curvature investigation sites">
      <header className="bt-curv__head">
        <span className="bt-curv__dot" aria-hidden="true" />
        <h2>Curvature Investigation Sites</h2>
      </header>
      <p className="bt-curv__legend">
        <span className="bt-curv__dot bt-curv__dot--legend" aria-hidden="true" /> Candidate curvature investigation site
      </p>
      <p className="bt-curv__note">
        Locations highlight landforms suitable for curvature investigation. Markers do not represent measured terrain curvature.
      </p>

      {!selected && (
        <>
          <label className="bt-curv__search">
            <span className="bt-sr">Search curvature sites</span>
            <input type="search" placeholder="Search sites" value={query} onChange={(e) => setQuery(e.target.value)} autoComplete="off" />
          </label>
          <ul className="bt-curv__list">
            {matches.map((s) => (
              <li key={s.id}>
                <button type="button" onClick={() => setSelectedId(s.id)}>
                  <span className="bt-curv__name">{s.name}</span>
                  <span className="bt-curv__coord">
                    {formatSite(s)}
                    {s.approximate && <em> · approx.</em>}
                  </span>
                </button>
              </li>
            ))}
            {matches.length === 0 && <li className="bt-curv__empty">No site matches “{query}”.</li>}
          </ul>
        </>
      )}

      {/* The card takes the list's place, keeping the panel compact */}
      {selected && (
        <article ref={cardRef} className="bt-curv__card" aria-label={`${selected.name} details`}>
          <div className="bt-curv__card-head">
            <button type="button" className="bt-curv__back" onClick={() => setSelectedId(null)}>
              ← All sites
            </button>
          </div>
          <h3>{selected.name}</h3>
          <dl>
            <dt>Coordinates</dt>
            <dd>
              {formatSite(selected)}
              {selected.approximate && <span className="bt-curv__approx">Approximate reference position</span>}
              <span className="bt-curv__sub">{selected.reference}</span>
            </dd>
            <dt>Landform</dt>
            <dd>{selected.landform}</dd>
            <dt>Investigation focus</dt>
            <dd>{selected.shapes}</dd>
            <dt>Context</dt>
            <dd>{selected.context}</dd>
            {selected.published && (
              <>
                <dt>Published figures</dt>
                <dd>
                  {selected.published.text}
                  <a className="bt-curv__sub" href={selected.published.url} target="_blank" rel="noreferrer">
                    {selected.published.source}
                  </a>
                </dd>
              </>
            )}
            <dt>Terrain data</dt>
            <dd>{selected.terrainData}</dd>
            <dt>Imagery</dt>
            <dd>{selected.imagery}</dd>
            <dt>Source</dt>
            <dd>
              <a href={selected.source.url} target="_blank" rel="noreferrer">
                {selected.source.name}
              </a>
            </dd>
            <dt>Analysis status</dt>
            <dd className="bt-curv__status">{selected.status}</dd>
          </dl>
          <button type="button" className="bt-curv__view" onClick={() => view(selected)}>
            View location
          </button>
        </article>
      )}
    </section>
  );
}
