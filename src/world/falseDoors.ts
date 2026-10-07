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

/* ---------------------------------------------------------------- the door's elevation */
/* After the Old Kingdom false doors of the mastaba chapels (one slab set flush into the chapel's
   west wall): a torus moulding round its edge under a cavetto cornice; the upper lintel; the
   panel (the remembered one seated before an offering table of tall loaves) between two narrow
   apertures; the lower lintel; outer and inner jambs, each a column of signs ending in a standing
   figure at its foot; a round drum over the central slot, the door itself, a narrow plain niche.
   Its recesses are a few centimetres deep, never a passage. The slab is painted as granite (red
   with black flecks), faded and worn through to the limestone; the signs are cut into it.
   The slab's frame: x across (−1.6 … 1.6), y up from its foot (0 … 4.0), z out of the wall (its
   front at z = 0). */
const SW = 3.2, SH = 4.0, Y0 = 0.25; // the slab, standing on a low plinth
/** Where the slab's parts lie (slab frame, metres). */
const L = {
  outer: 0.6, // each outer jamb's width
  inner: 0.5, // each inner jamb's width
  slot: 0.7, // the central niche's width
  upper: [3.55, 4.0], // the upper lintel, y from … to
  panel: [2.85, 3.55],
  lower: [2.6, 2.85],
  niche: 2.36, // the slot's top (the drum sits on it)
};

/** The carving, drawn once at 3.2 px per cm over the slab (R: how deep it is cut, 0–1; G: the lip
    of the cut catching light; B: paint, where the granite wash has survived). The signs are the
    real shapes of the hieroglyphic script (owl, vulture, quail chick, horned viper, cobra, reed,
    water, mouth, loaf, basket, bolt, hand, arm, eye, ankh, djed, was-sceptre, sun, house, offering
    mat, bee, sedge, feather, seated man and woman…), cut in sunk relief and grouped in quadrats
    as inscriptions are: tall signs side by side, flat ones stacked. Their order is decorative: they
    spell no names and no words. */
