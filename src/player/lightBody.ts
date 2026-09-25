/* A body of clear light: the recorded figure's own mesh, drawn as translucent glass.
   Faint where you look straight through it, bright along its outline where the light grazes
   it, with a glossy sheen that catches the moon and the sky. Used for the wanderer and, in
   their own colours, for the archetypes. */
import * as THREE from "three";

/** `glow`: how much light it holds (inner, at its edge) and how present its body is where you
    look straight through it. The default is the wanderer's timid light; creatures of the deep
    glow more. */
export function lightBodyMaterial(
  tint: THREE.Color = new THREE.Color(1.0, 0.86, 0.66),
  glow: { inner: number; edge: number; body: number } = { inner: 0.17, edge: 0.6, body: 0.32 },
): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({
    color: tint.clone().multiplyScalar(0.5),
    emissive: tint,
    emissiveIntensity: 1,
    roughness: 0.22,
    metalness: 0.1,
    transparent: true,
    opacity: 1, // the whole body's presence: fades to 0 as it becomes an orb in water
    depthWrite: false, // light, not a solid: it never shadows itself in the ambient occlusion
  });
  // each glow compiles its own program (three.js would otherwise share the first one)
  m.customProgramCacheKey = () => `lightbody:${glow.inner}:${glow.edge}:${glow.body}`;
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = { value: 0 };
    m.userData.shader = sh;
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform float uTime;")
      .replace(
        "#include <emissivemap_fragment>",
        `#include <emissivemap_fragment>
        {
          vec3 vdir=normalize(vViewPosition);
          float fr=pow(1.0-abs(dot(normal,vdir)),2.2);
          // a slow current of light rising through the body
          float cur=0.5+0.5*sin(-vViewPosition.y*6.0+uTime*1.4+sin(vViewPosition.x*9.0)*0.8);
          // a timid light, held within: faint through the body, a soft line at its edge
          totalEmissiveRadiance=emissive*(${glow.inner.toFixed(3)}+fr*${glow.edge.toFixed(3)}+cur*0.04);
          diffuseColor.a=opacity*mix(${glow.body.toFixed(3)},0.85,fr);
        }`,
      );
  };
  return m;
}

/** Keep the body's inner current flowing. */
export function tickLightBody(m: THREE.Material, t: number): void {
  const sh = (m.userData as { shader?: { uniforms: Record<string, THREE.IUniform> } }).shader;
  if (sh) sh.uniforms.uTime.value = t;
}
