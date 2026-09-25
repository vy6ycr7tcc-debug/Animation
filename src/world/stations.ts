/* The seven stations of the island (GAME_PROMPT.md section 4): geometric sanctuaries of
   light, stone and fine gold line. Each has
   - a floor of etched stone with a ring that is broken until visited, then whole
     (the visited state is carried by form and brightness, never colour alone);
   - a beacon above it that draws the eye from afar;
   - its own form that responds while its narration plays;
   - one simple, wordless interaction, offered by a single fading word. */
import * as THREE from "three";
import catalogue from "../../content/stations.json";
import type { AudioEngine } from "../core/audio";
import { etchedStone } from "./etching";
import { heightAt } from "./terrain";

export interface StationData {
  n: number;
  title: string;
  archetype: string;
  narration: string;
  position: [number, number];
  prompt: string;
  question: string;
}
export const STATION_DATA = catalogue.stations as unknown as StationData[];

/** What the stations may ask of the rest of the game. */
export interface Hooks {
  audio: AudioEngine;
  sit(at: THREE.Vector3, heading: number): void;
  reach(on: boolean): void;
  setTimeScale(k: number): void;
  setStarBoost(k: number): void;
  board(): void;
  visitedCount(): number;
}

export interface Frame {
  t: number;
  dt: number;
  player: THREE.Vector3;
  reduced: boolean;
  seen: number; // 0 from the shore → 1 once the island's lights are visible
  gesture: "none" | "sit" | "reach";
}

const GOLD = new THREE.Color(1.0, 0.78, 0.46);
const PEARL = new THREE.Color(1.0, 0.95, 0.88);

function haloTexture(): THREE.Texture {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, "rgba(255,228,176,1)");
  grd.addColorStop(0.3, "rgba(255,205,140,0.32)");
  grd.addColorStop(1, "rgba(255,190,120,0)");
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const HALO = haloTexture();

function lineMat(color: THREE.Color, opacity = 0.9): THREE.LineBasicMaterial {
  return new THREE.LineBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false });
}
function glowMat(color: THREE.Color, opacity = 1): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false });
}
function circlePts(r: number, n = 96, a0 = 0, a1 = Math.PI * 2, y = 0): THREE.Vector3[] {
  const p: THREE.Vector3[] = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    p.push(new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r));
  }
  return p;
}
function line(points: THREE.Vector3[], mat: THREE.LineBasicMaterial): THREE.Line {
  return new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), mat);
}

/* ---------------------------------------------------------------- base */
export abstract class Station {
  group = new THREE.Group();
  center: THREE.Vector3;
  visited = false;
  /** 0..1, eased: how strongly this station's narration is playing. */
  active = 0;
  radius = 5.5;
  protected stone = etchedStone();
  private ringOpen: THREE.Group;
  private ringWhole: THREE.Line;
  private beacon: THREE.Sprite;
  private beaconCore: THREE.Mesh;
  private floorGlow: THREE.MeshBasicMaterial;

