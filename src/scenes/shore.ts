/* The shore lesson — first lesson of the temple tour. The wanderer sits beside water
   and watches a knot of golden light. It begins tied tight, a trefoil pulse; it loosens;
   it unravels; it is released. Low lanterns burn on the landward side. A golden disc rests
   on the water. A wheel appears and stops. Open hands of light wait. A leaf is given to the
   wind. A spent storm settles. Everything keeps time with the telling. */
import * as THREE from "three/webgpu";
import { LessonScene } from "./lessonKit";
import type { Beat, LessonCtx, LessonOpts } from "./lessonKit";
import type { Narration } from "../core/narration";
import { SITES } from "./sites";
import { worldPoints } from "../gpu/tsl";

const V = THREE.Vector3;

export function createShoreScene(
  scene: THREE.Scene,
  narration: Narration,
  whisper: (text: string, ms?: number) => void,
): LessonScene {
  const S = SITES.shore;
  const seatPos = new V(S.x, S.y, S.z);
  const seatHeading = S.heading;

  // Facing convention: forward F = (-sin h, 0, -cos h)
  const F = new V(-Math.sin(seatHeading), 0, -Math.cos(seatHeading));
  // Lateral axis (level, perpendicular to forward)
  const right = new V().crossVectors(new V(0, 1, 0), F).normalize();

  // Knot stage center K = seatPos + F*14 at y=2.6
  const K = seatPos.clone().addScaledVector(F, 14).setY(2.6);
  const L = K.clone().addScaledVector(right, -6).add(new V(0, 0.9, 0));
  const Rr = K.clone().addScaledVector(right, 6).add(new V(0, 0.9, 0));

  // Audio clock (narration seconds) captured from the build ctx.
  let uTNow = 0;
  let uTRef: { value: number } | null = null;
  const capture = (ctx: LessonCtx): void => {
    uTRef = ctx.uT;
    uTNow = ctx.uT.value;
  };

  let strand: ReturnType<typeof worldPoints> | null = null;
  let disc: THREE.Mesh | null = null;
  let wheelRig: THREE.Group | null = null;
  let wheelMesh: THREE.Mesh | null = null;
  let hands: ReturnType<typeof worldPoints>[] = [];
  let leaf: ReturnType<typeof worldPoints> | null = null;
  let leafOffsets: Float32Array | null = null;
  let storm: ReturnType<typeof worldPoints> | null = null;

  function build(ctx: LessonCtx): void {
    capture(ctx);

    /* ---------- the lanterns ---------- */
    const lamps: THREE.Vector3[] = [];
    const lateral = [-2.6, -1.3, 0, 1.3, 2.6];
    for (let i = 0; i < lateral.length; i++) {
      const back = 3.5 + i * 1.5;
      lamps.push(
        seatPos
          .clone()
          .addScaledVector(F, -back)
          .addScaledVector(right, lateral[i])
          .setY(seatPos.y + 0.5),
      );
    }
    ctx.kit.pathLights(lamps);

    /* ---------- the golden disc ---------- */
    const discGeo = new THREE.CircleGeometry(7, 48);
    const discMat = new THREE.MeshBasicNodeMaterial({
      color: 0xd8a94e,
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false,
    });
    disc = new THREE.Mesh(discGeo, discMat);
    disc.rotation.x = -Math.PI / 2;
    disc.position.set(K.x, 0.15, K.z);
    ctx.group.add(disc);

    /* ---------- the knot strand ---------- */
    const count = 360;
    const positions = new Float32Array(count * 3);
    strand = worldPoints(positions, { size: 0.09, color: 0xe0aa54 });
    ctx.group.add(strand.sprite);

    /* ---------- the turning wheel ---------- */
    wheelRig = new THREE.Group();
    wheelRig.position.copy(K).add(new V(0, 1.2, 0));
    wheelRig.lookAt(seatPos.x, wheelRig.position.y, seatPos.z);
    const wheelGeo = new THREE.TorusGeometry(2.2, 0.06, 12, 72);
    const wheelMat = new THREE.MeshBasicNodeMaterial({
      color: 0xd8a94e,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false,
    });
    wheelMesh = new THREE.Mesh(wheelGeo, wheelMat);
    wheelRig.add(wheelMesh);
    ctx.group.add(wheelRig);

    /* ---------- the open hands ---------- */
    const handQuat = new THREE.Quaternion().setFromAxisAngle(right, -Math.PI / 9);
    for (const side of [-1, 1]) {
      const H = seatPos.clone().addScaledVector(F, 5.5).addScaledVector(right, side * 0.95).setY(1.5);
      const handCount = 90;
      const handPositions = new Float32Array(handCount * 3);
      for (let j = 0; j < handCount; j++) {
        const r = Math.sqrt(j / (handCount - 1));
        const a = j * 2.39996;
        const el = r * 1.2;
        const local = new V(
          r * Math.cos(a) * 0.55,
          -0.15 + (1 - Math.cos(el)) * 0.35,
          r * Math.sin(a) * 0.55,
        );
        local.applyQuaternion(handQuat);
        local.add(H);
        const idx = j * 3;
        handPositions[idx] = local.x;
        handPositions[idx + 1] = local.y;
        handPositions[idx + 2] = local.z;
      }
      const cloud = worldPoints(handPositions, { size: 0.07, color: 0xf0c060 });
      cloud.material.opacity = 0;
      ctx.group.add(cloud.sprite);
      hands.push(cloud);
    }

    /* ---------- the released leaf ---------- */
    const leafCount = 26;
    const leafPositions = new Float32Array(leafCount * 3);
    leafOffsets = new Float32Array(leafCount * 3);
    for (let j = 0; j < leafCount; j++) {
      const h1 = Math.sin(j * 12.9898) * 43758.5453;
      const h2 = Math.sin(j * 78.233) * 12345.6789;
      const h3 = Math.sin(j * 37.719) * 98765.4321;
      const r1 = h1 - Math.floor(h1);
      const r2 = h2 - Math.floor(h2);
      const r3 = h3 - Math.floor(h3);
      const ox = (r1 - 0.5) * 0.5;
      const oy = (r2 - 0.5) * 0.5;
      const oz = (r3 - 0.5) * 0.5;
      const idx = j * 3;
      leafOffsets[idx] = ox;
      leafOffsets[idx + 1] = oy;
      leafOffsets[idx + 2] = oz;
      leafPositions[idx] = K.x + ox;
      leafPositions[idx + 1] = Math.max(K.y + oy, 0.3);
      leafPositions[idx + 2] = K.z + oz;
    }
    leaf = worldPoints(leafPositions, { size: 0.08, color: 0x9fc46a });
    leaf.material.opacity = 0;
    leaf.sprite.visible = false;
    ctx.group.add(leaf.sprite);

    /* ---------- the spent storm ---------- */
    const stormCount = 130;
    const stormPositions = new Float32Array(stormCount * 3);
    for (let i = 0; i < stormCount; i++) {
      const h1 = Math.sin(i * 12.9898) * 43758.5453;
      const h2 = Math.sin(i * 78.233) * 12345.6789;
      const h3 = Math.sin(i * 37.719) * 98765.4321;
      const r1 = h1 - Math.floor(h1);
      const r2 = h2 - Math.floor(h2);
      const r3 = h3 - Math.floor(h3);
      const p = seatPos
        .clone()
        .addScaledVector(F, 10 + r1 * 10)
        .addScaledVector(right, (r2 - 0.5) * 24);
      p.y = 0.5 + r3 * 3;
      const idx = i * 3;
      stormPositions[idx] = p.x;
      stormPositions[idx + 1] = p.y;
      stormPositions[idx + 2] = p.z;
    }
    storm = worldPoints(stormPositions, { size: 0.12, color: 0x6a7a9a });
    storm.material.opacity = 0;
    storm.sprite.visible = false;
    ctx.group.add(storm.sprite);
  }

  /** Per-frame visuals hook. */
  function tickShore(uT: number): void {
    if (!strand) return;

    const arr = strand.position.array as Float32Array;
    const k = 1 - THREE.MathUtils.smoothstep(uT, 190.9, 562.88);
    const pulse = uT > 7.94 ? Math.exp(-(uT - 7.94) * 1.5) : 0;
    const trefoilScale = 0.55 * (1 - 0.18 * pulse);
    const release = uT > 562.88 ? uT - 562.88 : 0;
    const scatterAmt = release * 0.06;
    const opacity = Math.min(Math.max(1 - release / 38, 0), 1);
    strand.material.opacity = opacity;

    for (let i = 0; i < 360; i++) {
      const s = i / 359;
      const bx = L.x + (Rr.x - L.x) * s;
      const by = L.y + (Rr.y - L.y) * s;
      const bz = L.z + (Rr.z - L.z) * s;
      const m = Math.min(Math.max((s - 0.3) / 0.4, 0), 1);
      const t = m * Math.PI * 2;
      const tx = Math.sin(t) + 2 * Math.sin(2 * t);
      const ty = Math.cos(t) - 2 * Math.cos(2 * t);
      const tz = -Math.sin(3 * t);
      const offX = tx * trefoilScale;
      const offY = ty * trefoilScale;
      const offZ = tz * trefoilScale;
      let px = bx + (K.x + offX - bx) * k;
      let py = by + (K.y + offY - by) * k;
      let pz = bz + (K.z + offZ - bz) * k;
      py -= Math.sin(Math.PI * m) * (1 - k) * 0.9;
      if (release > 0) {
        const h1 = Math.sin(i * 12.9898) * 43758.5453;
        const h2 = Math.sin(i * 78.233) * 12345.6789;
        const h3 = Math.sin(i * 37.719) * 98765.4321;
        const r1 = h1 - Math.floor(h1);
        const r2 = h2 - Math.floor(h2);
        const r3 = h3 - Math.floor(h3);
        px += (r1 - 0.5) * scatterAmt * 2;
        py += (r2 - 0.5) * scatterAmt * 2 + release * 0.02;
        pz += (r3 - 0.5) * scatterAmt * 2;
      }
      if (py < 0.2) py = 0.2;
      const idx = i * 3;
      arr[idx] = px;
      arr[idx + 1] = py;
      arr[idx + 2] = pz;
    }
    strand.position.needsUpdate = true;

    // Turning wheel
    if (wheelRig && wheelMesh) {
      const spin = uT > 240.77 ? (uT < 286.44 ? (uT - 240.77) * 1.4 : (286.44 - 240.77) * 1.4) : 0;
      wheelMesh.rotation.z = spin;
      const wheelOp = THREE.MathUtils.smoothstep(uT, 240.77, 243.77) * (1 - THREE.MathUtils.smoothstep(uT, 286.44, 292));
      (wheelMesh.material as THREE.MeshBasicNodeMaterial).opacity = wheelOp;
      wheelRig.visible = wheelOp > 0.001;
    }

    // Open hands
    const handOp = THREE.MathUtils.smoothstep(uT, 357.79, 361.79) * (1 - THREE.MathUtils.smoothstep(uT, 620, 636));
    for (const cloud of hands) {
      cloud.material.opacity = handOp;
      cloud.sprite.position.y = Math.sin(uT * 0.8) * 0.06;
    }

    // Leaf released
    if (leaf && leafOffsets) {
      const lt = uT - 387.58;
      if (lt > 0) {
        const leafOp = Math.min(Math.max(1 - lt / 14.5, 0), 1);
        leaf.material.opacity = leafOp;
        leaf.sprite.visible = leafOp > 0.001;
        const dp = K.clone().addScaledVector(F, lt * 1.2).addScaledVector(right, lt * 0.35);
        const leafArr = leaf.position.array as Float32Array;
        const leafCount = leafOffsets.length / 3;
        for (let j = 0; j < leafCount; j++) {
          const idx = j * 3;
          const ox = leafOffsets[idx];
          const oy = leafOffsets[idx + 1];
          const oz = leafOffsets[idx + 2];
          let px = dp.x + ox;
          let py = 0.45 + Math.sin(lt * 2 + j) * 0.08 + oy;
          let pz = dp.z + oz;
          if (py < 0.3) py = 0.3;
          leafArr[idx] = px;
          leafArr[idx + 1] = py;
          leafArr[idx + 2] = pz;
        }
        leaf.position.needsUpdate = true;
      } else {
        leaf.material.opacity = 0;
        leaf.sprite.visible = false;
      }
    }

    // Storm spent
    if (storm) {
      const stormOp = THREE.MathUtils.smoothstep(uT, 440.63, 442.0) * (1 - THREE.MathUtils.smoothstep(uT, 442.0, 449.0)) * 0.7;
      storm.material.opacity = stormOp;
      storm.sprite.visible = stormOp > 0.001;
    }
  }

  const beats: Beat[] = [
    { t: 0, apply: () => { /* tied state (k=1) — driven by tickShore(uT) */ } },
    { t: 7.94, apply: () => { /* knot pulls tight (pulse) — driven by tickShore(uT) */ } },
    { t: 190.9, apply: () => { /* loosening begins — driven by tickShore(uT) */ } },
    { t: 240.77, apply: () => { /* turning wheel appears — driven by tickShore(uT) */ } },
    { t: 286.44, apply: () => { /* wheel stops — driven by tickShore(uT) */ } },
    { t: 357.79, apply: () => { /* open hands — driven by tickShore(uT) */ } },
    { t: 387.58, apply: () => { /* leaf released — driven by tickShore(uT) */ } },
    { t: 440.63, apply: () => { /* storm spent — driven by tickShore(uT) */ } },
    { t: 562.88, apply: () => { /* RELEASE (knot fully unravels) — driven by tickShore(uT) */ } },
  ];

  const opts: LessonOpts = {
    id: "shore",
    trackId: "L03",
    seatPos,
    seatHeading,
    seatRadius: 3,
    build,
    beats,
  };

  const lesson = new LessonScene(scene, narration, whisper, opts);

  const baseUpdate = lesson.update.bind(lesson);
  const baseDispose = lesson.dispose.bind(lesson);

  lesson.update = (dt: number): void => {
    baseUpdate(dt);
    if (uTRef) uTNow = uTRef.value;
    tickShore(uTNow);
  };
  lesson.dispose = (): void => {
    baseDispose();
    if (strand) {
      strand.sprite.parent?.remove(strand.sprite);
      strand.material.dispose();
      strand = null;
    }
    if (disc) {
      disc.parent?.remove(disc);
      disc.geometry.dispose();
      (disc.material as THREE.Material).dispose();
      disc = null;
    }
    if (wheelRig) {
      wheelRig.parent?.remove(wheelRig);
      if (wheelMesh) {
        wheelMesh.geometry.dispose();
        (wheelMesh.material as THREE.Material).dispose();
      }
      wheelRig = null;
      wheelMesh = null;
    }
    for (const cloud of hands) {
      cloud.sprite.parent?.remove(cloud.sprite);
      cloud.material.dispose();
    }
    hands = [];
    if (leaf) {
      leaf.sprite.parent?.remove(leaf.sprite);
      leaf.material.dispose();
      leaf = null;
    }
    leafOffsets = null;
    if (storm) {
      storm.sprite.parent?.remove(storm.sprite);
      storm.material.dispose();
      storm = null;
    }
  };

  return lesson;
}
