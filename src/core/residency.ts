/* Residency: what a place apart builds is freed when it is taken down. Each room disposes what it
   knows it made, but rooms share kits, caches and helpers, and a handful of geometries and
   textures slipped past every crossing (up to 33 a room), which on a phone adds up until the GPU is
   taken away. This sweep frees whatever the room's objects hold that nothing still in the scene
   uses: geometries, materials, the textures their nodes read, and lights' shadow maps. Something
   shared with a module cache is simply uploaded again the next time it is drawn. */
import * as THREE from "three/webgpu";

interface Held {
  geo: Set<THREE.BufferGeometry>;
  mat: Set<THREE.Material>;
  tex: Set<THREE.Texture>;
}

function empty(): Held {
  return { geo: new Set(), mat: new Set(), tex: new Set() };
}

type NodeLike = { isNode?: boolean; value?: unknown; getChildren?: () => Iterable<NodeLike> };

function textures(m: THREE.Material, into: Set<THREE.Texture>, seen: Set<unknown>): void {
  const rec = m as unknown as Record<string, unknown>;
  const stack: NodeLike[] = [];
  for (const k of Object.keys(rec)) {
    const v = rec[k] as { isTexture?: boolean; isNode?: boolean } | null;
    if (!v || typeof v !== "object") continue;
    if (v.isTexture) into.add(v as unknown as THREE.Texture);
    else if (v.isNode) stack.push(v as NodeLike);
  }
  while (stack.length) {
    const n = stack.pop()!;
    if (seen.has(n)) continue;
    seen.add(n);
    const v = n.value as { isTexture?: boolean } | undefined;
    if (v && v.isTexture) into.add(v as unknown as THREE.Texture);
    try {
      for (const c of n.getChildren?.() ?? []) if (!seen.has(c)) stack.push(c);
    } catch {
      /* a node that cannot list its children holds nothing we made */
    }
  }
}

function gather(roots: Iterable<THREE.Object3D>, into: Held, seen: Set<unknown>): void {
  for (const root of roots)
    root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) into.geo.add(m.geometry);
      const mats = m.material ? (Array.isArray(m.material) ? m.material : [m.material]) : [];
      for (const mat of mats) {
        if (into.mat.has(mat)) continue;
        into.mat.add(mat);
        textures(mat, into.tex, seen);
      }
    });
}

/** Free what `room` holds that nothing else in `scene` (the world, hidden or not, and what is
    kept across places) still uses. Call after the room's own dispose, once it is out of the scene. */
export function release(scene: THREE.Scene, room: THREE.Object3D[]): void {
  if (!room.length) return;
  const mine = empty(), kept = empty();
  gather(room, mine, new Set());
  gather(scene.children, kept, new Set());
  for (const g of mine.geo) if (!kept.geo.has(g)) g.dispose();
  for (const m of mine.mat) if (!kept.mat.has(m)) m.dispose();
  for (const t of mine.tex) if (!kept.tex.has(t) && !(t as { isRenderTargetTexture?: boolean }).isRenderTargetTexture) t.dispose();
  for (const r of room)
    r.traverse((o) => {
      const l = o as THREE.Light;
      if (l.isLight) l.dispose();
    });
}