  constructor(public data: StationData) {
    const [x, z] = data.position;
    this.center = new THREE.Vector3(x, heightAt(x, z), z);
    this.group.position.copy(this.center);

    // Floor: a low disc of etched stone, and a halo of light around it.
    const floor = new THREE.Mesh(new THREE.CylinderGeometry(4.2, 4.5, 0.6, 64), this.stone);
    floor.position.y = -0.18;
    floor.receiveShadow = true;
    this.group.add(floor);
    this.floorGlow = glowMat(GOLD, 0.0);
    const glowRing = new THREE.Mesh(new THREE.RingGeometry(4.25, 5.4, 64).rotateX(-Math.PI / 2), this.floorGlow);
    glowRing.position.y = 0.13;
    this.group.add(glowRing);

    // The ring: seven arcs with gaps until visited, then one whole circle.
    this.ringOpen = new THREE.Group();
    for (let i = 0; i < 7; i++) {
      const a0 = (i / 7) * Math.PI * 2 + 0.12, a1 = ((i + 1) / 7) * Math.PI * 2 - 0.12;
      this.ringOpen.add(line(circlePts(3.95, 16, a0, a1, 0.14), lineMat(PEARL, 0.7)));
    }
    this.ringWhole = line(circlePts(3.95, 112, 0, Math.PI * 2, 0.14), lineMat(GOLD, 0.95));
    this.ringWhole.visible = false;
    this.group.add(this.ringOpen, this.ringWhole);

    // Beacon: a small light that hangs above the station and draws the eye.
    this.beaconCore = new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 12), glowMat(new THREE.Color(2.4, 1.9, 1.2)));
    this.beacon = new THREE.Sprite(new THREE.SpriteMaterial({ map: HALO, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    this.beacon.scale.setScalar(4);
    this.beaconCore.position.y = this.beacon.position.y = 7;
    this.group.add(this.beaconCore, this.beacon);
  }

  /** The single word offered when an interaction is available here, or null. */
  prompt(_f: Frame, _h: Hooks): string | null {
    return null;
  }
  /** The context button / Space. */
  act(_f: Frame, _h: Hooks): void {}

  distance(p: THREE.Vector3): number {
    return Math.hypot(p.x - this.center.x, p.z - this.center.z);
  }
  /** Player position in the station's local frame (x, z). */
  local(p: THREE.Vector3): THREE.Vector2 {
    return new THREE.Vector2(p.x - this.center.x, p.z - this.center.z);
  }

  markVisited(): void {
    this.visited = true;
  }

  update(f: Frame, h: Hooks, playing: boolean): void {
    this.active += ((playing ? 1 : 0) - this.active) * Math.min(1, f.dt * 1.5);
    this.group.visible = f.seen > 0.001;
    this.ringOpen.visible = !this.visited;
    this.ringWhole.visible = this.visited;
    const pulse = f.reduced ? 0.85 : 0.75 + 0.25 * Math.sin(f.t * 0.8 + this.data.n);
    // Unvisited beacons are brighter and pulse gently; visited ones settle into a warm, lower glow.
    const b = this.visited ? 0.45 : 1.0 * pulse;
    (this.beacon.material as THREE.SpriteMaterial).opacity = f.seen * b * (1 - this.active * 0.6);
    (this.beaconCore.material as THREE.MeshBasicMaterial).opacity = f.seen * (this.visited ? 0.5 : 1);
    this.beaconCore.position.y = this.beacon.position.y = 7 + (f.reduced ? 0 : Math.sin(f.t * 0.6 + this.data.n) * 0.2);
    this.floorGlow.opacity = f.seen * (0.05 + (this.visited ? 0.12 : 0.0) + this.active * 0.25);
    this.animate(f, h);
  }
  protected abstract animate(f: Frame, h: Hooks): void;
}

/* ---------------------------------------------------------------- I. The Magician */
class Magician extends Station {
  private beam: THREE.ShaderMaterial;
  private ring: THREE.Mesh;
  private ringMat: THREE.MeshStandardMaterial;
  private sparks: THREE.Points;
  private sparkMat: THREE.PointsMaterial;
  private inside = 0;
  constructor(d: StationData) {
    super(d);
    this.beam = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      uniforms: { uT: { value: 0 }, uI: { value: 0.4 } },
      vertexShader: `varying vec2 vU;void main(){vU=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
      fragmentShader: `varying vec2 vU;uniform float uT,uI;void main(){
        float edge=pow(sin(vU.x*3.14159),3.0);
        float flow=0.7+0.3*sin(vU.y*80.0-uT*3.0);
        float fade=smoothstep(0.0,0.03,vU.y)*(1.0-smoothstep(0.35,1.0,vU.y));
        gl_FragColor=vec4(vec3(1.0,0.86,0.6)*edge*flow*fade*uI,1.0);}`,
    });
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 60, 24, 1, true), this.beam);
    beam.position.y = 30;
    this.group.add(beam);
    this.ringMat = new THREE.MeshStandardMaterial({ color: "#e8c27a", metalness: 1, roughness: 0.25, emissive: GOLD, emissiveIntensity: 0.4 });
    this.ring = new THREE.Mesh(new THREE.TorusGeometry(1.1, 0.035, 12, 96), this.ringMat);
    this.ring.rotation.x = Math.PI / 2;
    this.ring.position.y = 1.35;
    this.group.add(this.ring);
    const n = 160, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, r = Math.random() * 0.9;
      pos.set([Math.cos(a) * r, Math.random() * 12, Math.sin(a) * r], i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    this.sparkMat = new THREE.PointsMaterial({ color: GOLD, size: 0.09, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
    this.sparks = new THREE.Points(g, this.sparkMat);
    this.group.add(this.sparks);
  }
  prompt(f: Frame): string | null {
    const d = this.distance(f.player);
    return d < 4 && d > 0.9 ? this.data.prompt : null;
  }
  protected animate(f: Frame, h: Hooks): void {
    const inRing = this.distance(f.player) < 0.95;
    const was = this.inside > 0.5;
    this.inside += ((inRing ? 1 : 0) - this.inside) * Math.min(1, f.dt * 2);
    if (inRing && !was) {
      h.audio.bell(523.25, 0.06, 6);
      h.reach(true);
    }
    if (!inRing && was) h.reach(false);
    this.beam.uniforms.uT.value = f.t;
    this.beam.uniforms.uI.value = 0.35 + this.active * 0.35 + this.inside * 1.2;
    this.ringMat.emissiveIntensity = 0.4 + this.active * 0.6 + this.inside * 2.5;
    this.ring.position.y = 1.35 + (f.reduced ? 0 : Math.sin(f.t * 0.7) * 0.05);
    this.sparkMat.opacity = this.inside * 0.9 + this.active * 0.15;
    const p = (this.sparks.geometry.attributes.position as THREE.BufferAttribute).array as Float32Array;
    const rise = f.dt * (0.6 + this.inside * 1.6);
    for (let i = 1; i < p.length; i += 3) p[i] = (p[i] + rise) % 12;
    (this.sparks.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
  }
}

/* ---------------------------------------------------------------- II. The High Priestess */
class Priestess extends Station {
  private veil: THREE.ShaderMaterial;
  private crescent: THREE.MeshBasicMaterial;
  private seat = new THREE.Vector3();
  private sitting = 0;
  constructor(d: StationData) {
    super(d);
    for (const x of [-1.6, 1.6]) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.7, 5.2, 0.7), this.stone);
      p.position.set(x, 2.5, -1.2);
      p.castShadow = true;
      this.group.add(p);
      const cap = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.18, 0.9), this.stone);
      cap.position.set(x, 5.18, -1.2);
      this.group.add(cap);
    }
    this.veil = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      uniforms: { uT: { value: 0 }, uPart: { value: 0 } },
      vertexShader: `varying vec2 vU;void main(){vU=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
      fragmentShader: `varying vec2 vU;uniform float uT,uPart;
        float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
        float n(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y);}
        void main(){
          vec2 p=vU*vec2(3.0,5.0);
          float m=n(p+vec2(uT*0.05,-uT*0.08))*0.6+n(p*2.1-vec2(uT*0.03,uT*0.05))*0.4;
          float part=smoothstep(0.0,0.5,abs(vU.x-0.5)-uPart*0.35); // the mist draws aside from the middle
          float edge=smoothstep(0.0,0.1,vU.x)*smoothstep(1.0,0.9,vU.x)*smoothstep(0.0,0.1,vU.y)*smoothstep(1.0,0.75,vU.y);
          float a=m*edge*mix(1.0,part,uPart)*0.4;
          gl_FragColor=vec4(vec3(0.78,0.82,0.95)*a,1.0);}`,
    });
    const veil = new THREE.Mesh(new THREE.PlaneGeometry(2.5, 4.8), this.veil);
    veil.position.set(0, 2.5, -1.2);
    this.group.add(veil);
    // A crescent of pale light above.
    const s = new THREE.Shape();
    s.absarc(0, 0, 0.9, 0, Math.PI * 2, false);
    const hole = new THREE.Path();
    hole.absarc(0.32, 0.12, 0.78, 0, Math.PI * 2, true);
    s.holes.push(hole);
    this.crescent = glowMat(new THREE.Color(0.9, 0.93, 1.0), 0.8);
    const cr = new THREE.Mesh(new THREE.ShapeGeometry(s, 48), this.crescent);
    cr.position.set(0, 6.4, -1.2);
    this.group.add(cr);
    // A low stone bench facing the veil.
    const bench = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.42, 0.55), this.stone);
    bench.position.set(0, 0.2, 1.75);
    bench.castShadow = true;
    this.group.add(bench);
    this.seat.set(this.center.x, this.center.y + 0.12, this.center.z + 1.35);
  }
  prompt(f: Frame): string | null {
    return this.distance(f.player) < 3.2 && f.gesture !== "sit" ? this.data.prompt : null;
  }
  act(_f: Frame, h: Hooks): void {
    h.sit(this.seat, 0); // facing the veil (−z)
    h.audio.bell(392, 0.04, 7);
  }
  protected animate(f: Frame, h: Hooks): void {
    const here = f.gesture === "sit" && this.distance(f.player) < 3.2;
    this.sitting += ((here ? 1 : 0) - this.sitting) * Math.min(1, f.dt * 0.6);
    h.setTimeScale(1 - this.sitting * 0.65);
    h.setStarBoost(this.sitting * 1.6);
    this.veil.uniforms.uT.value = f.t;
    this.veil.uniforms.uPart.value = this.sitting;
    this.crescent.opacity = 0.55 + this.active * 0.3 + this.sitting * 0.3;
  }
}

