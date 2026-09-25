/* Depth and atmosphere.
   - Mist: two slow layers drifting low over the water, thin near the viewer, gathering with
     distance so the far water softens into haze.
   - Horizon: two rings of far hills in silhouette, one nearer and darker, one farther and paler,
     so the eye reads distance in layers.
   (Fireflies gave way to the butterflies and lanterns in life.ts.) */
import * as THREE from "three";

const NOISE = /* glsl */ `
float h2(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float n2(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
  return mix(mix(h2(i),h2(i+vec2(1,0)),f.x),mix(h2(i+vec2(0,1)),h2(i+vec2(1,1)),f.x),f.y);}
float fbm(vec2 p){return n2(p)*0.5+n2(p*2.03+7.1)*0.3+n2(p*4.07-3.3)*0.2;}
`;

export class Mist {
  group = new THREE.Group();
  private mats: THREE.ShaderMaterial[] = [];
  constructor(color: THREE.Color) {
    for (const [y, a, s] of [[0.7, 0.16, 0.018], [2.4, 0.1, 0.011]] as const) {
      const mat = new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        uniforms: { uT: { value: 0 }, uColor: { value: color }, uA: { value: a }, uS: { value: s } },
        vertexShader: `varying vec3 vW;void main(){vec4 w=modelMatrix*vec4(position,1.0);vW=w.xyz;gl_Position=projectionMatrix*viewMatrix*w;}`,
        fragmentShader: `varying vec3 vW;uniform float uT,uA,uS;uniform vec3 uColor;${NOISE}
          void main(){
            float d=distance(vW.xz,cameraPosition.xz);
            vec2 p=vW.xz*uS+vec2(uT*0.006,uT*0.004);
            float m=fbm(p+fbm(p*0.7+uT*0.003)*1.5);
            float dens=smoothstep(0.35,0.85,m);
            float near=smoothstep(6.0,40.0,d);
            float far=1.0-smoothstep(300.0,520.0,d);
            gl_FragColor=vec4(uColor,dens*near*far*uA);
          }`,
      });
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1100, 1100, 1, 1).rotateX(-Math.PI / 2), mat);
      m.position.y = y;
      m.frustumCulled = false;
      m.renderOrder = 2;
      this.group.add(m);
      this.mats.push(mat);
    }
  }
  update(t: number, cam: THREE.Vector3): void {
    for (const m of this.mats) m.uniforms.uT.value = t;
    this.group.position.set(Math.round(cam.x / 20) * 20, 0, Math.round(cam.z / 20) * 20);
  }
}

export function buildHorizon(): THREE.Group {
  const g = new THREE.Group();
  const layers: [number, number, THREE.Color, number][] = [
    [460, 22, new THREE.Color(0.016, 0.015, 0.042), 3],
    [700, 40, new THREE.Color(0.03, 0.026, 0.072), 11],
  ];
  for (const [radius, height, color, seed] of layers) {
    const N = 320;
    const pos: number[] = [];
    const uv: number[] = [];
    let s = seed;
    const R = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    const peaks = Array.from({ length: 9 }, () => [R() * Math.PI * 2, 0.08 + R() * 0.2, 0.4 + R() * 0.6] as const);
    for (let i = 0; i <= N; i++) {
      const a = (i / N) * Math.PI * 2;
      let h = 0.12;
      for (const [pa, w, k] of peaks) {
        const d = Math.atan2(Math.sin(a - pa), Math.cos(a - pa));
        h += k * Math.exp(-(d * d) / (w * w));
      }
      h += 0.06 * Math.sin(a * 23 + seed) + 0.04 * Math.sin(a * 57);
      const top = Math.max(0.05, h) * height;
      const x = Math.cos(a) * radius, z = Math.sin(a) * radius - 60;
      pos.push(x, -4, z, x, top, z);
      uv.push(i / N, 0, i / N, 1);
    }
    const idx: number[] = [];
    for (let i = 0; i < N; i++) {
      const k = i * 2;
      idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    const mat = new THREE.ShaderMaterial({
      fog: false,
      side: THREE.DoubleSide,
      uniforms: { uColor: { value: color } },
      vertexShader: `varying vec2 vU;void main(){vU=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
      fragmentShader: `varying vec2 vU;uniform vec3 uColor;void main(){
        // a faint rim of starlight along the ridgeline
        float rim=smoothstep(0.9,1.0,vU.y)*0.35;
        gl_FragColor=vec4(uColor*(1.0+rim),1.0);}`,
    });
    const m = new THREE.Mesh(geo, mat);
    m.frustumCulled = false;
    g.add(m);
  }
  return g;
}
