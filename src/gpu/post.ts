/* The look after the scene is drawn, all in three's own TSL post-processing (WebGPU, with the
   WebGL2 fallback):
   - ambient occlusion (GTAO), soft shadow where things meet, on the higher quality levels;
   - the water between the camera and everything, while the camera is under the surface;
   - god rays from the bright star, screen-space, at half resolution;
   - anti-aliasing: SMAA on the finished image (crisp); temporal (?aa=traa) and none (?aa=none)
     for comparison;
   - bloom with restraint: only what is truly bright glows, close around itself (threshold 0.9,
     strength 0.5, the widest blurs left out);
   - AgX tone mapping, the grade (soft S contrast, vibrance, the mood's tints), a halo-free
     sharpen after SMAA, a vignette and a dither.
   Effects are switched by quality tier (a rebuild) or, for the ones that rest under the water,
   by uniforms (no rebuild, so diving never hitches). */
import * as THREE from "three/webgpu";
import { ao } from "three/examples/jsm/tsl/display/GTAONode.js";
import { bloom } from "three/examples/jsm/tsl/display/BloomNode.js";
import { gaussianBlur } from "three/examples/jsm/tsl/display/GaussianBlurNode.js";
import { traa } from "three/examples/jsm/tsl/display/TRAANode.js";
import { smaa } from "three/examples/jsm/tsl/display/SMAANode.js";
import { gradeUniforms, T, type N } from "./tsl";
import type { UnderwaterEffect } from "../world/underwater";

const { clamp, dot, exp, float, Fn, fract, If, length, max, min, mix, mrt, output, pass, pow, renderOutput, rtt, screenCoordinate, screenSize, sin, smoothstep, step, uniform, uv, vec2, vec3, vec4, velocity } = T;

/** How much colour the grade draws out of muted things (stone, soil, leaves), not out of what is
    already vivid (glows, crystals) nor out of the dark. */
const VIBRANCE = 0.3;
/** Local contrast ("clarity"): each pixel's light against its wide surroundings, in ratio, so
    forms stand out of the haze and the night's darks keep their level (0 none). */
const CLARITY = 0.32;
/** The finishing sharpen after SMAA (0 none): limited to each pixel's neighbours, so no halos. */
const SHARPEN = 0.55;

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
      // a contained glow (Samuel: "glowing but contained… not this ever spreading glare"): only
      // what is truly bright glows, and only close around itself. The bloom's two widest blurs,
      // which spread a veil across the view, are left out; the middle one is kept faint.
      const b = bloom(c, 0.5, 0, 0.9);
      b.smoothWidth.value = 0.3;
      const tint = [1, 0.9, 0.35, 0.06, 0];
      b.bloomTintColors.forEach((v: THREE.Vector3, i: number) => v.setScalar(tint[i]));
      c = vec4(c.rgb.add(b.rgb), c.a);
    }

    // clarity: light measured against a wide blur of itself (a quarter of the resolution), the
    // difference drawn out in ratio, gently, and never in the deepest dark (no noise lifted)
    {
      const base = c;
      const wide = gaussianBlur(base, null, 7, { resolutionScale: 0.25 });
      const luma = (v: N): N => dot(v, vec3(0.2126, 0.7152, 0.0722));
      const lc = luma(base.rgb), lb = luma(wide.rgb);
      const k = float(CLARITY).mul(smoothstep(0.004, 0.04, lb));
      const boost = clamp(pow(lc.add(0.002).div(lb.add(0.002)), k), 0.72, 1.6);
      c = vec4(base.rgb.mul(boost), base.a);
    }

    // AgX (the renderer's tone mapping), to sRGB, then the grade, the smoothed edges, a sharpen
    // limited to each pixel's own neighbours, a vignette, and a dither (no banding in the night)
    let out: N = renderOutput(c);
    // the grade (as a film is graded, per place): saturation, colour drawn out of what is muted,
    // contrast as a soft S (the night's darks never crushed, highlights never clipped), colour
    // lifted into the shadows, the highlights warmed or cooled (moods.ts sets them as you travel)
    {
      const G = gradeUniforms;
      const luma = (v: N): N => dot(v, vec3(0.2126, 0.7152, 0.0722));
      const l0 = luma(out.rgb);
      let g: N = mix(vec3(l0), out.rgb, G.sat);
      const hi = max(g.r, max(g.g, g.b)), lo = min(g.r, min(g.g, g.b));
      const chroma = hi.sub(lo).div(hi.add(1e-4));
      const vib = float(VIBRANCE).mul(float(1).sub(chroma)).mul(smoothstep(0.03, 0.22, l0));
      g = mix(vec3(luma(g)), g, vib.add(1));
      // contrast about the pivot: power curves either side meet there with the same slope
      const P = 0.42;
      const x = clamp(g, 0, 1);
      const below = pow(x.div(P), G.contrast).mul(P);
      const above = float(1).sub(pow(float(1).sub(x).div(1 - P), G.contrast).mul(1 - P));
      g = mix(below, above, step(P, x));
      const l = luma(g);
      g = g.add(G.shadow.mul(pow(float(1).sub(l).max(0), 2)));
      g = g.mul(mix(vec3(1), G.high, smoothstep(0.35, 1, l)));
      out = vec4(clamp(g, 0, 1), 1);
    }
    if (o.aa === "smaa") {
      const tex = smaa(out).getTextureNode();
      const px = vec2(1).div(screenSize);
      const q = uv();
      const m = tex.sample(q).rgb;
      const a = tex.sample(q.add(vec2(px.x, 0))).rgb, b = tex.sample(q.sub(vec2(px.x, 0))).rgb;
      const cc = tex.sample(q.add(vec2(0, px.y))).rgb, d = tex.sample(q.sub(vec2(0, px.y))).rgb;
      const mn = min(m, min(min(a, b), min(cc, d))), mx = max(m, max(max(a, b), max(cc, d)));
      const avg = a.add(b).add(cc).add(d).mul(0.25);
      out = vec4(clamp(m.add(m.sub(avg).mul(SHARPEN)), mn, mx), 1);
    }
    // the vignette only darkens (mixing toward grey lifted the dark corners into a haze): the
    // middle of the view untouched, a slow fall to the corners, following the frame's shape
    const r = length(uv().sub(0.5));
    out = vec4(out.rgb.mul(float(1).sub(smoothstep(0.32, 0.78, r).mul(0.13))), 1);
    // half a step of noise either way: the night's long gradients never band into steps
    const f = screenCoordinate.xy;
    const n1 = fract(sin(dot(f, vec2(12.9898, 78.233))).mul(43758.5453));
    const n2 = fract(sin(dot(f, vec2(39.3468, 11.135))).mul(24634.6345));
    out = vec4(out.rgb.add(n1.add(n2).sub(1).div(255)), 1);
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
