/* Dev-only still-frame hook: ?shot=<sceneId>&t=<seconds> boots the world as usual, forces the
   scene's narrated time to T, renders exactly one deterministic frame, and stops. Inert unless
   the `shot` query param is present — normal play is untouched. */
import { SITES } from "../scenes/sites";
import { DUAT_ORIGIN } from "../world/pyramid";
import { AREA_SITES, RUIN_SITES, type AreaId } from "../world/depths";
import { ADEPT_HALL, DENSITY_HALL, LANDMARK_SITES, PAST_HALL, PEAKS, PYRAMID, SPAWN, heightAt } from "../world/terrain";
import { JOURNEY_ORIGIN } from "../scenes/journey";

export interface Shot {
  id: string;
  t: number;
}

/** The requested scene and its time base (null: no `shot` param). */
export function getShot(): Shot | null {
  const q = new URLSearchParams(location.search);
  const id = q.get("shot");
  if (!id) return null;
  const raw = q.get("t");
  const t = raw === null ? NaN : Number(raw);
  return { id, t: Number.isFinite(t) && t >= 0 ? t : (DEFAULT_T[id] ?? 30) };
}

/** Verify-camera times (an explicit t= always wins). */
const DEFAULT_T: Record<string, number> = {
  "temple-tour": 320,
  shore: 60,
  igloo: 30,
  garden: 20,
  galaxies: 45,
  desert: 120,
  tree: 30,
  "tree-station": 8, // TEMP-VERIFY
  atoms: 52,
  "other-worlds": 36,
  greetings: 68,
  pyramid: 30,
  duat: 30,
  genesis: 9,
};

type XYZ = [number, number, number];
/** The lessons told as visions (scenes/visionLesson.ts): framed from behind the seat. */
const VISION_LESSONS = new Set(["shore", "igloo", "garden", "galaxies", "desert", "tree-station", "atoms", "other-worlds", "greetings"]);
type Site = { x: number; y: number; z: number; heading: number };
const sites = SITES as Record<string, Site | undefined>;
/** The temple tour's interior group sits here (scenes/templeTour.ts). */
const TEMPLE_ORIGIN: XYZ = [30000, 1, 0];

/** Eye / look-at offsets from each clearing's site point (heights above its ground). */
const VIEWS: Record<string, { eye: XYZ; look: XYZ }> = {
  shore: { eye: [0, 3.2, 8], look: [0, 1.1, 0] }, // at the seat
  igloo: { eye: [14, 5, 14], look: [0, 2, 0] }, // at the dome centre
  garden: { eye: [12, 2.2, 12], look: [0, 1.1, 0] },
  galaxies: { eye: [10, 2.8, 10], look: [0, 1.1, 0] },
  atoms: { eye: [0, 3, 8], look: [0, 1, 0] },
  "other-worlds": { eye: [0, 3, 8], look: [0, 1, 0] },
  greetings: { eye: [0, 3, 8], look: [0, 1, 0] },
  desert: { eye: [18, 3, 18], look: [0, 1.1, 0] },
  tree: { eye: [16, 4, 16], look: [0, 0, 0] }, // the crest
  "tree-station": { eye: [0, 1.7, 0], look: [2.5, 9.0, 8] }, // seated view, tilted up: the tree stands ~5m above the seat on the slope
  pyramid: { eye: [0, 58, 210], look: [0, 32, 0] }, // offsets from PYRAMID (terrain)
  duat: { eye: [-6, 3.5, 8], look: [18, 0.5, -14] }, // duat-local: behind/above the entry, down the PATH toward station 1
  genesis: { eye: [0, 5.5, 15], look: [0, 2.2, 0] }, // from the wanderer's feet: behind and above, the heart ahead
};

/** The tour's public API, plus just enough of main.ts to boot a single frame. */
interface TourApi {
  beginTour(): void;
  gotoTree?(): void;
  tree?: { rest?(): void };
  lessons: Record<string, { onSit(): void }>;
}

