/* The ancient practices, the fourth chamber: the others. The last telling widens the lens past this
   world. A bare round hilltop at night under a vast sky, and the sky populated the way a forest is,
   mostly out of sight: as the narration names it, small worlds appear everywhere among the stars,
   each a lit crescent of its own colour. Venus rises low in the west, pale gold and rose (a telling
   of a heart-wise people long ago). Their textbook: twenty-two fine outlines of cards turn in a ring
   over the hill, then drift outward, given away. A community practising as one: figures of light
   sit round the hilltop in a ring, and a single soft light breathes above them all. The hidden
   order: fine arcs weave across the sky. Then the four tellings gathered like stones from four
   beaches: from the four quarters four lights come in (the crystal's blue, the mountain's gold, the
   daily lamp's warmth, the far worlds' white) and meet over the ring. At the end every star is
   joined to its neighbours by a thin line: all the climbers keeping each other company, making
   the night navigable. The way home to the school is a doorway at the hill's edge. */
import * as THREE from "three/webgpu";
import { LessonScene } from "../lessonKit";
import type { LessonCtx, LessonOpts, SceneModule } from "../lessonKit";
import { T, hash2 } from "../../gpu/tsl";
import { ribbonGeometry, ribbonMaterial } from "../../gpu/ribbons";
import { landStone, stoneBlock } from "../../world/stoneworks";
import { GlassFolk, type FolkSpec } from "../glassFolk";
import { applyAir, boulderGeometry, damp, keepAlpha, merge, pointCloud, roomClock, scannedGround, seeded, skyDome, touch, type Air } from "../densities/roomKit";

const { exp, floor, length, mix, normalize, sin, smoothstep, step, uniform, uv, vec3, vec4 } = T;

/** Room frame: you start south of the hilltop's crown facing −z (north); the door at the north edge. */
export const OTHERS_DOOR = new THREE.Vector3(0, 0, -24);
const VENUS = new THREE.Vector3(-0.92, 0.1, -0.38).normalize();

/** The hill: a low round crown, falling away gently on every side. */
export function hillFloor(x: number, z: number): number {
  const r = Math.hypot(x, z + 8);
  return 1.6 - 0.0035 * r * r;
}

