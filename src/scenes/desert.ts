import * as THREE from "three/webgpu";
import { LessonScene, type LessonCtx, type Beat, type SceneModule } from "./lessonKit";
import { SITES } from "./sites";
import type { Narration } from "../core/narration";
import { T } from "../gpu/tsl";

const { uniform, float, smoothstep, attribute, color, positionWorld, positionView, vec3, mix } = T;

/** Keep desert flower placement deterministic across reloads. */
let dSeed = 11;
function dRnd(): number {
  return ((dSeed = (dSeed * 16807) % 2147483647) / 2147483647);
}

const uT = { value: 0 };
const uTNode = uniform(0);

const phases = {
  seedGlow: false,
  flowers: false,
  bloomFast: false,
  light: false,
  grass: false,
  pathRow1: false,
  pathRow2: false,
  fullBloom: false,
};

let seat: THREE.Vector3 = new THREE.Vector3();
let seatHeading: number = 0;
let center: THREE.Vector3 = new THREE.Vector3();
let fwd = new THREE.Vector3(0, 0, 1);
let lantern!: ReturnType<LessonCtx["kit"]["wisp"]>;
let savedCtx: LessonCtx | null = null;

const beats: Beat[] = [
  {
    t: 0,
    apply: (ctx) => {
      ctx.kit.groundDisc(42, 0x120d0a, 0.65, -0.01);
      ctx.kit.pathLights([
        seat.clone().lerp(center, 0.18),
        seat.clone().lerp(center, 0.32),
        seat.clone().lerp(center, 0.46),
      ]);
      lantern.setCenter(seat.clone().add(new THREE.Vector3(0, 0.5, 0)));
    },
  },
  {
    t: 6.74,
    apply: (ctx) => {
      ctx.kit.beams([lantern.group.position.clone()], 1.2, 0.1);
    },
  },
  {
    t: 11.98,
    apply: (ctx) => {
      ctx.kit.beams(
        [
          seat.clone().lerp(center, 0.18),
          seat.clone().lerp(center, 0.32),
          seat.clone().lerp(center, 0.46),
        ],
        0.45,
        0.07,
      );
    },
  },
  {
    t: 72.28,
    apply: (ctx) => {
      phases.seedGlow = true;
      ctx.kit.groundDisc(2, 0xffcc66, 0.12, 0.02);
    },
  },
  {
    t: 133.61,
    apply: () => {
      const p = lantern.group.position.clone();
      p.y += 0.6;
      lantern.setCenter(p);
    },
  },
  {
    t: 214.03,
    apply: () => {
      phases.flowers = true;
    },
  },
  {
    t: 243.90,
    apply: () => {
      phases.bloomFast = true;
    },
  },
  {
    t: 251.20,
    apply: (ctx) => {
      phases.light = true;
      ctx.kit.beams([center.clone(), lantern.group.position.clone()], 12, 0.4);
      ctx.kit.rings(center, 16, 6);
    },
  },
  {
    t: 306.44,
    apply: () => {
      phases.grass = true;
    },
  },
  {
    t: 431.72,
    apply: (ctx) => {
      phases.pathRow1 = true;
      ctx.kit.pathLights(
        Array.from({ length: 8 }, (_, i) => seat.clone().lerp(center, i / 7)),
      );
    },
  },
  {
    t: 451.57,
    apply: (ctx) => {
      phases.pathRow2 = true;
      const dir = center.clone().sub(seat).normalize();
      ctx.kit.pathLights(
        Array.from({ length: 8 }, (_, i) => center.clone().addScaledVector(dir, i + 1)),
      );
    },
  },
  {
    t: 504.56,
    apply: (ctx) => {
      phases.fullBloom = true;
      ctx.kit.groundDisc(16, 0xffcc66, 0.08, 0.01);
    },
  },
  {
    t: 530.68,
    apply: () => {
      phases.fullBloom = true;
    },
  },
];

