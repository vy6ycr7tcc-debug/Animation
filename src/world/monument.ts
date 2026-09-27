/* The monument to the One Infinite Creator (Samuel: "the evolution from atom to a rock to a
   crystal to molecular structure to plants to animals to primates to humans to social memory
   complexes and back to unity and start all over again, an animated monument but don't make it
   holographic, make it a living thing").

   A living tree at the centre, three strands braided as they rise, holding up nine shelves of
   stone on curving branches, a spiral stair of creation. On each shelf, one stage, made of real
   stuff (stone, quartz, ivory, bark, hide, skin), each alive in its own way:
     1 the atom: a dense nucleus, pearls circling on bronze rings;
     2 the stone: a weathered boulder;
     3 the crystal: clear quartz growing out of stone;
     4 the molecule: an ivory double helix, turning;
     5 the plant: a sapling curling up and swaying;
     6 the animal: a horse, breathing, stepping;
     7 the primate: a figure hunched low, dark-furred;
     8 the human: upright, warm clay-skin, breathing;
     9 the social memory complex: six figures in a ring, facing in, arms raised together.
   Above them, in the crown, unity: a sphere of molten gold, its surface slowly churning.
   The cycle, a hundred seconds: each stage grows into life in turn and stays; then all of it is
   gathered up into the sphere, which swells, sinks down through the heart of the tree, becomes
   the atom at its foot, and it begins again. Nothing glows like a hologram: everything is lit by
   the world's own light and shadow (only the gold burns a little from within). */
import * as THREE from "three/webgpu";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import { floatAttributes, loadBytes } from "../core/assets";
import { T, type N } from "../gpu/tsl";
import { barkMaterial, grow, prismGeometry, SHAPES, tubes } from "./creation";
import { scan } from "./temple";
import { colliders, MONUMENT } from "./terrain";

const V = THREE.Vector3;
const { float, smoothstep, uniform, vec3, vec4 } = T;
const CYCLE = 100;
const STAGES = ["The atom", "The stone", "The crystal", "The molecule", "The plant", "The animal", "The primate", "The human", "The social memory complex"];
const SHELF_R = 5.6; // shelves' distance from the trunk
const SHELF_H0 = 0.6, SHELF_DH = 0.82; // heights: a gentle climb, every stage in view from the ground
const TOP = 9.6; // unity, in the crown

/* ---------------------------------------------------------------- materials */
function stoneMat(): THREE.MeshStandardNodeMaterial {
  const m = new THREE.MeshStandardNodeMaterial({ metalness: 0, roughness: 0.85 });
  const S = scan("sandstone_blocks_05");
  const pw = T.positionWorld, n = T.normalWorldGeometry;
  const wp = T.pow(T.abs(n), vec3(4));
  const w = wp.div(wp.x.add(wp.y).add(wp.z));
  const tri = (t: THREE.Texture, s: number) => T.texture(t, pw.zy.div(s)).mul(w.x).add(T.texture(t, pw.xz.div(s)).mul(w.y)).add(T.texture(t, pw.xy.div(s)).mul(w.z));
  const arm = tri(S.arm, 2.2);
  m.colorNode = vec4(tri(S.diff, 2.2).rgb.mul(T.mix(float(0.45), float(1.05), arm.r)).mul(1.1), 1);
  m.roughnessNode = T.clamp(arm.g, 0.5, 1);
  return m;
}
/** Living skin: warm, a little uneven, the light soft through it at the edges. */
function skinMat(base: [number, number, number], fur = false): THREE.MeshStandardNodeMaterial {
  const m = new THREE.MeshStandardNodeMaterial({ metalness: 0, roughness: fur ? 0.95 : 0.62 });
  const p = T.positionWorld;
  const grain = T.mx_noise_float(p.mul(fur ? 38 : 14)).mul(fur ? 0.18 : 0.06).add(1);
  const blotch = T.mx_noise_float(p.mul(1.7)).mul(0.08).add(1);
  const c = vec3(...base).mul(grain).mul(blotch);
  m.colorNode = vec4(c, 1);
  const V0 = T.normalize(T.cameraPosition.sub(p));
  const rim = T.pow(float(1).sub(T.max(T.dot(T.normalWorld, V0), 0)), 3);
  m.emissiveNode = c.mul(rim.mul(fur ? 0.12 : 0.28).add(0.04)); // light scattered in the skin
  return m;
}
function ivoryMat(): THREE.MeshStandardNodeMaterial {
  return new THREE.MeshStandardNodeMaterial({ color: 0xe8dcc4, roughness: 0.38, metalness: 0 });
}
function bronzeMat(): THREE.MeshStandardNodeMaterial {
  const m = new THREE.MeshStandardNodeMaterial({ color: 0x8a5a2e, roughness: 0.45, metalness: 0.6 });
  m.emissiveNode = vec3(0.1, 0.06, 0.03);
  return m;
}
function quartzMat(): THREE.MeshStandardNodeMaterial {
  const m = new THREE.MeshStandardNodeMaterial({ color: 0xdfe9ef, roughness: 0.1, metalness: 0, transparent: true, opacity: 0.82 });
  const V0 = T.normalize(T.cameraPosition.sub(T.positionWorld));
  const ndv = T.max(T.dot(T.normalWorld, V0), 0);
  m.emissiveNode = vec3(0.6, 0.72, 0.8).mul(T.pow(float(1).sub(ndv), 3).mul(0.25).add(0.03));
  return m;
}
/** Molten gold, alive: slow convection cells churning over its surface, burning from within. */
function goldMat(uT: N, uK: N): THREE.MeshStandardNodeMaterial {
  const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.35, metalness: 0.5 });
  const p = T.positionGeometry.normalize();
  const flow = T.mx_noise_float(p.mul(3.2).add(vec3(uT.mul(0.08), uT.mul(-0.05), 0)));
  const cells = T.mx_worley_noise_float(p.mul(5).add(vec3(0, uT.mul(0.04), uT.mul(0.03))));
  const heat = smoothstep(0.1, 0.7, cells).mul(0.6).add(flow.mul(0.3)).add(0.35);
  const c = T.mix(vec3(0.55, 0.28, 0.06), vec3(1.0, 0.78, 0.35), heat);
  m.colorNode = vec4(c, 1);
  m.emissiveNode = c.mul(heat.mul(0.9).add(0.2)).mul(uK.mul(0.8).add(0.35));
  return m;
}

