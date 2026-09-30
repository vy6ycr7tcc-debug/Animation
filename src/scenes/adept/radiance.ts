/* The Adept, the third station: the radiance. Dawn on a high round terrace of stone above a sea of
   cloud. At its heart a stone basin, and beside it a figure of light sitting quietly: not a
   conqueror, a servant. A lantern hangs over the door on the far side.

   As the narration goes: the dawn comes up; the servant's light grows clearer and more transparent;
   joy overflows from it as motes of light spilling outward, without effort; healing the self heals
   the world a little, rings spreading over the cloud sea; the tuning fork: slow rings of light pass
   through the air to the horizon, and one by one far standing stones answer, glowing in resonance.
   Power, love, wisdom: three pillars of light stand round the terrace (gold, rose, blue), balanced
   about the heart. Service finds the servant as rivers find the sea: streams of light come over the
   clouds to the terrace. The vow: the sun clears the horizon. The future self: a second figure of
   light walks in and sits beside the first. At the end, one small light leaves the terrace and
   travels away over the clouds toward the dark side of the world: toward someone awake at three in
   the morning. */
import * as THREE from "three/webgpu";
import { LessonScene } from "../lessonKit";
import type { LessonCtx, LessonOpts, SceneModule } from "../lessonKit";
import { T, vnoise } from "../../gpu/tsl";
import { landStone, stoneBlock } from "../../world/stoneworks";
import { GlassFolk } from "../glassFolk";
import { applyAir, cloudSheet, damp, keepAlpha, merge, pointCloud, roomClock, roughBlock, seeded, skyDome, touch, type Air, roomPos } from "../densities/roomKit";

const { abs, exp, float, fract, length, max, mix, normalize, positionWorld, pow, sin, smoothstep, uniform, uv, vec2, vec3, vec4 } = T;

/** Room frame: you start at z 9 facing −z; the terrace's heart at the origin; the door at z −17. */
const TERRACE_R = 17;
const SUN = new THREE.Vector3(0, 0.02, -1).normalize();
export const RAD_DOOR = new THREE.Vector3(0, 0, -TERRACE_R);

