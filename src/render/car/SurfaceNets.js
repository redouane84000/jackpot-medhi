/**
 * Maillage d'un champ de distance signé par « surface nets » :
 *  1. raffinement hiérarchique (cellules de 2^L·h à h) : seules les cellules proches de la surface sont subdivisées,
 *     si bien que le champ n'est évalué que dans une bande étroite autour de la surface ;
 *  2. un sommet par cellule fine traversée (moyenne des points de passage sur ses arêtes) ;
 *  3. un quadrilatère par arête traversée ;
 *  4. projection des sommets sur la surface (pas de Newton) et normales par gradient.
 * Symétrie gauche/droite optionnelle : seule la moitié x ≥ 0 est évaluée.
 */
const CX = [0, 1, 0, 1, 0, 1, 0, 1], CY = [0, 0, 1, 1, 0, 0, 1, 1], CZ = [0, 0, 0, 0, 1, 1, 1, 1];
const EDGES = [];
for (let a = 0; a < 8; a++) for (const bit of [1, 2, 4]) if (!(a & bit)) EDGES.push(a, a | bit);

export function meshSDF(sdf, { min, max, h, levels = 3, band = 2.0, mirrorX = true, project = 1, normalEps = 0.006, zones = null, zoneCount = 0 }) {
  const T0 = Date.now();
  const S = 1 << levels;
  let nx, x0;
  if (mirrorX) { const X = Math.max(Math.abs(min[0]), Math.abs(max[0])); nx = Math.ceil(2 * X / h / (2 * S)) * 2 * S; x0 = -nx * h / 2; }
  else { nx = Math.ceil((max[0] - min[0]) / h / S) * S; x0 = min[0]; }
  const ny = Math.ceil((max[1] - min[1]) / h / S) * S, nz = Math.ceil((max[2] - min[2]) / h / S) * S;
  const y0 = min[1], z0 = min[2];
  const sx = nx + 1, sy = ny + 1, sxy = sx * sy;
  const val = new Float32Array(sxy * (nz + 1)), done = new Uint8Array(sxy * (nz + 1));
  const half = nx / 2;
  let evals = 0;
  const at = (i, j, k) => {
    const id = i + sx * j + sxy * k;
    if (done[id]) return val[id];
    const ic = mirrorX && i < half ? nx - i : i, idc = ic + sx * j + sxy * k;
    let v;
    if (done[idc]) v = val[idc]; else { v = sdf(x0 + ic * h, y0 + j * h, z0 + k * h); val[idc] = v; done[idc] = 1; evals++; }
    val[id] = v; done[id] = 1; return v;
  };

  // ---- 1. Raffinement hiérarchique ----
  let cells = [];
  for (let k = 0; k < nz; k += S) for (let j = 0; j < ny; j += S) for (let i = 0; i < nx; i += S) cells.push(i, j, k);
  let fine = null;
  for (let L = levels; L >= 0; L--) {
    const s = 1 << L, lim = band * s * h, next = [];
    for (let a = 0; a < cells.length; a += 3) {
      const i = cells[a], j = cells[a + 1], k = cells[a + 2];
      let mn = Infinity, pos = false, neg = false;
      for (let c = 0; c < 8; c++) { const v = at(i + CX[c] * s, j + CY[c] * s, k + CZ[c] * s); const av = v < 0 ? -v : v; if (av < mn) mn = av; if (v < 0) neg = true; else pos = true; }
      if (!(pos && neg) && mn >= lim) continue;
      if (L === 0) { if (pos && neg) next.push(i, j, k); }
      else { const t = s >> 1; for (let c = 0; c < 8; c++) next.push(i + CX[c] * t, j + CY[c] * t, k + CZ[c] * t); }
    }
    cells = next;
    if (L === 0) fine = next;
  }
  const T1 = Date.now();

  // ---- 2. Sommets (un par cellule fine traversée) ----
  const cellVert = new Map();
  const key = (i, j, k) => i + (nx + 1) * (j + (ny + 1) * k);
  const P = [];
  const g = new Float32Array(8), off = new Int32Array(8);
  for (let c = 0; c < 8; c++) off[c] = CX[c] + sx * CY[c] + sxy * CZ[c];
  for (let a = 0; a < fine.length; a += 3) {
    const i = fine[a], j = fine[a + 1], k = fine[a + 2], base = i + sx * j + sxy * k;
    for (let c = 0; c < 8; c++) g[c] = val[base + off[c]];
    let px = 0, py = 0, pz = 0, n = 0;
    for (let e = 0; e < EDGES.length; e += 2) {
      const ea = EDGES[e], eb = EDGES[e + 1], va = g[ea], vb = g[eb];
      if ((va < 0) === (vb < 0)) continue;
      const t = va / (va - vb);
      px += CX[ea] + (CX[eb] - CX[ea]) * t; py += CY[ea] + (CY[eb] - CY[ea]) * t; pz += CZ[ea] + (CZ[eb] - CZ[ea]) * t; n++;
    }
    cellVert.set(key(i, j, k), P.length / 3);
    P.push(x0 + (i + px / n) * h, y0 + (j + py / n) * h, z0 + (k + pz / n) * h);
  }

  // ---- 3. Faces (un quad par arête traversée) ----
  const I = [];
  const cv = (i, j, k) => { const v = cellVert.get(key(i, j, k)); return v === undefined ? -1 : v; };
  const quad = (a, b, c, d, flip) => {
    if (a < 0 || b < 0 || c < 0 || d < 0) return;
    const dAC = (P[a * 3] - P[c * 3]) ** 2 + (P[a * 3 + 1] - P[c * 3 + 1]) ** 2 + (P[a * 3 + 2] - P[c * 3 + 2]) ** 2;
    const dBD = (P[b * 3] - P[d * 3]) ** 2 + (P[b * 3 + 1] - P[d * 3 + 1]) ** 2 + (P[b * 3 + 2] - P[d * 3 + 2]) ** 2;
    if (flip) { const t = b; b = d; d = t; }
    if (dAC <= dBD) I.push(a, b, c, a, c, d); else I.push(a, b, d, b, c, d);
  };
  for (let a = 0; a < fine.length; a += 3) {
    const i = fine[a], j = fine[a + 1], k = fine[a + 2], base = i + sx * j + sxy * k;
    const v0 = val[base], in0 = v0 < 0;
    if (in0 !== (val[base + 1] < 0)) quad(cv(i, j, k), cv(i, j - 1, k), cv(i, j - 1, k - 1), cv(i, j, k - 1), !in0);
    if (in0 !== (val[base + sx] < 0)) quad(cv(i, j, k), cv(i, j, k - 1), cv(i - 1, j, k - 1), cv(i - 1, j, k), !in0);
    if (in0 !== (val[base + sxy] < 0)) quad(cv(i, j, k), cv(i - 1, j, k), cv(i - 1, j - 1, k), cv(i, j - 1, k), !in0);
  }
  const T2 = Date.now();

  // ---- 4. Projection sur la surface, normales, zones ----
  const nv = P.length / 3, pos = new Float32Array(P), nor = new Float32Array(nv * 3);
  const zon = zones ? new Float32Array(nv * zoneCount) : null, zbuf = new Float32Array(Math.max(1, zoneCount));
  const e = normalEps, G = [0, 0, 0];
  const grad = (x, y, z) => {
    // gradient par tétraèdre (4 évaluations)
    const a = sdf(x + e, y - e, z - e), b = sdf(x - e, y - e, z + e), c = sdf(x - e, y + e, z - e), d = sdf(x + e, y + e, z + e);
    G[0] = a - b - c + d; G[1] = -a - b + c + d; G[2] = -a + b - c + d;
    const l = Math.sqrt(G[0] * G[0] + G[1] * G[1] + G[2] * G[2]) || 1; G[0] /= l; G[1] /= l; G[2] /= l; return l / (4 * e);
  };
  for (let v = 0; v < nv; v++) {
    let x = pos[v * 3], y = pos[v * 3 + 1], z = pos[v * 3 + 2];
    // Projection (Newton) ; la normale réutilise le dernier gradient (écart < h/2, invisible)
    for (let it = 0; it < project; it++) {
      const d = sdf(x, y, z), gl = grad(x, y, z);
      const step = Math.max(-h, Math.min(h, d / Math.max(gl, 0.3)));
      x -= G[0] * step; y -= G[1] * step; z -= G[2] * step;
    }
    if (project === 0) grad(x, y, z);
    pos[v * 3] = x; pos[v * 3 + 1] = y; pos[v * 3 + 2] = z;
    nor[v * 3] = G[0]; nor[v * 3 + 1] = G[1]; nor[v * 3 + 2] = G[2];
    if (zones) { zones(x, y, z, G[0], G[1], G[2], zbuf); zon.set(zbuf, v * zoneCount); }
  }
  return {
    positions: pos, normals: nor, indices: nv > 65535 ? new Uint32Array(I) : new Uint16Array(I), zones: zon,
    stats: { vertices: nv, triangles: I.length / 3, evals, msGrid: T1 - T0, msMesh: T2 - T1, msProject: Date.now() - T2 },
  };
}
