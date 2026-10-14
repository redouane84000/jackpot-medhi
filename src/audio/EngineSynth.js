/**
 * Synthèse de moteur thermique (Web Audio, aucun échantillon) :
 *  - forme d'onde d'un cycle complet (720°) construite impulsion par impulsion, puis convertie en série de Fourier
 *    (PeriodicWave) : la fréquence de l'oscillateur suit le régime (tr/min ÷ 120) ;
 *      V12 : 12 explosions régulières → cri aigu et lisse ;
 *      V8 à vilebrequin croisé : 8 explosions d'amplitudes et d'espacements inégaux → grondement « bou-bou-bou » ;
 *  - saturation (WaveShaper) qui monte avec la charge, filtre passe-bas qui s'ouvre avec le régime et l'accélérateur,
 *    résonance d'échappement, bruit d'admission ;
 *  - boîte à rapports simulée (montée/descente, coupure et « brap » au passage de rapport) ;
 *  - au lever de pied à haut régime : rafale de claquements à l'échappement (pétarades) ;
 *  - V8 biturbo : sifflement des turbos et soupape de décharge (« pschhh »).
 */
const PROFILES = {
  // V12 grave de grand tourisme : régime modéré, rangées de cylindres déséquilibrées (graves riches), aigus filtrés
  v12: {
    cyl: 12, idle: 740, redline: 6000, shiftUp: 0.78, shiftDown: 0.44,
    gears: [8, 13.5, 19, 24.5, 30, 36, 42],
    amps: [1, 0.72, 0.94, 0.66, 0.98, 0.78, 1, 0.7, 0.92, 0.68, 0.97, 0.74], jitter: 0.045,
    reso: 1.25, decay: 0.6, drive: 3.0, lpBase: 220, lpSpan: 1350, exhaustHz: 85, exhaustGain: 10, sub: 0.55,
    crackle: 0.8, turbo: 0, intake: 0.1, gain: 0.58, roll: 22,
  },
  v8: {
    cyl: 8, idle: 760, redline: 7000, shiftUp: 0.86, shiftDown: 0.46,
    gears: [8, 13.5, 19, 24.5, 30, 36, 42],
    amps: [1.0, 0.62, 0.92, 0.55, 0.98, 0.7, 0.86, 0.5], jitter: 0.07,
    reso: 1.4, decay: 0.5, drive: 3.6, lpBase: 260, lpSpan: 2000, exhaustHz: 110, exhaustGain: 9, sub: 0.38,
    crackle: 1.0, turbo: 1, intake: 0.16, gain: 0.58, roll: 40,
  },
};

/** Forme d'onde d'un cycle moteur → série de Fourier (PeriodicWave). */
function cycleWave(ctx, P, H = 72) {
  const N = 2048, w = new Float32Array(N);
  for (let k = 0; k < P.cyl; k++) {
    const t0 = (k + (Math.sin(k * 12.9898) * 0.5) * P.jitter * 2) / P.cyl;
    const amp = P.amps[k % P.amps.length];
    for (let i = 0; i < N; i++) {
      let t = i / N - t0; if (t < 0) t += 1;
      const tp = t * P.cyl;                         // temps en périodes d'allumage
      if (tp > 2.2) continue;
      w[i] += amp * Math.exp(-tp / P.decay) * Math.sin(2 * Math.PI * P.reso * tp) + amp * 0.35 * Math.exp(-tp / (P.decay * 2.5));
    }
  }
  let mean = 0; for (let i = 0; i < N; i++) mean += w[i]; mean /= N; for (let i = 0; i < N; i++) w[i] -= mean;
  const re = new Float32Array(H + 1), im = new Float32Array(H + 1);
  for (let h = 1; h <= H; h++) {
    let a = 0, b = 0; for (let i = 0; i < N; i++) { const ph = 2 * Math.PI * h * i / N; a += w[i] * Math.cos(ph); b += w[i] * Math.sin(ph); }
    const roll = 1 / (1 + Math.pow(h / (P.roll || 40), 2));   // atténuation des harmoniques hautes
    re[h] = a / N * roll; im[h] = b / N * roll;
  }
  return ctx.createPeriodicWave(re, im);
}

