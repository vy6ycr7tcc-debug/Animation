/* Milestone 1 test scene: one small floating island in the ether.
   Exercises what the real game will lean on: lit PBR materials (sandstone, gold, water),
   soft shadows, fog, GPU particles, emissive glow into bloom, and a small "opening"
   animation (disk ignites, wings unfold, a beam rises). Placeholder shapes, not final art. */
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

const PAL = {
  night: new THREE.Color("#060a18"),
  fog: new THREE.Color("#141c3a"),
  sand: new THREE.Color("#a88d64"),
  sandDark: new THREE.Color("#6f5a40"),
  rock: new THREE.Color("#2c2a3a"),
  gold: new THREE.Color("#e2b25a"),
  pearl: new THREE.Color("#ece8dc"),
  glass: new THREE.Color("#7fcfd0"),
  blush: new THREE.Color("#d6a2a6"),
};

function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface SceneQuality {
  shadowSize: number;
  particles: number;
}

export class TestScene {
  scene = new THREE.Scene();
  camera: THREE.PerspectiveCamera;
  sun: THREE.DirectionalLight;
  disk: THREE.Group;
  private diskFace: THREE.MeshStandardMaterial;
  private wings: THREE.Mesh[] = [];
  private beam: THREE.Mesh;
  private beamMat: THREE.ShaderMaterial;
  private water: THREE.Mesh;
  private sky: THREE.ShaderMaterial;
  private motes: THREE.Points;
  private motesMat: THREE.ShaderMaterial;
  private island: THREE.Group;
  private open = 0;
  private openTarget = 0;
  private openT = 0;

  // Camera orbit, eased toward the target values.
  yaw = 0.5;
  pitch = 0.2;
  dist = 17;
  private yawNow = 0.5;
  private pitchNow = 0.2;

