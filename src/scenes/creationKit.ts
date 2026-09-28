import * as THREE from "three/webgpu";
import { T, worldPoints } from "../gpu/tsl";

const { uniform } = T;

export class CreationKit {
  public readonly group: THREE.Group;
  private readonly uT = uniform(0);
  private updaters: Array<(dt: number, t: number) => void> = [];
  private disposables: Array<{ dispose(): void }> = [];

  constructor() {
    this.group = new THREE.Group();
  }

  update(dt: number, uT: number | { value: number }): void {
    const t = typeof uT === "number" ? uT : uT.value;
    this.uT.value = t;
    for (const fn of this.updaters) fn(dt, t);
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose();
    this.disposables.length = 0;
    this.updaters.length = 0;
    while (this.group.children.length > 0) {
      this.group.remove(this.group.children[0]);
    }
  }

  // --- Makers -------------------------------------------------------------

  birds(n: number, center: THREE.Vector3, radius = 20, height = 8): void {
    const positions = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const r = radius * (0.85 + Math.random() * 0.3);
      positions[i * 3 + 0] = Math.cos(a) * r;
      positions[i * 3 + 1] = (Math.random() - 0.5) * height;
      positions[i * 3 + 2] = Math.sin(a) * r;
    }

    const { sprite, material } = worldPoints(positions, {
      size: 0.5,
      color: 0xffffff,
      opacity: 0.9,
    });

    sprite.position.copy(center);
    this.group.add(sprite);

    this.disposables.push(material);
    this.updaters.push((_dt, t) => {
      sprite.rotation.y = t * 0.5;
    });
  }

  horses(center: THREE.Vector3, radius = 12): void {
    const wrapper = new THREE.Group();
    wrapper.position.copy(center);

    const clusters: THREE.Sprite[] = [];
    const perCluster = 20;

    for (let i = 0; i < 4; i++) {
      const positions = new Float32Array(perCluster * 3);
      for (let j = 0; j < perCluster; j++) {
        positions[j * 3 + 0] = (Math.random() - 0.5) * 1.5;
        positions[j * 3 + 1] = (Math.random() - 0.5) * 1.5;
        positions[j * 3 + 2] = (Math.random() - 0.5) * 1.5;
      }

      const { sprite, material } = worldPoints(positions, {
        size: 0.5,
        color: 0xffddaa,
        opacity: 0.9,
      });

      const a = (i / 4) * Math.PI * 2;
      sprite.position.set(Math.cos(a) * radius, 0, Math.sin(a) * radius);

      wrapper.add(sprite);
      clusters.push(sprite);
      this.disposables.push(material);
    }

    this.group.add(wrapper);

    this.updaters.push((_dt, t) => {
      wrapper.rotation.y = t * 0.4;
      for (let i = 0; i < clusters.length; i++) {
        clusters[i].position.y = Math.sin(t * 2 + (i * Math.PI) / 2) * 1.5;
      }
    });
  }

  crystals(n: number, center: THREE.Vector3, radius = 5): void {
    const wrapper = new THREE.Group();
    wrapper.position.copy(center);

    const geo = new THREE.OctahedronGeometry(0.3);
    const mat = new THREE.MeshBasicMaterial({
      color: 0x88ddff,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    const meshes: THREE.Mesh[] = [];

    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(geo, mat);
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * radius;
      m.position.set(
        Math.cos(a) * r,
        (Math.random() - 0.5) * 1.0,
        Math.sin(a) * r,
      );
      m.rotation.set(
        Math.random() * Math.PI,
        Math.random() * Math.PI,
        Math.random() * Math.PI,
      );
      wrapper.add(m);
      meshes.push(m);
    }

    this.group.add(wrapper);
    this.disposables.push(geo, mat);

    this.updaters.push((_dt, t) => {
      for (let i = 0; i < meshes.length; i++) {
        const s = 1 + 0.4 * Math.sin(t * 2 + i * 0.7);
        meshes[i].scale.setScalar(s);
      }
    });
  }

  rings(center: THREE.Vector3, radius = 9, tube = 0.15): void {
    const wrapper = new THREE.Group();
    wrapper.position.copy(center);

    const geo = new THREE.TorusGeometry(radius, tube, 12, 64);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffd700,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    const meshes: THREE.Mesh[] = [];

    for (let i = 0; i < 3; i++) {
      const m = new THREE.Mesh(geo, mat);
      m.rotation.x = (i / 3) * Math.PI;
      m.rotation.y = (i / 3) * Math.PI * 0.5;
      wrapper.add(m);
      meshes.push(m);
    }

    this.group.add(wrapper);
    this.disposables.push(geo, mat);

    this.updaters.push((_dt, t) => {
      for (let i = 0; i < meshes.length; i++) {
        meshes[i].rotation.x = (i / 3) * Math.PI + t * 0.2;
        meshes[i].rotation.z = t * (0.3 + i * 0.1);
      }
    });
  }

  beams(positions: THREE.Vector3[], height = 10, radius = 0.5): void {
    const geo = new THREE.CylinderGeometry(radius, radius, height, 10, 1, true);
    this.disposables.push(geo);

    const meshes: THREE.Mesh[] = [];
    const mats: THREE.MeshBasicMaterial[] = [];

    for (const pos of positions) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0x66ccff,
        transparent: true,
        opacity: 0.6,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      });

      const m = new THREE.Mesh(geo, mat);
      m.position.copy(pos);
      m.position.y += height / 2;

      this.group.add(m);
      meshes.push(m);
      mats.push(mat);
      this.disposables.push(mat);
    }

    this.updaters.push((_dt, t) => {
      for (let i = 0; i < meshes.length; i++) {
        mats[i].opacity = 0.3 + 0.4 * (0.5 + 0.5 * Math.sin(t * 3 + i));
      }
    });
  }


