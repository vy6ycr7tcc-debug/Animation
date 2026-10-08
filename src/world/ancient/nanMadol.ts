/* Nan Madol (the owner's brief; the telling `NAN-MADOL`, Aria, 281.32 s): a Venice built by
   giants, half surrendered to the sea, at dawn. Black basalt islets in a shallow lagoon, joined
   by canals you wade through, a great seawall between the calm water and the open lake. Serene,
   tidal, patient: the most whole of the ruins, because the tide still runs its streets. It
   stands on the world's own shore toward the dawn (terrain.ts `NAN_MADOL`), its lagoon floor
   levelled to wading depth.
   - The walls: long prismatic basalt columns laid log-cabin fashion, a course of stretchers
     along the wall, then a course of headers across it with their ends standing out, dark, wet
     and darker still at the waterline, a weed line along it; coral rubble filling between.
   - The islets: low platforms of it with coral-rubble tops, some walled, a courtyard with a
     tidal pool holding the sky, house platforms, a canoe landing with mooring stones, offering
     stones; steps up from the water at each.
   - The mortuary islet (after Nandauwas): the tallest walls, their corners swept up, a narrow
     entrance passage, an inner court within a second wall, a tomb of basalt logs roofed with
     logs.
   - The seawall on the open side, the surf breaking white against it (and heard: a soft surf
     bed near it).
   - Palms leaning over the canals (the world's own palms), mangroves gripping the walls' feet.
   - The tide: a slow visible current along the canals that turns about every three minutes.
     Mist over the water, thinning over the first minutes of a visit. Fish in the clear canals.
     (No turtle: there is no model for one, and the rule is real models or nothing.)
   - Two figures: the watcher on the seawall facing the open water, and the keeper in the
     mortuary's inner court.
   - Its telling begins once, the first time you come into the lagoon, and plays on wherever you
     go (the owner's rule for these areas). */
import * as THREE from "three/webgpu";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { T, fogUniforms, gpuUniforms, outOfTheWay, softPoints, spriteCloud, viewDepth, type N, softDot, pointR } from "../../gpu/tsl";
import { NAN_FLOOR, NAN_MADOL, heightAt, nanMadolAt, standHooks, WATER_Y, type Collider } from "../terrain";
import { surface } from "../textures";
import { palmGeometry, palmMaterial } from "../wilds";
import { Keeper, Swimmers, rng, solidBox } from "./kit";
import { solid } from "../solidity";

const { abs, clamp, cos, dot, float, fract, length, max, mix, normalWorld, positionWorld, sin, smoothstep, uniform, uv, vec2, vec3, vec4 } = T;
const V3 = THREE.Vector3;
const NM = NAN_MADOL, FL = NAN_FLOOR;

/** One islet: a rectangle of the plan (+z out to the open water), its platform's top, and the
    walls it carries (an enclosure's height above the platform, and the way its gap opens). */
interface Islet {
  id: string;
  x: number;
  z: number;
  w: number;
  d: number;
  top: number;
  wall?: { h: number; gap: "n" | "s" | "e" | "w"; inset?: number };
  inner?: { w: number; d: number; h: number; gap: "n" | "s" | "e" | "w" };
  pool?: boolean;
  houses?: number;
  landing?: boolean;
}
const ISLETS: Islet[] = [
  { id: "mortuary", x: 0, z: 22, w: 30, d: 26, top: 0.6, wall: { h: 6.2, gap: "s" }, inner: { w: 14, d: 11, h: 3.6, gap: "s" } },
  { id: "a", x: -26, z: 10, w: 14, d: 12, top: 0.5, wall: { h: 1.7, gap: "e" } },
  { id: "b", x: -26, z: -10, w: 12, d: 14, top: 0.45, houses: 3 },
  { id: "c", x: 26, z: 10, w: 14, d: 12, top: 0.5, wall: { h: 1.2, gap: "w" }, pool: true },
  { id: "d", x: 26, z: -10, w: 12, d: 12, top: 0.5, wall: { h: 2.2, gap: "w" } },
  { id: "e", x: 0, z: -8, w: 16, d: 10, top: 0.4, landing: true, houses: 1 },
  { id: "f", x: -30, z: 32, w: 10, d: 10, top: 0.45 },
  { id: "g", x: 30, z: 33, w: 10, d: 10, top: 0.45 },
];
/** The seawall, along the open side. */
const SEAWALL = { z: 48, half: 52, thick: 3.4, h: 3.2 };

