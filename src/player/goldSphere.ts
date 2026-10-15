/* The golden sphere the wanderer becomes in the mind's maze (the owner: "the sphere here should be
   made of gold and extremely reflective"). Polished gold, its mirror drawn in its own shader:
   nothing is baked or reflected from the scene (the standing rule: no `scene.environment`, no
   mirrored world, after the galaxies' reflections slid over the land as blobs). What it mirrors is
   a sky made for it: the maze's storm-dark indigo, an ember band low toward the volcano, fine stars,
   and a hot highlight toward the maze's sun; a strong fresnel rim; a seed-of-life of fine engraved
   rings cut into the gold, which turns with the roll (the reflection, rightly, does not), so it
   reads as rolling. Seen in the maze only when the view is not the sphere's own eyes: arriving,
   leaving, and from the eagle's height at the centre. One mesh; nothing allocated per frame. */
import * as THREE from "three/webgpu";
import { T, hash3 } from "../gpu/tsl";

const { float, vec3, vec4, mix, smoothstep, pow, max, normalize, dot, reflect, uniform, length, abs, sin, fract } = T;

export const GOLD_R = 0.42;

export class GoldSphere {
  readonly mesh: THREE.Mesh;
  /** Where the maze's sun hangs (world), for the highlight. */
  readonly sun = uniform(new THREE.Vector3(0, 200, 0));
  private readonly axis = new THREE.Vector3();
  private readonly spin = new THREE.Quaternion();
  private readonly last = new THREE.Vector3();
  private placed = false;

  constructor() {
    const geo = new THREE.SphereGeometry(GOLD_R, 64, 40);
    const m = new THREE.MeshBasicNodeMaterial({ fog: false });
    const N = normalize(T.normalWorld), V = normalize(T.cameraPosition.sub(T.positionWorld));
    const R = reflect(V.negate(), N);
    // the mirrored sky: indigo overhead, an ember band at the horizon, a darker ground below
    const up = R.y;
    const skyHi = vec3(0.05, 0.05, 0.14), skyLow = vec3(0.55, 0.24, 0.1), ground = vec3(0.03, 0.022, 0.03);
    let sky = mix(skyLow, skyHi, smoothstep(0.0, 0.55, up));
    sky = mix(ground, sky, smoothstep(-0.25, 0.02, up));
    const band = pow(max(float(0), float(1).sub(abs(up).mul(5))), float(2)).mul(0.35);
    const cell = T.floor(R.mul(140));
    const star = T.step(0.992, hash3(cell)).mul(smoothstep(0.3, 0.0, length(fract(R.mul(140)).sub(0.5)))).mul(smoothstep(0.05, 0.3, up));
    const toSun = normalize(this.sun.sub(T.positionWorld));
    const rs = max(dot(R, toSun), 0);
    const hot = pow(rs, float(260)).mul(5).add(pow(rs, float(18)).mul(0.6));
    const mirror = sky.add(vec3(1.0, 0.6, 0.3).mul(band)).add(vec3(0.9, 0.92, 1.0).mul(star)).add(vec3(1.0, 0.86, 0.6).mul(hot));
    // gold takes its colour from what it mirrors; a fresnel edge brightens toward white-gold
    const gold = vec3(1.0, 0.74, 0.32);
    const fres = pow(float(1).sub(max(dot(N, V), 0)), float(4));
    const P = T.positionGeometry.div(GOLD_R); // in the sphere's own (rolling) frame
    // engraved rings: the seed of life, seven circles over the sphere, cut as fine dark grooves
    let groove: any = float(0);
    const centres: [number, number, number][] = [[0, 0, 1], [0, 0, -1], [0.866, 0, 0.5], [-0.866, 0, 0.5], [0.866, 0, -0.5], [-0.866, 0, -0.5], [0, 1, 0]];
    for (const [x, y, z] of centres) {
      const d = abs(dot(P, vec3(x, y, z)).sub(0.5));
      groove = max(groove, smoothstep(0.022, 0.0, d));
    }
    const shimmer = sin(T.positionGeometry.y.mul(90)).mul(0.015).add(1);
    const col = gold.mul(mirror.mul(1.9).add(0.03)).mul(shimmer).mul(float(1).sub(groove.mul(0.55))).add(vec3(1.0, 0.9, 0.7).mul(fres.mul(0.55)));
    m.colorNode = vec4(col, 1);
    this.mesh = new THREE.Mesh(geo, m);
    this.mesh.visible = false;
    this.mesh.renderOrder = 2;
  }

