/* Creatures of light: second density, "turning toward the light" (Samuel's handbook, the
   bestiary). Drawn round and flowing like the rest of the living world, with no stiff joints:
   - Deer: herds grazing across the meadows, antlers curling into spirals. Running at them
     makes them drift away. When the wanderer turns inward in stillness, they come close and
     stand with it.
   - Hoppers: small round creatures that bound through the grass.
   - Birds: flocks of light wheeling overhead, wings beating slowly.
   Nothing here can be harmed or harm; they are company. */
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { IJ_FOG_GLSL } from "./fog";
import { groundKind, heightAt, WATER_Y } from "./terrain";

function hash(i: number, j: number, s: number): number {
  const v = Math.sin(i * 127.1 + j * 311.7 + s * 74.7) * 43758.5453;
  return v - Math.floor(v);
}

/** Their light: bright along the silhouette, a soft glow inside, sitting in the haze. */
function creatureMaterial(tint: THREE.Color): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uC: { value: tint }, uK: { value: 1 } },
    // One draw for a whole herd: each vertex knows its part (aPart: 0 body, 1 head, 2–5 legs) and
    // the pivot it turns about; each creature passes its gait, stride and grazing (aAnim).
    vertexShader: /* glsl */ `attribute float aPart;attribute vec3 aPivot;attribute vec3 aAnim;varying vec3 vN;varying vec3 vW;
      vec3 rotX(vec3 p,vec3 o,float a){p-=o;float c=cos(a),s=sin(a);return vec3(p.x,p.y*c-p.z*s,p.y*s+p.z*c)+o;}
      void main(){
        vec3 p=position;vec3 n=normal;
        if(aPart>0.5&&aPart<1.5){p=rotX(p,aPivot,-aAnim.z);n=rotX(n,vec3(0.0),-aAnim.z);}
        else if(aPart>1.5){float ph=(aPart<2.5||aPart>4.5)?0.0:3.14159;float a=sin(aAnim.x+ph)*aAnim.y;p=rotX(p,aPivot,a);n=rotX(n,vec3(0.0),a);}
        mat4 m=modelMatrix*instanceMatrix;
        vec4 w=m*vec4(p,1.0);vW=w.xyz;vN=normalize(mat3(m)*n);gl_Position=projectionMatrix*viewMatrix*w;}`,
    fragmentShader: /* glsl */ `varying vec3 vN;varying vec3 vW;uniform vec3 uC;uniform float uK;
      ${IJ_FOG_GLSL}
      void main(){vec3 v=normalize(cameraPosition-vW);float f=1.0-abs(dot(normalize(vN),v));
        vec4 fg=ijFog(vW);
        gl_FragColor=vec4(uC*(0.12+pow(f,2.0)*1.1)*uK*(1.0-fg.a),1.0);}`,
  });
}

/* ---------------------------------------------------------------- deer */
interface Deer {
  p: THREE.Vector3;
  heading: number;
  home: THREE.Vector3;
  goal: THREE.Vector3;
  speed: number;
  gait: number;
  graze: number;
  nextGoal: number;
  scale: number;
  stag: boolean;
  visible: boolean;
}

/** Merge parts into one geometry, each vertex tagged with its part and pivot. */
function assemble(parts: { g: THREE.BufferGeometry; part: number; pivot: THREE.Vector3 }[]): THREE.BufferGeometry {
  const gs = parts.map(({ g, part, pivot }) => {
    const x = g.index ? g.toNonIndexed() : g;
    const n = x.attributes.position.count;
    x.setAttribute("aPart", new THREE.Float32BufferAttribute(new Float32Array(n).fill(part), 1));
    const pv = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) pv.set([pivot.x, pivot.y, pivot.z], i * 3);
    x.setAttribute("aPivot", new THREE.Float32BufferAttribute(pv, 3));
    for (const k of Object.keys(x.attributes)) if (!["position", "normal", "aPart", "aPivot"].includes(k)) x.deleteAttribute(k);
    return x;
  });
  return mergeGeometries(gs)!;
}

