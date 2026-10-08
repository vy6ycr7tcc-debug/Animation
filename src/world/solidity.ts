/* Solidity (the owner: "most of what goes underwater you just go through the building… every
   building somehow more solid… at a root level… so this doesn't happen again"). Before this, only
   hand-placed colliders (circles and boxes, `terrain.ts`) held the wanderer, so any building nobody
   had listed was paper: walked through on land, swum through under the water, flown through.

   Now the stone itself is solid. Every material a building is made of is marked where it is made
   (`solid(m)`: the shared masonry `landStone`, and the few stone materials built apart from it), so
   every mesh drawn in such a material, now or added later, holds the wanderer by its real shape,
   with nothing to list. A bounding volume tree of each mesh's triangles (three-mesh-bvh, built once
   when you first come near) answers three questions each frame for the few meshes near you:
   - walking (and flying low): the body, a capsule from a step above the feet to the head, is pushed
     out of upright faces only, sideways; floors, steps and slopes are never walls;
   - the floor under you: the highest walkable face (gentler than ~57°) a step above the feet or
     below, so you stand on any stair, platform, roof or fallen block, as on the ground;
   - floating (the orb under the water, or flight): a ball pushed out of every face, from any side.
   Faces are one-sided unless the material draws both: a body that finds itself inside a closed
   block is let out, never trapped. `passable(object)` lets a mesh or a whole group be walked through
   (seats you walk onto, thresholds of light). */
import * as THREE from "three/webgpu";
import { MeshBVH } from "three-mesh-bvh";

/** Marks a material solid: any mesh drawn in it holds the wanderer. */
export function solid<M extends THREE.Material>(m: M): M {
  m.userData.solid = true;
  return m;
}
/** Lets an object (and all within it) be walked through though its material is solid. */
export function passable<O extends THREE.Object3D>(o: O): O {
  o.userData.passable = true;
  return o;
}

/** Steeper than this (|normal.y| below it) a face is a wall; gentler, a floor. */
const WALL_NY = 0.55;
/** The body ignores what stands lower than this above the feet (steps are climbed). */
export const STEP = 0.5;
const HEAD = 1.72;
/** How near (beyond its own bounds) a mesh must be to be asked at all. */
const NEAR = 14;

interface Found {
  mesh: THREE.Mesh;
  /** World bounding sphere (for an instanced mesh, of all its instances). */
  c: THREE.Vector3;
  r: number;
  twoSided: boolean;
}

const _m = new THREE.Matrix4();
const _inv = new THREE.Matrix4();
const _nm = new THREE.Matrix3();
const _inst = new THREE.Matrix4();
const _seg = new THREE.Line3();
const _seg0 = new THREE.Vector3();
const _box = new THREE.Box3();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _n = new THREE.Vector3();
const _nw = new THREE.Vector3();
const _d = new THREE.Vector3();
const _w0 = new THREE.Vector3();
const _w1 = new THREE.Vector3();
const _ray = new THREE.Ray();
const _sph = new THREE.Sphere();

function isSolid(mat: THREE.Material | THREE.Material[]): boolean {
  if (Array.isArray(mat)) return mat.some((m) => m.userData.solid && !(m as THREE.MeshStandardMaterial).wireframe);
  return !!mat.userData.solid && !(mat as THREE.MeshStandardMaterial).wireframe;
}

export class Solidity {
  /** Off: nothing but the old colliders hold you (a switch for testing). */
  enabled = true;
  private all: Found[] = [];
  private near: Found[] = [];
  private scanT = 0;
  private trees = new WeakMap<THREE.BufferGeometry, MeshBVH>();
  private sphereFor = new WeakMap<THREE.InstancedMesh, number>();
  /** Last scan's counts, for the readout. */
  stats = { solid: 0, near: 0, trees: 0 };

  /** Called each frame: finds the solid meshes (twice a second), keeps those near `at`, and grows
      at most one tree a frame for a near mesh that has none (each is grown once, then kept). */
  update(root: THREE.Object3D, at: THREE.Vector3, dt: number): void {
    if (!this.enabled) return;
    this.scanT -= dt;
    if (this.scanT <= 0) {
      this.scanT = 0.5;
      this.scan(root);
    }
    this.near.length = 0;
    for (const f of this.all) {
      const dx = at.x - f.c.x, dy = at.y - f.c.y, dz = at.z - f.c.z, R = f.r + NEAR;
      if (dx * dx + dy * dy + dz * dz < R * R) this.near.push(f);
    }
    this.stats.near = this.near.length;
    // nearest first, so the tree you are about to meet is the one grown now
    let best: Found | null = null, bd = Infinity;
    for (const f of this.near) {
      if (this.trees.has(f.mesh.geometry)) continue;
      const d = f.c.distanceToSquared(at) - f.r * f.r;
      if (d < bd) (bd = d), (best = f);
    }
    if (best) this.tree(best.mesh.geometry);
  }

