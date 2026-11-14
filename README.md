# Beyond Terra

Beyond Terra is an interactive Mars exploration and mission-planning platform powered by NASA scientific data. It allows future astronauts to explore Martian terrain, analyze scientific layers, identify potential hazards, discover geological sites, and plan exploration routes—bridging the gap between robotic discoveries and human exploration.

This build has the globe and, below it, the NASA Mars Trek map:

1. **The astronaut opening.** Through an astronaut's eyes on Mars, a field tablet swings up and wakes with Beyond Terra on it, and the camera moves into the screen until the screen *is* the website.
2. **The globe.** A full-screen, slowly rotating 3D Mars with BEYOND TERRA across it, and a one-line credit for the imagery. It stays for as long as the visitor likes; nothing redirects.
3. **The Mars Trek map.** About 2.5 s after the globe settles, the camera zooms into Mars and lands on a full-screen map drawn from NASA Mars Trek's imagery (see below).

Built with React 18, TypeScript, Three.js and GSAP, bundled with Vite.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
npm run typecheck
npm run build      # production build in dist/ (static: deploys to Vercel or Netlify as is)
```

The opening plays once per browser session. Add `?intro` to the URL to see it again, or `?nointro` to skip it.

## The opening, beat by beat

| Time | Beat |
| --- | --- |
| 0.0–1.5 s | Fade up on the Martian plain through the astronaut's eyes, with a slow look across it. Their long shadow lies on the regolith ahead |
| 1.5–3.0 s | The chest-mounted tablet swings up into reading position and locks; status lights and screen wake |
| 3.0–7.0 s | On the tablet, the original four-second reveal: Mars rises out of darkness, the camera pushes in, BEYOND TERRA fades up and sharpens |
| 5.0–7.5 s | The astronaut leans in; the tablet grows in the frame |
| 7.5–9.0 s | The camera squares up to the screen; the bezel leaves the frame |
| 9.0 s | Handoff: the screen exactly fills the viewport, and the same image is now drawn full-screen |
| 9.35–9.85 s | The intro dissolves onto the identical globe page, which then stays |

**Skip cinematic** (the button, Enter, Space, Escape, or a click or tap anywhere) dissolves straight to the globe in about half a second.

### The globe reveal

On a visit that does not play the astronaut opening (later in the session, or with `?nointro`), the homepage plays the same four-second reveal full-screen: light rising on the planet (0–1.5 s), a push-in that settles by 4 s, and the title fading in, rising and sharpening (1.5–2.3 s). The choreography lives in one place, `src/three/heroReveal.ts`, so the tablet and the full-screen page always match.

### How the handoff stays seamless

The rotating Mars and the BEYOND TERRA title are one reusable scene, `MarsHero` (`src/three/marsHero.ts`). Every view of it renders into a linear, high-precision render target and reaches the screen through the same final pass:

- the tablet's screen samples that render target, unlit and without tone mapping;
- the full-screen intro and the homepage draw the same render target to the canvas;
- all copies share one clock (`performance.now()`), seeded stars and the same pixel ratio, so every copy of Mars shows the same rotation. The planet never restarts.

The tablet's screen always has the viewport's aspect ratio, and the raised tablet faces the astronaut's eyes square-on. The camera's final move is a straight lean along the screen's normal, ending at the distance where the screen fills the frame exactly. At that frame the tablet and the full-screen view are the same pixels, so the handoff is invisible. Measured in headless Chrome: the last tablet frame and the first full-screen frame differ by 1.03/255 on average, less than two consecutive full-screen frames do (1.26/255, from the planet's rotation between captures).

## The astronaut

The brief asks for a realistic, properly licensed astronaut model. This repository does not include one: the earlier suit built from 3D primitives looked visibly artificial on camera, and no model URL is assumed or invented.

The fallback is the astronaut's own point of view. The visitor sees the plain, the tablet and the mount arm; the suit itself is never on camera. The procedural suit (`src/intro/scene/astronaut.ts`) is still in the scene, but it renders into the shadow map only, so the astronaut appears as a soft, long shadow holding the tablet. No primitive geometry is shown up close.

**To add a third-person shot later**, you need a rigged, game-ready astronaut model (glTF/GLB, under about 50k triangles, PBR textures at 2k or less) with a licence that allows web redistribution, plus a hand or wrist bone to attach the tablet to. With that, `SurfaceScene` can load it with `GLTFLoader` and add an over-the-shoulder camera path before the current POV move.

## Globe resolution

- The 4k colour map loads first, so the planet appears quickly.
- On large or high-density screens (hero disc of 800+ device pixels, a GPU that supports 8192-pixel textures, and a capable device), a 6k map (2.9 MB) loads in the background. Every view of the planet then switches to it together.
- The colour and relief maps are sampled with a negative LOD bias (`MAP_LOD_BIAS` in `marsHero.ts`), so the GPU keeps the full-resolution mip level at hero size instead of blending in a blurrier half-size one.
- Rendering goes up to 2x device pixels on every device.
- The 8k map is not shipped: as a texture it needs about 180 MB of GPU memory per WebGL context.

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
    introGate.ts              Once per session, ?intro / ?nointro, reduced motion
    scene/
      surfaceScene.ts         Scene assembly, point-of-view camera, tablet mount, poses
      environment.ts          Terrain, sky, rocks, dust, lighting
      astronaut.ts            Suit silhouette from primitives (casts the shadow only)
      tablet.ts               Rugged field tablet
      textures.ts, noise.ts   Procedural regolith normal map, seeded noise
  map/                        NASA Mars Trek map (Leaflet + Trek WMTS tiles), from nasa-mars-walk
  components/
    MarsTrekSection.tsx       Full-screen map layer under the globe; reveals and descends on cue
    MarsBackdrop.tsx          The homepage's rotating Mars with the title (works without the intro)
  pages/
    HomePage.tsx              The page: Mars, BEYOND TERRA, credits
public/
  textures/                   Mars colour maps (4k; 6k upgrade for large screens; 2k fallback), relief map (2k)
  fonts/                      Exo 2, self-hosted Latin subset
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

## Out of scope for now

Route planning, waypoints, information panels and other Explorer features are not part of this build. When they are built, routes must be presented as estimates from orbital data, never as verified safe paths.

## Scientific honesty

The astronaut, suit, tablet and mount are a concept visualization of a possible future, not existing NASA hardware. The intro says so on screen. No telemetry or environmental readings are shown.

## Credits

- Mars colour map: Solar System Scope (CC BY 4.0), based on NASA imagery; the 4k and 6k maps are their 8k map resampled with a Lanczos filter. Relief: normal map from MOLA elevation data (NASA/GSFC).
- Typefaces: Exo 2 by Natanael Gama, SIL Open Font License 1.1 (`public/fonts/Exo2-OFL.txt`), self-hosted from Google Fonts; Manrope from Google Fonts (SIL Open Font License).
- Map imagery: NASA Mars Trek (https://trek.nasa.gov/mars/). Viking MDIM 2.1 (NASA/USGS); MRO CTX (NASA/JPL-Caltech/MSSS); MRO HiRISE (NASA/JPL-Caltech/University of Arizona). Map library: Leaflet (BSD-2-Clause).
- Terrain, rock and regolith detail are procedural.

Beyond Terra is a concept project for a NASA Mars exploration challenge and is not an official NASA product.
