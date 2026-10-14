import { smin, smax, ssub, sstep, clamp, sdRoundBox, sdEllipsoid, sdCapsule, catmullRom, Field2D, curve1D } from './sdf.js';
import { meshSDF } from './SurfaceNets.js';

/**
 * Carrosseries modélisées par champ de distance. Deux modèles originaux (aucune marque, aucun modèle réel copié) :
 *  - VORTEX : coupé GT bas et effilé, aileron, V12 atmosphérique ;
 *  - TYPHON : sportback quatre portes musclée, ailes élargies, quatre sorties, V8 biturbo.
 * Repère de modélisation : x latéral (symétrique), y vertical (sol à 0), z vers l'avant.
 *  - caisse = intersection lisse de la vue de profil et de la vue de dessus (+ rentrée de caisse) ;
 *  - ailes avant et hanches arrière en renflements ;
 *  - pavillon raccordé par une arête nette à la ligne de caisse ;
 *  - passages de roue, prises d'air, écopes, diffuseur et sorties d'échappement creusés ;
 *  - jupes latérales et lame avant ajoutées.
 * Chaque sommet reçoit des « zones » (distances signées) que le shader de peinture utilise pour des bords nets :
 * habitacle, vitrage, toit, garnitures noires, creux, phares, feux arrière, glace de rétroviseur.
 * Les dimensions de roue sont communes aux deux modèles : la physique (et donc l'équité) est identique.
 */
export const CAR_DIM = { wheelZ: 1.36, wheelY: 0.40, wheelR: 0.40, trackX: 0.80 };
export const ZONES = 8;

const mirrorHalf = pts => [...pts, ...pts.slice(1, -1).reverse().map(([z, x]) => [z, -x])];

