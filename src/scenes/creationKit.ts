/* CreationKit — the kit the temple-tour lessons are built from.
   Every lesson reaches in and scatters a little light: birds circling overhead,
   clusters like distant horses, breathing crystals, slow gold rings, columns of pale light,
   a placeable wisp-sun, swaying light-flowers, endless snow, a ring of light on the ground,
   a trail of breathing lamps. Placement is seeded, so each run arrives in the same place;
   motion is the lesson's own clock, so each stays alive only while its scene does. */
import * as THREE from "three/webgpu";
import { crystalMaterial, prismGeometry } from "../world/creation";
import { softPoints, spriteCloud, T } from "../gpu/tsl";

const {
  sin,
  cos,
  vec3,
  float,
  uniform,
  pointUV,
  length,
  smoothstep,
  materialOpacity,
  mod,
  mix,
  pow,
  abs,
  clamp,
  max,
} = T;

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

  /** Send birds circling overhead with organic flight trajectories, dipping and soaring. */
  birds(n: number, center: THREE.Vector3, radius = 20, height = 8): void {
    const R = this.makeRng();
    const mat = softPoints();
    mat.sizeAttenuation = true;
    mat.size = 0.7;
    mat.opacity = 0.95;

    const cloud = spriteCloud(n, { position: 3, aData: 4 }, mat);
    const pos = cloud.attrs.position.array as Float32Array;
    const dat = cloud.attrs.aData.array as Float32Array;

    for (let i = 0; i < n; i++) {
      const angleOffset = (i / n) * Math.PI * 2 + (R() - 0.5) * 0.3;
      const r = radius * (0.85 + R() * 0.3);
      const h = (R() - 0.5) * height;
      const speed = 0.35 + R() * 0.25;

      pos[i * 3 + 0] = 0;
      pos[i * 3 + 1] = 0;
      pos[i * 3 + 2] = 0;

      dat[i * 4 + 0] = angleOffset;
      dat[i * 4 + 1] = h;
      dat[i * 4 + 2] = r;
      dat[i * 4 + 3] = speed;
    }

    cloud.attrs.position.needsUpdate = true;
    cloud.attrs.aData.needsUpdate = true;

    const uT = this.uT;
    const angleOffset = cloud.nodes.aData.x;
    const h = cloud.nodes.aData.y;
    const r = cloud.nodes.aData.z;
    const speed = cloud.nodes.aData.w;

    // Organic flight trajectory: circling with dipping, soaring, and subtle banking
    const angle = uT.mul(speed).add(angleOffset);
    const dip = sin(angle.mul(2.5)).mul(1.2).add(sin(uT.mul(1.2).add(angleOffset)).mul(0.8));
    const flap = sin(uT.mul(8.0).add(angleOffset)).mul(0.2);

    mat.positionNode = vec3(
      cos(angle).mul(r),
      h.add(dip),
      sin(angle).mul(r),
    );

    // Soft radiant warm-white light with wing-flap rhythm
    const dist = length(pointUV.sub(0.5).mul(2.0));
    const falloff = T.exp(dist.mul(dist).mul(-3.5)).mul(float(1).sub(smoothstep(0.7, 1.0, dist)));
    const pulse = float(0.85).add(flap);

    mat.colorNode = mix(vec3(1.0, 0.95, 0.8), vec3(1.0, 1.0, 1.0), falloff);
    mat.opacityNode = clamp(materialOpacity.mul(falloff).mul(pulse), 0, 1);

    cloud.sprite.position.copy(center);
    this.group.add(cloud.sprite);
    this.disposables.push(mat);
  }

  /** Scatter floating vegetation — luminous seed pods / ghost plants with harmonic turbulence drift. */
  floatingVegetation(center: THREE.Vector3, radius = 25): void {
    const R = this.makeRng();
    const count = 30;

    const mat = softPoints();
    mat.sizeAttenuation = true;
    mat.size = 0.95;
    mat.opacity = 0.85;

    const cloud = spriteCloud(count, { position: 3, aData: 4 }, mat);
    const pos = cloud.attrs.position.array as Float32Array;
    const dat = cloud.attrs.aData.array as Float32Array;

    for (let i = 0; i < count; i++) {
      const a = R() * Math.PI * 2;
      const r = Math.sqrt(R()) * radius;
      pos[i * 3 + 0] = center.x + Math.cos(a) * r;
      pos[i * 3 + 1] = center.y + 0.5 + R() * 4.0;
      pos[i * 3 + 2] = center.z + Math.sin(a) * r;

      dat[i * 4 + 0] = R() * 6.283; // phase X
      dat[i * 4 + 1] = R() * 6.283; // phase Y
      dat[i * 4 + 2] = R() * 6.283; // phase Z
      dat[i * 4 + 3] = 0.3 + R() * 0.5; // speed multiplier
    }

    cloud.attrs.position.needsUpdate = true;
    cloud.attrs.aData.needsUpdate = true;

    const uT = this.uT;
    const pn = cloud.nodes.position;
    const px = cloud.nodes.aData.x;
    const py = cloud.nodes.aData.y;
    const pz = cloud.nodes.aData.z;
    const speed = cloud.nodes.aData.w;

    // Multi-frequency harmonic turbulence drift (non-linear bobbing and sway)
    const driftX = sin(uT.mul(0.3).mul(speed).add(px)).add(sin(uT.mul(0.77).mul(speed).add(px)).mul(0.4)).mul(1.2);
    const driftY = sin(uT.mul(0.4).mul(speed).add(py)).add(cos(uT.mul(0.91).mul(speed).add(py)).mul(0.3)).mul(0.7);
    const driftZ = cos(uT.mul(0.35).mul(speed).add(pz)).add(sin(uT.mul(0.83).mul(speed).add(pz)).mul(0.4)).mul(1.2);

    mat.positionNode = pn.add(vec3(driftX, driftY, driftZ));

    // Core-to-halo emerald-cyan light gradient
    const dist = length(pointUV.sub(0.5).mul(2.0));
    const falloff = T.exp(dist.mul(dist).mul(-3.2)).mul(float(1).sub(smoothstep(0.7, 1.0, dist)));
    const coreColor = vec3(0.62, 1.0, 0.94); // Radiant mint
    const haloColor = vec3(0.25, 0.85, 0.5); // Soft emerald

    const breathe = float(0.75).add(float(0.25).mul(sin(uT.mul(1.2).add(px))));

    mat.colorNode = mix(haloColor, coreColor, falloff);
    mat.opacityNode = clamp(materialOpacity.mul(falloff).mul(breathe), 0, 1);

    this.group.add(cloud.sprite);
    this.disposables.push(mat);
  }

  /** Scatter far-off clusters that read as distant galloping horses on the horizon with golden ember trails. */
  horses(center: THREE.Vector3, radius = 12): void {
    const R = this.makeRng();
    const count = 60;

    const mat = softPoints();
    mat.sizeAttenuation = true;
    mat.size = 0.65;

    const cloud = spriteCloud(count, { position: 3, aData: 4 }, mat);
    const pos = cloud.attrs.position.array as Float32Array;
    const dat = cloud.attrs.aData.array as Float32Array;

    for (let i = 0; i < count; i++) {
      const clusterIdx = Math.floor(i / 15);
      const inClusterIdx = i % 15;
      const baseAngle = (clusterIdx / 4) * Math.PI * 2;

      pos[i * 3 + 0] = Math.cos(baseAngle) * radius + (R() - 0.5) * 1.8;
      pos[i * 3 + 1] = (R() - 0.5) * 0.8;
      pos[i * 3 + 2] = Math.sin(baseAngle) * radius + (R() - 0.5) * 1.8;

      dat[i * 4 + 0] = baseAngle;
      dat[i * 4 + 1] = inClusterIdx * 0.2; // Phase delay in stride
      dat[i * 4 + 2] = 0.3 + R() * 0.4;   // Gallop frequency
      dat[i * 4 + 3] = clusterIdx;
    }

    cloud.attrs.position.needsUpdate = true;
    cloud.attrs.aData.needsUpdate = true;

    const uT = this.uT;
    const pn = cloud.nodes.position;
    const phaseDelay = cloud.nodes.aData.y;
    const freq = cloud.nodes.aData.z;

    // Galloping wave motion: rhythmic vertical rise with non-linear easing
    const gallopTime = uT.mul(freq).add(phaseDelay);
    const strideY = abs(sin(gallopTime.mul(3.0))).mul(0.6);
    const orbitAngle = uT.mul(0.25);

    // Orbit slowly around center
    const cosO = cos(orbitAngle);
    const sinO = sin(orbitAngle);
    const rotX = pn.x.mul(cosO).sub(pn.z.mul(sinO));
    const rotZ = pn.x.mul(sinO).add(pn.z.mul(cosO));

    mat.positionNode = vec3(rotX, pn.y.add(strideY), rotZ);

    const dist = length(pointUV.sub(0.5).mul(2.0));
    const falloff = T.exp(dist.mul(dist).mul(-3.0)).mul(float(1).sub(smoothstep(0.7, 1.0, dist)));
    const emberPulse = float(0.75).add(float(0.25).mul(sin(gallopTime.mul(6.0))));

    mat.colorNode = mix(vec3(1.0, 0.65, 0.25), vec3(1.0, 0.9, 0.6), falloff);
    mat.opacityNode = clamp(materialOpacity.mul(falloff).mul(emberPulse).mul(0.85), 0, 1);

    cloud.sprite.position.copy(center);
    this.group.add(cloud.sprite);
    this.disposables.push(mat);
  }

  /** Plant crystals that breathe with slow, patient light and eased multi-axis floating. */
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
        // Multi-axis eased floating oscillation & pulse
        const phase = i * 0.7;
        const breathSin = Math.sin(t * 1.5 + phase);
        const easedBreath = breathSin * Math.abs(breathSin) * 0.3 + 1.0;
        const floatY = Math.sin(t * 0.8 + phase * 1.3) * 0.15;

        const pulse = baseScale[i] * easedBreath;
        m.compose(
          p.set(basePos[i * 3], basePos[i * 3 + 1] + floatY, basePos[i * 3 + 2]),
          baseQuat[i],
          s.setScalar(pulse),
        );
        mesh.setMatrixAt(i, m);
      }
      mesh.instanceMatrix.needsUpdate = true;
    });
  }

  /** Hang slow gold rings in the air, turning without hurry with golden edge fresnel. */
  rings(center: THREE.Vector3, radius = 9, tube = 0.15): void {
    const wrapper = new THREE.Group();
    wrapper.position.copy(center);

    const geo = new THREE.TorusGeometry(radius, tube, 16, 64);

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

    // Golden edge fresnel and core luminosity
    const viewDir = T.normalize(T.cameraPosition.sub(T.positionWorld));
    const normal = T.normalWorld;
    const fresnel = pow(float(1.0).sub(clamp(T.dot(normal, viewDir), 0.0, 1.0)), 3.0);

    const goldCore = vec3(1.0, 0.84, 0.0);
    const goldEdge = vec3(1.0, 0.96, 0.6);
    const shimmer = sin(this.uT.mul(2.0).add(T.uv().x.mul(20.0))).mul(0.15).add(0.85);

    mat.colorNode = mix(goldCore, goldEdge, fresnel).mul(shimmer).mul(1.4);
    mat.opacityNode = clamp(float(0.65).add(fresnel.mul(0.35)), 0, 1);

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
      // Eased slow counter-precession
      for (let i = 0; i < meshes.length; i++) {
        const sign = i % 2 === 0 ? 1 : -1;
        meshes[i].rotation.x = (i / 3) * Math.PI + Math.sin(t * 0.1) * 0.2;
        meshes[i].rotation.y += 0.003 * sign;
        meshes[i].rotation.z = t * (0.04 + i * 0.015) * sign;
      }
    });
  }

  /** Raise columns of pale light with Gaussian radial falloff and vertical energy strands. */
  beams(positions: THREE.Vector3[], height = 10, radius = 0.5): void {
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

      const phase = float((i * 2.3999632) % (Math.PI * 2));

      // Billboard facing camera
      const toCam = vec3(T.cameraPosition.x.sub(baseX), 0, T.cameraPosition.z.sub(baseZ));
      const toCamLen = max(length(toCam), float(1e-4));
      const right = vec3(0, 1, 0).cross(toCam).div(toCamLen);

      const vX = T.uv().x.mul(2).sub(1);
      const vY = T.uv().y;

      material.positionNode = right.mul(vX.mul(radius)).add(vec3(0, 1, 0).mul(vY.mul(height)));

      const distCam = length(T.cameraPosition.sub(vec3(baseX, baseY, baseZ)));
      const gaussianX = T.exp(vX.mul(vX).mul(-4.0));
      const heightFade = smoothstep(0, 0.05, vY).mul(float(1.0).sub(smoothstep(0.7, 1.0, vY)));

      // Vertical energy strands drifting upward
      const strand1 = sin(vY.mul(30.0).sub(this.uT.mul(2.0)).add(phase)).mul(0.25).add(0.75);
      const strand2 = sin(vY.mul(55.0).add(this.uT.mul(3.5)).add(phase)).mul(0.15).add(0.85);

      // Height gradient: warm amber base to celestial blue top
      const baseCol = vec3(1.0, 0.85, 0.65);
      const topCol = vec3(0.53, 0.75, 1.0);
      const colorGrad = mix(baseCol, topCol, vY);

      const nearFade = smoothstep(6, 25, distCam);
      const breathe = float(0.8).add(float(0.2).mul(sin(this.uT.mul(1.5).add(phase))));

      material.colorNode = colorGrad.mul(gaussianX).mul(heightFade).mul(strand1).mul(strand2).mul(nearFade).mul(breathe).mul(1.8);
      material.opacityNode = float(1.0);

      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(baseX, baseY, baseZ);
      mesh.renderOrder = 2;
      mesh.frustumCulled = false;
      this.group.add(mesh);
    }
  }

  /** Place a small sun wisp with multi-layered radiant orb and overexposed core. */
  wisp(colorHex: number, size: number): { group: THREE.Group; setCenter: (v: THREE.Vector3) => void } {
    const group = new THREE.Group();

    const geometry = new THREE.PlaneGeometry(size * 4, size * 4);

    const material = new THREE.MeshBasicNodeMaterial({
      transparent: true,
      depthWrite: false,
      fog: false,
      side: THREE.DoubleSide,
    });

    material.blending = THREE.CustomBlending;
    material.blendEquation = THREE.AddEquation;
    material.blendSrc = THREE.SrcAlphaFactor;
    material.blendDst = THREE.OneFactor;
    material.blendSrcAlpha = THREE.ZeroFactor;
    material.blendDstAlpha = THREE.OneFactor;

    // Billboard facing camera
    const mvPosition = T.modelViewMatrix.mul(vec3(0, 0, 0));
    const vX = T.uv().x.mul(2).sub(1).mul(size * 2);
    const vY = T.uv().y.mul(2).sub(1).mul(size * 2);
    material.positionNode = mvPosition.add(vec3(vX, vY, 0));

    // Multi-layered radiant orb falloff
    const dist = length(T.uv().sub(0.5).mul(2.0));
    const coreAlpha = T.exp(dist.mul(dist).mul(-12.0)); // Overexposed center
    const haloAlpha = T.exp(dist.mul(dist).mul(-3.5)).mul(float(1).sub(smoothstep(0.8, 1.0, dist)));

    const baseColor = new THREE.Color(colorHex);
    const whiteCore = vec3(1.0, 1.0, 1.0);
    const auraColor = vec3(baseColor.r, baseColor.g, baseColor.b);

    const pulse = float(0.9).add(float(0.1).mul(sin(this.uT.mul(2.5))));

    material.colorNode = mix(auraColor.mul(1.5), whiteCore.mul(2.2), coreAlpha).mul(pulse);
    material.opacityNode = clamp(haloAlpha, 0, 1);

    const mesh = new THREE.Mesh(geometry, material);
    mesh.renderOrder = 3;
    mesh.frustumCulled = false;
    group.add(mesh);

    this.disposables.push(geometry, material);

    return {
      group,
      setCenter: (v: THREE.Vector3) => {
        group.position.copy(v);
      },
    };
  }

  /** Grow light-flowers that sway with dual-harmonic wind sway and luminous petal gradients. */
  flowers(count: number, x: number, z: number, radius: number): void {
    const R = this.makeRng();
    const mat = softPoints();
    mat.sizeAttenuation = true;
    mat.size = 0.65;
    mat.opacity = 0.95;

    const cloud = spriteCloud(count, { position: 3, aPhase: 1 }, mat);
    const positions = cloud.attrs.position.array as Float32Array;
    const phases = cloud.attrs.aPhase.array as Float32Array;
    for (let i = 0; i < count; i++) {
      const r = radius * Math.sqrt(R());
      const a = R() * Math.PI * 2;
      positions[i * 3 + 0] = x + Math.cos(a) * r;
      positions[i * 3 + 1] = 0.35;
      positions[i * 3 + 2] = z + Math.sin(a) * r;
      phases[i] = i * 1.37;
    }
    cloud.attrs.position.needsUpdate = true;
    cloud.attrs.aPhase.needsUpdate = true;

    const uT = this.uT;
    const phase = cloud.nodes.aPhase;

    // Dual-harmonic wind sway (primary wave + flutter)
    const swayX = sin(uT.mul(1.2).add(phase)).add(sin(uT.mul(3.1).add(phase.mul(2.0))).mul(0.3)).mul(0.08);
    const swayZ = cos(uT.mul(1.1).add(phase)).add(sin(uT.mul(2.7).add(phase)).mul(0.3)).mul(0.08);

    mat.positionNode = cloud.nodes.position.add(vec3(swayX, float(0), swayZ));

    // Warm pearl to gold flower-head gradient
    const dist = length(pointUV.sub(0.5).mul(2.0));
    const falloff = T.exp(dist.mul(dist).mul(-3.5)).mul(float(1).sub(smoothstep(0.6, 1.0, dist)));
    const coreColor = vec3(1.0, 0.95, 0.8);
    const petalColor = vec3(1.0, 0.8, 0.5);

    mat.colorNode = mix(petalColor, coreColor, falloff).mul(1.3);
    mat.opacityNode = clamp(materialOpacity.mul(falloff), 0, 1);

    this.group.add(cloud.sprite);
    this.disposables.push(mat);
  }

  /** Let endless snow fall with horizontal wind turbulence and soft glistening particles. */
  snowfall(n: number, x: number, z: number, radius: number, height: number): void {
    const R = this.makeRng();
    const mat = softPoints();
    mat.sizeAttenuation = true;
    mat.size = 0.55;
    mat.opacity = 0.9;

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
    const speed = cloud.nodes.aSpeed;

    // Horizontal wind turbulence across height layers
    const fallY = mod(pn.y.sub(uT.mul(speed)), float(height));
    const windX = sin(uT.mul(0.8).add(fallY.mul(0.5))).mul(0.8);
    const windZ = cos(uT.mul(1.1).add(fallY.mul(0.3))).mul(0.8);

    mat.positionNode = vec3(pn.x.add(windX), fallY, pn.z.add(windZ));

    // Soft glistening snow particle
    const dist = length(pointUV.sub(0.5).mul(2.0));
    const falloff = T.exp(dist.mul(dist).mul(-3.0)).mul(float(1).sub(smoothstep(0.6, 1.0, dist)));
    const glisten = float(0.85).add(float(0.15).mul(sin(uT.mul(3.0).add(fallY.mul(4.0)))));

    mat.colorNode = vec3(0.92, 0.96, 1.0).mul(glisten);
    mat.opacityNode = clamp(materialOpacity.mul(falloff), 0, 1);

    this.group.add(cloud.sprite);
    this.disposables.push(mat);
  }

  /** Lay a multi-ring disc of light on the ground with soft radial feathering and breathing curves. */
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

    // Multi-ring structure with soft radial feathering
    const dist = length(T.uv().sub(0.5).mul(2.0));
    const primaryRing = T.exp(abs(dist.sub(0.88)).mul(-12.0));
    const secondaryRing = T.exp(abs(dist.sub(0.55)).mul(-8.0)).mul(0.35);
    const softFill = float(1.0).sub(smoothstep(0.0, 0.9, dist)).mul(0.2);

    const baseColor = new THREE.Color(colorHex);
    const ringColor = vec3(baseColor.r, baseColor.g, baseColor.b);

    const breathe = float(0.8).add(float(0.2).mul(sin(this.uT.mul(0.6))));
    const totalGlow = primaryRing.add(secondaryRing).add(softFill).mul(opacity).mul(breathe);

    mat.colorNode = ringColor.mul(1.5);
    mat.opacityNode = clamp(totalGlow, 0, 1);

    this.disposables.push(geo, mat);
    const ring = new THREE.Mesh(geo, mat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = y;
    ring.renderOrder = 1;
    this.group.add(ring);
  }

  /** Mark a trail of breathing lanterns with multi-harmonic flame flicker and soft halos. */
  pathLights(points: THREE.Vector3[]): void {
    const lights: THREE.Mesh[] = [];
    const size = 0.45;

    const geo = new THREE.PlaneGeometry(size * 2, size * 2);
    this.disposables.push(geo);

    for (let i = 0; i < points.length; i++) {
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

      // Billboard facing camera
      const mvPosition = T.modelViewMatrix.mul(vec3(0, 0, 0));
      const vX = T.uv().x.mul(2).sub(1).mul(size);
      const vY = T.uv().y.mul(2).sub(1).mul(size);
      mat.positionNode = mvPosition.add(vec3(vX, vY, 0));

      const phase = float(i * 0.6);
      const flicker = sin(this.uT.mul(2.5).add(phase)).mul(0.15).add(
        sin(this.uT.mul(5.7).add(phase.mul(1.5))).mul(0.08),
      ).add(0.85);

      const dist = length(T.uv().sub(0.5).mul(2.0));
      const coreAlpha = T.exp(dist.mul(dist).mul(-10.0));
      const haloAlpha = T.exp(dist.mul(dist).mul(-3.0)).mul(float(1).sub(smoothstep(0.7, 1.0, dist)));

      const haloColor = vec3(1.0, 0.75, 0.35);
      const coreColor = vec3(1.0, 0.98, 0.85);

      mat.colorNode = mix(haloColor, coreColor, coreAlpha).mul(flicker).mul(1.6);
      mat.opacityNode = clamp(haloAlpha.mul(flicker), 0, 1);

      const m = new THREE.Mesh(geo, mat);
      m.position.copy(points[i]);
      m.renderOrder = 2;
      m.frustumCulled = false;
      lights.push(m);
      this.group.add(m);
      this.disposables.push(mat);
    }

    this.updaters.push((_dt, t) => {
      for (let i = 0; i < lights.length; i++) {
        const phase = i * 0.6;
        const floatY = Math.sin(t * 1.2 + phase) * 0.04;
        lights[i].position.y = points[i].y + floatY;
      }
    });
  }
}
