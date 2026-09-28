/* The Tree of Life: a rest scene.

   A great glowing tree on a coastal hill, set back from the temple, looking out
   over open water toward the far mountains. Beneath it, a mossy seat. When the
   wanderer sits, they rest — and a small motherly wisp drifts close and speaks,
   softly, the way a mother would: no lessons, just shelter.

   It is also where the temple tour's "I choose to rest" leads. */
import * as THREE from "three/webgpu";
import { T, spriteCloud, type SpriteCloud } from "../gpu/tsl";
import { heightAt, WATER_Y } from "../world/terrain";
import { TEMPLE_SITE } from "./templeTour";
import type { Controller } from "../player/controller";
import type { Wanderer } from "../player/wanderer";
import type { FollowCamera } from "../player/camera";

export interface TreeHooks {
  whisper: (text: string, ms?: number) => void;
}

function findTreeSite(): { x: number; z: number; view: THREE.Vector3 } {
  const cx = TEMPLE_SITE.x;
  const cz = TEMPLE_SITE.z;
  for (let r = 150; r <= 1400; r += 25) {
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 24) {
      const x = cx + Math.cos(a) * r;
      const z = cz + Math.sin(a) * r;
      const h = heightAt(x, z);
      if (h < 9 || h > 24) continue;
      // Face the open water: the lowest land within sight.
      let bx = 1;
      let bz = 0;
      let bh = Infinity;
      for (let k = 0; k < 12; k++) {
        const d = (k / 12) * Math.PI * 2;
        const hh = heightAt(x + Math.cos(d) * 170, z + Math.sin(d) * 170);
        if (hh < bh) {
          bh = hh;
          bx = Math.cos(d);
          bz = Math.sin(d);
        }
      }
      if (bh > WATER_Y + 1) continue;
      return { x, z, view: new THREE.Vector3(bx, 0, bz) };
    }
  }
  return { x: cx + 220, z: cz, view: new THREE.Vector3(1, 0, 0) };
}

function el<T extends HTMLElement>(sel: string): T {
  return document.querySelector(sel) as T;
}

