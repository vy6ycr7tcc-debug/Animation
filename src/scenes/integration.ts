/*
 * integration.ts — the docent who binds every exhibit into one hallway.
 *
 * One registry keeps the temple tour, the tree of life, and the five lesson
 * sites on the same floor plan; one frame() walks their edges: a step into the
 * temple opens the tour, a step out closes it, a body lowered onto a seat wakes
 * the lesson beneath it. Gate, seat, and root all answer to the same whisper,
 * and the gold thread between them is this file.
 */

import * as THREE from "three/webgpu";

import type { Narration } from "../core/narration";
import type { Gesture } from "../player/wanderer";
import type { Place } from "../ui/map";
import type { SceneModule } from "./lessonKit";
import { SceneRegistry } from "./registry";
import { TempleTour } from "./templeTour";
import { TreeOfLifeScene } from "./tree";
import { SITES } from "./sites";
import { createShoreScene } from "./shore";
import { createIglooScene } from "./igloo";
import { createGardenScene } from "./garden";
import { createGalaxiesScene } from "./galaxies";
import { createDesert } from "./desert";
import { createTreeStationScene } from "./treeStation"; // TEMP-VERIFY
import { createAtomsScene } from "./atomsLight";
import { createOtherWorldsScene } from "./otherWorlds";
import { createGreetingsScene } from "./greetings";

/* ---------- contract ---------- */

export interface TourHooks2 {
  scene: THREE.Scene;
  narration: Narration;
  player: { pos: THREE.Vector3; heading: number; target: THREE.Vector2 | null };
  follow: { yaw: number; pitch: number; snapTo(p: THREE.Vector3): void };
  wanderer: { setGesture(g: Gesture): void };
  camera: THREE.Camera;
  whisper: (text: string, ms?: number) => void;
  temple: {
    inside: boolean;
    gateAt: THREE.Vector3;
    gateHeading: number;
    outside(): { x: number; z: number };
    standFor(i: number): { x: number; z: number; heading: number };
    setRite(i: number, on: boolean): void;
    entry(): { x: number; z: number; heading: number };
    floorAt(x: number, z: number): number;
  };
  /** Through the temple's door; `then` runs once the crossing is done (in the dark, before it lifts). */
  crossTemple: (inside: boolean, then?: () => void) => void;
  heightAt: (x: number, z: number) => number;
  sitting: { phase: "none" | "walking" | "seated" };
  onTourStateChange?: (active: boolean) => void;
}

export interface TourScenes {
  registry: SceneRegistry;
  tour: TempleTour;
  tree: TreeOfLifeScene;
  lessons: Record<string, SceneModule>;
  frame(dt: number): void;
  beginTour(): void;
  gotoTree(): void;
  readonly movementHeld: boolean;
  readonly seatedId: string | null;
}

/* ---------- constants ---------- */

const GREET_REACH = 25;
const LESSON_BACK = 7;
const TREE_BACK = 8;

/* ---------- wiring ---------- */

