/* The temple's 26 station faces: the tarot, drawn in light.
   Each composition is hand-drawn here in code as gold linework on transparency —
   the poses, pillars and symbols echo the classic cards without copying any image.
   Drawn once at boot; the canvases become emissive textures on the monuments. */

export const CARD_W = 512;
export const CARD_H = 768;
export const CARD_COUNT = 26;

type Ctx = CanvasRenderingContext2D;

class Pen {
  c: Ctx;
  constructor(c: Ctx) {
    this.c = c;
    c.strokeStyle = "#eec97e";
    c.fillStyle = "#eec97e";
    c.lineWidth = 6;
    c.lineCap = "round";
    c.lineJoin = "round";
    c.shadowColor = "rgba(238,201,126,0.7)";
    c.shadowBlur = 10;
  }
  line(x1: number, y1: number, x2: number, y2: number): void {
    const c = this.c;
    c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke();
  }
  circle(x: number, y: number, r: number, fill = false): void {
    const c = this.c;
    c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2);
    if (fill) c.fill(); else c.stroke();
  }
  arc(x: number, y: number, r: number, a0: number, a1: number): void {
    const c = this.c;
    c.beginPath(); c.arc(x, y, r, a0, a1); c.stroke();
  }
  poly(pts: number[][], close = false): void {
    const c = this.c;
    c.beginPath();
    pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
    if (close) c.closePath();
    c.stroke();
  }
  curve(x1: number, y1: number, cx: number, cy: number, x2: number, y2: number): void {
    const c = this.c;
    c.beginPath(); c.moveTo(x1, y1); c.quadraticCurveTo(cx, cy, x2, y2); c.stroke();
  }
  dot(x: number, y: number, r = 6): void {
    this.circle(x, y, r, true);
  }
  rect(x: number, y: number, w: number, h: number): void {
    this.poly([[x, y], [x + w, y], [x + w, y + h], [x, y + h]], true);
  }
  /** four-point sparkle */
  star4(x: number, y: number, r: number): void {
    const k = r * 0.16;
    this.poly([[x, y - r], [x + k, y - k], [x + r, y], [x + k, y + k], [x, y + r], [x - k, y + k], [x - r, y], [x - k, y - k]], true);
  }
  star8(x: number, y: number, r: number): void {
    const pts: number[][] = [];
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2 - Math.PI / 2;
      const rr = i % 2 === 0 ? r : r * 0.4;
      pts.push([x + Math.cos(a) * rr, y + Math.sin(a) * rr]);
    }
    this.poly(pts, true);
  }
  text(s: string, x: number, y: number, size = 46): void {
    const c = this.c;
    c.font = `${size}px Georgia, 'Times New Roman', serif`;
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillText(s, x, y);
  }
  head(x: number, y: number, r = 26): void {
    this.circle(x, y, r);
  }
  /** small flame teardrop */
  flame(x: number, y: number, s: number): void {
    this.curve(x, y + s, x - s * 0.7, y, x, y - s * 1.4);
    this.curve(x, y - s * 1.4, x + s * 0.7, y, x, y + s);
    this.dot(x, y + s * 0.25, s * 0.22);
  }
  /** wavy water line */
  waves(x: number, y: number, w: number, n = 3): void {
    for (let i = 0; i < n; i++) {
      const yy = y + i * 22;
      this.curve(x, yy, x + w * 0.25, yy - 12, x + w * 0.5, yy);
      this.curve(x + w * 0.5, yy, x + w * 0.75, yy + 12, x + w, yy);
    }
  }
}

const TAU = Math.PI * 2;

/* ------------------------------------------------------------------ cards */

function opening(p: Pen): void {
  // the house with three rooms: lamp, fire, star
  p.poly([[106, 620], [106, 200], [256, 100], [406, 200], [406, 620]], true);
  p.line(206, 200, 206, 620);
  p.line(306, 200, 306, 620);
  p.circle(156, 330, 34);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU;
    p.line(156 + Math.cos(a) * 46, 330 + Math.sin(a) * 46, 156 + Math.cos(a) * 62, 330 + Math.sin(a) * 62);
  }
  p.flame(256, 400, 34);
  p.star4(356, 330, 34);
  p.rect(236, 520, 40, 100); // door
}

