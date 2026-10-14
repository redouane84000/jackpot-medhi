import { neutralControls } from './VehiclePhysics.js';

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

/**
 * Contrôleur de véhicule commun au joueur humain et à l'IA.
 * Une « source » (clavier/manette ou cerveau du bot) exprime des intentions ; le contrôleur
 * les normalise en commandes identiques pour tous. Le bot n'a donc aucun privilège physique.
 */
export class VehicleController {
  constructor(source) { this.source = source; this.controls = neutralControls(); }

  update(sim, car, dt) {
    const raw = this.source.read(sim, car, dt) || {};
    const c = this.controls;
    c.throttle = clamp(+raw.throttle || 0, -1, 1);
    c.steer = clamp(+raw.steer || 0, -1, 1);
    c.boost = !!raw.boost;
    c.jump = !!raw.jump;
    c.handbrake = !!raw.handbrake;
    c.airRoll = !!raw.airRoll;
    return c;
  }
}
