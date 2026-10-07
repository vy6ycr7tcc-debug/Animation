/* The drowned Maya city (the owner's brief, SPEC 1; the telling `MAYAN`, Aria, 251 s): a
   ceremonial city the jungle gave to the sea, and the sea has been gentle with. Wonder first,
   melancholy second; you come as a guest, not a salvager.
   - The pyramid (El Castillo, Tikal): nine terraces with sloping faces, a small temple on top
     with a roof comb, a grand stair with its balustrades facing the way you come (toward the
     shore), its foot half buried in pale sand.
   - The processional way: a low white causeway (a sacbe) from the plaza; beside it six stelae,
     each a standing ruler in low relief between columns of glyph blocks; their carvings warm
     with a little gold as you come near (no prompt: the stone notices you).
   - The reading wall: a long fallen lintel, dense with glyph bands.
   - The ball court: two long mounds with sloping benches and a stone ring on each inner wall, an
     alley between them, open at both ends to swim through.
   - The plaza: pale sand, broken paving, round carved altars, some tilted, half sunk; the sand's
     ripples slowly moving.
   - The light: strong shafts from the surface, caustics playing on the stone; the water a little
     clearer and greener here (underwater.ts `uTint`/`uShaft`).
   - Life: schools of fish flowing round the pyramid and the stelae (never through), mantas
     passing far overhead now and then. No turtle: there is no turtle model (real models or
     nothing).
   - Keepers: three priests of light (feathered headdresses, jade, deep green): one sitting still
     on the temple platform before its door, one walking slowly along the stelae (pausing at each,
     facing it), one kneeling at an altar. They never come toward you.
   The glyphs are decorative shapes in the manner of Maya glyph blocks (cartouches, bars and dots,
   scrolls), never real words or names. */
import * as THREE from "three/webgpu";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { T, type N } from "../../gpu/tsl";
import { SPAWN, type Collider } from "../terrain";
import type { RuinSite } from "../depths";
import { Keeper, Merge, place, rng, roughBlock, seaMasonry, seaStone, shafts, solidBox, solidRound, Swimmers, talud } from "./kit";
import type { Area } from "./index";
import { surface } from "../textures";

const { float, mix, positionWorld, sin, smoothstep, uniform, uv, vec3, vec4 } = T;
const V3 = THREE.Vector3;

/* ---------------------------------------------------------------- the carvings */
const COLS = 6; // stela variants side by side
const CW = 256, CH = 704;

/** One glyph block in its cartouche: decorative, after the manner of Maya blocks. */
function glyph(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, R: () => number, line: number): void {
  const r = Math.min(w, h) * 0.22;
  g.lineWidth = line;
  g.beginPath();
  g.roundRect(x + 2, y + 2, w - 4, h - 4, r);
  g.stroke();
  const cx = x + w / 2, cy = y + h / 2, k = Math.floor(R() * 6);
  g.beginPath();
  if (k === 0) {
    // bars and dots (the count of days)
    const bars = 1 + Math.floor(R() * 3), dots = Math.floor(R() * 4);
    for (let i = 0; i < bars; i++) g.rect(x + w * 0.2, y + h * (0.55 + i * 0.14), w * 0.6, h * 0.07);
    for (let i = 0; i < dots; i++) g.moveTo(x + w * (0.3 + i * 0.14) + 4, y + h * 0.35), g.arc(x + w * (0.3 + i * 0.14), y + h * 0.35, 4, 0, Math.PI * 2);
    g.fill();
    return;
  }
  if (k === 1) {
    // a scroll
    for (let a = 0; a < Math.PI * 4; a += 0.2) {
      const rr = 3 + a * w * 0.035;
      const px = cx + Math.cos(a) * rr, py = cy + Math.sin(a) * rr;
      if (a === 0) g.moveTo(px, py);
      else g.lineTo(px, py);
    }
  } else if (k === 2) {
    // a face in profile: a round head, an eye, a curl
    g.arc(cx, cy, w * 0.26, 0.3, Math.PI * 1.9);
    g.moveTo(cx + w * 0.08, cy - h * 0.05);
    g.arc(cx + w * 0.04, cy - h * 0.05, 3.5, 0, Math.PI * 2);
    g.moveTo(cx - w * 0.1, cy + h * 0.12);
    g.quadraticCurveTo(cx, cy + h * 0.28, cx + w * 0.16, cy + h * 0.14);
  } else if (k === 3) {
    // crossed bands
    g.moveTo(x + w * 0.22, y + h * 0.22);
    g.lineTo(x + w * 0.78, y + h * 0.78);
    g.moveTo(x + w * 0.78, y + h * 0.22);
    g.lineTo(x + w * 0.22, y + h * 0.78);
  } else if (k === 4) {
    // a cartouche within, and a stem
    g.roundRect(x + w * 0.3, y + h * 0.28, w * 0.4, h * 0.3, 6);
    g.moveTo(cx, y + h * 0.58);
    g.lineTo(cx, y + h * 0.8);
    g.moveTo(cx - w * 0.15, y + h * 0.8);
    g.lineTo(cx + w * 0.15, y + h * 0.8);
  } else {
    // a sun-like ring with four petals
    g.arc(cx, cy, w * 0.14, 0, Math.PI * 2);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      g.moveTo(cx + Math.cos(a) * w * 0.2, cy + Math.sin(a) * h * 0.2);
      g.lineTo(cx + Math.cos(a) * w * 0.32, cy + Math.sin(a) * h * 0.32);
    }
  }
  g.stroke();
}

