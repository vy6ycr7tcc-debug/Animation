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
import { setWet } from "../gpu/wet";
import * as THREE from "three/webgpu";
import { mergeGeometries, mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";
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
  // seep-water standing in the floor's ruts and hollows: dark, and it mirrors the drift (gpu/wet.ts)
  const pool = floor.mul(T.smoothstep(0.8, 0.95, n.y)).mul(T.smoothstep(0.63, 0.68, nz(pw.mul(0.35).add(11)).mul(0.7).add(nz(pw.mul(1.4)).mul(0.3))));
  c = c.mul(T.float(1).sub(pool.mul(0.55)));
  setWet(m, pool, pool);
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
/** The light at a mine's mouth (outside, where no real light is lit): the lantern's warmth on
    what is near it, falling off with distance, flickering; and the dark of the adit, everything
    fading to black the deeper into the hill it stands. */
export interface MouthLight {
  lamp: THREE.Vector3;
  mouth: THREE.Vector3;
  inward: THREE.Vector3;
}
function mouthLit(m: THREE.MeshStandardNodeMaterial, L: MouthLight | null | undefined): void {
  if (!L) return;
  const pw = T.positionWorld;
  const lamp = T.vec3(L.lamp.x, L.lamp.y, L.lamp.z);
  const dz = T.dot(pw.sub(T.vec3(L.mouth.x, L.mouth.y, L.mouth.z)), T.vec3(L.inward.x, L.inward.y, L.inward.z));
  const fade = T.float(1).sub(T.smoothstep(-0.1, 3.0, dz).mul(0.97));
  const toL = lamp.sub(pw);
  const d2 = T.dot(toL, toL);
  const face = T.clamp(T.dot(T.normalize(T.normalWorld), T.normalize(toL)).mul(0.75).add(0.25), 0, 1);
  const flick = T.sin(gpuUniforms.time.mul(9.1)).mul(T.sin(gpuUniforms.time.mul(3.7))).mul(0.06).add(0.94);
  const col = m.colorNode as N;
  // (held under bloom's threshold: right by the lantern, a pale worn edge had flared)
  const warm = T.min(col.rgb.mul(T.vec3(1, 0.6, 0.28)).mul(face).mul(flick).mul(T.float(1.3).div(T.float(1).add(d2.mul(1.1)))), T.vec3(0.42, 0.26, 0.12));
  m.colorNode = T.vec4(col.rgb.mul(fade), 1);
  m.emissiveNode = m.emissiveNode ? (m.emissiveNode as N).mul(fade).add(warm) : warm;
}
/** Old timber: the scanned weathered wood (Poly Haven rough_wood), its grain running along each
    piece, each piece its own warm brown gone silver with weather, end grain darker, a little damp
    and rot toward the ground. */
function timberMaterial(L?: MouthLight | null): THREE.MeshStandardNodeMaterial {
  const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.9, metalness: 0 });
  const W = surface("wood");
  const col = T.attribute("color", "vec3");
  const uv = T.uv();
  const d = T.texture(W.diff, uv), arm = T.texture(W.arm, uv);
  const grey = T.dot(d.rgb, T.vec3(0.33, 0.33, 0.34));
  // the scan's own grey takes each piece's brown (more brown in the newer, more silver in the old)
  const warm = d.rgb.mul(col).mul(2.5);
  let c: N = T.mix(warm, T.vec3(grey).mul(T.vec3(0.95, 0.92, 0.86)), T.fract(T.dot(col, T.vec3(31.7, 17.3, 7.1))).mul(0.35).add(0.15));
  // end grain darker
  const ends = T.smoothstep(0.6, 0.9, T.abs(T.dot(T.normalize(T.normalWorldGeometry), T.attribute("aGrain", "vec3"))));
  c = c.mul(T.float(1).sub(ends.mul(0.35)));
  // damp toward the ground
  const low = T.smoothstep(0.9, 0.0, T.positionWorld.y.sub(T.attribute("aFoot", "float")));
  c = c.mul(T.float(1).sub(low.mul(0.3)));
  m.colorNode = T.vec4(c.mul(T.mix(T.float(0.55), T.float(1), arm.r)), 1);
  m.roughnessNode = T.clamp(arm.g.mul(1.05), 0.55, 1);
  m.normalMap = W.nor;
  m.normalScale = new THREE.Vector2(1.3, 1.3);
  mouthLit(m, L);
  return m;
}
/** Iron gone to rust (the scanned coarse rust), worn back to grey steel where wheels and boots
    rub: the rails' heads, the top edges. */
function ironMaterial(L?: MouthLight | null): THREE.MeshStandardNodeMaterial {
  const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.8, metalness: 0.3 });
  const R = surface("rust");
  const pw = T.positionWorld;
  const n = T.normalWorldGeometry;
  const wp = T.pow(T.abs(n), T.vec3(4));
  const w = wp.div(wp.x.add(wp.y).add(wp.z));
  const tri = (t: THREE.Texture, sc: number) => T.texture(t, pw.zy.div(sc)).mul(w.x).add(T.texture(t, pw.xz.div(sc)).mul(w.y)).add(T.texture(t, pw.xy.div(sc)).mul(w.z));
  const d = tri(R.diff, 0.6), arm = tri(R.arm, 0.6);
  const worn = T.smoothstep(0.65, 0.9, n.y).mul(T.smoothstep(0.35, 0.6, T.mx_noise_float(pw.mul(2.3)).mul(0.5).add(0.5)).mul(0.6).add(0.4));
  m.colorNode = T.vec4(T.mix(d.rgb.mul(0.75), T.vec3(0.42, 0.41, 0.4), worn), 1);
  m.roughnessNode = T.mix(T.clamp(arm.g, 0.6, 1), T.float(0.32), worn);
  m.metalnessNode = T.mix(T.float(0.15), T.float(0.85), worn);
  mouthLit(m, L);
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

