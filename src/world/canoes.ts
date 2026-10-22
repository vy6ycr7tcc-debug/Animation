/* Canoes (the owner: "add canoes across water bodies docked… auto cruising enabled by simply
   tapping on the canoe"). A dozen wooden canoes, each moored beside a small jetty on a shore where
   deep water opens out: the first on the lake by the shore where you wake, the rest round the
   world's lakes and rivers (the Nile among them). Tap one: the wanderer goes to it, steps in and
   sits, and the canoe cruises by itself, slowly, wandering over open water and turning from
   the shallows. The stick steers while it is held; tap the round button (or the canoe, or E) and
   it makes for the nearest shore, where you step out; it stays there, drawn up in the shallows.
   Built of the scanned weathered wood, varnished cedar for the hull. Nothing here is a site of
   the land: placing them moves nothing else. */
import * as THREE from "three/webgpu";
import { T } from "../gpu/tsl";
import { surface } from "./textures";
import { heightAt, KEEP_CLEAR, LANDMARK_SITES, SPAWN, WATER_Y, keptClear } from "./terrain";

const L = 4.6; // length
const B = 0.43; // half beam
const DRAFT = 0.03; // the hull's bottom below the water (it rides high: its floor stays dry)

let seed = 7;
const rnd = () => ((seed = (Math.imul(seed, 16807) + 11) % 2147483647), (seed & 0xffffff) / 0x1000000);

/** Wood: the scanned weathered timber, tinted and varnished or left grey. */
function wood(tint: THREE.Color, rough: number, scale = 1.3): THREE.MeshStandardNodeMaterial {
  const m = new THREE.MeshStandardNodeMaterial({ roughness: rough, metalness: 0, side: THREE.DoubleSide });
  const W = surface("wood");
  const uv = T.uv().div(scale);
  const d = T.texture(W.diff, uv), arm = T.texture(W.arm, uv);
  m.colorNode = T.vec4(d.rgb.mul(T.vec3(tint.r, tint.g, tint.b)).mul(T.mix(T.float(0.6), T.float(1), arm.r)), 1);
  m.roughnessNode = T.mix(T.float(rough), arm.g, 0.35);
  m.normalMap = W.nor;
  return m;
}

