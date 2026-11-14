import * as THREE from 'three';
import type { ArmTargets } from './astronautRig';
import type { SuitMaterials } from './astronaut';
import { createDust, createRocks, createSky, createTerrain, SURFACE, terrainHeight } from './environment';
import { Tablet } from './tablet';

/**
 * The opening, in third person:
 *  1. a three-quarter shot of the astronaut's upper body and helmet; the astronaut looks
 *     out over the plain, with a gentle head turn, the visor reflecting the landscape;
 *  2. the astronaut raises the field tablet; Beyond Terra wakes on it;
 *  3. the camera moves round over the right shoulder towards the screen, the astronaut
 *     leaving the frame;
 *  4. it squares up to the screen until the screen fills the viewport exactly, where the
 *     full-screen site takes over.
 */

export const THIRD_PERSON_FOV = 38;

/** The astronaut: a supplied rigged model (AstronautRig) or the built-in suit. */
export interface IntroFigure {
  /** Feet at the origin, facing −Z, right hand towards +X. */
  readonly root: THREE.Object3D;
  /** Eye height (m). */
  readonly eyeHeight: number;
  /** When set, the tablet's own gloves are the figure's hands, in these materials. */
  readonly gloveMaterials?: SuitMaterials;
  /** Breathing, head yaw/pitch (radians) and hands on the targets (figure space). */
  pose(seconds: number, headYaw: number, headPitch: number, arms: ArmTargets): void;
  /** Hides the figure (not the tablet). */
  setVisible(visible: boolean): void;
  dispose(): void;
}

export interface ThirdPersonState {
  /** Camera progress along its path, 0 → 1. */
  cam: number;
  /** Tablet from waist height to reading position, 0 → 1. */
  raise: number;
  /** Head turn (radians, + = to the astronaut's left) and pitch (− = looking down). */
  headYaw: number;
  headPitch: number;
  screenOn: number;
  led: number;
  glare: number;
}

/** Sun for this shot: low (≈22°), in front and to the right, so suit and visor are lit. */
const SUN_DIR = new THREE.Vector3(0.72, 0.4, -0.57).normalize();

function smooth(a: number, b: number, x: number) {
  const t = THREE.MathUtils.clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}

export class ThirdPersonScene {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(THIRD_PERSON_FOV, 1, 0.01, 3000);
  readonly tablet: Tablet;

  private readonly renderer: THREE.WebGLRenderer;
  private readonly figure: IntroFigure;
  /** Where the astronaut stands; holds the figure and the tablet. */
  private readonly holder = new THREE.Group();
  private readonly sun: THREE.DirectionalLight;
  private readonly dust: ReturnType<typeof createDust>;
  private readonly hiddenMaterial = new THREE.MeshBasicMaterial({ visible: false });
  private envTarget: THREE.WebGLRenderTarget | null = null;
  private readonly lowered: { position: THREE.Vector3; q: THREE.Quaternion };
  private readonly raised: { position: THREE.Vector3; q: THREE.Quaternion };
  private readonly eye: THREE.Vector3;
  private path: THREE.CatmullRomCurve3 | null = null;
  private readonly screenCentre = new THREE.Vector3();
  private readonly screenUp = new THREE.Vector3();
  private readonly bodyFocus = new THREE.Vector3();
  private readonly tmpTarget = new THREE.Vector3();
  private readonly tmpUp = new THREE.Vector3();
  private readonly invHolder = new THREE.Matrix4();
  private readonly arms: ArmTargets = {
    left: new THREE.Vector3(),
    right: new THREE.Vector3(),
    leftPole: new THREE.Vector3(-0.65, 0.85, -0.05),
    rightPole: new THREE.Vector3(0.65, 0.85, -0.05),
  };
  private aspect = 16 / 9;

  constructor(renderer: THREE.WebGLRenderer, heroTexture: THREE.Texture, figure: IntroFigure, quality: 'high' | 'low') {
    this.renderer = renderer;
    this.figure = figure;
    const s = this.scene;

    s.add(createSky(SUN_DIR));
    s.fog = new THREE.FogExp2(SURFACE.fog, 0.0026);
    s.add(createTerrain(quality));
    s.add(createRocks(quality));
    this.dust = createDust(quality, SUN_DIR);
    s.add(this.dust.points);

    this.sun = new THREE.DirectionalLight(SURFACE.sunColor, 3.2);
    this.sun.castShadow = true;
    const size = quality === 'high' ? 2048 : 1024;
    this.sun.shadow.mapSize.set(size, size);
    const sc = this.sun.shadow.camera;
    sc.left = -2.2;
    sc.right = 2.2;
    sc.top = 2.4;
    sc.bottom = -2.0;
    sc.near = 1;
    sc.far = 40;
    this.sun.shadow.bias = -0.0003;
    this.sun.shadow.normalBias = 0.02;
    s.add(this.sun, this.sun.target);
    s.add(new THREE.HemisphereLight('#D3A387', '#5A3A2D', 0.6));

    this.holder.position.y = terrainHeight(0, 0);
    s.add(this.holder);
    this.holder.add(figure.root);
    this.eye = new THREE.Vector3(0, figure.eyeHeight, -0.08);

    // The built-in suit holds the tablet with gloves that are part of the tablet; a
    // supplied model uses its own hands
    const gloves = figure.gloveMaterials;
    const m = this.hiddenMaterial;
    this.tablet = new Tablet(
      gloves ?? { fabric: m, glove: m, shell: m, metal: m, rubber: m, visor: m, accent: m, panel: m },
      heroTexture,
      { gloves: !!gloves },
    );
    this.holder.add(this.tablet.root);

    // Waist height, screen tilted up towards the chest; reading height, facing the visor
    // and slightly to its right, so the over-the-shoulder camera can see it
    const pose = (position: THREE.Vector3, lookAt: THREE.Vector3) => {
      const o = new THREE.Object3D();
      o.position.copy(position);
      o.lookAt(lookAt);
      return { position, q: o.quaternion.clone() };
    };
    const e = figure.eyeHeight;
    this.lowered = pose(new THREE.Vector3(0.0, e * 0.6, -0.32), new THREE.Vector3(0, e + 0.8, 0.35));
    this.raised = pose(new THREE.Vector3(0.04, e - 0.4, -0.44), new THREE.Vector3(0.16, e + 0.04, -0.03));

    const feet = this.holder.position;
    this.sun.target.position.copy(feet).add(new THREE.Vector3(0, 0.9, 0));
    this.sun.position.copy(this.sun.target.position).addScaledVector(SUN_DIR, 16);
    this.bodyFocus.set(0, e - 0.22, -0.05).add(feet);

    this.captureEnvironment();
  }

