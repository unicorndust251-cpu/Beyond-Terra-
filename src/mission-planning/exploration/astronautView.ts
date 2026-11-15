import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { Astronaut, createSuitMaterials, type SuitMaterials } from '../../intro/scene/astronaut';
import { FEET_AT, VIEW_SIZE } from './engine';

/**
 * The route preview's astronaut, rendered by one small WebGL renderer into a canvas that
 * the map carries as a marker. Loaded lazily, so the map never waits for Three.js.
 *
 * Two figures:
 * - the rigged model at /models/explorer/astronaut.glb: "Astronaut in Spacesuit" from
 *   Grab3D, CC0 (source and checks in public/models/explorer/LICENSE.txt). Its walk clip
 *   plays in place, driven by the route; it has no idle clip, so the standing pose is
 *   derived from the walk cycle. It is kept separate from the intro's own model path so
 *   the intro is unaffected;
 * - if that file is missing or unusable, a PLACEHOLDER: the intro's procedural suit with
 *   legs animated here by two-bone IK, labelled as a placeholder.
 *
 * Figure space: metres, feet on y = 0 at the origin, facing −Z, right hand at +X.
 */

export const MODEL_URL = '/models/explorer/astronaut.glb';
export const MODEL_CREDIT = '“Astronaut in Spacesuit” from Grab3D, CC0';
/** Standing height of a suited adult (m), used to scale a supplied model. */
const SUITED_HEIGHT = 1.88;
/** glTF characters conventionally face +Z; ours face −Z. */
const MODEL_FACES_PLUS_Z = true;

export interface FigureMotion {
  /** 0 = standing, 1 = full walk. */
  walk: number;
  /** Gait cycles per second (one cycle = two steps). */
  cadenceHz: number;
  /** Breathing and small weight shifts while standing. */
  idleMotion: boolean;
}

export interface ExplorerFigure {
  readonly root: THREE.Object3D;
  readonly kind: 'model' | 'placeholder';
  readonly description: string;
  update(dt: number, motion: FigureMotion): void;
  dispose(): void;
}

/* --------------------------------------------------------------- placeholder */

const UP = new THREE.Vector3(0, 1, 0);

/** A tapered suit limb between two points, with fabric convolutes. */
class Limb {
  readonly group = new THREE.Group();
  private readonly tube: THREE.Mesh;
  private readonly rings: Array<{ mesh: THREE.Mesh; at: number }> = [];

  constructor(rTop: number, rBottom: number, mats: SuitMaterials, convolutes: number[]) {
    this.tube = new THREE.Mesh(new THREE.CylinderGeometry(rBottom, rTop, 1, 20, 1, true), mats.fabric);
    this.group.add(this.tube);
    for (const at of convolutes) {
      const r = rTop + (rBottom - rTop) * at;
      const ring = new THREE.Mesh(new THREE.TorusGeometry(r * 0.98, r * 0.13, 8, 24), mats.fabric);
      ring.rotation.x = Math.PI / 2;
      this.group.add(ring);
      this.rings.push({ mesh: ring, at });
    }
  }

  set(a: THREE.Vector3, b: THREE.Vector3) {
    const dir = new THREE.Vector3().subVectors(b, a);
    const len = dir.length();
    this.group.position.copy(a);
    this.group.quaternion.setFromUnitVectors(UP, dir.normalize());
    this.tube.scale.set(1, len, 1);
    this.tube.position.y = len / 2;
    for (const { mesh, at } of this.rings) mesh.position.y = at * len;
  }
}

/** Knee position for a two-bone chain from hip to ankle, bending towards `pole`. */
function solveKnee(hip: THREE.Vector3, ankle: THREE.Vector3, l1: number, l2: number, pole: THREE.Vector3): THREE.Vector3 {
  const d = new THREE.Vector3().subVectors(ankle, hip);
  const dist = Math.min(d.length(), l1 + l2 - 1e-4);
  const dir = d.normalize();
  const a = (l1 * l1 - l2 * l2 + dist * dist) / (2 * dist);
  const h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  const bend = new THREE.Vector3().subVectors(pole, hip);
  bend.sub(dir.clone().multiplyScalar(bend.dot(dir))).normalize();
  return hip.clone().add(dir.multiplyScalar(a)).add(bend.multiplyScalar(h));
}

