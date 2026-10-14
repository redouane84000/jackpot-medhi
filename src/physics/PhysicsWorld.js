/**
 * Monde physique Rapier : création, matériaux, groupes de collision, pas de simulation
 * et remontée des événements de contact. Aucun rendu ici.
 */
export const GROUP = { STATIC: 0x0001, CAR: 0x0002, BALL: 0x0004, QUERY: 0x8000 };
/** Groupes Rapier : 16 bits d'appartenance (haut) | 16 bits de filtre (bas). */
export const groups = (member, filter = 0xffff) => ((member & 0xffff) << 16) | (filter & 0xffff);

export const MATERIAL = {
  floor: { friction: 0.7, restitution: 0.3 },
  wall: { friction: 0.25, restitution: 0.35 },
  goal: { friction: 0.25, restitution: 0.3 },
  ceiling: { friction: 0.2, restitution: 0.4 },
  post: { friction: 0.2, restitution: 0.45 },
  car: { friction: 0.35, restitution: 0.1 },
};

export class PhysicsWorld {
  constructor(RAPIER, C) {
    this.R = RAPIER;
    this.C = C;
    this.world = new RAPIER.World({ x: 0, y: -C.GRAVITY, z: 0 });
    this.world.timestep = C.PHYSICS_DT;
    this.events = new RAPIER.EventQueue(true);
    this.owners = new Map();        // handle de collider → { type, ref }
    this.collisionCount = 0;
    this.listeners = [];
    this.rayGroups = groups(GROUP.QUERY, GROUP.STATIC);
  }

  register(collider, type, ref) { this.owners.set(collider.handle, { type, ref }); }
  ownerOf(handle) { return this.owners.get(handle); }
  onCollision(fn) { this.listeners.push(fn); }

  step() {
    this.world.step(this.events);
    this.events.drainCollisionEvents((h1, h2, started) => {
      if (!started) return;
      this.collisionCount++;
      const a = this.owners.get(h1), b = this.owners.get(h2);
      if (!a || !b) return;
      for (const fn of this.listeners) fn(a, b);
    });
  }

  /** Lancer de rayon contre la géométrie statique uniquement (sol, murs, cages). */
  castStatic(origin, dir, maxDist) {
    const R = this.R;
    if (!this._ray) this._ray = new R.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 0 });
    const ray = this._ray;
    ray.origin.x = origin.x; ray.origin.y = origin.y; ray.origin.z = origin.z;
    ray.dir.x = dir.x; ray.dir.y = dir.y; ray.dir.z = dir.z;
    return this.world.castRayAndGetNormal(ray, maxDist, true, undefined, this.rayGroups);
  }

  get bodyCount() { return this.world.bodies.len(); }
}
