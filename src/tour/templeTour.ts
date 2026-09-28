/* The temple tour: a ~10.6-minute guided autopilot through the archetypal stations.
   The wanderer follows a small speaking orb along a spiral path while each of the
   26 stations ignites as a holographic tarot monument, in time with the narration.
   The player can look around freely; movement is driven by the audio clock.
   At the end (or when the orb is tapped) the player is released to free explore. */
import * as THREE from "three/webgpu";
import { colliders, heightAt } from "../world/terrain";
import { T, spriteCloud, type SpriteCloud } from "../gpu/tsl";
import { drawCard, CARD_COUNT } from "./tarot";
import type { Narration, SceneCue } from "../core/narration";
import type { Controller } from "../player/controller";
import catalogue from "../../content/narration.json";

export interface TourHooks {
  whisper: (text: string, ms?: number) => void;
}

/** The three open answers at the end of the road. None of them is wrong. */
export type ChoiceKey = "love" | "rest" | "undecided";

type Phase = "tour" | "choice" | "releasing" | "done";

const TRACK = (catalogue.tracks as { id: string; scenes?: SceneCue[]; duration?: number }[]).find(
  (t) => t.id === "TEMPLE",
);
const SCENES: SceneCue[] = TRACK?.scenes ?? [];
const DURATION: number = TRACK?.duration ?? 636.08;

/* ------------------------------------------------------------ site finding */

/** True when a disc of radius rad around (x, z) is entirely open water. */
function discOverWater(x: number, z: number, rad: number): boolean {
  for (let i = 0; i < 20; i++) {
    const a = (i / 20) * Math.PI * 2;
    for (const rr of [0, rad * 0.55, rad]) {
      if (heightAt(x + Math.cos(a) * rr, z + Math.sin(a) * rr) > -2) return false;
    }
  }
  return true;
}

function findSite(): { x: number; z: number } {
  for (const r of [1300, 1600, 1900, 2200, 2500]) {
    for (let k = 0; k < 20; k++) {
      const a = (k / 20) * Math.PI * 2 + 0.13;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      if (discOverWater(x, z, 78)) return { x, z };
    }
  }
  return { x: 1600, z: 400 };
}

/** World-space center of the temple, on open water. */
export const TEMPLE_SITE = findSite();

/* ------------------------------------------------------------ layout */

interface StationSpot {
  x: number;
  z: number;
  y: number;
  yaw: number;
}

const A0 = 0.6;
const STEP_O = ((Math.PI * 5) / 3 / 7); // 300° over 7 gaps, outer ring
const STEP_M = 0.62;
const STEP_I = 0.55;
const AA = A0 + 7 * STEP_O + 0.3; // stair A angle
const A1 = AA + 0.3;
const AB = A1 + 6 * STEP_M + 0.3; // stair B angle
const A2 = AB + 0.3;
const AE = A2 + 7 * STEP_I + 0.3;

function ring(a: number, r: number, y: number): THREE.Vector3 {
  return new THREE.Vector3(
    TEMPLE_SITE.x + Math.cos(a) * r,
    y,
    TEMPLE_SITE.z + Math.sin(a) * r,
  );
}

function buildSpots(): StationSpot[] {
  const spots: StationSpot[] = [];
  let prev = ring(A0 - 0.35, 66, 6);
  for (let i = 0; i < 8; i++) {
    const s = ring(A0 + i * STEP_O, 49, 6);
    spots.push({ x: s.x, z: s.z, y: 6, yaw: Math.atan2(prev.x - s.x, prev.z - s.z) });
    prev = s;
  }
  // Transition station on stair A (Mind -> Body).
  const trA = ring(AA, 50, 4.75);
  spots.push({ x: trA.x, z: trA.z, y: 4.75, yaw: Math.atan2(prev.x - trA.x, prev.z - trA.z) });
  prev = ring(AA, 42, 3.5); // arriving down stair A
  for (let j = 0; j < 7; j++) {
    const s = ring(A1 + j * STEP_M, 30, 3.5);
    spots.push({ x: s.x, z: s.z, y: 3.5, yaw: Math.atan2(prev.x - s.x, prev.z - s.z) });
    prev = s;
  }
  // Transition station on stair B (Body -> Spirit).
  const trB = ring(AB, 31, 2.25);
  spots.push({ x: trB.x, z: trB.z, y: 2.25, yaw: Math.atan2(prev.x - trB.x, prev.z - trB.z) });
  prev = ring(AB, 24, 1); // arriving down stair B
  for (let k = 0; k < 8; k++) {
    const s = ring(A2 + k * STEP_I, 15, 1);
    spots.push({ x: s.x, z: s.z, y: 1, yaw: Math.atan2(prev.x - s.x, prev.z - s.z) });
    prev = s;
  }
  const fin = ring(AE, 9, 1);
  spots.push({
    x: TEMPLE_SITE.x,
    z: TEMPLE_SITE.z,
    y: 1.8,
    yaw: Math.atan2(fin.x - TEMPLE_SITE.x, fin.z - TEMPLE_SITE.z),
  });
  return spots;
}

