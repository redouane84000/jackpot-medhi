import { makeSim, run, STATE } from '../tests/helpers.mjs';
for (const soft of [0, 0.3, 0.6, 1.2]) {
  const sim = await makeSim(); sim.match.state = STATE.MENU;
  sim.ball.body.setSoftCcdPrediction(soft);
  sim.cars.forEach((c, i) => c.reset({ x: 25 * (i ? 1 : -1), y: 0.78, z: 40 }, 0));
  sim.ball.reset(0, 11.5, 0);
  const peaks = []; let lastVy = 0, minY = 99;
  run(sim, 7, (s) => { const v = s.ball.velocity; minY = Math.min(minY, s.ball.position.y); if (lastVy > 0 && v.y <= 0) peaks.push(+s.ball.position.y.toFixed(2)); lastVy = v.y; });
  // mur
  sim.ball.reset(20, 3, 0); sim.ball.body.setLinvel({ x: 60, y: 0, z: 0 }, true);
  let maxX = 0; run(sim, 1, (s) => { maxX = Math.max(maxX, s.ball.position.x); });
  console.log('soft', soft, 'peaks', peaks.slice(0, 4).join(' '), 'floorPen', (1.5 - minY).toFixed(3), 'wallPen', (maxX - 32.5).toFixed(3), 'vx after', sim.ball.velocity.x.toFixed(1));
}
