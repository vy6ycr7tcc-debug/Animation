/* Gold mines (the owner: "add gold mines"). Three old mines in the hills of the west and south
   (sites in terrain.ts, MINE_SITES). Out in the world, each is a timbered portal set into a
   rough rock face on its hillside, a lantern on its post, rails running out of it to an ore
   cart and a spoil heap of pale broken rock. Walk in through the portal and you are in the mine,
   a place apart (x 70000; one mine at a time, each its own way down): squared drifts held by
   timber sets every couple of metres, rails and sleepers along the floor, lanterns hung from
   the caps, the rock seamed with white quartz and flecked with gold. The way goes down by
   declines to three chambers, each named as you come in with its depth:
   - the quartz reef: where the drift crosses a thick vein of quartz, gold glinting in it;
   - the stope: a tall chamber hollowed out along the richest band, ore carts on the rails, a
     ladder and staging against the face;
   - the mother lode: at the bottom, thick veins of gold in the rock and nuggets lying loose.
   The same underground builder as the crystal caverns (cavern.ts), with a squared section.
   Walk back up out of the portal to come out. */
import * as THREE from "three/webgpu";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { T, gpuUniforms, type N } from "../gpu/tsl";
import { Underground } from "./cavern";
import { etchedStone } from "./etching";
import { surface } from "./textures";
import { colliders, heightAt, MINE_SITES } from "./terrain";

export const MINE_ORIGIN_X = 70000;
export const inMine = (x: number): boolean => x > 65000;

let seed = 1;
const rnd = () => ((seed = (Math.imul(seed, 16807) + 11) % 2147483647), (seed & 0xffffff) / 0x1000000);
const C = (hex: string, k = 1) => new THREE.Color(hex).multiplyScalar(k);

type Ctrl = [number, number, number, number, number, number];
/** A mine's way down, winding a little (its own seed): drifts (zone 0), the quartz reef (1),
    the stope (2), the mother lode (3). */
function minePath(k: number): Ctrl[] {
  seed = 31 + k * 977;
  const j = () => (rnd() - 0.5) * 16;
  return [
    [0, 5, 0.3, 1.25, 2.5, 0],
    [0, 0, 0, 1.6, 2.9, 0],
    [j() * 0.3, -18, -1.2, 1.6, 2.9, 0],
    [j(), -34, -2.6, 1.6, 2.9, 0],
    [j(), -47, -3.2, 4.2, 4.6, 1],
    [j(), -60, -3.8, 1.6, 2.9, 0],
    [j(), -74, -7.8, 1.6, 2.9, 0],
    [j(), -88, -11.8, 1.6, 2.9, 0],
    [j(), -103, -12.6, 6.5, 9, 2],
    [j(), -117, -13.2, 6, 8, 2],
    [j(), -131, -14, 1.6, 2.9, 0],
    [j(), -145, -18, 1.6, 2.9, 0],
    [j(), -159, -22, 1.6, 2.9, 0],
    [j(), -171, -22.6, 4.6, 4.8, 3],
    [j() * 0.5, -181, -22.8, 3.4, 4, 3],
    [j() * 0.5, -186, -22.9, 0.9, 1.2, 3],
  ];
}
const MINE_CHAMBERS = [
  { name: "The quartz reef", at: 4 },
  { name: "The stope", at: 8 },
  { name: "The mother lode", at: 13 },
];

/* ---- materials ---- */
/** The mine's rock: dark country rock from the scan, seamed with white quartz; in the quartz,
    flecks of gold that catch the light as you move, more of them the deeper the chamber, and in
    the stope and the mother lode, broad bands thick with it. The floor is dusty, trodden. */
