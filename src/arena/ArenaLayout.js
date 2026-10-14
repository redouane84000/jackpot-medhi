/**
 * Géométrie de l'arène, partagée par la physique (colliders) et le rendu (visuels).
 * Aucune dépendance au moteur physique ni à Three.js : uniquement des données.
 *
 * Repère : Y vers le haut, terrain dans le plan XZ.
 * But bleu en Z négatif (défendu par l'équipe bleue), but orange en Z positif.
 */
export function buildArenaLayout(C) {
  const hx = C.ARENA_WIDTH / 2, hz = C.ARENA_LENGTH / 2;
  const rc = C.ARENA_CORNER_RADIUS, t = C.WALL_THICKNESS, H = C.ARENA_CEILING;
  const gw = C.GOAL_WIDTH / 2, gh = C.GOAL_HEIGHT, gd = C.GOAL_DEPTH, pr = C.GOAL_POST_RADIUS;
  const boxes = [];   // { name, c:[x,y,z], h:[hx,hy,hz], yaw, kind }
  const posts = [];   // cylindres { c, halfHeight, radius, axis:'y'|'x' }

  const box = (name, kind, c, h, yaw = 0) => boxes.push({ name, kind, c, h, yaw });

  // Sol et plafond
  box('floor', 'floor', [0, -1, 0], [hx + 30, 1, hz + gd + 30]);
  box('ceiling', 'ceiling', [0, H + 1, 0], [hx + 30, 1, hz + gd + 30]);

  // Murs latéraux (le long de Z)
  for (const s of [-1, 1]) box(`side-${s}`, 'wall', [s * (hx + t / 2), H / 2, 0], [t / 2, H / 2, hz - rc]);

  // Murs de fond, ouverts sur la cage
  for (const s of [-1, 1]) {
    const segHalf = (hx - rc - gw) / 2;
    for (const k of [-1, 1]) box(`end-${s}-${k}`, 'wall', [k * (gw + segHalf), H / 2, s * (hz + t / 2)], [segHalf, H / 2, t / 2]);
    box(`end-${s}-top`, 'wall', [0, (gh + H) / 2, s * (hz + t / 2)], [gw + 0.01, (H - gh) / 2, t / 2]);
  }

  // Coins arrondis : pans tangents à l'arc
  const N = C.ARENA_CORNER_SEGMENTS, dA = (Math.PI / 2) / N;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const cx = sx * (hx - rc), cz = sz * (hz - rc);
    for (let i = 0; i < N; i++) {
      const a = (i + 0.5) * dA;                        // 0 → 90° dans le quadrant
      const nx = sx * Math.sin(a), nz = sz * Math.cos(a); // normale sortante
      const half = (rc + t) * Math.tan(dA / 2) + 0.05;
      box(`corner-${sx}-${sz}-${i}`, 'wall', [cx + nx * (rc + t / 2), H / 2, cz + nz * (rc + t / 2)], [half, H / 2, t / 2], Math.atan2(nx, nz));
    }
  }

  // Cages : fond, côtés, toit (de vrais volumes, ouverture libre sur le terrain)
  for (const s of [-1, 1]) {
    box(`goal-${s}-back`, 'goal', [0, gh / 2, s * (hz + gd + t / 2)], [gw + t, gh / 2 + t / 2, t / 2]);
    for (const k of [-1, 1]) box(`goal-${s}-side-${k}`, 'goal', [k * (gw + t / 2), gh / 2, s * (hz + gd / 2)], [t / 2, gh / 2, gd / 2 + 0.01]);
    box(`goal-${s}-roof`, 'goal', [0, gh + t / 2, s * (hz + gd / 2)], [gw + t, t / 2, gd / 2 + 0.01]);
    // Montants et barre transversale arrondis
    for (const k of [-1, 1]) posts.push({ name: `post-${s}-${k}`, c: [k * gw, gh / 2, s * hz], halfHeight: gh / 2, radius: pr, axis: 'y' });
    posts.push({ name: `bar-${s}`, c: [0, gh, s * hz], halfHeight: gw, radius: pr, axis: 'x' });
  }

  const goals = [
    { team: 'blue', sign: -1, lineZ: -hz, width: C.GOAL_WIDTH, height: gh, depth: gd },
    { team: 'orange', sign: 1, lineZ: hz, width: C.GOAL_WIDTH, height: gh, depth: gd },
  ];

  // Pastilles de boost (disposition originale, symétrique)
  const pads = [];
  const big = (x, z) => pads.push({ x, z, big: true });
  const small = (x, z) => pads.push({ x, z, big: false });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) big(sx * (hx - 7), sz * (hz - 9));
  for (const sx of [-1, 1]) big(sx * (hx - 4), 0);
  for (const sz of [-1, 1]) {
    small(0, sz * (hz - 6));
    for (const sx of [-1, 1]) {
      small(sx * 9, sz * (hz - 13));
      small(sx * 20, sz * (hz - 20));
      small(sx * 6, sz * 30);
      small(sx * 24, sz * 34);
      small(sx * 14, sz * 18);
      small(sx * 26, sz * 12);
    }
    small(0, sz * 22);
    small(0, sz * 10);
  }
  for (const sx of [-1, 1]) small(sx * 14, 0);

  // Positions d'engagement (miroir parfait entre les deux équipes)
  const kickoffs = [
    { x: 0, z: 30 },        // centre, recul
    { x: -11, z: 22 },      // diagonale gauche
    { x: 11, z: 22 },       // diagonale droite
    { x: -4, z: 34 },       // décalé
  ];

  return { hx, hz, rc, H, boxes, posts, goals, pads, kickoffs };
}

/** Distance signée (négative à l'intérieur) au contour intérieur de l'arène, vue de dessus. */
export function arenaSDF(L, x, z) {
  const qx = Math.abs(x) - (L.hx - L.rc), qz = Math.abs(z) - (L.hz - L.rc);
  const ox = Math.max(qx, 0), oz = Math.max(qz, 0);
  return Math.hypot(ox, oz) + Math.min(Math.max(qx, qz), 0) - L.rc;
}
