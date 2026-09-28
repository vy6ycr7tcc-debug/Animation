import * as THREE from "three/webgpu";
import type { SceneModule } from "./lessonKit";
import { CreationKit } from "./creationKit";
import { SITES } from "./sites";
import type { Narration } from "../core/narration";
import { heightAt, WATER_Y } from "../world/terrain";
import { T, worldPoints, glowShader, gpuUniforms, spectrum } from "../gpu/tsl";

export class TreeOfLifeScene implements SceneModule {
  id = "tree";
  active = false;
  readonly sitPrompt = "Rest beneath the tree";
  readonly panelTitle = "❋ The tree of life";

  private whisper: (text: string, ms?: number) => void;
  private player: { pos: THREE.Vector3; heading: number; target: THREE.Vector2 | null };
  private narrationRef: Narration;

  private group = new THREE.Group();
  private kit = new CreationKit();
  private resting = false;
  private restT = 0;
  private firedLines = new Set<number>();
  seatPos: THREE.Vector3;
  seatHeading: number;
  private greeted = false;

  private canopyGroup = new THREE.Group();
  private haloMat!: THREE.MeshBasicNodeMaterial & { uniforms: Record<string, { value: number }> };
  private heartMat!: THREE.MeshBasicNodeMaterial & { uniforms: Record<string, { value: number }> };
  private trunkMat!: THREE.MeshBasicNodeMaterial & { uniforms: Record<string, { value: number }> };

  private leafPoints!: Float32Array;
  private leafVel!: Float32Array;
  private leafPosAttr!: THREE.InstancedBufferAttribute;
  private leafMaterial!: THREE.PointsNodeMaterial;
  private leafSprite!: THREE.Sprite;
  private leafCount = 240;

  private fireflyPoints!: Float32Array;
  private fireflyBase!: Float32Array;
  private fireflyPosAttr!: THREE.InstancedBufferAttribute;
  private fireflyMaterial!: THREE.PointsNodeMaterial;
  private fireflySprite!: THREE.Sprite;
  private fireflyCount = 36;
  private fireflyTime = 0;

  private wisp!: { group: THREE.Group; setCenter: (v: THREE.Vector3) => void };
  private _wispCenter = new THREE.Vector3();
  private wispOrbitT = 0;

  constructor(
    scene: THREE.Scene,
    narration: Narration,
    player: { pos: THREE.Vector3; heading: number; target: THREE.Vector2 | null },
    _wanderer: { setGesture: (g: string) => void } | undefined,
    _follow: unknown,
    hooks: { whisper: (text: string, ms?: number) => void },
  ) {
    this.whisper = hooks.whisper;
    this.player = player;
    this.narrationRef = narration;

    const site = SITES.tree;
    const groundY = heightAt(site.x, site.z);
    this.seatPos = new THREE.Vector3(site.x, groundY + 0.6, site.z);
    this.seatHeading = site.heading;

    this.buildTree(site.x, groundY, site.z);
    this.buildRootsAndBranches(site.x, groundY, site.z);
    this.buildHeartLight(site.x, groundY, site.z);
    this.buildLeaves(site.x, groundY, site.z);
    this.buildFireflies(site.x, groundY, site.z);
    this.buildSeat(site.x, groundY, site.z);
    this.buildWisp(site.x, site.z);
    this.buildPathLights(site.x, site.z);
    this.buildMountains();
    this.kit.groundDisc(26, 0x2a4a2e, 0.35, groundY - 0.05);

    this.group.add(this.kit.group);
    scene.add(this.group);
    this.active = true;
  }

