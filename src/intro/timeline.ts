import { gsap } from 'gsap';
import { addHeroReveal, hiddenReveal } from '../three/heroReveal';
import type { HeroReveal } from '../three/marsHero';
import type { ThirdPersonState } from './scene/thirdPersonScene';

/**
 * The astronaut opening, about 2.6 s.
 *
 *  0.0–0.5   Fade up on the astronaut's upper body and helmet, the tablet already rising
 *  0.1–0.9   The astronaut raises the tablet and looks down at it; the screen wakes
 *  0.65–2.25 On the screen, the Beyond Terra reveal (shortened to 1.6 s)
 *  0.35–2.2  The camera moves round over the right shoulder and onto the screen; the
 *            astronaut leaves the frame; the bezel leaves the frame
 *  2.2       Handoff: the screen exactly fills the viewport and the website takes over
 *  2.25–2.6  The intro dissolves onto the identical globe
 */
export const TIMING = {
  revealAt: 0.65,
  revealDuration: 1.6,
  cam: [0.35, 2.2],
  handoff: 2.2,
  exit: [2.25, 2.6],
  /** A character model can be several megabytes: allow it time before giving up */
  loadTimeout: 12,
} as const;

export interface IntroState extends ThirdPersonState {
  fadeIn: number;
  vignette: number;
  heroMode: number;
  exit: number;
}

export function createInitialState(): IntroState {
  return {
    cam: 0,
    raise: 0,
    headYaw: 0,
    headPitch: 0,
    screenOn: 0,
    led: 0,
    glare: 0.05,
    fadeIn: 1,
    vignette: 1,
    heroMode: 0,
    exit: 0,
  };
}

/** `reveal` is the tablet hero's reveal state; it starts hidden and plays on the screen. */
export function createIntroTimeline(state: IntroState, reveal: HeroReveal): gsap.core.Timeline {
  Object.assign(reveal, hiddenReveal());
  const tl = gsap.timeline({ paused: true });

  // Fade up with the tablet already coming up; the astronaut looks down at it
  tl.to(state, { fadeIn: 0, duration: 0.5, ease: 'power1.out' }, 0);
  tl.to(state, { raise: 1, duration: 0.8, ease: 'power2.inOut' }, 0.1);
  tl.to(state, { headPitch: -0.42, duration: 0.75, ease: 'power2.inOut' }, 0.15);
  tl.to(state, { led: 1, duration: 0.15, ease: 'power1.out' }, 0.55);
  tl.to(state, { screenOn: 1, duration: 0.35, ease: 'power2.out' }, 0.6);
  addHeroReveal(tl, reveal, TIMING.revealAt, TIMING.revealDuration);

  // Round the shoulder, onto the screen, until it fills the viewport
  tl.to(state, { cam: 1, duration: TIMING.cam[1] - TIMING.cam[0], ease: 'power2.inOut' }, TIMING.cam[0]);
  tl.to(state, { glare: 0, duration: 0.6, ease: 'power1.in' }, 1.5);
  tl.to(state, { vignette: 0, duration: 0.6, ease: 'power1.inOut' }, 1.6);

  tl.set(state, { heroMode: 1 }, TIMING.handoff);
  tl.to(state, { exit: 1, duration: TIMING.exit[1] - TIMING.exit[0], ease: 'power1.inOut' }, TIMING.exit[0]);
  return tl;
}
