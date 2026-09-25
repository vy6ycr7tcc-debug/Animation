/* Below the water: a luminous sea floor. It is only drawn when the wanderer is in the water.
   - Sea-ribbons: tall plants that sway, with light pulsing up to their tips.
   - Anemones: clusters of soft lights on the floor, breathing.
   - Jellyfish: bells of light that pulse and drift, trailing tentacles.
   - Fish: schools of small glowing fish that swim around you.
   - The look under the surface: deep teal haze, shafts of moonlight from above
     (UnderwaterEffect), and the bright window of the sky overhead (in water.ts). */
import * as THREE from "three";
import { BlendFunction, Effect, EffectAttribute } from "postprocessing";
import { heightAt, WATER_Y } from "./terrain";

/* ---------------------------------------------------------------- the look under the surface */
export class UnderwaterEffect extends Effect {
  constructor() {
    super(
      "Underwater",
      /* glsl */ `
      uniform float uT;
      void mainImage(const in vec4 inputColor,const in vec2 uv,const in float depth,out vec4 outputColor){
        float d=depth>=0.9999?80.0:-getViewZ(depth);
        vec3 water=vec3(0.015,0.075,0.11);
        float f=1.0-exp(-d*0.055);
        vec3 c=mix(inputColor.rgb*vec3(0.55,0.88,1.0),water,f);
        // moonlight falling through the surface in slow, wavering shafts
        float x=uv.x*7.0+sin(uv.y*3.0+uT*0.25)*0.6;
        float shafts=pow(max(0.0,sin(x*3.1+uT*0.35)*sin(x*1.7-uT*0.2)),6.0);
        c+=vec3(0.35,0.75,0.85)*shafts*smoothstep(0.1,1.0,uv.y)*0.16*(1.0-f*0.6);
        c*=1.0-0.4*pow(length(uv-0.5)*1.3,2.0);
        outputColor=vec4(c,inputColor.a);
      }`,
      { attributes: EffectAttribute.DEPTH, blendFunction: BlendFunction.NORMAL, uniforms: new Map([["uT", new THREE.Uniform(0)]]) },
    );
  }
  set time(t: number) {
    (this.uniforms.get("uT") as THREE.Uniform).value = t;
  }
}

/* ---------------------------------------------------------------- life */
const TILE = 14;
const RING = 3;
const RIBBONS_PER_TILE = 26;

function hash(i: number, j: number, s: number): number {
  const v = Math.sin(i * 127.1 + j * 311.7 + s * 74.7) * 43758.5453;
  return v - Math.floor(v);
}

export class SeaLife {
  group = new THREE.Group();
  private uT = { value: 0 };
  private ribbons: THREE.Mesh;
  private rGeo: THREE.InstancedBufferGeometry;
  private rBase: THREE.InstancedBufferAttribute;
  private rParams: THREE.InstancedBufferAttribute;
  private glowPts: THREE.Points;
  private jellies: THREE.InstancedMesh;
  private jellyState: { p: THREE.Vector3; v: THREE.Vector3; phase: number; s: number }[] = [];
  private fish: THREE.Points;
  private fishState: { p: THREE.Vector3; v: THREE.Vector3; school: number }[] = [];
  private cx = Infinity;
  private cz = Infinity;
  private m4 = new THREE.Matrix4();
  private tmp = new THREE.Vector3();

