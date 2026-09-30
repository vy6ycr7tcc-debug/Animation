/* The fourth density: the world of love. A luminous planet at its long gentle dusk: a plaza of
   pale stone and still water among crystalline towers whose light rises through them slowly,
   rings of glass turning in the air above them (a technology that serves wonder), a great ringed
   world low in a sky of soft veils. Its people are the game's own figures of glass light, each in
   its own colour, standing together, sitting, walking. And every one of them is joined to every
   other by a thread of light, heart to heart, arcing between them, a slow pulse travelling each
   thread: the social memory complex, no one a stranger. The threads wake as the narration speaks
   of minds joined; by its end they burn together. The way on: an arch of crystal. */
import * as THREE from "three/webgpu";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import { LessonScene } from "../lessonKit";
import type { LessonCtx, LessonOpts, SceneModule } from "../lessonKit";
import { T, hash2, vnoise, type N } from "../../gpu/tsl";
import { ribbonGeometry, ribbonMaterial } from "../../gpu/ribbons";
import { lightBodyMaterial, tickLightBody } from "../../player/lightBody";
import { loadBeingModel } from "../../world/beings";
import { applyAir, damp, keepAlpha, pointCloud, roomClock, scannedGround, seeded, skyDome, touch, type Air, roomPos } from "./roomKit";

const { attribute, exp, float, floor, fract, length, max, mix, positionGeometry, pow, sin, smoothstep, step, uniform, uv, vec2, vec3, vec4 } = T;

const PLANET = new THREE.Vector3(-0.55, 0.16, -1).normalize();
const PORTAL = new THREE.Vector3(0, 0, -40);
const PEOPLE = 14;
const SEGS = 14; // segments along each thread

/** The people: where each stands (or the circle it walks), what it does, its colour. */
interface Person { x: number; z: number; face: number; act: "idle" | "sit" | "walk" | "reach"; walkR?: number; walkC?: [number, number]; walkSpeed?: number }