export function createOthersScene(scene: THREE.Scene, narration: LessonCtx["narration"], whisper: (t: string, ms?: number) => void): SceneModule {
  const seatPos = new THREE.Vector3(0, 0, 4);
  const tickers: Array<(dt: number) => void> = [];
  const ours: Array<{ dispose(): void }> = [];
  const clock = roomClock();
  const t = clock.u;
  const uWorlds = uniform(0.05); // the forest of worlds
  const uVenus = uniform(0);
  const uCards = uniform(0), uGiven = uniform(0); // the textbook, and its giving away
  const uChoir = uniform(0); // many practising as one
  const uRta = uniform(0); // the hidden order
  const uGather = uniform(0); // the four tellings coming in
  const uCompany = uniform(0); // every star joined to its neighbours
  const goal = { worlds: 0.05, venus: 0, cards: 0, given: 0, choir: 0, rta: 0, gather: 0, company: 0 };
  const air: Air = {
    color: new THREE.Color(0.012, 0.014, 0.03),
    glow: new THREE.Color(0.04, 0.05, 0.1),
    glowDir: new THREE.Vector3(0, 1, 0),
    density: 0.002,
    shadow: new THREE.Color(0.004, 0.006, 0.02),
    sat: 1.05,
    contrast: 1.06,
  };
  const R = seeded(4201);
  const CROWN = new THREE.Vector3(0, hillFloor(0, -8), -8);
  const specs: FolkSpec[] = [];
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2 + 0.2;
    const x = CROWN.x + Math.sin(a) * 4.2, z = CROWN.z + Math.cos(a) * 4.2;
    specs.push({ x, z, y: hillFloor(x, z), face: a + Math.PI, act: "sit", tint: new THREE.Color().setHSL(0.08 + k * 0.1, 0.45, 0.78) });
  }
  const folk = new GlassFolk(specs, 71);

  const build = (ctx: LessonCtx) => {
    const g = ctx.group;
    // the night: many stars, a faint band
    {
      const sky = skyDome(1400, new THREE.Color(0.02, 0.025, 0.05), new THREE.Color(0.003, 0.004, 0.012), {
        extra: (d, c) => {
          const sc = floor(d.mul(300));
          const h = hash2(sc.xy.add(sc.z.mul(7.1)));
          const star = step(0.986, h).mul(sin(t.mul(0.9).add(hash2(sc.xz).mul(40))).mul(0.3).add(0.7)).mul(smoothstep(0.0, 0.2, d.y));
          const band = exp(T.abs(d.x.mul(0.6).sub(d.z.mul(0.5)).add(d.y.mul(0.3))).mul(-6)).mul(0.16).mul(T.mx_noise_float(d.mul(9)).mul(0.5).add(0.6));
          const fine = step(0.97, hash2(floor(d.mul(900)).xy.add(floor(d.mul(900)).z))).mul(band.mul(8).add(0.15)).mul(0.5);
          return c.add(vec3(0.9, 0.92, 1).mul(star)).add(vec3(0.3, 0.32, 0.45).mul(band)).add(vec3(0.85, 0.88, 1).mul(fine));
        },
      });
      g.add(sky.mesh);
      ours.push(sky);
    }
    // the hill: dry grass and stone, a few boulders
    {
      const geo = new THREE.PlaneGeometry(320, 320, 160, 160);
      geo.rotateX(-Math.PI / 2);
      const p = geo.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < p.count; i++) p.setY(i, hillFloor(p.getX(i), p.getZ(i)));
      geo.computeVertexNormals();
      const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.95, metalness: 0 });
      const scan = scannedGround("rock", 2.6, { hue: 0.3, relief: 1.2, bright: 1.5 });
      m.colorNode = vec3(0.3, 0.3, 0.33).mul(scan.color);
      m.normalNode = scan.normal;
      const hill = new THREE.Mesh(geo, m);
      hill.receiveShadow = true;
      g.add(hill);
      ours.push(geo, m);
      const rocks: THREE.BufferGeometry[] = [];
      for (let i = 0; i < 16; i++) {
        const a = R() * Math.PI * 2, r = 10 + R() * 30;
        const x = Math.sin(a) * r, z = -8 + Math.cos(a) * r;
        if (Math.abs(x) < 3 && z < -16) continue;
        const b = boulderGeometry(0.5 + R() * 1.6, i * 3.1);
        b.translate(x, hillFloor(x, z), z);
        rocks.push(b);
      }
      const rm = landStone("sandstone_cracks", 0, 1.6, [0.55, 0.56, 0.62]);
      const rmesh = new THREE.Mesh(merge(rocks), rm);
      rmesh.castShadow = rmesh.receiveShadow = true;
      g.add(rmesh);
      ours.push(rm, rmesh.geometry);
    }
    // the forest of worlds: small lit crescents everywhere among the stars
    {
      const n = 260;
      const w = pointCloud(n, 24);
      for (let i = 0; i < n; i++) {
        const a = R() * Math.PI * 2, e = 0.06 + Math.pow(R(), 0.8) * 1.2, r = 900;
        w.pos.set([Math.sin(a) * Math.cos(e) * r, Math.sin(e) * r, Math.cos(a) * Math.cos(e) * r], i * 3);
        w.k.set([R(), R(), R(), R()], i * 4);
      }
      touch(w.cloud);
      const K = w.cloud.nodes.aK;
      const q = T.pointUV.sub(0.5).mul(2);
      const disc = smoothstep(0.62, 0.5, length(q));
      const lit = smoothstep(-0.3, 0.4, q.x.mul(sin(K.w.mul(6.28))).add(q.y.mul(T.cos(K.w.mul(6.28)))));
      const col = mix(mix(vec3(0.9, 0.7, 0.5), vec3(0.55, 0.75, 1), K.x), vec3(0.8, 0.95, 0.8), step(0.8, K.y));
      // each appears at its own moment as the forest fills
      const on = smoothstep(K.y.mul(0.9), K.y.mul(0.9).add(0.1), uWorlds);
      w.material.colorNode = vec4(col.mul(disc).mul(lit.mul(0.85).add(0.05)).mul(on).mul(0.8), 1);
      g.add(w.cloud.sprite);
      ours.push(w.material);
    }
    // Venus rising low in the west
    {
      const sg = new THREE.SphereGeometry(55, 48, 24);
      const m = new THREE.MeshBasicNodeMaterial({ fog: false });
      const n = normalize(T.normalWorld);
      const light = smoothstep(-0.15, 0.45, T.dot(n, normalize(vec3(0.4, 0.5, 0.8))));
      const band = sin(T.positionGeometry.y.mul(0.18).add(sin(T.positionGeometry.x.mul(0.05)).mul(2))).mul(0.06).add(0.94);
      m.colorNode = vec4(mix(vec3(0.02, 0.015, 0.02), vec3(1, 0.78, 0.6).mul(band), light).mul(uVenus), 1);
      const venus = new THREE.Mesh(sg, m);
      g.add(venus);
      ours.push(sg, m);
      const hm = keepAlpha(new THREE.SpriteNodeMaterial({ transparent: true, depthWrite: false, fog: false }));
      const r = length(uv().sub(0.5)).mul(2);
      hm.colorNode = vec4(vec3(1, 0.7, 0.6).mul(exp(r.mul(r).mul(-5))).mul(smoothstep(1, 0.6, r)).mul(uVenus).mul(0.3), 1);
      const halo = new THREE.Sprite(hm);
      halo.scale.setScalar(260);
      g.add(halo);
      ours.push(hm);
      tickers.push(() => {
        const rise = uVenus.value;
        const dir = VENUS.clone().setY(VENUS.y - 0.14 + 0.3 * rise).normalize();
        venus.position.copy(dir).multiplyScalar(780);
        halo.position.copy(venus.position).multiplyScalar(1.01);
      });
    }
    // the twenty-two cards turning in a ring over the hill, then drifting outward, given away
    const cards = new THREE.Group();
    cards.position.set(CROWN.x, CROWN.y + 9, CROWN.z);
    g.add(cards);
    {
      const pairs: number[] = [];
      for (let i = 0; i < 22; i++) {
        const a = (i / 22) * Math.PI * 2, r = 15;
        const cx = Math.sin(a) * r, cz = Math.cos(a) * r, ux = Math.cos(a), uz = -Math.sin(a);
        const c = [[-1.3, -2.1], [1.3, -2.1], [1.3, 2.1], [-1.3, 2.1]].map(([x, y]) => [cx + x * ux, y + Math.sin(i * 1.3) * 0.8, cz + x * uz]);
        for (let k = 0; k < 4; k++) pairs.push(...c[k], ...c[(k + 1) % 4]);
        // an inner frame, as the cards' own borders
        const d = [[-1.05, -1.8], [1.05, -1.8], [1.05, 1.8], [-1.05, 1.8]].map(([x, y]) => [cx + x * ux, y + Math.sin(i * 1.3) * 0.8, cz + x * uz]);
        for (let k = 0; k < 4; k++) pairs.push(...d[k], ...d[(k + 1) % 4]);
      }
      const geo = ribbonGeometry(pairs);
      const m = ribbonMaterial(vec3(1, 0.82, 0.5).mul(uCards), 1.4);
      cards.add(new THREE.Mesh(geo, m));
      ours.push(geo, m);
    }
    // the shared light above those practising as one
    {
      const m = keepAlpha(new THREE.SpriteNodeMaterial({ transparent: true, depthWrite: false, fog: false }));
      const r = length(uv().sub(0.5)).mul(2);
      const breath = sin(t.mul(0.55)).mul(0.45).add(0.55);
      m.colorNode = vec4(vec3(1, 0.93, 0.85).mul(exp(r.mul(r).mul(-4))).mul(smoothstep(1, 0.6, r)).mul(uChoir).mul(breath).mul(0.95), 1);
      const s = new THREE.Sprite(m);
      s.position.set(CROWN.x, CROWN.y + 3.2, CROWN.z);
      s.scale.setScalar(9);
      g.add(s);
      tickers.push(() => s.scale.setScalar(7 + 3.5 * Math.sin(clock.u.value * 0.55)));
      ours.push(m);
    }
    // the hidden order: fine arcs woven across the sky
    {
      const pairs: number[] = [];
      for (let k = 0; k < 9; k++) {
        const tilt = (k / 9) * Math.PI, r = 1000;
        let prev: THREE.Vector3 | null = null;
        for (let s = 0; s <= 90; s++) {
          const a = (s / 90) * Math.PI;
          const p = new THREE.Vector3(Math.cos(a) * r, Math.sin(a) * r * 0.9, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), tilt);
          if (prev) pairs.push(...prev.toArray(), ...p.toArray());
          prev = p;
        }
      }
      const geo = ribbonGeometry(pairs);
      const m = ribbonMaterial(vec3(0.7, 0.8, 1).mul(uRta).mul(0.35), 0.6);
      g.add(new THREE.Mesh(geo, m));
      ours.push(geo, m);
    }
    // the four tellings coming in from the four quarters and meeting over the ring
    {
      const L = pointCloud(4, 0.9);
      const cols = [[0.6, 0.8, 1], [1, 0.8, 0.4], [1, 0.62, 0.35], [0.95, 0.95, 1]];
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2;
        L.pos.set([Math.sin(a) * 60, 14, Math.cos(a) * 60], i * 3);
        L.k.set([cols[i][0], cols[i][1], cols[i][2], 0], i * 4);
      }
      touch(L.cloud);
      const K = L.cloud.nodes.aK, B = L.cloud.nodes.position;
      const k = smoothstep(0, 1, uGather);
      L.material.positionNode = mix(B, vec3(0, 3.2 + 0.0, 0), k);
      L.material.colorNode = vec4(K.xyz.mul(L.round).mul(smoothstep(0, 0.05, uGather)).mul(0.9), 1);
      L.cloud.sprite.position.set(CROWN.x, CROWN.y, CROWN.z);
      g.add(L.cloud.sprite);
      ours.push(L.material);
    }
    // the company of stars: every star joined to its neighbours
    {
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i < 520; i++) {
        const a = R() * Math.PI * 2, e = 0.06 + Math.pow(R(), 0.7) * 1.35, r = 950;
        pts.push(new THREE.Vector3(Math.sin(a) * Math.cos(e) * r, Math.sin(e) * r, Math.cos(a) * Math.cos(e) * r));
      }
      const pairs: number[] = [];
      for (let i = 0; i < pts.length; i++) {
        const near = pts.map((p, j) => [p.distanceTo(pts[i]), j]).sort((a, b) => a[0] - b[0]).slice(1, 4);
        for (const [, j] of near) if (j > i) pairs.push(...pts[i].toArray(), ...pts[j].toArray());
      }
      const geo = ribbonGeometry(pairs);
      const m = ribbonMaterial(vec3(0.8, 0.86, 1).mul(uCompany).mul(0.8), 1.0);
      g.add(new THREE.Mesh(geo, m));
      const S = pointCloud(pts.length, 3.4);
      pts.forEach((p, i) => S.pos.set(p.toArray(), i * 3));
      touch(S.cloud);
      S.material.colorNode = vec4(vec3(0.95, 0.97, 1).mul(S.round).mul(uCompany.mul(0.7).add(0.3)), 1);
      g.add(S.cloud.sprite);
      ours.push(geo, m, S.material);
    }
    // the way home: a doorway of two stones and a lintel at the hill's north edge
    {
      const parts: THREE.BufferGeometry[] = [];
      const y = hillFloor(OTHERS_DOOR.x, OTHERS_DOOR.z);
      for (const dx of [-2, 2]) {
        const b = stoneBlock(1, 5, 1);
        b.translate(OTHERS_DOOR.x + dx, y + 2.5, OTHERS_DOOR.z);
        parts.push(b);
      }
      const l = stoneBlock(5.2, 0.9, 1.2);
      l.translate(OTHERS_DOOR.x, y + 5.4, OTHERS_DOOR.z);
      parts.push(l);
      const m = landStone("sandstone_cracks", 0, 1.8, [0.7, 0.7, 0.75]);
      const mesh = new THREE.Mesh(merge(parts), m);
      g.add(mesh);
      const dg = new THREE.PlaneGeometry(3, 5);
      dg.translate(OTHERS_DOOR.x, y + 2.5, OTHERS_DOOR.z - 0.2);
      const dm = new THREE.MeshBasicNodeMaterial({ fog: false, side: THREE.DoubleSide });
      dm.colorNode = vec4(mix(vec3(1, 0.75, 0.45), vec3(0.3, 0.25, 0.3), uv().y).mul(0.35), 1);
      g.add(new THREE.Mesh(dg, dm));
      ours.push(m, mesh.geometry, dg, dm);
    }
    // a soft light on the hilltop so the figures and stones read
    const moon = new THREE.DirectionalLight(0xb8c4ff, 0.5);
    moon.position.set(30, 60, 20);
    g.add(moon);
    const lamp = new THREE.PointLight(0xfff0e0, 0, 16, 1.4);
    lamp.position.set(CROWN.x, CROWN.y + 3.2, CROWN.z);
    g.add(lamp);
    g.add(folk.group);

    tickers.push((dt: number) => {
      const d = Math.min(0.05, Math.max(0, dt));
      clock.tick(d);
      applyAir(air);
      uWorlds.value = damp(uWorlds.value, goal.worlds, 0.08, d);
      uVenus.value = damp(uVenus.value, goal.venus, 0.06, d);
      uCards.value = damp(uCards.value, goal.cards, 0.25, d);
      uGiven.value = damp(uGiven.value, goal.given, 0.05, d);
      uChoir.value = damp(uChoir.value, goal.choir, 0.2, d);
      uRta.value = damp(uRta.value, goal.rta, 0.15, d);
      uGather.value = damp(uGather.value, goal.gather, 0.12, d);
      uCompany.value = damp(uCompany.value, goal.company, 0.1, d);
      cards.rotation.y += d * 0.05;
      cards.scale.setScalar(1 + uGiven.value * 5);
      cards.position.y = CROWN.y + 6.5 + uGiven.value * 30;
      lamp.intensity = 25 * uChoir.value + 10 * uGather.value;
      for (const b of folk.bodies) b.root.visible = uChoir.value > 0.02;
      folk.update(d);
    });
  };

  const opts: LessonOpts = {
    id: "practice_others",
    trackId: "audio/adept/practice_others.mp3",
    seatPos,
    seatHeading: 0,
    build,
    authoredSecs: 320, // beats written against the script's length; they follow the recording
    beats: [
      // "the universe is populated the way a forest is populated, mostly out of sight"
      { t: 40, apply: () => (goal.worlds = 1) },
      // "There is a telling, for example, about Venus"
      { t: 72, apply: () => (goal.venus = 1) },
      // "The old telling says it became the tarot."
      { t: 110, apply: () => (goal.cards = 1) },
      // "A whole civilization's practice manual, distilled over ages, given away."
      { t: 138, apply: () => ((goal.given = 1), (goal.cards = 0.5)) },
      // "Picture a whole community entering meditation as one act"
      { t: 168, apply: () => (goal.choir = 1) },
      // "rta, the hidden order holding the worlds in their courses"
      { t: 208, apply: () => (goal.rta = 1) },
      // "So now gather the four tellings in your hands"
      { t: 232, apply: () => ((goal.gather = 1), (goal.rta = 0.4)) },
      // "the way stars keep each other company… making the night navigable"
      { t: 312, apply: () => (goal.company = 1) },
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
    folk.dispose();
    for (const d of ours) d.dispose();
    ours.length = 0;
    tickers.length = 0;
  };
  return Object.assign(lesson, { loaded: folk.loaded });
}