function buildWaypoints(): THREE.Vector3[] {
  const pts: THREE.Vector3[] = [ring(A0 - 0.35, 66, 6)]; // the gate
  for (let i = 0; i < 8; i++) pts.push(ring(A0 + i * STEP_O, 49, 6));
  pts.push(ring(AA, 58, 6), ring(AA, 50, 4.75), ring(AA, 42, 3.5)); // stair A
  for (let j = 0; j < 7; j++) pts.push(ring(A1 + j * STEP_M, 30, 3.5));
  pts.push(ring(AB, 38, 3.5), ring(AB, 31, 2.25), ring(AB, 24, 1)); // stair B
  for (let k = 0; k < 8; k++) pts.push(ring(A2 + k * STEP_I, 15, 1));
  pts.push(ring(AE, 9, 1)); // final stop, facing the dais
  return pts;
}

const SPOTS = buildSpots();
const WAYPOINTS = buildWaypoints();
const CURVE = new THREE.CatmullRomCurve3(WAYPOINTS, false, "catmullrom", 0.1);

/** Where the tour begins (the gate), for the start map. */
export const TEMPLE_ENTRANCE = WAYPOINTS[0].clone();
/** Heading at the gate, for arrival. */
export const TEMPLE_HEADING = (() => {
  const t = CURVE.getTangentAt(0);
  return Math.atan2(-t.x, -t.z);
})();

export interface Platform {
  x: number;
  z: number;
  r: number;
  top: number;
}
/** Terraces the wanderer can stand on after the tour (wired into the controller). */
export const TEMPLE_PLATFORMS: Platform[] = [
  { x: TEMPLE_SITE.x, z: TEMPLE_SITE.z, r: 60, top: 6 },
  { x: TEMPLE_SITE.x, z: TEMPLE_SITE.z, r: 40, top: 3.5 },
  { x: TEMPLE_SITE.x, z: TEMPLE_SITE.z, r: 22, top: 1 },
  { x: TEMPLE_SITE.x, z: TEMPLE_SITE.z, r: 7, top: 1.8 },
];
/** Solid monument bases (wired into the world's colliders). */
export const TEMPLE_COLLIDERS: { x: number; z: number; r: number; top: number }[] = SPOTS.map((s) => ({
  x: s.x,
  z: s.z,
  r: 1.4,
  top: s.y + 4,
}));

/* ------------------------------------------------------------ tour */

const STONE = new THREE.MeshStandardMaterial({ color: "#26223a", roughness: 0.94, metalness: 0.04 });
const TRIM = new THREE.MeshStandardMaterial({
  color: "#caa25e",
  emissive: "#8a6420",
  emissiveIntensity: 0.55,
  metalness: 0.85,
  roughness: 0.35,
});

function glowTexture(): THREE.Texture {
  const cv = document.createElement("canvas");
  cv.width = cv.height = 128;
  const c = cv.getContext("2d")!;
  const g = c.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, "rgba(255,230,180,0.85)");
  g.addColorStop(0.4, "rgba(255,210,140,0.26)");
  g.addColorStop(1, "rgba(255,200,120,0)");
  c.fillStyle = g;
  c.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function wingWeights(si: number): [number, number, number] {
  if (si <= 7) return [1, 0, 0]; // Mind: lamp-gold
  if (si === 8) return [0.55, 0.45, 0]; // the stair between
  if (si <= 15) return [0, 1, 0]; // Body: fire-amber
  if (si === 16) return [0, 0.45, 0.55]; // the stair between
  if (si <= 24) return [0, 0, 1]; // Spirit: indigo starlight
  return [0.8, 0.7, 1]; // the landing: all three
}

interface Station {
  gain: number;
  faces: THREE.MeshBasicMaterial[];
  /** The spinning mote ring, as a WebGPU-safe instanced sprite cloud (one per station). */
  points: THREE.PointsNodeMaterial;
  spin: THREE.Sprite;
  /** Index into the shared station-glow cloud's per-instance gain attribute. */
  glowIdx: number;
}

export class TempleTour {
  active = false;
  onFinish: (() => void) | null = null;
  onChoice: (() => void) | null = null;

