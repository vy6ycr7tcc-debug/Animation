/* The night sky: velvet indigo, a field of stars, and one bright gold star low over the
   island. The same function colours the water's reflection, so the lake mirrors the sky
   truthfully, the star included. `uLight` (0–1) is how much the sky has brightened by the
   end of the journey. */
import * as THREE from "three";

export const skyUniforms = {
  uStar: { value: new THREE.Vector3() }, // direction to the bright star
  uLight: { value: 0 },
  uT: { value: 0 },
  uStarBoost: { value: 0 }, // stars emerge while the wanderer sits in stillness
};

export const SKY_GLSL = /* glsl */ `
uniform vec3 uStar;
uniform float uLight;
uniform float uT;
uniform float uStarBoost;
float skyHash(vec3 p){return fract(sin(dot(p,vec3(12.9898,78.233,37.719)))*43758.5453);}
vec3 skyColor(vec3 d){
  float y=d.y;
  // a luminous night: deep blue overhead, lilac haze at the horizon (the fog's own colour)
  vec3 zen=mix(vec3(0.016,0.022,0.072),vec3(0.03,0.04,0.11),uLight);
  vec3 mid=mix(vec3(0.038,0.043,0.12),vec3(0.07,0.07,0.19),uLight);
  vec3 hor=mix(vec3(0.105,0.100,0.220),vec3(0.20,0.15,0.30),uLight);
  float hy=max(y,0.0);
  vec3 c=mix(hor,mid,smoothstep(0.0,0.22,hy));
  c=mix(c,zen,smoothstep(0.2,0.9,hy));
  if(y<0.0)c=hor*mix(1.0,0.5,smoothstep(0.0,-0.25,y));
  // a faint band of the galaxy
  float band=exp(-pow(dot(d,normalize(vec3(0.5,0.35,0.8))),2.0)*18.0);
  c+=vec3(0.035,0.03,0.07)*band*smoothstep(-0.05,0.3,y);
  // stars
  vec3 q=d*230.0;vec3 cell=floor(q);float h=skyHash(cell);vec3 f=fract(q)-0.5;
  float tw=0.7+0.3*sin(uT*(0.7+h*2.0)+h*60.0);
  float star=step(0.988,h)*smoothstep(0.26,0.0,length(f))*tw;
  c+=mix(vec3(0.75,0.85,1.0),vec3(1.0,0.9,0.75),step(0.995,h))*star*smoothstep(-0.02,0.2,y)*(0.9+band)*(1.0+uStarBoost);
  // fainter stars that only appear in stillness
  float h2=skyHash(cell+17.0);c+=vec3(0.8,0.85,1.0)*step(0.965,h2)*smoothstep(0.2,0.0,length(f))*uStarBoost*0.5*smoothstep(0.0,0.2,y);
  // the bright star: a gold point with a soft halo
  float sd=max(dot(d,uStar),0.0);
  c+=vec3(1.0,0.80,0.50)*pow(sd,4000.0)*14.0;
  c+=vec3(1.0,0.72,0.42)*pow(sd,300.0)*0.30;
  // the moon's glow in the haze, matching the fog's light toward it
  c=mix(c,vec3(0.55,0.42,0.34),pow(sd,5.0)*0.7*(1.0-smoothstep(0.0,0.35,hy)));
  c+=vec3(0.35,0.28,0.3)*pow(sd,24.0)*0.35;
  return c;
}`;

export function starDirection(out = new THREE.Vector3()): THREE.Vector3 {
  // Low over the island, straight ahead from the shore.
  return out.set(0.06, 0.16, -1).normalize();
}

export function buildSky(): THREE.Mesh {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: skyUniforms,
    vertexShader: /* glsl */ `varying vec3 vD;void main(){vD=position;vec4 p=projectionMatrix*modelViewMatrix*vec4(position,1.0);gl_Position=p.xyww;}`,
    fragmentShader: /* glsl */ `precision highp float;varying vec3 vD;
      ${SKY_GLSL}
      void main(){gl_FragColor=vec4(skyColor(normalize(vD)),1.0);}`,
  });
  const m = new THREE.Mesh(new THREE.SphereGeometry(1000, 48, 24), mat);
  m.frustumCulled = false;
  m.renderOrder = -1;
  return m;
}
