/* The waterfalls (terrain.ts WATERFALLS shapes their land: a raised shelf with a stream along it, a
   cliff, a plunge pool below). Here the water itself: the stream running along its bed to the lip,
   the curtain falling from the lip into the pool in a slight outward arc, streaked and foaming as it
   falls, a ring of foam spreading where it lands, and mist rising off it. All moonlit and quiet:
   nothing bright enough to bloom, nothing mirrored. Each is drawn within ~700 m. */
import * as THREE from "three/webgpu";
import { vnoise as gN, gpuUniforms, nearLens, outOfTheWay, pointR, softDot, softPoints, spriteCloud, T, viewDepth } from "../gpu/tsl";
import { skyUniforms } from "./sky";
import { FALL_LIP, FALL_STREAM, WATERFALLS, WATER_Y, type Fall } from "./terrain";

const { clamp, float, Fn, length, max, mix, sin, smoothstep, uv, vec2, vec3, vec4 } = T;

const LIP_DROP = 0.45; // the water's surface below the shelf's top at the lip
const CURTAIN_OUT = 3.4; // how far out from the lip the curtain lands

function at(f: Fall, s: number, u: number, y: number): THREE.Vector3 {
  return new THREE.Vector3(f.x + f.dx * s - f.dz * u, y, f.z + f.dz * s + f.dx * u);
}

