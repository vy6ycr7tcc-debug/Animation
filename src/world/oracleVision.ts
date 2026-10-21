/* The oracle, summoned in the world (the owner: "the oracle is summoned in the game and then you see
   the beautiful animations"; then: "use like a particle made sun with dynamism"). A small sun made
   of light, every point moved on the GPU from its own seeds and the clock, so it is never still:
   - the photosphere: a shell of points boiling (two scales of noise lift and drop them), turning;
   - its glow within: a dim body of points under the shell;
   - the corona: points streaming out along the rays, swirling a little, thinning as they go;
   - prominences: loops of magma arching out of the surface, their points flowing along them;
   - eruptions: fountains flung out from three places in turn, falling back under its pull,
     white-hot to ember.
   It answers the conversation:
   - summoned, it gathers out of a single point and kindles;
   - quiet, it breathes and turns slowly;
   - thinking (the question is out), it draws in, cooler, its corona wound into a turning vortex;
   - speaking (the phone's voice reads), each sentence sends a flare through it: the corona swells,
     an eruption leaps;
   - let go, it draws into a point and is gone.
   Contained (docs/style): soft small points, additive, no spreading glow; it fades near the lens. */
import * as THREE from "three/webgpu";
import { MOBILE } from "../core/quality";
import { flow, gpuUniforms, hash2b, softDot, softPoints, pointR, spriteCloud, T, viewDepth, vnoise, type SpriteCloud } from "../gpu/tsl";

export type PresenceState = "quiet" | "thinking" | "speaking";

/** How far ahead of the view it is summoned (less where something stands nearer). */
const AHEAD = 9;
/** …and ahead of the wanderer, when the view is close behind it. */
const NEAR = 8;
/** The sun's radius (m); its corona reaches about 2.7 times further. */
const R = 1.35;

export class OracleVision {
  /** Where it stands, turned to the view. */
  private root = new THREE.Group();
  private cloud: SpriteCloud | null = null;
  private U = {
    t: T.uniform(0),
    /** 0 a point … 1 kindled */
    grow: T.uniform(0),
    think: T.uniform(0),
    speak: T.uniform(0),
    /** a sentence's flare, decaying */
    flare: T.uniform(0),
    spin: T.uniform(0),
  };
  private t = 0;
  private state: PresenceState = "quiet";
  private grow = 0;
  private think = 0;
  private speak = 0;
  private flare = 0;
  private spin = 0;
  /** Seconds left before a closing presence is gone (−1 while open). */
  private going = -1;
  private dir = new THREE.Vector3();
  private right = new THREE.Vector3();
  private centre_ = new THREE.Vector3();

  /** `clearAhead`: how far along a direction before something solid (between near and max). */
  constructor(
    private scene: THREE.Scene,
    private camera: THREE.PerspectiveCamera,
    private clearAhead: (from: THREE.Vector3, dir: THREE.Vector3, near: number, max: number) => number,
    private wanderer: () => THREE.Vector3,
  ) {}

  get open(): boolean {
    return !!this.cloud && this.going < 0;
  }

  /** Its heart in the world, while it is here. */
  centre(): THREE.Vector3 | null {
    return this.cloud ? this.root.getWorldPosition(this.centre_) : null;
  }

  /** The body of light: its points' seeds, and how each moves (all on the GPU). */
  private build(): SpriteCloud {
    const n = MOBILE ? 9000 : 14000;
    const mat = softPoints();
    const c = spriteCloud(n, { aS: 4 }, mat);
    const a = c.attrs.aS.array as Float32Array;
    let s = 9091;
    const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < n * 4; i++) a[i] = rnd();
    c.attrs.aS.needsUpdate = true;