function mineRock(origin: THREE.Vector3): THREE.MeshStandardNodeMaterial {
  const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.85, metalness: 0 });
  const S = surface("cliff");
  const pw = T.positionWorld.sub(T.vec3(origin.x, origin.y, origin.z));
  const n = T.normalWorldGeometry;
  const wp = T.pow(T.abs(n), T.vec3(4));
  const w = wp.div(wp.x.add(wp.y).add(wp.z));
  const tri = (t: THREE.Texture, s: number) => T.texture(t, pw.zy.div(s)).mul(w.x).add(T.texture(t, pw.xz.div(s)).mul(w.y)).add(T.texture(t, pw.xy.div(s)).mul(w.z));
  const nz = (p: N) => T.mx_noise_float(p).mul(0.5).add(0.5);
  const zone = T.attribute("aZone", "float"), up = T.attribute("aUp", "float");
  const diff = tri(S.diff, 2.6), arm = tri(S.arm, 2.6);
  const lum = T.dot(diff.rgb, T.vec3(0.3, 0.5, 0.2));
  let c: N = T.mix(T.vec3(0.11, 0.1, 0.09), T.vec3(0.3, 0.26, 0.21), T.smoothstep(0.15, 0.6, lum)).mul(T.mix(T.float(0.45), T.float(1), arm.r));
  // iron staining in patches
  c = T.mix(c, c.mul(T.vec3(1.25, 0.85, 0.6)), T.smoothstep(0.6, 0.8, nz(pw.mul(0.3))).mul(0.5));
  // quartz veins: warped bands through the rock, wider and more of them in the rich ground
  const rich = T.smoothstep(0.5, 3, zone);
  const warp = T.vec3(nz(pw.mul(0.2)), nz(pw.mul(0.2).add(5)), nz(pw.mul(0.2).add(9))).mul(3);
  const v1 = T.abs(nz(pw.mul(0.16).add(warp)).sub(0.5));
  const v2 = T.abs(nz(pw.mul(0.33).add(warp.mul(0.5)).add(17)).sub(0.5));
  const width = T.mix(T.float(0.012), T.float(0.04), rich);
  const vein = T.max(T.smoothstep(width, width.mul(0.4), v1), T.smoothstep(width.mul(0.6), width.mul(0.25), v2).mul(0.8));
  // the gold-bearing band of the stope and the mother lode: a broad seam across the walls
  const band = T.smoothstep(0.12, 0.0, T.abs(nz(T.vec3(pw.y.mul(0.35).add(nz(pw.mul(0.15)).mul(2)), 0.5, 0.5)).sub(0.5))).mul(T.smoothstep(1.5, 2.2, zone));
  const quartz = T.max(vein, band.mul(0.85));
  // (the quartz takes the rock's grain, broken in places, so a vein is never a painted line)
  const broken = T.smoothstep(0.3, 0.6, nz(pw.mul(1.7).add(4)));
  c = T.mix(c, T.vec3(0.62, 0.6, 0.55).mul(lum.add(0.55)), quartz.mul(broken).mul(0.6));
  // gold in the quartz: small flecks, each a little cell, more of them where it is rich
  // (each fleck at its own place and size within its cell, never on a grid; only in the quartz,
  // never on the trodden floor)
  const q18 = pw.mul(14);
  const cell = T.floor(q18);
  const hsh = T.fract(T.sin(T.dot(cell, T.vec3(12.9898, 78.233, 37.719))).mul(43758.5453));
  const h2 = T.fract(T.sin(T.dot(cell, T.vec3(39.346, 11.135, 83.155))).mul(24634.6345));
  const h3 = T.fract(T.sin(T.dot(cell, T.vec3(73.156, 52.235, 9.151))).mul(51239.1173));
  const jitter = T.vec3(hsh, h2, h3).mul(0.6).add(0.2);
  const fleckP = T.mix(T.float(0.03), T.float(0.16), rich).add(band.mul(0.12));
  const size = T.mix(T.float(0.06), T.float(0.2), h2);
  const fleck = T.step(T.float(1).sub(fleckP), h3).mul(quartz).mul(T.smoothstep(size, size.mul(0.4), T.length(T.fract(q18).sub(jitter)))).mul(T.smoothstep(0.06, 0.14, up));
  const gold = T.vec3(1.0, 0.72, 0.28);
  c = T.mix(c, gold.mul(0.85), fleck);
  // a dusty, trodden floor
  const floor = T.smoothstep(0.1, 0.0, up);
  c = T.mix(c, T.vec3(0.32, 0.27, 0.21).mul(nz(pw.mul(3)).mul(0.4).add(0.75)), floor.mul(0.75));
  const V = T.normalize(T.cameraPosition.sub(T.positionWorld));
  const glint = T.pow(T.max(T.dot(V, T.normalize(n.add(T.vec3(hsh.sub(0.5), 0.4, T.fract(hsh.mul(7.3)).sub(0.5))))), 0), 16).mul(fleck).mul(T.smoothstep(12, 2, T.length(T.cameraPosition.sub(T.positionWorld))));
  m.colorNode = T.vec4(c, 1);
  m.roughnessNode = T.mix(T.mix(T.clamp(arm.g, 0.6, 1), T.float(0.45), quartz), T.float(0.25), fleck);
  m.metalnessNode = fleck.mul(0.9);
  m.emissiveNode = gold.mul(glint.mul(1.1).add(fleck.mul(0.03)));
  const nm = (s: number) => [T.texture(S.nor, pw.zy.div(s)), T.texture(S.nor, pw.xz.div(s)), T.texture(S.nor, pw.xy.div(s))].map((x: N) => x.xy.mul(2).sub(1));
  const [ax, ay, az] = nm(2.6);
  const dn = T.vec3(0, ax.y, ax.x).mul(w.x).add(T.vec3(ay.x, 0, ay.y).mul(w.y)).add(T.vec3(az.x, az.y, 0).mul(w.z)).mul(T.float(1).sub(floor.mul(0.5)));
  m.normalNode = T.normalize(T.normalView.add(T.cameraViewMatrix.mul(T.vec4(dn, 0)).xyz));
  return m;
}
/** Old timber: each piece its own brown, the grain running along it, darker and greyer with
    age at the ends, a little rot near the floor. */
