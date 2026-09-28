/* The igloo lesson: a snow dome with a fireplace at its heart.
   A wanderer sits inside while six small visions appear in turn —
   rain falling and fading, a ledger of drifting lights, a sun rising,
   a hand opening then closing, a tree growing, a candle holding its flame.
   Between visions the fire burns on, embers rising, the dome breathing faintly,
   everything keeping the narration's time. */
import * as THREE from "three/webgpu";
import { LessonScene } from "./lessonKit";
import type { LessonCtx, LessonOpts, SceneModule } from "./lessonKit";
import { SITES } from "./sites";
import { worldPoints, glowShader, gpuUniforms, T } from "../gpu/tsl";

function fadeU(uT: number, t0: number, t1: number, t2: number, t3: number): number {
  if (uT <= t0 || uT >= t3) return 0;
  if (uT < t1) return (uT - t0) / Math.max(1e-6, t1 - t0);
  if (uT <= t2) return 1;
  return 1 - (uT - t2) / Math.max(1e-6, t3 - t2);
}

export function createIglooScene(
  scene: THREE.Scene,
  narration: LessonCtx["narration"],
  whisper: (t: string, ms?: number) => void
): SceneModule {
  const site = SITES.igloo ?? { x: 0, z: 0, y: 0, heading: 0 };
  const C = new THREE.Vector3(site.x, site.y, site.z);
  const seat = new THREE.Vector3(site.x, site.y, site.z + 3);
  const seatHeading = Math.atan2(C.x - seat.x, C.z - seat.z);

  const tickers: Array<(dt: number) => void> = [];
  let currentSegment = "";

  const show = (seg: string) => {
    currentSegment = seg;
  };

  const opts: LessonOpts = {
    id: "igloo",
    trackId: "L04",
    seatPos: seat.clone(),
    seatHeading,
    build: (ctx) => {
      const kit = ctx.kit;

      /* ---------- ground snow and sit mat ---------- */
      kit.groundDisc(30, 0xdfe9f5, 0.55, site.y);
      kit.groundDisc(1.6, 0x8a6a4a, 0.9, site.y + 0.05);

      /* ---------- snowfall ---------- */
      kit.snowfall(900, site.x, site.z, 26, 14);

      /* ---------- fireplace ---------- */
      const glowMat = glowShader(
        { intensity: 1.0 },
        (u, _uv) => T.vec3(1, 0.6, 0.25).mul(u.intensity),
        {}
      );
      const glowGeom = new THREE.SphereGeometry(0.3, 16, 16);
      const glowMesh = new THREE.Mesh(glowGeom, glowMat);
      glowMesh.position.copy(C);
      ctx.group.add(glowMesh);

      const fireLight = new THREE.PointLight(0xff8c42, 2, 8, 2);
      fireLight.position.copy(C);
      ctx.group.add(fireLight);

      // ember points — counter-seeded hash, no bare Math.random()
      let emberSeed = 1;
      const eRnd = () => {
        const x = Math.sin(emberSeed++ * 127.1 + 311.7) * 43758.5453;
        return x - Math.floor(x);
      };
      const emberCount = 40;
      const emberPositions = new Float32Array(emberCount * 3);
      for (let i = 0; i < emberCount; i++) {
        emberPositions[i * 3] = C.x + (eRnd() - 0.5) * 1.5;
        emberPositions[i * 3 + 1] = C.y + eRnd() * 2.5;
        emberPositions[i * 3 + 2] = C.z + (eRnd() - 0.5) * 1.5;
      }
      const ember = worldPoints(emberPositions, {
        size: 0.08,
        color: 0xffaa55,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        fog: false,
      });
      ctx.group.add(ember.sprite);

      tickers.push((dt) => {
        const arr = ember.position.array as Float32Array;
        for (let i = 0; i < emberCount; i++) {
          arr[i * 3 + 1] += dt * 0.35;
          if (arr[i * 3 + 1] > C.y + 3.5) {
            arr[i * 3 + 1] = C.y;
            arr[i * 3] = C.x + (eRnd() - 0.5) * 1.5;
            arr[i * 3 + 2] = C.z + (eRnd() - 0.5) * 1.5;
          }
        }
        ember.position.needsUpdate = true;
      });

      /* ---------- the dome ---------- */
      const domeGeom = new THREE.SphereGeometry(7, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2);
      const domeMat = new THREE.MeshBasicNodeMaterial({
        color: 0x9fc8ff,
        transparent: true,
        opacity: 0.1,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        fog: false,
        side: THREE.DoubleSide,
      });
      const dome = new THREE.Mesh(domeGeom, domeMat);
      dome.position.copy(C);
      ctx.group.add(dome);

      tickers.push((_dt) => {
        domeMat.opacity = 0.1 + Math.sin(gpuUniforms.time.value * 2) * 0.02;
      });

      /* ---------- path lights ---------- */
      const edgePoint = new THREE.Vector3(C.x, C.y, C.z + 7);
      const pathPoints: THREE.Vector3[] = [];
      const steps = 10;
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        pathPoints.push(new THREE.Vector3().lerpVectors(seat, edgePoint, t));
      }
      kit.pathLights(pathPoints);

      /* ---------- the six visions ---------- */
      const rainPts = new THREE.Group();
      const ledgerPts = new THREE.Group();
      const sunGrp = new THREE.Group();
      const handPts = new THREE.Group();
      const treeGrp = new THREE.Group();
      const candleGrp = new THREE.Group();

      // position them around C, radius < 6.5
      const offsets = [
        new THREE.Vector3(1, 0.5, 0),
        new THREE.Vector3(-1, 0.5, 0),
        new THREE.Vector3(0, 1, 1),
        new THREE.Vector3(0, 0.5, -1),
        new THREE.Vector3(1, 0.5, -1),
        new THREE.Vector3(-1, 0.5, 1),
      ];
      rainPts.position.copy(C.clone().add(offsets[0]));
      ledgerPts.position.copy(C.clone().add(offsets[1]));
      sunGrp.position.copy(C.clone().add(offsets[2]));
      handPts.position.copy(C.clone().add(offsets[3]));
      treeGrp.position.copy(C.clone().add(offsets[4]));
      candleGrp.position.copy(C.clone().add(offsets[5]));

      // initially hidden
      rainPts.visible = false;
      ledgerPts.visible = false;
      sunGrp.visible = false;
      handPts.visible = false;
      treeGrp.visible = false;
      candleGrp.visible = false;

      ctx.group.add(rainPts, ledgerPts, sunGrp, handPts, treeGrp, candleGrp);

      /* ---------- rain ---------- */
      {
  const uT = ctx.uT;
  const N = 500;
  const arr = new Float32Array(N * 3);
  const fract = (x: number) => x - Math.floor(x);
  const rnd = (i: number, s: number) => fract(Math.sin(i * 12.9898 + s * 78.233) * 43758.5453);
  const x0 = new Float32Array(N);
  const y0 = new Float32Array(N);
  const z0 = new Float32Array(N);
  const vy = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    x0[i] = (rnd(i, 1) - 0.5) * 6;
    y0[i] = (rnd(i, 2) - 0.5) * 6;
    z0[i] = (rnd(i, 3) - 0.5) * 6;
    vy[i] = 2 + rnd(i, 4) * 3;
  }
  const rain = worldPoints(arr, {
    size: 0.06,
    color: 0x9fb8dd,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: false,
  });
  rainPts.add(rain.sprite);
  tickers.push((_dt: number) => {
    const t = uT.value;
    const a = rain.position.array as Float32Array;
    for (let i = 0; i < N; i++) {
      const y = (((y0[i] - vy[i] * t + 3) % 6) + 6) % 6 - 3;
      a[i * 3] = x0[i];
      a[i * 3 + 1] = y;
      a[i * 3 + 2] = z0[i];
    }
    rain.position.needsUpdate = true;
    rain.material.opacity = fadeU(t, 0, 2, 38, 42);
  });
}

      /* ---------- ledger ---------- */
      {
  const uT = ctx.uT;
  const GX = 12;
  const GY = 8;
  const N = GX * GY;
  const arr = new Float32Array(N * 3);
  const fract = (x: number) => x - Math.floor(x);
  const rnd = (i: number, s: number) => fract(Math.sin(i * 12.9898 + s * 78.233) * 43758.5453);
  const gx = new Float32Array(N);
  const gy = new Float32Array(N);
  const ph = new Float32Array(N);
  for (let j = 0; j < GY; j++) {
    for (let i = 0; i < GX; i++) {
      const k = j * GX + i;
      gx[k] = (i / (GX - 1) - 0.5) * 4;
      gy[k] = (j / (GY - 1) - 0.5) * 2.5;
      ph[k] = rnd(k, 7) * Math.PI * 2;
    }
  }
  const ledger = worldPoints(arr, {
    size: 0.07,
    color: 0xcfc4a8,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: false,
  });
  ledgerPts.add(ledger.sprite);
  tickers.push((_dt: number) => {
    const t = uT.value;
    const a = ledger.position.array as Float32Array;
    for (let k = 0; k < N; k++) {
      const p = ph[k];
      a[k * 3] = gx[k] + Math.sin(t * 0.6 + p) * 0.08;
      a[k * 3 + 1] = gy[k] + Math.sin(t * 0.9 + p * 1.3) * 0.06;
      a[k * 3 + 2] = Math.sin(t * 0.5 + p * 0.7) * 0.05;
    }
    ledger.position.needsUpdate = true;
    ledger.material.opacity = fadeU(t, 47, 50, 108, 112) * (0.55 + 0.25 * Math.sin(t * 1.7));
  });
}

/* ---------- sun ---------- */
{  const uTv = ctx.uT.value;
  const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
  const rand = (i: number) => {
    const x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
    return x - Math.floor(x);
  };

  const sunMat = glowShader({ intensity: 1 }, (u, _uv) => T.vec3(1.0, 0.78, 0.45).mul(u.intensity), {});
  const sunMesh = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 16), sunMat);
  sunMesh.position.set(0, 0, 0);
  sunMesh.visible = false;
  sunGrp.add(sunMesh);

  const N = 120;
  const xyz = new Float32Array(N * 3);
  const bases = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    bases[i] = rand(i) * Math.PI * 2;
  }

  const halo = worldPoints(xyz, {
    size: 0.04,
    color: 0xffd98a,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: false,
  });
  sunGrp.add(halo.sprite);

  const update = (uT: number) => {
    const fade = fadeU(uT, 112.8, 117, 185, 190);
    sunMesh.position.y = -1.5 + 3.0 * clamp01((uT - 112.8) / 60);
    sunMat.uniforms.intensity.value = fade;
    sunMesh.visible = fade > 0;

    const arr = halo.position.array as Float32Array;
    for (let i = 0; i < N; i++) {
      const a = bases[i] + uT * 0.15;
      const r = 1.2 + (rand(i + 100) - 0.5) * 0.2;
      const yOff = (rand(i + 200) - 0.5) * 0.3;
      arr[i * 3 + 0] = Math.cos(a) * r;
      arr[i * 3 + 1] = sunMesh.position.y + yOff;
      arr[i * 3 + 2] = Math.sin(a) * r;
    }
    halo.position.needsUpdate = true;
    halo.material.opacity = fade;
    halo.sprite.visible = fade > 0;
  };

  update(uTv);

  tickers.push((_dt: number) => {
    const t = ctx.uT.value;
    update(t);
  });
}