interface Leg {
  side: 1 | -1;
  thigh: Limb;
  shin: Limb;
  knee: THREE.Group;
  boot: THREE.Group;
}

const THIGH = 0.445;
const SHIN = 0.405;
const HIP_Y = 0.98;
const ANKLE_Y = 0.14;
/** Half the distance a foot travels per step (m): short, careful suited steps. */
const HALF_STRIDE = 0.25;
const FOOT_LIFT = 0.07;

class PlaceholderWalker implements ExplorerFigure {
  readonly root = new THREE.Group();
  readonly kind = 'placeholder' as const;
  readonly description = 'Placeholder astronaut: procedural suit built in this project (no rigged model supplied)';
  private readonly mats = createSuitMaterials();
  private readonly suit = new Astronaut(this.mats, { legs: false });
  private readonly legs: Leg[] = [];
  private phase = 0;
  private time = 0;

  constructor() {
    this.root.add(this.suit.root);
    // Subtle red identification bands on the upper arms
    const band = new THREE.MeshStandardMaterial({ color: '#9C3B32', roughness: 0.75 });
    for (const side of [-1, 1]) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.082, 0.012, 8, 28), band);
      ring.rotation.x = Math.PI / 2;
      ring.position.set(side * 0.33, 1.33, 0);
      this.suit.torso.add(ring);
    }
    for (const side of [-1, 1] as const) {
      const m = this.mats;
      const thigh = new Limb(0.102, 0.088, m, [0.3, 0.5, 0.7]);
      const shin = new Limb(0.088, 0.074, m, [0.25, 0.5]);
      const knee = new THREE.Group();
      knee.add(new THREE.Mesh(new THREE.SphereGeometry(0.094, 18, 12), m.fabric));
      const pad = new THREE.Mesh(new RoundedBoxGeometry(0.11, 0.1, 0.05, 2, 0.02), m.shell);
      pad.position.z = -0.075;
      knee.add(pad);
      const boot = new THREE.Group();
      const upper = new THREE.Mesh(new RoundedBoxGeometry(0.15, 0.15, 0.2, 3, 0.04), m.shell);
      upper.position.set(0, 0.1, 0);
      const foot = new THREE.Mesh(new RoundedBoxGeometry(0.15, 0.085, 0.32, 3, 0.035), m.rubber);
      foot.position.set(0, 0.045, -0.05);
      const sole = new THREE.Mesh(new RoundedBoxGeometry(0.16, 0.035, 0.33, 2, 0.012), m.rubber);
      sole.position.set(0, 0.0175, -0.05);
      boot.add(upper, foot, sole);
      this.root.add(thigh.group, shin.group, knee, boot);
      this.legs.push({ side, thigh, shin, knee, boot });
    }
    this.update(0, { walk: 0, cadenceHz: 0, idleMotion: false });
  }

  update(dt: number, { walk, cadenceHz, idleMotion }: FigureMotion) {
    this.time += dt;
    this.phase = (this.phase + dt * cadenceHz * Math.PI * 2) % (Math.PI * 2);
    const w = THREE.MathUtils.clamp(walk, 0, 1);
    const idle = idleMotion ? 1 - w : 0;
    const torso = this.suit.torso;

    // Upper body: breathing and slow weight shifts at rest; a slight lean, a small bob
    // twice per cycle and a restrained counter-rotation while walking
    this.suit.breathe(idleMotion ? this.time : 0);
    const bob = w * 0.018 * (Math.cos(this.phase * 2) - 1) * 0.5;
    const shift = idle * 0.008 * Math.sin(this.time * 0.4);
    torso.position.y += bob;
    torso.position.x = shift;
    torso.rotation.set(-0.055 * w, 0.05 * w * Math.sin(this.phase), 0);
    this.suit.helmetPivot.rotation.set(-0.04 + 0.04 * w, 0, 0);

    // Arms hang with a slight bend and swing opposite the legs
    const swing = (side: number) => -0.11 * w * Math.sin(this.phase + (side === 1 ? Math.PI : 0));
    this.suit.updateArms({
      leftWrist: new THREE.Vector3(-0.35, 0.93, -0.03 - swing(1)),
      rightWrist: new THREE.Vector3(0.35, 0.93, -0.03 - swing(-1)),
    });

    for (const leg of this.legs) {
      const psi = this.phase + (leg.side === 1 ? 0 : Math.PI);
      // Foot travels forward (−Z) in the swing half, lifted, and back on the ground in stance
      const z = -HALF_STRIDE * w * Math.sin(psi);
      const lift = FOOT_LIFT * w * Math.pow(Math.max(0, Math.cos(psi)), 1.5);
      const hip = new THREE.Vector3(leg.side * 0.12 + shift, HIP_Y + bob, 0.02);
      const ankle = new THREE.Vector3(leg.side * 0.155, ANKLE_Y + lift, z);
      const pole = hip.clone().add(new THREE.Vector3(leg.side * 0.05, -0.3, -0.6));
      const knee = solveKnee(hip, ankle, THIGH, SHIN, pole);
      leg.thigh.set(hip, knee);
      leg.shin.set(knee, ankle);
      leg.knee.position.copy(knee);
      leg.knee.quaternion.setFromUnitVectors(UP, new THREE.Vector3().subVectors(hip, knee).normalize());
      leg.boot.position.set(ankle.x, ankle.y - ANKLE_Y, ankle.z);
      // Heel strike with the toe raised as the foot comes forward; flat in stance
      leg.boot.rotation.set(0.25 * w * Math.max(0, Math.sin(psi)) * Math.max(0, Math.cos(psi) + 0.3), leg.side * -0.06, 0);
    }
  }

  dispose() {
    disposeTree(this.root);
    Object.values(this.mats).forEach((m: THREE.Material) => m.dispose());
  }
}

