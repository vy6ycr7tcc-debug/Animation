/* Genesis: a long press on the wanderer's heart (Samuel: "the whole world becomes pitch black and
   then out of the character you start to see lines connecting whole creation slowly, and then
   creation rebuilds itself… a 30 second sort of animation").
   - 0–3 s: the world goes dark, all but a small light at the heart.
   - 2.5–17 s: out of the heart, curving lines of light grow to every tree, crystal, being,
     planet, star, home and mountain, the nearest first; as each arrives, it reaches on to its
     neighbours, until one web joins everything.
   - 18–30 s: creation comes back out of the dark, nearest first (the air thins from the heart
     outward), then the sky; the web fades into it.
   The lines are ribbons a few pixels wide, never thinner (thin lines broke into dashes on the
   phone), and drawn over the dark; the darkness itself is a veil over everything but them. */
import * as THREE from "three/webgpu";
import { T } from "../gpu/tsl";

const { attribute, cameraPosition, clamp, cross, exp, float, length, max, mix, normalize, positionGeometry, smoothstep, uniform, vec3, vec4 } = T;

export const GENESIS_S = 30;
const SEGS = 28, WEB_SEGS = 14;

export interface GenesisTarget {
  p: THREE.Vector3;
  /** A place of weight (a being, a home, a planet): its line is a little brighter. */
  great?: boolean;
}

/** How much of the world shows at time `t` of the sequence: veil (the black over everything),
    air (0 = the world's own fog, 1 = thick black air), sky (0 = black, 1 = its own). */
export interface GenesisState {
  veil: number;
  air: number;
  sky: number;
  /** Hide the fog-less lights (lanterns, planets, gliders): they would show through the black air. */
  lightsHidden: boolean;
  /** How far the camera draws back and up to take in the web. */
  lift: number;
}

export class Genesis {
  group = new THREE.Group();
  active = false;
  t = 0;
  private veil: THREE.Mesh;
  private heart: THREE.Mesh;
  private lines: THREE.Mesh | null = null;
  private knots: THREE.Mesh | null = null;
  private knotMaterial: THREE.MeshBasicNodeMaterial;
  private uRight = uniform(new THREE.Vector3(1, 0, 0));
  private uUp = uniform(new THREE.Vector3(0, 1, 0));
  private uT = uniform(0);
  private uFade = uniform(1);
  private uVeil = uniform(0);
  private uHeart = uniform(0);
  private uPx = uniform(600);
  private material: THREE.MeshBasicNodeMaterial;

