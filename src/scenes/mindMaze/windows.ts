/* Windows onto the galaxy, set into the mind's maze's walls (the owner: "make the maze paths
   beautiful to look at, with mirrors into the outside world on the galaxy, with mystery that
   invites you to move forward and explore"). Each is an arched opening flush with a corridor's
   wall; through it you look out into deep space: a spiral galaxy hangs on a plane far behind the
   glass (so it shifts with true parallax as you pass, as through a real window), turning very
   slowly, over a field of still stars at infinity, a faint veil of nebula between. Nothing
   twinkles or rushes (the owner: the wall stars were "too much movement").
   The windows along the one true way in are a little warmer and their galaxies nearer and
   brighter, so the corridor that leads inward is the one that draws the eye; the others are cool
   and far. Contained: the light stays inside the frame, nothing spreads.
   One merged mesh, one draw; built once; nothing per frame but the clock. */
import * as THREE from "three/webgpu";
import { T, hash3, vnoise, type N } from "../../gpu/tsl";
import { merge } from "../densities/roomKit";
import { passable } from "../../world/solidity";
import type { WallArc, WallBox } from "./area";

const { attribute, float, vec2, vec3, vec4, sin, mix, smoothstep, pow, exp, length, normalize, dot, abs, min, clamp } = T;

export interface WindowOpts {
  arcs: WallArc[];
  /** The straight walls across the rings, which end corridors: a window there faces straight
      down the corridor, a glimpse from far off. */
  boxes: WallBox[];
  /** The rings' radii: the sanctuary's wall and the outer wall (no windows out to the forecourt). */
  rin: number;
  outer: number;
  floor: (x: number, z: number) => number;
  /** Whether a point (room frame) lies on the one true way in. */
  onWay: (x: number, z: number) => boolean;
  rand: () => number;
  /** The room's clock. */
  t: N;
}

const W = 2.3, H = 3.3, SPACING = 15;

