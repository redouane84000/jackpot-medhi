import * as THREE from 'three';

/**
 * Ballon visuel : icosaèdre tronqué (12 pentagones, 20 hexagones) aux panneaux bombés et coutures creusées.
 * Les coutures s'illuminent de la couleur de la dernière équipe à l'avoir touché.
 * Le rendu suit l'état physique ; il ne le modifie jamais.
 */
const V3 = THREE.Vector3;
const sstep = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

function ballPanels() {
  const phi = (1 + Math.sqrt(5)) / 2;
  const iv = [[-1, phi, 0], [1, phi, 0], [-1, -phi, 0], [1, -phi, 0], [0, -1, phi], [0, 1, phi], [0, -1, -phi], [0, 1, -phi], [phi, 0, -1], [phi, 0, 1], [-phi, 0, -1], [-phi, 0, 1]].map(a => new V3(...a));
  const adj = iv.map(() => []);
  for (let i = 0; i < 12; i++) for (let j = i + 1; j < 12; j++) if (iv[i].distanceTo(iv[j]) < 2.01) { adj[i].push(j); adj[j].push(i); }
  const sortAround = (c, pts) => { const u = pts[0].clone().addScaledVector(c, -pts[0].dot(c)).normalize(), w = new V3().crossVectors(c, u); return pts.sort((p, q) => Math.atan2(p.dot(w), p.dot(u)) - Math.atan2(q.dot(w), q.dot(u))); };
  const panels = [];
  for (let i = 0; i < 12; i++) { const c = iv[i].clone().normalize(); panels.push({ c, v: sortAround(c, adj[i].map(j => iv[i].clone().lerp(iv[j], 1 / 3).normalize())), pent: true }); }
  for (let i = 0; i < 12; i++) for (const j of adj[i]) if (j > i) for (const k of adj[j]) if (k > j && adj[i].includes(k)) {
    const A = iv[i], B = iv[j], Cc = iv[k], c = A.clone().add(B).add(Cc).normalize();
    const pts = [A.clone().lerp(B, 1 / 3), A.clone().lerp(B, 2 / 3), B.clone().lerp(Cc, 1 / 3), B.clone().lerp(Cc, 2 / 3), Cc.clone().lerp(A, 1 / 3), Cc.clone().lerp(A, 2 / 3)].map(p => p.normalize());
    panels.push({ c, v: sortAround(c, pts), pent: false });
  }
  return panels;
}