/** Build the whole museum floor: registry, tour, tree, lessons, and one frame loop. */
export function initTourScenes(hooks: TourHooks2): TourScenes {
  const tour = new TempleTour(
    hooks.scene,
    hooks.narration,
    hooks.player,
    hooks.follow,
    { whisper: hooks.whisper },
    hooks.temple,
  );
  const tree = new TreeOfLifeScene(
    hooks.scene,
    hooks.narration,
    hooks.player,
    undefined,
    undefined,
    { whisper: hooks.whisper },
  );

  const shore = createShoreScene(hooks.scene, hooks.narration, hooks.whisper);
  const igloo = createIglooScene(hooks.scene, hooks.narration, hooks.whisper);
  const garden = createGardenScene(hooks.scene, hooks.narration, hooks.whisper);
  const galaxies = createGalaxiesScene(hooks.scene, hooks.narration, hooks.whisper);
  const desert = createDesert(hooks.scene, hooks.narration, hooks.whisper);
  const treeStation = createTreeStationScene(hooks.scene, hooks.narration, hooks.whisper);
  const atoms = createAtomsScene(hooks.scene, hooks.narration, hooks.whisper);
  const otherWorlds = createOtherWorldsScene(hooks.scene, hooks.narration, hooks.whisper);
  const greetings = createGreetingsScene(hooks.scene, hooks.narration, hooks.whisper);

  const lessons: Record<string, SceneModule> = { shore, igloo, garden, galaxies, desert, "tree-station": treeStation, atoms, "other-worlds": otherWorlds, greetings };
  const registry = new SceneRegistry([tour, tree, shore, igloo, garden, galaxies, desert, treeStation, atoms, otherWorlds, greetings]);

  let seated: SceneModule | null = null;
  let stoodFrom: SceneModule | null = null;
  let inside = hooks.temple.inside;

  /* ---------- transitions ---------- */

  /** Open the guided tour, but only from inside the gate and only once. */
  const beginTour = (): void => {
    if (tour.active || !hooks.temple.inside) return;
    tour.enter();
    hooks.onTourStateChange?.(true);
  };

  /** Leave the tour behind and set the wanderer down at the tree of life. */
  const gotoTree = (): void => {
    tour.exit();
    // set down at the tree once the crossing out is done: placed before it, the crossing's own
    // step out of the door (650 ms later) put the wanderer back at the temple's door (the owner:
    // "I clicked, but it just went outside of the temple")
    const atTree = (): void => {
      const site = SITES.tree;
      hooks.player.pos.set(site.x, hooks.heightAt(site.x, site.z) + 0.6, site.z);
      hooks.player.heading = site.heading;
      hooks.player.target = null;
      hooks.follow.yaw = site.heading;
      hooks.follow.snapTo(hooks.player.pos);
      tree.rest();
    };
    if (hooks.temple.inside) hooks.crossTemple(false, atTree);
    else atTree();
    hooks.onTourStateChange?.(false);
  };

  tour.camera = hooks.camera;
  tour.onRest = (): void => gotoTree();

  /* ---------- frame ---------- */

  /** Advance every exhibit: thresholds, seats, greetings, then the registry itself. */
  const frame = (dt: number): void => {
    if (hooks.temple.inside !== inside) {
      inside = hooks.temple.inside;
      if (inside) beginTour();
      else if (tour.active) tour.exit();
    }

    // standing up never sits you straight back down: a seat waits until you have stepped off it
    if (stoodFrom && !stoodFrom.nearSeat(hooks.player.pos)) stoodFrom = null;
    if (seated && hooks.sitting.phase === "none") {
      seated.onStand();
      stoodFrom = seated;
      seated = null;
    } else if (!seated && !tour.active && hooks.sitting.phase === "none") {
      const module = registry.seatFor(hooks.player.pos);
      if (module && module !== stoodFrom) {
        seated = module;
        hooks.sitting.phase = "seated";
        hooks.wanderer.setGesture("sit");
        module.onSit();
      }
    } else if (seated && !seated.nearSeat(hooks.player.pos)) {
      hooks.sitting.phase = "none";
      hooks.wanderer.setGesture("none");
      seated.onStand();
      seated = null;
    }

    const treeSeat = tree.seatPos;
    if (treeSeat && hooks.player.pos.distanceTo(treeSeat) < GREET_REACH) tree.greet();

    registry.update(dt);
  };

  /* ---------- api ---------- */

  return {
    registry,
    tour,
    tree,
    lessons,
    frame,
    beginTour,
    gotoTree,
    get movementHeld(): boolean {
      return registry.movementHeld;
    },
    get seatedId(): string | null {
      return seated ? seated.id : null;
    },
  };
}

/* ---------- places ---------- */

/** The stops on the map, each starting a short walk short of its seat. */
export function tourPlaces(hooks: Pick<TourHooks2, "temple">): Place[] {
  const gate = hooks.temple.gateAt;
  const outside = hooks.temple.outside();

  const stop = (label: string, x: number, z: number, heading: number, back: number): Place => ({
    numeral: "",
    label,
    group: "Shore",
    section: "Lessons",
    x,
    z,
    narration: "J01",
    start: {
      x: x + Math.sin(heading) * back,
      z: z + Math.cos(heading) * back,
      heading,
    },
  });

  return [
    {
      numeral: "",
      label: "✦ The temple tour",
      group: "Shore",
      order: 1,
      x: gate.x,
      z: gate.z,
      narration: "J01",
      start: { x: outside.x, z: outside.z, heading: hooks.temple.gateHeading },
    },
    stop("❋ The tree of life", SITES.tree.x, SITES.tree.z, SITES.tree.heading, TREE_BACK),
    stop("The lesson of the shore", SITES.shore.x, SITES.shore.z, SITES.shore.heading, LESSON_BACK),
    stop("The lesson of the igloo", SITES.igloo.x, SITES.igloo.z, SITES.igloo.heading, LESSON_BACK),
    stop("The lesson of the garden", SITES.garden.x, SITES.garden.z, SITES.garden.heading, LESSON_BACK),
    stop("The lesson of the galaxies", SITES.galaxies.x, SITES.galaxies.z, SITES.galaxies.heading, LESSON_BACK),
    stop("The lesson of the desert", SITES.desert.x, SITES.desert.z, SITES.desert.heading, LESSON_BACK),
    stop("Atoms and light", SITES.atoms.x, SITES.atoms.z, SITES.atoms.heading, LESSON_BACK),
    stop("Other worlds", SITES["other-worlds"].x, SITES["other-worlds"].z, SITES["other-worlds"].heading, LESSON_BACK),
    stop("Psychic greetings", SITES.greetings.x, SITES.greetings.z, SITES.greetings.heading, LESSON_BACK),
  ];
}