/* ---------------------------------------------------------------- basalt */
/** A basalt column: a hexagonal prism along x, unit long and wide (scaled per log). */
function columnGeometry(): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(0.5, 0.5, 1, 6, 1);
  g.rotateZ(Math.PI / 2);
  // its faces a little uneven, its ends a little worn
  const p = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const k = 1 + Math.sin(y * 9 + z * 7) * 0.04;
    p.setXYZ(i, x, y * k, z * k);
  }
  g.computeVertexNormals();
  return g;
}
/** Wet black basalt: rough above, glistening and darker toward the waterline, a band of weed at
    it, the scan's grain over its faces. Per log, its own tone (instance colour). */
function basaltMaterial(): THREE.MeshStandardNodeMaterial {
  const m = new THREE.MeshStandardNodeMaterial({ metalness: 0, roughness: 0.85 });
  const S = surface("rock");
  const pw = positionWorld, n = T.normalWorldGeometry;
  const wp = T.pow(abs(n), vec3(4)), w = wp.div(wp.x.add(wp.y).add(wp.z));
  const tri = (t: THREE.Texture, s: number) => T.texture(t, pw.zy.div(s)).mul(w.x).add(T.texture(t, pw.xz.div(s)).mul(w.y)).add(T.texture(t, pw.xy.div(s)).mul(w.z));
  const grain = tri(S.diff, 1.6).rgb.dot(vec3(0.33)).mul(0.9).add(0.55);
  const above = pw.y.sub(WATER_Y);
  const wet = smoothstep(1.1, -0.1, above);
  const weed = smoothstep(0.35, 0.1, abs(above.sub(0.12))).mul(T.mx_noise_float(pw.mul(1.7)).mul(0.5).add(0.6));
  let c: N = vec3(0.115, 0.112, 0.118).mul(T.instanceColor ?? vec3(1)).mul(grain);
  c = mix(c, c.mul(0.6), wet);
  c = mix(c, vec3(0.06, 0.09, 0.05), clamp(weed, 0, 1).mul(0.7));
  // pale salt and lichen on what faces up and stays dry
  const dry = smoothstep(0.6, 2.2, above).mul(smoothstep(0.5, 0.9, n.y));
  c = mix(c, vec3(0.32, 0.31, 0.28), dry.mul(T.mx_noise_float(pw.mul(2.3)).mul(0.5).add(0.5)).mul(0.5));
  m.colorNode = vec4(c, 1);
  m.roughnessNode = mix(float(0.88), float(0.28), wet);
  return solid(m);
}
/** The coral rubble that fills the islets: pale broken coral and shell, dark between. */
function rubbleMaterial(): THREE.MeshStandardNodeMaterial {
  const m = new THREE.MeshStandardNodeMaterial({ metalness: 0, roughness: 0.95 });
  const pw = positionWorld;
  const cell = T.mx_worley_noise_float(pw.xz.mul(3.2));
  const piece = smoothstep(0.08, 0.32, cell);
  const tone = T.mx_noise_float(pw.mul(0.6)).mul(0.2).add(0.8);
  const c = mix(vec3(0.16, 0.15, 0.12), vec3(0.62, 0.58, 0.5).mul(tone), piece);
  m.colorNode = vec4(c, 1);
  return solid(m);
}

/* ---------------------------------------------------------------- building in logs */
type Log = { x: number; y: number; z: number; len: number; r: number; ang: number };
/** Lay a wall of basalt from (x0, z0) to (x1, z1) in the plan, from `y0` to `y1`, `thick`
    through: courses of stretchers along it and headers across it in turn; `sweep` lifts its ends
    (the upswept corners) by up to that many courses. Returns the logs and a core to fill behind. */