wisp(color: number, size: number): { group: THREE.Group; setCenter: (v: THREE.Vector3) => void } {
  const group = new THREE.Group();

  const geometry = new THREE.SphereGeometry(size, 16, 16);
  const material = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.8,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(geometry, material);
  group.add(mesh);

  return {
    group,
    setCenter: (v: THREE.Vector3) => {
      group.position.copy(v);
    },
  };
}


flowers(count: number, x: number, z: number, radius: number): void {
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const r = radius * Math.sqrt(Math.random());
    const a = Math.random() * Math.PI * 2;
    positions[i * 3 + 0] = x + Math.cos(a) * r;
    positions[i * 3 + 1] = 0.3;
    positions[i * 3 + 2] = z + Math.sin(a) * r;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const mat = new THREE.PointsMaterial({
    color: 0xffffff,
    size: 0.5,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.9,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const pts = new THREE.Points(geo, mat);
  this.group.add(pts);
  const base = positions.slice();
  this.updaters.push((t) => {
    const attr = geo.getAttribute('position') as THREE.BufferAttribute;
    const arr = attr.array as Float32Array;
    for (let i = 0; i < count; i++) {
      const phase = i * 1.37;
      arr[i * 3 + 0] = base[i * 3 + 0] + Math.sin(t * 1.2 + phase) * 0.06;
      arr[i * 3 + 2] = base[i * 3 + 2] + Math.cos(t * 1.1 + phase) * 0.06;
    }
    attr.needsUpdate = true;
  });
}

snowfall(n: number, x: number, z: number, radius: number, height: number): void {
  const positions = new Float32Array(n * 3);
  const speeds = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const r = radius * Math.sqrt(Math.random());
    const a = Math.random() * Math.PI * 2;
    positions[i * 3 + 0] = x + Math.cos(a) * r;
    positions[i * 3 + 1] = Math.random() * height;
    positions[i * 3 + 2] = z + Math.sin(a) * r;
    speeds[i] = 0.4 + Math.random() * 0.8;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const mat = new THREE.PointsMaterial({
    color: 0xffffff,
    size: 0.5,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.85,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const pts = new THREE.Points(geo, mat);
  this.group.add(pts);
  this.updaters.push((_t, dt) => {
    const attr = geo.getAttribute('position') as THREE.BufferAttribute;
    const arr = attr.array as Float32Array;
    for (let i = 0; i < n; i++) {
      let y = arr[i * 3 + 1] - speeds[i] * dt;
      if (y < 0) y += height;
      arr[i * 3 + 1] = y;
    }
    attr.needsUpdate = true;
  });
}

groundDisc(radius: number, color: number, opacity: number, y: number): void {
  const geo = new THREE.RingGeometry(radius * 0.85, radius, 64);
  const mat = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const ring = new THREE.Mesh(geo, mat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = y;
  this.group.add(ring);
  this.updaters.push((t) => {
    mat.opacity = opacity * (0.85 + 0.15 * Math.sin(t * 0.5));
  });
}

pathLights(points: THREE.Vector3[]): void {
  const lights: THREE.Mesh[] = [];
  for (const p of points) {
    const geo = new THREE.SphereGeometry(0.15, 16, 12);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffe6a0,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const m = new THREE.Mesh(geo, mat);
    m.position.copy(p);
    lights.push(m);
    this.group.add(m);
  }
  this.updaters.push((t) => {
    for (let i = 0; i < lights.length; i++) {
      const mat = lights[i].material as THREE.MeshBasicMaterial;
      const phase = i * 0.6;
      const s = 0.5 + 0.5 * Math.sin(t * 2.0 - phase);
      mat.opacity = 0.4 + 0.5 * s;
      lights[i].scale.setScalar(0.8 + 0.4 * s);
    }
  });
}
}
