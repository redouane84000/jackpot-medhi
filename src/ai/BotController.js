import { Vector3, Quaternion } from 'three';

/**
 * Cerveau de l'adversaire. Il observe la simulation (lecture seule) et produit des intentions
 * de pilotage, transformées en commandes par le même VehicleController que le joueur.
 * Aucune téléportation, aucun accès direct au corps physique.
 *
 * États : SEEK_BALL, ATTACK, DEFEND, RECOVER, REPOSITION (+ KICKOFF pendant l'engagement).
 */
export const BOT_STATE = Object.freeze({ SEEK_BALL: 'SEEK_BALL', ATTACK: 'ATTACK', DEFEND: 'DEFEND', RECOVER: 'RECOVER', REPOSITION: 'REPOSITION', KICKOFF: 'KICKOFF' });

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

export class BotBrain {
  constructor(C, { skill = C.BOT_SKILL } = {}) {
    this.C = C; this.skill = skill;
    this.state = BOT_STATE.SEEK_BALL;
    this.target = new Vector3(); this.aimBall = new Vector3();
    this.decisionTimer = 0; this.stuckTime = 0; this.reverseTime = 0;
    this.jumpSeq = null; this.interceptT = 0;
    this._q = new Quaternion(); this._qi = new Quaternion(); this._v = new Vector3(); this._bp = new Vector3(); this._bv = new Vector3();
  }

  /** Position du ballon prévue dans t secondes (balistique + rebonds sur le sol, contenue dans l'arène). */
  predictBall(sim, t, out) {
    const C = this.C, L = sim.layout, p = sim.ball.position, v = sim.ball.velocity;
    out.set(p.x, p.y, p.z); const vel = this._bv.set(v.x, v.y, v.z);
    const h = 1 / 30, n = Math.ceil(t / h);
    for (let i = 0; i < n; i++) {
      vel.y -= C.GRAVITY * h; out.addScaledVector(vel, h);
      if (out.y < C.BALL_RADIUS) { out.y = C.BALL_RADIUS; vel.y = Math.abs(vel.y) * C.BALL_RESTITUTION; }
      if (Math.abs(out.x) > L.hx - C.BALL_RADIUS) { out.x = Math.sign(out.x) * (L.hx - C.BALL_RADIUS); vel.x *= -C.BALL_RESTITUTION; }
      const inGoalMouth = Math.abs(out.x) < C.GOAL_WIDTH / 2 && out.y < C.GOAL_HEIGHT;
      if (!inGoalMouth && Math.abs(out.z) > L.hz - C.BALL_RADIUS) { out.z = Math.sign(out.z) * (L.hz - C.BALL_RADIUS); vel.z *= -C.BALL_RESTITUTION; }
    }
    return out;
  }

