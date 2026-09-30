/* The ancient practices, the first chamber: stones and crystals. A pebble beach at dusk, the sea on
   the left, the first stars. A figure of light stands at the water's edge with a small stone
   glowing in its hands. Ahead, on a stone plinth, a great crystal: frozen light.

   The telling unfolds: across the water, out of the evening haze, an island rises with a temple of
   learning and great shaped crystals standing in it (Atlantis, in the story, told as a story). The
   stone amplifies whatever holds it: the great crystal warms gold for the healer's hand, then burns
   a harsh red for the grasping hand, then quiets. The stones of the island are turned to control:
   they flare red, and the sea closes over the island. The pattern repeats: along the beach four
   small plinths light one after another, each with its stone: the healer's pouch of quartz, the
   monk's bead of amber, the crystal in a watch keeping time by its trembling, a child's pocket
   pebble. At the end the stone in the figure's hands sings back, warm: what it sings is you. */
import * as THREE from "three/webgpu";
import { LessonScene } from "../lessonKit";
import type { LessonCtx, LessonOpts, SceneModule } from "../lessonKit";
import { T, hash2, vnoise } from "../../gpu/tsl";
import { landStone, stoneBlock } from "../../world/stoneworks";
import { GlassFolk } from "../glassFolk";
import { quartz } from "./monument";
import { applyAir, boulderGeometry, damp, keepAlpha, merge, pointCloud, roomClock, scannedGround, seeded, skyDome, touch, type Air, roomPos } from "../densities/roomKit";

const { exp, float, floor, length, max, mix, normalize, positionWorld, pow, sin, smoothstep, step, uniform, uv, vec2, vec3, vec4 } = T;

/** Room frame: start at the origin facing −z; the sea to the left (x < −9); the island far off. */
const SUN = new THREE.Vector3(-1, 0.04, -0.35).normalize();
const ISLAND = new THREE.Vector3(-170, 0, -150);
const PLINTH = new THREE.Vector3(-1.5, 0, -15);
export const STONES_DOOR = new THREE.Vector3(8, 0, -34);
const SEA_X = -9;

/** The beach: level where you walk, falling into the sea on the left, rising to dunes on the right. */
export function stonesFloor(x: number, z: number): number {
  const sea = Math.max(0, SEA_X - x) * 0.18;
  const dune = Math.max(0, x - 10) * 0.12;
  return dune - sea + Math.sin(z * 0.09 + x * 0.05) * 0.12;
}

