/* Where the archive's vessels stand (content/transcript_orbs.json). Everything is placed from
   the data alone, so the real delivery (8 orbs, 18 groves) needs no code change.
   - Each narration may name its vessel: `"vessel": "tree" | "planet" | "star"`. Without it, the
     groves' episodes are fruit on their trees, and the orbs all live in the sky (Samuel: "the
     planets and orbs need to be on the sky"), planets and stars in turn. An episode marked
     "planet" or "star" leaves its tree for the sky.
   - A sky planet can be tapped from the ground below it; fly up to hear a star.
   - Each grove stands where its `suggested_biome` fits (meadow, water, hills, sand, forest,
     "near the starting shore", ...), well apart from the others, the landmarks and the shore. */
import data from "../../content/transcript_orbs.json";
import { fbm, groundKind, heightAt, LANDMARK_SITES, SPAWN, WATER_Y, WORLD_R } from "./terrain";

export interface Source {
  entity: string;
  date: string;
  session_label: string;
}
export interface Narration {
  id: string;
  title: string;
  audio: string;
  transcript: string;
  interpretive: boolean;
  sources: Source[];
  /** Which vessel carries it (optional; see above). */
  vessel?: "tree" | "planet" | "star";
}
export interface GroveData {
  id: string;
  name: string;
  suggested_biome?: string;
  episodes: Narration[];
}
export const ARCHIVE = data as unknown as { orbs: Narration[]; trees: GroveData[] };

export type Realm = "star" | "sky";
export interface OrbSite {
  orb: Narration;
  realm: Realm;
  x: number;
  y: number;
  z: number;
}
export interface GroveSite {
  grove: GroveData;
  index: number;
  x: number;
  y: number;
  z: number;
}

const GOLDEN = Math.PI * (3 - Math.sqrt(5));
const MAX_R = WORLD_R - 900; // stay inside the ring of mountains

function awayFromLandmarks(x: number, z: number, r: number): boolean {
  if (Math.hypot(x - SPAWN.x, z - SPAWN.z) < 35) return false;
  for (const [lx, lz] of LANDMARK_SITES) if (Math.hypot(x - lx, z - lz) < r) return false;
  return true;
}

/** Search outward from (x, z) along a spiral for the first point that passes `ok`. */
function spiral(x: number, z: number, ok: (x: number, z: number) => boolean, step = 11, maxR = 700): [number, number] | null {
  for (let r = 0; r <= maxR; r += step) {
    const n = r === 0 ? 1 : Math.max(8, Math.round((r * 2 * Math.PI) / (step * 2.5)));
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + r * 0.013;
      const px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
      if (Math.hypot(px, pz) < MAX_R && ok(px, pz)) return [px, pz];
    }
  }
  return null;
}

function placeOrbs(orbs: Narration[]): OrbSite[] {
  // the orbs that don't name their vessel: planets and stars in turn
  const free = orbs.filter((o) => !o.vessel);
  const out: OrbSite[] = [];
  orbs.forEach((orb, i) => {
    const realm: Realm = orb.vessel === "star" || (!orb.vessel && free.indexOf(orb) % 2 === 1) ? "star" : "sky";
    // spread around the world on a golden-angle spiral, from ~240 m to ~1.3 km out
    const a = i * GOLDEN * 2.3 + 0.7, r = 240 + ((i * 0.618) % 1) * 1050;
    const cx = Math.cos(a) * r, cz = Math.sin(a) * r;
    const taken = (x: number, z: number) => out.every((o) => Math.hypot(o.x - x, o.z - z) > 120);
    if (realm === "star") {
      // a star of the night sky, overhead: 150–240 m above the land, a short flight up
      const p = spiral(cx * 1.2, cz * 1.2, (x, z) => taken(x, z), 23) ?? [cx, cz];
      out.push({ orb, realm, x: p[0], y: Math.max(heightAt(p[0], p[1]), WATER_Y) + 150 + ((i * 131) % 90), z: p[1] });
      return;
    }
    const p = spiral(cx, cz, (x, z) => taken(x, z) && awayFromLandmarks(x, z, 60), 17) ?? [cx, cz];
    const ground = Math.max(heightAt(p[0], p[1]), WATER_Y);
    // a planet low in the sky, large: from the ground it rises over the horizon ahead (higher
    // up, it sat above the top of a phone's view, which looks a little down at the land)
    out.push({ orb, realm, x: p[0], y: ground + 50 + ((i * 53) % 40), z: p[1] });
  });
  return out;
}