/* ---------------------------------------------------------------- III. The Empress */
class Empress extends Station {
  private beds: THREE.Mesh[] = [];
  private bedMat: THREE.MeshStandardMaterial;
  private vines: THREE.Line[] = [];
  private petals: THREE.Mesh[] = [];
  private bloom = 0;
  private lastStep = -1;
  constructor(d: StationData) {
    super(d);
    this.radius = 6;
    this.bedMat = new THREE.MeshStandardMaterial({ color: "#2e4a3a", roughness: 0.8, emissive: new THREE.Color(0.35, 0.62, 0.42), emissiveIntensity: 0.35 });
    // Garden beds along an inward spiral.
    const turns = 2.2;
    for (let i = 0; i < 22; i++) {
      const u = i / 21;
      const a = u * turns * Math.PI * 2;
      const r = 3.6 - u * 2.9;
      const bed = new THREE.Mesh(new THREE.SphereGeometry(0.34, 16, 10), this.bedMat);
      bed.scale.set(1, 0.32, 0.7);
      bed.position.set(Math.cos(a) * r, 0.12, Math.sin(a) * r);
      bed.rotation.y = -a;
      this.group.add(bed);
      this.beds.push(bed);
    }
    // Vines of light climbing through the air.
    for (let v = 0; v < 7; v++) {
      const a0 = (v / 7) * Math.PI * 2;
      const pts: THREE.Vector3[] = [];
      for (let k = 0; k <= 60; k++) {
        const u = k / 60;
        const r = 2.4 + Math.sin(u * 5 + v) * 0.5 - u * 1.2;
        const a = a0 + u * 3.2;
        pts.push(new THREE.Vector3(Math.cos(a) * r, 0.2 + u * 5.5, Math.sin(a) * r));
      }
      const l = line(pts, lineMat(new THREE.Color(0.75, 1.0, 0.7), 0.7));
      l.geometry.setDrawRange(0, 0);
      this.group.add(l);
      this.vines.push(l);
    }
    // The bloom at the centre: petals of light, folded until you arrive.
    const petalGeo = new THREE.SphereGeometry(0.5, 16, 10);
    petalGeo.scale(0.35, 0.06, 1).translate(0, 0, 0.5);
    for (let i = 0; i < 8; i++) {
      const p = new THREE.Mesh(petalGeo, glowMat(new THREE.Color(1.0, 0.86, 0.75), 0.0));
      p.position.y = 0.25;
      p.rotation.y = (i / 8) * Math.PI * 2;
      this.group.add(p);
      this.petals.push(p);
    }
  }
  prompt(f: Frame): string | null {
    const d = this.distance(f.player);
    return d < 4.5 && d > 1.2 && this.bloom < 0.5 ? this.data.prompt : null;
  }
  protected animate(f: Frame, h: Hooks): void {
    const d = this.distance(f.player);
    // Ascending tones as you walk the spiral inward.
    const step = d < 4 ? Math.floor((4 - d) / 0.6) : -1;
    if (step > this.lastStep && step >= 0) {
      const scale = [392, 440, 493.88, 587.33, 659.25, 783.99, 880];
      h.audio.bell(scale[Math.min(step, scale.length - 1)], 0.035, 3);
    }
    this.lastStep = step;
    const atCentre = d < 0.8;
    if (atCentre && this.bloom < 0.05) h.audio.bell(1046.5, 0.05, 7);
    this.bloom += ((atCentre ? 1 : 0) - this.bloom) * Math.min(1, f.dt * (atCentre ? 0.8 : 0.3));
    this.petals.forEach((p, i) => {
      p.rotation.x = -(1 - this.bloom) * 1.3 - 0.15;
      (p.material as THREE.MeshBasicMaterial).opacity = 0.15 + this.bloom * 0.7;
      p.scale.setScalar(0.5 + this.bloom * 0.9 + (f.reduced ? 0 : Math.sin(f.t + i) * 0.03));
    });
    this.bedMat.emissiveIntensity = 0.3 + this.active * 0.35 + this.bloom * 0.3;
    const grow = Math.min(1, 0.25 + this.active * 0.75 + this.bloom);
    this.vines.forEach((l, i) => {
      const wave = f.reduced ? 1 : 0.9 + 0.1 * Math.sin(f.t * 0.5 + i);
      l.geometry.setDrawRange(0, Math.floor(61 * grow * wave));
    });
  }
}

