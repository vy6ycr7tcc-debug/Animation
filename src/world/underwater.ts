/* Below the water. Everything here is only drawn while the wanderer is in the water.
   - The look (UnderwaterEffect): light is absorbed as it travels, red first, then green, so
     the far water turns teal and then indigo; the deeper you are, the darker it grows. Moonlight
     falls in slow shafts that stay put in the water as you move through them. The wanderer's
     orb is a lantern in the murk. The surface overhead (water.ts) shows the sky through a bright
     window.
   - Sea-ribbons: tall kelp that sways and parts around you, with light pulsing to its tips.
   - Anemones: clusters of soft lights on the floor, breathing.
   - Marine snow: a slow drift of motes all around, lit by your orb; bubbles from your strokes.
   - Creatures (SeaFauna): schools of fish, mantas, dolphins and a whale, from Quaternius's
     Animated Fish Pack (CC0), drawn in the same glass light as the wanderer. */
import * as THREE from "three/webgpu";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import { loadBytes } from "../core/assets";
import { gpuUniforms, softPoints, spriteCloud, T, viewDepth, type N, type SpriteCloud } from "../gpu/tsl";
import { lightBodyMaterial, tickLightBody } from "../player/lightBody";
import { heightAt, WATER_Y } from "./terrain";

const {
  abs, atan, attribute, clamp, cos, Discard, distance, dot, exp, float, floor, Fn, fract, getViewPosition, If, inverseSqrt, length, max, min,
  mix, normalize, pointUV, positionLocal, pow, screenCoordinate, sin, smoothstep, step, uniform, uv, varying, vec2, vec3, vec4,
} = T;

const uwH = (p: N): N => fract(sin(dot(p, vec2(127.1, 311.7))).mul(43758.5453));
const uwN = Fn(([p]: N[]) => {
  const i = floor(p), f0 = fract(p), f = f0.mul(f0).mul(float(3).sub(f0.mul(2)));
  return mix(mix(uwH(i), uwH(i.add(vec2(1, 0))), f.x), mix(uwH(i.add(vec2(0, 1))), uwH(i.add(vec2(1, 1))), f.x), f.y);
});

/* ---------------------------------------------------------------- the look under the surface */
/** The water between the camera and everything it sees, as a post-processing node. */
export class UnderwaterEffect {
  readonly u = {
    uT: uniform(0),
    uDepth: uniform(1),
    uCam: uniform(new THREE.Vector3()),
    uOrb: uniform(new THREE.Vector3()),
    uProjInv: uniform(new THREE.Matrix4()),
    uCamWorld: uniform(new THREE.Matrix4()),
  };

