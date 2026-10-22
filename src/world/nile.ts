/* The Nile (the owner: "we prob need a Nile desert type of scene for the pyramid, and move there"):
   the river runs north–south through the ochre dunes of the west, under the sunset sky, and the
   pyramid stands on the desert's edge above its floodplain (terrain.ts NILE, PYRAMID, nileLand).
   This is what lives along it:
   - date palms: groves on the green floodplain and a line along the banks, the world's own palm
     (wilds.ts) near you, a cheap likeness of it farther off so the green strip reads from the
     pyramid's plaza;
   - papyrus: stands of tall stems in the shallows of both banks, each topped by its burst of
     fine rays, swaying;
   - two feluccas: open wooden boats under a lateen sail, drifting up and down the river.
   Nothing here is lit or glowing: the sunset does the work. */
import * as THREE from "three/webgpu";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { instanceSeed, T } from "../gpu/tsl";
import type { LifeFrame } from "./life";
import { palmFarGeometry, palmGeometry, palmMaterial } from "./wilds";
import { colliders, type Collider, heightAt, keptClear, NILE, NILE_REACH, nileCourse, nileDist, vnoise, WATER_Y } from "./terrain";

const V = THREE.Vector3;
const { attribute, float, mix, positionLocal, sin, cos, smoothstep, uniform, vec3, vec4, Fn } = T;

/** A stable random in 0..1 for an integer pair and a salt. */
function hash(i: number, j: number, s: number): number {
  const v = Math.sin(i * 127.1 + j * 311.7 + s * 74.7) * 43758.5453;
  return v - Math.floor(v);
}

interface Palm {
  x: number;
  y: number;
  z: number;
  rot: number;
  scale: number;
  variant: number;
}

const NEAR_R = 230; // palms drawn whole within this
const REED_R = 170;

/* ---------------------------------------------------------------- papyrus */
/** One stand of papyrus: twelve stems (three-sided, tapering, leaning out a little), each crowned by
    a burst of fine rays arching out and down. `aH` is the height along the stem (0 foot … 1 crown),
    `aKind` 0 stem, 1 ray. */