  private buildTree(x: number, y: number, z: number) {
    // Trunk
    const trunkGeo = new THREE.CylinderGeometry(0.7, 1.1, 8, 10);
    this.trunkMat = glowShader(
      { pulse: 0.3, base: 0.5 },
      () => T.vec4(T.float(0.25) + T.float(0.1) * T.sin(gpuUniforms.time.value * T.float(0.8)), T.float(0.15) + T.float(0.08) * T.sin(gpuUniforms.time.value * T.float(0.6)), T.float(0.08), T.float(1)),
    );
    const trunk = new THREE.Mesh(trunkGeo, this.trunkMat);
    trunk.position.set(x, y + 4, z);
    trunk.castShadow = false;
    trunk.receiveShadow = false;
    this.group.add(trunk);

    // Canopy group
    this.canopyGroup.position.set(x, y + 9.5, z);
    this.group.add(this.canopyGroup);

    // Canopy points
    const canopyCount = 1400;
    const positions = new Float32Array(canopyCount * 3);
    for (let i = 0; i < canopyCount; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const r = 3.2 + (Math.random() - 0.5) * 1.2;
      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta) * 0.7;
      positions[i * 3 + 2] = r * Math.cos(phi) * 0.85;
    }
    const canopyResult = worldPoints(positions, {
      size: 0.35,
      sizeAttenuation: true,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false,
    });
    canopyResult.material.colorNode = T.vec4(
      spectrum(T.mix(T.float(0.13), T.float(0.22), T.float(0.5 + 0.5 * Math.sin(gpuUniforms.time.value * 0.3)))),
      T.float(0.9),
    );
    canopyResult.sprite.position.set(0, 0, 0);
    this.canopyGroup.add(canopyResult.sprite);

