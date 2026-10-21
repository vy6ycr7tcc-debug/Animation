/* The first density's fire and sky, shared (density Room 1, and the mind's maze, which the owner
   asked to look like it): a volcano pouring slow fire (bombs of lava thrown in arcs, rivers down
   its gullies, the crater's glow, a plume lit from beneath, embers carried on the wind), a storm
   ceiling that lights from within but never breaks, and ash drifting in the air. Each draws from
   the room's own seeded random in the same order as Room 1 always did, so Room 1 is unchanged. */
import * as THREE from "three/webgpu";
import { T, flow, vnoise, hash2, type N } from "../../gpu/tsl";
import { fbm } from "../../world/terrain";
import { cloudSheet, keepAlpha, pointCloud, touch, roomPos } from "./roomKit";

const {
  exp, float, floor, fract, length, max, mix, mod, normalize, positionGeometry, pow, sin, cos, smoothstep, uv, vec2, vec3, vec4,
} = T;

type Owned = { dispose(): void }[];

/** A volcano at `at` (room frame), `h` metres high: its pour follows `uLava` (1 at rest). Embers
    drift by `windTo` (x, z metres over their life) toward the onlooker. */
export function volcano(g: THREE.Group, t: N, at: THREE.Vector3, h: number, uLava: N, R: () => number, ours: Owned, windTo: [number, number] = [-40, 55]): void {
  /* ---------------- the volcano throws fire: bombs of lava in arcs, more as it surges ---------------- */
  {
    const n = 1400;
    const b = pointCloud(n, 1.1);
    const aV = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const a = R() * Math.PI * 2, up = 0.55 + R() * 0.45, sp = 16 + R() * 34;
      const h = Math.sqrt(1 - up * up);
      aV.set([Math.cos(a) * h * sp, up * sp, Math.sin(a) * h * sp], i * 3);
      b.k.set([R(), R(), R(), R()], i * 4);
    }
    const bV = new THREE.InstancedBufferAttribute(aV, 3);
    b.cloud.sprite.geometry.setAttribute("aV", bV);
    touch(b.cloud);
    const K = b.cloud.nodes.aK, V = T.instancedBufferAttribute(bV);
    // bursts: the whole volcano breathes out every few seconds; each bomb flies its own arc
    const burst = fract(t.mul(0.11).add(floor(K.x.mul(4)).mul(0.25)));
    const tau = burst.mul(9);
    const p = vec3(at.x, at.y + h + 1, at.z).add(V.mul(tau)).add(vec3(0, tau.mul(tau).mul(-4.9), 0));
    b.material.positionNode = p;
    const alive = smoothstep(0, 0.03, burst).mul(smoothstep(at.y + 4, at.y + 20, p.y));
    const hot = mix(vec3(1, 0.85, 0.5), vec3(0.9, 0.22, 0.04), smoothstep(0, 0.6, burst));
    const surge = T.clamp(uLava.sub(0.7), 0, 2);
    b.material.colorNode = vec4(hot.mul(b.round).mul(alive).mul(float(1).sub(burst.mul(0.6))).mul(surge).mul(K.w.mul(0.6).add(0.5)), 1);
    g.add(b.cloud.sprite);
    ours.push(b.material);
  }

  /* ---------------- the volcano, pouring slow fire ---------------- */
  {
    const rTop = 6, rBot = 62;
    const geo = new THREE.CylinderGeometry(rTop, rBot, h, 160, 40, true);
    geo.translate(0, h / 2, 0);
    const p = geo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const v = y / h;
      const a = Math.atan2(z, x);
      // a concave cone (steeper high up), ridged and gullied: buttresses of old flows run down
      // its flanks (sharper near the summit, broadening below), so its edge against the sky is
      // worn and ribbed, never a drawn cone; the crater's rim is broken, lower on one side
      const n = fbm(x * 0.05 + 9, z * 0.05 + y * 0.03) - 0.5;
      const ribs = Math.pow(Math.abs(Math.sin(a * 9 + n * 3 + v * 1.4)), 0.6) - 0.6;
      const fine = Math.sin(a * 23 + n * 6) * 0.5;
      const k = (1 + n * 0.3 + ribs * 0.07 * (0.4 + v) + fine * 0.02 * (1 - v)) * (1 - v * 0.08) + Math.pow(1 - v, 3) * 0.12;
      const notch = v > 0.9 ? (Math.cos(a - 2.2) * 0.5 + 0.5) * (v - 0.9) * 40 * (0.6 + n) : 0;
      p.setXYZ(i, x * k, y * (1 + n * 0.05) - notch, z * k);
    }
    geo.computeVertexNormals();
    const m = new THREE.MeshStandardNodeMaterial({ color: "#110c10", roughness: 0.92, metalness: 0 });
    const P = positionGeometry;
    const v = P.y.div(h);
    // the rock: strata and a crust of old flows, darker in the folds, faintly warm high up
    const strata = vnoise(vec2(v.mul(38).add(vnoise(P.xz.mul(0.04)).mul(3)), P.x.mul(0.02))).mul(0.5).add(0.75);
    const crust = vnoise(P.xz.mul(0.18).add(P.y.mul(0.1))).mul(0.4).add(0.8);
    m.colorNode = vec3(0.07, 0.048, 0.05).mul(strata).mul(crust);
    // rivers of fire: channels in the rock, brighter toward the crater, pulses running down them
    // each river runs down one gully: a narrow band around the cone, wandering as it descends;
    // the rock either side is heated and glows dull red, so each river reads as poured, not drawn
    const dir = normalize(P.xz);
    const wander = vnoise(vec2(v.mul(5), dir.x.mul(2).add(dir.y))).mul(2.4);
    const sw = sin(dir.x.mul(19).add(dir.y.mul(13)).add(wander));
    const which = smoothstep(0.3, 0.55, vnoise(vec2(dir.x.mul(4), v.mul(3))));
    const chan = smoothstep(0.93, 0.997, sw).mul(which);
    const heat = smoothstep(0.55, 0.97, sw).mul(which).mul(0.16);
    const pulse = sin(v.mul(22).add(t.mul(0.5))).mul(0.35).add(0.65);
    const flicker = vnoise(vec2(v.mul(60).add(t.mul(0.9)), dir.x.mul(40))).mul(0.5).add(0.6);
    const high = smoothstep(0.1, 0.95, v);
    // the rim, ragged: its glow comes and goes along the broken edge
    const rim = smoothstep(0.86, 1.0, v.add(vnoise(dir.mul(6)).mul(0.06)));
    // where the rivers reach the plain they spread into a slow apron of cooling fire
    const apron = smoothstep(0.14, 0.0, v).mul(smoothstep(0.6, 0.95, sw)).mul(which).mul(smoothstep(0.45, 0.8, vnoise(P.xz.mul(0.3).add(t.mul(0.05)))));
    const lava = chan.mul(high).mul(pulse).mul(flicker).add(heat.mul(high)).add(rim.mul(0.8)).add(apron.mul(0.14)).mul(uLava);
    m.emissiveNode = mix(vec3(0.6, 0.1, 0.03), vec3(1.0, 0.42, 0.1), chan.add(rim).min(1)).mul(lava).mul(4.5);
    const mesh = new THREE.Mesh(geo, m);
    mesh.position.copy(at);
    g.add(mesh);
    ours.push(geo, m);

    // the crater's glow: a soft light over the rim, breathing with the pour
    const glowMat = keepAlpha(new THREE.SpriteNodeMaterial({ transparent: true, depthWrite: false, fog: false }));
    const r = length(uv().sub(0.5)).mul(2);
    glowMat.colorNode = vec4(vec3(1.0, 0.42, 0.12).mul(exp(r.mul(r).mul(-4.5))).mul(smoothstep(1, 0.5, r)).mul(uLava.mul(0.35)), 1);
    const glow = new THREE.Sprite(glowMat);
    glow.position.copy(at).add(new THREE.Vector3(0, h + 4, 0));
    glow.position.y -= 4;
    glow.scale.set(34, 13, 1);
    g.add(glow);
    ours.push(glowMat);

    // the plume: slow billows lit from beneath, cooling as they rise
    const plume = pointCloud(80, 22);
    for (let i = 0; i < 80; i++) {
      plume.pos.set([at.x + (R() - 0.5) * 8, at.y + h, at.z + (R() - 0.5) * 8], i * 3);
      plume.k.set([R(), R(), R(), R()], i * 4);
    }
    touch(plume.cloud);
    const PK = plume.cloud.nodes.aK, PB = plume.cloud.nodes.position;
    const life = fract(PK.x.add(t.mul(float(0.012).add(PK.y.mul(0.01)))));
    const rise = life.mul(90);
    const drift = vec3(life.mul(life).mul(60).add(sin(t.mul(0.1).add(PK.z.mul(20))).mul(4)), rise, cos(t.mul(0.08).add(PK.w.mul(20))).mul(6).mul(life));
    plume.material.positionNode = PB.add(drift);
    plume.material.sizeNode = float(1).add(life.mul(2.2));
    const warm = mix(vec3(0.5, 0.16, 0.05), vec3(0.08, 0.06, 0.09), smoothstep(0.0, 0.5, life));
    const fadeIn = smoothstep(0, 0.08, life).mul(float(1).sub(smoothstep(0.6, 1, life)));
    plume.material.colorNode = vec4(warm.mul(plume.round).mul(fadeIn).mul(0.9).mul(uLava.mul(0.5).add(0.5)), 1);
    g.add(plume.cloud.sprite);
    ours.push(plume.material);

    // embers: fine sparks thrown up and carried on the wind toward us, dimming as they go
    const emb = pointCloud(220, 0.6);
    for (let i = 0; i < 220; i++) {
      emb.pos.set([at.x + (R() - 0.5) * 10, at.y + h, at.z + (R() - 0.5) * 10], i * 3);
      emb.k.set([R(), R(), R(), R()], i * 4);
    }
    touch(emb.cloud);
    const EK = emb.cloud.nodes.aK, EB = emb.cloud.nodes.position;
    const el = fract(EK.x.add(t.mul(float(0.03).add(EK.y.mul(0.03)))));
    const arc = vec3(
      el.mul(windTo[0]).add(sin(el.mul(6).add(EK.z.mul(30))).mul(4)),
      el.mul(float(1).sub(el)).mul(4).mul(float(26).add(EK.w.mul(20))),
      el.mul(windTo[1]).add(cos(el.mul(5).add(EK.w.mul(30))).mul(5)),
    );
    emb.material.positionNode = EB.add(arc);
    emb.material.colorNode = vec4(vec3(1.0, 0.5, 0.15).mul(emb.round).mul(float(1).sub(el)).mul(uLava.mul(0.9)), 1);
    g.add(emb.cloud.sprite);
    ours.push(emb.material);
  }
}