/** Broken stone (the rails' bed, the spoil heap): the scanned rocky ground seen from above,
    greyed to waste rock, its pebbles in shade. */
function gravel(light = 1): THREE.MeshStandardNodeMaterial {
  const m = new THREE.MeshStandardNodeMaterial({ roughness: 1 });
  const R = surface("rock");
  const pw = T.positionWorld;
  const d = T.texture(R.diff, pw.xz.div(0.9)), arm = T.texture(R.arm, pw.xz.div(0.9));
  const lum = T.dot(d.rgb, T.vec3(0.33, 0.34, 0.33));
  const nz = T.mx_noise_float(pw.mul(1.3)).mul(0.5).add(0.5);
  m.colorNode = T.vec4(T.mix(T.vec3(0.2, 0.18, 0.16), T.vec3(0.5, 0.46, 0.4), lum).mul(T.mix(T.float(0.6), T.float(1), arm.r)).mul(nz.mul(0.3).add(0.8)).mul(light), 1);
  return m;
}

/* ---- built pieces, merged ---- */
class Pieces {
  timber: THREE.BufferGeometry[] = [];
  steel: THREE.BufferGeometry[] = [];
  gold: THREE.BufferGeometry[] = [];
  ore: THREE.BufferGeometry[] = [];
  lamps: THREE.BufferGeometry[] = [];
  glass: THREE.BufferGeometry[] = [];
  flames: THREE.BufferGeometry[] = [];
  /** A lantern: a cap and a base, four thin bars, a bail, warm glass and a small flame within;
      hung from `hook` (a bracket to it, or a short chain straight up). */
  lantern(at: THREE.Vector3, hook?: THREE.Vector3): void {
    const add = (g: THREE.BufferGeometry, y: number) => {
      g.translate(at.x, at.y + y, at.z);
      this.steel.push(g);
    };
    add(new THREE.CylinderGeometry(0.075, 0.085, 0.03, 14), -0.13);
    add(new THREE.ConeGeometry(0.09, 0.08, 14), 0.15);
    add(new THREE.CylinderGeometry(0.02, 0.02, 0.03, 8), 0.205);
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + 0.4;
      const g = new THREE.CylinderGeometry(0.006, 0.006, 0.24, 5);
      g.translate(Math.cos(a) * 0.07, 0, Math.sin(a) * 0.07);
      add(g, 0);
    }
    const bail = new THREE.TorusGeometry(0.08, 0.005, 5, 18, Math.PI);
    bail.rotateY(0.4);
    add(bail, 0.2);
    const top = at.clone().setY(at.y + 0.285);
    const from = hook ?? top.clone().setY(top.y + 0.3);
    const L = from.distanceTo(top);
    if (L > 0.01) {
      const arm = new THREE.CylinderGeometry(0.01, 0.01, L, 6);
      arm.translate(0, L / 2, 0);
      arm.rotateX(Math.PI / 2); // (its length along +z, then turned to the hook)
      arm.lookAt(from.clone().sub(top));
      arm.translate(top.x, top.y, top.z);
      this.steel.push(arm);
    }
    const gl = new THREE.CylinderGeometry(0.062, 0.068, 0.22, 16, 1, true);
    gl.translate(at.x, at.y, at.z);
    this.glass.push(gl);
    const fl = new THREE.SphereGeometry(0.022, 10, 8);
    fl.scale(1, 1.9, 1);
    fl.translate(at.x, at.y - 0.04, at.z);
    this.flames.push(fl);
  }
  /** A beam from a to b, `s` square, its own shade of brown. */
  beam(a: THREE.Vector3, b: THREE.Vector3, s: number, shade = 1): void {
    const d = b.clone().sub(a), L = d.length();
    const sx = s * (0.9 + rnd() * 0.2), sz = s * (0.9 + rnd() * 0.2);
    const g = new THREE.BoxGeometry(sx, L, sz);
    // the scan laid along the piece (its grain along the length), its own stretch of it; and the
    // corners a little off true, as hewn timber is
    const pos = g.getAttribute("position"), nor = g.getAttribute("normal"), uv = g.getAttribute("uv");
    const TILE = 1.3, ou = rnd() * 7, ov = rnd() * 7;
    const jit = new Map<string, [number, number, number]>();
    for (let k = 0; k < pos.count; k++) {
      const x = pos.getX(k), y = pos.getY(k), z = pos.getZ(k);
      const nx = Math.abs(nor.getX(k)), ny = Math.abs(nor.getY(k));
      const [u, v] = nx > 0.5 ? [z, y] : ny > 0.5 ? [x, z] : [x, y];
      uv.setXY(k, (u + ou) / TILE, (v + ov) / TILE);
      const key = `${Math.sign(x)}${Math.sign(y)}${Math.sign(z)}`;
      if (!jit.has(key)) jit.set(key, [(rnd() - 0.5) * s * 0.12, (rnd() - 0.5) * 0.03, (rnd() - 0.5) * s * 0.12]);
      const j = jit.get(key)!;
      pos.setXYZ(k, x + j[0], y + j[1], z + j[2]);
    }
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize());
    g.applyQuaternion(q);
    g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
    const c = new THREE.Color().setHSL(0.07 + rnd() * 0.02, 0.35 + rnd() * 0.15, (0.2 + rnd() * 0.1) * shade);
    const n = g.getAttribute("position").count;
    const cols = new Float32Array(n * 3), gr = new Float32Array(n * 3), foot = new Float32Array(n).fill(Math.min(a.y, b.y) - 0.2);
    const dn = d.normalize();
    for (let k = 0; k < n; k++) {
      cols.set([c.r, c.g, c.b], k * 3);
      gr.set([dn.x, dn.y, dn.z], k * 3);
    }
    g.setAttribute("color", new THREE.BufferAttribute(cols, 3));
    g.setAttribute("aGrain", new THREE.BufferAttribute(gr, 3));
    g.setAttribute("aFoot", new THREE.BufferAttribute(foot, 1));
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
  build(add: (o: THREE.Object3D) => void, L?: MouthLight | null): void {
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
    mk(this.timber, timberMaterial(L), ["position", "normal", "uv", "color", "aGrain", "aFoot"]);
    mk(this.steel, ironMaterial(L), ["position", "normal", "uv"]);
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
    if (this.glass.length) {
      const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
      const V = T.normalize(T.cameraPosition.sub(T.positionWorld));
      const rim = T.pow(T.float(1).sub(T.abs(T.dot(T.normalize(T.normalWorld), V))), 2);
      m.colorNode = T.vec4(T.vec3(1, 0.6, 0.25).mul(rim.mul(0.25).add(0.08)), 1);
      mk(this.glass, m, ["position", "normal", "uv"]);
    }
    if (this.flames.length) {
      const m = new THREE.MeshBasicNodeMaterial({ fog: false });
      // each flame its own flicker (from where it hangs)
      const ph = T.positionWorld.x.mul(1.7).add(T.positionWorld.z.mul(2.3));
      const fl = T.sin(gpuUniforms.time.mul(11).add(ph)).mul(T.sin(gpuUniforms.time.mul(4.3).add(ph.mul(0.7)))).mul(0.08).add(0.92);
      m.colorNode = T.vec4(T.vec3(1, 0.78, 0.42).mul(fl).mul(1.1), 1);
      mk(this.flames, m, ["position", "normal", "uv"]);
    }
  }
}

