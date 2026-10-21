/* Past choices, the first: Maldek. A round plain of cratered moon dust high above a sea of dark
   cloud, open to deep space; no columns, no paving, only dust, rock and two leaning stones. Ahead, across
   the sky, the river of stone: a broad arch of rubble turning slowly about a far small sun.

   The telling, as it goes: the rubble gathers back into the world it was (a planet, seas and
   land, a thin air about it) and a crack flashes across it (it broke); dark red canyons are carved
   into it day by day, choice by choice, until it bursts and its pieces fly back into the river.
   Then the memory of it at its height, a ghost of light, its cities lit like constellations and
   joined as constellations are; a few grow bright as the rest grow dim. Hatred has an address: a
   red light at its heart that moves outward through it until the ghost is gone, and the
   burning reaches the stone of the terrace under you. The memorial: the river brightens, light
   reading along it like a line of text. At the end one small warm light kindles in the river where
   the world was, and grows: it is not too late. */
import { keyShadow } from "../../gpu/lightRig";
import * as THREE from "three/webgpu";
import { T, hash3, type N } from "../../gpu/tsl";
import { ribbonGeometry, ribbonMaterial } from "../../gpu/ribbons";
import { applyAir, boulderGeometry, fbmN, keepAlpha, merge, pointCloud, roomOrigin, roomPos, scannedGround, seeded, skyDome, touch, type Air } from "../densities/roomKit";
import { landStone } from "../../world/stoneworks";
import type { Narration } from "../../core/narration";
import type { Room } from "../journey";
import { Tells, seatedRoom, starField } from "./kit";

const { abs, exp, float, length, max, mix, normalize, pow, sin, cos, smoothstep, uv, vec2, vec3, vec4 } = T;

/** Room frame: the seat at the origin looking toward −z; the terrace round (0, −2). */
const TERR = new THREE.Vector3(0, 0, -2);
const TERR_R = 10.5;
/** The river's centre and radius; the plane it turns in leans back 65° from the ground. */
const BELT_C = new THREE.Vector3(0, -24, -95);
const BELT_R = 150;
const TILT = (65 * Math.PI) / 180;
/** Where the world was, and its radius. */
const PLANET = new THREE.Vector3(0, 36, -118);
const PLANET_R = 24;
const SUN = new THREE.Vector3(0.82, 0.3, 0.1).normalize();
export const MALDEK_DOOR = new THREE.Vector3(-9.8, 0, -2);

