/* The wilder places (Samuel: "caves, mountains with snow, palm trees, tall grass"):
   - Palms on the beaches, where the sand meets the water: real coconut palms. A leaning, gently
     swollen grey trunk scarred with old leaf rings; a crown of feathery fronds, each a midrib with
     dozens of narrow folded leaflets drooping more toward its tip; a few dead fronds hanging brown
     against the trunk; a cluster of coconuts. Lit by the moon, they sway. (`palmGeometry` also
     grows the date palms of the Nile and the temple's garden.)
   - Caves in the steep hillsides (placed in terrain.ts): a hollow of etched stone running into
     the hill, crystals glowing at the back, glow-worm lights on the ceiling. The rock dissolves
     wherever it would hide the wanderer from the camera.
   (The tall grass grows in life.ts; the snowy mountains rise in terrain.ts.) */
import * as THREE from "three/webgpu";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { fogUniforms, outOfTheWay, T, worldPoints } from "../gpu/tsl";
import { surface } from "./textures";
import { crystalMaterial, prismGeometry } from "./creation";
import { etchedStone } from "./etching";
import type { LifeFrame } from "./life";
import { CAVES, colliders, type Collider, fbm, groundKind, heightAt, keptClear, LANDMARK_SITES, SPAWN, WATER_Y } from "./terrain";

const { attribute, cameraPosition, cameraViewMatrix, cos, cross, dot, float, floor, fract, Fn, If, max, mix, normalize, positionGeometry, positionLocal, positionWorld, pow, sin, smoothstep, abs, screenCoordinate, step, texture, uniform, vec2, vec3, vec4 } = T;
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

export type PalmKind = "coconut" | "date";

/** Where a frond's midrib runs: out from the crown at its elevation `e` and bending down under its
    own weight (`g`), as a real frond does. */
function frondPoint(crown: THREE.Vector3, dir: THREE.Vector3, e: number, g: number, len: number, u: number, out: THREE.Vector3): THREE.Vector3 {
  return out
    .copy(crown)
    .addScaledVector(dir, len * u * Math.cos(e))
    .add(new V(0, len * (u * Math.sin(e) - g * u * u), 0));
}

/** One palm. A coconut palm (the beaches, Nan Madol): ~6.5 m, leaning by `lean` metres at the
    crown, a smooth grey trunk ringed with old leaf scars, long fronds arching over, coconuts. A date
    palm (the Nile, the temple's garden): ~8 m and nearly straight, its trunk clad in the stubs of old
    leaf bases, a rounder crown of stiffer grey-green fronds (the young ones reaching up, the old
    arching out), its leaflets folded and set in two planes, bunches of dates under the crown.
    Parts (`aPart`): 0 coconut trunk, 1 leaflet, 2 coconut, 3 midrib, 4 dead frond, 5 far frond
    (cut into leaflets by the shader), 6 date trunk, 7 dates and their stalks. `aU` runs along the
    trunk or the frond; `aX` around the trunk, out along a leaflet, or across a far frond. */
