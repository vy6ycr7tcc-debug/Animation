/* Phase-1 landmarks on each island: enough silhouette to read from the lake and to draw
   the wanderer toward them. Stations and real art come in phases 2–3. */
import * as THREE from "three";
import { colliders, heightAt, ISLANDS, type Island } from "./terrain";

function rng(seed: number) {
  return () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
}

export interface Animated {
  update(t: number, reduced: boolean): void;
}

export function buildIslands(scene: THREE.Scene): Animated[] {
  const anim: Animated[] = [];
  for (const isl of ISLANDS) {
    const g = new THREE.Group();
    g.name = isl.kind;
    scene.add(g);
    if (isl.kind === "mind") anim.push(mind(isl, g));
    if (isl.kind === "body") anim.push(body(isl, g));
    if (isl.kind === "spirit") anim.push(spirit(isl, g));
  }
  return anim;
}

/** Mind: mirrors half-lost in fog, and a small forest that floats above the ground. */
function mind(isl: Island, g: THREE.Group): Animated {
  const R = rng(3);
  const mirrorMat = new THREE.MeshStandardMaterial({ color: "#dfe7f2", metalness: 1, roughness: 0.08, envMapIntensity: 1.6 });
  const frameMat = new THREE.MeshStandardMaterial({ color: "#aab6c8", roughness: 0.6, emissive: "#9fc3ff", emissiveIntensity: 0.25 });
  const mirrors: THREE.Object3D[] = [];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + R() * 0.4;
    const r = isl.radius * (0.25 + R() * 0.3);
    const x = isl.x + Math.cos(a) * r, z = isl.z + Math.sin(a) * r;
    const y = heightAt(x, z);
    const m = new THREE.Group();
    const h = 3.2 + R() * 2.5;
    const plate = new THREE.Mesh(new THREE.BoxGeometry(1.6, h, 0.08), mirrorMat);
    const frame = new THREE.Mesh(new THREE.BoxGeometry(1.8, h + 0.2, 0.05), frameMat);
    frame.position.z = -0.05;
    plate.castShadow = frame.castShadow = true;
    m.add(plate, frame);
    m.position.set(x, y + h / 2 + 0.6, z);
    m.rotation.y = a + Math.PI / 2 + (R() - 0.5) * 0.8;
    m.userData.base = m.position.y;
    m.userData.ph = R() * 6;
    g.add(m);
    mirrors.push(m);
    colliders.push({ x, z, r: 0.9, top: y + h + 0.6 });
  }
  // The floating grove: pale trees on a drifting stone.
  const grove = new THREE.Group();
  const stone = new THREE.Mesh(new THREE.ConeGeometry(5, 4, 9), new THREE.MeshStandardMaterial({ color: "#8e98aa", roughness: 0.95, flatShading: true }));
  stone.rotation.x = Math.PI;
  grove.add(stone);
  const treeMat = new THREE.MeshStandardMaterial({ color: "#c9d6e6", roughness: 0.7, emissive: "#8fb4ff", emissiveIntensity: 0.12, flatShading: true });
  for (let i = 0; i < 9; i++) {
    const t = new THREE.Mesh(new THREE.ConeGeometry(0.6 + R() * 0.5, 3 + R() * 3, 6), treeMat);
    const a = R() * Math.PI * 2, r = R() * 3.6;
    t.position.set(Math.cos(a) * r, 2 + R(), Math.sin(a) * r);
    t.castShadow = true;
    grove.add(t);
  }
  grove.position.set(isl.x + 6, heightAt(isl.x, isl.z) + 14, isl.z + 4);
  g.add(grove);
  const groveY = grove.position.y;
  return {
    update(t, reduced) {
      const k = reduced ? 0.25 : 1;
      for (const m of mirrors) m.position.y = m.userData.base + Math.sin(t * 0.4 * k + m.userData.ph) * 0.25;
      grove.position.y = groveY + Math.sin(t * 0.18 * k) * 0.8;
      grove.rotation.y = t * 0.02 * k;
    },
  };
}

