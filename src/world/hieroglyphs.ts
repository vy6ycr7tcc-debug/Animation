/* The signs of the old inscriptions, painted on a canvas: real hieroglyphic sign shapes (owl,
   vulture, quail chick, viper, cobra, reed, water, mouth, loaf, basket, bolt, hand, arm, eye,
   ankh, djed, was-sceptre, sun, house, offering mat, bee, sedge, feather, seated man and woman,
   jars…), grouped in quadrats as inscriptions are: tall signs side by side, flat ones stacked.
   Their order is decorative: they spell no names and no words. Shared by the pyramid's false
   doors and the temple's walls. Paint in red (#ff0000): the red channel is the cut. */

export type Sign = { w: number; h: number; draw: () => void };
export interface SignPainter {
  SIGNS: Sign[];
  poly: (pts: number[]) => void;
  ell: (x: number, y: number, rx: number, ry: number, a?: number) => void;
  line: (w: number, ...pts: number[]) => void;
  drawSign: (s: Sign, cx: number, cy: number, size: number, flip: number) => void;
  /** One quadrat (a square of `q` px): a full sign, two tall side by side, or two flat stacked. */
  quadrat: (cx: number, cy: number, q: number, flip: number) => void;
  /** A column of quadrats down [top, bottom] (px), `w` wide, ruled either side. */
  column: (cx: number, top: number, bottom: number, w: number, flip: number) => void;
  /** A horizontal register of quadrats from right to left over [left, right] (px). */
  register: (left: number, right: number, cy: number, h: number, flip: number) => void;
  /** A figure standing (wig, broad collar, kilt), staff ahead and sceptre in the other hand,
      facing `dir` (1 right), feet on `foot` px, `s` px tall. */
  stander: (cx: number, foot: number, s: number, dir: number) => void;
}

export function signPainter(g: CanvasRenderingContext2D, R: () => number): SignPainter {
  g.fillStyle = "#ff0000";
  g.strokeStyle = "#ff0000";
  g.lineJoin = "round";
  g.lineCap = "round";

  /* The signs, each drawn filled in a unit box (x, y in −0.5 … 0.5, y down), facing right. */
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
  return { SIGNS, poly, ell, line, drawSign, quadrat, column, register, stander };
}

/** The lit lip of every cut (G: just above and left of it), from the cut in R. */
export function cutLips(g: CanvasRenderingContext2D, W: number, H: number): ImageData {
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
  return out;
}
