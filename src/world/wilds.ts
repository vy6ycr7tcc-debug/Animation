/* The wilder places (Samuel: "caves, mountains with snow, palm trees, tall grass"):
   - Palms on the beaches, where the sand meets the water: real coconut palms (the owner: the old
     balloon fronds looked "odd" beside the realistic trees). A leaning, gently swollen trunk in
     grey-brown bark scarred with old leaf rings; a crown of feathery fronds, each a midrib with
     dozens of narrow leaflets drooping more toward its tip; a few dead fronds hanging brown
     against the trunk; a cluster of coconuts. Lit by the moon, they sway.
   - Caves in the steep hillsides (placed in terrain.ts): a hollow of etched stone running into
     the hill, crystals glowing at the back, glow-worm lights on the ceiling. The rock dissolves
     wherever it would hide the wanderer from the camera.
   (The tall grass grows in life.ts; the snowy mountains rise in terrain.ts.) */
import * as THREE from "three/webgpu";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { outOfTheWay, T, worldPoints } from "../gpu/tsl";
import { surface } from "./textures";
import { crystalMaterial, prismGeometry } from "./creation";
import { etchedStone } from "./etching";
import type { LifeFrame } from "./life";
import { CAVES, colliders, type Collider, fbm, groundKind, heightAt, keptClear, LANDMARK_SITES, SPAWN, WATER_Y } from "./terrain";

const { attribute, cos, dot, float, fract, Fn, If, mix, positionLocal, positionWorld, sin, smoothstep, abs, screenCoordinate, step, texture, uniform, vec2, vec3 } = T;
const V = THREE.Vector3;

function hash(i: number, j: number, salt: number): number {
  const s = Math.sin(i * 127.1 + j * 311.7 + salt * 74.7) * 43758.5453;
  return s - Math.floor(s);
}

/* ---------------------------------------------------------------- palms */
const PCELL = 16;
const PRING = 6; // ~100 m each way
const MAX_PALMS = 160;
const PALM_NEAR = 45; // (cells change every 16 m, so a near palm is at most ~60 m off)

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
      xs.push(k / sides);
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

/** One palm, about 6.5 m tall, leaning by `lean` metres at the crown. Parts (`aPart`): 0 trunk,
    1 green leaflet, 2 coconut, 3 midrib, 4 dead frond. `aU` runs along the trunk or the frond,
    `aX` around the trunk or out along a leaflet. */
