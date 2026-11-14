import { useEffect, useId, useMemo, useRef, useState } from 'react';
import * as L from 'leaflet';
import { useMarsMap } from '../map/MarsMapContext';
import { greatCircleDistanceM, selectedLocationStore, toMapLatLng, useMapBridge } from '../shared';
import { formatLocation, locationCoordinate, searchLocations, type MarsLocation } from './locations';

/** Deepest zoom a selection flies to; the visitor can zoom further themselves. */
const MAX_SELECT_ZOOM = 12;

/**
 * Search for one of the reference locations, fly to it, mark it and describe it.
 * Navigation goes through the shared map bridge; the pick is published to
 * selectedLocationStore (source "search") so other modules can use it.
 */
export default function LocationSearch() {
  const { map } = useMarsMap();
  const bridge = useMapBridge();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [selected, setSelected] = useState<MarsLocation | null>(null);
  const marker = useRef<L.Marker | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const matches = useMemo(() => searchLocations(query), [query]);

  useEffect(() => setActive(0), [query]);
  useEffect(() => () => void marker.current?.remove(), []);

  const select = (loc: MarsLocation) => {
    setSelected(loc);
    setQuery(loc.name);
    setOpen(false);
    inputRef.current?.blur();

    const coord = locationCoordinate(loc);
    const [lat, lng] = toMapLatLng(coord, map.getCenter().lng);

    // Frame the whole feature around its point: half-sizes from the point to the far edges
    const e = loc.extent;
    const westNear = toMapLatLng({ latitude: 0, longitudeEast: e.west }, lng)[1];
    let eastNear = westNear + ((((e.east - e.west) % 360) + 360) % 360);
    if (eastNear === westNear) eastNear += 360;
    const halfLat = Math.max(Math.abs(e.north - lat), Math.abs(lat - e.south));
    const halfLng = Math.max(Math.abs(eastNear - lng), Math.abs(lng - westNear));
    const frame = L.latLngBounds([lat - halfLat, lng - halfLng], [lat + halfLat, lng + halfLng]);
    const zoom = Math.min(MAX_SELECT_ZOOM, Math.max(map.getMinZoom(), map.getBoundsZoom(frame, false, L.point(48, 48))));

    // Longer flights for longer journeys, as the map's own return-home flight does
    const here = { latitude: map.getCenter().lat, longitudeEast: map.getCenter().lng };
    const km = greatCircleDistanceM(here, coord) / 1000;
    if (bridge) bridge.flyTo(coord, { zoom, durationSeconds: Math.min(3.2, 1.2 + km / 2500) });
    else map.setView([lat, lng], zoom);

    marker.current?.remove();
    marker.current = L.marker([lat, lng], {
      icon: L.divIcon({
        className: 'bt-sci-pin',
        html: `<span class="bt-sci-pin__dot"></span><span class="bt-sci-pin__label"></span>`,
        iconSize: [0, 0],
      }),
      keyboard: false,
      interactive: false,
    }).addTo(map);
    // Set as text, never as HTML
    const label = marker.current.getElement()?.querySelector('.bt-sci-pin__label');
    if (label) label.textContent = loc.name;

    selectedLocationStore.set({ coordinate: coord, name: loc.name, source: 'search' });
  };

  const clear = () => {
    setSelected(null);
    setQuery('');
    marker.current?.remove();
    marker.current = null;
  };

  const zoomCloser = () => {
    if (!selected) return;
    const coord = locationCoordinate(selected);
    const zoom = Math.min(map.getMaxZoom(), map.getZoom() + 2);
    if (bridge) bridge.flyTo(coord, { zoom, durationSeconds: 1.2 });
    else map.setView(toMapLatLng(coord, map.getCenter().lng), zoom);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!open) return setOpen(true);
      const step = e.key === 'ArrowDown' ? 1 : -1;
      setActive((a) => (matches.length ? (a + step + matches.length) % matches.length : 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const pick = matches[active] ?? matches[0];
      if (open && pick) select(pick);
      else setOpen(true);
    } else if (e.key === 'Escape') {
      if (open) {
        e.preventDefault();
        setOpen(false);
      }
    }
  };

  const showList = open && matches.length > 0;
  const fmt = selected ? formatLocation(selected) : null;

  return (
    <div className="bt-sci-search">
      <div className="bt-sci-search__field">
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <circle cx="8.5" cy="8.5" r="5.5" />
          <path d="m13 13 4.5 4.5" />
        </svg>
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-label="Search Mars locations"
          aria-autocomplete="list"
          aria-expanded={showList}
          aria-controls={listId}
          aria-activedescendant={showList ? `${listId}-${active}` : undefined}
          placeholder="Search Mars locations"
          autoComplete="off"
          spellCheck={false}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={onKeyDown}
        />
        {query && (
          <button type="button" className="bt-sci-search__clear" onClick={clear} aria-label="Clear search">
            <svg viewBox="0 0 20 20" aria-hidden="true">
              <path d="m6 6 8 8M14 6l-8 8" />
            </svg>
          </button>
        )}
      </div>

      {showList && (
        <ul id={listId} role="listbox" className="bt-sci-search__list" aria-label="Locations">
          {matches.map((loc, i) => (
            <li
              key={loc.id}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              className={i === active ? 'is-active' : undefined}
              // Keep focus in the input until the pick is made
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => select(loc)}
              onMouseEnter={() => setActive(i)}
            >
              <span className="bt-sci-search__name">{loc.name}</span>
              <span className="bt-sci-search__cat">{loc.category}</span>
            </li>
          ))}
        </ul>
      )}
      {open && query && matches.length === 0 && (
        <p className="bt-sci-search__none" role="status">
          No location matches “{query}”.
        </p>
      )}

      {selected && fmt && !open && (
        <section className="bt-sci-place" aria-label={`${selected.name}, selected location`}>
          <div className="bt-sci-place__head">
            <h2>{selected.name}</h2>
            <span className="bt-sci-place__cat">{selected.category}</span>
          </div>
          <p className="bt-sci-place__coords">
            {fmt.latitude} · {fmt.longitude}
            {fmt.west && <span> ({fmt.west})</span>}
          </p>
          <p className="bt-sci-place__note">
            {selected.kind === 'point'
              ? 'Precise point, planetocentric.'
              : `Centre of a named region${selected.sizeKm ? ` about ${Math.round(selected.sizeKm).toLocaleString('en-US')} km across` : ''}, not a single site.`}{' '}
            <a href={selected.source.url} target="_blank" rel="noreferrer">
              {selected.source.name}
            </a>
          </p>
          <div className="bt-sci-place__actions">
            <button type="button" onClick={zoomCloser}>
              Zoom closer
            </button>
            <button type="button" onClick={clear}>
              Clear
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
