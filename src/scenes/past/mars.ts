/* Past choices, the second: Mars. A red valley under mesas, a lake basin before the seat, its
   shore strewn with stones worn round by water.

   The telling, as it goes: the valley remembers itself alive (a blue sky, the basin full of water,
   green on the low ground) and its people stand by the lake, figures of light. Their talent was
   war: flashes along the mesas, the people turned on one another and reddened; their sky thins
   and poisons into dust and then into a dark thin air with stars in it, the lake drains, and the
   flashes stop, for there is nothing left to practise on. They are lifted out: each figure lets go
   of its light, which rises and streams across the sky to a blue star climbing the horizon (this
   Earth), where the lesson goes on. The empty basin, dust devils wandering over it. Then the two
   hands, great bodies of light standing from the lakebed: the open hand in gold, the closed fist in
   red. The fist grows with every war and strikes, a ring of dust running out over the ground; light
   poured into it falls through (a fist cannot hold anything); it cools grey, flares once more with
   the old reflex, and at the end, slowly, it opens. */
import { keyShadow } from "../../gpu/lightRig";
import * as THREE from "three/webgpu";
import { T, vnoise, type N } from "../../gpu/tsl";
import { applyAir, boulderGeometry, fbmN, keepAlpha, merge, pointCloud, roomPos, roughBlock, scannedGround, seeded, touch, type Air } from "../densities/roomKit";
import { landStone } from "../../world/stoneworks";
import { handVolume } from "../enacted";
import { GlassFolk } from "../glassFolk";
import type { Narration } from "../../core/narration";
import type { Room } from "../journey";
import { Tells, seatedRoom, starField } from "./kit";

const { exp, float, fract, length, max, mix, normalize, pow, sin, smoothstep, uv, vec2, vec3, vec4 } = T;

/** Room frame: the seat at the origin looking toward −z; the lake basin's centre ahead. */
const LAKE = new THREE.Vector2(0, -95);
const LAKE_R = 34;
const SUN = new THREE.Vector3(-0.55, 0.32, -0.62).normalize();
const EARTH_DIR = new THREE.Vector3(0.42, 0, -1).normalize();

/** The valley's ground: level at the seat, the basin ahead, rising far off. */
export function marsFloor(x: number, z: number): number {
  const d = Math.hypot(x - LAKE.x, z - LAKE.y);
  // the seat stands on a low ledge; the land falls away ahead into the basin
  const fall = -16 * (1 - Math.exp(-Math.max(0, -z - 1.2) / 9)); // a cliff at the seat's edge, the valley below
  const bowl = -7 * smooth(LAKE_R + 4, 12, d);
  const dunes = Math.sin(x * 0.07 + z * 0.04) * 0.5 + Math.sin(x * 0.021 - z * 0.05) * 1.1;
  const far = Math.max(0, Math.hypot(x, z + 60) - 150) * 0.14;
  const near = smooth(2.8, 1.2, Math.hypot(x, z)) * smooth(-2, 0, z); // the seat's ledge, level
  return (fall + bowl + dunes * (1 - near) + far) * (1 - near * 0.95);
}
const smooth = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

