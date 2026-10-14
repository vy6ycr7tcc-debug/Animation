/* Readable artifacts (the owner: "tap on a shiny artifact and a text box appears where you read
   the text"). Each reading in `content/readings.json` lies somewhere in the world as a small
   thing of old stone with gold worked into it: an upright tablet, a scroll resting on a stone,
   or a flat inscribed stone. A glint turns slowly over it and a few motes rise, so it can be
   found; once read, the glint quiets to a faint ember. A tap (or R when near) opens its reading
   (ui/reader.ts). What has been read is remembered on the device. Drawn only within 160 m. */
import * as THREE from "three/webgpu";
import data from "../../content/readings.json";
import { T } from "../gpu/tsl";
import { heightAt, WATER_Y } from "./terrain";

export interface Reading {
  id: string;
  title: string;
  pages: string[];
  look?: "tablet" | "scroll" | "stone";
  place: { near?: string; dist?: number; bearing?: number; x?: number; z?: number };
  audio?: string;
  /** A recording for each page (read aloud page by page), in place of one `audio`. */
  voices?: string[];
  /** Begin speaking as it opens, and go on page by page as the pages turn. */
  autoVoice?: boolean;
  sample?: boolean;
}

interface Artifact {
  r: Reading;
  root: THREE.Group;
  glint: THREE.Sprite;
  pos: THREE.Vector3; // where a tap aims (its face)
  read: boolean;
}

const KEY = "inward-journey:read";