/** The storm ceiling: dark billows, warmed underneath toward the volcano at `at`, now and then a
    knot of cloud lit from within (`uStorm` how often); ragged scud below. */
export function stormCeiling(g: THREE.Group, t: N, at: THREE.Vector3, uStorm: N, ours: Owned): void {
  /* ---------------- storm clouds that never quite break ---------------- */
  {
    // a heavy ceiling: dark billows, their undersides warmed toward the volcano; now and then a
    // patch lights from within, softly, and the storm still doesn't break
    const volDir = new THREE.Vector2(at.x, at.z).normalize();
    const ceiling = cloudSheet(1400, 95, t, (q, cover) => {
      const P = roomPos;
      const toward = smoothstep(-0.2, 0.9, T.dot(normalize(P.xz), vec2(volDir.x, volDir.y))).mul(smoothstep(500, 60, length(P.xz.sub(vec2(at.x, at.z)))));
      const base = mix(vec3(0.03, 0.028, 0.052), vec3(0.2, 0.075, 0.04), toward.mul(0.8));
      const cell = floor(q.mul(5.0)); // small cells: a flash lights one knot of cloud, not a whole bank
      const ph = hash2(cell).mul(60);
      const flash = pow(max(sin(t.mul(float(0.17).add(hash2(cell.add(3)).mul(0.2))).add(ph)), 0), 80).mul(uStorm);
      const flicker = sin(t.mul(21).add(ph)).mul(0.3).add(0.7);
      const inner = vnoise(q.mul(6)).mul(cover);
      // the flash lights the cloud from deep inside: soft, never a whole pale shape
      return base.mul(cover.mul(0.4).add(0.8)).add(vec3(0.16, 0.13, 0.24).mul(flash).mul(flicker).mul(smoothstep(0.45, 0.85, inner)).mul(cover));
    }, { scale: 0.005, cover: [0.3, 0.72], opacity: 0.95 });
    g.add(ceiling.mesh);
    ours.push(ceiling);
    // ragged scud lower down, faster, thinner
    const scud = cloudSheet(900, 62, t, (_q, cover) => vec3(0.03, 0.026, 0.045).mul(cover.mul(0.4).add(0.8)), { scale: 0.012, cover: [0.6, 0.9], opacity: 0.45, drift: [0.012, 0.006] });
    g.add(scud.mesh);
    ours.push(scud);
  }
}

