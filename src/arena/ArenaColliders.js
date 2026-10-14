import { GROUP, groups, MATERIAL } from '../physics/PhysicsWorld.js';

/** Construit les colliders statiques de l'arène à partir du layout partagé. */
export function buildArenaColliders(phys, layout) {
  const R = phys.R, world = phys.world;
  const body = world.createRigidBody(R.RigidBodyDesc.fixed());
  const g = groups(GROUP.STATIC, 0xffff);
  const colliders = [];
  for (const b of layout.boxes) {
    const m = MATERIAL[b.kind] || MATERIAL.wall;
    const half = Math.sin(b.yaw / 2), w = Math.cos(b.yaw / 2);
    const desc = R.ColliderDesc.cuboid(b.h[0], b.h[1], b.h[2])
      .setTranslation(b.c[0], b.c[1], b.c[2])
      .setRotation({ x: 0, y: half, z: 0, w })
      .setFriction(m.friction).setRestitution(m.restitution)
      .setCollisionGroups(g);
    const col = world.createCollider(desc, body);
    phys.register(col, b.kind === 'floor' ? 'floor' : 'static', b);
    colliders.push(col);
  }
  for (const p of layout.posts) {
    const desc = R.ColliderDesc.capsule(p.halfHeight, p.radius)
      .setTranslation(p.c[0], p.c[1], p.c[2])
      .setFriction(MATERIAL.post.friction).setRestitution(MATERIAL.post.restitution)
      .setCollisionGroups(g);
    if (p.axis === 'x') desc.setRotation({ x: 0, y: 0, z: Math.SQRT1_2, w: Math.SQRT1_2 });
    const col = world.createCollider(desc, body);
    phys.register(col, 'post', p);
    colliders.push(col);
  }
  return { body, colliders };
}