function timberMaterial(): THREE.MeshStandardNodeMaterial {
  const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.9, metalness: 0, vertexColors: true });
  const col = T.attribute("color", "vec3");
  const g = T.attribute("aGrain", "vec3"); // the direction the grain runs
  const p = T.positionWorld;
  const along = T.dot(p, g), across = T.length(p.sub(g.mul(along)));
  const grain = T.mx_noise_float(T.vec3(along.mul(0.8), across.mul(18), 0.3)).mul(0.5).add(0.5);
  const ring = T.sin(across.mul(60).add(grain.mul(6))).mul(0.5).add(0.5);
  const c = col.mul(T.float(0.72).add(grain.mul(0.38)).add(ring.mul(0.08)));
  m.colorNode = T.vec4(c, 1);
  return m;
}
function goldMaterial(): THREE.MeshStandardNodeMaterial {
  // (underground there is nothing for a metal to mirror, so pure metal reads black: part metal,
  // part warm diffuse colour, and a soft warmth of its own, contained)
  const m = new THREE.MeshStandardNodeMaterial({ color: 0xe8b445, metalness: 0.55, roughness: 0.3 });
  const V = T.normalize(T.cameraPosition.sub(T.positionWorld));
  const n = T.normalize(T.normalWorld);
  const fres = T.pow(T.float(1).sub(T.abs(T.dot(n, V))), 3);
  const r = T.reflect(V.negate(), n);
  const glint = T.pow(T.abs(T.sin(r.x.mul(5.3)).mul(T.sin(r.z.mul(4.7).add(r.y.mul(3.1))))), 18);
  m.emissiveNode = T.vec3(0.6, 0.4, 0.12).mul(fres.mul(0.3).add(0.12)).add(T.vec3(1, 0.8, 0.45).mul(glint.mul(0.6)));
  return m;
}
const iron = () => new THREE.MeshStandardNodeMaterial({ color: 0x3a3632, metalness: 0.75, roughness: 0.55 });

