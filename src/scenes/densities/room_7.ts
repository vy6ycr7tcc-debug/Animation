/* The seventh density: foreverness. Stepping through the sixth's white door is stepping out of form.
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

const { float, fract, mix, sin, smoothstep, uniform, vec3, vec4 } = T;

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
  const clock = roomClock();
  const t = clock.u;
  const uBright = uniform(0.5); // the brilliance, always rising, never arrived
  const uRing = uniform(0.3);
  const uDissolve = uniform(0); // how far through the telling: the travellers loosen one by one
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
        return c.mul(float(1).sub(under)).mul(uBright);
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
    s.material.colorNode = vec4(mix(vec3(0.95, 0.55, 0.1), vec3(1, 0.72, 0.28), K.x), s.round.mul(twinkle).mul(0.8));
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
    s.material.colorNode = vec4(mix(vec3(0.5, 0.25, 0.04), vec3(0.72, 0.42, 0.12), loosen), s.round.mul(show).mul(mix(lead.add(0.6), float(0.85), loosen)).min(1));
    group.add(s.cloud.sprite);
    ours.push(s.material);
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
    m.colorNode = vec4(vec3(0.42, 0.2, 0.03), rim.mul(uRing).min(1));
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
    s.material.colorNode = vec4(vec3(0.8, 0.46, 0.12), s.round.mul(smoothstep(0, 0.2, f)).mul(smoothstep(1, 0.8, f)).mul(uRing).mul(0.8));
    group.add(s.cloud.sprite);
    ours.push(s.material);
  }

  let active = true, seated = false;
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
      air.color.setRGB(1.15, 1.0, 0.76).multiplyScalar((0.8 + 0.3 * (1 - Math.exp(-time / 90)) + 0.25 * near) * breath);
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

