import { useEffect, useId, useMemo, useState } from 'react';
import { fromEast360, toEast360 } from '../../shared';
import { LANDMARKS } from '../data/landmarks';
import { formatCoordinate, parseCoordinate } from '../geo';
import type { PlannedLocation } from '../model';

interface Props {
  label: string;
  location: PlannedLocation | null;
  onChange: (location: PlannedLocation | null) => void;
  /** This field is waiting for a click on the map. */
  picking: boolean;
  onPick: () => void;
  /** Present only for checkpoints. */
  onRemove?: () => void;
  onMove?: (by: -1 | 1) => void;
  accent: 'start' | 'checkpoint' | 'destination';
}

/** One route location: manual coordinates, a verified landmark, or a point picked on the map. */
export default function LocationField({ label, location, onChange, picking, onPick, onRemove, onMove, accent }: Props) {
  const id = useId();
  const [lat, setLat] = useState('');
  const [lon, setLon] = useState('');
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Keep the inputs in step with the location, however it was set
  useEffect(() => {
    setLat(location ? location.coordinate.latitude.toFixed(4) : '');
    setLon(location ? toEast360(location.coordinate).toFixed(4) : '');
    setError(null);
  }, [location]);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    return LANDMARKS.filter((l) => l.name.toLowerCase().includes(q)).slice(0, 6);
  }, [query]);

  const apply = () => {
    const result = parseCoordinate(lat, lon);
    if ('error' in result) {
      setError(result.error);
      return;
    }
    onChange({ coordinate: result.coordinate });
  };

  return (
    <fieldset className={`mp-loc mp-loc--${accent}${picking ? ' is-picking' : ''}`}>
      <legend className="mp-loc__legend">
        <span className="mp-loc__dot" aria-hidden="true" />
        {label}
        {location?.name && <span className="mp-loc__name">{location.name}</span>}
      </legend>

      <p className="mp-loc__value" aria-live="polite">
        {location ? formatCoordinate(location.coordinate) : 'Not set'}
      </p>

      <div className="mp-loc__inputs">
        <label htmlFor={`${id}-lat`}>
          <span>Lat °</span>
          <input
            id={`${id}-lat`}
            inputMode="decimal"
            placeholder="−90 to 90"
            value={lat}
            onChange={(e) => setLat(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && apply()}
          />
        </label>
        <label htmlFor={`${id}-lon`}>
          <span>Lon °E</span>
          <input
            id={`${id}-lon`}
            inputMode="decimal"
            placeholder="0 to 360"
            value={lon}
            onChange={(e) => setLon(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && apply()}
          />
        </label>
        <button type="button" className="mp-btn mp-btn--small" onClick={apply}>
          Set
        </button>
      </div>
      {error && (
        <p className="mp-loc__error" role="alert">
          {error}
        </p>
      )}

      <div className="mp-loc__search">
        <input
          aria-label={`${label}: search landmarks`}
          placeholder="Search landmarks (e.g. Jezero)"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {matches.length > 0 && (
          <ul className="mp-loc__matches" role="listbox" aria-label="Landmarks">
            {matches.map((l) => (
              <li key={l.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={false}
                  onClick={() => {
                    onChange({ coordinate: fromEast360(l.latitude, l.longitudeEast360), name: l.name });
                    setQuery('');
                  }}
                >
                  <span>{l.name}</span>
                  <small>
                    {l.category} · {l.latitude.toFixed(2)}°, {l.longitudeEast360.toFixed(2)}°E
                  </small>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mp-loc__actions">
        <button type="button" className={`mp-btn mp-btn--small${picking ? ' is-active' : ''}`} onClick={onPick} aria-pressed={picking}>
          {picking ? 'Click the map…' : 'Pick on map'}
        </button>
        {location && (
          <button type="button" className="mp-btn mp-btn--small mp-btn--ghost" onClick={() => onChange(null)}>
            Clear
          </button>
        )}
        {onMove && (
          <>
            <button type="button" className="mp-btn mp-btn--icon" onClick={() => onMove(-1)} aria-label={`Move ${label} earlier`}>
              ↑
            </button>
            <button type="button" className="mp-btn mp-btn--icon" onClick={() => onMove(1)} aria-label={`Move ${label} later`}>
              ↓
            </button>
          </>
        )}
        {onRemove && (
          <button type="button" className="mp-btn mp-btn--small mp-btn--danger" onClick={onRemove}>
            Remove
          </button>
        )}
      </div>
    </fieldset>
  );
}
