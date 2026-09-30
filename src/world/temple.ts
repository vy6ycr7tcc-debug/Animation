/* The temple (Samuel: "when the character goes into the temple… it enters and it's like a place
   to meditate and here is where we go through all the archetypes… it's no longer the open
   world… it's like another dimension, more solid… it's got to be the Egyptian temple… use as a
   basis the tarot cards… in 3D… an interactive place for actual reflection and meditation").
   A pylon gate stands in the open world near the shore; walk through its door and you are
   inside: a place apart (built far beyond the world's edge, the world hidden while you are here).
   - The hypostyle hall: two rows of papyrus-bundle columns, painted in faded bands, under a blue
     ceiling of gold stars; the walls carved in registers of glyph-like forms; light falling in
     shafts from the clerestory along the aisle; braziers.
   - Along its walls, fourteen shrines: the Mind's seven on the left (I–VII), the Body's seven on
     the right (VIII–XIV). In each stands the archetype as on its card (the same beings as in the
     world, recreated from Samuel's Ra tarot), on a plinth in a carved niche, its numeral above.
   - Through a gateway, the sanctuary: the Spirit's seven (XV–XXI) in a ring, facing the centre,
     where the Choice (XXII) stands on a round dais in a shaft of light from an opening above.
   Walk back out through the door you came in by. */
import * as THREE from "three/webgpu";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { Beings, type BeingModel } from "./beings";
import type { Sparks } from "./life";
import type { Station } from "./stations";
import { surface } from "./textures";
import { colliders, heightAt, keptClear, LANDMARK_SITES, SPAWN, WATER_Y, type Collider } from "./terrain";
import { gpuUniforms, T, vnoise, worldPoints, type N } from "../gpu/tsl";
import { ribbonGeometry, ribbonMaterial } from "../gpu/ribbons";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { floatAttributes, loadBytes } from "../core/assets";

const { clamp, dot, exp, float, length, mix, positionWorld, smoothstep, texture, uniform, uv, vec2, vec3, vec4 } = T;

/** Where the temple stands: far beyond the world's edge, a place apart. */
export const TEMPLE_ORIGIN = new THREE.Vector3(30000, 1, 0);
const HALL_X = 12, HALL_Z0 = 32, HALL_Z1 = -30; // the hall: x ±12, z from the door (+32) to the gateway (-30)
const SANCT_X = 16, SANCT_Z1 = -58; // the sanctuary: x ±16, z -30 … -58
const WALL_H = 13;
const NICHE_Z = [25, 16.8, 8.6, 0.4, -7.8, -16, -24.2]; // the hall's shrines, door to gateway
const COL_Z = [29, 20.9, 12.7, 4.5, -3.7, -11.9, -20.1, -27.6]; // between them
const CENTRE = new THREE.Vector3(0, 0, -44); // the sanctuary's centre, where the Choice stands
const STATUE_SCALE = 1.3;

/** Is this point inside the temple's place apart? */
export const inTempleRegion = (x: number) => x > TEMPLE_ORIGIN.x - 500;

/* ---------- photo-scanned stone (Poly Haven, CC0; see CREDITS.md) ---------- */
export type ScanName = "sandstone_blocks_08" | "sandstone_blocks_05" | "sandstone_cracks" | "red_sandstone_pavement";
const scans = new Map<ScanName, { diff: THREE.Texture; nor: THREE.Texture; arm: THREE.Texture }>();
const loader = new THREE.TextureLoader();
export function scan(name: ScanName): { diff: THREE.Texture; nor: THREE.Texture; arm: THREE.Texture } {
  let s = scans.get(name);
  if (!s) {
    const load = (k: string, colour: boolean) => {
      const t = loader.load(`textures/temple/${name}_${k}.jpg`);
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.anisotropy = 8;
      t.colorSpace = colour ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      return t;
    };
    s = { diff: load("diff", true), nor: load("nor", false), arm: load("arm", false) };
    scans.set(name, s);
  }
  return s;
}

/* ---------- surfaces drawn on canvases ---------- */

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return [c, c.getContext("2d")!];
}
function canvasTexture(c: HTMLCanvasElement, repeat = true, data = false): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = data ? THREE.NoColorSpace : THREE.SRGBColorSpace; // data: read as numbers (the relief's overlay)
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

/** A small seeded random, so the carvings are the same every time. */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

/** The walls: 8 m of wall, full height, carved in registers (sunk relief: a dark cut with a
    light lip below it), with faded pigment in the cuts: ochre, a little blue and green. */
function reliefTexture(): THREE.CanvasTexture {
  const PX = 128, W = 8 * PX, H = WALL_H * PX;
  const [c, g] = canvas(W, H);
  const r = rng(7);
  // an overlay on the real stone beneath (the scan): mid grey changes nothing, darker is the cut,
  // lighter the lit lip, colour the paint left in the cuts
  g.fillStyle = "#808080";
  g.fillRect(0, 0, W, H);
  const Y = (m: number) => H - m * PX; // metres from the floor to canvas y
  const cut = (draw: () => void, pigment?: string) => {
    // each pass builds the path, then strokes it: the lit lip, the shadowed cut, the paint in it
    g.save();
    g.translate(1.5, 2);
    g.strokeStyle = "rgba(246,226,190,0.55)";
    draw();
    g.stroke();
    g.restore();
    g.strokeStyle = "rgba(62,42,24,0.6)";
    draw();
    g.stroke();
    if (pigment) {
      g.save();
      g.strokeStyle = pigment;
      g.lineWidth = Math.max(1, g.lineWidth * 0.55);
      draw();
      g.stroke();
      g.restore();
    }
  };
  const band = (m: number, col: string, hgt: number) => {
    g.fillStyle = col;
    g.fillRect(0, Y(m + hgt), W, hgt * PX);
  };
  // the dado: plain, with painted bands above it
  band(1.2, "rgba(120,52,36,0.45)", 0.08);
  band(1.32, "rgba(40,70,110,0.4)", 0.06);
  band(1.4, "rgba(170,120,40,0.4)", 0.06);
  // the glyphs: simple forms, carved in columns and rows
  const glyph = (k: number, x: number, y: number, s: number) => {
    g.lineWidth = Math.max(1.5, s * 0.055);
    g.beginPath();
    switch (k) {
      case 0: // the sun on the horizon
        g.arc(x, y - s * 0.15, s * 0.3, 0, Math.PI * 2);
        g.moveTo(x - s * 0.45, y + s * 0.3);
        g.lineTo(x + s * 0.45, y + s * 0.3);
        break;
      case 1: // water
        for (let j = 0; j < 3; j++) {
          const yy = y - s * 0.25 + j * s * 0.25;
          g.moveTo(x - s * 0.45, yy);
          for (let q = 0; q <= 6; q++) g.lineTo(x - s * 0.45 + (q * s * 0.9) / 6, yy + (q % 2 ? -s * 0.08 : s * 0.08));
        }
        break;
      case 2: // a reed
        g.moveTo(x, y + s * 0.45);
        g.quadraticCurveTo(x + s * 0.12, y - s * 0.1, x - s * 0.05, y - s * 0.45);
        g.moveTo(x, y);
        g.quadraticCurveTo(x + s * 0.25, y - s * 0.15, x + s * 0.2, y - s * 0.3);
        break;
      case 3: // a star, as the temples drew it: five arms from a centre
        for (let j = 0; j < 5; j++) {
          const a = -Math.PI / 2 + (j * 2 * Math.PI) / 5;
          g.moveTo(x, y);
          g.lineTo(x + Math.cos(a) * s * 0.38, y + Math.sin(a) * s * 0.38);
        }
        break;
      case 4: // a lotus
        g.moveTo(x - s * 0.4, y + s * 0.35);
        g.lineTo(x + s * 0.4, y + s * 0.35);
        g.moveTo(x, y + s * 0.35);
        g.quadraticCurveTo(x - s * 0.1, y - s * 0.1, x, y - s * 0.45);
        g.quadraticCurveTo(x + s * 0.1, y - s * 0.1, x, y + s * 0.35);
        g.moveTo(x, y + s * 0.35);
        g.quadraticCurveTo(x - s * 0.45, y, x - s * 0.35, y - s * 0.3);
        g.moveTo(x, y + s * 0.35);
        g.quadraticCurveTo(x + s * 0.45, y, x + s * 0.35, y - s * 0.3);
        break;
      case 5: // a spiral
        for (let q = 0; q <= 40; q++) {
          const a = q * 0.42, rr = (q / 40) * s * 0.42;
          const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr;
          if (q) g.lineTo(px, py);
          else g.moveTo(px, py);
        }
        break;
      case 6: // the mound
        g.moveTo(x - s * 0.45, y + s * 0.35);
        g.lineTo(x, y - s * 0.4);
        g.lineTo(x + s * 0.45, y + s * 0.35);
        g.closePath();
        break;
      case 7: // a loop of cord
        g.ellipse(x, y - s * 0.12, s * 0.2, s * 0.26, 0, 0, Math.PI * 2);
        g.moveTo(x - s * 0.3, y + s * 0.3);
        g.lineTo(x + s * 0.3, y + s * 0.3);
        break;
      case 8: // a bowl
        g.arc(x, y - s * 0.1, s * 0.38, 0, Math.PI);
        break;
      case 9: // three strokes
        for (let j = -1; j <= 1; j++) {
          g.moveTo(x + j * s * 0.22, y - s * 0.35);
          g.lineTo(x + j * s * 0.22, y + s * 0.35);
        }
        break;
      case 10: // a square within a square
        g.rect(x - s * 0.38, y - s * 0.38, s * 0.76, s * 0.76);
        g.rect(x - s * 0.18, y - s * 0.18, s * 0.36, s * 0.36);
        break;
      default: // a zigzag
        g.moveTo(x - s * 0.4, y);
        for (let q = 0; q <= 5; q++) g.lineTo(x - s * 0.4 + (q * s * 0.8) / 5, y + (q % 2 ? -s * 0.25 : s * 0.25));
    }
  };
  const pig = ["rgba(150,62,36,0.5)", "rgba(40,86,138,0.48)", "rgba(56,112,84,0.42)", "rgba(190,140,52,0.5)"]; // faded by the ages
  // four registers, each a line of great forms between columns of small ones
  const regs = [[1.8, 3.9], [4.3, 6.3], [6.7, 8.7], [9.1, 11.0]];
  for (const [a, b] of regs) {
    band(a - 0.08, "rgba(70,48,28,0.35)", 0.04); // the ground line
    const mid = (a + b) / 2;
    for (let x = 0.5; x < 8; x += 2) {
      // a great form
      const k = Math.floor(r() * 12);
      cut(() => glyph(k, x * PX, Y(mid), (b - a) * PX * 0.5), pig[Math.floor(r() * pig.length)]);
      // columns of small ones beside it, painted in turn, between ruled lines (as text runs)
      for (const cx of [0.7, 1.0, 1.3]) {
        let j = 0;
        for (let yy = a + 0.25; yy < b - 0.1; yy += 0.3) {
          const kk = Math.floor(r() * 12); // chosen once: the lip, the cut and the paint are one glyph
          cut(() => glyph(kk, (x + cx) * PX, Y(yy), PX * 0.24), pig[(j++ + Math.floor(cx * 10)) % pig.length]);
        }
      }
      g.lineWidth = 2;
      cut(() => {
        g.beginPath();
        for (const lx of [0.55, 0.85, 1.15, 1.45]) {
          g.moveTo((x + lx) * PX, Y(a));
          g.lineTo((x + lx) * PX, Y(b));
        }
      });
    }
  }
  // the frieze of reed-bundles along the top
  for (let x = 0; x < W; x += PX * 0.4) {
    g.lineWidth = 3;
    cut(() => {
      g.beginPath();
      g.moveTo(x + PX * 0.08, Y(11.4));
      g.lineTo(x + PX * 0.08, Y(12.2));
      g.arc(x + PX * 0.2, Y(12.2), PX * 0.12, Math.PI, 0);
      g.lineTo(x + PX * 0.32, Y(11.4));
    }, x % (PX * 1.2) < 1 ? pig[1] : pig[3]);
  }
  band(12.35, "rgba(40,70,110,0.45)", 0.1);
  band(12.5, "rgba(170,120,40,0.45)", 0.08);
  return canvasTexture(c, true, true);
}

