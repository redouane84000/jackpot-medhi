import { makeSim, run } from '../tests/helpers.mjs';
import { BotBrain } from '../src/ai/BotController.js';
import { VehicleController } from '../src/vehicles/VehicleController.js';
let tot = { up: 0, rev: 0, steps: 0, rec: 0, hits: 0, goals: 0 };
for (const seed of [1, 2, 4, 5, 6]) {
  const sim = await makeSim({ MATCH_DURATION: 90 }, { seed });
  const brains = [new BotBrain(sim.C), new BotBrain(sim.C)];
  brains.forEach((b, i) => sim.setController(i, new VehicleController(b)));
  sim.bus.on('car', e => { if (e.type === 'recover') tot.rec++; });
  sim.bus.on('ballHit', () => tot.hits++); sim.bus.on('goal', () => tot.goals++);
  sim.match.startMatch();
  run(sim, 100, (s) => { if (s.match.state !== 'PLAYING') return; for (const c of s.cars) { const q = c.body.rotation(); tot.steps++; if (1 - 2 * (q.x * q.x + q.z * q.z) < 0.3) tot.up++; } brains.forEach(b => { if (b.reverseTime > 0) tot.rev++; }); });
}
console.log('upside-down %', (tot.up / tot.steps * 100).toFixed(1), 'reversing %', (tot.rev / tot.steps * 100).toFixed(1), 'recoveries/match', (tot.rec / 5).toFixed(1), 'hits/match', (tot.hits / 5).toFixed(0), 'goals/match', (tot.goals / 5).toFixed(1));
