import { makeSim, run } from '../tests/helpers.mjs';
import { BotBrain } from '../src/ai/BotController.js';
import { VehicleController } from '../src/vehicles/VehicleController.js';
let inGoal = [0, 0], slowInGoal = [0, 0], steps = 0, goals = 0, own = 0, longest = [0, 0], cur = [0, 0];
for (const seed of [1, 2, 3, 4, 5, 6]) {
  const sim = await makeSim({ MATCH_DURATION: 120 }, { seed });
  const brains = [new BotBrain(sim.C), new BotBrain(sim.C)];
  brains.forEach((b, i) => sim.setController(i, new VehicleController(b)));
  sim.bus.on('goal', e => { goals++; if (sim.ball.lastTouch && sim.ball.lastTouch.team !== e.team) own++; });
  sim.match.startMatch();
  run(sim, 130, s => {
    if (s.match.state !== 'PLAYING') return; steps++;
    s.cars.forEach((c, i) => { const t = c.body.translation(); const g = Math.abs(t.z) > s.layout.hz && Math.abs(t.x) < 7; if (g) { inGoal[i]++; if (c.speed < 2) slowInGoal[i]++; cur[i]++; longest[i] = Math.max(longest[i], cur[i]); } else cur[i] = 0; });
  });
}
const pc = v => (v / steps * 100).toFixed(1) + '%';
console.log('in goal', inGoal.map(pc), 'slow in goal', slowInGoal.map(pc), 'longest stay s', longest.map(v => (v / 120).toFixed(1)), 'goals', goals, 'own goals', own);
