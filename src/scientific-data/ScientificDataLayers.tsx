import TerrainInspector from './TerrainInspector';

/**
 * Scientific data's entry point, rendered inside the map (see components/MarsMapWithFeatures).
 * Dataset adapters, scientific layers, terrain sampling and hazards are built from here.
 *
 * Use the map through `useMapBridge()` (e.g. `addTrekLayer`) and the visitor's picks
 * through `useSelectedLocation()`, both from `../shared`. Describe every dataset with a
 * `ScientificDataset`, limitations included. Do not import from `../mission-planning`.
 *
 * Built so far: terrain inspection (TerrainInspector) — elevation, slope, relief, MOLA shot
 * coverage and mapped geology at any point, from numerical datasets only.
 */
export default function ScientificDataLayers() {
  return <TerrainInspector />;
}