  private group = new THREE.Group();
  private stations: Station[] = [];
  private stationU: number[] = [];
  private curveLen = 1;
  private tGlobal = 0;
  /** Where the tour is: guiding, choosing, releasing, done (public for the debug handle). */
  phase: Phase = "tour";
  private mood: ChoiceKey | null = null;
  private choiceStartT = 0;
  private releaseAt = 0;
  private lastPos = new THREE.Vector3();
  private raycaster = new THREE.Raycaster();
  private glowTex = glowTexture();

  /** The speaking orb the wanderer follows (public for the debug handle and tests). */
  readonly orb = new THREE.Group();
  private orbHalo!: THREE.Sprite;
  private orbHaloMat!: THREE.PointsNodeMaterial;
  private orbLight!: THREE.PointLight;
  private orbHit!: THREE.Mesh;
  private wings: THREE.PointLight[] = [];
  private wingGain: [number, number, number] = [0, 0, 0];
  /** One glow sprite per station, drawn as a single WebGPU-safe instanced cloud. */
  private stationGlows!: SpriteCloud;

  // The choice finale: a living creation around the dais.
  private creation: THREE.Group | null = null;
  private creationBeams: { mesh: THREE.Mesh; spin: number }[] = [];
  private creationBirds: { off: number; r: number; h: number; speed: number; ph: number }[] = [];
  private creationHorses: { off: number; r: number; speed: number; ph: number }[] = [];
  private birdCloud!: SpriteCloud;
  private horseCloud!: SpriteCloud;
  private creationCrystals: { mesh: THREE.Mesh; ph: number }[] = [];
  private creationRings: { mesh: THREE.Mesh; ph: number }[] = [];

  constructor(
    scene: THREE.Scene,
    private narration: Narration,
    private player: Controller,
    private hooks: TourHooks,
  ) {
    this.build();
    scene.add(this.group);
    for (const c of TEMPLE_COLLIDERS) colliders.push(c);
  }

  /* ---------------- construction ---------------- */

