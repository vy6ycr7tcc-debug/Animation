import * as THREE from "three/webgpu";
import { softPoints, spriteCloud } from "../../gpu/tsl";
import type { Narration } from "../../core/narration";
import type { SceneModule } from "../lessonKit";
import { CreationKit } from "../creationKit";
import { barkMaterial } from "../../world/creation";

export function createDensity7(
  scene: THREE.Scene,
  narration: Narration,
  whisper: (t: string, ms?: number) => void,
  startPos: THREE.Vector3,
  startHeading: number
): SceneModule {
  const id = "density-7";
  const group = new THREE.Group();
  group.name = `density:${id}`;
  scene.add(group);

  const kit = new CreationKit();
  const disposables: Array<{ dispose(): void }> = [];

  // Corridor configuration
  const lengthZ = 120;
  const widthX = 8;
  
  // Replay ring/anchor (at start of corridor)
  const replayAnchor = startPos.clone();

  // Add the simple, quiet white-gold corridor geometry
  const floorGeo = new THREE.PlaneGeometry(widthX, lengthZ, 32, 128);
  floorGeo.rotateX(-Math.PI / 2);
  
  // Calculate relative position based on heading
  // For simplicity, we just place the corridor at startPos, facing startHeading
  const corridorGroup = new THREE.Group();
  corridorGroup.position.copy(startPos);
  corridorGroup.rotation.y = startHeading;
  group.add(corridorGroup);
  
  // Let's modify the floor to fade out at edges
  const floorMat = barkMaterial(new THREE.Color(0xfff7e6), null);
  floorMat.transparent = true;
  
  // Add some simple glowing path lights along the corridor
  const pointCount = 30;
  const positions = new Float32Array(pointCount * 3);
  for (let i = 0; i < pointCount; i++) {
    const z = -((i + 1) / pointCount) * lengthZ;
    const x = (i % 2 === 0 ? 1 : -1) * (widthX * 0.35);
    positions[i * 3] = x;
    positions[i * 3 + 1] = 0.2;
    positions[i * 3 + 2] = z;
  }
  
  const pMat = softPoints();
  pMat.size = 1.2;
  pMat.color.set(0xfff5e6);
  pMat.opacity = 0.7;
  pMat.sizeAttenuation = true;
  
  const pathLights = spriteCloud(pointCount, { position: 3 }, pMat);
  const pAttrs = pathLights.attrs.position.array as Float32Array;
  pAttrs.set(positions);
  pathLights.attrs.position.needsUpdate = true;
  
  // A glowing ring as the replay control at the start
  kit.rings(new THREE.Vector3(0, 1, -2), 1.5, 0.05);

  const floorMesh = new THREE.Mesh(floorGeo, floorMat);
  floorMesh.position.z = -lengthZ / 2; // Extends forward
  corridorGroup.add(floorMesh);
  corridorGroup.add(pathLights.sprite);
  
  disposables.push(floorGeo, floorMat, pMat);

  let active = true;
  let seated = false;
  
  // The corridor doesn't hold movement, but we track 'seated' to mean 'inside and listening'
  return {
    id,
    active: true,
    holdsMovement: () => false,
    nearSeat: (p: THREE.Vector3) => {
      // simple sphere check for the replay ring (which is at startPos rotated by heading + slightly forward)
      const dx = p.x - startPos.x;
      const dz = p.z - startPos.z;
      return dx * dx + dz * dz < 16;
    },
    onSit: () => {
      if (!active) return;
      seated = true;
      void narration.play("audio/densities/density_7.mp3");
    },
    onStand: () => {
      if (!active) return;
      seated = false;
      narration.stop();
    },
    update: (dt: number) => {
      if (!active) return;
      kit.update(dt, { value: narration.time() } as any);
    },
    dispose: () => {
      if (!active) return;
      active = false;
      seated = false;
      narration.stop();
      scene.remove(group);
      kit.dispose();
      for (const d of disposables) {
        try { d.dispose(); } catch {}
      }
    }
  };
}
