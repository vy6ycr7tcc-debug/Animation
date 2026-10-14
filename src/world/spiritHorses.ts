/* Spirit horses (the owner: the glass horses were "super lame"; "use something like the particles
   to make them appear and go away, almost like a spirit"). Each horse is a body of motes on the
   surface of the real horse model (mirada's, from the ROME project, via the three.js examples),
   moved by its own recorded gallop (the model's morph targets, read on the CPU; the mesh itself is
   never drawn). A horse comes as a spirit does: motes gather out of the air into its form near
   you, it roams a while in a slow dreamlike gait, wisps of light lifting off its back, and then it
   loosens back into rising motes and is gone, to appear again somewhere else. Rushing at one
   makes it dissolve; when the wanderer turns inward in stillness, those near come close and
   stand, and stay while the stillness lasts. Contained light, the figures' own soft point. */
import * as THREE from "three/webgpu";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { loadBytes } from "../core/assets";
import { gpuUniforms, softDot, softPoints, pointR, spriteCloud, T, viewDepth, type SpriteCloud } from "../gpu/tsl";
import { groundKind, heightAt, WATER_Y } from "./terrain";

const HEIGHT = 2.1; // the horse at the withers and head, metres

function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

interface Spirit {
  mesh: THREE.Mesh;
  mixer: THREE.AnimationMixer;
  action: THREE.AnimationAction;
  state: "away" | "gather" | "live" | "fade";
  /** 0 motes scattered in the air, 1 the horse whole. */
  form: number;
  /** Seconds left in this state (away, live). */
  left: number;
  p: THREE.Vector3;
  heading: number;
  speed: number;
  goal: THREE.Vector3;
  nextGoal: number;
  /** Where it roams. */
  home: THREE.Vector3;
  /** Seconds it keeps its own way, not drawn by stillness (a still's summoned ones). */
  own: number;
}

export class SpiritHorses {
  group = new THREE.Group();
  private horses: Spirit[] = [];
  private cloud: SpriteCloud | null = null;
  private P!: Float32Array;
  private A!: Float32Array;
  /** The model: rest positions, morph deltas, and the sampled surface (three corners and weights). */
  private base!: Float32Array;
  private deltas: Float32Array[] = [];
  private morphed!: Float32Array;
  private tri!: Uint16Array;
  private bary!: Float32Array;
  private seed!: Float32Array;
  private k = 1;
  private uT = T.uniform(0);
  private R = rng(77);
  /** Settles when the model is read (or could not be). */
  loaded: Promise<void>;
  /** For a still (`?shot=horses`): three come from `from` toward `to`, 12–18 m out, gathering. */
  private summonAt: { x: number; z: number; fx: number; fz: number } | null = null;
  summon(from: { x: number; z: number }, to: { x: number; z: number }): void {
    const dx = to.x - from.x, dz = to.z - from.z, l = Math.hypot(dx, dz) || 1;
    this.summonAt = { x: from.x, z: from.z, fx: dx / l, fz: dz / l };
  }

  constructor(
    private count = 8,
    private per = 1600,
  ) {
    this.loaded = count > 0 ? this.load() : Promise.resolve(); // none: nothing is fetched or built
  }

  private async load(): Promise<void> {
    const bytes = await loadBytes("models/animals/horse.glb");
    if (!bytes) return;
    let gltf: Awaited<ReturnType<GLTFLoader["parseAsync"]>>;
    try {
      gltf = await new GLTFLoader().parseAsync(bytes, "");
    } catch (e) {
      console.warn("Could not read the horse:", e); // never a silent absence
      return;
    }
    const src = gltf.scene.getObjectByProperty("type", "Mesh") as THREE.Mesh | undefined;
    const clip = gltf.animations[0];
    if (!src || !clip) return;
    const geo = src.geometry as THREE.BufferGeometry;
    const pos = geo.attributes.position as THREE.BufferAttribute;
    this.base = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) this.base.set([pos.getX(i), pos.getY(i), pos.getZ(i)], i * 3);
    const rel = geo.morphTargetsRelative;
    for (const m of geo.morphAttributes.position ?? []) {
      const d = new Float32Array(pos.count * 3);
      for (let i = 0; i < pos.count; i++) {
        d[i * 3] = m.getX(i) - (rel ? 0 : this.base[i * 3]);
        d[i * 3 + 1] = m.getY(i) - (rel ? 0 : this.base[i * 3 + 1]);
        d[i * 3 + 2] = m.getZ(i) - (rel ? 0 : this.base[i * 3 + 2]);
      }
      this.deltas.push(d);
    }
    this.morphed = new Float32Array(this.base.length);
    // its size from the rest shape (the geometry's bounding box takes in every frame of the gallop)
    let y0 = Infinity, y1 = -Infinity;
    for (let i = 1; i < this.base.length; i += 3) (y0 = Math.min(y0, this.base[i])), (y1 = Math.max(y1, this.base[i]));
    this.k = HEIGHT / Math.max(1e-3, y1 - y0);

