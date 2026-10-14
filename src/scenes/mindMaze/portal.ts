/* The way into the mind's maze (the owner's package): an open archway of two tall curved monoliths
   of dark stone leaning toward one another without touching, a breathing curtain of indigo-gold
   light hanging between them, and a spiral of low stepping stones winding in to it. Walking through
   the curtain: a soft white fade, and you stand at the threshold of the labyrinth. */
import * as THREE from "three/webgpu";
import { T, gpuUniforms } from "../../gpu/tsl";
import { heightAt, MAZE_HALL, colliders } from "../../world/terrain";
import { landStone } from "../../world/stoneworks";
import { keepAlpha, pointCloud, roughBlock, seeded, touch } from "../densities/roomKit";
import type { Hall } from "../journey";

const { cameraPosition, float, fract, length, positionWorld, pow, sin, smoothstep, uv, vec3, vec4 } = T;
/** Half the curtain's width. */
const HALF = 1.4;

export class MindMazePortal implements Hall {
  readonly world = new THREE.Group();
  readonly label = "The mind's maze";
  readonly door: THREE.Vector3;
  readonly face = MAZE_HALL.face;

  constructor() {
    const S = MAZE_HALL;
    this.world.position.set(S.x, S.y, S.z);
    this.world.name = "mind-maze-portal";
    this.door = new THREE.Vector3(S.x, S.y, S.z);
    const t = gpuUniforms.time;
    const R = seeded(7109);
    // the arch's own frame: its opening faces home (`face`), the monoliths either side of it
    const arch = new THREE.Group();
    arch.rotation.y = this.face;
    this.world.add(arch);
    const across = new THREE.Vector3(Math.cos(this.face), 0, -Math.sin(this.face));

    // two tall monoliths, curved and leaning toward one another, their tops not quite meeting
    {
      const stone = landStone("sandstone_cracks", 0, 2.2, [0.42, 0.42, 0.62]);
      for (const side of [-1, 1]) {
        const g = roughBlock(1.25, 7.4, 0.95, 0.32, side > 0 ? 3 : 8);
        const p = g.attributes.position as THREE.BufferAttribute;
        for (let i = 0; i < p.count; i++) {
          const y = p.getY(i) / 7.4;
          // a slow curve inward: the higher, the more they lean toward the curtain
          p.setX(i, p.getX(i) - side * (y * y) * 1.15);
        }
        g.computeVertexNormals();
        const m = new THREE.Mesh(g, stone);
        m.position.set(side * (HALF + 0.75), -0.3, 0);
        m.castShadow = m.receiveShadow = true;
        arch.add(m);
        const wx = S.x + across.x * side * (HALF + 0.75), wz = S.z + across.z * side * (HALF + 0.75);
        colliders.push({ x: wx, z: wz, r: 0.7, top: S.y + 7 });
      }
    }

    // the curtain: a breathing sheet of light hung between them, indigo below warming to gold
    {
      const g = new THREE.PlaneGeometry(HALF * 2, 6.2, 1, 1);
      g.translate(0, 3.1, 0);
      const m = keepAlpha(new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false }));
      const q = uv();
      const edge = smoothstep(0, 0.22, q.x).mul(smoothstep(1, 0.78, q.x)).mul(smoothstep(0, 0.06, q.y)).mul(smoothstep(1, 0.7, q.y));
      // fine falling folds, as of a veil
      const folds = sin(q.x.mul(38).add(sin(q.y.mul(5).add(t.mul(0.6))).mul(1.6))).mul(0.5).add(0.5);
      const breath = sin(t.mul(0.5)).mul(0.18).add(0.82);
      const col = T.mix(vec3(0.32, 0.36, 0.95), vec3(1, 0.82, 0.48), q.y);
      // it thins as you step into it, so the way through is never a wall of light
      const near = smoothstep(0.8, 4, length(cameraPosition.sub(positionWorld)));
      m.colorNode = vec4(col.mul(edge).mul(folds.mul(0.35).add(0.65)).mul(breath).mul(near).mul(0.42), 1);
      arch.add(new THREE.Mesh(g, m));
      // a quiet pool of its light on the ground before and after it
      const pg = new THREE.CircleGeometry(3.2, 40);
      pg.rotateX(-Math.PI / 2);
      pg.translate(0, 0.05, 0);
      const pm = keepAlpha(new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
      const r = length(uv().sub(0.5)).mul(2);
      pm.colorNode = vec4(vec3(0.7, 0.62, 0.95).mul(pow(smoothstep(1, 0, r), 2)).mul(breath).mul(0.12), 1);
      arch.add(new THREE.Mesh(pg, pm));
      // motes drifting up through it
      const n = 90;
      const c = pointCloud(n, 0.07);
      for (let i = 0; i < n; i++) {
        c.pos.set([(R() - 0.5) * HALF * 1.8, 0, (R() - 0.5) * 0.4], i * 3);
        c.k.set([R(), R(), R(), R()], i * 4);
      }
      touch(c.cloud);
      const K = c.cloud.nodes.aK;
      const life = fract(K.x.add(t.mul(float(0.04).add(K.y.mul(0.03)))));
      c.material.positionNode = c.cloud.nodes.position.add(vec3(sin(life.mul(6).add(K.z.mul(20))).mul(0.15), life.mul(6), 0));
      c.material.colorNode = vec4(T.mix(vec3(0.55, 0.6, 1), vec3(1, 0.86, 0.55), life).mul(c.round).mul(smoothstep(0, 0.1, life)).mul(smoothstep(1, 0.6, life)).mul(0.7), 1);
      arch.add(c.cloud.sprite);
    }

    // the stepping stones: a slow spiral of low flat stones winding in to the curtain
    {
      const stone = landStone("sandstone_cracks", 0, 1.4, [0.6, 0.58, 0.66]);
      const parts: THREE.Mesh[] = [];
      for (let i = 0; i < 15; i++) {
        const f = i / 14;
        const a = Math.PI * 0.5 + f * Math.PI * 2.1;
        const rr = 9.5 * (1 - f) + 1.6;
        const lx = Math.cos(a) * rr * 0.9, lz = Math.sin(a) * rr + (1 - f) * 2.5 + 1.6;
        const g = new THREE.CylinderGeometry(0.55 + R() * 0.2, 0.62 + R() * 0.2, 0.18, 9);
        const m = new THREE.Mesh(g, stone);
        // laid on the ground where it stands (the arch's frame turned into the world's)
        const c = Math.cos(this.face), s = Math.sin(this.face);
        const wx = S.x + lx * c + lz * s, wz = S.z - lx * s + lz * c;
        m.position.set(lx, heightAt(wx, wz) - S.y + 0.04, lz);
        m.rotation.y = R() * Math.PI;
        m.receiveShadow = true;
        parts.push(m);
      }
      arch.add(...parts);
    }
  }

  atDoor(p: THREE.Vector3): boolean {
    // within the curtain's width and a step either side of its plane
    const dx = p.x - this.door.x, dz = p.z - this.door.z;
    const along = dx * Math.cos(this.face) - dz * Math.sin(this.face);
    const through = dx * Math.sin(this.face) + dz * Math.cos(this.face);
    return Math.abs(along) < HALF * 0.85 && Math.abs(through) < 0.6;
  }
  outside(): { x: number; y: number; z: number; heading: number } {
    const x = this.door.x + Math.sin(this.face) * 3.5, z = this.door.z + Math.cos(this.face) * 3.5;
    return { x, y: heightAt(x, z), z, heading: this.face + Math.PI };
  }
  light(): void {
    /* nothing to light */
  }
}
