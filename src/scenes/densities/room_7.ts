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
import { applyAir, damp, pointCloud, roomClock, seeded, skyDome, touch, type Air } from "./roomKit";

const { float, fract, mix, sin, smoothstep, uniform, vec3, vec4 } = T;

/** Where the way home hangs (room frame: you begin at the origin facing −z). */
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
    const s = pointCloud(TRAV * PER, 1.3);
    for (let i = 0; i < TRAV; i++) {
      const a = (i / TRAV) * Math.PI * 2 + R() * 0.5, r = 40 + R() * 60, y = 1 + R() * 10;
      const ph = R();
      for (let j = 0; j < PER; j++) {
        s.pos.set([Math.sin(a) * r, y, -Math.cos(a) * r], (i * PER + j) * 3);
        s.k.set([ph, j / PER, R(), R()], (i * PER + j) * 4);
      }
    }
    touch(s.cloud);
    const K = s.cloud.nodes.aK, B = s.cloud.nodes.position;
    // each traveller's own slow cycle: gathered, then loosening, then gone, then again elsewhere
    const life = fract(K.x.add(t.mul(0.011)));
    const loosen = smoothstep(0.45, 0.95, life);
    const dir = vec3(sin(K.z.mul(40)), sin(K.w.mul(33)).mul(0.7).add(0.3), T.cos(K.z.mul(40)));
    s.material.positionNode = B.add(dir.mul(loosen.mul(float(1.5).add(K.y.mul(6)))));
    const show = smoothstep(0.0, 0.1, life).mul(float(1).sub(smoothstep(0.7, 1.0, life)));
    // one bright point while gathered (the first of each), a fine cloud as it loosens
    const lead = smoothstep(0.02, 0.0, K.y);
    s.material.blending = THREE.NormalBlending;
    s.material.colorNode = vec4(mix(vec3(0.75, 0.42, 0.1), vec3(0.9, 0.6, 0.25), loosen), s.round.mul(show).mul(mix(lead.add(0.2), float(0.55), loosen)));
    group.add(s.cloud.sprite);
    ours.push(s.material);
  }
  // the way home: a slow ring of gold motes far ahead
  {
    const n = 48;
    const s = pointCloud(n, 0.55);
    for (let i = 0; i < n; i++) {
      s.pos.set([0, 0, 0], i * 3);
      s.k.set([i / n, R(), 0, 0], i * 4);
    }
    touch(s.cloud);
    const K = s.cloud.nodes.aK;
    const a = K.x.mul(Math.PI * 2).add(t.mul(0.08));
    s.material.positionNode = vec3(T.cos(a).mul(1.9), T.sin(a).mul(1.9).add(sin(t.mul(0.4).add(K.y.mul(6))).mul(0.05)), 0);
    s.material.blending = THREE.NormalBlending;
    s.material.colorNode = vec4(vec3(0.8, 0.46, 0.12), s.round.mul(uRing));
    s.cloud.sprite.position.copy(HOME_RING);
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
      // the brilliance: rising all the time, slower and slower, never arriving
      uBright.value = 0.62 + 0.38 * (1 - Math.exp(-time / 160));
      air.color.setRGB(1.15, 1.0, 0.76).multiplyScalar(0.8 + 0.3 * (1 - Math.exp(-time / 160)));
      // "So step through the gateway… Return to the monument": the way home brightens
      const nt = narration.time();
      if (!sat && nt > 230) (sat = true), (ringGoal = 1);
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

