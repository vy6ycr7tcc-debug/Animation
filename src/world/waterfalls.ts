/* The waterfalls (terrain.ts WATERFALLS shapes their land: an escarpment with a stream along it, a
   cliff curving round a plunge pool; a tiered fall a ledge with its own pool between two drops).
   Here the water itself, after how falling water looks and moves:
   - the river from its spring pool on a hill head, meandering down to the lip and quickening
     toward it (terrain.ts `fallRiver`);
   - each drop's curtain on the real arc of water leaving a lip (carried on a little, then falling
     ever faster): glassy where it slides over the edge, a bright line where it bends, then
     whitening into strands that pull apart as they fall, the edges ragged; a fainter sheet behind
     it for depth. Its pattern rides the water (the uv runs in time), so it falls faster as it goes;
   - at its foot white water boiling in a ring, foam carried away over the pool, spray thrown up and
     out in arcs, mist rising off the boil and rolling out low over the water and down the wind;
   - a tiered fall's ledge pool between its two drops.
   All moonlit and quiet: the brightest white stays under bloom's threshold; nothing is mirrored.
   Each fall is drawn within ~800 m, its spray and mist within 300 m. */
import * as THREE from "three/webgpu";
import { vnoise as gN, fogUniforms, gpuUniforms, nearLens, outOfTheWay, pointR, softDot, softPoints, spriteCloud, T, viewDepth } from "../gpu/tsl";
import { skyUniforms } from "./sky";
import { fallDrops, fallLedge, fallRiverU, fallRiverW, fallRiverY, fallSource, fallStream, WATERFALLS, type Fall, type FallDrop } from "./terrain";

const { attribute, clamp, cos, exp, float, Fn, fract, length, max, min, mix, sin, smoothstep, uv, vec2, vec3, vec4 } = T;

const G = 9.8;

function at(f: Fall, s: number, u: number, y: number): THREE.Vector3 {
  return new THREE.Vector3(f.x + f.dx * s - f.dz * u, y, f.z + f.dz * s + f.dx * u);
}

/** The arc a drop's water takes: how long it falls, how fast it leaves the lip, how far out it lands. */
function arc(f: Fall, d: FallDrop): { fallT: number; v0: number; out: number } {
  const fallT = Math.sqrt((2 * Math.max(1, d.from - d.to)) / G);
  const v0 = 1.3 + 0.35 * f.w + (f.kind === "great" ? 0.5 : 0);
  return { fallT, v0, out: 0.25 + v0 * fallT };
}

/** A drop's falling sheet: the brink (the stream sliding over the edge), then the arc down to the
    water below, widening and bowing as it falls. `aFall`: the time it takes to fall, a seed, its
    width at the lip (m), and 1 for the fainter sheet behind. */