export interface ShotCtx {
  camera: {
    position: { set(x: number, y: number, z: number): void };
    lookAt(x: number, y: number, z: number): void;
    updateMatrixWorld(force?: boolean): void;
  };
  player: { pos: { x: number; y: number; z: number; set(x: number, y: number, z: number): void }; heading: number };
  follow: { follow: number; startFollowing(now?: boolean): void };
  narration: { debugTime: number | null };
  tour: TourApi;
  S: { mode: string; t: number; wt: number };
  terrain: { update(x: number, z: number, force?: boolean): void };
  /** The gateway into the telling of Egypt (world). */
  gate?: { x: number; y: number; z: number };
  setInside(inside: boolean): void;
  /** Begin genesis where the wanderer stands, at time t of the sequence; returns the feet. */
  genesisAt?(t: number): XYZ;
  update(dt: number): void;
  draw(): void;
  /** Settles when what the frame needs has loaded (the recorded figure the visions pose). */
  ready?: Promise<unknown>;
  /** After the first update: settles when what it asked for has arrived (the carvings). */
  settle?(): Promise<unknown>;
  /** Walk into stage `i` of the density journey (no fades), lived for `t` seconds; `journey-<i>`. */
  journey?(name: string, i: number, t: number): Promise<void>;
  /** The world after the veil: its door out in the world (`veil-door`), or beat n's place within
      (`veil-<n>`, n 2–7): where the eye stands and looks, in the world. */
  veil?(n: number): Promise<{ eye: XYZ; look: XYZ }>;
  /** The long descent: its shaft of light in the world (`descent-door`), or beat n's place within
      (`descent-<n>`, n 1–7). */
  descent?(n: number): Promise<{ eye: XYZ; look: XYZ }>;
  /** The breathing ring round the wanderer, held this open (`breath&t=<0..1>`). */
  breath?(open: number): void;
  /** Stand at temple shrine `i`'s place, facing it (`temple-shrine-<i>`). */
  templeStand?(i: number): void;
  /** No touch for a long while (the gravity point and contemplation answer to stillness). */
  idle?(): void;
  /** Build density room `n` alone (the open world hidden); `density-<n>` still frames. */
  room?(n: number): Promise<{ onSit(): void; update(dt: number): void }>;
}

/** The drowned cities' still frames (world/ancient), in each city's own frame. */
const ANCIENT_VIEWS: Record<string, Record<string, { eye: XYZ; look: XYZ }>> = {
  mayan: {
    a: { eye: [5, 5, 26], look: [0, 7, -24] }, // the approach: plaza, altars, the pyramid's stair
    b: { eye: [17, 2.2, 6.5], look: [24, 1.6, -1.4] }, // the stelae, from the way
    c: { eye: [-36, 3.2, 15], look: [-36, 2, -12] }, // down the ball court's alley
    d: { eye: [10, 19, 6], look: [0, 12, -24] }, // the temple on top
    e: { eye: [-14, 3, 19], look: [-20, 0.5, 12] }, // the reading wall
  },
  atlantis: {
    a: { eye: [8, 9, 72], look: [0, 5, 0] }, // the approach over the rings to the acropolis
    b: { eye: [6, 7, 18], look: [0, 6, 0] }, // the acropolis: the temple's columns, the throne
    c: { eye: [-9, 4.5, 52], look: [0, 5, 24] }, // the colonnade, standing and fallen
    d: { eye: [-28, 6, -8], look: [-48, 1, -28] }, // the harbour: quays, ribs of hulls
    e: { eye: [-16, 4, 15], look: [-24, 4, 8] }, // a dead crystal in its broken housing
  },
};

/** The density rooms' still frames: where the eye stands and looks (room frame, the seat at the
    origin facing −z). */
const ROOM_VIEWS: Record<string, { eye: XYZ; look: XYZ }> = {
  "density-1": { eye: [1.5, 2.2, 7], look: [-3, 5, -40] },
  "density-2": { eye: [1.5, 2.0, 7], look: [2, 4, -30] },
  "density-3": { eye: [0, 2.0, 7], look: [0, 2.4, -20] },
  "density-3L": { eye: [-1, 2.2, -3], look: [-5.2, 1.2, -11] },
  "density-3R": { eye: [1.5, 2.4, -4], look: [5.6, 2.2, -13.5] },
  "density-4": { eye: [2.5, 2.0, -1], look: [-1, 2.2, -18] },
  "density-5": { eye: [1.5, 2.2, 6], look: [0, 9, -31] },
  "density-5L": { eye: [2.5, 2.4, -6], look: [0, 4, -16] },
  "density-6": { eye: [0, 1.8, 10], look: [0, 2, -18] },
};
/** The journey's stages (0 the lobby, 1 the beginning, 2–8 the densities): over the shoulder
    of the wanderer where it arrives, looking on into the room. */
