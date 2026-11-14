import * as THREE from 'three';
import { Astronaut, type SuitMaterials } from './astronaut';
import { createDust, createRocks, createSky, createTerrain, SURFACE, terrainHeight } from './environment';
import { Tablet } from './tablet';

/**
 * The astronaut's point of view on Mars: looking out over the plain, deploying the
 * chest-mounted field tablet, the screen waking with Beyond Terra on it, and the camera
 * leaning in until the screen exactly fills the viewport.
 *
 * The suit itself is never seen on camera. No sufficiently realistic, licensed astronaut
 * model ships with this project, so the procedural suit is used only to cast the
 * astronaut's long shadow on the regolith (see README, "The astronaut").
 */

export const SURFACE_CAMERA_FOV = 46;

export interface SurfaceState {
  /** Eyes from the horizon down to the tablet, 0 → 1. */
  look: number;
  /** Slow head pan across the plain during the establishing shot, 1 → 0. */
  pan: number;
  /** The tablet swinging up from its stowed position on the chest, 0 → 1. */
  raise: number;
  /** A small settle as the mount locks (0 → 1 → 0). */
  settle: number;
  /** The camera leaning in along the screen's normal until the screen fills the view, 0 → 1. */
  dolly: number;
  screenOn: number;
  led: number;
  glare: number;
}

// Astronaut space: standing at the origin, facing −Z, right hand at +X.
const EYE = new THREE.Vector3(0, 1.7, -0.1);
const MOUNT_PIVOT = new THREE.Vector3(0, 1.24, -0.26);
/** Length of each mount-arm link (m). */
const LINK = 0.18;
const STOWED = {
  position: new THREE.Vector3(0, 1.13, -0.36),
  lookAt: new THREE.Vector3(0, 2.1, -0.12),
};
const RAISED = {
  position: new THREE.Vector3(0.0, 1.47, -0.52),
  // The screen faces the eyes square-on, so leaning in is a straight move along its normal
  lookAt: EYE,
};

function smooth(a: number, b: number, x: number) {
  const t = THREE.MathUtils.clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}

