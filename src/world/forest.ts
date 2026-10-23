/* The forests beyond. Real trees grow only within about a hundred metres; past them, out to
   half a kilometre, each tree that would stand there is drawn as its own likeness: a flat
   picture of that very tree kind (made once, from its own grown limbs and leaf clusters),
   always turned to face you. The picture carries which way each part faces, so the likenesses
   are lit by the world's own moon or low sun and fill as everything else is (a lit impostor):
   one draw for them all. From afar the land is wooded where it should be, and walking in, each
   likeness gives way to the living tree at the same place. */
import * as THREE from "three/webgpu";
import { fogUniforms, T } from "../gpu/tsl";
import { grow, SHAPES, TCELL, type Creation } from "./creation";

const { attribute, cameraPosition, dot, float, fract, length, max, mix, normalize, positionLocal, pow, sin, smoothstep, step, texture, uv, vec2, vec3, vec4 } = T;

const RING = 40; // cells each way: ~480 m
const NEAR = 96; // metres: inside this, the real trees stand
const MAX = 7000;
const KINDS = SHAPES.length;

/** Side views of each tree kind, side by side in two textures drawn once: what it is (red: how
    light that part is, green: leaf or bark, alpha: coverage) and which way each part faces (a
    normal: each leaf cluster as part of one round crown, the limbs facing out), so the far trees
    can be lit by the world's own moon or low sun like everything else (a lit impostor). */