const JOURNEY_VIEWS: Record<number, { eye: XYZ; look: XYZ }> = {
  0: { eye: [0, 3.2, 12], look: [0, 3.2, -10] },
  1: { eye: [0, 2.4, 6], look: [0, 3, -12] },
  2: ROOM_VIEWS["density-1"],
  3: ROOM_VIEWS["density-2"],
  4: ROOM_VIEWS["density-3"],
  5: ROOM_VIEWS["density-4"],
  6: ROOM_VIEWS["density-5"],
  7: ROOM_VIEWS["density-6"],
  8: { eye: [0, 1.8, 3], look: [0, 1.4, -60] },
};
/** The adept's stages (0 the lobby, 1 the call, …). */
const ADEPT_VIEWS: Record<number, { eye: XYZ; look: XYZ }> = {
  0: { eye: [0, 3.0, 11], look: [0, 3.0, -10] },
  1: { eye: [1.2, 2.2, 5], look: [0, 3.5, -40] },
  2: { eye: [3.5, 3.2, 5.5], look: [-1.2, 3.4, -10] },
  3: { eye: [2.2, 2.4, 8.5], look: [0.4, 2.2, -4] }, // as the live view frames it: the servant by the basin
  4: { eye: [3, 2.4, 5], look: [-7, 3, -30] },
  5: { eye: [2, 2.4, 6], look: [-2, 12, -60] },
  6: { eye: [-0.5, 2.0, -3.5], look: [2.6, 1.3, -8.6] },
  7: { eye: [2, 3.2, 8], look: [0, 6, -30] },
};

/** The monument of past choices (0 the lobby, 1 Maldek, 2 Mars, 3 Atlantis, 4 Egypt): from
    behind the seat, a little above, looking on into what it shows. */
const PAST_VIEWS: Record<number, { eye: XYZ; look: XYZ }> = {
  0: { eye: [0, 3.0, 10], look: [0, 3.2, -10] },
  1: { eye: [1.5, 2.4, 6], look: [0, 30, -118] },
  2: { eye: [1.2, 2.4, 5], look: [0, -12, -70] },
  3: { eye: [1.2, 2.4, 6], look: [0, 10, -150] },
  4: { eye: [1.2, 2.2, 6], look: [0, 14, -80] },
};

