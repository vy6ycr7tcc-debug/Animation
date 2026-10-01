/* The seventh density: foreverness. The owner's arc (2026-10-01): "open on galaxies, collapse inward
   into intense white, then resolve into the pitch black of creation". It opens in the dark among
   turning galaxies; as the telling goes on they fall inward, every point on its own delay, into one
   point ahead that grows into an intense white flooding everything (where the expanse below, its
   gold motes and dissolving travellers, belongs); and the white resolves into the pitch black of
   creation, where only the way home stands, a threshold of gold. All of it follows the fraction of
   the telling heard.

   Earlier text, kept for the light it describes: stepping through the sixth's white door is stepping out of form.
   No ground, no horizon, no walls, no ceiling: an expanse of white-gold light in every direction,
   and you float in it. Fine motes of gold drift at every distance, slow as breathing, so the
   brilliance has depth. Far off, a few other travellers, each a point of light, loosen into motes
   and are gone, and others appear. Your own form grows more translucent the longer you remain,
   almost invisible before perfect light. The light brightens, very slowly, toward a brilliance
   it never quite reaches: foreverness as a direction, not a destination.

   Nothing is built here. The one quiet mark is where the way home lies: a slow ring of gold motes
   hanging far ahead (the octave returns to its beginning: the monument's lobby).

   The owner's direction (2026-09-30) replaces the earlier corridor. The module keeps its interface
   and its recording (`audio/densities/density_7.mp3`, a draft). */
import * as THREE from "three/webgpu";
import type { Narration } from "../../core/narration";
import type { SceneModule } from "../lessonKit";
import { T } from "../../gpu/tsl";
import { applyAir, damp, keepAlpha, pointCloud, roomClock, seeded, skyDome, touch, type Air } from "./roomKit";
import { starField } from "../past/kit";

const { cos, exp, float, fract, length, mix, sin, smoothstep, uniform, uv, vec3, vec4 } = T;
/** The one point ahead the galaxies fall into, which becomes the white. */
const CORE = new THREE.Vector3(0, 7, -46);

/** Where the way home stands (room frame: you begin at the origin facing −z). */
export const HOME_RING = new THREE.Vector3(0, 1.6, -52);

