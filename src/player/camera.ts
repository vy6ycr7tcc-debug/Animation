/* Third-person camera: glides after the wanderer, eases behind them while they move,
   and never dips under the ground or the water. No shake, ever. */
import * as THREE from "three/webgpu";
import { heightAt, heightCoarse, WATER_Y } from "../world/terrain";

export class FollowCamera {
  yaw = 0;
  pitch = 0.36; // slightly high
  dist = 7;
  /** Free flight while flying: the view may look well up, to climb where you look. */
  freeLook = false;
  private target = new THREE.Vector3();
  private sinceLook = 99;
  private effDist = 7; // shortened when a hillside would block the view
  /** 0 = intro drift over the lake, 1 = following the wanderer. */
  follow = 0;
  private followGoal = 0;
  /** While sitting with an archetype: frame the two of you, the archetype high in the view
      and clear of the choices along the bottom. */
  seatedWith: THREE.Vector3 | null = null;
  /** Diving: the camera follows below the surface, and may look up. */
  underwater = false;
  private seatK = 0;
  /** 0..1 contemplation: the view from the wanderer's own eyes (its body gone), turned slowly
      toward `gaze` (what moves nearby), or straight ahead when there is none. */
  inward = 0;
  gaze: THREE.Vector3 | null = null;
  private gazeAt = new THREE.Vector3();
  private gazeHeld = false;
  /** The gravity point: while a narration shows an animation, its centre. The view composes
      toward it (the wanderer in the foreground, the animation ahead); `frameHold` says how
      firmly (lower while a finger is on the screen, so it never fights the hand). */
  frame: THREE.Vector3 | null = null;
  frameHold = 1;
  /** Walls a place apart sets: the view never stands behind one (it draws in before it). */
  blockers: THREE.Object3D[] = [];
  private blockT = 0;
  private blockAt = Infinity;
  private ray = new THREE.Raycaster();
  private hits: THREE.Intersection[] = [];
  private rayDir = new THREE.Vector3();
  private frameK = 0;
  private frameAt = new THREE.Vector3();
  /** 0..1: a room whose beauty is its breadth (the first density): the gravity point and
      contemplation draw the view back and up to reveal the whole, rather than in toward one thing.
      While it holds, contemplation keeps the view behind the wanderer (no first person). */
  wide = 0;
  private wideK = 0;
  /** The eagle's view (the mind's maze, seated at its centre): the camera rises on a slow crane
      high over this point and looks down on it, circling very slowly. */
  eagle: THREE.Vector3 | null = null;
  /** How high the eagle's view hangs over its point (m). */
  eagleH = 125;
  /** A ceiling for the following view (world y), or null: in the mind's maze the view never rises
      over the walls, so the way ahead stays veiled (the eagle's view at the centre is the one
      earned exception). */
  ceiling: number | null = null;
  /** A steered view may look high into the sky (the maze's sun in contemplation). */
  skyward = false;
  /** Contemplation's eye raised this far above the usual 1.6 m (the mind's maze: just over its walls,
      so its sun is never hidden behind the corridor). */
  eyeLift = 0;
  /** The corridor's way (the mind's maze): while you walk, the view settles behind you along the
      corridor (this yaw) rather than chasing every turn of the stick, quickly and smoothly, so
      the way ahead is always in view and the walls never swing across it. Null: the usual follow. */
  rail: number | null = null;
  /** The furthest the view stands behind (m), or null (the maze: close, inside its corridors). */
  nearDist: number | null = null;
  /** A flat line-of-sight test (the maze's own walls, from its plan): how far from a to b is
      clear, 0..1. The view stands in front of the first wall, easing, never snapping. */
  clearance: ((a: THREE.Vector3, b: THREE.Vector3) => number) | null = null;
  /** The maze's centre (world) while the way runs along a ring: the view then stands on the
      ring's own curve behind you, so the line from it to you stays inside the corridor and no
      wall swings in between (no pulling in and out). Null: a straight line behind. */
  arcCentre: THREE.Vector3 | null = null;
  private arcK = 0;
  private arcAt = new THREE.Vector2();
  /** Where the view stands behind the target along the ring at horizontal distance h (xz). */
  private arcPoint(h: number, fx: number, fz: number): THREE.Vector2 {
    const o = this.arcCentre!;
    const rx = this.target.x - o.x, rz = this.target.z - o.z, r = Math.max(4, Math.hypot(rx, rz));
    const th = Math.atan2(rx, rz), s = fx * Math.cos(th) - fz * Math.sin(th) >= 0 ? 1 : -1;
    const tc = th - (s * h) / r;
    return this.arcAt.set(o.x + Math.sin(tc) * r, o.z + Math.cos(tc) * r);
  }
  private clrT = 0;
  private clrAt = Infinity;
  private clrB = new THREE.Vector3();
  /** The mind's maze: first person, the eye at the sphere's centre (`fpEye` over the ground),
      looking the way you roll, with only a slight sway as it rolls and leans into a turn (never a
      bob). The eagle's view at the centre and contemplation's sun still take over. */
  /** The chase view (the mind's maze, after racing and ball games): the view stands on the ball's
      own path a few metres back, so it is always behind the way it is really going, the ball held
      at the centre of the screen, and, since the ball has just been there, inside the corridor
      with nothing in between (no pulling in and out). The turn toward it is a critically damped
      spring (soft start, no overshoot, frame-rate independent). A look-drag still works; the
      view comes back behind ~1 s after. */
  chase = false;
  chasePitch = 0.36;
  /** The nearest the chase view comes in before a wall (m): never so close the ball fills the view. */
  chaseMin = 2.6;
  /** The rail view (the mind's maze; the owner circled where the ball should sit, low in the
      middle of the screen, the view steady "as if we are looking from that point of view"): the
      camera rides the ball's own trail a little way back at a fixed height, always looking ahead
      down the corridor past the ball, which sits in the lower third. Nothing cranes, swings, zooms
      or answers a look-drag; it only orbits round the ball (never through it) when the way turns. */
  railBack = 4.2;
  /** A fixed overhead view (its yaw), or null: the mind's maze (the owner: every following view was
      "a nightmare"). It never turns; the stick moves the way it is pushed on the screen. */
  overhead: number | null = null;
  /** Playing: high and steep over the walker (the corridors round you read as a plan). */
  overheadH = 15;
  overheadBack = 3.5;
  /** Contemplating (0..1, eased): the view draws back and tilts toward the horizon, 10 m up and
      15.4 m back, looking ~13° down: the sky's upper third, the sun, the volcanoes and the
      monuments over the maze, the walker low in the view (the owner: the horizon view "in
      contemplation mode… that's how you see the beautiful maze"; then "see more of the sky"). */
  overheadTilt = 0;
  tiltH = 10;
  tiltBack = 15.4;
  overheadPitch = 0.22;
  railHeight = 6.2;
  /** Where the rail view looks: this high over the feet, 6 m ahead of the one it follows. */
  railLookY = 0.8;
  /** …and this far ahead of it. */
  railLookAhead = 2.5;
  private trailPt = new THREE.Vector2();
  private trailLen = 0;
  private railYaw = 0;
  private railYawVel = 0;
  private railR = 4.2;
  private railK = 0;
  private railInit = false;
  private railPos = new THREE.Vector3();
  private railLook = new THREE.Vector3();
  private crane = 0;
  private craneWant = 0;
  private prevT = new THREE.Vector3();
  private predA = new THREE.Vector3();
  private predB = new THREE.Vector3();
  private clrDt = 0;
  private trail = new Float32Array(2 * 48);
  private trailN = 0;
  private chaseWant(p: THREE.Vector3, heading: number, back: number): number {
    const t = this.trail;
    // record the path every 0.25 m (newest first)
    if (this.trailN === 0 || Math.hypot(p.x - t[0], p.z - t[1]) > 0.25) {
      if (this.trailN > 0) {
        // turned back on itself: the old path is ahead now, begin it again
        const ox = t[0] - (this.trailN > 1 ? t[2] : t[0]), oz = t[1] - (this.trailN > 1 ? t[3] : t[1]);
        const nx = p.x - t[0], nz = p.z - t[1];
        if (ox * nx + oz * nz < 0) this.trailN = 1;
      }
      t.copyWithin(2, 0, t.length - 2);
      t[0] = p.x;
      t[1] = p.z;
      this.trailN = Math.min(t.length / 2, this.trailN + 1);
    }
    // the point `back` metres back along it
    let acc = Math.hypot(p.x - t[0], p.z - t[1]), px = t[0], pz = t[1];
    for (let i = 1; i < this.trailN && acc < back; i++) {
      const sx = t[i * 2], sz = t[i * 2 + 1], d = Math.hypot(sx - px, sz - pz);
      if (acc + d >= back) {
        const k = (back - acc) / Math.max(1e-4, d);
        px += (sx - px) * k;
        pz += (sz - pz) * k;
        acc = back;
        break;
      }
      acc += d;
      px = sx;
      pz = sz;
    }
    this.trailPt.set(px, pz);
    this.trailLen = acc;
    if (acc < 1) return heading; // too little path yet: behind the way it faces
    return Math.atan2(px - p.x, pz - p.z);
  }
  /** The point `back` metres back along the recorded trail from the ball (xz into `out`), or
      false when the trail is shorter than that. */
  private trailAt(p: THREE.Vector3, back: number, out: THREE.Vector2): boolean {
    const t = this.trail;
    if (this.trailN === 0) return false;
    let acc = Math.hypot(p.x - t[0], p.z - t[1]), px = t[0], pz = t[1];
    if (acc >= back) {
      const k = back / Math.max(1e-4, acc);
      out.set(p.x + (px - p.x) * k, p.z + (pz - p.z) * k);
      return true;
    }
    for (let i = 1; i < this.trailN; i++) {
      const sx = t[i * 2], sz = t[i * 2 + 1], d = Math.hypot(sx - px, sz - pz);
      if (acc + d >= back) {
        const k = (back - acc) / Math.max(1e-4, d);
        out.set(px + (sx - px) * k, pz + (sz - pz) * k);
        return true;
      }
      acc += d;
      px = sx;
      pz = sz;
    }
    return false;
  }
  private trailTmp = new THREE.Vector2();
  private seeA = new THREE.Vector3();
  private seeB = new THREE.Vector3();
  /** How high over the feet the view looks (null: the usual 1.3 m; the maze's ball looks lower). */
  targetLift: number | null = null;
  firstPerson = false;
  fpEye = 0.7;
  private fpK = 0;
  private fpRoll = 0;
  private fpYawLast = 0;
  private upV = new THREE.Vector3(0, 1, 0);
  private fpTmp = new THREE.Vector3();
  private fpTmp2 = new THREE.Vector3();
  private eagleK = 0;
  private eagleAt = new THREE.Vector3();

