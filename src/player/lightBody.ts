/* A body of clear light: the recorded figure's own mesh, drawn as translucent glass.
   Faint where you look straight through it, bright along its outline where the light grazes
   it, with a glossy sheen that catches the moon and the sky. Used for the wanderer and, in
   their own colours, for the archetypes. */
import * as THREE from "three/webgpu";
import { T } from "../gpu/tsl";

const { abs, dot, float, materialEmissive, materialOpacity, mix, normalize, normalView, positionView, pow, sin, uniform } = T;

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
  const fr = pow(float(1).sub(abs(dot(normalView, vdir))), 2.2);
  // a slow current of light rising through the body
  const cur = sin(positionView.y.mul(6).add(uTime.mul(1.4)).add(sin(positionView.x.negate().mul(9)).mul(0.8))).mul(0.5).add(0.5);
  // a timid light, held within: faint through the body, a soft line at its edge
  m.emissiveNode = materialEmissive.mul(fr.mul(glow.edge).add(glow.inner).add(cur.mul(0.04)));
  m.opacityNode = materialOpacity.mul(mix(glow.body, 0.85, fr));
  return m;
}

/** Keep the body's inner current flowing. */
export function tickLightBody(m: THREE.Material, t: number): void {
  const u = (m.userData as { uTime?: { value: number } }).uTime;
  if (u) u.value = t;
}