function magician(p: Pen): void {
  p.circle(224, 84, 20); p.circle(288, 84, 20); // the lemniscate
  p.head(256, 150);
  p.line(256, 180, 256, 420);
  p.poly([[256, 420], [192, 560], [320, 560]], true); // robe
  p.line(256, 225, 352, 118); p.dot(352, 118, 8); // arm to heaven
  p.line(256, 225, 162, 338); p.dot(162, 338, 8); // arm to earth
  p.poly([[120, 470], [392, 470], [392, 492], [120, 492]], true); // table
  p.line(150, 492, 150, 600); p.line(362, 492, 362, 600);
  p.line(160, 442, 205, 442); // wand
  p.arc(252, 448, 17, 0, Math.PI); // cup
  p.line(305, 418, 305, 462); p.line(292, 430, 318, 430); // sword
  p.circle(352, 440, 15); // pentacle
  for (const x of [90, 422]) { p.dot(x, 620, 7); p.line(x, 627, x, 660); } // lilies
}

function highPriestess(p: Pen): void {
  p.rect(66, 60, 62, 600); p.rect(384, 60, 62, 600); // the pillars
  p.text("B", 97, 130); p.text("J", 415, 130);
  p.rect(128, 150, 256, 250); // the veil
  for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) p.dot(168 + i * 58, 200 + j * 70, 7);
  p.head(256, 268, 28);
  p.poly([[228, 240], [256, 196], [284, 240]], true); // crown
  p.poly([[256, 300], [186, 560], [326, 560]], true); // robe
  p.line(220, 380, 292, 380); p.rect(232, 400, 48, 56); // the scroll
  p.arc(216, 640, 42, Math.PI * 0.4, Math.PI * 1.6); // crescent
  p.arc(256, 640, 42, Math.PI * 0.55, Math.PI * 1.45);
}

function empress(p: Pen): void {
  for (let i = 0; i < 9; i++) { // crown of stars
    const a = (i / 9) * TAU - Math.PI / 2;
    p.dot(256 + Math.cos(a) * 44, 150 + Math.sin(a) * 22, 6);
  }
  p.head(256, 210, 30);
  p.curve(200, 260, 170, 380, 190, 520); p.curve(312, 260, 342, 380, 322, 520); // hair
  p.poly([[256, 250], [180, 580], [332, 580]], true);
  p.line(368, 300, 368, 540); p.circle(368, 282, 15); // sceptre
  for (const x of [90, 422]) { // wheat
    p.line(x, 620, x, 420);
    for (let i = 0; i < 5; i++) { p.dot(x - 12, 440 + i * 34, 8); p.dot(x + 12, 452 + i * 34, 8); }
  }
  p.circle(120, 560, 34); p.circle(120, 618, 14); p.line(120, 632, 120, 662); // Venus shield
  p.waves(60, 680, 392, 2);
}

function emperor(p: Pen): void {
  p.poly([[60, 300], [130, 190], [200, 300]], true); // mountains
  p.poly([[312, 300], [382, 190], [452, 300]], true);
  p.rect(150, 340, 212, 270); // the stone throne
  p.rect(150, 300, 52, 52); p.rect(310, 300, 52, 52); // ram heads
  p.arc(150, 326, 20, Math.PI, TAU); p.arc(362, 326, 20, Math.PI, TAU);
  p.head(256, 300, 28);
  p.poly([[228, 272], [244, 250], [256, 270], [268, 250], [284, 272]], false); // crown
  p.line(256, 332, 256, 520); p.line(210, 360, 302, 360);
  p.line(176, 400, 176, 560); p.line(336, 400, 336, 560);
  p.circle(150, 430, 20); p.line(150, 450, 150, 478); p.line(136, 462, 164, 462); // orb
  p.line(376, 300, 376, 580); p.dot(376, 286, 9); // sceptre
}

function hierophant(p: Pen): void {
  p.rect(60, 90, 56, 560); p.rect(396, 90, 56, 560); // pillars
  p.head(256, 280, 30);
  p.arc(256, 262, 34, Math.PI, TAU); p.arc(256, 252, 26, Math.PI, TAU); p.arc(256, 242, 18, Math.PI, TAU); // triple crown
  p.poly([[256, 315], [186, 580], [326, 580]], true);
  p.line(300, 360, 356, 280); p.line(356, 280, 356, 252); p.line(370, 280, 370, 258); // blessing
  for (const x of [130, 382]) { // the two seekers
    p.head(x, 540, 20); p.arc(x, 600, 44, Math.PI, TAU);
  }
  p.line(216, 660, 296, 620); p.line(296, 660, 216, 620); // crossed keys
  p.circle(212, 664, 14); p.circle(300, 664, 14);
}

