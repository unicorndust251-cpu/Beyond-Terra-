import * as THREE from 'three';
import { loadMarsImages, onLargeMarsColor } from '../three/assets';
import { renderPixelRatio } from '../three/renderSettings';

/**
 * The Explore globe: Mars on a unit sphere with its colour mosaic and MOLA-derived relief,
 * evenly lit for reading the surface (no night side), turned by drag, touch, wheel, pinch
 * and the keyboard. Landmark markers are HTML buttons placed over it every frame, hidden
 * when on the far side.
 *
 * Registration: the colour map is plate carrée with 0° E at its centre, east to the right
 * (the same mapping the homepage hero uses). A point at latitude φ, east longitude λ is at
 * (cos φ cos λ, sin φ, −cos φ sin λ) on three.js's default sphere.
 */

const DEG = Math.PI / 180;
export const MIN_DISTANCE = 1.25;
export const MAX_DISTANCE = 6.5;
const DEFAULT_DISTANCE = 4.3;

export function surfacePoint(latDeg: number, lonEastDeg: number, r = 1): THREE.Vector3 {
  const φ = latDeg * DEG;
  const λ = lonEastDeg * DEG;
  return new THREE.Vector3(Math.cos(φ) * Math.cos(λ) * r, Math.sin(φ) * r, -Math.cos(φ) * Math.sin(λ) * r);
}

export interface GlobeView {
  /** Latitude and east longitude at the centre of the disc (degrees). */
  lat: number;
  lon: number;
  /** Camera distance from the centre, in Mars radii. */
  distance: number;
}

export interface GlobeMarker {
  id: string;
  lat: number;
  lon: number;
  el: HTMLElement;
}