export const MODELS = {
  vortex: {
    id: 'vortex', name: 'VORTEX GT', engine: 'V12 atmosphérique · 6,5 L', layout: 'Coupé GT',
    hullSide: [
      [2.03, 0.125], [2.112, 0.17], [2.142, 0.27], [2.14, 0.41], [2.115, 0.52], [2.05, 0.615], [1.94, 0.685],
      [1.74, 0.745], [1.45, 0.795], [1.05, 0.84], [0.70, 0.865], [0.20, 0.878], [-0.50, 0.885], [-1.10, 0.902],
      [-1.55, 0.926], [-1.88, 0.958], [-2.02, 0.985], [-2.068, 0.988], [-2.088, 0.955], [-2.112, 0.82], [-2.122, 0.6],
      [-2.112, 0.43], [-2.05, 0.33], [-1.88, 0.235], [-1.62, 0.15], [-1.30, 0.13], [-0.4, 0.125], [0.8, 0.125], [1.70, 0.125],
    ],
    planHalf: [
      [2.142, 0.0], [2.137, 0.30], [2.112, 0.52], [2.055, 0.70], [1.965, 0.82], [1.80, 0.872], [1.40, 0.888], [1.0, 0.882],
      [0.5, 0.872], [0.0, 0.868], [-0.55, 0.876], [-1.05, 0.892], [-1.40, 0.90], [-1.75, 0.894], [-1.96, 0.882], [-2.065, 0.845], [-2.112, 0.73], [-2.127, 0.5], [-2.13, 0.0],
    ],
    hullK: 0.065, taperTop: 0.085, taperBot: 0.06,
    ghSide: [
      [0.98, 0.66], [0.95, 0.85], [0.82, 0.878], [0.40, 1.03], [0.06, 1.165], [-0.16, 1.232], [-0.46, 1.262], [-0.80, 1.258],
      [-1.10, 1.21], [-1.44, 1.115], [-1.74, 1.02], [-1.93, 0.965], [-2.0, 0.90], [-2.0, 0.66],
    ],
    ghW: [[1.1, 0.80], [0.8, 0.80], [0.2, 0.785], [-0.5, 0.775], [-1.2, 0.77], [-1.8, 0.75], [-2.1, 0.70]],
    ghTaper: 0.37, ghK: 0.085,
    fenders: [{ t: 'ell', c: [0.665, 0.535, 1.30], r: [0.29, 0.372, 0.74] }, { t: 'ell', c: [0.665, 0.585, -1.20], r: [0.31, 0.375, 0.86] }],
    fenderK: 0.10,
    cavities: [
      ['box', 0, 0.33, 2.16, 0.33, 0.082, 0.15, 0.045, false],
      ['box', 0.655, 0.30, 2.03, 0.155, 0.098, 0.15, 0.04, true],
      ['ell', 0.955, 0.56, -0.62, 0.085, 0.092, 0.33, 0, true],
      ['box', 0.42, 0.335, -2.13, 0.105, 0.058, 0.11, 0.05, true],
      ['box', 0, 0.16, -2.02, 0.6, 0.115, 0.2, 0.03, false],
    ],
    dlo: [[[0.66, 0.905], [0.42, 1.0], [0.0, 1.165], [-0.30, 1.218], [-0.70, 1.222], [-1.02, 1.168], [-1.30, 1.075], [-1.24, 0.985], [-0.90, 0.945], [-0.30, 0.918], [0.40, 0.902]]],
    wind: { zTop: -0.16, cowl: 0.895, inset: 0.085 },
    rearGlass: { z0: -0.98, z1: -1.86, y0: 0.975, inset: 0.13 },
    roof: { z0: -0.98, z1: -0.155, inset: 0.075 },
    head: [[0.40, 0.592], [0.62, 0.590], [0.80, 0.578], [0.875, 0.545], [0.83, 0.515], [0.62, 0.53], [0.44, 0.548]],
    tail: [[0.0, 0.875], [0.80, 0.875], [0.86, 0.86], [0.875, 0.80], [0.86, 0.785], [0.84, 0.835], [0.80, 0.845], [0.0, 0.845]],
    rearTrimY: 0.40, frontTrimY: 0.165,
    mirror: { c: [0.935, 0.985, 0.50], r: [0.072, 0.06, 0.14], arm: [0.76, 0.915, 0.56, 0.90, 0.975, 0.52] },
    exhaust: [[0.42, 0.335, -2.06], [-0.42, 0.335, -2.06]],
    wing: true, wiper: [0.885, 0.775], plate: [0.6, -2.126], fins: [5, 0.19],
    // paramètres du shader (lignes d'ouvrants, détails)
    shader: {
      doors: [0.60, -0.05, -0.60, 0.11], door2: [0, 0, 0, 0], handles: [-0.33, 0, 0.80, 0], fuel: [-1.02, 0.80],
      hood: [0.615, 1.86, 1.875, 0.56], louvre: [0.2, 0.48, 1.38, 1.6], rearPanel: [0.6, 0.63, 0.17, 1],
      sun: [1.115, 0.075], proj: [0.57, 0.558, 0.69, 0.553], number: [0.0, 0.3, 0.57, 1.1],
    },
  },
  typhon: {
    id: 'typhon', name: 'TYPHON S', engine: 'V8 biturbo · 4,0 L', layout: 'Sportback 4 portes',
    hullSide: [
      [2.04, 0.13], [2.12, 0.19], [2.146, 0.30], [2.146, 0.45], [2.125, 0.575], [2.07, 0.675], [1.96, 0.74],
      [1.75, 0.79], [1.45, 0.838], [1.05, 0.878], [0.72, 0.902], [0.20, 0.925], [-0.50, 0.942], [-1.10, 0.958],
      [-1.55, 0.982], [-1.86, 1.008], [-2.0, 1.028], [-2.072, 1.036], [-2.094, 0.99], [-2.12, 0.85], [-2.13, 0.6],
      [-2.12, 0.42], [-2.06, 0.33], [-1.90, 0.24], [-1.62, 0.15], [-1.30, 0.13], [-0.4, 0.125], [0.8, 0.125], [1.70, 0.125],
    ],
    planHalf: [
      [2.146, 0.0], [2.142, 0.32], [2.122, 0.56], [2.075, 0.74], [1.985, 0.85], [1.80, 0.888], [1.40, 0.898], [1.0, 0.894],
      [0.5, 0.886], [0.0, 0.883], [-0.55, 0.887], [-1.05, 0.9], [-1.40, 0.905], [-1.75, 0.9], [-1.96, 0.89], [-2.07, 0.862], [-2.117, 0.77], [-2.132, 0.5], [-2.136, 0.0],
    ],
    hullK: 0.055, taperTop: 0.07, taperBot: 0.06,
    ghSide: [
      [0.92, 0.70], [0.88, 0.89], [0.74, 0.912], [0.40, 1.09], [0.10, 1.25], [-0.06, 1.318], [-0.40, 1.35], [-0.80, 1.335],
      [-1.08, 1.285], [-1.38, 1.19], [-1.68, 1.095], [-1.93, 1.04], [-2.02, 0.99], [-2.02, 0.70],
    ],
    ghW: [[1.1, 0.80], [0.7, 0.80], [0.0, 0.80], [-0.8, 0.795], [-1.5, 0.78], [-2.1, 0.72]],
    ghTaper: 0.31, ghK: 0.075,
    fenders: [{ t: 'box', c: [0.72, 0.58, 1.33], r: [0.245, 0.33, 0.6], k: 0.15 }, { t: 'box', c: [0.735, 0.62, -1.30], r: [0.25, 0.335, 0.70], k: 0.17 }],
    fenderK: 0.08,
    bulges: [{ c: [0, 0.832, 1.22], r: [0.33, 0.07, 0.5], k: 0.06, blend: 0.05 }],
    cavities: [
      ['box', 0.175, 0.905, 1.44, 0.105, 0.035, 0.075, 0.025, true],
      ['box', 0, 0.40, 2.18, 0.40, 0.145, 0.16, 0.07, false],
      ['box', 0.705, 0.265, 2.07, 0.15, 0.075, 0.15, 0.035, true],
      ['box', 0.975, 0.66, 0.78, 0.05, 0.05, 0.13, 0.03, true],
      ['box', 0.46, 0.30, -2.14, 0.2, 0.058, 0.11, 0.05, true],
      ['box', 0, 0.17, -2.04, 0.27, 0.1, 0.2, 0.03, false],
    ],
    dlo: [
      [[0.60, 0.95], [0.40, 1.05], [0.10, 1.215], [-0.12, 1.29], [-0.50, 1.305], [-0.50, 0.968], [0.20, 0.952]],
      [[-0.60, 0.97], [-0.60, 1.305], [-0.95, 1.30], [-1.22, 1.235], [-1.46, 1.11], [-1.40, 1.02], [-1.05, 0.985]],
    ],
    wind: { zTop: -0.035, cowl: 0.928, inset: 0.085 },
    rearGlass: { z0: -1.0, z1: -1.9, y0: 1.06, inset: 0.13 },
    roof: { z0: -1.0, z1: -0.04, inset: 0.07 },
    head: [[0.40, 0.668], [0.66, 0.665], [0.86, 0.652], [0.915, 0.615], [0.88, 0.578], [0.70, 0.592], [0.46, 0.62]],
    tail: [[0.0, 0.968], [0.82, 0.968], [0.885, 0.952], [0.895, 0.88], [0.875, 0.868], [0.858, 0.935], [0.82, 0.938], [0.0, 0.938]],
    rearTrimY: 0.37, frontTrimY: 0.18,
    mirror: { c: [0.95, 1.02, 0.47], r: [0.075, 0.062, 0.14], arm: [0.78, 0.95, 0.53, 0.92, 1.0, 0.49] },
    exhaust: [[0.36, 0.30, -2.09], [0.56, 0.30, -2.09], [-0.36, 0.30, -2.09], [-0.56, 0.30, -2.09]],
    wing: false, wiper: [0.925, 0.70], plate: [0.62, -2.137], fins: [3, 0.16],
    shader: {
      doors: [0.62, -0.05, -0.85, -0.38], door2: [-0.55, 0.02, 1, 0], handles: [-0.25, -0.86, 0.85, 1], fuel: [-1.10, 0.86],
      hood: [0.64, 1.95, 99, 0], louvre: [0, 0, 1, 0], rearPanel: [0, 0, 0, 0], carbonHood: true,
      sun: [1.235, 0.075], proj: [0.58, 0.634, 0.73, 0.63], number: [0.03, 0.32, 0.55, 1.05],
    },
  },
};

