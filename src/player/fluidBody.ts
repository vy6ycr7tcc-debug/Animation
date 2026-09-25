/* The wanderer's body as one continuous fluid of light.
   The animated skeleton places ~20 tapered capsules along the bones; the shader ray-marches
   their smooth union (a signed distance field), so limbs melt into the torso with no joints
   or seams. Shading: a translucent core with rising currents, a luminous silhouette, a soft
   halo from near-misses, and whatever is below the water glows dimly through it. */
import * as THREE from "three";

export const SEGMENTS = 20;

const NOISE = /* glsl */ `
float h13(vec3 p){p=fract(p*0.3183099+0.1);p*=17.0;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}
float vnoise(vec3 x){vec3 i=floor(x);vec3 f=fract(x);f=f*f*(3.0-2.0*f);
  return mix(mix(mix(h13(i),h13(i+vec3(1,0,0)),f.x),mix(h13(i+vec3(0,1,0)),h13(i+vec3(1,1,0)),f.x),f.y),
             mix(mix(h13(i+vec3(0,0,1)),h13(i+vec3(1,0,1)),f.x),mix(h13(i+vec3(0,1,1)),h13(i+vec3(1,1,1)),f.x),f.y),f.z);}
`;

export class FluidBody {
  mesh: THREE.Mesh;
  readonly a: THREE.Vector3[] = [];
  readonly b: THREE.Vector3[] = [];
  readonly r: THREE.Vector2[] = [];
  private uniforms: Record<string, THREE.IUniform>;
  private box = new THREE.Box3();

  constructor(shared: { uT: THREE.IUniform; uForm: THREE.IUniform; uPulse: THREE.IUniform }) {
    for (let i = 0; i < SEGMENTS; i++) {
      this.a.push(new THREE.Vector3());
      this.b.push(new THREE.Vector3());
      this.r.push(new THREE.Vector2(0.001, 0.001));
    }
    this.uniforms = {
      ...shared,
      uA: { value: this.a },
      uB: { value: this.b },
      uR: { value: this.r },
      uBoxMin: { value: new THREE.Vector3() },
      uBoxMax: { value: new THREE.Vector3() },
      uRoot: { value: new THREE.Vector3() },
      uSteps: { value: 40 },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
      side: THREE.BackSide, // works with the camera inside the box too
      vertexShader: /* glsl */ `varying vec3 vW;void main(){vec4 w=modelMatrix*vec4(position,1.0);vW=w.xyz;gl_Position=projectionMatrix*viewMatrix*w;}`,
      fragmentShader: /* glsl */ `
        precision highp float;
        varying vec3 vW;
        uniform vec3 uA[${SEGMENTS}];
        uniform vec3 uB[${SEGMENTS}];
        uniform vec2 uR[${SEGMENTS}];
        uniform vec3 uBoxMin,uBoxMax,uRoot;
        uniform float uT,uForm,uPulse;
        uniform int uSteps;
        ${NOISE}
        float smin(float a,float b,float k){float h=max(k-abs(a-b),0.0)/k;return min(a,b)-h*h*k*0.25;}
        float cap(vec3 p,vec3 a,vec3 b,vec2 r){vec3 pa=p-a,ba=b-a;float h=clamp(dot(pa,ba)/max(dot(ba,ba),1e-6),0.0,1.0);return length(pa-ba*h)-mix(r.x,r.y,h);}
        float map(vec3 p){
          float d=1e5;
          for(int i=0;i<${SEGMENTS};i++){d=smin(d,cap(p,uA[i],uB[i],uR[i]),0.055);}
          // the surface breathes and ripples very slightly
          d-=0.006*(vnoise((p-uRoot)*14.0+vec3(0.0,-uT*1.2,uT*0.4))-0.5);
          return d;
        }
        vec3 normalAt(vec3 p){const vec2 e=vec2(0.0035,-0.0035);
          return normalize(e.xyy*map(p+e.xyy)+e.yyx*map(p+e.yyx)+e.yxy*map(p+e.yxy)+e.xxx*map(p+e.xxx));}
        vec2 boxHit(vec3 ro,vec3 rd){vec3 inv=1.0/rd;vec3 t0=(uBoxMin-ro)*inv,t1=(uBoxMax-ro)*inv;
          vec3 tn=min(t0,t1),tf=max(t0,t1);return vec2(max(max(tn.x,tn.y),tn.z),min(min(tf.x,tf.y),tf.z));}
        void main(){
          vec3 ro=cameraPosition;vec3 rd=normalize(vW-ro);
          vec2 tb=boxHit(ro,rd);
          if(tb.x>tb.y)discard;
          float t=max(tb.x,0.0);
          float glow=0.0;float hit=-1.0;
          for(int i=0;i<64;i++){
            if(i>=uSteps)break;
            vec3 p=ro+rd*t;
            float d=map(p);
            float under=(p.y<0.0&&ro.y>0.0)?0.3:1.0;          // seen through the water
            glow+=exp(-max(d,0.0)*22.0)*0.028*under;           // soft halo from near-misses
            if(d<0.0015){hit=t;break;}
            t+=max(d*0.9,0.004);
            if(t>tb.y)break;
          }
          vec3 gold=vec3(1.0,0.80,0.52),pearl=vec3(1.0,0.95,0.88),cyan=vec3(0.62,0.88,1.0);
          vec3 c=gold*glow*0.9;
          if(hit>0.0){
            vec3 p=ro+rd*hit;vec3 n=normalAt(p);
            float f=1.0-abs(dot(n,-rd));
            float rim=pow(f,2.2);
            vec3 q=(p-uRoot)*6.5+vec3(0.0,-uT*0.55,0.0);
            float n1=vnoise(q+vnoise(q*0.7+uT*0.1)*1.8);
            float lines=pow(1.0-abs(n1*2.0-1.0),8.0);            // fine currents rising through the body
            float n2=vnoise((p-uRoot)*2.5+vec3(0.0,-uT*0.25,0.0));
            float heart=exp(-pow(length(p-(uRoot+vec3(0.0,1.22,0.0)))*3.4,2.0));
            vec3 s=gold*(0.09+0.14*n2)+pearl*lines*0.6*(0.4+0.6*n2)+gold*heart*0.45+mix(pearl,cyan,0.5)*rim*1.15;
            if(p.y<0.0&&ro.y>0.0)s*=vec3(0.25,0.4,0.5);          // below the surface: dim and cool
            c+=s;
          }
          gl_FragColor=vec4(c*uForm*uPulse,1.0);
        }`,
    });
    this.mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 10;
  }

  setSteps(n: number): void {
    this.uniforms.uSteps.value = n;
  }

  /** Call after the segments are set: fits the ray-march box around them. */
  commit(root: THREE.Vector3): void {
    this.box.makeEmpty();
    for (let i = 0; i < SEGMENTS; i++) {
      this.box.expandByPoint(this.a[i]);
      this.box.expandByPoint(this.b[i]);
    }
    this.box.expandByScalar(0.32); // room for the radii and the halo
    this.uniforms.uBoxMin.value.copy(this.box.min);
    this.uniforms.uBoxMax.value.copy(this.box.max);
    this.uniforms.uRoot.value.copy(root);
    this.box.getCenter(this.mesh.position);
    this.box.getSize(this.mesh.scale);
    this.mesh.updateMatrixWorld();
  }
}
