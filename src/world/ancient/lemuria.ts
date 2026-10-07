/* Mu, the drowned land of Lemuria (the owner's brief, SPEC 3; the telling `LEMURIA`, Aria,
   246.84 s): peace, the oldest and gentlest of the three. Where Atlantis aches and the Maya city
   wonders, Mu rests; the relief after the warning. Nothing here is cut square: the stone looks
   grown, and the sea has adopted it rather than conquered it.
   - The circle of the elders: nine tall smooth stones, rounded like river pebbles stood on end,
     about a shallow hollow of sand and shells (a cold hearth) whose sand slowly turns in a spiral
     (the listening).
   - Rounded platforms: low weathered pebbles of stone, broad enough to stand on.
   - Garden terraces: broad shallow curved steps up one side, swaying sea-gardens on them in muted
     greens and golds (tended, not wild).
   - Coral fused with the stone: branching growths in soft ochre, rose and sand rising out of the
     stones' tops and shoulders, the line between them unclear.
   - The star stones: three tall stones, each pierced near its top by a round sight-hole and
     notched at its crown, set on an arc so their holes look up toward the light above.
   - Dwelling mounds: low half-buried domes, each with a dark oval doorway (no inside: the openings
     are quiet mouths).
   - Light: the warmest of the three, golden-green, soft shafts breathing.
   - Life: dense small fish. (No turtles or jellyfish: there are no models for them, and the house
     rule is real models or nothing.)
   - Elders: shorter, rounder, in earth and sea tones, the most still of all: two sitting at the
     circle (one raising a hand a while on a long loop), one tending a terrace (kneeling, rising,
     kneeling). Near, they turn their heads to you; they never come toward you. */
import * as THREE from "three/webgpu";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { T, outOfTheWay, type N } from "../../gpu/tsl";
import { heightAt, SPAWN, standHooks, type Collider } from "../terrain";
import type { RuinSite } from "../depths";
import { Keeper, Merge, place, rng, seaStone, shafts, solidRound, Swimmers } from "./kit";
import type { Area } from "./index";

const { atan, float, length, mix, positionGeometry, positionWorld, sin, smoothstep, uniform, uv, vec3, vec4 } = T;
const V3 = THREE.Vector3;

/** A pebble of stone: a sphere squashed to `w` × `h` × `d`, its surface softly uneven. */
function pebble(w: number, h: number, d: number, R: () => number, bump = 0.08): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(1, 28, 18);
  const p = g.attributes.position as THREE.BufferAttribute;
  const s1 = R() * 10, s2 = R() * 10;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const k = 1 + Math.sin(x * 3.1 + s1) * Math.cos(z * 2.7 + s2) * bump + Math.sin(y * 4.3 + s1 + z * 2) * bump * 0.5;
    p.setXYZ(i, x * w * k, y * h * k, z * d * k);
  }
  g.computeVertexNormals();
  return g;
}

/** A standing stone grown smooth: a lathe like an egg on end, `r` at its widest, `h` tall. */
function eggStone(r: number, h: number, seg = 24): THREE.BufferGeometry {
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i <= 18; i++) {
    const t = i / 18, y = t * h;
    const rr = r * Math.pow(Math.sin(Math.PI * Math.min(1, t * 0.92 + 0.08)), 0.7) * (1 - t * 0.25);
    pts.push(new THREE.Vector2(Math.max(0.02, rr), y));
  }
  return new THREE.LatheGeometry(pts, seg);
}

/** Coral: a few branching tubes curling up from a point, each ending in a soft knob. */
function coral(R: () => number, size: number): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const branch = (o: THREE.Vector3, dir: THREE.Vector3, len: number, r: number, depth: number) => {
    const pts = [o.clone()];
    const d = dir.clone();
    let q = o.clone();
    for (let k = 0; k < 4; k++) {
      d.add(new V3((R() - 0.5) * 0.5, 0.25, (R() - 0.5) * 0.5)).normalize();
      q = q.clone().addScaledVector(d, len / 4);
      pts.push(q);
    }
    parts.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 8, r, 6, false));
    const knob = new THREE.SphereGeometry(r * 1.4, 8, 6);
    knob.translate(q.x, q.y, q.z);
    parts.push(knob);
    if (depth > 0) for (let b = 0; b < 2; b++) branch(pts[2 + b], d.clone().add(new V3((R() - 0.5) * 1.4, 0.2, (R() - 0.5) * 1.4)).normalize(), len * 0.65, r * 0.7, depth - 1);
  };
  for (let i = 0; i < 3; i++) branch(new V3((R() - 0.5) * 0.3 * size, 0, (R() - 0.5) * 0.3 * size), new V3((R() - 0.5) * 0.6, 1, (R() - 0.5) * 0.6).normalize(), size, 0.07 * size, 2);
  return mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)).map((g) => {
    for (const a of Object.keys(g.attributes)) if (a !== "position" && a !== "normal") g.deleteAttribute(a);
    return g;
  }));
}

