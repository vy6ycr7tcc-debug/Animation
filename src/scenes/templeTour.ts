import * as THREE from "three/webgpu";
import type { SceneModule } from "./lessonKit";
import { CreationKit } from "./creationKit";
import { cardMesh, ignite, updateCards } from "./tarotTex";
import type { Narration } from "../core/narration";
import { gpuUniforms } from "../gpu/tsl";

export const TEMPLE_ORIGIN = new THREE.Vector3(30000, 1, 0);
export const TRACK_ID = "TEMPLE";
export const FINALE_T = 636.08;
export const DAIS_LOCAL = new THREE.Vector3(0, 0, -44);
export const LANDING_LOCAL = new THREE.Vector3(0, -38);

export interface TourHooks { whisper: (text: string, ms?: number) => void; }
export interface PlayerLike { pos: THREE.Vector3; heading: number; }
export interface FollowLike { yaw: number; pitch: number; snapTo(p: THREE.Vector3): void; }
export interface CueDef { t: number; label: string; }

export const CUES: CueDef[] = [
  { t: 0.0, label: "opening" },
  { t: 41.84, label: "I — The Magician" },
  { t: 74.41, label: "II — The High Priestess" },
  { t: 104.45, label: "III — The Empress" },
  { t: 129.0, label: "IV — The Emperor" },
  { t: 151.74, label: "V — The Hierophant" },
  { t: 175.93, label: "VI — The Lovers" },
  { t: 205.81, label: "VII — The Chariot" },
  { t: 232.16, label: "transition: mind → body" },
  { t: 239.85, label: "VIII — Strength" },
  { t: 262.93, label: "IX — The Hermit" },
  { t: 287.05, label: "X — The Wheel of Fortune" },
  { t: 313.3, label: "XI — Justice" },
  { t: 337.3, label: "XII — The Hanged Man" },
  { t: 361.92, label: "XIII — Death" },
  { t: 385.29, label: "XIV — Temperance" },
  { t: 411.83, label: "transition: body → spirit" },
  { t: 418.82, label: "XV — The Devil" },
  { t: 444.95, label: "XVI — The Tower" },
  { t: 466.62, label: "XVII — The Star" },
  { t: 489.2, label: "XVIII — The Moon" },
  { t: 511.42, label: "XIX — The Sun" },
  { t: 531.38, label: "XX — Judgement" },
  { t: 551.68, label: "XXI — The World" },
  { t: 579.54, label: "XXII — The Fool (The Choice)" },
  { t: 612.14, label: "landing" },
];

export interface StationDef { cue: number; x: number; z: number; face: number; }
export const STATION_DEFS: StationDef[] = [
  { cue: 0, x: 10.2, z: 26, face: -Math.PI / 2 },
  { cue: 1, x: -10.2, z: 26, face: Math.PI / 2 },
  { cue: 2, x: 10.2, z: 17.33, face: -Math.PI / 2 },
  { cue: 3, x: -10.2, z: 17.33, face: Math.PI / 2 },
  { cue: 4, x: 10.2, z: 8.67, face: -Math.PI / 2 },
  { cue: 5, x: -10.2, z: 8.67, face: Math.PI / 2 },
  { cue: 6, x: 10.2, z: -2, face: -Math.PI / 2 },
  { cue: 7, x: -10.2, z: -2, face: Math.PI / 2 },
  { cue: 8, x: 2.6, z: -30, face: 0 },
  { cue: 9, x: 14.3, z: -32, face: -Math.PI / 2 },
  { cue: 10, x: -14.3, z: -32, face: Math.PI / 2 },
  { cue: 11, x: 14.3, z: -37, face: -Math.PI / 2 },
  { cue: 12, x: -14.3, z: -37, face: Math.PI / 2 },
  { cue: 13, x: 14.3, z: -52, face: -Math.PI / 2 },
  { cue: 14, x: -14.3, z: -52, face: Math.PI / 2 },
  { cue: 15, x: 0, z: -57.5, face: 0 },
  { cue: 16, x: -2.6, z: -30, face: Math.PI },
  { cue: 17, x: 10.2, z: 24, face: -Math.PI / 2 },
  { cue: 18, x: -10.2, z: 24, face: Math.PI / 2 },
  { cue: 19, x: 10.2, z: 8, face: -Math.PI / 2 },
  { cue: 20, x: -10.2, z: 8, face: Math.PI / 2 },
  { cue: 21, x: 10.2, z: -8, face: -Math.PI / 2 },
  { cue: 22, x: -10.2, z: -8, face: Math.PI / 2 },
  { cue: 23, x: 10.2, z: -24, face: -Math.PI / 2 },
  { cue: 24, x: -10.2, z: -24, face: Math.PI / 2 },
];

