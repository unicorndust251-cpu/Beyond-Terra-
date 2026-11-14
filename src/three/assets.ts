import * as THREE from 'three';

/**
 * Globe textures. Colour: Solar System Scope (CC BY 4.0), built from NASA imagery; the
 * 4k and 6k maps are their 8k map resampled. Relief: normal map derived from MOLA
 * elevation data (NASA/GSFC).
 *
 * The 4k map loads first, so the planet appears quickly. On large or high-density
 * screens the 6k map then loads in the background and replaces it in every view at
 * once, keeping about two texels per device pixel at the centre of the disc.
 */
export const MARS_TEXTURE_URLS = {
  color: '/textures/mars_color_4k.jpg',
  /** For GPUs that cannot hold a 4096-pixel texture. */
  colorSmall: '/textures/mars_color_2k.jpg',
  /** Background upgrade for large or high-density screens. */
  colorLarge: '/textures/mars_color_6k.jpg',
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
      loadImage(maxTextureSize() >= 4096 ? MARS_TEXTURE_URLS.color : MARS_TEXTURE_URLS.colorSmall),
      loadImage(MARS_TEXTURE_URLS.normal),
    ]).then(([color, normal]) => ({ color, normal }));
    marsImagesPromise.then(loadLargeColor, () => {
      // Allow a retry on a later call if this attempt failed
      marsImagesPromise = null;
    });
  }
  return marsImagesPromise;
}

let largeColor: HTMLImageElement | null = null;
let largeColorRequested = false;
const largeColorListeners = new Set<(image: HTMLImageElement) => void>();

/** Disc diameter in device pixels at the hero framing (see heroLayout). */
function heroDiscDevicePixels(): number {
  const css = Math.min(window.innerHeight * 0.7, window.innerWidth * 0.84);
  return css * Math.min(window.devicePixelRatio || 1, 2);
}

function loadLargeColor() {
  if (largeColorRequested) return;
  largeColorRequested = true;
  // The 4k map gives about 1.3 texels per pixel at a 1000-pixel disc: upgrade beyond ~800
  if (maxTextureSize() < 8192 || getQuality() !== 'high' || heroDiscDevicePixels() < 800) return;
  loadImage(MARS_TEXTURE_URLS.colorLarge)
    .then((img) => img.decode().then(() => img))
    .then((img) => {
      largeColor = img;
      largeColorListeners.forEach((cb) => cb(img));
    })
    .catch(() => {
      /* keep the 4k map */
    });
}

/**
 * Calls `cb` with the 6k colour map once it is ready (immediately if it already is).
 * Every view of the planet subscribes, so they all switch together.
 */
export function onLargeMarsColor(cb: (image: HTMLImageElement) => void): () => void {
  if (largeColor) cb(largeColor);
  else largeColorListeners.add(cb);
  return () => largeColorListeners.delete(cb);
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
let webglMaxTexture = 0;

export function isWebGLAvailable(): boolean {
  if (webglSupport !== null) return webglSupport;
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2');
    webglSupport = !!gl;
    webglMaxTexture = gl ? gl.getParameter(gl.MAX_TEXTURE_SIZE) : 0;
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
  } catch {
    webglSupport = false;
  }
  return webglSupport;
}

function maxTextureSize(): number {
  isWebGLAvailable();
  return webglMaxTexture;
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