    const { float, vec2, vec3, vec4, sin, cos, fract, floor, mix, step, smoothstep, clamp, sqrt, max, pow } = T;
    const U = this.U, S = c.nodes.aS, t = U.t;
    const s0 = S.x, s1 = S.y, s2 = S.z, kind = S.w;
    const TAU = 6.28318;
    // the sun draws in while thinking
    const Rk = float(R).mul(float(1).sub(U.think.mul(0.16))).mul(U.grow);
    // a direction on the sphere from two seeds, turned about the sun's axis
    const z = s0.mul(2).sub(1), ring = sqrt(max(float(1).sub(z.mul(z)), 0));
    const phi = s1.mul(TAU).add(U.spin);
    const dirAt = (ph: any) => vec3(ring.mul(cos(ph)), z, ring.mul(sin(ph)));
    const dir = dirAt(phi);

    // 1. the photosphere, boiling (kind < 0.46)
    const boil = vnoise(vec2(phi.mul(2.2).add(t.mul(0.35)), z.mul(3.1).sub(t.mul(0.22)))).mul(0.65)
      .add(vnoise(vec2(phi.mul(7).sub(t.mul(0.9)), z.mul(8).add(t.mul(0.6)))).mul(0.35));
    const surf = dir.mul(Rk.mul(boil.mul(0.1).add(0.97)));
    const surfCol = mix(vec3(1.0, 0.42, 0.12), vec3(1.0, 0.86, 0.6), smoothstep(0.35, 0.75, boil));
    const surfA = boil.mul(0.7).add(0.35);

    // 2. the glow within (0.46–0.56)
    const deep = dir.mul(Rk.mul(pow(s2, 0.33).mul(0.9)));
    const deepCol = vec3(1.0, 0.75, 0.42);

    // 3. the corona, streaming out (0.56–0.84); wound into a vortex while thinking
    const life = fract(t.mul(s2.mul(0.08).add(0.06)).add(s2.mul(7.3)));
    const reach = float(1.7).add(U.speak.mul(0.5)).add(U.flare.mul(1.2)).sub(U.think.mul(0.9));
    const cr = Rk.mul(float(1.02).add(life.mul(reach)));
    const wind = life.mul(float(0.5).add(U.think.mul(3.2)));
    // streamers: the corona's points curl together on the plasma's currents (`flow`), more the
    // further out they have streamed, so it reads as twisting filaments, not loose sparks
    const cDir = dirAt(phi.add(wind));
    const corona = cDir.mul(cr).add(flow(cDir.mul(1.7).add(dir.mul(life.mul(2))), t.mul(0.35)).mul(life.mul(Rk).mul(0.22)));
    const coronaCol = mix(vec3(1.0, 0.92, 0.78), vec3(0.78, 0.76, 1.0), U.think);
    const coronaA = float(1).sub(life).mul(smoothstep(0, 0.08, life)).mul(0.55).mul(float(1).add(U.flare.mul(1.2)));

    // 4. prominences: six loops of magma arching out of the surface (0.84–0.96)
    const loop = floor(s2.mul(6));
    const lz = hash2b(vec2(loop, 1.7)).mul(1.6).sub(0.8), lp = hash2b(vec2(loop, 5.3)).mul(TAU).add(U.spin);
    const lr = sqrt(max(float(1).sub(lz.mul(lz)), 0));
    const base = vec3(lr.mul(cos(lp)), lz, lr.mul(sin(lp)));
    const tan = vec3(sin(lp).negate(), 0, cos(lp));
    const u = fract(t.mul(0.09).add(s0));
    const lh = hash2b(vec2(loop, 9.1)).mul(0.5).add(0.35).mul(float(1).add(U.speak.mul(0.4)).add(U.flare.mul(0.6)));
    const arch = sin(u.mul(3.14159));
    const prom = base.mul(Rk.mul(float(1).add(arch.mul(lh)))).add(tan.mul(Rk.mul(u.sub(0.5).mul(0.9))))
      .add(vec3(s1.sub(0.5), s2.sub(0.5), s0.sub(0.5)).mul(0.05));
    const promCol = mix(vec3(1.0, 0.32, 0.1), vec3(1.0, 0.75, 0.4), arch);

