/* The wanderer's wake: where it has just walked, as eight fading points of presence. Rocks,
   crystals and bark read it (`wakeGlow`) and brighten softly as the wanderer comes near, the light
   lingering a few seconds behind it and fading: the world answering a passing. Only on foot; in
   flight or in the water no new points are laid, and the old ones fade. */
import * as THREE from "three/webgpu";
import { T, type N } from "./tsl";

const { dot, exp, float, min, uniform, vec3 } = T;

const COUNT = 8;
const pts = Array.from({ length: COUNT }, () => uniform(new THREE.Vector4(0, -1e4, 0, 0)));

/** How strongly the wake touches the world position `p` (0..~1.2). Its reach is ~2.5 m across
    the ground and twice that upward, so a trunk or a tall stone lights along its height. */
export const wakeGlow = (p: N): N => {
  let s: N = float(0);
  for (const u of pts) {
    const d = p.sub(u.xyz).mul(vec3(1, 0.5, 1));
    s = s.add(u.w.mul(exp(dot(d, d).mul(-0.16))));
  }
  return min(s, 1.2);
};

const born = new Float64Array(COUNT).fill(-1e9);
let next = 0;
const last = new THREE.Vector3(0, -1e4, 0);
const heart = new THREE.Vector3();

/** Each frame: lay a point every so often while walking, and fade them all by age. `feet`:
    where the wanderer stands (its points are laid at the heart's height). */
export function wakeStep(t: number, feet: THREE.Vector3, speed: number, onFoot: boolean): void {
  heart.set(feet.x, feet.y + 1.1, feet.z);
  const gap = Math.max(1.3, speed * 0.55);
  if (onFoot && speed > 0.4 && heart.distanceToSquared(last) > gap * gap) {
    last.copy(heart);
    const u = pts[next].value as THREE.Vector4;
    u.set(heart.x, heart.y, heart.z, 0);
    born[next] = t;
    next = (next + 1) % COUNT;
  }
  for (let i = 0; i < COUNT; i++) {
    const a = t - born[i];
    // wakes over half a second, holds a moment, fades over ~5 s
    const rise = Math.min(1, Math.max(0, a / 0.5));
    (pts[i].value as THREE.Vector4).w = rise * rise * (3 - 2 * rise) * Math.exp(-Math.max(0, a - 1) / 2.4);
  }
}
