import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { createFabricNormal } from './textures';

/**
 * A future Mars surface suit, built in code (no external model): hard upper torso,
 * rear-entry life-support pack, bearing rings at shoulders, waist, elbows and wrists, and a
 * helmet with a gold reflective visor. The intro shows it when no rigged astronaut model
 * is supplied. It is a concept, not a model of flight hardware.
 *
 * Coordinates: metres, astronaut standing at the origin and facing −Z (right hand at +X).
 */

export interface SuitMaterials {
  fabric: THREE.Material;
  shell: THREE.Material;
  metal: THREE.Material;
  rubber: THREE.Material;
  visor: THREE.Material;
  accent: THREE.Material;
  panel: THREE.Material;
  glove: THREE.Material;
}

/** Dust settles on the lower suit: tint by world height. */
function addDust(material: THREE.MeshStandardMaterial, strength: number) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uDust = { value: new THREE.Color('#A87A5C') };
    shader.uniforms.uDustStrength = { value: strength };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vBtWorld;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        {
          vec4 btw = modelMatrix * vec4(transformed, 1.0);
          #ifdef USE_INSTANCING
            btw = modelMatrix * instanceMatrix * vec4(transformed, 1.0);
          #endif
          vBtWorld = btw.xyz;
        }`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        '#include <common>\nvarying vec3 vBtWorld;\nuniform vec3 uDust;\nuniform float uDustStrength;',
      )
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
        {
          float low = 1.0 - smoothstep(0.08, 0.95, vBtWorld.y);
          float speck = fract(sin(dot(floor(vBtWorld.xz * 180.0 + vBtWorld.y * 97.0), vec2(12.9898, 78.233))) * 43758.5453);
          float dust = clamp(low * 0.85 + 0.1 + speck * 0.05, 0.0, 1.0) * uDustStrength;
          diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * uDust * 1.25, dust);
        }`,
      );
  };
  material.customProgramCacheKey = () => `bt-dust-${strength}`;
}

export function createSuitMaterials(): SuitMaterials {
  const weave = createFabricNormal(256);
  weave.repeat.set(6, 6);
  const fabric = new THREE.MeshStandardMaterial({
    color: '#E3DDD1',
    roughness: 0.86,
    metalness: 0,
    normalMap: weave,
    normalScale: new THREE.Vector2(0.4, 0.4),
  });
  addDust(fabric, 0.65);
  const glove = new THREE.MeshStandardMaterial({
    color: '#D5CDBF',
    roughness: 0.8,
    normalMap: weave,
    normalScale: new THREE.Vector2(0.35, 0.35),
  });
  addDust(glove, 0.25);
  const shell = new THREE.MeshPhysicalMaterial({
    color: '#ECE7DF',
    roughness: 0.42,
    metalness: 0,
    clearcoat: 0.35,
    clearcoatRoughness: 0.35,
  });
  return {
    fabric,
    glove,
    shell,
    metal: new THREE.MeshStandardMaterial({ color: '#A9A49B', metalness: 0.92, roughness: 0.34 }),
    rubber: new THREE.MeshStandardMaterial({ color: '#2B2724', roughness: 0.82, metalness: 0.05 }),
    visor: new THREE.MeshPhysicalMaterial({
      color: '#A98451',
      metalness: 1,
      roughness: 0.06,
      clearcoat: 1,
      clearcoatRoughness: 0.04,
      envMapIntensity: 1.25,
    }),
    accent: new THREE.MeshStandardMaterial({ color: '#8F5543', roughness: 0.8 }),
    panel: new THREE.MeshStandardMaterial({ color: '#C9C1B5', roughness: 0.62, metalness: 0.05 }),
  };
}

const UP = new THREE.Vector3(0, 1, 0);

/** A tapered limb segment with fabric convolutes, re-aimed every frame between two points. */
class Limb {
  readonly group = new THREE.Group();
  private readonly tube: THREE.Mesh;
  private readonly rings: Array<{ mesh: THREE.Mesh; at: number }> = [];

  constructor(rTop: number, rBottom: number, mats: SuitMaterials, convolutes: number[]) {
    this.tube = new THREE.Mesh(new THREE.CylinderGeometry(rBottom, rTop, 1, 24, 1, true), mats.fabric);
    this.tube.castShadow = true;
    this.group.add(this.tube);
    for (const at of convolutes) {
      const r = rTop + (rBottom - rTop) * at;
      const ring = new THREE.Mesh(new THREE.TorusGeometry(r * 0.98, r * 0.13, 8, 28), mats.fabric);
      ring.rotation.x = Math.PI / 2;
      ring.castShadow = true;
      this.group.add(ring);
      this.rings.push({ mesh: ring, at });
    }
  }

