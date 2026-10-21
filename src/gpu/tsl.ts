/* Shared TSL (three.js shading language) for the WebGPU renderer: the small functions every
   material used to paste in as GLSL. Written once here, they compile to WGSL on WebGPU and to
   GLSL on the WebGL2 fallback.
   - hash / value noise / fbm, matching the old GLSL versions;
   - the atmosphere (`ijFog`): height fog with moonlit in-scattering, applied to every material
     through `scene.fogNode`, and callable by custom materials that draw their own fog;
   - `outOfTheWay`: 0 where something would come between the camera and the wanderer;
   - `spriteCloud`: sized points. WebGPU draws points one pixel wide, so every soft point of
     light becomes an instanced sprite reading its own position and data per instance. */
import * as THREE from "three/webgpu";
import * as TSLtyped from "three/tsl";
import { FOG, starDirection } from "../world/fog";

/* eslint-disable @typescript-eslint/no-explicit-any */
/** A TSL node. TSL's node types are deep generics that fight ordinary shader arithmetic; the
    shaders read more clearly without them, so the TSL functions are used untyped (`T`). */
export type N = any;
const TT: any = TSLtyped;
/** smoothstep that is also defined for reversed edges (a > b), as the old GLSL shaders relied on
    (Metal, under Safari's WebGPU, leaves that case undefined). */
const safeSmoothstep = (a: any, b: any, x: any) => {
  const t = TT.clamp(TT.float(x).sub(a).div(TT.float(b).sub(a)), 0, 1);
  return t.mul(t).mul(TT.float(3).sub(t.mul(2)));
};
/** Soft points are instanced sprites (see spriteCloud), so the place within a point is the
    sprite's own uv; gl_PointCoord exists only for one-pixel native points. */
export const T: any = { ...TT, smoothstep: safeSmoothstep, pointUV: TT.uv() };
const {
  abs, cameraPosition, clamp, cos, dot, exp, float, floor, Fn, fog, fract, instancedBufferAttribute, length, max, mix, positionWorld,
  pow, sin, smoothstep, uniform, vec2, vec3, vec4,
} = T;

/** fract(sin(dot(p, k)) * 43758.5453), the classic hash, for vec2 or vec3. */
export const hash2 = (p: N): N => fract(sin(dot(p, vec2(12.9898, 78.233))).mul(43758.5453));
export const hash2b = (p: N): N => fract(sin(dot(p, vec2(127.1, 311.7))).mul(43758.5453));
export const hash3 = (p: N): N => fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))).mul(43758.5453));

/** Smooth value noise in 0–1 (as the old GLSL `n()`). */
export const vnoise = Fn(([p]: N[]) => {
  const i = floor(p), f = fract(p);
  const u = f.mul(f).mul(float(3).sub(f.mul(2)));
  const a = hash2b(i), b = hash2b(i.add(vec2(1, 0))), c = hash2b(i.add(vec2(0, 1))), d = hash2b(i.add(vec2(1, 1)));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
});

/** A rainbow for a hue in 0–1 (the crystals' spectrum). */
export const spectrum = (h: N): N => vec3(0.5).add(cos(vec3(h).add(vec3(0, 0.33, 0.67)).mul(6.28318)).mul(0.5));

/* ---------------------------------------------------------------- the atmosphere */
const MOON = starDirection();
/** The wanderer, for effects that must stay out of the view of them (main.ts keeps it current). */
export const gpuUniforms = {
  player: uniform(new THREE.Vector3()),
  time: uniform(0),
  /** Pixels per metre at a distance of one metre (for sizing soft points). */
  px: uniform(600),
  dpr: uniform(1),
};

/** The air's colours, set each frame by the moods (world/moods.ts): its own colour, and the glow
    it takes on toward the moon or the low sun. */
export const fogUniforms = {
  color: uniform(new THREE.Color().copy(FOG.color)),
  glow: uniform(new THREE.Color().copy(FOG.moon)),
  glowDir: uniform(new THREE.Vector3(MOON.x, MOON.y, MOON.z)),
  /** How thick the air is at the water's surface (per metre). */
  density: uniform(FOG.density),
};

/** The sky's sheen on stone (emissive; never a mirror, never on a floor): a face turning away from
    you takes on the colour of the air, and where the moon or the low sun is behind it its edges
    catch a rim of that light, so stone stands out of the night by its silhouette, as in Sky's
    rim light. `n` is the world normal; flat tops and floors take none. */
