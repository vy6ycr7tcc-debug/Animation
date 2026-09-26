/* The wilder places (Samuel: "caves, mountains with snow, palm trees, tall grass"):
   - Palms on the beaches, where the sand meets the water. Round and curving as every living
     thing here: a leaning trunk ringed with growth, fronds that arch out and fall away, each
     curling into a spiral at its tip, and a few seed-lights under the crown. They sway.
   - Caves in the steep hillsides (placed in terrain.ts): a hollow of etched stone running into
     the hill, crystals glowing at the back, glow-worm lights on the ceiling. The rock dissolves
     wherever it would hide the wanderer from the camera.
   (The tall grass grows in life.ts; the snowy mountains rise in terrain.ts.) */
import * as THREE from "three/webgpu";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { outOfTheWay, T, withFog, worldPoints } from "../gpu/tsl";
import { crystalMaterial, prismGeometry } from "./creation";
import { etchedStone } from "./etching";
import type { LifeFrame } from "./life";
import { CAVE_SITES, colliders, fbm, groundKind, heightAt, LANDMARK_SITES, SPAWN, WATER_Y } from "./terrain";

const { attribute, cos, dot, float, fract, Fn, mix, normalWorld, positionLocal, positionWorld, sin, smoothstep, abs, screenCoordinate, step, uniform, vec2, vec3, vec4 } = T;
const V = THREE.Vector3;

function hash(i: number, j: number, salt: number): number {
  const s = Math.sin(i * 127.1 + j * 311.7 + salt * 74.7) * 43758.5453;
  return s - Math.floor(s);
}

/* ---------------------------------------------------------------- palms */
const PCELL = 16;
const PRING = 6; // ~100 m each way
const MAX_PALMS = 160;

/** A tube along a curve, its radius `r(u)`, tagged for the palm's shader. */
function tube(curve: THREE.Curve<THREE.Vector3>, segs: number, sides: number, r: (u: number) => number, sway: (u: number) => number): THREE.BufferGeometry {
  const pos: number[] = [], nor: number[] = [], part: number[] = [], us: number[] = [], xs: number[] = [], sw: number[] = [], idx: number[] = [];
  const t = new V(), n1 = new V(), n2 = new V(), p = new V(), d = new V();
  for (let i = 0; i <= segs; i++) {
    const u = i / segs;
    curve.getPoint(u, p);
    curve.getTangent(u, t);
    n1.crossVectors(t, new V(1, 0, 0)).normalize();
    n2.crossVectors(t, n1).normalize();
    for (let k = 0; k <= sides; k++) {
      const a = (k / sides) * Math.PI * 2;
      d.copy(n1).multiplyScalar(Math.cos(a)).addScaledVector(n2, Math.sin(a));
      pos.push(p.x + d.x * r(u), p.y + d.y * r(u), p.z + d.z * r(u));
      nor.push(d.x, d.y, d.z);
      part.push(0);
      us.push(u);
      xs.push(0);
      sw.push(sway(u));
    }
  }
  for (let i = 0; i < segs; i++)
    for (let k = 0; k < sides; k++) {
      const a = i * (sides + 1) + k, b = a + sides + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  return tagged(pos, nor, part, us, xs, sw, idx);
}

function tagged(pos: number[], nor: number[], part: number[], us: number[], xs: number[], sw: number[], idx: number[]): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute("aPart", new THREE.Float32BufferAttribute(part, 1));
  g.setAttribute("aU", new THREE.Float32BufferAttribute(us, 1));
  g.setAttribute("aX", new THREE.Float32BufferAttribute(xs, 1));
  g.setAttribute("aSway", new THREE.Float32BufferAttribute(sw, 1));
  g.setIndex(idx);
  return g;
}