const VR = [0, .28, .52, .7, .82, .9, .945, .975, 1];
/** Géométrie d'un panneau (surface bombée + tranche), centrée sur son point d'ancrage. */
function panelGeometry(P, cOut, cIn, BR) {
  const m = P.v.length, S = 5, L = m * S, K = VR.length - 1;
  const pos = [], col = [], seam = [], idx = [];
  const g1 = new V3(), g2 = new V3(), g3 = new V3(), cc = new V3(), dd = new V3(), ta = new V3(), tb = new V3();
  const rOut = v => BR * (1 + .016 * (1 - v * v * v) - .03 * sstep(.88, 1, v)), rIn = () => BR * .9;
  const addV = (x, y, z, c, sm) => { pos.push(x, y, z); col.push(c.r, c.g, c.b); seam.push(sm); return pos.length / 3 - 1; };
  const orient = (a, b, d, ref) => {
    g1.fromArray(pos, a * 3); g2.fromArray(pos, b * 3); g3.fromArray(pos, d * 3);
    cc.copy(g1).add(g2).add(g3).multiplyScalar(1 / 3); g2.sub(g1); g3.sub(g1); g1.crossVectors(g2, g3);
    ref(cc, dd); if (g1.dot(dd) < 0) idx.push(a, d, b); else idx.push(a, b, d);
  };
  const surface = (rf, c, sign, seamOn) => {
    const ci = addV(P.c.x * rf(0), P.c.y * rf(0), P.c.z * rf(0), c, 0), rings = [];
    for (let k = 1; k <= K; k++) {
      rings.push(pos.length / 3);
      for (let i = 0; i < m; i++) { const A = P.v[i], B = P.v[(i + 1) % m]; for (let s = 0; s < S; s++) { ta.copy(A).lerp(B, s / S); tb.copy(P.c).lerp(ta, VR[k]).normalize().multiplyScalar(rf(VR[k])); addV(tb.x, tb.y, tb.z, c, seamOn ? sstep(.8, 1, VR[k]) : 0); } }
    }
    const ref = (cen, out) => out.copy(cen).multiplyScalar(sign);
    for (let i = 0; i < L; i++) orient(ci, rings[0] + i, rings[0] + (i + 1) % L, ref);
    for (let k = 0; k < K - 1; k++) for (let i = 0; i < L; i++) { const a = rings[k] + i, b = rings[k] + (i + 1) % L, c2 = rings[k + 1] + i, d = rings[k + 1] + (i + 1) % L; orient(a, b, d, ref); orient(a, d, c2, ref); }
    return rings[K - 1];
  };
  const oL = surface(rOut, cOut, 1, true), iL = surface(rIn, cIn, -1, false);
  const wo = pos.length / 3; for (let i = 0; i < L; i++) addV(pos[(oL + i) * 3], pos[(oL + i) * 3 + 1], pos[(oL + i) * 3 + 2], cIn, 0);
  const wi = pos.length / 3; for (let i = 0; i < L; i++) addV(pos[(iL + i) * 3], pos[(iL + i) * 3 + 1], pos[(iL + i) * 3 + 2], cIn, 0);
  const wref = (cen, out) => out.copy(cen).addScaledVector(P.c, -cen.dot(P.c));
  for (let i = 0; i < L; i++) { const a = wo + i, b = wo + (i + 1) % L, c2 = wi + i, d = wi + (i + 1) % L; orient(a, b, d, wref); orient(a, d, c2, wref); }
  const home = P.c.clone().multiplyScalar(BR * .95);
  for (let i = 0; i < pos.length; i += 3) { pos[i] -= home.x; pos[i + 1] -= home.y; pos[i + 2] -= home.z; }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setAttribute('aSeam', new THREE.Float32BufferAttribute(seam, 1));
  g.setIndex(idx); g.computeVertexNormals();
  return { geo: g, home };
}

function mergeGeometries(parts) {
  let nv = 0, ni = 0; for (const p of parts) { nv += p.geo.attributes.position.count; ni += p.geo.index.count; }
  const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), col = new Float32Array(nv * 3), seam = new Float32Array(nv), idx = new Uint32Array(ni);
  let ov = 0, oi = 0;
  for (const p of parts) {
    const g = p.geo, n = g.attributes.position.count;
    for (let i = 0; i < n; i++) {
      pos[(ov + i) * 3] = g.attributes.position.getX(i) + p.home.x; pos[(ov + i) * 3 + 1] = g.attributes.position.getY(i) + p.home.y; pos[(ov + i) * 3 + 2] = g.attributes.position.getZ(i) + p.home.z;
    }
    nor.set(g.attributes.normal.array, ov * 3); col.set(g.attributes.color.array, ov * 3); seam.set(g.attributes.aSeam.array, ov);
    for (let i = 0; i < g.index.count; i++) idx[oi + i] = g.index.array[i] + ov;
    ov += n; oi += g.index.count;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.setAttribute('aSeam', new THREE.BufferAttribute(seam, 1));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  return g;
}

