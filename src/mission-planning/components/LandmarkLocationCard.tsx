import { useEffect, useState } from 'react';
import { openGroundPerspective, type SelectedLocation } from '../../shared';
import { formatLatitude, formatLongitude } from '../geo';

export type LandmarkRole = 'start' | 'destination' | 'checkpoint';

interface Props {
  /** A landmark selected by its marker: the catalogue's stored coordinate. */
  selection: SelectedLocation;
  onAssign: (role: LandmarkRole) => void;
}

const DONE: Record<LandmarkRole, string> = {
  start: 'Set as Start',
  destination: 'Set as Destination',
  checkpoint: 'Added as a checkpoint',
};

/**
 * Mission roles for a landmark picked from its map marker. The coordinate shown and used is
 * the one in the selection, which the marker takes from the landmark catalogue, so it is
 * exactly the stored value, not the point under the cursor.
 */
export default function LandmarkLocationCard({ selection, onAssign }: Props) {
  const [hidden, setHidden] = useState(false);
  const [done, setDone] = useState<LandmarkRole | null>(null);

  // A new landmark click shows the card again
  useEffect(() => {
    setHidden(false);
    setDone(null);
  }, [selection]);

  // After a role is assigned, the confirmation shows briefly and the card gets out of the way
  useEffect(() => {
    if (!done) return undefined;
    const t = window.setTimeout(() => setHidden(true), 2500);
    return () => window.clearTimeout(t);
  }, [done]);

  if (hidden) return null;
  const c = selection.coordinate;
  const assign = (role: LandmarkRole) => {
    onAssign(role);
    setDone(role);
  };

  return (
    <section className="mp-lmk" aria-label={`Use ${selection.name ?? 'this landmark'} in the mission plan`}>
      <header className="mp-lmk__head">
        <div>
          <p className="mp-lmk__eyebrow">Landmark</p>
          <h3>{selection.name}</h3>
          <p className="mp-lmk__coords mp-num">
            {formatLatitude(c, 2)}, {formatLongitude(c, 2)}
          </p>
        </div>
        <button type="button" className="mp-icon-btn" aria-label="Close" onClick={() => setHidden(true)}>
          ×
        </button>
      </header>
      <div className="mp-lmk__actions">
        <button type="button" className="mp-btn mp-btn--small mp-btn--accent" onClick={() => assign('start')}>
          Set as Start
        </button>
        <button type="button" className="mp-btn mp-btn--small" onClick={() => assign('destination')}>
          Set as Destination
        </button>
        <button type="button" className="mp-btn mp-btn--small" onClick={() => assign('checkpoint')}>
          Add as Checkpoint
        </button>
      </div>
      <button
        type="button"
        className="mp-link mp-lmk__ground"
        onClick={() => openGroundPerspective({ coordinate: c, name: selection.name, context: 'landmark' })}
      >
        Ground Perspective · NASA rover photographs
      </button>
      <p className="mp-lmk__note" role="status">
        {done ? `${DONE[done]}: ${selection.name}, using its stored reference coordinates.` : 'Uses the stored reference coordinates of the feature centre.'}
      </p>
    </section>
  );
}