  constructor() {
    // the veil: a sphere around the camera, drawn over everything but the web and the heart
    const vm = new THREE.MeshBasicNodeMaterial({ transparent: true, depthTest: false, depthWrite: false, side: THREE.BackSide, fog: false });
    vm.colorNode = vec4(0, 0, 0, this.uVeil);
    this.veil = new THREE.Mesh(new THREE.SphereGeometry(20, 16, 12), vm);
    this.veil.renderOrder = 9000;
    this.veil.frustumCulled = false;

    // the heart: a small warm light, soft at the edge (a quad turned to the camera)
    const hm = new THREE.MeshBasicNodeMaterial({ transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
    const r = length(T.uv().sub(0.5)).mul(2);
    const core = exp(r.mul(r).mul(-26)).mul(1.4).add(exp(r.mul(-5)).mul(0.35)).mul(smoothstep(1, 0.6, r));
    hm.colorNode = vec4(vec3(1.0, 0.86, 0.62).mul(core).mul(this.uHeart), 1);
    this.heart = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.1), hm);
    this.heart.renderOrder = 9002;
    this.heart.frustumCulled = false;

    // the web's ribbons: each segment a quad whose width is kept at a few pixels at any distance
    const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
    // packed, as a phone allows only eight vertex buffers: aS = (side, along, width px), aT = (delay, duration, kind, brightness)
    const A = positionGeometry, B = attribute("aB", "vec3"), aS = attribute("aS", "vec3"), aT = attribute("aT", "vec4");
    const side = aS.x;
    const dist = max(length(A.sub(cameraPosition)), 0.5);
    const across = normalize(cross(B.sub(A), A.sub(cameraPosition)));
    const w = aS.z;
    m.positionNode = A.add(across.mul(side).mul(w.mul(dist).div(this.uPx)));
    const u = aS.y, delay = aT.x, dur = aT.y, kind = aT.z;
    const prog = clamp(this.uT.sub(delay).div(dur), 0, 1);
    const behind = prog.sub(u); // > 0: already drawn
    const shown = smoothstep(0, 0.004, behind);
    const head = exp(max(behind, 0).mul(-24)).mul(prog.lessThan(0.999).select(1, 0.25));
    const warm = mix(vec3(1.0, 0.8, 0.42), vec3(0.72, 0.86, 1.0), kind); // from the heart gold, between things pale
    const col = mix(warm, vec3(1, 0.97, 0.9), head.mul(0.8));
    const a = shown.mul(float(0.26).add(head.mul(0.9))).mul(this.uFade).mul(aT.w)
      .mul(float(1).sub(side.mul(side)).mul(1.6).min(1)); // soft at its two edges
    m.colorNode = vec4(col.mul(a), 1);
    this.material = m;

    // the knots: each thing lights as the web reaches it (a soft point, a flare as it arrives)
    const km = new THREE.MeshBasicNodeMaterial({ transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
    const kc = attribute("aK", "vec4"); // (corner x, corner y, arrival, size px)
    const kd = max(length(positionGeometry.sub(cameraPosition)), 0.5);
    km.positionNode = positionGeometry.add(this.uRight.mul(kc.x).add(this.uUp.mul(kc.y)).mul(kc.w.mul(kd).div(this.uPx)));
    const since = this.uT.sub(kc.z);
    const on = smoothstep(0, 0.25, since);
    const flare = exp(max(since, 0).mul(-1.6)).mul(1.4);
    const kr = length(vec3(kc.x, kc.y, 0));
    const soft = exp(kr.mul(kr).mul(-5)).mul(smoothstep(1, 0.7, kr));
    const ka = on.mul(float(0.45).add(flare)).mul(soft).mul(this.uFade);
    km.colorNode = vec4(mix(vec3(1.0, 0.85, 0.55), vec3(1, 0.98, 0.92), flare.mul(0.5)).mul(ka), 1);
    this.knotMaterial = km;

    this.group.add(this.veil, this.heart);
    this.group.visible = false;
  }

  /** Begin: `heart` is where the light leaves the wanderer; `targets` everything it reaches. */
  start(heart: THREE.Vector3, targets: GenesisTarget[]): void {
    this.t = 0;
    this.active = true;
    this.group.visible = true;
    for (const m of [this.lines, this.knots]) {
      if (!m) continue;
      this.group.remove(m);
      m.geometry.dispose();
    }
    this.lines = this.buildWeb(heart, targets);
    this.group.add(this.lines);
    if (this.knots) this.group.add(this.knots);
    this.heart.position.copy(heart);
  }

  stop(): void {
    this.active = false;
    this.group.visible = false;
    this.uVeil.value = 0;
  }

  private buildWeb(heart: THREE.Vector3, targets: GenesisTarget[]): THREE.Mesh {
    const arcs: { a: THREE.Vector3; b: THREE.Vector3; delay: number; dur: number; kind: number; bright: number; segs: number }[] = [];
    // The light spreads as a web, not a starburst: from the heart to the few things nearest and
    // to the great ones (beings, planets, mountains), and from each thing on to its neighbours.
    // Each is reached along its shortest way from the heart (Dijkstra), so the web grows outward.
    const n0 = targets.length;
    const nodes = [heart, ...targets.map((t) => t.p)];
    const edges: [number, number, number][][] = nodes.map(() => []);
    const link = (i: number, j: number) => {
      const d = nodes[i].distanceTo(nodes[j]);
      edges[i].push([j, d, 0]);
      edges[j].push([i, d, 0]);
    };
    const byNear = (i: number) =>
      nodes.map((p, j) => ({ j, d: j === i ? Infinity : p.distanceToSquared(nodes[i]) })).sort((x, y) => x.d - y.d);
    byNear(0).slice(0, 5).forEach(({ j }) => link(0, j));
    targets.forEach((t, i) => t.great && t.p.distanceTo(heart) < 700 && link(0, i + 1));
    const extra: [number, number][] = [];
    for (let i = 1; i <= n0; i++) {
      byNear(i).slice(0, 3).forEach(({ j }, r) => {
        if (j === 0) return;
        link(i, j);
        if (r === 2) extra.push([i, j]);
      });
    }
    const dist = new Array(nodes.length).fill(Infinity), from = new Array(nodes.length).fill(-1), done = new Array(nodes.length).fill(false);
    dist[0] = 0;
    for (let it = 0; it < nodes.length; it++) {
      let u = -1;
      for (let i = 0; i < nodes.length; i++) if (!done[i] && (u < 0 || dist[i] < dist[u])) u = i;
      if (u < 0 || !isFinite(dist[u])) break;
      done[u] = true;
      for (const [w, d] of edges[u]) if (dist[u] + d < dist[w]) (dist[w] = dist[u] + d), (from[w] = u);
    }
    let far = 1;
    for (const d of dist) if (isFinite(d)) far = Math.max(far, d);
    // time of arrival: the first near things within a couple of seconds, the farthest by ~16 s
    const when = dist.map((d) => (isFinite(d) ? 2.8 + 13.2 * Math.pow(d / far, 0.55) : Infinity));
    this.knots = this.buildKnots(nodes.slice(1), when.slice(1), targets);
    for (let i = 1; i <= n0; i++) {
      const f = from[i];
      if (f < 0) continue;
      arcs.push({ a: nodes[f], b: nodes[i], delay: when[f], dur: Math.max(0.6, when[i] - when[f]), kind: f === 0 ? 0 : 1, bright: targets[i - 1].great ? 1.2 : 0.8, segs: f === 0 ? SEGS : WEB_SEGS });
    }
    // and the cross-links that close the web, once both ends are lit
    for (const [i, j] of extra) {
      if (!isFinite(when[i]) || !isFinite(when[j]) || from[i] === j || from[j] === i) continue;
      const t0 = Math.max(when[i], when[j]);
      arcs.push({ a: nodes[i], b: nodes[j], delay: t0 + 0.4, dur: 1.8, kind: 1, bright: 0.55, segs: WEB_SEGS });
    }

    let quads = 0;
    for (const a of arcs) quads += a.segs;
    const n = quads * 4;
    const pos = new Float32Array(n * 3), bEnd = new Float32Array(n * 3);
    const sa = new Float32Array(n * 3), ta = new Float32Array(n * 4);
    const idx = new Uint32Array(quads * 6);
    const p0 = new THREE.Vector3(), p1 = new THREE.Vector3(), ctl = new THREE.Vector3();
    const at = (a: THREE.Vector3, b: THREE.Vector3, s: number, out: THREE.Vector3) => {
      // a quadratic arc bowing upward, more for longer reaches, and a little aside (living, not ruled)
      const q = 1 - s;
      return out.set(q * q * a.x + 2 * q * s * ctl.x + s * s * b.x, q * q * a.y + 2 * q * s * ctl.y + s * s * b.y, q * q * a.z + 2 * q * s * ctl.z + s * s * b.z);
    };
    let v = 0, k = 0;
    arcs.forEach((arc, ai) => {
      const d = arc.a.distanceTo(arc.b);
      ctl.copy(arc.a).add(arc.b).multiplyScalar(0.5);
      ctl.y += d * (arc.kind ? 0.06 : 0.1);
      const sw = Math.sin(ai * 12.9898) * d * 0.16;
      ctl.x += sw * 0.7;
      ctl.z -= sw * 0.7;
      const px = arc.kind ? 2.2 : 3;
      for (let s = 0; s < arc.segs; s++) {
        const s0 = s / arc.segs, s1 = (s + 1) / arc.segs;
        at(arc.a, arc.b, s0, p0);
        at(arc.a, arc.b, s1, p1);
        // four corners, (p0,-1) (p0,+1) (p1,+1) (p1,-1); each carries the segment's direction in aB
        const dx = p1.x - p0.x, dy = p1.y - p0.y, dz = p1.z - p0.z;
        for (const [P, sd, uv] of [[p0, -1, s0], [p0, 1, s0], [p1, 1, s1], [p1, -1, s1]] as [THREE.Vector3, number, number][]) {
          pos.set([P.x, P.y, P.z], v * 3);
          bEnd.set([P.x + dx, P.y + dy, P.z + dz], v * 3);
          sa.set([sd, uv, px], v * 3);
          ta.set([arc.delay, arc.dur, arc.kind, arc.bright], v * 4);
          v++;
        }
        const b0 = v - 4;
        idx.set([b0, b0 + 1, b0 + 2, b0, b0 + 2, b0 + 3], k);
        k += 6;
      }
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("aB", new THREE.BufferAttribute(bEnd, 3));
    g.setAttribute("aS", new THREE.BufferAttribute(sa, 3));
    g.setAttribute("aT", new THREE.BufferAttribute(ta, 4));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    const mesh = new THREE.Mesh(g, this.material);
    mesh.renderOrder = 9001;
    mesh.frustumCulled = false;
    return mesh;
  }

  private buildKnots(ps: THREE.Vector3[], when: number[], targets: GenesisTarget[]): THREE.Mesh {
    const n = ps.length * 4;
    const pos = new Float32Array(n * 3), k = new Float32Array(n * 4), idx = new Uint32Array(ps.length * 6);
    ps.forEach((p, i) => {
      const size = targets[i].great ? 26 : 13;
      const w = isFinite(when[i]) ? when[i] : 1e9;
      [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([x, y], c) => {
        pos.set([p.x, p.y, p.z], (i * 4 + c) * 3);
        k.set([x, y, w, size], (i * 4 + c) * 4);
      });
      idx.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3], i * 6);
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("aK", new THREE.BufferAttribute(k, 4));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    const mesh = new THREE.Mesh(g, this.knotMaterial);
    mesh.renderOrder = 9001;
    mesh.frustumCulled = false;
    return mesh;
  }

  /** Each frame while active; returns how much of the world shows. */
  update(dt: number, camera: THREE.PerspectiveCamera, viewH: number): GenesisState {
    this.t += dt;
    const t = this.t;
    const ss = (a: number, b: number, x: number) => {
      const k = Math.min(1, Math.max(0, (x - a) / (b - a)));
      return k * k * (3 - 2 * k);
    };
    this.uT.value = t;
    this.uPx.value = viewH / 2 / Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
    const dark = ss(0, 3, t);
    const veil = dark * (1 - ss(18, 21, t));
    this.uVeil.value = veil;
    this.uHeart.value = ss(0.5, 2.5, t) * (1 - ss(22, 28, t)) * (0.85 + 0.15 * Math.sin(t * 2.2));
    this.uFade.value = 1 - ss(19, 27, t);
    this.veil.position.copy(camera.position);
    this.heart.quaternion.copy(camera.quaternion);
    this.uRight.value.setFromMatrixColumn(camera.matrixWorld, 0);
    this.uUp.value.setFromMatrixColumn(camera.matrixWorld, 1);
    if (t >= GENESIS_S) this.stop();
    return {
      veil,
      air: dark * (1 - ss(18, 28, t)),
      sky: 1 - dark * (1 - ss(22, 29, t)),
      lightsHidden: t > 0.5 && t < 24,
      lift: ss(2, 11, t) * (1 - ss(21, 29, t)),
    };
  }
}
