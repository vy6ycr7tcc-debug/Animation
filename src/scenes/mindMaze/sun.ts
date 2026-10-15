/* The sun over the mind's maze (the owner: "a realistic sun above the maze, with plasma and magma
   coming out… when contemplating, the view goes to the sun exploding light and nourishing the
   mind"). It hangs beyond the sanctuary under the storm, seen from the way in:
   - a photosphere of churning plasma: granules boiling at two scales, slow rivers of magma,
     dark sunspots, the limb darkening and reddening as real suns do;
   - a corona round it, torn into slow streamers;
   - prominences: loops of magma arching out of the surface and falling back along them, and
     ejecta flung out and fading;
   - nourishing: while you contemplate, it flares brighter, its corona swells in slow bursts,
     more magma leaps from it, and its eruptions grow: fountains of magma bursting out of the
     surface, arcing and falling back (nothing comes down to the wanderer: the owner).
   Contained: its light is warm and strong but no glare spreads from it. */
import * as THREE from "three/webgpu";
import { T, type N } from "../../gpu/tsl";
import { pointCloud, touch, seeded } from "../densities/roomKit";

const { float, vec3, vec4, sin, cos, mix, smoothstep, pow, fract, floor, normalize, uniform, uv } = T;

/** Where the sun hangs (the maze's frame) and its radius (m). */
// hovering high over the middle of the maze, under the storm ceiling (the owner: "the sun is
// supposed to hover in the middle above"); contemplating, the view turns to it from wherever you are
export const SUN_AT = new THREE.Vector3(0, 80, -16);
export const SUN_R = 13;

export interface MazeSun {
  /** 0..1: contemplating, it flares and pours its light down. */
  nourish: ReturnType<typeof uniform>;
  /** Where the wanderer's head is (the maze's frame), for the stream of light. */
  head: ReturnType<typeof uniform>;
}

