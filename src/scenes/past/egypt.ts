/* Past choices, the fourth: Egypt. The desert at night, a great pyramid ahead under the stars,
   its casing pale, its door facing you.

   The telling, as it goes: the stones older than any story. An instrument: light drawn from the
   ground around its base spirals up its faces and gathers in the chamber at its heart (seen through
   the stone, as a lens gathers light), where one small light lies still and is worked upon. A ruler
   throws the doors open: the door stone rises, warm light spills over the sand, and people come
   from all sides and go in, and the stone sings (rings of light climbing the faces). He dies: the
   door sinks shut, a fence of dark pylons rises round the pyramid and grows taller; the people
   gather outside it, and only a few gold lights pass; the chamber's light goes out and what light
   is left leaks down the faces into the sand like water from a cracked jar. And yet: the stars
   wheel (thousands of years), the fence crumbles into dust and blows away, and a thin line runs
   from the apex to the star it still points at. The light, patient, returns to the chamber; the
   door opens again, and everyone who waited walks in; the spiral climbs, the stone sings. */
import * as THREE from "three/webgpu";
import { T, type N } from "../../gpu/tsl";
import { ribbonGeometry, ribbonMaterial } from "../../gpu/ribbons";
import { applyAir, boulderGeometry, fbmN, keepAlpha, merge, pointCloud, roomPos, scannedGround, seeded, skyDome, touch, type Air } from "../densities/roomKit";
import { landStone, stoneBlock } from "../../world/stoneworks";
import type { Narration } from "../../core/narration";
import type { Room } from "../journey";
import { Tells, seatedRoom, starField } from "./kit";

const { abs, cos, exp, float, fract, length, max, mix, normalize, pow, sin, smoothstep, uv, vec2, vec3, vec4 } = T;

/** Room frame: the seat at the origin looking toward −z; the pyramid ahead, its door facing you. */
const PYR = new THREE.Vector3(0, 0, -86);
const HALF = 34;
const HEIGHT = HALF * 1.27; // faces at about 51.8°
const CHAMBER = new THREE.Vector3(0, 15, -86);
const MOON = new THREE.Vector3(0.55, 0.5, 0.45).normalize();
/** The star the apex points at. */
const STAR = new THREE.Vector3(-0.12, 0.72, -0.68).normalize();
const FENCE_R = 50;
export const EGYPT_DOOR = new THREE.Vector3(8, 0, 4);

/** Low dunes, level round the seat and on the pyramid's plaza. */
export function egyptFloor(x: number, z: number): number {
  const dunes = Math.sin(x * 0.045 + z * 0.02) * 1.3 + Math.sin(x * 0.013 - z * 0.037) * 2.2;
  const plaza = Math.max(Math.abs(x - PYR.x), Math.abs(z - PYR.z));
  const level = smooth(HALF + 30, HALF + 6, plaza);
  const seat = smooth(12, 4, Math.hypot(x, z));
  return dunes * (1 - level) * (1 - seat);
}
const smooth = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