    // the surface, sampled by area: each mote is three corners and their weights, so it rides the gallop
    const idx = geo.index ? (geo.index.array as ArrayLike<number>) : Array.from({ length: pos.count }, (_, i) => i);
    const nt = Math.floor(idx.length / 3), cum = new Float32Array(nt);
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
    let tot = 0;
    for (let t = 0; t < nt; t++) {
      a.fromBufferAttribute(pos, idx[t * 3]);
      b.fromBufferAttribute(pos, idx[t * 3 + 1]).sub(a);
      c.fromBufferAttribute(pos, idx[t * 3 + 2]).sub(a);
      tot += b.cross(c).length() * 0.5;
      cum[t] = tot;
    }
    const n = this.per, R = rng(31);
    this.tri = new Uint16Array(n * 3);
    this.bary = new Float32Array(n * 3);
    this.seed = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const r = R() * tot;
      let lo = 0, hi = nt - 1;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (cum[mid] < r) lo = mid + 1;
        else hi = mid;
      }
      let u = R(), v = R();
      if (u + v > 1) (u = 1 - u), (v = 1 - v);
      this.tri.set([idx[lo * 3], idx[lo * 3 + 1], idx[lo * 3 + 2]], i * 3);
      this.bary.set([1 - u - v, u, v], i * 3);
      this.seed[i] = R();
    }

    // one cloud for the whole herd, in world space
    const N = n * this.count;
    const mat = softPoints();
    const cloud = spriteCloud(N, { position: 3, aCol: 3, aSeed: 1, aA: 1 }, mat);
    this.cloud = cloud;
    this.P = cloud.attrs.position.array as Float32Array;
    this.A = cloud.attrs.aA.array as Float32Array;
    const col = cloud.attrs.aCol.array as Float32Array, sd = cloud.attrs.aSeed.array as Float32Array;
    const pale = [0.72, 0.86, 1.0], gold = [1.0, 0.84, 0.58], pearl = [0.96, 0.94, 1.0];
    for (let h = 0; h < this.count; h++)
      for (let i = 0; i < n; i++) {
        const j = h * n + i, s = this.seed[i];
        // each horse its own cast: most pale moonlight, one in three warmer
        const cc = h % 3 === 2 ? (s < 0.6 ? gold : pearl) : s < 0.75 ? pale : pearl;
        col.set(cc, j * 3);
        sd[j] = (s * 7.31 + h * 0.37) % 1;
      }
    {
      const { clamp, float, max, sin, vec4 } = T;
      const { position, aCol, aSeed, aA } = cloud.nodes;
      mat.sizeNode = clamp(gpuUniforms.px.mul(0.034).mul(aSeed.mul(0.8).add(0.6)).div(max(viewDepth(position), 0.4)), float(1).div(gpuUniforms.dpr), 7);
      const flick = sin(this.uT.mul(13).add(aSeed.mul(97))).mul(0.15).add(0.85);
      mat.colorNode = vec4(aCol.mul(softDot(pointR())).mul(flick).mul(aA).mul(0.75), 1);
    }
    cloud.sprite.frustumCulled = false;
    cloud.setCount(0);
    this.group.add(cloud.sprite);

    for (let h = 0; h < this.count; h++) {
      const mesh = new THREE.Mesh(geo);
      mesh.name = src.name; // the motion finds its target by name
      mesh.morphTargetInfluences = [...(src.morphTargetInfluences ?? new Array(this.deltas.length).fill(0))];
      mesh.morphTargetDictionary = src.morphTargetDictionary;
      const mixer = new THREE.AnimationMixer(mesh);
      const action = mixer.clipAction(clip);
      action.play();
      mixer.update(this.R() * clip.duration);
      this.horses.push({
        mesh, mixer, action, state: "away", form: 0, left: 2 + h * 2.5 + this.R() * 4,
        p: new THREE.Vector3(), heading: this.R() * 6.28, speed: 0, goal: new THREE.Vector3(), nextGoal: 0, home: new THREE.Vector3(), own: 0,
      });
    }
  }

  /** Open meadow near a point, somewhere it can be met (not underfoot, not far off). */
  private meadowNear(x: number, z: number, rMin: number, rMax: number): THREE.Vector3 | null {
    for (let k = 0; k < 24; k++) {
      const a = this.R() * 6.28, r = rMin + this.R() * (rMax - rMin);
      const px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
      const h = heightAt(px, pz);
      if (h > WATER_Y + 0.6 && h < 40 && groundKind(px, pz, h).stone < 0.3) return new THREE.Vector3(px, h, pz);
    }
    return null;
  }

  /** `still`: 0–1, the wanderer's stillness. `rushing`: running or gliding. `away`: somewhere apart
      (a place inside, the water): none come, and those here go. */
  update(t: number, dt: number, player: THREE.Vector3, still: number, rushing: boolean, reduced: boolean, away = false): void {
    const cloud = this.cloud;
    if (!cloud) return;
    this.uT.value = t;
    if (this.summonAt && this.horses.length) {
      const { x: cx, z: cz, fx, fz } = this.summonAt;
      this.horses.slice(0, 3).forEach((h, i) => {
        const x = cx + fx * (12 + i * 3) - fz * (i - 1) * 4, z = cz + fz * (12 + i * 3) + fx * (i - 1) * 4;
        h.p.set(x, Math.max(heightAt(x, z), WATER_Y), z);
        h.home.copy(h.p);
        // across the view, walking
        h.goal.set(h.p.x - fz * 40, 0, h.p.z + fx * 40);
        h.heading = Math.atan2(fz, -fx);
        Object.assign(h, { state: "gather", form: 0, left: 60, nextGoal: 60, own: 60 });
      });
      this.summonAt = null;
    }
    let any = false;
    for (const h of this.horses) {
      const toP = Math.hypot(player.x - h.p.x, player.z - h.p.z);
      if (h.state === "away") {
        h.left -= dt;
        if (h.left <= 0 && !away) {
          // appear: beside one of its kind if one is here, or alone in the meadow
          const kin = this.horses.find((o) => o !== h && (o.state === "live" || o.state === "gather") && o.p.distanceTo(player) < 70);
          const at = kin && this.R() < 0.7 ? this.meadowNear(kin.p.x, kin.p.z, 3, 9) : this.meadowNear(player.x, player.z, 16, 44);
          if (at) {
            h.p.copy(at);
            h.home.copy(kin ? kin.home : at);
            h.goal.copy(at);
            h.heading = kin ? kin.heading + (this.R() - 0.5) * 0.8 : this.R() * 6.28;
            h.speed = 0;
            h.nextGoal = 2 + this.R() * 3;
            h.state = "gather";
            h.left = 30 + this.R() * 45;
          } else h.left = 3;
        }
        if (h.state === "away") continue;
      }
      // going: startled by a rush, far behind, or somewhere apart
      if ((h.state === "live" || h.state === "gather") && ((rushing && toP < 14) || toP > 110 || away)) h.state = "fade";
      if (h.state === "live") {
        h.left -= still > 0.4 && toP < 40 ? 0 : dt; // it stays while the stillness lasts
        if (h.left <= 0) h.state = "fade";
      }
      if (h.state === "gather") {
        h.form = Math.min(1, h.form + dt / 3.6);
        if (h.form >= 1) h.state = "live";
      } else if (h.state === "fade") {
        h.form = Math.max(0, h.form - dt / (rushing ? 2.2 : 4.5));
        if (h.form <= 0) {
          h.state = "away";
          h.left = 8 + this.R() * 22;
          continue;
        }
      }
      any = true;

      // its way: wandering the meadow; drawn close by the wanderer's stillness
      h.nextGoal -= dt;
      h.own -= dt;
      const pace = 1.2;
      if (still > 0.4 && toP < 50 && h.state !== "fade" && h.own <= 0) {
        const a = Math.atan2(h.p.z - player.z, h.p.x - player.x);
        h.goal.set(player.x + Math.cos(a) * 4.5, 0, player.z + Math.sin(a) * 4.5);
      } else if (h.nextGoal <= 0) {
        h.goal.set(h.home.x + (this.R() - 0.5) * 30, 0, h.home.z + (this.R() - 0.5) * 30);
        h.nextGoal = 8 + this.R() * 12;
      }
      const dx = h.goal.x - h.p.x, dz = h.goal.z - h.p.z, dist = Math.hypot(dx, dz);
      const want = dist > 0.6 ? Math.min(pace, dist * 0.5) : 0;
      h.speed += (want - h.speed) * Math.min(1, dt * 1.2);
      if (dist > 0.4) {
        const hd = Math.atan2(-dx, -dz);
        h.heading += Math.atan2(Math.sin(hd - h.heading), Math.cos(hd - h.heading)) * Math.min(1, dt * 1.6);
      } else if (still > 0.4 && h.own <= 0) {
        const hd = Math.atan2(-(player.x - h.p.x), -(player.z - h.p.z));
        h.heading += Math.atan2(Math.sin(hd - h.heading), Math.cos(hd - h.heading)) * Math.min(1, dt);
      }
      h.p.x -= Math.sin(h.heading) * h.speed * dt;
      h.p.z -= Math.cos(h.heading) * h.speed * dt;
      const g = heightAt(h.p.x, h.p.z);
      if (g < WATER_Y + 0.3) {
        h.goal.copy(h.home);
        h.nextGoal = 6;
      }
      h.p.y = Math.max(g, WATER_Y);
      // the gallop slowed to a dream; standing, it all but rests
      h.action.timeScale = (reduced ? 0.08 : 0.17) * Math.max(0.25, h.speed);
      h.mixer.update(dt);
    }

    // the motes
    const n = this.per, P = this.P, A = this.A, tri = this.tri, bary = this.bary, seed = this.seed, M = this.morphed, base = this.base;
    let live = 0;
    this.horses.forEach((h, hi) => {
      const o = hi * n;
      if (h.state === "away") {
        for (let i = 0; i < n; i++) A[o + i] = 0;
        return;
      }
      live = hi + 1;
      // the model's surface at this moment of its gallop
      M.set(base);
      const inf = h.mesh.morphTargetInfluences!;
      for (let m = 0; m < this.deltas.length; m++) {
        const w = inf[m];
        if (!w) continue;
        const d = this.deltas[m];
        for (let j = 0; j < M.length; j++) M[j] += w * d[j];
      }
      // the hooves on the ground at every moment of the gallop (its frames lift the whole body)
      let low = Infinity;
      for (let j = 1; j < M.length; j += 3) if (M[j] < low) low = M[j];
      const yOff = -low * this.k;
      // model → world: scaled, lifted to stand, turned (the model faces +z; the game's creatures −z)
      const ang = h.heading + Math.PI, cs = Math.cos(ang), sn = Math.sin(ang), k = this.k;
      const fx = -Math.sin(h.heading), fz = -Math.cos(h.heading); // its forward
      const form = h.form, sp = h.speed, rise = reduced ? 0.4 : 1;
      for (let i = 0; i < n; i++) {
        const t3 = i * 3, a0 = tri[t3] * 3, a1 = tri[t3 + 1] * 3, a2 = tri[t3 + 2] * 3;
        const w0 = bary[t3], w1 = bary[t3 + 1], w2 = bary[t3 + 2];
        const lx = (M[a0] * w0 + M[a1] * w1 + M[a2] * w2) * k;
        const ly = (M[a0 + 1] * w0 + M[a1 + 1] * w1 + M[a2 + 1] * w2) * k + yOff;
        const lz = (M[a0 + 2] * w0 + M[a1 + 2] * w1 + M[a2 + 2] * w2) * k;
        let x = h.p.x + lx * cs + lz * sn, y = h.p.y + ly, z = h.p.z - lx * sn + lz * cs;
        const s = seed[i];
        // each mote comes (and goes) on its own time: the legs first, the back and the head last
        const e0 = Math.min(1, Math.max(0, (form - s * 0.45) / 0.55));
        const e = e0 * e0 * (3 - 2 * e0);
        let a = e;
        if (e < 0.999) {
          // loose: risen and drifted outward in a slow swirl, as smoke from a candle
          const l = 1 - e, an = s * 47.1 + t * (0.25 + s * 0.3), r = l * (0.6 + s * 1.6);
          x += Math.cos(an) * r;
          z += Math.sin(an) * r;
          y += l * (0.8 + s * 2.6) * rise;
          a = e + l * 0.45 * Math.min(1, form * 3);
        }
        if (s < 0.09 && !reduced) {
          // wisps lifting off its back and streaming behind it as it goes
          const ph = (t * (0.3 + s * 2) + s * 11) % 1;
          y += ph * 1.1;
          x -= fx * ph * (0.4 + sp * 0.8);
          z -= fz * ph * (0.4 + sp * 0.8);
          a *= 1 - ph;
        }
        const j = (o + i) * 3;
        P[j] = x;
        P[j + 1] = y;
        P[j + 2] = z;
        A[o + i] = a;
      }
    });
    cloud.setCount(live * n);
    cloud.sprite.visible = any;
    if (any) {
      cloud.attrs.position.needsUpdate = true;
      cloud.attrs.aA.needsUpdate = true;
    }
  }
}
