/* The world after the veil (the owner's brief, prompts/opus-densities-area-prompt.md): beyond the
   one door in the forest, an open walk, no more doors. One path leads through it, and the angel
   walks it a little ahead of you, stopping at each place to turn and speak (its seven recordings,
   Aria; beat 1 was spoken at the door, outside).
   2 the forest walk: the trees still, but light in their grain; the canopy thinning, the ground
       mist dissolving and the amber light turning white-gold as you go on (the veil thinning);
   3 the clearing: fourth density, love made visible: warm air, motes drifting everywhere, and
       fine threads of light between them (no veil between minds);
   4 the newcomers' ground: half-formed figures at the treeline, angular shards of their old
       armour still drifting about them; a bent spear and a cracked shield half under the light;
   5 the war in heaven: a wide shallow vale; on one side columns of warm light standing guard; on
       the other tall forms, beautiful but wrong, round which slow spirals draw the motes in and dim
       them; arcs of thought across the vale; the path between, untouched;
   6 the mirror: a vantage over the abyss, and below it the old world turning, blue and green,
       vivid and unseeing; threads, gold and shadow, coming down toward it and fading before they
       touch; the shadow ones withdraw wherever you look straight at them;
   7 the laying down: a small glade, a ring of swords of light laid on the ground, dimming; then
       the angel gestures to the way home and comes apart into motes; the path leads out.
   Frame: the room's own, the start at the origin facing −z. */
import * as THREE from "three/webgpu";
import { T, gpuUniforms, vnoise, type N } from "../../gpu/tsl";
import { ribbonGeometry, ribbonMaterial } from "../../gpu/ribbons";
import { applyAir, damp, fbmN, keepAlpha, merge, pointCloud, roomClock, roomPos, scannedGround, seeded, skyDome, touch, type Air } from "../densities/roomKit";
import { forest, type TreeSpot } from "./forest";
import { fbm } from "../../world/terrain";
import { GlassFolk } from "../glassFolk";
import { starField } from "../past/kit";
import { Angel } from "./angel";
import type { Narration } from "../../core/narration";
import type { Room, Solid } from "../journey";
import { MOBILE } from "../../core/quality";

const { abs, cameraPosition, cos, exp, float, fract, length, max, mix, normalize, positionWorld, pow, sin, smoothstep, step, uniform, vec2, vec3, vec4 } = T;
const V3 = THREE.Vector3;

/** The recordings: beat n is `densities-area-cine-n.mp3` (1 at the door, 2–7 here). */
export const VEIL_TRACK = (n: number): string => `audio/densities-area/densities-area-cine-${n}.mp3`;

/* ---------------------------------------------------------------- the path */
const PATH: [number, number][] = [
  [0, 4], [0, -30], [7, -58], [4, -88], [0, -114], // the forest
  [0, -150], [18, -182], // the clearing, out at its far side
  [30, -205], [40, -235], [40, -305], // the newcomers' treeline, the vale
  [34, -338], [24, -360], // rising to the vantage
  [2, -362], [-24, -350], [-44, -336], [-62, -318], [-78, -300], // along the height, down to the glade, and out
];
const SEG: { ax: number; az: number; dx: number; dz: number; len: number; s0: number }[] = [];
{
  let s = 0;
  for (let i = 0; i < PATH.length - 1; i++) {
    const [ax, az] = PATH[i], [bx, bz] = PATH[i + 1];
    const len = Math.hypot(bx - ax, bz - az);
    SEG.push({ ax, az, dx: (bx - ax) / len, dz: (bz - az) / len, len, s0: s });
    s += len;
  }
}
const PATH_LEN = SEG[SEG.length - 1].s0 + SEG[SEG.length - 1].len;
/** The nearest point of the path to (x, z): how far along it (s) and how far aside (d, signed: + right). */
function onPath(x: number, z: number): { s: number; d: number; px: number; pz: number } {
  let best = { s: 0, d: Infinity, px: 0, pz: 0 };
  for (const g of SEG) {
    const u = Math.max(0, Math.min(g.len, (x - g.ax) * g.dx + (z - g.az) * g.dz));
    const px = g.ax + g.dx * u, pz = g.az + g.dz * u;
    const d = Math.hypot(x - px, z - pz);
    if (d < Math.abs(best.d)) {
      const side = (x - px) * -g.dz + (z - pz) * g.dx; // + to the right of the way
      best = { s: g.s0 + u, d: side >= 0 ? d : -d, px, pz };
    }
  }
  return best;
}
/** The point `s` metres along the path. */
function along(s: number): [number, number] {
  s = Math.max(0, Math.min(PATH_LEN, s));
  for (const g of SEG) if (s <= g.s0 + g.len) return [g.ax + g.dx * (s - g.s0), g.az + g.dz * (s - g.s0)];
  const g = SEG[SEG.length - 1];
  return [g.ax + g.dx * g.len, g.az + g.dz * g.len];
}
const sAt = (x: number, z: number): number => onPath(x, z).s;

/** The places along the way (room frame). */
const CLEARING = new V3(0, 0, -150);
const NEWCOMERS = new V3(30, 0, -205);
const VALE = new V3(40, 0, -270);
const EARTH = new V3(14, 13, -520);
const EARTH_R = 19;
const GLADE = new V3(-44, 0, -336);
/** Where each beat (2–7) is spoken: you reach it, the angel turns to you. */
const BEATS: { n: number; s: number }[] = [
  { n: 2, s: sAt(7, -58) - 8 },
  { n: 3, s: sAt(0, -128) },
  { n: 4, s: sAt(26, -198) },
  { n: 5, s: sAt(40, -245) },
  { n: 6, s: sAt(24, -360) - 2 },
  { n: 7, s: sAt(-40, -340) },
];
/** The way out, past the glade. */
export const VEIL_EXIT = { x: -78, z: -300 };

/** The ground: low and soft in the forest; level in the clearing; a shallow vale; rising to the
    height above the abyss, where it falls away. */
/** The whole ground stands this high: the journey's place apart has its water line at 0, and the
    vale must never dip under it (you would swim). */
const BASE = 8;
export function veilFloor(x: number, z: number): number {
  const roll = (fbm(x * 0.03 + 4, z * 0.03 - 9) - 0.5) * 3.2 + (fbm(x * 0.12, z * 0.12 + 3) - 0.5) * 0.5;
  const sm = (a: number, b: number, v: number) => {
    const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
    return t * t * (3 - 2 * t);
  };
  const clearing = sm(48, 30, Math.hypot(x - CLEARING.x, z - CLEARING.z));
  const vale = -4.5 * sm(52, 10, Math.hypot((x - VALE.x) * 1.3, z - VALE.z) * 0.85);
  // the height: from the vale's end up to the vantage and along it to the glade
  const hz = sm(-312, -345, z);
  const height = 10 * hz;
  const glade = sm(22, 8, Math.hypot(x - GLADE.x, z - GLADE.z));
  // beyond the height's edge, the abyss
  const edge = z < -372 ? -60 * sm(-372, -392, z) : 0;
  const path = sm(9, 2, Math.abs(onPath(x, z).d)); // the path itself runs smooth
  return BASE + roll * (1 - clearing * 0.85) * (1 - path * 0.7) * (1 - glade * 0.7) + vale + height * (1 - glade * 0.6) + edge;
}

