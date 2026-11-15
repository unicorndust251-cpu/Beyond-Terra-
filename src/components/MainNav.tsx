import { useEffect, useRef, useState } from 'react';
import { SECTIONS, navigate, openMapLayersPanel, useMapLayersPanelOpen, type Section } from '../shared';
import './MainNav.css';

type NavItem = { id: Section; label: string; hint: string } | { id: 'layers'; label: string; hint: string };

const NAV_ITEMS: NavItem[] = [
  ...SECTIONS.filter((section) => section.id === 'explore'),
  { id: 'layers', label: 'Layers', hint: 'Map imagery and scientific layers' },
  ...SECTIONS.filter((section) => section.id !== 'explore'),
];

/**
 * The one main navigation, shown in the map's top bar, on the landmark globe and on the
 * Mars Dashboard. On narrow screens the destinations fold into a compact menu.
 */
export default function MainNav({ current }: { current: Section }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const layersOpen = useMapLayersPanelOpen();
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

  const showLayers = () => {
    setOpen(false);
    openMapLayersPanel();
  };

  const go = (s: Section) => {
    setOpen(false);
    if (s !== current) navigate(s);
  };

  return (
    <div className="bt-nav" ref={root}>
      <nav className="bt-nav__tabs" aria-label="Main sections">
        {NAV_ITEMS.map((item) =>
          item.id === 'layers' ? (
            <button
              key={item.id}
              type="button"
              className={layersOpen ? 'is-active' : ''}
              aria-expanded={layersOpen}
              aria-controls="bt-layers-menu"
              title={item.hint}
              onClick={showLayers}
            >
              {item.label}
            </button>
          ) : (
            <button
              key={item.id}
              type="button"
              className={item.id === current ? 'is-active' : ''}
              aria-current={item.id === current ? 'page' : undefined}
              title={item.hint}
              onClick={() => go(item.id)}
            >
              {item.label}
            </button>
          ),
        )}
      </nav>
      <div className="bt-nav__menu">
        <button type="button" className="bt-nav__menubtn" aria-expanded={open} aria-haspopup="true" onClick={() => setOpen((o) => !o)}>
          {layersOpen ? 'Layers' : active.label}
          <svg viewBox="0 0 20 20" aria-hidden="true">
            <path d="m6 8 4 4 4-4" />
          </svg>
        </button>
        {open && (
          <ul className="bt-nav__list" aria-label="Main sections">
            {NAV_ITEMS.map((item) => (
              <li key={item.id}>
                {item.id === 'layers' ? (
                  <button type="button" className={layersOpen ? 'is-active' : ''} aria-expanded={layersOpen} aria-controls="bt-layers-menu" onClick={showLayers}>
                    <span>{item.label}</span>
                    <small>{item.hint}</small>
                  </button>
                ) : (
                  <button type="button" className={item.id === current ? 'is-active' : ''} aria-current={item.id === current ? 'page' : undefined} onClick={() => go(item.id)}>
                    <span>{item.label}</span>
                    <small>{item.hint}</small>
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