function wallRun(x0: number, z0: number, x1: number, z1: number, y0: number, y1: number, thick: number, R: () => number, sweep = 0): { logs: Log[]; core: THREE.Matrix4 } {
  const logs: Log[] = [];
  const dx = x1 - x0, dz = z1 - z0, L = Math.hypot(dx, dz), ang = Math.atan2(-dz, dx);
  const ux = dx / L, uz = dz / L, nx = -uz, nz = ux;
  const C = 0.44; // a course
  let course = 0;
  for (let y = y0 + C / 2; ; y += C, course++) {
    // the ends rise higher than the middle (Nandauwas' corners)
    const lift = (s: number) => (sweep > 0 ? Math.pow(Math.max(Math.abs(s / L - 0.5) * 2 - 0.55, 0) / 0.45, 1.6) * sweep * C : 0);
    if (y > y1 + sweep * C) break;
    if (course % 2 === 0) {
      // stretchers: two or three rows through the wall, each row of long logs staggered
      const rows = Math.max(2, Math.round(thick / 0.8));
      for (let r = 0; r < rows; r++) {
        const off = (r + 0.5) / rows - 0.5;
        let s = -R() * 1.6;
        while (s < L) {
          const len = 2.6 + R() * 2.8, mid = Math.min(L, s + len / 2);
          const sL = Math.max(0, s), sR = Math.min(L, s + len);
          if (y <= y1 || lift(mid) > y - y1) {
            const c = (sL + sR) / 2;
            logs.push({ x: x0 + ux * c + nx * off * thick, y: y + (R() - 0.5) * 0.05, z: z0 + uz * c + nz * off * thick, len: sR - sL + 0.1, r: 0.17 + R() * 0.06, ang });
          }
          s += len + 0.05;
        }
      }
    } else {
      // headers: across the wall, their ends standing out a little each side
      for (let s = 0.35 + R() * 0.3; s < L - 0.2; s += 0.78 + R() * 0.25) {
        if (y > y1 && lift(s) < y - y1) continue;
        logs.push({ x: x0 + ux * s, y: y + (R() - 0.5) * 0.06, z: z0 + uz * s, len: thick + 0.35 + R() * 0.3, r: 0.17 + R() * 0.07, ang: ang + Math.PI / 2 + (R() - 0.5) * 0.08 });
      }
    }
  }
  const core = new THREE.Matrix4().compose(new V3(x0 + dx / 2, (y0 + y1) / 2, z0 + dz / 2), new THREE.Quaternion().setFromAxisAngle(new V3(0, 1, 0), ang), new V3(L, y1 - y0, thick * 0.7));
  return { logs, core };
}
/** The four sides of a rectangle, `gap` left open (2.4 m) in the middle of one side. */
function ring(cx: number, cz: number, w: number, d: number, gap: string | null): [number, number, number, number][] {
  const x0 = cx - w / 2, x1 = cx + w / 2, z0 = cz - d / 2, z1 = cz + d / 2, g = 1.2;
  const out: [number, number, number, number][] = [];
  const side = (a: [number, number], b: [number, number], open: boolean) => {
    if (!open) return out.push([a[0], a[1], b[0], b[1]]);
    const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2, L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const ux = (b[0] - a[0]) / L, uz = (b[1] - a[1]) / L;
    out.push([a[0], a[1], mx - ux * g, mz - uz * g], [mx + ux * g, mz + uz * g, b[0], b[1]]);
  };
  side([x0, z0], [x1, z0], gap === "s");
  side([x1, z0], [x1, z1], gap === "e");
  side([x1, z1], [x0, z1], gap === "n");
  side([x0, z1], [x0, z0], gap === "w");
  return out;
}

/* ---------------------------------------------------------------- mangroves */
/** A mangrove at the foot of a wall: a short leaning trunk on prop roots arching down into the
    water, a low dense crown (round and soft, as the world's living things are). */
