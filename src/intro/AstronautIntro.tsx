import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { getQuality, loadMarsImages, loadTitleFont, onLargeMarsColor, sharedSeconds } from '../three/assets';
import { heroLayout, MarsHero } from '../three/marsHero';
import { createRenderer, renderPixelRatio, viewportSize } from '../three/renderSettings';
import { AstronautRig } from './scene/astronautRig';
import { ProceduralAstronaut } from './scene/proceduralAstronaut';
import { ThirdPersonScene } from './scene/thirdPersonScene';
import { createInitialState, createIntroTimeline, TIMING } from './timeline';
import './intro.css';

export interface AstronautIntroProps {
  /** The full-screen hero is now showing: the website's own Mars should start rendering underneath. */
  onHandoff: () => void;
  /** The intro has faded away (or could not run). Unmount it. */
  onComplete: () => void;
}

declare global {
  interface Window {
    __beyondTerraIntro?: { seek: (seconds: number) => void; play: () => void };
  }
}

/**
 * The cinematic opening: an astronaut stands on Mars, raises a field tablet showing
 * Beyond Terra, and the camera moves into the screen until the screen is the website.
 *
 * The astronaut is a rigged model from /models/astronaut.glb when one is supplied, and
 * otherwise the suit built in code. The sequence always plays through (there is no skip);
 * only a loading failure, an error or a lost WebGL context hand over to the site early.
 */
export default function AstronautIntro({ onHandoff, onComplete }: AstronautIntroProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const fadeRef = useRef<HTMLDivElement>(null);
  const vignetteRef = useRef<HTMLDivElement>(null);
  const handoffRef = useRef(onHandoff);
  const completeRef = useRef(onComplete);
  handoffRef.current = onHandoff;
  completeRef.current = onComplete;

  useEffect(() => {
    const root = rootRef.current!;
    const stage = stageRef.current!;
    let disposed = false;
    let started = false;
    let finished = false;
    let handedOff = false;

    const handoff = () => {
      if (handedOff) return;
      handedOff = true;
      handoffRef.current();
    };
    const finish = () => {
      if (finished) return;
      finished = true;
      handoff();
      completeRef.current();
    };

    // The canvas is created here (not in JSX) so a remount always gets a fresh context
    const canvas = document.createElement('canvas');
    canvas.className = 'bt-intro__canvas';
    stage.appendChild(canvas);

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = createRenderer(canvas);
    } catch {
      finish();
      return () => canvas.remove();
    }
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const quality = getQuality();
    const pixelRatio = renderPixelRatio();
    renderer.setPixelRatio(pixelRatio);

    const state = createInitialState();
    let hero: MarsHero | null = null;
    let stopUpgrade = () => {};
    let surface: ThirdPersonScene | null = null;
    let tl: ReturnType<typeof createIntroTimeline> | null = null;
    let raf = 0;
    let playing = false;
    // The timeline follows the wall clock (not GSAP's lag-smoothed ticker), so the
    // sequence lasts about ten seconds even on slow devices; slow frames are skipped,
    // and only a long stall (over 0.25 s) is absorbed.
    let clock = 0;
    let last = 0;

    const resize = () => {
      const { width, height } = viewportSize();
      renderer.setSize(width, height);
      hero?.setSize(width, height, pixelRatio);
      hero?.setLayout(heroLayout(width, height));
      surface?.setSize(width, height, pixelRatio);
    };

    const drawFrame = () => {
      if (!hero || !surface) return;
      const seconds = sharedSeconds();
      if (state.heroMode < 1) {
        if (state.screenOn > 0.001) hero.render(seconds);
        surface.update(state, seconds);
        surface.render();
      } else {
        handoff();
        hero.render(seconds);
        hero.present();
      }
      if (fadeRef.current) fadeRef.current.style.opacity = String(state.fadeIn);
      if (vignetteRef.current) vignetteRef.current.style.opacity = String(state.vignette);
      root.style.opacity = String(1 - state.exit);
    };

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      try {
        if (playing && tl) {
          const dt = last ? Math.min((now - last) / 1000, 0.25) : 0;
          clock = Math.min(clock + dt, tl.duration());
          tl.time(clock);
        }
        last = now;
        drawFrame();
      } catch (err) {
        // Never leave a visitor on the intro: any error while it runs hands over to the site
        cancelAnimationFrame(raf);
        console.error('[intro] Stopped after an error; showing the website.', err);
        finish();
      }
    };

    window.addEventListener('resize', resize);
    const onLost = (e: Event) => {
      e.preventDefault();
      finish();
    };
    canvas.addEventListener('webglcontextlost', onLost);

    // Never keep a visitor waiting on a slow connection
    const timeout = window.setTimeout(() => {
      if (!started) finish();
    }, TIMING.loadTimeout * 1000);

    // A missing or unsuitable model is not an error: the built-in suit is used instead
    const rigLoad = AstronautRig.load(renderer).catch((err: unknown) => {
      if (import.meta.env.DEV) console.info('[intro] No astronaut model file, using the built-in suit:', err);
      return null;
    });

    Promise.all([loadMarsImages(), loadTitleFont(), rigLoad])
      .then(([images, , rig]) => {
        if (disposed) {
          rig?.dispose();
          return;
        }
        hero = new MarsHero(renderer, images, { title: true, quality });
        // Switches to the 6k map at the same moment as the homepage's globe
        stopUpgrade = onLargeMarsColor((image) => hero?.setColorImage(image));
        surface = new ThirdPersonScene(renderer, hero.target.texture, rig ?? new ProceduralAstronaut(), quality);
        resize();

        // Compile every shader and upload every texture before the clock starts
        renderer.compile(surface.scene, surface.camera);
        hero.render(sharedSeconds());
        surface.update(state, 0);
        surface.render();

        tl = createIntroTimeline(state, hero.reveal);
        tl.eventCallback('onComplete', finish);
        started = true;
        window.clearTimeout(timeout);

        if (new URLSearchParams(window.location.search).has('introDebug')) {
          window.__beyondTerraIntro = {
            seek: (t: number) => {
              playing = false;
              clock = t;
              tl?.time(t);
              drawFrame();
            },
            play: () => {
              playing = true;
            },
          };
          drawFrame();
        } else {
          playing = true;
          raf = requestAnimationFrame(tick);
        }
      })
      .catch(() => finish());

    return () => {
      disposed = true;
      stopUpgrade();
      window.clearTimeout(timeout);
      window.removeEventListener('resize', resize);
      canvas.removeEventListener('webglcontextlost', onLost);
      cancelAnimationFrame(raf);
      tl?.kill();
      surface?.dispose();
      hero?.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
      delete window.__beyondTerraIntro;
    };
  }, []);

  return (
    <div ref={rootRef} className="bt-intro" role="region" aria-label="Beyond Terra introduction">
      <div ref={stageRef} className="bt-intro__stage" aria-hidden="true" />
      <div ref={vignetteRef} className="bt-intro__vignette" aria-hidden="true" />
      <div ref={fadeRef} className="bt-intro__fade" aria-hidden="true" />
    </div>
  );
}
