/* Etched light: the ink drawings' linework carried into 3D.
   - etchedStone: dark stone with a faint gold lattice, which wakes when you are still before it.
   - buildMandala: hand-drawn line geometry on the central platform (seven-fold, one ring per island). */
import * as THREE from "three/webgpu";
import { T, type N } from "../gpu/tsl";
import { surface } from "./textures";

const {
  abs, cameraPosition, cameraViewMatrix, cos, distance, dot, float, floor, Fn, fract, fwidth, length, max, mix, normalize, normalView,
  normalWorldGeometry, positionWorld, pow, sin, smoothstep, texture, uniform, vec2, vec3, vec4,
} = T;

/** Stillness before a rock or crystal: it vibrates light outward (waves over its surface). */
export const vibeUniforms = {
  uVibePos: uniform(new THREE.Vector3(0, -1e4, 0)),
  uVibeK: uniform(0),
  uVibeR: uniform(1),
};

export const etchUniforms = {
  uEtchT: uniform(0),
  uEtchGain: uniform(1), // raised as the world brightens with progress
};

/** Seeded wobble so repeated shapes never match exactly, like a pen. */
function rng(seed: number) {
  return () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
}

export function buildMandala(): THREE.Group {
  const R = rng(7);
  const pts: number[] = [];
  const cols: number[] = [];
  const gold = new THREE.Color(2.2, 1.6, 0.9);
  const pearl = new THREE.Color(1.6, 1.5, 1.35);
  const add = (a: THREE.Vector2Like, b: THREE.Vector2Like, c: THREE.Color) => {
    pts.push(a.x, 0, a.y, b.x, 0, b.y);
    cols.push(c.r, c.g, c.b, c.r, c.g, c.b);
  };
  const polyline = (p: THREE.Vector2[], c: THREE.Color) => {
    for (let i = 0; i < p.length - 1; i++) add(p[i], p[i + 1], c);
  };
  const wob = (amt: number) => (R() - 0.5) * amt;
  const circle = (cx: number, cy: number, r: number, c: THREE.Color, n = 90, from = 0, to = 1) => {
    const p: THREE.Vector2[] = [];
    const ph = R() * 6.28;
    for (let k = 0; k <= n; k++) {
      const a = (from + (to - from) * (k / n)) * Math.PI * 2;
      const rr = r * (1 + 0.012 * Math.sin(a * 3 + ph));
      p.push(new THREE.Vector2(cx + rr * Math.cos(a), cy + rr * Math.sin(a)));
    }
    polyline(p, c);
  };

  // Three rings: one for each island, never quite closed.
  circle(0, 0, 7.8, pearl, 140, 0.02, 0.98);
  circle(0, 0, 5.6, gold, 120, 0.51, 1.49);
  circle(0, 0, 3.4, pearl, 90, 0.27, 1.23);
  // Seven stations around each ring, each a small circle with a centre point.
  for (const [r, c, off] of [[7.8, pearl, 0], [5.6, gold, 0.22], [3.4, pearl, 0.44]] as const) {
    for (let k = 0; k < 7; k++) {
      const a = (k / 7) * Math.PI * 2 + off - Math.PI / 2;
      const x = r * Math.cos(a), y = r * Math.sin(a);
      circle(x, y, 0.32 + wob(0.05), c, 24);
      circle(x, y, 0.05, c, 8);
    }
  }
  // Spokes that stitch the rings together.
  for (let k = 0; k < 7; k++) {
    const a0 = (k / 7) * Math.PI * 2 - Math.PI / 2;
    const a1 = a0 + 0.22;
    const a2 = a0 + 0.44;
    add(new THREE.Vector2(7.8 * Math.cos(a0), 7.8 * Math.sin(a0)), new THREE.Vector2(5.6 * Math.cos(a1), 5.6 * Math.sin(a1)), pearl);
    add(new THREE.Vector2(5.6 * Math.cos(a1), 5.6 * Math.sin(a1)), new THREE.Vector2(3.4 * Math.cos(a2), 3.4 * Math.sin(a2)), gold);
  }
  // A spiral at the centre, the recurring motif of the drawings.
  const sp: THREE.Vector2[] = [];
  for (let k = 0; k <= 160; k++) {
    const u = k / 160;
    const a = u * Math.PI * 2 * 3.2;
    const r = 0.1 + u * 1.9;
    sp.push(new THREE.Vector2(r * Math.cos(a) + wob(0.03), r * Math.sin(a) + wob(0.03)));
  }
  polyline(sp, gold);

  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(cols, 3));
  const mat = new THREE.LineBasicMaterial({
    vertexColors: true, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const lines = new THREE.LineSegments(g, mat);
  const group = new THREE.Group();
  group.add(lines);
  return group;
}

const stoneH = (p: N): N => fract(sin(dot(p, vec3(127.1, 311.7, 74.7))).mul(43758.5453));
const stoneN = Fn(([x]: N[]) => {
  const i = floor(x), f0 = fract(x), f = f0.mul(f0).mul(float(3).sub(f0.mul(2)));
  const h = (dx: number, dy: number, dz: number) => stoneH(i.add(vec3(dx, dy, dz)));
  return mix(
    mix(mix(h(0, 0, 0), h(1, 0, 0), f.x), mix(h(0, 1, 0), h(1, 1, 0), f.x), f.y),
    mix(mix(h(0, 0, 1), h(1, 0, 1), f.x), mix(h(0, 1, 1), h(1, 1, 1), f.x), f.y),
    f.z,
  );
});
/** The lattice: three families of lines and circles around their nodes, hand-wobbled. */
const etchLines = Fn(([p0, scale]: N[]) => {
  const p1 = p0.mul(scale);
  const p = p1.add(vec2(sin(p1.y.mul(1.7)), sin(p1.x.mul(1.3))).mul(0.05)).toVar(); // the pen's wobble
  const l = float(0).toVar();
  for (let k = 0; k < 3; k++) {
    const a = k * 1.0471976;
    const f = dot(p, vec2(Math.cos(a), Math.sin(a)));
    const w = fwidth(f);
    l.assign(max(l, float(1).sub(smoothstep(w.mul(0.3), w, abs(fract(f.add(0.5)).sub(0.5))))));
  }
  const g = vec2(p.x.sub(p.y.mul(0.57735)), p.y.mul(1.1547));
  const c = floor(g.add(0.5));
  const cc = vec2(c.x.add(c.y.mul(0.5)), c.y.mul(0.866));
  const r = length(p.sub(cc));
  const wr = fwidth(r);
  l.assign(max(l, float(1).sub(smoothstep(wr.mul(0.3), wr, abs(r.sub(0.5))))));
  return l;
});

/** Dark stone etched with fine gold sacred-geometry linework: a triangular lattice with
    circles around its nodes, hand-wobbled, projected onto whichever faces it covers. */
export function etchedStone(
  color = "#1c1a2c",
  line = "#e9c37d",
  scale = 2.2,
  opts: { triplanar?: boolean; map?: THREE.Texture | null; normalMap?: THREE.Texture | null } = {},
): THREE.MeshStandardNodeMaterial {
  const m = new THREE.MeshStandardNodeMaterial({ color, roughness: 0.78, metalness: 0.05 });
  if (opts.map) m.map = opts.map;
  // real scanned rock, projected from three sides (so it never stretches), unless the mesh
  // brings its own maps
  const triplanar = opts.triplanar ?? true;
  const rock = surface("rock");
  const uLine = vec3(...new THREE.Color(line).toArray());
  const E = etchUniforms, V = vibeUniforms;
  const vEW = positionWorld, vEN = normalWorldGeometry;
  const wp = pow(abs(vEN), vec3(4));
  const triW = wp.div(wp.x.add(wp.y).add(wp.z));
  const tri = (t: THREE.Texture, s: number) =>
    [texture(t, vEW.zy.div(s)), texture(t, vEW.xz.div(s)), texture(t, vEW.xy.div(s))];
  const camD = length(vEW.sub(cameraPosition));
  if (triplanar) {
    const [a, b, c] = tri(rock.diff, 2.5);
    const det = a.rgb.mul(triW.x).add(b.rgb.mul(triW.y)).add(c.rgb.mul(triW.z)).mul(2.2);
    m.colorNode = T.materialColor.mul(mix(vec3(dot(det, vec3(0.3, 0.5, 0.2))), det, 0.35));
  }
  // the scans' relief, then weathered stone: soft pits and swells, strongest up close
  let nView: N = opts.normalMap ? T.normalMap(texture(opts.normalMap), vec2(1.2)) : normalView;
  if (triplanar) {
    const [nx0, ny0, nz0] = tri(rock.nor, 2.5).map((t: N) => t.xyz.mul(2).sub(1));
    const dn = vec3(0, nx0.y, nx0.x).mul(triW.x).add(vec3(ny0.x, 0, ny0.y).mul(triW.y)).add(vec3(nz0.x, nz0.y, 0).mul(triW.z));
    nView = nView.add(cameraViewMatrix.mul(vec4(dn.mul(1.1), 0)).xyz);
  }
  const sp = vEW.mul(2.3);
  const s0 = stoneN(sp);
  const g = vec3(stoneN(sp.add(vec3(0.2, 0, 0))).sub(s0), stoneN(sp.add(vec3(0, 0.2, 0))).sub(s0), stoneN(sp.add(vec3(0, 0, 0.2))).sub(s0));
  const near = float(1).sub(smoothstep(10, 40, camD));
  m.normalNode = normalize(normalize(nView).sub(cameraViewMatrix.mul(vec4(g.mul(2.2).mul(near), 0)).xyz));

  m.emissiveNode = Fn(() => {
    const an = abs(vEN);
    const l = an.y.greaterThan(0.6).select(etchLines(vEW.xz, scale), an.x.greaterThan(an.z).select(etchLines(vEW.zy, scale), etchLines(vEW.xy, scale)));
    const fade = float(1).sub(smoothstep(25, 70, camD));
    // the drawings' lattice survives only as a faint trace in the stone
    const e = uLine.mul(l).mul(fade).mul(0.06).mul(E.uEtchGain).mul(sin(E.uEtchT.mul(0.6).add(vEW.y)).mul(0.15).add(0.85)).toVar();
    // vibrating: rings of light race outward over the stone, and its lattice wakes
    const vd = distance(vEW, V.uVibePos);
    const on = float(1).sub(smoothstep(V.uVibeR.mul(1.1), V.uVibeR.mul(1.6).add(0.6), vd));
    const wave = pow(sin(vd.mul(10).sub(E.uEtchT.mul(9))).mul(0.5).add(0.5), 6).add(pow(sin(vd.mul(4).sub(E.uEtchT.mul(5))).mul(0.5).add(0.5), 10).mul(0.6));
    e.addAssign(vec3(1.0, 0.85, 0.6).mul(wave).mul(0.9).add(uLine.mul(l).mul(1.2)).mul(on).mul(V.uVibeK));
    return e;
  })();
  void cos;
  return m;
}
