/* The wanderer: a body of flowing light, not a solid figure.
   - The body is smooth, tapered forms drawn additively: faint at the centre, bright at
     the silhouette, with slow bands of light rising through it and a surface that ripples.
   - Several hundred motes flow up through the limbs toward the heart and head. Each
     follows the body with its own lag, so when the wanderer moves the energy streams behind.
   - Procedural animation with knees, elbows, spine twist and sway; every joint eases toward
     its pose, so motion carries follow-through instead of snapping. */
import * as THREE from "three";

export type Pose = "idle" | "walk" | "glide" | "swim" | "air";

const bodyUniforms = {
  uT: { value: 0 },
  uForm: { value: 0 }, // 0 → 1 as the wanderer gathers out of light
  uPulse: { value: 1 },
  uWobble: { value: 0.012 },
};

function bodyMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: bodyUniforms,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `
      uniform float uT,uWobble;
      varying vec3 vN;varying vec3 vW;
      void main(){
        vec4 wp0=modelMatrix*vec4(position,1.0);
        // the surface ripples like something liquid
        float w=sin(wp0.y*17.0+uT*3.1+wp0.x*9.0)*sin(wp0.x*13.0-uT*2.3+wp0.z*11.0)
               +0.5*sin(wp0.y*31.0-uT*4.7+wp0.z*7.0);
        vec3 p=position+normal*w*uWobble;
        vec4 wp=modelMatrix*vec4(p,1.0);
        vW=wp.xyz;
        vN=normalize(mat3(modelMatrix)*normal);
        gl_Position=projectionMatrix*viewMatrix*wp;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uT,uForm,uPulse;
      varying vec3 vN;varying vec3 vW;
      void main(){
        vec3 v=normalize(cameraPosition-vW);
        float f=1.0-abs(dot(normalize(vN),v));
        float rim=pow(f,2.2);
        // bands of light rising through the body
        float flow=0.5+0.5*sin(vW.y*15.0-uT*2.4+sin(vW.x*8.0+uT*0.7)*1.6+sin(vW.z*7.0-uT*0.9));
        float flow2=0.5+0.5*sin(vW.y*6.0-uT*1.1);
        vec3 core=vec3(1.0,0.84,0.60);
        vec3 edge=vec3(0.80,0.92,1.0);
        vec3 c=core*(0.08+0.22*flow*flow2)*(1.0-rim)+mix(core,edge,0.45)*rim*1.25;
        gl_FragColor=vec4(c*uForm*uPulse,1.0);
      }`,
  });
}

/** A tapered solid of revolution along -y (for limbs) or +y (torso, head). */
function lathe(profile: [number, number][], mat: THREE.Material): THREE.Mesh {
  const pts = profile.map(([r, y]) => new THREE.Vector2(r, y));
  const m = new THREE.Mesh(new THREE.LatheGeometry(pts, 20), mat);
  m.frustumCulled = false;
  return m;
}

function glowTexture(): THREE.Texture {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, "rgba(255,236,205,0.9)");
  grd.addColorStop(0.3, "rgba(255,215,170,0.28)");
  grd.addColorStop(1, "rgba(255,200,160,0)");
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/* ---------- flowing motes ---------- */
interface Stream {
  part: THREE.Object3D;
  len: number; // along the part's axis
  dir: 1 | -1; // +1: part extends up (+y); -1: hangs down (-y)
  radius: number;
  share: number; // fraction of motes
}

class Motes {
  points: THREE.Points;
  private n: number;
  private part: Int16Array;
  private phase: Float32Array;
  private ang: Float32Array;
  private rad: Float32Array;
  private follow: Float32Array;
  private pos: Float32Array;
  private alpha: Float32Array;
  private started = false;
  private v = new THREE.Vector3();
  private mat: THREE.ShaderMaterial;