/** One palm, about 6 m tall, leaning by `lean` metres at the crown. */
function palmGeometry(lean: number): THREE.BufferGeometry {
  const H = 6.2;
  const trunk = new THREE.CatmullRomCurve3([new V(0, 0, 0), new V(lean * 0.2, H * 0.35, 0), new V(lean * 0.7, H * 0.72, 0), new V(lean, H, 0)]);
  const parts = [tube(trunk, 18, 7, (u) => 0.19 * (1 - u * 0.4) + 0.12 * Math.max(0, 1 - u * 5), (u) => u * u * 0.3)];
  const crown = trunk.getPoint(1);
  const up = new V(0, 1, 0);
  for (let k = 0; k < 9; k++) {
    const a = (k / 9) * Math.PI * 2 + (k % 2) * 0.25;
    const dir = new V(Math.cos(a), 0, Math.sin(a)), side = new V(-Math.sin(a), 0, Math.cos(a));
    const len = 2.5 + (k % 3) * 0.4;
    const pts: THREE.Vector3[] = [];
    // out and a little up, then arching over and down
    for (let i = 0; i <= 14; i++) {
      const u = i / 14;
      pts.push(crown.clone().addScaledVector(dir, len * u).addScaledVector(up, 0.9 * Math.sin(u * Math.PI * 0.55) - 1.7 * u * u));
    }
    // the tip curls into a small spiral, forward, down and back under
    const tip = pts[pts.length - 1], r0 = 0.2, c = tip.clone().addScaledVector(up, -r0);
    for (let i = 1; i <= 9; i++) {
      const s = i / 9, th = Math.PI / 2 - s * Math.PI * 1.7, r = r0 * (1 - s * 0.72);
      pts.push(c.clone().addScaledVector(dir, Math.cos(th) * r).addScaledVector(up, Math.sin(th) * r));
    }
    // a ribbon folded along its midrib, its leaflets drooping to either side
    const pos: number[] = [], nor: number[] = [], part: number[] = [], us: number[] = [], xs: number[] = [], sw: number[] = [], idx: number[] = [];
    pts.forEach((p, i) => {
      const u = i / (pts.length - 1);
      const w = 0.44 * Math.pow(Math.sin(Math.min(1, u * 1.25) * Math.PI), 0.6) * (1 - u * 0.55) + 0.02;
      for (const x of [-1, 0, 1]) {
        const q = p.clone().addScaledVector(side, x * w).addScaledVector(up, x === 0 ? 0.05 : -w * 0.4);
        pos.push(q.x, q.y, q.z);
        nor.push(0, 1, 0);
        part.push(1);
        us.push(u);
        xs.push(x);
        sw.push(0.35 + u * 0.9);
      }
    });
    for (let i = 0; i < pts.length - 1; i++)
      for (let x = 0; x < 2; x++) {
        const a = i * 3 + x, b = a + 3;
        idx.push(a, b, a + 1, b, b + 1, a + 1);
      }
    parts.push(tagged(pos, nor, part, us, xs, sw, idx));
  }
  // seed-lights hanging under the crown
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2 + 0.4;
    const g = new THREE.SphereGeometry(0.09, 8, 6).translate(crown.x + Math.cos(a) * 0.17, crown.y - 0.28, crown.z + Math.sin(a) * 0.17);
    g.deleteAttribute("uv");
    const n = g.attributes.position.count;
    g.setAttribute("aPart", new THREE.Float32BufferAttribute(new Array(n).fill(2), 1));
    g.setAttribute("aU", new THREE.Float32BufferAttribute(new Array(n).fill(1), 1));
    g.setAttribute("aX", new THREE.Float32BufferAttribute(new Array(n).fill(0), 1));
    g.setAttribute("aSway", new THREE.Float32BufferAttribute(new Array(n).fill(0.3), 1));
    parts.push(g);
  }
  return mergeGeometries(parts)!;
}

function palmMaterial(uT: ReturnType<typeof uniform>): THREE.MeshBasicNodeMaterial {
  const m = new THREE.MeshBasicNodeMaterial({ side: THREE.DoubleSide, fog: false });
  const aSway = attribute("aSway", "float");
  // the wind: slow, and strongest at the fronds' tips (positionLocal here is the placed palm)
  const ph = positionLocal.x.mul(0.07).add(positionLocal.z.mul(0.05));
  m.positionNode = positionLocal.add(vec3(sin(uT.mul(0.9).add(ph)), 0, cos(uT.mul(0.7).add(ph.mul(1.3)))).mul(aSway).mul(0.14));
  m.colorNode = Fn(() => {
    const part = attribute("aPart", "float"), u = attribute("aU", "float"), x = attribute("aX", "float");
    const shade = normalWorld.y.abs().mul(0.3).add(0.7);
    // the trunk: rings of old growth, paler toward the crown
    const bands = smoothstep(0.55, 1, sin(u.mul(70)).mul(0.5).add(0.5));
    const trunk = mix(vec3(0.045, 0.038, 0.048), vec3(0.13, 0.11, 0.125), bands.mul(0.6).add(u.mul(0.3)));
    // the fronds: dark sea-green, paler along the midrib, with a thread of moonlight on it
    const frond = mix(vec3(0.012, 0.022, 0.03), vec3(0.04, 0.066, 0.08), float(1).sub(abs(x)).mul(0.7).add(0.15))
      .add(vec3(0.4, 0.5, 0.56).mul(smoothstep(0.2, 0, abs(x))).mul(0.09));
    const seed = vec3(1.0, 0.82, 0.52).mul(1.1);
    const c = mix(mix(trunk, frond, step(0.5, part)), seed, step(1.5, part)).mul(mix(shade, 1, step(1.5, part)));
    return vec4(withFog(c, positionWorld), 1);
  })();
  return m;
}