export function createDensityRoom4Scene(
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

  const clock = roomClock();
  const uThreads = uniform(0.15); // the threads: faint → woken → burning together
  const uTowers = uniform(0.6);
  const uPortal = uniform(0.4);
  const uWaves = uniform(0.6); // the waves of amber light
  const goal = { threads: 0.15, towers: 0.6, portal: 0.4, self: 0.6 };
  let self = 0.6, time = 0;
  let loaded: Promise<void> = Promise.resolve();
  const air: Air = {
    color: new THREE.Color(0.16, 0.1, 0.1),
    glow: new THREE.Color(0.78, 0.46, 0.24),
    glowDir: PLANET.clone(),
    density: 0.0026,
    shadow: new THREE.Color(0.03, 0.012, 0.02),
    sat: 1.08,
    contrast: 1.05,
  };

  /** Wave after wave of amber light washing out across the plaza from its heart, on a loop: how
      bright the wave is at `P` (a point in the room's frame). */
  const wave = (P: N): N => {
    const r = length(P.xz.sub(vec2(0, -14)));
    let w: N = float(0);
    for (let k = 0; k < 3; k++) {
      const front = fract(clock.u.mul(0.022).add(k / 3)).mul(95);
      const d = r.sub(front);
      w = w.add(exp(d.mul(d).mul(-0.012)).mul(smoothstep(95, 40, front)));
    }
    return w.mul(uWaves);
  };

  const build = (ctx: LessonCtx) => {
    const g = ctx.group;
    const t = clock.u;
    const R = seeded(4409);

    /* ---------------- sky: a long gentle dusk, a ringed world low, veils of soft light ---------------- */
    const pd = vec3(PLANET.x, PLANET.y, PLANET.z);
    const sky = skyDome(420, new THREE.Color(0.32, 0.22, 0.34), new THREE.Color(0.03, 0.035, 0.1), {
      extra: (d, c) => {
        // stars, fine and many
        const sc = floor(d.mul(420));
        const st = step(0.9965, hash2(sc.xy.add(sc.z.mul(7.1)))).mul(smoothstep(0.05, 0.4, d.y)).mul(sin(t.mul(0.8).add(hash2(sc.xz).mul(40))).mul(0.3).add(0.7));
        // veils: slow curtains of rose and teal
        const vx = d.x.mul(3).add(d.z.mul(2));
        const veil = vnoise(vec2(vx.add(t.mul(0.01)), d.y.mul(5))).mul(smoothstep(0.1, 0.35, d.y)).mul(smoothstep(0.75, 0.4, d.y));
        const vcol = mix(vec3(0.5, 0.25, 0.45), vec3(0.2, 0.5, 0.5), vnoise(vec2(vx.mul(0.6), 3)));
        // the ringed world: a lit disc with its ring, low over the horizon
        const cosA = T.dot(d, pd);
        const disc = smoothstep(0.9965, 0.9972, cosA);
        const lit = smoothstep(-0.2, 0.6, d.x.sub(pd.x).mul(-40).add(d.y.sub(pd.y).mul(30)));
        const planet = mix(vec3(0.06, 0.05, 0.12), vec3(0.85, 0.7, 0.75), lit).mul(disc);
        const ringD = length(d.sub(pd).mul(vec3(1, 3.2, 1)));
        const ring = smoothstep(0.0012, 0.0, T.abs(ringD.sub(0.11))).mul(float(1).sub(disc)).mul(0.6);
        const halo = pow(max(cosA, 0), 400).mul(0.35);
        return c.add(vec3(1.0, 0.95, 0.9).mul(st)).add(vcol.mul(veil).mul(0.35)).add(planet).add(vec3(0.9, 0.8, 0.85).mul(ring)).add(vec3(0.6, 0.45, 0.6).mul(halo));
      },
    });
    g.add(sky.mesh);
    ours.push(sky);

    /* ---------------- the plaza: pale stone, channels of still water ---------------- */
    {
      const geo = new THREE.PlaneGeometry(260, 260, 60, 60);
      geo.rotateX(-Math.PI / 2);
      const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.88, metalness: 0 });
      const scan = scannedGround("rock", 3.2, { hue: 0.2, relief: 0.55, bright: 1.6 });
      // pale stone laid in great rings round the plaza's heart, a thin light in the joints
      const r = length(roomPos.xz.sub(vec2(0, -14)));
      const joint = smoothstep(0.45, 0.49, T.abs(fract(r.div(4.2)).sub(0.5)));
      m.colorNode = vec3(0.085, 0.07, 0.075).mul(scan.color);
      m.normalNode = scan.normal;
      m.emissiveNode = vec3(0.9, 0.75, 0.9).mul(joint).mul(0.25).mul(uTowers).mul(smoothstep(40, 6, r)).add(vec3(1, 0.55, 0.2).mul(wave(roomPos)).mul(float(0.05).add(joint.mul(0.6))));
      const mesh = new THREE.Mesh(geo, m);
      mesh.receiveShadow = true;
      g.add(mesh);
      ours.push(geo, m);
      // still water in a ring round the heart: it holds the sky's colour
      const wg = new THREE.RingGeometry(9, 12.5, 96, 1);
      wg.rotateX(-Math.PI / 2);
      wg.translate(0, 0.03, -14);
      const wm = new THREE.MeshStandardNodeMaterial({ roughness: 0.08, metalness: 0.2 });
      wm.colorNode = vec3(0.05, 0.05, 0.1).add(vec3(0.25, 0.2, 0.3).mul(vnoise(roomPos.xz.mul(0.8).add(vec2(t.mul(0.05), 0))).mul(0.2)));
      const water = new THREE.Mesh(wg, wm);
      g.add(water);
      ours.push(wg, wm);
    }

    /* ---------------- crystalline towers, light rising through them; rings of glass above ---------------- */
    const rings: THREE.Mesh[] = [];
    {
      const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.3, metalness: 0.2, flatShading: true });
      const P = positionGeometry;
      const h = P.y.div(max(attribute("aH", "float"), 1));
      // light rises through each tower in slow veins, pearl to rose, brightest near the crown
      // light runs up each tower's edges: fine lines where its faces meet, a slow swell rising along them
      const ang = T.atan(P.z, P.x).div(Math.PI * 2).mul(6);
      const edge = smoothstep(0.06, 0.0, T.abs(fract(ang.add(0.5)).sub(0.5)));
      const rise = pow(fract(h.mul(0.8).sub(t.mul(0.035)).add(attribute("aH", "float").mul(0.13))), 5);
      const vein = edge.mul(rise.mul(1.4).add(0.25));
      const facets = smoothstep(0.35, 0.95, vnoise(vec2(ang, P.y.mul(0.4))));
      const hue = mix(vec3(0.75, 0.8, 1.0), vec3(1.0, 0.75, 0.9), h);
      m.colorNode = mix(vec3(0.035, 0.035, 0.07), vec3(0.09, 0.085, 0.15), facets);
      m.emissiveNode = hue.mul(vein.mul(0.9).add(smoothstep(0.85, 1.0, h).mul(0.4)).add(facets.mul(0.03))).mul(uTowers).add(vec3(1, 0.6, 0.25).mul(wave(roomPos)).mul(edge.mul(0.9).add(0.06)));
      const spots: [number, number, number, number][] = [
        // x, z, radius, height
        [-18, -30, 3.2, 34], [19, -34, 4.2, 46], [-30, -12, 2.4, 22], [30, -8, 2.8, 26], [-9, -52, 2.2, 28],
        [11, -58, 3.4, 40], [-40, -44, 5, 58], [44, -50, 4.4, 50], [0, -78, 6, 70], [-24, 12, 2.6, 20], [26, 16, 3, 24],
      ];
      for (const [x, z, r, h0] of spots) {
        const geo = new THREE.CylinderGeometry(r * 0.55, r, h0, 6, 1, false);
        geo.translate(0, h0 / 2, 0);
        // a pointed crown
        const p = geo.attributes.position as THREE.BufferAttribute;
        for (let i = 0; i < p.count; i++) if (p.getY(i) > h0 - 0.01) p.setXYZ(i, 0, h0 + r * 1.6, 0);
        geo.computeVertexNormals();
        geo.setAttribute("aH", new THREE.BufferAttribute(new Float32Array(p.count).fill(h0), 1));
        const mesh = new THREE.Mesh(geo, m);
        mesh.position.set(x, 0, z);
        mesh.rotation.y = R() * Math.PI;
        mesh.castShadow = true;
        g.add(mesh);
        ours.push(geo);
        // a ring of glass turning slowly above the taller ones
        if (h0 > 30) {
          const rg = new THREE.TorusGeometry(r * 2.4, 0.18, 8, 72);
          const rm = keepAlpha(new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, fog: false }));
          const a = uv().x.mul(Math.PI * 2);
          rm.colorNode = vec4(vec3(1.0, 0.85, 0.95).mul(sin(a.mul(3).sub(t.mul(0.6))).mul(0.4).add(0.6)).mul(uTowers).mul(0.18), 1);
          const ring = new THREE.Mesh(rg, rm);
          ring.position.set(x, h0 + r * 2.8, z);
          ring.rotation.set(Math.PI / 2 + (R() - 0.5) * 0.5, 0, R() * 3);
          g.add(ring);
          rings.push(ring);
          ours.push(rg, rm);
        }
      }
      ours.push(m);
    }

    /* ---------------- motes of light drifting (the air, gentle) ---------------- */
    {
      const n = 420;
      const s = pointCloud(n, 0.1);
      for (let i = 0; i < n; i++) {
        s.pos.set([(R() - 0.5) * 70, 0.3 + R() * 12, 10 - R() * 70], i * 3);
        s.k.set([R(), R(), R(), R()], i * 4);
      }
      touch(s.cloud);
      const K = s.cloud.nodes.aK;
      s.material.positionNode = s.cloud.nodes.position.add(vec3(sin(t.mul(0.2).add(K.x.mul(30))).mul(1.2), sin(t.mul(0.15).add(K.y.mul(30))).mul(0.8), sin(t.mul(0.17).add(K.z.mul(30))).mul(1.2)));
      const hue = mix(vec3(1.0, 0.8, 0.9), vec3(0.7, 0.9, 1.0), K.w);
      s.material.colorNode = vec4(hue.mul(s.round).mul(sin(t.mul(0.9).add(K.w.mul(40))).mul(0.3).add(0.7)).mul(0.35), 1);
      g.add(s.cloud.sprite);
      ours.push(s.material);
    }

    /* ---------------- the way on: an arch of crystal ---------------- */
    {
      const door = new THREE.Group();
      door.position.copy(PORTAL);
      g.add(door);
      const curve = new THREE.EllipseCurve(0, 0, 2.6, 5.2, 0, Math.PI, false, 0);
      const pts = curve.getPoints(40).map((p) => new THREE.Vector3(p.x, p.y, 0));
      const tg = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 60, 0.28, 8, false);
      const tm = new THREE.MeshStandardNodeMaterial({ roughness: 0.15, metalness: 0.2 });
      tm.colorNode = vec3(0.3, 0.3, 0.4);
      tm.emissiveNode = vec3(1.0, 0.85, 0.95).mul(pow(fract(uv().x.mul(2).sub(t.mul(0.08))), 8).mul(0.8).add(0.15)).mul(uPortal);
      door.add(new THREE.Mesh(tg, tm));
      const pg = new THREE.PlaneGeometry(5.2, 5.2);
      pg.translate(0, 2.6, -0.05);
      const pm = keepAlpha(new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide }));
      const U = uv();
      const inside = smoothstep(1.0, 0.8, length(U.sub(vec2(0.5, 0.0)).mul(vec2(2, 1))));
      pm.colorNode = vec4(vec3(1.0, 0.9, 0.95).mul(inside).mul(sin(t.mul(0.45)).mul(0.08).add(0.92)).mul(uPortal).mul(0.55), 1);
      door.add(new THREE.Mesh(pg, pm));
      ours.push(tg, tm, pg, pm);
    }

    // the long dusk light, low and amber, laying the towers' shadows long across the plaza
    {
      const dusk = new THREE.DirectionalLight(0xffa860, 0.9);
      dusk.position.set(PLANET.x * 90, 16, PLANET.z * 90 - 14);
      dusk.target.position.set(0, 0, -14);
      dusk.castShadow = true;
      dusk.shadow.mapSize.set(2048, 2048);
      const sc = dusk.shadow.camera as THREE.OrthographicCamera;
      sc.left = sc.bottom = -60;
      sc.right = sc.top = 60;
      sc.far = 220;
      dusk.shadow.bias = -0.0005;
      g.add(dusk, dusk.target);
    }

    /* ---------------- the people, and the threads between them ---------------- */
    const people: Person[] = [
      { x: -3.2, z: -9, face: 0.6, act: "idle" }, { x: -1.9, z: -10.2, face: -2.4, act: "idle" }, { x: -4.3, z: -10.8, face: 1.4, act: "reach" },
      { x: 5.5, z: -13, face: -1.2, act: "sit" }, { x: 6.8, z: -12, face: -2.6, act: "sit" },
      { x: 0, z: -14, face: 0, act: "walk", walkR: 6, walkC: [0, -14], walkSpeed: 0.12 },
      { x: 0, z: -14, face: 0, act: "walk", walkR: 6, walkC: [0, -14], walkSpeed: 0.12 },
      { x: -9, z: -19, face: 0.3, act: "idle" }, { x: -7.8, z: -20.5, face: -2.8, act: "reach" },
      { x: 9, z: -21, face: -0.8, act: "idle" }, { x: 2.5, z: -24, face: 3.0, act: "idle" }, { x: 3.8, z: -25, face: -2.0, act: "sit" },
      { x: -13, z: -4, face: 1.8, act: "walk", walkR: 16, walkC: [0, -16], walkSpeed: -0.05 },
      { x: 12, z: -6, face: -1.8, act: "idle" },
    ].slice(0, PEOPLE) as Person[];
    const hues = people.map((_, i) => new THREE.Color().setHSL((0.95 + i * 0.071) % 1, 0.55, 0.72));
    const bodies: { root: THREE.Group; mixer: THREE.AnimationMixer | null; mats: THREE.Material[]; ph: number }[] = [];
    const hearts = people.map((p) => new THREE.Vector3(p.x, 1.25, p.z));

    // the threads: one ribbon per pair, arcing up between two hearts
    const pairs: [number, number][] = [];
    for (let a = 0; a < people.length; a++) for (let b = a + 1; b < people.length; b++) pairs.push([a, b]);
    const segN = pairs.length * SEGS;
    const geo = ribbonGeometry(new Float32Array(segN * 6));
    const aU = new Float32Array(segN * 4), aK = new Float32Array(segN * 4);
    const aC0 = new Float32Array(segN * 4 * 3), aC1 = new Float32Array(segN * 4 * 3);
    pairs.forEach(([a, b], k) => {
      for (let s = 0; s < SEGS; s++) {
        const base = (k * SEGS + s) * 4;
        // corners A, A, B, B: A at s/SEGS, B at (s+1)/SEGS
        [s / SEGS, s / SEGS, (s + 1) / SEGS, (s + 1) / SEGS].forEach((u, c) => {
          aU[base + c] = u;
          aK[base + c] = k / pairs.length;
          aC0.set([hues[a].r, hues[a].g, hues[a].b], (base + c) * 3);
          aC1.set([hues[b].r, hues[b].g, hues[b].b], (base + c) * 3);
        });
      }
    });
    geo.setAttribute("aU", new THREE.BufferAttribute(aU, 1));
    geo.setAttribute("aK", new THREE.BufferAttribute(aK, 1));
    geo.setAttribute("aC0", new THREE.BufferAttribute(aC0, 3));
    geo.setAttribute("aC1", new THREE.BufferAttribute(aC1, 3));
    const U = attribute("aU", "float"), K = attribute("aK", "float");
    // each thread in the colours of the two it joins; a pulse of light travels along it
    // warm gold travelling from being to being: compassion as a current, not a wire
    const col = mix(mix(attribute("aC0", "vec3"), attribute("aC1", "vec3"), U), vec3(1, 0.52, 0.16), 0.72);
    const pulse = pow(fract(U.sub(t.mul(0.16)).add(K.mul(7.3))), 14).mul(1.8).add(pow(fract(U.mul(-1).sub(t.mul(0.11)).add(K.mul(3.1))), 22).mul(1.1));
    const ends = smoothstep(0.0, 0.08, U).mul(smoothstep(1.0, 0.92, U)); // they melt into the hearts
    const threadMat = keepAlpha(ribbonMaterial(col.mul(float(0.1).add(pulse).add(wave(positionGeometry).mul(0.8))).mul(ends).mul(uThreads).mul(0.55), 1.1));
    const threads = new THREE.Mesh(geo, threadMat);
    threads.frustumCulled = false;
    g.add(threads);
    ours.push(geo, threadMat);
    const posA = geo.attributes.position as THREE.BufferAttribute, othA = geo.attributes.aO as THREE.BufferAttribute;
    const pa = new THREE.Vector3(), pb = new THREE.Vector3();
    const arcPoint = (a: THREE.Vector3, b: THREE.Vector3, u: number, out: THREE.Vector3) => {
      const d = a.distanceTo(b);
      out.lerpVectors(a, b, u);
      out.y += Math.sin(u * Math.PI) * (0.25 + d * 0.09); // arcing gently up between them
      return out;
    };
    const writeThreads = () => {
      pairs.forEach(([a, b], k) => {
        for (let s = 0; s < SEGS; s++) {
          arcPoint(hearts[a], hearts[b], s / SEGS, pa);
          arcPoint(hearts[a], hearts[b], (s + 1) / SEGS, pb);
          const base = (k * SEGS + s) * 4;
          // corners: A-left, A-right (at A, other B), B-right, B-left (at B, other A)
          posA.setXYZ(base, pa.x, pa.y, pa.z); othA.setXYZ(base, pb.x, pb.y, pb.z);
          posA.setXYZ(base + 1, pa.x, pa.y, pa.z); othA.setXYZ(base + 1, pb.x, pb.y, pb.z);
          posA.setXYZ(base + 2, pb.x, pb.y, pb.z); othA.setXYZ(base + 2, pa.x, pa.y, pa.z);
          posA.setXYZ(base + 3, pb.x, pb.y, pb.z); othA.setXYZ(base + 3, pa.x, pa.y, pa.z);
        }
      });
      posA.needsUpdate = othA.needsUpdate = true;
    };
    writeThreads();

    loaded = loadBeingModel("models/wanderer.glb").then((model) => {
      if (!model) return;
      const want: Record<string, string> = { idle: "Idle_Loop", sit: "Sitting_Idle_Loop", walk: "Walk_Loop", reach: "Spell_Simple_Idle_Loop" };
      people.forEach((p, i) => {
        const root = new THREE.Group();
        const m = cloneSkinned(model.model);
        const mat = lightBodyMaterial(hues[i]);
        const mats: THREE.Material[] = [mat];
        m.traverse((o) => {
          const mesh = o as THREE.Mesh;
          if (mesh.isMesh) {
            mesh.material = mat;
            mesh.castShadow = true;
            mesh.frustumCulled = false;
          }
        });
        m.rotation.y = Math.PI;
        m.scale.setScalar(model.scale * (0.92 + R() * 0.14));
        root.add(m);
        root.position.set(p.x, 0, p.z);
        root.rotation.y = p.face;
        g.add(root);
        const mixer = new THREE.AnimationMixer(m);
        const clip = model.clips.find((c) => c.name === want[p.act]) ?? model.clips.find((c) => c.name === "Idle_Loop");
        if (clip) {
          const a = mixer.clipAction(clip);
          a.play();
          a.timeScale = p.act === "walk" ? 0.8 : 0.7;
        }
        mixer.update(R() * 4);
        bodies.push({ root, mixer, mats, ph: R() * 6 });
      });
    });

    tickers.push((dt: number) => {
      const d = Math.min(0.05, Math.max(0, dt));
      time += d;
      clock.tick(d);
      applyAir(air);
      uThreads.value = damp(uThreads.value, goal.threads, 0.12, d);
      uWaves.value = damp(uWaves.value, Math.min(1.3, 0.6 + uThreads.value * 0.45), 0.2, d);
      uTowers.value = damp(uTowers.value, goal.towers, 0.15, d);
      uPortal.value = damp(uPortal.value, goal.portal, 0.15, d);
      self = damp(self, goal.self, 0.15, d);
      for (const r of rings) r.rotation.z += d * 0.05;
      people.forEach((p, i) => {
        const b = bodies[i];
        if (p.act === "walk" && p.walkR && p.walkC) {
          // along a wide circle, a pair keeping each other company (the second a step behind)
          const off = i % 2 ? 0.35 : 0;
          const a = time * (p.walkSpeed ?? 0.1) + off + i;
          p.x = p.walkC[0] + Math.cos(a) * p.walkR;
          p.z = p.walkC[1] + Math.sin(a) * p.walkR;
          p.face = Math.atan2(-(-Math.sin(a)) * Math.sign(p.walkSpeed ?? 1), -Math.cos(a) * Math.sign(p.walkSpeed ?? 1));
        }
        hearts[i].set(p.x, p.act === "sit" ? 0.85 : 1.25, p.z);
        if (b) {
          b.root.position.set(p.x, Math.sin(time * 0.55 + b.ph) * 0.05, p.z); // breathing, rising and falling
          b.root.rotation.y = p.face;
          b.mixer?.update(d);
          for (const m of b.mats) tickLightBody(m, time + b.ph);
        }
      });
      writeThreads();
    });
    void self;
  };

  const opts: LessonOpts = {
    id: "density_4",
    trackId: "audio/densities/density_4.mp3",
    seatPos,
    seatHeading: heading,
    build,
    authoredSecs: 320, // beats written against the script's length; they follow the recording
    beats: [
      // "In the fourth density, minds are interconnected": the threads wake
      { t: 38, apply: () => (goal.threads = 0.8) },
      // "Individuality is stronger… free to be fully, extravagantly yourself": each one its own
      { t: 77, apply: () => (goal.self = 1) },
      // "harmony changes everything, including… technology": the towers' light rises
      { t: 155, apply: () => (goal.towers = 1.1) },
      // "no one gives up on the chord": the threads brighten again
      { t: 232, apply: () => (goal.threads = 1.1) },
      // "This is where you are going… cheering you toward it": all burn together; the way opens
      { t: 309, apply: () => Object.assign(goal, { threads: 1.6, towers: 1.3, portal: 1.2 }) },
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
  return Object.assign(lesson, { loaded });
}