export interface OrbWp { t: number; x: number; z: number; }
export const ORB_WPS: OrbWp[] = [
  { t: 0.0, x: 0, z: 26 },
  { t: 41.84, x: 0.3, z: 25.7 },
  { t: 74.41, x: -0.3, z: 17.6 },
  { t: 104.45, x: 0.3, z: 17.1 },
  { t: 129.0, x: -0.3, z: 8.9 },
  { t: 151.74, x: 0.3, z: 8.4 },
  { t: 175.93, x: -0.3, z: -1.7 },
  { t: 205.81, x: 0.3, z: -2.3 },
  { t: 232.16, x: 0, z: -30 },
  { t: 239.85, x: 0.5, z: -32.2 },
  { t: 262.93, x: -0.5, z: -32.6 },
  { t: 287.05, x: 0.5, z: -36.8 },
  { t: 313.3, x: -0.5, z: -37.2 },
  { t: 319.3, x: 4.8, z: -40.5 },
  { t: 325.3, x: 5.6, z: -44 },
  { t: 331.3, x: 4.8, z: -47.5 },
  { t: 337.3, x: 0.3, z: -51.8 },
  { t: 361.92, x: -0.3, z: -52.2 },
  { t: 385.29, x: 0, z: -55 },
  { t: 411.83, x: 0, z: -30 },
  { t: 418.82, x: 0.3, z: 23.7 },
  { t: 444.95, x: -0.3, z: 23.3 },
  { t: 466.62, x: 0.3, z: 8.3 },
  { t: 489.2, x: -0.3, z: 7.7 },
  { t: 511.42, x: 0.3, z: -7.7 },
  { t: 531.38, x: -0.3, z: -8.3 },
  { t: 551.68, x: 0.3, z: -23.7 },
  { t: 579.54, x: -0.3, z: -24.3 },
  { t: 612.14, x: 0, z: -38 },
];

function buildOrbPath(): {
  curve: THREE.CatmullRomCurve3;
  posAt(uT: number, out: THREE.Vector3): void;
  tangentAt(uT: number, out: THREE.Vector3): void;
} {
  const points = ORB_WPS.map((wp) => new THREE.Vector3(wp.x, 1.7, wp.z));
  const curve = new THREE.CatmullRomCurve3(points, false, "centripetal");

  const N = ORB_WPS.length;
  const times = ORB_WPS.map((wp) => wp.t);
  const firstT = times[0];
  const lastT = times[N - 1];

  function mapT(uT: number): number {
    if (uT <= firstT) return 0;
    if (uT >= lastT) return 1;
    for (let i = 0; i < N - 1; i++) {
      const t0 = times[i];
      const t1 = times[i + 1];
      if (uT >= t0 && uT <= t1) {
        const dt = t1 - t0;
        if (dt <= 0) return (i + 1) / (N - 1);
        const local = (uT - t0) / dt;
        return (i + local) / (N - 1);
      }
    }
    return 1;
  }

  function posAt(uT: number, out: THREE.Vector3): void {
    const s = mapT(uT);
    curve.getPoint(s, out);
  }

  function tangentAt(uT: number, out: THREE.Vector3): void {
    const s = mapT(uT);
    curve.getTangent(s, out);
  }

  return { curve, posAt, tangentAt };
}

