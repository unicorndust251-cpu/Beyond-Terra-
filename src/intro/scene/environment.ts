import * as THREE from 'three';
import { createNoise2D, fbm, mulberry32, ridged, smoothstep } from './noise';
import { createRegolithNormal } from './textures';

/**
 * The Martian surface: low sun, dusty butterscotch sky, rock-strewn regolith and distant
 * eroded ridges. Colours follow calibrated rover imagery (reddish-brown fines, darker
 * basaltic rocks), not a stylised orange.
 */

export const SURFACE = {
  /**
   * Direction towards the sun: low (≈19°), behind the astronaut and a little to the
   * right, so their long shadow falls ahead of them into the shot.
   */
  sunDir: new THREE.Vector3(0.36, 0.34, 0.87).normalize(),
  sunColor: '#FFD3A8',
  skyZenith: '#5E4237',
  skyHorizon: '#C49476',
  ground: '#6E4A3A',
  fog: '#B98C70',
};

const noiseA = createNoise2D(11);
const noiseB = createNoise2D(29);
const noiseC = createNoise2D(47);

/** Terrain height (metres) at world x, z. The astronaut stands near the origin. */
export function terrainHeight(x: number, z: number): number {
  const r = Math.hypot(x, z);
  // Gentle undulation everywhere, kept almost flat right under the astronaut
  let h = fbm(noiseA, x * 0.045, z * 0.045, 4) * 1.4 * smoothstep(1.5, 18, r);
  h += fbm(noiseB, x * 0.6, z * 0.6, 3) * 0.06;
  h += fbm(noiseB, x * 2.4, z * 2.4, 2) * 0.012;
  // Distant eroded ridges and mesas, rising beyond ~150 m
  const far = smoothstep(110, 420, r);
  if (far > 0) {
    const ridge = ridged(noiseC, x * 0.0042, z * 0.0042, 5);
    const mesa = smoothstep(0.38, 0.62, fbm(noiseA, x * 0.0021 + 7, z * 0.0021, 3) * 0.5 + 0.5);
    h += far * (ridge * 95 + mesa * 38);
  }
  // A shallow old crater rim off to the left of the shot
  const cx = x + 38;
  const cz = z + 52;
  const cr = Math.hypot(cx, cz) / 26;
  h += (Math.exp(-((cr - 1) * (cr - 1)) * 18) * 2.2 - Math.exp(-cr * cr * 1.6) * 1.6) * smoothstep(8, 30, r);
  return h;
}

export function createSky(): THREE.Mesh {
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uSunDir: { value: SURFACE.sunDir.clone() },
      uZenith: { value: new THREE.Color(SURFACE.skyZenith) },
      uHorizon: { value: new THREE.Color(SURFACE.skyHorizon) },
      uGround: { value: new THREE.Color(SURFACE.ground) },
      uSun: { value: new THREE.Color(SURFACE.sunColor) },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = position;
        vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position = p.xyww;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uSunDir, uZenith, uHorizon, uGround, uSun;
      varying vec3 vDir;
      void main() {
        vec3 d = normalize(vDir);
        float h = d.y;
        // Dusty sky: brightest and warmest at the horizon, deepening overhead
        vec3 col = mix(uHorizon, uZenith, pow(smoothstep(-0.02, 0.75, h), 0.65));
        float mu = max(dot(d, uSunDir), 0.0);
        // Strong forward scattering by suspended dust around the sun
        col += uSun * (pow(mu, 6.0) * 0.32 + pow(mu, 40.0) * 0.55);
        // A faint, pale aureole right around the small Martian sun
        col = mix(col, vec3(0.86, 0.84, 0.8), pow(mu, 220.0) * 0.5);
        col += vec3(1.0, 0.96, 0.9) * smoothstep(0.99985, 0.99993, mu) * 4.0;
        // Horizon haze band
        col = mix(col, uHorizon * 1.08, exp(-abs(h) * 22.0) * 0.35);
        col = mix(uGround, col, smoothstep(-0.06, 0.0, h));
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(1500, 48, 24), material);
  sky.frustumCulled = false;
  sky.renderOrder = -10;
  return sky;
}

const C_FINES = new THREE.Color('#8C5B42');
const C_DUST = new THREE.Color('#A8775A');
const C_DARK = new THREE.Color('#5A3A2D');
const C_ROCKY = new THREE.Color('#6B4636');