export class BallVisual {
  constructor(scene, C) {
    this.C = C; this.scene = scene;
    const R = C.BALL_RADIUS;
    this.glowColor = new THREE.Color(1, .75, .3); this.glow = { value: 0.25 };
    const glowU = { value: this.glowColor };
    const mat = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: .36, clearcoat: .6, clearcoatRoughness: .2 });
    mat.onBeforeCompile = s => {
      s.uniforms.uGlow = this.glow; s.uniforms.uGlowCol = glowU;
      s.vertexShader = 'attribute float aSeam;\nvarying float vSeam;\n' + s.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vSeam = aSeam;');
      s.fragmentShader = 'uniform float uGlow; uniform vec3 uGlowCol;\nvarying float vSeam;\n' + s.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance += uGlowCol * pow(vSeam, 2.0) * uGlow * 5.0;');
    };
    this.material = mat;
    const C_PENT = new THREE.Color('#15181c'), C_HEX = new THREE.Color('#f4f3ee'), C_IN = new THREE.Color('#3b3632');
    this.parts = ballPanels().map(P => panelGeometry(P, P.pent ? C_PENT : C_HEX, C_IN, R));
    this.mesh = new THREE.Mesh(mergeGeometries(this.parts), mat);
    this.mesh.castShadow = true; this.mesh.receiveShadow = true;
    scene.add(this.mesh);
    // Éclats (explosion de but) : un maillage par panneau, animation purement visuelle
    this.debris = this.parts.map(p => { const me = new THREE.Mesh(p.geo, mat); me.visible = false; me.castShadow = true; scene.add(me); return { me, home: p.home, v: new V3(), w: new V3(), life: 0 }; });
    // Repère au sol (lecture de la hauteur du ballon)
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false });
    const ring = new THREE.Mesh(new THREE.RingGeometry(R * .82, R * .95, 64), ringMat);
    ring.rotation.x = -Math.PI / 2; ring.renderOrder = 2; scene.add(ring); this.marker = ring;
    this._q = new THREE.Quaternion(); this._e = new V3();
  }

  setTouchTeam(team) { this.glowColor.set(team === 'blue' ? 0x3d8bff : 0xff8a2a); this.glow.value = 1.3; }

  update(pos, quat, dt, visible) {
    this.mesh.visible = visible;
    if (visible) { this.mesh.position.copy(pos); this.mesh.quaternion.copy(quat); }
    this.glow.value += (0.25 - this.glow.value) * Math.min(1, dt * 1.5);
    const h = pos.y - this.C.BALL_RADIUS;
    this.marker.visible = visible && h > 1.2;
    if (this.marker.visible) { this.marker.position.set(pos.x, 0.03, pos.z); this.marker.material.opacity = Math.min(0.5, (h - 1.2) * 0.12); }
    for (const d of this.debris) {
      if (d.life <= 0) continue;
      d.life -= dt; d.v.y -= 9.81 * dt; d.v.multiplyScalar(Math.exp(-0.4 * dt));
      d.me.position.addScaledVector(d.v, dt);
      if (d.me.position.y < 0.15) { d.me.position.y = 0.15; d.v.y = Math.abs(d.v.y) * 0.35; d.v.x *= 0.7; d.v.z *= 0.7; d.w.multiplyScalar(0.6); }
      const wl = d.w.length(); if (wl > 1e-4) { this._q.setFromAxisAngle(this._e.copy(d.w).multiplyScalar(1 / wl), wl * dt); d.me.quaternion.premultiply(this._q); }
      const s = Math.min(1, d.life / 0.6); d.me.scale.setScalar(Math.max(s, 1e-3));
      if (d.life <= 0) d.me.visible = false;
    }
  }

  /** Le ballon éclate en ses 32 panneaux. */
  explode(pos, quat, vel) {
    for (const d of this.debris) {
      d.me.visible = true; d.life = 2.6 + Math.random() * 0.8; d.me.scale.setScalar(1);
      d.me.position.copy(d.home).applyQuaternion(quat).add(pos); d.me.quaternion.copy(quat);
      const out = this._e.copy(d.home).applyQuaternion(quat).normalize();
      d.v.copy(out).multiplyScalar(8 + Math.random() * 10).addScaledVector(vel, 0.25); d.v.y += 3;
      d.w.set(Math.random() - .5, Math.random() - .5, Math.random() - .5).normalize().multiplyScalar(6 + Math.random() * 10);
    }
  }

  clearDebris() { for (const d of this.debris) { d.life = 0; d.me.visible = false; } }
}
