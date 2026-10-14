import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { Simulation } from './Simulation.js';
import { FixedStepLoop } from './GameLoop.js';
import { STATE } from '../match/MatchManager.js';
import { VehicleController } from '../vehicles/VehicleController.js';
import { BotBrain } from '../ai/BotController.js';
import { InputManager } from '../input/InputManager.js';
import { GameView } from '../render/GameView.js';
import { CameraRig } from '../camera/CameraRig.js';
import { HUD } from '../ui/HUD.js';
import { AudioManager } from '../audio/AudioManager.js';
import { DevOverlay } from '../dev/DevOverlay.js';

const MODEL_ENGINE = { vortex: 'v12', typhon: 'v8' };

/**
 * Même qualité visuelle sur téléphone et bureau. On ne descend en « low » que pour les
 * backends logiciels (pas d'écran) : le flou venait d'un pixel ratio trop bas, pas du GPU.
 */
function initialQuality() {
  try { const q = new URLSearchParams(location.search).get('q'); if (q === 'high' || q === 'medium' || q === 'low') return q; } catch (e) { /* ignore */ }
  let name = '';
  try {
    const c = document.createElement('canvas'), gl = c.getContext('webgl2') || c.getContext('webgl');
    const ext = gl && gl.getExtension('WEBGL_debug_renderer_info');
    name = gl ? String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)) : '';
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
  } catch (e) { /* ignore */ }
  if (/SwiftShader|llvmpipe/i.test(name)) return 'low';
  return 'medium';
}
const otherModel = m => (m === 'vortex' ? 'typhon' : 'vortex');

/**
 * Chef d'orchestre : relie entrées → simulation (pas fixes) → rendu interpolé → caméra → interface → audio.
 * Chaque module garde sa responsabilité ; la communication passe par le bus d'événements de la simulation.
 */
export class Game {
  constructor(RAPIER, { canvas, uiRoot }) {
    const C = this.C = CONFIG;
    this.small = Math.min(screen.width, screen.height) < 700 || Math.min(innerWidth, innerHeight) < 820;
    this.coarse = matchMedia('(pointer: coarse)').matches;
    this.reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
    let saved = 'typhon'; try { saved = localStorage.getItem('ja-car') || 'typhon'; } catch (e) { /* stockage indisponible */ }
    this.playerModel = MODEL_ENGINE[saved] ? saved : 'typhon';
    const models = [this.playerModel, otherModel(this.playerModel)];
    this.sim = new Simulation(RAPIER, C, { seed: (Math.random() * 1e9) | 0, models });
    this.player = this.sim.cars[0]; this.playerTeam = this.player.team;
    this.input = new InputManager(C.INPUT_MAPPING);
    this.sim.setController(0, new VehicleController(this.input));
    this.brain = new BotBrain(C, { skill: 0.72 });
    this.sim.setController(1, new VehicleController(this.brain));
    this.hud = new HUD(uiRoot, { models: C.CAR_MODELS, model: this.playerModel });
    this.quality = initialQuality();
    this.view = new GameView(canvas, this.sim, { small: this.small, models, quality: this.quality });
    this.view.setQuality(this.quality);
    this.rig = new CameraRig(this.view.camera, C, this.sim.layout);
    this.rig.baseFov = window.innerWidth < window.innerHeight ? 88 : this.small ? 76 : 70;
    this.audio = new AudioManager(); this.audio.addEngine(true, MODEL_ENGINE[models[0]]); this.audio.addEngine(false, MODEL_ENGINE[models[1]]);
    this.flashK = 0; this._camR = new THREE.Vector3();
    this.dev = new DevOverlay(uiRoot);
    this.loop = new FixedStepLoop(C.PHYSICS_DT, C.MAX_STEPS_PER_FRAME);
    this.clock = 0; this.cheer = 0.15; this.lastCount = -1; this.steps = 0;
    this.focus = new THREE.Vector3();
    if (this.coarse) this.input.mountTouch(uiRoot);
    this._wire();
    addEventListener('resize', () => {
      this.small = Math.min(screen.width, screen.height) < 700 || Math.min(innerWidth, innerHeight) < 820;
      this.view.setViewport(this.small);
      this.view.resize();
      this.rig.baseFov = innerWidth < innerHeight ? 88 : this.small ? 76 : 70;
    });
  }

