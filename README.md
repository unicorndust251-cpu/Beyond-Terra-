# Beyond Terra

Beyond Terra is an interactive Mars exploration and mission-planning platform powered by NASA scientific data. It allows future astronauts to explore Martian terrain, analyze scientific layers, identify potential hazards, discover geological sites, and plan exploration routes—bridging the gap between robotic discoveries and human exploration.

This build has the globe and, below it, the NASA Mars Trek map:

1. **The astronaut opening.** Through an astronaut's eyes on Mars, a field tablet swings up and wakes with Beyond Terra on it, and the camera moves into the screen until the screen *is* the website.
2. **The globe.** A full-screen, slowly rotating 3D Mars with BEYOND TERRA across it. It stays for as long as the visitor likes; nothing redirects.
3. **The Mars Trek map.** About 2.5 s after the globe settles, the camera zooms into Mars and lands on a full-screen map drawn from NASA Mars Trek's imagery (see below).

Built with React 18, TypeScript, Three.js and GSAP, bundled with Vite.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
npm run typecheck
npm run build      # production build in dist/ (static: deploys to Vercel or Netlify as is)
```

The opening plays every time the site is opened or reloaded. Add `?nointro` to the URL to leave it out.

## The opening, beat by beat

| Time | Beat |
| --- | --- |
| 0.0–3.2 s | Three-quarter shot of the astronaut's upper body and helmet; the astronaut looks out over the plain with a gentle head turn, the visor reflecting the landscape |
| 3.0–4.6 s | The astronaut raises the tablet and looks down at it; the screen wakes |
| 4.5–8.5 s | On the tablet, the original four-second reveal: Mars rises out of darkness, the camera pushes in, BEYOND TERRA fades up and sharpens |
| 5.0–9.6 s | The camera moves round over the right shoulder onto the screen; the astronaut and then the bezel leave the frame |
| 9.6 s | Handoff: the screen exactly fills the viewport, and the same image is now drawn full-screen |
| 9.95–10.45 s | The intro dissolves onto the identical globe, which holds for 2.5 s and then zooms into the Mars Trek map |

The intro always plays through; there is no skip. If it cannot load, hits an error or is still running after 25 s, the site appears anyway.

### The globe reveal

On a visit that does not play the astronaut opening (later in the session, or with `?nointro`), the homepage plays the same four-second reveal full-screen: light rising on the planet (0–1.5 s), a push-in that settles by 4 s, and the title fading in, rising and sharpening (1.5–2.3 s). The choreography lives in one place, `src/three/heroReveal.ts`, so the tablet and the full-screen page always match.

### How the handoff stays seamless

The rotating Mars and the BEYOND TERRA title are one reusable scene, `MarsHero` (`src/three/marsHero.ts`). Every view of it renders into a linear, high-precision render target and reaches the screen through the same final pass:

- the tablet's screen samples that render target, unlit and without tone mapping;
- the full-screen intro and the homepage draw the same render target to the canvas;
- all copies share one clock (`performance.now()`), seeded stars and the same pixel ratio, so every copy of Mars shows the same rotation. The planet never restarts.

The tablet's screen always has the viewport's aspect ratio, and the raised tablet faces the astronaut's eyes square-on. The camera's final move is a straight lean along the screen's normal, ending at the distance where the screen fills the frame exactly. At that frame the tablet and the full-screen view are the same pixels, so the handoff is invisible. Measured in headless Chrome: the last tablet frame and the first full-screen frame differ by 1.03/255 on average, less than two consecutive full-screen frames do (1.26/255, from the planet's rotation between captures).

## The astronaut

The opening has two versions, chosen automatically:

**1. Third person, with an astronaut model (the intended opening).** Put a rigged astronaut at `public/models/astronaut.glb`, and the intro plays:
- a three-quarter shot of the astronaut looking out over the plain, with a gentle head turn and breathing;
- the astronaut raising the tablet in both hands while looking down at it, as Beyond Terra wakes on the screen;
- the camera moving round over the right shoulder onto the screen until it fills the viewport, where the website takes over exactly as before.

This lives in `src/intro/scene/astronautRig.ts`, `thirdPersonScene.ts` and `createThirdPersonTimeline` in `timeline.ts`.

**2. The built-in suit (default).** With no model, or one that cannot be used, the same sequence plays with the suit modelled in code (`astronaut.ts`, shown via `proceduralAstronaut.ts`), holding the tablet in its gloved hands.

### What the model needs

- **Format:** glTF binary (`.glb`). Draco and Meshopt compression are supported. Aim for a few MB and under about 100k triangles, with PBR textures at 2k.
- **Rig:** a humanoid skeleton. Bones are found by name, so Mixamo, Unreal-style and most marketplace rigs work as they are. The model needs a head and, on both sides, upper arm, forearm and hand bones; neck and chest bones are optional. If a bone is missing, the intro uses the fallback; in development the console says which bone.
- **Orientation and scale:** any. The model is turned to face the camera using its own shoulders, and scaled to 1.88 m.
- **Licence:** web distribution must be allowed. Check the licence before adding a model.

### How the model is posed

- The arms are posed with two-bone IK onto the tablet's grips, so they follow it as it rises.
- The head and neck turn and tilt, and the chest breathes.
- Fingers are left as the model provides them. A model whose rest pose has gloved hands relaxed or gripping looks right; one with flat, open hands will hold the tablet with open hands.
- The visor reflects the actual landscape (an environment map captured from the astronaut's head).
- In the last moments of the camera move, when the screen already fills the view, the figure is hidden, so no part of a hand can ever cross the screen at the handoff.

## Fallbacks and accessibility

- **Reduced motion:** the intro does not play; the globe shows its final composition at once, as a still planet.
- **No WebGL:** the intro does not play; the homepage shows a CSS planet drawn from the same texture, with the title in HTML.
- **Slow loading:** the intro gives up after 9 s and the site appears. The intro's code is a separate chunk, so the website never waits for it.
- **Lost WebGL context or a crash in the intro:** the intro hands over to the site immediately.
- **Timing on slow devices:** the timeline follows the wall clock, not frame count.
- **Keyboard and screen readers:** the homepage is `inert` and `aria-hidden` while the intro covers it. The title is drawn in WebGL, so the page also has a visually hidden `<h1>`.

## Where things live

```
src/
  App.tsx                     Intro gating, handoff between intro and globe
  three/
    marsHero.ts               The original hero: Mars, atmosphere rim, stars, title, reveal state
    heroReveal.ts             The four-second reveal choreography (shared by tablet and homepage)
    assets.ts                 Texture and font loading, WebGL check, device tier, shared clock
    renderSettings.ts         Renderer and pixel ratio shared by intro and homepage
  intro/
    AstronautIntro.tsx        The cinematic opening (overlay component)
    timeline.ts               GSAP timeline and timing
    introGate.ts              When the intro plays: ?nointro, reduced motion, WebGL
    scene/
      thirdPersonScene.ts     Scene assembly, camera path, tablet poses
      astronautRig.ts         Loads and poses a supplied rigged model
      proceduralAstronaut.ts  The built-in suit, used when no model is supplied
      environment.ts          Terrain, sky, rocks, dust, lighting
      astronaut.ts            Suit silhouette from primitives (casts the shadow only)
      tablet.ts               Rugged field tablet
      textures.ts, noise.ts   Procedural regolith normal map, seeded noise
  map/                        NASA Mars Trek map (Leaflet + Trek WMTS tiles), from nasa-mars-walk
  science/                    Scientific layers: MOLA elevation and slope, Trek relief, layer panel, legend
    molaDem.ts                MEGDR tile loading, decoding, bin sampling and slope
    layers.ts                 Canvas layers for elevation/slope, Trek relief layer, map panes
    colorScales.ts            Colour lookup tables shared by the tiles and the legend
    datasets.ts               The exact products, access, CRS and licensing
    ScienceLayers.tsx         Layer panel, legend and readout
  scientific-data/            Terrain inspection (owner: scientific mapping; see docs/ARCHITECTURE.md)
    terrain.ts                Point sampling: MOLA MEGDR, Jezero CTX DTM, geologic map; reading statuses
    datasets.ts               The datasets as shared ScientificDataset records, limitations included
    anchors.ts                Reference points: Jezero region (IAU Gazetteer, NASA) and other regions
    coordinateInput.ts        Manual coordinate entry and conventions
    TerrainInspector.tsx      The inspection panel
  components/
    MarsTrekSection.tsx       Full-screen map layer under the globe; reveals and descends on cue
    MarsBackdrop.tsx          The homepage's rotating Mars with the title (works without the intro)
  pages/
    HomePage.tsx              The page: Mars, BEYOND TERRA, credits
