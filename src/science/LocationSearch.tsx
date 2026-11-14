import { useEffect, useId, useMemo, useRef, useState } from 'react';
import * as L from 'leaflet';
import { useMarsMap } from '../map/MarsMapContext';
import { greatCircleDistanceM, makeCoordinate, selectedLocationStore, toMapLatLng, useMapBridge, type MarsCoordinate } from '../shared';
import { parseCoordinate } from '../scientific-data/coordinateInput';
import { ROVER_SITES } from './rovers';

/** One search result. */
interface Hit {
  key: string;
  name: string;
  /** Short kind shown on the right: "Crater", "Rover site", "Coordinates" */
  kind: string;
  detail?: string;
  coordinate: MarsCoordinate;
  /** Feature size, km, used to frame it */
  sizeKm?: number;
}

type Place = [name: string, type: string, lat: number, lon: number, diameterKm: number, featureId: number];

/** The IAU place-name index, fetched the first time search is used. */
let placesPromise: Promise<Place[]> | null = null;
function loadPlaces(): Promise<Place[]> {
  if (!placesPromise) {
    placesPromise = fetch(`${import.meta.env.BASE_URL}data/places/mars-places.json`)
      .then((r) => {
        if (!r.ok) throw new Error(`places: HTTP ${r.status}`);
        return r.json() as Promise<{ places: Place[] }>;
      })
      .then((j) => j.places);
    placesPromise.catch(() => (placesPromise = null));
  }
  return placesPromise;
}

const fold = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();

/** "18.44, 77.45", "18.44 N 77.45 E", "-5.4 137.8", "4.6S 137.4E" → a coordinate. */
function parseTyped(q: string): MarsCoordinate | null {
  const m = q.trim().match(/^([+\-−]?\d+(?:\.\d+)?\s*°?\s*[NS]?)[\s,;]+([+\-−]?\d+(?:\.\d+)?\s*°?\s*[EW]?)$/i);
  if (!m) return null;
  const lonValue = Number(m[2].replace(/[^\d.\-−]/g, '').replace('−', '-'));
  // Negative longitudes are written −180…180; anything else reads as east 0…360
  const r = parseCoordinate(m[1], m[2], lonValue < 0 ? 'east-180' : 'east-360');
  return r.ok ? r.coordinate : null;
}

function score(name: string, q: string): number {
  const n = fold(name);
  if (n === q) return 0;
  if (n.startsWith(q)) return 1;
  if (n.split(/[\s\-–,/]+/).some((w) => w.startsWith(q))) return 2;
  if (n.includes(q)) return 3;
  return -1;
}

/**
 * Search: Mars place names (IAU Gazetteer), NASA rover sites and typed coordinates.
 * Choosing a result flies there and makes it the selected location, which opens the
 * location card; the card draws the marker.
 */
