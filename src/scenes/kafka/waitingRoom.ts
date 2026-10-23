/* K1, the Waiting Room (the owner's build prompt; docs/inland-location-audit-kafka-worlds.md
   §4.1, after the parable of the door). A round room ~14 m across, dark stone (#1c1a2c) laid in
   courses, one unbroken circle of gold (#e9c37d) etched round it at eye height, open to the
   night above (the NIGHT mood, the world's own sky). One door of warm light (0xffe6a0) set into
   the wall. One low seat. One keeper: a seated figure of warm gold light beside the door,
   facing it. Nothing else.

   What happens (implemented exactly as the brief, no more):
   1. You arrive; the keeper looks up, smiles, and one fading word: "wait."
   2. The first time you come to the door, the keeper says "Not yet." once, soft and kind (a voice
      hook, audio/kafka/k1_not_yet.mp3; until it exists the two words fade in as "wait." did).
      The door does not open, and does not resist: it simply stays as it is.
   3. Sit on the low seat: time slows a little, the motes drift brighter, a faint warm tone; the
      keeper now and then glances at the door, fondly. Nothing else happens.
   4. The turn: come to the door again without first going to the keeper (asking), or stand
      after sitting a while and walk to it. It opens as you come: its light parts and spills out
      over the floor; the keeper bows once and smiles. Walk through and the room stays behind you.
   5. Nothing ever says why. On a later visit the keeper waves you through at once.
   No timer, counter, score or fail state; the keeper never grows impatient, the door never slams.

   The narration (audio/kafka/k1_waiting_room.mp3, delivered separately) begins on arrival, fades
   if you leave, and begins again from its start each visit; silent until the file exists. */
import * as THREE from "three/webgpu";
import { T, flow, gpuUniforms, outOfTheWay } from "../../gpu/tsl";
import { ribbonGeometry, ribbonMaterial } from "../../gpu/ribbons";
import { landStone, stoneBlock } from "../../world/stoneworks";
import { moodForce } from "../../world/moods";
import { seatStone } from "../visionLesson";
import { GlassFolk, type Body } from "../glassFolk";
import { keepAlpha, merge, pointCloud, seeded, touch } from "../densities/roomKit";
import { JOURNEY_ORIGIN, type Room, type Solid } from "../journey";
import type { Narration } from "../../core/narration";
import type { AudioEngine } from "../../core/audio";

const { abs, float, length, mix, smoothstep, sin, uniform, uv, vec2, vec3, vec4 } = T;

/** The room's measure (its own frame: the centre of the floor at the origin, the door at −z). */
export const WR = {
  /** inner radius of the wall */
  R: 7,
  /** the wall's thickness and height */
  TH: 0.75,
  H: 6.2,
  /** the floor, above the world's water line (the place apart stands at y 0) */
  FLOOR: 1.5,
  /** the door's opening */
  DW: 1.7,
  DH: 3.3,
  /** the gold circle's height above the floor (eye height) */
  ETCH: 1.6,
};
export const K1_TRACK = "audio/kafka/k1_waiting_room.mp3";
export const K1_NOT_YET = "audio/kafka/k1_not_yet.mp3";
const KEEPER = { x: 2.45, z: -5.45 };
const SEAT = new THREE.Vector3(-2.7, 0, 0.9);
export const WAITING_START = { x: 0, z: 4.6, heading: 0 };
const DOOR_Z = -WR.R;
const KEY = "inward-journey:k1-door";
/** Whether the door has opened for you before (on a later visit the keeper waves you through). */
export const k1Opened = (): boolean => {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
};

/** What main.ts reads while you are in the room: the door open (its crossing goes white, warm
    light), and whether you are walking out through it. */
export const waitingState = { open: false, leaving: false };

export const waitingFloor = (): number => WR.FLOOR;
/** Keep the visitor within the round wall; through the doorway only once the door is open. */
export function waitingConfine(p: { x: number; z: number }): void {
  const inDoor = waitingState.open && Math.abs(p.x) < WR.DW / 2 - 0.3 && p.z < -(WR.R - 1.4);
  if (inDoor) {
    p.z = Math.max(p.z, DOOR_Z - 1.2);
    return;
  }
  const r = WR.R - 0.55, d = Math.hypot(p.x, p.z);
  if (d > r) (p.x *= r / d), (p.z *= r / d);
}

