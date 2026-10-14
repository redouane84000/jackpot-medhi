import { EngineSynth } from './EngineSynth.js';

/**
 * Audio entièrement synthétisé (Web Audio) : aucun fichier son externe.
 * Moteurs V12 / V8 biturbo (audio/EngineSynth.js : cycle de combustion, boîte, pétarades, turbos), boost,
 * impacts, rebonds, foule, klaxon de but, bips du compte à rebours.
 * Le contexte audio ne démarre qu'après un geste du joueur (règle des navigateurs).
 */
export class AudioManager {
  constructor() { this.ctx = null; this.muted = false; this.engines = []; }

  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    const ctx = this.ctx = new AC();
    this.master = ctx.createGain(); this.master.gain.value = this.muted ? 0 : 0.8;
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4;
    this.master.connect(comp); comp.connect(ctx.destination);
    const len = ctx.sampleRate * 2, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noise = buf;
    // Foule : bruit filtré permanent
    const crowd = this.loopNoise(); const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900;
    const bp = ctx.createBiquadFilter(); bp.type = 'peaking'; bp.frequency.value = 450; bp.gain.value = 6;
    this.crowdGain = ctx.createGain(); this.crowdGain.gain.value = 0.05;
    crowd.connect(lp); lp.connect(bp); bp.connect(this.crowdGain); this.crowdGain.connect(this.master);
  }

  loopNoise() { const s = this.ctx.createBufferSource(); s.buffer = this.noise; s.loop = true; s.start(); return s; }

  addEngine(isPlayer, profile = 'v8') {
    const e = { isPlayer, profile, ready: false, synth: null };
    this.engines.push(e);
    return e;
  }

  /** Change le moteur d'une voiture (V12 / V8). */
  setEngineProfile(i, profile) { const e = this.engines[i]; if (!e) return; e.profile = profile; if (e.synth) e.synth.setProfile(profile); }

  /** Coup d'accélérateur de démonstration (menu). */
  blip(i) { this.unlock(); const e = this.engines[i]; if (!e) return; if (!e.ready) this._buildEngine(e); e.synth.blip(); }

  _buildEngine(e) {
    const ctx = this.ctx;
    e.synth = new EngineSynth(ctx, this.master, this.noise, e.profile, { isPlayer: e.isPlayer });
    const b = this.loopNoise(); e.bf = ctx.createBiquadFilter(); e.bf.type = 'bandpass'; e.bf.frequency.value = 1100; e.bf.Q.value = 0.7;
    e.bg = ctx.createGain(); e.bg.gain.value = 0; b.connect(e.bf); e.bf.connect(e.bg); e.bg.connect(this.master);
    e.ready = true;
  }

  setMuted(m) { this.muted = m; if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.8, this.ctx.currentTime, 0.05); }

  /** Mise à jour continue : moteurs, boost, foule. */
  update(cars, cheer, active, dt = 1 / 60) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    cars.forEach((c, i) => {
      const e = this.engines[i]; if (!e) return; if (!e.ready) this._buildEngine(e);
      e.synth.update(dt, { ...c, active });
      e.bg.gain.setTargetAtTime(c.boosting ? (e.isPlayer ? 0.12 : Math.max(0, 0.08 - c.dist / 300)) : 0, t, 0.04);
    });
    this.crowdGain.gain.setTargetAtTime(0.035 + cheer * 0.11, t, 0.4);
  }

  _env(node, peak, a, d) { const g = this.ctx.createGain(), t = this.ctx.currentTime; g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d); node.connect(g); g.connect(this.master); return g; }
  _osc(type, f, peak, a, d, f2) { const o = this.ctx.createOscillator(), t = this.ctx.currentTime; o.type = type; o.frequency.setValueAtTime(f, t); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + a + d); this._env(o, peak, a, d); o.start(t); o.stop(t + a + d + 0.05); }
  _burst(fc, q, peak, d) { const s = this.ctx.createBufferSource(), t = this.ctx.currentTime; s.buffer = this.noise; const f = this.ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = fc; f.Q.value = q; s.connect(f); this._env(f, peak, 0.004, d); s.start(t, Math.random()); s.stop(t + d + 0.1); }

  hit(strength) { if (!this.ctx) return; const k = Math.min(1, strength / 25); this._osc('sine', 110, 0.25 + k * 0.5, 0.005, 0.25, 45); this._burst(1600, 0.8, 0.15 + k * 0.4, 0.12); }
  bounce(strength) { if (!this.ctx || strength < 3) return; const k = Math.min(1, strength / 30); this._osc('sine', 80, 0.12 + k * 0.3, 0.005, 0.2, 40); }
  thud(strength) { if (!this.ctx || strength < 6) return; const k = Math.min(1, strength / 30); this._burst(300, 1, 0.1 + k * 0.3, 0.2); this._osc('sine', 60, 0.1 + k * 0.25, 0.005, 0.25, 35); }
  jump() { if (!this.ctx) return; this._burst(2200, 0.6, 0.08, 0.18); }
  pickup(big) { if (!this.ctx) return; this._osc('sine', big ? 520 : 760, big ? 0.18 : 0.1, 0.005, big ? 0.3 : 0.12, big ? 1560 : 1400); }
  beep(go) { if (!this.ctx) return; this._osc('square', go ? 880 : 587, 0.12, 0.005, go ? 0.45 : 0.16); }
  goal(forPlayer) {
    if (!this.ctx) return;
    const chord = forPlayer ? [220, 277, 330, 440] : [196, 233, 294];
    for (const f of chord) this._osc('sawtooth', f, 0.07, 0.03, 1.5);
    this._burst(500, 0.3, 0.5, 2.6);
    this.crowdGain.gain.setTargetAtTime(0.32, this.ctx.currentTime, 0.1);
  }
  whistle() { if (!this.ctx) return; this._osc('sine', 2100, 0.1, 0.01, 0.5, 2300); }
}