  /** Spans from a (top) to b (bottom), both in the parent's space. */
  set(a: THREE.Vector3, b: THREE.Vector3) {
    const dir = new THREE.Vector3().subVectors(b, a);
    const len = dir.length();
    this.group.position.copy(a);
    this.group.quaternion.setFromUnitVectors(UP, dir.normalize());
    // Cylinder runs along +Y: bottom radius at a, top radius at b
    this.tube.scale.set(1, len, 1);
    this.tube.position.y = len / 2;
    for (const { mesh, at } of this.rings) mesh.position.y = at * len;
  }
}

function bearing(radius: number, mats: SuitMaterials) {
  const g = new THREE.Group();
  const outer = new THREE.Mesh(new THREE.TorusGeometry(radius, radius * 0.16, 10, 36), mats.metal);
  const inner = new THREE.Mesh(new THREE.CylinderGeometry(radius * 1.02, radius * 1.02, radius * 0.22, 36, 1, true), mats.shell);
  outer.castShadow = inner.castShadow = true;
  outer.rotation.x = Math.PI / 2;
  g.add(outer, inner);
  return g;
}

function mesh(geo: THREE.BufferGeometry, mat: THREE.Material, castShadow = true) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = castShadow;
  m.receiveShadow = true;
  return m;
}

/** Two-bone IK: elbow position for shoulder s, wrist w, bone lengths l1, l2 and a pole hint. */
function solveElbow(s: THREE.Vector3, w: THREE.Vector3, l1: number, l2: number, pole: THREE.Vector3) {
  const d = new THREE.Vector3().subVectors(w, s);
  const dist = Math.min(d.length(), l1 + l2 - 1e-4);
  const dir = d.normalize();
  const a = (l1 * l1 - l2 * l2 + dist * dist) / (2 * dist);
  const h = Math.sqrt(Math.max(l1 * l1 - a * a, 0));
  const toPole = new THREE.Vector3().subVectors(pole, s);
  const perp = toPole.sub(dir.clone().multiplyScalar(toPole.dot(dir))).normalize();
  return s.clone().addScaledVector(dir, a).addScaledVector(perp, h);
}

export interface ArmTargets {
  leftWrist: THREE.Vector3;
  rightWrist: THREE.Vector3;
}

export class Astronaut {
  readonly root = new THREE.Group();
  readonly helmetPivot = new THREE.Group();
  readonly torso = new THREE.Group();
  private readonly mats: SuitMaterials;

  private readonly arms: Array<{
    side: 1 | -1;
    shoulder: THREE.Vector3;
    upper: Limb;
    fore: Limb;
    elbow: THREE.Group;
    wrist: THREE.Group;
  }> = [];

  readonly upperLen = 0.3;
  readonly foreLen = 0.29;

  constructor(mats: SuitMaterials) {
    this.mats = mats;
    this.root.add(this.torso);
    this.buildLegs();
    this.buildTorso();
    this.buildHelmet();
    this.buildPack();
    this.buildArms();
  }

  private buildLegs() {
    const m = this.mats;
    for (const side of [-1, 1] as const) {
      const hip = new THREE.Vector3(side * 0.12, 0.98, 0.02);
      const knee = new THREE.Vector3(side * 0.145, 0.54, -0.035);
      const ankle = new THREE.Vector3(side * 0.155, 0.14, 0.0);
      const thigh = new Limb(0.102, 0.088, m, [0.3, 0.5, 0.7]);
      thigh.set(hip, knee);
      const shin = new Limb(0.088, 0.074, m, [0.25, 0.5]);
      shin.set(knee, ankle);
      const kneeJoint = mesh(new THREE.SphereGeometry(0.094, 20, 14), m.fabric);
      kneeJoint.position.copy(knee);
      const kneePad = mesh(new RoundedBoxGeometry(0.11, 0.1, 0.05, 2, 0.02), m.shell);
      kneePad.position.copy(knee).add(new THREE.Vector3(0, 0, -0.075));
      const hipBearing = bearing(0.1, m);
      hipBearing.position.copy(hip).add(new THREE.Vector3(0, -0.06, 0));
      hipBearing.quaternion.setFromUnitVectors(UP, new THREE.Vector3().subVectors(knee, hip).normalize());

      // Boot: dark sole and toe cap, pale upper
      const boot = new THREE.Group();
      const upper = mesh(new RoundedBoxGeometry(0.15, 0.15, 0.2, 3, 0.04), m.shell);
      upper.position.set(0, 0.1, 0.0);
      const foot = mesh(new RoundedBoxGeometry(0.15, 0.085, 0.32, 3, 0.035), m.rubber);
      foot.position.set(0, 0.045, -0.05);
      const sole = mesh(new RoundedBoxGeometry(0.16, 0.03, 0.33, 2, 0.012), m.rubber);
      sole.position.set(0, 0.015, -0.05);
      boot.add(upper, foot, sole);
      boot.position.set(side * 0.155, 0, 0);
      boot.rotation.y = side * -0.08;

      this.torso.add(thigh.group, shin.group, kneeJoint, kneePad, hipBearing, boot);
    }
  }

