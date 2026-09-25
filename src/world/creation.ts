/* The whole creation, and the light flowing through it.
   The Law of One image this follows: the love and light of the infinite Creator pours through
   everything. Here it is drawn literally, as light that is always moving:
   - Trees of light. Pulses of light run down their veins from the crown into the trunk, and on
     down the roots, which go deep into the earth. The roots are seen through the ground as
     glowing threads, brightest where you stand.
   - The roots of neighbouring trees and crystals join underground in one network, and the same
     pulses travel along it: nothing stands alone.
   - Crystals catch the light. Some take a shaft of it straight down from the sky, and each
     crystal breaks it into a rainbow fan across the ground. They wake as you pass.
   - Rocks, etched with the drawings' fine gold lattice.
   - Spirits: wisps of light with flowing veils. They drift among the trees, and some come to
     keep you company a while.
   Everything is placed by a hash of its cell, so the world is the same on every visit. Nothing
   here makes a sound. */
import * as THREE from "three";
import type { LifeFrame, Sparks } from "./life";
import { etchedStone } from "./etching";
import { colliders, fbm, groundKind, heightAt, LANDMARK_SITES, SPAWN, smooth, WATER_Y, type Collider } from "./terrain";

/** Shared by every shader here; main.ts copies the scene's fog in. */
export const creationUniforms = {
  uT: { value: 0 },
  uPlayer: { value: new THREE.Vector3() },
  uStar: { value: new THREE.Vector3(0, 1, 0) },
  uFogC: { value: new THREE.Color() },
  uFogD: { value: 0.006 },
  uPx: { value: 600 }, // pixels per unit at distance 1 (for point sizes)
};
const U = creationUniforms;

const GLSL_COMMON = /* glsl */ `
uniform float uT,uFogD,uPx;uniform vec3 uPlayer,uStar,uFogC;
float fogF(float d){return 1.0-exp(-uFogD*uFogD*d*d);}
float hash1(vec2 p){return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453);}
vec3 spectrum(float h){return 0.5+0.5*cos(6.28318*(h+vec3(0.0,0.33,0.67)));}
`;

function cellHash(i: number, j: number, salt: number): number {
  const s = Math.sin(i * 127.1 + j * 311.7 + salt * 74.7) * 43758.5453;
  return s - Math.floor(s);
}
function rng(seed: number): () => number {
  let s = Math.floor(seed * 2147483646) + 1;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
}
/** Keep clear of where the wanderer wakes and of the landmarks' pads. */
function clearOf(x: number, z: number, spawnR: number, padR: number): boolean {
  if (Math.hypot(x - SPAWN.x, z - SPAWN.z) < spawnR) return false;
  for (const [lx, lz] of LANDMARK_SITES) if (Math.hypot(x - lx, z - lz) < padR) return false;
  return true;
}

/* ================================================================ tree growing */
const V = THREE.Vector3;
interface Seg {
  a: THREE.Vector3;
  b: THREE.Vector3;
  ra: number;
  rb: number;
  ua: number;
  ub: number;
}
interface TreeShape {
  height: number;
  radius: number;
  limbs: number;
  depth: number;
  spread: number;
  limbLen: number;
  roots: number;
  rootLen: number;
  leaves: number; // glints per twig tip
}
const SHAPES: TreeShape[] = [
  { height: 5.2, radius: 0.26, limbs: 3, depth: 3, spread: 0.55, limbLen: 2.5, roots: 6, rootLen: 3.2, leaves: 4 }, // graceful
  { height: 7.4, radius: 0.22, limbs: 2, depth: 3, spread: 0.38, limbLen: 2.3, roots: 5, rootLen: 3.6, leaves: 4 }, // slender
  { height: 4.2, radius: 0.3, limbs: 4, depth: 2, spread: 0.95, limbLen: 3.2, roots: 6, rootLen: 3.0, leaves: 6 }, // spreading, like a tree of life
  { height: 7.8, radius: 0.55, limbs: 4, depth: 3, spread: 0.7, limbLen: 3.6, roots: 9, rootLen: 5.5, leaves: 5 }, // the elder
];

function grow(shape: TreeShape, seed: number): { trunk: Seg[]; roots: Seg[]; tips: THREE.Vector3[] } {
  const R = rng(seed);
  const trunk: Seg[] = [];
  const roots: Seg[] = [];
  const tips: THREE.Vector3[] = [];
  const frame = (d: THREE.Vector3) => {
    const up = Math.abs(d.y) < 0.99 ? new V(0, 1, 0) : new V(1, 0, 0);
    const s = new V().crossVectors(d, up).normalize();
    return [s, new V().crossVectors(s, d)] as const;
  };
  // A branch: three gently bending pieces, then two or three children.
  const branch = (p: THREE.Vector3, dir: THREE.Vector3, len: number, r: number, depth: number, u: number) => {
    let cur = p.clone();
    const d = dir.clone();
    for (let i = 0; i < 3; i++) {
      d.x += (R() - 0.5) * 0.35;
      d.z += (R() - 0.5) * 0.35;
      d.y += 0.1; // reaching toward the light
      d.normalize();
      const next = cur.clone().addScaledVector(d, len / 3);
      const r0 = r * (1 - (i / 3) * 0.35), r1 = r * (1 - ((i + 1) / 3) * 0.35);
      trunk.push({ a: cur, b: next, ra: r0, rb: r1, ua: u, ub: u + len / 3 });
      u += len / 3;
      cur = next;
    }
    if (depth === 0) {
      tips.push(cur);
      return;
    }
    const n = R() < 0.55 ? 2 : 3;
    const [s, t] = frame(d);
    const az0 = R() * Math.PI * 2;
    for (let k = 0; k < n; k++) {
      const az = az0 + (k / n) * Math.PI * 2 + (R() - 0.5) * 0.6;
      const ang = shape.spread * (0.6 + R() * 0.6);
      const perp = s.clone().multiplyScalar(Math.cos(az)).addScaledVector(t, Math.sin(az));
      const cd = d.clone().multiplyScalar(Math.cos(ang)).addScaledVector(perp, Math.sin(ang));
      branch(cur, cd.normalize(), len * (0.66 + R() * 0.14), r * 0.6, depth - 1, u);
    }
  };
  // The trunk: a slight lean and sway, flaring at the foot.
  const lean = new V((R() - 0.5) * 0.25, 1, (R() - 0.5) * 0.25).normalize();
  const split = shape.height * 0.55;
  let cur = new V(0, -0.3, 0);
  let u = 0;
  const pieces = 5;
  for (let i = 0; i < pieces; i++) {
    const d = lean.clone();
    d.x += Math.sin(i * 1.3 + seed * 10) * 0.12;
    d.z += Math.cos(i * 1.1 + seed * 7) * 0.12;
    d.normalize();
    const l = (split + 0.3) / pieces;
    const next = cur.clone().addScaledVector(d, l);
    const ra = shape.radius * (i === 0 ? 1.7 : 1 - (i / pieces) * 0.25);
    const rb = shape.radius * (1 - ((i + 1) / pieces) * 0.25);
    trunk.push({ a: cur, b: next, ra, rb, ua: u, ub: u + l });
    u += l;
    cur = next;
  }
  const [s, t] = frame(lean);
  const az0 = R() * Math.PI * 2;
  for (let k = 0; k < shape.limbs; k++) {
    const az = az0 + (k / shape.limbs) * Math.PI * 2 + (R() - 0.5) * 0.5;
    const ang = shape.spread * (0.7 + R() * 0.5);
    const perp = s.clone().multiplyScalar(Math.cos(az)).addScaledVector(t, Math.sin(az));
    const cd = lean.clone().multiplyScalar(Math.cos(ang)).addScaledVector(perp, Math.sin(ang)).normalize();
    branch(cur, cd, shape.limbLen * (0.85 + R() * 0.3), shape.radius * 0.7, shape.depth, u);
  }
  // Roots: they flare out at the surface, then dive, dividing as they go down.
  const root = (p: THREE.Vector3, dir: THREE.Vector3, len: number, r: number, depth: number, u: number) => {
    let c = p.clone();
    const d = dir.clone();
    for (let i = 0; i < 4; i++) {
      d.y -= 0.2 + R() * 0.12;
      d.x += (R() - 0.5) * 0.4;
      d.z += (R() - 0.5) * 0.4;
      d.normalize();
      const next = c.clone().addScaledVector(d, len / 4);
      const r0 = r * (1 - (i / 4) * 0.5), r1 = r * (1 - ((i + 1) / 4) * 0.5);
      roots.push({ a: c, b: next, ra: r0, rb: r1, ua: -u, ub: -(u + len / 4) });
      u += len / 4;
      c = next;
    }
    if (depth === 0) return;
    for (let k = 0; k < 2; k++) {
      const cd = d.clone();
      cd.x += (R() - 0.5) * 1.2;
      cd.z += (R() - 0.5) * 1.2;
      root(c, cd.normalize(), len * 0.7, r * 0.5, depth - 1, u);
    }
  };
  for (let k = 0; k < shape.roots; k++) {
    const az = (k / shape.roots) * Math.PI * 2 + R() * 0.5;
    const out = new V(Math.cos(az), -0.45, Math.sin(az)); // a short flare at the surface, then down
    const p = new V(Math.cos(az) * shape.radius * 0.7, 0.1, Math.sin(az) * shape.radius * 0.7);
    root(p, out, shape.rootLen * (0.7 + R() * 0.6), shape.radius * 0.55, 3, 0);
  }
  // Normalise "along" so the crown's tips are 1 and the deepest root tips are -1.
  const maxU = Math.max(...trunk.map((g) => g.ub));
  const minU = Math.min(...roots.map((g) => g.ub));
  for (const g of trunk) {
    g.ua /= maxU;
    g.ub /= maxU;
  }
  for (const g of roots) {
    g.ua /= -minU;
    g.ub /= -minU;
  }
  return { trunk, roots, tips };
}