function mangrove(R: () => number): { wood: THREE.BufferGeometry; leaf: THREE.BufferGeometry } {
  const wood: THREE.BufferGeometry[] = [];
  const tube = (pts: THREE.Vector3[], r0: number, r1: number) => {
    const curve = new THREE.CatmullRomCurve3(pts);
    const g = new THREE.TubeGeometry(curve, 10, 1, 5, false);
    const p = g.attributes.position as THREE.BufferAttribute, nrm = g.attributes.normal as THREE.BufferAttribute;
    // taper: move each ring toward its centre line
    const c = new V3();
    for (let i = 0; i < p.count; i++) {
      const ring = Math.floor(i / 6), u = ring / 10;
      curve.getPointAt(Math.min(1, u), c);
      const r = r0 + (r1 - r0) * u;
      p.setXYZ(i, c.x + nrm.getX(i) * r, c.y + nrm.getY(i) * r, c.z + nrm.getZ(i) * r);
    }
    g.deleteAttribute("uv");
    wood.push(g);
  };
  const lean = new V3((R() - 0.5) * 0.8, 0, (R() - 0.5) * 0.8);
  const crown = new V3(lean.x, 3.4 + R(), lean.z);
  tube([new V3(0, 0.6, 0), new V3(lean.x * 0.4, 1.8, lean.z * 0.4), crown], 0.16, 0.07);
  const roots = 6 + Math.floor(R() * 3);
  for (let i = 0; i < roots; i++) {
    const a = (i / roots) * Math.PI * 2 + R() * 0.4, out = 1.2 + R() * 0.9;
    tube([new V3(0, 1.2 + R() * 0.6, 0), new V3(Math.cos(a) * out * 0.5, 1.5, Math.sin(a) * out * 0.5), new V3(Math.cos(a) * out, -0.9, Math.sin(a) * out)], 0.06, 0.035);
  }
  const leaves: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 6; i++) {
    const g = new THREE.IcosahedronGeometry(0.9 + R() * 0.5, 2);
    g.scale(1.2, 0.7, 1.2);
    g.translate(crown.x + (R() - 0.5) * 2, crown.y + (R() - 0.3) * 0.8, crown.z + (R() - 0.5) * 2);
    g.deleteAttribute("uv");
    leaves.push(g);
  }
  return { wood: mergeGeometries(wood), leaf: mergeGeometries(leaves) };
}

/* ---------------------------------------------------------------- the area */
export class NanMadol {
  readonly group = new THREE.Group();
  readonly live = new THREE.Group();
  readonly solids: Collider[] = [];
  readonly loaded: Promise<void>;
  readonly track = "NAN-MADOL";
  readonly radius = 62;
  /** How near the surf is (0–1), for its sound. */
  surf = 0;
  private uT = uniform(0);
  private uTide = uniform(0);
  private uMist = uniform(1);
  private keepers: Keeper[] = [];
  private fish: Swimmers[] = [];
  private told = false;
  private visit = -1;

