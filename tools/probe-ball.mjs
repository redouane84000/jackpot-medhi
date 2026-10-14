import { makeSim, forcePlaying, scripted, run } from '../tests/helpers.mjs';
const sim = await makeSim();
forcePlaying(sim);
const [car, car2] = sim.cars, ball = sim.ball;
car2.reset({ x: 30, y: 0.78, z: 45 }, 0);
// 1) chute et rebonds
car.reset({ x: -30, y: 0.78, z: -45 }, 0);
ball.reset(0, 12, 0);
let peaks = [], lastVy = 0, minY = 99;
run(sim, 8, () => { const v = ball.velocity, p = ball.position; minY = Math.min(minY, p.y); if (lastVy > 0 && v.y <= 0) peaks.push(+p.y.toFixed(2)); lastVy = v.y; });
console.log('drop: peaks', peaks.slice(0, 6).join(' '), 'minY', minY.toFixed(3), 'final', ball.position.y.toFixed(3));
// 2) frappe frontale à pleine vitesse
ball.reset(0, 1.5, 0); car.reset({ x: 0, y: 0.78, z: -40 }, 0);
sim.setController(0, scripted(() => ({ throttle: 1 })));
let hitAt = null; let carV = 0;
sim.bus.on('ballHit', e => { if (!hitAt) { hitAt = sim.time; carV = car.fwdSpeed; } });
const t0 = sim.time; run(sim, 3.2);
let bv = ball.velocity; console.log('front hit: car speed at hit', carV.toFixed(1), 'ball vel', bv.x.toFixed(2), bv.y.toFixed(2), bv.z.toFixed(2), 'car after', car.fwdSpeed.toFixed(1));
// 3) frappe décalée (coin gauche de la voiture) → diagonale
ball.reset(1.2, 1.5, 0); car.reset({ x: 0, y: 0.78, z: -30 }, 0); hitAt = null;
run(sim, 2.6); bv = ball.velocity; console.log('offset hit (ball on left of car axis): ball vel', bv.x.toFixed(2), bv.y.toFixed(2), bv.z.toFixed(2));
// 4) voiture arrivant de gauche (direction +X)
ball.reset(0, 1.5, 0); car.reset({ x: -30, y: 0.78, z: 0 }, Math.PI / 2);
run(sim, 2.6); bv = ball.velocity; console.log('from left (+X): ball vel', bv.x.toFixed(2), bv.y.toFixed(2), bv.z.toFixed(2));
// 5) ballon en l'air frappé par-dessous (saut)
ball.reset(0, 3.4, 0); car.reset({ x: 0, y: 0.78, z: -12 }, 0);
let jumpNow = false; sim.setController(0, scripted((s, c) => ({ throttle: 1, jump: jumpNow })));
run(sim, 6, (s) => { const p = car.body.translation(); jumpNow = p.z > -4.5 && p.z < -3.5; if (s.ball.position.y < 1.6) {} });
console.log('ball after under-hit: max y reached?');
// 6) rebond sur mur à 60 m/s (pas de traversée)
sim.setController(0, null); car.reset({ x: -30, y: 0.78, z: -45 }, 0);
ball.reset(25, 3, 0); ball.body.setLinvel({ x: 60, y: 0, z: 0 }, true);
let maxX = 0; run(sim, 1.5, () => { maxX = Math.max(maxX, ball.position.x); });
console.log('wall bounce: max x', maxX.toFixed(2), '(mur à', sim.layout.hx, ') vx après', ball.velocity.x.toFixed(1));
// 7) ballon tiré dans le fond d'une cage à 60 m/s (pas de traversée du filet)
ball.reset(0, 2, 40); ball.body.setLinvel({ x: 0, y: 0, z: 60 }, true);
let maxZ = 0; run(sim, 1.5, () => { maxZ = Math.max(maxZ, ball.position.z); });
console.log('goal net: max z', maxZ.toFixed(2), '(fond de cage à', sim.layout.hz + sim.C.GOAL_DEPTH, ') goals scored', sim.match.score);
// 8) tir sur le plafond
ball.reset(0, 10, 0); ball.body.setLinvel({ x: 0, y: 60, z: 0 }, true); let maxY = 0; run(sim, 2, () => { maxY = Math.max(maxY, ball.position.y); });
console.log('ceiling: max y', maxY.toFixed(2), '(plafond', sim.C.ARENA_CEILING, ')');
