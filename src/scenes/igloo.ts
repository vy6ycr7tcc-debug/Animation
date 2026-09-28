/* The igloo lesson (L04): an OPEN icy grotto, cozy at its heart and cold all around.
   There is no dome — the sky stays open. A windswept ice field, drifting snow, moonlit
   blue air, a ring of breathing ice-crystal shards, and a few LOW translucent ice walls
   (curved, additive, depthWrite:false) that suggest shelter without closing the sky.
   At the centre: a stone-ringed fireplace — a living gold flame bigger than before, warm
   light pooling on the ice, rising embers, one warm PointLight — the cozy heart against
   the cold. Six visions arrive in the narration's own time (L04, 570.5s): rain, a ledger
   of drifting lights, a sun rising, a hand opening then closing, a tree growing,
   a candle holding its flame. Everything glows: additive, transparent, no opaque solids. */
import * as THREE from "three/webgpu";
import { LessonScene } from "./lessonKit";
import type { LessonCtx, LessonOpts, SceneModule } from "./lessonKit";
import { SITES } from "./sites";
import { worldPoints, glowShader, gpuUniforms, T } from "../gpu/tsl";

const clamp01 = (x: number): number => (x <= 0 ? 0 : x >= 1 ? 1 : x);

/** 0 → 1 → 1 → 0 across [t0,t1]..[t2,t3], on the narration clock. */
function fadeU(uT: number, t0: number, t1: number, t2: number, t3: number): number {
  if (uT <= t0 || uT >= t3) return 0;
  if (uT < t1) return clamp01((uT - t0) / Math.max(1e-6, t1 - t0));
  if (uT <= t2) return 1;
  return clamp01(1 - (uT - t2) / Math.max(1e-6, t3 - t2));
}

/** seeded hash — every placement repeats exactly, no bare Math.random() */
const rnd = (i: number, s: number): number => {
  const x = Math.sin(i * 12.9898 + s * 78.233) * 43758.5453;
  return x - Math.floor(x);
};

