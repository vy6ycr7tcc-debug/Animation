/* The fifth density: wisdom. The owner's direction (2026-10-01): "one magician on a pitch-black
   sky, glowing physics and formulas" (it replaces the thread-planet, the earlier "connected
   people"). The narration is about the solitary seeker; wisdom is the light it learns to read.

   Pitch black above, a dark polished floor below. At the heart one figure of cool light stands
   with its arms raised, a magician of the knowing kind: its own glow is the only light. Around it
   the physics of the world is written into the dark in light, formula after formula, each drawn
   left to right by a small pen of light, then drifting up and outward and fading as the next is
   written; over its head an atom of three orbits turns; a golden spiral is drawn on beside it; a
   wave runs across the dark behind.

   As the narration goes: it wakes and the first formulas are written (28); solitude: fewer, a
   ring of stillness round it (70); "light… the primary substance": the writing quickens, the
   wave and the spiral appear (104); discernment: the formulas fall into order round it, an orbit
   of knowledge (146); the warning, "wisdom without love can become a trap": everything goes cold
   and slows, the writing stops (188); "it is love, being tempered": a warm light kindles at its
   heart and the formulas warm to gold (230); brightest, and the way on opens (254). The draft
   recording (`audio/densities/density_5.mp3`) and the room's interface are unchanged: the seat
   at the origin facing −z, the silver door at z −60. Formulas are well-known physics, written as
   physics is written; no words of our own. */
import type { Solid } from "../journey";
import * as THREE from "three/webgpu";
import { LessonScene } from "../lessonKit";
import type { LessonCtx, Beat } from "../lessonKit";
import type { Narration } from "../../core/narration";
import { T } from "../../gpu/tsl";
import { ribbonGeometry, ribbonMaterial } from "../../gpu/ribbons";
import { landStone } from "../../world/stoneworks";
import { GlassFolk } from "../glassFolk";
import { applyAir, damp, keepAlpha, pointCloud, roomClock, seeded, touch, type Air } from "./roomKit";

const { float, mix, sin, smoothstep, uniform, uv, vec2, vec3, vec4 } = T;
type U = ReturnType<typeof uniform>;

/** Room frame: you begin at the origin facing −z; the magician stands at the heart. */
export const MAGE = new THREE.Vector3(0, 0, -12);
/** Where the way on stands, beyond. */
export const WISDOM_DOOR = new THREE.Vector3(0, 0, -60);

const FORMULAS = [
  "E = mc²",
  "F = ma",
  "E = hν",
  "iħ ∂ψ/∂t = Ĥψ",
  "∇ · E = ρ / ε₀",
  "∇ × B = μ₀J + μ₀ε₀ ∂E/∂t",
  "G_μν = 8πG T_μν",
  "e^{iπ} + 1 = 0",
  "S = k ln W",
  "Δx Δp ≥ ħ / 2",
  "λ = h / p",
  "F = G m₁m₂ / r²",
  "c = 1 / √(μ₀ε₀)",
  "φ = (1 + √5) / 2",
  "ds² = −c²dt² + dx²",
  "∮ B · dl = μ₀ I",
  "a² + b² = c²",
  "PV = nRT",
];
const ROW_H = 96, ATLAS_W = 1024;

/** The formulas, drawn once into one atlas: each a row of soft white writing. */
function formulaAtlas(): { tex: THREE.CanvasTexture; widths: number[] } {
  const c = document.createElement("canvas");
  c.width = ATLAS_W;
  c.height = ROW_H * FORMULAS.length;
  const g = c.getContext("2d")!;
  g.fillStyle = "#000";
  g.fillRect(0, 0, c.width, c.height);
  g.font = `italic 58px "Times New Roman", Georgia, serif`;
  g.textBaseline = "middle";
  const widths: number[] = [];
  FORMULAS.forEach((f, i) => {
    const w = Math.min(ATLAS_W - 40, g.measureText(f).width);
    widths.push((w + 40) / ATLAS_W);
    g.shadowColor = "rgba(255,255,255,0.9)";
    g.shadowBlur = 10;
    g.fillStyle = "#fff";
    g.fillText(f, 20, i * ROW_H + ROW_H / 2, ATLAS_W - 40);
  });
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.NoColorSpace;
  tex.anisotropy = 4;
  return { tex, widths };
}

interface Written {
  sprite: THREE.Sprite;
  u: { row: U; width: U; reveal: U; k: U };
  born: number;
  at: THREE.Vector3;
  drift: THREE.Vector3;
  size: number;
  live: boolean;
}