  /** `color`: the scene's colour; `depth`: its depth texture node. */
  node(color: N, depth: N): N {
    const { uT, uDepth, uCam, uOrb, uProjInv, uCamWorld } = this.u;
    return Fn(() => {
      const q0 = uv();
      const d = depth.sample(q0).r;
      // the ray through this pixel, in the world
      const rv = normalize(getViewPosition(q0, float(1), uProjInv));
      const ray = normalize(uCamWorld.mul(vec4(rv, 0)).xyz);
      const vp = getViewPosition(q0, d, uProjInv);
      const dist = d.greaterThanEqual(0.9999).select(float(160), vp.z.negate().div(max(rv.z.negate(), 0.05))).toVar();
      // looking up, the water ends at the surface
      If(ray.y.greaterThan(0.01), () => {
        dist.assign(min(dist, uDepth.add(0.02).div(ray.y)));
      });
      // absorption (red first) and the glow of the water itself, darker the deeper you are
      const Tr = exp(vec3(0.28, 0.08, 0.052).negate().mul(dist));
      const deep = smoothstep(0, 38, uDepth);
      const glowW = mix(vec3(0.03, 0.1, 0.135), vec3(0.004, 0.013, 0.036), deep).mul(max(0, ray.y).mul(float(1).sub(deep.mul(0.6))).mul(0.9).add(0.55));
      const c = color.rgb.mul(Tr).add(glowW.mul(float(1).sub(Tr))).toVar();
      // the sky through the surface: a bright window straight overhead (Snell's window),
      // rippling, with a brighter rim, fading as you go deeper
      If(ray.y.greaterThan(0.5), () => {
        const hit = uCam.xz.add(ray.xz.mul(uDepth.div(ray.y)));
        const rip = uwN(hit.mul(0.6).add(vec2(uT.mul(0.3), uT.mul(0.2)))).mul(0.6).add(uwN(hit.mul(1.7).sub(vec2(uT.mul(0.25), 0))).mul(0.4));
        const win = smoothstep(0.62, 0.7, ray.y.add(rip.sub(0.5).mul(0.04)));
        const rim = win.mul(float(1).sub(smoothstep(0.7, 0.78, ray.y)));
        c.addAssign(vec3(0.16, 0.26, 0.32).mul(win).mul(rip.mul(0.6).add(0.7)).add(vec3(0.3, 0.42, 0.45).mul(rim)).mul(exp(uDepth.mul(-0.06))));
      });
      // shafts of moonlight: a pattern on the surface, cast down through the water; a few
      // samples along the ray, each dimmed by the water it has come through
      const shafts = float(0).toVar();
      const reach = min(dist, 32);
      for (let k = 0; k < 6; k++) {
        const s = float(k + 0.5).add(uwH(q0.mul(vec2(913, 577)).add(k)).mul(0.5)).div(6).mul(reach);
        const p = uCam.add(ray.mul(s));
        const below = max(0, p.y.negate());
        const q = p.xz.add(vec2(0.25, 0.6).mul(below)).mul(0.16);
        const pat0 = uwN(q.add(vec2(uT.mul(0.04), uT.mul(-0.03)))).mul(0.65).add(uwN(q.mul(2.3).sub(vec2(uT.mul(0.05), uT.mul(0.02)))).mul(0.35));
        const pat = pow(smoothstep(0.52, 0.9, pat0), 2);
        shafts.addAssign(pat.mul(exp(below.mul(-0.07).sub(s.mul(0.06)))));
      }
      c.addAssign(vec3(0.3, 0.55, 0.62).mul(shafts).div(6).mul(0.55).mul(float(1).sub(deep.mul(0.85))));
      // the orb: a lantern in the murk (light scattered along the ray, after Macklin)
      const oq = uCam.sub(uOrb);
      const b = dot(ray, oq), cc = dot(oq, oq);
      const sInv = inverseSqrt(max(cc.sub(b.mul(b)), 0.02));
      const lit = sInv.mul(atan(min(dist, 40).add(b).mul(sInv)).sub(atan(b.mul(sInv))));
      c.addAssign(vec3(1.0, 0.86, 0.62).mul(lit).mul(0.014));
      c.mulAssign(float(1).sub(pow(length(q0.sub(0.5)).mul(1.3), 2).mul(0.35)));
      return vec4(c, color.a);
    })();
  }

  /** Each frame while under: the camera, the time, and where the orb is. */
  follow(camera: THREE.PerspectiveCamera, t: number, orb: THREE.Vector3): void {
    const u = this.u;
    u.uT.value = t;
    u.uDepth.value = Math.max(0, WATER_Y - camera.position.y);
    u.uCam.value.copy(camera.position);
    u.uOrb.value.copy(orb);
    u.uProjInv.value.copy(camera.projectionMatrixInverse);
    u.uCamWorld.value.copy(camera.matrixWorld);
  }
}

/* ---------------------------------------------------------------- life */
const TILE = 14;
const RING = 3;
const RIBBONS_PER_TILE = 18;
const SNOW = 900;
const SNOW_BOX = 22; // metres: the drift wraps around the camera in a box this wide
const BUBBLES = 80;

function hash(i: number, j: number, s: number): number {
  const v = Math.sin(i * 127.1 + j * 311.7 + s * 74.7) * 43758.5453;
  return v - Math.floor(v);
}

export class SeaLife {
  group = new THREE.Group();
  private uni = { uT: uniform(0), uOrb: uniform(new THREE.Vector3()), uCam: uniform(new THREE.Vector3()), uPx: uniform(600) };
  private ribbons: THREE.Mesh;
  private rGeo: THREE.InstancedBufferGeometry;
  private rBase: THREE.InstancedBufferAttribute;
  private rParams: THREE.InstancedBufferAttribute;
  private glowPts: SpriteCloud;
  private snow: THREE.Sprite;
  private bub: SpriteCloud;
  private bubState: { p: THREE.Vector3; v: number; life: number; wob: number }[] = [];
  private bubNext = 0;
  private cx = Infinity;
  private cz = Infinity;

