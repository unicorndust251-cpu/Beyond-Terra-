# Route planner (owner: Hajra)

The route planner and mission loadout, shown as a panel beside the Mars Trek map.

- **Entry point:** `MissionPlanningLayer.tsx`, mounted inside the map by `src/components/MarsMapWithFeatures.tsx`.
- **Map access:** only through `src/shared` (`useMapBridge`, `useSelectedLocation`). Nothing is imported from `src/scientific-data`, so the planner works without elevation, terrain or hazard layers.

| File | Contents |
| --- | --- |
| `model.ts` | Mission state, actions, and every calculation: route metrics, travel time, mass, duration |
| `geo.ts` | Haversine distance (R = 3389.5 km), coordinate parsing and formatting (longitude 0–360° E) |
| `data/landmarks.ts` | 26 IAU/USGS Gazetteer feature centres, reused from the earlier verified list |
| `data/science.ts` | Equipment, tasks and objectives |
| `useMapSync.ts` | Draws stops and the route on the map (`mp:` overlay ids) |
| `components/` | The panel and its sections |

## Assumptions (all shown as such in the interface)

- **Distances:** straight-line great-circle estimates. Not terrain-following, and no safety or traversability claim.
- **Speeds:** walking 2 km/h and rover 8 km/h by default. Both are editable planning assumptions.
- **Equipment masses and task times:** example assumptions, not NASA specifications. Masses are editable. "Concept" items are not existing EVA hardware.
- **Suit:** profiles are conceptual and change no calculation. No suit mass is included unless the user states one as an assumption.
- **Crew mass split:** carried mass is shared evenly between the crew.
- **Mission duration:** travel time plus assigned task times, in sequence. Compared with the user's available time as a budget check only.
- **Weight on Mars:** mass × 3.71 m/s² (NASA Mars Fact Sheet). Shown separately from mass.

## Later, once scientific data is ready

When `src/shared` gains terrain or hazard stores, read them here, for example to flag segments crossing hazards. Never import from `src/scientific-data` directly.
