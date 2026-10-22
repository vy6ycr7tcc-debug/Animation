/* Wet reflections (the owner: "indeed wet reflections are an incredible tool for realism"; he chose
   wet surfaces only, on the Best and High levels). Nothing else in the world mirrors anything (the
   standing rule since the galaxies' blobs: no baked sky, no mirrored world in the lakes); this is
   the one exception, and only where water lies on something:
   - the shore's wet band, and the Nile's banks;
   - in rain, the open ground a little and puddles in its flat hollows, and stone and rock;
   - the floors of the crystal caverns and the gold mines, always.
   Each material says how wet it is through `setWet` (its normal and its wetness, written by the
   scene pass into one extra small target, "wet"); the post chain then marches a short ray across
   the screen from each wet pixel only and lays what it meets over it, by the Fresnel of water.
   A ray that leaves the screen or meets nothing takes the air's own colour: a plain colour, never a
   picture of the sky, so nothing slides over the ground (underground, the water's own floor,
   darker). `?wetdebug` shows what is wet; `?wet=0` turns it all off, to compare in `#stats`. */
import * as THREE from "three/webgpu";
import { fogUniforms, T, type N } from "./tsl";

const { Break, clamp, dot, float, Fn, getScreenPosition, getViewPosition, If, length, Loop, max, mix, normalize, perspectiveDepthToViewZ, pow, reference, smoothstep, uniform, uv, vec2, vec4 } = T;

export const wetUniforms = {
  /** How wet the open world is from rain (0 dry … 1 soaked): rises as it rains, dries slowly after. */
  rain: uniform(0),
  /** 1 under the open sky, where a ray that meets nothing sees the air; 0 in the places apart (the
      caves, the mines), where it sees the dark. */
  air: uniform(1),
};

/** The current material's wet output (its `setWet`), or nothing. Read by the scene pass only. */
class MaterialWet extends THREE.Node {
  constructor() {
    super("vec4");
  }
  setup(builder: THREE.NodeBuilder): THREE.Node {
    const n = (builder.material as THREE.Material | undefined)?.userData?.wetNode as THREE.Node | undefined;
    return n ?? vec4(0);
  }
}
export const materialWet = (): N => T.nodeObject(new MaterialWet());

/** Say how wet a material is (0 … 1, a node). `flat` (0 … 1) lays the reflecting surface level, as
    water lies in a puddle, instead of following the material's own relief. */
export function setWet(m: THREE.Material, wet: N, flat?: N): void {
  const up = normalize(T.cameraViewMatrix.mul(vec4(0, 1, 0, 0)).xyz);
  const n = flat ? normalize(mix(T.normalView, up, clamp(flat, 0, 1))) : T.normalView;
  m.userData.wetNode = vec4(n.mul(0.5).add(0.5), clamp(wet, 0, 1));
}

/** The reflections over a lit image: each wet pixel marches a ray in view space across the depth
    buffer (28 steps, longer the farther away, refined by halving), and what it meets is laid over
    the surface by water's Fresnel and by how wet it is, fading at the screen's edges and with the
    ray's length. `on` and `under` rest it without a rebuild. `colorTex` is the scene's own image
    (what the rays see), `color` the image being finished. */
export function wetReflections(color: N, colorTex: N, depth: N, wetTex: N, camera: THREE.PerspectiveCamera, on: N, under: N): N {
  const proj = reference("projectionMatrix", "mat4", camera);
  const projInv = reference("projectionMatrixInverse", "mat4", camera);
  const near = reference("near", "float", camera), far = reference("far", "float", camera);
  const STEPS = 28;
  return Fn(() => {
    const out = vec4(color).toVar();
    const q = uv();
    const W = wetTex.sample(q).toVar();
    If(W.a.greaterThan(0.02).and(on.greaterThan(0.5)).and(under.lessThan(0.5)), () => {
      const d = depth.sample(q).r;
      const P = getViewPosition(q, d, projInv).toVar();
      const n = normalize(W.xyz.mul(2).sub(1)).toVar();
      const v = normalize(P).toVar();
      const r = normalize(T.reflect(v, n)).toVar();
      const maxLen = clamp(length(P).mul(1.2), 6, 70).toVar();
      const O = P.add(n.mul(0.04)).toVar();
      const hit = float(0).toVar(), huv = vec2(0).toVar(), tHit = float(0).toVar();
      const t0 = float(0).toVar();
      Loop(STEPS, ({ i }: { i: N }) => {
        const t = pow(float(i).add(1).div(STEPS), 1.7).mul(maxLen);
        const p = O.add(r.mul(t));
        If(p.z.greaterThan(near.negate()), () => {
          Break();
        });
        const s = getScreenPosition(p, proj);
        If(s.x.lessThan(0).or(s.x.greaterThan(1)).or(s.y.lessThan(0)).or(s.y.greaterThan(1)), () => {
          Break();
        });
        const sz = perspectiveDepthToViewZ(depth.sample(s).r, near, far);
        const diff = sz.sub(p.z);
        const thick = t.sub(t0).mul(1.5).add(0.12);
        If(diff.greaterThan(0).and(diff.lessThan(thick)), () => {
          hit.assign(1);
          tHit.assign(t);
          Break();
        });
        t0.assign(t);
      });
      If(hit.greaterThan(0.5), () => {
        // refine between the last step short of the surface and the hit
        const a = t0.toVar(), b = tHit.toVar();
        Loop(5, () => {
          const m = a.add(b).mul(0.5);
          const p = O.add(r.mul(m));
          const s = getScreenPosition(p, proj);
          const sz = perspectiveDepthToViewZ(depth.sample(s).r, near, far);
          If(sz.greaterThan(p.z), () => {
            b.assign(m);
          }).Else(() => {
            a.assign(m);
          });
        });
        tHit.assign(b);
        huv.assign(getScreenPosition(O.add(r.mul(b)), proj));
      });
      const edge = smoothstep(0, 0.07, huv.x).mul(smoothstep(1, 0.93, huv.x)).mul(smoothstep(0, 0.07, huv.y)).mul(smoothstep(1, 0.93, huv.y));
      const reach = float(1).sub(smoothstep(0.55, 1, tHit.div(maxLen)));
      const got = hit.mul(edge).mul(reach);
      // what it meets; where it meets nothing, the air's own colour (never a picture of the sky)
      const air = fogUniforms.color.mul(0.9).add(fogUniforms.glow.mul(pow(max(dot(r, normalize(T.cameraViewMatrix.mul(vec4(fogUniforms.glowDir, 0)).xyz)), 0), 8).mul(0.25)));
      // (underground there is no air to see: the water there shows the floor under it, darker)
      const miss = mix(out.rgb.mul(0.45), air, wetUniforms.air);
      const seen = mix(miss, colorTex.sample(huv).rgb, got);
      // water's Fresnel (F0 0.02), stronger as you look along the surface
      const cosV = clamp(dot(v.negate(), n), 0, 1);
      const fres = float(0.02).add(float(0.98).mul(pow(float(1).sub(cosV), 5)));
      const k = clamp(W.a.mul(fres.mul(0.85).add(0.15)), 0, 0.92);
      out.assign(vec4(mix(out.rgb, seen, k), out.a));
    });
    return out;
  })();
}