export const skySheen = (n: N, k: N | number = 1): N => {
  const V = TT.normalize(TT.cameraPosition.sub(TT.positionWorld));
  const fres = TT.pow(TT.float(1).sub(TT.clamp(TT.abs(TT.dot(n, V)), 0, 1)), 3); // abs: a face seen from behind (a gorge drawn inward) is still a face
  const back = safeSmoothstep(0.2, 0.9, TT.dot(V.negate(), fogUniforms.glowDir));
  const upright = TT.float(1).sub(safeSmoothstep(0.4, 0.7, TT.abs(n.y)));
  return fogUniforms.color.mul(0.7).add(fogUniforms.glow.mul(back).mul(0.8)).mul(fres).mul(upright).mul(k);
};

/** The colour grade after tone mapping, set by the moods (and the temple): a lift of colour into
    the shadows, a tint on the highlights, saturation and contrast (post.ts). */
export const gradeUniforms = {
  shadow: uniform(new THREE.Color(0, 0.01, 0.04)),
  high: uniform(new THREE.Color(1, 1, 1)),
  sat: uniform(1),
  contrast: uniform(1),
};

/** The colour of the air along the ray to `p` (rgb) and how much of it there is (a). */
export const ijFog = Fn(([p]: N[]) => {
  const rd0 = p.sub(cameraPosition);
  const d = length(rd0).toVar();
  const rd = rd0.div(max(d, 1e-4));
  const a = float(FOG.falloff);
  const k = a.mul(rd.y).mul(d);
  const integ = abs(k).greaterThan(1e-3).select(float(1).sub(exp(k.negate())).div(k), float(1).sub(k.mul(0.5)));
  // the haze thins over high ground, so the mountains keep their rock and snow against the sky
  const highClear = mix(float(1), float(0.45), smoothstep(40, 260, p.y));
  const depth = fogUniforms.density.mul(d).mul(exp(a.negate().mul(max(cameraPosition.y, 0)))).mul(integ).add(float(FOG.haze).mul(d).mul(highClear));
  const f = max(float(1).sub(exp(depth.negate())), smoothstep(1450, 2020, d)); // the far land melts into the haze before its last tiles end (≥ 2048 m away)
  const moon = pow(max(dot(rd, fogUniforms.glowDir), 0), 5);
  const col = mix(fogUniforms.color, fogUniforms.glow, moon.mul(0.7))
    .mul(float(1).add(exp(max(p.y, 0).mul(-0.08)).mul(0.1)));
  return vec4(col, clamp(f, 0, 1));
});

/** Mix a colour with the air between the camera and the world position `p`. */
export const withFog = (color: N, p: N = positionWorld): N => {
  const f = ijFog(p);
  return mix(color, f.xyz, f.w);
};

/** For every standard material: `scene.fogNode = ijFogNode()`. */
export function ijFogNode(): N {
  const f = ijFog(positionWorld);
  return fog(f.xyz, f.w);
}

/** 0 where a light would come between the camera and the wanderer (or right at the lens), 1 elsewhere. */
export const outOfTheWay = Fn(([p]: N[]) => {
  const a = cameraPosition, b = gpuUniforms.player.add(vec3(0, 1.2, 0)), ab = b.sub(a);
  const t = clamp(dot(p.sub(a), ab).div(max(dot(ab, ab), 1e-3)), 0, 1);
  const dSeg = length(p.sub(a.add(ab.mul(t))));
  return smoothstep(0.5, 1.8, dSeg).mul(smoothstep(2.5, 6.0, length(p.sub(a))));
});

/* ---------------------------------------------------------------- soft points as sprites */
/** Distance in front of the camera of the world position `p` (the old `-mv.z`). */
export const viewDepth = (p: N): N => T.cameraViewMatrix.mul(vec4(p, 1)).z.negate();

export interface SpriteCloud {
  sprite: THREE.Sprite;
  /** Per-instance data, by name, as given (write into `.array` and set `needsUpdate`). */
  attrs: Record<string, THREE.InstancedBufferAttribute>;
  /** The instance data as nodes, for the material to read. */
  nodes: Record<string, N>;
  setCount(n: number): void;
}

/** A cloud of `max` soft points drawn as one instanced sprite. `layout` gives each per-instance
    attribute's item size, e.g. { position: 3, aSeed: 4 }. The material's positionNode is set to
    the instance position unless the caller replaces it. */
