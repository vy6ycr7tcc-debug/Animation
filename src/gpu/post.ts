/* The look after the scene is drawn, all in three's own TSL post-processing (WebGPU, with the
   WebGL2 fallback):
   - ambient occlusion (GTAO), soft shadow where things meet, on the higher quality levels;
   - the water between the camera and everything, while the camera is under the surface;
   - god rays from the bright star, screen-space, at half resolution;
   - temporal anti-aliasing (TRAA): the camera jitters a little each frame, and the frames are
     gathered into one smooth image; SMAA (?aa=smaa) and none (?aa=none) for comparison;
   - bloom with restraint: only what is truly bright glows (threshold 0.88, strength 0.7);
   - AgX tone mapping, then a faint vignette.
   Effects are switched by quality tier (a rebuild) or, for the ones that rest under the water,
   by uniforms (no rebuild, so diving never hitches). */
import * as THREE from "three/webgpu";
import { ao } from "three/examples/jsm/tsl/display/GTAONode.js";
import { bloom } from "three/examples/jsm/tsl/display/BloomNode.js";
import { traa } from "three/examples/jsm/tsl/display/TRAANode.js";
import { smaa } from "three/examples/jsm/tsl/display/SMAANode.js";
import { T, type N } from "./tsl";
import type { UnderwaterEffect } from "../world/underwater";

const { dot, exp, float, Fn, If, min, mix, mrt, output, pass, pow, renderOutput, rtt, uniform, uv, vec2, vec3, vec4, velocity } = T;

export interface PostOptions {
  ao: boolean;
  rays: boolean;
  bloom: boolean;
  /** Anti-aliasing: SMAA on the finished image (as before the port), temporal (TRAA), or none. */
  aa: "smaa" | "traa" | "none";
}

export class Post {
  readonly pipeline: THREE.RenderPipeline;
  /** 1 while the camera is under the water. */
  readonly under = uniform(0);
  /** Ambient occlusion and god rays rest under the water. */
  readonly aoOn = uniform(1);
  readonly raysOn = uniform(1);
  /** Where the star is on screen (uv, y down) and how much of it is in front of the camera. */
  readonly starUv = uniform(new THREE.Vector2(0.5, 0.2));
  readonly starVis = uniform(0);
  readonly aspect = uniform(1);
  private scene: N = null;
  private sceneAA: PostOptions["aa"] | null = null;
  private opts: PostOptions | null = null;
  private v = new THREE.Vector3();

  constructor(
    renderer: THREE.WebGPURenderer,
    private sceneObj: THREE.Scene,
    private camera: THREE.PerspectiveCamera,
    private underwater: UnderwaterEffect,
  ) {
    this.pipeline = new THREE.RenderPipeline(renderer);
    this.pipeline.outputColorTransform = false; // done by hand, so the vignette comes after it
  }

  /** The scene pass for an anti-aliasing mode (with motion vectors for TRAA). Multisampling is
      not an option: the occlusion, the god rays and the water all read the depth buffer. */
  private scenePass(aa: PostOptions["aa"]): N {
    if (this.scene && this.sceneAA === aa) return this.scene;
    this.scene?.dispose();
    this.sceneAA = aa;
    this.scene = pass(this.sceneObj, this.camera);
    if (aa === "traa") {
      const m = mrt({ output, velocity });
      // glows drawn over the world must not blend into the motion vectors
      m.setBlendMode("velocity", new THREE.BlendMode(THREE.NoBlending));
      this.scene.setMRT(m);
    }
    return this.scene;
  }

  private wanted: PostOptions | null = null;
  private ready = false;

  /** Build the chain once the renderer is ready. */
  start(): void {
    this.ready = true;
    if (this.wanted) this.configure(this.wanted);
  }