/* ---------------------------------------------------------------- geometry helpers */
function boulderGeo(): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(0.75, 4);
  const p = g.attributes.position as THREE.BufferAttribute, v = new V();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const n = Math.sin(v.x * 3.1 + v.y * 1.7) * 0.08 + Math.sin(v.z * 5.3 - v.x * 2.2) * 0.05 + Math.sin(v.y * 9 + v.z * 7) * 0.02;
    v.multiplyScalar(1 + n).multiply(new V(1.1, 0.72, 0.95));
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  g.translate(0, 0.45, 0);
  return g;
}
const ease = (x: number) => {
  const t = Math.min(1, Math.max(0, x));
  const c = 1.4;
  return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); // eases out, a little past, back
};
const ss = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

interface Stage {
  root: THREE.Group; // on its shelf
  body: THREE.Group; // what grows and breathes
  shelf: THREE.Vector3; // the shelf's top centre (local)
  tick?: (t: number, dt: number) => void;
}

export class Monument {
  group = new THREE.Group();
  readonly centre = new THREE.Vector3(MONUMENT.x, MONUMENT.y, MONUMENT.z);
  private stages: Stage[] = [];
  private unity: THREE.Mesh;
  private uT = uniform(0);
  private uK = uniform(0);
  private mixers: THREE.AnimationMixer[] = [];
  private posers: (() => void)[] = [];
  t = 0; // the cycle's clock (the vision above follows it)
  /** The stage just waking (for whispers); −1 none, 9 unity. */
  phase = -1;