export function galaxyWindows(o: WindowOpts): THREE.Mesh | null {
  const parts: THREE.BufferGeometry[] = [];
  // an arch: a rectangle with a round head, in its own plane (x across, y up), corner at (0, 0)
  const shape = new THREE.Shape();
  shape.moveTo(-W / 2, 0);
  shape.lineTo(W / 2, 0);
  shape.lineTo(W / 2, H - W / 2);
  shape.absarc(0, H - W / 2, W / 2, 0, Math.PI, false);
  shape.lineTo(-W / 2, 0);
  const proto = new THREE.ShapeGeometry(shape, 18);
  const pp = proto.attributes.position as THREE.BufferAttribute;

  const add = (cx: number, cz: number, nx: number, nz: number) => {
    const tx = -nz, tz = nx; // across the window, seen from the corridor
    const viewX = cx + nx * 2, viewZ = cz + nz * 2;
    const base = o.floor(viewX, viewZ) + 0.45;
    const way = o.onWay(viewX, viewZ) ? 1 : 0;
    const seed = o.rand();
    const g = proto.clone();
    const pos = new Float32Array(pp.count * 3), uvw = new Float32Array(pp.count * 2);
    for (let k = 0; k < pp.count; k++) {
      const lx = pp.getX(k), ly = pp.getY(k);
      pos.set([cx + tx * lx, base + ly, cz + tz * lx], k * 3);
      uvw.set([lx, ly], k * 2);
    }
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("aWin", new THREE.BufferAttribute(uvw, 2));
    const per = (v: number[]) => new THREE.BufferAttribute(new Float32Array(Array.from({ length: pp.count }, () => v).flat()), v.length);
    g.setAttribute("aCentre", per([cx, base + H * 0.45, cz]));
    g.setAttribute("aN", per([nx, 0, nz]));
    g.setAttribute("aInfo", per([way, seed]));
    g.deleteAttribute("uv");
    g.deleteAttribute("normal");
    parts.push(g);
  };
  for (const w of o.arcs) {
    if (w.r < o.rin + 0.5) continue; // the sanctuary's wall keeps its own stone
    const span = w.a1 - w.a0;
    for (let side = 0; side < 2; side++) {
      // side 0: the face toward the centre (seen from the corridor inside it); 1: the outer face
      if (side === 1 && w.r > o.outer - 0.5) continue; // never out onto the forecourt
      const rf = side === 0 ? w.r - w.d / 2 : w.r + w.d / 2;
      const len = span * rf;
      const n = Math.floor((len - 2) / SPACING);
      for (let i = 0; i < n; i++) {
        if (o.rand() < 0.42) continue; // not every stretch: a window is a find
        const a = w.a0 + ((i + 0.5 + (o.rand() - 0.5) * 0.4) / n) * span;
        // the chord across the window touches the face at its ends; on a convex face push it out
        const sag = (W * W) / (8 * rf);
        const rr = side === 0 ? rf - 0.035 : rf + sag + 0.035;
        const cx = Math.sin(a) * rr, cz = Math.cos(a) * rr;
        // the corridor it looks out of: inward for side 0, outward for side 1
        const nx = side === 0 ? -Math.sin(a) : Math.sin(a), nz = side === 0 ? -Math.cos(a) : Math.cos(a);
        add(cx, cz, nx, nz);
      }
    }
  }
  for (const b of o.boxes) {
    if (b.w < W + 0.9) continue; // a pillar of a colonnade, not a wall
    for (let side = -1; side <= 1; side += 2) {
      if (o.rand() < 0.5) continue;
      // the slab's faces look along the ring (it was turned by a about y)
      const nx = Math.sin(b.a) * side, nz = Math.cos(b.a) * side;
      add(b.x + nx * (b.d / 2 + 0.035), b.z + nz * (b.d / 2 + 0.035), nx, nz);
    }
  }
  proto.dispose();
  if (!parts.length) return null;
  const geo = merge(parts);
  for (const p of parts) p.dispose();

  const m = new THREE.MeshBasicNodeMaterial({ fog: false, side: THREE.DoubleSide });
  const P = T.positionWorld, cam = T.cameraPosition;
  const C = attribute("aCentre", "vec3"), Nw = attribute("aN", "vec3"), info = attribute("aInfo", "vec2"), win = attribute("aWin", "vec2");
  const way = info.x, seed = info.y;
  const Tw = normalize(vec3(Nw.z.negate(), 0, Nw.x));
  const V = normalize(P.sub(cam));
  // the galaxy's plane, far behind the glass (nearer along the true way): where the eye's ray
  // through this point of the window meets it
  const depth = mix(float(46), float(26), way);
  const vn = min(dot(V, Nw), float(-0.05));
  const tHit = depth.negate().div(vn);
  const hit = P.add(V.mul(tHit));
  const Q = C.sub(Nw.mul(depth));
  const u = dot(hit.sub(Q), Tw), v = hit.sub(Q).y;
  // the galaxy: a slowly turning spiral, tilted (squashed), its own colour by seed
  const tilt = mix(float(0.42), float(0.7), seed);
  const gx = u.add(seed.sub(0.5).mul(10)), gy = v.div(tilt).add(seed.sub(0.5).mul(4));
  const r = length(vec2(gx, gy)).add(0.001);
  const ang = T.atan(gy, gx).add(o.t.mul(0.012));
  const R0 = mix(float(7), float(9.5), way);
  const arms = pow(sin(ang.mul(2).sub(T.log(r).mul(3.2))).mul(0.5).add(0.5), float(3));
  const disk = exp(r.negate().div(R0));
  const dust = vnoise(vec2(gx, gy).mul(0.35).add(seed.mul(40)));
  const core = exp(r.mul(r).negate().div(1.6));
  const cool = mix(vec3(0.42, 0.56, 1.0), vec3(0.78, 0.6, 1.0), seed);
  const warm = vec3(1.0, 0.78, 0.48);
  const tint = mix(cool, warm, way.mul(0.75));
  const galaxy = tint.mul(disk.mul(arms.mul(0.75).add(0.25)).mul(dust.mul(0.6).add(0.55)).mul(0.55)).add(vec3(1.0, 0.92, 0.78).mul(core.mul(0.7)));
  // stars at infinity (still): a hash on the eye's direction
  const sq = V.mul(330);
  const cell = T.floor(sq);
  const sh = hash3(cell);
  const sd = length(T.fract(sq).sub(0.5));
  const star = T.step(0.985, sh).mul(smoothstep(0.32, 0.0, sd)).mul(hash3(cell.add(7)).mul(0.6).add(0.25));
  // a faint nebula veil between, at its own depth
  const neb = vnoise(vec2(u, v).mul(0.05).add(seed.mul(17))).mul(vnoise(vec2(u, v).mul(0.12).add(3)));
  const nebC = mix(vec3(0.16, 0.08, 0.28), vec3(0.05, 0.14, 0.24), seed).mul(neb.mul(1.4));
  const space = vec3(0.004, 0.005, 0.014).add(nebC).add(galaxy).add(vec3(0.85, 0.88, 1.0).mul(star));
  // the frame: a fine line of light just inside the arch's edge, warmer along the way, and the
  // glass darkening a little toward the edge so it reads as depth
  const ax = win.x, ay = win.y;
  const head = float(H - W / 2);
  const dEdge = min(min(float(W / 2).sub(abs(ax)), ay), T.select(ay.greaterThan(head), float(W / 2).sub(length(vec2(ax, ay.sub(head)))), float(9)));
  const line = smoothstep(0.075, 0.035, dEdge).mul(smoothstep(0.0, 0.025, dEdge));
  const frameC = mix(vec3(0.62, 0.72, 0.95), vec3(1.0, 0.78, 0.45), way).mul(mix(float(0.28), float(0.5), way));
  const vign = smoothstep(0.0, 0.5, dEdge).mul(0.35).add(0.65);
  // seen from far down a corridor the window is a soft find, from near a view
  const camD = length(cam.sub(C));
  const nearK = clamp(float(1.15).sub(camD.div(80)), 0.45, 1);
  m.colorNode = vec4(space.mul(vign).mul(nearK).add(frameC.mul(line)), 1);
  const mesh = passable(new THREE.Mesh(geo, m)); // glass in the wall: the wall holds you, not the glass
  mesh.frustumCulled = false;
  mesh.renderOrder = 1;
  return mesh;
}