/** A standing ruler in profile, in low relief: headdress plumes, a ceremonial bar across the
    chest, a long cape, sandalled feet. */
function ruler(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, R: () => number, line: number): void {
  g.lineWidth = line;
  const cx = x + w * 0.5, head = y + h * 0.2;
  g.beginPath();
  // plumes
  for (let i = 0; i < 7; i++) {
    const a = -Math.PI / 2 - 0.9 + (i / 6) * 1.6 + (R() - 0.5) * 0.08;
    g.moveTo(cx, head - h * 0.04);
    g.quadraticCurveTo(cx + Math.cos(a) * w * 0.25, head + Math.sin(a) * h * 0.12, cx + Math.cos(a - 0.4) * w * 0.42, head + Math.sin(a - 0.4) * h * 0.18 - h * 0.02);
  }
  // head and headdress band
  g.moveTo(cx + w * 0.09, head);
  g.arc(cx, head, w * 0.09, 0, Math.PI * 2);
  g.moveTo(cx - w * 0.12, head - h * 0.03);
  g.lineTo(cx + w * 0.12, head - h * 0.03);
  // body
  g.moveTo(cx - w * 0.14, head + h * 0.08);
  g.lineTo(cx - w * 0.18, y + h * 0.62);
  g.lineTo(cx + w * 0.18, y + h * 0.62);
  g.lineTo(cx + w * 0.14, head + h * 0.08);
  g.closePath();
  // the ceremonial bar held across the chest
  g.moveTo(cx - w * 0.3, head + h * 0.2);
  g.lineTo(cx + w * 0.3, head + h * 0.14);
  // belt and loincloth
  g.moveTo(cx - w * 0.18, y + h * 0.5);
  g.lineTo(cx + w * 0.18, y + h * 0.5);
  g.moveTo(cx, y + h * 0.5);
  g.lineTo(cx, y + h * 0.7);
  // legs and feet
  g.moveTo(cx - w * 0.08, y + h * 0.62);
  g.lineTo(cx - w * 0.09, y + h * 0.9);
  g.lineTo(cx - w * 0.2, y + h * 0.92);
  g.moveTo(cx + w * 0.08, y + h * 0.62);
  g.lineTo(cx + w * 0.09, y + h * 0.9);
  g.lineTo(cx + w * 0.2, y + h * 0.92);
  g.stroke();
}