  _wire() {
    const bus = this.sim.bus, hud = this.hud, view = this.view;
    hud.on('play', skill => this.startMatch(skill));
    hud.on('resume', () => this.togglePause(false));
    hud.on('restart', () => this.startMatch(this.brain.skill));
    hud.on('menu', () => this.toMenu());
    hud.on('model', m => this.setPlayerModel(m));

    bus.on('kickoff', () => { view.snap(); view.ball.clearDebris(); view.fx.clearMoney(); });
    bus.on('state', e => {
      const S = STATE;
      if (e.state === S.PAUSED) { hud.showPause(true); return; }
      if (e.prev === S.PAUSED) hud.showPause(false);
      if (e.resumed) return;
      if (e.state === S.KICKOFF) { hud.go(); this.audio.beep(true); }
      if (e.state === S.COUNTDOWN) this.lastCount = -1;
      if (e.state === S.MATCH_FINISHED) { this.audio.whistle(); setTimeout(() => hud.showEnd(true, { winner: e.match.winner, playerTeam: this.playerTeam, score: e.match.score, overtime: e.match.overtime }), 900); }
      if (e.state === S.MENU) { hud.showMenu(true); hud.showEnd(false); hud.showPause(false); }
    });
    bus.on('overtime', () => { hud.overtime(); this.audio.whistle(); });
    bus.on('goal', e => { hud.goal(e.team, e.score, this.playerTeam); this.audio.goal(e.team === this.playerTeam); this.cheer = 1.2; this.flashK = 1; });
    bus.on('goalExplosion', e => {
      const p = new THREE.Vector3(e.position.x, e.position.y, e.position.z);
      const bp = view.ballPose();
      view.ball.explode(p, bp.q1, new THREE.Vector3(e.velocity.x, e.velocity.y, e.velocity.z));
      view.fx.goalExplosion(p, view.teamRGB(e.scorer));
      view.arena.flashGoal(e.defending);
      if (!this.reduceMotion) view.fx.pyro(Math.sign(p.z) * this.sim.layout.hz, this.C.GOAL_WIDTH / 2, view.teamRGB(e.scorer));
      this.rig.setGoalFocus(p); this.rig.shake(this.reduceMotion ? 0 : 1.1); this.rig.kick(this.reduceMotion ? 0 : 7);
    });
    bus.on('ballHit', e => {
      const k = Math.min(1, e.strength / 25);
      view.ball.setTouchTeam(e.car.team);
      view.fx.sparks(e.position, 6 + Math.round(k * 24), 6 + k * 10);
      this.audio.hit(e.strength);
      if (e.car === this.player && !this.reduceMotion) { this.rig.shake(0.08 + k * 0.35); this.rig.kick(k * 3); }
    });
    bus.on('ballBounce', e => { if (e.strength > 6) this.audio.bounce(e.strength * 0.6); });
    bus.on('carCrash', e => { this.audio.thud(e.strength); if ((e.a === this.player || e.b === this.player) && e.strength > 8 && !this.reduceMotion) this.rig.shake(Math.min(0.6, e.strength * 0.02)); });
    bus.on('carWall', e => { if (e.car === this.player) this.audio.thud(e.strength * 0.7); });
    bus.on('boostPickup', e => { if (e.car === this.player) this.audio.pickup(e.pad.big); });
    bus.on('car', e => {
      const p = e.car.body.translation();
      if (e.type === 'land') { view.fx.dust(p.x, p.z, 6, 1.2); if (e.car === this.player && !this.reduceMotion) this.rig.shake(0.12); }
      if (e.car === this.player && (e.type === 'jump' || e.type === 'dodge')) this.audio.jump();
      if (e.type === 'jump' && e.car.grounded) view.fx.dust(p.x, p.z, 5, 0.9);
    });
  }

  start() {
    this.toMenu();
    this.view.snap();
    // Pré-compilation des shaders : pas d'à-coup au premier but
    const fx = this.view.fx, hidden = [fx.fireball, fx.starburst, fx.ring1, fx.ring2, fx.groundRing];
    for (const m of hidden) m.visible = true;
    this.view.renderer.compile(this.view.scene, this.view.camera);
    for (const m of hidden) m.visible = false;
    this.hud.setLoading(null);
    this.last = performance.now();
    this.ft = 0; this.fn = 0; this.upT = 0;
    document.addEventListener('visibilitychange', () => { this.last = performance.now(); if (document.hidden && this.sim.match.state !== STATE.MENU) this.togglePause(true); });
    const frame = now => { requestAnimationFrame(frame); if (!this.halted) this.frame(now); };
    requestAnimationFrame(frame);
  }