function radialTexture(inner: string, outer: string): THREE.Texture {
  const cv = document.createElement("canvas");
  cv.width = cv.height = 128;
  const c = cv.getContext("2d")!;
  const g = c.createRadialGradient(64, 64, 2, 64, 64, 64);
  g.addColorStop(0, inner);
  g.addColorStop(0.4, outer);
  g.addColorStop(1, "rgba(0,0,0,0)");
  c.fillStyle = g;
  c.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const REST_LINES = [
  "There now. The road can wait.",
  "You don't have to become anything here.",
  "Rest is also a kind of choosing.",
  "When you're ready — the light is still there.",
];
const LINE_AT = [2.5, 9, 15.5, 22];

export class TreeOfLife {
  resting = false;
  readonly seatPos = new THREE.Vector3();
  readonly seatHeading: number;
  readonly horizonPoint = new THREE.Vector3();

  private group = new THREE.Group();
  private wisp = new THREE.Group();
  private wispLight: THREE.PointLight;
  private wispTarget = new THREE.Vector3();
  private wispHome = new THREE.Vector3();
  private wispVisit = 0;
  private canopy!: SpriteCloud;
  private canopyBase!: Float32Array;
  private canopyPhase!: Float32Array;
  private leaves: { bx: number; bz: number; speed: number; off: number; ph: number }[] = [];
  private leafCloud!: SpriteCloud;
  private fireflies!: SpriteCloud;
  private fireflyBase!: Float32Array;
  private heartLight: THREE.PointLight;
  private restT = 0;
  private lineIdx = 0;
  private t = 0;
  private fade: HTMLDivElement;

  constructor(
    scene: THREE.Scene,
    private player: Controller,
    private wanderer: Wanderer,
    private follow: FollowCamera,
    private hooks: TreeHooks,
  ) {
    const site = findTreeSite();
    const gy = heightAt(site.x, site.z);
    const view = site.view;
    this.seatPos.set(site.x + view.x * 7, 0, site.z + view.z * 7);
    this.seatPos.y = heightAt(this.seatPos.x, this.seatPos.z);
    this.seatHeading = Math.atan2(-view.x, -view.z);
    this.horizonPoint.copy(this.seatPos).addScaledVector(view, 230);
    this.horizonPoint.y = this.seatPos.y + 4;

    // --- the tree ---
    const bark = new THREE.MeshStandardMaterial({ color: 0x4a3a2c, roughness: 1 });
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 2.6, 16, 10), bark);
    trunk.position.set(site.x, gy + 8, site.z);
    trunk.castShadow = true;
    this.group.add(trunk);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + 0.5;
      const br = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.7, 9, 7), bark);
      br.position.set(site.x + Math.cos(a) * 3.4, gy + 15.5, site.z + Math.sin(a) * 3.4);
      br.rotation.set(Math.sin(a) * 0.9, 0, -Math.cos(a) * 0.9);
      this.group.add(br);
    }
    // roots
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.2;
      const root = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 1.1, 7, 6), bark);
      root.position.set(site.x + Math.cos(a) * 4.2, gy + 0.8, site.z + Math.sin(a) * 4.2);
      root.rotation.set(Math.sin(a) * 1.25, 0, -Math.cos(a) * 1.25);
      this.group.add(root);
    }
    // canopy: a cloud of golden-green light
    const N = 650;
    const pos = new Float32Array(N * 3);
    const col = new Float32Array(N * 3);
    this.canopyBase = new Float32Array(N * 3);
    this.canopyPhase = new Float32Array(N);
    const cA = new THREE.Color(0xd8f0a0);
    const cB = new THREE.Color(0xffd98a);
    for (let i = 0; i < N; i++) {
      const th = Math.random() * Math.PI * 2;
      const ph = Math.acos(2 * Math.random() - 1);
      const rr = 0.35 + 0.65 * Math.random();
      const x = Math.sin(ph) * Math.cos(th) * 11 * rr;
      const y = Math.cos(ph) * 5 * rr + 19;
      const z = Math.sin(ph) * Math.sin(th) * 11 * rr;
      pos.set([site.x + x, gy + y, site.z + z], i * 3);
      this.canopyBase.set([site.x + x, gy + y, site.z + z], i * 3);
      this.canopyPhase[i] = Math.random() * Math.PI * 2;
      const c = cA.clone().lerp(cB, Math.random());
      col.set([c.r, c.g, c.b], i * 3);
    }
    // WebGPU-safe: an instanced sprite cloud instead of THREE.Points.
    const canopyMat = new THREE.PointsNodeMaterial({
      size: 0.6,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
    });
    canopyMat.sizeAttenuation = true;
    const canopyCloud = spriteCloud(N, { position: 3, aCol: 3 }, canopyMat);
    (canopyCloud.attrs.position.array as Float32Array).set(pos);
    (canopyCloud.attrs.aCol.array as Float32Array).set(col);
    canopyCloud.attrs.position.needsUpdate = true;
    canopyCloud.attrs.aCol.needsUpdate = true;
    canopyMat.colorNode = T.vec4(canopyCloud.nodes.aCol, T.float(1));
    canopyMat.opacityNode = T.materialOpacity.mul(
      T.smoothstep(T.float(0.5), T.float(0.2), T.length(T.pointUV.sub(0.5))),
    );
    this.group.add(canopyCloud.sprite);
    this.canopy = canopyCloud;
    // the heart: warm light in the trunk's hollow
    const heart = new THREE.Mesh(
      new THREE.SphereGeometry(0.8, 16, 12),
      new THREE.MeshBasicMaterial({ color: 0xffca7a }),
    );
    heart.position.set(site.x + view.x * 1.6, gy + 3.2, site.z + view.z * 1.6);
    this.group.add(heart);
    this.heartLight = new THREE.PointLight(0xffb46a, 40, 46, 1.8);
    this.heartLight.position.copy(heart.position);
    this.group.add(this.heartLight);
    // falling leaves: one WebGPU-safe instanced cloud; per-leaf fade via aAlpha
    const leafTex = radialTexture("rgba(255,225,150,1)", "rgba(255,200,120,0.5)");
    const leafMat = new THREE.PointsNodeMaterial({
      size: 0.55,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false,
    });
    leafMat.sizeAttenuation = true;
    this.leafCloud = spriteCloud(30, { position: 3, aAlpha: 1 }, leafMat);
    const ltex = T.texture(leafTex, T.pointUV);
    leafMat.colorNode = T.vec4(ltex.rgb, ltex.a.mul(this.leafCloud.nodes.aAlpha));
    this.group.add(this.leafCloud.sprite);
    for (let i = 0; i < 30; i++) {
      this.leaves.push({
        bx: site.x + (Math.random() - 0.5) * 20,
        bz: site.z + (Math.random() - 0.5) * 20,
        speed: 0.06 + Math.random() * 0.05,
        off: Math.random(),
        ph: Math.random() * Math.PI * 2,
      });
    }
    // fireflies
    const FN = 26;
    const fp = new Float32Array(FN * 3);
    this.fireflyBase = new Float32Array(FN * 3);
    for (let i = 0; i < FN; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 6 + Math.random() * 22;
      fp.set(
        [site.x + Math.cos(a) * r, gy + 1 + Math.random() * 14, site.z + Math.sin(a) * r],
        i * 3,
      );
      this.fireflyBase.set([fp[i * 3], fp[i * 3 + 1], fp[i * 3 + 2]], i * 3);
    }
    // fireflies: one WebGPU-safe instanced cloud instead of THREE.Points
    const fireMat = new THREE.PointsNodeMaterial({
      size: 0.4,
      color: 0xffe6a8,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
    });
    fireMat.sizeAttenuation = true;
    const fireCloud = spriteCloud(FN, { position: 3 }, fireMat);
    (fireCloud.attrs.position.array as Float32Array).set(fp);
    fireCloud.attrs.position.needsUpdate = true;
    fireMat.opacityNode = T.materialOpacity.mul(
      T.smoothstep(T.float(0.5), T.float(0.2), T.length(T.pointUV.sub(0.5))),
    );
    this.group.add(fireCloud.sprite);
    this.fireflies = fireCloud;

    // --- the mossy seat, facing the horizon ---
    const seat = new THREE.Mesh(
      new THREE.CircleGeometry(2.4, 24),
      new THREE.MeshStandardMaterial({ color: 0x44583c, roughness: 1, emissive: 0x111a0e }),
    );
    seat.rotation.x = -Math.PI / 2;
    seat.position.set(this.seatPos.x, this.seatPos.y + 0.06, this.seatPos.z);
    seat.receiveShadow = true;
    this.group.add(seat);

    // --- far mountains, hazed by the fog ---
    const mMat = new THREE.MeshStandardMaterial({ color: 0x1c2145, roughness: 1, flatShading: true });
    for (let i = 0; i < 5; i++) {
      const spread = (i - 2) * 0.16;
      const dx = view.x * Math.cos(spread) - view.z * Math.sin(spread);
      const dz = view.x * Math.sin(spread) + view.z * Math.cos(spread);
      const dist = 280 + (i % 3) * 55;
      const h = 70 + ((i * 37) % 50);
      const m = new THREE.Mesh(new THREE.ConeGeometry(h * 1.4, h, 5), mMat);
      m.position.set(site.x + dx * dist, h / 2 - 8, site.z + dz * dist);
      m.rotation.y = i * 1.3;
      this.group.add(m);
    }

    // --- the motherly wisp ---
    const core = new THREE.Mesh(
      new THREE.SphereGeometry(0.32, 16, 12),
      new THREE.MeshBasicMaterial({ color: 0xffd9b8 }),
    );
    const glowTex = radialTexture("rgba(255,200,160,1)", "rgba(255,150,110,0.45)");
    // WebGPU-safe: an instanced glow sprite instead of THREE.Sprite.
    const wispGlowMat = new THREE.PointsNodeMaterial({
      size: 2.4,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false,
    });
    wispGlowMat.sizeAttenuation = true;
    const wispGlow = spriteCloud(1, { position: 3 }, wispGlowMat);
    const wtex = T.texture(glowTex, T.pointUV);
    wispGlowMat.colorNode = T.vec4(wtex.rgb, wtex.a.mul(0.9));
    this.wispLight = new THREE.PointLight(0xff9d6e, 14, 20, 1.8);
    this.wisp.add(core, wispGlow.sprite, this.wispLight);
    this.wispHome.set(site.x - view.x * 4, gy + 4.5, site.z - view.z * 4);
    this.wispTarget.copy(this.wispHome);
    this.wisp.position.copy(this.wispHome);
    this.group.add(this.wisp);

    scene.add(this.group);

    // soft fade for the rest-from-tour journey
    this.fade = document.createElement("div");
    this.fade.style.cssText =
      "position:fixed;inset:0;background:#060510;opacity:0;transition:opacity 1.4s ease;" +
      "pointer-events:none;z-index:40;";
    document.body.appendChild(this.fade);
  }

  nearSeat(p: THREE.Vector3): boolean {
    const dx = p.x - this.seatPos.x;
    const dz = p.z - this.seatPos.z;
    return dx * dx + dz * dz < 25;
  }

  /** Arriving fresh: the wisp notices you. */
  greet(): void {
    if (this.resting) return;
    this.wispVisit = 8;
    this.hooks.whisper("You found the tree. Sit a while, if you like.", 6000);
  }

  beginRest(): void {
    if (this.resting) return;
    this.resting = true;
    this.restT = 0;
    this.lineIdx = 0;
    this.player.pos.set(this.seatPos.x, this.seatPos.y, this.seatPos.z);
    this.player.vel.set(0, 0, 0);
    this.player.target = null;
    this.player.heading = this.seatHeading;
    this.player.pose = "idle";
    this.player.speed = 0;
    this.wanderer.setGesture("sit");
    this.follow.yaw = this.seatHeading;
    this.follow.seatedWith = this.horizonPoint;
    // the rest panel: a way back up, and silence if wanted
    el("#sit-title").textContent = "❋ The tree of life";
    el("#sit-prompts").replaceChildren();
    (el("#sit-offer-light") as HTMLButtonElement).hidden = true;
    el("#sit-panel").hidden = false;
    document.body.classList.add("seated");
  }

  /** The tour's "I choose to rest": a soft fade, then rest beneath the tree. */
  restFromTour(): void {
    this.fade.style.opacity = "1";
    window.setTimeout(() => {
      this.beginRest();
      this.fade.style.opacity = "0";
    }, 1500);
  }

  endRest(): void {
    if (!this.resting) return;
    this.resting = false;
    this.wanderer.setGesture("none");
    this.follow.seatedWith = null;
    el("#sit-panel").hidden = true;
    (el("#sit-offer-light") as HTMLButtonElement).hidden = false;
    document.body.classList.remove("seated");
    this.hooks.whisper("Go gently.", 4000);
  }

  update(dt: number): void {
    this.t += dt;
    const t = this.t;
    // canopy breathing
    const arr = this.canopy.attrs.position.array as Float32Array;
    for (let i = 0; i < this.canopyPhase.length; i++) {
      const ph = this.canopyPhase[i]!;
      arr[i * 3] = this.canopyBase[i * 3]! + Math.sin(t * 0.6 + ph) * 0.45;
      arr[i * 3 + 1] = this.canopyBase[i * 3 + 1]! + Math.sin(t * 0.45 + ph * 1.7) * 0.3;
    }
    this.canopy.attrs.position.needsUpdate = true;
    // falling leaves
    const lp = this.leafCloud.attrs.position.array as Float32Array;
    const la = this.leafCloud.attrs.aAlpha.array as Float32Array;
    for (let i = 0; i < this.leaves.length; i++) {
      const l = this.leaves[i]!;
      const cyc = (t * l.speed + l.off) % 1;
      lp[i * 3] = l.bx + Math.sin(t * 0.8 + l.ph) * 1.6;
      lp[i * 3 + 1] = this.seatPos.y + 15 - cyc * 15;
      lp[i * 3 + 2] = l.bz + Math.cos(t * 0.6 + l.ph) * 1.6;
      la[i] = Math.sin(cyc * Math.PI) * 0.75;
    }
    this.leafCloud.attrs.position.needsUpdate = true;
    this.leafCloud.attrs.aAlpha.needsUpdate = true;
    // fireflies
    const fa = this.fireflies.attrs.position.array as Float32Array;
    for (let i = 0; i < fa.length / 3; i++) {
      fa[i * 3] = this.fireflyBase[i * 3]! + Math.sin(t * 0.5 + i * 1.7) * 2;
      fa[i * 3 + 1] = this.fireflyBase[i * 3 + 1]! + Math.sin(t * 0.7 + i * 2.3) * 1.2;
      fa[i * 3 + 2] = this.fireflyBase[i * 3 + 2]! + Math.cos(t * 0.4 + i) * 2;
    }
    this.fireflies.attrs.position.needsUpdate = true;
    this.heartLight.intensity = 36 + Math.sin(t * 2.1) * 6;
    // the wisp
    if (this.resting) {
      this.wispTarget.set(
        this.seatPos.x + Math.sin(this.seatHeading) * -2.4,
        this.seatPos.y + 1.5 + Math.sin(t * 1.3) * 0.15,
        this.seatPos.z + Math.cos(this.seatHeading) * -2.4,
      );
    } else if (this.wispVisit > 0) {
      this.wispVisit -= dt;
      this.wispTarget.set(
        this.player.pos.x + Math.sin(t * 0.8) * 1.5,
        this.player.pos.y + 1.8,
        this.player.pos.z + Math.cos(t * 0.8) * 1.5,
      );
      if (this.wispVisit <= 0) this.wispTarget.copy(this.wispHome);
    } else {
      const hx = this.wispHome.x;
      const hz = this.wispHome.z;
      this.wispTarget.set(
        hx + Math.sin(t * 0.3) * 3,
        this.wispHome.y + Math.sin(t * 0.9) * 0.5,
        hz + Math.cos(t * 0.23) * 3,
      );
    }
    this.wisp.position.lerp(this.wispTarget, Math.min(1, dt * 1.4));
    this.wispLight.intensity = 13 + Math.sin(t * 2.6) * 3;

    // the rest dialogue
    if (this.resting) {
      this.restT += dt;
      if (this.lineIdx < REST_LINES.length && this.restT >= LINE_AT[this.lineIdx]!) {
        this.hooks.whisper(REST_LINES[this.lineIdx]!, 6500);
        this.lineIdx++;
      }
    }
  }
}
