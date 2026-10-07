/* The war in heaven (master prompt 2E; the visual Bible's Battle of Heaven: "celestial, painterly,
   overwhelming light: golden clouds, winged figures, radiance vs shadow; awe, not horror"; beat 5's
   own words: "watch them the way you would watch weather, immense, slow, already passing"; "the
   ribbons of intention arcing across the sky, the arms of thought"). The sky over the vale becomes
   the battle:
   - a vast vortex of cloud turning slowly, gold-rimmed toward its eye and slate-blue to its edges,
     light breaking through the eye and falling in shafts onto the vale;
   - two hosts in flight round it, each of many small winged shapes of light (a bright body, two
     wings beating slowly): the guardians in gold one way, the shadowed ones in silver-blue the
     other; where the shadow passes the gold dims (they drink light);
   - ribbons of intention arcing across the sky between them, pulses running along them;
   - and as the telling ends, the hosts slow, the clouds part and the eye softens: weather passing.
   It all follows one number, how far beat 5 has been told (0 … 1). Contained: the eye is the only
   bright thing; the hosts are small soft points; the clouds are painted, not lit. Room frame. */
import * as THREE from "three/webgpu";
import { T, type N } from "../../gpu/tsl";
import { ribbonGeometry, ribbonMaterial } from "../../gpu/ribbons";
import { keepAlpha, pointCloud, touch } from "../densities/roomKit";

const { abs, cos, exp, float, length, mix, pow, sin, smoothstep, uniform, vec3, vec4 } = T;
const V3 = THREE.Vector3;
const sm = (a: number, b: number, x: number) => {
  const k = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return k * k * (3 - 2 * k);
};

