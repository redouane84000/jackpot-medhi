/**
 * Détection des buts, indépendante du rendu et des animations.
 * Un but n'est signalé que lorsque la sphère ENTIÈRE a franchi la ligne, entre les montants et sous la barre,
 * et uniquement au passage de l'extérieur vers l'intérieur (jamais deux fois pour le même passage).
 * La validation (état du match, score) appartient au MatchManager.
 */
export class GoalDetector {
  constructor(layout, C) {
    this.goals = layout.goals;
    this.r = C.BALL_RADIUS;
    this.inside = this.goals.map(() => false);
  }

  reset() { this.inside.fill(false); }

  /** Renvoie la cage franchie à ce pas ({ team: équipe qui défend cette cage, sign, ... }) ou null. */
  update(p) {
    for (let i = 0; i < this.goals.length; i++) {
      const g = this.goals[i], s = g.sign, line = Math.abs(g.lineZ);
      const depth = s * p.z;                                   // profondeur signée vers cette cage
      const fullyIn = depth - this.r > line && Math.abs(p.x) < g.width / 2 && p.y < g.height;
      const clearlyOut = depth + this.r < line;                // hystérésis : le ballon est ressorti entièrement
      if (fullyIn && !this.inside[i]) { this.inside[i] = true; return g; }
      if (clearlyOut) this.inside[i] = false;
    }
    return null;
  }
}
