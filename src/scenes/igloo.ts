/* The igloo lesson (L04): a luminous shelter of translucent ice and snow.
   A smooth wind-worn ice dome shelters the hearth while an open portal looks
   out onto a vast cold expanse with shimmering aurora borealis curtains.
   Light filters through the translucent ice walls — soft, blue-white, diffused,
   interwoven with dynamic aurora glow. At the center: a stone-ringed fireplace,
   warm light pooling on the ice floor, rising embers — cozy shelter vs vast cold.
   Six visions arrive on the narration clock (L04, 570.5s): rain, ledger, sun,
   hand, tree, candle. */
import * as THREE from "three/webgpu";
import { LessonScene } from "./lessonKit";
import type { LessonCtx, LessonOpts, SceneModule } from "./lessonKit";
import { SITES } from "./sites";
import { worldPoints, glowShader, gpuUniforms, T, vnoise } from "../gpu/tsl";
import { prismGeometry, crystalMaterial } from "../world/creation";

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
  /* seat stands at the entrance threshold, looking into the warm hearth */
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
      ctx.group.add(kit.group);

      /* soft-edged painterly moonlit-ice ring */
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
        const cr = ((color >> 16) & 255) / 255;
        const cg = ((color >> 8) & 255) / 255;
        const cb = (color & 255) / 255;
        const mat = glowShader(
          { intensity: opacity },
          (u, uv) => {
            const r01 = T.length(uv.sub(T.float(0.5))).mul(T.float(2));
            const band = T.smoothstep(T.float(inner - 0.08), T.float(inner + 0.08), r01).mul(
              T.float(1).sub(T.smoothstep(T.float(0.92), T.float(1.0), r01))
            );
            return T.vec3(T.float(cr), T.float(cg), T.float(cb)).mul(band).mul(u.intensity);
          },
          { side: THREE.DoubleSide }
        );
        const m = new THREE.Mesh(geo, mat);
        m.rotation.x = -Math.PI / 2;
        m.position.set(x, y, z);
        ctx.group.add(m);
        ours.push(geo, mat);
        const p = clamp01(pulse);
        tickers.push(() => {
          const t = Number.isFinite(gpuUniforms.time.value) ? gpuUniforms.time.value : 0;
          mat.uniforms.intensity.value = clamp01(opacity * (1 - p + p * Math.sin(t * 0.5)));
        });
      };

      /* ---------- snowfall & cold moon ---------- */
      kit.snowfall(1400, site.x, site.z, 32, 18);

      const moonCoreMat = glowShader(
        { intensity: 0.9 },
        (u, _uv) => T.vec3(0.88, 0.94, 1.0).mul(u.intensity),
        {}
      );
      const moonCoreGeo = new THREE.SphereGeometry(0.9, 24, 18);
      const moonCore = new THREE.Mesh(moonCoreGeo, moonCoreMat);
      moonCore.position.set(C.x + 9, C.y + 16, C.z - 14);
      ctx.group.add(moonCore);

      const moonHaloMat = glowShader(
        { intensity: 0.25 },
        (u, _uv) => T.vec3(0.85, 0.92, 1.0).mul(u.intensity),
        {}
      );
      const moonHaloGeo = new THREE.SphereGeometry(2.1, 24, 18);
      const moonHalo = new THREE.Mesh(moonHaloGeo, moonHaloMat);
      moonHalo.position.set(C.x + 9, C.y + 16, C.z - 14);
      ctx.group.add(moonHalo);
      ours.push(moonCoreGeo, moonCoreMat, moonHaloGeo, moonHaloMat);

      tickers.push(() => {
        const t = Number.isFinite(gpuUniforms.time.value) ? gpuUniforms.time.value : 0;
        moonCoreMat.uniforms.intensity.value = 0.9 * (1 + 0.08 * Math.sin((t / 10) * Math.PI * 2));
        moonHaloMat.uniforms.intensity.value = 0.25 * (1 + 0.12 * Math.sin((t / 12) * Math.PI * 2 + 1.1));
      });

      /* ---------- Aurora Borealis Sky Curtains ---------- */
      const auroraCurtains = (): void => {
        const curtainSpecs = [
          { r: 42, h: 22, y: 12, a: -1.2, arc: 2.4, ph: 0.0, speed: 0.18, op: 0.38 },
          { r: 48, h: 26, y: 15, a: -1.5, arc: 2.8, ph: 1.7, speed: 0.14, op: 0.28 },
          { r: 55, h: 30, y: 18, a: -1.8, arc: 3.2, ph: 3.4, speed: 0.11, op: 0.20 },
        ];

        for (let idx = 0; idx < curtainSpecs.length; idx++) {
          const spec = curtainSpecs[idx];
          const geo = new THREE.CylinderGeometry(
            spec.r,
            spec.r * 1.05,
            spec.h,
            64,
            16,
            true,
            spec.a,
            spec.arc
          );

          const mat = glowShader(
            { intensity: spec.op },
            (u, uv) => {
              // Time coordinate
              const t = gpuUniforms.time.add(T.float(spec.ph)).mul(T.float(spec.speed));

              // Vertical plasma waves across the curtain width (uv.x)
              const wave1 = T.sin(uv.x.mul(T.float(24.0)).add(t.mul(T.float(1.5))));
              const wave2 = T.cos(uv.x.mul(T.float(14.0)).sub(t.mul(T.float(0.9))));
              const n = vnoise(T.vec2(uv.x.mul(T.float(8.0)).add(t), uv.y.mul(T.float(4.0))));
              const plasma = wave1.add(wave2).mul(T.float(0.5)).add(n).mul(T.float(0.5)).add(T.float(0.5));

              // Vertical curtain rays: bright streaks running top to bottom
              const rayPattern = T.sin(uv.x.mul(T.float(48.0)).add(t.mul(T.float(2.0))));
              const rays = rayPattern.mul(T.float(0.3)).add(T.float(0.7));

              // Soft top/bottom vertical falloff
              const vertFade = T.smoothstep(T.float(0.0), T.float(0.25), uv.y).mul(
                T.smoothstep(T.float(1.0), T.float(0.65), uv.y)
              );

              // Angular fade at sides
              const horizFade = T.smoothstep(T.float(0.0), T.float(0.18), uv.x).mul(
                T.smoothstep(T.float(1.0), T.float(0.82), uv.x)
              );

              // Aurora color spectrum shifting: Emerald Green -> Cyan -> Deep Violet
              const colGreen = T.vec3(T.float(0.18), T.float(0.92), T.float(0.62));
              const colCyan  = T.vec3(T.float(0.15), T.float(0.78), T.float(0.95));
              const colViolet= T.vec3(T.float(0.62), T.float(0.35), T.float(0.92));

              const mix1 = T.smoothstep(T.float(0.2), T.float(0.6), plasma);
              const mix2 = T.smoothstep(T.float(0.5), T.float(0.9), plasma);

              const auroraCol = T.mix(colGreen, T.mix(colCyan, colViolet, mix2), mix1);

              return auroraCol.mul(plasma).mul(rays).mul(vertFade).mul(horizFade).mul(u.intensity);
            },
            { side: THREE.DoubleSide }
          );

          const mesh = new THREE.Mesh(geo, mat);
          mesh.position.set(C.x, C.y + spec.y, C.z - 6);
          ctx.group.add(mesh);
          ours.push(geo, mat);

          tickers.push(() => {
            const t = Number.isFinite(gpuUniforms.time.value) ? gpuUniforms.time.value : 0;
            mat.uniforms.intensity.value = clamp01(
              spec.op * (0.82 + 0.18 * Math.sin(t * 0.4 + spec.ph))
            );
          });
        }
      };

      auroraCurtains();

      /* ---------- Ice Field Rings ---------- */
      ring(C.x, C.y + 0.01, C.z, 30, 0xcfe6ff, 0.18, 0.55, 0.1);
      ring(C.x, C.y + 0.02, C.z, 19, 0x9dc6ff, 0.12, 0.62, 0.16);
      ring(C.x, C.y + 0.03, C.z, 11.5, 0x7fb2ff, 0.10, 0.7, 0.2);

      /* warm light pool on ice floor */
      function warmPool() {
        const geo = new THREE.PlaneGeometry(18, 18);
        const phase = rnd(21, 5) * Math.PI * 2;

        const mat = glowShader(
          { intensity: 0.60 },
          (u, uv) => {
            const p = uv.sub(T.float(0.5)).mul(T.float(2.0));
            const r = T.length(p);
            const n = vnoise(uv.mul(T.float(3.1)).add(T.vec2(T.float(0.17), T.float(0.63))));
            const rb = r.add(n.sub(T.float(0.5)).mul(T.float(0.34)));
            const g = T.exp(rb.mul(rb).mul(T.float(-1.55)));
            const edge = T.smoothstep(T.float(1.24), T.float(0.56), rb);
            const melt = T.smoothstep(T.float(0.1), T.float(1.06), rb);
            const col = T.mix(
              T.vec3(T.float(1.0), T.float(0.78), T.float(0.42)),
              T.vec3(T.float(0.42), T.float(0.62), T.float(0.88)),
              melt
            );
            return col.mul(g).mul(edge).mul(u.intensity);
          },
          { side: THREE.DoubleSide }
        );

        const m = new THREE.Mesh(geo, mat);
        m.rotation.x = -Math.PI / 2;
        m.position.set(C.x, C.y + 0.06, C.z);
        ctx.group.add(m);
        ours.push(geo, mat);

        tickers.push(() => {
          const t = Number.isFinite(gpuUniforms.time.value) ? gpuUniforms.time.value : 0;
          mat.uniforms.intensity.value = clamp01(
            0.60 * (0.86 + 0.14 * Math.sin(t * 0.739 + phase))
          );
        });
      }

      warmPool();

      /* sit mat */
      function sitMat() {
        const span = 3.9;
        const geo = new THREE.PlaneGeometry(span, span);
        const mat = glowShader(
          { intensity: 0.45 },
          (u, uv) => {
            const rb = T.length(uv.sub(T.float(0.5))).mul(T.float(2));
            const glow = T.exp(rb.mul(rb).mul(T.float(-1.9)));
            const wob = vnoise(uv.mul(T.float(3.1)).add(T.vec2(T.float(7.3), T.float(2.6))));
            const rim = T.smoothstep(
              T.float(0.55),
              T.float(1.22),
              rb.add(wob.sub(T.float(0.5)).mul(T.float(0.34)))
            );
            const fibre = vnoise(uv.mul(T.float(46)).add(T.vec2(T.float(1.7), T.float(9.1))));
            const weave = T.float(1).add(fibre.sub(T.float(0.5)).mul(T.float(0.07)));

            return T.vec3(T.float(0.541), T.float(0.416), T.float(0.29))
              .mul(glow)
              .mul(T.float(1).sub(rim))
              .mul(weave)
              .mul(u.intensity);
          },
          { side: THREE.DoubleSide }
        );

        const m = new THREE.Mesh(geo, mat);
        m.rotation.x = -Math.PI / 2;
        m.position.set(seat.x, seat.y + 0.09, seat.z);
        ctx.group.add(m);
        ours.push(geo, mat);

        const phase = rnd(33, 9) * Math.PI * 2;
        tickers.push(() => {
          const t = Number.isFinite(gpuUniforms.time.value) ? gpuUniforms.time.value : 0;
          mat.uniforms.intensity.value = clamp01(0.45 * (0.88 + 0.12 * Math.sin(t * 0.571 + phase)));
        });
      }

      sitMat();

      /* ---------- Translucent Glowing Smooth Ice Dome ---------- */
      const iceDome = (): void => {
        const R_outer = 8.5;
        const R_inner = 8.1;
        // Open archway / portal cut in front towards +Z (opening angle ~0.85 rad)
        const phiStart = 0.42;
        const phiLength = Math.PI * 2 - 0.84;
        const thetaLength = Math.PI * 0.52;

        /* Outer Smooth Ice Shell */
        const outerGeo = new THREE.SphereGeometry(
          R_outer,
          64,
          32,
          phiStart,
          phiLength,
          0,
          thetaLength
        );

        const outerMat = glowShader(
          { intensity: 0.38 },
          (u, uv) => {
            const t = gpuUniforms.time;
            const posW = T.positionWorld;

            // Wind-worn organic ice noise pattern
            const iceNoise = vnoise(posW.xz.mul(T.float(0.18)).add(posW.yy.mul(T.float(0.12))));
            const frostSeams = T.smoothstep(T.float(0.42), T.float(0.68), iceNoise);

            // Fresnel glint on the smooth curved ice surface
            const N = T.normalWorld;
            const V = T.normalize(T.cameraPosition.sub(posW));
            const NdotV = T.abs(T.dot(N, V));
            const fresnel = T.pow(T.float(1.0).sub(NdotV), T.float(2.2));

            // Aurora glow filtering through the translucent ice dome
            const auroraPulse = T.sin(posW.x.mul(T.float(0.12)).add(t.mul(T.float(0.3)))).add(
              T.cos(posW.z.mul(T.float(0.12)).sub(t.mul(T.float(0.2))))
            ).mul(T.float(0.5)).add(T.float(0.5));

            const colBase = T.vec3(T.float(0.52), T.float(0.82), T.float(1.0));
            const colFrost = T.vec3(T.float(0.88), T.float(0.96), T.float(1.0));
            const colAurora = T.vec3(T.float(0.25), T.float(0.95), T.float(0.72));

            const col = T.mix(
              colBase,
              colFrost,
              frostSeams.mul(T.float(0.4))
            ).add(colAurora.mul(auroraPulse).mul(T.float(0.25)));

            // Vertical edge soft fade near ground and apex
            const vertFade = T.smoothstep(T.float(0.0), T.float(0.12), uv.y).mul(
              T.smoothstep(T.float(1.0), T.float(0.85), uv.y)
            );
            // Angular soft fade at portal opening edges
            const portalFade = T.smoothstep(T.float(0.0), T.float(0.08), uv.x).mul(
              T.smoothstep(T.float(1.0), T.float(0.92), uv.x)
            );

            const totalGlow = col.mul(T.float(1.0).add(fresnel.mul(T.float(0.85))))
              .mul(vertFade)
              .mul(portalFade)
              .mul(u.intensity);

            return totalGlow;
          },
          { side: THREE.DoubleSide }
        );

        const outerMesh = new THREE.Mesh(outerGeo, outerMat);
        outerMesh.position.set(C.x, C.y - 0.1, C.z);
        ctx.group.add(outerMesh);

        /* Inner Luminous Ice Shell */
        const innerGeo = new THREE.SphereGeometry(
          R_inner,
          64,
          32,
          phiStart,
          phiLength,
          0,
          thetaLength
        );

        const innerMat = glowShader(
          { intensity: 0.22 },
          (u, uv) => {
            const posW = T.positionWorld;
            const caustics = vnoise(posW.xz.mul(T.float(0.35)));
            const warmGlow = T.smoothstep(T.float(10.0), T.float(1.0), T.length(posW.sub(T.vec3(T.float(C.x), T.float(C.y + 1.0), T.float(C.z)))));

            const colCool = T.vec3(T.float(0.65), T.float(0.88), T.float(1.0));
            const colWarm = T.vec3(T.float(1.0), T.float(0.75), T.float(0.48));

            const col = T.mix(colCool, colWarm, warmGlow.mul(T.float(0.45))).add(caustics.mul(T.float(0.15)));

            const vertFade = T.smoothstep(T.float(0.0), T.float(0.1), uv.y).mul(
              T.smoothstep(T.float(1.0), T.float(0.88), uv.y)
            );
            const portalFade = T.smoothstep(T.float(0.0), T.float(0.08), uv.x).mul(
              T.smoothstep(T.float(1.0), T.float(0.92), uv.x)
            );

            return col.mul(vertFade).mul(portalFade).mul(u.intensity);
          },
          { side: THREE.DoubleSide }
        );

        const innerMesh = new THREE.Mesh(innerGeo, innerMat);
        innerMesh.position.set(C.x, C.y - 0.1, C.z);
        ctx.group.add(innerMesh);

        /* Portal Archway Surround Ring */
        const portalRingGeo = new THREE.TorusGeometry(R_outer * 0.98, 0.45, 16, 48, Math.PI * 0.42);
        const portalRingMat = glowShader(
          { intensity: 0.42 },
          (u, _uv) => {
            return T.vec3(T.float(0.78), T.float(0.92), T.float(1.0)).mul(u.intensity);
          },
          { side: THREE.DoubleSide }
        );
        const portalRing = new THREE.Mesh(portalRingGeo, portalRingMat);
        portalRing.position.set(C.x, C.y + R_outer * 0.45, C.z + R_outer * 0.88);
        portalRing.rotation.x = Math.PI * 0.15;
        ctx.group.add(portalRing);

        /* Bright Frost Footing along the Dome Perimeter */
        const footRingGeo = new THREE.RingGeometry(R_inner * 0.95, R_outer * 1.08, 64, 1, phiStart, phiLength);
        const footRingMat = glowShader(
          { intensity: 0.48 },
          (u, uv) => {
            const portalFade = T.smoothstep(T.float(0.0), T.float(0.08), uv.x).mul(
              T.smoothstep(T.float(1.0), T.float(0.92), uv.x)
            );
            return T.vec3(T.float(0.82), T.float(0.92), T.float(1.0)).mul(portalFade).mul(u.intensity);
          },
          { side: THREE.DoubleSide }
        );
        const footRing = new THREE.Mesh(footRingGeo, footRingMat);
        footRing.rotation.x = -Math.PI / 2;
        footRing.position.set(C.x, C.y + 0.08, C.z);
        ctx.group.add(footRing);

        ours.push(outerGeo, outerMat, innerGeo, innerMat, portalRingGeo, portalRingMat, footRingGeo, footRingMat);

        tickers.push(() => {
          const t = Number.isFinite(gpuUniforms.time.value) ? gpuUniforms.time.value : 0;
          outerMat.uniforms.intensity.value = clamp01(0.38 * (0.88 + 0.12 * Math.sin(t * 0.32)));
          innerMat.uniforms.intensity.value = clamp01(0.22 * (0.85 + 0.15 * Math.sin(t * 0.45 + 1.2)));
          portalRingMat.uniforms.intensity.value = clamp01(0.42 * (0.86 + 0.14 * Math.sin(t * 0.5)));
          footRingMat.uniforms.intensity.value = clamp01(0.48 * (0.88 + 0.12 * Math.sin(t * 0.28)));
        });
      };

      iceDome();

      /* ---------- softShards(): ice prisms ---------- */
      const softShards = (n: number, center: THREE.Vector3, radius = 5): void => {
        const count = Math.max(1, Math.floor(n));
        const invCount = count > 0 ? 1 / count : 0;

        const geo = prismGeometry();
        const mat = crystalMaterial();
        mat.colorNode = T.vec4(T.vec3(mat.colorNode).mul(0.55), 1);

        const aC = new Float32Array(count * 3);
        for (let i = 0; i < count; i++) {
          aC[i * 3 + 0] = (i * 0.37) % 1;
          aC[i * 3 + 1] = 0.12;
          aC[i * 3 + 2] = rnd(i, 3.14);
        }
        geo.setAttribute("aC", new THREE.InstancedBufferAttribute(aC, 3));

        const mesh = new THREE.InstancedMesh(geo, mat, count);
        mesh.renderOrder = 2;
        mesh.frustumCulled = false;
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        ctx.group.add(mesh);

        const px = new Float32Array(count);
        const py = new Float32Array(count);
        const pz = new Float32Array(count);
        const tx = new Float32Array(count);
        const ya = new Float32Array(count);
        const tz = new Float32Array(count);
        const sc = new Float32Array(count);

        for (let i = 0; i < count; i++) {
          const ang = i * invCount * Math.PI * 2 + (rnd(i, 1.7) - 0.5) * 0.6;
          const rr = radius * (0.25 + rnd(i, 2.6) * 0.75);
          px[i] = center.x + Math.cos(ang) * rr;
          py[i] = center.y;
          pz[i] = center.z + Math.sin(ang) * rr;
          tx[i] = (rnd(i, 5.5) - 0.5) * 0.7;
          ya[i] = (rnd(i, 4.4) - 0.5) * Math.PI * 2;
          tz[i] = (rnd(i, 6.6) - 0.5) * 0.7;
          sc[i] = 0.9 + rnd(i, 7.7) * 0.9;
        }

        const node = new THREE.Object3D();
        const compose = (t: number): void => {
          for (let i = 0; i < count; i++) {
            const pulse = 1 + 0.25 * Math.sin(t * 2 + i * 0.7);
            node.position.set(px[i], py[i], pz[i]);
            node.rotation.set(tx[i], ya[i], tz[i]);
            node.scale.setScalar(sc[i] * pulse);
            node.updateMatrix();
            mesh.setMatrixAt(i, node.matrix);
          }
          mesh.instanceMatrix.needsUpdate = true;
        };
        compose(0);

        tickers.push(() => {
          const t = gpuUniforms.time.value;
          if (!Number.isFinite(t)) return;
          compose(t);
        });

        ours.push(geo, mat);
      };

      /* Shards around clearing and entrance */
      const shardCount = 8;
      for (let i = 0; i < shardCount; i++) {
        const ang = (i / shardCount) * Math.PI * 2 + (rnd(i, 2.3) - 0.5) * 0.5;
        const rr = 13.5 + (rnd(i, 5.1) - 0.5) * 3.4;
        const p = new THREE.Vector3(
          C.x + Math.cos(ang) * rr,
          C.y + 0.25,
          C.z + Math.sin(ang) * rr
        );
        softShards(5 + Math.floor(rnd(i, 7.7) * 4), p, 2.6 + rnd(i, 8.8) * 1.6);
      }
      softShards(10, new THREE.Vector3(C.x - 6.2, C.y + 0.25, C.z - 3.0), 2.2);
      softShards(9, new THREE.Vector3(C.x + 6.0, C.y + 0.25, C.z - 2.2), 2.0);

      /* moonbeams */
      const softBeams = (positions: THREE.Vector3[], height: number, radius: number): void => {
        for (let bi = 0; bi < positions.length; bi++) {
          const pos = positions[bi];
          const mat = glowShader(
            { intensity: 0.5 },
            (u, uv) => {
              const fx = T.smoothstep(T.float(0.5), T.float(0.1), T.abs(uv.x.sub(T.float(0.5))));
              const fy = T.smoothstep(T.float(0.0), T.float(0.25), uv.y).mul(
                T.smoothstep(T.float(1.0), T.float(0.55), uv.y)
              );
              return T.vec3(T.float(0.722), T.float(0.82), T.float(1.0)).mul(fx).mul(fy).mul(u.intensity);
            },
            { side: THREE.DoubleSide }
          );
          for (let k = 0; k < 2; k++) {
            const geo = new THREE.PlaneGeometry(radius * 2.4, height);
            const m = new THREE.Mesh(geo, mat);
            m.position.set(pos.x, pos.y + height / 2, pos.z);
            m.rotation.y = k * 0.5 * Math.PI + bi * 0.7;
            ctx.group.add(m);
            ours.push(geo);
          }
          ours.push(mat);
          const base = 0.5;
          tickers.push(() => {
            const t = Number.isFinite(gpuUniforms.time.value) ? gpuUniforms.time.value : 0;
            mat.uniforms.intensity.value = clamp01(base * (0.82 + 0.18 * Math.sin(t * 1.4 + bi * 1.1)));
          });
        }
      };
      softBeams(
        [
          new THREE.Vector3(C.x + 1.6, C.y, C.z - 1.4),
          new THREE.Vector3(C.x - 5.2, C.y, C.z - 6.4),
        ],
        8,
        0.5
      );

      /* light-flowers on snow */
      kit.flowers(30, C.x, C.z, 11);
      kit.flowers(16, C.x, C.z, 6.2);

      /* trail of lamps leading to entrance */
      const trail: THREE.Vector3[] = [];
      const gate = new THREE.Vector3(C.x, C.y, C.z + 14);
      for (let i = 0; i <= 9; i++) trail.push(new THREE.Vector3().lerpVectors(seat, gate, i / 9));

      const softLamps = (points: THREE.Vector3[]): void => {
        const haloPos = new Float32Array(points.length * 3);
        const coreMats: THREE.PointsNodeMaterial[] = [];
        for (let i = 0; i < points.length; i++) {
          const p = points[i];
          haloPos[i * 3] = p.x;
          haloPos[i * 3 + 1] = p.y + 0.3;
          haloPos[i * 3 + 2] = p.z;
          const core = worldPoints(new Float32Array([p.x, p.y + 0.3, p.z]), {
            size: 0.45,
            color: 0xffe6a0,
            opacity: 0.95,
          });
          ctx.group.add(core.sprite);
          ours.push(core.material);
          coreMats.push(core.material);
        }
        const halos = worldPoints(haloPos, { size: 1.6, color: 0xffd9a0, opacity: 0.3 });
        ctx.group.add(halos.sprite);
        ours.push(halos.material);
        tickers.push(() => {
          const t = Number.isFinite(gpuUniforms.time.value) ? gpuUniforms.time.value : 0;
          for (let i = 0; i < coreMats.length; i++) {
            coreMats[i].opacity = clamp01(0.95 * (0.62 + 0.38 * Math.sin(t * 2.0 - i * 0.6)));
          }
          halos.material.opacity = clamp01(0.3 * (0.75 + 0.25 * Math.sin(t * 2.0)));
        });
      };
      softLamps(trail);

      /* ---------- hearth ---------- */
      const wisp = kit.wisp(0xffab52, 0.78);
      wisp.setCenter(new THREE.Vector3(C.x, C.y + 0.6, C.z));
      ctx.group.add(wisp.group);

      const coldWisp = kit.wisp(0x7fb6ff, 0.5);
      coldWisp.setCenter(new THREE.Vector3(C.x - 5.8, C.y + 1.8, C.z - 7.2));
      ctx.group.add(coldWisp.group);

      /* stone ring */
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

      /* crossed glowing logs */
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

      /* living flame */
      const flameCoreMat = glowShader(
        { intensity: 1.25 },
        (u, _uv) => T.vec3(1.0, 0.8, 0.4).mul(u.intensity),
        {}
      );
      const flameMidMat = glowShader(
        { intensity: 0.55 },
        (u, _uv) => T.vec3(1.0, 0.52, 0.18).mul(u.intensity),
        {}
      );
      const flameHaloMat = glowShader(
        { intensity: 0.2 },
        (u, _uv) => T.vec3(1.0, 0.48, 0.16).mul(u.intensity),
        {}
      );

      const coreGeo = new THREE.SphereGeometry(0.3, 20, 16);
      const flameCore = new THREE.Mesh(coreGeo, flameCoreMat);
      flameCore.position.set(C.x, C.y + 0.72, C.z);
      flameCore.scale.set(0.9, 1.2, 0.9);
      ctx.group.add(flameCore);
      ours.push(coreGeo, flameCoreMat);

      const midGeo = new THREE.SphereGeometry(0.55, 20, 16);
      const flameMid = new THREE.Mesh(midGeo, flameMidMat);
      flameMid.position.set(C.x, C.y + 1.02, C.z);
      flameMid.scale.set(1.0, 1.45, 1.0);
      ctx.group.add(flameMid);
      ours.push(midGeo, flameMidMat);

      const haloGeo = new THREE.SphereGeometry(1.02, 20, 16);
      const flameHalo = new THREE.Mesh(haloGeo, flameHaloMat);
      flameHalo.position.set(C.x, C.y + 1.02, C.z);
      flameHalo.scale.set(1.0, 1.15, 1.0);
      ctx.group.add(flameHalo);
      ours.push(haloGeo, flameHaloMat);

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

      /* embers rising */
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
        const t = Number.isFinite(gpuUniforms.time.value) ? gpuUniforms.time.value : 0;
        const flicker = 1 + 0.12 * Math.sin(t * 7.0) * Math.sin(t * 4.3);
        flameCoreMat.uniforms.intensity.value = 1.25 * (1 + 0.1 * Math.sin(t * 8.1));
        flameMidMat.uniforms.intensity.value = 0.55 * flicker;
        flameHaloMat.uniforms.intensity.value = 0.2 * (1 + 0.18 * Math.sin(t * 5.7) * Math.cos(t * 3.3));
        fireLight.intensity = 4.6 * (0.9 + 0.1 * Math.sin(t * 3.1) * Math.sin(t * 1.7));
        logMat.opacity = clamp01(0.34 * (0.86 + 0.14 * Math.sin(t * 3.9)));

        flameCore.scale.set(
          0.9 + 0.07 * Math.sin(t * 7.7),
          1.2 + 0.12 * Math.cos(t * 5.9),
          0.9 + 0.07 * Math.sin(t * 6.1)
        );
        flameMid.scale.set(
          1.0 + 0.08 * Math.sin(t * 5.1),
          1.45 + 0.16 * Math.sin(t * 6.3),
          1.0 + 0.08 * Math.cos(t * 4.7)
        );
        flameMid.position.x = C.x + 0.07 * Math.sin(t * 2.3);
        flameMid.position.z = C.z + 0.07 * Math.cos(t * 1.9);
        flameHalo.scale.set(
          1.0 + 0.05 * Math.sin(t * 4.9),
          1.15 + 0.1 * Math.sin(t * 3.7),
          1.0 + 0.05 * Math.cos(t * 5.3)
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

      /* ---------- six visions ---------- */
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

      /* rain */
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

      /* ledger */
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

      /* sun */
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

      /* hand */
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

      /* tree */
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

      /* candle */
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

      /* segment visibility */
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
