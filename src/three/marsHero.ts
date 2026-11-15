import * as THREE from 'three';
import { makeTexture, type MarsImages } from './assets';

/**
 * The original BEYOND TERRA hero: a slowly rotating, physically lit Mars on deep space,
 * with the BEYOND TERRA title across its centre.
 *
 * Every view of the hero (the homepage background, the astronaut's tablet screen and the
 * full-screen intro) is drawn by this class into a linear, high-precision render target,
 * then shown with the same final pass. Because the pipeline is identical, the tablet
 * screen at the end of the camera move is the same image as the full-screen website,
 * pixel for pixel, so the intro can hand over without a cut.
 */

export const HERO = {
  background: '#050507',
  title: '#F5F1ED',
  fov: 30,
  /** Planet disc as a fraction of viewport height at the hero moment (spec: 65–75%). */
  fillHeight: 0.7,
  /** On narrow screens, cap the disc at this fraction of the viewport width. */
  fillWidth: 0.84,
  /** Title width relative to the disc: wide enough to extend slightly past the limb. */
  titleOverhang: 1.16,
  /** Title cannot be wider than this fraction of the viewport. */
  titleMaxWidth: 0.94,
  letterSpacing: 0.12,
  spinRate: 0.045, // rad/s — about 2.3 minutes per turn
  sunColor: '#FFD8B2',
  sunIntensity: 3.6,
  /** Direction towards the sun, in camera space: from the left, slightly above and in front. */
  sunDir: new THREE.Vector3(-0.93, 0.26, 0.42).normalize(),
  rimInner: '#C06A40', // burnt orange
  rimOuter: '#D6A38B', // copper glow
  terminator: '#B87860', // muted terracotta
} as const;

/**
 * The Mars reveal, as three progress values (0 → 1). The intro plays it
 * on the tablet; a direct visit plays it full-screen. Once complete it stays complete:
 * the hero then holds its final composition and the planet keeps rotating.
 */
export interface HeroReveal {
  /** Warm sunlight rising on the planet out of darkness. */
  light: number;
  /** A restrained camera push-in that settles into the final framing. */
  push: number;
  /** BEYOND TERRA fading in, rising slightly and sharpening from a soft blur. */
  title: number;
}

export const REVEAL_COMPLETE: Readonly<HeroReveal> = { light: 1, push: 1, title: 1 };

/** Disc size at the start of the push-in, relative to the final framing. */
const PUSH_FROM = 0.88;

export interface PlanetLayout {
  /** Disc centre as a fraction of viewport width (0 = left). */
  cx: number;
  /** Disc centre as a fraction of viewport height (0 = top). */
  cy: number;
  /** Disc diameter in CSS pixels. */
  diameter: number;
}

export function heroLayout(width: number, height: number): PlanetLayout {
  return {
    cx: 0.5,
    cy: 0.5,
    diameter: Math.min(height * HERO.fillHeight, width * HERO.fillWidth),
  };
}

/** Spin that puts a given longitude (degrees east) at the centre of the disc. */
function spinForLongitude(lonDeg: number): number {
  return -THREE.MathUtils.degToRad(lonDeg + 90);
}

// At about 8 s after page load (the tablet's hero moment, just before the camera enters
// the screen), Valles Marineris sits just left of centre, in the sunlit half.
const SPIN_AT_ZERO = spinForLongitude(-52) - HERO.spinRate * 8;

export function heroSpinAt(seconds: number): number {
  return SPIN_AT_ZERO + seconds * HERO.spinRate;
}

/** Small deterministic PRNG, so every copy of the starfield is identical. */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface MarsHeroOptions {
  /** Draw the BEYOND TERRA title into the hero. */
  title?: boolean;
  quality?: 'high' | 'low';
}

export class MarsHero {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(HERO.fov, 1, 0.1, 400);
  readonly target: THREE.WebGLRenderTarget;

  readonly reveal: HeroReveal = { ...REVEAL_COMPLETE };
  layout: PlanetLayout = { cx: 0.5, cy: 0.5, diameter: 100 };