/** Renders into the shadow map only: invisible on camera, but it casts a shadow. */
function createShadowOnlyMaterials(): SuitMaterials {
  const m = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });
  return { fabric: m, glove: m, shell: m, metal: m, rubber: m, visor: m, accent: m, panel: m };
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
  private readonly shadowMaterial: THREE.Material;
  private readonly stowedQ = new THREE.Quaternion();
  private readonly raisedQ = new THREE.Quaternion();
  private readonly settleQ = new THREE.Quaternion();
  private readonly upperLink: THREE.Mesh;
  private readonly lowerLink: THREE.Mesh;
  private readonly elbowHinge: THREE.Mesh;
  private readonly clampHinge: THREE.Mesh;
  private readonly elbow = new THREE.Vector3();
  private readonly eye = new THREE.Vector3();
  private readonly dollyEnd = new THREE.Vector3();
  private readonly screenUp = new THREE.Vector3();
  private readonly tmpA = new THREE.Vector3();
  private readonly tmpB = new THREE.Vector3();
  private readonly tmpDir = new THREE.Vector3();
  private readonly tmpUp = new THREE.Vector3();
  private readonly tmpL = new THREE.Vector3();
  private readonly tmpR = new THREE.Vector3();
  private readonly invRoot = new THREE.Matrix4();

  constructor(renderer: THREE.WebGLRenderer, heroTexture: THREE.Texture, quality: 'high' | 'low') {
    this.renderer = renderer;
    const s = this.scene;

    // Sky, and an environment map lit by the same sky for reflections (glass, metal)
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

    // Low, warm sun from behind; the shadow frustum covers the astronaut's long shadow
    this.sun = new THREE.DirectionalLight(SURFACE.sunColor, 3.1);
    this.sun.castShadow = true;
    const size = quality === 'high' ? 2048 : 1024;
    this.sun.shadow.mapSize.set(size, size);
    const sc = this.sun.shadow.camera;
    sc.left = -3.8;
    sc.right = 3.8;
    sc.top = 3.8;
    sc.bottom = -3.8;
    sc.near = 1;
    sc.far = 40;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.02;
    s.add(this.sun, this.sun.target);
    s.add(new THREE.HemisphereLight('#D3A387', '#5A3A2D', 0.55));

    // The suit, gloves included, exists only in the shadow
    const shadowMats = createShadowOnlyMaterials();
    this.shadowMaterial = shadowMats.fabric;
    this.astronaut = new Astronaut(shadowMats);
    this.astronaut.root.position.y = terrainHeight(0, 0);
    this.astronaut.root.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) o.castShadow = true;
    });
    this.tablet = new Tablet(shadowMats, heroTexture);
    this.astronaut.root.add(this.tablet.root);
    s.add(this.astronaut.root);

    // Chest-mount arm: two links with an elbow hinge, from a base on the chest to the
    // clamp on the tablet's back
    const linkGeo = new THREE.BoxGeometry(1, 1, 1);
    linkGeo.translate(0, 0.5, 0);
    const hingeGeo = new THREE.CylinderGeometry(1, 1, 1, 20);
    hingeGeo.rotateZ(Math.PI / 2);
    this.upperLink = new THREE.Mesh(linkGeo, this.tablet.metal);
    this.lowerLink = new THREE.Mesh(linkGeo.clone(), this.tablet.metal);
    this.elbowHinge = new THREE.Mesh(hingeGeo, this.tablet.metal);
    this.elbowHinge.scale.set(0.05, 0.019, 0.019);
    this.clampHinge = new THREE.Mesh(hingeGeo.clone(), this.tablet.metal);
    this.clampHinge.scale.set(0.044, 0.015, 0.015);
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.05, 0.04), this.tablet.metal);
    base.position.copy(MOUNT_PIVOT);
    for (const m of [this.upperLink, this.lowerLink, this.elbowHinge, this.clampHinge, base]) {
      m.castShadow = true;
      m.receiveShadow = true;
      m.frustumCulled = false;
      this.astronaut.root.add(m);
    }

    const dummy = new THREE.Object3D();
    dummy.position.copy(STOWED.position);
    dummy.lookAt(STOWED.lookAt);
    this.stowedQ.copy(dummy.quaternion);
    dummy.position.copy(RAISED.position);
    dummy.lookAt(RAISED.lookAt);
    this.raisedQ.copy(dummy.quaternion);

    const feet = this.astronaut.root.position;
    // The shadow falls away from the sun along the ground: centre the shadow map on it
    const away = new THREE.Vector3(-SURFACE.sunDir.x, 0, -SURFACE.sunDir.z).normalize();
    this.sun.target.position.copy(feet).addScaledVector(away, 2.6);
    this.sun.position.copy(this.sun.target.position).addScaledVector(SURFACE.sunDir, 18);
    this.eye.copy(EYE).add(feet);
  }

  setSize(width: number, height: number, pixelRatio: number) {
    const aspect = width / height;
    this.camera.aspect = aspect;
    // Portrait screens keep a natural horizontal field of view instead of a telephoto one
    const half = THREE.MathUtils.degToRad(SURFACE_CAMERA_FOV / 2);
    this.camera.fov =
      aspect >= 1
        ? SURFACE_CAMERA_FOV
        : Math.min(72, THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(half) / Math.max(aspect, 0.5))));
    this.camera.updateProjectionMatrix();
    this.tablet.setAspect(aspect);
    this.dust.material.uniforms.uPixelRatio.value = pixelRatio;
    this.computeDollyEnd();
  }

  /** Final camera pose: on the raised screen's normal, where the screen fills the frame. */
  private computeDollyEnd() {
    const tabletWorld = new THREE.Object3D();
    tabletWorld.position.copy(RAISED.position).add(this.astronaut.root.position);
    tabletWorld.quaternion.copy(this.raisedQ);
    tabletWorld.updateMatrixWorld();
    const screenZ = 0.0132;
    const centre = new THREE.Vector3(0, 0, screenZ).applyMatrix4(tabletWorld.matrixWorld);
    const normal = new THREE.Vector3(0, 0, 1).applyQuaternion(this.raisedQ);
    this.screenUp.set(0, 1, 0).applyQuaternion(this.raisedQ);
    this.dollyEnd.copy(centre).addScaledVector(normal, this.tablet.fillDistance(this.camera.fov));
  }

  update(state: SurfaceState, seconds: number) {
    const root = this.astronaut.root;

    // Tablet: from stowed on the chest to reading position, with a small settle
    this.tablet.root.position.lerpVectors(STOWED.position, RAISED.position, state.raise);
    this.tablet.root.quaternion.slerpQuaternions(this.stowedQ, this.raisedQ, state.raise);
    this.settleQ.setFromAxisAngle(new THREE.Vector3(1, 0, 0), -0.035 * state.settle);
    this.tablet.root.quaternion.multiply(this.settleQ);
    this.tablet.setState(state);
    root.updateMatrixWorld(true);
    this.invRoot.copy(root.matrixWorld).invert();

    // Mount arm (astronaut space): two-link IK from the chest base to the clamp
    const clamp = this.tablet.mountPoint.getWorldPosition(this.tmpA).applyMatrix4(this.invRoot);
    const toClamp = this.tmpDir.subVectors(clamp, MOUNT_PIVOT);
    const reach = THREE.MathUtils.clamp(toClamp.length(), 0.02, LINK * 2 - 1e-4);
    toClamp.normalize();
    const along = reach / 2;
    const bend = Math.sqrt(Math.max(LINK * LINK - along * along, 0));
    // The elbow bends down and slightly forward: always below the screen, never between
    // the eyes and the display
    const hint = this.tmpB.set(0, -1, -0.35).normalize();
    const down = hint.addScaledVector(toClamp, -hint.dot(toClamp)).normalize();
    this.elbow.copy(MOUNT_PIVOT).addScaledVector(toClamp, along).addScaledVector(down, bend);
    this.placeLink(this.upperLink, MOUNT_PIVOT, this.elbow);
    this.placeLink(this.lowerLink, this.elbow, clamp);
    this.elbowHinge.position.copy(this.elbow);
    this.clampHinge.position.copy(clamp);

    // The arms follow the tablet's grips (they appear only in the shadow)
    this.tablet.leftWrist.getWorldPosition(this.tmpL).applyMatrix4(this.invRoot);
    this.tablet.rightWrist.getWorldPosition(this.tmpR).applyMatrix4(this.invRoot);
    this.astronaut.updateArms({ leftWrist: this.tmpL, rightWrist: this.tmpR });
    this.astronaut.breathe(seconds);

    // Camera: the astronaut's eyes
    const lean = smooth(0, 1, state.dolly);
    const breath = Math.sin(seconds * 1.1) * 0.006 * (1 - lean);
    this.camera.position.lerpVectors(this.eye, this.dollyEnd, state.dolly);
    this.camera.position.y += breath;

    // Look direction: across the plain (with a slow pan), then down at the screen
    const yaw = 0.16 * state.pan;
    const horizon = this.tmpB.set(Math.sin(yaw), -0.14, -Math.cos(yaw)).normalize();
    this.tablet.root.updateMatrixWorld();
    const screen = this.tablet.root.localToWorld(this.tmpA.set(0, 0, 0.0132));
    const toScreen = this.tmpDir.subVectors(screen, this.camera.position).normalize();
    const look = horizon.lerp(toScreen, smooth(0, 1, state.look)).normalize();

    this.tmpUp.set(0, 1, 0).lerp(this.screenUp, smooth(0.2, 1, state.dolly)).normalize();
    this.camera.up.copy(this.tmpUp);
    this.camera.lookAt(this.tmpA.copy(this.camera.position).add(look));

    this.dust.material.uniforms.uTime.value = seconds;
    // Dust clears before the screen fills the frame, so nothing floats over the handoff
    this.dust.material.uniforms.uFade.value = 1 - smooth(0.3, 0.75, state.dolly);
  }

  private placeLink(mesh: THREE.Mesh, from: THREE.Vector3, to: THREE.Vector3) {
    const dir = this.tmpUp.subVectors(to, from);
    const length = dir.length();
    mesh.position.copy(from);
    mesh.quaternion.setFromUnitVectors(THREE.Object3D.DEFAULT_UP, dir.normalize());
    mesh.scale.set(0.026, length, 0.02);
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
    this.shadowMaterial.dispose();
    this.envTarget.dispose();
    this.sun.shadow.map?.dispose();
  }
}