/** A mine car's measure (its own frame: x along the rails, its reference point 0.55 m over them). */
const CAR = {
  /** the tub's floor, and its lip */
  floor: 0,
  top: 0.62,
  /** half its length and width at the floor and at the lip */
  hx0: 0.56, hz0: 0.34, hx1: 0.68, hz1: 0.46,
  /** the axles' places along it, the wheels' centre height and radius, the gauge (half) */
  axle: 0.36, wheelY: -0.215, wheelR: 0.17, gauge: 0.32,
};

/** Flat-shaded triangles, gathered (position, normal, uv), for the car's plates and parts. */
class Tris {
  p: number[] = [];
  n: number[] = [];
  private v = new THREE.Vector3();
  tri(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3): void {
    const n = this.v.subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a)).normalize();
    for (const q of [a, b, c]) this.p.push(q.x, q.y, q.z), this.n.push(n.x, n.y, n.z);
  }
  /** a quad a-b-c-d, its face toward the side it winds counter-clockwise from */
  quad(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3): void {
    this.tri(a, b, c);
    this.tri(a, c, d);
  }
  geometry(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(new Array((this.p.length / 3) * 2).fill(0), 2));
    return g;
  }
}
/** A round bar from a to b (rims, angle irons, straps, axles). */
function rod(a: THREE.Vector3, b: THREE.Vector3, r: number, sides = 8): THREE.BufferGeometry {
  const d = b.clone().sub(a), L = d.length();
  const g = new THREE.CylinderGeometry(r, r, L, sides, 1);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()));
  g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  return g.toNonIndexed();
}
/** The car's steel, all but its wheels: the tub of plate (outside, inside and floor), the rolled
    lip, corner angle irons, straps, a band at the foot, rivets along the lip and the straps, the
    chassis of two channels and cross members, axle boxes, and a coupling link at each end. */