interface Palm {
  x: number;
  y: number;
  z: number;
  rot: number;
  scale: number;
  variant: number;
}

/* ---------------------------------------------------------------- caves */
/** A hollow of rock: a rough dome with its mouth open toward -x, the floor left to the ground. */
function caveGeometry(): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(1, 56, 22, 0.7, Math.PI * 2 - 1.4, 0, Math.PI / 2);
  const p = g.attributes.position as THREE.BufferAttribute;
  const v = new V();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const bump = (fbm(v.x * 2.2 + v.y * 1.3 + 5, v.z * 2.2 - v.y * 1.7) - 0.5) * 0.34 + (fbm(v.x * 6 + 1, v.z * 6 + v.y * 4) - 0.5) * 0.1;
    v.multiplyScalar(1 + bump);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

interface Cave {
  x: number;
  y: number;
  z: number;
  back: THREE.Vector3;
  hue: THREE.Color;
}

export class Wilds {
  group = new THREE.Group();
  private uT = uniform(0);
  private palmMeshes: THREE.InstancedMesh[] = [];
  private palms = new Map<string, Palm[]>();
  private cx = Infinity;
  private cz = Infinity;
  private caves: Cave[] = [];
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();

  constructor() {
    const mat = palmMaterial(this.uT);
    for (const lean of [0.9, 1.6]) {
      const mesh = new THREE.InstancedMesh(palmGeometry(lean), mat, MAX_PALMS);
      mesh.count = 0;
      mesh.frustumCulled = false;
      mesh.castShadow = true;
      this.palmMeshes.push(mesh);
      this.group.add(mesh);
    }
    this.buildCaves();
  }

  private palmsAt(i: number, j: number): Palm[] {
    const key = `${i},${j}`;
    const known = this.palms.get(key);
    if (known) return known;
    const out: Palm[] = [];
    const x0 = (i + 0.5) * PCELL, z0 = (j + 0.5) * PCELL;
    const h0 = heightAt(x0, z0);
    // on the sand, where the water is close
    if (h0 > WATER_Y + 0.15 && h0 < WATER_Y + 3.5 && groundKind(x0, z0, h0).sand > 0.3 && hash(i, j, 1) < 0.6) {
      let wet = false;
      for (let a = 0; a < 6.28 && !wet; a += 0.8) wet = heightAt(x0 + Math.cos(a) * 18, z0 + Math.sin(a) * 18) < WATER_Y - 0.3;
      const clear = Math.hypot(x0 - SPAWN.x, z0 - SPAWN.z) > 20 && LANDMARK_SITES.every(([lx, lz]) => Math.hypot(x0 - lx, z0 - lz) > 16);
      if (wet && clear) {
        const n = 1 + Math.floor(hash(i, j, 2) * 3);
        for (let k = 0; k < n; k++) {
          const x = (i + 0.15 + hash(i, j, 10 + k) * 0.7) * PCELL, z = (j + 0.15 + hash(i, j, 20 + k) * 0.7) * PCELL;
          const h = heightAt(x, z);
          if (h < WATER_Y + 0.1) continue;
          out.push({ x, y: h - 0.1, z, rot: hash(i, j, 30 + k) * Math.PI * 2, scale: 0.8 + hash(i, j, 40 + k) * 0.5, variant: hash(i, j, 50 + k) < 0.5 ? 0 : 1 });
        }
      }
    }
    this.palms.set(key, out);
    if (this.palms.size > 3000) this.palms.delete(this.palms.keys().next().value!);
    return out;
  }

