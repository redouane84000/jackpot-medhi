import { Vector3, Quaternion } from 'three';
import { GROUP, groups, MATERIAL } from '../physics/PhysicsWorld.js';

/**
 * Véhicule physique : un corps rigide Rapier (châssis) et quatre roues à suspension par lancer de rayon.
 * Toute la conduite passe par des impulsions (ressorts, adhérence, moteur, freins, boost, saut) :
 * la position n'est jamais modifiée directement, sauf lors d'un replacement (reset).
 */
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const lerp = (a, b, t) => a + (b - a) * t;
const moveTowards = (x, target, maxDelta) => x + clamp(target - x, -maxDelta, maxDelta);
const UP = new Vector3(0, 1, 0);

/** Commandes neutres (entrée d'un VehicleController). */
export const neutralControls = () => ({ throttle: 0, steer: 0, boost: false, jump: false, handbrake: false, airRoll: false });

export class Vehicle {
  constructor(phys, C, { id, team, isBot = false, model = null }) {
    this.phys = phys; this.C = C; this.id = id; this.team = team; this.isBot = isBot;
    const R = phys.R, m = C.CAR_MASS, hb = C.CAR_HITBOX;
    const inertia = this._inertia(m);
    this.inertia = inertia; this.mass = m;
    this.P = { accel: C.CAR_ACCELERATION, maxSpeed: C.CAR_MAX_SPEED, boostAccel: C.CAR_BOOST_ACCEL, boostMax: C.CAR_BOOST_MAX_SPEED };
    this.body = phys.world.createRigidBody(R.RigidBodyDesc.dynamic()
      .setTranslation(0, 1, 0)
      .setAdditionalMassProperties(m, { x: 0, y: C.CAR_COM_OFFSET_Y, z: 0 }, inertia, { x: 0, y: 0, z: 0, w: 1 })
      .setCanSleep(false).setCcdEnabled(true).setAngularDamping(0.05));
    const rr = 0.14;
    this.collider = phys.world.createCollider(R.ColliderDesc.roundCuboid(hb.hx - rr, hb.hy - rr, hb.hz - rr, rr)
      .setDensity(0).setFriction(MATERIAL.car.friction).setRestitution(MATERIAL.car.restitution)
      .setCollisionGroups(groups(GROUP.CAR)).setActiveEvents(R.ActiveEvents.COLLISION_EVENTS), this.body);
    phys.register(this.collider, 'car', this);

    // Suspension : raideur et amortissement déduits de la fréquence propre et du taux d'amortissement
    const mq = m / 4, w0 = 2 * Math.PI * C.SUSPENSION_FREQUENCY;
    this.k = mq * w0 * w0;
    this.c = 2 * C.SUSPENSION_DAMPING * Math.sqrt(this.k * mq);
    const mountY = 0.05, bz = C.WHEEL_BASE_HALF, tx = C.WHEEL_TRACK_HALF;
    this.wheels = [
      { local: new Vector3(tx, mountY, bz), front: true, left: true },
      { local: new Vector3(-tx, mountY, bz), front: true, left: false },
      { local: new Vector3(tx, mountY, -bz), front: false, left: true },
      { local: new Vector3(-tx, mountY, -bz), front: false, left: false },
    ].map(w => Object.assign(w, { contact: false, len: C.SUSPENSION_REST_LENGTH, load: 0, spin: 0, spinVel: 0, slip: 0, point: new Vector3(), normal: new Vector3(0, 1, 0) }));

    // Temporaires (aucune allocation par pas)
    this._q = new Quaternion(); this._fwd = new Vector3(); this._up = new Vector3(); this._left = new Vector3();
    this._v = new Vector3(); this._w = new Vector3(); this._com = new Vector3(); this._p = new Vector3(); this._r = new Vector3();
    this._vp = new Vector3(); this._f = new Vector3(); this._s = new Vector3(); this._j = new Vector3(); this._tmp = new Vector3();
    this._down = new Vector3(); this._qi = new Quaternion();
    this.handGrip = 1;
    if (model) this.setModel(model);
    this.reset({ x: 0, y: 0.8, z: 0 }, 0);
  }

