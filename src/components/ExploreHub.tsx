import { useState } from 'react';
import { useUiMode } from '../shared';
import { formatLandmarkCoordinates, useSelectedLandmark, type Landmark } from '../shared/landmarks';
import './ExploreHub.css';

interface Props {
  /** The globe has been opened before (the button then reads Back to Globe). */
  visitedGlobe: boolean;
  onOpenGlobe(): void;
  onPlanHere(l: Landmark): void;
}

/**
 * Explore Mars, on the map: the three ways to choose a place (search, the map, the landmark
 * globe) and, once a landmark is chosen, a way to start planning there. Collapsible, so the
 * map stays clear.
 */
export default function ExploreHub({ visitedGlobe, onOpenGlobe, onPlanHere }: Props) {
  const landmark = useSelectedLandmark();
  const simple = useUiMode() === 'simple';
  const [open, setOpen] = useState(true);
  return (
    <aside className={`bt-hub${open ? '' : ' is-collapsed'}`} aria-label="Explore Mars">
      <header className="bt-hub__head">
        <h2>Explore Mars</h2>
        <button type="button" className="bt-hub__toggle" aria-expanded={open} aria-label={open ? 'Minimise Explore Mars' : 'Expand Explore Mars'} onClick={() => setOpen((o) => !o)}>
          <svg viewBox="0 0 20 20" aria-hidden="true">
            <path d={open ? 'm6 12 4-4 4 4' : 'm6 8 4 4 4-4'} />
          </svg>
        </button>
      </header>
      {open && (
        <>
          <p className="bt-hub__lead">Choose a place to explore: search above, click the map, or pick one of 46 landmarks on the 3D globe.</p>
          <button type="button" className="bt-hub__btn" onClick={onOpenGlobe}>
            {visitedGlobe ? '← Back to the landmark globe' : 'Explore Landmarks'}
          </button>
          {landmark && (
            <div className="bt-hub__sel">
              <p className="bt-hub__name">
                <span aria-hidden="true">◆</span> {landmark.name}
              </p>
              {!simple && <p className="bt-hub__coords">{formatLandmarkCoordinates(landmark)}</p>}
              <p className="bt-hub__text">{landmark.importance}</p>
              <button type="button" className="bt-hub__btn bt-hub__btn--ghost" onClick={() => onPlanHere(landmark)}>
                Plan Mission Here
              </button>
            </div>
          )}
          <p className="bt-hub__tip">Map layers (terrain, geology, elevation) are under Layers, top left.</p>
        </>
      )}
    </aside>
  );
}
