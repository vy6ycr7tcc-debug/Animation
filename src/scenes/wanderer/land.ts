/* The long descent's land (master prompt 2B; the owner: "sky flooding, no real floor, super baggy,
   everything bland… it should feel like a descent, not a void"). The way used to be a band of
   stone hung in open sky over a sheet of cloud. Now it is cut into real ground:
   - a spire of rock rises inside the spiral, so the ramp winds down round it, terrace below
     terrace, its outer flank falling away into the cloud sea;
   - lower down the land opens into country: dark earth for the life, a long valley for the ache,
     a meadow at dawn round the pool, a cliff edge at the overlook above the sleeping city;
   - far ridges stand round it all in layers, the haze taking each a little more;
   - boulders and the world's own trees along the way (those beside it are solid).
   The ground reads the scans (meadow on the flat, cliff from the side where it is steep), tinted by
   where on the way it lies (warm stone high, grey through the veil, dark earth, deep blue, dawn
   green), and the haze and the moods do the rest. Room frame, like the rest of the area. */
import * as THREE from "three/webgpu";
import { T, type N } from "../../gpu/tsl";
import { roomPos } from "../densities/roomKit";
import { fbm } from "../../world/terrain";
import { surface } from "../../world/textures";
import { forest, type TreeSpot } from "../afterVeil/forest";
import type { Solid } from "../journey";

const { abs, float, length, mix, normalize, smoothstep, texture, vec2, vec3 } = T;

export interface LandPath {
  onPath(x: number, z: number): { s: number; d: number; h: number };
  along(s: number): [number, number, number];
  /** How wide the walkable way is there (half-width, metres). */
  wide(x: number, z: number, s: number): number;
  /** The land's tint at that point of the way (linear rgb, about 1). */
  tint(s: number): [number, number, number];
  /** How much the land falls away there (1 high in the air, 0 in open country). */
  steep(s: number): number;
  /** The highest the land may stand at (x, z), from every stretch of the way but your own band
      (`outside`: (x, z) is beyond the nearest stretch's band). */
  carve?(x: number, z: number, outside: boolean): number;
  len: number;
}

/** The massif the spiral winds round: its foot and its crown. */
export interface Massif {
  x: number;
  z: number;
  top: number;
  r: number;
}

/** The ground sheet's extent (room frame). */
const LAND = { x0: -150, x1: 170, z0: -500, z1: 70 };

/** The land's height at (x, z): the way exactly where you walk, real ground everywhere else. */
export function landHeight(P: LandPath, M: Massif, x: number, z: number): number {
  const o = P.onPath(x, z);
  const d = Math.abs(o.d), w = P.wide(x, z, o.s);
  const k = P.steep(o.s);
  const fall = Math.max(0, d - w - 1);
  // away from the way: high up the flank falls fast into the clouds; in the country it rolls
  const drop = k * (0.5 * fall + 0.01 * fall * fall) + (1 - k) * (0.05 * fall);
  const roll = (fbm(x * 0.018, z * 0.018) - 0.5) * (4 + 6 * (1 - k)) + (fbm(x * 0.07 + 9, z * 0.07 - 3) - 0.5) * 1.6;
  let h = o.h - drop + roll * Math.min(1, fall / 8);
  // the spire inside the spiral, the axis the ramp winds down round: steep, ribbed with ridges,
  // never as high as the ramp beside it (a wall there shut the way in like a gully)
  const rc = Math.hypot(x - M.x, z - M.z);
  const ridge = 1 - Math.abs(fbm(x * 0.05, z * 0.05) * 2 - 1);
  const massif = M.top * Math.exp(-((rc / M.r) ** 2) * 1.6) * (0.82 + ridge * 0.3);
  if (fall > 0.5) h = Math.max(h, massif);
  // the valley floor, under the cloud sea
  h = Math.max(h, -8 + roll);
  // toward the sheet's edges the land sinks under the cloud sea, so it never ends in a cut
  const edge = Math.min(x - LAND.x0, LAND.x1 - x, z - LAND.z0, LAND.z1 - z);
  if (edge < 70) h = h + (-12 - h) * (1 - Math.max(0, edge) / 70) ** 2;
  // under the way the land falls away beneath its glass (area.ts wayGlass), deep high in the air,
  // a shallow hollow in the country, so what lies beneath is seen through it; it rises to meet
  // the land again just beyond the glass's edge
  const under = o.h - 1.6 - 12 * k;
  const e = Math.min(1, Math.max(0, (d - w + 0.6) / 3.5));
  const out = under + (h - under) * e * e * (3 - 2 * e);
  // clear above every stretch of the way, last of all: beside any road the land rises no faster
  // than a bank (where the ramp passes under the way it came by, the upper way's own ground made
  // a gully round it; the upper way crosses there as a bridge of its own stone)
  return P.carve ? Math.min(out, P.carve(x, z, d > w)) : out;
}

