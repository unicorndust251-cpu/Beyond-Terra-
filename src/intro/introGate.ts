import { isWebGLAvailable } from '../three/assets';

export function prefersReducedMotion(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

/**
 * The cinematic opening plays every time the site is opened or reloaded, all the way
 * through. `?nointro` (for development) leaves it out.
 * It never plays with reduced motion or without WebGL: visitors go straight to the website.
 */
export function shouldPlayIntro(): boolean {
  const params = new URLSearchParams(window.location.search);
  if (params.has('nointro')) return false;
  if (prefersReducedMotion()) return false;
  if (!isWebGLAvailable()) return false;
  return true;
}
