/* The second density: learning to grow. The green world in early light: a meadow rolling away
   under a pale gold morning, trees that grow in visible pulses of time, flowers that turn their
   cups toward the shafts of light as the light moves, a herd moving as one body along the far
   meadow, a flock wheeling overhead in one formation, pollen rising. Everything reaches upward.
   The animals are the game's real ones (mirada's horses and storks, in the glass light the
   wanderer is made of); primates are left out, as the house rule is real animated models or
   nothing, and there is no primate model yet.
   The way on: two trees leaning together into an arch, light between them. */
import * as THREE from "three/webgpu";
import { LessonScene } from "../lessonKit";
import type { LessonCtx, LessonOpts, SceneModule } from "../lessonKit";
import { T, spriteCloud, vnoise } from "../../gpu/tsl";
import { barkMaterial, grow, SHAPES, tubes } from "../../world/creation";
import { herdOf, type Animal } from "../../world/creatures";
import { fbm } from "../../world/terrain";
import { applyAir, scannedGround, cloudSheet, damp, keepAlpha, pointCloud, roomClock, seeded, skyDome, touch, type Air, roomPos } from "./roomKit";

const { attribute, cameraPosition, cos, float, fract, length, max, mix, normalize, positionGeometry, positionLocal, positionWorld, pow, sin, smoothstep, uniform, uv, vec2, vec3, vec4 } = T;

const sm = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

const SUN = new THREE.Vector3(0.42, 0.2, -1).normalize();
const PORTAL = new THREE.Vector3(0, 0, -46);

/** The meadow: long gentle swells, the path along the middle nearly level. */
export function meadowHeight(x: number, z: number): number {
  const swell = (fbm(x * 0.018 + 4, z * 0.018 - 9) - 0.5) * 6 + (fbm(x * 0.07, z * 0.07 + 3) - 0.5) * 0.9;
  return swell * (0.25 + 0.75 * sm(3, 12, Math.abs(x))) + Math.max(0, Math.abs(x) - 30) * 0.12;
}