/** Ash drifting in the air: `count` motes over a 60 m stretch about `c` (room frame). */
export function ash(g: THREE.Group, t: N, R: () => number, ours: Owned, c: [number, number, number] = [0, 0, 0], count = 360): void {
  /* ---------------- ash in the air (the air, practising) ---------------- */
  {
    const n = count;
    const s = pointCloud(n, 0.09);
    for (let i = 0; i < n; i++) {
      s.pos.set([(R() - 0.5) * 60 + c[0], R() * 14 + c[1], -R() * 60 + 12 + c[2]], i * 3);
      s.k.set([R(), R(), R(), R()], i * 4);
    }
    touch(s.cloud);
    const K = s.cloud.nodes.aK, B = s.cloud.nodes.position;
    // blown on along the wind, each flake a little faster or slower, and tumbled by its gusts and
    // eddies (`flow`): neighbours swirl together, as ash does
    const q = B.add(vec3(t.mul(float(0.5).add(K.x.mul(0.25))), 0, 0));
    const w0 = vec3(mod(q.x.sub(c[0]).add(30), 60).sub(30).add(c[0]), q.y, q.z);
    s.material.positionNode = w0.add(flow(w0.div(3.2), t.mul(0.22)).mul(vec3(1.4, 1.0, 1.4)));
    s.material.colorNode = vec4(vec3(0.7, 0.62, 0.62).mul(s.round).mul(0.28).mul(sin(t.mul(0.7).add(K.w.mul(40))).mul(0.3).add(0.7)), 1);
    g.add(s.cloud.sprite);
    ours.push(s.material);
  }
}
