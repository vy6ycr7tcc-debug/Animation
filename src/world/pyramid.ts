  return m;
}
function crystalGlow(uT: N): THREE.MeshBasicNodeMaterial {
  const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.CustomBlending, blendSrc: THREE.SrcAlphaFactor, blendDst: THREE.OneFactor, blendEquation: THREE.AddEquation, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor, fog: false });
  const V0 = T.normalize(T.cameraPosition.sub(T.positionWorld));
  const ndv = T.max(T.dot(T.normalWorld, V0), 0);
  const film = cos(vec3(ndv.mul(1.5).add(uT.mul(0.05))).add(vec3(0, 0.33, 0.67)).mul(6.28)).mul(0.5).add(0.5);
  stillWhisperFired = false;
  apophis!: THREE.Group;
  apophisCurve!: THREE.CatmullRomCurve3;
  apophisSpears: THREE.Group[] = [];
  apophisEyes: THREE.Sprite[] = [];
  apophisU: any = T.uniform(0.8);
  apophisHome = new THREE.Vector3(8, 0, 26);
  apophisRecoilT = 0;
  apophisWhisperFired = false;
  apophisRecoiling = false;
  hallBeam!: THREE.Group;
  hallBase!: THREE.Group;
  hallHeart!: THREE.Sprite;
  hallFeather!: THREE.Sprite;
  hallPanL!: THREE.Sprite;
  hallPanR!: THREE.Sprite;
  hallFortyTwo: THREE.Sprite[] = [];
  hallMaat!: THREE.Sprite;
  hallStill = 0;
  hallLastPos = new THREE.Vector3();
    for (let i = 0; i < this.PATH.length - 1; i++) len += this.PATH[i].distanceTo(this.PATH[i + 1]);
    this.pathLen = len;

    // A soft, glowing, additive trail of mist/lights instead of hard ribbons
    const pathMat = new THREE.SpriteMaterial({
      map: dotTexture(),
      color: 0x5a6d90,
      transparent: true,
      opacity: 0.15,
      depthWrite: false,
      fog: false,
      blending: THREE.CustomBlending,
      blendEquation: THREE.AddEquation,
      blendSrc: THREE.SrcAlphaFactor,
      blendDst: THREE.OneFactor,
      blendEquationAlpha: THREE.AddEquation,
      blendSrcAlpha: THREE.ZeroFactor,
      blendDstAlpha: THREE.OneFactor,
    });

    const numLamps = 180;
    for (let i = 0; i < numLamps; i++) {
      const s = i / (numLamps - 1);
      const pos = new THREE.Vector3();
      this.pathPoint(s, pos);
      // add organic drift around the path
      const driftX = Math.sin(i * 13.3) * 3.5;
      const driftZ = Math.cos(i * 7.7) * 3.5;
      const sprite = new THREE.Sprite(pathMat);
      sprite.position.set(pos.x + driftX, pos.y + 0.5 + Math.sin(i * 4.1) * 0.4, pos.z + driftZ);
      sprite.scale.setScalar(4.0 + Math.sin(i * 2.3) * 2.0);
      duat.add(sprite);
    }

    this.buildDuatAtmosphere();
    this.buildStationNun();
    this.buildStationSokar();
    let s = 1234567;
    const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;

    // Soft reflective mist plane for Nun waters, avoiding hard CircleGeometry
    const nunMat = new THREE.MeshBasicNodeMaterial({
      transparent: true,
      depthWrite: false,
      fog: false,
      blending: THREE.CustomBlending,
      blendEquation: THREE.AddEquation,
      blendSrc: THREE.SrcAlphaFactor,
      blendDst: THREE.OneFactor,
      blendSrcAlpha: THREE.ZeroFactor,
      blendDstAlpha: THREE.OneFactor,
    });
    
    // Create organic water mist
    const uv2 = T.uv();
    const nx = uv2.x.sub(0.5).mul(32.0);
    const ny = uv2.y.sub(0.5).mul(-32.0);
    const dCenter = T.length(T.vec2(nx, ny));
    
    const noise = vnoise(T.vec2(nx, ny).mul(0.1).add(this.uT.mul(0.01))).mul(0.5).add(
                  vnoise(T.vec2(nx, ny).mul(0.3).add(this.uT.mul(0.03))).mul(0.5));
    
    // Glow core and water color
    const NUN_WATER = vec3(0.01, 0.05, 0.15);
    const NUN_GOLD = vec3(0.6, 0.5, 0.2);
    
    // Organic radial falloff (no hard edges)
    const fade = T.smoothstep(16.0, 0.0, dCenter);
    const glow = T.exp(dCenter.mul(dCenter).div(-60.0));
    const mistColor = NUN_WATER.mul(noise.add(0.5)).add(NUN_GOLD.mul(glow));
    
    nunMat.colorNode = mistColor.mul(fade);
    
    // Use an oversized plane with fully transparent edges instead of a circle
    const water = new THREE.Mesh(new THREE.PlaneGeometry(36, 36, 1, 1), nunMat);
    water.rotation.x = -Math.PI / 2;
    water.position.set(18, 0.05, -14);
    water.renderOrder = 2;
    water.frustumCulled = false;
    this.duat.add(water);

    // dome of stars
    const N = 140;
    const starArr = new Float32Array(N * 3);
      refArr[i * 3 + 0] = 18 + Math.cos(a) * r;
      refArr[i * 3 + 1] = 0.015;
      refArr[i * 3 + 2] = -14 + Math.sin(a) * r;
    }    refs.position.needsUpdate = true;
    refs.sprite.frustumCulled = false;
    this.duat.add(refs.sprite);

      return s - Math.floor(s);
    };

    // --- The union: ram-headed Ra fused with mummiform Osiris, breathing as one ---
    this.stillRa = new THREE.Sprite(glow(new THREE.Color(0.98, 0.82, 0.48), 0.95));
    this.stillRa.position.set(cx, cy + 2.2, cz);
    this.stillOsiris.scale.set(2, 4, 1);
    this.duat.add(this.stillOsiris);

    // Sun-disc replacing hard torus with a soft glowing halo (sprite ring)
    const discMat = additive(
      new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide }),
    );
    const dUv = T.uv();
    const dCenter = T.length(dUv.sub(0.5)).mul(2.0);
    // Soft ring falloff
    const halo = smoothstep(0.05, 0.0, abs(dCenter.sub(0.85))).mul(0.6).add(
                 T.exp(dCenter.mul(dCenter).mul(-4.0)).mul(0.4));
    discMat.colorNode = T.vec3(0.95, 0.72, 0.28).mul(halo);
    
    this.stillDisc = new THREE.Mesh(new THREE.PlaneGeometry(3.0, 3.0), discMat);
    this.stillDisc.position.set(cx, cy + 3.8, cz);
    this.stillDisc.rotation.x = -0.26;
    this.duat.add(this.stillDisc);

    // --- Mehen: three coils of protective light, replacing hard Torus with glowing mist rings ---
    const radii = [4, 5.2, 6.4];
    for (let i = 0; i < radii.length; i++) {
      const ringMat = additive(
        new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide }),
      );
      // Soft radial ring
      const rCenter = T.length(T.uv().sub(0.5)).mul(2.0);
      const ringGlow = smoothstep(0.15, 0.0, abs(rCenter.sub(0.8))).mul(0.4);
      ringMat.colorNode = T.vec3(0.3, 0.2, 0.1).mul(ringGlow); // faint gold
      
      const planeSize = radii[i] * 2.5;
      const ring = new THREE.Mesh(new THREE.PlaneGeometry(planeSize, planeSize), ringMat);
      ring.position.set(cx, cy + 0.4, cz);
      ring.rotation.x = -Math.PI * 0.5;
      this.duat.add(ring);
      this.stillRings.push(ring);
    }
  }

  private buildStationHall(): void {
    const cx = -1;
    const cy = 0;
    const cz = -26;

    const additive = <M extends THREE.Material>(m: M): M => {
      m.blending = THREE.CustomBlending;
      m.blendSrc = THREE.SrcAlphaFactor;
      m.blendDst = THREE.OneFactor;
      m.blendEquation = THREE.AddEquation;
      m.blendSrcAlpha = THREE.ZeroFactor;
      m.blendDstAlpha = THREE.OneFactor;
      return m;
    };

    const dot = dotTexture();
    const glow = (color: THREE.Color, opacity: number): THREE.SpriteMaterial =>
      additive(
        new THREE.SpriteMaterial({
          map: dot,
          color,
          opacity,
          transparent: true,
          depthWrite: false,
          fog: false,
        })
      );

    // --- The Scales: replaced BoxGeometry/CylinderGeometry with soft gold light constructs ---
    this.hallBase = new THREE.Group();
    this.hallBase.position.set(cx, cy, cz);

    // Central pillar of light instead of a cylinder
    const pillarMat = additive(
      new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide })
    );
    const pUv = T.uv();
    const pEdge = smoothstep(0.5, 0.0, abs(pUv.x.sub(0.5)));
    pillarMat.colorNode = T.vec3(0.9, 0.75, 0.4).mul(pEdge).mul(0.6);
    
    const pillar1 = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 6.5), pillarMat);
    const pillar2 = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 6.5), pillarMat);
    pillar2.rotation.y = Math.PI / 2;
    pillar1.position.y = 3.25;
    pillar2.position.y = 3.25;
    this.hallBase.add(pillar1);
    this.hallBase.add(pillar2);

    // The crossbeam of light
    const beamGrp = new THREE.Group();
    beamGrp.position.set(0, 5.8, 0);
    const beam1 = new THREE.Mesh(new THREE.PlaneGeometry(6, 0.4), pillarMat);
    const beam2 = new THREE.Mesh(new THREE.PlaneGeometry(6, 0.4), pillarMat);
    beam2.rotation.x = Math.PI / 2;
    beamGrp.add(beam1);
    beamGrp.add(beam2);
    this.hallBase.add(beamGrp);
    this.hallBeam = beamGrp;

    // The pans: glowing auric mist instead of cylinders
    const panMat = new THREE.SpriteMaterial({ map: dot, color: 0xead07a, transparent: true, blending: THREE.CustomBlending, blendSrc: THREE.SrcAlphaFactor, blendDst: THREE.OneFactor, blendEquation: THREE.AddEquation, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor, depthWrite: false, fog: false });
    
    this.hallPanL = new THREE.Sprite(panMat);
    this.hallPanL.position.set(-2.8, -1.8, 0); // relative to beam
    this.hallPanL.scale.set(2.5, 1.0, 1.0);
    beamGrp.add(this.hallPanL);

    this.hallPanR = new THREE.Sprite(panMat);
    this.hallPanR.position.set(2.8, -1.8, 0);
    this.hallPanR.scale.set(2.5, 1.0, 1.0);
    beamGrp.add(this.hallPanR);

    // Heart (left) and Feather (right) — slightly floating above the pans
    this.hallHeart = new THREE.Sprite(glow(new THREE.Color(0.9, 0.1, 0.1), 0.95));
    this.hallHeart.position.set(0, 0.8, 0); // relative to pan
    this.hallHeart.scale.set(1.5, 1.5, 1);
    this.hallPanL.add(this.hallHeart);

    this.hallFeather = new THREE.Sprite(glow(new THREE.Color(0.8, 0.95, 1.0), 0.9));
    this.hallFeather.position.set(0, 0.8, 0); // relative to pan
    this.hallFeather.scale.set(1.5, 2.5, 1);
    this.hallPanR.add(this.hallFeather);

    this.duat.add(this.hallBase);

    // --- The 42 Judges: an arc of solemn golden stars (restrained) ---
    const judgeMat = glow(new THREE.Color(0.95, 0.85, 0.6), 0.7);
    const arc = Math.PI * 1.5;
    const a0 = Math.PI * 0.5 - arc * 0.5;
    for (let i = 0; i < 42; i++) {
      const a = a0 + arc * (i / 41);
      const r = 18;
      const judge = new THREE.Sprite(judgeMat);
      judge.position.set(cx + Math.cos(a) * r, cy + 3.5 + Math.sin(i * 13) * 1.5, cz + Math.sin(a) * r);
      judge.scale.setScalar(0.9 + Math.sin(i * 7) * 0.3);
      this.duat.add(judge);
      this.hallFortyTwo.push(judge);
    }
  }

  private updateHall(): void {
      m.needsUpdate = true;
    };

    // Soft misty meadow replacing CircleGeometry
    const mGrain = vnoise(T.positionWorld.xz.mul(0.35)).mul(0.5)
      .add(vnoise(T.positionWorld.xz.mul(1.7)).mul(0.25));
    const mPatch = vnoise(T.positionWorld.xz.mul(0.06));
    const raise = T.smoothstep(0.30, 0.85, mPatch.mul(0.7).add(mGrain.mul(0.5)));
    const base = T.mix(vec3(0.010, 0.018, 0.026), vec3(0.030, 0.052, 0.040), raise);
    const col = T.mix(base, vec3(0.020, 0.022, 0.045), raise); // simplified shading without explicit normal calculations

    const meadowMat = new THREE.MeshBasicNodeMaterial({ 
      transparent: true,
      depthWrite: false,
      fog: false 
    });
    
    // Soft radial fade
    const dEdge = T.length(T.positionWorld.xz.sub(vec2(-15.0, -12.0)));
    const edgeFade = T.smoothstep(32.0, 16.0, dEdge);
    meadowMat.colorNode = col.mul(edgeFade);
    
    const meadow = new THREE.Mesh(new THREE.PlaneGeometry(64, 64, 1, 1), meadowMat);
    meadow.rotation.x = -Math.PI / 2;
    meadow.position.set(-15, 0.02, -12);
    this.duat.add(meadow);

    // Field of Reeds — organic papyrus fan clusters & swaying stalks (unchanged as it uses planes/sprites nicely)
    const reedBladeMat = new THREE.MeshBasicNodeMaterial({
      transparent: true,
      depthWrite: false,
      this.reedsSway.push({ y: 2.6, phase: rnd() * Math.PI * 2 });
    }

    // Horizon — gold dawn band
    const glowMat = new THREE.MeshBasicNodeMaterial({
      color: 0xffc873,
      transparent: true,
    glow.position.set(-15, 6, -38);
    this.duat.add(glow);

    // Khepri — the morning scarab, soft glowing silhouette
    const khepri = new THREE.Group();
    khepri.position.set(-15, 7.5, -36);
    
    // Additive glow instead of solid standard materials
    const shellMat = new THREE.SpriteMaterial({ map: dotTexture(), color: 0x4a2a1a, transparent: true, blending: THREE.CustomBlending, blendSrc: THREE.SrcAlphaFactor, blendDst: THREE.OneFactor, blendEquation: THREE.AddEquation, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor, depthWrite: false });
    const body = new THREE.Sprite(shellMat);
    body.scale.set(3, 3, 1);
    khepri.add(body);
    
    const wingMat = new THREE.SpriteMaterial({ map: dotTexture(), color: 0x8a6d2f, transparent: true, blending: THREE.CustomBlending, blendSrc: THREE.SrcAlphaFactor, blendDst: THREE.OneFactor, blendEquation: THREE.AddEquation, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor, depthWrite: false });
    for (let s = -1; s <= 1; s += 2) {
      const wing = new THREE.Sprite(wingMat);
      wing.position.set(1.0 * s, 0.5, 0);
      wing.scale.set(2, 1, 1);
      khepri.add(wing);
    }
    this.duat.add(khepri);
    this.khepri = khepri;

    // The newborn sun - soft aura only
    const sunSpriteMat = new THREE.SpriteMaterial({ map: dotTexture(), color: 0xffd98a, opacity: 0.95 });
    additive(sunSpriteMat);
    const khepriSun = new THREE.Group();
    khepriSun.position.set(-15, 4.5, -36.4);
    const sunGlow = new THREE.Sprite(sunSpriteMat);
    sunGlow.scale.setScalar(12); // Slightly larger sun to compensate for loss of hard disk
    khepriSun.add(sunGlow);
    // Removed the hard CircleGeometry disk
    this.duat.add(khepriSun);
    this.khepriSun = khepriSun;

    // Barque of the morning - soft mist ship
    const barque = new THREE.Group();
    barque.position.set(-15, 3.2, -34);
    
    // Glowing misty hull instead of a cylinder
    const hullMat = new THREE.SpriteMaterial({ map: dotTexture(), color: 0x8a6d2f, transparent: true, blending: THREE.CustomBlending, blendSrc: THREE.SrcAlphaFactor, blendDst: THREE.OneFactor, blendEquation: THREE.AddEquation, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor, depthWrite: false, opacity: 0.7 });
    const hull = new THREE.Sprite(hullMat);
    hull.scale.set(12, 2.5, 1);
    barque.add(hull);
    
    for (let e = -1; e <= 1; e += 2) {
      const prow = new THREE.Sprite(hullMat);
      prow.position.set(4.5 * e, 0.8, 0);
      prow.scale.set(2.5, 2.5, 1);
      barque.add(prow);
    }
    this.duat.add(barque);
    this.reedsBarque = barque;
  }

  private buildStationBattle(): void {
    const home = this.apophisHome;
      return s - Math.floor(s);
    };

    // 7 points coiling around duat-local (8, 2, 26)
    const raw = [
      new THREE.Vector3(4.2, 1.2, 22.2),
      new THREE.Vector3(11.6, 3.4, 22.8),

    this.apophis = new THREE.Group();
    this.apophis.position.copy(home);
    
    // Replace hard TubeGeometry with soft glowing volumetric spheres along the spine
    const spinePts = this.apophisCurve.getSpacedPoints(60);
    const auraMat = new THREE.SpriteMaterial({
      map: dotTexture(),
      color: new THREE.Color(0.25, 0.02, 0.02), // deep ember reds
      transparent: true,
      blending: THREE.CustomBlending, blendSrc: THREE.SrcAlphaFactor, blendDst: THREE.OneFactor, blendEquation: THREE.AddEquation, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor,
      depthWrite: false,
      fog: false,
    });
    
    for (let i = 0; i < spinePts.length; i++) {
       const wisp = new THREE.Sprite(auraMat);
       wisp.position.copy(spinePts[i]);
       wisp.scale.setScalar(3.0 + Math.sin(i * 0.2) * 1.0);
       this.apophis.add(wisp);
       
       // inner core
       if (i % 2 === 0) {
         const coreMat = new THREE.SpriteMaterial({
           map: dotTexture(),
           color: new THREE.Color(0.8, 0.1, 0.05), // hotter core
           transparent: true,
           blending: THREE.CustomBlending, blendSrc: THREE.SrcAlphaFactor, blendDst: THREE.OneFactor, blendEquation: THREE.AddEquation, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor,
           depthWrite: false,
           fog: false,
         });
         const core = new THREE.Sprite(coreMat);
         core.position.copy(spinePts[i]);
         core.scale.setScalar(1.2 + Math.cos(i * 0.3) * 0.4);
         this.apophis.add(core);
       }
    }

    // red eyes at the head end
    const head = this.apophisCurve.getPoint(1);
      );
      eye.position.copy(head).addScaledVector(side, 0.32 * s).addScaledVector(tan, 0.3);
      eye.position.y += 0.35;
      eye.scale.setScalar(1.2); // slightly larger glow
      this.apophisEyes.push(eye);
      this.apophis.add(eye);
    }
    this.duat.add(this.apophis);

    // 4 spears of light — gold, additive, piercing the coil
    // replaced CylinderGeometry with soft beam planes
    const up = new THREE.Vector3(0, 1, 0);
    for (let i = 0; i < 4; i++) {
      const mat = new THREE.MeshBasicNodeMaterial({
        transparent: true,
        depthWrite: false,
        fog: false,
        side: THREE.DoubleSide,
        blending: THREE.CustomBlending,
        blendEquation: THREE.AddEquation,
        blendSrc: THREE.SrcAlphaFactor,
        blendSrcAlpha: THREE.ZeroFactor,
        blendDstAlpha: THREE.OneFactor,
      });
      
      const bUv = T.uv();
      // Beam gradient fading out at edges
      const edge = smoothstep(0.5, 0.0, abs(bUv.x.sub(0.5)));
      const vfade = smoothstep(0.0, 0.1, bUv.y).mul(smoothstep(1.0, 0.9, bUv.y));
      mat.colorNode = T.vec3(1.0, 0.8, 0.34).mul(this.apophisU).mul(edge).mul(vfade);
      
      // Use crossed planes for a soft volumetric beam look from all angles
      const spearGroup = new THREE.Group();
      
      const plane1 = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 10), mat);
      const plane2 = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 10), mat);
      plane2.rotation.y = Math.PI / 2;
      spearGroup.add(plane1);
      spearGroup.add(plane2);

      const a = i * Math.PI * 0.5 + rnd(i) * 0.7;
      const r = 3.4 + rnd(i + 7) * 1.8;
      spearGroup.position.set(home.x + Math.cos(a) * r, 1.4 + rnd(i + 13) * 1.4, home.z + Math.sin(a) * r);
      const dir = new THREE.Vector3(home.x - spearGroup.position.x, 0.8 + rnd(i + 21) * 1.2, home.z - spearGroup.position.z);
      if (dir.lengthSq() < 1e-6) dir.set(0, 1, 0);
      dir.normalize();
      
      // Orient the group along the dir vector
      const quaternion = new THREE.Quaternion().setFromUnitVectors(up, dir);
      spearGroup.quaternion.copy(quaternion);
      
      this.apophisSpears.push(spearGroup);
      this.duat.add(spearGroup);
    }
  }

    const p2 = rnd() * Math.PI * 2;
    const p3 = rnd() * Math.PI * 2;
    const dunePos = duneGeo.attributes.position as THREE.BufferAttribute;
    
    // Apply soft gaussian falloff to dune edges so it doesn't look like a square patch
    for (let i = 0; i < dunePos.count; i++) {
      const x = dunePos.getX(i);
      const z = dunePos.getZ(i);
      const dx = x / 23.0; // -1 to 1
      const dz = z / 15.0; // -1 to 1
      const distSq = dx*dx + dz*dz;
      const fade = Math.max(0, 1.0 - distSq);
      
      const w =
        Math.sin(x * 0.22 + p1) * 0.45 +
        Math.sin(z * 0.31 + p2) * 0.33 +
        Math.sin(x * 0.11 + z * 0.14 + p3) * 0.22;
      // amplitude 1.2, clamped, faded out at edges
      dunePos.setY(i, Math.min(1.2, Math.max(0, (0.5 + 0.5 * w) * 1.2)) * fade);
    }
    dunePos.needsUpdate = true;
    duneGeo.computeVertexNormals();
    serpent.position.set(34, 1.5, -6);
    this.sokarSerpent = serpent;

    for (let e = 0; e < 2; e++) {
      const tEnd = e === 0 ? 0 : 1;
      const tan = curve.getTangent(tEnd);
      tan.set(tan.x / tLen, tan.y / tLen, tan.z / tLen);
      if (tan.lengthSq() < 1e-6) tan.set(0, 0, 1);
      const dir = tan.multiplyScalar(e === 0 ? -1 : 1);
      
      // Soft glowing beads for head instead of hard cone
      const bead1 = new THREE.Sprite(new THREE.SpriteMaterial({ map: dotTexture(), color: 0xff5a14, transparent: true, blending: THREE.CustomBlending, blendSrc: THREE.SrcAlphaFactor, blendDst: THREE.OneFactor, blendEquation: THREE.AddEquation, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor, depthWrite: false }));
      bead1.position.copy(curve.getPoint(tEnd)).addScaledVector(dir, 0.4);
      bead1.scale.setScalar(2.0);
      serpent.add(bead1);
      
      const bead2 = new THREE.Sprite(new THREE.SpriteMaterial({ map: dotTexture(), color: 0xffa040, transparent: true, blending: THREE.CustomBlending, blendSrc: THREE.SrcAlphaFactor, blendDst: THREE.OneFactor, blendEquation: THREE.AddEquation, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor, depthWrite: false }));
      bead2.position.copy(curve.getPoint(tEnd)).addScaledVector(dir, 0.7);
      bead2.scale.setScalar(1.0);
      serpent.add(bead2);
    }
    this.duat.add(serpent);

    // Soft gates flanking the path replacing sharp pylons.
    const gateDefs = [
      { x: 30, z: -13, name: 'The gate of the Silent Earth opens — it knows your step.' },
      { x: 38, z: 1, name: 'The gate of the Ember Watch opens — it knows your name.' }
    ];

    for (let i = 0; i < gateDefs.length; i++) {
      const def = gateDefs[i];
      const group = new THREE.Group();
      group.position.set(def.x, 0, def.z);
      
      const discU = T.uniform(0.35);
      
      for (let s = 0; s < 2; s++) {
        const xPos = s === 0 ? -1.8 : 1.8;
        
        // Use stacked additive sprites to create a glowing pillar (no sharp edges)
        const pillarMat = new THREE.SpriteMaterial({ map: dotTexture(), color: 0x3a5a8a, transparent: true, blending: THREE.CustomBlending, blendSrc: THREE.SrcAlphaFactor, blendDst: THREE.OneFactor, blendEquation: THREE.AddEquation, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor, depthWrite: false });
        for (let py = 0; py < 5; py++) {
          const spark = new THREE.Sprite(pillarMat);
          spark.position.set(xPos, 1.0 + py * 1.0, 0);
          spark.scale.setScalar(1.5 + Math.sin(py)*0.2);
          group.add(spark);
        }
      }
      
      // Lintel mist
      const lintelMat = new THREE.SpriteMaterial({ map: dotTexture(), color: 0x2a3a6a, transparent: true, blending: THREE.CustomBlending, blendSrc: THREE.SrcAlphaFactor, blendDst: THREE.OneFactor, blendEquation: THREE.AddEquation, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor, depthWrite: false });
      const lintelSprite = new THREE.Sprite(lintelMat);
      lintelSprite.position.set(0, 5.5, 0);
      lintelSprite.scale.set(5.0, 1.5, 1.0);
      group.add(lintelSprite);

      const dR = T.length(T.uv().sub(0.5)).mul(2.0);
      const dCore = T.exp(dR.mul(dR).mul(-5.0));
      const dRing = smoothstep(0.05, 0.0, abs(dR.sub(0.78))).mul(0.8);
      const discMat = glowMat(T.vec3(1.0, 0.8, 0.34).mul(dCore.mul(1.2).add(dRing)).mul(discU));
      
      // Keep the glowing rune/disc, but it's now just floating energy in the mist
      const disc = new THREE.Mesh(new THREE.PlaneGeometry(2.5, 2.5), discMat);
      disc.position.set(0, 2.1, 0.12);
      group.add(disc);

      this.duat.add(group);
    }
  }
  private updateSokar(): void {
    const t = this.uT.value;
    const serpent = this.sokarSerpent;
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(4.6, 1.1, 2.4), gm);
    lintel.position.set(0, 4.7, dz + 0.6);
    this.world.add(lintel);
    const glowM = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.CustomBlending, blendSrc: THREE.SrcAlphaFactor, blendDst: THREE.OneFactor, blendEquation: THREE.AddEquation, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor, side: THREE.DoubleSide, fog: false });
    const d = uv().sub(vec2(0.5, 0)).mul(vec2(2, 1));
    glowM.colorNode = vec4(vec3(1.0, 0.82, 0.55).mul(smoothstep(1.1, 0.2, T.length(d)).mul(0.35)), 1);
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(2.1, 4.1), glowM);
    this.world.add(glow);
    this.door.set(x, y, z + dz - 0.4);
    // the third spiral: from the apex, like a candle flame (58.24); soft and contained
    const fm = new THREE.SpriteNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.CustomBlending, blendSrc: THREE.SrcAlphaFactor, blendDst: THREE.OneFactor, blendEquation: THREE.AddEquation, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor, fog: false });
    {
      const p = uv().sub(vec2(0.5, 0.0)).mul(vec2(2, 1));
      const flick = sin(this.uT.mul(1.3)).mul(0.04).add(sin(this.uT.mul(2.9)).mul(0.03));
    cr.position.set(C.x, C.y + 3.4, C.z);
    this.inside.add(cr);
    // the pit: the resonating chamber's open floor, light far below
    const pm = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.CustomBlending, blendSrc: THREE.SrcAlphaFactor, blendDst: THREE.OneFactor, blendEquation: THREE.AddEquation, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor, fog: false });
    {
      const p = uv().sub(0.5).mul(2), r = T.length(p);
      const rings = sin(r.mul(22).sub(this.uT.mul(1.2))).mul(0.5).add(0.5);
    // the seven colours, lit on the wanderer in the King's Chamber (placed by main.ts)
    const cols = [0xff3a2e, 0xff8a24, 0xffd83a, 0x4fe07a, 0x3aa8ff, 0x5a4dff, 0xb45cff];
    for (const c of cols) {
      const m = new THREE.SpriteMaterial({ color: c, transparent: true, opacity: 0, blending: THREE.CustomBlending, blendSrc: THREE.SrcAlphaFactor, blendDst: THREE.OneFactor, blendEquation: THREE.AddEquation, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor, depthWrite: false, depthTest: false, map: dotTexture() });
      const s = new THREE.Sprite(m);
      s.scale.setScalar(0.5);
      s.renderOrder = 20;
  }
}


function duatDunes(uT: N): THREE.MeshBasicNodeMaterial {
  const n = T.normalize(T.normalWorld);