export function buildLemuria(site: RuinSite): Area {
  const uT = uniform(0);
  const group = new THREE.Group();
  const face = Math.atan2(SPAWN.x - site.x, SPAWN.z - site.z);
  group.position.set(site.x, site.y, site.z);
  group.rotation.y = face;
  const cs = Math.cos(face), sn = Math.sin(face);
  const W = (lx: number, lz: number): [number, number] => [site.x + lx * cs + lz * sn, site.z - lx * sn + lz * cs];
  const solids: Collider[] = [];
  const round = (lx: number, lz: number, r: number, top: number) => {
    const [x, z] = W(lx, lz);
    solidRound(x, z, r, site.y + top, solids);
  };
  const R = rng(5531);
  const warm: [number, number, number] = [0.85, 0.9, 0.55];
  const stone = seaStone({ set: "sandstone_cracks", tint: [1.08, 1.06, 0.94], caustic: float(0.22), causticCol: warm, sea: 1.2, growth: [0.32, 0.38, 0.16], lift: 0.14 }, uT);
  const pale = seaStone({ set: "sandstone_cracks", tint: [1.24, 1.2, 1.06], caustic: float(0.22), causticCol: warm, sea: 1.0, growth: [0.3, 0.36, 0.15], lift: 0.14 }, uT);
  const coralM = new THREE.MeshStandardNodeMaterial({ roughness: 0.85, metalness: 0 });
  {
    const nz = T.mx_noise_float(positionWorld.mul(0.9)).mul(0.5).add(0.5);
    const c = mix(mix(vec3(0.62, 0.36, 0.26), vec3(0.78, 0.6, 0.38), nz), vec3(0.7, 0.5, 0.5), smoothstep(0.6, 0.9, nz));
    const grain = T.mx_noise_float(positionWorld.mul(9)).mul(0.12).add(0.94);
    coralM.colorNode = vec4(c.mul(grain), 1);
    coralM.emissiveNode = c.mul(0.12);
  }
  const mg = new Merge<"stone" | "pale" | "coral" | "dark">();
  const raisedAt: { lx: number; lz: number; r: number; h: number }[] = [];

  // the circle of the elders: nine stones grown smooth, about a hollow of sand and shells
  const CIRCLE = 9.5;
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + 0.2, lx = Math.cos(a) * CIRCLE, lz = Math.sin(a) * CIRCLE;
    const h = 3.6 + R() * 1.8, r = 0.75 + R() * 0.25;
    mg.add("pale", eggStone(r, h), place(lx, -0.3, lz, R() * 6, 1, 1, 0.75, (R() - 0.5) * 0.08, (R() - 0.5) * 0.08));
    round(lx, lz, r * 0.85, h);
    if (i % 2 === 1) mg.add("coral", coral(R, 1.2 + R() * 0.6), place(lx + (R() - 0.5) * 0.4, h - 0.7, lz, R() * 6));
  }
  // shells in the hollow
  const shell = new THREE.SphereGeometry(0.12, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2);
  shell.scale(1, 0.5, 1.3);
  for (let i = 0; i < 40; i++) {
    const a = R() * Math.PI * 2, r = Math.sqrt(R()) * 3.2;
    mg.add("pale", shell, place(Math.cos(a) * r, -0.12, Math.sin(a) * r, R() * 6, 0.7 + R() * 0.8));
  }
  // the hollow's sand, turning slowly in a spiral (the listening)
  const hollow = new THREE.Mesh(new THREE.CircleGeometry(3.8, 64), spiralSand(uT));
  hollow.rotation.x = -Math.PI / 2;
  hollow.position.set(0, 0.04, 0);
  hollow.renderOrder = 1;
  group.add(hollow);

  // rounded platforms, broad enough to stand on
  for (const [lx, lz, w, h] of [[16, 8, 4.5, 1.1], [-15, 10, 5.5, 1.3], [12, -14, 3.8, 0.9], [-6, 19, 4.2, 1.0]] as const) {
    mg.add("stone", pebble(w, h, w * 0.85, R, 0.05), place(lx, -0.1, lz, R() * 6));
    raisedAt.push({ lx, lz, r: w * 0.8, h: h * 0.95 });
    for (let k = 0; k < 3; k++) mg.add("coral", coral(R, 1.1 + R() * 0.6), place(lx + (R() - 0.5) * w * 1.2, h * 0.75, lz + (R() - 0.5) * w * 0.9, R() * 6));
  }

  // the garden terraces: broad shallow curved steps up the far side (−z), sea-gardens on them
  const TERR_C = new V3(0, 0, -32);
  const gardenSpots: [number, number, number][] = [];
  for (let k = 0; k < 4; k++) {
    const r0 = 13 - k * 3, r1 = 16 - k * 3, top = 0.45 + k * 0.5;
    // outer foot first, so the faces turn outward and up
    const pts = [new THREE.Vector2(r1 + 0.4, 0), new THREE.Vector2(r1, top - 0.25), new THREE.Vector2(r1 - 0.4, top + 0.06), new THREE.Vector2(r0, top), new THREE.Vector2(r0 + 0.3, 0)];
    // an arc on the circle's side of its centre (phi 0 is +z), so you climb away from the circle
    const g = new THREE.LatheGeometry(pts, 48, -Math.PI * 0.32, Math.PI * 0.64);
    mg.add("stone", g, place(TERR_C.x, -0.25, TERR_C.z));
    for (let j = 0; j < 26; j++) {
      const a = -Math.PI * 0.3 + (j / 25) * Math.PI * 0.6, r = (r0 + r1) / 2 + (R() - 0.5) * 1.6;
      gardenSpots.push([TERR_C.x + Math.sin(a) * r, top - 0.25, TERR_C.z + Math.cos(a) * r]);
    }
  }
  raisedAt.push({ lx: TERR_C.x, lz: TERR_C.z, r: 15.5, h: 0.45 });
  const garden = seaGarden(gardenSpots, uT, R);
  group.add(garden);

  // the star stones: tall, pierced near the top by a round sight-hole, notched at the crown
  for (let i = 0; i < 3; i++) {
    const a = -0.9 + i * 0.9, lx = Math.sin(a) * 21, lz = -Math.cos(a) * 21 + 6;
    const h = 5.2 + i * 0.4;
    const slab = new THREE.Shape();
    slab.moveTo(-0.85, 0);
    slab.lineTo(0.85, 0);
    slab.quadraticCurveTo(0.95, h * 0.6, 0.55, h);
    slab.lineTo(0.12, h - 0.1); // the notch at its crown
    slab.lineTo(0, h - 0.45);
    slab.lineTo(-0.12, h - 0.1);
    slab.lineTo(-0.55, h);
    slab.quadraticCurveTo(-0.95, h * 0.6, -0.85, 0);
    const hole = new THREE.Path();
    hole.absarc(0, h - 1.4, 0.32, 0, Math.PI * 2, true);
    slab.holes.push(hole);
    const g = new THREE.ExtrudeGeometry(slab, { depth: 0.55, bevelEnabled: true, bevelSize: 0.12, bevelThickness: 0.12, bevelSegments: 3, curveSegments: 16 });
    g.translate(0, 0, -0.27);
    // tipped back so the hole looks up toward the light above
    mg.add("pale", g, place(lx, -0.3, lz, -a, 1, 1, 1, -0.32, 0));
    round(lx, lz, 0.8, h);
  }

  // the dwelling mounds: low domes half buried, each with a dark oval doorway
  // the doorway: a dark oval set into the dome's skin (a flattened ovoid, its face just proud of
  // the surface, so from any side it reads as an opening, never a fin)
  const doorG = new THREE.SphereGeometry(1, 20, 12);
  doorG.scale(0.5, 0.78, 0.22);
  for (const [lx, lz, r] of [[24, 18, 3.6], [28, 4, 3.0], [-24, 22, 3.4], [-29, 6, 2.8], [20, 30, 2.6]] as const) {
    mg.add("stone", pebble(r, r * 0.62, r, R, 0.04), place(lx, -0.6, lz, R() * 6));
    // the doorway, facing the circle
    const a = Math.atan2(-lx, -lz);
    // on the dome's surface, at the height of the door's middle (the dome is r × 0.62r, sunk 0.6 m)
    const hy = 0.75, k = (hy + 0.6) / (r * 0.62), sr = r * Math.sqrt(Math.max(0.05, 1 - k * k)) - 0.1;
    const dx = lx + Math.sin(a) * sr, dz = lz + Math.cos(a) * sr;
    mg.add("dark", doorG, place(dx, hy, dz, a, 1, 1, 1, -Math.asin(Math.min(0.9, k)) * 0.8, 0));
    round(lx, lz, r * 0.85, r * 0.55);
    for (let q = 0; q < 2; q++) mg.add("coral", coral(R, 1.3 + R() * 0.6), place(lx + (R() - 0.5) * r, r * 0.42, lz + (R() - 0.5) * r * 0.6 - Math.cos(a) * r * 0.3, R() * 6));
  }
  const dark = new THREE.MeshBasicNodeMaterial({ side: THREE.DoubleSide });
  dark.colorNode = vec4(0.01, 0.015, 0.012, 1);
  group.add(mg.build({ stone, pale, coral: coralM, dark }));

  // you can stand on the platforms and the terraces
  standHooks.push((x, z) => {
    const dx = x - site.x, dz = z - site.z;
    if (dx * dx + dz * dz > 60 * 60) return -Infinity;
    const lx = dx * cs - dz * sn, lz = dx * sn + dz * cs;
    let h = -Infinity;
    for (const p of raisedAt) {
      const d = Math.hypot(lx - p.lx, lz - p.lz);
      if (p.r === 15.5) {
        // the terraces: steps by radius, on their arc only
        const r = d, ang = Math.atan2(lx - p.lx, lz - p.lz);
        if (Math.abs(ang) < Math.PI * 0.32 && r > 4 && r < 16) h = Math.max(h, site.y + 0.45 + Math.floor((16 - r) / 3) * 0.5 - 0.25);
      } else if (d < p.r) h = Math.max(h, site.y - 0.1 + p.h * Math.sqrt(1 - (d / p.r) * (d / p.r)));
    }
    return h;
  });

  // warm soft shafts, breathing
  const sh = [[0, 0, 4.2], [-8, -26, 3.2], [15, 8, 2.6], [-15, 10, 2.8], [24, 14, 2.4]].map(([lx, lz, r]) => {
    const [x, z] = W(lx, lz);
    return { x, z, y: site.y, r };
  });
  const light = shafts(sh, [1.0, 0.92, 0.62], float(0.85), uT);

  // the elders
  const tint: [number, number, number] = [0.95, 0.85, 0.55];
  const at = (lx: number, lz: number) => W(lx, lz);
  const [e1x, e1z] = at(Math.cos(0.9) * 6.4, Math.sin(0.9) * 6.4);
  const [e2x, e2z] = at(Math.cos(2.9) * 6.4, Math.sin(2.9) * 6.4);
  const [e3x, e3z] = at(0, -21.5);
  const toCentre = (x: number, z: number) => Math.atan2(-(site.x - x), -(site.z - z));
  const ground = (x: number, z: number) => heightAt(x, z);
  const keepers = [
    new Keeper({ recipe: "LEMURIAN_ELDER", tint, x: e1x, z: e1z, face: toCentre(e1x, e1z), pose: "sit", water: true, scale: 0.92, ground }),
    new Keeper({ recipe: "LEMURIAN_ELDER", tint, x: e2x, z: e2z, face: toCentre(e2x, e2z), pose: "bless", every: 80, water: true, scale: 0.92, ground }),
    new Keeper({ recipe: "LEMURIAN_ELDER", tint: [0.8, 0.9, 0.55], x: e3x, z: e3z, y: site.y + 0.95, face: face + Math.PI, pose: "kneel", every: 60, water: true, scale: 0.9 }),
  ];
  const keeperGroup = new THREE.Group();
  for (const k of keepers) keeperGroup.add(k.root);

  // abundance: dense small fish round the circle and the terraces
  const [tx, tz] = W(0, -26);
  const swim = new Swimmers([
    { file: "fish3", length: 0.32, tint: [1.1, 1.0, 0.7], count: 16, cx: site.x, cz: site.z, rx: 13, rz: 13, y: 4, speed: 0.06, spread: 3 },
    { file: "fish1", length: 0.38, tint: [0.85, 1.05, 0.8], count: 14, cx: tx, cz: tz, rx: 10, rz: 6, y: 3, speed: -0.05, spread: 2.6, phase: 1 },
    { file: "fish2", length: 0.4, tint: [1.1, 0.9, 0.7], count: 12, cx: site.x, cz: site.z, rx: 26, rz: 22, y: 6, speed: 0.035, spread: 3, phase: 2.2 },
  ]);

  const world = new THREE.Group();
  world.add(group, light, keeperGroup, swim.group);
  return {
    id: "lemuria",
    track: "LEMURIA",
    site,
    radius: 48,
    group: world,
    solids,
    water: { tint: [1.22, 1.2, 0.8], shaft: 1.5, shaftCol: [0.78, 0.74, 0.42] },
    loaded: Promise.all(keepers.map((k) => k.loaded)).then(() => undefined),
    update(dt: number, t: number, visitor: THREE.Vector3, reduced: boolean) {
      uT.value = reduced ? t * 0.5 : t;
      for (const k of keepers) k.update(dt, t, visitor, reduced);
      swim.update(dt, reduced ? t * 0.5 : t);
    },
  };
}

