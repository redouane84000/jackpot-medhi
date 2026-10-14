import { makeSim, forcePlaying, scripted, run } from '../tests/helpers.mjs';
const sim = await makeSim(); forcePlaying(sim);
sim.cars[1].reset({ x: 28, y: 0.78, z: 45 }, 0); sim.ball.reset(-25, 1.5, 40);
const car = sim.cars[0]; car.reset({ x: 0, y: 0.78, z: -40 }, 0); run(sim, 0.5);
let press = 0;
sim.setController(0, scripted(() => ({ jump: (press++ % 20) < 3 })));
sim.bus.on('car', e => console.log(sim.time.toFixed(3), e.type, 'y', car.body.translation().y.toFixed(2), 'vy', car.body.linvel().y.toFixed(2), 'n', car.grounded, 'jumped', car.jumped, 'jt', car.jumpTime.toFixed(2), 'second', car.secondUsed));
run(sim, 4, (s, i) => { if (i % 24 === 0) console.log('   t', s.time.toFixed(2), 'y', car.body.translation().y.toFixed(2), 'vy', car.body.linvel().y.toFixed(2), 'n', car.grounded, 'up', (1 - 2 * (car.body.rotation().x ** 2 + car.body.rotation().z ** 2)).toFixed(2)); });