/** Fonctions de champ d'un modèle (champs 2D précalculés à la première utilisation). */
function makeModel(M) {
  const side = new Field2D(catmullRom(M.hullSide, { per: 12 }), -2.3, 2.3, -0.05, 1.2, 0.01);
  const plan = new Field2D(catmullRom(mirrorHalf(M.planHalf), { per: 10 }), -2.3, 2.3, -1.05, 1.05, 0.01);
  const gh = new Field2D(catmullRom(M.ghSide, { per: 12 }), -2.2, 1.2, 0.55, 1.45, 0.01);
  const dlo = M.dlo.map(p => new Field2D(catmullRom(p, { per: 8 }), -1.7, 1.0, 0.8, 1.42, 0.004, 0.2));
  const head = new Field2D(catmullRom(M.head, { per: 8 }), 0.25, 1.05, 0.4, 0.78, 0.003, 0.2);
  const tail = new Field2D(M.tail, -0.1, 1.05, 0.75, 1.05, 0.003, 0.2);
  const GH_W = curve1D(M.ghW);
  const cavs = M.cavities.map(([t, cx, cy, cz, hx, hy, hz, r, sym]) => ({ t, cx, cy, cz, hx, hy, hz, r, sym, R: Math.hypot(hx, hy, hz) }));
  const fend = M.fenders;

  const hullD = (x, y, z) => {
    const ax = Math.abs(x), xw = ax * (1 + M.taperTop * sstep(0.52, 0.93, y) + M.taperBot * sstep(0.32, 0.12, y));
    return smax(side.get(z, y), plan.get(z, xw), M.hullK);
  };
  const fenderD = (x, y, z) => {
    const ax = Math.abs(x); let d = Infinity;
    for (const f of fend) {
      const v = f.t === 'ell' ? sdEllipsoid(ax, y, z, f.c[0], f.c[1], f.c[2], f.r[0], f.r[1], f.r[2]) : sdRoundBox(ax, y, z, f.c[0], f.c[1], f.c[2], f.r[0], f.r[1], f.r[2], f.k);
      if (v < d) d = v;
    }
    return d;
  };
  const ghD = (x, y, z) => { const xw = Math.abs(x) * (1 + M.ghTaper * clamp((y - 0.86) / 0.42, 0, 1)); return smax(gh.get(z, y), xw - GH_W(z), M.ghK); };
  const sillD = (x, y, z) => sdRoundBox(Math.abs(x), y, z, 0.83, 0.17, -0.02, 0.04, 0.05, 0.84, 0.022);
  const splitterD = (x, y, z) => smax(sdRoundBox(x, y, z, 0, 0.112, 1.98, 0.86, 0.015, 0.2, 0.01), plan.get(z, Math.abs(x)) - 0.03, 0.01);
  const archD = (x, y, z) => {
    const ax = Math.abs(x), zc = z > 0 ? CAR_DIM.wheelZ : -CAR_DIM.wheelZ;
    const dy = y - CAR_DIM.wheelY, dz = z - zc;
    return Math.max(Math.sqrt(dy * dy + dz * dz) - (z > 0 ? 0.465 : 0.472), 0.58 - ax);
  };
  const cavityD = (x, y, z, lim) => {
    const ax = Math.abs(x); let d = Infinity;
    for (let i = 0; i < cavs.length; i++) {
      const c = cavs[i], px = c.sym ? ax : x, qx = px - c.cx, qy = y - c.cy, qz = z - c.cz;
      const lb = Math.sqrt(qx * qx + qy * qy + qz * qz) - c.R;
      if (lb > lim || lb > d) continue;
      const v = c.t === 'box' ? sdRoundBox(px, y, z, c.cx, c.cy, c.cz, c.hx, c.hy, c.hz, c.r) : sdEllipsoid(px, y, z, c.cx, c.cy, c.cz, c.hx, c.hy, c.hz);
      if (v < d) d = v;
    }
    return d;
  };
  const bulges = M.bulges || [];
  const baseD = (x, y, z) => {
    let d = smin(hullD(x, y, z), fenderD(x, y, z), M.fenderK);
    for (const b of bulges) d = smin(d, sdRoundBox(x, y, z, b.c[0], b.c[1], b.c[2], b.r[0], b.r[1], b.r[2], b.k), b.blend);
    d = smin(d, ghD(x, y, z), 0.035);
    d = smin(d, sillD(x, y, z), 0.02);
    return smin(d, splitterD(x, y, z), 0.012);
  };
  const sdf = (x, y, z) => {
    let d = baseD(x, y, z);
    // Une soustraction lisse smax(d, -c, k) ne change d que si c < k - d : sinon on évite le calcul
    const a = archD(x, y, z); if (a < 0.012 - d) d = ssub(d, a, 0.012);
    const c = cavityD(x, y, z, 0.012 - d); if (c < 0.012 - d) d = ssub(d, c, 0.012);
    return d;
  };
  // Zones : A (habitacle, vitre, toit, garniture), B (creux, phare, feu arrière, glace de rétroviseur)
  const zones = (x, y, z, nx, ny, nz, out) => {
    const ax = Math.abs(x);
    const hD = smin(hullD(x, y, z), fenderD(x, y, z), M.fenderK), gD = ghD(x, y, z);
    const trimD = Math.min(sillD(x, y, z), splitterD(x, y, z));
    const unc = baseD(x, y, z);
    const onGH = hD - gD - 0.006;
    out[0] = onGH;
    let glass = -1;
    if (onGH > -0.03) {
      const xe = GH_W(z) / (1 + M.ghTaper * clamp((y - 0.86) / 0.42, 0, 1));
      const W = M.wind, Rg = M.rearGlass;
      if (Math.abs(nx) > 0.55) { glass = -Infinity; for (const f of dlo) glass = Math.max(glass, -f.get(z, y)); }
      else if (nz > 0.12 && z > W.zTop - 0.15) glass = Math.min(xe - W.inset - ax, y - W.cowl, z - W.zTop);
      else if (z < Rg.z0 + 0.15) glass = Math.min(xe - Rg.inset - ax, Rg.z0 - z, z - Rg.z1, y - Rg.y0);
    }
    out[1] = glass;
    out[2] = ny > 0.55 ? Math.min(z - M.roof.z0, M.roof.z1 - z, (GH_W(z) / (1 + M.ghTaper)) - M.roof.inset - ax) : -1;
    let trim = Math.min(hD, gD) - trimD - 0.003;
    if (ny < -0.55 && y < 0.2) trim = 0.02;
    if (z < -1.8) trim = Math.max(trim, M.rearTrimY - y);
    if (z > 1.8) trim = Math.max(trim, M.frontTrimY - y);
    out[3] = trim;
    out[4] = -unc - 0.007;
    out[5] = z > 1.72 ? -head.get(ax, y) : -1;
    out[6] = z < -1.92 ? -tail.get(ax, y) : -1;
    out[7] = -1;
  };
  // Rétroviseurs
  const mr = M.mirror, a = mr.arm;
  const armD = (ax, y, z) => sdCapsule(ax, y, z, a[0], a[1], a[2], a[3], a[4], a[5], 0.022);
  const mirrorSDF = (x, y, z) => {
    const ax = Math.abs(x);
    const shell = sdEllipsoid(ax, y, z, mr.c[0], mr.c[1], mr.c[2], mr.r[0], mr.r[1], mr.r[2]);
    const cut = sdRoundBox(ax, y, z, mr.c[0], mr.c[1], mr.c[2] - mr.r[2] + 0.025, mr.r[0] - 0.006, mr.r[1] - 0.008, 0.04, 0.022);
    return smin(ssub(shell, cut, 0.008), armD(ax, y, z), 0.02);
  };
  const mirrorZones = (x, y, z, nx, ny, nz, out) => {
    const ax = Math.abs(x);
    out.fill(-1);
    out[3] = ax < mr.c[0] - 0.07 || armD(ax, y, z) < 0.004 ? 0.02 : -0.02;
    out[7] = nz < -0.6 && z < mr.c[2] - mr.r[2] + 0.07 ? 0.02 : -0.02;
  };
  const mirrorBox = { min: [-(mr.c[0] + mr.r[0] + 0.03), mr.c[1] - 0.14, mr.c[2] - 0.17], max: [mr.c[0] + mr.r[0] + 0.03, mr.c[1] + 0.1, mr.c[2] + 0.18] };
  return { sdf, zones, mirrorSDF, mirrorZones, mirrorBox };
}

/** Construit la carrosserie d'un modèle (données brutes, sans dépendance au moteur de rendu). */
export function buildCarBodyData(modelId = 'vortex', { h = 0.02 } = {}) {
  const t0 = Date.now();
  const M = MODELS[modelId] || MODELS.vortex, F = makeModel(M);
  const top = Math.max(...M.ghSide.map(p => p[1])) + 0.04;
  const body = meshSDF(F.sdf, { min: [-1.02, 0.0, -2.22], max: [1.02, top, 2.22], h, zones: F.zones, zoneCount: ZONES });
  const mirror = meshSDF(F.mirrorSDF, { ...F.mirrorBox, h: 0.008, levels: 3, zones: F.mirrorZones, zoneCount: ZONES });
  return { body, mirror, ms: Date.now() - t0 };
}
