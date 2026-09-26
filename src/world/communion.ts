/* Stillness. When the wanderer stops and stays still, it turns inward: head bowed, hands
   together before the heart (wanderer.ts). Then:
   1. Its aura breathes out as a luminous gas: soft, pale veils of light that billow, curl and
      rise around the body. No shell or edge; it thins into the night like moonlit mist.
   2. Streams of light arrive: long, soft brush-strokes of light that wind in from the things
      around (trees, crystals, the archetypes) toward the heart, and a few that flow out from it
      into the world. Slow swells of light travel along them, like breath. They are smooth and
      unbroken, and they melt into the aura before they reach the body.
   3. Then everything connects to everything: strokes weave between the things themselves, and
      the network of roots under the ground lights up.
   The moment the wanderer moves, it all dissolves. */
import * as THREE from "three/webgpu";
import { gpuUniforms, softPoints, spriteCloud, T, viewDepth, type N } from "../gpu/tsl";

const {
  attribute, cameraPosition, clamp, cos, cross, distance, dot, exp, float, floor, Fn, fract, max, min, mix, normalize, pointUV, positionLocal,
  pow, sin, smoothstep, uniform, varying, vec2, vec3, vec4,
} = T;

const SEG = 36;
interface Stroke {
  pts: THREE.Vector3[]; // control points of a winding path
  delay: number; // seconds after stillness begins
  kind: 0 | 1 | 2; // 0: in toward the heart; 1: out from it; 2: between the things themselves
  hue: number;
}

const gH = (p: N): N => fract(sin(dot(p, vec2(127.1, 311.7))).mul(43758.5453));
const gN = Fn(([p]: N[]) => {
  const i = floor(p), f0 = fract(p), f = f0.mul(f0).mul(float(3).sub(f0.mul(2)));
  return mix(mix(gH(i), gH(i.add(vec2(1, 0))), f.x), mix(gH(i.add(vec2(0, 1))), gH(i.add(vec2(1, 1))), f.x), f.y);
});

export class Communion {
  group = new THREE.Group();
  private gas: THREE.Sprite;
  private strokes: THREE.Mesh;
  private uni = { uT: uniform(0), uAge: uniform(0), uK: uniform(0), uOpen: uniform(0), uHeart: uniform(new THREE.Vector3()), uPx: uniform(600) };
  private built = false;
  private age = 0;

