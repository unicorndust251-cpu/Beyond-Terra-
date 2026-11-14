import { useId, useState, type ReactNode } from 'react';

/**
 * A settings row: label on the left, current value on the right, and its controls revealed
 * underneath on click. Used for every expandable setting in the planner.
 */
export function Disclosure({
  label,
  value,
  children,
  open,
  onToggle,
  marker,
}: {
  label: string;
  value: ReactNode;
  children: ReactNode;
  open: boolean;
  onToggle: () => void;
  /** Optional coloured dot or pin before the label. */
  marker?: ReactNode;
}) {
  const id = useId();
  return (
    <div className={`mp-row${open ? ' is-open' : ''}`}>
      <button type="button" className="mp-row__head" aria-expanded={open} aria-controls={id} onClick={onToggle}>
        {marker}
        <span className="mp-row__label">{label}</span>
        <span className="mp-row__value">{value}</span>
        <Chevron open={open} />
      </button>
      {open && (
        <div id={id} className="mp-row__body">
          {children}
        </div>
      )}
    </div>
  );
}

export function Chevron({ open }: { open: boolean }) {
  return (
    <svg className={`mp-chevron${open ? ' is-open' : ''}`} viewBox="0 0 16 16" aria-hidden="true">
      <path d="M6 4l4 4-4 4" />
    </svg>
  );
}

/** A small ⓘ that reveals an explanation inline, so long notes are not always on screen. */
export function InfoTip({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <>
      <button
        type="button"
        className={`mp-info${open ? ' is-open' : ''}`}
        aria-label={label}
        aria-expanded={open}
        aria-controls={id}
        title={label}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
      >
        i
      </button>
      {open && (
        <span id={id} className="mp-info__text" role="note">
          {children}
        </span>
      )}
    </>
  );
}

/** A labelled pair in a compact list: label left, value right (tabular numbers). */
export function Stat({ label, children, emphasis }: { label: ReactNode; children: ReactNode; emphasis?: boolean }) {
  return (
    <div className={`mp-stat${emphasis ? ' is-emphasis' : ''}`}>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}