  _inertia(m) { const C = this.C, Lx = C.CAR_WIDTH, Ly = 0.9, Lz = C.CAR_LENGTH; return { x: m / 12 * (Ly * Ly + Lz * Lz), y: m / 12 * (Lx * Lx + Lz * Lz), z: m / 12 * (Lx * Lx + Ly * Ly) }; }

  /** Applique les performances d'un modèle (masse, moteur, boost). Mêmes dimensions et même hitbox pour tous. */
  setModel(id) {
    const C = this.C, k = (C.CAR_MODELS && C.CAR_MODELS[id]) || { mass: 1, accel: 1, maxSpeed: 1, boostAccel: 1, boostMax: 1 };
    this.model = id;
    this.mass = C.CAR_MASS * k.mass; this.inertia = this._inertia(this.mass);
    this.P = { accel: C.CAR_ACCELERATION * k.accel, maxSpeed: C.CAR_MAX_SPEED * k.maxSpeed, boostAccel: C.CAR_BOOST_ACCEL * k.boostAccel, boostMax: C.CAR_BOOST_MAX_SPEED * k.boostMax };
    this.body.setAdditionalMassProperties(this.mass, { x: 0, y: C.CAR_COM_OFFSET_Y, z: 0 }, this.inertia, { x: 0, y: 0, z: 0, w: 1 }, true);
    // raideur des ressorts proportionnelle à la masse : même fréquence propre
    const mq = this.mass / 4, w0 = 2 * Math.PI * C.SUSPENSION_FREQUENCY;
    this.k = mq * w0 * w0; this.c = 2 * C.SUSPENSION_DAMPING * Math.sqrt(this.k * mq);
  }