/** A four-pointed glint with a soft round heart, drawn once. */
function glintTexture(): THREE.Texture {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  r.addColorStop(0, "rgba(255,240,205,1)");
  r.addColorStop(0.12, "rgba(255,226,170,0.55)");
  r.addColorStop(0.4, "rgba(255,210,150,0.08)");
  r.addColorStop(1, "rgba(255,210,150,0)");
  g.fillStyle = r;
  g.fillRect(0, 0, 128, 128);
  g.globalCompositeOperation = "lighter";
  for (const [w, h] of [[2.2, 60], [60, 2.2]]) {
    const lg = g.createRadialGradient(64, 64, 0, 64, 64, 60);
    lg.addColorStop(0, "rgba(255,236,200,0.9)");
    lg.addColorStop(1, "rgba(255,236,200,0)");
    g.fillStyle = lg;
    g.beginPath();
    g.ellipse(64, 64, w, h, 0, 0, Math.PI * 2);
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Dark weathered stone with gold worked into it: lines of inscription across its face (in
    the object's own frame), catching a little light of their own. */
function stoneMaterial(lines: boolean): THREE.MeshStandardNodeMaterial {
  const { abs, float, fract, mix, positionGeometry, sin, smoothstep, step, vec3 } = T;
  const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.82, metalness: 0.05 });
  const p = positionGeometry;
  const grain = sin(p.x.mul(91).add(sin(p.y.mul(57)))).mul(sin(p.z.mul(73).add(p.y.mul(13)))).mul(0.5).add(0.5);
  m.colorNode = mix(vec3(0.16, 0.15, 0.17), vec3(0.27, 0.25, 0.26), grain);
  if (lines) {
    // rows of short gold strokes: the writing, worn in places
    const row = fract(p.y.mul(26)), cell = fract(p.x.mul(14).add(sin(p.y.mul(26).floor().mul(7.1)).mul(3)));
    const stroke = smoothstep(0.42, 0.5, row).mul(smoothstep(0.62, 0.54, row)).mul(step(0.18, cell)).mul(step(cell, 0.86));
    const worn = step(0.25, fract(sin(p.y.mul(26).floor().mul(12.9).add(p.x.mul(14).floor().mul(4.1))).mul(437.5)));
    const face = smoothstep(0.02, 0.05, abs(p.z)).mul(float(1)); // both broad faces
    m.emissiveNode = vec3(1.0, 0.78, 0.42).mul(stroke.mul(worn).mul(face).mul(0.55));
    m.metalnessNode = stroke.mul(0.6);
  }
  return m;
}

export class Readables {
  group = new THREE.Group();
  private list: Artifact[] = [];
  private built = false;
  private read = new Set<string>();
  private tex = glintTexture();
  private v = new THREE.Vector3();

  /** `where(label)`: a place on the map by its name. `samples`: show the sample entries (dev, stills). */
  constructor(
    private where: (label: string) => { x: number; z: number } | undefined,
    private samples = false,
  ) {
    try {
      this.read = new Set(JSON.parse(localStorage.getItem(KEY) || "[]") as string[]);
    } catch {
      /* nothing read yet */
    }
  }

  get readings(): Reading[] {
    return (data.readings as Reading[]).filter((r) => this.samples || !r.sample);
  }

  /** Where it lies: by a map place, a distance and a bearing, or plainly; stepped off the water. */
  private spot(r: Reading): THREE.Vector3 | null {
    let x = r.place.x, z = r.place.z;
    if (r.place.near) {
      const p = this.where(r.place.near);
      if (!p) return null;
      const d = r.place.dist ?? 6, b = r.place.bearing ?? 0;
      x = p.x + Math.sin(b) * d;
      z = p.z - Math.cos(b) * d;
    }
    if (x === undefined || z === undefined) return null;
    for (let k = 0; k < 40; k++) {
      const a = k * 2.399, d = k === 0 ? 0 : 1.5 + k * 0.8;
      const px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d, h = heightAt(px, pz);
      if (h > WATER_Y + 0.3) return new THREE.Vector3(px, h, pz);
    }
    return null;
  }

  private build(): void {
    this.built = true;
    const stone = stoneMaterial(false), carved = stoneMaterial(true);
    const parch = new THREE.MeshStandardNodeMaterial({ color: 0xd9c49a, roughness: 0.9 });
    const gold = new THREE.MeshStandardNodeMaterial({ color: 0xc9a25a, roughness: 0.35, metalness: 0.8 });
    for (const r of this.readings) {
      const at = this.spot(r);
      if (!at) continue;
      const root = new THREE.Group();
      root.position.copy(at);
      root.rotation.y = (r.id.length * 1.7) % 6.28;
      const look = r.look ?? "tablet";
      let face = 0.5;
      if (look === "tablet") {
        // an upright tablet with a rounded crown, set in a low base
        const shape = new THREE.Shape();
        shape.moveTo(-0.28, 0).lineTo(0.28, 0).lineTo(0.28, 0.58).absarc(0, 0.58, 0.28, 0, Math.PI, false).lineTo(-0.28, 0);
        const g = new THREE.ExtrudeGeometry(shape, { depth: 0.09, bevelEnabled: true, bevelSize: 0.015, bevelThickness: 0.015, bevelSegments: 2, curveSegments: 16 });
        g.translate(0, 0, -0.045);
        const tab = new THREE.Mesh(g, carved);
        tab.position.y = 0.12;
        tab.rotation.x = -0.08;
        const base = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.16, 0.32), stone);
        base.position.y = 0.06;
        root.add(tab, base);
        face = 0.6;
      } else if (look === "scroll") {
        // a scroll half-unrolled on a flat stone, its rods tipped in gold
        const slab = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.48, 0.22, 9), stone);
        slab.position.y = 0.11;
        const sheet = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.006, 0.3), parch);
        sheet.position.set(0.04, 0.226, 0);
        const roll = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.36, 12), parch);
        roll.rotation.z = Math.PI / 2;
        roll.rotation.y = Math.PI / 2;
        roll.position.set(-0.2, 0.255, 0);
        root.add(slab, sheet, roll);
        for (const s of [-1, 1]) {
          const cap = new THREE.Mesh(new THREE.SphereGeometry(0.03, 10, 8), gold);
          cap.position.set(-0.2, 0.255, s * 0.19);
          root.add(cap);
        }
        face = 0.3;
      } else {
        // a flat stone, its face worked with writing
        const g = new THREE.CylinderGeometry(0.5, 0.56, 0.16, 10);
        const flat = new THREE.Mesh(g, stone);
        flat.position.y = 0.08;
        const top = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.62, 0.02), carved);
        top.rotation.x = -Math.PI / 2;
        top.position.y = 0.165;
        root.add(flat, top);
        face = 0.25;
      }
      root.traverse((o) => {
        if ((o as THREE.Mesh).isMesh) (o.castShadow = true), (o.receiveShadow = true);
      });
      const glint = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.tex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false }));
      glint.position.set(0, face + 0.25, 0);
      root.add(glint);
      this.group.add(root);
      this.list.push({ r, root, glint, pos: new THREE.Vector3(at.x, at.y + face, at.z), read: this.read.has(r.id) });
    }
  }

  /** Each frame: drawn near, the glint turning and breathing (quieter once read). */
  update(t: number, player: THREE.Vector3, away: boolean): void {
    if (!this.built) this.build();
    this.group.visible = !away;
    if (away) return;
    for (const a of this.list) {
      const d = a.pos.distanceTo(player);
      a.root.visible = d < 160;
      if (!a.root.visible) continue;
      const k = a.read ? 0.35 : 1;
      const breath = 0.75 + 0.25 * Math.sin(t * 1.6 + a.pos.x);
      // it can be seen from afar: the glint keeps a few pixels of size however far
      const s = (0.8 + 0.3 * breath) * k * Math.max(1, d / 22);
      a.glint.scale.setScalar(s);
      a.glint.material.rotation = t * 0.25;
      a.glint.material.opacity = (0.55 + 0.45 * breath) * k;
    }
  }

  /** The artifact under a tap, generous on a phone; null if none. */
  pick(x: number, y: number, camera: THREE.PerspectiveCamera): { reading: Reading; pos: THREE.Vector3 } | null {
    let best: Artifact | null = null, bd = Infinity;
    const w = innerWidth, h = innerHeight, f = h / (2 * Math.tan((camera.fov * Math.PI) / 360));
    for (const a of this.list) {
      if (!a.root.visible) continue;
      const d = a.pos.distanceTo(camera.position);
      if (d > 90) continue;
      this.v.copy(a.pos).project(camera);
      if (this.v.z > 1) continue;
      const sx = (this.v.x * 0.5 + 0.5) * w, sy = (-this.v.y * 0.5 + 0.5) * h;
      const reach = Math.max(34, (0.6 / d) * f * 1.4);
      if (Math.hypot(sx - x, sy - y) < reach && d < bd) (bd = d), (best = a);
    }
    return best ? { reading: best.r, pos: best.pos } : null;
  }

  /** The nearest within reach of the wanderer (for the keyboard and for arriving after a tap). */
  nearest(p: THREE.Vector3, within = 3): { reading: Reading; pos: THREE.Vector3 } | null {
    let best: Artifact | null = null, bd = within;
    for (const a of this.list) {
      const d = Math.hypot(a.pos.x - p.x, a.pos.z - p.z);
      if (d < bd) (bd = d), (best = a);
    }
    return best ? { reading: best.r, pos: best.pos } : null;
  }

  markRead(id: string): void {
    const a = this.list.find((x) => x.r.id === id);
    if (a) a.read = true;
    this.read.add(id);
    try {
      localStorage.setItem(KEY, JSON.stringify([...this.read]));
    } catch {
      /* fine */
    }
  }

  /** Where one lies (for a still, or a guide). */
  at(id: string): THREE.Vector3 | null {
    return this.list.find((a) => a.r.id === id)?.pos ?? null;
  }
}
