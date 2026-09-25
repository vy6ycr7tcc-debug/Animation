/* Stillness. When the wanderer stops and stays still, it turns inward: head bowed, hands
   together before the heart (wanderer.ts). Then:
   1. Its aura breathes out as a luminous gas: soft veils of light that billow, swirl and rise
      around the body. No shell or edge; it thins into the night like mist.
   2. Streams of light arrive, painted: brush-strokes that wind in from everything around (trees,
      crystals, the archetypes) toward the heart, and others that flow out from it into the
      world. Each stroke travels along its path the way paint travels along a brush.
   3. Then everything connects to everything: strokes weave between the things themselves, and
      the network of roots under the ground lights up.
   The moment the wanderer moves, it all dissolves. */
import * as THREE from "three";

const SEG = 28;
interface Stroke {
  pts: THREE.Vector3[]; // control points of a winding path
  delay: number; // seconds after stillness begins
  kind: 0 | 1 | 2; // 0: in toward the heart; 1: out from it; 2: between the things themselves
  hue: number;
}

export class Communion {
  group = new THREE.Group();
  private gas: THREE.Points;
  private gasMat: THREE.ShaderMaterial;
  private strokes: THREE.Mesh;
  private uni = { uT: { value: 0 }, uAge: { value: 0 }, uK: { value: 0 }, uOpen: { value: 0 }, uHeart: { value: new THREE.Vector3() }, uPx: { value: 600 } };
  private built = false;
  private age = 0;