/** A canoe's hull: lofted from stations along its length, round in section, its ends rising. */
function hullGeometry(): THREE.BufferGeometry {
  const NU = 28, NV = 18;
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  for (let i = 0; i <= NU; i++) {
    const u = (i / NU) * 2 - 1;
    const b = B * Math.pow(Math.max(0, 1 - u * u), 0.78);
    const top = 0.36 + 0.22 * Math.pow(Math.abs(u), 3);
    const bot = 0.18 * Math.pow(Math.abs(u), 4);
    for (let j = 0; j <= NV; j++) {
      const phi = ((j / NV) * 2 - 1) * (Math.PI / 2);
      const sn = Math.sin(phi);
      const y = bot + (top - bot) * Math.pow(Math.abs(sn), 2.1);
      pos.push((u * L) / 2, y, b * sn);
      uv.push((u * L) / 2, phi * 0.55);
    }
  }
  for (let i = 0; i < NU; i++)
    for (let j = 0; j < NV; j++) {
      const a = i * (NV + 1) + j, b2 = a + NV + 1;
      idx.push(a, b2, a + 1, b2, b2 + 1, a + 1);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
/** The gunwales along the rim, the thwarts and seats across it, a paddle lying in it. */
function fittings(): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = [];
  const rim = (u: number) => ({ b: B * Math.pow(Math.max(0, 1 - u * u), 0.78), top: 0.36 + 0.22 * Math.pow(Math.abs(u), 3) });
  for (const side of [-1, 1])
    for (let i = 0; i < 24; i++) {
      const u0 = (i / 24) * 1.9 - 0.95, u1 = ((i + 1) / 24) * 1.9 - 0.95;
      const a = new THREE.Vector3((u0 * L) / 2, rim(u0).top + 0.01, side * rim(u0).b);
      const c = new THREE.Vector3((u1 * L) / 2, rim(u1).top + 0.01, side * rim(u1).b);
      const g = new THREE.BoxGeometry(0.035, 0.04, a.distanceTo(c) + 0.01);
      g.lookAt(c.clone().sub(a));
      g.translate((a.x + c.x) / 2, (a.y + c.y) / 2, (a.z + c.z) / 2);
      out.push(g);
    }
  for (const u of [-0.32, 0.05, 0.38]) {
    const r = rim(u);
    const g = new THREE.BoxGeometry(0.07, 0.03, r.b * 2);
    g.translate((u * L) / 2, r.top - 0.03, 0);
    out.push(g);
  }
  for (const u of [-0.66, 0.62]) {
    const r = rim(u);
    const g = new THREE.BoxGeometry(0.28, 0.025, r.b * 1.9);
    g.translate((u * L) / 2, 0.2, 0);
    out.push(g);
  }
  // floorboards along the bottom (the water never shows inside it)
  for (let k = -2; k <= 2; k++) {
    const g = new THREE.BoxGeometry(L * 0.74 - Math.abs(k) * 0.35, 0.02, 0.07);
    g.translate(0, 0.085, k * 0.085);
    out.push(g);
  }
  // the paddle, laid along the floor
  const shaft = new THREE.CylinderGeometry(0.016, 0.016, 1.05, 8);
  shaft.rotateZ(Math.PI / 2);
  shaft.translate(-0.15, 0.11, 0.12);
  out.push(shaft);
  const blade = new THREE.BoxGeometry(0.5, 0.012, 0.17);
  blade.translate(0.55, 0.105, 0.12);
  out.push(blade);
  return out.map((g) => (g.index ? g.toNonIndexed() : g));
}

export interface Dock {
  /** On the land, where the jetty starts. */
  x: number;
  z: number;
  /** Out over the water, unit. */
  dx: number;
  dz: number;
  deck: number;
}

/** Where to moor them: low shores with deep water opening out beyond, apart from each other and
    from every place of the world; the first is the one nearest where you wake. */
function findDocks(n: number): Dock[] {
  const out: Dock[] = [];
  const try1 = (x: number, z: number): Dock | null => {
    const h = heightAt(x, z);
    if (h < 0.08 || h > 1.2) return null;
    const gx = heightAt(x + 3, z) - heightAt(x - 3, z), gz = heightAt(x, z + 3) - heightAt(x, z - 3);
    const gl = Math.hypot(gx, gz);
    if (gl < 0.05) return null;
    const dx = -gx / gl, dz = -gz / gl;
    const at = (o: number, s = 0) => heightAt(x + dx * o - dz * s, z + dz * o + dx * s);
    if (at(5) > -0.7 || at(9) > -1.0 || at(14) > -1.0 || at(-4) < h - 0.05) return null;
    if (at(5, 1.45) > -0.5 || at(3) > 0.25) return null;
    // open water beyond: most of a wide ring out there is water
    let wet = 0;
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2;
      if (heightAt(x + dx * 30 + Math.cos(a) * 24, z + dz * 30 + Math.sin(a) * 24) < -0.5) wet++;
    }
    if (wet < 9) return null;
    if (keptClear(x, z, 10) || keptClear(x + dx * 5, z + dz * 5, 6)) return null;
    if (LANDMARK_SITES.some(([lx, lz]) => Math.hypot(lx - x, lz - z) < 40)) return null;
    if (out.some((d) => Math.hypot(d.x - x, d.z - z) < 220)) return null;
    return { x, z, dx, dz, deck: Math.max(h + 0.18, WATER_Y + 0.5) };
  };
  // the first: the nearest to where you wake
  outer: for (let r = 12; r < 400; r += 4)
    for (let k = 0; k < 48; k++) {
      const a = (k / 48) * Math.PI * 2;
      const d = try1(SPAWN.x + Math.cos(a) * r, SPAWN.z + Math.sin(a) * r);
      if (d) {
        out.push(d);
        break outer;
      }
    }
  const GA = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < 12000 && out.length < n; i++) {
    const r = 120 + Math.sqrt(i / 12000) * 2600, a = i * GA;
    const d = try1(SPAWN.x + Math.cos(a) * r, SPAWN.z + Math.sin(a) * r);
    if (d) out.push(d);
  }
  return out;
}

export interface Boat {
  dock: Dock;
  group: THREE.Group;
  /** Where it floats now and which way its bow points. */
  pos: THREE.Vector3;
  heading: number;
  bob: number;
}