function doorCarving(): THREE.CanvasTexture {
  const P = 320; // px per metre
  const W = Math.round(SW * P), H = Math.round(SH * P);
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d")!;
  g.fillStyle = "#000";
  g.fillRect(0, 0, W, H);
  const R = rng(311);
  const X = (x: number) => (x + SW / 2) * P; // slab x → px
  const Yp = (y: number) => (SH - y) * P; // slab y → px (top down)
  g.fillStyle = "#ff0000";
  g.strokeStyle = "#ff0000";
  g.lineJoin = "round";
  g.lineCap = "round";

  /* The signs, each drawn filled in a unit box (x, y in −0.5 … 0.5, y down), facing right. */
  type Sign = { w: number; h: number; draw: () => void };
  const poly = (pts: number[]) => {
    g.beginPath();
    for (let i = 0; i < pts.length; i += 2) (i ? g.lineTo : g.moveTo).call(g, pts[i], pts[i + 1]);
    g.closePath();
    g.fill();
  };
  const ell = (x: number, y: number, rx: number, ry: number, a = 0) => {
    g.beginPath();
    g.ellipse(x, y, rx, ry, a, 0, Math.PI * 2);
    g.fill();
  };
  const line = (w: number, ...pts: number[]) => {
    g.lineWidth = w;
    g.beginPath();
    for (let i = 0; i < pts.length; i += 2) (i ? g.lineTo : g.moveTo).call(g, pts[i], pts[i + 1]);
    g.stroke();
  };
  const bird = (neck: number, beak: number, tail: number) => {
    // a standing bird: body, head, beak, legs (the owl, vulture and chick share it)
    ell(-0.02, 0.02, 0.3, 0.2, -0.25);
    ell(0.2, -0.25 - neck, 0.12, 0.12);
    poly([0.06, -0.2, 0.2, -0.32 - neck, 0.28, -0.2]);
    poly([0.3, -0.27 - neck, 0.3 + beak, -0.22 - neck, 0.3, -0.2 - neck]);
    poly([-0.28, 0.02, -0.5, 0.12 + tail, -0.22, 0.18]);
    line(0.045, 0.0, 0.18, -0.04, 0.48, -0.12, 0.48);
    line(0.045, 0.1, 0.18, 0.14, 0.48, 0.22, 0.48);
  };
  const SIGNS: Sign[] = [
    { w: 1, h: 1, draw: () => { bird(0.04, 0.06, 0.04); ell(0.2, -0.3, 0.05, 0.05); } }, // owl
    { w: 1, h: 1, draw: () => { bird(0.1, 0.12, 0.08); poly([-0.1, -0.12, 0.12, -0.22, 0.2, -0.08]); } }, // vulture
    { w: 0.8, h: 1, draw: () => { ell(0, 0.05, 0.22, 0.24); ell(0.12, -0.24, 0.11, 0.11); poly([0.2, -0.27, 0.34, -0.22, 0.2, -0.18]); line(0.04, -0.04, 0.26, -0.08, 0.46); line(0.04, 0.06, 0.26, 0.1, 0.46); } }, // quail chick
    { w: 1, h: 0.45, draw: () => { g.beginPath(); g.moveTo(-0.5, 0.12); g.quadraticCurveTo(-0.25, -0.12, 0.0, 0.08); g.quadraticCurveTo(0.2, 0.2, 0.32, 0.0); g.lineTo(0.48, -0.04); g.lineTo(0.42, 0.12); g.quadraticCurveTo(0.2, 0.3, -0.02, 0.18); g.quadraticCurveTo(-0.25, 0.06, -0.48, 0.2); g.closePath(); g.fill(); poly([0.34, -0.02, 0.36, -0.16, 0.4, -0.02]); poly([0.42, -0.02, 0.45, -0.16, 0.47, -0.02]); } }, // horned viper
    { w: 0.6, h: 1, draw: () => { g.beginPath(); g.moveTo(-0.1, 0.48); g.quadraticCurveTo(-0.3, 0.1, 0.0, -0.1); g.quadraticCurveTo(0.2, -0.3, 0.0, -0.46); g.quadraticCurveTo(0.24, -0.4, 0.18, -0.1); g.quadraticCurveTo(-0.08, 0.12, 0.1, 0.48); g.closePath(); g.fill(); ell(0.02, -0.34, 0.14, 0.12); } }, // cobra
    { w: 0.35, h: 1, draw: () => { g.beginPath(); g.moveTo(-0.04, 0.48); g.lineTo(-0.04, -0.2); g.quadraticCurveTo(-0.02, -0.5, 0.14, -0.48); g.quadraticCurveTo(0.12, -0.2, 0.04, -0.1); g.lineTo(0.04, 0.48); g.closePath(); g.fill(); } }, // reed leaf
    { w: 1, h: 0.25, draw: () => { g.lineWidth = 0.07; g.beginPath(); g.moveTo(-0.5, 0); for (let k = 0; k <= 8; k++) g.lineTo(-0.5 + k / 8, k % 2 ? -0.1 : 0.1); g.stroke(); } }, // water
    { w: 1, h: 0.4, draw: () => { g.beginPath(); g.ellipse(0, 0, 0.46, 0.15, 0, 0, Math.PI * 2); g.fill(); } }, // mouth
    { w: 0.6, h: 0.4, draw: () => { g.beginPath(); g.moveTo(-0.3, 0.16); g.arc(0, 0.16, 0.3, Math.PI, 0); g.closePath(); g.fill(); } }, // loaf
    { w: 0.9, h: 0.45, draw: () => { g.beginPath(); g.moveTo(-0.44, -0.14); g.lineTo(0.44, -0.14); g.quadraticCurveTo(0.4, 0.2, 0, 0.2); g.quadraticCurveTo(-0.4, 0.2, -0.44, -0.14); g.fill(); line(0.05, 0.3, -0.14, 0.42, -0.24); } }, // basket
    { w: 1, h: 0.3, draw: () => { g.fillRect(-0.48, -0.06, 0.96, 0.12); g.fillRect(-0.3, -0.14, 0.08, 0.28); g.fillRect(0.22, -0.14, 0.08, 0.28); } }, // bolt
    { w: 1, h: 0.35, draw: () => { g.beginPath(); g.moveTo(-0.48, 0.1); g.lineTo(0.3, 0.1); g.quadraticCurveTo(0.5, 0.06, 0.44, -0.06); g.lineTo(0.1, -0.06); g.lineTo(0.0, -0.14); g.lineTo(-0.04, -0.06); g.lineTo(-0.48, -0.04); g.closePath(); g.fill(); } }, // hand
    { w: 1, h: 0.4, draw: () => { g.beginPath(); g.moveTo(-0.48, 0.14); g.lineTo(0.2, 0.06); g.lineTo(0.44, -0.12); g.lineTo(0.48, -0.02); g.lineTo(0.24, 0.16); g.lineTo(-0.48, 0.2); g.closePath(); g.fill(); } }, // arm
    { w: 1, h: 0.45, draw: () => { g.lineWidth = 0.06; g.beginPath(); g.ellipse(0, -0.02, 0.36, 0.13, 0, 0, Math.PI * 2); g.stroke(); ell(0, -0.02, 0.09, 0.1); line(0.05, -0.05, 0.1, -0.1, 0.22, 0.04, 0.22); line(0.05, 0.12, 0.1, 0.2, 0.22); } }, // eye
    { w: 0.5, h: 1, draw: () => { g.lineWidth = 0.08; g.beginPath(); g.ellipse(0, -0.3, 0.12, 0.17, 0, 0, Math.PI * 2); g.stroke(); g.fillRect(-0.24, -0.13, 0.48, 0.07); g.fillRect(-0.04, -0.1, 0.08, 0.58); } }, // ankh
    { w: 0.5, h: 1, draw: () => { g.fillRect(-0.07, -0.48, 0.14, 0.96); for (let k = 0; k < 4; k++) g.fillRect(-0.2, -0.46 + k * 0.08, 0.4, 0.045); g.fillRect(-0.16, 0.42, 0.32, 0.06); } }, // djed
    { w: 0.4, h: 1, draw: () => { g.fillRect(-0.03, -0.38, 0.06, 0.86); poly([-0.03, -0.38, 0.16, -0.48, 0.18, -0.4, 0.03, -0.32]); line(0.06, -0.03, 0.48, -0.12, 0.42); line(0.06, 0.03, 0.48, 0.1, 0.42); } }, // was-sceptre
    { w: 0.6, h: 0.6, draw: () => { g.lineWidth = 0.07; g.beginPath(); g.arc(0, 0, 0.26, 0, Math.PI * 2); g.stroke(); ell(0, 0, 0.07, 0.07); } }, // sun
    { w: 0.9, h: 0.55, draw: () => { g.lineWidth = 0.07; g.strokeRect(-0.4, -0.22, 0.8, 0.44); g.fillStyle = "#000"; g.fillRect(-0.12, 0.12, 0.24, 0.12); g.fillStyle = "#ff0000"; } }, // house
    { w: 1, h: 0.45, draw: () => { g.fillRect(-0.46, 0.08, 0.92, 0.1); poly([-0.06, 0.08, -0.06, -0.16, 0.06, -0.16, 0.06, 0.08]); g.beginPath(); g.ellipse(0, -0.16, 0.16, 0.05, 0, 0, Math.PI * 2); g.fill(); } }, // offering mat
    { w: 0.8, h: 0.8, draw: () => { ell(0, 0.06, 0.16, 0.26); g.lineWidth = 0.04; for (let k = -1; k <= 1; k++) line(0.04, -0.16, 0.06 + k * 0.1, 0.16, 0.06 + k * 0.1); ell(-0.22, -0.18, 0.18, 0.08, -0.5); ell(0.22, -0.18, 0.18, 0.08, 0.5); ell(0, -0.26, 0.08, 0.07); } }, // bee
    { w: 0.6, h: 1, draw: () => { g.fillRect(-0.03, -0.3, 0.06, 0.78); poly([-0.03, -0.3, -0.22, -0.48, -0.1, -0.24]); poly([0.03, -0.3, 0.22, -0.48, 0.1, -0.24]); poly([-0.03, -0.1, -0.2, -0.22, -0.08, -0.02]); } }, // sedge
    { w: 0.35, h: 1, draw: () => { g.beginPath(); g.moveTo(0, 0.48); g.quadraticCurveTo(-0.16, 0, -0.04, -0.46); g.quadraticCurveTo(0.18, -0.3, 0.14, 0.0); g.quadraticCurveTo(0.1, 0.3, 0.02, 0.48); g.fill(); } }, // feather
    { w: 0.8, h: 1, draw: () => { ell(0.04, -0.38, 0.1, 0.1); poly([-0.06, -0.3, 0.12, -0.3, 0.14, 0.04, 0.36, 0.08, 0.36, 0.2, -0.14, 0.2]); poly([0.24, -0.2, 0.42, -0.1, 0.4, -0.04, 0.16, -0.12]); g.fillRect(-0.18, 0.2, 0.08, 0.28); poly([0.26, 0.2, 0.34, 0.2, 0.36, 0.48, 0.26, 0.48]); } }, // seated man
    { w: 0.7, h: 1, draw: () => { ell(0.04, -0.38, 0.1, 0.1); poly([-0.08, -0.38, -0.12, -0.12, 0.0, -0.2]); poly([-0.04, -0.28, 0.12, -0.28, 0.12, 0.2, -0.16, 0.2, -0.14, -0.05]); poly([-0.16, 0.2, 0.3, 0.2, 0.28, 0.48, -0.16, 0.48]); } }, // seated woman
    { w: 1, h: 0.35, draw: () => { g.beginPath(); g.moveTo(-0.46, 0.12); g.lineTo(0.46, 0.12); g.quadraticCurveTo(0.3, -0.04, 0.0, -0.1); g.quadraticCurveTo(-0.3, -0.04, -0.46, 0.12); g.fill(); } }, // the sky-like flat sign
    { w: 0.55, h: 0.9, draw: () => { g.beginPath(); g.moveTo(-0.16, -0.46); g.lineTo(0.16, -0.46); g.lineTo(0.12, -0.34); g.quadraticCurveTo(0.26, 0.0, 0.14, 0.4); g.lineTo(-0.14, 0.4); g.quadraticCurveTo(-0.26, 0.0, -0.12, -0.34); g.closePath(); g.fill(); } }, // jar
    { w: 0.8, h: 0.8, draw: () => { g.lineWidth = 0.06; g.beginPath(); g.arc(0, 0, 0.3, 0, Math.PI * 2); g.stroke(); line(0.05, -0.3, 0, 0.3, 0); line(0.05, 0, -0.3, 0, 0.3); } }, // village
  ];
  const TALL = SIGNS.filter((s) => s.h >= 0.8 && s.w <= 0.6), FLAT = SIGNS.filter((s) => s.h <= 0.45), FULL = SIGNS.filter((s) => s.h >= 0.8 && s.w > 0.6);
  const pick = <T,>(a: T[]) => a[Math.floor(R() * a.length)];
  const drawSign = (s: Sign, cx: number, cy: number, size: number, flip: number) => {
    g.save();
    g.translate(cx, cy);
    g.scale(size * flip, size);
    s.draw();
    g.restore();
  };
  /** One quadrat (a square of `q` px): a full sign, two tall side by side, or two flat stacked. */
  const quadrat = (cx: number, cy: number, q: number, flip: number) => {
    const r = R();
    if (r < 0.38) drawSign(pick(FULL), cx, cy, q * 0.86, flip);
    else if (r < 0.66) {
      drawSign(pick(TALL), cx - q * 0.22, cy, q * 0.86, flip);
      drawSign(pick(TALL), cx + q * 0.22, cy, q * 0.86, flip);
    } else {
      drawSign(pick(FLAT), cx, cy - q * 0.22, q * 0.8, flip);
      drawSign(pick(FLAT), cx, cy + q * 0.2, q * 0.8, flip);
    }
  };
  /** A column of quadrats down [top, bottom] (px), `w` wide, ruled either side. */
  const column = (cx: number, top: number, bottom: number, w: number, flip: number) => {
    const q = w * 0.84;
    for (let y = top + q * 0.6; y < bottom - q * 0.45; y += q * 1.08) quadrat(cx, y, q, flip);
    line(2.2, cx - w / 2, top, cx - w / 2, bottom);
    line(2.2, cx + w / 2, top, cx + w / 2, bottom);
  };
  /** A horizontal register of quadrats from right to left over [left, right] (px). */
  const register = (left: number, right: number, cy: number, h: number, flip: number) => {
    const q = h * 0.86;
    for (let x = right - q * 0.6; x > left + q * 0.45; x -= q * 1.06) quadrat(x, cy, q, flip);
    line(2.2, left, cy - h / 2, right, cy - h / 2);
    line(2.2, left, cy + h / 2, right, cy + h / 2);
  };
  /** The remembered one standing (wig, broad collar, kilt), staff ahead and sceptre in the other
      hand, facing `dir` (1 right), feet on `foot` px, `s` px tall. */
  const stander = (cx: number, foot: number, s: number, dir: number) => {
    g.save();
    g.translate(cx, foot);
    g.scale(s * dir, s);
    // y from −1 (crown) to 0 (soles)
    ell(0.0, -0.9, 0.075, 0.08); // head
    poly([-0.08, -0.97, 0.03, -0.99, 0.09, -0.9, 0.06, -0.8, -0.1, -0.78]); // the wig
    poly([0.06, -0.88, 0.11, -0.86, 0.07, -0.84]); // nose
    poly([-0.09, -0.8, 0.09, -0.8, 0.1, -0.72, -0.1, -0.72]); // collar
    poly([-0.1, -0.74, 0.1, -0.74, 0.07, -0.5, -0.06, -0.5]); // torso
    poly([-0.08, -0.52, 0.09, -0.52, 0.2, -0.3, -0.07, -0.3]); // the flared kilt
    poly([0.03, -0.31, 0.08, -0.31, 0.17, -0.02, 0.21, 0.0, 0.11, 0.0, 0.08, -0.02]); // front leg
    poly([-0.06, -0.31, -0.01, -0.31, -0.04, -0.02, 0.0, 0.0, -0.1, 0.0, -0.09, -0.02]); // back leg
    poly([0.08, -0.72, 0.24, -0.6, 0.23, -0.56, 0.06, -0.66]); // forearm to the staff
    g.fillRect(0.235, -1.02, 0.025, 1.02); // the staff
    poly([-0.08, -0.72, -0.12, -0.5, -0.09, -0.48, -0.05, -0.66]); // the other arm
    g.fillRect(-0.15, -0.52, 0.07, 0.025); // the sceptre, held across
    g.restore();
  };
  const [u0, u1] = L.upper;
  // the upper lintel: three registers, a seated figure at their end facing them
  const regH = ((u1 - u0) * P - 16) / 3;
  for (let k = 0; k < 3; k++) register(X(-SW / 2 + 0.1), X(SW / 2 - 0.42), Yp(u1) + 8 + regH * (k + 0.5), regH, 1);
  drawSign(SIGNS[23], X(SW / 2 - 0.22), Yp((u0 + u1) / 2) + 4, (u1 - u0) * P * 0.9, -1);
  // outer jambs: two columns each over a standing figure facing the door
  for (const sx of [-1, 1]) {
    const cx0 = sx * (SW / 2 - L.outer / 2);
    for (const d of [-0.13, 0.13]) column(X(cx0 + d), Yp(u0 - 0.04), Yp(0.92), 0.24 * P, sx);
    stander(X(cx0), Yp(0.04), 0.84 * P, -sx);
  }
  // inner jambs: two narrower columns each, a smaller figure at the foot
  for (const sx of [-1, 1]) {
    const cx0 = sx * (L.slot / 2 + L.inner / 2);
    for (const d of [-0.11, 0.11]) column(X(cx0 + d), Yp(L.lower[0] - 0.04), Yp(0.78), 0.2 * P, sx);
    stander(X(cx0), Yp(0.04), 0.7 * P, -sx);
  }
  // the slot: one column down its middle, a figure at its foot
  column(X(0), Yp(L.niche - 0.06), Yp(0.86), 0.22 * P, 1);
  stander(X(0), Yp(0.04), 0.78 * P, 1);
  // the lower lintel: one register
  register(X(-SW / 2 + L.outer + 0.04), X(SW / 2 - L.outer - 0.04), Yp((L.lower[0] + L.lower[1]) / 2), (L.lower[1] - L.lower[0]) * P - 10, 1);
  // the panel: the remembered one seated on a lion-legged seat, a hand out to the table of tall
  // half-loaves; over the table jars, a basin, a haunch; signs across the top
  {
    const [p0, p1] = L.panel;
    const pl = X(-0.6), pr = X(0.6), pt = Yp(p1), pb = Yp(p0);
    line(2.5, pl + 6, pt + 6, pr - 6, pt + 6, pr - 6, pb - 6, pl + 6, pb - 6, pl + 6, pt + 6);
    const s = (pb - pt) * 0.7, fx = pl + 70, fb = pb - 12;
    g.save();
    g.translate(fx, fb);
    g.scale(s, s);
    ell(0.04, -0.94, 0.075, 0.08);
    poly([-0.06, -1.01, 0.05, -1.03, 0.1, -0.94, 0.07, -0.84, -0.09, -0.8]);
    poly([-0.08, -0.84, 0.1, -0.84, 0.1, -0.5, -0.12, -0.5]); // torso
    poly([0.08, -0.78, 0.3, -0.66, 0.29, -0.62, 0.06, -0.7]); // the hand out
    poly([-0.14, -0.52, 0.26, -0.52, 0.26, -0.44, -0.14, -0.42]); // lap
    poly([0.18, -0.46, 0.26, -0.46, 0.26, 0.0, 0.32, 0.0, 0.32, 0.02, 0.18, 0.02]); // shin, foot
    g.fillRect(-0.2, -0.42, 0.34, 0.04); // the seat
    poly([-0.2, -0.38, -0.16, -0.38, -0.15, -0.1, -0.12, 0.0, -0.2, 0.0]); // lion leg
    poly([0.06, -0.38, 0.1, -0.38, 0.11, -0.1, 0.14, 0.0, 0.06, 0.0]);
    g.restore();
    // the table on its stand, and on it the tall half-loaves standing in a row
    const tx = fx + s * 0.42;
    g.fillRect(tx + s * 0.18, fb - s * 0.32, s * 0.05, s * 0.32);
    g.fillRect(tx, fb - s * 0.34, s * 0.42, s * 0.04);
    for (let k = 0; k < 8; k++) {
      const x = tx + s * 0.03 + k * s * 0.05;
      poly([x, fb - s * 0.34, x + s * 0.02, fb - s * (0.82 + (k % 3 === 1 ? 0.05 : 0)), x + s * 0.04, fb - s * 0.34]);
    }
    // jars, a basin and a haunch over and beside it
    drawSign(SIGNS[26], tx + s * 0.62, fb - s * 0.7, s * 0.3, 1);
    drawSign(SIGNS[26], tx + s * 0.8, fb - s * 0.7, s * 0.3, 1);
    drawSign(SIGNS[9], tx + s * 0.7, fb - s * 0.3, s * 0.32, 1);
    drawSign(SIGNS[12], tx + s * 0.72, fb - s * 0.48, s * 0.3, -1);
    register(pl + 16, pr - 16, pt + 26, 30, 1);
  }
  // the apertures either side of the panel: two short columns each
  for (const sx of [-1, 1]) for (const d of [-0.07, 0.07]) column(X(sx * 0.82 + d), Yp(L.panel[1] - 0.04), Yp(L.panel[0] + 0.04), 0.13 * P, sx);

  // G: the lip of every cut catches the light just above and left of it
  const cut = g.getImageData(0, 0, W, H);
  const out = g.createImageData(W, H);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4, r = cut.data[i];
      const up = y > 3 && x > 3 ? cut.data[((y - 4) * W + (x - 4)) * 4] : 0;
      out.data[i] = r;
      out.data[i + 1] = Math.max(0, up - r);
      out.data[i + 3] = 255;
    }
  // B: the granite wash, nearly whole, worn away at the edges of the slab, at the foot and in a
  // few broad scuffs (never blotches)
  for (let y = 0; y < H; y += 2)
    for (let x = 0; x < W; x += 2) {
      const ex = Math.min(x, W - x) / W, ey = Math.min(y, H - y) / H;
      const edge = Math.min(1, Math.min(ex, ey) * 14);
      const foot = Math.min(1, (H - y) / (H * 0.12));
      const n = Math.sin(x * 0.011 + Math.sin(y * 0.007) * 3) * Math.cos(y * 0.009 - x * 0.003);
      const scuff = n > 0.62 ? 0.35 : 1;
      const v = Math.round(255 * edge * foot * scuff * (0.82 + 0.18 * Math.sin(x * 0.07 + y * 0.05)));
      for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) out.data[((y + dy) * W + x + dx) * 4 + 2] = v;
    }
  g.putImageData(out, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.NoColorSpace;
  t.anisotropy = 8;
  return t;
}