export function createMaldekScene(scene: THREE.Scene, narration: Narration, whisper: (t: string, ms?: number) => void): Room {
  return seatedRoom(scene, narration, whisper, {
    id: "past_maldek",
    track: "audio/past/past_maldek.mp3",
    len: 129,
    seat: new THREE.Vector3(0, 0, 0),
    heading: 0,
    make: (g, t) => {
      const ours: { dispose(): void }[] = [];
      const R = seeded(4401);
      const tl = new Tells({
        whole: [[0.1, 0], [0.135, 1], [0.337, 1], [0.372, 0]],
        broke: [[0.138, 0], [0.142, 1], [0.165, 0]],
        life: [[0.14, 0], [0.18, 1], [0.32, 1], [0.35, 0]],
        canyon: [[0.215, 0], [0.34, 1]],
        boom: [[0.33, 0], [0.345, 1], [0.4, 0]],
        ghost: [[0.38, 0], [0.42, 1], [0.6, 1], [0.665, 0]],
        cities: [[0.4, 0], [0.43, 1], [0.6, 1], [0.64, 0]],
        drift: [[0.425, 0], [0.53, 1]],
        hate: [[0.555, 0], [0.575, 1], [0.66, 1], [0.7, 0]],
        spread: [[0.585, 0], [0.645, 1]],
        burn: [[0.615, 0], [0.64, 1], [0.675, 1], [0.72, 0]],
        front: [[0.612, 0], [0.655, 1]],
        river: [[0, 0.25], [0.67, 0.25], [0.72, 1], [0.84, 1], [0.9, 0.55]],
        seed: [[0.855, 0], [0.9, 0.35], [0.95, 0.6], [0.985, 1]],
        bloom: [[0.972, 0], [1, 1]],
      });
      const u = tl.u;
      const air: Air = {
        color: new THREE.Color(0.012, 0.011, 0.024),
        glow: new THREE.Color(0.08, 0.06, 0.05),
        glowDir: SUN.clone(),
        density: 0.0016,
        shadow: new THREE.Color(0.004, 0.004, 0.014),
        sat: 1.04,
        contrast: 1.06,
      };

      /* ---------------- deep space: stars, a faint band of the galaxy, the far small sun ---------------- */
      {
        const sky = skyDome(1500, new THREE.Color(0.03, 0.025, 0.05), new THREE.Color(0.004, 0.004, 0.012), {
          glowDir: SUN,
          glow: new THREE.Color(0.25, 0.14, 0.08),
          glowPow: 40,
          extra: (d, c) => {
            const band = exp(T.dot(d, normalize(vec3(0.3, 0.2, 0.93))).pow(2).mul(-9)).mul(fbmN(d.mul(6)).mul(0.7).add(0.3));
            const sunDisc = smoothstep(0.9993, 0.9998, T.dot(d, vec3(SUN.x, SUN.y, SUN.z)));
            return c.add(vec3(0.05, 0.045, 0.07).mul(band)).add(vec3(starField(d, t, 0.006))).add(vec3(1, 0.85, 0.6).mul(sunDisc).mul(2));
          },
        });
        g.add(sky.mesh);
        ours.push(sky);
      }
      /* ---------------- the sea of cloud far below ---------------- */
      {
        const geo = new THREE.PlaneGeometry(2400, 2400);
        geo.rotateX(-Math.PI / 2);
        const m = new THREE.MeshBasicNodeMaterial({ fog: true });
        const q = roomPos.xz.mul(0.006).add(vec2(t.mul(0.002), t.mul(0.001)));
        const b = fbmN(q.add(vec2(fbmN(q.mul(1.9)), fbmN(q.mul(1.9).add(4.1))).mul(0.8)));
        m.colorNode = vec4(mix(vec3(0.012, 0.011, 0.024), vec3(0.07, 0.06, 0.1), smoothstep(0.35, 0.8, b)).add(vec3(0.05, 0.035, 0.02).mul(u.river).mul(b)), 1);
        const mesh = new THREE.Mesh(geo, m);
        mesh.position.y = -34;
        g.add(mesh);
        ours.push(geo, m);
      }

      /* ---------------- the terrace: marble flags, a rock beneath, balustrade, columns ---------------- */
      {
        // a plain of moon dust: cratered regolith, no paving, no stone dressed by hand
        const top = new THREE.CylinderGeometry(TERR_R + 0.5, TERR_R + 1.4, 1.8, 96, 1);
        top.translate(TERR.x, -0.9, TERR.z);
        const fm = new THREE.MeshStandardNodeMaterial({ roughness: 1, metalness: 0 });
        {
          const p = roomPos.xz;
          // craters: bowl and raised rim, two sizes, each cell with its own centre and radius
          const crater = (q0: N, sc: number, seed: number) => {
            // the edge is torn by noise so no bowl is a true circle, and the rim breaks into lumps
            const q = q0.add(vec2(fbmN(q0.mul(0.9).add(seed)), fbmN(q0.mul(0.9).add(seed + 9))).sub(0.5).mul(sc * 0.55));
            const g = q.div(sc), c = T.floor(g), f = T.fract(g);
            const j = vec2(hash3(vec3(c, seed)), hash3(vec3(c, seed + 7))).mul(0.5).add(0.25);
            const rad = hash3(vec3(c, seed + 13)).mul(0.22).add(0.18);
            const on = T.step(0.45, hash3(vec3(c, seed + 3)));
            const d = length(f.sub(j)).div(rad);
            const bowl = smoothstep(1, 0, d).mul(-1);
            const rim = smoothstep(0.75, 1.0, d).mul(smoothstep(1.35, 1.0, d)).mul(fbmN(q0.mul(2.3)).mul(0.9).add(0.35));
            return bowl.mul(0.9).add(rim.mul(0.5)).mul(on).mul(rad.mul(2));
          };
          const H = (q: N) => crater(q, 11, 41).mul(1.6).add(crater(q, 3.6, 1)).add(crater(q.mul(1.9).add(5), 3.6, 21).mul(0.5)).add(crater(q.mul(5.3).add(2), 3.6, 61).mul(0.3)).add(crater(q.mul(11).add(7), 3.6, 83).mul(0.16)).add(crater(q.mul(23).add(3), 3.6, 97).mul(0.08)).add(fbmN(q.mul(0.9)).sub(0.5).mul(0.25)).add(fbmN(q.mul(2.7).add(4)).sub(0.5).mul(0.2));
          const scan = scannedGround("rock", 1.7, { hue: 0, relief: 0.8, bright: 1.25 });
          const e = 0.08;
          const h0 = H(p), hx = H(p.add(vec2(e, 0))), hz = H(p.add(vec2(0, e)));
          const dust = fbmN(p.mul(0.35).add(2)), grit = fbmN(p.mul(6));
          const base = mix(vec3(0.17, 0.155, 0.145), vec3(0.34, 0.31, 0.28), dust).mul(grit.mul(0.35).add(0.8));
          fm.colorNode = base.mul(mix(vec3(1), scan.color, 0.3)).mul(max(h0.mul(0.9).add(1), 0.25)).mul(smoothstep(-0.25, 0.3, h0).mul(0.6).add(0.4));
          const slope = vec3(h0.sub(hx), 0, h0.sub(hz)).mul(11 / e * 0.1);
          fm.normalNode = T.normalize(T.normalView.add(T.cameraViewMatrix.mul(vec4(slope, 0)).xyz));
          const c1 = abs(fbmN(p.mul(0.55).add(3.1)).sub(0.5)), c2 = abs(fbmN(p.mul(1.4).add(8.7)).sub(0.5));
          const crack = smoothstep(0.03, 0.0, c1).add(smoothstep(0.022, 0.0, c2).mul(0.6));
          const d = length(p.sub(vec2(0, -12.5)));
          const reach = smoothstep(u.front.mul(17), u.front.mul(17).sub(3), d);
          fm.emissiveNode = vec3(1, 0.22, 0.06).mul(crack).mul(reach).mul(u.burn).mul(1.4);
        }
        const floor = new THREE.Mesh(top, fm);
        floor.receiveShadow = true;
        g.add(floor);
        ours.push(top, fm);
        // the rock the terrace stands on, falling away into the cloud
        const rock = new THREE.ConeGeometry(TERR_R + 1.6, 34, 28, 10, true);
        rock.rotateX(Math.PI);
        rock.translate(TERR.x, -1.7 - 17, TERR.z);
        const rp = rock.attributes.position as THREE.BufferAttribute;
        for (let i = 0; i < rp.count; i++) {
          const x = rp.getX(i) - TERR.x, y = rp.getY(i), z = rp.getZ(i) - TERR.z;
          const k = 1 + (vnoiseJs(x * 0.3 + y * 0.2, z * 0.3) - 0.5) * 0.45;
          rp.setXYZ(i, TERR.x + x * k, y, TERR.z + z * k);
        }
        rock.computeVertexNormals();
        const rm = landStone("sandstone_cracks", -40, 3.2, [0.42, 0.4, 0.46]);
        g.add(new THREE.Mesh(rock, rm));
        ours.push(rock, rm);
        // the way on: two leaning dark rocks, a faint light standing between them
        const jambs: THREE.BufferGeometry[] = [];
        for (const dz of [-1.7, 1.7]) {
          const j = boulderGeometry(1.3, dz > 0 ? 3 : 4);
          j.scale(0.8, 1.9, 0.9);
          j.translate(MALDEK_DOOR.x, 1.5, MALDEK_DOOR.z + dz);
          jambs.push(j);
        }
        const jm = landStone("sandstone_cracks", 0, 2, [0.3, 0.29, 0.32]);
        const jmesh = new THREE.Mesh(merge(jambs), jm);
        jmesh.castShadow = jmesh.receiveShadow = true;
        g.add(jmesh);
        ours.push(jmesh.geometry, jm);
        // a few loose stones on the flags
        const stones: THREE.BufferGeometry[] = [];
        for (let i = 0; i < 9; i++) {
          const a = R() * Math.PI * 2, r = 4 + R() * 5;
          const b = boulderGeometry(0.12 + R() * 0.2, i);
          b.translate(TERR.x + Math.sin(a) * r, 0.05, TERR.z + Math.cos(a) * r);
          stones.push(b);
        }
        const sm = landStone("sandstone_cracks", 0, 0.8, [0.6, 0.58, 0.62]);
        g.add(new THREE.Mesh(merge(stones), sm));
        ours.push(sm);
        // the far sun's light on the terrace, and a low cold fill
        const sun = new THREE.DirectionalLight(0xffe0c0, 1.4);
        sun.position.copy(SUN).multiplyScalar(60);
        keyShadow(sun, 30);
        g.add(sun, sun.target);
        const fill = new THREE.HemisphereLight(0x6a6090, 0x0a0812, 0.35);
        g.add(fill);
      }

      /* ---------------- the river of stone, which was a world ---------------- */
      const n = 18000;
      {
        const P = pointCloud(n, 1.5);
        const aA = new Float32Array(n * 4), aS = new Float32Array(n * 3);
        const ga = Math.PI * (3 - Math.sqrt(5));
        for (let i = 0; i < n; i++) {
          const a = -0.35 * Math.PI + R() * 1.7 * Math.PI;
          const rr = BELT_R + gauss(R) * 16;
          const h = gauss(R) * 4.5;
          aA.set([a, rr, h, 0.6 + R() * 0.8], i * 4);
          // its place on the world: a Fibonacci sphere, a little within its surface
          const y = 1 - (2 * (i + 0.5)) / n, s = Math.sqrt(1 - y * y), th = i * ga;
          aS.set([Math.cos(th) * s, y, Math.sin(th) * s], i * 3);
          P.k.set([R(), R(), R(), R()], i * 4);
        }
        const bA = new THREE.InstancedBufferAttribute(aA, 4), bS = new THREE.InstancedBufferAttribute(aS, 3);
        P.cloud.sprite.geometry.setAttribute("aA", bA);
        P.cloud.sprite.geometry.setAttribute("aS", bS);
        touch(P.cloud);
        const A = T.instancedBufferAttribute(bA), S = T.instancedBufferAttribute(bS), K = P.cloud.nodes.aK;
        const U = vec3(1, 0, 0), V = vec3(0, Math.sin(TILT), -Math.cos(TILT)), W = vec3(0, Math.cos(TILT), Math.sin(TILT));
        const ang = A.x.add(t.mul(0.0035).mul(A.w));
        const belt = vec3(BELT_C.x, BELT_C.y, BELT_C.z).add(U.mul(cos(ang).mul(A.y))).add(V.mul(sin(ang).mul(A.y))).add(W.mul(A.z));
        const w = smoothstep(K.x.mul(0.45), K.x.mul(0.45).add(0.55), u.whole);
        const onWorld = vec3(PLANET.x, PLANET.y, PLANET.z).add(S.mul(PLANET_R * 0.985));
        const kick = S.mul(sin(w.mul(Math.PI)).mul(u.boom).mul(K.y.mul(26).add(8)));
        P.material.positionNode = mix(belt, onWorld, w).add(kick);
        // tumbling stones glint as they turn to the sun; light reads along the river as memory
        const tumble = pow(sin(t.mul(K.z.mul(0.9).add(0.2)).add(K.w.mul(40))).mul(0.5).add(0.5), 6);
        const read = pow(sin(ang.mul(9).sub(t.mul(0.35)).add(A.z.mul(0.2))).mul(0.5).add(0.5), 18).mul(u.river);
        const stone = vec3(0.42, 0.38, 0.5).mul(float(0.3).add(tumble.mul(0.8)));
        const glow = vec3(1, 0.78, 0.45).mul(float(0.12).mul(u.river).add(read.mul(0.9)));
        const fire = vec3(1, 0.35, 0.1).mul(sin(w.mul(Math.PI)).mul(u.boom).mul(1.6));
        const fade = float(1).sub(smoothstep(0.8, 1, w).mul(0.92));
        P.material.colorNode = vec4(stone.add(glow).add(fire).mul(P.round).mul(fade), 1);
        g.add(P.cloud.sprite);
        ours.push(P.material);
      }

      /* ---------------- the world as it was: seas and land, thin air, carved by its choices ---------------- */
      {
        const geo = new THREE.SphereGeometry(PLANET_R, 128, 80);
        const m = new THREE.MeshBasicNodeMaterial({ fog: false });
        const nrm = normalize(T.positionGeometry);
        const land = smoothstep(0.48, 0.56, fbmN(nrm.mul(2.6).add(1.3)));
        const lit = max(T.dot(nrm, vec3(SUN.x, SUN.y, SUN.z)), 0).pow(0.8);
        const sea = mix(vec3(0.03, 0.06, 0.12), vec3(0.05, 0.13, 0.22), u.life);
        const ground = mix(vec3(0.18, 0.16, 0.15), vec3(0.28, 0.24, 0.17), fbmN(nrm.mul(9)));
        let c: N = mix(sea, ground, land).mul(lit.mul(1.5).add(0.06));
        // the canyons: a network of ridges carved deeper and wider, choice by choice
        const r1 = abs(fbmN(nrm.mul(4.3).add(7.7)).sub(0.5)), r2 = abs(fbmN(nrm.mul(9.1).add(2.2)).sub(0.5));
        const cut = smoothstep(u.canyon.mul(0.05), 0, r1).add(smoothstep(u.canyon.mul(0.03), 0, r2).mul(smoothstep(0.4, 1, u.canyon)));
        c = c.mul(float(1).sub(cut.mul(0.8))).add(vec3(1, 0.2, 0.05).mul(cut).mul(u.canyon.mul(0.9).add(0.1)));
        // it broke: one crack flashing across the whole of it
        c = c.add(vec3(1, 0.45, 0.2).mul(smoothstep(0.012, 0, r1)).mul(u.broke).mul(2.2));
        // the thin air about it, on the lit limb
        const view = normalize(T.cameraPosition.sub(T.positionWorld));
        const rim = pow(float(1).sub(max(T.dot(T.normalWorld, view), 0)), 3);
        c = c.add(vec3(0.3, 0.5, 0.9).mul(rim).mul(lit.add(0.15)).mul(u.life).mul(0.6));
        m.colorNode = vec4(c, 1);
        // it comes together out of the river and goes back into it: a dissolve
        const dz = hash3(T.floor(T.positionGeometry.mul(1.3)));
        m.maskNode = dz.lessThan(smoothstep(0.82, 1, u.whole).mul(1.02));
        const mesh = new THREE.Mesh(geo, m);
        mesh.position.copy(PLANET);
        mesh.rotation.z = 0.35;
        g.add(mesh);
        ours.push(geo, m);
        (g.userData as { planet?: THREE.Mesh }).planet = mesh;
      }

      /* ---------------- the memory of it at its height: a ghost of light, its cities ---------------- */
      const cityN = 46;
      const cityDirs: THREE.Vector3[] = [];
      {
        // the shell
        const geo = new THREE.SphereGeometry(PLANET_R * 1.01, 96, 64);
        const m = keepAlpha(new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, fog: false }));
        const view = normalize(T.cameraPosition.sub(T.positionWorld));
        const rim = pow(float(1).sub(max(T.dot(T.normalWorld, view), 0)), 2.2);
        // hatred moving outward from the heart: red takes the ghost from the centre of its disc out
        const nrm = normalize(T.positionGeometry);
        const inner = max(T.dot(nrm, normalize(T.cameraPosition.sub(vec3(PLANET.x, PLANET.y, PLANET.z).add(roomOrigin)))), 0);
        const taken = smoothstep(u.spread.mul(1.2).sub(0.2), u.spread.mul(1.2), float(1).sub(inner));
        const consumed = float(1).sub(taken.mul(smoothstep(0.7, 1, u.spread)));
        const col = mix(vec3(0.45, 0.62, 1), vec3(1, 0.18, 0.05), taken.mul(u.hate));
        m.colorNode = vec4(col.mul(rim.mul(0.55).add(0.04)).mul(u.ghost).mul(consumed), 1);
        const mesh = new THREE.Mesh(geo, m);
        mesh.position.copy(PLANET);
        g.add(mesh);
        ours.push(geo, m);
        // the cities: small clusters on the side toward you, joined as constellations are
        for (let i = 0; i < cityN; i++) {
          const v = new THREE.Vector3(R() * 2 - 1, R() * 1.6 - 0.8, 0.35 + R()).normalize();
          cityDirs.push(v);
        }
        const per = 30;
        const C = pointCloud(cityN * per, 0.5);
        for (let i = 0; i < cityN; i++)
          for (let j = 0; j < per; j++) {
            const v = cityDirs[i].clone().add(new THREE.Vector3(gauss(R), gauss(R), gauss(R)).multiplyScalar(0.035)).normalize().multiplyScalar(PLANET_R * 1.02);
            C.pos.set([v.x, v.y, v.z], (i * per + j) * 3);
            C.k.set([i / cityN, R(), R(), strongCity(i)], (i * per + j) * 4);
          }
        touch(C.cloud);
        const K = C.cloud.nodes.aK;
        const strong = K.w;
        // the strong take a little more; the rest learn not to look
        const share = mix(float(1), mix(float(0.18), float(2.4), strong), u.drift);
        const tw = sin(t.mul(float(1.3).add(K.z)).add(K.y.mul(30))).mul(0.2).add(0.8);
        const hurt = smoothstep(u.spread.mul(1.2).sub(0.25), u.spread.mul(1.2), K.y.mul(0.3).add(K.x.mul(0.7))).mul(u.hate);
        const cc = mix(vec3(1, 0.86, 0.6), vec3(1, 0.2, 0.05), hurt);
        C.material.colorNode = vec4(cc.mul(C.round).mul(share).mul(tw).mul(u.cities).mul(float(1).sub(smoothstep(0.75, 1, u.spread))).mul(0.9), 1);
        C.cloud.sprite.position.copy(PLANET);
        g.add(C.cloud.sprite);
        ours.push(C.material);
        // constellation lines between near cities
        const pairs: number[] = [];
        for (let i = 0; i < cityN; i++) {
          const near = cityDirs.map((d, j) => [d.distanceTo(cityDirs[i]), j] as const).filter(([, j]) => j > i).sort((a, b) => a[0] - b[0]).slice(0, 2);
          for (const [d, j] of near) {
            if (d > 0.55) continue;
            const a = cityDirs[i].clone().multiplyScalar(PLANET_R * 1.03), b = cityDirs[j].clone().multiplyScalar(PLANET_R * 1.03);
            pairs.push(a.x, a.y, a.z, b.x, b.y, b.z);
          }
        }
        const lg = ribbonGeometry(pairs);
        const lm = keepAlpha(ribbonMaterial(vec3(1, 0.85, 0.6).mul(u.cities).mul(float(1).sub(u.drift.mul(0.55))).mul(float(1).sub(u.spread)).mul(0.45), 0.5));
        const lines = new THREE.Mesh(lg, lm);
        lines.position.copy(PLANET);
        lines.frustumCulled = false;
        g.add(lines);
        ours.push(lg, lm);
      }

      /* ---------------- lights: the burst, hatred's heart, and the seed at the end ---------------- */
      {
        const sprite = (color: N, k: N, size: number, at: THREE.Vector3) => {
          const m = keepAlpha(new THREE.SpriteNodeMaterial({ transparent: true, depthWrite: false, fog: false }));
          const r = length(uv().sub(0.5)).mul(2);
          m.colorNode = vec4(color.mul(exp(r.mul(r).mul(-5))).mul(smoothstep(1, 0.5, r)).mul(k), 1);
          const s = new THREE.Sprite(m);
          s.position.copy(at);
          s.scale.setScalar(size);
          g.add(s);
          ours.push(m);
          return s;
        };
        sprite(vec3(1, 0.45, 0.15), u.boom.mul(0.8), PLANET_R * 1.7, PLANET);
        sprite(vec3(1, 0.16, 0.04), u.hate.mul(float(1).sub(smoothstep(0.8, 1, u.spread).mul(0.7))).mul(sin(t.mul(2.2)).mul(0.2).add(0.9)), PLANET_R * 1.1, PLANET);
        // the seed: a small warm light where the world was, kindling, and at the end a world of light
        const seedAt = PLANET.clone().add(new THREE.Vector3(0, -6, 10));
        sprite(vec3(1, 0.86, 0.55), u.seed.mul(sin(t.mul(1.6)).mul(0.15).add(0.85)).mul(0.9), 7, seedAt);
        sprite(vec3(0.7, 0.95, 0.6), u.bloom.mul(0.5), 30, seedAt);
        const ball = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 32), keepAlpha(new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, fog: false })));
        {
          const view = normalize(T.cameraPosition.sub(T.positionWorld));
          const rim = pow(float(1).sub(max(T.dot(T.normalWorld, view), 0)), 1.6);
          const land = smoothstep(0.45, 0.6, fbmN(normalize(T.positionGeometry).mul(3).add(t.mul(0.02))));
          (ball.material as THREE.MeshBasicNodeMaterial).colorNode = vec4(mix(vec3(0.55, 0.8, 1), vec3(0.7, 1, 0.55), land).mul(rim.mul(0.8).add(0.12)).mul(u.bloom), 1);
        }
        ball.position.copy(seedAt);
        g.add(ball);
        ours.push(ball.geometry, ball.material as THREE.Material);
        (g.userData as { ball?: THREE.Mesh }).ball = ball;
      }

      const ud = g.userData as { planet?: THREE.Mesh; ball?: THREE.Mesh };
      return {
        update(dt, f, _on, still) {
          applyAir(air);
          tl.step(f, dt, still);
          if (ud.planet) (ud.planet.rotation.y += dt * 0.02), (ud.planet.visible = tl.v.whole > 0.8);
          if (ud.ball) {
            const s = 0.4 + tl.v.bloom * 5.6;
            ud.ball.scale.setScalar(s);
            ud.ball.visible = tl.v.bloom > 0.01;
            ud.ball.rotation.y += dt * 0.05;
          }
        },
        dispose() {
          for (const o of ours) o.dispose();
        },
      };
    },
  });
}

/** The strong cities: a few of them. */
const strongCity = (i: number) => (i % 7 === 0 || i % 11 === 3 ? 1 : 0);
/** A rough gaussian from a uniform stream. */
function gauss(R: () => number): number {
  return (R() + R() + R() + R() - 2) * 0.87;
}
/** Value noise on the CPU for shaping rock (0–1). */
function vnoiseJs(x: number, y: number): number {
  const h = (a: number, b: number) => {
    const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
    return s - Math.floor(s);
  };
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const a = h(ix, iy), b = h(ix + 1, iy), c = h(ix, iy + 1), d = h(ix + 1, iy + 1);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}