export function palmGeometry(lean: number, kind: PalmKind = "coconut"): THREE.BufferGeometry {
  const date = kind === "date";
  const H = date ? 7.8 : 6.4, L = date ? lean * 0.3 : lean;
  const trunk = new THREE.CatmullRomCurve3([new V(0, -0.3, 0), new V(L * 0.15, H * 0.3, 0), new V(L * 0.62, H * 0.7, 0), new V(L, H, 0)]);
  // a swollen foot narrowing to the crown (a date palm's stays thick: its old leaf bases clad it)
  const rT = date ? (u: number) => 0.22 + 0.12 * Math.max(0, 1 - u * 8) + 0.015 * Math.sin(u * 7) : (u: number) => 0.17 * (1 - u * 0.32) + 0.16 * Math.max(0, 1 - u * 7) + 0.015 * Math.sin(u * 9);
  const parts = [retag(tube(trunk, date ? 36 : 30, date ? 14 : 12, rT, (u) => u * u * 0.3), date ? 6 : 0)];
  const crown = trunk.getPoint(1);
  const up = new V(0, 1, 0);
  // the crown's boot where the fronds spring from
  {
    const g = new THREE.SphereGeometry(date ? 0.36 : 0.24, 12, 8).scale(1, date ? 1.5 : 1.35, 1).translate(crown.x, crown.y + 0.05, crown.z);
    parts.push(tagGeo(g, date ? 6 : 0, 1, 0.5, 0.3));
  }
  const rnd = (k: number) => {
    const v = Math.sin(k * 91.7 + lean * 13.1 + (date ? 5.3 : 0)) * 43758.5453;
    return v - Math.floor(v);
  };
  const live = date ? 24 : 13, fronds = live + (date ? 5 : 3);
  const p = new V(), q = new V(), t = new V(), side = new V(), plane = new V(), d = new V(), acr = new V(), n = new V(), nE = new V();
  for (let k = 0; k < fronds; k++) {
    const dead = k >= live;
    const age = dead ? 1 : k / (live - 1); // the young reach up from the heart, the old arch out
    const a = k * 2.39996 + rnd(k) * 0.35;
    const dir = new V(Math.cos(a), 0, Math.sin(a));
    const e = dead ? -1.35 : date ? 1.2 - age * 1.05 + (rnd(k + 3) - 0.5) * 0.15 : k % 3 === 0 ? 0.55 : 0.18 + rnd(k + 3) * 0.3;
    const g = dead ? 0.05 : date ? 0.16 + age * 0.3 : 0.5;
    const len = dead ? (date ? 2.4 : 1.9) : date ? 3.1 + rnd(k + 7) * 0.9 - (age < 0.12 ? 0.7 : 0) : 2.8 + rnd(k + 7) * 0.8;
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 16; i++) pts.push(frondPoint(crown, dir, e, g, len, i / 16, new V()));
    if (dead) for (const pt of pts) pt.addScaledVector(dir, 0.35); // hung against the trunk, not in it
    const rach = new THREE.CatmullRomCurve3(pts);
    parts.push(retag(tube(rach, 12, 4, (u) => (date ? 0.038 : 0.032) * (1 - u * 0.75), (u) => 0.3 + u * 0.9), dead ? 4 : 3));
    // the leaflets: narrow blades either side of the midrib, longest at the middle, each folded
    // along its length (its two halves turned to the light differently); a date palm's stiff and
    // set alternately up and down out of the frond's plane, a coconut's drooping more toward the tip
    const pos: number[] = [], nor: number[] = [], part: number[] = [], us: number[] = [], xs: number[] = [], sw: number[] = [], idx: number[] = [];
    const N = dead ? 16 : date ? 22 : 34;
    const seg = date || dead ? 2 : 3;
    for (let i = 1; i <= N; i++) {
      const u = (date ? 0.14 : 0.06) + (i / N) * (date ? 0.84 : 0.92);
      rach.getPoint(u, p);
      rach.getTangent(u, t);
      side.crossVectors(t, up);
      if (side.lengthSq() < 1e-4) side.set(-dir.z, 0, dir.x);
      side.normalize();
      plane.crossVectors(side, t).normalize();
      if (plane.y < 0) plane.negate();
      for (const sgn of [-1, 1]) {
        const j = rnd(k * 97 + i * 7 + (sgn > 0 ? 1 : 0));
        if (date && !dead) {
          const el = ((i + (sgn > 0 ? 1 : 0)) % 2 ? 0.55 : -0.2) + (j - 0.5) * 0.3;
          d.copy(side).multiplyScalar(sgn * Math.cos(el)).addScaledVector(plane, Math.sin(el)).addScaledVector(t, 0.75).normalize();
        } else {
          const droop = dead ? 1.35 : 0.25 + u * 0.85 + (j - 0.5) * 0.35;
          d.copy(side).multiplyScalar(sgn * Math.cos(droop)).addScaledVector(up, -Math.sin(droop)).addScaledVector(t, 0.45).normalize();
        }
        const Lf = (dead ? 0.55 : date ? 0.68 : 0.95) * Math.sin(Math.PI * (0.12 + u * 0.8)) * (0.85 + j * 0.3);
        const W = dead ? 0.04 : date ? 0.032 : 0.055;
        acr.crossVectors(d, plane).normalize(); // across the blade
        n.crossVectors(acr, d).normalize();
        if (n.y < 0) n.negate();
        const bow = date ? 0.015 : 0.06;
        const base = pos.length / 3;
        for (let s = 0; s <= seg; s++) {
          const f = s / seg, w = W * (1 - f * 0.85);
          q.copy(p).addScaledVector(d, Lf * f).addScaledVector(up, -bow * Math.sin(f * Math.PI) * Lf);
          for (const e2 of [-1, 1]) {
            // the edges stand a little above the crease, and their normals lean in toward it
            const v = q.clone().addScaledVector(acr, e2 * w).addScaledVector(n, w * 0.45);
            nE.copy(n).addScaledVector(acr, -e2 * 0.7).normalize();
            pos.push(v.x, v.y, v.z);
            nor.push(nE.x, nE.y, nE.z);
            part.push(dead ? 4 : 1);
            us.push(u);
            xs.push(f);
            sw.push(0.3 + u * 0.9 + f * 0.25);
          }
        }
        for (let s = 0; s < seg; s++) {
          const a0 = base + s * 2;
          idx.push(a0, a0 + 2, a0 + 1, a0 + 1, a0 + 2, a0 + 3);
        }
      }
    }
    parts.push(tagged(pos, nor, part, us, xs, sw, idx));
  }
  if (date) {
    // bunches of dates on their stalks, arching out of the crown under the fronds and hanging
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + 0.7 + rnd(k + 50) * 0.5;
      const dir = new V(Math.cos(a), 0, Math.sin(a));
      const end = crown.clone().addScaledVector(dir, 0.75).add(new V(0, -0.85, 0));
      const stalk = new THREE.CatmullRomCurve3([crown.clone().addScaledVector(dir, 0.2).add(new V(0, -0.2, 0)), crown.clone().addScaledVector(dir, 0.6).add(new V(0, -0.15, 0)), end]);
      parts.push(retag(tube(stalk, 6, 4, () => 0.03, () => 0.3), 7));
      const b = new THREE.IcosahedronGeometry(0.2, 2).scale(1, 1.55, 1);
      const bp = b.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < bp.count; i++) {
        q.fromBufferAttribute(bp, i);
        const lump = 1 + 0.16 * Math.sin(q.x * 41 + k) * Math.sin(q.y * 37) * Math.sin(q.z * 43);
        bp.setXYZ(i, q.x * lump, q.y * lump, q.z * lump);
      }
      b.computeVertexNormals();
      b.translate(end.x, end.y - 0.22, end.z);
      parts.push(tagGeo(b, 7, 1, 0, 0.3));
    }
  } else {
    // coconuts clustered under the crown
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2 + 0.4, r = 0.2 + (k % 2) * 0.06;
      const g = new THREE.SphereGeometry(0.12, 10, 8).scale(1, 1.12, 1).translate(crown.x + Math.cos(a) * r, crown.y - 0.3 - (k % 3) * 0.08, crown.z + Math.sin(a) * r);
      parts.push(tagGeo(g, 2, 1, 0, 0.3));
    }
  }
  return mergeGeometries(parts)!;
}

