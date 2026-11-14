import * as THREE from 'three';
import { Astronaut, createSuitMaterials, type SuitMaterials } from './astronaut';
import type { ArmTargets } from './astronautRig';
import type { IntroFigure } from './thirdPersonScene';

/**
 * The built-in astronaut (the suit modelled in code, see astronaut.ts), shown when no
 * rigged model is supplied at /models/astronaut.glb.
 */
export class ProceduralAstronaut implements IntroFigure {
  readonly root: THREE.Group;
  readonly eyeHeight = 1.76;
  /** The suit's materials. The gloves are part of the tablet and use them too. */
  readonly gloveMaterials: SuitMaterials = createSuitMaterials();
  private readonly astronaut: Astronaut;

  constructor() {
    this.astronaut = new Astronaut(this.gloveMaterials);
    this.root = this.astronaut.root;
    this.root.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
  }

  pose(seconds: number, headYaw: number, headPitch: number, arms: ArmTargets) {
    // The helmet turns on its neck ring; slightly down at rest, as when looking out
    this.astronaut.helmetPivot.rotation.set(-0.06 + headPitch, -0.05 + headYaw, 0);
    this.astronaut.updateArms({ leftWrist: arms.left, rightWrist: arms.right });
    this.astronaut.breathe(seconds);
  }

  setVisible(visible: boolean) {
    this.root.visible = visible;
  }

  dispose() {
    const textures = new Set<THREE.Texture>();
    this.root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.geometry.dispose();
    });
    Object.values(this.gloveMaterials).forEach((m: THREE.Material) => {
      Object.values(m).forEach((v) => v instanceof THREE.Texture && textures.add(v));
      m.dispose();
    });
    textures.forEach((t) => t.dispose());
  }
}