function lovers(p: Pen): void {
  p.circle(256, 150, 78); // the sun behind the angel
  p.curve(120, 220, 90, 120, 200, 90); p.curve(392, 220, 422, 120, 312, 90); // wings
  p.head(256, 150, 24);
  p.line(256, 178, 170, 240); p.line(256, 178, 342, 240); // angel's arms
  p.head(196, 420, 26); p.line(196, 450, 196, 600); p.line(196, 600, 170, 680); p.line(196, 600, 222, 680);
  p.head(316, 420, 26); p.line(316, 450, 316, 600); p.line(316, 600, 290, 680); p.line(316, 600, 342, 680);
  p.line(120, 640, 120, 480); p.circle(120, 430, 50); // tree of life
  for (let i = 0; i < 5; i++) p.dot(95 + (i % 2) * 50, 410 + i * 14, 7);
  p.line(392, 640, 392, 480); // tree of knowledge
  p.curve(392, 480, 360, 540, 392, 600); p.curve(392, 600, 424, 560, 392, 520); // the serpent
}

function chariot(p: Pen): void {
  for (const sx of [180, 256, 332]) for (const sy of [140, 175]) p.dot(sx, sy, 7); // canopy stars
  p.rect(150, 110, 212, 90);
  p.line(170, 200, 170, 400); p.line(342, 200, 342, 400); // posts
  p.head(256, 280, 26);
  p.line(256, 310, 200, 380); p.line(256, 310, 312, 380); // arms to the reins
  p.poly([[196, 400], [316, 400], [316, 560], [196, 560]], true); // the car
  p.circle(196, 580, 40); p.circle(316, 580, 40); // wheels
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU;
    p.line(196, 580, 196 + Math.cos(a) * 38, 580 + Math.sin(a) * 38);
    p.line(316, 580, 316 + Math.cos(a) * 38, 580 + Math.sin(a) * 38);
  }
  for (const [x, fill] of [[90, false], [422, true]] as [number, boolean][]) { // the sphinxes
    p.poly([[x - 46, 600], [x + 46, 600], [x + 40, 660], [x - 40, 660]], true);
    for (const lx of [-30, -10, 10, 30]) p.line(x + lx, 660, x + lx, 700);
    if (fill) { const c = p.c; c.save(); c.shadowBlur = 0; c.fillStyle = "#eec97e"; c.beginPath(); c.arc(x, 580, 22, 0, TAU); c.fill(); c.restore(); }
    else p.head(x, 580, 22);
    p.line(210, 380, x, 590); p.line(302, 380, x, 590); // reins
  }
}

function stairFlame(p: Pen): void {
  for (let i = 0; i < 6; i++) { // the stairway down
    const y = 220 + i * 70;
    p.poly([[90, y], [330 - i * 24, y], [330 - i * 24, y + 34], [90, y + 34]], true);
  }
  p.flame(330, 620, 40);
  for (let i = 0; i < 6; i++) p.dot(120 + i * 40, 150 - (i % 2) * 20, 6);
}

function strength(p: Pen): void {
  p.circle(226, 96, 19); p.circle(286, 96, 19); // the lemniscate
  p.head(256, 168, 27);
  p.curve(210, 200, 180, 330, 200, 470); p.curve(302, 200, 332, 330, 312, 470); // hair
  p.curve(230, 230, 210, 400, 226, 580); p.curve(282, 230, 302, 400, 286, 580); // gown
  p.line(236, 300, 256, 400); p.line(276, 300, 256, 400); // her arms
  p.circle(256, 470, 58); // the lion's head
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU;
    p.line(256 + Math.cos(a) * 58, 470 + Math.sin(a) * 58, 256 + Math.cos(a) * 82, 470 + Math.sin(a) * 82);
  }
  p.dot(240, 452, 8); p.dot(272, 452, 8); // her hands at its jaws
  p.line(256, 528, 200, 640); p.line(256, 528, 312, 640); // the lion's body
  p.arc(256, 620, 120, Math.PI * 1.15, Math.PI * 1.85); // garland
}