  /** Rebuild the chain for a quality tier (only when something changed). */
  configure(o: PostOptions): void {
    this.wanted = { ...o };
    if (!this.ready) return;
    const p = this.opts;
    if (p && p.ao === o.ao && p.rays === o.rays && p.bloom === o.bloom && p.aa === o.aa) return;
    this.opts = { ...o };
    const scene = this.scenePass(o.aa);
    const color = scene.getTextureNode("output");
    const depth = scene.getTextureNode("depth");
    let c: N = color;

    if (o.ao) {
      const g = ao(depth, null as unknown as N, this.camera);
      g.resolutionScale = 0.5;
      g.radius.value = 1.2;
      g.thickness.value = 1.5;
      g.samples.value = 12;
      const a = pow(g.getTextureNode().r, 1.4);
      // the occlusion is tinted with the night (as the old pass was), never pure black
      const k = mix(vec3(0.043, 0.039, 0.11), vec3(1), a);
      c = vec4(c.rgb.mul(mix(vec3(1), k, this.aoOn)), c.a);
    }

    // under the water: absorption, shafts of moonlight, the orb's glow in the murk
    const above = c;
    const uw = this.underwater;
    c = Fn(() => {
      const out = vec4(above).toVar();
      If(this.under.greaterThan(0.5), () => {
        out.assign(uw.node(above, depth));
      });
      return out;
    })();

    if (o.rays) {
      // the star's disc where only sky is behind it, then light scattered back from it
      const mask = Fn(() => {
        const q = uv();
        const sky = depth.sample(q).r.greaterThanEqual(0.9999).select(float(1), float(0));
        const d = q.sub(this.starUv).mul(vec2(this.aspect, 1));
        const disc = exp(dot(d, d).mul(-9000));
        return vec4(vec3(1.0, 0.8, 0.5).mul(sky).mul(disc), 1);
      })();
      const maskTex = rtt(mask, null, null, { resolutionScale: 0.5 });
      const rays = Fn(() => {
        const SAMPLES = 40;
        const q = uv().toVar();
        const delta = q.sub(this.starUv).mul(0.9 / SAMPLES);
        const sum = vec3(0).toVar();
        const w = float(1).toVar();
        for (let i = 0; i < SAMPLES; i++) {
          q.subAssign(delta);
          sum.addAssign(maskTex.sample(q).rgb.mul(w).mul(0.35));
          w.mulAssign(0.955);
        }
        return vec4(min(sum.mul(0.45), vec3(1)), 1);
      })();
      const raysTex = rtt(rays, null, null, { resolutionScale: 0.5 });
      c = vec4(c.rgb.add(raysTex.rgb.mul(this.raysOn).mul(this.starVis)), c.a);
    }

    if (o.aa === "traa") c = traa(c, depth, scene.getTextureNode("velocity"), this.camera);

    if (o.bloom) {
      const b = bloom(c, 0.7, 0.45, 0.88); // a tighter glow: the image stays crisp
      b.smoothWidth.value = 0.3;
      c = vec4(c.rgb.add(b.rgb), c.a);
    }

    // AgX (the renderer's tone mapping), to sRGB, smoothed edges, then a faint vignette as before
    let out: N = renderOutput(c);
    if (o.aa === "smaa") out = smaa(out);
    const q = uv().sub(0.5).mul(0.35);
    out = vec4(mix(out.rgb, vec3(0.5), dot(q, q)), 1);
    this.pipeline.outputNode = out;
    this.pipeline.needsUpdate = true;
  }

  /** Each frame, before render: where the star is on screen. */
  follow(starWorld: THREE.Vector3, w: number, h: number): void {
    this.aspect.value = w / h;
    this.v.copy(starWorld).project(this.camera);
    this.starUv.value.set((this.v.x + 1) / 2, (1 - this.v.y) / 2);
    // fade as it nears the edge of the view or goes behind the camera
    const inFront = this.v.z < 1 ? 1 : 0;
    const edge = Math.max(Math.abs(this.v.x), Math.abs(this.v.y));
    this.starVis.value = inFront * THREE.MathUtils.clamp((1.6 - edge) / 0.6, 0, 1);
  }

  render(): void {
    this.pipeline.render();
  }
}
