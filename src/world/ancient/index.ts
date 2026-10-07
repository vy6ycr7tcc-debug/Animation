/* The drowned cities of the ancient tellings (the owner's brief: Mayan, Atlantis, Lemuria), each
   at one of the world's own ruin sites on the lake floors (depths.ts `AREA_SITES`), built there
   in place of that site's ruin.
   - Each city is drawn only while you are within a few hundred metres of it.
   - Its telling begins once, the first time you come into it (into the water over its floor),
     and plays on wherever you go: leaving never ducks, cuts or restarts it (the owner's rule for
     these areas). Not while "Only nature" rests the voices, nor over an archive narration: then
     it waits until you next come in.
   - Near a city, the water takes its colour and its shafts of light (underwater.ts). */
import * as THREE from "three/webgpu";
import { AREA_SITES, type AreaId, type RuinSite } from "../depths";
import { WATER_Y, type Collider } from "../terrain";
import type { UnderwaterEffect } from "../underwater";
import type { RGB } from "./kit";
import { buildMayan } from "./mayan";
import { buildAtlantis } from "./atlantis";
import catalogue from "../../../content/narration.json";

export interface Area {
  id: AreaId;
  /** Its telling's catalogue id (content/narration.json). */
  track: string;
  site: RuinSite;
  /** Coming within this of its centre is coming into it. */
  radius: number;
  group: THREE.Group;
  solids: Collider[];
  /** The water about it: its colour (×), its shafts' strength and colour. */
  water: { tint: RGB; shaft: number; shaftCol: RGB };
  loaded: Promise<void>;
  /** `telling`: what is speaking and how far in (seconds), for what answers the telling. */
  update(dt: number, t: number, visitor: THREE.Vector3, reduced: boolean, telling: { id: string | null; t: number }): void;
}

const cuesOf = (id: string) => (catalogue.tracks as { id: string; cues: { t: number }[] }[]).find((t) => t.id === id)?.cues ?? [];
const BUILD: Record<AreaId, (s: RuinSite) => Area> = { mayan: buildMayan, atlantis: (s) => buildAtlantis(s, cuesOf("ATLANTIS")) };
const SEEN = 260;
const OPEN = { tint: [1, 1, 1] as RGB, shaft: 1, shaftCol: [0.3, 0.55, 0.62] as RGB };

export class Ancients {
  readonly group = new THREE.Group();
  readonly areas: Area[] = [];
  /** Tellings already begun this visit to the game. */
  private told = new Set<AreaId>();
  private k = 0;
  private near: Area | null = null;

  constructor() {
    for (const [id, site] of Object.entries(AREA_SITES) as [AreaId, RuinSite][]) {
      const a = BUILD[id](site);
      a.group.visible = false;
      this.areas.push(a);
      this.group.add(a.group);
    }
  }

  /** Each frame. `speak` begins a telling and says whether it could (voices on, nothing in the
      way); `uw` is the water's look. Returns the city you are in, if any. */
  update(dt: number, t: number, visitor: THREE.Vector3, reduced: boolean, uw: UnderwaterEffect, speak: (track: string) => boolean, telling: { id: string | null; t: number } = { id: null, t: 0 }): Area | null {
    let inside: Area | null = null, nearest: Area | null = null, nd = Infinity;
    for (const a of this.areas) {
      const d = Math.hypot(visitor.x - a.site.x, visitor.z - a.site.z);
      a.group.visible = d < a.radius + SEEN;
      if (!a.group.visible) continue;
      a.update(dt, t, visitor, reduced, telling);
      if (d < nd) (nd = d), (nearest = a);
      if (d < a.radius && visitor.y < WATER_Y + 0.5) {
        inside = a;
        if (!this.told.has(a.id) && speak(a.track)) this.told.add(a.id);
      }
    }
    // the water takes the nearest city's colour, fully within it, easing out over 60 m
    const want = nearest ? THREE.MathUtils.smoothstep(nearest.radius + 60, nearest.radius, nd) : 0;
    if (nearest) this.near = nearest;
    this.k += (want - this.k) * Math.min(1, dt * 0.5);
    const w = this.near?.water ?? OPEN, k = this.k, u = uw.u;
    const mixv = (a: RGB, b: RGB) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k] as RGB;
    u.uTint.value.set(...mixv(OPEN.tint, w.tint));
    u.uShaftCol.value.set(...mixv(OPEN.shaftCol, w.shaftCol));
    u.uShaft.value = OPEN.shaft + (w.shaft - OPEN.shaft) * k;
    return inside;
  }
}