function curtainGeometry(f: Fall, d: FallDrop, back: boolean): THREE.BufferGeometry {
  const { fallT, v0 } = arc(f, d);
  const NU = Math.max(6, Math.round(f.w * 4)), NV = 36, NB = 4;
  const pos: number[] = [], uvs: number[] = [], fa: number[] = [], idx: number[] = [];
  const seed = (f.seed + d.lip * 0.37 + (back ? 13.1 : 0)) % 97;
  for (let j = -NB; j <= NV; j++) {
    let s: number, y: number, v: number, half: number;
    if (j < 0) {
      const k = j / NB; // the brink, on the stream's surface just before the edge
      s = d.lip + 0.25 + k * 1.6;
      y = d.from + 0.02;
      v = k * 0.06;
      half = f.w;
    } else {
      const tau = j / NV, tt = tau * fallT;
      s = d.lip + 0.25 + v0 * tt;
      y = j === NV ? d.to - 0.12 : d.from - 0.5 * G * tt * tt;
      v = tau;
      half = f.w * (1 + 0.22 * tau) + 0.12 * tau;
    }
    for (let i = 0; i <= NU; i++) {
      const xn = (i / NU) * 2 - 1;
      const bow = j > 0 ? 0.16 * f.w * (1 - xn * xn) * v : 0;
      const sb = s + bow - (back ? 0.32 + 0.25 * Math.max(0, v) : 0);
      pos.push(...at(f, sb, xn * half * (back ? 0.9 : 1), y).toArray());
      uvs.push(i / NU, v);
      fa.push(fallT, seed, 2 * f.w, back ? 1 : 0);
    }
  }
  for (let j = 0; j < NV + NB; j++)
    for (let i = 0; i < NU; i++) {
      const a = j * (NU + 1) + i, b = a + NU + 1;
      idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  g.setAttribute("aFall", new THREE.Float32BufferAttribute(fa, 4));
  g.setIndex(idx);
  return g;
}

/** Running water: a strip from `s0` down to `s1` (the lip), following the fall's river where it
    has one (its middle, width and falling level), else straight at `y` and half-width `w`. Its uv:
    across (0–1), and the water's travel time (s) from the strip's head, so the ripples ride the
    water at its own speed (slow up the river, quickening over the last ~22 m to the lip) and
    never bunch up as the clock runs. `aRiv.x`: how near the lip (0–1). */
function waterGeometry(f: Fall, s0: number, s1: number, y: number | null, w: number | null): THREE.BufferGeometry {
  const NS = Math.max(12, Math.ceil((s1 - s0) / 2));
  const pos: number[] = [], uvs: number[] = [], riv: number[] = [], idx: number[] = [];
  const st = fallStream(f);
  let tau = 0, prev = s0;
  for (let j = 0; j <= NS; j++) {
    const s = s0 + ((s1 - s0) * j) / NS;
    const v = 0.8 + 1.8 * THREE.MathUtils.smoothstep(s, s1 - 22, s1);
    tau += (s - prev) / v;
    prev = s;
    const { u, du } = y === null ? fallRiverU(f, s) : { u: 0, du: 0 };
    const n = Math.sqrt(1 + du * du);
    // the river's water reaches over its bed and up onto the banks, where the land takes its edge
    const half = w ?? fallRiverW(f, Math.min(s, st)) + 2.6 * (1 - THREE.MathUtils.smoothstep(s, s1 - 30, s1 - 4));
    const yy = y ?? fallRiverY(f, s);
    for (const side of [-1, 1]) {
      pos.push(...at(f, s - (du / n) * half * side, u + (half * side) / n, yy).toArray());
      uvs.push(side < 0 ? 0 : 1, tau);
      riv.push(THREE.MathUtils.smoothstep(s, s1 - 26, s1), 0);
    }
  }
  for (let j = 0; j < NS; j++) {
    const a = j * 2;
    // wound to face up (the old stream's faced down, and was never seen from above)
    idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  g.setAttribute("aRiv", new THREE.Float32BufferAttribute(riv, 2));
  g.setIndex(idx);
  return g;
}

interface Each {
  f: Fall;
  g: THREE.Group;
  near: THREE.Group; // spray and mist: only up close
  base: THREE.Vector3;
  size: number;
}

export class Waterfalls {
  group = new THREE.Group();
  /** How near the nearest fall is (0–1), for its sound. */
  roar = 0;
  private each: Each[] = [];

  constructor(mobile: boolean) {
    const t = skyUniforms.uT;
    const deep = vec3(0.05, 0.085, 0.11);
    // the white of falling water takes the night's light: pale, with a little of the air's glow
    const white = mix(vec3(0.6, 0.66, 0.72), fogUniforms.glow.mul(0.85), 0.22);

    const curtainMat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide });
    curtainMat.colorNode = Fn(() => {
      const p = uv();
      const v = p.y, vc = clamp(v, 0, 1);
      const fa = attribute("aFall", "vec4");
      const fallT = fa.x, seed = fa.y, W = fa.z, back = fa.w;
      // the pattern rides the water: it moves through the fall in the time the water takes
      const flow = v.sub(t.div(fallT));
      const cx = p.x.mul(W);
      const streak = gN(vec2(cx.mul(2.4).add(seed), flow.mul(5.5))).mul(0.5)
        .add(gN(vec2(cx.mul(6.1).sub(seed), flow.mul(12))).mul(0.32))
        .add(gN(vec2(cx.mul(15).add(seed.mul(2)), flow.mul(26))).mul(0.18));
      // strands that pull apart as the water falls, gaps opening between them
      const strand = gN(vec2(cx.mul(0.9).add(seed.mul(3)), flow.mul(1.6)));
      const gapAt = vc.mul(0.5);
      const body = smoothstep(gapAt.sub(0.05), gapAt.add(0.12), strand.add(0.18));
      // glassy where it leaves the lip, whitening as it falls
      const foam = smoothstep(0.42, 0.86, streak.mul(0.85).add(vc.mul(0.5)));
      // a thin bright line where the water bends over the edge
      const brink = exp(v.mul(v).mul(-1600)).mul(0.35);
      // ragged edges, flickering down the fall
      const ex = min(p.x, float(1).sub(p.x));
      const edgeN = gN(vec2(p.x.greaterThan(0.5).select(float(7.3), float(1.9)).add(seed), flow.mul(3)));
      const edge = smoothstep(0, float(0.06).add(vc.mul(0.16)).add(edgeN.mul(0.1)), ex);
      const col = mix(deep, white, foam.mul(0.9).add(0.06)).add(white.mul(brink));
      const foot = smoothstep(1.0, 0.9, v);
      const a = mix(float(0.5), float(0.92), foam).mul(body).mul(edge).mul(foot).mul(mix(float(1), float(0.45), back));
      return vec4(col.mul(mix(float(1), float(0.7), back)), a);
    })();

    const streamMat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false });
    streamMat.colorNode = Fn(() => {
      const p = uv();
      const k = attribute("aRiv", "vec2").x;
      // ripples carried on the water (its travel time less the clock), whitening over the last metres
      const flow = p.y.sub(t).mul(1.05);
      const r = gN(vec2(p.x.mul(8).add(sin(flow.mul(0.3)).mul(0.6)), flow.mul(1.6)));
      const r2 = gN(vec2(p.x.mul(19).sub(1.7), flow.mul(3.7).add(5)));
      const glint = smoothstep(0.7, 0.95, r.mul(0.6).add(r2.mul(0.4))).mul(0.28).add(smoothstep(0.75, 1, k).mul(smoothstep(0.35, 0.8, r)).mul(0.5));
      const edge = smoothstep(0, 0.2, p.x).mul(smoothstep(1, 0.8, p.x));
      return vec4(mix(deep.mul(0.62), white, glint), edge.mul(0.9));
    })();

    // the boil and the foam on the pool, in the fall's own frame (uv.y downstream): white water
    // churning where it lands, rings spreading, foam carried away over the water
    const foamMat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false });
    foamMat.colorNode = Fn(() => {
      const L = attribute("aFoam", "vec2"); // the patch's size (m), the boil's radius (m)
      const q = uv().sub(vec2(0.5, 0.22)).mul(L.x);
      const r = length(q);
      const a = T.atan(q.y, q.x);
      const boil = smoothstep(L.y.mul(1.5), L.y.mul(0.4), r).mul(smoothstep(0.3, 0.75, gN(vec2(a.mul(3).add(t.mul(0.6)), r.mul(2.2).sub(t.mul(2.4)))).add(0.25)));
      const rings = gN(vec2(a.mul(2.5), r.mul(1.1).sub(t.mul(0.8)))).mul(0.6).add(gN(vec2(a.mul(7).add(3), r.mul(2.6).sub(t.mul(1.2)))).mul(0.4));
      const ring = smoothstep(0.42, 0.78, rings).mul(smoothstep(L.x.mul(0.42), L.y, r));
      // foam lines carried downstream, drawing out as they go
      const drift = gN(vec2(q.x.mul(0.7).add(sin(q.y.mul(0.2)).mul(0.6)), q.y.mul(0.32).sub(t.mul(0.45))));
      const away = smoothstep(0.6, 0.85, drift).mul(smoothstep(L.y.negate(), L.y, q.y)).mul(smoothstep(L.x.mul(0.62), L.x.mul(0.2), r));
      const k = max(boil, max(ring.mul(0.8), away.mul(0.6)));
      return vec4(white.mul(0.92), k.mul(0.66).mul(smoothstep(0.5, 0.44, length(uv().sub(0.5)))));
    })();

    // a tiered fall's ledge pool: still dark water (the foam patch lies over it)
    const ledgeMat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false });
    ledgeMat.colorNode = Fn(() => {
      const r = length(uv().sub(0.5)).mul(2);
      return vec4(deep.mul(0.8).add(fogUniforms.glow.mul(0.05)), smoothstep(1, 0.8, r).mul(0.92));
    })();

    // spray: droplets thrown up and out from the foot in arcs, slowed by the air, falling back
    const spray = (base: THREE.Vector3, f: Fall, n: number, power: number) => {
      const m = softPoints();
      const cloud = spriteCloud(n, { aSeed: 4 }, m);
      const seed = cloud.attrs.aSeed.array as Float32Array;
      for (let i = 0; i < seed.length; i++) seed[i] = Math.random();
      const sd = cloud.nodes.aSeed;
      const life = sd.w.mul(0.9).add(0.6);
      const age = fract(t.div(life).add(sd.x)).mul(life);
      const across = sd.y.mul(2).sub(1).mul(f.w * 1.1);
      const ang = sd.z.mul(2).sub(1).mul(1.25);
      const hx = float(f.dx).mul(cos(ang)).sub(float(f.dz).mul(sin(ang)));
      const hz = float(f.dz).mul(cos(ang)).add(float(f.dx).mul(sin(ang)));
      const vh = sd.w.mul(3.4).add(1.4).mul(power);
      const vz = fract(sd.z.mul(7.31)).mul(3.6).add(1.6).mul(power);
      const K = 1.5;
      const drag = float(1).sub(exp(age.mul(-K))).div(K);
      const up = vz.add(G / K).mul(drag).sub(age.mul(G / K));
      const pos = vec3(
        float(base.x).add(float(-f.dz).mul(across)).add(hx.mul(vh).mul(drag)),
        float(base.y).add(up),
        float(base.z).add(float(f.dx).mul(across)).add(hz.mul(vh).mul(drag)),
      );
      m.positionNode = pos;
      const size = age.mul(0.09).add(0.05);
      m.sizeNode = clamp(size.mul(gpuUniforms.px).div(max(viewDepth(pos), 0.5)), 1.2, 26).div(gpuUniforms.dpr);
      const fade = sin(age.div(life).mul(Math.PI)).mul(smoothstep(-0.05, 0.12, up));
      const k = fade.mul(0.32).mul(nearLens()).mul(outOfTheWay(pos));
      m.colorNode = Fn(() => vec4(vec3(0.66, 0.72, 0.78).mul(softDot(pointR())).mul(k), 1))();
      cloud.sprite.renderOrder = 13;
      return cloud.sprite;
    };

    // mist: some rising off the boil and drifting down the wind, some rolling out low over the water
    const mist = (base: THREE.Vector3, f: Fall, n: number, height: number) => {
      const m = softPoints();
      const cloud = spriteCloud(n, { aSeed: 4 }, m);
      const seed = cloud.attrs.aSeed.array as Float32Array;
      for (let i = 0; i < seed.length; i++) seed[i] = Math.random();
      const sd = cloud.nodes.aSeed;
      const low = sd.w.lessThan(0.45); // rolling out low over the water, else rising off the boil
      const life = low.select(sd.w.mul(8).add(10), sd.w.mul(6).add(7));
      const age = fract(t.div(life).add(sd.x));
      const ang = sd.y.mul(6.2832);
      const out = low.select(age.mul(f.w * 2 + 6).add(sd.z.mul(2)), sd.z.mul(1.4).add(0.3).add(age.mul(2.4)));
      const rise = low.select(age.mul(0.8).add(0.25), age.mul(sd.z.mul(0.6).add(0.4)).mul(height));
      const wind = age.mul(age).mul(low.select(float(3), float(7)));
      const sway = sin(t.mul(0.3).add(sd.x.mul(30))).mul(0.6);
      const p = vec3(
        float(base.x).add(cos(ang).mul(out)).add(float(f.dx).mul(wind)).add(float(-f.dz).mul(sway)),
        float(base.y).add(rise),
        float(base.z).add(sin(ang).mul(out)).add(float(f.dz).mul(wind)).add(float(f.dx).mul(sway)),
      );
      m.positionNode = p;
      const r = low.select(age.mul(3.6).add(2.2), age.mul(2.8).add(1.0)).mul(Math.min(1.6, 0.7 + f.w * 0.25));
      m.sizeNode = clamp(r.mul(gpuUniforms.px).div(max(viewDepth(p), 0.5)), 2, 260).div(gpuUniforms.dpr);
      const k = sin(age.mul(Math.PI)).mul(low.select(float(0.07), float(0.09))).mul(nearLens()).mul(outOfTheWay(p));
      // mist, not beads: a broad soft cloud with no bright core, torn at its edges into wisps
      m.colorNode = Fn(() => {
        const r = pointR();
        const wisp = gN(T.pointUV.mul(3.2).add(vec2(sd.x.mul(40), sd.y.mul(40).add(t.mul(0.06)))));
        const puff = exp(r.mul(r).mul(-2.6)).mul(smoothstep(1, 0.55, r)).mul(wisp.mul(0.9).add(0.25));
        return vec4(vec3(0.62, 0.68, 0.76).mul(puff).mul(k), 1);
      })();
      cloud.sprite.renderOrder = 12;
      return cloud.sprite;
    };

    for (const f of WATERFALLS) {
      const g = new THREE.Group(), near = new THREE.Group();
      const drops = fallDrops(f);
      const yaw = Math.atan2(-f.dx, -f.dz); // a plane's uv.y downstream
      // the river from its spring pool on the hill head down to the first lip (or, with no river,
      // the stream from its spring)
      if (f.rl > 0) {
        g.add(new THREE.Mesh(waterGeometry(f, fallSource(f), drops[0].lip + 0.3, null, null), streamMat));
        const sf = fallSource(f), su = fallRiverU(f, sf).u;
        const spring = new THREE.Mesh(new THREE.CircleGeometry(fallRiverW(f, sf) * 2.1 + 3.2, 40).rotateX(-Math.PI / 2), ledgeMat);
        spring.position.copy(at(f, sf, su, fallRiverY(f, sf) + 0.01));
        g.add(spring);
      } else g.add(new THREE.Mesh(waterGeometry(f, fallStream(f), drops[0].lip + 0.3, drops[0].from, f.w * 0.75 + 0.7), streamMat));
      // a tiered fall: its ledge, a pool where the upper water lands, a lane on to the lower lip
      if (f.mid > 0) {
        const L = fallLedge(f);
        g.add(new THREE.Mesh(waterGeometry(f, L + 0.6, drops[1].lip + 0.3, drops[0].to + 0.005, f.w + 0.4), streamMat));
        const pool = new THREE.Mesh(new THREE.CircleGeometry(f.w + 2.6, 40).rotateX(-Math.PI / 2), ledgeMat);
        pool.position.copy(at(f, L + 2.5, 0, drops[0].to + 0.01));
        g.add(pool);
      }
      let base = new THREE.Vector3(), size = 0;
      drops.forEach((d, k) => {
        const front = new THREE.Mesh(curtainGeometry(f, d, false), curtainMat);
        const back = new THREE.Mesh(curtainGeometry(f, d, true), curtainMat);
        front.renderOrder = 4;
        back.renderOrder = 3;
        g.add(back, front);
        const { out } = arc(f, d);
        const land = at(f, d.lip + out, 0, d.to + 0.04);
        // the boil and the foam where it lands (the lower pool's patch reaches on downstream)
        const last = k === drops.length - 1;
        const span = last ? 12 + f.w * 6 : 5 + f.w * 3;
        const foamGeo = new THREE.PlaneGeometry(span, span).rotateX(-Math.PI / 2);
        const fv = new Float32Array(foamGeo.attributes.position.count * 2);
        for (let i = 0; i < fv.length; i += 2) (fv[i] = span), (fv[i + 1] = 0.8 + f.w * 0.9);
        foamGeo.setAttribute("aFoam", new THREE.BufferAttribute(fv, 2));
        const foam = new THREE.Mesh(foamGeo, foamMat);
        foam.position.copy(land).add(new THREE.Vector3(f.dx, 0, f.dz).multiplyScalar(span * 0.28));
        foam.rotation.y = yaw;
        foam.renderOrder = 2;
        g.add(foam);
        const H = d.from - d.to, power = Math.min(1.5, 0.6 + H / 30);
        near.add(spray(land, f, Math.round((mobile ? 90 : 160) * Math.min(1.8, 0.6 + f.w * 0.35) * (last ? 1 : 0.6)), power));
        near.add(mist(land, f, Math.round((mobile ? 50 : 90) * Math.min(1.6, 0.6 + f.w * 0.3) * (last ? 1 : 0.5)), Math.min(14, 2 + H * 0.35)));
        if (last) (base = land), (size = H);
      });
      g.add(near);
      g.traverse((o) => ((o as THREE.Mesh).frustumCulled = false));
      this.group.add(g);
      this.each.push({ f, g, near, base, size: Math.max(size, f.top) });
    }
  }

  /** Each is drawn within ~800 m (spray and mist within 300 m); `roar` follows the nearest,
      the great falls heard from farther. */
  update(pos: THREE.Vector3, hidden: boolean): void {
    let roar = 0;
    for (const e of this.each) {
      const d = Math.hypot(pos.x - e.base.x, pos.z - e.base.z);
      e.g.visible = !hidden && d < 650 + e.size * 6;
      e.near.visible = e.g.visible && d < 300;
      const reach = 110 + e.size * 2.5;
      if (!hidden) roar = Math.max(roar, THREE.MathUtils.clamp(1 - (d - 12) / reach, 0, 1) ** 1.6 * Math.min(1, 0.65 + e.size / 60));
    }
    this.roar = roar;
  }

  /** Where each falls, its name (by its kind) and where to stand on arriving (the plunge pool's
      edge, looking up at the water). */
  get list(): { f: Fall; name: string; view: { x: number; z: number; heading: number } }[] {
    return this.each.map(({ f }) => {
      const p = at(f, 22 * f.sc, 7, 0);
      const name = f.kind === "great" ? "The great falls" : f.kind === "tiered" ? "The stepped falls" : f.kind === "ribbon" ? "A ribbon fall" : "A waterfall";
      return { f, name, view: { x: p.x, z: p.z, heading: Math.atan2(f.x - p.x, f.z - p.z) } };
    });
  }
}

