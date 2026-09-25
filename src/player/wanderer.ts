/* The wanderer: a body of flowing light.
   - A smoothly deforming, motion-captured figure (Mixamo "X Bot", featureless and androgynous)
     animated with blended idle / walk / run cycles, paced to the actual speed.
   - The body is drawn as light: a translucent core crossed by fine, flowing currents (like the
     linework of the drawings), a bright silhouette, and a soft outer aura that breathes.
   - Motes ride the moving skin and stream behind; ribbons of light trail from the hands and crown.
   - Swimming is a slow breaststroke laid over the rig, blended in and out. */
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { loadBytes } from "../core/assets";

export type Pose = "idle" | "walk" | "glide" | "swim" | "air";

const HEIGHT = 1.65;
const WALK_NATURAL = 1.3; // metres per second the walk cycle covers at timeScale 1 (after scaling)
const RUN_NATURAL = 3.5;

const U = {
  uT: { value: 0 },
  uForm: { value: 0 },
  uPulse: { value: 1 },
  uWobble: { value: 0.006 },
};

const NOISE = /* glsl */ `
float h13(vec3 p){p=fract(p*0.3183099+0.1);p*=17.0;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}
float vnoise(vec3 x){vec3 i=floor(x);vec3 f=fract(x);f=f*f*(3.0-2.0*f);
  return mix(mix(mix(h13(i),h13(i+vec3(1,0,0)),f.x),mix(h13(i+vec3(0,1,0)),h13(i+vec3(1,1,0)),f.x),f.y),
             mix(mix(h13(i+vec3(0,0,1)),h13(i+vec3(1,0,1)),f.x),mix(h13(i+vec3(0,1,1)),h13(i+vec3(1,1,1)),f.x),f.y),f.z);}
`;

const SKIN_VERT_HEAD = /* glsl */ `
#include <common>
#include <skinning_pars_vertex>
uniform float uT,uWobble;
varying vec3 vN;varying vec3 vW;varying vec3 vL;
${NOISE}
`;
const SKIN_VERT_BODY = /* glsl */ `
  #include <beginnormal_vertex>
  #include <skinbase_vertex>
  #include <skinnormal_vertex>
  #include <begin_vertex>
  #include <skinning_vertex>
  vec3 n=normalize(objectNormal);
  vL=position*0.01; // rest-pose coordinates (the rig is in centimetres): patterns stay on the body
`;

function bodyMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: U,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `${SKIN_VERT_HEAD}
      void main(){
        ${SKIN_VERT_BODY}
        float w=vnoise(vL*9.0+vec3(0.0,-uT*0.8,uT*0.3))-0.5;
        transformed+=n*w*uWobble*100.0;
        vec4 wp=modelMatrix*vec4(transformed,1.0);
        vW=wp.xyz;vN=normalize(mat3(modelMatrix)*n);
        gl_Position=projectionMatrix*viewMatrix*wp;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uT,uForm,uPulse;
      varying vec3 vN;varying vec3 vW;varying vec3 vL;
      ${NOISE}
      void main(){
        vec3 v=normalize(cameraPosition-vW);
        float f=1.0-abs(dot(normalize(vN),v));
        float rim=pow(f,2.4);
        // currents: fine ridged lines of light flowing up through the body
        vec3 q=vL*7.0+vec3(0.0,-uT*0.55,0.0);
        float n1=vnoise(q+vec3(vnoise(q*0.7+uT*0.1)*1.8));
        float lines=pow(1.0-abs(n1*2.0-1.0),9.0);
        float n2=vnoise(vL*3.0+vec3(0.0,-uT*0.25,uT*0.12));
        float heart=exp(-pow(length(vL-vec3(0.0,1.35,0.05))*3.2,2.0)); // warmth at the heart
        vec3 gold=vec3(1.0,0.80,0.52);
        vec3 pearl=vec3(1.0,0.95,0.88);
        vec3 cyan=vec3(0.62,0.88,1.0);
        vec3 c=gold*(0.07+0.12*n2)                    // translucent core
              +pearl*lines*0.7*(0.4+0.6*n2)           // flowing linework
              +gold*heart*0.35
              +mix(pearl,cyan,0.55)*rim*1.1;           // luminous silhouette
        gl_FragColor=vec4(c*uForm*uPulse,1.0);
      }`,
  });
}

function auraMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: U,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.BackSide,
    vertexShader: /* glsl */ `${SKIN_VERT_HEAD}
      void main(){
        ${SKIN_VERT_BODY}
        float w=vnoise(vL*4.0+vec3(0.0,-uT*0.9,0.0));
        transformed+=n*(2.2+w*2.4); // an outer shell, a few centimetres out, breathing
        vec4 wp=modelMatrix*vec4(transformed,1.0);
        vW=wp.xyz;vN=normalize(mat3(modelMatrix)*n);
        gl_Position=projectionMatrix*viewMatrix*wp;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uForm,uPulse;
      varying vec3 vN;varying vec3 vW;
      void main(){
        vec3 v=normalize(cameraPosition-vW);
        float f=abs(dot(normalize(vN),v));
        float a=pow(f,1.5)*0.16; // soft, strongest toward the body, fading at the shell's edge
        gl_FragColor=vec4(vec3(1.0,0.86,0.66)*a*uForm*uPulse,1.0);
      }`,
  });
}

function glowTexture(): THREE.Texture {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, "rgba(255,236,205,0.8)");
  grd.addColorStop(0.3, "rgba(255,215,170,0.22)");
  grd.addColorStop(1, "rgba(255,200,160,0)");
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/* ---------- motes that ride the skin ---------- */
class SkinMotes {
  points: THREE.Points;
  private idx: Int32Array;
  private lift: Float32Array;
  private follow: Float32Array;
  private phase: Float32Array;
  private pos: Float32Array;
  private alpha: Float32Array;
  private started = false;
  private v = new THREE.Vector3();
  private mat: THREE.ShaderMaterial;
  mesh: THREE.SkinnedMesh | null = null;

  constructor(private n: number) {
    this.idx = new Int32Array(n);
    this.lift = new Float32Array(n);
    this.follow = new Float32Array(n);
    this.phase = new Float32Array(n);
    this.pos = new Float32Array(n * 3);
    this.alpha = new Float32Array(n);
    const size = new Float32Array(n);
    const tint = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      this.follow[i] = Math.random() < 0.3 ? 1.2 + Math.random() * 2.5 : 10 + Math.random() * 14;
      this.phase[i] = Math.random();
      size[i] = 0.4 + Math.pow(Math.random(), 2) * 1.8;
      tint[i] = Math.random();
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute("aAlpha", new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute("aSize", new THREE.BufferAttribute(size, 1));
    g.setAttribute("aTint", new THREE.BufferAttribute(tint, 1));
    this.mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uDpr: { value: 1 }, uForm: U.uForm },
      vertexShader: /* glsl */ `attribute float aAlpha,aSize,aTint;uniform float uDpr;varying float vA;varying float vT;
        void main(){vec4 mv=modelViewMatrix*vec4(position,1.0);gl_Position=projectionMatrix*mv;
          gl_PointSize=clamp(aSize*uDpr*26.0/max(-mv.z,0.5),1.0,8.0*uDpr);vA=aAlpha;vT=aTint;}`,
      fragmentShader: /* glsl */ `uniform float uForm;varying float vA;varying float vT;
        void main(){float r=length(gl_PointCoord-0.5);float a=smoothstep(0.5,0.0,r)*vA*uForm;
          vec3 c=vT<0.65?vec3(1.0,0.88,0.66):vT<0.9?vec3(0.8,0.93,1.0):vec3(1.0,0.7,0.45);
          gl_FragColor=vec4(c*a*1.5,1.0);}`,
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
  }

  attach(mesh: THREE.SkinnedMesh): void {
    this.mesh = mesh;
    const count = (mesh.geometry.attributes.position as THREE.BufferAttribute).count;
    for (let i = 0; i < this.n; i++) this.respawn(i, count);
    this.started = false;
  }

  private respawn(i: number, count: number): void {
    this.idx[i] = Math.floor(Math.random() * count);
    this.lift[i] = 0;
  }