function hermit(p: Pen): void {
  p.poly([[60, 640], [256, 300], [452, 640]], false); // the peak
  p.poly([[256, 330], [176, 640], [336, 640]], true); // the cloak
  p.arc(256, 380, 40, Math.PI, TAU); // the hood
  p.dot(256, 392, 14);
  p.line(348, 300, 348, 660); // the staff
  p.line(230, 430, 160, 400); // arm with the lantern
  p.rect(118, 368, 66, 76);
  p.star8(151, 406, 22); // the star in the lantern
  for (let i = 0; i < 14; i++) p.dot(80 + ((i * 97) % 360), 120 + ((i * 61) % 420), 5); // snow
}

function wheel(p: Pen): void {
  p.circle(256, 380, 185); p.circle(256, 380, 125);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU;
    p.line(256 + Math.cos(a) * 40, 380 + Math.sin(a) * 40, 256 + Math.cos(a) * 180, 380 + Math.sin(a) * 180);
  }
  p.circle(256, 380, 30);
  for (let i = 0; i < 12; i++) { // the letters become ticks
    const a = (i / 12) * TAU;
    p.line(256 + Math.cos(a) * 125, 380 + Math.sin(a) * 125, 256 + Math.cos(a) * 140, 380 + Math.sin(a) * 140);
  }
  p.poly([[226, 195], [286, 195], [270, 150], [242, 150]], true); // the sphinx above
  p.curve(226, 170, 200, 150, 196, 120); p.curve(286, 170, 312, 150, 316, 120); // its wings
  p.curve(80, 420, 110, 480, 80, 560); p.dot(80, 570, 10); // the descending serpent
  p.head(440, 520, 18); p.line(440, 540, 420, 600); // the rising figure
  for (const [x, y] of [[86, 130], [426, 130], [86, 630], [426, 630]]) { // the four creatures
    p.circle(x, y, 24); p.curve(x - 24, y, x - 52, y - 30, x - 44, y - 56);
  }
}

function justice(p: Pen): void {
  p.rect(80, 120, 54, 520); p.rect(378, 120, 54, 520); // pillars
  p.curve(134, 160, 256, 220, 378, 160); p.curve(134, 200, 256, 260, 378, 200); // the veil
  p.head(256, 280, 28);
  p.poly([[256, 315], [186, 620], [326, 620]], true);
  p.line(340, 200, 340, 440); p.line(322, 230, 358, 230); p.dot(340, 452, 8); // the sword
  p.line(172, 330, 172, 500); p.line(112, 350, 232, 350); // the scales
  for (const x of [112, 232]) {
    p.line(x, 350, x, 420);
    p.arc(x, 430, 26, 0, Math.PI);
  }
}

function hangedMan(p: Pen): void {
  p.line(140, 110, 372, 110); p.line(140, 110, 140, 200); p.line(372, 110, 372, 200); // the gibbet
  p.line(256, 110, 256, 210); // the rope
  p.line(256, 210, 256, 330); // the bound leg
  p.line(256, 330, 320, 300); p.line(320, 300, 300, 380); // the bent leg
  p.line(256, 330, 256, 470); // the body
  p.line(256, 380, 210, 460); p.line(256, 380, 302, 460); // arms behind
  p.head(256, 520, 30);
  p.circle(256, 520, 52); // the halo
}

function death(p: Pen): void {
  p.line(40, 300, 472, 300); // horizon
  p.arc(256, 300, 60, Math.PI, TAU); // the sun between the towers
  p.rect(120, 220, 44, 80); p.rect(348, 220, 44, 80); // the towers
  p.poly([[170, 470], [330, 470], [320, 540], [180, 540]], true); // the horse's body
  for (const x of [200, 250, 290, 320]) p.line(x, 540, x - 10, 640);
  p.line(330, 480, 380, 400); p.poly([[372, 380], [408, 400], [396, 428], [366, 414]], true); // neck + head
  p.circle(300, 380, 26); p.line(300, 406, 300, 470); // the skeleton rider
  p.line(250, 220, 250, 470); // the banner pole
  const c = p.c; // black banner
  c.save(); c.shadowBlur = 0; c.fillStyle = "rgba(238,201,126,0.25)";
  c.fillRect(250, 250, 120, 90); c.restore();
  p.rect(250, 250, 120, 90);
  p.circle(310, 295, 18); // the mystic rose
  for (let i = 0; i < 5; i++) { const a = (i / 5) * TAU; p.dot(310 + Math.cos(a) * 18, 295 + Math.sin(a) * 18, 5); }
  p.poly([[120, 640], [150, 620], [165, 640], [180, 620], [195, 640]], false); // a fallen crown
  p.arc(380, 660, 30, Math.PI, TAU); // a fallen figure
}