  constructor() {
    // sea-ribbons (kelp): a tall, narrow strip, swaying; uv.y 0 at the root, 1 at the tip
    const seg = 12;
    const pos: number[] = [], uvs: number[] = [], idx: number[] = [];
    for (let k = 0; k <= seg; k++) {
      const y = k / seg;
      const w = 0.16 * Math.sin(Math.PI * (0.08 + y * 0.84)) * (1 - y * 0.35); // a leaf: narrow at root and tip
      pos.push(-w, y, 0, w, y, 0);
      uvs.push(0, y, 1, y);
      if (k < seg) idx.push(k * 2, k * 2 + 2, k * 2 + 1, k * 2 + 1, k * 2 + 2, k * 2 + 3);
    }
    this.rGeo = new THREE.InstancedBufferGeometry();
    this.rGeo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    this.rGeo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    this.rGeo.setIndex(idx);
    const maxR = RIBBONS_PER_TILE * (RING * 2 + 1) ** 2;
    this.rBase = new THREE.InstancedBufferAttribute(new Float32Array(maxR * 3), 3);
    this.rParams = new THREE.InstancedBufferAttribute(new Float32Array(maxR * 3), 3); // height, rotation, hue
    this.rGeo.setAttribute("aBase", this.rBase);
    this.rGeo.setAttribute("aParams", this.rParams);
    this.rGeo.instanceCount = 0;
    const U = this.uni, dpr = gpuUniforms.dpr;
    {
      const mat = new THREE.MeshBasicNodeMaterial({ side: THREE.DoubleSide, fog: false });
      const aBase = attribute("aBase", "vec3"), aParams = attribute("aParams", "vec3");
      const vy = uv().y, y2 = vy.mul(vy);
      const p0 = positionLocal.mul(vec3(1, aParams.x, 1));
      const c = cos(aParams.y), sn = sin(aParams.y);
      // a sway that travels up the stalk
      const sway = aParams.x.mul(0.25).mul(y2);
      const p = vec3(
        p0.x.mul(c).add(sin(U.uT.mul(0.6).add(aBase.x.mul(0.3)).sub(vy.mul(2.5))).mul(0.35).mul(sway)),
        p0.y,
        p0.x.mul(sn).add(cos(U.uT.mul(0.5).add(aBase.z.mul(0.3)).sub(vy.mul(2.1))).mul(0.3).mul(sway)),
      );
      // it parts around the wanderer's light, and brightens
      const w0 = aBase.add(p);
      const away = w0.xz.sub(U.uOrb.xz), d = length(away).add(1e-3);
      const near = float(1).sub(smoothstep(0.6, 3.2, d)).mul(float(1).sub(smoothstep(1, 5, abs(w0.y.sub(U.uOrb.y)))));
      const push = away.div(d).mul(near).mul(vy).mul(0.5);
      const w = vec3(w0.x.add(push.x), w0.y, w0.z.add(push.y));
      mat.positionNode = w;
      const vNear = varying(near), vCamD = varying(distance(w, U.uCam)), vD = varying(viewDepth(w));
      const vHue = varying(aParams.z);
      const kH = (q: N): N => fract(sin(dot(q, vec2(127.1, 311.7))).mul(43758.5453));
      mat.colorNode = Fn(() => {
        // near the lens a blade thins away to nothing, so none ever fills the view
        If(vCamD.lessThan(kH(screenCoordinate.xy.mul(0.37)).mul(3).add(2)), () => {
          Discard();
        });
        const vUv = uv();
        const edge = float(1).sub(abs(vUv.x.mul(2).sub(1)));
        const hue = mix(vec3(0.25, 0.9, 0.8), vec3(0.6, 0.5, 1.0), vHue);
        // a dark, living blade: deep green at the root, a little light through it near the top
        const col = mix(vec3(0.008, 0.03, 0.03), vec3(0.03, 0.09, 0.08), vUv.y).mul(edge.mul(0.5).add(0.5)).toVar();
        // specks of light rising slowly up the blade, and a soft glow at the tip
        const ly = vUv.y.mul(28).sub(U.uT.mul(0.6));
        const cell = vec2(floor(vUv.x.mul(3)), floor(ly));
        const speck = step(0.93, kH(cell.add(vHue.mul(17)))).mul(smoothstep(0.35, 0, abs(fract(ly).sub(0.5))));
        col.addAssign(hue.mul(speck.mul(0.5).add(smoothstep(0.85, 1, vUv.y).mul(0.35)).add(vNear.mul(0.35))));
        return vec4(col.mul(float(1).sub(smoothstep(30, 55, vD))), 1);
      })();
      this.ribbons = new THREE.Mesh(this.rGeo, mat);
    }
    this.ribbons.frustumCulled = false;

    // anemones and floor lights
    {
      const mat = softPoints();
      this.glowPts = spriteCloud(900, { position: 3, aK: 1 }, mat);
      const { position, aK } = this.glowPts.nodes;
      const dz = viewDepth(position);
      const vA = sin(U.uT.mul(aK.add(0.6)).add(aK.mul(40))).mul(0.45).add(0.55).mul(float(1).sub(smoothstep(25, 50, dz)));
      const vC = mix(vec3(0.3, 1.0, 0.85), vec3(1.0, 0.5, 0.8), step(0.6, aK));
      mat.sizeNode = clamp(aK.mul(0.16).add(0.2).mul(260).div(max(dz, 0.5)), 2, 56).div(dpr);
      const r = length(pointUV.sub(0.5)).mul(2);
      mat.colorNode = vec4(vC.mul(exp(r.mul(r).mul(-4)).mul(1.4).add(float(1).sub(smoothstep(0, 0.3, r)).mul(2.2))).mul(vA), 1);
      this.glowPts.setCount(0);
    }

    // marine snow: motes drifting in a box that wraps around the camera, so there are always
    // some near you; lit mostly by your orb
    {
      const mat = softPoints();
      const cloud = spriteCloud(SNOW, { aSeed: 4 }, mat);
      const seed = cloud.attrs.aSeed.array as Float32Array;
      for (let i = 0; i < SNOW * 4; i++) seed[i] = Math.random();
      const aSeed = cloud.nodes.aSeed, B = SNOW_BOX;
      const drift = vec3(sin(U.uT.mul(0.05).add(aSeed.w.mul(6))).mul(0.6), U.uT.mul(-0.06).mul(aSeed.w.add(0.4)), cos(U.uT.mul(0.04).add(aSeed.x.mul(6))).mul(0.6));
      const p = U.uCam.add(fract(aSeed.xyz.mul(B).add(drift).sub(U.uCam).div(B)).sub(0.5).mul(B));
      mat.positionNode = p;
      const dCam = distance(p, U.uCam), dOrb = distance(p, U.uOrb);
      const vA = float(1.4).div(dOrb.mul(dOrb).mul(0.35).add(1)).add(0.1).mul(float(1).sub(smoothstep(B * 0.3, B * 0.5, dCam))).mul(step(p.y, -0.2));
      mat.sizeNode = clamp(aSeed.w.mul(0.03).add(0.025).mul(U.uPx).div(max(viewDepth(p), 0.3)), 1, 10).div(dpr);
      const r = length(pointUV.sub(0.5)).mul(2);
      mat.colorNode = vec4(vec3(0.75, 0.88, 1.0).mul(float(1).sub(smoothstep(0.2, 1, r))).mul(vA).mul(0.5), 1);
      this.snow = cloud.sprite;
    }

    // bubbles from your strokes, wobbling up to the surface
    {
      const mat = softPoints();
      this.bub = spriteCloud(BUBBLES, { position: 3, aSize: 1 }, mat);
      const { position, aSize } = this.bub.nodes;
      mat.sizeNode = clamp(aSize.mul(U.uPx).div(max(viewDepth(position), 0.3)), 0, 24).div(dpr);
      const r = length(pointUV.sub(0.5)).mul(2);
      const ring = smoothstep(0.55, 0.85, r).mul(float(1).sub(smoothstep(0.85, 1, r)));
      mat.colorNode = vec4(vec3(0.8, 0.92, 1.0).mul(ring.mul(0.9).add(0.08)).mul(step(0.001, aSize)), 1);
    }
    for (let i = 0; i < BUBBLES; i++) this.bubState.push({ p: new THREE.Vector3(), v: 0, life: 0, wob: Math.random() * 6 });

    this.group.add(this.ribbons, this.glowPts.sprite, this.snow, this.bub.sprite);
    this.group.visible = false;
  }