export function createEgyptScene(scene: THREE.Scene, narration: Narration, whisper: (t: string, ms?: number) => void): Room {
  return seatedRoom(scene, narration, whisper, {
    id: "past_egypt",
    track: "audio/past/past_egypt.mp3",
    len: 157.8,
    seat: new THREE.Vector3(0, 0, 0),
    heading: 0,
    make: (g, t) => {
      const ours: { dispose(): void }[] = [];
      const R = seeded(9901);
      const tl = new Tells({
        spiral: [[0.13, 0], [0.16, 1], [0.33, 1], [0.37, 0.3], [0.4, 0], [0.9, 0], [0.95, 1]],
        chamber: [[0.12, 0.08], [0.18, 0.7], [0.3, 0.8], [0.35, 1], [0.4, 0.7], [0.475, 0.04], [0.82, 0.04], [0.86, 0.45], [0.95, 1]],
        one: [[0.16, 0], [0.175, 1], [0.24, 1], [0.27, 0]],
        door: [[0.29, 0], [0.305, 1], [0.37, 1], [0.41, 0.15], [0.45, 0], [0.88, 0], [0.905, 1]],
        crowd: [[0.305, 0], [0.33, 1], [0.66, 1], [0.7, 0.6], [0.76, 0.85], [0.9, 1]],
        fence: [[0.4, 0], [0.45, 1], [0.57, 1], [0.6, 1.3], [0.69, 1.3], [0.735, 0]],
        dust: [[0.685, 0], [0.76, 1]],
        sing: [[0.34, 0], [0.355, 1], [0.37, 1], [0.39, 0], [0.95, 0], [0.97, 1]],
        leak: [[0.47, 0], [0.5, 1], [0.56, 1], [0.6, 0]],
        wheel: [[0.655, 0], [0.745, 1]],
        align: [[0.72, 0], [0.745, 1], [0.86, 1], [0.9, 0.6], [1, 0.8]],
      });
      const u = tl.u;
      const air: Air = {
        color: new THREE.Color(0.03, 0.035, 0.06),
        glow: new THREE.Color(0.08, 0.09, 0.14),
        glowDir: MOON.clone(),
        density: 0.0022,
        shadow: new THREE.Color(0.006, 0.01, 0.025),
        sat: 1.04,
        contrast: 1.06,
      };

      /* ---------------- the night of stars, turning; the star the apex points at ---------------- */
      const sky = skyDome(1500, new THREE.Color(0.06, 0.07, 0.12), new THREE.Color(0.005, 0.007, 0.02), {
        glowDir: MOON,
        glow: new THREE.Color(0.1, 0.1, 0.14),
        glowPow: 10,
        extra: (d, c) => {
          const band = exp(T.dot(d, normalize(vec3(-0.5, 0.35, 0.8))).pow(2).mul(-10)).mul(fbmN(d.mul(7)).mul(0.7).add(0.3));
          const star = smoothstep(0.99985, 0.99995, T.dot(d, vec3(STAR.x, STAR.y, STAR.z)));
          return c.add(vec3(0.05, 0.05, 0.08).mul(band)).add(vec3(starField(d, t, 0.007))).add(vec3(1, 0.95, 0.85).mul(star).mul(float(1.5).add(u.align.mul(2))));
        },
      });
      g.add(sky.mesh);
      ours.push(sky);

      /* ---------------- the desert ---------------- */
      {
        const geo = new THREE.PlaneGeometry(1200, 1200, 240, 240);
        geo.rotateX(-Math.PI / 2);
        geo.translate(0, 0, -150);
        const p = geo.attributes.position as THREE.BufferAttribute;
        for (let i = 0; i < p.count; i++) p.setY(i, egyptFloor(p.getX(i), p.getZ(i)));
        geo.computeVertexNormals();
        const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.95, metalness: 0 });
        const scan = scannedGround("sand", 2.2, { hue: 0.35, relief: 1.2, bright: 1.6 });
        m.colorNode = mix(vec3(0.58, 0.47, 0.34), vec3(0.66, 0.54, 0.4), fbmN(roomPos.xz.mul(0.03))).mul(scan.color).mul(0.5);
        m.normalNode = scan.normal;
        // the door's warm light over the sand
        const toDoor = roomPos.xz.sub(vec2(PYR.x, PYR.z + HALF + 2));
        const wedge = smoothstep(0.9, 0.2, abs(toDoor.x).div(toDoor.y.max(0.5).mul(0.5).add(1.5))).mul(exp(toDoor.y.max(0).mul(-0.05))).mul(T.step(0, toDoor.y));
        m.emissiveNode = vec3(1, 0.7, 0.35).mul(wedge).mul(u.door).mul(0.35);
        const ground = new THREE.Mesh(geo, m);
        ground.receiveShadow = true;
        g.add(ground);
        ours.push(geo, m);
        const stones: THREE.BufferGeometry[] = [];
        for (let i = 0; i < 40; i++) {
          const x = (R() - 0.5) * 140, z = -10 - R() * 150;
          if (Math.max(Math.abs(x - PYR.x), Math.abs(z - PYR.z)) < HALF + 8) continue;
          if (Math.abs(x) < 6 && z > -50) continue;
          const b = boulderGeometry(0.3 + R() * R() * 1.6, i);
          b.translate(x, egyptFloor(x, z), z);
          stones.push(b);
        }
        const sm = landStone("sandstone_cracks", 0, 1.4, [0.9, 0.8, 0.66]);
        g.add(new THREE.Mesh(merge(stones), sm));
        ours.push(sm);
      }
      const moon = new THREE.DirectionalLight(0xcfd8ff, 1.3);
      moon.position.copy(MOON).multiplyScalar(120);
      moon.castShadow = true;
      moon.shadow.camera.left = moon.shadow.camera.bottom = -90;
      moon.shadow.camera.right = moon.shadow.camera.top = 90;
      moon.target.position.set(0, 0, -60);
      g.add(moon, moon.target);
      g.add(new THREE.HemisphereLight(0x3a4870, 0x1a140c, 0.4));

      /* ---------------- the pyramid, its door facing you ---------------- */
      {
        const geo = new THREE.ConeGeometry(HALF * Math.SQRT2, HEIGHT, 4, 12);
        geo.rotateY(Math.PI / 4);
        geo.translate(PYR.x, HEIGHT / 2, PYR.z);
        const m = landStone("sandstone_blocks_05", 0, 3.4, [1.12, 1.06, 0.96], { course: 1.3, block: 2.2 });
        // the stone sings: rings of light climbing its faces
        const y = roomPos.y;
        const band = pow(sin(y.mul(0.45).sub(t.mul(2.2))).mul(0.5).add(0.5), 16);
        m.emissiveNode = vec3(1, 0.82, 0.5).mul(band).mul(u.sing).mul(0.5);
        const mesh = new THREE.Mesh(geo, m);
        mesh.castShadow = mesh.receiveShadow = true;
        g.add(mesh);
        ours.push(geo, m);
        // the door: jambs and lintel of granite standing at the foot of the face, a stone that rises
        const parts: THREE.BufferGeometry[] = [];
        const dz = PYR.z + HALF + 0.8;
        for (const x of [-2.6, 2.6]) {
          const j = stoneBlock(1.3, 6.2, 2.4, x > 0 ? 2 : 3);
          j.translate(x, 3.1, dz);
          parts.push(j);
        }
        const l = stoneBlock(7, 1.4, 2.6, 4);
        l.translate(0, 6.9, dz);
        parts.push(l);
        const gm = landStone("sandstone_cracks", 0, 1.6, [0.62, 0.42, 0.4]);
        const frame = new THREE.Mesh(merge(parts), gm);
        frame.castShadow = true;
        g.add(frame);
        ours.push(frame.geometry, gm);
        const slab = new THREE.Mesh(stoneBlock(4, 6, 0.8, 7), gm);
        slab.position.set(0, 3, dz + 0.2);
        g.add(slab);
        ours.push(slab.geometry);
        (g.userData as { slab?: THREE.Mesh }).slab = slab;
        const lg = new THREE.PlaneGeometry(3.9, 6);
        lg.translate(0, 3, dz - 0.3);
        const lm = new THREE.MeshBasicNodeMaterial({ fog: false });
        const c = smoothstep(1, 0, length(uv().sub(vec2(0.5, 0.2)).mul(vec2(1.6, 1)))).mul(0.8).add(0.1);
        lm.colorNode = vec4(vec3(1, 0.72, 0.38).mul(c).mul(u.door.mul(0.95).add(0.03)), 1);
        g.add(new THREE.Mesh(lg, lm));
        ours.push(lg, lm);
        const warm = new THREE.PointLight(0xffc27a, 0, 40, 1.6);
        warm.position.set(0, 2.5, dz + 3);
        g.add(warm);
        (g.userData as { warm?: THREE.PointLight }).warm = warm;
      }

      /* ---------------- the chamber at its heart, seen through the stone ---------------- */
      {
        const sprite = (color: N, k: N, sx: number, sy: number) => {
          const m = keepAlpha(new THREE.SpriteNodeMaterial({ transparent: true, depthWrite: false, depthTest: false, fog: false }));
          const r = length(uv().sub(0.5).mul(vec2(1, sy / sx))).mul(2);
          m.colorNode = vec4(color.mul(exp(r.mul(r).mul(-5))).mul(smoothstep(1, 0.6, r)).mul(k), 1);
          const s = new THREE.Sprite(m);
          s.position.copy(CHAMBER);
          s.scale.set(sx, sy, 1);
          s.renderOrder = 5;
          g.add(s);
          ours.push(m);
        };
        sprite(vec3(1, 0.78, 0.45), u.chamber.mul(0.55), 16, 11);
        sprite(vec3(1, 0.95, 0.85), u.chamber.mul(0.8).add(u.one.mul(0.6)), 3, 3);
      }
      // the spiral: light drawn from the ground round the base, up the faces into the chamber
      {
        const n = 5200;
        const S = pointCloud(n, 0.35);
        for (let i = 0; i < n; i++) S.k.set([R(), R(), R(), R()], i * 4);
        touch(S.cloud);
        S.material.depthTest = false;
        const K = S.cloud.nodes.aK;
        const s = fract(K.x.add(t.mul(0.07)));
        const a = K.y.mul(6.28).add(s.mul(9.5));
        const r = mix(float(HALF + 18), float(1.5), pow(s, 0.8));
        const y = mix(float(0.3), float(CHAMBER.y), pow(s, 1.6));
        S.material.positionNode = vec3(cos(a).mul(r).add(PYR.x), y, sin(a).mul(r).add(PYR.z));
        const on = smoothstep(0, 0.08, s).mul(smoothstep(1, 0.9, s));
        S.material.colorNode = vec4(vec3(1, 0.84, 0.55).mul(S.round).mul(on).mul(u.spiral).mul(0.65), 1);
        S.cloud.sprite.renderOrder = 5;
        g.add(S.cloud.sprite);
        ours.push(S.material);
      }
      // what light is left leaking down the faces into the sand
      {
        const n = 1600;
        const L = pointCloud(n, 0.3);
        for (let i = 0; i < n; i++) L.k.set([R(), Math.floor(R() * 4), R(), R()], i * 4);
        touch(L.cloud);
        const K = L.cloud.nodes.aK;
        const s = fract(K.x.add(t.mul(0.12)));
        const side = K.y.mul(Math.PI / 2).add(Math.PI / 4);
        const across = K.z.sub(0.5).mul(0.9);
        const r = mix(float(3), float(HALF * 1.02), s);
        const face = vec3(sin(side), 0, cos(side));
        const along = vec3(cos(side), 0, sin(side).negate());
        const p = face.mul(r).add(along.mul(across.mul(r))).add(vec3(PYR.x, 0, PYR.z)).add(vec3(0, HEIGHT * 0.45, 0).mul(float(1).sub(s)));
        L.material.positionNode = p.add(vec3(0, 0.3, 0));
        L.material.colorNode = vec4(vec3(1, 0.78, 0.45).mul(L.round).mul(u.leak).mul(smoothstep(1, 0.8, s)).mul(0.8), 1);
        g.add(L.cloud.sprite);
        ours.push(L.material);
      }

      /* ---------------- the people: coming from every side to the door; held at the fence ---------------- */
      {
        const n = 700;
        const P = pointCloud(n, 0.5);
        for (let i = 0; i < n; i++) P.k.set([R(), R(), R(), R()], i * 4);
        touch(P.cloud);
        const K = P.cloud.nodes.aK;
        const door = vec3(PYR.x, 1.1, PYR.z + HALF + 1.5);
        const side = T.step(0.5, K.y).mul(2).sub(1); // from the left and the right, across the sand
        const far = vec3(side.mul(float(110).add(K.z.mul(50))), 1.1, float(PYR.z + HALF - 6).add(K.y.fract().mul(40).sub(12)));
        const s = fract(K.x.add(t.mul(0.018)));
        const rich = T.step(0.94, K.w);
        const gate = T.clamp(float(1).sub(float(FENCE_R - HALF).div(150)), 0, 1);
        const stopped = float(1).sub(rich).mul(max(u.fence.min(1), float(1).sub(u.door)));
        const s2 = mix(s, s.min(gate.sub(K.z.mul(0.08))), stopped);
        const walk = mix(far, door, s2);
        const sway = vec3(sin(t.mul(3).add(K.z.mul(20))).mul(0.05), 0, 0);
        P.material.positionNode = walk.add(vec3(K.z.sub(0.5).mul(4).mul(float(1).sub(s2)), 0, 0)).add(sway).add(vec3(0, egyptFloorN(walk.x, walk.z), 0));
        const inside = smoothstep(0.97, 1, s2);
        const col = mix(vec3(1, 0.86, 0.62), vec3(1, 0.75, 0.2), rich);
        P.material.colorNode = vec4(col.mul(P.round).mul(u.crowd).mul(float(1).sub(inside)).mul(0.75), 1);
        g.add(P.cloud.sprite);
        ours.push(P.material);
      }

      /* ---------------- the fence of dark pylons, and its dust at the end ---------------- */
      const fence = new THREE.Group();
      g.add(fence);
      {
        const parts: THREE.BufferGeometry[] = [];
        const N = 64;
        for (let k = 0; k < N; k++) {
          const a = (k / N) * Math.PI * 2;
          if (Math.abs(Math.atan2(Math.sin(a), Math.cos(a)) - Math.PI / 2) < 0.05) continue; // the gate
          const b = stoneBlock(1.1, 9, 1.1, k);
          b.translate(Math.cos(a) * FENCE_R + PYR.x, 4.5, Math.sin(a) * FENCE_R + PYR.z);
          parts.push(b);
        }
        const fm = landStone("sandstone_cracks", 0, 1.8, [0.2, 0.19, 0.22]);
        const mesh = new THREE.Mesh(merge(parts), fm);
        mesh.castShadow = true;
        fence.add(mesh);
        ours.push(mesh.geometry, fm);
        const n = 5000;
        const D = pointCloud(n, 0.35);
        for (let i = 0; i < n; i++) {
          const a = R() * Math.PI * 2;
          D.pos.set([Math.cos(a) * FENCE_R + PYR.x, R() * 11, Math.sin(a) * FENCE_R + PYR.z], i * 3);
          D.k.set([R(), R(), R(), R()], i * 4);
        }
        touch(D.cloud);
        const K = D.cloud.nodes.aK;
        const s = T.clamp(u.dust.mul(1.5).sub(K.x.mul(0.5)), 0, 1);
        D.material.positionNode = D.cloud.nodes.position.add(vec3(s.mul(60).add(K.y.mul(s).mul(30)), s.mul(K.z.mul(8)).sub(s.mul(s).mul(6)), s.mul(K.w.sub(0.5).mul(30))));
        D.material.colorNode = vec4(vec3(0.6, 0.52, 0.42).mul(D.round).mul(sin(s.mul(Math.PI))).mul(0.4), 1);
        g.add(D.cloud.sprite);
        ours.push(D.material);
      }

      /* ---------------- the line from the apex to its star ---------------- */
      {
        const apex = new THREE.Vector3(PYR.x, HEIGHT, PYR.z);
        const far = apex.clone().add(STAR.clone().multiplyScalar(1300));
        const lg = ribbonGeometry([apex.x, apex.y, apex.z, far.x, far.y, far.z]);
        const lm = keepAlpha(ribbonMaterial(vec3(1, 0.9, 0.7).mul(u.align).mul(0.8), 0.9));
        const line = new THREE.Mesh(lg, lm);
        line.frustumCulled = false;
        g.add(line);
        ours.push(lg, lm);
      }

      const ud = g.userData as { slab?: THREE.Mesh; warm?: THREE.PointLight };
      return {
        update(dt, f, _on, still) {
          applyAir(air);
          tl.step(f, dt, still);
          const v = tl.v;
          if (ud.slab) ud.slab.position.y = 3 + v.door * 6.4;
          if (ud.warm) ud.warm.intensity = v.door * 260;
          fence.position.y = -11 + Math.min(1, v.fence) * 11;
          fence.scale.y = Math.max(0.01, 1 + Math.max(0, v.fence - 1) * 1.2);
          fence.visible = v.fence > 0.01;
          // the stars wheel once round (thousands of years in a few breaths), and come back to
          // where the apex points
          sky.mesh.rotation.y = v.wheel * Math.PI * 2;
        },
        dispose() {
          for (const o of ours) o.dispose();
        },
      };
    },
  });
}

/** The dunes on the GPU (the same shape as `egyptFloor`), for things that walk on them. */
function egyptFloorN(x: N, z: N): N {
  const dunes = sin(x.mul(0.045).add(z.mul(0.02))).mul(1.3).add(sin(x.mul(0.013).sub(z.mul(0.037))).mul(2.2));
  const plaza = max(abs(x.sub(PYR.x)), abs(z.sub(PYR.z)));
  const level = smoothstep(HALF + 30, HALF + 6, plaza);
  const seat = smoothstep(12, 4, length(vec2(x, z)));
  return dunes.mul(float(1).sub(level)).mul(float(1).sub(seat));
}
