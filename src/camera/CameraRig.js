import * as THREE from 'three';
import { arenaSDF } from '../arena/ArenaLayout.js';

/**
 * Caméras. Elles lisent l'état (interpolé) et ne modifient jamais la physique.
 *  - « voiture » : troisième personne derrière et au-dessus du véhicule, interpolation douce ;
 *  - « ballon » : reste attachée à la voiture mais oriente le regard vers le ballon ;
 *  - plans cinématiques : orbite du menu, travelling d'entrée, plan de but, plan de fin.
 * La caméra reste toujours dans l'enceinte et au-dessus du sol.
 */
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const wrap = a => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };
const ease = u => { u = clamp(u, 0, 1); return u < .5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2; };

export class CameraRig {
  constructor(camera, C, layout) {
    this.cam = camera; this.C = C; this.L = layout;
    this.mode = 'car'; this.ballBlend = 0;
    this.yaw = 0; this.pos = new THREE.Vector3(0, 30, -80); this.look = new THREE.Vector3();
    this.cinePos = new THREE.Vector3(); this.cineLook = new THREE.Vector3(); this.cineW = 1;
    this.shakeAmp = 0; this.fovKick = 0; this.t = 0;
    this._fwd = new THREE.Vector3(); this._d = new THREE.Vector3(); this._a = new THREE.Vector3(); this._b = new THREE.Vector3();
    this.goalFocus = new THREE.Vector3(); this.introT = 1; this.baseFov = 70; this._pB = new THREE.Vector3(); this._lB = new THREE.Vector3();
    this.showA = 0.6; this.showKick = 0; this.roll = 0;
    this.introFrom = new THREE.Vector3(); this.introLookFrom = new THREE.Vector3(); this.lastLook = new THREE.Vector3();
  }

  toggle() { this.mode = this.mode === 'car' ? 'ball' : 'car'; return this.mode; }
  shake(a) { this.shakeAmp = Math.min(1.4, this.shakeAmp + a); }
  kick(f) { this.fovKick = Math.max(this.fovKick, f); }
  setGoalFocus(p) { this.goalFocus.copy(p); }
  /** Travelling d'entrée : part de la position actuelle (vitrine du menu) et rejoint la caméra de jeu. */
  startIntro() { this.introT = 0; this.cineW = 1; this.introFrom.copy(this.cam.position); this.introLookFrom.copy(this.lastLook); }
  /** Changement de véhicule dans le menu : la caméra se rapproche brièvement. */
  showcaseKick() { this.showKick = 1; }

  /** Garde un point dans l'enceinte (coins arrondis compris) et au-dessus du sol. */
  confine(p, allowGoal = false) {
    const L = this.L, C = this.C, gw = C.GOAL_WIDTH / 2;
    const inGoal = allowGoal && Math.abs(p.x) < gw - 0.6 && Math.abs(p.z) > L.hz - 0.5;
    if (inGoal) { p.z = clamp(p.z, -(L.hz + C.GOAL_DEPTH - 0.7), L.hz + C.GOAL_DEPTH - 0.7); p.y = clamp(p.y, 0.8, C.GOAL_HEIGHT - 0.6); return p; }
    const margin = 1.0, d = arenaSDF(L, p.x, p.z);
    if (d > -margin) {
      const e = 0.05, gx = (arenaSDF(L, p.x + e, p.z) - arenaSDF(L, p.x - e, p.z)) / (2 * e), gz = (arenaSDF(L, p.x, p.z + e) - arenaSDF(L, p.x, p.z - e)) / (2 * e);
      const k = d + margin; p.x -= gx * k; p.z -= gz * k;
    }
    p.y = clamp(p.y, 0.8, C.ARENA_CEILING - 1);
    return p;
  }

