import { useEffect } from 'react';
import { useMarsMap } from '../../map/MarsMapContext';
import { createLeafletBridge } from './leafletBridge';
import { mapBridgeStore, selectedLocationStore } from './mapBridgeStore';

declare global {
  interface Window {
    /** Development only: the map bridge, for testing in the console. */
    __beyondTerraMapBridge?: unknown;
  }
}

/**
 * Rendered inside <MarsMap>: publishes the map to the feature modules through
 * mapBridgeStore, and records map clicks as the selected location.
 */
export default function MapBridgeProvider() {
  const { map } = useMarsMap();

  useEffect(() => {
    const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    const bridge = createLeafletBridge(map, { reducedMotion });
    const stopSelect = bridge.onLocationSelect((location) => selectedLocationStore.set(location));
    mapBridgeStore.set(bridge);
    if (import.meta.env.DEV) window.__beyondTerraMapBridge = bridge;
    return () => {
      stopSelect();
      mapBridgeStore.set(null);
      bridge.destroy();
      if (import.meta.env.DEV) delete window.__beyondTerraMapBridge;
    };
  }, [map]);

  return null;
}