/* ---------------------------------------------------------- supplied model */

class ModelWalker implements ExplorerFigure {
  readonly root = new THREE.Group();
  readonly kind = 'model' as const;
  readonly description: string;
  private readonly mixer: THREE.AnimationMixer;
  private readonly idle: THREE.AnimationAction;
  private readonly walkAction: THREE.AnimationAction;
  private readonly walkDuration: number;

  constructor(scene: THREE.Object3D, clips: THREE.AnimationClip[]) {
    // Prefer the plain clips (e.g. "Idle", not "Idle_Gun")
    const pick = (re: RegExp, loose: RegExp) => clips.find((c) => re.test(c.name)) ?? clips.find((c) => loose.test(c.name));
    const walkClip = pick(/(^|\|)walk$/i, /walk/i);
    if (!walkClip) throw new Error(`the model needs a Walk animation (found: ${clips.map((c) => c.name).join(', ') || 'none'})`);
    const authoredIdle = pick(/(^|\|)idle$/i, /idle|stand/i);
    const idleClip = authoredIdle ?? standingFromWalk(walkClip);
    this.description = `${MODEL_CREDIT} · rigged; ${authoredIdle ? 'idle and walk clips' : 'walk clip, standing pose derived from it'}`;

    // Scale to a suited adult, feet on the ground, facing −Z (measured in the skinned pose)
    scene.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(scene, true);
    const height = box.max.y - box.min.y;
    if (!(height > 0)) throw new Error('the model has no visible geometry');
    const s = SUITED_HEIGHT / height;
    scene.scale.setScalar(s);
    scene.position.set(-((box.min.x + box.max.x) / 2) * s, -box.min.y * s, -((box.min.z + box.max.z) / 2) * s);
    const holder = new THREE.Group();
    holder.add(scene);
    if (MODEL_FACES_PLUS_Z) holder.rotation.y = Math.PI;
    this.root.add(holder);

    this.mixer = new THREE.AnimationMixer(scene);
    this.idle = this.mixer.clipAction(idleClip);
    this.walkAction = this.mixer.clipAction(inPlace(walkClip));
    this.walkDuration = walkClip.duration;
    this.idle.play();
    this.walkAction.play();
    this.walkAction.setEffectiveWeight(0);
  }