  constructor(phone: boolean) {
    const R = rng(8821);
    this.group.position.set(NM.x, 0, NM.z);
    this.group.rotation.y = NM.face;
    const toW = (lx: number, lz: number) => nanMadolAt(lx, lz);
    const logs: Log[] = [];
    const cores: THREE.Matrix4[] = [];
    const rubble: THREE.BufferGeometry[] = [];
    const tops: { x: number; z: number; w: number; d: number; y: number }[] = [];
    const solid = (x0: number, z0: number, x1: number, z1: number, thick: number, top: number) => {
      const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2, L = Math.hypot(x1 - x0, z1 - z0);
      const [wx, wz] = toW(mx, mz);
      solidBox(wx, wz, L / 2 + 0.1, thick / 2 + 0.15, Math.atan2(-(z1 - z0), x1 - x0) + NM.face, top, this.solids);
    };
    const build = (r: ReturnType<typeof wallRun>) => {
      logs.push(...r.logs);
      cores.push(r.core);
    };
    for (const is of ISLETS) {
      // the platform: a retaining wall of logs round it from the lagoon floor, rubble on top
      for (const [x0, z0, x1, z1] of ring(is.x, is.z, is.w, is.d, null)) build(wallRun(x0, z0, x1, z1, FL - 0.2, is.top, 1.6, R));
      const g = new THREE.BoxGeometry(is.w - 0.6, 0.3, is.d - 0.6);
      g.translate(is.x, is.top - 0.13, is.z);
      rubble.push(g);
      tops.push({ x: is.x, z: is.z, w: is.w, d: is.d, y: is.top + 0.02 });
      // steps up from the water, on the side facing the lagoon's middle (two blocks of logs)
      const sx = Math.abs(is.x) > 4 ? -Math.sign(is.x) : 0, sz = sx === 0 ? -1 : 0;
      for (const [k, y] of [[1.0, FL + 0.55], [2.0, FL]] as const) {
        const cx = is.x + sx * (is.w / 2 + k * 0.9 - 0.35), cz = is.z + sz * (is.d / 2 + k * 0.9 - 0.35);
        const w = sx ? 1.0 : 3.2, d = sx ? 3.2 : 1.0;
        build(wallRun(cx - w / 2 + (sx ? 0.5 : 0), cz - d / 2 + (sz ? 0.5 : 0), cx + w / 2 - (sx ? 0.5 : 0), cz + d / 2 - (sz ? 0.5 : 0), FL - 0.2, y + 0.42 * (k === 1 ? 1 : 0.5), sx ? 3.2 : 1.0, R));
        tops.push({ x: cx, z: cz, w, d, y: k === 1 ? FL + 0.75 : FL + 0.25 });
      }
      // the enclosure on top
      if (is.wall) {
        const t = is.id === "mortuary" ? 3.2 : 1.3, sw = is.id === "mortuary" ? 4 : 0;
        for (const [x0, z0, x1, z1] of ring(is.x, is.z, is.w - t, is.d - t, is.wall.gap)) {
          build(wallRun(x0, z0, x1, z1, is.top, is.top + is.wall.h, t, R, sw));
          solid(x0, z0, x1, z1, t, is.top + is.wall.h + sw * 0.44);
        }
      }
      if (is.inner) {
        for (const [x0, z0, x1, z1] of ring(is.x, is.z + 2, is.inner.w, is.inner.d, is.inner.gap)) {
          build(wallRun(x0, z0, x1, z1, is.top, is.top + is.inner.h, 1.8, R, 2));
          solid(x0, z0, x1, z1, 1.8, is.top + is.inner.h + 1);
        }
        // the tomb in the inner court: a crypt of logs, roofed with logs
        const tx = is.x, tz = is.z + 4;
        for (const [x0, z0, x1, z1] of ring(tx, tz, 3.6, 2.6, null)) build(wallRun(x0, z0, x1, z1, is.top, is.top + 1.1, 0.5, R));
        for (let i = 0; i < 7; i++) logs.push({ x: tx - 1.6 + i * 0.53, y: is.top + 1.32, z: tz, len: 3.3, r: 0.22, ang: Math.PI / 2 });
        solid(tx - 1.8, tz, tx + 1.8, tz, 2.8, is.top + 1.6);
      }
      // house platforms: low basalt plinths
      for (let h = 0; h < (is.houses ?? 0); h++) {
        const hx = is.x + (R() - 0.5) * (is.w - 6), hz = is.z + (R() - 0.5) * (is.d - 6);
        for (const [x0, z0, x1, z1] of ring(hx, hz, 4, 3.2, null)) build(wallRun(x0, z0, x1, z1, is.top, is.top + 0.5, 0.45, R));
        const g2 = new THREE.BoxGeometry(3.5, 0.2, 2.7);
        g2.translate(hx, is.top + 0.48, hz);
        rubble.push(g2);
        tops.push({ x: hx, z: hz, w: 4, d: 3.2, y: is.top + 0.6 });
      }
    }
    // the seawall: high, thick, breaking the open water
    build(wallRun(-SEAWALL.half, SEAWALL.z, SEAWALL.half, SEAWALL.z, FL - 0.6, SEAWALL.h, SEAWALL.thick, R, 1));
    solid(-SEAWALL.half, SEAWALL.z, SEAWALL.half, SEAWALL.z, SEAWALL.thick, SEAWALL.h + 0.5);
    tops.push({ x: 0, z: SEAWALL.z, w: SEAWALL.half * 2, d: SEAWALL.thick - 0.4, y: SEAWALL.h + 0.2 });
    // the canoe landing: mooring stones standing in the water off islet e
    const e = ISLETS[5];
    for (let i = 0; i < 4; i++) logs.push({ x: e.x - 6 + i * 4, y: FL + 0.7, z: e.z - e.d / 2 - 2.4, len: 1.5, r: 0.24, ang: 0 });
    // offering stones on the mortuary's platform before its gate
    const m0 = ISLETS[0];
    for (let i = 0; i < 3; i++) logs.push({ x: m0.x - 2 + i * 2, y: m0.top + 0.25, z: m0.z - m0.d / 2 + 3.5, len: 0.9, r: 0.26, ang: R() * 3 });
    // all the logs in one instanced draw
    const geo = columnGeometry();
    const logMesh = new THREE.InstancedMesh(geo, basaltMaterial(), logs.length);
    const q = new THREE.Quaternion(), e3 = new THREE.Euler(), mtx = new THREE.Matrix4(), col = new THREE.Color();
    logs.forEach((l, i) => {
      q.setFromEuler(e3.set(R() * Math.PI, l.ang, (R() - 0.5) * 0.04, "YXZ"));
      mtx.compose(new V3(l.x, l.y, l.z), q, new V3(l.len, l.r * 2, l.r * 2));
      logMesh.setMatrixAt(i, mtx);
      const k = 0.75 + R() * 0.5;
      logMesh.setColorAt(i, col.setRGB(k, k * (0.96 + R() * 0.06), k * (0.97 + R() * 0.08)));
    });
    logMesh.castShadow = logMesh.receiveShadow = true;
    // the walls' cores, behind the logs, so no wall is seen through
    const coreGeo = mergeGeometries(cores.map((m) => new THREE.BoxGeometry(1, 1, 1).applyMatrix4(m).toNonIndexed()).map((g) => {
      g.deleteAttribute("uv");
      return g;
    }));
    const coreMesh = new THREE.Mesh(coreGeo, new THREE.MeshStandardNodeMaterial({ color: new THREE.Color(0.035, 0.035, 0.04), roughness: 1 }));
    const fill = new THREE.Mesh(mergeGeometries(rubble.map((g) => {
      const x = g.toNonIndexed();
      x.deleteAttribute("uv");
      return x;
    })), rubbleMaterial());
    fill.receiveShadow = true;
    this.group.add(logMesh, coreMesh, fill);
    // walk on the islets, their steps and the seawall
    standHooks.push((wx, wz) => {
      const lx0 = wx - NM.x, lz0 = wz - NM.z;
      if (lx0 * lx0 + lz0 * lz0 > 80 * 80) return -Infinity;
      const c = Math.cos(NM.face), s = Math.sin(NM.face);
      const lx = lx0 * c - lz0 * s, lz = lx0 * s + lz0 * c;
      let y = -Infinity;
      for (const t of tops) if (Math.abs(lx - t.x) < t.w / 2 && Math.abs(lz - t.z) < t.d / 2) y = Math.max(y, t.y);
      return y;
    });
    // the tidal pool in islet c's courtyard: still water holding the sky
    {
      const c = ISLETS[3];
      const g = new THREE.PlaneGeometry(c.w - 5, c.d - 5);
      g.rotateX(-Math.PI / 2);
      const pm = new THREE.MeshStandardNodeMaterial({ metalness: 0, roughness: 0.05 });
      const view = T.cameraPosition.sub(positionWorld).normalize();
      const fres = T.pow(float(1).sub(clamp(dot(view, vec3(0, 1, 0)), 0, 1)), 3);
      pm.colorNode = vec4(mix(vec3(0.02, 0.05, 0.05), fogUniforms.color.mul(1.4), fres.mul(0.85).add(0.1)), 1);
      const pool = new THREE.Mesh(g, pm);
      pool.position.set(c.x, c.top + 0.05, c.z);
      this.group.add(pool);
    }
    // the surf breaking white against the seawall's outer face
    {
      const g = new THREE.PlaneGeometry(SEAWALL.half * 2 + 6, 5, 64, 1);
      g.rotateX(-Math.PI / 2);
      g.translate(0, WATER_Y + 0.06, SEAWALL.z + SEAWALL.thick / 2 + 2.4);
      const fm = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, fog: true });
      const p = T.positionGeometry;
      const along = p.x, outz = p.z.sub(SEAWALL.z + SEAWALL.thick / 2);
      // sets of swells running along the wall, each breaking as it reaches it
      const swell = fract(this.uT.mul(0.11).sub(along.mul(0.004)).add(T.mx_noise_float(vec3(along.mul(0.05), 0, 1)).mul(0.4)));
      const breaking = smoothstep(0.0, 0.08, swell).mul(smoothstep(0.55, 0.12, swell));
      const reach = smoothstep(5, 0.2, outz.add(swell.mul(3)));
      const lace = T.mx_noise_float(vec3(along.mul(0.9), outz.mul(1.6), this.uT.mul(0.5))).mul(0.5).add(0.5);
      const a = breaking.mul(reach).mul(smoothstep(0.35, 0.75, lace)).mul(0.75);
      fm.colorNode = vec3(0.92, 0.93, 0.9);
      fm.opacityNode = a;
      const foam = new THREE.Mesh(g, fm);
      foam.renderOrder = 3;
      this.group.add(foam);
    }
    // the tide along the canals: faint streaks on the water drifting one way, then the other
    {
      const g = new THREE.PlaneGeometry(110, 92, 1, 1);
      g.rotateX(-Math.PI / 2);
      g.translate(0, WATER_Y + 0.025, 1);
      const tm = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
      const p = T.positionGeometry;
      // the flow runs along whichever way the canal does: the nearest islet edges decide
      const dir = vec2(this.uTide, float(0.35).mul(this.uTide));
      const q2 = p.xz.sub(dir.mul(this.uT.mul(0.6)));
      const streak = T.mx_noise_float(vec3(q2.x.mul(0.35), q2.y.mul(2.4), this.uT.mul(0.05)));
      const k = smoothstep(0.62, 0.9, streak.mul(0.5).add(0.5)).mul(0.07).mul(smoothstep(46, 30, length(p.xz)));
      // additive and fog-less (fog would lift the whole sheet into a pale slab): faded by hand
      // with distance, and gone when seen from high above
      const far = float(1).sub(smoothstep(40, 140, length(T.positionWorld.sub(T.cameraPosition))));
      const low = float(1).sub(smoothstep(12, 40, T.cameraPosition.y));
      tm.colorNode = vec4(vec3(0.9, 0.86, 0.8).mul(k).mul(far).mul(low), 1);
      this.group.add(new THREE.Mesh(g, tm));
    }
    // mist lying on the canals, thinning as the visit goes on
    this.group.add(this.mist(phone));
    // palms leaning over the water (the world's own), mangroves at the walls' feet
    {
      const pm = palmMaterial(this.uT);
      const spots: [number, number, number][] = [[-30, 30, 0.8], [-27, 35, -0.6], [31, 31, 0.5], [28, 36, -0.9], [-22, 6, 1.6], [22, -14, -2.0], [-21, -15, 2.4], [6, -10, 3.4], [-31, -4, 0.2]];
      const geos = [palmGeometry(0.6), palmGeometry(1.6)];
      for (const [x, z, a] of spots) {
        const is = ISLETS.find((i) => Math.abs(x - i.x) < i.w / 2 && Math.abs(z - i.z) < i.d / 2);
        const mesh = new THREE.Mesh(geos[Math.floor(R() * 2)], pm);
        mesh.position.set(x, (is?.top ?? 0) + 0.1, z);
        mesh.rotation.y = a;
        mesh.scale.setScalar(0.9 + R() * 0.35);
        mesh.castShadow = true;
        this.group.add(mesh);
        const [wx, wz] = toW(x, z);
        solidBox(wx, wz, 0.3, 0.3, 0, (is?.top ?? 0) + 5, this.solids);
      }
      const woodM = new THREE.MeshStandardNodeMaterial({ color: new THREE.Color(0.2, 0.15, 0.11), roughness: 0.9 });
      const leafM = new THREE.MeshStandardNodeMaterial({ roughness: 0.8 });
      leafM.colorNode = vec4(mix(vec3(0.05, 0.12, 0.05), vec3(0.16, 0.26, 0.1), T.mx_noise_float(positionWorld.mul(3.1)).mul(0.5).add(0.5)), 1);
      const mspots: [number, number][] = [[-19, 3], [-33.5, 16], [19, 16], [33.5, -4], [-12, -14], [12.5, 9], [-36, 28], [36, 37]];
      for (const [x, z] of mspots) {
        const t = mangrove(R);
        const wood = new THREE.Mesh(t.wood, woodM), leaf = new THREE.Mesh(t.leaf, leafM);
        for (const o of [wood, leaf]) {
          o.position.set(x, FL + 0.1, z);
          o.rotation.y = R() * 6.28;
          o.castShadow = true;
          this.group.add(o);
        }
      }
    }
    // the watcher on the seawall, the keeper in the mortuary's inner court
    {
      const [x, z] = toW(4, SEAWALL.z);
      this.keepers.push(new Keeper({ recipe: "NAN_MADOL_WATCHER", tint: [0.82, 0.92, 1.0], x, z, y: SEAWALL.h + 0.2, face: NM.face + Math.PI, pose: "stand" }));
      const m = ISLETS[0];
      const [kx, kz] = toW(m.x + 3.2, m.z + 0.5);
      this.keepers.push(new Keeper({ recipe: "NAN_MADOL_WATCHER", tint: [1.0, 0.9, 0.78], x: kx, z: kz, y: m.top, face: NM.face - Math.PI / 2, pose: "stand" }));
      for (const k of this.keepers) this.live.add(k.root);
    }
    // fish in the clear canals
    const schools = ([["fish1", 10, 0.3, -13, 0, 6, 16], ["fish2", 8, 0.35, 13, 0, 6, 16], ["fish3", 7, 0.32, 0, 6, 14, 3.5]] as const).map(([file, n, len, cx, cz, rx, rz]) => {
      const [wx, wz] = toW(cx, cz);
      return { file, length: len, tint: [0.75, 0.85, 0.9] as [number, number, number], count: phone ? Math.ceil(n * 0.6) : n, cx: wx, cz: wz, rx, rz, y: 0.22, top: WATER_Y - 0.28, bob: 0.08, speed: 0.08, spread: 1.2 };
    });
    const fish = new Swimmers(schools);
    this.fish.push(fish);
    this.live.add(fish.group);
    this.loaded = Promise.all(this.keepers.map((k) => k.loaded)).then(() => undefined);
    void heightAt;
  }

  /** Mist on the water: soft points low over the canals, drifting with the tide. */
  private mist(phone: boolean): THREE.Sprite {
    const n = phone ? 160 : 260;
    const mat = softPoints();
    mat.blending = THREE.NormalBlending;
    const c = spriteCloud(n, { aK: 4 }, mat);
    const a = c.attrs.aK.array as Float32Array;
    const R = rng(31);
    for (let i = 0; i < n; i++) a.set([R(), R(), R(), R()], i * 4);
    const K = c.nodes.aK, uT = this.uT;
    const drift = this.uTide.mul(uT.mul(0.15)).add(K.y.mul(90));
    const p = vec3(fract(drift.div(100)).sub(0.5).mul(100), float(WATER_Y + 0.4).add(K.z.mul(1.6)), K.x.sub(0.5).mul(88));
    mat.positionNode = p;
    const wp = T.modelWorldMatrix.mul(vec4(p, 1)).xyz;
    mat.sizeNode = clamp(gpuUniforms.px.mul(K.w.mul(4).add(3)).div(max(viewDepth(wp), 0.4)), float(1), 900);
    const soft = softDot(pointR()).mul(1.22);
    mat.colorNode = vec4(vec3(0.95, 0.9, 0.86), 1);
    mat.opacityNode = soft.mul(soft).mul(0.07).mul(this.uMist).mul(outOfTheWay(wp)).mul(smoothstep(1.5, 8, viewDepth(wp)))
      // mist lies low: from high above its puffs would read as blobs
      .mul(float(1).sub(smoothstep(10, 30, T.cameraPosition.y.sub(WATER_Y))));
    return c.sprite;
  }

  /** Each frame while the lagoon is near. `speak` begins the telling and says whether it could. */
  update(dt: number, t: number, visitor: THREE.Vector3, reduced: boolean, speak: (track: string) => boolean): void {
    const d = Math.hypot(visitor.x - NM.x, visitor.z - NM.z);
    this.group.visible = this.live.visible = d < 520;
    this.surf = Math.max(0, 1 - Math.max(0, d - 40) / 260);
    if (!this.group.visible) return;
    this.uT.value = reduced ? t * 0.5 : t;
    // the tide breathes in and out, turning about every three minutes
    this.uTide.value = Math.sin((t * Math.PI * 2) / 360);
    // mist lifts over the first minutes after you arrive
    if (d < 140 && this.visit < 0) this.visit = t;
    if (d > 300) this.visit = -1;
    this.uMist.value = this.visit < 0 ? 1 : Math.max(0.25, 1 - (t - this.visit) / 240);
    for (const k of this.keepers) k.update(dt, t, visitor, reduced);
    for (const f of this.fish) f.update(dt, t);
    if (!this.told && d < this.radius && visitor.y < WATER_Y + 12 && speak(this.track)) this.told = true;
    void cos;
    void sin;
    void normalWorld;
    void uv;
  }
}