export class Canoes {
  readonly group = new THREE.Group();
  readonly boats: Boat[] = [];
  constructor(count = 12) {
    seed = 7;
    const hull = hullGeometry();
    const fit = fittings();
    const hullMat = wood(new THREE.Color(1.95, 1.08, 0.62), 0.42, 1.1);
    const fitMat = wood(new THREE.Color(1.25, 0.95, 0.7), 0.6, 0.9);
    const jettyMat = wood(new THREE.Color(1.1, 1.0, 0.9), 0.85, 1.3);
    const fitG = (() => {
      const g = new THREE.BufferGeometry();
      const parts = fit.map((p) => {
        p.deleteAttribute("normal");
        return p;
      });
      // merged by hand (attributes in common: position, uv)
      const pos: number[] = [], uv: number[] = [];
      for (const p of parts) {
        const pa = p.getAttribute("position"), ua = p.getAttribute("uv");
        for (let k = 0; k < pa.count; k++) {
          pos.push(pa.getX(k), pa.getY(k), pa.getZ(k));
          uv.push(ua ? ua.getX(k) : 0, ua ? ua.getY(k) : 0);
        }
      }
      g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
      g.computeVertexNormals();
      return g;
    })();
    for (const dock of findDocks(count)) {
      KEEP_CLEAR.push({ x: dock.x + dock.dx * 3, z: dock.z + dock.dz * 3, r: 7 });
      // the jetty: posts down to the bed, two stringers, planks across
      const J: THREE.BufferGeometry[] = [];
      const len = 6.4, w = 0.65;
      const sx = -dock.dz, sz = dock.dx;
      const P = (o: number, s: number) => new THREE.Vector3(dock.x + dock.dx * o + sx * s, 0, dock.z + dock.dz * o + sz * s);
      const yaw = Math.atan2(dock.dx, dock.dz);
      for (let o = 0.6; o <= len; o += 1.9)
        for (const s of [-w, w]) {
          const p = P(o, s);
          const bed = heightAt(p.x, p.z) - 0.4;
          const g = new THREE.CylinderGeometry(0.075, 0.09, dock.deck - bed + 0.1, 8);
          g.translate(p.x, (dock.deck + bed) / 2 - 0.05, p.z);
          J.push(g);
        }
      for (const s of [-w + 0.08, w - 0.08]) {
        const a = P(0, s), b = P(len, s);
        const g = new THREE.BoxGeometry(0.09, 0.14, len);
        g.rotateY(yaw);
        g.translate((a.x + b.x) / 2, dock.deck - 0.1, (a.z + b.z) / 2);
        J.push(g);
      }
      for (let o = 0.1; o < len; o += 0.2) {
        const p = P(o, (rnd() - 0.5) * 0.04);
        const g = new THREE.BoxGeometry(w * 2 + 0.1 + (rnd() - 0.5) * 0.06, 0.04, 0.17);
        // each plank's own stretch of the grain
        const ua = g.getAttribute("uv");
        const off = rnd() * 6;
        for (let k = 0; k < ua.count; k++) ua.setXY(k, ua.getX(k) * 1.4 + off, ua.getY(k) * 0.2 + off * 0.3);
        g.rotateY(yaw);
        g.rotateZ((rnd() - 0.5) * 0.02);
        g.translate(p.x, dock.deck + (rnd() - 0.5) * 0.012, p.z);
        J.push(g);
      }
      const jg = (() => {
        const pos: number[] = [], uv: number[] = [];
        for (const p0 of J) {
          const p = p0.index ? p0.toNonIndexed() : p0;
          const pa = p.getAttribute("position"), ua = p.getAttribute("uv");
          for (let k = 0; k < pa.count; k++) {
            pos.push(pa.getX(k), pa.getY(k), pa.getZ(k));
            uv.push(ua.getX(k), ua.getY(k));
          }
        }
        const g = new THREE.BufferGeometry();
        g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
        g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
        g.computeVertexNormals();
        return g;
      })();
      const jetty = new THREE.Mesh(jg, jettyMat);
      jetty.castShadow = jetty.receiveShadow = true;
      this.group.add(jetty);
      // the canoe, moored alongside the jetty's end, its bow out to the water
      const grp = new THREE.Group();
      const hm = new THREE.Mesh(hull, hullMat);
      const fm = new THREE.Mesh(fitG, fitMat);
      hm.castShadow = hm.receiveShadow = fm.castShadow = true;
      grp.add(hm, fm);
      this.group.add(grp);
      const at = P(len - 2.0, w + 0.8);
      // (its length along +x: a heading of h points the bow to (sin h, cos h) once turned by h - π/2)
      const b: Boat = { dock, group: grp, pos: new THREE.Vector3(at.x, WATER_Y - DRAFT, at.z), heading: Math.atan2(dock.dx, dock.dz), bob: rnd() * 6 };
      this.boats.push(b);
      // a rope from the bow to the jetty's last post
      const post = P(len - 0.6, w);
      const bow = at.clone().add(new THREE.Vector3(dock.dx, 0, dock.dz).multiplyScalar(L * 0.45));
      const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 1, 5), fitMat);
      const mid = post.clone().add(bow).multiplyScalar(0.5);
      mid.y = dock.deck - 0.05;
      rope.position.copy(mid);
      rope.lookAt(post.clone().setY(dock.deck));
      rope.rotateX(Math.PI / 2);
      rope.scale.y = post.distanceTo(bow) + 0.2;
      grp.userData.rope = rope;
      this.group.add(rope);
    }
  }
  /** Where a canoe is now, for the wanderer sitting in it. */
  seat(b: Boat, out: THREE.Vector3): THREE.Vector3 {
    return out.copy(b.pos).add(new THREE.Vector3(Math.sin(b.heading), 0, Math.cos(b.heading)).multiplyScalar(-0.35)).setY(b.pos.y + 0.16);
  }
  update(t: number, apart: boolean): void {
    this.group.visible = !apart;
    if (apart) return;
    for (const b of this.boats) {
      const bob = Math.sin(t * 0.9 + b.bob) * 0.02 + Math.sin(t * 1.7 + b.bob * 2) * 0.01;
      b.group.position.set(b.pos.x, b.pos.y + bob, b.pos.z);
      b.group.rotation.set(Math.sin(t * 1.1 + b.bob) * 0.025, b.heading - Math.PI / 2, Math.sin(t * 0.8 + b.bob) * 0.012, "YXZ");
      const rope = b.group.userData.rope as THREE.Mesh | undefined;
      if (rope) rope.visible = b.pos.distanceTo(new THREE.Vector3(b.dock.x, b.pos.y, b.dock.z)) < 9;
    }
  }
  /** The canoe under a tap (by its middle on the screen), within reach of the eye. */
  pick(x: number, y: number, camera: THREE.Camera, w: number, h: number): Boat | null {
    let best: Boat | null = null, bd = 1e9;
    const v = new THREE.Vector3();
    for (const b of this.boats) {
      const d = camera.position.distanceTo(b.pos);
      if (d > 120) continue;
      for (const o of [-1.4, 0, 1.4]) {
        v.copy(b.pos).add(new THREE.Vector3(Math.sin(b.heading) * o, 0.25, Math.cos(b.heading) * o)).project(camera);
        if (v.z > 1) continue;
        const px = (v.x * 0.5 + 0.5) * w, py = (-v.y * 0.5 + 0.5) * h;
        const r = Math.max(28, 900 / d);
        const dd = Math.hypot(px - x, py - y);
        if (dd < r && dd < bd) (bd = dd), (best = b);
      }
    }
    return best;
  }
}

