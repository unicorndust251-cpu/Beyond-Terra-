import { useEffect, useState } from 'react';

interface Props {
  onReset: () => void;
  /** Nothing to clear yet. */
  disabled?: boolean;
  label?: string;
  className?: string;
}

/**
 * Clears the current route after a quick confirmation, so a stray click never wipes a plan.
 * The question withdraws itself after a few seconds.
 */
export default function ResetRouteButton({ onReset, disabled, label = 'Reset route', className = '' }: Props) {
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (!confirming) return undefined;
    const timer = window.setTimeout(() => setConfirming(false), 5000);
    return () => window.clearTimeout(timer);
  }, [confirming]);

  if (!confirming) {
    return (
      <button type="button" className={`mp-btn mp-btn--ghost ${className}`} disabled={disabled} onClick={() => setConfirming(true)}>
        {label}
      </button>
    );
  }
  return (
    <span className={`mp-confirm ${className}`} role="group" aria-label="Confirm clearing the route">
      <span className="mp-confirm__question">Clear this route?</span>
      <button
        type="button"
        className="mp-btn mp-btn--small mp-btn--danger"
        onClick={() => {
          setConfirming(false);
          onReset();
        }}
        autoFocus
      >
        Clear
      </button>
      <button type="button" className="mp-btn mp-btn--small mp-btn--ghost" onClick={() => setConfirming(false)}>
        Keep
      </button>
    </span>
  );
}
