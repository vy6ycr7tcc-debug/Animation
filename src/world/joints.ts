/* Where forms meet (the sanctuary, world/sanctuary.ts). Townscaper's question, "what happens when
   things change", answered with the most care at the meeting places: the player suggests, the
   world completes.
   - Two walls (or a wall and a ring) that touch: a post rises where they meet, a moment after
     them, in their stone or their gold.
   - Where stone meets gold: the post is stone, bound by a collar of gold light, with a small gold
     cap: the meeting itself is marked.
   - A wall meeting a pillar or a spire of the other ink: a collar of light rings the pillar where
     the wall's top meets it.
   - A wall's free ends: each finished with a small finial post (the world closing what was left
     open).
   Recomputed only when the forms change; drawn instanced; each new piece grows up out of the
   earth on its own delay (nothing pops). */
import * as THREE from "three/webgpu";
import { T } from "../gpu/tsl";
import type { V2 } from "./strokes";

const { float, vec3, vec4, sin, abs, dot, normalize, pow } = T;

export interface JointForm {
  kind: "wall" | "ring" | "pillar" | "spire";
  ink: "stone" | "gold";
  /** the form's centre line (walls, rings) or its centre (pillars, spires), in the sanctuary's frame */
  line: V2[];
  /** half its thickness (or its radius) */
  half: number;
  /** an open wall: its two ends are free unless something meets them */
  open: boolean;
  /** its height */
  H: number;
}

type PieceKind = "post-stone" | "post-gold" | "collar" | "cap";
interface Piece {
  key: string;
  kind: PieceKind;
  x: number;
  z: number;
  /** post: radius, height; collar: radius, height it sits at; cap: radius, height */
  r: number;
  h: number;
  age: number;
  /** delay before it begins to rise (s) */
  delay: number;
}

const CAP = 96;
const ease = (x: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3);

