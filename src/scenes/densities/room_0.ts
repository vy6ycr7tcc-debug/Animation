import * as THREE from "three/webgpu";
import { LessonScene } from "../lessonKit";
import type { LessonCtx, LessonOpts, SceneModule } from "../lessonKit";
import { T, gpuUniforms } from "../../gpu/tsl";
import { etchedStone } from "../../world/etching";
import { softPoints, spriteCloud } from "../../gpu/tsl";

const clamp01 = (x: number): number => (x <= 0 ? 0 : x >= 1 ? 1 : x);

function fadeU(uT: number, t0: number, t1: number, t2: number, t3: number): number {
  if (uT <= t0 || uT >= t3) return 0;
  if (uT < t1) return clamp01((uT - t0) / Math.max(1e-6, t1 - t0));
  if (uT <= t2) return 1;
  return clamp01(1 - (uT - t2) / Math.max(1e-6, t3 - t2));
}

export function createDensityRoom0Scene(
  scene: THREE.Scene,
  narration: LessonCtx["narration"],
  whisper: (t: string, ms?: number) => void
): SceneModule {
  // Temporary zero site; integration coordinates will be injected later.
  const S = { x: 0, z: 0, y: 0, heading: 0 };
  const seatPos = new THREE.Vector3(S.x, S.y, S.z);
  const heading = S.heading;

  const tickers: Array<(dt: number) => void> = [];
  const ours: Array<{ dispose(): void }> = [];

  const build = (ctx: LessonCtx) => {
    let lifeT = 0;
    
    // --- Ground ---
    const floorGeo = new THREE.PlaneGeometry(100, 100);
    floorGeo.rotateX(-Math.PI / 2);
    const floorMat = etchedStone("#0a0a0f", "#2a2240", 20.0, { triplanar: true });
    const floorMesh = new THREE.Mesh(floorGeo, floorMat);
    floorMesh.position.y = -0.1;
    ctx.group.add(floorMesh);
    ours.push(floorGeo, floorMat);

    // --- Exterior Doorway ---
    // A modest dark stone archway behind the player
    const doorGroup = new THREE.Group();
    doorGroup.position.set(0, 0, 5); // Behind seat
    ctx.group.add(doorGroup);

    const pillarGeo = new THREE.BoxGeometry(1, 4, 1);
    const lintelGeo = new THREE.BoxGeometry(5, 1, 1);
    const doorMat = etchedStone("#1c1a2c", "#e9c37d", 4.0, { triplanar: true });
    
    const p1 = new THREE.Mesh(pillarGeo, doorMat);
    p1.position.set(-2, 2, 0);
    doorGroup.add(p1);
    
    const p2 = new THREE.Mesh(pillarGeo, doorMat);
    p2.position.set(2, 2, 0);
    doorGroup.add(p2);
    
    const lintel = new THREE.Mesh(lintelGeo, doorMat);
    lintel.position.set(0, 4.5, 0);
    doorGroup.add(lintel);
    
    ours.push(pillarGeo, lintelGeo, doorMat);
    
    // --- Cosmos Core (Looping Miniature Universe) ---
    // A central radiant wisp (unbearable light at the core)
    ctx.kit.wisp(new THREE.Vector3(1, 0.9, 0.8), 2.5);
    ctx.kit.setCenter(new THREE.Vector3(0, 3, -8));

    // Galaxies blooming / Stars igniting
    // We'll use softPoints which uses PointsNodeMaterial, the supported idiom for WebGL2 fallback points in this codebase
    const starMat = new THREE.PointsNodeMaterial({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: true });
    
    // Custom TSL for swirling stars
    const ep = T.positionWorld;
    const aPh = T.attribute("aPh", "float");
    const aK = T.attribute("aK", "float");
    
    const timeT = gpuUniforms.time.mul(0.1);
    
    const r = T.mix(1.5, 12.0, aK); // Radius from core
    const angle = aPh.mul(Math.PI * 2.0).add(timeT).add(r.mul(0.5)); // Swirl
    
    const cx = T.sin(angle).mul(r);
    const cz = T.cos(angle).mul(r);
    const cy = T.sin(aPh.mul(13.1).add(timeT.mul(5.0))).mul(2.0).mul(T.float(1.0).sub(aK)); // Swirl thickness
    
    starMat.positionNode = T.vec3(cx, T.float(3.0).add(cy), T.float(-8.0).add(cz));
    
    const starFade = T.sin(aPh.mul(27.3).add(gpuUniforms.time)).mul(0.5).add(0.5);
    const starFalloff = T.exp(T.length(T.pointUV.sub(0.5).mul(2.0)).mul(-3.0));
    
    starMat.colorNode = T.vec4(T.vec3(1.0, 0.9, 0.95).mul(starFalloff).mul(starFade).mul(1.5), 1.0);
    
    const starCloud = spriteCloud(300, { aPh: 1, aK: 1 }, starMat);
    for (let i = 0; i < 300; i++) {
        starCloud.set(i, { aPh: Math.random(), aK: Math.random() });
    }
    starCloud.setCount(300);
    softPoints(starCloud.sprite, 30, starMat);
    ctx.group.add(starCloud.sprite);
    ours.push(starMat);

    // Volcano / Fire pouring (warm orange additive points)
    const fireMat = new THREE.PointsNodeMaterial({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: true });
    
    const fPh = T.attribute("aPh", "float");
    const fK = T.attribute("aK", "float");
    
    const fireTr = T.fract(fPh.add(gpuUniforms.time.mul(0.3))); // Upward flow
    const fireY = T.float(0.0).add(fireTr.mul(4.0));
    const fireFade = T.smoothstep(0.0, 0.1, fireTr).mul(T.float(1).sub(T.smoothstep(0.6, 1.0, fireTr)));
    
    const fireX = T.sin(gpuUniforms.time.mul(0.5).add(fPh.mul(11.1))).mul(0.5).mul(fireTr);
    const fireZ = T.cos(gpuUniforms.time.mul(0.4).add(fPh.mul(17.3))).mul(0.5).mul(fireTr);
    
    fireMat.positionNode = T.vec3(fireX, fireY.add(2.0), T.float(-8.0).add(fireZ));
    
    const fireFalloff = T.exp(T.length(T.pointUV.sub(0.5).mul(2.0)).mul(-4.0));
    fireMat.colorNode = T.vec4(T.vec3(1.0, 0.4, 0.1).mul(fireFalloff).mul(fireFade).mul(2.0), 1.0);
    
    const fireCloud = spriteCloud(100, { aPh: 1, aK: 1 }, fireMat);
    for (let i = 0; i < 100; i++) {
        fireCloud.set(i, { aPh: Math.random(), aK: Math.random() });
    }
    fireCloud.setCount(100);
    softPoints(fireCloud.sprite, 40, fireMat);
    ctx.group.add(fireCloud.sprite);
    ours.push(fireMat);

    // Oceans forming (blue glowing ring on the ground)
    ctx.kit.groundDisc(10, 0x0044ff, 0.2, 0.05);
    ctx.kit.group.position.set(0, 0, -8); // Shift kit center for ground disc

    // --- Portal Transition (0->1) ---
    // The chamber goes pitch black; a single path forward.
    // We add path lights leading forward. They will become fully visible after the narration ends.
    
    // Let's create an envelope variable for the chamber visibility
    // Note: Instead of opacityNode which is WebGPU only, we must update material.opacity directly.
    let chamberVis = 1.0;
    floorMat.transparent = true;
    doorMat.transparent = true;
    
    // Provide life clock for ambient elements
    tickers.push((dt: number) => {
      lifeT += Math.min(dt, 0.05);
      
      if (transitioning) {
        chamberVis = Math.max(0, chamberVis - dt * 0.5);
        floorMat.opacity = chamberVis;
        doorMat.opacity = chamberVis;
      }
    });
  };
  
  let transitioning = false;

  const opts: LessonOpts = {
    id: "density_0",
    trackId: "audio/densities/the_beginning.mp3",
    seatPos,
    seatHeading: heading,
    build,
    beats: [
      {
        t: 60.0, // Adjust this beat time when audio length is known
        apply: (ctx) => {
           transitioning = true;
           // Path forward appears
           const pts = [];
           for(let i = 0; i < 8; i++) {
             pts.push(new THREE.Vector3(0, 0, -10 - i * 2));
           }
           ctx.kit.pathLights(pts);
        }
      }
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

  return lesson;
}
