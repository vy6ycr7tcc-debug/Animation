/* The way into the telling of Egypt from the pyramid itself (the owner: "Egypt reachable from the
   pyramid"). The Monument of Past Choices tells Egypt as a night in the desert before a great
   pyramid; standing beside the real one, a small gateway of cut sandstone on its plaza, off the
   north door's right, opens on that telling. Walk through its light and you are in it (the
   journey's Egypt room, `Journey.via`); its door brings you back out here. The pyramid's own
   interior stays Ra's chambers and the way to the Duat. */
import * as THREE from "three/webgpu";
import { T } from "../gpu/tsl";
import { contactShade, doorSpill, landStone, stoneBlock } from "./stoneworks";
import { heightAt } from "./terrain";

const { float, smoothstep, uv, vec3, vec4 } = T;
/** The opening: 2 m wide, 3.2 m high. */
const OPEN_W = 2.0, OPEN_H = 3.2;

export class EgyptGate {
  readonly group = new THREE.Group();
  /** Its centre on the ground (world), and the heading that walks in through it. */
  readonly at = new THREE.Vector3();
  readonly heading: number;
  private uT = T.uniform(0);

  /** `door`: the pyramid's entrance (world); the gate stands 16 m to its east and 14 m out from
      the face, square to it, its opening facing the plaza. */
  constructor(door: THREE.Vector3) {
    const x = door.x + 16, z = door.z - 14;
    const y = heightAt(x, z);
    this.at.set(x, y, z);
    this.heading = Math.PI; // walking in: toward +z (toward the pyramid's face)
    this.group.position.copy(this.at);
    const stone = landStone("sandstone_cracks", 0, 2.4, [1.02, 0.94, 0.8], { course: 0.85, block: 1.5, trim: { base: 0.5, top: 0.4 } });
    const parts: [THREE.BufferGeometry, number, number, number][] = [
      [stoneBlock(1.1, OPEN_H + 0.2, 1.3, 1), -(OPEN_W / 2 + 0.55), (OPEN_H + 0.2) / 2, 0],
      [stoneBlock(1.1, OPEN_H + 0.2, 1.3, 2), OPEN_W / 2 + 0.55, (OPEN_H + 0.2) / 2, 0],
      [stoneBlock(OPEN_W + 2.8, 0.7, 1.5, 3), 0, OPEN_H + 0.55, 0],
      [stoneBlock(OPEN_W + 3.2, 0.32, 1.7, 4), 0, OPEN_H + 1.06, 0],
      [stoneBlock(OPEN_W + 3.0, 0.18, 1.9, 5), 0, 0.09, 0], // the threshold
    ];
    for (const [g, px, py, pz] of parts) {
      const m = new THREE.Mesh(g, stone);
      m.position.set(px, py, pz);
      m.castShadow = m.receiveShadow = true;
      this.group.add(m);
    }
    // the opening: a soft warm light standing in it, breathing, deepest at its foot
    const lm = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: true });
    const q = uv();
    const edge = smoothstep(0, 0.16, q.x).mul(smoothstep(1, 0.84, q.x)).mul(smoothstep(1, 0.86, q.y));
    const breathe = T.sin(this.uT.mul(0.7)).mul(0.08).add(0.92);
    lm.colorNode = vec4(vec3(1.0, 0.64, 0.3).mul(edge.mul(float(0.32).sub(q.y.mul(0.2))).mul(breathe)), 1);
    const light = new THREE.Mesh(new THREE.PlaneGeometry(OPEN_W, OPEN_H), lm);
    light.position.set(0, OPEN_H / 2 + 0.18, 0);
    this.group.add(light);
    for (const s of [1, -1]) {
      const spill = doorSpill(OPEN_W, 6, new THREE.Color(1, 0.7, 0.38), 0.22);
      spill.rotation.y = s > 0 ? 0 : Math.PI;
      spill.position.set(0, 0.2, s * 0.8);
      this.group.add(spill);
    }
    const shade = contactShade({ w: OPEN_W + 3.2, d: 1.6 }, 1.4, 0.45);
    shade.position.y = 0.03;
    this.group.add(shade);
  }

  update(t: number): void {
    this.uT.value = t;
  }

  /** Walking in through its opening (from either side). */
  atGate(p: THREE.Vector3): boolean {
    return Math.abs(p.x - this.at.x) < OPEN_W / 2 - 0.2 && Math.abs(p.z - this.at.z) < 0.45 && p.y < this.at.y + 2;
  }

  /** Coming back out: on the plaza side, facing away from the gate (north). */
  outside(): { x: number; y: number; z: number; heading: number } {
    const x = this.at.x, z = this.at.z - 2.6;
    return { x, y: heightAt(x, z), z, heading: 0 };
  }
}