/** A small turned post: a flared foot, a shaft, a moulded cap (unit radius 1, height 1). */
function postGeometry(): THREE.BufferGeometry {
  const prof: [number, number][] = [[1.3, -0.25], [1.3, 0.06], [1.12, 0.12], [1, 0.16], [0.96, 0.82], [1.1, 0.88], [1.22, 0.93], [1.22, 1], [0.001, 1.02]];
  const seg = 16;
  const pos: number[] = [], idx: number[] = [];
  for (const [r, y] of prof)
    for (let i = 0; i <= seg; i++) {
      const a = (i / seg) * Math.PI * 2;
      pos.push(Math.cos(a) * r, y, Math.sin(a) * r);
    }
  for (let j = 0; j < prof.length - 1; j++)
    for (let i = 0; i < seg; i++) {
      const a = j * (seg + 1) + i, b = a + seg + 1;
      idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export class Joints {
  readonly group = new THREE.Group();
  private pieces: Piece[] = [];
  private meshes: Record<PieceKind, THREE.InstancedMesh>;
  private moving = false;
  private m4 = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private p = new THREE.Vector3();
  private s = new THREE.Vector3();

  constructor(stone: THREE.Material, gold: THREE.Material) {
    // the collar: a band of warm light, breathing slowly (light where the two meet; contained)
    const inlay = new THREE.MeshBasicNodeMaterial({ fog: false });
    {
      const ndv = abs(dot(T.normalView, normalize(T.positionView.negate())));
      const breath = sin(T.time.mul(0.5).add(T.positionWorld.x.mul(0.8))).mul(0.15).add(0.85);
      inlay.colorNode = vec4(vec3(1, 0.72, 0.34).mul(float(0.55).add(pow(ndv, 0.6).mul(0.5))).mul(breath), 1);
    }
    const post = postGeometry();
    const collar = new THREE.TorusGeometry(1, 0.075, 8, 40);
    collar.rotateX(Math.PI / 2);
    const cap = new THREE.SphereGeometry(1, 16, 10);
    this.meshes = {
      "post-stone": new THREE.InstancedMesh(post, stone, CAP),
      "post-gold": new THREE.InstancedMesh(post, gold, CAP),
      collar: new THREE.InstancedMesh(collar, inlay, CAP),
      cap: new THREE.InstancedMesh(cap, gold, CAP),
    };
    for (const m of Object.values(this.meshes)) {
      m.count = 0;
      m.castShadow = m.receiveShadow = true;
      m.frustumCulled = false;
      this.group.add(m);
    }
    this.meshes.collar.castShadow = false;
  }

  /** The forms changed: find where they meet and what closes their open ends. */
  set(forms: JointForm[], settledNow = false): void {
    const next: Piece[] = [];
    const add = (kind: PieceKind, x: number, z: number, r: number, h: number, delay: number) => {
      // one piece to a place: a post already near takes the meeting
      if (kind.startsWith("post") && next.some((q) => q.kind.startsWith("post") && Math.hypot(q.x - x, q.z - z) < 0.55)) return;
      next.push({ key: `${kind}:${Math.round(x * 4)}:${Math.round(z * 4)}`, kind, x, z, r, h, age: 0, delay });
    };
    const freeEnds = forms.map((f) => (f.open && f.line.length > 1 ? [true, true] : [false, false]));
    for (let a = 0; a < forms.length; a++)
      for (let b = a + 1; b < forms.length; b++) {
        const A = forms[a], B = forms[b];
        // where the two come nearest
        let best = Infinity, ia = 0, ib = 0;
        for (let i = 0; i < A.line.length; i++)
          for (let j = 0; j < B.line.length; j++) {
            const d = Math.hypot(A.line[i][0] - B.line[j][0], A.line[i][1] - B.line[j][1]);
            if (d < best) (best = d), (ia = i), (ib = j);
          }
        const wallA = A.kind === "wall" || A.kind === "ring", wallB = B.kind === "wall" || B.kind === "ring";
        if (best > A.half + B.half + 0.3) continue;
        const pa = A.line[ia], pb = B.line[ib];
        if (wallA && wallB) {
          const x = (pa[0] + pb[0]) / 2, z = (pa[1] + pb[1]) / 2;
          const h = Math.max(A.H, B.H) + 0.16, r = 0.27;
          if (A.ink === B.ink) add(A.ink === "gold" ? "post-gold" : "post-stone", x, z, r, h, 0.5);
          else {
            // stone meets gold: a stone post bound in light, a gold cap upon it
            add("post-stone", x, z, r, h, 0.5);
            add("collar", x, z, r * 1.08, h * 0.62, 1.2);
            add("cap", x, z, 0.12, h + 0.1, 1.6);
          }
        } else if (wallA !== wallB && A.ink !== B.ink) {
          // a wall meeting a pillar or spire of the other ink: a collar round it at the wall's top
          const P = wallA ? B : A, W = wallA ? A : B;
          const c = P.line[0];
          add("collar", c[0], c[1], P.half * (P.kind === "spire" ? 0.95 : 1.02) + 0.04, W.H - 0.06, 1.0);
        }
        // the ends that something met are no longer free
        const near = (F: JointForm, i: number) => F.open && (i <= 1 || i >= F.line.length - 2);
        if (near(A, ia)) freeEnds[a][ia <= 1 ? 0 : 1] = false;
        if (near(B, ib)) freeEnds[b][ib <= 1 ? 0 : 1] = false;
      }
    // the free ends of open walls: finished, each with a small post
    forms.forEach((f, i) => {
      if (!f.open || f.line.length < 2) return;
      const ends = [f.line[0], f.line[f.line.length - 1]];
      for (let e = 0; e < 2; e++) if (freeEnds[i][e]) add(f.ink === "gold" ? "post-gold" : "post-stone", ends[e][0], ends[e][1], 0.22, f.H + 0.12, 0.9);
    });
    // keep what stays (its growth with it); new pieces begin to rise
    const old = new Map(this.pieces.map((p) => [p.key, p]));
    for (const n of next) {
      const o = old.get(n.key);
      if (o) n.age = o.age;
      else if (settledNow) n.age = 99;
    }
    this.pieces = next;
    this.moving = true;
    this.write();
  }

  update(dt: number): void {
    if (!this.moving) return;
    let any = false;
    for (const p of this.pieces) {
      if (p.age < p.delay + 2) {
        p.age += dt;
        any = true;
      }
    }
    this.write();
    this.moving = any;
  }

  private write(): void {
    const n: Record<PieceKind, number> = { "post-stone": 0, "post-gold": 0, collar: 0, cap: 0 };
    for (const p of this.pieces) {
      const im = this.meshes[p.kind];
      const i = n[p.kind];
      if (i >= CAP) continue;
      const g = ease((p.age - p.delay) / 1.8);
      if (p.kind === "post-stone" || p.kind === "post-gold") {
        // rises out of the earth
        this.p.set(p.x, -p.h * (1 - g), p.z);
        this.s.set(p.r, p.h, p.r);
      } else if (p.kind === "collar") {
        this.p.set(p.x, p.h, p.z);
        const k = Math.max(0.0001, g);
        this.s.set(p.r * (0.6 + 0.4 * k), k, p.r * (0.6 + 0.4 * k));
      } else {
        this.p.set(p.x, p.h, p.z);
        this.s.setScalar(Math.max(0.0001, p.r * g));
      }
      this.m4.compose(this.p, this.q, this.s);
      im.setMatrixAt(i, this.m4);
      n[p.kind] = i + 1;
    }
    for (const k of Object.keys(n) as PieceKind[]) {
      const im = this.meshes[k];
      im.count = n[k];
      im.instanceMatrix.needsUpdate = true;
      im.computeBoundingSphere();
    }
  }
}
