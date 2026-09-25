/* The archive's vessels: orbs and groves (content/transcript_orbs.json, placed by sites.ts).
   - An orb is a small planet of light: soft bands and seas turning slowly, an atmosphere that
     glows at its rim, a tiny moon, bobbing where it floats (in the sky, underwater, over land).
   - A grove is one great tree, its own shape and colour, bearing a glowing fruit for each of
     its narrations. Fruits pulse gently and can be tapped one by one.
   Approach shows quiet labels (they fade with distance); tapping one plays its narration
   (see ui/transcriptPlayer.ts). Nothing here ever plays by itself. */
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { barkMaterial, grow, tubes, type TreeShape } from "./creation";
import { IJ_FOG_GLSL } from "./fog";
import { GROVE_SITES, ORB_SITES, type GroveSite, type Narration, type OrbSite } from "./sites";
import { colliders } from "./terrain";

export interface Vessel {
  kind: "orb" | "fruit";
  narration: Narration;
  /** Live world position (orbs bob; fruits sway). */
  pos: THREE.Vector3;
  radius: number;
  grove?: GroveSite;
}

function halo(color: THREE.Color, size: number): THREE.Sprite {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, "rgba(255,255,255,0.9)");
  grd.addColorStop(0.25, "rgba(255,255,255,0.28)");
  grd.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false }));
  s.scale.setScalar(size);
  return s;
}

const PALETTE = [
  [0.1, 0.6, 0.72], [0.93, 0.5, 0.74], [0.58, 0.55, 0.75], [0.75, 0.5, 0.74], [0.47, 0.5, 0.68], [0.05, 0.7, 0.7],
  [0.85, 0.45, 0.78], [0.13, 0.35, 0.8], [0.53, 0.6, 0.7], [0.97, 0.55, 0.75], [0.68, 0.45, 0.72], [0.36, 0.45, 0.7],
];
/** 1 up close, fading to 0 between `full` and `gone` metres. */
const fade = (d: number, full: number, gone: number) => 1 - THREE.MathUtils.smoothstep(d, full, gone);
const colourFor = (i: number) => new THREE.Color().setHSL(...(PALETTE[i % PALETTE.length] as [number, number, number]));

/* ---------------------------------------------------------------- orbs */
function planetMaterial(a: THREE.Color, b: THREE.Color, seed: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { uA: { value: a }, uB: { value: b }, uSeed: { value: seed }, uT: { value: 0 }, uNear: { value: 0 }, uPlaying: { value: 0 } },
    vertexShader: /* glsl */ `varying vec3 vN;varying vec3 vP;varying vec3 vW;void main(){vP=position;vec4 w=modelMatrix*vec4(position,1.0);vW=w.xyz;
      vN=normalize(mat3(modelMatrix)*normal);gl_Position=projectionMatrix*viewMatrix*w;}`,
    fragmentShader: /* glsl */ `varying vec3 vN;varying vec3 vP;varying vec3 vW;uniform vec3 uA,uB;uniform float uSeed,uT,uNear,uPlaying;
      ${IJ_FOG_GLSL}
      float h3(vec3 p){p=fract(p*0.3183+uSeed);p*=17.0;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}
      float n3(vec3 x){vec3 i=floor(x),f=fract(x);f=f*f*(3.0-2.0*f);
        return mix(mix(mix(h3(i),h3(i+vec3(1,0,0)),f.x),mix(h3(i+vec3(0,1,0)),h3(i+vec3(1,1,0)),f.x),f.y),
                   mix(mix(h3(i+vec3(0,0,1)),h3(i+vec3(1,0,1)),f.x),mix(h3(i+vec3(0,1,1)),h3(i+vec3(1,1,1)),f.x),f.y),f.z);}
      void main(){
        vec3 p=normalize(vP);
        // slowly turning seas and bands of soft colour
        float c=cos(uT*0.08),s=sin(uT*0.08);p=vec3(p.x*c-p.z*s,p.y,p.x*s+p.z*c);
        float land=n3(p*2.2+uSeed*7.0)*0.6+n3(p*5.0)*0.3+n3(p*11.0)*0.1;
        float bands=0.5+0.5*sin(p.y*9.0+land*4.0);
        vec3 col=mix(uA,uB,smoothstep(0.42,0.6,land))*(0.55+0.45*bands);
        vec3 n=normalize(vN);vec3 v=normalize(cameraPosition-vW);
        float rim=pow(1.0-abs(dot(n,v)),2.4);
        float lit=0.55+0.45*max(0.0,dot(n,normalize(vec3(0.3,0.8,0.2))));
        vec3 c3=col*lit*(0.5+uNear*0.2+uPlaying*0.25)+mix(uA,vec3(1.0),0.3)*rim*(0.7+uNear*0.3);
        vec4 fg=ijFog(vW);
        gl_FragColor=vec4(mix(c3,fg.rgb,fg.a*0.8),1.0);
      }`,
  });
}

