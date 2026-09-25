/* Etched light: the ink drawings' linework carried into 3D.
   - contourMaterial: terrain whose height contours glow as fine, slightly wandering lines.
   - buildMandala: hand-drawn line geometry on the central platform (seven-fold, one ring per island). */
import * as THREE from "three";
import { surface } from "./textures";

/** Stillness before a rock or crystal: it vibrates light outward (waves over its surface). */
export const vibeUniforms = {
  uVibePos: { value: new THREE.Vector3(0, -1e4, 0) },
  uVibeK: { value: 0 },
  uVibeR: { value: 1 },
};

export const etchUniforms = {
  uEtchT: { value: 0 },
  uEtchGain: { value: 1 }, // raised as the world brightens with progress
};

export function contourMaterial(lineColor: string, spacing: number): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 });
  const line = new THREE.Color(lineColor);
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uEtchT = etchUniforms.uEtchT;
    sh.uniforms.uEtchGain = etchUniforms.uEtchGain;
    sh.uniforms.uLine = { value: line };
    sh.uniforms.uSpacing = { value: spacing };
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vEtchW;")
      .replace("#include <project_vertex>", "#include <project_vertex>\nvEtchW=(modelMatrix*vec4(transformed,1.0)).xyz;");
    sh.fragmentShader = sh.fragmentShader
      .replace(
        "#include <common>",
        "#include <common>\nvarying vec3 vEtchW;uniform vec3 uLine;uniform float uSpacing,uEtchT,uEtchGain;",
      )
      .replace(
        "#include <emissivemap_fragment>",
        `#include <emissivemap_fragment>
        {
          // Contours with a hand-drawn wander; they breathe very slowly.
          float wob=sin(vEtchW.x*0.37+vEtchW.z*0.21)*0.18+sin(vEtchW.z*0.83-vEtchW.x*0.11)*0.07;
          float f=(vEtchW.y+wob)/uSpacing;
          float w=fwidth(f);
          float dd=abs(fract(f+0.5)-0.5);
          float ln=1.0-smoothstep(w*0.35,w*1.1,dd);
          float above=smoothstep(0.15,0.6,vEtchW.y);
          float dist=length(vEtchW-cameraPosition);
          float fade=1.0-smoothstep(45.0,140.0,dist);
          float breathe=0.8+0.2*sin(uEtchT*0.5+vEtchW.y*0.4);
          totalEmissiveRadiance+=uLine*ln*above*fade*breathe*0.42*uEtchGain;
        }`,
      );
  };
  return m;
}

/** Seeded wobble so repeated shapes never match exactly, like a pen. */
function rng(seed: number) {
  return () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
}