export default function LocationSearch() {
  const { map } = useMarsMap();
  const bridge = useMapBridge();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [places, setPlaces] = useState<Place[] | null>(null);
  const [placesError, setPlacesError] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();

  const ensurePlaces = () => {
    if (places || placesError) return;
    loadPlaces().then(setPlaces, () => setPlacesError(true));
  };

  const hits = useMemo<Hit[]>(() => {
    const q = fold(query);
    if (!q) {
      // Suggestions before typing: the rover sites
      return ROVER_SITES.map((r) => ({ key: r.id, name: r.name, kind: 'Rover site', detail: r.detail, coordinate: r.coordinate }));
    }
    const out: Array<Hit & { s: number }> = [];
    const typed = parseTyped(query);
    if (typed) {
      out.push({ key: 'typed', name: `${Math.abs(typed.latitude)}° ${typed.latitude >= 0 ? 'N' : 'S'}, ${(((typed.longitudeEast % 360) + 360) % 360).toFixed(4).replace(/\.?0+$/, '')}° E`, kind: 'Coordinates', coordinate: typed, s: -1 });
    }
    for (const r of ROVER_SITES) {
      const s = Math.min(...[r.name, r.detail].map((t) => score(t, q)).filter((x) => x >= 0), 99);
      if (s < 99) out.push({ key: r.id, name: r.name, kind: 'Rover site', detail: r.detail, coordinate: r.coordinate, s });
    }
    for (const p of places ?? []) {
      const s = score(p[0], q);
      if (s >= 0) out.push({ key: `iau-${p[5]}`, name: p[0], kind: p[1], coordinate: makeCoordinate(p[2], p[3]), sizeKm: p[4], s: s + 0.5 - Math.min(0.4, p[4] / 10000) });
    }
    return out.sort((a, b) => a.s - b.s).slice(0, 8);
  }, [query, places]);

  useEffect(() => setActive(0), [query]);

  const select = (hit: Hit) => {
    setQuery(hit.name);
    setOpen(false);
    inputRef.current?.blur();

    let zoom = Math.max(map.getZoom(), 8);
    if (hit.kind === 'Rover site') zoom = 11;
    else if (hit.sizeKm) {
      // Frame the feature: its size in degrees of latitude and longitude around its centre
      const [lat, lng] = toMapLatLng(hit.coordinate, map.getCenter().lng);
      const dLat = (hit.sizeKm * 0.75) / 59.27;
      const dLng = dLat / Math.max(0.1, Math.cos((lat * Math.PI) / 180));
      zoom = Math.min(12, Math.max(map.getMinZoom(), map.getBoundsZoom(L.latLngBounds([lat - dLat, lng - dLng], [lat + dLat, lng + dLng]))));
    }
    const here = { latitude: map.getCenter().lat, longitudeEast: map.getCenter().lng };
    const km = greatCircleDistanceM(here, hit.coordinate) / 1000;
    if (bridge) bridge.flyTo(hit.coordinate, { zoom, durationSeconds: Math.min(3.2, 1.2 + km / 2500) });
    else map.setView(toMapLatLng(hit.coordinate, map.getCenter().lng), zoom);
    selectedLocationStore.set({ coordinate: hit.coordinate, name: hit.kind === 'Coordinates' ? undefined : hit.name, source: 'search' });
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!open) return setOpen(true);
      const step = e.key === 'ArrowDown' ? 1 : -1;
      setActive((a) => (hits.length ? (a + step + hits.length) % hits.length : 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const pick = hits[active] ?? hits[0];
      if (pick) select(pick);
    } else if (e.key === 'Escape') {
      setOpen(false);
      inputRef.current?.blur();
    }
  };

  const showList = open && hits.length > 0;
  const loadingPlaces = open && query.trim() !== '' && !places && !placesError;

  return (
    <div className="bt-search" role="search">
      <div className="bt-search__field">
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <circle cx="8.5" cy="8.5" r="5.5" />
          <path d="m13 13 4.5 4.5" />
        </svg>
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-label="Explore locations on Mars"
          aria-autocomplete="list"
          aria-expanded={showList}
          aria-controls={listId}
          aria-activedescendant={showList ? `${listId}-${active}` : undefined}
          placeholder="Explore locations on Mars…"
          autoComplete="off"
          spellCheck={false}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            ensurePlaces();
          }}
          onFocus={() => {
            setOpen(true);
            ensurePlaces();
          }}
          onBlur={() => setOpen(false)}
          onKeyDown={onKeyDown}
        />
        {query && (
          <button
            type="button"
            className="bt-search__clear"
            aria-label="Clear search"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              setQuery('');
              inputRef.current?.focus();
            }}
          >
            <svg viewBox="0 0 20 20" aria-hidden="true">
              <path d="m6 6 8 8M14 6l-8 8" />
            </svg>
          </button>
        )}
      </div>

      {showList && (
        <ul id={listId} role="listbox" className="bt-search__list" aria-label="Locations">
          {!query.trim() && <li className="bt-search__hint" role="presentation">Rover sites · or type a place name or coordinates</li>}
          {hits.map((h, i) => (
            <li
              key={h.key}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              className={i === active ? 'is-active' : undefined}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => select(h)}
              onMouseEnter={() => setActive(i)}
            >
              <span className="bt-search__name">
                {h.name}
                {h.detail && <span className="bt-search__detail">{h.detail}</span>}
              </span>
              <span className="bt-search__kind">{h.kind}</span>
            </li>
          ))}
        </ul>
      )}
      {open && query.trim() && !showList && (
        <p className="bt-search__none" role="status">
          {loadingPlaces ? 'Loading place names…' : placesError ? 'Place names could not be loaded.' : `Nothing on Mars matches “${query}”.`}
        </p>
      )}
    </div>
  );
}
