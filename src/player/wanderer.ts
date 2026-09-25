/* The wanderer: a simple, featureless figure made of soft light.
   Procedural animation only (walk, glide, swim, jump, breathe). */
import * as THREE from "three";

function glowTexture(): THREE.Texture {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, "rgba(255,240,215,1)");
  grd.addColorStop(0.25, "rgba(255,220,180,0.45)");
  grd.addColorStop(1, "rgba(255,200,160,0)");
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export type Pose = "idle" | "walk" | "glide" | "swim" | "air";

export class Wanderer {
  root = new THREE.Group(); // positioned at the feet; rotation.y is the heading
  private body = new THREE.Group();
  private hipL = new THREE.Group();
  private hipR = new THREE.Group();
  private shL = new THREE.Group();
  private shR = new THREE.Group();
  private halo: THREE.Sprite;
  private light: THREE.PointLight;
  private mat: THREE.MeshStandardMaterial;
  private phase = 0;
  private swimK = 0;
  private airK = 0;
  private form = 0; // 0 → 1 as the wanderer gathers out of light at the start

  constructor() {
    this.mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(1, 0.95, 0.88),
      emissive: new THREE.Color(1, 0.9, 0.75),
      emissiveIntensity: 2.0,
      roughness: 0.6,
      transparent: true,
      opacity: 0.95,
    });
    const capsule = (r: number, len: number) => {
      const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 6, 12), this.mat);
      m.castShadow = true;
      return m;
    };
    // Torso and head.
    const torso = capsule(0.19, 0.5);
    torso.position.y = 1.12;
    torso.scale.set(1, 1, 0.75);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.15, 20, 14), this.mat);
    head.position.y = 1.62;
    head.castShadow = true;
    this.body.add(torso, head);
    // Limbs hang from pivots so they can swing.
    const leg = () => {
      const l = capsule(0.075, 0.62);
      l.position.y = -0.4;
      return l;
    };
    const arm = () => {
      const a = capsule(0.055, 0.5);
      a.position.y = -0.3;
      return a;
    };
    this.hipL.position.set(-0.1, 0.84, 0);
    this.hipR.position.set(0.1, 0.84, 0);
    this.hipL.add(leg());
    this.hipR.add(leg());
    this.shL.position.set(-0.26, 1.4, 0);
    this.shR.position.set(0.26, 1.4, 0);
    this.shL.add(arm());
    this.shR.add(arm());
    this.body.add(this.hipL, this.hipR, this.shL, this.shR);
    this.root.add(this.body);

    this.halo = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: glowTexture(), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.55 }),
    );
    this.halo.scale.setScalar(3.2);
    this.halo.position.y = 1.1;
    this.root.add(this.halo);

    // The wanderer lights the ground around them.
    this.light = new THREE.PointLight(0xffdcb0, 6, 9, 1.6);
    this.light.position.y = 1.2;
    this.root.add(this.light);
  }

  /** Called every frame with the controller's state. */
  animate(dt: number, pose: Pose, speed: number, t: number, reduced: boolean): void {
    this.form = Math.min(1, this.form + dt / 2.5);
    const f = THREE.MathUtils.smoothstep(this.form, 0, 1);
    this.mat.opacity = 0.95 * f;
    this.halo.material.opacity = 0.55 * f + (1 - f) * 0.9 * this.form;
    this.halo.scale.setScalar(3.2 + (1 - f) * 3);

    this.swimK += ((pose === "swim" ? 1 : 0) - this.swimK) * Math.min(1, dt * 4);
    this.airK += ((pose === "air" ? 1 : 0) - this.airK) * Math.min(1, dt * 8);
    const moving = pose === "walk" || pose === "glide" || (pose === "swim" && speed > 0.2);
    const cadence = pose === "swim" ? 1.6 : 2.4 / Math.max(0.6, Math.sqrt(speed / 3));
    this.phase += dt * speed * cadence;
    const amt = moving ? Math.min(1, speed / 3) : 0;
    const s = Math.sin(this.phase);
    const glide = pose === "glide" ? 1 : 0;

    // Legs and arms.
    const legSwing = s * 0.6 * amt * (1 - this.swimK) * (1 - glide * 0.4);
    this.hipL.rotation.x = legSwing - this.airK * 0.5;
    this.hipR.rotation.x = -legSwing - this.airK * 0.2;
    const armSwing = -s * 0.45 * amt * (1 - this.swimK);
    this.shL.rotation.x = armSwing + glide * 0.3;
    this.shR.rotation.x = -armSwing + glide * 0.3;
    this.shL.rotation.z = -0.08 - glide * 0.5 - this.airK * 0.3;
    this.shR.rotation.z = 0.08 + glide * 0.5 + this.airK * 0.3;
    // Swimming: lean forward, arms sweep in slow circles.
    if (this.swimK > 0.01) {
      const sw = this.phase * 1.2;
      this.shL.rotation.x += this.swimK * (-2.2 + Math.sin(sw) * 0.9);
      this.shR.rotation.x += this.swimK * (-2.2 + Math.sin(sw + Math.PI) * 0.9);
      this.hipL.rotation.x += this.swimK * Math.sin(sw * 2) * 0.3;
      this.hipR.rotation.x += this.swimK * Math.sin(sw * 2 + Math.PI) * 0.3;
    }
    // Keep the halo above the surface while swimming, so the water doesn't slice it.
    this.halo.position.y = 1.1 + this.swimK * 0.5;
    this.halo.scale.multiplyScalar(1 - this.swimK * 0.45);
    this.body.rotation.x = -this.swimK * 1.15 - glide * 0.12;
    this.body.position.y = this.swimK * 0.55 + (moving && !this.swimK ? Math.abs(s) * 0.04 * amt : 0);
    this.body.position.z = this.swimK * 0.4;
    // Breathing at rest, about six breaths a minute.
    const br = reduced ? 0 : Math.sin(t * 0.63) * 0.015 * (1 - amt);
    this.body.scale.set(1 + br, 1 + br * 0.5, 1 + br);
    this.mat.emissiveIntensity = 1.9 + 0.3 * Math.sin(t * 0.63) + glide * 0.5;
    this.light.intensity = 6 + glide * 2;
  }

  /** The wanderer's light fades into the world at the end, or gathers at the start. */
  setForm(v: number): void {
    this.form = v;
  }
}
