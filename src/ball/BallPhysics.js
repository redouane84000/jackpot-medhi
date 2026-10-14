import { GROUP, groups } from '../physics/PhysicsWorld.js';

/**
 * Ballon : corps rigide sphérique soumis à la gravité, aux rebonds (restitution), au frottement
 * et à une légère résistance de l'air. Détection continue des collisions (CCD) activée.
 */
export class Ball {
  constructor(phys, C) {
    this.phys = phys; this.C = C;
    const R = phys.R;
    this.body = phys.world.createRigidBody(R.RigidBodyDesc.dynamic()
      .setTranslation(0, C.BALL_SPAWN_HEIGHT, 0)
      .setCcdEnabled(true).setCanSleep(false)
      .setLinearDamping(C.BALL_LINEAR_DAMPING).setAngularDamping(C.BALL_ANGULAR_DAMPING));
    this.collider = phys.world.createCollider(R.ColliderDesc.ball(C.BALL_RADIUS)
      .setMass(C.BALL_MASS)
      .setRestitution(C.BALL_RESTITUTION).setRestitutionCombineRule(R.CoefficientCombineRule.Max)
      .setFriction(C.BALL_FRICTION)
      .setCollisionGroups(groups(GROUP.BALL)).setActiveEvents(R.ActiveEvents.COLLISION_EVENTS), this.body);
    phys.register(this.collider, 'ball', this);
    this.active = true;
    this.lastTouch = null;      // dernière voiture à avoir touché le ballon
  }

  reset(x = 0, y = this.C.BALL_SPAWN_HEIGHT, z = 0) {
    const b = this.body;
    b.setEnabled(true); this.active = true;
    b.setTranslation({ x, y, z }, true);
    b.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
    b.setLinvel({ x: 0, y: 0, z: 0 }, true); b.setAngvel({ x: 0, y: 0, z: 0 }, true);
    b.resetForces(true); b.resetTorques(true);
    this.lastTouch = null;
  }

  /** Retire le ballon du jeu (explosion de but) sans le téléporter. */
  deactivate() { this.active = false; this.body.setLinvel({ x: 0, y: 0, z: 0 }, false); this.body.setEnabled(false); }

  /** Plafond de vitesse de sécurité (évite les traversées numériques). */
  clampSpeed() {
    const v = this.body.linvel(), s = Math.hypot(v.x, v.y, v.z), max = this.C.BALL_MAX_SPEED;
    if (s > max) { const k = max / s; this.body.setLinvel({ x: v.x * k, y: v.y * k, z: v.z * k }, true); }
  }

  get position() { return this.body.translation(); }
  get velocity() { return this.body.linvel(); }
  get speed() { const v = this.body.linvel(); return Math.hypot(v.x, v.y, v.z); }
}
