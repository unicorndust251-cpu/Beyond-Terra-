import { createStore, useStore } from '../store';
import type { SelectedLocation } from '../types';
import type { MarsMapBridge } from './MarsMapBridge';

/**
 * How the modules exchange information:
 * - `mapBridgeStore` holds the map (null until the map is ready, and again after it goes).
 * - `selectedLocationStore` holds the location the visitor last picked. Map clicks set it;
 *   either module may also set it (e.g. choosing a site from a list). Both can react to it.
 * Mission planning and scientific data never import each other; they meet only here.
 */
export const mapBridgeStore = createStore<MarsMapBridge | null>(null);
export const selectedLocationStore = createStore<SelectedLocation | null>(null);

/** The map, or null while it is not ready. */
export function useMapBridge(): MarsMapBridge | null {
  return useStore(mapBridgeStore);
}

export function useSelectedLocation(): SelectedLocation | null {
  return useStore(selectedLocationStore);
}