/** Render one still frame of the requested scene at T seconds, then never again. */
export function runShot(ctx: ShotCtx): void {
  if (ctx.ready) {
    const { ready, ...rest } = ctx;
    void ready.then(() => runShot(rest));
    return;
  }
  const shot = getShot();
  if (!shot) return;
  const { id, t } = shot;
  const dm = /^density-(\d)[LR]?$/.exec(id);
  if (dm && ctx.room) {
    // a density room: built alone, seated (so its beats up to T apply), then lived for a while
    // so its eased moods settle where T puts them
    const { room, ...rest } = ctx;
    ctx.narration.debugTime = t;
    void room(Number(dm[1])).then((lesson) => {
      lesson.onSit();
      for (let k = 0, n = Math.min(7200, Math.max(200, Math.round(t / 0.05))); k < n; k++) lesson.update(0.05);
      ctx.S.mode = "play";
      ctx.follow.startFollowing(true);
      ctx.follow.follow = 1;
      ctx.player.pos.set(0, -50, 0);
      // the room keeps its own air: it runs after the world's moods, as it will in the journey
      const worldUpdate = rest.update;
      rest.update = (dt: number) => (worldUpdate(dt), lesson.update(0));
      finish(rest, id, t, [0, 0, 0], ROOM_VIEWS[id] ?? { eye: [0, 2, 8], look: [0, 3, -30] });
    });
    return;
  }

  const vm = /^(veil|descent)-(door|\d)$/.exec(id);
  const place = vm ? (vm[1] === "veil" ? ctx.veil : ctx.descent) : undefined;
  if (vm && place) {
    const { veil: _v, descent: _d, ...rest } = ctx;
    void _v;
    void _d;
    void place(vm[2] === "door" ? (vm[1] === "veil" ? 1 : 0) : Number(vm[2])).then((view) => {
      ctx.S.mode = "play";
      ctx.follow.startFollowing(true);
      ctx.follow.follow = 1;
      ctx.S.t = t;
      for (let i = 0; i < 300; i++) ctx.update(1 / 30); // its life runs a while: the angel gathers into its form
      finish(rest, id, t, [0, 0, 0], view);
    });
    return;
  }
  const jm = /^(journey|adept|past)-(\d)$/.exec(id);
  if (jm && ctx.journey) {
    // the density journey itself: walked into stage k (the real wiring: placed, its air, its seat)
    const { journey, ...rest } = ctx;
    ctx.narration.debugTime = t;
    const k = Number(jm[2]), name = jm[1] === "journey" ? "densities" : jm[1];
    const views = name === "adept" ? ADEPT_VIEWS : name === "past" ? PAST_VIEWS : JOURNEY_VIEWS;
    // &live=S: the game's own camera, after S seconds of stillness (the focus move as it plays)
    const live = Number(new URLSearchParams(location.search).get("live") ?? NaN);
    void journey(name, k, t).then(() => {
      ctx.S.mode = "play";
      ctx.follow.startFollowing(true);
      ctx.follow.follow = 1;
      const o = JOURNEY_ORIGIN;
      if (live >= 0) {
        ctx.idle?.();
        for (let i = 0, n = Math.round(live * 60); i < n; i++) ctx.update(1 / 60);
        ctx.narration.debugTime = t;
        return finish(rest, id, t, [o.x, o.y, o.z], null);
      }
      finish(rest, id, t, [o.x, o.y, o.z], views[k] ?? { eye: [0, 2, 8], look: [0, 3, -30] });
    });
    return;
  }
  // narrated time, world time and the ambient drift all read T; no audio is ever touched
  ctx.narration.debugTime = t;
  ctx.S.mode = "play";
  ctx.S.t = t;
  ctx.S.wt = t;
  ctx.follow.startFollowing(true); // no intro drift over the lake
  ctx.follow.follow = 1;

  let base: XYZ;
  let view: { eye: XYZ; look: XYZ };
  if (id === "temple-tour") {
    base = TEMPLE_ORIGIN;
    view = { eye: [0, 9, 24], look: [0, 5, -44] };
    ctx.setInside(true); // crossTemple's delays are skipped on purpose
    ctx.tour.beginTour(); // narration.play: muted
  } else if (/^temple-shrine-\d+$/.test(id) && ctx.templeStand) {
    // standing at a shrine's place, as you would walk up to it (best with &live=: the game's own view)
    base = TEMPLE_ORIGIN;
    view = { eye: [0, 3, 0], look: [0, 3, -10] };
    ctx.templeStand(Number(id.slice(14)));
  } else if (id === "temple-sanctuary" || id === "temple-hall" || id === "temple-choice") {
    // the temple empty of the tour: the sanctuary from its gateway, the hall from the door, the Choice's platform
    base = TEMPLE_ORIGIN;
    view = id === "temple-sanctuary" ? { eye: [0, 3.4, -29], look: [0, 2.6, -50] }
      : id === "temple-hall" ? { eye: [0, 3.2, 30], look: [0, 3, 0] }
      : { eye: [16.6, 2.6, -39.5], look: [26.2, 2.4, -39.5] }; // the Choice's room from its door
    ctx.setInside(true);
    ctx.player.pos.set(base[0] + view.eye[0], base[1], base[2] + view.eye[2] - 2);
  } else if (id === "breath" && ctx.breath) {
    // the breathing ring round the wanderer on the shore, from behind it; t is how open (0..1)
    const p = ctx.player.pos;
    base = [p.x, p.y, p.z];
    view = { eye: [2.2, 2.4, 6.4], look: [0, 1.2, -2] };
    ctx.breath(Math.min(1, t));
  } else if (/^peak-\d$/.test(id)) {
    // a massif seen from the land, about 900 m off toward the shore
    const pk = PEAKS[Number(id.slice(5))] ?? PEAKS[0];
    const d = Math.hypot(pk.x, pk.z), ux = -pk.x / d, uz = -pk.z / d;
    const px = pk.x + ux * (pk.r + 700), pz = pk.z + uz * (pk.r + 700);
    base = [px, heightAt(px, pz), pz];
    view = { eye: [0, 25, 0], look: [pk.x - px, pk.h * 0.45, pk.z - pz] };
    ctx.player.pos.set(px, heightAt(px, pz), pz);
  } else if (/^peakc-\d$/.test(id) || /^peaka-\d$/.test(id)) {
    // a massif close by (flying at its shoulder, peakc) or from above (peaka)
    const pk = PEAKS[Number(id.slice(6))] ?? PEAKS[0];
    const d = Math.hypot(pk.x, pk.z), ux = -pk.x / d, uz = -pk.z / d;
    const above = id.startsWith("peaka");
    const off = above ? pk.r * 0.9 : pk.r * 0.75;
    const px = pk.x + ux * off, pz = pk.z + uz * off;
    const gy = heightAt(px, pz);
    const top = heightAt(pk.x, pk.z);
    base = [px, Math.max(gy, 0) + (above ? top - gy + 90 : 40), pz];
    view = above ? { eye: [0, 0, 0], look: [pk.x - px, top - base[1], pk.z - pz] } : { eye: [0, 0, 0], look: [pk.x - px, top * 0.7 - base[1], pk.z - pz] };
    ctx.player.pos.set(base[0], base[1], base[2]);
  } else if ((id === "egypt-gate" || id === "egypt-gate-near") && ctx.gate) {
    // the gateway on the pyramid's plaza, from the plaza (its opening faces ±z)
    const g = ctx.gate;
    base = [g.x, g.y, g.z];
    view = id.endsWith("near") ? { eye: [2.2, 1.7, -6], look: [0, 2.3, 0] } : { eye: [5, 2.8, -12], look: [0, 2.2, 0] };
    ctx.player.pos.set(g.x + 7, heightAt(g.x + 7, g.z - 9), g.z - 9);
  } else if (/^(density|adept|past)-hall(-near)?$/.test(id)) {
    // a monument from the approach, its door toward the shore
    const H = id.startsWith("adept") ? ADEPT_HALL : id.startsWith("past") ? PAST_HALL : DENSITY_HALL;
    const f = H.face, d = id.endsWith("near") ? 38 : 80;
    const px = H.x + Math.sin(f) * d, pz = H.z + Math.cos(f) * d;
    base = [px, heightAt(px, pz), pz];
    view = { eye: [Math.sin(f) * 6 + Math.cos(f) * 5, 2.4, Math.cos(f) * 6 - Math.sin(f) * 5], look: [H.x - px, 12, H.z - pz] };
    ctx.player.pos.set(px, heightAt(px, pz), pz);
  } else if (id === "meadow") {
    // the open land near the start, at eye height, looking inland
    const px = SPAWN.x + 30, pz = SPAWN.z - 30;
    base = [px, heightAt(px, pz), pz];
    view = { eye: [0, 1.7, 0], look: [40, 0.5, -60] };
    ctx.player.pos.set(px, heightAt(px, pz), pz);
  } else if (/^ancient-[a-z]+-[a-z]$/.test(id)) {
    // a drowned city (world/ancient), from one of its views (local frame: +z toward the shore)
    const [, name, k] = id.split("-");
    const r = AREA_SITES[name as AreaId];
    const v = ANCIENT_VIEWS[name]?.[k];
    if (!r || !v) return;
    const f = Math.atan2(SPAWN.x - r.x, SPAWN.z - r.z), cs = Math.cos(f), sn = Math.sin(f);
    const L = (q: XYZ): XYZ => [q[0] * cs + q[2] * sn, q[1], -q[0] * sn + q[2] * cs];
    base = [r.x, r.y, r.z];
    view = { eye: L(v.eye), look: L(v.look) };
    ctx.player.pos.set(r.x + view.eye[0], r.y + v.eye[1] - 1.2, r.z + view.eye[2]);
  } else if (/^ruin-\d$/.test(id)) {
    // under the water, standing on the floor before a ruin
    const r = RUIN_SITES[Number(id.slice(5))] ?? RUIN_SITES[0];
    const px = r.x + 9, pz = r.z + 9;
    base = [px, heightAt(px, pz), pz];
    view = { eye: [4, 2.2, 5], look: [-9, 2.5, -9] };
    ctx.player.pos.set(px, heightAt(px, pz), pz);
  } else if (/^home-\d+$/.test(id)) {
    // an archetype's home in the open world, from a little way off
    const [hx, hz] = LANDMARK_SITES[Number(id.slice(5))] ?? LANDMARK_SITES[0];
    base = [hx, heightAt(hx, hz), hz];
    view = { eye: [7, 3.2, 9], look: [0, 1.2, 0] };
    ctx.player.pos.set(hx + 5, heightAt(hx + 5, hz + 7), hz + 7);
  } else if (id === "genesis") {
    if (!ctx.genesisAt) return;
    base = ctx.genesisAt(t);
    view = VIEWS.genesis;
  } else if (/^duat-\d$/.test(id)) {
    // over the shoulder of the wanderer standing at hour k (main.ts places it), toward the vision
    const p = ctx.player.pos, fx = -Math.sin(ctx.player.heading), fz = -Math.cos(ctx.player.heading);
    base = [p.x, p.y, p.z];
    view = { eye: [-fx * 5, 3, -fz * 5], look: [fx * 6, 2.2, fz * 6] };
  } else if (id === "pyramid" || id === "duat") {
    // camera only: main.ts pre-positions the player before runShot is called
    const o = id === "pyramid" ? PYRAMID : DUAT_ORIGIN;
    base = [o.x, o.y, o.z];
    const v = VIEWS[id];
    if (!v) return;
    view = v;
  } else {
    const site = sites[id];
    const v = VIEWS[id];
    if (!site || !v) return;
    base = [site.x, heightAt(site.x, site.z), site.z]; // real ground, not the guessed site.y
    view = v;
    if (VISION_LESSONS.has(id)) {
      // where the seated one's view comes to rest: behind the seat, toward the stage ahead
      const fx = -Math.sin(site.heading), fz = -Math.cos(site.heading);
      view = { eye: [-fx * 7, 2.8, -fz * 7], look: [fx * 10, 5, fz * 10] };
    }
    if (id === "tree") {
      if (ctx.tour.gotoTree) ctx.tour.gotoTree(); // teleports the player and rests at the tree
      else ctx.tour.tree?.rest?.();
    } else {
      ctx.player.pos.set(site.x, site.y, site.z);
      ctx.player.heading = site.heading;
      ctx.tour.lessons[id]?.onSit(); // narration.play: muted
    }
  }

  // Dev stills render exactly one frame: force-build the full terrain stack at the
  // shot location first. Otherwise far-from-spawn scenes (garden is ~2km out) verify
  // against stale coarse tiles that can deviate ~0.8m above the true ground and bury
  // ground-hugging geometry like the breath ring.
  ctx.terrain.update(base[0], base[2], true);

  // one update with the override in place: beats up to T apply, and uT reads T
  ctx.update(1 / 60);
  ctx.S.t = t;
  ctx.S.wt = t;
  // &live=S: the game's own camera after S seconds of stillness, not a fixed view
  const live = Number(new URLSearchParams(location.search).get("live") ?? NaN);
  const go = (c: ShotCtx) => {
    if (live >= 0) {
      c.idle?.();
      for (let i = 0, n = Math.round(live * 60); i < n; i++) c.update(1 / 60);
      c.narration.debugTime = t;
      return finish(c, id, t, base, null);
    }
    // &warm=S: the world lived for S seconds first, the still's own view kept (figures gather)
    const warm = Number(new URLSearchParams(location.search).get("warm") ?? NaN);
    if (warm > 0) for (let i = 0, n = Math.round(warm * 30); i < n; i++) c.update(1 / 30);
    finish(c, id, t, base, view);
  };
  if (ctx.settle) {
    const { settle, ...rest } = ctx;
    void settle().then(() => go(rest));
    return;
  }
  go(ctx);
}

