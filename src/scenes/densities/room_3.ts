/* The third density: the great choice. One room, split down its length by a seam of white light
   that runs from the threshold to a neutral white door at the far end, the axis the rest of
   creation turns on. The seam takes a tint from whichever side you look toward.

   Stage left, service to others: a circle of people of glass light, each its own warm colour,
   heart joined to heart by threads of gold with pulses passing round; warm motes rising from the
   ring; beside it, vignettes of relating on a loop: one who has fallen is lifted (a light blooms
   between the two as it rises), and two who stand face to face let their lights meet and merge.

   Stage right, service to self: nothing monstrous. A tall figure of cold, clear light stands on a
   dais of polished black stone among four slender obelisks whose edges are drawn in thin white
   light, three thin rings turning above it: powerful, coherent, magnificent. Round the dais,
   kneeling figures; from each heart a thread of dark red rises to it, and the light travels one
   way, up and inward, and pale motes spiral in from the air toward it. Only the direction of the
   light is chilling.

   Over it all, a veil of haze in the sky that thins when the narration says the veil will lift,
   and a vast ring of lights far above (the stadium of beings of light) that rises when the
   narration speaks of them and leaps at "leap to their feet".

   The owner's direction (2026-09-30) replaces the earlier room. The recording is the draft
   `audio/densities/density_3.mp3`; beats are timed from its script's paragraphs. */
import * as THREE from "three/webgpu";
import { LessonScene } from "../lessonKit";
import type { LessonCtx, LessonOpts, SceneModule } from "../lessonKit";
import { T, hash2, vnoise } from "../../gpu/tsl";
import { stoneBlock } from "../../world/stoneworks";
import { GlassFolk, type FolkSpec } from "../glassFolk";
import { applyAir, damp, fbmN, keepAlpha, pointCloud, roomClock, roomPos, scannedGround, seeded, skyDome, strands, touch, type Air } from "./roomKit";

const { abs, exp, float, floor, fract, length, max, mix, pow, sin, smoothstep, step, uniform, uv, vec2, vec3, vec4 } = T;

/** Where things stand (room frame: you arrive at z 3.4 facing −z). */
const STO = new THREE.Vector3(-5.2, 0, -12); // the circle
const STS = new THREE.Vector3(5.6, 0, -13.5); // the dais
const DAIS_TOP = 1.8;
const PORTAL = new THREE.Vector3(0, 0, -32);
const SEAM_Z = -4; // the standing seam at the threshold
/** The sitting clip sits on a chair: lowered this far, the figure kneels and sits on the ground. */
const SIT_Y = -0.42;