export function spriteCloud(max: number, layout: Record<string, number>, material: THREE.PointsNodeMaterial | THREE.SpriteNodeMaterial): SpriteCloud {
  const attrs: Record<string, THREE.InstancedBufferAttribute> = {};
  const nodes: Record<string, N> = {};
  for (const [name, size] of Object.entries(layout)) {
    const a = new THREE.InstancedBufferAttribute(new Float32Array(max * size), size);
    a.setUsage(THREE.DynamicDrawUsage);
    attrs[name] = a;
    nodes[name] = instancedBufferAttribute(a);
  }
  if (nodes.position) material.positionNode = nodes.position;
  const sprite = new THREE.Sprite(material);
  // its own quad: three gives every Sprite one shared geometry, and a cloud's dispose (or a room's
  // added attributes) must never reach the others (disposing the shared one broke every sprite on
  // the phone: "WebGPU: Buffer1 index[0] is missing")
  sprite.geometry = sprite.geometry.clone();
  sprite.count = max;
  sprite.frustumCulled = false;
  return {
    sprite,
    attrs,
    nodes,
    setCount(n: number) {
      sprite.count = Math.min(max, Math.max(0, n));
    },
  };
}

/* Every plain THREE.Sprite shares one geometry; nothing may dispose it (a halo's group being
   freed traverses its sprites). Made indestructible here, once. */
{
  const shared = new THREE.Sprite().geometry;
  shared.dispose = () => {};
}

/** The game's soft point of light, for every sprite cloud: a bright core in a soft halo (two
    gaussians), so a point reads as light, never as a flat disc with a rim, and a dense cloud as
    glowing dust rather than beads. `r` is 0 at the sprite's centre and 1 at its edge (`pointR`).
    Its energy (mean over the sprite) is DOT_ENERGY; callers scale it to keep their brightness. */
export const softDot = (r: N): N =>
  exp(r.mul(r).mul(-20)).mul(0.8).add(exp(r.mul(r).mul(-2.2)).mul(0.45)).mul(smoothstep(1, 0.8, r));
export const DOT_ENERGY = 0.1647;
/** The distance from a sprite's centre, 0 there and 1 at its edge. */
export const pointR = (): N => length(T.pointUV.sub(0.5)).mul(2);
/** A point near the lens fades instead of swelling into a blob across the view (the house rule
    for effects): gone within 0.35 m, whole from 1.6 m. Reads the point's own centre. */
export const nearLens = (): N => smoothstep(0.35, 1.6, T.positionView.z.negate());

/* ---------------------------------------------------------------- how particles move
   One vocabulary for every particle system (the owner: "improve all particle animations"):
   - `flow`: the air's currents. Motes carried by it drift together in slow eddies, neighbours
     alike, instead of each bobbing on a little loop of its own; being a curl field it never
     gathers them into clumps or thins them into holes.
   - `glimmer`: a light's own slow, uneven brightening, every point on its own time, instead of
     a uniform twinkle.
   - `lifeEnv`: born softly and quickly, fading out to nothing: never a pop at either end.
   Each has a JavaScript twin (`flowAt`, `glimmerAt`, `lifeAt`) for particles moved on the CPU. */

/** Six plane shear waves c·cos(k·p + w·t + φ), each c ⟂ k, so their sum is divergence-free; two
    scales, the finer one smaller. Normalised: about 1 on average (RMS), at most about 2.3. */
const FLOW: [number[], number[], number, number][] = [
  [[0.7998, 0.2999, 0.5199], [-0.4101, 0, 0.6309], 0.53, 0],
  [[-0.4811, 0.7697, 0.5666], [0, 0.4461, -0.606], -0.41, 1.7],
  [[0.2625, -0.5157, 0.7408], [-0.7195, -0.1763, 0.1322], 0.37, 4.1],
  [[1.8441, 0.9879, -0.6806], [0.1492, -0.2786, 0], 0.89, 2.6],
  [[-1.2218, -0.7049, 1.8796], [-0.2194, 0.2194, -0.0603], -0.77, 5.3],
  [[0.4512, 1.8047, 0.8613], [0.0847, 0.1136, -0.2825], 0.67, 3.4],
];

/** The air's current at `p` and time `t`, both in the currents' own units: divide metres by the
    eddies' size, multiply seconds by how quickly they change. Add `flow(p, t) * amplitude` to a
    particle's place. */
export const flow = (p: N, t: N): N => {
  let v: N = vec3(0);
  for (const [k, c, w, ph] of FLOW) v = v.add(vec3(c[0], c[1], c[2]).mul(cos(dot(p, vec3(k[0], k[1], k[2])).add(T.float(t).mul(w)).add(ph))));
  return v;
};
/** `flow` in JavaScript, for particles moved on the CPU: writes the current into `out`. */
export function flowAt(x: number, y: number, z: number, t: number, out: { x: number; y: number; z: number }): void {
  let vx = 0, vy = 0, vz = 0;
  for (const [k, c, w, ph] of FLOW) {
    const a = Math.cos(k[0] * x + k[1] * y + k[2] * z + w * t + ph);
    vx += c[0] * a;
    vy += c[1] * a;
    vz += c[2] * a;
  }
  out.x = vx;
  out.y = vy;
  out.z = vz;
}

