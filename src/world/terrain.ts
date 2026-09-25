/* The open world: one analytic height function, so collision, the camera, the grass and the
   meshes all agree. Water level is y = 0; wherever the land dips below it, there is a lake.
   - Rolling hills, soft dunes and hollows that hold lakes.
   - A gentle meadow where the wanderer wakes.
   - Mountains rising far out, so the world has an edge you see but never reach.
   The ground is streamed in square chunks around the wanderer. */
import * as THREE from "three";
import { surface } from "./textures";

export const WATER_Y = 0;
/** The world's radius: mountains rise at its edge, about 4 km out. */
export const WORLD_R = 4000;
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
  // broad highlands and lowlands, a kilometre or two across, with great lakes between
  h += (fbm(x * 0.0005 + 3, z * 0.0005 - 7) - 0.5) * 36 * smooth(60, 250, ds);
  // mountains far out: the edge of the world
  h += smooth(WORLD_R - 700, WORLD_R + 300, Math.hypot(x, z)) * (60 + n2 * 70);
  // deep water: the shallows by the shore stay gentle, and the lakes fall away to real depths
  if (h < 0) h *= 1 + 1.6 * smooth(0.5, 6, -h);
  return h;
}

/** Where each archetype's home should stand, roughly, and on what kind of ground; each
    settles on the nearest place that suits it.
    - land: calm, dry, level ground;   high: a height with a view;
    - shore: level ground at the water's edge;   deep: the floor of deep water;
    - island: open water, where a small island rises for it. */
export type SiteKind = "land" | "high" | "shore" | "deep" | "island";
const WISHED_SITES: { at: [number, number]; kind: SiteKind }[] = [
  // the Mind, around the shore where the wanderer wakes (a journey on foot, a short flight)
  { at: [232, -520], kind: "land" }, // I    the beam and ring
  { at: [-600, -280], kind: "land" }, // II   pillars and veil
  { at: [-200, 472], kind: "land" }, // III  the spiral garden
  { at: [680, 220], kind: "land" }, // IV   the throne on its square of light
  { at: [-480, -940], kind: "land" }, // V    the arch of three stones
  { at: [480, 820], kind: "land" }, // VI   the crossing rings
  { at: [900, -380], kind: "land" }, // VII  the chariot, with its road to the horizon
  // the Body, out to the east
  { at: [1350, 150], kind: "land" }, // VIII  Strength, the lion at rest
  { at: [1700, -500], kind: "high" }, // IX   the Hermit, on the heights with his lamp
  { at: [2050, -50], kind: "land" }, // X    the Wheel
  { at: [1450, 700], kind: "land" }, // XI   Justice, the scales and the sword
  { at: [1150, 1300], kind: "shore" }, // XII the Hanged Man, above still water
  { at: [1850, 950], kind: "land" }, // XIII Death, under the rainbow
  { at: [2050, 1250], kind: "shore" }, // XIV Temperance, between water and land
  // the Spirit, out to the west
  { at: [-1100, 350], kind: "land" }, // XV   the Devil
  { at: [-1400, -1350], kind: "high" }, // XVI the Tower, on the heights
  { at: [-1350, 50], kind: "shore" }, // XVII the Star, pouring into the lake
  { at: [-1900, 250], kind: "deep" }, // XVIII the Moon, in the deep
  { at: [-1000, -750], kind: "land" }, // XIX the Sun, in a ring of flowers
  { at: [-1800, -350], kind: "deep" }, // XX  Judgement, rising from the deep
  { at: [-2050, -1100], kind: "high" }, // XXI the World
  // the Choice, on a small island in the northern lake
  { at: [150, -1650], kind: "island" }, // XXII
];
function flatAround(x: number, z: number, h: number, r: number, tol: number): boolean {
  for (const [dx, dz] of [[r, 0], [-r, 0], [0, r], [0, -r]]) if (Math.abs(rawHeight(x + dx, z + dz) - h) > tol) return false;
  return true;
}
function suits(kind: SiteKind, x: number, z: number): boolean {
  const h = rawHeight(x, z);
  switch (kind) {
    case "land":
      return h >= 2 && h <= 14 && flatAround(x, z, h, 8, 2.2);
    case "high":
      return h >= 18 && h <= 70 && flatAround(x, z, h, 8, 3);
    case "shore": {
      if (h < 1.5 || h > 4 || !flatAround(x, z, h, 6, 1.8)) return false;
      for (let a = 0; a < 6.28; a += 0.5) if (rawHeight(x + Math.cos(a) * 16, z + Math.sin(a) * 16) < -1) return true;
      return false;
    }
    case "deep":
      return h < -16 && flatAround(x, z, h, 9, 3.5);
    case "island": {
      if (h > -8) return false;
      for (let a = 0; a < 6.28; a += 0.785) if (rawHeight(x + Math.cos(a) * 40, z + Math.sin(a) * 40) > -3) return false;
      return true;
    }
  }
}
function settle({ at: [x, z], kind }: { at: [number, number]; kind: SiteKind }): [number, number] {
  // the Mind's homes keep their places; the others may look further for the ground they need
  const reach = kind === "land" && Math.hypot(x, z) < 1200 ? 140 : 520;
  const step = reach > 140 ? 10 : 7;
  for (let r = 0; r <= reach; r += step) {
    const steps = r === 0 ? 1 : reach === 140 ? 16 : Math.max(16, Math.round((r * Math.PI * 2) / 25));
    for (let k = 0; k < steps; k++) {
      const a = (k / steps) * Math.PI * 2;
      const px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
      if (suits(kind, px, pz)) return [px, pz];
    }
  }
  return [x, z];
}
/** Where the landmarks stand, and on what. Positions are shared with stations.ts. */
export const LANDMARK_SITES: [number, number][] = WISHED_SITES.map(settle);
export const LANDMARK_KINDS: SiteKind[] = WISHED_SITES.map((w) => w.kind);

