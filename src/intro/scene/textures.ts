import * as THREE from 'three';
import { mulberry32 } from './noise';

/** Tileable value noise on a size×size grid with `cells` lattice cells per side. */
function periodicValueNoise(size: number, cells: number, rand: () => number): Float32Array {
  const lattice = new Float32Array(cells * cells);
  for (let i = 0; i < lattice.length; i++) lattice[i] = rand();
  const out = new Float32Array(size * size);
  const fade = (t: number) => t * t * (3 - 2 * t);
  for (let y = 0; y < size; y++) {
    const gy = (y / size) * cells;
    const y0 = Math.floor(gy);
    const ty = fade(gy - y0);
    const y1 = (y0 + 1) % cells;
    for (let x = 0; x < size; x++) {
      const gx = (x / size) * cells;
      const x0 = Math.floor(gx);
      const tx = fade(gx - x0);
      const x1 = (x0 + 1) % cells;
      const a = lattice[y0 * cells + x0];
      const b = lattice[y0 * cells + x1];
      const c = lattice[y1 * cells + x0];
      const d = lattice[y1 * cells + x1];
      out[y * size + x] = a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
    }
  }
  return out;
}

function heightToNormalTexture(height: Float32Array, size: number, strength: number) {
  const data = new Uint8Array(size * size * 4);
  const at = (x: number, y: number) => height[((y + size) % size) * size + ((x + size) % size)];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
      const dy = (at(x, y + 1) - at(x, y - 1)) * strength;
      const inv = 1 / Math.sqrt(dx * dx + dy * dy + 1);
      const i = (y * size + x) * 4;
      data[i] = Math.round((-dx * inv * 0.5 + 0.5) * 255);
      data[i + 1] = Math.round((-dy * inv * 0.5 + 0.5) * 255);
      data[i + 2] = Math.round((inv * 0.5 + 0.5) * 255);
      data[i + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.NoColorSpace;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  return tex;
}

/** Fine regolith: drifted dust with scattered pebbles and grit. Tiles seamlessly. */
export function createRegolithNormal(size = 512): THREE.DataTexture {
  const rand = mulberry32(731);
  const h = new Float32Array(size * size);
  const octaves: Array<[number, number]> = [
    [8, 0.5],
    [16, 0.28],
    [48, 0.16],
    [128, 0.08],
  ];
  for (const [cells, amp] of octaves) {
    const n = periodicValueNoise(size, cells, rand);
    for (let i = 0; i < h.length; i++) h[i] += n[i] * amp;
  }
  // Pebbles: soft domes, wrapped across the tile edges
  const pebbles = Math.round(size * 0.9);
  for (let p = 0; p < pebbles; p++) {
    const cx = rand() * size;
    const cy = rand() * size;
    const r = 1.5 + Math.pow(rand(), 3) * size * 0.022;
    const amp = 0.25 + rand() * 0.5;
    const r2 = r * r;
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
      for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
        const d2 = (x - cx) * (x - cx) + (y - cy) * (y - cy);
        if (d2 > r2) continue;
        const idx = ((y + size) % size) * size + ((x + size) % size);
        h[idx] += Math.sqrt(1 - d2 / r2) * amp * (r / 6);
      }
    }
  }
  return heightToNormalTexture(h, size, 2.2);
}

/** Suit outer layer: a fine ripstop weave. Tiles seamlessly. */
export function createFabricNormal(size = 256): THREE.DataTexture {
  const h = new Float32Array(size * size);
  const weave = 48;
  const grid = 8;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = (x / size) * weave * Math.PI * 2;
      const v = (y / size) * weave * Math.PI * 2;
      let val = Math.sin(u) * Math.sin(v) * 0.5;
      // Ripstop reinforcement threads
      const gu = Math.abs(Math.sin((x / size) * grid * Math.PI));
      const gv = Math.abs(Math.sin((y / size) * grid * Math.PI));
      val += (Math.pow(1 - gu, 24) + Math.pow(1 - gv, 24)) * 0.9;
      h[y * size + x] = val;
    }
  }
  return heightToNormalTexture(h, size, 1.4);
}