const wrap180 = (a: number) => ((((a + 180) % 360) + 360) % 360) - 180;
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export class MarsGlobe {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(32, 1, 0.01, 50);
  private readonly material: THREE.MeshStandardMaterial;
  private readonly textures: THREE.Texture[] = [];
  private readonly light = new THREE.DirectionalLight('#fff4ea', 2.3);
  private markers: Array<GlobeMarker & { dir: THREE.Vector3 }> = [];
  view: GlobeView = { lat: 18, lon: 300, distance: DEFAULT_DISTANCE };
  private flight: { from: GlobeView; to: GlobeView; t0: number; ms: number } | null = null;
  private dirty = true;
  private raf = 0;
  private active = true;
  private width = 1;
  private height = 1;
  private disposed = false;
  private readonly cleanups: Array<() => void> = [];
  private readonly reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  /** Called when the visitor turns or zooms the globe themselves. */
  onUserMove: (() => void) | null = null;
  /** Called once the surface imagery is on screen. */
  onReady: (() => void) | null = null;

  constructor(
    canvas: HTMLCanvasElement,
    private readonly host: HTMLElement,
  ) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(renderPixelRatio());
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;

    this.material = new THREE.MeshStandardMaterial({ color: '#8a6a58', roughness: 0.96, metalness: 0 });
    const planet = new THREE.Mesh(new THREE.SphereGeometry(1, 160, 112), this.material);
    this.scene.add(planet);

    // A thin atmosphere at the limb, kept faint
    const rim = new THREE.Mesh(
      new THREE.SphereGeometry(1.025, 96, 64),
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        side: THREE.BackSide,
        uniforms: { uColor: { value: new THREE.Color('#D6A38B') } },
        vertexShader: `varying vec3 vN; varying vec3 vV;
          void main(){ vec4 mv = modelViewMatrix*vec4(position,1.0); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }`,
        fragmentShader: `uniform vec3 uColor; varying vec3 vN; varying vec3 vV;
          void main(){ float f = pow(1.0 - abs(dot(vN, vV)), 3.0); gl_FragColor = vec4(uColor, f * 0.35); }`,
      }),
    );
    this.scene.add(rim);

    // Even, readable light: a soft fill plus a key light just above and left of the camera
    this.scene.add(new THREE.HemisphereLight('#fff1e4', '#5a3a2c', 1.25));
    this.scene.add(this.light);

    void this.loadTextures();
    this.bindInput();
    this.resize();
    const ro = new ResizeObserver(() => this.resize());
    ro.observe(host);
    this.cleanups.push(() => ro.disconnect());
    this.kick();
  }

  private async loadTextures() {
    try {
      const { color, normal } = await loadMarsImages();
      if (this.disposed) return;
      const map = new THREE.Texture(color);
      map.colorSpace = THREE.SRGBColorSpace;
      map.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
      map.needsUpdate = true;
      const nmap = new THREE.Texture(normal);
      nmap.needsUpdate = true;
      this.textures.push(map, nmap);
      this.material.map = map;
      this.material.normalMap = nmap;
      this.material.normalScale.set(0.9, 0.9);
      this.material.color.set('#ffffff');
      this.material.needsUpdate = true;
      this.cleanups.push(
        onLargeMarsColor((img) => {
          if (this.disposed) return;
          const large = new THREE.Texture(img);
          large.colorSpace = THREE.SRGBColorSpace;
          large.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
          large.needsUpdate = true;
          this.textures.push(large);
          this.material.map = large;
          this.dirty = true;
          this.kick();
        }),
      );
      this.dirty = true;
      this.kick();
      this.onReady?.();
    } catch {
      /* the plain-coloured sphere stays; markers still work */
      this.onReady?.();
    }
  }

  /* ------------------------------------------------------------- markers */

  setMarkers(markers: GlobeMarker[]) {
    this.markers = markers.map((m) => ({ ...m, dir: surfacePoint(m.lat, m.lon) }));
    this.dirty = true;
    this.kick();
  }

  /* ---------------------------------------------------------------- view */

  /** Turns to put a point at the centre, zooming in to `distance` (eased; instant with reduced motion). */
  flyTo(lat: number, lon: number, distance = 2.05) {
    const to: GlobeView = { lat: Math.max(-82, Math.min(82, lat)), lon, distance: Math.max(MIN_DISTANCE, Math.min(MAX_DISTANCE, distance)) };
    if (this.reducedMotion) {
      this.view = to;
      this.flight = null;
    } else {
      // Longer turns take a little longer, never more than about 1.4 s
      const turn = Math.hypot(wrap180(to.lon - this.view.lon), to.lat - this.view.lat);
      this.flight = { from: { ...this.view }, to, t0: performance.now(), ms: 650 + Math.min(750, turn * 5) };
    }
    this.dirty = true;
    this.kick();
  }

  resetView() {
    this.flyTo(18, 300, DEFAULT_DISTANCE);
  }

  zoomBy(factor: number) {
    this.flight = null;
    this.view.distance = Math.max(MIN_DISTANCE, Math.min(MAX_DISTANCE, 1 + (this.view.distance - 1) * factor));
    this.dirty = true;
    this.kick();
  }

  rotateBy(dLon: number, dLat: number) {
    this.flight = null;
    this.view.lon = (this.view.lon + dLon + 360) % 360;
    this.view.lat = Math.max(-82, Math.min(82, this.view.lat + dLat));
    this.dirty = true;
    this.kick();
  }

  /** Stops drawing while the page is hidden; resumes where it was. */
  setActive(active: boolean) {
    this.active = active;
    if (active) {
      this.dirty = true;
      this.kick();
    }
  }

  private bindInput() {
    const el = this.host;
    const pointers = new Map<number, { x: number; y: number }>();
    let pinch = 0;
    let moved = false;
    // Degrees per pixel shrink as the camera nears the surface
    const degPerPx = () => (180 / Math.max(1, this.height)) * ((this.view.distance - 1) / (DEFAULT_DISTANCE - 1)) * 0.55;

    const down = (e: PointerEvent) => {
      if ((e.target as HTMLElement).closest('button')) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      el.setPointerCapture?.(e.pointerId);
      moved = false;
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        pinch = Math.hypot(a.x - b.x, a.y - b.y);
      }
    };
    const move = (e: PointerEvent) => {
      const p = pointers.get(e.pointerId);
      if (!p) return;
      const dx = e.clientX - p.x;
      const dy = e.clientY - p.y;
      p.x = e.clientX;
      p.y = e.clientY;
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinch > 0 && d > 0) this.zoomBy(pinch / d);
        pinch = d;
      } else {
        this.rotateBy(-dx * degPerPx(), dy * degPerPx());
      }
      if (!moved && Math.abs(dx) + Math.abs(dy) > 0) {
        moved = true;
        this.onUserMove?.();
      }
    };
    const up = (e: PointerEvent) => {
      pointers.delete(e.pointerId);
      if (pointers.size < 2) pinch = 0;
    };
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      this.zoomBy(Math.exp(e.deltaY * 0.0012));
      this.onUserMove?.();
    };
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('wheel', wheel, { passive: false });
    this.cleanups.push(() => {
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      el.removeEventListener('wheel', wheel);
    });
  }

  /** Arrow keys turn the globe, + and − zoom, 0 resets. Returns true when handled. */
  handleKey(key: string): boolean {
    const step = 6 * ((this.view.distance - 1) / (DEFAULT_DISTANCE - 1));
    switch (key) {
      case 'ArrowLeft':
        this.rotateBy(-step, 0);
        break;
      case 'ArrowRight':
        this.rotateBy(step, 0);
        break;
      case 'ArrowUp':
        this.rotateBy(0, step);
        break;
      case 'ArrowDown':
        this.rotateBy(0, -step);
        break;
      case '+':
      case '=':
        this.zoomBy(0.8);
        break;
      case '-':
      case '_':
        this.zoomBy(1.25);
        break;
      case '0':
        this.resetView();
        break;
      default:
        return false;
    }
    this.onUserMove?.();
    return true;
  }

  /* -------------------------------------------------------------- render */

  private resize() {
    const r = this.host.getBoundingClientRect();
    this.width = Math.max(1, r.width);
    this.height = Math.max(1, r.height);
    this.renderer.setSize(this.width, this.height, false);
    this.camera.aspect = this.width / this.height;
    this.camera.updateProjectionMatrix();
    this.dirty = true;
    this.kick();
  }

  private kick() {
    if (this.raf || this.disposed || !this.active) return;
    this.raf = requestAnimationFrame(this.frame);
  }

  private frame = (now: number) => {
    this.raf = 0;
    if (this.disposed || !this.active) return;
    if (this.flight) {
      const { from, to, t0, ms } = this.flight;
      const t = Math.min(1, (now - t0) / ms);
      const k = ease(t);
      this.view = {
        lat: from.lat + (to.lat - from.lat) * k,
        lon: (from.lon + wrap180(to.lon - from.lon) * k + 360) % 360,
        distance: from.distance + (to.distance - from.distance) * k,
      };
      if (t >= 1) this.flight = null;
      this.dirty = true;
    }
    if (this.dirty) {
      this.dirty = false;
      this.draw();
    }
    if (this.flight) this.kick();
  };

  private draw() {
    const { lat, lon, distance } = this.view;
    const eye = surfacePoint(lat, lon, distance);
    this.camera.position.copy(eye);
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(0, 0, 0);
    // Key light from above-left of the viewer, so relief reads without a night side
    const right = new THREE.Vector3().crossVectors(eye, this.camera.up).normalize();
    this.light.position.copy(eye).addScaledVector(right, 0.9).addScaledVector(this.camera.up, 1.1);
    this.renderer.render(this.scene, this.camera);

    // Markers: on screen where their surface point projects; hidden past the horizon
    const toEye = eye.clone().normalize();
    const horizon = 1 / distance + 0.04;
    const p = new THREE.Vector3();
    for (const m of this.markers) {
      const facing = m.dir.dot(toEye);
      const visible = facing > horizon;
      if (visible) {
        p.copy(m.dir).multiplyScalar(1.004).project(this.camera);
        const x = ((p.x + 1) / 2) * this.width;
        const y = ((1 - p.y) / 2) * this.height;
        m.el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
        // Fade towards the limb, so markers do not crowd at the edge
        m.el.style.opacity = String(Math.min(1, (facing - horizon) * 6));
      }
      m.el.hidden = !visible;
      m.el.tabIndex = visible ? 0 : -1;
    }
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.cleanups.forEach((c) => c());
    this.scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.geometry.dispose();
        (mesh.material as THREE.Material).dispose();
      }
    });
    this.textures.forEach((t) => t.dispose());
    this.renderer.dispose();
  }
}