  /** Reflections of the actual landscape for the visor and other glossy parts. */
  private captureEnvironment() {
    const cube = new THREE.WebGLCubeRenderTarget(256, { type: THREE.HalfFloatType });
    const cam = new THREE.CubeCamera(0.05, 3000, cube);
    cam.position.copy(this.eye).add(this.holder.position);
    this.holder.visible = false;
    cam.update(this.renderer, this.scene);
    this.holder.visible = true;
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.envTarget = pmrem.fromCubemap(cube.texture);
    pmrem.dispose();
    cube.dispose();
    this.scene.environment = this.envTarget.texture;
    this.scene.environmentIntensity = 0.7;
  }

  setSize(width: number, height: number, pixelRatio: number) {
    this.aspect = width / height;
    this.camera.aspect = this.aspect;
    const half = THREE.MathUtils.degToRad(THIRD_PERSON_FOV / 2);
    this.camera.fov =
      this.aspect >= 1
        ? THIRD_PERSON_FOV
        : Math.min(70, THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(half) / Math.max(this.aspect, 0.5))));
    this.camera.updateProjectionMatrix();
    this.tablet.setAspect(this.aspect);
    this.dust.material.uniforms.uPixelRatio.value = pixelRatio;
    this.buildPath();
  }

  private buildPath() {
    const base = this.holder.position;
    const tabletWorld = new THREE.Object3D();
    tabletWorld.position.copy(this.raised.position).add(base);
    tabletWorld.quaternion.copy(this.raised.q);
    tabletWorld.updateMatrixWorld();
    this.screenCentre.set(0, 0, 0.0132).applyMatrix4(tabletWorld.matrixWorld);
    const normal = new THREE.Vector3(0, 0, 1).applyQuaternion(this.raised.q);
    this.screenUp.set(0, 1, 0).applyQuaternion(this.raised.q);
    const end = this.screenCentre.clone().addScaledVector(normal, this.tablet.fillDistance(this.camera.fov));

    // Portrait screens need more distance for the same framing
    const back = this.aspect < 1 ? 1 + (1 - this.aspect) * 0.5 : 1;
    const e = this.figure.eyeHeight;
    this.path = new THREE.CatmullRomCurve3(
      [
        new THREE.Vector3(1.15 * back, e - 0.08, -1.2 * back), // three-quarter, front right
        new THREE.Vector3(1.05 * back, e - 0.1, -1.05 * back), // slow drift during the observation
        new THREE.Vector3(1.4, e - 0.02, -0.15), // round the right side
        new THREE.Vector3(0.95, e + 0.14, 0.5), // behind the right shoulder
        new THREE.Vector3(0.42, e + 0.14, 0.06), // over the shoulder, onto the screen
      ]
        .map((p) => p.add(base))
        .concat(end),
      false,
      'centripetal',
    );
  }

  update(state: ThirdPersonState, seconds: number) {
    // Tablet
    this.tablet.root.position.lerpVectors(this.lowered.position, this.raised.position, state.raise);
    this.tablet.root.quaternion.slerpQuaternions(this.lowered.q, this.raised.q, state.raise);
    this.tablet.setState(state);
    this.holder.updateMatrixWorld(true);
    this.invHolder.copy(this.holder.matrixWorld).invert();

    // Hands on the tablet's grips, head and breathing (figure space = holder space)
    this.tablet.leftWrist.getWorldPosition(this.arms.left).applyMatrix4(this.invHolder);
    this.tablet.rightWrist.getWorldPosition(this.arms.right).applyMatrix4(this.invHolder);
    this.figure.pose(seconds, state.headYaw, state.headPitch, this.arms);

    // Camera
    if (this.path) {
      const u = THREE.MathUtils.clamp(state.cam, 0, 1);
      this.camera.position.copy(this.path.getPointAt(u));
      this.tmpTarget.lerpVectors(this.bodyFocus, this.screenCentre, smooth(0.3, 0.85, u));
      this.tmpUp.set(0, 1, 0).lerp(this.screenUp, smooth(0.55, 1, u)).normalize();
      this.camera.up.copy(this.tmpUp);
      this.camera.lookAt(this.tmpTarget);
    }

    // Once the screen all but fills the view, the astronaut is out of frame: hide the
    // figure so no part of the hands can ever cross the screen at the handoff
    this.figure.setVisible(state.cam < 0.96);

    this.dust.material.uniforms.uTime.value = seconds;
    this.dust.material.uniforms.uFade.value = 1 - smooth(0.6, 0.9, state.cam);
  }

  render() {
    this.renderer.setRenderTarget(null);
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.figure.dispose();
    this.holder.remove(this.figure.root);
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
    this.hiddenMaterial.dispose();
    this.envTarget?.dispose();
    this.sun.shadow.map?.dispose();
  }
}