  constructor() {
    this.group.position.copy(this.centre);
    const stone = stoneMat();
    // the base: a low round step of stone around the tree
    const base = new THREE.Mesh(new THREE.CylinderGeometry(7.4, 7.8, 0.6, 64), stone);
    base.position.y = -0.2;
    base.receiveShadow = true;
    this.group.add(base);
    // the living tree: three strands braided as they rise, opening at the crown into a cradle
    const bark = barkMaterial(new THREE.Color(1.0, 0.8, 0.5), 0.37);
    const strands = [0, 1, 2].map((k) => {
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i <= 40; i++) {
        const u = i / 40, y = -0.3 + u * (TOP - 0.6);
        const open = u > 0.9 ? (u - 0.9) * 12 : 0; // the crown opens
        const r = 0.5 + 0.12 * Math.sin(u * 9 + k) + open * 0.35;
        const a = k * (Math.PI * 2 / 3) + u * Math.PI * 3.2;
        pts.push(new V(Math.cos(a) * r, y, Math.sin(a) * r));
      }
      return { pts, r0: 0.42, r1: 0.14, u0: 0, u1: 1, flare: true };
    });
    // the branches holding each shelf: from the trunk, curving out and up under the stone
    const branches = STAGES.map((_, i) => {
      const a = i * 0.72, y = SHELF_H0 + i * SHELF_DH;
      const pts: THREE.Vector3[] = [];
      for (let j = 0; j <= 10; j++) {
        const u = j / 10, r = 0.45 + u * (SHELF_R - 0.45);
        pts.push(new V(Math.cos(a + u * 0.25) * r, y - 0.9 + Math.sin(u * Math.PI * 0.5) * 0.75 - (1 - u) * 0.4, Math.sin(a + u * 0.25) * r));
      }
      return { pts, r0: 0.26, r1: 0.12, u0: 0, u1: 1 };
    });
    const tree = new THREE.Mesh(tubes([...strands, ...branches]), bark);
    tree.castShadow = true;
    this.group.add(tree);
    // the shelves
    STAGES.forEach((_, i) => {
      const a = i * 0.72 + 0.25, y = SHELF_H0 + i * SHELF_DH;
      const at = new V(Math.cos(a) * SHELF_R, y, Math.sin(a) * SHELF_R);
      const shelf = new THREE.Mesh(new THREE.CylinderGeometry(1.55, 1.35, 0.32, 40), stone);
      shelf.position.copy(at).setY(y - 0.16);
      shelf.castShadow = shelf.receiveShadow = true;
      this.group.add(shelf);
      const root = new THREE.Group();
      root.position.copy(at);
      root.rotation.y = -a + Math.PI / 2; // facing outward
      const body = new THREE.Group();
      root.add(body);
      this.group.add(root);
      this.stages.push({ root, body, shelf: at });
      colliders.push({ x: MONUMENT.x + at.x, z: MONUMENT.z + at.z, r: 1.5, top: MONUMENT.y + y + 2.2 });
    });
    colliders.push({ x: MONUMENT.x, z: MONUMENT.z, r: 1.3, top: MONUMENT.y + TOP + 2 });
    this.buildStages(stone, bark);
    // unity, in the crown
    this.unity = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 32), goldMat(this.uT, this.uK));
    this.unity.position.y = TOP;
    this.unity.castShadow = true;
    this.group.add(this.unity);
    const glow = new THREE.PointLight(0xffc070, 0, 18, 1.8);
    glow.position.y = TOP;
    this.unity.userData.light = glow;
    this.group.add(glow);
    void this.loadFigures();
  }

  private buildStages(stone: THREE.Material, bark: THREE.Material): void {
    const S = this.stages;
    // 1 the atom
    {
      const b = S[0].body;
      const nucleus = new THREE.Mesh(new THREE.IcosahedronGeometry(0.3, 3), new THREE.MeshStandardNodeMaterial({ color: 0x2a2320, roughness: 0.25, metalness: 0.2 }));
      nucleus.position.y = 1.0;
      b.add(nucleus);
      const bronze = bronzeMat(), ivory = ivoryMat();
      const rings: THREE.Group[] = [];
      for (let k = 0; k < 3; k++) {
        const g = new THREE.Group();
        g.position.y = 1.0;
        g.rotation.set(k * 1.05, k * 0.7, 0.3 * k);
        g.add(new THREE.Mesh(new THREE.TorusGeometry(0.75, 0.018, 8, 64), bronze));
        const pearl = new THREE.Mesh(new THREE.SphereGeometry(0.08, 16, 12), ivory);
        pearl.position.x = 0.75;
        const spin = new THREE.Group();
        spin.add(pearl);
        g.add(spin);
        g.userData.spin = spin;
        rings.push(g);
        b.add(g);
      }
      S[0].tick = (t) => rings.forEach((g, k) => ((g.userData.spin as THREE.Group).rotation.z = t * (1.6 + k * 0.5)));
    }
    // 2 the stone
    {
      const m = new THREE.Mesh(boulderGeo(), stone);
      m.castShadow = true;
      S[1].body.add(m);
    }
    // 3 the crystal, growing from stone
    {
      const b = S[2].body;
      const rock = new THREE.Mesh(boulderGeo(), stone);
      rock.scale.setScalar(0.6);
      b.add(rock);
      const quartz = quartzMat(), prism = prismGeometry();
      const cr: THREE.Mesh[] = [];
      for (let k = 0; k < 7; k++) {
        const c = new THREE.Mesh(prism, quartz);
        const a = k * 2.4, tilt = k === 0 ? 0 : 0.35 + (k % 3) * 0.15;
        c.position.set(Math.cos(a) * 0.18 * (k ? 1 : 0), 0.55, Math.sin(a) * 0.18 * (k ? 1 : 0));
        c.rotation.set(Math.sin(a) * tilt, 0, -Math.cos(a) * tilt);
        const len = k === 0 ? 1.5 : 0.6 + (k % 3) * 0.25;
        c.scale.set(0.35, len, 0.35);
        c.userData.len = len;
        cr.push(c);
        b.add(c);
      }
      S[2].tick = (t) => cr.forEach((c, k) => (c.scale.y = (c.userData.len as number) * (1 + 0.025 * Math.sin(t * 0.7 + k))));
    }
    // 4 the molecule: an ivory double helix, turning
    {
      const b = S[3].body;
      const helix = new THREE.Group();
      helix.position.y = 0.25;
      const ivory = ivoryMat(), bronze = bronzeMat();
      const ball = new THREE.SphereGeometry(0.075, 14, 10), rod = new THREE.CylinderGeometry(0.018, 0.018, 1, 6);
      for (let i = 0; i < 16; i++) {
        const y = i * 0.1, a = i * 0.6;
        const p1 = new V(Math.cos(a) * 0.32, y, Math.sin(a) * 0.32), p2 = new V(-Math.cos(a) * 0.32, y, -Math.sin(a) * 0.32);
        for (const p of [p1, p2]) {
          const s = new THREE.Mesh(ball, ivory);
          s.position.copy(p);
          helix.add(s);
        }
        const r = new THREE.Mesh(rod, bronze);
        r.position.copy(p1).add(p2).multiplyScalar(0.5);
        r.scale.y = p1.distanceTo(p2);
        r.quaternion.setFromUnitVectors(new V(0, 1, 0), p2.clone().sub(p1).normalize());
        helix.add(r);
      }
      b.add(helix);
      S[3].tick = (t) => (helix.rotation.y = t * 0.35);
    }
    // 5 the plant: a sapling, curling up and swaying
    {
      const b = S[4].body;
      const { limbs } = grow({ ...SHAPES[2], height: 3.2, limbLen: 1.4, radius: 0.08, roots: 0 }, 0.713);
      const plant = new THREE.Mesh(tubes(limbs), bark);
      plant.scale.setScalar(0.62);
      plant.castShadow = true;
      b.add(plant);
      S[4].tick = (t) => {
        plant.rotation.z = Math.sin(t * 0.9) * 0.04;
        plant.rotation.x = Math.sin(t * 0.7 + 1) * 0.03;
      };
    }
  }

  /** The animal, the primate, the human, the six: real animated figures, given living skin. */
  private async loadFigures(): Promise<void> {
    const S = this.stages;
    // the horse
    const hb = await loadBytes("models/animals/horse.glb");
    if (hb) {
      const gltf = await new GLTFLoader().parseAsync(hb, "");
      const src = gltf.scene.getObjectByProperty("type", "Mesh") as THREE.Mesh | undefined;
      if (src && gltf.animations[0]) {
        const geo = src.geometry as THREE.BufferGeometry;
        geo.deleteAttribute("color");
        geo.computeVertexNormals();
        geo.computeBoundingBox();
        const bb = geo.boundingBox!;
        const k = 1.55 / (bb.max.y - bb.min.y);
        const mesh = new THREE.Mesh(geo, skinMat([0.36, 0.2, 0.11], true));
        mesh.name = src.name;
        mesh.morphTargetInfluences = [...(src.morphTargetInfluences ?? [])];
        mesh.morphTargetDictionary = src.morphTargetDictionary;
        mesh.scale.setScalar(k);
        mesh.position.y = -bb.min.y * k;
        mesh.rotation.y = Math.PI / 2; // side on to the path round the tree
        mesh.castShadow = true;
        S[5].body.add(mesh);
        const mixer = new THREE.AnimationMixer(mesh);
        const a = mixer.clipAction(gltf.animations[0]);
        a.timeScale = 0.3; // stepping slowly, in place
        a.play();
        this.mixers.push(mixer);
      }
    }
    // the human form (the wanderer's own recorded figure)
    const wb = await loadBytes("models/wanderer.glb");
    if (!wb) return;
    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
    const gltf = await loader.parseAsync(wb, "");
    floatAttributes(gltf.scene);
    const box = new THREE.Box3().setFromObject(gltf.scene, true);
    const H = box.max.y - box.min.y || 1.8;
    const clip = (name: string) => gltf.animations.find((c) => c.name === name)!;
    const skin = skinMat([0.72, 0.5, 0.4]), fur = skinMat([0.2, 0.15, 0.12], true);
    const figure = (height: number, mat: THREE.Material, clipName: string, speed: number): { obj: THREE.Object3D; bone: (n: string) => THREE.Bone | undefined } => {
      const obj = cloneSkinned(gltf.scene);
      obj.traverse((o) => {
        if ((o as THREE.Mesh).isMesh) {
          (o as THREE.Mesh).material = mat;
          o.castShadow = true;
          o.frustumCulled = false;
        }
      });
      obj.scale.setScalar(height / H);
      const mixer = new THREE.AnimationMixer(obj);
      const a = mixer.clipAction(clip(clipName));
      a.timeScale = speed;
      a.play();
      mixer.update(Math.random() * 3);
      this.mixers.push(mixer);
      const bones: Record<string, THREE.Bone> = {};
      obj.traverse((o) => ((o as THREE.Bone).isBone ? (bones[o.name.replace(/[\s.:/[\]]/g, "")] = o as THREE.Bone) : 0));
      return { obj, bone: (n) => bones[n.replace(/[\s.:/[\]]/g, "")] };
    };
    // the primate: crouched low, back rounded, arms hanging to the ground
    {
      const f = figure(1.5, fur, "Idle_Loop", 0.6);
      S[6].body.add(f.obj);
      const bend: [string, number, "x" | "z"][] = [
        ["DEF-spine.001", 0.45, "x"], ["DEF-spine.003", 0.3, "x"], ["DEF-neck", -0.45, "x"],
        ["DEF-thigh.L", -0.6, "x"], ["DEF-thigh.R", -0.6, "x"], ["DEF-shin.L", 0.9, "x"], ["DEF-shin.R", 0.9, "x"],
        ["DEF-upper_arm.L", 0.5, "x"], ["DEF-upper_arm.R", 0.5, "x"],
      ];
      f.obj.position.y = -0.18;
      this.posers.push(() => {
        for (const [n, a, ax] of bend) {
          const b = f.bone(n);
          if (b) b.rotation[ax] += a;
        }
      });
    }
    // the human: upright, breathing
    S[7].body.add(figure(1.72, skin, "Idle_Loop", 0.8).obj);
    // the six, in a ring, facing in, arms raised together
    for (let k = 0; k < 6; k++) {
      const f = figure(1.1, skin, "Spell_Simple_Idle_Loop", 0.5);
      const a = (k / 6) * Math.PI * 2;
      f.obj.position.set(Math.cos(a) * 0.72, 0, Math.sin(a) * 0.72);
      f.obj.rotation.y = -a - Math.PI / 2 + Math.PI; // facing the centre
      S[8].body.add(f.obj);
    }
  }

  /** Each frame (only when near enough to matter). */
  update(dt: number, player: THREE.Vector3, reduced: boolean): void {
    const d = player.distanceTo(this.centre);
    this.group.visible = d < 900;
    if (d > 260) return;
    this.t = (this.t + dt * (reduced ? 0.6 : 1)) % CYCLE;
    const t = this.t;
    this.uT.value += dt;
    const breath = Math.sin(this.uT.value * 0.55);
    // each stage grows into life in turn (every 8 s), and stays; at 74 s all are gathered up
    const gather = (i: number) => ss(74 + (8 - i) * 0.6, 76 + (8 - i) * 0.6, t);
    this.phase = -1;
    this.stages.forEach((s, i) => {
      const born = ease((t - i * 8) / 3);
      const k = t < i * 8 ? 0 : born * (1 - gather(i));
      s.body.scale.setScalar(Math.max(0.0001, k * (1 + 0.012 * breath)));
      s.body.visible = k > 0.002;
      // drawn up toward the crown as it is gathered
      const up = gather(i);
      s.body.position.set(0, up * (TOP - s.shelf.y) * 0.6, 0);
      if (t >= i * 8 && t < i * 8 + 3) this.phase = i;
      if (s.body.visible) s.tick?.(this.uT.value, dt);
    });
    // unity: small and still in the crown while the stages grow; swelling as all is gathered
    // into it; then sinking down through the heart of the tree to become the atom again
    const swell = ss(74, 80, t), sink = ss(84, 96, t), vanish = ss(96, 100, t);
    const r = 0.35 + swell * 0.85 - sink * 0.9;
    this.unity.scale.setScalar(Math.max(0.0001, r * (1 - vanish) * (1 + 0.02 * breath)));
    this.unity.position.y = TOP - sink * (TOP - 1.0);
    this.uK.value = swell * (1 - vanish);
    (this.unity.userData.light as THREE.PointLight).intensity = 6 + swell * 26 * (1 - vanish);
    (this.unity.userData.light as THREE.PointLight).position.y = this.unity.position.y;
    if (t >= 74 && t < 84) this.phase = 9;
    for (const m of this.mixers) m.update(dt);
    for (const p of this.posers) p();
  }

  stageName(i: number): string {
    return i === 9 ? "Unity" : STAGES[i] ?? "";
  }
}
