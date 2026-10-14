import { makeSim, run, STATE } from '../tests/helpers.mjs';
for (const variant of ['base', 'soft1', 'iter8', 'both']) {
  const sim = await makeSim();
  sim.match.state = STATE.MENU;
  const W = sim.phys.world, ball = sim.ball;
  if (variant === 'iter8' || variant === 'both') W.numSolverIterations = 8;
  if (variant === 'soft1' || variant === 'both') ball.body.setSoftCcdPrediction(1.2);
  sim.cars[0].reset({ x: -30, y: 0.78, z: -45 }, 0); sim.cars[1].reset({ x: 30, y: 0.78, z: 45 }, 0);
  ball.reset(25, 3, 0); ball.body.setLinvel({ x: 60, y: 0, z: 0 }, true);
  let maxX = 0; run(sim, 1, () => { maxX = Math.max(maxX, ball.position.x); });
  ball.reset(0, 2, 40); ball.body.setLinvel({ x: 0, y: 0, z: 60 }, true);
  let maxZ = 0; run(sim, 1, () => { maxZ = Math.max(maxZ, ball.position.z); });
  ball.reset(0, 12, 0); let minY = 99; run(sim, 3, () => { minY = Math.min(minY, ball.position.y); });
  console.log(variant.padEnd(6), 'wall pen', (maxX - 32.5).toFixed(3), 'net pen', (maxZ - 57).toFixed(3), 'floor pen', (1.5 - minY).toFixed(3));
}
