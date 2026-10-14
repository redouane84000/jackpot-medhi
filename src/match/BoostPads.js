/** Pastilles de recharge de boost : ramassage par proximité, réapparition minutée. Logique pure. */
export class BoostPads {
  constructor(layout, C) {
    this.C = C;
    this.pads = layout.pads.map((p, i) => ({ ...p, id: i, active: true, timer: 0 }));
  }

  reset() { for (const p of this.pads) { p.active = true; p.timer = 0; } }

  /** Renvoie la liste des ramassages de ce pas : [{ pad, car }]. */
  update(dt, cars) {
    const C = this.C, picked = [];
    for (const p of this.pads) {
      if (!p.active) { p.timer -= dt; if (p.timer <= 0) p.active = true; continue; }
      const r = p.big ? C.BOOST_PAD_BIG_RADIUS : C.BOOST_PAD_SMALL_RADIUS;
      for (const car of cars) {
        if (car.boost >= 100) continue;
        const t = car.body.translation();
        if (t.y > 2.6) continue;
        const dx = t.x - p.x, dz = t.z - p.z;
        if (dx * dx + dz * dz > r * r) continue;
        car.boost = Math.min(100, car.boost + (p.big ? C.BOOST_PAD_BIG_AMOUNT : C.BOOST_PAD_SMALL_AMOUNT));
        p.active = false; p.timer = p.big ? C.BOOST_PAD_BIG_RESPAWN : C.BOOST_PAD_SMALL_RESPAWN;
        picked.push({ pad: p, car });
        break;
      }
    }
    return picked;
  }
}
