import { makeSim, forcePlaying, scripted, run, yawOf, upY } from '../tests/helpers.mjs';
const sim = await makeSim();
forcePlaying(sim);
const car = sim.cars[0];
car.reset({ x: 0, y: 0.78, z: -40 }, 0);
sim.ball.reset(30, 1.5, 30);
sim.cars[1].reset({ x: 25, y: 0.78, z: 40 }, 0);
let phase = 'settle';
sim.setController(0, scripted((s) => phase === 'drive' ? { throttle: 1 } : phase === 'brake' ? { throttle: -1 } : phase === 'turn' ? { throttle: 1, steer: 1 } : {}));
const log = (tag) => { const p = car.body.translation(), v = car.body.linvel(), q = car.body.rotation(); console.log(tag.padEnd(10), 'pos', p.x.toFixed(2), p.y.toFixed(3), p.z.toFixed(2), 'speed', Math.hypot(v.x, v.z).toFixed(2), 'fwd', car.fwdSpeed.toFixed(2), 'upY', upY(q).toFixed(3), 'yaw', (yawOf(q) * 57.3).toFixed(1), 'wheels', car.grounded, 'lens', car.wheels.map(w => w.len.toFixed(3)).join(',')); };
run(sim, 1); log('settled');
phase = 'drive';
for (let i = 0; i < 6; i++) { run(sim, 0.5); log('drive' + (i + 1) * 0.5); }
phase = 'brake'; const z0 = car.body.translation().z;
let tStop = 0; run(sim, 4, (s, i) => { if (!tStop && car.fwdSpeed < 0.3) tStop = i * s.C.PHYSICS_DT; });
console.log('brake: stop time', tStop.toFixed(2), 'distance', (car.body.translation().z - z0).toFixed(1)); log('reverse');
phase = 'settle'; run(sim, 3); log('coast');
car.reset({ x: 0, y: 0.78, z: -30 }, 0); run(sim, 0.5);
phase = 'turn'; for (let i = 0; i < 6; i++) { run(sim, 0.5); log('turn' + (i + 1) * 0.5); }