function buildOrbMesh(): {
  group: THREE.Group;
  core: THREE.Mesh;
  setDimmed(d: boolean): void;
} {
  const group = new THREE.Group();

  const coreMat = new THREE.MeshBasicNodeMaterial();
  coreMat.color = new THREE.Color(0xffc266);
  coreMat.transparent = true;
  coreMat.opacity = 1.0;

  const core = new THREE.Mesh(new THREE.SphereGeometry(0.22, 32, 16), coreMat);
  group.add(core);

  const haloMat = new THREE.MeshBasicNodeMaterial();
  haloMat.color = new THREE.Color(0xffd894);
  haloMat.transparent = true;
  haloMat.opacity = 0.55;
  haloMat.depthWrite = false;
  haloMat.blending = THREE.AdditiveBlending;
  haloMat.fog = false;

  const halo = new THREE.Mesh(new THREE.SphereGeometry(0.55, 32, 16), haloMat);
  group.add(halo);

  group.userData.tick = () => {
    const t = gpuUniforms.time.value;
    const s = 1 + 0.08 * Math.sin(t * 1.5);
    halo.scale.setScalar(s);
  };

  function setDimmed(d: boolean): void {
    if (d) {
      haloMat.opacity = 0.15;
      coreMat.opacity = 0.35;
    } else {
      haloMat.opacity = 0.55;
      coreMat.opacity = 1.0;
    }
  }

  return { group, core, setDimmed };
}

function buildStations(): {
  group: THREE.Group;
  update(uT: number): void;
  reset(): void;
} {
  const group = new THREE.Group();

  type Station = {
    card: ReturnType<typeof cardMesh>;
    marker: THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicNodeMaterial>;
    ignited: boolean;
  };

  const stations: Station[] = [];

  for (const sd of STATION_DEFS) {
    const stationGroup = new THREE.Group();

    const card = cardMesh(sd.cue);
    card.position.set(sd.x, 1.7, sd.z);
    card.rotation.y = sd.face;
    card.visible = false;

    const markerGeom = new THREE.CircleGeometry(0.9, 32);
    const markerMat = new THREE.MeshBasicNodeMaterial({
      color: 0xffd27a,
      transparent: true,
      opacity: 0.18,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false,
    });
    const marker = new THREE.Mesh(markerGeom, markerMat);
    marker.rotation.x = -Math.PI / 2;
    marker.position.set(sd.x, 0.05, sd.z);

    stationGroup.add(card);
    stationGroup.add(marker);
    group.add(stationGroup);

    stations.push({ card, marker, ignited: false });
  }

  let lastUT: number | null = null;

  function reset(): void {
    for (const station of stations) {
      station.ignited = false;
      station.card.visible = false;
      station.marker.material.opacity = 0.18;
    }
  }

  function update(uT: number): void {
    if (lastUT !== null && uT < lastUT - 1) {
      reset();
    }

    for (let i = 0; i < stations.length; i++) {
      const station = stations[i]!;
      const sd = STATION_DEFS[i]!;
      if (!station.ignited && uT >= CUES[sd.cue]!.t) {
        station.card.visible = true;
        ignite(station.card, uT);
        station.ignited = true;
        station.marker.material.opacity = 0.85;
      }
    }

    updateCards(group, uT);
    lastUT = uT;
  }

  return { group, update, reset };
}

function createChoiceOverlay(onChoose: (key: "love" | "rest" | "undecided") => void): {
  show(): void; hide(): void; dispose(): void;
} {
  const root = document.createElement("div");
  root.id = "tour-choice";
  root.style.position = "fixed";
  root.style.top = "0";
  root.style.left = "0";
  root.style.width = "100%";
  root.style.height = "100%";
  root.style.display = "none";
  root.style.flexDirection = "column";
  root.style.alignItems = "center";
  root.style.justifyContent = "center";
  root.style.zIndex = "9999";
  root.style.background = "rgba(0, 0, 0, 0.72)";
  root.style.color = "#e8c874";

  const prompt = document.createElement("div");
  prompt.textContent = "The road is walked. What is not yet waits on your choosing.";
  prompt.style.fontFamily = "Georgia, 'Times New Roman', serif";
  prompt.style.fontSize = "24px";
  prompt.style.textAlign = "center";
  prompt.style.marginBottom = "24px";
  prompt.style.color = "#e8c874";
  root.appendChild(prompt);

  const keys: Array<"love" | "rest" | "undecided"> = ["love", "rest", "undecided"];
  for (const key of keys) {
    const btn = document.createElement("button");
    btn.textContent = key;
    btn.style.display = "block";
    btn.style.margin = "6px";
    btn.style.padding = "10px 28px";
    btn.style.fontSize = "18px";
    btn.style.fontFamily = "Georgia, 'Times New Roman', serif";
    btn.style.color = "#e8c874";
    btn.style.background = "rgba(20, 16, 8, 0.85)";
    btn.style.border = "1px solid #e8c874";
    btn.style.cursor = "pointer";
    btn.addEventListener("click", () => onChoose(key));
    root.appendChild(btn);
  }

  document.body.appendChild(root);

  return {
    show(): void {
      root.style.display = "flex";
    },
    hide(): void {
      root.style.display = "none";
    },
    dispose(): void {
      if (root.parentNode) {
        root.parentNode.removeChild(root);
      }
    },
  };
}

