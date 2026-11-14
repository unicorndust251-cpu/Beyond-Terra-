# Beyond Terra

Beyond Terra is an interactive Mars exploration and mission-planning platform powered by NASA scientific data. It allows future astronauts to explore Martian terrain, analyze scientific layers, identify potential hazards, discover geological sites, and plan exploration routes—bridging the gap between robotic discoveries and human exploration.

This first build contains the website's homepage and its cinematic opening: an astronaut on Mars wakes a field tablet showing Beyond Terra, and the camera moves into the screen until the screen *is* the website.

Built with React 18, TypeScript, Three.js and GSAP, bundled with Vite.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
npm run typecheck
npm run build      # production build in dist/
```

The opening plays once per browser session. Add `?intro` to the URL to see it again, or `?nointro` to skip it.

## The opening, beat by beat

| Time | Beat |
| --- | --- |
| 0.0–1.2 s | Fade up on the Martian surface. A three-quarter medium shot of the astronaut; the camera begins a slow push-in while the tablet is raised |
| 1.2–2.2 s | The right thumb presses the wake key, the status lights come on and the Beyond Terra hero fades up on the screen |
| 2.2–4.2 s | The camera travels over the right shoulder towards the screen |
| 4.2–5.0 s | The camera squares up to the screen; the bezel slides out of frame |
| 5.0 s | Handoff: the screen exactly fills the viewport, and the same image is now drawn full-screen |
| 5.0–6.3 s | Hero moment: Mars rotating behind BEYOND TERRA |
| 6.3–7.3 s | The title fades, the intro dissolves, and the homepage takes over |

Skipping (the Skip intro button, Enter, Space, Escape, or a click or tap anywhere) dissolves straight to the homepage in about half a second.

### How the handoff stays seamless

The rotating Mars and the BEYOND TERRA title are one reusable scene, `MarsHero` (`src/three/marsHero.ts`). Every view of it renders into a linear, high-precision render target and reaches the screen through the same final pass:

- the tablet's screen samples that render target, unlit and without tone mapping;
- the full-screen intro and the homepage draw the same render target to the canvas;
- all copies share one clock (`performance.now()`), seeded stars and the same pixel ratio, so every copy of Mars shows the same rotation.

The tablet's screen always has the viewport's aspect ratio. The camera path ends on the screen's normal at the distance where the screen fills the frame exactly. At that frame, the tablet and the full-screen view are the same pixels: measured in testing, the mean difference between the last tablet frame and the first full-screen frame is 0.005 of 255. The homepage's own Mars, underneath, is identical too, so the intro can fade out without any visible change.

### Fallbacks and accessibility

- **Reduced motion:** the intro does not play, and the homepage shows a still planet with no layout animation.
- **No WebGL:** the intro does not play, and the homepage shows a CSS planet drawn from the same texture.
- **Slow loading:** the intro gives up after 9 s and the site appears. The intro's code is a separate chunk, so the website never waits for it.
- **Lost WebGL context or a crash in the intro:** the intro hands over to the site immediately.
- **Timing on slow devices:** the timeline follows the wall clock, not frame count, so the sequence still lasts about seven seconds.
- **Keyboard and screen readers:** the homepage is `inert` and `aria-hidden` while the intro covers it.

## Where things live

```
src/
  App.tsx                     Routes (#/ and #/explore), intro gating, handoff between intro and site
  three/
    marsHero.ts               The original hero: Mars, atmosphere rim, stars, title; layouts
    assets.ts                 Texture and font loading, WebGL check, device tier, shared clock
    renderSettings.ts         Renderer and pixel ratio shared by intro and homepage
  intro/
    AstronautIntro.tsx        The cinematic opening (overlay component)
    timeline.ts               GSAP timeline and timing
    introGate.ts              Once per session, ?intro / ?nointro, reduced motion
    scene/
      surfaceScene.ts         Scene assembly, tablet poses, camera path
      environment.ts          Terrain, sky, rocks, dust, lighting
      astronaut.ts            Suit built from primitives, two-bone arm IK
      tablet.ts               Rugged field tablet and gloves
      textures.ts, noise.ts   Procedural regolith and fabric normal maps, seeded noise
  components/
    MarsBackdrop.tsx          The homepage's own rotating Mars (works without the intro)
    SiteHeader.tsx
  pages/
    HomePage.tsx              Homepage: hero, Explore Mars, About, credits
    ExplorePage.tsx           Placeholder route for the Mars Explorer (next build step)
public/
  textures/                   Mars colour and relief maps (2k)
  fonts/                      Exo 2, self-hosted Latin subset
```

For testing, `?introDebug` stops the intro from playing and exposes `window.__beyondTerraIntro.seek(seconds)` for frame-by-frame inspection.

## Scientific honesty

The astronaut, suit and tablet are a concept visualization of a possible future, not existing NASA hardware. The intro says so on screen. No telemetry or environmental readings are shown. The suit and tablet are built from 3D primitives; no third-party models are used.

## Credits

- Mars colour map: Solar System Scope (CC BY 4.0), based on NASA imagery. Relief: normal map from MOLA elevation data (NASA/GSFC).
- Typeface: Exo 2 by Natanael Gama, SIL Open Font License 1.1 (`public/fonts/Exo2-OFL.txt`), self-hosted from Google Fonts.
- Terrain, rock, regolith and fabric detail are procedural.

Beyond Terra is a concept project for a NASA Mars exploration challenge and is not an official NASA product.