  constructor(private streams: Stream[], n: number) {
    this.n = n;
    this.part = new Int16Array(n);
    this.phase = new Float32Array(n);
    this.ang = new Float32Array(n);
    this.rad = new Float32Array(n);
    this.follow = new Float32Array(n);
    this.pos = new Float32Array(n * 3);
    this.alpha = new Float32Array(n);
    const size = new Float32Array(n);
    const tint = new Float32Array(n);
    const total = streams.reduce((a, s) => a + s.share, 0);
    let i = 0;
    streams.forEach((s, si) => {
      const count = si === streams.length - 1 ? n - i : Math.round((s.share / total) * n);
      for (let k = 0; k < count && i < n; k++, i++) {
        this.part[i] = si;
        this.phase[i] = Math.random();
        this.ang[i] = Math.random() * Math.PI * 2;
        this.rad[i] = Math.sqrt(Math.random()) * 0.9 + 0.1;
        // most motes cling to the body; some lag far behind as streamers
        this.follow[i] = Math.random() < 0.18 ? 1.5 + Math.random() * 2.5 : 9 + Math.random() * 12;
        size[i] = 0.5 + Math.random() * Math.random() * 1.8;
        tint[i] = Math.random();
      }
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute("aAlpha", new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute("aSize", new THREE.BufferAttribute(size, 1));
    g.setAttribute("aTint", new THREE.BufferAttribute(tint, 1));
    this.mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uDpr: { value: 1 }, uForm: bodyUniforms.uForm },
      vertexShader: /* glsl */ `attribute float aAlpha,aSize,aTint;uniform float uDpr;varying float vA;varying float vT;
        void main(){vec4 mv=modelViewMatrix*vec4(position,1.0);gl_Position=projectionMatrix*mv;
          gl_PointSize=clamp(aSize*uDpr*28.0/max(-mv.z,0.5),1.0,9.0*uDpr);vA=aAlpha;vT=aTint;}`,
      fragmentShader: /* glsl */ `uniform float uForm;varying float vA;varying float vT;
        void main(){float r=length(gl_PointCoord-0.5);float a=smoothstep(0.5,0.0,r)*vA*uForm;
          vec3 c=vT<0.7?vec3(1.0,0.88,0.66):vT<0.9?vec3(0.85,0.95,1.0):vec3(1.0,0.72,0.45);
          gl_FragColor=vec4(c*a*1.6,1.0);}`,
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
  }

  update(dt: number, t: number, speedFlow: number, dpr: number): void {
    this.mat.uniforms.uDpr.value = dpr;
    const p = this.pos;
    for (let i = 0; i < this.n; i++) {
      const s = this.streams[this.part[i]];
      // flow toward the heart: limbs upward, torso upward into the head
      let u = (this.phase[i] + t * (0.22 + speedFlow * 0.12) * (0.6 + (i % 7) * 0.08)) % 1;
      const along = s.dir === 1 ? u * s.len : -(1 - u) * s.len;
      const a = this.ang[i] + t * 0.8;
      const r = s.radius * this.rad[i] * (1 + 0.25 * Math.sin(t * 2 + i));
      this.v.set(Math.cos(a) * r, along, Math.sin(a) * r).applyMatrix4(s.part.matrixWorld);
      const j = i * 3;
      if (!this.started) {
        p[j] = this.v.x;
        p[j + 1] = this.v.y;
        p[j + 2] = this.v.z;
      } else {
        const k = Math.min(1, dt * this.follow[i]);
        p[j] += (this.v.x - p[j]) * k;
        p[j + 1] += (this.v.y - p[j + 1]) * k + (this.follow[i] < 5 ? dt * 0.25 : 0); // streamers drift upward
        p[j + 2] += (this.v.z - p[j + 2]) * k;
      }
      // fade in and out along the stream
      u = Math.min(u, 1 - u) * 2;
      this.alpha[i] = Math.min(1, u * 3) * (this.follow[i] < 5 ? 0.55 : 0.85);
    }
    this.started = true;
    const g = this.points.geometry;
    (g.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (g.attributes.aAlpha as THREE.BufferAttribute).needsUpdate = true;
  }

  reset(): void {
    this.started = false;
  }
}

/* ---------- the figure ---------- */
type Joint = "hipL" | "hipR" | "kneeL" | "kneeR" | "shL" | "shR" | "elL" | "elR" | "spine" | "neck";

export class Wanderer {
  root = new THREE.Group(); // at the feet; rotation.y is the heading
  motes: Motes;
  private pelvis = new THREE.Group();
  private spine = new THREE.Group();
  private chest!: THREE.Mesh;
  private neck = new THREE.Group();
  private j: Record<Joint, THREE.Group>;
  // current (smoothed) joint rotations: [x, y, z]
  private cur: Record<Joint, THREE.Vector3>;
  private halo: THREE.Sprite;
  private light: THREE.PointLight;
  private phase = 0;
  private k = { swim: 0, air: 0, glide: 0, move: 0 };
  private form = 0;
  private flowSpeed = 0;

  constructor() {
    const mat = bodyMaterial();
    const g = () => new THREE.Group();
    this.j = {
      hipL: g(), hipR: g(), kneeL: g(), kneeR: g(), shL: g(), shR: g(), elL: g(), elR: g(),
      spine: this.spine, neck: this.neck,
    };
    this.cur = Object.fromEntries(Object.keys(this.j).map((k) => [k, new THREE.Vector3()])) as Record<Joint, THREE.Vector3>;

    this.root.scale.setScalar(0.92);
    this.pelvis.position.y = 0.95;
    this.root.add(this.pelvis);

    // Torso: hips → waist → chest → shoulders, one continuous form.
    const hips = lathe([[0.001, -0.08], [0.12, -0.05], [0.15, 0.04], [0.13, 0.14]], mat);
    this.pelvis.add(hips, this.spine);
    this.chest = lathe([[0.125, 0.0], [0.12, 0.1], [0.155, 0.26], [0.19, 0.4], [0.17, 0.5], [0.1, 0.57], [0.045, 0.6]], mat);
    this.chest.scale.z = 0.72;
    this.spine.position.y = 0.12;
    this.spine.add(this.chest);
    // Neck and head.
    this.neck.position.y = 0.6;
    this.spine.add(this.neck);
    const head = lathe([[0.001, 0.0], [0.045, 0.02], [0.05, 0.06], [0.1, 0.1], [0.118, 0.18], [0.105, 0.26], [0.06, 0.31], [0.001, 0.325]], mat);
    head.scale.z = 0.9;
    this.neck.add(head);

    // Legs: thigh → knee → shin → foot.
    for (const side of [-1, 1] as const) {
      const hip = side < 0 ? this.j.hipL : this.j.hipR;
      const knee = side < 0 ? this.j.kneeL : this.j.kneeR;
      hip.position.set(0.085 * side, 0, 0);
      hip.add(lathe([[0.085, 0.02], [0.09, -0.05], [0.07, -0.3], [0.058, -0.44]], mat));
      knee.position.y = -0.44;
      knee.add(lathe([[0.058, 0.0], [0.055, -0.12], [0.04, -0.4], [0.034, -0.44], [0.001, -0.47]], mat));
      const foot = lathe([[0.001, 0.05], [0.04, 0.03], [0.035, -0.02], [0.001, -0.03]], mat);
      foot.rotation.x = -Math.PI / 2;
      foot.position.set(0, -0.44, -0.06);
      knee.add(foot);
      hip.add(knee);
      this.pelvis.add(hip);
    }
    // Arms: shoulder → elbow → forearm → hand.
    for (const side of [-1, 1] as const) {
      const sh = side < 0 ? this.j.shL : this.j.shR;
      const el = side < 0 ? this.j.elL : this.j.elR;
      sh.position.set(0.2 * side, 0.5, 0);
      sh.add(lathe([[0.001, 0.05], [0.058, 0.02], [0.056, -0.06], [0.043, -0.28]], mat));
      el.position.y = -0.28;
      el.add(lathe([[0.043, 0.0], [0.04, -0.08], [0.029, -0.26], [0.032, -0.31], [0.022, -0.37], [0.001, -0.39]], mat));
      sh.add(el);
      this.spine.add(sh);
    }

    this.halo = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: glowTexture(), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.4 }),
    );
    this.halo.scale.setScalar(2.6);
    this.halo.position.y = 1.15;
    this.root.add(this.halo);

    this.light = new THREE.PointLight(0xffdcb0, 6, 9, 1.6);
    this.light.position.y = 1.2;
    this.root.add(this.light);

    this.motes = new Motes(
      [
        { part: this.spine, len: 0.6, dir: 1, radius: 0.14, share: 5 },
        { part: this.neck, len: 0.3, dir: 1, radius: 0.09, share: 2 },
        { part: this.j.hipL, len: 0.44, dir: -1, radius: 0.07, share: 1.5 },
        { part: this.j.hipR, len: 0.44, dir: -1, radius: 0.07, share: 1.5 },
        { part: this.j.kneeL, len: 0.44, dir: -1, radius: 0.045, share: 1.2 },
        { part: this.j.kneeR, len: 0.44, dir: -1, radius: 0.045, share: 1.2 },
        { part: this.j.shL, len: 0.28, dir: -1, radius: 0.045, share: 1 },
        { part: this.j.shR, len: 0.28, dir: -1, radius: 0.045, share: 1 },
        { part: this.j.elL, len: 0.38, dir: -1, radius: 0.032, share: 1.1 },
        { part: this.j.elR, len: 0.38, dir: -1, radius: 0.032, share: 1.1 },
      ],
      460,
    );
  }

