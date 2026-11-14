import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { SuitMaterials } from './astronaut';

/**
 * A rugged field tablet for surface operations (a concept device, not NASA hardware):
 * matte dark-metal chassis, rubber corner bumpers and grip rails, a hardware wake key
 * and two warm status lights.
 *
 * Local frame: the screen faces +Z and its top edge points +Y. The screen always has the
 * same aspect ratio as the browser viewport, so when the camera is square-on to it the
 * screen can fill the viewport exactly.
 */

const SCREEN_AREA = 0.074; // m² — roughly a 17-inch-diagonal screen at 16:9
const BEZEL = 0.026;
const DEPTH = 0.026;

export interface TabletState {
  screenOn: number; // 0 → 1
  led: number; // 0 → 1
  glare: number; // reflection strength on the glass
  press: number; // 0 → 1, right thumb on the wake key
}

export class Tablet {
  readonly root = new THREE.Group();
  /** Wrist positions, children of the tablet, for the arm IK. */
  readonly leftWrist = new THREE.Object3D();
  readonly rightWrist = new THREE.Object3D();

  screenW = 0.36;
  screenH = 0.2;

  private readonly build = new THREE.Group();
  private readonly mats: SuitMaterials;
  private readonly chassis: THREE.MeshStandardMaterial;
  private readonly bumper: THREE.MeshStandardMaterial;
  private readonly ledMat: THREE.MeshStandardMaterial;
  private readonly screenMat: THREE.MeshBasicMaterial;
  private readonly glassMat: THREE.MeshStandardMaterial;
  private thumb: THREE.Group | null = null;
  private keyCap: THREE.Mesh | null = null;

  constructor(mats: SuitMaterials, heroTexture: THREE.Texture) {
    this.mats = mats;
    this.chassis = new THREE.MeshStandardMaterial({ color: '#2C2A28', metalness: 0.65, roughness: 0.52 });
    this.bumper = new THREE.MeshStandardMaterial({ color: '#1D1B1A', metalness: 0.05, roughness: 0.78 });
    this.ledMat = new THREE.MeshStandardMaterial({
      color: '#2a1a10',
      emissive: '#FFB070',
      emissiveIntensity: 0,
      roughness: 0.4,
    });
    // The website itself. Unlit and not tone mapped, so it shows exactly what the
    // full-screen site will show.
    this.screenMat = new THREE.MeshBasicMaterial({
      map: heroTexture,
      color: new THREE.Color(0, 0, 0),
      toneMapped: false,
      fog: false,
    });
    // Cover glass: environment reflections only, added on top of the screen
    this.glassMat = new THREE.MeshStandardMaterial({
      color: '#ffffff',
      metalness: 1,
      roughness: 0.14,
      transparent: true,
      opacity: 0.1,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
      envMapIntensity: 1,
    });
    this.root.add(this.build, this.leftWrist, this.rightWrist);
  }

  /** Rebuilds the device so its screen matches the viewport aspect ratio. */
  setAspect(aspect: number) {
    const a = THREE.MathUtils.clamp(aspect, 0.42, 2.6);
    this.screenW = Math.sqrt(SCREEN_AREA * a);
    this.screenH = Math.sqrt(SCREEN_AREA / a);
    this.rebuild();
  }

  setState(s: TabletState) {
    this.screenMat.color.setScalar(s.screenOn);
    this.ledMat.emissiveIntensity = s.led * 2.2;
    this.glassMat.opacity = s.glare;
    this.glassMat.visible = s.glare > 0.001;
    if (this.thumb) this.thumb.position.z = -0.0045 * s.press;
    if (this.keyCap) this.keyCap.position.z = DEPTH / 2 + 0.002 - 0.0015 * s.press;
  }

  /** Distance from the screen at which a camera with this vertical FOV sees exactly the screen. */
  fillDistance(fovDeg: number) {
    return this.screenH / 2 / Math.tan(THREE.MathUtils.degToRad(fovDeg) / 2);
  }

