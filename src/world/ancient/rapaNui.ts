/* Rapa Nui (the owner's brief: "moai on a cliff above the sea, wind, grass, the volcano behind";
   the telling `WHISPER-RAPA-NUI`, Aria, 109 s): a small headland toward the red sunset, its ahu
   near the cliff's edge. Made after what the islanders built and why (research in the PR):
   - The moai are the living faces of ancestors, set up on the ahu of their kin, and they stand
     with their backs to the sea, facing inland over the people and the land they keep. Here six
     stand on the ahu facing inland, toward the volcano, the open sea behind them: the great
     mystery all round the island.
   - The ahu: a long platform with a front of large fitted basalt, paved on top; before it a
     paved court (the place of gathering). One moai lies fallen face-down before it, as all came
     to lie in the island's later times.
   - Their eyes: the moai's eyes of white coral and dark stone were set in only on the ahu, the
     face then "living". One here has its eyes; when you stand in its gaze, still, a faint warmth
     comes into them.
   - Red stone topknots (pukao) on three, cut from a different volcano's red scoria.
   - The quarry volcano behind (as Rano Raraku): grassy slopes, a crater with a still pool in its
     top, and heads of unfinished moai standing buried to the chest in its slope.
   - The sea birds: a small islet offshore, sea birds circling it (as Motu Nui, where the birdman
     contest went for the first egg of the season). The game's small bird model, darkened: there
     is no tern model, and the rule is real models or nothing.
   - Two boat-shaped house foundations (hare paenga) in the grass inland.
   - Windswept grass over the headland, the surf heard below the cliff.
   Its telling begins the first time you come onto the headland, and plays on wherever you go. */
