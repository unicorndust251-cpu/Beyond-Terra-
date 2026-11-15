import { useId, useState } from 'react';
import type { EnvField, EnvReading } from './meda';
import type { MedaState } from './useMeda';

interface Props {
  field: EnvField;
  title: string;
  /** Full measurement name. */
  fullName: string;
  /** What the measurement is, for the expandable explanation. */
  explanation: string;
  state: MedaState;
  onRetry: () => void;
}

const fmtUtc = (ms: number) => `${new Date(ms).toISOString().replace('T', ' ').slice(0, 19)} UTC`;
const coord = (lat: number, lon: number) => `${Math.abs(lat).toFixed(4)}° ${lat >= 0 ? 'N' : 'S'}, ${(((lon % 360) + 360) % 360).toFixed(4)}° E`;
/** Fixed decimals, keeping a true zero as "0.0" (explicit finite checks, never truthiness). */
const fixed = (v: number, d: number) => (Object.is(Number(v.toFixed(d)), -0) ? 0 : v).toFixed(d);

/** Main value and secondary unit line for each field (internal units: °C, m/s, Pa). */
function display(r: EnvReading): { value: string; detail: string; source: string } {
  const src = `${r.sourceValue} ${r.sourceUnit}`;
  switch (r.field) {
    case 'airTemperatureC':
    case 'surfaceTemperatureC':
      return { value: `${fixed(r.value, 1)} °C`, detail: `${fixed((r.value * 9) / 5 + 32, 1)} °F`, source: src };
    case 'windSpeedMs':
      return { value: `${fixed(r.value, 1)} m/s`, detail: `${fixed(r.value * 3.6, 1)} km/h`, source: src };
    case 'pressurePa':
      return { value: `${fixed(r.value / 1000, 3)} kPa`, detail: `${fixed(r.value, 1)} Pa · ${fixed(r.value / 100, 2)} mbar`, source: src };
  }
}

/** One environmental card: loading, error with Retry, unavailable, or a located, timed observation. */
export default function EnvironmentCard({ field, title, fullName, explanation, state, onRetry }: Props) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const result = state.status === 'ready' ? state.fields[field] : null;
  const r = result?.state === 'ok' ? result.reading : null;
  const valid = r !== null && Number.isFinite(r.value);
  const d = valid ? display(r) : null;
  const badge = state.status === 'loading' ? 'Loading' : state.status === 'error' ? 'Error' : valid ? 'Observed · historical' : 'Unavailable';
  const badgeClass = state.status === 'error' ? 'unavailable' : valid ? 'observed' : 'unavailable';

  return (
    <article className={`md-card md-card--env${valid ? '' : ' md-card--unavailable'}`} aria-labelledby={`${id}-t`} aria-busy={state.status === 'loading'}>
      <header className="md-card__head">
        <h3 id={`${id}-t`}>{title}</h3>
        <span className={`md-badge md-badge--${badgeClass}`}>{badge}</span>
      </header>
      <p className="md-card__full">{fullName}</p>

      {state.status === 'loading' && (
        <p className="md-card__detail md-skeleton" role="status">
          Loading observations…
        </p>
      )}

      {state.status === 'error' && (
        <div role="alert">
          <p className="md-card__value is-empty">Could not load observations</p>
          <p className="md-card__detail">{state.message}</p>
          <button type="button" className="md-btn md-card__retry" onClick={onRetry}>
            Retry
          </button>
        </div>
      )}

      {state.status === 'ready' && !valid && (
        <>
          <p className="md-card__value is-empty">—</p>
          <p className="md-card__detail">No suitable observation available for this location/time.</p>
          {result?.state === 'unavailable' && <p className="md-card__reason">{result.reason}</p>}
        </>
      )}

      {state.status === 'ready' && valid && r && d && (
        <>
          <p className="md-card__value">{d.value}</p>
          <p className="md-card__detail">{d.detail}</p>
          <dl className="md-obs">
            <div>
              <dt>Observed at</dt>
              <dd>
                Perseverance rover, Jezero crater · {coord(r.rover.latitude, r.rover.longitudeEast)}
                {r.distanceKm >= 0.05 ? ` · ${fixed(r.distanceKm, 1)} km from the selected location` : ''}
              </dd>
            </div>
            <div>
              <dt>Time</dt>
              <dd>
                {fmtUtc(r.utcMs)} · sol {r.sol} · {r.ltst.split(' ').pop()} LTST
              </dd>
            </div>
            <div>
              <dt>Status</dt>
              <dd>Observed, historical archive record — not live weather</dd>
            </div>
            <div>
              <dt>Source</dt>
              <dd>
                <a href={r.csvUrl} target="_blank" rel="noreferrer noopener">
                  {r.productTitle}
                </a>{' '}
                · NASA PDS
              </dd>
            </div>
          </dl>
        </>
      )}

      <button type="button" className="md-card__info" aria-expanded={open} aria-controls={`${id}-p`} onClick={() => setOpen((o) => !o)}>
        {open ? 'Hide explanation' : 'About this measurement'}
      </button>
      {open && (
        <div className="md-prov" id={`${id}-p`}>
          <p>{explanation}</p>
          {r && (
            <dl>
              <div>
                <dt>Source value</dt>
                <dd>
                  {d?.source} ({r.sourceField})
                </dd>
              </div>
              {r.sensorRangeC && (
                <div>
                  <dt>Mast sensors</dt>
                  <dd>
                    {fixed(r.sensorRangeC[0], 1)} to {fixed(r.sensorRangeC[1], 1)} °C
                  </dd>
                </div>
              )}
              <div>
                <dt>Uncertainty</dt>
                <dd>{r.uncertainty === null ? 'Not provided in the product' : `±${fixed(r.uncertainty, 2)} ${r.field === 'pressurePa' ? 'Pa' : r.field === 'windSpeedMs' ? '(product units)' : 'K'}`}</dd>
              </div>
              <div>
                <dt>Spacecraft clock</dt>
                <dd>SCLK {r.sclk}</dd>
              </div>
              <div>
                <dt>Product</dt>
                <dd>
                  {r.productLid} ·{' '}
                  <a href={r.labelUrl} target="_blank" rel="noreferrer noopener">
                    PDS4 label
                  </a>
                </dd>
              </div>
            </dl>
          )}
          {state.status === 'ready' && <p className="md-note">{state.index.rules[field === 'airTemperatureC' ? 'airTemperature' : field === 'surfaceTemperatureC' ? 'groundTemperature' : field === 'windSpeedMs' ? 'windSpeed' : 'pressure']}</p>}
        </div>
      )}
    </article>
  );
}