  private buildCaves(): void {
    const geo = caveGeometry();
    // the drawings' gold lattice, faint and wide here: close around you it would read as a net
    const stone = etchedStone("#221e30", "#6e5a3c", 5.5);
    stone.side = THREE.DoubleSide;
    // wherever the rock would come between the camera and the wanderer, it thins away
    stone.maskNode = outOfTheWay(positionWorld).greaterThan(fract(sin(dot(screenCoordinate.xy, vec2(12.9898, 78.233))).mul(43758.5453)));
    const prism = prismGeometry();
    const nCrystals = 6;
    const aC = new THREE.InstancedBufferAttribute(new Float32Array(CAVE_SITES.length * nCrystals * 3), 3);
    prism.setAttribute("aC", aC);
    const crystals = new THREE.InstancedMesh(prism, crystalMaterial(), Math.max(1, CAVE_SITES.length * nCrystals));
    crystals.renderOrder = 2;
    const worms: number[] = [];
    const R = 7.5, H = 5.8;
    let ci = 0;
    CAVE_SITES.forEach((c, n) => {
      const cave = new THREE.Mesh(geo, stone);
      cave.position.set(c.x, c.y - 1.2, c.z);
      cave.scale.set(R, H, R);
      cave.rotation.y = Math.PI - c.face; // the mouth (local −x) opens downhill
      cave.castShadow = cave.receiveShadow = true;
      this.group.add(cave);
      // crystals at the back of the hollow
      const back = new V(c.x - Math.cos(c.face) * R * 0.5, 0, c.z - Math.sin(c.face) * R * 0.5);
      back.y = heightAt(back.x, back.z);
      const hue = new THREE.Color().setHSL((n * 0.29 + 0.55) % 1, 0.6, 0.65);
      for (let k = 0; k < nCrystals; k++) {
        const a = c.face + Math.PI + (k - (nCrystals - 1) / 2) * 0.32;
        const r = R * (0.55 + (k % 2) * 0.18);
        const x = c.x + Math.cos(a) * r, z = c.z + Math.sin(a) * r;
        const len = 1.1 + hash(n, k, 3) * 1.6;
        this.q.setFromAxisAngle(new V(Math.sin(a), 0, -Math.cos(a)), -0.3 + hash(n, k, 4) * 0.2);
        this.m.compose(new V(x, heightAt(x, z) - 0.1, z), this.q, new V(len * 0.5, len, len * 0.5));
        crystals.setMatrixAt(ci, this.m);
        aC.setXYZ(ci, (n * 0.29 + k * 0.05) % 1, 0.7, hash(n, k, 5));
        ci++;
      }
      // glow-worms on the ceiling
      for (let k = 0; k < 90; k++) {
        const phi = 0.9 + hash(n, k, 6) * (Math.PI * 2 - 1.8), th = 0.15 + hash(n, k, 7) * 1.2;
        const lx = -Math.cos(phi) * Math.sin(th) * R * 0.9, ly = Math.cos(th) * H * 0.9, lz = Math.sin(phi) * Math.sin(th) * R * 0.9;
        const ry = cave.rotation.y, wx = lx * Math.cos(ry) + lz * Math.sin(ry), wz = -lx * Math.sin(ry) + lz * Math.cos(ry);
        worms.push(c.x + wx, cave.position.y + ly, c.z + wz);
      }
      // its walls stop you, all but the mouth
      for (let a = 0; a < Math.PI * 2; a += 0.28) {
        const off = Math.atan2(Math.sin(a - c.face), Math.cos(a - c.face));
        if (Math.abs(off) < 0.75) continue;
        colliders.push({ x: c.x + Math.cos(a) * R * 0.95, z: c.z + Math.sin(a) * R * 0.95, r: 1.1, top: c.y + H - 1 });
      }
      this.caves.push({ x: c.x, y: c.y, z: c.z, back, hue });
    });
    crystals.count = ci;
    crystals.instanceMatrix.needsUpdate = true;
    crystals.computeBoundingSphere();
    this.group.add(crystals);
    if (worms.length) {
      const pts = worldPoints(new Float32Array(worms), { color: new THREE.Color(0.55, 0.95, 0.85), size: 0.07, opacity: 0.85 });
      this.group.add(pts.sprite);
    }
  }

  update(f: LifeFrame): void {
    this.uT.value = f.reduced ? f.t * 0.4 : f.t;
    const cx = Math.floor(f.player.x / PCELL), cz = Math.floor(f.player.z / PCELL);
    if (cx === this.cx && cz === this.cz) return;
    this.cx = cx;
    this.cz = cz;
    const counts = [0, 0];
    const s = new V();
    for (let i = -PRING; i <= PRING; i++)
      for (let j = -PRING; j <= PRING; j++)
        for (const p of this.palmsAt(cx + i, cz + j)) {
          const mesh = this.palmMeshes[p.variant];
          if (counts[p.variant] >= MAX_PALMS) continue;
          this.q.setFromAxisAngle(new V(0, 1, 0), p.rot);
          this.m.compose(new V(p.x, p.y, p.z), this.q, s.setScalar(p.scale));
          mesh.setMatrixAt(counts[p.variant]++, this.m);
        }
    this.palmMeshes.forEach((m, k) => {
      m.count = counts[k];
      m.instanceMatrix.needsUpdate = true;
    });
  }

  /** Each light this casts on the ground: the caves' crystals glow on the floor of the hollow. */
  lights(add: (x: number, z: number, r: number, c: THREE.Color, k: number) => void, player: THREE.Vector3): void {
    for (const c of this.caves) if (Math.hypot(c.x - player.x, c.z - player.z) < 120) add(c.back.x, c.back.z, 6, c.hue, 0.35);
  }
}
