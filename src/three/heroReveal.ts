import type { HeroReveal } from './marsHero';

/**
 * The Mars reveal. The same choreography plays on the astronaut's tablet and, on a direct
 * visit, full-screen, so both views of the hero match. Phases, as fractions of the length:
 *
 *  0.000–0.375  Mars emerges from darkness as warm sunlight rises; the camera starts forward
 *  0.375–0.575  BEYOND TERRA fades in, rising slightly and sharpening from a soft blur
 *  0.575–1.000  The camera settles into the final framing
 *
 * Nothing leaves the page afterwards: the final composition holds indefinitely.
 */
export const REVEAL_DURATION = 2.4;

/** Seconds into the reveal at which the composition has settled (the credit line appears). */
export const REVEAL_SETTLED_AT = REVEAL_DURATION * 0.75;

export function hiddenReveal(): HeroReveal {
  return { light: 0, push: 0, title: 0 };
}

/** Adds the reveal to `tl` at `at` seconds, lasting `duration`, animating `reveal` in place. */
export function addHeroReveal(tl: gsap.core.Timeline, reveal: HeroReveal, at = 0, duration = REVEAL_DURATION) {
  tl.to(reveal, { light: 1, duration: duration * 0.375, ease: 'power2.inOut' }, at);
  tl.to(reveal, { push: 1, duration, ease: 'power2.out' }, at);
  tl.to(reveal, { title: 1, duration: duration * 0.2, ease: 'power2.out' }, at + duration * 0.375);
  return tl;
}
