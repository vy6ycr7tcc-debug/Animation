/* The Adept, the second station: the crucible. Inside a great round tower open to a dim sky, seven
   galleries ring the walls one above another, a thin line of colour inlaid at each edge: the seven
   chambers, the body at the bottom (red) to knowing at the top (violet). At the tower's heart, on
   a stepped hearth, a crucible of stone with molten metal breathing in it, sparks rising.

   The narration climbs the tower: each gallery lights as its chamber is named. You cannot skip:
   a pulse of light climbs from the ground up through all seven. A light descends the tower gate by
   gate (the goddess going down through seven gates). The practice: a deep red swells on one side
   of the crucible, magnified, then its opposite, a clear blue, on the other; then both let go and
   a steady white stands over the metal. The monster: a dark figure of glass walks in from an arch
   and comes to the traveler (a figure of light) standing at the crucible; invited into the heart,
   its darkness warms, and the two stand on two legs, light and dark. The shortcut: an opening in
   the wall glitters with cold gold, beckoning, and fades when faith is named. The desert cells
   called furnaces: the crucible roars. It ends changed: the metal settles into still bright gold.
   High in the tower an egg of pearl light gathers (the adept is born, not built), and the door
   on the far side opens in the same pearl light. */
import * as THREE from "three/webgpu";
import { LessonScene } from "../lessonKit";
import type { LessonCtx, LessonOpts, SceneModule } from "../lessonKit";
import { T, vnoise, type N } from "../../gpu/tsl";
import { ribbonGeometry, ribbonMaterial } from "../../gpu/ribbons";
import { landStone, stoneBlock } from "../../world/stoneworks";
import { GlassFolk } from "../glassFolk";
import { applyAir, damp, inward, keepAlpha, merge, pointCloud, ringWall, roomClock, seeded, touch, type Air, roomPos } from "../densities/roomKit";

const { abs, exp, float, fract, length, mix, pow, sin, smoothstep, uniform, uv, vec2, vec3, vec4 } = T;

/** Room frame: you start at z 4.5 facing −z; the tower's centre (and the crucible) at z −6. */
export const CRU_C = new THREE.Vector3(0, 0, -6);
const TOWER_R = 12, TOWER_H = 46;
const GALLERY_Y = [4, 9, 14, 19, 24, 29, 34];