function carBody(): THREE.BufferGeometry {
  const { floor: y0, top: y1, hx0, hz0, hx1, hz1 } = CAR;
  const T2 = new Tris(), t = 0.022;
  const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  // the four corners at the floor and at the lip (a, b, c, d round the tub, counter-clockwise from above)
  const lo = [V(-hx0, y0, -hz0), V(hx0, y0, -hz0), V(hx0, y0, hz0), V(-hx0, y0, hz0)];
  const hi = [V(-hx1, y1, -hz1), V(hx1, y1, -hz1), V(hx1, y1, hz1), V(-hx1, y1, hz1)];
  const shrink = (v: THREE.Vector3, k: number) => V(v.x - Math.sign(v.x) * k, v.y, v.z - Math.sign(v.z) * k);
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    // outside: its face outward
    T2.quad(lo[i], hi[i], hi[j], lo[j]);
    // inside, a plate's thickness in: its face inward
    const li = shrink(lo[i], t), lj = shrink(lo[j], t), hi_ = shrink(hi[i], t), hj = shrink(hi[j], t);
    li.y += t;
    lj.y += t;
    T2.quad(li, lj, hj, hi_);
    // the plate's top edge between them
    T2.quad(hi[i], hi_, hj, hi[j]);
  }
  // the floor: inside face up, underside down
  const fi = lo.map((v) => {
    const s = shrink(v, t);
    s.y += t;
    return s;
  });
  T2.quad(fi[0], fi[3], fi[2], fi[1]);
  T2.quad(lo[0], lo[1], lo[2], lo[3]);
  const parts: THREE.BufferGeometry[] = [T2.geometry()];
  // the rolled lip round the top, and its corners
  for (let i = 0; i < 4; i++) {
    const a = hi[i].clone(), b = hi[(i + 1) % 4].clone();
    a.y = b.y = y1 + 0.012;
    parts.push(rod(a, b, 0.024, 8));
    const s = new THREE.SphereGeometry(0.026, 8, 6).toNonIndexed();
    s.translate(a.x, a.y, a.z);
    parts.push(s);
  }
  // the band round the foot
  for (let i = 0; i < 4; i++) parts.push(rod(lo[i].clone().setY(y0 + 0.03), lo[(i + 1) % 4].clone().setY(y0 + 0.03), 0.016, 6));
  // angle irons up the four corners, a little proud
  for (let i = 0; i < 4; i++) {
    const o = V(Math.sign(lo[i].x) * 0.012, 0, Math.sign(lo[i].z) * 0.012);
    parts.push(rod(lo[i].clone().add(o), hi[i].clone().add(o), 0.02, 4));
  }
  // straps down the faces: three along each side, one on each end; rivets along them and the lip
  const rivet = (p: THREE.Vector3, out: THREE.Vector3) => {
    const r = new THREE.IcosahedronGeometry(0.011, 0).toNonIndexed();
    r.translate(p.x + out.x * 0.01, p.y, p.z + out.z * 0.01);
    parts.push(r);
  };
  for (const sz of [-1, 1]) {
    const out = V(0, 0, sz);
    for (const f of [-0.5, 0, 0.5]) {
      const a = V(f * hx0 * 1.4, y0 + 0.03, sz * (hz0 + 0.012)), b = V(f * hx1 * 1.4, y1 - 0.03, sz * (hz1 + 0.012));
      parts.push(rod(a, b, 0.014, 4));
      for (let k = 1; k < 5; k++) rivet(a.clone().lerp(b, k / 5), out);
    }
    for (let k = -6; k <= 6; k++) rivet(V((k / 6.5) * hx1 * 0.97, y1 - 0.05, sz * (hz1 - 0.005)), out);
  }
  for (const sx of [-1, 1]) {
    const out = V(sx, 0, 0);
    const a = V(sx * (hx0 + 0.012), y0 + 0.03, 0), b = V(sx * (hx1 + 0.012), y1 - 0.03, 0);
    parts.push(rod(a, b, 0.014, 4));
    for (let k = 1; k < 5; k++) rivet(a.clone().lerp(b, k / 5), out);
    for (let k = -4; k <= 4; k++) rivet(V(sx * (hx1 - 0.005), y1 - 0.05, (k / 4.5) * hz1 * 0.95), out);
  }
  // the chassis: two channels along it under the tub, cross members, axle boxes
  const box = (x: number, y: number, z: number, sx: number, sy: number, sz: number) => {
    const g = new THREE.BoxGeometry(sx, sy, sz).toNonIndexed();
    g.translate(x, y, z);
    parts.push(g);
  };
  for (const sz of [-1, 1]) {
    box(0, -0.06, sz * 0.24, 1.42, 0.1, 0.05);
    for (const ax of [-CAR.axle, CAR.axle]) box(ax, CAR.wheelY + 0.03, sz * 0.24, 0.13, 0.12, 0.09); // axle box
  }
  for (const x of [-0.66, 0, 0.66]) box(x, -0.06, 0, 0.06, 0.08, 0.5);
  // a coupling link and pin at each end
  for (const e of [-1, 1]) {
    box(e * 0.83, -0.08, 0, 0.12, 0.05, 0.08);
    const link = new THREE.TorusGeometry(0.05, 0.012, 6, 14).toNonIndexed();
    link.rotateX(Math.PI / 2);
    link.translate(e * 0.92, -0.08, 0);
    parts.push(link);
  }
  return mergeGeometries(parts.map((g) => {
    for (const name of Object.keys(g.attributes)) if (!["position", "normal", "uv"].includes(name)) g.deleteAttribute(name);
    return g;
  }))!;
}
/** One axle's pair of wheels about its own centre (the axle along z): flanged cast-iron wheels,
    each a tread with its flange on the inside, a web ring, five spokes and a hub, on the axle. */
