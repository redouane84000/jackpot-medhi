/**
 * Outils de modélisation par champs de distance signés (SDF) : primitives, opérations lisses,
 * courbes fermées et champs 2D précalculés (vues de profil, de dessus, de face).
 * Convention : distance négative à l'intérieur, positive à l'extérieur, en mètres.
 */
export const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
export const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
export const mix = (a, b, t) => a + (b - a) * t;

/** Union lisse (rayon de raccord k). */
export function smin(a, b, k) { const h = clamp(0.5 + 0.5 * (b - a) / k, 0, 1); return mix(b, a, h) - k * h * (1 - h); }
/** Intersection lisse. */
export function smax(a, b, k) { return -smin(-a, -b, k); }
/** Soustraction lisse : a privé de b. */
export function ssub(a, b, k) { return smax(a, -b, k); }

/** Boîte arrondie centrée en c, demi-dimensions h, rayon r. */
export function sdRoundBox(x, y, z, cx, cy, cz, hx, hy, hz, r) {
  const qx = Math.abs(x - cx) - hx + r, qy = Math.abs(y - cy) - hy + r, qz = Math.abs(z - cz) - hz + r;
  const ox = Math.max(qx, 0), oy = Math.max(qy, 0), oz = Math.max(qz, 0);
  return Math.sqrt(ox * ox + oy * oy + oz * oz) + Math.min(Math.max(qx, qy, qz), 0) - r;
}
/** Ellipsoïde (approximation conservatrice de la distance). */
export function sdEllipsoid(x, y, z, cx, cy, cz, rx, ry, rz) {
  const px = (x - cx) / rx, py = (y - cy) / ry, pz = (z - cz) / rz;
  const k0 = Math.sqrt(px * px + py * py + pz * pz);
  const qx = px / rx, qy = py / ry, qz = pz / rz, k1 = Math.sqrt(qx * qx + qy * qy + qz * qz);
  return k1 < 1e-9 ? -Math.min(rx, ry, rz) : k0 * (k0 - 1) / k1;
}
/** Capsule entre deux points. */
export function sdCapsule(x, y, z, ax, ay, az, bx, by, bz, r) {
  const pax = x - ax, pay = y - ay, paz = z - az, bax = bx - ax, bay = by - ay, baz = bz - az;
  const h = clamp((pax * bax + pay * bay + paz * baz) / (bax * bax + bay * bay + baz * baz), 0, 1);
  const dx = pax - bax * h, dy = pay - bay * h, dz = paz - baz * h;
  return Math.sqrt(dx * dx + dy * dy + dz * dz) - r;
}

/** Courbe de Catmull-Rom (centripète) fermée ou ouverte, échantillonnée. */
export function catmullRom(pts, { closed = true, per = 10 } = {}) {
  const n = pts.length, out = [];
  const P = i => closed ? pts[(i + n) % n] : pts[clamp(i, 0, n - 1)];
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
    const tj = (a, b, t) => t + Math.pow(Math.hypot(b[0] - a[0], b[1] - a[1]), 0.5) + 1e-6;
    const t0 = 0, t1 = tj(p0, p1, t0), t2 = tj(p1, p2, t1), t3 = tj(p2, p3, t2);
    for (let s = 0; s < per; s++) {
      const t = t1 + (t2 - t1) * s / per;
      const L = (a, b, ta, tb) => [a[0] * (tb - t) / (tb - ta) + b[0] * (t - ta) / (tb - ta), a[1] * (tb - t) / (tb - ta) + b[1] * (t - ta) / (tb - ta)];
      const A1 = L(p0, p1, t0, t1), A2 = L(p1, p2, t1, t2), A3 = L(p2, p3, t2, t3);
      const B1 = L(A1, A2, t0, t2), B2 = L(A2, A3, t1, t3);
      out.push(L(B1, B2, t1, t2));
    }
  }
  if (!closed) out.push(pts[n - 1].slice());
  return out;
}

/** Distance signée exacte à un polygone fermé (négative à l'intérieur). */
export function polyDist(poly, u, v) {
  let d = Infinity, inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const ax = poly[j][0], ay = poly[j][1], bx = poly[i][0], by = poly[i][1];
    const ex = bx - ax, ey = by - ay, wx = u - ax, wy = v - ay;
    const t = clamp((wx * ex + wy * ey) / (ex * ex + ey * ey || 1), 0, 1);
    const dx = wx - ex * t, dy = wy - ey * t, dd = dx * dx + dy * dy;
    if (dd < d) d = dd;
    if ((ay > v) !== (by > v) && u < ax + (v - ay) * ex / ey) inside = !inside;
  }
  return inside ? -Math.sqrt(d) : Math.sqrt(d);
}