class FinaleFX {
  private readonly kit: CreationKit;
  private readonly center: THREE.Vector3;
  private firedBirds = false;
  private firedHorses = false;
  private firedCrystals = false;
  private firedRings = false;
  private firedBeams = false;

  constructor(kit: CreationKit, center: THREE.Vector3) {
    this.kit = kit;
    this.center = center;
  }

  update(ft: number): void {
    if (!this.firedBirds && ft >= 0) {
      this.firedBirds = true;
      this.kit.birds(60, this.center, 6, 3);
    }
    if (!this.firedHorses && ft >= 4) {
      this.firedHorses = true;
      this.kit.horses(this.center, 4);
    }
    if (!this.firedCrystals && ft >= 8) {
      this.firedCrystals = true;
      this.kit.crystals(120, this.center, 5);
    }
    if (!this.firedRings && ft >= 12) {
      this.firedRings = true;
      this.kit.rings(this.center, 9, 6);
    }
    if (!this.firedBeams && ft >= 16) {
      this.firedBeams = true;
      const positions: THREE.Vector3[] = [];
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        positions.push(
          new THREE.Vector3(
            this.center.x + Math.cos(a) * 2.2,
            this.center.y,
            this.center.z + Math.sin(a) * 2.2,
          ),
        );
      }
      this.kit.beams(positions, 10, 0.5);
    }
  }
}

export class TempleTour implements SceneModule {
  readonly id = "tour";
  active = false;
  onTapOrb: (() => void) | null = null;   // coordinator assigns: exit() + crossTemple(false)
  onRest: (() => void) | null = null;     // coordinator assigns: route to the Tree scene

  /** Coordinator may assign its render camera so the internal tap listener can raycast. */
  camera: THREE.Camera | null = null;
  /** Last path parameter used; exposed for debugging/coordinator reads. */
  lastUT = 0;

  private scene: THREE.Scene;
  private narration: Narration;
  private player: PlayerLike;
  private follow: FollowLike;
  private hooks: TourHooks;

  private root: THREE.Group | null = null;
  private path: ReturnType<typeof buildOrbPath> | null = null;
  private orb: ReturnType<typeof buildOrbMesh> | null = null;
  private stations: ReturnType<typeof buildStations> | null = null;
  private kit: CreationKit | null = null;

  private released = false;
  private choiceDone = false;
  private choiceAt = 0;
  private finaleFx: FinaleFX | null = null;
  private overlay: ReturnType<typeof createChoiceOverlay> | null = null;

  private raycaster = new THREE.Raycaster();
  private ndc = new THREE.Vector2();
  private tmpV = new THREE.Vector3();
  private tmpT = new THREE.Vector3();

  // Bound once; only removed in dispose(). Uses this.camera if the coordinator set it.
  private onPointerDown = (ev: PointerEvent): void => {
    if (!this.active || this.choiceDone) return;
    const cam = this.camera;
    if (!cam) return;
    const el = ev.target as HTMLElement | null;
    const rect = el && typeof el.getBoundingClientRect === "function" ? el.getBoundingClientRect() : null;
    if (!rect || rect.width === 0 || rect.height === 0) return;
    const x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
    const y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
    this.tapCheck(x, y, cam);
  };

  constructor(
    scene: THREE.Scene,
    narration: Narration,
    player: PlayerLike,
    follow: FollowLike,
    hooks: TourHooks,
  ) {
    this.scene = scene;
    this.narration = narration;
    this.player = player;
    this.follow = follow;
    this.hooks = hooks;
    window.addEventListener("pointerdown", this.onPointerDown);
  }

