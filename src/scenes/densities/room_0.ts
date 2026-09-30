/* The beginning (the density journey's Room 0; the owner's lesson-animations prompt: "big or
   nothing"). The narration is the origin of everything, and the room enacts it in one arc, in one
   body of light that fills the dark:

   Absolute darkness: the great sleep before the first dream, only the faintest breath in the black.
   Something stirs: a single point of light appears and chooses to move (the first freedom), a slow
   wandering curve with a thread of light behind it. Love, the creative fire: the point warms to gold
   and beats like a heart, light spiralling into it (a direction, a wordless yes). Then light, not
   gradually but all at once: it bursts, twenty thousand lights pouring outward in every direction,
   filling the room and the dark beyond it, gathering into galaxies as they fly, the stars igniting
   overhead. Why: it scatters itself like seeds across the dark, dimmer and wide. The circle: the
   scattered lights turn about you in one vast wheel. And the last: the beginning never ended, it
   moved into you: the lights stream in from everywhere and gather at your own heart. */
import * as THREE from "three/webgpu";
import { LessonScene } from "../lessonKit";
import type { LessonCtx, LessonOpts, SceneModule } from "../lessonKit";
import { T, hash2 } from "../../gpu/tsl";
import { MOBILE } from "../../core/quality";
import { applyAir, pointCloud, roomClock, scannedGround, seeded, skyDome, touch, type Air } from "./roomKit";
import { env, lessonDark } from "../enacted";

const { cos, exp, float, floor, fract, max, mix, pow, sin, smoothstep, step, uniform, vec3, vec4 } = T;

/** Where you stand (room frame; the journey sets you at z 1.5 facing −z): your heart. */
const HEART = new THREE.Vector3(0, 1.3, 1.5);
const ORIGIN = new THREE.Vector3(0, 4, -14); // where the first light appears and bursts