export function createMarsScene(scene: THREE.Scene, narration: Narration, whisper: (t: string, ms?: number) => void): Room {
  const people = [-8, -5.2, -2.6, 2.6, 5.2, 8].map((x, i) => ({
    x,
    z: -55 - Math.abs(x) * 0.3,
    scale: 1.35,
    glow: { inner: 0.4, edge: 1.1, body: 0.5 },
    face: i < 3 ? -Math.PI / 2 + 0.5 : Math.PI / 2 - 0.5,
    act: "idle" as const,
    tint: new THREE.Color(0.95, 0.85, 0.75),
  }));
  const folk = new GlassFolk(people.map((p) => ({ ...p, y: marsFloor(p.x, p.z) })), 17);
  const room = seatedRoom(scene, narration, whisper, {
    id: "past_mars",
    track: "audio/past/past_mars.mp3",
    len: 163.6,
    seat: new THREE.Vector3(0, 0, 0),
    heading: 0,
    make: (g, t) => {
      const ours: { dispose(): void }[] = [];
      const R = seeded(5503);
      const tl = new Tells({
        life: [[0.005, 0], [0.045, 1], [0.19, 1], [0.27, 0]],
        people: [[0.045, 0], [0.065, 1], [0.3, 1], [0.345, 0]],
        war: [[0.15, 0], [0.17, 1], [0.245, 1], [0.258, 0]],
        dust: [[0.19, 0], [0.23, 1], [0.3, 0.6], [0.5, 0.3]],
        lift: [[0.3, 0], [0.365, 1]],
        earth: [[0.28, 0], [0.34, 1]],
        shine: [[0.3, 0.4], [0.36, 1], [0.7, 0.6], [0.745, 1], [0.81, 1.35], [1, 1.2]],
        devils: [[0.37, 0], [0.4, 1], [0.5, 1], [0.53, 0]],
        palm: [[0.505, 0], [0.53, 1]],
        fist: [[0.525, 0], [0.548, 1]],
        grow: [[0.55, 0], [0.58, 1], [0.66, 1], [0.7, 0.55]],
        strike: [[0.588, 0], [0.6, 1], [0.64, 0]],
        ring: [[0.598, 0], [0.665, 1]],
        pour: [[0.655, 0], [0.67, 1], [0.73, 1], [0.75, 0]],
        heat: [[0.52, 0.8], [0.56, 1], [0.66, 1], [0.7, 0.25], [0.84, 0.25], [0.86, 1], [0.9, 0.4], [0.955, 0.4], [1, 0]],
        open: [[0.955, 0], [0.998, 1]],
        dawn: [[0.93, 0], [1, 1]],
      });
      const u = tl.u;
      const air: Air = {
        color: new THREE.Color(),
        glow: new THREE.Color(0.3, 0.16, 0.1),
        glowDir: SUN.clone(),
        density: 0.004,
        shadow: new THREE.Color(0.02, 0.008, 0.012),
        sat: 1.04,
        contrast: 1.05,
      };

      /* ---------------- the sky: living blue, poisoned dust, then thin dark air ---------------- */
      {
        const geo = new THREE.SphereGeometry(1400, 48, 24);
        const m = new THREE.MeshBasicNodeMaterial({ side: THREE.BackSide, fog: false, depthWrite: false });
        const d = normalize(T.positionLocal);
        const e = smoothstep(0, 0.55, max(d.y, 0));
        const living = mix(vec3(0.55, 0.66, 0.82), vec3(0.16, 0.32, 0.66), e);
        const dusty = mix(vec3(0.62, 0.36, 0.26), vec3(0.3, 0.18, 0.18), e);
        const thin = mix(vec3(0.22, 0.1, 0.07), vec3(0.012, 0.01, 0.018), e);
        let c: N = mix(mix(thin, dusty, u.dust), living, u.life);
        const sd = T.dot(d, vec3(SUN.x, SUN.y, SUN.z));
        c = c.add(vec3(1, 0.9, 0.75).mul(smoothstep(0.9994, 0.9998, sd)).mul(2)).add(vec3(0.5, 0.3, 0.2).mul(pow(max(sd, 0), 30)).mul(float(0.3).add(u.dust)));
        const dark = float(1).sub(u.life).mul(float(1).sub(u.dust.mul(0.8)));
        c = c.add(vec3(starField(d, t, 0.005)).mul(dark));
        // dawn at the end: warmth along the horizon ahead
        c = c.add(vec3(0.5, 0.24, 0.1).mul(exp(max(d.y, 0).mul(-9))).mul(pow(max(T.dot(d, vec3(0, 0, -1)), 0), 2)).mul(u.dawn));
        m.colorNode = vec4(c, 1);
        const sky = new THREE.Mesh(geo, m);
        sky.renderOrder = -10;
        sky.frustumCulled = false;
        g.add(sky);
        ours.push(geo, m);
      }

      /* ---------------- the valley: red ground, greener while it lived, darker where water was ---------------- */
      const level = { y: -12 };
      {
        const geo = new THREE.PlaneGeometry(900, 900, 300, 300);
        geo.rotateX(-Math.PI / 2);
        geo.translate(0, 0, -120);
        const p = geo.attributes.position as THREE.BufferAttribute;
        for (let i = 0; i < p.count; i++) p.setY(i, marsFloor(p.getX(i), p.getZ(i)));
        geo.computeVertexNormals();
        const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.95, metalness: 0 });
        const scan = scannedGround("sand", 2.4, { hue: 0.25, relief: 1.4, bright: 1.5 });
        const y = roomPos.y;
        const low = smoothstep(-8, -16, y);
        const ochre = mix(vec3(0.5, 0.2, 0.1), vec3(0.62, 0.32, 0.17), fbmN(roomPos.xz.mul(0.02)));
        const green = mix(vec3(0.24, 0.3, 0.14), vec3(0.3, 0.34, 0.2), fbmN(roomPos.xz.mul(0.05)));
        const bed = smoothstep(-16.5, -18.5, y).mul(float(1).sub(u.life.mul(0.6))); // the dry bed, pale and cracked
        const cracks = smoothstep(0.03, 0, T.abs(fbmN(roomPos.xz.mul(0.35)).sub(0.5))).mul(bed);
        let c: N = mix(ochre, green, low.mul(u.life).mul(0.8));
        c = mix(c, vec3(0.66, 0.5, 0.4), bed.mul(0.45)).mul(float(1).sub(cracks.mul(0.5)));
        m.colorNode = c.mul(scan.color).mul(0.55);
        m.normalNode = scan.normal;
        const ground = new THREE.Mesh(geo, m);
        ground.receiveShadow = true;
        g.add(ground);
        ours.push(geo, m);
        // the lake itself: the sky's colour on still water, stirring a little
        const wg = new THREE.CircleGeometry(LAKE_R + 6, 96);
        wg.rotateX(-Math.PI / 2);
        wg.translate(LAKE.x, 0, LAKE.y);
        const wm = new THREE.MeshBasicNodeMaterial({ fog: true });
        const rip = vnoise(roomPos.xz.mul(vec2(0.25, 0.7)).add(vec2(t.mul(0.12), 0))).mul(0.5).add(0.5);
        wm.colorNode = vec4(mix(vec3(0.08, 0.2, 0.36), vec3(0.4, 0.55, 0.72), rip.mul(0.5)).mul(u.life.mul(0.8).add(0.2)), 1);
        const water = new THREE.Mesh(wg, wm);
        g.add(water);
        ours.push(wg, wm);
        (g.userData as { water?: THREE.Mesh }).water = water;
        // stones worn round by the water, along the shore and the bed
        const stones: THREE.BufferGeometry[] = [];
        for (let i = 0; i < 70; i++) {
          const a = R() * Math.PI * 2, r = LAKE_R * (0.45 + R() * 0.6);
          const x = LAKE.x + Math.cos(a) * r, z = LAKE.y + Math.sin(a) * r;
          if (z > -18) continue;
          const b = boulderGeometry(0.25 + R() * R() * 1.2, i * 3.1);
          b.scale(1, 0.7, 1);
          b.translate(x, marsFloor(x, z) + 0.05, z);
          stones.push(b);
        }
        const sm = landStone("sandstone_cracks", -8, 1.2, [0.85, 0.55, 0.42]);
        const smesh = new THREE.Mesh(merge(stones), sm);
        smesh.castShadow = smesh.receiveShadow = true;
        g.add(smesh);
        ours.push(smesh.geometry, sm);
        // the mesas round the valley: broad, flat-topped, their sides worn
        const mesas: THREE.BufferGeometry[] = [];
        for (let i = 0; i < 12; i++) {
          const a = -Math.PI * 0.9 + (i / 11) * Math.PI * 1.8 + (R() - 0.5) * 0.15;
          const r = 190 + R() * 160;
          const x = Math.sin(a) * r, z = -Math.cos(a) * r - 50;
          const w = 50 + R() * 70, h = 22 + R() * 36;
          const b = roughBlock(w, h, w * (0.5 + R() * 0.5), 0.18, i * 7.7);
          b.rotateY(R() * Math.PI);
          b.translate(x, marsFloor(x, z) - 3, z);
          mesas.push(b);
        }
        const mm = landStone("sandstone_cracks", 0, 9, [0.9, 0.48, 0.32]);
        const mmesh = new THREE.Mesh(merge(mesas), mm);
        mmesh.castShadow = true;
        g.add(mmesh);
        ours.push(mmesh.geometry, mm);
      }
      const sun = new THREE.DirectionalLight(0xfff0dc, 2.2);
      sun.position.copy(SUN).multiplyScalar(80);
      keyShadow(sun, 45);
      g.add(sun, sun.target);
      const hemi = new THREE.HemisphereLight(0x9ab6ff, 0x3a1a10, 0.5);
      g.add(hemi);

      /* ---------------- war: flashes along the mesas, the people reddened ---------------- */
      {
        const n = 60;
        const F = pointCloud(n, 9);
        for (let i = 0; i < n; i++) {
          const a = -Math.PI * 0.9 + R() * Math.PI * 1.8, r = 120 + R() * 180;
          const x = Math.sin(a) * r, z = -Math.cos(a) * r - 40;
          F.pos.set([x, marsFloor(x, z) + 4 + R() * 30, z], i * 3);
          F.k.set([R(), R(), R(), R()], i * 4);
        }
        touch(F.cloud);
        const K = F.cloud.nodes.aK;
        const beat = pow(fract(t.mul(K.y.mul(0.35).add(0.15)).add(K.x)), 4);
        F.material.colorNode = vec4(mix(vec3(1, 0.3, 0.08), vec3(1, 0.8, 0.5), K.z).mul(F.round).mul(beat).mul(u.war).mul(1.8), 1);
        g.add(F.cloud.sprite);
        ours.push(F.material);
      }

      /* ---------------- lifted out: each one's light rising and streaming to a blue star ---------------- */
      const earthAt = new THREE.Vector3();
      {
        const m = keepAlpha(new THREE.SpriteNodeMaterial({ transparent: true, depthWrite: false, fog: false }));
        const r = length(uv().sub(0.5)).mul(2);
        m.colorNode = vec4(vec3(0.45, 0.7, 1).mul(exp(r.mul(r).mul(-14)).mul(2).add(exp(r.mul(r).mul(-3)).mul(0.25))).mul(u.shine).mul(smoothstep(0, 0.15, u.earth.add(u.shine.mul(0.1)))), 1);
        const earth = new THREE.Sprite(m);
        earth.scale.setScalar(64);
        g.add(earth);
        ours.push(m);
        (g.userData as { earth?: THREE.Sprite }).earth = earth;
      }
      const uEarthPos = T.uniform(new THREE.Vector3());
      {
        const n = 1800;
        const L = pointCloud(n, 0.5);
        const aF = new Float32Array(n * 3);
        for (let i = 0; i < n; i++) {
          const p = people[i % people.length];
          aF.set([p.x, marsFloor(p.x, p.z) + 1.2, p.z], i * 3);
          L.k.set([R(), R(), R(), R()], i * 4);
        }
        const bF = new THREE.InstancedBufferAttribute(aF, 3);
        L.cloud.sprite.geometry.setAttribute("aF", bF);
        touch(L.cloud);
        const F = T.instancedBufferAttribute(bF), K = L.cloud.nodes.aK;
        const s = T.clamp(u.lift.mul(1.5).sub(K.x.mul(0.5)), 0, 1);
        const up = F.add(vec3(K.y.sub(0.5).mul(6), float(40).add(K.z.mul(30)), K.w.sub(0.5).mul(6)));
        const a = mix(F, up, s), b = mix(up, uEarthPos, s);
        const trail = K.w.mul(0.08);
        const p = mix(a, b, T.clamp(s.sub(trail), 0, 1));
        L.material.positionNode = p.add(vec3(sin(t.mul(2).add(K.x.mul(40))), sin(t.mul(1.7).add(K.y.mul(30))), 0).mul(float(1).sub(s).mul(0.3)));
        const on = smoothstep(0, 0.05, s).mul(smoothstep(1, 0.9, s));
        L.material.colorNode = vec4(vec3(1, 0.9, 0.72).mul(L.round).mul(on).mul(1.2), 1);
        g.add(L.cloud.sprite);
        ours.push(L.material);
      }

      /* ---------------- dust devils wandering the empty basin ---------------- */
      {
        const n = 2400;
        const D = pointCloud(n, 0.35);
        for (let i = 0; i < n; i++) D.k.set([R(), R(), R(), R()], i * 4);
        touch(D.cloud);
        const K = D.cloud.nodes.aK;
        const which = T.step(0.5, K.w);
        const cx = mix(float(-22), float(16), which).add(sin(t.mul(0.05).add(which.mul(2))).mul(14));
        const cz = mix(float(-60), float(-80), which).add(T.cos(t.mul(0.04).add(which)).mul(10));
        const h = K.y.mul(K.y).mul(26);
        const rad = float(0.6).add(h.mul(0.18)).add(K.z.mul(0.8));
        const th = K.x.mul(6.28).add(t.mul(float(2.2).sub(K.y)));
        const base = vec3(cx, float(marsFloor(0, -70)), cz);
        D.material.positionNode = base.add(vec3(T.cos(th).mul(rad), h, sin(th).mul(rad)));
        D.material.colorNode = vec4(vec3(0.8, 0.5, 0.3).mul(D.round).mul(u.devils).mul(float(1).sub(K.y.mul(0.6))).mul(0.35), 1);
        g.add(D.cloud.sprite);
        ours.push(D.material);
      }

      /* ---------------- the two hands: the open hand in gold, the closed fist in red ---------------- */
      const fistG = new THREE.Group();
      {
        const n = 9000;
        for (const side of [-1, 1]) {
          const P = pointCloud(n, 0.26);
          const closed = handVolume(n, 91, 0.05, 10);
          const open = handVolume(n, 91, 1, 10);
          const aB = new Float32Array(n * 3);
          for (let i = 0; i < n; i++) {
            const src = side < 0 ? open : closed;
            P.pos.set([src[i * 3] * side, src[i * 3 + 1], src[i * 3 + 2]], i * 3);
            aB.set([open[i * 3] * side, open[i * 3 + 1], open[i * 3 + 2]], i * 3);
            P.k.set([R(), R(), R(), R()], i * 4);
          }
          const bB = new THREE.InstancedBufferAttribute(aB, 3);
          P.cloud.sprite.geometry.setAttribute("aB", bB);
          touch(P.cloud);
          const K = P.cloud.nodes.aK, B = T.instancedBufferAttribute(bB);
          const show = side < 0 ? u.palm : u.fist;
          const pos = side < 0 ? P.cloud.nodes.position : mix(P.cloud.nodes.position, B, u.open);
          const rise = float(1).sub(show).mul(-14);
          const breath = sin(t.mul(0.5).add(side)).mul(0.02).add(1);
          P.material.positionNode = pos.mul(breath).add(vec3(0, rise, 0)).add(vec3(sin(t.mul(0.4).add(K.x.mul(30))).mul(0.06), 0, 0));
          const tw = sin(t.mul(float(0.7).add(K.y)).add(K.z.mul(40))).mul(0.25).add(0.75);
          const col = side < 0 ? vec3(1, 0.82, 0.5) : mix(mix(vec3(0.45, 0.4, 0.42), vec3(1, 0.22, 0.08), u.heat), vec3(1, 0.82, 0.5), u.open);
          P.material.colorNode = vec4(col.mul(P.round).mul(tw).mul(show).mul(side < 0 ? 0.42 : float(0.3).add(u.heat.mul(0.25))), 1);
          const hg = side < 0 ? new THREE.Group() : fistG;
          hg.add(P.cloud.sprite);
          hg.position.set(side * 10, marsFloor(side * 10, -72) - 1, -72);
          hg.rotation.set(0, -side * 0.35, -side * 0.12);
          g.add(hg);
          ours.push(P.material);
        }
      }
      // the strike's ring of dust running out over the ground, and light poured through the fist
      {
        const n = 2600;
        const D = pointCloud(n, 0.9);
        for (let i = 0; i < n; i++) D.k.set([R(), R(), R(), R()], i * 4);
        touch(D.cloud);
        const K = D.cloud.nodes.aK;
        const a = K.x.mul(6.28), r = u.ring.mul(60).add(K.y.mul(3));
        D.material.positionNode = vec3(T.cos(a).mul(r).add(10), K.z.mul(2.5).mul(float(1).sub(u.ring)).add(marsFloor(10, -72) + 0.5), sin(a).mul(r).add(-72));
        D.material.colorNode = vec4(vec3(0.85, 0.45, 0.25).mul(D.round).mul(sin(u.ring.mul(Math.PI))).mul(0.5), 1);
        g.add(D.cloud.sprite);
        ours.push(D.material);
        const n2 = 900;
        const P = pointCloud(n2, 0.3);
        for (let i = 0; i < n2; i++) P.k.set([R(), R(), R(), R()], i * 4);
        touch(P.cloud);
        const K2 = P.cloud.nodes.aK;
        const fall = fract(K2.x.add(t.mul(0.22)));
        P.material.positionNode = vec3(K2.y.sub(0.5).mul(3).add(10), float(marsFloor(10, -72) + 36).sub(fall.mul(40)), K2.z.sub(0.5).mul(3).add(-72));
        P.material.colorNode = vec4(vec3(1, 0.86, 0.55).mul(P.round).mul(u.pour).mul(smoothstep(0, 0.1, fall)).mul(smoothstep(1, 0.8, fall)), 1);
        g.add(P.cloud.sprite);
        ours.push(P.material);
      }
      g.add(folk.group);

      const ud = g.userData as { water?: THREE.Mesh; earth?: THREE.Sprite };
      const living = new THREE.Color(0.55, 0.66, 0.82), dusty = new THREE.Color(0.55, 0.32, 0.22), thin = new THREE.Color(0.08, 0.04, 0.04);
      const cTmp = new THREE.Color();
      return {
        update(dt, f, _on, still) {
          tl.step(f, dt, still);
          const v = tl.v;
          // the room's air follows its sky
          cTmp.copy(thin).lerp(dusty, v.dust).lerp(living, v.life);
          air.color.copy(cTmp).multiplyScalar(0.8);
          air.density = 0.0025 + v.dust * 0.004;
          applyAir(air);
          hemi.color.copy(cTmp);
          hemi.intensity = 0.3 + v.life * 0.5;
          sun.intensity = 1.2 + v.life * 1.4;
          sun.color.setRGB(1, 0.94, 0.86).lerp(new THREE.Color(1, 0.7, 0.5), v.dust * (1 - v.life));
          level.y = -23.4 + v.life * 6.6;
          if (ud.water) (ud.water.position.y = level.y), (ud.water.visible = v.life > 0.02);
          // the blue star rising
          const el = -0.06 + v.earth * 0.2;
          earthAt.set(EARTH_DIR.x, el, EARTH_DIR.z).normalize().multiplyScalar(700);
          if (ud.earth) ud.earth.position.copy(earthAt);
          uEarthPos.value.copy(earthAt);
          // the people: there while it lived, reddening at war, gone when lifted
          folk.bodies.forEach((b) => {
            b.root.visible = v.people > 0.02;
            b.mat.opacity = v.people;
            b.mat.emissive.setRGB(0.95, 0.85, 0.75).lerp(new THREE.Color(1, 0.25, 0.1), v.war);
            b.act(v.war > 0.5 ? "reach" : "idle");
          });
          folk.update(dt);
          // the fist: grown by every war, striking down
          fistG.scale.setScalar(1 + v.grow * 0.35);
          fistG.position.y = marsFloor(10, -72) - 1 - v.strike * 6;
        },
        dispose() {
          folk.dispose();
          for (const o of ours) o.dispose();
        },
      };
    },
  });
  return Object.assign(room, { loaded: folk.loaded });
}
