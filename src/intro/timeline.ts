import { gsap } from 'gsap';
import { addHeroReveal, hiddenReveal } from '../three/heroReveal';
import type { HeroReveal } from '../three/marsHero';
import type { SurfaceState } from './scene/surfaceScene';

/**
 * The astronaut-to-website sequence, about 9.9 s.
 *
 *  0.0–1.5  Fade up on the Martian plain through the astronaut's eyes; a slow look across it
 *  1.5–3.0  The tablet swings up from the chest and locks; the status lights and screen wake
 *  3.0–7.0  On the screen, the original four-second Beyond Terra reveal: Mars out of darkness,
 *           then BEYOND TERRA (4.5–5.3)
 *  5.0–7.5  The astronaut leans in; the tablet grows in the frame
 *  7.5–9.0  The camera squares up and enters the screen; the bezel leaves the frame
 *  9.0      Handoff: the screen exactly fills the viewport and the website takes over
 *           (the same image: same planet, rotation, lighting and title)
 *  9.35–9.85 The intro dissolves onto the identical homepage, which then stays
 */
export const TIMING = {
  revealAt: 3.0,
  dolly: [5.0, 9.0],
  handoff: 9.0,
  exit: [9.35, 9.85],
  skipFade: 0.55,
  loadTimeout: 9,
} as const;

export interface IntroState extends SurfaceState {
  fadeIn: number;
  vignette: number;
  caption: number;
  heroMode: number;
  exit: number;
}

export function createInitialState(): IntroState {
  return {
    look: 0,
    pan: 1,
    raise: 0,
    settle: 0,
    dolly: 0,
    screenOn: 0,
    led: 0,
    glare: 0.05,
    fadeIn: 1,
    vignette: 1,
    caption: 0,
    heroMode: 0,
    exit: 0,
  };
}

/** `reveal` is the tablet hero's reveal state; it starts hidden and plays on the screen. */
export function createIntroTimeline(state: IntroState, reveal: HeroReveal): gsap.core.Timeline {
  Object.assign(reveal, hiddenReveal());
  const tl = gsap.timeline({ paused: true });

  // Establishing shot
  tl.to(state, { fadeIn: 0, duration: 1.4, ease: 'power1.out' }, 0);
  tl.to(state, { pan: 0, duration: 2.6, ease: 'sine.inOut' }, 0);
  tl.to(state, { caption: 1, duration: 0.6, ease: 'power1.out' }, 0.6);
  tl.to(state, { caption: 0, duration: 0.5, ease: 'power1.in' }, 3.6);

  // The tablet comes up and the eyes follow it down
  tl.to(state, { raise: 1, duration: 1.5, ease: 'power2.inOut' }, 1.4);
  tl.to(state, { look: 1, duration: 1.8, ease: 'power2.inOut' }, 1.3);
  tl.to(state, { settle: 1, duration: 0.1, ease: 'power2.out' }, 2.86);
  tl.to(state, { settle: 0, duration: 0.35, ease: 'power2.inOut' }, 2.96);

  // Activation
  tl.to(state, { led: 1, duration: 0.25, ease: 'power1.out' }, 2.8);
  tl.to(state, { screenOn: 1, duration: 0.5, ease: 'power2.out' }, 2.95);
  addHeroReveal(tl, reveal, TIMING.revealAt);

  // One continuous lean into the screen
  const [d0, d1] = TIMING.dolly;
  tl.to(state, { dolly: 1, duration: d1 - d0, ease: 'power2.inOut' }, d0);

  // Reflections and the lens grade leave before the screen fills the view
  tl.to(state, { glare: 0, duration: 1.6, ease: 'power1.in' }, 6.6);
  tl.to(state, { vignette: 0, duration: 1.6, ease: 'power1.inOut' }, 7.0);

  tl.set(state, { heroMode: 1 }, TIMING.handoff);
  tl.to(state, { exit: 1, duration: TIMING.exit[1] - TIMING.exit[0], ease: 'power1.inOut' }, TIMING.exit[0]);
  return tl;
}