/** The hollow's sand: fine rings drawn slowly inward in a spiral, darker in their troughs; only a
    soft shading over the floor, fading at the edge. */
function spiralSand(uT: N): THREE.MeshBasicNodeMaterial {
  const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
  const q = uv().sub(0.5).mul(2), r = length(q), a = atan(q.y, q.x);
  // many fine arms, like sand combed by a slow turning current (never one drawn spiral)
  const arm = sin(r.mul(26).add(a.mul(7)).add(uT.mul(0.25))).mul(0.7).add(sin(r.mul(41).sub(a.mul(5)).add(uT.mul(0.17))).mul(0.3));
  const crest = smoothstep(0.55, 1, arm), trough = smoothstep(-0.4, -1, arm);
  const edge = smoothstep(1, 0.7, r).mul(smoothstep(0.02, 0.12, r));
  m.colorNode = vec4(mix(vec3(0.03, 0.03, 0.02), vec3(0.9, 0.85, 0.62), crest), crest.mul(0.045).add(trough.mul(0.04)).mul(edge));
  return m;
}

/** Sea-gardens: tall soft blades in muted greens and golds, swaying slowly in the current, each
    its own time (one draw). */
function seaGarden(spots: [number, number, number][], uT: N, R: () => number): THREE.Mesh {
  // a blade: narrowing to its tip and curving a little over, as kelp and sea-grass do
  const blade = new THREE.PlaneGeometry(0.16, 1, 1, 8);
  blade.translate(0, 0.5, 0);
  {
    const bp = blade.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < bp.count; i++) {
      const y = bp.getY(i);
      bp.setX(i, bp.getX(i) * (1 - y * 0.85));
      bp.setZ(i, y * y * 0.25);
    }
    blade.computeVertexNormals();
  }
  const parts: THREE.BufferGeometry[] = [];
  for (const [x, y, z] of spots)
    for (let k = 0; k < 6; k++) {
      const g = blade.clone();
      const h = 0.7 + R() * 1.1;
      g.applyMatrix4(place(x + (R() - 0.5) * 0.9, y, z + (R() - 0.5) * 0.9, R() * Math.PI, 1, h, 1));
      const ph = new Float32Array(g.attributes.position.count).fill(R() * 6.28);
      g.setAttribute("aPh", new THREE.BufferAttribute(ph, 1));
      parts.push(g);
    }
  const geo = mergeGeometries(parts);
  const m = new THREE.MeshStandardNodeMaterial({ side: THREE.DoubleSide, roughness: 0.9, metalness: 0 });
  const ph = T.attribute("aPh", "float");
  const p = positionGeometry;
  // the higher along the blade, the more it leans with the current (a slow sway, its own phase)
  const sway = sin(uT.mul(0.6).add(ph)).mul(0.25).add(sin(uT.mul(1.3).add(ph.mul(2))).mul(0.08));
  m.positionNode = p.add(vec3(sway, 0, sway.mul(0.6)).mul(T.uv().y.mul(T.uv().y)));
  const c = mix(vec3(0.16, 0.3, 0.12), vec3(0.62, 0.55, 0.22), T.uv().y.mul(0.8).add(ph.mul(0.05)));
  m.colorNode = vec4(c, 1);
  m.emissiveNode = c.mul(0.18).mul(outOfTheWay(positionWorld));
  return new THREE.Mesh(geo, m);
}