/** The falling sheet: a grid from the lip down to the pool, widening as it falls. */
function curtainGeometry(f: Fall): THREE.BufferGeometry {
  const NU = 8, NV = 28;
  const pos: number[] = [], uvs: number[] = [], idx: number[] = [];
  const y0 = f.top - LIP_DROP;
  for (let j = 0; j <= NV; j++) {
    const v = j / NV;
    const s = FALL_LIP + 0.25 + CURTAIN_OUT * Math.pow(v, 1.6);
    const y = y0 + (WATER_Y - 0.2 - y0) * v;
    const w = 1.6 + 1.2 * v;
    for (let i = 0; i <= NU; i++) {
      const u = (i / NU - 0.5) * 2 * w;
      pos.push(...at(f, s, u, y).toArray());
      uvs.push(i / NU, v);
    }
  }
  for (let j = 0; j < NV; j++)
    for (let i = 0; i < NU; i++) {
      const a = j * (NU + 1) + i, b = a + NU + 1;
      idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** The stream: a strip along its bed from the spring to the lip, just under the shelf's top. */
function streamGeometry(f: Fall): THREE.BufferGeometry {
  const NS = 40, w = 1.85;
  const pos: number[] = [], uvs: number[] = [], idx: number[] = [];
  const y = f.top - LIP_DROP;
  for (let j = 0; j <= NS; j++) {
    const v = j / NS, s = FALL_STREAM + (FALL_LIP + 0.3 - FALL_STREAM) * v;
    for (const [i, u] of [[0, -w], [1, w]] as const) {
      pos.push(...at(f, s, u, y).toArray());
      uvs.push(i, v);
    }
  }
  for (let j = 0; j < NS; j++) {
    const a = j * 2;
    idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(idx);
  return g;
}

export class Waterfalls {
  group = new THREE.Group();
  /** How near the nearest fall is (0–1), for its sound. */
  roar = 0;
  private each: { f: Fall; g: THREE.Group; base: THREE.Vector3 }[] = [];

  constructor(mobile: boolean) {
    const t = skyUniforms.uT;
    const deep = vec3(0.07, 0.12, 0.15), pale = vec3(0.58, 0.64, 0.7);

    const curtainMat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide });
    curtainMat.colorNode = Fn(() => {
      const p = uv();
      const v = p.y;
      // streaks falling ever faster, two scales, and a foam that thickens as it falls
      const st = gN(vec2(p.x.mul(7), v.mul(2.4).sub(t.mul(1.5)))).mul(0.6).add(gN(vec2(p.x.mul(19).add(4), v.mul(6).sub(t.mul(2.7)))).mul(0.4));
      const foam = smoothstep(0.42, 0.82, st.add(v.mul(0.18)));
      const col = mix(deep, pale, foam.mul(0.85).add(v.mul(0.15)));
      const edge = smoothstep(0, 0.16, p.x).mul(smoothstep(1, 0.84, p.x)).mul(smoothstep(0, 0.04, v));
      return vec4(col, edge.mul(foam.mul(0.4).add(0.45)));
    })();
    const streamMat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false });
    streamMat.colorNode = Fn(() => {
      const p = uv();
      // ripples carried toward the lip, quickening as they near it
      const flow = p.y.mul(28).sub(t.mul(mix(float(1.1), float(2.4), p.y)));
      const r = gN(vec2(p.x.mul(3).add(sin(flow.mul(0.3)).mul(0.4)), flow));
      const glint = smoothstep(0.62, 0.9, r).mul(0.5).add(smoothstep(0.85, 1, p.y).mul(smoothstep(0.4, 0.8, r)).mul(0.4));
      const edge = smoothstep(0, 0.2, p.x).mul(smoothstep(1, 0.8, p.x));
      return vec4(mix(deep.mul(0.7), pale, glint), edge.mul(0.9));
    })();
    const foamMat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false });
    foamMat.colorNode = Fn(() => {
      const q = uv().sub(0.5).mul(2);
      const r = length(q);
      const a = T.atan(q.y, q.x);
      const f = gN(vec2(a.mul(2.5), r.mul(5).sub(t.mul(0.7)))).mul(0.6).add(gN(vec2(a.mul(7).add(3), r.mul(12).sub(t.mul(1.1)))).mul(0.4));
      const k = smoothstep(1, 0.25, r).mul(smoothstep(0.38, 0.75, f.add(float(0.35).mul(smoothstep(0.5, 0, r)))));
      return vec4(pale, k.mul(0.62));
    })();

    // the mist: soft pale puffs rising off where the water lands, drifting downstream
    const MIST = mobile ? 90 : 160;
    const mistMat = (base: THREE.Vector3, dir: THREE.Vector2) => {
      const m = softPoints();
      const cloud = spriteCloud(MIST, { aSeed: 4 }, m);
      const seed = cloud.attrs.aSeed.array as Float32Array;
      for (let i = 0; i < seed.length; i++) seed[i] = Math.random();
      const sd = cloud.nodes.aSeed;
      const life = T.fract(t.mul(sd.w.mul(0.05).add(0.05)).add(sd.x));
      const ang = sd.y.mul(6.2832);
      const rr = sd.z.mul(1.6).add(0.4).add(life.mul(3.2));
      const drift = life.mul(life).mul(5);
      const p = vec3(
        float(base.x).add(T.cos(ang).mul(rr)).add(float(dir.x).mul(drift)),
        float(base.y).add(life.mul(sd.w.mul(4).add(2.5))),
        float(base.z).add(sin(ang).mul(rr)).add(float(dir.y).mul(drift)),
      );
      m.positionNode = p;
      m.sizeNode = clamp(life.mul(2.6).add(1.1).mul(gpuUniforms.px).div(max(viewDepth(p), 0.5)), 2, 200).div(gpuUniforms.dpr);
      const k = sin(life.mul(3.14159)).mul(0.07).mul(nearLens()).mul(outOfTheWay(p));
      m.colorNode = Fn(() => vec4(vec3(0.62, 0.7, 0.78).mul(softDot(pointR())).mul(k), 1))();
      cloud.sprite.renderOrder = 12;
      return cloud.sprite;
    };

    for (const f of WATERFALLS) {
      const g = new THREE.Group();
      const curtain = new THREE.Mesh(curtainGeometry(f), curtainMat);
      const stream = new THREE.Mesh(streamGeometry(f), streamMat);
      const land = at(f, FALL_LIP + 0.25 + CURTAIN_OUT, 0, WATER_Y + 0.04);
      const foam = new THREE.Mesh(new THREE.PlaneGeometry(13, 13).rotateX(-Math.PI / 2), foamMat);
      foam.position.copy(land);
      foam.renderOrder = 2;
      curtain.renderOrder = 3;
      g.add(stream, curtain, foam, mistMat(land, new THREE.Vector2(f.dx, f.dz)));
      g.traverse((o) => ((o as THREE.Mesh).frustumCulled = false));
      this.group.add(g);
      this.each.push({ f, g, base: land });
    }
  }

  /** Each is drawn within ~700 m; `roar` follows the nearest. */
  update(pos: THREE.Vector3, hidden: boolean): void {
    let roar = 0;
    for (const e of this.each) {
      const d = Math.hypot(pos.x - e.base.x, pos.z - e.base.z);
      e.g.visible = !hidden && d < 700;
      if (!hidden) roar = Math.max(roar, THREE.MathUtils.clamp(1 - (d - 12) / 150, 0, 1) ** 1.6);
    }
    this.roar = roar;
  }

  /** Where each falls (for the map): the plunge pool's edge, looking up at the curtain. */
  get list(): { f: Fall; view: { x: number; z: number; heading: number } }[] {
    return this.each.map(({ f }) => {
      const p = at(f, 22, 6, 0);
      return { f, view: { x: p.x, z: p.z, heading: Math.atan2(f.x - p.x, f.z - p.z) } };
    });
  }
}

