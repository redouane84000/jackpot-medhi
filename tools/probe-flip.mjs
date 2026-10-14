import { makeSim, run } from '../tests/helpers.mjs';
import { BotBrain } from '../src/ai/BotController.js';
import { VehicleController } from '../src/vehicles/VehicleController.js';
for (const seed of [1, 2, 3, 4]) {
  const sim = await makeSim({ MATCH_DURATION: 90 }, { seed });
  const brains = [new BotBrain(sim.C), new BotBrain(sim.C)];
  brains.forEach((b, i) => sim.setController(i, new VehicleController(b)));
  const recent = [[], []], causes = {}, states = [{}, {}]; let hits = [0, 0];
  sim.bus.on('car', e => { const r = recent[e.car.id]; if (e.type === 'recover') { const c = r.filter(x => sim.time - x.t < 2.5).map(x => x.type).join('>') || 'none'; causes[c] = (causes[c] || 0) + 1; } else r.push({ type: e.type, t: sim.time }); });
  sim.bus.on('carCrash', e => { for (const c of [e.a, e.b]) recent[c.id].push({ type: 'crash' + (e.strength > 10 ? '!' : ''), t: sim.time }); });
  sim.bus.on('ballHit', e => { hits[e.car.id]++; recent[e.car.id].push({ type: 'hit', t: sim.time }); });
  sim.bus.on('carWall', e => { if (e.strength > 8) recent[e.car.id].push({ type: 'wall', t: sim.time }); });
  sim.match.startMatch();
  run(sim, 150, (s) => { if (s.match.state === 'PLAYING') brains.forEach((b, k) => states[k][b.state] = (states[k][b.state] || 0) + 1); });
  const pct = o => Object.entries(o).map(([k, v]) => `${k}:${(v / Object.values(o).reduce((a, b) => a + b) * 100).toFixed(0)}`).join(' ');
  console.log(`seed ${seed}: score ${sim.match.score.blue}-${sim.match.score.orange} ${sim.match.state} hits ${hits} | recover causes`, JSON.stringify(causes));
  console.log('   blue', pct(states[0]), '| orange', pct(states[1]));
}