  constructor(gasCount = 150) {
    const U = this.uni;
    // the gas: many large, soft puffs, each drifting on its own slow spiral around the body
    {
      const mat = softPoints();
      const cloud = spriteCloud(gasCount, { aSeed: 4 }, mat);
      const seed = cloud.attrs.aSeed.array as Float32Array;
      for (let i = 0; i < gasCount * 4; i++) seed[i] = Math.random();
      const aSeed = cloud.nodes.aSeed;
      // a life cycle: born near the body, billowing slowly outward and upward, fading away
      const life = fract(U.uT.mul(aSeed.w.mul(0.035).add(0.035)).add(aSeed.x));
      const ang = aSeed.y.mul(6.2832).add(U.uT.mul(aSeed.z.mul(0.12).add(0.1)).mul(aSeed.w.greaterThan(0.5).select(1, -1))).add(life.mul(1.6));
      const r = life.mul(aSeed.z.mul(1.8).add(0.7)).add(0.3).mul(U.uOpen.mul(0.65).add(0.35));
      const y = aSeed.z.sub(0.45).mul(1.5).add(life.mul(aSeed.y.mul(1.3).add(1)).mul(U.uOpen));
      const py0 = U.uHeart.y.add(y);
      const px = U.uHeart.x.add(cos(ang).mul(r)).add(sin(U.uT.mul(0.5).add(aSeed.x.mul(20)).add(py0)).mul(0.22).mul(life));
      // a puff never reaches into the ground, where the ground would cut it off in a hard line
      const feet = U.uHeart.y.sub(1.15);
      const p = vec3(px, max(py0, feet.add(0.4)), U.uHeart.z.add(sin(ang).mul(r).mul(0.85)));
      mat.positionNode = p;
      const size = min(aSeed.w.mul(1.1).add(0.7).mul(life.mul(1.3).add(0.7)), p.y.sub(feet).mul(1.9));
      mat.sizeNode = clamp(size.mul(U.uPx).div(max(viewDepth(p), 0.5)), 2, 240).div(gpuUniforms.dpr);
      const vA = sin(life.mul(3.14159)).mul(U.uK).mul(aSeed.x.mul(0.012).add(0.01));
      // pale light, never smoke: warm pearl near the heart, cooling to moonlit lavender as it rises
      const vC = mix(vec3(1.0, 0.9, 0.74), vec3(0.74, 0.8, 1.0), clamp(life.mul(0.8).add(aSeed.z.mul(0.3)), 0, 1)).mul(1.25);
      mat.colorNode = Fn(() => {
        const q = pointUV.sub(0.5), r2 = dot(q, q).mul(4);
        // veils: a soft puff shaped by broad, slowly curling noise, so it reads as mist, not a ball
        const w = q.mul(1.6).add(aSeed.xy.mul(17));
        const f = gN(w.add(vec2(U.uT.mul(0.06), 0))).mul(0.75).add(gN(w.mul(2.1).sub(vec2(0, U.uT.mul(0.09)))).mul(0.25));
        const a = exp(r2.mul(-3)).mul(float(1).sub(smoothstep(0.5, 1, r2))).mul(smoothstep(0.3, 0.85, f));
        return vec4(vC.mul(a).mul(vA), 1);
      })();
      this.gas = cloud.sprite;
      this.gas.renderOrder = 11;
    }

    {
      const mat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, fog: false });
      const aTan = attribute("aTan", "vec3"), aInfo = attribute("aInfo", "vec4"); // side (-1..1), u along (0..1), delay, kind
      const aStyle = attribute("aStyle", "vec2"); // hue, width
      const P = positionLocal;
      const side = normalize(cross(aTan, cameraPosition.sub(P)));
      // a soft brush: it swells gently in the middle and lifts off at both ends
      const press = pow(sin(aInfo.y.mul(3.14159)), 0.7);
      const camD = distance(P, cameraPosition);
      // never thinner than a few pixels, so a far stroke stays a smooth line instead of breaking
      // into dashes; what it gains in width it gives back in light
      const w = aStyle.y.mul(press), wMin = camD.mul(3).div(U.uPx);
      const vThin = varying(w.div(max(w, wMin)));
      mat.positionNode = P.add(side.mul(aInfo.x).mul(max(w, wMin)));
      // a stroke that would pass between the camera and the wanderer fades there
      const ab = U.uHeart.sub(cameraPosition);
      const t = clamp(dot(P.sub(cameraPosition), ab).div(max(dot(ab, ab), 1e-3)), 0, 0.85);
      const vClear = varying(smoothstep(0.5, 1.8, distance(P, cameraPosition.add(ab.mul(t)))));
      const vCam = varying(camD);
      const vUv = varying(aInfo.xy), vKind = varying(aInfo.w), vDelay = varying(aInfo.z), vStyle = varying(aStyle);
      mat.colorNode = Fn(() => {
        // each stroke is drawn out slowly from where it starts, with a soft front
        const grow = clamp(U.uAge.sub(vDelay).div(2.6), 0, 1).mul(1.15);
        const isIn = vKind.lessThan(0.5), isOut = vKind.greaterThan(0.5).and(vKind.lessThan(1.5));
        const u = isOut.select(float(1).sub(vUv.y), vUv.y); // "in" strokes travel toward the heart, "out" ones away
        const front = float(1).sub(smoothstep(grow.sub(0.12), grow, u));
        // at the heart the stroke dissolves into the aura, so nothing converges on the body
        const atHeart = isIn.select(vUv.y, isOut.select(float(1).sub(vUv.y), float(0)));
        const melt = float(1).sub(smoothstep(0.62, 0.97, atHeart));
        // a smooth, unbroken body of light: a bright core in a soft glow, no texture to shimmer
        const x = vUv.x;
        const body = exp(x.mul(x).mul(-9)).add(exp(x.mul(x).mul(-2.2)).mul(0.3));
        // slow swells of light travel along it, like breath
        const speed = vStyle.x.mul(0.05).add(0.07);
        const wave = sin(u.mul(1.7).sub(U.uT.mul(speed)).sub(vStyle.x.mul(3)).mul(6.2832)).mul(0.5).add(0.5);
        const flow = wave.mul(wave).mul(wave).mul(0.7).add(0.3);
        // each stroke its own soft hue, turning to warm gold as it nears the heart
        const hue = cos(vec3(vStyle.x).add(vec3(0, 0.33, 0.67)).mul(6.2832)).mul(0.5).add(0.5);
        const c = mix(mix(hue, vec3(0.95, 0.93, 1.0), 0.6), vec3(1.0, 0.86, 0.62), smoothstep(0.3, 0.9, atHeart));
        const a = body.mul(front).mul(melt).mul(flow).mul(vThin).mul(0.5).mul(U.uK)
          .mul(smoothstep(3, 11, vCam)).mul(vClear); // never a stroke across the lens, or across the wanderer
        return vec4(c.mul(a), 1);
      })();
      this.strokes = new THREE.Mesh(new THREE.BufferGeometry(), mat);
    }
    this.strokes.frustumCulled = false;
    this.strokes.renderOrder = 11;
    this.group.add(this.gas, this.strokes);
    this.group.visible = false;
  }

  /** A winding path from a to b: it sways side to side and rises and dips, like a hand-drawn
      stroke, never a straight ray. */
  private path(a: THREE.Vector3, b: THREE.Vector3, lift: number, wander: number): THREE.Vector3[] {
    const d = a.distanceTo(b);
    const dir = b.clone().sub(a).normalize();
    const side = new THREE.Vector3(-dir.z, 0, dir.x).normalize();
    const pts = [a.clone()];
    const n = 5;
    const phase = Math.random() * Math.PI * 2, sway = (0.18 + Math.random() * 0.2) * wander * d;
    for (let k = 1; k < n; k++) {
      const u = k / n;
      const p = a.clone().lerp(b, u);
      p.addScaledVector(side, Math.sin(u * Math.PI * 2 + phase) * sway * Math.sin(u * Math.PI));
      p.y += Math.sin(u * Math.PI) * (lift + d * 0.12) + Math.sin(u * Math.PI * 3 + phase) * d * 0.05;
      pts.push(p);
    }
    pts.push(b.clone());
    return pts;
  }

  private build(heart: THREE.Vector3, things: THREE.Vector3[]): void {
    const near = things
      .map((p) => [p, p.distanceTo(heart)] as const)
      .filter(([, d]) => d > 2 && d < 55)
      .sort((a, b) => a[1] - b[1])
      .slice(0, 8)
      .map(([p]) => p);
    const list: Stroke[] = [];
    near.forEach((p, i) => list.push({ pts: this.path(p, heart, 0.8, 0.6), delay: 1.0 + i * 0.35, kind: 0, hue: Math.random() }));
    // strokes flowing out from the heart into the open world, curling away
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + Math.random() * 0.6, r = 12 + Math.random() * 20;
      const end = heart.clone().add(new THREE.Vector3(Math.cos(a) * r, 3 + Math.random() * 7, Math.sin(a) * r));
      list.push({ pts: this.path(heart, end, 1.5, 0.9), delay: 2.5 + i * 0.5, kind: 1, hue: Math.random() });
    }
    const seen = new Set<string>();
    near.forEach((p, i) => {
      near
        .map((q, j) => [j, q.distanceTo(p)] as const)
        .filter(([j]) => j !== i)
        .sort((x, y) => x[1] - y[1])
        .slice(0, 1)
        .forEach(([j], n) => {
          const key = i < j ? `${i}-${j}` : `${j}-${i}`;
          if (seen.has(key)) return;
          seen.add(key);
          list.push({ pts: this.path(p, near[j], 1, 0.8), delay: 1.0 + near.length * 0.35 + 1.5 + (i + n) * 0.3, kind: 2, hue: Math.random() });
        });
    });
    const pos: number[] = [], tan: number[] = [], info: number[] = [], style: number[] = [], idx: number[] = [];
    for (const s of list) {
      const curve = new THREE.CatmullRomCurve3(s.pts, false, "centripetal");
      const width = s.kind === 1 ? 0.2 : s.kind === 0 ? 0.24 : 0.16; // half-width, glow included
      const base = pos.length / 3;
      for (let k = 0; k <= SEG; k++) {
        const u = k / SEG;
        const p = curve.getPoint(u), t = curve.getTangent(u);
        for (const sd of [-1, 1]) {
          pos.push(p.x, p.y, p.z);
          tan.push(t.x, t.y, t.z);
          info.push(sd, u, s.delay, s.kind);
          style.push(s.hue, width);
        }
        if (k < SEG) {
          const v = base + k * 2;
          idx.push(v, v + 2, v + 1, v + 1, v + 2, v + 3);
        }
      }
    }
    // a fresh geometry each time (the GPU buffers are sized once per geometry)
    this.strokes.geometry.dispose();
    const g = (this.strokes.geometry = new THREE.BufferGeometry());
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("aTan", new THREE.Float32BufferAttribute(tan, 3));
    g.setAttribute("aInfo", new THREE.Float32BufferAttribute(info, 4));
    g.setAttribute("aStyle", new THREE.Float32BufferAttribute(style, 2));
    g.setIndex(idx);
  }

  /** `k`: 0–1 stillness. `heart`: the wanderer's heart. `things`: what can be connected. */
  update(t: number, dt: number, k: number, heart: THREE.Vector3, _feet: THREE.Vector3, things: () => THREE.Vector3[], pxPerUnit = 600): void {
    this.group.visible = k > 0.002;
    this.uni.uT.value = t;
    this.uni.uK.value = k;
    this.uni.uPx.value = pxPerUnit;
    this.uni.uHeart.value.copy(heart);
    if (k > 0.05 && !this.built) {
      this.built = true;
      this.age = 0;
      this.build(heart.clone(), things());
    }
    if (k < 0.01) this.built = false;
    if (!this.group.visible) return;
    this.age += dt;
    this.uni.uAge.value = this.age;
    this.uni.uOpen.value = 1 - Math.exp(-this.age * 0.6);
  }
}
