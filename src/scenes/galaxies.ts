import * as THREE from "three/webgpu";
import { LessonScene, type LessonCtx, type Beat, type SceneModule } from "./lessonKit";
import type { Narration } from "../core/narration";
import { SITES } from "./sites";
import { T, glowShader, worldPoints, gpuUniforms, hash3 } from "../gpu/tsl";

// ---- palette (STYLE_GUIDE §1) -------------------------------------------------
const GOLD_HEX = 0xffd700;
const BEAM_HEX = 0xb8d1ff;
const LAMP_HEX = 0xffe6a0;

const ZEN = T.vec3(0.016, 0.022, 0.072);
const MID = T.vec3(0.038, 0.043, 0.12);
const HOR = T.vec3(0.105, 0.1, 0.22);
const GOLD = T.vec3(1.0, 0.843, 0.0);
const BEAM = T.vec3(0.722, 0.82, 1.0);
const LAMP = T.vec3(1.0, 0.902, 0.627);

const time = gpuUniforms.time;

// seeded placement only (STYLE_GUIDE §6.8)
function makeRng(seed: number): () => number {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
}

// additive light must leave alpha alone (STYLE_GUIDE §2.3)
function keepAlpha(m: any): void {
  m.blending = THREE.CustomBlending;
  m.blendSrc = THREE.SrcAlphaFactor;
  m.blendDst = THREE.OneFactor;
  m.blendSrcAlpha = THREE.ZeroFactor;
  m.blendDstAlpha = THREE.OneFactor;
}

// seeded stardust; fade/twinkle carried by colorNode (worldPoints owns opacityNode)
function mkDust(
  n: number,
  radius: number,
  tint: any,
  phase: number,
  center: THREE.Vector3,
  rng: () => number,
  parent: THREE.Group
): void {
  const pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const r = radius * (0.3 + 0.7 * rng());
    const th = rng() * 6.283185307;
    const u = rng() * 2 - 1;
    const s = Math.sqrt(Math.max(0, 1 - u * u));
    pos[i * 3] = Math.cos(th) * s * r;
    pos[i * 3 + 1] = u * r * 0.75;
    pos[i * 3 + 2] = Math.sin(th) * s * r;
  }
  const w = worldPoints(pos, { color: LAMP_HEX, size: 0.18, sizeAttenuation: false } as any);
  w.material.transparent = true;
  w.material.depthWrite = false;
  w.material.fog = false;
  w.sprite.frustumCulled = false;
  const tw = T.sin(
    time.mul(0.53).add(phase).add(T.dot(T.positionLocal, T.vec3(2.9, 4.3, 6.1)).mul(3.1))
  ).mul(0.26).add(0.74);
  w.material.colorNode = T.vec4(tint.mul(tw), 1);
  keepAlpha(w.material);
  w.sprite.position.copy(center);
  parent.add(w.sprite);
}