function carWheels(P: Pieces): void {
  const { wheelR: R, gauge: G } = CAR;
  // a ring of iron (an annulus in section: `r0` in, `r1` out, `w` wide), about z at `z`
  const ring = (r0: number, r1: number, w: number, z: number, seg = 22) => {
    const g = new THREE.LatheGeometry([new THREE.Vector2(r0, -w / 2), new THREE.Vector2(r1, -w / 2), new THREE.Vector2(r1, w / 2), new THREE.Vector2(r0, w / 2), new THREE.Vector2(r0, -w / 2)], seg);
    g.rotateX(Math.PI / 2);
    g.translate(0, 0, z);
    const n = g.toNonIndexed();
    n.computeVertexNormals();
    P.steel.push(n);
  };
  for (const s of [-1, 1]) {
    const z = s * G;
    ring(R - 0.035, R, 0.055, z); // the tread
    ring(R - 0.02, R + 0.024, 0.014, z - s * 0.034); // the flange, inside the rail
    // the web: a rim ring, spokes and a hub, set a little in from the tread's face
    const rim = new THREE.TorusGeometry(R - 0.03, 0.014, 6, 20).toNonIndexed();
    rim.translate(0, 0, z + s * 0.02);
    P.steel.push(rim);
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2;
      const sp = new THREE.BoxGeometry(0.022, R - 0.06, 0.018).toNonIndexed();
      sp.translate(0, (R - 0.06) / 2 + 0.035, 0);
      sp.rotateZ(a);
      sp.translate(0, 0, z + s * 0.02);
      P.steel.push(sp);
    }
    ring(0.02, 0.045, 0.09, z, 12); // the hub
  }
  P.steel.push(rod(new THREE.Vector3(0, 0, -G - 0.06), new THREE.Vector3(0, 0, G + 0.06), 0.024, 10)); // the axle
}
/** Turn a rolling car's wheels by how far it moved along its own length. */
export function spinCart(car: THREE.Group, from: THREE.Vector3, to: THREE.Vector3): void {
  const axles = car.userData.axles as THREE.Group[] | undefined;
  if (!axles) return;
  const yaw = car.rotation.y;
  const along = (to.x - from.x) * Math.cos(yaw) - (to.z - from.z) * Math.sin(yaw);
  for (const a of axles) a.rotation.z -= along / CAR.wheelR;
}