/** The stone: the casing's limestone grain from three sides, weathered toward the foot. On the
    slab's front (`aFront`), the granite wash where it survives (red, black flecks) and the cut
    signs, which take their own shadow and lit lip through a bump from the carving. */
function doorStone(carve: THREE.Texture): THREE.MeshStandardNodeMaterial {
  const m = new THREE.MeshStandardNodeMaterial({ metalness: 0, roughness: 0.85 });
  const S = scan("sandstone_cracks");
  const pw = positionWorld, n = T.normalWorldGeometry;
  const wp = T.pow(abs(n), vec3(4));
  const w = wp.div(wp.x.add(wp.y).add(wp.z));
  const tile = 2.6;
  const tri = (t: THREE.Texture) => T.texture(t, pw.zy.div(tile)).mul(w.x).add(T.texture(t, pw.xz.div(tile)).mul(w.y)).add(T.texture(t, pw.xy.div(tile)).mul(w.z));
  const arm = tri(S.arm);
  let c: N = tri(S.diff).rgb.mul(vec3(1.4 * 0.835, 1.34 * 0.965, 1.22 * 1.141)).mul(mix(float(0.55), float(1), arm.r));
  const front = T.attribute("aFront", "float");
  const k = T.texture(carve, T.uv(1));
  const cut = k.r.mul(front), lip = k.g.mul(front), paint = k.b.mul(front);
  // the granite wash: red ochre with black flecks, worn through to the stone in patches
  const fleck = smoothstep(0.62, 0.72, T.mx_noise_float(pw.mul(19)).mul(0.5).add(0.5));
  const granite = mix(vec3(0.36, 0.13, 0.085), vec3(0.05, 0.035, 0.03), fleck);
  c = mix(c, granite.mul(c.dot(vec3(0.333)).mul(1.6).add(0.25)), paint.mul(0.62));
  // the cut: darker in its depth, a pale lip above it
  c = c.mul(float(1).sub(cut.mul(0.42))).add(vec3(0.9, 0.82, 0.7).mul(lip.mul(0.12)));
  // grime and sand toward the foot, dust in what faces up
  const foot = smoothstep(1.4, 0, pw.y.sub(PYRAMID.y));
  c = mix(c, c.mul(vec3(0.82, 0.74, 0.62)), foot.mul(0.5));
  const nz = T.mx_noise_float(pw.mul(0.8)).mul(0.5).add(0.5);
  c = mix(c, vec3(0.86, 0.76, 0.6), smoothstep(0.6, 0.95, n.y).mul(nz).mul(0.4));
  m.colorNode = vec4(c, 1);
  m.roughnessNode = clamp(arm.g.add(paint.mul(0.1)), 0.5, 1);
  // the scan's relief, and the carving cut into the front
  const nm = (t: THREE.Texture) => [T.texture(t, pw.zy.div(tile)), T.texture(t, pw.xz.div(tile)), T.texture(t, pw.xy.div(tile))].map((x: N) => x.xy.mul(2).sub(1));
  const [nx, ny, nzz] = nm(S.nor);
  const dn = vec3(0, nx.y, nx.x).mul(w.x).add(vec3(ny.x, 0, ny.y).mul(w.y)).add(vec3(nzz.x, nzz.y, 0).mul(w.z));
  const base = T.normalize(T.normalView.add(T.cameraViewMatrix.mul(vec4(dn.mul(1.0), 0)).xyz));
  m.normalNode = mix(base, T.bumpMap(float(1).sub(k.r), 1.6), front.mul(0.7));
  m.emissiveNode = c.mul(0.04);
  return m;
}