function deerGeometry(antlers: boolean): THREE.BufferGeometry {
  const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  const parts: { g: THREE.BufferGeometry; part: number; pivot: THREE.Vector3 }[] = [];
  parts.push({ g: new THREE.SphereGeometry(0.34, 20, 14).scale(0.85, 0.8, 1.7).translate(0, 0.95, 0), part: 0, pivot: V(0, 0, 0) });
  const headPivot = V(0, 1.12, -0.45);
  const head = (g: THREE.BufferGeometry) => parts.push({ g: g.translate(headPivot.x, headPivot.y, headPivot.z), part: 1, pivot: headPivot });
  head(new THREE.CapsuleGeometry(0.1, 0.42, 4, 10).rotateX(-0.45).translate(0, 0.2, -0.08));
  head(new THREE.SphereGeometry(0.13, 16, 12).scale(0.85, 0.85, 1.55).rotateX(0.35).translate(0, 0.43, -0.22));
  for (const s of [-1, 1]) {
    head(new THREE.SphereGeometry(0.06, 10, 8).scale(0.5, 1.4, 0.3).rotateZ(s * 0.5).translate(s * 0.1, 0.55, -0.12));
    if (antlers) {
      // antlers: a sweeping curve that ends in a spiral curl, as the drawings do
      const pts: THREE.Vector3[] = [];
      for (let k = 0; k <= 40; k++) {
        const u = k / 40;
        const a = u * Math.PI * 1.6;
        const r = 0.34 * (1 - u * 0.75);
        pts.push(V(s * (0.06 + Math.sin(a) * r * 0.9), 0.55 + (1 - Math.cos(a)) * r * 0.9 + u * 0.12, -0.1 + Math.sin(a * 0.5) * 0.12));
      }
      head(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, 0.018, 5, false));
    }
  }
  [[-0.16, -0.4], [0.16, -0.4], [-0.16, 0.42], [0.16, 0.42]].forEach(([x, z], k) => {
    parts.push({ g: new THREE.CapsuleGeometry(0.045, 0.78, 4, 8).translate(x, 0.49, z), part: 2 + k, pivot: V(x, 0.95, z) });
  });
  return assemble(parts);
}

const UP = new THREE.Vector3(0, 1, 0);
const SCALE = new THREE.Vector3(1, 1, 1);

/* ---------------------------------------------------------------- hoppers */
interface Hopper {
  p: THREE.Vector3;
  visible: boolean;
  lift: number;
  dir: number;
  hopT: number;
  rest: number;
}

export class Creatures {
  group = new THREE.Group();
  private deer: Deer[] = [];
  private hoppers: Hopper[] = [];
  private herds: THREE.InstancedMesh[] = []; // does, stags
  private hopMesh: THREE.InstancedMesh;
  private anim: THREE.InstancedBufferAttribute[] = [];
  private birds: THREE.InstancedMesh;
  private birdState: { p: THREE.Vector3; v: THREE.Vector3; flock: number; phase: number }[] = [];
  private uT = { value: 0 };
  private herdAt = new THREE.Vector3(1e9, 0, 0);
  private m4 = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private tmp = new THREE.Vector3();