/** The ground's shading: the scans, by slope, tinted by its place on the way (vertex colour). */
function landMaterial(): THREE.MeshStandardNodeMaterial {
  const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.95, metalness: 0 });
  const meadow = surface("meadow"), cliff = surface("cliff");
  const P = roomPos;
  const nW = normalize(T.normalWorldGeometry);
  const up = smoothstep(0.55, 0.85, abs(nW.y)); // 1 on the flat, 0 on cliffs
  // flat: the meadow scan at two scales
  const u1 = P.xz.div(5.5), u2 = P.xz.div(14.4).add(vec2(0.37, 0.71));
  const flat = texture(meadow.diff, u1).rgb.mul(0.6).add(texture(meadow.diff, u2).rgb.mul(0.4));
  const flatAo = texture(meadow.arm, u1).r;
  // steep: the cliff scan from the side (on the x and z planes, by the normal)
  const wx = abs(nW.x), wz = abs(nW.z), ws = wx.add(wz).add(0.001);
  const cx = texture(cliff.diff, P.zy.div(9)).rgb, cz = texture(cliff.diff, P.xy.div(9)).rgb;
  const side = cx.mul(wx).add(cz.mul(wz)).div(ws);
  const sideAo = texture(cliff.arm, P.zy.div(9)).r.mul(wx).add(texture(cliff.arm, P.xy.div(9)).r.mul(wz)).div(ws);
  const scan = mix(side, flat, up);
  const ao = mix(sideAo, flatAo, up);
  const lum = T.dot(scan, vec3(0.3, 0.5, 0.2));
  // the scan's grain carries the detail; the place on the way carries the colour
  const tint = T.attribute("aTint", "vec3") as N;
  const col = mix(vec3(lum), scan, 0.3).mul(tint).mul(1.9).mul(mix(float(0.5), float(1.05), ao));
  // broad patches so the land is never one flat tone
  const patch = T.mx_noise_float(P.xz.mul(0.02)).mul(0.5).add(0.5);
  const camD = length(T.cameraPosition.sub(T.positionWorld));
  m.colorNode = T.vec4(col.mul(mix(float(0.82), float(1.12), patch)), 1);
  // relief near: the flat's normal map
  const near = float(1).sub(smoothstep(25, 80, camD));
  const n = texture(meadow.nor, u1).xy.mul(2).sub(1).mul(near).mul(up).mul(1.2);
  m.normalNode = normalize(T.normalView.add(T.cameraViewMatrix.mul(T.vec4(vec3(n.x, 0, n.y.negate()), 0)).xyz));
  return m;
}

/** Rocks and trees' material: the cliff scan from every side, a little warm. */
function rockMaterial(): THREE.MeshStandardNodeMaterial {
  const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.92, metalness: 0 });
  const cliff = surface("cliff");
  const P = roomPos;
  const nW = normalize(T.normalWorld);
  const w = abs(nW).add(0.001), ws = w.x.add(w.y).add(w.z);
  const c = texture(cliff.diff, P.zy.div(2.6)).rgb.mul(w.x).add(texture(cliff.diff, P.xz.div(2.6)).rgb.mul(w.y)).add(texture(cliff.diff, P.xy.div(2.6)).rgb.mul(w.z)).div(ws);
  const tint = T.attribute("aTint", "vec3") as N;
  m.colorNode = T.vec4(c.mul(tint).mul(1.6), 1);
  return m;
}

