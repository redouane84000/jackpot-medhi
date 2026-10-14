/**
 * Entrées du joueur : clavier (positions physiques, donc AZERTY et QWERTY), manette (API Gamepad)
 * et commandes tactiles. Fournit des intentions de pilotage au VehicleController
 * et des appuis ponctuels (caméra, pause, mode développeur, son).
 */
const GAMEPAD = { jump: 0, boost: 1, handbrake: 2, camera: 3, airRoll: 4, pause: 9, throttle: 7, brake: 6 };

export class InputManager {
  constructor(mapping, target = window) {
    this.mapping = mapping;
    this.down = new Set(); this.pressed = new Set();
    this.codeToAction = new Map();
    for (const [action, codes] of Object.entries(mapping)) for (const c of codes) {
      if (!this.codeToAction.has(c)) this.codeToAction.set(c, []);
      this.codeToAction.get(c).push(action);
    }
    this.touch = { throttle: 0, steer: 0, boost: false, jump: false, handbrake: false };
    this.gp = { throttle: 0, steer: 0, boost: false, jump: false, handbrake: false, airRoll: false };
    this.gpPrev = new Set(); this.lastDevice = 'keyboard';
    this._onKeyDown = e => {
      const acts = this.codeToAction.get(e.code);
      if (!acts) return;
      if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
      e.preventDefault();                                 // pas de défilement de page avec Espace ou les flèches
      if (!e.repeat) for (const a of acts) { if (!this.down.has(a)) this.pressed.add(a); this.down.add(a); }
      this.lastDevice = 'keyboard';
    };
    this._onKeyUp = e => { const acts = this.codeToAction.get(e.code); if (!acts) return; e.preventDefault(); for (const a of acts) this.down.delete(a); };
    this._onBlur = () => this.reset();                  // fenêtre inactive : toutes les touches sont relâchées
    this._onVis = () => { if (document.hidden) this.reset(); };
    target.addEventListener('keydown', this._onKeyDown, { passive: false });
    target.addEventListener('keyup', this._onKeyUp, { passive: false });
    window.addEventListener('blur', this._onBlur);
    document.addEventListener('visibilitychange', this._onVis);
    this.target = target;
  }

  reset() { this.down.clear(); this.pressed.clear(); Object.assign(this.touch, { throttle: 0, steer: 0, boost: false, jump: false, handbrake: false }); }

  /** Appui ponctuel (front montant) consommé une seule fois. */
  consume(action) { const p = this.pressed.has(action); this.pressed.delete(action); return p; }

  pollGamepad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const gp = [...pads].find(p => p && p.connected);
    const g = this.gp;
    if (!gp) { Object.assign(g, { throttle: 0, steer: 0, boost: false, jump: false, handbrake: false, airRoll: false }); return; }
    const btn = i => gp.buttons[i] && (gp.buttons[i].pressed || gp.buttons[i].value > 0.5);
    const val = i => (gp.buttons[i] ? gp.buttons[i].value : 0);
    const dz = v => (Math.abs(v) < 0.15 ? 0 : (v - Math.sign(v) * 0.15) / 0.85);
    g.steer = -dz(gp.axes[0] || 0);
    g.throttle = val(GAMEPAD.throttle) - val(GAMEPAD.brake);
    if (Math.abs(g.throttle) < 0.05) g.throttle = -dz(gp.axes[1] || 0);       // sans gâchette : stick (tangage en l'air)
    g.boost = btn(GAMEPAD.boost); g.jump = btn(GAMEPAD.jump); g.handbrake = btn(GAMEPAD.handbrake); g.airRoll = btn(GAMEPAD.airRoll);
    const now = new Set();
    for (const [a, i] of [['camera', GAMEPAD.camera], ['pause', GAMEPAD.pause]]) { if (btn(i)) { now.add(a); if (!this.gpPrev.has(a)) this.pressed.add(a); } }
    this.gpPrev = now;
    if (g.boost || g.jump || Math.abs(g.steer) > 0 || Math.abs(g.throttle) > 0) this.lastDevice = 'gamepad';
  }

  /** Source d'intentions pour le VehicleController du joueur. */
  read() {
    const d = this.down, g = this.gp, t = this.touch;
    const kThrottle = (d.has('throttle') ? 1 : 0) - (d.has('brake') ? 1 : 0);
    const kSteer = (d.has('left') ? 1 : 0) - (d.has('right') ? 1 : 0);
    const pick = (a, b, c) => (Math.abs(a) > 0.01 ? a : Math.abs(b) > 0.01 ? b : c);
    return {
      throttle: pick(kThrottle, g.throttle, t.throttle),
      steer: pick(kSteer, g.steer, t.steer),
      boost: d.has('boost') || g.boost || t.boost,
      jump: d.has('jump') || g.jump || t.jump,
      handbrake: d.has('handbrake') || g.handbrake || t.handbrake,
      airRoll: d.has('airRoll') || g.airRoll,
    };
  }

  /** Commandes tactiles (téléphone, tablette) : stick virtuel à gauche, boutons à droite. */
  mountTouch(root) {
    const wrap = document.createElement('div'); wrap.className = 'touch'; wrap.innerHTML = `
      <div class="stick" id="tStick"><div class="knob" id="tKnob"></div></div>
      <div class="tbtns"><button id="tDrift" type="button">Dérapage</button><button id="tBoost" type="button">Boost</button><button id="tJump" type="button">Saut</button></div>`;
    root.appendChild(wrap);
    const stick = wrap.querySelector('#tStick'), knob = wrap.querySelector('#tKnob');
    let id = null;
    const move = e => { const r = stick.getBoundingClientRect(), R = r.width / 2; let dx = e.clientX - (r.left + R), dy = e.clientY - (r.top + R); const l = Math.hypot(dx, dy); if (l > R) { dx *= R / l; dy *= R / l; } knob.style.transform = `translate(${dx}px, ${dy}px)`; this.touch.steer = -dx / R; this.touch.throttle = -dy / R * 1.4; this.touch.throttle = Math.max(-1, Math.min(1, this.touch.throttle)); };
    stick.addEventListener('pointerdown', e => { id = e.pointerId; stick.setPointerCapture(id); move(e); this.lastDevice = 'touch'; });
    stick.addEventListener('pointermove', e => { if (e.pointerId === id) move(e); });
    const end = e => { if (e.pointerId !== id) return; id = null; knob.style.transform = ''; this.touch.steer = 0; this.touch.throttle = 0; };
    stick.addEventListener('pointerup', end); stick.addEventListener('pointercancel', end);
    const hold = (sel, key) => { const b = wrap.querySelector(sel); const on = e => { e.preventDefault(); this.touch[key] = true; b.classList.add('on'); }; const off = () => { this.touch[key] = false; b.classList.remove('on'); }; b.addEventListener('pointerdown', on); b.addEventListener('pointerup', off); b.addEventListener('pointercancel', off); b.addEventListener('pointerleave', off); };
    hold('#tJump', 'jump'); hold('#tBoost', 'boost'); hold('#tDrift', 'handbrake');
    return wrap;
  }

  dispose() {
    this.target.removeEventListener('keydown', this._onKeyDown); this.target.removeEventListener('keyup', this._onKeyUp);
    window.removeEventListener('blur', this._onBlur); document.removeEventListener('visibilitychange', this._onVis);
  }
}
