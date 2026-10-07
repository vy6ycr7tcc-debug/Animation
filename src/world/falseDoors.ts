/* The pyramid's false doors (the owner's ancient civilizations brief, SPEC 4): the "door of the ka",
   the one door in Egyptian building meant to be walked through only by the unseen, where the life
   of the one remembered came through to receive what was left on the slab before it.
   Eight stand round the pyramid's foot, two on each face (clear of the north entrance), each
   proud of the casing on a low plinth, facing outward to whoever walks round:
   - a recessed niche of stepped jambs under a lintel and a cavetto cornice with its roll; in its
     heart a narrow false door, the deepest recess;
   - over the door a panel in low relief: a seated figure before an offering table (decorative);
   - on the jambs, rows of glyph-like marks (never real words or names);
   - before it, an offering slab with loaves and a small vessel.
   The stone exhales (the centrepiece): on its own slow cycle (8–12 s, each door offset from its
   neighbours, a round, never in unison), a warm gold swells from within the niche and settles,
   and a breath of fine dust drifts out of it and away on the exhale. Within ~4 m it deepens a
   little (more light, more dust): the stone noticing you, never a fright. And within a few metres
   you hear it: a very soft breath of air on the same cycle (`audio.stoneBreath`), under
   everything. No figures here: the doors are the presences.
   Also here: the place where the pyramid meditation begins (`PYRAMID-MEDITATION`), a calm zone on
   the plaza before the north face (on the ground, not on the faces). */
import * as THREE from "three/webgpu";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { T, outOfTheWay, softPoints, spriteCloud, viewDepth, gpuUniforms, type N } from "../gpu/tsl";
import { scan } from "./temple";
import { colliders, heightAt, PYRAMID } from "./terrain";

const { abs, cameraPosition, clamp, float, fract, length, max, mix, positionWorld, pow, sin, smoothstep, uniform, uv, vec2, vec3, vec4 } = T;
const V3 = THREE.Vector3;

function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

/* ---------------------------------------------------------------- the carving */
/** The door's carving, drawn once (R: the cut, G: its lip catching light): the offering scene in
    the panel above the false door, rows of glyph-like marks on the jambs. In the door's own UV
    (the front faces of its stones, laid as one 4.2 × 5.6 m elevation). */