function atlas(): { tex: THREE.CanvasTexture; nrm: THREE.CanvasTexture; size: { w: number; h: number; base: number }[] } {
  const S = 256;
  const mk = () => {
    const c = document.createElement("canvas");
    c.width = S * KINDS;
    c.height = S;
    return c;
  };
  const c = mk(), cn = mk();
  const g = c.getContext("2d")!, gn = cn.getContext("2d")!;
  const size: { w: number; h: number; base: number }[] = [];
  const toN = (x: number, y: number, z: number) => {
    const l = Math.hypot(x, y, z) || 1;
    return `rgb(${Math.round((x / l * 0.5 + 0.5) * 255)},${Math.round((y / l * 0.5 + 0.5) * 255)},${Math.round((z / l * 0.5 + 0.5) * 255)})`;
  };
  SHAPES.forEach((shape, k) => {
    const { limbs, tips } = grow(shape, 0.137 + k * 0.211);
    let minX = 0, maxX = 0, maxY = 0;
    for (const l of limbs) for (const p of l.pts) (minX = Math.min(minX, p.x)), (maxX = Math.max(maxX, p.x)), (maxY = Math.max(maxY, p.y));
    const half = Math.max(-minX, maxX) + 0.8, top = maxY + 0.9, base = 0.4;
    const scale = Math.min((S * 0.5) / half, (S * 0.96) / (top + base));
    const X = (x: number) => k * S + S / 2 + x * scale, Y = (y: number) => S - (y + base) * scale;
    // the limbs: bark, facing out
    for (const [gg, style] of [[g, "rgb(90,0,0)"], [gn, toN(0, 0.1, 1)]] as [CanvasRenderingContext2D, string][]) {
      gg.lineCap = "round";
      gg.strokeStyle = style;
      for (const l of limbs) {
        gg.lineWidth = Math.max(1.2, (l.r0 + l.r1) * scale);
        gg.beginPath();
        l.pts.forEach((p, i) => (i ? gg.lineTo(X(p.x), Y(p.y)) : gg.moveTo(X(p.x), Y(p.y))));
        gg.stroke();
      }
    }
    // the crown: leaf clusters round every twig tip, lighter toward the top, each facing out from
    // the crown's middle (so the crown is lit as one round mass, clumped)
    let lo = Infinity, hi = -Infinity, l0 = Infinity, l1 = -Infinity;
    for (const t of tips) (lo = Math.min(lo, t.y)), (hi = Math.max(hi, t.y)), (l0 = Math.min(l0, t.x)), (l1 = Math.max(l1, t.x));
    const ccx = (l0 + l1) / 2, ccy = (lo + hi) / 2 + 0.2, rx = (l1 - l0) / 2 + 1.1, ry = (hi - lo) / 2 + 1.1;
    let seed = 7 + k * 101;
    const R = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (const t of tips)
      for (let j = 0; j < 22; j++) {
        const a = R() * Math.PI * 2, rr = (0.35 + Math.cbrt(R()) * 0.85) * scale;
        const x = X(t.x) + Math.cos(a) * rr, y = Y(t.y + 0.15) + Math.sin(a) * rr * 0.62;
        const up = Math.min(1, Math.max(0, (t.y - lo + 0.6) / (hi - lo + 1.4)));
        const lum = Math.round(Math.min(1, 0.35 + up * 0.45 + R() * 0.25) * 255);
        const rot = R() * 3;
        // where on the round crown this cluster sits, and a little of its own lean
        const nx = ((x - X(ccx)) / scale) / rx + (R() - 0.5) * 0.35, ny = (-(y - Y(ccy)) / scale) / ry + (R() - 0.5) * 0.35;
        const nz = Math.sqrt(Math.max(0.12, 1 - nx * nx - ny * ny));
        for (const [gg, style] of [[g, `rgb(${lum},255,0)`], [gn, toN(nx, ny, nz)]] as [CanvasRenderingContext2D, string][]) {
          gg.fillStyle = style;
          gg.beginPath();
          gg.ellipse(x, y, 0.2 * scale, 0.28 * scale, rot, 0, Math.PI * 2);
          gg.fill();
        }
      }
    // (no glints: from afar they read as white puffs, snow on the crowns)
    size.push({ w: (half * 2 * S) / (S * 1), h: S / scale, base });
  });
  const tex = new THREE.CanvasTexture(c), nrm = new THREE.CanvasTexture(cn);
  for (const t of [tex, nrm]) {
    t.colorSpace = THREE.NoColorSpace; // data, not colour
    t.generateMipmaps = true;
    t.minFilter = THREE.LinearMipmapLinearFilter;
  }
  return { tex, nrm, size };
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
    const { tex, nrm, size } = atlas();
    const quad = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0);
    this.geo.setAttribute("position", quad.attributes.position);
    this.geo.setAttribute("uv", quad.attributes.uv);
    this.geo.setIndex(quad.index);
    this.aTree = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 4), 4);
    this.aKind = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 2), 2);
    this.geo.setAttribute("aTree", this.aTree);
    this.geo.setAttribute("aKind", this.aKind);
    this.geo.instanceCount = 0;
    // lit by the scene's own lights (the moon or the low sun, the sky's fill), fogged as the land
    const mat = new THREE.MeshLambertNodeMaterial({ transparent: false, alphaTest: 0.35 });
    const tree = attribute("aTree", "vec4"), kind = attribute("aKind", "vec2");
    // each kind's picture is S wide and S tall; in metres it is h tall, and as wide
    const hK = size.map((z) => z.h), bK = size.map((z) => z.base);
    const pick = (arr: number[]) => arr.slice(1).reduce((acc: ReturnType<typeof float>, v, i) => kind.x.greaterThan(i + 0.5).select(float(v), acc), float(arr[0]));
    const h = pick(hK).mul(tree.w), base = pick(bK).mul(tree.w);
    const toCam = vec2(cameraPosition.x.sub(tree.x), cameraPosition.z.sub(tree.z));
    const side = normalize(vec2(toCam.y, toCam.x.negate()));
    const P = positionLocal;
    // a slow sway in the wind, the crown more than the foot
    const sway = sin(T.time.mul(0.6).add(tree.x.mul(0.07)).add(tree.z.mul(0.05))).mul(P.y.mul(P.y)).mul(h).mul(0.018);
    mat.positionNode = vec3(tree.x.add(side.x.mul(P.x.mul(h).add(sway))), tree.y.sub(base).add(P.y.mul(h)), tree.z.add(side.y.mul(P.x.mul(h).add(sway))));
    const q = vec2(uv().x.add(kind.x).div(KINDS), uv().y);
    const t = texture(tex, q), tn = texture(nrm, q);
    const leafK = smoothstep(0.3, 0.7, t.g), lum = t.r;
    // the leaves in the living crowns' own colours: most green, the region's gold or silver
    const hu = fract(kind.y.mul(7.13));
    const green = mix(vec3(0.05, 0.11, 0.045), vec3(0.15, 0.26, 0.08), lum);
    const gold = mix(vec3(0.22, 0.13, 0.04), vec3(0.44, 0.28, 0.07), lum);
    const silver = mix(vec3(0.09, 0.12, 0.12), vec3(0.21, 0.27, 0.26), lum);
    const leaf = mix(mix(green, gold, step(0.84, hu)), silver, step(0.95, hu));
    const bark = vec3(0.12, 0.09, 0.07);
    mat.colorNode = vec4(mix(bark, leaf, leafK), 1);
    // which way the part faces, turned from the picture's frame (right, up, toward you) into the world
    const nl = tn.rgb.mul(2).sub(1);
    const toward = normalize(vec3(toCam.x, 0, toCam.y));
    const nW = normalize(vec3(side.x, 0, side.y).mul(nl.x).add(vec3(0, 1, 0).mul(nl.y)).add(toward.mul(nl.z)));
    mat.normalNode = normalize(T.cameraViewMatrix.mul(vec4(nW, 0)).xyz);
    // the low sun or the moon behind a tree catches its crown's edge (small: never a glow)
    const view = normalize(vec3(tree.x, tree.y.add(h.mul(0.6)), tree.z).sub(cameraPosition));
    const back = pow(max(dot(view, fogUniforms.glowDir), 0), 3).mul(float(1).sub(nl.z)).mul(leafK);
    (mat as unknown as { emissiveNode: unknown }).emissiveNode = fogUniforms.glow.mul(back).mul(0.14);
    // walking in, the likeness thins away as the living tree takes its place
    const d = length(toCam);
    const keep = smoothstep(NEAR - 8, NEAR + 14, d);
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