  enter(): void {
    if (this.active) return;
    this.active = true;

    this.root = new THREE.Group();
    this.root.position.copy(TEMPLE_ORIGIN);
    this.scene.add(this.root);

    this.stations = buildStations();
    this.root.add(this.stations.group);

    this.path = buildOrbPath();

    this.orb = buildOrbMesh();
    this.root.add(this.orb.group);

    this.kit = new CreationKit();
    this.root.add(this.kit.group);

    void this.narration.play(TRACK_ID);
    this.follow.snapTo(this.player.pos);
  }

  exit(): void {
    if (!this.active) return;
    this.active = false;
    this.released = false;
    this.choiceDone = false;

    this.narration.stop(1.5);
    this.overlay?.hide();

    if (this.root) {
      this.scene.remove(this.root);
      this.root.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.geometry) m.geometry.dispose();
        const mat = m.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
        else if (mat) mat.dispose();
      });
    }

    this.root = null;
    this.path = null;
    this.orb = null;
    this.stations = null;
    this.kit = null;
    this.finaleFx = null;
  }

  update(dt: number): void {
    if (!this.active) return;

    const uT = this.narration.current === TRACK_ID ? this.narration.time() : 0;

    this.stations?.update(uT);

    const orb = this.orb;
    const path = this.path;
    if (orb && path) {
      path.posAt(uT, this.tmpV);
      orb.group.position.copy(this.tmpV);
      orb.group.userData.tick?.();

      if (!this.released) {
        this.player.pos.set(
          TEMPLE_ORIGIN.x + this.tmpV.x,
          TEMPLE_ORIGIN.y + (this.tmpV.z < -30 ? 0.3 : 0),
          TEMPLE_ORIGIN.z + this.tmpV.z,
        );
        path.tangentAt(uT, this.tmpT);
        const target = Math.atan2(this.tmpT.x, this.tmpT.z);
        let d = target - this.follow.yaw;
        d = Math.atan2(Math.sin(d), Math.cos(d)); // shortest angle
        this.follow.yaw += d * Math.min(1, 2.5 * dt);
      }
    }

    this.kit?.update(dt, uT);

    if (!this.choiceDone && uT >= FINALE_T) this.startChoice();

    if (this.choiceDone && this.finaleFx) {
      const ft = (performance.now() - this.choiceAt) / 1000;
      this.finaleFx.update(ft);
      this.kit?.update(dt, ft);
    }

    this.lastUT = uT;
  }

  startChoice(): void {
    if (this.choiceDone) return;
    this.choiceDone = true;
    this.overlay = createChoiceOverlay((k) => this.choose(k));
    this.overlay.show();
  }

  choose(key: "love" | "rest" | "undecided"): void {
    this.overlay?.hide();

    const line =
      key === "love"
        ? "And so it is — the light you carry is the light you are."
        : key === "rest"
          ? "Then rest. The tree is waiting."
          : "Not choosing is also a choice. The road waits.";
    this.hooks.whisper(line, 9000);

    this.choiceAt = performance.now();
    if (this.kit) this.finaleFx = new FinaleFX(this.kit, new THREE.Vector3(0, 2, -38));

    if (key === "rest") {
      this.onRest?.();
    } else {
      this.released = true;
      this.orb?.setDimmed(true);
    }
  }

  /**
   * Public tap entry point: the coordinator may call this from its own pointer
   * handler with NDC coords + its camera. The internal pointerdown listener
   * calls it too, using `this.camera` (assign it from the coordinator).
   */
  tapCheck(ndcX: number, ndcY: number, camera: THREE.Camera): void {
    if (!this.active || this.choiceDone) return;
    const core = this.orb?.core;
    if (!core) return;
    this.raycaster.setFromCamera(this.ndc.set(ndcX, ndcY), camera);
    const hits = this.raycaster.intersectObject(core, false);
    if (hits.length > 0) this.onTapOrb?.();
  }

  holdsMovement(): boolean {
    return this.active && !this.released;
  }

  nearSeat(_p: THREE.Vector3): boolean {
    return false;
  }

  onSit(): void {
    /* no-op */
  }

  onStand(): void {
    /* no-op */
  }

  dispose(): void {
    this.exit();
    this.overlay?.dispose();
    this.overlay = null;
    window.removeEventListener("pointerdown", this.onPointerDown);
  }
}
