/* CreationKit — the kit the temple-tour lessons are built from.
   Every lesson reaches in and scatters a little light: birds circling overhead,
   clusters like distant horses, breathing crystals, slow gold rings, columns of pale light,
   a placeable wisp-sun, swaying light-flowers, endless snow, a ring of light on the ground,
   a trail of breathing lamps. Placement is seeded, so each run arrives in the same place;
   motion is the lesson's own clock, so each stays alive only while its scene does. */
import * as THREE from "three/webgpu";
import { crystalMaterial, prismGeometry } from "../world/creation";
import { softPoints, spriteCloud, T, worldPoints } from "../gpu/tsl";

const { sin, cos, vec3, float, uniform, pointUV, length, smoothstep, materialOpacity, mod } = T;

export class CreationKit {
  public readonly group: THREE.Group;
  private readonly uT = uniform(0);
  private rngSeed = 11;

  /** Give each maker call its own repeatable placement stream. */
  private makeRng(): () => number {
    let s = this.rngSeed++;
    return () => ((s = (s * 16807) % 2147483647) / 2147483647);
  }
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

  /* ---------- the makers ---------- */

  /** Send birds circling overhead, keeping the sky from feeling empty. */
  birds(n: number, center: THREE.Vector3, radius = 20, height = 8): void {
    const R = this.makeRng();
    const positions = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const r = radius * (0.85 + R() * 0.3);
      positions[i * 3 + 0] = Math.cos(a) * r;
      positions[i * 3 + 1] = (R() - 0.5) * height;
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

  /** Scatter far-off clusters that read as distant horses on the horizon. */
  horses(center: THREE.Vector3, radius = 12): void {
    const R = this.makeRng();
    const wrapper = new THREE.Group();
    wrapper.position.copy(center);

    const clusters: THREE.Sprite[] = [];
    const perCluster = 20;

    for (let i = 0; i < 4; i++) {
      const positions = new Float32Array(perCluster * 3);
      for (let j = 0; j < perCluster; j++) {
        positions[j * 3 + 0] = (R() - 0.5) * 1.5;
        positions[j * 3 + 1] = (R() - 0.5) * 1.5;
        positions[j * 3 + 2] = (R() - 0.5) * 1.5;
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

  /** Plant crystals that breathe with slow, patient light. */
  crystals(n: number, center: THREE.Vector3, radius = 5): void {
    const R = this.makeRng();
    const count = Math.max(1, n);
    const geo = prismGeometry();
    const aC = new THREE.InstancedBufferAttribute(new Float32Array(count * 3), 3);
    geo.setAttribute("aC", aC);
    const mat = crystalMaterial();
    const mesh = new THREE.InstancedMesh(geo, mat, count);
    mesh.position.copy(center);
    mesh.renderOrder = 2;

    const basePos = new Float32Array(count * 3);
    const baseQuat: THREE.Quaternion[] = [];
    const baseScale: number[] = [];

    const m = new THREE.Matrix4();
    const p = new THREE.Vector3();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const s = new THREE.Vector3();

    for (let i = 0; i < count; i++) {
      const a = R() * Math.PI * 2;
      const r = Math.sqrt(R()) * radius;
      const px = Math.cos(a) * r;
      const py = (R() - 0.5) * 1.0;
      const pz = Math.sin(a) * r;
      basePos[i * 3] = px;
      basePos[i * 3 + 1] = py;
      basePos[i * 3 + 2] = pz;

      e.set(
        R() * Math.PI,
        R() * Math.PI,
        R() * Math.PI,
      );
      q.setFromEuler(e);
      baseQuat[i] = q.clone();

      const bs = 0.5 + R() * 0.5;
      baseScale[i] = bs;

      m.compose(p.set(px, py, pz), q, s.setScalar(bs));
      mesh.setMatrixAt(i, m);
      aC.setXYZ(i, 0.15, 0.3, (i * 0.37) % 1);
    }

    mesh.instanceMatrix.needsUpdate = true;
    this.group.add(mesh);
    this.disposables.push(geo, mat);

    this.updaters.push((_dt, t) => {
      for (let i = 0; i < count; i++) {
        const pulse = baseScale[i] * (1 + 0.4 * Math.sin(t * 2 + i * 0.7));
        m.compose(
          p.set(basePos[i * 3], basePos[i * 3 + 1], basePos[i * 3 + 2]),
          baseQuat[i],
          s.setScalar(pulse),
        );
        mesh.setMatrixAt(i, m);
      }
      mesh.instanceMatrix.needsUpdate = true;
    });
  }

  /** Hang slow gold rings in the air, turning without hurry. */
  rings(center: THREE.Vector3, radius = 9, tube = 0.15): void {
    const wrapper = new THREE.Group();
    wrapper.position.copy(center);

    const geo = new THREE.TorusGeometry(radius, tube, 12, 64);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffd700,
      transparent: true,
      opacity: 0.9,
      blending: THREE.CustomBlending,
      blendEquation: THREE.AddEquation,
      blendSrc: THREE.SrcAlphaFactor,
      blendDst: THREE.OneFactor,
      blendSrcAlpha: THREE.ZeroFactor,
      blendDstAlpha: THREE.OneFactor,
      depthWrite: false,
      fog: false,
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

  /** Raise columns of pale light where the lesson wants them. */
  beams(positions: THREE.Vector3[], height = 10, radius = 0.5): void {
    const geo = new THREE.CylinderGeometry(radius, radius, height, 10, 1, true);
    this.disposables.push(geo);

    const meshes: THREE.Mesh[] = [];
    const mats: THREE.MeshBasicMaterial[] = [];

    for (const pos of positions) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0xb8d1ff,
        transparent: true,
        opacity: 0.6,
        blending: THREE.CustomBlending,
        blendEquation: THREE.AddEquation,
        blendSrc: THREE.SrcAlphaFactor,
        blendDst: THREE.OneFactor,
        blendSrcAlpha: THREE.ZeroFactor,
        blendDstAlpha: THREE.OneFactor,
        depthWrite: false,
        side: THREE.DoubleSide,
        fog: false,
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


/** Place a small sun the lesson can move and warm the scene with. */
wisp(color: number, size: number): { group: THREE.Group; setCenter: (v: THREE.Vector3) => void } {
  const group = new THREE.Group();

  const geometry = new THREE.SphereGeometry(size, 16, 16);
  const material = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.8,
    blending: THREE.CustomBlending,
    blendEquation: THREE.AddEquation,
    blendSrc: THREE.SrcAlphaFactor,
    blendDst: THREE.OneFactor,
    blendSrcAlpha: THREE.ZeroFactor,
    blendDstAlpha: THREE.OneFactor,
    depthWrite: false,
    fog: false,
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


/** Grow light-flowers that sway as if in a gentle wind. */
flowers(count: number, x: number, z: number, radius: number): void {
  const R = this.makeRng();
  const mat = softPoints();
  mat.sizeAttenuation = true;
  mat.size = 0.5;
  mat.opacity = 0.9;
  mat.color.set(0xffffff);

  const cloud = spriteCloud(count, { position: 3, aPhase: 1 }, mat);
  const positions = cloud.attrs.position.array as Float32Array;
  const phases = cloud.attrs.aPhase.array as Float32Array;
  for (let i = 0; i < count; i++) {
    const r = radius * Math.sqrt(R());
    const a = R() * Math.PI * 2;
    positions[i * 3 + 0] = x + Math.cos(a) * r;
    positions[i * 3 + 1] = 0.3;
    positions[i * 3 + 2] = z + Math.sin(a) * r;
    phases[i] = i * 1.37;
  }
  cloud.attrs.position.needsUpdate = true;
  cloud.attrs.aPhase.needsUpdate = true;

  const uT = this.uT;
  mat.positionNode = cloud.nodes.position.add(
    vec3(
      sin(uT.mul(1.2).add(cloud.nodes.aPhase)).mul(0.06),
      float(0),
      cos(uT.mul(1.1).add(cloud.nodes.aPhase)).mul(0.06),
    ),
  );
  mat.opacityNode = materialOpacity.mul(smoothstep(0.5, 0.2, length(pointUV.sub(0.5))));

  this.group.add(cloud.sprite);
  this.disposables.push(mat);
}

/** Let endless snow fall, softening everything it passes. */
snowfall(n: number, x: number, z: number, radius: number, height: number): void {
  const R = this.makeRng();
  const mat = softPoints();
  mat.sizeAttenuation = true;
  mat.size = 0.5;
  mat.opacity = 0.85;
  mat.color.set(0xffffff);

  const cloud = spriteCloud(n, { position: 3, aSpeed: 1 }, mat);
  const positions = cloud.attrs.position.array as Float32Array;
  const speeds = cloud.attrs.aSpeed.array as Float32Array;
  for (let i = 0; i < n; i++) {
    const r = radius * Math.sqrt(R());
    const a = R() * Math.PI * 2;
    positions[i * 3 + 0] = x + Math.cos(a) * r;
    positions[i * 3 + 1] = R() * height;
    positions[i * 3 + 2] = z + Math.sin(a) * r;
    speeds[i] = 0.4 + R() * 0.8;
  }
  cloud.attrs.position.needsUpdate = true;
  cloud.attrs.aSpeed.needsUpdate = true;

  const uT = this.uT;
  const pn = cloud.nodes.position;
  mat.positionNode = vec3(pn.x, mod(pn.y.sub(uT.mul(cloud.nodes.aSpeed)), float(height)), pn.z);
  mat.opacityNode = materialOpacity.mul(smoothstep(0.5, 0.2, length(pointUV.sub(0.5))));
  this.group.add(cloud.sprite);
  this.disposables.push(mat);
}

/** Lay a ring of light on the ground to gather the eye. */
groundDisc(radius: number, color: number, opacity: number, y: number): void {
  const geo = new THREE.RingGeometry(radius * 0.85, radius, 64);
  const mat = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    blending: THREE.CustomBlending,
    blendEquation: THREE.AddEquation,
    blendSrc: THREE.SrcAlphaFactor,
    blendDst: THREE.OneFactor,
    blendSrcAlpha: THREE.ZeroFactor,
    blendDstAlpha: THREE.OneFactor,
    side: THREE.DoubleSide,
    depthWrite: false,
    fog: false,
  });
  this.disposables.push(geo, mat);
  const ring = new THREE.Mesh(geo, mat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = y;
  this.group.add(ring);
  this.updaters.push((_dt, t) => {
    mat.opacity = opacity * (0.85 + 0.15 * Math.sin(t * 0.5));
  });
}

/** Mark a trail of breathing lamps for the walk ahead. */
pathLights(points: THREE.Vector3[]): void {
  const lights: THREE.Mesh[] = [];
  for (const p of points) {
    const geo = new THREE.SphereGeometry(0.15, 16, 12);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffe6a0,
      transparent: true,
      opacity: 0.9,
      blending: THREE.CustomBlending,
      blendEquation: THREE.AddEquation,
      blendSrc: THREE.SrcAlphaFactor,
      blendDst: THREE.OneFactor,
      blendSrcAlpha: THREE.ZeroFactor,
      blendDstAlpha: THREE.OneFactor,
      depthWrite: false,
      fog: false,
    });
    const m = new THREE.Mesh(geo, mat);
    m.position.copy(p);
    lights.push(m);
    this.group.add(m);
    this.disposables.push(geo, mat);
  }
  this.updaters.push((_dt, t) => {
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