  update(dt: number, dpr: number, flow: number): void {
    const m = this.mesh;
    if (!m) return;
    this.mat.uniforms.uDpr.value = dpr;
    const count = (m.geometry.attributes.position as THREE.BufferAttribute).count;
    const p = this.pos;
    for (let i = 0; i < this.n; i++) {
      // each mote lives a short while on the skin, rises a little off it, then is reborn elsewhere
      this.phase[i] += dt * (0.35 + (i % 5) * 0.06 + flow * 0.08);
      let fresh = false;
      if (this.phase[i] >= 1) {
        this.phase[i] -= 1;
        this.respawn(i, count);
        fresh = true;
      }
      this.lift[i] += dt * 0.12;
      m.getVertexPosition(this.idx[i], this.v);
      this.v.applyMatrix4(m.matrixWorld);
      this.v.y += this.lift[i];
      const j = i * 3;
      if (!this.started || fresh) {
        p[j] = this.v.x;
        p[j + 1] = this.v.y;
        p[j + 2] = this.v.z;
      } else {
        const k = Math.min(1, dt * this.follow[i]);
        p[j] += (this.v.x - p[j]) * k;
        p[j + 1] += (this.v.y - p[j + 1]) * k;
        p[j + 2] += (this.v.z - p[j + 2]) * k;
      }
      const u = this.phase[i];
      this.alpha[i] = Math.min(1, u * 6) * Math.min(1, (1 - u) * 2.5) * (this.follow[i] < 5 ? 0.6 : 0.9);
    }
    this.started = true;
    const g = this.points.geometry;
    (g.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (g.attributes.aAlpha as THREE.BufferAttribute).needsUpdate = true;
  }
}

/* ---------- ribbons of light ---------- */
class Ribbon {
  mesh: THREE.Mesh;
  private pts: THREE.Vector3[] = [];
  private ages: number[] = [];
  private pos: Float32Array;
  private a: Float32Array;
  private side = new THREE.Vector3();
  private tan = new THREE.Vector3();
  private view = new THREE.Vector3();

  constructor(private max = 28, private width = 0.07) {
    this.pos = new Float32Array(max * 2 * 3);
    this.a = new Float32Array(max * 2);
    const edge = new Float32Array(max * 2);
    for (let i = 0; i < max; i++) {
      edge[i * 2] = -1;
      edge[i * 2 + 1] = 1;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute("aA", new THREE.BufferAttribute(this.a, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute("aE", new THREE.BufferAttribute(edge, 1));
    const index: number[] = [];
    for (let i = 0; i < max - 1; i++) {
      const k = i * 2;
      index.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
    }
    g.setIndex(index);
    this.mesh = new THREE.Mesh(
      g,
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        uniforms: { uForm: U.uForm },
        vertexShader: /* glsl */ `attribute float aA,aE;varying float vA;varying float vE;void main(){vA=aA;vE=aE;gl_Position=projectionMatrix*viewMatrix*vec4(position,1.0);}`,
        fragmentShader: /* glsl */ `uniform float uForm;varying float vA;varying float vE;void main(){
          float soft=pow(1.0-vE*vE,2.0);  // bright thread in the middle, feathered edges
          gl_FragColor=vec4(vec3(1.0,0.82,0.52)*vA*vA*soft*0.9*uForm,1.0);}`,
      }),
    );
    this.mesh.frustumCulled = false;
  }

  update(dt: number, head: THREE.Vector3, cam: THREE.Vector3, strength: number): void {
    for (let i = 0; i < this.ages.length; i++) this.ages[i] += dt;
    const last = this.pts[0];
    if (last && last.distanceTo(head) > 1.5) {
      this.pts.length = 0; // jumped (a restored save, a teleport): start the trail afresh
      this.ages.length = 0;
    }
    if (!this.pts[0] || this.pts[0].distanceTo(head) > 0.025) {
      this.pts.unshift(head.clone());
      this.ages.unshift(0);
      if (this.pts.length > this.max) {
        this.pts.pop();
        this.ages.pop();
      }
    } else {
      this.pts[0].copy(head);
      this.ages[0] = 0;
    }
    const n = this.pts.length;
    for (let i = 0; i < this.max; i++) {
      const pi = this.pts[Math.min(i, n - 1)];
      const pn = this.pts[Math.min(i + 1, n - 1)];
      this.tan.subVectors(pi, pn);
      if (this.tan.lengthSq() < 1e-8) this.tan.set(0, 1, 0);
      this.view.subVectors(cam, pi);
      this.side.crossVectors(this.tan, this.view).normalize();
      const u = i / (this.max - 1);
      const w = this.width * (1 - u) * (0.4 + 0.6 * strength);
      const alive = i < n ? Math.max(0, 1 - this.ages[i] / 0.9) : 0;
      const a = (1 - u) * alive * strength;
      const k = i * 6;
      this.pos[k] = pi.x + this.side.x * w;
      this.pos[k + 1] = pi.y + this.side.y * w;
      this.pos[k + 2] = pi.z + this.side.z * w;
      this.pos[k + 3] = pi.x - this.side.x * w;
      this.pos[k + 4] = pi.y - this.side.y * w;
      this.pos[k + 5] = pi.z - this.side.z * w;
      this.a[i * 2] = this.a[i * 2 + 1] = a;
    }
    const g = this.mesh.geometry;
    (g.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (g.attributes.aA as THREE.BufferAttribute).needsUpdate = true;
  }
}

/* ---------- the figure ---------- */
export class Wanderer {
  root = new THREE.Group(); // at the feet; rotation.y is the heading
  /** Everything drawn in world space (motes, ribbons): add to the scene. */
  fx = new THREE.Group();
  ready = false;
  private body = new THREE.Group(); // pitches forward to swim
  private bones: Record<string, THREE.Bone> = {};
  private mixer: THREE.AnimationMixer | null = null;
  private act: Partial<Record<"idle" | "walk" | "run", THREE.AnimationAction>> = {};
  private motes = new SkinMotes(420);
  private ribbons = [new Ribbon(30, 0.035), new Ribbon(30, 0.035), new Ribbon(22, 0.05)];
  private halo: THREE.Sprite;
  private light: THREE.PointLight;
  private k = { swim: 0, glide: 0, move: 0 };
  private form = 0;
  private flow = 0;
  private swimPhase = 0;
  private tmp = { a: new THREE.Vector3(), b: new THREE.Vector3(), q: new THREE.Quaternion(), q2: new THREE.Quaternion(), cam: new THREE.Vector3() };

  constructor(private camera: THREE.Camera) {
    this.root.add(this.body);
    this.halo = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: glowTexture(), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.35 }),
    );
    this.halo.scale.setScalar(2.4);
    this.halo.position.y = 1.1;
    this.root.add(this.halo);
    this.light = new THREE.PointLight(0xffdcb0, 6, 9, 1.6);
    this.light.position.y = 1.2;
    this.root.add(this.light);
    this.fx.add(this.motes.points, ...this.ribbons.map((r) => r.mesh));
  }