  /** Replace la voiture et supprime toute vitesse résiduelle. */
  reset(pos, yaw) {
    const b = this.body;
    b.setTranslation({ x: pos.x, y: pos.y ?? 0.8, z: pos.z }, true);
    b.setRotation({ x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) }, true);
    b.setLinvel({ x: 0, y: 0, z: 0 }, true); b.setAngvel({ x: 0, y: 0, z: 0 }, true);
    b.resetForces(true); b.resetTorques(true);
    this.boost = this.C.BOOST_START; this.steer = 0; this.boosting = false;
    this.grounded = 0; this.onGroundTime = 1; this.airTime = 0;
    this.jumped = false; this.jumpTime = 0; this.secondUsed = false; this.prevJump = false;
    this.dodgeTime = -1; this.upsideTime = 0; this.recoverTime = 0; this.liftOff = 0; this.speed = 0; this.fwdSpeed = 0;
    this.lastHitTime = -10; this.events = [];
    for (const w of this.wheels) { w.contact = false; w.len = this.C.SUSPENSION_REST_LENGTH; w.spinVel = 0; }
  }

  /** Un pas de simulation fixe. ctrl : commandes {throttle, steer, boost, jump, handbrake, airRoll}. */
  step(ctrl, dt) {
    const C = this.C, b = this.body, m = this.mass, g = C.GRAVITY, P = this.P;
    const q = b.rotation(); this._q.set(q.x, q.y, q.z, q.w);
    const fwd = this._fwd.set(0, 0, 1).applyQuaternion(this._q);
    const up = this._up.set(0, 1, 0).applyQuaternion(this._q);
    const left = this._left.set(1, 0, 0).applyQuaternion(this._q);
    const t = b.translation(), lv = b.linvel(), av = b.angvel(), wc = b.worldCom();
    const vel = this._v.set(lv.x, lv.y, lv.z), angv = this._w.set(av.x, av.y, av.z), com = this._com.set(wc.x, wc.y, wc.z);
    const speed = vel.length(), fwdSpeed = vel.dot(fwd);
    this.speed = speed; this.fwdSpeed = fwdSpeed; this.events.length = 0;

    // ---- Direction : angle limité selon la vitesse, rotation progressive des roues ----
    const maxSteer = lerp(C.CAR_STEER_MAX_LOW, C.CAR_STEER_MAX_HIGH, clamp(Math.abs(fwdSpeed) / P.maxSpeed, 0, 1));
    this.steer = moveTowards(this.steer, clamp(ctrl.steer, -1, 1) * maxSteer, C.CAR_STEER_RATE * dt);

    // ---- Suspension par lancer de rayon ----
    const L0 = C.SUSPENSION_REST_LENGTH, WR = C.WHEEL_RADIUS;
    if (this.liftOff > 0) this.liftOff -= dt;
    const down = this._down.copy(up).negate();
    let n = 0;
    for (const w of this.wheels) {
      const p = this._p.copy(w.local).applyQuaternion(this._q).add(this._tmp.set(t.x, t.y, t.z));
      const hit = this.phys.castStatic(p, down, L0 + WR);
      if (hit) {
        const d = hit.timeOfImpact, comp = clamp(L0 + WR - d, 0, L0);
        const r = this._r.subVectors(p, com), vp = this._vp.crossVectors(angv, r).add(vel);
        // Au décollage d'un saut, les ressorts sont relâchés : pas de détente parasite qui s'ajouterait à l'impulsion
        const F = this.liftOff > 0 ? 0 : clamp(this.k * comp - this.c * vp.dot(up), 0, C.SUSPENSION_MAX_FORCE);
        this._j.copy(up).multiplyScalar(F * dt);
        b.applyImpulseAtPoint(this._j, p, true);
        w.contact = true; w.load = F; w.len = d - WR;
        w.point.copy(p).addScaledVector(down, d); w.normal.set(hit.normal.x, hit.normal.y, hit.normal.z);
        n++;
      } else { w.contact = false; w.load = 0; w.len = L0; }
    }
    const wasGrounded = this.grounded;
    this.grounded = n;
    if (n >= 3) { this.onGroundTime += dt; this.airTime = 0; } else if (n === 0) { this.airTime += dt; this.onGroundTime = 0; }
    if (wasGrounded === 0 && n >= 3 && this.airTime === 0) this.events.push('land');

    // ---- Moteur, freins, résistances (calculés au niveau voiture, répartis sur les roues au sol) ----
    let aDrive = 0, decel = 0;
    const thr = clamp(ctrl.throttle, -1, 1);
    if (n > 0) {
      if (thr > 0.05) {
        if (fwdSpeed < -0.8) decel = C.CAR_BRAKE_DECEL * thr;
        else { const u = fwdSpeed / P.maxSpeed; aDrive = P.accel * thr * clamp(1 - u * u * Math.sign(u), 0, 1); }
      } else if (thr < -0.05) {
        if (fwdSpeed > 0.8) decel = C.CAR_BRAKE_DECEL * -thr;
        else { const u = -fwdSpeed / C.CAR_REVERSE_MAX_SPEED; aDrive = -P.accel * 0.8 * -thr * clamp(1 - u * u * Math.sign(u), 0, 1); }
      } else decel = C.CAR_COAST_DECEL;
      decel += C.CAR_ROLLING_RESISTANCE * g;
    }
    this.braking = n > 0 && ((thr > 0.05 && fwdSpeed < -0.8) || (thr < -0.05 && fwdSpeed > 0.8));

    // ---- Adhérence (cercle de friction) et motricité, roue par roue ----
    // Frein à main : l'adhérence arrière chute vite et revient progressivement (dérapage contrôlable)
    this.handGrip += ((ctrl.handbrake ? 0 : 1) - this.handGrip) * Math.min(1, dt * (ctrl.handbrake ? 14 : C.CAR_DRIFT_RECOVER));
    if (n > 0) {
      const share = m / n;
      const cs = Math.cos(this.steer), sn = Math.sin(this.steer);
      let slipSum = 0;
      for (const w of this.wheels) {
        if (!w.contact) { w.slip = 0; continue; }
        const nrm = w.normal;
        const f = this._f.copy(fwd);
        if (w.front) f.multiplyScalar(cs).addScaledVector(left, sn);
        f.addScaledVector(nrm, -f.dot(nrm)).normalize();
        const s = this._s.crossVectors(nrm, f);
        const r = this._r.subVectors(w.point, com), vp = this._vp.crossVectors(angv, r).add(vel);
        const vLat = vp.dot(s), vLong = vp.dot(f);
        const hg = w.front ? 1 : this.handGrip;
        const mu = C.CAR_GRIP * lerp(C.CAR_HANDBRAKE_REAR_GRIP, 1, hg);
        const stiff = C.CAR_GRIP_STIFFNESS * lerp(0.35, 1, hg);
        let jLat = -vLat * share * stiff;
        let jLong = aDrive * share * dt;
        if (decel > 0) jLong -= Math.sign(vLong) * Math.min(decel * share * dt, Math.abs(vLong) * share);
        const lim = mu * w.load * dt, mag = Math.hypot(jLat, jLong);
        if (mag > lim && mag > 1e-9) { const k = lim / mag; jLat *= k; jLong *= k; }
        w.slip = Math.abs(vLat) + (mag > lim ? 2 : 0);
        slipSum += w.slip;
        // Point d'application remonté vers le centre de gravité : moins de roulis parasite
        const p = this._p.copy(w.point).addScaledVector(up, r.dot(up) * -C.CAR_ROLL_STABILITY);
        this._j.copy(s).multiplyScalar(jLat).addScaledVector(f, jLong);
        b.applyImpulseAtPoint(this._j, p, true);
        w.spinVel = vLong / C.WHEEL_RADIUS;
      }
      this.slip = slipSum / n;
      // Aide de rotation en dérapage : le braquage fait pivoter la voiture autour de la verticale
      if (this.handGrip < 0.8 && Math.abs(fwdSpeed) > 4 && n >= 3) {
        const yawAcc = C.CAR_DRIFT_YAW * clamp(ctrl.steer, -1, 1) * (1 - this.handGrip) * Math.sign(fwdSpeed);
        b.applyTorqueImpulse(this._j.copy(up).multiplyScalar(yawAcc * this.inertia.y * dt), true);
      }
      // Appui aérodynamique
      if (n >= 3) b.applyImpulse(this._j.copy(up).multiplyScalar(-C.CAR_DOWNFORCE * m * speed * speed * dt), true);
    } else this.slip = 0;
    for (const w of this.wheels) {
      if (!w.contact) w.spinVel = lerp(w.spinVel, (w.front ? 0 : thr * 30), 1 - Math.exp(-dt * 1.5));
      w.spin += w.spinVel * dt;
    }

    // ---- Traînée aérodynamique ----
    if (speed > 0.01) b.applyImpulse(this._j.copy(vel).multiplyScalar(-C.CAR_DRAG * m * speed * dt), true);

    // ---- Boost : poussée de réacteur, au sol comme en l'air ----
    this.boosting = false;
    if (ctrl.boost && this.boost > 0) {
      this.boosting = true;
      this.boost = Math.max(0, this.boost - C.BOOST_CONSUMPTION * dt);
      if (fwdSpeed < P.boostMax) b.applyImpulse(this._j.copy(fwd).multiplyScalar(P.boostAccel * m * dt), true);
    }

    // ---- Saut, double saut, saut directionnel ----
    const jumpPressed = ctrl.jump && !this.prevJump;
    this.prevJump = ctrl.jump;
    if (this.jumped) this.jumpTime += dt;
    if (n >= 3 && this.onGroundTime > 0.12 && (!this.jumped || this.jumpTime > 0.25)) { this.jumped = false; this.secondUsed = false; this.jumpTime = 0; }
    const upright = up.y > 0.35;
    if (jumpPressed) {
      if (n >= C.CAR_JUMP_MIN_WHEELS && !this.jumped && upright) {
        // Vitesse de décollage fixe le long de l'axe vertical de la voiture (indépendante de la compression)
        const vu = b.linvel(), along = vu.x * up.x + vu.y * up.y + vu.z * up.z;
        b.applyImpulse(this._j.copy(up).multiplyScalar(m * (C.CAR_JUMP_SPEED - Math.max(along, 0))), true);
        this.liftOff = 0.12;
        this.jumped = true; this.jumpTime = 0; this.secondUsed = false; this.onGroundTime = 0; this.events.push('jump');
      } else if (n === 0 && !this.secondUsed && (!this.jumped || this.jumpTime < C.CAR_DOUBLE_JUMP_WINDOW)) {
        this.secondUsed = true;
        const ix = clamp(ctrl.steer, -1, 1), iy = clamp(ctrl.throttle, -1, 1);
        if (Math.hypot(ix, iy) > 0.4) {
          // Saut directionnel : impulsion horizontale + rotation (figure)
          const hf = this._f.set(fwd.x, 0, fwd.z).normalize(), hl = this._s.set(left.x, 0, left.z).normalize();
          const dir = this._tmp.copy(hf).multiplyScalar(iy).addScaledVector(hl, ix).normalize();
          const nv = b.linvel(), il = Math.hypot(ix, iy) || 1;
          const fw = iy / il, sd = Math.abs(ix) / il;
          const dv = (fw >= 0 ? C.CAR_DODGE_SPEED * fw : C.CAR_DODGE_BACK_SPEED * -fw) + C.CAR_DODGE_SIDE_SPEED * sd;
          const k = dv / Math.max(0.5, Math.abs(fw) + sd);
          b.setLinvel({ x: nv.x + dir.x * k, y: Math.max(nv.y * 0.35, 0.8), z: nv.z + dir.z * k }, true);
          const axis = this._r.crossVectors(UP, dir).normalize();
          b.setAngvel({ x: axis.x * C.CAR_DODGE_SPIN, y: axis.y * C.CAR_DODGE_SPIN, z: axis.z * C.CAR_DODGE_SPIN }, true);
          this.dodgeTime = 0; this.events.push('dodge');
        } else {
          b.applyImpulse(this._j.copy(up).multiplyScalar(m * C.CAR_DOUBLE_JUMP_SPEED), true);
          this.events.push('jump');
        }
      } else if (!upright && n < 3) this.upsideTime = C.CAR_RECOVER_DELAY; // saut sur le toit : redressement immédiat
    }
    // Saut à hauteur variable : poussée prolongée tant que la touche reste enfoncée
    if (ctrl.jump && this.jumped && !this.secondUsed && this.jumpTime < C.CAR_JUMP_HOLD_TIME && this.dodgeTime < 0)
      b.applyImpulse(this._j.copy(up).multiplyScalar(m * C.CAR_JUMP_HOLD_ACCEL * dt), true);
    if (this.dodgeTime >= 0) {
      this.dodgeTime += dt;
      // figure « à plat » : la chute est freinée pendant la rotation
      if (this.dodgeTime > 0.1 && this.dodgeTime < 0.5) { const v = b.linvel(); if (v.y < 0) b.setLinvel({ x: v.x, y: v.y * Math.exp(-C.CAR_DODGE_FLAT * dt), z: v.z }, true); }
      if (this.dodgeTime > C.CAR_DODGE_TIME) { this.dodgeTime = -1; const a = b.angvel(); b.setAngvel({ x: a.x * 0.2, y: a.y * 0.2, z: a.z * 0.2 }, true); }
    }

    // ---- Contrôle aérien (couples) + assistance d'atterrissage explicite ----
    if (n === 0 && this.dodgeTime < 0 && this.recoverTime <= 0) {
      this._qi.copy(this._q).invert();
      const wl = this._tmp.copy(angv).applyQuaternion(this._qi); // vitesse angulaire locale
      const inp = [clamp(ctrl.throttle, -1, 1), ctrl.airRoll ? 0 : clamp(ctrl.steer, -1, 1), ctrl.airRoll ? -clamp(ctrl.steer, -1, 1) : 0];
      // Assistance : près du sol et en descente, ramène doucement la voiture à plat sur les axes laissés libres
      let assist = null;
      if (C.CAR_LANDING_ASSIST > 0 && vel.y < -1 && up.y < 0.995) {
        const hit = this.phys.castStatic(com, this._down.set(0, -1, 0), 3.2);
        if (hit) {
          const axis = this._r.crossVectors(up, UP); const sl = axis.length();
          if (sl > 1e-4) { const ang = Math.acos(clamp(up.y, -1, 1)); assist = axis.multiplyScalar(ang * C.CAR_LANDING_ASSIST / sl).applyQuaternion(this._qi); }
        }
      }
      const axes = ['x', 'y', 'z'], dv = [0, 0, 0];
      for (let i = 0; i < 3; i++) {
        const cur = wl[axes[i]];
        let target;
        if (Math.abs(inp[i]) > 0.05) target = clamp(cur + inp[i] * (i === 2 ? C.CAR_AIR_ROLL_ACCEL : C.CAR_AIR_ACCEL) * dt, -C.CAR_AIR_MAX_ANGVEL, C.CAR_AIR_MAX_ANGVEL);
        else if (assist && i !== 1) target = cur + (assist[axes[i]] - cur) * Math.min(1, 8 * dt);
        else target = cur * Math.exp(-C.CAR_AIR_DAMPING * dt);
        dv[i] = target - cur;
      }
      const ti = this._r.set(dv[0] * this.inertia.x, dv[1] * this.inertia.y, dv[2] * this.inertia.z).applyQuaternion(this._q);
      b.applyTorqueImpulse(ti, true);
    }

    // ---- Redressement automatique (voiture sur le toit ou sur le flanc) ----
    if (this.recoverTime > 0) {
      this.recoverTime -= dt;
      const ang = Math.acos(clamp(up.y, -1, 1));
      if (ang < 0.12 || n >= 3) this.recoverTime = 0;
      else {
        const axis = this._r.crossVectors(up, UP); const sl = axis.length();
        if (sl > 1e-3) axis.multiplyScalar(1 / sl); else axis.copy(fwd);
        const wr = Math.min(ang * 8, 7), yawRate = angv.y;
        b.setAngvel({ x: axis.x * wr, y: axis.y * wr + yawRate * 0.5, z: axis.z * wr }, true);
      }
    }
    if (!upright && n < 2 && speed < 5 && this.recoverTime <= 0) {
      this.upsideTime += dt;
      if (this.upsideTime >= C.CAR_RECOVER_DELAY) {
        const nv = b.linvel();
        b.setLinvel({ x: nv.x * 0.5, y: Math.max(nv.y, 3.6), z: nv.z * 0.5 }, true);
        this.upsideTime = 0; this.recoverTime = 1.1; this.events.push('recover');
      }
    } else this.upsideTime = 0;

    this.supersonic = speed > P.boostMax * 0.93;
    // ---- Plafond de vitesse de sécurité ----
    const nv = b.linvel(), sp = Math.hypot(nv.x, nv.y, nv.z), cap = P.boostMax + 6;
    if (sp > cap) { const k = cap / sp; b.setLinvel({ x: nv.x * k, y: nv.y * k, z: nv.z * k }, true); }
  }

  /** Données utiles à l'IA, la caméra et le rendu. */
  get position() { return this.body.translation(); }
  get rotation() { return this.body.rotation(); }
  get velocity() { return this.body.linvel(); }
}