  /** A breath of bubbles, from a stroke or from diving in. */
  bubbles(at: THREE.Vector3, n: number): void {
    for (let k = 0; k < n; k++) {
      const b = this.bubState[this.bubNext];
      this.bubNext = (this.bubNext + 1) % BUBBLES;
      b.p.set(at.x + (Math.random() - 0.5) * 0.4, at.y + 1.0 + Math.random() * 0.4, at.z + (Math.random() - 0.5) * 0.4);
      b.v = 0.5 + Math.random() * 0.6;
      b.life = 1;
    }
  }

  private restream(px: number, pz: number): void {
    const b = this.rBase.array as Float32Array, pr = this.rParams.array as Float32Array;
    const gp = this.glowPts.attrs.position;
    const gk = this.glowPts.attrs.aK;
    const gpa = gp.array as Float32Array, gka = gk.array as Float32Array;
    let n = 0, g = 0;
    const cx = Math.floor(px / TILE), cz = Math.floor(pz / TILE);
    for (let i = cx - RING; i <= cx + RING; i++)
      for (let j = cz - RING; j <= cz + RING; j++) {
        for (let k = 0; k < RIBBONS_PER_TILE; k++) {
          const x = (i + hash(i, j, k)) * TILE, z = (j + hash(i, j, k + 50)) * TILE;
          const h = heightAt(x, z);
          if (h > WATER_Y - 1.3) continue;
          // in drifts: some floors are forests of kelp, others bare
          if (hash(Math.floor(x / 9), Math.floor(z / 9), 3) < 0.35) continue;
          // tall where the water is deep: up to about two thirds of the way to the surface
          const tall = Math.min(16, (-h - 0.6) * 0.66) * (0.45 + hash(i, j, k + 99) * 0.55);
          b.set([x, h, z], n * 3);
          pr.set([Math.max(0.6, tall), hash(i, j, k + 7) * 6.28, hash(i, j, k + 13)], n * 3);
          n++;
        }
        // a cluster of anemone lights
        for (let c = 0; c < 2; c++) {
          const x0 = (i + hash(i, j, 200 + c)) * TILE, z0 = (j + hash(i, j, 300 + c)) * TILE;
          const h0 = heightAt(x0, z0);
          if (h0 > WATER_Y - 1.0) continue;
          for (let k = 0; k < 7 && g < gka.length; k++) {
            const a = hash(i, j, 400 + c * 10 + k) * 6.28, r = hash(i, j, 500 + c * 10 + k) * 1.2;
            const x = x0 + Math.cos(a) * r, z = z0 + Math.sin(a) * r;
            gpa.set([x, heightAt(x, z) + 0.15 + hash(i, j, 600 + k) * 0.3, z], g * 3);
            gka[g++] = hash(i, j, 700 + c * 10 + k);
          }
        }
      }
    this.rGeo.instanceCount = n;
    this.rBase.needsUpdate = this.rParams.needsUpdate = true;
    this.glowPts.setCount(g);
    gp.needsUpdate = gk.needsUpdate = true;
  }