    // Halo plane behind canopy
    const haloGeo = new THREE.PlaneGeometry(12, 12);
    this.haloMat = glowShader(
      { brightness: 0.6 },
      (u) => {
        const pulse = T.float(0.5) + T.float(0.5) * T.sin(gpuUniforms.time.value * T.float(1.2));
        const dist = T.length(T.uv().sub(T.float(0.5)));
        const falloff = T.float(1) - T.smoothstep(T.float(0.1), T.float(0.5), dist);
        return T.vec4(T.vec3(T.float(1), T.float(0.85), T.float(0.5)), falloff * u.brightness * pulse);
      },
    );
    const halo = new THREE.Mesh(haloGeo, this.haloMat);
    halo.position.set(0, 0, -1.5);
    halo.scale.set(1, 1, 1);
    this.canopyGroup.add(halo);
  }

  private buildRootsAndBranches(x: number, y: number, z: number) {
    const rootMat = new THREE.MeshBasicNodeMaterial({ color: 0x3a2a1a, fog: true });
    for (let i = 0; i < 7; i++) {
      const angle = (i / 7) * Math.PI * 2;
      const len = 2.5 + Math.random() * 1.5;
      const rootGeo = new THREE.ConeGeometry(0.4, len, 6);
      const root = new THREE.Mesh(rootGeo, rootMat);
      root.position.set(x + Math.cos(angle) * 2.2, y + 0.3, z + Math.sin(angle) * 2.2);
      root.rotation.z = Math.cos(angle) * 0.7;
      root.rotation.x = -Math.sin(angle) * 0.7;
      root.scale.set(1, 1, 0.5);
      this.group.add(root);
    }

    const branchMat = new THREE.MeshBasicNodeMaterial({ color: 0x4a3520, fog: true });
    for (let i = 0; i < 5; i++) {
      const angle = (i / 5) * Math.PI * 2 + 0.5;
      const branchGeo = new THREE.CylinderGeometry(0.25, 0.4, 4, 6);
      const branch = new THREE.Mesh(branchGeo, branchMat);
      branch.position.set(x + Math.cos(angle) * 1.5, y + 7, z + Math.sin(angle) * 1.5);
      branch.rotation.z = Math.cos(angle) * 0.9;
      branch.rotation.x = -Math.sin(angle) * 0.9;
      this.group.add(branch);
    }
  }

  private buildHeartLight(x: number, y: number, z: number) {
    const heartGeo = new THREE.SphereGeometry(0.4, 16, 16);
    this.heartMat = glowShader(
      { pulse: 0.8 },
      (u) => {
        const p = T.float(0.6) + T.float(0.4) * T.sin(gpuUniforms.time.value * T.float(1.5));
        return T.vec4(T.vec3(T.float(1), T.float(0.7), T.float(0.4)), u.pulse * p);
      },
    );
    const heart = new THREE.Mesh(heartGeo, this.heartMat);
    heart.position.set(x, y + 4.5, z + 0.2);
    this.group.add(heart);

    const glowGeo = new THREE.PlaneGeometry(3, 3);
    const glowMat = glowShader(
      { intensity: 0.7 },
      (u) => {
        const p = T.float(0.5) + T.float(0.5) * T.sin(gpuUniforms.time.value * T.float(1.5));
        const dist = T.length(T.uv().sub(T.float(0.5)));
        const falloff = T.float(1) - T.smoothstep(T.float(0.1), T.float(0.5), dist);
        return T.vec4(T.vec3(T.float(1), T.float(0.75), T.float(0.45)), falloff * u.intensity * p);
      },
    );
    const glow = new THREE.Mesh(glowGeo, glowMat);
    glow.position.set(x, y + 4.5, z + 0.5);
    glow.lookAt(new THREE.Vector3(x, y + 4.5, z - 2));
    this.group.add(glow);
  }

  private buildLeaves(x: number, y: number, z: number) {
    this.leafPoints = new Float32Array(this.leafCount * 3);
    this.leafVel = new Float32Array(this.leafCount * 3);
    for (let i = 0; i < this.leafCount; i++) {
      this.resetLeaf(i, x, y, z, true);
    }
    const result = worldPoints(this.leafPoints, {
      size: 0.2,
      sizeAttenuation: true,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false,
    });
    this.leafPosAttr = result.position;
    this.leafMaterial = result.material;
    this.leafSprite = result.sprite;
    this.leafMaterial.colorNode = T.vec4(T.vec3(T.float(0.95), T.float(0.8), T.float(0.4)), T.float(0.85));
    this.leafSprite.position.set(0, 0, 0);
    this.group.add(this.leafSprite);
  }

  private resetLeaf(i: number, x: number, y: number, z: number, initial = false) {
    const angle = Math.random() * Math.PI * 2;
    const radius = 2 + Math.random() * 3;
    const heightOffset = initial ? Math.random() * 12 : 0;
    this.leafPoints[i * 3] = x + Math.cos(angle) * radius;
    this.leafPoints[i * 3 + 1] = y + 9 + heightOffset;
    this.leafPoints[i * 3 + 2] = z + Math.sin(angle) * radius;
    this.leafVel[i * 3] = (Math.random() - 0.5) * 0.3;
    this.leafVel[i * 3 + 1] = -(0.15 + Math.random() * 0.35);
    this.leafVel[i * 3 + 2] = (Math.random() - 0.5) * 0.3;
  }

  private buildFireflies(x: number, y: number, z: number) {
    this.fireflyPoints = new Float32Array(this.fireflyCount * 3);
    this.fireflyBase = new Float32Array(this.fireflyCount * 3);
    for (let i = 0; i < this.fireflyCount; i++) {
      const angle = Math.random() * Math.PI * 2;
      const radius = 3 + Math.random() * 5;
      const height = 1 + Math.random() * 6;
      this.fireflyBase[i * 3] = x + Math.cos(angle) * radius;
      this.fireflyBase[i * 3 + 1] = y + height;
      this.fireflyBase[i * 3 + 2] = z + Math.sin(angle) * radius;
      this.fireflyPoints[i * 3] = this.fireflyBase[i * 3];
      this.fireflyPoints[i * 3 + 1] = this.fireflyBase[i * 3 + 1];
      this.fireflyPoints[i * 3 + 2] = this.fireflyBase[i * 3 + 2];
    }
    const result = worldPoints(this.fireflyPoints, {
      size: 0.15,
      sizeAttenuation: true,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false,
    });
    this.fireflyPosAttr = result.position;
    this.fireflyMaterial = result.material;
    this.fireflySprite = result.sprite;
    this.fireflyMaterial.colorNode = T.vec4(T.vec3(T.float(1), T.float(0.85), T.float(0.55)), T.float(0.9));
    this.fireflySprite.position.set(0, 0, 0);
    this.group.add(this.fireflySprite);
  }

  private buildSeat(x: number, y: number, z: number) {
    const seatGeo = new THREE.CylinderGeometry(1.2, 1.5, 0.8, 12);
    const seatMat = new THREE.MeshBasicNodeMaterial({ color: 0x3a5a3a, fog: true });
    const seat = new THREE.Mesh(seatGeo, seatMat);
    seat.position.set(x + Math.cos(this.seatHeading) * 1.8, y + 0.4, z + Math.sin(this.seatHeading) * 1.8);
    seat.rotation.x = 0.1;
    seat.rotation.z = -0.05;
    this.group.add(seat);
    this.seatPos.set(seat.position.x, y + 0.8, seat.position.z);
  }

  private buildWisp(x: number, z: number) {
    this.wisp = this.kit.wisp(0xe8a58c, 7);
    this.wisp.group.position.set(x, heightAt(x, z) + 2.5, z);
    this.group.add(this.wisp.group);
  }

  private buildPathLights(x: number, z: number) {
    const points: THREE.Vector3[] = [];
    const startAngle = this.seatHeading + Math.PI;
    for (let i = 0; i < 8; i++) {
      const t = i / 7;
      const dist = 4 + t * 12;
      const px = x + Math.cos(startAngle) * dist;
      const pz = z + Math.sin(startAngle) * dist;
      const py = heightAt(px, pz) + 0.3;
      points.push(new THREE.Vector3(px, py, pz));
    }
    this.kit.pathLights(points);
  }

  private buildMountains() {
    const mountainMat = new THREE.MeshBasicNodeMaterial({ color: 0x1a2a3a, fog: true });
    const positions = [
      { x: -30, z: -40, scale: 18, height: 8 },
      { x: 0, z: -55, scale: 22, height: 10 },
      { x: 35, z: -35, scale: 16, height: 7 },
    ];
    for (const p of positions) {
      const geo = new THREE.ConeGeometry(p.scale, p.height, 8);
      const mountain = new THREE.Mesh(geo, mountainMat);
      mountain.position.set(p.x, WATER_Y + p.height * 0.4, p.z);
      mountain.scale.y = 0.6;
      this.group.add(mountain);
    }
  }

  greet(): void {
    if (!this.greeted) {
      this.greeted = true;
      this.whisper("You found the tree. Sit a while, if you like.");
    }
  }

  nearSeat(p: THREE.Vector3): boolean {
    const dx = p.x - this.seatPos.x;
    const dz = p.z - this.seatPos.z;
    return Math.sqrt(dx * dx + dz * dz) < 3;
  }

  onSit(): void {
    this.rest();
  }

  onStand(): void {
    this.wake();
  }

  public rest(): void {
    if (this.resting) return;
    this.resting = true;
    this.restT = 0;
    this.firedLines.clear();
    if (!this.nearSeat(this.player.pos)) {
      this.player.pos.set(this.seatPos.x, this.seatPos.y, this.seatPos.z);
      this.player.heading = this.seatHeading;
    }
    this.player.target = null;
  }

  public wake(): void {
    if (this.resting) {
      this.whisper("Go gently.");
      this.resting = false;
      this.player.target = null;
    }
  }

  holdsMovement(): boolean {
    return this.resting;
  }

  update(dt: number): void {
    const time = gpuUniforms.time.value;

    // Breathing canopy
    const breathe = 1 + Math.sin(time * 0.8) * 0.04;
    this.canopyGroup.scale.set(breathe, breathe, breathe);
    if (this.haloMat.uniforms.brightness) {
      this.haloMat.uniforms.brightness.value = 0.5 + Math.sin(time * 1.2) * 0.3;
    }
    if (this.heartMat.uniforms.pulse) {
      this.heartMat.uniforms.pulse.value = 0.6 + Math.sin(time * 1.5) * 0.3;
    }

    // Rest line timing
    if (this.resting) {
      this.restT += dt;
      const lines = [
        { t: 2.5, text: "There now. The road can wait." },
        { t: 9, text: "You don't have to become anything here." },
        { t: 15.5, text: "Rest is also a kind of choosing." },
        { t: 22, text: "When you're ready — the light is still there." },
      ];
      for (let i = 0; i < lines.length; i++) {
        if (this.restT >= lines[i].t && !this.firedLines.has(i)) {
          this.firedLines.add(i);
          this.whisper(lines[i].text, 2500);
        }
      }
    }

    // Falling leaves
    for (let i = 0; i < this.leafCount; i++) {
      this.leafPoints[i * 3] += this.leafVel[i * 3] * dt;
      this.leafPoints[i * 3 + 1] += this.leafVel[i * 3 + 1] * dt;
      this.leafPoints[i * 3 + 2] += this.leafVel[i * 3 + 2] * dt;
      const groundY = heightAt(this.leafPoints[i * 3], this.leafPoints[i * 3 + 2]);
      if (this.leafPoints[i * 3 + 1] < groundY + 0.2) {
        this.resetLeaf(i, SITES.tree.x, heightAt(SITES.tree.x, SITES.tree.z), SITES.tree.z);
      }
    }
    if (this.leafPosAttr) {
      this.leafPosAttr.needsUpdate = true;
    }

    // Fireflies
    this.fireflyTime += dt;
    for (let i = 0; i < this.fireflyCount; i++) {
      const bx = this.fireflyBase[i * 3];
      const by = this.fireflyBase[i * 3 + 1];
      const bz = this.fireflyBase[i * 3 + 2];
      const lx = Math.sin(this.fireflyTime * 0.5 + i * 1.3) * 1.5;
      const ly = Math.sin(this.fireflyTime * 0.7 + i * 2.1) * 0.8;
      const lz = Math.cos(this.fireflyTime * 0.6 + i * 0.9) * 1.5;
      this.fireflyPoints[i * 3] = bx + lx;
      this.fireflyPoints[i * 3 + 1] = by + ly;
      this.fireflyPoints[i * 3 + 2] = bz + lz;
    }
    if (this.fireflyPosAttr) {
      this.fireflyPosAttr.needsUpdate = true;
    }

    // Wisp orbit
    this.wispOrbitT += dt * 0.4;
    const wispRadius = this.resting ? 3.5 : 5.5;
    const wx = SITES.tree.x + Math.cos(this.wispOrbitT) * wispRadius;
    const wy = heightAt(SITES.tree.x, SITES.tree.z) + 2.5 + Math.sin(this.wispOrbitT * 0.7) * 0.5;
    const wz = SITES.tree.z + Math.sin(this.wispOrbitT) * wispRadius;
    this.wisp.setCenter(this._wispCenter.set(wx, wy, wz));

    this.kit.update(dt, this.narrationRef.time());
  }

  dispose(): void {
    this.wake();
    if (this.group.parent) {
      this.group.parent.remove(this.group);
    }
    this.active = false;
    // Clean up geometries and materials
    this.group.traverse((obj) => {
      if (obj instanceof THREE.Mesh || obj instanceof THREE.Sprite || obj instanceof THREE.Points) {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) {
          if (Array.isArray(obj.material)) {
            obj.material.forEach((m) => m.dispose());
          } else {
            obj.material.dispose();
          }
        }
      }
    });
  }
}
