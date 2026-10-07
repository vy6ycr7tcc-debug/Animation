/* The ruins made new (master prompt 2C; the visual Bible's New Age: "the glorious ruins made new,
   the new earth"; Nehemiah). The forest path opens into the clearing, and in it stand the ruins of
   a court of honey sandstone: the front of a hall with arched doors and windows, an arcade of five
   arches, low garden walls, a carved basin on a round plinth. Their lower courses stand; the rest
   lies about in the grass. As the angel speaks of this world (beat 3), they come alive:
   - light washes in;
   - stone by stone, course by course from the ground up, the blocks rise from where they lay,
     glowing beneath, turning as they come, and settle into their places;
   - the lawn greens, the clipped shrubs swell, flowers open across the grass and the wisteria
     lengthens down from the arches, white and lavender, in a time-lapse of seasons;
   - last, a wave of warm light passes through the whole court and out.
   Everything follows one number, how far the rebuilding has come (0 ruin … 1 made new). Room frame. */
import * as THREE from "three/webgpu";
import { T, type N } from "../../gpu/tsl";
import { fbm } from "../../world/terrain";
import { landStone } from "../../world/stoneworks";
import { keepAlpha, pointCloud, touch } from "../densities/roomKit";
import { ribbonGeometry, ribbonMaterial } from "../../gpu/ribbons";
import type { Solid } from "../journey";

const { abs, exp, float, length, max, mix, pow, sin, smoothstep, uniform, vec2, vec3, vec4 } = T;
const V3 = THREE.Vector3;

interface Opening {
  /** Along the wall (m from its start): from, to. */
  u0: number;
  u1: number;
  /** Bottom and top of the straight part; an arch adds a half-circle above. */
  y0: number;
  y1: number;
  arch?: boolean;
}
interface Wall {
  a: [number, number];
  b: [number, number];
  h: number;
  thick: number;
  openings: Opening[];
  /** The broken top it still stands to while ruined (fraction of h, ragged). */
  ruin: number;
}

const COURSE = 0.5;
const BLOCK = 1.05;
const ease = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));

