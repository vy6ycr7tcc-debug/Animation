/* A body of clear light: the recorded figure's own mesh, drawn as translucent glass.
   Faint where you look straight through it, bright along its outline where the light grazes
   it, with a glossy sheen that catches the moon and the sky. Used for the wanderer and, in
   their own colours, for the archetypes. */
import * as THREE from "three/webgpu";
import { T, fogUniforms } from "../gpu/tsl";

const { abs, cameraViewMatrix, clamp, dot, float, materialEmissive, materialOpacity, mix, normalize, normalView, positionView, pow, sin, uniform, vec4 } = T;

/** `glow`: how much light it holds (inner, at its edge) and how present its body is where you
    look straight through it. The default is the wanderer's timid light; creatures of the deep
    glow more. */
export function lightBodyMaterial(
  tint: THREE.Color = new THREE.Color(1.0, 0.86, 0.66),
  glow: { inner: number; edge: number; body: number } = { inner: 0.17, edge: 0.6, body: 0.32 },
): THREE.MeshStandardNodeMaterial {
  const m = new THREE.MeshStandardNodeMaterial({
    color: tint.clone().multiplyScalar(0.5),
    emissive: tint,
    emissiveIntensity: 1,
    roughness: 0.22,
    metalness: 0.1,
    transparent: true,
    opacity: 1, // the whole body's presence: fades to 0 as it becomes an orb in water
    depthWrite: false, // light, not a solid: it never shadows itself in the ambient occlusion
  });
  const uTime = uniform(0);
  m.userData.uTime = uTime;
  const vdir = normalize(positionView.negate());
  const nv = abs(dot(normalView, vdir));
  const fr = pow(float(1).sub(nv), 2.2);
  // the light at its edge, softer: a broad gathering toward the outline under a fine line, so the
  // body reads as clear light deepening to its rim, not glass with a drawn edge
  const edge = pow(float(1).sub(nv), 1.4).mul(0.35).add(pow(float(1).sub(nv), 3.5).mul(0.65));
  // a slow current of light rising through the body
  const cur = sin(positionView.y.mul(6).add(uTime.mul(1.4)).add(sin(positionView.x.negate().mul(9)).mul(0.8))).mul(0.5).add(0.5);
  // translucency: where the moon or the low sun is behind the body, its light comes through it,
  // most through the thin parts seen edge-on, in the colour of that light in the air
  const toLight = normalize(cameraViewMatrix.mul(vec4(fogUniforms.glowDir, 0)).xyz);
  const through = pow(clamp(dot(vdir.negate(), toLight), 0, 1), 3).mul(mix(float(0.5), float(1), float(1).sub(nv)));
  // a timid light, held within: faint through the body, a soft line at its edge
  m.emissiveNode = materialEmissive.mul(edge.mul(glow.edge).add(glow.inner).add(cur.mul(0.04))).add(fogUniforms.glow.mul(through).mul(glow.inner * 1.6));
  m.opacityNode = materialOpacity.mul(mix(glow.body, 0.85, fr));
  return m;
}

/** Keep the body's inner current flowing. */
export function tickLightBody(m: THREE.Material, t: number): void {
  const u = (m.userData as { uTime?: { value: number } }).uTime;
  if (u) u.value = t;
}
