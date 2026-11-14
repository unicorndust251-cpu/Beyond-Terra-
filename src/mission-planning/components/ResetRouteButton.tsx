import { useEffect, useState } from 'react';

interface Props {
  onReset: () => void;
  /** Nothing to clear yet. */
  disabled?: boolean;
  label?: string;
  className?: string;
  /** Ask first (default). Off when there is nothing unsaved to lose. */
  confirm?: boolean;
  question?: string;
}

/**
 * Clears the current route after a quick confirmation, so a stray click never wipes a plan.
 * The question withdraws itself after a few seconds.
 */
export default function ResetRouteButton({
  onReset,
  disabled,
  label = 'Reset route',
  className = '',
  confirm = true,
  question = 'Clear this route?',
}: Props) {
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (!confirming) return undefined;
    const timer = window.setTimeout(() => setConfirming(false), 5000);
    return () => window.clearTimeout(timer);
  }, [confirming]);

  if (!confirming) {
    return (
      <button
        type="button"
        // "mp-link" shows it as a quiet text action; otherwise it is an outlined button
        className={className.includes('mp-link') ? className : `mp-btn mp-btn--ghost ${className}`}
        disabled={disabled}
        onClick={() => (confirm ? setConfirming(true) : onReset())}
      >
        {label}
      </button>
    );
  }
  return (
    <span className="mp-confirm" role="group" aria-label={question}>
      <span className="mp-confirm__question">{question}</span>
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