export function createRadianceScene(scene: THREE.Scene, narration: LessonCtx["narration"], whisper: (t: string, ms?: number) => void): SceneModule {
  const seatPos = new THREE.Vector3(0, 0, 9);
  const tickers: Array<(dt: number) => void> = [];
  const ours: Array<{ dispose(): void }> = [];
  const clock = roomClock();
  const t = clock.u;
  const uDawn = uniform(0.25);
  const uClear = uniform(0); // the servant's light, clearer
  const uJoy = uniform(0);
  const uHeal = uniform(0); // rings over the clouds
  const uFork = uniform(0); // the tuning fork's rings through the air
  const uAnswer = uniform(0); // far stones answering, 0 … 1 round the horizon
  const uLegs = uniform(0); // power, love, wisdom
  const uRivers = uniform(0);
  const uSun = uniform(0);
  const uSend = uniform(-1); // the light sent away (0 … 1 along its way; <0 not yet)
  const goal = { dawn: 0.25, clear: 0, joy: 0, heal: 0, fork: 0, answer: 0, legs: 0, rivers: 0, sun: 0 };
  let sending = false;
  const air: Air = {
    color: new THREE.Color(0.11, 0.09, 0.12),
    glow: new THREE.Color(0.75, 0.48, 0.3),
    glowDir: SUN.clone(),
    density: 0.0011,
    shadow: new THREE.Color(0.02, 0.02, 0.05),
    sat: 1.05,
    contrast: 1.04,
  };
  const R = seeded(733);
  const folk = new GlassFolk([
    { x: 1.3, z: 0.4, face: Math.PI * 0.85, act: "sit", tint: new THREE.Color(1, 0.9, 0.72) },
    { x: -9, z: -13, face: 0.6, act: "walk", tint: new THREE.Color(0.85, 0.9, 1), glow: { inner: 0.22, edge: 0.7, body: 0.3 } },
  ], 57);
  const futureFrom = new THREE.Vector3(-9, 0, -13), futureTo = new THREE.Vector3(-1.1, 0, 0.6);
  let futureK = 0, futureGo = false, futureSat = false;

  const build = (ctx: LessonCtx) => {
    const g = ctx.group;
    // the dawn sky: cool blue above, peach and rose low ahead where the sun will rise
    {
      const sky = skyDome(1200, new THREE.Color(0.34, 0.24, 0.26), new THREE.Color(0.04, 0.07, 0.19), {
        glowDir: SUN,
        glow: new THREE.Color(0.6, 0.32, 0.18),
        glowPow: 5,
        extra: (d, c) => {
          const cosA = T.dot(d, vec3(SUN.x, SUN.y, SUN.z));
          const disc = smoothstep(0.9993, 0.9996, cosA).mul(smoothstep(-0.02, 0.01, d.y));
          const halo = pow(max(cosA, 0), 60).mul(0.5);
          const lit = mix(float(0.5), float(1.0), uDawn);
          return c.mul(lit).add(vec3(1, 0.85, 0.6).mul(disc.mul(2.2).add(halo)).mul(uSun));
        },
      });
      g.add(sky.mesh);
      ours.push(sky);
    }
    // the sea of cloud below the terrace, rings of healing spreading over it
    {
      const clouds = cloudSheet(2400, -26, t, (_q, cover) => {
        const P = roomPos;
        const toSun = smoothstep(-0.2, 1, normalize(P.xz).dot(vec2(SUN.x, SUN.z)));
        const base = mix(vec3(0.62, 0.55, 0.6), vec3(1, 0.78, 0.6), toSun.mul(0.7)).mul(mix(float(0.5), float(1), uDawn));
        const r = length(P.xz);
        const ring = smoothstep(1.4, 0, abs(fract(r.div(40).sub(t.mul(0.05))).sub(0.5).mul(40))).mul(smoothstep(600, 60, r)).mul(uHeal);
        const stream = pow(abs(sin(T.atan(P.z, P.x).mul(5).add(vnoise(P.xz.mul(0.01)).mul(3)))), 40).mul(smoothstep(900, 40, r)).mul(uRivers);
        return base.mul(cover.mul(0.35).add(0.75)).add(vec3(1, 0.9, 0.75).mul(ring.mul(0.35).add(stream.mul(0.4))));
      }, { scale: 0.004, cover: [0.2, 0.7], opacity: 1, drift: [0.003, 0.001] });
      g.add(clouds.mesh);
      ours.push(clouds);
    }
    // the terrace: a round of worn stone on a rough rock that falls away beneath it
    {
      const top = new THREE.CylinderGeometry(TERRACE_R, TERRACE_R - 1.4, 1.2, 72);
      top.translate(0, -0.6, 0);
      const rock = new THREE.ConeGeometry(TERRACE_R - 1, 34, 18, 6);
      rock.rotateX(Math.PI);
      rock.translate(0, -1.2 - 17, 0);
      const p = rock.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
        const k = 1 + (Math.sin(x * 0.7 + y * 0.3) * Math.cos(z * 0.6 - y * 0.2)) * 0.18;
        p.setXYZ(i, x * k, y, z * k);
      }
      rock.computeVertexNormals();
      const basin = new THREE.CylinderGeometry(0.8, 0.6, 0.8, 24);
      basin.translate(0, 0.4, 0);
      const parts: THREE.BufferGeometry[] = [top, rock, basin];
      // the door: two jambs and a lintel at the far edge
      for (const x of [-2.3, 2.3]) {
        const j = stoneBlock(1.1, 6.4, 1.2);
        j.translate(x, 3.2, RAD_DOOR.z + 0.6);
        parts.push(j);
      }
      const l = stoneBlock(6, 1.1, 1.4);
      l.translate(0, 6.95, RAD_DOOR.z + 0.6);
      parts.push(l);
      const m = landStone("red_sandstone_pavement", 0, 3.4, [1.08, 0.98, 0.92], { flag: 1.2 });
      const mesh = new THREE.Mesh(merge(parts), m);
      mesh.castShadow = mesh.receiveShadow = true;
      g.add(mesh);
      ours.push(m, mesh.geometry);
      // the basin's water, holding the dawn
      const wg = new THREE.CircleGeometry(0.72, 24);
      wg.rotateX(-Math.PI / 2);
      wg.translate(0, 0.79, 0);
      const wm = new THREE.MeshBasicNodeMaterial({ fog: false });
      wm.colorNode = vec4(mix(vec3(0.3, 0.25, 0.3), vec3(1, 0.82, 0.62), uDawn).mul(0.8), 1);
      g.add(new THREE.Mesh(wg, wm));
      ours.push(wg, wm);
      // the lantern hung over the door
      const lm = keepAlpha(new THREE.SpriteNodeMaterial({ transparent: true, depthWrite: false, fog: false }));
      const r = length(uv().sub(0.5)).mul(2);
      lm.colorNode = vec4(vec3(1, 0.85, 0.55).mul(exp(r.mul(r).mul(-6))).mul(smoothstep(1, 0.5, r)).mul(0.8), 1);
      const lantern = new THREE.Sprite(lm);
      lantern.position.set(0, 7.9, RAD_DOOR.z + 0.6);
      lantern.scale.setScalar(1.3);
      g.add(lantern);
      // through the door: the next light
      const dg = new THREE.PlaneGeometry(3.5, 6.4);
      dg.translate(0, 3.2, RAD_DOOR.z + 0.3);
      const dm = new THREE.MeshBasicNodeMaterial({ fog: false, side: THREE.DoubleSide });
      dm.colorNode = vec4(mix(vec3(0.95, 0.85, 0.75), vec3(0.8, 0.88, 1), uv().y).mul(0.55), 1);
      g.add(new THREE.Mesh(dg, dm));
      ours.push(lm, dg, dm);
    }
    // joy overflowing: motes spilling from the servant's heart, drifting out over the terrace
    {
      const n = 500;
      const s = pointCloud(n, 0.12);
      for (let i = 0; i < n; i++) {
        s.pos.set([0, 0, 0], i * 3);
        s.k.set([R(), R(), R(), R()], i * 4);
      }
      touch(s.cloud);
      const K = s.cloud.nodes.aK;
      const life = fract(K.x.add(t.mul(float(0.03).add(K.y.mul(0.03)))));
      const a = K.z.mul(6.283);
      const r = life.mul(float(6).add(K.w.mul(14)));
      s.material.positionNode = vec3(T.cos(a).mul(r), sin(life.mul(3).add(K.w.mul(9))).mul(0.4).add(life.mul(2.5)), T.sin(a).mul(r));
      s.material.colorNode = vec4(vec3(1, 0.88, 0.62).mul(s.round).mul(smoothstep(0, 0.05, life)).mul(float(1).sub(life)).mul(uJoy).mul(0.8), 1);
      s.cloud.sprite.position.set(1.3, 1.1, 0.4);
      g.add(s.cloud.sprite);
      ours.push(s.material);
    }
    // the tuning fork: slow rings of light through the air, out to the horizon
    {
      const geo = new THREE.RingGeometry(0.97, 1, 128, 1);
      geo.rotateX(-Math.PI / 2);
      const rings: THREE.Mesh[] = [];
      for (let k = 0; k < 3; k++) {
        const m = keepAlpha(new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide }));
        const ph = fract(t.mul(0.045).add(k / 3));
        m.colorNode = vec4(vec3(1, 0.92, 0.78).mul(smoothstep(0, 0.1, ph)).mul(float(1).sub(ph)).mul(uFork).mul(0.45), 1);
        const ring = new THREE.Mesh(geo, m);
        ring.position.y = 1.2;
        g.add(ring);
        rings.push(ring);
        ours.push(m);
        tickers.push(() => {
          const p = (clock.u.value * 0.045 + k / 3) % 1;
          ring.scale.setScalar(2 + p * 700);
        });
      }
      ours.push(geo);
      // far standing stones round the horizon, answering one by one
      const n = 14;
      const stones: THREE.BufferGeometry[] = [];
      const tops: number[] = [];
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + 0.2, r = 260 + R() * 160;
        const h = 16 + R() * 22;
        const b = roughBlock(6, h, 4, 0.3, i * 3.7);
        b.applyMatrix4(new THREE.Matrix4().makeRotationY(-a).setPosition(Math.sin(a) * r, -28, Math.cos(a) * r));
        stones.push(b);
        tops.push(Math.sin(a) * r, -28 + h + 3, Math.cos(a) * r, i / n);
      }
      const sm = new THREE.MeshStandardNodeMaterial({ roughness: 0.9, metalness: 0 });
      sm.colorNode = vec3(0.35, 0.3, 0.3);
      const smesh = new THREE.Mesh(merge(stones), sm);
      g.add(smesh);
      const L = pointCloud(n, 5);
      for (let i = 0; i < n; i++) {
        L.pos.set([tops[i * 4], tops[i * 4 + 1], tops[i * 4 + 2]], i * 3);
        L.k.set([tops[i * 4 + 3], R(), 0, 0], i * 4);
      }
      touch(L.cloud);
      const K = L.cloud.nodes.aK;
      L.material.colorNode = vec4(vec3(1, 0.86, 0.6).mul(L.round).mul(smoothstep(K.x, K.x.add(0.08), uAnswer)).mul(sin(t.mul(0.8).add(K.y.mul(6))).mul(0.15).add(0.85)).mul(0.7), 1);
      g.add(L.cloud.sprite);
      ours.push(sm, smesh.geometry, L.material);
    }
    // power, love, wisdom: three pillars of light round the terrace
    {
      const cols = [new THREE.Vector3(1, 0.8, 0.4), new THREE.Vector3(1, 0.55, 0.65), new THREE.Vector3(0.5, 0.7, 1)];
      const geo = new THREE.CylinderGeometry(0.5, 0.5, 26, 24, 1, true);
      geo.translate(0, 13, 0);
      cols.forEach((c, i) => {
        const a = (i / 3) * Math.PI * 2 + Math.PI / 3;
        const m = keepAlpha(new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide }));
        const y = T.positionGeometry.y.div(26);
        const edge = pow(float(1).sub(abs(T.dot(normalize(T.normalWorld), normalize(T.cameraPosition.sub(positionWorld))))), 1.5);
        m.colorNode = vec4(vec3(c.x, c.y, c.z).mul(edge.mul(0.5).add(0.15)).mul(smoothstep(0, 0.1, y)).mul(smoothstep(1, 0.4, y)).mul(uLegs).mul(0.5), 1);
        const pillar = new THREE.Mesh(geo, m);
        pillar.position.set(Math.sin(a) * 10.5, 0, Math.cos(a) * 10.5);
        g.add(pillar);
        ours.push(m);
      });
      ours.push(geo);
    }
    // the light sent away over the clouds
    {
      const s = pointCloud(1, 0.9);
      s.pos.set([0, 0, 0]);
      touch(s.cloud);
      const k = uSend.max(0);
      s.material.positionNode = vec3(k.mul(-40).mul(k), float(2).add(k.mul(30)).sub(k.mul(k).mul(40)), k.mul(360));
      s.material.colorNode = vec4(vec3(1, 0.92, 0.75).mul(s.round).mul(smoothstep(-0.02, 0.02, uSend)).mul(smoothstep(1, 0.8, uSend)), 1);
      s.cloud.sprite.position.set(0, 0, 0);
      g.add(s.cloud.sprite);
      ours.push(s.material);
    }
    g.add(folk.group);
    // the low sun's light on the terrace, growing with the dawn
    const sun = new THREE.DirectionalLight(0xffd2a0, 0.6);
    sun.position.set(SUN.x * 100, 22, SUN.z * 100);
    sun.target.position.set(0, 0, 0);
    sun.castShadow = true;
    g.add(sun, sun.target);
    tickers.push(() => (sun.intensity = 0.5 + 2.4 * uDawn.value + 0.8 * uSun.value));

    tickers.push((dt: number) => {
      const d = Math.min(0.05, Math.max(0, dt));
      clock.tick(d);
      applyAir(air);
      uDawn.value = damp(uDawn.value, goal.dawn, 0.05, d);
      uClear.value = damp(uClear.value, goal.clear, 0.15, d);
      uJoy.value = damp(uJoy.value, goal.joy, 0.2, d);
      uHeal.value = damp(uHeal.value, goal.heal, 0.15, d);
      uFork.value = damp(uFork.value, goal.fork, 0.2, d);
      uAnswer.value = Math.min(goal.answer, uAnswer.value + d / 20);
      uLegs.value = damp(uLegs.value, goal.legs, 0.25, d);
      uRivers.value = damp(uRivers.value, goal.rivers, 0.12, d);
      uSun.value = damp(uSun.value, goal.sun, 0.1, d);
      if (sending) uSend.value = Math.min(1.01, uSend.value + d / 24);
      air.glow.setRGB(0.5 + 0.35 * uDawn.value, 0.32 + 0.22 * uDawn.value, 0.22 + 0.1 * uDawn.value);
      const [servant, future] = folk.bodies;
      if (servant) servant.mat.emissiveIntensity = 1 + uClear.value * 0.6;
      if (future) {
        if (futureGo && futureK < 1) futureK = Math.min(1, futureK + d / 16);
        future.root.position.lerpVectors(futureFrom, futureTo, futureK);
        future.root.visible = futureGo;
        if (futureK >= 1 && !futureSat) {
          futureSat = true;
          future.act("sit");
          future.root.rotation.y = Math.PI * 0.85;
        }
      }
      folk.update(d);
    });
  };

  const opts: LessonOpts = {
    id: "adept_radiance",
    trackId: "audio/adept/adept_3_the_radiance.mp3",
    seatPos,
    seatHeading: 0,
    build,
    authoredSecs: 300, // beats written against the script's length; they follow the recording
    beats: [
      { t: 2, apply: () => (goal.dawn = 0.5) },
      // "Transparent, without the performance of personality"
      { t: 22, apply: () => (goal.clear = 1) },
      // "joy cannot be contained. It radiates."
      { t: 72, apply: () => ((goal.joy = 1), (goal.dawn = 0.7)) },
      // "To heal yourself in the direction of love is to heal the world a little"
      { t: 100, apply: () => (goal.heal = 1) },
      // "Such a one becomes a tuning fork for the planet"
      { t: 128, apply: () => ((goal.fork = 1), (goal.answer = 1)) },
      // "Power. Love. Wisdom."
      { t: 160, apply: () => ((goal.legs = 1), (goal.heal = 0.4)) },
      // "Service finds the servant the way rivers find the sea."
      { t: 214, apply: () => ((goal.rivers = 1), (goal.fork = 0.5)) },
      // "I desire to know in order to serve."
      { t: 232, apply: () => ((goal.sun = 1), (goal.dawn = 1)) },
      // "the deeper self… is yourself at a different stage… Your future, reaching back"
      { t: 250, apply: () => (futureGo = true) },
      // "the radiance… is already on its way to them"
      { t: 292, apply: () => ((uSend.value = 0), (sending = true)) },
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