/** Tapered tubes: position, normal, aU (along the tree, -1 root tip … 1 crown tip), aAng (around). */
function tubes(segs: Seg[]): THREE.BufferGeometry {
  const pos: number[] = [], nor: number[] = [], au: number[] = [], ang: number[] = [], idx: number[] = [];
  const up = new V(0, 1, 0), side = new V(1, 0, 0);
  for (const g of segs) {
    const d = new V().subVectors(g.b, g.a);
    const len = d.length();
    if (len < 1e-4) continue;
    d.divideScalar(len);
    const s = new V().crossVectors(d, Math.abs(d.y) < 0.99 ? up : side).normalize();
    const t = new V().crossVectors(s, d);
    const sides = g.ra > 0.15 ? 6 : g.ra > 0.06 ? 4 : 3;
    const b2 = g.b.clone().addScaledVector(d, g.rb * 0.8); // overlap the next piece, so joints never gape
    const base = pos.length / 3;
    for (let ring = 0; ring < 2; ring++) {
      const c = ring ? b2 : g.a, r = ring ? g.rb : g.ra, u = ring ? g.ub : g.ua;
      for (let k = 0; k <= sides; k++) {
        const a = (k / sides) * Math.PI * 2;
        const n = s.clone().multiplyScalar(Math.cos(a)).addScaledVector(t, Math.sin(a));
        pos.push(c.x + n.x * r, c.y + n.y * r, c.z + n.z * r);
        nor.push(n.x, n.y, n.z);
        au.push(u);
        ang.push(k / sides);
      }
    }
    for (let k = 0; k < sides; k++) {
      const i0 = base + k, i1 = i0 + 1, j0 = base + sides + 1 + k, j1 = j0 + 1;
      idx.push(i0, j0, i1, i1, j0, j1);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute("aU", new THREE.Float32BufferAttribute(au, 1));
  geo.setAttribute("aAng", new THREE.Float32BufferAttribute(ang, 1));
  geo.setIndex(idx);
  geo.computeBoundingSphere();
  return geo;
}

const TREE_VERT = /* glsl */ `
attribute float aU;attribute float aAng;
varying vec3 vW;varying vec3 vN;varying float vU;varying float vAng;varying float vSeed;
${GLSL_COMMON}
void main(){
  mat4 im=mat4(1.0);
  #ifdef USE_INSTANCING
  im=instanceMatrix;
  #endif
  vec4 w=modelMatrix*im*vec4(position,1.0);
  vSeed=hash1(im[3].xz);
  // the crown sways; the roots stay still
  float sway=max(position.y,0.0);sway*=sway*0.002;
  w.x+=sin(uT*0.55+vSeed*6.28+w.z*0.05)*sway;w.z+=cos(uT*0.43+vSeed*4.0)*sway*0.6;
  vW=w.xyz;vN=normalize(mat3(modelMatrix*im)*normal);vU=aU;vAng=aAng;
  gl_Position=projectionMatrix*viewMatrix*w;
}`;

/* ================================================================ crystals */
function prismGeometry(): THREE.BufferGeometry {
  // A six-sided column with a pointed tip; facets flat-shaded. aY is 0 at the base, 1 at the tip.
  const pos: number[] = [], ys: number[] = [];
  const r = 0.2, body = 0.74;
  const ring = (y: number, rr: number) => Array.from({ length: 6 }, (_, k) => new V(Math.cos((k / 6) * Math.PI * 2) * rr, y, Math.sin((k / 6) * Math.PI * 2) * rr));
  const lo = ring(0, r * 0.92), hi = ring(body, r), tip = new V(0, 1, 0);
  const tri = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3) => {
    for (const p of [a, b, c]) {
      pos.push(p.x, p.y, p.z);
      ys.push(p.y);
    }
  };
  for (let k = 0; k < 6; k++) {
    const k1 = (k + 1) % 6;
    tri(lo[k], hi[k1], hi[k]);
    tri(lo[k], lo[k1], hi[k1]);
    tri(hi[k], hi[k1], tip);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("aY", new THREE.Float32BufferAttribute(ys, 1));
  g.computeVertexNormals();
  return g;
}

/* ================================================================ placement records */
interface TreeDef {
  x: number;
  y: number;
  z: number;
  kind: number;
  rot: number;
  scale: number;
  hue: number;
}
interface RockDef {
  x: number;
  y: number;
  z: number;
  kind: number;
  m: THREE.Matrix4;
  r: number;
}
interface ClusterDef {
  key: string;
  x: number;
  y: number;
  z: number;
  great: boolean;
  prisms: { m: THREE.Matrix4; hue: number }[];
  glow: number;
  woke: number; // time it last woke
}

const TCELL = 12, TRING = 8; // trees out to ~100 m
const RCELL = 10, RRING = 6; // rocks out to ~65 m
const CCELL = 23, CRING = 5; // crystals out to ~120 m
const MAX_TREES = 90, MAX_ROCKS = 240, MAX_PRISMS = 900, MAX_BEAMS = 24;

export class Creation {
  group = new THREE.Group();
  /** Things the water's mirror should skip (seen-through-the-ground effects). */
  noReflect: THREE.Object3D[] = [];
  private trees = new Map<string, TreeDef | null>();
  private rocks = new Map<string, RockDef[]>();
  private clusters = new Map<string, ClusterDef | null>();
  private activeTrees: TreeDef[] = [];
  private activeClusters: ClusterDef[] = [];
  private barks: THREE.InstancedMesh[] = [];
  private rootSegs: Seg[][] = [];
  private rootLines!: THREE.LineSegments;
  private tipSets: { p: Float32Array; k: Float32Array }[] = [];
  private leaves: THREE.Points;
  private rockMeshes: THREE.InstancedMesh[] = [];
  private prisms: THREE.InstancedMesh;
  private prismC: THREE.InstancedBufferAttribute;
  private beams: THREE.InstancedMesh;
  private beamA: THREE.InstancedBufferAttribute;
  private fans: THREE.Mesh;
  private web: THREE.LineSegments;
  private mine: Collider[] = [];
  private cx = Infinity;
  private cz = Infinity;
  private m4 = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private v = new V();
  private sc = new V();

  constructor(private sparks: Sparks) {
    this.buildTrees();
    this.leaves = this.buildLeaves();
    this.buildRocks();
    const [prisms, prismC] = this.buildPrisms();
    this.prisms = prisms;
    this.prismC = prismC;
    const [beams, beamA] = this.buildBeams();
    this.beams = beams;
    this.beamA = beamA;
    this.fans = this.buildFans();
    this.web = this.buildWeb();
    this.noReflect.push(this.rootLines, this.web, this.fans);
  }

  /* ---------------------------------------------------------------- materials and meshes */
  private buildTrees(): void {
    const bark = new THREE.ShaderMaterial({
      uniforms: U,
      vertexShader: TREE_VERT,
      fragmentShader: /* glsl */ `
        varying vec3 vW;varying vec3 vN;varying float vU;varying float vAng;varying float vSeed;
        ${GLSL_COMMON}
        void main(){
          vec3 n=normalize(vN);vec3 v=normalize(cameraPosition-vW);
          float hemi=0.5+0.5*n.y;
          vec3 c=mix(vec3(0.006,0.005,0.014),vec3(0.03,0.028,0.06),hemi);
          c+=vec3(0.09,0.07,0.05)*max(0.0,dot(n,uStar));
          c+=vec3(0.3,0.38,0.8)*pow(1.0-max(0.0,dot(n,v)),5.0)*0.18; // a thin rim of starlight
          // the grain spirals up the trunk as fine lines of light
          float f=vAng*4.0+vU*5.0+vSeed*3.0;float w=fwidth(f);
          float grain=1.0-smoothstep(w*0.4,w*1.4,abs(fract(f)-0.5));
          // light pours down from the crown toward the roots
          float flow=pow(fract(vU*3.0+uT*0.11+vSeed),14.0);
          float near=smoothstep(12.0,2.0,distance(vW.xz,uPlayer.xz));
          vec3 gold=mix(vec3(1.0,0.78,0.48),vec3(0.75,0.85,1.0),step(0.5,vSeed));
          c+=gold*(grain*(0.05+near*0.12+flow*1.1)+flow*0.08);
          float d=length(vW-cameraPosition);
          // never a wall of bark in front of the camera: it dissolves as the camera comes close
          if(hash1(gl_FragCoord.xy)>smoothstep(0.6,2.2,d))discard;
          gl_FragColor=vec4(mix(c,uFogC,fogF(d)),1.0);
        }`,
    });
    // Roots seen through the ground as fine lines of light: drawn only where something (the
    // earth) is in front of them. Rebuilt for the trees near the wanderer as they stream in.
    this.rootLines = new THREE.LineSegments(
      new THREE.BufferGeometry(),
      new THREE.ShaderMaterial({
        uniforms: U,
        transparent: true,
        depthWrite: false,
        depthFunc: THREE.GreaterDepth,
        blending: THREE.AdditiveBlending,
        vertexShader: /* glsl */ `
          attribute vec2 aR;varying vec3 vW;varying vec2 vR;
          void main(){vW=position;vR=aR;gl_Position=projectionMatrix*viewMatrix*vec4(position,1.0);}`,
        fragmentShader: /* glsl */ `
          varying vec3 vW;varying vec2 vR; // along (0 at the trunk, -1 at the deepest tip), seed
          ${GLSL_COMMON}
          void main(){
            float flow=pow(fract(vR.x*3.0+uT*0.11+vR.y),10.0);
            float near=smoothstep(14.0,1.5,distance(vW.xz,uPlayer.xz));
            float d=length(vW-cameraPosition);
            float fade=(1.0-smoothstep(20.0,50.0,d))*(1.0-0.5*smoothstep(0.4,1.0,-vR.x));
            vec3 c=mix(vec3(1.0,0.78,0.5),vec3(0.72,0.82,1.0),step(0.5,vR.y));
            gl_FragColor=vec4(c*(0.1+near*0.14+flow*(0.7+near*0.9))*fade,1.0);
          }`,
      }),
    );
    this.rootLines.frustumCulled = false;
    this.rootLines.renderOrder = 3;
    this.group.add(this.rootLines);
    SHAPES.forEach((shape, kind) => {
      const { trunk, roots, tips } = grow(shape, 0.137 + kind * 0.211);
      const geo = tubes([...trunk, ...roots.filter((g) => g.ua > -0.22)]);
      const mesh = new THREE.InstancedMesh(geo, bark, MAX_TREES);
      mesh.count = 0;
      this.barks.push(mesh);
      this.rootSegs.push(roots);
      this.group.add(mesh);
      // glints around each twig tip, and a soft glow over every few
      const R = rng(0.77 + kind * 0.1);
      const p: number[] = [], k: number[] = [];
      tips.forEach((tp, i) => {
        for (let j = 0; j < shape.leaves; j++) {
          p.push(tp.x + (R() - 0.5) * 1.3, tp.y + (R() - 0.3) * 0.9, tp.z + (R() - 0.5) * 1.3);
          k.push(R() * 0.9); // small glints
        }
        if (i % 2 === 0) {
          p.push(tp.x, tp.y + 0.3, tp.z);
          k.push(1.0 + R() * 0.9); // ≥ 1: a soft canopy glow
        }
      });
      this.tipSets.push({ p: new Float32Array(p), k: new Float32Array(k) });
    });
  }

  private buildLeaves(): THREE.Points {
    const max = MAX_TREES * 420;
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(max * 3), 3));
    g.setAttribute("aK", new THREE.BufferAttribute(new Float32Array(max), 1));
    g.setAttribute("aHue", new THREE.BufferAttribute(new Float32Array(max), 1));
    g.setDrawRange(0, 0);
    const mat = new THREE.ShaderMaterial({
      uniforms: U,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */ `
        attribute float aK;attribute float aHue;varying float vA;varying float vBig;varying vec3 vC;
        ${GLSL_COMMON}
        void main(){
          vec3 p=position;float big=step(1.0,aK);float k=fract(aK);
          p.x+=sin(uT*0.7+k*40.0)*0.08;p.y+=sin(uT*0.9+k*23.0)*0.06;
          // a few glints come loose and drift down: light descending into the world
          float falling=step(k,0.07)*(1.0-big);
          float fall=fract(uT*0.035+k*37.0);
          p.y-=falling*fall*7.0;p.x+=falling*sin(fall*9.0+k*50.0)*0.8;
          float d=distance(p,cameraPosition);
          float near=smoothstep(14.0,3.0,distance(p.xz,uPlayer.xz));
          float tw=0.55+0.45*sin(uT*(1.2+k*2.5)+k*60.0);
          // the canopy brightens in slow waves, in step with the light flowing down the trunk
          float wave=0.6+0.4*sin(uT*0.5-p.y*0.4+aHue*6.0);
          vA=mix(tw*wave*(1.0+near*1.2),0.22+near*0.2,big)*(1.0-falling*fall)*(1.0-fogF(d));
          vA*=1.0-smoothstep(90.0,120.0,d);
          vBig=big;
          vC=mix(mix(vec3(1.0,0.8,0.5),vec3(0.7,0.85,1.0),step(0.33,aHue)),vec3(1.0,0.7,0.88),step(0.72,aHue));
          vec4 mv=viewMatrix*vec4(p,1.0);gl_Position=projectionMatrix*mv;
          float size=mix(0.13,2.4,big);
          gl_PointSize=clamp(size*uPx/max(-mv.z,0.5),1.5,90.0);
        }`,
      fragmentShader: /* glsl */ `
        varying float vA;varying float vBig;varying vec3 vC;
        void main(){
          float r=length(gl_PointCoord-0.5)*2.0;
          float a=mix(smoothstep(1.0,0.0,r)*1.6+smoothstep(0.3,0.0,r)*1.5,exp(-r*r*3.5)*0.3,vBig);
          gl_FragColor=vec4(vC*a*vA,1.0);
        }`,
    });
    const pts = new THREE.Points(g, mat);
    pts.frustumCulled = false;
    this.group.add(pts);
    return pts;
  }

  private buildRocks(): void {
    const mat = etchedStone("#282338", "#d8b8ff", 1.7);
    mat.flatShading = true;
    for (let v = 0; v < 3; v++) {
      const g = new THREE.IcosahedronGeometry(1, 1);
      const p = g.attributes.position as THREE.BufferAttribute;
      const s = [0.3, 1.7, 3.1][v];
      for (let i = 0; i < p.count; i++) {
        this.v.fromBufferAttribute(p, i);
        const n = this.v.clone().normalize();
        const d = 0.72 + fbm(n.x * 1.6 + s, n.z * 1.6 + n.y * 1.3 - s) * 0.55;
        this.v.copy(n).multiplyScalar(d);
        p.setXYZ(i, this.v.x, this.v.y * [0.6, 0.85, 0.5][v], this.v.z);
      }
      g.computeVertexNormals();
      const m = new THREE.InstancedMesh(g, mat, MAX_ROCKS);
      m.count = 0;
      m.castShadow = true;
      m.receiveShadow = true;
      this.rockMeshes.push(m);
      this.group.add(m);
    }
  }

  private buildPrisms(): [THREE.InstancedMesh, THREE.InstancedBufferAttribute] {
    const geo = prismGeometry();
    const c = new THREE.InstancedBufferAttribute(new Float32Array(MAX_PRISMS * 3), 3); // hue, glow, seed
    c.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute("aC", c);
    const mat = new THREE.ShaderMaterial({
      uniforms: U,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */ `
        attribute float aY;attribute vec3 aC;varying vec3 vW;varying vec3 vN;varying float vY;varying vec3 vCv;
        ${GLSL_COMMON}
        void main(){
          mat4 im=mat4(1.0);
          #ifdef USE_INSTANCING
          im=instanceMatrix;
          #endif
          vec4 w=modelMatrix*im*vec4(position,1.0);
          vW=w.xyz;vN=normalize(mat3(modelMatrix*im)*normal);vY=aY;vCv=aC;
          gl_Position=projectionMatrix*viewMatrix*w;
        }`,
      fragmentShader: /* glsl */ `
        varying vec3 vW;varying vec3 vN;varying float vY;varying vec3 vCv;
        ${GLSL_COMMON}
        void main(){
          vec3 n=normalize(vN);vec3 v=normalize(cameraPosition-vW);
          float ndv=abs(dot(n,v));
          float fres=pow(1.0-ndv,2.2);
          float hue=vCv.x,glow=vCv.y,seed=vCv.z;
          vec3 core=mix(vec3(0.45,0.55,1.0),vec3(1.0,0.72,0.92),hue);
          // the light is split: a rainbow that shifts as you walk around it
          vec3 split=spectrum(ndv*1.4+vY*0.4+hue+uT*0.02);
          // light rising through the stone
          float rise=pow(fract(vY*1.3-uT*0.22+seed),8.0);
          // the starlight glints off a facet
          vec3 r=reflect(-v,n);float glint=pow(max(0.0,dot(r,uStar)),40.0);
          vec3 c=core*(0.08+0.3*vY)+split*fres*0.8+core*rise*0.7+vec3(1.0,0.95,0.9)*glint*2.5;
          c*=1.0+glow*1.6;
          float d=length(vW-cameraPosition);
          gl_FragColor=vec4(c*(1.0-fogF(d)*0.85),1.0);
        }`,
    });
    const m = new THREE.InstancedMesh(geo, mat, MAX_PRISMS);
    m.count = 0;
    m.renderOrder = 2;
    this.group.add(m);
    return [m, c];
  }

  /** Shafts of light coming down from the sky onto the great crystals. */
  private buildBeams(): [THREE.InstancedMesh, THREE.InstancedBufferAttribute] {
    const geo = new THREE.PlaneGeometry(1, 1, 1, 8).translate(0, 0.5, 0);
    const a = new THREE.InstancedBufferAttribute(new Float32Array(MAX_BEAMS), 1);
    a.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute("aA", a);
    const mat = new THREE.ShaderMaterial({
      uniforms: U,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */ `
        attribute float aA;varying vec2 vUv;varying float vA;varying float vD;
        ${GLSL_COMMON}
        void main(){
          vec3 base=vec3(instanceMatrix[3]);
          float h=length(instanceMatrix[1].xyz),wd=length(instanceMatrix[0].xyz);
          vec3 toCam=cameraPosition-base;toCam.y=0.0;
          vec3 right=normalize(vec3(toCam.z,0.0,-toCam.x)+1e-4);
          // it widens a little toward the sky
          vec3 w=base+right*position.x*wd*(1.0+position.y*2.0)+vec3(0.0,position.y*h,0.0);
          vUv=vec2(position.x*2.0,position.y);vA=aA;vD=length(base-cameraPosition);
          gl_Position=projectionMatrix*viewMatrix*vec4(w,1.0);
        }`,
      fragmentShader: /* glsl */ `
        varying vec2 vUv;varying float vA;varying float vD;
        ${GLSL_COMMON}
        void main(){
          float across=exp(-vUv.x*vUv.x*4.0);
          float up=smoothstep(0.0,0.04,vUv.y)*(1.0-smoothstep(0.35,1.0,vUv.y));
          // bands of light descending the shaft
          float bands=0.7+0.3*sin(vUv.y*40.0+uT*1.2);
          vec3 c=mix(vec3(1.0,0.9,0.75),spectrum(vUv.x*0.3+0.1),0.25);
          float near=smoothstep(8.0,30.0,vD); // don't blind the wanderer standing in it
          gl_FragColor=vec4(c*across*up*bands*(0.1+vA*0.2)*mix(0.35,1.0,near)*(1.0-fogF(vD)*0.6),1.0);
        }`,
    });
    const m = new THREE.InstancedMesh(geo, mat, MAX_BEAMS);
    m.count = 0;
    m.frustumCulled = false;
    this.group.add(m);
    return [m, a];
  }

  /** Rainbow light thrown across the ground by the crystals. Rebuilt as clusters stream in. */
  private buildFans(): THREE.Mesh {
    const g = new THREE.BufferGeometry();
    const mat = new THREE.ShaderMaterial({
      uniforms: U,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
      vertexShader: /* glsl */ `
        attribute vec3 aF;varying vec3 vF;varying vec3 vW;
        void main(){vF=aF;vW=position;gl_Position=projectionMatrix*viewMatrix*vec4(position,1.0);}`,
      fragmentShader: /* glsl */ `
        varying vec3 vF;varying vec3 vW; // across 0..1, out 0..1, strength
        ${GLSL_COMMON}
        void main(){
          float x=fract(vF.x*3.0+uT*0.004);
          vec3 c=spectrum(x*0.8+0.02);
          float edge=smoothstep(0.0,0.25,x)*smoothstep(1.0,0.75,x);
          float along=smoothstep(0.05,0.2,vF.y)*(1.0-vF.y)*(1.0-vF.y);
          float shimmer=0.8+0.2*sin(vF.y*30.0-uT*2.0+vF.x*6.0);
          float d=length(vW-cameraPosition);
          gl_FragColor=vec4(c*edge*along*shimmer*vF.z*0.9*(1.0-fogF(d)),1.0);
        }`,
    });
    const m = new THREE.Mesh(g, mat);
    m.frustumCulled = false;
    m.renderOrder = 1;
    this.group.add(m);
    return m;
  }

  /** The network under the ground: every tree and crystal is joined to its neighbours. */
  private buildWeb(): THREE.LineSegments {
    const g = new THREE.BufferGeometry();
    const mat = new THREE.ShaderMaterial({
      uniforms: U,
      transparent: true,
      depthWrite: false,
      depthFunc: THREE.GreaterDepth,
      blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */ `
        attribute vec2 aS;varying vec2 vS;varying vec3 vW;
        void main(){vS=aS;vW=position;gl_Position=projectionMatrix*viewMatrix*vec4(position,1.0);}`,
      fragmentShader: /* glsl */ `
        varying vec2 vS;varying vec3 vW;
        ${GLSL_COMMON}
        void main(){
          float pulse=pow(fract(vS.x*1.5-uT*0.09+vS.y),16.0);
          float near=smoothstep(16.0,2.0,distance(vW.xz,uPlayer.xz));
          float d=length(vW-cameraPosition);
          float fade=1.0-smoothstep(20.0,55.0,d);
          vec3 c=mix(vec3(1.0,0.8,0.55),vec3(0.8,0.75,1.0),vS.y);
          gl_FragColor=vec4(c*(0.06+near*0.12+pulse*(0.5+near*0.8))*fade,1.0);
        }`,
    });
    const l = new THREE.LineSegments(g, mat);
    l.frustumCulled = false;
    l.renderOrder = 3;
    this.group.add(l);
    return l;
  }

  /* ---------------------------------------------------------------- placement */
  private treeAt(i: number, j: number): TreeDef | null {
    const key = `${i},${j}`;
    if (this.trees.has(key)) return this.trees.get(key)!;
    let t: TreeDef | null = null;
    const x = (i + 0.15 + cellHash(i, j, 41) * 0.7) * TCELL, z = (j + 0.15 + cellHash(i, j, 42) * 0.7) * TCELL;
    const grove = smooth(0.46, 0.64, fbm(x * 0.008 + 71, z * 0.008 - 33));
    if (cellHash(i, j, 40) < 0.08 + grove * 0.62 && clearOf(x, z, 11, 16)) {
      const h = heightAt(x, z);
      const k = groundKind(x, z, h);
      if (h > WATER_Y + 0.7 && h < 28 && k.stone < 0.5) {
        const elder = cellHash(i, j, 43) < 0.05;
        t = {
          x, y: h, z,
          kind: elder ? 3 : Math.floor(cellHash(i, j, 44) * 3),
          rot: cellHash(i, j, 45) * Math.PI * 2,
          scale: elder ? 1.1 + cellHash(i, j, 46) * 0.4 : 0.75 + cellHash(i, j, 46) * 0.55,
          hue: cellHash(i, j, 47),
        };
      }
    }
    this.trees.set(key, t);
    if (this.trees.size > 3000) this.trees.delete(this.trees.keys().next().value!);
    return t;
  }

  private rocksAt(i: number, j: number): RockDef[] {
    const key = `${i},${j}`;
    const known = this.rocks.get(key);
    if (known) return known;
    const out: RockDef[] = [];
    const x0 = (i + 0.5) * RCELL, z0 = (j + 0.5) * RCELL;
    const k0 = groundKind(x0, z0);
    const p = 0.08 + k0.stone * 0.7 + k0.sand * 0.12;
    if (cellHash(i, j, 50) < p) {
      const n = 1 + Math.floor(cellHash(i, j, 51) * 3);
      for (let r = 0; r < n; r++) {
        const x = (i + cellHash(i, j, 52 + r)) * RCELL, z = (j + cellHash(i, j, 55 + r)) * RCELL;
        if (!clearOf(x, z, 6, 12)) continue;
        const h = heightAt(x, z);
        if (h < WATER_Y - 1.5) continue;
        const big = cellHash(i, j, 58 + r) < 0.12;
        const s = big ? 1.8 + cellHash(i, j, 61 + r) * 1.8 : 0.25 + cellHash(i, j, 61 + r) * 0.9;
        const m = new THREE.Matrix4().compose(
          new V(x, h - s * 0.28, z),
          new THREE.Quaternion().setFromEuler(new THREE.Euler((cellHash(i, j, 64 + r) - 0.5) * 0.5, cellHash(i, j, 67 + r) * 6.28, 0)),
          new V(s, s, s * (0.8 + cellHash(i, j, 70 + r) * 0.4)),
        );
        out.push({ x, y: h, z, kind: Math.floor(cellHash(i, j, 73 + r) * 3), m, r: s * 0.8 });
      }
    }
    this.rocks.set(key, out);
    if (this.rocks.size > 3000) this.rocks.delete(this.rocks.keys().next().value!);
    return out;
  }

  private clusterAt(i: number, j: number): ClusterDef | null {
    const key = `${i},${j}`;
    if (this.clusters.has(key)) return this.clusters.get(key)!;
    let c: ClusterDef | null = null;
    const x = (i + 0.2 + cellHash(i, j, 81) * 0.6) * CCELL, z = (j + 0.2 + cellHash(i, j, 82) * 0.6) * CCELL;
    const h = heightAt(x, z);
    const k = groundKind(x, z, h);
    // the first cluster, just ahead of where the wanderer wakes
    const first = i === 0 && j === -1;
    if ((first || cellHash(i, j, 80) < 0.2 + k.stone * 0.45 + k.sand * 0.15) && clearOf(x, z, first ? 8 : 12, 15) && h > WATER_Y + 0.2 && h < 40) {
      const great = first || cellHash(i, j, 83) < 0.3;
      const R = rng(cellHash(i, j, 84));
      const prisms: ClusterDef["prisms"] = [];
      const n = great ? 7 + Math.floor(R() * 5) : 3 + Math.floor(R() * 5);
      const hue = R();
      for (let p = 0; p < n; p++) {
        const centre = p === 0;
        const a = R() * Math.PI * 2, rr = centre ? 0 : 0.3 + R() * (great ? 1.2 : 0.7);
        const px = x + Math.cos(a) * rr, pz = z + Math.sin(a) * rr;
        const len = (centre ? 1 : 0.35 + R() * 0.55) * (great ? 3.6 : 1.6);
        const tilt = centre ? R() * 0.15 : 0.2 + R() * 0.5;
        const q = new THREE.Quaternion().setFromAxisAngle(new V(Math.sin(a), 0, -Math.cos(a)), tilt);
        const w = len * (0.28 + R() * 0.12) * (great ? 1.1 : 1);
        const m = new THREE.Matrix4().compose(new V(px, heightAt(px, pz) - 0.12, pz), q, new V(w * 1.6, len, w * 1.6));
        prisms.push({ m, hue: (hue + (R() - 0.5) * 0.25 + 1) % 1 });
      }
      c = { key, x, y: h, z, great, prisms, glow: 0, woke: -100 };
    }
    this.clusters.set(key, c);
    return c;
  }

  /** Rebuild the instance lists when the wanderer moves into a new cell. */
  private restream(px: number, pz: number): void {
    // trees
    const byKind: TreeDef[][] = [[], [], [], []];
    this.activeTrees = [];
    const tcx = Math.floor(px / TCELL), tcz = Math.floor(pz / TCELL);
    for (let i = -TRING; i <= TRING; i++)
      for (let j = -TRING; j <= TRING; j++) {
        const t = this.treeAt(tcx + i, tcz + j);
        if (t && byKind[t.kind].length < MAX_TREES) {
          byKind[t.kind].push(t);
          this.activeTrees.push(t);
        }
      }
    const lp = this.leaves.geometry.attributes.position as THREE.BufferAttribute;
    const lk = this.leaves.geometry.attributes.aK as THREE.BufferAttribute;
    const lh = this.leaves.geometry.attributes.aHue as THREE.BufferAttribute;
    const lpa = lp.array as Float32Array, lka = lk.array as Float32Array, lha = lh.array as Float32Array;
    const maxLeaves = lka.length;
    let nl = 0;
    const rp: number[] = [], ra: number[] = [];
    byKind.forEach((list, kind) => {
      const bark = this.barks[kind], roots = this.rootSegs[kind];
      const tips = this.tipSets[kind];
      list.forEach((t, n) => {
        this.q.setFromAxisAngle(this.v.set(0, 1, 0), t.rot);
        this.m4.compose(this.sc.set(t.x, t.y, t.z), this.q, new V(t.scale, t.scale, t.scale));
        bark.setMatrixAt(n, this.m4);
        if (Math.hypot(t.x - px, t.z - pz) < 50) {
          const seed = t.hue;
          for (const g of roots) {
            for (const [q, u] of [[g.a, g.ua], [g.b, g.ub]] as const) {
              this.v.copy(q).applyMatrix4(this.m4);
              rp.push(this.v.x, this.v.y, this.v.z);
              ra.push(u, seed);
            }
          }
        }
        for (let k = 0; k < tips.k.length && nl < maxLeaves; k++) {
          this.v.set(tips.p[k * 3], tips.p[k * 3 + 1], tips.p[k * 3 + 2]).applyMatrix4(this.m4);
          lpa[nl * 3] = this.v.x;
          lpa[nl * 3 + 1] = this.v.y;
          lpa[nl * 3 + 2] = this.v.z;
          lka[nl] = tips.k[k];
          lha[nl] = t.hue;
          nl++;
        }
      });
      bark.count = list.length;
      bark.instanceMatrix.needsUpdate = true;
      bark.computeBoundingSphere();
    });
    this.leaves.geometry.setDrawRange(0, nl);
    const rg = this.rootLines.geometry;
    rg.setAttribute("position", new THREE.Float32BufferAttribute(rp, 3));
    rg.setAttribute("aR", new THREE.Float32BufferAttribute(ra, 2));
    lp.needsUpdate = lk.needsUpdate = lh.needsUpdate = true;

    // rocks
    const rocks: RockDef[][] = [[], [], []];
    const rcx = Math.floor(px / RCELL), rcz = Math.floor(pz / RCELL);
    for (let i = -RRING; i <= RRING; i++)
      for (let j = -RRING; j <= RRING; j++) for (const r of this.rocksAt(rcx + i, rcz + j)) if (rocks[r.kind].length < MAX_ROCKS) rocks[r.kind].push(r);

    // crystals (each sits on a rock or two)
    this.activeClusters = [];
    const ccx = Math.floor(px / CCELL), ccz = Math.floor(pz / CCELL);
    for (let i = -CRING; i <= CRING; i++)
      for (let j = -CRING; j <= CRING; j++) {
        const c = this.clusterAt(ccx + i, ccz + j);
        if (c) this.activeClusters.push(c);
      }
    let np = 0, nb = 0;
    const pc = this.prismC.array as Float32Array;
    const fanPos: number[] = [], fanF: number[] = [], fanIdx: number[] = [];
    // the fans fall away from the star, like light through a prism
    const away = Math.atan2(-U.uStar.value.z, -U.uStar.value.x);
    for (const c of this.activeClusters) {
      for (const p of c.prisms) {
        if (np >= MAX_PRISMS) break;
        this.prisms.setMatrixAt(np, p.m);
        pc[np * 3] = p.hue;
        pc[np * 3 + 2] = cellHash(np, c.x, 90);
        np++;
      }
      if (c.great && nb < MAX_BEAMS) {
        this.m4.compose(this.sc.set(c.x, c.y + 1.2, c.z), this.q.identity(), new V(1.6, 90, 1));
        this.beams.setMatrixAt(nb++, this.m4);
      }
      const base = rocks[0].length < MAX_ROCKS ? 0 : 1;
      const s = c.great ? 1.5 : 0.8;
      rocks[base].push({ x: c.x, y: c.y, z: c.z, kind: base, r: s, m: new THREE.Matrix4().compose(new V(c.x + 0.4, c.y - s * 0.45, c.z - 0.3), this.q.identity(), new V(s, s * 0.7, s)) });
      // a prism rose: three rainbow petals of split light around each cluster
      const len = c.great ? 8 : 4, spread = Math.PI * 2, cols = 36, rows = 6;
      const a0 = away + (cellHash(c.x, c.z, 91) - 0.5) * 0.8;
      const vi = fanPos.length / 3;
      for (let r = 0; r <= rows; r++)
        for (let q = 0; q <= cols; q++) {
          const out = r / rows, across = q / cols;
          const a = a0 + (across - 0.5) * spread;
          const d = 0.4 + out * len;
          const fx = c.x + Math.cos(a) * d, fz = c.z + Math.sin(a) * d;
          fanPos.push(fx, Math.max(heightAt(fx, fz), WATER_Y) + 0.3, fz);
          fanF.push(across, out, c.great ? 1 : 0.6);
        }
      for (let r = 0; r < rows; r++)
        for (let q = 0; q < cols; q++) {
          const i0 = vi + r * (cols + 1) + q, i1 = i0 + 1, j0 = i0 + cols + 1, j1 = j0 + 1;
          fanIdx.push(i0, j0, i1, i1, j0, j1);
        }
    }
    this.prisms.count = np;
    this.prisms.instanceMatrix.needsUpdate = true;
    this.prisms.computeBoundingSphere();
    this.prismC.needsUpdate = true;
    this.beams.count = nb;
    this.beams.instanceMatrix.needsUpdate = true;
    const fg = this.fans.geometry;
    fg.setAttribute("position", new THREE.Float32BufferAttribute(fanPos, 3));
    fg.setAttribute("aF", new THREE.Float32BufferAttribute(fanF, 3));
    fg.setIndex(fanIdx);

    rocks.forEach((list, kind) => {
      const m = this.rockMeshes[kind];
      list.forEach((r, n) => m.setMatrixAt(n, r.m));
      m.count = list.length;
      m.instanceMatrix.needsUpdate = true;
      m.computeBoundingSphere();
    });

    // colliders: trunks, big rocks, crystal clusters
    for (const c of this.mine) {
      const at = colliders.indexOf(c);
      if (at >= 0) colliders.splice(at, 1);
    }
    this.mine = [];
    for (const t of this.activeTrees) this.mine.push({ x: t.x, z: t.z, r: SHAPES[t.kind].radius * t.scale * 1.1, top: t.y + SHAPES[t.kind].height * t.scale });
    for (const list of rocks) for (const r of list) if (r.r > 0.6) this.mine.push({ x: r.x, z: r.z, r: r.r * 0.9, top: r.y + r.r * 0.8 });
    for (const c of this.activeClusters) this.mine.push({ x: c.x, z: c.z, r: c.great ? 1.4 : 0.8, top: c.y + (c.great ? 3.6 : 1.6) });
    colliders.push(...this.mine);

    this.buildWebLines();
  }

  private buildWebLines(): void {
    // Join each tree and crystal to its two nearest neighbours, with a thread that sags underground.
    const nodes = [
      ...this.activeTrees.map((t) => [t.x, t.z, 0] as const),
      ...this.activeClusters.map((c) => [c.x, c.z, 1] as const),
    ].filter(([x, z]) => Math.hypot(x - this.cx * TCELL, z - this.cz * TCELL) < 70);
    const pos: number[] = [], s: number[] = [];
    const seen = new Set<string>();
    nodes.forEach(([x, z, kind], i) => {
      const near = nodes
        .map(([x2, z2], j) => [j, Math.hypot(x2 - x, z2 - z)] as const)
        .filter(([j, d]) => j !== i && d < 30)
        .sort((a, b) => a[1] - b[1])
        .slice(0, 2);
      for (const [j, d] of near) {
        const key = i < j ? `${i}-${j}` : `${j}-${i}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const [x2, z2] = nodes[j];
        const steps = Math.max(4, Math.round(d / 1.2));
        const nx = -(z2 - z) / d, nz = (x2 - x) / d;
        const seed = cellHash(i, j, 95);
        let px = 0, py = 0, pz = 0;
        for (let k = 0; k <= steps; k++) {
          const u = k / steps;
          const wig = Math.sin(u * Math.PI * 3 + seed * 20) * 1.2 * Math.sin(u * Math.PI);
          const qx = x + (x2 - x) * u + nx * wig, qz = z + (z2 - z) * u + nz * wig;
          const qy = heightAt(qx, qz) - 0.35 - Math.sin(u * Math.PI) * 1.2;
          if (k > 0) {
            pos.push(px, py, pz, qx, qy, qz);
            s.push((k - 1) / steps * d * 0.06, (kind + seed) % 1, u * d * 0.06, (kind + seed) % 1);
          }
          px = qx;
          py = qy;
          pz = qz;
        }
      }
    });
    const g = this.web.geometry;
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("aS", new THREE.Float32BufferAttribute(s, 2));
  }

  /* ---------------------------------------------------------------- per frame */
  update(f: LifeFrame, pxPerUnit: number): void {
    U.uT.value = f.reduced ? f.t * 0.35 : f.t;
    U.uPlayer.value.copy(f.player);
    U.uPx.value = pxPerUnit;
    const cx = Math.floor(f.player.x / TCELL), cz = Math.floor(f.player.z / TCELL);
    if (cx !== this.cx || cz !== this.cz) {
      this.cx = cx;
      this.cz = cz;
      this.restream(f.player.x, f.player.z);
    }
    // crystals wake as you pass, and settle again slowly
    const pc = this.prismC.array as Float32Array;
    const ba = this.beamA.array as Float32Array;
    let np = 0, nb = 0;
    for (const c of this.activeClusters) {
      const d = Math.hypot(c.x - f.player.x, c.z - f.player.z);
      if (d < (c.great ? 7 : 5) && f.t - c.woke > 20) {
        c.woke = f.t;
        const col = new THREE.Color().setHSL((c.prisms[0].hue * 0.4 + 0.55) % 1, 0.6, 0.75);
        this.sparks.emit(this.v.set(c.x, c.y + (c.great ? 2.5 : 1.2), c.z), c.great ? 26 : 12, col, c.great ? 1.2 : 0.7);
      }
      const want = f.t - c.woke < 14 ? 1 : 0;
      c.glow += (want - c.glow) * Math.min(1, f.dt * (want ? 1.5 : 0.2));
      for (let k = 0; k < c.prisms.length && np < MAX_PRISMS; k++) pc[np++ * 3 + 1] = c.glow;
      if (c.great && nb < MAX_BEAMS) ba[nb++] = 0.6 + c.glow * 1.4;
    }
    this.prismC.needsUpdate = true;
    this.beamA.needsUpdate = true;
  }

  /** Trees and crystals near a point, for the spirits to gather around. */
  anchors(): THREE.Vector3[] {
    return [
      ...this.activeTrees.map((t) => new V(t.x, t.y + SHAPES[t.kind].height * t.scale * 0.8, t.z)),
      ...this.activeClusters.map((c) => new V(c.x, c.y + 2, c.z)),
    ];
  }

  setQuality(tier: number): void {
    // the seen-through-the-ground effects go first when frames run slow
    this.rootLines.visible = tier <= 2;
    this.web.visible = tier <= 2;
  }
}

/* ================================================================ spirits */
const TRAIL = 22;
interface Spirit {
  p: THREE.Vector3;
  v: THREE.Vector3;
  home: THREE.Vector3;
  curious: number;
  size: number;
  hue: number;
  phase: number;
  hist: THREE.Vector3[];
  lastHist: number;
}

/** Wisps of light with flowing veils. They drift among trees and crystals, and now and then
    one comes to keep the wanderer company. */
export class Spirits {
  group = new THREE.Group();
  private list: Spirit[] = [];
  private veil: THREE.Points;
  private heads: THREE.Points;
  private anchorsAt = -100;
  private anchors: THREE.Vector3[] = [];
  private tmp = new V();
  private side = new V();

  constructor(
    private creation: Creation,
    count = 12,
  ) {
    for (let i = 0; i < count; i++) {
      const great = i < 2;
      this.list.push({
        p: new V(), v: new V(), home: new V(),
        curious: 0, size: great ? 1.6 : 0.7 + Math.random() * 0.5, hue: Math.random(), phase: Math.random() * 100,
        hist: Array.from({ length: TRAIL }, () => new V()), lastHist: 0,
      });
    }
    // veils: a trail of soft light along each spirit's recent path, rippling as it flows
    const n = count * TRAIL;
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(n * 3), 3).setUsage(THREE.DynamicDrawUsage));
    const trail = new Float32Array(n * 3); // along 0..1, size, hue
    for (let s = 0; s < count; s++)
      for (let k = 0; k < TRAIL; k++) trail.set([k / (TRAIL - 1), this.list[s].size, this.list[s].hue], (s * TRAIL + k) * 3);
    g.setAttribute("aTrail", new THREE.BufferAttribute(trail, 3));
    this.veil = new THREE.Points(
      g,
      new THREE.ShaderMaterial({
        uniforms: U,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        vertexShader: /* glsl */ `
          attribute vec3 aTrail;varying vec3 vC;varying float vA;
          ${GLSL_COMMON}
          void main(){vec4 mv=viewMatrix*vec4(position,1.0);float d=-mv.z;
            float s=aTrail.x;
            vC=mix(mix(vec3(0.7,0.85,1.0),vec3(1.0,0.8,0.55),step(0.4,aTrail.z)),vec3(0.95,0.7,1.0),step(0.75,aTrail.z));
            vC=mix(vC,vec3(1.0),0.3*(1.0-s));
            vA=pow(1.0-s,1.5)*0.45*(1.0-fogF(d));
            gl_Position=projectionMatrix*mv;
            gl_PointSize=clamp(aTrail.y*mix(0.55,0.15,s)*uPx/max(d,0.5),1.5,80.0);}`,
        fragmentShader: /* glsl */ `
          varying vec3 vC;varying float vA;
          void main(){float r=length(gl_PointCoord-0.5)*2.0;
            gl_FragColor=vec4(vC*exp(-r*r*4.0)*vA,1.0);}`,
      }),
    );
    this.veil.frustumCulled = false;
    const hg = new THREE.BufferGeometry();
    hg.setAttribute("position", new THREE.BufferAttribute(new Float32Array(count * 3), 3).setUsage(THREE.DynamicDrawUsage));
    hg.setAttribute("aSize", new THREE.BufferAttribute(new Float32Array(this.list.map((s) => s.size)), 1));
    hg.setAttribute("aHue", new THREE.BufferAttribute(new Float32Array(this.list.map((s) => s.hue)), 1));
    this.heads = new THREE.Points(
      hg,
      new THREE.ShaderMaterial({
        uniforms: U,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        vertexShader: /* glsl */ `
          attribute float aSize;attribute float aHue;varying vec3 vC;varying float vD;
          ${GLSL_COMMON}
          void main(){vec4 mv=viewMatrix*vec4(position,1.0);vD=-mv.z;gl_Position=projectionMatrix*mv;
            vC=mix(mix(vec3(0.8,0.9,1.0),vec3(1.0,0.86,0.66),step(0.4,aHue)),vec3(1.0,0.8,1.0),step(0.75,aHue));
            gl_PointSize=clamp(aSize*0.9*uPx/max(vD,0.5),2.0,120.0);}`,
        fragmentShader: /* glsl */ `
          varying vec3 vC;varying float vD;
          ${GLSL_COMMON}
          void main(){float r=length(gl_PointCoord-0.5)*2.0;
            float a=exp(-r*r*6.0)*1.2+smoothstep(0.25,0.0,r)*1.6;
            gl_FragColor=vec4(vC*a*(1.0-fogF(vD)),1.0);}`,
      }),
    );
    this.heads.frustumCulled = false;
    this.group.add(this.veil, this.heads);
  }

  private placeNear(s: Spirit, player: THREE.Vector3): void {
    const a = this.anchors.length ? this.anchors[Math.floor(Math.random() * this.anchors.length)] : null;
    if (a && a.distanceTo(player) < 60) s.home.copy(a);
    else s.home.set(player.x + (Math.random() - 0.5) * 50, 0, player.z + (Math.random() - 0.5) * 50).setY(heightAt(s.home.x, s.home.z) + 3);
    s.p.copy(s.home).add(this.tmp.set(0, 2, 0));
    for (const h of s.hist) h.copy(s.p);
  }

  update(f: LifeFrame, camera: THREE.Camera): void {
    if (f.t - this.anchorsAt > 3 || this.anchorsAt < 0) {
      this.anchorsAt = f.t;
      this.anchors = this.creation.anchors().filter((a) => Math.hypot(a.x - f.player.x, a.z - f.player.z) < 55);
    }
    const hp = this.heads.geometry.attributes.position as THREE.BufferAttribute;
    const vp = this.veil.geometry.attributes.position as THREE.BufferAttribute;
    const ha = hp.array as Float32Array, va = vp.array as Float32Array;
    const cam = camera.position;
    this.list.forEach((s, i) => {
      const far = s.p.distanceTo(f.player);
      if (s.home.lengthSq() === 0 || far > 75) this.placeNear(s, f.player);
      // near the wanderer, one may decide to come along for a while
      if (far < 10 && s.curious <= 0 && Math.random() < f.dt * 0.08) s.curious = 14 + Math.random() * 16;
      s.curious -= f.dt;
      const t = f.t * (0.35 + (i % 5) * 0.06) + s.phase;
      if (s.curious > 0) {
        const a = f.t * 0.7 + i * 2.1;
        this.tmp.set(f.player.x + Math.cos(a) * 2.2, f.player.y + 1.8 + Math.sin(f.t * 0.9 + i) * 0.5, f.player.z + Math.sin(a) * 2.2);
      } else {
        // slow loops around a crown or a crystal
        const r = 2.5 + (i % 3) * 1.5 + s.size;
        this.tmp.set(s.home.x + Math.cos(t) * r, s.home.y + Math.sin(t * 1.7) * 1.2, s.home.z + Math.sin(t * 0.8) * r);
        if (Math.random() < f.dt * 0.01) this.placeNear(s, f.player);
      }
      s.v.addScaledVector(this.tmp.sub(s.p), f.dt * 0.9).multiplyScalar(1 - f.dt * 0.9);
      s.p.addScaledVector(s.v, f.dt);
      s.p.y = Math.max(s.p.y, Math.max(heightAt(s.p.x, s.p.z), WATER_Y) + 0.6);
      // the veil remembers where it has been
      if (f.t - s.lastHist > 0.1) {
        s.lastHist = f.t;
        const last = s.hist.pop()!;
        s.hist.unshift(last.copy(s.p));
      }
      s.hist[0].copy(s.p);
      ha.set([s.p.x, s.p.y, s.p.z], i * 3);
      for (let k = 0; k < TRAIL; k++) {
        // the veil ripples sideways as it trails, like cloth in water
        const a = s.hist[Math.max(0, k - 1)], b = s.hist[Math.min(TRAIL - 1, k + 1)];
        this.tmp.subVectors(b, a);
        if (this.tmp.lengthSq() < 1e-6) this.tmp.set(0, -1, 0);
        this.side.subVectors(cam, s.hist[k]).cross(this.tmp).normalize();
        const wave = Math.sin(f.t * 3.2 - k * 0.55 + i) * s.size * 0.18 * (k / TRAIL);
        const h = s.hist[k];
        const v = (i * TRAIL + k) * 3;
        va[v] = h.x + this.side.x * wave;
        va[v + 1] = h.y + this.side.y * wave - k * 0.015;
        va[v + 2] = h.z + this.side.z * wave;
      }
    });
    hp.needsUpdate = true;
    vp.needsUpdate = true;
  }
}