export function createTerrain(quality: 'high' | 'low'): THREE.Mesh {
  const rings = quality === 'high' ? 170 : 110;
  const segments = quality === 'high' ? 260 : 150;
  const growth = quality === 'high' ? 1.052 : 1.081;
  const r0 = 0.12;

  const radii: number[] = [0];
  for (let i = 1; i <= rings; i++) radii.push(r0 * (Math.pow(growth, i) - 1) / (growth - 1));

  const vertexCount = 1 + rings * segments;
  const positions = new Float32Array(vertexCount * 3);
  const uvs = new Float32Array(vertexCount * 2);
  const colors = new Float32Array(vertexCount * 3);

  const setVertex = (idx: number, x: number, z: number) => {
    const y = terrainHeight(x, z);
    positions.set([x, y, z], idx * 3);
    uvs.set([x * 0.55, z * 0.55], idx * 2);
  };
  setVertex(0, 0, 0);
  for (let i = 1; i <= rings; i++) {
    const r = radii[i];
    for (let s = 0; s < segments; s++) {
      const a = (s / segments) * Math.PI * 2 + (i % 2) * (Math.PI / segments);
      setVertex(1 + (i - 1) * segments + s, Math.cos(a) * r, Math.sin(a) * r);
    }
  }

  const indices: number[] = [];
  for (let s = 0; s < segments; s++) indices.push(0, 1 + ((s + 1) % segments), 1 + s);
  for (let i = 1; i < rings; i++) {
    const a0 = 1 + (i - 1) * segments;
    const b0 = 1 + i * segments;
    for (let s = 0; s < segments; s++) {
      const s1 = (s + 1) % segments;
      indices.push(a0 + s, a0 + s1, b0 + s, a0 + s1, b0 + s1, b0 + s);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  // Colour: reddish-brown fines, paler drifted dust in hollows, darker rock on slopes
  const normals = geometry.getAttribute('normal') as THREE.BufferAttribute;
  const c = new THREE.Color();
  for (let v = 0; v < vertexCount; v++) {
    const x = positions[v * 3];
    const z = positions[v * 3 + 2];
    const slope = 1 - normals.getY(v);
    const patch = fbm(noiseB, x * 0.08 + 3, z * 0.08, 3) * 0.5 + 0.5;
    const fine = fbm(noiseC, x * 0.9, z * 0.9, 2) * 0.5 + 0.5;
    c.copy(C_FINES).lerp(C_DUST, smoothstep(0.45, 0.8, patch) * 0.8);
    c.lerp(C_ROCKY, smoothstep(0.55, 0.85, fine) * 0.35);
    c.lerp(C_DARK, smoothstep(0.08, 0.35, slope) * 0.75);
    colors.set([c.r, c.g, c.b], v * 3);
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const normalMap = createRegolithNormal(quality === 'high' ? 512 : 256);
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.96,
    metalness: 0,
    normalMap,
    normalScale: new THREE.Vector2(0.9, 0.9),
    envMapIntensity: 0.45,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.receiveShadow = true;
  return mesh;
}

function createRockGeometry(seed: number, detail: number): THREE.BufferGeometry {
  const noise = createNoise2D(seed);
  // Indexed sphere so the deformed surface shades smoothly (an icosahedron would facet)
  const geo = new THREE.SphereGeometry(1, 10 + detail * 5, 7 + detail * 4);
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const n = v.clone().normalize();
    // Lumpy, faceted basalt: large-scale lumps plus chipped facets
    let d = 1 + noise(n.x * 1.6 + n.z, n.y * 1.6) * 0.28 + noise(n.x * 4.5, n.z * 4.5 + n.y) * 0.08;
    d *= 1 - Math.max(0, -n.y) * 0.35; // flatter underside
    v.copy(n).multiplyScalar(d);
    v.y *= 0.72;
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  return geo;
}

/** Scattered rocks, keeping the astronaut's footing and the camera's path clear. */
export function createRocks(quality: 'high' | 'low'): THREE.Group {
  const group = new THREE.Group();
  const rand = mulberry32(4242);
  const detail = quality === 'high' ? 3 : 2;
  const variants = [createRockGeometry(5, detail), createRockGeometry(17, detail), createRockGeometry(83, detail)];
  const count = quality === 'high' ? 420 : 200;
  const material = new THREE.MeshStandardMaterial({
    color: '#ffffff',
    roughness: 0.9,
    metalness: 0,
    envMapIntensity: 0.4,
  });

  const meshes = variants.map((g) => {
    const m = new THREE.InstancedMesh(g, material, count + 8);
    m.castShadow = true;
    m.receiveShadow = true;
    m.count = 0;
    group.add(m);
    return m;
  });

  const tint = [new THREE.Color('#5E3F31'), new THREE.Color('#4A3229'), new THREE.Color('#77503D'), new THREE.Color('#3F2D26')];
  const mat = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const s = new THREE.Vector3();
  const p = new THREE.Vector3();
  const col = new THREE.Color();

  let next = 0;
  const place = (x: number, z: number, size: number) => {
    const m = meshes[next++ % meshes.length];
    e.set(rand() * 0.6 - 0.3, rand() * Math.PI * 2, rand() * 0.6 - 0.3);
    q.setFromEuler(e);
    s.set(size * (0.8 + rand() * 0.5), size * (0.6 + rand() * 0.5), size * (0.8 + rand() * 0.5));
    p.set(x, terrainHeight(x, z) - size * 0.28, z);
    mat.compose(p, q, s);
    m.setMatrixAt(m.count, mat);
    col.copy(tint[Math.floor(rand() * tint.length)]).multiplyScalar(0.85 + rand() * 0.3);
    m.setColorAt(m.count, col);
    m.count++;
  };

  let placed = 0;
  let guard = 0;
  while (placed < count && guard++ < count * 20) {
    const r = 0.9 + Math.pow(rand(), 1.7) * 70;
    const a = rand() * Math.PI * 2;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    // Keep clear: under the astronaut, and the strip the camera travels through
    if (Math.hypot(x, z) < 0.85) continue;
    if (x > -0.6 && x < 3.2 && z > -0.8 && z < 4.2) continue;
    const size = (0.035 + Math.pow(rand(), 3.2) * 0.42) * (1 + r / 28);
    place(x, z, size);
    placed++;
  }
  // A few large boulders in the mid-ground for depth
  const boulders: Array<[number, number, number]> = [
    [-6.5, -9, 1.1], [7.5, -14, 1.5], [-15, -22, 2.4], [18, -30, 2.0], [-4, -26, 1.3], [26, -12, 1.8],
  ];
  boulders.forEach(([x, z, sz]) => place(x, z, sz));

  meshes.forEach((m) => {
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    m.computeBoundingSphere();
  });
  return group;
}

/** Fine dust drifting through the light. Very sparse and slow. */
export function createDust(quality: 'high' | 'low') {
  const count = quality === 'high' ? 420 : 200;
  const rand = mulberry32(99);
  const positions = new Float32Array(count * 3);
  const seeds = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    positions.set([(rand() - 0.5) * 9, rand() * 3.2, (rand() - 0.5) * 9 - 1], i * 3);
    seeds[i] = rand();
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uFade: { value: 1 },
      uPixelRatio: { value: 1 },
      uColor: { value: new THREE.Color('#E8C2AD') },
      uSunDir: { value: SURFACE.sunDir.clone() },
    },
    vertexShader: /* glsl */ `
      attribute float aSeed;
      uniform float uTime;
      uniform float uPixelRatio;
      varying float vAlpha;
      void main() {
        vec3 p = position;
        // Slow drift with the wind, wrapping inside the box
        p.x = mod(p.x + uTime * (0.18 + aSeed * 0.2) + 4.5, 9.0) - 4.5;
        p.y += sin(uTime * 0.6 + aSeed * 40.0) * 0.06;
        p.z += cos(uTime * 0.4 + aSeed * 23.0) * 0.08;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        float dist = -mv.z;
        gl_PointSize = clamp((1.2 + aSeed * 2.2) * uPixelRatio * (3.0 / max(dist, 0.3)), 0.5, 8.0 * uPixelRatio);
        vAlpha = (0.08 + aSeed * 0.16) * smoothstep(0.15, 0.6, dist);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uFade;
      varying float vAlpha;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.1, d) * vAlpha * uFade;
        gl_FragColor = vec4(uColor, a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
    transparent: true,
    depthWrite: false,
  });
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  return { points, material };
}
