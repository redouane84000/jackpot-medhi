/**
 * Boucle à pas de temps fixe avec accumulateur.
 * La simulation avance toujours par pas de `dt`, quelle que soit la fréquence d'affichage :
 * une baisse de FPS ne change ni la physique ni le chronomètre. Le rattrapage est plafonné
 * (`maxSteps` par image) pour éviter la spirale de surcharge ; au-delà, le jeu ralentit plutôt que de se figer.
 */
export class FixedStepLoop {
  constructor(dt, maxSteps) { this.dt = dt; this.maxSteps = maxSteps; this.acc = 0; this.dropped = 0; }

  /** Avance de `frameDt` secondes réelles. Appelle stepFn() n fois. Renvoie { steps, alpha } (alpha : interpolation). */
  advance(frameDt, stepFn) {
    this.acc += Math.max(0, Math.min(frameDt, 0.25));
    let steps = 0;
    while (this.acc >= this.dt && steps < this.maxSteps) { stepFn(this.dt); this.acc -= this.dt; steps++; }
    if (steps === this.maxSteps && this.acc >= this.dt) { this.dropped += this.acc; this.acc = this.acc % this.dt; }
    return { steps, alpha: this.acc / this.dt };
  }

  reset() { this.acc = 0; }
}
