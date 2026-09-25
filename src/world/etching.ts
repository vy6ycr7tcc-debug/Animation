/* Etched light: the ink drawings' linework carried into 3D.
   - contourMaterial: terrain whose height contours glow as fine, slightly wandering lines.
   - buildMandala: hand-drawn line geometry on the central platform (seven-fold, one ring per island). */
import * as THREE from "three";

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
          float ln=1.0-smoothstep(w*0.6,w*1.8,dd);
          float above=smoothstep(0.15,0.6,vEtchW.y);
          float dist=length(vEtchW-cameraPosition);
          float fade=1.0-smoothstep(45.0,140.0,dist);
          float breathe=0.8+0.2*sin(uEtchT*0.5+vEtchW.y*0.4);
          totalEmissiveRadiance+=uLine*ln*above*fade*breathe*0.9*uEtchGain;
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
    vertexColors: true, transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const lines = new THREE.LineSegments(g, mat);
  const group = new THREE.Group();
  group.add(lines);
  return group;
}