/** How well a spot fits a grove's biome hint, 0 (not at all) to 1. */
function biomeFit(hint: string, x: number, z: number): number {
  const h = heightAt(x, z);
  if (h < WATER_Y + 0.8 || h > 60) return 0;
  const k = groundKind(x, z, h);
  const flat = Math.abs(heightAt(x + 6, z) - h) + Math.abs(heightAt(x, z + 6) - h) < 3.2 ? 1 : 0;
  if (!flat) return 0;
  const w = hint.toLowerCase();
  let fit = 0.4, terms = 0;
  const want = (cond: boolean, weight = 1) => {
    terms += weight;
    fit += cond ? weight : 0;
  };
  if (/meadow|grass|field|glade|flower/.test(w)) want(k.meadow > 0.25);
  if (/water|lake|shore|beach|river|stream|pool|sea|coast/.test(w)) {
    let wet = false;
    for (let a = 0; a < 6.28 && !wet; a += 0.785) wet = heightAt(x + Math.cos(a) * 16, z + Math.sin(a) * 16) < WATER_Y - 0.3;
    want(wet, 1.5);
  }
  if (/hill|high|mountain|peak|ridge|summit|cliff/.test(w)) want(h > 12);
  if (/sand|dune|desert/.test(w)) want(k.sand > 0.35);
  if (/stone|rock|crag/.test(w)) want(k.stone > 0.2);
  if (/forest|wood|trees|grove/.test(w)) want(fbm(x * 0.008 + 71, z * 0.008 - 33) > 0.55);
  if (/start|spawn|shore where|first|beginning/.test(w)) want(Math.hypot(x - SPAWN.x, z - SPAWN.z) < 260, 1.5);
  return terms ? fit / (terms + 0.4) : fit;
}

function placeGroves(trees: GroveData[]): GroveSite[] {
  const out: GroveSite[] = [];
  trees.forEach((grove, index) => {
    const hint = grove.suggested_biome ?? "";
    const nearStart = /start|spawn|beginning|first/.test(hint.toLowerCase());
    // look around a home point on a wide golden-angle spiral, and take the best-fitting spot
    const a = index * GOLDEN * 1.7 + 2.1, r = nearStart ? 110 : 260 + ((index * 0.382) % 1) * 1000;
    const hx = Math.cos(a) * r, hz = Math.sin(a) * r;
    let best: [number, number] | null = null, bestFit = 0.05;
    for (let rr = 0; rr <= 480; rr += 24) {
      const n = rr === 0 ? 1 : Math.round((rr * 2 * Math.PI) / 40);
      for (let k = 0; k < n; k++) {
        const b = (k / n) * Math.PI * 2;
        const x = hx + Math.cos(b) * rr, z = hz + Math.sin(b) * rr;
        if (Math.hypot(x, z) > MAX_R || !awayFromLandmarks(x, z, 45)) continue;
        if (out.some((g) => Math.hypot(g.x - x, g.z - z) < 140)) continue;
        // a gentle preference for staying near home, so groves spread through the world
        const f = biomeFit(hint, x, z) - rr / 5200;
        if (f > bestFit + 0.001) {
          bestFit = f;
          best = [x, z];
        }
      }
      if (bestFit > 0.9 && rr > 60) break;
    }
    const [x, z] = best ?? [hx, hz];
    out.push({ grove, index, x, y: heightAt(x, z), z });
  });
  return out;
}

// episodes that name the sky as their vessel leave their groves for it
const SKYWARD = (ARCHIVE.trees ?? []).flatMap((t) => t.episodes.filter((e) => e.vessel === "planet" || e.vessel === "star"));
const TREES = (ARCHIVE.trees ?? []).map((t) => ({ ...t, episodes: t.episodes.filter((e) => !SKYWARD.includes(e)) })).filter((t) => t.episodes.length);
export const ORB_SITES: OrbSite[] = placeOrbs([...(ARCHIVE.orbs ?? []), ...SKYWARD]);
export const GROVE_SITES: GroveSite[] = placeGroves(TREES);
