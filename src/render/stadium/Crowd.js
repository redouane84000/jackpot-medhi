import * as THREE from 'three';
import { roundedPath, P3, pushBox, hash1 } from './geom.js';
import { standLayout, isAisle, isVom, TEAM_RGB } from './Stands.js';

/**
 * Sièges et public : chaque place est un siège instancié ; une partie est occupée par un supporter en 3D
 * (buste, tête, bras articulés, jambes) animé dans le shader : il se lève, saute, lève les bras selon l'ambiance.
 * Les virages derrière les cages accueillent les groupes de supporters (debout, drapeaux) et un tifo géant.
 * Les sièges de l'anneau supérieur des tribunes latérales dessinent « JACKPOT » et « ARENA ».
 * Tout est découpé en secteurs pour que les parties hors champ ne soient pas dessinées.
 */
const SECTORS = 8;

function letterMask(text, cols, rows) {
  const c = Object.assign(document.createElement('canvas'), { width: cols, height: rows }), x = c.getContext('2d');
  x.fillStyle = '#000'; x.fillRect(0, 0, cols, rows);
  x.fillStyle = '#fff'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.font = `900 ${Math.round(rows * 1.05)}px "Archivo", Impact, "Arial Black", Arial, sans-serif`;
  try { x.letterSpacing = `${Math.round(cols / 90)}px`; } catch (e) { /* ignore */ }
  x.fillText(text, cols / 2, rows / 2 + 1, cols - 4);
  const d = x.getImageData(0, 0, cols, rows).data;
  return (u, v) => { const i = Math.min(cols - 1, Math.max(0, Math.floor(u * cols))), j = Math.min(rows - 1, Math.max(0, Math.floor(v * rows))); return d[(j * cols + i) * 4] > 110; };
}

/** Géométrie d'un siège vu depuis le terrain (assise + dossier : faces avant et dessus, 8 triangles indexés). */
function seatGeometry() {
  const P = [], N = [], I = [];
  const quad = (a, b, c, d, n) => { const o = P.length / 3; for (const v of [a, b, c, d]) { P.push(...v); N.push(...n); } I.push(o, o + 1, o + 2, o, o + 2, o + 3); };
  quad([-0.22, 0.44, -0.2], [-0.22, 0.44, 0.2], [0.22, 0.44, 0.2], [0.22, 0.44, -0.2], [0, 1, 0]);      // assise (dessus)
  quad([-0.22, 0.36, 0.2], [0.22, 0.36, 0.2], [0.22, 0.44, 0.2], [-0.22, 0.44, 0.2], [0, 0, 1]);        // nez d'assise
  quad([-0.22, 0.44, -0.2], [0.22, 0.44, -0.2], [0.22, 0.88, -0.26], [-0.22, 0.88, -0.26], [0, 0.14, 0.99]); // dossier
  quad([-0.22, 0.88, -0.26], [0.22, 0.88, -0.26], [0.22, 0.88, -0.31], [-0.22, 0.88, -0.31], [0, 1, 0]);  // haut du dossier
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3)); g.setIndex(I);
  return g;
}
/** Supporter assis (60 triangles, géométrie indexée) : jambes, buste, bras articulés, tête. Repère : x latéral, y haut, z vers le terrain. */
function fanGeometry() {
  const P = [], N = [], E = [], I = [];
  const box = (x0, y0, z0, x1, y1, z1, part) => {
    const faces = [
      [[x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [0, 1, 0]],
      [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1]],
      [[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1]],
      [[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0]],
      [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0]],
    ];
    for (const [a, b, c, d, n] of faces) { const o = P.length / 3; for (const v of [a, b, c, d]) { P.push(...v); N.push(...n); E.push(part); } I.push(o, o + 1, o + 2, o, o + 2, o + 3); }
  };
  box(-0.17, 0.0, 0.06, 0.17, 0.5, 0.3, 4);      // jambes (et cuisses)
  box(-0.19, 0.48, -0.14, 0.19, 1.02, 0.1, 0);   // buste
  box(-0.29, 0.52, -0.07, -0.2, 1.0, 0.04, 2);   // bras gauche
  box(0.2, 0.52, -0.07, 0.29, 1.0, 0.04, 3);     // bras droit
  // tête : octaèdre allongé (6 sommets)
  const o = P.length / 3, hc = [0, 1.16, -0.02];
  for (const [x, y, z] of [[0.12, 0, 0], [-0.12, 0, 0], [0, 0.135, 0], [0, -0.12, 0], [0, 0, 0.12], [0, 0, -0.12]]) { P.push(hc[0] + x, hc[1] + y, hc[2] + z); const l = Math.hypot(x, y, z); N.push(x / l, y / l, z / l); E.push(1); }
  for (const [a, b, c] of [[0, 2, 4], [4, 2, 1], [1, 2, 5], [5, 2, 0], [4, 3, 0], [1, 3, 4], [5, 3, 1], [0, 3, 5]]) I.push(o + a, o + b, o + c);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3)); g.setAttribute('aPart', new THREE.Float32BufferAttribute(E, 1));
  g.setIndex(I);
  return g;
}

