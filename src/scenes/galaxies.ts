/* ------------------------------------------------------------------ *
 *  THE GALAXIES LESSON — A dome of stars waits above the wanderer.
 *
 *  It ignites when the story calls it, then rain falls and lets go.
 *  Two luminous wisps meet as mother and child, a thin ring opens,
 *  and warm gold guests gather above the seat — everything a pure
 *  function of the narration's clock.
 * ------------------------------------------------------------------ */

import * as THREE from "three/webgpu";
import { LessonScene, type LessonCtx, type Beat, type SceneModule } from "./lessonKit";
import type { Narration } from "../core/narration";
import { CreationKit } from "./creationKit";
import { SITES } from "./sites";
import { worldPoints, spectrum, hash3, T } from "../gpu/tsl";

const site = SITES.galaxies;

/** float node helper */
const nf = (n: number): any => T.float(n);
/** smoothstep(edge0, edge1, x) helper — all edges are literal seconds */
const ss = (a: number, b: number, x: any): any => T.smoothstep(nf(a), nf(b), x);

/** Deterministic Park-Miller stream for galaxy placement. */
let gSeed = 11;
const gRnd = () => ((gSeed = (gSeed * 16807) % 2147483647) / 2147483647);

/** Billowing abstract luminous cluster: points inside a soft sphere. */
function wispCloud(n: number, r: number): Float32Array {
  const a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const u = gRnd() * 2 - 1;
    const th = gRnd() * Math.PI * 2;
    const s = Math.sqrt(Math.max(0, 1 - u * u));
    const rad = r * Math.cbrt(gRnd());
    a[i * 3] = s * Math.cos(th) * rad;
    a[i * 3 + 1] = u * rad * 0.9;
    a[i * 3 + 2] = s * Math.sin(th) * rad;
  }
  return a;
}