function shaperCurve(drive) {
  const n = 2048, c = new Float32Array(n);
  for (let i = 0; i < n; i++) { const x = i / (n - 1) * 2 - 1; c[i] = Math.tanh(x * drive) / Math.tanh(drive); }
  return c;
}

export class EngineSynth {
  constructor(ctx, out, noise, profile = 'v8', { isPlayer = true } = {}) {
    this.ctx = ctx; this.noise = noise; this.isPlayer = isPlayer;
    this.out = ctx.createGain(); this.out.gain.value = 0;
    this.pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    // éloignement : le moteur adverse s'étouffe avec la distance (passe-bas), comme dans un stade
    this.distLp = ctx.createBiquadFilter(); this.distLp.type = 'lowpass'; this.distLp.frequency.value = 16000; this.distLp.Q.value = 0.5;
    this.out.connect(this.distLp);
    if (this.pan) { this.distLp.connect(this.pan); this.pan.connect(out); } else this.distLp.connect(out);
    // Chaîne principale
    this.o1 = ctx.createOscillator(); this.o2 = ctx.createOscillator();
    this.sub = ctx.createOscillator(); this.sub.type = 'sine';
    this.mix = ctx.createGain(); this.mix.gain.value = 0.6;
    this.o2g = ctx.createGain(); this.o2g.gain.value = 0.55;
    this.subg = ctx.createGain(); this.subg.gain.value = 0;
    this.shaper = ctx.createWaveShaper(); this.shaper.oversample = '2x';
    this.lp = ctx.createBiquadFilter(); this.lp.type = 'lowpass'; this.lp.Q.value = 0.9;
    this.ex = ctx.createBiquadFilter(); this.ex.type = 'peaking'; this.ex.Q.value = 1.1;
    this.hp = ctx.createBiquadFilter(); this.hp.type = 'highpass'; this.hp.frequency.value = 28;
    this.eng = ctx.createGain(); this.eng.gain.value = 0;
    this.o1.connect(this.mix); this.o2.connect(this.o2g); this.o2g.connect(this.mix);
    this.mix.connect(this.shaper); this.shaper.connect(this.lp); this.lp.connect(this.ex); this.ex.connect(this.hp); this.hp.connect(this.eng); this.eng.connect(this.out);
    this.sub.connect(this.subg); this.subg.connect(this.out);
    // Admission (bruit filtré)
    this.inSrc = this._loop(); this.inBp = ctx.createBiquadFilter(); this.inBp.type = 'bandpass'; this.inBp.Q.value = 1.4;
    this.inG = ctx.createGain(); this.inG.gain.value = 0; this.inSrc.connect(this.inBp); this.inBp.connect(this.inG); this.inG.connect(this.out);
    // Turbos : sifflement
    this.tw = ctx.createOscillator(); this.tw.type = 'sine'; this.twG = ctx.createGain(); this.twG.gain.value = 0;
    this.tw.connect(this.twG); this.twG.connect(this.out);
    // Crissement de pneus
    this.sqSrc = this._loop(); this.sqBp = ctx.createBiquadFilter(); this.sqBp.type = 'bandpass'; this.sqBp.Q.value = 9; this.sqBp.frequency.value = 1150;
    this.sqG = ctx.createGain(); this.sqG.gain.value = 0; this.sqSrc.connect(this.sqBp); this.sqBp.connect(this.sqG); this.sqG.connect(this.out);
    // Vent
    this.wSrc = this._loop(); this.wLp = ctx.createBiquadFilter(); this.wLp.type = 'lowpass'; this.wLp.frequency.value = 700;
    this.wG = ctx.createGain(); this.wG.gain.value = 0; this.wSrc.connect(this.wLp); this.wLp.connect(this.wG); this.wG.connect(this.out);
    for (const o of [this.o1, this.o2, this.sub, this.tw]) o.start();
    this.rpm = 900; this.gear = 0; this.load = 0; this.loadHist = 0; this.boostP = 0;
    this.crackT = 0; this.nextPop = 0; this.shiftT = 0; this.prevThr = 0; this.rev = null;
    this.setProfile(profile);
  }

  _loop() { const s = this.ctx.createBufferSource(); s.buffer = this.noise; s.loop = true; s.loopStart = Math.random(); s.start(0, Math.random() * 1.5); return s; }