export function palmGeometry(lean: number): THREE.BufferGeometry {
  const H = 6.4;
  const trunk = new THREE.CatmullRomCurve3([new V(0, -0.3, 0), new V(lean * 0.15, H * 0.3, 0), new V(lean * 0.62, H * 0.7, 0), new V(lean, H, 0)]);
  // a swollen foot, a slight bulge low, narrowing to the crown
  const parts = [tube(trunk, 30, 12, (u) => 0.17 * (1 - u * 0.32) + 0.16 * Math.max(0, 1 - u * 7) + 0.015 * Math.sin(u * 9), (u) => u * u * 0.3)];
  const crown = trunk.getPoint(1);
  const up = new V(0, 1, 0);
  // the crown's boot where the fronds spring from
  {
    const g = new THREE.SphereGeometry(0.24, 12, 8).scale(1, 1.35, 1).translate(crown.x, crown.y + 0.05, crown.z);
    parts.push(tagGeo(g, 0, 1, 0.5, 0.3));
  }
  const rnd = (k: number) => {
    const v = Math.sin(k * 91.7 + lean * 13.1) * 43758.5453;
    return v - Math.floor(v);
  };
  const fronds = 16;
  for (let k = 0; k < fronds; k++) {
    const dead = k >= 13; // the last few hang dead against the trunk
    const a = (k / 13) * Math.PI * 2 * 1.618 + rnd(k) * 0.4;
    const dir = new V(Math.cos(a), 0, Math.sin(a));
    const rise = dead ? -1 : k % 3 === 0 ? 0.55 : 0.2 + rnd(k + 3) * 0.3; // some reach up, most arch over
    const len = dead ? 1.9 : 2.8 + rnd(k + 7) * 0.8;
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 16; i++) {
      const u = i / 16;
      if (dead) pts.push(crown.clone().addScaledVector(dir, 0.45 * Math.sin(u * 1.5)).addScaledVector(up, -len * u - 0.1));
      else pts.push(crown.clone().addScaledVector(dir, len * u).addScaledVector(up, len * (rise * Math.sin(u * Math.PI * 0.5) * 0.9 - 0.42 * u * u)));
    }
    const rach = new THREE.CatmullRomCurve3(pts);
    parts.push(retag(tube(rach, 14, 4, (u) => 0.032 * (1 - u * 0.75), (u) => 0.3 + u * 0.9), dead ? 4 : 3));
    // the leaflets: narrow blades either side of the midrib, longest at the middle, drooping more
    // toward the tip; a dead frond's hang folded close
    const pos: number[] = [], nor: number[] = [], part: number[] = [], us: number[] = [], xs: number[] = [], sw: number[] = [], idx: number[] = [];
    const N = dead ? 20 : 34;
    const p = new V(), t = new V(), side = new V(), d = new V(), wv = new V(), n = new V();
    for (let i = 1; i <= N; i++) {
      const u = 0.06 + (i / N) * 0.92;
      rach.getPoint(u, p);
      rach.getTangent(u, t);
      side.crossVectors(t, up);
      if (side.lengthSq() < 1e-4) side.set(-dir.z, 0, dir.x);
      side.normalize();
      for (const sgn of [-1, 1]) {
        const j = rnd(k * 97 + i * 7 + (sgn > 0 ? 1 : 0));
        const droop = dead ? 1.35 : 0.25 + u * 0.85 + (j - 0.5) * 0.35;
        d.copy(side).multiplyScalar(sgn * Math.cos(droop)).addScaledVector(up, -Math.sin(droop)).addScaledVector(t, 0.45).normalize();
        const L = (dead ? 0.55 : 0.95) * Math.sin(Math.PI * (0.12 + u * 0.8)) * (0.85 + j * 0.3);
        const W = dead ? 0.04 : 0.055;
        wv.crossVectors(d, side).normalize();
        if (wv.y < 0) wv.negate();
        n.copy(wv);
        // a blade: wide at its root, narrowing to a point, bowed a little along its length
        const base = pos.length / 3;
        const seg = 3;
        for (let q = 0; q <= seg; q++) {
          const f = q / seg, w = W * (1 - f * 0.85);
          const c = p.clone().addScaledVector(d, L * f).addScaledVector(up, -0.06 * Math.sin(f * Math.PI) * L);
          for (const e of [-1, 1]) {
            const v = c.clone().addScaledVector(t, e * w);
            pos.push(v.x, v.y, v.z);
            nor.push(n.x, n.y, n.z);
            part.push(dead ? 4 : 1);
            us.push(u);
            xs.push(f);
            sw.push(0.3 + u * 0.9 + f * 0.25);
          }
        }
        for (let q = 0; q < seg; q++) {
          const a0 = base + q * 2;
          idx.push(a0, a0 + 2, a0 + 1, a0 + 1, a0 + 2, a0 + 3);
        }
      }
    }
    parts.push(tagged(pos, nor, part, us, xs, sw, idx));
  }
  // coconuts clustered under the crown
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2 + 0.4, r = 0.2 + (k % 2) * 0.06;
    const g = new THREE.SphereGeometry(0.12, 10, 8).scale(1, 1.12, 1).translate(crown.x + Math.cos(a) * r, crown.y - 0.3 - (k % 3) * 0.08, crown.z + Math.sin(a) * r);
    parts.push(tagGeo(g, 2, 1, 0, 0.3));
  }
  return mergeGeometries(parts)!;
}

/** The same palm drawn cheaply, for groves seen from afar (a few hundred triangles): a plain trunk
    and a dozen fronds, each one broad blade arching out and down. Tagged as `palmGeometry` is. */