/* ---------- hand ---------- */
{  const uTv = ctx.uT.value;
  const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
  const rand = (i: number) => {
    const x = Math.sin(i * 12.9898 + 78.233) * 43758.5453;
    return x - Math.floor(x);
  };

  const N = 260;
  const open = new Float32Array(N * 3);
  const closed = new Float32Array(N * 3);

  const R = 1.2;
  for (let i = 0; i < N; i++) {
    // OPEN: palm-like disc
    const a = rand(i) * Math.PI * 2;
    const r = 0.2 + 1.0 * Math.sqrt(rand(i + 100));
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    const cup = 0.15 * (r / R) * (r / R) - 0.05;
    open[i * 3 + 0] = x;
    open[i * 3 + 1] = cup;
    open[i * 3 + 2] = z;

    // FIST: tight cluster
    const u = rand(i + 200) * 2 - 1;
    const theta = rand(i + 300) * Math.PI * 2;
    const rr = 0.22 * Math.cbrt(rand(i + 400));
    const s = Math.sqrt(1 - u * u);
    closed[i * 3 + 0] = rr * s * Math.cos(theta);
    closed[i * 3 + 1] = rr * u;
    closed[i * 3 + 2] = rr * s * Math.sin(theta);
  }

  const xyz = new Float32Array(N * 3);
  const hand = worldPoints(xyz, {
    size: 0.035,
    color: 0xffc37a,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: false,
  });
  handPts.add(hand.sprite);

  const update = (uT: number) => {
    const fade = fadeU(uT, 190.8, 193, 221, 225);
    const k = clamp01((uT - 190.8) / (205 - 190.8));
    const arr = hand.position.array as Float32Array;
    for (let i = 0; i < N; i++) {
      const i3 = i * 3;
      arr[i3 + 0] = open[i3 + 0] + (closed[i3 + 0] - open[i3 + 0]) * k;
      arr[i3 + 1] = open[i3 + 1] + (closed[i3 + 1] - open[i3 + 1]) * k;
      arr[i3 + 2] = open[i3 + 2] + (closed[i3 + 2] - open[i3 + 2]) * k;
    }
    hand.position.needsUpdate = true;
    hand.material.opacity = fade;
    hand.sprite.visible = fade > 0;
  };

  update(uTv);

  tickers.push((_dt: number) => {
    const t = ctx.uT.value;
    update(t);
  });
}