export function createStonesScene(scene: THREE.Scene, narration: LessonCtx["narration"], whisper: (t: string, ms?: number) => void): SceneModule {
  const seatPos = new THREE.Vector3(0, 0, 0);
  const tickers: Array<(dt: number) => void> = [];
  const ours: Array<{ dispose(): void }> = [];
  const clock = roomClock();
  const t = clock.u;
  const uIsle = uniform(0); // the island rising out of the haze
  const uCry = uniform(0.25); // the great crystal's own light
  const uHeal = uniform(0), uGrasp = uniform(0); // what the hand brings to it
  const uMisuse = uniform(0); // the island's stones turned to control
  const uSink = uniform(0); // the sea closing over it
  const uPattern = uniform(0); // the four stones along the beach, 0 … 4
  const uSing = uniform(0.2); // the stone in the hands singing back
  const uDusk = uniform(0);
  const goal = { isle: 0, cry: 0.25, heal: 0, grasp: 0, misuse: 0, sink: 0, pattern: 0, sing: 0.2, dusk: 0 };
  const air: Air = {
    color: new THREE.Color(0.14, 0.12, 0.16),
    glow: new THREE.Color(0.55, 0.3, 0.2),
    glowDir: SUN.clone(),
    density: 0.0035,
    shadow: new THREE.Color(0.01, 0.015, 0.04),
    sat: 1.02,
    contrast: 1.05,
  };
  const R = seeded(1201);
  const folk = new GlassFolk([{ x: -4.5, z: -6, face: -Math.PI / 2 - 0.4, act: "reach", tint: new THREE.Color(1, 0.88, 0.7) }], 3);

  const build = (ctx: LessonCtx) => {
    const g = ctx.group;
    // dusk: the low sun's rose along the sea, blue above, stars coming out
    {
      const sky = skyDome(1300, new THREE.Color(0.42, 0.3, 0.34), new THREE.Color(0.05, 0.07, 0.17), {
        glowDir: SUN,
        glow: new THREE.Color(0.7, 0.3, 0.15),
        glowPow: 6,
        extra: (d, c) => {
          const sc = floor(d.mul(380));
          const star = step(0.9968, hash2(sc.xy.add(sc.z.mul(7.1)))).mul(smoothstep(0.1, 0.5, d.y)).mul(uDusk).mul(0.8);
          return c.mul(float(1).sub(uDusk.mul(0.45))).add(vec3(star));
        },
      });
      g.add(sky.mesh);
      ours.push(sky);
    }
    // the sea: dark, the sun's path on it, small waves
    {
      const geo = new THREE.PlaneGeometry(2400, 2400);
      geo.rotateX(-Math.PI / 2);
      const m = new THREE.MeshBasicNodeMaterial({ fog: true });
      const P = roomPos;
      const view = normalize(P.sub(T.cameraPosition));
      const refl = vec3(view.x, view.y.negate(), view.z);
      const wave = vnoise(P.xz.mul(vec2(0.35, 0.9)).add(vec2(t.mul(0.15), t.mul(0.05)))).mul(0.6).add(vnoise(P.xz.mul(1.4).add(vec2(0, t.mul(0.3)))).mul(0.4));
      const sunPath = pow(max(T.dot(refl, vec3(SUN.x, SUN.y, SUN.z)), 0), 24).mul(wave.mul(1.6)).mul(float(1).sub(uDusk.mul(0.6)));
      const fres = pow(float(1).sub(max(view.y.negate(), 0)), 4);
      const col = mix(vec3(0.03, 0.05, 0.08), vec3(0.3, 0.22, 0.26).mul(float(1).sub(uDusk.mul(0.5))), fres).add(vec3(1, 0.55, 0.3).mul(sunPath).mul(0.6));
      m.colorNode = vec4(col, 1);
      const sea = new THREE.Mesh(geo, m);
      sea.position.y = -0.55;
      g.add(sea);
      ours.push(geo, m);
    }
    // the beach: pebbles (the coast scan), boulders along it
    {
      const geo = new THREE.PlaneGeometry(140, 140, 140, 140);
      geo.rotateX(-Math.PI / 2);
      geo.translate(10, 0, -20);
      const p = geo.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < p.count; i++) p.setY(i, stonesFloor(p.getX(i), p.getZ(i)));
      geo.computeVertexNormals();
      const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.9, metalness: 0 });
      const scan = scannedGround("sand", 1.4, { hue: 0.35, relief: 1.6, bright: 1.6 });
      const wet = smoothstep(-0.2, -0.5, positionWorld.y);
      m.colorNode = vec3(0.3, 0.28, 0.27).mul(scan.color).mul(float(1).sub(wet.mul(0.45)));
      m.normalNode = scan.normal;
      m.roughnessNode = mix(float(0.9), float(0.35), wet);
      const beach = new THREE.Mesh(geo, m);
      beach.receiveShadow = true;
      g.add(beach);
      ours.push(geo, m);
      const rocks: THREE.BufferGeometry[] = [];
      for (let i = 0; i < 26; i++) {
        const x = SEA_X - 2 + R() * 30, z = 6 - R() * 60;
        if (Math.abs(x - PLINTH.x) < 5 && Math.abs(z - PLINTH.z) < 5) continue;
        if (Math.abs(x) < 2.5 && z > -30) continue;
        const b = boulderGeometry(0.4 + R() * R() * 2.2, i * 1.7);
        b.translate(x, stonesFloor(x, z), z);
        rocks.push(b);
      }
      const rm = landStone("sandstone_cracks", 0, 1.4, [0.5, 0.5, 0.55]);
      const rmesh = new THREE.Mesh(merge(rocks), rm);
      rmesh.castShadow = rmesh.receiveShadow = true;
      g.add(rmesh);
      ours.push(rm, rmesh.geometry);
    }
    // the great crystal on its plinth: frozen light, amplifying what the hand brings
    {
      const pl = new THREE.CylinderGeometry(1.5, 1.8, 1.2, 8);
      pl.translate(PLINTH.x, stonesFloor(PLINTH.x, PLINTH.z) + 0.6, PLINTH.z);
      const pm = landStone("sandstone_blocks_05", 0, 1.6, [1, 1, 1], {});
      g.add(new THREE.Mesh(pl, pm));
      ours.push(pl, pm);
      const cry = quartz(0.7, 4.2, 0.1, 0.3);
      cry.position.set(PLINTH.x, stonesFloor(PLINTH.x, PLINTH.z) + 1.2, PLINTH.z);
      g.add(cry);
      // its light, a colour that follows what the hand brings
      const m = keepAlpha(new THREE.SpriteNodeMaterial({ transparent: true, depthWrite: false, fog: false }));
      const r = length(uv().sub(0.5).mul(vec2(1.4, 1))).mul(2);
      const col = mix(mix(vec3(0.75, 0.82, 1), vec3(1, 0.78, 0.4), uHeal), vec3(1, 0.15, 0.08), uGrasp);
      m.colorNode = vec4(col.mul(exp(r.mul(r).mul(-3.5))).mul(smoothstep(1, 0.6, r)).mul(uCry.mul(0.5).add(uHeal).add(uGrasp.mul(1.2))).mul(0.6), 1);
      const glow = new THREE.Sprite(m);
      glow.position.set(PLINTH.x, stonesFloor(PLINTH.x, PLINTH.z) + 3.2, PLINTH.z);
      glow.scale.set(4.2, 6, 1);
      g.add(glow);
      // the crystal itself takes on what the hand brings (its core colour, per vertex)
      const aC = cry.geometry.attributes.aC as THREE.BufferAttribute;
      tickers.push(() => {
        const hue = 0.1 + uHeal.value * 0.6 + uGrasp.value * 0.9, glowK = 0.3 + uHeal.value * 0.8 + uGrasp.value;
        for (let i = 0; i < aC.count; i++) aC.setXY(i, hue, glowK);
        aC.needsUpdate = true;
      });
      ours.push(m, cry.geometry, cry.material as THREE.Material);
      const light = new THREE.PointLight(0xbfd0ff, 0, 20, 1.3);
      light.position.set(PLINTH.x, 3, PLINTH.z + 1);
      g.add(light);
      tickers.push(() => {
        light.color.setRGB(0.75, 0.82, 1).lerp(new THREE.Color(1, 0.78, 0.4), uHeal.value).lerp(new THREE.Color(1, 0.18, 0.08), uGrasp.value);
        light.intensity = 15 + 300 * (uHeal.value + uGrasp.value) + 25 * uCry.value;
      });
    }
    // the island across the water: a temple of learning with great crystals, rising out of the haze,
    // and in the end sinking as the sea closes over it
    const isle = new THREE.Group();
    isle.position.copy(ISLAND);
    g.add(isle);
    {
      const parts: THREE.BufferGeometry[] = [];
      const hill = new THREE.ConeGeometry(70, 26, 24, 3);
      hill.translate(0, 4, 0);
      parts.push(hill);
      for (let k = 0; k < 3; k++) {
        const b = new THREE.CylinderGeometry(22 - k * 6, 23 - k * 6, 4, 24);
        b.translate(0, 17 + k * 4, 0);
        parts.push(b);
      }
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        const c = new THREE.CylinderGeometry(0.9, 1.1, 9, 10);
        c.translate(Math.cos(a) * 19, 23.5, Math.sin(a) * 19);
        parts.push(c);
      }
      const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.85, metalness: 0 });
      m.colorNode = vec3(0.42, 0.36, 0.36);
      const mesh = new THREE.Mesh(merge(parts), m);
      isle.add(mesh);
      ours.push(m, mesh.geometry);
      // its crystals: tall points of light in the temple
      const n = 7;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2, r = i === 0 ? 0 : 9;
        const q = quartz(i === 0 ? 3 : 1.6, i === 0 ? 30 : 16, 0.15, 0.4);
        q.position.set(Math.cos(a) * r, 29, Math.sin(a) * r);
        isle.add(q);
        ours.push(q.geometry, q.material as THREE.Material);
      }
      const lm = keepAlpha(new THREE.SpriteNodeMaterial({ transparent: true, depthWrite: false, fog: false }));
      const r = length(uv().sub(0.5)).mul(2);
      const col = mix(vec3(0.7, 0.85, 1), vec3(1, 0.12, 0.06), uMisuse);
      lm.colorNode = vec4(col.mul(exp(r.mul(r).mul(-3))).mul(smoothstep(1, 0.6, r)).mul(uIsle).mul(float(1).sub(uSink)).mul(uMisuse.mul(0.8).add(0.45)), 1);
      const halo = new THREE.Sprite(lm);
      halo.position.set(0, 44, 0);
      halo.scale.setScalar(60);
      isle.add(halo);
      ours.push(lm);
      tickers.push(() => {
        isle.visible = uIsle.value > 0.01 && uSink.value < 0.999;
        isle.position.y = ISLAND.y - 60 * (1 - uIsle.value) - 62 * uSink.value;
      });
    }
    // the pattern repeating: four small plinths along the beach, each with its stone
    {
      const spots = [new THREE.Vector3(-2.6, 0, -24), new THREE.Vector3(-0.8, 0, -27), new THREE.Vector3(1.4, 0, -29.5), new THREE.Vector3(3.2, 0, -31.6)];
      const parts: THREE.BufferGeometry[] = [];
      const lights: THREE.Vector3[] = [];
      spots.forEach((s) => {
        const y = stonesFloor(s.x, s.z);
        const b = new THREE.CylinderGeometry(0.45, 0.55, 1, 10);
        b.translate(s.x, y + 0.5, s.z);
        parts.push(b);
        lights.push(new THREE.Vector3(s.x, y + 1.25, s.z));
      });
      const pm = landStone("sandstone_blocks_05", 0, 1.2, [1, 1, 1], {});
      const pmesh = new THREE.Mesh(merge(parts), pm);
      g.add(pmesh);
      ours.push(pm, pmesh.geometry);
      // the stones: quartz for the healer, amber for the monk, a clear sliver for the watch, a pebble
      const q = quartz(0.12, 0.45, 0.1, 0.4);
      q.position.copy(lights[0]).add(new THREE.Vector3(0, -0.2, 0));
      g.add(q);
      const amber = new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 12), new THREE.MeshStandardNodeMaterial({ roughness: 0.2, metalness: 0 }));
      (amber.material as THREE.MeshStandardNodeMaterial).colorNode = vec3(0.6, 0.3, 0.05);
      (amber.material as THREE.MeshStandardNodeMaterial).emissiveNode = vec3(0.9, 0.45, 0.08).mul(smoothstep(1.2, 2, uPattern)).mul(0.5);
      amber.position.copy(lights[1]).add(new THREE.Vector3(0, -0.1, 0));
      g.add(amber);
      const watch = quartz(0.1, 0.1, 0.3, 0.5);
      watch.rotation.x = Math.PI / 2;
      watch.position.copy(lights[2]).add(new THREE.Vector3(0, -0.2, 0));
      g.add(watch);
      const pebble = new THREE.Mesh(boulderGeometry(0.14, 7), landStone("sandstone_cracks", 0, 0.5, [0.6, 0.6, 0.66]));
      pebble.position.copy(lights[3]).add(new THREE.Vector3(0, -0.2, 0));
      g.add(pebble);
      ours.push(q.geometry, q.material as THREE.Material, amber.geometry, amber.material as THREE.Material, watch.geometry, watch.material as THREE.Material, pebble.geometry, pebble.material as THREE.Material);
      const L = pointCloud(4, 0.7);
      lights.forEach((p, i) => {
        L.pos.set([p.x, p.y, p.z], i * 3);
        L.k.set([i, 0, 0, 0], i * 4);
      });
      touch(L.cloud);
      const K = L.cloud.nodes.aK;
      const on = smoothstep(K.x.add(0.2), K.x.add(0.9), uPattern);
      const col = mix(mix(vec3(0.8, 0.88, 1), vec3(1, 0.62, 0.2), smoothstep(0.5, 1.5, K.x)), mix(vec3(0.9, 0.95, 1), vec3(1, 0.9, 0.75), smoothstep(2.5, 3.5, K.x)), smoothstep(1.5, 2.5, K.x));
      // the watch's crystal trembles: its light keeps time
      const tick = mix(float(1), step(0.5, T.fract(t)).mul(0.3).add(0.7), step(1.5, K.x).mul(step(K.x, 2.5)));
      L.material.colorNode = vec4(col.mul(L.round).mul(on).mul(tick).mul(0.8), 1);
      g.add(L.cloud.sprite);
      ours.push(L.material);
    }
    // the small stone in the figure's hands
    {
      const s = pointCloud(1, 0.35);
      s.pos.set([0, 0, 0]);
      touch(s.cloud);
      s.material.colorNode = vec4(vec3(1, 0.85, 0.6).mul(s.round).mul(uSing.mul(sin(t.mul(1.1)).mul(0.12).add(0.88))), 1);
      s.cloud.sprite.position.set(-4.5 - 0.45 * Math.sin(-Math.PI / 2 - 0.4), stonesFloor(-4.5, -6) + 1.15, -6 - 0.45 * Math.cos(-Math.PI / 2 - 0.4));
      g.add(s.cloud.sprite);
      ours.push(s.material);
    }
    // the way on: an opening between two standing stones at the beach's end
    {
      const parts: THREE.BufferGeometry[] = [];
      const y = stonesFloor(STONES_DOOR.x, STONES_DOOR.z);
      for (const dx of [-2.1, 2.1]) {
        const b = stoneBlock(1.1, 5.6, 1.1);
        b.translate(STONES_DOOR.x + dx, y + 2.8, STONES_DOOR.z);
        parts.push(b);
      }
      const l = stoneBlock(5.6, 1, 1.3);
      l.translate(STONES_DOOR.x, y + 6.1, STONES_DOOR.z);
      parts.push(l);
      const m = landStone("sandstone_cracks", 0, 1.8, [0.7, 0.68, 0.7]);
      const mesh = new THREE.Mesh(merge(parts), m);
      mesh.castShadow = true;
      g.add(mesh);
      const dg = new THREE.PlaneGeometry(3.1, 5.6);
      dg.translate(STONES_DOOR.x, y + 2.8, STONES_DOOR.z - 0.2);
      const dm = new THREE.MeshBasicNodeMaterial({ fog: false, side: THREE.DoubleSide });
      dm.colorNode = vec4(mix(vec3(0.95, 0.72, 0.4), vec3(0.4, 0.3, 0.3), uv().y).mul(0.45), 1);
      g.add(new THREE.Mesh(dg, dm));
      ours.push(m, mesh.geometry, dg, dm);
    }
    g.add(folk.group);

    tickers.push((dt: number) => {
      const d = Math.min(0.05, Math.max(0, dt));
      clock.tick(d);
      applyAir(air);
      uIsle.value = damp(uIsle.value, goal.isle, 0.08, d);
      uCry.value = damp(uCry.value, goal.cry, 0.3, d);
      uHeal.value = damp(uHeal.value, goal.heal, 0.35, d);
      uGrasp.value = damp(uGrasp.value, goal.grasp, 0.35, d);
      uMisuse.value = damp(uMisuse.value, goal.misuse, 0.2, d);
      uSink.value = damp(uSink.value, goal.sink, 0.05, d);
      uPattern.value = damp(uPattern.value, goal.pattern, 0.8, d);
      uSing.value = damp(uSing.value, goal.sing, 0.3, d);
      uDusk.value = damp(uDusk.value, goal.dusk, 0.02, d);
      folk.update(d);
    });
  };

  const opts: LessonOpts = {
    id: "practice_stones",
    trackId: "audio/adept/practice_stones.mp3",
    seatPos,
    seatHeading: 0,
    build,
    authoredSecs: 300, // beats written against the script's length; they follow the recording
    beats: [
      // "Frozen light. That is what a crystal is"
      { t: 32, apply: () => ((goal.cry = 0.7), (goal.dusk = 0.4)) },
      // "there was once a civilization that understood this"
      { t: 72, apply: () => (goal.isle = 1) },
      // "Put a healer's hand around frozen light and you get healing, concentrated"
      { t: 125, apply: () => (goal.heal = 1) },
      // "Put a grasping hand around it and you get grasping, concentrated"
      { t: 131, apply: () => ((goal.heal = 0), (goal.grasp = 1)) },
      // "The power was always in the hand"
      { t: 150, apply: () => ((goal.grasp = 0), (goal.cry = 0.5)) },
      // "aimed at control, at domination"
      { t: 164, apply: () => ((goal.misuse = 1), (goal.dusk = 0.7)) },
      // "part of what broke the island"
      { t: 178, apply: () => (goal.sink = 1) },
      // "The village healer… The monk… The engineer… The child"
      { t: 213, apply: () => (goal.pattern = 1) },
      { t: 219, apply: () => (goal.pattern = 2) },
      { t: 224, apply: () => (goal.pattern = 3) },
      { t: 229, apply: () => ((goal.pattern = 4), (goal.dusk = 1)) },
      // "The stone only sings. What it sings is you."
      { t: 262, apply: () => (goal.sing = 1) },
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
