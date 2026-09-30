/* The sixth density (the owner's concept, 2026-09-30, replacing the handover's "Merging"). The room
   is pitch black: the owner's one exception to the game's no-void rule. In it, countless points of
   light drift slowly, each a soul, each its own hue and breath. Then they begin to flow back toward
   the centre: slowly at first, then with gathering inevitability, streams of light bending inward
   from every direction and spiralling as they come. At the centre they become one: a single
   radiant point, the "we" that is also "I". Then the point collapses into a black hole: a disc of
   darkness ringed by a thin, fierce ring of light, the last souls spiralling into it, soft in the
   game's own language (glow and points, no hard edges). Beyond it, the way on: a single door of
   pure white light, nothing else. The progression follows the narration (beats); the souls, the
   ring and the inflow are always in motion. */
import * as THREE from "three/webgpu";
import { LessonScene } from "../lessonKit";
import type { LessonCtx, LessonOpts, SceneModule } from "../lessonKit";
import { T, vnoise } from "../../gpu/tsl";
import { applyAir, damp, keepAlpha, pointCloud, roomClock, seeded, touch, type Air } from "./roomKit";

const { abs, atan, clamp, cos, exp, float, fract, length, max, mix, pow, sin, smoothstep, uniform, uv, vec2, vec3, vec4 } = T;

const C = new THREE.Vector3(0, 3.2, -18); // the centre everything returns to
const DOOR = new THREE.Vector3(15, 0, -36); // off to the right, beyond the centre: never behind the hole
const SOULS = 6500;
const INFALL = 1400;

