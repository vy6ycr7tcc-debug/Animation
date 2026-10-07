/* The way into the long descent (the owner's brief): no door, no gate, no key, a single shaft of
   white-gold light large enough to step into, breathing slowly, rising from a quiet meadow out of
   a broken ring of etched stones. Visible from far away, a landmark long before it is understood.
   Walking into it: a soft white fade, and you are in the clouds high above, at the council. */
import * as THREE from "three/webgpu";
import { T, gpuUniforms } from "../../gpu/tsl";
import { heightAt, WANDERER_HALL, colliders } from "../../world/terrain";
import { etchedStone } from "../../world/etching";
import { keepAlpha, pointCloud, seeded, touch } from "../densities/roomKit";
import type { Hall } from "../journey";

const { abs, cameraPosition, fract, length, positionWorld, pow, sin, smoothstep, vec3, vec4 } = T;
const R_BEAM = 1.7;

export class WandererPortal implements Hall {
  readonly world = new THREE.Group();
  readonly label = "The long descent";
  readonly door: THREE.Vector3;
  readonly face = WANDERER_HALL.face;

  constructor() {
    const S = WANDERER_HALL;
    this.world.position.set(S.x, S.y, S.z);
    this.world.name = "long-descent-portal";
    this.door = new THREE.Vector3(S.x, S.y, S.z);
    const t = gpuUniforms.time;
    const R = seeded(6061);

    // the beam: a soft column of white-gold light, brightest at its heart, reaching high into the
    // sky (seen from far away), breathing slowly
    {
      const geo = new THREE.CylinderGeometry(R_BEAM, R_BEAM * 1.15, 220, 32, 1, true);
      geo.translate(0, 110, 0);
      const m = keepAlpha(new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.FrontSide, fog: false }));
      const core = pow(abs(T.dot(T.normalView, vec3(0, 0, 1))), 2.5);
      const y = T.positionGeometry.y;
      const breath = sin(t.mul(0.45)).mul(0.15).add(0.85);
      const rising = sin(y.mul(0.12).sub(t.mul(0.9))).mul(0.12).add(0.88);
      const fade = smoothstep(0, 1.2, y).mul(smoothstep(220, 40, y));
      const near = smoothstep(1.5, 6, length(cameraPosition.sub(positionWorld)));
      m.colorNode = vec4(vec3(1, 0.93, 0.78).mul(core).mul(breath).mul(rising).mul(fade).mul(near).mul(0.55), 1);
      this.world.add(new THREE.Mesh(geo, m));
      // a quiet pool of its light on the ground
      const pg = new THREE.CircleGeometry(5.5, 48);
      pg.rotateX(-Math.PI / 2);
      pg.translate(0, 0.05, 0);
      const pm = keepAlpha(new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
      const r = length(T.uv().sub(0.5)).mul(2);
      pm.colorNode = vec4(vec3(1, 0.9, 0.7).mul(pow(smoothstep(1, 0, r), 2)).mul(breath).mul(0.16), 1);
      this.world.add(new THREE.Mesh(pg, pm));
      // motes rising slowly up it
      const n = 160;
      const c = pointCloud(n, 0.09);
      for (let i = 0; i < n; i++) {
        const a = R() * Math.PI * 2, rr = Math.sqrt(R()) * R_BEAM * 0.9;
        c.pos.set([Math.cos(a) * rr, 0, Math.sin(a) * rr], i * 3);
        c.k.set([R(), R(), R(), R()], i * 4);
      }
      touch(c.cloud);
      const K = c.cloud.nodes.aK;
      const life = fract(K.x.add(t.mul(float_(0.03).add(K.y.mul(0.02)))));
      c.material.positionNode = c.cloud.nodes.position.add(vec3(0, life.mul(30), 0));
      c.material.colorNode = vec4(vec3(1, 0.9, 0.7).mul(c.round).mul(smoothstep(0, 0.1, life)).mul(smoothstep(1, 0.6, life)).mul(0.8), 1);
      this.world.add(c.cloud.sprite);
    }

    // the broken ring of etched stones round it, a few fallen
    {
      const stone = etchedStone("#1c1a2c", "#e9c37d", 1.6);
      for (let i = 0; i < 11; i++) {
        if (i === 3 || i === 8) continue; // the ring is broken
        const a = (i / 11) * Math.PI * 2 + (R() - 0.5) * 0.12;
        const r = 7.5 + (R() - 0.5) * 0.8;
        const fallen = i === 5 || i === 10;
        const h = fallen ? 0.9 : 2.2 + R() * 1.4;
        const geo = new THREE.BoxGeometry(0.9 + R() * 0.3, h, 0.55 + R() * 0.2, 2, 3, 2);
        const p = geo.attributes.position as THREE.BufferAttribute;
        for (let k = 0; k < p.count; k++) p.setXYZ(k, p.getX(k) * (1 - (p.getY(k) / h + 0.5) * 0.18) + (R() - 0.5) * 0.04, p.getY(k), p.getZ(k) + (R() - 0.5) * 0.04);
        geo.computeVertexNormals();
        const m = new THREE.Mesh(geo, stone);
        const x = Math.sin(a) * r, z = Math.cos(a) * r;
        const wy = heightAt(S.x + x, S.z + z) - S.y;
        if (fallen) {
          m.rotation.set(Math.PI / 2 - 0.1, a, 0);
          m.position.set(x, wy + 0.3, z);
        } else {
          m.rotation.set((R() - 0.5) * 0.08, a, (R() - 0.5) * 0.08);
          m.position.set(x, wy + h / 2 - 0.25, z);
          colliders.push({ x: S.x + x, z: S.z + z, r: 0.55, top: S.y + wy + h });
        }
        m.castShadow = m.receiveShadow = true;
        this.world.add(m);
      }
    }
  }

  atDoor(p: THREE.Vector3): boolean {
    return Math.hypot(p.x - this.door.x, p.z - this.door.z) < R_BEAM * 0.8;
  }
  outside(): { x: number; y: number; z: number; heading: number } {
    const x = this.door.x + Math.sin(this.face) * 4.5, z = this.door.z + Math.cos(this.face) * 4.5;
    return { x, y: heightAt(x, z), z, heading: this.face + Math.PI };
  }
  light(): void {
    /* nothing to light */
  }
}
const float_ = (v: number) => T.float(v);