import * as THREE from "three/webgpu";
import { mergeGeometries, mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { T, type N } from "../../gpu/tsl";
import { RAPA_NUI, heightAt, rapaNuiAt, type Collider } from "../terrain";
import { landStone } from "../stoneworks";
import { herdOf, type Animal } from "../creatures";
import { dryGrass } from "./gobekli";
import { place, rng, roughBlock, solidBox, solidRound } from "./kit";

const { float, mix, sin, smoothstep, uniform, vec3, vec4 } = T;
const V3 = THREE.Vector3;
const RN = RAPA_NUI;
/** The ahu (plan frame, +z out to sea): its middle, length, depth and height over the headland. */
const AHU = { z: 12, len: 27, d: 5, h: 1.7 };
const MOAI = 6;

/** A moai in its own frame: foot at y = 0, facing +z, `H` metres tall. One carved surface, not
    parts: rings up the height, each a rounded square (a superellipse) whose width and depth follow
    the figure (the long torso, the great head as wide as the shoulders, flat on top), and on the
    front the features pushed out of and cut into the stone as smooth swellings: the jutting chin,
    pursed lips, a long nose flaring at the nostrils, deep sockets under a heavy brow, hollow
    cheeks, a sloping forehead; long ears down the sides of the head; arms down the sides and the
    long hands meeting over the belly. `eyes` gives back where its eyes sit (for the one that has
    them). */
export function moaiGeometry(H: number, seed: number, eyes?: THREE.Vector3[]): THREE.BufferGeometry {
  const R = rng(seed), wob = 0.012 * (R() - 0.5);
  const NY = 96, NA = 48, N = 3.6;
  const g = (x: number, s: number) => Math.exp(-(x * x) / (2 * s * s));
  const band = (y: number, a: number, b: number, soft: number) => THREE.MathUtils.smoothstep(y, a - soft, a + soft) * (1 - THREE.MathUtils.smoothstep(y, b - soft, b + soft));
  // the half width and half depth at height v (0 the foot, 1 the top)
  const width = (v: number) => (v < 0.44 ? 0.215 - v * 0.06 : v < 0.48 ? 0.188 - (v - 0.44) * 0.5 : 0.168 + Math.sin(Math.min(1, (v - 0.48) / 0.5) * Math.PI) * 0.006);
  const depth = (v: number) => (v < 0.44 ? 0.15 - v * 0.03 : 0.137);
  /** How far the surface stands out (+) or is cut in (−) at (u across the front, −1…1; v up). */
  const relief = (u: number, v: number, front: number, side: number): number => {
    let d = 0;
    if (front > 0) {
      const f = front;
      d += 0.034 * band(v, 0.425, 0.475, 0.012) * g(u, 0.5) * f; // the chin
      d += 0.024 * band(v, 0.488, 0.515, 0.006) * g(u, 0.3) * f; // the lips
      d -= 0.008 * g(v - 0.501, 0.004) * g(u, 0.28) * f; // the line between them
      // the nose: long, from the brow down, broadening and standing further out toward its foot
      const nv = THREE.MathUtils.clamp((0.785 - v) / 0.25, 0, 1);
      d += (0.016 + nv * 0.056) * band(v, 0.53, 0.785, 0.01) * g(u, 0.08 + nv * 0.13) * f;
      d -= 0.033 * g(v - 0.72, 0.03) * (g(u - 0.43, 0.15) + g(u + 0.43, 0.15)) * f; // the sockets
      d += 0.03 * band(v, 0.765, 0.81, 0.012) * g(u, 0.75) * f; // the heavy brow
      d -= 0.014 * band(v, 0.57, 0.7, 0.03) * (g(u - 0.62, 0.15) + g(u + 0.62, 0.15)) * f; // hollow cheeks
      d -= 0.05 * THREE.MathUtils.smoothstep(v, 0.83, 1.0) * f; // the forehead sloping back
      // the long hands meeting over the belly
      d += 0.013 * band(v, 0.115, 0.165, 0.008) * THREE.MathUtils.smoothstep(Math.abs(u), 0.12, 0.24) * f;
      d += 0.006 * band(v, 0.2, 0.3, 0.04) * g(u, 0.25) * f; // a soft belly
    }
    if (side > 0) {
      d += 0.022 * band(v, 0.6, 0.84, 0.012) * side; // the long ears
      d += 0.012 * band(v, 0.13, 0.42, 0.02) * side; // the arms down the sides
    }
    return d;
  };
  const pos: number[] = [];
  const P = (v: number, a: number): [number, number, number] => {
    const c = Math.cos(a), s = Math.sin(a);
    const W = width(v) * H, D = depth(v) * H;
    // a rounded square: the superellipse
    const ex = Math.sign(c) * Math.pow(Math.abs(c), 2 / N), ez = Math.sign(s) * Math.pow(Math.abs(s), 2 / N);
    let x = W * ex, z = D * ez;
    const u = ex, front = THREE.MathUtils.smoothstep(ez, 0.55, 0.85), side = THREE.MathUtils.smoothstep(Math.abs(ex), 0.8, 0.97) * (1 - THREE.MathUtils.smoothstep(Math.abs(ez), 0.55, 0.85));
    const d = relief(u, v, front, side) * H;
    const nx = ex * D, nz = ez * W, nl = Math.hypot(nx, nz) || 1; // outward, roughly
    x += (nx / nl) * d;
    z += (nz / nl) * d + wob * H * v * (z > 0 ? 1 : 0);
    return [x, v * H, z];
  };
  const grid: [number, number, number][][] = [];
  for (let i = 0; i <= NY; i++) {
    const v = i / NY, row: [number, number, number][] = [];
    for (let j = 0; j < NA; j++) row.push(P(v, (j / NA) * Math.PI * 2 + Math.PI / NA));
    grid.push(row);
  }
  const tri = (a: number[], b: number[], c: number[]) => pos.push(...a, ...b, ...c);
  for (let i = 0; i < NY; i++)
    for (let j = 0; j < NA; j++) {
      const a = grid[i][j], b = grid[i][(j + 1) % NA], c = grid[i + 1][(j + 1) % NA], d = grid[i + 1][j];
      tri(a, c, b);
      tri(a, d, c);
    }
  // the flat top of the head
  const top = grid[NY], cy = top[0][1], cx0 = top.reduce((s0, p) => s0 + p[0], 0) / NA, cz0 = top.reduce((s0, p) => s0 + p[2], 0) / NA;
  for (let j = 0; j < NA; j++) tri([cx0, cy, cz0], top[(j + 1) % NA], top[j]);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  const merged = mergeVerticesKeep(geo);
  merged.computeVertexNormals();
  // the sockets' middles (u = ±0.43 across the front: |cos a| = 0.43^(N/2))
  if (eyes) for (const s2 of [-1, 1]) {
    const c = s2 * Math.pow(0.43, N / 2);
    const [x, y, z] = P(0.72, Math.atan2(Math.sqrt(1 - c * c), c));
    eyes.push(new THREE.Vector3(x, y, z));
  }
  return merged;
}
/** Welds the surface's seams so its shading runs smooth across them. */
function mergeVerticesKeep(g: THREE.BufferGeometry): THREE.BufferGeometry {
  return mergeVertices(g, 1e-4);
}

/** A boat-shaped house's foundation: kerb stones set in a long pointed ellipse in the grass. */
function hareKerb(len: number, w: number, R: () => number): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const n = Math.round(len * 2.2);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const x = Math.cos(a) * len * 0.5, z = Math.sin(a) * w * 0.5 * Math.pow(Math.abs(Math.cos(a * 0.5)) * 0.3 + 0.7, 1);
    const g = roughBlock(0.42, 0.32, 0.26, R, 0.15);
    g.applyMatrix4(place(x, 0.08, z, Math.atan2(-Math.sin(a) * w, Math.cos(a) * len) + Math.PI / 2, 1, 1, 1, (R() - 0.5) * 0.15, (R() - 0.5) * 0.15));
    parts.push(g.index ? g.toNonIndexed() : g);
  }
  return mergeGeometries(parts.map((q) => {
    for (const a of Object.keys(q.attributes)) if (a !== "position" && a !== "normal") q.deleteAttribute(a);
    return q;
  }))!;
}

