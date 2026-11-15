# Beyond Terra: module architecture

Two developers build features in parallel: **mission planning** and **scientific data**. Each works in their own folder, and the two meet only through `src/shared`.

## Modules and ownership

| Folder | Owner | Owns |
| --- | --- | --- |
| `src/mission-planning/` | Mission planning | Routes, checkpoints, equipment selection, mission state |
| `src/scientific-data/` | Scientific mapping | Dataset adapters, scientific layers, terrain sampling, hazards |
| `src/shared/` | Both (changes reviewed by both) | Common types, coordinate conventions, the map contract, shared stores |
| `src/ground/` | Ground Perspective | NASA rover photograph catalogue, location matching and viewer; opened through `openGroundPerspective()` in `src/shared/ground.ts` |
| `src/map/` | Shared (do not change for one feature) | The Mars Trek map itself (Leaflet + NASA Trek tiles) |
| `src/intro/`, `src/three/`, `src/pages/`, `src/components/` | Unchanged by either feature | Astronaut intro, globe, zoom into the map |

**Rules**
- `mission-planning` never imports `scientific-data`, and the reverse. `shared` imports neither. `npm run typecheck` enforces this (`scripts/check-boundaries.mjs`).
- Features use the map only through `MarsMapBridge` (`useMapBridge()`), never Leaflet directly.
- Each module has one entry component mounted inside the map, in `src/components/MarsMapWithFeatures.tsx`:
  - `MissionPlanningLayer` (`src/mission-planning/MissionPlanningLayer.tsx`)
  - `ScientificDataLayers` (`src/scientific-data/ScientificDataLayers.tsx`)

  Build from these, and neither developer needs to edit the same file.
- Changing `src/shared/types.ts` or the bridge affects both modules. Make it a small, separate pull request that both developers review.

## How the modules exchange information

```
            map click                         setters / hooks
  MarsMap ─────────────► selectedLocationStore ◄─────────────► mission-planning
     ▲                                          ◄─────────────► scientific-data
     │ MarsMapBridge (useMapBridge)
     └──────────── markers, routes, Trek layers, camera ◄──── both modules
```

- **`selectedLocationStore`** (`useSelectedLocation()`): the location the visitor last picked, as a `SelectedLocation`.
  - Map clicks set it automatically (`source: 'map-click'`).
  - Either module may set it too, for example when choosing a site from a list.
- **`mapBridgeStore`** (`useMapBridge()`): the map, or `null` while it is not ready. Every drawing call returns a handle with `remove()`. Prefix overlay ids with your module (`mp:`, `sd:`) so the two never replace each other's overlays.
- **Data handed across:** scientific data produces `TerrainSample`, `HazardObservation` and `ScientificDataset`; mission planning reads them to check routes. For a new exchange, add a store next to `selectedLocationStore` in shared. For example, a `hazardsStore` that scientific data writes and mission planning reads. Never import across.

## Coordinate conventions

All shared data uses `MarsCoordinate`:
- **Latitude:** planetocentric, degrees, −90…90, north positive.
- **Longitude:** east-positive, degrees, normalised to −180…180.
- **Body:** the IAU 2000 Mars sphere, radius 3,396,190 m.

This is the frame NASA Mars Trek's tiles use (IAU2000:49900), so coordinates go to and from the map unchanged.

Conversions are in `src/shared/coordinates.ts`:

| From | Function | Notes |
| --- | --- | --- |
| East longitude 0…360 (MOLA, many PDS products) | `fromEast360`, `toEast360` | |
| West-positive longitude (older USGS/IAU maps) | `fromWestPositive` | east = −west |
| Planetographic latitude | `fromPlanetographicLatitude`, `toPlanetographicLatitude` | IAU 2000 ellipsoid (3,396.19 × 3,376.20 km). tan φc = (b/a)² tan φg. Up to about 0.34° (≈ 20 km) difference at mid-latitudes |
| The map's wrapped longitudes (beyond ±180 after panning round) | `fromMapLatLng`, `toMapLatLng` | `toMapLatLng(c, near)` picks the copy nearest a reference, so lines take the short way |
| Distance | `greatCircleDistanceM` | Haversine on the sphere. Ignores terrain and the ellipsoid |

Elevations in `TerrainSample` are relative to the MOLA areoid, in metres, when a source provides them.

## The map: what it is and what it can do

**Integration method:** native. `src/map` is a Leaflet map that draws NASA Mars Trek's published WMTS image tiles (`https://trek.nasa.gov/tiles/Mars/EQ/<product>/1.0.0/…`).

It is not an iframe. NASA's Mars Trek app and its Trek Lite embed both send `Content-Security-Policy: frame-ancestors 'self' aelp.smartsparrow.com`, so browsers refuse to frame them on other sites. It is not a NASA JavaScript map API either: Trek's documented API is the tile service only.

Because the map is our own code, the site controls it fully. These were tested live through `MarsMapBridge` (Chrome, development build):

| Capability | Result |
| --- | --- |
| Read clicked coordinates | Works. A click at the map centre returned the view centre to 0.001°. It also lands in `selectedLocationStore` |
| Move the camera | Works. `flyTo` Gale Crater (−5.4°, 137.8°E, zoom 7) arrived exactly |
| Custom markers | Works, with labels and click actions. A marker click does not also count as a map click |
| Routes | Works. Polylines in travel order, drawn the short way across ±180° |
| Custom scientific layers | Works for any Trek WMTS product. Tested with `Mars_MGS_MOLA_ClrShade_merge_global_463m`: 25/25 tiles loaded |
| Inspect selected terrain (elevation, slope) | Works, from numerical data bundled with the site, not from Trek. See below |

**Terrain values.** Trek publishes images of the terrain (for example the MOLA colour hillshade), not elevation values. Its documented API has no elevation or height query, and reading elevation from image colours would be inaccurate. Terrain values therefore come from numeric rasters, preprocessed into `public/data` by the scripts in `scripts/`:
- **MOLA MEGDR** (global, 3.7 km bins), with its per-bin shot counts;
- **the USGS Jezero CTX DTM** (20 m, western Jezero);
- **the USGS Geologic Map of Mars**, SIM 3292 (mapped units).

`src/scientific-data/terrain.ts` (`inspectTerrain`) produces `TerrainSample` records from them, relative to the MOLA areoid. Each reading has an explicit status: available, unavailable, not mapped, outside coverage or not assessed. They are not yet published to a shared store. Add one (for example `terrainSampleStore`) when mission planning needs them.

**Other limitations to state in the interface:**
- Imagery outside the regional CTX/HiRISE mosaics is the global Viking mosaic (about 232 m per pixel).
- Tile availability depends on NASA's servers and the visitor's connection.
