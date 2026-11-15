import { useId, useState, type ReactNode } from 'react';
import { STATUS_TEXT, type SciValue } from './metrics';

interface Props {
  title: string;
  v: SciValue;
  /** Extra content under the value (e.g. a calculator). */
  children?: ReactNode;
  wide?: boolean;
}

/** A compact measurement card: value, unit, status, and its provenance one click away. */
export default function MetricCard({ title, v, children, wide }: Props) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const rows: Array<[string, string | undefined]> = [
    ['Classification', STATUS_TEXT[v.status]],
    ['Source', v.sourceName],
    ['Applies to', v.appliesTo],
    ['Observation time', v.observationTime],
    ['Method', v.method],
    ['Resolution', v.resolution],
    ['Uncertainty', v.uncertainty],
    ['Limitations', v.limitations],
  ];
  return (
    <article className={`md-card md-card--${v.status}${wide ? ' md-card--wide' : ''}`} aria-labelledby={`${id}-t`}>
      <header className="md-card__head">
        <h3 id={`${id}-t`}>{title}</h3>
        <span className={`md-badge md-badge--${v.status}`}>{STATUS_TEXT[v.status]}</span>
      </header>
      <p className={`md-card__value${v.value === null ? ' is-empty' : ''}`}>{v.value ?? '—'}</p>
      {v.detail && <p className="md-card__detail">{v.detail}</p>}
      {children}
      <button type="button" className="md-card__info" aria-expanded={open} aria-controls={`${id}-p`} onClick={() => setOpen((o) => !o)}>
        {open ? 'Hide source' : 'Source & method'}
      </button>
      {open && (
        <dl className="md-prov" id={`${id}-p`}>
          {rows
            .filter(([, value]) => value)
            .map(([k, value]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>
                  {k === 'Source' && v.sourceUrl ? (
                    <a href={v.sourceUrl} target="_blank" rel="noreferrer noopener">
                      {value}
                    </a>
                  ) : (
                    value
                  )}
                </dd>
              </div>
            ))}
        </dl>
      )}
    </article>
  );
}