function doorCarving(): THREE.CanvasTexture {
  const W = 420, H = 560; // 1 px = 1 cm
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d")!;
  g.fillStyle = "#000";
  g.fillRect(0, 0, W, H);
  g.globalCompositeOperation = "lighter";
  const R = rng(311);
  for (const [col, dx, dy] of [["#00b000", -1.5, -1.5], ["#ff0000", 0, 0]] as const) {
    g.save();
    g.translate(dx, dy);
    g.strokeStyle = col;
    g.fillStyle = col;
    g.lineWidth = 3;
    // glyph-like marks in columns down the outer jambs (x 30–95 and 325–390), between rules
    for (const x0 of [32, 324]) {
      g.strokeRect(x0, 120, 64, 400);
      for (let k = 0; k < 9; k++) {
        const y = 134 + k * 43, cx = x0 + 32, kind = Math.floor(R() * 7);
        g.beginPath();
        if (kind === 0) g.ellipse(cx, y + 14, 18, 9, 0, 0, Math.PI * 2); // an oval
        else if (kind === 1) for (let w = 0; w < 3; w++) g.moveTo(cx - 20, y + 4 + w * 9), g.quadraticCurveTo(cx - 10, y - 2 + w * 9, cx, y + 4 + w * 9), g.quadraticCurveTo(cx + 10, y + 10 + w * 9, cx + 20, y + 4 + w * 9); // water
        else if (kind === 2) g.moveTo(cx - 6, y + 30), g.lineTo(cx - 6, y), g.quadraticCurveTo(cx + 2, y + 6, cx - 6, y + 12); // a reed
        else if (kind === 3) g.arc(cx, y + 15, 12, 0, Math.PI * 2), g.moveTo(cx + 3, y + 15), g.arc(cx, y + 15, 3, 0, Math.PI * 2); // a sun
        else if (kind === 4) g.rect(cx - 16, y + 6, 32, 18); // a block
        else if (kind === 5) g.moveTo(cx - 18, y + 26), g.lineTo(cx, y + 2), g.lineTo(cx + 18, y + 26); // a hill
        else g.moveTo(cx - 18, y + 14), g.lineTo(cx + 18, y + 14), g.moveTo(cx, y + 2), g.lineTo(cx, y + 26); // a cross of lines
        g.stroke();
      }
    }
    // the offering panel over the door (x 130–290, y 120–250): a seated figure before a table of
    // loaves, in low relief, its outline cut
    g.strokeRect(130, 122, 160, 126);
    g.lineWidth = 4;
    g.beginPath();
    // the seated figure (left), facing right: head, shoulder, the arm reaching to the table, the seat
    g.arc(170, 156, 11, 0, Math.PI * 2);
    g.moveTo(166, 168);
    g.lineTo(160, 206);
    g.lineTo(186, 206);
    g.lineTo(190, 226);
    g.moveTo(170, 178);
    g.lineTo(204, 186);
    g.moveTo(150, 208);
    g.lineTo(150, 236);
    g.lineTo(196, 236);
    // the table on its stand, and the tall loaves on it
    g.moveTo(214, 236);
    g.lineTo(214, 200);
    g.moveTo(204, 200);
    g.lineTo(264, 200);
    for (let k = 0; k < 6; k++) {
      const x = 210 + k * 9;
      g.moveTo(x, 200);
      g.lineTo(x + 4, 168 + (k % 2) * 6);
      g.lineTo(x + 8, 200);
    }
    // a jar and a basin under the table
    g.moveTo(244, 236);
    g.quadraticCurveTo(234, 222, 244, 210);
    g.lineTo(254, 210);
    g.quadraticCurveTo(264, 222, 254, 236);
    g.stroke();
    g.restore();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.NoColorSpace;
  t.anisotropy = 4;
  return t;
}

/** The doors' limestone, matching the pyramid's casing: the scan from three sides, weathered
    toward the foot, the carving read through the door's elevation UV on its front faces. */
function doorStone(carve: THREE.Texture): THREE.MeshStandardNodeMaterial {
  const m = new THREE.MeshStandardNodeMaterial({ metalness: 0, roughness: 0.85 });
  // monolithic slabs, as false doors were cut: only the stone's grain (the block scan's bricks
  // made it read as a wall of small blocks), in the block scan's colour
  const S = scan("sandstone_cracks");
  const pw = positionWorld, n = T.normalWorldGeometry;
  const wp = T.pow(abs(n), vec3(4));
  const w = wp.div(wp.x.add(wp.y).add(wp.z));
  const tile = 2.6;
  const tri = (t: THREE.Texture) => T.texture(t, pw.zy.div(tile)).mul(w.x).add(T.texture(t, pw.xz.div(tile)).mul(w.y)).add(T.texture(t, pw.xy.div(tile)).mul(w.z));
  const arm = tri(S.arm);
  let c: N = tri(S.diff).rgb.mul(vec3(1.4 * 0.835, 1.34 * 0.965, 1.22 * 1.141)).mul(mix(float(0.55), float(1), arm.r));
  // the door's elevation, carried as a second UV set (`uv1`, 0..1 over 4.2 × 5.6 m) on front faces
  const k = T.texture(carve, T.uv(1));
  const front = T.attribute("aFront", "float");
  const cut = k.r.mul(front), lip = k.g.mul(front);
  c = c.mul(float(1).sub(cut.mul(0.72))).add(c.mul(lip.mul(0.4)));
  // grime and sand toward the foot, dust in what faces up
  const foot = smoothstep(1.6, 0, pw.y.sub(PYRAMID.y));
  c = mix(c, c.mul(vec3(0.82, 0.74, 0.62)), foot.mul(0.5));
  const nz = T.mx_noise_float(pw.mul(0.8)).mul(0.5).add(0.5);
  c = mix(c, vec3(0.86, 0.76, 0.6), smoothstep(0.6, 0.95, n.y).mul(nz).mul(0.4));
  m.colorNode = vec4(c, 1);
  m.roughnessNode = clamp(arm.g, 0.5, 1);
  const nm = (t: THREE.Texture) => [T.texture(t, pw.zy.div(tile)), T.texture(t, pw.xz.div(tile)), T.texture(t, pw.xy.div(tile))].map((x: N) => x.xy.mul(2).sub(1));
  const [nx, ny, nzz] = nm(S.nor);
  const dn = vec3(0, nx.y, nx.x).mul(w.x).add(vec3(ny.x, 0, ny.y).mul(w.y)).add(vec3(nzz.x, nzz.y, 0).mul(w.z));
  m.normalNode = T.normalize(T.normalView.add(T.cameraViewMatrix.mul(vec4(dn.mul(1.2), 0)).xyz));
  m.emissiveNode = c.mul(0.04);
  return m;
}

/* ---------------------------------------------------------------- one door, in its own frame */
/* The door's frame: x along the face (−2.1 … 2.1), y up from the ground, z out of the face (the
   front of the outermost stones at z = 0, the niche going back into −z). */
const DW = 4.2, DH = 5.6;
type Box = { x: number; y: number; z: number; w: number; h: number; d: number; front?: boolean };
const DOOR: Box[] = [
  { x: 0, y: 0.2, z: -1.2, w: 4.8, h: 0.4, d: 3.2 }, // the plinth
  // outer jambs (full height), and the lintel over the whole
  { x: -1.75, y: 0.4 + 2.35, z: -1.5, w: 0.7, h: 4.7, d: 3.0, front: true },
  { x: 1.75, y: 0.4 + 2.35, z: -1.5, w: 0.7, h: 4.7, d: 3.0, front: true },
  { x: 0, y: 0.4 + 4.7 + 0.35, z: -1.5, w: 4.2, h: 0.7, d: 3.0, front: true },
  // the cavetto cornice's roll and its flare above
  { x: 0, y: 5.85, z: -1.45, w: 4.3, h: 0.16, d: 3.2 },
  { x: 0, y: 6.15, z: -1.4, w: 4.6, h: 0.45, d: 3.4 },
  // the second step in: inner jambs and the panel band (the offering scene), set back 0.18
  { x: -1.1, y: 0.4 + 1.65, z: -1.68, w: 0.6, h: 3.3, d: 3.0, front: true },
  { x: 1.1, y: 0.4 + 1.65, z: -1.68, w: 0.6, h: 3.3, d: 3.0, front: true },
  { x: 0, y: 0.4 + 3.3 + 0.7, z: -1.68, w: 2.8, h: 1.4, d: 3.0, front: true },
  // the drum (a round lintel) over the false door, set back further
  { x: 0, y: 0.4 + 3.05, z: -1.85, w: 1.6, h: 0.5, d: 3.0 },
  // the false door's back, deepest of all
  { x: 0, y: 0.4 + 1.4, z: -2.6, w: 1.6, h: 2.8, d: 1.8, front: true },
];
/** Merge a door's stones into one geometry in its own frame, with the elevation UV (`uv1`) and
    which faces are the carved fronts (`aFront`). */
function doorGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (const b of DOOR) {
    const g = new THREE.BoxGeometry(b.w, b.h, b.d);
    g.translate(b.x, b.y, b.z);
    const p = g.attributes.position as THREE.BufferAttribute, nrm = g.attributes.normal as THREE.BufferAttribute;
    const uv1 = new Float32Array(p.count * 2), fr = new Float32Array(p.count);
    for (let i = 0; i < p.count; i++) {
      uv1[i * 2] = (p.getX(i) + DW / 2) / DW;
      uv1[i * 2 + 1] = 1 - (DH - p.getY(i)) / DH;
      fr[i] = b.front && nrm.getZ(i) > 0.9 ? 1 : 0;
    }
    g.setAttribute("uv1", new THREE.BufferAttribute(uv1, 2));
    g.setAttribute("aFront", new THREE.BufferAttribute(fr, 1));
    parts.push(g);
  }
  return mergeGeometries(parts);
}