  /** Each frame: stand on the ground at `feet`, rolling as it moves (world). */
  update(feet: THREE.Vector3, visible: boolean): void {
    this.mesh.visible = visible;
    const p = this.mesh.position;
    if (!this.placed) this.last.copy(feet), (this.placed = true);
    const dx = feet.x - this.last.x, dz = feet.z - this.last.z, d = Math.hypot(dx, dz);
    if (d > 1e-4 && d < 3) {
      // rolling without slipping: about the axis across the motion, by the distance over the radius
      this.axis.set(dz / d, 0, -dx / d);
      this.spin.setFromAxisAngle(this.axis, d / GOLD_R);
      this.mesh.quaternion.premultiply(this.spin);
    }
    this.last.copy(feet);
    p.set(feet.x, feet.y + GOLD_R, feet.z);
  }
}

/** The reach (the Potentiator, the hand reaching into the dark): while you drag to roll, a fine
    line of gold light runs over the floor from the sphere, curving from where you go toward where
    you pull, a slow pulse travelling out along it; let go and it fades. One strip of fixed size,
    rewritten in place each frame it shows (nothing allocated). */
export class ReachLine {
  readonly mesh: THREE.Mesh;
  private readonly pos: Float32Array;
  private readonly attr: THREE.BufferAttribute;
  private readonly k = uniform(0);
  private kv = 0;
  private static readonly N = 28;

  constructor(t: any) {
    const N = ReachLine.N;
    this.pos = new Float32Array(N * 2 * 3);
    const along = new Float32Array(N * 2), side = new Float32Array(N * 2), idx: number[] = [];
    for (let i = 0; i < N; i++) {
      along[i * 2] = along[i * 2 + 1] = i / (N - 1);
      side[i * 2] = -1;
      side[i * 2 + 1] = 1;
      if (i < N - 1) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
    }
    const geo = new THREE.BufferGeometry();
    this.attr = new THREE.BufferAttribute(this.pos, 3);
    this.attr.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute("position", this.attr);
    geo.setAttribute("aS", new THREE.BufferAttribute(along, 1));
    geo.setAttribute("aSide", new THREE.BufferAttribute(side, 1));
    geo.setIndex(idx);
    const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, side: THREE.DoubleSide });
    const s = T.attribute("aS", "float"), sd = T.attribute("aSide", "float");
    const ends = smoothstep(0.0, 0.12, s).mul(smoothstep(1.0, 0.55, s));
    const pulse = pow(sin(s.mul(9).sub(t.mul(2.2))).mul(0.5).add(0.5), float(6)).mul(0.6).add(0.4);
    const soft = float(1).sub(sd.mul(sd));
    m.colorNode = vec4(vec3(1.0, 0.8, 0.45).mul(ends.mul(pulse).mul(soft).mul(this.k).mul(0.5)), 1);
    this.mesh = new THREE.Mesh(geo, m);
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
  }

  /** `feet` the sphere's foot, `hx/hz` the way it goes, `ax/az` the way the drag pulls (unit, world). */
  update(dt: number, on: boolean, feet: THREE.Vector3, hx: number, hz: number, ax: number, az: number, ground: (x: number, z: number) => number): void {
    this.kv += ((on ? 1 : 0) - this.kv) * Math.min(1, dt * (on ? 3 : 1.6));
    this.k.value = this.kv;
    this.mesh.visible = this.kv > 0.01;
    if (!this.mesh.visible) return;
    const N = ReachLine.N, W = 0.035;
    const x0 = feet.x + hx * 0.5, z0 = feet.z + hz * 0.5;
    const x1 = feet.x + hx * 1.7, z1 = feet.z + hz * 1.7;
    const x2 = feet.x + ax * 3.4, z2 = feet.z + az * 3.4;
    for (let i = 0; i < N; i++) {
      const u = i / (N - 1), a = (1 - u) * (1 - u), b = 2 * u * (1 - u), c = u * u;
      const x = a * x0 + b * x1 + c * x2, z = a * z0 + b * z1 + c * z2;
      // across the line: perpendicular to its direction here
      const tx = 2 * (1 - u) * (x1 - x0) + 2 * u * (x2 - x1), tz = 2 * (1 - u) * (z1 - z0) + 2 * u * (z2 - z1);
      const l = Math.hypot(tx, tz) || 1, px = -tz / l * W, pz = tx / l * W;
      const y = ground(x, z) + 0.03;
      this.pos.set([x - px, y, z - pz, x + px, y, z + pz], i * 6);
    }
    this.attr.needsUpdate = true;
  }
}