  async load(path: string): Promise<void> {
    const bytes = await loadBytes(path);
    if (!bytes) return;
    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
    const gltf = await loader.parseAsync(bytes, "");
    const model = gltf.scene;
    let skinned: THREE.SkinnedMesh | null = null;
    model.traverse((o) => {
      if ((o as THREE.SkinnedMesh).isSkinnedMesh) skinned = o as THREE.SkinnedMesh;
      if ((o as THREE.Bone).isBone) this.bones[o.name.replace(/^mixamorig:?/, "")] = o as THREE.Bone;
    });
    if (!skinned) return;
    const sk: THREE.SkinnedMesh = skinned;
    sk.material = bodyMaterial();
    sk.frustumCulled = false;
    const aura = new THREE.SkinnedMesh(sk.geometry, auraMaterial());
    aura.bind(sk.skeleton, sk.bindMatrix);
    aura.frustumCulled = false;
    sk.parent!.add(aura);

    // Scale to height, face -z like the rest of the game.
    model.rotation.y = Math.PI;
    model.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(model);
    const h = box.max.y - box.min.y || 1.8;
    model.scale.setScalar(HEIGHT / h);
    this.body.add(model);

    this.mixer = new THREE.AnimationMixer(model);
    for (const name of ["idle", "walk", "run"] as const) {
      const clip = gltf.animations.find((a) => a.name === name);
      if (!clip) continue;
      const a = this.mixer.clipAction(clip);
      a.setEffectiveWeight(name === "idle" ? 1 : 0);
      a.play();
      this.act[name] = a;
    }
    this.motes.attach(sk);
    this.ready = true;
  }

  /** Aim a bone so that its child points along a direction given in the body's frame. */
  private aim(bone: THREE.Bone | undefined, dirBody: THREE.Vector3, w: number): void {
    if (!bone || !bone.parent || w < 0.001) return;
    const child = bone.children.find((c) => (c as THREE.Bone).isBone);
    if (!child) return;
    const { a, b, q, q2 } = this.tmp;
    this.body.getWorldQuaternion(q);
    a.copy(dirBody).normalize().applyQuaternion(q);
    bone.parent.getWorldQuaternion(q2);
    a.applyQuaternion(q2.invert());
    b.copy(child.position).normalize();
    q.setFromUnitVectors(b, a);
    bone.quaternion.slerp(q, w);
    bone.updateMatrixWorld(true);
  }