  private buildTorso() {
    const m = this.mats;
    // Brief and lower torso (fabric)
    const brief = mesh(new RoundedBoxGeometry(0.42, 0.26, 0.29, 4, 0.1), m.fabric);
    brief.position.set(0, 1.0, 0.02);
    const lower = mesh(new THREE.CylinderGeometry(0.205, 0.215, 0.22, 32), m.fabric);
    lower.scale.z = 0.8;
    lower.position.set(0, 1.18, 0.0);
    const waist = bearing(0.2, m);
    waist.scale.set(1, 1, 0.8);
    waist.position.set(0, 1.105, 0);
    // Hard upper torso
    const hut = mesh(new THREE.SphereGeometry(0.27, 40, 28), m.shell);
    hut.scale.set(1.04, 1.0, 0.76);
    hut.position.set(0, 1.39, 0);
    // Shoulder accent band (mission marking)
    const band = mesh(new THREE.TorusGeometry(0.205, 0.012, 8, 40, Math.PI * 0.9), m.accent, false);
    band.rotation.set(Math.PI / 2, 0, Math.PI * 0.05);
    band.position.set(0, 1.52, 0);
    band.scale.set(1.25, 0.9, 1);
    // Neck ring
    const neck = mesh(new THREE.TorusGeometry(0.15, 0.022, 12, 40), m.metal);
    neck.rotation.x = Math.PI / 2;
    neck.position.set(0, 1.6, -0.015);
    // Chest display/control module, seen edge-on from behind
    const dcm = mesh(new RoundedBoxGeometry(0.22, 0.1, 0.06, 2, 0.018), m.shell);
    dcm.position.set(0, 1.27, -0.2);
    const dcmTop = mesh(new RoundedBoxGeometry(0.18, 0.016, 0.045, 1, 0.006), m.rubber);
    dcmTop.position.set(0, 1.325, -0.2);
    this.torso.add(brief, lower, waist, hut, band, neck, dcm, dcmTop);
  }

