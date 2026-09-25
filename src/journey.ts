/* The shape of the journey on the island and home again.
   - Stations: approaching one plays its narration (never over a story beat); walking away
     fades it; hearing it through marks the station visited. Each ends with its quiet question.
   - The single fading word ("sit", "step in", "board"…) and the context button.
   - The Chariot: after the other six, boarding it carries the wanderer on a slow, dreamlike
     ride past echoes of the six stations, to the island's near shore.
   - The return: a path of light across the water; J11 plays on the swim home; on the home
     shore the sky is a fraction brighter, the wanderer carries a small star, and a card reads
     "The water will always be here." Then free roam. */
import * as THREE from "three";
import type { AudioEngine } from "./core/audio";
import type { Narration } from "./core/narration";
import type { Controller } from "./player/controller";
import type { Wanderer } from "./player/wanderer";
import { skyUniforms } from "./world/sky";
import { buildStations, type Chariot, type Frame, type Hooks, type Station } from "./world/stations";
import { heightAt } from "./world/terrain";

const STORY = new Set(["J01", "J02", "J03", "J11"]);
const LANDING = new THREE.Vector3(0, 0, -113);

export interface JourneyState {
  heard: Set<string>;
  visited: number[];
  rideDone: boolean;
  ended: boolean;
}

export interface JourneyDeps {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  player: Controller;
  wanderer: Wanderer;
  narration: Narration;
  audio: AudioEngine;
  state: JourneyState;
  persist(): void;
  beat(id: string): void;
  say(text: string): void;
  fade(on: boolean): void;
  ui: {
    prompt(word: string | null): void;
    question(text: string): void;
    ending(): void;
  };
}

function pathMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uT: { value: 0 }, uI: { value: 0 } },
    vertexShader: `varying vec2 vU;void main(){vU=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
    fragmentShader: `varying vec2 vU;uniform float uT,uI;void main(){
      float centre=exp(-pow((vU.x-0.5)*7.0,2.0));
      float shimmer=0.65+0.35*sin(vU.y*260.0-uT*1.4+sin(vU.x*20.0+uT)*1.5);
      float ends=smoothstep(0.0,0.04,vU.y)*smoothstep(1.0,0.96,vU.y);
      gl_FragColor=vec4(vec3(1.0,0.84,0.58)*centre*shimmer*ends*uI*0.8,1.0);}`,
  });
}

export class Journey {
  stations: Station[];
  timeScale = 1;
  riding = false;
  /** Boarding: the moment between choosing the vessel and the ride beginning. */
  boarding = false;
  get busy(): boolean {
    return this.riding || this.boarding;
  }
  private chariot: Chariot;
  private hooks: Hooks;
  private inside: boolean[];
  private started: boolean[];
  private prompt: { word: string; station: Station } | null = null;
  private starBoost = 0;
  private wantTime = 1;
  private wantStars = 0;
  private ride: { t: number; dur: number; curve: THREE.CatmullRomCurve3 } | null = null;
  private echo: number[] = [0, 0, 0, 0, 0, 0, 0];
  private camPos = new THREE.Vector3();
  private path: THREE.Mesh;
  private pathMat = pathMaterial();
  private companion: THREE.Sprite;
  private light = 0;

  constructor(private d: JourneyDeps) {
    this.stations = buildStations();
    for (const s of this.stations) d.scene.add(s.group);
    this.chariot = this.stations[6] as Chariot;
    this.inside = this.stations.map(() => false);
    this.started = this.stations.map(() => false);
    for (const n of d.state.visited) this.stations[n - 1]?.markVisited();

    // The path of light home across the water.
    const len = 128;
    this.path = new THREE.Mesh(new THREE.PlaneGeometry(2.4, len).rotateX(-Math.PI / 2), this.pathMat);
    this.path.position.set(0, 0.06, LANDING.z + len / 2 - 2);
    d.scene.add(this.path);

    // The small star the wanderer carries home.
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const g = c.getContext("2d")!;
    const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, "rgba(255,240,205,1)");
    grd.addColorStop(0.25, "rgba(255,210,150,0.5)");
    grd.addColorStop(1, "rgba(255,190,120,0)");
    g.fillStyle = grd;
    g.fillRect(0, 0, 64, 64);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    this.companion = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0 }));
    this.companion.scale.setScalar(0.7);
    d.scene.add(this.companion);

    this.hooks = {
      audio: d.audio,
      sit: (at, heading) => {
        d.player.pos.copy(at);
        d.player.heading = heading;
        d.player.target = null;
        d.player.vel.set(0, 0, 0);
        d.wanderer.setGesture("sit");
      },
      reach: (on) => d.wanderer.setGesture(on ? "reach" : "none"),
      setTimeScale: (k) => (this.wantTime = Math.min(this.wantTime, k)),
      setStarBoost: (k) => (this.wantStars = Math.max(this.wantStars, k)),
      board: () => this.board(),
      visitedCount: () => d.state.visited.filter((n) => n <= 6).length,
    };

    d.narration.onEnd = (id) => this.narrationEnded(id);
    if (d.state.ended) this.light = 0.35;
  }

  /** The context button / Space. Returns false when there is nothing here (then it's a jump). */
  act(): boolean {
    if (this.busy) return true;
    if (this.d.wanderer.gesture === "sit") {
      this.d.wanderer.setGesture("none"); // stand again
      return true;
    }
    if (!this.prompt) return false;
    this.prompt.station.act(this.frame(0, 0), this.hooks);
    return true;
  }

  private frame(t: number, dt: number, seen = 1): Frame {
    return { t, dt, player: this.d.player.pos, reduced: false, seen, gesture: this.d.wanderer.gesture };
  }

  update(dt: number, t: number, seen: number, reduced: boolean): void {
    const { player, narration, state } = this.d;
    const f: Frame = { t, dt, player: player.pos, reduced, seen: this.riding ? 1 : seen, gesture: this.d.wanderer.gesture };

    // Stations respond while their narration plays (or while the vessel passes their echo).
    this.wantTime = 1;
    this.wantStars = 0;
    this.stations.forEach((s, i) => {
      this.echo[i] = Math.max(0, this.echo[i] - dt * 0.5);
      s.update(f, this.hooks, narration.current === s.data.narration || this.echo[i] > 0.05);
    });
    this.timeScale += (this.wantTime - this.timeScale) * Math.min(1, dt * 0.8);
    this.starBoost += (this.wantStars - this.starBoost) * Math.min(1, dt * 0.5);
    skyUniforms.uStarBoost.value = this.starBoost;

    if (this.riding) this.updateRide(dt);
    else if (!this.boarding) {
      // Approach a station and its narration begins; walk away and it fades.
      this.stations.forEach((s, i) => {
        if (s.data.n === 7) return; // the Chariot speaks when boarded
        const dist = s.distance(player.pos);
        if (dist < s.radius && !this.inside[i]) {
          this.inside[i] = true;
          this.started[i] = false;
        } else if (dist > s.radius * 1.8 && this.inside[i]) {
          this.inside[i] = false;
          if (narration.current === s.data.narration) narration.stop(2.5);
        }
        const beatPlaying = narration.current !== null && STORY.has(narration.current);
        if (this.inside[i] && !this.started[i] && !beatPlaying && !player.swimming) {
          this.started[i] = true;
          if (narration.current !== s.data.narration) narration.play(s.data.narration);
        }
      });

      // The nearest station with something to offer gives its one word.
      let best: { word: string; station: Station } | null = null;
      let bestD = 1e9;
      for (const s of this.stations) {
        const w = s.prompt(f, this.hooks);
        const dd = s.distance(player.pos);
        if (w && dd < bestD) {
          best = { word: w, station: s };
          bestD = dd;
        }
      }
      if (this.d.wanderer.gesture === "sit") best = null;
      if (best?.word !== this.prompt?.word) this.d.ui.prompt(best ? best.word : null);
      this.prompt = best;
    }

    // The return: the path of light, J11 on the swim, and the ending on the home shore.
    this.pathMat.uniforms.uT.value = t;
    this.pathMat.uniforms.uI.value += ((state.rideDone ? 1 : 0) - this.pathMat.uniforms.uI.value) * Math.min(1, dt * 0.4);
    this.path.visible = this.pathMat.uniforms.uI.value > 0.01;
    if (state.rideDone && player.swimming && !this.riding) this.d.beat("J11");
    if (state.rideDone && state.heard.has("J11") && !state.ended && !player.swimming && player.pos.z > 16) {
      state.ended = true;
      this.d.persist();
      this.d.ui.ending();
      this.d.audio.bell(587.33, 0.06, 9);
      window.setTimeout(() => this.d.audio.bell(880, 0.04, 10), 500);
      this.d.say("You are home. The sky is a little brighter, and you carry a small star.");
    }
    this.light += ((state.ended ? 0.35 : 0) - this.light) * Math.min(1, dt * 0.12);
    skyUniforms.uLight.value = this.light;
    const sm = this.companion.material as THREE.SpriteMaterial;
    sm.opacity += ((state.ended ? 1 : 0) - sm.opacity) * Math.min(1, dt * 0.5);
    this.companion.visible = sm.opacity > 0.01;
    const a = reduced ? 0 : t * 0.6;
    this.companion.position.set(player.pos.x + Math.cos(a) * 0.55, player.pos.y + 1.25 + Math.sin(t * 0.9) * 0.08, player.pos.z + Math.sin(a) * 0.55);
  }

  private narrationEnded(id: string): void {
    const s = this.stations.find((x) => x.data.narration === id);
    if (!s) return;
    if (!s.visited) {
      s.markVisited();
      if (!this.d.state.visited.includes(s.data.n)) this.d.state.visited.push(s.data.n);
      this.d.persist();
      this.d.say(`${s.data.title}: visited.`);
      if (this.hooks.visitedCount() === 6 && s.data.n !== 7) {
        this.d.say("All six are visited. The vessel at the far edge of the island is ready.");
      }
    }
    this.d.ui.question(s.data.question);
  }

  /* ---------- the Chariot's ride ---------- */
  private board(): void {
    if (this.busy) return;
    this.boarding = true;
    this.d.ui.prompt(null);
    this.prompt = null;
    this.d.fade(true);
    window.setTimeout(() => {
      const start = this.chariot.vessel.getWorldPosition(new THREE.Vector3());
      const pts = [start.clone(), start.clone().add(new THREE.Vector3(0, 2.4, 6))];
      // Past each of the six, a little to the side and above.
      for (const s of this.stations.slice(0, 6)) {
        const out = new THREE.Vector3(s.center.x, 0, s.center.z + 150).normalize();
        pts.push(new THREE.Vector3(s.center.x + out.x * 5, s.center.y + 3.2, s.center.z + out.z * 5));
      }
      const land = new THREE.Vector3(LANDING.x, heightAt(LANDING.x, LANDING.z) + 0.25, LANDING.z);
      pts.push(land.clone().add(new THREE.Vector3(0, 2, -6)), land);
      this.ride = { t: 0, dur: 50, curve: new THREE.CatmullRomCurve3(pts, false, "centripetal") };
      this.riding = true;
      this.boarding = false;
      this.chariot.riding = true;
      this.d.wanderer.setGesture("sit");
      this.d.narration.play("J10");
      this.camPos.copy(this.d.camera.position);
      this.d.fade(false);
      this.d.say("You board the vessel. It carries you slowly past the six stations.");
    }, 1400);
  }

  private updateRide(dt: number): void {
    const r = this.ride!;
    r.t += dt;
    const k = Math.min(1, r.t / r.dur);
    const u = k * k * (3 - 2 * k);
    const p = r.curve.getPointAt(u);
    const tan = r.curve.getTangentAt(Math.min(0.999, Math.max(0.001, u)));
    // The vessel carries the wanderer.
    const local = p.clone().sub(this.chariot.group.position);
    this.chariot.vessel.position.copy(local);
    this.chariot.vessel.rotation.y = Math.atan2(tan.x, tan.z);
    const { player } = this.d;
    player.pos.set(p.x, p.y + 0.15, p.z);
    player.heading = Math.atan2(-tan.x, -tan.z);
    // Echoes: each station glows as the vessel passes.
    this.stations.slice(0, 6).forEach((s, i) => {
      if (s.center.distanceTo(p) < 10) this.echo[i] = 1;
    });
    if (k >= 1) this.endRide();
  }

  /** During the ride the camera follows the vessel from behind and above. */
  applyCamera(camera: THREE.PerspectiveCamera, dt: number): void {
    if (!this.riding || !this.ride) return;
    const r = this.ride;
    const u0 = Math.min(1, r.t / r.dur);
    const u = u0 * u0 * (3 - 2 * u0);
    const p = r.curve.getPointAt(u);
    const tan = r.curve.getTangentAt(Math.min(0.999, Math.max(0.001, u)));
    const want = p.clone().addScaledVector(tan, -7).add(new THREE.Vector3(0, 3, 0));
    this.camPos.lerp(want, Math.min(1, dt * 1.2));
    camera.position.copy(this.camPos);
    camera.lookAt(p.clone().addScaledVector(tan, 5).add(new THREE.Vector3(0, 0.6, 0)));
  }

  private endRide(): void {
    this.d.fade(true);
    window.setTimeout(() => {
      this.riding = false;
      this.chariot.riding = false;
      this.chariot.vessel.position.set(0, 0.25, -1.5);
      this.chariot.vessel.rotation.y = 0;
      const { player, state } = this.d;
      player.pos.set(LANDING.x, heightAt(LANDING.x, LANDING.z), LANDING.z);
      player.heading = Math.PI; // facing home
      player.vel.set(0, 0, 0);
      player.grounded = true;
      this.d.wanderer.setGesture("none");
      if (!state.visited.includes(7)) state.visited.push(7);
      this.stations[6].markVisited();
      state.rideDone = true;
      this.d.persist();
      this.d.fade(false);
      this.d.say("The vessel rests at the shore. A path of light leads home across the water.");
    }, 1400);
  }
}