  constructor(public cam: THREE.PerspectiveCamera) {}

  look(dYaw: number, dPitch: number): void {
    this.yaw += dYaw;
    // under the water you may look up at the surface and the moon beyond it
    this.pitch = THREE.MathUtils.clamp(this.pitch + dPitch, this.underwater ? -1.05 : this.freeLook ? -0.95 : -0.15, 1.15);
    this.sinceLook = 0;
  }
  zoom(f: number): void {
    this.dist = THREE.MathUtils.clamp(this.dist * f, 3.2, 12);
  }
  startFollowing(now = false): void {
    this.followGoal = 1;
    if (now) this.follow = 1; // arriving somewhere new: no long glide from the title view
  }
  snapTo(pos: THREE.Vector3): void {
    this.target.set(pos.x, pos.y + 1.3, pos.z);
  }

  update(dt: number, player: THREE.Vector3, heading: number, moving: boolean, t: number, reduced: boolean, flying = false): void {
    this.sinceLook += dt;
    this.follow += (this.followGoal - this.follow) * Math.min(1, dt * 0.7);
    // back above the water, the view settles to its usual range
    if (!this.underwater && !this.freeLook && this.pitch < -0.15) this.pitch += (-0.15 - this.pitch) * Math.min(1, dt * 2);
    // Ease behind the wanderer while they move, unless the viewer is looking around; in flight
    // sooner and more firmly, so steering with the stick turns the view with you (as in Sky).
    if (this.chase) {
      // the rail view (below) places itself; here only the ball's path is recorded
      if (moving) this.chaseWant(player, heading, this.railBack);
    } else if (this.firstPerson && moving) {
      // first person: the view turns with the way you roll, softly (a little behind the turn)
      let d = heading - this.yaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.yaw += d * Math.min(1, dt * 2.6);
    } else if (this.rail !== null && moving && !flying) {
      // the maze: settle behind along the corridor, soon after a look and firmly (critically damped)
      let d = this.rail - this.yaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      const k = THREE.MathUtils.smoothstep(this.sinceLook, 0.5, 1.2);
      this.yaw += d * Math.min(1, dt * 2.6 * k);
    } else if (moving) {
      let d = heading - this.yaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      const delay = flying ? 0.4 : 1.0;
      const recenterK = THREE.MathUtils.smoothstep(this.sinceLook, delay, delay + 1.5);
      if (recenterK > 0) {
        this.yaw += d * Math.min(1, dt * (flying ? 1.6 : 1.0) * recenterK);
      }
    }
    this.target.lerp(new THREE.Vector3(player.x, player.y + (this.targetLift ?? 1.3), player.z), Math.min(1, dt * 5));

    const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
    // the wide reveal eases in slowly (a camera drawing back on a crane), out a little quicker
    this.wideK += (this.wide - this.wideK) * Math.min(1, dt * (this.wide > this.wideK ? 0.35 : 0.8));
    const w = THREE.MathUtils.smoothstep(this.wideK, 0, 1);
    // the chase view's crane: where a wall would come between, it rises and looks down over the
    // ball instead of coming closer (eased up quickly, down slowly)
    this.crane += ((this.chase ? this.craneWant : 0) - this.crane) * Math.min(1, dt * (this.craneWant > this.crane ? 8 : 1.1));
    const pitch = this.pitch + this.crane + 0.1 * w, dist = Math.min(this.dist, this.nearDist ?? Infinity) * (1 + 1.3 * w);
    const cp = Math.cos(pitch), sp = Math.sin(pitch);
    // Pull in when the ground would come between the camera and the wanderer.
    let clear = dist;
    for (let k = 1; k <= 10; k++) {
      const d = (dist * k) / 10;
      const px = this.target.x - fx * cp * d, pz = this.target.z - fz * cp * d, py = this.target.y + sp * d;
      if (py < Math.max(heightCoarse(px, pz), this.underwater ? -1e9 : WATER_Y) + 0.4) {
        clear = Math.max(1.6, (dist * (k - 1)) / 10);
        break;
      }
    }
    // and when a wall would come between the camera and the wanderer, in front of the wall
    // (cast ten times a second: the walls of a room can be many triangles, and the view eases anyway)
    if (this.blockers.length) {
      this.blockT -= dt;
      if (this.blockT <= 0) {
        this.blockT = 0.1;
        this.rayDir.set(-fx * cp, sp, -fz * cp).normalize();
        this.ray.set(this.target, this.rayDir);
        this.ray.far = dist + 0.5;
        this.hits.length = 0;
        this.ray.intersectObjects(this.blockers, false, this.hits);
        this.blockAt = this.hits.length ? Math.max(this.chase ? this.chaseMin : 1.1, this.hits[0].distance - 0.45) : Infinity;
      }
      clear = Math.min(clear, this.blockAt);
    } else this.blockAt = Infinity;
    if (this.clearance) {
      this.clrT -= dt;
      this.clrDt += dt;
      if (this.clrT <= 0) {
        this.clrT = 1 / 30;
        if (this.arcK > 0.5) {
          const a = this.arcPoint(cp * dist, fx, fz);
          this.clrB.set(a.x, this.target.y, a.y);
        } else this.clrB.set(this.target.x - fx * cp * dist, this.target.y, this.target.z - fz * cp * dist);
        let f = this.clearance(this.target, this.clrB);
        if (this.chase) {
          // predictive (after Haigh-Hutchinson's Real-Time Cameras: a camera that foresees an
          // obstruction moves before it, a reactive one too late): test too where the ball will be
          // in half a second, with the view in the same place relative to it, and heed the worse
          const vx = (this.target.x - this.prevT.x) / Math.max(1e-3, this.clrDt), vz = (this.target.z - this.prevT.z) / Math.max(1e-3, this.clrDt);
          this.prevT.copy(this.target);
          this.clrDt = 0;
          if (vx * vx + vz * vz > 0.04) {
            this.predA.set(this.target.x + vx * 0.5, this.target.y, this.target.z + vz * 0.5);
            this.predB.set(this.clrB.x + vx * 0.5, this.clrB.y, this.clrB.z + vz * 0.5);
            f = Math.min(f, this.clearance(this.predA, this.predB));
          }
          // the horizontal reach that stays clear, and the pitch whose foot fits inside it
          const base = pitch - this.crane;
          const hClear = Math.max(0.5, f * cp * dist - 0.3);
          const need = f >= 1 ? 0 : Math.acos(Math.min(1, hClear / dist)) - base;
          this.craneWant = THREE.MathUtils.clamp(need, 0, Math.max(0, 1.35 - base));
          // only if even the steepest crane can't clear does the view come in (never close)
          this.clrAt = f >= 1 || need <= 1.35 - base ? Infinity : this.chaseMin;
        } else this.clrAt = f >= 1 ? Infinity : Math.max(1.2, f * dist - 0.25);
      }
      clear = Math.min(clear, this.clrAt);
    }
    this.effDist += (clear - this.effDist) * Math.min(1, dt * (clear < this.effDist ? (this.clearance ? 7 : 10) : this.clearance ? 1.4 : 2));
    const ed = this.effDist;
    const followPos = new THREE.Vector3(this.target.x - fx * cp * ed, this.target.y + sp * ed, this.target.z - fz * cp * ed);
    this.arcK += ((this.arcCentre && this.rail !== null && this.sinceLook > 1.2 ? 1 : 0) - this.arcK) * Math.min(1, dt * 1.6);
    if (this.arcK > 0.001 && this.arcCentre) {
      const a = this.arcPoint(cp * ed, fx, fz), k = THREE.MathUtils.smoothstep(this.arcK, 0, 1);
      followPos.x += (a.x - followPos.x) * k;
      followPos.z += (a.y - followPos.z) * k;
    }
    const floor = Math.max(heightAt(followPos.x, followPos.z), this.underwater ? -1e9 : WATER_Y) + 0.35;
    // under the water, stay under it (no bobbing through the surface)
    if (this.underwater) followPos.y = Math.min(followPos.y, WATER_Y - 0.3);
    if (followPos.y < floor) followPos.y = floor;
    if (this.ceiling !== null && followPos.y > this.ceiling) followPos.y = Math.max(floor, this.ceiling);

    // The intro: low over the shallows, drifting slowly, looking out toward the far island.
    const drift = reduced ? 0 : t;
    const introPos = new THREE.Vector3(Math.sin(drift * 0.03) * 3, 2.2, 16 - Math.sin(drift * 0.02) * 3);
    const introLook = new THREE.Vector3(-45, 8, -150); // a little left: the shore's tree stays clear of the title

    const k = THREE.MathUtils.smoothstep(this.follow, 0, 1);
    this.cam.position.copy(introPos).lerp(followPos, k);
    const look = introLook.clone().lerp(this.target, k);
    this.seatK += ((this.seatedWith ? 1 : 0) - this.seatK) * Math.min(1, dt * 1.2);
    if (this.seatK > 0.001) {
      const other = this.seatedWith ?? look;
      // over the shoulder, a little to one side, looking low so both figures sit high in the frame
      const a = this.yaw + 0.5;
      const side = new THREE.Vector3(this.target.x + Math.sin(a) * 3.6, this.target.y + 0.35, this.target.z + Math.cos(a) * 3.6);
      side.y = Math.max(side.y, Math.max(heightAt(side.x, side.z), WATER_Y) + 0.5);
      const low = this.target.clone().lerp(new THREE.Vector3(other.x, other.y + 1.1, other.z), 0.55);
      low.y -= 1.1;
      const s = THREE.MathUtils.smoothstep(this.seatK, 0, 1);
      this.cam.position.lerp(side, s);
      look.lerp(low, s);
    }
    // the gravity point: turn the look from the wanderer toward the animation, keeping both in view
    const fGoal = this.frame ? this.frameHold : 0;
    this.frameK += (fGoal - this.frameK) * Math.min(1, dt * (fGoal > this.frameK ? 0.8 : 3));
    if (this.frame) this.frameAt.copy(this.frame);
    if (this.frameK > 0.001 && this.seatK < 0.5) {
      const cp = this.cam.position, d = look.distanceTo(cp);
      const toT = look.clone().sub(cp).normalize(), toG = this.frameAt.clone().sub(cp).normalize();
      look.copy(cp).addScaledVector(toT.lerp(toG, THREE.MathUtils.smoothstep(this.frameK, 0, 1) * (0.62 + 0.18 * w)).normalize(), d);
    }
    this.fpK += ((this.firstPerson ? 1 : 0) - this.fpK) * Math.min(1, dt * 2.2);
    if (this.fpK > 0.001) {
      const s = THREE.MathUtils.smoothstep(this.fpK, 0, 1);
      const eye = this.fpTmp.set(player.x, player.y + this.fpEye, player.z);
      this.cam.position.lerp(eye, s);
      look.lerp(this.fpTmp2.set(eye.x - Math.sin(this.yaw) * 12, eye.y - 0.35, eye.z - Math.cos(this.yaw) * 12), s);
      // the sway: leaning a few degrees into a turn, and the faintest roll while moving
      let dy = this.yaw - this.fpYawLast;
      dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      const turn = THREE.MathUtils.clamp(-(dy / Math.max(dt, 1e-3)) * 0.025, -0.032, 0.032);
      const sway = reduced ? 0 : Math.sin(t * 1.25) * (moving ? 0.008 : 0.002);
      this.fpRoll += (turn + sway - this.fpRoll) * Math.min(1, dt * 2);
    }
    this.fpYawLast = this.yaw;
    this.railK += ((this.chase ? 1 : 0) - this.railK) * Math.min(1, dt * 3);
    if (this.chase) {
      const bx = player.x, bz = player.z;
      // where the trail says the view belongs, as an angle and a radius about the ball
      let wantYaw = this.railYaw, wantR = this.railBack;
      if (this.trailLen >= 1) {
        // the farthest point back along the ball's own path that the ball can still see: on a
        // straight it is the full distance; round a corner the view stays on the path, a little nearer,
        // rather than standing behind the corner's stone
        let px = this.trailPt.x, pz = this.trailPt.y;
        if (this.clearance) {
          this.seeA.set(bx, player.y + 1.3, bz);
          for (const back of [this.railBack, 3.6, 3.0, 2.4, 2.0]) {
            if (!this.trailAt(player, back, this.trailTmp)) continue;
            px = this.trailTmp.x;
            pz = this.trailTmp.y;
            this.seeB.set(px, player.y + 1.3, pz);
            if (this.clearance(this.seeA, this.seeB) >= 1) break;
          }
        }
        wantYaw = Math.atan2(px - bx, pz - bz);
        wantR = THREE.MathUtils.clamp(Math.hypot(px - bx, pz - bz), 1.6, this.railBack);
      } else if (moving) wantYaw = heading;
      if (!this.railInit) (this.railYaw = this.yaw), (this.railInit = true), (this.railYawVel = 0);
      // a critically damped turn about the ball: soft start, no overshoot, never through the ball
      const d = Math.atan2(Math.sin(wantYaw - this.railYaw), Math.cos(wantYaw - this.railYaw));
      const w = 4, hdt = Math.min(dt, 0.05);
      this.railYawVel += (w * w * d - 2 * w * this.railYawVel) * hdt;
      this.railYaw += this.railYawVel * hdt;
      this.railR += (wantR - this.railR) * Math.min(1, dt * (wantR < this.railR ? 3 : 1.2));
      // where the view actually stands is behind stone (it lags a turn at a doorway): step onto the
      // visible point on the ball's path at once (a small step beats a screen of wall)
      if (this.clearance && this.trailLen >= 1) {
        this.seeB.set(bx + Math.sin(this.railYaw) * this.railR, player.y + 1.3, bz + Math.cos(this.railYaw) * this.railR);
        if (this.clearance(this.seeA, this.seeB) < 1) {
          this.railYaw = wantYaw;
          this.railYawVel = 0;
          this.railR = wantR;
        }
      }
      this.yaw = this.railYaw; // the stick goes where the view looks
      this.railPos.set(bx + Math.sin(this.railYaw) * this.railR, player.y + this.railHeight, bz + Math.cos(this.railYaw) * this.railR);
      // above the walls (the owner: "most of the time all you see is walls so you keep hitting
      // them"): the view rides high behind the walker, 6.2 m up (the walls stand 4.6 m) and 4.2 m back,
      // looking down ~40° to a point just ahead of it, so the corridor round you and where it turns
      // are in sight; the Veil keeps the far maze dark, so its mystery holds
      this.railLook.set(bx - Math.sin(this.railYaw) * this.railLookAhead, player.y + this.railLookY, bz - Math.cos(this.railYaw) * this.railLookAhead);
      if (this.overhead !== null) {
        // high and steep, always from the same side: up on the screen is always the same way
        const oy = this.overhead;
        this.yaw = oy;
        const k = THREE.MathUtils.smoothstep(this.overheadTilt, 0, 1);
        const back = THREE.MathUtils.lerp(this.overheadBack, this.tiltBack, k), h = THREE.MathUtils.lerp(this.overheadH, this.tiltH, k);
        this.railPos.set(bx + Math.sin(oy) * back, player.y + h, bz + Math.cos(oy) * back);
        // steep: at a point just ahead of the walker; tilted: along a fixed pitch, toward the horizon
        const cp = Math.cos(this.overheadPitch), sp = Math.sin(this.overheadPitch);
        const tx = this.railPos.x - Math.sin(oy) * cp * 10, ty = this.railPos.y - sp * 10, tz = this.railPos.z - Math.cos(oy) * cp * 10;
        this.railLook.set(
          THREE.MathUtils.lerp(bx - Math.sin(oy) * 1.5, tx, k),
          THREE.MathUtils.lerp(player.y + 0.6, ty, k),
          THREE.MathUtils.lerp(bz - Math.cos(oy) * 1.5, tz, k),
        );
      }
      const s = THREE.MathUtils.smoothstep(this.railK, 0, 1);
      this.cam.position.lerp(this.railPos, s);
      look.lerp(this.railLook, s);
    } else this.railInit = false;
    if (this.inward > 0.001 && this.overhead === null) {
      const eye = new THREE.Vector3(player.x, player.y + 1.6 + this.eyeLift, player.z);
      const ahead = eye.clone().add(new THREE.Vector3(-Math.sin(this.yaw) * 20, 0.8, -Math.cos(this.yaw) * 20));
      if (!this.gazeHeld) (this.gazeAt.copy(look), (this.gazeHeld = true));
      // the gaze glides from one thing to the next, never snaps
      this.gazeAt.lerp(this.gaze ?? ahead, Math.min(1, dt * 0.4));
      const s = THREE.MathUtils.smoothstep(this.inward, 0, 1);
      // wide: the view stays drawn back (the whole is the thing to see), only the gaze turns
      this.cam.position.lerp(eye, s * (1 - w));
      look.lerp(this.gazeAt, s);
    } else this.gazeHeld = false;
    // a view steered for you (the gravity point, contemplation's gaze) keeps to a natural pitch:
    // never craning up a pole or into the sky, never staring at the ground (the owner: "awkward
    // angle focus"); the hand's own look is never limited
    const steer = Math.max(this.seatK < 0.5 ? THREE.MathUtils.smoothstep(this.frameK, 0, 1) : 0, this.inward > 0.001 && this.overhead === null ? THREE.MathUtils.smoothstep(this.inward, 0, 1) : 0);
    if (steer > 0.001) {
      const cp = this.cam.position, vx = look.x - cp.x, vz = look.z - cp.z, h = Math.hypot(vx, vz);
      if (h > 0.05) {
        const el = Math.atan2(look.y - cp.y, h), lim = THREE.MathUtils.clamp(el, -0.3, this.skyward ? 1.2 : 0.22);
        if (lim !== el) look.y += (cp.y + Math.tan(lim) * h - look.y) * steer;
      }
    }
    // the eagle: up on a long slow crane over the point, looking down on it, turning very slowly
    this.eagleK += ((this.eagle ? 1 : 0) - this.eagleK) * Math.min(1, dt * (this.eagle ? 0.3 : 0.9));
    if (this.eagle) this.eagleAt.copy(this.eagle);
    if (this.eagleK > 0.001) {
      const s = THREE.MathUtils.smoothstep(this.eagleK, 0, 1);
      const a = this.yaw + (reduced ? 0 : t * 0.012);
      const high = new THREE.Vector3(this.eagleAt.x + Math.sin(a) * 34, this.eagleAt.y + this.eagleH, this.eagleAt.z + Math.cos(a) * 34);
      this.cam.position.lerp(high, s);
      look.lerp(this.eagleAt, s);
    }
    // the first person's lean about the line of sight (none once the eagle's view rises)
    const roll = this.fpRoll * THREE.MathUtils.smoothstep(this.fpK, 0, 1) * (1 - THREE.MathUtils.smoothstep(this.eagleK, 0, 1));
    this.upV.set(Math.cos(this.yaw) * Math.sin(roll), Math.cos(roll), -Math.sin(this.yaw) * Math.sin(roll));
    this.cam.up.copy(this.upV);
    this.cam.lookAt(look);
  }
}
