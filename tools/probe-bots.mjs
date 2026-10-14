import { makeSim, run } from '../tests/helpers.mjs';
import { BotBrain } from '../src/ai/BotController.js';
import { VehicleController } from '../src/vehicles/VehicleController.js';
const dur = +(process.argv[2] || 120), skillA = +(process.argv[3] || 0.8), skillB = +(process.argv[4] || 0.8);
const sim = await makeSim({ MATCH_DURATION: dur }, { seed: +(process.argv[5] || 3), models: ['typhon', 'vortex'] });
const brains = [new BotBrain(sim.C, { skill: skillA }), new BotBrain(sim.C, { skill: skillB })];
brains.forEach((b, i) => sim.setController(i, new VehicleController(b)));
const states = [{}, {}]; let goals = [], hits = [0, 0], flips = 0, maxBall = 0, minCarY = 9, upsides = 0;
sim.bus.on('goal', e => goals.push(`${e.team}@${(sim.time).toFixed(0)}s`));
sim.bus.on('ballHit', e => hits[e.car.id]++);
sim.bus.on('car', e => { if (e.type === 'recover') upsides++; });
sim.match.startMatch();
const t0 = Date.now();
run(sim, dur * 3, (s, i) => {
  brains.forEach((b, k) => states[k][b.state] = (states[k][b.state] || 0) + 1);
  maxBall = Math.max(maxBall, s.ball.speed);
  for (const c of s.cars) minCarY = Math.min(minCarY, c.body.translation().y);
  if (s.match.state === 'MATCH_FINISHED' && !s._done) { s._done = true; console.log('finished at sim t', s.time.toFixed(1), 'winner', s.match.winner); }
});
const pct = o => Object.entries(o).map(([k, v]) => `${k}:${(v / Object.values(o).reduce((a, b) => a + b) * 100).toFixed(0)}%`).join(' ');
console.log('wall time', ((Date.now() - t0) / 1000).toFixed(1), 's for', sim.time.toFixed(0), 's sim');
console.log('score', sim.match.score, 'state', sim.match.state, 'overtime', sim.match.overtime, 'goals', goals.join(' '));
console.log('hits', hits, 'recoveries', upsides, 'max ball speed', maxBall.toFixed(1), 'min car y', minCarY.toFixed(2));
console.log('bot0', pct(states[0])); console.log('bot1', pct(states[1]));