/* ---- built pieces, merged ---- */
class Pieces {
  timber: THREE.BufferGeometry[] = [];
  steel: THREE.BufferGeometry[] = [];
  gold: THREE.BufferGeometry[] = [];
  ore: THREE.BufferGeometry[] = [];
  lamps: THREE.BufferGeometry[] = [];
  /** A beam from a to b, `s` square, its own shade of brown. */
  beam(a: THREE.Vector3, b: THREE.Vector3, s: number, shade = 1): void {
    const d = b.clone().sub(a), L = d.length();
    const g = new THREE.BoxGeometry(s * (0.9 + rnd() * 0.2), L, s * (0.9 + rnd() * 0.2));
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize());
    g.applyQuaternion(q);
    g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
    const c = new THREE.Color().setHSL(0.07 + rnd() * 0.02, 0.35 + rnd() * 0.15, (0.2 + rnd() * 0.1) * shade);
    const n = g.getAttribute("position").count;
    const cols = new Float32Array(n * 3), gr = new Float32Array(n * 3);
    const dn = d.normalize();
    for (let k = 0; k < n; k++) {
      cols.set([c.r, c.g, c.b], k * 3);
      gr.set([dn.x, dn.y, dn.z], k * 3);
    }
    g.setAttribute("color", new THREE.BufferAttribute(cols, 3));
    g.setAttribute("aGrain", new THREE.BufferAttribute(gr, 3));
    this.timber.push(g);
  }
  box(list: THREE.BufferGeometry[], c: THREE.Vector3, sx: number, sy: number, sz: number, yaw: number): void {
    const g = new THREE.BoxGeometry(sx, sy, sz);
    g.rotateY(yaw);
    g.translate(c.x, c.y, c.z);
    list.push(g);
  }
  lump(list: THREE.BufferGeometry[], c: THREE.Vector3, r: number, flat = 0.7): void {
    const g = new THREE.IcosahedronGeometry(1, 1);
    const p = g.getAttribute("position");
    for (let k = 0; k < p.count; k++) {
      const f = 0.75 + rnd() * 0.5;
      p.setXYZ(k, p.getX(k) * f * r, p.getY(k) * f * r * flat, p.getZ(k) * f * r);
    }
    g.computeVertexNormals();
    g.translate(c.x, c.y, c.z);
    list.push(g.toNonIndexed());
  }
  build(add: (o: THREE.Object3D) => void): void {
    const mk = (list: THREE.BufferGeometry[], mat: THREE.Material, keep: string[]) => {
      if (!list.length) return;
      const g = mergeGeometries(
        list.map((x) => {
          const y = x.index ? x.toNonIndexed() : x;
          for (const name of Object.keys(y.attributes)) if (!keep.includes(name)) y.deleteAttribute(name);
          return y;
        }),
      );
      g.computeBoundingSphere();
      const mesh = new THREE.Mesh(g, mat);
      mesh.castShadow = false;
      add(mesh);
    };
    mk(this.timber, timberMaterial(), ["position", "normal", "uv", "color", "aGrain"]);
    mk(this.steel, iron(), ["position", "normal", "uv"]);
    mk(this.gold, goldMaterial(), ["position", "normal", "uv"]);
    mk(
      this.ore,
      new THREE.MeshStandardNodeMaterial({ color: 0x5e5246, roughness: 0.9 }),
      ["position", "normal", "uv"],
    );
    if (this.lamps.length) {
      const m = new THREE.MeshBasicNodeMaterial({ color: 0xffc274 });
      mk(this.lamps, m, ["position", "normal", "uv"]);
    }
  }
}

/** A gold mine: its portal in the hillside, and the mine within. */
export class GoldMine extends Underground {
  constructor(readonly index: number) {
    const s = MINE_SITES[index];
    const origin = new THREE.Vector3(MINE_ORIGIN_X, 120, index * 3000);
    const names = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
    const label = `A gold mine, ${names[(Math.round(Math.atan2(s.x, -s.z) / (Math.PI / 4)) + 8) % 8]}`;
    super({
      label,
      greeting: "An old gold mine. The drift runs down into the hill by declines, past the quartz reef to the stope and the mother lode: follow the rails, and back up to the daylight to come out.",
      origin,
      ctrl: minePath(index),
      chambers: MINE_CHAMBERS,
      site: s,
      door: new THREE.Vector3(s.x + Math.cos(s.face) * 0.2, heightAt(s.x + Math.cos(s.face) * 0.2, s.z + Math.sin(s.face) * 0.2), s.z + Math.sin(s.face) * 0.2),
      doorReach: 1.3,
      section: "drift",
      swell: 0.3,
      rock: () => mineRock(origin),
      speleothems: false,
      hemi: [0x4a3c30, 0x100b07, 0.55],
      exterior: (u) => (u as GoldMine).buildPortal(),
      decorate: (u) => (u as GoldMine).buildWorkings(),
      outsideAt: 4.5,
    });
  }