export class RapaNui {
  /** Built in the plan's frame (+z out to sea), at the ahu's middle on the headland. */
  readonly group = new THREE.Group();
  /** What lives in the world's own frame: the far volcano's heads, the birds. */
  readonly live = new THREE.Group();
  readonly solids: Collider[] = [];
  readonly track = "WHISPER-RAPA-NUI";
  readonly radius = 58;
  readonly loaded: Promise<void>;
  /** How near the surf is (0–1), for its sound. */
  surf = 0;
  /** The telling has begun this visit. */
  told = false;
  private uT = uniform(0);
  private uEyes = uniform(0);
  private eyesAt = new V3();
  private birds: (Animal & { r: number; y: number; ph: number; w: number })[] = [];

  constructor(phone: boolean) {
    const R = rng(3313);
    const top = RN.y;
    this.group.position.set(RN.x, 0, RN.z);
    this.group.rotation.y = RN.face;
    const W = (lx: number, lz: number) => rapaNuiAt(lx, lz);
    // the stones: the moai's yellow-grey tuff, the ahu's dark fitted basalt, red scoria, paving
    const tuff = landStone("sandstone_cracks", top, 1.4, [0.86, 0.8, 0.66]);
    const basalt = landStone("sandstone_cracks", top, 1.1, [0.42, 0.42, 0.44], { course: 0.9, block: 1.7, flag: 1.2 });
    const scoria = landStone("sandstone_cracks", top, 0.9, [0.92, 0.5, 0.36]);
    const paving = landStone("sandstone_cracks", top, 1.2, [0.55, 0.54, 0.52], { course: 0.6, block: 0.9, flag: 0.8 });

    // the ahu: a long platform, its fitted front toward the land, paved on top
    {
      const g = new THREE.BoxGeometry(AHU.len, AHU.h + 0.4, AHU.d);
      g.translate(0, top + (AHU.h - 0.4) / 2, AHU.z);
      // its wings: lower, sloping down at each end
      const wings = [-1, 1].map((s) => {
        const w = new THREE.BoxGeometry(5, 0.9, AHU.d - 0.6);
        w.translate(s * (AHU.len / 2 + 2.4), top + 0.25, AHU.z);
        return w;
      });
      const ahu = new THREE.Mesh(mergeGeometries([g, ...wings].map((q) => q.toNonIndexed())), basalt);
      ahu.castShadow = ahu.receiveShadow = true;
      this.group.add(ahu);
      const [ax, az] = W(0, AHU.z);
      solidBox(ax, az, AHU.len / 2 + 5, AHU.d / 2 + 0.2, RN.face, top + AHU.h + 6.5, this.solids);
      // the court before it: paving, broken toward its edges
      const pv: THREE.BufferGeometry[] = [];
      for (let i = 0; i < 70; i++) {
        const x = (R() - 0.5) * 30, z = AHU.z - AHU.d / 2 - 1.2 - R() * 13;
        if (Math.abs(x) > 15 - (AHU.z - AHU.d / 2 - z) * 0.3 && R() < 0.6) continue;
        const b = roughBlock(1.1 + R() * 0.7, 0.16, 0.9 + R() * 0.5, R, 0.1);
        b.applyMatrix4(place(x, top + 0.02, z, R() * 0.5, 1, 1, 1, (R() - 0.5) * 0.04, (R() - 0.5) * 0.04));
        pv.push(b.index ? b.toNonIndexed() : b);
      }
      const court = new THREE.Mesh(mergeGeometries(pv.map((q) => {
        for (const a of Object.keys(q.attributes)) if (a !== "position" && a !== "normal") q.deleteAttribute(a);
        return q;
      })), paving);
      court.receiveShadow = true;
      this.group.add(court);
    }

    // the moai on the ahu, their backs to the sea, facing inland (−z)
    const tops: THREE.BufferGeometry[] = [];
    const bodies: THREE.BufferGeometry[] = [];
    for (let i = 0; i < MOAI; i++) {
      const x = (i - (MOAI - 1) / 2) * 4.1, H = 5.4 + R() * 1.1;
      const eyes: THREE.Vector3[] = [];
      const g = moaiGeometry(H, 17 + i * 7, i === 2 ? eyes : undefined);
      const M = place(x, top + AHU.h, AHU.z + 0.3, Math.PI + (R() - 0.5) * 0.06);
      g.applyMatrix4(M);
      bodies.push(g);
      // red topknots on three, set a little back on the flat head
      if (i % 2 === 0) {
        const c = new THREE.CylinderGeometry(0.17 * H, 0.185 * H, 0.17 * H, 24, 1).toNonIndexed();
        c.deleteAttribute("uv");
        c.applyMatrix4(new THREE.Matrix4().makeTranslation(0, H + 0.075 * H, -0.02 * H));
        c.applyMatrix4(M);
        tops.push(c);
      }
      const [mx, mz] = W(x, AHU.z + 0.3);
      solidRound(mx, mz, 1.3, top + AHU.h + H, this.solids);
      // its eyes: white coral and dark stone, set into the sockets (the face living)
      if (eyes.length) {
        const eyeM = new THREE.MeshStandardNodeMaterial({ roughness: 0.55, metalness: 0 });
        eyeM.colorNode = vec4(vec3(0.62, 0.6, 0.55), 1);
        eyeM.emissiveNode = vec3(1.0, 0.78, 0.5).mul(this.uEyes.mul(0.22));
        const pupilM = new THREE.MeshStandardNodeMaterial({ color: new THREE.Color(0.04, 0.04, 0.05), roughness: 0.25, metalness: 0 });
        for (const e of eyes) {
          const at = e.clone().applyMatrix4(M);
          const eye = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 12), eyeM);
          eye.scale.set(0.032 * H, 0.014 * H, 0.01 * H);
          eye.position.copy(at).add(new V3(0, 0, 0.002 * H));
          const pupil = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 8), pupilM);
          pupil.scale.set(0.011 * H, 0.011 * H, 0.005 * H);
          pupil.position.copy(at).add(new V3(0, 0, -0.007 * H));
          this.group.add(eye, pupil);
        }
        const [ex2, ez2] = W(x, AHU.z);
        this.eyesAt.set(ex2, top + AHU.h + H * 0.72, ez2);
      }
    }
    // one fallen face-down before the ahu, its topknot rolled away
    {
      const H = 5.8, g = moaiGeometry(H, 99), foot = AHU.z - AHU.d / 2 - 4.1;
      g.applyMatrix4(new THREE.Matrix4().makeRotationX(Math.PI / 2)); // the face down, the head toward the land
      g.applyMatrix4(place(-11, top + 0.75, foot, Math.PI + 0.25, 1, 1, 1, 0, 0.05));
      bodies.push(g);
      const c = new THREE.CylinderGeometry(0.95, 1.05, 1.0, 20, 1).toNonIndexed();
      c.deleteAttribute("uv");
      c.applyMatrix4(place(-15.2, top + 0.6, AHU.z - 13.5, 0.4, 1, 1, 1, Math.PI / 2, 0));
      tops.push(c);
      // it lies from its foot by the court's edge to its head toward the land
      const [fx, fz] = W(-11 - Math.sin(0.25) * 2.9, foot - Math.cos(0.25) * 2.9);
      solidBox(fx, fz, 1.2, 3.0, RN.face + 0.25, top + 1.6, this.solids);
    }
    const moai = new THREE.Mesh(mergeGeometries(bodies), tuff);
    moai.castShadow = moai.receiveShadow = true;
    const pukao = new THREE.Mesh(mergeGeometries(tops), scoria);
    pukao.castShadow = pukao.receiveShadow = true;
    this.group.add(moai, pukao);

    // two boat-shaped house foundations in the grass inland
    for (const [x, z, a] of [[-11, -26, 0.3], [9, -33, -0.2]] as const) {
      const g = hareKerb(11, 2.4, R);
      g.applyMatrix4(place(x, 0, z, a));
      // the kerbs follow the ground (the plan's frame shares the world's heights)
      const p = g.attributes.position as THREE.BufferAttribute;
      const c = Math.cos(RN.face), s = Math.sin(RN.face);
      for (let i = 0; i < p.count; i++) {
        const lx = p.getX(i), lz = p.getZ(i), wx = RN.x + lx * c + lz * s, wz = RN.z - lx * s + lz * c;
        p.setY(i, p.getY(i) + heightAt(wx, wz) - 0.06);
      }
      g.computeVertexNormals();
      const m = new THREE.Mesh(g, basalt);
      m.receiveShadow = true;
      this.group.add(m);
    }

    // the windswept grass, kept off the ahu and its court
    const keep = (lx: number, lz: number) => {
      if (Math.abs(lx) < AHU.len / 2 + 7.5 && lz > AHU.z - AHU.d / 2 - 15 && lz < AHU.z + AHU.d / 2 + 1) return false;
      const [wx, wz] = W(lx, lz);
      return heightAt(wx, wz) > top - 3;
    };
    this.group.add(dryGrass(phone ? 10000 : 18000, keep, this.uT, { at: W, r: 46, wind: new THREE.Vector2(-0.35, -0.94).normalize(), green: true }));

    // the volcano behind: heads of unfinished moai standing buried to the chest in its slope,
    // looking out over the land toward the sea; a still pool in its crater
    {
      const V = RN.volcano;
      const toSea = Math.atan2(RN.x - V.x, RN.z - V.z);
      const heads: THREE.BufferGeometry[] = [];
      for (let i = 0; i < 4; i++) {
        const a = toSea + (i - 1.5) * 0.16, r = 78 + (i % 2) * 9;
        const x = V.x + Math.sin(a) * r, z = V.z + Math.cos(a) * r;
        const g = moaiGeometry(7.5, 200 + i);
        g.applyMatrix4(new THREE.Matrix4().makeRotationY(a + (R() - 0.5) * 0.3));
        g.applyMatrix4(new THREE.Matrix4().makeRotationAxis(new V3(Math.cos(a), 0, -Math.sin(a)), -0.12 - R() * 0.1));
        g.translate(x, heightAt(x, z) - 3.4, z);
        heads.push(g);
        solidRound(x, z, 1.5, heightAt(x, z) + 4.5, this.solids);
      }
      const hm = new THREE.Mesh(mergeGeometries(heads), tuff);
      hm.castShadow = hm.receiveShadow = true;
      const pool = new THREE.Mesh(new THREE.CircleGeometry(13.5, 48), poolMaterial(this.uT));
      pool.rotation.x = -Math.PI / 2;
      pool.position.set(V.x, V.crater + 0.35, V.z);
      this.live.add(hm, pool);
    }

    // sea birds circling the islet offshore, wheeling out over the water
    const birds = herdOf("models/animals/parrot.glb", phone ? 7 : 11, 0.3, [new THREE.Color(0.2, 0.2, 0.22)], 1, { inner: 0.05, edge: 0.25, body: 0.1 }).then((bs) => {
      bs.forEach((a, i) => {
        a.action.timeScale = 1.5;
        this.birds.push({ ...a, r: 10 + R() * 24, y: 9 + R() * 16, ph: R() * 6.28, w: (0.3 + R() * 0.2) * (i % 3 ? 1 : -1) });
        a.obj.visible = false;
        this.live.add(a.obj);
      });
    });
    this.loaded = birds.then(() => undefined);
  }

  /** Each frame while near. `speak` begins the telling and says whether it could. */
  update(dt: number, t: number, visitor: THREE.Vector3, reduced: boolean, still: boolean, speak: (track: string) => boolean): void {
    const d = Math.hypot(visitor.x - RN.x, visitor.z - RN.z);
    this.group.visible = d < 700;
    this.live.visible = d < 1100;
    this.surf = Math.max(0, 1 - Math.max(0, d - 30) / 220) * 0.8;
    if (!this.live.visible) return;
    this.uT.value = reduced ? t * 0.5 : t;
    // in the ancestor's gaze, still: a faint warmth comes into its eyes
    const ex = visitor.x - this.eyesAt.x, ez = visitor.z - this.eyesAt.z, ed = Math.hypot(ex, ez);
    const inland = -(ex * Math.sin(RN.face) + ez * Math.cos(RN.face)) / Math.max(ed, 1e-3);
    const want = still && ed > 5 && ed < 22 && inland > 0.85 ? 1 : 0;
    this.uEyes.value += (want - this.uEyes.value) * Math.min(1, dt * (want ? 0.25 : 0.6));
    for (const b of this.birds) {
      const a = b.ph + t * b.w;
      const x = RN.islet.x + Math.sin(a) * b.r, z = RN.islet.z + Math.cos(a) * b.r;
      b.obj.position.set(x, b.y + Math.sin(t * 0.5 + b.ph) * 2, z);
      b.obj.rotation.set(0, a + (b.w > 0 ? Math.PI / 2 : -Math.PI / 2), Math.sign(b.w) * 0.3);
      b.obj.visible = d < 600;
      b.mixer.update(dt);
    }
    if (!this.told && d < this.radius && visitor.y > RN.y - 3 && speak(this.track)) this.told = true;
  }
}

/** The crater's still pool: dark water holding a little of the sky's light, a slow shiver of
    wind on it (no reflection: the game reflects nothing). */
function poolMaterial(uT: N): THREE.MeshBasicNodeMaterial {
  const m = new THREE.MeshBasicNodeMaterial({ fog: true });
  const p = T.positionWorld;
  const ripple = sin(p.x.mul(0.9).add(p.z.mul(0.6)).add(uT.mul(0.7))).mul(sin(p.z.mul(1.3).sub(uT.mul(0.5)))).mul(0.5).add(0.5);
  const r = T.length(T.positionGeometry.xy).div(13.5);
  m.colorNode = vec4(mix(vec3(0.03, 0.06, 0.08), vec3(0.09, 0.14, 0.18), ripple.mul(0.4)).add(vec3(0.05, 0.07, 0.06).mul(smoothstep(0.75, 1, r))), 1);
  void float;
  return m;
}
