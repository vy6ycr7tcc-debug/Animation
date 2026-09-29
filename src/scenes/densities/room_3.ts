import * as THREE from "three/webgpu";
import { LessonScene } from "../lessonKit";
import type { LessonCtx, LessonOpts, SceneModule } from "../lessonKit";
import { worldPoints, glowShader, gpuUniforms, T, vnoise } from "../../gpu/tsl";
import { prismGeometry, crystalMaterial } from "../../world/creation";

const rnd = (i: number, s: number): number => {
  const x = Math.sin(i * 12.9898 + s * 78.233) * 43758.5453;
  return x - Math.floor(x);
};

export function createRoom3Scene(
  scene: THREE.Scene,
  narration: LessonCtx["narration"],
  whisper: (t: string, ms?: number) => void
): SceneModule {
  const C = new THREE.Vector3(0, 0, 0);
  const seat = new THREE.Vector3(0, 0, 3.4);
  const seatHeading = 0;

  const tickers: Array<(dt: number) => void> = [];
  const ours: Array<{ dispose(): void }> = [];

  const opts: LessonOpts = {
    id: "density-room-3",
    trackId: "audio/densities/density_3.mp3",
    seatPos: seat.clone(),
    seatHeading,
    build: (ctx) => {
      const kit = ctx.kit;
      ctx.group.add(kit.group);

      const pathGeo = new THREE.PlaneGeometry(16, 24);
      const pathMat = glowShader(
        { intensity: 0.4 },
        (u, uv) => {
          const split = T.smoothstep(T.float(0.48), T.float(0.52), uv.x);
          
          const colLeft = T.vec3(T.float(0.5), T.float(0.1), T.float(0.1));
          const colRight = T.vec3(T.float(0.2), T.float(0.5), T.float(0.8));
          const colMid = T.vec3(T.float(0.1), T.float(0.1), T.float(0.1));
          
          const fadeY = T.smoothstep(T.float(0.0), T.float(0.1), uv.y).mul(
            T.smoothstep(T.float(1.0), T.float(0.9), uv.y)
          );
          const fadeX = T.smoothstep(T.float(0.0), T.float(0.2), uv.x).mul(
            T.smoothstep(T.float(1.0), T.float(0.8), uv.x)
          );
          
          let col = T.mix(colLeft, colRight, split);
          
          const midDist = T.abs(uv.x.sub(T.float(0.5))).mul(T.float(2.0));
          const splitDark = T.smoothstep(T.float(0.0), T.float(0.15), midDist);
          col = T.mix(colMid, col, splitDark);
          
          return col.mul(fadeY).mul(fadeX).mul(u.intensity);
        },
        { side: THREE.DoubleSide }
      );
      const pathMesh = new THREE.Mesh(pathGeo, pathMat);
      pathMesh.rotation.x = -Math.PI / 2;
      pathMesh.position.set(C.x, C.y, C.z - 4);
      ctx.group.add(pathMesh);
      ours.push(pathGeo, pathMat);

      const N_ASH = 200;
      const ashPos = new Float32Array(N_ASH * 3);
      for(let i=0; i<N_ASH; i++) {
        ashPos[i*3] = C.x - 2.0 - rnd(i, 1)*5.0; 
        ashPos[i*3+1] = C.y + rnd(i, 2)*8.0;
        ashPos[i*3+2] = C.z - 8.0 + (rnd(i,3)-0.5)*12.0;
      }
      const ash = worldPoints(ashPos, { size: 0.05, color: 0xff4422, opacity: 0.7 });
      ctx.group.add(ash.sprite);
      ours.push(ash.material);

      tickers.push(() => {
        const t = gpuUniforms.time.value;
        if (!Number.isFinite(t)) return;
        const a = ash.position.array as Float32Array;
        for(let i=0; i<N_ASH; i++) {
          const i3 = i*3;
          const rise = (rnd(i, 4) + t * (0.05 + 0.05 * rnd(i, 5))) % 1.0;
          a[i3+1] = C.y + rise * 8.0;
          a[i3] = C.x - 2.0 - rnd(i,1)*5.0 - rise*1.0;
        }
        ash.position.needsUpdate = true;
      });

      const N_SHARDS = 15;
      const shardGeo = prismGeometry();
      const shardMat = crystalMaterial();
      shardMat.colorNode = T.vec4(T.vec3(0.6, 0.1, 0.1), 1.0);
      
      const sC = new Float32Array(N_SHARDS * 3);
      for (let i = 0; i < N_SHARDS; i++) {
        sC[i * 3 + 0] = 0.6;
        sC[i * 3 + 1] = 0.1;
        sC[i * 3 + 2] = 0.1;
      }
      shardGeo.setAttribute("aC", new THREE.InstancedBufferAttribute(sC, 3));
      const shardsMesh = new THREE.InstancedMesh(shardGeo, shardMat, N_SHARDS);
      shardsMesh.renderOrder = 2;
      shardsMesh.frustumCulled = false;
      ctx.group.add(shardsMesh);
      ours.push(shardGeo, shardMat);

      const shardNode = new THREE.Object3D();
      for(let i=0; i<N_SHARDS; i++) {
        shardNode.position.set(C.x - 3.0 - rnd(i, 1)*3.0, C.y, C.z - 8.0 + (rnd(i,2)-0.5)*10.0);
        shardNode.rotation.set((rnd(i, 3)-0.5)*0.5, rnd(i,4)*Math.PI, (rnd(i, 5)-0.5)*0.5 + 0.2); 
        shardNode.scale.setScalar(1.0 + rnd(i, 6)*1.5);
        shardNode.updateMatrix();
        shardsMesh.setMatrixAt(i, shardNode.matrix);
      }
      shardsMesh.instanceMatrix.needsUpdate = true;

      const N_MOTES = 200;
      const motePos = new Float32Array(N_MOTES * 3);
      for(let i=0; i<N_MOTES; i++) {
        motePos[i*3] = C.x + 2.0 + rnd(i, 1)*5.0; 
        motePos[i*3+1] = C.y + rnd(i, 2)*6.0;
        motePos[i*3+2] = C.z - 8.0 + (rnd(i,3)-0.5)*12.0;
      }
      const motes = worldPoints(motePos, { size: 0.08, color: 0x88ccff, opacity: 0.8 });
      ctx.group.add(motes.sprite);
      ours.push(motes.material);

      tickers.push(() => {
        const t = gpuUniforms.time.value;
        if (!Number.isFinite(t)) return;
        const a = motes.position.array as Float32Array;
        for(let i=0; i<N_MOTES; i++) {
          const i3 = i*3;
          const drift = t * 0.1 + rnd(i,4)*Math.PI*2;
          a[i3] = C.x + 2.0 + rnd(i, 1)*5.0 + Math.sin(drift)*0.5;
          a[i3+1] = C.y + (rnd(i,2)*6.0 + t*0.2)%6.0;
          a[i3+2] = C.z - 8.0 + (rnd(i,3)-0.5)*12.0 + Math.cos(drift)*0.5;
        }
        motes.position.needsUpdate = true;
      });

      const rightBeams = [
        new THREE.Vector3(C.x + 3.0, C.y, C.z - 4.0),
        new THREE.Vector3(C.x + 5.0, C.y, C.z - 8.0),
        new THREE.Vector3(C.x + 2.5, C.y, C.z - 11.0),
      ];
      kit.beams(rightBeams, 8.0, 0.6);

      const portalGeo = new THREE.PlaneGeometry(3, 5);
      const portalMat = glowShader(
        { intensity: 0.6 },
        (u, uv) => {
          const edge = T.smoothstep(T.float(0.0), T.float(0.1), uv.x).mul(
            T.smoothstep(T.float(1.0), T.float(0.9), uv.x)
          ).mul(
            T.smoothstep(T.float(1.0), T.float(0.95), uv.y)
          );
          return T.vec3(T.float(1.0), T.float(0.9), T.float(0.8)).mul(edge).mul(u.intensity);
        },
        { side: THREE.DoubleSide }
      );
      const portalMesh = new THREE.Mesh(portalGeo, portalMat);
      portalMesh.position.set(C.x, C.y + 2.5, C.z - 15);
      ctx.group.add(portalMesh);
      ours.push(portalGeo, portalMat);
      
      tickers.push(() => {
          const t = gpuUniforms.time.value;
          if (!Number.isFinite(t)) return;
          portalMat.uniforms.intensity.value = 0.6 + 0.1 * Math.sin(t * 1.5);
      });

    },
    beats: [],
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
