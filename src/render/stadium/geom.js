import * as THREE from 'three';

/** Outils géométriques du stade : contour arrondi échantillonné, accumulateur de quads, géométries instanciées. */

/** Contour arrondi (vue de dessus) échantillonné, avec normales sortantes et abscisse curviligne. */
export function roundedPath(hx, hz, rc, step, breaks = []) {
  const pts = [];
  const push = (x, z, nx, nz) => pts.push({ x, z, nx, nz });
  const line = (x0, z0, x1, z1, nx, nz) => {
    const cuts = [0, 1];
    for (const b of breaks) { const t = (b - x0) / (x1 - x0); if (z0 === z1 && t > 0 && t < 1) cuts.push(t); }
    cuts.sort((a, b) => a - b);
    for (let k = 0; k < cuts.length - 1; k++) {
      const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, z1 - z0) * (cuts[k + 1] - cuts[k]) / step));
      for (let i = 0; i < n; i++) { const t = cuts[k] + (cuts[k + 1] - cuts[k]) * i / n; push(x0 + (x1 - x0) * t, z0 + (z1 - z0) * t, nx, nz); }
    }
  };
  const arc = (cx, cz, a0, a1) => { const n = Math.max(2, Math.ceil(rc * Math.abs(a1 - a0) / step)); for (let i = 0; i < n; i++) { const a = a0 + (a1 - a0) * i / n; push(cx + rc * Math.cos(a), cz + rc * Math.sin(a), Math.cos(a), Math.sin(a)); } };
  const sx = hx - rc, sz = hz - rc;
  line(sx, hz, -sx, hz, 0, 1); arc(-sx, sz, Math.PI / 2, Math.PI);
  line(-hx, sz, -hx, -sz, -1, 0); arc(-sx, -sz, Math.PI, 1.5 * Math.PI);
  line(-sx, -hz, sx, -hz, 0, -1); arc(sx, -sz, -Math.PI / 2, 0);
  line(hx, -sz, hx, sz, 1, 0); arc(sx, sz, 0, Math.PI / 2);
  let s = 0; for (let i = 0; i < pts.length; i++) { pts[i].s = s; const q = pts[(i + 1) % pts.length]; s += Math.hypot(q.x - pts[i].x, q.z - pts[i].z); }
  return { pts, L: s };
}

/** Point décalé de d vers l'extérieur du contour, à la hauteur y. */
export const P3 = (pt, d, y) => new THREE.Vector3(pt.x + pt.nx * d, y, pt.z + pt.nz * d);

/** Accumulateur de quadrilatères (couleurs par sommet, normales plates, UV optionnels). */
export class Quads {
  constructor() { this.p = []; this.n = []; this.c = []; this.u = []; }
  quad(A, B, Cq, D, N, col, uv) {
    const e1x = B.x - A.x, e1y = B.y - A.y, e1z = B.z - A.z, e2x = Cq.x - A.x, e2y = Cq.y - A.y, e2z = Cq.z - A.z;
    const cx = e1y * e2z - e1z * e2y, cy = e1z * e2x - e1x * e2z, cz = e1x * e2y - e1y * e2x;
    const flip = cx * N.x + cy * N.y + cz * N.z < 0;
    const tri = (P, Q, S, ua, ub, uc) => { for (const [V, U] of (flip ? [[P, ua], [S, uc], [Q, ub]] : [[P, ua], [Q, ub], [S, uc]])) { this.p.push(V.x, V.y, V.z); this.n.push(N.x, N.y, N.z); this.c.push(col.r, col.g, col.b); this.u.push(U ? U[0] : 0, U ? U[1] : 0); } };
    tri(A, B, Cq, uv && uv[0], uv && uv[1], uv && uv[2]); tri(A, Cq, D, uv && uv[0], uv && uv[2], uv && uv[3]);
  }
  geo() { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(this.u, 2)); return g; }
}

/** Boîte sans face inférieure, ajoutée à un tableau de positions/normales (géométrie non indexée). */
export function pushBox(P, N, x0, y0, z0, x1, y1, z1, extra = null, E = null, val = 0) {
  const faces = [
    [[x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [0, 1, 0]],
    [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1]],
    [[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1]],
    [[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0]],
    [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0]],
  ];
  for (const [a, b, c, d, n] of faces) for (const v of [a, b, c, a, c, d]) { P.push(...v); N.push(...n); if (E) E.push(val); }
}

/** Matrice d'une poutre (boîte unitaire) entre deux points, section w×h. */
const _ma = new THREE.Vector3(), _mb = new THREE.Vector3(), _mz = new THREE.Vector3(), _mx = new THREE.Vector3(), _my = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);
export function beamMatrix(a, b, w, h, out) {
  _mz.subVectors(b, a); const L = _mz.length(); _mz.multiplyScalar(1 / L);
  _mx.crossVectors(Math.abs(_mz.y) > 0.95 ? _ma.set(1, 0, 0) : _up, _mz).normalize(); _my.crossVectors(_mz, _mx);
  out.makeBasis(_mx.multiplyScalar(w), _my.multiplyScalar(h), _mz.multiplyScalar(L));
  out.setPosition(_mb.addVectors(a, b).multiplyScalar(0.5));
  return out;
}

/** Hash 1D stable (positionnement pseudo-aléatoire reproductible). */
export function hash1(n) { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); }