export function createRoom3Scene(
  scene: THREE.Scene,
  narration: LessonCtx["narration"],
  whisper: (t: string, ms?: number) => void,
): SceneModule {
  const seat = new THREE.Vector3(0, 0, 3.4);
  const tickers: Array<(dt: number) => void> = [];
  const ours: Array<{ dispose(): void }> = [];
  const clock = roomClock();
  const t = clock.u;

  const uSto = uniform(0.35); // the left stage's light
  const uSts = uniform(0.35); // the right stage's light
  const uGold = uniform(0.5); // the threads of gold
  const uRed = uniform(0.5); // the red threads
  const uVeil = uniform(1); // the haze over the sky
  const uCrowd = uniform(0); // the stadium of light
  const uCheer = uniform(0); // …leaping to their feet
  const uPortal = uniform(0.45);
  const uSeam = uniform(0.7);
  const uLook = uniform(0); // −1 looking left (service to others) … +1 right (service to self)
  const uLift = uniform(0); // the fallen one's light as it is lifted
  const uMerge = uniform(0); // two lights meeting
  const goal = { sto: 0.35, sts: 0.35, gold: 0.5, red: 0.5, veil: 1, crowd: 0, portal: 0.45, seam: 0.7 };
  let time = 0, cheerAt = -1;
  let loaded: Promise<void> = Promise.resolve();
  const air: Air = {
    color: new THREE.Color(0.05, 0.045, 0.075),
    glow: new THREE.Color(0.22, 0.16, 0.2),
    glowDir: new THREE.Vector3(0, 0.1, -1),
    density: 0.006,
    shadow: new THREE.Color(0.012, 0.01, 0.03),
    sat: 1.05,
    contrast: 1.06,
  };

  const build = (ctx: LessonCtx) => {
    const g = ctx.group;
    const R = seeded(3303);

    /* ---------------- the sky: warm to the left, cold to the right, a veil of haze ---------------- */
    {
      const sky = skyDome(420, new THREE.Color(0.07, 0.06, 0.1), new THREE.Color(0.012, 0.014, 0.04), {
        extra: (d, c) => {
          const left = pow(max(d.x.negate(), 0), 2).mul(smoothstep(0.45, -0.02, d.y));
          const right = pow(max(d.x, 0), 2).mul(smoothstep(0.45, -0.02, d.y));
          const warm = vec3(0.34, 0.2, 0.08).mul(left).mul(float(0.4).add(uSto.mul(0.6)));
          const cold = vec3(0.24, 0.04, 0.09).mul(right).mul(float(0.4).add(uSts.mul(0.6)));
          const sc = floor(d.mul(380));
          const star = step(0.9962, hash2(sc.xy.add(sc.z.mul(5.3)))).mul(smoothstep(0.05, 0.4, d.y)).mul(sin(t.mul(0.7).add(hash2(sc.xz).mul(40))).mul(0.3).add(0.7));
          // the veil: a slow haze drawn over the stars; it thins when the veil lifts
          const haze = fbmN(vec2(d.x.mul(2.2).add(t.mul(0.006)), d.z.mul(2.2)).add(d.y.mul(1.5)));
          const veil = smoothstep(0.3, 0.8, haze).mul(smoothstep(0.02, 0.3, d.y)).mul(uVeil);
          const hazeCol = vec3(0.07, 0.065, 0.09);
          return c.add(warm).add(cold).add(vec3(0.95, 0.92, 1).mul(star).mul(float(1).sub(veil.mul(0.85))).mul(float(1.3).sub(uVeil.mul(0.5)))).add(hazeCol.mul(veil));
        },
      });
      g.add(sky.mesh);
      ours.push(sky);
    }

    /* ---------------- the floor: dark scanned stone, warm to the left, cold to the right ---------------- */
    {
      const geo = new THREE.PlaneGeometry(220, 220, 40, 40);
      geo.rotateX(-Math.PI / 2);
      const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.82, metalness: 0 });
      const scan = scannedGround("rock", 3, { hue: 0.25, relief: 0.6, bright: 0.9 });
      const P = roomPos;
      const side = smoothstep(-6, 6, P.x); // 0 left … 1 right
      m.colorNode = mix(vec3(0.045, 0.036, 0.03), vec3(0.028, 0.028, 0.036), side).mul(scan.color);
      m.normalNode = scan.normal;
      // the seam along the floor: a hairline of white, softly haloed, tinted by where you look
      const seamTint = mix(mix(vec3(1, 1, 1), vec3(1, 0.72, 0.35), max(uLook.negate(), 0)), vec3(0.85, 0.35, 0.45), max(uLook, 0));
      const along = smoothstep(8, 3, P.z).mul(smoothstep(-33, -30, P.z));
      const line = exp(P.x.mul(P.x).mul(-900)).add(exp(P.x.mul(P.x).mul(-8)).mul(0.08));
      // warm pools under each ring of the left stage; a cold precise ring round the dais
      const dSto = length(P.xz.sub(vec2(STO.x, STO.z)));
      const pool = exp(dSto.mul(dSto).mul(-0.05)).mul(0.22).mul(uSto);
      const dSts = length(P.xz.sub(vec2(STS.x, STS.z)));
      const ring = smoothstep(0.05, 0.0, abs(dSts.sub(4.8))).add(smoothstep(0.03, 0.0, abs(dSts.sub(5.3))).mul(0.6)).mul(0.25).mul(uSts);
      m.emissiveNode = seamTint.mul(line).mul(along).mul(uSeam).mul(0.9)
        .add(vec3(1, 0.62, 0.25).mul(pool))
        .add(vec3(0.75, 0.8, 1).mul(ring));
      const mesh = new THREE.Mesh(geo, m);
      mesh.receiveShadow = true;
      g.add(mesh);
      ours.push(geo, m);
    }

    /* ---------------- the seam standing at the threshold ---------------- */
    {
      const geo = new THREE.PlaneGeometry(0.9, 18);
      geo.translate(0, 9, 0);
      const m = keepAlpha(new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
      const U = uv();
      const x = U.x.sub(0.5).mul(2);
      const core = exp(x.mul(x).mul(-900)).add(exp(x.mul(x).mul(-14)).mul(0.06));
      const fade = smoothstep(0.0, 0.03, U.y).mul(smoothstep(0.7, 0.2, U.y));
      const shimmer = sin(U.y.mul(40).sub(t.mul(1.1))).mul(0.12).add(0.88);
      const tint = mix(mix(vec3(1, 1, 1), vec3(1, 0.7, 0.32), max(uLook.negate(), 0)), vec3(0.9, 0.3, 0.42), max(uLook, 0));
      m.colorNode = vec4(tint.mul(core).mul(fade).mul(shimmer).mul(uSeam).mul(0.5), 1);
      const mesh = new THREE.Mesh(geo, m);
      mesh.position.set(0, 0, SEAM_Z);
      mesh.frustumCulled = false;
      // where you look decides its tint: the camera's heading across the room
      const fwd = new THREE.Vector3();
      mesh.onBeforeRender = (_r, _s, cam) => {
        cam.getWorldDirection(fwd);
        uLook.value = THREE.MathUtils.clamp(fwd.x * 1.6, -1, 1);
      };
      g.add(mesh);
      ours.push(geo, m);
    }

    /* ---------------- the way on: a neutral white door, centred on the seam ---------------- */
    {
      const door = new THREE.Group();
      door.position.copy(PORTAL);
      g.add(door);
      const curve = new THREE.EllipseCurve(0, 0, 2.2, 5.4, 0, Math.PI, false, 0);
      const pts = curve.getPoints(48).map((p) => new THREE.Vector3(p.x, p.y, 0));
      const tg = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 64, 0.09, 6, false);
      const tm = new THREE.MeshBasicNodeMaterial({ fog: false });
      tm.colorNode = vec3(1, 0.98, 0.95).mul(float(0.5).add(uPortal.mul(0.9)));
      door.add(new THREE.Mesh(tg, tm));
      const pg = new THREE.PlaneGeometry(4.4, 5.4);
      pg.translate(0, 2.7, -0.05);
      const pm = keepAlpha(new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide }));
      const U = uv();
      const q = U.sub(vec2(0.5, 0)).mul(vec2(2, 1));
      const inside = smoothstep(1.0, 0.85, length(q));
      pm.colorNode = vec4(vec3(1, 0.98, 0.95).mul(inside).mul(sin(t.mul(0.4)).mul(0.06).add(0.94)).mul(uPortal).mul(0.6), 1);
      door.add(new THREE.Mesh(pg, pm));
      ours.push(tg, tm, pg, pm);
    }

    /* ---------------- the stadium: a vast ring of lights far above, tier on tier ---------------- */
    {
      const n = 4200;
      const s = pointCloud(n, 0.9);
      for (let i = 0; i < n; i++) {
        const tier = Math.floor(R() * 7);
        const a = R() * Math.PI * 2, r = 150 + tier * 9 + R() * 3;
        s.pos.set([Math.sin(a) * r, 26 + tier * 7 + R() * 2, -12 - Math.cos(a) * r], i * 3);
        s.k.set([R(), R(), R(), R()], i * 4);
      }
      touch(s.cloud);
      const K = s.cloud.nodes.aK;
      // at the cheer each light leaps, on its own moment
      const leap = exp(pow(uCheer.sub(K.x.mul(1.4)), 2).mul(-6)).mul(2.2);
      s.material.positionNode = s.cloud.nodes.position.add(vec3(0, leap, 0));
      const hue = mix(vec3(1, 0.85, 0.6), vec3(0.85, 0.9, 1), K.y);
      const tw = sin(t.mul(float(1).add(K.z.mul(2))).add(K.w.mul(50))).mul(0.3).add(0.7);
      s.material.colorNode = vec4(hue.mul(s.round).mul(tw).mul(uCrowd).mul(float(0.55).add(leap.mul(0.35))), 1);
      g.add(s.cloud.sprite);
      ours.push(s.material);
    }

    /* ---------------- stage left: the circle, the threads of gold, the vignettes ---------------- */
    const warm = (h: number, l = 0.7) => new THREE.Color().setHSL(h, 0.6, l);
    const circle: FolkSpec[] = [];
    const CN = 7, CR = 2.7;
    for (let i = 0; i < CN; i++) {
      const a = (i / CN) * Math.PI * 2 + 0.3;
      const x = STO.x + Math.sin(a) * CR, z = STO.z + Math.cos(a) * CR;
      circle.push({ x, z, face: Math.atan2(STO.x - x, STO.z - z), act: i % 3 === 1 ? "reach" : "idle", tint: warm(0.06 + ((i * 0.037) % 0.1)) });
    }
    // the fallen one and the one who lifts it; two who let their lights meet
    const FALL = new THREE.Vector3(-2.6, 0, -6.6), HELP = new THREE.Vector3(-3.7, 0, -7.3);
    const MA = new THREE.Vector3(-10.6, 0, -8.4), MB = new THREE.Vector3(-9.3, 0, -7.7);
    const vign: FolkSpec[] = [
      { x: FALL.x, y: SIT_Y, z: FALL.z, face: Math.atan2(HELP.x - FALL.x, HELP.z - FALL.z), act: "sit", tint: warm(0.58, 0.72) },
      { x: HELP.x, z: HELP.z, face: Math.atan2(FALL.x - HELP.x, FALL.z - HELP.z), act: "reach", tint: warm(0.1) },
      { x: MA.x, z: MA.z, face: Math.atan2(MB.x - MA.x, MB.z - MA.z), act: "idle", tint: warm(0.95, 0.74) },
      { x: MB.x, z: MB.z, face: Math.atan2(MA.x - MB.x, MA.z - MB.z), act: "idle", tint: warm(0.13) },
    ];
    const left = new GlassFolk([...circle, ...vign], 31);
    g.add(left.group);
    ours.push(left);
    const hearts = circle.map((c) => new THREE.Vector3(c.x, 1.25, c.z));
    const goldPairs: { a: THREE.Vector3; b: THREE.Vector3; lift: number }[] = [];
    for (let a = 0; a < CN; a++) for (let b = a + 1; b < CN; b++) goldPairs.push({ a: hearts[a], b: hearts[b], lift: 0.2 });
    const fallHeart = new THREE.Vector3(FALL.x, 0.85 + SIT_Y, FALL.z), helpHeart = new THREE.Vector3(HELP.x, 1.25, HELP.z);
    goldPairs.push({ a: helpHeart, b: fallHeart, lift: 0.15 });
    const gold = strands(goldPairs, (U, K) => {
      // warm gold passing from heart to heart, both ways round
      const p = pow(fract(U.sub(t.mul(0.14)).add(K.mul(5.3))), 12).mul(1.6).add(pow(fract(U.negate().sub(t.mul(0.1)).add(K.mul(2.9))), 16));
      const ends = smoothstep(0, 0.08, U).mul(smoothstep(1, 0.92, U));
      return vec3(1, 0.58, 0.2).mul(float(0.12).add(p)).mul(ends).mul(uGold).mul(0.6);
    }, 1.0);
    g.add(gold.mesh);
    ours.push(gold);
    // warm motes rising from the circle
    {
      const n = 360;
      const s = pointCloud(n, 0.07);
      for (let i = 0; i < n; i++) {
        const a = R() * Math.PI * 2, r = Math.sqrt(R()) * 4.5;
        s.pos.set([STO.x + Math.sin(a) * r, 0, STO.z + Math.cos(a) * r], i * 3);
        s.k.set([R(), R(), R(), R()], i * 4);
      }
      touch(s.cloud);
      const K = s.cloud.nodes.aK;
      const life = fract(K.x.add(t.mul(float(0.03).add(K.y.mul(0.03)))));
      s.material.positionNode = s.cloud.nodes.position.add(vec3(sin(t.mul(0.3).add(K.z.mul(20))).mul(0.4), life.mul(7), sin(t.mul(0.25).add(K.w.mul(20))).mul(0.4)));
      s.material.colorNode = vec4(vec3(1, 0.7, 0.32).mul(s.round).mul(smoothstep(0, 0.1, life).mul(smoothstep(1, 0.6, life))).mul(uSto).mul(0.7), 1);
      g.add(s.cloud.sprite);
      ours.push(s.material);
    }
    // the lights of the vignettes: one blooms between the lifted and the lifter; two meet and merge
    {
      const s = pointCloud(3, 1.4);
      s.k.set([0, 0, 0, 0, 1, 0, 0, 0, 2, 0, 0, 0]);
      touch(s.cloud);
      const K = s.cloud.nodes.aK;
      const lift = vec3((FALL.x + HELP.x) / 2, 1.0, (FALL.z + HELP.z) / 2).add(vec3(0, uLift.mul(0.5), 0));
      const a = vec3(MA.x, 1.25, MA.z), b = vec3(MB.x, 1.25, MB.z), mid = a.add(b).mul(0.5).add(vec3(0, 0.25, 0));
      const pa = mix(a, mid, uMerge), pb = mix(b, mid, uMerge);
      const isLift = step(K.x, 0.5), isA = step(0.5, K.x).mul(step(K.x, 1.5));
      s.material.positionNode = mix(mix(pb, pa, isA), lift, isLift);
      const bright = mix(float(0.35).add(uMerge.mul(0.45)), uLift, isLift);
      s.material.colorNode = vec4(vec3(1, 0.78, 0.45).mul(s.round).mul(bright).mul(uSto).mul(0.9), 1);
      g.add(s.cloud.sprite);
      ours.push(s.material);
    }
    const warmLight = new THREE.PointLight(0xffa850, 260, 26, 2);
    warmLight.position.set(STO.x, 3.2, STO.z);
    g.add(warmLight);

    /* ---------------- stage right: the dais, the obelisks, the one who draws the light ---------------- */
    {
      // polished black stone, its edges drawn in thin cold light
      const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.22, metalness: 0.1 });
      const U = uv();
      const edge = max(smoothstep(0.035, 0.0, U.x).add(smoothstep(0.965, 1.0, U.x)), smoothstep(0.02, 0.0, U.y).add(smoothstep(0.98, 1.0, U.y)));
      const grain = vnoise(roomPos.xz.mul(1.3).add(roomPos.y.mul(0.7))).mul(0.02);
      m.colorNode = vec3(0.018, 0.018, 0.024).add(grain);
      const rise = pow(fract(roomPos.y.mul(0.08).sub(t.mul(0.05))), 6); // light climbing the edges
      m.emissiveNode = vec3(0.8, 0.85, 1).mul(edge).mul(float(0.2).add(rise.mul(0.9))).mul(uSts);
      const parts: THREE.BufferGeometry[] = [];
      const steps: [number, number][] = [[4.6, 0], [3.5, 0.6], [2.4, 1.2]];
      steps.forEach(([w, y], i) => {
        const b = stoneBlock(w, 0.6, w, 30 + i);
        b.translate(0, y + 0.3, 0);
        parts.push(b);
      });
      const oblPos: [number, number][] = [[-0.6, -4.6], [3.6, -3.8], [6.2, -0.6], [-2.6, -5.8]];
      for (const [ox, oz] of oblPos) {
        const h = 8.5 - Math.abs(ox) * 0.3;
        const o = stoneBlock(0.8, h, 0.8, 50 + ox);
        const p = o.attributes.position as THREE.BufferAttribute;
        for (let i = 0; i < p.count; i++) {
          const y = p.getY(i) + h / 2;
          const k = 1 - (y / h) * 0.45; // tapering, as a needle of stone
          p.setXYZ(i, p.getX(i) * k, y, p.getZ(i) * k);
        }
        o.computeVertexNormals();
        o.translate(ox, 0, oz);
        parts.push(o);
      }
      for (const geo of parts) {
        const mesh = new THREE.Mesh(geo, m);
        mesh.position.copy(STS);
        mesh.castShadow = mesh.receiveShadow = true;
        g.add(mesh);
        ours.push(geo);
      }
      ours.push(m);
    }
    // three thin rings turning above it
    const crown: THREE.Mesh[] = [];
    for (let i = 0; i < 3; i++) {
      const rg = new THREE.TorusGeometry(1.2 + i * 0.55, 0.018, 6, 96);
      const rm = keepAlpha(new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending }));
      const a = uv().x.mul(Math.PI * 2);
      rm.colorNode = vec4(mix(vec3(0.85, 0.88, 1), vec3(0.9, 0.3, 0.4), i / 2).mul(sin(a.mul(2).sub(t.mul(0.5 + i * 0.2))).mul(0.3).add(0.7)).mul(uSts).mul(0.5), 1);
      const ring = new THREE.Mesh(rg, rm);
      ring.position.set(STS.x, DAIS_TOP + 3.1 + i * 0.25, STS.z);
      ring.rotation.set(Math.PI / 2 + (i - 1) * 0.35, 0, i);
      g.add(ring);
      crown.push(ring);
      ours.push(rg, rm);
    }
    const elevated: FolkSpec = { x: STS.x, y: DAIS_TOP, z: STS.z, face: -0.45, act: "reach", tint: new THREE.Color(0.82, 0.86, 1), scale: 1.3, glow: { inner: 0.34, edge: 0.95, body: 0.42 } };
    const kneel: FolkSpec[] = [];
    const KN = 6;
    for (let i = 0; i < KN; i++) {
      const a = -Math.PI / 2 - 1.1 + (i / (KN - 1)) * 2.2; // an arc on the side facing the seam
      const x = STS.x + Math.cos(a) * 3.6, z = STS.z - Math.sin(a) * 3.6;
      kneel.push({ x, z, face: Math.atan2(STS.x - x, STS.z - z), y: SIT_Y, act: "sit", tint: new THREE.Color(0.55, 0.52, 0.62), glow: { inner: 0.1, edge: 0.4, body: 0.2 } });
    }
    const right = new GlassFolk([elevated, ...kneel], 37);
    g.add(right.group);
    ours.push(right);
    const top = new THREE.Vector3(STS.x, DAIS_TOP + 1.45, STS.z);
    const redPairs = kneel.map((k) => ({ a: new THREE.Vector3(k.x, 0.85 + SIT_Y, k.z), b: top, lift: 0.25 }));
    const red = strands(redPairs, (U, K) => {
      // the light goes one way only: from the kneeling hearts up into the one above
      const p = pow(fract(U.sub(t.mul(0.2)).add(K.mul(3.7))), 10).mul(1.5);
      const ends = smoothstep(0, 0.06, U).mul(smoothstep(1, 0.9, U));
      return mix(vec3(0.5, 0.03, 0.06), vec3(0.95, 0.25, 0.3), p.min(1)).mul(float(0.25).add(p)).mul(ends).mul(uRed).mul(0.7);
    }, 1.2);
    g.add(red.mesh);
    ours.push(red);
    // pale motes drawn in from the air, spiralling toward it
    {
      const n = 420;
      const s = pointCloud(n, 0.06);
      for (let i = 0; i < n; i++) s.k.set([R(), R(), R(), R()], i * 4);
      touch(s.cloud);
      const K = s.cloud.nodes.aK;
      const f = fract(K.x.add(t.mul(0.035)));
      const r = float(9).mul(float(1).sub(f)).add(0.2);
      const a = K.y.mul(Math.PI * 2).add(f.mul(5));
      const y = mix(K.z.mul(6).add(0.3), float(DAIS_TOP + 1.45), pow(f, 2));
      s.material.positionNode = vec3(float(STS.x).add(T.cos(a).mul(r)), y, float(STS.z).add(sin(a).mul(r)));
      s.material.colorNode = vec4(vec3(0.8, 0.85, 1).mul(s.round).mul(smoothstep(0, 0.2, f).mul(smoothstep(1, 0.85, f))).mul(uSts).mul(0.6), 1);
      g.add(s.cloud.sprite);
      ours.push(s.material);
    }
    const coldLight = new THREE.PointLight(0xc8d4ff, 320, 28, 2);
    coldLight.position.set(STS.x - 1.5, DAIS_TOP + 4.5, STS.z + 1);
    g.add(coldLight);

    loaded = Promise.all([left.loaded, right.loaded]).then(() => undefined);

    // the vignettes' loops
    const LIFT = 26, MERGE = 15;
    let fallen = true;
    tickers.push((dt: number) => {
      const d = Math.min(0.05, Math.max(0, dt));
      time += d;
      clock.tick(d);
      applyAir(air);
      uSto.value = damp(uSto.value, goal.sto, 0.2, d);
      uSts.value = damp(uSts.value, goal.sts, 0.2, d);
      uGold.value = damp(uGold.value, goal.gold, 0.2, d);
      uRed.value = damp(uRed.value, goal.red, 0.2, d);
      uVeil.value = damp(uVeil.value, goal.veil, 0.08, d);
      uCrowd.value = damp(uCrowd.value, goal.crowd, 0.12, d);
      uPortal.value = damp(uPortal.value, goal.portal, 0.15, d);
      uSeam.value = damp(uSeam.value, goal.seam, 0.2, d);
      uCheer.value = cheerAt < 0 ? 0 : time - cheerAt;
      warmLight.intensity = 90 + 260 * uSto.value;
      coldLight.intensity = 110 + 300 * uSts.value;
      for (let i = 0; i < crown.length; i++) crown[i].rotation.z += d * (0.06 + i * 0.03) * (i % 2 ? -1 : 1);
      // lifting the fallen: sitting, reached for; it rises as a light blooms; later it sits again
      const lt = time % LIFT;
      const nowFallen = lt < 10 || lt > 22;
      const fb = left.bodies[CN], hb = left.bodies[CN + 1];
      if (fb && nowFallen !== fallen) {
        fallen = nowFallen;
        fb.act(fallen ? "sit" : "idle", 0.6);
        hb?.act(fallen ? "reach" : "idle", 0.6);
      }
      uLift.value = damp(uLift.value, lt > 8.5 && lt < 17 ? 1 : 0.1, 0.8, d);
      fallHeart.y = damp(fallHeart.y, fallen ? 0.85 + SIT_Y : 1.25, 1.2, d);
      if (fb) fb.spec.y = damp(fb.spec.y ?? 0, fallen ? SIT_Y : 0, 1.2, d);
      // two lights meeting: drawn together, one, then each its own again
      const mt = time % MERGE;
      uMerge.value = mt < 4 ? mt / 4 * 0.2 : mt < 8 ? 0.2 + ((mt - 4) / 4) * 0.8 : mt < 11 ? 1 : 1 - (mt - 11) / 4;
      // everyone breathes
      for (const b of [...left.bodies, ...right.bodies]) b.root.position.y = (b.spec.y ?? 0) + Math.sin(time * 0.55 + b.ph) * 0.04;
      left.update(d);
      right.update(d);
      gold.write();
    });
  };

  const opts: LessonOpts = {
    id: "density_3",
    trackId: "audio/densities/density_3.mp3",
    seatPos: seat.clone(),
    seatHeading: 0,
    build,
    authoredSecs: 300, // beats written against the script's length; they follow the recording
    beats: [
      // "you must understand the veil… a veil of forgetting was drawn": the haze gathers
      { t: 29, apply: () => Object.assign(goal, { veil: 1.3, sto: 0.25, sts: 0.25 }) },
      // "The choice is this. Will you serve others, or… only yourself": both stages wake
      { t: 88, apply: () => Object.assign(goal, { sto: 1, sts: 1, gold: 0.9, red: 0.8, veil: 1.1 }) },
      // "The path of service to others is the path of the open hand"
      { t: 148, apply: () => Object.assign(goal, { gold: 1.4 }) },
      // "The path of service to self is the path of the closed fist"
      { t: 158, apply: () => Object.assign(goal, { red: 1.3 }) },
      // "a stadium vaster than you can conceive, filled with beings of light"
      { t: 227, apply: () => Object.assign(goal, { crowd: 1 }) },
      // "they leap to their feet and cheer"
      { t: 236, apply: () => ((cheerAt = time), (goal.crowd = 1.3)) },
      // "The veil will lift one day"
      { t: 273, apply: () => Object.assign(goal, { veil: 0, red: 0.9 }) },
      // "the choices you made in the dark will shine like stars": the seam and the door brighten
      { t: 286, apply: () => Object.assign(goal, { seam: 1.2, portal: 1.2, gold: 1.5 }) },
    ],
  };

  const lesson = new LessonScene(scene, narration, whisper, opts);
  const baseUpdate = lesson.update.bind(lesson);
  const baseDispose = lesson.dispose.bind(lesson);
  lesson.update = (dt: number): void => {
    baseUpdate(dt);
    for (const ticker of tickers) ticker(dt);
  };
  lesson.dispose = (): void => {
    baseDispose();
    for (const d of ours) d.dispose();
    ours.length = 0;
    tickers.length = 0;
  };
  return Object.assign(lesson, { loaded });
}