public/
  textures/                   Mars colour maps (4k; 6k upgrade for large screens; 2k fallback), relief map (2k)
  fonts/                      Exo 2, self-hosted Latin subset
  data/mola/                  MOLA MEGDR elevation and shot-count tiles (scripts/prepare-mola.mjs)
  data/jezero-ctx-dtm/        Jezero CTX DTM, 20 m (scripts/prepare-jezero-dtm.mjs)
  data/geology/               Geologic Map of Mars units, 32 px/deg lookup (scripts/prepare-geology.mjs)
scripts/
  prepare-mola.mjs            PDS MEGDR (MEGT elevation, MEGC counts) → browser tiles, driven by the PDS label
  prepare-jezero-dtm.mjs      USGS Jezero CTX DTM GeoTIFF → one tile, checking its georeferencing
  prepare-geology.mjs         USGS SIM 3292 unit polygons → unit lookup tiles
  check-boundaries.mjs        Module boundary check (run by npm run typecheck)
```

For testing, `?introDebug` stops the intro from playing and exposes `window.__beyondTerraIntro.seek(seconds)` for frame-by-frame inspection.

### Why plain Three.js and not React Three Fiber

The 3D scenes are imperative Three.js classes owned by React components, which create and dispose them. The seamless handoff depends on precise control of render targets, render order and a shared clock across two WebGL contexts; React Three Fiber would add a reconciler and its own render loop without changing a pixel. Migrating is possible later if new 3D views benefit from it.

## The Mars Trek map

**Why it is not an iframe of Mars Trek.** NASA's Mars Trek app (`trek.nasa.gov/mars/`) and the Trek Lite page that its Share → Embed option generates both send `Content-Security-Policy: frame-ancestors 'self' aelp.smartsparrow.com`. Browsers therefore refuse to show them inside any other site; tested from this site, Chrome blocks both.

**What it is instead.** The map module from the earlier Beyond Terra project (`nasa-mars-walk/src/map`), copied into `src/map` unchanged except for its UI font (Manrope). It is a Leaflet map that loads NASA Mars Trek's published WMTS tiles from `https://trek.nasa.gov/tiles/Mars/EQ/...` (Viking MDIM 2.1 global colour mosaic, with sharper CTX and HiRISE regional mosaics fading in as you zoom). The imagery is NASA's own, untinted. Mars Trek's own app interface (layer menus, tools) is not included.