  /** `inWater`: the wanderer is swimming or the camera is under the surface. `orb`: where the
      wanderer's light is. */
  update(t: number, dt: number, player: THREE.Vector3, inWater: boolean, orb: THREE.Vector3, cam: THREE.Vector3, pxPerUnit: number): void {
    this.group.visible = inWater;
    if (!inWater) return;
    this.uni.uT.value = t;
    this.uni.uOrb.value.copy(orb);
    this.uni.uCam.value.copy(cam);
    this.uni.uPx.value = pxPerUnit;
    this.snow.visible = cam.y < WATER_Y - 0.1;
    const cx = Math.floor(player.x / TILE), cz = Math.floor(player.z / TILE);
    if (cx !== this.cx || cz !== this.cz) {
      this.cx = cx;
      this.cz = cz;
      this.restream(player.x, player.z);
    }
    const bp = this.bub.attrs.position, bs = this.bub.attrs.aSize;
    const pa = bp.array as Float32Array, sa = bs.array as Float32Array;
    this.bubState.forEach((b, i) => {
      if (b.life > 0) {
        b.p.y += b.v * dt;
        b.wob += dt * 6;
        b.p.x += Math.sin(b.wob) * 0.12 * dt;
        b.p.z += Math.cos(b.wob * 0.8) * 0.12 * dt;
        b.life -= dt * 0.12;
        if (b.p.y > WATER_Y - 0.05) b.life = 0;
      }
      pa.set([b.p.x, b.p.y, b.p.z], i * 3);
      sa[i] = b.life > 0 ? 0.05 + 0.03 * Math.sin(i) : 0;
    });
    bp.needsUpdate = bs.needsUpdate = true;
  }
}

