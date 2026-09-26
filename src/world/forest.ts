/* The forests beyond. Real trees grow only within about a hundred metres; past them, out to
   half a kilometre, each tree that would stand there is drawn as its own likeness: a flat
   picture of that very tree kind (made once, from its own grown limbs, curls and glints),
   always turned to face you. From afar the land is wooded where it should be, and walking in,
   each likeness gives way to the living tree at the same place. */
import * as THREE from "three/webgpu";
import { T } from "../gpu/tsl";
import { grow, SHAPES, TCELL, type Creation } from "./creation";

const { attribute, cameraPosition, float, length, normalize, positionLocal, smoothstep, texture, uv, vec2, vec3, vec4 } = T;

const RING = 40; // cells each way: ~480 m
const NEAR = 96; // metres: inside this, the real trees stand
const MAX = 7000;
const KINDS = SHAPES.length;

/** Side views of each tree kind, side by side in one texture: dark limbs, a few soft glints. */
function atlas(): { tex: THREE.CanvasTexture; size: { w: number; h: number; base: number }[] } {
  const S = 256;
  const c = document.createElement("canvas");
  c.width = S * KINDS;
  c.height = S;
  const g = c.getContext("2d")!;
  const size: { w: number; h: number; base: number }[] = [];
  SHAPES.forEach((shape, k) => {
    const { limbs, tips } = grow(shape, 0.137 + k * 0.211);
    let minX = 0, maxX = 0, maxY = 0;
    for (const l of limbs) for (const p of l.pts) (minX = Math.min(minX, p.x)), (maxX = Math.max(maxX, p.x)), (maxY = Math.max(maxY, p.y));
    const half = Math.max(-minX, maxX) + 0.8, top = maxY + 0.9, base = 0.4;
    const scale = Math.min((S * 0.5) / half, (S * 0.96) / (top + base));
    const X = (x: number) => k * S + S / 2 + x * scale, Y = (y: number) => S - (y + base) * scale;
    g.lineCap = "round";
    g.strokeStyle = "rgba(10,9,20,1)";
    for (const l of limbs) {
      g.lineWidth = Math.max(1.2, (l.r0 + l.r1) * scale);
      g.beginPath();
      l.pts.forEach((p, i) => (i ? g.lineTo(X(p.x), Y(p.y)) : g.moveTo(X(p.x), Y(p.y))));
      g.stroke();
    }
    // the crown's glints, small as on the living trees (larger, they read as white puffs)
    for (const t of tips) {
      const grd = g.createRadialGradient(X(t.x), Y(t.y), 0, X(t.x), Y(t.y), 0.45 * scale);
      grd.addColorStop(0, "rgba(255,236,200,0.6)");
      grd.addColorStop(1, "rgba(255,236,200,0)");
      g.fillStyle = grd;
      g.fillRect(X(t.x) - scale, Y(t.y) - scale, 2 * scale, 2 * scale);
    }
    size.push({ w: (half * 2 * S) / (S * 1), h: S / scale, base });
  });
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  return { tex, size };
}

export class Forest {
  mesh: THREE.Mesh;
  private geo = new THREE.InstancedBufferGeometry();
  private aTree: THREE.InstancedBufferAttribute; // x, y, z, scale
  private aKind: THREE.InstancedBufferAttribute; // kind, hue
  private cx = Infinity;
  private cz = Infinity;
  private rows: number[] = []; // rows still to gather (spread over frames)
  private pending: number[][] = [];

  constructor(private creation: Creation) {
    const { tex, size } = atlas();
    const quad = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0);
    this.geo.setAttribute("position", quad.attributes.position);
    this.geo.setAttribute("uv", quad.attributes.uv);
    this.geo.setIndex(quad.index);
    this.aTree = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 4), 4);
    this.aKind = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 2), 2);
    this.geo.setAttribute("aTree", this.aTree);
    this.geo.setAttribute("aKind", this.aKind);
    this.geo.instanceCount = 0;
    const mat = new THREE.MeshBasicNodeMaterial({ transparent: false, alphaTest: 0.35 });
    const tree = attribute("aTree", "vec4"), kind = attribute("aKind", "vec2");
    // each kind's picture is S wide and S tall; in metres it is h tall, and as wide
    const hK = size.map((z) => z.h), bK = size.map((z) => z.base);
    const pick = (arr: number[]) => arr.slice(1).reduce((acc: ReturnType<typeof float>, v, i) => kind.x.greaterThan(i + 0.5).select(float(v), acc), float(arr[0]));
    const h = pick(hK).mul(tree.w), base = pick(bK).mul(tree.w);
    const toCam = vec2(cameraPosition.x.sub(tree.x), cameraPosition.z.sub(tree.z));
    const side = normalize(vec2(toCam.y, toCam.x.negate()));
    const P = positionLocal;
    mat.positionNode = vec3(tree.x.add(side.x.mul(P.x).mul(h)), tree.y.sub(base).add(P.y.mul(h)), tree.z.add(side.y.mul(P.x).mul(h)));
    const q = vec2(uv().x.add(kind.x).div(KINDS), uv().y);
    const t = texture(tex, q);
    // walking in, the likeness thins away as the living tree takes its place
    const d = length(toCam);
    const keep = smoothstep(NEAR - 8, NEAR + 14, d);
    mat.colorNode = vec4(t.rgb.mul(vec3(1.0, 0.95, 1.05)).mul(kind.y.mul(0.3).add(0.85)), 1);
    mat.opacityNode = t.a.mul(keep);
    this.mesh = new THREE.Mesh(this.geo, mat);
    this.mesh.frustumCulled = false;
  }

  update(player: THREE.Vector3): void {
    const cx = Math.floor(player.x / TCELL), cz = Math.floor(player.z / TCELL);
    if (Math.abs(cx - this.cx) + Math.abs(cz - this.cz) >= 4) {
      // moved on: gather the ring afresh, a few rows a frame so walking never stutters
      this.cx = cx;
      this.cz = cz;
      this.rows = Array.from({ length: RING * 2 + 1 }, (_, k) => k - RING);
      this.pending = [];
    }
    for (let n = 0; n < 6 && this.rows.length; n++) {
      const i = this.rows.shift()!;
      for (let j = -RING; j <= RING; j++) {
        if (i * i + j * j < 7 * 7) continue; // the living trees are there
        const t = this.creation.treeAt(this.cx + i, this.cz + j);
        if (t) this.pending.push([t.x, t.y, t.z, t.scale, t.kind, t.hue]);
      }
      if (!this.rows.length) this.commit();
    }
  }

  private commit(): void {
    const a = this.aTree.array as Float32Array, k = this.aKind.array as Float32Array;
    const n = Math.min(MAX, this.pending.length);
    for (let i = 0; i < n; i++) {
      const [x, y, z, s, kind, hue] = this.pending[i];
      a.set([x, y, z, s], i * 4);
      k.set([kind, hue], i * 2);
    }
    this.geo.instanceCount = n;
    this.aTree.needsUpdate = this.aKind.needsUpdate = true;
  }
}