  setProfile(name) {
    const P = this.P = PROFILES[name] || PROFILES.v8;
    this.profile = name;
    const wave = cycleWave(this.ctx, P);
    this.o1.setPeriodicWave(wave); this.o2.setPeriodicWave(wave);
    this.shaper.curve = shaperCurve(P.drive);
    this.ex.frequency.value = P.exhaustHz; this.ex.gain.value = P.exhaustGain;
    this.rpm = P.idle; this.gear = 0;
  }

  /** Coup d'accélérateur de démonstration (sélection du véhicule) : montée en régime, retombée, pétarades. */
  blip() { this.rev = { t: 0 }; }

  /**
   * s : { speed (m/s, signe = sens), throttle (-1..1), grounded, boosting, slip, dist (m), pan (-1..1), active }
   */
  update(dt, s) {
    const ctx = this.ctx, P = this.P, now = ctx.currentTime;
    let thr = Math.max(0, Math.abs(s.throttle));
    let target;
    const sp = Math.abs(s.speed);
    if (this.rev) {
      // profil scripté : deux montées franches puis lever de pied
      const t = this.rev.t += dt;
      thr = t < 0.45 ? 1 : t < 0.6 ? 0 : t < 1.05 ? 1 : 0;
      target = P.idle + (thr ? (P.redline * 0.88 - P.idle) : 0);
      if (t > 2.4) this.rev = null;
    } else if (s.grounded && sp > 0.5) {
      // Boîte : rapport selon la vitesse, passage montant/descendant avec hystérésis
      const G = P.gears;
      let g = this.gear;
      const rpmAt = gi => P.idle * 0.85 + (P.redline - P.idle * 0.85) * Math.min(1.08, sp / G[gi]);
      if (rpmAt(g) > P.redline * P.shiftUp && g < G.length - 1) { g++; this._shift(true, thr); }
      else if (g > 0 && rpmAt(g) < P.redline * P.shiftDown) { g--; this._shift(false, thr); }
      this.gear = g;
      target = rpmAt(g);
      if (thr > 0.1 && sp < 3) target = Math.max(target, P.idle + thr * P.redline * 0.35);   // patinage au départ
    } else {
      // En l'air ou à l'arrêt : le moteur monte librement avec l'accélérateur
      target = P.idle + thr * (P.redline * (s.grounded ? 0.55 : 0.82) - P.idle);
      if (sp < 0.5) this.gear = 0;
    }
    if (s.boosting) target = Math.min(P.redline * 1.02, target + P.redline * 0.06);
    const up = target > this.rpm;
    this.rpm += (target - this.rpm) * Math.min(1, dt * (up ? 9 : 5));
    if (this.shiftT > 0) { this.shiftT -= dt; }
    const rn = Math.min(1, Math.max(0, (this.rpm - P.idle) / (P.redline - P.idle)));
    // Charge moteur : accélérateur filtré ; historique pour les pétarades
    this.load += (thr - this.load) * Math.min(1, dt * 10);
    this.loadHist = Math.max(this.loadHist - dt * 0.6, this.load * rn);
    // Oscillateurs
    const cyc = this.rpm / 120;
    this.o1.frequency.setTargetAtTime(cyc, now, 0.015);
    this.o2.frequency.setTargetAtTime(cyc * 1.004, now, 0.015);
    this.sub.frequency.setTargetAtTime(this.rpm / 60 * 0.5, now, 0.02);
    const cut = P.lpBase + P.lpSpan * rn * (0.35 + 0.65 * this.load);
    this.lp.frequency.setTargetAtTime(cut, now, 0.03);
    this.mix.gain.setTargetAtTime(0.4 + 0.55 * this.load, now, 0.03);
    const shiftDip = this.shiftT > 0 ? 0.35 : 1;
    const base = P.gain * (0.42 + 0.38 * this.load + 0.25 * rn) * shiftDip;
    this.eng.gain.setTargetAtTime(base, now, 0.025);
    this.subg.gain.setTargetAtTime(P.sub * (0.3 + 0.7 * this.load) * (1 - rn * 0.6) * P.gain, now, 0.05);
    this.inBp.frequency.setTargetAtTime(cyc * P.cyl * 2.2 + 300, now, 0.05);
    this.inG.gain.setTargetAtTime(P.intake * this.load * (0.3 + rn) * P.gain, now, 0.05);
    // Turbos
    if (P.turbo) {
      this.boostP += ((this.load > 0.4 ? rn : 0) - this.boostP) * Math.min(1, dt * (this.load > 0.4 ? 2.2 : 6));
      this.tw.frequency.setTargetAtTime(2400 + this.boostP * 3800, now, 0.05);
      this.twG.gain.setTargetAtTime(0.018 * this.boostP * P.gain, now, 0.05);
      if (this.prevThr > 0.6 && thr < 0.15 && this.boostP > 0.35) this._blowOff(this.boostP);
    }
    // Pétarades au lever de pied
    if (this.prevThr > 0.5 && thr < 0.12 && rn > 0.35 && this.loadHist > 0.3) { this.crackT = 0.6 + rn * 0.9; this.nextPop = 0.02; }
    if (this.crackT > 0) {
      this.crackT -= dt; this.nextPop -= dt;
      if (thr > 0.3) this.crackT = 0;
      else if (this.nextPop <= 0) { this._pop(Math.min(1, this.crackT) * P.crackle * (0.6 + Math.random() * 0.6)); this.nextPop = 0.035 + Math.random() * 0.13; }
    }
    this.prevThr = thr;
    // Pneus, vent
    const sq = s.grounded && s.slip > 3.5 ? Math.min(1, (s.slip - 3.5) / 6) : 0;
    this.sqG.gain.setTargetAtTime(sq * 0.05, now, 0.06); this.sqBp.frequency.setTargetAtTime(950 + sq * 500, now, 0.1);
    this.wG.gain.setTargetAtTime(Math.min(1, sp * sp / 1800) * 0.06, now, 0.1); this.wLp.frequency.setTargetAtTime(300 + sp * 30, now, 0.1);
    // Mixage global : distance et position stéréo
    const vol = (s.active ? 1 : 0.55) * (this.isPlayer ? 1 : 0.55 * Math.max(0.0, 1 - s.dist / 80));
    this.out.gain.setTargetAtTime(vol, now, 0.08);
    this.distLp.frequency.setTargetAtTime(this.isPlayer ? 16000 : 500 + 7000 * Math.exp(-s.dist / 18), now, 0.1);
    if (this.pan) this.pan.pan.setTargetAtTime(this.isPlayer ? 0 : Math.max(-0.8, Math.min(0.8, s.pan || 0)), now, 0.1);
  }

