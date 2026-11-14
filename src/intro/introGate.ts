import { isWebGLAvailable } from '../three/assets';

const SEEN_KEY = 'beyond-terra:intro-seen';

export function prefersReducedMotion(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

function readSeen(): boolean {
  try {
    return sessionStorage.getItem(SEEN_KEY) === '1';
  } catch {
    return false;
  }
}

export function markIntroSeen() {
  try {
    sessionStorage.setItem(SEEN_KEY, '1');
  } catch {
    /* storage unavailable: the intro may play again, which is harmless */
  }
}

/**
 * The cinematic opening plays once per browsing session, on the homepage only.
 * `?intro` replays it; `?nointro` skips it. It never plays with reduced motion or
 * without WebGL: visitors go straight to the website.
 */
export function shouldPlayIntro(): boolean {
  const params = new URLSearchParams(window.location.search);
  if (params.has('nointro')) return false;
  const onHome = !window.location.hash.startsWith('#/') || window.location.hash === '#/';
  if (!onHome) return false;
  if (prefersReducedMotion()) return false;
  if (!isWebGLAvailable()) return false;
  if (!params.has('intro') && readSeen()) return false;
  markIntroSeen();
  return true;
}
