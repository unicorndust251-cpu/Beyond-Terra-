import type { HeroReveal } from './marsHero';

/**
 * The original four-second Mars reveal. The same choreography plays on the astronaut's
 * tablet and, on a direct visit, full-screen, so both views of the hero match.
 *
 *  0.0–0.7  Mars emerges from darkness as warm sunlight rises; the camera starts forward
 *  0.7–1.5  The planet is fully lit and rotating; the push-in continues
 *  1.5–2.3  BEYOND TERRA fades in, rising slightly and sharpening from a soft blur
 *  2.3–3.3  Hero moment: the composition holds
 *  3.3–4.0  The camera settles into the final framing
 *
 * Nothing leaves the page afterwards: the final composition holds indefinitely.
 */
export const REVEAL_DURATION = 4;

/** Seconds into the reveal at which the composition has settled (the credit line appears). */
export const REVEAL_SETTLED_AT = 3.3;

export function hiddenReveal(): HeroReveal {
  return { light: 0, push: 0, title: 0 };
}

/** Adds the reveal to `tl` at `at` seconds, animating `reveal` in place. */
export function addHeroReveal(tl: gsap.core.Timeline, reveal: HeroReveal, at = 0) {
  tl.to(reveal, { light: 1, duration: 1.5, ease: 'power2.inOut' }, at);
  tl.to(reveal, { push: 1, duration: REVEAL_DURATION, ease: 'power2.out' }, at);
  tl.to(reveal, { title: 1, duration: 0.8, ease: 'power2.out' }, at + 1.5);
  return tl;
}