  /* ---------------------------------------------------------------- the portal in the hillside */
  buildPortal(): void {
    seed = 500 + this.index * 13;
    const s = this.site, f = s.face;
    const fx = Math.cos(f), fz = Math.sin(f), lx = -fz, lz = fx; // out of the hill; across it
    const at = (out: number, side: number, y = 0) => {
      const x = s.x + fx * out + lx * side, z = s.z + fz * out + lz * side;
      return new THREE.Vector3(x, heightAt(x, z) + y, z);
    };
    const P = new Pieces();
    const base = heightAt(s.x, s.z);
    // (built while the base class is still being made: no fields of this class yet)
    const solid: { x: number; z: number; r: number; top: number }[] = [];
    // the rock face the adit is driven into: a broken headwall over the portal, in the world's
    // own etched rock
    const head = new THREE.SphereGeometry(1, 56, 36);
    const hp = head.getAttribute("position");
    for (let k = 0; k < hp.count; k++) {
      const x = hp.getX(k), y = hp.getY(k), z = hp.getZ(k);
      // broad swells, crags and a rougher skin, the foot sunk into the bench
      const f = 0.82 + Math.sin(x * 2.3 + z * 1.7) * 0.06 + Math.sin(y * 4.1 + x * 3.3) * 0.05 + Math.sin(z * 7.7 - y * 5.1) * 0.025 + rnd() * 0.03;
      hp.setXYZ(k, x * 6.8 * f, Math.max(-0.25, y) * 6 * f, z * 5.2 * f);
    }
    head.computeVertexNormals();
    const rock = new THREE.Mesh(head, etchedStone("#5a4a3d", "#8a6a44", 6));
    // set back so its face rises round and over the portal (the mouth itself kept open)
    rock.position.set(s.x - fx * 5.2, base - 0.9, s.z - fz * 5.2);
    rock.rotation.y = -f - Math.PI / 2; // its width across the mouth, its depth into the hill
    rock.castShadow = rock.receiveShadow = true;
    this.world.add(rock);
    solid.push({ x: rock.position.x, z: rock.position.z, r: 3.6, top: base + 5 });
    // the timber set at the mouth: two posts, a cap, braces, lagging over it
    const pH = 2.9, half = 1.15;
    const pl = at(0.3, -half), pr = at(0.3, half);
    pl.y = pr.y = base;
    P.beam(pl, pl.clone().setY(base + pH), 0.3);
    P.beam(pr, pr.clone().setY(base + pH), 0.3);
    P.beam(pl.clone().setY(base + pH + 0.15).addScaledVector(new THREE.Vector3(lx, 0, lz), -0.35), pr.clone().setY(base + pH + 0.15).addScaledVector(new THREE.Vector3(lx, 0, lz), 0.35), 0.34);
    for (let k = 0; k < 6; k++) {
      const o = -0.6 + k * 0.28;
      P.beam(at(o, -half - 0.3, 0).setY(base + pH + 0.42), at(o, half + 0.3, 0).setY(base + pH + 0.42), 0.12, 0.9);
    }
    P.beam(pl.clone().setY(base + 0.6).addScaledVector(new THREE.Vector3(fx, 0, fz), 0.7), pl.clone().setY(base + 2.2), 0.14);
    P.beam(pr.clone().setY(base + 0.6).addScaledVector(new THREE.Vector3(fx, 0, fz), 0.7), pr.clone().setY(base + 2.2), 0.14);
    solid.push({ x: pl.x, z: pl.z, r: 0.3, top: base + pH }, { x: pr.x, z: pr.z, r: 0.3, top: base + pH });
    // the dark of the adit within
    const dark = new THREE.Mesh(new THREE.PlaneGeometry(2.3, pH), new THREE.MeshBasicNodeMaterial({ color: 0x050302 }));
    const dc = at(0.1, 0); // just behind the posts, before the rock's face
    dark.position.set(dc.x, base + pH / 2, dc.z);
    dark.rotation.y = Math.atan2(fx, fz);
    this.world.add(dark);
    // a lantern on the right post
    const lamp = at(0.55, half + 0.1);
    lamp.y = base + 2.1;
    P.box(P.lamps, lamp, 0.16, 0.22, 0.16, -f);
    P.box(P.steel, lamp.clone().setY(lamp.y + 0.15), 0.2, 0.04, 0.2, -f);
    const halo = new THREE.Mesh(
      new THREE.PlaneGeometry(1.6, 1.6),
      (() => {
        const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
        const a = T.smoothstep(0.5, 0, T.length(T.uv().sub(0.5))).pow(2).mul(T.sin(gpuUniforms.time.mul(7)).mul(0.04).add(0.96));
        m.colorNode = T.vec4(T.vec3(1, 0.62, 0.25).mul(a).mul(0.45), 1);
        return m;
      })(),
    );
    halo.position.copy(lamp);
    halo.rotation.y = Math.atan2(fx, fz);
    this.world.add(halo);
    // rails out of the mouth to the spoil heap, and a cart standing at their end
    const railLen = 15;
    for (let t = 0; t < railLen; t += 0.7) P.beam(at(t + 0.2, -0.55, 0.05), at(t + 0.2, 0.55, 0.05), 0.12, 0.8);
    for (const side of [-0.32, 0.32])
      for (let t = 0; t < railLen; t += 1) {
        const a = at(t, side, 0.13), b = at(t + 1, side, 0.13);
        const g = new THREE.BoxGeometry(0.05, 0.07, a.distanceTo(b) + 0.02);
        g.lookAt(b.clone().sub(a));
        g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
        P.steel.push(g);
      }
    this.cart(P, at(railLen - 1.2, 0, 0.55), -f, true);
    solid.push({ x: at(railLen - 1.2, 0).x, z: at(railLen - 1.2, 0).z, r: 0.75, top: base + 1.2 });
    // the spoil heap beside the rails' end: pale broken rock
    const heap = new THREE.ConeGeometry(4.6, 2.6, 18, 5);
    const qp = heap.getAttribute("position");
    for (let k = 0; k < qp.count; k++) {
      const x = qp.getX(k), y = qp.getY(k), z = qp.getZ(k);
      const r = 0.85 + rnd() * 0.25;
      qp.setXYZ(k, x * r, y * (0.9 + rnd() * 0.15), z * r);
    }
    heap.computeVertexNormals();
    const spoil = new THREE.Mesh(
      heap,
      (() => {
        const m = new THREE.MeshStandardNodeMaterial({ roughness: 1 });
        const nz = T.mx_noise_float(T.positionWorld.mul(4)).mul(0.5).add(0.5);
        const big = T.mx_noise_float(T.positionWorld.mul(0.9)).mul(0.5).add(0.5);
        m.colorNode = T.vec4(T.mix(T.vec3(0.42, 0.37, 0.3), T.vec3(0.62, 0.55, 0.45), nz).mul(big.mul(0.3).add(0.8)), 1);
        return m;
      })(),
    );
    const hc = at(railLen + 2.6, 2.6);
    spoil.position.set(hc.x, hc.y + 0.6, hc.z);
    spoil.castShadow = spoil.receiveShadow = true;
    this.world.add(spoil);
    solid.push({ x: hc.x, z: hc.z, r: 3.6, top: hc.y + 2.5 });
    P.build((o) => this.world.add(o));
    for (const c of solid) colliders.push(c);
  }