function temperance(p: Pen): void {
  p.head(256, 170, 28);
  p.curve(170, 260, 120, 180, 150, 110); p.curve(342, 260, 392, 180, 362, 110); // wings
  p.curve(226, 220, 200, 400, 220, 600); p.curve(286, 220, 312, 400, 292, 600); // robe
  p.poly([[310, 280], [350, 280], [340, 330], [320, 330]], true); // upper cup
  p.poly([[180, 470], [220, 470], [210, 520], [190, 520]], true); // lower cup
  p.curve(330, 330, 300, 400, 205, 470); p.curve(340, 330, 320, 400, 215, 470); // the stream
  p.line(300, 300, 330, 290); p.line(212, 430, 200, 470); // arms
  p.waves(60, 640, 392, 2); // the water
  p.arc(256, 640, 70, Math.PI, TAU); // the rising sun
  for (let i = 0; i < 7; i++) { const a = Math.PI + (i / 6) * Math.PI; p.line(256 + Math.cos(a) * 82, 640 + Math.sin(a) * 82, 256 + Math.cos(a) * 104, 640 + Math.sin(a) * 104); }
  for (const x of [90, 422]) { p.line(x, 640, x, 560); p.dot(x, 548, 10); } // irises
}

function stairStar(p: Pen): void {
  for (let i = 0; i < 6; i++) {
    const y = 300 + i * 66;
    p.poly([[120, y], [330 - i * 20, y], [330 - i * 20, y + 32], [120, y + 32]], true);
  }
  p.star4(300, 180, 44);
  for (let i = 0; i < 10; i++) p.dot(90 + ((i * 113) % 340), 420 + ((i * 71) % 240), 5);
}

function devil(p: Pen): void {
  p.rect(176, 540, 160, 90); // the pedestal
  p.head(256, 300, 34);
  p.curve(226, 280, 200, 230, 196, 200); p.curve(286, 280, 312, 230, 316, 200); // horns
  p.poly([[180, 380], [120, 300], [150, 420]], true); p.poly([[332, 380], [392, 300], [362, 420]], true); // bat wings
  p.line(256, 334, 256, 470); p.line(226, 380, 286, 380);
  p.line(256, 470, 220, 540); p.line(256, 470, 292, 540); // goat legs
  const pts: number[][] = []; // inverted pentagram
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * TAU + Math.PI / 2;
    const rr = i % 2 === 0 ? 16 : 7;
    pts.push([256 + Math.cos(a) * rr, 292 + Math.sin(a) * rr]);
  }
  p.poly(pts, true);
  p.line(300, 380, 340, 330); p.flame(346, 300, 18); // the torch
  for (const x of [120, 392]) { // the chained ones
    p.head(x, 580, 18); p.line(x, 600, x, 660);
    p.line(x + 14, 620, 200, 580); p.line(x - 14, 620, 312, 580);
  }
}

function tower(p: Pen): void {
  p.poly([[196, 640], [196, 260], [316, 260], [316, 640]], true); // the tower
  for (let y = 300; y < 620; y += 56) p.line(196, y, 316, y);
  p.rect(226, 340, 30, 44); p.rect(262, 460, 30, 44); // windows
  p.flame(241, 330, 16); p.flame(277, 450, 16);
  p.poly([[400, 60], [330, 170], [360, 170], [280, 260]], false); // lightning
  p.poly([[300, 190], [330, 170], [360, 196], [330, 210]], true); // the falling crown
  p.head(150, 430, 20); // the falling figures
  p.line(150, 450, 120, 520); p.line(150, 450, 180, 520); p.line(150, 450, 150, 540);
  p.head(380, 540, 20);
  p.line(380, 560, 350, 620); p.line(380, 560, 410, 620); p.line(380, 560, 380, 650);
  for (let i = 0; i < 12; i++) p.dot(140 + ((i * 89) % 240), 200 + ((i * 53) % 380), 6); // yods
}

