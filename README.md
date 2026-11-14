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
  components/
    MarsTrekSection.tsx       Full-screen map layer under the globe; reveals and descends on cue
    MarsBackdrop.tsx          The homepage's rotating Mars with the title (works without the intro)
  pages/
    HomePage.tsx              The page: Mars, BEYOND TERRA, credits
public/
  textures/                   Mars colour maps (4k; 6k upgrade for large screens; 2k fallback), relief map (2k)
  fonts/                      Exo 2, self-hosted Latin subset
  data/mola/                  MOLA MEGDR elevation tiles (generated by scripts/prepare-mola.mjs)
scripts/
  prepare-mola.mjs            PDS MEGDR → browser tiles, driven by the PDS label
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

## Scientific layers

A **Layers** panel (top left of the map) switches four layers, each with its own opacity, plus **Reset Layers**. Elevation is on by default. The module lives in `src/science/`, attaches to the map through `useMarsMap()`, and does not depend on routes or any other feature.

| Layer | Exact product | Access | Grid | Coverage |
| --- | --- | --- | --- | --- |
| Surface Imagery | Trek `Mars_Viking_MDIM21_ClrMosaic_global_232m`, `Jezero_CTX_BlockAdj_dd`, `JEZ_hirise_soc_006_orthoMosaic_25cm_Eqc_latTs0_lon0_first_dd` | Mars Trek WMTS (CORS open) | 232 m/px global; CTX and HiRISE at Jezero | Global + Jezero |
| Elevation | PDS `MGS-M-MOLA-5-MEGDR-L3-V1.0`: `MEGT90N000CB.IMG` (4 px/deg) and `MEGT90N000EB.IMG` (16 px/deg), product version 2.0 | Bundled (PDS sends no CORS headers) | 14.8 / 3.7 km per pixel at the equator | Global |
| Slope | Computed in the browser from the same MEGDR values | — | Native MEGDR bins | Global (pole rows excluded) |
| Relief Shading | Trek `Mars_MOLA_blend200ppx_HRSC_Shade_clon0dd_200mpp_lzw` (hillshade of the MOLA–HRSC blended DEM) | Mars Trek WMTS (CORS open), levels 0–8 | 200 m/px | Global |

Licensing: NASA and PDS data are public domain; credits are in the legend, the panel and below.

**Elevation.** Values are the MEGDR's own signed 16-bit integers: median MOLA topography per bin, in **metres above the MOLA areoid** (GMM3 / mgm1025 to degree and order 50; topography = planetary radius − areoid radius). Bins with no laser shots hold interpolated values, as the PDS label states. Nothing is read back from colours. The 4 px/deg product draws the whole-planet view (map zoom ≤ 2); the 16 px/deg product takes over from zoom 3, and the legend always names the product on screen. The colour scale is viridis, linear from −8 to +12 km; only the deepest part of Hellas (to −8.18 km) and the Tharsis and Olympus Mons summits (to +21.17 km) fall outside, drawn in the end colours. Hovering (or tapping) shows the native bin's elevation and slope.

**Slope** is computed per MEGDR bin with central differences and true horizontal distances on the product's sphere (R = 3396.0 km, from the label):

```
dx = R · cos(lat) · Δλ,   dy = R · Δφ          (Δλ = Δφ = 1/ppd degrees, in radians)
slopeDegrees = atan(√((dz/dx)² + (dz/dy)²)) × 180 / π
```

Slope depends on the baseline: at 16 px/deg it is measured over 7.4 km north–south, so it shows regional slopes (crater walls, scarps), not slopes at rover scale. It is drawn bin by bin, unsmoothed, with its own scale (inferno, 0–30°), and is never shown together with elevation. The two rows at the poles have no valid north/south neighbour and are left blank.

**Relief shading** multiplies onto the layers below it. Trek publishes it only as rendered JPEG tiles, so it is used for shading only, never for numbers.

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
- **Legend:** pixels read back from rendered elevation tiles match the legend's lookup table for the bilinear MEGDR value to within 2/255.
- **Failure states:** with the MOLA files blocked, Elevation and Slope are disabled, with a reason and a Retry button, and nothing is drawn. With Trek relief tiles blocked, the row shows an error and Retry. Both recover after unblocking.

## Out of scope for now

Route planning, waypoints, information panels and other Explorer features are not part of this build. When they are built, routes must be presented as estimates from orbital data, never as verified safe paths.

## Scientific honesty

The astronaut, suit, tablet and mount are a concept visualization of a possible future, not existing NASA hardware. No telemetry or environmental readings are shown.

## Credits

- Mars colour map: Solar System Scope (CC BY 4.0), based on NASA imagery; the 4k and 6k maps are their 8k map resampled with a Lanczos filter. Relief: normal map from MOLA elevation data (NASA/GSFC).
- Typefaces: Exo 2 by Natanael Gama, SIL Open Font License 1.1 (`public/fonts/Exo2-OFL.txt`), self-hosted from Google Fonts; Manrope from Google Fonts (SIL Open Font License).
- Elevation and slope: MGS MOLA Mission Experiment Gridded Data Record (MGS-M-MOLA-5-MEGDR-L3-V1.0), NASA/GSFC MOLA Science Team, via the PDS Geosciences Node. Relief shading: MOLA–HRSC blended DEM hillshade (NASA/GSFC; ESA/DLR/FU Berlin; USGS) via NASA Mars Trek.
- Map imagery: NASA Mars Trek (https://trek.nasa.gov/mars/). Viking MDIM 2.1 (NASA/USGS); MRO CTX (NASA/JPL-Caltech/MSSS); MRO HiRISE (NASA/JPL-Caltech/University of Arizona). Map library: Leaflet (BSD-2-Clause).
- Terrain, rock and regolith detail are procedural.

Beyond Terra is a concept project for a NASA Mars exploration challenge and is not an official NASA product.
