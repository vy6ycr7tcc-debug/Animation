/* The ancient practices, the second chamber: pyramids, temples and geometry. Sunrise over a desert
   of low dunes; far ahead the great pyramid, real mountains on the horizon beyond it (why build a
   mountain by hand?). Told as the narration tells it: as a telling, never as proven.

   The chamber within intensifies what is brought: a warm light gathers in the pyramid's heart,
   shown through its stone. The portable chamber: a figure of light stands on the sand inside the
   thin outline of a small pyramid of light, which grows brighter. The temples became schools: the
   twenty-two cards rise in an arc of fine gold outlines, the star map is drawn over the sky, the Tree
   of Life hangs in the air (ten lights and their paths). The shapes repeat: round the horizon, one
   after another, other builders' forms light in outline: a stepped pyramid, a domed stupa, a
   tall cone, a circle of standing stones, a spiral laid on the ground. Then fine arcs of light join
   each to the great pyramid: one grammar. At the end the great pyramid quiets and the small chamber
   round the figure is the brightest thing in the desert: the climber, not the mountain. */
import * as THREE from "three/webgpu";
import { LessonScene } from "../lessonKit";
import type { LessonCtx, LessonOpts, SceneModule } from "../lessonKit";
import { T, vnoise, type N } from "../../gpu/tsl";
import { ribbonGeometry, ribbonMaterial } from "../../gpu/ribbons";
import { landStone } from "../../world/stoneworks";
import { GlassFolk } from "../glassFolk";
import { applyAir, damp, merge, pointCloud, roomClock, scannedGround, seeded, skyDome, touch, type Air, roomPos } from "../densities/roomKit";

const { exp, float, length, max, mix, pow, smoothstep, uniform, vec3, vec4 } = T;

/** Room frame: start at the origin facing −z; the great pyramid far ahead. */
const PYR = new THREE.Vector3(0, 0, -170);
const PYR_HALF = 62, PYR_H = 78;
const SUN = new THREE.Vector3(0.75, 0.07, -0.66).normalize();
export const PYR_DOOR = new THREE.Vector3(11, 0, -30);

/** The dunes: low and long, the way ahead nearly level. */
export function dunesFloor(x: number, z: number): number {
  const swell = Math.sin(x * 0.045 + z * 0.02) * 1.3 + Math.sin(x * 0.11 - z * 0.07 + 1.3) * 0.5;
  return swell * Math.min(1, Math.max(0, (Math.abs(x) - 5) / 18));
}

/** Pairs for ribbons along a geometry's hard edges. */
function edgePairs(g: THREE.BufferGeometry, angle = 20): number[] {
  const e = new THREE.EdgesGeometry(g, angle);
  const a = Array.from(e.attributes.position.array as Float32Array);
  e.dispose();
  return a;
}