export function createDensityRoom0Scene(scene: THREE.Scene, narration: LessonCtx["narration"], whisper: (t: string, ms?: number) => void): SceneModule {
  const tickers: Array<(dt: number) => void> = [];
  const ours: Array<{ dispose(): void }> = [];
  const clock = roomClock();
  const t = clock.u;
  const u = {
    breath: uniform(0.2),
    point: uniform(0), // the single light
    love: uniform(0), // its warmth and heartbeat, the light drawn into it
    burst: uniform(0), // 0 → 1: the outpouring
    stars: uniform(0),
    scatter: uniform(0),
    circle: uniform(0),
    home: uniform(0), // gathering into you
    turn: uniform(0),
  };
  const pointAt = uniform(ORIGIN.clone());
  const air: Air = {
    color: new THREE.Color(0, 0, 0),
    glow: new THREE.Color(0, 0, 0),
    glowDir: new THREE.Vector3(0, 1, 0),
    density: 0.0005,
    shadow: new THREE.Color(0, 0, 0),
    sat: 1.05,
    contrast: 1.08,
  };
  let time = 0, turn = 0;

  const build = (ctx: LessonCtx) => {
    const g = ctx.group;
    const R = seeded(1001);

    /* ---------------- the dark, and the stars that ignite in it ---------------- */
    {
      const sky = skyDome(500, new THREE.Color(0, 0, 0), new THREE.Color(0, 0, 0), {
        extra: (d, c) => {
          const sc = floor(d.mul(300));
          const h = hash2(sc.xy.add(sc.z.mul(3.7)));
          // they ignite not all at once but in a rush, each at its own moment, like eyes opening
          const lit = step(0.994, h).mul(smoothstep(h.sub(0.994).mul(160), h.sub(0.994).mul(160).add(0.05), u.stars));
          const tw = sin(t.mul(float(0.5).add(h.mul(2))).add(h.mul(400))).mul(0.3).add(0.7);
          const col = mix(vec3(0.8, 0.86, 1), vec3(1, 0.9, 0.75), fract(h.mul(97)));
          return c.add(col.mul(lit).mul(tw).mul(1.2));
        },
      });
      g.add(sky.mesh);
      ours.push(sky);
    }
    // the floor: black stone, seen only by what light there is
    {
      const geo = new THREE.PlaneGeometry(120, 120, 20, 20);
      geo.rotateX(-Math.PI / 2);
      const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.75, metalness: 0 });
      const scan = scannedGround("rock", 3, { hue: 0.2, relief: 0.8, bright: 0.9 });
      m.colorNode = vec3(0.012, 0.011, 0.013).mul(scan.color);
      m.normalNode = scan.normal;
      const mesh = new THREE.Mesh(geo, m);
      mesh.receiveShadow = true;
      g.add(mesh);
      ours.push(geo, m);
    }

    /* ---------------- the one body of light ---------------- */
    {
      const n = MOBILE ? 16000 : 22000;
      const s = pointCloud(n, 0.15);
      for (let i = 0; i < n; i++) {
        // its direction out of the burst (galaxies: most fly with one of a dozen clusters)
        const cl = Math.floor(R() * 14);
        s.pos.set([cl, 0, 0], i * 3);
        s.k.set([R(), R(), R(), R()], i * 4);
      }
      touch(s.cloud);
      const K = s.cloud.nodes.aK, P = s.cloud.nodes.position;
      const cl = P.x;
      // a random direction, and its cluster's direction (a galaxy flying outward)
      const th = K.x.mul(Math.PI * 2), ph = T.acos(K.y.mul(2).sub(1));
      const dir = vec3(sin(ph).mul(cos(th)), cos(ph), sin(ph).mul(sin(th)));
      // the galaxies fly out ahead of you and upward, so the one who watches sees them form
      const cdir = T.normalize(vec3(fract(cl.mul(0.618)).mul(2).sub(1).mul(0.85), fract(cl.mul(0.371)).mul(0.9).add(0.05), float(-1).add(fract(cl.mul(0.211)).mul(0.5))));
      const inCluster = step(0.3, K.z);
      const speed = K.w.mul(0.8).add(0.2);
      // the burst: fast at first, slowing as it fills everything
      const reach = float(1).sub(exp(u.burst.mul(-4))).mul(34).mul(speed);
      // within a galaxy, a small spiral about its centre
      // each galaxy flies out as one body, to its own distance, turning about its centre
      const creach = float(1).sub(exp(u.burst.mul(-4))).mul(fract(cl.mul(0.537)).mul(18).add(9));
      const disk = vec3(cos(K.x.mul(40).add(t.mul(0.12))), sin(K.y.mul(20)).mul(0.18), sin(K.x.mul(40).add(t.mul(0.12)))).mul(pow(K.w, 0.7).mul(3.6).mul(u.burst.min(1)));
      let p = pointAt.add(mix(dir.mul(reach), cdir.mul(creach).add(disk), inCluster));
      // scattered like seeds across the dark: drifting wider, each its own way
      p = p.add(dir.mul(u.scatter.mul(K.z.mul(12).add(4))));
      // the circle: everything turns about you, drawn toward one vast wheel
      const rel = p.sub(vec3(HEART.x, 0, HEART.z));
      const ang = T.atan(rel.z, rel.x).add(u.turn.mul(float(0.6).add(K.w.mul(0.8))));
      const rr = T.length(rel.xz);
      const wheelR = mix(rr, float(9).add(K.z.mul(12)), u.circle.mul(0.85));
      const wheelY = mix(p.y, float(3).add(sin(ang.mul(3).add(K.x.mul(6))).mul(2.5)).add(K.y.mul(4)), u.circle.mul(0.6));
      p = mix(p, vec3(float(HEART.x).add(cos(ang).mul(wheelR)), max(wheelY, float(0.3)), float(HEART.z).add(sin(ang).mul(wheelR))), step(0.001, u.circle));
      // and home: each light comes in on its own delay and gathers at your heart
      const mine = smoothstep(K.z.mul(0.7), K.z.mul(0.7).add(0.3), u.home);
      const heart = vec3(HEART.x, HEART.y, HEART.z).add(dir.mul(0.25));
      p = mix(p, heart, mine.mul(mine));
      // before the burst: only the few drawn spiralling into the point (the yes)
      const drawn = step(K.w, 0.12);
      const inA = K.x.mul(6.283).add(t.mul(1.1));
      const inR = fract(K.y.add(t.mul(0.16))).oneMinus().mul(9);
      const gather = pointAt.add(vec3(cos(inA).mul(inR), sin(inA.mul(0.7)).mul(inR).mul(0.4), sin(inA).mul(inR)));
      const pre = step(u.burst, 0.001);
      s.material.positionNode = mix(p, gather, pre.mul(drawn));
      const col = mix(mix(vec3(1, 0.95, 0.85), vec3(0.75, 0.82, 1), K.z.mul(u.scatter)), vec3(1, 0.82, 0.5), mine.max(u.love.mul(pre)));
      const tw = sin(t.mul(float(0.8).add(K.y)).add(K.x.mul(60))).mul(0.25).add(0.75);
      const vis = mix(drawn.mul(u.love).mul(fract(K.y.add(t.mul(0.16))).mul(0.8)), float(1), float(1).sub(pre));
      const flash = exp(u.burst.mul(-6)).mul(2.5).mul(float(1).sub(pre));
      s.material.colorNode = vec4(col.mul(s.round).mul(tw).mul(vis).mul(float(0.75).add(flash)).mul(float(1).sub(u.scatter.mul(0.2))).mul(float(1).add(u.circle.mul(1.1)).add(mine)), 1);
      g.add(s.cloud.sprite);
      ours.push(s.material);
    }
    // the single light itself: a point that chooses to move, a thread of light behind it
    {
      const n = 240;
      const s = pointCloud(n, 0.26);
      for (let i = 0; i < n; i++) s.k.set([i / n, R(), 0, 0], i * 4);
      touch(s.cloud);
      const K = s.cloud.nodes.aK;
      // the trail: where it was a moment ago (the same wandering curve, earlier)
      const lag = K.x.mul(6);
      const tt = t.sub(lag);
      const wander = vec3(sin(tt.mul(0.23)).mul(3.2).add(sin(tt.mul(0.61)).mul(0.8)), sin(tt.mul(0.31)).mul(1.4), cos(tt.mul(0.19)).mul(2.2));
      const moving = u.point.mul(float(1).sub(u.love.mul(0.8)));
      s.material.positionNode = pointAt.add(wander.sub(vec3(sin(t.mul(0.23)).mul(3.2).add(sin(t.mul(0.61)).mul(0.8)), sin(t.mul(0.31)).mul(1.4), cos(t.mul(0.19)).mul(2.2))).mul(moving));
      const beat = pow(max(sin(t.mul(4.2)), 0), 12).add(pow(max(sin(t.mul(4.2).sub(0.7)), 0), 12).mul(0.6));
      const head = step(K.x, 0.001);
      const col = mix(vec3(0.9, 0.93, 1), vec3(1, 0.72, 0.36), u.love);
      const b = mix(float(1).sub(K.x).mul(0.18).mul(moving), float(1.3).add(beat.mul(u.love).mul(1.4)), head);
      s.material.colorNode = vec4(col.mul(s.round).mul(b).mul(u.point).mul(float(1).sub(smoothstep(0, 0.05, u.burst))), 1);
      g.add(s.cloud.sprite);
      ours.push(s.material);
    }
    // the faint breath in the black before anything: a barely-there swell
    {
      const n = 600;
      const s = pointCloud(n, 0.6);
      for (let i = 0; i < n; i++) {
        s.pos.set([(R() - 0.5) * 60, R() * 16, -R() * 50 + 5], i * 3);
        s.k.set([R(), R(), 0, 0], i * 4);
      }
      touch(s.cloud);
      const K = s.cloud.nodes.aK;
      const br = sin(t.mul(0.25).add(K.x.mul(2))).mul(0.5).add(0.5);
      s.material.colorNode = vec4(vec3(0.3, 0.25, 0.45).mul(s.round).mul(br).mul(u.breath).mul(0.1), 1);
      g.add(s.cloud.sprite);
      ours.push(s.material);
    }
    // the light's own light on the floor: at the point, in the burst, and at the end at your heart
    const glow = new THREE.PointLight(0xfff0d8, 0, 60, 2);
    g.add(glow);
    const homeLight = new THREE.PointLight(0xffc880, 0, 14, 2);
    homeLight.position.copy(HEART).setY(2.4);
    g.add(homeLight);

    tickers.push((dt: number) => {
      const d = Math.min(0.05, Math.max(0, dt));
      time += d;
      clock.tick(d);
      applyAir(air);
      lessonDark.k = 1; // the world's moon and sky light have no place here: only this light
      const nt = narration.current ? narration.time() : 0;
      const pr = narration.progress();
      const k = pr ? pr.total / 134.1 : 1; // the beats are written against the recording's length
      const s = nt / k;
      u.breath.value = env(s, [[0, 0.6], [14, 1], [50, 0]]);
      u.point.value = env(s, [[0, 0], [14.3, 0], [17, 1]]);
      u.love.value = env(s, [[0, 0], [32, 0], [40, 1]]);
      u.burst.value = env(s, [[0, 0], [50.6, 0], [51.5, 0.08], [62, 0.55], [80, 1]]);
      u.stars.value = env(s, [[0, 0], [57, 0], [66, 1], [106, 1], [133, 0.6]]);
      u.scatter.value = env(s, [[0, 0], [80, 0], [92, 1], [106, 1], [112, 0.4]]);
      u.circle.value = env(s, [[0, 0], [92.9, 0], [104, 1], [112, 1], [125, 0.6]]);
      u.home.value = env(s, [[0, 0], [110, 0], [133, 1]]);
      turn += d * 0.06 * u.circle.value;
      u.turn.value = turn;
      glow.position.copy(pointAt.value);
      glow.intensity = 30 * u.point.value * (1 + u.love.value * 2) * (1 - u.burst.value) + 900 * Math.exp(-u.burst.value * 5) * (u.burst.value > 0.001 ? 1 : 0);
      homeLight.intensity = 60 * u.home.value;
    });
  };

  const opts: LessonOpts = {
    id: "density_0",
    trackId: "audio/densities/the_beginning.mp3",
    seatPos: new THREE.Vector3(0, 0, 0),
    seatHeading: 0,
    build,
    beats: [],
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
  return lesson;
}