export function createDensityRoom2Scene(
  scene: THREE.Scene,
  narration: LessonCtx["narration"],
  whisper: (t: string, ms?: number) => void,
): SceneModule {
  // Temporary zero site; integration coordinates will be injected later.
  const S = { x: 0, z: 0, y: 0, heading: 0 };
  const seatPos = new THREE.Vector3(S.x, S.y, S.z);
  const heading = S.heading;

  const tickers: Array<(dt: number) => void> = [];
  const ours: Array<{ dispose(): void }> = [];

  const clock = roomClock();
  const uLight = uniform(0.7); // the morning's strength
  const uPortal = uniform(0.35);
  const uFall = uniform(0); // leaves letting go
  const goal = { light: 0.7, growth: 0.55, portal: 0.35, fall: 0, herd: 0.4 };
  let growth = 0.5, herdPace = 0.4, time = 0;
  /** Settles when the animals have arrived (still frames wait for it). */
  let loaded: Promise<void> = Promise.resolve();
  const air: Air = {
    color: new THREE.Color(0.16, 0.2, 0.2),
    glow: new THREE.Color(0.7, 0.52, 0.3),
    glowDir: SUN.clone(),
    density: 0.0019,
    shadow: new THREE.Color(0.0, 0.015, 0.02),
    sat: 1.15,
    contrast: 1.1,
  };

  const build = (ctx: LessonCtx) => {
    const g = ctx.group;
    const t = clock.u;
    const R = seeded(2203);

    /* ---------------- sky: a pale morning, gold low toward the sun ---------------- */
    const sky = skyDome(420, new THREE.Color(0.42, 0.36, 0.3), new THREE.Color(0.08, 0.14, 0.3), {
      glowDir: SUN,
      glow: new THREE.Color(0.9, 0.6, 0.3),
      glowPow: 8,
      extra: (d, c) => c.add(vec3(1.0, 0.85, 0.6).mul(pow(max(T.dot(d, vec3(SUN.x, SUN.y, SUN.z)), 0), 900).mul(4))),
    });
    g.add(sky.mesh);
    ours.push(sky);
    const clouds = cloudSheet(1400, 120, t, (_q, cover) => mix(vec3(0.5, 0.46, 0.44), vec3(0.95, 0.75, 0.5), cover.mul(0.5)), { scale: 0.004, cover: [0.5, 0.85], opacity: 0.55, drift: [0.003, 0.001] });
    g.add(clouds.mesh);
    ours.push(clouds);

    /* ---------------- the meadow ---------------- */
    {
      const geo = new THREE.PlaneGeometry(300, 300, 150, 150);
      geo.rotateX(-Math.PI / 2);
      const p = geo.attributes.position as THREE.BufferAttribute;
      const col = new Float32Array(p.count * 3);
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i), z = p.getZ(i);
        p.setY(i, meadowHeight(x, z));
        const lush = fbm(x * 0.05 + 7, z * 0.05);
        const path = 1 - sm(0.6, 1.8, Math.abs(x + Math.sin(z * 0.08) * 1.2));
        const gr = [0.03 + lush * 0.035, 0.11 + lush * 0.1, 0.012 + lush * 0.012];
        const earth = [0.11, 0.075, 0.04];
        for (let c = 0; c < 3; c++) col[i * 3 + c] = gr[c] * (1 - path) + earth[c] * path;
      }
      geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
      geo.computeVertexNormals();
      const m = new THREE.MeshStandardNodeMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 });
      const grain = vnoise(roomPos.xz.mul(1.6)).mul(0.4).add(vnoise(roomPos.xz.mul(0.25)).mul(0.5)).add(0.55);
      // the forest-floor scan: soil, leaf litter and moss, its relief and occlusion
      const scan = scannedGround("meadow", 2.2, { hue: 0.45, relief: 1.5, bright: 2.4 });
      m.colorNode = T.vertexColor().rgb.mul(grain.mul(0.5).add(0.5)).mul(scan.color);
      m.normalNode = scan.normal;
      const mesh = new THREE.Mesh(geo, m);
      mesh.receiveShadow = true;
      g.add(mesh);
      ours.push(geo, m);
    }

    /* ---------------- grass, swaying ---------------- */
    {
      const blade = new THREE.PlaneGeometry(0.07, 0.5, 1, 3);
      blade.translate(0, 0.25, 0);
      const n = 20000;
      const mesh = new THREE.InstancedMesh(blade, new THREE.MeshStandardNodeMaterial({ side: THREE.DoubleSide, roughness: 0.8 }), n);
      const aPh = new Float32Array(n);
      const M = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
      let k = 0;
      while (k < n) {
        // densest near the path and the seat, thinning outward
        const x = (R() - 0.5) * 70 * Math.sqrt(R()), z = 10 - R() * 70;
        if (Math.abs(x + Math.sin(z * 0.08) * 1.2) < 1.0) continue; // the path stays open
        if (Math.abs(x) > 10 && fbm(x * 0.09 + 2, z * 0.09) < 0.3) continue; // thick along the path, in drifts beyond
        e.set((R() - 0.5) * 0.35, R() * Math.PI, (R() - 0.5) * 0.35);
        q.setFromEuler(e);
        const s = 0.6 + R() * 0.9;
        M.compose(new THREE.Vector3(x, meadowHeight(x, z) - 0.02, z), q, new THREE.Vector3(1, s, 1));
        mesh.setMatrixAt(k, M);
        aPh[k] = R();
        k++;
      }
      blade.setAttribute("aPh", new THREE.InstancedBufferAttribute(aPh, 1));
      const m = mesh.material as THREE.MeshStandardNodeMaterial;
      const h = positionGeometry.y.div(0.5);
      const ph = attribute("aPh", "float");
      const sway = sin(t.mul(0.9).add(ph.mul(30)).add(roomPos.x.mul(0.15))).mul(0.12).add(sin(t.mul(0.37).add(ph.mul(11))).mul(0.06)).mul(h.mul(h));
      m.positionNode = positionLocal.add(vec3(sway, 0, sway.mul(0.5)));
      m.colorNode = mix(vec3(0.03, 0.07, 0.015), vec3(0.3, 0.42, 0.1), h).mul(ph.mul(0.4).add(0.8));
      mesh.receiveShadow = true;
      g.add(mesh);
      ours.push(blade, m);
    }

    /* ---------------- trees that grow in pulses ---------------- */
    const bark = barkMaterial(new THREE.Color(0.9, 0.85, 0.55), 0.61);
    ours.push(bark);
    const trees: { obj: THREE.Group; size: number; lag: number; now: number }[] = [];
    const leafPts: number[] = [];
    const leafTree: number[] = [];
    const treeSpots: [number, number, number, number][] = [
      [-10, -12, 1.5, 0], [13, -20, 1.8, 2], [-17, -33, 2.1, 3], [9, -60, 2.4, 3], [22, -8, 1.3, 1],
      [-26, -4, 1.6, 0], [-6, 14, 1.9, 2], [16, 10, 1.4, 0], [31, -40, 2.2, 3], [-35, -58, 2.6, 3],
    ];
    treeSpots.forEach(([x, z, size, shape], i) => {
      const tree = grow(SHAPES[shape], 800 + i * 17);
      const geo = tubes([...tree.limbs, ...tree.roots]);
      const obj = new THREE.Group();
      obj.position.set(x, meadowHeight(x, z) - 0.1, z);
      obj.rotation.y = R() * Math.PI * 2;
      const mesh = new THREE.Mesh(geo, bark);
      mesh.castShadow = true;
      obj.add(mesh);
      g.add(obj);
      ours.push(geo);
      trees.push({ obj, size, lag: R() * 3, now: 0.5 });
      obj.updateMatrixWorld(true);
      // leaves of light at the tips (in the tree's own frame, so they grow with it)
      // a full crown: leaves clustered round every twig tip
      for (const tp of tree.tips) for (let k = 0; k < 44; k++) {
        const a = R() * Math.PI * 2, rr = Math.sqrt(R()) * 1.6;
        leafPts.push(tp.x + Math.cos(a) * rr, tp.y + (R() - 0.35) * 1.3, tp.z + Math.sin(a) * rr);
        leafTree.push(i);
      }
    });
    // the canopies: one cloud per tree, parented to it
    trees.forEach((tr, i) => {
      const idx = leafTree.map((v, k) => (v === i ? k : -1)).filter((k) => k >= 0);
      // foliage with body (not additive: it shades the sky behind it), lit from the sun's side
      const leafMat = new THREE.PointsNodeMaterial({ transparent: true, depthWrite: false, fog: false });
      leafMat.sizeAttenuation = true;
      leafMat.size = 0.8;
      const cloud = spriteCloud(idx.length, { position: 3, aK: 4 }, leafMat);
      const s = { cloud, material: leafMat, pos: cloud.attrs.position.array as Float32Array, k: cloud.attrs.aK.array as Float32Array };
      idx.forEach((k, j) => {
        s.pos.set([leafPts[k * 3], leafPts[k * 3 + 1], leafPts[k * 3 + 2]], j * 3);
        s.k.set([R(), R(), R(), R()], j * 4);
      });
      touch(s.cloud);
      const K = s.cloud.nodes.aK;
      const tw = sin(t.mul(float(0.6).add(K.x)).add(K.y.mul(40))).mul(0.3).add(0.7);
      // a slow wave of light travels down each canopy
      const wave = sin(t.mul(0.5).sub(s.cloud.nodes.position.y.mul(0.4))).mul(0.3).add(0.7);
      // letting go: some leaves fall, drifting, when the narration speaks of surrender
      const falls = smoothstep(0.62, 0.7, K.z).mul(uFall);
      const life = fract(K.w.add(t.mul(0.04)));
      const drop = vec3(sin(t.mul(0.7).add(K.x.mul(20))).mul(0.8).mul(life), life.mul(-7), cos(t.mul(0.5).add(K.y.mul(20))).mul(0.8).mul(life)).mul(falls);
      s.material.positionNode = s.cloud.nodes.position.add(drop);
      // each leaf its own ragged shape, not a disc
      const pr = length(T.pointUV.sub(0.5).mul(vec2(1, 1.5))).mul(2).add(vnoise(T.pointUV.mul(5).add(K.xy.mul(40))).mul(0.55).sub(0.25));
      const lit = smoothstep(-2, 2.5, s.cloud.nodes.position.y.sub(3).add(K.w.mul(2))); // the crown's top catches the light
      const hue = mix(vec3(0.015, 0.05, 0.015), vec3(0.11, 0.24, 0.045), lit).mul(K.x.mul(0.5).add(0.75)).add(vec3(0.5, 0.42, 0.12).mul(pow(K.z, 10)).mul(tw)); // a few leaves glint gold
      s.material.colorNode = hue.mul(wave.mul(0.3).add(0.7)).mul(uLight.mul(0.4).add(0.6));
      // (fading near the lens: a falling leaf must never become a blot across the view)
      const nearLens = smoothstep(1.2, 4.5, length(cameraPosition.sub(positionWorld)));
      s.material.opacityNode = smoothstep(1, 0.55, pr).mul(0.92).mul(nearLens);
      tr.obj.add(s.cloud.sprite);
      ours.push(s.material);
    });

    /* ---------------- flowers that turn toward the light ---------------- */
    const flowers: { m: THREE.InstancedMesh; base: THREE.Vector3[]; face: THREE.Vector3[]; s: number[] } = { m: null!, base: [], face: [], s: [] };
    {
      const pts: THREE.Vector2[] = [];
      for (let i = 0; i <= 10; i++) {
        const u = i / 10;
        pts.push(new THREE.Vector2(0.02 + Math.sin(u * Math.PI * 0.55) * 0.13 + u * u * 0.05, u * 0.2));
      }
      const cup = new THREE.LatheGeometry(pts, 10);
      cup.rotateX(Math.PI / 2); // opening along +z: it looks where it faces
      const n = 320;
      const m = new THREE.MeshStandardNodeMaterial({ side: THREE.DoubleSide, roughness: 0.6 });
      const mesh = new THREE.InstancedMesh(cup, m, n);
      const aHue = new Float32Array(n);
      let k = 0;
      while (k < n) {
        // in drifts along the path and round the trees
        const x = (R() - 0.5) * 50, z = 6 - R() * 56;
        if (Math.abs(x) < 2 || fbm(x * 0.11 + 9, z * 0.11 - 2) < 0.5) continue;
        flowers.base.push(new THREE.Vector3(x, meadowHeight(x, z) + 0.45 + R() * 0.35, z));
        flowers.face.push(new THREE.Vector3(0, 0.3, 1).normalize());
        flowers.s.push(0.5 + R() * 0.45);
        aHue[k] = R();
        k++;
      }
      cup.setAttribute("aHue", new THREE.InstancedBufferAttribute(aHue, 1));
      const hue = attribute("aHue", "float");
      const petal = mix(mix(vec3(0.95, 0.55, 0.62), vec3(1.0, 0.82, 0.42), smoothstep(0.3, 0.6, hue)), vec3(0.62, 0.72, 1.0), smoothstep(0.75, 0.9, hue));
      m.colorNode = petal.mul(0.55);
      // the cup holds a little light of its own, deepest inside
      m.emissiveNode = petal.mul(smoothstep(0.2, 0.0, positionGeometry.z.negate().add(0.2))).mul(0.25).mul(uLight);
      mesh.castShadow = false;
      flowers.m = mesh;
      g.add(mesh);
      ours.push(cup, m);
      // stems: fine lines of green from the ground to each head
      const sp = new Float32Array(n * 6);
      flowers.base.forEach((b, i) => sp.set([b.x, meadowHeight(b.x, b.z), b.z, b.x, b.y, b.z], i * 6));
      const sg = new THREE.BufferGeometry();
      sg.setAttribute("position", new THREE.BufferAttribute(sp, 3));
      const sm_ = new THREE.LineBasicMaterial({ color: new THREE.Color(0.08, 0.16, 0.05) });
      g.add(new THREE.LineSegments(sg, sm_));
      ours.push(sg, sm_);
    }

    /* ---------------- shafts of light slanting through the morning ---------------- */
    const shafts: { mesh: THREE.Mesh; x: number; z: number; ph: number }[] = [];
    {
      const geo = new THREE.CylinderGeometry(1.6, 3.6, 34, 24, 1, true);
      geo.translate(0, 17, 0);
      for (let i = 0; i < 5; i++) {
        const m = keepAlpha(new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide }));
        const U = uv();
        const view = normalize(cameraPosition.sub(positionWorld));
        const nrm = normalize(T.normalWorld);
        const core = pow(max(T.dot(view, nrm).abs(), 0), 2.2); // brightest through its depth
        const along = smoothstep(0, 0.2, U.y).mul(smoothstep(1, 0.5, U.y));
        const dust = vnoise(vec2(U.x.mul(12), U.y.mul(4).sub(t.mul(0.05)))).mul(0.4).add(0.6);
        const near = smoothstep(2, 8, length(cameraPosition.sub(positionWorld)));
        m.colorNode = vec4(vec3(1.0, 0.86, 0.6).mul(core).mul(along).mul(dust).mul(near).mul(uLight).mul(0.16), 1);
        const mesh = new THREE.Mesh(geo, m);
        const x = [-8, 12, -20, 6, 24][i], z = [-16, -26, -38, -52, -12][i];
        mesh.position.set(x, meadowHeight(x, z), z);
        // leaning away from the sun, as light falls from it
        mesh.rotation.set(-SUN.z * 0.55, 0, SUN.x * 0.55);
        g.add(mesh);
        shafts.push({ mesh, x, z, ph: R() * 6 });
        ours.push(m);
      }
      ours.push(geo);
    }

    /* ---------------- pollen and seeds rising (everything reaches upward) ---------------- */
    {
      const n = 500;
      const s = pointCloud(n, 0.08);
      for (let i = 0; i < n; i++) {
        s.pos.set([(R() - 0.5) * 60, R() * 2, 8 - R() * 60], i * 3);
        s.k.set([R(), R(), R(), R()], i * 4);
      }
      touch(s.cloud);
      const K = s.cloud.nodes.aK;
      const life = fract(K.x.add(t.mul(float(0.03).add(K.y.mul(0.03)))));
      const rise = vec3(sin(t.mul(0.4).add(K.z.mul(30))).mul(0.6), life.mul(9), cos(t.mul(0.3).add(K.w.mul(30))).mul(0.6));
      s.material.positionNode = s.cloud.nodes.position.add(rise);
      const fade = smoothstep(0, 0.15, life).mul(float(1).sub(smoothstep(0.7, 1, life)));
      s.material.colorNode = vec4(vec3(1.0, 0.92, 0.65).mul(s.round).mul(fade).mul(0.5).mul(uLight), 1);
      g.add(s.cloud.sprite);
      ours.push(s.material);
    }

    /* ---------------- the way on: two trees leaning into an arch, light between ---------------- */
    {
      const door = new THREE.Group();
      door.position.copy(PORTAL).setY(meadowHeight(PORTAL.x, PORTAL.z) - 0.1);
      g.add(door);
      for (const sx of [-1, 1]) {
        const tree = grow(SHAPES[1], sx > 0 ? 911 : 913);
        const geo = tubes([...tree.limbs, ...tree.roots]);
        const mesh = new THREE.Mesh(geo, bark);
        mesh.position.set(sx * 2.4, 0, 0);
        mesh.rotation.set(0, sx > 0 ? 0.4 : 2.6, -sx * 0.32);
        mesh.scale.setScalar(1.1);
        mesh.castShadow = true;
        door.add(mesh);
        ours.push(geo);
      }
      const geo = new THREE.PlaneGeometry(4.2, 6.5);
      geo.translate(0, 3.25, 0);
      const m = keepAlpha(new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide }));
      const U = uv();
      const edge = smoothstep(0, 0.3, U.x).mul(smoothstep(1, 0.7, U.x)).mul(smoothstep(0, 0.06, U.y)).mul(smoothstep(1, 0.45, U.y));
      const breathe = sin(t.mul(0.45)).mul(0.08).add(0.92);
      m.colorNode = vec4(vec3(1.0, 0.92, 0.72).mul(edge).mul(breathe).mul(uPortal).mul(0.75), 1);
      door.add(new THREE.Mesh(geo, m));
      ours.push(geo, m);
    }

    /* ---------------- the herd, moving as one body; a flock wheeling overhead ---------------- */
    const herd: { a: Animal; off: THREE.Vector2; ph: number }[] = [];
    const flock: { a: Animal; off: THREE.Vector3; ph: number }[] = [];
    const glassW = new THREE.Color(1.0, 0.95, 0.85), glassG = new THREE.Color(1.0, 0.85, 0.55);
    const horses = herdOf("models/animals/horse.glb", 9, 2.0, [glassW, glassW, glassG], 1).then((hs) => {
      hs.forEach((a, i) => {
        herd.push({ a, off: new THREE.Vector2(((i % 3) - 1) * 3.2 + (R() - 0.5) * 1.2, Math.floor(i / 3) * 3.4 + (R() - 0.5) * 1.2), ph: R() });
        g.add(a.obj);
      });
    });
    const birds = herdOf("models/animals/stork.glb", 13, 0.55, [new THREE.Color(1.0, 0.97, 0.92)], 1).then((bs) => {
      bs.forEach((a, i) => {
        // a V: the leader at the point, the rest trailing either side
        const side = i === 0 ? 0 : i % 2 ? 1 : -1, rank = Math.ceil(i / 2);
        flock.push({ a, off: new THREE.Vector3(side * rank * 1.6, (R() - 0.5) * 0.6, rank * 1.9), ph: R() });
        a.obj.scale.setScalar(2.2);
        g.add(a.obj);
      });
    });
    loaded = Promise.all([horses, birds]).then(() => undefined);

    tickers.push((dt: number) => {
      const d = Math.min(0.05, Math.max(0, dt));
      time += d;
      clock.tick(d);
      applyAir(air);
      uLight.value = damp(uLight.value, goal.light, 0.15, d);
      uPortal.value = damp(uPortal.value, goal.portal, 0.15, d);
      uFall.value = damp(uFall.value, goal.fall, 0.2, d);
      herdPace = damp(herdPace, goal.herd, 0.2, d);
      // growth arrives in pulses: each tree follows the room's growth a few seconds apart, and
      // eases (a pulse, not a slide)
      growth = damp(growth, goal.growth, 0.35, d);
      for (const tr of trees) {
        const want = growth + Math.sin(time * 0.3 + tr.lag) * 0.01;
        tr.now = damp(tr.now, want, 0.25 / (1 + tr.lag), d);
        tr.obj.scale.setScalar(tr.size * (0.35 + 0.65 * tr.now));
      }
      // the flowers turn their cups toward the light, which wanders slowly
      const la = Math.sin(time * 0.05) * 0.5;
      const light = new THREE.Vector3(SUN.x + la, SUN.y + 0.25, SUN.z).normalize();
      const M = new THREE.Matrix4(), q = new THREE.Quaternion(), fwd = new THREE.Vector3(0, 0, 1);
      for (let i = 0; i < flowers.base.length; i++) {
        const f = flowers.face[i];
        f.lerp(light, Math.min(1, d * 0.25 * (0.6 + (i % 7) * 0.1))).normalize();
        q.setFromUnitVectors(fwd, f);
        const b = flowers.base[i];
        const sway = Math.sin(time * 0.8 + i) * 0.03;
        M.compose(new THREE.Vector3(b.x + sway, b.y, b.z), q, new THREE.Vector3(flowers.s[i], flowers.s[i], flowers.s[i]));
        flowers.m.setMatrixAt(i, M);
      }
      flowers.m.instanceMatrix.needsUpdate = true;
      // the herd: one body along a long arc across the far meadow and back
      const hs = time * 0.018 * herdPace;
      const cx = Math.sin(hs) * 32, cz = -30 + Math.cos(hs * 0.7) * 14;
      const dx = Math.cos(hs) * 32 * 0.018, dz = -Math.sin(hs * 0.7) * 14 * 0.7 * 0.018;
      const hd = Math.atan2(-dx, -dz);
      for (const h of herd) {
        const ox = h.off.x * Math.cos(hd) + h.off.y * Math.sin(hd), oz = -h.off.x * Math.sin(hd) + h.off.y * Math.cos(hd);
        const x = cx + ox, z = cz + oz;
        h.a.obj.position.set(x, meadowHeight(x, z), z);
        h.a.obj.rotation.y = hd + Math.sin(time * 0.3 + h.ph * 6) * 0.06;
        h.a.mixer.update(d * (0.5 + herdPace * 0.4));
      }
      // the flock: a V wheeling in a wide slow circle, banking into the turn
      const fa = time * 0.05;
      const fc = new THREE.Vector3(Math.cos(fa) * 38, 20 + Math.sin(time * 0.13) * 3, -32 + Math.sin(fa) * 26);
      const fh = Math.atan2(Math.sin(fa) * 38, -Math.cos(fa) * 26);
      for (const b of flock) {
        const o = b.off.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), fh);
        b.a.obj.position.copy(fc).add(o).add(new THREE.Vector3(0, Math.sin(time * 0.9 + b.ph * 6) * 0.25, 0));
        b.a.obj.rotation.set(0, fh, 0.25);
        b.a.mixer.update(d * 0.8);
      }
      for (const sh of shafts) {
        const k = 0.75 + 0.25 * Math.sin(time * 0.12 + sh.ph);
        sh.mesh.scale.set(k, 1, k);
      }
    });
  };

  const opts: LessonOpts = {
    id: "density_2",
    trackId: "audio/densities/density_2.mp3",
    seatPos,
    seatHeading: heading,
    build,
    authoredSecs: 300, // beats written against the script's length; they follow the recording
    beats: [
      // "This is the density you enter when you walk into a forest": the morning deepens
      { t: 37, apply: () => (goal.light = 0.9) },
      // "A tree does not lie awake worrying… It simply grows": the first pulse of growth
      { t: 74, apply: () => (goal.growth = 0.75) },
      // "The seed cracks open… Roots go down. Branches go out… the animals… play": the great pulse
      { t: 111, apply: () => Object.assign(goal, { growth: 1, herd: 1 }) },
      // "Herds move as one body… Birds wheel in the sky": the herd runs with it
      { t: 148, apply: () => (goal.herd = 1.4) },
      // "The leaf does not cling to the branch in autumn. It lets go": leaves let go
      { t: 222, apply: () => Object.assign(goal, { fall: 1, herd: 0.8 }) },
      // "Grow toward the light… The light knows where you are": the way on opens
      { t: 262, apply: () => Object.assign(goal, { light: 1.1, portal: 1.1, fall: 0.3 }) },
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
