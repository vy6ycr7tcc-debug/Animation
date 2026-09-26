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

/** The colour of the air along the ray to `p` (rgb) and how much of it there is (a). */
export const ijFog = Fn(([p]: N[]) => {
  const rd0 = p.sub(cameraPosition);
  const d = length(rd0).toVar();
  const rd = rd0.div(max(d, 1e-4));
  const a = float(FOG.falloff);
  const k = a.mul(rd.y).mul(d);
  const integ = abs(k).greaterThan(1e-3).select(float(1).sub(exp(k.negate())).div(k), float(1).sub(k.mul(0.5)));
  const depth = fogUniforms.density.mul(d).mul(exp(a.negate().mul(max(cameraPosition.y, 0)))).mul(integ).add(float(FOG.haze).mul(d));
  const f = max(float(1).sub(exp(depth.negate())), smoothstep(1700, 2450, d)); // the far land melts into the haze
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
export function spriteCloud(max: number, layout: Record<string, number>, material: THREE.PointsNodeMaterial): SpriteCloud {
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
