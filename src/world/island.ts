/* The island's seven lights, one for each station, set on a loose spiral inland.
   They are dark from the shore and appear once the wanderer is about halfway across.
   Milestone 2 replaces each light with its geometric sanctuary. */
import * as THREE from "three";
import { heightAt, ISLAND } from "./terrain";

export const STATION_SITES: THREE.Vector3[] = Array.from({ length: 7 }, (_, i) => {
  const a = Math.PI / 2 + i * 0.95;
  const r = 30 - i * 3.4;
  const x = ISLAND.x + Math.cos(a) * r;
  const z = ISLAND.z + Math.sin(a) * r;
  return new THREE.Vector3(x, heightAt(x, z), z);
});

function haloTexture(): THREE.Texture {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, "rgba(255,225,170,1)");
  grd.addColorStop(0.3, "rgba(255,200,130,0.35)");
  grd.addColorStop(1, "rgba(255,190,120,0)");
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class IslandLights {
  group = new THREE.Group();
  private halos: THREE.Sprite[] = [];
  private orbs: THREE.Mesh[] = [];
  private orbMat: THREE.MeshBasicMaterial;
  private haloMat: THREE.SpriteMaterial;

  constructor() {
    this.orbMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 1.8, 1.0), transparent: true });
    this.haloMat = new THREE.SpriteMaterial({ map: haloTexture(), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
    const orbGeo = new THREE.SphereGeometry(0.22, 16, 12);
    for (const p of STATION_SITES) {
      const orb = new THREE.Mesh(orbGeo, this.orbMat);
      orb.position.set(p.x, p.y + 2.2, p.z);
      const halo = new THREE.Sprite(this.haloMat);
      halo.position.copy(orb.position);
      halo.scale.setScalar(4.5);
      this.group.add(orb, halo);
      this.orbs.push(orb);
      this.halos.push(halo);
    }
  }

  /** `seen` is 0 from the shore and 1 once the wanderer is halfway across. */
  update(t: number, seen: number, reduced: boolean): void {
    this.orbMat.opacity = seen;
    this.haloMat.opacity = seen * (0.75 + 0.25 * Math.sin(t * 0.8));
    this.group.visible = seen > 0.001;
    this.orbs.forEach((o, i) => {
      o.position.y = STATION_SITES[i].y + 2.2 + (reduced ? 0 : Math.sin(t * 0.6 + i) * 0.12);
      this.halos[i].position.y = o.position.y;
    });
  }
}