/* ---------------------------------------------------------------- one door, in its own frame */
type Box = { x: number; y: number; z0: number; z1: number; w: number; h: number; front?: boolean };
/** The slab's parts (frame above, y from the slab's foot) and the chapel wall round it. */
function doorParts(): Box[] {
  const o = L.outer, i = L.inner, s = L.slot, half = SW / 2;
  return [
    // the chapel's wall about the slab (its face 4 cm behind the slab's), a low plinth below all
    { x: 0, y: -Y0 / 2, z0: -2.6, z1: 0.18, w: 6.4, h: Y0, },
    { x: -(half + 0.8), y: 2.6, z0: -2.6, z1: -0.04, w: 1.6, h: 5.2 },
    { x: half + 0.8, y: 2.6, z0: -2.6, z1: -0.04, w: 1.6, h: 5.2 },
    { x: 0, y: SH + 0.6, z0: -2.6, z1: -0.04, w: SW, h: 1.2 },
    // behind every recess
    { x: 0, y: SH / 2, z0: -2.6, z1: -0.3, w: SW, h: SH },
    // the outer jambs and the upper lintel, flush at the front
    { x: -half + o / 2, y: L.upper[0] / 2, z0: -0.3, z1: 0, w: o, h: L.upper[0], front: true },
    { x: half - o / 2, y: L.upper[0] / 2, z0: -0.3, z1: 0, w: o, h: L.upper[0], front: true },
    { x: 0, y: (L.upper[0] + L.upper[1]) / 2, z0: -0.3, z1: 0, w: SW, h: L.upper[1] - L.upper[0], front: true },
    // the panel band: the apertures (deeper) either side of the panel
    { x: 0, y: (L.panel[0] + L.panel[1]) / 2, z0: -0.3, z1: -0.05, w: 1.2, h: L.panel[1] - L.panel[0], front: true },
    { x: -0.82, y: (L.panel[0] + L.panel[1]) / 2, z0: -0.3, z1: -0.09, w: SW - 2 * o - 1.2, h: L.panel[1] - L.panel[0], front: true },
    { x: 0.82, y: (L.panel[0] + L.panel[1]) / 2, z0: -0.3, z1: -0.09, w: SW - 2 * o - 1.2, h: L.panel[1] - L.panel[0], front: true },
    // the lower lintel, a step in
    { x: 0, y: (L.lower[0] + L.lower[1]) / 2, z0: -0.3, z1: -0.03, w: SW - 2 * o, h: L.lower[1] - L.lower[0], front: true },
    // between the outer and inner jambs, a narrow step
    { x: -(s / 2 + i + (half - o - s / 2 - i) / 2), y: L.lower[0] / 2, z0: -0.3, z1: -0.05, w: half - o - s / 2 - i, h: L.lower[0], front: true },
    { x: s / 2 + i + (half - o - s / 2 - i) / 2, y: L.lower[0] / 2, z0: -0.3, z1: -0.05, w: half - o - s / 2 - i, h: L.lower[0], front: true },
    // the inner jambs, a further step in
    { x: -(s / 2 + i / 2), y: L.lower[0] / 2, z0: -0.3, z1: -0.08, w: i, h: L.lower[0], front: true },
    { x: s / 2 + i / 2, y: L.lower[0] / 2, z0: -0.3, z1: -0.08, w: i, h: L.lower[0], front: true },
    // above the drum, to the lower lintel
    { x: 0, y: (L.niche + L.lower[0]) / 2, z0: -0.3, z1: -0.1, w: s, h: L.lower[0] - L.niche, front: true },
    // the slot: the door itself, plain and deepest
    { x: 0, y: L.niche / 2, z0: -0.3, z1: -0.2, w: s, h: L.niche },
  ];
}
/** Merge a door into one geometry in its frame, with the slab's elevation UV (`uv1`), which faces
    are the carved front (`aFront`); the torus moulding, the drum and the cavetto cornice added. */
function doorGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const tag = (g: THREE.BufferGeometry, front: boolean) => {
    const x = g.index ? g.toNonIndexed() : g;
    for (const a of Object.keys(x.attributes)) if (a !== "position" && a !== "normal") x.deleteAttribute(a);
    const p = x.attributes.position as THREE.BufferAttribute, nrm = x.attributes.normal as THREE.BufferAttribute;
    const uv1 = new Float32Array(p.count * 2), fr = new Float32Array(p.count);
    for (let k = 0; k < p.count; k++) {
      uv1[k * 2] = (p.getX(k) + SW / 2) / SW;
      uv1[k * 2 + 1] = (p.getY(k) - Y0) / SH;
      fr[k] = front && nrm.getZ(k) > 0.9 ? 1 : 0;
    }
    x.setAttribute("uv1", new THREE.BufferAttribute(uv1, 2));
    x.setAttribute("aFront", new THREE.BufferAttribute(fr, 1));
    parts.push(x);
  };
  for (const b of doorParts()) {
    const g = new THREE.BoxGeometry(b.w, b.h, b.z1 - b.z0);
    g.translate(b.x, b.y + Y0, (b.z0 + b.z1) / 2);
    tag(g, !!b.front);
  }
  // the torus moulding: a round bead up both edges and across the top of the slab
  for (const sx of [-1, 1]) {
    const g = new THREE.CylinderGeometry(0.075, 0.075, L.upper[1], 10);
    g.translate(sx * (SW / 2 + 0.02), Y0 + L.upper[1] / 2, -0.01);
    tag(g, false);
  }
  {
    const g = new THREE.CylinderGeometry(0.075, 0.075, SW + 0.2, 10);
    g.rotateZ(Math.PI / 2);
    g.translate(0, Y0 + L.upper[1] + 0.05, -0.01);
    tag(g, false);
  }
  // the drum over the slot (the rolled reed mat of a real door)
  {
    const g = new THREE.CylinderGeometry(0.12, 0.12, L.slot, 14);
    g.rotateZ(Math.PI / 2);
    g.translate(0, Y0 + L.niche + 0.0, -0.14);
    tag(g, false);
  }
  // the cavetto cornice: a hollow flaring out, a flat band on top; grooves for its palm leaves
  {
    const sh = new THREE.Shape();
    const z0 = -0.02, h = 0.42, out = 0.3;
    sh.moveTo(z0, 0);
    for (let k = 0; k <= 10; k++) {
      const t = k / 10;
      sh.lineTo(z0 + out * (1 - Math.cos((t * Math.PI) / 2)), h * Math.sin((t * Math.PI) / 2) * 0.9);
    }
    sh.lineTo(z0 + out, h);
    sh.lineTo(-0.4, h);
    sh.lineTo(-0.4, 0);
    sh.closePath();
    const g = new THREE.ExtrudeGeometry(sh, { depth: SW + 0.5, bevelEnabled: false, curveSegments: 1 });
    // the shape is drawn in (z, y): turn it so its depth runs across the slab
    g.rotateY(-Math.PI / 2); // shape x → +z (out of the wall), its depth → −x
    g.translate((SW + 0.5) / 2, Y0 + L.upper[1] + 0.12, 0);
    g.computeVertexNormals();
    tag(g, false);
    for (let k = 0; k < 15; k++) {
      const lf = new THREE.BoxGeometry(0.03, 0.3, 0.04);
      lf.rotateX(-0.6);
      lf.translate(-(SW + 0.4) / 2 + 0.12 + k * ((SW + 0.16) / 14), Y0 + L.upper[1] + 0.32, 0.12);
      tag(lf, false);
    }
  }
  return mergeGeometries(parts);
}