export function palmFarGeometry(lean: number): THREE.BufferGeometry {
  const H = 6.4;
  const trunk = new THREE.CatmullRomCurve3([new V(0, -0.3, 0), new V(lean * 0.15, H * 0.3, 0), new V(lean * 0.62, H * 0.7, 0), new V(lean, H, 0)]);
  const parts = [tube(trunk, 6, 5, (u) => 0.19 * (1 - u * 0.32) + 0.1 * Math.max(0, 1 - u * 5), (u) => u * u * 0.3)];
  const crown = trunk.getPoint(1);
  const up = new V(0, 1, 0);
  const pos: number[] = [], nor: number[] = [], part: number[] = [], us: number[] = [], xs: number[] = [], sw: number[] = [], idx: number[] = [];
  for (let k = 0; k < 12; k++) {
    const a = k * 2.39996 + lean;
    const dir = new V(Math.cos(a), 0, Math.sin(a)), side = new V(-dir.z, 0, dir.x);
    const rise = k % 3 === 0 ? 0.6 : 0.25, len = 3 + (k % 4) * 0.2;
    const base = pos.length / 3;
    const seg = 5;
    for (let q = 0; q <= seg; q++) {
      const u = q / seg, w = 0.62 * Math.sin(Math.PI * (0.1 + u * 0.85));
      const c = crown.clone().addScaledVector(dir, len * u).addScaledVector(up, len * (rise * Math.sin(u * Math.PI * 0.5) * 0.9 - 0.45 * u * u));
      for (const e of [-1, 1]) {
        const v = c.clone().addScaledVector(side, e * w).addScaledVector(up, -0.12 * u);
        pos.push(v.x, v.y, v.z);
        nor.push(0, 1, 0);
        part.push(1);
        us.push(u);
        xs.push(0.5);
        sw.push(0.3 + u * 0.9);
      }
    }
    for (let q = 0; q < seg; q++) {
      const a0 = base + q * 2;
      idx.push(a0, a0 + 2, a0 + 1, a0 + 1, a0 + 2, a0 + 3);
    }
  }
  parts.push(tagged(pos, nor, part, us, xs, sw, idx));
  return mergeGeometries(parts)!;
}

/** Tag a plain geometry for the palm's shader. */
function tagGeo(g: THREE.BufferGeometry, part: number, u: number, x: number, sway: number): THREE.BufferGeometry {
  g.deleteAttribute("uv");
  const n = g.attributes.position.count;
  g.setAttribute("aPart", new THREE.Float32BufferAttribute(new Array(n).fill(part), 1));
  g.setAttribute("aU", new THREE.Float32BufferAttribute(new Array(n).fill(u), 1));
  g.setAttribute("aX", new THREE.Float32BufferAttribute(new Array(n).fill(x), 1));
  g.setAttribute("aSway", new THREE.Float32BufferAttribute(new Array(n).fill(sway), 1));
  return g;
}
/** A tube made for the trunk, tagged as another part. */
function retag(g: THREE.BufferGeometry, part: number): THREE.BufferGeometry {
  const a = g.getAttribute("aPart") as THREE.BufferAttribute;
  for (let i = 0; i < a.count; i++) a.setX(i, part);
  return g;
}

