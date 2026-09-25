/* Below the water. Everything here is only drawn while the wanderer is in the water.
   - The look (UnderwaterEffect): light is absorbed as it travels, red first, then green, so
     the far water turns teal and then indigo; the deeper you are, the darker it grows. Moonlight
     falls in slow shafts that stay put in the water as you move through them. The wanderer's
     orb is a lantern in the murk. The surface overhead (water.ts) shows the sky through a bright
     window.
   - Sea-ribbons: tall kelp that sways and parts around you, with light pulsing to its tips.
   - Anemones: clusters of soft lights on the floor, breathing.
   - Marine snow: a slow drift of motes all around, lit by your orb; bubbles from your strokes.
   - Creatures (SeaFauna): schools of fish, mantas, dolphins and a whale, from Quaternius's
     Animated Fish Pack (CC0), drawn in the same glass light as the wanderer. */
import * as THREE from "three";
import { BlendFunction, Effect, EffectAttribute } from "postprocessing";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import { loadBytes } from "../core/assets";
import { lightBodyMaterial, tickLightBody } from "../player/lightBody";
import { heightAt, WATER_Y } from "./terrain";

/* ---------------------------------------------------------------- the look under the surface */
export class UnderwaterEffect extends Effect {
  constructor() {
    super(
      "Underwater",
      /* glsl */ `
      uniform float uT,uDepth;uniform vec3 uCam,uOrb;uniform mat4 uProjInv,uCamWorld;
      float uwH(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float uwN(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
        return mix(mix(uwH(i),uwH(i+vec2(1,0)),f.x),mix(uwH(i+vec2(0,1)),uwH(i+vec2(1,1)),f.x),f.y);}
      void mainImage(const in vec4 inputColor,const in vec2 uv,const in float depth,out vec4 outputColor){
        // the ray through this pixel, in the world
        vec4 vv=uProjInv*vec4(uv*2.0-1.0,1.0,1.0);
        vec3 rv=normalize(vv.xyz/vv.w);
        vec3 ray=normalize((uCamWorld*vec4(rv,0.0)).xyz);
        float dist=depth>=0.9999?160.0:-getViewZ(depth)/max(-rv.z,0.05);
        // looking up, the water ends at the surface
        if(ray.y>0.01)dist=min(dist,(uDepth+0.02)/ray.y);
        // absorption (red first) and the glow of the water itself, darker the deeper you are
        vec3 sigma=vec3(0.28,0.08,0.052);
        vec3 T=exp(-sigma*dist);
        float deep=smoothstep(0.0,38.0,uDepth);
        vec3 glowW=mix(vec3(0.03,0.1,0.135),vec3(0.004,0.013,0.036),deep);
        glowW*=0.55+0.9*max(0.0,ray.y)*(1.0-deep*0.6);
        vec3 c=inputColor.rgb*T+glowW*(1.0-T);
        // the sky through the surface: a bright window straight overhead (Snell's window),
        // rippling, with a brighter rim, fading as you go deeper
        if(ray.y>0.5){
          vec2 hit=uCam.xz+ray.xz*(uDepth/ray.y);
          float rip=uwN(hit*0.6+vec2(uT*0.3,uT*0.2))*0.6+uwN(hit*1.7-vec2(uT*0.25,0.0))*0.4;
          float win=smoothstep(0.62,0.7,ray.y+(rip-0.5)*0.04);
          float rim=win*(1.0-smoothstep(0.7,0.78,ray.y));
          c+=(vec3(0.16,0.26,0.32)*win*(0.7+rip*0.6)+vec3(0.3,0.42,0.45)*rim)*exp(-uDepth*0.06);
        }
        // shafts of moonlight: a pattern on the surface, cast down through the water; a few
        // samples along the ray, each dimmed by the water it has come through
        float shafts=0.0;
        float reach=min(dist,32.0);
        for(int k=0;k<6;k++){
          float s=(float(k)+0.5+0.5*uwH(uv*vec2(913.0,577.0)+float(k)))/6.0*reach;
          vec3 p=uCam+ray*s;
          float below=max(0.0,-p.y);
          vec2 q=(p.xz+vec2(0.25,0.6)*below)*0.16;
          float pat=uwN(q+vec2(uT*0.04,-uT*0.03))*0.65+uwN(q*2.3-vec2(uT*0.05,uT*0.02))*0.35;
          pat=pow(smoothstep(0.52,0.9,pat),2.0);
          shafts+=pat*exp(-below*0.07-s*0.06);
        }
        c+=vec3(0.3,0.55,0.62)*shafts/6.0*0.55*(1.0-deep*0.85);
        // the orb: a lantern in the murk (light scattered along the ray, after Macklin)
        vec3 q=uCam-uOrb;float b=dot(ray,q);float cc=dot(q,q);
        float sInv=inversesqrt(max(cc-b*b,0.02));
        float lit=sInv*(atan((min(dist,40.0)+b)*sInv)-atan(b*sInv));
        c+=vec3(1.0,0.86,0.62)*lit*0.045;
        c*=1.0-0.35*pow(length(uv-0.5)*1.3,2.0);
        outputColor=vec4(c,inputColor.a);
      }`,
      {
        attributes: EffectAttribute.DEPTH,
        blendFunction: BlendFunction.NORMAL,
        uniforms: new Map<string, THREE.Uniform>([
          ["uT", new THREE.Uniform(0)],
          ["uDepth", new THREE.Uniform(1)],
          ["uCam", new THREE.Uniform(new THREE.Vector3())],
          ["uOrb", new THREE.Uniform(new THREE.Vector3())],
          ["uProjInv", new THREE.Uniform(new THREE.Matrix4())],
          ["uCamWorld", new THREE.Uniform(new THREE.Matrix4())],
        ]),
      },
    );
  }
  /** Each frame while under: the camera, the time, and where the orb is. */
  follow(camera: THREE.PerspectiveCamera, t: number, orb: THREE.Vector3): void {
    const u = this.uniforms;
    (u.get("uT") as THREE.Uniform).value = t;
    (u.get("uDepth") as THREE.Uniform).value = Math.max(0, WATER_Y - camera.position.y);
    (u.get("uCam") as THREE.Uniform<THREE.Vector3>).value.copy(camera.position);
    (u.get("uOrb") as THREE.Uniform<THREE.Vector3>).value.copy(orb);
    (u.get("uProjInv") as THREE.Uniform<THREE.Matrix4>).value.copy(camera.projectionMatrixInverse);
    (u.get("uCamWorld") as THREE.Uniform<THREE.Matrix4>).value.copy(camera.matrixWorld);
  }
}

