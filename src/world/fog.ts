/* Atmosphere with depth. The air is thickest low over the ground and water and thins with
   height, so valleys fill with haze while hilltops and far peaks stand clear above it, layer
   behind layer. Looking toward the moon, the haze glows warm with its light.
   Installed once into three.js's own fog chunks, so every standard material shares it; custom
   shaders include IJ_FOG_GLSL and call ijFog(). */
import * as THREE from "three";
import { starDirection } from "./sky";

export const FOG = {
  color: new THREE.Color(0.105, 0.1, 0.22), // matches the sky at the horizon
  moon: new THREE.Color(0.55, 0.42, 0.34),
  density: 0.0052, // per metre, at the water's surface
  falloff: 0.045, // how quickly the air clears with height
  haze: 0.00045, // a thin haze at every height
};

const v3 = (v: THREE.Vector3 | THREE.Color) => {
  const [a, b, c] = v instanceof THREE.Color ? [v.r, v.g, v.b] : [v.x, v.y, v.z];
  return `vec3(${a.toFixed(4)},${b.toFixed(4)},${c.toFixed(4)})`;
};

/** GLSL: vec4 ijFog(vec3 worldPos) → rgb: the colour of the air along that ray, a: how much of it. */
export const IJ_FOG_GLSL = /* glsl */ `
vec4 ijFog(vec3 p){
  vec3 rd=p-cameraPosition;float d=length(rd);rd/=max(d,1e-4);
  float a=${FOG.falloff.toFixed(4)};
  float k=a*rd.y*d;
  float integ=abs(k)>1e-3?(1.0-exp(-k))/k:1.0-0.5*k;
  float depth=${FOG.density.toFixed(5)}*d*exp(-a*max(cameraPosition.y,0.0))*integ+${FOG.haze.toFixed(5)}*d;
  float f=1.0-exp(-depth);
  float moon=pow(max(dot(rd,${v3(starDirection())}),0.0),5.0);
  vec3 col=mix(${v3(FOG.color)},${v3(FOG.moon)},moon*0.7);
  // a touch lighter near the ground, where the haze gathers
  col*=1.0+0.1*exp(-max(p.y,0.0)*0.08);
  return vec4(col,clamp(f,0.0,1.0));
}`;

let installed = false;
export function installFog(): void {
  if (installed) return;
  installed = true;
  const C = THREE.ShaderChunk as unknown as Record<string, string>;
  C.fog_pars_vertex = `#ifdef USE_FOG\nvarying float vFogDepth;\nvarying vec3 vFogWorld;\n#endif`;
  C.fog_vertex = `#ifdef USE_FOG\nvFogDepth=-mvPosition.z;\nvFogWorld=cameraPosition+transpose(mat3(viewMatrix))*mvPosition.xyz;\n#endif`;
  C.fog_pars_fragment = `#ifdef USE_FOG\nuniform vec3 fogColor;\nvarying float vFogDepth;\nvarying vec3 vFogWorld;\n#ifdef FOG_EXP2\nuniform float fogDensity;\n#else\nuniform float fogNear;\nuniform float fogFar;\n#endif\n${IJ_FOG_GLSL}\n#endif`;
  C.fog_fragment = `#ifdef USE_FOG\nvec4 ijF=ijFog(vFogWorld);\ngl_FragColor.rgb=mix(gl_FragColor.rgb,ijF.rgb,ijF.a);\n#endif`;
}
