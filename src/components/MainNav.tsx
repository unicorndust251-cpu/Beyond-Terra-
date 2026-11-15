import { useEffect, useRef, useState } from 'react';
import { SECTIONS, navigate, type Section } from '../shared';
import './MainNav.css';

/**
 * The one main navigation, shown in the map's top bar, on the landmark globe and on the
 * Mars Dashboard. On narrow screens the destinations fold into a compact menu.
 */
export default function MainNav({ current }: { current: Section }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return undefined;
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);
  const active = SECTIONS.find((s) => s.id === current)!;

  const go = (s: Section) => {
    setOpen(false);
    if (s !== current) navigate(s);
  };

  return (
    <div className="bt-nav" ref={root}>
      <nav className="bt-nav__tabs" aria-label="Main sections">
        {SECTIONS.map((s) => (
          <button
            key={s.id}
            type="button"
            className={s.id === current ? 'is-active' : ''}
            aria-current={s.id === current ? 'page' : undefined}
            title={s.hint}
            onClick={() => go(s.id)}
          >
            {s.label}
          </button>
        ))}
      </nav>
      <div className="bt-nav__menu">
        <button type="button" className="bt-nav__menubtn" aria-expanded={open} aria-haspopup="true" onClick={() => setOpen((o) => !o)}>
          {active.label}
          <svg viewBox="0 0 20 20" aria-hidden="true">
            <path d="m6 8 4 4 4-4" />
          </svg>
        </button>
        {open && (
          <ul className="bt-nav__list" aria-label="Main sections">
            {SECTIONS.map((s) => (
              <li key={s.id}>
                <button type="button" className={s.id === current ? 'is-active' : ''} aria-current={s.id === current ? 'page' : undefined} onClick={() => go(s.id)}>
                  <span>{s.label}</span>
                  <small>{s.hint}</small>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