/** The same palm drawn cheaply, for palms seen from afar (a few hundred triangles): a plain trunk
    and its fronds, each one blade folded along its midrib, its outline cut into leaflets in the
    shader (`aPart` 5, `aX` across the blade). Its normals are the crown's round, so from afar it is
    lit as a crown is, not as a few flat boards. Tagged as `palmGeometry` is. */
export function palmFarGeometry(lean: number, kind: PalmKind = "coconut"): THREE.BufferGeometry {
  const date = kind === "date";
  const H = date ? 7.8 : 6.4, L = date ? lean * 0.3 : lean;
  const trunk = new THREE.CatmullRomCurve3([new V(0, -0.3, 0), new V(L * 0.15, H * 0.3, 0), new V(L * 0.62, H * 0.7, 0), new V(L, H, 0)]);
  const parts = [retag(tube(trunk, 6, 5, (u) => (date ? 0.24 : 0.19 * (1 - u * 0.32)) + 0.1 * Math.max(0, 1 - u * 5), (u) => u * u * 0.3), date ? 6 : 0)];
  const crown = trunk.getPoint(1);
  const heart = crown.clone().add(new V(0, -0.5, 0));
  const pos: number[] = [], nor: number[] = [], part: number[] = [], us: number[] = [], xs: number[] = [], sw: number[] = [], idx: number[] = [];
  const count = date ? 16 : 12;
  const c = new V(), t = new V(), side = new V(), plane = new V(), v = new V(), nn = new V();
  for (let k = 0; k < count; k++) {
    const age = k / (count - 1);
    const a = k * 2.39996 + lean;
    const dir = new V(Math.cos(a), 0, Math.sin(a));
    const e = date ? 1.15 - age * 1.0 : k % 3 === 0 ? 0.55 : 0.22;
    const g = date ? 0.16 + age * 0.3 : 0.5;
    const len = date ? 3.4 : 3 + (k % 4) * 0.2;
    side.set(-dir.z, 0, dir.x);
    const base = pos.length / 3;
    const seg = 5;
    for (let s = 0; s <= seg; s++) {
      const u = s / seg;
      frondPoint(crown, dir, e, g, len, u, c);
      frondPoint(crown, dir, e, g, len, Math.min(1, u + 0.05), t).sub(frondPoint(crown, dir, e, g, len, Math.max(0, u - 0.05), v)).normalize();
      plane.crossVectors(side, t).normalize();
      if (plane.y < 0) plane.negate();
      const w = (date ? 0.62 : 0.78) * Math.sin(Math.PI * (0.08 + u * 0.86));
      for (const [ax, e2] of [[0, -1], [0.5, 0], [1, 1]] as const) {
        // folded: the two halves of the frond rise a little either side of the midrib
        v.copy(c).addScaledVector(side, e2 * w).addScaledVector(plane, Math.abs(e2) * w * (date ? 0.45 : 0.2));
        nn.copy(v).sub(heart).normalize().addScaledVector(plane, 0.6).normalize();
        pos.push(v.x, v.y, v.z);
        nor.push(nn.x, nn.y, nn.z);
        part.push(5);
        us.push(u);
        xs.push(ax);
        sw.push(0.3 + u * 0.9);
      }
    }
    for (let s = 0; s < seg; s++) {
      const a0 = base + s * 3;
      for (const o of [0, 1]) idx.push(a0 + o, a0 + 3 + o, a0 + 1 + o, a0 + 1 + o, a0 + 3 + o, a0 + 4 + o);
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
  const m = new THREE.MeshStandardNodeMaterial({ side: THREE.DoubleSide, roughness: 0.85, metalness: 0, alphaTest: 0.5 });
  const aSway = attribute("aSway", "float");
  // the wind: slow, and strongest at the fronds' tips (positionLocal here is the placed palm);
  // the leaflets flutter a little on their own
  const ph = positionLocal.x.mul(0.07).add(positionLocal.z.mul(0.05));
  const flutter = sin(uT.mul(3.1).add(attribute("aU", "float").mul(23)).add(ph)).mul(attribute("aX", "float")).mul(0.035);
  m.positionNode = positionLocal.add(vec3(sin(uT.mul(0.9).add(ph)), 0, cos(uT.mul(0.7).add(ph.mul(1.3)))).mul(aSway).mul(0.14)).add(vec3(0, flutter, 0));
  const part = attribute("aPart", "float"), u = attribute("aU", "float"), x = attribute("aX", "float");
  const is = (k: number) => abs(part.sub(k)).lessThan(0.5);
  const leafy = is(1).or(is(5));
  // a date palm's trunk: diamonds of old leaf bases, row over row, each stub standing out more
  // toward its upper edge, where it was cut, and fibre dark in the gaps between
  const cell = vec2(x.mul(9), u.mul(46)).toVar();
  const row = floor(cell.y);
  const cx = fract(cell.x.add(row.mul(0.5))).sub(0.5), cy = fract(cell.y);
  const stub = smoothstep(0.5, 0.18, abs(cx)).mul(smoothstep(0.0, 0.35, cy));
  const lip = smoothstep(0.72, 0.95, cy).mul(stub);
  m.colorNode = Fn(() => {
    const bk = texture(bark.diff, vec2(x.mul(3), u.mul(16))).rgb;
    const grain = bk.div(vec3(0.053, 0.034, 0.02)).clamp(0.4, 1.8); // the scan's own grain about its mean
    // the coconut's trunk: grey, scarred in rings where old fronds fell, darker at the foot
    const ring = smoothstep(0.1, 0.0, abs(fract(u.mul(40)).sub(0.5)).sub(0.38));
    const coco = mix(vec3(0.05, 0.045, 0.038), vec3(0.075, 0.068, 0.058), grain.g.mul(0.5)).mul(float(1).sub(ring.mul(0.45))).mul(mix(0.65, 1, smoothstep(0, 0.15, u)));
    // the date's: warm brown fibre, the stubs' cut lips paler, the gaps between them dark
    const fibre = vec3(0.06, 0.042, 0.028).mul(grain);
    const datew = mix(mix(vec3(0.018, 0.013, 0.009), fibre, stub), vec3(0.12, 0.085, 0.055), lip).mul(mix(0.7, 1, smoothstep(0, 0.12, u)));
    // leaflets: deep green, yellower toward their tips and on the old outer fronds (seen from below
    // they read paler); a date palm's greyer
    const h = fract(sin(positionWorld.x.mul(12.9).add(positionWorld.z.mul(78.2))).mul(43758.5));
    const leaf = mix(vec3(0.035, 0.07, 0.03), vec3(0.11, 0.15, 0.055), x.mul(0.5).add(u.mul(0.35)).add(h.mul(0.15)));
    const rib = vec3(0.2, 0.18, 0.1);
    const nut = vec3(0.13, 0.1, 0.05);
    const dead = vec3(0.26, 0.19, 0.1).mul(h.mul(0.3).add(0.8));
    // dates: amber to brown, each fruit its own
    const fruit = mix(vec3(0.32, 0.12, 0.02), vec3(0.14, 0.05, 0.015), fract(sin(positionGeometry.x.mul(91).add(positionGeometry.y.mul(57)).add(positionGeometry.z.mul(73))).mul(4375.5)));
    const c = coco.toVar();
    If(is(6), () => {
      c.assign(datew);
    });
    If(leafy, () => {
      c.assign(leaf);
    });
    If(is(2), () => {
      c.assign(nut);
    });
    If(is(3), () => {
      c.assign(rib);
    });
    If(is(4), () => {
      c.assign(dead);
    });
    If(is(7), () => {
      c.assign(fruit);
    });
    return c;
  })();
  // the far fronds' outline, cut into leaflets slanting toward the tip: a feather, not a board.
  // Where the leaflets would be finer than a pixel the frond is simply narrower.
  const ac = abs(x.sub(0.5)).mul(2);
  const lf = u.mul(26).add(ac.mul(1.4));
  const comb = step(fract(lf), 0.45).max(step(ac, 0.08));
  const tipCut = step(ac, float(0.95).sub(fract(sin(floor(lf).mul(17.3)).mul(437.5)).mul(0.3)));
  const fine = smoothstep(0.35, 0.9, T.fwidth(lf));
  const keep = mix(comb.mul(tipCut), step(ac, 0.7), fine);
  m.opacityNode = T.select(is(5), keep, float(1));
  // which way each part faces: the date trunk's stubs tilt the light; the far fronds keep the
  // crown's round (seen from below they are still a crown, not the backs of boards)
  const upV = normalize(cameraViewMatrix.mul(vec4(0, 1, 0, 0)).xyz);
  const n0 = T.normalView;
  const along = normalize(upV.sub(n0.mul(dot(upV, n0))));
  const round = cross(n0, along);
  const bumped = normalize(n0.sub(along.mul(stub.mul(0.55).sub(lip.mul(0.9)))).add(round.mul(cx.mul(stub).mul(1.1))));
  const farN = n0.mul(T.faceDirection);
  m.normalNode = T.select(is(6), bumped, T.select(is(5), farN, n0));
  // the low sun or the moon behind a crown comes through its leaflets (small: never a glow)
  const view = normalize(positionWorld.sub(cameraPosition));
  const through = pow(max(dot(view, fogUniforms.glowDir), 0), 4);
  (m as unknown as { emissiveNode: unknown }).emissiveNode = T.select(leafy, fogUniforms.glow.mul(vec3(0.5, 0.75, 0.25)).mul(through).mul(0.16), vec3(0));
  // the leaflets' upper sides are a little glossy and catch the moon
  m.roughnessNode = T.select(leafy, float(0.62), T.select(is(7), float(0.45), float(0.88)));
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
