/* The open world: one analytic height function, so collision, the camera, the grass and the
   meshes all agree. Water level is y = 0; wherever the land dips below it, there is a lake.
   - Rolling hills, soft dunes and hollows that hold lakes.
   - A gentle meadow where the wanderer wakes.
   - Mountains rising far out, so the world has an edge you see but never reach.
   The ground is streamed in square chunks around the wanderer. */
import * as THREE from "three";

export const WATER_Y = 0;
/** Where the wanderer wakes, and faces. */
export const SPAWN = { x: 0, z: 0, heading: 0 };


/* ---------- noise ---------- */
function hash(x: number, z: number): number {
  const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return s - Math.floor(s);
}
export function vnoise(x: number, z: number): number {
  const xi = Math.floor(x), zi = Math.floor(z);
  const xf = x - xi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
  const a = hash(xi, zi), b = hash(xi + 1, zi), c = hash(xi, zi + 1), d = hash(xi + 1, zi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export function fbm(x: number, z: number): number {
  return vnoise(x, z) * 0.5 + vnoise(x * 2.03 + 17, z * 2.03 - 9) * 0.28 + vnoise(x * 4.1 - 5, z * 4.1 + 3) * 0.14 + vnoise(x * 8.3 + 11, z * 8.3 + 7) * 0.08;
}
export const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const mix = (a: number, b: number, t: number) => a + (b - a) * t;

function rawHeight(x: number, z: number): number {
  const n1 = fbm(x * 0.0035, z * 0.0035);
  const n2 = fbm(x * 0.012 + 31, z * 0.012 - 17);
  const n3 = vnoise(x * 0.07, z * 0.07);
  let h = (n1 - 0.43) * 40 + (n2 - 0.5) * 9 + (n3 - 0.5) * 0.9;
  // soft dunes on the higher ground
  const r = 1 - Math.abs(vnoise(x * 0.018 + 5, z * 0.018 - 3) * 2 - 1);
  h += r * r * 3.2 * smooth(0.42, 0.62, n1);
  // the waking meadow: a gentle rise beside the water
  const ds = Math.hypot(x - SPAWN.x, z - SPAWN.z);
  h = mix(h, 2.4 + (n2 - 0.5) * 1.6, smooth(70, 18, ds));
  // mountains far out: the edge of the world
  h += smooth(430, 700, Math.hypot(x, z)) * (40 + n2 * 50);
  return h;
}

/** Landmarks: roughly where each should stand; each settles on the nearest calm, dry ground. */
const WISHED_SITES: [number, number][] = [
  [58, -130], // the beam and ring
  [-150, -70], // pillars and veil
  [-50, 118], // the spiral garden
  [170, 55], // the throne on its square of light
  [-120, -235], // the arch of three stones
  [120, 205], // the crossing rings
  [215, -175], // the chariot, with its road to the horizon
];
function settle([x, z]: [number, number]): [number, number] {
  for (let r = 0; r <= 140; r += 7) {
    const steps = r === 0 ? 1 : 16;
    for (let k = 0; k < steps; k++) {
      const a = (k / steps) * Math.PI * 2;
      const px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
      const h = rawHeight(px, pz);
      if (h < 2 || h > 14) continue;
      let flat = true;
      for (const [dx, dz] of [[8, 0], [-8, 0], [0, 8], [0, -8]]) if (Math.abs(rawHeight(px + dx, pz + dz) - h) > 2.2) flat = false;
      if (flat) return [px, pz];
    }
  }
  return [x, z];
}
/** Where the landmarks stand. Positions are shared with stations.ts. */
export const LANDMARK_SITES: [number, number][] = WISHED_SITES.map(settle);

const PADS = LANDMARK_SITES.map(([x, z]) => ({ x, z, h: Math.max(1.2, rawHeight(x, z)) }));

/** Ground height at (x, z). Below WATER_Y means water. */
export function heightAt(x: number, z: number): number {
  let h = rawHeight(x, z);
  for (const p of PADS) {
    const d = Math.hypot(x - p.x, z - p.z);
    if (d < 11) h = mix(h, p.h, smooth(11, 6.5, d));
  }
  return h;
}

/** Which kind of ground this is, 0–1 each: meadow (for grass and flowers), sand, stone. */
export function groundKind(x: number, z: number, h = heightAt(x, z)): { meadow: number; sand: number; stone: number } {
  const sand = smooth(1.2, 0.2, h);
  const stone = smooth(9, 16, h) * smooth(0.35, 0.65, fbm(x * 0.01 + 50, z * 0.01));
  const meadow = Math.max(0, 1 - sand - stone) * smooth(0.25, 0.5, fbm(x * 0.02 - 20, z * 0.02 + 40));
  return { meadow, sand, stone };
}

/** Circle colliders for solid features (pillars, stones). */
export interface Collider {
  x: number;
  z: number;
  r: number;
  top: number;
}
export const colliders: Collider[] = [];

/* ---------- streamed ground, in two levels of detail ----------
   Near the wanderer: fine 64 m tiles (a vertex every 2 m). Around them, out to ~640 m: coarse
   256 m tiles (every 8 m) that reach the mountains at the world's edge, so the horizon is real
   land fading into haze. Where the near tiles cover the ground, the coarse tiles' vertices are
   sunk out of sight. Normals come from the height function itself, so tiles meet without seams,
   and hollows are shaded by how much sky they see. */
interface Level {
  chunk: number;
  seg: number;
  ring: number;
}
const NEAR: Level = { chunk: 64, seg: 32, ring: 2 }; // 5 × 5 tiles: ±160 m
const FAR: Level = { chunk: 256, seg: 32, ring: 2 }; // 5 × 5 tiles: ±640 m

const C = {
  wet: new THREE.Color("#35334f"),
  sand: new THREE.Color("#a79dc0"),
  meadowA: new THREE.Color("#3f5f73"), // silver-blue
  meadowB: new THREE.Color("#58497e"), // violet
  meadowC: new THREE.Color("#6d5268"), // rose
  stone: new THREE.Color("#4b4563"),
  snow: new THREE.Color("#bcb9da"),
};

/** The ground's material: moonlit, with sand that ripples and glitters, and no drawn lines. */
function groundMaterial(): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0 });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uMoon = { value: new THREE.Vector3(0.06, 0.16, -1).normalize() };
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nattribute vec2 aGround;varying vec2 vGround;varying vec3 vGW;")
      .replace("#include <project_vertex>", "#include <project_vertex>\nvGround=aGround;vGW=(modelMatrix*vec4(transformed,1.0)).xyz;");
    sh.fragmentShader = sh.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
        varying vec2 vGround; // x: sky seen (1 open … darker in hollows), y: how sandy
        varying vec3 vGW;
        uniform vec3 uMoon;
        float gH(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
        float gN(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
          return mix(mix(gH(i),gH(i+vec2(1,0)),f.x),mix(gH(i+vec2(0,1)),gH(i+vec2(1,1)),f.x),f.y);}`,
      )
      .replace("#include <color_fragment>", "#include <color_fragment>\ndiffuseColor.rgb*=vGround.x;")
      .replace(
        "#include <normal_fragment_maps>",
        `#include <normal_fragment_maps>
        {
          float gd=length(vGW-cameraPosition);
          float near=1.0-smoothstep(12.0,55.0,gd);
          vec2 q=vGW.xz;
          // wind ripples in the sand, their direction wandering slowly across the dunes
          float ang=gN(q*0.015)*3.14159*1.5;
          vec2 dir=vec2(cos(ang),sin(ang));
          float ph=dot(q,dir)*2.6+gN(q*0.35)*3.0;
          vec2 slope=dir*cos(ph)*0.22*vGround.y;
          // soft unevenness everywhere else
          vec2 e=vec2(0.35,0.0);
          float b0=gN(q*1.7);
          slope+=vec2(gN(q*1.7+e.xy)-b0,gN(q*1.7+e.yx)-b0)*0.9*(1.0-vGround.y);
          vec3 dW=vec3(-slope.x,0.0,-slope.y)*near;
          normal=normalize(normal+mat3(viewMatrix)*dW);
        }`,
      )
      .replace(
        "#include <emissivemap_fragment>",
        `#include <emissivemap_fragment>
        {
          vec3 gv=normalize(cameraPosition-vGW);
          float gd=length(vGW-cameraPosition);
          // glitter: grains of sand that catch the light as you move
          vec2 gq=vGW.xz*22.0;vec2 cell=floor(gq);
          float h=gH(cell);
          float tw=gH(cell*1.7+floor(gv.xz*24.0+gv.y*11.0));
          float dot_=smoothstep(0.22,0.0,length(fract(gq)-0.5)); // a point of light, not a fleck
          float glit=step(0.975,h)*step(0.6,tw)*dot_*vGround.y*(1.0-smoothstep(3.0,18.0,gd));
          totalEmissiveRadiance+=vec3(1.0,0.93,0.82)*glit*2.2;
          // a soft sheen where the ground faces away toward the moon (light through the haze)
          float back=pow(max(dot(-gv,uMoon),0.0),3.0);
          totalEmissiveRadiance+=vec3(0.32,0.26,0.24)*back*(0.3+0.7*vGround.y)*0.18;
        }`,
      );
  };
  return m;
}

export class Terrain {
  group = new THREE.Group();
  private near = new Map<string, THREE.Mesh>();
  private far = new Map<string, THREE.Mesh>();
  private pool: { near: THREE.Mesh[]; far: THREE.Mesh[] } = { near: [], far: [] };
  private material = groundMaterial();
  private nc = [Infinity, Infinity];
  private fc = [Infinity, Infinity];
  private queue: (() => void)[] = [];
  private col = new THREE.Color();
  private tmp = new THREE.Color();

  /** The square the near tiles cover: coarse vertices inside it are sunk out of sight. */
  private nearBox(): [number, number, number, number] {
    const [cx, cz] = this.nc;
    return [(cx - NEAR.ring) * NEAR.chunk, (cz - NEAR.ring) * NEAR.chunk, (cx + NEAR.ring + 1) * NEAR.chunk, (cz + NEAR.ring + 1) * NEAR.chunk];
  }

  /** Keep the wanderer in the middle of both levels. `force` builds everything now. */
  update(x: number, z: number, force = false): void {
    const ncx = Math.floor(x / NEAR.chunk), ncz = Math.floor(z / NEAR.chunk);
    const fcx = Math.floor(x / FAR.chunk), fcz = Math.floor(z / FAR.chunk);
    const nearMoved = ncx !== this.nc[0] || ncz !== this.nc[1];
    if (force || nearMoved) {
      this.nc = [ncx, ncz];
      this.queue = [];
      this.stream(this.near, this.pool.near, NEAR, ncx, ncz, true);
    }
    if (force || nearMoved || fcx !== this.fc[0] || fcz !== this.fc[1]) {
      this.fc = [fcx, fcz];
      // far tiles are refilled after the near ones, since the square they give way to has moved
      this.stream(this.far, this.pool.far, FAR, fcx, fcz, false);
    }
    // a few tiles per frame, so walking never stutters
    const n = force ? this.queue.length : 2;
    for (let i = 0; i < n && this.queue.length; i++) this.queue.shift()!();
  }

  private stream(tiles: Map<string, THREE.Mesh>, pool: THREE.Mesh[], L: Level, cx: number, cz: number, isNear: boolean): void {
    const want = new Set<string>();
    for (let i = -L.ring; i <= L.ring; i++) for (let j = -L.ring; j <= L.ring; j++) want.add(`${cx + i},${cz + j}`);
    for (const [k, m] of tiles) {
      if (!want.has(k)) {
        this.group.remove(m);
        pool.push(m);
        tiles.delete(k);
      }
    }
    for (const k of want) {
      const [i, j] = k.split(",").map(Number);
      const have = tiles.get(k);
      if (have && isNear) continue; // near tiles never change
      if (have && !this.touchesNear(L, i, j)) continue; // far tiles change only where the near square moved
      this.queue.push(() => {
        const m = tiles.get(k) ?? pool.pop() ?? this.newMesh(L, isNear);
        this.fill(m, L, i, j, isNear);
        if (!tiles.has(k)) {
          tiles.set(k, m);
          this.group.add(m);
        }
      });
    }
  }

  private touchesNear(L: Level, i: number, j: number): boolean {
    const [x0, z0, x1, z1] = this.nearBox();
    const m = NEAR.chunk; // the old square was at most one near tile away
    return i * L.chunk < x1 + m && (i + 1) * L.chunk > x0 - m && j * L.chunk < z1 + m && (j + 1) * L.chunk > z0 - m;
  }

  private newMesh(L: Level, isNear: boolean): THREE.Mesh {
    const g = new THREE.PlaneGeometry(L.chunk, L.chunk, L.seg, L.seg);
    g.rotateX(-Math.PI / 2);
    const n = g.attributes.position.count;
    g.setAttribute("color", new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    g.setAttribute("aGround", new THREE.BufferAttribute(new Float32Array(n * 2), 2));
    const m = new THREE.Mesh(g, this.material);
    m.receiveShadow = isNear;
    m.frustumCulled = true;
    return m;
  }

  private fill(m: THREE.Mesh, L: Level, i: number, j: number, isNear: boolean): void {
    const ox = (i + 0.5) * L.chunk, oz = (j + 0.5) * L.chunk;
    m.position.set(ox, 0, oz);
    const g = m.geometry as THREE.BufferGeometry;
    const pos = g.attributes.position as THREE.BufferAttribute;
    const nor = g.attributes.normal as THREE.BufferAttribute;
    const col = g.attributes.color as THREE.BufferAttribute;
    const gr = g.attributes.aGround as THREE.BufferAttribute;
    const n = L.seg + 1, B = 4; // a border of four cells, for normals and the sky-seen shading
    const W = n + 2 * B;
    const step = L.chunk / L.seg;
    const H = new Float32Array(W * W);
    for (let b = 0; b < W; b++)
      for (let a = 0; a < W; a++) H[b * W + a] = heightAt(ox + ((a - B) - L.seg / 2) * step, oz + ((b - B) - L.seg / 2) * step);
    const box = isNear ? null : this.nearBox();
    for (let v = 0; v < pos.count; v++) {
      const a = (v % n) + B, b = Math.floor(v / n) + B;
      const lx = (a - B - L.seg / 2) * step, lz = (b - B - L.seg / 2) * step;
      const x = ox + lx, z = oz + lz;
      const h = H[b * W + a];
      // hidden beneath the near tiles?
      const sunk = box && x > box[0] + 0.01 && x < box[2] - 0.01 && z > box[1] + 0.01 && z < box[3] - 0.01;
      pos.setXYZ(v, lx, sunk ? h - 40 : h, lz);
      const dx = H[b * W + a - 1] - H[b * W + a + 1], dz = H[(b - 1) * W + a] - H[(b + 1) * W + a];
      const inv = 1 / Math.hypot(dx, 2 * step, dz);
      nor.setXYZ(v, dx * inv, 2 * step * inv, dz * inv);
      // how much sky this spot sees: hollows darker, crests a little brighter
      let avg = 0;
      for (const [da, db] of [[-B, 0], [B, 0], [0, -B], [0, B], [-2, -2], [2, 2], [-2, 2], [2, -2]]) avg += H[(b + db) * W + a + da];
      avg /= 8;
      const sky = Math.min(1.12, Math.max(0.5, 1 - ((avg - h) * 0.9) / Math.max(4, step * B)));
      const k = groundKind(x, z, h);
      const region = fbm(x * 0.004 + 9, z * 0.004 - 4);
      this.col.copy(C.meadowA).lerp(C.meadowB, smooth(0.35, 0.6, region)).lerp(C.meadowC, smooth(0.6, 0.78, region));
      this.col.lerp(this.tmp.copy(C.sand), k.sand).lerp(C.stone, k.stone).lerp(C.snow, smooth(40, 70, h));
      if (h < 0.1) this.col.lerp(C.wet, smooth(0.1, -0.6, h));
      col.setXYZ(v, this.col.r, this.col.g, this.col.b);
      gr.setXY(v, sky, Math.min(1, k.sand + smooth(0.45, 0.62, fbm(x * 0.01 - 30, z * 0.01 + 12)) * (1 - k.stone) * 0.6));
    }
    pos.needsUpdate = nor.needsUpdate = col.needsUpdate = gr.needsUpdate = true;
    g.computeBoundingSphere();
    g.computeBoundingBox();
  }
}
