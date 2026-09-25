/* The lake: glassy water to every horizon that reflects the dawn sky.
   Small travelling waves near the viewer calm to a mirror far away. Ripples (footsteps,
   strokes, the first touch) are rings added to the surface normal. */
import * as THREE from "three";
import { SKY_GLSL, skyUniforms } from "./sky";

const MAX_RIPPLES = 10;

export class Water {
  mesh: THREE.Mesh;
  private ripples: THREE.Vector4[] = [];
  private next = 0;
  readonly uniforms = {
    uT: { value: 0 },
    uCalm: { value: 1 }, // wave speed multiplier (reduced motion lowers it)
    uRadiance: { value: 0 }, // journey progress: the water grows more luminous
    uFogColor: { value: new THREE.Color() },
    uFogDensity: { value: 0 },
    uRip: { value: [] as THREE.Vector4[] },
  };

  constructor() {
    for (let i = 0; i < MAX_RIPPLES; i++) this.ripples.push(new THREE.Vector4(0, 0, -100, 0));
    this.uniforms.uRip.value = this.ripples;
    const mat = new THREE.ShaderMaterial({
      uniforms: { ...skyUniforms, ...this.uniforms },
      vertexShader: /* glsl */ `varying vec3 vW;void main(){vec4 w=modelMatrix*vec4(position,1.0);vW=w.xyz;gl_Position=projectionMatrix*viewMatrix*w;}`,
      fragmentShader: /* glsl */ `precision highp float;
        varying vec3 vW;
        uniform float uT,uCalm,uRadiance,uFogDensity;
        uniform vec3 uFogColor;
        uniform vec4 uRip[${MAX_RIPPLES}];
        ${SKY_GLSL}
        void main(){
          vec3 toEye=cameraPosition-vW;
          float dist=length(toEye);
          vec3 v=toEye/dist;
          vec2 p=vW.xz;
          float t=uT*uCalm;
          // gentle wave field: sum of travelling sines (gradient only)
          vec2 g=vec2(0.0);
          vec2 dirs[5];dirs[0]=vec2(0.8,0.6);dirs[1]=vec2(-0.6,0.8);dirs[2]=vec2(0.2,-1.0);dirs[3]=vec2(-0.9,-0.3);dirs[4]=vec2(0.5,0.85);
          float fr[5];fr[0]=0.9;fr[1]=1.7;fr[2]=2.9;fr[3]=4.3;fr[4]=6.1;
          for(int i=0;i<5;i++){float ph=dot(dirs[i],p)*fr[i]+t*(0.6+fr[i]*0.35);g+=dirs[i]*fr[i]*cos(ph)*(0.018/fr[i]);}
          g*=exp(-dist*0.012);   // far water is a mirror
          // ripples
          for(int i=0;i<${MAX_RIPPLES};i++){
            vec4 r=uRip[i];float age=uT-r.z;if(age<0.0||age>7.0)continue;
            vec2 dp=p-r.xy;float rr=length(dp)+1e-4;float front=age*1.3;
            float env=exp(-pow((rr-front)*2.2,2.0))*exp(-age*0.7)*r.w;
            g+=dp/rr*env*sin((rr-front)*9.0)*0.35;
          }
          vec3 n=normalize(vec3(-g.x,1.0,-g.y));
          float cosT=max(dot(n,v),0.0);
          float fres=0.03+0.97*pow(1.0-cosT,5.0);
          vec3 R=reflect(-v,n);R.y=abs(R.y);
          vec3 refl=skyColor(R);
          vec3 deep=mix(vec3(0.04,0.06,0.12),vec3(0.10,0.14,0.22),uDawn)+vec3(0.10,0.07,0.04)*uRadiance;
          vec3 c=mix(deep,refl,clamp(fres*1.1,0.0,1.0));
          // sun glitter path
          float sp=pow(max(dot(R,uSun),0.0),300.0);
          c+=vec3(1.0,0.82,0.6)*sp*(3.0+2.0*uRadiance);
          // fog blends into the horizon colour, as the sky does
          float fog=1.0-exp(-pow(dist*uFogDensity,2.0));
          vec3 horizon=skyColor(normalize(vec3(-v.x,0.02,-v.z)));
          c=mix(c,mix(uFogColor,horizon,0.6),fog);
          gl_FragColor=vec4(c,1.0);
        }`,
    });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(3000, 3000, 1, 1).rotateX(-Math.PI / 2), mat);
    this.mesh.frustumCulled = false;
  }

  ripple(x: number, z: number, strength: number, time: number): void {
    this.ripples[this.next].set(x, z, time, strength);
    this.next = (this.next + 1) % MAX_RIPPLES;
  }

  update(t: number, camX: number, camZ: number): void {
    this.uniforms.uT.value = t;
    // Keep the plane centred under the viewer so the horizon never ends.
    this.mesh.position.set(Math.round(camX / 50) * 50, 0, Math.round(camZ / 50) * 50);
  }
}