interface OrbView {
  site: OrbSite;
  group: THREE.Group;
  planet: THREE.Mesh;
  mat: THREE.ShaderMaterial;
  moon: THREE.Mesh;
  glow: THREE.Sprite;
  vessel: Vessel;
  phase: number;
}

/* ---------------------------------------------------------------- groves */
interface FruitView {
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  glow: THREE.Sprite;
  base: THREE.Vector3;
  vessel: Vessel;
  phase: number;
}
interface GroveView {
  site: GroveSite;
  group: THREE.Group;
  fruits: FruitView[];
  labelAt: THREE.Vector3;
}

function groveShape(i: number): TreeShape {
  const r = (k: number) => {
    const v = Math.sin(i * 91.7 + k * 13.1) * 43758.5453;
    return v - Math.floor(v);
  };
  return {
    height: 11 + r(1) * 5,
    radius: 0.75 + r(2) * 0.35,
    limbs: 5 + Math.floor(r(3) * 3),
    depth: 2,
    spread: 0.7 + r(4) * 0.4,
    limbLen: 5.5 + r(5) * 3,
    bend: 0.6 + r(6) * 0.5,
    roots: 10,
    rootLen: 8,
    leaves: 7,
  };
}

export class Vessels {
  group = new THREE.Group();
  vessels: Vessel[] = [];
  private orbs: OrbView[] = [];
  private groves: GroveView[] = [];
  private labels = document.getElementById("labels") as HTMLDivElement;
  private labelEls = new Map<object, HTMLDivElement>();
  private playingId: string | null = null;
  private v = new THREE.Vector3();

  constructor() {
    ORB_SITES.forEach((site, i) => this.buildOrb(site, i));
    GROVE_SITES.forEach((site) => this.buildGrove(site));
  }

