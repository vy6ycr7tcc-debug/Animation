/* Light on the land. Every light in the world (lanterns, the archetypes, crystals, spirits and
   the wanderer) splats its glow, seen from straight above, into a small texture that travels
   with the wanderer; the ground reads it and lights up beneath them. Light pools on the earth
   around a lantern, a being's colour spills over the ground at its feet, and your own light
   walks with you. One cheap render of a few hundred soft discs a frame, however many lights. */
import * as THREE from "three/webgpu";
import { T } from "../gpu/tsl";

const { attribute, exp, float, positionLocal, uniform, uv, vec3, vec4 } = T;

const MAX = 512;
const SIZE = 256; // texels
const SPAN = 160; // metres across

export const lightFieldUniforms = {
  /** The texture's centre on the ground (x, z) and its width in metres. */
  centre: uniform(new THREE.Vector2()),
  span: uniform(SPAN),
};

export class LightField {
  readonly target = new THREE.RenderTarget(SIZE, SIZE, { type: THREE.HalfFloatType, depthBuffer: false });
  private scene = new THREE.Scene();
  private cam = new THREE.OrthographicCamera(-SPAN / 2, SPAN / 2, SPAN / 2, -SPAN / 2, 0.1, 2000);
  private geo = new THREE.InstancedBufferGeometry();
  private aPos: THREE.InstancedBufferAttribute; // x, z, radius
  private aCol: THREE.InstancedBufferAttribute; // rgb × intensity
  private n = 0;

  constructor() {
    const quad = new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2);
    this.geo.setAttribute("position", quad.attributes.position);
    this.geo.setAttribute("uv", quad.attributes.uv);
    this.geo.setIndex(quad.index);
    this.aPos = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 3), 3);
    this.aCol = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 3), 3);
    this.aPos.setUsage(THREE.DynamicDrawUsage);
    this.aCol.setUsage(THREE.DynamicDrawUsage);
    this.geo.setAttribute("aPos", this.aPos);
    this.geo.setAttribute("aCol", this.aCol);
    this.geo.instanceCount = 0;
    const mat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
    const p = attribute("aPos", "vec3");
    mat.positionNode = vec3(p.x, 0, p.y).add(positionLocal.mul(p.z));
    const q = uv().sub(0.5).mul(2);
    const r2 = q.dot(q);
    // a soft pool of light: bright at the centre, a long gentle tail
    const fall = exp(r2.mul(-4)).mul(0.8).add(exp(r2.mul(-1.2)).mul(0.2)).mul(float(1).sub(r2).max(0));
    mat.colorNode = vec4(attribute("aCol", "vec3").mul(fall), 1);
    const mesh = new THREE.Mesh(this.geo, mat);
    mesh.frustumCulled = false;
    this.scene.add(mesh);
    this.cam.position.set(0, 1000, 0);
    this.cam.up.set(0, 0, -1);
    this.cam.lookAt(0, 0, 0);
  }

  /** Start a frame's list of lights. */
  begin(): void {
    this.n = 0;
  }

  /** A light at (x, z) reaching `radius` metres, in colour `c` × `k`. */
  add(x: number, z: number, radius: number, c: THREE.Color, k: number): void {
    if (this.n >= MAX || k < 0.002) return;
    this.aPos.array.set([x, z, radius], this.n * 3);
    this.aCol.array.set([c.r * k, c.g * k, c.b * k], this.n * 3);
    this.n++;
  }

  /** Draw the lights around `centre` into the texture. */
  render(renderer: THREE.WebGPURenderer, centre: THREE.Vector3): void {
    // snapped to whole texels, so the pools of light never shimmer as you walk
    const texel = SPAN / SIZE;
    const cx = Math.round(centre.x / texel) * texel, cz = Math.round(centre.z / texel) * texel;
    lightFieldUniforms.centre.value.set(cx, cz);
    this.cam.position.set(cx, 1000, cz);
    this.cam.lookAt(cx, 0, cz);
    this.geo.instanceCount = this.n;
    this.aPos.needsUpdate = this.aCol.needsUpdate = true;
    const prev = renderer.getRenderTarget();
    const prevAlpha = renderer.getClearAlpha();
    renderer.setRenderTarget(this.target);
    renderer.setClearColor(0x000000, 1);
    renderer.clear();
    if (this.n) renderer.render(this.scene, this.cam);
    renderer.setRenderTarget(prev);
    renderer.setClearColor(0x000000, prevAlpha);
  }
}

/** The one light field, shared by the game loop (which fills it) and the materials (which read it). */
export const lightField = new LightField();

/** How much light the field casts at world position `p` (for a material's emissive term). */
export function groundLight(p: ReturnType<typeof T.vec3>): ReturnType<typeof T.vec3> {
  const U = lightFieldUniforms;
  const q = T.vec2(p.x.sub(U.centre.x), U.centre.y.sub(p.z)).div(U.span).add(0.5);
  const edge = T.smoothstep(0.5, 0.38, T.max(T.abs(q.x.sub(0.5)), T.abs(q.y.sub(0.5))));
  // pools of light on the ground are left out (Samuel saw them as soft blobs over the land); the
  // lights themselves still glow
  void q, edge;
  return T.vec3(0);
}