  animate(dt: number, pose: Pose, speed: number, t: number, reduced: boolean, dpr = 1): void {
    U.uT.value = reduced ? t * 0.4 : t;
    U.uWobble.value = reduced ? 0.002 : 0.006;
    this.form = Math.min(1, this.form + dt / 2.5);
    const f = THREE.MathUtils.smoothstep(this.form, 0, 1);
    U.uForm.value = f;
    this.halo.material.opacity = 0.35 * f + (1 - f) * 0.8 * this.form;
    this.halo.scale.setScalar(2.4 + (1 - f) * 3);

    const ease = (key: keyof typeof this.k, target: number, rate: number) =>
      (this.k[key] += (target - this.k[key]) * Math.min(1, dt * rate));
    const swim = ease("swim", pose === "swim" ? 1 : 0, 2.5);
    const glide = ease("glide", pose === "glide" ? 1 : 0, 3);
    const moving = pose === "walk" || pose === "glide" || (pose === "swim" && speed > 0.2);
    const sp = ease("move", moving ? speed : 0, 6);

    if (this.mixer) {
      // Blend idle → walk → run by speed; pace the cycles to the ground speed.
      const land = 1 - swim;
      const wRun = THREE.MathUtils.smoothstep(sp, 2.2, 3.3);
      const wWalk = THREE.MathUtils.smoothstep(sp, 0.08, 0.9) * (1 - wRun);
      const wIdle = Math.max(0, 1 - wWalk - wRun);
      this.act.idle?.setEffectiveWeight(wIdle * land + swim);
      this.act.walk?.setEffectiveWeight(wWalk * land);
      this.act.run?.setEffectiveWeight(wRun * land);
      if (this.act.walk) this.act.walk.timeScale = THREE.MathUtils.clamp(sp / WALK_NATURAL, 0.55, 1.6);
      if (this.act.run) this.act.run.timeScale = THREE.MathUtils.clamp(sp / RUN_NATURAL, 0.6, 1.3);
      if (this.act.idle) this.act.idle.timeScale = reduced ? 0.5 : 0.8;
      this.mixer.update(dt);

      // Swimming: lie forward in the water and stroke slowly, laid over the rig.
      this.body.rotation.x = -swim * 1.25 - glide * 0.08;
      this.body.position.set(0, swim * 0.85, swim * 0.35);
      if (swim > 0.01) {
        this.root.updateMatrixWorld(true);
        this.swimPhase += dt * (0.7 + Math.min(speed, 3) * 0.35);
        const sweep = 0.5 - 0.5 * Math.sin(this.swimPhase * Math.PI); // 0: reaching ahead, 1: swept out and back
        const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
        for (const side of [-1, 1]) {
          const L = side < 0 ? "Left" : "Right";
          // Body frame: +y runs from feet to head (ahead while swimming), -z is the chest.
          this.aim(this.bones[`${L}Arm`], V(side * (0.25 + sweep * 0.9), 1 - sweep * 1.1, -0.15 - sweep * 0.4), swim);
          this.aim(this.bones[`${L}ForeArm`], V(side * (0.2 + sweep * 0.15), 1 - sweep * 0.8, -0.2 - sweep * 0.9), swim);
          const kick = Math.sin(this.swimPhase * Math.PI * 2 + (side < 0 ? 0 : Math.PI));
          this.aim(this.bones[`${L}UpLeg`], V(side * 0.12, -1, kick * 0.18), swim);
          this.aim(this.bones[`${L}Leg`], V(side * 0.1, -1, 0.15 + Math.max(0, kick) * 0.35), swim);
        }
        this.aim(this.bones.Neck, V(0, 0.8, 0.6), swim); // head up, looking ahead
      }
    }

    const breathe = reduced ? 0 : Math.sin(t * 0.63);
    U.uPulse.value = 1 + 0.1 * breathe + glide * 0.2;
    this.halo.position.y = 1.1 + swim * 0.2;
    this.halo.scale.multiplyScalar(1 - swim * 0.4);
    this.halo.material.opacity *= 1 - swim; // the water would slice it into a box
    this.light.intensity = 6 + glide * 2;

    this.root.updateMatrixWorld(true);
    this.flow += ((moving ? speed : 0) - this.flow) * Math.min(1, dt * 2);
    this.motes.update(dt, dpr, this.flow);

    // Ribbons trail from the hands and the crown, stronger in motion.
    const cam = this.tmp.cam.copy(this.camera.position);
    const strength = Math.min(1, 0.25 + this.flow * 0.4) * f;
    [this.bones.LeftHand, this.bones.RightHand, this.bones.HeadTop_End].forEach((b, i) => {
      if (!b) return;
      b.getWorldPosition(this.tmp.a);
      this.ribbons[i].update(dt, this.tmp.a, cam, i === 2 ? strength * 0.7 : strength);
    });
  }

  setForm(v: number): void {
    this.form = v;
  }
}