  startMatch(skill) {
    this.audio.unlock();
    this.brain.skill = skill;
    this.hud.showMenu(false); this.hud.showEnd(false); this.hud.showPause(false);
    this.view.ball.clearDebris(); this.view.fx.clearMoney();
    this.sim.pads.reset();
    for (const c of this.sim.cars) c.boost = this.C.BOOST_START;
    this.rig.startIntro();
    this.sim.match.startMatch();
    this.loop.reset(); this.input.reset();
  }

  toMenu() { this.sim.match.toMenu(); this.sim.resetKickoff(0); this.view.snap(); }

  /** Choix du véhicule (menu) : performances, carrosserie et moteur ; l'IA prend l'autre modèle. */
  setPlayerModel(m) {
    if (!MODEL_ENGINE[m] || this.sim.match.state !== STATE.MENU) return;
    this.playerModel = m; const ai = otherModel(m);
    try { localStorage.setItem('ja-car', m); } catch (e) { /* ignore */ }
    this.sim.setCarModel(0, m); this.sim.setCarModel(1, ai);
    this.view.setCarModel(0, m); this.view.setCarModel(1, ai);
    this.audio.setEngineProfile(0, MODEL_ENGINE[m]); this.audio.setEngineProfile(1, MODEL_ENGINE[ai]);
    this.audio.blip(0);
    this.rig.showcaseKick();
  }

  togglePause(force) {
    const m = this.sim.match;
    const want = force ?? m.state !== STATE.PAUSED;
    if (want) m.pause(); else { m.resume(); this.loop.reset(); this.input.reset(); }
  }

  frame(now, doRender = true) {
    const raw = Math.min(0.1, (now - this.last) / 1000); this.last = now;
    const sim = this.sim, M = sim.match, view = this.view, input = this.input;
    input.pollGamepad();
    if (input.consume('pause')) { if (M.state === STATE.PAUSED) this.togglePause(false); else if (M.state !== STATE.MENU && M.state !== STATE.MATCH_FINISHED) this.togglePause(true); }
    if (input.consume('camera')) this.hud.toast(this.rig.toggle() === 'ball' ? 'Caméra ballon' : 'Caméra voiture');
    if (input.consume('dev')) this.dev.toggle();
    if (input.consume('mute')) { this.audio.setMuted(!this.audio.muted); this.hud.toast(this.audio.muted ? 'Son coupé' : 'Son activé'); }
    input.pressed.clear();                  // les autres appuis ponctuels ne servent pas ici

    const paused = M.state === STATE.PAUSED;
    let steps = 0, alpha = 1;
    if (!paused) {
      const r = this.loop.advance(raw, () => { view.capturePrev(); sim.step(); });
      steps = r.steps; alpha = r.alpha;
      if (steps > 0) view.capture();
    }
    this.steps = steps;
    view.interpolate(alpha);
    const dt = paused ? 0 : raw;
    this.clock += dt;

    // Compte à rebours
    if (M.state === STATE.COUNTDOWN) {
      const n = Math.max(1, 3 - Math.floor(M.stateTime / (this.C.KICKOFF_COUNTDOWN / 3)));
      if (n !== this.lastCount) { this.lastCount = n; this.hud.countdown(n); this.audio.beep(false); }
    }
    // Ambiance : la foule s'emballe près des cages
    const bp = view.ballPose().p;
    const nearGoal = sim.ball.active && Math.abs(bp.z) > sim.layout.hz - 22 ? 0.5 : 0.18;
    this.cheer += (Math.max(nearGoal, M.state === STATE.MATCH_FINISHED ? 0.7 : 0) - this.cheer) * Math.min(1, dt * 0.6);

    const pPose = view.carPose(0);
    this.focus.copy(pPose.p).lerp(bp, sim.ball.active ? 0.35 : 0); this.focus.y = 0;
    this.flashK = Math.max(0, this.flashK - dt * 2);
    view.update(dt, this.clock, { padState: sim.pads.pads.map(p => p.active), cheer: this.cheer, focus: this.focus, cinematic: this.rig.cineW > 0.5, flash: this.flashK });
    const lv = this.player.body.linvel(), lq = pPose.q, lx = 1 - 2 * (lq.y * lq.y + lq.z * lq.z), lz = 2 * (lq.x * lq.z - lq.w * lq.y);
    const carLat = this.player.grounded >= 3 ? lv.x * lx + lv.z * lz : 0;
    this.rig.update(dt, { state: M.state, stateTime: M.stateTime, carPos: pPose.p, carQuat: pPose.q, carSpeed: this.player.speed, carGrounded: this.player.grounded >= 3, ballPos: bp, ballActive: sim.ball.active, carLat });
    this._screen();
    this.hud.update(M, this.player);
    const camPos = view.camera.position, camR = this._camR.set(1, 0, 0).applyQuaternion(view.camera.quaternion);
    const live = M.state === STATE.PLAYING || M.state === STATE.KICKOFF;
    this.audio.update(sim.cars.map((c, i) => {
      const t = c.body.translation(), dx = t.x - camPos.x, dz = t.z - camPos.z, dist = Math.hypot(dx, dz);
      const ctl = sim.controllers[i] && sim.controllers[i].controls;
      return { speed: c.fwdSpeed, throttle: live ? (ctl ? ctl.throttle : 0) : 0, boosting: c.boosting, grounded: c.grounded >= 2, slip: c.slip || 0, dist, pan: (dx * camR.x + dz * camR.z) / Math.max(dist, 4) };
    }), this.cheer, live, dt);
    this.dev.update(raw, { dpr: view.dpr, steps, simTime: sim.time, bodies: sim.phys.bodyCount, collisions: sim.phys.collisionCount, ballSpeed: sim.ball.speed, touches: sim.ballTouches, carSpeed: this.player.speed, grounded: this.player.grounded, state: M.state, ai: this.brain.state, dropped: this.loop.dropped });
    if (!doRender) return;
    view.render();
    this._adaptQuality(raw);
  }

