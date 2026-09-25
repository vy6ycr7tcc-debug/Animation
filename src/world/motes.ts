/* Motes of light drifting above the lake, drawn on the GPU. They follow the viewer
   in a wrapping volume, so there are always some nearby and never too many. */
import * as THREE from "three";

export class Motes {
  points: THREE.Points;
  private mat: THREE.ShaderMaterial;

  constructor(count: number) {
    this.mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uT: { value: 0 }, uDpr: { value: 1 }, uCenter: { value: new THREE.Vector3() } },
      vertexShader: /* glsl */ `attribute float aK;uniform float uT,uDpr;uniform vec3 uCenter;varying float vA;varying float vK;
        void main(){
          vec3 p=position+vec3(sin(uT*0.11+aK*9.0),sin(uT*0.17+aK*4.0)*0.6,cos(uT*0.09+aK*7.0))*1.6;
          // wrap into an 80-unit box around the viewer
          p.xz=uCenter.xz+mod(p.xz-uCenter.xz+40.0,80.0)-40.0;
          vec4 mv=modelViewMatrix*vec4(p,1.0);float d=-mv.z;gl_Position=projectionMatrix*mv;
          gl_PointSize=clamp((1.0+aK*2.2)*uDpr*16.0/d,1.0,6.0*uDpr);
          vA=(1.0-smoothstep(20.0,40.0,d))*smoothstep(0.6,3.0,d)*(0.3+0.7*aK)*(0.6+0.4*sin(uT*1.4+aK*40.0));vK=aK;}`,
      fragmentShader: /* glsl */ `varying float vA;varying float vK;void main(){float r=length(gl_PointCoord-0.5);float a=smoothstep(0.5,0.0,r)*vA;
        vec3 c=mix(vec3(1.0,0.9,0.78),vec3(1.0,0.72,0.5),step(0.75,vK));gl_FragColor=vec4(c*a*1.4,1.0);}`,
    });
    this.points = new THREE.Points(new THREE.BufferGeometry(), this.mat);
    this.points.frustumCulled = false;
    this.setCount(count);
  }

  setCount(n: number): void {
    const p = new Float32Array(n * 3);
    const k = new Float32Array(n);
    let s = 11;
    const R = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < n; i++) {
      p.set([(R() - 0.5) * 80, 0.4 + Math.pow(R(), 1.8) * 9, (R() - 0.5) * 80], i * 3);
      k[i] = R();
    }
    this.points.geometry.setAttribute("position", new THREE.BufferAttribute(p, 3));
    this.points.geometry.setAttribute("aK", new THREE.BufferAttribute(k, 1));
  }

  update(t: number, center: THREE.Vector3, dpr: number, reduced: boolean): void {
    this.mat.uniforms.uT.value = reduced ? t * 0.3 : t;
    this.mat.uniforms.uDpr.value = dpr;
    this.mat.uniforms.uCenter.value.copy(center);
  }
}