export function buildMandala(): THREE.Group {
  const R = rng(7);
  const pts: number[] = [];
  const cols: number[] = [];
  const gold = new THREE.Color(2.2, 1.6, 0.9);
  const pearl = new THREE.Color(1.6, 1.5, 1.35);
  const add = (a: THREE.Vector2Like, b: THREE.Vector2Like, c: THREE.Color) => {
    pts.push(a.x, 0, a.y, b.x, 0, b.y);
    cols.push(c.r, c.g, c.b, c.r, c.g, c.b);
  };
  const polyline = (p: THREE.Vector2[], c: THREE.Color) => {
    for (let i = 0; i < p.length - 1; i++) add(p[i], p[i + 1], c);
  };
  const wob = (amt: number) => (R() - 0.5) * amt;
  const circle = (cx: number, cy: number, r: number, c: THREE.Color, n = 90, from = 0, to = 1) => {
    const p: THREE.Vector2[] = [];
    const ph = R() * 6.28;
    for (let k = 0; k <= n; k++) {
      const a = (from + (to - from) * (k / n)) * Math.PI * 2;
      const rr = r * (1 + 0.012 * Math.sin(a * 3 + ph));
      p.push(new THREE.Vector2(cx + rr * Math.cos(a), cy + rr * Math.sin(a)));
    }
    polyline(p, c);
  };

  // Three rings: one for each island, never quite closed.
  circle(0, 0, 7.8, pearl, 140, 0.02, 0.98);
  circle(0, 0, 5.6, gold, 120, 0.51, 1.49);
  circle(0, 0, 3.4, pearl, 90, 0.27, 1.23);
  // Seven stations around each ring, each a small circle with a centre point.
  for (const [r, c, off] of [[7.8, pearl, 0], [5.6, gold, 0.22], [3.4, pearl, 0.44]] as const) {
    for (let k = 0; k < 7; k++) {
      const a = (k / 7) * Math.PI * 2 + off - Math.PI / 2;
      const x = r * Math.cos(a), y = r * Math.sin(a);
      circle(x, y, 0.32 + wob(0.05), c, 24);
      circle(x, y, 0.05, c, 8);
    }
  }
  // Spokes that stitch the rings together.
  for (let k = 0; k < 7; k++) {
    const a0 = (k / 7) * Math.PI * 2 - Math.PI / 2;
    const a1 = a0 + 0.22;
    const a2 = a0 + 0.44;
    add(new THREE.Vector2(7.8 * Math.cos(a0), 7.8 * Math.sin(a0)), new THREE.Vector2(5.6 * Math.cos(a1), 5.6 * Math.sin(a1)), pearl);
    add(new THREE.Vector2(5.6 * Math.cos(a1), 5.6 * Math.sin(a1)), new THREE.Vector2(3.4 * Math.cos(a2), 3.4 * Math.sin(a2)), gold);
  }
  // A spiral at the centre, the recurring motif of the drawings.
  const sp: THREE.Vector2[] = [];
  for (let k = 0; k <= 160; k++) {
    const u = k / 160;
    const a = u * Math.PI * 2 * 3.2;
    const r = 0.1 + u * 1.9;
    sp.push(new THREE.Vector2(r * Math.cos(a) + wob(0.03), r * Math.sin(a) + wob(0.03)));
  }
  polyline(sp, gold);

  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(cols, 3));
  const mat = new THREE.LineBasicMaterial({
    vertexColors: true, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const lines = new THREE.LineSegments(g, mat);
  const group = new THREE.Group();
  group.add(lines);
  return group;
}

/** Dark stone etched with fine gold sacred-geometry linework: a triangular lattice with
    circles around its nodes, hand-wobbled, projected onto whichever faces it covers. */
export function etchedStone(color = "#1c1a2c", line = "#e9c37d", scale = 2.2, opts: { triplanar?: boolean } = {}): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ color, roughness: 0.78, metalness: 0.05 });
  // real scanned rock, projected from three sides (so it never stretches), unless the mesh
  // brings its own maps
  const triplanar = opts.triplanar ?? true;
  const rock = surface("rock");
  const lineColor = new THREE.Color(line);
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uEtchT = etchUniforms.uEtchT;
    sh.uniforms.uEtchGain = etchUniforms.uEtchGain;
    sh.uniforms.uLine = { value: lineColor };
    sh.uniforms.uScale = { value: scale };
    sh.uniforms.tRockD = { value: rock.diff };
    Object.assign(sh.uniforms, vibeUniforms);
    sh.uniforms.tRockN = { value: rock.nor };
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vEW;varying vec3 vEN;")
      .replace(
        "#include <project_vertex>",
        `#include <project_vertex>
        mat4 eM=modelMatrix;
        #ifdef USE_INSTANCING
        eM=modelMatrix*instanceMatrix;
        #endif
        vEW=(eM*vec4(transformed,1.0)).xyz;vEN=normalize(mat3(eM)*objectNormal);`,
      );
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", `#include <common>
        varying vec3 vEW;varying vec3 vEN;uniform vec3 uLine;uniform float uScale,uEtchT,uEtchGain;
        uniform sampler2D tRockD,tRockN;
        uniform vec3 uVibePos;uniform float uVibeK,uVibeR;
        vec3 triW(){vec3 w=pow(abs(vEN),vec3(4.0));return w/(w.x+w.y+w.z);}
        vec3 triTex(sampler2D t,float s){vec3 w=triW();
          return texture2D(t,vEW.zy/s).rgb*w.x+texture2D(t,vEW.xz/s).rgb*w.y+texture2D(t,vEW.xy/s).rgb*w.z;}
        float stoneH(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453);}
        float stoneN(vec3 x){vec3 i=floor(x),f=fract(x);f=f*f*(3.0-2.0*f);
          return mix(mix(mix(stoneH(i),stoneH(i+vec3(1,0,0)),f.x),mix(stoneH(i+vec3(0,1,0)),stoneH(i+vec3(1,1,0)),f.x),f.y),
                     mix(mix(stoneH(i+vec3(0,0,1)),stoneH(i+vec3(1,0,1)),f.x),mix(stoneH(i+vec3(0,1,1)),stoneH(i+vec3(1,1,1)),f.x),f.y),f.z);}
        float etchLines(vec2 p){
          p*=uScale;
          p+=0.05*vec2(sin(p.y*1.7),sin(p.x*1.3)); // the pen's wobble
          float l=0.0;
          for(int k=0;k<3;k++){
            float a=float(k)*1.0471976;vec2 d=vec2(cos(a),sin(a));
            float f=dot(p,d);float w=fwidth(f);
            l=max(l,1.0-smoothstep(w*0.3,w*1.0,abs(fract(f+0.5)-0.5)));
          }
          // circles around the lattice nodes
          vec2 g=vec2(p.x-p.y*0.57735,p.y*1.1547);vec2 c=floor(g+0.5);vec2 cc=vec2(c.x+c.y*0.5,c.y*0.866);
          float r=length(p-cc);float wr=fwidth(r);
          l=max(l,1.0-smoothstep(wr*0.3,wr*1.0,abs(r-0.5)));
          return l;
        }`)
      .replace(
        "#include <color_fragment>",
        triplanar ? `#include <color_fragment>
        {
          vec3 det=triTex(tRockD,2.5)*2.2;
          diffuseColor.rgb*=mix(vec3(dot(det,vec3(0.3,0.5,0.2))),det,0.35);
        }` : "#include <color_fragment>",
      )
      .replace(
        "#include <normal_fragment_maps>",
        `#include <normal_fragment_maps>
        {
          ${triplanar ? `{vec3 w=triW();vec3 nx=texture2D(tRockN,vEW.zy/2.5).xyz*2.0-1.0,ny=texture2D(tRockN,vEW.xz/2.5).xyz*2.0-1.0,nz=texture2D(tRockN,vEW.xy/2.5).xyz*2.0-1.0;
            vec3 dn=vec3(0.0,nx.y,nx.x)*w.x+vec3(ny.x,0.0,ny.y)*w.y+vec3(nz.x,nz.y,0.0)*w.z;
            normal=normalize(normal+mat3(viewMatrix)*dn*1.1);}` : ""}
          // weathered stone: soft pits and swells, strongest up close
          vec3 sp=vEW*2.3;
          float s0=stoneN(sp);
          vec3 g=vec3(stoneN(sp+vec3(0.2,0,0))-s0,stoneN(sp+vec3(0,0.2,0))-s0,stoneN(sp+vec3(0,0,0.2))-s0);
          float near=1.0-smoothstep(10.0,40.0,length(vEW-cameraPosition));
          normal=normalize(normal-mat3(viewMatrix)*g*2.2*near);
        }`,
      )
      .replace("#include <emissivemap_fragment>", `#include <emissivemap_fragment>
        {
          vec3 an=abs(vEN);
          float l=an.y>0.6?etchLines(vEW.xz):(an.x>an.z?etchLines(vEW.zy):etchLines(vEW.xy));
          float dist=length(vEW-cameraPosition);
          float fade=1.0-smoothstep(25.0,70.0,dist);
          // the drawings' lattice survives only as a faint trace in the stone
          totalEmissiveRadiance+=uLine*l*fade*0.06*uEtchGain*(0.85+0.15*sin(uEtchT*0.6+vEW.y));
          // vibrating: rings of light race outward over the stone, and its lattice wakes
          if(uVibeK>0.001){
            float vd=distance(vEW,uVibePos);
            float on=1.0-smoothstep(uVibeR*1.1,uVibeR*1.6+0.6,vd);
            float wave=pow(0.5+0.5*sin(vd*10.0-uEtchT*9.0),6.0)+pow(0.5+0.5*sin(vd*4.0-uEtchT*5.0),10.0)*0.6;
            totalEmissiveRadiance+=(vec3(1.0,0.85,0.6)*wave*0.9+uLine*l*1.2)*on*uVibeK;
          }
        }`);
  };
  return m;
}
