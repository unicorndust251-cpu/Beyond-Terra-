import * as THREE from 'three';
import { Astronaut, createSuitMaterials } from './astronaut';
import { createDust, createRocks, createSky, createTerrain, SURFACE, terrainHeight } from './environment';
import { Tablet } from './tablet';

/**
 * Scene one to three: the astronaut on Mars, the tablet waking up with Beyond Terra on
 * it, and the camera move that ends square-on to the screen, with the screen exactly
 * filling the viewport.
 */

export const SURFACE_CAMERA_FOV = 40;

export interface SurfaceState {
  /** Camera progress along its path, 0 → 1 (eased by the timeline). */
  cam: number;
  /** Tablet raised from chest height to reading position, 0 → 1. */
  raise: number;
  press: number;
  screenOn: number;
  led: number;
  glare: number;
}

const LOWERED = {
  position: new THREE.Vector3(0.05, 1.12, -0.36),
  lookAt: new THREE.Vector3(0.08, 1.62, 0.25),
};
const RAISED = {
  position: new THREE.Vector3(0.06, 1.33, -0.44),
  // Faces the eyes, offset slightly to the right of the visor
  lookAt: new THREE.Vector3(0.15, 1.77, -0.05),
};

function smooth(a: number, b: number, x: number) {
  const t = THREE.MathUtils.clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}

export class SurfaceScene {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(SURFACE_CAMERA_FOV, 1, 0.01, 3000);
  readonly astronaut: Astronaut;
  readonly tablet: Tablet;

  private readonly renderer: THREE.WebGLRenderer;
  private readonly sun: THREE.DirectionalLight;
  private readonly dust: ReturnType<typeof createDust>;
  private readonly envTarget: THREE.WebGLRenderTarget;
  private readonly loweredQ = new THREE.Quaternion();
  private readonly raisedQ = new THREE.Quaternion();
  private path: THREE.CatmullRomCurve3 | null = null;
  private readonly chestFocus = new THREE.Vector3(0.04, 1.32, -0.14);
  private readonly screenCentre = new THREE.Vector3();
  private readonly screenUp = new THREE.Vector3();
  private readonly tmpTarget = new THREE.Vector3();
  private readonly tmpUp = new THREE.Vector3();
  private readonly tmpL = new THREE.Vector3();
  private readonly tmpR = new THREE.Vector3();
  private aspect = 16 / 9;