/** The offering table before the door: a stone slab in the shape of the sign for an offering (a
    loaf on a reed mat), its spout toward you, a loaf and two libation basins cut in its top; on it
    what was left: loaves, a small jar. Low on the ground, as they stood in the chapels. */
function offeringGeometry(R: () => number): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const slab = new THREE.BoxGeometry(1.5, 0.22, 0.95);
  slab.translate(0, 0.11, 0);
  parts.push(slab);
  const spout = new THREE.BoxGeometry(0.42, 0.22, 0.36);
  spout.translate(0, 0.11, 0.62);
  parts.push(spout);
  // the loaf on its mat, raised a little in the top's middle
  const mat = new THREE.BoxGeometry(0.62, 0.025, 0.2);
  mat.translate(0, 0.232, -0.12);
  parts.push(mat);
  const loaf = new THREE.CylinderGeometry(0.07, 0.07, 0.24, 12, 1, false, 0, Math.PI);
  loaf.rotateZ(Math.PI / 2);
  loaf.rotateX(-Math.PI / 2);
  loaf.translate(0, 0.245, -0.03);
  parts.push(loaf);
  // left on it: two round loaves, a tall conical one, a jar
  for (let k = 0; k < 3; k++) {
    const l = k === 1 ? new THREE.ConeGeometry(0.07, 0.3, 10) : new THREE.SphereGeometry(0.1, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2);
    if (k !== 1) l.scale(1, 0.6, 1.1);
    l.translate(-0.48 + k * 0.2 + (R() - 0.5) * 0.04, k === 1 ? 0.37 : 0.22, 0.2 + (R() - 0.5) * 0.08);
    parts.push(l);
  }
  const jar = new THREE.LatheGeometry([0, 0.06, 0.09, 0.1, 0.08, 0.04, 0.05].map((r, i) => new THREE.Vector2(r, i * 0.045)), 14);
  jar.translate(0.5, 0.22, 0.12);
  parts.push(jar);
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
    const glowGeo = new THREE.PlaneGeometry(L.slot - 0.02, L.niche - 0.02);
    glowGeo.translate(0, Y0 + L.niche / 2, -0.19);
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
        const bx = px + f.nx * (H + 0.35) + tx * s, bz = pz + f.nz * (H + 0.35) + tz * s;
        const by = heightAt(bx, bz);
        const head = Math.atan2(f.nx, f.nz); // +z of the door's frame turned outward
        const door = new THREE.Group();
        door.position.set(bx, by, bz);
        door.rotation.y = head;
        const mesh = new THREE.Mesh(geo, stone);
        mesh.castShadow = mesh.receiveShadow = true;
        const slab = new THREE.Mesh(offering, stone);
        slab.position.set(0, 0, 1.05);
        slab.rotation.y = (R() - 0.5) * 0.08;
        slab.receiveShadow = true;
        // the warm light within the niche: dim at rest, swelling with the exhale
        const uB = uniform(0), uN = uniform(0);
        const gm = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
        {
          const q = uv().sub(vec2(0.5, 0.45)).mul(vec2(2.0, 1.15));
          const soft = smoothstep(1, 0.1, length(q));
          gm.colorNode = vec4(vec3(1.0, 0.76, 0.42).mul(soft).mul(uB.mul(float(0.55).add(uN.mul(0.35))).add(0.05)).mul(0.5), 1);
        }
        const glow = new THREE.Mesh(glowGeo, gm);
        glow.position.z = 0.005;
        // the breath of dust: motes born in the niche, drifting out and up on the exhale
        const motes = breathMotes(this.uT, uB, uN, R, i);
        door.add(mesh, slab, glow, motes);
        this.group.add(door);
        // solid: the door's block (its jambs and plinth), turned with it
        colliders.push({ x: bx - f.nx * 1.2, z: bz - f.nz * 1.2, r: 0, hx: 3.2, hz: 1.45, ang: head, top: by + 5.6 });
        const out = new V3(f.nx, 0, f.nz);
        this.doors.push({ at: new V3(bx + f.nx * 0.5, by + 1.5, bz + f.nz * 0.5), out, period: 8 + ((i * 7) % 9) * 0.5, phase: R() * 12, near: 0, breath: 0 });
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
  const start = vec3(K.y.sub(0.5).mul(0.6), float(0.4).add(K.z.mul(2.2)), -0.18);
  const drift = vec3(K.y.sub(0.5).mul(1.8), K.w.mul(1.2).add(0.2), float(1.8).add(K.z.mul(2.4)));
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