export class Crowd {
  constructor(scene, C, layout, { small = false, fogColor } = {}) {
    const S = standLayout(C, layout);
    this.time = { value: 0 }; this.cheer = { value: 0.15 };
    const BLUE = new THREE.Color().setRGB(...TEAM_RGB.blue), ORANGE = new THREE.Color().setRGB(...TEAM_RGB.orange);
    const straightZ = S.FZ - S.RC, straightX = S.FX - S.RC;
    const maskJ = letterMask('JACKPOT', 160, 16), maskA = letterMask('ARENA', 160, 16);
    const tifoHalf = 17;
    // ---------- Places ----------
    const seats = [];
    const base = roundedPath(S.FX, S.FZ, S.RC, 0.12), bp = base.pts;
    for (const r of S.rows) {
      const d = r.d0 + 0.42;
      // courbe décalée construite depuis le pied de tribune : allées alignées sur les escaliers des gradins
      let acc = 0.26, px = bp[0].x + bp[0].nx * d, pz = bp[0].z + bp[0].nz * d;
      for (let i = 1; i < bp.length; i++) {
        const b = bp[i], x = b.x + b.nx * d, z = b.z + b.nz * d;
        acc += Math.hypot(x - px, z - pz); px = x; pz = z;
        if (acc < 0.52) continue;
        acc = 0;
        if (isAisle(b.s) || isVom(b.s, r.tier, r.k)) continue;
        const side = Math.abs(b.x) > straightX + 0.01 && Math.abs(b.z) < straightZ ? Math.sign(b.x) : 0;   // tribune latérale
        const end = Math.abs(b.z) > straightZ + 0.01 && Math.abs(b.x) < straightX ? Math.sign(b.z) : 0;     // virage
        seats.push({ x, y: r.y, z, yaw: Math.atan2(-b.nx, -b.nz), tier: r.tier, k: r.k, side, end });
      }
    }
    // ---------- Couleurs des sièges, lettres, tifos ----------
    const nRowsUp = S.rows.filter(r => r.tier === 1).length;
    for (const s of seats) {
      s.letter = false;
      if (s.tier === 1 && s.side !== 0 && Math.abs(s.z) < 38) {
        const u = s.side > 0 ? (s.z + 38) / 76 : (-s.z + 38) / 76, v = 1 - s.k / (nRowsUp - 1);
        s.letter = (s.side > 0 ? maskJ : maskA)(u, v);
      }
      s.tifo = s.tier === 0 && s.end !== 0 && Math.abs(s.x) < tifoHalf;
      s.ultra = s.end !== 0 && !s.tifo;
      const team = s.z < 0 ? BLUE : ORANGE;
      if (s.letter) s.color = new THREE.Color(0.95, 0.93, 0.88);
      else if (s.tier === 1) s.color = new THREE.Color(0.11, 0.12, 0.14);
      else s.color = team.clone().multiplyScalar(Math.abs(s.z) < 6 ? 0.25 : 0.55).addScalar(0.03);
    }
    // ---------- Occupation ----------
    const cap = small ? 4500 : 11000;
    const want = s => s.tifo ? 0 : s.letter ? 0.12 : s.ultra ? 0.9 : s.tier === 0 ? 0.72 : 0.5;
    let fans = seats.filter((s, i) => hash1(i * 1.37 + s.x * 0.11) < want(s));
    if (fans.length > cap) { const keep = cap / fans.length; fans = fans.filter((s, i) => hash1(i * 7.7 + 3.1) < keep); }
    // ---------- Secteurs ----------
    const sectorOf = o => Math.floor(((Math.atan2(o.z, o.x) + Math.PI) / (Math.PI * 2)) * SECTORS) % SECTORS;
    const seatGeo = seatGeometry(), fanGeo = fanGeometry();
    const seatMat = new THREE.MeshLambertMaterial();
    // Supporters : animation dans le shader (éclairage Lambert, léger)
    this.fanU = { uTime: this.time, uCheer: this.cheer };
    const fanMat = new THREE.MeshLambertMaterial();
    fanMat.onBeforeCompile = sh => {
      Object.assign(sh.uniforms, this.fanU);
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', `#include <common>
          uniform float uTime, uCheer; attribute float aPart; attribute vec4 aFan; varying vec3 vFanCol; varying float vPartF; varying float vLocalY;
          mat3 rotX(float a){ float c = cos(a), s = sin(a); return mat3(1.0, 0.0, 0.0, 0.0, c, s, 0.0, -s, c); }
          mat3 rotZ(float a){ float c = cos(a), s = sin(a); return mat3(c, s, 0.0, -s, c, 0.0, 0.0, 0.0, 1.0); }`)
        .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
          float r1 = aFan.x, r2 = aFan.y, ultra = aFan.z;
          float e = clamp(uCheer * (0.7 + r2 * 0.6) + ultra * 0.55 + (r1 - 0.5) * 0.25, 0.0, 1.6);
          float standUp = clamp(smoothstep(0.4, 0.75, e) + ultra, 0.0, 1.0);
          float armUp = smoothstep(0.55, 1.1, e) * (0.65 + 0.35 * sin(uTime * (2.2 + r2 * 2.5) + r1 * 30.0));
          float clap = smoothstep(0.25, 0.55, e) * (1.0 - armUp) * 0.25 * (0.5 + 0.5 * sin(uTime * 9.0 + r1 * 20.0));
          float armA = mix(0.1, 2.75, armUp) + clap;
          vec3 pivotL = vec3(-0.245, 0.98, 0.0), pivotR = vec3(0.245, 0.98, 0.0);
          mat3 RL = rotZ(-armUp * 0.35) * rotX(-armA), RR = rotZ(armUp * 0.35) * rotX(-armA);
          if (aPart > 1.5 && aPart < 2.5) objectNormal = RL * objectNormal;
          if (aPart > 2.5 && aPart < 3.5) objectNormal = RR * objectNormal;`)
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          vLocalY = position.y; vPartF = aPart;
          if (aPart > 1.5 && aPart < 2.5) transformed = pivotL + RL * (position - pivotL);
          if (aPart > 2.5 && aPart < 3.5) transformed = pivotR + RR * (position - pivotR);
          float lift = standUp * 0.42 + max(0.0, sin(uTime * (6.5 + r1 * 2.0) + r2 * 40.0)) * smoothstep(0.8, 1.3, e) * 0.16;
          if (aPart > 3.5) transformed.y *= 1.0 + standUp * 0.95; else transformed.y += lift;
          transformed.x += sin(uTime * 0.9 + r1 * 17.0) * 0.03 * position.y;
          vec3 skinA = vec3(0.86, 0.64, 0.5), skinB = vec3(0.32, 0.2, 0.13);
          vFanCol = (aPart > 0.5 && aPart < 1.5) ? mix(skinA, skinB, r2 * r2) : (aPart > 3.5 ? vec3(0.07, 0.08, 0.11) * (0.8 + r1 * 0.5) : instanceColor);`)
        .replace('#include <color_vertex>', '');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vFanCol; varying float vPartF; varying float vLocalY;')
        .replace('#include <color_fragment>', `
          vec3 fc = vFanCol;
          if (vPartF > 0.5 && vPartF < 1.5 && vLocalY > 1.2) fc *= 0.35;                 // cheveux
          if (vPartF > 1.5 && vPartF < 3.5 && vLocalY < 0.6) fc = mix(fc, vec3(0.7, 0.5, 0.38), 0.7);   // mains
          diffuseColor.rgb = fc;`);
    };
    const shirts = {
      blue: ['#1d5fd6', '#2f7bff', '#f2f4f7', '#0d2a52', '#5aa0ff', '#1d5fd6'],
      orange: ['#ff7a1a', '#ff9a3d', '#f2f4f7', '#5a2408', '#ffc06b', '#ff7a1a'],
      neutral: ['#d9d5c8', '#1b2a36', '#8b1e22', '#2e3b2a', '#c9a24a', '#e6e6e6', '#3a3f46'],
    };
    this.meshes = [];
    this.fanMeshes = [];
    for (let k = 0; k < SECTORS; k++) {
      const ss = seats.filter(s => sectorOf(s) === k && !s.tifo), ff = fans.filter(s => sectorOf(s) === k);
      const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
      if (ss.length) {
        const im = new THREE.InstancedMesh(seatGeo, seatMat, ss.length);
        ss.forEach((s, i) => { m4.compose(p.set(s.x, s.y, s.z), q.setFromAxisAngle(up, s.yaw), sc.set(1, 1, 1)); im.setMatrixAt(i, m4); im.setColorAt(i, s.color); });
        im.computeBoundingSphere(); scene.add(im); this.meshes.push(im);
      }
      if (ff.length) {
        const geo = fanGeo.clone();
        const aFan = new Float32Array(ff.length * 4);
        geo.setAttribute('aFan', new THREE.InstancedBufferAttribute(aFan, 4));
        const im = new THREE.InstancedMesh(geo, fanMat, ff.length);
        const col = new THREE.Color();
        ff.forEach((s, i) => {
          const r1 = hash1(s.x * 3.1 + s.z * 7.3), r2 = hash1(s.x * 5.7 - s.z * 2.9 + 1.3);
          const kscale = 0.92 + r1 * 0.16;
          m4.compose(p.set(s.x, s.y, s.z), q.setFromAxisAngle(up, s.yaw + (r2 - 0.5) * 0.3), sc.set(kscale, kscale, kscale)); im.setMatrixAt(i, m4);
          const set = s.ultra ? (s.z < 0 ? shirts.blue : shirts.orange) : r1 < 0.2 ? shirts.neutral : (s.z < 0 ? shirts.blue : shirts.orange);
          im.setColorAt(i, col.set(set[Math.floor(r2 * set.length) % set.length]));
          aFan.set([r1, r2, s.ultra ? 1 : 0, 0], i * 4);
        });
        im.userData.full = ff.length; im.computeBoundingSphere(); scene.add(im); this.meshes.push(im); this.fanMeshes.push(im);
      }
    }
    this.seatCount = seats.length; this.fanCount = fans.length;

    // ---------- Drapeaux des groupes de supporters ----------
    {
      const holders = fans.filter((s, i) => s.ultra && hash1(i * 3.3 + 0.7) < (small ? 0.03 : 0.06));
      const n = holders.length;
      const flagG = new THREE.PlaneGeometry(1.5, 1.0, 8, 3); flagG.translate(0.75, 0, 0);
      const ig = new THREE.InstancedBufferGeometry().copy(flagG); ig.instanceCount = n;
      const aPh = new Float32Array(n); ig.setAttribute('aPhase', new THREE.InstancedBufferAttribute(aPh, 1));
      const mat = new THREE.ShaderMaterial({ uniforms: { uTime: this.time, uCheer: this.cheer }, side: THREE.DoubleSide,
        vertexShader: `attribute float aPhase; uniform float uTime, uCheer; varying vec2 vUv; varying vec3 vCol; varying float vSh;
          void main(){ vUv = uv; vCol = instanceColor; vec3 p = position; float w = p.x / 1.5;
            float sw = sin(uTime * (1.8 + aPhase * .1) + aPhase) * .9;                // le porteur balance le drapeau
            float c = cos(sw), s = sin(sw); p = vec3(p.x * c - (p.y + 0.0) * s * .0, p.y, p.z);
            p.z += sin(p.x * 3.5 - uTime * 8.0 + aPhase) * .18 * w;
            vec3 q = vec3(p.x * cos(sw), p.y + p.x * sin(sw) * .5, p.z + p.x * sin(sw) * .6);
            vSh = .8 + .2 * cos(p.x * 3.5 - uTime * 8.0 + aPhase);
            gl_Position = projectionMatrix * viewMatrix * instanceMatrix * vec4(q, 1.0); }`,
        fragmentShader: `varying vec2 vUv; varying vec3 vCol; varying float vSh;
          void main(){ vec3 c = vCol; float st = step(.5, fract(vUv.x * 2.0)); c = mix(c, vec3(1.0), st * .85 * step(.33, vUv.y) * step(vUv.y, .66));
            gl_FragColor = vec4(c * vSh, 1.0);
            #include <tonemapping_fragment>
            #include <colorspace_fragment>
          }` });
      const im = new THREE.InstancedMesh(ig, mat, n), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
      holders.forEach((s, i) => { m4.compose(new THREE.Vector3(s.x, s.y + 2.25, s.z), q.setFromAxisAngle(up, s.yaw + Math.PI / 2), new THREE.Vector3(1, 1, 1)); im.setMatrixAt(i, m4); im.setColorAt(i, s.z < 0 ? BLUE : ORANGE); aPh[i] = i * 2.31; });
      im.frustumCulled = false; scene.add(im);
    }

    // ---------- Tifos géants sur les virages ----------
    {
      const r0 = S.rows.find(r => r.tier === 0 && r.k === 0), r1 = S.rows.filter(r => r.tier === 0).pop();
      for (const sz of [-1, 1]) {
        const team = sz < 0 ? 'blue' : 'orange';
        const c = Object.assign(document.createElement('canvas'), { width: 1024, height: 512 }), x = c.getContext('2d');
        const g = x.createLinearGradient(0, 0, 0, 512);
        if (team === 'blue') { g.addColorStop(0, '#0c2f86'); g.addColorStop(1, '#2f7bff'); } else { g.addColorStop(0, '#8a2c04'); g.addColorStop(1, '#ff7a1a'); }
        x.fillStyle = g; x.fillRect(0, 0, 1024, 512);
        for (let i = 0; i < 12; i++) { x.fillStyle = i % 2 ? 'rgba(255,255,255,.08)' : 'rgba(0,0,0,.08)'; x.beginPath(); x.moveTo(512, 256); x.arc(512, 256, 900, i / 12 * Math.PI * 2, (i + 1) / 12 * Math.PI * 2); x.fill(); }
        x.fillStyle = '#ffd36a'; x.beginPath(); for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2 - Math.PI / 2, rr = i % 2 ? 40 : 95; x.lineTo(512 + Math.cos(a) * rr, 120 + Math.sin(a) * rr); } x.fill();
        x.font = '900 190px "Archivo", Impact, "Arial Black", Arial, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
        x.lineWidth = 14; x.strokeStyle = 'rgba(0,0,0,.35)'; x.strokeText('JACKPOT', 512, 330); x.fillStyle = '#ffffff'; x.fillText('JACKPOT', 512, 330);
        x.font = '800 64px "Archivo", Arial, sans-serif'; x.fillStyle = '#ffd36a'; x.fillText(team === 'blue' ? 'ALLEZ LES BLEUS' : 'ORANGE POUR TOUJOURS', 512, 455);
        const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
        const W = tifoHalf * 2, zF = sz * (S.FZ + r0.d0), zB = sz * (S.FZ + r1.d1), yF = r0.y + 0.9, yB = r1.y + 0.9;
        const geo = new THREE.PlaneGeometry(W, 1, 40, 12);
        const pos = geo.attributes.position;
        for (let i = 0; i < pos.count; i++) { const t = pos.getY(i) + 0.5; pos.setXYZ(i, pos.getX(i), yF + (yB - yF) * t, zF + (zB - zF) * t); }
        geo.computeVertexNormals();
        const mat = new THREE.MeshLambertMaterial({ map: tex, side: THREE.DoubleSide });
        mat.onBeforeCompile = sh => { sh.uniforms.uTime = this.time; sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n transformed.y += sin(position.x * .35 + uTime * 1.6) * .12 + sin(position.z * .5 - uTime * 1.1) * .1;'); };
        const m = new THREE.Mesh(geo, mat); if (sz > 0) m.scale.x = -1; scene.add(m);
      }
    }
  }

  /** Ajuste la densité affichée (qualité adaptative). */
  setDensity(k) { for (const m of this.fanMeshes) m.count = Math.max(1, Math.floor(m.userData.full * k)); }

  update(dt, t, cheer) {
    this.time.value = t;
    this.cheer.value += (cheer - this.cheer.value) * Math.min(1, dt * 2.5);
  }
}
