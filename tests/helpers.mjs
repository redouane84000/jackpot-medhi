import RAPIER from '@dimforge/rapier3d-compat';
import { Simulation } from '../src/core/Simulation.js';
import { CONFIG } from '../src/config.js';
import { STATE } from '../src/match/MatchManager.js';

let ready = null;
export async function makeSim(overrides = {}, opts = {}) {
  if (!ready) ready = RAPIER.init();
  await ready;
  const C = { ...CONFIG, ...overrides };
  return new Simulation(RAPIER, C, opts);
}
/** Met le match en jeu sans passer par le compte à rebours (tests de physique pure). */
export function forcePlaying(sim) { sim.match.state = STATE.PLAYING; sim.match.stateTime = 0; }
export const scripted = fn => ({ update: (sim, car, dt) => ({ throttle: 0, steer: 0, boost: false, jump: false, handbrake: false, airRoll: false, ...fn(sim, car, dt) }) });
export function run(sim, seconds, each) { const n = Math.round(seconds / sim.C.PHYSICS_DT); for (let i = 0; i < n; i++) { sim.step(); if (each) each(sim, i); } }
export const yawOf = q => Math.atan2(2 * (q.w * q.y + q.x * q.z), 1 - 2 * (q.y * q.y + q.x * q.x));
export const upY = q => 1 - 2 * (q.x * q.x + q.z * q.z);
export { STATE };