  private readonly renderer: THREE.WebGLRenderer;
  private readonly planetGroup = new THREE.Group();
  private readonly spinGroup = new THREE.Group();
  private readonly sun: THREE.DirectionalLight;
  private readonly ambient: THREE.AmbientLight;
  private readonly atmosphereMaterial: THREE.ShaderMaterial;
  private readonly marsUniforms: Record<string, THREE.IUniform>;
  private readonly starMaterial: THREE.ShaderMaterial;
  private readonly marsMaterial: THREE.MeshStandardMaterial;
  private readonly textures: THREE.Texture[] = [];

  private readonly titleScene = new THREE.Scene();
  private readonly titleCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, -1, 1);
  private titleMesh: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial> | null = null;
  private titleBaseY = 0;
  private titleRise = 0;
  private readonly wantsTitle: boolean;

  private readonly presentScene = new THREE.Scene();
  private readonly presentCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  private width = 1;
  private height = 1;
  private pixelRatio = 1;

  constructor(renderer: THREE.WebGLRenderer, images: MarsImages, options: MarsHeroOptions = {}) {
    this.renderer = renderer;
    this.wantsTitle = options.title ?? true;
    const high = (options.quality ?? 'high') === 'high';

    // Linear, high-precision target: blending happens in linear light for every view.
    const canHalfFloat =
      renderer.extensions.has('EXT_color_buffer_half_float') ||
      renderer.extensions.has('EXT_color_buffer_float');
    this.target = new THREE.WebGLRenderTarget(1, 1, {
      type: canHalfFloat ? THREE.HalfFloatType : THREE.UnsignedByteType,
      samples: 4,
      depthBuffer: true,
    });
    this.target.texture.minFilter = THREE.LinearFilter;
    this.target.texture.magFilter = THREE.LinearFilter;
    this.target.texture.generateMipmaps = false;

    this.scene.background = new THREE.Color(HERO.background);

    // --- Planet -----------------------------------------------------------------
    const color = makeTexture(images.color, renderer, THREE.SRGBColorSpace);
    const normal = makeTexture(images.normal, renderer, THREE.NoColorSpace);
    this.textures.push(color, normal);

    const { material, uniforms } = createMarsMaterial(color, normal);
    this.marsMaterial = material;
    this.marsUniforms = uniforms;
    const planet = new THREE.Mesh(
      new THREE.SphereGeometry(1, high ? 192 : 128, high ? 128 : 96),
      material,
    );
    this.spinGroup.add(planet);

    this.atmosphereMaterial = createAtmosphereMaterial(1.05);
    const atmosphere = new THREE.Mesh(
      new THREE.SphereGeometry(1.05, high ? 128 : 96, high ? 96 : 64),
      this.atmosphereMaterial,
    );

    // Axial tilt, framed so a little more of the northern hemisphere faces us
    const tilt = new THREE.Group();
    tilt.rotation.set(0.16, 0, -0.3);
    tilt.add(this.spinGroup);
    this.planetGroup.add(tilt, atmosphere);
    this.scene.add(this.planetGroup);

    // --- Light ------------------------------------------------------------------
    this.sun = new THREE.DirectionalLight(HERO.sunColor, HERO.sunIntensity);
    this.sun.target = this.planetGroup;
    this.scene.add(this.sun);
    // The faintest bounce, so the night side melts into space rather than cutting out
    this.ambient = new THREE.AmbientLight('#3a2620', 0.035);
    this.scene.add(this.ambient);

    // --- Stars ------------------------------------------------------------------
    this.starMaterial = createStarMaterial();
    this.scene.add(createStars(this.starMaterial, high ? 1500 : 900));

    this.presentScene.add(
      new THREE.Mesh(
        new THREE.PlaneGeometry(2, 2),
        new THREE.MeshBasicMaterial({
          map: this.target.texture,
          toneMapped: false,
          depthTest: false,
          depthWrite: false,
        }),
      ),
    );
  }

  /** Swaps in a higher-resolution colour map (uploaded now, so the next frame uses it). */
  setColorImage(image: HTMLImageElement) {
    const previous = this.marsMaterial.map;
    const color = makeTexture(image, this.renderer, THREE.SRGBColorSpace);
    this.renderer.initTexture(color);
    this.marsMaterial.map = color;
    this.textures.push(color);
    if (previous) {
      previous.dispose();
      this.textures.splice(this.textures.indexOf(previous), 1);
    }
  }

  /** Size in CSS pixels. The target always matches the drawing buffer exactly. */
  setSize(width: number, height: number, pixelRatio: number) {
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
    this.pixelRatio = pixelRatio;
    this.target.setSize(
      Math.round(this.width * pixelRatio),
      Math.round(this.height * pixelRatio),
    );
    this.camera.aspect = this.width / this.height;
    this.camera.updateProjectionMatrix();
    this.starMaterial.uniforms.uPixelRatio.value = pixelRatio;
    this.applyLayout();
    if (this.wantsTitle) this.buildTitle();
  }

  setLayout(layout: PlanetLayout) {
    this.layout = layout;
    this.applyLayout();
  }

  get aspect() {
    return this.width / this.height;
  }

  /** Draws the hero into its render target. */
  render(seconds: number) {
    const { light, push, title } = this.reveal;
    this.applyLayout(PUSH_FROM + (1 - PUSH_FROM) * push);
    this.spinGroup.rotation.y = heroSpinAt(seconds);
    this.sun.position.copy(this.planetGroup.position).addScaledVector(HERO.sunDir, 20);
    this.sun.intensity = HERO.sunIntensity * light;
    this.ambient.intensity = 0.035 * light;
    this.atmosphereMaterial.uniforms.uStrength.value = light;

    const r = this.renderer;
    const prevTarget = r.getRenderTarget();
    const prevAutoClear = r.autoClear;

    r.setRenderTarget(this.target);
    r.autoClear = true;
    r.render(this.scene, this.camera);

    if (this.titleMesh && title > 0.001) {
      const u = this.titleMesh.material.uniforms;
      u.uOpacity.value = THREE.MathUtils.smoothstep(title, 0, 0.85);
      u.uSharp.value = title;
      this.titleMesh.position.y = this.titleBaseY - this.titleRise * (1 - title);
      r.autoClear = false;
      r.render(this.titleScene, this.titleCamera);
    }

    r.autoClear = prevAutoClear;
    r.setRenderTarget(prevTarget);
  }

  /** Shows the last render on screen (the same final pass for every view). */
  present() {
    const r = this.renderer;
    r.setRenderTarget(null);
    r.render(this.presentScene, this.presentCamera);
  }

  dispose() {
    const dispose = (obj: THREE.Object3D) => {
      obj.traverse((child) => {
        const mesh = child as THREE.Mesh;
        mesh.geometry?.dispose();
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        mats.forEach((m) => {
          if (!m) return;
          const basic = m as THREE.MeshBasicMaterial;
          if (basic.map && basic.map !== this.target.texture) basic.map.dispose();
          disposeUniformTextures(m);
          m.dispose();
        });
      });
    };
    dispose(this.scene);
    dispose(this.titleScene);
    dispose(this.presentScene);
    this.textures.forEach((t) => t.dispose());
    this.target.dispose();
  }

  private applyLayout(scale = 1) {
    const { cx, cy } = this.layout;
    const diameter = this.layout.diameter * scale;
    const tanHalf = Math.tan(THREE.MathUtils.degToRad(HERO.fov / 2));
    // Angular radius that makes the disc `diameter` pixels tall
    const alpha = Math.atan((diameter / this.height) * tanHalf);
    const dist = 1 / Math.sin(alpha);
    const ndcX = cx * 2 - 1;
    const ndcY = 1 - cy * 2;
    this.planetGroup.position.set(
      ndcX * tanHalf * this.camera.aspect * dist,
      ndcY * tanHalf * dist,
      -dist,
    );
    this.marsUniforms.uSunDirView.value.copy(HERO.sunDir);
  }

  /** Renders BEYOND TERRA (Exo 2, 800, 0.12em) into a texture laid over the planet. */
  private buildTitle() {
    if (this.titleMesh) {
      this.titleMesh.geometry.dispose();
      disposeUniformTextures(this.titleMesh.material);
      this.titleMesh.material.dispose();
      this.titleScene.remove(this.titleMesh);
      this.titleMesh = null;
    }

    const w = this.width;
    const h = this.height;
    const dpr = this.pixelRatio;
    const hero = heroLayout(w, h);
    const targetWidth = Math.min(hero.diameter * HERO.titleOverhang, w * HERO.titleMaxWidth);

    const text = 'BEYOND TERRA';
    const family = '"Exo 2", system-ui, sans-serif';
    const measure = document.createElement('canvas').getContext('2d')!;
    const widthAt = (size: number) => {
      measure.font = `800 ${size}px ${family}`;
      return measureSpaced(measure, text, size * HERO.letterSpacing);
    };
    const fontSize = (100 * targetWidth) / widthAt(100);
    const spacing = fontSize * HERO.letterSpacing;

    const pad = fontSize * 0.6;
    const cssW = targetWidth + pad * 2;
    const cssH = fontSize * 2.2;

    const paint = (blurPx: number) => {
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(cssW * dpr);
      canvas.height = Math.ceil(cssH * dpr);
      const ctx = canvas.getContext('2d')!;
      ctx.scale(dpr, dpr);
      ctx.font = `800 ${fontSize}px ${family}`;
      ctx.textBaseline = 'alphabetic';
      if (blurPx > 0) ctx.filter = `blur(${blurPx}px)`;

      // Centre the capitals' box on the planet's centre
      const metrics = ctx.measureText(text);
      const capHeight = metrics.actualBoundingBoxAscent || fontSize * 0.7;
      const baseline = cssH / 2 + capHeight / 2;
      ctx.fillStyle = '#fff';
      drawSpaced(ctx, text, pad, baseline, spacing);

      // Only the coverage (alpha) is used: colour, glow and shadow are added in the shader
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.NoColorSpace;
      texture.minFilter = THREE.LinearFilter;
      texture.generateMipmaps = false;
      return texture;
    };

    // Sharp letterforms; a soft copy for the blur-to-sharp reveal and the drop shadow; a
    // wide copy for the faint copper glow. Canvas filters are missing on older Safari:
    // there the title simply fades and rises, without glow.
    const sharp = paint(0);
    const canBlur = 'filter' in measure;
    const soft = canBlur ? paint(fontSize * 0.08) : sharp;
    const wide = canBlur ? paint(fontSize * 0.32) : null;

    const material = createTitleMaterial(sharp, soft, wide, (fontSize * 0.03) / cssH);
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(cssW, cssH), material);
    this.titleBaseY = h / 2 - hero.cy * h;
    this.titleRise = fontSize * 0.16;
    mesh.position.set(hero.cx * w - w / 2, this.titleBaseY, 0);
    this.titleMesh = mesh;
    this.titleScene.add(mesh);

    this.titleCamera.left = -w / 2;
    this.titleCamera.right = w / 2;
    this.titleCamera.top = h / 2;
    this.titleCamera.bottom = -h / 2;
    this.titleCamera.updateProjectionMatrix();
  }
}