/** Keep the walker on the way: a corridor about the path, wider where the places open. */
export function veilConfine(p: { x: number; z: number }): void {
  const o = onPath(p.x, p.z);
  const w = Math.hypot(p.x - CLEARING.x, p.z - CLEARING.z) < 40 ? 36 : Math.hypot(p.x - GLADE.x, p.z - GLADE.z) < 16 ? 14 : Math.abs(p.z - VALE.z) < 40 && Math.abs(p.x - VALE.x) < 30 ? 10 : 6.5;
  if (Math.abs(o.d) > w) {
    const k = w / Math.abs(o.d);
    p.x = o.px + (p.x - o.px) * k;
    p.z = o.pz + (p.z - o.pz) * k;
  }
  // never past the edge of the height
  if (p.z < -368) p.z = -368;
}

/* ---------------------------------------------------------------- the airs, along the way */
const AIRS: { s: number; air: Air }[] = [
  { s: 0, air: { color: new THREE.Color(0.014, 0.011, 0.008), glow: new THREE.Color(0.08, 0.045, 0.015), glowDir: new V3(0, 0.3, -1), density: 0.04, shadow: new THREE.Color(0.01, 0.006, 0.002), sat: 1.02, contrast: 1.06 } },
  { s: 110, air: { color: new THREE.Color(0.1, 0.09, 0.07), glow: new THREE.Color(0.32, 0.27, 0.18), glowDir: new V3(0, 0.5, -1), density: 0.012, shadow: new THREE.Color(0.02, 0.016, 0.01), sat: 1.0, contrast: 1.04 } },
  { s: 160, air: { color: new THREE.Color(0.16, 0.14, 0.1), glow: new THREE.Color(0.5, 0.42, 0.26), glowDir: new V3(0, 0.6, -1), density: 0.01, shadow: new THREE.Color(0.03, 0.025, 0.015), sat: 1.02, contrast: 1.0 } },
  { s: 240, air: { color: new THREE.Color(0.05, 0.045, 0.07), glow: new THREE.Color(0.2, 0.16, 0.22), glowDir: new V3(0, 0.35, -1), density: 0.011, shadow: new THREE.Color(0.012, 0.01, 0.025), sat: 1.0, contrast: 1.06 } },
  { s: 330, air: { color: new THREE.Color(0.012, 0.016, 0.035), glow: new THREE.Color(0.06, 0.09, 0.16), glowDir: new V3(-0.1, -0.2, -1), density: 0.004, shadow: new THREE.Color(0.004, 0.006, 0.02), sat: 1.04, contrast: 1.06 } },
  { s: 410, air: { color: new THREE.Color(0.05, 0.04, 0.03), glow: new THREE.Color(0.22, 0.17, 0.09), glowDir: new V3(0, 0.4, 1), density: 0.009, shadow: new THREE.Color(0.012, 0.009, 0.004), sat: 1.0, contrast: 1.04 } },
];
const scratchAir: Air = { color: new THREE.Color(), glow: new THREE.Color(), glowDir: new V3(), density: 0, shadow: new THREE.Color(), sat: 1, contrast: 1 };
function airAt(s: number): Air {
  let i = 0;
  while (i < AIRS.length - 2 && s > AIRS[i + 1].s) i++;
  const a = AIRS[i].air, b = AIRS[i + 1].air;
  let k = Math.min(1, Math.max(0, (s - AIRS[i].s) / (AIRS[i + 1].s - AIRS[i].s)));
  k = k * k * (3 - 2 * k);
  scratchAir.color.copy(a.color).lerp(b.color, k);
  scratchAir.glow.copy(a.glow).lerp(b.glow, k);
  scratchAir.glowDir.copy(a.glowDir).lerp(b.glowDir, k);
  scratchAir.density = a.density + (b.density - a.density) * k;
  scratchAir.shadow!.copy(a.shadow!).lerp(b.shadow!, k);
  scratchAir.sat = a.sat! + (b.sat! - a.sat!) * k;
  scratchAir.contrast = a.contrast! + (b.contrast! - a.contrast!) * k;
  return scratchAir;
}