  private buildOrb(site: OrbSite, i: number): void {
    const a = colourFor(i * 5 + 2), b = colourFor(i * 5 + 5).offsetHSL(0.08, 0, -0.1);
    const r = site.realm === "sky" ? 1.1 : 0.7;
    const group = new THREE.Group();
    group.position.set(site.x, site.y, site.z);
    const mat = planetMaterial(a, b, (i * 0.137) % 1);
    const planet = new THREE.Mesh(new THREE.SphereGeometry(r, 40, 28), mat);
    const moon = new THREE.Mesh(new THREE.SphereGeometry(r * 0.16, 16, 12), new THREE.MeshBasicMaterial({ color: a.clone().lerp(new THREE.Color(1, 1, 1), 0.6) }));
    const glow = halo(a.clone().lerp(new THREE.Color(1, 1, 1), 0.3), r * 7);
    group.add(planet, moon, glow);
    if (i % 3 === 1) {
      // a few carry a faint ring
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(r * 1.45, r * 1.75, 64).rotateX(-Math.PI / 2 + 0.35),
        new THREE.MeshBasicMaterial({ color: b.clone().lerp(new THREE.Color(1, 1, 1), 0.4), transparent: true, opacity: 0.35, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }),
      );
      group.add(ring);
    }
    this.group.add(group);
    const vessel: Vessel = { kind: "orb", narration: site.orb, pos: group.position.clone(), radius: r };
    this.vessels.push(vessel);
    this.orbs.push({ site, group, planet, mat, moon, glow, vessel, phase: i * 1.3 });
  }

  private buildGrove(site: GroveSite): void {
    const accent = colourFor(site.index * 3 + 1);
    const shape = groveShape(site.index);
    const { limbs, roots, tips } = grow(shape, 0.31 + site.index * 0.173);
    const group = new THREE.Group();
    group.position.set(site.x, site.y, site.z);
    group.rotation.y = site.index * 1.7;
    const scale = 1.15;
    group.scale.setScalar(scale);
    const trunk = new THREE.Mesh(mergeGeometries([tubes(limbs), tubes(roots, -0.2)]), barkMaterial(accent.clone().lerp(new THREE.Color(1, 1, 1), 0.25)));
    trunk.castShadow = true;
    group.add(trunk);
    // a canopy of soft glints in the grove's own colour
    const pts: number[] = [];
    let s = site.index * 977 + 1;
    const R = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    for (const tp of tips) for (let k = 0; k < 10; k++) pts.push(tp.x + (R() - 0.5) * 2.6, tp.y + (R() - 0.3) * 1.8, tp.z + (R() - 0.5) * 2.6);
    const cg = new THREE.BufferGeometry();
    cg.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
    const canopy = new THREE.Points(
      cg,
      new THREE.PointsMaterial({ color: accent.clone().lerp(new THREE.Color(1, 1, 1), 0.35), size: 0.22, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    group.add(canopy);
    this.group.add(group);
    group.updateMatrixWorld(true);
    colliders.push({ x: site.x, z: site.z, r: shape.radius * scale * 1.3, top: site.y + shape.height * scale });

    // fruits: spread around the crown, each hanging a little below a twig
    const byAngle = [...tips].sort((p, q) => Math.atan2(p.z, p.x) - Math.atan2(q.z, q.x));
    const n = site.grove.episodes.length;
    const fruits: FruitView[] = site.grove.episodes.map((ep, k) => {
      const tip = byAngle[Math.floor(((k + 0.5) / n) * byAngle.length)] ?? byAngle[0];
      const base = tip.clone().add(new THREE.Vector3(0, -0.7, 0)).applyMatrix4(group.matrixWorld);
      const mat = new THREE.MeshBasicMaterial({ color: accent.clone().lerp(new THREE.Color(1, 1, 1), 0.45).multiplyScalar(1.6) });
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.3, 24, 16), mat);
      mesh.position.copy(base);
      const glow = halo(accent.clone().lerp(new THREE.Color(1, 1, 1), 0.2), 2.6);
      glow.position.copy(base);
      this.group.add(mesh, glow);
      const vessel: Vessel = { kind: "fruit", narration: ep, pos: base.clone(), radius: 0.3, grove: site };
      this.vessels.push(vessel);
      return { mesh, mat, glow, base, vessel, phase: k * 2.1 + site.index };
    });
    this.groves.push({ site, group, fruits, labelAt: new THREE.Vector3(site.x, site.y + 3.2, site.z) });
  }

  /** Which narration is playing (it glows a little brighter), or null. */
  setPlaying(id: string | null): void {
    this.playingId = id;
  }

  /** The vessel under a tap, if any: generous for small things on a phone. */
  pick(x: number, y: number, camera: THREE.Camera): Vessel | null {
    let best: Vessel | null = null, bestD = Infinity;
    const w = innerWidth, h = innerHeight;
    for (const vs of this.vessels) {
      const d = vs.pos.distanceTo(camera.position);
      if (d > 160) continue;
      this.v.copy(vs.pos).project(camera);
      if (this.v.z > 1) continue;
      const sx = (this.v.x * 0.5 + 0.5) * w, sy = (-this.v.y * 0.5 + 0.5) * h;
      const pxR = (vs.radius / d) * (h / (2 * Math.tan(((camera as THREE.PerspectiveCamera).fov * Math.PI) / 360)));
      const reach = Math.max(30, pxR * 1.6);
      const off = Math.hypot(sx - x, sy - y);
      if (off < reach && d < bestD) {
        bestD = d;
        best = vs;
      }
    }
    return best;
  }

  /** The closest vessel within reach of the wanderer (for the keyboard). */
  nearest(p: THREE.Vector3, within = 9): Vessel | null {
    let best: Vessel | null = null, bd = within;
    for (const vs of this.vessels) {
      const d = vs.pos.distanceTo(p);
      if (d < bd) {
        bd = d;
        best = vs;
      }
    }
    return best;
  }

  update(t: number, player: THREE.Vector3, camera: THREE.Camera, reduced: boolean, show: boolean): void {
    for (const o of this.orbs) {
      const bob = reduced ? 0 : Math.sin(t * 0.5 + o.phase) * 0.3;
      o.group.position.set(o.site.x, o.site.y + bob, o.site.z);
      o.vessel.pos.copy(o.group.position);
      const d = player.distanceTo(o.group.position);
      const playing = this.playingId === o.vessel.narration.id ? 1 : 0;
      o.mat.uniforms.uT.value = t;
      o.mat.uniforms.uNear.value = fade(d, 6, 30);
      o.mat.uniforms.uPlaying.value += (playing - o.mat.uniforms.uPlaying.value) * 0.05;
      const r = o.vessel.radius;
      const a = t * 0.35 + o.phase;
      o.moon.position.set(Math.cos(a) * r * 2.1, Math.sin(a * 0.7) * r * 0.5, Math.sin(a) * r * 2.1);
      // the halo is for finding it from afar; close up it steps back so the planet itself shows
      o.glow.material.opacity = (0.5 - 0.35 * o.mat.uniforms.uNear.value) + playing * 0.15;
      o.glow.scale.setScalar(r * (5 + (reduced ? 0 : Math.sin(t * 0.9 + o.phase)) * 0.4 + playing * 1.5));
    }
    for (const g of this.groves) {
      for (const f of g.fruits) {
        const sway = reduced ? 0 : Math.sin(t * 0.8 + f.phase) * 0.08;
        f.mesh.position.set(f.base.x + sway, f.base.y + Math.abs(sway) * 0.3, f.base.z);
        f.glow.position.copy(f.mesh.position);
        f.vessel.pos.copy(f.mesh.position);
        const playing = this.playingId === f.vessel.narration.id;
        const pulse = 0.75 + 0.25 * Math.sin(t * 1.3 + f.phase);
        f.glow.material.opacity = (0.5 + (playing ? 0.5 : 0)) * pulse;
        f.mesh.scale.setScalar(1 + (playing ? 0.25 : 0) + (reduced ? 0 : pulse * 0.08));
      }
    }
    this.updateLabels(player, camera, show);
  }

  /* ---------------------------------------------------------------- labels */
  private label(key: object, html: string, cls: string): HTMLDivElement {
    let el = this.labelEls.get(key);
    if (!el) {
      el = document.createElement("div");
      el.className = `vlabel ${cls}`;
      el.innerHTML = html;
      this.labels.append(el);
      this.labelEls.set(key, el);
    }
    return el;
  }
  private place(el: HTMLDivElement, at: THREE.Vector3, camera: THREE.Camera, opacity: number): void {
    if (opacity < 0.02) {
      el.style.opacity = "0";
      return;
    }
    this.v.copy(at).project(camera);
    if (this.v.z > 1 || Math.abs(this.v.x) > 1.2 || Math.abs(this.v.y) > 1.2) {
      el.style.opacity = "0";
      return;
    }
    el.style.opacity = opacity.toFixed(2);
    el.style.transform = `translate(-50%,-100%) translate(${((this.v.x * 0.5 + 0.5) * innerWidth).toFixed(1)}px,${((-this.v.y * 0.5 + 0.5) * innerHeight).toFixed(1)}px)`;
  }
  private updateLabels(player: THREE.Vector3, camera: THREE.Camera, show: boolean): void {
    this.labels.hidden = !show;
    if (!show) return;
    const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
    const line = (n: Narration) => {
      const s = n.sources[0];
      return `<b>${esc(n.title)}</b>${s ? `<span>${esc(s.entity)} · ${esc(s.date)}</span>` : ""}`;
    };
    for (const o of this.orbs) {
      const d = player.distanceTo(o.vessel.pos);
      const el = this.label(o, line(o.vessel.narration), "orb");
      this.place(el, this.v.copy(o.vessel.pos).add(new THREE.Vector3(0, o.vessel.radius + 0.5, 0)), camera, fade(d, 10, 26));
    }
    for (const g of this.groves) {
      const d = Math.hypot(player.x - g.site.x, player.z - g.site.z);
      const el = this.label(g, `<b>${esc(g.site.grove.name)}</b>`, "grove");
      this.place(el, g.labelAt, camera, fade(d, 40, 75) * (1 - 0.6 * fade(d, 8, 14)));
      for (const f of g.fruits) {
        const df = player.distanceTo(f.vessel.pos);
        const fe = this.label(f, line(f.vessel.narration), "fruit");
        this.place(fe, this.v.copy(f.vessel.pos).add(new THREE.Vector3(0, 0.55, 0)), camera, fade(df, 9, 16));
      }
    }
  }
}