function star(p: Pen): void {
  p.star8(256, 130, 56); // the great star
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * TAU + 0.4;
    p.star4(256 + Math.cos(a) * 130, 150 + Math.sin(a) * 70, 20);
  }
  p.head(300, 400, 26); // the kneeling woman
  p.curve(280, 430, 240, 480, 220, 560); p.line(220, 560, 300, 560); p.line(300, 560, 320, 480); // kneeling body
  p.poly([[170, 420], [210, 420], [200, 470], [180, 470]], true); // jug to the pool
  p.curve(190, 470, 170, 520, 160, 560);
  p.curve(150, 590, 200, 570, 250, 590); p.curve(250, 590, 200, 610, 150, 590); // the pool
  p.poly([[360, 440], [400, 440], [390, 490], [370, 490]], true); // jug to the land
  p.curve(385, 490, 380, 540, 375, 590); p.curve(375, 490, 370, 540, 365, 590);
  p.line(440, 640, 440, 480); p.curve(440, 520, 410, 500, 400, 480); // the tree
  p.dot(400, 476, 10); p.line(408, 476, 420, 472); // the ibis
}

function moon(p: Pen): void {
  p.circle(256, 190, 95); // the moon
  p.dot(230, 170, 7); p.line(250, 190, 238, 215); p.curve(240, 235, 260, 240, 270, 232); // the face
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * TAU;
    p.line(256 + Math.cos(a) * 108, 190 + Math.sin(a) * 108, 256 + Math.cos(a) * 128, 190 + Math.sin(a) * 128);
  }
  for (let i = 0; i < 8; i++) p.dot(180 + i * 22, 330 + (i % 3) * 14, 5); // falling drops
  p.rect(110, 430, 52, 190); p.rect(350, 430, 52, 190); // the towers
  for (const x of [110, 350]) for (let i = 0; i < 3; i++) p.rect(x + i * 18, 410, 14, 20);
  p.curve(226, 640, 240, 520, 256, 430); p.curve(286, 640, 272, 520, 256, 430); // the path
  for (const [x, howl] of [[180, true], [332, false]] as [number, boolean][]) { // dog and wolf
    p.line(x - 30, 600, x + 30, 600);
    for (const lx of [-20, -6, 8, 22]) p.line(x + lx, 600, x + lx, 640);
    p.head(x + (howl ? 34 : 30), howl ? 560 : 584, 16);
    if (howl) p.line(x + 30, 584, x + 34, 566);
  }
  p.curve(200, 680, 256, 660, 312, 680); p.curve(312, 680, 256, 700, 200, 680); // the pool
  p.circle(256, 680, 16); p.line(240, 672, 220, 660); p.line(272, 672, 292, 660); // the crayfish
  for (let i = 0; i < 4; i++) p.line(244 + i * 8, 692, 240 + i * 8, 706);
}

function sun(p: Pen): void {
  p.circle(256, 170, 95); // the sun
  p.dot(228, 158, 8); p.dot(284, 158, 8); p.curve(230, 196, 256, 214, 282, 196); // the face
  for (let i = 0; i < 20; i++) {
    const a = (i / 20) * TAU;
    const x1 = 256 + Math.cos(a) * 108, y1 = 170 + Math.sin(a) * 108;
    if (i % 2 === 0) p.line(x1, y1, 256 + Math.cos(a) * 140, 170 + Math.sin(a) * 140);
    else p.curve(x1, y1, 256 + Math.cos(a) * 128, 170 + Math.sin(a) * 128, 256 + Math.cos(a + 0.08) * 142, 170 + Math.sin(a + 0.08) * 142);
  }
  p.head(256, 430, 26); // the child
  p.line(256, 460, 256, 560); p.line(256, 490, 180, 460); p.line(256, 490, 332, 460); // open arms
  p.line(256, 560, 230, 640); p.line(256, 560, 282, 640);
  p.line(170, 600, 342, 600); // the horse's back
  for (const x of [190, 240, 290, 330]) p.line(x, 600, x, 660);
  p.line(342, 600, 380, 520); p.poly([[372, 500], [404, 516], [394, 544], [366, 532]], true);
  for (const x of [90, 150, 362, 422]) { // sunflowers
    p.line(x, 680, x, 600); p.circle(x, 586, 18); p.dot(x, 586, 7);
  }
  p.rect(60, 330, 392, 60); // the wall
  for (let x = 60; x < 452; x += 40) p.line(x, 330, x, 390);
}