export function buildBattle(o: { centre: THREE.Vector3; R: () => number; t: N; fewer: number }) {
  const { centre: C, R, t } = o;
  const group = new THREE.Group();
  const own: { dispose(): void }[] = [];
  // the vortex's own frame: its face turned toward the vale (north and up), e1 across, e2 up it
  const Nv = new V3(0, 0.42, 1).normalize();
  const e1 = new V3(1, 0, 0);
  const e2 = new V3().crossVectors(Nv, e1).normalize();
  const RMAX = 105;
  const uForm = uniform(0); // the clouds gathering, the eye opening
  const uGold = uniform(0); // the guardians' host
  const uShadow = uniform(0); // the shadowed host
  const uArcs = uniform(0); // the ribbons of intention
  const uCalm = uniform(0); // passing: slower, parting, softer
  const uSpin = uniform(0); // the vortex's turning (integrated, so slowing never jumps)
  const uFly = uniform(0); // the hosts' flight along their rounds (integrated)
  const vC = vec3(C.x, C.y, C.z), vN = vec3(Nv.x, Nv.y, Nv.z), vE1 = vec3(e1.x, e1.y, e1.z), vE2 = vec3(e2.x, e2.y, e2.z);
  /** A point of the vortex's plane: angle a, radius r, depth d along its face's normal. */
  const onDisc = (a: N, r: N, d: N): N => vC.add(vE1.mul(cos(a).mul(r))).add(vE2.mul(sin(a).mul(r))).add(vN.mul(d));

  /* the vortex: two discs of painted cloud in its plane, turning at their own speeds (the nearer
     darker and slower: depth), swirled into arms about the eye, gold-lit toward it and slate-blue
     to their edges; the eye a hole the light pours through */
  const layer = (radius: number, depth: number, speed: number, shade: number, seedK: number, withEye: boolean) => {
    const geo = new THREE.CircleGeometry(radius, 128);
    const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false });
    const p = T.positionGeometry.xy.div(radius);
    const r = length(p);
    const th = T.atan(p.y, p.x);
    // the swirl: inner turns faster, arms wound in a spiral
    const ths = th.add(uSpin.mul(speed).mul(float(1.7).sub(r))).add(float(2.4).mul(float(1).sub(r)));
    const q = T.vec2(cos(ths), sin(ths)).mul(r.mul(2.6)).add(seedK);
    const n1 = T.mx_noise_float(vec3(q.mul(1.3), seedK)).mul(0.5).add(0.5);
    const n2 = T.mx_noise_float(vec3(q.mul(3.1).add(7), seedK + 3)).mul(0.5).add(0.5);
    const n3 = T.mx_noise_float(vec3(q.mul(7.3).add(2), seedK + 9)).mul(0.5).add(0.5);
    const arms = pow(sin(ths.mul(3).sub(T.log(r.add(0.05)).mul(4.2))).mul(0.5).add(0.5), 1.5);
    const dens = n1.mul(0.5).add(n2.mul(0.3)).add(n3.mul(0.2)).mul(0.75).add(arms.mul(0.35));
    // the eye: a hole, opening as the weather passes; the edge of the disc dissolving
    const eye = float(0.13).add(uCalm.mul(0.12));
    const hole = smoothstep(eye, eye.add(0.12), r);
    const edge = float(1).sub(smoothstep(0.72, 1, r));
    const cloud = smoothstep(0.42, 0.72, dens).mul(hole).mul(edge);
    // lit toward the eye: inner cloud gold and cream, a bright rim where it thins toward the eye
    const inner = float(1).sub(smoothstep(0.1, 0.42, r));
    // the gold lining: where an arm of cloud thins toward the eye its edge catches the light
    const rim = smoothstep(0.44, 0.52, dens).mul(float(1).sub(smoothstep(0.52, 0.66, dens))).mul(float(1).sub(smoothstep(0.2, 0.75, r)));
    const lightK = inner.mul(0.75).mul(uForm);
    const gold = vec3(1.05, 0.66, 0.22), amber = vec3(0.92, 0.48, 0.14), slate = vec3(0.12, 0.14, 0.22), charcoal = vec3(0.035, 0.04, 0.06);
    const dark = mix(charcoal, slate, n3.mul(0.7).add(0.15)).mul(shade);
    const lit = mix(amber, gold, n2);
    const col = mix(dark, lit, T.clamp(lightK, 0, 1)).add(vec3(1.0, 0.8, 0.45).mul(rim.mul(uForm).mul(0.9)));
    const cloudA = cloud.mul(0.94).mul(uForm.mul(0.85).add(0.15)).mul(float(1).sub(uCalm.mul(0.35)));
    if (withEye) {
      // the eye, painted into the far layer (a separate sprite for it took part in the depth sort
      // and cut a square out of the clouds): light pouring through the hole, slow rays turning in it
      const re = r.div(eye.add(0.06));
      const rays = pow(abs(sin(th.mul(7).add(t.mul(0.04)))), 3).mul(exp(r.mul(-7))).mul(0.25);
      const glow = exp(re.mul(re).mul(-2.2)).mul(1.8).add(exp(r.mul(-8)).mul(0.28)).add(rays).mul(uForm).mul(float(1).sub(uCalm.mul(0.35)));
      const glowA = T.clamp(glow, 0, 1);
      const outA = T.max(cloudA, glowA);
      const glowCol = vec3(1.0, 0.76, 0.42).mul(glow);
      m.colorNode = vec4(col.mul(cloudA).add(glowCol.mul(float(1).sub(cloudA))).div(T.max(outA, 0.001)), outA);
    } else m.colorNode = vec4(col, cloudA);
    const mesh = new THREE.Mesh(geo, m);
    // in the vortex's plane: the circle's +z turned to its face
    mesh.quaternion.setFromUnitVectors(new V3(0, 0, 1), Nv);
    mesh.position.copy(C).addScaledVector(Nv, depth);
    mesh.renderOrder = -1;
    mesh.frustumCulled = false;
    group.add(mesh);
    own.push(geo, m);
  };
  layer(RMAX * 1.25, -6, 1, 1, 1.3, true);
  layer(RMAX * 1.05, 12, 0.7, 0.75, 5.7, false);

  /* shafts of light from the eye down onto the vale */
  {
    const shaft = new THREE.CylinderGeometry(3, 9, 1, 20, 1, true);
    shaft.translate(0, -0.5, 0);
    const m = keepAlpha(new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    const core = pow(abs(T.dot(T.normalView, vec3(0, 0, 1))), 4);
    const along = T.positionGeometry.y.negate(); // 0 at the eye … 1 at the ground
    const fade = smoothstep(0, 0.12, along).mul(smoothstep(1, 0.55, along));
    m.colorNode = vec4(vec3(1, 0.84, 0.55).mul(core).mul(fade).mul(uForm.mul(0.06)).mul(sin(t.mul(0.12).add(T.positionWorld.x.mul(0.1))).mul(0.3).add(0.7)), 1);
    for (let i = 0; i < 6; i++) {
      const target = new V3(C.x - 30 + i * 12 + (R() - 0.5) * 6, 8, C.z + 40 + R() * 40);
      const from = new V3(C.x + (R() - 0.5) * 16, C.y + (R() - 0.5) * 10, C.z - 4);
      const len = from.distanceTo(target);
      const mesh = new THREE.Mesh(shaft, m);
      mesh.position.copy(from);
      mesh.scale.set(1, len, 1);
      mesh.quaternion.setFromUnitVectors(new V3(0, -1, 0), target.clone().sub(from).normalize());
      group.add(mesh);
    }
    own.push(shaft, m);
  }

  /* the hosts: winged figures of light in flight about the vortex, the gold one way and the shadow
     the other. Each is one soft sprite drawn as a figure (a small bright body, two wings beating
     slowly, a breath of light about it), turned along its flight: a continuous form of light, never
     a string of points (the owner has turned away bead chains before) */
  function host(count: number, dir: number, tint: N, strength: N, size: number) {
    const c = pointCloud(count, size);
    for (let f = 0; f < count; f++) {
      c.pos.set([0.2 + R() * 0.5, R() * 6.283, 16 + R() * 24], f * 3);
      c.k.set([0.6 + R() * 0.7, R() * 6.283, 0.7 + R() * 0.6, R()], f * 4);
    }
    touch(c.cloud);
    const P = c.cloud.nodes.position, K = c.cloud.nodes.aK;
    const r = P.x.mul(RMAX).mul(float(1).add(uCalm.mul(0.2)));
    const a = P.y.add(uFly.mul(K.x).mul(dir).mul(0.05));
    // a diagonal: each round rises and falls through the vortex's depth as it goes
    const d = P.z.add(sin(a.mul(2).add(K.y)).mul(8));
    c.material.positionNode = onDisc(a, r, d);
    c.material.sizeNode = K.z.mul(c.material.size);
    // the figure, in the sprite: turned so its flight runs along the round (the vortex faces the
    // view nearly square, so the round's tangent on screen is close to a + π/2)
    const roll = a.add(Math.PI / 2 * (dir > 0 ? 1 : -1));
    const uv0 = T.pointUV.sub(0.5).mul(2);
    const cr = cos(roll.negate()), sr = sin(roll.negate());
    // in the figure's frame: y along its flight (head forward), x across its wings
    const fx = uv0.x.mul(cr).sub(uv0.y.mul(sr)), fy = uv0.x.mul(sr).add(uv0.y.mul(cr));
    const beat = sin(t.mul(1.8).add(K.y.mul(5)));
    const ax = abs(fx);
    // the wings: a curve out from the shoulders, swept back, beating up and down
    const wingY = float(0.08).add(beat.mul(0.22).mul(ax)).sub(ax.mul(ax).mul(0.9));
    const thick = float(0.11).mul(float(1).sub(ax.div(0.82))).add(0.01);
    const wing = smoothstep(thick, thick.mul(0.25), abs(fy.sub(wingY))).mul(float(1).sub(smoothstep(0.7, 0.85, ax)));
    // the body: a slender light, brightest at the heart
    const body = exp(fx.mul(fx).mul(-180).add(fy.sub(0.05).mul(fy.sub(0.05)).mul(-22)));
    const halo = exp(length(uv0).mul(length(uv0)).mul(-5)).mul(0.18);
    const shape = wing.mul(0.55).add(body.mul(1.1)).add(halo);
    c.material.colorNode = vec4(tint.mul(shape).mul(strength).mul(0.75), 1);
    group.add(c.cloud.sprite);
    own.push(c.material);
  }
  host(Math.round(34 * o.fewer), 1, vec3(1.0, 0.8, 0.46), uGold, 14);
  host(Math.round(26 * o.fewer), -1, vec3(0.72, 0.8, 1.0), uShadow.mul(0.8), 14);

  /* the ribbons of intention: arcs across the sky between the hosts' sides, pulses along them */
  {
    const pairs: number[] = [];
    const pt = (a: number, r: number, d: number) => C.clone().addScaledVector(e1, Math.cos(a) * r).addScaledVector(e2, Math.sin(a) * r).addScaledVector(Nv, d);
    for (let i = 0; i < 8; i++) {
      // from the west (the gold's side) to the east (the shadow's), arcing over the eye in the
      // vortex's own plane (bowed toward the view they scratched across the whole frame)
      const A = pt(Math.PI - 0.5 + R() * 1.0, 30 + R() * 40, 16);
      const B = pt(-0.5 + R() * 1.0, 30 + R() * 40, 16);
      const bow = 22 + R() * 26;
      const segs = 36;
      let prev = A.clone();
      for (let s = 1; s <= segs; s++) {
        const u = s / segs;
        const p = A.clone().lerp(B, u).addScaledVector(e2, Math.sin(u * Math.PI) * bow);
        pairs.push(prev.x, prev.y, prev.z, p.x, p.y, p.z);
        prev = p;
      }
    }
    const g = ribbonGeometry(pairs);
    const PG = T.positionGeometry;
    const across = PG.sub(vC).dot(vE1); // − west (gold) … + east (shadow)
    const pulse = pow(sin(across.mul(0.08).sub(t.mul(1.1))).mul(0.5).add(0.5), 8);
    const warm = smoothstep(40, -40, across);
    const m = keepAlpha(ribbonMaterial(mix(vec3(0.7, 0.76, 1.0), vec3(1, 0.82, 0.5), warm).mul(pulse.mul(0.7).add(0.08)).mul(uArcs), 0.7));
    const mesh = new THREE.Mesh(g, m);
    mesh.frustumCulled = false;
    group.add(mesh);
    own.push(g, m);
  }

  let spin = 0, fly = 0;
  /** Each frame: `f`, how far beat 5 has been told (0 … 1; 1 once it has been). */
  function update(f: number, dt: number): void {
    uForm.value = sm(0, 0.12, f) * 0.85 + 0.15;
    uGold.value = sm(0.06, 0.3, f);
    uShadow.value = sm(0.3, 0.48, f);
    uArcs.value = sm(0.56, 0.68, f) * (1 - 0.65 * sm(0.9, 1, f));
    uCalm.value = sm(0.84, 1, f);
    const speed = 1 - 0.75 * (uCalm.value as number);
    spin += dt * 0.02 * speed;
    fly += dt * speed;
    uSpin.value = spin;
    uFly.value = fly;
  }
  update(0, 0);

  return {
    group,
    update,
    dispose: () => {
      for (const x of own) x.dispose();
    },
  };
}
