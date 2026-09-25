/* Clouds: soft banks of cloud drifting among the far mountains and higher up, lit by the moon.
   Each is a billboard shaded as if it were a volume. The side toward the moon is brighter, and
   edges glow silver when the moon is behind them. They sit in the same haze as the land, so
   they layer the distance. (The earlier flat mist sheets and cut-out horizon were retired when
   the land itself reached the mountains.) */
import * as THREE from "three";
import { IJ_FOG_GLSL } from "./fog";
import { starDirection } from "./sky";

export class Clouds {
  mesh: THREE.InstancedMesh;
  private uniforms = { uT: { value: 0 }, uMoon: { value: starDirection() } };

  constructor(count = 42) {
    const geo = new THREE.PlaneGeometry(1, 1);
    const seed = new Float32Array(count);
    const size = new Float32Array(count * 2);
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: this.uniforms,
      vertexShader: /* glsl */ `
        attribute float aSeed;attribute vec2 aSize;
        varying vec2 vUv;varying float vSeed;varying vec3 vW;varying vec3 vRight;varying vec3 vUp;
        uniform float uT;
        void main(){
          vec3 c=vec3(instanceMatrix[3]);
          // a slow drift around the world
          float a=uT*0.0025*(0.6+aSeed*0.8);
          c.xz=mat2(cos(a),-sin(a),sin(a),cos(a))*c.xz;
          vec3 right=vec3(viewMatrix[0][0],viewMatrix[1][0],viewMatrix[2][0]);
          vec3 up=vec3(0.0,1.0,0.0);
          vec3 w=c+right*position.x*aSize.x+up*position.y*aSize.y;
          vUv=uv;vSeed=aSeed;vW=w;vRight=right;vUp=up;
          gl_Position=projectionMatrix*viewMatrix*vec4(w,1.0);
        }`,
      fragmentShader: /* glsl */ `
        varying vec2 vUv;varying float vSeed;varying vec3 vW;varying vec3 vRight;varying vec3 vUp;
        uniform float uT;uniform vec3 uMoon;
        ${IJ_FOG_GLSL}
        float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
        float n(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y);}
        float fbm(vec2 p){float s=0.0,a=0.5;for(int i=0;i<5;i++){s+=n(p)*a;p=p*2.03+vec2(1.7,9.2);a*=0.5;}return s;}
        void main(){
          vec2 q=vUv*2.0-1.0;
          // a billowing mass: round on top, flatter underneath
          float body=1.0-length(vec2(q.x,q.y>0.0?q.y*1.1:q.y*2.2));
          float f=fbm(vUv*vec2(3.0,2.0)+vSeed*17.0+vec2(uT*0.004,0.0));
          float d=smoothstep(0.0,0.9,body+(f-0.5)*1.1);
          d*=d;
          if(d<0.01)discard;
          // shade it as a volume: a normal as if it were a rounded mass
          vec3 viewDir=normalize(cameraPosition-vW);
          vec3 nrm=normalize(vRight*q.x+vUp*q.y*0.8+viewDir*max(0.2,body));
          float lit=0.45+0.55*max(dot(nrm,uMoon),0.0);
          float behind=pow(max(dot(-viewDir,uMoon),0.0),5.0);
          vec3 shade=vec3(0.13,0.12,0.26);
          vec3 light=vec3(0.62,0.54,0.52);
          vec3 c=mix(shade,light,lit*lit*0.8);
          c+=vec3(0.9,0.8,0.7)*behind*(1.0-d)*d*1.6; // a silver lining when the moon is behind
          vec4 fg=ijFog(vW);
          c=mix(c,fg.rgb,fg.a*0.7);
          gl_FragColor=vec4(c,d*0.9);
        }`,
    });
    this.mesh = new THREE.InstancedMesh(geo, mat, count);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -0.5;
    let s = 11;
    const R = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    const m = new THREE.Matrix4();
    for (let i = 0; i < count; i++) {
      const a = R() * Math.PI * 2;
      const low = i < count * 0.65; // most rest among the mountains; a few float higher
      const r = low ? 380 + R() * 480 : 150 + R() * 600;
      const y = low ? 25 + R() * 45 : 90 + R() * 70;
      m.makeTranslation(Math.cos(a) * r, y, Math.sin(a) * r);
      this.mesh.setMatrixAt(i, m);
      seed[i] = R();
      const w = low ? 120 + R() * 180 : 90 + R() * 120;
      size.set([w, w * (low ? 0.32 + R() * 0.18 : 0.22 + R() * 0.12)], i * 2);
    }
    geo.setAttribute("aSeed", new THREE.InstancedBufferAttribute(seed, 1));
    geo.setAttribute("aSize", new THREE.InstancedBufferAttribute(size, 2));
  }

  update(t: number): void {
    this.uniforms.uT.value = t;
  }
}