  /** Outils de test : avance le jeu de `seconds` (images à 60 i/s, rendu final uniquement). */
  debugRun(seconds, fps = 60) {
    this.halted = true;
    const n = Math.round(seconds * fps);
    for (let i = 0; i < n; i++) this.frame(this.last + 1000 / fps, false);
    this.frame(this.last + 1000 / fps, true);
  }
  /** Outils de test : la voiture du joueur est pilotée par une IA (démonstration, captures). */
  debugAutopilot(on) { this.sim.setController(0, new VehicleController(on ? new BotBrain(this.C, { skill: 0.8 }) : this.input)); }

  _screen() {
    const M = this.sim.match, S = STATE;
    const clock = M.overtime ? `+${Math.floor(M.clock / 60)}:${String(Math.floor(M.clock % 60)).padStart(2, '0')}` : `${Math.floor(Math.ceil(M.clock) / 60)}:${String(Math.ceil(M.clock) % 60).padStart(2, '0')}`;
    let msg = '', team = '';
    if (M.state === S.GOAL_SCORED && M.lastGoal) { msg = 'BUT !'; team = M.lastGoal.team; }
    else if (M.state === S.OVERTIME) msg = 'PROLONGATION';
    else if (M.state === S.MATCH_FINISHED) { msg = M.winner === 'blue' ? 'BLEU GAGNE' : 'ORANGE GAGNE'; team = M.winner; }
    else if (M.state === S.COUNTDOWN) msg = String(Math.max(1, 3 - Math.floor(M.stateTime)));
    this.view.arena.drawScreen(M.score, clock, msg, team);
  }

  /** Qualité adaptative : on descend vite (dès qu'une seconde est trop lente), on remonte prudemment. */
  _adaptQuality(raw) {
    this.ft += raw; this.fn++;
    if (this.ft < 0.8) return;
    const avg = this.ft / this.fn;
    this.ft = 0; this.fn = 0;
    if (this.sim.match.state === STATE.MENU && this.clock < 2.5) return;      // démarrage : compilations en cours
    const order = ['low', 'medium'], i = Math.max(0, order.indexOf(this.quality === 'high' ? 'medium' : this.quality));
    const floor = this.small ? 1.5 : 1;
    if (avg > 0.032) {
      this.upT = 0;
      if (i > 0) this.setQuality(order[i - 1]);
      else if (this.view.dpr > floor + 0.05) this.view.setDpr(Math.max(floor, this.view.dpr - 0.15));
    } else if (avg < 0.014) {
      if (++this.upT < 8) return;
      this.upT = 0;
      if (this.view.dpr < this.view.dprMax - 0.05) this.view.setDpr(Math.min(this.view.dprMax, this.view.dpr + 0.15));
      else if (i < order.length - 1) this.setQuality(order[i + 1]);
    } else this.upT = 0;
  }

  setQuality(q) { this.quality = q; this.view.setQuality(q); }
}
