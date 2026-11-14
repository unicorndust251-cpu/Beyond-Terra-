import { forwardRef } from 'react';
import MarsMap, { type MarsMapHandle, type MarsMapProps } from '../map/MarsMap';
import MapBridgeProvider from '../shared/map/MapBridgeProvider';
import { MissionPlanningLayer } from '../mission-planning';
import { ScientificDataLayers } from '../scientific-data';
import ScienceLayers from '../science/ScienceLayers';

/**
 * The Mars Trek map with the feature modules mounted inside it. Each module has its own
 * slot here, so the two developers never need to edit the same file to add features.
 * Loaded lazily (with Leaflet) after the intro.
 */
const MarsMapWithFeatures = forwardRef<MarsMapHandle, Omit<MarsMapProps, 'children'>>(
  function MarsMapWithFeatures(props, ref) {
    return (
      <MarsMap ref={ref} {...props}>
        <MapBridgeProvider />
        <ScientificDataLayers />
        <MissionPlanningLayer />
        <ScienceLayers />
      </MarsMap>
    );
  },
);

export default MarsMapWithFeatures;
