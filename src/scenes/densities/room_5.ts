import * as THREE from "three/webgpu";
import { LessonScene } from "../lessonKit";
import type { LessonCtx, LessonOpts, Beat } from "../lessonKit";
import { heightAt } from "../../world/terrain";
import type { Narration } from "../../core/narration";

// ── local placement ──────────────────────────────────────────────────────────
const SITE = { x: 500, z: -500, heading: 0 }; 
const seatPos = new THREE.Vector3(SITE.x, heightAt(SITE.x, SITE.z), SITE.z);

// ── scene module ─────────────────────────────────────────────────────────────

export function createDensity5Scene(
  scene: THREE.Scene,
  narration: Narration,
  whisper: (text: string, ms?: number) => void
): LessonScene {
  const ours: Array<{ dispose: () => void }> = [];
  const tickers: Array<(t: number) => void> = [];
  
  const build = (ctx: LessonCtx) => {
    ctx.group.add(ctx.kit.group);

    const center = seatPos.clone().add(new THREE.Vector3(0, 0, 10));

    // Vast solitary chamber implied by dark base ring
    ctx.kit.groundDisc(15, 0x111115, 0.6, seatPos.y + 0.05);
    ctx.kit.groundDisc(5, 0x223355, 0.3, seatPos.y + 0.06);
    
    // The Adept (robed figure) studying light - represented abstractly as a calm, bright wisp
    const adept = ctx.kit.wisp(0xffffff, 1.2);
    adept.setCenter(center.clone().add(new THREE.Vector3(0, 2.5, 0)));
    
    // Beams of light bending
    const beamPts = [];
    for(let i=0; i<6; i++) {
        const th = (i/6) * Math.PI * 2;
        beamPts.push(center.clone().add(new THREE.Vector3(Math.cos(th)*6, 0, Math.sin(th)*6)));
    }
    ctx.kit.beams(beamPts, 12, 0.8);
    
    // Prisms
    ctx.kit.crystals(12, center, 8);
    
    // Formulas tracing in the air (using standard SpriteMaterial for WebGL compatibility)
    const formulaGroup = new THREE.Group();
    formulaGroup.position.copy(center);
    ctx.group.add(formulaGroup);

    // Create a shared standard material for formulas
    const formulaMat = new THREE.SpriteMaterial({
      color: 0x80ccff,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
    });
    ours.push(formulaMat);

    const sprites: { mesh: THREE.Sprite; r: number; th: number; h: number; phase: number }[] = [];
    for (let k = 0; k < 100; k++) {
      const sprite = new THREE.Sprite(formulaMat);
      sprite.scale.set(0.1, 0.1, 0.1); // Fixed pixel size approximation
      
      const r = 4 + Math.random() * 8;
      const th = Math.random() * Math.PI * 2;
      const h = 1 + Math.random() * 8;
      const phase = Math.random() * Math.PI * 2;
      
      sprite.position.set(Math.cos(th) * r, h, Math.sin(th) * r);
      formulaGroup.add(sprite);
      sprites.push({ mesh: sprite, r, th, h, phase });
    }

    tickers.push((t: number) => {
      for (const s of sprites) {
        const ox = Math.sin(t * 0.5 + s.phase) * 1.5;
        const oy = Math.cos(t * 0.3 + s.phase) * 0.5;
        const oz = Math.sin(t * 0.4 + s.phase) * 1.5;
        s.mesh.position.set(Math.cos(s.th) * s.r + ox, s.h + oy, Math.sin(s.th) * s.r + oz);
        
        // Flickering effect (toggle visibility to avoid mutating shared material)
        const flicker = Math.sin(t * 5.0 + s.phase * 10.0) * 0.5 + 0.5;
        s.mesh.visible = flicker > 0.3;
      }
    });
    
    // Outgoing portal (5->6) (using standard MeshBasicMaterial for WebGL compatibility)
    const portalGeo = new THREE.PlaneGeometry(3, 5);
    ours.push(portalGeo);
    
    const portalMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
      fog: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending
    });
    ours.push(portalMat);

    const portalMesh = new THREE.Mesh(portalGeo, portalMat);
    portalMesh.position.copy(center.clone().add(new THREE.Vector3(0, 2.5, 12)));
    ctx.group.add(portalMesh);
  };

  const beats: Beat[] = [];

  const lesson = new LessonScene(scene, narration, whisper, {
    id: "density-5",
    trackId: "", // Visuals-only for now per instructions
    seatPos,
    seatHeading: SITE.heading,
    build,
    beats
  });

  const baseUpdate = lesson.update.bind(lesson);
  lesson.update = (dt: number) => {
    baseUpdate(dt);
    // Since audio is missing, use a local clock fallback for visuals if narration.time() is frozen.
    const t = narration.time() || performance.now() / 1000;
    for (const tick of tickers) tick(t);
  };

  const baseDispose = lesson.dispose.bind(lesson);
  lesson.dispose = () => {
    for (let i = 0; i < ours.length; i++) ours[i].dispose();
    ours.length = 0;
    tickers.length = 0;
    baseDispose();
  };

  return lesson;
}
