import { gsap } from 'gsap';
import type { SurfaceState } from './scene/surfaceScene';

/**
 * The astronaut-to-website sequence, about 7.3 s.
 *
 *  0.0–1.2  Martian arrival: fade up, the camera starts a slow push-in, the tablet rises
 *  1.2–2.2  Activation: thumb on the wake key, status lights, Beyond Terra fades up
 *  2.2–4.2  The camera travels over the shoulder towards the screen
 *  4.2–5.0  The camera squares up; the bezel slides out of frame; the screen fills the view
 *  5.0      Handoff: the same hero image is now drawn full-screen (no cut, same pixels)
 *  5.0–6.3  Hero moment: Mars rotating behind BEYOND TERRA
 *  6.3–7.3  The title fades and the homepage takes over
 */
export const TIMING = {
  camera: [0, 5.0],
  handoff: 5.0,
  titleFade: [6.3, 7.0],
  exit: [6.75, 7.3],
  total: 7.3,
  skipFade: 0.55,
  loadTimeout: 9,
} as const;

export interface IntroState extends SurfaceState {
  fadeIn: number;
  vignette: number;
  caption: number;
  heroMode: number;
  title: number;
  exit: number;
}

export function createInitialState(): IntroState {
  return {
    cam: 0,
    raise: 0,
    press: 0,
    screenOn: 0,
    led: 0,
    glare: 0.12,
    fadeIn: 1,
    vignette: 1,
    caption: 0,
    heroMode: 0,
    title: 1,
    exit: 0,
  };
}

export function createIntroTimeline(state: IntroState): gsap.core.Timeline {
  const tl = gsap.timeline({ paused: true });
  const [camStart, camEnd] = TIMING.camera;

  tl.to(state, { fadeIn: 0, duration: 1.0, ease: 'power1.out' }, 0);
  tl.to(state, { caption: 1, duration: 0.6, ease: 'power1.out' }, 0.5);
  tl.to(state, { caption: 0, duration: 0.5, ease: 'power1.in' }, 3.0);

  // One continuous camera move from the medium shot to square-on with the screen
  tl.to(state, { cam: 1, duration: camEnd - camStart, ease: 'power3.inOut' }, camStart);

  // The astronaut lifts the tablet into reading position
  tl.to(state, { raise: 1, duration: 1.5, ease: 'power2.inOut' }, 0.1);

  // Activation
  tl.to(state, { press: 1, duration: 0.14, ease: 'power2.in' }, 1.24);
  tl.to(state, { press: 0, duration: 0.24, ease: 'power2.out' }, 1.42);
  tl.to(state, { led: 1, duration: 0.25, ease: 'power1.out' }, 1.36);
  tl.to(state, { screenOn: 1, duration: 0.8, ease: 'power2.out' }, 1.42);

  // Reflections and the cinematic grade leave before the screen fills the view
  tl.to(state, { glare: 0, duration: 1.1, ease: 'power1.in' }, 3.4);
  tl.to(state, { vignette: 0, duration: 1.0, ease: 'power1.inOut' }, 3.7);

  tl.set(state, { heroMode: 1 }, TIMING.handoff);

  tl.to(state, { title: 0, duration: TIMING.titleFade[1] - TIMING.titleFade[0], ease: 'power1.inOut' }, TIMING.titleFade[0]);
  tl.to(state, { exit: 1, duration: TIMING.exit[1] - TIMING.exit[0], ease: 'power1.inOut' }, TIMING.exit[0]);
  return tl;
}