export function createDensity7(
  scene: THREE.Scene,
  narration: Narration,
  _whisper: (t: string, ms?: number) => void,
  startPos: THREE.Vector3,
  startHeading: number,
): SceneModule & { presence(): number } {
  const id = "density-7";
  const group = new THREE.Group();
  group.name = `density:${id}`;
  group.position.copy(startPos);
  group.rotation.y = startHeading;
  scene.add(group);
  const ours: { dispose(): void }[] = [];
  const tickers7: Array<() => void> = [];
  const clock = roomClock();
  const t = clock.u;
  const uBright = uniform(0.5); // the brilliance, always rising, never arrived
  const uRing = uniform(0.3);
  const uDissolve = uniform(0); // how far through the telling: the travellers loosen one by one
  const uGal = uniform(1); // the galaxies in the dark
  const uFall = uniform(0); // their collapse inward
  const uWhite = uniform(0); // the intense white
  const uBlack = uniform(0); // the pitch black of creation
  let time = 0, sat = false, ringGoal = 0.3;
  const R = seeded(7007);
  const air: Air = {
    color: new THREE.Color(1.15, 1.0, 0.76),
    glow: new THREE.Color(1, 0.92, 0.76),
    glowDir: new THREE.Vector3(0, 0.3, -1),
    density: 0.018,
    shadow: new THREE.Color(0.05, 0.04, 0.02),
    sat: 1.12,
    contrast: 1.02,
  };

  // the expanse: white-gold everywhere, a little warmer ahead, a little paler above
  {
    const sky = skyDome(600, new THREE.Color(1.3, 1.08, 0.78), new THREE.Color(1.12, 1.04, 0.9), {
      glowDir: new THREE.Vector3(0, 0.1, -1),
      glow: new THREE.Color(0.7, 0.5, 0.22),
      glowPow: 3,
      extra: (d, c) => {
        // it has no floor: below is the same light, only a shade softer
        const under = smoothstep(0.1, -0.6, d.y).mul(0.08);
        const light = c.mul(float(1).sub(under)).mul(uBright);
        // before the white: the dark full of stars; after it: the pitch black of creation
        const stars = vec3(starField(d, t, 0.006)).mul(0.8).mul(float(1).sub(uBlack));
        return mix(stars, light, uWhite);
      },
    });
    group.add(sky.mesh);
    ours.push(sky);
  }
  // fine gold motes at every distance, drifting slowly: the depth of the light
  {
    const n = 2400;
    const s = pointCloud(n, 0.35);
    for (let i = 0; i < n; i++) {
      const r = 2 + Math.pow(R(), 1.6) * 110, a = R() * Math.PI * 2, y = (R() - 0.35) * 40;
      s.pos.set([Math.sin(a) * r, y, -Math.cos(a) * r], i * 3);
      s.k.set([R(), R(), R(), R()], i * 4);
    }
    touch(s.cloud);
    const K = s.cloud.nodes.aK, B = s.cloud.nodes.position;
    const drift = vec3(sin(t.mul(0.05).add(K.x.mul(40))).mul(1.5), fract(K.y.add(t.mul(0.004).mul(K.z.add(0.5)))).mul(12).sub(6), sin(t.mul(0.04).add(K.w.mul(30))).mul(1.5));
    s.material.positionNode = B.add(drift);
    const twinkle = sin(t.mul(float(0.6).add(K.z)).add(K.w.mul(60))).mul(0.35).add(0.65);
    // in so much light, light can't add: the motes are deep gold laid over it
    s.material.blending = THREE.NormalBlending;
    s.material.colorNode = vec4(mix(vec3(0.95, 0.55, 0.1), vec3(1, 0.72, 0.28), K.x), s.round.mul(twinkle).mul(0.8).mul(uWhite));
    group.add(s.cloud.sprite);
    ours.push(s.material);
  }
  // other travellers far off: each a point of light that loosens into motes and is gone
  {
    const TRAV = 9, PER = 60;
    const s = pointCloud(TRAV * PER, 2.2);
    for (let i = 0; i < TRAV; i++) {
      const a = (i / TRAV) * Math.PI * 2 + R() * 0.5, r = 24 + R() * 34, y = 1 + R() * 8;
      const ph = i / TRAV;
      for (let j = 0; j < PER; j++) {
        s.pos.set([Math.sin(a) * r, y, -Math.cos(a) * r], (i * PER + j) * 3);
        s.k.set([ph, j / PER, R(), R()], (i * PER + j) * 4);
      }
    }
    touch(s.cloud);
    const K = s.cloud.nodes.aK, B = s.cloud.nodes.position;
    // each traveller's own slow cycle: gathered, then loosening, then gone, then again elsewhere
    // each traveller's moment comes in turn as the telling goes on (the \"we\" dissolving)
    const at = K.x.mul(0.8).add(0.1);
    const life = uDissolve.sub(at).mul(3).add(0.5).clamp(0, 1);
    const loosen = smoothstep(0.45, 0.95, life);
    const dir = vec3(sin(K.z.mul(40)), sin(K.w.mul(33)).mul(0.7).add(0.3), T.cos(K.z.mul(40)));
    s.material.positionNode = B.add(dir.mul(loosen.mul(float(1.5).add(K.y.mul(6)))));
    const show = float(1).sub(smoothstep(0.7, 1.0, life));
    // one bright point while gathered (the first of each), a fine cloud as it loosens
    const lead = smoothstep(0.02, 0.0, K.y);
    s.material.blending = THREE.NormalBlending;
    s.material.colorNode = vec4(mix(vec3(0.5, 0.25, 0.04), vec3(0.72, 0.42, 0.12), loosen), s.round.mul(show).mul(mix(lead.add(0.6), float(0.85), loosen)).min(1).mul(uWhite));
    group.add(s.cloud.sprite);
    ours.push(s.material);
  }
  // the galaxies: four spirals turning in the dark, each in its own plane; they fall inward, every
  // point on its own delay, into the one point ahead
  {
    const GAL = [
      { c: new THREE.Vector3(-34, 22, -70), r: 18, tilt: new THREE.Euler(1.1, 0.2, 0.3) },
      { c: new THREE.Vector3(38, 30, -88), r: 24, tilt: new THREE.Euler(0.5, -0.4, -0.2) },
      { c: new THREE.Vector3(6, 46, -120), r: 30, tilt: new THREE.Euler(1.35, 0.1, 0.1) },
      { c: new THREE.Vector3(-58, 8, -40), r: 14, tilt: new THREE.Euler(0.8, 0.9, 0.4) },
    ];
    const PER = 3600, n = GAL.length * PER;
    const s = pointCloud(n, 0.42);
    const aC = new Float32Array(n * 3), aU = new Float32Array(n * 3), aV = new Float32Array(n * 3);
    const U = new THREE.Vector3(), V = new THREE.Vector3(), N = new THREE.Vector3();
    GAL.forEach((gx, gi) => {
      const q = new THREE.Quaternion().setFromEuler(gx.tilt);
      U.set(1, 0, 0).applyQuaternion(q);
      V.set(0, 0, 1).applyQuaternion(q);
      N.set(0, 1, 0).applyQuaternion(q);
      for (let j = 0; j < PER; j++) {
        const i = gi * PER + j;
        // two arms of a log spiral, a bulge at the heart, a thin disc
        const core = R() < 0.18;
        const rr = core ? Math.pow(R(), 2) * 0.18 * gx.r : (0.12 + Math.pow(R(), 0.8)) * gx.r;
        const arm = (j % 2) * Math.PI + Math.log(1 + rr / (gx.r * 0.12)) * 2.4 + (R() - 0.5) * (core ? 6 : 0.55);
        const h = (R() - 0.5) * (core ? 0.25 : 0.05) * gx.r;
        s.pos.set([Math.cos(arm) * rr, h, Math.sin(arm) * rr], i * 3);
        aC.set([gx.c.x, gx.c.y, gx.c.z], i * 3);
        aU.set([U.x, U.y, U.z], i * 3);
        aV.set([V.x, V.y, V.z], i * 3);
        s.k.set([R(), rr / gx.r, gi / GAL.length, R()], i * 4);
      }
      void N;
    });
    const geo = s.cloud.sprite.geometry;
    const bC = new THREE.InstancedBufferAttribute(aC, 3), bU = new THREE.InstancedBufferAttribute(aU, 3), bV = new THREE.InstancedBufferAttribute(aV, 3);
    geo.setAttribute("aC", bC);
    geo.setAttribute("aU", bU);
    geo.setAttribute("aV", bV);
    touch(s.cloud);
    const K = s.cloud.nodes.aK, L = s.cloud.nodes.position;
    const Cg = T.instancedBufferAttribute(bC), Ug = T.instancedBufferAttribute(bU), Vg = T.instancedBufferAttribute(bV);
    // turning about its own heart, inner faster
    const spin = t.mul(float(0.03).add(float(0.05).div(K.y.add(0.2))).mul(0.4));
    const lx = L.x.mul(cos(spin)).sub(L.z.mul(sin(spin))), lz = L.x.mul(sin(spin)).add(L.z.mul(cos(spin)));
    const Nn = T.cross(Ug, Vg).negate();
    const here = Cg.add(Ug.mul(lx)).add(Vg.mul(lz)).add(Nn.mul(L.y));
    // the fall: each point on its own delay, slow then inevitable, a little swirl as it goes
    const k0 = T.clamp(uFall.mul(1.7).sub(K.x.mul(0.7)), 0, 1);
    const k = k0.mul(k0).mul(float(3).sub(k0.mul(2)));
    const core = vec3(CORE.x, CORE.y, CORE.z);
    const swirl = vec3(sin(k.mul(6).add(K.w.mul(9))), 0, cos(k.mul(6).add(K.w.mul(9)))).mul(float(1).sub(k).mul(k).mul(12));
    s.material.positionNode = mix(here, core, k).add(swirl);
    const hue = mix(vec3(1, 0.92, 0.78), vec3(0.62, 0.74, 1), T.smoothstep(0.1, 0.7, K.y));
    const tw = sin(t.mul(float(0.6).add(K.w)).add(K.x.mul(50))).mul(0.2).add(0.8);
    const gone = float(1).sub(smoothstep(0.85, 1, k));
    s.material.colorNode = vec4(hue.mul(s.round).mul(tw).mul(float(0.8).add(k.mul(1.2))).mul(gone).mul(uGal).mul(float(1).sub(uWhite)), 1);
    group.add(s.cloud.sprite);
    ours.push(s.material);
    // the one point they fall into, becoming the intense white that fills everything
    const wm = keepAlpha(new THREE.SpriteNodeMaterial({ transparent: true, depthWrite: false, fog: false }));
    const r = length(uv().sub(0.5)).mul(2);
    const glow = exp(r.mul(r).mul(-6)).add(exp(r.mul(r).mul(-60)).mul(2));
    wm.colorNode = vec4(vec3(1, 0.97, 0.9).mul(glow).mul(uFall.mul(0.8).add(uWhite.mul(2))).mul(float(1).sub(uBlack)), 1);
    const white = new THREE.Sprite(wm);
    white.position.copy(CORE);
    group.add(white);
    ours.push(wm);
    tickers7.push(() => white.scale.setScalar(4 + uFall.value * 14 + uWhite.value * 420));
  }
  // the way home: a threshold of light far ahead, open both ways (not a road: a door standing in
  // the brilliance, a little deeper gold at its edges, motes crossing it in both directions)
  {
    const geo = new THREE.PlaneGeometry(7, 12);
    geo.translate(0, 6, 0);
    const m = keepAlpha(new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide }));
    const U = T.uv();
    const edge = smoothstep(0.0, 0.12, U.x).mul(smoothstep(1.0, 0.88, U.x)).mul(smoothstep(0.0, 0.05, U.y)).mul(smoothstep(1.0, 0.9, U.y));
    const rim = smoothstep(0.0, 0.08, edge).mul(float(1).sub(smoothstep(0.3, 0.65, edge)));
    m.blending = THREE.NormalBlending;
    m.colorNode = vec4(mix(vec3(0.42, 0.2, 0.03), vec3(1, 0.72, 0.32), uBlack), rim.mul(uRing).min(1));
    const door = new THREE.Mesh(geo, m);
    door.position.copy(HOME_RING).setY(0);
    group.add(door);
    ours.push(geo, m);
    const n = 90;
    const s = pointCloud(n, 0.3);
    for (let i = 0; i < n; i++) s.k.set([R(), R(), R(), R()], i * 4);
    touch(s.cloud);
    const K = s.cloud.nodes.aK;
    const f = fract(K.x.add(t.mul(0.05)));
    const dir = T.step(0.5, K.y).mul(2).sub(1); // some come through toward you, some go the other way
    s.material.positionNode = vec3(K.z.sub(0.5).mul(6.4), K.w.mul(12), f.sub(0.5).mul(8).mul(dir)).add(vec3(HOME_RING.x, 0, HOME_RING.z));
    s.material.blending = THREE.NormalBlending;
    s.material.colorNode = vec4(mix(vec3(0.8, 0.46, 0.12), vec3(1, 0.8, 0.45), uBlack), s.round.mul(smoothstep(0, 0.2, f)).mul(smoothstep(1, 0.8, f)).mul(uRing).mul(0.8));
    group.add(s.cloud.sprite);
    ours.push(s.material);
  }

  let active = true, seated = false;
  let gal = 1, fall = 0, wht = 0, blk = 0;
  return {
    id,
    active: true,
    holdsMovement: () => false,
    nearSeat: (p: THREE.Vector3) => p.distanceTo(startPos) < 4,
    onSit: () => {
      if (!active || seated) return;
      seated = true;
      time = 0;
      void narration.play("audio/densities/density_7.mp3");
    },
    onStand: () => {
      if (!active || !seated) return;
      seated = false;
      narration.stop();
    },
    update: (dt: number) => {
      if (!active) return;
      const d = Math.min(0.05, Math.max(0, dt));
      time += d;
      clock.tick(d);
      applyAir(air);
      // the brilliance: breathing (a slow swell every ~9 s, felt, not seen as flicker), rising all
      // the time, and in the last half minute of the telling unmistakably approaching, never arriving
      const pr = narration.progress();
      const f = pr ? pr.t / pr.total : Math.min(1, time / 156);
      const near = Math.max(0, (f - 0.8) / 0.2);
      const breath = 1 + 0.09 * Math.sin((time * Math.PI * 2) / 9);
      const rise = 0.74 + 0.22 * (1 - Math.exp(-time / 90)) + 0.35 * near * near;
      uBright.value = rise * breath;
      uDissolve.value = f;
      // the arc: galaxies in the dark → the collapse → the white → the pitch black of creation
      const sm = (a: number, b: number, x: number) => {
        const k = Math.min(1, Math.max(0, (x - a) / (b - a)));
        return k * k * (3 - 2 * k);
      };
      gal = damp(gal, 1 - sm(0.42, 0.56, f), 1.2, d);
      fall = damp(fall, sm(0.26, 0.5, f), 1.2, d);
      wht = damp(wht, sm(0.44, 0.56, f) * (1 - sm(0.72, 0.86, f)), 1.2, d);
      blk = damp(blk, sm(0.74, 0.88, f), 1.2, d);
      uGal.value = gal;
      uFall.value = fall;
      uWhite.value = wht;
      uBlack.value = blk;
      for (const tk of tickers7) tk();
      air.color.setRGB(1.15, 1.0, 0.76).multiplyScalar((0.8 + 0.3 * (1 - Math.exp(-time / 90)) + 0.25 * near) * breath * wht);
      air.glow.setRGB(1, 0.92, 0.76).multiplyScalar(Math.max(0.02, wht));
      air.shadow?.setRGB(0.05, 0.04, 0.02).multiplyScalar(wht); // the black of creation is pure black
      // "So step through the gateway… Return to the monument": the way home brightens
      if (!sat && f > 0.77) (sat = true), (ringGoal = 1);
      uRing.value = damp(uRing.value, ringGoal, 0.3, d);
    },
    /** Almost invisible before perfect light: the longer you remain, the less of you is there. */
    presence: () => Math.max(0.12, 1 - time / 240) ** 1.2,
    dispose: () => {
      if (!active) return;
      active = false;
      narration.stop();
      scene.remove(group);
      for (const o of ours) o.dispose();
    },
  };
}

