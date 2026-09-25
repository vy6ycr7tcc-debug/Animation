/* Night water: dark, calm, and safe. It mirrors the sky (stars and the bright star) with
   pale cyan light on the ripples. Small waves near the viewer calm to a mirror far away.
   Ripples (footsteps, strokes, the first touch) are rings added to the surface normal. */
import * as THREE from "three";
import { IJ_FOG_GLSL } from "./fog";
import { SKY_GLSL, skyUniforms } from "./sky";

const MAX_RIPPLES = 10;

export class Water {
  mesh: THREE.Mesh;
  private ripples: THREE.Vector4[] = [];
  private next = 0;
  readonly uniforms = {
    uCalm: { value: 1 },
    uFogColor: { value: new THREE.Color() },
    uFogDensity: { value: 0 },
    uRip: { value: [] as THREE.Vector4[] },
    uGlow: { value: new THREE.Vector3() }, // the wanderer's light, reflected
    uRefl: { value: null as THREE.Texture | null }, // mirrored world above the water
    uReflMat: { value: new THREE.Matrix4() },
    uReflOn: { value: 0 },
  };

  constructor() {
    for (let i = 0; i < MAX_RIPPLES; i++) this.ripples.push(new THREE.Vector4(0, 0, -100, 0));
    this.uniforms.uRip.value = this.ripples;
    const mat = new THREE.ShaderMaterial({
      uniforms: { ...skyUniforms, ...this.uniforms },
      vertexShader: /* glsl */ `varying vec3 vW;void main(){vec4 w=modelMatrix*vec4(position,1.0);vW=w.xyz;gl_Position=projectionMatrix*viewMatrix*w;}`,
      fragmentShader: /* glsl */ `precision highp float;
        varying vec3 vW;
        uniform float uCalm,uFogDensity;
        uniform vec3 uFogColor,uGlow;
        uniform sampler2D uRefl;uniform mat4 uReflMat;uniform float uReflOn;
        uniform vec4 uRip[${MAX_RIPPLES}];
        ${SKY_GLSL}
        ${IJ_FOG_GLSL}
        void main(){
          vec3 toEye=cameraPosition-vW;
          float dist=length(toEye);
          vec3 v=toEye/dist;
          vec2 p=vW.xz;
          float t=uT*uCalm;
          vec2 g=vec2(0.0);
          vec2 dirs[5];dirs[0]=vec2(0.8,0.6);dirs[1]=vec2(-0.6,0.8);dirs[2]=vec2(0.2,-1.0);dirs[3]=vec2(-0.9,-0.3);dirs[4]=vec2(0.5,0.85);
          float fr[5];fr[0]=0.7;fr[1]=1.3;fr[2]=2.3;fr[3]=3.7;fr[4]=5.9;
          for(int i=0;i<5;i++){float ph=dot(dirs[i],p)*fr[i]+t*(0.5+fr[i]*0.3);g+=dirs[i]*fr[i]*cos(ph)*(0.016/fr[i]);}
          g*=exp(-dist*0.015);
          for(int i=0;i<${MAX_RIPPLES};i++){
            vec4 r=uRip[i];float age=uT-r.z;if(age<0.0||age>7.0)continue;
            vec2 dp=p-r.xy;float rr=length(dp)+1e-4;float front=age*1.3;
            float env=exp(-pow((rr-front)*2.2,2.0))*exp(-age*0.7)*r.w;
            g+=dp/rr*env*sin((rr-front)*9.0)*0.35;
          }
          vec3 n=normalize(vec3(-g.x,1.0,-g.y));
          float cosT=max(dot(n,v),0.0);
          float fres=0.04+0.96*pow(1.0-cosT,5.0);
          vec3 R=reflect(-v,n);R.y=abs(R.y);
          vec3 refl=skyColor(R);
          if(uReflOn>0.5){
            // the island, the stations and the wanderer, mirrored and bent by the ripples
            vec4 rc=uReflMat*vec4(vW,1.0);
            vec2 ruv=rc.xy/rc.w+g*vec2(0.9,0.6);
            vec4 rt=texture2D(uRefl,clamp(ruv,0.001,0.999));
            refl=refl*(1.0-clamp(rt.a,0.0,1.0))+rt.rgb; // solid things cover the sky; glows add their light
          }
          // pale cyan catches on the ripple slopes
          float slope=length(g);
          refl+=vec3(0.30,0.60,0.70)*smoothstep(0.02,0.25,slope)*0.10;
          vec3 deep=vec3(0.012,0.024,0.055);
          vec3 c=mix(deep,refl,clamp(fres*1.25,0.0,1.0));
          // the bright star's path of light across the water
          float sp=pow(max(dot(R,uStar),0.0),220.0);
          c+=vec3(1.0,0.78,0.48)*sp*2.2;
          // the wanderer's own light, reflected nearby
          float gd=length(vW.xz-uGlow.xz);
          c+=vec3(1.0,0.82,0.58)*exp(-gd*gd*0.35)*0.07*uGlow.y;
          vec4 fg=ijFog(vW);
          c=mix(c,fg.rgb,fg.a);
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

  update(camX: number, camZ: number, glow: THREE.Vector3): void {
    this.mesh.position.set(Math.round(camX / 50) * 50, 0, Math.round(camZ / 50) * 50);
    this.uniforms.uGlow.value.copy(glow);
  }
}