export function createCrucibleScene(scene: THREE.Scene, narration: LessonCtx["narration"], whisper: (t: string, ms?: number) => void): SceneModule {
  const seatPos = new THREE.Vector3(0, 0, 4.5);
  const tickers: Array<(dt: number) => void> = [];
  const ours: Array<{ dispose(): void }> = [];
  const clock = roomClock();
  const t = clock.u;
  const uRings = uniform(0); // galleries lit, 0 … 7
  const uClimb = uniform(-0.2); // the pulse climbing the tower (0 floor … 1 top)
  const uDesc = uniform(-1); // the light going down through the seven gates (1 top … 0 floor; <0 gone)
  const uRed = uniform(0), uBlue = uniform(0), uStill = uniform(0); // the practice
  const uForge = uniform(0.7); // the metal's heat
  const uCool = uniform(0); // the metal settled, changed
  const uLure = uniform(0); // the shortcut's cold glitter
  const uHeart = uniform(0); // the shadow welcomed
  const uWomb = uniform(0); // the pearl light gathering high up, and the door
  const goal = { rings: 0, forge: 0.7, cool: 0, lure: 0, heart: 0, womb: 0, red: 0, blue: 0, still: 0 };
  let climbing = false, descending = false;
  const air: Air = {
    color: new THREE.Color(0.03, 0.022, 0.02),
    glow: new THREE.Color(0.22, 0.1, 0.04),
    glowDir: new THREE.Vector3(0, -1, 0),
    density: 0.006,
    shadow: new THREE.Color(0.008, 0.003, 0.002),
    sat: 1.04,
    contrast: 1.08,
  };
  const R = seeded(577);
  // the traveler and the shadow
  const folk = new GlassFolk([
    { x: 1.7, z: CRU_C.z + 3.2, face: -Math.PI / 2 - 0.3, act: "idle", tint: new THREE.Color(1, 0.88, 0.66) },
    { x: -TOWER_R + 1.2, z: CRU_C.z + 3.2, face: Math.PI / 2, act: "walk", tint: new THREE.Color(0.32, 0.2, 0.5), glow: { inner: 0.1, edge: 0.7, body: 0.5 }, scale: 2.3 },
  ], 91);
  const shadowFrom = new THREE.Vector3(-TOWER_R + 1.2, 0, CRU_C.z + 3.2), shadowTo = new THREE.Vector3(-2.2, 0, CRU_C.z + 4.4);
  let shadowK = 0, shadowGo = false, welcomed = false;
  const warmTint = new THREE.Color(0.95, 0.62, 0.72);

  const build = (ctx: LessonCtx) => {
    const g = ctx.group;
    const C = CRU_C;
    // the tower: its floor, wall, galleries and a sky far above
    {
      const floorG = new THREE.CircleGeometry(TOWER_R + 0.5, 72);
      floorG.rotateX(-Math.PI / 2);
      floorG.translate(C.x, 0, C.z);
      const floorM = landStone("red_sandstone_pavement", 0, 3, [1, 0.8, 0.66], { flag: 1.2 });
      const fl = new THREE.Mesh(floorG, floorM);
      fl.receiveShadow = true;
      g.add(fl);
      const parts = ringWall(TOWER_R + 0.6, TOWER_H, 1.2, 28, [14]); // the door at −z left open
      const over = stoneBlock(3.2, TOWER_H - 7, 1.2);
      over.translate(0, 7 + (TOWER_H - 7) / 2, -TOWER_R - 0.6);
      parts.push(over);
      for (const x of [-2.1, 2.1]) {
        const j = stoneBlock(1.1, 7, 1.8);
        j.translate(x, 3.5, -TOWER_R - 0.5);
        parts.push(j);
      }
      // the galleries: a ledge ringing the wall at each chamber's height, a parapet on it
      for (const y of GALLERY_Y) {
        const ledge = inward(new THREE.CylinderGeometry(TOWER_R + 0.1, TOWER_R + 0.1, 0.6, 72, 1, true));
        ledge.translate(0, y, 0);
        parts.push(ledge);
        const lip = new THREE.TorusGeometry(TOWER_R - 1.3, 0.18, 6, 72);
        lip.rotateX(Math.PI / 2);
        lip.translate(0, y + 0.2, 0);
        parts.push(lip);
        const ring = new THREE.RingGeometry(TOWER_R - 1.35, TOWER_R + 0.1, 72, 1);
        ring.rotateX(-Math.PI / 2);
        ring.translate(0, y + 0.02, 0);
        parts.push(ring);
        const under = new THREE.RingGeometry(TOWER_R - 1.35, TOWER_R + 0.1, 72, 1);
        under.rotateX(Math.PI / 2);
        under.translate(0, y - 0.3, 0);
        parts.push(under);
      }
      for (const p of parts) p.translate(C.x, 0, C.z);
      const wallM = landStone("sandstone_blocks_08", 0, 2.6, [0.78, 0.66, 0.58], {});
      const wall = new THREE.Mesh(merge(parts), wallM);
      wall.receiveShadow = wall.castShadow = true;
      wall.material.side = THREE.DoubleSide;
      g.add(wall);
      ours.push(floorG, floorM, wallM, wall.geometry);
      // the sky at the top, dim, a few stars
      const sg = new THREE.CircleGeometry(TOWER_R + 1, 48);
      sg.rotateX(Math.PI / 2);
      sg.translate(C.x, TOWER_H - 0.2, C.z);
      const sm = new THREE.MeshBasicNodeMaterial({ fog: false });
      const h = fract(sin(T.dot(T.floor(uv().mul(80)), vec2(12.9898, 78.233))).mul(43758.5453));
      sm.colorNode = vec4(vec3(0.02, 0.022, 0.04).add(vec3(smoothstep(0.995, 1, h).mul(0.7))), 1);
      g.add(new THREE.Mesh(sg, sm));
      ours.push(sg, sm);
    }
    // each gallery's line of colour, lit as its chamber is named; the climbing pulse brightens them
    {
      const pairs: number[] = [];
      for (const y of GALLERY_Y) {
        const n = 96, r = TOWER_R - 1.5;
        for (let i = 0; i < n; i++) {
          const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2;
          pairs.push(C.x + Math.sin(a0) * r, y + 0.42, C.z + Math.cos(a0) * r, C.x + Math.sin(a1) * r, y + 0.42, C.z + Math.cos(a1) * r);
        }
      }
      const geo = ribbonGeometry(pairs);
      const y = T.positionGeometry.y;
      const k = y.sub(4.42).div(5); // which gallery, 0 … 6
      const col = mix(mix(mix(vec3(0.88, 0.28, 0.23), vec3(0.94, 0.54, 0.2), smoothstep(0, 1, k)), mix(vec3(0.95, 0.81, 0.29), vec3(0.37, 0.81, 0.45), smoothstep(2, 3, k)), smoothstep(1, 2, k)), mix(mix(vec3(0.31, 0.56, 0.91), vec3(0.36, 0.31, 0.81), smoothstep(4, 5, k)), vec3(0.66, 0.43, 0.88), smoothstep(5, 6, k)), smoothstep(3, 4, k));
      const lit = smoothstep(k.add(0.1), k.add(0.9), uRings);
      const pulse = exp(abs(y.div(38).sub(uClimb)).mul(-18)).mul(1.4);
      const gate = exp(abs(y.div(38).sub(uDesc)).mul(-22)).mul(1.1);
      const m = ribbonMaterial(col.mul(col).mul(lit.mul(0.75).add(pulse.mul(0.6)).add(gate.mul(0.5)).add(0.02)), 1.2);
      g.add(new THREE.Mesh(geo, m));
      ours.push(geo, m);
    }
    // the light going down through the seven gates
    {
      const s = pointCloud(1, 1.1);
      s.pos.set([C.x, 0, C.z]);
      touch(s.cloud);
      s.material.positionNode = vec3(0, uDesc.mul(38).add(0.8), 0);
      s.material.colorNode = vec4(vec3(1, 0.95, 0.9).mul(s.round).mul(smoothstep(-0.05, 0.02, uDesc)).mul(0.9), 1);
      s.cloud.sprite.position.set(C.x, 0, C.z);
      g.add(s.cloud.sprite);
      ours.push(s.material);
    }
    // the hearth and the crucible
    {
      const parts: THREE.BufferGeometry[] = [];
      for (const [r, h] of [[4.4, 0.25], [3.6, 0.5]] as const) {
        const c = new THREE.CylinderGeometry(r, r + 0.1, 0.25, 48);
        c.translate(0, h - 0.125, 0);
        parts.push(c);
      }
      const pts: THREE.Vector2[] = [];
      for (let i = 0; i <= 16; i++) {
        const f = i / 16;
        pts.push(new THREE.Vector2(1.1 + Math.sin(f * Math.PI * 0.5) * 1.4 + (f > 0.9 ? 0.15 : 0), 0.5 + f * 0.8));
      }
      pts.push(new THREE.Vector2(2.3, 1.3));
      const bowl = new THREE.LatheGeometry(pts, 48);
      parts.push(bowl);
      for (const p of parts) p.translate(C.x, 0, C.z);
      const m = landStone("sandstone_cracks", 0, 1.6, [0.62, 0.55, 0.52]);
      m.side = THREE.DoubleSide;
      const mesh = new THREE.Mesh(merge(parts), m);
      mesh.castShadow = mesh.receiveShadow = true;
      g.add(mesh);
      ours.push(m, mesh.geometry);
      // the molten metal: churning, breathing; at the end, settled into still bright gold
      const mg = new THREE.CircleGeometry(2.45, 48);
      mg.rotateX(-Math.PI / 2);
      mg.translate(C.x, 1.18, C.z);
      const mm = new THREE.MeshStandardNodeMaterial({ roughness: 0.25, metalness: 0.9 });
      const p = roomPos.xz.mul(1.3);
      const churn = vnoise(p.add(vec2(t.mul(0.35), t.mul(-0.22)))).mul(0.6).add(vnoise(p.mul(2.7).sub(vec2(t.mul(0.5), 0))).mul(0.4));
      const crust = smoothstep(0.55, 0.75, churn).mul(float(1).sub(uCool));
      const heat = mix(vec3(0.9, 0.2, 0.02), vec3(1, 0.55, 0.12), pow(churn, 1.5)).mul(float(1).sub(crust.mul(0.8))).mul(uForge).mul(sin(t.mul(0.6)).mul(0.1).add(0.9));
      mm.colorNode = mix(vec3(0.12, 0.04, 0.02), vec3(0.85, 0.6, 0.25), uCool);
      mm.emissiveNode = mix(heat.mul(0.9), vec3(0.75, 0.5, 0.2).mul(churn.mul(0.2).add(0.22)), uCool);
      g.add(new THREE.Mesh(mg, mm));
      ours.push(mg, mm);
      // its warmth on the stone round it
      const light = new THREE.PointLight(0xff8a3c, 0, 40, 1.3);
      light.position.set(C.x, 3.0, C.z);
      g.add(light);
      tickers.push(() => (light.intensity = 110 * uForge.value * (1 - uCool.value * 0.4) + 14));
      // sparks rising off the metal
      const n = 360;
      const s = pointCloud(n, 0.06);
      for (let i = 0; i < n; i++) {
        s.pos.set([0, 0, 0], i * 3);
        s.k.set([R(), R(), R(), R()], i * 4);
      }
      touch(s.cloud);
      const K = s.cloud.nodes.aK;
      const life = fract(K.x.add(t.mul(float(0.12).add(K.y.mul(0.1)))));
      const a = K.z.mul(6.283).add(life.mul(3));
      const r = K.w.mul(2).mul(float(1).add(life.mul(0.8)));
      s.material.positionNode = vec3(T.cos(a).mul(r), life.mul(life).mul(16), T.sin(a).mul(r));
      s.material.colorNode = vec4(mix(vec3(1, 0.7, 0.3), vec3(1, 0.3, 0.1), life).mul(s.round).mul(float(1).sub(life)).mul(uForge).mul(float(1).sub(uCool.mul(0.8))).mul(0.9), 1);
      s.cloud.sprite.position.set(C.x, 1.25, C.z);
      g.add(s.cloud.sprite);
      ours.push(s.material);
    }
    // the practice: the red and its opposite, and the steadiness that remains
    {
      const mk = (x: number, col: THREE.Vector3, u: N) => {
        const m = keepAlpha(new THREE.SpriteNodeMaterial({ transparent: true, depthWrite: false, fog: false }));
        const r = length(uv().sub(0.5)).mul(2);
        m.colorNode = vec4(vec3(col.x, col.y, col.z).mul(exp(r.mul(r).mul(-5))).mul(smoothstep(1, 0.6, r)).mul(u).mul(0.4), 1);
        const sp = new THREE.Sprite(m);
        sp.position.set(C.x + x, 2.8, C.z);
        sp.scale.setScalar(3.4);
        g.add(sp);
        ours.push(m);
        return sp;
      };
      const red = mk(-3.3, new THREE.Vector3(0.9, 0.12, 0.08), uRed);
      const blue = mk(3.3, new THREE.Vector3(0.25, 0.55, 1), uBlue);
      const white = mk(0, new THREE.Vector3(1, 0.97, 0.9), uStill);
      white.position.y = 3.0;
      tickers.push(() => {
        red.scale.setScalar(0.8 + uRed.value * 1.8);
        blue.scale.setScalar(0.8 + uBlue.value * 1.8);
        white.scale.setScalar(0.6 + uStill.value * 0.9);
      });
    }
    // the arch the shadow comes from, and the shortcut's glittering opening
    {
      const mkOpening = (side: number) => {
        const geo = new THREE.PlaneGeometry(3, 5.6);
        geo.translate(0, 2.8, 0);
        const m = new THREE.MeshBasicNodeMaterial({ fog: false, side: THREE.DoubleSide });
        const mesh = new THREE.Mesh(geo, m);
        mesh.position.set(C.x + side * (TOWER_R - 0.1), 0, C.z + 3.2);
        mesh.rotation.y = Math.PI / 2;
        g.add(mesh);
        ours.push(geo, m);
        return m;
      };
      const dark = mkOpening(-1);
      dark.colorNode = vec4(vec3(0.004, 0.002, 0.008), 1);
      const lure = mkOpening(1);
      const u = uv();
      const glit = pow(vnoise(u.mul(vec2(30, 50)).add(vec2(0, t.mul(0.6)))), 6).mul(3);
      lure.colorNode = vec4(mix(vec3(0.01, 0.01, 0.012), vec3(0.95, 0.85, 0.5).mul(glit.add(0.18)), uLure.mul(smoothstep(0.0, 0.2, u.x).mul(smoothstep(1, 0.8, u.x)))), 1);
    }
    // the pearl light gathering high in the tower, and the door onward in the same light
    {
      const m = keepAlpha(new THREE.SpriteNodeMaterial({ transparent: true, depthWrite: false, fog: false }));
      const r = length(uv().sub(0.5).mul(vec2(1.3, 1))).mul(2);
      m.colorNode = vec4(vec3(1, 0.93, 0.95).mul(exp(r.mul(r).mul(-3))).mul(smoothstep(1, 0.7, r)).mul(uWomb).mul(0.5), 1);
      const egg = new THREE.Sprite(m);
      egg.position.set(C.x, 30, C.z);
      egg.scale.set(3.4, 4.2, 1);
      g.add(egg);
      const dg = new THREE.PlaneGeometry(3.2, 7);
      dg.translate(0, 3.5, 0);
      const dm = new THREE.MeshBasicNodeMaterial({ fog: false });
      const du = uv();
      dm.colorNode = vec4(mix(vec3(0.01, 0.008, 0.01), vec3(0.95, 0.9, 0.92), smoothstep(1.0, 0.1, length(du.sub(vec2(0.5, 0.35)).mul(vec2(2, 1.2)))).mul(uWomb.mul(0.8).add(0.015))), 1);
      const door = new THREE.Mesh(dg, dm);
      door.position.set(C.x, 0, C.z - TOWER_R - 0.9);
      g.add(door);
      ours.push(m, dg, dm);
    }
    g.add(folk.group);
    // the monster's presence: dark smoke curling off it as it comes, which warms to embers when
    // it is welcomed; and the welcome itself, the emotional climax: light opening between the two
    // (a warm pool spreading over the floor in slow rings, a stream of light from the traveler
    // into the dark figure)
    const shadowAt = uniform(shadowFrom.clone());
    const travelerAt = new THREE.Vector3(1.7, 0, CRU_C.z + 3.2);
    {
      const n = 1600;
      const sm = pointCloud(n, 0.55);
      for (let i = 0; i < n; i++) sm.k.set([R(), R(), R(), R()], i * 4);
      touch(sm.cloud);
      const K = sm.cloud.nodes.aK;
      const life = fract(K.x.add(clock.u.mul(float(0.05).add(K.y.mul(0.05)))));
      const a = K.z.mul(6.283).add(life.mul(2));
      const r = float(0.5).add(life.mul(1.8)).mul(K.w.add(0.4));
      sm.material.positionNode = shadowAt.add(vec3(T.cos(a).mul(r), float(0.3).add(life.mul(5.5)).add(K.w.mul(1.5)), sin(a).mul(r)));
      sm.material.blending = THREE.NormalBlending;
      const col = mix(vec3(0.05, 0.02, 0.08), vec3(1, 0.5, 0.28), uHeart.mul(K.y.mul(0.8)));
      sm.material.colorNode = vec4(col, sm.round.mul(smoothstep(0, 0.15, life)).mul(float(1).sub(life)).mul(float(0.5).sub(uHeart.mul(0.25))));
      g.add(sm.cloud.sprite);
      ours.push(sm.material);
      tickers.push(() => (sm.cloud.sprite.visible = shadowGo));
      // the light opening: rings of warmth spreading over the floor from between them
      const rg = new THREE.PlaneGeometry(22, 22);
      rg.rotateX(-Math.PI / 2);
      const rm = keepAlpha(new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, fog: false }));
      const q = uv().sub(0.5).mul(22);
      const rr = length(q);
      let rings: N = float(0);
      for (let k = 0; k < 3; k++) {
        const front = fract(clock.u.mul(0.08).add(k / 3)).mul(10);
        rings = rings.add(exp(rr.sub(front).mul(rr.sub(front)).mul(-3)).mul(smoothstep(10, 3, front)));
      }
      const pool = exp(rr.mul(rr).mul(-0.08));
      rm.colorNode = vec4(vec3(1, 0.72, 0.42).mul(rings.mul(0.35).add(pool.mul(0.5))).mul(uHeart), 1);
      const ring = new THREE.Mesh(rg, rm);
      ring.position.set((travelerAt.x + shadowTo.x) / 2, 0.05, CRU_C.z + 3.2);
      g.add(ring);
      ours.push(rg, rm);
      const st = pointCloud(500, 0.12);
      for (let i = 0; i < 500; i++) st.k.set([R(), R(), R(), R()], i * 4);
      touch(st.cloud);
      const SK = st.cloud.nodes.aK;
      const f = fract(SK.x.add(clock.u.mul(0.22)));
      const from = vec3(travelerAt.x, 1.3, travelerAt.z), to = vec3(shadowTo.x, 2.9, shadowTo.z);
      st.material.positionNode = mix(from, to, f).add(vec3(0, sin(f.mul(Math.PI)).mul(0.8), sin(SK.y.mul(30).add(f.mul(9))).mul(0.25)));
      st.material.colorNode = vec4(vec3(1, 0.8, 0.5).mul(st.round).mul(sin(f.mul(Math.PI))).mul(uHeart).mul(1.2), 1);
      g.add(st.cloud.sprite);
      ours.push(st.material);
      const wl = new THREE.PointLight(0xffb070, 0, 16, 2);
      wl.position.set(ring.position.x, 2.2, ring.position.z);
      g.add(wl);
      tickers.push(() => (wl.intensity = 260 * uHeart.value));
    }

    tickers.push((dt: number) => {
      const d = Math.min(0.05, Math.max(0, dt));
      clock.tick(d);
      applyAir(air);
      uRings.value = damp(uRings.value, goal.rings, 0.9, d);
      if (climbing) uClimb.value = Math.min(1.25, uClimb.value + d / 14);
      if (descending) uDesc.value = uDesc.value > -0.5 ? uDesc.value - d / 16 : -1;
      uRed.value = damp(uRed.value, goal.red, 0.4, d);
      uBlue.value = damp(uBlue.value, goal.blue, 0.4, d);
      uStill.value = damp(uStill.value, goal.still, 0.3, d);
      uForge.value = damp(uForge.value, goal.forge, 0.25, d);
      uCool.value = damp(uCool.value, goal.cool, 0.12, d);
      uLure.value = damp(uLure.value, goal.lure, 0.2, d);
      uHeart.value = damp(uHeart.value, goal.heart, 0.2, d);
      uWomb.value = damp(uWomb.value, goal.womb, 0.12, d);
      // the shadow walks in from its arch to the crucible, then stands
      const [light, shadow] = folk.bodies;
      if (shadow) {
        if (shadowGo && shadowK < 1) {
          shadowK = Math.min(1, shadowK + d / 17);
          if (shadowK >= 1) shadow.act("idle");
        }
        shadow.root.position.lerpVectors(shadowFrom, shadowTo, shadowK);
        shadowAt.value.copy(shadow.root.position);
        shadow.root.visible = shadowGo;
        // welcomed, its darkness warms (but it stays itself)
        shadow.mat.emissive.setRGB(0.32, 0.2, 0.5).lerp(warmTint, uHeart.value * 0.55);
      }
      if (light && uHeart.value > 0.5 && !welcomed) (welcomed = true), light.act("reach", 0.6);
      if (light) light.root.rotation.y = shadowGo ? -Math.PI / 2 : -Math.PI / 2 - 0.3 + Math.sin(clock.u.value * 0.2) * 0.1;
      folk.update(d);
    });
  };

  const opts: LessonOpts = {
    id: "adept_crucible",
    trackId: "audio/adept/adept_2_the_crucible.mp3",
    seatPos,
    seatHeading: 0,
    build,
    authoredSecs: 320, // beats written against the script's length; they follow the recording
    beats: [
      // "Imagine a tower of seven chambers": the body, desire, power, the heart, the voice, seeing, knowing
      { t: 22, apply: () => (goal.rings = 1) },
      { t: 28, apply: () => (goal.rings = 2) },
      { t: 34, apply: () => (goal.rings = 3) },
      { t: 40, apply: () => (goal.rings = 4) },
      { t: 46, apply: () => (goal.rings = 5) },
      { t: 51, apply: () => (goal.rings = 6) },
      { t: 56, apply: () => (goal.rings = 7) },
      // "You cannot skip… from the ground up"
      { t: 64, apply: () => ((uClimb.value = -0.1), (climbing = true)) },
      // "A goddess descended to the underworld through seven gates"
      { t: 84, apply: () => ((uDesc.value = 1), (descending = true)) },
      // "Magnify it deliberately… then its exact opposite… Then let go of both"
      { t: 108, apply: () => (goal.red = 1) },
      { t: 116, apply: () => (goal.blue = 1) },
      { t: 123, apply: () => ((goal.red = 0), (goal.blue = 0), (goal.still = 1)) },
      // "There is a monster in every traveler… Do not slay it. Welcome it."
      { t: 134, apply: () => ((shadowGo = true), (goal.still = 0.3)) },
      // "Invite it into your heart, and ask this horror to be absorbed into love."
      { t: 153, apply: () => (goal.heart = 1) },
      // "There is a shortcut, and it looks easier"
      { t: 190, apply: () => (goal.lure = 1) },
      // "Faith. Not certainty."
      { t: 237, apply: () => ((goal.lure = 0), (goal.forge = 0.5)) },
      // "…they called the cell a furnace."
      { t: 270, apply: () => (goal.forge = 1.3) },
      // "It ends the way metal ends in fire, changed."
      { t: 285, apply: () => ((goal.cool = 1), (goal.forge = 0.6)) },
      // "something is gestating. Not built. Born."
      { t: 302, apply: () => (goal.womb = 1) },
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
    folk.dispose();
    for (const d of ours) d.dispose();
    ours.length = 0;
    tickers.length = 0;
  };
  return Object.assign(lesson, { loaded: folk.loaded });
}