/** A gold mine: its portal in the hillside, and the mine within. */
export class GoldMine extends Underground {
  /** The cart at the mouth, which carries you in (its own object, so it can roll). */
  declare cartOut: THREE.Group;
  /** Where on the rails outside (metres out from the mouth) the cart rests. */
  declare cartRest: number;
  /** A point on the rails outside, `out` metres from the mouth (negative: in the adit). */
  declare railOut: (out: number) => THREE.Vector3;
  declare portalYaw: number;
  /** The cart that rides the rails within (built with the mine, at the start of the rails). */
  cartIn: THREE.Group | null = null;
  /** A car of its own, empty but for a bench to sit on: its origin is the car's reference point
      (0.55 m over the rails, as the rails' own helpers give it); its two axles' wheels turn as it
      rolls (`userData.axles`, spun by `spinCart`). */
  private makeCart(L?: MouthLight | null): THREE.Group {
    const P = new Pieces();
    const g = new THREE.Group();
    this.cart(P, new THREE.Vector3(0, 0, 0), 0, false, false);
    P.build((o) => g.add(o), L);
    const axles: THREE.Group[] = [];
    for (const ax of [-CAR.axle, CAR.axle]) {
      const W = new Pieces();
      carWheels(W);
      const a = new THREE.Group();
      a.position.set(ax, CAR.wheelY, 0);
      W.build((o) => a.add(o), L);
      g.add(a);
      axles.push(a);
    }
    g.userData.axles = axles;
    return g;
  }
  /** The rails' own height at each sample within: the floor under both rails, eased over a few
      metres (the floor's small bumps and the nearest sample's steps made the cart rise and fall in
      jolts every 0.6 m). The rails and their sleepers are laid on it too, so the cart rides them. */
  private railYs: number[] | null = null;
  railY(i: number): number {
    if (!this.railYs) {
      const S = this.samples, O = this.O;
      const raw = S.map((s) => {
        let y = 0;
        for (const lat of [-0.32, 0.32]) {
          const x = O.x + s.x - s.tz * lat, z = O.z + s.z + s.tx * lat;
          y += this.floorAt(x, z) - O.y - s.y;
        }
        return y / 2;
      });
      // the bumps eased (a window of ±3 samples), the decline itself kept exact
      this.railYs = S.map((s, k) => {
        let a = 0, n = 0;
        for (let j = -3; j <= 3; j++) {
          const q = raw[Math.max(0, Math.min(S.length - 1, k + j))], w = 4 - Math.abs(j);
          a += q * w;
          n += w;
        }
        return O.y + s.y + a / n;
      });
    }
    return this.railYs[Math.max(0, Math.min(this.railYs.length - 1, i))];
  }
  /** The rails within at `s` (a sample index, fractional): where the cart's middle is, and its
      turn (a rotation about y that lays its length along the rails). The height is the rails'
      own, eased between samples (a smoothstep), so the ride flows. */
  railIn(s: number, out: THREE.Vector3): number {
    const S = this.samples, O = this.O;
    const i = Math.max(0, Math.min(S.length - 2, Math.floor(s))), f = Math.min(1, Math.max(0, s - i));
    const a = S[i], b = S[i + 1];
    const x = O.x + a.x + (b.x - a.x) * f, z = O.z + a.z + (b.z - a.z) * f;
    // (a Catmull-Rom through the rails' heights: no corner at each sample)
    const y0 = this.railY(i - 1), y1 = this.railY(i), y2 = this.railY(i + 1), y3 = this.railY(i + 2);
    const y = 0.5 * (2 * y1 + (-y0 + y2) * f + (2 * y0 - 5 * y1 + 4 * y2 - y3) * f * f + (-y0 + 3 * y1 - 3 * y2 + y3) * f * f * f);
    out.set(x, y + 0.55, z);
    const tx = a.tx + (b.tx - a.tx) * f, tz = a.tz + (b.tz - a.tz) * f;
    return -Math.atan2(tz, tx);
  }
  /** The rails' rise ahead at `s` (radians: positive climbing toward higher `s`). */
  railPitch(s: number): number {
    const i = Math.max(0, Math.min(this.samples.length - 2, Math.floor(s)));
    const a = this.railY(i - 1), b = this.railY(i + 2);
    return Math.atan2(b - a, this.railStep(s) * 3);
  }
  /** Contemplating in the mine, the gaze rests down the drift, not on a lantern: a point along the
      rails ahead (deeper) and one back the way you came, at head height, in turn. */
  override focus(player: THREE.Vector3): THREE.Vector3[] {
    const i = this.nearest(player.x - this.O.x, player.z - this.O.z);
    const out: THREE.Vector3[] = [];
    for (const k of [i + 26, i - 26]) {
      if (k < 1 || k > this.samples.length - 2) continue;
      const v = new THREE.Vector3();
      this.railIn(k, v);
      out.push(v.setY(v.y + 0.9));
    }
    return out;
  }
  /** Metres between two samples of the rails within. */
  railStep(s: number): number {
    const S = this.samples;
    const i = Math.max(0, Math.min(S.length - 2, Math.floor(s)));
    return Math.max(0.2, Math.hypot(S[i + 1].x - S[i].x, S[i + 1].z - S[i].z));
  }
  get railEnd(): number {
    return this.samples.length - 4;
  }
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
    // (a broken outcrop, not a round boulder: lumps at three scales, flat shear faces where the
    // rock has split, ledges, the foot sunk into the bench)
    const head = new THREE.IcosahedronGeometry(1, 5);
    const hp = head.getAttribute("position");
    const h3 = (x: number, y: number, z: number) => {
      const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
      const fx2 = x - xi, fy2 = y - yi, fz2 = z - zi;
      const u = fx2 * fx2 * (3 - 2 * fx2), v = fy2 * fy2 * (3 - 2 * fy2), w = fz2 * fz2 * (3 - 2 * fz2);
      const H = (a: number, b: number, c: number) => {
        const n = Math.sin((xi + a) * 127.1 + (yi + b) * 311.7 + (zi + c) * 74.7 + s.x * 0.013) * 43758.5453;
        return n - Math.floor(n);
      };
      const l = (a: number, b: number, t: number) => a + (b - a) * t;
      return l(l(l(H(0, 0, 0), H(1, 0, 0), u), l(H(0, 1, 0), H(1, 1, 0), u), v), l(l(H(0, 0, 1), H(1, 0, 1), u), l(H(0, 1, 1), H(1, 1, 1), u), v), w);
    };
    for (let k = 0; k < hp.count; k++) {
      const x = hp.getX(k), y = hp.getY(k), z = hp.getZ(k);
      let f = 0.78 + (h3(x * 1.6, y * 1.6, z * 1.6) - 0.5) * 0.34 + (h3(x * 4.2 + 7, y * 4.2, z * 4.2) - 0.5) * 0.14 + (h3(x * 11 + 3, y * 11, z * 11) - 0.5) * 0.04;
      // split faces: the surface pulled flat in places, and ledges stepped across it
      const cut = h3(x * 2.4 + 11, y * 2.4, z * 2.4);
      if (cut > 0.62) f = f * 0.9 + 0.074;
      const ledge = Math.round(y * 5) / 5;
      f += (ledge - y) * 0.05;
      hp.setXYZ(k, x * 6.8 * f, Math.max(-0.25, y) * 6 * f, z * 5.2 * f);
    }
    head.deleteAttribute("normal");
    head.deleteAttribute("uv");
    const headS = mergeVertices(head); // (shared corners: smooth, not faceted)
    headS.computeVertexNormals();
    // the mouth's light (no real light lit out here): the lantern's warmth and the adit's dark
    const pH = 2.9, half = 1.15, DEEP = 3.6;
    const lamp = at(0.62, half + 0.22);
    lamp.y = base + 2.05;
    const L: MouthLight = { lamp, mouth: new THREE.Vector3(s.x + fx * 0.25, base, s.z + fz * 0.25), inward: new THREE.Vector3(-fx, 0, -fz) };
    const stone = etchedStone("#6b5240", "#000000", 6); // (no drawn lattice on a mine's rock)
    // (the rock is cut away where the adit runs into it)
    {
      const rel = T.positionWorld.sub(T.vec3(s.x, base, s.z));
      const dIn = T.dot(rel, T.vec3(-fx, 0, -fz)), acr = T.abs(T.dot(rel, T.vec3(lx, 0, lz)));
      const inside = T.step(-0.6, dIn).mul(T.step(acr, half - 0.02)).mul(T.step(rel.y, pH - 0.08)).mul(T.step(-1, rel.y));
      stone.maskNode = inside.lessThan(0.5);
    }
    const rock = new THREE.Mesh(headS, stone);
    // set back so its face rises round and over the portal (the mouth itself kept open)
    rock.position.set(s.x - fx * 5.2, base - 0.9, s.z - fz * 5.2);
    rock.rotation.y = -f - Math.PI / 2; // its width across the mouth, its depth into the hill
    rock.castShadow = rock.receiveShadow = true;
    this.world.add(rock);
    solid.push({ x: rock.position.x, z: rock.position.z, r: 3.6, top: base + 5 });
    // the adit: a short drift of the mine's own rock running into the hill and into the dark
    {
      const sec: [number, number][] = [[-1.18, 0.02], [-1.26, 0.9], [-1.24, 1.9], [-1.1, 2.62], [-0.6, 2.96], [0, 3.02], [0.6, 2.96], [1.1, 2.62], [1.24, 1.9], [1.26, 0.9], [1.18, 0.02], [0.4, 0.03], [-0.4, 0.03]];
      const rings: THREE.Vector3[][] = [];
      for (let d = 0.05; d <= DEEP + 0.01; d += 0.45) {
        rings.push(sec.map(([x, y]) => {
          const j = y > 0.1 ? 0.07 : 0.01;
          const X = x * (1 + (rnd() - 0.5) * 0.08) + (rnd() - 0.5) * j, Y = y + (rnd() - 0.5) * j;
          return new THREE.Vector3(s.x - fx * d + lx * X, base + Y, s.z - fz * d + lz * X);
        }));
      }
      const pos: number[] = [], up: number[] = [];
      const cl = (r: number) => new THREE.Vector3(s.x - fx * (r * 0.45 + 0.05), base + 1.5, s.z - fz * (r * 0.45 + 0.05));
      for (let r = 0; r < rings.length - 1; r++)
        for (let k = 0; k < sec.length; k++) {
          const k2 = (k + 1) % sec.length;
          const quad = [rings[r][k], rings[r + 1][k], rings[r + 1][k2], rings[r][k2]];
          for (const [a, b, c] of [[0, 1, 2], [0, 2, 3]]) {
            let A = quad[a], B = quad[b], Cc = quad[c];
            const nrm = new THREE.Vector3().subVectors(B, A).cross(new THREE.Vector3().subVectors(Cc, A));
            const mid = A.clone().add(B).add(Cc).divideScalar(3);
            if (nrm.dot(cl(r).sub(mid)) < 0) [B, Cc] = [Cc, B]; // faces turned in, toward its middle
            for (const v of [A, B, Cc]) {
              pos.push(v.x, v.y, v.z);
              up.push((v.y - base) / 3);
            }
          }
        }
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute("aUp", new THREE.Float32BufferAttribute(up, 1));
      g.setAttribute("aZone", new THREE.Float32BufferAttribute(new Float32Array(up.length), 1));
      g.computeVertexNormals();
      const rm = mineRock(new THREE.Vector3(s.x, base, s.z));
      // (under the hill: little of the sky reaches in)
      rm.colorNode = T.vec4((rm.colorNode as N).rgb.mul(0.55), 1);
      mouthLit(rm, L);
      const tun = new THREE.Mesh(g, rm);
      tun.castShadow = tun.receiveShadow = true;
      this.world.add(tun);
      // and beyond, the dark
      const dark = new THREE.Mesh(new THREE.PlaneGeometry(3, 3.4), new THREE.MeshBasicNodeMaterial({ color: 0x020100 }));
      dark.position.set(s.x - fx * DEEP, base + 1.5, s.z - fz * DEEP);
      dark.rotation.y = Math.atan2(fx, fz);
      this.world.add(dark);
    }
    // the timber sets: at the mouth two posts, a cap, braces, lagging over it; two more sets
    // going in, fading into the dark
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
    for (const dIn of [1.3, 2.7]) {
      const a = new THREE.Vector3(s.x - fx * dIn - lx * 1.02, base, s.z - fz * dIn - lz * 1.02);
      const b = new THREE.Vector3(s.x - fx * dIn + lx * 1.02, base, s.z - fz * dIn + lz * 1.02);
      P.beam(a, a.clone().setY(base + 2.62), 0.24);
      P.beam(b, b.clone().setY(base + 2.62), 0.24);
      P.beam(a.clone().setY(base + 2.74).addScaledVector(new THREE.Vector3(lx, 0, lz), -0.2), b.clone().setY(base + 2.74).addScaledVector(new THREE.Vector3(lx, 0, lz), 0.2), 0.26);
    }
    solid.push({ x: pl.x, z: pl.z, r: 0.3, top: base + pH }, { x: pr.x, z: pr.z, r: 0.3, top: base + pH });
    // a lantern on an iron bracket from the right post
    {
      const bracket = at(0.42, half + 0.02);
      bracket.y = lamp.y + 0.285;
      P.lantern(lamp, bracket);
    }
    const halo = new THREE.Mesh(
      new THREE.PlaneGeometry(1.1, 1.1),
      (() => {
        const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
        const a = T.smoothstep(0.5, 0, T.length(T.uv().sub(0.5))).pow(3).mul(T.sin(gpuUniforms.time.mul(7)).mul(0.04).add(0.96));
        m.colorNode = T.vec4(T.vec3(1, 0.62, 0.25).mul(a).mul(0.35), 1);
        return m;
      })(),
    );
    halo.position.copy(lamp);
    halo.rotation.y = Math.atan2(fx, fz);
    this.world.add(halo);
    // rails out of the mouth to the spoil heap, and a cart standing at their end
    const railLen = 15;
    const tb = (t: number, side: number, y: number) => (t < 0 ? new THREE.Vector3(s.x + fx * t + lx * side, base + y, s.z + fz * t + lz * side) : at(t, side, y));
    for (let t = -DEEP + 0.3; t < railLen; t += 0.7) P.beam(tb(t + 0.2, -0.6, 0.03), tb(t + 0.2, 0.6, 0.03), 0.13, 0.8);
    for (const side of [-0.32, 0.32])
      for (let t = -DEEP; t < railLen; t += 1) {
        const a = tb(t, side, 0.12), b = tb(t + 1, side, 0.12);
        const len = a.distanceTo(b) + 0.02;
        for (const [w, h, y] of [[0.06, 0.035, 0.0], [0.016, 0.06, 0.045], [0.12, 0.012, -0.03]]) {
          // the rail's head, its web and its foot
          const g = new THREE.BoxGeometry(w, h, len);
          g.translate(0, y as number, 0);
          g.lookAt(b.clone().sub(a));
          g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
          P.steel.push(g);
        }
      }
    // the bed of broken stone they lie on
    {
      const pos: number[] = [];
      const W = 1.0, step = 0.5;
      const pt = (t: number, sd: number) => {
        const v = tb(t, sd, 0);
        v.y += Math.max(0, 0.09 - Math.max(0, Math.abs(sd) - 0.75) * 0.35) + (rnd() - 0.5) * 0.02;
        return v;
      };
      for (let t = -DEEP; t < railLen + 0.5; t += step)
        for (let k = 0; k < 6; k++) {
          const s0 = -W + (k / 6) * 2 * W, s1 = -W + ((k + 1) / 6) * 2 * W;
          const a = pt(t, s0), b = pt(t, s1), c = pt(t + step, s1), d = pt(t + step, s0);
          pos.push(a.x, a.y, a.z, c.x, c.y, c.z, b.x, b.y, b.z, a.x, a.y, a.z, d.x, d.y, d.z, c.x, c.y, c.z);
        }
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
      g.computeVertexNormals();
      const m = gravel();
      mouthLit(m, L);
      const bed = new THREE.Mesh(g, m);
      bed.receiveShadow = true;
      this.world.add(bed);
    }
    this.cartRest = railLen - 1.2;
    this.railOut = (o: number) => tb(o, 0, 0.55);
    this.portalYaw = -f;
    this.cartOut = this.makeCart(L);
    this.cartOut.position.copy(this.railOut(this.cartRest));
    this.cartOut.rotation.y = -f;
    this.world.add(this.cartOut);
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
      gravel(1.25),
    );
    const hc = at(railLen + 2.6, 2.6);
    spoil.position.set(hc.x, hc.y + 0.6, hc.z);
    spoil.castShadow = spoil.receiveShadow = true;
    this.world.add(spoil);
    solid.push({ x: hc.x, z: hc.z, r: 3.6, top: hc.y + 2.5 });
    P.build((o) => this.world.add(o), L);
    for (const c of solid) colliders.push(c);
  }

  /** A mine car on the rails (after the riveted steel cars of the old hard-rock mines): a tub of
      plate steel flaring to a rolled lip, its plates riveted to angle irons at the corners and
      straps down the sides, on a chassis of two channels with timber buffers at the ends and a
      coupling link, on two axles of flanged spoked wheels set on the rails. `c` is its reference
      point (0.55 m over the rails); `ore`: heaped with ore (`gold`: a few lumps of gold among
      it); else empty, a plank bench across it at sitting height. Wheels come with it unless it
      rolls (`makeCart` gives those their own axles). */
  private cart(P: Pieces, c: THREE.Vector3, yaw: number, gold: boolean, ore = true): void {
    const M = new THREE.Matrix4().makeRotationY(yaw).setPosition(c);
    const put = (g: THREE.BufferGeometry) => (g.applyMatrix4(M), P.steel.push(g));
    put(carBody());
    const L = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z).applyMatrix4(M);
    // timber buffers across both ends of the chassis
    for (const e of [-1, 1]) P.beam(L(e * 0.74, -0.08, -0.36), L(e * 0.74, -0.08, 0.36), 0.12);
    if (ore) {
      for (const [ax] of [[-CAR.axle], [CAR.axle]]) {
        const W = new Pieces();
        carWheels(W);
        for (const g of W.steel) {
          g.translate(ax, CAR.wheelY, 0);
          put(g);
        }
      }
    }
    // a plank bench across it at sitting height, in a car that carries people
    if (!ore) {
      P.beam(L(0.02, 0.4, -0.4), L(0.02, 0.4, 0.4), 0.09);
      P.beam(L(0.02, 0.21, -0.38), L(0.02, 0.21, 0.38), 0.05, 0.8); // its brace under
    }
    // the ore heaped in it, crowning over the lip
    if (ore) for (let k = 0; k < 14; k++) P.lump(P.ore, L((rnd() - 0.5) * 1.05, 0.5 + rnd() * 0.14, (rnd() - 0.5) * 0.66), 0.12 + rnd() * 0.1);
    if (gold && ore) for (let k = 0; k < 5; k++) P.lump(P.gold, L((rnd() - 0.5) * 0.8, 0.6 + rnd() * 0.08, (rnd() - 0.5) * 0.5), 0.05 + rnd() * 0.05);
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
    // rails the whole way down, on sleepers, laid on the rails' own eased height (`railY`), which
    // the cart rides
    const rl = (i: number, lat: number, y: number) => pt(i, lat, 0).setY(this.railY(i) + y);
    for (let i = 0; i < S.length - 3; i++) {
      if (i % 2 === 0) P.beam(rl(i, -0.55, 0.01), rl(i, 0.55, 0.01), 0.17, 0.8);
      for (const side of [-0.32, 0.32]) {
        const a = rl(i, side, 0.13), b = rl(i + 1, side, 0.13);
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
        const lp = pt(i, 0.25, 0).setY(yc - 0.55);
        P.lantern(lp, lp.clone().setY(yc - 0.12));
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
    // a cart to ride, waiting near the start of the rails
    this.cartIn = this.makeCart();
    const v = new THREE.Vector3();
    this.cartIn.rotation.y = this.railIn(4, v);
    this.cartIn.position.copy(v);
    this.add(this.cartIn);
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