/* ---------------------------------------------------------------- creatures of the deep */
interface Swimmer {
  obj: THREE.Group;
  mixer: THREE.AnimationMixer;
  p: THREE.Vector3;
  v: THREE.Vector3;
  kind: number; // which model
  school: number; // -1: alone
  offset: THREE.Vector3; // place in the school
  speed: number;
}
interface Kind {
  file: string;
  length: number; // metres, nose to tail
  tint: THREE.Color;
  count: number;
  school: boolean;
  /** How deep the water must be for it. */
  minDepth: number;
  speed: number;
  timeScale: number;
}

/** Fish, mantas, dolphins and a whale: real animated models (Quaternius, CC0), in glass light.
    Schools keep loosely together behind a leader that wanders a slow path around you; all of
    them part around your light. They are only here while you are in the water. */
export class SeaFauna {
  group = new THREE.Group();
  private list: Swimmer[] = [];
  private mats: THREE.Material[] = [];
  private leaders: { p: THREE.Vector3; phase: number; r: number }[] = [];
  private tmp = new THREE.Vector3();
  private look = new THREE.Vector3();
  private kinds: Kind[] = [
    { file: "models/sea/fish1.glb", length: 0.45, tint: new THREE.Color(0.75, 1.0, 1.05), count: 10, school: true, minDepth: 3, speed: 1.4, timeScale: 1 },
    { file: "models/sea/fish2.glb", length: 0.55, tint: new THREE.Color(1.1, 0.85, 1.0), count: 8, school: true, minDepth: 4, speed: 1.2, timeScale: 0.9 },
    { file: "models/sea/fish3.glb", length: 0.4, tint: new THREE.Color(1.1, 1.0, 0.75), count: 10, school: true, minDepth: 3, speed: 1.5, timeScale: 1.1 },
    { file: "models/sea/manta.glb", length: 2.6, tint: new THREE.Color(0.8, 0.85, 1.15), count: 2, school: false, minDepth: 8, speed: 1.1, timeScale: 0.5 },
    { file: "models/sea/dolphin.glb", length: 2.1, tint: new THREE.Color(0.9, 1.0, 1.15), count: 2, school: false, minDepth: 6, speed: 2.6, timeScale: 0.8 },
    { file: "models/sea/whale.glb", length: 11, tint: new THREE.Color(0.75, 0.8, 1.1), count: 1, school: false, minDepth: 22, speed: 1.3, timeScale: 0.35 },
  ];

  constructor() {
    this.group.visible = false;
    void this.load();
  }

  private async load(): Promise<void> {
    const loader = new GLTFLoader();
    for (const [ki, k] of this.kinds.entries()) {
      const bytes = await loadBytes(k.file);
      if (!bytes) continue;
      const gltf = await loader.parseAsync(bytes, "");
      const clip = gltf.animations[0];
      // the same glass light as the wanderer, but brighter: thin shapes in dark water, glowing
      // like the creatures of the deep
      const mat = lightBodyMaterial(k.tint.clone().multiplyScalar(1.6), { inner: 0.55, edge: 1.3, body: 0.6 });
      this.mats.push(mat);
      gltf.scene.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(gltf.scene, true);
      const len = box.max.z - box.min.z || 1;
      const centre = box.getCenter(new THREE.Vector3());
      if (k.school) this.leaders.push({ p: new THREE.Vector3(), phase: Math.random() * 6, r: 4 + this.leaders.length * 2.5 });
      for (let i = 0; i < k.count; i++) {
        const model = i === 0 ? gltf.scene : cloneSkinned(gltf.scene);
        model.traverse((o) => {
          const m = o as THREE.SkinnedMesh;
          if (m.isMesh) {
            m.material = mat;
            m.frustumCulled = false;
            m.geometry.computeVertexNormals();
          }
        });
        const holder = new THREE.Group();
        const s = k.length / len;
        model.scale.setScalar(s);
        model.position.copy(centre).multiplyScalar(-s);
        holder.add(model);
        const mixer = new THREE.AnimationMixer(model);
        if (clip) {
          const a = mixer.clipAction(clip);
          a.timeScale = k.timeScale * (0.85 + Math.random() * 0.3);
          a.play();
          mixer.update(Math.random() * clip.duration);
        }
        this.group.add(holder);
        this.list.push({
          obj: holder, mixer, p: new THREE.Vector3(), v: new THREE.Vector3(), kind: ki,
          school: k.school ? this.leaders.length - 1 : -1,
          offset: new THREE.Vector3((Math.random() - 0.5) * 2.4, (Math.random() - 0.5) * 1.2, (Math.random() - 0.5) * 2.4),
          speed: k.speed,
        });
      }
    }
  }

