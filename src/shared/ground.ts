import { createStore, useStore } from './store';
import type { MarsCoordinate } from './types';

/**
 * Opening Ground Perspective (NASA rover photographs near a place) from any view. The viewer
 * only reads this request: opening or closing it never changes the selected location, the
 * mission plan or anything else.
 */
export type GroundPerspectiveContext = 'map-point' | 'landmark' | 'start' | 'destination' | 'checkpoint' | 'custom';

export interface GroundPerspectiveRequest {
  coordinate: MarsCoordinate;
  /** Place name, when the place has one. */
  name?: string;
  /** Where the place comes from, shown in the viewer ("Mission start", "Landmark"…). */
  context: GroundPerspectiveContext;
  /** e.g. "Waypoint 2" */
  contextLabel?: string;
}

export const groundPerspectiveStore = createStore<GroundPerspectiveRequest | null>(null);

export function openGroundPerspective(request: GroundPerspectiveRequest) {
  groundPerspectiveStore.set({ ...request, coordinate: { ...request.coordinate } });
}

export function closeGroundPerspective() {
  groundPerspectiveStore.set(null);
}

export function useGroundPerspectiveRequest(): GroundPerspectiveRequest | null {
  return useStore(groundPerspectiveStore);
}