/* ---------------------------------------------------------------- IV. The Emperor */
class Emperor extends Station {
  private square: THREE.MeshBasicMaterial;
  private stars: THREE.Group;
  private starMat: THREE.PointsMaterial;
  private lineMatC: THREE.LineBasicMaterial;
  private seat = new THREE.Vector3();
  private sitting = 0;
  constructor(d: StationData) {
    super(d);
    this.square = glowMat(new THREE.Color(0.85, 0.82, 0.72), 0.12);
    const sq = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 4.2).rotateX(-Math.PI / 2), this.square);
    sq.position.y = 0.14;
    this.group.add(sq);
    const edge = line([new THREE.Vector3(-2.1, 0.15, -2.1), new THREE.Vector3(2.1, 0.15, -2.1), new THREE.Vector3(2.1, 0.15, 2.1), new THREE.Vector3(-2.1, 0.15, 2.1), new THREE.Vector3(-2.1, 0.15, -2.1)], lineMat(PEARL, 0.8));
    this.group.add(edge);
    // The throne: a dark cube with a low back.
    const cube = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.55, 1.0), this.stone);
    cube.position.set(0, 0.28, -0.4);
    const back = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.3, 0.25), this.stone);
    back.position.set(0, 0.9, -0.95);
    cube.castShadow = back.castShadow = true;
    this.group.add(cube, back);
    // Memory stars: faint constellations that gather overhead while you sit.
    this.stars = new THREE.Group();
    this.starMat = new THREE.PointsMaterial({ color: new THREE.Color(1, 0.95, 0.85), size: 0.5, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
    this.lineMatC = new THREE.LineBasicMaterial({ color: GOLD, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
    let seed = 4;
    const R = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let c = 0; c < 6; c++) {
      const cx = (R() - 0.5) * 50, cz = (R() - 0.5) * 50 - 5, cy = 28 + R() * 14;
      const pts: THREE.Vector3[] = [];
      let x = cx, y = cy, z = cz;
      for (let k = 0; k < 5 + Math.floor(R() * 3); k++) {
        pts.push(new THREE.Vector3(x, y, z));
        x += (R() - 0.5) * 9;
        y += (R() - 0.5) * 3;
        z += (R() - 0.5) * 9;
      }
      this.stars.add(new THREE.Points(new THREE.BufferGeometry().setFromPoints(pts), this.starMat));
      this.stars.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), this.lineMatC));
    }
    this.group.add(this.stars);
    this.seat.set(this.center.x, this.center.y + 0.12, this.center.z + 0.2);
  }
  prompt(f: Frame): string | null {
    return this.distance(f.player) < 2.6 && f.gesture !== "sit" ? this.data.prompt : null;
  }
  act(_f: Frame, h: Hooks): void {
    h.sit(this.seat, Math.PI); // facing out, toward +z
    h.audio.bell(329.63, 0.05, 7);
  }
  protected animate(f: Frame): void {
    const here = f.gesture === "sit" && this.distance(f.player) < 2.6;
    this.sitting += ((here ? 1 : 0) - this.sitting) * Math.min(1, f.dt * 0.5);
    this.square.opacity = 0.1 + this.active * 0.12 + this.sitting * 0.15;
    this.starMat.opacity = this.sitting * 0.95;
    this.lineMatC.opacity = this.sitting * 0.35;
    this.stars.rotation.y = f.reduced ? 0 : f.t * 0.004;
  }
}