// each home's ground is levelled: dry homes a little above the water, deep ones on the floor,
// and the island raised out of the lake
const PADS = LANDMARK_SITES.map(([x, z], i) => {
  const kind = LANDMARK_KINDS[i], raw = rawHeight(x, z);
  const h = kind === "deep" ? raw : kind === "island" ? 1.6 : Math.max(1.2, raw);
  const [outer, inner] = kind === "island" ? [26, 12] : kind === "deep" ? [15, 9] : [11, 6.5];
  return { x, z, h, outer, inner };
});

/** Ground height at (x, z). Below WATER_Y means water. */
export function heightAt(x: number, z: number): number {
  let h = rawHeight(x, z);
  for (const p of PADS) {
    if (Math.abs(x - p.x) > p.outer || Math.abs(z - p.z) > p.outer) continue;
    const d = Math.hypot(x - p.x, z - p.z);
    if (d < p.outer) h = mix(h, p.h, smooth(p.outer, p.inner, d));
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

/* ---------- streamed ground, in three levels of detail ----------
   Near the wanderer: fine 64 m tiles (a vertex every 2 m). Around them, out to ~640 m: coarse
   256 m tiles (every 8 m). Beyond, out to ~2.5 km: broad 1 km tiles (every 32 m), which you see
   when you fly high above the haze. Where a finer level covers the ground, the coarser level's
   vertices are sunk out of sight. Normals come from the height function itself, so tiles meet without seams,
   and hollows are shaded by how much sky they see. */
interface Level {
  chunk: number;
  seg: number;
  ring: number;
}
const LEVELS: Level[] = [
  { chunk: 64, seg: 32, ring: 2 }, // near: a vertex every 2 m, ±160 m
  { chunk: 256, seg: 32, ring: 2 }, // far: every 8 m, ±640 m
  { chunk: 1024, seg: 32, ring: 2 }, // horizon: every 32 m, ±2.5 km (seen from the air)
];

const C = {
  wet: new THREE.Color("#35334f"),
  sand: new THREE.Color("#a79dc0"),
  meadowA: new THREE.Color("#3f5f73"), // silver-blue
  meadowB: new THREE.Color("#58497e"), // violet
  meadowC: new THREE.Color("#6d5268"), // rose
  stone: new THREE.Color("#4b4563"),
  snow: new THREE.Color("#bcb9da"),
};

/** The ground's material: real scanned sand, grass and rock (tinted to the moonlit palette),
    with glitter in the sand and no drawn lines. */
/** Shared with the game loop: the time, for the caustics that dance on the floor of the lakes. */
export const groundUniforms = { uT: { value: 0 } };
function groundMaterial(): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0 });
  const [sand, meadow, rock] = [surface("sand"), surface("meadow"), surface("rock")];
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uMoon = { value: new THREE.Vector3(0.06, 0.16, -1).normalize() };
    sh.uniforms.uT = groundUniforms.uT;
    Object.assign(sh.uniforms, {
      tSandD: { value: sand.diff }, tSandN: { value: sand.nor },
      tMeadowD: { value: meadow.diff }, tMeadowN: { value: meadow.nor },
      tRockD: { value: rock.diff }, tRockN: { value: rock.nor },
    });
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nattribute vec3 aGround;varying vec3 vGround;varying vec3 vGW;")
      .replace("#include <project_vertex>", "#include <project_vertex>\nvGround=aGround;vGW=(modelMatrix*vec4(transformed,1.0)).xyz;");
    sh.fragmentShader = sh.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
        varying vec3 vGround; // x: sky seen (1 open … darker in hollows), y: how sandy, z: how rocky
        varying vec3 vGW;
        uniform vec3 uMoon;uniform float uT;
        uniform sampler2D tSandD,tSandN,tMeadowD,tMeadowN,tRockD,tRockN;
        // caustics: light through the moving surface, gathered into a slowly shifting web.
        // Two layers of cells whose edges are bright, taken together so only the web remains.
        vec2 cH2(vec2 p){p=vec2(dot(p,vec2(127.1,311.7)),dot(p,vec2(269.5,183.3)));return fract(sin(p)*43758.5453);}
        float cWeb(vec2 p,float t){
          vec2 i=floor(p),f=fract(p);float d1=8.0,d2=8.0;
          for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++){
            vec2 g=vec2(float(x),float(y));vec2 o=0.5+0.42*sin(t+6.2831*cH2(i+g));
            float d=length(g+o-f);if(d<d1){d2=d1;d1=d;}else if(d<d2)d2=d;}
          return d2-d1;
        }
        float gH(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
        float gN(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
          return mix(mix(gH(i),gH(i+vec2(1,0)),f.x),mix(gH(i+vec2(0,1)),gH(i+vec2(1,1)),f.x),f.y);}
        // two scales of the same texture, blended by a slow noise, so no repeat ever shows
        vec4 samp(sampler2D t,vec2 q,float s){
          vec2 b=mat2(0.8,-0.6,0.6,0.8)*q/(s*3.7);
          return mix(texture2D(t,q/s),texture2D(t,b),smoothstep(0.25,0.75,gN(q*0.02))*0.6);
        }
        vec3 gW(){float s=vGround.y,r=vGround.z;return vec3(s,r,max(0.0,1.0-s-r));} // sand, rock, meadow`,
      )
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
        {
          diffuseColor.rgb*=vGround.x;
          vec3 w=gW();vec2 q=vGW.xz;
          vec3 det=samp(tSandD,q,3.0).rgb*1.9*w.x+samp(tRockD,q,4.0).rgb*2.2*w.y+samp(tMeadowD,q,2.2).rgb*2.6*w.z;
          // keep the moonlit palette: take mostly the scan's light and shade, a little of its colour
          det=mix(vec3(dot(det,vec3(0.3,0.5,0.2))),det,0.3);
          float fade=1.0-smoothstep(80.0,260.0,length(vGW-cameraPosition));
          diffuseColor.rgb*=mix(vec3(1.0),det,fade);
        }`,
      )
      .replace(
        "#include <normal_fragment_maps>",
        `#include <normal_fragment_maps>
        {
          // the scans' relief: each surface's normal map, blended as the ground is
          float near=1.0-smoothstep(20.0,90.0,length(vGW-cameraPosition));
          vec3 w=gW();vec2 q=vGW.xz;
          vec2 p=(samp(tSandN,q,3.0).xy*2.0-1.0)*w.x*0.9+(samp(tRockN,q,4.0).xy*2.0-1.0)*w.y*1.2+(samp(tMeadowN,q,2.2).xy*2.0-1.0)*w.z*0.7;
          vec3 dW=vec3(p.x,0.0,-p.y)*near;
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
          float glit=step(0.975,h)*step(0.6,tw)*dot_*vGround.y*(1.0-smoothstep(3.0,18.0,gd))*step(0.0,vGW.y);
          totalEmissiveRadiance+=vec3(1.0,0.93,0.82)*glit*2.2;
          if(vGW.y<-0.3){
            float dep=-vGW.y;
            // the web is warped by slow noise, so no cell is ever regular
            vec2 cq=vGW.xz*0.32;
            cq+=vec2(gN(cq*0.9+uT*0.05),gN(cq*0.9-uT*0.04+5.0))*1.4;
            float web=min(cWeb(cq,uT*0.5),cWeb(cq*1.37+7.3,-uT*0.4));
            float cau=pow(1.0-smoothstep(0.0,0.32,web),2.2)*(0.55+0.45*gN(cq*0.35+uT*0.03));
            float k=exp(-dep*0.08)*smoothstep(0.3,1.5,dep)*(1.0-smoothstep(12.0,40.0,gd));
            totalEmissiveRadiance+=vec3(0.45,0.75,0.95)*cau*k*0.3;
          }
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
  private tiles = LEVELS.map(() => new Map<string, THREE.Mesh>());
  private pools = LEVELS.map(() => [] as THREE.Mesh[]);
  private centre = LEVELS.map(() => [Infinity, Infinity]);
  private material = groundMaterial();
  private queue: (() => void)[] = [];
  private col = new THREE.Color();
  private tmp = new THREE.Color();

  /** The square a level's tiles cover: the next level's vertices inside it are sunk. */
  private box(li: number): [number, number, number, number] {
    const L = LEVELS[li], [cx, cz] = this.centre[li];
    return [(cx - L.ring) * L.chunk, (cz - L.ring) * L.chunk, (cx + L.ring + 1) * L.chunk, (cz + L.ring + 1) * L.chunk];
  }

  /** Keep the wanderer in the middle of every level. `force` builds everything now. */
  update(x: number, z: number, force = false): void {
    let innerMoved = false;
    LEVELS.forEach((L, li) => {
      const cx = Math.floor(x / L.chunk), cz = Math.floor(z / L.chunk);
      const moved = cx !== this.centre[li][0] || cz !== this.centre[li][1];
      if (force || moved || innerMoved) {
        if (li === 0) this.queue = [];
        this.centre[li] = [cx, cz];
        // coarser levels are refilled after finer ones, since the square they give way to moved
        this.stream(li, cx, cz, force || moved);
      }
      innerMoved = innerMoved || moved;
    });
    // a few tiles per frame, so walking never stutters
    const n = force ? this.queue.length : 2;
    for (let i = 0; i < n && this.queue.length; i++) this.queue.shift()!();
  }

  private stream(li: number, cx: number, cz: number, recentred: boolean): void {
    const L = LEVELS[li], tiles = this.tiles[li], pool = this.pools[li];
    const want = new Set<string>();
    for (let i = -L.ring; i <= L.ring; i++) for (let j = -L.ring; j <= L.ring; j++) want.add(`${cx + i},${cz + j}`);
    if (recentred)
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
      if (have && li === 0) continue; // the finest tiles never change
      if (have && !this.touchesInner(li, i, j)) continue; // coarser tiles change only where the finer square moved
      this.queue.push(() => {
        const m = tiles.get(k) ?? pool.pop() ?? this.newMesh(L, li === 0);
        this.fill(m, li, i, j);
        if (!tiles.has(k)) {
          tiles.set(k, m);
          this.group.add(m);
        }
      });
    }
  }

  private touchesInner(li: number, i: number, j: number): boolean {
    const L = LEVELS[li];
    const [x0, z0, x1, z1] = this.box(li - 1);
    const m = LEVELS[li - 1].chunk; // the old square was at most one finer tile away
    return i * L.chunk < x1 + m && (i + 1) * L.chunk > x0 - m && j * L.chunk < z1 + m && (j + 1) * L.chunk > z0 - m;
  }

  private newMesh(L: Level, isNear: boolean): THREE.Mesh {
    const g = new THREE.PlaneGeometry(L.chunk, L.chunk, L.seg, L.seg);
    g.rotateX(-Math.PI / 2);
    const n = g.attributes.position.count;
    g.setAttribute("color", new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    g.setAttribute("aGround", new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    const m = new THREE.Mesh(g, this.material);
    m.receiveShadow = isNear;
    m.frustumCulled = true;
    return m;
  }

  private fill(m: THREE.Mesh, li: number, i: number, j: number): void {
    const L = LEVELS[li];
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
    const box = li > 0 ? this.box(li - 1) : null;
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
      const sandy = Math.min(1, k.sand + smooth(0.45, 0.62, fbm(x * 0.01 - 30, z * 0.01 + 12)) * (1 - k.stone) * 0.6);
      gr.setXYZ(v, sky, sandy, Math.min(1 - sandy, k.stone + smooth(0.5, 1.0, 1 - nor.getY(v)) * 0.8));
    }
    pos.needsUpdate = nor.needsUpdate = col.needsUpdate = gr.needsUpdate = true;
    g.computeBoundingSphere();
    g.computeBoundingBox();
  }
}