  private rebuild() {
    this.build.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) m.geometry.dispose();
    });
    this.build.clear();

    const W = this.screenW;
    const H = this.screenH;
    const outerW = W + BEZEL * 2;
    const outerH = H + BEZEL * 2;

    const body = new THREE.Mesh(new RoundedBoxGeometry(outerW, outerH, DEPTH, 4, 0.012), this.chassis);
    body.castShadow = true;
    body.receiveShadow = true;

    // Screen and cover glass
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(W, H), this.screenMat);
    screen.position.z = DEPTH / 2 + 0.0002;
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(W, H), this.glassMat);
    glass.position.z = DEPTH / 2 + 0.0004;
    glass.renderOrder = 2;

    // Rubber corner bumpers and side grip rails
    const corners: THREE.Mesh[] = [];
    for (const sx of [-1, 1]) {
      for (const sy of [-1, 1]) {
        // Bumpers wrap the corners from outside and never overlap the display area
        const c = new THREE.Mesh(new RoundedBoxGeometry(0.046, 0.046, DEPTH + 0.008, 2, 0.014), this.bumper);
        c.position.set(sx * (outerW / 2 - 0.003), sy * (outerH / 2 - 0.003), 0);
        c.castShadow = true;
        corners.push(c);
      }
    }
    const rails = [-1, 1].map((sx) => {
      const r = new THREE.Mesh(new RoundedBoxGeometry(0.012, outerH * 0.56, DEPTH * 0.85, 2, 0.005), this.bumper);
      r.position.set(sx * (outerW / 2 + 0.004), 0, 0);
      return r;
    });

    // Status lights on the top bezel
    const leds = [0, 1].map((i) => {
      const l = new THREE.Mesh(new RoundedBoxGeometry(0.009, 0.0045, 0.002, 1, 0.001), this.ledMat);
      l.position.set(W / 2 - 0.012 - i * 0.017, H / 2 + BEZEL * 0.5, DEPTH / 2 + 0.0008);
      return l;
    });

    // Wake key on the right bezel
    this.keyCap = new THREE.Mesh(new RoundedBoxGeometry(0.012, 0.03, 0.005, 1, 0.002), this.bumper);
    this.keyCap.position.set(W / 2 + BEZEL * 0.5, -H * 0.18, DEPTH / 2 + 0.002);

    // Back plate with a heat-spreader rib pattern
    const ribs: THREE.Mesh[] = [];
    const ribCount = 5;
    for (let i = 0; i < ribCount; i++) {
      const rib = new THREE.Mesh(new RoundedBoxGeometry(outerW * 0.7, 0.008, 0.004, 1, 0.002), this.chassis);
      rib.position.set(0, (i - (ribCount - 1) / 2) * (outerH * 0.14), -DEPTH / 2 - 0.0015);
      ribs.push(rib);
    }

    this.build.add(body, screen, glass, ...corners, ...rails, ...leds, this.keyCap, ...ribs);
    this.buildGloves(outerW);
  }

  private buildGloves(outerW: number) {
    const m = this.mats;
    const H = this.screenH;
    this.thumb = null;
    for (const side of [-1, 1] as const) {
      const g = new THREE.Group();
      const edge = side * (outerW / 2);
      const gripY = side === 1 ? -H * 0.18 : -H * 0.08;

      // Palm wraps the side edge from behind
      const palm = new THREE.Mesh(new RoundedBoxGeometry(0.048, 0.1, 0.056, 3, 0.018), m.glove);
      palm.position.set(edge + side * 0.014, gripY, -0.016);
      palm.castShadow = true;
      // Fingers along the back of the device
      for (let i = 0; i < 4; i++) {
        const len = [0.04, 0.052, 0.05, 0.04][i];
        const f = new THREE.Mesh(new THREE.CapsuleGeometry(0.0118, len, 4, 10), m.glove);
        f.rotation.z = Math.PI / 2;
        f.position.set(edge - side * (len / 2 + 0.012), gripY + 0.037 - i * 0.025, -DEPTH / 2 - 0.013);
        f.castShadow = true;
        g.add(f);
      }
      // Thumb rests along the front bezel, kept clear of the display edge
      const thumb = new THREE.Group();
      const t = new THREE.Mesh(new THREE.CapsuleGeometry(0.0125, 0.04, 4, 10), m.glove);
      t.rotation.x = -0.12;
      t.position.set(edge - side * 0.0105, gripY + 0.02, DEPTH / 2 + 0.0125);
      t.castShadow = true;
      thumb.add(t);
      if (side === 1) this.thumb = thumb;
      // Gauntlet towards the wrist bearing
      const wristLocal = new THREE.Vector3(edge + side * 0.078, gripY - 0.03, -0.06);
      const palmCentre = palm.position.clone();
      const dir = new THREE.Vector3().subVectors(palmCentre, wristLocal);
      const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.044, 0.052, dir.length(), 20), m.glove);
      cuff.position.copy(wristLocal).addScaledVector(dir, 0.5);
      cuff.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
      cuff.castShadow = true;

      g.add(palm, thumb, cuff);
      this.build.add(g);
      (side === 1 ? this.rightWrist : this.leftWrist).position.copy(wristLocal);
    }
  }
}