  private tree(g: THREE.BufferGeometry): MeshBVH | null {
    let t = this.trees.get(g);
    if (t) return t;
    if (!g.attributes.position) return null;
    // indirect: the geometry's own buffers are left exactly as they are (nothing re-uploaded)
    t = new MeshBVH(g, { indirect: true, targetLeafSize: 12 });
    this.trees.set(g, t);
    this.stats.trees++;
    return t;
  }

  private scan(root: THREE.Object3D): void {
    this.all.length = 0;
    const walk = (o: THREE.Object3D): void => {
      if (!o.visible || o.userData.passable) return;
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh && !(o as THREE.SkinnedMesh).isSkinnedMesh && isSolid(mesh.material)) {
        const g = mesh.geometry;
        if (g.attributes.position) {
          let c: THREE.Vector3, r: number;
          const im = o as THREE.InstancedMesh;
          if (im.isInstancedMesh) {
            if (im.count === 0) return;
            if (!im.boundingSphere || this.sphereFor.get(im) !== im.instanceMatrix.version) {
              im.computeBoundingSphere();
              this.sphereFor.set(im, im.instanceMatrix.version);
            }
            _sph.copy(im.boundingSphere!).applyMatrix4(im.matrixWorld);
          } else {
            if (!g.boundingSphere) g.computeBoundingSphere();
            _sph.copy(g.boundingSphere!).applyMatrix4(mesh.matrixWorld);
          }
          c = _sph.center.clone();
          r = _sph.radius;
          const side = Array.isArray(mesh.material) ? mesh.material[0].side : mesh.material.side;
          this.all.push({ mesh, c, r, twoSided: side === THREE.DoubleSide });
        }
      }
      for (const ch of o.children) walk(ch);
    };
    walk(root);
    this.stats.solid = this.all.length;
  }

  /** Each placement of a found mesh near the point (its world matrix; per instance for an
      instanced mesh), with its tree. */
  private each(at: THREE.Vector3, reach: number, fn: (f: Found, m: THREE.Matrix4, t: MeshBVH) => void): void {
    for (const f of this.near) {
      const t = this.trees.get(f.mesh.geometry);
      if (!t) continue;
      const im = f.mesh as THREE.InstancedMesh;
      if (!im.isInstancedMesh) {
        if (f.mesh.matrixWorld.determinant() !== 0) fn(f, f.mesh.matrixWorld, t);
        continue;
      }
      const g = im.geometry;
      if (!g.boundingSphere) g.computeBoundingSphere();
      const bs = g.boundingSphere!;
      for (let i = 0; i < im.count; i++) {
        im.getMatrixAt(i, _inst);
        _m.multiplyMatrices(im.matrixWorld, _inst);
        _sph.copy(bs).applyMatrix4(_m);
        if (_sph.radius < 1e-4) continue; // an instance hidden by a zero scale
        const R = _sph.radius + reach;
        if (_sph.center.distanceToSquared(at) > R * R) continue;
        fn(f, _m, t);
      }
    }
  }

  /** Walking: the body standing at (p.x, feet, p.z) is pushed sideways out of any upright face it
      overlaps (mutates p). Returns whether it was moved. */
  pushWalk(p: { x: number; z: number }, feet: number, r: number): boolean {
    if (!this.enabled || !this.near.length) return false;
    let moved = false;
    const at = _w0.set(p.x, feet + 1, p.z);
    for (let pass = 0; pass < 2; pass++) {
      this.each(at, 2, (f, M, t) => {
        _inv.copy(M).invert();
        _nm.getNormalMatrix(M);
        const s = M.getMaxScaleOnAxis(), rl = r / s;
        _seg.start.set(p.x, feet + STEP + r, p.z).applyMatrix4(_inv);
        _seg.end.set(p.x, feet + HEAD - r, p.z).applyMatrix4(_inv);
        _seg0.copy(_seg.start);
        _box.makeEmpty().expandByPoint(_seg.start).expandByPoint(_seg.end);
        _box.min.addScalar(-rl);
        _box.max.addScalar(rl);
        let hit = false;
        t.shapecast({
          intersectsBounds: (box) => box.intersectsBox(_box),
          intersectsTriangle: (tri) => {
            tri.getNormal(_n);
            _nw.copy(_n).applyMatrix3(_nm).normalize();
            if (Math.abs(_nw.y) > WALL_NY) return false; // a floor, a step, a slope or a ceiling
            const dist = tri.closestPointToSegment(_seg, _a, _b);
            if (dist >= rl) return false;
            _d.subVectors(_b, _a);
            if (dist < 1e-6) _d.copy(_n);
            else _d.divideScalar(dist);
            if (!f.twoSided && _d.dot(_n) < 0) return false; // inside a closed block: let out
            const depth = rl - dist;
            _seg.start.addScaledVector(_d, depth);
            _seg.end.addScaledVector(_d, depth);
            hit = true;
            return false;
          },
        });
        if (!hit) return;
        // the move, back in the world, sideways only
        _w1.copy(_seg.start).applyMatrix4(M);
        _d.copy(_seg0).applyMatrix4(M);
        const mx = _w1.x - _d.x, mz = _w1.z - _d.z;
        if (!Number.isFinite(mx) || !Number.isFinite(mz) || mx * mx + mz * mz > 4) return; // never a leap
        p.x += mx;
        p.z += mz;
        at.set(p.x, feet + 1, p.z);
        moved = true;
      });
    }
    return moved;
  }

  /** Floating (the orb under the water, flight): a ball at `c` is pushed out of every face it
      overlaps, from any side (mutates c). Returns the push, or null. */
  pushBall(c: THREE.Vector3, r: number): THREE.Vector3 | null {
    if (!this.enabled || !this.near.length) return null;
    const start = _w1.copy(c);
    for (let pass = 0; pass < 2; pass++) {
      this.each(c, r + 1, (f, M, t) => {
        _inv.copy(M).invert();
        const s = M.getMaxScaleOnAxis(), rl = r / s;
        const lc = _a.copy(c).applyMatrix4(_inv);
        _seg0.copy(lc);
        _box.min.set(lc.x - rl, lc.y - rl, lc.z - rl);
        _box.max.set(lc.x + rl, lc.y + rl, lc.z + rl);
        let hit = false;
        t.shapecast({
          intersectsBounds: (box) => box.intersectsBox(_box),
          intersectsTriangle: (tri) => {
            tri.closestPointToPoint(lc, _b);
            _d.subVectors(lc, _b);
            const dist = _d.length();
            if (dist >= rl) return false;
            tri.getNormal(_n);
            if (dist < 1e-6) _d.copy(_n);
            else _d.divideScalar(dist);
            if (!f.twoSided && _d.dot(_n) < 0) return false;
            lc.addScaledVector(_d, rl - dist);
            hit = true;
            return false;
          },
        });
        if (!hit) return;
        _n.copy(lc).applyMatrix4(M);
        _d.copy(_seg0).applyMatrix4(M);
        _n.sub(_d);
        if (!Number.isFinite(_n.x + _n.y + _n.z) || _n.lengthSq() > 4) return; // never a leap
        c.add(_n);
      });
    }
    const push = _sph.center.subVectors(c, start);
    return push.lengthSq() > 1e-10 ? push : null;
  }

  /** The highest walkable solid face under (x, z), from `from` down to `to` (-Infinity if none). */
  floor(x: number, z: number, from: number, to = from - 60): number {
    if (!this.enabled || !this.near.length) return -Infinity;
    let best = -Infinity;
    const at = _w0.set(x, from, z);
    this.each(at, 1, (_f, M, t) => {
      _inv.copy(M).invert();
      _ray.origin.set(x, from, z).applyMatrix4(_inv);
      _ray.direction.set(0, -1, 0).transformDirection(_inv);
      const hit = t.raycastFirst(_ray, THREE.DoubleSide);
      if (!hit || !hit.face) return;
      _nm.getNormalMatrix(M);
      _nw.copy(hit.face.normal).applyMatrix3(_nm).normalize();
      if (Math.abs(_nw.y) < WALL_NY) return; // the first thing below is a wall's face: no floor here
      const y = _a.copy(hit.point).applyMatrix4(M).y;
      if (Number.isFinite(y) && y <= from + 1e-3 && y >= to && y > best) best = y;
    });
    return best;
  }

  /** The distance along a ray (world) to the first solid face, or Infinity (the camera's line). */
  ray(origin: THREE.Vector3, dir: THREE.Vector3, far: number): number {
    if (!this.enabled || !this.near.length) return Infinity;
    let best = Infinity;
    this.each(origin, far, (_f, M, t) => {
      _inv.copy(M).invert();
      _ray.origin.copy(origin).applyMatrix4(_inv);
      _ray.direction.copy(dir).transformDirection(_inv);
      const hit = t.raycastFirst(_ray, THREE.DoubleSide);
      if (!hit) return;
      const d = _a.copy(hit.point).applyMatrix4(M).distanceTo(origin);
      if (d < best && d <= far) best = d;
    });
    return best;
  }
}

export const solidity = new Solidity();
