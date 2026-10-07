/* Past choices, the third: Atlantis. A marble jetty at the end of an old causeway, its flags
   cracked, two columns standing, the sea wide and dark under a violet dusk.

   The telling, as it goes: bells, far out, felt more than heard: rings of light spread over the
   water from a glow beneath it. Then the island rises out of the sea as it was, after Plato's plan:
   rings of land and water about a central hill, white terraces and houses lit sea-blue, a temple
   on the hill and a great crystal over it, crystal towers on the middle ring. Focused light: beams
   from the towers into the sky and between them. Then conditional service: the beams turn, light
   is drawn in from the rings to the centre, the outer rings dimming, the crystal swelling; within
   its white a red core shows, the fist in the glove of the open hand. Misdirected: a red beam bent
   down into the island, red cracks through the rings; the island breaks and sinks, the sea closing
   over it, and the bells go down with it. Not everyone drowned: small warm lights leave across the
   water in two streams, to a low jungle coast in the south and mountains in the east, where they
   kindle and then go underground, like seeds, glowing faintly under the soil. The drowned city's
   glow under the sea; on the far horizon a line of lights of our own age; the sea's slow swell. At
   the end the bells again, and the seeds on both shores rising into warm light. */
import * as THREE from "three/webgpu";
import { T, vnoise, type N } from "../../gpu/tsl";
import { applyAir, boulderGeometry, fbmN, keepAlpha, merge, pointCloud, roomPos, seeded, skyDome, spireGeometry, touch, type Air } from "../densities/roomKit";
import { landStone } from "../../world/stoneworks";
import { quartz } from "../adept/monument";
import type { Narration } from "../../core/narration";
import type { Room } from "../journey";
import { Tells, flutedColumn, gold, marble, seatedRoom, starField } from "./kit";

const { abs, exp, float, fract, length, max, mix, normalize, pow, sin, cos, smoothstep, uv, vec2, vec3, vec4 } = T;

/** Room frame: the seat at the origin looking toward −z; the island out to sea. */
const ISLE = new THREE.Vector3(0, 0, -122); // close: it fills the view (the owner: "city closer")
const SEA_Y = -1.3;
const MOON = new THREE.Vector3(-0.35, 0.22, -0.9).normalize();
const SOUTH = new THREE.Vector3(-170, 0, -430);
const EAST = new THREE.Vector3(190, 0, -470);

