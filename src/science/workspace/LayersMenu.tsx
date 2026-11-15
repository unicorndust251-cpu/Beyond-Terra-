import { useEffect, useRef, useState, type ReactNode } from 'react';
import { setMapLayersPanelOpen, useMapLayersPanelOpen } from '../../shared';

export type LoadStatus = 'idle' | 'loading' | 'ready' | 'partial' | 'error';

export interface LayerItem {
  key: string;
  label: string;
  group: 'Surface' | 'Terrain' | 'Science';
  on: boolean;
  amount: number;
  status: LoadStatus;
  /** Why the layer cannot be switched on, if it cannot */
  unavailable?: string | null;
  onToggle(): void;
  onAmount(v: number): void;
  onRetry?: () => void;
  /** Opacity 0–1 by default; intensity for relief; none for marker layers */
  slider?: { name: 'Opacity' | 'Intensity'; min: number; max: number; step: number } | false;
  swatch?: ReactNode;
  info: { text: string; resolution: string; source: { name: string; url: string } };
}

const GROUPS: LayerItem['group'][] = ['Surface', 'Terrain', 'Science'];

/**
 * One "Layers" button; a small floating menu with a switch per layer. Dataset details,
 * opacity and retry sit behind each layer's information button.
 */
export default function LayersMenu({ items, onReset, footer }: { items: LayerItem[]; onReset(): void; footer?: ReactNode }) {
  const [infoKey, setInfoKey] = useState<string | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const open = useMapLayersPanelOpen();

  useEffect(() => {
    if (!open) return undefined;
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !root.current?.contains(e.target as Node)) setMapLayersPanelOpen(false);
    };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);

  return (
    <div className="bt-layers" ref={root}>
      {open && (
        <div id="bt-layers-menu" className="bt-layers__menu" role="dialog" aria-label="Layers">
          {GROUPS.map((g) => {
            const rows = items.filter((i) => i.group === g);
            if (!rows.length) return null;
            return (
              <section key={g} className="bt-layers__group" aria-label={g}>
                <h3>{g}</h3>
                {rows.map((item) => (
                  <Row key={item.key} item={item} infoOpen={infoKey === item.key} onInfo={() => setInfoKey((k) => (k === item.key ? null : item.key))} />
                ))}
              </section>
            );
          })}
          <footer className="bt-layers__foot">
            {footer}
            <button type="button" className="bt-layers__reset" onClick={onReset}>
              Reset
            </button>
          </footer>
        </div>
      )}
    </div>
  );
}

function Row({ item, infoOpen, onInfo }: { item: LayerItem; infoOpen: boolean; onInfo(): void }) {
  const id = `bt-layer-${item.key}`;
  const disabled = Boolean(item.unavailable);
  const on = item.on && !disabled;
  const slider = item.slider === false ? null : item.slider ?? { name: 'Opacity' as const, min: 0, max: 1, step: 0.05 };
  const problem = disabled || (on && (item.status === 'error' || item.status === 'partial'));

  return (
    <div className={`bt-layer${on ? ' is-on' : ''}${disabled ? ' is-disabled' : ''}`}>
      <div className="bt-layer__row">
        <label className="bt-layer__main" htmlFor={id}>
          <input id={id} type="checkbox" checked={on} disabled={disabled} onChange={item.onToggle} />
          <span className="bt-layer__switch" aria-hidden="true" />
          <span className="bt-layer__label">{item.label}</span>
          {item.swatch}
          {on && item.status === 'loading' && <span className="bt-layer__dot bt-layer__dot--loading" role="status" aria-label="Loading" />}
          {problem && <span className="bt-layer__dot bt-layer__dot--error" role="status" aria-label="Data unavailable" />}
        </label>
        <button type="button" className={`bt-layer__info${infoOpen ? ' is-open' : ''}`} aria-expanded={infoOpen} aria-label={`About ${item.label}`} onClick={onInfo}>
          <svg viewBox="0 0 20 20" aria-hidden="true">
            <circle cx="10" cy="10" r="7" />
            <path d="M10 9v4.5M10 6.6v.1" />
          </svg>
        </button>
      </div>

      {infoOpen && (
        <div className="bt-layer__details">
          {item.unavailable && <p className="bt-layer__warn">{item.unavailable}</p>}
          <p>{item.info.text}</p>
          <p className="bt-layer__meta">
            {item.info.resolution} ·{' '}
            <a href={item.info.source.url} target="_blank" rel="noreferrer">
              {item.info.source.name}
            </a>
          </p>
          {on && slider && (
            <label className="bt-layer__slider">
              <span>{slider.name}</span>
              <input type="range" min={slider.min} max={slider.max} step={slider.step} value={item.amount} onChange={(e) => item.onAmount(Number(e.target.value))} />
              <output>{slider.name === 'Opacity' ? `${Math.round(item.amount * 100)}%` : `${item.amount.toFixed(2).replace(/0$/, '')}×`}</output>
            </label>
          )}
          {item.onRetry && (problem || item.status === 'error') && (
            <button type="button" className="bt-layer__retry" onClick={item.onRetry}>
              Try again
            </button>
          )}
        </div>
      )}
    </div>
  );
}