  constructor(renderer: THREE.WebGLRenderer, heroTexture: THREE.Texture, quality: 'high' | 'low') {
    this.renderer = renderer;
    const s = this.scene;

    // Sky, and an environment map lit by the same sky for reflections (visor, glass)
    const sky = createSky();
    s.add(sky);
    const envScene = new THREE.Scene();
    envScene.add(createSky());
    const pmrem = new THREE.PMREMGenerator(renderer);
    this.envTarget = pmrem.fromScene(envScene, 0.02);
    pmrem.dispose();
    envScene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.geometry.dispose();
        (m.material as THREE.Material).dispose();
      }
    });
    s.environment = this.envTarget.texture;
    s.environmentIntensity = 0.55;
    s.fog = new THREE.FogExp2(SURFACE.fog, 0.0026);

    s.add(createTerrain(quality));
    s.add(createRocks(quality));
    this.dust = createDust(quality);
    s.add(this.dust.points);

    // Low, warm sun with soft contact shadows around the astronaut
    this.sun = new THREE.DirectionalLight(SURFACE.sunColor, 3.1);
    this.sun.castShadow = true;
    const size = quality === 'high' ? 2048 : 1024;
    this.sun.shadow.mapSize.set(size, size);
    const sc = this.sun.shadow.camera;
    sc.left = -2.4;
    sc.right = 2.4;
    sc.top = 2.4;
    sc.bottom = -2.4;
    sc.near = 1;
    sc.far = 30;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.015;
    this.sun.shadow.radius = 3;
    s.add(this.sun, this.sun.target);
    s.add(new THREE.HemisphereLight('#D3A387', '#5A3A2D', 0.55));

    // Astronaut and tablet
    const mats = createSuitMaterials();
    this.astronaut = new Astronaut(mats);
    this.astronaut.root.position.y = terrainHeight(0, 0);
    this.tablet = new Tablet(mats, heroTexture);
    this.astronaut.root.add(this.tablet.root);
    s.add(this.astronaut.root);

    const dummy = new THREE.Object3D();
    dummy.position.copy(LOWERED.position);
    dummy.lookAt(LOWERED.lookAt);
    this.loweredQ.copy(dummy.quaternion);
    dummy.position.copy(RAISED.position);
    dummy.lookAt(RAISED.lookAt);
    this.raisedQ.copy(dummy.quaternion);

    const feet = this.astronaut.root.position;
    this.sun.position.copy(feet).addScaledVector(SURFACE.sunDir, 14).add(new THREE.Vector3(0, 1, 0));
    this.sun.target.position.copy(feet).add(new THREE.Vector3(0, 0.9, 0));
  }

  setSize(width: number, height: number, pixelRatio: number) {
    this.aspect = width / height;
    this.camera.aspect = this.aspect;
    // Portrait screens keep a natural horizontal field of view instead of a telephoto one,
    // which also lets the camera finish close to the (tall) screen, clear of the suit
    const half = THREE.MathUtils.degToRad(SURFACE_CAMERA_FOV / 2);
    this.camera.fov =
      this.aspect >= 1
        ? SURFACE_CAMERA_FOV
        : Math.min(70, THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(half) / Math.max(this.aspect, 0.5))));
    this.camera.updateProjectionMatrix();
    this.tablet.setAspect(this.aspect);
    this.dust.material.uniforms.uPixelRatio.value = pixelRatio;
    this.buildPath();
  }

  /** The camera's whole move, from the medium shot to square-on with the screen. */
  private buildPath() {
    const root = this.astronaut.root;
    // Final pose: on the screen's normal, at the distance where the screen fills the frame
    const tabletWorld = new THREE.Object3D();
    tabletWorld.position.copy(RAISED.position).add(root.position);
    tabletWorld.quaternion.copy(this.raisedQ);
    tabletWorld.updateMatrixWorld();
    const screenZ = 0.0132;
    this.screenCentre.set(0, 0, screenZ).applyMatrix4(tabletWorld.matrixWorld);
    const normal = new THREE.Vector3(0, 0, 1).applyQuaternion(this.raisedQ);
    this.screenUp.set(0, 1, 0).applyQuaternion(this.raisedQ);
    const end = this.screenCentre.clone().addScaledVector(normal, this.tablet.fillDistance(this.camera.fov));

    // Portrait screens need more distance for the same medium shot
    const back = this.aspect < 1 ? 1 + (1 - this.aspect) * 0.45 : 1;
    const base = root.position;
    // A three-quarter medium shot from behind the right shoulder, sun on the near side
    const p0 = new THREE.Vector3(1.55 * back, 1.7, 0.95 * back).add(base);
    const pa = new THREE.Vector3(1.05 * Math.sqrt(back), 1.78, 0.62 * Math.sqrt(back)).add(base);
    const pb = new THREE.Vector3(0.52, 1.88, 0.14).add(base);
    this.path = new THREE.CatmullRomCurve3([p0, pa, pb, end], false, 'centripetal');
    this.chestFocus.set(0.0, 1.4, -0.16).add(base);
  }

  update(state: SurfaceState, seconds: number) {
    // Tablet
    const raise = state.raise;
    this.tablet.root.position.lerpVectors(LOWERED.position, RAISED.position, raise);
    this.tablet.root.quaternion.slerpQuaternions(this.loweredQ, this.raisedQ, raise);
    this.tablet.setState(state);
    this.tablet.root.updateMatrixWorld(true);

    // Arms follow the gloves on the tablet (wrists in astronaut space)
    this.astronaut.root.updateMatrixWorld(true);
    const inv = this.astronaut.root.matrixWorld.clone().invert();
    this.tablet.leftWrist.getWorldPosition(this.tmpL).applyMatrix4(inv);
    this.tablet.rightWrist.getWorldPosition(this.tmpR).applyMatrix4(inv);
    this.astronaut.updateArms({ leftWrist: this.tmpL, rightWrist: this.tmpR });
    this.astronaut.breathe(seconds);

    // Camera
    if (this.path) {
      const u = THREE.MathUtils.clamp(state.cam, 0, 1);
      this.camera.position.copy(this.path.getPointAt(u));
      this.tmpTarget.lerpVectors(this.chestFocus, this.screenCentre, smooth(0.05, 0.8, u));
      this.tmpUp.set(0, 1, 0).lerp(this.screenUp, smooth(0.4, 1, u)).normalize();
      this.camera.up.copy(this.tmpUp);
      this.camera.lookAt(this.tmpTarget);
      // Gentle handheld-free breathing of the camera, fading out as it locks on
      const drift = (1 - smooth(0.3, 0.9, u)) * 0.004;
      this.camera.position.y += Math.sin(seconds * 0.9) * drift;
    }

    this.dust.material.uniforms.uTime.value = seconds;
    // Dust clears before the screen fills the frame, so nothing floats over the handoff
    this.dust.material.uniforms.uFade.value = 1 - smooth(0.7, 0.93, state.cam);
  }

  render() {
    this.renderer.setRenderTarget(null);
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh && !(o as THREE.Points).isPoints) return;
      m.geometry?.dispose();
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      mats.forEach((mat) => {
        if (!mat) return;
        Object.values(mat).forEach((v) => {
          if (v instanceof THREE.Texture && v.isRenderTargetTexture !== true) v.dispose();
        });
        mat.dispose();
      });
    });
    this.envTarget.dispose();
    this.sun.shadow.map?.dispose();
  }
}