/* ---------------------------------------------------------------- life */
const TILE = 14;
const RING = 3;
const RIBBONS_PER_TILE = 18;
const SNOW = 900;
const SNOW_BOX = 22; // metres: the drift wraps around the camera in a box this wide
const BUBBLES = 80;

function hash(i: number, j: number, s: number): number {
  const v = Math.sin(i * 127.1 + j * 311.7 + s * 74.7) * 43758.5453;
  return v - Math.floor(v);
}

export class SeaLife {
  group = new THREE.Group();
  private uni = { uT: { value: 0 }, uOrb: { value: new THREE.Vector3() }, uCam: { value: new THREE.Vector3() }, uPx: { value: 600 } };
  private ribbons: THREE.Mesh;
  private rGeo: THREE.InstancedBufferGeometry;
  private rBase: THREE.InstancedBufferAttribute;
  private rParams: THREE.InstancedBufferAttribute;
  private glowPts: THREE.Points;
  private snow: THREE.Points;
  private bub: THREE.Points;
  private bubState: { p: THREE.Vector3; v: number; life: number; wob: number }[] = [];
  private bubNext = 0;
  private cx = Infinity;
  private cz = Infinity;

  constructor() {
    // sea-ribbons (kelp): a tall, narrow strip, swaying; uv.y 0 at the root, 1 at the tip
    const seg = 12;
    const pos: number[] = [], uv: number[] = [], idx: number[] = [];
    for (let k = 0; k <= seg; k++) {
      const y = k / seg;
      const w = 0.16 * Math.sin(Math.PI * (0.08 + y * 0.84)) * (1 - y * 0.35); // a leaf: narrow at root and tip
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
        uniforms: this.uni,
        vertexShader: /* glsl */ `
          attribute vec3 aBase;attribute vec3 aParams;uniform float uT;uniform vec3 uOrb,uCam;
          varying vec2 vUv;varying float vHue;varying float vD;varying float vNear;
          void main(){
            vec3 p=position;p.y*=aParams.x;
            float c=cos(aParams.y),s=sin(aParams.y);p=vec3(p.x*c,p.y,p.x*s);
            float y2=uv.y*uv.y;
            // a sway that travels up the stalk
            p.x+=sin(uT*0.6+aBase.x*0.3-uv.y*2.5)*0.35*y2*aParams.x*0.25;
            p.z+=cos(uT*0.5+aBase.z*0.3-uv.y*2.1)*0.3*y2*aParams.x*0.25;
            // it parts around the wanderer's light, and brightens
            vec3 w=aBase+p;
            vec2 away=w.xz-uOrb.xz;float d=length(away)+1e-3;
            float near=(1.0-smoothstep(0.6,3.2,d))*(1.0-smoothstep(1.0,5.0,abs(w.y-uOrb.y)));
            w.xz+=away/d*near*uv.y*1.1;
            vNear=near;
            // and it bends aside from the camera, so no blade ever fills the view
            vec2 fromCam=w.xz-uCam.xz;float dc=length(fromCam)+1e-3;
            w.xz+=fromCam/dc*(1.0-smoothstep(0.5,2.6,dc))*(1.0-smoothstep(1.5,4.0,abs(w.y-uCam.y)))*1.6;
            vec4 mv=viewMatrix*vec4(w,1.0);vD=-mv.z;
            vUv=uv;vHue=aParams.z;gl_Position=projectionMatrix*mv;
          }`,
        fragmentShader: /* glsl */ `
          varying vec2 vUv;varying float vHue;varying float vD;varying float vNear;uniform float uT;
          float kH(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
          void main(){
            float edge=1.0-abs(vUv.x*2.0-1.0);
            vec3 hue=mix(vec3(0.25,0.9,0.8),vec3(0.6,0.5,1.0),vHue);
            // a dark, living blade: deep green at the root, a little light through it near the top
            vec3 c=mix(vec3(0.008,0.03,0.03),vec3(0.03,0.09,0.08),vUv.y)*(0.5+0.5*edge);
            // specks of light rising slowly up the blade, and a soft glow at the tip
            vec2 cell=vec2(floor(vUv.x*3.0),floor(vUv.y*28.0-uT*0.6));
            float speck=step(0.93,kH(cell+vHue*17.0))*smoothstep(0.35,0.0,abs(fract(vUv.y*28.0-uT*0.6)-0.5));
            c+=hue*(speck*0.5+smoothstep(0.85,1.0,vUv.y)*0.35+vNear*0.35);
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
        uniforms: this.uni,
        vertexShader: /* glsl */ `attribute float aK;uniform float uT;varying float vA;varying vec3 vC;
          void main(){vec4 mv=viewMatrix*vec4(position,1.0);gl_Position=projectionMatrix*mv;
            vA=(0.55+0.45*sin(uT*(0.6+aK)+aK*40.0))*(1.0-smoothstep(25.0,50.0,-mv.z));
            vC=mix(vec3(0.3,1.0,0.85),vec3(1.0,0.5,0.8),step(0.6,aK));
            gl_PointSize=clamp(260.0*(0.2+aK*0.16)/max(-mv.z,0.5),2.0,56.0);}`,
        fragmentShader: /* glsl */ `varying float vA;varying vec3 vC;void main(){float r=length(gl_PointCoord-0.5)*2.0;
            gl_FragColor=vec4(vC*(exp(-r*r*4.0)*1.4+(1.0-smoothstep(0.0,0.3,r))*2.2)*vA,1.0);}`,
      }),
    );
    this.glowPts.frustumCulled = false;

    // marine snow: motes drifting in a box that wraps around the camera, so there are always
    // some near you; lit mostly by your orb
    const sg = new THREE.BufferGeometry();
    const seed = new Float32Array(SNOW * 4);
    for (let i = 0; i < SNOW * 4; i++) seed[i] = Math.random();
    sg.setAttribute("position", new THREE.BufferAttribute(new Float32Array(SNOW * 3), 3));
    sg.setAttribute("aSeed", new THREE.BufferAttribute(seed, 4));
    this.snow = new THREE.Points(
      sg,
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: this.uni,
        vertexShader: /* glsl */ `attribute vec4 aSeed;uniform float uT,uPx;uniform vec3 uOrb,uCam;varying float vA;
          void main(){
            const float B=${SNOW_BOX.toFixed(1)};
            vec3 drift=vec3(sin(uT*0.05+aSeed.w*6.0)*0.6,-uT*0.06*(0.4+aSeed.w),cos(uT*0.04+aSeed.x*6.0)*0.6);
            vec3 p=uCam+(fract((aSeed.xyz*B+drift-uCam)/B)-0.5)*B;
            float dCam=distance(p,uCam),dOrb=distance(p,uOrb);
            vA=(0.1+1.4/(1.0+dOrb*dOrb*0.35))*(1.0-smoothstep(B*0.3,B*0.5,dCam))*step(p.y,-0.2);
            vec4 mv=viewMatrix*vec4(p,1.0);gl_Position=projectionMatrix*mv;
            gl_PointSize=clamp((0.025+aSeed.w*0.03)*uPx/max(-mv.z,0.3),1.0,10.0);}`,
        fragmentShader: /* glsl */ `varying float vA;void main(){float r=length(gl_PointCoord-0.5)*2.0;
            gl_FragColor=vec4(vec3(0.75,0.88,1.0)*(1.0-smoothstep(0.2,1.0,r))*vA*0.5,1.0);}`,
      }),
    );
    this.snow.frustumCulled = false;

    // bubbles from your strokes, wobbling up to the surface
    const bg = new THREE.BufferGeometry();
    bg.setAttribute("position", new THREE.BufferAttribute(new Float32Array(BUBBLES * 3), 3).setUsage(THREE.DynamicDrawUsage));
    bg.setAttribute("aSize", new THREE.BufferAttribute(new Float32Array(BUBBLES), 1).setUsage(THREE.DynamicDrawUsage));
    this.bub = new THREE.Points(
      bg,
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: this.uni,
        vertexShader: /* glsl */ `attribute float aSize;uniform float uPx;varying float vS;
          void main(){vec4 mv=viewMatrix*vec4(position,1.0);gl_Position=projectionMatrix*mv;vS=aSize;
            gl_PointSize=clamp(aSize*uPx/max(-mv.z,0.3),0.0,24.0);}`,
        fragmentShader: /* glsl */ `varying float vS;void main(){float r=length(gl_PointCoord-0.5)*2.0;
            float ring=smoothstep(0.55,0.85,r)*(1.0-smoothstep(0.85,1.0,r));
            gl_FragColor=vec4(vec3(0.8,0.92,1.0)*(ring*0.9+0.08)*step(0.001,vS),1.0);}`,
      }),
    );
    this.bub.frustumCulled = false;
    for (let i = 0; i < BUBBLES; i++) this.bubState.push({ p: new THREE.Vector3(), v: 0, life: 0, wob: Math.random() * 6 });

    this.group.add(this.ribbons, this.glowPts, this.snow, this.bub);
    this.group.visible = false;
  }

  /** A breath of bubbles, from a stroke or from diving in. */
  bubbles(at: THREE.Vector3, n: number): void {
    for (let k = 0; k < n; k++) {
      const b = this.bubState[this.bubNext];
      this.bubNext = (this.bubNext + 1) % BUBBLES;
      b.p.set(at.x + (Math.random() - 0.5) * 0.4, at.y + 1.0 + Math.random() * 0.4, at.z + (Math.random() - 0.5) * 0.4);
      b.v = 0.5 + Math.random() * 0.6;
      b.life = 1;
    }
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
          // in drifts: some floors are forests of kelp, others bare
          if (hash(Math.floor(x / 9), Math.floor(z / 9), 3) < 0.35) continue;
          // tall where the water is deep: up to about two thirds of the way to the surface
          const tall = Math.min(16, (-h - 0.6) * 0.66) * (0.45 + hash(i, j, k + 99) * 0.55);
          b.set([x, h, z], n * 3);
          pr.set([Math.max(0.6, tall), hash(i, j, k + 7) * 6.28, hash(i, j, k + 13)], n * 3);
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

  /** `inWater`: the wanderer is swimming or the camera is under the surface. `orb`: where the
      wanderer's light is. */
  update(t: number, dt: number, player: THREE.Vector3, inWater: boolean, orb: THREE.Vector3, cam: THREE.Vector3, pxPerUnit: number): void {
    this.group.visible = inWater;
    if (!inWater) return;
    this.uni.uT.value = t;
    this.uni.uOrb.value.copy(orb);
    this.uni.uCam.value.copy(cam);
    this.uni.uPx.value = pxPerUnit;
    this.snow.visible = cam.y < WATER_Y - 0.1;
    const cx = Math.floor(player.x / TILE), cz = Math.floor(player.z / TILE);
    if (cx !== this.cx || cz !== this.cz) {
      this.cx = cx;
      this.cz = cz;
      this.restream(player.x, player.z);
    }
    const bp = this.bub.geometry.attributes.position as THREE.BufferAttribute, bs = this.bub.geometry.attributes.aSize as THREE.BufferAttribute;
    const pa = bp.array as Float32Array, sa = bs.array as Float32Array;
    this.bubState.forEach((b, i) => {
      if (b.life > 0) {
        b.p.y += b.v * dt;
        b.wob += dt * 6;
        b.p.x += Math.sin(b.wob) * 0.12 * dt;
        b.p.z += Math.cos(b.wob * 0.8) * 0.12 * dt;
        b.life -= dt * 0.12;
        if (b.p.y > WATER_Y - 0.05) b.life = 0;
      }
      pa.set([b.p.x, b.p.y, b.p.z], i * 3);
      sa[i] = b.life > 0 ? 0.05 + 0.03 * Math.sin(i) : 0;
    });
    bp.needsUpdate = bs.needsUpdate = true;
  }
}

/* ---------------------------------------------------------------- creatures of the deep */
interface Swimmer {
  obj: THREE.Group;
  mixer: THREE.AnimationMixer;
  p: THREE.Vector3;
  v: THREE.Vector3;
  kind: number; // which model
  school: number; // -1: alone
  offset: THREE.Vector3; // place in the school
  speed: number;
}
interface Kind {
  file: string;
  length: number; // metres, nose to tail
  tint: THREE.Color;
  count: number;
  school: boolean;
  /** How deep the water must be for it. */
  minDepth: number;
  speed: number;
  timeScale: number;
}

/** Fish, mantas, dolphins and a whale: real animated models (Quaternius, CC0), in glass light.
    Schools keep loosely together behind a leader that wanders a slow path around you; all of
    them part around your light. They are only here while you are in the water. */
export class SeaFauna {
  group = new THREE.Group();
  private list: Swimmer[] = [];
  private mats: THREE.Material[] = [];
  private leaders: { p: THREE.Vector3; phase: number; r: number }[] = [];
  private tmp = new THREE.Vector3();
  private look = new THREE.Vector3();
  private kinds: Kind[] = [
    { file: "models/sea/fish1.glb", length: 0.45, tint: new THREE.Color(0.75, 1.0, 1.05), count: 10, school: true, minDepth: 3, speed: 1.4, timeScale: 1 },
    { file: "models/sea/fish2.glb", length: 0.55, tint: new THREE.Color(1.1, 0.85, 1.0), count: 8, school: true, minDepth: 4, speed: 1.2, timeScale: 0.9 },
    { file: "models/sea/fish3.glb", length: 0.4, tint: new THREE.Color(1.1, 1.0, 0.75), count: 10, school: true, minDepth: 3, speed: 1.5, timeScale: 1.1 },
    { file: "models/sea/manta.glb", length: 2.6, tint: new THREE.Color(0.8, 0.85, 1.15), count: 2, school: false, minDepth: 8, speed: 1.1, timeScale: 0.5 },
    { file: "models/sea/dolphin.glb", length: 2.1, tint: new THREE.Color(0.9, 1.0, 1.15), count: 2, school: false, minDepth: 6, speed: 2.6, timeScale: 0.8 },
    { file: "models/sea/whale.glb", length: 11, tint: new THREE.Color(0.75, 0.8, 1.1), count: 1, school: false, minDepth: 22, speed: 1.3, timeScale: 0.35 },
  ];

  constructor() {
    this.group.visible = false;
    void this.load();
  }

  private async load(): Promise<void> {
    const loader = new GLTFLoader();
    for (const [ki, k] of this.kinds.entries()) {
      const bytes = await loadBytes(k.file);
      if (!bytes) continue;
      const gltf = await loader.parseAsync(bytes, "");
      const clip = gltf.animations[0];
      // the same glass light as the wanderer, but brighter: thin shapes in dark water, glowing
      // like the creatures of the deep
      const mat = lightBodyMaterial(k.tint.clone().multiplyScalar(1.6), { inner: 0.55, edge: 1.3, body: 0.6 });
      this.mats.push(mat);
      gltf.scene.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(gltf.scene, true);
      const len = box.max.z - box.min.z || 1;
      const centre = box.getCenter(new THREE.Vector3());
      if (k.school) this.leaders.push({ p: new THREE.Vector3(), phase: Math.random() * 6, r: 4 + this.leaders.length * 2.5 });
      for (let i = 0; i < k.count; i++) {
        const model = i === 0 ? gltf.scene : cloneSkinned(gltf.scene);
        model.traverse((o) => {
          const m = o as THREE.SkinnedMesh;
          if (m.isMesh) {
            m.material = mat;
            m.frustumCulled = false;
            m.geometry.computeVertexNormals();
          }
        });
        const holder = new THREE.Group();
        const s = k.length / len;
        model.scale.setScalar(s);
        model.position.copy(centre).multiplyScalar(-s);
        holder.add(model);
        const mixer = new THREE.AnimationMixer(model);
        if (clip) {
          const a = mixer.clipAction(clip);
          a.timeScale = k.timeScale * (0.85 + Math.random() * 0.3);
          a.play();
          mixer.update(Math.random() * clip.duration);
        }
        this.group.add(holder);
        this.list.push({
          obj: holder, mixer, p: new THREE.Vector3(), v: new THREE.Vector3(), kind: ki,
          school: k.school ? this.leaders.length - 1 : -1,
          offset: new THREE.Vector3((Math.random() - 0.5) * 2.4, (Math.random() - 0.5) * 1.2, (Math.random() - 0.5) * 2.4),
          speed: k.speed,
        });
      }
    }
  }

  /** Somewhere in water at least `minDepth` deep near (x, z), or null. */
  private waterNear(x: number, z: number, minDepth: number, r0: number, r1: number): THREE.Vector3 | null {
    for (let k = 0; k < 12; k++) {
      const a = Math.random() * 6.28, r = r0 + Math.random() * (r1 - r0);
      const px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
      const floor = heightAt(px, pz);
      if (WATER_Y - floor >= minDepth) return new THREE.Vector3(px, floor + (WATER_Y - floor) * (0.25 + Math.random() * 0.5), pz);
    }
    return null;
  }

  update(t: number, dt: number, player: THREE.Vector3, inWater: boolean, orb: THREE.Vector3, reduced: boolean): void {
    this.group.visible = inWater && this.list.length > 0;
    if (!this.group.visible) return;
    for (const m of this.mats) tickLightBody(m, t);
    // school leaders wander slow loops around the wanderer, in water deep enough for them
    this.leaders.forEach((l, i) => {
      const a = t * (0.05 + i * 0.012) + l.phase;
      this.tmp.set(player.x + Math.cos(a) * l.r, 0, player.z + Math.sin(a * 1.3) * l.r);
      const floor = heightAt(this.tmp.x, this.tmp.z);
      if (WATER_Y - floor > 2) this.tmp.y = Math.min(WATER_Y - 1, Math.max(floor + 1, player.y + 1 + Math.sin(t * 0.2 + i) * 2));
      else this.tmp.copy(l.p.lengthSq() ? l.p : player);
      l.p.lerp(this.tmp, Math.min(1, dt * 0.4));
    });
    for (const f of this.list) {
      const k = this.kinds[f.kind];
      const far = f.p.distanceTo(player);
      if (f.p.lengthSq() === 0 || far > (k.length > 5 ? 120 : 70)) {
        const at = this.waterNear(player.x, player.z, k.minDepth, k.length > 5 ? 30 : 5, k.length > 5 ? 60 : 16);
        f.obj.visible = !!at;
        if (!at) continue;
        f.p.copy(at);
        f.v.set(0, 0, 0);
      }
      if (!f.obj.visible) continue;
      // where it wants to be: its place in the school, or a slow wander of its own
      if (f.school >= 0) this.tmp.copy(this.leaders[f.school].p).add(f.offset);
      else {
        const a = t * 0.03 * (1 + f.kind * 0.3) + f.kind * 2;
        const r = k.length > 5 ? 34 : 10;
        this.tmp.set(player.x + Math.cos(a) * r, f.p.y, player.z + Math.sin(a) * r);
      }
      const want = this.tmp.sub(f.p);
      const dl = want.length();
      if (dl > 0.01) want.multiplyScalar(Math.min(k.speed, dl * 0.6) / dl);
      // part around the wanderer's light
      const away = f.p.clone().sub(orb);
      const ad = away.length();
      if (ad < 2.5 + k.length * 0.5) want.addScaledVector(away.normalize(), (2.5 + k.length * 0.5 - ad) * 1.5);
      f.v.lerp(want, Math.min(1, dt * 0.8));
      f.p.addScaledVector(f.v, dt);
      const floor = heightAt(f.p.x, f.p.z);
      f.p.y = Math.min(WATER_Y - 0.6 - k.length * 0.15, Math.max(floor + 0.4 + k.length * 0.2, f.p.y));
      f.obj.position.copy(f.p);
      if (f.v.lengthSq() > 1e-4) f.obj.lookAt(this.look.copy(f.p).add(f.v));
      if (far < 60) f.mixer.update(reduced ? dt * 0.5 : dt * (0.6 + Math.min(1.2, f.v.length() / k.speed)));
    }
  }
}