export function buildSun(g: THREE.Group, t: N, ours: { dispose(): void }[], phone: boolean): MazeSun {
  const nourish = uniform(0);
  const head = uniform(new THREE.Vector3(0, 2, 40));
  const R = seeded(424242);
  const S = vec3(SUN_AT.x, SUN_AT.y, SUN_AT.z);
  // a slow burst every ~7 s while nourishing: the light "exploding"
  const burst = pow(fract(t.mul(0.14)).oneMinus(), 3).mul(nourish);

  /* ---- the photosphere ---- */
  {
    const geo = new THREE.IcosahedronGeometry(SUN_R, 6);
    const m = new THREE.MeshBasicNodeMaterial({ fog: false });
    const p = normalize(T.positionGeometry);
    const fl = vec3(t.mul(0.021), t.mul(-0.013), t.mul(0.017));
    // slow rivers of magma, folded by themselves
    const warp = vec3(T.mx_noise_float(p.mul(1.6).add(fl)), T.mx_noise_float(p.mul(1.6).add(fl).add(7.3)), T.mx_noise_float(p.mul(1.6).add(fl).add(13.1)));
    const flow = T.mx_fractal_noise_float(p.mul(2.6).add(warp.mul(0.9)).add(fl.mul(2)), 4, 2, 0.55).mul(0.5).add(0.5);
    // granules boiling: bright cells, dark lanes between them, at two scales
    const gran = T.mx_worley_noise_float(p.mul(15).add(warp.mul(0.4)).add(vec3(0, 0, t.mul(0.18))));
    const gran2 = T.mx_worley_noise_float(p.mul(38).add(vec3(t.mul(0.3), 0, 0)));
    const cells = smoothstep(0.75, 0.1, gran).mul(0.7).add(smoothstep(0.7, 0.1, gran2).mul(0.3));
    // sunspots: a few dark umbrae in paler penumbrae
    const spotN = T.mx_noise_float(p.mul(2.2).add(vec3(3.1, t.mul(0.004), 1.7)));
    const umbra = smoothstep(0.42, 0.55, spotN), penumbra = smoothstep(0.3, 0.42, spotN);
    let heat: N = flow.mul(0.55).add(cells.mul(0.45));
    heat = heat.mul(float(1).sub(penumbra.mul(0.35))).mul(float(1).sub(umbra.mul(0.75)));
    const col = mix(mix(vec3(0.55, 0.08, 0.02), vec3(1.15, 0.42, 0.08), smoothstep(0.15, 0.55, heat)), vec3(1.55, 1.08, 0.62), smoothstep(0.55, 0.95, heat));
    // the limb: darker and redder toward the edge, as a real sun's
    const V = normalize(T.cameraPosition.sub(T.positionWorld));
    const mu = T.max(T.dot(T.normalWorld, V), 0);
    const limb = pow(mu, 0.55).mul(0.75).add(0.25);
    const redden = mix(vec3(1.0, 0.45, 0.25), vec3(1), smoothstep(0.0, 0.5, mu));
    m.colorNode = vec4(col.mul(limb).mul(redden).mul(float(0.85).add(nourish.mul(0.35)).add(burst.mul(0.35))), 1);
    const mesh = new THREE.Mesh(geo, m);
    mesh.position.copy(SUN_AT);
    mesh.name = "maze-sun";
    g.add(mesh);
    ours.push(geo, m);
  }

  /* ---- the corona: a soft halo torn into slow streamers, behind the disc ---- */
  {
    const m = new THREE.SpriteNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
    const q = uv().sub(0.5).mul(2); // -1..1 over the sprite
    const r = T.length(q);
    const limbR = float(1 / 2.4); // the disc's radius in sprite units
    const ang = T.atan(q.y, q.x);
    const streak = T.mx_noise_float(vec3(ang.mul(3.2), r.mul(1.4).sub(t.mul(0.05)), t.mul(0.03))).mul(0.5).add(0.5);
    const out = T.max(r.sub(limbR), 0).div(float(1).sub(limbR)); // 0 at the limb, 1 at the sprite's edge
    const reach = float(0.8).add(nourish.mul(0.4)).add(burst.mul(0.8));
    // a tight bright rim, a softer halo and streamers, all gone well before the sprite's edge
    const glow = T.exp(out.mul(-22).div(reach)).mul(0.6).add(T.exp(out.mul(-7).div(reach)).mul(pow(streak, 2)).mul(0.5));
    const edge = pow(float(1).sub(T.min(out, 1)), 2);
    m.colorNode = vec4(vec3(1.2, 0.6, 0.22).mul(glow).mul(edge).mul(float(0.5).add(nourish.mul(0.4)).add(burst.mul(0.6))), 1);
    const sp = new THREE.Sprite(m);
    sp.position.copy(SUN_AT);
    sp.scale.setScalar(SUN_R * 2 * 2.4);
    sp.renderOrder = -1;
    g.add(sp);
    ours.push(m);
  }

  /* ---- prominences and ejecta: magma arching out of the surface along loops and falling back,
     and some flung out, fading as it goes ---- */
  {
    const LOOPS = 14, N_ = phone ? 2400 : 4000;
    const c = pointCloud(N_, 0.55);
    const loops: [number, number, number][] = [];
    for (let i = 0; i < LOOPS; i++) {
      const u = R() * 2 - 1, a = R() * Math.PI * 2, s = Math.sqrt(1 - u * u);
      loops.push([s * Math.cos(a), u, s * Math.sin(a)]);
    }
    for (let i = 0; i < N_; i++) {
      const L = loops[i % LOOPS];
      c.pos.set(L, i * 3);
      // x: the loop's turn, y: where on it, z: its height, w: whether flung out (and its spread)
      const li = (i % LOOPS) / LOOPS;
      c.k.set([li * 7.13 % 1, R(), (li * 3.7 + 0.2) % 1, R()], i * 4);
    }
    touch(c.cloud);
    const K = c.cloud.nodes.aK;
    const d = normalize(c.cloud.nodes.position);
    const a1 = normalize(T.cross(d, normalize(vec3(0.3, 1, 0.2))));
    const a2 = T.cross(d, a1);
    const turn = K.x.mul(Math.PI * 2);
    const tang = a1.mul(cos(turn)).add(a2.mul(sin(turn)));
    // along the loop, flowing; the loop breathes in height, higher while nourishing
    const s = fract(K.y.add(t.mul(float(0.035).add(K.z.mul(0.04)))));
    const span = float(0.38).add(K.z.mul(0.3));
    const th = s.sub(0.5).mul(span);
    const hgt = float(SUN_R).mul(float(0.22).add(K.z.mul(0.5))).mul(sin(t.mul(0.21).add(K.z.mul(40))).mul(0.25).add(1)).mul(float(1).add(nourish.mul(0.5)).add(burst.mul(0.5)));
    const jit = vec3(sin(K.w.mul(91)), cos(K.w.mul(57)), sin(K.w.mul(33))).mul(0.35);
    const loopP = d.mul(cos(th)).add(tang.mul(sin(th))).mul(float(SUN_R).add(hgt.mul(sin(s.mul(Math.PI))))).add(jit);
    // ejecta: some fly straight out, fading; more of them while nourishing
    const flung = T.step(float(0.86).sub(nourish.mul(0.18)), K.w);
    const fl = fract(K.y.add(t.mul(0.05)));
    const spread = vec3(sin(K.w.mul(211)), cos(K.w.mul(173)), sin(K.w.mul(97))).mul(0.35);
    const ejP = normalize(d.add(spread)).mul(float(SUN_R).add(fl.mul(SUN_R * 2.6)));
    const P = mix(loopP, ejP, flung);
    c.material.positionNode = S.add(P);
    // magma: white-gold where it leaves the surface, through orange to a dull red ember
    const age = mix(sin(s.mul(Math.PI)), fl, flung);
    const hot = mix(vec3(1.4, 0.95, 0.5), mix(vec3(1.1, 0.38, 0.08), vec3(0.45, 0.07, 0.03), smoothstep(0.4, 1, age)), smoothstep(0.05, 0.4, age));
    const fade = mix(float(1), smoothstep(1, 0.55, fl), flung);
    c.material.colorNode = vec4(hot.mul(c.round).mul(fade).mul(float(0.55).add(nourish.mul(0.45))), 1);
    c.cloud.sprite.frustumCulled = false;
    g.add(c.cloud.sprite);
    ours.push(c.material);
  }

  /* ---- eruptions: every few seconds magma bursts out of one place on the surface in a great
     fountain, arcs out and falls back, white-hot to ember (the owner: "explosions of magma out of
     the sun"); a quiet one now and then, great ones while you contemplate ---- */
  {
    const SITES = 3, N_ = phone ? 1800 : 3000;
    const c = pointCloud(N_, 0.5);
    for (let i = 0; i < N_; i++) c.k.set([(i % SITES) / SITES, R(), R(), R()], i * 4);
    touch(c.cloud);
    const K = c.cloud.nodes.aK;
    // each site keeps its own clock, a burst every ~7 s, a new place on the surface each time
    const cyc = t.mul(0.14).add(K.x);
    const n = floor(cyc);
    const e = fract(cyc).mul(1 / 0.14); // seconds since this site's burst
    const h1 = fract(sin(n.mul(12.9898).add(K.x.mul(78.233))).mul(43758.5453));
    const h2 = fract(sin(n.mul(39.346).add(K.x.mul(11.135))).mul(24634.6345));
    const zz = h1.mul(2).sub(1), az = h2.mul(Math.PI * 2), rr = T.sqrt(float(1).sub(zz.mul(zz)));
    const site = vec3(rr.mul(cos(az)), zz, rr.mul(sin(az)));
    // a fountain: each drop leaves in a cone about the site's normal, slows under the sun's pull
    // and falls back; the strength grows while contemplating
    const cone = vec3(sin(K.y.mul(91)), cos(K.z.mul(57)), sin(K.w.mul(33))).mul(0.55);
    const dir = normalize(site.add(cone));
    const strength = float(0.35).add(nourish.mul(0.65));
    const v = mix(float(5), float(15), K.w).mul(strength.mul(0.7).add(0.3));
    const out = v.mul(e).sub(e.mul(e).mul(1.9)).max(0);
    c.material.positionNode = S.add(site.mul(SUN_R * 0.97)).add(dir.mul(out));
    const age = e.div(5.5).min(1);
    const hot = mix(vec3(1.5, 1.05, 0.55), mix(vec3(1.2, 0.42, 0.08), vec3(0.4, 0.06, 0.02), smoothstep(0.45, 1, age)), smoothstep(0.03, 0.35, age));
    const alive = smoothstep(0, 0.12, e).mul(smoothstep(5.8, 3.8, e)).mul(T.step(0.001, out));
    c.material.colorNode = vec4(hot.mul(c.round).mul(alive).mul(strength).mul(0.9), 1);
    c.cloud.sprite.frustumCulled = false;
    g.add(c.cloud.sprite);
    ours.push(c.material);
  }

  return { nourish, head };
}