  /** An ore cart on the rails: a timber box bound in iron on four iron wheels, heaped with ore
      (`gold`: a few lumps of gold among it). */
  private cart(P: Pieces, c: THREE.Vector3, yaw: number, gold: boolean): void {
    const fwd = new THREE.Vector3(Math.cos(-yaw), 0, Math.sin(-yaw)), side = new THREE.Vector3(-fwd.z, 0, fwd.x);
    const corner = (a: number, b: number, y: number) => c.clone().addScaledVector(fwd, a).addScaledVector(side, b).setY(c.y + y);
    // the box: planks on four sides and the floor
    for (const s of [-1, 1]) {
      P.beam(corner(-0.55, s * 0.36, 0.05), corner(0.55, s * 0.36, 0.05), 0.08);
      P.beam(corner(-0.55, s * 0.36, 0.35), corner(0.55, s * 0.36, 0.35), 0.08);
      P.beam(corner(s * 0.55, -0.36, 0.05), corner(s * 0.55, 0.36, 0.05), 0.08);
      P.beam(corner(s * 0.55, -0.36, 0.35), corner(s * 0.55, 0.36, 0.35), 0.08);
      for (const t of [-1, 1]) P.beam(corner(s * 0.55, t * 0.36, -0.05), corner(s * 0.55, t * 0.36, 0.42), 0.07);
    }
    P.box(P.ore, corner(0, 0, -0.02), 1.1, 0.06, 0.72, yaw);
    // iron wheels
    for (const a of [-0.38, 0.38])
      for (const s of [-0.34, 0.34]) {
        const g = new THREE.CylinderGeometry(0.16, 0.16, 0.06, 12);
        g.rotateX(Math.PI / 2);
        g.rotateY(yaw + Math.PI / 2);
        const p = corner(a, s, -0.28);
        g.translate(p.x, p.y, p.z);
        P.steel.push(g);
      }
    // the ore heaped in it
    for (let k = 0; k < 9; k++) P.lump(P.ore, corner((rnd() - 0.5) * 0.8, (rnd() - 0.5) * 0.5, 0.32 + rnd() * 0.12), 0.12 + rnd() * 0.1);
    if (gold) for (let k = 0; k < 4; k++) P.lump(P.gold, corner((rnd() - 0.5) * 0.7, (rnd() - 0.5) * 0.4, 0.42 + rnd() * 0.08), 0.05 + rnd() * 0.05);
  }