  constructor(renderer: THREE.WebGLRenderer, q: SceneQuality) {
    const s = this.scene;
    s.background = PAL.night;
    s.fog = new THREE.FogExp2(PAL.fog, 0.022);

    // Soft image-based light so gold and water have something to reflect.
    const pmrem = new THREE.PMREMGenerator(renderer);
    s.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    s.environmentIntensity = 0.25;
    pmrem.dispose();

    this.camera = new THREE.PerspectiveCamera(55, 1, 0.1, 400);

    // Sky dome with nebula and twinkling stars (ported from the prototype's sky shader).
    this.sky = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: { uT: { value: 0 } },
      vertexShader: `varying vec3 vD;void main(){vD=position;vec4 p=projectionMatrix*modelViewMatrix*vec4(position,1.0);gl_Position=p.xyww;}`,
      fragmentShader: `precision highp float;varying vec3 vD;uniform float uT;
        float h3(vec3 p){return fract(sin(dot(p,vec3(12.9898,78.233,37.719)))*43758.5453);}
        void main(){vec3 d=normalize(vD);float y=d.y;
          vec3 top=vec3(0.02,0.03,0.09),mid=vec3(0.07,0.09,0.22),hor=vec3(0.16,0.20,0.36),low=vec3(0.015,0.02,0.05);
          vec3 c=y>0.0?mix(hor,mix(mid,top,smoothstep(0.25,0.9,y)),smoothstep(0.0,0.25,y)):mix(hor,low,smoothstep(0.0,-0.35,y));
          float neb=sin(d.x*3.1+sin(d.y*4.3+uT*0.01))*sin(d.z*2.7+d.y*3.0)+0.6*sin(d.x*7.0+d.z*5.0);
          c+=vec3(0.30,0.14,0.26)*smoothstep(0.6,1.4,neb)*0.22*smoothstep(-0.1,0.5,y);
          c+=vec3(0.10,0.32,0.34)*smoothstep(0.7,1.5,-neb)*0.16*smoothstep(-0.1,0.6,y);
          c+=vec3(0.95,0.72,0.45)*pow(max(0.0,1.0-abs(y)*9.0),3.0)*0.10;
          vec3 q=d*220.0;vec3 cell=floor(q);float h=h3(cell);vec3 f=fract(q)-0.5;
          float star=step(0.992,h)*smoothstep(0.22,0.0,length(f))*(0.6+0.4*sin(uT*(1.0+h*3.0)+h*50.0));
          c+=vec3(0.95,0.92,1.0)*star*smoothstep(-0.05,0.15,y)*1.6;
          gl_FragColor=vec4(c*0.8,1.0);}`,
    });
    const skyMesh = new THREE.Mesh(new THREE.SphereGeometry(300, 32, 16), this.sky);
    skyMesh.frustumCulled = false;
    skyMesh.renderOrder = -1;
    s.add(skyMesh);

    // Lights: a warm low sun for shadows, a cool fill from the sky.
    s.add(new THREE.HemisphereLight(0x3a4c8c, 0x120e18, 0.55));
    this.sun = new THREE.DirectionalLight(0xffd6a0, 1.7);
    this.sun.position.set(-12, 16, 8);
    this.sun.castShadow = true;
    const sc = this.sun.shadow.camera;
    sc.left = -10; sc.right = 10; sc.top = 10; sc.bottom = -10; sc.near = 1; sc.far = 50;
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.03;
    this.sun.shadow.radius = 4;
    s.add(this.sun);
    this.setShadowSize(q.shadowSize);

    this.island = new THREE.Group();
    s.add(this.island);
    this.buildIsland();

    // The lotus pool.
    this.water = new THREE.Mesh(
      new THREE.CircleGeometry(1.6, 48),
      new THREE.MeshStandardMaterial({ color: 0x0b1e33, roughness: 0.08, metalness: 0.6, envMapIntensity: 1.4 }),
    );
    this.water.rotation.x = -Math.PI / 2;
    this.water.position.set(4.1, 0.06, 1.0);
    this.water.receiveShadow = true;
    this.island.add(this.water);

    // The place: a gold disk that ignites, wings that unfold, a beam that rises.
    this.disk = new THREE.Group();
    this.disk.position.set(0, 5.9, -3.2); // the winged disk over the pylon gate
    const gold = new THREE.MeshStandardMaterial({ color: PAL.gold, metalness: 1, roughness: 0.28 });
    const rim = new THREE.Mesh(new THREE.TorusGeometry(1.0, 0.09, 16, 64), gold);
    rim.castShadow = true;
    this.diskFace = new THREE.MeshStandardMaterial({
      color: 0x2a1c08, emissive: PAL.gold, emissiveIntensity: 0.15, metalness: 0.4, roughness: 0.5,
    });
    const face = new THREE.Mesh(new THREE.CircleGeometry(0.93, 48), this.diskFace);
    const back = face.clone();
    back.rotation.y = Math.PI;
    this.disk.add(rim, face, back);
    const wingShape = new THREE.Shape();
    wingShape.moveTo(0, 0);
    wingShape.bezierCurveTo(1.2, 0.5, 2.4, 0.55, 3.2, 0.25);
    wingShape.lineTo(2.9, 0.05);
    wingShape.lineTo(3.0, -0.15);
    wingShape.lineTo(2.5, -0.25);
    wingShape.lineTo(2.6, -0.45);
    wingShape.bezierCurveTo(1.6, -0.5, 0.8, -0.35, 0, -0.15);
    const wingGeo = new THREE.ShapeGeometry(wingShape, 12);
    const wingMat = new THREE.MeshStandardMaterial({
      color: PAL.gold, emissive: PAL.gold, emissiveIntensity: 0.3, metalness: 0.9, roughness: 0.3, side: THREE.DoubleSide,
    });
    for (const side of [1, -1]) {
      const w = new THREE.Mesh(wingGeo, wingMat);
      w.scale.set(side * 0.001, 1, 1);
      w.position.set(side * 0.95, 0.05, 0);
      w.castShadow = true;
      this.wings.push(w);
      this.disk.add(w);
    }
    this.island.add(this.disk);

    this.beamMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uA: { value: 0 }, uT: { value: 0 } },
      vertexShader: `varying vec2 vU;void main(){vU=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
      fragmentShader: `varying vec2 vU;uniform float uA,uT;void main(){
        float edge=pow(sin(vU.x*3.14159),6.0);float up=(1.0-smoothstep(uA*1.05-0.25,uA*1.05,vU.y))*smoothstep(0.0,0.08,vU.y)*(1.0-vU.y*0.6);
        float ripple=0.85+0.15*sin(vU.y*40.0-uT*3.0);gl_FragColor=vec4(vec3(1.0,0.82,0.5)*edge*up*ripple*1.6,1.0);}`,
    });
    this.beam = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.55, 30, 24, 1, true), this.beamMat);
    this.beam.position.set(0, 5.9 + 15, -3.2);
    this.beam.visible = false;
    this.island.add(this.beam);

    // Motes drifting in the ether (GPU-animated points).
    this.motesMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uT: { value: 0 }, uDpr: { value: 1 } },
      vertexShader: `attribute float aK;uniform float uT,uDpr;varying float vA;varying float vK;
        void main(){vec3 p=position+vec3(sin(uT*0.13+aK*9.0),sin(uT*0.21+aK*4.0)*0.8,cos(uT*0.11+aK*7.0))*1.4;
          vec4 mv=modelViewMatrix*vec4(p,1.0);float d=-mv.z;gl_Position=projectionMatrix*mv;
          gl_PointSize=clamp((1.2+aK*2.4)*uDpr*18.0/d,1.0,7.0*uDpr);
          vA=(1.0-smoothstep(40.0,110.0,d))*smoothstep(0.5,3.0,d)*(0.35+0.65*aK)*(0.6+0.4*sin(uT*2.0+aK*40.0));vK=aK;}`,
      fragmentShader: `varying float vA;varying float vK;void main(){float r=length(gl_PointCoord-0.5);float a=smoothstep(0.5,0.0,r)*vA;
        vec3 c=mix(vec3(0.95,0.92,0.86),vec3(1.0,0.75,0.4),step(0.8,vK));gl_FragColor=vec4(c*a,1.0);}`,
    });
    this.motes = new THREE.Points(new THREE.BufferGeometry(), this.motesMat);
    this.motes.frustumCulled = false;
    s.add(this.motes);
    this.setParticles(q.particles);
  }

  private buildIsland(): void {
    const R = rng(21);
    const sand = new THREE.MeshStandardMaterial({ color: PAL.sand, roughness: 0.9, flatShading: true });
    const sandDark = new THREE.MeshStandardMaterial({ color: PAL.sandDark, roughness: 0.95, flatShading: true });
    const rock = new THREE.MeshStandardMaterial({ color: PAL.rock, roughness: 1, flatShading: true });

    // Underside: an inverted, jagged cone of rock.
    const under = new THREE.ConeGeometry(7, 9, 14, 5, true);
    const pos = under.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      if (y < 4.4) {
        const k = 0.75 + R() * 0.5;
        pos.setX(i, pos.getX(i) * k);
        pos.setZ(i, pos.getZ(i) * k);
        pos.setY(i, y + (R() - 0.5) * 0.8);
      }
    }
    under.computeVertexNormals();
    const underMesh = new THREE.Mesh(under, rock);
    underMesh.rotation.x = Math.PI;
    underMesh.position.y = -4.5;
    this.island.add(underMesh);

    // Top: a sandstone plateau.
    const top = new THREE.Mesh(new THREE.CylinderGeometry(7, 7.05, 0.5, 14), sand);
    top.position.y = -0.25;
    top.receiveShadow = true;
    this.island.add(top);

    // A pylon gate: two battered towers, and a lintel.
    const tower = new THREE.CylinderGeometry(0.9 / Math.SQRT2, 1.3 / Math.SQRT2, 5, 4, 1);
    tower.rotateY(Math.PI / 4);
    for (const x of [-1.9, 1.9]) {
      const t = new THREE.Mesh(tower, sand);
      t.scale.set(1.4, 1, 0.8);
      t.position.set(x, 2.5, -3.2);
      t.castShadow = t.receiveShadow = true;
      this.island.add(t);
    }
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.5, 0.9), sandDark);
    lintel.position.set(0, 3.9, -3.2);
    lintel.castShadow = lintel.receiveShadow = true;
    this.island.add(lintel);

    // An obelisk over the pool.
    const ob = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.3, 4.2, 4), sand);
    ob.rotation.y = Math.PI / 4;
    ob.position.set(4.8, 2.1, -0.9);
    ob.castShadow = ob.receiveShadow = true;
    const tip = new THREE.Mesh(
      new THREE.ConeGeometry(0.22, 0.45, 4),
      new THREE.MeshStandardMaterial({ color: PAL.gold, metalness: 1, roughness: 0.25 }),
    );
    tip.rotation.y = Math.PI / 4;
    tip.position.set(4.8, 4.42, -0.9);
    this.island.add(ob, tip);

    // A short avenue of low plinths (stand-ins for the sphinxes).
    for (let i = 0; i < 4; i++) {
      for (const x of [-1.5, 1.5]) {
        const p = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.4, 0.9), sandDark);
        p.position.set(x, 0.2, 0.6 + i * 1.4);
        p.castShadow = p.receiveShadow = true;
        this.island.add(p);
      }
    }
  }

  setShadowSize(size: number): void {
    const sh = this.sun.shadow;
    if (sh.mapSize.x === size) return;
    sh.mapSize.set(size, size);
    sh.map?.dispose();
    sh.map = null;
  }

  setParticles(n: number): void {
    const R = rng(11);
    const p = new Float32Array(n * 3);
    const k = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const a = R() * Math.PI * 2;
      const r = 4 + Math.pow(R(), 0.6) * 45;
      p.set([Math.cos(a) * r, (R() - 0.35) * 30, Math.sin(a) * r], i * 3);
      k[i] = R();
    }
    const g = this.motes.geometry;
    g.setAttribute("position", new THREE.BufferAttribute(p, 3));
    g.setAttribute("aK", new THREE.BufferAttribute(k, 1));
  }

  setDpr(dpr: number): void {
    this.motesMat.uniforms.uDpr.value = dpr;
  }

  /** Toggle the disk open or closed. Returns true when it opens. */
  toggleOpen(): boolean {
    this.openTarget = this.openTarget ? 0 : 1;
    this.openT = 0;
    return this.openTarget === 1;
  }

  /** Screen-space hit test against the disk. */
  hitDisk(ndc: THREE.Vector2): boolean {
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, this.camera);
    const c = new THREE.Vector3();
    this.disk.getWorldPosition(c);
    return ray.ray.distanceSqToPoint(c) < 1.8 * 1.8;
  }

  update(t: number, dt: number, reduced: boolean): void {
    this.sky.uniforms.uT.value = t;
    this.motesMat.uniforms.uT.value = reduced ? t * 0.3 : t;
    this.beamMat.uniforms.uT.value = t;

    // Island breathes gently; the disk turns slowly toward the viewer.
    const bob = reduced ? 0 : Math.sin(t * 0.4) * 0.15;
    this.island.position.y = bob;
    if (!reduced) this.yaw += dt * 0.03;
    this.yawNow += (this.yaw - this.yawNow) * Math.min(1, dt * 3);
    this.pitchNow += (this.pitch - this.pitchNow) * Math.min(1, dt * 3);
    const cp = Math.cos(this.pitchNow);
    this.camera.position.set(Math.sin(this.yawNow) * cp * this.dist, 3 + Math.sin(this.pitchNow) * this.dist, Math.cos(this.yawNow) * cp * this.dist);
    this.camera.lookAt(0, 3, -0.8);
    this.disk.rotation.y = this.yawNow;

    // Opening: ignite → wings unfold → beam rises. Reduced motion shortens it to a fade.
    const rate = reduced ? 1.5 : 0.45;
    this.open += Math.sign(this.openTarget - this.open) * Math.min(Math.abs(this.openTarget - this.open), dt * rate);
    this.openT += dt;
    const o = this.open;
    const ease = (a: number, b: number) => THREE.MathUtils.smoothstep(o, a, b);
    this.diskFace.emissiveIntensity = 0.15 + ease(0, 0.35) * 5 + (o > 0.99 ? Math.sin(t * 1.3) * 0.4 : 0);
    const wing = reduced ? ease(0.1, 0.4) : ease(0.25, 0.7);
    this.wings.forEach((w, i) => {
      w.scale.x = (i === 0 ? 1 : -1) * Math.max(0.001, wing);
      w.rotation.z = (i === 0 ? 1 : -1) * (1 - wing) * -0.9;
    });
    const beam = ease(0.5, 1);
    this.beam.visible = beam > 0.001;
    this.beamMat.uniforms.uA.value = beam;
  }
}
