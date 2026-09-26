/* In flight the wanderer becomes a geometric being (Samuel: "more like a geometric shape
   shifting… very geometric… something very alien"), as in the water it becomes an orb.
   - A faceted core, flat-shaded glass whose facets catch the light in their own pale colours,
     never still: its vertices rise and sink in travelling waves, so it keeps shifting between
     stellated, spiked and rounded forms.
   - Around it, the edges of two other solids (an octahedron and a dodecahedron), turning on
     their own axes against each other, swelling and shrinking in turn, so now one form leads,
     now another.
   Contained, as every glow here: only thin edges and a soft core. */
import * as THREE from "three/webgpu";
import { T } from "../gpu/tsl";

const { abs, cameraPosition, dot, float, mix, normalize, normalWorld, positionGeometry, positionWorld, pow, sin, uniform, vec3, vec4 } = T;

function edges(g: THREE.BufferGeometry, color: THREE.Color, uK: ReturnType<typeof uniform>): THREE.LineSegments {
  const m = new THREE.LineBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
  m.colorNode = vec4(vec3(color.r, color.g, color.b).mul(uK), 1);
  return new THREE.LineSegments(new THREE.EdgesGeometry(g), m);
}

export class GeoForm {
  group = new THREE.Group();
  private uT = uniform(0);
  private uK = uniform(0);
  private core: THREE.Mesh;
  private inner: THREE.LineSegments;
  private outer: THREE.LineSegments;
  private heartEdges: THREE.LineSegments;

  constructor() {
    // the core: an icosahedron, one facet per face (non-indexed, so each facet is flat)
    const g = new THREE.IcosahedronGeometry(1, 1).toNonIndexed();
    g.computeVertexNormals();
    const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false });
    const P = positionGeometry, t = this.uT;
    // shape-shifting: waves travelling over the solid raise some vertices into spikes and sink others
    const w1 = sin(dot(P, vec3(3.1, 1.7, 2.3)).add(t.mul(1.3)));
    const w2 = sin(dot(P, vec3(-1.9, 2.9, 1.1)).sub(t.mul(0.9)));
    const w3 = sin(dot(P, vec3(1.3, -2.2, 3.4)).add(t.mul(0.6)));
    const spike = w1.mul(w2).mul(0.45).add(w3.mul(0.18));
    m.positionNode = P.mul(float(1).add(spike));
    // each facet its own pale colour, brighter at the rims (glass seen edge-on)
    const n = normalize(normalWorld), v = normalize(cameraPosition.sub(positionWorld));
    const rim = pow(float(1).sub(abs(dot(n, v))), 2);
    const hue = mix(vec3(0.55, 0.75, 1.0), vec3(1.0, 0.78, 0.95), n.y.mul(0.5).add(0.5)).mul(mix(1, 0.8, abs(n.x)));
    m.colorNode = vec4(hue.mul(rim.mul(0.75).add(0.05)).mul(this.uK), rim.mul(0.55).add(0.08).mul(this.uK));
    this.core = new THREE.Mesh(g, m);
    this.core.scale.setScalar(0.3);
    this.inner = edges(new THREE.OctahedronGeometry(1, 0), new THREE.Color(1.0, 0.86, 0.6), this.uK);
    this.outer = edges(new THREE.DodecahedronGeometry(1, 0), new THREE.Color(0.7, 0.85, 1.0), this.uK);
    this.heartEdges = edges(new THREE.TetrahedronGeometry(1, 0), new THREE.Color(1.0, 0.95, 0.85), this.uK);
    this.group.add(this.core, this.inner, this.outer, this.heartEdges);
    this.group.visible = false;
  }

  /** Each frame: `at` is where the heart would be, `k` how much of the wanderer is this form. */
  update(dt: number, at: THREE.Vector3, k: number, t: number, reduced: boolean): void {
    const s = reduced ? t * 0.4 : t;
    this.uT.value = s;
    this.uK.value = k;
    this.group.visible = k > 0.01;
    if (!this.group.visible) return;
    this.group.position.copy(at);
    this.group.scale.setScalar(0.4 + 0.6 * k); // it unfolds out of the body
    // the solids turn against each other, and swell and shrink in turn
    this.core.rotation.set(s * 0.31, s * 0.47, s * 0.13);
    this.inner.rotation.set(-s * 0.52, s * 0.21, s * 0.37);
    this.outer.rotation.set(s * 0.17, -s * 0.33, -s * 0.24);
    this.heartEdges.rotation.set(s * 0.9, s * 0.7, 0);
    const a = Math.sin(s * 0.8), b = Math.sin(s * 0.8 + 2.1), c = Math.sin(s * 0.8 + 4.2);
    this.core.scale.setScalar(0.3 + 0.06 * a);
    this.inner.scale.setScalar(0.5 + 0.12 * b);
    this.outer.scale.setScalar(0.62 + 0.14 * c);
    this.heartEdges.scale.setScalar(0.14 + 0.03 * Math.sin(s * 3));
    void dt;
  }
}