/** Champ de distance 2D précalculé sur une grille (lecture bilinéaire rapide). */
export class Field2D {
  /**
   * Distance exacte jusqu'à `R` du contour, saturée à ±R au-delà (suffisant pour les raccords et la bande de maillage).
   * Signe par balayage de lignes, distance par « rastérisation » du voisinage de chaque segment : O(périmètre), pas O(points × segments).
   */
  constructor(poly, u0, u1, v0, v1, res, R = 0.4) {
    this.u0 = u0; this.v0 = v0; this.res = res;
    const nu = this.nu = Math.ceil((u1 - u0) / res) + 1, nv = this.nv = Math.ceil((v1 - v0) / res) + 1;
    const D = this.d = new Float32Array(nu * nv).fill(R * R);
    const n = poly.length;
    // Distances au carré dans le voisinage de chaque segment
    for (let s = 0; s < n; s++) {
      const ax = poly[s][0], ay = poly[s][1], bx = poly[(s + 1) % n][0], by = poly[(s + 1) % n][1];
      const ex = bx - ax, ey = by - ay, ee = ex * ex + ey * ey || 1;
      const i0 = Math.max(0, Math.floor((Math.min(ax, bx) - R - u0) / res)), i1 = Math.min(nu - 1, Math.ceil((Math.max(ax, bx) + R - u0) / res));
      const j0 = Math.max(0, Math.floor((Math.min(ay, by) - R - v0) / res)), j1 = Math.min(nv - 1, Math.ceil((Math.max(ay, by) + R - v0) / res));
      for (let j = j0; j <= j1; j++) {
        const v = v0 + j * res;
        for (let i = i0; i <= i1; i++) {
          const wx = u0 + i * res - ax, wy = v - ay;
          const t = clamp((wx * ex + wy * ey) / ee, 0, 1), dx = wx - ex * t, dy = wy - ey * t, dd = dx * dx + dy * dy;
          const k = i + j * nu; if (dd < D[k]) D[k] = dd;
        }
      }
    }
    // Signe : parité des croisements sur chaque ligne
    const xs = [];
    for (let j = 0; j < nv; j++) {
      const v = v0 + j * res; xs.length = 0;
      for (let s = 0; s < n; s++) {
        const ax = poly[s][0], ay = poly[s][1], bx = poly[(s + 1) % n][0], by = poly[(s + 1) % n][1];
        if ((ay > v) !== (by > v)) xs.push(ax + (v - ay) * (bx - ax) / (by - ay));
      }
      xs.sort((a, b) => a - b);
      let c = 0;
      for (let i = 0; i < nu; i++) {
        const u = u0 + i * res; while (c < xs.length && xs[c] < u) c++;
        const k = i + j * nu, d = Math.sqrt(D[k]);
        D[k] = c & 1 ? -d : d;
      }
    }
  }
  get(u, v) {
    let fu = (u - this.u0) / this.res, fv = (v - this.v0) / this.res, extra = 0;
    const nu = this.nu, nv = this.nv;
    if (fu < 0 || fv < 0 || fu > nu - 1 || fv > nv - 1) {
      // Hors grille : valeur du bord + distance au bord (borne conservatrice)
      const cu = clamp(fu, 0, nu - 1), cv = clamp(fv, 0, nv - 1);
      const eu = (fu - cu) * this.res, ev = (fv - cv) * this.res; extra = Math.sqrt(eu * eu + ev * ev); fu = cu; fv = cv;
    }
    const i = Math.min(nu - 2, fu | 0), j = Math.min(nv - 2, fv | 0), a = fu - i, b = fv - j, k = i + j * nu, D = this.d;
    return (D[k] * (1 - a) + D[k + 1] * a) * (1 - b) + (D[k + nu] * (1 - a) + D[k + nu + 1] * a) * b + extra;
  }
}

/** Fonction 1D lissée définie par points (interpolation de Catmull-Rom sur x croissant). */
export function curve1D(keys) {
  const xs = keys.map(k => k[0]), ys = keys.map(k => k[1]), n = keys.length;
  return x => {
    if (x <= xs[0]) return ys[0];
    if (x >= xs[n - 1]) return ys[n - 1];
    let i = 0; while (x > xs[i + 1]) i++;
    const t = (x - xs[i]) / (xs[i + 1] - xs[i]);
    const i0 = Math.max(0, i - 1), i3 = Math.min(n - 1, i + 2), w = xs[i + 1] - xs[i];
    const y1 = ys[i], y2 = ys[i + 1];
    const m1 = (y2 - ys[i0]) / (xs[i + 1] - xs[i0]) * w, m2 = (ys[i3] - y1) / (xs[i3] - xs[i]) * w, t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * y1 + (t3 - 2 * t2 + t) * m1 + (-2 * t3 + 3 * t2) * y2 + (t3 - t2) * m2;
  };
}
