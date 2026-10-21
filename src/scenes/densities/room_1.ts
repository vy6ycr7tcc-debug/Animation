/* The first density: learning to be. The elemental world, and nothing else: black sand running
   down to an ocean that breathes, towers of basalt, a volcano pouring slow fire on the horizon
   (the right third of the view), storm clouds overhead that gather light but never break. No
   plant, no animal. Sparks of consciousness rest inside the stone; as the narration names them
   they wake, and then lean, barely, toward the light: the first dream of movement.
   When the narration names the elements at full voice, the young world shows its violence: a
   tsunami rises out at sea, rolls in and breaks over the black shore; the earth quakes; the ground
   tears open to the right of the path, magma glowing in the rift. Then it settles: the rift cools
   to a dark scar and the calm that follows is as it was.
   Ahead, down the one path of sand, the way on: a stone door whose frame has begun to grow living
   branches, light spilling through their leaves (the second density, waiting).
   Built as the other rooms are: a factory module at a temporary zero site (integration moves the
   group), its big moments timed to the narration's movements (the draft script, ~5½ min). */
import * as THREE from "three/webgpu";
import { LessonScene } from "../lessonKit";
import type { LessonCtx, LessonOpts, SceneModule } from "../lessonKit";
import { T, vnoise, hash2 } from "../../gpu/tsl";
import { etchedStone } from "../../world/etching";
import { barkMaterial, grow, SHAPES, tubes } from "../../world/creation";
import { fbm } from "../../world/terrain";
import { applyAir, scannedGround, boulderGeometry, damp, keepAlpha, pointCloud, roomClock, seeded, skyDome, spireGeometry, touch, type Air, roomPos } from "./roomKit";
import type { Solid } from "../journey";
import { ash, stormCeiling, volcano } from "./volcanic";

const {
  abs, cameraPosition, cameraViewMatrix, cos, exp, float, floor, fract, length, mix, normalize,
  positionGeometry, positionLocal, positionWorld, sin, smoothstep, step, uniform, uv, vec2, vec3, vec4,
} = T;

const sm = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Where things stand (room frame: the seat at the origin, facing −z). */
const VOLCANO = new THREE.Vector3(48, -2, -160);
const VOLCANO_H = 66;
const PORTAL = new THREE.Vector3(0, 0, -44);
const SHORE_X = -18; // the sand runs down into the sea west of here

/** The black sand: low dunes, the path kept smooth, falling away into the sea on the left. */
export function sandHeight(x: number, z: number): number {
  const dunes = (fbm(x * 0.028 + 3, z * 0.028 - 7) - 0.5) * 3.4 + (fbm(x * 0.11 - 5, z * 0.11 + 2) - 0.5) * 0.7;
  const path = sm(3, 9, Math.abs(x)); // the path down the middle stays level
  const shore = sm(SHORE_X + 4, SHORE_X - 16, x) * 5.5;
  return dunes * path * (1 - sm(SHORE_X, SHORE_X - 10, x)) - shore;
}