**From the globe into the map** (`src/App.tsx`, `src/components/MarsTrekSection.tsx`):
- The map is mounted full-screen underneath the globe as soon as the intro is done, out of focus and high above the planet, so its tiles load while the globe is on screen.
- Once the globe's final composition is in place, it holds for 2.5 s (`GLOBE_HOLD_MS`).
- The camera then pushes into Mars: the globe grows and dissolves (1.7 s, `.bt-home.is-zooming`). Meanwhile the map sharpens and descends from a whole-planet view onto Jezero Crater (2.8 s, using the map's own `reveal()`).
- The globe is then removed, so its WebGL rendering stops. The map stays, full screen and interactive.
- With reduced motion, the globe simply fades and the map appears in place.
- If the map's code cannot load, the map area shows a message with a Reload button instead of breaking the page.

## Map workspace

Less interface, more Mars. The map fills the screen and shows only a thin top bar, a **Layers** button and the map controls. Everything else appears when asked for. Code: `src/science/workspace/`; tokens: `src/map/map.css`.

- **Top bar:** the logo, the region in view (its USGS chart quadrangle, for example "Syrtis Major MC-13"), search and settings. The quadrangle lookup matches the quadrangle the Gazetteer records for 2,038 of 2,049 named features; the 11 exceptions lie exactly on a quadrangle edge.
- **Search** ("Explore locations on Mars…"): all 2,055 IAU-approved Mars names from the Gazetteer (`public/data/places/mars-places.json`, built by `scripts/prepare-places.mjs`, loaded on first use); NASA rover sites (Perseverance and Curiosity landing points and latest published positions, from NASA's waypoint feeds); and typed coordinates such as `18.44, 77.45`, `5.37 S 137.81 E` or `-14, 301`. A result flies the map there and opens the location card.
- **Layers:** one button opens a small menu: Surface (Standard Imagery), Terrain (Elevation, Topography, Slope), Science (Geological Information, Curvature Sites). Each row is a switch. The ⓘ button shows what the data is, its resolution and source, and opacity or intensity. An outside click or Escape closes the menu.
- **Location card:** appears when a place is clicked or found. It shows four lines: Location, Elevation (the best available model, above the MOLA areoid), Terrain (mapped geologic unit and slope) and Science (the datasets holding data there). **View detailed information** expands the full readings: local and regional elevation, slope and relief, MOLA shot coverage, geology, limits and sources. Missing values read "Data unavailable". The close button or Escape dismisses it.
- **Legend:** shown only while elevation, slope or geology is on.
- **Map controls:** zoom in, zoom out, recentre and fullscreen.
- **Settings:** longitude as east 0–360° or ±180°, elevation in km or m, and the status of each data source.

Palette: background `#111110`, panels `#1C1A19`, secondary `#25211F`, borders `#38312E`, text `#F3EAE4 / #AAA09A`, copper `#C58B70` for what is on or chosen. Type: Inter for the interface, IBM Plex Mono for coordinates and measurements.

The map opens on the NASA imagery. Elevation, slope and geology keep their own unchanged colour scales.

Not yet offered: Trek's catalogue also lists TES mineral and thermal-inertia maps. They are rendered images, and a verified colour key for reading them has not been found yet, so they are not shown as layers.

## Scientific layers

The **Layers** menu switches each layer; opacity (relief: intensity) is behind each layer's ⓘ. The map opens on the imagery; elevation, relief and slope are one switch away. The module lives in `src/science/`, attaches to the map through `useMarsMap()` and the shared map bridge, and does not depend on routes or any other feature.

| Layer | Exact product | Access | Grid | Coverage |
| --- | --- | --- | --- | --- |
| Surface Imagery | Trek `Mars_Viking_MDIM21_ClrMosaic_global_232m`, `Jezero_CTX_BlockAdj_dd`, `JEZ_hirise_soc_006_orthoMosaic_25cm_Eqc_latTs0_lon0_first_dd`; global CTX `CTX_beta01_uncontrolled_5m_Caltech` (Murray Lab beta01) | Mars Trek WMTS; the CTX mosaic is listed by Trek and served by Esri (`astro.arcgis.com/.../OnMars/CTX/MapServer`). All CORS open | Viking 326 m/px at Trek's deepest level; CTX global 5.1 m/px; Jezero CTX 10 m/px and HiRISE 0.32 m/px as delivered | Global + Jezero |
| Elevation | PDS `MGS-M-MOLA-5-MEGDR-L3-V1.0`: `MEGT90N000CB.IMG` (4 px/deg) and `MEGT90N000EB.IMG` (16 px/deg), product version 2.0 | Bundled (PDS sends no CORS headers) | 14.8 / 3.7 km per pixel at the equator | Global |
| Slope | Computed in the browser from the same MEGDR values | — | Native MEGDR bins | Global (pole rows excluded) |
| Relief Shading | Trek `Mars_MOLA_blend200ppx_HRSC_Shade_clon0dd_200mpp_lzw` (hillshade of the MOLA–HRSC blended DEM) | Mars Trek WMTS (CORS open), levels 0–8 | 200 m/px | Global |

Licensing: NASA and PDS data are public domain; credits are in the legend, the panel and below.

**Elevation.** Values are the MEGDR's own signed 16-bit integers: median MOLA topography per bin, in **metres above the MOLA areoid** (GMM3 / mgm1025 to degree and order 50; topography = planetary radius − areoid radius). Bins with no laser shots hold interpolated values, as the PDS label states. Nothing is read back from colours. The 4 px/deg product draws the whole-planet view (map zoom ≤ 2); the 16 px/deg product takes over from zoom 3, and the legend always names the product on screen. Hovering (or tapping) shows the native bin's elevation (km, to the metre) and slope.

The colour scale is the Beyond Terra palette, interpolated linearly in sRGB between value stops:

| km | −8 | −6 | −4 | −2 | 0 | +2 | +4 | +6 | +8 | +12 | +16 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| colour | `#49415E` | `#6679AD` | `#65BCD5` | `#75D4AE` | `#E5DB76` | `#E9AE70` | `#DF7C79` | `#CD919E` | `#B69A95` | `#CBC7C4` | `#F4F0EB` |

The lookup table has one entry per 10 m, so each stop is drawn as its exact hex value. The legend is a CSS gradient through the same stops at the same positions; note the wider +8 → +12 → +16 km steps. The MEGDR spans −8.18 to +21.17 km, so the deepest part of Hellas takes the −8 km colour and the summits above +16 km (Olympus, Ascraeus and Arsia Mons) take the +16 km colour. Two things to know about the palette: it is not perceptually uniform, and +6 km (`#CD919E`), +8 km (`#B69A95`) and +12 km (`#CBC7C4`) are close in lightness, so the readout is the reliable way to tell those heights apart.

**Slope** is computed per MEGDR bin with central differences and true horizontal distances on the product's sphere (R = 3396.0 km, from the label):

```
dx = R · cos(lat) · Δλ,   dy = R · Δφ          (Δλ = Δφ = 1/ppd degrees, in radians)
slopeDegrees = atan(√((dz/dx)² + (dz/dy)²)) × 180 / π
```

Slope depends on the baseline: at 16 px/deg it is measured over 7.4 km north–south, so it shows regional slopes (crater walls, scarps), not slopes at rover scale. It is drawn bin by bin, unsmoothed, with its own scale (inferno, 0–30°), and is never shown together with elevation. The two rows at the poles have no valid north/south neighbour and are left blank.

**Relief shading** comes from Trek's hillshade tiles. Trek publishes them only as rendered JPEGs, so they are used for shading, never for numbers. Each tile is remapped and blended with CSS `hard-light`:

```
t = 0.5 + 0.5 · intensity · (shade − flat) / flat        (clamped to 0…1)
```

`flat` = 181 is the product's value on level ground. It was measured as the median (and mode) over 214,117 pixels where the MEGDR slope is under 0.3°, in Amazonis, Utopia, Isidis, Arcadia and Acidalia; it equals 255 · sin 45°, a sun 45° high. Flat ground becomes t = 0.5, which hard light leaves unchanged, so the elevation colours stay exact there (measured: median 1/255 difference with relief on or off). At intensity 1, slopes are darkened or lightened by their true brightness relative to flat ground. The **Intensity** slider (0.25–3×) exaggerates or softens that, for visibility only. Relief adds no detail beyond Trek's DEM, and it is not a measure of steepness; that is the Slope layer.

Measured on screen (luminance standard deviation, 0–255, elevation at 100 %): Noctis Labyrinthus 4.2 with relief off, 61 at 1×, 88 at 3×; Jezero 3.3 off, 49 at 1×.

### Curvature investigation sites

The **Curvature** row in the Layers panel (off by default) shows 10 burgundy markers at places whose landforms suit a terrain-curvature study: Jezero, Gale, Mount Sharp, Olympus Mons, Elysium Mons, Valles Marineris, the Coprates HiRISE observation area (ESP_089134_1655), Hebes Chasma, Korolev and Moreux. The panel has a legend, a site search and a details card. The card covers coordinates as supplied, landform, shapes to investigate, context, published figures with their sources, terrain data, imagery, source and analysis status, plus **View location**. Data: `src/science/curvature/curvatureSites.ts`.

- **Markers are anchors, not measurements.** No curvature has been calculated, and every card says so: "Candidate location — curvature not yet calculated".
- **Approximate positions:** Hebes, Korolev and Moreux use approximate ESA positions and are labelled as such. Coprates is a HiRISE image centre.
- **Published figures** (Valles Marineris, Coprates, Hebes, Korolev, Moreux) were checked against the cited NASA, HiRISE, ESA and JGR sources. Each keeps its own reference surface: Korolev's ice thickness and Moreux's peak height are not crater depths. No Gale depth is given, because its cited source could not be checked.
- **A curvature raster** is possible only where a local elevation model exists: the 20 m Jezero CTX DTM. It was not drawn, because classification thresholds have to come from the DTM's vertical uncertainty, which is not published with the file. The other nine sites have only the 3.7 km MOLA grid, too coarse for walls, rims or dunes.

### Locations

The search box (autocomplete over names and categories; arrow keys, Enter, Escape) covers 15 reference locations in `src/science/locations.ts`. Picking one flies the map there through the shared bridge, sets a labelled pin, shows a card (name, category, coordinates, what the point is, source link) and publishes it to `selectedLocationStore` with source `search`. The view frames the feature's IAU extent. **Zoom closer** zooms in two levels on the location, and nothing pulls the map back afterwards.

The supplied coordinates (planetocentric, east longitude 0–360°) were checked on 2026-11-14. Each one equals the authoritative value rounded to the digits given:

- 14 named features against the IAU/USGS Gazetteer of Planetary Nomenclature (`MARS_nomenclature_center_pts`: planetocentric, +East, 0–360°, Mars 2000 sphere). These are **centres of large named regions**: Valles Marineris is 3,761 km long and Utopia Planitia 3,560 km across. They are not landing sites, and the card says so.
- The Perseverance landing point (18.4446° N, 77.4509° E) against NASA's Mars 2020 localization (`M20_waypoints.json`, site 3 drive 0: 18.44462715° N, 77.45088572° E). "Octavia E. Butler Landing" is a NASA name, not an IAU one.

Conversion to the map: `fromEast360` from `src/shared/coordinates.ts` (`lon > 180 → lon − 360`); latitude is unchanged. Pins and flights use the world copy nearest the current view, so they take the short way across ±180°.

The map opens on the landing point (`HOME_CENTER` in `src/map/marsTrek.ts`), framed about 120 × 135 km to take in all of Jezero and its delta. That is near zoom 8.3 on a laptop screen, where the relief is drawn close to its native 200 m.

### Sharpness

What made the map look soft, and what changed:

- **The elevation overlay.** At 80 % over the imagery, a 3.7 km grid washed over 5 m imagery. Elevation now opens at 100 %, with sharpness supplied by the 200 m relief shading; imagery is one switch away.
- **Viking's resolution.** Trek's Viking mosaic only goes to level 7 (326 m/px), so beyond zoom 7 it was simply magnified. The global CTX mosaic (5.1 m/px) now fades in over it between zoom 6.5 and 7.5. It is uncontrolled, so individual CTX frames can sit slightly off their true positions; the Jezero mosaics (controlled) stay on top of it.
- **Fractional zoom.** Leaflet loads `round(zoom)` tiles, up to 1.41× magnified. Tiles now switch up 0.2 earlier (at most 1.23×). A bigger bias would be sharper, but each level quadruples the tiles fetched from Trek.
- **High-density screens.** Leaflet ignored `devicePixelRatio`. At 1.5× or more, tiles are drawn at half size from one level deeper, within each product's deepest level. Elevation and slope canvases render at 2×. (`src/map/sharpTiles.ts`, used by the map's Trek layers and by the science layers.)
- **Tile seams.** Science tiles are drawn half a pixel larger, closing the hairline gaps Leaflet leaves at fractional zoom.
- Nothing is sharpened artificially. Beyond a product's deepest level, tiles are magnified, and the panel's **View** line says so: for example "View 31 m/px · Relief 200 m/px · magnified 6.5×".

**Trek's limit.** Trek serves tiles over HTTP/1.1 at roughly 0.8 s each, so a browser fetches about 6 at a time. On the opening, the relief shading arrives about 8 s after the descent lands, after the map's imagery tiles for the flight. Relief tiles abandoned during a flight are cancelled, and the opening view's relief is prefetched while the globe is on screen.

### Coordinate conventions

- Mars Trek: equirectangular on the Mars 2000 sphere (IAU2000:49900), **planetocentric** latitude, **east-positive longitude −180…180°**, tile row 0 at the north edge. The Viking and relief GetCapabilities documents list identical tile matrix sets (`default028mm`, 2 × 1 tiles at level 0).
- MOLA MEGDR: simple cylindrical, planetocentric, **east-positive longitude 0…360°**, first line at 90° N. From the PDS label: `line = LINE_PROJECTION_OFFSET − lat·MAP_RESOLUTION`, `sample = SAMPLE_PROJECTION_OFFSET + (lon − CENTER_LONGITUDE)·MAP_RESOLUTION` (1-based, integers at pixel centres).
- The only transformation is a column rotation from 0…360° to −180…180° (`lon > 180 → lon − 360`), done in `scripts/prepare-mola.mjs` from those label keywords. Inside the app, grid row `i` is centred on `90 − (i + 0.5)/ppd` and column `j` on `−180 + (j + 0.5)/ppd`. Leaflet longitudes outside ±180° (the map wraps) are normalised before any lookup. Latitude needs no conversion: both sources are planetocentric.
- Nothing is offset or aligned by eye.

### Preparing the MOLA data

The bundled tiles in `public/data/mola/` (1.3 MB + 18.6 MB) are generated, lossless, from the PDS files:

```bash
B=https://pds-geosciences.wustl.edu/mgs/mgs-m-mola-5-megdr-l3-v1/mgsl_300x
curl -O $B/meg004/megt90n000cb.lbl -O $B/meg004/megt90n000cb.img
curl -O $B/meg016/megt90n000eb.lbl -O $B/meg016/megt90n000eb.img
node scripts/prepare-mola.mjs megt90n000cb.lbl megt90n000cb.img meg004 180
node scripts/prepare-mola.mjs megt90n000eb.lbl megt90n000eb.img meg016 30
```

The script checks the label (data set, sample type, unit, projection, planetocentric east-positive, global extent) and refuses anything else. Tiles carry a 1-sample halo from their neighbours, so slope and interpolation are seamless across tile edges and across ±180°. Each row is delta-encoded little-endian int16, then gzipped. Some servers (including `vite preview`) send `.gz` files with `Content-Encoding: gzip`; the loader checks the gzip signature and works either way.

### How it was verified

- **Lossless:** 20,000 random points per product decode to exactly the PDS value; min/max (−8177 / 21171 m) match the label.
- **Known places** (16 px/deg): Jezero −2,645 m; Olympus Mons summit area +20,046 m; Arsia Mons +16,324 m. The in-map readout returns the same values.
- **Alignment:** a hillshade computed from the MEGDR was cross-correlated with Trek's relief tiles over ±8-pixel shifts. Tiles were spread across the planet, including both sides of ±180°. The best match is always within about 1 tile pixel at every zoom level tested (0.08° at level 3 → 0.005° at level 6). A georeferencing error would stay fixed in degrees; this shrinks with each zoom level, so it comes from how Trek's shaded relief was rendered. Registration agrees to well under one MEGDR bin (0.0625°).
- **Legend:** pixels read back from rendered elevation tiles match the lookup table for the bilinear MEGDR value exactly (0/255 difference). All 11 palette stops come out as their specified hex values.
- **Locations:** all 15 parse, convert to −180…180° losslessly, and are found by search. Selecting one centres the map on it, with the pin at 0 px offset. Arcadia and Acidalia, which span ±180° or 0°, frame correctly. The map stays where it was sent.
- **Failure states:** with the MOLA files blocked, Elevation and Slope are disabled, with a reason and a Retry button, and nothing is drawn. With Trek relief tiles blocked, the row shows an error and Retry. Both recover after unblocking.

## Terrain inspection

The **Inspect terrain** panel (top right) reports what numerical data says about any point. A point can be picked by clicking the map, typing coordinates, choosing a reference point, or using the location search; all four go through `selectedLocationStore`. It needs no route.

**Readings, per point:**

| Group | Reading | Source | Notes |
| --- | --- | --- | --- |
| Local terrain | Elevation, slope (over 40 m), relief (1 km square) | Jezero CTX DTM, 20 m posts | Western Jezero only: 18.21–18.72° N, 77.16–77.70° E |
| Regional terrain | Elevation, MOLA shots in the bin, slope (over 7.4 km), relief (18.5 km square) | MOLA MEGDR, 16 px/deg | Global |
| Mapped geology | Unit code and description | USGS Geologic Map of Mars, SIM 3292 (1:20 M) | Global |
| Rocks and small obstacles | Always **Not assessed** | — | No rock-abundance dataset is loaded |

Each reading has a status: **Data available**, **Data unavailable** (a file failed to load), **Not mapped**, **Outside coverage** or **Not assessed**. A missing reading is never replaced by a number. Readings are also produced as shared `TerrainSample` records.

**Elevation** comes from numeric rasters only, never from map colours. Both DEMs are relative to the **MOLA areoid**: the MEGDR by definition, and the CTX DTM because it is tied to MOLA topography (`MOLAtopography_DeltaGeoid`). Local elevation is bilinear between the four nearest posts. Regional elevation is the MEGDR bin value: the median of the laser shots in it, or an interpolated value where no shot fell. The **MOLA shots** reading says which, using the PDS count grid (MEGC90N000EB). About 5 % of bins have no shot.

**Slope** is in degrees, from central differences with true ground distances. On the CTX DTM's equirectangular grid, one post is 20 m north–south but 20·cos(lat) m east–west. The panel states each slope's baseline. Neither DEM resolves rocks, boulders or features under about 60 m (CTX) or 3.7 km (MOLA); that takes HiRISE images (25 cm/px) or HiRISE DTMs (about 1 m).

**Relief** is the elevation range in a square window around the point, and how far the point sits above or below that window's mean.

**Geology** comes from the published unit polygons of SIM 3292, looked up on a 32 px/deg raster. Units describe age and geologic setting, not rock composition. At 1:20,000,000 the map does not resolve features as small as Jezero's delta: the whole of western Jezero is the "Hesperian and Noachian transition unit". The panel says so.

**Coordinates** can be typed as east 0…360°, east −180…180° or west-positive, and as planetocentric or planetographic latitude, with N/S/E/W letters accepted. Conversion uses `src/shared/coordinates.ts`. Results show the point in all three longitude conventions.

**Reference points:** 13 in the Jezero region and 14 elsewhere. The Jezero names and centres come from the IAU Gazetteer; most were adopted in 2020–21 for Mars 2020. The landing point comes from NASA's Mars 2020 localization. Each links to its source.

### Preparing the data

```bash
# MOLA shot counts (same grid as the elevation tiles)
B=https://pds-geosciences.wustl.edu/mgs/mgs-m-mola-5-megdr-l3-v1/mgsl_300x
curl -O $B/meg016/megc90n000eb.lbl -O $B/meg016/megc90n000eb.img
node scripts/prepare-mola.mjs megc90n000eb.lbl megc90n000eb.img meg016-count 30

# Jezero CTX DTM (9.7 MB)
curl -LO https://planetarymaps.usgs.gov/mosaic/mars2020_trn/CTX/JEZ_ctx_B_soc_008_DTM_MOLAtopography_DeltaGeoid_20m_Eqc_latTs0_lon0.tif
node scripts/prepare-jezero-dtm.mjs JEZ_ctx_B_soc_008_DTM_MOLAtopography_DeltaGeoid_20m_Eqc_latTs0_lon0.tif

# Geologic map (sim3292_database.zip is 809 MB; only SIM3292_Shapefiles/SIM3292_Global_Geology.* is used)
curl -LO https://pubs.usgs.gov/sim/3292/downloads/sim3292_database.zip
node scripts/prepare-geology.mjs SIM3292_MarsGlobalGeologicGIS_20M/SIM3292_Shapefiles/SIM3292_Global_Geology.shp
```

Sizes: shot counts 1.2 MB, stored as categories (0, 1, 2–4, 5–9, 10+); Jezero DTM 2.8 MB, in 2 cm steps; geology 0.6 MB.

### How it was verified

- **Datum and georeferencing:** at Perseverance's landing point the CTX DTM gives −2,567.45 m. NASA's Mars 2020 localization gives −2,569.91 m, and the MEGDR bin −2,568 m.
- **Sampling:** elevation and slope at the landing point match values computed independently from the original GeoTIFF floats: −2,567.45 m, and 2.814° against 2.823° (the 2 cm storage bounds the difference at 0.015°). Shot categories match the PDS count file at 20,000 random points. A known zero-shot bin (0.59375° N, 62.53125° E) is reported as interpolated, with its PDS value of 2,190 m.
- **Coordinates:** 10 conversions across all conventions are exact, including planetographic 45° → 44.6618° planetocentric, a west-positive 133.8° and a longitude past 360°. Out-of-range or malformed entries are rejected with a message.
- **Missing data:** points outside the DTM show **Outside coverage**, pole rows and DTM edges **Not assessed**, and blocked files **Data unavailable**. No values appear in any of these cases.
- **Sources:** all 26 Gazetteer links resolve and name the linked feature; the dataset links resolve.

## Ground Perspective (NASA rover photographs)

What the ground looks like near a chosen place, from real rover photographs. Open it from a route stop (start, destination, any waypoint), the selected-point card, a landmark card, the globe's landmark panel or the Mars Dashboard. Opening and closing it changes nothing in the mission plan.

- **Catalogue:** `public/data/ground/catalogue.json`, built by `node scripts/ground/build-ground.mjs` from a curated list of image IDs. For each one the script reads NASA's own raw-image record (mars.nasa.gov raw-image feed: camera, sol, UTC time, caption, credit, image files) and checks that every image URL loads. Perseverance (Jezero) and Curiosity (Gale) only.
- **Where a photograph was taken:** only when the image's rover motion counter (site, drive) exactly matches a rover position NASA has published in its MMGIS localizations (`M20_waypoints.json`, `MSL_waypoints.json`). Perseverance records give site/drive; for Curiosity Navcam it is read from the product ID (`F`/`S` + 3-digit site + 4-digit drive), which matched NASA's localizations for 370 of 380 images checked. Otherwise the capture position is null and no distance is shown. The position is the rover's, not a surveyed camera point. View orientation is not given (the feed's pointing angles have no documented frame).
- **Matching** (`src/ground/catalogue.ts`), using the shared great-circle distance (IAU sphere, R = 3,396.19 km):
  - *Nearby:* captured within the horizon distance from the ~2 m mast, √(2Rh) ≈ 3.7 km, so the point may be in view.
  - *Regional:* farther, but the point and the capture both lie within one crater diameter of the crater's centre (crater plus its continuous-ejecta zone; centres and diameters from the IAU/USGS Gazetteer: Jezero 47.5 km, Gale 154.1 km).
  - *Mission area:* no capture position, and the point lies in that rover's region; no distance.
  - Otherwise nothing is shown: "No verified NASA surface imagery is available for this location."