/** The offering slab and what was left on it: loaves (tall and round), a small vessel. */
function offeringGeometry(R: () => number): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const slab = new THREE.BoxGeometry(2.4, 0.28, 1.2);
  slab.translate(0, 0.14, 0);
  parts.push(slab);
  // a raised offering table shape cut in it (a hetep: a mat with a loaf), as a low block
  const mat = new THREE.BoxGeometry(1.0, 0.06, 0.6);
  mat.translate(0, 0.31, 0);
  parts.push(mat);
  for (let k = 0; k < 4; k++) {
    const loaf = k % 2 ? new THREE.SphereGeometry(0.14, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2) : new THREE.ConeGeometry(0.09, 0.42, 10);
    if (k % 2) loaf.scale(1, 0.7, 1.2);
    loaf.translate(-0.32 + k * 0.22 + (R() - 0.5) * 0.04, k % 2 ? 0.34 : 0.55, (R() - 0.5) * 0.2);
    parts.push(loaf);
  }
  const vessel = new THREE.LatheGeometry([0, 0.07, 0.11, 0.12, 0.09, 0.05, 0.06].map((r, i) => new THREE.Vector2(r, i * 0.05)), 14);
  vessel.translate(0.82, 0.28, 0.2);
  parts.push(vessel);
  const g = mergeGeometries(parts.map((g) => {
    const x = g.index ? g.toNonIndexed() : g;
    for (const a of Object.keys(x.attributes)) if (a !== "position" && a !== "normal") x.deleteAttribute(a);
    return x;
  }));
  // the door's stone reads these: no carving on the offering
  const n = g.attributes.position.count;
  g.setAttribute("uv1", new THREE.BufferAttribute(new Float32Array(n * 2), 2));
  g.setAttribute("aFront", new THREE.BufferAttribute(new Float32Array(n), 1));
  return g;
}