/* ---------- tree ---------- */
{  const uTv = ctx.uT.value;
  const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
  const rnd = (i: number, s: number) => {
    const x = Math.sin(i * 12.9898 + s * 78.233) * 43758.5453;
    return x - Math.floor(x);
  };

  const count = 220;
  const trunkCount = 70;
  const canopyCount = count - trunkCount;
  const xyz = new Float32Array(count * 3);

  for (let i = 0; i < trunkCount; i++) {
    const a = rnd(i, 1.1) * Math.PI * 2;
    const r = 0.035 * Math.sqrt(rnd(i, 2.2));
    xyz[i * 3] = Math.cos(a) * r;
    xyz[i * 3 + 1] = 1.2 * rnd(i, 3.3);
    xyz[i * 3 + 2] = Math.sin(a) * r;
  }
  for (let j = 0; j < canopyCount; j++) {
    const i = trunkCount + j;
    const theta = rnd(i, 4.4) * Math.PI * 2;
    const phi = Math.acos(2 * rnd(i, 5.5) - 1);
    const r = 0.85 * Math.cbrt(rnd(i, 6.6));
    const sinPhi = Math.sin(phi);
    xyz[i * 3] = r * sinPhi * Math.cos(theta);
    xyz[i * 3 + 1] = 1.5 + r * Math.cos(phi);
    xyz[i * 3 + 2] = r * sinPhi * Math.sin(theta);
  }

  const tree = worldPoints(xyz, {
    size: 0.09,
    color: 0xa8d47a,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: false,
  });
  tree.material.opacity = 0;
  treeGrp.add(tree.sprite);

  const g0 = clamp01((uTv - 255.4) / 35);
  const arr = tree.position.array as Float32Array;
  for (let i = 0; i < count; i++) {
    const i3 = i * 3;
    const s = rnd(i, 7.7) < g0 ? g0 : 0;
    arr[i3] = xyz[i3] * s;
    arr[i3 + 1] = xyz[i3 + 1] * s;
    arr[i3 + 2] = xyz[i3 + 2] * s;
  }
  tree.position.needsUpdate = true;
  tree.material.opacity = fadeU(uTv, 255.4, 258, 468, 474);

  tickers.push((_dt: number) => {
    const t = ctx.uT.value;
    const g = clamp01((t - 255.4) / 35);
    const op = fadeU(t, 255.4, 258, 468, 474);
    tree.material.opacity = op;
    const pa = tree.position.array as Float32Array;
    for (let i = 0; i < count; i++) {
      const i3 = i * 3;
      const s = rnd(i, 7.7) < g ? g : 0;
      pa[i3] = xyz[i3] * s;
      pa[i3 + 1] = xyz[i3 + 1] * s;
      pa[i3 + 2] = xyz[i3 + 2] * s;
    }
    tree.position.needsUpdate = true;
  });
}


