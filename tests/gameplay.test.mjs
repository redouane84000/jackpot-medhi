// Tests de jeu complets : IA, match entier, relance, indépendance vis-à-vis des FPS.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeSim, forcePlaying, run, STATE } from './helpers.mjs';
import { BotBrain } from '../src/ai/BotController.js';
import { VehicleController } from '../src/vehicles/VehicleController.js';
import { FixedStepLoop } from '../src/core/GameLoop.js';

test('T16 — le bot conduit, se déplace et frappe le ballon', async () => {
  const sim = await makeSim({}, { seed: 5 });
  forcePlaying(sim);
  sim.cars[0].reset({ x: -30, y: 0.78, z: -48 }, 0);                 // joueur immobile dans un coin
  sim.cars[1].reset({ x: 20, y: 0.78, z: 35 }, Math.PI);
  sim.ball.reset(-8, 1.5, -6);
  const brain = new BotBrain(sim.C); sim.setController(1, new VehicleController(brain));
  let hits = 0, maxSpeed = 0; const states = new Set();
  sim.bus.on('ballHit', e => { if (e.car === sim.cars[1]) hits++; });
  run(sim, 30, (s) => { maxSpeed = Math.max(maxSpeed, s.cars[1].speed); states.add(brain.state); if (s.match.state !== STATE.PLAYING && s.match.state !== STATE.GOAL_SCORED) forcePlaying(s); if (!s.ball.active) s.ball.reset(0, 1.5, 0); });
  assert.ok(maxSpeed > 12, `vitesse max ${maxSpeed}`);
  assert.ok(hits >= 3, `${hits} frappes`);
  assert.ok(states.size >= 2, [...states].join());
});

test('T17/T18 — un match IA contre IA se termine normalement, puis une nouvelle partie se relance', async () => {
  const sim = await makeSim({ MATCH_DURATION: 45 }, { seed: 2 });
  const brains = [new BotBrain(sim.C), new BotBrain(sim.C)];
  brains.forEach((b, i) => sim.setController(i, new VehicleController(b)));
  let ended = null; sim.bus.on('matchEnd', e => ended = e);
  sim.match.startMatch();
  let t = 0; while (!ended && t < 600) { run(sim, 1); t++; }
  assert.ok(ended, 'le match se termine');
  assert.equal(sim.match.state, STATE.MATCH_FINISHED);
  assert.notEqual(sim.match.score.blue, sim.match.score.orange);
  assert.equal(ended.winner, sim.match.score.blue > sim.match.score.orange ? 'blue' : 'orange');
  sim.match.startMatch();
  run(sim, sim.C.RESET_DURATION + sim.C.KICKOFF_COUNTDOWN + sim.C.KICKOFF_CLOCK_DELAY + 0.2);
  assert.equal(sim.match.state === STATE.PLAYING || sim.match.state === STATE.GOAL_SCORED, true, sim.match.state);
  assert.deepEqual(Object.values(sim.match.score).reduce((a, b) => a + b) <= 1, true);
});

test('T15 — une baisse de FPS ne modifie ni la physique ni les règles (simulation déterministe)', async () => {
  async function play(frameDts) {
    const sim = await makeSim({ MATCH_DURATION: 60 }, { seed: 9 });
    const brains = [new BotBrain(sim.C), new BotBrain(sim.C)];
    brains.forEach((b, i) => sim.setController(i, new VehicleController(b)));
    sim.match.startMatch();
    const loop = new FixedStepLoop(sim.C.PHYSICS_DT, sim.C.MAX_STEPS_PER_FRAME);
    let k = 0, wall = 0;
    while (wall < 20 - 1e-9) { const d = Math.min(frameDts[k++ % frameDts.length], 20 - wall); wall += d; loop.advance(d, () => sim.step()); }
    const p = sim.ball.position, c = sim.cars[0].body.translation();
    return { steps: sim.steps, clock: sim.match.clock, state: sim.match.state, score: { ...sim.match.score }, ball: [p.x, p.y, p.z], car: [c.x, c.y, c.z] };
  }
  const fast = await play([1 / 144]);
  const slow = await play([1 / 20]);
  const jerky = await play([1 / 60, 1 / 30, 1 / 90, 1 / 15, 1 / 50]);
  for (const other of [slow, jerky]) {
    assert.ok(Math.abs(other.steps - fast.steps) <= 1, `pas : ${fast.steps} vs ${other.steps}`);
    assert.ok(Math.abs(other.clock - fast.clock) <= 1 / 120 + 1e-9, `chrono : ${fast.clock} vs ${other.clock}`);
  }
  // À nombre de pas égal, l'état est identique au bit près
  const a = await play([1 / 120]), b = await play([1 / 40]);
  assert.equal(a.steps, b.steps);
  assert.deepEqual(a.ball, b.ball); assert.deepEqual(a.car, b.car); assert.deepEqual(a.score, b.score);
});