/** A light's slow, uneven glimmer for `seed` in 0..1: about 0.6–1.45 (mean ~0.87). Two
    incommensurate swells, squared, so it rests a while and now and then brightens; at `rate` 1 a
    swell comes every ~8–20 s. */
export const glimmer = (seed: N, t: N, rate: N | number = 1): N => {
  const w = seed.mul(0.42).add(0.32).mul(rate);
  const s = sin(T.float(t).mul(w).add(seed.mul(37.1))).add(sin(T.float(t).mul(w).mul(1.618).add(seed.mul(91.7))).mul(0.6)).div(1.6);
  const x = s.mul(0.5).add(0.5);
  return x.mul(x).mul(0.85).add(0.6);
};
export function glimmerAt(seed: number, t: number, rate = 1): number {
  const w = (0.32 + seed * 0.42) * rate;
  const x = 0.5 + 0.5 * ((Math.sin(t * w + seed * 37.1) + 0.6 * Math.sin(t * w * 1.618 + seed * 91.7)) / 1.6);
  return 0.6 + 0.85 * x * x;
}

/** A random 0..1 for each point of a sprite cloud, from its index: stable, whatever the cloud's own
    data holds. `instanceSeed` is for the vertex stage (positions, sizes, or inside a `varying`);
    `indexSeed` carries it on to the fragment. */
export const instanceSeed = (): N => fract(sin(float(T.instanceIndex).mul(12.9898)).mul(43758.5453));
export const indexSeed = (): N => T.varying(instanceSeed());
/** A gentle glimmer for every point of a cloud, averaging 1 (`k` 0.3: about 0.9–1.2), each on its
    own time: under whatever twinkle a scene adds of its own. Worked out once a point (vertex stage). */
export const pointGlimmer = (k = 0.3): N => T.varying(mix(float(1), glimmer(instanceSeed(), gpuUniforms.time).div(0.87), k));

/** A particle's life at age `a` (0 born .. 1 gone): in by `birth`, fading from `fade` to its end. */
export const lifeEnv = (a: N, birth = 0.1, fade = 0.45): N => smoothstep(0, birth, a).mul(float(1).sub(smoothstep(fade, 1, a)));
export function lifeAt(a: number, birth = 0.1, fade = 0.45): number {
  const s = (e0: number, e1: number, x: number) => {
    const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
    return t * t * (3 - 2 * t);
  };
  return s(0, birth, a) * (1 - s(fade, 1, a));
}

/** A points material for a sprite cloud: additive, no depth writes, sized in pixels. */
export function softPoints(): THREE.PointsNodeMaterial {
  const m = new THREE.PointsNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
  m.sizeAttenuation = false;
  return m;
}

/** A soft round point cloud sized in world units (as PointsMaterial with size attenuation):
    `positions` are local to the returned sprite. Colour and opacity come from the material. */
export function worldPoints(positions: Float32Array, params: THREE.PointsNodeMaterialParameters): { sprite: THREE.Sprite; material: THREE.PointsNodeMaterial; position: THREE.InstancedBufferAttribute } {
  const material = new THREE.PointsNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, ...params });
  material.sizeAttenuation = true;
  const cloud = spriteCloud(positions.length / 3, { position: 3 }, material);
  (cloud.attrs.position.array as Float32Array).set(positions);
  material.opacityNode = T.materialOpacity.mul(smoothstep(0.5, 0.2, length(T.pointUV.sub(0.5))));
  return { sprite: cloud.sprite, material, position: cloud.attrs.position };
}

/** An additive glow drawn by `color(u, uv)`, with named float uniforms kept as `.uniforms.name.value`
    (as the old ShaderMaterials were driven). */
export function glowShader<K extends string>(
  init: Record<K, number>,
  color: (u: Record<K, N>, uv: N) => N,
  params: THREE.MeshBasicNodeMaterialParameters = {},
): THREE.MeshBasicNodeMaterial & { uniforms: Record<K, { value: number }> } {
  const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, ...params });
  const u = {} as Record<K, N>;
  for (const k of Object.keys(init) as K[]) u[k] = uniform(init[k]);
  m.colorNode = vec4(color(u, T.uv()), 1);
  return Object.assign(m, { uniforms: u as unknown as Record<K, { value: number }> });
}
