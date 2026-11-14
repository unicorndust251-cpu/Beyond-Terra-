import * as THREE from 'three';

/**
 * Globe textures. Colour: Solar System Scope (CC BY 4.0), built from NASA imagery.
 * Relief: normal map derived from MOLA elevation data (NASA/GSFC).
 */
export const MARS_TEXTURE_URLS = {
  color: '/textures/mars_color_2k.jpg',
  normal: '/textures/mars_normal_2k.jpg',
} as const;

export interface MarsImages {
  color: HTMLImageElement;
  normal: HTMLImageElement;
}

let marsImagesPromise: Promise<MarsImages> | null = null;

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Could not load ${url}`));
    img.src = url;
  });
}

/**
 * Loads (once per page) and decodes the Mars images. The intro and the homepage each
 * build their own THREE.Texture from the same decoded images, so neither can dispose
 * the other's GPU copy.
 */
export function loadMarsImages(): Promise<MarsImages> {
  if (!marsImagesPromise) {
    marsImagesPromise = Promise.all([
      loadImage(MARS_TEXTURE_URLS.color),
      loadImage(MARS_TEXTURE_URLS.normal),
    ]).then(([color, normal]) => ({ color, normal }));
    // Allow a retry on a later call if this attempt failed
    marsImagesPromise.catch(() => {
      marsImagesPromise = null;
    });
  }
  return marsImagesPromise;
}

let titleFontPromise: Promise<void> | null = null;

/** Waits for Exo 2 (self-hosted) so text drawn into WebGL uses the brand face. */
export function loadTitleFont(timeoutMs = 2500): Promise<void> {
  if (!titleFontPromise) {
    const fonts = typeof document !== 'undefined' ? document.fonts : undefined;
    const load = fonts
      ? fonts.load('800 120px "Exo 2"', 'BEYOND TERRA').then(() => undefined)
      : Promise.resolve();
    const timeout = new Promise<void>((resolve) => setTimeout(resolve, timeoutMs));
    titleFontPromise = Promise.race([load, timeout]).catch(() => undefined);
  }
  return titleFontPromise;
}

let webglSupport: boolean | null = null;

export function isWebGLAvailable(): boolean {
  if (webglSupport !== null) return webglSupport;
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2');
    webglSupport = !!gl;
    (gl as WebGL2RenderingContext | null)?.getExtension('WEBGL_lose_context')?.loseContext();
  } catch {
    webglSupport = false;
  }
  return webglSupport;
}

/** Coarse device tier used to scale shadow maps, geometry density and pixel ratio. */
export function getQuality(): 'high' | 'low' {
  const coarse = window.matchMedia?.('(pointer: coarse)').matches ?? false;
  const small = Math.min(window.innerWidth, window.innerHeight) < 700;
  const cores = navigator.hardwareConcurrency ?? 8;
  return coarse || small || cores <= 4 ? 'low' : 'high';
}

export function makeTexture(
  image: HTMLImageElement,
  renderer: THREE.WebGLRenderer,
  colorSpace: THREE.ColorSpace,
): THREE.Texture {
  const tex = new THREE.Texture(image);
  tex.colorSpace = colorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.needsUpdate = true;
  return tex;
}

/** One clock for every view of the planet, so all copies of Mars show the same rotation. */
export function sharedSeconds(): number {
  return performance.now() / 1000;
}