/* ---------------------------------------------------------------- V. The Hierophant */
class Hierophant extends Station {
  private shimmer: THREE.ShaderMaterial;
  private ripple: THREE.Mesh;
  private rippleMat: THREE.MeshBasicMaterial;
  private rippleT = 9;
  private side = 0;
  constructor(d: StationData) {
    super(d);
    for (const x of [-1.25, 1.25]) {
      const s = new THREE.Mesh(new THREE.BoxGeometry(0.65, 3.2, 0.7), this.stone);
      s.position.set(x, 1.6, 0);
      s.castShadow = true;
      this.group.add(s);
    }
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.6, 0.85), this.stone);
    lintel.position.set(0, 3.45, 0);
    lintel.castShadow = true;
    this.group.add(lintel);
    this.shimmer = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      uniforms: { uT: { value: 0 }, uI: { value: 0.3 } },
      vertexShader: `varying vec2 vU;void main(){vU=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
      fragmentShader: `varying vec2 vU;uniform float uT,uI;void main(){
        float w=sin(vU.y*40.0-uT*2.0+sin(vU.x*9.0+uT)*2.0)*0.5+0.5;
        float e=smoothstep(0.0,0.15,vU.x)*smoothstep(1.0,0.85,vU.x)*smoothstep(1.0,0.8,vU.y);
        gl_FragColor=vec4(vec3(0.9,0.85,1.0)*w*e*0.12*uI,1.0);}`,
    });
    const sh = new THREE.Mesh(new THREE.PlaneGeometry(1.85, 3.1), this.shimmer);
    sh.position.set(0, 1.55, 0);
    this.group.add(sh);
    this.rippleMat = glowMat(GOLD, 0);
    this.ripple = new THREE.Mesh(new THREE.RingGeometry(0.96, 1.0, 96).rotateX(-Math.PI / 2), this.rippleMat);
    this.ripple.position.y = 0.16;
    this.group.add(this.ripple);
  }
  prompt(f: Frame): string | null {
    const l = this.local(f.player);
    return Math.abs(l.x) < 2.5 && Math.abs(l.y) < 3.5 && Math.abs(l.y) > 0.6 ? this.data.prompt : null;
  }
  protected animate(f: Frame, h: Hooks): void {
    const l = this.local(f.player);
    const s = Math.abs(l.x) < 1 ? Math.sign(l.y) : 0;
    if (s !== 0 && this.side !== 0 && s !== this.side) {
      // Passing beneath the arch.
      this.rippleT = 0;
      h.audio.bell(246.94, 0.08, 8);
    }
    if (s !== 0) this.side = s;
    this.rippleT += f.dt;
    const k = Math.min(1, this.rippleT / 6);
    this.ripple.scale.setScalar(1 + k * 16);
    this.rippleMat.opacity = (1 - k) * 0.7;
    this.shimmer.uniforms.uT.value = f.t;
    this.shimmer.uniforms.uI.value = 1 + this.active * 1.5 + (1 - k) * 2;
  }
}

/* ---------------------------------------------------------------- VI. The Lovers */
class Lovers extends Station {
  private rings: THREE.MeshStandardMaterial;
  private star: THREE.Sprite;
  private pulseT = 9;
  private wasCentre = false;
  constructor(d: StationData) {
    super(d);
    this.radius = 6;
    this.rings = new THREE.MeshStandardMaterial({ color: "#e6c27a", metalness: 1, roughness: 0.3, emissive: GOLD, emissiveIntensity: 0.35 });
    for (const x of [-1.4, 1.4]) {
      const r = new THREE.Mesh(new THREE.TorusGeometry(2.8, 0.05, 10, 128), this.rings);
      r.rotation.x = Math.PI / 2;
      r.position.set(x, 0.2, 0);
      this.group.add(r);
    }
    // Two paths that curve apart and rejoin, crossing at the centre.
    for (const sgn of [-1, 1]) {
      const pts: THREE.Vector3[] = [];
      for (let k = 0; k <= 80; k++) {
        const u = k / 80;
        const z = -4 + u * 8;
        const x = sgn * Math.sin(u * Math.PI * 2) * 1.2;
        pts.push(new THREE.Vector3(x, 0.16, z));
      }
      this.group.add(line(pts, lineMat(PEARL, 0.85)));
    }
    this.star = new THREE.Sprite(new THREE.SpriteMaterial({ map: HALO, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, color: new THREE.Color(1.6, 1.4, 1.2) }));
    this.star.scale.setScalar(1.6);
    this.star.position.y = 5.5;
    this.group.add(this.star);
  }
  prompt(f: Frame): string | null {
    const d = this.distance(f.player);
    return d < 4.5 && d > 1 ? this.data.prompt : null;
  }
  protected animate(f: Frame, h: Hooks): void {
    const centre = this.distance(f.player) < 0.7;
    if (centre && !this.wasCentre) {
      this.pulseT = 0;
      h.audio.bell(440, 0.05, 6);
      window.setTimeout(() => h.audio.bell(659.25, 0.04, 7), 240);
    }
    this.wasCentre = centre;
    this.pulseT += f.dt;
    const pulse = Math.exp(-this.pulseT * 1.5);
    this.rings.emissiveIntensity = 0.35 + this.active * 0.4 + pulse * 3;
    this.star.scale.setScalar(1.6 + this.active * 0.6 + pulse * 1.5 + (f.reduced ? 0 : Math.sin(f.t * 1.3) * 0.1));
  }
}

/* ---------------------------------------------------------------- VII. The Chariot */
class Chariot extends Station {
  vessel = new THREE.Group();
  private hullMat: THREE.MeshBasicMaterial;
  private road: THREE.ShaderMaterial;
  constructor(d: StationData) {
    super(d);
    // A small vessel of light: a shallow crescent hull with a fine gold rim.
    const hullGeo = new THREE.SphereGeometry(1, 32, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
    hullGeo.scale(0.9, 0.45, 2.1);
    this.hullMat = glowMat(new THREE.Color(1.0, 0.85, 0.6), 0.35);
    const hull = new THREE.Mesh(hullGeo, this.hullMat);
    hull.position.y = 0.45;
    const rim = line(circlePts(1, 96).map((p) => new THREE.Vector3(p.x * 0.9, 0.45, p.z * 2.1)), lineMat(GOLD, 1));
    this.vessel.add(hull, rim);
    this.vessel.position.set(0, 0.25, -1.5);
    this.group.add(this.vessel);
    // A long straight road of light running to the horizon.
    this.road = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uT: { value: 0 }, uI: { value: 0.3 } },
      vertexShader: `varying vec2 vU;void main(){vU=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
      fragmentShader: `varying vec2 vU;uniform float uT,uI;void main(){
        float edge=smoothstep(0.0,0.08,vU.x)*smoothstep(1.0,0.92,vU.x);
        float centre=exp(-pow((vU.x-0.5)*9.0,2.0));
        float dash=0.6+0.4*smoothstep(0.3,0.7,fract(vU.y*120.0-uT*0.3));
        float far=1.0-smoothstep(0.2,1.0,vU.y);
        gl_FragColor=vec4(vec3(1.0,0.84,0.58)*(edge*0.25+centre*dash)*far*uI,1.0);}`,
    });
    const road = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 420).rotateX(-Math.PI / 2), this.road);
    road.position.set(0, 0.2, -212);
    this.group.add(road);
  }
  ready(h: Hooks): boolean {
    return h.visitedCount() >= 6;
  }
  prompt(f: Frame, h: Hooks): string | null {
    return this.distance(f.player) < 3.5 && this.ready(h) ? this.data.prompt : null;
  }
  act(_f: Frame, h: Hooks): void {
    if (this.ready(h)) h.board();
  }
  protected animate(f: Frame, h: Hooks): void {
    const ready = this.ready(h);
    this.hullMat.opacity = (ready ? 0.45 : 0.14) + this.active * 0.25 + (f.reduced ? 0 : Math.sin(f.t * 0.9) * 0.05);
    this.road.uniforms.uT.value = f.t;
    this.road.uniforms.uI.value = (ready ? 0.9 : 0.25) + this.active * 0.6;
    if (!this.riding) this.vessel.position.y = 0.25 + (f.reduced ? 0 : Math.sin(f.t * 0.8) * 0.06);
  }
  riding = false;
}

export function buildStations(): Station[] {
  const make = [Magician, Priestess, Empress, Emperor, Hierophant, Lovers, Chariot];
  return STATION_DATA.map((d, i) => new make[i](d));
}
export type { Chariot };
