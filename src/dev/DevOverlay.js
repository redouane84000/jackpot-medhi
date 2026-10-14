/** Diagnostics développeur (F3 ou ², ou ?dev dans l'adresse) : jamais affichés par défaut. */
export class DevOverlay {
  constructor(root) {
    this.el = document.createElement('pre'); this.el.className = 'dev'; this.el.hidden = true; root.appendChild(this.el);
    this.fps = 60; this.acc = 0; this.frames = 0;
    try { if (/[?&]dev\b/.test(location.search)) this.el.hidden = false; } catch (e) { /* ignore */ }
  }
  toggle() { this.el.hidden = !this.el.hidden; }
  update(dt, d) {
    this.acc += dt; this.frames++;
    if (this.acc >= 0.5) { this.fps = this.frames / this.acc; this.acc = 0; this.frames = 0; }
    if (this.el.hidden) return;
    this.el.textContent =
`FPS              ${this.fps.toFixed(0)}  (pixel ratio ${d.dpr.toFixed(2)})
Pas physiques     ${d.steps}/image · ${d.simTime.toFixed(1)} s simulées
Corps physiques   ${d.bodies}
Collisions        ${d.collisions}
Ballon            ${(d.ballSpeed * 3.6).toFixed(0)} km/h · ${d.touches} touches
Voiture           ${(d.carSpeed * 3.6).toFixed(0)} km/h · roues au sol ${d.grounded}/4
Match             ${d.state}
IA                ${d.ai}
Temps perdu       ${d.dropped.toFixed(2)} s (rattrapage plafonné)`;
  }
}