// Letter spacing is drawn by hand: canvas `letterSpacing` is not available everywhere.
// Pair kerning is kept by measuring each prefix of the string, not each glyph alone.
function measureSpaced(ctx: CanvasRenderingContext2D, text: string, spacing: number) {
  return ctx.measureText(text).width + spacing * (text.length - 1);
}

function drawSpaced(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  spacing: number,
) {
  for (let i = 0; i < text.length; i++) {
    const prefix = ctx.measureText(text.slice(0, i)).width;
    ctx.fillText(text[i], x + prefix + spacing * i, y);
  }
}

// ---------------------------------------------------------------------------------
// Materials. All output linear light (no tone mapping), so every view matches.
// ---------------------------------------------------------------------------------

/** Negative = sharper. -0.6 keeps the full-resolution level at hero size without shimmer. */
const MAP_LOD_BIAS = '-0.6';

function createMarsMaterial(color: THREE.Texture, normal: THREE.Texture) {
  const uniforms: Record<string, THREE.IUniform> = {
    uSunDirView: { value: HERO.sunDir.clone() },
    uTerminator: { value: new THREE.Color(HERO.terminator) },
    uHaze: { value: new THREE.Color(HERO.rimOuter) },
    uFloor: { value: new THREE.Color(HERO.background) },
  };

  const material = new THREE.MeshStandardMaterial({
    map: color,
    normalMap: normal,
    normalScale: new THREE.Vector2(1.3, 1.3),
    roughness: 0.97,
    metalness: 0,
    toneMapped: false,
  });

  // Sample the colour and relief maps with a negative LOD bias: at hero size the GPU
  // would otherwise blend in the half-resolution mip level and soften the surface
  const sharpMap = THREE.ShaderChunk.map_fragment.replace(
    'texture2D( map, vMapUv )',
    `texture2D( map, vMapUv, ${MAP_LOD_BIAS} )`,
  );
  const sharpNormal = THREE.ShaderChunk.normal_fragment_maps
    .split('texture2D( normalMap, vNormalMapUv )')
    .join(`texture2D( normalMap, vNormalMapUv, ${MAP_LOD_BIAS} )`);

  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <normal_fragment_maps>', sharpNormal)
      .replace(
        '#include <common>',
        /* glsl */ `#include <common>
        uniform vec3 uSunDirView;
        uniform vec3 uTerminator;
        uniform vec3 uHaze;
        uniform vec3 uFloor;`,
      )
      .replace(
        '#include <map_fragment>',
        /* glsl */ `${sharpMap}
        {
          // Defined colour: natural saturation, and contrast that deepens the dark
          // basaltic markings while lifting the bright dusty plains
          float luma = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
          diffuseColor.rgb = mix(vec3(luma), diffuseColor.rgb, 0.98);
          diffuseColor.rgb = pow(max(diffuseColor.rgb, 0.0), vec3(1.18)) * 1.32;
          diffuseColor.rgb *= vec3(1.0, 0.95, 0.9);
        }`,
      )
      .replace(
        '#include <tonemapping_fragment>',
        /* glsl */ `{
          vec3 nView = normalize(vNormal);
          vec3 viewDir = normalize(vViewPosition);
          float ndl = dot(nView, uSunDirView);
          // Faint terracotta scatter along the day/night line
          float band = smoothstep(-0.16, 0.02, ndl) * (1.0 - smoothstep(0.02, 0.34, ndl));
          gl_FragColor.rgb += uTerminator * band * 0.012;
          // Thin copper haze on the sunlit limb
          float rim = pow(1.0 - clamp(dot(nView, viewDir), 0.0, 1.0), 3.2);
          float lit = smoothstep(-0.05, 0.6, ndl);
          gl_FragColor.rgb += uHaze * rim * lit * 0.07;
          gl_FragColor.rgb = max(gl_FragColor.rgb, uFloor);
        }
        #include <tonemapping_fragment>`,
      );
  };
  material.customProgramCacheKey = () => 'beyond-terra-mars-v4';
  return { material, uniforms };
}