  /** Somewhere in water at least `minDepth` deep near (x, z), or null. */
  private waterNear(x: number, z: number, minDepth: number, r0: number, r1: number): THREE.Vector3 | null {
    for (let k = 0; k < 12; k++) {
      const a = Math.random() * 6.28, r = r0 + Math.random() * (r1 - r0);
      const px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
      const floor = heightAt(px, pz);
      if (WATER_Y - floor >= minDepth) return new THREE.Vector3(px, floor + (WATER_Y - floor) * (0.25 + Math.random() * 0.5), pz);
    }
    return null;
  }

  update(t: number, dt: number, player: THREE.Vector3, inWater: boolean, orb: THREE.Vector3, reduced: boolean): void {
    this.group.visible = inWater && this.list.length > 0;
    if (!this.group.visible) return;
    for (const m of this.mats) tickLightBody(m, t);
    // school leaders wander slow loops around the wanderer, in water deep enough for them
    this.leaders.forEach((l, i) => {
      const a = t * (0.05 + i * 0.012) + l.phase;
      this.tmp.set(player.x + Math.cos(a) * l.r, 0, player.z + Math.sin(a * 1.3) * l.r);
      const floor = heightAt(this.tmp.x, this.tmp.z);
      if (WATER_Y - floor > 2) this.tmp.y = Math.min(WATER_Y - 1, Math.max(floor + 1, player.y + 1 + Math.sin(t * 0.2 + i) * 2));
      else this.tmp.copy(l.p.lengthSq() ? l.p : player);
      l.p.lerp(this.tmp, Math.min(1, dt * 0.4));
    });
    for (const f of this.list) {
      const k = this.kinds[f.kind];
      const far = f.p.distanceTo(player);
      if (f.p.lengthSq() === 0 || far > (k.length > 5 ? 120 : 70)) {
        const at = this.waterNear(player.x, player.z, k.minDepth, k.length > 5 ? 30 : 5, k.length > 5 ? 60 : 16);
        f.obj.visible = !!at;
        if (!at) continue;
        f.p.copy(at);
        f.v.set(0, 0, 0);
      }
      if (!f.obj.visible) continue;
      // where it wants to be: its place in the school, or a slow wander of its own
      if (f.school >= 0) this.tmp.copy(this.leaders[f.school].p).add(f.offset);
      else {
        const a = t * 0.03 * (1 + f.kind * 0.3) + f.kind * 2;
        const r = k.length > 5 ? 34 : 10;
        this.tmp.set(player.x + Math.cos(a) * r, f.p.y, player.z + Math.sin(a) * r);
      }
      const want = this.tmp.sub(f.p);
      const dl = want.length();
      if (dl > 0.01) want.multiplyScalar(Math.min(k.speed, dl * 0.6) / dl);
      // part around the wanderer's light
      const away = f.p.clone().sub(orb);
      const ad = away.length();
      if (ad < 2.5 + k.length * 0.5) want.addScaledVector(away.normalize(), (2.5 + k.length * 0.5 - ad) * 1.5);
      f.v.lerp(want, Math.min(1, dt * 0.8));
      f.p.addScaledVector(f.v, dt);
      const floor = heightAt(f.p.x, f.p.z);
      f.p.y = Math.min(WATER_Y - 0.6 - k.length * 0.15, Math.max(floor + 0.4 + k.length * 0.2, f.p.y));
      f.obj.position.copy(f.p);
      if (f.v.lengthSq() > 1e-4) f.obj.lookAt(this.look.copy(f.p).add(f.v));
      if (far < 60) f.mixer.update(reduced ? dt * 0.5 : dt * (0.6 + Math.min(1.2, f.v.length() / k.speed)));
    }
  }
}