/* ---------- candle ---------- */
{  const uTv = ctx.uT.value;
  const rnd = (i: number, s: number) => {
    const x = Math.sin(i * 12.9898 + s * 78.233) * 43758.5453;
    return x - Math.floor(x);
  };

  const waxCount = 60;
  const waxXyz = new Float32Array(waxCount * 3);
  for (let i = 0; i < waxCount; i++) {
    const a = rnd(i, 1.1) * Math.PI * 2;
    const r = 0.08 * Math.sqrt(rnd(i, 2.2));
    waxXyz[i * 3] = Math.cos(a) * r;
    waxXyz[i * 3 + 1] = 0.5 * rnd(i, 3.3);
    waxXyz[i * 3 + 2] = Math.sin(a) * r;
  }
  const wax = worldPoints(waxXyz, {
    size: 0.06,
    color: 0xf5e6c8,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: false,
  });
  wax.material.opacity = 0;
  candleGrp.add(wax.sprite);

  const emberCount = 30;
  const emberXyz = new Float32Array(emberCount * 3);
  for (let i = 0; i < emberCount; i++) {
    const a = rnd(i, 4.4) * Math.PI * 2;
    const r = 0.12 * Math.sqrt(rnd(i, 5.5));
    emberXyz[i * 3] = Math.cos(a) * r;
    emberXyz[i * 3 + 1] = 0.8 + rnd(i, 6.6) * 0.4;
    emberXyz[i * 3 + 2] = Math.sin(a) * r;
  }
  const embers = worldPoints(emberXyz, {
    size: 0.05,
    color: 0xffb36b,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: false,
  });
  embers.material.opacity = 0;
  candleGrp.add(embers.sprite);

  const flameMat = glowShader(
    { intensity: 1.2 },
    (u, _uv) => T.vec3(1.0, 0.62, 0.25).mul(u.intensity),
    {},
  );
  const flameMesh = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 16), flameMat);
  flameMesh.position.set(0, 0.75, 0);
  flameMesh.scale.setScalar(0.12);
  candleGrp.add(flameMesh);

  const op0 = fadeU(uTv, 524.2, 527, 569, 570.5);
  wax.material.opacity = op0;
  embers.material.opacity = op0;
  flameMat.uniforms.intensity.value = op0;
  flameMesh.visible = op0 > 0;

  tickers.push((_dt: number) => {
    const t = ctx.uT.value;
    const op = fadeU(t, 524.2, 527, 569, 570.5);
    wax.material.opacity = op;
    embers.material.opacity = op;
    flameMat.uniforms.intensity.value =
      op *
      (1.0 +
        0.25 *
          Math.sin(gpuUniforms.time.value * 9.0) *
          Math.sin(gpuUniforms.time.value * 5.3));
    flameMesh.visible = op > 0;

    const ea = embers.position.array as Float32Array;
    for (let i = 0; i < emberCount; i++) {
      const i3 = i * 3;
      const speed = 0.25 + rnd(i, 7.7) * 0.5;
      const phase = rnd(i, 8.8);
      const rise = (t * speed + phase) % 1;
      ea[i3] = emberXyz[i3] * (1 + rise * 0.6);
      ea[i3 + 1] = 0.8 + rise * 0.6;
      ea[i3 + 2] = emberXyz[i3 + 2] * (1 + rise * 0.6);
    }
    embers.position.needsUpdate = true;
  });
}

      /* ---------- showing one vision at a time ---------- */
      tickers.push((_dt) => {
        const groups = [rainPts, ledgerPts, sunGrp, handPts, treeGrp, candleGrp];
        groups.forEach((g) => (g.visible = false));
        if (currentSegment !== "") {
          const segMap: Record<string, THREE.Group> = {
            rain: rainPts,
            ledger: ledgerPts,
            sun: sunGrp,
            hand: handPts,
            tree: treeGrp,
            candle: candleGrp,
          };
          const g = segMap[currentSegment];
          if (g) g.visible = true;
        }
      });
    },
    beats: [
      { t: 0, apply: () => show("rain") },
      { t: 47, apply: () => show("ledger") },
      { t: 112.8, apply: () => show("sun") },
      { t: 190.8, apply: () => show("hand") },
      { t: 255.4, apply: () => show("tree") },
      { t: 524.2, apply: () => show("candle") },
    ],
  };

  const lesson = new LessonScene(scene, narration, whisper, opts);

  const baseUpdate = lesson.update.bind(lesson);
  const baseDispose = lesson.dispose.bind(lesson);

  lesson.update = (dt: number): void => {
    baseUpdate(dt);
    for (const ticker of tickers) {
      ticker(dt);
    }
  };
  lesson.dispose = (): void => {
    baseDispose();
  };

  return lesson;
}