  constructor() {
    // sea-ribbons: a tall, narrow strip, swaying; uv.y 0 at the root, 1 at the tip
    const seg = 8;
    const pos: number[] = [], uv: number[] = [], idx: number[] = [];
    for (let k = 0; k <= seg; k++) {
      const y = k / seg;
      const w = 0.07 * (1 - y * 0.6);
      pos.push(-w, y, 0, w, y, 0);
      uv.push(0, y, 1, y);
      if (k < seg) idx.push(k * 2, k * 2 + 2, k * 2 + 1, k * 2 + 1, k * 2 + 2, k * 2 + 3);
    }
    this.rGeo = new THREE.InstancedBufferGeometry();
    this.rGeo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    this.rGeo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    this.rGeo.setIndex(idx);
    const max = RIBBONS_PER_TILE * (RING * 2 + 1) ** 2;
    this.rBase = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3);
    this.rParams = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3); // height, rotation, hue
    this.rGeo.setAttribute("aBase", this.rBase);
    this.rGeo.setAttribute("aParams", this.rParams);
    this.rGeo.instanceCount = 0;
    this.ribbons = new THREE.Mesh(
      this.rGeo,
      new THREE.ShaderMaterial({
        side: THREE.DoubleSide,
        uniforms: { uT: this.uT },
        vertexShader: /* glsl */ `
          attribute vec3 aBase;attribute vec3 aParams;uniform float uT;varying vec2 vUv;varying float vHue;varying float vD;
          void main(){
            vec3 p=position;p.y*=aParams.x;
            float c=cos(aParams.y),s=sin(aParams.y);p=vec3(p.x*c,p.y,p.x*s);
            float y2=uv.y*uv.y;
            p.x+=sin(uT*0.6+aBase.x*0.3+uv.y*2.0)*0.35*y2*aParams.x*0.3;
            p.z+=cos(uT*0.5+aBase.z*0.3+uv.y*1.7)*0.3*y2*aParams.x*0.3;
            vec4 mv=viewMatrix*vec4(aBase+p,1.0);vD=-mv.z;
            vUv=uv;vHue=aParams.z;gl_Position=projectionMatrix*mv;
          }`,
        fragmentShader: /* glsl */ `
          varying vec2 vUv;varying float vHue;varying float vD;uniform float uT;
          void main(){
            float edge=1.0-abs(vUv.x*2.0-1.0);
            vec3 hue=mix(vec3(0.2,0.95,0.9),vec3(0.65,0.45,1.0),vHue);
            float pulse=pow(fract(vUv.y*1.5-uT*0.25+vHue*3.0),6.0);
            vec3 c=mix(vec3(0.01,0.04,0.05),hue*0.5,vUv.y)+hue*(pulse*2.2+pow(vUv.y,4.0)*1.8);
            c*=0.6+0.4*edge;
            gl_FragColor=vec4(c*(1.0-smoothstep(30.0,55.0,vD)),1.0);
          }`,
      }),
    );
    this.ribbons.frustumCulled = false;

    // anemones and floor lights
    const gmax = 900;
    const gg = new THREE.BufferGeometry();
    gg.setAttribute("position", new THREE.BufferAttribute(new Float32Array(gmax * 3), 3));
    gg.setAttribute("aK", new THREE.BufferAttribute(new Float32Array(gmax), 1));
    gg.setDrawRange(0, 0);
    this.glowPts = new THREE.Points(
      gg,
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: { uT: this.uT },
        vertexShader: /* glsl */ `attribute float aK;uniform float uT;varying float vA;varying vec3 vC;
          void main(){vec4 mv=viewMatrix*vec4(position,1.0);gl_Position=projectionMatrix*mv;
            vA=(0.55+0.45*sin(uT*(0.6+aK)+aK*40.0))*(1.0-smoothstep(25.0,50.0,-mv.z));
            vC=mix(vec3(0.3,1.0,0.85),vec3(1.0,0.5,0.8),step(0.6,aK));
            gl_PointSize=clamp(260.0*(0.2+aK*0.16)/max(-mv.z,0.5),2.0,56.0);}`,
        fragmentShader: /* glsl */ `varying float vA;varying vec3 vC;void main(){float r=length(gl_PointCoord-0.5)*2.0;
            gl_FragColor=vec4(vC*(exp(-r*r*4.0)*1.4+smoothstep(0.3,0.0,r)*2.2)*vA,1.0);}`,
      }),
    );
    this.glowPts.frustumCulled = false;

    // jellyfish: a bell and six trailing tentacles in one shape; aT: 0 on the bell, 0..1 down a tentacle
    const jp: number[] = [], jt: number[] = [], ji: number[] = [];
    const bell = new THREE.SphereGeometry(0.4, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2);
    const bp = bell.attributes.position.array as Float32Array;
    for (let i = 0; i < bp.length; i += 3) {
      jp.push(bp[i], bp[i + 1] * 0.8, bp[i + 2]);
      jt.push(0);
    }
    for (const k of bell.index!.array) ji.push(k);
    for (let t = 0; t < 6; t++) {
      const a = (t / 6) * Math.PI * 2, r = 0.25;
      const base = jp.length / 3;
      for (let k = 0; k <= 10; k++) {
        const u = k / 10;
        for (const sgn of [-1, 1]) {
          jp.push(Math.cos(a) * r + sgn * 0.02 * (1 - u), -u * 1.6, Math.sin(a) * r);
          jt.push(Math.max(0.01, u));
        }
        if (k < 10) ji.push(base + k * 2, base + k * 2 + 2, base + k * 2 + 1, base + k * 2 + 1, base + k * 2 + 2, base + k * 2 + 3);
      }
    }
    const jg = new THREE.BufferGeometry();
    jg.setAttribute("position", new THREE.Float32BufferAttribute(jp, 3));
    jg.setAttribute("aT", new THREE.Float32BufferAttribute(jt, 1));
    jg.setIndex(ji);
    jg.computeVertexNormals();
    this.jellies = new THREE.InstancedMesh(
      jg,
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        uniforms: { uT: this.uT },
        vertexShader: /* glsl */ `attribute float aT;uniform float uT;varying float vT;varying float vF;varying float vSeed;
          void main(){
            mat4 im=instanceMatrix;float seed=fract(im[3].x*0.37+im[3].z*0.11);vSeed=seed;
            float beat=sin(uT*1.6+seed*20.0);
            vec3 p=position;
            if(aT==0.0){p.xz*=1.0+beat*0.12;p.y*=1.0-beat*0.1;}
            else{p.x+=sin(uT*1.2+aT*5.0+seed*9.0)*0.12*aT;p.z+=cos(uT*1.0+aT*4.0+seed*7.0)*0.12*aT;}
            vec4 w=modelMatrix*im*vec4(p,1.0);
            vec3 n=normalize(mat3(modelMatrix*im)*normal);vec3 v=normalize(cameraPosition-w.xyz);
            vF=pow(1.0-abs(dot(n,v)),2.0);vT=aT;
            gl_Position=projectionMatrix*viewMatrix*w;}`,
        fragmentShader: /* glsl */ `varying float vT;varying float vF;varying float vSeed;uniform float uT;void main(){
            vec3 c=mix(vec3(1.0,0.55,0.85),vec3(0.45,0.85,1.0),step(0.5,vSeed));
            float a=vT==0.0?(0.25+vF*1.8):(1.0-vT)*1.0;
            gl_FragColor=vec4(c*a,1.0);}`,
      }),
      14,
    );
    this.jellies.frustumCulled = false;
    for (let i = 0; i < 14; i++) this.jellyState.push({ p: new THREE.Vector3(), v: new THREE.Vector3(), phase: Math.random() * 6, s: 0.6 + Math.random() * 0.9 });

    // fish: small glowing points in schools
    const nf = 72;
    const fg = new THREE.BufferGeometry();
    fg.setAttribute("position", new THREE.BufferAttribute(new Float32Array(nf * 3), 3).setUsage(THREE.DynamicDrawUsage));
    const fk = new Float32Array(nf);
    for (let i = 0; i < nf; i++) fk[i] = Math.random();
    fg.setAttribute("aK", new THREE.BufferAttribute(fk, 1));
    this.fish = new THREE.Points(
      fg,
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: { uT: this.uT },
        vertexShader: /* glsl */ `attribute float aK;uniform float uT;varying float vK;
          void main(){vec4 mv=viewMatrix*vec4(position,1.0);gl_Position=projectionMatrix*mv;vK=aK;
            gl_PointSize=clamp(300.0*0.14/max(-mv.z,0.5),2.0,34.0);}`,
        fragmentShader: /* glsl */ `varying float vK;uniform float uT;void main(){vec2 q=gl_PointCoord-0.5;q.x*=0.55;
            float r=length(q)*2.0;float tw=0.7+0.3*sin(uT*5.0+vK*50.0);
            vec3 c=mix(vec3(0.6,1.0,0.95),vec3(1.0,0.85,0.55),step(0.7,vK));
            gl_FragColor=vec4(c*smoothstep(1.0,0.0,r)*tw*1.8,1.0);}`,
      }),
    );
    this.fish.frustumCulled = false;
    for (let i = 0; i < nf; i++) this.fishState.push({ p: new THREE.Vector3(), v: new THREE.Vector3(), school: i % 4 });

    this.group.add(this.ribbons, this.glowPts, this.jellies, this.fish);
    this.group.visible = false;
  }

  private restream(px: number, pz: number): void {
    const b = this.rBase.array as Float32Array, pr = this.rParams.array as Float32Array;
    const gp = this.glowPts.geometry.attributes.position as THREE.BufferAttribute;
    const gk = this.glowPts.geometry.attributes.aK as THREE.BufferAttribute;
    const gpa = gp.array as Float32Array, gka = gk.array as Float32Array;
    let n = 0, g = 0;
    const cx = Math.floor(px / TILE), cz = Math.floor(pz / TILE);
    for (let i = cx - RING; i <= cx + RING; i++)
      for (let j = cz - RING; j <= cz + RING; j++) {
        for (let k = 0; k < RIBBONS_PER_TILE; k++) {
          const x = (i + hash(i, j, k)) * TILE, z = (j + hash(i, j, k + 50)) * TILE;
          const h = heightAt(x, z);
          if (h > WATER_Y - 1.3) continue;
          // in drifts: some floors are meadows of ribbons, others bare
          if (hash(Math.floor(x / 9), Math.floor(z / 9), 3) < 0.35) continue;
          b.set([x, h, z], n * 3);
          pr.set([Math.min(4.2, -h - 0.6) * (0.5 + hash(i, j, k + 99) * 0.5), hash(i, j, k + 7) * 6.28, hash(i, j, k + 13)], n * 3);
          n++;
        }
        // a cluster of anemone lights
        for (let c = 0; c < 2; c++) {
          const x0 = (i + hash(i, j, 200 + c)) * TILE, z0 = (j + hash(i, j, 300 + c)) * TILE;
          const h0 = heightAt(x0, z0);
          if (h0 > WATER_Y - 1.0) continue;
          for (let k = 0; k < 7 && g < gka.length; k++) {
            const a = hash(i, j, 400 + c * 10 + k) * 6.28, r = hash(i, j, 500 + c * 10 + k) * 1.2;
            const x = x0 + Math.cos(a) * r, z = z0 + Math.sin(a) * r;
            gpa.set([x, heightAt(x, z) + 0.15 + hash(i, j, 600 + k) * 0.3, z], g * 3);
            gka[g++] = hash(i, j, 700 + c * 10 + k);
          }
        }
      }
    this.rGeo.instanceCount = n;
    this.rBase.needsUpdate = this.rParams.needsUpdate = true;
    this.glowPts.geometry.setDrawRange(0, g);
    gp.needsUpdate = gk.needsUpdate = true;
  }

  /** `inWater`: the wanderer is swimming or the camera is under the surface. */
  update(t: number, dt: number, player: THREE.Vector3, inWater: boolean): void {
    this.group.visible = inWater;
    if (!inWater) return;
    this.uT.value = t;
    const cx = Math.floor(player.x / TILE), cz = Math.floor(player.z / TILE);
    if (cx !== this.cx || cz !== this.cz) {
      this.cx = cx;
      this.cz = cz;
      this.restream(player.x, player.z);
    }
    // jellyfish drift slowly; any too far away reappear somewhere in the water ahead
    this.jellyState.forEach((j, i) => {
      const floor = heightAt(j.p.x, j.p.z);
      if (j.p.distanceTo(player) > 40 || floor > WATER_Y - 2 || j.p.lengthSq() === 0) {
        const a = Math.random() * 6.28, r = 8 + Math.random() * 22;
        j.p.set(player.x + Math.cos(a) * r, 0, player.z + Math.sin(a) * r);
        const f = heightAt(j.p.x, j.p.z);
        j.p.y = f < WATER_Y - 2 ? f + (WATER_Y - f) * (0.3 + Math.random() * 0.5) : -100;
      }
      j.v.set(Math.sin(t * 0.1 + i) * 0.2, Math.max(0, Math.sin(t * 1.6 + j.phase)) * 0.25 - 0.05, Math.cos(t * 0.13 + i) * 0.2);
      j.p.addScaledVector(j.v, dt);
      j.p.y = Math.min(j.p.y, WATER_Y - 0.8);
      this.m4.makeScale(j.s, j.s, j.s).setPosition(j.p);
      this.jellies.setMatrixAt(i, this.m4);
    });
    this.jellies.instanceMatrix.needsUpdate = true;
    // fish swim in loose schools that circle around the wanderer
    const fp = this.fish.geometry.attributes.position as THREE.BufferAttribute;
    const fa = fp.array as Float32Array;
    this.fishState.forEach((f, i) => {
      if (f.p.lengthSq() === 0 || f.p.distanceTo(player) > 45) {
        f.p.set(player.x + (Math.random() - 0.5) * 20, Math.min(WATER_Y - 1, player.y - Math.random() * 2), player.z + (Math.random() - 0.5) * 20);
      }
      const a = t * (0.25 + f.school * 0.07) + f.school * 1.6;
      const r = 5 + f.school * 3;
      this.tmp.set(player.x + Math.cos(a) * r + Math.sin(i * 1.7) * 1.5, player.y + Math.sin(t * 0.5 + f.school) * 1.5, player.z + Math.sin(a) * r + Math.cos(i * 2.3) * 1.5);
      f.v.addScaledVector(this.tmp.sub(f.p), dt * 0.8).multiplyScalar(1 - dt * 0.6);
      f.p.addScaledVector(f.v, dt);
      f.p.y = Math.min(WATER_Y - 0.4, Math.max(heightAt(f.p.x, f.p.z) + 0.3, f.p.y));
      fa.set([f.p.x, f.p.y, f.p.z], i * 3);
    });
    fp.needsUpdate = true;
  }
}