/* ---------------------------------------------------------------- all eight */
export class FalseDoors {
  readonly group = new THREE.Group();
  private uT = uniform(0);
  /** Each door: where it stands (world), its outward heading, its breath's period and phase. */
  readonly doors: { at: THREE.Vector3; out: THREE.Vector3; period: number; phase: number; near: number; breath: number }[] = [];
  private uBreath: { value: number }[] = [];
  private uNear: { value: number }[] = [];
  /** Where the pyramid meditation begins: the plaza before the north face. */
  readonly calm: { x: number; z: number; r: number };

  constructor() {
    const R = rng(4402);
    const { x: px, y: py, z: pz, half: H } = PYRAMID;
    const carve = doorCarving();
    const stone = doorStone(carve);
    const geo = doorGeometry();
    const offering = offeringGeometry(R);
    const glowGeo = new THREE.PlaneGeometry(1.5, 2.7);
    glowGeo.translate(0, 0.4 + 1.4, -1.68);
    // two on each face, 26 m either side of the face's middle (the north entrance stands between)
    const faces = [
      { nx: 0, nz: -1 }, // north (−z), the entrance's face
      { nx: 1, nz: 0 },
      { nx: 0, nz: 1 },
      { nx: -1, nz: 0 },
    ];
    let i = 0;
    for (const f of faces)
      for (const s of [-26, 26]) {
        const tx = -f.nz, tz = f.nx; // along the face
        const bx = px + f.nx * (H + 0.9) + tx * s, bz = pz + f.nz * (H + 0.9) + tz * s;
        const by = heightAt(bx, bz);
        const head = Math.atan2(f.nx, f.nz); // +z of the door's frame turned outward
        const door = new THREE.Group();
        door.position.set(bx, by, bz);
        door.rotation.y = head;
        const mesh = new THREE.Mesh(geo, stone);
        mesh.castShadow = mesh.receiveShadow = true;
        const slab = new THREE.Mesh(offering, stone);
        slab.position.set(0, 0, 1.7);
        slab.rotation.y = (R() - 0.5) * 0.08;
        slab.receiveShadow = true;
        // the warm light within the niche: dim at rest, swelling with the exhale
        const uB = uniform(0), uN = uniform(0);
        const gm = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
        {
          const q = uv().sub(vec2(0.5, 0.45)).mul(vec2(2.2, 1.3));
          const soft = smoothstep(1, 0.1, length(q));
          gm.colorNode = vec4(vec3(1.0, 0.76, 0.42).mul(soft).mul(uB.mul(float(0.55).add(uN.mul(0.35))).add(0.05)).mul(0.5), 1);
        }
        const glow = new THREE.Mesh(glowGeo, gm);
        glow.position.z = 0.02;
        // the breath of dust: motes born in the niche, drifting out and up on the exhale
        const motes = breathMotes(this.uT, uB, uN, R, i);
        door.add(mesh, slab, glow, motes);
        this.group.add(door);
        // solid: the door's block (its jambs and plinth), turned with it
        colliders.push({ x: bx, z: bz, r: 0, hx: 2.4, hz: 1.6, ang: head, top: by + 6.4 });
        const out = new V3(f.nx, 0, f.nz);
        this.doors.push({ at: new V3(bx + f.nx * 1.0, by + 1.8, bz + f.nz * 1.0), out, period: 8 + ((i * 7) % 9) * 0.5, phase: R() * 12, near: 0, breath: 0 });
        this.uBreath.push(uB as unknown as { value: number });
        this.uNear.push(uN as unknown as { value: number });
        i++;
      }
    void py;
    this.calm = { x: px, z: pz - H - 24, r: 20 };
  }

