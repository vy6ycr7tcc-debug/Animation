/* Dawn sky. One GLSL function, used by the sky dome and by the water's reflection,
   so the lake reflects the sky truthfully. `uDawn` (0–1) is the journey's progress:
   first light at 0, full sunrise at 1. */
import * as THREE from "three";

export const skyUniforms = {
  uSun: { value: new THREE.Vector3() },
  uDawn: { value: 0 },
  uT: { value: 0 },
};

export const SKY_GLSL = /* glsl */ `
uniform vec3 uSun;
uniform float uDawn;
vec3 skyColor(vec3 d){
  float y=d.y;
  vec3 zen=mix(vec3(0.07,0.09,0.24),vec3(0.24,0.38,0.66),uDawn);
  vec3 mid=mix(vec3(0.34,0.28,0.50),vec3(0.60,0.64,0.84),uDawn);
  vec3 hor=mix(vec3(0.98,0.56,0.46),vec3(1.00,0.84,0.66),uDawn);
  float hy=max(y,0.0);
  vec3 c=mix(hor,mid,smoothstep(0.0,0.2,hy));
  c=mix(c,zen,smoothstep(0.18,0.85,hy));
  if(y<0.0)c=mix(hor,hor*0.55,smoothstep(0.0,-0.25,y));
  float sd=max(dot(d,uSun),0.0);
  vec3 sunC=vec3(1.0,0.74,0.48);
  c+=sunC*pow(sd,6.0)*0.30;
  c+=sunC*pow(sd,48.0)*0.55;
  c+=vec3(1.0,0.93,0.82)*smoothstep(0.99955,0.99975,sd)*7.0;
  // warm haze along the horizon, strongest under the sun
  vec2 dh=normalize(d.xz+vec2(1e-4)),sh=normalize(uSun.xz+vec2(1e-4));
  float az=max(dot(dh,sh),0.0);
  c+=vec3(1.0,0.52,0.40)*pow(az,3.0)*exp(-abs(y)*10.0)*0.35;
  return c;
}`;

/** Sun direction for a given dawn value: low in the east at first light, higher at full sunrise. */
export function sunDirection(dawn: number, out = new THREE.Vector3()): THREE.Vector3 {
  const elev = THREE.MathUtils.degToRad(THREE.MathUtils.lerp(3.5, 24, dawn));
  const az = THREE.MathUtils.degToRad(-8); // just right of straight ahead from the start
  return out.set(Math.sin(az) * Math.cos(elev), Math.sin(elev), -Math.cos(az) * Math.cos(elev)).normalize();
}

export function buildSky(): THREE.Mesh {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: skyUniforms,
    vertexShader: /* glsl */ `varying vec3 vD;void main(){vD=position;vec4 p=projectionMatrix*modelViewMatrix*vec4(position,1.0);gl_Position=p.xyww;}`,
    fragmentShader: /* glsl */ `precision highp float;varying vec3 vD;uniform float uT;
      ${SKY_GLSL}
      float h3(vec3 p){return fract(sin(dot(p,vec3(12.9898,78.233,37.719)))*43758.5453);}
      void main(){
        vec3 d=normalize(vD);
        vec3 c=skyColor(d);
        // The last stars, fading as the sun rises.
        vec3 q=d*260.0;vec3 cell=floor(q);float h=h3(cell);vec3 f=fract(q)-0.5;
        float star=step(0.9935,h)*smoothstep(0.24,0.0,length(f))*(0.65+0.35*sin(uT*(0.8+h*2.0)+h*50.0));
        c+=vec3(1.0,0.95,0.9)*star*smoothstep(0.25,0.7,d.y)*(1.0-uDawn)*0.9;
        gl_FragColor=vec4(c,1.0);
      }`,
  });
  const m = new THREE.Mesh(new THREE.SphereGeometry(1000, 48, 24), mat);
  m.frustumCulled = false;
  m.renderOrder = -1;
  return m;
}