export function buildRuins(o: { centre: THREE.Vector3; floor: (x: number, z: number) => number; R: () => number; t: N; fewer: number; onWay: (x: number, z: number) => boolean }) {
  const { centre: C, floor, R, t } = o;
  const group = new THREE.Group();
  const own: { dispose(): void }[] = [];
  const solids: Solid[] = [];
  const uK = uniform(0); // the rebuilding, 0 … 1
  const uBloom = uniform(0); // the garden's time-lapse, 0 … 1
  const uWash = uniform(0); // the wave of light: where its front is (0 the court's heart … 1 beyond)
  const at = (x: number, z: number): [number, number] => [C.x + x, C.z + z];

  /* the court's plan (relative to the clearing's heart): the hall's front on its west side facing
     the way, the arcade closing its far side, the garden and basin between; the way passes east */
  const walls: Wall[] = [
    // the hall's front, facing the way: two arched doors below, three windows above
    {
      a: [-25, 16], b: [-25, -20], h: 8, thick: 0.75, ruin: 0.46,
      openings: [
        { u0: 8, u1: 10.6, y0: 0, y1: 3.0, arch: true },
        { u0: 25.4, u1: 28, y0: 0, y1: 3.0, arch: true },
        { u0: 6.4, u1: 7.8, y0: 4.6, y1: 6.4 },
        { u0: 17.3, u1: 18.7, y0: 4.6, y1: 6.4 },
        { u0: 28.2, u1: 29.6, y0: 4.6, y1: 6.4 },
        { u0: 16.6, u1: 19.4, y0: 0, y1: 3.4, arch: true },
      ],
    },
    // its returns, giving it depth
    { a: [-31, 16], b: [-25, 16], h: 8, thick: 0.75, ruin: 0.4, openings: [] },
    { a: [-25, -20], b: [-31, -20], h: 8, thick: 0.75, ruin: 0.36, openings: [{ u0: 2.2, u1: 3.6, y0: 4.6, y1: 6.4 }] },
    // the arcade: five arches on piers, closing the court's far side behind the basin
    {
      a: [-22, -24], b: [-2, -28], h: 5.4, thick: 0.9, ruin: 0.52,
      openings: [0, 1, 2, 3, 4].map((k) => ({ u0: 1.1 + k * 3.85, u1: 1.1 + k * 3.85 + 2.6, y0: 0, y1: 2.6, arch: true })),
    },
    // the garden's low walls round the basin, open to the way
    { a: [-17, 9], b: [-5, 9], h: 1.0, thick: 0.5, ruin: 0.6, openings: [{ u0: 10.5, u1: 12, y0: 0, y1: 1 }] },
    { a: [-17, -9], b: [-5, -9], h: 1.0, thick: 0.5, ruin: 0.5, openings: [{ u0: 10.5, u1: 12, y0: 0, y1: 1 }] },
    { a: [-17, 9], b: [-17, -9], h: 1.0, thick: 0.5, ruin: 0.45, openings: [{ u0: 8.2, u1: 9.8, y0: 0, y1: 1 }] },
  ];

  /* the stones: each one's place in the made-new court, and where it lay */
  interface Stone {
    to: THREE.Vector3;
    rot: number;
    from: THREE.Vector3;
    fromQ: THREE.Quaternion;
    delay: number;
    lift: number;
    size: THREE.Vector3;
    standing: boolean;
  }
  const stones: Stone[] = [];
  const inOpening = (w: Wall, u: number, y: number) =>
    w.openings.some((op) => {
      if (u < op.u0 || u > op.u1) return false;
      if (y >= op.y0 && y <= op.y1) return true;
      if (!op.arch) return false;
      const r = (op.u1 - op.u0) / 2, cu = (op.u0 + op.u1) / 2;
      return y > op.y1 && Math.hypot(u - cu, y - op.y1) < r;
    });
  let maxH = 1;
  // the scaffold of light: the made-new court drawn first in thin gold (each wall's outline, both
  // faces, and every opening's), which the stones then fill
  const scaffold: number[] = [];
  walls.forEach((w, wi) => {
    const [ax, az] = at(...w.a), [bx, bz] = at(...w.b);
    const len = Math.hypot(bx - ax, bz - az), dx = (bx - ax) / len, dz = (bz - az) / len;
    const rot = Math.atan2(-dz, dx);
    const base = Math.min(floor(ax, az), floor(bx, bz)) - 0.15;
    for (const face of [-1, 1]) {
      const ox = -dz * face * (w.thick / 2 + 0.03), oz = dx * face * (w.thick / 2 + 0.03);
      const P = (u: number, y: number): [number, number, number] => [ax + dx * u + ox, base + y, az + dz * u + oz];
      const line = (a: [number, number, number], b: [number, number, number]) => scaffold.push(...a, ...b);
      line(P(0, 0.05), P(len, 0.05));
      line(P(0, w.h), P(len, w.h));
      line(P(0, 0.05), P(0, w.h));
      line(P(len, 0.05), P(len, w.h));
      for (const op of w.openings) {
        line(P(op.u0, op.y0 + 0.05), P(op.u0, op.y1));
        line(P(op.u1, op.y0 + 0.05), P(op.u1, op.y1));
        if (!op.arch) {
          line(P(op.u0, op.y1), P(op.u1, op.y1));
          if (op.y0 > 0.01) line(P(op.u0, op.y0), P(op.u1, op.y0));
        } else {
          const r = (op.u1 - op.u0) / 2, cu = (op.u0 + op.u1) / 2;
          for (let k = 0; k < 12; k++) {
            const a0 = Math.PI * (k / 12), a1 = Math.PI * ((k + 1) / 12);
            line(P(cu - Math.cos(a0) * r, op.y1 + Math.sin(a0) * r), P(cu - Math.cos(a1) * r, op.y1 + Math.sin(a1) * r));
          }
        }
      }
    }
    maxH = Math.max(maxH, w.h);
    const courses = Math.round(w.h / COURSE);
    for (let c = 0; c < courses; c++) {
      const y = c * COURSE + COURSE / 2;
      const off = c % 2 ? BLOCK / 2 : 0;
      for (let u = -off; u < len; u += BLOCK) {
        const u0 = Math.max(0, u), u1 = Math.min(len, u + BLOCK);
        if (u1 - u0 < 0.3) continue;
        const um = (u0 + u1) / 2;
        if (inOpening(w, um, y)) continue;
        // the broken top while ruined: ragged along the wall
        const broken = w.h * (w.ruin + (fbm(um * 0.35 + wi * 7, wi * 3.1) - 0.5) * 0.5);
        const standing = y < Math.max(COURSE, broken);
        const to = new V3(ax + dx * um, base + y, az + dz * um);
        // where it fell: out from the wall on either side, lying in the grass
        const side = R() < 0.65 ? 1 : -1, outBy = 1.5 + R() * 6;
        const fx = to.x + -dz * side * outBy + dx * (R() - 0.5) * 3, fz = to.z + dx * side * outBy + dz * (R() - 0.5) * 3;
        const from = new V3(fx, floor(fx, fz) + 0.18, fz);
        const fromQ = new THREE.Quaternion().setFromEuler(new THREE.Euler((R() - 0.5) * 1.2, R() * 6.28, (R() - 0.5) * 1.2));
        stones.push({
          to, rot, from, fromQ, standing,
          // bottom up, each its own moment; the walls in turn (the hall, the arcade, the garden)
          delay: (y / maxH) * 0.7 + R() * 0.14 + wi * 0.02,
          lift: 1.6 + R() * 2.6,
          size: new V3((u1 - u0) * 0.97, COURSE * 0.95, w.thick * (0.94 + R() * 0.06)),
        });
      }
    }
    // the arches' voussoirs: wedge stones round each half-circle
    for (const op of w.openings) {
      if (!op.arch) continue;
      const r = (op.u1 - op.u0) / 2, cu = (op.u0 + op.u1) / 2, n = 9;
      for (let k = 0; k < n; k++) {
        const a = Math.PI * ((k + 0.5) / n);
        const um = cu - Math.cos(a) * (r + 0.25), y = op.y1 + Math.sin(a) * (r + 0.25);
        const to = new V3(ax + dx * um, base + y, az + dz * um);
        const fx = to.x - dz * (2 + R() * 4), fz = to.z + dx * (2 + R() * 4);
        stones.push({
          to, rot, from: new V3(fx, floor(fx, fz) + 0.18, fz), fromQ: new THREE.Quaternion().setFromEuler(new THREE.Euler(R(), R() * 6, R())), standing: false,
          delay: (y / maxH) * 0.7 + 0.05 + R() * 0.05,
          lift: 2 + R() * 2,
          size: new V3(0.5, 0.42, w.thick),
        });
        // the voussoir turns with the arch (its tilt about the wall's normal)
        (stones[stones.length - 1] as Stone & { tilt?: number }).tilt = a - Math.PI / 2;
      }
    }
    // solid while you walk: the wall between its openings at ground level
    const cuts = w.openings.filter((op) => op.y0 <= 0.01).map((op) => [op.u0, op.u1] as [number, number]).sort((p, q) => p[0] - q[0]);
    let u = 0;
    for (const [c0, c1] of [...cuts, [len, len] as [number, number]]) {
      if (c0 - u > 0.4) {
        const mu = (u + c0) / 2, [sx, sz] = [ax + dx * mu, az + dz * mu];
        solids.push({ x: sx, z: sz, hx: (c0 - u) / 2, hz: w.thick / 2 + 0.1, ang: rot, h: w.h });
      }
      u = c1;
    }
  });

  /* the stones' body: one instanced mesh of rough-edged blocks in honey sandstone */
  const n = stones.length;
  const blockGeo = new THREE.BoxGeometry(1, 1, 1, 2, 2, 2);
  {
    const p = blockGeo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      // worn arrises: the corners pulled in a little, each face a little uneven
      const k = 1 - 0.06 * (Math.abs(x * 2) + Math.abs(y * 2) + Math.abs(z * 2) > 2.5 ? 1 : 0);
      p.setXYZ(i, x * k, y * k, z * k);
    }
    blockGeo.computeVertexNormals();
  }
  const aFly = new THREE.InstancedBufferAttribute(new Float32Array(n), 1);
  blockGeo.setAttribute("aFly", aFly);
  const stoneM = landStone("sandstone_blocks_05", C.y - 2, 2.2, [1.32, 1.12, 0.86]);
  {
    const fly = T.attribute("aFly", "float") as N;
    // in flight a warm light glows from beneath; the wave of light passes through every stone
    const below = smoothstep(0.3, -0.6, T.normalWorld.y);
    const dW = length(T.positionWorld.xz.sub(vec2(C.x, C.z)));
    const front = uWash.mul(70);
    const band = exp(dW.sub(front).mul(dW.sub(front)).mul(-0.012)).mul(smoothstep(0, 0.08, uWash)).mul(smoothstep(1, 0.85, uWash));
    stoneM.emissiveNode = vec3(1.0, 0.72, 0.4).mul(fly.mul(below.mul(0.9).add(0.15))).add(vec3(1.0, 0.85, 0.6).mul(band.mul(0.35)));
  }
  const inst = new THREE.InstancedMesh(blockGeo, stoneM, n);
  inst.castShadow = true;
  inst.receiveShadow = true;
  group.add(inst);
  own.push(blockGeo, stoneM);
  {
    const sg = ribbonGeometry(scaffold);
    // drawn in before the first stone lifts, held while they fill it, gone once the court stands
    const shown = smoothstep(0.02, 0.12, uK).mul(float(1).sub(smoothstep(0.62, 0.8, uK)));
    const run = pow(sin(T.positionGeometry.y.mul(1.3).add(T.positionGeometry.x.mul(0.4)).sub(t.mul(1.6))).mul(0.5).add(0.5), 4);
    const sm = keepAlpha(ribbonMaterial(vec3(1.0, 0.8, 0.46).mul(shown).mul(run.mul(0.5).add(0.35)), 0.6));
    const mesh = new THREE.Mesh(sg, sm);
    mesh.frustumCulled = false;
    group.add(mesh);
    own.push(sg, sm);
  }

  /* the basin on its round plinth: carved, rising whole from the turf as the court is made new */
  const basinAt = at(-11, 0);
  const basin = new THREE.Group();
  {
    const prof: THREE.Vector2[] = [];
    const pts: [number, number][] = [[0, 0], [1.9, 0], [1.9, 0.28], [1.6, 0.32], [1.6, 0.55], [0.42, 0.62], [0.36, 1.1], [0.5, 1.22], [0.36, 1.3], [0.62, 1.42], [1.15, 1.62], [1.3, 2.0], [1.22, 2.06], [1.05, 1.82], [0, 1.82]];
    for (const [x, y] of pts) prof.push(new THREE.Vector2(x, y));
    const lg = new THREE.LatheGeometry(prof, 40);
    const m = landStone("sandstone_cracks", C.y - 2, 1.4, [1.3, 1.12, 0.9]);
    const mesh = new THREE.Mesh(lg, m);
    mesh.castShadow = true;
    basin.add(mesh);
    // water in it, holding the sky
    const wg = new THREE.CircleGeometry(1.08, 40);
    wg.rotateX(-Math.PI / 2);
    wg.translate(0, 1.9, 0);
    const wm = new THREE.MeshStandardNodeMaterial({ color: new THREE.Color(0.18, 0.24, 0.3), roughness: 0.08, metalness: 0.1 });
    wm.emissiveNode = vec3(0.5, 0.42, 0.26).mul(uBloom.mul(0.12));
    basin.add(new THREE.Mesh(wg, wm));
    basin.position.set(basinAt[0], floor(...basinAt) - 0.05, basinAt[1]);
    group.add(basin);
    own.push(lg, m, wg, wm);
    solids.push({ x: basinAt[0], z: basinAt[1], r: 1.9, h: 2 });
  }

  /* the garden: clipped round shrubs, swelling as the seasons pass */
  const shrubs: { p: THREE.Vector3; s: number; d: number }[] = [];
  {
    const spots: [number, number][] = [];
    for (const [x, z] of [[-15, 7], [-15, -7], [-7, 7], [-7, -7], [-15, 0], [-12, 4], [-12, -4]]) spots.push([x, z]);
    for (let k = 0; k < 9; k++) spots.push([-23, -18 + k * 4.3]); // along the hall's foot
    for (let k = 0; k < 6; k++) spots.push([-20.2 + k * 3.85, -21.8 - k * 0.77]); // along the arcade's foot
    for (let k = 0; k < Math.round(10 * o.fewer); k++) {
      const a = R() * Math.PI * 2, r = 18 + R() * 16;
      spots.push([Math.cos(a) * r, Math.sin(a) * r]);
    }
    for (const [x, z] of spots) {
      const [wx, wz] = at(x, z);
      if (o.onWay(wx, wz)) continue; // never on the way
      shrubs.push({ p: new V3(wx, floor(wx, wz), wz), s: 0.55 + R() * 0.6, d: R() * 0.45 });
    }
  }
  const shrubGeo = new THREE.IcosahedronGeometry(1, 2);
  {
    const p = shrubGeo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      const v = new V3().fromBufferAttribute(p, i);
      v.multiplyScalar(1 + (fbm(v.x * 2 + 3, v.z * 2 + v.y) - 0.5) * 0.25);
      v.y = Math.max(v.y * 0.85, -0.2);
      p.setXYZ(i, v.x, v.y + 0.75, v.z);
    }
    shrubGeo.computeVertexNormals();
  }
  const shrubM = new THREE.MeshStandardNodeMaterial({ roughness: 0.85, metalness: 0 });
  {
    const leaf = T.mx_noise_float(T.positionWorld.mul(4.2)).mul(0.5).add(0.5);
    shrubM.colorNode = vec4(mix(vec3(0.05, 0.11, 0.04), vec3(0.16, 0.3, 0.1), leaf), 1);
  }
  const shrubInst = new THREE.InstancedMesh(shrubGeo, shrubM, shrubs.length);
  shrubInst.castShadow = true;
  group.add(shrubInst);
  own.push(shrubGeo, shrubM);
  // white blossoms opening over the shrubs once they have grown, as the roses do in high summer
  {
    const per = 22, tot = shrubs.length * per;
    const c = pointCloud(tot, 0.3);
    shrubs.forEach((sh, i) => {
      for (let k = 0; k < per; k++) {
        const a = R() * Math.PI * 2, el = R() * 1.2;
        const r = sh.s * 1.02;
        c.pos.set([sh.p.x + Math.cos(a) * Math.cos(el) * r * 1.15, sh.p.y + 0.75 * sh.s + Math.sin(el) * r * 0.85, sh.p.z + Math.sin(a) * Math.cos(el) * r * 1.15], (i * per + k) * 3);
        c.k.set([sh.d, R(), R(), R()], (i * per + k) * 4);
      }
    });
    touch(c.cloud);
    const K = c.cloud.nodes.aK;
    const open = smoothstep(K.x.add(0.42), K.x.add(0.55).add(K.y.mul(0.15)), uBloom);
    const col = mix(vec3(1, 0.98, 0.94), vec3(1, 0.86, 0.9), smoothstep(0.7, 0.9, K.z));
    c.material.colorNode = vec4(col.mul(c.round).mul(open).mul(0.55), 1);
    group.add(c.cloud.sprite);
    own.push(c.material);
  }

  /* the wisteria: hanging trusses of white and lavender from the arches and the hall's top,
     lengthening down as the garden blooms */
  {
    const anchors: THREE.Vector3[] = [];
    for (const wi of [0, 3]) {
      const w = walls[wi];
      const [ax, az] = at(...w.a), [bx, bz] = at(...w.b);
      const len = Math.hypot(bx - ax, bz - az), dx = (bx - ax) / len, dz = (bz - az) / len;
      const base = Math.min(floor(ax, az), floor(bx, bz)) - 0.15;
      // over the openings' crowns and in drifts along the top, on the side the way sees
      const face = 1; // both face into the court
      for (let u = 0.6; u < len; u += 0.55) {
        if (fbm(u * 0.4 + wi, wi * 2) < 0.48) continue;
        const top = wi === 0 ? w.h : w.h;
        anchors.push(new V3(ax + dx * u - dz * face * (w.thick / 2 + 0.15), base + top - 0.1, az + dz * u + dx * face * (w.thick / 2 + 0.15)));
      }
      for (const op of w.openings)
        if (op.arch) {
          const cu = (op.u0 + op.u1) / 2, r = (op.u1 - op.u0) / 2;
          for (let k = -2; k <= 2; k++) anchors.push(new V3(ax + dx * (cu + k * r * 0.4) - dz * face * (w.thick / 2 + 0.12), base + op.y1 + r * 0.9, az + dz * (cu + k * r * 0.4) + dx * face * (w.thick / 2 + 0.12)));
        }
    }
    const per = 26;
    const tot = Math.round(anchors.length * per * Math.max(0.6, o.fewer));
    const c = pointCloud(tot, 0.34);
    for (let i = 0; i < tot; i++) {
      const a = anchors[i % anchors.length];
      const v = Math.floor(i / anchors.length) / per;
      const L = 1.6 + fbm(a.x * 0.7, a.z * 0.7) * 3.2;
      // a truss tapers and sways a little out from the wall
      const sp = (1 - v) * 0.22;
      c.pos.set([a.x + (R() - 0.5) * sp, a.y - v * L, a.z + (R() - 0.5) * sp], i * 3);
      c.k.set([v, R(), R(), L / 5], i * 4);
    }
    touch(c.cloud);
    const K = c.cloud.nodes.aK;
    // it grows down: a blossom shows once the season has reached its place on the truss
    const grown = smoothstep(K.x.sub(0.06), K.x, uBloom.mul(1.25).sub(K.y.mul(0.2)));
    const sway = sin(t.mul(0.6).add(K.y.mul(20))).mul(K.x.mul(0.12));
    c.material.positionNode = c.cloud.nodes.position.add(vec3(sway, 0, sway.mul(0.6)));
    const col = mix(vec3(0.96, 0.94, 1.0), vec3(0.74, 0.62, 0.95), smoothstep(0.35, 0.75, K.z));
    c.material.colorNode = vec4(col.mul(c.round).mul(grown).mul(0.6), 1);
    group.add(c.cloud.sprite);
    own.push(c.material);
  }

  /* flowers opening across the lawn, in the beds and at the walls' feet */
  {
    const nf = Math.round(1600 * o.fewer);
    const c = pointCloud(nf, 0.24);
    for (let i = 0; i < nf; i++) {
      const bed = R() < 0.45;
      const a = R() * Math.PI * 2, r = bed ? Math.sqrt(R()) * 8 : 6 + Math.sqrt(R()) * 34;
      const [x, z] = bed ? at(-11 + Math.cos(a) * r * 0.75, Math.sin(a) * r) : at(Math.cos(a) * r, Math.sin(a) * r);
      c.pos.set([x, floor(x, z) + 0.12 + R() * 0.35, z], i * 3);
      c.k.set([R(), R(), R(), R()], i * 4);
    }
    touch(c.cloud);
    const K = c.cloud.nodes.aK;
    const open = smoothstep(K.x.mul(0.8), K.x.mul(0.8).add(0.2), uBloom);
    const hue = K.y;
    const col = mix(mix(vec3(1, 0.62, 0.72), vec3(1, 0.86, 0.45), step2(hue, 0.4)), mix(vec3(0.72, 0.6, 1), vec3(1, 0.98, 0.94), step2(hue, 0.8)), step2(hue, 0.6));
    c.material.colorNode = vec4(col.mul(c.round).mul(open).mul(0.6), 1);
    group.add(c.cloud.sprite);
    own.push(c.material);
  }

  /* each frame: the court at `k` (rebuilt) and `bloom` (the garden), the wave at `wash` */
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), Qt = new THREE.Quaternion(), P = new V3(), S = new V3(), E = new THREE.Euler();
  const Y = new V3(0, 1, 0);
  let last = -1, lastBloom = -1;
  function update(k: number, bloom: number, wash: number): void {
    uK.value = k;
    uBloom.value = bloom;
    uWash.value = wash;
    if (Math.abs(k - last) > 1e-4) {
      last = k;
      const fly = aFly.array as Float32Array;
      stones.forEach((s, i) => {
        // each stone's own moment within the rising (stones still standing are already home)
        const q = s.standing ? 1 : Math.min(1, Math.max(0, (k - 0.04 - s.delay * 0.62) / 0.2));
        const e = ease(q);
        P.lerpVectors(s.from, s.to, e);
        P.y += Math.sin(q * Math.PI) * s.lift;
        const tilt = (s as Stone & { tilt?: number }).tilt ?? 0;
        Qt.setFromEuler(E.set(0, s.rot, tilt, "YXZ"));
        Q.slerpQuaternions(s.fromQ, Qt, e);
        if (q > 0 && q < 1) {
          // turning as it comes, a slow half-turn, settling straight
          Q.multiply(new THREE.Quaternion().setFromAxisAngle(Y, Math.sin(q * Math.PI) * 0.5));
        }
        S.copy(s.size);
        M.compose(P, Q, S);
        inst.setMatrixAt(i, M);
        fly[i] = q > 0 && q < 1 ? Math.sin(q * Math.PI) : 0;
      });
      inst.instanceMatrix.needsUpdate = true;
      aFly.needsUpdate = true;
      // the basin comes up out of the turf with the last courses
      const bq = ease(Math.min(1, Math.max(0, (k - 0.5) / 0.25)));
      basin.position.y = floor(...basinAt) - 0.05 - (1 - bq) * 1.7;
      basin.rotation.z = (1 - bq) * 0.18;
    }
    if (Math.abs(bloom - lastBloom) > 1e-4) {
      lastBloom = bloom;
      shrubs.forEach((s, i) => {
        const g2 = ease(Math.min(1, Math.max(0, (bloom - s.d) / 0.45)));
        const sc = s.s * (0.12 + 0.88 * g2);
        M.compose(s.p, Q.identity(), S.set(sc * 1.15, sc, sc * 1.15));
        shrubInst.setMatrixAt(i, M);
      });
      shrubInst.instanceMatrix.needsUpdate = true;
    }
  }
  update(0, 0, 0);

  return {
    group,
    solids,
    update,
    uBloom,
    dispose: () => {
      for (const x of own) x.dispose();
      inst.dispose();
      shrubInst.dispose();
    },
  };
}

/** A soft step for colour choices (TSL). */
function step2(x: N, edge: number): N {
  return smoothstep(edge - 0.02, edge + 0.02, x);
}
void abs;
void float;
void max;
void pow;
