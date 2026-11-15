import { useEffect, useRef, useState, type ReactNode } from 'react';
import type * as L from 'leaflet';
import { quadrangleAt } from './quadrangles';
import { displaySettingsStore, useDisplaySettings } from './uiState';
import ViewSwitch from '../../hazards/components/ViewSwitch';

export type DataStatus = 'ready' | 'loading' | 'partial' | 'error' | 'off';

export interface StatusItem {
  label: string;
  status: DataStatus;
  detail: string;
}

const STATUS_WORD: Record<DataStatus, string> = {
  ready: 'Loaded',
  loading: 'Loading',
  partial: 'Some tiles failed',
  error: 'Unavailable',
  off: 'Off',
};

/**
 * A thin top bar: logo, the region in view (USGS chart quadrangle), search and settings.
 */
export default function TopBar({
  map,
  search,
  statuses,
}: {
  map: L.Map;
  search: ReactNode;
  statuses: StatusItem[];
}) {
  const [centre, setCentre] = useState(() => map.getCenter());
  useEffect(() => {
    const update = () => setCentre(map.getCenter());
    map.on('moveend', update);
    return () => {
      map.off('moveend', update);
    };
  }, [map]);
  const quad = quadrangleAt(centre.lat, centre.lng);
  const problem = statuses.some((s) => s.status === 'error' || s.status === 'partial');

  return (
    <header className="bt-top">
      <span className="bt-top__mark">BEYOND TERRA</span>
      <ViewSwitch />
      <span className="bt-top__region" title={`USGS Mars chart ${quad.code}, the region at the centre of the view`}>
        {quad.name}
        <span className="bt-top__code">{quad.code}</span>
      </span>
      <div className="bt-top__search">{search}</div>
      <Settings statuses={statuses} problem={problem} />
    </header>
  );
}

function Settings({ statuses, problem }: { statuses: StatusItem[]; problem: boolean }) {
  const settings = useDisplaySettings();
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

  const set = (patch: Partial<typeof settings>) => displaySettingsStore.set({ ...settings, ...patch });

  return (
    <div className="bt-top__settings" ref={root}>
      <button type="button" className="bt-iconbtn" aria-label="Settings" aria-expanded={open} title="Settings" onClick={() => setOpen((o) => !o)}>
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <path d="M3 6h9M15 6h2M3 14h2M8 14h9" />
          <circle cx="13.5" cy="6" r="1.6" />
          <circle cx="6.5" cy="14" r="1.6" />
        </svg>
        {problem && <span className="bt-iconbtn__flag" aria-label="A data source is unavailable" />}
      </button>
      {open && (
        <div className="bt-menu" role="dialog" aria-label="Settings">
          <fieldset>
            <legend>Longitude</legend>
            <Choice name="lon" value="east-360" current={settings.longitude} label="0–360° E" onPick={() => set({ longitude: 'east-360' })} />
            <Choice name="lon" value="east-180" current={settings.longitude} label="±180° E" onPick={() => set({ longitude: 'east-180' })} />
          </fieldset>
          <fieldset>
            <legend>Elevation</legend>
            <Choice name="elev" value="km" current={settings.elevationUnit} label="Kilometres" onPick={() => set({ elevationUnit: 'km' })} />
            <Choice name="elev" value="m" current={settings.elevationUnit} label="Metres" onPick={() => set({ elevationUnit: 'm' })} />
          </fieldset>
          <p className="bt-menu__label">Data</p>
          <ul className="bt-menu__status">
            {statuses.map((s) => (
              <li key={s.label} className={`bt-status bt-status--${s.status}`} title={s.detail}>
                <span className="bt-status__dot" aria-hidden="true" />
                {s.label}
                <span className="bt-status__word">{STATUS_WORD[s.status]}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function Choice({ name, value, current, label, onPick }: { name: string; value: string; current: string; label: string; onPick(): void }) {
  return (
    <label className="bt-choice">
      <input type="radio" name={name} value={value} checked={current === value} onChange={onPick} />
      <span>{label}</span>
    </label>
  );
}