  constructor(gasCount = 260) {
    // the gas: many large, soft puffs, each drifting on its own slow spiral around the body
    const seed = new Float32Array(gasCount * 4);
    for (let i = 0; i < gasCount; i++) seed.set([Math.random(), Math.random(), Math.random(), Math.random()], i * 4);
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(gasCount * 3), 3));
    g.setAttribute("aSeed", new THREE.BufferAttribute(seed, 4));
    this.gasMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: this.uni,
      vertexShader: /* glsl */ `
        attribute vec4 aSeed;uniform float uT,uK,uOpen,uPx;uniform vec3 uHeart;
        varying float vA;varying vec3 vC;varying vec2 vSeed;
        void main(){
          // a life cycle: born near the body, billowing outward and upward, fading away
          float life=fract(uT*(0.05+aSeed.w*0.05)+aSeed.x);
          float ang=aSeed.y*6.2832+uT*(0.15+aSeed.z*0.2)*(aSeed.w>0.5?1.0:-1.0)+life*2.0;
          float r=(0.25+life*(0.8+aSeed.z*2.2))*(0.35+0.65*uOpen);
          float y=(aSeed.z-0.45)*1.6+life*(1.2+aSeed.y*1.4)*uOpen;
          vec3 p=uHeart+vec3(cos(ang)*r,y,sin(ang)*r*0.85);
          p.x+=sin(uT*0.7+aSeed.x*20.0+p.y)*0.25*life;
          vec4 mv=viewMatrix*vec4(p,1.0);gl_Position=projectionMatrix*mv;
          float size=(0.5+aSeed.w*1.2)*(0.6+life*1.4);
          gl_PointSize=clamp(size*uPx/max(-mv.z,0.5),2.0,420.0);
          vA=sin(life*3.14159)*uK*(0.012+0.02*aSeed.x);
          vC=mix(mix(vec3(1.0,0.7,0.4),vec3(0.85,0.55,1.0),smoothstep(0.45,0.8,aSeed.y)),vec3(0.45,0.75,1.0),smoothstep(0.7,1.0,aSeed.z));
          vSeed=aSeed.xy;
        }`,
      fragmentShader: /* glsl */ `
        varying float vA;varying vec3 vC;varying vec2 vSeed;uniform float uT;
        float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
        float n(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y);}
        void main(){
          vec2 q=gl_PointCoord-0.5;float r=length(q)*2.0;
          // wisps: the puff is torn by noise that slowly curls, so it reads as gas, not a ball
          vec2 w=q*3.0+vSeed*17.0;
          float f=n(w+vec2(uT*0.12,0.0))*0.6+n(w*2.3-vec2(0.0,uT*0.2))*0.4;
          // thin, torn veils: most of the puff is empty, only curling filaments carry light
          float a=smoothstep(1.0,0.3,r)*smoothstep(0.5,0.8,f+0.15*(1.0-r));
          gl_FragColor=vec4(vC*a*vA,1.0);
        }`,
    });
    this.gas = new THREE.Points(g, this.gasMat);
    this.gas.frustumCulled = false;
    this.gas.renderOrder = 11;

    this.strokes = new THREE.Mesh(
      new THREE.BufferGeometry(),
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        uniforms: this.uni,
        vertexShader: /* glsl */ `
          attribute vec3 aTan;attribute vec4 aInfo; // side (-1..1), u along (0..1), delay, kind
          attribute vec2 aStyle; // hue, width
          uniform float uT;varying vec2 vUv;varying float vKind;varying float vDelay;varying vec2 vStyle;varying float vCam;
          void main(){
            vec3 side=normalize(cross(aTan,cameraPosition-position));
            // a brush's pressure: it swells in the middle and lifts off at both ends, unevenly
            float press=pow(sin(aInfo.y*3.14159),0.6)*(0.75+0.25*sin(aInfo.y*9.0+aStyle.x*30.0));
            vec3 p=position+side*aInfo.x*aStyle.y*press;
            vCam=distance(position,cameraPosition);
            vUv=vec2(aInfo.x,aInfo.y);vKind=aInfo.w;vDelay=aInfo.z;vStyle=aStyle;
            gl_Position=projectionMatrix*viewMatrix*vec4(p,1.0);
          }`,
        fragmentShader: /* glsl */ `
          varying vec2 vUv;varying float vKind;varying float vDelay;varying vec2 vStyle;varying float vCam;uniform float uT,uAge,uK;
          float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
          float n(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y);}
          void main(){
            float grow=clamp((uAge-vDelay)/1.6,0.0,1.0);
            float u=vKind<0.5||vKind>1.5?vUv.y:1.0-vUv.y; // "in" strokes travel toward the heart, "out" ones away
            if(u>grow)discard;
            // the paint travels: a loaded stretch of the brush moving along the stroke, again and again
            float speed=0.16+vStyle.x*0.1;
            float head=fract(uT*speed+vStyle.x*7.0);
            float dd=fract(head-u+1.0);
            // two or three loaded streaks travel along each stroke; between them, only a faint trail
            float load=exp(-dd*6.0)*smoothstep(0.0,0.04,dd)+exp(-fract(dd+0.47)*8.0)*0.5*smoothstep(0.0,0.04,fract(dd+0.47));
            // bristles: fine streaks along the stroke, and a dry, ragged edge
            float across=vUv.x;
            float bristle=n(vec2(across*9.0+vStyle.x*40.0,u*2.5))*0.6+n(vec2(across*23.0,u*6.0-uT*0.4))*0.4;
            float edge=1.0-smoothstep(0.55,1.0,abs(across)+(bristle-0.5)*0.6);
            float dry=smoothstep(0.35,0.75,bristle+load*0.25);
            vec3 c=0.5+0.5*cos(6.2832*(vStyle.x+vec3(0.0,0.12,0.3)));   // each stroke its own hue
            c=mix(c,vec3(1.0,0.85,0.6),0.45)+vec3(0.15)*load;
            float a=edge*dry*(0.035+load*0.8)*uK;
            a*=smoothstep(3.0,11.0,vCam); // never a stroke across the lens
            gl_FragColor=vec4(c*a,1.0);
          }`,
      }),
    );
    this.strokes.frustumCulled = false;
    this.strokes.renderOrder = 11;
    this.group.add(this.gas, this.strokes);
    this.group.visible = false;
  }

  /** A winding path from a to b: it sways side to side and rises and dips, like a hand-drawn
      stroke, never a straight ray. */
  private path(a: THREE.Vector3, b: THREE.Vector3, lift: number, wander: number): THREE.Vector3[] {
    const d = a.distanceTo(b);
    const dir = b.clone().sub(a).normalize();
    const side = new THREE.Vector3(-dir.z, 0, dir.x).normalize();
    const pts = [a.clone()];
    const n = 5;
    const phase = Math.random() * Math.PI * 2, sway = (0.18 + Math.random() * 0.2) * wander * d;
    for (let k = 1; k < n; k++) {
      const u = k / n;
      const p = a.clone().lerp(b, u);
      p.addScaledVector(side, Math.sin(u * Math.PI * 2 + phase) * sway * Math.sin(u * Math.PI));
      p.y += Math.sin(u * Math.PI) * (lift + d * 0.12) + Math.sin(u * Math.PI * 3 + phase) * d * 0.05;
      pts.push(p);
    }
    pts.push(b.clone());
    return pts;
  }

  private build(heart: THREE.Vector3, things: THREE.Vector3[]): void {
    const near = things
      .map((p) => [p, p.distanceTo(heart)] as const)
      .filter(([, d]) => d > 2 && d < 55)
      .sort((a, b) => a[1] - b[1])
      .slice(0, 12)
      .map(([p]) => p);
    const list: Stroke[] = [];
    near.forEach((p, i) => list.push({ pts: this.path(p, heart, 0.8, 0.9), delay: 1.0 + i * 0.14, kind: 0, hue: Math.random() }));
    // strokes flowing out from the heart into the open world, curling away
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + Math.random() * 0.4, r = 10 + Math.random() * 22;
      const end = heart.clone().add(new THREE.Vector3(Math.cos(a) * r, 2 + Math.random() * 7, Math.sin(a) * r));
      list.push({ pts: this.path(heart, end, 1.5, 1.4), delay: 1.8 + i * 0.18, kind: 1, hue: Math.random() });
    }
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
          list.push({ pts: this.path(p, near[j], 1, 1.1), delay: 1.0 + near.length * 0.14 + 0.8 + (i + n) * 0.09, kind: 2, hue: Math.random() });
        });
    });
    const pos: number[] = [], tan: number[] = [], info: number[] = [], style: number[] = [], idx: number[] = [];
    for (const s of list) {
      const curve = new THREE.CatmullRomCurve3(s.pts, false, "centripetal");
      const width = s.kind === 1 ? 0.13 : s.kind === 0 ? 0.16 : 0.1;
      const base = pos.length / 3;
      for (let k = 0; k <= SEG; k++) {
        const u = k / SEG;
        const p = curve.getPoint(u), t = curve.getTangent(u);
        for (const sd of [-1, 1]) {
          pos.push(p.x, p.y, p.z);
          tan.push(t.x, t.y, t.z);
          info.push(sd, u, s.delay, s.kind);
          style.push(s.hue, width);
        }
        if (k < SEG) {
          const v = base + k * 2;
          idx.push(v, v + 2, v + 1, v + 1, v + 2, v + 3);
        }
      }
    }
    const g = this.strokes.geometry;
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("aTan", new THREE.Float32BufferAttribute(tan, 3));
    g.setAttribute("aInfo", new THREE.Float32BufferAttribute(info, 4));
    g.setAttribute("aStyle", new THREE.Float32BufferAttribute(style, 2));
    g.setIndex(idx);
  }

  /** `k`: 0–1 stillness. `heart`: the wanderer's heart. `things`: what can be connected. */
  update(t: number, dt: number, k: number, heart: THREE.Vector3, _feet: THREE.Vector3, things: () => THREE.Vector3[], pxPerUnit = 600): void {
    this.group.visible = k > 0.002;
    this.uni.uT.value = t;
    this.uni.uK.value = k;
    this.uni.uPx.value = pxPerUnit;
    this.uni.uHeart.value.copy(heart);
    if (k > 0.05 && !this.built) {
      this.built = true;
      this.age = 0;
      this.build(heart.clone(), things());
    }
    if (k < 0.01) this.built = false;
    if (!this.group.visible) return;
    this.age += dt;
    this.uni.uAge.value = this.age;
    this.uni.uOpen.value = 1 - Math.exp(-this.age * 0.6);
  }
}
