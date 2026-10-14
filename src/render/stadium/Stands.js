import * as THREE from 'three';
import { roundedPath, P3, Quads, beamMatrix, hash1 } from './geom.js';

/**
 * Tribunes d'un vrai stade : deux anneaux de gradins (marches béton, nez de marche, escaliers dans les allées),
 * niveau des loges vitrées éclairées, rubans LED, toit en porte-à-faux sur fermes métalliques (membrane translucide,
 * coursive), rampes de gros projecteurs au bord du toit, quatre pylônes d'éclairage d'angle, façade à ailettes,
 * écrans géants suspendus, drapeaux sur le toit. Purement visuel : aucune de ces géométries n'a de collider.
 */
export const TEAM_RGB = { blue: [0.18, 0.45, 1.0], orange: [1.0, 0.42, 0.08] };

export function standLayout(C, layout) {
  const FX = layout.hx + 6, FZ = layout.hz + C.GOAL_DEPTH + 4.5, RC = 16;
  // Profil (d vers l'extérieur depuis le pied de tribune, y vers le haut)
  const rows = [];
  let d = 0.3, y = 2.8;
  const wall = { y: 2.8 };
  for (let k = 0; k < 18; k++) { rows.push({ tier: 0, k, d0: d, d1: d + 0.8, y }); d += 0.8; y += 0.4; }
  const lowerEnd = { d, y };                       // y = 10.0
  const vip = { d0: d, d1: d + 1.6, y0: y, y1: y + 2.6 };
  d = vip.d1 + 0.3; y = vip.y1 + 1.0;              // balcon de l'anneau supérieur
  const upperStart = { d: vip.d1, y };
  for (let k = 0; k < 16; k++) { rows.push({ tier: 1, k, d0: d, d1: d + 0.82, y }); d += 0.82; y += 0.55; }
  const back = { d, y0: y, y1: y + 2.4 };
  const roof = { dBack: d + 0.6, dFront: 4.2, yBackTop: back.y1 + 4.4, yBackBot: back.y1 + 0.4, yFrontTop: back.y1 + 3.6, yFrontBot: back.y1 + 2.4 };
  return { FX, FZ, RC, rows, wall, lowerEnd, vip, upperStart, back, roof };
}

/** Allées (escaliers) : abscisse curviligne modulo la période. */
const AISLE_PERIOD = 13, AISLE_W = 1.3;
export const isAisle = s => (s % AISLE_PERIOD) < AISLE_W;
/** Vomitoires (accès au cœur de l'anneau inférieur), entre deux allées, rangées 7 à 11. */
const VOM_PERIOD = 39, VOM_START = 4.2, VOM_W = 4.4, VOM_K0 = 7, VOM_K1 = 11;
export const isVom = (s, tier, k) => tier === 0 && k >= VOM_K0 && k <= VOM_K1 && (s % VOM_PERIOD) >= VOM_START && (s % VOM_PERIOD) < VOM_START + VOM_W;