  /** A stepped terrace ring (annulus): the temple descends toward its center dais. */
  private ringTerrace(rOuter: number, rInner: number, topY: number, skirt: number): void {
    const shape = new THREE.Shape();
    shape.absarc(0, 0, rOuter, 0, Math.PI * 2, false);
    const hole = new THREE.Path();
    hole.absarc(0, 0, rInner, 0, Math.PI * 2, true);
    shape.holes.push(hole);
    const depth = topY + skirt;
    const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 96 });
    g.rotateX(-Math.PI / 2); // the flat ring lands in XZ, extruded upward
    const m = new THREE.Mesh(g, STONE);
    m.position.set(TEMPLE_SITE.x, topY - depth, TEMPLE_SITE.z);
    this.group.add(m);
    const trim = new THREE.Mesh(new THREE.TorusGeometry(rOuter, 0.16, 8, 96), TRIM);
    trim.rotation.x = Math.PI / 2;
    trim.position.set(TEMPLE_SITE.x, topY + 0.05, TEMPLE_SITE.z);
    this.group.add(trim);
  }

  private discTerrace(r: number, topY: number, skirt: number): void {
    const depth = topY + skirt;
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r + 1.5, depth, 72), STONE);
    m.position.set(TEMPLE_SITE.x, topY - depth / 2, TEMPLE_SITE.z);
    this.group.add(m);
    const trim = new THREE.Mesh(new THREE.TorusGeometry(r, 0.16, 8, 96), TRIM);
    trim.rotation.x = Math.PI / 2;
    trim.position.set(TEMPLE_SITE.x, topY + 0.05, TEMPLE_SITE.z);
    this.group.add(trim);
  }

  private stair(angle: number, rOuter: number, yOuter: number, rInner: number, yInner: number): void {
    const rMid = (rOuter + rInner) / 2;
    const yMid = (yOuter + yInner) / 2;
    const len = Math.hypot(rOuter - rInner, yOuter - yInner);
    const tilt = -Math.atan2(yOuter - yInner, rOuter - rInner);
    const g = new THREE.Group();
    g.position.set(
      TEMPLE_SITE.x + Math.cos(angle) * rMid,
      yMid - 0.25,
      TEMPLE_SITE.z + Math.sin(angle) * rMid,
    );
    g.rotation.y = Math.PI / 2 - angle;
    const box = new THREE.Mesh(new THREE.BoxGeometry(6, 0.7, len + 2), STONE);
    box.rotation.x = tilt;
    g.add(box);
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, len + 2), TRIM);
    rail.rotation.x = tilt;
    rail.position.set(2.7, 0.9, 0);
    g.add(rail);
    const rail2 = rail.clone();
    rail2.position.x = -2.7;
    g.add(rail2);
    this.group.add(g);
  }

  private monument(i: number, spot: StationSpot): void {
    const g = new THREE.Group();
    g.position.set(spot.x, spot.y, spot.z);
    g.rotation.y = spot.yaw;

    const ped = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.5, 2.3), STONE);
    ped.position.y = 0.25;
    g.add(ped);
    const stele = new THREE.Mesh(new THREE.BoxGeometry(1.7, 3.4, 0.45), STONE);
    stele.position.y = 0.5 + 1.7;
    g.add(stele);

    const tex = new THREE.CanvasTexture(drawCard(i));
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    const faces: THREE.MeshBasicMaterial[] = [];
    for (const side of [1, -1]) {
      const fm = new THREE.MeshBasicMaterial({
        map: tex,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.FrontSide,
      });
      const face = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 3.1), fm);
      face.position.set(0, 0.5 + 1.65, side * 0.24);
      if (side < 0) face.rotation.y = Math.PI;
      g.add(face);
      faces.push(fm);
    }

    const glowIdx = this.stations.length;
    const N = 90;
    const pos = new Float32Array(N * 3);
    const col = new Float32Array(N * 3);
    const palette = [
      [1.0, 0.8, 0.5],
      [0.55, 0.9, 1.0],
      [1.0, 0.62, 0.85],
    ];
    for (let n = 0; n < N; n++) {
      pos[n * 3] = (Math.random() - 0.5) * 4;
      pos[n * 3 + 1] = Math.random() * 4.4;
      pos[n * 3 + 2] = (Math.random() - 0.5) * 4;
      const c = palette[(Math.random() * palette.length) | 0]!;
      col[n * 3] = c[0];
      col[n * 3 + 1] = c[1];
      col[n * 3 + 2] = c[2];
    }
    // WebGPU-safe: an instanced sprite cloud instead of THREE.Points. The per-station
    // glow lives in the shared stationGlows cloud (built in build()).
    const pmat = new THREE.PointsNodeMaterial({
      size: 0.11,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
    });
    pmat.sizeAttenuation = true;
    const cloud = spriteCloud(N, { position: 3, aCol: 3 }, pmat);
    (cloud.attrs.position.array as Float32Array).set(pos);
    (cloud.attrs.aCol.array as Float32Array).set(col);
    cloud.attrs.position.needsUpdate = true;
    cloud.attrs.aCol.needsUpdate = true;
    pmat.colorNode = T.vec4(cloud.nodes.aCol, T.float(1));
    pmat.opacityNode = T.materialOpacity.mul(
      T.smoothstep(T.float(0.5), T.float(0.2), T.length(T.pointUV.sub(0.5))),
    );
    g.add(cloud.sprite);

    this.group.add(g);
    this.stations.push({ gain: 0, faces, points: pmat, spin: cloud.sprite, glowIdx });
  }

  private build(): void {
    // A stepped descent toward the center: outer ring (Mind), middle ring (Body),
    // inner disc (Spirit), and the raised dais where the road ends.
    this.ringTerrace(60, 40, 6, 14);
    this.ringTerrace(40, 22, 3.5, 12);
    this.discTerrace(22, 1, 10);
    this.discTerrace(7, 1.8, 8);
    this.stair(AA, 58, 6, 42, 3.5);
    this.stair(AB, 38, 3.5, 24, 1);

    // One glow sprite per station, drawn as a single WebGPU-safe instanced cloud;
    // each station's brightness is driven through the per-instance aGain attribute.
    const glowMat = new THREE.PointsNodeMaterial({
      size: 5.5,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false,
    });
    glowMat.sizeAttenuation = true;
    this.stationGlows = spriteCloud(CARD_COUNT, { position: 3, aGain: 1 }, glowMat);
    {
      const gp = this.stationGlows.attrs.position.array as Float32Array;
      for (let i = 0; i < CARD_COUNT; i++) {
        const s = SPOTS[i]!;
        gp.set([s.x, s.y + 2.2, s.z], i * 3);
      }
      this.stationGlows.attrs.position.needsUpdate = true;
    }
    const gtex = T.texture(this.glowTex, T.pointUV);
    glowMat.colorNode = T.vec4(gtex.rgb, gtex.a.mul(this.stationGlows.nodes.aGain).mul(0.5));
    this.group.add(this.stationGlows.sprite);

    for (let i = 0; i < CARD_COUNT; i++) this.monument(i, SPOTS[i]!);

    // The guide orb.
    const core = new THREE.Mesh(
      new THREE.SphereGeometry(0.3, 20, 16),
      new THREE.MeshBasicMaterial({ color: "#fff3d6" }),
    );
    this.orb.add(core);
    this.orbHaloMat = new THREE.PointsNodeMaterial({
      size: 2.4,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false,
    });
    this.orbHaloMat.sizeAttenuation = true;
    const haloCloud = spriteCloud(1, { position: 3 }, this.orbHaloMat);
    const htex = T.texture(this.glowTex, T.pointUV);
    this.orbHaloMat.colorNode = T.vec4(htex.rgb, htex.a.mul(0.9));
    this.orbHalo = haloCloud.sprite;
    this.orb.add(this.orbHalo);
    this.orbLight = new THREE.PointLight(0xffe6b8, 14, 20, 1.8);
    this.orb.add(this.orbLight);
    this.orbHit = new THREE.Mesh(
      new THREE.SphereGeometry(1.4, 8, 6),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }),
    );
    this.orb.add(this.orbHit);
    this.orb.visible = false;
    this.group.add(this.orb);

    // Wing lights: Mind gold, Body amber, Spirit indigo.
    const wingDefs: [number, number][] = [
      [0xffd9a0, 15],
      [0xff9a5a, 12],
      [0x5a7bff, 10],
    ];
    for (const [color, y] of wingDefs) {
      const l = new THREE.PointLight(color, 0, 110, 1.8);
      l.position.set(TEMPLE_SITE.x, y, TEMPLE_SITE.z);
      this.group.add(l);
      this.wings.push(l);
    }

    // Arc-length table: which curve-u each station sits at.
    this.curveLen = CURVE.getLength();
    const samples = CURVE.getSpacedPoints(1400);
    for (let i = 0; i < CARD_COUNT; i++) {
      const s = SPOTS[i]!;
      let best = 0;
      let bd = Infinity;
      for (let n = 0; n < samples.length; n++) {
        const p = samples[n]!;
        const d = (p.x - s.x) * (p.x - s.x) + (p.z - s.z) * (p.z - s.z);
        if (d < bd) {
          bd = d;
          best = n;
        }
      }
      this.stationU.push(best / (samples.length - 1));
    }
  }

  /* ---------------- the choice finale ---------------- */

  private birdTexture(): THREE.Texture {
    const cv = document.createElement("canvas");
    cv.width = cv.height = 64;
    const c = cv.getContext("2d")!;
    c.strokeStyle = "#ffe9c0";
    c.lineWidth = 5;
    c.lineCap = "round";
    c.shadowColor = "rgba(255,233,192,0.8)";
    c.shadowBlur = 6;
    c.beginPath();
    c.moveTo(8, 40);
    c.quadraticCurveTo(22, 22, 32, 38);
    c.quadraticCurveTo(42, 22, 56, 40);
    c.stroke();
    const t = new THREE.CanvasTexture(cv);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  private horseTexture(): THREE.Texture {
    // A galloping horse, drawn in light — stylized line art, not a copy of anything.
    const cv = document.createElement("canvas");
    cv.width = cv.height = 256;
    const c = cv.getContext("2d")!;
    c.strokeStyle = "#ffd9a0";
    c.lineWidth = 7;
    c.lineCap = "round";
    c.lineJoin = "round";
    c.shadowColor = "rgba(255,217,160,0.8)";
    c.shadowBlur = 8;
    const path = (pts: number[][]) => {
      c.beginPath();
      pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
      c.stroke();
    };
    const curve = (x1: number, y1: number, cx: number, cy: number, x2: number, y2: number) => {
      c.beginPath();
      c.moveTo(x1, y1);
      c.quadraticCurveTo(cx, cy, x2, y2);
      c.stroke();
    };
    curve(60, 140, 120, 110, 190, 135); // back
    curve(180, 135, 200, 100, 215, 70); // neck
    path([[215, 70], [238, 82], [222, 96]]); // head
    curve(195, 95, 185, 115, 190, 140); // mane
    curve(90, 145, 60, 170, 40, 200); // foreleg reaching
    curve(110, 148, 95, 180, 85, 215); // foreleg folded
    curve(160, 145, 185, 165, 210, 185); // hind leg extended
    curve(175, 140, 205, 150, 230, 160); // hind leg driving
    curve(60, 140, 35, 150, 25, 180); // tail
    const t = new THREE.CanvasTexture(cv);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  private beamTexture(): THREE.Texture {
    const cv = document.createElement("canvas");
    cv.width = 64;
    cv.height = 256;
    const c = cv.getContext("2d")!;
    const g = c.createLinearGradient(0, 0, 64, 0);
    g.addColorStop(0, "rgba(255,225,170,0)");
    g.addColorStop(0.5, "rgba(255,232,180,0.9)");
    g.addColorStop(1, "rgba(255,225,170,0)");
    c.fillStyle = g;
    c.fillRect(0, 0, 64, 256);
    const v = c.createLinearGradient(0, 0, 0, 256);
    v.addColorStop(0, "rgba(0,0,0,1)");
    v.addColorStop(0.35, "rgba(0,0,0,0)");
    v.addColorStop(0.8, "rgba(0,0,0,0)");
    v.addColorStop(1, "rgba(0,0,0,1)");
    c.globalCompositeOperation = "destination-out";
    c.fillStyle = v;
    c.fillRect(0, 0, 64, 256);
    const t = new THREE.CanvasTexture(cv);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  private buildCreation(): void {
    const g = new THREE.Group();
    const cx = TEMPLE_SITE.x;
    const cz = TEMPLE_SITE.z;
    const beamTex = this.beamTexture();
    const beamMat = (opacity: number) =>
      new THREE.MeshBasicMaterial({
        map: beamTex,
        transparent: true,
        opacity,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
    // The central beam: light from the One Infinite Creator.
    const central = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 64), beamMat(0.8));
    central.position.set(cx, 1.8 + 30, cz);
    g.add(central);
    this.creationBeams.push({ mesh: central, spin: 0 });
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 36), beamMat(0.42));
      m.position.set(cx + Math.cos(a) * 11, 1.8 + 17, cz + Math.sin(a) * 11);
      m.rotation.y = a;
      g.add(m);
      this.creationBeams.push({ mesh: m, spin: 0.05 + Math.random() * 0.06 });
    }
    // Birds.
    const birdTex = this.birdTexture();
    const birdMat = new THREE.PointsNodeMaterial({
      size: 1.35,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false,
    });
    birdMat.sizeAttenuation = true;
    this.birdCloud = spriteCloud(30, { position: 3 }, birdMat);
    const btex = T.texture(birdTex, T.pointUV);
    birdMat.colorNode = T.vec4(btex.rgb, btex.a.mul(0.85));
    g.add(this.birdCloud.sprite);
    for (let f = 0; f < 3; f++) {
      for (let i = 0; i < 10; i++) {
        this.creationBirds.push({
          off: (i / 10) * Math.PI * 2,
          r: 15 + f * 4 + Math.random() * 3,
          h: 9 + f * 3.5 + Math.random() * 3,
          speed: 0.13 + Math.random() * 0.08,
          ph: Math.random() * 6.28,
        });
      }
    }
    // Horses, circling at a distance.
    const horseTex = this.horseTexture();
    const horseMat = new THREE.PointsNodeMaterial({
      size: 7.5,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false,
    });
    horseMat.sizeAttenuation = true;
    this.horseCloud = spriteCloud(4, { position: 3 }, horseMat);
    const htex2 = T.texture(horseTex, T.pointUV);
    horseMat.colorNode = T.vec4(htex2.rgb, htex2.a.mul(0.7));
    g.add(this.horseCloud.sprite);
    for (let i = 0; i < 4; i++) {
      this.creationHorses.push({
        off: (i / 4) * Math.PI * 2,
        r: 27 + (i % 2) * 6,
        speed: 0.05 + (i % 2) * 0.02,
        ph: Math.random() * 6.28,
      });
    }
    // Crystals rising and dissolving.
    for (let i = 0; i < 14; i++) {
      const m = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.42),
        new THREE.MeshBasicMaterial({
          color: "#ffe2a8",
          transparent: true,
          opacity: 0,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      );
      const a = Math.random() * Math.PI * 2;
      const r = 4 + Math.random() * 8;
      m.position.set(cx + Math.cos(a) * r, 2, cz + Math.sin(a) * r);
      g.add(m);
      this.creationCrystals.push({ mesh: m, ph: Math.random() });
    }
    // Rings expanding from the dais.
    for (let i = 0; i < 3; i++) {
      const m = new THREE.Mesh(
        new THREE.RingGeometry(2.6, 3.0, 64),
        new THREE.MeshBasicMaterial({
          color: "#ffdf9e",
          transparent: true,
          opacity: 0,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          side: THREE.DoubleSide,
        }),
      );
      m.rotation.x = -Math.PI / 2;
      m.position.set(cx, 2.1, cz);
      g.add(m);
      this.creationRings.push({ mesh: m, ph: i / 3 });
    }
    this.creation = g;
    this.group.add(g);
  }

  private animateCreation(dt: number): void {
    const cx = TEMPLE_SITE.x;
    const cz = TEMPLE_SITE.z;
    const t = this.tGlobal;
    const energy = this.mood === "rest" ? 0.35 : 1;
    for (const b of this.creationBeams) {
      b.mesh.rotation.y += dt * b.spin * energy;
      (b.mesh.material as THREE.MeshBasicMaterial).opacity = 0.38 + Math.sin(t * 1.3) * 0.12;
    }
    {
      const bp = this.birdCloud.attrs.position.array as Float32Array;
      for (let i = 0; i < this.creationBirds.length; i++) {
        const b = this.creationBirds[i]!;
        const a = b.off + t * b.speed * energy;
        bp[i * 3] = cx + Math.cos(a) * b.r;
        bp[i * 3 + 1] = b.h + Math.sin(t * 0.9 + b.ph) * 1.4;
        bp[i * 3 + 2] = cz + Math.sin(a) * b.r;
      }
      this.birdCloud.attrs.position.needsUpdate = true;
    }
    {
      const hp = this.horseCloud.attrs.position.array as Float32Array;
      for (let i = 0; i < this.creationHorses.length; i++) {
        const h = this.creationHorses[i]!;
        const a = h.off + t * h.speed * energy;
        hp[i * 3] = cx + Math.cos(a) * h.r;
        hp[i * 3 + 1] = 4.5 + Math.sin(t * 1.1 + h.ph) * 0.8;
        hp[i * 3 + 2] = cz + Math.sin(a) * h.r;
      }
      this.horseCloud.attrs.position.needsUpdate = true;
    }
    for (const cr of this.creationCrystals) {
      const cycle = (t * 0.07 * energy + cr.ph) % 1;
      cr.mesh.position.y = 2 + cycle * 13;
      cr.mesh.rotation.y += dt * 0.8;
      (cr.mesh.material as THREE.MeshBasicMaterial).opacity = Math.sin(cycle * Math.PI) * 0.8;
    }
    for (const r of this.creationRings) {
      const cycle = (t * 0.12 * energy + r.ph) % 1;
      const s = 1 + cycle * 6;
      r.mesh.scale.set(s, s, 1);
      (r.mesh.material as THREE.MeshBasicMaterial).opacity = (1 - cycle) * 0.5;
    }
  }

  private clearCreation(): void {
    if (this.creation) this.group.remove(this.creation);
    this.creation = null;
    this.creationBeams = [];
    this.creationBirds = [];
    this.creationHorses = [];
    this.creationCrystals = [];
    this.creationRings = [];
  }

  /* ---------------- running ---------------- */

  begin(): void {
    if (this.active || SCENES.length === 0) return;
    this.active = true;
    this.phase = "tour";
    this.mood = null;
    this.clearCreation();
    for (const st of this.stations) st.gain = 0;
    this.wingGain = [0, 0, 0];
    this.tGlobal = 0;
    const p0 = CURVE.getPointAt(0);
    this.player.pos.copy(p0);
    this.player.vel.set(0, 0, 0);
    this.player.target = null;
    this.player.flying = false;
    this.player.swimming = false;
    this.player.gliding = false;
    this.player.grounded = true;
    const tan = CURVE.getTangentAt(0);
    this.player.heading = Math.atan2(-tan.x, -tan.z);
    this.player.pose = "idle";
    this.player.speed = 0;
    this.lastPos.copy(p0);
    this.orb.visible = true;
    this.narration.play("TEMPLE");
    this.hooks.whisper("Follow the light. Look wherever you like — tap the orb to walk on your own.", 7000);
  }

  update(dt: number, reduced: boolean): void {
    if (!this.active) return;
    this.tGlobal += dt;
    if (this.phase !== "tour") {
      this.updateChoice(dt);
      return;
    }
    const t = this.narration.time();
    const talking = this.narration.current === "TEMPLE" && t > 0;

    let si = 0;
    for (let i = 0; i < SCENES.length; i++) if (t >= SCENES[i]!.t) si = i;
    const start = SCENES[si]?.t ?? 0;
    const end = SCENES[si + 1]?.t ?? DURATION;
    const seg = THREE.MathUtils.clamp((t - start) / Math.max(0.001, end - start), 0, 1);
    const e = seg * seg * (3 - 2 * seg); // linger at the station, glide between
    const u0 = this.stationU[si] ?? 0;
    const u1 = this.stationU[Math.min(si + 1, CARD_COUNT - 1)] ?? 1;
    const u = THREE.MathUtils.clamp(THREE.MathUtils.lerp(u0, u1, talking ? e : 0), 0, 1);

    const pos = CURVE.getPointAt(u);
    const moved = pos.distanceTo(this.lastPos);
    this.player.speed = dt > 0 ? moved / dt : 0;
    this.player.pos.copy(pos);
    this.player.pose = this.player.speed > 0.4 ? "glide" : "idle";
    const tan = CURVE.getTangentAt(u);
    if (tan.lengthSq() > 1e-6) {
      const want = Math.atan2(-tan.x, -tan.z);
      let dh = want - this.player.heading;
      dh = Math.atan2(Math.sin(dh), Math.cos(dh));
      this.player.heading += dh * Math.min(1, dt * 3);
    }
    this.lastPos.copy(pos);

    // The orb floats ahead, pulsing while it speaks.
    const uo = Math.min(u + 9 / this.curveLen, 1);
    const op = CURVE.getPointAt(uo);
    this.orb.position.set(op.x, op.y + 2.3 + Math.sin(this.tGlobal * 1.8) * 0.28, op.z);
    const pulse = talking ? 1 + Math.sin(this.tGlobal * 7) * 0.12 : 1;
    this.orbHaloMat.size = 2.4 * pulse;
    this.orbLight.intensity = talking ? 14 + Math.sin(this.tGlobal * 9) * 4 : 10;

    // Stations ignite as the story reaches them and stay lit.
    const gainArr = this.stationGlows.attrs.aGain.array as Float32Array;
    for (let i = 0; i < this.stations.length; i++) {
      const st = this.stations[i]!;
      const target = si >= i ? 1 : 0;
      st.gain += (target - st.gain) * Math.min(1, dt * 1.4);
      for (const f of st.faces) f.opacity = st.gain;
      gainArr[st.glowIdx] = st.gain;
      st.points.opacity = st.gain * 0.85;
      if (!reduced) st.spin.rotation.y += dt * 0.12;
    }
    this.stationGlows.attrs.aGain.needsUpdate = true;

    // Wing lighting follows Mind → Body → Spirit.
    const w = wingWeights(si);
    for (let k = 0; k < 3; k++) {
      this.wingGain[k] += (w[k] - this.wingGain[k]) * Math.min(1, dt * 1.2);
      this.wings[k]!.intensity = this.wingGain[k] * 60;
    }

    if (talking && t >= DURATION - 0.4) this.finish(true);
  }

  /** Tap (in NDC) — returns true when the orb was tapped and the tour released. */
  tap(nx: number, ny: number, camera: THREE.Camera): boolean {
    if (!this.active) return false;
    this.raycaster.setFromCamera(new THREE.Vector2(nx, ny), camera);
    const hits = this.raycaster.intersectObject(this.orbHit, false);
    if (hits.length > 0) {
      if (this.phase === "choice") this.release("The orb dims. Walk wherever you like.");
      else this.finish(false);
      return true;
    }
    return false;
  }

  finish(completed: boolean, quiet = false): void {
    if (!this.active) return;
    if (completed && this.phase === "tour") {
      this.startChoice();
      return;
    }
    if (!completed) this.narration.stop(2);
    this.release(quiet ? null : "The orb dims. Walk wherever you like.");
  }

  /** The road ends; the choice begins. Called by the UI in main. */
  choose(key: ChoiceKey): void {
    if (!this.active || this.phase !== "choice") return;
    this.phase = "releasing";
    this.mood = key;
    this.releaseAt = this.tGlobal + (key === "rest" ? 4.5 : 7);
    const words: Record<ChoiceKey, string> = {
      love: "And so it is — the light you carry is the light you are.",
      rest: "Then rest. The tree is waiting.",
      undecided: "Not choosing is also a choice. The road waits.",
    };
    this.hooks.whisper(words[key], 7000);
  }

  private startChoice(): void {
    this.phase = "choice";
    this.choiceStartT = this.tGlobal;
    this.buildCreation();
    this.onChoice?.();
    this.hooks.whisper("Stay a while. Let the road settle — then choose, or don't.", 8000);
  }

  private release(msg: string | null): void {
    if (!this.active) return;
    this.active = false;
    this.phase = "done";
    this.orb.visible = false;
    this.onFinish?.();
    if (msg) this.hooks.whisper(msg, 5000);
  }

  /** The finale: the player rests at the dais while creation moves around them. */
  private updateChoice(dt: number): void {
    this.animateCreation(dt);
    this.player.pose = "idle";
    this.player.speed = 0;
    // The orb rises, brighter.
    const fp = WAYPOINTS[WAYPOINTS.length - 1]!;
    const rise = Math.min(7, (this.tGlobal - this.choiceStartT) * 0.45);
    this.orb.position.set(fp.x, fp.y + 2.3 + rise + Math.sin(this.tGlobal * 1.8) * 0.28, fp.z);
    this.orbHaloMat.size = 3.2;
    this.orbLight.intensity = 18;
    // Wing light answers the choice.
    const mt: [number, number, number] =
      this.mood === "love"
        ? [1, 0.85, 0.7]
        : this.mood === "rest"
          ? [0.3, 0.24, 0.34]
          : this.mood === "undecided"
            ? [0.35, 0.35, 1]
            : [0.8, 0.7, 1];
    for (let k = 0; k < 3; k++) {
      this.wingGain[k] += (mt[k] - this.wingGain[k]) * Math.min(1, dt * 1.2);
      this.wings[k]!.intensity = this.wingGain[k] * 60;
    }
    if (this.phase === "releasing" && this.tGlobal >= this.releaseAt) this.release(null);
  }
}