function buildFlowerSpread(group: THREE.Group): void {
  const count = 600;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const palette = [0xffc766, 0xff9a3c, 0xffe8b0, 0xffd9a0].map((h) => new THREE.Color(h));

  for (let i = 0; i < count; i++) {
    const angle = dRnd() * Math.PI * 2;
    const r = Math.sqrt(dRnd()) * 16;
    const x = center.x + Math.cos(angle) * r;
    const z = center.z + Math.sin(angle) * r;
    const y = center.y + 0.15 + dRnd() * 0.5;

    positions[i * 3] = x;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = z;

    const c = palette[Math.floor(dRnd() * palette.length)];
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));

  const t = uTNode;
  const rf = t
    .sub(214.03)
    .max(0.0)
    .mul(0.25)
    .min(7.4675)
    .add(t.sub(243.90).max(0.0).mul(0.5))
    .min(16.0);

  const dx = positionWorld.x.sub(center.x);
  const dz = positionWorld.z.sub(center.z);
  const dist = dx.mul(dx).add(dz.mul(dz)).sqrt();

  const baseAlpha = float(1.0).sub(smoothstep(rf.sub(1.5), rf, dist));
  const seedGlow = float(0.22)
    .mul(smoothstep(72.28, 80.0, t))
    .mul(float(1.0).sub(smoothstep(214.03, 222.0, t)))
    .mul(float(1.0).sub(smoothstep(0.5, 2.0, dist)));
  const alpha = baseAlpha.add(seedGlow).clamp(0.0, 1.0);

  const sizeNode = float(26.0).mul(positionView.z.negate().reciprocal());

  const material = new THREE.PointsNodeMaterial();
  material.transparent = true;
  material.depthWrite = false;
  material.blending = THREE.AdditiveBlending;
  material.fog = false;
  material.colorNode = attribute("color", "vec3");
  material.opacityNode = alpha;
  material.sizeNode = sizeNode;

  const points = new THREE.Points(geometry, material);
  group.add(points);
}

function buildGrassSpread(group: THREE.Group): void {
  const geometry = new THREE.CircleGeometry(20, 64);
  geometry.rotateX(-Math.PI / 2);

  const material = new THREE.MeshBasicNodeMaterial();
  material.transparent = true;
  material.depthWrite = false;
  material.fog = true;

  const Rg = uTNode.sub(306.44).max(0).mul(0.35).min(20);
  const dist = positionWorld.sub(vec3(center.x, center.y, center.z)).xz.length();
  const mask = smoothstep(Rg.sub(2.0), Rg, dist).oneMinus();

  const scorched = color(0x1a120c);
  const meadow = color(0x2e6b34);
  material.colorNode = mix(scorched, meadow, mask);
  material.opacityNode = float(0.85).mul(mask);

  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(center.x, center.y + 0.03, center.z);
  group.add(mesh);
}

function buildSteps(group: THREE.Group): void {
  const offsets = [0.75, 1.5, 2.25];

  for (const d of offsets) {
    const geometry = new THREE.CircleGeometry(0.28, 32);
    geometry.rotateX(-Math.PI / 2);

    const material = new THREE.MeshBasicNodeMaterial();
    material.transparent = true;
    material.depthWrite = false;
    material.fog = false;
    material.blending = THREE.AdditiveBlending;

    material.colorNode = uniform(new THREE.Color(0xffc766));
    material.opacityNode = float(0.15).add(smoothstep(11.98, 14.0, uTNode).mul(0.75));

    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(
      seat.x + fwd.x * d,
      seat.y + 0.02,
      seat.z + fwd.z * d
    );
    group.add(mesh);
  }
}

function build(ctx: LessonCtx): void {
  const s = SITES.desert;
  seat = new THREE.Vector3(s.x, s.y, s.z);
  seatHeading = s.heading;

  fwd = new THREE.Vector3(Math.sin(seatHeading), 0, Math.cos(seatHeading));
  center = seat.clone().addScaledVector(fwd, 8);
  center.y = seat.y;

  buildFlowerSpread(ctx.group);
  buildGrassSpread(ctx.group);
  buildSteps(ctx.group);

  lantern = ctx.kit.wisp(0xffb84d, 0.6);
  lantern.setCenter(seat.clone().addScaledVector(fwd, 1.2).setY(seat.y + 1.1));

  savedCtx = ctx;
}

function tick(): void {
  const t = savedCtx ? savedCtx.narration.time() : 0;
  uT.value = t;
  uTNode.value = t;

  const base = seat.clone().addScaledVector(fwd, 1.2);
  const lift = t < 133.61 ? 0 : Math.min(1, (t - 133.61) / 3) * 0.6;
  const sway = Math.sin(t * 0.8) * 0.05;
  lantern.setCenter(base.setY(seat.y + 1.1 + lift).add(new THREE.Vector3(sway, 0, 0)));

  const flare = 1 + (t < 251.2 ? 0 : Math.min(1, (t - 251.2) / 8)) * 0.9;
  lantern.group.scale.setScalar(flare);
}

export function createDesert(
  scene: THREE.Scene,
  narration: Narration,
  whisper: (text: string, ms?: number) => void
): SceneModule {
  const s = SITES.desert;
  const seatPos = new THREE.Vector3(s.x, s.y, s.z);
  const lesson = new LessonScene(scene, narration, whisper, {
    id: "desert",
    trackId: "L07",
    seatPos,
    seatHeading: s.heading,
    build,
    beats,
  });

  const baseUpdate = lesson.update.bind(lesson);
  lesson.update = (dt: number) => {
    baseUpdate(dt);
    tick();
  };

  return lesson;
}