    // 5. eruptions: three places in turn fling a fountain out and it falls back (≥ 0.96)
    const site = floor(s1.mul(3));
    const period = float(7).sub(U.speak.mul(2.5));
    const ph = fract(t.add(site.mul(2.35)).div(period));
    const tau = clamp(ph.mul(1.6), 0, 1);
    const ez = hash2b(vec2(site, 2.2)).mul(1.4).sub(0.7), ep = hash2b(vec2(site, 8.8)).mul(TAU).add(U.spin);
    const er = sqrt(max(float(1).sub(ez.mul(ez)), 0));
    const eDir = vec3(er.mul(cos(ep)), ez, er.mul(sin(ep)));
    const spread = vec3(s0.sub(0.5), s2.sub(0.5), s1.mul(0.7).sub(0.35)).mul(0.9);
    const hgt = tau.mul(float(1).sub(tau)).mul(4).mul(float(1.1).add(s2.mul(0.9)).add(U.flare.mul(1.4)).add(U.speak.mul(0.5)));
    const erupt = eDir.add(spread.mul(tau)).normalize().mul(Rk.mul(float(1).add(hgt)));
    const eruptCol = mix(vec3(1.0, 0.95, 0.85), vec3(1.0, 0.3, 0.08), tau);
    const eruptA = smoothstep(0, 0.05, tau).mul(float(1).sub(smoothstep(0.85, 1, tau)));