export class Stands {
  constructor(scene, C, layout, { small = false, fogColor } = {}) {
    this.scene = scene; this.small = small;
    const S = this.S = standLayout(C, layout);
    const path = this.path = roundedPath(S.FX, S.FZ, S.RC, 0.65);
    this.time = { value: 0 };
    this.goalFlash = { value: new THREE.Vector4(0, 0, 0, 0) };   // rgb + intensité
    const BLUE = new THREE.Color().setRGB(...TEAM_RGB.blue), ORANGE = new THREE.Color().setRGB(...TEAM_RGB.orange);
    const pts = path.pts, N = pts.length;
    const nrm = new THREE.Vector3(), col = new THREE.Color();
    const C_ = h => new THREE.Color(h);
    const COL = {
      wall: C_('#30353c'), cap: C_('#8a9098'), tread: C_('#6d7178'), riser: C_('#565a61'), nose: C_('#c9a640'),
      aisle: C_('#8f949b'), aisleNose: C_('#e6c14a'), vipFloor: C_('#3c4148'), soffit: C_('#2a2e34'), back: C_('#23272c'),
      balcony: C_('#1d2126'),
    };

    // ================= Gradins (béton) =================
    const Q = new Quads();
    const seg = (p0, p1, d0, y0, d1, y1, c, N3) => Q.quad(P3(p0, d0, y0), P3(p1, d0, y0), P3(p1, d1, y1), P3(p0, d1, y1), N3, c);
    const inward = (p0, p1, out) => out.set(-(p0.nx + p1.nx) / 2, 0, -(p0.nz + p1.nz) / 2).normalize();
    const shade = y => 1 - 0.38 * THREE.MathUtils.smoothstep(y, S.upperStart.y, S.back.y1);   // ombre sous le toit (occultation précalculée)
    for (let i = 0; i < N; i++) {
      const p0 = pts[i], p1 = pts[(i + 1) % N], aisle = isAisle(p0.s);
      inward(p0, p1, nrm);
      // Mur de pied de tribune + chaperon
      seg(p0, p1, 0, 0, 0, S.wall.y, COL.wall, nrm);
      Q.quad(P3(p0, 0, S.wall.y), P3(p1, 0, S.wall.y), P3(p1, 0.3, S.wall.y), P3(p0, 0.3, S.wall.y), new THREE.Vector3(0, 1, 0), COL.cap);
      // Rangées : marche (giron) + contremarche ; dans les allées, deux demi-marches et nez jaunes
      const vom = isVom(p0.s, 0, VOM_K0);
      for (const r of S.rows) {
        const next = S.rows.find(q => q.tier === r.tier && q.k === r.k + 1);
        const rise = next ? next.y - r.y : 0;
        const k = shade(r.y);
        if (vom && r.tier === 0 && r.k >= VOM_K0 && r.k <= VOM_K1) {
          // vomitoire : sol du couloir, mur du fond sombre, linteau au niveau de la rangée suivante
          const r0 = S.rows[VOM_K0], top = S.rows[VOM_K1 + 1];
          if (r.k === VOM_K0) {
            seg(p0, p1, r0.d0, r0.y, top.d0, r0.y, COL.vipFloor, new THREE.Vector3(0, 1, 0));
            seg(p0, p1, top.d0, r0.y, top.d0, top.y, new THREE.Color(0.012, 0.013, 0.016), nrm);
            Q.quad(P3(p0, r0.d0, top.y - 0.05), P3(p1, r0.d0, top.y - 0.05), P3(p1, top.d0, top.y - 0.05), P3(p0, top.d0, top.y - 0.05), new THREE.Vector3(0, -1, 0), COL.soffit);
            seg(p0, p1, r0.d0, top.y - 0.45, r0.d0, top.y, COL.riser, nrm);
          }
          continue;
        }
        if (aisle) {
          const dm = (r.d0 + r.d1) / 2;
          seg(p0, p1, r.d0, r.y, dm, r.y, col.copy(COL.aisle).multiplyScalar(k), new THREE.Vector3(0, 1, 0));
          seg(p0, p1, dm, r.y, dm, r.y + rise / 2, col.copy(COL.aisleNose).multiplyScalar(k), nrm);
          seg(p0, p1, dm, r.y + rise / 2, r.d1, r.y + rise / 2, col.copy(COL.aisle).multiplyScalar(k), new THREE.Vector3(0, 1, 0));
          if (rise) seg(p0, p1, r.d1, r.y + rise / 2, r.d1, r.y + rise, col.copy(COL.aisleNose).multiplyScalar(k), nrm);
        } else {
          seg(p0, p1, r.d0, r.y, r.d1, r.y, col.copy(COL.tread).multiplyScalar(k * (0.94 + 0.08 * (r.k % 2))), new THREE.Vector3(0, 1, 0));
          if (rise) {
            seg(p0, p1, r.d1, r.y, r.d1, r.y + rise - 0.05, col.copy(COL.riser).multiplyScalar(k), nrm);
            seg(p0, p1, r.d1, r.y + rise - 0.05, r.d1, r.y + rise, col.copy(COL.nose).multiplyScalar(k * 0.75), nrm);
          }
        }
      }
      // Niveau des loges : sol, plafond (sous-face du balcon), face du balcon de l'anneau supérieur
      const V = S.vip;
      seg(p0, p1, S.lowerEnd.d, V.y0, V.d1, V.y0, COL.vipFloor, new THREE.Vector3(0, 1, 0));
      Q.quad(P3(p0, S.lowerEnd.d, V.y1), P3(p1, S.lowerEnd.d, V.y1), P3(p1, V.d1, V.y1), P3(p0, V.d1, V.y1), new THREE.Vector3(0, -1, 0), COL.soffit);
      seg(p0, p1, S.lowerEnd.d, V.y1, S.lowerEnd.d, S.upperStart.y, COL.balcony, nrm);
      Q.quad(P3(p0, S.lowerEnd.d, S.upperStart.y), P3(p1, S.lowerEnd.d, S.upperStart.y), P3(p1, S.upperStart.d + 0.3, S.upperStart.y), P3(p0, S.upperStart.d + 0.3, S.upperStart.y), new THREE.Vector3(0, 1, 0), COL.cap);
      // Mur du fond
      seg(p0, p1, S.back.d, S.back.y0, S.back.d, S.back.y1, COL.back, nrm);
    }
    // Murets latéraux des vomitoires et plaques de section
    {
      const r0 = S.rows[VOM_K0], top = S.rows[VOM_K1 + 1];
      const signs = [];
      for (let i = 0; i < N; i++) {
        const a = pts[i], b = pts[(i + 1) % N];
        const va = isVom(a.s, 0, VOM_K0), vb = isVom(b.s, 0, VOM_K0);
        if (va === vb) continue;
        const e = va ? b : a;   // bord du vomitoire
        const t = new THREE.Vector3(b.x - a.x, 0, b.z - a.z).normalize();
        const n3 = va ? t.clone().negate() : t.clone();
        Q.quad(P3(e, r0.d0, r0.y), P3(e, top.d0, r0.y), P3(e, top.d0, top.y), P3(e, r0.d0, top.y), n3, COL.wall);
        if (!va) signs.push(e);
      }
      // plaques de section (lettres) au-dessus des vomitoires
      const c = Object.assign(document.createElement('canvas'), { width: 1024, height: 64 }), x = c.getContext('2d');
      x.fillStyle = '#10151b'; x.fillRect(0, 0, 1024, 64);
      x.textAlign = 'center'; x.textBaseline = 'middle'; x.font = '800 44px "Archivo", Arial, sans-serif';
      for (let i = 0; i < 16; i++) { x.fillStyle = '#ffd36a'; x.fillText(String.fromCharCode(65 + i), i * 64 + 32, 34); x.fillStyle = '#ffd36a'; x.fillRect(i * 64 + 4, 56, 56, 3); }
      const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
      const sg = new THREE.PlaneGeometry(1.2, 0.6);
      signs.forEach((e, i) => {
        const m = new THREE.Mesh(sg, new THREE.MeshBasicMaterial({ map: tex.clone(), color: new THREE.Color(1.4, 1.4, 1.4) }));
        m.material.map.needsUpdate = true; m.material.map.repeat.set(1 / 16, 1); m.material.map.offset.set((i % 16) / 16, 0);
        const p = P3(e, r0.d0 - 0.02, top.y + 0.1); m.position.copy(p);
        m.lookAt(p.x - e.nx, p.y, p.z - e.nz);
        // décalée vers le milieu de l'ouverture
        const tdir = new THREE.Vector3(-e.nz, 0, e.nx); m.position.addScaledVector(tdir, VOM_W / 2);
        scene.add(m);
      });
    }
    const standMat = new THREE.MeshLambertMaterial({ vertexColors: true });
    const standMesh = new THREE.Mesh(Q.geo(), standMat); standMesh.receiveShadow = true; scene.add(standMesh);

    // ================= Rubans LED (pied de tribune, balcon, bord du toit) =================
    this.ledCanvas = Object.assign(document.createElement('canvas'), { width: 4096, height: 128 });
    this.drawLED();
    this.ledTex = new THREE.CanvasTexture(this.ledCanvas); this.ledTex.colorSpace = THREE.SRGBColorSpace; this.ledTex.wrapS = THREE.RepeatWrapping; this.ledTex.anisotropy = 8;
    this.ledU = { uMap: { value: this.ledTex }, uTime: this.time, uFlash: this.goalFlash, uScroll: { value: 0 } };
    const ledMat = new THREE.ShaderMaterial({ uniforms: this.ledU, side: THREE.DoubleSide,
      vertexShader: 'varying vec2 vUv; varying vec3 vW; void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
      fragmentShader: `uniform sampler2D uMap; uniform float uTime, uScroll; uniform vec4 uFlash; varying vec2 vUv; varying vec3 vW;
        void main(){
          vec2 uv = vec2(vUv.x + uScroll, vUv.y);
          vec3 c = texture2D(uMap, uv).rgb;
          // trame de diodes
          vec2 px = fract(vec2(vUv.x * 4096.0 / 4.0, vUv.y * 32.0));
          float dot = smoothstep(.5, .2, length(px - .5));
          vec3 fl = uFlash.rgb * (0.6 + 0.4 * sin(uTime * 16.0 + vW.x * .2 + vW.z * .2));
          c = mix(c, fl * 1.6, uFlash.w);
          gl_FragColor = vec4(c * (0.55 + 0.75 * dot) * 2.2, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }` });
    this.ledMaterial = ledMat;
    const ribbon = (dd, y0, y1, uLen) => {
      const q = new Quads();
      for (let i = 0; i < N; i++) {
        const p0 = pts[i], p1 = pts[(i + 1) % N];
        inward(p0, p1, nrm);
        const u0 = p0.s / uLen, u1 = (i + 1 === N ? path.L : p1.s) / uLen;
        q.quad(P3(p0, dd, y0), P3(p1, dd, y0), P3(p1, dd, y1), P3(p0, dd, y1), nrm, new THREE.Color(1, 1, 1), [[u0, 0], [u1, 0], [u1, 1], [u0, 1]]);
      }
      return new THREE.Mesh(q.geo(), ledMat);
    };
    scene.add(ribbon(-0.04, 1.35, 2.6, 62));
    scene.add(ribbon(S.lowerEnd.d - 0.04, S.vip.y1 + 0.15, S.upperStart.y - 0.1, 50));

    // ================= Loges vitrées (intérieur éclairé) =================
    {
      const c = Object.assign(document.createElement('canvas'), { width: 512, height: 128 }), x = c.getContext('2d');
      const g = x.createLinearGradient(0, 0, 0, 128); g.addColorStop(0, '#f7d9a8'); g.addColorStop(0.5, '#d9a466'); g.addColorStop(1, '#5a3b22');
      x.fillStyle = g; x.fillRect(0, 0, 512, 128);
      // spots au plafond, silhouettes d'invités, montants
      for (let i = 0; i < 16; i++) { x.fillStyle = 'rgba(255,250,235,0.9)'; x.beginPath(); x.ellipse(16 + i * 32, 8, 7, 3, 0, 0, Math.PI * 2); x.fill(); }
      for (let i = 0; i < 14; i++) { const px = 18 + i * 35 + (i * 7919 % 13); x.fillStyle = `rgba(${30 + i % 3 * 10},${22 + i % 4 * 6},${18},0.85)`; x.beginPath(); x.ellipse(px, 70, 8, 9, 0, 0, Math.PI * 2); x.fill(); x.fillRect(px - 11, 78, 22, 50); }
      x.fillStyle = '#1b1f24'; for (let i = 0; i <= 4; i++) x.fillRect(i * 128 - 3, 0, 6, 128); x.fillRect(0, 0, 512, 5); x.fillRect(0, 120, 512, 8);
      const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.wrapS = THREE.RepeatWrapping;
      const q = new Quads();
      for (let i = 0; i < N; i++) {
        const p0 = pts[i], p1 = pts[(i + 1) % N]; inward(p0, p1, nrm);
        const u0 = p0.s / 16, u1 = (i + 1 === N ? path.L : p1.s) / 16;
        q.quad(P3(p0, S.vip.d1, S.vip.y0), P3(p1, S.vip.d1, S.vip.y0), P3(p1, S.vip.d1, S.vip.y1), P3(p0, S.vip.d1, S.vip.y1), nrm, new THREE.Color(1, 1, 1), [[u0, 0], [u1, 0], [u1, 1], [u0, 1]]);
      }
      const m = new THREE.Mesh(q.geo(), new THREE.MeshBasicMaterial({ map: tex, color: new THREE.Color(1.4, 1.3, 1.2) }));
      scene.add(m);
      // vitrage devant les loges (reflets)
      const gq = new Quads();
      for (let i = 0; i < N; i++) { const p0 = pts[i], p1 = pts[(i + 1) % N]; inward(p0, p1, nrm); gq.quad(P3(p0, S.vip.d1 - 0.6, S.vip.y0), P3(p1, S.vip.d1 - 0.6, S.vip.y0), P3(p1, S.vip.d1 - 0.6, S.vip.y1), P3(p0, S.vip.d1 - 0.6, S.vip.y1), nrm, new THREE.Color(1, 1, 1)); }
      scene.add(new THREE.Mesh(gq.geo(), new THREE.MeshBasicMaterial({ color: 0x0a1218, transparent: true, opacity: 0.3, depthWrite: false })));
    }

    // ================= Garde-corps : main courante des allées et du balcon =================
    {
      const mats = [];
      const tmp = new THREE.Matrix4(), a = new THREE.Vector3(), b = new THREE.Vector3();
      // main courante en tête de chaque anneau
      for (let i = 0; i < N; i += 2) {
        const p0 = pts[i], p1 = pts[(i + 2) % N];
        for (const [dd, yy] of [[0.15, S.wall.y + 1.0], [S.lowerEnd.d + 0.15, S.upperStart.y + 1.0]]) mats.push(beamMatrix(P3(p0, dd, yy), P3(p1, dd, yy), 0.05, 0.05, tmp.clone()));
      }
      // rampes d'escalier au centre des allées
      for (let s = AISLE_W / 2; s < path.L; s += AISLE_PERIOD) {
        const pt = pts[Math.min(N - 1, Math.round(s / path.L * N))];
        for (const tier of [0, 1]) {
          const rs = S.rows.filter(r => r.tier === tier), r0 = rs[0], r1 = rs[rs.length - 1];
          a.copy(P3(pt, r0.d0, r0.y + 0.95)); b.copy(P3(pt, r1.d1, r1.y + 0.95));
          mats.push(beamMatrix(a, b, 0.05, 0.05, tmp.clone()));
          for (let k = 0; k < rs.length; k += 4) mats.push(beamMatrix(P3(pt, rs[k].d0 + 0.4, rs[k].y), P3(pt, rs[k].d0 + 0.4, rs[k].y + 0.95), 0.04, 0.04, tmp.clone()));
        }
      }
      const im = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0xb8bec6, metalness: 0.8, roughness: 0.35 }), mats.length);
      mats.forEach((m, i) => im.setMatrixAt(i, m)); scene.add(im);
    }

    // ================= Toit : fermes métalliques, pannes, membrane, coursive =================
    const R = S.roof;
    const roofPath = roundedPath(S.FX, S.FZ, S.RC, 8.5);
    const rp = roofPath.pts;
    const node = (pt, d, y) => P3(pt, d, y);
    // nœuds d'une ferme : membrure haute et basse, de l'arrière (dBack) au bord (dFront)
    const NP = 7;
    const chordTop = t => [R.dBack + (R.dFront - R.dBack) * t, R.yBackTop + (R.yFrontTop - R.yBackTop) * t];
    const chordBot = t => [R.dBack + (R.dFront - R.dBack) * t, R.yBackBot + (R.yFrontBot - R.yBackBot) * Math.pow(t, 0.8)];
    {
      const beams = [];
      const tmp = new THREE.Matrix4();
      for (let i = 0; i < rp.length; i++) {
        const pt = rp[i], nx = rp[(i + 1) % rp.length];
        for (let j = 0; j < NP; j++) {
          const t0 = j / NP, t1 = (j + 1) / NP;
          const [ad, ay] = chordTop(t0), [bd, by] = chordTop(t1), [cd, cy] = chordBot(t0), [dd2, dy] = chordBot(t1);
          beams.push(beamMatrix(node(pt, ad, ay), node(pt, bd, by), 0.35, 0.35, tmp.clone()));
          beams.push(beamMatrix(node(pt, cd, cy), node(pt, dd2, dy), 0.3, 0.3, tmp.clone()));
          beams.push(beamMatrix(node(pt, ad, ay), node(pt, cd, cy), 0.2, 0.2, tmp.clone()));
          beams.push(beamMatrix(j % 2 ? node(pt, ad, ay) : node(pt, cd, cy), j % 2 ? node(pt, dd2, dy) : node(pt, bd, by), 0.16, 0.16, tmp.clone()));
          // pannes (entre deux fermes)
          beams.push(beamMatrix(node(pt, ad, ay), node(nx, ad, ay), 0.18, 0.18, tmp.clone()));
          if (j % 2 === 0) beams.push(beamMatrix(node(pt, cd, cy), node(nx, cd, cy), 0.14, 0.14, tmp.clone()));
        }
        // poteau arrière, de la façade au toit
        beams.push(beamMatrix(node(pt, R.dBack + 0.4, 0), node(pt, R.dBack + 0.4, R.yBackTop), 0.6, 0.6, tmp.clone()));
        // coursive au bord du toit
        const [fd, fy] = chordBot(1);
        beams.push(beamMatrix(node(pt, fd + 0.2, fy - 1.0), node(nx, fd + 0.2, fy - 1.0), 0.12, 0.12, tmp.clone()));
      }
      const im = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0x9aa1aa, metalness: 0.85, roughness: 0.42 }), beams.length);
      beams.forEach((m, i) => im.setMatrixAt(i, m)); scene.add(im);
      this.trussCount = beams.length;
    }
    // Membrane (dessus) : translucide, laisse filtrer la lumière du ciel
    {
      const q = new Quads(), qb = new Quads();
      for (let i = 0; i < N; i += 2) {
        const p0 = pts[i], p1 = pts[(i + 2) % N];
        const [bd, by] = chordTop(0), [fd, fy] = chordTop(1);
        q.quad(P3(p0, bd, by + 0.2), P3(p1, bd, by + 0.2), P3(p1, fd, fy + 0.2), P3(p0, fd, fy + 0.2), new THREE.Vector3(0, -1, 0), new THREE.Color(1, 1, 1));
        // bandeau du bord du toit (fascia) : support du ruban LED haut
        inward(p0, p1, nrm);
        qb.quad(P3(p0, fd - 0.05, chordBot(1)[1] - 0.1), P3(p1, fd - 0.05, chordBot(1)[1] - 0.1), P3(p1, fd - 0.05, fy + 0.4), P3(p0, fd - 0.05, fy + 0.4), nrm, new THREE.Color(0.12, 0.13, 0.15));
      }
      const mem = new THREE.Mesh(q.geo(), new THREE.MeshLambertMaterial({ color: 0x9aa2ad, side: THREE.DoubleSide }));
      scene.add(mem);
      scene.add(new THREE.Mesh(qb.geo(), new THREE.MeshLambertMaterial({ vertexColors: true })));
      const [fd, fy] = chordTop(1);
      scene.add(ribbon(fd - 0.12, chordBot(1)[1] + 0.05, fy + 0.3, 70));
    }

    // ================= Projecteurs : rampes au bord du toit + pylônes d'angle =================
    const lamps = [];   // { p: Vector3, aim: Vector3 }
    {
      const [fd] = chordBot(1);
      const yLamp = chordBot(1)[1] - 0.7;
      const step = small ? 2.4 : 1.6;
      const fpath = roundedPath(S.FX, S.FZ, S.RC, step);
      for (const pt of fpath.pts) for (const row of [0, 1]) {
        const p = P3(pt, fd + 0.6 + row * 0.9, yLamp - row * 0.25);
        // visée : un point du terrain derrière le pied de la tribune opposée, avec un peu de dispersion
        const aim = new THREE.Vector3(pt.x * 0.25 + (hash1(p.x + p.z) - 0.5) * 20, 0, pt.z * 0.25 + (hash1(p.z - p.x) - 0.5) * 20);
        lamps.push({ p, aim, k: 1 });
      }
    }
    // Pylônes d'angle (treillis) avec tête de 6 × 5 projecteurs
    this.towers = [];
    {
      const beams = [], tmp = new THREE.Matrix4();
      const H = 54, base = 2.2, top = 1.1;
      for (const [sx, sz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
        const cx = sx * (S.FX + S.back.d + 14), cz = sz * (S.FZ + S.back.d + 8);
        const center = new THREE.Vector3(cx, 0, cz);
        const legs = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
        const legAt = (l, y) => { const w = base + (top - base) * (y / H); return new THREE.Vector3(cx + legs[l][0] * w, y, cz + legs[l][1] * w); };
        for (let l = 0; l < 4; l++) {
          beams.push(beamMatrix(legAt(l, 0), legAt(l, H), 0.35, 0.35, tmp.clone()));
          for (let y = 0; y < H; y += 4.5) {
            beams.push(beamMatrix(legAt(l, y), legAt((l + 1) % 4, y), 0.14, 0.14, tmp.clone()));
            beams.push(beamMatrix(legAt(l, y), legAt((l + 1) % 4, Math.min(H, y + 4.5)), 0.1, 0.1, tmp.clone()));
          }
        }
        // tête : cadre orienté vers le centre du terrain, incliné vers le bas
        const head = new THREE.Group(); head.position.set(cx, H + 3.5, cz);
        head.lookAt(0, -18, 0);
        scene.add(head);
        const frame = new THREE.Mesh(new THREE.BoxGeometry(10.5, 8, 0.5), new THREE.MeshStandardMaterial({ color: 0x3b4148, metalness: 0.8, roughness: 0.5 }));
        frame.position.z = -0.45; head.add(frame);
        head.updateMatrixWorld(true);
        for (let i = 0; i < 6; i++) for (let j = 0; j < 5; j++) {
          const p = new THREE.Vector3(-4.3 + i * 1.72, -3.1 + j * 1.55, 0.1).applyMatrix4(head.matrixWorld);
          lamps.push({ p, aim: new THREE.Vector3(cx * 0.1 + (i - 2.5) * 8, 0, cz * 0.1 + (j - 2) * 8), k: 1.5 });
        }
        this.towers.push({ center, head });
      }
      const im = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0x8c939b, metalness: 0.85, roughness: 0.45 }), beams.length);
      beams.forEach((m, i) => im.setMatrixAt(i, m)); scene.add(im);
    }
    // Projecteurs instanciés : corps (réflecteur) + lentille émissive + halo
    {
      const n = lamps.length;
      const bodyG = new THREE.CylinderGeometry(0.42, 0.34, 0.5, 14, 1, true); bodyG.rotateX(Math.PI / 2);
      const backG = new THREE.CircleGeometry(0.34, 14); backG.rotateY(Math.PI); backG.translate(0, 0, -0.25);
      const lensG = new THREE.CircleGeometry(0.39, 18); lensG.translate(0, 0, 0.22);
      const bodyM = new THREE.InstancedMesh(bodyG, new THREE.MeshStandardMaterial({ color: 0x2c3036, metalness: 0.7, roughness: 0.4, side: THREE.DoubleSide }), n);
      const backM = new THREE.InstancedMesh(backG, new THREE.MeshStandardMaterial({ color: 0x24282d, metalness: 0.6, roughness: 0.5 }), n);
      this.lensMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(5.5, 5.3, 4.9), fog: false });
      const lensM = new THREE.InstancedMesh(lensG, this.lensMat, n);
      const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(1, 1, 1), look = new THREE.Matrix4();
      const glowPos = new Float32Array(n * 3), glowK = new Float32Array(n);
      lamps.forEach((L, i) => {
        look.lookAt(L.aim, L.p, new THREE.Vector3(0, 1, 0));   // +Z vers la cible
        q.setFromRotationMatrix(look);
        sc.setScalar(L.k);
        m4.compose(L.p, q, sc);
        bodyM.setMatrixAt(i, m4); backM.setMatrixAt(i, m4); lensM.setMatrixAt(i, m4);
        const dir = new THREE.Vector3().subVectors(L.aim, L.p).normalize();
        glowPos.set([L.p.x + dir.x * 0.4, L.p.y + dir.y * 0.4, L.p.z + dir.z * 0.4], i * 3); glowK[i] = L.k > 1 ? 0.7 : 1;
      });
      for (const m of [bodyM, backM, lensM]) { m.frustumCulled = false; scene.add(m); }
      // Halos : quads face caméra, additifs, plus forts quand on regarde dans l'axe du projecteur
      const qg = new THREE.InstancedBufferGeometry();
      qg.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3)); qg.setIndex([0, 1, 2, 0, 2, 3]);
      qg.setAttribute('iPos', new THREE.InstancedBufferAttribute(glowPos, 3)); qg.setAttribute('iK', new THREE.InstancedBufferAttribute(glowK, 1));
      qg.instanceCount = n;
      this.glowU = { uTime: this.time, uBoost: { value: 1 } };
      const glow = new THREE.Mesh(qg, new THREE.ShaderMaterial({ uniforms: this.glowU, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
        vertexShader: `attribute vec3 iPos; attribute float iK; varying vec2 vQ; varying float vA;
          void main(){
            vQ = position.xy;
            vec3 camR = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]), camU = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
            float dist = length(iPos - cameraPosition);
            float s = (0.7 + dist * 0.011) * iK;
            vA = clamp(1.4 - dist / 260.0, 0.3, 1.0);
            gl_Position = projectionMatrix * viewMatrix * vec4(iPos + (camR * position.x + camU * position.y) * s, 1.0);
          }`,
        fragmentShader: `varying vec2 vQ; varying float vA; uniform float uBoost;
          void main(){ float r = length(vQ); if (r > 1.0) discard;
            float core = exp(-r * r * 30.0), halo = exp(-r * r * 6.0) * .08;
            float streak = exp(-abs(vQ.y) * 60.0) * (1.0 - r) * .12;
            gl_FragColor = vec4(vec3(1.0, .96, .9) * (core * 1.3 + halo + streak) * vA * uBoost, 1.0); }` }));
      glow.frustumCulled = false; glow.renderOrder = 9; scene.add(glow);
      this.lampCount = n;
    }

    // ================= Façade extérieure (ailettes + bandeau LED) =================
    {
      const fpath = roundedPath(S.FX, S.FZ, S.RC, 3.2), fp = fpath.pts, mats = [], tmp = new THREE.Matrix4();
      const dF = R.dBack + 1.6, Hf = R.yBackTop + 0.6;
      for (const pt of fp) mats.push(beamMatrix(P3(pt, dF, 0), P3(pt, dF, Hf), 0.5, 1.6, tmp.clone()));
      const im = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial({ color: 0xc9ced4 }), mats.length);
      mats.forEach((m, i) => im.setMatrixAt(i, m)); scene.add(im);
      // vitrage sombre des coursives, avec fenêtres éclairées
      const c = Object.assign(document.createElement('canvas'), { width: 256, height: 256 }), x = c.getContext('2d');
      x.fillStyle = '#0b0f14'; x.fillRect(0, 0, 256, 256);
      for (let j = 0; j < 8; j++) for (let i = 0; i < 8; i++) if (hash1(i * 17 + j * 31) > 0.45) { x.fillStyle = `rgba(255,${200 + (i * j) % 40},${140 + (i * 13) % 60},${0.35 + hash1(i + j * 7) * 0.5})`; x.fillRect(i * 32 + 3, j * 32 + 6, 26, 18); }
      const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      const q = new Quads(), ql = new Quads();
      for (let i = 0; i < fp.length; i++) {
        const p0 = fp[i], p1 = fp[(i + 1) % fp.length];
        const out = new THREE.Vector3((p0.nx + p1.nx) / 2, 0, (p0.nz + p1.nz) / 2).normalize();
        const u0 = p0.s / 12, u1 = (i + 1 === fp.length ? fpath.L : p1.s) / 12;
        q.quad(P3(p0, dF - 0.6, 0), P3(p1, dF - 0.6, 0), P3(p1, dF - 0.6, Hf - 3), P3(p0, dF - 0.6, Hf - 3), out, new THREE.Color(1, 1, 1), [[u0, 0], [u1, 0], [u1, (Hf - 3) / 12], [u0, (Hf - 3) / 12]]);
        const tc = new THREE.Color().copy(BLUE).lerp(ORANGE, THREE.MathUtils.smoothstep((p0.z + p1.z) / 2, -40, 40)).multiplyScalar(2.5);
        ql.quad(P3(p0, dF + 0.85, Hf - 2.4), P3(p1, dF + 0.85, Hf - 2.4), P3(p1, dF + 0.85, Hf - 1.2), P3(p0, dF + 0.85, Hf - 1.2), out, tc);
      }
      scene.add(new THREE.Mesh(q.geo(), new THREE.MeshBasicMaterial({ map: tex, color: new THREE.Color(1.3, 1.25, 1.2) })));
      scene.add(new THREE.Mesh(ql.geo(), new THREE.MeshBasicMaterial({ vertexColors: true, fog: false })));
    }

    // ================= Drapeaux sur le toit =================
    {
      const n = small ? 16 : 28, fpath = roundedPath(S.FX, S.FZ, S.RC, 1), fp = fpath.pts;
      const flagG = new THREE.PlaneGeometry(3.2, 2, 12, 4); flagG.translate(1.6, 0, 0);
      const aPhase = new Float32Array(n);
      const ig = new THREE.InstancedBufferGeometry().copy(flagG); ig.instanceCount = n;
      ig.setAttribute('aPhase', new THREE.InstancedBufferAttribute(aPhase, 1));
      this.flagU = { uTime: this.time };
      const fm = new THREE.ShaderMaterial({ uniforms: this.flagU, side: THREE.DoubleSide, vertexColors: false,
        vertexShader: `attribute float aPhase; uniform float uTime; varying vec2 vUv; varying float vShade; varying vec3 vCol;
          void main(){ vUv = uv; vCol = instanceColor;
            vec3 p = position; float w = p.x / 3.2;
            float wave = sin(p.x * 2.2 - uTime * 6.0 + aPhase) * .32 * w + sin(p.x * 3.7 - uTime * 9.0 + aPhase * 2.0) * .1 * w;
            p.z += wave; p.y -= w * w * .25;
            vShade = .75 + .25 * cos(p.x * 2.2 - uTime * 6.0 + aPhase);
            gl_Position = projectionMatrix * viewMatrix * instanceMatrix * vec4(p, 1.0); }`,
        fragmentShader: `varying vec2 vUv; varying float vShade; varying vec3 vCol;
          void main(){ vec3 c = vCol; if (vUv.y > .38 && vUv.y < .62) c = mix(vec3(1.0), vCol, .15);
            gl_FragColor = vec4(c * vShade * 1.1, 1.0);
            #include <tonemapping_fragment>
            #include <colorspace_fragment>
          }` });
      const flags = new THREE.InstancedMesh(ig, fm, n), poles = [], tmp = new THREE.Matrix4(), m4 = new THREE.Matrix4(), qq = new THREE.Quaternion();
      for (let i = 0; i < n; i++) {
        const pt = fp[Math.floor(i / n * fp.length)], base = P3(pt, R.dBack - 1, R.yBackTop + 0.2), topP = base.clone().setY(base.y + 7);
        poles.push(beamMatrix(base, topP, 0.12, 0.12, tmp.clone()));
        qq.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(-1, 0.3) + i * 0.0);
        m4.compose(topP.clone().setY(topP.y - 1.1), qq, new THREE.Vector3(1, 1, 1)); flags.setMatrixAt(i, m4);
        const c = pt.z < -10 ? BLUE : pt.z > 10 ? ORANGE : new THREE.Color(1, 0.78, 0.3);
        flags.setColorAt(i, c.clone().multiplyScalar(0.9)); aPhase[i] = i * 1.7;
      }
      flags.frustumCulled = false; scene.add(flags);
      const pm = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0xd0d4d8, metalness: 0.8, roughness: 0.3 }), poles.length);
      poles.forEach((m, i) => pm.setMatrixAt(i, m)); scene.add(pm);
    }

    // ================= Écrans géants suspendus au bord du toit (extrémités) =================
    this.screenCanvas = Object.assign(document.createElement('canvas'), { width: 1024, height: 512 });
    this.screenTex = new THREE.CanvasTexture(this.screenCanvas); this.screenTex.colorSpace = THREE.SRGBColorSpace; this.screenKey = '';
    {
      const [fd] = chordBot(1);
      for (const s of [-1, 1]) {
        const g = new THREE.Group(); g.position.set(0, R.yFrontBot - 7.5, s * (S.FZ + fd + 1.5)); g.rotation.y = s > 0 ? Math.PI : 0; scene.add(g);
        const frame = new THREE.Mesh(new THREE.BoxGeometry(23, 11.8, 1.2), new THREE.MeshStandardMaterial({ color: 0x15191e, roughness: 0.5, metalness: 0.5 })); g.add(frame);
        const scr = new THREE.Mesh(new THREE.PlaneGeometry(22, 11), new THREE.MeshBasicMaterial({ map: this.screenTex, color: new THREE.Color(1.5, 1.5, 1.5), fog: false })); scr.position.z = 0.61; g.add(scr);
        for (const sx of [-8, 8]) { const cable = new THREE.Mesh(new THREE.BoxGeometry(0.12, 4, 0.12), new THREE.MeshStandardMaterial({ color: 0x555b62, metalness: 0.9, roughness: 0.3 })); cable.position.set(sx, 7.8, 0); g.add(cable); }
      }
    }
    this.lamps = lamps;
  }

  /** Ruban LED : panneaux de sponsors fictifs et messages, aux couleurs des équipes. */
  drawLED() {
    const c = this.ledCanvas, x = c.getContext('2d'), W = c.width, H = c.height;
    x.fillStyle = '#05070a'; x.fillRect(0, 0, W, H);
    const panels = [
      { t: 'REDOUANE C\'EST UN CRACK', bg: ['#2a1a04', '#120a02'], fg: '#ffd36a', w: 3 },
      { t: '›››', bg: null, fg: '#2f7bff', w: 1 },
      { t: 'JACKPOT ARENA', bg: ['#0b1a33', '#05101f'], fg: '#ffffff', w: 2 },
      { t: 'NITRO FUEL', bg: ['#3a0909', '#140303'], fg: '#ff5a4a', w: 2 },
      { t: '‹‹‹', bg: null, fg: '#ff7a1a', w: 1 },
      { t: 'VOLTA ÉNERGIE', bg: ['#06261f', '#02110d'], fg: '#4dffc3', w: 2 },
      { t: 'REDOUANE C\'EST UN CRACK', bg: ['#081a3a', '#030b1c'], fg: '#ffffff', w: 3 },
      { t: 'BLEU  ×  ORANGE', bg: ['#0b1a33', '#2a1406'], fg: '#ffd36a', w: 2 },
      { t: 'CRACK MOTORS', bg: ['#1a1a1a', '#070707'], fg: '#e8e8e8', w: 2 },
      { t: '›››', bg: null, fg: '#ffd36a', w: 1 },
    ];
    const tot = panels.reduce((s, p) => s + p.w, 0);
    let xo = 0;
    x.textAlign = 'center'; x.textBaseline = 'middle';
    for (const p of panels) {
      const pw = W * p.w / tot, cx = xo + pw / 2;
      if (!p.bg) {
        x.fillStyle = p.fg; x.font = '900 96px "Archivo", Impact, Arial, sans-serif';
        for (let k = 0; k < 5; k++) { x.globalAlpha = 0.3 + k * 0.16; x.fillText(p.t[0], xo + pw * (0.12 + k * 0.19), H / 2 + 4); }
        x.globalAlpha = 1;
      } else {
        const g = x.createLinearGradient(0, 0, 0, H); g.addColorStop(0, p.bg[0]); g.addColorStop(1, p.bg[1]);
        x.fillStyle = g; x.fillRect(xo + 3, 6, pw - 6, H - 12);
        x.font = `900 ${p.t.length > 16 ? 62 : 70}px "Archivo", Impact, Arial, sans-serif`;
        try { x.letterSpacing = '3px'; } catch (e) { /* ignore */ }
        x.fillStyle = p.fg; x.fillText(p.t, cx, H / 2 + 3, pw - 30);
        try { x.letterSpacing = '0px'; } catch (e) { /* ignore */ }
      }
      xo += pw;
    }
  }

  update(dt, t) {
    this.time.value = t;
    this.ledU.uScroll.value = (this.ledU.uScroll.value + dt * 0.012) % 1;
    const f = this.goalFlash.value; f.w = Math.max(0, f.w - dt * 0.35);
  }

  /** Flash des rubans LED aux couleurs de l'équipe qui marque. */
  flash(team) { const c = TEAM_RGB[team]; this.goalFlash.value.set(c[0], c[1], c[2], 1); }
}
