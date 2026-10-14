import { makeSim, forcePlaying, scripted, run } from '../tests/helpers.mjs';
for (const soft of [0, 0.8]) {
  const sim = await makeSim(); forcePlaying(sim);
  for (const c of sim.cars) c.body.setSoftCcdPrediction(soft);
  sim.cars[1].reset({ x: 28, y: 0.78, z: 45 }, 0);
  const car = sim.cars[0];
  sim.ball.reset(0, 1.5, 0); car.reset({ x: 0, y: 0.78, z: -30 }, 0);
  sim.setController(0, scripted(() => ({ throttle: 1 })));
  let hit = null, after = null; sim.bus.on('ballHit', () => { if (!hit) hit = car.fwdSpeed; });
  run(sim, 3, (s) => { if (hit && !after && s.ball.speed > 1) after = null; });
  run(sim, 0); const v = sim.ball.velocity;
  // mur frontal à pleine vitesse
  car.reset({ x: -20, y: 0.78, z: 20 }, Math.PI / 2 * -1); sim.ball.reset(30, 1.5, -40);
  car.reset({ x: 10, y: 0.78, z: 0 }, Math.PI / 2);
  let maxX = 0, flipped = false; run(sim, 3, (s) => { maxX = Math.max(maxX, car.body.translation().x); const q = car.body.rotation(); if (1 - 2 * (q.x * q.x + q.z * q.z) < 0.3) flipped = true; });
  console.log('car soft', soft, '| hit at', hit?.toFixed(1), '→ ball', v.z.toFixed(1), v.y.toFixed(1), '| wall: car max x', maxX.toFixed(2), '(mur', sim.layout.hx, ') flipped', flipped);
}