/** The stelae's carvings, `COLS` variants side by side (R: the cut, G: its lip catching light). */
function stelaAtlas(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = CW * COLS;
  c.height = CH;
  const g = c.getContext("2d")!;
  g.fillStyle = "#000";
  g.fillRect(0, 0, c.width, c.height);
  g.globalCompositeOperation = "lighter";
  for (const [col, dx, dy] of [["#00c000", -2, -2], ["#ff0000", 0, 0]] as const) {
    g.strokeStyle = col;
    g.fillStyle = col;
    for (let v = 0; v < COLS; v++) {
      const R = rng(4100 + v);
      g.save();
      g.translate(v * CW + dx, dy);
      // the frame
      g.lineWidth = 6;
      g.strokeRect(14, 14, CW - 28, CH - 28);
      // glyph columns on both sides of the ruler, a row of blocks across the top
      const bw = 52, bh = 50;
      for (let i = 0; i < 4; i++) glyph(g, 26 + i * bw + 2, 26, bw - 4, bh, R, 4);
      for (let i = 0; i < 9; i++) {
        glyph(g, 22, 90 + i * 64, bw - 6, 58, R, 4);
        glyph(g, CW - 22 - bw + 6, 90 + i * 64, bw - 6, 58, R, 4);
      }
      ruler(g, 22 + bw, 92, CW - 2 * (22 + bw), CH - 130, R, 6);
      g.restore();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.NoColorSpace;
  t.anisotropy = 4;
  return t;
}

/** The reading wall: rows and rows of glyph blocks. */
function wallCarving(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 1536;
  c.height = 256;
  const g = c.getContext("2d")!;
  g.fillStyle = "#000";
  g.fillRect(0, 0, c.width, c.height);
  g.globalCompositeOperation = "lighter";
  for (const [col, dx, dy] of [["#00c000", -2, -2], ["#ff0000", 0, 0]] as const) {
    const R = rng(4700);
    g.strokeStyle = col;
    g.fillStyle = col;
    g.save();
    g.translate(dx, dy);
    g.lineWidth = 5;
    g.strokeRect(8, 8, c.width - 16, c.height - 16);
    for (let row = 0; row < 3; row++) for (let i = 0; i < 24; i++) glyph(g, 16 + i * 63, 16 + row * 76, 59, 72, R, 4);
    g.restore();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.NoColorSpace;
  t.anisotropy = 4;
  return t;
}

/* ---------------------------------------------------------------- the city */
const PYR_Z = -24; // the pyramid's centre, behind the plaza (local frame: +z toward the shore)
const BASE = 30, STEP = 1.5, TERR = 9, IN = 1.3, SUNK = 1.0;
const TOP = BASE - 2 * IN * TERR; // the top platform's width (6.6 m)
const TOP_Y = TERR * STEP - SUNK;

export function buildMayan(site: RuinSite): Area {
  const uT = uniform(0);
  const group = new THREE.Group();
  const face = Math.atan2(SPAWN.x - site.x, SPAWN.z - site.z); // the stair looks toward the shore
  group.position.set(site.x, site.y, site.z);
  group.rotation.y = face;
  const cs = Math.cos(face), sn = Math.sin(face);
  /** Local (x, z) to the world. */
  const W = (lx: number, lz: number): [number, number] => [site.x + lx * cs + lz * sn, site.z - lx * sn + lz * cs];
  const solids: Collider[] = [];
  const box = (lx: number, lz: number, hx: number, hz: number, ang: number, top: number) => {
    const [x, z] = W(lx, lz);
    solidBox(x, z, hx, hz, face + ang, site.y + top, solids);
  };
  const R = rng(9137);
  // the Maya laid small cut blocks of pale limestone in courses: the game's own masonry
  const stone = seaMasonry("sandstone_blocks_08", [1.12, 1.08, 1.0], { course: 0.48, block: 0.85, flag: 1.1 }, uT, 0.22);
  const plaster = seaMasonry("sandstone_blocks_05", [1.18, 1.14, 1.06], { course: 0.42, block: 0.75, flag: 1.0 }, uT, 0.25);
  const mg = new Merge<"stone" | "plaster">();

  // the pyramid: nine sloping terraces, the lowest buried in the sand
  for (let i = 0; i < TERR; i++) {
    const w = BASE - 2 * IN * i;
    const g = talud(w, w, STEP, 0.32, R);
    mg.add(i % 2 ? "stone" : "plaster", g, place(0, i * STEP - SUNK, PYR_Z));
    // a recessed band round each terrace (the Castillo's panels): a thin lip at its top
    mg.add("stone", new THREE.BoxGeometry(w - 0.5, 0.14, w - 0.5), place(0, i * STEP - SUNK + STEP - 0.06, PYR_Z));
    box(0, PYR_Z, w / 2, w / 2, 0, i * STEP - SUNK + STEP);
  }
  // the grand stair up the face toward the shore, between two balustrades
  {
    const run = (BASE - TOP) / 2, n = 45, rise = (TERR * STEP) / n, tread = run / n;
    for (let i = 0; i < n; i++) {
      const g = new THREE.BoxGeometry(7, rise, tread * 1.6);
      mg.add("plaster", g, place(0, i * rise + rise / 2 - SUNK, PYR_Z + BASE / 2 - tread * (i + 0.5)));
    }
    const slope = Math.atan2(TERR * STEP, run), len = Math.hypot(TERR * STEP, run);
    for (const sx of [-4, 4]) {
      const g = new THREE.BoxGeometry(1.0, 0.9, len);
      mg.add("stone", g, place(sx, (TERR * STEP) / 2 - SUNK + 0.35, PYR_Z + BASE / 2 - run / 2, 0, 1, 1, 1, slope));
      // a serpent's head at the foot of each balustrade
      mg.add("stone", roughBlock(1.3, 1.0, 1.5, R, 0.25), place(sx, -SUNK + 0.6, PYR_Z + BASE / 2 + 0.5));
    }
  }
  // the temple on top: walls, a doorway toward the stair, a roof comb
  {
    const ty = TOP_Y;
    mg.add("plaster", new THREE.BoxGeometry(5.6, 0.4, 4.6), place(0, ty + 0.2, PYR_Z));
    for (const [w, d, x, z] of [[5.6, 0.6, 0, -2], [0.6, 4.6, -2.5, 0], [0.6, 4.6, 2.5, 0], [1.9, 0.6, -1.85, 2], [1.9, 0.6, 1.85, 2]] as const)
      mg.add("plaster", new THREE.BoxGeometry(w, 3.0, d), place(x, ty + 0.4 + 1.5, PYR_Z + z));
    mg.add("stone", new THREE.BoxGeometry(5.9, 0.5, 4.9), place(0, ty + 3.65, PYR_Z));
    mg.add("stone", new THREE.BoxGeometry(5.0, 0.35, 4.2), place(0, ty + 4.05, PYR_Z));
    // the roof comb: an openwork crest over the back wall
    for (let i = 0; i < 4; i++) mg.add("plaster", new THREE.BoxGeometry(0.7, 2.0, 0.5), place(-1.8 + i * 1.2, ty + 5.2, PYR_Z - 1.2));
    mg.add("plaster", new THREE.BoxGeometry(4.6, 0.35, 0.5), place(0, ty + 6.3, PYR_Z - 1.2));
    box(0, PYR_Z, 2.9, 2.4, 0, ty + 6.5);
  }
  // the processional way: a low white causeway from the plaza, eastward
  mg.add("plaster", talud(48, 4.2, 0.45, 0.2, R), place(26, -0.2, 2));
  // the reading wall: a fallen lintel, its glyph face up toward you
  const lintel = new THREE.Mesh(roughBlock(10, 1.3, 0.9, R, 0.12), seaStone({ set: "sandstone_cracks", tint: [1.15, 1.1, 1.0], caustic: float(0.5), causticCol: [0.6, 0.9, 0.78], carve: { tex: wallCarving(), cols: 1 }, sea: 0.5, lift: 0.14 }, uT));
  lintel.position.set(-20, 0.5, 12);
  lintel.rotation.set(-0.32, 0.5, 0.06);
  lintel.receiveShadow = true;
  box(-20, 12, 5, 0.9, 0.5, 1.4);
  // its broken fellow beside it, and the jambs that held it, toppled
  mg.add("stone", roughBlock(3.2, 1.3, 0.9, R, 0.2), place(-13.6, 0.35, 15.5, 0.2, 1, 1, 1, -1.4, 0.1));
  mg.add("stone", roughBlock(1.1, 3.6, 1.1, R, 0.2), place(-24.5, 0.4, 15.5, 1.1, 1, 1, 1, 1.45, 0));
  // the ball court: two long mounds, sloping benches and upright walls toward the alley, a stone
  // ring on each wall; open at both ends
  for (const s of [-1, 1]) {
    const cx = -36 + s * 6.5;
    mg.add("plaster", talud(5, 26, 1.1, 0.0, R), place(cx, -0.3, -6));
    mg.add("stone", new THREE.BoxGeometry(5, 3.2, 26), place(cx + s * 1.0, 0.8 + 1.6, -6, 0, 0.6, 1, 1));
    mg.add("plaster", new THREE.BoxGeometry(2.2, 0.9, 26), place(cx - s * 1.6, 0.3 + 0.45, -6, 0, 1, 1, 1, 0, s * -0.55));
    const ring = new THREE.TorusGeometry(0.62, 0.18, 10, 24);
    mg.add("stone", ring, place(cx - s * 0.5 - s * 0.2, 3.2, -6, Math.PI / 2));
    box(cx + s * 0.6, -6, 2.6, 13, 0, 4.0);
  }
  // the plaza: broken paving, and round carved altars, some tilted, half sunk
  for (let i = 0; i < 46; i++) {
    const a = R() * Math.PI * 2, r = 4 + R() * 13;
    const px = Math.cos(a) * r, pz = 2 + Math.sin(a) * r * 0.8;
    mg.add("plaster", roughBlock(1.2 + R() * 0.8, 0.22, 1.0 + R() * 0.6, R, 0.1), place(px, -0.05, pz, R() * 0.6, 1, 1, 1, (R() - 0.5) * 0.08, (R() - 0.5) * 0.08));
  }
  const altars: [number, number][] = [[-6, 6], [5, 9], [-2, -4], [13, -6], [-11, -2]];
  altars.forEach(([ax, az], i) => {
    const r = 0.9 + R() * 0.35;
    const g = new THREE.CylinderGeometry(r, r * 1.04, 0.75, 22, 1);
    const tilt = i % 2 ? 0.18 + R() * 0.12 : 0.03;
    mg.add("stone", g, place(ax, 0.15, az, R() * 6, 1, 1, 1, tilt, (R() - 0.5) * 0.1));
    mg.add("stone", new THREE.TorusGeometry(r * 0.98, 0.07, 6, 28), place(ax, 0.47, az, 0, 1, 1, 1, Math.PI / 2 + tilt));
    const [x, z] = W(ax, az);
    solidRound(x, z, r + 0.1, site.y + 0.8, solids);
  });
  // sand drifted against the pyramid's foot and the mounds (the city half given to the sand)
  const sandM = new THREE.MeshStandardNodeMaterial({ roughness: 1, metalness: 0 });
  {
    const sd = surface("sand");
    const pw = positionWorld;
    const c = T.texture(sd.diff, pw.xz.div(2.2)).rgb.mul(vec3(1.12, 1.08, 0.96)).mul(1.5);
    sandM.colorNode = vec4(c, 1);
    sandM.emissiveNode = c.mul(0.1);
  }
  const sandG: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 9; i++) {
    const g = new THREE.SphereGeometry(1, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2);
    const side = i % 4, along = (R() - 0.5) * BASE * 0.8;
    const [lx, lz] = side === 0 ? [along, PYR_Z - BASE / 2] : side === 1 ? [BASE / 2, PYR_Z + along] : side === 2 ? [-BASE / 2, PYR_Z + along] : [along > 0 ? 9 : -9, PYR_Z + BASE / 2];
    g.applyMatrix4(place(lx, -0.05, lz, R() * 3, 1, 1, 1).multiply(new THREE.Matrix4().makeScale(5 + R() * 4, 1.1 + R() * 0.8, 3 + R() * 2)));
    sandG.push(g);
  }
  const sand = new THREE.Mesh(mergeAll(sandG), sandM);
  sand.receiveShadow = true;

  // the stelae: six standing stones beside the way, their carvings warming as you come near
  const nearA = new THREE.InstancedBufferAttribute(new Float32Array(6), 1);
  const varA = new THREE.InstancedBufferAttribute(new Float32Array(6), 1);
  const stelaMat = seaStone({ set: "sandstone_cracks", tint: [1.2, 1.15, 1.05], caustic: float(0.45), causticCol: [0.6, 0.9, 0.78], carve: { tex: stelaAtlas(), cols: COLS, variant: varA }, near: nearA, nearCol: [1.0, 0.74, 0.34], sea: 0.5, lift: 0.14 }, uT);
  // a stela: a tall slab, its top rounded, standing in a socket
  const stelaGeo = stelaShape();
  const stelae = new THREE.InstancedMesh(stelaGeo, stelaMat, 6);
  const stelaAt: THREE.Vector3[] = [];
  for (let i = 0; i < 6; i++) {
    const lx = 9 + i * 6.8, lz = -1.4, lean = (R() - 0.5) * 0.06, h = 2.9;
    stelae.setMatrixAt(i, place(lx, h / 2 - 0.25, lz, (R() - 0.5) * 0.12, 1, 1, 1, lean, (R() - 0.5) * 0.05));
    varA.setX(i, i % COLS);
    const [x, z] = W(lx, lz);
    stelaAt.push(new V3(x, site.y + 1.4, z));
    box(lx, lz, 0.6, 0.3, 0, 2.7);
    // a low plinth before it
    mg.add("stone", roughBlock(1.6, 0.3, 1.0, R, 0.1), place(lx, 0.0, lz + 0.8));
  }
  stelae.receiveShadow = true;
  group.add(stelae);

  const city = mg.build({ stone, plaster });
  group.add(city, lintel, sand);

  // shafts of light from the surface
  const sh: { x: number; z: number; y: number; r: number }[] = [];
  for (const [lx, lz, r] of [[0, PYR_Z, 4.5], [-3, 6, 3.5], [16, -1, 3], [33, 1, 3.2], [-36, -8, 3.4], [-18, 13, 2.6], [8, 12, 2.4]] as const) {
    const [x, z] = W(lx, lz);
    sh.push({ x, z, y: site.y, r });
  }
  const light = shafts(sh, [0.75, 0.95, 0.85], float(0.75), uT);

  // the sand's ripples, slowly moving over the plaza
  const rip = new THREE.Mesh(new THREE.CircleGeometry(30, 64), ripples(uT));
  rip.rotation.x = -Math.PI / 2;
  rip.position.set(0, 0.06, 2);
  rip.renderOrder = 1;
  group.add(rip);

  // the keepers
  const P = (lx: number, lz: number) => W(lx, lz);
  const [tx, tz] = P(0, PYR_Z + 2.9);
  const stelaPath = stelaAt.map((s, i) => {
    const [x, z] = P(9 + i * 6.8, 1.1);
    return { x, z, look: [s.x, s.z] as [number, number] };
  });
  const [kx, kz] = P(-6, 7.6);
  const [ax, az] = W(-6, 6);
  const tint: [number, number, number] = [0.45, 0.95, 0.72];
  const keepers = [
    new Keeper({ recipe: "MAYA_PRIEST", tint, x: tx, z: tz, y: site.y + TOP_Y + 0.4, face: face, pose: "sit", water: true }),
    new Keeper({ recipe: "MAYA_PRIEST", tint, x: stelaPath[0].x, z: stelaPath[0].z, face: face, pose: "walk", path: [...stelaPath, ...stelaPath.slice(1, -1).reverse()], pause: 9, water: true }),
    new Keeper({ recipe: "MAYA_PRIEST", tint, x: kx, z: kz, face: Math.atan2(-(ax - kx), -(az - kz)), pose: "kneel", water: true, every: 70 }),
  ];
  const keeperGroup = new THREE.Group();
  for (const k of keepers) keeperGroup.add(k.root);

  // fish round the pyramid and the stelae, mantas far overhead
  const [pcx, pcz] = W(0, PYR_Z);
  const [scx, scz] = W(26, 0);
  const swim = new Swimmers([
    { file: "fish1", length: 0.45, tint: [0.75, 1.0, 1.05], count: 12, cx: pcx, cz: pcz, rx: 24, rz: 24, y: 7, speed: 0.045, spread: 2.6 },
    { file: "fish3", length: 0.4, tint: [1.1, 1.0, 0.75], count: 10, cx: pcx, cz: pcz, rx: 21, rz: 21, y: 12, speed: -0.05, spread: 2.2, phase: 2 },
    { file: "fish2", length: 0.55, tint: [1.1, 0.85, 1.0], count: 8, cx: scx, cz: scz, rx: 24, rz: 8, y: 4.5, speed: 0.035, spread: 2.0, phase: 1 },
    { file: "manta", length: 2.8, tint: [0.8, 0.85, 1.15], count: 1, cx: site.x, cz: site.z, rx: 70, rz: 55, y: 17, speed: 0.022, spread: 0 },
    { file: "manta", length: 2.4, tint: [0.8, 0.85, 1.15], count: 1, cx: site.x + 10, cz: site.z - 8, rx: 60, rz: 75, y: 15, speed: -0.018, spread: 0, phase: 3 },
  ]);

  // the world: a few things outside the rotated group (in world space)
  const world = new THREE.Group();
  world.add(group, light, keeperGroup, swim.group);

  const near = new Float32Array(6);
  return {
    id: "mayan",
    track: "MAYAN",
    site,
    radius: 62,
    group: world,
    solids,
    water: { tint: [0.92, 1.12, 1.0], shaft: 1.9, shaftCol: [0.42, 0.66, 0.6] },
    loaded: Promise.all(keepers.map((k) => k.loaded)).then(() => undefined),
    update(dt: number, t: number, visitor: THREE.Vector3, reduced: boolean) {
      uT.value = t;
      for (let i = 0; i < 6; i++) {
        const d = stelaAt[i].distanceTo(visitor);
        const want = 1 - THREE.MathUtils.smoothstep(d, 4, 12);
        near[i] += (want - near[i]) * Math.min(1, dt * (want > near[i] ? 0.6 : 0.35));
        nearA.setX(i, near[i]);
      }
      nearA.needsUpdate = true;
      for (const k of keepers) k.update(dt, t, visitor, reduced);
      swim.update(dt, reduced ? t * 0.5 : t);
    },
  };
}

function mergeAll(list: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const m = new Merge<"x">();
  for (const g of list) m.add("x", g);
  return mergeGeometries(m.parts.get("x")!);
}

/** Ripples in the sand, combed by the current and slowly moving; only a soft shading over the
    floor (darker troughs, paler crests), fading out at the edge. */
function ripples(uT: N): THREE.MeshBasicNodeMaterial {
  const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
  const p = positionWorld.xz;
  const bend = T.mx_noise_float(vec3(p.x.mul(0.05), p.y.mul(0.05), uT.mul(0.01))).mul(3.5);
  const w = sin(p.x.mul(1.9).add(p.y.mul(0.6)).add(bend).sub(uT.mul(0.12)));
  const crest = smoothstep(0.55, 1, w), trough = smoothstep(-0.4, -1, w);
  const r = T.length(uv().sub(0.5)).mul(2);
  const edge = smoothstep(1, 0.6, r);
  const fade = T.clamp(float(1).sub(T.fwidth(p.x.mul(1.9)).mul(0.6)), 0, 1);
  m.colorNode = vec4(mix(vec3(0.05, 0.06, 0.06), vec3(0.75, 0.78, 0.68), crest), crest.mul(0.05).add(trough.mul(0.035)).mul(edge).mul(fade));
  return m;
}

/** A stela's slab: 1.05 × 2.9 × 0.42 m, its top rounded over, its foot at y = −1.45 (centred, as a
    box), UVs over each broad face for the carving. */
function stelaShape(): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(1.05, 2.9, 0.42, 6, 12, 1);
  const p = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i);
    const top = THREE.MathUtils.smoothstep(y, 0.9, 1.45);
    p.setY(i, y - top * (x / 0.525) * (x / 0.525) * 0.22);
    p.setX(i, x * (1 - 0.05 * (y + 1.45) / 2.9));
  }
  g.computeVertexNormals();
  return g;
}