function papyrusGeometry(seed: number): THREE.BufferGeometry {
  const pos: number[] = [], nor: number[] = [], hh: number[] = [], kind: number[] = [], idx: number[] = [];
  const rnd = (k: number) => hash(k, seed, 9);
  const up = new V(0, 1, 0);
  const push = (p: THREE.Vector3, n: THREE.Vector3, h: number, k: number) => {
    pos.push(p.x, p.y, p.z);
    nor.push(n.x, n.y, n.z);
    hh.push(h);
    kind.push(k);
  };
  for (let s = 0; s < 12; s++) {
    const a = rnd(s) * Math.PI * 2, r0 = rnd(s + 20) * 0.45;
    const foot = new V(Math.cos(a) * r0, -0.4, Math.sin(a) * r0);
    const H = 1.7 + rnd(s + 40) * 1.4;
    const lean = new V(Math.cos(a), 0, Math.sin(a)).multiplyScalar(0.12 + rnd(s + 60) * 0.25);
    const top = foot.clone().add(new V(lean.x * H, H, lean.z * H));
    // the stem: a three-sided prism in four lengths, narrowing up
    const base = pos.length / 3;
    const segs = 4;
    for (let q = 0; q <= segs; q++) {
      const f = q / segs, c = foot.clone().lerp(top, f), w = 0.022 * (1 - f * 0.55);
      for (let e = 0; e <= 3; e++) {
        const ang = (e / 3) * Math.PI * 2;
        const n = new V(Math.cos(ang), 0, Math.sin(ang));
        push(c.clone().addScaledVector(n, w), n, f * H / 3, 0);
      }
    }
    for (let q = 0; q < segs; q++)
      for (let e = 0; e < 3; e++) {
        const a0 = base + q * 4 + e, b0 = a0 + 4;
        idx.push(a0, b0, a0 + 1, b0, b0 + 1, a0 + 1);
      }
    // the umbel: fine rays from the crown, every way, arching over
    const rays = 26;
    for (let k = 0; k < rays; k++) {
      const az = (k / rays) * Math.PI * 2 + rnd(s * 31 + k) * 0.3;
      const el = 0.15 + rnd(s * 17 + k) * 1.1; // up from the horizontal
      const d = new V(Math.cos(az) * Math.cos(el), Math.sin(el), Math.sin(az) * Math.cos(el));
      const side = new V().crossVectors(d, up).normalize();
      const L = 0.5 + rnd(s * 13 + k) * 0.28;
      const b = pos.length / 3;
      for (let q = 0; q <= 2; q++) {
        const f = q / 2;
        const c = top.clone().addScaledVector(d, L * f).addScaledVector(up, -0.3 * f * f);
        const w = 0.017 * (1 - f * 0.6);
        for (const e of [-1, 1]) push(c.clone().addScaledVector(side, e * w), up, H / 3 + f * 0.1, 1);
      }
      for (let q = 0; q < 2; q++) {
        const a0 = b + q * 2;
        idx.push(a0, a0 + 2, a0 + 1, a0 + 1, a0 + 2, a0 + 3);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute("aH", new THREE.Float32BufferAttribute(hh, 1));
  g.setAttribute("aKind", new THREE.Float32BufferAttribute(kind, 1));
  g.setIndex(idx);
  return g;
}

function papyrusMaterial(uT: ReturnType<typeof uniform>): THREE.MeshStandardNodeMaterial {
  const m = new THREE.MeshStandardNodeMaterial({ side: THREE.DoubleSide, roughness: 0.8, metalness: 0 });
  const h = attribute("aH", "float"), kind = attribute("aKind", "float");
  // the wind: each stand on its own time, strongest at the crowns
  const ph = instanceSeed().mul(6.28);
  const bend = h.mul(h);
  m.positionNode = positionLocal.add(vec3(sin(uT.mul(1.1).add(ph)), 0, cos(uT.mul(0.83).add(ph.mul(1.7)))).mul(bend).mul(0.16));
  m.colorNode = Fn(() => {
    const stem = mix(vec3(0.05, 0.075, 0.03), vec3(0.13, 0.17, 0.06), smoothstep(0, 1, h));
    const ray = mix(vec3(0.12, 0.16, 0.05), vec3(0.24, 0.26, 0.1), instanceSeed());
    return vec4(mix(stem, ray, kind), 1);
  })();
  return m;
}

/* ---------------------------------------------------------------- the felucca */
/** An open wooden hull ~7.5 m long (bow toward +x), a mast, a long yard and its lateen sail. */
function feluccaGeometry(): { wood: THREE.BufferGeometry; sail: THREE.BufferGeometry } {
  const L = 7.5, sections = 14, ring = 8;
  const pos: number[] = [], idx: number[] = [], col: number[] = [];
  for (let i = 0; i <= sections; i++) {
    const s = i / sections, x = (s - 0.5) * L;
    const w = 1.05 * Math.pow(Math.sin(Math.PI * s), 0.55) + 0.02;
    const depth = 0.62 * Math.pow(Math.sin(Math.PI * s), 0.4) + 0.05;
    const sheer = 0.75 + 0.55 * Math.pow(Math.abs(s - 0.5) * 2, 2.2); // ends rise
    for (let k = 0; k <= ring; k++) {
      const a = (k / ring) * Math.PI; // round the hull from one gunwale to the other
      pos.push(x, sheer - depth * Math.sin(a), Math.cos(a) * w);
      const band = k === 0 || k === ring ? 1 : 0; // a pale band along the gunwale
      col.push(band ? 0.55 : 0.2, band ? 0.47 : 0.13, band ? 0.36 : 0.08);
    }
  }
  for (let i = 0; i < sections; i++)
    for (let k = 0; k < ring; k++) {
      const a = i * (ring + 1) + k, b = a + ring + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  const hull = new THREE.BufferGeometry();
  hull.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  hull.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  hull.setIndex(idx);
  hull.computeVertexNormals();
  const wood = (g: THREE.BufferGeometry, c: [number, number, number]) => {
    g.deleteAttribute("uv");
    const n = g.attributes.position.count;
    g.setAttribute("color", new THREE.Float32BufferAttribute(Array.from({ length: n * 3 }, (_, i) => c[i % 3]), 3));
    return g;
  };
  // the mast, raked a little forward; the yard slung across it, low at the bow and high aft
  const mast = wood(new THREE.CylinderGeometry(0.05, 0.075, 6.1, 6), [0.24, 0.17, 0.1]).rotateZ(-0.04).translate(1.32, 3.35, 0);
  const yLow = new V(3.9, 1.35, 0.05), yHigh = new V(-3.3, 8.1, 0.05);
  const yard = wood(new THREE.CylinderGeometry(0.035, 0.05, yLow.distanceTo(yHigh), 5), [0.26, 0.19, 0.11]);
  yard.rotateZ(Math.atan2(yHigh.x - yLow.x, yHigh.y - yLow.y) * -1);
  yard.translate(...yLow.clone().lerp(yHigh, 0.5).toArray());
  const woodG = mergeGeometries([hull.toNonIndexed(), mast.toNonIndexed(), yard.toNonIndexed()])!;
  woodG.computeVertexNormals();
  // the sail: the triangle from the yard's two ends down to the clew, aft and low; bellied
  const clew = new V(-3.0, 1.15, 0.05);
  const sp: number[] = [], si: number[] = [], suv: number[] = [];
  const N = 8;
  const rowStart: number[] = [];
  for (let i = 0; i <= N; i++) {
    rowStart.push(sp.length / 3);
    for (let j = 0; j <= N - i; j++) {
      const a = i / N, b = j / N, c = 1 - a - b; // barycentric over (yLow, yHigh, clew)
      const p = new V().addScaledVector(yLow, c).addScaledVector(yHigh, a).addScaledVector(clew, b);
      const belly = 27 * a * b * c; // 1 at the middle, 0 along every edge
      p.z += 0.75 * belly;
      sp.push(p.x, p.y, p.z);
      suv.push(a, b);
    }
  }
  for (let i = 0; i < N; i++)
    for (let j = 0; j < N - i; j++) {
      const a0 = rowStart[i] + j, a1 = a0 + 1, b0 = rowStart[i + 1] + j;
      si.push(a0, b0, a1);
      if (j < N - i - 1) si.push(a1, b0, b0 + 1);
    }
  const sail = new THREE.BufferGeometry();
  sail.setAttribute("position", new THREE.Float32BufferAttribute(sp, 3));
  sail.setAttribute("uv", new THREE.Float32BufferAttribute(suv, 2));
  sail.setIndex(si);
  sail.computeVertexNormals();
  return { wood: woodG, sail };
}

interface Boat {
  root: THREE.Group;
  phase: number;
  side: number;
  yaw: number;
}

export class Nile {
  group = new THREE.Group();
  private uT = uniform(0);
  private palms: Palm[] = [];
  private reeds: { x: number; y: number; z: number; rot: number; s: number; v: number }[] = [];
  private near: THREE.InstancedMesh[] = [];
  private far: THREE.InstancedMesh;
  private reedMeshes: THREE.InstancedMesh[] = [];
  private boats: Boat[] = [];
  private solid: Collider[] = [];
  private at = new V(Infinity, 0, Infinity);
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private s = new V();
  private p = new V();
  private yAxis = new V(0, 1, 0);

  constructor(phone: boolean) {
    this.place();
    const pm = palmMaterial(this.uT);
    const nearMax = phone ? 70 : 120;
    for (const lean of [0.25, 0.7]) {
      const mesh = new THREE.InstancedMesh(palmGeometry(lean), pm, nearMax);
      mesh.count = 0;
      mesh.frustumCulled = false;
      mesh.castShadow = true;
      this.near.push(mesh);
      this.group.add(mesh);
    }
    this.far = new THREE.InstancedMesh(palmFarGeometry(0.4), pm, this.palms.length);
    this.far.count = 0;
    this.far.frustumCulled = false;
    this.group.add(this.far);
    const rm = papyrusMaterial(this.uT);
    for (let v = 0; v < 3; v++) {
      const mesh = new THREE.InstancedMesh(papyrusGeometry(v + 1), rm, phone ? 110 : 200);
      mesh.count = 0;
      mesh.frustumCulled = false;
      this.reedMeshes.push(mesh);
      this.group.add(mesh);
    }
    // the feluccas
    const { wood, sail } = feluccaGeometry();
    const woodM = new THREE.MeshStandardNodeMaterial({ vertexColors: true, roughness: 0.85, metalness: 0, side: THREE.DoubleSide });
    const sailM = new THREE.MeshStandardNodeMaterial({ roughness: 0.95, metalness: 0, side: THREE.DoubleSide });
    // weathered cotton: pale, darker toward the foot and in the seams of its cloths
    sailM.colorNode = Fn(() => {
      const uv = T.uv();
      const seam = smoothstep(0.86, 1, cos(uv.y.mul(48)).mul(0.5).add(0.5)).mul(0.12);
      return vec4(vec3(0.72, 0.66, 0.55).mul(mix(float(0.82), float(1), uv.x)).mul(float(1).sub(seam)), 1);
    })();
    for (let i = 0; i < 2; i++) {
      const root = new THREE.Group();
      const w = new THREE.Mesh(wood, woodM), sl = new THREE.Mesh(sail, sailM);
      w.castShadow = sl.castShadow = true;
      root.add(w, sl);
      this.group.add(root);
      this.boats.push({ root, phase: i * 2.6 + 0.8, side: i ? -5 : 4, yaw: 0 });
    }
  }

  /** Where the palms and the papyrus grow: worked out once, from the land. */
  private place(): void {
    const step = 10;
    for (let lx = -380; lx <= 420; lx += step)
      for (let lz = -NILE_REACH + 20; lz <= NILE_REACH - 20; lz += step) {
        const i = Math.round(lx / step), j = Math.round(lz / step);
        const x = NILE.x + lx + (hash(i, j, 1) - 0.5) * step * 0.9, z = NILE.z + lz + (hash(i, j, 2) - 0.5) * step * 0.9;
        const d = nileDist(x, z);
        if (!isFinite(d) || d < 24 || d > 150) continue;
        const h = heightAt(x, z);
        if (h < WATER_Y + 0.3 || h > 3) continue;
        if (Math.abs(heightAt(x + 2, z) - heightAt(x - 2, z)) > 1.2 || Math.abs(heightAt(x, z + 2) - heightAt(x, z - 2)) > 1.2) continue;
        if (keptClear(x, z, 6)) continue;
        const grove = vnoise(x * 0.011 + 7, z * 0.011 - 3);
        const bank = d < 40;
        const p = bank ? 0.45 : grove > 0.52 ? 0.85 : grove > 0.42 ? 0.3 : 0.05;
        if (hash(i, j, 3) > p) continue;
        this.palms.push({ x, y: h - 0.1, z, rot: hash(i, j, 4) * Math.PI * 2, scale: 0.85 + hash(i, j, 5) * 0.45, variant: hash(i, j, 6) < 0.6 ? 0 : 1 });
      }
    // papyrus in the shallows of both banks, in stands with gaps between
    let k = 0;
    for (let z = NILE.z - NILE_REACH + 40; z <= NILE.z + NILE_REACH - 40; z += 2)
      for (const side of [-1, 1]) {
        k++;
        const cx = nileCourse(z);
        const off = 19 + hash(k, 0, 7) * 6;
        const x = cx + side * off, zz = z + (hash(k, 0, 8) - 0.5) * 1.6;
        if (vnoise(x * 0.03 + side * 11, zz * 0.03) < 0.36) continue;
        const h = heightAt(x, zz);
        if (h < WATER_Y - 0.9 || h > WATER_Y + 0.9) continue;
        if (keptClear(x, zz, 2)) continue;
        this.reeds.push({ x, y: h, z: zz, rot: hash(k, 1, 9) * 6.28, s: 0.8 + hash(k, 2, 9) * 0.45, v: Math.floor(hash(k, 3, 9) * 3) });
      }
  }

  /** The palm nearest a point (for still frames). */
  nearestPalm(x: number, z: number): Palm | null {
    let best: Palm | null = null, bd = Infinity;
    for (const p of this.palms) {
      const d = Math.hypot(p.x - x, p.z - z);
      if (d < bd) (bd = d), (best = p);
    }
    return best;
  }

  get counts(): { palms: number; reeds: number } {
    return { palms: this.palms.length, reeds: this.reeds.length };
  }

  update(f: LifeFrame): void {
    const pl = f.player;
    const away = Math.hypot(pl.x - NILE.x, pl.z - NILE.z);
    this.group.visible = away < 2800 && pl.x < 20000;
    if (!this.group.visible) {
      this.clearSolid();
      this.at.set(Infinity, 0, Infinity);
      return;
    }
    const t = f.reduced ? f.t * 0.4 : f.t;
    this.uT.value = t;
    this.sail(t);
    if (Math.hypot(pl.x - this.at.x, pl.z - this.at.z) < 12) return;
    this.at.copy(pl);
    this.refill(pl);
  }

  private clearSolid(): void {
    for (const c of this.solid) {
      const k = colliders.indexOf(c);
      if (k >= 0) colliders.splice(k, 1);
    }
    this.solid.length = 0;
  }

  private refill(pl: THREE.Vector3): void {
    this.clearSolid();
    const nc = [0, 0];
    let fc = 0;
    for (const p of this.palms) {
      const d = Math.hypot(p.x - pl.x, p.z - pl.z);
      this.q.setFromAxisAngle(this.yAxis, p.rot);
      this.m.compose(this.p.set(p.x, p.y, p.z), this.q, this.s.setScalar(p.scale));
      const mesh = this.near[p.variant];
      if (d < NEAR_R && nc[p.variant] < mesh.instanceMatrix.count) mesh.setMatrixAt(nc[p.variant]++, this.m);
      else this.far.setMatrixAt(fc++, this.m);
      if (d < 70) this.solid.push({ x: p.x, z: p.z, r: 0.3 * p.scale, top: p.y + 5 * p.scale });
    }
    colliders.push(...this.solid);
    this.near.forEach((m, k) => {
      m.count = nc[k];
      m.instanceMatrix.needsUpdate = true;
    });
    this.far.count = fc;
    this.far.instanceMatrix.needsUpdate = true;
    const rc = [0, 0, 0];
    for (const r of this.reeds) {
      if (Math.hypot(r.x - pl.x, r.z - pl.z) > REED_R) continue;
      const mesh = this.reedMeshes[r.v];
      if (rc[r.v] >= mesh.instanceMatrix.count) continue;
      this.q.setFromAxisAngle(this.yAxis, r.rot);
      this.m.compose(this.p.set(r.x, r.y, r.z), this.q, this.s.setScalar(r.s));
      mesh.setMatrixAt(rc[r.v]++, this.m);
    }
    this.reedMeshes.forEach((m, k) => {
      m.count = rc[k];
      m.instanceMatrix.needsUpdate = true;
    });
  }

  /** The boats drift up and down the river, slowing and coming about at its ends. */
  private sail(t: number): void {
    const A = NILE_REACH - 90, w = 1.5 / A;
    for (const b of this.boats) {
      const s = Math.sin(t * w + b.phase), v = Math.cos(t * w + b.phase);
      const z = NILE.z + A * s;
      const x = nileCourse(z) + b.side;
      const dz = v >= 0 ? 1 : -1;
      const dx = (nileCourse(z + dz * 4) - nileCourse(z - dz * 4)) / 8 * dz;
      const want = Math.atan2(-dz, dx);
      let dy = want - b.yaw;
      dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      b.yaw += dy * Math.min(1, 0.02); // coming about slowly
      b.root.position.set(x, WATER_Y - 0.28 + Math.sin(t * 1.3 + b.phase) * 0.04, z);
      b.root.rotation.set(Math.sin(t * 0.9 + b.phase) * 0.025, b.yaw, Math.sin(t * 0.7 + b.phase * 2) * 0.02, "YXZ");
    }
  }
}