export function palmMaterial(uT: ReturnType<typeof uniform>): THREE.MeshStandardNodeMaterial {
  const bark = surface("bark");
  const m = new THREE.MeshStandardNodeMaterial({ side: THREE.DoubleSide, roughness: 0.85, metalness: 0 });
  const aSway = attribute("aSway", "float");
  // the wind: slow, and strongest at the fronds' tips (positionLocal here is the placed palm);
  // the leaflets flutter a little on their own
  const ph = positionLocal.x.mul(0.07).add(positionLocal.z.mul(0.05));
  const flutter = sin(uT.mul(3.1).add(attribute("aU", "float").mul(23)).add(ph)).mul(attribute("aX", "float")).mul(0.035);
  m.positionNode = positionLocal.add(vec3(sin(uT.mul(0.9).add(ph)), 0, cos(uT.mul(0.7).add(ph.mul(1.3)))).mul(aSway).mul(0.14)).add(vec3(0, flutter, 0));
  const part = attribute("aPart", "float"), u = attribute("aU", "float"), x = attribute("aX", "float");
  m.colorNode = Fn(() => {
    // the trunk: grey-brown bark, scarred in rings where old fronds fell, darker at the foot
    const bk = texture(bark.diff, vec2(x.mul(3), u.mul(16))).rgb;
    const ring = smoothstep(0.1, 0.0, abs(fract(u.mul(40)).sub(0.5)).sub(0.38));
    const trunk = bk.mul(vec3(0.62, 0.55, 0.48)).mul(float(1).sub(ring.mul(0.5))).mul(mix(0.7, 1, smoothstep(0, 0.15, u)));
    // the leaflets: deep green, yellower toward their tips and on the older outer fronds
    const h = fract(sin(positionWorld.x.mul(12.9).add(positionWorld.z.mul(78.2))).mul(43758.5));
    const leaf = mix(vec3(0.03, 0.068, 0.028), vec3(0.1, 0.15, 0.05), x.mul(0.6).add(u.mul(0.3)).add(h.mul(0.15)));
    const rib = vec3(0.24, 0.23, 0.13);
    const nut = vec3(0.16, 0.12, 0.06);
    const dead = vec3(0.3, 0.22, 0.12).mul(h.mul(0.3).add(0.8));
    const c = trunk.toVar();
    If(part.greaterThan(0.5), () => {
      c.assign(leaf);
    });
    If(part.greaterThan(1.5), () => {
      c.assign(nut);
    });
    If(part.greaterThan(2.5), () => {
      c.assign(rib);
    });
    If(part.greaterThan(3.5), () => {
      c.assign(dead);
    });
    return c;
  })();
  // the leaflets let a little of the moon through, and the glossy upper side catches it
  m.roughnessNode = mix(float(0.88), float(0.62), step(0.5, part).mul(step(part, 1.5)));
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

/** A rough fallen block: a sphere broken into facets and weathered. */
function boulderGeometry(): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(1, 2);
  const p = g.attributes.position as THREE.BufferAttribute;
  const v = new V();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const f = 1 + (fbm(v.x * 1.6 + 3, v.z * 1.6 + v.y * 1.1) - 0.5) * 0.55 + (fbm(v.x * 4 - 2, v.y * 4 + v.z) - 0.5) * 0.14;
    v.multiplyScalar(f);
    v.y = Math.max(v.y, -0.55); // a flatter foot, settled
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
  // beyond ~45 m each palm is its cheap likeness (~230 triangles, was ~10k), casting no shadow
  private palmFar: THREE.InstancedMesh[] = [];
  private palms = new Map<string, Palm[]>();
  private palmSolid: Collider[] = [];
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
      const far = new THREE.InstancedMesh(palmFarGeometry(lean), mat, MAX_PALMS);
      far.count = 0;
      far.frustumCulled = false;
      this.palmFar.push(far);
      this.group.add(far);
    }
    this.buildCaves();
  }

  /** The palm nearest (x, z) within ~600 m (for still frames). */
  nearestPalm(x: number, z: number): { x: number; y: number; z: number } | null {
    const ci = Math.floor(x / PCELL), cj = Math.floor(z / PCELL);
    let best: Palm | null = null, bd = Infinity;
    for (let r = 0; r <= 38 && !best; r++)
      for (let i = -r; i <= r; i++)
        for (let j = -r; j <= r; j++) {
          if (Math.max(Math.abs(i), Math.abs(j)) !== r) continue;
          for (const p of this.palmsAt(ci + i, cj + j)) {
            const d = Math.hypot(p.x - x, p.z - z);
            if (d < bd) (bd = d), (best = p);
          }
        }
    return best;
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
      const clear = Math.hypot(x0 - SPAWN.x, z0 - SPAWN.z) > 20 && LANDMARK_SITES.every(([lx, lz]) => Math.hypot(x0 - lx, z0 - lz) > 16) && !keptClear(x0, z0, 4);
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
    const stone = etchedStone("#4a4037", "#6e5a3c", 5.5); // a warm dark rock, the scan's own grain
    stone.side = THREE.DoubleSide;
    // wherever the rock would come between the camera and the wanderer, it thins away
    stone.maskNode = outOfTheWay(positionWorld).greaterThan(fract(sin(dot(screenCoordinate.xy, vec2(12.9898, 78.233))).mul(43758.5453)));
    const prism = prismGeometry();
    const nCrystals = 6;
    const aC = new THREE.InstancedBufferAttribute(new Float32Array(CAVES.length * nCrystals * 3), 3);
    prism.setAttribute("aC", aC);
    const crystals = new THREE.InstancedMesh(prism, crystalMaterial(), Math.max(1, CAVES.length * nCrystals));
    // boulders fallen about each mouth, in the same rock (the hillside broke to open it)
    const BOULDERS = 6;
    const boulders = new THREE.InstancedMesh(boulderGeometry(), stone, Math.max(1, CAVES.length * BOULDERS));
    boulders.castShadow = boulders.receiveShadow = true;
    let bi = 0;
    crystals.renderOrder = 2;
    const worms: number[] = [];
    let ci = 0;
    CAVES.forEach((c, n) => {
      // each hollow its own size (the first kept theirs)
      const R = n < 7 ? 7.5 : 5.8 + hash(n, 0, 21) * 3.4, H = R * (n < 7 ? 5.8 / 7.5 : 0.7 + hash(n, 0, 22) * 0.18);
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
        colliders.push({ x, z, r: 0.3 * len, top: heightAt(x, z) + len * 0.8 }); // the crystals at the back stand solid
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
      for (let k = 0; k < BOULDERS; k++) {
        // two flanking the mouth, the rest strewn down the slope before it
        const side = k < 2 ? (k === 0 ? 1 : -1) : hash(n, k, 30) - 0.5;
        const a = c.face + (k < 2 ? side * (0.85 + hash(n, k, 31) * 0.2) : side * 1.2);
        const d = k < 2 ? R * (0.98 + hash(n, k, 32) * 0.12) : R * (1.15 + hash(n, k, 33) * 0.9);
        const x = c.x + Math.cos(a) * d, z = c.z + Math.sin(a) * d;
        const s = k < 2 ? 1.2 + hash(n, k, 34) * 0.8 : 0.45 + hash(n, k, 35) * 0.9;
        const y = heightAt(x, z);
        this.q.setFromEuler(new THREE.Euler((hash(n, k, 36) - 0.5) * 0.6, hash(n, k, 37) * 6.28, (hash(n, k, 38) - 0.5) * 0.6));
        this.m.compose(new V(x, y - s * 0.3, z), this.q, new V(s * (0.9 + hash(n, k, 39) * 0.5), s * (0.65 + hash(n, k, 40) * 0.3), s));
        boulders.setMatrixAt(bi++, this.m);
        if (s > 0.8) colliders.push({ x, z, r: s * 0.85, top: y + s * 0.6 });
      }
      this.caves.push({ x: c.x, y: c.y, z: c.z, back, hue });
    });
    boulders.count = bi;
    boulders.instanceMatrix.needsUpdate = true;
    boulders.computeBoundingSphere();
    this.group.add(boulders);
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
    const counts = [0, 0], farCounts = [0, 0];
    const s = new V();
    // the palms near you stand solid at their foot (they had no colliders)
    for (const c of this.palmSolid) {
      const k = colliders.indexOf(c);
      if (k >= 0) colliders.splice(k, 1);
    }
    this.palmSolid.length = 0;
    for (let i = -PRING; i <= PRING; i++)
      for (let j = -PRING; j <= PRING; j++)
        for (const p of this.palmsAt(cx + i, cz + j)) {
          const near = Math.hypot(p.x - f.player.x, p.z - f.player.z) < PALM_NEAR;
          const mesh = (near ? this.palmMeshes : this.palmFar)[p.variant];
          const cnt = near ? counts : farCounts;
          if (cnt[p.variant] >= MAX_PALMS) continue;
          this.q.setFromAxisAngle(new V(0, 1, 0), p.rot);
          this.m.compose(new V(p.x, p.y, p.z), this.q, s.setScalar(p.scale));
          mesh.setMatrixAt(cnt[p.variant]++, this.m);
          if (near) this.palmSolid.push({ x: p.x, z: p.z, r: 0.3 * p.scale, top: p.y + 5 * p.scale });
        }
    colliders.push(...this.palmSolid);
    this.palmMeshes.forEach((m, k) => {
      m.count = counts[k];
      m.instanceMatrix.needsUpdate = true;
    });
    this.palmFar.forEach((m, k) => {
      m.count = farCounts[k];
      m.instanceMatrix.needsUpdate = true;
    });
  }

  /** Each light this casts on the ground: the caves' crystals glow on the floor of the hollow. */
  lights(add: (x: number, z: number, r: number, c: THREE.Color, k: number) => void, player: THREE.Vector3): void {
    for (const c of this.caves) if (Math.hypot(c.x - player.x, c.z - player.z) < 120) add(c.back.x, c.back.z, 6, c.hue, 0.35);
  }
}