function createAtmosphereMaterial(shell: number) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uSunDir: { value: HERO.sunDir.clone() },
      uInner: { value: new THREE.Color(HERO.rimInner) },
      uOuter: { value: new THREE.Color(HERO.rimOuter) },
      uShell: { value: shell },
      uStrength: { value: 1 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vNormalView;
      varying vec3 vPosView;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vPosView = mv.xyz;
        vNormalView = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uSunDir;
      uniform vec3 uInner;
      uniform vec3 uOuter;
      uniform float uShell;
      uniform float uStrength;
      varying vec3 vNormalView;
      varying vec3 vPosView;
      void main() {
        vec3 viewDir = normalize(-vPosView);
        vec3 n = normalize(vNormalView);
        // Back faces of the shell: 0 at the shell's edge, 1 at the planet's limb
        float facing = dot(n, viewDir);
        float limbDepth = sqrt(max(1.0 - 1.0 / (uShell * uShell), 1e-4));
        float t = clamp(-facing / limbDepth, 0.0, 1.0);
        float glow = pow(t, 3.0);
        float sun = smoothstep(-0.3, 0.8, dot(n, uSunDir));
        vec3 col = mix(uOuter, uInner, t);
        float a = glow * (0.06 + 0.94 * sun) * 0.42 * uStrength;
        gl_FragColor = vec4(col * a, a);
        #include <colorspace_fragment>
      }
    `,
    side: THREE.BackSide,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
}

function disposeUniformTextures(material: THREE.Material) {
  const uniforms = (material as THREE.ShaderMaterial).uniforms;
  if (!uniforms) return;
  new Set(Object.values(uniforms).map((u) => u.value)).forEach((v) => {
    if (v instanceof THREE.Texture) v.dispose();
  });
}

/**
 * The title from coverage masks: ivory letters (soft → sharp during the reveal) over an
 * extremely restrained copper glow and a soft, low shadow. Output is premultiplied linear.
 */
function createTitleMaterial(
  sharp: THREE.Texture,
  soft: THREE.Texture,
  wide: THREE.Texture | null,
  shadowDrop: number,
) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uSharpTex: { value: sharp },
      uSoftTex: { value: soft },
      uWideTex: { value: wide ?? soft },
      uGlowStrength: { value: wide ? 0.06 : 0 },
      uShadowDrop: { value: shadowDrop },
      uTitle: { value: new THREE.Color(HERO.title) },
      uGlow: { value: new THREE.Color(HERO.rimOuter) },
      uSharp: { value: 1 },
      uOpacity: { value: 1 },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D uSharpTex;
      uniform sampler2D uSoftTex;
      uniform sampler2D uWideTex;
      uniform float uGlowStrength;
      uniform float uShadowDrop;
      uniform vec3 uTitle;
      uniform vec3 uGlow;
      uniform float uSharp;
      uniform float uOpacity;
      varying vec2 vUv;
      void main() {
        float text = mix(texture2D(uSoftTex, vUv).a, texture2D(uSharpTex, vUv).a, uSharp);
        float glow = texture2D(uWideTex, vUv).a * uGlowStrength;
        float shadow = texture2D(uSoftTex, vUv + vec2(0.0, uShadowDrop)).a * 0.22;
        vec4 col = vec4(0.0, 0.0, 0.0, shadow);
        col = vec4(uGlow * glow, glow) + col * (1.0 - glow);
        col = vec4(uTitle * text, text) + col * (1.0 - text);
        gl_FragColor = col * uOpacity;
      }
    `,
    transparent: true,
    premultipliedAlpha: true,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
}

function createStarMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uPixelRatio: { value: 1 } },
    vertexShader: /* glsl */ `
      attribute float aSize;
      attribute float aBright;
      uniform float uPixelRatio;
      varying float vBright;
      void main() {
        vBright = aBright;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = aSize * uPixelRatio;
      }
    `,
    fragmentShader: /* glsl */ `
      varying float vBright;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.0, d);
        gl_FragColor = vec4(vec3(1.0, 0.96, 0.92) * vBright * a, 1.0);
        #include <colorspace_fragment>
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
}

function createStars(material: THREE.ShaderMaterial, count: number) {
  const rand = mulberry32(20261114);
  const positions = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const bright = new Float32Array(count);
  const v = new THREE.Vector3();
  for (let i = 0; i < count; i++) {
    // Uniform on the hemisphere in front of the camera
    const u = rand() * 2 - 1;
    const theta = rand() * Math.PI * 2;
    const s = Math.sqrt(1 - u * u);
    v.set(s * Math.cos(theta), u, -Math.abs(s * Math.sin(theta)) - 0.15).normalize();
    v.multiplyScalar(300);
    positions.set([v.x, v.y, v.z], i * 3);
    const r = rand();
    sizes[i] = 1.1 + r * r * 1.6;
    // Mostly faint: extremely subtle distant stars
    bright[i] = 0.012 + Math.pow(rand(), 4) * 0.16;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
  geometry.setAttribute('aBright', new THREE.BufferAttribute(bright, 1));
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  return points;
}
