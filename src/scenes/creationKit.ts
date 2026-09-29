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

  /** Scatter floating vegetation — luminous seed pods / ghost plants that drift. */
  floatingVegetation(center: THREE.Vector3, radius = 25): void {
    const R = this.makeRng();
    const count = 30;

    const mat = softPoints();
    mat.sizeAttenuation = true;
    mat.size = 0.8;
    mat.opacity = 0.8;
    mat.color.set(0x7fe08c);

    const cloud = spriteCloud(count, { position: 3, aData: 4 }, mat);
    const pos = cloud.attrs.position.array as Float32Array;
    const dat = cloud.attrs.aData.array as Float32Array;

    for (let i = 0; i < count; i++) {
      const a = R() * Math.PI * 2;
      const r = Math.sqrt(R()) * radius;
      // Spread them around, floating up off the ground
      pos[i * 3 + 0] = center.x + Math.cos(a) * r;
      pos[i * 3 + 1] = center.y + 0.5 + R() * 4.0;
      pos[i * 3 + 2] = center.z + Math.sin(a) * r;
      
      dat[i * 4 + 0] = R() * 6.283; // phase X
      dat[i * 4 + 1] = R() * 6.283; // phase Y
      dat[i * 4 + 2] = R() * 6.283; // phase Z
      dat[i * 4 + 3] = 0.4 + R() * 0.6; // speed multiplier
    }
    
    cloud.attrs.position.needsUpdate = true;
    cloud.attrs.aData.needsUpdate = true;

    const uT = this.uT;
    const pn = cloud.nodes.position;
    const px = cloud.nodes.aData.x;
    const py = cloud.nodes.aData.y;
    const pz = cloud.nodes.aData.z;
    const speed = cloud.nodes.aData.w;

    // Slow, organic drift and bobbing
    mat.positionNode = pn.add(vec3(
      sin(uT.mul(0.3).mul(speed).add(px)).mul(1.5),
      sin(uT.mul(0.4).mul(speed).add(py)).mul(0.8),
      cos(uT.mul(0.35).mul(speed).add(pz)).mul(1.5),
    ));

    // Soft spherical falloff
    const dist = length(pointUV.sub(0.5).mul(2.0));
    const round = T.exp(dist.mul(dist).mul(-3.0)).mul(float(1).sub(smoothstep(0.7, 1.0, dist)));
    
    // Slow breathing glow
    const breathe = float(0.7).add(float(0.3).mul(sin(uT.mul(1.2).add(px))));
    
    mat.opacityNode = T.clamp(materialOpacity.mul(round).mul(breathe), 0, 1);

    this.group.add(cloud.sprite);
    this.disposables.push(mat);
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

  /** Hang slow gold rings in the air, turning without hurry. Soft glow edges. */
  rings(center: THREE.Vector3, radius = 9, tube = 0.15): void {
    const wrapper = new THREE.Group();
    wrapper.position.copy(center);

    const geo = new THREE.TorusGeometry(radius, tube, 16, 64);
    
    // Upgraded from BasicMaterial to NodeMaterial to give it an internal rim/glow falloff
    const mat = new THREE.MeshBasicNodeMaterial({
      transparent: true,
      depthWrite: false,
      fog: false,
      side: THREE.DoubleSide,
    });
    
    mat.blending = THREE.CustomBlending;
    mat.blendEquation = THREE.AddEquation;
    mat.blendSrc = THREE.SrcAlphaFactor;
    mat.blendDst = THREE.OneFactor;
    mat.blendSrcAlpha = THREE.ZeroFactor;
    mat.blendDstAlpha = THREE.OneFactor;

    const baseColor = new THREE.Color(0xffd700);
    // Simple fresnel approximation based on view direction
    const viewDir = T.normalize(T.cameraPosition.sub(T.positionWorld));
    const normal = T.normalWorld; // Requires the torus to have normals
    const fresnel = T.pow(float(1.0).sub(T.max(T.dot(normal, viewDir), 0.0)), 2.0);

    // Edges glow brighter, center is slightly more transparent
    mat.colorNode = T.color(baseColor).mul(float(0.8).add(fresnel.mul(0.5)));
    mat.opacityNode = T.clamp(float(0.7).add(fresnel.mul(0.3)), 0, 1);

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
      // Very slow, deliberate turning
      for (let i = 0; i < meshes.length; i++) {
        meshes[i].rotation.x = (i / 3) * Math.PI + t * 0.15;
        meshes[i].rotation.z = t * (0.05 + i * 0.02);
      }
    });
  }

  /** Raise columns of pale light where the lesson wants them. Soft billboards. */
  beams(positions: THREE.Vector3[], height = 10, radius = 0.5): void {
    // Replaced standard cylinder with a billboarded NodeMaterial for a soft, volumetric look
    const count = positions.length;

    for (let i = 0; i < count; i++) {
      const baseX = positions[i].x;
      const baseY = positions[i].y;
      const baseZ = positions[i].z;

      const geometry = new THREE.PlaneGeometry(1, 1);
      this.disposables.push(geometry);

      const material = new THREE.MeshBasicNodeMaterial({
        transparent: true,
        depthWrite: false,
        fog: false,
        side: THREE.DoubleSide,
      });

      material.blending = THREE.CustomBlending;
      material.blendSrc = THREE.SrcAlphaFactor;
      material.blendDst = THREE.OneFactor;
      material.blendEquation = THREE.AddEquation;
      material.blendSrcAlpha = THREE.ZeroFactor;
      material.blendDstAlpha = THREE.OneFactor;
      this.disposables.push(material);

      const phase = T.uniform((i * 2.3999632) % (Math.PI * 2));

      // Billboard to face camera
      const toCam = vec3(T.cameraPosition.x.sub(baseX), 0, T.cameraPosition.z.sub(baseZ));
      const toCamLen = T.max(length(toCam), float(1e-4));
      const right = vec3(0, 1, 0).cross(toCam).div(toCamLen);

      const vX = T.uv().x.mul(2).sub(1);
      const vY = T.uv().y;

      material.positionNode = right.mul(vX.mul(radius)).add(vec3(0, 1, 0).mul(vY.mul(height)));

      const distCam = length(T.cameraPosition.sub(vec3(baseX, baseY, baseZ)));
      const across = T.exp(vX.mul(vX).mul(-3));
      const up = smoothstep(0, 0.04, vY).mul(float(1).sub(smoothstep(0.7, 1, vY)));
      const bands = sin(vY.mul(40).add(this.uT.mul(1.2)).add(phase)).mul(0.3).add(0.7);
      const nearFade = smoothstep(8, 30, distCam);
      const breathe = float(0.75).add(float(0.25).mul(sin(this.uT.mul(1.5).add(phase))));

      material.colorNode = T.color(0xb8d1ff).mul(1.6).mul(across).mul(up).mul(bands).mul(nearFade).mul(breathe);
      material.opacityNode = float(1.0); // handled via color intensity

      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(baseX, baseY, baseZ);
      mesh.renderOrder = 2;
      mesh.frustumCulled = false;
      this.group.add(mesh);
    }
  }


  /** Place a small sun the lesson can move and warm the scene with. Softened via NodeMaterial. */
  wisp(colorHex: number, size: number): { group: THREE.Group; setCenter: (v: THREE.Vector3) => void } {
    const group = new THREE.Group();

    // Use a flat plane for a soft billboard wisp instead of a hard sphere
    const geometry = new THREE.PlaneGeometry(size * 4, size * 4);
    
    const material = new THREE.MeshBasicNodeMaterial({
      transparent: true,
      depthWrite: false,
      fog: false,
      side: THREE.DoubleSide,
    });
    
    // Additive blending for a light-like feeling
    material.blending = THREE.CustomBlending;
    material.blendEquation = THREE.AddEquation;
    material.blendSrc = THREE.SrcAlphaFactor;
    material.blendDst = THREE.OneFactor;
    material.blendSrcAlpha = THREE.ZeroFactor;
    material.blendDstAlpha = THREE.OneFactor;

    // Make the wisp always face the camera natively in WebGPU TSL
    const mvPosition = T.modelViewMatrix.mul(vec3(0, 0, 0)); 
    const vX = T.uv().x.mul(2).sub(1).mul(size * 2);
    const vY = T.uv().y.mul(2).sub(1).mul(size * 2);
    material.positionNode = mvPosition.add(vec3(vX, vY, 0));

    // Node-based soft spherical falloff
    const dist = length(T.uv().sub(0.5).mul(2.0));
    // exponential falloff for the glow
    const alpha = T.exp(dist.mul(dist).mul(-4.0)).mul(float(1).sub(smoothstep(0.8, 1.0, dist)));
    
    const baseColor = new THREE.Color(colorHex);
    // Overexpose the center slightly
    material.colorNode = T.color(baseColor).mul(1.5);
    material.opacityNode = T.clamp(alpha, 0, 1);

    const mesh = new THREE.Mesh(geometry, material);
    mesh.renderOrder = 3;
    mesh.frustumCulled = false; // Because we change vertex positions in shader
    group.add(mesh);
    
    this.disposables.push(geometry, material);

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

  /** Lay a ring of light on the ground to gather the eye. Softened via NodeMaterial. */
  groundDisc(radius: number, colorHex: number, opacity: number, y: number): void {
    const geo = new THREE.PlaneGeometry(radius * 2, radius * 2);
    
    const mat = new THREE.MeshBasicNodeMaterial({
      transparent: true,
      depthWrite: false,
      fog: false,
      side: THREE.DoubleSide,
    });
    mat.blending = THREE.CustomBlending;
    mat.blendEquation = THREE.AddEquation;
    mat.blendSrc = THREE.SrcAlphaFactor;
    mat.blendDst = THREE.OneFactor;
    mat.blendSrcAlpha = THREE.ZeroFactor;
    mat.blendDstAlpha = THREE.OneFactor;

    // Soft ring node logic
    const dist = length(T.uv().sub(0.5).mul(2.0));
    // Thin glowing edge at r=0.9
    const ringGlow = T.exp(T.abs(dist.sub(0.9)).mul(-10.0));
    // Soft inner fill
    const innerFill = float(1.0).sub(smoothstep(0.0, 0.9, dist)).mul(0.15);
    
    mat.colorNode = T.color(colorHex);
    // Combine ring edge and soft inner fill, then pulse based on uT
    const breathe = float(0.85).add(float(0.15).mul(sin(this.uT.mul(0.5))));
    mat.opacityNode = T.clamp(ringGlow.add(innerFill).mul(opacity).mul(breathe), 0, 1);

    this.disposables.push(geo, mat);
    const ring = new THREE.Mesh(geo, mat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = y;
    ring.renderOrder = 1;
    this.group.add(ring);
  }

  /** Mark a trail of breathing lamps for the walk ahead. Made soft via NodeMaterial. */
  pathLights(points: THREE.Vector3[]): void {
    const lights: THREE.Mesh[] = [];
    const size = 0.4;
    
    // Use plane geometry and node materials for softer spherical falloff
    const geo = new THREE.PlaneGeometry(size * 2, size * 2);
    this.disposables.push(geo);

    for (const p of points) {
      const mat = new THREE.MeshBasicNodeMaterial({
        transparent: true,
        depthWrite: false,
        fog: false,
        side: THREE.DoubleSide,
      });
      
      mat.blending = THREE.CustomBlending;
      mat.blendEquation = THREE.AddEquation;
      mat.blendSrc = THREE.SrcAlphaFactor;
      mat.blendDst = THREE.OneFactor;
      mat.blendSrcAlpha = THREE.ZeroFactor;
      mat.blendDstAlpha = THREE.OneFactor;

      // Always face camera
      const mvPosition = T.modelViewMatrix.mul(vec3(0, 0, 0)); 
      const vX = T.uv().x.mul(2).sub(1).mul(size);
      const vY = T.uv().y.mul(2).sub(1).mul(size);
      mat.positionNode = mvPosition.add(vec3(vX, vY, 0));

      const dist = length(T.uv().sub(0.5).mul(2.0));
      const alpha = T.exp(dist.mul(dist).mul(-3.0)).mul(float(1).sub(smoothstep(0.7, 1.0, dist)));
      
      mat.colorNode = T.color(0xffe6a0);
      // Store base opacity scaling as uniform or simply update via scale
      mat.opacityNode = T.clamp(alpha, 0, 1);

      const m = new THREE.Mesh(geo, mat);
      m.position.copy(p);
      m.renderOrder = 2;
      m.frustumCulled = false;
      lights.push(m);
      this.group.add(m);
      this.disposables.push(mat);
    }
    this.updaters.push((_dt, t) => {
      for (let i = 0; i < lights.length; i++) {
        const mat = lights[i].material as THREE.MeshBasicNodeMaterial;
        const phase = i * 0.6;
        const s = 0.5 + 0.5 * Math.sin(t * 2.0 - phase);
        // Change uniform or adjust via mesh scale
        const scaleVal = 0.8 + 0.4 * s;
        lights[i].scale.setScalar(scaleVal);
        mat.opacity = 0.4 + 0.5 * s; // Works alongside node logic
      }
    });
  }
}