export function buildLand(P: LandPath, M: Massif, R: () => number, t: N, fewer: number): { objects: THREE.Object3D[]; solids: Solid[]; dispose(): void } {
  const objects: THREE.Object3D[] = [];
  const solids: Solid[] = [];
  const own: { dispose(): void }[] = [];

  /* the ground: one sheet over the whole way, finer where you walk */
  {
    const X0 = LAND.x0, X1 = LAND.x1, Z0 = LAND.z0, Z1 = LAND.z1, STEP = MOBILE_STEP(fewer);
    const nx = Math.round((X1 - X0) / STEP) + 1, nz = Math.round((Z1 - Z0) / STEP) + 1;
    const pos = new Float32Array(nx * nz * 3), tint = new Float32Array(nx * nz * 3);
    for (let j = 0; j < nz; j++)
      for (let i = 0; i < nx; i++) {
        const x = X0 + i * STEP, z = Z0 + j * STEP, k = (j * nx + i) * 3;
        pos[k] = x;
        pos[k + 1] = landHeight(P, M, x, z);
        pos[k + 2] = z;
        const tt = P.tint(P.onPath(x, z).s);
        tint.set(tt, k);
      }
    const idx: number[] = [];
    for (let j = 0; j < nz - 1; j++)
      for (let i = 0; i < nx - 1; i++) {
        const a = j * nx + i, b = a + 1, c = a + nx, d = c + 1;
        idx.push(a, c, b, b, c, d);
      }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("aTint", new THREE.BufferAttribute(tint, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const m = landMaterial();
    const mesh = new THREE.Mesh(geo, m);
    mesh.receiveShadow = true;
    mesh.castShadow = true;
    objects.push(mesh);
    own.push(geo, m);
  }

  /* far ridges round it all, in three layers, the haze taking each */
  {
    const geos: THREE.BufferGeometry[] = [];
    const cx = 10, cz = -210;
    ([[520, 70, 0.9], [760, 130, 0.75], [1050, 210, 0.6]] as const).forEach(([r, hMax, shade], layer) => {
      const n = 220, pos: number[] = [], tint: number[] = [], idx: number[] = [];
      for (let i = 0; i <= n; i++) {
        const a = (i / n) * Math.PI * 2;
        const x = cx + Math.sin(a) * r, z = cz + Math.cos(a) * r;
        const peak = (fbm(Math.cos(a) * 3 + layer * 7, Math.sin(a) * 3 - layer * 5) ** 1.6) * hMax + 12;
        const ridged = (1 - Math.abs(fbm(a * 6 + layer, layer * 3) * 2 - 1)) * hMax * 0.25;
        pos.push(x, -20, z, x * 1.0, peak + ridged, z);
        tint.push(shade * 0.5, shade * 0.52, shade * 0.62, shade * 0.62, shade * 0.62, shade * 0.7);
        if (i) idx.push((i - 1) * 2, i * 2, (i - 1) * 2 + 1, (i - 1) * 2 + 1, i * 2, i * 2 + 1);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute("aTint", new THREE.Float32BufferAttribute(tint, 3));
      g.setIndex(idx);
      g.computeVertexNormals();
      geos.push(g);
    });
    const m = new THREE.MeshStandardNodeMaterial({ roughness: 1, metalness: 0, side: THREE.DoubleSide });
    m.colorNode = T.vec4((T.attribute("aTint", "vec3") as N).mul(0.35), 1);
    for (const g of geos) {
      const mesh = new THREE.Mesh(g, m);
      mesh.frustumCulled = false;
      objects.push(mesh);
      own.push(g);
    }
    own.push(m);
  }

  /* boulders: along the way's shoulders and scattered down the flanks */
  {
    const n = Math.round(150 * fewer);
    const base = new THREE.IcosahedronGeometry(1, 2);
    {
      const p = base.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < p.count; i++) {
        const v = new THREE.Vector3().fromBufferAttribute(p, i);
        const q = fbm(v.x * 0.9 + 3, v.z * 0.9 + v.y * 0.6 - 2) - 0.5;
        v.multiplyScalar(1 + q * 0.55);
        v.y = Math.max(v.y * 0.72, -0.3);
        p.setXYZ(i, v.x, v.y, v.z);
      }
      base.computeVertexNormals();
    }
    const tintArr = new Float32Array(n * 3);
    const inst = new THREE.InstancedMesh(base, rockMaterial(), n);
    const Mx = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler(), S = new THREE.Vector3(), Pp = new THREE.Vector3();
    let placed = 0;
    for (let tries = 0; placed < n && tries < n * 6; tries++) {
      const s = R() * P.len;
      const [x0, z0] = P.along(s);
      const [x1, z1] = P.along(s + 1);
      const dx = x1 - x0, dz = z1 - z0, l = Math.hypot(dx, dz) || 1;
      const side = R() < 0.5 ? -1 : 1;
      const w = P.wide(x0, z0, s);
      const off = w + 1.6 + (R() < 0.55 ? R() * 4 : 4 + R() * 30);
      const x = x0 + (-dz / l) * side * off, z = z0 + (dx / l) * side * off;
      const o = P.onPath(x, z);
      if (Math.abs(o.d) < P.wide(x, z, o.s) + 1.2) continue; // never on the way
      const y = landHeight(P, M, x, z);
      // small stones on the shoulders (they stood between the view and you), great ones further out
      const size = off < w + 7 ? 0.25 + R() * 0.7 : (0.8 + R() ** 2 * 2.4) * Math.min(1.8, off / (w + 10));
      Pp.set(x, y - size * 0.18, z);
      Q.setFromEuler(E.set((R() - 0.5) * 0.4, R() * 6.28, (R() - 0.5) * 0.4));
      S.set(size * (0.8 + R() * 0.5), size * (0.6 + R() * 0.5), size * (0.8 + R() * 0.5));
      inst.setMatrixAt(placed, Mx.compose(Pp, Q, S));
      tintArr.set(P.tint(o.s), placed * 3);
      if (Math.abs(o.d) < P.wide(x, z, o.s) + 4 && size > 0.5) solids.push({ x, z, r: size * 0.85, h: size * 1.2 });
      placed++;
    }
    inst.count = placed;
    base.setAttribute("aTint", new THREE.InstancedBufferAttribute(tintArr, 3));
    inst.castShadow = true;
    inst.receiveShadow = true;
    inst.instanceMatrix.needsUpdate = true;
    objects.push(inst);
    own.push(base, inst.material as THREE.Material);
  }

  /* trees: a few wind-bent on the mountain's flank, more in the country, full at dawn */
  {
    const spots: TreeSpot[] = [];
    const want = Math.round(46 * fewer);
    for (let tries = 0; spots.length < want && tries < want * 10; tries++) {
      const s = R() * P.len;
      const k = P.steep(s);
      if (R() < k * 0.65) continue; // fewer high on the mountain
      const [x0, z0] = P.along(s);
      const [x1, z1] = P.along(s + 1);
      const dx = x1 - x0, dz = z1 - z0, l = Math.hypot(dx, dz) || 1;
      const side = R() < 0.5 ? -1 : 1, w = P.wide(x0, z0, s);
      const off = w + 3 + R() * 22;
      const x = x0 + (-dz / l) * side * off, z = z0 + (dx / l) * side * off;
      const o = P.onPath(x, z);
      if (Math.abs(o.d) < P.wide(x, z, o.s) + 2.5) continue;
      if (spots.some((q) => Math.hypot(q.x - x, q.z - z) < 7)) continue;
      const y = landHeight(P, M, x, z);
      const tt = P.tint(o.s);
      // the crown follows the light: bare in the deep and the ache, full at dawn
      const crown = Math.min(1, Math.max(0.15, tt[1] * 0.9 - 0.1));
      spots.push({ x, z, y, size: 0.8 + R() * 0.7, shape: Math.floor(R() * 4), crown });
      if (Math.abs(o.d) < P.wide(x, z, o.s) + 5) solids.push({ x, z, r: 0.5, h: 6 });
    }
    const f = forest(spots, t, R, 7300);
    objects.push(...f.objects);
    own.push(f);
  }

  return {
    objects,
    solids,
    dispose: () => {
      for (const o of own) o.dispose();
    },
  };
}

/** The ground's grid: finer on a desktop. */
function MOBILE_STEP(fewer: number): number {
  return fewer < 1 ? 3 : 2.4;
}