- **Map:** "Show capture location on map" draws the capture point (◉), the chosen point (◎) and a dashed line with their separation, using its own `gp:` overlays; Clear removes them. The route is never changed.
- Images stay on NASA's servers (thumbnails in the list, the 1200 px version in the viewer, full resolution by link). Credit: NASA/JPL-Caltech (Mastcam-Z: NASA/JPL-Caltech/ASU).

## Out of scope for now

Route planning, waypoints, information panels and other Explorer features are not part of this build. When they are built, routes must be presented as estimates from orbital data, never as verified safe paths.

## Scientific honesty

The astronaut, suit, tablet and mount are a concept visualization of a possible future, not existing NASA hardware. No telemetry or environmental readings are shown.

## Credits

- Mars colour map: Solar System Scope (CC BY 4.0), based on NASA imagery; the 4k and 6k maps are their 8k map resampled with a Lanczos filter. Relief: normal map from MOLA elevation data (NASA/GSFC).
- Typefaces: Exo 2 by Natanael Gama, SIL Open Font License 1.1 (`public/fonts/Exo2-OFL.txt`), self-hosted from Google Fonts; Manrope from Google Fonts (SIL Open Font License).
- Elevation and slope: MGS MOLA Mission Experiment Gridded Data Record (MGS-M-MOLA-5-MEGDR-L3-V1.0), NASA/GSFC MOLA Science Team, via the PDS Geosciences Node. Jezero CTX DTM: USGS Astrogeology, Mars 2020 Terrain Relative Navigation products (Fergason et al.), from NASA/JPL-Caltech/MSSS CTX images. Geology: Tanaka, K.L., et al., 2014, Geologic Map of Mars, USGS Scientific Investigations Map 3292. Place names: IAU/USGS Gazetteer of Planetary Nomenclature. Relief shading: MOLA–HRSC blended DEM hillshade (NASA/GSFC; ESA/DLR/FU Berlin; USGS) via NASA Mars Trek.
- Map imagery: NASA Mars Trek (https://trek.nasa.gov/mars/). Viking MDIM 2.1 (NASA/USGS); MRO CTX (NASA/JPL-Caltech/MSSS); MRO HiRISE (NASA/JPL-Caltech/University of Arizona). Map library: Leaflet (BSD-2-Clause).
- Terrain, rock and regolith detail are procedural.

Beyond Terra is a concept project for a NASA Mars exploration challenge and is not an official NASA product.