export function createGalaxiesScene(
  scene: THREE.Scene,
  narration: Narration,
  whisper: (t: string, ms?: number) => void
): SceneModule {
  void scene;
  const seatPos = new THREE.Vector3(SITES.galaxies.x, SITES.galaxies.y, SITES.galaxies.z);
  const state: Record<string, any> = {};
  const setU = (name: string, v: number): void => {
    const u = state[name];
    if (u) u.value = v;
  };

  function build(ctx: LessonCtx): void {
    const rng = makeRng(90601);
    ctx.group.position.copy(seatPos);
    ctx.group.rotation.y = SITES.galaxies.heading;
    ctx.group.add(ctx.kit.group);
    ctx.kit.group.position.set(0, 0, -4.2);

    // narration clock when available, constant baseline otherwise; ambient life = `time`
    const clock: any = (ctx.uT as any) && (ctx.uT as any).isNode ? ctx.uT : T.uniform(0);
    const awe = T.smoothstep(505, 600, clock);

    // ---- sky dome + galaxy field -------------------------------------------
    state.uSky = T.uniform(1);
    const uSky = state.uSky;
    const domeMat: any = new THREE.MeshBasicNodeMaterial({ side: THREE.BackSide, depthWrite: false });
    domeMat.fog = false;
    domeMat.colorNode = (() => {
      const dir = T.positionLocal.mul(0.003125);
      const e = T.clamp(dir.y, -1, 1);
      let col = T.mix(HOR, MID, T.smoothstep(-0.02, 0.42, e));
      col = T.mix(col, ZEN, T.smoothstep(0.3, 0.98, e));
      col = T.mix(col, HOR, T.smoothstep(0.06, -0.14, e));
      const bd = T.dot(dir, T.vec3(0.42, 0.78, 0.46));
      const band = T.pow(T.max(T.abs(bd).mul(-1).add(1), 0), 12);
      const flow = T.sin(dir.x.mul(7).add(dir.z.mul(5)).add(time.mul(0.05))).mul(0.22).add(0.78);
      col = col.add(T.mix(GOLD, BEAM, 0.55).mul(band.mul(flow).mul(0.16).mul(uSky).mul(awe.mul(0.25).add(1))));
      const ang = T.atan(dir.z, dir.x);
      const rr = T.max(T.length(dir.xz), 0.001);
      const sp = T.fract(ang.div(6.28318).sub(T.log(rr).mul(0.35)).add(time.mul(0.004)));
      const spd = sp.sub(0.5).mul(2.2);
      const ridge = T.exp(spd.mul(spd).mul(-6.0));
      col = col.add(T.mix(GOLD, BEAM, 0.5).mul(ridge.mul(band).mul(0.10).mul(uSky)));
      const g = dir.mul(72);
      const cell = T.floor(g);
      const f = T.fract(g).sub(0.5);
      const h = hash3(cell);
      const d = T.length(f.sub(h.sub(0.5).mul(0.6)));
      const core = T.smoothstep(0.28, 0.03, d);
      const gate = T.smoothstep(0.5, 0.92, h.z);
      const tw = T.sin(time.mul(h.x.mul(1.7).add(0.4)).add(h.y.mul(61))).mul(0.3).add(0.7);
      const sc = T.mix(T.vec3(1.0, 0.95, 0.9), T.vec3(0.75, 0.85, 1.0), h.y);
      col = col.add(sc.mul(core.mul(gate).mul(tw).mul(1.5).mul(uSky)));
      return T.vec4(col, 1);
    })();
    const dome = new THREE.Mesh(new THREE.SphereGeometry(320, 40, 24), domeMat);
    dome.renderOrder = -10;
    dome.frustumCulled = false;
    ctx.group.add(dome);

    // ---- two galaxies (mother + child, mirrored in the sky) -----------------
    const mkGalaxy = (size: number, warmth: number, phase: number): THREE.Mesh => {
      const mat = glowShader(
        { uGlow: 1 },
        (u: any, uv: any) => {
          const p = uv.sub(0.5).mul(2);
          const r2 = T.dot(p, p);
          const core = T.exp(r2.mul(-9));
          const s1 = T.vec2(p.x.mul(0.42).add(p.y.mul(0.91)), p.y.mul(0.42).sub(p.x.mul(0.91))).mul(T.vec2(1, 3.2));
          const s2 = T.vec2(p.x.mul(0.42).sub(p.y.mul(0.91)), p.y.mul(0.42).add(p.x.mul(0.91))).mul(T.vec2(1, 3.2));
          const arms = T.exp(T.dot(s1, s1).mul(-4.2)).add(T.exp(T.dot(s2, s2).mul(-4.2)));
          const shimmer = T.sin(time.mul(0.11).add(phase)).mul(0.12).add(0.88);
          return T.mix(BEAM, GOLD, warmth).mul(core.mul(0.85).add(arms.mul(0.42)).mul(shimmer).mul(u.uGlow));
        },
        { transparent: true, depthWrite: false, side: THREE.DoubleSide }
      );
      mat.fog = false;
      keepAlpha(mat);
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size), mat);
      mesh.frustumCulled = false;
      return mesh;
    };
    const motherGalaxy = mkGalaxy(64, 0.72, 0.6);
    motherGalaxy.position.set(-26, 46, -150);
    motherGalaxy.rotation.set(-0.18, 0.16, 0.5);
    ctx.group.add(motherGalaxy);
    const childGalaxy = mkGalaxy(26, 0.25, 2.3);
    childGalaxy.position.set(2, 38, -146);
    childGalaxy.rotation.set(-0.18, 0.16, -0.35);
    ctx.group.add(childGalaxy);

    // ---- mother curls around child, both tilted toward the sky -------------
    state.uWarm = T.uniform(1);
    state.uCool = T.uniform(1);
    state.uHalo = T.uniform(1);
    const uWarm = state.uWarm;
    const uCool = state.uCool;
    const uHalo = state.uHalo;

    const haloMat = glowShader(
      { uGlow: 1 },
      (u: any, uv: any) => {
        const p = uv.sub(0.5).mul(2);
        const k = T.exp(T.dot(p, p).mul(-3.2));
        return T.mix(GOLD, BEAM, 0.3).mul(k.mul(u.uGlow).mul(uHalo).mul(0.16));
      },
      { transparent: true, depthWrite: false, side: THREE.DoubleSide }
    );
    haloMat.fog = false;
    keepAlpha(haloMat);
    const halo = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 4.2), haloMat);
    halo.position.set(0, 2.0, -6.4);
    ctx.group.add(halo);

    const arcMat = glowShader(
      { uGlow: 1 },
      (u: any, uv: any) => {
        const taper = T.smoothstep(0, 0.18, uv.x).mul(T.smoothstep(1, 0.82, uv.x));
        const breathe = T.sin(time.mul(0.36).add(uv.x.mul(6.283).mul(1.6))).mul(0.12).add(0.88);
        return T.mix(GOLD, LAMP, 0.32).mul(taper.mul(breathe).mul(u.uGlow).mul(uWarm).mul(0.75));
      },
      { transparent: true, depthWrite: false, side: THREE.DoubleSide }
    );
    arcMat.fog = false;
    keepAlpha(arcMat);

    const strandMat = glowShader(
      { uGlow: 1 },
      (u: any, uv: any) => {
        const taper = T.smoothstep(0, 0.22, uv.x).mul(T.smoothstep(1, 0.78, uv.x));
        const breathe = T.sin(time.mul(0.29).add(uv.x.mul(4.1))).mul(0.14).add(0.86);
        return T.mix(GOLD, BEAM, 0.55).mul(taper.mul(breathe).mul(u.uGlow).mul(uWarm).mul(0.55));
      },
      { transparent: true, depthWrite: false, side: THREE.DoubleSide }
    );
    strandMat.fog = false;
    keepAlpha(strandMat);

    const childMat = glowShader(
      { uGlow: 1 },
      (u: any) => {
        const r = T.length(T.positionLocal).mul(1.4286);
        const body = T.smoothstep(1, 0.12, r);
        const breathe = T.sin(time.mul(0.44).add(1.7)).mul(0.12).add(0.88);
        return T.mix(LAMP, BEAM, 0.45).mul(body.mul(breathe).mul(u.uGlow).mul(uCool).mul(1.0));
      },
      { transparent: true, depthWrite: false, side: THREE.DoubleSide }
    );
    childMat.fog = false;
    keepAlpha(childMat);

    const pair = new THREE.Group();
    pair.position.set(0, 1.66, -6.2);
    pair.rotation.set(-0.3, 0.14, 0.08);
    ctx.group.add(pair);

    const mother = new THREE.Mesh(new THREE.TorusGeometry(1.52, 0.2, 12, 96, Math.PI * 1.42), arcMat);
    mother.rotation.z = 2.35;
    pair.add(mother);
    const strand = new THREE.Mesh(new THREE.TorusGeometry(1.8, 0.085, 8, 96, Math.PI * 1.18), strandMat);
    strand.rotation.z = 1.95;
    strand.position.z = -0.18;
    pair.add(strand);
    const arm = new THREE.Mesh(new THREE.TorusGeometry(1.02, 0.1, 8, 72, Math.PI * 0.85), strandMat);
    arm.rotation.z = 0.55;
    arm.position.set(0.1, 0.12, 0.16);
    pair.add(arm);
    const child = new THREE.Mesh(new THREE.SphereGeometry(0.7, 24, 16), childMat);
    child.position.set(0.16, 0.02, 0.1);
    pair.add(child);

    // soft cores inside the forms
    const motherWisp = ctx.kit.wisp(LAMP_HEX, 1.1);
    motherWisp.setCenter(new THREE.Vector3(1.19, 2.51, -2.0));
    const childWisp = ctx.kit.wisp(BEAM_HEX, 0.7);
    childWisp.setCenter(new THREE.Vector3(0.2, 1.72, -2.0));
    ctx.kit.group.add(motherWisp.group);
    ctx.kit.group.add(childWisp.group);

    // ---- world grammar: disc, lamps, beams, rings, horizon life -------------
    ctx.kit.groundDisc(6.2, GOLD_HEX, 0.22, 0.03);
    ctx.kit.rings(new THREE.Vector3(0, 7.0, -0.4), 3.4, 0.1);
    const beamPts: THREE.Vector3[] = [];
    for (let i = 0; i < 3; i++) {
      const a = i * 1.256637061 + 0.4;
      beamPts.push(new THREE.Vector3(Math.cos(a) * 11, 0, Math.sin(a) * 11));
    }
    ctx.kit.beams(beamPts, 12, 0.22);
    const pathPts: THREE.Vector3[] = [];
    for (let i = 0; i < 7; i++) {
      pathPts.push(new THREE.Vector3(Math.sin(i * 1.7) * 0.55, 0.08, 4.6 - i * 2.3));
    }
    ctx.kit.pathLights(pathPts);
    ctx.kit.flowers(24, 0, -1, 7);
    ctx.kit.birds(9, new THREE.Vector3(0, 0, -18), 24, 11);
    ctx.kit.horses(new THREE.Vector3(0, 0, -42), 32);

    mkDust(140, 2.6, LAMP, 0.35, new THREE.Vector3(0, 1.7, -6.1), rng, ctx.group);
    mkDust(90, 1.5, BEAM, 2.15, new THREE.Vector3(0.2, 1.7, -6.1), rng, ctx.group);
  }

  const beats: Beat[] = [
    { t: 83.54, apply: () => { whisper("a mother of stars", 3800); setU("uSky", 1.15); } },
    { t: 89.54, apply: () => { whisper("and the small light she keeps close", 4200); setU("uCool", 1.18); } },
    { t: 156.83, apply: () => setU("uWarm", 1.1) },
    { t: 158.6, apply: () => whisper("she curls around her child", 3800) },
    { t: 160, apply: () => setU("uCool", 1.24) },
    { t: 163.85, apply: () => setU("uWarm", 1.16) },
    { t: 175.2, apply: () => whisper("nothing between them but light", 4000) },
    { t: 178, apply: () => setU("uHalo", 1.25) },
    { t: 183.6, apply: () => setU("uSky", 1.22) },
    { t: 195, apply: () => whisper("the sky holds them both", 3800) },
    { t: 215, apply: () => setU("uWarm", 1.22) },
    { t: 220.16, apply: () => setU("uCool", 1.3) },
    { t: 279.05, apply: () => { whisper("a whole galaxy, and a whole galaxy inside her", 4600); setU("uSky", 1.3); } },
    { t: 300, apply: () => setU("uHalo", 1.35) },
    { t: 507.97, apply: () => { whisper("we are the child, looking up", 4200); setU("uWarm", 1.3); } },
    { t: 520.62, apply: () => setU("uCool", 1.38) },
    { t: 535, apply: () => setU("uSky", 1.4) },
    { t: 575.91, apply: () => whisper("and we are held", 4000) },
    { t: 585, apply: () => setU("uHalo", 1.5) },
    { t: 595.39, apply: () => setU("uWarm", 1.42) },
    { t: 605, apply: () => setU("uCool", 1.5) },
    { t: 612.83, apply: () => whisper("rest here, under the mother sky", 5200) },
    { t: 620, apply: () => setU("uSky", 1.55) },
  ];

  const onEnd = (): void => {
    whisper("the sky keeps breathing", 3200);
  };

  return new LessonScene(scene, narration, whisper, {
    id: "galaxies",
    trackId: "L06",
    seatPos,
    seatHeading: SITES.galaxies.heading,
    seatRadius: 3,
    build,
    beats,
    onEnd,
  });
}
// END OF FILE
