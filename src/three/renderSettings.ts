import * as THREE from 'three';

/**
 * The intro and the homepage must render Mars at the same pixel ratio, so the moment
 * one hands over to the other is invisible.
 */
export function renderPixelRatio(quality: 'high' | 'low'): number {
  return Math.min(window.devicePixelRatio || 1, quality === 'high' ? 2 : 1.5);
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