function finish(ctx: ShotCtx, id: string, t: number, base: XYZ, view: { eye: XYZ; look: XYZ } | null): void {
  ctx.update(1 / 60);
  ctx.S.t = t;
  ctx.S.wt = t;

  if (id === "temple-tour" && view) {
    // over the walking wanderer's shoulder, where the tour has brought it by T
    const p = ctx.player.pos, fx = -Math.sin(ctx.player.heading), fz = -Math.cos(ctx.player.heading);
    base = [p.x, p.y, p.z];
    view = { eye: [-fx * 4.5, 2.6, -fz * 4.5], look: [fx * 5, 1.6, fz * 5] };
  }

  if (view) {
    ctx.camera.position.set(base[0] + view.eye[0], base[1] + view.eye[1], base[2] + view.eye[2]);
    ctx.camera.lookAt(base[0] + view.look[0], base[1] + view.look[1], base[2] + view.look[2]);
  }
  ctx.camera.updateMatrixWorld(true);

  const loading = document.getElementById("loading");
  if (loading) loading.style.display = "none"; // endLoading's prompt must not cover the frame
  const title = document.getElementById("title");
  if (title) title.style.display = "none";
  // a warm-up frame first: a light or material that is new this frame may not be in the shaders
  // until they are rebuilt (seen with a room's own lights); nothing moves between the two draws
  ctx.draw();
  window.setTimeout(() => {
    ctx.draw();
    (window as unknown as { __shotReady?: boolean }).__shotReady = true;
  }, 400);
}