  private buildHelmet() {
    const m = this.mats;
    this.helmetPivot.position.set(0, 1.6, -0.015);
    // Looking down at the tablet
    this.helmetPivot.rotation.x = -0.36;
    this.helmetPivot.rotation.y = -0.05;
    const shell = mesh(new THREE.SphereGeometry(0.168, 48, 32), m.shell);
    shell.position.set(0, 0.15, 0.01);
    // Visor: the front of the bubble, gold-coated
    const visor = mesh(
      new THREE.SphereGeometry(0.174, 48, 32, Math.PI * 1.12, Math.PI * 0.76, Math.PI * 0.2, Math.PI * 0.46),
      m.visor,
    );
    visor.position.copy(shell.position);
    // Visor frame rim
    const rim = mesh(new THREE.TorusGeometry(0.176, 0.009, 8, 64, Math.PI * 0.8), m.shell);
    rim.position.copy(shell.position);
    rim.rotation.set(0, Math.PI / 2, Math.PI * 0.6);
    // Helmet lights and camera
    const lights = [-1, 1].map((side) => {
      const g = new THREE.Group();
      const housing = mesh(new RoundedBoxGeometry(0.05, 0.05, 0.11, 2, 0.012), m.shell);
      const lens = mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.01, 20), m.metal);
      lens.rotation.x = Math.PI / 2;
      lens.position.z = -0.058;
      g.add(housing, lens);
      g.position.set(side * 0.165, 0.2, -0.01);
      return g;
    });
    const ringBase = mesh(new THREE.CylinderGeometry(0.15, 0.155, 0.04, 40), m.metal);
    ringBase.position.y = 0.01;
    this.helmetPivot.add(shell, visor, rim, ringBase, ...lights);
    this.torso.add(this.helmetPivot);
  }

  private buildPack() {
    const m = this.mats;
    const pack = new THREE.Group();
    const body = mesh(new RoundedBoxGeometry(0.46, 0.56, 0.21, 4, 0.05), m.shell);
    const lid = mesh(new RoundedBoxGeometry(0.42, 0.06, 0.19, 2, 0.022), m.shell);
    lid.position.set(0, 0.3, 0.005);
    // Recessed service panel, hinge rail and latches
    const panel = mesh(new RoundedBoxGeometry(0.32, 0.34, 0.02, 2, 0.012), m.panel);
    panel.position.set(0, 0.0, 0.1);
    const hinge = mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.3, 12), m.metal);
    hinge.rotation.z = Math.PI / 2;
    hinge.position.set(0, 0.185, 0.108);
    const latchL = mesh(new RoundedBoxGeometry(0.04, 0.06, 0.025, 1, 0.008), m.metal);
    latchL.position.set(-0.13, -0.19, 0.11);
    const latchR = latchL.clone();
    latchR.position.x = 0.13;
    const vents = [0, 1, 2].map((i) => {
      const v = mesh(new RoundedBoxGeometry(0.16, 0.012, 0.012, 1, 0.004), m.rubber);
      v.position.set(0, -0.225 + i * 0.02, 0.106);
      return v;
    });
    // Side antenna stub and a sample-bag clip, for scale and silhouette
    const stub = mesh(new THREE.CylinderGeometry(0.006, 0.008, 0.14, 8), m.rubber);
    stub.position.set(-0.19, 0.36, -0.02);
    pack.add(body, lid, panel, hinge, latchL, latchR, ...vents, stub);
    pack.position.set(0, 1.3, 0.25);
    this.torso.add(pack);

    // Umbilical hose from the pack to the chest module, over the right hip
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0.2, 1.14, 0.2),
      new THREE.Vector3(0.29, 1.12, 0.05),
      new THREE.Vector3(0.25, 1.17, -0.15),
      new THREE.Vector3(0.1, 1.28, -0.24),
    ]);
    const hose = mesh(new THREE.TubeGeometry(curve, 40, 0.017, 10, false), m.rubber);
    this.torso.add(hose);
  }

  private buildArms() {
    const m = this.mats;
    for (const side of [-1, 1] as const) {
      const shoulder = new THREE.Vector3(side * 0.305, 1.5, 0.0);
      const cap = mesh(new THREE.SphereGeometry(0.105, 24, 18), m.shell);
      cap.position.copy(shoulder);
      cap.scale.set(1.05, 0.95, 1);
      const sb = bearing(0.092, m);
      sb.position.copy(shoulder).add(new THREE.Vector3(side * 0.07, -0.02, 0));
      sb.rotation.z = (side * Math.PI) / 2;
      const upper = new Limb(0.08, 0.07, m, [0.35, 0.55, 0.75]);
      const fore = new Limb(0.07, 0.058, m, [0.3, 0.55]);
      const elbow = new THREE.Group();
      const elbowBall = mesh(new THREE.SphereGeometry(0.074, 20, 14), m.fabric);
      const elbowBearing = bearing(0.072, m);
      elbow.add(elbowBall, elbowBearing);
      const wrist = new THREE.Group();
      wrist.add(bearing(0.06, m));
      this.torso.add(cap, sb, upper.group, fore.group, elbow, wrist);
      this.arms.push({ side, shoulder, upper, fore, elbow, wrist });
    }
  }

  /** Re-aim both arms at wrist targets given in the astronaut's local space. */
  updateArms(targets: ArmTargets) {
    for (const arm of this.arms) {
      const wristPos = arm.side === 1 ? targets.rightWrist : targets.leftWrist;
      // Elbows drop down, out and a little back, as when holding something at chest height
      const pole = arm.shoulder.clone().add(new THREE.Vector3(arm.side * 0.32, -0.42, 0.2));
      const elbowPos = solveElbow(arm.shoulder, wristPos, this.upperLen, this.foreLen, pole);
      arm.upper.set(arm.shoulder, elbowPos);
      arm.fore.set(elbowPos, wristPos);
      arm.elbow.position.copy(elbowPos);
      arm.elbow.quaternion.setFromUnitVectors(UP, new THREE.Vector3().subVectors(wristPos, elbowPos).normalize());
      arm.wrist.position.copy(wristPos);
      arm.wrist.quaternion.setFromUnitVectors(UP, new THREE.Vector3().subVectors(wristPos, elbowPos).normalize());
    }
  }

  /** Subtle breathing: the chest rises a few millimetres. */
  breathe(seconds: number) {
    const b = Math.sin(seconds * 1.5) * 0.5 + 0.5;
    this.torso.position.y = b * 0.004;
  }
}