export function createDensityRoom6Scene(
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
  const uConv = uniform(0); // 0 drifting … 1 all returned to the centre
  const uOne = uniform(0); // the radiant point
  const uHole = uniform(0); // the collapse: the black hole
  const uDoor = uniform(0.25); // the white door
  const goal = { conv: 0, one: 0, hole: 0, door: 0.25 };
  // pitch black: no fog to lift it, no colour in the air
  const air: Air = {
    color: new THREE.Color(0, 0, 0),
    glow: new THREE.Color(0, 0, 0),
    glowDir: new THREE.Vector3(0, 1, 0),
    density: 0,
    shadow: new THREE.Color(0, 0, 0),
    sat: 1.05,
    contrast: 1.05,
  };

  const build = (ctx: LessonCtx) => {
    const g = ctx.group;
    const t = clock.u;
    const R = seeded(6601);
    const c = vec3(C.x, C.y, C.z);

    /* ---------------- the dark: a black dome, nothing else ---------------- */
    {
      const geo = new THREE.SphereGeometry(300, 16, 8);
      const m = new THREE.MeshBasicNodeMaterial({ side: THREE.BackSide, fog: false, depthWrite: false });
      m.colorNode = vec3(0, 0, 0);
      const dome = new THREE.Mesh(geo, m);
      dome.renderOrder = -10;
      g.add(dome);
      ours.push(geo, m);
    }

    /* ---------------- the souls ---------------- */
    {
      const s = pointCloud(SOULS, 0.16);
      for (let i = 0; i < SOULS; i++) {
        // scattered through a great space round the centre, thinning outward, few near the floor
        const r = 7 + Math.pow(R(), 0.7) * 42;
        const th = R() * Math.PI * 2, ph = Math.acos(2 * R() - 1);
        const y = Math.max(-2.5, Math.cos(ph) * r * 0.55);
        s.pos.set([Math.sin(ph) * Math.cos(th) * r, y, Math.sin(ph) * Math.sin(th) * r], i * 3);
        s.k.set([R(), R(), R(), R()], i * 4);
      }
      touch(s.cloud);
      const K = s.cloud.nodes.aK, B = s.cloud.nodes.position; // B: offset from the centre
      // drift: each on its own slow wandering, as if in deep water
      const drift = vec3(
        sin(t.mul(float(0.05).add(K.x.mul(0.06))).add(K.y.mul(40))).mul(1.4),
        sin(t.mul(float(0.04).add(K.y.mul(0.05))).add(K.z.mul(40))).mul(0.9),
        cos(t.mul(float(0.045).add(K.z.mul(0.05))).add(K.w.mul(40))).mul(1.4),
      );
      // the return: each begins on its own delay, eases in (slow, then inevitable), spirals as it
      // comes and settles toward one plane, the streams bending inward from every side
      const k0 = clamp(uConv.mul(1.6).sub(K.x.mul(0.6)), 0, 1);
      const k = k0.mul(k0).mul(float(3).sub(k0.mul(2)));
      const r0 = length(B.xz).add(1e-3);
      const a0 = atan(B.z, B.x);
      const spin = k.mul(float(3.5).add(K.y.mul(2.5))).add(t.mul(0.03));
      const rr = r0.mul(float(1).sub(k));
      const yy = B.y.mul(float(1).sub(k).mul(float(1).sub(k)));
      const home = vec3(cos(a0.add(spin)).mul(rr), yy, sin(a0.add(spin)).mul(rr));
      s.material.positionNode = c.add(home).add(drift.mul(float(1).sub(k)));
      // each its own hue and breath; brighter as they gather; gone into the one once home
      const hue = mix(mix(vec3(0.75, 0.85, 1.0), vec3(1.0, 0.8, 0.55), K.z), vec3(1.0, 0.72, 0.9), smoothstep(0.7, 0.95, K.w));
      const breathe = sin(t.mul(float(0.5).add(K.w.mul(0.8))).add(K.x.mul(60))).mul(0.35).add(0.65);
      const gone = float(1).sub(smoothstep(0.93, 1.0, k).mul(uOne.mul(0.6).add(0.4)));
      s.material.colorNode = vec4(hue.mul(s.round).mul(breathe).mul(k.mul(0.8).add(0.6)).mul(gone).mul(float(1).sub(uHole.mul(0.85))).mul(0.9), 1);
      g.add(s.cloud.sprite);
      ours.push(s.material);
    }

    /* ---------------- the one: a single radiant point ---------------- */
    const one = keepAlpha(new THREE.SpriteNodeMaterial({ transparent: true, depthWrite: false, fog: false }));
    {
      const r = length(uv().sub(0.5)).mul(2);
      const core = exp(r.mul(r).mul(-60)).mul(3).add(exp(r.mul(-5)).mul(0.5));
      const rays = pow(abs(cos(atan(uv().y.sub(0.5), uv().x.sub(0.5)).mul(2))), 30).mul(exp(r.mul(-4))).mul(0.3);
      const breathe = sin(t.mul(0.8)).mul(0.1).add(0.9);
      one.colorNode = vec4(vec3(1.0, 0.95, 0.85).mul(core.add(rays.mul(0.5))).mul(breathe).mul(uOne).mul(float(1).sub(smoothstep(0.0, 0.45, uHole))), 1);
      const sp = new THREE.Sprite(one);
      sp.position.copy(C);
      sp.scale.setScalar(9);
      g.add(sp);
      ours.push(one);
    }

    /* ---------------- the black hole ---------------- */
    const holeGroup = new THREE.Group();
    holeGroup.position.copy(C);
    g.add(holeGroup);
    {
      // the event horizon: darkness itself, drawn over the souls behind it
      const hg = new THREE.SphereGeometry(1.7, 48, 24);
      const hm = new THREE.MeshBasicNodeMaterial({ transparent: true, fog: false });
      hm.colorNode = vec3(0, 0, 0);
      hm.opacityNode = smoothstep(0.1, 0.35, uHole);
      const horizon = new THREE.Mesh(hg, hm);
      horizon.renderOrder = 3; // first: its depth hides the ring's far half, the near half passes in front
      holeGroup.add(horizon);
      ours.push(hg, hm);
      // the darkness held truly black: a soft disc of pure black over the glow that bloom and the
      // souls behind would wash into it (the ring's near half, drawn after, still crosses it)
      const bm = new THREE.SpriteNodeMaterial({ transparent: true, depthWrite: false, fog: false });
      const rb = length(uv().sub(0.5)).mul(2);
      bm.colorNode = vec3(0, 0, 0);
      bm.opacityNode = smoothstep(0.37, 0.33, rb).mul(smoothstep(0.1, 0.35, uHole));
      const shade = new THREE.Sprite(bm);
      shade.scale.setScalar(9.6);
      shade.renderOrder = 3;
      holeGroup.add(shade);
      ours.push(bm);

      // the accretion ring: a flat disc of light round it, tilted toward us, swirling, hottest at
      // its inner edge; soft, the game's glow, never hard CG
      const rg = new THREE.RingGeometry(1.9, 7.5, 160, 4);
      const rm = keepAlpha(new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide }));
      const P = T.positionGeometry;
      const rad = length(P.xy);
      const ang = atan(P.y, P.x);
      const u = rad.sub(1.9).div(5.6); // 0 inner … 1 outer
      const swirl = vnoise(vec2(ang.mul(3).add(t.mul(0.35)).add(u.mul(6)), u.mul(9))).mul(0.6).add(vnoise(vec2(ang.mul(9).add(t.mul(0.6)), u.mul(20))).mul(0.4));
      const heat = mix(vec3(1.0, 0.97, 0.9), vec3(0.95, 0.55, 0.25), smoothstep(0.0, 0.6, u));
      const fall = exp(u.mul(-4.5)).mul(smoothstep(0.0, 0.03, u));
      rm.colorNode = vec4(heat.mul(fall).mul(swirl.mul(0.8).add(0.35)).mul(uHole).mul(1.05), 1);
      const ring = new THREE.Mesh(rg, rm);
      ring.rotation.x = -Math.PI / 2 + 0.28; // seen a little from above, as the eye expects of it
      ring.renderOrder = 4;
      holeGroup.add(ring);
      ours.push(rg, rm);

      // the photon ring: a thin fierce circle hugging the darkness, always facing us
      const pr = keepAlpha(new THREE.SpriteNodeMaterial({ transparent: true, depthWrite: false, fog: false }));
      const r2 = length(uv().sub(0.5)).mul(2);
      const band = exp(r2.sub(0.365).mul(r2.sub(0.365)).mul(-1400)).mul(0.85).add(exp(max(r2.sub(0.36), 0).mul(-9)).mul(0.25).mul(smoothstep(0.34, 0.37, r2)));
      pr.colorNode = vec4(vec3(1.0, 0.88, 0.7).mul(band).mul(uHole), 1);
      const photon = new THREE.Sprite(pr);
      photon.scale.setScalar(9.6);
      photon.renderOrder = 6;
      holeGroup.add(photon);
      ours.push(pr);
    }

    /* ---------------- the last souls, spiralling in ---------------- */
    {
      // each soul drawn three times along its own path, a moment apart: far out the three are one
      // point; near the horizon, where it falls fastest, they draw it out into a streak
      const s = pointCloud(INFALL * 3, 0.12);
      for (let i = 0; i < INFALL; i++) {
        const k = [R(), R(), R(), R()];
        for (let j = 0; j < 3; j++) {
          s.pos.set([j, 0, 0], (i * 3 + j) * 3);
          s.k.set(k, (i * 3 + j) * 4);
        }
      }
      touch(s.cloud);
      const K = s.cloud.nodes.aK, trail = s.cloud.nodes.position.x;
      const life0 = fract(K.x.add(t.mul(float(0.03).add(K.y.mul(0.04)))));
      const life = life0.sub(trail.mul(0.006).mul(smoothstep(0.55, 0.95, life0)));
      const r = mix(float(22).add(K.z.mul(14)), float(1.8), pow(life, 0.6));
      const a = K.w.mul(6.283).add(life.mul(float(9).add(K.y.mul(6))));
      // in the ring's plane (tilted like it), sinking a little as they near
      const x = cos(a).mul(r), z = sin(a).mul(r);
      const tilt = 0.28;
      const pos = vec3(x, z.mul(-Math.sin(tilt)).add(sin(K.z.mul(40)).mul(float(1).sub(life)).mul(2)), z.mul(Math.cos(tilt)));
      s.material.positionNode = c.add(pos);
      // and as they near the horizon they redden and dim: the last light of each before it is one
      const near = smoothstep(0.62, 0.97, life0);
      const hue = mix(mix(vec3(0.8, 0.88, 1.0), vec3(1.0, 0.8, 0.55), K.z), vec3(0.85, 0.16, 0.06), near);
      const fade = mix(float(1), float(0.55), near).mul(float(1).sub(trail.mul(0.3)));
      s.material.colorNode = vec4(hue.mul(s.round).mul(smoothstep(0, 0.2, life)).mul(smoothstep(1, 0.9, life)).mul(fade).mul(uHole).mul(0.9), 1);
      g.add(s.cloud.sprite);
      ours.push(s.material);
    }

    /* ---------------- the way on: a single door of pure white light ---------------- */
    {
      const geo = new THREE.PlaneGeometry(2.6, 5.2);
      geo.translate(0, 2.6, 0);
      const m = keepAlpha(new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide }));
      const U = uv();
      const inside = smoothstep(0.0, 0.06, U.x).mul(smoothstep(1.0, 0.94, U.x)).mul(smoothstep(0.0, 0.03, U.y)).mul(smoothstep(1.0, 0.97, U.y));
      m.colorNode = vec4(vec3(1).mul(inside).mul(uDoor).mul(1.4), 1);
      const door = new THREE.Mesh(geo, m);
      door.position.copy(DOOR);
      g.add(door);
      // its light, soft, round it (the only light in the room besides the souls)
      const hm = keepAlpha(new THREE.SpriteNodeMaterial({ transparent: true, depthWrite: false, fog: false }));
      const r = length(uv().sub(0.5).mul(vec2(1.6, 1))).mul(2);
      hm.colorNode = vec4(vec3(0.9, 0.92, 1.0).mul(exp(r.mul(r).mul(-3.5))).mul(smoothstep(1.0, 0.6, r)).mul(uDoor).mul(0.25), 1);
      const halo = new THREE.Sprite(hm);
      halo.position.copy(DOOR).add(new THREE.Vector3(0, 2.6, 0.1));
      halo.scale.set(10, 12, 1);
      g.add(halo);
      ours.push(geo, m, hm);
    }

    tickers.push((dt: number) => {
      const d = Math.min(0.05, Math.max(0, dt));
      clock.tick(d);
      applyAir(air);
      // the return quickens as it goes (slow at first, then inevitable)
      uConv.value = damp(uConv.value, goal.conv, 0.02 + uConv.value * 0.05, d);
      uOne.value = damp(uOne.value, goal.one, 0.25, d);
      uHole.value = damp(uHole.value, goal.hole, 0.18, d);
      uDoor.value = damp(uDoor.value, goal.door, 0.2, d);
      holeGroup.rotation.y += d * 0.02;
    });
  };

  const opts: LessonOpts = {
    id: "density_6",
    trackId: "audio/densities/density_6.mp3",
    seatPos,
    seatHeading: heading,
    build,
    authoredSecs: 300, // beats written against the script's length; they follow the recording
    beats: [
      // "Picture the room… countless orbs of light… They drift toward one another": the return begins
      { t: 42, apply: () => (goal.conv = 0.35) },
      // "one in thought, one in hope, one in intention": the streams gather
      { t: 118, apply: () => (goal.conv = 0.75) },
      // "The lesson of the sixth density is balance, perfected": all come home
      { t: 160, apply: () => (goal.conv = 1) },
      // "you are more yourself than you have ever been, and you are also everyone else": the one
      { t: 198, apply: () => (goal.one = 1) },
      // "all of it comes together… fused into a single radiant we": the collapse
      { t: 244, apply: () => (goal.hole = 1) },
      // "There is one classroom left. One final threshold": the white door
      { t: 272, apply: () => (goal.door = 1.2) },
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
  return lesson;
}
