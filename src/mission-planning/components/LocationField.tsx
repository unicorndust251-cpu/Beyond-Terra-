import { useEffect, useId, useMemo, useState } from 'react';
import { fromEast360, toEast360 } from '../../shared';
import { LANDMARKS } from '../data/landmarks';
import { formatLatitude, formatLongitude, locationName, parseCoordinate, parseLatitude, parseLongitudeEast } from '../geo';
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
  /** Letter or number shown on the map pin, repeated here so the two are easy to match. */
  symbol: string;
}

/** Shows a number without trailing zeros (18.88, not 18.8800). */
const trim = (v: number) => String(Number(v.toFixed(6)));

/** One route location: typed coordinates, a verified landmark, or a point picked on the map. */
export default function LocationField({ label, location, onChange, picking, onPick, onRemove, onMove, accent, symbol }: Props) {
  const id = useId();
  const [lat, setLat] = useState('');
  const [lon, setLon] = useState('');
  const [query, setQuery] = useState('');
  const [latError, setLatError] = useState<string | undefined>();
  const [lonError, setLonError] = useState<string | undefined>();

  // Keep the inputs in step with the location, however it was set
  useEffect(() => {
    setLat(location ? trim(location.coordinate.latitude) : '');
    setLon(location ? trim(toEast360(location.coordinate)) : '');
    setLatError(undefined);
    setLonError(undefined);
  }, [location]);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    return LANDMARKS.filter((l) => l.name.toLowerCase().includes(q)).slice(0, 6);
  }, [query]);

  const apply = () => {
    const result = parseCoordinate(lat, lon);
    if (!('coordinate' in result)) {
      setLatError(result.latError);
      setLonError(result.lonError);
      return;
    }
    onChange({ coordinate: result.coordinate });
  };

  // Each field is checked on its own when you leave it; empty is not an error yet
  const checkLat = () => {
    const r = parseLatitude(lat);
    setLatError('error' in r ? r.error : undefined);
  };
  const checkLon = () => {
    const r = parseLongitudeEast(lon);
    setLonError('error' in r ? r.error : undefined);
  };

  return (
    <fieldset className={`mp-loc mp-loc--${accent}${picking ? ' is-picking' : ''}`}>
      <legend className="mp-loc__legend">
        <span className="mp-loc__pin" aria-hidden="true">
          {symbol}
        </span>
        {label}
      </legend>

      <div className="mp-loc__current" aria-live="polite">
        {location ? (
          <>
            <p className="mp-loc__name">{locationName(location.name)}</p>
            <p className="mp-loc__value">
              {formatLatitude(location.coordinate)}, {formatLongitude(location.coordinate)}
            </p>
          </>
        ) : (
          <p className="mp-loc__value">Not set: search, enter coordinates or pick on the map</p>
        )}
      </div>

      <div className="mp-loc__inputs">
        <label htmlFor={`${id}-lat`}>
          <span>Latitude °</span>
          <input
            id={`${id}-lat`}
            inputMode="decimal"
            placeholder="e.g. 18.88"
            value={lat}
            aria-invalid={!!latError}
            aria-describedby={latError ? `${id}-lat-err` : undefined}
            onChange={(e) => {
              setLat(e.target.value);
              setLatError(undefined);
            }}
            onBlur={checkLat}
            onKeyDown={(e) => e.key === 'Enter' && apply()}
          />
        </label>
        <label htmlFor={`${id}-lon`}>
          <span>Longitude °E</span>
          <input
            id={`${id}-lon`}
            inputMode="decimal"
            placeholder="0 to 360"
            value={lon}
            aria-invalid={!!lonError}
            aria-describedby={lonError ? `${id}-lon-err` : undefined}
            onChange={(e) => {
              setLon(e.target.value);
              setLonError(undefined);
            }}
            onBlur={checkLon}
            onKeyDown={(e) => e.key === 'Enter' && apply()}
          />
        </label>
        <button type="button" className="mp-btn mp-btn--small" onClick={apply}>
          Set
        </button>
      </div>
      {latError && (
        <p id={`${id}-lat-err`} className="mp-loc__error" role="alert">
          {latError}
        </p>
      )}
      {lonError && (
        <p id={`${id}-lon-err`} className="mp-loc__error" role="alert">
          {lonError}
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
                    {l.category} · {l.latitude}°, {l.longitudeEast360}° E
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