const q = new THREE.Quaternion(), pq = new THREE.Quaternion(), ax = new THREE.Vector3();
/** Turn a bone by `a` about a world axis, on top of what its clip set this frame. */
function turn(b: THREE.Object3D | undefined, axis: THREE.Vector3, a: number): void {
  if (!b || !b.parent || Math.abs(a) < 1e-4) return;
  b.parent.getWorldQuaternion(pq);
  ax.copy(axis).applyQuaternion(pq.invert());
  b.quaternion.premultiply(q.setFromAxisAngle(ax, a));
  b.updateMatrixWorld(true);
}
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const damp = (x: number, to: number, k: number, dt: number) => x + (to - x) * Math.min(1, dt * k);
const ease = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));

export function createWaitingRoom(scene: THREE.Scene, narration: Narration, whisper: (t: string, ms?: number) => void, audio: AudioEngine): Room {
  const g = new THREE.Group();
  g.name = "kafka:waiting-room";
  scene.add(g);
  const ours: { dispose(): void }[] = [];
  const R = seeded(1101);
  const t = gpuUniforms.time;
  const uOpen = uniform(0); // the door parting, 0 → 1
  const uSit = uniform(0); // seated: the motes drift brighter
  const uBreath = uniform(0); // the door's own slow breath (on the room's clock, which slows)
  const { R: RR, TH, H, FLOOR: F, DW, DH, ETCH } = WR;
  const origin = JOURNEY_ORIGIN;

  /* ---- the room: a round wall of dark stone in courses, the doorway cut through it ---- */
  // dark stone (#1c1a2c): the shared masonry, its sandstone grain pulled down to the room's
  // blue-violet dark, laid in its own frame (at 22 km the world position starves its lookups)
  const wallM = landStone("sandstone_cracks", F, 2.4, [0.16, 0.15, 0.27], { course: 0.62, block: 1.15, interior: true, origin, trim: { base: F, top: F + H } });
  const floorM = landStone("red_sandstone_pavement", F, 3.2, [0.3, 0.29, 0.5], { flag: 1.1, interior: true, origin });
  ours.push(wallM, floorM);
  const gap = Math.asin((DW / 2) / RR) * 1.02; // half the doorway's angle
  const ring = (r0: number, r1: number, a0: number, a1: number, depth: number, y0: number) => {
    const s = new THREE.Shape();
    s.absarc(0, 0, r1, a0, a1, false);
    s.absarc(0, 0, r0, a1, a0, true);
    s.closePath();
    const e = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false, curveSegments: 96 });
    e.rotateX(-Math.PI / 2); // the shape's +y becomes −z, its depth becomes height
    e.translate(0, y0, 0);
    return e;
  };
  // the door is at −z, which is the shape's +y (angle π/2)
  const wallGeo = merge([
    ring(RR, RR + TH, Math.PI / 2 + gap, Math.PI / 2 - gap + Math.PI * 2, H, F),
    // over the doorway, the wall closes again above its head
    ring(RR, RR + TH, Math.PI / 2 - gap, Math.PI / 2 + gap, H - DH, F + DH),
  ]);
  const wall = new THREE.Mesh(wallGeo, wallM);
  wall.castShadow = wall.receiveShadow = true;
  g.add(wall);
  // the floor: a round of flagstones, the wall standing on it
  const floorGeo = new THREE.CylinderGeometry(RR + TH, RR + TH, 0.4, 96);
  floorGeo.translate(0, F - 0.2, 0);
  const floor = new THREE.Mesh(floorGeo, floorM);
  floor.receiveShadow = true;
  g.add(floor);
  // the doorway's sill and lintel, a little proud of the wall
  {
    const sill = stoneBlock(DW + 0.5, 0.12, TH + 0.2, 7);
    sill.translate(0, F + 0.04, DOOR_Z - TH / 2);
    const lintel = stoneBlock(DW + 0.9, 0.42, TH + 0.12, 9);
    lintel.translate(0, F + DH + 0.2, DOOR_Z - TH / 2);
    const m = new THREE.Mesh(merge([sill, lintel]), wallM);
    m.castShadow = m.receiveShadow = true;
    g.add(m);
  }

  /* ---- the one circle of gold, etched at eye height, unbroken: it runs on across the door ---- */
  {
    const seg: number[] = [];
    const N = 256, y = F + ETCH, r = RR - 0.012;
    for (let i = 0; i < N; i++) {
      const a0 = (i / N) * Math.PI * 2, a1 = ((i + 1) / N) * Math.PI * 2;
      seg.push(Math.sin(a0) * r, y, Math.cos(a0) * r, Math.sin(a1) * r, y, Math.cos(a1) * r);
    }
    const gm = ribbonGeometry(seg);
    // #e9c37d, a quiet warmth travelling slowly round it
    const p = T.positionGeometry;
    const along = T.atan(p.x, p.z);
    const swell = sin(along.mul(2).sub(t.mul(0.12))).mul(0.12).add(0.88);
    const m = keepAlpha(ribbonMaterial(vec3(0.82, 0.55, 0.21).mul(swell).mul(0.95), 1.1));
    const mesh = new THREE.Mesh(gm, m);
    mesh.frustumCulled = false;
    g.add(mesh);
    ours.push(gm, m);
  }

  /* ---- the door of warm light (0xffe6a0) ---- */
  const LAMP = vec3(1.0, 0.79, 0.36); // 0xffe6a0, linear
  {
    // the light standing in the opening: soft at its edges, a slow breath; parting from the
    // middle as it opens
    const geo = new THREE.PlaneGeometry(DW, DH);
    geo.translate(0, F + DH / 2, DOOR_Z - TH * 0.45);
    const m = keepAlpha(new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide }));
    const u = uv();
    const edge = smoothstep(0, 0.12, u.x).mul(smoothstep(1, 0.88, u.x)).mul(smoothstep(0, 0.05, u.y)).mul(smoothstep(1, 0.92, u.y));
    const core = smoothstep(0.85, 0.0, length(u.sub(vec2(0.5, 0.42)).mul(vec2(1.6, 0.95))));
    const breath = uBreath.mul(0.08).add(0.92);
    // parting: the light thins from the middle outward as it opens, to its edges
    const part = smoothstep(uOpen.mul(0.62).sub(0.05), uOpen.mul(0.62).add(0.05), abs(u.x.sub(0.5)).mul(1.4));
    const k = mix(float(1), part, smoothstep(0.02, 0.2, uOpen));
    // (kept well under white: a door of warm light, not a glare; the post's clarity rings anything
    // that clips with a dark halo). Soft veils of light hang in it, drifting very slowly.
    const veils = sin(u.x.mul(19).add(sin(u.y.mul(3).add(t.mul(0.07))).mul(1.4))).mul(0.5).add(0.5);
    const warmth = mix(vec3(1.0, 0.68, 0.3), LAMP, core);
    m.colorNode = vec4(warmth.mul(edge).mul(core.mul(0.55).add(0.35)).mul(veils.mul(0.18).add(0.82)).mul(breath).mul(k).mul(0.2), 1);
    const door = new THREE.Mesh(geo, m);
    door.name = "k1-door";
    door.renderOrder = 2;
    g.add(door);
    ours.push(geo, m);

    // beyond it, once it parts: a deeper warm light (only seen through the opening)
    // (opaque: through the opening there is nothing but this; shut, it is the night's dark)
    const bg = new THREE.PlaneGeometry(DW + 5, DH + 2.4);
    bg.translate(0, F + DH / 2, DOOR_Z - TH - 0.9);
    const bm = new THREE.MeshBasicNodeMaterial({ fog: false });
    const bu = uv();
    // a passage of light going on and away: a lane of it low along the floor beyond, brightest
    // where it leaves, the air above it dimmer the higher it goes
    const lane = smoothstep(0.36, 0.0, abs(bu.x.sub(0.5))).mul(smoothstep(0.5, 0.05, bu.y));
    const air = smoothstep(1.0, 0.15, bu.y).mul(smoothstep(0.62, 0.1, abs(bu.x.sub(0.5))));
    const core2 = smoothstep(0.42, 0.0, length(bu.sub(vec2(0.5, 0.22)).mul(vec2(1.6, 1.3))));
    const lit = mix(vec3(1.0, 0.66, 0.28), vec3(1, 0.9, 0.72), core2).mul(lane.mul(0.32).add(air.mul(0.16)).add(core2.mul(0.34)).add(0.015));
    bm.colorNode = vec4(mix(vec3(0.006, 0.006, 0.015), lit, smoothstep(0, 1, uOpen)), 1);
    const beyond = new THREE.Mesh(bg, bm);
    beyond.name = "k1-beyond";
    g.add(beyond);
    ours.push(bg, bm);

    // its glow on the wall about it, contained; wider once open
    const hg = new THREE.PlaneGeometry(DW * 3.2, DH * 1.7);
    hg.translate(0, F + DH * 0.55, DOOR_Z + 0.04);
    const hm = keepAlpha(new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, fog: false }));
    const hu = uv().sub(vec2(0.5, 0.4)).mul(vec2(1.0, 1.25));
    const halo = smoothstep(0.55, 0.0, length(hu));
    hm.colorNode = vec4(LAMP.mul(halo.mul(halo)).mul(uOpen.mul(0.1).add(0.05)).mul(breath), 1);
    const hmesh = new THREE.Mesh(hg, hm);
    hmesh.name = "k1-halo";
    hmesh.renderOrder = 1;
    g.add(hmesh);
    ours.push(hg, hm);

    // what it lays on the floor: a faint pool before it, and once open a wedge of light spilling
    // out toward the room's heart
    const sg = new THREE.PlaneGeometry(6.4, 7.5);
    sg.rotateX(-Math.PI / 2);
    sg.translate(0, F + 0.012, DOOR_Z + 3.6);
    const sm = keepAlpha(new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, fog: false }));
    const su = uv(); // x across, y from the room (0) to the door (1)
    const fromDoor = float(1).sub(su.y);
    const halfW = fromDoor.mul(0.34).add(0.12); // the wedge widens as it comes out
    const across = smoothstep(halfW, halfW.mul(0.35), abs(su.x.sub(0.5)));
    const wedge = across.mul(smoothstep(1, 0.05, fromDoor)).mul(smoothstep(0.0, 0.08, su.y));
    const pool = smoothstep(0.42, 0.0, length(vec2(su.x.sub(0.5).mul(1.5), fromDoor.mul(1.3))));
    sm.colorNode = vec4(LAMP.mul(pool.mul(0.08).add(wedge.mul(uOpen).mul(0.22))).mul(breath), 1);
    const spill = new THREE.Mesh(sg, sm);
    spill.name = "k1-spill";
    spill.renderOrder = 1;
    g.add(spill);
    ours.push(sg, sm);
  }

  /* ---- the low seat (the keeper kneels on the floor beside the door) ---- */
  const seat = seatStone(new THREE.Vector3(SEAT.x, F, SEAT.z));
  g.add(seat);
  ours.push(seat.geometry, seat.material as THREE.Material);
  const keeperFace = Math.atan2(0 - KEEPER.x, DOOR_Z + 0.6 - KEEPER.z); // toward the door
  /* ---- the keeper: a seated figure of warm gold light (the game's own figure, glass light) ---- */
  const GOLD = new THREE.Color(1.0, 0.78, 0.48);
  const folk = new GlassFolk([{ x: KEEPER.x, y: F - 0.42, z: KEEPER.z, face: keeperFace, act: "sit", tint: GOLD.clone(), glow: { inner: 0.12, edge: 0.42, body: 0.3 } }], 31);
  g.add(folk.group);
  let keeper: Body | null = null;
  const bones: Record<string, THREE.Object3D | undefined> = {};
  // each bone as the clip leaves it (a bone the sitting clip doesn't move would otherwise keep
  // every frame's turn, and fold over)
  const rest: [THREE.Object3D, THREE.Quaternion][] = [];
  const loaded = folk.loaded.then(() => {
    keeper = folk.bodies[0] ?? null;
    if (!keeper) return;
    for (const n of ["DEF-spine001", "DEF-spine002", "DEF-spine003", "DEF-neck", "DEF-head", "DEF-upper_armR", "DEF-forearmR"]) {
      const b = (bones[n] = keeper.root.getObjectByName(n));
      if (b) rest.push([b, b.quaternion.clone()]);
    }
  });
  // a small warmth at its heart, which swells when it smiles (contained, under bloom)
  const heart = (() => {
    const c = pointCloud(1, 0.42);
    c.pos.set([0, 0, 0], 0);
    touch(c.cloud);
    const uSmile = uniform(0);
    c.material.colorNode = vec4(vec3(1, 0.8, 0.5).mul(c.round).mul(uSmile.mul(0.3).add(0.08)), 1);
    c.cloud.sprite.renderOrder = 3;
    g.add(c.cloud.sprite);
    ours.push(c.material);
    return { sprite: c.cloud.sprite, uSmile };
  })();

  /* ---- motes, drifting slowly in the still air; brighter while you sit ---- */
  {
    const n = 150;
    const c = pointCloud(n, 0.05);
    for (let i = 0; i < n; i++) {
      const a = R() * Math.PI * 2, r = Math.sqrt(R()) * (RR - 0.8);
      c.pos.set([Math.sin(a) * r, F + 0.4 + R() * 4.2, Math.cos(a) * r], i * 3);
      c.k.set([R(), R(), R(), R()], i * 4);
    }
    touch(c.cloud);
    const K = c.cloud.nodes.aK;
    const p0 = c.cloud.nodes.position;
    c.material.positionNode = p0.add(flow(p0.div(3), t.mul(0.05)).mul(0.5));
    const tw = sin(t.mul(float(0.25).add(K.w.mul(0.3))).add(K.x.mul(40))).mul(0.35).add(0.65);
    const near = smoothstep(1.2, 3.5, length(T.cameraPosition.sub(T.positionWorld)));
    c.material.colorNode = vec4(vec3(1, 0.84, 0.56).mul(c.round).mul(tw).mul(uSit.mul(0.35).add(0.22)).mul(near).mul(outOfTheWay(T.positionWorld)), 1);
    g.add(c.cloud.sprite);
    ours.push(c.material);
  }

  /* ---- what happens ---- */
  const opened = k1Opened();
  waitingState.open = false;
  waitingState.leaving = false;
  const S = {
    t: 0, // the room's own clock (it slows while you sit)
    slow: 1,
    greeted: false,
    toldNotYet: false,
    atDoor: false,
    asked: false, // went to the keeper since last at the door
    sitting: false,
    sat: 0, // seconds sat this time
    satLong: false,
    open: 0, // the door's opening, 0 → 1 (eased)
    opening: false,
    bowAt: -1, // when the keeper bowed (room clock)
    waveAt: -1,
    smile: 0,
    look: 0, // the keeper's gaze on you
    lift: 0, // the keeper's head up from its rest
    glanceAt: 6, // the next fond glance at the door
    glance: 0,
    voice: false,
    /** still frames: the door held open, the keeper held mid-bow */
    hold: false,
    holdA: false,
  };
  let notYetBuf: AudioBuffer | null | undefined;
  void audio.clip(K1_NOT_YET).then((b) => (notYetBuf = b));
  // the narration: from its start, on arrival (silent until the recording is delivered)
  void narration.available(K1_TRACK).then((ok) => ok && !S.voice && ((S.voice = true), void narration.play(K1_TRACK)));

  const local = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0), side = new THREE.Vector3(), fwd = new THREE.Vector3();
  const kHead = new THREE.Vector3(KEEPER.x, F + 1.25, KEEPER.z);

  const open = () => {
    if (S.opening) return;
    S.opening = true;
    S.bowAt = S.t + 0.9;
    try {
      localStorage.setItem(KEY, "1");
    } catch {
      /* private mode: the door simply opens again next time */
    }
  };

  const room: Room = {
    id: "waiting-room",
    active: true,
    loaded,
    seatPos: SEAT,
    seatHeading: Math.atan2(-(0 - SEAT.x), -(DOOR_Z + 1 - SEAT.z)),
    nearSeat: (p) => Math.hypot(p.x - SEAT.x, p.z - SEAT.z) < 0.85,
    onSit: () => {
      S.sitting = true;
      S.sat = 0;
      audio.waitTone(true);
    },
    onStand: () => {
      if (S.sitting && S.sat > 20) (S.satLong = true), (S.asked = false);
      S.sitting = false;
      audio.waitTone(false);
    },
    holdsMovement: () => false,
    solids: (): Solid[] => [
      { x: KEEPER.x - Math.sin(keeperFace) * 0.1, z: KEEPER.z - Math.cos(keeperFace) * 0.1, r: 0.55, h: 1.4 },
    ],
    centre: () => new THREE.Vector3(1.1, F + 1.5, DOOR_Z + 1.6),
    leaving: () => waitingState.leaving,
    update(dt: number) {
      S.slow = damp(S.slow, S.sitting ? 0.6 : 1, 0.8, dt);
      const d = dt * S.slow;
      S.t += d;
      uBreath.value = Math.sin(S.t * 0.7);
      uSit.value = damp(uSit.value, S.sitting ? 1 : 0, 0.6, dt);
      if (S.sitting) S.sat += dt;
      moodForce.w = [1, 0, 0, 0, 0, 0, 0, 0, 0]; // the night, whatever lies outside
      local.copy(gpuUniforms.player.value as THREE.Vector3).sub(g.position);

      // 1. arriving: the keeper looks up and smiles; one word
      if (!S.greeted && S.t > 1.0) {
        S.greeted = true;
        S.smile = 1;
        if (opened) S.waveAt = S.t + 1.2; // a later visit: waved through at once
        else window.setTimeout(() => whisper("wait.", 3400), 600);
      }
      if (S.waveAt >= 0 && S.t > S.waveAt + 1.4) open();

      // going to the keeper is asking
      const toKeeper = Math.hypot(local.x - KEEPER.x, local.z - KEEPER.z);
      if (toKeeper < 2.3) S.asked = true;
      // 2 and 4: coming to the door
      const toDoor = Math.hypot(local.x, local.z - DOOR_Z);
      const atDoor = toDoor < 2.4 && !S.sitting;
      if (atDoor && !S.atDoor && !S.opening) {
        if (opened) open();
        else if (!S.toldNotYet) {
          S.toldNotYet = true;
          S.smile = 1;
          S.look = 1;
          // soft and kind, once: the keeper's own voice when it is delivered
          window.setTimeout(() => {
            if (notYetBuf) audio.playClip(notYetBuf, 0.9);
            else whisper("Not yet.", 3000);
          }, 500);
        } else if (!S.asked || S.satLong) open();
      }
      if (!atDoor && S.atDoor && toDoor > 3.6) S.asked = false;
      if (toDoor > 3.6 || atDoor) S.atDoor = atDoor;

      // the door parting, slowly (no fanfare)
      if (S.opening) S.open = Math.min(1, S.open + d / 4.5);
      uOpen.value = ease(S.open);
      waitingState.open = S.open > 0.35;
      waitingState.leaving = waitingState.open && local.z < DOOR_Z - 0.5 && Math.abs(local.x) < DW / 2;

      // the keeper's attention: on you when you come near, arrive or are spoken to; between, it
      // rests, head a little low toward the door, and now and then glances up at it, fondly
      const wantLook = S.holdA || (S.t < 6 && S.greeted) || toKeeper < 3.2 || (S.toldNotYet && S.atDoor && !S.opening) || (S.waveAt >= 0 && S.t < S.waveAt + 3);
      S.look = damp(S.look, wantLook ? 1 : 0, 1.6, d);
      if (S.t > S.glanceAt) {
        S.glanceAt = S.t + 9 + Math.random() * 8;
        if (!wantLook) S.glance = 1;
      }
      S.glance = Math.max(0, S.glance - d / 3.2);
      S.lift = damp(S.lift, S.greeted ? Math.max(S.look, Math.sin(Math.PI * S.glance)) : 0, 1.4, d);
      S.smile = S.hold || S.holdA ? 1 : Math.max(S.opening ? 0.8 : wantLook ? 0.45 : 0.15, S.smile - d * 0.25);

      for (const [b, q0] of rest) b.quaternion.copy(q0);
      folk.update(d);
      const k = keeper;
      if (k) {
        k.root.updateMatrixWorld(true);
        const f = keeperFace;
        fwd.set(Math.sin(f), 0, Math.cos(f));
        side.set(Math.cos(f), 0, -Math.sin(f)); // a positive turn about it nods forward
        // rest: the head a little low; lifted as it looks or glances
        const rest = 0.3 * (1 - S.lift);
        // the bow, once, as the door opens: from the waist, slow, and back
        const bowT = S.hold ? 0.5 : S.bowAt >= 0 ? (S.t - S.bowAt) / 3.6 : -1;
        const bow = bowT > 0 && bowT < 1 ? Math.sin(Math.PI * ease(bowT)) : 0;
        turn(bones["DEF-spine001"], side, 0.1 * bow);
        turn(bones["DEF-spine002"], side, 0.1 * bow);
        turn(bones["DEF-spine003"], side, 0.07 * bow);
        // the gaze: toward you, or the door
        const want = S.look > 0.05 ? Math.atan2(local.x - KEEPER.x, local.z - KEEPER.z) : f;
        const yaw = Math.max(-1.45, Math.min(1.45, wrap(want - f))) * S.look;
        turn(bones["DEF-spine003"], up, yaw * 0.25);
        turn(bones["DEF-neck"], up, yaw * 0.35);
        turn(bones["DEF-head"], up, yaw * 0.4);
        turn(bones["DEF-neck"], side, rest * 0.5 + 0.12 * bow);
        turn(bones["DEF-head"], side, rest * 0.5 + 0.08 * bow);
        // waving you through (a later visit): the near hand opens toward the door, and lowers
        const wT = S.waveAt >= 0 ? (S.t - S.waveAt) / 3.2 : -1;
        const wave = wT > 0 && wT < 1 ? Math.sin(Math.PI * ease(wT)) : 0;
        turn(bones["DEF-upper_armR"], side, -0.85 * wave);
        turn(bones["DEF-upper_armR"], up, 0.6 * wave);
        // its light warms as it smiles
        k.mat.emissive.copy(GOLD).multiplyScalar(0.8 + 0.35 * S.smile);
      }
      heart.uSmile.value = S.smile;
      const chest = bones["DEF-spine003"];
      if (chest) {
        chest.getWorldPosition(heart.sprite.position).sub(g.position);
        heart.sprite.position.x += Math.sin(keeperFace) * 0.1;
        heart.sprite.position.z += Math.cos(keeperFace) * 0.1;
      } else heart.sprite.position.set(kHead.x, F + 0.98, kHead.z);
    },
    dispose() {
      moodForce.w = null;
      waitingState.open = false;
      waitingState.leaving = false;
      audio.waitTone(false);
      folk.dispose();
      for (const o of ours) o.dispose();
      g.parent?.remove(g);
    },
  };
  return Object.assign(room, {
    /** Still frames: the door open and the keeper mid-bow (`b`), or as you arrive (`a`). */
    debugHold(which: "a" | "b") {
      if (which === "a") S.holdA = true;
      if (which === "b") {
        S.greeted = true;
        S.opening = true;
        S.open = 1;
        S.hold = true;
        S.smile = 1;
      }
    },
  });
}
