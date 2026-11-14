/**
 * Shared foundation: types, coordinate conventions and the map contract. The only module
 * that both mission-planning and scientific-data may import.
 */
export * from './types';
export * from './coordinates';
export * from './store';
export type * from './map/MarsMapBridge';
export { mapBridgeStore, selectedLocationStore, useMapBridge, useSelectedLocation } from './map/mapBridgeStore';