export function createIglooScene(
  scene: THREE.Scene,
  narration: LessonCtx["narration"],
  whisper: (t: string, ms?: number) => void
): SceneModule {
  const site = SITES.igloo ?? { x: 0, z: 0, y: 0, heading: 0 };
  const C = new THREE.Vector3(site.x, site.y, site.z);
  /* the seat sits at the edge of the warm light pool, looking across the fire
     into the cold blue distance */
  const seat = new THREE.Vector3(site.x, site.y, site.z + 3.4);
  const seatHeading = Math.atan2(C.x - seat.x, C.z - seat.z);

  const tickers: Array<(dt: number) => void> = [];
  const ours: Array<{ dispose(): void }> = [];
  let segment = "";

  const opts: LessonOpts = {
    id: "igloo",
    trackId: "L04",
    seatPos: seat.clone(),
    seatHeading,
    build: (ctx) => {
      const kit = ctx.kit;
      /* the kit's group carries every maker; hang it under the lesson group */
      ctx.group.add(kit.group);

      /* the kit.groundDisc recipe (RingGeometry + additive basic), placed at the site */
      const ring = (
        x: number,
        y: number,
        z: number,
        r: number,
        color: number,
        opacity: number,
        inner = 0.85,
        pulse = 0.15
      ) => {
        const rr = Math.max(0.05, r);
        const geo = new THREE.RingGeometry(rr * clamp01(inner), rr, 72);
        const mat = new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          opacity,
          blending: THREE.AdditiveBlending,
          side: THREE.DoubleSide,
          depthWrite: false,
          fog: false,
        });
        const m = new THREE.Mesh(geo, mat);
        m.rotation.x = -Math.PI / 2;
        m.position.set(x, y, z);
        ctx.group.add(m);
        ours.push(geo, mat);
        const p = clamp01(pulse);
        tickers.push(() => {
          const t = gpuUniforms.time.value;
          mat.opacity = clamp01(opacity * (1 - p + p * Math.sin(t * 0.5)));
        });
      };

      /* ---------- open sky: moon, drifting snowfall, windswept ice field ---------- */
      kit.snowfall(1200, site.x, site.z, 30, 17);

      /* the cold moon, high and open */
      const moon = worldPoints(new Float32Array([C.x + 9, C.y + 15, C.z - 12]), {
        size: 3.2,
        color: 0xdcecff,
        opacity: 0.32,
      });
      ctx.group.add(moon.sprite);
      ours.push(moon.material);

      /* the ice field: broad, cold, faintly ringed */
      ring(C.x, C.y + 0.01, C.z, 30, 0xcfe6ff, 0.26, 0.55, 0.1);
      ring(C.x, C.y + 0.02, C.z, 19, 0x9dc6ff, 0.16, 0.62, 0.16);
      ring(C.x, C.y + 0.03, C.z, 11.5, 0x7fb2ff, 0.12, 0.7, 0.2);

      /* warm light pooling on the ice around the hearth */
      ring(C.x, C.y + 0.05, C.z, 7.0, 0xff9a4e, 0.16, 0.0, 0.16);
      ring(C.x, C.y + 0.06, C.z, 4.2, 0xffb266, 0.26, 0.0, 0.2);
      ring(C.x, C.y + 0.07, C.z, 2.2, 0xffd196, 0.42, 0.0, 0.24);
      ring(C.x, C.y + 0.08, C.z, 1.0, 0xffe9c2, 0.55, 0.0, 0.3);

      /* the sit mat */
      ring(seat.x, seat.y + 0.09, seat.z, 1.35, 0x8a6a4a, 0.8, 0.25, 0.08);

      /* ---------- a ring of ice-crystal shards around the clearing ---------- */
      const shardCount = 8;
      for (let i = 0; i < shardCount; i++) {
        const ang = (i / shardCount) * Math.PI * 2 + (rnd(i, 2.3) - 0.5) * 0.5;
        const rr = 13.5 + (rnd(i, 5.1) - 0.5) * 3.4;
        const p = new THREE.Vector3(
          C.x + Math.cos(ang) * rr,
          C.y + 0.25,
          C.z + Math.sin(ang) * rr
        );
        kit.crystals(8 + Math.floor(rnd(i, 7.7) * 6), p, 2.6 + rnd(i, 8.8) * 1.6);
      }
      /* a few shards closer in, leaning over the fire */
      kit.crystals(10, new THREE.Vector3(C.x - 6.2, C.y + 0.25, C.z - 3.0), 2.2);
      kit.crystals(9, new THREE.Vector3(C.x + 6.0, C.y + 0.25, C.z - 2.2), 2.0);

      /* ---------- low curved ice walls: shelter without a roof ---------- */
      const wallSpecs = [
        { a: -0.62, arc: 0.82, r: 11.6, h: 2.9, top: 0.5, op: 0.12, ph: 0.0 },
        { a: 0.62, arc: 0.82, r: 11.0, h: 2.5, top: 0.55, op: 0.11, ph: 1.3 },
        { a: -2.34, arc: 0.72, r: 10.6, h: 2.3, top: 0.6, op: 0.1, ph: 2.4 },
        { a: 2.34, arc: 0.72, r: 10.2, h: 2.1, top: 0.6, op: 0.1, ph: 3.7 },
        { a: -1.15, arc: 0.5, r: 8.4, h: 1.5, top: 0.7, op: 0.08, ph: 5.1 },
        { a: 1.15, arc: 0.5, r: 8.6, h: 1.6, top: 0.7, op: 0.08, ph: 0.7 },
      ];
      for (const s of wallSpecs) {
        const h = Math.max(0.2, s.h);
        const geo = new THREE.CylinderGeometry(
          Math.max(0.2, s.r * s.top),
          Math.max(0.2, s.r),
          h,
          32,
          1,
          true,
          s.a,
          s.arc
        );
        const mat = new THREE.MeshBasicMaterial({
          color: 0x86b6ff,
          transparent: true,
          opacity: s.op,
          blending: THREE.AdditiveBlending,
          side: THREE.DoubleSide,
          depthWrite: false,
          fog: false,
        });
        const m = new THREE.Mesh(geo, mat);
        m.position.set(C.x, C.y + h * 0.5 - 0.12, C.z);
        ctx.group.add(m);
        ours.push(geo, mat);

        /* a bright frost seam along the foot of each wall */
        const footGeo = new THREE.CylinderGeometry(
          Math.max(0.2, s.r),
          Math.max(0.2, s.r),
          0.16,
          32,
          1,
          true,
          s.a,
          s.arc
        );
        const footMat = new THREE.MeshBasicMaterial({
          color: 0xbfe0ff,
          transparent: true,
          opacity: Math.min(0.5, s.op * 2.6),
          blending: THREE.AdditiveBlending,
          side: THREE.DoubleSide,
          depthWrite: false,
          fog: false,
        });
        const foot = new THREE.Mesh(footGeo, footMat);
        foot.position.set(C.x, C.y + 0.06, C.z);
        ctx.group.add(foot);
        ours.push(footGeo, footMat);

        tickers.push(() => {
          const t = gpuUniforms.time.value;
          mat.opacity = clamp01(s.op * (0.78 + 0.22 * Math.sin(t * 0.35 + s.ph)));
          footMat.opacity = clamp01(Math.min(0.5, s.op * 2.6) * (0.7 + 0.3 * Math.sin(t * 0.5 + s.ph * 1.7)));
        });
      }

      /* pale moonbeams falling through the open sky */
      kit.beams(
        [
          new THREE.Vector3(C.x + 1.6, C.y, C.z - 1.4),
          new THREE.Vector3(C.x - 5.2, C.y, C.z - 6.4),
        ],
        8,
        0.5
      );

      /* light-flowers on the snow, well outside the warm pool */
      kit.flowers(30, C.x, C.z, 11);
      kit.flowers(16, C.x, C.z, 6.2);

      /* the trail of lamps leading in from the snow to the seat */
      const trail: THREE.Vector3[] = [];
      const gate = new THREE.Vector3(C.x, C.y, C.z + 14);
      for (let i = 0; i <= 9; i++) trail.push(new THREE.Vector3().lerpVectors(seat, gate, i / 9));
      kit.pathLights(trail);

      /* ---------- the hearth: the cozy heart of the open grotto ---------- */
      const wisp = kit.wisp(0xffab52, 0.78);
      wisp.setCenter(new THREE.Vector3(C.x, C.y + 0.6, C.z));
      ctx.group.add(wisp.group);

      /* a cold wisp far out in the blue distance */
      const coldWisp = kit.wisp(0x7fb6ff, 0.5);
      coldWisp.setCenter(new THREE.Vector3(C.x - 5.8, C.y + 1.8, C.z - 7.2));
      ctx.group.add(coldWisp.group);

      /* the stone ring — warm inside, cold outside */
      const stoneCount = 18;
      const stonePos = new Float32Array(stoneCount * 3);
      const coolPos = new Float32Array(stoneCount * 3);
      for (let i = 0; i < stoneCount; i++) {
        const a = (i / stoneCount) * Math.PI * 2 + (rnd(i, 1.3) - 0.5) * 0.14;
        const r = 1.32 + (rnd(i, 2.4) - 0.5) * 0.2;
        stonePos[i * 3] = C.x + Math.cos(a) * r;
        stonePos[i * 3 + 1] = C.y + 0.16 + rnd(i, 3.5) * 0.12;
        stonePos[i * 3 + 2] = C.z + Math.sin(a) * r;
        const r2 = 1.62 + (rnd(i, 4.6) - 0.5) * 0.24;
        coolPos[i * 3] = C.x + Math.cos(a) * r2;
        coolPos[i * 3 + 1] = C.y + 0.12 + rnd(i, 5.7) * 0.1;
        coolPos[i * 3 + 2] = C.z + Math.sin(a) * r2;
      }
      const stones = worldPoints(stonePos, { size: 0.34, color: 0xffb27a, opacity: 0.55 });
      ctx.group.add(stones.sprite);
      ours.push(stones.material);
      const frost = worldPoints(coolPos, { size: 0.3, color: 0x86b0e8, opacity: 0.22 });
      ctx.group.add(frost.sprite);
      ours.push(frost.material);

      /* crossed logs, glowing, never opaque */
      const logMat = new THREE.MeshBasicMaterial({
        color: 0xff9a52,
        transparent: true,
        opacity: 0.34,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        fog: false,
      });
      ours.push(logMat);
      for (let i = 0; i < 3; i++) {
        const geo = new THREE.BoxGeometry(1.15, 0.13, 0.13);
        const log = new THREE.Mesh(geo, logMat);
        log.position.set(C.x, C.y + 0.24 + i * 0.06, C.z);
        log.rotation.y = (i / 3) * Math.PI + rnd(i, 6.8) * 0.35;
        log.rotation.z = (rnd(i, 7.9) - 0.5) * 0.18;
        ctx.group.add(log);
        ours.push(geo);
      }

      /* the flame: outer body, hot core, a licking tip */
      const flameOuterMat = glowShader(
        { intensity: 1.15 },
        (u, _uv) => T.vec3(1.0, 0.5, 0.17).mul(u.intensity),
        {}
      );
      const flameCoreMat = glowShader(
        { intensity: 1.6 },
        (u, _uv) => T.vec3(1.0, 0.82, 0.42).mul(u.intensity),
        {}
      );
      const flameTipMat = glowShader(
        { intensity: 0.9 },
        (u, _uv) => T.vec3(1.0, 0.36, 0.11).mul(u.intensity),
        {}
      );

      const outerGeo = new THREE.SphereGeometry(0.42, 20, 18);
      const flameOuter = new THREE.Mesh(outerGeo, flameOuterMat);
      flameOuter.position.set(C.x, C.y + 0.98, C.z);
      flameOuter.scale.set(1.35, 1.9, 1.35);
      ctx.group.add(flameOuter);
      ours.push(outerGeo, flameOuterMat);

      const coreGeo = new THREE.SphereGeometry(0.42, 18, 16);
      const flameCore = new THREE.Mesh(coreGeo, flameCoreMat);
      flameCore.position.set(C.x, C.y + 0.72, C.z);
      flameCore.scale.set(0.8, 1.05, 0.8);
      ctx.group.add(flameCore);
      ours.push(coreGeo, flameCoreMat);

      const tipGeo = new THREE.SphereGeometry(0.42, 16, 14);
      const flameTip = new THREE.Mesh(tipGeo, flameTipMat);
      flameTip.position.set(C.x, C.y + 1.5, C.z);
      flameTip.scale.set(0.6, 1.3, 0.6);
      ctx.group.add(flameTip);
      ours.push(tipGeo, flameTipMat);

      const halo = worldPoints(new Float32Array([C.x, C.y + 1.05, C.z]), {
        size: 2.6,
        color: 0xff9a3c,
        opacity: 0.5,
      });
      ctx.group.add(halo.sprite);
      ours.push(halo.material);

      const fireLight = new THREE.PointLight(0xff9a4a, 4.6, 18, 2);
      fireLight.position.set(C.x, C.y + 1.15, C.z);
      ctx.group.add(fireLight);

      /* embers — seeded, rising on the wall clock */
      const emberCount = 110;
      const emberPos = new Float32Array(emberCount * 3);
      const emberSeed = new Float32Array(emberCount);
      for (let i = 0; i < emberCount; i++) {
        emberSeed[i] = rnd(i, 3.1);
        emberPos[i * 3] = C.x + (rnd(i, 1.1) - 0.5) * 1.3;
        emberPos[i * 3 + 1] = C.y + 0.6 + rnd(i, 2.2) * 3.0;
        emberPos[i * 3 + 2] = C.z + (rnd(i, 4.4) - 0.5) * 1.3;
      }
      const embers = worldPoints(emberPos, { size: 0.08, color: 0xffb066, opacity: 0.9 });
      ctx.group.add(embers.sprite);
      ours.push(embers.material);

      tickers.push(() => {
        const t = gpuUniforms.time.value;
        const flicker = 1 + 0.12 * Math.sin(t * 7.0) * Math.sin(t * 4.3);
        flameOuterMat.uniforms.intensity.value = 1.15 * flicker;
        flameCoreMat.uniforms.intensity.value = 1.6 * (1 + 0.1 * Math.sin(t * 8.1));
        flameTipMat.uniforms.intensity.value = 0.9 * (1 + 0.18 * Math.sin(t * 5.7) * Math.cos(t * 3.3));
        fireLight.intensity = 4.6 * (0.9 + 0.1 * Math.sin(t * 3.1) * Math.sin(t * 1.7));
        logMat.opacity = clamp01(0.34 * (0.86 + 0.14 * Math.sin(t * 3.9)));

        flameOuter.scale.set(
          1.35 + 0.1 * Math.sin(t * 5.1),
          1.9 + 0.18 * Math.sin(t * 6.3),
          1.35 + 0.1 * Math.cos(t * 4.7)
        );
        flameCore.scale.set(
          0.8 + 0.07 * Math.sin(t * 7.7),
          1.05 + 0.12 * Math.cos(t * 5.9),
          0.8 + 0.07 * Math.sin(t * 6.1)
        );
        flameTip.position.x = C.x + 0.07 * Math.sin(t * 2.3);
        flameTip.position.z = C.z + 0.07 * Math.cos(t * 1.9);
        flameTip.scale.set(
          0.6 + 0.12 * Math.sin(t * 4.9),
          1.3 + 0.22 * Math.sin(t * 3.7),
          0.6 + 0.12 * Math.cos(t * 5.3)
        );

        const a = embers.position.array as Float32Array;
        for (let i = 0; i < emberCount; i++) {
          const i3 = i * 3;
          const rise = (emberSeed[i] + t * (0.05 + 0.05 * emberSeed[i])) % 1;
          a[i3] = C.x + (rnd(i, 5.5) - 0.5) * (1.3 + rise * 1.1) + Math.sin(t * 0.8 + i) * 0.06;
          a[i3 + 1] = C.y + 0.55 + rise * 3.6;
          a[i3 + 2] = C.z + (rnd(i, 6.6) - 0.5) * (1.3 + rise * 1.1) + Math.cos(t * 0.7 + i) * 0.06;
        }
        embers.position.needsUpdate = true;
      });

      /* ---------- the six visions, floating in the open air above the fire ---------- */
      const at = (dx: number, dy: number, dz: number) => {
        const g = new THREE.Group();
        g.position.set(C.x + dx, C.y + dy, C.z + dz);
        g.visible = false;
        ctx.group.add(g);
        return g;
      };
      const rainG = at(3.2, 4.0, -2.2);
      const ledgerG = at(-3.4, 4.2, -1.6);
      const sunG = at(0, 4.4, -4.2);
      const handG = at(2.6, 3.8, -3.2);
      const treeG = at(-3.0, 2.2, -3.6);
      const candleG = at(0, 3.6, -2.4);

      /* rain (t=0) — falling and fading */
      {
        const N = 420;
        const x0 = new Float32Array(N), y0 = new Float32Array(N), z0 = new Float32Array(N), vy = new Float32Array(N);
        for (let i = 0; i < N; i++) {
          x0[i] = (rnd(i, 1) - 0.5) * 4.4;
          y0[i] = rnd(i, 2) * 5.0;
          z0[i] = (rnd(i, 3) - 0.5) * 3.2;
          vy[i] = 1.6 + rnd(i, 4) * 2.2;
        }
        const rain = worldPoints(new Float32Array(N * 3), { size: 0.055, color: 0x9fb8dd, opacity: 0.85 });
        rainG.add(rain.sprite);
        ours.push(rain.material);
        const upd = (t: number) => {
          const a = rain.position.array as Float32Array;
          for (let i = 0; i < N; i++) {
            a[i * 3] = x0[i];
            a[i * 3 + 1] = ((y0[i] - vy[i] * t) % 5 + 5) % 5 - 2.5;
            a[i * 3 + 2] = z0[i];
          }
          rain.position.needsUpdate = true;
          rain.material.opacity = fadeU(t, 0, 2, 38, 42) * 0.85;
        };
        upd(ctx.uT.value);
        tickers.push(() => upd(ctx.uT.value));
      }

      /* ledger (t=47) — a page of drifting lights */
      {
        const GX = 12, GY = 8, N = GX * GY;
        const gx = new Float32Array(N), gy = new Float32Array(N), ph = new Float32Array(N);
        for (let j = 0; j < GY; j++) {
          for (let i = 0; i < GX; i++) {
            const k = j * GX + i;
            gx[k] = (i / (GX - 1) - 0.5) * 3.4;
            gy[k] = (j / (GY - 1) - 0.5) * 2.2;
            ph[k] = rnd(k, 7) * Math.PI * 2;
          }
        }
        const ledger = worldPoints(new Float32Array(N * 3), { size: 0.07, color: 0xcfc4a8, opacity: 0.8 });
        ledgerG.add(ledger.sprite);
        ours.push(ledger.material);
        const upd = (t: number) => {
          const a = ledger.position.array as Float32Array;
          for (let k = 0; k < N; k++) {
            const p = ph[k];
            a[k * 3] = gx[k] + Math.sin(t * 0.6 + p) * 0.08;
            a[k * 3 + 1] = gy[k] + Math.sin(t * 0.9 + p * 1.3) * 0.06;
            a[k * 3 + 2] = Math.sin(t * 0.5 + p * 0.7) * 0.05;
          }
          ledger.position.needsUpdate = true;
          ledger.material.opacity = fadeU(t, 47, 50, 108, 112) * (0.55 + 0.25 * Math.sin(t * 1.7));
        };
        upd(ctx.uT.value);
        tickers.push(() => upd(ctx.uT.value));
      }

      /* sun (t=112.8) — rising, haloed */
      {
        const sunMat = glowShader({ intensity: 1 }, (u, _uv) => T.vec3(1.0, 0.8, 0.46).mul(u.intensity), {});
        const sunGeo = new THREE.SphereGeometry(0.85, 20, 16);
        const sunMesh = new THREE.Mesh(sunGeo, sunMat);
        sunMesh.visible = false;
        sunG.add(sunMesh);
        ours.push(sunGeo, sunMat);

        const N = 130;
        const phase = new Float32Array(N), rad = new Float32Array(N), yoff = new Float32Array(N);
        for (let i = 0; i < N; i++) {
          phase[i] = rnd(i, 1.1) * Math.PI * 2;
          rad[i] = 1.35 + (rnd(i, 2.2) - 0.5) * 0.35;
          yoff[i] = (rnd(i, 3.3) - 0.5) * 0.35;
        }
        const halo = worldPoints(new Float32Array(N * 3), { size: 0.05, color: 0xffd98a, opacity: 0.9 });
        sunG.add(halo.sprite);
        ours.push(halo.material);

        const upd = (t: number) => {
          const fade = fadeU(t, 112.8, 117, 185, 190);
          const y = -1.4 + 2.8 * clamp01((t - 112.8) / 60);
          sunMesh.position.y = y;
          sunMat.uniforms.intensity.value = fade * 1.15;
          sunMesh.visible = fade > 0.001;
          const a = halo.position.array as Float32Array;
          for (let i = 0; i < N; i++) {
            const ang = phase[i] + t * 0.12;
            a[i * 3] = Math.cos(ang) * rad[i];
            a[i * 3 + 1] = y + yoff[i];
            a[i * 3 + 2] = Math.sin(ang) * rad[i];
          }
          halo.position.needsUpdate = true;
          halo.material.opacity = fade * 0.9;
          halo.sprite.visible = fade > 0.001;
        };
        upd(ctx.uT.value);
        tickers.push(() => upd(ctx.uT.value));
      }

      /* hand (t=190.8) — opening, then closing */
      {
        const N = 260;
        const open = new Float32Array(N * 3), closed = new Float32Array(N * 3);
        for (let i = 0; i < N; i++) {
          const a = rnd(i, 1.1) * Math.PI * 2;
          const r = 0.2 + Math.sqrt(rnd(i, 2.2));
          open[i * 3] = Math.cos(a) * r;
          open[i * 3 + 1] = 0.14 * r * r - 0.05;
          open[i * 3 + 2] = Math.sin(a) * r;

          const u = rnd(i, 3.3) * 2 - 1;
          const th = rnd(i, 4.4) * Math.PI * 2;
          const rr = 0.22 * Math.cbrt(rnd(i, 5.5));
          const s = Math.sqrt(Math.max(0, 1 - u * u));
          closed[i * 3] = rr * s * Math.cos(th);
          closed[i * 3 + 1] = rr * u;
          closed[i * 3 + 2] = rr * s * Math.sin(th);
        }
        const hand = worldPoints(new Float32Array(N * 3), { size: 0.035, color: 0xffc37a, opacity: 0.9 });
        handG.add(hand.sprite);
        ours.push(hand.material);

        const upd = (t: number) => {
          const fade = fadeU(t, 190.8, 193, 221, 225);
          const k = clamp01((t - 190.8) / 14.2);
          const a = hand.position.array as Float32Array;
          for (let i = 0; i < N; i++) {
            const i3 = i * 3;
            a[i3] = open[i3] + (closed[i3] - open[i3]) * k;
            a[i3 + 1] = open[i3 + 1] + (closed[i3 + 1] - open[i3 + 1]) * k;
            a[i3 + 2] = open[i3 + 2] + (closed[i3 + 2] - open[i3 + 2]) * k;
          }
          hand.position.needsUpdate = true;
          hand.material.opacity = fade * 0.9;
          hand.sprite.visible = fade > 0.001;
        };
        upd(ctx.uT.value);
        tickers.push(() => upd(ctx.uT.value));
      }

      /* tree (t=255.4) — growing, point by point */
      {
        const count = 220, trunkCount = 70;
        const xyz = new Float32Array(count * 3);
        for (let i = 0; i < trunkCount; i++) {
          const a = rnd(i, 1.1) * Math.PI * 2;
          const r = 0.035 * Math.sqrt(rnd(i, 2.2));
          xyz[i * 3] = Math.cos(a) * r;
          xyz[i * 3 + 1] = 1.2 * rnd(i, 3.3);
          xyz[i * 3 + 2] = Math.sin(a) * r;
        }
        for (let j = 0; j < count - trunkCount; j++) {
          const i = trunkCount + j;
          const th = rnd(i, 4.4) * Math.PI * 2;
          const phi = Math.acos(2 * rnd(i, 5.5) - 1);
          const r = 0.85 * Math.cbrt(rnd(i, 6.6));
          const sp = Math.sin(phi);
          xyz[i * 3] = r * sp * Math.cos(th);
          xyz[i * 3 + 1] = 1.5 + r * Math.cos(phi);
          xyz[i * 3 + 2] = r * sp * Math.sin(th);
        }
        const tree = worldPoints(xyz.slice(), { size: 0.09, color: 0xa8d47a, opacity: 0.9 });
        tree.material.opacity = 0;
        treeG.add(tree.sprite);
        ours.push(tree.material);

        const upd = (t: number) => {
          const g = clamp01((t - 255.4) / 35);
          tree.material.opacity = fadeU(t, 255.4, 258, 468, 474) * 0.9;
          const a = tree.position.array as Float32Array;
          for (let i = 0; i < count; i++) {
            const i3 = i * 3;
            const s = rnd(i, 7.7) < g ? g : 0;
            a[i3] = xyz[i3] * s;
            a[i3 + 1] = xyz[i3 + 1] * s;
            a[i3 + 2] = xyz[i3 + 2] * s;
          }
          tree.position.needsUpdate = true;
        };
        upd(ctx.uT.value);
        tickers.push(() => upd(ctx.uT.value));
      }

      /* candle (t=524.2) — wax, embers, and a flame that holds */
      {
        const waxCount = 60;
        const waxPos = new Float32Array(waxCount * 3);
        for (let i = 0; i < waxCount; i++) {
          const a = rnd(i, 1.1) * Math.PI * 2;
          const r = 0.1 * Math.sqrt(rnd(i, 2.2));
          waxPos[i * 3] = Math.cos(a) * r;
          waxPos[i * 3 + 1] = 0.55 * rnd(i, 3.3);
          waxPos[i * 3 + 2] = Math.sin(a) * r;
        }
        const wax = worldPoints(waxPos, { size: 0.06, color: 0xf5e6c8, opacity: 0.9 });
        wax.material.opacity = 0;
        candleG.add(wax.sprite);
        ours.push(wax.material);

        const emberCount = 30;
        const emberPos = new Float32Array(emberCount * 3);
        for (let i = 0; i < emberCount; i++) {
          const a = rnd(i, 4.4) * Math.PI * 2;
          const r = 0.14 * Math.sqrt(rnd(i, 5.5));
          emberPos[i * 3] = Math.cos(a) * r;
          emberPos[i * 3 + 1] = 0.85 + rnd(i, 6.6) * 0.45;
          emberPos[i * 3 + 2] = Math.sin(a) * r;
        }
        const cEmbers = worldPoints(emberPos, { size: 0.05, color: 0xffb36b, opacity: 0.9 });
        cEmbers.material.opacity = 0;
        candleG.add(cEmbers.sprite);
        ours.push(cEmbers.material);

        const cFlameMat = glowShader(
          { intensity: 1.2 },
          (u, _uv) => T.vec3(1.0, 0.62, 0.25).mul(u.intensity),
          {}
        );
        const cFlameGeo = new THREE.SphereGeometry(1, 16, 16);
        const cFlame = new THREE.Mesh(cFlameGeo, cFlameMat);
        cFlame.position.set(0, 0.8, 0);
        cFlame.scale.setScalar(0.16);
        candleG.add(cFlame);
        ours.push(cFlameGeo, cFlameMat);

        const upd = (t: number) => {
          const op = fadeU(t, 524.2, 527, 569, 570.5);
          wax.material.opacity = op * 0.9;
          cEmbers.material.opacity = op * 0.9;
          cFlameMat.uniforms.intensity.value =
            op * 1.2 * (1 + 0.25 * Math.sin(gpuUniforms.time.value * 9) * Math.sin(gpuUniforms.time.value * 5.3));
          cFlame.visible = op > 0.001;
          wax.sprite.visible = op > 0.001;
          cEmbers.sprite.visible = op > 0.001;

          const a = cEmbers.position.array as Float32Array;
          for (let i = 0; i < emberCount; i++) {
            const i3 = i * 3;
            const rise = (t * (0.25 + rnd(i, 7.7) * 0.5) + rnd(i, 8.8)) % 1;
            a[i3] = emberPos[i3] * (1 + rise * 0.6);
            a[i3 + 1] = 0.85 + rise * 0.65;
            a[i3 + 2] = emberPos[i3 + 2] * (1 + rise * 0.6);
          }
          cEmbers.position.needsUpdate = true;
        };
        upd(ctx.uT.value);
        tickers.push(() => upd(ctx.uT.value));
      }

      /* one vision at a time, kept by the narration clock */
      tickers.push(() => {
        rainG.visible = segment === "rain";
        ledgerG.visible = segment === "ledger";
        sunG.visible = segment === "sun";
        handG.visible = segment === "hand";
        treeG.visible = segment === "tree";
        candleG.visible = segment === "candle";
      });
    },
    beats: [
      { t: 0, apply: () => { segment = "rain"; } },
      { t: 47, apply: () => { segment = "ledger"; } },
      { t: 112.8, apply: () => { segment = "sun"; } },
      { t: 190.8, apply: () => { segment = "hand"; } },
      { t: 255.4, apply: () => { segment = "tree"; } },
      { t: 524.2, apply: () => { segment = "candle"; } },
    ],
    onEnd: () => { segment = ""; },
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
    segment = "";
  };

  return lesson;
}
