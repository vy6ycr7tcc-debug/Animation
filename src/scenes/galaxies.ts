import * as THREE from "three/webgpu";
import { LessonScene, type LessonCtx, type Beat, type SceneModule } from "./lessonKit";
import type { Narration } from "../core/narration";
import { SITES } from "./sites";
import { T, glowShader, worldPoints, gpuUniforms, hash3, vnoise } from "../gpu/tsl";

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
const EMBER = T.vec3(1.0, 0.45, 0.1);

const time = gpuUniforms.time;

// Organic noise for materiality
const fbm = T.Fn(([p]: any[]) => {
  let v = T.float(0);
  let amp = T.float(0.5);
  let pos = p;
  for (let i = 0; i < 4; i++) {
    v = v.add(vnoise(pos).mul(amp));
    pos = pos.mul(2.0).add(T.vec2(1.2, 3.4)); // shift to break grid
    amp = amp.mul(0.5);
  }
  return v;
});


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
  
  // Narrator Character
  
  
// Narrator Character ROBE profile
const ROBE_PTS: Array<[number, number]> = [[0.0, 0.02], [0.03, 0.24], [0.4, 0.25], [0.8, 0.22], [1.1, 0.17], [1.36, 0.12], [1.5, 0.08], [1.55, 0.02]];
const robeCurve: THREE.Vector2[] = ROBE_PTS.map(([y, r]) => new THREE.Vector2(r < 0.02 ? 0.02 : r, y));
const narrator = new THREE.Mesh(new THREE.LatheGeometry(robeCurve, 32),
    new THREE.MeshBasicNodeMaterial({
      colorNode: T.vec3(0.01, 0.02, 0.05), // near-black blue base
      transparent: true,
      side: THREE.DoubleSide,
    })
  );
  // Starlight rim + inner wisp light
  narrator.material.outputNode = T.fn(() => {
    const base = T.vec3(0.01, 0.02, 0.05);
    const viewDir = T.normalize(T.cameraPosition.sub(T.positionWorld));
    const normal = T.normalize(T.normalWorld);
    const rim = T.pow(T.float(1.0).sub(T.max(0.0, T.dot(viewDir, normal))), 3.0);
    const rimColor = T.vec3(0.8, 0.9, 1.0).mul(rim).mul(0.5); // starlight rim
    return T.vec4(base.add(rimColor), 1.0);
  })();
  narrator.position.copy(seatPos).add(new THREE.Vector3(-4, 0, -2)); // near the seat
  narrator.rotation.y = Math.PI * 0.2;
  scene.add(narrator);
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
      // Slower drift
      const localTime = time.mul(0.005);
      const dir = T.positionLocal.normalize();
      
      // Base background: soft vertical gradient
      const e = T.clamp(dir.y, -1.0, 1.0);
      let col = T.mix(HOR, MID, T.smoothstep(-0.02, 0.42, e));
      col = T.mix(col, ZEN, T.smoothstep(0.3, 0.98, e));
      col = T.mix(col, HOR, T.smoothstep(0.06, -0.14, e));

      // Spherical coordinates for organic fbm wrapping
      const theta = T.atan(dir.z, dir.x);
      const phi = dir.y;
      
      // Nebulae mapping
      const p1 = T.vec2(theta.mul(2.0).add(localTime), phi.mul(2.0));
      const p2 = T.vec2(theta.mul(3.0).sub(localTime.mul(1.5)), phi.mul(3.0).add(1.0));
      
      const n1 = fbm(p1);
      const n2 = fbm(p2.add(n1));
      
      const nebula1 = T.smoothstep(0.3, 0.7, n1);
      const nebula2 = T.smoothstep(0.4, 0.8, n2);
      
      // Majestic dust clouds
      col = col.add(T.mix(MID, EMBER, nebula1).mul(nebula1).mul(0.6).mul(uSky).mul(awe.mul(0.25).add(1)));
      col = col.add(T.mix(ZEN, BEAM, nebula2).mul(nebula2).mul(0.4).mul(uSky));
      
      // Layer 1: Dense distant stars
      const s1 = hash3(dir.mul(300.0));
      const star1 = T.step(0.998, s1.x);
      const twinkle1 = T.sin(time.mul(0.05).add(s1.y.mul(6.28))).mul(0.3).add(0.7);
      col = col.add(T.vec3(1.0).mul(star1).mul(twinkle1).mul(uSky).mul(0.4));
      
      // Layer 2: Bright closer stars
      const s2 = hash3(dir.mul(150.0).add(T.vec3(1.0, 2.0, 3.0)));
      const star2 = T.step(0.9995, s2.x);
      const twinkle2 = T.sin(time.mul(0.03).add(s2.z.mul(6.28))).mul(0.5).add(0.5);
      const starCol = T.mix(BEAM, GOLD, s2.y);
      col = col.add(starCol.mul(star2).mul(twinkle2).mul(uSky).mul(1.2));
      
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
          // Distort UVs organically
          const nUV = fbm(uv.mul(5.0).add(time.mul(0.01).add(phase)));
          const dUV = uv.add(nUV.mul(0.12));
          
          const p = dUV.sub(0.5).mul(2);
          const r2 = T.dot(p, p);
          const core = T.exp(r2.mul(-9));
          
          const s1 = T.vec2(p.x.mul(0.42).add(p.y.mul(0.91)), p.y.mul(0.42).sub(p.x.mul(0.91))).mul(T.vec2(1, 3.2));
          const s2 = T.vec2(p.x.mul(0.42).sub(p.y.mul(0.91)), p.y.mul(0.42).add(p.x.mul(0.91))).mul(T.vec2(1, 3.2));
          
          // Feather the arms with noise to break primitives
          const armsNoise = fbm(uv.mul(8.0).add(phase));
          const arms = T.exp(T.dot(s1, s1).mul(-4.2)).add(T.exp(T.dot(s2, s2).mul(-4.2))).mul(armsNoise.add(0.5));
          
          const shimmer = T.sin(time.mul(0.11).add(phase)).mul(0.12).add(0.88);
          
          // Gradient mapping: Core is hot EMBER/GOLD, edges pale BEAM
          const edgeCol = T.mix(BEAM, GOLD, warmth);
          const coreCol = T.mix(GOLD, EMBER, T.add(warmth, 0.2));
          const finalCol = T.mix(edgeCol, coreCol, T.smoothstep(0.0, 0.4, core.add(arms.mul(0.5))));
          
          return finalCol.mul(core.mul(0.85).add(arms.mul(0.52)).mul(shimmer).mul(u.uGlow));
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
        const noiseWrap = fbm(uv.mul(T.vec2(4.0, 12.0)).add(time.mul(0.04)));
        const breathe = T.sin(time.mul(0.08).add(uv.x.mul(6.283).mul(1.6))).mul(0.12).add(0.88);
        const col = T.mix(GOLD, EMBER, noiseWrap);
        return col.mul(taper).mul(noiseWrap.add(0.4)).mul(breathe).mul(u.uGlow).mul(uWarm).mul(0.85);
      },
      { transparent: true, depthWrite: false, side: THREE.DoubleSide }
    );
    arcMat.fog = false;
    keepAlpha(arcMat);

    const strandMat = glowShader(
      { uGlow: 1 },
      (u: any, uv: any) => {
        const taper = T.smoothstep(0, 0.22, uv.x).mul(T.smoothstep(1, 0.78, uv.x));
        const noiseWrap = fbm(uv.mul(T.vec2(6.0, 18.0)).sub(time.mul(0.05)));
        const breathe = T.sin(time.mul(0.07).add(uv.x.mul(4.1))).mul(0.14).add(0.86);
        const col = T.mix(GOLD, BEAM, 0.55);
        return col.mul(taper).mul(noiseWrap.add(0.5)).mul(breathe).mul(u.uGlow).mul(uWarm).mul(0.7);
      },
      { transparent: true, depthWrite: false, side: THREE.DoubleSide }
    );
    strandMat.fog = false;
    keepAlpha(strandMat);

    const childMat = glowShader(
      { uGlow: 1 },
      (u: any) => {
        // Perturb distance to center so it's not a perfect sphere
        const baseR = T.length(T.positionLocal).mul(1.4286);
        const surfNoise = fbm(T.positionLocal.mul(4.0).add(time.mul(0.1)));
        const r = baseR.add(surfNoise.mul(0.2));
        const body = T.smoothstep(1.0, 0.12, r);
        const breathe = T.sin(time.mul(0.11).add(1.7)).mul(0.12).add(0.88);
        return T.mix(LAMP, BEAM, surfNoise).mul(body.mul(breathe).mul(u.uGlow).mul(uCool).mul(1.2));
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
    { t: 83.54, apply: () => { setU("uSky", 1.15); } },
    { t: 89.54, apply: () => { setU("uCool", 1.18); } },
    { t: 156.83, apply: () => setU("uWarm", 1.1) },
    { t: 160, apply: () => setU("uCool", 1.24) },
    { t: 163.85, apply: () => setU("uWarm", 1.16) },
    { t: 178, apply: () => setU("uHalo", 1.25) },
    { t: 183.6, apply: () => setU("uSky", 1.22) },
    { t: 215, apply: () => setU("uWarm", 1.22) },
    { t: 220.16, apply: () => setU("uCool", 1.3) },
    { t: 279.05, apply: () => { setU("uSky", 1.3); } },
    { t: 300, apply: () => setU("uHalo", 1.35) },
    { t: 507.97, apply: () => { setU("uWarm", 1.3); } },
    { t: 520.62, apply: () => setU("uCool", 1.38) },
    { t: 535, apply: () => setU("uSky", 1.4) },
    { t: 585, apply: () => setU("uHalo", 1.5) },
    { t: 595.39, apply: () => setU("uWarm", 1.42) },
    { t: 605, apply: () => setU("uCool", 1.5) },
    { t: 620, apply: () => setU("uSky", 1.55) }
  ];

  const onEnd = (): void => {};

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