  _shift(up, thr) {
    this.shiftT = up ? 0.07 : 0.05;
    if (up && thr > 0.6) this._pop(this.P.crackle * 0.8, true);      // « brap » de passage de rapport
  }

  /** Claquement à l'échappement : souffle filtré + coup sourd, saturés. */
  _pop(k, big = false) {
    if (k <= 0.02) return;
    const ctx = this.ctx, t = ctx.currentTime + Math.random() * 0.01;
    const src = ctx.createBufferSource(); src.buffer = this.noise;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 500 + Math.random() * 1300; bp.Q.value = 0.9;
    const g = ctx.createGain(), dur = big ? 0.09 : 0.03 + Math.random() * 0.035;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.5 * k * (big ? 1.3 : 1), t + 0.003); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(bp); bp.connect(g); g.connect(this.out);
    src.start(t, Math.random() * 1.5); src.stop(t + dur + 0.05);
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(big ? 95 : 70 + Math.random() * 50, t); o.frequency.exponentialRampToValueAtTime(35, t + dur + 0.04);
    const og = ctx.createGain(); og.gain.setValueAtTime(0.0001, t); og.gain.exponentialRampToValueAtTime(0.55 * k, t + 0.004); og.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.05);
    o.connect(og); og.connect(this.out); o.start(t); o.stop(t + dur + 0.1);
  }

  _blowOff(k) {
    const ctx = this.ctx, t = ctx.currentTime;
    const src = ctx.createBufferSource(); src.buffer = this.noise;
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.setValueAtTime(2600, t); hp.frequency.exponentialRampToValueAtTime(900, t + 0.35);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.09 * k, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
    src.connect(hp); hp.connect(g); g.connect(this.out); src.start(t, Math.random()); src.stop(t + 0.5);
  }
}

export const ENGINE_PROFILES = PROFILES;
