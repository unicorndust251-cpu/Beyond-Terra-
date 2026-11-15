import { useEffect } from 'react';
import { selectedLocationStore, useMapBridge } from '../shared';
import { formatLandmarkCoordinates, landmarkById, landmarkCoordinate, useSelectedLandmark } from '../shared/landmarks';
import './explore.css';

interface Props {
  /** The landmark globe has been opened before (the button then reads Back to Globe). */
  visitedGlobe: boolean;
  onOpenGlobe: () => void;
}

/**
 * Over the Mars Trek map: the way into the landmark globe, and the selected landmark's
 * orange pin. Clicking the pin selects the landmark's STORED catalogue coordinate (looked up
 * by ID), never the clicked pixel; the pin owns its click, so the map's own click handler
 * does not also fire. The mission planner then offers Set as Start / Destination / Checkpoint.
 */
export default function MapReturnBar({ visitedGlobe, onOpenGlobe }: Props) {
  const landmark = useSelectedLandmark();
  const bridge = useMapBridge();

  // A different landmark chosen on the globe replaces an earlier landmark selection
  useEffect(() => {
    const current = selectedLocationStore.get();
    if (current?.source === 'landmark' && current.landmarkId !== landmark?.id) selectedLocationStore.set(null);
  }, [landmark]);

  useEffect(() => {
    if (!bridge || !landmark) return undefined;
    const id = landmark.id;
    const handle = bridge.addMarker('ex:landmark', landmarkCoordinate(landmark), {
      color: '#FF8A3D',
      symbol: '◆',
      label: `${landmark.name} · select to use in the mission plan`,
      onClick: () => {
        const l = landmarkById(id);
        if (!l) return;
        selectedLocationStore.set({ coordinate: landmarkCoordinate(l), name: l.name, source: 'landmark', landmarkId: l.id });
      },
    });
    return () => handle.remove();
  }, [bridge, landmark]);

  return (
    <div className="ex-return" role="region" aria-label="Landmark globe">
      {landmark && (
        <span className="ex-return__place" title="Landmark selected on the globe">
          <span aria-hidden="true">◆</span> {landmark.name} · {formatLandmarkCoordinates(landmark)}
        </span>
      )}
      <button type="button" className="ex-return__back" onClick={onOpenGlobe}>
        {visitedGlobe ? (
          <>
            <span aria-hidden="true">←</span> Back to Globe
          </>
        ) : (
          'Explore Landmarks'
        )}
      </button>
    </div>
  );
}