/** The ceiling: deep blue, with rows of five-pointed gold stars (as on temple ceilings). */
function starTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(512, 512);
  g.fillStyle = "#16244f";
  g.fillRect(0, 0, 512, 512);
  const r = rng(3);
  for (let i = 0; i < 900; i++) {
    g.fillStyle = `rgba(10,16,40,${r() * 0.2})`;
    g.fillRect(r() * 512, r() * 512, 4 + r() * 20, 2 + r() * 8);
  }
  g.fillStyle = "#d8ae55";
  for (let y = 0; y < 4; y++)
    for (let x = 0; x < 4; x++) {
      const cx = x * 128 + 64 + (y % 2) * 64, cy = y * 128 + 64, s = 30;
      g.beginPath();
      for (let j = 0; j < 10; j++) {
        const a = -Math.PI / 2 + (j * Math.PI) / 5, rr = j % 2 ? s * 0.38 : s;
        g.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
      }
      g.closePath();
      g.fill();
    }
  return canvasTexture(c);
}

/** A numeral carved and gilded on a coloured field, for the lintel over a shrine. */
function numeralTexture(numeral: string, name: string, tint: THREE.Color): THREE.CanvasTexture {
  // cut into the stone, not a painted box: a sunk border, the letters incised (a shadowed cut
  // with a lit lip) and gilded, a thread of the archetype's colour under the name
  const [c, g] = canvas(512, 160);
  g.fillStyle = "#a88a62";
  g.fillRect(0, 0, 512, 160);
  for (let k = 0; k < 900; k++) {
    g.fillStyle = `rgba(${k % 2 ? "60,44,28" : "220,196,160"},${0.05 + Math.random() * 0.06})`;
    g.fillRect(Math.random() * 512, Math.random() * 160, 1 + Math.random() * 3, 1 + Math.random() * 2);
  }
  const cut = (x: number, y: number, w: number, h: number) => {
    g.strokeStyle = "rgba(50,34,20,0.7)";
    g.lineWidth = 3;
    g.strokeRect(x, y, w, h);
    g.strokeStyle = "rgba(235,212,170,0.45)";
    g.lineWidth = 1.5;
    g.strokeRect(x + 2, y + 2, w, h);
  };
  cut(26, 14, 460, 132);
  g.textAlign = "center";
  g.textBaseline = "middle";
  const letters = (text: string, font: string, y: number) => {
    g.font = font;
    g.fillStyle = "rgba(235,212,170,0.5)";
    g.fillText(text, 257.5, y + 1.5);
    g.fillStyle = "rgba(45,30,16,0.85)";
    g.fillText(text, 255, y - 1);
    g.fillStyle = "#c9a256";
    g.fillText(text, 256, y);
  };
  letters(numeral, "600 62px Georgia, 'Times New Roman', serif", 64);
  letters(name, "italic 26px Georgia, 'Times New Roman', serif", 116);
  g.fillStyle = `rgb(${Math.round(Math.min(1, tint.r * 0.7) * 255)},${Math.round(Math.min(1, tint.g * 0.7) * 255)},${Math.round(Math.min(1, tint.b * 0.7) * 255)})`;
  g.fillRect(196, 134, 120, 2);
  return canvasTexture(c, false);
}

/* ---------- geometry ---------- */

/** Boxes placed in the temple's frame, their faces mapped in metres (so a texture keeps its scale). */
function block(list: THREE.BufferGeometry[], w: number, h: number, d: number, x: number, y: number, z: number, uvScale = 3, ry = 0): void {
  const g = new THREE.BoxGeometry(w, h, d).toNonIndexed();
  g.rotateY(ry);
  g.translate(x, y, z);
  worldUV(g, uvScale);
  list.push(g);
}
/** Faces mapped by where they are: walls by (along, height), floors and ceilings by (x, z). */
function worldUV(g: THREE.BufferGeometry, s: number, heightV = false): void {
  const p = g.attributes.position, n = g.attributes.normal;
  const uvs = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
    let u: number, v: number;
    if (ay > ax && ay > az) (u = p.getX(i)), (v = p.getZ(i));
    else if (ax > az) (u = p.getZ(i)), (v = p.getY(i));
    else (u = p.getX(i)), (v = p.getY(i));
    uvs[i * 2] = u / s;
    uvs[i * 2 + 1] = heightV ? v / WALL_H : v / s;
  }
  g.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
}
function merged(list: THREE.BufferGeometry[]): THREE.BufferGeometry {
  for (const g of list) {
    for (const k of Object.keys(g.attributes)) if (!["position", "normal", "uv"].includes(k)) g.deleteAttribute(k);
  }
  return mergeGeometries(list, false)!;
}

/** A papyrus-bundle column: eight stems bound together, swelling at the foot, bound at the neck,
    opening into a bud capital; painted in faded bands near the top. */
