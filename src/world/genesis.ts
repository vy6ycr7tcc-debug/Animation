   - 18–30 s: creation comes back out of the dark over its lines, nearest first (the air thins
     from the heart outward), then the sky; the lines fade into it. */
import * as THREE from "three/webgpu";
import { softPoints, spriteCloud } from "../gpu/tsl";
import { fbm } from "./terrain";
import { etchedStone } from "./etching";
import { HEART_PERIOD, HEART_START } from "../core/audio";
import { T } from "../gpu/tsl";

const { exp, length, float, normalLocal, smoothstep, uniform, vec3, vec4 } = T;

export const GENESIS_S = 30;

  color: THREE.Color;
}

// We keep GenesisLayer for compatibility, but genesis no longer loops over them.
const TAU = Math.PI * 2;

/** Unit shapes as segment pairs, flat in the x–z plane (or solids' edges). */
const HUES = [new THREE.Color(1.0, 0.8, 0.45), new THREE.Color(0.6, 0.78, 1.0), new THREE.Color(1.0, 0.62, 0.7)];

interface Burst {
  mesh: THREE.Sprite;
  k: ReturnType<typeof uniform>;
  at: number;
  life: number;
  private uFront = uniform(0);
  private uWire = uniform(0);
  private bursts: Burst[] = [];
  private centre = new THREE.Vector3();
  private rocks!: THREE.InstancedMesh;

  private buildRocks(): void {
    const mat = etchedStone("#282338", "#d8b8ff", 1.7);
    mat.flatShading = true;
    const g = new THREE.IcosahedronGeometry(1, 1);
    const p = g.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      const v = new THREE.Vector3().fromBufferAttribute(p, i);
      const n = v.clone().normalize();
      const d = 0.72 + fbm(n.x * 1.6 + 0.3, n.z * 1.6 + n.y * 1.3 - 0.3) * 0.55;
      v.copy(n).multiplyScalar(d);
      p.setXYZ(i, v.x, v.y * 0.6, v.z);
    }
    g.computeVertexNormals();
    this.rocks = new THREE.InstancedMesh(g, mat, 12);
    this.rocks.castShadow = true;
    this.rocks.receiveShadow = true;
    this.rocks.visible = false;
    this.group.add(this.rocks);
  }

  constructor() {
    // the veil: a sphere around the camera, drawn over everything but the lines and the heart
    const vm = new THREE.MeshBasicNodeMaterial({ transparent: true, depthTest: false, depthWrite: false, side: THREE.BackSide, fog: false });
    vm.colorNode = vec4(0, 0, 0, this.uVeil.mul(smoothstep(-0.2, 0.4, normalLocal.y)));
    this.veil = new THREE.Mesh(new THREE.SphereGeometry(20, 16, 12), vm);
    this.veil.renderOrder = 9000;
    this.veil.frustumCulled = false;
      const s = SHAPES[i % SHAPES.length];
      const k = uniform(0);
      const c = HUES[i % HUES.length];
      
      const pts: number[] = [];
      const density = s.flat ? 100 : 250;
      for (let j = 0; j < s.pairs.length; j += 6) {
        const x1 = s.pairs[j], y1 = s.pairs[j+1], z1 = s.pairs[j+2];
        const x2 = s.pairs[j+3], y2 = s.pairs[j+4], z2 = s.pairs[j+5];
        const len = Math.hypot(x2-x1, y2-y1, z2-z1);
        const count = Math.ceil(len * density);
        for (let pt = 0; pt < count; pt++) {
          const t = pt / count;
          // slight drift/scatter
          const rx = (Math.random() - 0.5) * 0.04;
          const ry = (Math.random() - 0.5) * 0.04;
          const rz = (Math.random() - 0.5) * 0.04;
          pts.push(x1 + (x2 - x1) * t + rx, y1 + (y2 - y1) * t + ry, z1 + (z2 - z1) * t + rz);
        }
      }
      
      const mat = softPoints();
      mat.sizeAttenuation = true;
      mat.colorNode = vec4(vec3(c.r, c.g, c.b).mul(k), 1);
      mat.opacityNode = T.materialOpacity.mul(smoothstep(0.5, 0.1, length(T.pointUV.sub(0.5))));
      mat.sizeNode = float(0.18);
      
      const cloud = spriteCloud(pts.length / 3, { position: 3 }, mat);
      (cloud.attrs.position.array as Float32Array).set(pts);
      const mesh = cloud.sprite;
      mesh.renderOrder = 9002;
      mesh.frustumCulled = false;
      mesh.visible = false;
    }

    this.group.add(this.veil, this.heart);
    this.buildRocks();
    this.group.visible = false;
  }



  /** Begin: `heart` is where the light leaves the wanderer; `layers` the forms drawn in lines. */
  start(heart: THREE.Vector3, _layers: GenesisLayer[]): void {
    this.t = 0;
    this.active = true;
    this.group.visible = true;
    this.heart.position.copy(heart);
    this.centre.copy(heart);
    this.uCentre.value.copy(heart);

    const m = new THREE.Matrix4();
    const p = new THREE.Vector3();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const r = 8 + Math.random() * 8;
      p.set(heart.x + Math.cos(a) * r, heart.y + Math.random() * 2, heart.z + Math.sin(a) * r);
      q.random();
      const scale = 1.0 + Math.random() * 1.5;
      s.set(scale, scale, scale);
      m.compose(p, q, s);
      this.rocks.setMatrixAt(i, m);
    }
    this.rocks.instanceMatrix.needsUpdate = true;
    this.rocks.visible = true;
  }



  stop(): void {
    this.active = false;
    this.group.visible = false;
    this.uVeil.value = 0;
  }

  /** Each frame while active; returns how much of the world shows. */
    const u = Math.min(1, Math.max(0, (t - 3) / 14));
    this.uFront.value = 3 + 700 * Math.pow(u, 1.8);
    this.uWire.value = ss(2.5, 4, t) * (1 - ss(20, 27, t));
    const rockScale = ss(3, 17, t) * (1 - ss(18, 28, t));
    this.rocks.scale.setScalar(rockScale);
    // the bursts grow out of the heart and fade as they go
    const spin = reduced ? 0.3 : 1;
    for (const b of this.bursts) {
      b.mesh.position.copy(this.centre);
      b.mesh.scale.setScalar(grow);
      if (b.flat) b.mesh.rotation.set(b.spin.x * 0.25, b.spin.y * v * 2 * spin, b.spin.z * 0.25);
      else b.mesh.rotation.set(b.spin.x * v * 1.5 * spin, b.spin.y * v * 1.5 * spin, b.spin.z * v * 1.5 * spin);
      b.k.value = Math.sin(Math.PI * Math.min(1, v * 1.6)) ** 0.6 * (1 - v) * 1.1;
    }
    this.veil.position.copy(camera.position);