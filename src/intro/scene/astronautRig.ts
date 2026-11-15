import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

/**
 * A rigged, licensed astronaut model, posed procedurally for the opening.
 *
 * No model ships with the project. Put one at `public/models/explorer/astronaut.glb`
 * (see README, "The astronaut"): a realistic, rigged humanoid astronaut in glTF/GLB,
 * with web-use rights. When the file is missing or unsuitable, the intro falls back to the
 * astronaut's-eye view.
 *
 * Bones are found by name, so common rigs work as they are (Mixamo, Unreal/UE mannequin,
 * Blender Rigify-style and most marketplace characters). The arms are posed with two-bone
 * IK towards the tablet's grips, so no particular bone orientation is assumed.
 */

export const ASTRONAUT_MODEL_URLS = ['/models/explorer/astronaut.glb', '/models/astronaut.glb'] as const;
export const ASTRONAUT_MODEL_URL = ASTRONAUT_MODEL_URLS[0];
/** Standing height the model is scaled to (m): a suited adult. */
const SUITED_HEIGHT = 1.88;

type BoneKey = 'head' | 'neck' | 'chest' | 'leftArm' | 'leftForeArm' | 'leftHand' | 'rightArm' | 'rightForeArm' | 'rightHand';

/** Name patterns per bone, most specific first. Matched against names stripped of rig prefixes. */
const BONE_PATTERNS: Record<BoneKey, RegExp[]> = {
  head: [/^head$/, /head(?!top|_end|end|top_end)/],
  neck: [/^neck$/, /neck/],
  chest: [/^spine2$/, /^chest$/, /upperchest|spine_?03|spine3/, /^spine1$/, /spine_?02/],
  leftArm: [/^leftarm$/, /^upperarm_?l$/, /^l_?upperarm$/, /upper_?arm.*(left|_l$)/, /(left|^l_).*upper_?arm/],
  leftForeArm: [/^leftforearm$/, /^lowerarm_?l$/, /^l_?forearm$/, /(fore|lower)_?arm.*(left|_l$)/, /(left|^l_).*(fore|lower)_?arm/],
  leftHand: [/^lefthand$/, /^hand_?l$/, /^l_?hand$/, /hand.*(left|_l$)/, /(left|^l_).*hand$/],
  rightArm: [/^rightarm$/, /^upperarm_?r$/, /^r_?upperarm$/, /upper_?arm.*(right|_r$)/, /(right|^r_).*upper_?arm/],
  rightForeArm: [/^rightforearm$/, /^lowerarm_?r$/, /^r_?forearm$/, /(fore|lower)_?arm.*(right|_r$)/, /(right|^r_).*(fore|lower)_?arm/],
  rightHand: [/^righthand$/, /^hand_?r$/, /^r_?hand$/, /hand.*(right|_r$)/, /(right|^r_).*hand$/],
};

const REQUIRED: BoneKey[] = ['head', 'leftArm', 'leftForeArm', 'leftHand', 'rightArm', 'rightForeArm', 'rightHand'];

function cleanName(name: string) {
  return name
    .toLowerCase()
    .replace(/^.*[:|]/, '') // mixamorig:LeftArm, Armature|LeftArm
    .replace(/^(mixamorig|bip0?1|def|org|cc_base)[_\s-]*/, '')
    .replace(/[\s.-]+/g, '_');
}

function findBones(root: THREE.Object3D) {
  const bones: THREE.Bone[] = [];
  root.traverse((o) => {
    if ((o as THREE.Bone).isBone) bones.push(o as THREE.Bone);
  });
  const found: Partial<Record<BoneKey, THREE.Bone>> = {};
  (Object.keys(BONE_PATTERNS) as BoneKey[]).forEach((key) => {
    for (const re of BONE_PATTERNS[key]) {
      const bone = bones.find((b) => re.test(cleanName(b.name)) && !Object.values(found).includes(b));
      if (bone) {
        found[key] = bone;
        break;
      }
    }
  });
  return found;
}

export interface ArmTargets {
  left: THREE.Vector3;
  right: THREE.Vector3;
  /** Points the elbows bend towards (down and out). */
  leftPole: THREE.Vector3;
  rightPole: THREE.Vector3;
}

export class AstronautRig {
  /** Feet at the origin, facing −Z, about 1.88 m tall. */
  readonly root = new THREE.Group();
  /** Eye height (m), measured from the model's head bone. */
  readonly eyeHeight: number;