  /* ---------------------------------------------------------------- the workings within */
  buildWorkings(): void {
    seed = 900 + this.index * 7;
    const S = this.samples, O = this.O;
    const P = new Pieces();
    const pt = (i: number, lat: number, y: number) => {
      const s = S[i];
      const x = O.x + s.x - s.tz * lat, z = O.z + s.z + s.tx * lat;
      return new THREE.Vector3(x, this.floorAt(x, z) + y, z);
    };
    // rails the whole way down, on sleepers
    for (let i = 0; i < S.length - 3; i++) {
      if (i % 2 === 0) P.beam(pt(i, -0.55, 0.05), pt(i, 0.55, 0.05), 0.11, 0.8);
      for (const side of [-0.32, 0.32]) {
        const a = pt(i, side, 0.13), b = pt(i + 1, side, 0.13);
        const g = new THREE.BoxGeometry(0.05, 0.07, a.distanceTo(b) + 0.03);
        g.lookAt(b.clone().sub(a));
        g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
        P.steel.push(g);
      }
    }
    // timber sets along the drifts, every couple of metres: two posts, a cap, lagging over it
    let lampAt = 0;
    for (let i = 4; i < S.length - 4; i += 4) {
      const s = S[i];
      if (s.zone !== 0 || s.w > 2.2) continue;
      const half = s.w * 0.86, top = s.h * 0.86;
      const l0 = pt(i, -half, 0), r0 = pt(i, half, 0);
      P.beam(l0, l0.clone().setY(l0.y + top), 0.22);
      P.beam(r0, r0.clone().setY(r0.y + top), 0.22);
      const yc = Math.max(l0.y, r0.y) + top + 0.1;
      P.beam(l0.clone().setY(yc).lerp(r0.clone().setY(yc), -0.08), r0.clone().setY(yc).lerp(l0.clone().setY(yc), -0.08), 0.24);
      if (i % 8 === 0) for (let k = -1; k <= 1; k++) P.beam(pt(i + k, -half, 0).setY(yc + 0.17), pt(i + k, half, 0).setY(yc + 0.17), 0.09, 0.85);
      this.solids.push({ x: l0.x, z: l0.z, r: 0.18, top: l0.y + top }, { x: r0.x, z: r0.z, r: 0.18, top: r0.y + top });
      // a lantern hung from a cap every dozen metres or so
      if (i - lampAt >= 20) {
        lampAt = i;
        const lp = pt(i, 0.25, 0).setY(yc - 0.35);
        P.box(P.lamps, lp, 0.14, 0.2, 0.14, 0);
        P.box(P.steel, lp.clone().setY(lp.y + 0.14), 0.18, 0.04, 0.18, 0);
        this.sources.push({ p: lp, c: C("#ffb866"), k: 9, r: 13 });
      }
    }
    // the chambers
    const chamber = (z: number) => S.map((s, i) => ({ s, i })).filter(({ s }) => s.zone === z);
    const reef = chamber(1), stope = chamber(2), lode = chamber(3);
    const mid = (list: { i: number }[]) => list[Math.floor(list.length / 2)]?.i ?? 0;
    if (reef.length) this.sources.push({ p: pt(mid(reef), 0, 3), c: C("#ffcf8a"), k: 18, r: 18 });
    if (stope.length) {
      const m = mid(stope);
      this.sources.push({ p: pt(m, 0, 5.5), c: C("#ffc070"), k: 40, r: 26 });
      // carts on the rails, one heaped with gold-bearing ore
      const yaw = -Math.atan2(S[m].tz, S[m].tx); // the cart's length along the rails
      this.cart(P, pt(m - 6, 0, 0.55), yaw, true);
      this.cart(P, pt(m + 7, 0, 0.55), yaw, false);
      for (const k of [m - 6, m + 7]) {
        const c = pt(k, 0, 0);
        this.solids.push({ x: c.x, z: c.z, r: 0.75, top: c.y + 1.2 });
      }
      // a ladder up the face, and staging along it
      const side = 1;
      const la = pt(m, side * (S[m].w * 0.72), 0), lb = la.clone().setY(la.y + 6.2);
      for (const o of [-0.25, 0.25]) {
        const off = new THREE.Vector3(S[m].tx, 0, S[m].tz).multiplyScalar(o);
        P.beam(la.clone().add(off), lb.clone().add(off), 0.08);
      }
      for (let y = 0.4; y < 6; y += 0.4) P.beam(la.clone().setY(la.y + y).add(new THREE.Vector3(S[m].tx, 0, S[m].tz).multiplyScalar(-0.27)), la.clone().setY(la.y + y).add(new THREE.Vector3(S[m].tx, 0, S[m].tz).multiplyScalar(0.27)), 0.05);
      for (let k = -8; k <= 8; k += 2) {
        const a = pt(m + k, side * (S[m].w * 0.6), 4.2), b = pt(m + k, side * (S[m].w * 0.8), 4.2);
        P.beam(a, b, 0.12, 0.9);
      }
      P.beam(pt(m - 8, side * S[m].w * 0.6, 4.25), pt(m + 8, side * S[m].w * 0.6, 4.25), 0.16);
      P.beam(pt(m - 8, side * S[m].w * 0.6, 0), pt(m - 8, side * S[m].w * 0.6, 4.2), 0.2);
      P.beam(pt(m + 8, side * S[m].w * 0.6, 0), pt(m + 8, side * S[m].w * 0.6, 4.2), 0.2);
      // spilled ore along the foot of the face
      for (let k = 0; k < 18; k++) P.lump(P.ore, pt(m + Math.round((rnd() - 0.5) * 24), side * S[m].w * (0.55 + rnd() * 0.2), 0.05), 0.1 + rnd() * 0.25);
    }
    if (lode.length) {
      const m = mid(lode);
      this.sources.push({ p: pt(m, 0, 3), c: C("#ffd27a"), k: 26, r: 18 });
      // nuggets lying loose, gold standing out of the rock in lumps
      for (let k = 0; k < 40; k++) {
        const i = lode[Math.floor(rnd() * lode.length)].i;
        const side = rnd() < 0.5 ? -1 : 1;
        const onWall = rnd() < 0.5;
        if (onWall) {
          const { p, n } = this.wallAt(i, side * (1.1 + rnd() * 1.4));
          P.lump(P.gold, p.addScaledVector(n, -0.03), 0.06 + rnd() * 0.14, 0.8);
        } else P.lump(P.gold, pt(i, side * S[i].w * (0.5 + rnd() * 0.25), 0.03), 0.04 + rnd() * 0.08);
      }
      // and one great nugget in an old miner's pan
      const pan = pt(m + 3, -0.7, 0.05);
      const g = new THREE.CylinderGeometry(0.42, 0.32, 0.1, 20, 1, true);
      g.translate(pan.x, pan.y + 0.05, pan.z);
      P.steel.push(g);
      P.lump(P.gold, pan.clone().setY(pan.y + 0.1), 0.16, 0.7);
    }
    P.build((o) => this.add(o));
    // the way out: daylight in the portal behind you
    const out = new THREE.Mesh(
      new THREE.PlaneGeometry(2.2, 2.6),
      (() => {
        const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
        const a = T.smoothstep(0.5, 0.15, T.length(T.uv().sub(0.5)));
        m.colorNode = T.vec4(T.vec3(0.6, 0.62, 0.7).mul(a).mul(0.6), 1);
        return m;
      })(),
    );
    const s0 = S[0];
    out.position.set(O.x + s0.x, O.y + s0.y + 1.3, O.z + s0.z + 0.6);
    this.add(out);
  }
}
