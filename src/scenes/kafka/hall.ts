/* The waiting room's outside (K1): a round building of the same dark stone (#1c1a2c) under a low
   dome, its one circle of gold etched round it at eye height, unbroken; a plain doorway toward
   home with darkness standing in it and a faint warmth low inside. Walking into the doorway, the
   screen darkens and you are within (scenes/kafka/waitingRoom.ts, a place apart). You come out
   through the room's own door of light, here before this doorway, facing home.

   Its ground is chosen after every other site in the world (`chooseWaitingSite`, called by
   main.ts once the temple stands), so adding it moved nothing: dry, level land 150–420 m from the
   shore, clear of every home, monument, lesson, grove, cave, mine, waterfall, river and glade. */
import * as THREE from "three/webgpu";
import { T, gpuUniforms } from "../../gpu/tsl";
import { ribbonGeometry, ribbonMaterial } from "../../gpu/ribbons";
import { CAVES, GLADES, KEEP_CLEAR, LANDMARK_SITES, MINE_SITES, SPAWN, WATERFALLS, heightAt, keptClear, levelGround, riverDist } from "../../world/terrain";
import { GROVE_SITES } from "../../world/sites";
import { SITES } from "../sites";
import { landStone, stoneBlock } from "../../world/stoneworks";
import { keepAlpha, merge } from "../densities/roomKit";
import type { Hall } from "../journey";
import { WR } from "./waitingRoom";

const { length, sin, smoothstep, uv, vec2, vec3, vec4 } = T;

export interface WaitSite { x: number; y: number; z: number; face: number }

/** Choose the waiting room's ground (once): see the header. `avoid`: places only main.ts knows
    (the temple's gate). Its ground is levelled and kept clear of trees and stones. */
export function chooseWaitingSite(avoid: { x: number; z: number; r: number }[]): WaitSite {
  const lessons = Object.values(SITES);
  let best = { x: SPAWN.x + 220, z: SPAWN.z + 120, h: 4 }, bestScore = -Infinity;
  for (let r = 150; r <= 420; r += 10)
    for (let k = 0; k < 64; k++) {
      const a = (k / 64) * Math.PI * 2 + r * 0.002, x = SPAWN.x + Math.sin(a) * r, z = SPAWN.z + Math.cos(a) * r;
      const h = heightAt(x, z);
      if (h < 3 || h > 22) continue;
      if (keptClear(x, z, 30)) continue;
      if (avoid.some((v) => Math.hypot(x - v.x, z - v.z) < v.r)) continue;
      if (LANDMARK_SITES.some(([lx, lz]) => Math.hypot(x - lx, z - lz) < 70)) continue;
      if (GROVE_SITES.some((g) => Math.hypot(x - g.x, z - g.z) < 60)) continue;
      if (lessons.some((s) => Math.hypot(x - s.x, z - s.z) < 70)) continue;
      if (CAVES.some((c) => Math.hypot(x - c.x, z - c.z) < 90)) continue;
      if (MINE_SITES.some((m) => Math.hypot(x - m.x, z - m.z) < 90)) continue;
      if (WATERFALLS.some((f) => Math.hypot(x - f.x, z - f.z) < 150)) continue;
      if (GLADES.some((g) => Math.hypot(x - g.x, z - g.z) < g.r + 25)) continue;
      if (riverDist(x, z) < 45) continue;
      // level and dry round it
      let rough = 0, low = Infinity;
      for (let j = 0; j < 10; j++) {
        const b = (j / 10) * Math.PI * 2;
        for (const rr of [6, 12, 20]) {
          const hh = heightAt(x + Math.cos(b) * rr, z + Math.sin(b) * rr);
          rough = Math.max(rough, Math.abs(hh - h));
          low = Math.min(low, hh);
        }
      }
      if (low < 1.5) continue;
      const score = -rough * 2.5 - Math.abs(r - 260) * 0.008;
      if (score > bestScore) (bestScore = score), (best = { x, z, h });
    }
  const y = Math.max(3, best.h);
  levelGround(best.x, best.z, y, 12, 22);
  KEEP_CLEAR.push({ x: best.x, z: best.z, r: 17 });
  // its door faces home, toward the shore where you wake
  return { x: best.x, y, z: best.z, face: Math.atan2(SPAWN.x - best.x, SPAWN.z - best.z) };
}

export class WaitingHall implements Hall {
  readonly world = new THREE.Group();
  readonly label = "The waiting room";
  readonly door: THREE.Vector3;
  readonly face: number;
  private inv = new THREE.Matrix4();
  private outer: number;