/** Water deep enough to paddle at a point (the hull draws ~0.12 m; keep a hand clear). */
export const paddleable = (x: number, z: number): boolean => heightAt(x, z) < WATER_Y - 0.55;

/** Auto cruising: wander slowly over open water, turning from the shallows a good way ahead.
    Returns the new heading and speed. `steer` (−1…1) and `push` (0…1) are the stick's. */
export function cruise(b: Boat, t: number, steer: number, push: number, goal: THREE.Vector3 | null): { speed: number; turn: number } {
  const ahead = (d: number, a: number) => {
    const h = b.heading + a;
    return heightAt(b.pos.x + Math.sin(h) * d, b.pos.z + Math.cos(h) * d);
  };
  let turn = 0;
  if (goal) {
    const want = Math.atan2(goal.x - b.pos.x, goal.z - b.pos.z);
    let d = want - b.heading;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    turn = THREE.MathUtils.clamp(d * 1.2, -0.7, 0.7);
  } else if (Math.abs(steer) > 0.1) turn = -steer * 0.8;
  else {
    // a slow wandering, and away from the shallows ahead
    turn = Math.sin(t * 0.07 + b.bob) * 0.12 + Math.sin(t * 0.031 + b.bob * 3) * 0.08;
    const c = ahead(12, 0), l = ahead(10, 0.6), r = ahead(10, -0.6);
    if (c > -1.0 || ahead(6, 0) > -0.8) turn = l < r ? 0.75 : -0.75;
    else if (l > -0.9) turn -= 0.35;
    else if (r > -0.9) turn += 0.35;
  }
  const speed = goal ? 1.8 : 1.2 + push * 2.6 + (Math.abs(steer) > 0.1 ? 0.4 : 1.0);
  return { speed, turn };
}