  constructor(deerCount = 12, hopperCount = 14, birdCount = 42) {
    for (const stag of [false, true]) {
      const n = stag ? Math.ceil(deerCount / 4) : deerCount - Math.ceil(deerCount / 4);
      const geo = deerGeometry(stag);
      const anim = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3);
      anim.setUsage(THREE.DynamicDrawUsage);
      geo.setAttribute("aAnim", anim);
      const m = new THREE.InstancedMesh(geo, creatureMaterial(stag ? new THREE.Color(1.0, 0.86, 0.64) : new THREE.Color(0.85, 0.92, 1.0)), n);
      m.frustumCulled = false;
      m.count = 0;
      this.herds.push(m);
      this.anim.push(anim);
      this.group.add(m);
      for (let i = 0; i < n; i++)
        this.deer.push({ p: new THREE.Vector3(), heading: Math.random() * 6.28, home: new THREE.Vector3(), goal: new THREE.Vector3(), speed: 0, gait: Math.random() * 6, graze: 0, nextGoal: 0, scale: stag ? 1.1 : 0.85 + Math.random() * 0.15, stag, visible: false });
    }
    const hp = [
      { g: new THREE.SphereGeometry(0.16, 14, 10).scale(1, 0.9, 1.25).translate(0, 0.16, 0), part: 0, pivot: new THREE.Vector3() },
      { g: new THREE.SphereGeometry(0.09, 12, 10).translate(0, 0.3, -0.14), part: 0, pivot: new THREE.Vector3() },
      ...[-1, 1].map((s) => ({ g: new THREE.SphereGeometry(0.04, 8, 8).scale(0.5, 2.6, 0.4).rotateZ(s * 0.2).translate(s * 0.04, 0.45, -0.1), part: 0, pivot: new THREE.Vector3() })),
    ];
    const hg = assemble(hp);
    hg.setAttribute("aAnim", new THREE.InstancedBufferAttribute(new Float32Array(hopperCount * 3), 3));
    this.hopMesh = new THREE.InstancedMesh(hg, creatureMaterial(new THREE.Color(1.0, 0.9, 0.78)), hopperCount);
    this.hopMesh.frustumCulled = false;
    this.group.add(this.hopMesh);
    for (let i = 0; i < hopperCount; i++) this.hoppers.push({ p: new THREE.Vector3(), visible: false, lift: 0, dir: Math.random() * 6.28, hopT: 0, rest: Math.random() * 3 });
    // birds: two curved wings of light, beating (in the vertex shader)
    const wing = new THREE.BufferGeometry();
    const wp: number[] = [], wi: number[] = [];
    for (const s of [-1, 1]) {
      const base = wp.length / 3;
      wp.push(0, 0, -0.12, 0, 0, 0.1);
      for (let k = 1; k <= 6; k++) {
        const u = k / 6;
        wp.push(s * u * 0.75, Math.sin(u * Math.PI) * 0.06, -0.08 + u * 0.1, s * u * 0.75, Math.sin(u * Math.PI) * 0.06, 0.1 - u * 0.02);
        const v = base + k * 2;
        wi.push(v - 2, v, v - 1, v - 1, v, v + 1);
      }
    }
    wing.setAttribute("position", new THREE.Float32BufferAttribute(wp, 3));
    wing.setIndex(wi);
    wing.computeVertexNormals();
    this.birds = new THREE.InstancedMesh(
      wing,
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        uniforms: { uT: this.uT },
        vertexShader: /* glsl */ `uniform float uT;varying float vX;varying vec3 vW;
          void main(){vec3 p=position;float ph=fract(sin(dot(instanceMatrix[3].xz,vec2(12.9,78.2)))*437.5)*6.28;
            p.y+=sin(uT*5.0+ph)*abs(p.x)*0.7;vX=abs(p.x);
            vec4 w=modelMatrix*instanceMatrix*vec4(p,1.0);vW=w.xyz;gl_Position=projectionMatrix*viewMatrix*w;}`,
        fragmentShader: /* glsl */ `varying float vX;varying vec3 vW;${IJ_FOG_GLSL}
          void main(){vec4 fg=ijFog(vW);gl_FragColor=vec4(vec3(1.0,0.92,0.8)*(0.35+vX*0.9)*(1.0-fg.a),1.0);}`,
      }),
      birdCount,
    );
    this.birds.frustumCulled = false;
    for (let i = 0; i < birdCount; i++) this.birdState.push({ p: new THREE.Vector3(), v: new THREE.Vector3(), flock: i % 3, phase: Math.random() * 6 });
    this.group.add(this.birds);
  }

  /** Find open meadow near a point, for a herd to graze on. */
  private meadowNear(x: number, z: number, seed: number): THREE.Vector3 | null {
    for (let k = 0; k < 24; k++) {
      const a = hash(seed, k, 1) * 6.28, r = 25 + hash(seed, k, 2) * 60;
      const px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
      const h = heightAt(px, pz);
      if (h > WATER_Y + 0.6 && h < 30 && groundKind(px, pz, h).stone < 0.3) return new THREE.Vector3(px, h, pz);
    }
    return null;
  }

  /** `still`: 0–1, the wanderer's stillness. `rushing`: running or gliding. */
  update(t: number, dt: number, player: THREE.Vector3, still: number, rushing: boolean, reduced: boolean): void {
    this.uT.value = reduced ? t * 0.5 : t;
    // herds settle somewhere new when the wanderer has travelled far
    if (player.distanceTo(this.herdAt) > 140) {
      this.herdAt.copy(player);
      const herds = [0, 1, 2].map((h) => this.meadowNear(player.x, player.z, Math.floor(t) * 7 + h));
      this.deer.forEach((d, i) => {
        const home = herds[i % 3];
        d.visible = !!home;
        if (!home) return;
        d.home.copy(home);
        d.p.set(home.x + (Math.random() - 0.5) * 10, 0, home.z + (Math.random() - 0.5) * 10);
        d.goal.copy(d.p);
      });
      this.hoppers.forEach((hp) => {
        const a = Math.random() * 6.28, r = 10 + Math.random() * 30;
        hp.p.set(player.x + Math.cos(a) * r, 0, player.z + Math.sin(a) * r);
      });
    }
    const count = [0, 0];
    for (const d of this.deer) {
      if (!d.visible) continue;
      const toP = Math.hypot(player.x - d.p.x, player.z - d.p.z);
      d.nextGoal -= dt;
      if (still > 0.4 && toP < 45) {
        // drawn to the stillness: come close, and stand facing the wanderer
        const a = Math.atan2(d.p.z - player.z, d.p.x - player.x);
        d.goal.set(player.x + Math.cos(a) * (3.2 + (d.scale - 0.85) * 4), 0, player.z + Math.sin(a) * (3.2 + (d.scale - 0.85) * 4));
      } else if (rushing && toP < 12) {
        // startled a little: drift away
        const a = Math.atan2(d.p.z - player.z, d.p.x - player.x);
        d.goal.set(d.p.x + Math.cos(a) * 14, 0, d.p.z + Math.sin(a) * 14);
        d.nextGoal = 4;
      } else if (d.nextGoal <= 0) {
        d.goal.set(d.home.x + (Math.random() - 0.5) * 18, 0, d.home.z + (Math.random() - 0.5) * 18);
        d.nextGoal = 6 + Math.random() * 10;
      }
      const dx = d.goal.x - d.p.x, dz = d.goal.z - d.p.z;
      const dist = Math.hypot(dx, dz);
      const want = dist > 0.5 ? Math.min(rushing && toP < 12 ? 4 : 1.1, dist * 0.6) : 0;
      d.speed += (want - d.speed) * Math.min(1, dt * 1.5);
      if (dist > 0.3) {
        const h = Math.atan2(-dx, -dz);
        d.heading += Math.atan2(Math.sin(h - d.heading), Math.cos(h - d.heading)) * Math.min(1, dt * 2);
      } else if (still > 0.4) {
        const h = Math.atan2(-(player.x - d.p.x), -(player.z - d.p.z));
        d.heading += Math.atan2(Math.sin(h - d.heading), Math.cos(h - d.heading)) * Math.min(1, dt * 1.2);
      }
      d.p.x -= Math.sin(d.heading) * d.speed * dt;
      d.p.z -= Math.cos(d.heading) * d.speed * dt;
      const g = heightAt(d.p.x, d.p.z);
      if (g < WATER_Y + 0.2) {
        d.goal.copy(d.home);
        d.nextGoal = 5;
      }
      d.p.y = Math.max(g, WATER_Y);
      // the gait: legs swing in diagonal pairs; grazing lowers the head
      d.gait += dt * d.speed * 4.2;
      const grazing = d.speed < 0.2 && still < 0.3 ? 0.5 + 0.5 * Math.sin(t * 0.25 + d.scale * 20) : 0;
      d.graze += (grazing - d.graze) * Math.min(1, dt * 1.5);
      const k = d.stag ? 1 : 0, n = count[k]++;
      const lift = Math.abs(Math.sin(d.gait)) * 0.03 * Math.min(1, d.speed);
      this.m4.compose(this.tmp.set(d.p.x, d.p.y + lift, d.p.z), this.q.setFromAxisAngle(UP, d.heading), SCALE.setScalar(d.scale));
      this.herds[k].setMatrixAt(n, this.m4);
      this.anim[k].setXYZ(n, d.gait, Math.min(1, d.speed) * 0.5, d.graze * 1.1 - (still > 0.4 ? 0.1 : 0));
    }
    this.herds.forEach((m, k) => {
      m.count = count[k];
      m.instanceMatrix.needsUpdate = true;
      this.anim[k].needsUpdate = true;
    });
    for (const hp of this.hoppers) {
      const toP = Math.hypot(player.x - hp.p.x, player.z - hp.p.z);
      if (toP > 60) {
        const a = Math.random() * 6.28, r = 15 + Math.random() * 30;
        hp.p.set(player.x + Math.cos(a) * r, 0, player.z + Math.sin(a) * r);
      }
      const g = heightAt(hp.p.x, hp.p.z);
      hp.visible = g > WATER_Y + 0.3 && groundKind(hp.p.x, hp.p.z, g).meadow > 0.1;
      if (!hp.visible) {
        hp.p.x += 3;
        continue;
      }
      hp.rest -= dt;
      if (hp.rest <= 0 && hp.hopT <= 0) {
        hp.hopT = 0.45;
        hp.dir = rushing && toP < 8 ? Math.atan2(-(player.x - hp.p.x), -(player.z - hp.p.z)) + Math.PI : hp.dir + (Math.random() - 0.5) * 1.6;
        hp.rest = 0.4 + Math.random() * (still > 0.4 ? 0.6 : 2.5);
      }
      let lift = 0;
      if (hp.hopT > 0) {
        hp.hopT -= dt;
        const u = 1 - hp.hopT / 0.45;
        lift = Math.sin(u * Math.PI) * 0.35;
        hp.p.x -= Math.sin(hp.dir) * dt * 2.2;
        hp.p.z -= Math.cos(hp.dir) * dt * 2.2;
      }
      hp.lift = lift;
    }
    let nh = 0;
    for (const hp of this.hoppers) {
      if (!hp.visible) continue;
      this.m4.compose(this.tmp.set(hp.p.x, heightAt(hp.p.x, hp.p.z) + hp.lift, hp.p.z), this.q.setFromAxisAngle(UP, hp.dir), SCALE.setScalar(1));
      this.hopMesh.setMatrixAt(nh++, this.m4);
    }
    this.hopMesh.count = nh;
    this.hopMesh.instanceMatrix.needsUpdate = true;
    // birds: loose flocks wheeling in wide circles above the wanderer
    this.birdState.forEach((b, i) => {
      if (b.p.lengthSq() === 0 || b.p.distanceTo(player) > 260) b.p.set(player.x + (Math.random() - 0.5) * 80, player.y + 25 + Math.random() * 20, player.z + (Math.random() - 0.5) * 80);
      const a = t * (0.09 + b.flock * 0.02) + b.flock * 2.1;
      const r = 40 + b.flock * 22;
      this.tmp.set(
        player.x + Math.cos(a) * r + Math.sin(i * 1.3) * 5,
        Math.max(heightAt(b.p.x, b.p.z), WATER_Y) + 22 + b.flock * 9 + Math.sin(t * 0.3 + b.phase) * 4,
        player.z + Math.sin(a) * r + Math.cos(i * 2.1) * 5,
      );
      b.v.addScaledVector(this.tmp.sub(b.p), dt * 0.35).multiplyScalar(1 - dt * 0.25);
      b.p.addScaledVector(b.v, dt);
      const dir = this.tmp.copy(b.v).normalize();
      this.q.setFromUnitVectors(new THREE.Vector3(0, 0, -1), dir.lengthSq() > 0 ? dir : new THREE.Vector3(0, 0, -1));
      this.m4.compose(b.p, this.q, new THREE.Vector3(1.4, 1.4, 1.4));
      this.birds.setMatrixAt(i, this.m4);
    });
    this.birds.instanceMatrix.needsUpdate = true;
  }
}