export function createAtlantisScene(scene: THREE.Scene, narration: Narration, whisper: (t: string, ms?: number) => void): Room {
  return seatedRoom(scene, narration, whisper, {
    id: "past_atlantis",
    track: "audio/past/past_atlantis.mp3",
    len: 158.9,
    seat: new THREE.Vector3(0, 0, 0),
    heading: 0,
    make: (g, t) => {
      const ours: { dispose(): void }[] = [];
      const R = seeded(7707);
      const tl = new Tells({
        bells: [[0.02, 0], [0.04, 1], [0.15, 1], [0.19, 0], [0.9, 0], [0.925, 1], [1, 1]],
        deep: [[0.06, 0], [0.1, 0.7], [0.16, 0.7], [0.2, 0], [0.7, 0], [0.76, 0.8], [1, 0.9]],
        rise: [[0.17, 0], [0.235, 1]],
        pour: [[0.205, 0], [0.225, 1], [0.27, 1], [0.31, 0]],
        lights: [[0.2, 0], [0.24, 1], [0.34, 1], [0.44, 0.45], [0.5, 0]],
        beams: [[0.225, 0], [0.25, 1], [0.335, 1], [0.36, 0]],
        inward: [[0.34, 0], [0.37, 1], [0.47, 1], [0.5, 0]],
        glove: [[0.375, 0], [0.4, 1], [0.52, 1], [0.55, 0]],
        wrong: [[0.415, 0], [0.44, 1], [0.49, 1], [0.52, 0]],
        sink: [[0.468, 0], [0.535, 1]],
        leave: [[0.455, 0], [0.62, 1]],
        seeds: [[0.56, 0], [0.62, 1], [0.66, 1], [0.7, 0.35], [0.92, 0.35], [1, 1.2]],
        age: [[0.8, 0], [0.83, 1], [0.9, 1], [0.95, 0.4]],
        swell: [[0.885, 0], [0.905, 1], [0.95, 0.3]],
      });
      const u = tl.u;
      /** Seconds since the island broke (0 before): the burst, the shockwave, the steam. */
      const uBoom = T.uniform(0);
      const BOOM_AT = 0.47, LEN = 158.9;
      const air: Air = {
        color: new THREE.Color(0.1, 0.08, 0.13),
        glow: new THREE.Color(0.22, 0.16, 0.24),
        glowDir: MOON.clone(),
        density: 0.0018,
        shadow: new THREE.Color(0.01, 0.014, 0.04),
        sat: 1.05,
        contrast: 1.05,
      };

      /* ---------------- the dusk: violet low over the sea, deep blue above, stars, a moon ---------------- */
      {
        const sky = skyDome(1600, new THREE.Color(0.28, 0.2, 0.3), new THREE.Color(0.02, 0.03, 0.08), {
          glowDir: MOON,
          glow: new THREE.Color(0.18, 0.18, 0.26),
          glowPow: 18,
          extra: (d, c) => {
            const moon = smoothstep(0.9990, 0.9994, T.dot(d, vec3(MOON.x, MOON.y, MOON.z)));
            // our own age: a thin line of lights along the far horizon ahead
            const line = smoothstep(0.012, 0.0, abs(d.y.sub(0.004))).mul(smoothstep(0.35, 0.0, abs(d.x))).mul(step01(d.z.negate()));
            const city = pow(fract(T.sin(T.floor(d.x.mul(900)).mul(12.9898)).mul(43758.5453)), 4).mul(line);
            return c.add(vec3(starField(d, t, 0.005)).mul(0.9)).add(vec3(0.95, 0.92, 0.85).mul(moon).mul(1.6)).add(vec3(1, 0.62, 0.3).mul(city.mul(2).add(line.mul(0.08))).mul(u.age));
          },
        });
        g.add(sky.mesh);
        ours.push(sky);
      }

      /* ---------------- the sea: the moon's path, bells as rings of light, the drowned glow below ---------------- */
      {
        const geo = new THREE.PlaneGeometry(3200, 3200);
        geo.rotateX(-Math.PI / 2);
        const m = new THREE.MeshBasicNodeMaterial({ fog: true });
        const P = roomPos;
        const view = normalize(T.positionWorld.sub(T.cameraPosition));
        const refl = vec3(view.x, view.y.negate(), view.z);
        const amp = float(1).add(u.swell.mul(1.4));
        const wave = vnoise(P.xz.mul(vec2(0.18, 0.5)).add(vec2(t.mul(0.1), t.mul(0.03)))).mul(0.6).add(vnoise(P.xz.mul(0.9).add(vec2(0, t.mul(0.25)))).mul(0.4));
        const path = pow(max(T.dot(refl, vec3(MOON.x, MOON.y, MOON.z)), 0), 30).mul(wave.mul(amp).mul(1.4));
        const fres = pow(float(1).sub(max(view.y.negate(), 0)), 5);
        let c: N = mix(vec3(0.012, 0.022, 0.04), vec3(0.2, 0.15, 0.24), fres).add(vec3(0.85, 0.85, 1).mul(path).mul(0.5));
        const d = length(P.xz.sub(vec2(ISLE.x, ISLE.z)));
        // the bells: rings of light running out over the water from the drowned city
        const ring = pow(sin(d.mul(0.09).sub(t.mul(0.9))).mul(0.5).add(0.5), 22).mul(exp(d.mul(-0.006)));
        c = c.add(vec3(0.55, 0.8, 1).mul(ring).mul(u.bells).mul(1.3));
        // the break: a ring of light racing out over the sea from the island, and the water lit
        // from beneath where it burst
        const live = smoothstep(0, 0.05, uBoom);
        const front = uBoom.mul(48);
        const wave1 = exp(d.sub(front).mul(d.sub(front)).mul(-0.004)).mul(exp(uBoom.mul(-0.22)));
        const wave2 = exp(d.sub(front.mul(0.62)).mul(d.sub(front.mul(0.62))).mul(-0.01)).mul(exp(uBoom.mul(-0.35))).mul(0.6);
        c = c.add(vec3(1, 0.62, 0.32).mul(wave1.add(wave2)).mul(live).mul(1.6));
        c = c.add(vec3(1, 0.35, 0.1).mul(exp(d.mul(d).mul(-0.00025))).mul(exp(uBoom.mul(-0.4))).mul(live).mul(0.8));
        // the city under the water: its rings as a faint glow
        const plan = smoothstep(0.35, 0.0, abs(fract(d.div(14)).sub(0.5))).mul(smoothstep(80, 10, d));
        c = c.add(vec3(0.25, 0.6, 0.85).mul(plan.mul(0.5).add(exp(d.mul(d).mul(-0.0004)).mul(0.5))).mul(u.deep).mul(0.35));
        m.colorNode = vec4(c, 1);
        const sea = new THREE.Mesh(geo, m);
        sea.position.y = SEA_Y;
        g.add(sea);
        ours.push(geo, m);
      }

      /* ---------------- the jetty: flags, steps down into the sea, two columns, a broken balustrade ---------------- */
      {
        const parts: THREE.BufferGeometry[] = [];
        const deck = new THREE.BoxGeometry(14, 1.4, 16);
        deck.translate(0, -0.7, 1);
        parts.push(deck);
        for (let k = 0; k < 4; k++) {
          const st = new THREE.BoxGeometry(10 - k, 0.34, 0.9);
          st.translate(0, -0.17 - k * 0.34 - 0.34, -7 - 0.45 - k * 0.9);
          parts.push(st);
        }
        // the old causeway behind, and its piers
        const cw = new THREE.BoxGeometry(6, 1.4, 60);
        cw.translate(0, -0.7, 38);
        parts.push(cw);
        const floor = new THREE.Mesh(merge(parts), marble(2.2, { flag: 1.2, course: 0.34 }));
        floor.receiveShadow = floor.castShadow = true;
        g.add(floor);
        ours.push(floor.geometry, floor.material as THREE.Material);
        const cols: THREE.BufferGeometry[] = [];
        for (const [x, z, h] of [[-6, -5.5, 8], [6, -5.5, 5.2]] as const) {
          const c = flutedColumn(0.55, h, 20);
          c.translate(x, 0, z);
          cols.push(c);
        }
        const posts: THREE.BufferGeometry[] = [];
        for (let k = 0; k < 18; k++) {
          const x = -6.6 + k * 0.78;
          if (k === 6 || k === 7 || k === 13) continue;
          const p = flutedColumn(0.1, 0.9, 8);
          p.translate(x, 0, 8.6);
          posts.push(p);
        }
        const cm = marble(1.5);
        const cmesh = new THREE.Mesh(merge([...cols, ...posts]), cm);
        cmesh.castShadow = true;
        g.add(cmesh);
        ours.push(cmesh.geometry, cm);
        // a fallen capital and drums on the flags
        const fallen: THREE.BufferGeometry[] = [];
        for (let k = 0; k < 3; k++) {
          const d = new THREE.CylinderGeometry(0.52, 0.55, 1.4, 20);
          d.rotateX(Math.PI / 2);
          d.rotateY(0.9 + k * 0.1);
          d.translate(4.3 + k * 0.9, 0.5, -3.8 + k * 1.25);
          fallen.push(d);
        }
        const fm = marble(1.4);
        g.add(new THREE.Mesh(merge(fallen), fm));
        ours.push(fm);
        // gilded caps on the standing columns
        const caps = [new THREE.BoxGeometry(1.6, 0.25, 1.6)];
        caps[0].translate(-6, 8.1, -5.5);
        const gm = gold(0.1);
        g.add(new THREE.Mesh(merge(caps), gm));
        ours.push(gm);
        const moon = new THREE.DirectionalLight(0xd8dcff, 1.1);
        moon.position.copy(MOON).multiplyScalar(60);
        moon.castShadow = true;
        g.add(moon, moon.target);
        g.add(new THREE.HemisphereLight(0x6a5a8a, 0x080a12, 0.45));
      }

      /* ---------------- the far shores: a low jungle coast to the south, mountains to the east ---------------- */
      {
        const land: THREE.BufferGeometry[] = [];
        for (let i = 0; i < 9; i++) {
          const b = boulderGeometry(40 + R() * 50, i * 5.1);
          b.scale(1.6, 0.35, 1);
          b.translate(SOUTH.x + (R() - 0.5) * 260, SEA_Y - 4, SOUTH.z + (R() - 0.5) * 160);
          land.push(b);
        }
        for (let i = 0; i < 7; i++) {
          const sp = spireGeometry(34 + R() * 30, 45 + R() * 55, i * 3.3, 9);
          sp.translate(EAST.x + (R() - 0.5) * 260, SEA_Y - 6, EAST.z - R() * 160);
          land.push(sp);
        }
        const lm = landStone("sandstone_cracks", -10, 14, [0.22, 0.22, 0.28]);
        g.add(new THREE.Mesh(merge(land), lm));
        ours.push(lm);
      }

      /* ---------------- the island city, after Plato's plan ---------------- */
      const isle = new THREE.Group();
      isle.position.copy(ISLE);
      g.add(isle);
      const lightsAt: THREE.Vector3[] = [];
      {
        const annulus = (r0: number, r1: number, h: number) =>
          new THREE.LatheGeometry([new THREE.Vector2(r0, -12), new THREE.Vector2(r1, -12), new THREE.Vector2(r1, h), new THREE.Vector2(r0 + 0.6, h)], 96);
        const parts: THREE.BufferGeometry[] = [];
        parts.push(new THREE.LatheGeometry([new THREE.Vector2(0.01, 10), new THREE.Vector2(6, 9.4), new THREE.Vector2(10, 6), new THREE.Vector2(13, 3), new THREE.Vector2(14, -12)], 64));
        parts.push(annulus(22, 34, 3.2), annulus(44, 58, 2.4), annulus(70, 86, 1.8));
        const houses: THREE.BufferGeometry[] = [];
        for (const [r0, r1, h, n] of [[23, 33, 3.2, 90], [45, 57, 2.4, 140], [71, 85, 1.8, 170]] as const) {
          for (let i = 0; i < n; i++) {
            const a = R() * Math.PI * 2, r = r0 + 1 + R() * (r1 - r0 - 2);
            const w = 2 + R() * 3, hh = 2 + R() * 5 * (1 - r0 / 100);
            const b = new THREE.BoxGeometry(w, hh, w * (0.6 + R() * 0.6));
            b.rotateY(a);
            b.translate(Math.cos(a) * r, h + hh / 2, Math.sin(a) * r);
            houses.push(b);
            if (R() < 0.6) lightsAt.push(new THREE.Vector3(Math.cos(a) * r, h + hh * (0.4 + R() * 0.5), Math.sin(a) * r));
          }
        }
        // the temple on the hill: a ring of columns, a dome
        for (let k = 0; k < 12; k++) {
          const a = (k / 12) * Math.PI * 2;
          const c = flutedColumn(0.5, 6, 12);
          c.translate(Math.cos(a) * 5, 9.4, Math.sin(a) * 5);
          houses.push(c);
        }
        const dome = new THREE.SphereGeometry(5.8, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2);
        dome.translate(0, 15.4, 0);
        houses.push(dome);
        const lm = marble(3.2);
        const hm = marble(2.2);
        const landMesh = new THREE.Mesh(merge(parts), lm);
        const houseMesh = new THREE.Mesh(merge(houses), hm);
        isle.add(landMesh, houseMesh);
        ours.push(landMesh.geometry, lm, houseMesh.geometry, hm);
        // the great crystal over the temple, and six crystal towers on the middle ring
        const crystal = quartz(3.4, 34, 0.05, 0.4);
        crystal.position.y = 18;
        isle.add(crystal);
        ours.push(crystal.geometry, crystal.material as THREE.Material);
        const towers: THREE.BufferGeometry[] = [];
        const tops: THREE.Vector3[] = [];
        for (let k = 0; k < 6; k++) {
          const a = (k / 6) * Math.PI * 2 + 0.3;
          const x = Math.cos(a) * 51, z = Math.sin(a) * 51;
          const tw = new THREE.CylinderGeometry(1.1, 1.8, 22, 12);
          tw.translate(x, 2.4 + 11, z);
          towers.push(tw);
          const q = quartz(1.1, 7, 0.05, 0.5);
          q.position.set(x, 24.4, z);
          isle.add(q);
          ours.push(q.geometry, q.material as THREE.Material);
          tops.push(new THREE.Vector3(x, 28, z));
        }
        const tm = marble(2);
        const tmesh = new THREE.Mesh(merge(towers), tm);
        isle.add(tmesh);
        ours.push(tmesh.geometry, tm);
        // the crystal's glow: white over a red core (the glove over the fist)
        {
          const m = keepAlpha(new THREE.SpriteNodeMaterial({ transparent: true, depthWrite: false, fog: false }));
          const r = length(uv().sub(0.5).mul(vec2(1.6, 1))).mul(2);
          const white = vec3(0.8, 0.92, 1).mul(exp(r.mul(r).mul(-3)));
          const core = vec3(1, 0.15, 0.04).mul(exp(r.mul(r).mul(-18))).mul(u.glove);
          const k = u.lights.mul(float(0.6).add(u.inward.mul(0.9)));
          m.colorNode = vec4(white.mul(k).mul(smoothstep(1, 0.6, r)).add(core.mul(1.4)).mul(float(1).sub(u.sink)), 1);
          const s = new THREE.Sprite(m);
          s.position.y = 32;
          s.scale.set(26, 44, 1);
          isle.add(s);
          ours.push(m);
        }
        // the city's lights, sea-blue and white; drawn toward the centre when it serves itself
        {
          const L = pointCloud(lightsAt.length, 1.1);
          lightsAt.forEach((p, i) => {
            L.pos.set([p.x, p.y, p.z], i * 3);
            L.k.set([R(), R(), Math.hypot(p.x, p.z) / 86, R()], i * 4);
          });
          touch(L.cloud);
          const K = L.cloud.nodes.aK;
          const far = K.z;
          const dim = mix(float(1), float(1.3).sub(far), u.inward);
          const tw = sin(t.mul(float(0.6).add(K.x)).add(K.y.mul(40))).mul(0.15).add(0.85);
          L.material.colorNode = vec4(mix(vec3(0.6, 0.85, 1), vec3(1, 0.9, 0.7), K.w).mul(L.round).mul(tw).mul(dim.max(0)).mul(u.lights).mul(0.9), 1);
          isle.add(L.cloud.sprite);
          ours.push(L.material);
        }
        // focused light: beams from the towers up, and between them; later drawn inward along the ground
        {
          const n = 5200;
          const B = pointCloud(n, 0.45);
          const aT = new Float32Array(n * 3), aE = new Float32Array(n * 3);
          for (let i = 0; i < n; i++) {
            const k = i % 6, top = tops[k];
            const kind = R();
            let e: THREE.Vector3;
            if (kind < 0.45) e = top.clone().add(new THREE.Vector3(0, 220, 0)); // up into the sky
            else if (kind < 0.8) e = tops[(k + 1) % 6].clone(); // to the next tower
            else e = new THREE.Vector3(0, 30, 0); // to the great crystal
            aT.set([top.x, top.y, top.z], i * 3);
            aE.set([e.x, e.y, e.z], i * 3);
            B.k.set([R(), kind, R(), R()], i * 4);
          }
          const bT = new THREE.InstancedBufferAttribute(aT, 3), bE = new THREE.InstancedBufferAttribute(aE, 3);
          B.cloud.sprite.geometry.setAttribute("aT", bT);
          B.cloud.sprite.geometry.setAttribute("aE", bE);
          touch(B.cloud);
          const K = B.cloud.nodes.aK, A = T.instancedBufferAttribute(bT), E = T.instancedBufferAttribute(bE);
          const fOut = fract(K.x.add(t.mul(0.35)));
          // serving itself: every beam runs the other way, into the centre
          const s = mix(fOut, float(1).sub(fOut), u.inward);
          const start = mix(A, vec3(A.x.mul(1.7), 3, A.z.mul(1.7)), u.inward); // drawn in from the outer ring
          const end = mix(E, vec3(0, 30, 0), u.inward);
          B.material.positionNode = mix(start, end, s).add(vec3(sin(K.z.mul(50)), cos(K.w.mul(50)), 0).mul(0.25));
          const col = mix(vec3(0.7, 0.9, 1), vec3(1, 0.4, 0.2), u.inward.mul(0.6).add(u.wrong.mul(0.4)));
          B.material.colorNode = vec4(col.mul(B.round).mul(u.beams.add(u.inward).min(1)).mul(float(1).sub(u.sink)).mul(0.7), 1);
          isle.add(B.cloud.sprite);
          ours.push(B.material);
        }
        // misdirected: a red beam bent down into the island, and red cracks through its rings
        {
          const n = 2400;
          const W = pointCloud(n, 0.6);
          for (let i = 0; i < n; i++) W.k.set([R(), R(), R(), R()], i * 4);
          touch(W.cloud);
          const K = W.cloud.nodes.aK;
          const s = fract(K.x.add(t.mul(0.6)));
          const a = K.y.mul(6.28);
          const hit = vec3(cos(a).mul(K.z.mul(70)), 2, sin(a).mul(K.z.mul(70)));
          const bend = vec3(0, 60, 0);
          const p0 = vec3(0, 34, 0);
          const q = mix(mix(p0, bend, s), mix(bend, hit, s), s);
          W.material.positionNode = q;
          W.material.colorNode = vec4(vec3(1, 0.22, 0.06).mul(W.round).mul(u.wrong).mul(1.2), 1);
          isle.add(W.cloud.sprite);
          ours.push(W.material);
          const cm = (landMesh.material as THREE.MeshStandardNodeMaterial);
          const cr = abs(fbmN(roomPos.xz.mul(0.05)).sub(0.5));
          cm.emissiveNode = vec3(1, 0.2, 0.05).mul(smoothstep(0.03, 0, cr)).mul(u.wrong.add(u.sink.mul(0.5)).min(1)).mul(float(1).sub(smoothstep(0.7, 1, u.sink)));
        }
      }

      /* ---------------- rising: the sea pours off the island's rings as it comes up ---------------- */
      {
        const n = 7000;
        const W = pointCloud(n, 0.6);
        const radii = [14, 22, 34, 44, 58, 70, 86];
        const aE = new Float32Array(n * 3);
        for (let i = 0; i < n; i++) {
          const rr = radii[i % radii.length] + (R() - 0.5) * 0.6, a = R() * Math.PI * 2;
          aE.set([Math.cos(a) * rr, rr < 20 ? 4 : 3.2 - (rr / 86) * 1.6, Math.sin(a) * rr], i * 3);
          W.k.set([R(), R(), R(), R()], i * 4);
        }
        const bE = new THREE.InstancedBufferAttribute(aE, 3);
        W.cloud.sprite.geometry.setAttribute("aE", bE);
        touch(W.cloud);
        const K = W.cloud.nodes.aK, E = T.instancedBufferAttribute(bE);
        const s = fract(K.x.add(t.mul(float(0.45).add(K.y.mul(0.3)))));
        const out = normalize(vec3(E.x, 0, E.z)).mul(s.mul(2.5));
        W.material.positionNode = E.add(out).add(vec3(0, s.mul(s).mul(-16), 0));
        // only while it rises (most as it breaks the surface), fading as each drop falls
        const pouring = u.pour; // from when its rings break the surface until the sea has run off
        W.material.colorNode = vec4(vec3(0.62, 0.82, 1).mul(W.round).mul(float(1).sub(s)).mul(pouring).mul(1.1), 1);
        isle.add(W.cloud.sprite);
        ours.push(W.material);
      }

      /* ---------------- the break: the great crystal bursts ---------------- */
      {
        // a burst of light in thousands of sparks, white-hot to gold to ember, flung out in arcs
        // under their own weight; a flash; and steam rising slowly where the island goes down
        const n = 16000;
        const X = pointCloud(n, 0.8);
        const aV = new Float32Array(n * 3);
        for (let i = 0; i < n; i++) {
          const a = R() * Math.PI * 2, up = 0.15 + Math.pow(R(), 0.7) * 0.85;
          const h = Math.sqrt(1 - up * up), sp = 14 + Math.pow(R(), 2.2) * 80;
          aV.set([Math.cos(a) * h * sp, up * sp, Math.sin(a) * h * sp], i * 3);
          X.k.set([R(), R(), R(), R()], i * 4);
        }
        const bV = new THREE.InstancedBufferAttribute(aV, 3);
        X.cloud.sprite.geometry.setAttribute("aV", bV);
        touch(X.cloud);
        const K = X.cloud.nodes.aK, V = T.instancedBufferAttribute(bV);
        const tau = max(uBoom.sub(K.x.mul(0.6)), 0); // a few go a moment later: it keeps breaking
        const drag = float(1).sub(exp(tau.mul(-0.9))).div(0.9);
        const o = vec3(ISLE.x, 30, ISLE.z).add(vec3(K.z.sub(0.5), K.w.sub(0.5), K.y.sub(0.5)).mul(6));
        const p = o.add(V.mul(drag)).add(vec3(0, tau.mul(tau).mul(-4.2), 0));
        X.material.positionNode = p;
        const life = float(3).add(K.y.mul(6));
        const age = tau.div(life);
        const alive = smoothstep(1, 0.8, age).mul(smoothstep(0, 0.02, uBoom)).mul(smoothstep(SEA_Y - 1, SEA_Y + 1, p.y));
        const hot = mix(mix(vec3(1, 0.96, 0.85), vec3(1, 0.62, 0.18), smoothstep(0, 0.3, age)), vec3(0.75, 0.12, 0.03), smoothstep(0.3, 0.85, age));
        X.material.colorNode = vec4(hot.mul(X.round).mul(alive).mul(pow(float(1).sub(age).max(0), 1.2)).mul(1.1), 1);
        g.add(X.cloud.sprite);
        ours.push(X.material);
        // the flash, over in a moment
        const fm = keepAlpha(new THREE.SpriteNodeMaterial({ transparent: true, depthWrite: false, fog: false }));
        const rr = length(uv().sub(0.5)).mul(2);
        fm.colorNode = vec4(vec3(1, 0.85, 0.65).mul(exp(rr.mul(rr).mul(-5))).mul(exp(uBoom.mul(-1.6))).mul(smoothstep(0, 0.04, uBoom)).mul(1.6), 1);
        const flash = new THREE.Sprite(fm);
        flash.position.set(ISLE.x, 30, ISLE.z);
        flash.scale.setScalar(90);
        g.add(flash);
        ours.push(fm);
        // steam: pale and slow, rising where the sea closes over it
        const m = 1400;
        const St = pointCloud(m, 2.6);
        for (let i = 0; i < m; i++) St.k.set([R(), R(), R(), R()], i * 4);
        touch(St.cloud);
        const Ks = St.cloud.nodes.aK;
        const sa = Ks.x.mul(6.28), sr = Ks.y.mul(80);
        const rise = fract(Ks.z.add(t.mul(0.05)));
        St.material.positionNode = vec3(ISLE.x, SEA_Y, ISLE.z).add(vec3(cos(sa).mul(sr), rise.mul(24), sin(sa).mul(sr))).add(vec3(sin(t.mul(0.2).add(Ks.w.mul(9))).mul(rise.mul(6)), 0, 0));
        const steam = smoothstep(0.5, 4, uBoom).mul(smoothstep(60, 20, uBoom));
        St.material.colorNode = vec4(vec3(0.5, 0.5, 0.6).mul(St.round).mul(float(1).sub(rise)).mul(steam).mul(0.09), 1);
        g.add(St.cloud.sprite);
        ours.push(St.material);
      }

      /* ---------------- not everyone drowned: two streams of warm lights over the water ---------------- */
      {
        const n = 900;
        const S = pointCloud(n, 2);
        const aD = new Float32Array(n * 3);
        for (let i = 0; i < n; i++) {
          const to = i % 2 === 0 ? SOUTH : EAST;
          const spread = new THREE.Vector3((R() - 0.5) * 110, 0, (R() - 0.5) * 70);
          const d = to.clone().add(spread);
          aD.set([d.x, i % 2 === 0 ? SEA_Y + 6 + R() * 8 : SEA_Y + 20 + R() * 90, d.z], i * 3);
          S.k.set([R(), i % 2, R(), R()], i * 4);
        }
        const bD = new THREE.InstancedBufferAttribute(aD, 3);
        S.cloud.sprite.geometry.setAttribute("aD", bD);
        touch(S.cloud);
        const K = S.cloud.nodes.aK, D = T.instancedBufferAttribute(bD);
        const s = T.clamp(u.leave.mul(1.6).sub(K.x.mul(0.6)), 0, 1);
        const from = vec3(ISLE.x, SEA_Y + 3, ISLE.z).add(vec3(K.z.sub(0.5).mul(40), 0, K.w.sub(0.5).mul(40)));
        const low = vec3(0, 1.5, 0).add(vec3(0, sin(s.mul(Math.PI)).mul(3), 0));
        const onWater = mix(from, D.mul(vec3(1, 0, 1)).add(vec3(0, SEA_Y, 0)), s).add(low);
        const settled = D;
        const p = mix(onWater, settled, smoothstep(0.85, 1, s));
        // after they arrive they go underground like seeds: they sink a little and glow beneath
        S.material.positionNode = p.sub(vec3(0, smoothstep(0.6, 0.35, u.seeds).mul(smoothstep(0.99, 1, s)).mul(4), 0));
        const travelling = smoothstep(0, 0.03, s).mul(smoothstep(1, 0.85, s));
        const arrived = smoothstep(0.95, 1, s).mul(u.seeds);
        const tw = sin(t.mul(float(1.1).add(K.z)).add(K.w.mul(30))).mul(0.2).add(0.8);
        S.material.colorNode = vec4(mix(vec3(1, 0.82, 0.5), vec3(0.8, 1, 0.6), K.y.mul(0.3)).mul(S.round).mul(tw).mul(travelling.mul(0.9).add(arrived.mul(0.8))), 1);
        g.add(S.cloud.sprite);
        ours.push(S.material);
      }

      const ud = { isle };
      return {
        update(dt, f, _on, still) {
          applyAir(air);
          tl.step(f, dt, still);
          const v = tl.v;
          uBoom.value = Math.max(0, (f - BOOM_AT) * LEN);
          // risen out of the sea, then broken and sunk
          ud.isle.position.y = ISLE.y - 70 * (1 - v.rise) - 80 * v.sink;
          const shake = v.sink > 0 && v.sink < 0.9 ? (1 - v.sink) * 0.5 : 0;
          ud.isle.position.x = ISLE.x + Math.sin(f * LEN * 31) * shake;
          ud.isle.rotation.z = v.sink * 0.06;
          ud.isle.rotation.x = -v.sink * 0.04;
          ud.isle.visible = v.rise > 0.01 && v.sink < 0.995;
        },
        dispose() {
          for (const o of ours) o.dispose();
        },
      };
    },
  });
}

/** 1 in front (toward −z), 0 behind. */
function step01(x: N): N {
  return smoothstep(0, 0.05, x);
}
