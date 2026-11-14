import { useEffect, useId, useState } from 'react';
import { FIELD_LABELS, parseFieldInput, STATUS_LABELS, type NumKey, type Valued } from '../loadout';

interface Props {
  fieldKey: NumKey;
  value: Valued;
  onChange: (value: Valued) => void;
  /** Overrides the default label. */
  label?: string;
  suffix?: string;
}

const show = (v: number | null) => (v === null ? '' : String(Number(v.toFixed(6))));

/**
 * One editable number with its provenance: "Demo estimate — editable", "User supplied",
 * "Published reference" or "Unknown". Blank means unknown, not zero; invalid input is
 * rejected with a message and the previous value is kept.
 */
export default function ValueField({ fieldKey, value, onChange, label, suffix }: Props) {
  const id = useId();
  const [text, setText] = useState(show(value.value));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setText(show(value.value));
    setError(null);
  }, [value.value, value.status]);

  const commit = () => {
    if (text === show(value.value)) return;
    const result = parseFieldInput(fieldKey, text);
    if ('error' in result) {
      setError(result.error);
      return;
    }
    setError(null);
    onChange(result.value === null ? { value: null, status: 'unknown' } : { value: result.value, status: 'user' });
  };

  return (
    <div className={`mp-vf mp-vf--${value.status}`}>
      <label htmlFor={id}>{label ?? FIELD_LABELS[fieldKey]}</label>
      <span className="mp-unit-input">
        <input
          id={id}
          inputMode={fieldKey === 'quantity' ? 'numeric' : 'decimal'}
          value={text}
          placeholder={fieldKey === 'unitCost' ? 'not provided' : 'unknown'}
          aria-invalid={!!error}
          aria-describedby={`${id}-status`}
          onChange={(e) => {
            setText(e.target.value);
            setError(null);
          }}
          onBlur={commit}
          onKeyDown={(e) => e.key === 'Enter' && commit()}
        />
        {suffix}
      </span>
      <span id={`${id}-status`} className={`mp-vf__status${error ? ' is-error' : ''}`} role={error ? 'alert' : undefined}>
        {error ?? (value.status === 'unknown' && fieldKey === 'unitCost' ? 'Not provided' : STATUS_LABELS[value.status])}
        {!error && value.source ? ` · ${value.source}` : ''}
      </span>
    </div>
  );
}