  /** The breath of one door at time t: 0 at rest, rising and settling through its exhale. */
  private breathOf(d: { period: number; phase: number }, t: number): number {
    const u = ((t + d.phase) % d.period) / d.period;
    // a long slow exhale (the first half), then a quiet rest
    return u < 0.55 ? Math.pow(Math.sin((Math.PI * u) / 0.55), 1.6) : 0;
  }

  /** Each frame near the pyramid. Returns how loud the nearest breathing door should be (0…1). */
  update(dt: number, t: number, visitor: THREE.Vector3, reduced: boolean): number {
    this.uT.value = t;
    let loud = 0;
    this.doors.forEach((d, i) => {
      const dist = Math.hypot(visitor.x - d.at.x, visitor.z - d.at.z);
      const want = 1 - THREE.MathUtils.smoothstep(dist, 3.5, 6);
      d.near += (want - d.near) * Math.min(1, dt * 0.8);
      d.breath = this.breathOf(d, reduced ? t * 0.7 : t);
      this.uBreath[i].value = d.breath;
      this.uNear[i].value = d.near;
      // heard only within a few metres
      loud = Math.max(loud, d.breath * (1 - THREE.MathUtils.smoothstep(dist, 2.5, 7)));
    });
    return loud;
  }

  /** In the calm zone before the north face, on the ground (not climbing the faces). */
  inCalm(p: THREE.Vector3): boolean {
    return Math.hypot(p.x - this.calm.x, p.z - this.calm.z) < this.calm.r && p.y < PYRAMID.y + 2.5;
  }
}

/** Fine dust breathed out of a niche: each mote leaves the niche on its own delay in the exhale,
    drifting outward and a little up, slowing and fading (door frame). */
function breathMotes(uT: N, uB: N, uN: N, R: () => number, seed: number): THREE.Sprite {
  const n = 70;
  const mat = softPoints();
  const c = spriteCloud(n, { aK: 4 }, mat);
  const a = c.attrs.aK.array as Float32Array;
  for (let i = 0; i < n; i++) a.set([R(), R(), R(), R()], i * 4);
  const K = c.nodes.aK;
  // where it is in its own little journey out: tied to the breath (more of them when you are near)
  const life = fract(uT.mul(0.09).add(K.x).add(seed * 0.13));
  const go = smoothstep(0, 1, life);
  const start = vec3(K.y.sub(0.5).mul(1.2), float(0.6).add(K.z.mul(2.4)), -1.6);
  const drift = vec3(K.y.sub(0.5).mul(1.6), K.w.mul(1.2).add(0.2), float(2.4).add(K.z.mul(2.6)));
  const p = start.add(drift.mul(go)).add(vec3(sin(uT.mul(0.7).add(K.x.mul(30))).mul(0.12), 0, 0));
  mat.positionNode = p;
  const wp = T.modelWorldMatrix.mul(vec4(p, 1)).xyz;
  mat.sizeNode = clamp(gpuUniforms.px.mul(0.025).div(max(viewDepth(wp), 0.4)), float(1).div(gpuUniforms.dpr), 5);
  const shown = smoothstep(0.75, 0.6, K.w.sub(uN.mul(0.35))); // near, more of them come
  const k = uB.mul(smoothstep(0, 0.15, life)).mul(smoothstep(1, 0.5, life)).mul(shown);
  const soft = smoothstep(0.5, 0.1, length(T.pointUV.sub(0.5)));
  mat.colorNode = vec4(vec3(1.0, 0.82, 0.55).mul(soft).mul(k).mul(0.6).mul(outOfTheWay(wp)), 1);
  void pow;
  void cameraPosition;
  return c.sprite;
}