  constructor(site: WaitSite) {
    const { R, TH, H, DW, DH, ETCH } = WR;
    this.face = site.face;
    this.world.position.set(site.x, site.y, site.z);
    this.world.rotation.y = site.face;
    this.world.name = "waiting-room-hall";
    this.world.updateMatrixWorld(true);
    this.inv.copy(this.world.matrixWorld).invert();
    this.outer = R + TH;
    this.door = new THREE.Vector3(0, 0, R + TH / 2).applyMatrix4(this.world.matrixWorld);
    const t = gpuUniforms.time;

    // the same dark stone as within, weathered a little by the open air
    const stone = landStone("sandstone_cracks", site.y, 2.4, [0.16, 0.15, 0.27], { course: 0.62, block: 1.15, trim: { base: site.y, top: site.y + H } });
    const gap = Math.asin((DW / 2) / R) * 1.02;
    const ring = (r0: number, r1: number, a0: number, a1: number, depth: number, y0: number) => {
      const s = new THREE.Shape();
      s.absarc(0, 0, r1, a0, a1, false);
      s.absarc(0, 0, r0, a1, a0, true);
      s.closePath();
      const e = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false, curveSegments: 96 });
      e.rotateX(-Math.PI / 2);
      e.translate(0, y0, 0);
      return e;
    };
    // the doorway toward home (+z, the shape's −y)
    const a = -Math.PI / 2;
    const dome = new THREE.SphereGeometry(R + TH + 0.15, 64, 12, 0, Math.PI * 2, 0, Math.PI / 2);
    dome.scale(1, 0.32, 1);
    dome.translate(0, H - 0.05, 0);
    const lintel = stoneBlock(DW + 0.9, 0.42, TH + 0.12, 9);
    lintel.translate(0, DH + 0.2, R + TH / 2);
    const sill = stoneBlock(DW + 0.5, 0.12, TH + 0.3, 7);
    sill.translate(0, 0.04, R + TH / 2);
    const plinth = new THREE.CylinderGeometry(R + TH + 0.35, R + TH + 0.5, 0.5, 96);
    plinth.translate(0, -0.12, 0);
    const body = new THREE.Mesh(merge([ring(R, R + TH, a + gap, a - gap + Math.PI * 2, H, 0), ring(R, R + TH, a - gap, a + gap, H - DH, DH), dome, lintel, sill, plinth]), stone);
    body.castShadow = body.receiveShadow = true;
    this.world.add(body);

    // the circle of gold round it, at eye height, unbroken (on across the doorway)
    {
      const seg: number[] = [];
      const N = 256, y = ETCH, r = R + TH + 0.012;
      for (let i = 0; i < N; i++) {
        const a0 = (i / N) * Math.PI * 2, a1 = ((i + 1) / N) * Math.PI * 2;
        seg.push(Math.sin(a0) * r, y, Math.cos(a0) * r, Math.sin(a1) * r, y, Math.cos(a1) * r);
      }
      const p = T.positionGeometry;
      const swell = sin(T.atan(p.x, p.z).mul(2).sub(t.mul(0.12))).mul(0.12).add(0.88);
      const mesh = new THREE.Mesh(ribbonGeometry(seg), keepAlpha(ribbonMaterial(vec3(0.82, 0.55, 0.21).mul(swell).mul(0.95), 1.1)));
      mesh.frustumCulled = false;
      this.world.add(mesh);
    }
    // darkness standing in the doorway, velvet, a faint warmth low within
    {
      const g = new THREE.PlaneGeometry(DW, DH);
      g.translate(0, DH / 2, R + TH * 0.35);
      const m = new THREE.MeshBasicNodeMaterial({ fog: false });
      const u = uv();
      const warm = smoothstep(0.7, 0.0, length(u.sub(vec2(0.5, 0.05)).mul(vec2(1.2, 2.2))));
      const breath = sin(t.mul(0.5)).mul(0.1).add(0.9);
      m.colorNode = vec4(vec3(0.006, 0.006, 0.016).add(vec3(1.0, 0.79, 0.36).mul(warm).mul(breath).mul(0.07)), 1);
      this.world.add(new THREE.Mesh(g, m));
    }
  }

  atDoor(p: THREE.Vector3): boolean {
    if (Math.abs(p.x - this.door.x) > 12 || Math.abs(p.z - this.door.z) > 12) return false;
    const l = p.clone().applyMatrix4(this.inv);
    return Math.abs(l.x) < WR.DW / 2 - 0.2 && l.z < this.outer + 0.15 && l.z > WR.R - 0.4;
  }
  outside(): { x: number; y: number; z: number; heading: number } {
    const p = new THREE.Vector3(0, 0, this.outer + 3).applyMatrix4(this.world.matrixWorld);
    return { x: p.x, y: heightAt(p.x, p.z), z: p.z, heading: this.face + Math.PI };
  }
  light(): void {
    /* nothing to light: the room is as it is */
  }
}
