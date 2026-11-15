import { useEffect, useState } from 'react';
import { useHazardState } from '../../shared';
import { DRAWABLE, displayName } from '../categories';
import { swatchUrl } from '../patterns';

const KIND: Partial<Record<string, string>> = {
  L: 'NASA location markers only',
  S: 'USGS outlines: fill, waves, outline; plus markers',
  B: 'NASA location markers only',
  G: 'NASA location markers only',
  I: 'NASA location markers only',
  D: 'NASA location markers only',
  F: 'Mapped line (trough axis)',
  P: 'Mapped line (pit chain axis)',
  SL: 'Shaded cells with outline',
  V: 'Night side for the planned time (striped); subsolar point',
  T: 'Nothing drawn: no observations loaded',
  R: 'Measurement site marker only',
  C: 'Configured antennas; blocked route stretches',
  N: 'Dashed rings of your stated uncertainty at stops',
  E: 'Energy notes at route stops',
  M: 'Arrival-time notes at route stops',
  U: 'Grey crosshatch over all terrain',
};

/** Compact, expandable key in the map corner: what is drawn now, and the map symbols. */
export function MapLegend({ shifted }: { shifted: boolean }) {
  const hz = useHazardState();
  const [open, setOpen] = useState(false);
  // Fold away when an information panel opens, so the map stays visible; the user can reopen it
  useEffect(() => {
    if (shifted) setOpen(false);
  }, [shifted]);
  const shown = DRAWABLE.filter((c) => hz.active.includes(c));
  return (
    <div className={`hz-legend${shifted ? ' is-shifted' : ''}`}>
      <button type="button" className="hz-legend__toggle" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span>Map Key</span>
        <span className="hz-legend__mini" aria-hidden="true">
          {shown.slice(0, 5).map((c) => (
            <img key={c} src={swatchUrl(c)} alt="" width={12} height={12} />
          ))}
        </span>
        <svg viewBox="0 0 20 20" aria-hidden="true" className="hz-chev">
          <path d="m7 5 5 5-5 5" />
        </svg>
      </button>
      {open && (
        <div className="hz-legend__body">
          <p className="hz-legend__h">On the map now</p>
          {shown.length ? (
            <ul>
              {shown.map((c) => (
                <li key={c}>
                  <img className="hz-swatch hz-swatch--sm" src={swatchUrl(c)} alt="" width={16} height={16} />
                  <span>
                    {displayName(c)}
                    <small>{KIND[c]}</small>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="hz-muted">No hazards are shown. Turn on Show Hazards.</p>
          )}
          <p className="hz-legend__h">Symbols</p>
          <ul>
            <li>
              <span className="hz-obs-pin hz-obs-pin--legend" aria-hidden="true">
                <span style={{ ['--c' as string]: '#A3E635' }} />
              </span>
              <span>
                NASA observation location<small>Ring in the category colour; a point, not an area. Boundary not mapped</small>
              </span>
            </li>
            <li>
              <span className="hz-sym hz-sym--point" aria-hidden="true" />
              <span>Selected point</span>
            </li>
            <li>
              <span className="hz-sym hz-sym--sel" aria-hidden="true" />
              <span>Selected feature</span>
            </li>
            <li>
              <span className="hz-sym hz-sym--cross" aria-hidden="true" />
              <span>Route crosses a mapped line</span>
            </li>
            <li>
              <span className="hz-sym hz-sym--steep" aria-hidden="true" />
              <span>Route passes through steep cells</span>
            </li>
          </ul>
          <p className="hz-legend__note">Orange pins are landmarks and burgundy markers are curvature sites. They are other layers, not hazards.</p>
        </div>
      )}
    </div>
  );
}