/** Body: a falling stream from the high ground, and fitted standing stones on the terraces. */
function body(isl: Island, g: THREE.Group): Animated {
  const R = rng(11);
  const stoneMat = new THREE.MeshStandardMaterial({ color: "#8a5a3c", roughness: 0.9, flatShading: true });
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + R() * 0.3;
    const r = isl.radius * (0.35 + R() * 0.2);
    const x = isl.x + Math.cos(a) * r, z = isl.z + Math.sin(a) * r;
    const y = heightAt(x, z);
    if (y < 0.5) continue;
    const h = 1.8 + R() * 2;
    const s = new THREE.Mesh(new THREE.BoxGeometry(0.9 + R() * 0.5, h, 0.7 + R() * 0.4), stoneMat);
    s.position.set(x, y + h / 2 - 0.1, z);
    s.rotation.y = R() * 3;
    s.castShadow = s.receiveShadow = true;
    g.add(s);
    colliders.push({ x, z, r: 0.7, top: y + h });
  }
  // Waterfall: a ribbon of animated light-water down the southern face.
  const fx = isl.x - 4, fz = isl.z + isl.radius * 0.28;
  const top = heightAt(fx, fz - 3) + 6;
  const fallMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    uniforms: { uT: { value: 0 } },
    vertexShader: `varying vec2 vU;void main(){vU=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
    fragmentShader: `varying vec2 vU;uniform float uT;
      float h(float x){return fract(sin(x*91.7)*437.5);}
      void main(){float col=floor(vU.x*28.0);float s=fract(vU.y*3.0+uT*(0.9+h(col)*0.8)+h(col+3.0));
        float streak=smoothstep(0.0,0.3,s)*smoothstep(1.0,0.5,s);float edge=sin(vU.x*3.14159);
        float a=streak*edge*(0.35+0.65*vU.y)*0.55;gl_FragColor=vec4(vec3(0.85,0.95,1.0)*a,1.0);}`,
  });
  const fall = new THREE.Mesh(new THREE.PlaneGeometry(3.2, top + 1, 1, 1), fallMat);
  fall.position.set(fx, top / 2 - 0.5, fz);
  g.add(fall);
  return {
    update(t, reduced) {
      fallMat.uniforms.uT.value = reduced ? t * 0.3 : t;
    },
  };
}

/** Spirit: a ring of crystal spires around a high, open plateau. */
function spirit(isl: Island, g: THREE.Group): Animated {
  const R = rng(19);
  const mat = new THREE.MeshStandardMaterial({
    color: "#b8a6ff", emissive: "#8c6cff", emissiveIntensity: 0.35, metalness: 0.2, roughness: 0.15,
    transparent: true, opacity: 0.88, flatShading: true,
  });
  const gold = new THREE.MeshStandardMaterial({ color: "#e6c27a", emissive: "#e6b25a", emissiveIntensity: 0.6, metalness: 1, roughness: 0.3 });
  const spires: THREE.Mesh[] = [];
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    const r = isl.radius * 0.42;
    const x = isl.x + Math.cos(a) * r, z = isl.z + Math.sin(a) * r;
    const y = heightAt(x, z);
    const h = 5 + R() * 7;
    const s = new THREE.Mesh(new THREE.CylinderGeometry(0, 0.8 + R() * 0.4, h, 6), mat);
    s.position.set(x, y + h / 2 - 0.3, z);
    s.rotation.z = (R() - 0.5) * 0.15;
    s.castShadow = true;
    g.add(s);
    spires.push(s);
    colliders.push({ x, z, r: 1.0, top: y + h });
  }
  // A small gold ring floating at the centre: the plateau's heart (a station later).
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.6, 0.06, 12, 80), gold);
  ring.position.set(isl.x, heightAt(isl.x, isl.z) + 4, isl.z);
  g.add(ring);
  return {
    update(t, reduced) {
      const k = reduced ? 0.2 : 1;
      ring.rotation.y = t * 0.2 * k;
      ring.rotation.x = Math.sin(t * 0.13 * k) * 0.4;
      mat.emissiveIntensity = 0.3 + 0.1 * Math.sin(t * 0.7);
    },
  };
}