/* ---------------------------------------------------------------- the area */
export function createAfterVeil(scene: THREE.Scene, narration: Narration, whisper: (t: string, ms?: number) => void): Room {
  const g = new THREE.Group();
  g.name = "lesson:after-veil";
  scene.add(g);
  const ours: { dispose(): void }[] = [];
  const R = seeded(7707);
  const clock = roomClock();
  const t = clock.u;
  const uProg = uniform(0); // how far along the way you have come (s)
  const uLove = uniform(0); // the clearing's light, as its beat is spoken
  const uWar = uniform(0); // the vale's tableau, as its beat is spoken
  const uLaid = uniform(0); // the swords dimming
  const uGaze = uniform(new V3(0, 0, -1)); // where the camera looks (the whisperer withdraws)
  const solids: Solid[] = [];
  const fewer = MOBILE ? 0.7 : 1;
  /** What shows only between two points of the way (s): far scenes rest, and their lines never cross the sky. */
  const windows: [THREE.Object3D, number, number][] = [];

  /* ---------------- the sky: the night between worlds ---------------- */
  {
    const sky = skyDome(1600, new THREE.Color(0.05, 0.045, 0.06), new THREE.Color(0.004, 0.005, 0.016), {
      extra: (d, c) => {
        // a faint band of far light and a rose-violet veil of nebula, the stars thick above
        const band = exp(T.dot(d, normalize(vec3(0.6, 0.25, -0.7))).pow(2).mul(-9)).mul(fbmN(d.mul(6)).mul(0.8).add(0.2));
        const neb = smoothstep(0.45, 0.85, fbmN(d.mul(3.1).add(vec3(2, 0, 5)))).mul(smoothstep(-0.05, 0.4, d.y));
        return c.add(vec3(0.05, 0.045, 0.07).mul(band)).add(vec3(0.07, 0.03, 0.08).mul(neb)).add(vec3(starField(d, t, 0.008)).mul(smoothstep(-0.02, 0.15, d.y)));
      },
    });
    g.add(sky.mesh);
    ours.push(sky);
  }

  /* ---------------- the ground ---------------- */
  {
    const geo = new THREE.PlaneGeometry(260, 460, 200, 340);
    geo.rotateX(-Math.PI / 2);
    geo.translate(-10, 0, -190);
    const p = geo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) p.setY(i, veilFloor(p.getX(i), p.getZ(i)));
    geo.computeVertexNormals();
    const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.96, metalness: 0 });
    const scan = scannedGround("meadow", 2.6, { hue: 0.4, relief: 1.1, bright: 1.2 });
    const P = roomPos;
    const dC = length(P.xz.sub(vec2(CLEARING.x, CLEARING.z)));
    const inClear = smoothstep(42, 22, dC);
    const loam = mix(vec3(0.05, 0.04, 0.03), vec3(0.09, 0.075, 0.05), fbmN(P.xz.mul(0.05)));
    const pale = mix(vec3(0.24, 0.19, 0.1), vec3(0.34, 0.27, 0.14), fbmN(P.xz.mul(0.08)));
    const high = smoothstep(BASE + 2, BASE + 9, P.y);
    const stone = mix(vec3(0.07, 0.07, 0.09), vec3(0.11, 0.105, 0.12), fbmN(P.xz.mul(0.12)));
    m.colorNode = mix(mix(loam, pale, inClear), stone, high.mul(float(1).sub(inClear))).mul(scan.color);
    m.normalNode = scan.normal;
    // the clearing's ground holds a little of the light that fills the air there (it is the
    // light's own place: love made visible), breathing faintly
    m.emissiveNode = vec3(0.5, 0.42, 0.26).mul(inClear).mul(fbmN(P.xz.mul(0.09).add(t.mul(0.02))).mul(0.6).add(0.4)).mul(uLove.mul(0.09).add(0.02));
    const ground = new THREE.Mesh(geo, m);
    ground.receiveShadow = true;
    g.add(ground);
    ours.push(geo, m);
    // the abyss under the height: a deep dark far below, so the world there floats over nothing
    const deep = new THREE.Mesh(new THREE.PlaneGeometry(900, 500), new THREE.MeshBasicNodeMaterial({ fog: false }));
    (deep.material as THREE.MeshBasicNodeMaterial).colorNode = vec4(0.003, 0.004, 0.012, 1);
    deep.rotation.x = -Math.PI / 2;
    deep.position.set(0, -130, -620);
    g.add(deep);
    ours.push(deep.geometry, deep.material as THREE.Material);
  }

  // the light: a low warm key along the way, a cool fill from the sky
  const key = new THREE.DirectionalLight(0xffe2b8, 0.9);
  key.position.set(40, 60, 30);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.left = key.shadow.camera.bottom = -60;
  key.shadow.camera.right = key.shadow.camera.top = 60;
  key.shadow.bias = -0.0005;
  g.add(key, key.target);
  const hemi = new THREE.HemisphereLight(0x8a90b8, 0x241a10, 0.35);
  g.add(hemi);

  /* ---------------- the forest: still trees, light in their grain, the canopy thinning ---------------- */
  {
    const spots: TreeSpot[] = [];
    const plant = (x: number, z: number, size: number, shape: number, crown: number) => {
      spots.push({ x, z, y: veilFloor(x, z), size, shape, crown });
      if (Math.abs(onPath(x, z).d) < 9) solids.push({ x, z, r: 0.3 * size, h: 6 * size });
    };
    // along the forest walk: dense and heavy at the start, thinning as the way goes on
    for (let s = -8; s < 124; s += 2.2) {
      const [px, pz] = along(Math.max(0, s));
      const thin = Math.max(0, Math.min(1, s / 120));
      for (const side of [-1, 1]) {
        for (const far of [0, 1]) {
          if (R() < thin * 0.6 + far * 0.25) continue;
          const off = side * (3.4 + far * 7 + R() * 5 + thin * 5);
          const x = px + off + (R() - 0.5) * 2, z = pz + (R() - 0.5) * 2;
          plant(x, z, 1.25 + R() * 0.9 - thin * 0.35, R() < 0.3 ? 3 : R() < 0.55 ? 1 : 0, (1 - thin * 0.7) * fewer);
        }
      }
    }
    // beyond the clearing the woods go on, sparser, along the rest of the way and round the glade
    for (let s = 190; s < PATH_LEN - 4; s += 5.5) {
      const [px, pz] = along(s);
      if (Math.hypot(px - VALE.x, pz - VALE.z) < 40 || pz < -345) continue; // the vale and the height stay open
      for (const side of [-1, 1]) {
        if (R() < 0.35) continue;
        const off = side * (7 + R() * 9);
        plant(px + off, pz + (R() - 0.5) * 3, 1.2 + R() * 0.8, R() < 0.3 ? 3 : 1, 0.75 * fewer);
      }
    }
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2 + R() * 0.2;
      const x = GLADE.x + Math.sin(a) * (13 + R() * 5), z = GLADE.z + Math.cos(a) * (13 + R() * 5);
      if (Math.abs(onPath(x, z).d) < 6) continue;
      plant(x, z, 1.2 + R() * 0.6, 0, 0.8 * fewer);
    }
    // the clearing's treeline, open where the way comes in and goes on
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * Math.PI * 2 + R() * 0.1;
      const x = CLEARING.x + Math.sin(a) * (46 + R() * 10), z = CLEARING.z + Math.cos(a) * (46 + R() * 10);
      if (Math.abs(onPath(x, z).d) < 7) continue;
      plant(x, z, 1.4 + R() * 0.8, R() < 0.3 ? 3 : 1, 0.55 * fewer);
    }
    const f = forest(spots, t, R);
    g.add(...f.objects);
    ours.push(f);
  }

  /* ---------------- ground mist that dissolves as you go on, and spores of light ---------------- */
  {
    const n = Math.round(150 * fewer);
    const c = pointCloud(n, 7);
    for (let i = 0; i < n; i++) {
      const s = R() * 118;
      const [px, pz] = along(s);
      const x = px + (R() - 0.5) * 22, z = pz + (R() - 0.5) * 10;
      c.pos.set([x, veilFloor(x, z) + 0.5 + R() * 0.8, z], i * 3);
      c.k.set([s, R(), R(), R()], i * 4);
    }
    touch(c.cloud);
    const K = c.cloud.nodes.aK;
    c.material.positionNode = c.cloud.nodes.position.add(vec3(sin(t.mul(0.05).add(K.y.mul(20))).mul(1.5), 0, cos(t.mul(0.04).add(K.z.mul(20))).mul(1.5)));
    // the veil thinning: the mist ahead stays, the mist you reach melts, and all of it thins the
    // farther you have come
    const ahead = smoothstep(-4, 14, K.x.sub(uProg));
    const all = float(1).sub(smoothstep(20, 112, uProg));
    c.material.colorNode = vec4(vec3(0.16, 0.13, 0.09).mul(c.round).mul(ahead.mul(0.6).add(0.4)).mul(all).mul(0.22).mul(smoothstep(2.5, 7, length(cameraPosition.sub(positionWorld)))), 1);
    g.add(c.cloud.sprite);
    ours.push(c.material);
    const m = Math.round(260 * fewer);
    const f = pointCloud(m, 0.07);
    for (let i = 0; i < m; i++) {
      const [px, pz] = along(R() * 130);
      const x = px + (R() - 0.5) * 30, z = pz + (R() - 0.5) * 18;
      f.pos.set([x, veilFloor(x, z) + 0.4 + R() * 4, z], i * 3);
      f.k.set([R(), R(), R(), R()], i * 4);
    }
    touch(f.cloud);
    const FK = f.cloud.nodes.aK;
    f.material.positionNode = f.cloud.nodes.position.add(vec3(sin(t.mul(0.3).add(FK.x.mul(40))).mul(0.8), sin(t.mul(0.21).add(FK.y.mul(30))).mul(0.5), cos(t.mul(0.26).add(FK.z.mul(40))).mul(0.8)));
    const blink = smoothstep(0.55, 1, sin(t.mul(float(0.6).add(FK.w)).add(FK.x.mul(60))));
    f.material.colorNode = vec4(vec3(1, 0.78, 0.42).mul(f.round).mul(blink).mul(0.9), 1);
    g.add(f.cloud.sprite);
    ours.push(f.material);
  }

  /* ---------------- the clearing: love made visible, no veil between minds ---------------- */
    {
    // the motes everywhere, drifting slow and warm
    const n = Math.round(2600 * fewer);
    const c = pointCloud(n, 0.13);
    for (let i = 0; i < n; i++) {
      const a = R() * Math.PI * 2, r = Math.sqrt(R()) * 44;
      const x = CLEARING.x + Math.cos(a) * r, z = CLEARING.z + Math.sin(a) * r;
      c.pos.set([x, veilFloor(x, z) + 0.3 + R() * R() * 9, z], i * 3);
      c.k.set([R(), R(), R(), R()], i * 4);
    }
    touch(c.cloud);
    const K = c.cloud.nodes.aK;
    const drift = vec3(sin(t.mul(0.07).add(K.x.mul(40))).mul(1.6), sin(t.mul(0.11).add(K.y.mul(30))).mul(0.6).add(fract(t.mul(0.008).add(K.z)).mul(1.2)), cos(t.mul(0.06).add(K.w.mul(40))).mul(1.6));
    c.material.positionNode = c.cloud.nodes.position.add(drift);
    const tw = sin(t.mul(float(0.8).add(K.x)).add(K.y.mul(50))).mul(0.3).add(0.7);
    c.material.colorNode = vec4(vec3(1, 0.86, 0.6).mul(c.round).mul(tw).mul(uLove.mul(0.55).add(0.45)).mul(smoothstep(2.5, 6, length(cameraPosition.sub(positionWorld)))), 1);
    g.add(c.cloud.sprite);
    windows.push([c.cloud.sprite, 70, 300]);
    ours.push(c.material);
    // the threads: still motes, each joined by a thread of light to its nearest few, so the
    // whole clearing reads as one mind perceiving itself
    const A: THREE.Vector3[] = [];
    for (let i = 0; i < 110; i++) {
      const a = R() * Math.PI * 2, r = 4 + Math.sqrt(R()) * 36;
      const x = CLEARING.x + Math.cos(a) * r, z = CLEARING.z + Math.sin(a) * r;
      A.push(new V3(x, veilFloor(x, z) + 1 + R() * 6, z));
    }
    const pairs: number[] = [];
    A.forEach((p, i) => {
      const near = A.map((q, j) => [j, p.distanceToSquared(q)] as [number, number]).filter(([j]) => j > i).sort((u, v) => u[1] - v[1]).slice(0, 2);
      for (const [j, d2] of near) if (d2 < 140) pairs.push(p.x, p.y, p.z, A[j].x, A[j].y, A[j].z);
    });
    const tg = ribbonGeometry(pairs);
    const pulse = pow(sin(T.positionGeometry.x.mul(0.35).add(T.positionGeometry.z.mul(0.25)).sub(t.mul(0.9))).mul(0.5).add(0.5), 6);
    const tm = keepAlpha(ribbonMaterial(vec3(1, 0.8, 0.5).mul(pulse.mul(0.4).add(0.08)).mul(uLove.mul(0.7).add(0.3)), 0.45));
    const tmesh = new THREE.Mesh(tg, tm);
    tmesh.frustumCulled = false;
    g.add(tmesh);
    windows.push([tmesh, 70, 300]);
    ours.push(tg, tm);
    const anchors = pointCloud(A.length, 0.16);
    A.forEach((p, i) => (anchors.pos.set([p.x, p.y, p.z], i * 3), anchors.k.set([R(), R(), R(), R()], i * 4)));
    touch(anchors.cloud);
    anchors.material.colorNode = vec4(vec3(1, 0.88, 0.62).mul(anchors.round).mul(uLove.mul(0.6).add(0.4)), 1);
    g.add(anchors.cloud.sprite);
    windows.push([anchors.cloud.sprite, 70, 300]);
    // the ground itself holds small lights, as a meadow holds flowers: the clearing is lit from below
    const fl = Math.round(1400 * fewer);
    const b = pointCloud(fl, 0.14);
    for (let i = 0; i < fl; i++) {
      const a = R() * Math.PI * 2, r = Math.sqrt(R()) * 42;
      const x = CLEARING.x + Math.cos(a) * r, z = CLEARING.z + Math.sin(a) * r;
      if (Math.abs(onPath(x, z).d) < 1.2) continue;
      b.pos.set([x, veilFloor(x, z) + 0.08 + R() * 0.3, z], i * 3);
      b.k.set([R(), R(), R(), R()], i * 4);
    }
    touch(b.cloud);
    const BK = b.cloud.nodes.aK;
    const bt = sin(t.mul(float(0.5).add(BK.x.mul(0.6))).add(BK.y.mul(40))).mul(0.35).add(0.65);
    b.material.colorNode = vec4(mix(vec3(1, 0.88, 0.6), vec3(0.95, 0.75, 0.85), step(0.8, BK.z)).mul(b.round).mul(bt).mul(uLove.mul(0.6).add(0.4)).mul(smoothstep(2, 5, length(cameraPosition.sub(positionWorld)))), 1);
    g.add(b.cloud.sprite);
    windows.push([b.cloud.sprite, 70, 300]);
    ours.push(b.material);
    // and from above, soft shafts of warm light falling into it, slowly brightening and fading
    const shaft = new THREE.CylinderGeometry(2.2, 4.5, 40, 24, 1, true);
    shaft.translate(0, 20, 0);
    const sm2 = keepAlpha(new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.FrontSide, fog: false }));
    const core = pow(abs(T.dot(T.normalView, vec3(0, 0, 1))), 5);
    const ends2 = smoothstep(0, 6, T.positionGeometry.y).mul(smoothstep(40, 18, T.positionGeometry.y));
    const near2 = smoothstep(3, 9, length(cameraPosition.sub(positionWorld)));
    // brightest high up where it enters, thinning as it falls
    const fall = smoothstep(4, 36, T.positionGeometry.y).mul(0.7).add(0.3);
    sm2.colorNode = vec4(vec3(1, 0.86, 0.6).mul(core).mul(ends2).mul(near2).mul(fall).mul(uLove.mul(0.05).add(0.02)).mul(sin(t.mul(0.15).add(T.positionWorld.x)).mul(0.3).add(0.7)), 1);
    ours.push(shaft, sm2);
    for (const [dx, dz, tilt] of [[-12, 8, 0.12], [9, -6, -0.1], [-4, -18, 0.08], [16, 14, -0.14], [2, 22, 0.1]] as const) {
      const m = new THREE.Mesh(shaft, sm2);
      m.position.set(CLEARING.x + dx, veilFloor(CLEARING.x + dx, CLEARING.z + dz), CLEARING.z + dz);
      m.rotation.set(tilt, 0, tilt * 0.6);
      g.add(m);
      windows.push([m, 70, 300]);
    }
    ours.push(anchors.material);
  }

  /* ---------------- the newcomers' ground ---------------- */
  const newcomers = new GlassFolk(
    [
      { x: NEWCOMERS.x + 9, z: NEWCOMERS.z - 3, face: -2.0, act: "sit" as const, tint: new THREE.Color(0.55, 0.6, 0.72), glow: { inner: 0.35, edge: 0.5, body: 0.35 } },
      { x: NEWCOMERS.x + 11, z: NEWCOMERS.z + 4, face: -1.4, act: "idle" as const, tint: new THREE.Color(0.6, 0.62, 0.7), glow: { inner: 0.3, edge: 0.45, body: 0.3 } },
      { x: NEWCOMERS.x + 6, z: NEWCOMERS.z - 11, face: -2.6, act: "idle" as const, tint: new THREE.Color(0.52, 0.56, 0.68), glow: { inner: 0.3, edge: 0.45, body: 0.3 } },
      { x: NEWCOMERS.x - 9, z: NEWCOMERS.z + 8, face: 1.2, act: "sit" as const, tint: new THREE.Color(0.58, 0.58, 0.66), glow: { inner: 0.35, edge: 0.5, body: 0.35 } },
      { x: NEWCOMERS.x - 11, z: NEWCOMERS.z - 6, face: 1.9, act: "idle" as const, tint: new THREE.Color(0.54, 0.6, 0.7), glow: { inner: 0.3, edge: 0.45, body: 0.3 } },
    ].map((s) => ({ ...s, y: veilFloor(s.x, s.z) - (s.act === "sit" ? 0.42 : 0) })),
    41,
  );
  g.add(newcomers.group);
  for (const b of [[9, -3], [11, 4], [6, -11], [-9, 8], [-11, -6]]) solids.push({ x: NEWCOMERS.x + b[0], z: NEWCOMERS.z + b[1], r: 0.45, h: 2 });
  // the old armour's angular densities, still drifting about them, slowly; and what was put down
  const shardsU = { list: [] as { m: THREE.Mesh; c: THREE.Vector3; a: number; r: number; y: number; w: number }[] };
  {
    const sm = new THREE.MeshStandardNodeMaterial({ color: new THREE.Color(0.07, 0.075, 0.09), roughness: 0.45, metalness: 0.2, flatShading: true });
    // a thin cold edge of light: what is left of its glow
    sm.emissiveNode = vec3(0.25, 0.3, 0.42).mul(pow(float(1).sub(abs(T.dot(T.normalView, vec3(0, 0, 1)))), 3)).mul(0.6);
    const shard = new THREE.OctahedronGeometry(0.18, 0);
    shard.scale(1, 1.8, 0.35);
    ours.push(sm, shard);
    for (const b of [[9, -3, 0.9], [11, 4, 1.2], [6, -11, 1.2], [-9, 8, 0.9], [-11, -6, 1.2]]) {
      const c = new V3(NEWCOMERS.x + b[0], veilFloor(NEWCOMERS.x + b[0], NEWCOMERS.z + b[1]) + b[2], NEWCOMERS.z + b[1]);
      for (let k = 0; k < 5; k++) {
        const m = new THREE.Mesh(shard, sm);
        m.castShadow = true;
        g.add(m);
        shardsU.list.push({ m, c, a: R() * Math.PI * 2, r: 0.45 + R() * 0.3, y: (R() - 0.3) * 0.9, w: (R() < 0.5 ? -1 : 1) * (0.05 + R() * 0.06) });
      }
    }
    // a bent spear of shadow, a cracked shield, half under the light
    const dm = new THREE.MeshStandardNodeMaterial({ color: new THREE.Color(0.035, 0.035, 0.045), roughness: 0.5, metalness: 0.3 });
    dm.emissiveNode = vec3(0.4, 0.42, 0.55).mul(pow(float(1).sub(abs(T.dot(T.normalView, vec3(0, 0, 1)))), 4)).mul(0.5);
    ours.push(dm);
    const spearPts = [new V3(0, 0, 0), new V3(0.3, 1.4, 0.1), new V3(0.2, 2.6, 0.5), new V3(-0.3, 3.4, 1.4)];
    const spear = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(spearPts), 24, 0.045, 6);
    const tip = new THREE.ConeGeometry(0.11, 0.5, 4);
    tip.rotateX(1.0);
    tip.translate(-0.42, 3.55, 1.62);
    for (const [x, z, a, tilt] of [[NEWCOMERS.x + 3, NEWCOMERS.z - 7, 0.6, 1.0], [NEWCOMERS.x - 5, NEWCOMERS.z + 2, 2.4, 1.2]] as const) {
      const m = new THREE.Mesh(merge([spear.clone(), tip.clone()]), dm);
      m.position.set(x, veilFloor(x, z) - 0.6, z);
      m.rotation.set(tilt, a, 0.2);
      g.add(m);
      ours.push(m.geometry);
    }
    spear.dispose();
    tip.dispose();
    // the shield: a round boss of dark metal in two halves, cracked apart, tilted into the ground
    for (const [x, z, a] of [[NEWCOMERS.x + 1, NEWCOMERS.z + 9, 0.3], [NEWCOMERS.x - 4, NEWCOMERS.z - 9, 1.8]] as const) {
      for (const half of [0, 1]) {
        const sh = new THREE.CylinderGeometry(0.75, 0.75, 0.07, 28, 1, false, half * Math.PI, Math.PI);
        sh.rotateX(Math.PI / 2);
        const m = new THREE.Mesh(sh, dm);
        m.position.set(x + (half ? 0.08 : -0.08), veilFloor(x, z) + 0.15, z);
        m.rotation.set(-0.9, a + (half ? 0.06 : -0.06), half ? 0.08 : -0.05);
        m.castShadow = true;
        g.add(m);
        ours.push(sh);
      }
    }
  }

  /* ---------------- the war in heaven: weather, not war ---------------- */
  // the guardians: tall steady columns of warm light on the west side, facing outward
  const guardians: THREE.Vector3[] = [];
  for (let i = 0; i < 6; i++) guardians.push(new V3(VALE.x - 12 - (i % 2) * 3, 0, VALE.z - 22 + i * 10));
  // the husks: tall, elegant, luminous forms on the east side (the game's figures of glass light,
  // drawn tall and thin, their light cold and their stance a little crooked)
  const husks: THREE.Vector3[] = [];
  for (let i = 0; i < 5; i++) husks.push(new V3(VALE.x + 12 + (i % 2) * 3, 0, VALE.z - 20 + i * 11));
  for (const p of [...guardians, ...husks]) p.y = veilFloor(p.x, p.z);
  const husksFolk = new GlassFolk(
    husks.map((p, i) => ({ x: p.x, z: p.z, y: p.y, face: -Math.PI / 2 + (i % 2 ? 0.3 : -0.2), act: "idle" as const, tint: new THREE.Color(0.78, 0.8, 1.0), scale: 2.3, glow: { inner: 0.75, edge: 1.1, body: 0.55 } })),
    53,
  );
  g.add(husksFolk.group);
  void husksFolk.loaded.then(() => {
    // beautiful but wrong: each a little crooked, slender, and moving slightly against the flow
    husksFolk.group.children.forEach((r, i) => {
      r.rotation.z = (i % 2 ? 1 : -1) * 0.05;
      r.scale.x = 0.85;
    });
  });
  {
    // the guardians' columns: a bright narrow core, soft to its edges, light slowly rising in it
    const col = new THREE.CylinderGeometry(1.1, 1.3, 16, 20, 1, true);
    col.translate(0, 8, 0);
    const cm = keepAlpha(new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.FrontSide, fog: false }));
    const n = T.normalView;
    const core = pow(abs(T.dot(n, vec3(0, 0, 1))), 4);
    const rise = sin(T.positionGeometry.y.mul(0.6).sub(t.mul(0.8))).mul(0.2).add(0.8);
    const ends = smoothstep(0, 1.5, T.positionGeometry.y).mul(smoothstep(16, 11, T.positionGeometry.y));
    cm.colorNode = vec4(vec3(1, 0.78, 0.45).mul(core).mul(rise).mul(ends).mul(uWar.mul(0.25).add(0.2)).mul(smoothstep(2, 7, length(cameraPosition.sub(positionWorld)))), 1);
    ours.push(col, cm);
    for (const p of guardians) {
      const m = new THREE.Mesh(col, cm);
      m.position.copy(p);
      g.add(m);
      windows.push([m, 225, 420]);
      solids.push({ x: p.x, z: p.z, r: 1.2, h: 16 });
    }
    for (const p of husks) solids.push({ x: p.x, z: p.z, r: 0.8, h: 4 });
    // round each husk, a slow spiral drawing the motes in and dimming them: the light drunk
    const per = Math.round(160 * fewer);
    const sp = pointCloud(per * husks.length, 0.09);
    husks.forEach((h, j) => {
      for (let i = 0; i < per; i++) {
        sp.pos.set([h.x, h.y + 0.5, h.z], (j * per + i) * 3);
        sp.k.set([R(), R(), R(), R()], (j * per + i) * 4);
      }
    });
    touch(sp.cloud);
    const K = sp.cloud.nodes.aK;
    const life = fract(K.x.add(t.mul(float(0.035).add(K.y.mul(0.02)))));
    const r = float(1).sub(life).mul(float(5).add(K.z.mul(4))).add(0.3);
    const a = K.w.mul(6.283).add(life.mul(9));
    const y = float(0.5).add(K.y.mul(4)).add(life.mul(1.5));
    sp.material.positionNode = sp.cloud.nodes.position.add(vec3(cos(a).mul(r), y, sin(a).mul(r)));
    // bright where they are taken from the air, dimming as they are drawn in
    sp.material.colorNode = vec4(vec3(0.95, 0.9, 1.0).mul(sp.round).mul(pow(float(1).sub(life), 1.6)).mul(uWar.mul(0.6).add(0.3)), 1);
    g.add(sp.cloud.sprite);
    windows.push([sp.cloud.sprite, 225, 420]);
    ours.push(sp.material);
    // the arms of thought: arcs of light across the vale, both ways, pulses running along them
    const arcs: number[] = [];
    for (let i = 0; i < 9; i++) {
      const a0 = guardians[i % guardians.length].clone().setY(guardians[i % guardians.length].y + 9 + R() * 6);
      const b0 = husks[(i * 3) % husks.length].clone().setY(husks[(i * 3) % husks.length].y + 3 + R() * 2);
      const lift = 3 + R() * 4;
      const segs = 28;
      for (let k = 0; k < segs; k++) {
        const u0 = k / segs, u1 = (k + 1) / segs;
        const p0 = a0.clone().lerp(b0, u0), p1 = a0.clone().lerp(b0, u1);
        p0.y += Math.sin(u0 * Math.PI) * lift;
        p1.y += Math.sin(u1 * Math.PI) * lift;
        arcs.push(p0.x, p0.y, p0.z, p1.x, p1.y, p1.z);
      }
    }
    const ag = ribbonGeometry(arcs);
    const PG = T.positionGeometry;
    const pulse = pow(sin(PG.x.mul(0.25).sub(t.mul(1.4)).add(PG.z.mul(0.05))).mul(0.5).add(0.5), 8);
    // gold where they leave the guardians, colder toward the husks
    const warm = smoothstep(VALE.x + 14, VALE.x - 14, PG.x);
    const am = keepAlpha(ribbonMaterial(mix(vec3(0.7, 0.75, 1.0), vec3(1, 0.8, 0.5), warm).mul(pulse.mul(0.6).add(0.06)).mul(uWar.mul(0.35).add(0.12)), 0.45));
    const amesh = new THREE.Mesh(ag, am);
    amesh.frustumCulled = false;
    g.add(amesh);
    windows.push([amesh, 225, 420]);
    ours.push(ag, am);
  }

  /* ---------------- the mirror: the old world, turning, unseeing ---------------- */
  {
    const geo = new THREE.SphereGeometry(EARTH_R, 96, 64);
    const m = new THREE.MeshBasicNodeMaterial({ fog: false });
    const nrm = normalize(T.positionGeometry);
    // turning slowly: continents and seas, ice at the poles, weather moving over it
    const ang = t.mul(0.012);
    const q = vec3(nrm.x.mul(cos(ang)).sub(nrm.z.mul(sin(ang))), nrm.y, nrm.x.mul(sin(ang)).add(nrm.z.mul(cos(ang))));
    // land in many shapes (two scales of noise, coasts ragged), deep seas shading to shallows
    // at the coasts, ice at the poles, weather moving over it in its own slow drift
    const lf = fbmN(q.mul(3.1).add(vec3(3, 1, 7))).mul(0.75).add(fbmN(q.mul(9.5)).mul(0.25));
    const land = smoothstep(0.53, 0.545, lf);
    const coast = smoothstep(0.47, 0.53, lf).mul(float(1).sub(land));
    const relief = fbmN(q.mul(14));
    const green = mix(mix(vec3(0.03, 0.09, 0.035), vec3(0.09, 0.12, 0.05), relief), vec3(0.2, 0.17, 0.1), smoothstep(0.6, 0.8, fbmN(q.mul(5).add(9))));
    const sea = mix(vec3(0.004, 0.02, 0.06), vec3(0.02, 0.09, 0.16), coast);
    const ice = smoothstep(0.84, 0.92, abs(nrm.y).add(fbmN(q.mul(8)).mul(0.06)));
    const cloudQ = vec3(nrm.x.mul(cos(ang.mul(1.6))).sub(nrm.z.mul(sin(ang.mul(1.6)))), nrm.y, nrm.x.mul(sin(ang.mul(1.6))).add(nrm.z.mul(cos(ang.mul(1.6)))));
    const clouds = smoothstep(0.55, 0.8, fbmN(cloudQ.mul(vec3(5, 9, 5)).add(vec3(t.mul(0.004), 0, 0)))).mul(0.8);
    const sun = normalize(vec3(-0.6, 0.35, 0.7));
    const lit = smoothstep(-0.12, 0.45, T.dot(nrm, sun));
    let col: N = mix(sea, green, land);
    col = mix(col, vec3(0.7, 0.75, 0.8), ice);
    col = mix(col, vec3(0.8, 0.82, 0.86), clouds);
    const view = normalize(cameraPosition.sub(positionWorld));
    const nv = max(0, T.dot(normalize(T.normalWorld), view));
    const rim = pow(float(1).sub(nv), 4);
    // the sun's small glint on the seas
    const glint = pow(max(0, T.dot(normalize(view.add(sun)), nrm)), 60).mul(float(1).sub(land)).mul(float(1).sub(clouds));
    m.colorNode = vec4(col.mul(lit.mul(0.85).add(0.02)).add(vec3(0.6, 0.6, 0.5).mul(glint).mul(0.5)).add(vec3(0.2, 0.42, 0.95).mul(rim).mul(lit.mul(0.8).add(0.15)).mul(0.6)), 1);
    const earth = new THREE.Mesh(geo, m);
    earth.position.copy(EARTH);
    // where the camera looks, for the threads that withdraw from the gaze
    earth.onBeforeRender = (_r, _s, cam) => cam.getWorldDirection(uGaze.value);
    g.add(earth);
    windows.push([earth, 230, 1e9]);
    ours.push(geo, m);
    // the threads: gold and shadow, coming down from far above toward it, fading before they
    // touch; the shadow ones withdraw wherever you look straight at them
    for (const shadow of [false, true]) {
      const segs: number[] = [];
      for (let i = 0; i < 9; i++) {
        const a = R() * Math.PI * 2, rr = EARTH_R * (0.3 + R() * 0.7);
        const end = EARTH.clone().add(new V3(Math.cos(a) * rr, EARTH_R + 4, Math.sin(a) * rr * 0.5));
        const top = end.clone().add(new V3((R() - 0.5) * 30, 70 + R() * 30, (R() - 0.5) * 30 - 20));
        const sw = (R() - 0.5) * 8;
        for (let k = 0; k < 24; k++) {
          const u0 = k / 24, u1 = (k + 1) / 24;
          const p0 = top.clone().lerp(end, u0), p1 = top.clone().lerp(end, u1);
          p0.x += Math.sin(u0 * Math.PI * 2) * sw;
          p1.x += Math.sin(u1 * Math.PI * 2) * sw;
          segs.push(p0.x, p0.y, p0.z, p1.x, p1.y, p1.z);
        }
      }
      const tg = ribbonGeometry(segs);
      const PG = T.positionGeometry;
      // fading out toward the world: they never touch it
      const toEarth = length(PG.add(vec3(0, 0, 0)).sub(vec3(EARTH.x, EARTH.y, EARTH.z)));
      const fadeEnd = smoothstep(EARTH_R + 4, EARTH_R + 22, toEarth);
      const flow = pow(fract(PG.y.mul(0.05).add(t.mul(shadow ? -0.12 : 0.08))), 6).mul(0.6).add(0.4);
      let c: N = shadow ? vec3(0.3, 0.26, 0.42) : vec3(1, 0.82, 0.5);
      c = c.mul(fadeEnd).mul(flow).mul(shadow ? 0.55 : 0.5);
      if (shadow) {
        // the whisperer withdraws: dissolving where the gaze falls straight on it
        const dirTo = normalize(positionWorld.sub(cameraPosition));
        const looked = smoothstep(0.93, 0.985, T.dot(dirTo, uGaze));
        c = c.mul(float(1).sub(looked));
      }
      const tm = keepAlpha(ribbonMaterial(c, 0.5));
      const mesh = new THREE.Mesh(tg, tm);
      mesh.frustumCulled = false;
      g.add(mesh);
      windows.push([mesh, 260, 1e9]);
      ours.push(tg, tm);
    }
  }

  /* ---------------- the laying down: swords of light laid in a ring ---------------- */
  {
    const segs: number[] = [];
    const sword = (cx: number, cz: number, a: number, len: number) => {
      const y = veilFloor(cx, cz) + 0.06;
      const ux = Math.sin(a), uz = Math.cos(a), vx = Math.cos(a), vz = -Math.sin(a);
      const P = (u: number, v: number): [number, number, number] => [cx + ux * u + vx * v, y, cz + uz * u + vz * v];
      const line = (pts: [number, number][]) => {
        for (let k = 0; k < pts.length - 1; k++) segs.push(...P(pts[k][0], pts[k][1]), ...P(pts[k + 1][0], pts[k + 1][1]));
      };
      // blade (a long narrow leaf, its point outward), the guard, the grip, the pommel
      line([[0.35, -0.06], [len * 0.9, -0.05], [len, 0], [len * 0.9, 0.05], [0.35, 0.06]]);
      line([[0.35 + 0.05, 0], [len * 0.86, 0]]);
      line([[0.35, -0.28], [0.35, 0.28]]);
      line([[0.35, -0.04], [0.02, -0.04]]);
      line([[0.35, 0.04], [0.02, 0.04]]);
      const r = 0.06;
      line(Array.from({ length: 9 }, (_, k) => [-0.04 + Math.cos((k / 8) * Math.PI * 2) * r, Math.sin((k / 8) * Math.PI * 2) * r] as [number, number]));
    };
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      sword(GLADE.x + Math.sin(a) * 2.6, GLADE.z + Math.cos(a) * 2.6, a, 1.35);
    }
    const sg = ribbonGeometry(segs);
    const PG = T.positionGeometry;
    // dim, and half dissolved: the light breaks up along them, more as they are laid down
    const crumb = smoothstep(0.25, 0.75, vnoise(PG.xz.mul(4.5)).add(uLaid.mul(0.25)));
    const sm = keepAlpha(ribbonMaterial(vec3(1, 0.82, 0.5).mul(float(1).sub(crumb)).mul(float(0.55).sub(uLaid.mul(0.3))).mul(sin(t.mul(0.5)).mul(0.08).add(0.92)), 0.6));
    const mesh = new THREE.Mesh(sg, sm);
    mesh.frustumCulled = false;
    g.add(mesh);
    windows.push([mesh, 300, 1e9]);
    ours.push(sg, sm);
    // a few motes rising from them, as they go
    const n = 140;
    const c = pointCloud(n, 0.06);
    for (let i = 0; i < n; i++) {
      const a = R() * Math.PI * 2, r = 1.4 + R() * 2.4;
      const x = GLADE.x + Math.sin(a) * r, z = GLADE.z + Math.cos(a) * r;
      c.pos.set([x, veilFloor(x, z), z], i * 3);
      c.k.set([R(), R(), R(), R()], i * 4);
    }
    touch(c.cloud);
    const K = c.cloud.nodes.aK;
    const life = fract(K.x.add(t.mul(float(0.05).add(K.y.mul(0.04)))));
    c.material.positionNode = c.cloud.nodes.position.add(vec3(sin(life.mul(5).add(K.z.mul(20))).mul(0.2), life.mul(3.5), cos(life.mul(4).add(K.w.mul(20))).mul(0.2)));
    c.material.colorNode = vec4(vec3(1, 0.82, 0.5).mul(c.round).mul(float(1).sub(life)).mul(smoothstep(0, 0.1, life)).mul(0.7), 1);
    g.add(c.cloud.sprite);
    windows.push([c.cloud.sprite, 300, 1e9]);
    ours.push(c.material);
  }

  /* ---------------- the angel and its seven places ---------------- */
  const [ax0, az0] = along(6);
  const angel = new Angel(ax0 + 1.4, veilFloor(ax0 + 1.4, az0), az0, 0);
  g.add(angel.root);
  const loaded = Promise.all([angel.loaded, newcomers.loaded, husksFolk.loaded]).then(() => undefined);

  let beat = 0; // index into BEATS of the next place
  let speaking = false;
  let spokeFor = 0;
  let ended = false;
  let progress = 0;
  const local = new V3();
  const keyOff = new V3(40, 60, 30);

  const room = {
    name: "afterVeil",
    seatPos: null,
    seatHeading: 0,
    nearSeat: () => false,
    onSit: () => undefined,
    onStand: () => undefined,
    loaded,
    solids: () => solids,
    /** The place the angel is speaking of (room frame): what the view holds while it speaks. */
    centre: (): THREE.Vector3 => {
      const n = BEATS[Math.min(beat, BEATS.length - 1)].n;
      if (n === 2) return angel.root.position.clone().add(new V3(0, 1.4, 0));
      if (n === 3) return CLEARING.clone().setY(veilFloor(CLEARING.x, CLEARING.z) + 3);
      if (n === 4) return NEWCOMERS.clone().setY(veilFloor(NEWCOMERS.x, NEWCOMERS.z) + 1.2);
      if (n === 5) return VALE.clone().setY(veilFloor(VALE.x, VALE.z) + 6);
      if (n === 6) return EARTH.clone();
      return GLADE.clone().setY(veilFloor(GLADE.x, GLADE.z) + 0.5);
    },
    update(dt: number) {
      clock.tick(dt);
      const visitor = gpuUniforms.player.value as THREE.Vector3;
      local.copy(visitor).sub(g.position);
      const o = onPath(local.x, local.z);
      progress = Math.max(progress, o.s);
      uProg.value = damp(uProg.value as number, progress, 0.8, dt);
      applyAir(airAt(uProg.value as number));
      key.target.position.set(visitor.x, visitor.y, visitor.z);
      key.position.copy(key.target.position).add(keyOff);
      // the moods of each place, eased as their beats are spoken
      const nowN = BEATS[Math.min(beat, BEATS.length - 1)].n;
      uLove.value = damp(uLove.value as number, (speaking && nowN === 3) || beat > 1 ? 1 : 0, 0.4, dt);
      uWar.value = damp(uWar.value as number, (speaking && nowN === 5) || beat > 3 ? 1 : 0.4, 0.4, dt);
      uLaid.value = damp(uLaid.value as number, ended ? 1 : speaking && nowN === 7 ? 0.5 : 0, 0.15, dt);
      // the husks move a little against the flow: their stillness plays backward
      husksFolk.update(-dt * 0.5);
      newcomers.update(dt * 0.6);
      for (const sd of shardsU.list) {
        sd.a += sd.w * dt;
        sd.m.position.set(sd.c.x + Math.cos(sd.a) * sd.r, sd.c.y + sd.y + Math.sin(sd.a * 1.7) * 0.05, sd.c.z + Math.sin(sd.a) * sd.r);
        sd.m.rotation.set(sd.a * 0.7, sd.a, sd.a * 0.4);
      }
      // the angel: a little ahead along the way, waiting at its next place until you come;
      // there it turns to you and speaks, and when its line has ended it goes on
      if (beat < BEATS.length) {
        const b = BEATS[beat];
        if (!speaking && progress >= b.s - 3) {
          speaking = true;
          spokeFor = 0;
          void narration.play(VEIL_TRACK(b.n));
        }
        if (speaking) {
          spokeFor += dt;
          angel.look = local;
          // its line has ended (while paused it is still speaking)
          if (spokeFor > 2 && !narration.progress()) {
            speaking = false;
            beat++;
            if (b.n === 7) {
              // the last line: it gestures toward the way home, and comes apart into motes
              ended = true;
              angel.look = new V3(VEIL_EXIT.x, 0, VEIL_EXIT.z);
              angel.gesture(4);
              window.setTimeout(() => angel.disperse(), 3800);
            }
          }
        } else {
          angel.look = null;
          const [gx, gz] = along(Math.min(o.s + 5.5, b.s + 2.5));
          angel.goal.set(gx + 1.2, 0, gz); // a little aside of the way, never on it (the room's frame)
        }
      }
      angel.update(dt, clock.u.value as number, veilFloor, local, false);
      // what is far along the way rests until you come near it (its lines would cross the sky)
      const pr = uProg.value as number;
      for (const [o, a, b] of windows) o.visible = pr > a && pr < b;
    },
    dispose() {
      g.parent?.remove(g);
      for (const x of ours) x.dispose();
    },
    /** Still frames: stand at beat `n`'s place as it is spoken (room frame: where to stand, where to look). */
    debugPlace(n: number): { at: THREE.Vector3; look: THREE.Vector3 } {
      const i = Math.max(0, BEATS.findIndex((b) => b.n === n));
      beat = i;
      speaking = true;
      spokeFor = -1e9; // held speaking for the still
      progress = BEATS[i].s;
      uProg.value = progress;
      uLove.value = n >= 3 ? 1 : 0;
      uWar.value = n >= 5 ? 1 : 0.4;
      uLaid.value = n === 7 ? 0.5 : 0;
      for (const [o, a, b] of windows) o.visible = progress > a && progress < b;
      const [x, z] = along(BEATS[i].s);
      const [ax, az] = along(BEATS[i].s + 2.5);
      angel.root.position.set(ax + 1.2, veilFloor(ax + 1.2, az), az);
      angel.goal.copy(angel.root.position);
      const at = new V3(x, veilFloor(x, z), z);
      const c = room.centre();
      return { at, look: c };
    },
  };
  void whisper;
  return room as unknown as Room;
}

export { PATH_LEN, onPath as veilOnPath };