export function createDensity5Scene(scene: THREE.Scene, narration: Narration, whisper: (text: string, ms?: number) => void): LessonScene {
  const seatPos = new THREE.Vector3(0, 0, 0);
  const tickers: Array<(dt: number) => void> = [];
  const ours: Array<{ dispose(): void }> = [];
  const clock = roomClock();
  const t = clock.u;
  const uWake = uniform(0.2); // the magician's own light, and the writing at all
  const uLight = uniform(0); // light named: the wave and the spiral
  const uOrder = uniform(0); // discernment: the formulas in order round it
  const uCold = uniform(0); // the warning: cold, slow, stilled
  const uLove = uniform(0); // tempered by love: warm at the heart, the writing gold
  const uDoor = uniform(0.2);
  const goal = { wake: 0.2, light: 0, order: 0, cold: 0, love: 0, door: 0.2, rate: 0 };
  let rate = 0; // formulas begun per second
  const air: Air = {
    color: new THREE.Color(0, 0, 0),
    glow: new THREE.Color(0.02, 0.025, 0.04),
    glowDir: new THREE.Vector3(0, 1, 0),
    density: 0.004,
    shadow: new THREE.Color(0, 0, 0),
    sat: 0.95,
    contrast: 1.1,
  };
  const R = seeded(505);
  // the magician: arms raised, cool light, a little larger than life
  const mage = new GlassFolk([{ x: MAGE.x, z: MAGE.z, face: Math.PI, act: "reach", tint: new THREE.Color(0.8, 0.9, 1), glow: { inner: 0.45, edge: 1.0, body: 0.4 }, scale: 1.55 }], 5);

  const build = (ctx: LessonCtx) => {
    const g = ctx.group;
    // the floor: dark polished stone under the pitch-black sky (no sky drawn: the dark is the sky)
    {
      const geo = new THREE.CircleGeometry(90, 96);
      geo.rotateX(-Math.PI / 2);
      geo.translate(0, 0, -30);
      const m = landStone("red_sandstone_pavement", 0, 3, [0.02, 0.022, 0.03], { flag: 1.4 });
      m.roughnessNode = float(0.85); // matte: no glare sliding over the floor
      const mesh = new THREE.Mesh(geo, m);
      mesh.receiveShadow = true;
      g.add(mesh);
      ours.push(geo, m);
      // a thin silver circle round where it stands
      const pairs: number[] = [];
      for (const r of [3.2, 3.4]) {
        const n = 128;
        for (let i = 0; i < n; i++) {
          const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2;
          pairs.push(MAGE.x + Math.sin(a0) * r, 0.03, MAGE.z + Math.cos(a0) * r, MAGE.x + Math.sin(a1) * r, 0.03, MAGE.z + Math.cos(a1) * r);
        }
      }
      const rg = ribbonGeometry(pairs), rm = ribbonMaterial(mix(vec3(0.7, 0.8, 1), vec3(1, 0.8, 0.5), uLove).mul(uWake.mul(0.4)), 0.7);
      g.add(new THREE.Mesh(rg, rm));
      ours.push(rg, rm);
    }
    // its light on the stone round it, and the warmth that kindles at its heart
    const cool = new THREE.PointLight(0xc8d8ff, 0, 22, 2);
    cool.position.set(MAGE.x, 3.2, MAGE.z + 1.5);
    const warm = new THREE.PointLight(0xffb066, 0, 18, 2);
    warm.position.set(MAGE.x, 2.2, MAGE.z + 0.8);
    g.add(cool, warm);
    g.add(mage.group);
    {
      const s = pointCloud(1, 1.6);
      s.pos.set([MAGE.x, 2.15, MAGE.z + 0.15]);
      touch(s.cloud);
      s.material.colorNode = vec4(vec3(1, 0.7, 0.4).mul(s.round).mul(uLove).mul(sin(t.mul(1.2)).mul(0.15).add(0.85)).mul(0.9), 1);
      g.add(s.cloud.sprite);
      ours.push(s.material);
    }

    /* ---------------- the formulas, written into the dark ---------------- */
    const atlas = formulaAtlas();
    ours.push(atlas.tex);
    const written: Written[] = [];
    const COLD = vec3(0.72, 0.84, 1), GOLD = vec3(1, 0.82, 0.48);
    for (let i = 0; i < 12; i++) {
      const u = { row: uniform(0), width: uniform(0.5), reveal: uniform(0), k: uniform(0) };
      const m = keepAlpha(new THREE.SpriteNodeMaterial({ transparent: true, depthWrite: false, fog: false }));
      const q = uv();
      // sample this formula's row; reveal it left to right, the pen's edge a little brighter
      const x = q.x.mul(u.width);
      const y = float(1).sub(u.row.add(float(1).sub(q.y)).div(FORMULAS.length));
      const ink = T.texture(atlas.tex, vec2(x, y)).r;
      const shown = smoothstep(u.reveal.add(0.02), u.reveal.sub(0.02), q.x);
      const edge = smoothstep(0.06, 0, T.abs(q.x.sub(u.reveal))).mul(smoothstep(0.999, 0.9, u.reveal));
      const col = mix(mix(COLD, GOLD, uLove), vec3(0.55, 0.65, 0.85), uCold.mul(float(1).sub(uLove)));
      m.colorNode = vec4(col.mul(ink.mul(shown).mul(float(1).add(edge.mul(2)))).mul(u.k).mul(0.9), 1);
      const sprite = new THREE.Sprite(m);
      sprite.visible = false;
      g.add(sprite);
      ours.push(m);
      written.push({ sprite, u, born: -99, at: new THREE.Vector3(), drift: new THREE.Vector3(), size: 1, live: false });
    }
    // the pen: a small point of light at the writing's edge
    const pen = pointCloud(1, 0.35);
    pen.pos.set([0, 0, 0]);
    touch(pen.cloud);
    const uPen = uniform(0);
    pen.material.colorNode = vec4(mix(vec3(0.85, 0.92, 1), vec3(1, 0.85, 0.55), uLove).mul(pen.round).mul(uPen), 1);
    g.add(pen.cloud.sprite);
    ours.push(pen.material);
    let nextRow = 0, since = 0;
    const tmp = new THREE.Vector3();
    const spawn = (): void => {
      const w = written.find((x) => !x.live);
      if (!w) return;
      const row = nextRow++ % FORMULAS.length;
      w.u.row.value = row;
      w.u.width.value = atlas.widths[row];
      w.size = 1.0 + R() * 0.6;
      // a place in the dark round it, never between you and it
      const a = (R() - 0.5) * Math.PI * 1.5 + (R() < 0.5 ? 0 : Math.PI);
      const rad = 4.2 + R() * 5;
      w.at.set(MAGE.x + Math.sin(a) * rad, 2.2 + R() * 7, MAGE.z - Math.abs(Math.cos(a)) * rad * 0.8 - 1);
      w.drift.set((R() - 0.5) * 0.25, 0.12 + R() * 0.15, -0.05 - R() * 0.1);
      w.born = clock.u.value;
      w.live = true;
      w.sprite.visible = true;
    };

    /* ---------------- the geometry of the world: an atom, a golden spiral, a wave ---------------- */
    // the atom over its head: three orbits turning, a nucleus of light
    const atom = new THREE.Group();
    atom.position.set(MAGE.x, 5.6, MAGE.z);
    g.add(atom);
    {
      const pairs: number[] = [];
      for (let k = 0; k < 3; k++) {
        const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2 + (k - 1) * 0.9, k * 1.05, 0));
        const n = 72, v0 = new THREE.Vector3(), v1 = new THREE.Vector3();
        for (let i = 0; i < n; i++) {
          const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2;
          v0.set(Math.cos(a0) * 1.5, Math.sin(a0) * 0.55, 0).applyQuaternion(q);
          v1.set(Math.cos(a1) * 1.5, Math.sin(a1) * 0.55, 0).applyQuaternion(q);
          pairs.push(v0.x, v0.y, v0.z, v1.x, v1.y, v1.z);
        }
      }
      const geo = ribbonGeometry(pairs);
      const m = ribbonMaterial(mix(vec3(0.7, 0.85, 1), vec3(1, 0.8, 0.5), uLove).mul(uWake.mul(0.7)), 1.1);
      atom.add(new THREE.Mesh(geo, m));
      ours.push(geo, m);
      const nuc = pointCloud(1, 0.55);
      nuc.pos.set([0, 0, 0]);
      touch(nuc.cloud);
      nuc.material.colorNode = vec4(vec3(1, 0.95, 0.85).mul(nuc.round).mul(uWake).mul(0.8), 1);
      atom.add(nuc.cloud.sprite);
      ours.push(nuc.material);
    }
    // the golden spiral, drawn on beside it as light is named
    {
      const pairs: number[] = [];
      const along: number[] = [];
      const n = 260, b = Math.log((1 + Math.sqrt(5)) / 2) / (Math.PI / 2);
      const cx = MAGE.x - 6.5, cy = 6.5, cz = MAGE.z - 3;
      const pt = (i: number) => {
        const th = (i / n) * Math.PI * 4.6; // a few turns: it stays the size of a gesture
        const r = 0.04 * Math.exp(b * th);
        return [cx + Math.cos(th) * r, cy + Math.sin(th) * r, cz];
      };
      for (let i = 0; i < n; i++) {
        pairs.push(...pt(i), ...pt(i + 1));
        for (let c = 0; c < 4; c++) along.push((i + (c >= 2 ? 1 : 0)) / n);
      }
      const geo = ribbonGeometry(pairs);
      geo.setAttribute("aAlong", new THREE.BufferAttribute(new Float32Array(along), 1));
      const U = T.attribute("aAlong", "float");
      const drawn = smoothstep(0, 0.02, uLight.mul(1.1).sub(U));
      const m = ribbonMaterial(mix(vec3(0.7, 0.85, 1), vec3(1, 0.8, 0.45), uLove).mul(drawn).mul(float(0.7).sub(uCold.mul(0.4))), 1.1);
      g.add(new THREE.Mesh(geo, m));
      ours.push(geo, m);
    }
    // a wave of light running across the dark behind it (rewritten each frame)
    const WSEG = 140;
    const waveGeo = ribbonGeometry(new Float32Array(WSEG * 6));
    {
      const m = ribbonMaterial(mix(vec3(0.6, 0.75, 1), vec3(1, 0.75, 0.45), uLove).mul(uLight.mul(0.6)).mul(float(1).sub(uCold.mul(0.6))), 1.0);
      const mesh = new THREE.Mesh(waveGeo, m);
      mesh.frustumCulled = false;
      g.add(mesh);
      ours.push(waveGeo, m);
    }
    const wPos = waveGeo.attributes.position as THREE.BufferAttribute, wOth = waveGeo.attributes.aO as THREE.BufferAttribute;
    const wp = (i: number, ph: number, out: THREE.Vector3) => {
      const x = -14 + (i / WSEG) * 28;
      const env = Math.exp(-Math.pow(x / 9, 2));
      return out.set(MAGE.x + x, 8.5 + Math.sin(x * 1.1 - ph) * 1.1 * env, MAGE.z - 8);
    };
    const A = new THREE.Vector3(), B = new THREE.Vector3();
    let phase = 0;

    tickers.push((dt: number) => {
      const d = Math.min(0.05, Math.max(0, dt));
      clock.tick(d);
      applyAir(air);
      uWake.value = damp(uWake.value, goal.wake, 0.6, d);
      uLight.value = damp(uLight.value, goal.light, 0.35, d);
      uOrder.value = damp(uOrder.value, goal.order, 0.4, d);
      uCold.value = damp(uCold.value, goal.cold, 0.5, d);
      uLove.value = damp(uLove.value, goal.love, 0.4, d);
      uDoor.value = damp(uDoor.value, goal.door, 0.5, d);
      rate = damp(rate, goal.rate, 0.8, d);
      const slow = 1 - uCold.value * 0.8 * (1 - uLove.value);
      cool.intensity = 12 * uWake.value * (1 - uLove.value * 0.4);
      warm.intensity = 22 * uLove.value;
      atom.rotation.y += d * 0.35 * slow;
      atom.rotation.x = Math.sin(clock.u.value * 0.2) * 0.2;
      phase += d * 1.6 * slow;
      for (let i = 0; i < WSEG; i++) {
        wp(i, phase, A);
        wp(i + 1, phase, B);
        const o = i * 4;
        wPos.setXYZ(o, A.x, A.y, A.z), wOth.setXYZ(o, B.x, B.y, B.z);
        wPos.setXYZ(o + 1, A.x, A.y, A.z), wOth.setXYZ(o + 1, B.x, B.y, B.z);
        wPos.setXYZ(o + 2, B.x, B.y, B.z), wOth.setXYZ(o + 2, A.x, A.y, A.z);
        wPos.setXYZ(o + 3, B.x, B.y, B.z), wOth.setXYZ(o + 3, A.x, A.y, A.z);
      }
      wPos.needsUpdate = wOth.needsUpdate = true;
      // writing: a new formula at the pace the telling asks for (none while it is stilled)
      since += d * rate * slow;
      if (since >= 1) {
        since = 0;
        spawn();
      }
      // each written: revealed by the pen over a few seconds, drifting up and out, then gone;
      // in discernment they fall into an orbit round it, in order
      uPen.value = 0;
      written.forEach((w, i) => {
        if (!w.live) return;
        const age = (clock.u.value - w.born) * slow;
        const reveal = Math.min(1, age / 2.6);
        w.u.reveal.value = reveal;
        const life = 16;
        w.u.k.value = Math.min(1, age / 0.4) * Math.min(1, Math.max(0, (life - age) / 3)) * uWake.value;
        tmp.copy(w.at).addScaledVector(w.drift, age);
        const orbitA = clock.u.value * 0.12 * slow + (i / written.length) * Math.PI * 2;
        const orbit = new THREE.Vector3(MAGE.x + Math.sin(orbitA) * 6.2, 3.2 + (i % 3) * 1.6, MAGE.z - 1 - Math.cos(orbitA) * 4.2);
        w.sprite.position.lerpVectors(tmp, orbit, uOrder.value);
        const wd = w.u.width.value * 7 * w.size;
        w.sprite.scale.set(wd, (wd * ROW_H) / (ATLAS_W * w.u.width.value), 1);
        if (reveal < 1) {
          // the pen at the writing's edge
          pen.cloud.sprite.position.copy(w.sprite.position).add(new THREE.Vector3((reveal - 0.5) * wd, 0, 0.02));
          uPen.value = Math.max(uPen.value, w.u.k.value);
        }
        if (age > life) {
          w.live = false;
          w.sprite.visible = false;
        }
      });
      mage.update(d * slow);
    });
    // the way on: a tall narrow opening of silver light beyond
    {
      const dg = new THREE.PlaneGeometry(2.4, 6);
      dg.translate(WISDOM_DOOR.x, 3, WISDOM_DOOR.z);
      const dm = keepAlpha(new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide }));
      const u = uv();
      const inside = smoothstep(0, 0.1, u.x).mul(smoothstep(1, 0.9, u.x)).mul(smoothstep(0, 0.04, u.y)).mul(smoothstep(1, 0.96, u.y));
      dm.colorNode = vec4(vec3(0.85, 0.9, 1).mul(inside).mul(uDoor), 1);
      g.add(new THREE.Mesh(dg, dm));
      ours.push(dg, dm);
    }
  };

  const beats: Beat[] = [
    // "The soul arrives here carrying a full heart": it wakes; the first formulas are written
    { t: 28, apply: () => Object.assign(goal, { wake: 1, rate: 0.35 }) },
    // "the native of the fifth density seeks solitude": fewer, quieter
    { t: 70, apply: () => Object.assign(goal, { rate: 0.2 }) },
    // "light… the primary substance of reality": the writing quickens; the wave and the spiral
    { t: 104, apply: () => Object.assign(goal, { light: 1, rate: 0.7 }) },
    // "The lesson of wisdom is discernment": in order round it
    { t: 146, apply: () => Object.assign(goal, { order: 1, rate: 0.5 }) },
    // "there is a warning… wisdom without love can become a trap": cold, slow, stilled
    { t: 188, apply: () => Object.assign(goal, { cold: 1, rate: 0, order: 0.6 }) },
    // "It is love, being tempered": warm at the heart; the writing turns gold and goes on
    { t: 230, apply: () => Object.assign(goal, { love: 1, cold: 0, rate: 0.55, order: 0.3 }) },
    // "Their compassion has gained eyes": brightest; the way on opens
    { t: 254, apply: () => Object.assign(goal, { door: 1, rate: 0.6 }) },
  ];

  const lesson = new LessonScene(scene, narration, whisper, {
    id: "density-5",
    trackId: "audio/densities/density_5.mp3",
    seatPos,
    seatHeading: Math.PI,
    build,
    authoredSecs: 300, // beats written against the script's length; they follow the recording
    beats,
  });
  const baseUpdate = lesson.update.bind(lesson);
  lesson.update = (dt: number) => {
    baseUpdate(dt);
    for (const tick of tickers) tick(dt);
  };
  const baseDispose = lesson.dispose.bind(lesson);
  lesson.dispose = () => {
    mage.dispose();
    for (let i = 0; i < ours.length; i++) ours[i].dispose();
    ours.length = 0;
    tickers.length = 0;
    baseDispose();
  };
  // the magician stands solid in its silver circle
  return Object.assign(lesson, { loaded: mage.loaded, solids: (): Solid[] => [{ x: MAGE.x, z: MAGE.z, r: 0.6, h: 2.9 }] });
}