    // which kind this point is
    const k1 = step(0.46, kind), k2 = step(0.56, kind), k3 = step(0.84, kind), k4 = step(0.96, kind);
    let p = mix(surf, deep, k1);
    p = mix(p, corona, k2);
    p = mix(p, prom, k3);
    p = mix(p, erupt, k4);
    let col = mix(surfCol.mul(surfA).mul(1.25), deepCol.mul(0.09), k1);
    col = mix(col, coronaCol.mul(coronaA), k2);
    col = mix(col, promCol.mul(0.8), k3);
    col = mix(col, eruptCol.mul(eruptA).mul(1.2), k4);
    // while thinking the whole sun cools a little; a flare brightens it
    col = mix(col, col.mul(vec3(0.8, 0.82, 1.05)), U.think).mul(float(1).add(U.flare.mul(0.5)));
    mat.positionNode = p;
    const depth = viewDepth(T.modelWorldMatrix.mul(vec4(p, 1)).xyz);
    // the shell's points are broad enough to close into a burning surface, the glow within broader
    // and dim, so the sun reads as a body of light, not a cage of dots
    let size = mix(float(0.075), float(0.26), k1);
    size = mix(size, float(0.045), k2);
    size = mix(size, float(0.06), k3);
    size = size.mul(s2.mul(0.5).add(0.75));
    mat.sizeNode = clamp(gpuUniforms.px.mul(size).div(max(depth, 1.2)), float(1).div(gpuUniforms.dpr), 40);
    const flick = sin(t.mul(s0.mul(8).add(6)).add(s1.mul(80))).mul(0.15).add(0.85);
    const nearK = smoothstep(1.2, 3.5, depth);
    mat.colorNode = vec4(col.mul(softDot(pointR()).mul(1.3)).mul(flick).mul(nearK).mul(U.grow.mul(0.85).add(0.15)), 1);
    c.sprite.frustumCulled = false;
    return c;
  }

  /** Summoned: out of a point a little ahead of the view (raised over the question bar), facing it.
      `above`: the view looks steeply down on the wanderer (the maze), whatever it shows this moment. */
  summon(above = false): void {
    if (this.cloud && this.going >= 0) {
      // called back while it was going: it kindles again where it is
      this.going = -1;
      return;
    }
    if (this.cloud) return;
    const cam = this.camera, at = this.wanderer();
    cam.updateMatrixWorld();
    if (cam.position.y - at.y > 40) {
      cam.getWorldDirection(this.dir);
      // a view from high above (the maze's eagle): in the air ahead of the view, a little above its middle
      this.right.crossVectors(this.dir, cam.up).normalize();
      this.dir.applyAxisAngle(this.right, 0.12).normalize();
      const d = Math.max(3.5, Math.min(AHEAD, this.clearAhead(cam.position, this.dir, 0, AHEAD + 1.4) - 1.4));
      this.root.position.copy(cam.position).addScaledVector(this.dir, d);
      this.root.scale.setScalar(d / AHEAD);
    } else if (above || cam.getWorldDirection(this.dir).y < -0.6) {
      // a steep view from above (the maze): hovering over the wanderer, a little up the screen
      this.dir.subVectors(at, cam.position).setY(0);
      if (this.dir.lengthSq() < 1e-6) this.dir.set(0, 0, -1);
      this.root.position.copy(at).addScaledVector(this.dir.normalize(), 2.2).setY(at.y + 4.2);
      this.root.scale.setScalar(0.62);
    } else {
      // before the wanderer, the way the view looks (from the view through the wanderer), a little
      // over it in the air
      this.dir.subVectors(at, cam.position).setY(0);
      if (this.dir.lengthSq() < 1e-6) this.dir.set(0, 0, -1);
      this.dir.normalize();
      const from = this.right.copy(at).setY(at.y + 1.5);
      const d = Math.max(3.5, Math.min(NEAR, this.clearAhead(from, this.dir, 0.6, NEAR + 1.4) - 1.4));
      this.root.position.copy(at).addScaledVector(this.dir, d).setY(at.y + 2.9);
      this.root.scale.setScalar(Math.max(0.55, d / NEAR));
    }
    // turned to the view (from above, it looks up at it)
    this.root.lookAt(cam.position);
    this.t = 0;
    this.grow = this.think = this.speak = this.flare = 0;
    this.going = -1;
    this.state = "quiet";
    this.cloud = this.build();
    this.root.add(this.cloud.sprite);
    this.scene.add(this.root);
  }

  /** Let go: it draws into a point and is gone. */
  dismiss(): void {
    if (!this.cloud || this.going >= 0) return;
    this.going = 1.8;
  }

  setState(s: PresenceState): void {
    if (s === "speaking" && this.state !== "speaking") this.flare = 1;
    this.state = s;
  }

  /** A sentence begins (or the answer arrives): a flare goes through it. */
  pulse(): void {
    this.flare = 1;
  }

  update(dt: number, reduced: boolean): void {
    const c = this.cloud;
    if (!c) return;
    this.t += reduced ? dt * 0.25 : dt;
    if (this.going >= 0) {
      this.going -= dt;
      if (this.going < 0) {
        c.sprite.removeFromParent();
        (c.sprite.material as THREE.Material).dispose();
        c.sprite.geometry.dispose();
        this.cloud = null;
        this.root.removeFromParent();
        this.going = -1;
        return;
      }
    }
    const e = (k: number) => Math.min(1, dt * k);
    this.grow += ((this.going >= 0 ? 0 : 1) - this.grow) * e(this.going >= 0 ? 3 : 1.1);
    this.think += ((this.state === "thinking" ? 1 : 0) - this.think) * e(1.4);
    this.speak += ((this.state === "speaking" ? 1 : 0) - this.speak) * e(2);
    this.flare = Math.max(0, this.flare - dt * 0.7);
    if (!reduced) this.spin += dt * (0.06 + this.think * 0.7 + this.speak * 0.1);
    const U = this.U;
    U.t.value = this.t;
    U.grow.value = this.grow;
    U.think.value = this.think;
    U.speak.value = this.speak;
    U.flare.value = this.flare * this.flare;
    U.spin.value = this.spin;
  }
}