  private readonly bones: Record<BoneKey, THREE.Bone | undefined>;
  private readonly rest = new Map<THREE.Bone, THREE.Quaternion>();
  private readonly gltfScene: THREE.Object3D;
  /** The figure itself (the tablet, attached to `root`, is not part of it). */
  private readonly figure: THREE.Group;
  private readonly tmpQ = new THREE.Quaternion();
  private readonly tmpQ2 = new THREE.Quaternion();
  private readonly tmpA = new THREE.Vector3();
  private readonly tmpB = new THREE.Vector3();
  private readonly tmpC = new THREE.Vector3();
  private readonly tmpD = new THREE.Vector3();

  private constructor(gltfScene: THREE.Object3D, bones: Partial<Record<BoneKey, THREE.Bone>>) {
    this.gltfScene = gltfScene;
    this.bones = bones as Record<BoneKey, THREE.Bone | undefined>;

    // Normalise: suited height, feet on the ground, centred, facing −Z. The facing is
    // read from the skeleton (the character's right is from its left to its right
    // shoulder), so models exported facing any direction come out the same way.
    const holder = new THREE.Group();
    this.figure = holder;
    holder.add(gltfScene);
    holder.updateMatrixWorld(true);
    const toRight = this.bones.rightArm!.getWorldPosition(new THREE.Vector3())
      .sub(this.bones.leftArm!.getWorldPosition(new THREE.Vector3()));
    // Rotate about Y so the character's right lies along +X (it then faces −Z)
    holder.rotation.y = Math.atan2(toRight.z, toRight.x);
    holder.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(holder);
    const size = box.getSize(new THREE.Vector3());
    const scale = SUITED_HEIGHT / Math.max(size.y, 1e-6);
    holder.scale.setScalar(scale);
    holder.updateMatrixWorld(true);
    box.setFromObject(holder);
    const centre = box.getCenter(new THREE.Vector3());
    holder.position.set(-centre.x, -box.min.y, -centre.z);
    this.root.add(holder);
    this.root.updateMatrixWorld(true);

    gltfScene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        // Skinned bounds follow the bind pose; the posed arms can leave them
        mesh.frustumCulled = false;
      }
      if ((o as THREE.Bone).isBone) this.rest.set(o as THREE.Bone, o.quaternion.clone());
    });

    const head = this.bones.head!;
    this.eyeHeight = head.getWorldPosition(new THREE.Vector3()).y + 0.06;
  }

  /** Loads and validates the model. Rejects if it is missing or lacks the bones the pose needs. */
  static async load(renderer: THREE.WebGLRenderer, url = ASTRONAUT_MODEL_URL): Promise<AstronautRig> {
    const loader = new GLTFLoader();
    const draco = new DRACOLoader().setDecoderPath('/draco/');
    loader.setDRACOLoader(draco);
    loader.setMeshoptDecoder(MeshoptDecoder);
    const candidates = [url, ...ASTRONAUT_MODEL_URLS.filter((candidate) => candidate !== url)];
    let lastError: unknown;
    try {
      for (const candidate of candidates) {
        try {
          const gltf = await loader.loadAsync(candidate);
          const bones = findBones(gltf.scene);
          const missing = REQUIRED.filter((k) => !bones[k]);
          if (missing.length) throw new Error(`Astronaut model is missing bones: ${missing.join(', ')}`);
          const rig = new AstronautRig(gltf.scene, bones);
          renderer.compile(rig.root, new THREE.PerspectiveCamera());
          return rig;
        } catch (error) {
          lastError = error;
        }
      }
      throw lastError ?? new Error(`Astronaut model failed to load: ${url}`);
    } finally {
      draco.dispose();
    }
  }

  /**
   * Poses the figure for this frame: back to the rest pose, then breathing, the head's
   * yaw and pitch (radians), and both hands reaching their targets (astronaut space).
   */
  pose(seconds: number, headYaw: number, headPitch: number, arms: ArmTargets) {
    this.rest.forEach((q, bone) => bone.quaternion.copy(q));
    this.root.updateMatrixWorld(true);

    const right = this.tmpA.set(1, 0, 0).transformDirection(this.root.matrixWorld);
    const up = this.tmpB.set(0, 1, 0).transformDirection(this.root.matrixWorld);

    // Slow breathing in the chest
    const chest = this.bones.chest;
    if (chest) this.rotateWorld(chest, right, Math.sin(seconds * 1.25) * 0.012);

    // The head turns on the neck and head together, so the motion reads as natural
    const neck = this.bones.neck;
    const head = this.bones.head!;
    if (neck) {
      this.rotateWorld(neck, up, headYaw * 0.4);
      this.rotateWorld(neck, right, headPitch * 0.4);
    }
    this.rotateWorld(head, up, headYaw * (neck ? 0.6 : 1));
    this.rotateWorld(head, right, headPitch * (neck ? 0.6 : 1));

    const toWorld = (v: THREE.Vector3, out: THREE.Vector3) => out.copy(v).applyMatrix4(this.root.matrixWorld);
    this.solveArm('left', toWorld(arms.left, this.tmpC), toWorld(arms.leftPole, this.tmpD));
    this.solveArm('right', toWorld(arms.right, this.tmpC), toWorld(arms.rightPole, this.tmpD));
  }

  /** Hides the figure (not the tablet), e.g. once the screen fills the view. */
  setVisible(visible: boolean) {
    this.figure.visible = visible;
  }

  dispose() {
    this.gltfScene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.geometry.dispose();
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      mats.forEach((m) => {
        Object.values(m).forEach((v) => {
          if (v instanceof THREE.Texture) v.dispose();
        });
        m.dispose();
      });
    });
  }

  /** Rotates a bone about a world-space axis, keeping its children attached. */
  private rotateWorld(bone: THREE.Bone, axis: THREE.Vector3, angle: number) {
    if (!angle) return;
    const delta = this.tmpQ.setFromAxisAngle(axis, angle);
    this.setWorldQuaternion(bone, delta.multiply(bone.getWorldQuaternion(this.tmpQ2)));
  }

  private setWorldQuaternion(bone: THREE.Bone, world: THREE.Quaternion) {
    const parentWorld = new THREE.Quaternion();
    bone.parent?.getWorldQuaternion(parentWorld);
    bone.quaternion.copy(parentWorld.invert().multiply(world));
    bone.updateMatrixWorld(true);
  }

  /** Rotates `bone` so that `child`'s current position swings onto `target` (world). */
  private aim(bone: THREE.Bone, child: THREE.Object3D, target: THREE.Vector3) {
    const origin = bone.getWorldPosition(new THREE.Vector3());
    const from = child.getWorldPosition(new THREE.Vector3()).sub(origin).normalize();
    const to = target.clone().sub(origin).normalize();
    const delta = new THREE.Quaternion().setFromUnitVectors(from, to);
    this.setWorldQuaternion(bone, delta.multiply(bone.getWorldQuaternion(new THREE.Quaternion())));
  }

  /** Analytic two-bone IK: upper arm and forearm, elbow bending towards the pole. */
  private solveArm(side: 'left' | 'right', target: THREE.Vector3, pole: THREE.Vector3) {
    const upper = this.bones[side === 'left' ? 'leftArm' : 'rightArm']!;
    const lower = this.bones[side === 'left' ? 'leftForeArm' : 'rightForeArm']!;
    const hand = this.bones[side === 'left' ? 'leftHand' : 'rightHand']!;

    const s = upper.getWorldPosition(new THREE.Vector3());
    const e = lower.getWorldPosition(new THREE.Vector3());
    const w = hand.getWorldPosition(new THREE.Vector3());
    const a = s.distanceTo(e);
    const b = e.distanceTo(w);
    const toTarget = target.clone().sub(s);
    const d = THREE.MathUtils.clamp(toTarget.length(), Math.abs(a - b) + 1e-3, a + b - 1e-3);
    const dir = toTarget.normalize();
    const x = (a * a - b * b + d * d) / (2 * d);
    const h = Math.sqrt(Math.max(a * a - x * x, 0));
    const bend = pole.clone().sub(s);
    bend.addScaledVector(dir, -bend.dot(dir));
    if (bend.lengthSq() < 1e-8) bend.set(0, -1, 0);
    bend.normalize();
    const elbow = s.clone().addScaledVector(dir, x).addScaledVector(bend, h);
    const reach = s.clone().addScaledVector(dir, d);

    this.aim(upper, lower, elbow);
    this.aim(lower, hand, reach);
  }
}
