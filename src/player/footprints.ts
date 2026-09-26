/* Footprints of radiance that fade: the world remembers your passing briefly, then lets go.
   On land they are small glowing prints; on water the Water class draws rings instead. */
import * as THREE from "three/webgpu";

const COUNT = 48;
const LIFE = 5; // seconds

function printTexture(): THREE.Texture {
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 96;
  const g = c.getContext("2d")!;
  g.translate(32, 48);
  g.scale(1, 1.45);
  const grd = g.createRadialGradient(0, 0, 0, 0, 0, 28);
  grd.addColorStop(0, "rgba(255,236,200,0.9)");
  grd.addColorStop(0.5, "rgba(255,210,150,0.35)");
  grd.addColorStop(1, "rgba(255,190,130,0)");
  g.fillStyle = grd;
  g.beginPath();
  g.arc(0, 0, 28, 0, Math.PI * 2);
  g.fill();
  // A fine ring, like a pen mark.
  g.strokeStyle = "rgba(255,240,210,0.8)";
  g.lineWidth = 1.2;
  g.beginPath();
  g.arc(0, 0, 13, 0.3, Math.PI * 2 - 0.2);
  g.stroke();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class Footprints {
  mesh: THREE.InstancedMesh;
  private born = new Float32Array(COUNT).fill(-100);
  private next = 0;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private c = new THREE.Color();

  constructor() {
    const geo = new THREE.PlaneGeometry(0.22, 0.34).rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({
      map: printTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      polygonOffset: true, polygonOffsetFactor: -2,
    });
    this.mesh = new THREE.InstancedMesh(geo, mat, COUNT);
    this.mesh.frustumCulled = false;
    for (let i = 0; i < COUNT; i++) {
      this.mesh.setMatrixAt(i, this.m.makeScale(0, 0, 0));
      this.mesh.setColorAt(i, this.c.setRGB(0, 0, 0));
    }
  }

  place(x: number, y: number, z: number, heading: number, t: number): void {
    const i = this.next;
    this.next = (this.next + 1) % COUNT;
    this.born[i] = t;
    this.q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), heading);
    this.m.compose(new THREE.Vector3(x, y + 0.02, z), this.q, new THREE.Vector3(1, 1, 1));
    this.mesh.setMatrixAt(i, this.m);
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  update(t: number): void {
    for (let i = 0; i < COUNT; i++) {
      const age = t - this.born[i];
      const a = age < 0 || age > LIFE ? 0 : Math.min(1, age * 6) * Math.pow(1 - age / LIFE, 1.5) * 1.6;
      this.mesh.setColorAt(i, this.c.setRGB(a, a * 0.92, a * 0.8));
    }
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}
