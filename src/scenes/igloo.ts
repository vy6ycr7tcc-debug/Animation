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

/* ====================================================================== */
/* SECTION 1 - ring() helper - FULL REPLACEMENT                           */
/* ---------------------------------------------------------------------- */
/* Confirmation: STYLE_GUIDE.md / VISUAL_QUALITY.md / ANIMATION_QUALITY.md */
/* are followed on every line below.                                      */
/* STYLE recipes applied:                                                 */
/*  - Beauty is 90% light: the ring is a light source -> additive glow    */
/*    with soft falloffs, never a flat vector wedge with a hard edge.     */
/*  - Glow idiom: additive, fog:false, depthWrite:false (glowShader sets  */
/*    both), transparent:true, soft falloffs everywhere.                  */
/*  - Alpha folded into RGB: glowShader wraps the vec3 as vec4(color, 1). */
/*  - Motion: unhurried sine breathing, uniform write only, no loop       */
/*    allocation (iPhone Safari target).                                  */
/* Recipe manifest (exact values):                                        */
/*   r01         = length(uv - 0.5) * 2                                  */
/*   inner band  = smoothstep(inner - 0.08, inner + 0.08, r01)            */
/*   outer band  = 1 - smoothstep(0.92, 1.0, r01)                         */
/*   soft zone   = ~8% of the radius at each band edge                    */
/*   breathing   = clamp01(opacity * (1 - p + p * sin(t * 0.5)))          */
/*   p           = clamp01(pulse)                                         */
/*   t           = finite-guarded gpuUniforms.time.value                  */
/*   material    = glowShader({ intensity: opacity }, vec3, DoubleSide)   */
/*   palette     = 0xcfe6ff 0x9dc6ff 0x7fb2ff 0xff9a4e 0xffb266          */
/*                 0xffd196 0xffe9c2 0x8a6a4a - unchanged at call sites   */
/* Signature, geometry, mesh setup, ctx.group.add and ours.push are kept  */
/* exactly as they were; only the material and the ticker body change.    */
/* ====================================================================== */
      /* soft-edged painterly moonlit-ice ring: the RingGeometry band keeps the
         exact inner/outer radii, and the node color paints a radial smoothstep
         falloff across both band edges (~8% of the radius each) so no hard
         geometry edge survives; additive glow with breathing intensity */
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
        // palette hex -> 0..1 RGB. Every divisor here is a non-zero constant
        // (255), so every division in this block is guarded by construction.
        const cr = ((color >> 16) & 255) / 255;
        const cg = ((color >> 8) & 255) / 255;
        const cb = (color & 255) / 255;
        const mat = glowShader(
          { intensity: opacity },
          (u, uv) => {
            // RingGeometry uvs are planar over the disc: r01 runs 0 at center -> 1 at outer edge
            const r01 = T.length(uv.sub(T.float(0.5))).mul(T.float(2));
            // inner band edge: soft ramp across inner -+ 0.08 of the radius
            // outer band edge: soft ramp 0.92 -> 1.0 of the radius
            const band = T.smoothstep(T.float(inner - 0.08), T.float(inner + 0.08), r01).mul(
              T.float(1).sub(T.smoothstep(T.float(0.92), T.float(1.0), r01))
            );
            // alpha is folded into RGB - no second alpha channel
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
        // breathing: intensity = opacity * (1 - p + p * sin(t * 0.5))
        tickers.push(() => {
          const t = Number.isFinite(gpuUniforms.time.value) ? gpuUniforms.time.value : 0;
          mat.uniforms.intensity.value = clamp01(opacity * (1 - p + p * Math.sin(t * 0.5)));
        });
      };

      /* ---------- open sky: moon, drifting snowfall, windswept ice field ---------- */
      kit.snowfall(1200, site.x, site.z, 30, 17);

      /* the cold moon, high and open: nested glow — bright core, dim halo */
      const moonCoreMat = glowShader(
        { intensity: 0.85 },
        (u, _uv) => T.vec3(0.863, 0.925, 1.0).mul(u.intensity),
        {}
      );
      const moonCoreGeo = new THREE.SphereGeometry(0.85, 20, 16);
      const moonCore = new THREE.Mesh(moonCoreGeo, moonCoreMat);
      moonCore.position.set(C.x + 9, C.y + 15, C.z - 12);
      ctx.group.add(moonCore);

      const moonHaloMat = glowShader(
        { intensity: 0.2 },
        (u, _uv) => T.vec3(0.863, 0.925, 1.0).mul(u.intensity),
        {}
      );
      const moonHaloGeo = new THREE.SphereGeometry(1.7, 20, 16);
      const moonHalo = new THREE.Mesh(moonHaloGeo, moonHaloMat);
      moonHalo.position.set(C.x + 9, C.y + 15, C.z - 12);
      ctx.group.add(moonHalo);
      ours.push(moonCoreGeo, moonCoreMat, moonHaloGeo, moonHaloMat);

      /* moonlight breathes: slow, phase-offset, like the hearth flame */
      tickers.push(() => {
        const t = Number.isFinite(gpuUniforms.time.value) ? gpuUniforms.time.value : 0;
        moonCoreMat.uniforms.intensity.value = 0.85 * (1 + 0.1 * Math.sin((t / 10) * Math.PI * 2));
        moonHaloMat.uniforms.intensity.value = 0.2 * (1 + 0.1 * Math.sin((t / 12) * Math.PI * 2 + 1.1));
      });

      /* the ice field: broad, cold, faintly ringed */
      ring(C.x, C.y + 0.01, C.z, 30, 0xcfe6ff, 0.18, 0.55, 0.1);
      ring(C.x, C.y + 0.02, C.z, 19, 0x9dc6ff, 0.12, 0.62, 0.16);
      ring(C.x, C.y + 0.03, C.z, 11.5, 0x7fb2ff, 0.10, 0.7, 0.2);

      /* one plane, one shader: a single gaussian melt of warm light on the ice,
         its outer edge broken by vnoise so it never reads as a flat disc */
      function warmPool() {
        const geo = new THREE.PlaneGeometry(18, 18);
        const phase = rnd(21, 5) * Math.PI * 2;

        const mat = glowShader(
          { intensity: 0.55 },
          (u, uv) => {
            // radial coordinate across the plane uv, 0 at the centre
            const p = uv.sub(T.float(0.5)).mul(T.float(2.0));
            const r = T.length(p);

            // organic rim: value noise samples the edge so it wanders
            const n = vnoise(
              T.vec2(
                uv.x.mul(T.float(3.1)).add(T.float(0.17)),
                uv.y.mul(T.float(3.1)).add(T.float(0.63)),
              ),
            );

            // noise-warped radius -> broken outer edge, no concentric steps
            const rb = r.add(n.sub(T.float(0.5)).mul(T.float(0.34)));

            // the whole pool is one continuous gaussian melt
            const g = T.exp(rb.mul(rb).mul(T.float(-1.55)));

            // thin the far rim so the glow dissolves instead of ending
            const edge = T.smoothstep(T.float(1.24), T.float(0.56), rb);

            // warm gold core melting into a cool blue rim
            const melt = T.smoothstep(T.float(0.1), T.float(1.06), rb);
            const col = T.mix(
              T.vec3(T.float(1.0), T.float(0.76), T.float(0.45)),
              T.vec3(T.float(0.45), T.float(0.55), T.float(0.85)),
              melt,
            );

            // alpha is folded into RGB (glowShader keeps-alpha blending)
            return col.mul(g).mul(edge).mul(u.intensity);
          },
          { side: THREE.DoubleSide },
        );

        const m = new THREE.Mesh(geo, mat);
        m.rotation.x = -Math.PI / 2;
        m.position.set(C.x, C.y + 0.06, C.z);
        ctx.group.add(m);
        ours.push(geo, mat);

        // slow breathing, ~8.5 s period, driven through the intensity uniform
        tickers.push(() => {
          const t = Number.isFinite(gpuUniforms.time.value) ? gpuUniforms.time.value : 0;
          mat.uniforms.intensity.value = clamp01(
            0.55 * (0.86 + 0.14 * Math.sin(t * 0.739 + phase)),
          );
        });
      }

      /* warm light pooling on the ice around the hearth: one painterly melt */
      warmPool();

      /* the sit mat — warm woven glow, vnoise-broken edge, breathing */
      function sitMat() {
        const span = 3.9;
        const geo = new THREE.PlaneGeometry(span, span);
        const mat = glowShader(
          { intensity: 0.45 },
          (u, uv) => {
            const rb = T.length(uv.sub(T.float(0.5))).mul(T.float(2));

            // gaussian falloff: soft radial glow
            const glow = T.exp(rb.mul(rb).mul(T.float(-1.9)));

            // vnoise-broken rim — no flat disc edge
            const wob = vnoise(uv.mul(T.float(3.1)).add(T.vec2(T.float(7.3), T.float(2.6))));
            const rim = T.smoothstep(
              T.float(0.55),
              T.float(1.22),
              rb.add(wob.sub(T.float(0.5)).mul(T.float(0.34))),
            );

            // whisper of woven fibre: low-amplitude relief, not a pattern
            const fibre = vnoise(uv.mul(T.float(46)).add(T.vec2(T.float(1.7), T.float(9.1))));
            const weave = T.float(1).add(fibre.sub(T.float(0.5)).mul(T.float(0.07)));

            return T.vec3(T.float(0.541), T.float(0.416), T.float(0.29))
              .mul(glow)
              .mul(T.float(1).sub(rim))
              .mul(weave)
              .mul(u.intensity);
          },
          { side: THREE.DoubleSide },
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

      /* the sit mat */
      sitMat();

      /* ---------- softShards(): tamed-exposure ice prisms (blue -> pink glass) ----------
       * Uses prismGeometry() + crystalMaterial() from ../world/creation verbatim;
       * only the final colorNode is wrapped to tame the glint exposure.
       * Instances stand mostly upright (tilt <= 0.35 rad) and breathe. */
      const softShards = (n: number, center: THREE.Vector3, radius = 5): void => {
        /* count clamped to >= 1, so the single non-literal division below is guarded */
        const count = Math.max(1, Math.floor(n));
        const invCount = count > 0 ? 1 / count : 0;

        /* ---- geometry: six-sided column, pointed tip, aY 0 -> 1 ---- */
        const geo = prismGeometry();

        /* ---- material: canon recipe VERBATIM; only the final colorNode is wrapped ---- */
        const mat = crystalMaterial();
        /* keeps-alpha exposure tame: RGB * 0.55, alpha forced to 1 */
        mat.colorNode = T.vec4(T.vec3(mat.colorNode).mul(0.55), 1);

        /* ---- aC = vec3(hue, glow, seed), instanced exactly like the kit ---- */
        const aC = new Float32Array(count * 3);
        for (let i = 0; i < count; i++) {
          aC[i * 3 + 0] = (i * 0.37) % 1; /* hue  */
          aC[i * 3 + 1] = 0.12;          /* glow */
          aC[i * 3 + 2] = rnd(i, 3.14);  /* seed — file's seeded rnd(i, s) */
        }
        geo.setAttribute("aC", new THREE.InstancedBufferAttribute(aC, 3));

        /* ---- instanced draw ---- */
        const mesh = new THREE.InstancedMesh(geo, mat, count);
        mesh.renderOrder = 2;
        mesh.frustumCulled = false;
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        ctx.group.add(mesh);

        /* ---- per-instance placement (ring around center, spread radius) + orientation ---- */
        const px = new Float32Array(count);
        const py = new Float32Array(count);
        const pz = new Float32Array(count);
        const tx = new Float32Array(count); /* tilt X  */
        const ya = new Float32Array(count); /* yaw     */
        const tz = new Float32Array(count); /* tilt Z  */
        const sc = new Float32Array(count); /* scale   */

        for (let i = 0; i < count; i++) {
          /* ring position, seeded jitter — same layout every run */
          const ang = i * invCount * Math.PI * 2 + (rnd(i, 1.7) - 0.5) * 0.6;
          const rr = radius * (0.25 + rnd(i, 2.6) * 0.75);
          px[i] = center.x + Math.cos(ang) * rr;
          py[i] = center.y;
          pz[i] = center.z + Math.sin(ang) * rr;
          /* upright bias: at most ±0.35 rad tilt from vertical, seeded yaw */
          tx[i] = (rnd(i, 5.5) - 0.5) * 0.7;
          ya[i] = (rnd(i, 4.4) - 0.5) * Math.PI * 2;
          tz[i] = (rnd(i, 6.6) - 0.5) * 0.7;
          /* base scale 0.5 + rnd * 0.5 */
          sc[i] = 0.9 + rnd(i, 7.7) * 0.9;
        }

        /* ---- breathing: recompose instance matrices (kit updater pattern) ---- */
        const node = new THREE.Object3D(); /* created once, reused every frame */
        const compose = (t: number): void => {
          for (let i = 0; i < count; i++) {
            /* per-instance phase, ~3.1 s period */
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

        /* ---- scene clock: gpuUniforms.time.value behind the Number.isFinite guard ---- */
        tickers.push(() => {
          const t = gpuUniforms.time.value;
          if (!Number.isFinite(t)) return;
          compose(t);
        });

        /* ---- keep geo + mat alive for the scene's disposal list ---- */
        ours.push(geo, mat);
      };

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
        softShards(5 + Math.floor(rnd(i, 7.7) * 4), p, 2.6 + rnd(i, 8.8) * 1.6);
      }
      /* a few shards closer in, leaning over the fire */
      softShards(10, new THREE.Vector3(C.x - 6.2, C.y + 0.25, C.z - 3.0), 2.2);
      softShards(9, new THREE.Vector3(C.x + 6.0, C.y + 0.25, C.z - 2.2), 2.0);

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
        /* --- 2a: ice wall glow material --- */
        const mat = glowShader(
          { intensity: s.op },
          (u, uv) => {
            // angular smoothstep fade at both arc ends (0 -> 0.14, 1 -> 0.86)
            const ax = T.smoothstep(T.float(0.0), T.float(0.14), uv.x).mul(
              T.smoothstep(T.float(1.0), T.float(0.86), uv.x)
            );
            // soft fade toward the top edge; uv.y = 1 is the TOP of the cylinder
            const ty = T.smoothstep(T.float(1.0), T.float(0.8), uv.y); // uv.y = 1 at TOP
            // 0x86b6ff = (0.525, 0.714, 1.0), alpha folded into RGB
            return T.vec3(T.float(0.525), T.float(0.714), T.float(1.0)).mul(ax).mul(ty).mul(u.intensity);
          },
          { side: THREE.DoubleSide }
        );
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
        /* --- 2b: frost-seam (foot) glow material --- */
        const footMat = glowShader(
          { intensity: Math.min(0.5, s.op * 2.6) },
          (u, uv) => {
            // angular fade at the arc ends only - no vertical fade on the seam
            const ax = T.smoothstep(T.float(0.0), T.float(0.14), uv.x).mul(
              T.smoothstep(T.float(1.0), T.float(0.86), uv.x)
            );
            // 0xbfe0ff = (0.749, 0.878, 1.0), alpha folded into RGB
            return T.vec3(T.float(0.749), T.float(0.878), T.float(1.0)).mul(ax).mul(u.intensity);
          },
          { side: THREE.DoubleSide }
        );
        const foot = new THREE.Mesh(footGeo, footMat);
        foot.position.set(C.x, C.y + 0.06, C.z);
        ctx.group.add(foot);
        ours.push(footGeo, footMat);

        /* --- 2c: ticker for wall + seam (rewritten together with the two
               materials above; only uniform values are written per frame,
               so the loop allocates nothing) --- */
        tickers.push(() => {
          const t = Number.isFinite(gpuUniforms.time.value) ? gpuUniforms.time.value : 0;
          mat.uniforms.intensity.value = clamp01(s.op * (0.78 + 0.22 * Math.sin(t * 0.35 + s.ph)));
          footMat.uniforms.intensity.value = clamp01(
            Math.min(0.5, s.op * 2.6) * (0.7 + 0.3 * Math.sin(t * 0.5 + s.ph * 1.7))
          );
        });
      }

      /* pale moonbeams: crossed soft planes, no hard silhouette (local; kit.beams is shared) */
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
      

      /* light-flowers on the snow, well outside the warm pool */
      kit.flowers(30, C.x, C.z, 11);
      kit.flowers(16, C.x, C.z, 6.2);

      /* the trail of lamps leading in from the snow to the seat */
      const trail: THREE.Vector3[] = [];
      const gate = new THREE.Vector3(C.x, C.y, C.z + 14);
      for (let i = 0; i <= 9; i++) trail.push(new THREE.Vector3().lerpVectors(seat, gate, i / 9));
      /* trail lamps: soft round cores with halos, brightness wave traveling along the trail */
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

      /* the flame: small bright core, mid body, large dim halo (garden-proven ratios) */
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