export function createDensityRoom1Scene(
  scene: THREE.Scene,
  narration: LessonCtx["narration"],
  whisper: (t: string, ms?: number) => void,
): SceneModule {
  // Temporary zero site; integration coordinates will be injected later.
  const S = { x: 0, z: 0, y: 0, heading: 0 };
  const seatPos = new THREE.Vector3(S.x, S.y, S.z);
  const heading = S.heading;

  const tickers: Array<(dt: number) => void> = [];
  const ours: Array<{ dispose(): void }> = [];
  /** What stands solid (the towers, the boulders, the living stone): the journey holds you out. */
  const solids: Solid[] = [];

  // the room's moods, eased toward the goals the beats set
  const clock = roomClock();
  const uSpark = uniform(0.12); // the sparks in the stone: asleep → awake
  const uLean = uniform(0); // … and leaning toward the light
  const uLava = uniform(1); // the volcano's pour (surges when the narration names it)
  const uSwell = uniform(1); // the ocean's breath
  const uStorm = uniform(1); // how often the clouds light from within
  const uPortal = uniform(0.35); // the door's light
  const goal = { spark: 0.12, lean: 0, lava: 1, swell: 1, storm: 1, portal: 0.35, heat: 0 };
  // the young world's violence (the owner: "tsunamis, earthquakes, the ground opening, then
  // complete calm"): each begins at its beat and runs on its own clock (real seconds)
  const uWaveX = uniform(SHORE_X - 160); // the tsunami's crest, coming in from the open sea
  const uWaveA = uniform(0); // … its height
  const uSurge = uniform(0); // the sea thrown up the beach as it breaks
  const uSpray = uniform(-1); // seconds since it broke (spray)
  const uOpen = uniform(0); // the rift: how far open
  const uHeat = uniform(0); // … how hot its magma
  const ev = { tsu: -1, quake: -1, rift: -1 };
  let now = 0;
  /* a still (`?shot=density-1&t=<s>&tau=<s>`) lives the room T seconds with every beat fired at
     once: `tau` holds the sequence that many seconds after the tsunami began (the others after it
     as their beats are spaced) */
  const tau = Number(new URLSearchParams(location.search).get("tau") ?? NaN);
  const dbg = (narration as unknown as { debugTime?: number | null }).debugTime;
  const start = (beat: number) => (Number.isFinite(tau) && dbg != null ? Math.max(200, Math.round(dbg / 0.05)) * 0.05 - tau + (beat - 112) : now);
  // the room's air: dark, clear enough to see the far fire, glowing ember toward the volcano
  const air: Air = {
    color: new THREE.Color(0.045, 0.04, 0.062),
    glow: new THREE.Color(0.42, 0.16, 0.07),
    glowDir: VOLCANO.clone().setY(10),
    density: 0.0021,
    shadow: new THREE.Color(0.004, 0.004, 0.018),
    sat: 1.05,
    contrast: 1.08,
  };

  const build = (ctx: LessonCtx) => {
    const g = ctx.group;
    const t = clock.u;
    const R = seeded(1107);

    /* ---------------- sky: a storm-dark dome, ember-lit low toward the volcano ---------------- */
    const sky = skyDome(
      420,
      new THREE.Color(0.075, 0.06, 0.1),
      new THREE.Color(0.012, 0.014, 0.034),
      { glowDir: VOLCANO.clone().setY(8), glow: new THREE.Color(0.55, 0.16, 0.05), glowPow: 5 },
    );
    g.add(sky.mesh);
    ours.push(sky);

    /* ---------------- the black sand ---------------- */
    {
      const geo = new THREE.PlaneGeometry(300, 300, 150, 150);
      geo.rotateX(-Math.PI / 2);
      const p = geo.attributes.position as THREE.BufferAttribute;
      const col = new Float32Array(p.count * 3);
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i), z = p.getZ(i);
        const h = sandHeight(x, z);
        p.setY(i, h);
        // black volcanic sand, streaked with ash; darker and wet toward the sea
        const ash = fbm(x * 0.06 + 11, z * 0.2 - 4);
        const wet = sm(SHORE_X + 2, SHORE_X - 6, x);
        const v = (0.007 + ash * 0.012) * (1 - wet * 0.4);
        col[i * 3] = v * 0.95;
        col[i * 3 + 1] = v * 0.93;
        col[i * 3 + 2] = v * 1.12;
      }
      geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
      geo.computeVertexNormals();
      const m = new THREE.MeshStandardNodeMaterial({ vertexColors: true, roughness: 0.93, metalness: 0 });
      // the sand's own grain and wind-laid streaks, so it never reads as one flat sheet
      const grain = vnoise(roomPos.xz.mul(2.2)).mul(0.5).add(vnoise(roomPos.xz.mul(vec2(0.35, 1.4))).mul(0.6)).add(0.45);
      // the coast-sand scan: its grain, ripples and pits, in the black of volcanic sand
      const scan = scannedGround("sand", 2.6, { hue: 0.15, relief: 1.8, bright: 2.0 });
      m.colorNode = T.vertexColor().rgb.mul(grain.mul(0.5).add(0.5)).mul(scan.color);
      m.normalNode = scan.normal;
      // glitter: grains of obsidian that catch the light as you move (near only)
      const cell = floor(roomPos.xz.mul(16));
      const view = normalize(cameraPosition.sub(positionWorld));
      const tw = hash2(cell.add(floor(view.xz.mul(20))));
      const near = float(1).sub(smoothstep(6, 26, length(cameraPosition.sub(positionWorld))));
      const dot_ = smoothstep(0.24, 0.0, length(fract(roomPos.xz.mul(16)).sub(0.5)));
      m.emissiveNode = vec3(1.0, 0.8, 0.6).mul(step(0.986, hash2(cell)).mul(step(0.55, tw)).mul(dot_).mul(near).mul(0.9));
      const mesh = new THREE.Mesh(geo, m);
      mesh.receiveShadow = true;
      g.add(mesh);
      ours.push(geo, m);
    }

    /* ---------------- the ocean that breathes ---------------- */
    {
      const geo = new THREE.PlaneGeometry(320, 340, 140, 140);
      geo.rotateX(-Math.PI / 2);
      geo.translate(SHORE_X - 150, 0, -60);
      const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.28, metalness: 0 });
      const P = positionGeometry;
      // three long swells, slow, from the open sea; the whole sea breathes in and out (~18 s)
      const breath = sin(t.mul(0.35)).mul(0.3).add(0.7).mul(uSwell);
      const w1 = P.x.mul(0.045).add(P.z.mul(0.012)).add(t.mul(0.42));
      const w2 = P.x.mul(0.07).sub(P.z.mul(0.05)).add(t.mul(0.61));
      const w3 = P.x.mul(0.16).add(P.z.mul(0.11)).add(t.mul(0.9));
      // the tsunami: one long crest, steeper on its landward face, and the sea thrown up the beach
      const cr = P.x.sub(uWaveX);
      const wid = mix(float(16), float(6), smoothstep(-1, 1, cr)); // steep in front, long behind
      const wave = exp(cr.mul(cr).div(wid.mul(wid)).negate()).mul(uWaveA);
      const surge = uSurge.mul(smoothstep(SHORE_X - 50, SHORE_X + 2, P.x));
      const h = sin(w1).mul(0.55).add(sin(w2).mul(0.28)).add(sin(w3).mul(0.09)).mul(breath).add(wave).add(surge);
      const dhdx = cos(w1).mul(0.55 * 0.045).add(cos(w2).mul(0.28 * 0.07)).add(cos(w3).mul(0.09 * 0.16)).mul(breath)
        .sub(cr.mul(2).div(wid.mul(wid)).mul(wave));
      const dhdz = cos(w1).mul(0.55 * 0.012).sub(cos(w2).mul(0.28 * 0.05)).add(cos(w3).mul(0.09 * 0.11)).mul(breath);
      m.positionNode = vec3(positionLocal.x, h.sub(0.35), positionLocal.z);
      const n = normalize(vec3(dhdx.negate(), 1, dhdz.negate()));
      m.normalNode = normalize(cameraViewMatrix.mul(vec4(n, 0)).xyz);
      // deep, nearly black water; a pale seethe of foam where it meets the sand, riding the swell
      const shoreD = abs(P.x.sub(SHORE_X - 7).sub(h.mul(3.5)));
      // its crest curls white along its top and down its landward face
      const crest = smoothstep(0.3, 0.85, wave.div(uWaveA.add(0.01))).mul(smoothstep(0.3, 1.5, uWaveA)).mul(smoothstep(-6, 1, cr));
      const foam = smoothstep(mix(float(2.2), float(9), uSurge.div(2.4)), 0.0, shoreD).add(crest).min(1).mul(vnoise(P.xz.mul(0.35).add(vec2(t.mul(0.12), 0))).mul(0.7).add(0.3));
      const churn = vnoise(P.xz.mul(vec2(0.5, 0.18)).add(vec2(0, t.mul(0.8)))).mul(0.6).add(0.55);
      m.colorNode = mix(mix(vec3(0.008, 0.016, 0.03), vec3(0.3, 0.3, 0.36), foam.mul(0.6)), vec3(0.62, 0.66, 0.72), crest.mul(churn).min(1));
      const mesh = new THREE.Mesh(geo, m);
      mesh.receiveShadow = true;
      g.add(mesh);
      ours.push(geo, m);
    }

    /* ---------------- towers of basalt, sea stacks, boulders ---------------- */
    const stone = etchedStone("#15121c", "#6e5238", 3.4);
    ours.push(stone);
    const spires: [number, number, number, number, number][] = [
      // x, z, base radius, height, lean
      [15, -15, 3.4, 23, 0.8],
      [25, -31, 4.8, 36, -1.2],
      [12.5, -52, 2.6, 17, 0.6],
      [33, -62, 5.4, 44, 1.6],
      [-11, -24, 2.1, 11, -0.6],
      [-33, -38, 3.6, 21, 0.4],
      [-47, -72, 4.8, 30, -0.9],
      [-9, 22, 3.1, 19, 0.2],
      [19, 16, 3.7, 26, 0.7],
      [44, -24, 6.5, 52, -1.0],
    ];
    const sparkPos: THREE.Vector3[] = [];
    spires.forEach(([x, z, r, h, lean], i) => {
      const geo = spireGeometry(r, h, 31 + i * 7, 7, lean);
      const mesh = new THREE.Mesh(geo, stone);
      const y = Math.min(sandHeight(x, z), 0) - 0.8;
      mesh.position.set(x, y, z);
      solids.push({ x, z, r: r * 0.85, h });
      mesh.rotation.y = R() * Math.PI * 2;
      mesh.castShadow = mesh.receiveShadow = true;
      g.add(mesh);
      ours.push(geo);
      // sparks resting in this stone: at its surface, at every height
      for (let k = 0; k < 16; k++) {
        const a = R() * Math.PI * 2, hy = (0.08 + R() * 0.8) * h;
        const rr = r * (1 - (hy / h) * 0.62) * 0.98;
        sparkPos.push(new THREE.Vector3(x + Math.cos(a) * rr, y + hy, z + Math.sin(a) * rr));
      }
    });
    for (let i = 0; i < 16; i++) {
      const a = R() * Math.PI * 2, d = 8 + R() * 34;
      const x = Math.cos(a) * d * 1.2, z = -10 - Math.abs(Math.sin(a)) * d;
      if (Math.abs(x) < 4.5 || x < SHORE_X - 4) continue; // the path stays clear, the sea too
      const br = 0.6 + R() * 1.8;
      const geo = boulderGeometry(br, 90 + i);
      const mesh = new THREE.Mesh(geo, stone);
      mesh.position.set(x, sandHeight(x, z) - 0.15, z);
      solids.push({ x, z, r: br * 0.8, h: br });
      mesh.rotation.set(R() * 0.4, R() * 6.28, R() * 0.4);
      mesh.castShadow = mesh.receiveShadow = true;
      g.add(mesh);
      ours.push(geo);
      for (let k = 0; k < 3; k++) sparkPos.push(mesh.position.clone().add(new THREE.Vector3((R() - 0.5) * 1.2, 0.4 + R() * 0.8, (R() - 0.5) * 1.2)));
    }

    /* ---------------- where the life is: a stone close ahead, alive with sparks ---------------- */
    // (the owner: "focus where the life is"): a dark stone a few steps ahead, its cracks glowing
    // with sparks; as the narration names their reach toward the light, sparks lift out of it and
    // spiral up toward the fire's glow, and sink home again, each in its own time
    {
      const N = new THREE.Vector3(3.6, sandHeight(3.6, -9.5) - 0.35, -9.5);
      const geo = boulderGeometry(1.7, 777);
      geo.scale(1.25, 0.9, 1);
      const mesh = new THREE.Mesh(geo, stone);
      mesh.position.copy(N);
      solids.push({ x: N.x, z: N.z, r: 1.75, h: 1.4 });
      mesh.castShadow = mesh.receiveShadow = true;
      g.add(mesh);
      ours.push(geo);
      // sparks in its cracks
      const n = 70;
      const c = pointCloud(n, 0.42);
      for (let i = 0; i < n; i++) {
        const a = R() * Math.PI * 2, el = R() * 1.2 - 0.1;
        c.pos.set([N.x + Math.cos(a) * Math.cos(el) * 2.05, N.y + 0.6 + Math.sin(el) * 1.45, N.z + Math.sin(a) * Math.cos(el) * 1.75], i * 3);
        c.k.set([R(), R(), R(), R()], i * 4);
      }
      touch(c.cloud);
      const K = c.cloud.nodes.aK;
      const glow = sin(t.mul(float(0.7).add(K.x.mul(0.8))).add(K.y.mul(40))).mul(0.4).add(0.6);
      c.material.colorNode = vec4(vec3(1, 0.7, 0.36).mul(c.round).mul(glow).mul(uSpark).mul(1.4), 1);
      g.add(c.cloud.sprite);
      ours.push(c.material);
      // the ones that rise: out of the stone, spiralling up toward the light, and home again
      const m = 90;
      const f = pointCloud(m, 0.32);
      for (let i = 0; i < m; i++) f.k.set([R(), R(), R(), R()], i * 4);
      touch(f.cloud);
      const F = f.cloud.nodes.aK;
      const cyc = fract(F.x.add(t.mul(float(0.05).add(F.y.mul(0.04)))));
      const up = sin(cyc.mul(Math.PI)); // out and back
      const toward = new THREE.Vector3(VOLCANO.x - N.x, 0, VOLCANO.z - N.z).normalize();
      const a = F.z.mul(6.283).add(t.mul(float(0.5).add(F.w.mul(0.6))));
      const rad = up.mul(float(0.6).add(F.w.mul(1.6)));
      const reach = up.mul(uLean.min(1.6)).mul(float(2).add(F.y.mul(5)));
      f.material.positionNode = vec3(N.x, N.y + 1.2, N.z)
        .add(vec3(cos(a).mul(rad), up.mul(float(2).add(F.x.mul(5))).mul(uLean.min(1.6)), sin(a).mul(rad)))
        .add(vec3(toward.x, 0, toward.z).mul(reach));
      const tw = sin(t.mul(3).add(F.z.mul(50))).mul(0.25).add(0.75);
      f.material.colorNode = vec4(vec3(1, 0.82, 0.5).mul(f.round).mul(tw).mul(smoothstep(0.02, 0.15, up)).mul(uLean.min(1)).mul(uSpark).mul(1.3), 1);
      g.add(f.cloud.sprite);
      ours.push(f.material);
    }

    /* ---------------- the sparks: consciousness resting in matter ---------------- */
    // each spark drawn as a bright core, a soft halo about it, and, as it leans, a short trail of
    // itself reaching toward the fire (the owner: larger, and visibly leaning as they are named)
    const light = VOLCANO.clone().setY(VOLCANO_H);
    for (const [size, layer, reps] of [[0.62, 0, 3], [2.4, 1, 1]] as [number, number, number][]) {
      const n = sparkPos.length * reps;
      const s = pointCloud(n, size);
      sparkPos.forEach((p, i) => {
        const d = light.clone().sub(p).normalize();
        const ph = R();
        for (let r = 0; r < reps; r++) {
          s.pos.set([p.x, p.y, p.z], (i * reps + r) * 3);
          // aK: the way to the light, and (w) its own phase + which sample along its reach
          s.k.set([d.x, d.y, d.z, ph + r * 10], (i * reps + r) * 4);
        }
      });
      touch(s.cloud);
      const K = s.cloud.nodes.aK, base = s.cloud.nodes.position;
      const rep = T.floor(K.w.div(10)), phase = fract(K.w);
      const ph = phase.mul(40);
      const breathe = sin(t.mul(float(0.35).add(phase.mul(0.3))).add(ph)).mul(0.35).add(0.65);
      // leaning: a slow reach out toward the light and back, each at its own moment
      const reach = uLean.mul(sin(t.mul(0.22).add(ph)).mul(0.5).add(0.5).mul(1.6).add(0.3));
      const along = float(1).sub(rep.mul(0.35)); // the trail: the same spark a little behind
      s.material.positionNode = base.add(K.xyz.mul(reach.mul(along)));
      const trailDim = float(1).sub(rep.mul(0.38));
      const lum = layer === 0 ? breathe.mul(trailDim).mul(1.5) : breathe.mul(0.16);
      s.material.colorNode = vec4(vec3(1.0, 0.74, 0.4).mul(s.round).mul(lum).mul(uSpark), 1);
      g.add(s.cloud.sprite);
      ours.push(s.material);
    }

    /* ---------------- the volcano (its fire, plume and embers), the storm, the ash ---------------- */
    volcano(g, t, VOLCANO, VOLCANO_H, uLava, R, ours);
    stormCeiling(g, t, VOLCANO, uStorm, ours);
    ash(g, t, R, ours);

    /* ---------------- the tsunami's spray, where it breaks on the shore ---------------- */
    {
      const n = 1400;
      const c = pointCloud(n, 0.55);
      for (let i = 0; i < n; i++) {
        const z = -110 + R() * 150;
        c.pos.set([SHORE_X - 6 + R() * 8, 0, z], i * 3);
        c.k.set([R(), R(), R(), R()], i * 4);
      }
      touch(c.cloud);
      const K = c.cloud.nodes.aK, base = c.cloud.nodes.position;
      const tau = uSpray.sub(K.x.mul(1.2)); // each a moment after the one before, down the shore
      const live = step(0, tau).mul(float(1).sub(smoothstep(2.4, 4.2, tau)));
      const v = float(7).add(K.y.mul(9));
      const up = tau.max(0).mul(v).sub(tau.max(0).mul(tau.max(0)).mul(4.9)).max(0);
      c.material.positionNode = base.add(vec3(K.z.sub(0.3).mul(tau.max(0)).mul(3.5), up, K.w.sub(0.5).mul(tau.max(0)).mul(2)));
      c.material.colorNode = vec4(vec3(0.62, 0.66, 0.72).mul(c.round).mul(live).mul(0.55), 1);
      g.add(c.cloud.sprite);
      ours.push(c.material);
    }

    /* ---------------- the ground opening: a rift to the right of the path ---------------- */
    {
      const pts = [new THREE.Vector3(5.6, 0, -14), new THREE.Vector3(9.5, 0, -19.5), new THREE.Vector3(15.5, 0, -21.5), new THREE.Vector3(21.5, 0, -25.5), new THREE.Vector3(27, 0, -25), new THREE.Vector3(34, 0, -29)];
      const curve = new THREE.CatmullRomCurve3(pts, false, "centripetal");
      const N = 120;
      const cps = curve.getSpacedPoints(N);
      // two strips laid on the sand along it: the torn dark lip, and the magma within
      const strip = (widthK: number, lift: number) => {
        const pos: number[] = [], side: number[] = [], along: number[] = [], nrm: number[] = [], idx: number[] = [];
        for (let i = 0; i <= N; i++) {
          const a = cps[Math.max(0, i - 1)], b = cps[Math.min(N, i + 1)];
          const tx = b.x - a.x, tz = b.z - a.z, tl = Math.hypot(tx, tz) || 1;
          for (const sd of [-1, 1]) {
            pos.push(cps[i].x, 0, cps[i].z);
            side.push(sd);
            along.push(i / N);
            nrm.push(-tz / tl, tx / tl);
          }
          if (i < N) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
        geo.setAttribute("aSide", new THREE.Float32BufferAttribute(side, 1));
        geo.setAttribute("aAlong", new THREE.Float32BufferAttribute(along, 1));
        geo.setAttribute("aN", new THREE.Float32BufferAttribute(nrm, 2));
        geo.setIndex(idx);
        const A = T.attribute("aAlong", "float"), S2 = T.attribute("aSide", "float"), NN = T.attribute("aN", "vec2");
        // wide in the middle, closing to nothing at its ends, jagged
        const taper = sin(A.mul(Math.PI)).pow(0.6);
        const jag = vnoise(vec2(A.mul(38), S2.mul(7))).mul(0.7).add(0.5);
        const w = uOpen.mul(taper).mul(jag).mul(widthK);
        const m = new THREE.MeshBasicNodeMaterial({ fog: false, polygonOffset: true, polygonOffsetFactor: -2 - lift, polygonOffsetUnits: -2 - lift });
        m.positionNode = vec3(positionLocal.x.add(NN.x.mul(S2).mul(w)), positionLocal.y, positionLocal.z.add(NN.y.mul(S2).mul(w)));
        return { geo, m, A, S2 };
      };
      const lip = strip(3.4, 0);
      lip.m.colorNode = vec4(0.006, 0.005, 0.008, 1);
      const core = strip(2.0, 1);
      {
        const flow = vnoise(vec2(core.A.mul(30).sub(t.mul(0.35)), core.S2.mul(2).add(t.mul(0.2))));
        const hot = vec3(1.0, 0.42, 0.08).mul(flow.mul(0.8).add(0.6)).add(vec3(1, 0.85, 0.5).mul(smoothstep(0.7, 1, flow).mul(0.8)));
        const crust = vec3(0.02, 0.012, 0.01);
        core.m.colorNode = vec4(mix(crust, hot.mul(1.6), uHeat.mul(flow.mul(0.6).add(0.55)).min(1)), 1);
      }
      for (const [st, lift] of [[lip, 0], [core, 1]] as const) {
        // laid on the sand, each point at its own height
        const p = st.geo.attributes.position as THREE.BufferAttribute;
        for (let i = 0; i < p.count; i++) p.setY(i, sandHeight(p.getX(i), p.getZ(i)) + 0.05 + lift * 0.02);
        const mesh = new THREE.Mesh(st.geo, st.m);
        mesh.frustumCulled = false;
        g.add(mesh);
        ours.push(st.geo, st.m);
      }
      // the rift's light rising from it like heat: a soft standing veil along its length, so it
      // reads from where you stand (a crack on the ground is thin at a low angle)
      {
        const pos: number[] = [], uvs: number[] = [], idx: number[] = [];
        for (let i = 0; i <= N; i++) {
          const q = cps[i], y = sandHeight(q.x, q.z);
          pos.push(q.x, y, q.z, q.x, y + 3.2, q.z);
          uvs.push(i / N, 0, i / N, 1);
          if (i < N) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
        geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
        geo.setIndex(idx);
        const m = keepAlpha(new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
        const U = uv();
        const wav = vnoise(vec2(U.x.mul(26), U.y.mul(2).sub(t.mul(0.6)))).mul(0.6).add(0.5);
        m.colorNode = vec4(vec3(1, 0.45, 0.12).mul(exp(U.y.mul(-3.2))).mul(sin(U.x.mul(Math.PI)).pow(0.7)).mul(wav).mul(uHeat).mul(uOpen).mul(0.42), 1);
        const mesh = new THREE.Mesh(geo, m);
        mesh.frustumCulled = false;
        g.add(mesh);
        ours.push(geo, m);
      }
      // embers rising out of it while it is hot
      const n = 500;
      const e = pointCloud(n, 0.22);
      for (let i = 0; i < n; i++) {
        const q = cps[Math.floor(R() * N)];
        e.pos.set([q.x + (R() - 0.5) * 0.8, sandHeight(q.x, q.z), q.z + (R() - 0.5) * 0.8], i * 3);
        e.k.set([R(), R(), R(), R()], i * 4);
      }
      touch(e.cloud);
      const K = e.cloud.nodes.aK;
      const cyc = fract(K.x.add(t.mul(float(0.12).add(K.y.mul(0.12)))));
      e.material.positionNode = e.cloud.nodes.position.add(vec3(sin(cyc.mul(9).add(K.z.mul(20))).mul(0.6), cyc.mul(float(3).add(K.w.mul(7))), cos(cyc.mul(7).add(K.w.mul(20))).mul(0.6)));
      e.material.colorNode = vec4(vec3(1, 0.5, 0.15).mul(e.round).mul(sin(cyc.mul(Math.PI))).mul(uHeat).mul(1.4), 1);
      g.add(e.cloud.sprite);
      ours.push(e.material);
      // its glow on the towers and the sand
      const lamp = new THREE.PointLight(0xff6a24, 0, 34, 1.6);
      const mid = curve.getPoint(0.5);
      lamp.position.set(mid.x, sandHeight(mid.x, mid.z) + 2.2, mid.z);
      g.add(lamp);
      tickers.push(() => (lamp.intensity = uHeat.value * 90));
    }

    /* ---------------- the way on: a stone door, and branches growing from its frame ---------------- */
    {
      const door = new THREE.Group();
      door.position.copy(PORTAL).setY(sandHeight(PORTAL.x, PORTAL.z) - 0.3);
      g.add(door);
      const W = 3.6, H = 5.6;
      for (const sx of [-1, 1]) {
        const geo = spireGeometry(1.05, H + 0.6, sx > 0 ? 71 : 73, 6, 0);
        const m = new THREE.Mesh(geo, stone);
        m.position.set((sx * (W + 1.6)) / 2, 0, 0);
        m.castShadow = m.receiveShadow = true;
        door.add(m);
        ours.push(geo);
      }
      {
        const geo = boulderGeometry(1, 77);
        geo.scale(3.4, 0.62, 0.85);
        const m = new THREE.Mesh(geo, stone);
        m.position.set(0, H + 0.55, 0);
        m.castShadow = true;
        door.add(m);
        ours.push(geo);
      }
      // living branches: they have begun to grow out of the stone, reaching up and outward
      const bark = barkMaterial(new THREE.Color(1.0, 0.8, 0.5), 0.37);
      ours.push(bark);
      const tips: THREE.Vector3[] = [];
      const grows: [number, number, number, number, number][] = [
        // x, y, rotation about z (outward lean), about y, scale
        [-2.4, H + 0.7, 0.35, 0.3, 0.42],
        [2.5, H + 0.6, -0.4, 2.4, 0.46],
        [0.4, H + 1.0, 0.05, 1.3, 0.36],
        [-2.7, 2.2, 1.15, 0.0, 0.26],
        [2.7, 3.1, -1.1, 3.1, 0.24],
      ];
      grows.forEach(([x, y, rz, ry, sc], i) => {
        const tree = grow(SHAPES[i % 2 ? 0 : 2], 501 + i * 13);
        const geo = tubes([...tree.limbs]);
        const m = new THREE.Mesh(geo, bark);
        m.position.set(x, y, 0);
        m.rotation.set(0, ry, rz);
        m.scale.setScalar(sc);
        door.add(m);
        ours.push(geo);
        m.updateMatrix();
        for (const tp of tree.tips) tips.push(tp.clone().applyMatrix4(m.matrix));
      });
      // leaves of light at the twig tips, green-gold: the next world, already breathing
      {
        const n = tips.length * 5;
        const s = pointCloud(n, 0.34);
        let i = 0;
        for (const tp of tips)
          for (let k = 0; k < 5; k++, i++) {
            s.pos.set([tp.x + (R() - 0.5) * 0.7, tp.y + (R() - 0.5) * 0.5, tp.z + (R() - 0.5) * 0.7], i * 3);
            s.k.set([R(), R(), R(), R()], i * 4);
          }
        touch(s.cloud);
        const K = s.cloud.nodes.aK;
        const tw = sin(t.mul(float(0.8).add(K.x.mul(1.6))).add(K.y.mul(50))).mul(0.4).add(0.6);
        const hue = mix(vec3(0.62, 0.9, 0.46), vec3(1.0, 0.84, 0.5), K.z);
        s.material.positionNode = s.cloud.nodes.position.add(vec3(sin(t.mul(0.6).add(K.w.mul(30))).mul(0.05), 0, 0));
        s.material.colorNode = vec4(hue.mul(s.round).mul(tw).mul(uPortal.mul(0.6).add(0.2)), 1);
        door.add(s.cloud.sprite);
        ours.push(s.material);
      }
      // the light in the doorway: warm, dappled as if through leaves, breathing
      {
        const geo = new THREE.PlaneGeometry(W, H);
        geo.translate(0, H / 2, 0);
        const m = keepAlpha(new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide }));
        const U = uv();
        const edge = smoothstep(0, 0.22, U.x).mul(smoothstep(1, 0.78, U.x)).mul(smoothstep(0, 0.05, U.y)).mul(smoothstep(1, 0.55, U.y));
        const dapple = vnoise(U.mul(vec2(5, 8)).add(vec2(t.mul(0.05), t.mul(0.03)))).mul(0.5).add(0.6);
        const breathe = sin(t.mul(0.45)).mul(0.08).add(0.92);
        m.colorNode = vec4(mix(vec3(1.0, 0.72, 0.4), vec3(1.0, 0.93, 0.78), U.y.oneMinus()).mul(edge).mul(dapple).mul(breathe).mul(uPortal).mul(0.8), 1);
        const mesh = new THREE.Mesh(geo, m);
        mesh.position.z = -0.1;
        door.add(mesh);
        ours.push(geo, m);
      }
      // light spilling out over the sand before it
      {
        const geo = new THREE.PlaneGeometry(9, 12);
        geo.rotateX(-Math.PI / 2);
        geo.translate(0, 0.06, 5.4);
        const m = keepAlpha(new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, fog: false }));
        const U = uv();
        const d = length(U.sub(vec2(0.5, 0.95)).mul(vec2(1.6, 1)));
        m.colorNode = vec4(vec3(1.0, 0.82, 0.55).mul(exp(d.mul(d).mul(-7))).mul(uPortal).mul(0.35), 1);
        const mesh = new THREE.Mesh(geo, m);
        door.add(mesh);
        ours.push(geo, m);
      }
    }

    let rest: THREE.Vector3 | null = null; // where the room stands (the journey moves it), the quake about it
    tickers.push((dt: number) => {
      const d = Math.min(0.05, Math.max(0, dt));
      clock.tick(d);
      now += d;
      // the tsunami: a crest out of the open sea, rising as it comes, breaking on the shore
      if (ev.tsu >= 0) {
        const τ = now - ev.tsu;
        uWaveX.value = SHORE_X - 150 + 154 * Math.pow(Math.min(1, τ / 11), 1.25);
        uWaveA.value = 7.5 * sm(0, 4, τ) * (1 - sm(9.6, 11.6, τ));
        uSurge.value = 2.4 * sm(10, 11.6, τ) * (1 - sm(12.5, 22, τ));
        uSpray.value = τ - 10.4;
        if (τ > 26) ev.tsu = -1;
      }
      // the earth quakes: the whole land trembles under the storm's flashes
      if (!rest) rest = g.position.clone();
      if (ev.quake >= 0) {
        const τ = now - ev.quake;
        const a = 0.11 * sm(0, 1.4, τ) * (1 - sm(7, 10.5, τ));
        g.position.set(rest.x + (Math.sin(now * 37) + Math.sin(now * 23.7)) * a, rest.y + Math.sin(now * 29.3) * a * 0.5, rest.z + (Math.sin(now * 31.1) + Math.cos(now * 19.3)) * a);
        if (τ > 11) {
          g.position.copy(rest);
          ev.quake = -1;
        }
      } else rest.copy(g.position);
      // the ground tears open, and its magma glows
      if (ev.rift >= 0) uOpen.value = Math.max(uOpen.value, sm(0.4, 4.5, now - ev.rift));
      uHeat.value = damp(uHeat.value, goal.heat, 0.4, d);
      applyAir(air);
      uSpark.value = damp(uSpark.value, goal.spark, 0.35, d);
      uLean.value = damp(uLean.value, goal.lean, 0.25, d);
      uLava.value = damp(uLava.value, goal.lava, 0.45, d);
      uSwell.value = damp(uSwell.value, goal.swell, 0.3, d);
      uStorm.value = damp(uStorm.value, goal.storm, 0.5, d);
      uPortal.value = damp(uPortal.value, goal.portal, 0.4, d);
    });
  };

  const opts: LessonOpts = {
    id: "density_1",
    trackId: "audio/densities/density_1.mp3",
    seatPos,
    seatHeading: heading,
    build,
    authoredSecs: 300, // beats written against the script's length; they follow the recording
    beats: [
      // "Imagine consciousness at its very beginning… a spark resting inside matter": the sparks wake
      { t: 38, apply: () => (goal.spark = 1) },
      // "because it is attracted to the light, it conceives of the idea of movement": they lean
      { t: 76, apply: () => (goal.lean = 1) },
      // "The volcano, tearing open the earth… The ocean… The storm…": the elements at full voice
      { t: 112, apply: () => (Object.assign(goal, { lava: 2.2, swell: 1.45, storm: 2.2 }), (ev.tsu = start(112))) },
      // … the earth quakes (the storm flashing above it)
      { t: 122, apply: () => ((ev.quake = start(122)), (goal.storm = 3)) },
      // … and the ground tears open, magma in the rift
      { t: 128, apply: () => ((ev.rift = start(128)), (goal.heat = 1)) },
      // "There is a dignity here…": the fire settles back to its slow pour
      { t: 152, apply: () => Object.assign(goal, { lava: 1.2, swell: 1, storm: 1, heat: 0.3 }) },
      // "Being is enough… I am.": stillness; the storm quiets, the sea lies almost flat
      { t: 262, apply: () => Object.assign(goal, { storm: 0.2, swell: 0.45, lava: 0.9, heat: 0.04 }) },
      // "the light that the first sparks were drawn to… you are still following now": the way on opens
      { t: 300, apply: () => Object.assign(goal, { portal: 1.1, lean: 1.6 }) },
    ],
  };

  const lesson = new LessonScene(scene, narration, whisper, opts);
  const baseUpdate = lesson.update.bind(lesson);
  const baseDispose = lesson.dispose.bind(lesson);
  lesson.update = (dt: number): void => {
    baseUpdate(dt);
    for (const ticker of tickers) ticker(dt);
  };
  lesson.dispose = (): void => {
    baseDispose();
    for (const d of ours) d.dispose();
    ours.length = 0;
    tickers.length = 0;
  };
  return Object.assign(lesson, { solids: () => solids });
}
