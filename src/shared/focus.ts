import { landmarkById, landmarkCoordinate, selectedLandmarkStore } from './landmarks';
import { selectedLocationStore } from './map/mapBridgeStore';
import { createStore, useStore } from './store';
import type { SelectedLocation } from './types';

/**
 * The place currently being inspected, whichever way it was chosen: a landmark on the
 * globe (selectedLandmarkStore) or a point, marker, search result or mission stop on the
 * map (selectedLocationStore). It follows the most recent of the two, so there is one
 * answer to "which location?" without a third copy of the selection. A landmark always
 * carries its exact catalogue coordinates.
 */
export const focusedLocationStore = createStore<SelectedLocation | null>(null);

function fromLandmark(id: string | null): SelectedLocation | null {
  const l = landmarkById(id);
  return l ? { coordinate: landmarkCoordinate(l), name: l.name, source: 'landmark', landmarkId: l.id } : null;
}

selectedLandmarkStore.subscribe(() => {
  const next = fromLandmark(selectedLandmarkStore.get());
  if (next) focusedLocationStore.set(next);
});
selectedLocationStore.subscribe(() => {
  const next = selectedLocationStore.get();
  if (next) focusedLocationStore.set(next);
});

export function useFocusedLocation(): SelectedLocation | null {
  return useStore(focusedLocationStore);
}
