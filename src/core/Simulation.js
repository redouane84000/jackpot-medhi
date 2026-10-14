import { CONFIG } from '../config.js';
import { EventBus } from './EventBus.js';
import { PhysicsWorld } from '../physics/PhysicsWorld.js';
import { buildArenaLayout } from '../arena/ArenaLayout.js';
import { buildArenaColliders } from '../arena/ArenaColliders.js';
import { Vehicle, neutralControls } from '../vehicles/VehiclePhysics.js';
import { Ball } from '../ball/BallPhysics.js';
import { MatchManager, STATE } from '../match/MatchManager.js';
import { GoalDetector } from '../match/GoalDetector.js';
import { BoostPads } from '../match/BoostPads.js';

/** Générateur pseudo-aléatoire déterministe (engagements reproductibles dans les tests). */
function mulberry32(seed) {
  return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}

/**
 * Simulation de jeu complète, sans rendu : physique, véhicules, ballon, règles du match, pastilles de boost.
 * Elle avance uniquement par pas fixes (step). Le rendu, l'audio et l'interface l'observent via le bus d'événements.
 */
export class Simulation {
  constructor(RAPIER, C = CONFIG, { seed = 7, teams = ['blue', 'orange'], models = [] } = {}) {
    this.C = C;
    this.bus = new EventBus();
    this.rng = mulberry32(seed);
    this.layout = buildArenaLayout(C);
    this.phys = new PhysicsWorld(RAPIER, C);
    buildArenaColliders(this.phys, this.layout);
    this.ball = new Ball(this.phys, C);
    this.cars = teams.map((team, id) => new Vehicle(this.phys, C, { id, team, model: models[id] || null }));
    this.controllers = this.cars.map(() => null);
    this.match = new MatchManager(C, this.bus);
    this.goals = new GoalDetector(this.layout, C);
    this.pads = new BoostPads(this.layout, C);
    this.time = 0; this.steps = 0; this.ballTouches = 0;
    this.kickoffIndex = 0;
    this._pre = new Map();
    this.phys.onCollision((a, b) => this._onContact(a, b));
    this.bus.on('state', e => { if (e.state === STATE.RESETTING && !e.resumed) this.resetKickoff(); });
    this.resetKickoff(0);
  }

  setController(i, controller) { this.controllers[i] = controller; }

  /** Change le modèle (performances) d'une voiture ; à faire hors match (menu). */
  setCarModel(i, model) { this.cars[i].setModel(model); }

  /** Engagement : voitures sur leurs positions (miroir parfait), ballon au centre, vitesses remises à zéro. */
  resetKickoff(index) {
    const ks = this.layout.kickoffs;
    this.kickoffIndex = index ?? Math.floor(this.rng() * ks.length);
    const k = ks[this.kickoffIndex];
    const perTeam = { blue: 0, orange: 0 };
    for (const car of this.cars) {
      const s = car.team === 'orange' ? 1 : -1, slot = perTeam[car.team]++;
      const x = s * k.x + slot * s * 6, z = s * k.z + slot * s * 6;
      car.reset({ x, y: 0.78, z }, Math.atan2(-x, -z));
    }
    this.ball.reset(0, this.C.BALL_SPAWN_HEIGHT, 0);
    this.goals.reset();
    this.bus.emit('kickoff', { index: this.kickoffIndex });
  }

  /** Un pas de simulation fixe (CONFIG.PHYSICS_DT). */
  step() {
    const C = this.C, dt = C.PHYSICS_DT, M = this.match;
    if (M.state === STATE.PAUSED) return;
    const live = M.controlsEnabled;
    for (let i = 0; i < this.cars.length; i++) {
      const car = this.cars[i], ctl = this.controllers[i];
      const controls = ctl ? ctl.update(this, car, dt) : neutralControls();
      car.step(live ? controls : neutralControls(), dt);
      for (const ev of car.events) this.bus.emit('car', { type: ev, car });
    }
    // Vitesses avant le pas : servent à mesurer la violence des impacts
    for (const car of this.cars) this._pre.set(car, { ...car.body.linvel() });
    if (this.ball.active) this._pre.set(this.ball, { ...this.ball.body.linvel() });
    this.phys.step();
    if (this.ball.active) {
      this.ball.clampSpeed();
      const g = this.goals.update(this.ball.position);
      if (g) {
        const p = { ...this.ball.position }, v = { ...this.ball.velocity };
        if (M.notifyGoal(g.team)) {
          this.bus.emit('goalExplosion', { position: p, velocity: v, defending: g.team, scorer: M.lastGoal.team, lastTouch: this.ball.lastTouch });
          this.ball.deactivate();
        }
      }
    }
    for (const pick of this.pads.update(dt, this.cars)) this.bus.emit('boostPickup', pick);
    M.update(dt);
    this.time += dt; this.steps++;
  }

  _onContact(a, b) {
    const types = a.type + '|' + b.type;
    if (types === 'car|ball' || types === 'ball|car') {
      const car = a.type === 'car' ? a.ref : b.ref, ball = this.ball;
      ball.lastTouch = car; this.ballTouches++;
      const pc = car.body.translation(), pb = ball.body.translation();
      let nx = pb.x - pc.x, ny = (pb.y - pc.y) * 0.35, nz = pb.z - pc.z; // axe d'impact aplati (frappes plus lisibles)
      const nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl;
      const vc = this._pre.get(car), vb = this._pre.get(ball) || { x: 0, y: 0, z: 0 };
      const closing = vc ? (vc.x - vb.x) * nx + (vc.y - vb.y) * ny + (vc.z - vb.z) * nz : 0;
      if (closing > 0 && this.time - car.lastHitTime > 0.1) {
        const dv = Math.min(closing * this.C.BALL_HIT_ASSIST, this.C.BALL_HIT_ASSIST_MAX), v = ball.body.linvel();
        ball.body.setLinvel({ x: v.x + nx * dv, y: v.y + ny * dv, z: v.z + nz * dv }, true);
      }
      car.lastHitTime = this.time;
      this.match.notifyBallTouched();
      this.bus.emit('ballHit', { car, strength: Math.max(0, closing), position: { ...pb } });
    } else if (a.type === 'ball' || b.type === 'ball') {
      const vb = this._pre.get(this.ball), other = a.type === 'ball' ? b : a;
      this.bus.emit('ballBounce', { strength: vb ? Math.hypot(vb.x, vb.y, vb.z) : 0, surface: other.type, position: { ...this.ball.position } });
    } else if (types === 'car|car') {
      const va = this._pre.get(a.ref), vb2 = this._pre.get(b.ref);
      const rel = va && vb2 ? Math.hypot(va.x - vb2.x, va.y - vb2.y, va.z - vb2.z) : 0;
      this.bus.emit('carCrash', { a: a.ref, b: b.ref, strength: rel });
    } else if (a.type === 'car' || b.type === 'car') {
      const car = a.type === 'car' ? a.ref : b.ref, other = a.type === 'car' ? b : a;
      if (other.type !== 'floor') { const v = this._pre.get(car); this.bus.emit('carWall', { car, strength: v ? Math.hypot(v.x, v.z) : 0 }); }
    }
  }

  get stats() {
    return { bodies: this.phys.bodyCount, collisions: this.phys.collisionCount, ballSpeed: this.ball.speed, touches: this.ballTouches };
  }
}
