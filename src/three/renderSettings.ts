import * as THREE from 'three';

/**
 * The intro and the homepage must render Mars at the same pixel ratio, so the moment
 * one hands over to the other is invisible.
 */
export function renderPixelRatio(): number {
  // Up to 2x on every device: the planet and title stay crisp on phones and tablets too
  return Math.min(window.devicePixelRatio || 1, 2);
}

export function createRenderer(canvas: HTMLCanvasElement): THREE.WebGLRenderer {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
    powerPreference: 'high-performance',
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1;
  renderer.setClearColor('#050507', 1);
  return renderer;
}

export function viewportSize() {
  return { width: window.innerWidth, height: window.innerHeight };
}