  update(dt: number, { walk, cadenceHz }: FigureMotion) {
    const w = THREE.MathUtils.clamp(walk, 0, 1);
    this.idle.setEffectiveWeight(1 - w);
    this.walkAction.setEffectiveWeight(w);
    // One clip = one gait cycle: play it at the route's cadence so feet match the ground
    this.walkAction.setEffectiveTimeScale(Math.max(0.05, cadenceHz * this.walkDuration));
    this.mixer.update(dt);
  }

  dispose() {
    this.mixer.stopAllAction();
    disposeTree(this.root);
  }
}

/**
 * A standing pose for a model that has no idle clip: every bone at its average over the
 * walk cycle (legs together under the body, arms at the middle of their swing), with a
 * slow, slight rise and fall of the chest for breathing.
 */
function standingFromWalk(walk: THREE.AnimationClip): THREE.AnimationClip {
  const tracks: THREE.KeyframeTrack[] = [];
  const breath = new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.012, 0, 0));
  for (const track of walk.tracks) {
    const v = track.values;
    const size = track.getValueSize();
    const n = v.length / size;
    if (track instanceof THREE.QuaternionKeyframeTrack) {
      const ref = new THREE.Quaternion().fromArray(v, 0);
      const sum = new THREE.Vector4();
      const q = new THREE.Quaternion();
      for (let i = 0; i < n; i++) {
        q.fromArray(v, i * 4);
        // q and −q are the same rotation: keep them on one side before averaging
        const sign = q.dot(ref) < 0 ? -1 : 1;
        sum.x += q.x * sign;
        sum.y += q.y * sign;
        sum.z += q.z * sign;
        sum.w += q.w * sign;
      }
      const mean = new THREE.Quaternion(sum.x, sum.y, sum.z, sum.w).normalize();
      // The chest bone ("Spine" in this rig, above Spine01/Spine02) carries the breathing
      const breathing = /(^|[.|])spine.quaternion$/i.test(track.name);
      const peak = breathing ? mean.clone().multiply(breath) : mean;
      tracks.push(new THREE.QuaternionKeyframeTrack(track.name, [0, 2, 4], [...mean.toArray(), ...peak.toArray(), ...mean.toArray()]));
    } else {
      const mean = new Array(size).fill(0);
      for (let i = 0; i < n; i++) for (let k = 0; k < size; k++) mean[k] += v[i * size + k] / n;
      tracks.push(new THREE.VectorKeyframeTrack(track.name, [0, 4], [...mean, ...mean]));
    }
  }
  return new THREE.AnimationClip('standing (derived from walk)', 4, tracks);
}

/**
 * Removes forward drift (root motion), so the route alone moves the figure. Only tracks
 * that end somewhere else than they start are changed, and only by their steady drift:
 * an in-place walk (feet stepping, body bobbing) is left exactly as authored.
 */
function inPlace(clip: THREE.AnimationClip): THREE.AnimationClip {
  const c = clip.clone();
  for (const track of c.tracks) {
    if (!track.name.endsWith('.position')) continue;
    const v = track.values;
    const t = track.times;
    const n = t.length;
    if (n < 2) continue;
    const dx = v[(n - 1) * 3] - v[0];
    const dz = v[(n - 1) * 3 + 2] - v[2];
    if (Math.hypot(dx, dz) < 1e-6) continue;
    const span = t[n - 1] - t[0];
    for (let i = 0; i < n; i++) {
      const f = (t[i] - t[0]) / span;
      v[i * 3] -= dx * f;
      v[i * 3 + 2] -= dz * f;
    }
  }
  return c;
}

function disposeTree(root: THREE.Object3D) {
  const textures = new Set<THREE.Texture>();
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.geometry.dispose();
    (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).forEach((m) => {
      Object.values(m).forEach((v) => v instanceof THREE.Texture && textures.add(v));
      m.dispose();
    });
  });
  textures.forEach((t) => t.dispose());
}

export interface FigureResult {
  figure: ExplorerFigure;
  /** Why a supplied model was not used, if one was found but rejected. */
  modelIssue?: string;
}