function judgement(p: Pen): void {
  p.arc(120, 130, 60, Math.PI, TAU); p.arc(256, 110, 70, Math.PI, TAU); p.arc(392, 130, 60, Math.PI, TAU); // clouds
  p.head(256, 200, 26); // the angel
  p.curve(180, 260, 130, 200, 140, 130); p.curve(332, 260, 382, 200, 372, 130); // wings
  p.line(280, 230, 360, 190); p.poly([[360, 176], [400, 190], [360, 204]], true); // the trumpet
  p.line(340, 196, 340, 280); p.rect(318, 280, 44, 60); p.line(330, 290, 350, 330); p.line(350, 290, 330, 330); // banner
  for (const x of [140, 256, 372]) { // the rising
    p.rect(x - 44, 560, 88, 100); // coffins
    p.head(x, 500, 24);
    p.line(x, 528, x - 34, 460); p.line(x, 528, x + 34, 460); // raised arms
    p.line(x, 528, x, 560);
  }
}

function world(p: Pen): void {
  p.arc(256, 400, 190, Math.PI * 0.15, Math.PI * 1.85); // the wreath
  p.arc(256, 400, 190, Math.PI * 1.15, Math.PI * 2.85);
  for (let i = 0; i < 24; i++) { // laurel leaves
    const a = Math.PI * 0.15 + (i / 23) * Math.PI * 1.7;
    const x = 256 + Math.cos(a) * 190, y = 400 + Math.sin(a) * 190;
    p.line(x, y, x + Math.cos(a + 0.5) * 26, y + Math.sin(a + 0.5) * 26);
  }
  p.head(256, 300, 26); // the dancer
  p.curve(256, 330, 230, 420, 250, 510); p.curve(256, 330, 300, 400, 340, 360);
  p.line(250, 510, 210, 590); p.line(250, 510, 320, 560); // crossed legs
  p.line(230, 360, 160, 320); p.line(290, 350, 360, 310); // arms
  p.line(150, 300, 170, 340); p.line(350, 290, 370, 330); // the wands
  for (const [x, y] of [[80, 90], [432, 90], [80, 710], [432, 710]]) { // the four in the corners
    p.circle(x, y, 26); p.curve(x - 26, y, x - 54, y - 26, x - 48, y - 54);
  }
}

function fool(p: Pen): void {
  p.poly([[40, 700], [40, 420], [300, 420], [300, 700]], false); // the cliff
  for (let i = 0; i < 5; i++) p.line(60 + i * 48, 700, 80 + i * 48, 460);
  p.head(330, 240, 26); // the youth
  p.line(330, 270, 322, 400); p.line(322, 400, 380, 430); // stepping off
  p.line(322, 400, 300, 520); p.line(300, 520, 296, 600);
  p.line(300, 300, 220, 250); p.line(220, 250, 150, 280); // staff over shoulder
  p.circle(140, 300, 24); p.line(140, 276, 150, 280); // the bundle
  p.line(352, 300, 400, 340); p.line(400, 340, 400, 310); p.dot(400, 300, 8); // the white rose
  p.line(240, 560, 290, 540); // the dog
  for (const x of [250, 270]) p.line(x, 540, x - 8, 580);
  p.head(296, 528, 14);
  p.circle(420, 120, 44); // the sun
  p.poly([[60, 420], [130, 320], [200, 420]], true); // mountains
}

function landing(p: Pen): void {
  p.line(140, 420, 140, 480); p.circle(140, 380, 36); // the lamp
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU;
    p.line(140 + Math.cos(a) * 48, 380 + Math.sin(a) * 48, 140 + Math.cos(a) * 64, 380 + Math.sin(a) * 64);
  }
  p.curve(120, 480, 140, 500, 160, 480); p.line(120, 500, 160, 500);
  p.curve(226, 480, 256, 500, 286, 480); p.line(226, 500, 286, 500); // the dish
  p.flame(256, 430, 40); // the fire
  p.star4(372, 400, 52); // the star
  p.waves(60, 600, 392, 3);
  p.arc(256, 560, 150, Math.PI * 1.2, Math.PI * 1.8); // radiance
}

const CARDS: ((p: Pen) => void)[] = [
  opening, magician, highPriestess, empress, emperor, hierophant, lovers, chariot,
  stairFlame, strength, hermit, wheel, justice, hangedMan, death, temperance,
  stairStar, devil, tower, star, moon, sun, judgement, world,
  fool, landing,
];

/** Draw station i (0–25) and return the canvas. */
export function drawCard(i: number): HTMLCanvasElement {
  const cv = document.createElement("canvas");
  cv.width = CARD_W;
  cv.height = CARD_H;
  const ctx = cv.getContext("2d");
  if (ctx) CARDS[i % CARDS.length](new Pen(ctx));
  return cv;
}