function build(ctx: LessonCtx): void {
  // The lesson clock as a TSL node (LessonScene owns the uniform; the interface only promises .value).
  const uT: any = ctx.uT;
  const group = ctx.group;
  const kit: CreationKit = ctx.kit;

  const seat = new THREE.Vector3(site.x, site.y, site.z);
  const fwd = new THREE.Vector3(-Math.sin(site.heading), 0, -Math.cos(site.heading));
  const right = new THREE.Vector3(Math.cos(site.heading), 0, -Math.sin(site.heading));

  /* ------------------------------------------------------------------ *
   *  GALAXY DOME — The sky fills with stars, a vast dome breathing above the seat.
   * ------------------------------------------------------------------ */
  const DOME_N = 4500;
  const domePos = new Float32Array(DOME_N * 3);
  for (let i = 0; i < DOME_N; i++) {
    const u = gRnd();
    const phi = Math.acos(u);
    const theta = gRnd() * Math.PI * 2;
    const r = 260 * (0.86 + gRnd() * 0.14);
    const sp = Math.sin(phi);
    domePos[i * 3] = seat.x + Math.cos(theta) * sp * r;
    domePos[i * 3 + 1] = seat.y + Math.cos(phi) * r;
    domePos[i * 3 + 2] = seat.z + Math.sin(theta) * sp * r;
  }

  const domeHash = hash3(T.positionLocal.mul(nf(0.021)));
  const domeTint = spectrum(domeHash.x);
  const domeTwinkle = T.mix(
    nf(0.55),
    nf(1.0),
    T.sin(uT.mul(nf(0.9)).add(domeHash.y.mul(nf(37.0)))).mul(nf(0.5)).add(nf(0.5))
  );
  const domeOpacity = ss(183.6, 195, uT).mul(nf(0.35)).add(ss(279.05, 300, uT).mul(nf(0.65)));

  const dome = worldPoints(domePos, {
    colorNode: domeTint.mul(domeTwinkle),
    opacityNode: domeOpacity,
    size: 2.0,
    sizeAttenuation: true,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    fog: false,
  });
  group.add(dome.sprite);

  /* ------------------------------------------------------------------ *
   *  RAIN — Rain falls through the dark and eases away, leaving the air clean.
   * ------------------------------------------------------------------ */
  const RAIN_N = 1500;
  const RAIN_R = 40;
  const RAIN_H = 18;
  const RAIN_SPEED = 7;
  const rainPos = new Float32Array(RAIN_N * 3);
  for (let i = 0; i < RAIN_N; i++) {
    const a = gRnd() * Math.PI * 2;
    const rr = Math.sqrt(gRnd()) * RAIN_R;
    rainPos[i * 3] = seat.x + Math.cos(a) * rr;
    rainPos[i * 3 + 1] = gRnd() * RAIN_H;
    rainPos[i * 3 + 2] = seat.z + Math.sin(a) * rr;
  }

  const rainFall = T.fract(
    T.positionLocal.y.div(nf(RAIN_H)).add(uT.mul(nf(RAIN_SPEED / RAIN_H)))
  );
  const rainY = nf(RAIN_H).sub(rainFall.mul(nf(RAIN_H))).add(nf(seat.y));
  const rainPosNode = T.vec3(T.positionLocal.x, rainY, T.positionLocal.z);

  const rainHash = hash3(T.positionLocal.mul(nf(0.11)));
  const rainColor = T.vec3(0.52, 0.58, 0.68).mul(nf(0.75).add(rainHash.x.mul(nf(0.5))));
  const rainOpacity = ss(0, 5, uT)
    .mul(nf(0.6))
    .add(ss(5, 30.37, uT).mul(nf(0.35)))
    .sub(ss(83.54, 107.08, uT).mul(nf(0.35)))
    .sub(ss(160, 183.6, uT).mul(nf(0.6)))
    .add(ss(595.39, 605, uT).mul(nf(0.25)));

  const rain = worldPoints(rainPos, {
    positionNode: rainPosNode,
    colorNode: rainColor,
    opacityNode: rainOpacity,
    size: 0.16,
    sizeAttenuation: true,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    fog: false,
  });
  group.add(rain.sprite);

  /* ------------------------------------------------------------------ *
   *  MOTHER + CHILD WISPS — Two luminous wisps find each other, cuddle, and look up.
   * ------------------------------------------------------------------ */
  const MOTHER_R = 2.6;
  const CHILD_R = 1.4;

  const motherCenter = seat.clone().addScaledVector(fwd, 2.6).addScaledVector(right, 0.55);
  motherCenter.y += 1.55;
  const childCenter = motherCenter
    .clone()
    .addScaledVector(right, -0.78)
    .addScaledVector(fwd, 0.22);
  childCenter.y -= 0.38;

  const wispIn = ss(83.54, 89.54, uT);
  const wispOut = nf(1).sub(ss(612.83, 620.0, uT));
  const wispFade = wispIn.mul(wispOut);

  const lookUp = ss(575.91, 585, uT);

  // --- mother ---
  const mY = T.clamp(T.positionLocal.y.div(nf(MOTHER_R)).mul(nf(0.5)).add(nf(0.5)), nf(0), nf(1));
  const mH = hash3(T.positionLocal.mul(nf(0.37)));
  const mMix = T.clamp(mY.mul(nf(0.65)).add(mH.x.mul(nf(0.35))), nf(0), nf(1));
  const motherColor = T.mix(T.vec3(1.0, 0.7, 0.3), T.vec3(0.4, 0.62, 1.0), mMix);

  const motherPosNode = T.vec3(
    T.positionLocal.x,
    T.positionLocal.y
      .add(T.positionLocal.y.mul(lookUp).mul(nf(0.35)))
      .add(lookUp.mul(nf(0.3))),
    T.positionLocal.z
  );

  const mother = worldPoints(wispCloud(800, MOTHER_R), {
    positionNode: motherPosNode,
    colorNode: motherColor,
    opacityNode: wispFade.mul(nf(0.95)),
    size: 0.09,
    sizeAttenuation: true,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    fog: false,
  });
  mother.sprite.position.copy(motherCenter);
  group.add(mother.sprite);

  // --- child (nestled; tightens toward mother at 220.16) ---
  const pull = motherCenter.clone().sub(childCenter);
  const pullVec = T.vec3(pull.x, pull.y, pull.z);
  const cuddle = ss(215, 220.16, uT);

  const childBase = T.mix(
    T.positionLocal,
    T.positionLocal.mul(nf(0.82)).add(pullVec),
    cuddle
  );
  const childPosNode = T.vec3(
    childBase.x,
    childBase.y.add(childBase.y.mul(lookUp).mul(nf(0.35))).add(lookUp.mul(nf(0.3))),
    childBase.z
  );

  const cY = T.clamp(T.positionLocal.y.div(nf(CHILD_R)).mul(nf(0.5)).add(nf(0.5)), nf(0), nf(1));
  const cH = hash3(T.positionLocal.mul(nf(0.53)));
  const cMix = T.clamp(cY.mul(nf(0.6)).add(cH.x.mul(nf(0.4))), nf(0), nf(1));
  const childColor = T.mix(T.vec3(1.0, 0.78, 0.4), T.vec3(0.45, 0.7, 1.0), cMix);

  const child = worldPoints(wispCloud(400, CHILD_R), {
    positionNode: childPosNode,
    colorNode: childColor,
    opacityNode: wispFade.mul(nf(0.85)),
    size: 0.07,
    sizeAttenuation: true,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    fog: false,
  });
  child.sprite.position.copy(childCenter);
  group.add(child.sprite);

  /* ------------------------------------------------------------------ *
   *  RING — A thin ring opens in the air, quiet as a held breath.
   * ------------------------------------------------------------------ */
  const RING_N = 420;
  const ringPos = new Float32Array(RING_N * 3);
  for (let i = 0; i < RING_N; i++) {
    const a = (i / RING_N) * Math.PI * 2;
    const rr = 1.0 + (gRnd() - 0.5) * 0.02;
    ringPos[i * 3] = Math.cos(a) * rr;
    ringPos[i * 3 + 1] = (gRnd() - 0.5) * 0.03;
    ringPos[i * 3 + 2] = Math.sin(a) * rr;
  }

  const ringCenter = seat.clone().addScaledVector(fwd, 1.55);
  ringCenter.y += 1.2;

  const ringOpen = ss(163.85, 175.20, uT);
  const ringScale = T.mix(nf(0.28), nf(1.1), ringOpen);
  const ringPosNode = T.vec3(
    T.positionLocal.x.mul(ringScale),
    T.positionLocal.y,
    T.positionLocal.z.mul(ringScale)
  );
  const ringOpacity = ss(156.83, 158.6, uT)
    .mul(T.mix(nf(1.0), nf(0.45), ringOpen))
    .mul(nf(1).sub(ss(178.0, 183.6, uT)))
    .mul(nf(0.9));

  const ringHash = hash3(T.positionLocal.mul(nf(2.3)));
  const ringColor = T.mix(T.vec3(1.0, 0.86, 0.55), T.vec3(0.6, 0.8, 1.0), ringHash.x);

  const ring = worldPoints(ringPos, {
    positionNode: ringPosNode,
    colorNode: ringColor,
    opacityNode: ringOpacity,
    size: 0.035,
    sizeAttenuation: true,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    fog: false,
  });
  ring.sprite.position.copy(ringCenter);
  group.add(ring.sprite);

  /* ------------------------------------------------------------------ *
   *  GUESTS — Warm gold guests drift down from the horizon and gather above the seat.
   * ------------------------------------------------------------------ */
  const GUEST_N = 300;
  const guestAnchor = seat.clone();
  guestAnchor.y += 1.4;

  const guestPos = new Float32Array(GUEST_N * 3);
  for (let i = 0; i < GUEST_N; i++) {
    const a = gRnd() * Math.PI * 2;
    const rr = 150 + gRnd() * 110;
    guestPos[i * 3] = seat.x + Math.cos(a) * rr - guestAnchor.x;
    guestPos[i * 3 + 1] = seat.y + 4 + gRnd() * 26 - guestAnchor.y;
    guestPos[i * 3 + 2] = seat.z + Math.sin(a) * rr - guestAnchor.z;
  }

  const gH = hash3(T.positionLocal.mul(nf(0.013)));
  const guestTarget = T.vec3(
    gH.x.sub(nf(0.5)).mul(nf(2.6)),
    gH.y.mul(nf(1.4)).add(nf(0.15)),
    gH.z.sub(nf(0.5)).mul(nf(2.6))
  );
  const arrive = ss(507.97, 535.0, uT);
  const guestMix = T.mix(T.positionLocal, guestTarget, arrive);
  const guestBob = T.sin(uT.mul(nf(0.8)).add(gH.x.mul(nf(20.0))))
    .mul(nf(0.12))
    .mul(arrive);
  const guestPosNode = T.vec3(guestMix.x, guestMix.y.add(guestBob), guestMix.z);

  const guestColor = T.mix(T.vec3(1.0, 0.72, 0.34), T.vec3(1.0, 0.9, 0.62), gH.y);
  const guestOpacity = ss(507.97, 520.62, uT).mul(nf(0.9));
  const guestSize = T.mix(nf(2.4), nf(0.18), arrive);

  const guests = worldPoints(guestPos, {
    positionNode: guestPosNode,
    colorNode: guestColor,
    opacityNode: guestOpacity,
    sizeNode: guestSize,
    sizeAttenuation: true,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    fog: false,
  });
  guests.sprite.position.copy(guestAnchor);
  group.add(guests.sprite);

  /* ------------------------------------------------------------------ *
   *  GROUND — The ground holds the seat and all that falls, patient beneath.
   * ------------------------------------------------------------------ */
  kit.groundDisc(70, 0x16233c, 0.28, site.y - 0.02);
  kit.groundDisc(22, 0x1d3350, 0.14, site.y - 0.01);

  const path: THREE.Vector3[] = [];
  for (let i = 0; i < 7; i++) {
    const k = i / 6;
    const p = seat.clone().addScaledVector(fwd, 2.0 + k * 12.0);
    p.y = site.y + 0.06;
    path.push(p);
  }
  kit.pathLights(path);
}

export function createGalaxiesScene(
  scene: THREE.Scene,
  narration: Narration,
  whisper: (t: string, ms?: number) => void
): SceneModule {
  const seatPos = new THREE.Vector3(site.x, site.y, site.z);
  const beats: Beat[] = [];
  const onEnd = (): void => {
    /* dome and stars remain; nothing to tear down. */
  };

  return new LessonScene(scene, narration, whisper, {
    id: "galaxies",
    trackId: "L06",
    seatPos,
    seatHeading: site.heading,
    seatRadius: 3,
    build,
    beats,
    onEnd,
  });
}