/** Uses the rigged model when one is present and usable, otherwise the labelled placeholder. */
export async function loadFigure(onProgress?: (fraction: number) => void): Promise<FigureResult> {
  try {
    const head = await fetch(MODEL_URL, { method: 'HEAD' });
    // The dev server answers unknown paths with index.html
    if (!head.ok || (head.headers.get('content-type') ?? '').includes('text/html')) return { figure: new PlaceholderWalker() };
    const gltf = await new GLTFLoader().loadAsync(MODEL_URL, (e) => e.total && onProgress?.(e.loaded / e.total));
    return { figure: new ModelWalker(gltf.scene, gltf.animations) };
  } catch (e) {
    return { figure: new PlaceholderWalker(), modelIssue: e instanceof Error ? e.message : String(e) };
  }
}

/* -------------------------------------------------------------------- view */


function contactShadow(): THREE.Mesh {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(0,0,0,0.55)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.7), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.002;
  return m;
}

export class AstronautView {
  readonly canvas: HTMLCanvasElement;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.PerspectiveCamera;
  private readonly env: THREE.Texture;
  private readonly yawGroup = new THREE.Group();
  /** Inspection angle around the figure (radians); 0 = the map's own view. */
  private orbit = 0;
  private orbitTarget = 0;

  constructor(readonly figure: ExplorerFigure) {
    this.canvas = document.createElement('canvas');
    this.canvas.style.width = `${VIEW_SIZE[0]}px`;
    this.canvas.style.height = `${VIEW_SIZE[1]}px`;
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, alpha: true, antialias: true, powerPreference: 'low-power' });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.renderer.setSize(VIEW_SIZE[0], VIEW_SIZE[1], false);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
    this.scene.environment = this.env;
    this.scene.add(new THREE.HemisphereLight('#fff4ea', '#7a4a32', 0.9));
    const sun = new THREE.DirectionalLight('#fff1e2', 2.2);
    sun.position.set(-2, 4, 1.5);
    this.scene.add(sun);
    this.yawGroup.add(figure.root);
    this.scene.add(contactShadow(), this.yawGroup);

    // An oblique view from the south (bottom of the map), so a figure facing north walks up the screen
    this.camera = new THREE.PerspectiveCamera(24, VIEW_SIZE[0] / VIEW_SIZE[1], 0.1, 40);
    this.placeCamera();
  }

  private placeCamera() {
    const elevation = THREE.MathUtils.degToRad(30);
    const dist = 5.4;
    const target = new THREE.Vector3(0, 0.86, 0);
    this.camera.position.set(Math.sin(this.orbit) * Math.cos(elevation) * dist, target.y + Math.sin(elevation) * dist, Math.cos(this.orbit) * Math.cos(elevation) * dist);
    this.camera.lookAt(target);
    // Shift the frame so the feet land on FEET_AT (rotation about the vertical axis keeps them there)
    this.camera.updateMatrixWorld();
    this.camera.clearViewOffset();
    const p = new THREE.Vector3(0, 0, 0).project(this.camera);
    const fx = ((p.x + 1) / 2) * VIEW_SIZE[0];
    const fy = ((1 - p.y) / 2) * VIEW_SIZE[1];
    this.camera.setViewOffset(VIEW_SIZE[0], VIEW_SIZE[1], fx - FEET_AT[0], fy - FEET_AT[1], VIEW_SIZE[0], VIEW_SIZE[1]);
  }

  /**
   * Faces the figure along a direction on the map: clockwise from north (screen up), in
   * radians. With an inspection angle set, the figure keeps its map heading.
   */
  setHeading(radians: number) {
    this.yawGroup.rotation.y = -radians;
  }

  /** Turns the inspection camera by a step; 0 resets to the map's view. */
  setOrbit(radians: number) {
    this.orbitTarget = radians;
  }

  get orbiting() {
    return Math.abs(this.orbitTarget) > 1e-3 || Math.abs(this.orbit) > 1e-3;
  }

  render(dt: number, motion: FigureMotion) {
    if (Math.abs(this.orbitTarget - this.orbit) > 1e-4) {
      this.orbit += (this.orbitTarget - this.orbit) * Math.min(1, dt * 6);
      this.placeCamera();
    }
    this.figure.update(dt, motion);
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.figure.dispose();
    this.scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh && !this.figure.root.getObjectById(mesh.id)) {
        mesh.geometry.dispose();
        const mat = mesh.material as THREE.MeshBasicMaterial;
        mat.map?.dispose();
        mat.dispose();
      }
    });
    this.env.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }
}
