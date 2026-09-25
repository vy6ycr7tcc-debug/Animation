/* Stillness. When the wanderer stops and stays still, it turns inward: head bowed, hands
   together before the heart (wanderer.ts). Then:
   1. Its aura opens outward, and soft rings of light ripple over the ground.
   2. Streams of light arrive one by one from everything around (trees, crystals, the
      archetypes, the landmarks), each flowing in toward the heart.
   3. Then everything connects to everything: threads of light join each thing to its
      neighbours, and the network of roots under the ground lights up.
   The moment the wanderer moves, it all dissolves. */
import * as THREE from "three";

const SEG = 22;
interface Stream {
  a: THREE.Vector3; // where it comes from
  b: THREE.Vector3; // where it arrives
  delay: number; // seconds after stillness begins
  kind: 0 | 1; // 0: to the wanderer's heart; 1: between the things themselves
}

export class Communion {
  group = new THREE.Group();
  private aura: THREE.Mesh;
  private auraMat: THREE.ShaderMaterial;
  private rings: THREE.Mesh;
  private ringMat: THREE.ShaderMaterial;
  private streams: THREE.Mesh;
  private uni = { uT: { value: 0 }, uAge: { value: 0 }, uK: { value: 0 } };
  private built = false;
  private age = 0;

  constructor() {
    this.auraMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      uniforms: { uK: { value: 0 }, uT: this.uni.uT },
      vertexShader: /* glsl */ `varying vec3 vN;varying vec3 vV;varying vec3 vP;void main(){vec4 w=modelMatrix*vec4(position,1.0);
        vN=normalize(mat3(modelMatrix)*normal);vV=normalize(cameraPosition-w.xyz);vP=position;gl_Position=projectionMatrix*viewMatrix*w;}`,
      fragmentShader: /* glsl */ `varying vec3 vN;varying vec3 vV;varying vec3 vP;uniform float uK,uT;void main(){
        // no hard shell: a glow that is brightest at the heart and fades before its edge
        float f=1.0-abs(dot(normalize(vN),vV));
        float core=pow(1.0-f,3.0);
        float bands=0.7+0.3*sin(vP.y*9.0-uT*1.2+sin(vP.x*5.0+uT*0.5));
        gl_FragColor=vec4(vec3(1.0,0.85,0.6)*core*0.16*bands*uK,1.0);}`,
    });
    this.aura = new THREE.Mesh(new THREE.SphereGeometry(1, 40, 24), this.auraMat);
    this.aura.renderOrder = 11;
    this.ringMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uK: { value: 0 }, uT: this.uni.uT },
      vertexShader: /* glsl */ `varying vec2 vP;void main(){vP=position.xz;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
      fragmentShader: /* glsl */ `varying vec2 vP;uniform float uK,uT;void main(){
        float r=length(vP);
        float w=0.0;
        for(int i=0;i<3;i++){float front=mod(uT*1.6+float(i)*4.0,12.0);w+=exp(-pow((r-front)*2.5,2.0))*(1.0-front/12.0);}
        gl_FragColor=vec4(vec3(1.0,0.86,0.62)*w*0.45*uK*(1.0-smoothstep(9.0,12.0,r)),1.0);}`,
    });
    this.rings = new THREE.Mesh(new THREE.PlaneGeometry(24, 24).rotateX(-Math.PI / 2), this.ringMat);

    this.streams = new THREE.Mesh(
      new THREE.BufferGeometry(),
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        uniforms: this.uni,
        vertexShader: /* glsl */ `
          attribute vec3 aTan;attribute vec4 aInfo; // side, u (0 at the source, 1 at the arrival), delay, kind
          uniform float uAge;varying float vU;varying float vX;varying float vKind;varying float vGrow;
          void main(){
            float grow=clamp((uAge-aInfo.z)/1.4,0.0,1.0);
            vec3 side=normalize(cross(aTan,cameraPosition-position));
            float width=(aInfo.w<0.5?0.09:0.05)*(0.6+0.8*aInfo.y);
            vec3 p=position+side*aInfo.x*width;
            vU=aInfo.y;vX=aInfo.x;vKind=aInfo.w;vGrow=grow;
            gl_Position=projectionMatrix*viewMatrix*vec4(p,1.0);
          }`,
        fragmentShader: /* glsl */ `
          varying float vU;varying float vX;varying float vKind;varying float vGrow;uniform float uT,uK;
          void main(){
            if(vU>vGrow)discard; // each stream reaches out from its source until it arrives
            float across=exp(-vX*vX*3.0);
            float flow=pow(fract(vU*3.0-uT*0.55),6.0); // light travelling along it, inward
            float front=exp(-pow((vGrow-vU)*12.0,2.0))*step(vGrow,0.999);
            vec3 c=vKind<0.5?vec3(1.0,0.84,0.58):mix(vec3(0.62,0.72,1.0),vec3(0.95,0.7,1.0),vU);
            gl_FragColor=vec4(c*across*(0.45+flow*1.6+front*2.5)*uK,1.0);
          }`,
      }),
    );
    this.streams.frustumCulled = false;
    this.group.add(this.aura, this.rings, this.streams);
    this.group.visible = false;
  }

  private build(heart: THREE.Vector3, things: THREE.Vector3[]): void {
    const near = things
      .map((p) => [p, p.distanceTo(heart)] as const)
      .filter(([, d]) => d > 2 && d < 48)
      .sort((a, b) => a[1] - b[1])
      .slice(0, 22)
      .map(([p]) => p);
    const list: Stream[] = near.map((p, i) => ({ a: p, b: heart, delay: 1.0 + i * 0.15, kind: 0 }));
    const seen = new Set<string>();
    near.forEach((p, i) => {
      near
        .map((q, j) => [j, q.distanceTo(p)] as const)
        .filter(([j]) => j !== i)
        .sort((x, y) => x[1] - y[1])
        .slice(0, 2)
        .forEach(([j], n) => {
          const key = i < j ? `${i}-${j}` : `${j}-${i}`;
          if (seen.has(key)) return;
          seen.add(key);
          list.push({ a: p, b: near[j], delay: 1.0 + near.length * 0.15 + 0.5 + (i + n) * 0.08, kind: 1 });
        });
    });
    const pos: number[] = [], tan: number[] = [], info: number[] = [], idx: number[] = [];
    const up = new THREE.Vector3(0, 1, 0);
    for (const s of list) {
      // a gentle arc, higher for longer streams
      const mid = s.a.clone().lerp(s.b, 0.5).addScaledVector(up, 1 + s.a.distanceTo(s.b) * 0.18);
      const curve = new THREE.QuadraticBezierCurve3(s.a, mid, s.b);
      const base = pos.length / 3;
      for (let k = 0; k <= SEG; k++) {
        const u = k / SEG;
        const p = curve.getPoint(u), t = curve.getTangent(u);
        for (const side of [-1, 1]) {
          pos.push(p.x, p.y, p.z);
          tan.push(t.x, t.y, t.z);
          info.push(side, u, s.delay, s.kind);
        }
        if (k < SEG) {
          const v = base + k * 2;
          idx.push(v, v + 2, v + 1, v + 1, v + 2, v + 3);
        }
      }
    }
    const g = this.streams.geometry;
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("aTan", new THREE.Float32BufferAttribute(tan, 3));
    g.setAttribute("aInfo", new THREE.Float32BufferAttribute(info, 4));
    g.setIndex(idx);
  }

  /** `k`: 0–1 stillness. `heart`: the wanderer's heart. `things`: what can be connected. */
  update(t: number, dt: number, k: number, heart: THREE.Vector3, feet: THREE.Vector3, things: () => THREE.Vector3[]): void {
    this.group.visible = k > 0.002;
    this.uni.uT.value = t;
    this.uni.uK.value = k;
    if (k > 0.05 && !this.built) {
      this.built = true;
      this.age = 0;
      this.build(heart.clone(), things());
    }
    if (k < 0.01) this.built = false;
    if (!this.group.visible) return;
    this.age += dt;
    this.uni.uAge.value = this.age;
    // the aura opens over a few seconds, then breathes
    const open = 1 - Math.exp(-this.age * 0.9);
    const r = 0.7 + open * 3.2 + Math.sin(t * 0.8) * 0.15 * open;
    this.aura.position.copy(heart);
    this.aura.scale.setScalar(r);
    this.auraMat.uniforms.uK.value = k * (0.4 + 0.6 * open);
    this.rings.position.set(feet.x, feet.y + 0.06, feet.z);
    this.ringMat.uniforms.uK.value = k * Math.min(1, this.age * 0.5);
  }
}