  read(sim, car, dt) {
    const C = this.C, L = sim.layout, M = sim.match;
    const out = { throttle: 0, steer: 0, boost: false, jump: false, handbrake: false };
    if (!sim.ball.active || !M.controlsEnabled) { this.stuckTime = 0; this.reverseTime = 0; this.jumpSeq = null; this.decisionTimer = 0; return out; }
    const t = car.body.translation(), q = car.body.rotation();
    const pos = this._v.set(t.x, t.y, t.z);
    this._q.set(q.x, q.y, q.z, q.w); this._qi.copy(this._q).invert();
    const upY = 1 - 2 * (q.x * q.x + q.z * q.z);
    const own = car.team === 'orange' ? 1 : -1, attack = -own;   // signe Z du but défendu / attaqué
    const speed = car.speed, ballP = sim.ball.position, ballV = sim.ball.velocity;

    // ---- RECOVER : voiture retournée ou bloquée ----
    if (upY < 0.3) { this.state = BOT_STATE.RECOVER; out.jump = (sim.steps % 30) < 4; out.throttle = 1; return out; }
    if (this.reverseTime > 0) {
      // manœuvre de dégagement : sens opposé à celui qui bloquait, petit saut si le blocage se répète
      this.reverseTime -= dt; this.state = BOT_STATE.RECOVER;
      out.throttle = this.escapeDir || -1; out.steer = this.reverseSteer;
      out.jump = this.escapeJump && this.reverseTime > 0.7;
      return out;
    }
    this.stuckMemo = Math.max(0, (this.stuckMemo || 0) - dt * 0.25);

    // ---- Décision (avec une latence de réaction) ----
    this.decisionTimer -= dt;
    if (this.decisionTimer <= 0) {
      this.decisionTimer = C.BOT_REACTION * (1.6 - this.skill);
      // Interception : premier instant où la voiture peut atteindre le ballon prévu
      let ti = 3.5;
      for (let s = 0; s <= 3.5; s += 0.1) {
        const bp = this.predictBall(sim, s, this._bp);
        const d = Math.hypot(bp.x - pos.x, bp.z - pos.z) - C.BALL_RADIUS - 1.6;
        const reach = clamp(Math.max(speed, 10) + 7 * s, 10, 36) * s;
        if (d <= reach) { ti = s; break; }
      }
      this.interceptT = ti;
      const bp = this.predictBall(sim, ti, this._bp);
      this.aimBall.copy(bp);
      const goalZ = attack * L.hz, ownZ = own * L.hz;
      const ballAlong = bp.z * attack, carAlong = pos.z * attack;
      const goalSide = carAlong < ballAlong - 1.5;                       // voiture entre son but et le ballon
      const ballInOurHalf = ballP.z * own > 0;
      const ballComing = ballV.z * own > 4;
      const dist = Math.hypot(bp.x - pos.x, bp.z - pos.z);

      if (M.state === 'KICKOFF') this.state = BOT_STATE.KICKOFF;
      else if (ballInOurHalf && (!goalSide || (ballComing && Math.abs(ballP.z - ownZ) < 30))) this.state = goalSide ? BOT_STATE.ATTACK : BOT_STATE.DEFEND;
      else if (!goalSide) this.state = BOT_STATE.REPOSITION;
      else this.state = dist > 32 ? BOT_STATE.SEEK_BALL : BOT_STATE.ATTACK;

      // Cible selon l'état
      const aimX = clamp(bp.x * 0.25, -C.GOAL_WIDTH * 0.3, C.GOAL_WIDTH * 0.3);
      let ax = aimX - bp.x, az = goalZ - bp.z; const al = Math.hypot(ax, az) || 1; ax /= al; az /= al; // direction ballon → but adverse
      switch (this.state) {
        case BOT_STATE.KICKOFF:
        case BOT_STATE.SEEK_BALL: this.target.set(bp.x - ax * 1.5, 0, bp.z - az * 1.5); break;
        case BOT_STATE.ATTACK: {
          const back = dist < 9 ? 0.5 : C.BALL_RADIUS + 2 + Math.min(dist * 0.18, 7);
          this.target.set(bp.x - ax * back, 0, bp.z - az * back); break;
        }
        case BOT_STATE.DEFEND: {
          // Repli par le second poteau : on contourne le ballon au lieu de le pousser vers sa propre cage
          const farPost = -(Math.sign(ballP.x) || 1) * C.GOAL_WIDTH * 0.45;
          const dz = Math.abs(pos.z - ownZ);
          this.target.set(dz > 14 ? farPost * 1.6 : farPost, 0, ownZ - own * (dz > 14 ? 9 : 3.5)); break;
        }
        case BOT_STATE.REPOSITION: {
          const side = Math.sign(pos.x - bp.x) || 1;
          this.target.set(bp.x - ax * 11 + side * 7, 0, bp.z - az * 11); break;
        }
        default: break;
      }
      // Rester dans l'arène
      this.target.x = clamp(this.target.x, -L.hx + 3, L.hx - 3);
      this.target.z = clamp(this.target.z, -L.hz + 2.5, L.hz - 2.5);
      // Voiture entrée dans une cage (et ballon ailleurs) : ressortir par l'ouverture
      const inGoal = Math.abs(pos.z) > L.hz - 0.5 && Math.abs(pos.x) < C.GOAL_WIDTH / 2;
      const ballInSameGoal = Math.abs(ballP.z) > L.hz - 1 && Math.sign(ballP.z) === Math.sign(pos.z);
      this.inGoal = inGoal && !ballInSameGoal;
      if (this.inGoal) { this.state = BOT_STATE.RECOVER; this.target.set(clamp(pos.x, -3, 3), 0, Math.sign(pos.z) * (L.hz - 9)); }
    }

    // ---- Pilotage vers la cible (recalculé à chaque pas) ----
    const lt = this._bp.copy(this.target).sub(pos).applyQuaternion(this._qi);
    const angle = Math.atan2(lt.x, lt.z), dist = Math.hypot(lt.x, lt.z);
    const ballLocal = this._bv.set(ballP.x - pos.x, ballP.y - pos.y, ballP.z - pos.z).applyQuaternion(this._qi);
    const ballAngle = Math.atan2(ballLocal.x, ballLocal.z), ballDist = Math.hypot(ballLocal.x, ballLocal.z);

    if (Math.abs(angle) > (this.inGoal ? 1.6 : 2.4) && (dist < 9 || this.inGoal) && this.state !== BOT_STATE.DEFEND) {
      out.throttle = -1; out.steer = -clamp(Math.sign(angle) * 1, -1, 1);       // marche arrière pour se réorienter
    } else {
      out.steer = clamp(angle * 2.6, -1, 1);
      out.throttle = 1;
      if (Math.abs(angle) > 1.3 && speed > 13) { out.handbrake = true; out.throttle = 0.6; }
      if (this.state === BOT_STATE.DEFEND && dist < 4) out.throttle = 0.2;      // se poster devant le but
    }
    const wantsBoost = this.state === BOT_STATE.SEEK_BALL || this.state === BOT_STATE.KICKOFF || this.state === BOT_STATE.DEFEND || (this.state === BOT_STATE.ATTACK && dist > 12);
    out.boost = wantsBoost && Math.abs(angle) < 0.25 && car.grounded >= 3 && speed < C.CAR_BOOST_MAX_SPEED - 3 && car.boost > (this.state === BOT_STATE.KICKOFF ? 0 : 8) && this.skill > 0.35;

    // ---- Sauts : frappe d'un ballon haut, ou saut directionnel dans le ballon ----
    if (this.jumpSeq) {
      const js = this.jumpSeq; js.t += dt;
      if (js.type === 'high') { out.jump = js.t < 0.22 || (js.t > 0.32 && js.t < 0.4 && ballP.y > 4.5); if (js.t > 0.28) { out.throttle = 0; out.steer = 0; } }
      else { out.jump = js.t < 0.08 || (js.t > 0.16 && js.t < 0.24); if (js.t > 0.14) { out.throttle = 1; out.steer = clamp(ballAngle * 1.5, -0.6, 0.6); } }
      if (js.t > 1.0) this.jumpSeq = null;
    } else if (car.grounded >= 3 && Math.abs(ballAngle) < 0.35 && this.state !== BOT_STATE.REPOSITION) {
      const ahead = ballLocal.z > 0;
      if (ahead && ballP.y > 3.0 && ballP.y < 7 && ballDist < 6.5 + ballP.y * 0.4) this.jumpSeq = { t: 0, type: 'high' };
      else if (ahead && ballP.y < 2.6 && ballDist < 5.2 && speed > 9 && this.skill > 0.5) this.jumpSeq = { t: 0, type: 'flip' };
    }

    // ---- En l'air hors figure : stabiliser la voiture (tangage et roulis) pour retomber sur les roues ----
    if (car.grounded === 0 && (!this.jumpSeq || this.jumpSeq.t > 0.45)) {
      const u = this._bv.set(0, 1, 0).applyQuaternion(this._qi);        // verticale du monde vue depuis la voiture
      out.throttle = clamp(-u.z * 2.5, -1, 1);
      if (Math.abs(u.x) > 0.15) { out.airRoll = true; out.steer = clamp(u.x * 2.5, -1, 1); }
      else out.steer = clamp(ballAngle * 0.8, -0.5, 0.5);
      out.boost = false;
    }

    // ---- Détection de blocage ----
    if (Math.abs(out.throttle) > 0.5 && speed < 1.2 && car.grounded >= 2) {
      this.stuckTime += dt;
      if (this.stuckTime > (this.inGoal ? 0.45 : 0.9)) {
        this.stuckTime = 0; this.reverseTime = 0.9;
        this.escapeDir = out.throttle > 0 ? -1 : 1;             // bloqué en avançant : on recule, et inversement
        this.reverseSteer = (out.throttle > 0 ? -out.steer : out.steer) || 1;
        this.stuckMemo = (this.stuckMemo || 0) + 1; this.escapeJump = this.stuckMemo >= 2;
      }
    } else this.stuckTime = 0;
    return out;
  }
}