export function createPyramidsScene(scene: THREE.Scene, narration: LessonCtx["narration"], whisper: (t: string, ms?: number) => void): SceneModule {
  const seatPos = new THREE.Vector3(0, 0, 0);
  const tickers: Array<(dt: number) => void> = [];
  const ours: Array<{ dispose(): void }> = [];
  const clock = roomClock();
  const uChamber = uniform(0); // the light gathered in the pyramid's heart
  const uPortable = uniform(0); // the small chamber of light round the figure
  const uCards = uniform(0), uStars = uniform(0), uTree = uniform(0); // the schools' instruments
  const uShapes = uniform(0); // the other builders' forms, 0 … 5
  const uJoin = uniform(0); // one grammar
  const uRise = uniform(0.2); // the morning
  const goal = { chamber: 0, portable: 0, cards: 0, stars: 0, tree: 0, shapes: 0, join: 0, rise: 0.2 };
  const air: Air = {
    color: new THREE.Color(0.32, 0.26, 0.24),
    glow: new THREE.Color(0.9, 0.55, 0.3),
    glowDir: SUN.clone(),
    density: 0.0016,
    shadow: new THREE.Color(0.03, 0.03, 0.06),
    sat: 1.05,
    contrast: 1.05,
  };
  const R = seeded(1777);
  const folk = new GlassFolk([{ x: -3.5, z: -12, face: 0.35, act: "idle", tint: new THREE.Color(1, 0.9, 0.72) }], 11);
  const lines: { mesh: THREE.Mesh; dispose(): void }[] = [];
  /** Fine lines of light in `col`, shown by `k`. */
  const drawn = (pairs: number[], col: [number, number, number], k: N, px = 0.8) => {
    const geo = ribbonGeometry(pairs);
    const m = ribbonMaterial(vec3(...col).mul(k), px);
    const mesh = new THREE.Mesh(geo, m);
    lines.push({ mesh, dispose: () => (geo.dispose(), m.dispose()) });
    return mesh;
  };

  const build = (ctx: LessonCtx) => {
    const g = ctx.group;
    // sunrise: a pale gold low in the east, a deep blue still overhead
    {
      const sky = skyDome(1600, new THREE.Color(0.62, 0.46, 0.38), new THREE.Color(0.1, 0.16, 0.34), {
        glowDir: SUN,
        glow: new THREE.Color(0.95, 0.55, 0.25),
        glowPow: 7,
        extra: (d, c) => {
          const cosA = T.dot(d, vec3(SUN.x, SUN.y, SUN.z));
          const disc = smoothstep(0.9992, 0.9995, cosA);
          return c.mul(mix(float(0.65), float(1), uRise)).add(vec3(1, 0.85, 0.6).mul(disc.mul(2).add(pow(max(cosA, 0), 80).mul(0.4))));
        },
      });
      g.add(sky.mesh);
      ours.push(sky);
    }
    // the desert and the far mountains
    {
      const geo = new THREE.PlaneGeometry(900, 900, 200, 200);
      geo.rotateX(-Math.PI / 2);
      geo.translate(0, 0, -200);
      const p = geo.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < p.count; i++) p.setY(i, dunesFloor(p.getX(i), p.getZ(i)));
      geo.computeVertexNormals();
      const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.95, metalness: 0 });
      const scan = scannedGround("sand", 2.4, { hue: 0.4, relief: 1.2, bright: 1.7 });
      const ripple = vnoise(roomPos.xz.mul(T.vec2(0.9, 0.25))).mul(0.12).add(0.94);
      m.colorNode = vec3(0.62, 0.48, 0.34).mul(scan.color).mul(ripple);
      m.normalNode = scan.normal;
      const ground = new THREE.Mesh(geo, m);
      ground.receiveShadow = true;
      g.add(ground);
      ours.push(geo, m);
      // mountains: a jagged ring far off
      const mg = new THREE.CylinderGeometry(1300, 1300, 1, 160, 1, true);
      const mp = mg.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < mp.count; i++) {
        const x = mp.getX(i), z = mp.getZ(i), top = mp.getY(i) > 0;
        const a = Math.atan2(z, x);
        const h = 40 + 90 * Math.pow(Math.abs(Math.sin(a * 5.3) * Math.cos(a * 2.1 + 1)), 1.4) + 30 * Math.abs(Math.sin(a * 17));
        mp.setY(i, top ? h : -10);
      }
      mg.computeVertexNormals();
      const mm = new THREE.MeshBasicNodeMaterial({ fog: true, side: THREE.DoubleSide });
      mm.colorNode = vec4(mix(vec3(0.34, 0.26, 0.28), vec3(0.5, 0.36, 0.3), uRise), 1);
      g.add(new THREE.Mesh(mg, mm));
      ours.push(mg, mm);
    }
    // the great pyramid: its casing, and the light gathering at its heart shown through the stone
    {
      const geo = new THREE.ConeGeometry(PYR_HALF * Math.SQRT2, PYR_H, 4, 12);
      geo.rotateY(Math.PI / 4);
      geo.translate(PYR.x, PYR_H / 2, PYR.z);
      const m = landStone("sandstone_blocks_05", 0, 4, [1.02, 0.94, 0.84]);
      const heart = new THREE.Vector3(PYR.x, PYR_H * 0.38, PYR.z);
      const d = length(roomPos.sub(vec3(heart.x, heart.y, heart.z)));
      m.emissiveNode = vec3(1, 0.62, 0.28).mul(exp(d.mul(d).mul(-0.0011))).mul(uChamber).mul(2.0);
      const mesh = new THREE.Mesh(geo, m);
      mesh.castShadow = mesh.receiveShadow = true;
      g.add(mesh);
      ours.push(geo, m);
    }
    // the portable chamber: a small pyramid of light round the figure
    {
      const pg = new THREE.ConeGeometry(1.9 * Math.SQRT2, 3.4, 4, 1);
      pg.rotateY(Math.PI / 4);
      pg.translate(-3.5, 1.7 + dunesFloor(-3.5, -12), -12);
      g.add(drawn(edgePairs(pg), [1, 0.85, 0.55], uPortable, 1));
      pg.dispose();
    }
    // the schools: the cards in an arc, the star map, the Tree of Life
    {
      const pairs: number[] = [];
      for (let i = 0; i < 22; i++) {
        const a = -0.9 + (i / 21) * 1.8, r = 26;
        const cx = Math.sin(a) * r, cz = -40 - Math.cos(a) * r * 0.4, cy = 9 + Math.sin((i / 21) * Math.PI) * 5;
        const w = 0.9, h = 1.5, ux = Math.cos(a), uz = Math.sin(a) * 0.4;
        const c = [[-w, -h], [w, -h], [w, h], [-w, h]].map(([x, y]) => [cx + x * ux * 0.7, cy + y * 0.7, cz + x * uz * 0.7]);
        for (let k = 0; k < 4; k++) pairs.push(...c[k], ...c[(k + 1) % 4]);
      }
      g.add(drawn(pairs, [1, 0.8, 0.45], uCards, 0.9));
      // the star map: constellation lines across the western sky
      const sp: number[] = [];
      let prev: THREE.Vector3 | null = null;
      for (let i = 0; i < 70; i++) {
        const a = -2.6 + R() * 2.2, e = 0.35 + R() * 0.5, r = 700;
        const p = new THREE.Vector3(Math.sin(a) * Math.cos(e) * r, Math.sin(e) * r, -Math.cos(a) * Math.cos(e) * r);
        if (prev && prev.distanceTo(p) < 170 && R() < 0.8) sp.push(prev.x, prev.y, prev.z, p.x, p.y, p.z);
        prev = p;
      }
      g.add(drawn(sp, [0.8, 0.88, 1], uStars, 0.8));
      const stars = pointCloud(sp.length / 3, 4);
      for (let i = 0; i < sp.length / 3; i++) stars.pos.set([sp[i * 3], sp[i * 3 + 1], sp[i * 3 + 2]], i * 3);
      touch(stars.cloud);
      stars.material.colorNode = vec4(vec3(0.9, 0.93, 1).mul(stars.round).mul(uStars), 1);
      g.add(stars.cloud.sprite);
      ours.push(stars.material);
      // the Tree of Life: ten lights and twenty-two paths, hanging to the left
      const S: [number, number][] = [[0, 4], [1, 3.3], [-1, 3.3], [1, 2.3], [-1, 2.3], [0, 1.8], [1, 0.9], [-1, 0.9], [0, 0.45], [0, -0.4]];
      const P: [number, number][] = [[0, 1], [0, 2], [1, 2], [0, 5], [1, 3], [1, 5], [2, 4], [2, 5], [3, 4], [3, 5], [4, 5], [3, 6], [4, 7], [5, 6], [5, 7], [5, 8], [6, 7], [6, 8], [7, 8], [6, 9], [7, 9], [8, 9]];
      const base = new THREE.Vector3(-22, 6, -48), sc = 3.2;
      const at = (i: number) => new THREE.Vector3(base.x + S[i][0] * sc, base.y + S[i][1] * sc, base.z);
      const tp: number[] = [];
      for (const [a, b] of P) tp.push(...at(a).toArray(), ...at(b).toArray());
      g.add(drawn(tp, [1, 0.85, 0.6], uTree, 0.8));
      const orbs = pointCloud(10, 1.1);
      for (let i = 0; i < 10; i++) orbs.pos.set(at(i).toArray(), i * 3);
      touch(orbs.cloud);
      orbs.material.colorNode = vec4(vec3(1, 0.92, 0.75).mul(orbs.round).mul(uTree), 1);
      g.add(orbs.cloud.sprite);
      ours.push(orbs.material);
    }
    // the other builders' forms round the horizon, each lit in turn, and the arcs that join them
    {
      const forms: THREE.BufferGeometry[] = [];
      const places: THREE.Vector3[] = [];
      const ring = [-1.15, -0.62, 0.55, 1.1, 1.55];
      ring.forEach((a, i) => {
        const r = 190 + (i % 2) * 40;
        const x = Math.sin(a) * r, z = -Math.cos(a) * r - 20;
        places.push(new THREE.Vector3(x, 0, z));
        const parts: THREE.BufferGeometry[] = [];
        if (i === 0) {
          // a stepped pyramid with a shrine on top
          for (let k = 0; k < 5; k++) {
            const b = new THREE.BoxGeometry(40 - k * 7, 5, 40 - k * 7);
            b.translate(0, 2.5 + k * 5, 0);
            parts.push(b);
          }
          const s = new THREE.BoxGeometry(6, 5, 6);
          s.translate(0, 27.5, 0);
          parts.push(s);
        } else if (i === 1) {
          // a stupa: a drum, a dome, a square harmika, a spire of rings
          const drum = new THREE.CylinderGeometry(15, 16, 4, 32);
          drum.translate(0, 2, 0);
          const dome = new THREE.SphereGeometry(13, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2);
          dome.translate(0, 4, 0);
          const h = new THREE.BoxGeometry(4, 3, 4);
          h.translate(0, 18.5, 0);
          const sp = new THREE.ConeGeometry(1.8, 12, 12);
          sp.translate(0, 26, 0);
          parts.push(drum, dome, h, sp);
        } else if (i === 2) {
          // a tall cone of a tower
          const c = new THREE.ConeGeometry(9, 46, 24);
          c.translate(0, 23, 0);
          parts.push(c);
        } else if (i === 3) {
          // a circle of standing stones with lintels
          for (let k = 0; k < 14; k++) {
            const b = Math.PI * 2 * (k / 14);
            const s = new THREE.BoxGeometry(2.2, 8, 1.3);
            s.applyMatrix4(new THREE.Matrix4().makeRotationY(-b).setPosition(Math.cos(b) * 15, 4, Math.sin(b) * 15));
            parts.push(s);
            if (k % 2 === 0) {
              const l = new THREE.BoxGeometry(7.5, 1.2, 1.4);
              l.applyMatrix4(new THREE.Matrix4().makeRotationY(-b - Math.PI / 14 + Math.PI / 2).setPosition(Math.cos(b + Math.PI / 14) * 15, 8.6, Math.sin(b + Math.PI / 14) * 15));
              parts.push(l);
            }
          }
        } else {
          // a spiral mound: a low round hill, a spiral path wound up it
          const m = new THREE.ConeGeometry(22, 9, 32, 1);
          m.translate(0, 4.5, 0);
          parts.push(m);
        }
        const merged = merge(parts);
        merged.translate(x, dunesFloor(x, z) - 0.5, z);
        forms.push(merged);
        // its outline in light, lit in turn
        const k = smoothstep(i + 0.1, i + 0.9, uShapes);
        g.add(drawn(edgePairs(merged, 30), [1, 0.82, 0.5], k.mul(1.4), 1.6));
        if (i === 4) {
          const sp: number[] = [];
          let prev: THREE.Vector3 | null = null;
          for (let s = 0; s <= 240; s++) {
            const f = s / 240, a2 = f * Math.PI * 10, rr = 21 * (1 - f);
            const p = new THREE.Vector3(x + Math.cos(a2) * rr, dunesFloor(x, z) - 0.3 + 9 * f + 0.3, z + Math.sin(a2) * rr);
            if (prev) sp.push(...prev.toArray(), ...p.toArray());
            prev = p;
          }
          g.add(drawn(sp, [1, 0.82, 0.5], k.mul(1.4), 1.6));
        }
      });
      const fm = landStone("sandstone_blocks_05", 0, 4, [0.95, 0.86, 0.78]);
      const fmesh = new THREE.Mesh(merge(forms), fm);
      g.add(fmesh);
      ours.push(fm, fmesh.geometry);
      // one grammar: fine arcs from each form to the great pyramid's apex
      const ap: number[] = [];
      const apex = new THREE.Vector3(PYR.x, PYR_H, PYR.z);
      for (const p of places) {
        let prev: THREE.Vector3 | null = null;
        for (let s = 0; s <= 40; s++) {
          const f = s / 40;
          const q = new THREE.Vector3().lerpVectors(p.clone().setY(30), apex, f);
          q.y += Math.sin(f * Math.PI) * 60;
          if (prev) ap.push(...prev.toArray(), ...q.toArray());
          prev = q;
        }
      }
      g.add(drawn(ap, [1, 0.9, 0.7], uJoin.mul(0.6), 0.8));
    }
    // the way on: a doorway of cut stone in the sand
    {
      const parts: THREE.BufferGeometry[] = [];
      const y = dunesFloor(PYR_DOOR.x, PYR_DOOR.z);
      for (const dx of [-2, 2]) {
        const b = new THREE.BoxGeometry(1, 5.4, 1.1);
        b.translate(PYR_DOOR.x + dx, y + 2.7, PYR_DOOR.z);
        parts.push(b);
      }
      const l = new THREE.BoxGeometry(5.4, 1, 1.3);
      l.translate(PYR_DOOR.x, y + 5.9, PYR_DOOR.z);
      parts.push(l);
      const m = landStone("sandstone_blocks_05", 0, 1.8);
      const mesh = new THREE.Mesh(merge(parts), m);
      mesh.castShadow = true;
      g.add(mesh);
      const dg = new THREE.PlaneGeometry(3, 5.4);
      dg.translate(PYR_DOOR.x, y + 2.7, PYR_DOOR.z - 0.2);
      const dm = new THREE.MeshBasicNodeMaterial({ fog: false, side: THREE.DoubleSide });
      dm.colorNode = vec4(mix(vec3(1, 0.8, 0.5), vec3(0.5, 0.4, 0.3), T.uv().y).mul(0.4), 1);
      g.add(new THREE.Mesh(dg, dm));
      ours.push(m, mesh.geometry, dg, dm);
    }
    for (const l of lines) g.add(l.mesh);
    g.add(folk.group);
    // the low sun
    const sun = new THREE.DirectionalLight(0xffd8a8, 1.5);
    sun.position.set(SUN.x * 200, 40, SUN.z * 200);
    sun.target.position.set(0, 0, -20);
    sun.castShadow = true;
    g.add(sun, sun.target);

    tickers.push((dt: number) => {
      const d = Math.min(0.05, Math.max(0, dt));
      clock.tick(d);
      applyAir(air);
      uChamber.value = damp(uChamber.value, goal.chamber, 0.2, d);
      uPortable.value = damp(uPortable.value, goal.portable, 0.2, d);
      uCards.value = damp(uCards.value, goal.cards, 0.25, d);
      uStars.value = damp(uStars.value, goal.stars, 0.2, d);
      uTree.value = damp(uTree.value, goal.tree, 0.25, d);
      uShapes.value = damp(uShapes.value, goal.shapes, 0.7, d);
      uJoin.value = damp(uJoin.value, goal.join, 0.15, d);
      uRise.value = damp(uRise.value, goal.rise, 0.03, d);
      sun.intensity = 0.8 + 2.2 * uRise.value;
      folk.update(d);
    });
  };

  const opts: LessonOpts = {
    id: "practice_pyramids",
    trackId: "audio/adept/practice_pyramids.mp3",
    seatPos,
    seatHeading: 0,
    build,
    beats: [
      { t: 3, apply: () => (goal.rise = 0.5) },
      // "Enter it, the teaching says, and whatever you carry in gets louder"
      { t: 50, apply: () => (goal.chamber = 1) },
      // "a person whose inner life is clear and steady… is in effect a portable King's Chamber"
      { t: 92, apply: () => ((goal.portable = 1), (goal.chamber = 0.6)) },
      // "The cards you know as the tarot. The mapping of the stars. The Tree of Life"
      { t: 142, apply: () => (goal.cards = 1) },
      { t: 147, apply: () => ((goal.stars = 1), (goal.rise = 0.75)) },
      { t: 151, apply: () => (goal.tree = 1) },
      // "The shapes repeat… they appear in places that never met"
      { t: 180, apply: () => ((goal.shapes = 1), (goal.cards = 0.3), (goal.tree = 0.4), (goal.stars = 0.4)) },
      { t: 186, apply: () => (goal.shapes = 2) },
      { t: 192, apply: () => (goal.shapes = 3) },
      { t: 198, apply: () => (goal.shapes = 4) },
      { t: 204, apply: () => (goal.shapes = 5) },
      // "Different vocabularies, one grammar."
      { t: 240, apply: () => ((goal.join = 1), (goal.rise = 1)) },
      // "what you were looking for in the mountain had been growing in you all along"
      { t: 280, apply: () => ((goal.chamber = 0.15), (goal.portable = 1.6), (goal.join = 0.4)) },
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
    for (const l of lines) l.dispose();
    for (const d of ours) d.dispose();
    ours.length = 0;
    tickers.length = 0;
  };
  return Object.assign(lesson, { loaded: folk.loaded });
}