export function columnGeometry(): THREE.BufferGeometry {
  const pts: THREE.Vector2[] = [];
  const H = 10.5;
  for (let i = 0; i <= 40; i++) {
    const t = i / 40, y = t * H;
    let r = 1.15;
    r += 0.25 * Math.exp(-t * 18); // the swelling foot
    r -= 0.25 * t; // tapering up
    if (t > 0.8) r += Math.sin(((t - 0.8) / 0.2) * Math.PI) * 0.55 - (t > 0.97 ? (t - 0.97) * 12 : 0); // the bud capital
    pts.push(new THREE.Vector2(Math.max(0.05, r), y));
  }
  pts.push(new THREE.Vector2(0.01, H));
  const g = new THREE.LatheGeometry(pts, 64);
  // the bundle: eight rounded stems
  const p = g.attributes.position;
  const col = new Float32Array(p.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const a = Math.atan2(z, x), rr = Math.hypot(x, z);
    const lobes = 1 + 0.07 * Math.abs(Math.cos(a * 4)) - 0.035;
    const tie = y > 8.1 && y < 8.7 ? 1.06 : 1; // the binding at the neck
    p.setXYZ(i, (x / (rr || 1)) * rr * lobes * tie, y, (z / (rr || 1)) * rr * lobes * tie);
    // faded paint: bands at the neck, the capital's green-blue and ochre
    c.copy(COLUMN_STONE);
    if (y > 7.6 && y < 8.9) c.set(Math.floor(y * 5) % 2 ? 0x8a3a28 : 0x2d4d78);
    else if (y > 8.9) c.set(Math.floor(a * 8 + 20) % 2 ? 0x3f6a5a : 0xb68a3e);
    col.set([c.r, c.g, c.b], i * 3);
  }
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

/** The columns' unpainted stone (their vertex colour where no band is painted; as stored, linear). */
const COLUMN_STONE = new THREE.Color(0xc4a272);

/** A column standing between the camera and the wanderer steps out of sight: the whole column
    (found from its own axis: world position less the form's, as the columns are only moved) thins
    away in a fine dither, and comes back as the view moves on. Used as a column's `maskNode`. */
function columnClear(): N {
  const axis = positionWorld.xz.sub(T.positionGeometry.xz);
  const a = T.cameraPosition.xz, b = gpuUniforms.player.xz, ab = b.sub(a);
  const t = dot(axis.sub(a), ab).div(T.max(dot(ab, ab), 1e-3));
  const d = length(axis.sub(a.add(ab.mul(clamp(t, 0, 1)))));
  const between = smoothstep(0.0, 0.08, t).mul(smoothstep(1.02, 0.9, t));
  const hide = smoothstep(2.2, 1.3, d).mul(between).mul(0.9);
  const dither = T.fract(T.sin(dot(T.screenCoordinate.xy, vec2(12.9898, 78.233))).mul(43758.5453));
  return float(1).sub(hide).greaterThan(dither);
}

/* ---------- the temple ---------- */

export interface TempleHooks {
  /** An archetype greets you (you came near): its numeral and name. */
  onMeet(numeral: string, name: string): void;
}

export class Temple {
  group = new THREE.Group(); // inside, at TEMPLE_ORIGIN
  gate = new THREE.Group(); // the pylon in the open world
  inside = false;
  /** Where the pylon's door is in the world, and which way it faces (toward the shore). */
  gateAt = new THREE.Vector3();
  gateHeading = 0;
  private shrines: { beings: Beings; pivot: THREE.Group; numeral: string; name: string }[] = [];
  private centreShaft: THREE.Mesh[] = [];
  /** Where to stand before each shrine (temple frame), facing it. */
  private spots: { x: number; z: number; heading: number }[] = [];
  /** A lamp at each shrine, lit by its rite. */
  private lamps: { core: THREE.Sprite; glow: THREE.Sprite; lit: number; k: number; tint: THREE.Color }[] = [];
  /** The altar's answer when a place is lit in all three realms. */
  private synth = { k: 0, t: 99, color: new THREE.Color(), glow: null as THREE.Sprite | null };
  private plainStone!: THREE.Material;
  private firePits: THREE.Vector3[] = [];
  private dust!: { pos: THREE.InstancedBufferAttribute; base: Float32Array };
  private flames: { light: THREE.PointLight; sprite: THREE.Sprite; base: number; phase: number }[] = [];
  private shafts: THREE.MeshBasicNodeMaterial[] = [];
  private uT = uniform(0);
  private local = new THREE.Vector3();
  private myColliders: Collider[] = [];

  constructor(private sparks: Sparks, private hooks: TempleHooks) {
    this.group.position.copy(TEMPLE_ORIGIN);
    this.buildHall();
    this.buildShrines(sparks);
    this.buildStage(sparks);
    this.showCard(0);
    this.buildRuin();
    void this.loadProps();
    this.buildLight();
    this.group.visible = false;
    this.buildGate();
  }

  /** Stone that feels real (Samuel: "more real life, more texture… Assassin's Creed Origins"):
      a photo-scanned sandstone set (Poly Haven, CC0; colour, normals, and occlusion and roughness
      packed in `arm`), laid in metres on the surface (its uv spans `du` × `dv` metres, the scan
      `tile` metres a repeat), with weathering over it: darker grime toward the floor, faint
      streaks run down by old water, broad uneven patches. `overlay` (a data texture spanning the
      uv, mid grey = no change) carries the carvings and their paint; `tint` recolours the stone
      (the painted bands of the columns, the blue and gold of the ceiling). */
  private stoneMaterial(set: ScanName, du: number, dv: number, tile: number, opts: { overlay?: THREE.Texture; tint?: N; paint?: THREE.Texture; rough?: number } = {}): THREE.MeshStandardNodeMaterial {
    const m = new THREE.MeshStandardNodeMaterial({ metalness: 0 });
    const S = scan(set);
    const U = uv(), st = vec2(U.x.mul(du / tile), U.y.mul(dv / tile));
    const arm = texture(S.arm, st);
    let c: N = texture(S.diff, st).rgb;
    if (opts.overlay) c = c.mul(texture(opts.overlay, U).rgb.mul(2));
    if (opts.tint) c = c.mul(opts.tint);
    if (opts.paint) {
      // a painted surface worn through to the stone where the grain stands proud
      const p = texture(opts.paint, U);
      const wear = smoothstep(0.35, 0.75, dot(c, vec3(0.3, 0.5, 0.2)).mul(1.8).add(vnoise(U.mul(40)).mul(0.4)));
      c = mix(p.rgb.mul(dot(c, vec3(0.3, 0.5, 0.2)).mul(2.2)), c, wear.mul(0.55));
    }
    const pw = positionWorld;
    const hy = pw.y.sub(TEMPLE_ORIGIN.y);
    const grime = mix(float(0.62), float(1), smoothstep(0, 1.8, hy));
    const streak = mix(float(0.84), float(1), vnoise(vec2(pw.x.add(pw.z).mul(1.3), hy.mul(0.09))));
    const patch = mix(float(0.86), float(1.08), vnoise(pw.xz.add(vec2(pw.y, pw.y)).mul(0.22)));
    // the scan's own occlusion deepens its cracks and joints
    const ao = mix(float(0.45), float(1), arm.r);
    m.colorNode = vec4(c.mul(ao).mul(grime).mul(streak).mul(patch), 1);
    m.normalNode = T.normalMap(texture(S.nor, st), vec2(1.15, 1.15));
    m.roughnessNode = clamp(arm.g.mul(opts.rough ?? 1), 0.25, 1);
    return m;
  }

  /** The floor: worn slabs, polished smoother down the aisle, with sand blown in along the walls
      and drifted in hollows. */
  private floorMaterial(): THREE.MeshStandardNodeMaterial {
    const m = this.stoneMaterial("red_sandstone_pavement", 4, 4, 2.4);
    const pw = positionWorld, lx = pw.x.sub(TEMPLE_ORIGIN.x).abs();
    const sand = surface("sand").diff;
    const drift = smoothstep(0.52, 0.78, vnoise(pw.xz.mul(0.16)).mul(0.7).add(smoothstep(7, 11.5, lx).mul(0.45)).add(vnoise(pw.xz.mul(0.9)).mul(0.15)));
    const sandC = texture(sand, pw.xz.div(2.5)).rgb.mul(vec3(1.25, 1.05, 0.82));
    m.colorNode = vec4(mix((m.colorNode as N).rgb, sandC, drift.mul(0.85)), 1);
    // the aisle, walked for centuries: smoother and a little glossy
    m.roughnessNode = mix(mix(float(0.4), float(0.8), smoothstep(1.5, 4.5, lx)), float(1), drift);
    return m;
  }

  private buildHall(): void {
    const walls: THREE.BufferGeometry[] = [], stone: THREE.BufferGeometry[] = [];
    const floors: THREE.BufferGeometry[] = [], ceil: THREE.BufferGeometry[] = [];
    const T_ = 1.2; // wall thickness
    // the hall's side walls, each broken by its seven niches (the wall runs between them)
    for (const side of [-1, 1]) {
      const x = side * (HALL_X + T_ / 2);
      let z = HALL_Z0;
      for (const nz of NICHE_Z) {
        const top = nz + 3.4;
        if (z > top) block(walls, T_, WALL_H, z - top, x, WALL_H / 2, (z + top) / 2);
        // over the niche
        block(walls, T_, WALL_H - 7.2, 6.8, x, 7.2 + (WALL_H - 7.2) / 2, nz);
        // the niche: a recess with its back and sides, a plinth, a lintel with a cornice
        const bx = side * (HALL_X + 3.6);
        block(stone, 0.8, 7.2, 6.8, bx, 3.6, nz); // back
        block(stone, 3.2, 7.2, 0.5, side * (HALL_X + 2), 3.6, nz - 3.15); // sides
        block(stone, 3.2, 7.2, 0.5, side * (HALL_X + 2), 3.6, nz + 3.15);
        block(stone, 3.2, 0.5, 6.8, side * (HALL_X + 2), 7.45, nz); // roof of the niche
        block(stone, 2.6, 0.55, 4.2, side * (HALL_X + 1.9), 0.28, nz); // plinth
        block(stone, 0.5, 7.4, 0.55, side * (HALL_X + 0.05), 3.7, nz - 3.45); // jambs
        block(stone, 0.5, 7.4, 0.55, side * (HALL_X + 0.05), 3.7, nz + 3.45);
        block(stone, 0.7, 0.35, 7.6, side * (HALL_X - 0.05), 7.55, nz); // torus
        block(stone, 1.1, 0.55, 8.0, side * (HALL_X - 0.1), 8.0, nz); // cornice
        z = nz - 3.4;
      }
      if (z > HALL_Z1) block(walls, T_, WALL_H, z - HALL_Z1, x, WALL_H / 2, (z + HALL_Z1) / 2);
    }
    // the front wall with its door (5 m wide, 9 m high)
    for (const side of [-1, 1]) block(walls, HALL_X - 2.5, WALL_H, T_, side * (2.5 + (HALL_X - 2.5) / 2), WALL_H / 2, HALL_Z0 + T_ / 2);
    block(walls, 5, WALL_H - 9, T_, 0, 9 + (WALL_H - 9) / 2, HALL_Z0 + T_ / 2);
    // the gateway between hall and sanctuary: a wall with a door 6 m wide, 10 m high
    for (const side of [-1, 1]) block(walls, SANCT_X - 3, WALL_H + 2, T_ * 1.6, side * (3 + (SANCT_X - 3) / 2), (WALL_H + 2) / 2, HALL_Z1);
    block(walls, 6, WALL_H + 2 - 10, T_ * 1.6, 0, 10 + (WALL_H + 2 - 10) / 2, HALL_Z1);
    block(stone, 7.6, 0.6, T_ * 2.2, 0, 10.2, HALL_Z1 + 0.1); // its cornice
    // the sanctuary's walls (higher)
    const SH = WALL_H + 2;
    for (const side of [-1, 1]) block(walls, T_, SH, HALL_Z1 - SANCT_Z1, side * (SANCT_X + T_ / 2), SH / 2, (HALL_Z1 + SANCT_Z1) / 2);
    block(walls, SANCT_X * 2 + T_ * 2, SH, T_, 0, SH / 2, SANCT_Z1 - T_ / 2);
    // floors: the hall, and the sanctuary a step higher
    block(floors, HALL_X * 2 + 8, 0.4, HALL_Z0 - HALL_Z1 + 1, 0, -0.2, (HALL_Z0 + HALL_Z1) / 2, 4);
    block(floors, SANCT_X * 2, 0.4, HALL_Z1 - SANCT_Z1, 0, 0.1, (HALL_Z1 + SANCT_Z1) / 2, 4);
    // ceilings: the side aisles low, the central aisle raised, with the clerestory's gaps between
    for (const side of [-1, 1]) {
      block(ceil, HALL_X - 3.2 + 4, 0.6, HALL_Z0 - HALL_Z1, side * (3.2 + (HALL_X + 4 - 3.2) / 2), WALL_H + 0.3, (HALL_Z0 + HALL_Z1) / 2, 4);
      // the clerestory: stone grilles standing on the architrave, gaps between for the light
      for (let z = HALL_Z0 - 1; z > HALL_Z1; z -= 3) block(stone, 0.5, 2.4, 1.6, side * 3.3, WALL_H + 1.8, z - 0.8);
    }
    block(ceil, 7.4, 0.6, HALL_Z0 - HALL_Z1, 0, WALL_H + 3.3, (HALL_Z0 + HALL_Z1) / 2, 4);
    // the sanctuary's ceiling, with the opening over the dais
    const oc = 3.2;
    block(ceil, SANCT_X * 2 + 2, 0.6, (HALL_Z1 - (CENTRE.z + oc)), 0, SH + 0.3, (HALL_Z1 + CENTRE.z + oc) / 2, 4);
    block(ceil, SANCT_X * 2 + 2, 0.6, (CENTRE.z - oc) - SANCT_Z1, 0, SH + 0.3, (CENTRE.z - oc + SANCT_Z1) / 2, 4);
    for (const side of [-1, 1]) block(ceil, SANCT_X - oc + 1, 0.6, oc * 2, side * (oc + (SANCT_X - oc + 1) / 2), SH + 0.3, CENTRE.z, 4);
    // architraves along the columns
    for (const side of [-1, 1]) block(stone, 1.6, 1.2, HALL_Z0 - HALL_Z1, side * 5.5, WALL_H - 0.2 - 0.3, (HALL_Z0 + HALL_Z1) / 2);
    // the dais for the Choice: round, three steps
    for (let s = 0; s < 3; s++) {
      const d = new THREE.CylinderGeometry(4.2 - s * 1.1, 4.2 - s * 1.1, 0.3, 64).toNonIndexed();
      d.translate(CENTRE.x, 0.45 + s * 0.3, CENTRE.z);
      worldUV(d, 2);
      stone.push(d);
    }
    // the Choice's platform at the back of the sanctuary, raised above the ring, with steps
    block(stone, 9, 1.8, 5, CENTRE.x, 0.9, SANCT_Z1 + 2.6);
    block(stone, 5, 0.6, 1.2, CENTRE.x, 0.3, SANCT_Z1 + 5.6);
    block(stone, 5, 1.2, 1.0, CENTRE.x, 0.6, SANCT_Z1 + 5.0);
    // the altar at the centre, where the cards appear
    const alt = new THREE.CylinderGeometry(1.0, 1.15, 0.9, 48).toNonIndexed();
    alt.translate(CENTRE.x, 1.2 + 0.45, CENTRE.z);
    worldUV(alt, 2);
    stone.push(alt);
    // plinths for the Spirit's seven, in a ring
    this.ringSpots().forEach(({ x, z }) => {
      const p = new THREE.CylinderGeometry(1.6, 1.8, 0.6, 32).toNonIndexed();
      p.translate(x, 0.6, z);
      worldUV(p, 2);
      stone.push(p);
    });

    // walls carry the carvings: u along the wall (8 m a repeat), v the height
    const wallGeo = merged(walls);
    worldUV(wallGeo, 8, true);
    const relief = reliefTexture();
    const wallMat = this.stoneMaterial("sandstone_blocks_08", 8, WALL_H, 3.2, { overlay: relief });
    const floorMat = this.floorMaterial();
    const stoneMat = this.stoneMaterial("sandstone_cracks", 3, 3, 2.2);
    this.plainStone = stoneMat;
    const ceilMat = this.stoneMaterial("sandstone_cracks", 4, 4, 2.2, { paint: starTexture() });
    const add = (g: THREE.BufferGeometry, m: THREE.Material, shadow = true) => {
      const mesh = new THREE.Mesh(g, m);
      mesh.receiveShadow = true;
      mesh.castShadow = shadow;
      this.group.add(mesh);
      return mesh;
    };
    add(wallGeo, wallMat);
    add(merged(stone), stoneMat);
    add(merged(floors), floorMat, false);
    add(merged(ceil), ceilMat);

    // the columns: one form, fourteen places (two rows), and two more at the gateway
    const cg = columnGeometry();
    // the columns' faded paint (their vertex colours, against the plain stone's own colour)
    const cm = this.stoneMaterial("sandstone_cracks", 3, 3, 2.2, { tint: T.vertexColor().rgb.div(vec3(COLUMN_STONE.r, COLUMN_STONE.g, COLUMN_STONE.b)) });
    cm.vertexColors = true;
    cm.maskNode = columnClear();
    const spots: [number, number][] = [];
    for (const z of COL_Z) spots.push([-5.5, z], [5.5, z]);
    const cols = new THREE.InstancedMesh(cg, cm, spots.length);
    spots.forEach(([x, z], i) => {
      cols.setMatrixAt(i, new THREE.Matrix4().makeTranslation(x, 0, z));
      this.collide(x, z, 1.35);
    });
    cols.castShadow = cols.receiveShadow = true;
    this.group.add(cols);
  }

  /** What time has left on the floor: fallen column drums and blocks in the hall's corners, half
      sunk in drifted sand (the same scanned stone, so they belong to the walls they fell from). */
  private buildRuin(): void {
    const drum = new THREE.CylinderGeometry(1.05, 1.1, 0.95, 28);
    const block = new THREE.BoxGeometry(1.6, 0.9, 1.1);
    const put = (g: THREE.BufferGeometry, x: number, y: number, z: number, rx: number, ry: number, rz: number) => {
      const m = new THREE.Mesh(g, this.plainStone);
      m.position.set(x, y, z);
      m.rotation.set(rx, ry, rz);
      m.castShadow = m.receiveShadow = true;
      this.group.add(m);
      this.collide(x, z, 1.1);
    };
    // by the door, left and right
    put(drum, -9.6, 0.62, 29.6, Math.PI / 2, 0.4, 0.08);
    put(block, -10.3, 0.4, 27.4, 0.05, 0.7, 0.03);
    put(block, 10.2, 0.35, 29.8, 0.02, -0.3, -0.06);
    // before the gateway
    put(drum, 9.8, 0.5, HALL_Z1 + 2.4, 0.15, 0.2, 0.06);
    put(drum, 10.4, 1.35, HALL_Z1 + 2.2, 0.1, 1.2, -0.12);
    put(block, -10.0, 0.42, HALL_Z1 + 3.2, 0.04, -0.5, 0.08);
    // in the sanctuary's far corners
    put(block, -14.2, 0.4, SANCT_Z1 + 2.2, 0.06, 0.3, -0.04);
    put(drum, 14.0, 0.62, SANCT_Z1 + 2.8, Math.PI / 2, -0.8, 0.05);
  }

  /** The scanned props (Poly Haven, CC0; built by tools/build-temple-props.mjs): the fire pits on
      their pedestals, clay and ceramic vessels gathered at the foot of the shrines and in the
      sanctuary, brass lamps around the ring. Each kind drawn as instances (one draw per part). */
  private async loadProps(): Promise<void> {
    const bytes = await loadBytes("models/temple-props.glb");
    if (!bytes) return;
    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
    const gltf = await loader.parseAsync(bytes, "");
    floatAttributes(gltf.scene);
    gltf.scene.updateMatrixWorld(true);
    const r = rng(21);
    /** Place copies of prop `name`, `height` metres tall, standing on its base at each spot. */
    const place = (name: string, height: number, spots: { x: number; y: number; z: number; ry: number; k?: number }[]) => {
      const node = gltf.scene.getObjectByName(name);
      if (!node || !spots.length) return;
      const box = new THREE.Box3().setFromObject(node);
      const size = box.max.y - box.min.y || 1;
      const inv = new THREE.Matrix4().copy(node.matrixWorld).invert();
      node.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        // the part's place within its prop
        const local = new THREE.Matrix4().multiplyMatrices(inv, mesh.matrixWorld);
        const im = new THREE.InstancedMesh(mesh.geometry, mesh.material, spots.length);
        spots.forEach((s, i) => {
          const sc = (height / size) * (s.k ?? 1);
          const m = new THREE.Matrix4().compose(
            new THREE.Vector3(s.x, s.y - box.min.y * sc, s.z),
            new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), s.ry),
            new THREE.Vector3(sc, sc, sc),
          ).multiply(new THREE.Matrix4().copy(node.matrixWorld)).multiply(local);
          im.setMatrixAt(i, m);
        });
        im.castShadow = im.receiveShadow = true;
        this.group.add(im);
      });
    };
    place("stone_fire_pit", 0.5, this.firePits.map((p) => ({ x: p.x, y: p.y, z: p.z, ry: r() * 6 })));
    // vessels at the foot of each hall shrine, two or three, of different kinds and sizes
    const kinds = ["antique_ceramic_vase_01", "ceramic_vase_02", "planter_pot_clay"];
    const spots: Record<string, { x: number; y: number; z: number; ry: number; k?: number }[]> = {};
    for (const k of kinds) spots[k] = [];
    for (const side of [-1, 1])
      for (const nz of NICHE_Z)
        for (const dz of [-2.6, 2.4, r() < 0.5 ? -1.9 : 2.0]) {
          if (r() < 0.25) continue;
          const kind = kinds[Math.floor(r() * kinds.length)];
          spots[kind].push({ x: side * (HALL_X - 0.9 - r() * 0.4), y: 0, z: nz + dz + (r() - 0.5) * 0.3, ry: r() * 6, k: 0.75 + r() * 0.5 });
        }
    // and in the sanctuary, gathered by the walls
    for (let i = 0; i < 12; i++) {
      const side = i % 2 ? 1 : -1, z = HALL_Z1 - 3 - r() * 22;
      const kind = kinds[Math.floor(r() * kinds.length)];
      spots[kind].push({ x: side * (SANCT_X - 0.9 - r() * 0.5), y: 0.3, z, ry: r() * 6, k: 0.8 + r() * 0.6 });
    }
    place("antique_ceramic_vase_01", 0.7, spots.antique_ceramic_vase_01);
    place("ceramic_vase_02", 0.55, spots.ceramic_vase_02);
    place("planter_pot_clay", 0.6, spots.planter_pot_clay);
    // brass lamps on the Spirit's plinths, one before each, and two at the Choice's steps
    const lamps = this.ringSpots().map(({ x, z, face }) => ({ x: x + Math.sin(face) * 1.25, y: 0.9, z: z + Math.cos(face) * 1.25, ry: face }));
    lamps.push({ x: CENTRE.x - 2.2, y: 0.6, z: SANCT_Z1 + 5.2, ry: 0 }, { x: CENTRE.x + 2.2, y: 0.6, z: SANCT_Z1 + 5.2, ry: 0 });
    place("brass_diya_lantern", 0.42, lamps);
  }

  /** The Spirit's seven stand in a ring around the dais, behind it and to either side. */
  private ringSpots(): { x: number; z: number; face: number }[] {
    const out: { x: number; z: number; face: number }[] = [];
    for (let i = 0; i < 7; i++) {
      const a = Math.PI * (0.18 + (i / 6) * 0.64) + Math.PI; // from the left, round behind, to the right
      const x = CENTRE.x + Math.cos(a) * 11.5, z = CENTRE.z + Math.sin(a) * 9;
      out.push({ x, z, face: Math.atan2(CENTRE.x - x, CENTRE.z - z) });
    }
    return out;
  }

  private collide(x: number, z: number, r: number): void {
    const c = { x: TEMPLE_ORIGIN.x + x, z: TEMPLE_ORIGIN.z + z, r, top: TEMPLE_ORIGIN.y + 30 };
    this.myColliders.push(c);
    colliders.push(c);
  }

  private buildShrines(sparks: Sparks): void {
    // one Beings each (a being and the objects it holds), in a pivot turned to face the hall
    const place = (i: number, x: number, y: number, z: number, face: number, stand = 3.6) => {
      // where you stand to be with it: before it, facing it (its front is +z of its pivot)
      this.spots[i] = { x: x + Math.sin(face) * stand, z: z + Math.cos(face) * stand, heading: face };
      const pivot = new THREE.Group();
      pivot.position.set(x, y, z);
      pivot.rotation.y = face;
      pivot.scale.setScalar(STATUE_SCALE);
      const stations: Station[] = [];
      stations[i] = { center: new THREE.Vector3(0, 0, 0) } as unknown as Station;
      const beings = new Beings(stations, sparks);
      for (const b of beings.list) (b.spec.under = false), (b.turns = false);
      // each stood off-centre in its landmark (the Magician 1.9 m aside, into the niche's wall):
      // in its shrine it stands in the middle, as on its card (its height is kept: XII hangs)
      const [ox, , oz] = beings.list[0].spec.at;
      beings.group.position.set(-ox, 0, -oz);
      pivot.add(beings.group);
      this.group.add(pivot);
      const b = beings.list[0];
      this.shrines.push({ beings, pivot, numeral: b.spec.numeral, name: b.spec.name });
      // the numeral over the shrine (in the hall) or before it (in the sanctuary)
      const tint = new THREE.Color(...b.spec.tint);
      const label = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 1.0), new THREE.MeshStandardNodeMaterial({ map: numeralTexture(b.spec.numeral, b.spec.name, tint), roughness: 0.8 }));
      return { label, tint };
    };
    for (let k = 0; k < 14; k++) {
      const side = k < 7 ? -1 : 1, nz = NICHE_Z[k % 7];
      const { label, tint } = place(k, side * (HALL_X + 1.9), 0.55, nz, side < 0 ? Math.PI / 2 : -Math.PI / 2);
      // the back of the niche glows softly in the archetype's own colour, so each shrine has its light
      const gm = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
      const q = uv().sub(vec3(0.5, 0.42, 0).xy);
      const glowK = exp(length(q.mul(vec3(1.4, 1, 0).xy)).mul(-4.5));
      gm.colorNode = vec4(vec3(tint.r, tint.g, tint.b).mul(glowK.mul(0.1)), 1);
      const back = new THREE.Mesh(new THREE.PlaneGeometry(6.4, 7), gm);
      back.position.set(side * (HALL_X + 3.15), 3.6, nz);
      back.rotation.y = side < 0 ? Math.PI / 2 : -Math.PI / 2;
      this.group.add(back);
      label.position.set(side * (HALL_X - 0.62), 8.0, nz);
      label.rotation.y = side < 0 ? Math.PI / 2 : -Math.PI / 2;
      this.group.add(label);
    }
    this.ringSpots().forEach(({ x, z, face }, j) => {
      const { label } = place(14 + j, x, 0.9, z, face);
      // a low stele in front of it, facing the centre
      label.scale.setScalar(0.55);
      label.position.set(x + Math.sin(face) * 2.3, 1.1, z + Math.cos(face) * 2.3);
      label.rotation.set(-0.35, face, 0, "YXZ");
      this.group.add(label);
      this.collide(x, z, 1.9);
    });
    const { label } = place(21, CENTRE.x, 1.8, SANCT_Z1 + 2.6, 0, 5.2);
    label.scale.setScalar(0.6);
    label.position.set(CENTRE.x, 2.6, SANCT_Z1 + 5.15);
    this.group.add(label);
    this.collide(CENTRE.x, SANCT_Z1 + 2.6, 4.2);
    this.collide(CENTRE.x, CENTRE.z, 1.5); // the altar
    this.buildLamps();
  }

  /** A small lamp on the floor before each shrine, between you and it: a dim ember until its
      rite is done, then a steady flame in the archetype's own colour. */
  private buildLamps(): void {
    const tex = (() => {
      const [c, g] = canvas(64, 64);
      const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      grd.addColorStop(0, "rgba(255,245,225,1)");
      grd.addColorStop(0.25, "rgba(255,210,150,0.45)");
      grd.addColorStop(1, "rgba(255,190,120,0)");
      g.fillStyle = grd;
      g.fillRect(0, 0, 64, 64);
      return canvasTexture(c, false);
    })();
    const bowl = new THREE.MeshStandardNodeMaterial({ color: 0x8a6a3a, roughness: 0.45, metalness: 0.7 });
    const bowlGeo = new THREE.LatheGeometry([[0.001, 0], [0.12, 0.02], [0.16, 0.08], [0.15, 0.12], [0.001, 0.1]].map(([r, y]) => new THREE.Vector2(r, y)), 20);
    this.spots.forEach((sp, i) => {
      const tint = new THREE.Color(...this.shrines[i].beings.list[0].spec.tint);
      // halfway between where you stand and the shrine
      const f = i === 21 ? 0.55 : 0.5;
      const x = sp.x - Math.sin(sp.heading) * 3.6 * f, z = sp.z - Math.cos(sp.heading) * 3.6 * f;
      const y = this.floorAt(TEMPLE_ORIGIN.x + x, TEMPLE_ORIGIN.z + z) - TEMPLE_ORIGIN.y;
      const b = new THREE.Mesh(bowlGeo, bowl);
      b.position.set(x, y, z);
      this.group.add(b);
      const mk = (size: number) => {
        const sp2 = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: tint.clone(), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false }));
        sp2.position.set(x, y + 0.2, z);
        sp2.scale.setScalar(size);
        this.group.add(sp2);
        return sp2;
      };
      this.lamps.push({ core: mk(0.22), glow: mk(1.1), lit: 0, k: 0, tint });
    });
    const g = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0, fog: false }));
    g.position.set(CENTRE.x, 4.5, CENTRE.z);
    this.group.add(g);
    this.synth.glow = g;
  }

  /** The shrine whose standing place you are at (within `r` metres), or −1. */
  nearShrine(p: THREE.Vector3, r = 2.2): number {
    const lx = p.x - TEMPLE_ORIGIN.x, lz = p.z - TEMPLE_ORIGIN.z;
    let best = -1, bd = r;
    this.spots.forEach((s, i) => {
      const d = Math.hypot(lx - s.x, lz - s.z);
      if (d < bd) (bd = d), (best = i);
    });
    return best;
  }

  /** Where to stand for shrine `i`, in the world, and the heading that faces it. */
  standFor(i: number): { x: number; z: number; heading: number } {
    const s = this.spots[i];
    return { x: TEMPLE_ORIGIN.x + s.x, z: TEMPLE_ORIGIN.z + s.z, heading: s.heading };
  }

  shrineInfo(i: number): { numeral: string; name: string; tint: THREE.Color } {
    const s = this.shrines[i];
    return { numeral: s.numeral, name: s.name, tint: new THREE.Color(...s.beings.list[0].spec.tint) };
  }

  /** The being of shrine `i` begins or ends its rite. */
  setRite(i: number, on: boolean): void {
    const b = this.shrines[i]?.beings.list[0];
    if (b) b.rite = on ? 1 : 0;
  }

  /** Light (or show as lit, on arriving) the lamp of shrine `i`. */
  kindle(i: number, at = false): void {
    const l = this.lamps[i];
    if (!l) return;
    l.lit = 1;
    if (at) l.k = 1;
    else this.sparks.emit(l.core.getWorldPosition(new THREE.Vector3()), 30, l.tint, 0.8);
  }

  /** The altar answers: a place lit in all three realms (the colours of its three), or all. */
  synthesis(colors: THREE.Color[]): void {
    this.synth.t = 0;
    const c = this.synth.color.setRGB(0, 0, 0);
    for (const k of colors) c.add(k);
    c.multiplyScalar(1 / Math.max(1, colors.length));
    for (let k = 0; k < 3; k++) this.sparks.emit(new THREE.Vector3(CENTRE.x, 3 + k, CENTRE.z).add(TEMPLE_ORIGIN), 40, colors[k % colors.length] ?? c, 1.4);
  }

  private updateLamps(t: number, dt: number, reduced: boolean): void {
    this.lamps.forEach((l, i) => {
      l.k += (l.lit - l.k) * Math.min(1, dt * 0.8);
      const flick = reduced ? 1 : 0.9 + 0.07 * Math.sin(t * 9 + i * 1.7) + 0.04 * Math.sin(t * 23 + i);
      l.core.material.opacity = (0.15 + 0.85 * l.k) * flick;
      l.core.scale.setScalar((0.1 + 0.16 * l.k) * flick);
      l.glow.material.opacity = (0.05 + 0.35 * l.k) * flick;
      l.glow.scale.setScalar(0.5 + 0.9 * l.k);
    });
    const s = this.synth;
    s.t += dt;
    const k = s.t < 2 ? s.t / 2 : Math.max(0, 1 - (s.t - 2) / 9);
    if (s.glow) {
      s.glow.material.color.copy(s.color);
      s.glow.material.opacity = k * 0.7;
      s.glow.scale.setScalar(2 + k * 5);
      s.glow.position.y = 3.5 + s.t * 0.25;
    }
  }

  attach(m: BeingModel): void {
    this.model = m;
    for (const s of this.shrines) s.beings.attach(m);
    for (const c of this.cardBeings.values()) c.beings.attach(m);
  }

  /* ---------- the cards, at the centre of the sanctuary ----------
     Each card, reimagined: a tall gilded frame standing on the altar, the archetype within it
     in three dimensions (the being and the objects it holds, as in its shrine), a veil of its
     own colour behind, its numeral above and its name below. It turns slowly, so its depth shows. */
  private model: BeingModel | null = null;
  private stage = new THREE.Group();
  private cardBeings = new Map<number, { beings: Beings; pivot: THREE.Group }>();
  private cardShown = -1;
  /** Each being stood off-centre in its landmark: on the card it stands in the middle. */
  private cardOffset = new Map<number, THREE.Vector3>();
  private cardK = 0;
  private cardPrev: THREE.Group | null = null;
  private cardPrevK = 0;
  private veilColor = uniform(new THREE.Color(1, 1, 1));
  private plateTop!: THREE.Mesh;
  private plateBottom!: THREE.Mesh;
  cardsOpen = false;
  /** A rite in the sanctuary: the card stands between the view and the shrine, so it rests. */
  quietStage = false;

  private buildStage(sparks: Sparks): void {
    this.stage.position.set(CENTRE.x, 2.1, CENTRE.z);
    this.group.add(this.stage);
    const W = 2.7, H = 4.3;
    // the card drawn in light, as the world draws its forms: a double border of thin gold light
    // with curled corners and a small star at the crown, a ground line for the figure, and behind
    // it only a faint breath of the archetype's colour (the sanctuary shows through)
    const seg: number[] = [];
    const line = (pts: [number, number][], z = -0.9) => {
      for (let k = 0; k < pts.length - 1; k++) seg.push(pts[k][0], pts[k][1], z, pts[k + 1][0], pts[k + 1][1], z);
    };
    const arc = (cx: number, cy: number, r: number, a0: number, a1: number, n = 14) =>
      Array.from({ length: n + 1 }, (_, k) => [cx + Math.cos(a0 + ((a1 - a0) * k) / n) * r, cy + Math.sin(a0 + ((a1 - a0) * k) / n) * r] as [number, number]);
    for (const inset of [0, 0.14]) {
      const w = W / 2 - inset, y0 = inset, y1 = H - inset, r = 0.22 - inset * 0.6;
      // a rounded rectangle, its corners quarter circles
      line([[-w + r, y0], [w - r, y0]]);
      line([[-w + r, y1], [w - r, y1]]);
      line([[-w, y0 + r], [-w, y1 - r]]);
      line([[w, y0 + r], [w, y1 - r]]);
      line(arc(w - r, y0 + r, r, -Math.PI / 2, 0, 8));
      line(arc(-w + r, y0 + r, r, Math.PI, Math.PI * 1.5, 8));
      line(arc(w - r, y1 - r, r, 0, Math.PI / 2, 8));
      line(arc(-w + r, y1 - r, r, Math.PI / 2, Math.PI, 8));
    }
    // curls in the corners between the borders
    for (const [sx, sy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
      const cx = sx * (W / 2 - 0.36), cy = H / 2 + sy * (H / 2 - 0.36);
      const pts: [number, number][] = [];
      for (let k = 0; k <= 24; k++) {
        const u = k / 24, ang = u * Math.PI * 2.2, r = 0.13 * (1 - u * 0.8);
        pts.push([cx + sx * Math.cos(ang) * r, cy + sy * Math.sin(ang) * r]);
      }
      line(pts);
    }
    // a small eight-armed star at the crown, and the ground line the figure stands on
    for (let k = 0; k < 8; k++) {
      const ang = (k / 8) * Math.PI * 2, r = k % 2 ? 0.07 : 0.16;
      line([[0, H + 0.02], [Math.cos(ang) * r, H + 0.02 + Math.sin(ang) * r]]);
    }
    line([[-W / 2 + 0.45, 0.3], [W / 2 - 0.45, 0.3]]);
    const frame = new THREE.Mesh(ribbonGeometry(seg), ribbonMaterial(vec3(1.0, 0.78, 0.42).mul(0.9), 0.6));
    frame.frustumCulled = false;
    this.stage.add(frame);
    const vm = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
    const q = uv().sub(0.5);
    const glowV = exp(length(q.mul(vec3(2.2, 1.4, 0).xy)).mul(-3.2));
    vm.colorNode = vec4(this.veilColor.mul(glowV.mul(0.06)), 1);
    const veil = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.3, H - 0.3), vm);
    veil.position.set(0, H / 2, -0.95);
    this.stage.add(veil);
    // plates for the numeral (above) and the name (below)
    const plate = (y: number, w: number, h: number) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
      m.position.set(0, y, -0.86);
      this.stage.add(m);
      return m;
    };
    this.plateTop = plate(H + 0.45, 1.6, 0.6);
    this.plateBottom = plate(-0.35, 3.0, 0.55);
    void sparks;
  }

  private plateTexture(text: string, italic: boolean): THREE.CanvasTexture {
    const [c, g] = canvas(512, 112);
    g.fillStyle = "rgba(20,14,8,0.0)";
    g.fillRect(0, 0, 512, 112);
    g.fillStyle = "#e6c06a";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.font = italic ? "italic 46px Georgia, 'Times New Roman', serif" : "600 72px Georgia, 'Times New Roman', serif";
    g.fillText(text, 256, 58);
    return canvasTexture(c, false);
  }

  /** Where the cards are (world), and where to look at them from. */
  cardView(out: { pos: THREE.Vector3; target: THREE.Vector3 }): void {
    // the card stands above the panel of controls, which covers the lower part of the view
    out.target.set(CENTRE.x, 3.35, CENTRE.z).add(TEMPLE_ORIGIN);
    out.pos.set(CENTRE.x, 3.3, CENTRE.z + 6.6).add(TEMPLE_ORIGIN);
  }

  /** Near enough the altar to take up the cards. */
  nearCards(p: THREE.Vector3): boolean {
    return Math.hypot(p.x - TEMPLE_ORIGIN.x - CENTRE.x, p.z - TEMPLE_ORIGIN.z - CENTRE.z) < 6.5;
  }

  /** The archetype of card `i` (0–21): numeral, name, realm, place. */
  cardInfo(i: number): { numeral: string; name: string; realm: string; place: string } {
    const s = this.shrines[i];
    const POS = ["Matrix", "Potentiator", "Catalyst", "Experience", "Significator", "Transformation", "Great Way"];
    const b = s.beings.list[0];
    return { numeral: s.numeral, name: s.name, realm: i === 21 ? "" : b.spec.realm, place: i === 21 ? "The Choice" : POS[i % 7] };
  }

  showCard(i: number): void {
    if (i === this.cardShown) return;
    const old = this.cardBeings.get(this.cardShown);
    if (old) {
      if (this.cardPrev && this.cardPrev !== old.pivot) this.cardPrev.visible = false; // turned quickly: the one still leaving goes at once
      this.cardPrev = old.pivot;
      this.cardPrevK = this.cardK;
    }
    this.cardShown = i;
    this.cardK = 0;
    let c = this.cardBeings.get(i);
    if (!c) {
      const pivot = new THREE.Group();
      const stations: Station[] = [];
      stations[i] = { center: new THREE.Vector3(0, 0, 0) } as unknown as Station;
      const beings = new Beings(stations, this.sparks);
      for (const b of beings.list) (b.spec.under = false), (b.turns = false);
      if (this.model) beings.attach(this.model);
      pivot.add(beings.group);
      pivot.position.set(0, 0.3, -0.2);
      pivot.scale.setScalar(1.3);
      this.stage.add(pivot);
      c = { beings, pivot };
      this.cardBeings.set(i, c);
      this.cardOffset.set(i, new THREE.Vector3(...beings.list[0].spec.at));
    }
    c.pivot.visible = true;
    const b = c.beings.list[0];
    this.veilColor.value.setRGB(...b.spec.tint).multiplyScalar(0.8);
    for (const [plate, text, italic] of [[this.plateTop, b.spec.numeral, false], [this.plateBottom, b.spec.name, true]] as [THREE.Mesh, string, boolean][]) {
      const m = plate.material as THREE.MeshBasicNodeMaterial;
      m.map?.dispose();
      m.map = this.plateTexture(text, italic);
    }
    (this.plateTop.material as THREE.Material).needsUpdate = true;
    (this.plateBottom.material as THREE.Material).needsUpdate = true;
  }

  private updateStage(t: number, dt: number, player: THREE.Vector3, reduced: boolean): void {
    this.stage.visible = this.cardsOpen && this.cardShown >= 0 && !this.quietStage;
    for (const m of this.centreShaft) m.visible = !this.cardsOpen; // it fell straight through the card
    if (!this.stage.visible) return;
    this.stage.rotation.y = reduced ? 0 : Math.sin(t * 0.25) * 0.1;
    this.cardK = Math.min(1, this.cardK + dt / 0.8);
    const ease = (k: number) => k * k * (3 - 2 * k);
    const cur = this.cardBeings.get(this.cardShown);
    if (cur) {
      const k = ease(this.cardK);
      const off = this.cardOffset.get(this.cardShown)!;
      const sc = 1.1 * (0.4 + 0.6 * k);
      cur.pivot.scale.setScalar(sc);
      cur.pivot.position.set(-off.x * sc, 0.3 - off.y * sc - (1 - k) * 0.6, -0.2 - off.z * sc);
      cur.pivot.worldToLocal(this.local.copy(player));
      cur.beings.update(t, dt, this.local, reduced);
      // on the card, no halo or greeting ring: a haze over the whole picture
      for (const b of cur.beings.list) {
        const bb = b as unknown as { halo: THREE.Object3D; ring: THREE.Object3D };
        bb.halo.visible = false;
        bb.ring.visible = false;
      }
    }
    if (this.cardPrev) {
      this.cardPrevK -= dt / 0.5;
      if (this.cardPrevK <= 0) {
        this.cardPrev.visible = false;
        this.cardPrev = null;
      } else {
        const k = ease(this.cardPrevK);
        this.cardPrev.scale.setScalar(1.1 * (0.4 + 0.6 * k));
        this.cardPrev.position.y += dt * 1.5;
      }
    }
  }

  private buildLight(): void {
    // the stone's own warm bounce, dim; the sky's light from the clerestory and the opening above
    const hemi = new THREE.HemisphereLight(0xb09678, 0x3a2818, 0.8);
    this.group.add(hemi);
    const sun = new THREE.DirectionalLight(0xffdca0, 3.8);
    sun.position.set(-18, 40, 10);
    sun.target.position.set(0, 0, -10);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera as THREE.OrthographicCamera;
    sc.left = -40;
    sc.right = 40;
    sc.top = 50;
    sc.bottom = -50;
    sc.near = 1;
    sc.far = 120;
    sun.shadow.bias = -0.0006;
    this.group.add(sun, sun.target);
    // braziers: fire in bronze bowls, down the aisle and at the gateway
    const fire = new THREE.SpriteNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
    const r = length(uv().sub(0.5)).mul(2);
    const flick = float(0.85).add(T.sin(this.uT.mul(13.1)).mul(0.08)).add(T.sin(this.uT.mul(7.3)).mul(0.07));
    fire.colorNode = vec4(vec3(1.0, 0.62, 0.25).mul(exp(r.mul(r).mul(-5)).mul(smoothstep(1, 0.4, r))).mul(flick).mul(1.4), 1);
    const braziers: [number, number][] = [[-2.8, 12], [2.8, 12], [-2.8, -12], [2.8, -12], [-3.6, HALL_Z1 + 2.5], [3.6, HALL_Z1 + 2.5]];
    braziers.forEach(([x, z], i) => {
      // a stone pedestal; the fire pit (a scanned model) is set on it when the props arrive
      const ped = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.9, 1.25), this.plainStone);
      ped.position.set(x, 0.45, z);
      ped.castShadow = ped.receiveShadow = true;
      const s = new THREE.Sprite(fire);
      s.position.set(x, 1.55, z);
      s.scale.set(0.8, 1.15, 1);
      this.group.add(ped, s);
      this.firePits.push(new THREE.Vector3(x, 0.9, z));
      this.collide(x, z, 0.6);
      // only four carry real light (a phone's budget); the others glow
      if (i % 3 !== 2) {
        const light = new THREE.PointLight(0xff9a4a, 0, 16, 1.6);
        light.position.set(x, 2.2, z);
        this.group.add(light);
        this.flames.push({ light, sprite: s, base: 12, phase: i * 1.7 });
      }
    });
    // dust hanging in the air, catching the light down the aisle and in the sanctuary
    {
      const N = 700, p = new Float32Array(N * 3);
      for (let i = 0; i < N; i++) {
        const inSanct = i % 3 === 0;
        p[i * 3] = (Math.random() - 0.5) * (inSanct ? 14 : 9);
        p[i * 3 + 1] = 0.5 + Math.random() * 12;
        p[i * 3 + 2] = inSanct ? CENTRE.z + (Math.random() - 0.5) * 16 : HALL_Z1 + Math.random() * (HALL_Z0 - HALL_Z1);
      }
      const d = worldPoints(p, { color: new THREE.Color(1.0, 0.85, 0.6), size: 0.035, opacity: 0.55 });
      this.group.add(d.sprite);
      this.dust = { pos: d.position, base: p.slice() };
    }
    // the sanctuary's light: from the opening above, onto the dais
    const top = new THREE.PointLight(0xfff0d0, 22, 26, 1.4);
    top.position.set(CENTRE.x, 11, CENTRE.z);
    this.group.add(top);

    // shafts of light: soft, slanting down from the clerestory's gaps, and straight down onto the dais
    // Shafts of light: soft volumes, not flat planes. Each is an open tube of light, brightest
    // where you look through its depth and fading at its edges, with dust turning slowly in it;
    // it melts away near the lens, and lays a soft pool of light where it meets the floor.
    const shaft = (w: number, h: number, x: number, y: number, z: number, tilt: number, k: number) => {
      const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.FrontSide, fog: false });
      const u = uv();
      const view = T.normalize(T.cameraPosition.sub(positionWorld));
      const through = T.pow(T.abs(dot(T.normalWorld, view)), 1.6); // the depth of light you look through
      const along = smoothstep(0, 0.18, u.y).mul(smoothstep(1, 0.7, u.y).mul(0.55).add(0.45));
      const dustK = vnoise(vec2(u.x.mul(9), u.y.mul(5).sub(this.uT.mul(0.03)))).mul(0.6).add(vnoise(vec2(u.x.mul(23), u.y.mul(14).add(this.uT.mul(0.05)))).mul(0.4));
      const near = smoothstep(0.8, 4, length(T.cameraPosition.sub(positionWorld)));
      m.colorNode = vec4(vec3(1.0, 0.86, 0.62).mul(through.mul(along).mul(dustK.mul(0.7).add(0.5)).mul(near).mul(k)), 1);
      this.shafts.push(m);
      const tube = new THREE.Mesh(new THREE.CylinderGeometry(w * 0.5, w * 0.62, h, 24, 1, true), m);
      tube.position.set(x, y, z);
      tube.rotation.set(0, 0, tilt);
      tube.renderOrder = 5;
      this.group.add(tube);
      // where it falls: a soft warm pool on the floor, stretched along the slant
      const foot = new THREE.Vector3(0, -h / 2, 0).applyEuler(new THREE.Euler(0, 0, tilt)).add(new THREE.Vector3(x, y, z));
      const pm = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
      const pr = length(uv().sub(0.5)).mul(2);
      pm.colorNode = vec4(vec3(1.0, 0.8, 0.55).mul(smoothstep(1, 0.2, pr).mul(k * 1.6)), 1);
      const pool = new THREE.Mesh(new THREE.PlaneGeometry(w * (1.3 + Math.abs(Math.tan(tilt)) * 1.6), w * 1.3), pm);
      pool.rotation.x = -Math.PI / 2;
      pool.position.set(foot.x, 0.03 + (foot.z < HALL_Z1 ? 0.3 : 0), foot.z);
      this.group.add(pool);
      return [tube, pool];
    };
    // daylight beyond: behind the clerestory's grilles, in the door, above the opening
    const day = new THREE.MeshBasicNodeMaterial({ color: new THREE.Color(1.0, 0.86, 0.62), fog: false, side: THREE.DoubleSide });
    for (const side of [-1, 1]) {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(HALL_Z0 - HALL_Z1, 2.6), day);
      p.position.set(side * 4.1, WALL_H + 1.8, (HALL_Z0 + HALL_Z1) / 2);
      p.rotation.y = Math.PI / 2;
      this.group.add(p);
    }
    const doorDay = new THREE.Mesh(new THREE.PlaneGeometry(5.2, 9.2), new THREE.MeshBasicNodeMaterial({ color: new THREE.Color(0.9, 0.72, 0.5), fog: false }));
    doorDay.position.set(0, 4.6, HALL_Z0 + 2.2);
    doorDay.rotation.y = Math.PI;
    this.group.add(doorDay);
    const sky = new THREE.Mesh(new THREE.CircleGeometry(3.4, 40), day);
    sky.position.set(CENTRE.x, WALL_H + 2 + 1.5, CENTRE.z);
    sky.rotation.x = Math.PI / 2;
    this.group.add(sky);
    for (let z = HALL_Z0 - 6; z > HALL_Z1 + 3; z -= 12) shaft(1.3, 16, -1.2, 7.5, z - 0.8, 0.42, 0.11);
    this.centreShaft = shaft(4.6, 15, CENTRE.x, 8.5, CENTRE.z, 0, 0.1);
  }

  /** The pylon in the open world: two battered towers and a door between them, glowing within. */
  private buildGate(): void {
    // somewhere near the shore, on even dry ground, clear of the homes
    let best = { x: SPAWN.x, z: SPAWN.z - 70, score: -Infinity };
    for (let r = 50; r <= 320; r += 15)
      for (let k = 0; k < 32; k++) {
        const a = (k / 32) * Math.PI * 2, x = SPAWN.x + Math.sin(a) * r, z = SPAWN.z + Math.cos(a) * r;
        const h = heightAt(x, z);
        if (h < WATER_Y + 1.2) continue;
        let rough = 0;
        for (const [dx, dz] of [[8, 0], [-8, 0], [0, 8], [0, -8], [8, 8], [-8, -8]]) rough = Math.max(rough, Math.abs(heightAt(x + dx, z + dz) - h));
        const clear = Math.min(...LANDMARK_SITES.map(([lx, lz]) => Math.hypot(lx - x, lz - z)));
        if (clear < 30 || keptClear(x, z, 25)) continue;
        const score = -rough * 3 - r * 0.03;
        if (score > best.score) best = { x, z, score };
      }
    const h = heightAt(best.x, best.z);
    this.gateAt.set(best.x, h, best.z);
    // it faces the shore (the spawn)
    this.gateHeading = Math.atan2(SPAWN.x - best.x, SPAWN.z - best.z);
    this.gate.position.copy(this.gateAt);
    this.gate.rotation.y = this.gateHeading;

    const walls: THREE.BufferGeometry[] = [];
    // two towers, their faces leaning in as they rise (a batter)
    for (const side of [-1, 1]) {
      const g = new THREE.BoxGeometry(7, 15, 4.5, 1, 1, 1).toNonIndexed();
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) if (p.getY(i) > 0) p.setXYZ(i, p.getX(i) * 0.82, p.getY(i), p.getZ(i) * 0.7);
      g.computeVertexNormals();
      g.translate(side * 6.2, 7.5 - 0.5, 0);
      walls.push(g);
      // the cornice along its top
      const c = new THREE.BoxGeometry(6.6, 0.8, 3.8).toNonIndexed();
      c.translate(side * 6.2 * 0.97, 15.1 - 0.5, 0);
      walls.push(c);
    }
    // the door's frame and lintel
    for (const side of [-1, 1]) {
      const j = new THREE.BoxGeometry(1.1, 10, 3.4).toNonIndexed();
      j.translate(side * 2.75, 5 - 0.5, 0);
      walls.push(j);
    }
    const l = new THREE.BoxGeometry(7, 1.6, 3.6).toNonIndexed();
    l.translate(0, 10.3 - 0.5, 0);
    walls.push(l);
    for (const g of walls) worldUV(g, 8, true);
    const geo = merged(walls);
    const mat = this.stoneMaterial("sandstone_blocks_05", 8, WALL_H, 3.2, { overlay: reliefTexture() });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = mesh.receiveShadow = true;
    this.gate.add(mesh);
    // the door: warm light within, gently breathing
    const dm = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
    const u = uv();
    const edge = smoothstep(0, 0.2, u.x).mul(smoothstep(1, 0.8, u.x)).mul(smoothstep(1, 0.75, u.y));
    const breathe = float(0.8).add(T.sin(this.uT.mul(0.9)).mul(0.12));
    dm.colorNode = vec4(vec3(1.0, 0.78, 0.5).mul(edge.mul(breathe).mul(0.38).add(0.04)), 1);
    const door = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 9.3), dm);
    door.position.set(0, 4.65 - 0.5, 0);
    this.gate.add(door);
    // the towers are solid
    const cos = Math.cos(this.gateHeading), sin = Math.sin(this.gateHeading);
    for (const side of [-1, 1])
      for (const off of [-1.6, 1.6]) {
        const lx = side * (6.2 + off), c = { x: this.gateAt.x + lx * cos, z: this.gateAt.z - lx * sin, r: 2.1, top: h + 15 };
        colliders.push(c);
      }
  }

  /** Is the wanderer walking through the pylon's door? (in the door's frame: across, through) */
  atGateDoor(p: THREE.Vector3): boolean {
    const dx = p.x - this.gateAt.x, dz = p.z - this.gateAt.z;
    const cos = Math.cos(this.gateHeading), sin = Math.sin(this.gateHeading);
    const across = dx * cos - dz * sin, through = dx * sin + dz * cos;
    return Math.abs(across) < 2.1 && Math.abs(through) < 0.7 && p.y < this.gateAt.y + 8;
  }

  /** Just outside the pylon, facing away from it (out toward the shore). */
  outside(): { x: number; z: number; heading: number } {
    const f = 5;
    return {
      x: this.gateAt.x + Math.sin(this.gateHeading) * f,
      z: this.gateAt.z + Math.cos(this.gateHeading) * f,
      heading: this.gateHeading + Math.PI,
    };
  }

  /** Where you stand on entering: inside the door, facing down the hall. */
  entry(): { x: number; y: number; z: number; heading: number } {
    return { x: TEMPLE_ORIGIN.x, y: TEMPLE_ORIGIN.y, z: TEMPLE_ORIGIN.z + HALL_Z0 - 3, heading: 0 };
  }

  /** Near the door, inside (where "Leave the temple" is offered). */
  nearDoor(p: THREE.Vector3): boolean {
    const lz = p.z - TEMPLE_ORIGIN.z, lx = p.x - TEMPLE_ORIGIN.x;
    return lz > HALL_Z0 - 7 && Math.abs(lx) < 5;
  }

  /** The floor inside (the sanctuary a step up). */
  floorAt(x: number, z: number): number {
    const lz = z - TEMPLE_ORIGIN.z, lx = x - TEMPLE_ORIGIN.x;
    let y = TEMPLE_ORIGIN.y + (lz < HALL_Z1 ? 0.3 : 0);
    const dc = Math.hypot(lx - CENTRE.x, lz - CENTRE.z);
    if (dc < 4.2) y = TEMPLE_ORIGIN.y + 0.6 + (dc < 3.1 ? 0.3 : 0) + (dc < 2.0 ? 0.3 : 0);
    return y;
  }

  /** Keep the wanderer within the walls (and under the ceiling); true if they walked out the door. */
  confine(p: THREE.Vector3): boolean {
    const l = this.local.copy(p).sub(TEMPLE_ORIGIN);
    // the door: within its opening you may walk on through the wall, and out
    const inDoor = Math.abs(l.x) < 2.4;
    if (l.z > HALL_Z0 - 0.9 && inDoor) return true; // stepping into the doorway is enough
    const inSanct = l.z < HALL_Z1 + 0.6;
    const xMax = inSanct ? SANCT_X - 0.6 : HALL_X - 0.6;
    // the gateway: pass only through its door
    if (Math.abs(l.z - HALL_Z1) < 1.4 && Math.abs(l.x) > 2.6) l.z = l.z > HALL_Z1 ? HALL_Z1 + 1.4 : HALL_Z1 - 1.4;
    l.x = THREE.MathUtils.clamp(l.x, -xMax, xMax);
    l.z = THREE.MathUtils.clamp(l.z, SANCT_Z1 + 0.6, inDoor ? HALL_Z0 + 1.5 : HALL_Z0 - 0.4);
    l.y = Math.min(l.y, (inSanct ? WALL_H + 1 : WALL_H - 2) - 1);
    p.copy(l).add(TEMPLE_ORIGIN);
    return false;
  }

  show(inside: boolean): void {
    this.inside = inside;
    this.group.visible = inside;
  }

  update(t: number, dt: number, player: THREE.Vector3, reduced: boolean): void {
    this.uT.value = t;
    if (!this.inside) return;
    // the dust drifts, slowly turning in the still air
    {
      const a = this.dust.pos.array as Float32Array, b = this.dust.base;
      const k = reduced ? 0.3 : 1;
      for (let i = 0; i < a.length; i += 3) {
        const ph = i * 0.37;
        a[i] = b[i] + Math.sin(t * 0.07 * k + ph) * 0.6;
        a[i + 1] = b[i + 1] + Math.sin(t * 0.05 * k + ph * 1.3) * 0.5;
        a[i + 2] = b[i + 2] + Math.cos(t * 0.06 * k + ph * 0.7) * 0.6;
      }
      this.dust.pos.needsUpdate = true;
    }
    for (const f of this.flames) {
      const k = reduced ? 1 : 0.85 + 0.1 * Math.sin(t * 11 + f.phase) + 0.06 * Math.sin(t * 23 + f.phase * 2);
      f.light.intensity = f.base * k;
    }
    this.updateStage(t, dt, player, reduced);
    this.updateLamps(t, dt, reduced);
    this.shrines.forEach((s) => {
      s.beings.group.worldToLocal(this.local.copy(player));
      const wasMet = s.beings.list[0]?.met;
      s.beings.update(t, dt, this.local, reduced);
      if (!wasMet && s.beings.list[0]?.met) this.hooks.onMeet(s.numeral, s.name);
    });
  }

  /** Arriving again: each greets you again. */
  reset(): void {
    for (const s of this.shrines) s.beings.reset();
  }
}