  update(dt, s) {
    this.t += dt;
    const cam = this.cam, C = this.C;
    // ---------- Caméra de jeu ----------
    const car = s.carPos, q = s.carQuat;
    const fwd = this._fwd.set(0, 0, 1).applyQuaternion(q);
    const upY = 1 - 2 * (q.x * q.x + q.z * q.z);
    const hl = Math.hypot(fwd.x, fwd.z);
    if (hl > 0.25 && upY > 0.2) {
      const target = Math.atan2(fwd.x, fwd.z), rate = s.carGrounded ? 5.5 : 2.2;
      this.yaw += wrap(target - this.yaw) * Math.min(1, dt * rate);
    }
    this.ballBlend += ((this.mode === 'ball' && s.ballActive ? 1 : 0) - this.ballBlend) * Math.min(1, dt * 4);
    const portrait = cam.aspect < 0.9;
    const speed = s.carSpeed, dist = (portrait ? 11.5 : 8.8) + Math.min(speed, 42) * 0.05, height = portrait ? 5.2 : 2.85;
    const carInGoal = Math.abs(car.z) > this.L.hz - 0.2 && Math.abs(car.x) < C.GOAL_WIDTH / 2;
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    // Mode voiture
    const pA = this._a.set(car.x - fx * dist, car.y + height, car.z - fz * dist);
    const lA = this._b.set(car.x + fx * (portrait ? 7 : 4), car.y + (portrait ? 0.2 : 1.1), car.z + fz * (portrait ? 7 : 4));
    // Mode ballon : la voiture reste au premier plan, le regard suit le ballon
    if (this.ballBlend > 0.001) {
      let dx = s.ballPos.x - car.x, dz = s.ballPos.z - car.z; const dl = Math.hypot(dx, dz);
      if (dl > 0.5) { dx /= dl; dz /= dl; } else { dx = fx; dz = fz; }
      const pB = this._pB.set(car.x - dx * (dist + 0.6), car.y + height + 0.9 + Math.min(s.ballPos.y * 0.1, 2), car.z - dz * (dist + 0.6));
      const lB = this._lB.copy(car).lerp(s.ballPos, 0.72); lB.y = Math.min(lB.y, car.y + 7);
      pA.lerp(pB, this.ballBlend); lA.lerp(lB, this.ballBlend);
    }
    this.confine(pA, carInGoal);
    const k = 1 - Math.exp(-dt * 9);
    this.pos.lerp(pA, k); this.look.lerp(lA, 1 - Math.exp(-dt * 12));

    // ---------- Plans cinématiques ----------
    let cineTarget = 0;
    const st = s.state;
    if (st === 'MENU') {
      // Vitrine : orbite lente autour de la voiture du joueur, voiture à droite de l'écran (menu à gauche)
      cineTarget = 1;
      this.showA += dt * 0.16; this.showKick *= Math.exp(-dt * 1.6);
      const portrait = cam.aspect < 0.9, R = (portrait ? 9.5 : 7.4) - this.showKick * 1.4;
      this.cinePos.set(car.x + Math.sin(this.showA) * R, car.y + 0.7 + Math.sin(this.t * 0.35) * 0.25 + this.showKick * 0.3, car.z + Math.cos(this.showA) * R);
      this.confine(this.cinePos);
      const dx = car.x - this.cinePos.x, dz = car.z - this.cinePos.z, dl = Math.hypot(dx, dz) || 1, off = portrait ? 0 : 2.9;
      this.cineLook.set(car.x + dz / dl * off, car.y + (portrait ? 0.9 : 0.3), car.z - dx / dl * off);
    } else if (st === 'MATCH_FINISHED') {
      cineTarget = 1;
      const a = this.t * 0.08, R = 22;
      this.cinePos.set(car.x + Math.sin(a) * R, 9, car.z + Math.cos(a) * R); this.confine(this.cinePos);
      this.cineLook.copy(car).add(this._d.set(0, 1.5, 0));
    } else if (st === 'GOAL_SCORED') {
      // Plan de but : on recule et on cadre l'explosion
      cineTarget = Math.min(1, s.stateTime * 1.6) * 0.85;
      const g = this.goalFocus, side = Math.sign(g.z) || 1;
      this.cinePos.set(g.x * 0.5 + Math.sin(this.t * 0.3) * 6, 9 + s.stateTime * 1.2, g.z - side * (24 + s.stateTime * 2)); this.confine(this.cinePos);
      this.cineLook.set(g.x, 4 + s.stateTime * 1.5, g.z);
    } else if (st === 'COUNTDOWN' || st === 'RESETTING') {
      // Travelling d'entrée au premier coup d'envoi, sinon caméra de jeu directe
      if (this.introT < 1) {
        this.introT += dt / (C.KICKOFF_COUNTDOWN + C.RESET_DURATION);
        const u = ease(this.introT);
        this.cinePos.copy(this.introFrom).lerp(this.pos, u); this.cinePos.y += Math.sin(u * Math.PI) * 5;
        this.confine(this.cinePos);
        this.cineLook.copy(this.introLookFrom).lerp(lA, u);
        if (this.introT >= 1) { cineTarget = 0; this.cineW = 0; } else { cineTarget = 1; this.cineW = 1; }
      }
    }
    this.cineW += (cineTarget - this.cineW) * Math.min(1, dt * (cineTarget > this.cineW ? 2.5 : 3.5));
    const w = this.cineW;
    cam.position.copy(this.pos).lerp(this.cinePos, w);
    const look = this._d.copy(this.look).lerp(this.cineLook, w);

    // ---------- Tremblement et champ de vision ----------
    this.shakeAmp *= Math.exp(-dt * 5);
    const a = this.shakeAmp, t = this.t;
    if (a > 0.002) {
      cam.position.x += (Math.sin(t * 37.1) * .5 + Math.sin(t * 61.7 + 1.3) * .3 + Math.sin(t * 97.3 + 2.1) * .2) * a;
      cam.position.y += (Math.sin(t * 41.3 + .7) * .5 + Math.sin(t * 73.9 + 2.4) * .3 + Math.sin(t * 89.1) * .2) * a;
      cam.position.z += (Math.sin(t * 33.7 + 1.9) * .5 + Math.sin(t * 67.3 + .2) * .5) * a;
    }
    cam.position.y = Math.max(cam.position.y, 0.6);
    cam.lookAt(look); this.lastLook.copy(look);
    // Légère inclinaison en glisse latérale (sensation de dérive), jamais en plan cinématique
    this.roll += ((s.carLat ? THREE.MathUtils.clamp(-s.carLat * 0.0045, -0.05, 0.05) : 0) * (1 - w) - this.roll) * Math.min(1, dt * 4);
    if (Math.abs(this.roll) > 1e-4) cam.rotateZ(this.roll);
    this.fovKick *= Math.exp(-dt * 4);
    const boostFov = (1 - w) * clamp((speed - 26) / 14, 0, 1) * 9;
    const fov = this.baseFov + boostFov + this.fovKick;
    if (Math.abs(cam.fov - fov) > 0.01) { cam.fov = fov; cam.updateProjectionMatrix(); }
  }
}