  /** Called every frame with the controller's state. */
  animate(dt: number, pose: Pose, speed: number, t: number, reduced: boolean, dpr = 1): void {
    bodyUniforms.uT.value = reduced ? t * 0.4 : t;
    bodyUniforms.uWobble.value = reduced ? 0.004 : 0.012;
    this.form = Math.min(1, this.form + dt / 2.5);
    const f = THREE.MathUtils.smoothstep(this.form, 0, 1);
    bodyUniforms.uForm.value = f;
    this.halo.material.opacity = 0.4 * f + (1 - f) * 0.8 * this.form;
    this.halo.scale.setScalar(2.6 + (1 - f) * 3);

    const ease = (key: keyof typeof this.k, on: boolean, rate: number) =>
      (this.k[key] += ((on ? 1 : 0) - this.k[key]) * Math.min(1, dt * rate));
    const swim = ease("swim", pose === "swim", 3);
    const air = ease("air", pose === "air", 7);
    const glide = ease("glide", pose === "glide", 3);
    const moving = pose === "walk" || pose === "glide" || (pose === "swim" && speed > 0.2);
    const amt = (this.k.move += ((moving ? Math.min(1, speed / 2.3) : 0) - this.k.move) * Math.min(1, dt * 5));
    this.phase += dt * (pose === "swim" ? 1.5 : 1.6 + speed * 1.15) * (moving ? 1 : 0.3);
    const p = this.phase;
    const s = Math.sin(p);
    const land = (1 - swim) * (1 - air * 0.6);

    // Target pose: [x, y, z] per joint.
    const T = {} as Record<Joint, [number, number, number]>;
    const kneeBend = (ph: number) => -(0.12 + 0.75 * Math.max(0, Math.sin(ph + 1.3))) * amt;
    const idleDrift = reduced ? 0 : 1;
    T.hipL = [s * 0.5 * amt * land * (1 - glide * 0.4) - air * 0.7, 0, -0.02];
    T.hipR = [-s * 0.5 * amt * land * (1 - glide * 0.4) - air * 0.25, 0, 0.02];
    T.kneeL = [kneeBend(p) * land - air * 0.9 - 0.06, 0, 0];
    T.kneeR = [kneeBend(p + Math.PI) * land - air * 0.4 - 0.06, 0, 0];
    const armSwing = -s * 0.42 * amt * land;
    const drift = Math.sin(t * 0.7) * 0.05 * idleDrift;
    T.shL = [armSwing - glide * 0.45 + air * 0.5, 0, -0.14 - drift - glide * 0.55 - air * 0.4];
    T.shR = [-armSwing - glide * 0.45 + air * 0.5, 0, 0.14 + drift + glide * 0.55 + air * 0.4];
    T.elL = [0.22 + 0.25 * amt * Math.max(0, -s) + glide * 0.1, 0, 0];
    T.elR = [0.22 + 0.25 * amt * Math.max(0, s) + glide * 0.1, 0, 0];
    T.spine = [0.05 * amt + glide * 0.12, s * 0.14 * amt, Math.sin(p * 0.5) * 0.03 * amt + Math.sin(t * 0.4) * 0.02 * idleDrift * (1 - amt)];
    T.neck = [-0.05 * amt - glide * 0.1, -s * 0.08 * amt + Math.sin(t * 0.23) * 0.2 * idleDrift * (1 - amt), 0];
    if (swim > 0.01) {
      // Breaststroke, slow and buoyant: arms reach, part and sweep; legs flutter.
      const sw = p * 1.1;
      const reach = 0.5 + 0.5 * Math.sin(sw);
      const mix = (a: [number, number, number], b: [number, number, number]) => a.map((v, i) => v * (1 - swim) + b[i] * swim) as [number, number, number];
      // arms reach ahead, then part and sweep down through the water
      T.shL = mix(T.shL, [-2.9 - (1 - reach) * 1.0, 0, -0.25 - (1 - reach) * 0.7]);
      T.shR = mix(T.shR, [-2.9 - (1 - reach) * 1.0, 0, 0.25 + (1 - reach) * 0.7]);
      T.elL = mix(T.elL, [0.1 + (1 - reach) * 0.7, 0, 0]);
      T.elR = mix(T.elR, [0.1 + (1 - reach) * 0.7, 0, 0]);
      T.hipL = mix(T.hipL, [Math.sin(sw * 2) * 0.25, 0, -0.05]);
      T.hipR = mix(T.hipR, [-Math.sin(sw * 2) * 0.25, 0, 0.05]);
      T.kneeL = mix(T.kneeL, [-0.2 - Math.max(0, Math.sin(sw * 2)) * 0.3, 0, 0]);
      T.kneeR = mix(T.kneeR, [-0.2 - Math.max(0, -Math.sin(sw * 2)) * 0.3, 0, 0]);
      T.neck = mix(T.neck, [0.9, 0, 0]); // look ahead while lying in the water
    }
    // Every joint eases toward its target: follow-through instead of snapping.
    const rate = Math.min(1, dt * 11);
    for (const key of Object.keys(T) as Joint[]) {
      const c = this.cur[key];
      const tg = T[key];
      c.x += (tg[0] - c.x) * rate;
      c.y += (tg[1] - c.y) * rate;
      c.z += (tg[2] - c.z) * rate;
      this.j[key].rotation.set(c.x, c.y, c.z);
    }

    // Whole body: lean, bob, float, swim.
    const bob = Math.abs(Math.cos(p)) * 0.045 * amt * land;
    const breathe = reduced ? 0 : Math.sin(t * 0.63);
    this.pelvis.rotation.x = -swim * 1.2 - glide * 0.1;
    this.pelvis.rotation.y = -s * 0.07 * amt;
    this.pelvis.position.set(Math.sin(t * 0.4) * 0.015 * idleDrift * (1 - amt), 0.95 - 0.04 * amt * land + bob - swim * 0.08 + breathe * 0.006, swim * 0.3);
    this.chest.scale.set(1 + breathe * 0.012, 1, 0.72 + breathe * 0.01);
    bodyUniforms.uPulse.value = 1 + 0.12 * breathe + glide * 0.2;

    this.halo.position.y = 1.15 + swim * 0.3;
    this.halo.scale.multiplyScalar(1 - swim * 0.45);
    this.light.intensity = 6 + glide * 2;

    this.root.updateMatrixWorld(true);
    this.flowSpeed += ((moving ? speed : 0) - this.flowSpeed) * Math.min(1, dt * 2);
    this.motes.update(dt, reduced ? t * 0.5 : t, this.flowSpeed, dpr);
  }

  /** The wanderer gathers out of light (0) at the start. */
  setForm(v: number): void {
    this.form = v;
    this.motes.reset();
  }
}
