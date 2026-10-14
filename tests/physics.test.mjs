// Tests physiques réels (Rapier) : conduite, roues, sol, ballon, collisions, murs, cages, saut, boost.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeSim, forcePlaying, scripted, run, yawOf, upY, STATE } from './helpers.mjs';

async function drivingSim() {
  const sim = await makeSim();
  forcePlaying(sim);
  sim.cars[1].reset({ x: 28, y: 0.78, z: 45 }, 0);
  sim.ball.reset(-25, 1.5, 40);
  const car = sim.cars[0]; car.reset({ x: 0, y: 0.78, z: -40 }, 0);
  run(sim, 0.5);
  return { sim, car };
}

test('T1 — la voiture accélère progressivement', async () => {
  const { sim, car } = await drivingSim();
  sim.setController(0, scripted(() => ({ throttle: 1 })));
  const speeds = []; for (let i = 0; i < 3; i++) { run(sim, 1); speeds.push(car.fwdSpeed); }
  assert.ok(speeds[0] > 6 && speeds[0] < speeds[1] && speeds[1] < speeds[2], speeds.join());
  assert.ok(speeds[2] > 20 && speeds[2] <= sim.C.CAR_MAX_SPEED + 0.5, speeds.join());
  assert.ok(car.body.translation().z > -10, 'la voiture a avancé');
});

test('T2 — la voiture freine sans passer instantanément en marche arrière', async () => {
  const { sim, car } = await drivingSim();
  sim.setController(0, scripted(() => ({ throttle: 1 }))); run(sim, 3);
  const v0 = car.fwdSpeed; assert.ok(v0 > 20);
  sim.setController(0, scripted(() => ({ throttle: -1 })));
  let prev = car.fwdSpeed, maxJump = 0, stopT = null;
  run(sim, 4, (s, i) => { maxJump = Math.max(maxJump, Math.abs(car.fwdSpeed - prev)); prev = car.fwdSpeed; if (stopT === null && car.fwdSpeed < 0.5) stopT = i * s.C.PHYSICS_DT; });
  assert.ok(stopT !== null && stopT < 2, `arrêt en ${stopT}s`);
  assert.ok(maxJump < (sim.C.CAR_BRAKE_DECEL + 8) * sim.C.PHYSICS_DT, `variation max par pas ${maxJump}`);
  assert.ok(car.fwdSpeed < -5 && car.fwdSpeed >= -sim.C.CAR_REVERSE_MAX_SPEED - 0.5, `marche arrière ${car.fwdSpeed}`);
});

test('T3 — les roues tournent dans le sens du déplacement, les roues avant braquent', async () => {
  const { sim, car } = await drivingSim();
  sim.setController(0, scripted(() => ({ throttle: 1 }))); run(sim, 1);
  const s0 = car.wheels.map(w => w.spin); run(sim, 0.5);
  car.wheels.forEach((w, i) => assert.ok(w.spinVel > 0 && w.spin > s0[i], 'rotation vers l’avant'));
  const v = car.fwdSpeed; assert.ok(Math.abs(car.wheels[0].spinVel * sim.C.WHEEL_RADIUS - v) < 1.5, 'rotation liée au déplacement réel');
  sim.setController(0, scripted(() => ({ throttle: -1 }))); run(sim, 3);
  car.wheels.forEach(w => assert.ok(w.spinVel < 0, 'rotation inverse en marche arrière'));
  sim.setController(0, scripted(() => ({ steer: 1 }))); run(sim, 0.4);
  assert.ok(car.steer > 0.1, 'braquage à gauche');
  sim.setController(0, scripted(() => ({ steer: -1 }))); run(sim, 0.6);
  assert.ok(car.steer < -0.1, 'braquage à droite');
});

test('T4 — la direction modifie réellement la trajectoire (gauche et droite)', async () => {
  for (const dir of [1, -1]) {
    const { sim, car } = await drivingSim();
    sim.setController(0, scripted(() => ({ throttle: 1 }))); run(sim, 1);
    sim.setController(0, scripted(() => ({ throttle: 1, steer: dir }))); run(sim, 1);
    const yaw = yawOf(car.body.rotation()), x = car.body.translation().x;
    assert.ok(dir > 0 ? yaw > 0.5 && x > 1 : yaw < -0.5 && x < -1, `dir ${dir}: yaw ${yaw} x ${x}`);
  }
});

test('T4b — le braquage est plus serré à basse vitesse', async () => {
  const { sim, car } = await drivingSim();
  sim.setController(0, scripted(() => ({ steer: 1 }))); run(sim, 1);
  const lowMax = car.steer;
  sim.setController(0, scripted(() => ({ throttle: 1 }))); run(sim, 3);
  sim.setController(0, scripted(() => ({ throttle: 1, steer: 1 }))); run(sim, 1);
  assert.ok(car.steer < lowMax * 0.6, `${car.steer} vs ${lowMax}`);
});

test('T5 — ni la voiture ni le ballon ne traversent le sol (20 s de conduite agitée)', async () => {
  const { sim, car } = await drivingSim();
  sim.ball.reset(0, 8, -20);
  sim.setController(0, scripted((s) => { const t = s.time; return { throttle: Math.sin(t * 0.7) > -0.3 ? 1 : -1, steer: Math.sin(t * 1.3), boost: Math.sin(t * 0.5) > 0.6, jump: (t % 2.3) < 0.15, handbrake: Math.sin(t * 2.1) > 0.8 }; }));
  let minCar = 99, minBall = 99;
  run(sim, 20, (s) => { minCar = Math.min(minCar, car.body.translation().y); minBall = Math.min(minBall, s.ball.position.y); });
  assert.ok(minCar > 0.25, `voiture y min ${minCar}`);
  // Une compression de contact de quelques centimètres à l'impact est normale ; une traversée ferait tomber y bien plus bas
  assert.ok(minBall > sim.C.BALL_RADIUS - 0.15, `ballon y min ${minBall}`);
});

test('T6/T7 — le ballon tombe sous la gravité et rebondit en perdant de l’énergie', async () => {
  const sim = await makeSim(); sim.match.state = STATE.MENU;
  sim.cars.forEach((c, i) => c.reset({ x: 25 * (i ? 1 : -1), y: 0.78, z: 40 }, 0));
  sim.ball.reset(0, 11.5, 0);
  run(sim, 0.5);
  const expected = 11.5 - 0.5 * sim.C.GRAVITY * 0.25;
  assert.ok(Math.abs(sim.ball.position.y - expected) < 0.2, `y=${sim.ball.position.y} attendu ${expected}`);
  const peaks = []; let lastVy = 0;
  run(sim, 6, (s) => { const v = s.ball.velocity; if (lastVy > 0 && v.y <= 0) peaks.push(s.ball.position.y); lastVy = v.y; });
  assert.ok(peaks.length >= 3, 'plusieurs rebonds');
  assert.ok(peaks[0] < 11.5 && peaks[0] > 3 && peaks[1] < peaks[0] && peaks[2] < peaks[1], peaks.join());
});

test('T8 — le ballon réagit physiquement à l’impact (frontal, décalé, latéral)', async () => {
  const cases = [
    { name: 'frontal', ball: [0, 1.5, 0], car: [0, -30], yaw: 0, check: v => v.z > 15 && Math.abs(v.x) < 2 },
    { name: 'décalé à gauche → diagonale', ball: [1.3, 1.5, 0], car: [0, -30], yaw: 0, check: v => v.z > 12 && v.x > 3 },
    { name: 'voiture venant de la gauche → ballon vers la droite de l’écran (+X)', ball: [0, 1.5, 0], car: [-30, 0], yaw: Math.PI / 2, check: v => v.x > 15 && Math.abs(v.z) < 2 },
  ];
  for (const c of cases) {
    const sim = await makeSim(); forcePlaying(sim);
    sim.cars[1].reset({ x: 28, y: 0.78, z: 45 }, 0);
    sim.ball.reset(...c.ball); sim.cars[0].reset({ x: c.car[0], y: 0.78, z: c.car[1] }, c.yaw);
    sim.setController(0, scripted(() => ({ throttle: 1 })));
    let carHitSpeed = null; sim.bus.on('ballHit', () => { if (carHitSpeed === null) carHitSpeed = sim.cars[0].speed; });
    let vAfter = null, n = 0; run(sim, 4, (s) => { if (carHitSpeed !== null && !vAfter && ++n > 6) vAfter = { ...s.ball.velocity }; });
    assert.ok(carHitSpeed > 10, `${c.name}: contact détecté`);
    const v = vAfter;
    assert.ok(c.check(v), `${c.name}: v=(${v.x.toFixed(1)}, ${v.y.toFixed(1)}, ${v.z.toFixed(1)})`);
  }
});

test('T8b — une frappe par-dessous fait décoller le ballon', async () => {
  const sim = await makeSim(); forcePlaying(sim);
  sim.cars[1].reset({ x: 28, y: 0.78, z: 45 }, 0);
  sim.ball.reset(0, 3.1, 0); sim.ball.body.setGravityScale(0, true);   // ballon maintenu en l'air
  const car = sim.cars[0]; car.reset({ x: 0, y: 0.78, z: -14 }, 0);
  let jumped = false;
  sim.setController(0, scripted((s, c) => { const z = c.body.translation().z; const j = z > -5.2 && !jumped; if (j && c.jumped) jumped = true; return { throttle: 1, jump: j }; }));
  let maxVy = 0; run(sim, 3, (s) => { maxVy = Math.max(maxVy, s.ball.velocity.y); });
  assert.ok(maxVy > 3, `vitesse verticale max du ballon ${maxVy}`);
});

test('T9 — le ballon rebondit sur les murs sans les traverser, même à vitesse max', async () => {
  const sim = await makeSim(); sim.match.state = STATE.MENU;
  sim.cars.forEach((c, i) => c.reset({ x: 0, y: 0.78, z: i ? 45 : -45 }, 0));
  const L = sim.layout;
  sim.ball.reset(20, 3, 0); sim.ball.body.setLinvel({ x: 60, y: 0, z: 0 }, true);
  let maxX = 0; run(sim, 1, (s) => { maxX = Math.max(maxX, s.ball.position.x); });
  // À 60 m/s le ballon parcourt 0,5 m par pas : une pénétration d'au plus un pas est tolérée, jamais une traversée
  assert.ok(maxX < L.hx - sim.C.BALL_RADIUS + 0.5, `x max ${maxX}`);
  assert.ok(sim.ball.velocity.x < -10, 'rebond');
  // Tirs dans toutes les directions : le ballon reste toujours dans l'enceinte
  for (let k = 0; k < 12; k++) {
    const a = k / 12 * Math.PI * 2;
    sim.ball.reset(0, 4, 0); sim.ball.body.setLinvel({ x: Math.cos(a) * 60, y: 25 * Math.sin(a * 3), z: Math.sin(a) * 60 }, true);
    run(sim, 2, (s) => { const p = s.ball.position; assert.ok(Math.abs(p.x) < L.hx && Math.abs(p.z) < L.hz + sim.C.GOAL_DEPTH && p.y < sim.C.ARENA_CEILING && p.y > 1.3, `sortie ${JSON.stringify(p)}`); });
  }
});

test('T10 — le ballon ne traverse pas le fond ni les côtés de la cage', async () => {
  const sim = await makeSim(); sim.match.state = STATE.MENU;   // pas de validation de but : on teste la géométrie
  sim.cars.forEach((c, i) => c.reset({ x: 25 * (i ? 1 : -1), y: 0.78, z: 0 }, 0));
  const L = sim.layout, back = L.hz + sim.C.GOAL_DEPTH - sim.C.BALL_RADIUS;
  for (const [vx, vy, vz] of [[0, 0, 60], [12, 0, 55], [-12, 4, 55], [0, 10, 50]]) {
    sim.ball.reset(0, 2, 38); sim.ball.body.setLinvel({ x: vx, y: vy, z: vz }, true);
    let maxZ = 0, maxAbsX = 0;
    run(sim, 1.5, (s) => { const p = s.ball.position; maxZ = Math.max(maxZ, p.z); if (p.z > L.hz) maxAbsX = Math.max(maxAbsX, Math.abs(p.x)); });
    assert.ok(maxZ < back + 0.5, `z max ${maxZ} (fond ${back})`);
    assert.ok(maxAbsX < sim.C.GOAL_WIDTH / 2 - sim.C.BALL_RADIUS + 0.5, `x max dans la cage ${maxAbsX}`);
    assert.ok(sim.ball.position.z < L.hz + sim.C.GOAL_DEPTH - sim.C.BALL_RADIUS + 0.05, 'le ballon reste dans la cage');
  }
});

test('T11/T12/T13 — but physique : +1 exactement, puis ballon et voitures replacés sans vitesse', async () => {
  const sim = await makeSim({}, { seed: 11 });
  sim.match.startMatch(); run(sim, sim.C.RESET_DURATION + sim.C.KICKOFF_COUNTDOWN + 0.1);
  assert.equal(sim.match.state, STATE.KICKOFF);
  sim.match.notifyBallTouched();
  sim.cars.forEach((c, i) => c.reset({ x: 25 * (i ? 1 : -1), y: 0.78, z: 0 }, 0));
  sim.ball.reset(0, 1.5, 40); sim.ball.body.setLinvel({ x: 0, y: 0, z: 25 }, true);
  let goals = 0; sim.bus.on('goal', () => goals++);
  run(sim, 2);
  assert.equal(goals, 1); assert.deepEqual(sim.match.score, { blue: 1, orange: 0 });
  assert.equal(sim.match.state, STATE.GOAL_SCORED);
  let guard = 0; while (sim.match.state !== STATE.RESETTING && guard++ < 2000) sim.step();
  assert.equal(sim.match.state, STATE.RESETTING);
  run(sim, sim.C.RESET_DURATION * 0.5);
  const p = sim.ball.position, v = sim.ball.velocity;
  assert.ok(Math.hypot(p.x, p.z) < 0.05 && Math.abs(p.y - sim.C.BALL_SPAWN_HEIGHT) < 0.6, `ballon ${JSON.stringify(p)}`);
  assert.ok(Math.hypot(v.x, v.z) < 0.05, 'vitesse du ballon remise à zéro');
  const k = sim.layout.kickoffs[sim.kickoffIndex];
  for (const car of sim.cars) {
    const t = car.body.translation(), s = car.team === 'orange' ? 1 : -1;
    assert.ok(Math.abs(t.x - s * k.x) < 0.2 && Math.abs(t.z - s * k.z) < 0.2, `${car.team} replacée (${t.x.toFixed(2)}, ${t.z.toFixed(2)})`);
    assert.ok(car.speed < 0.5, `${car.team} immobile (${car.speed})`);
  }
  assert.equal(goals, 1, 'aucun but fantôme pendant la célébration');
});

test('saut : impulsion, retombée par gravité, pas de sauts infinis', async () => {
  const { sim, car } = await drivingSim();
  let press = 0;
  sim.setController(0, scripted(() => ({ jump: (press++ % 20) < 3 })));   // martèlement de la touche
  let maxY = 0; run(sim, 4, () => { maxY = Math.max(maxY, car.body.translation().y); });
  assert.ok(maxY > 1.4, `hauteur max ${maxY}`);
  assert.ok(maxY < 6, `pas de saut infini (${maxY})`);
  sim.setController(0, null); run(sim, 2);
  assert.ok(car.grounded >= 3, 'retombée au sol');
});

test('boost : poussée limitée par la réserve, recharge sur une pastille', async () => {
  const { sim, car } = await drivingSim();
  car.reset({ x: -17, y: 0.78, z: -45 }, 0); run(sim, 0.3);           // couloir sans pastille
  car.boost = 50;
  sim.setController(0, scripted(() => ({ boost: true }))); run(sim, 1);
  assert.ok(Math.abs(car.boost - (50 - sim.C.BOOST_CONSUMPTION)) < 1, `réserve ${car.boost}`);
  const v1 = car.fwdSpeed; assert.ok(v1 > 12, `poussée ${v1}`);
  run(sim, 1); assert.equal(car.boost, 0);
  sim.setController(0, null);
  const pad = sim.pads.pads.find(p => p.big);
  car.reset({ x: pad.x, y: 0.78, z: pad.z }, 0); car.boost = 0; run(sim, 0.1);
  assert.equal(car.boost, 100); assert.equal(pad.active, false);
  run(sim, sim.C.BOOST_PAD_BIG_RESPAWN + 0.1); assert.equal(pad.active, true);
});

test('saut à hauteur variable : un appui maintenu monte nettement plus haut qu’un appui bref', async () => {
  const heights = [];
  for (const hold of [1, 40]) {
    const { sim, car } = await drivingSim();
    let n = 0;
    sim.setController(0, scripted(() => ({ jump: n++ < hold })));
    let maxY = 0; run(sim, 2.5, () => { maxY = Math.max(maxY, car.body.translation().y); });
    heights.push(maxY);
  }
  assert.ok(heights[0] > 1.4, `appui bref ${heights[0]}`);
  assert.ok(heights[1] > heights[0] + 0.8, `appui maintenu ${heights[1]} vs bref ${heights[0]}`);
  assert.ok(heights[1] < 4.5, `hauteur plafonnée ${heights[1]}`);
});

test('modèles : TYPHON (V8) accélère plus fort et pèse plus lourd, VORTEX (V12) va plus vite en pointe', async () => {
  const res = {};
  for (const model of ['typhon', 'vortex']) {
    const sim = await makeSim({}, { models: [model, model] }); forcePlaying(sim);
    sim.cars[1].reset({ x: 28, y: 0.78, z: 45 }, 0); sim.ball.reset(-25, 1.5, 40);
    const car = sim.cars[0]; car.reset({ x: 0, y: 0.78, z: -45 }, 0); run(sim, 0.5);
    sim.setController(0, scripted(() => ({ throttle: 1 })));
    run(sim, 1); const v1 = car.fwdSpeed;
    run(sim, 4); const vTop = car.fwdSpeed;
    res[model] = { v1, vTop, mass: car.mass };
  }
  assert.ok(res.typhon.v1 > res.vortex.v1 + 0.6, `accélération ${JSON.stringify(res)}`);
  assert.ok(res.vortex.vTop > res.typhon.vTop + 0.6, `vitesse de pointe ${JSON.stringify(res)}`);
  assert.ok(res.typhon.mass > res.vortex.mass, 'masse');
});

test('frein à main : la voiture dérape puis retrouve progressivement son adhérence', async () => {
  const { sim, car } = await drivingSim();
  sim.setController(0, scripted(() => ({ throttle: 1 }))); run(sim, 2.2);
  let maxSlip = 0, yaw0 = yawOf(car.body.rotation());
  sim.setController(0, scripted(() => ({ throttle: 1, steer: 1, handbrake: true }))); run(sim, 0.6, () => { maxSlip = Math.max(maxSlip, car.slip); });
  const turned = Math.abs(yawOf(car.body.rotation()) - yaw0);
  assert.ok(maxSlip > 3, `glissement ${maxSlip}`);
  assert.ok(turned > 0.5, `rotation en dérapage ${turned}`);
  assert.ok(car.handGrip < 0.2, `adhérence arrière réduite ${car.handGrip}`);
  sim.setController(0, scripted(() => ({ throttle: 0.5 }))); run(sim, 0.12);
  const mid = car.handGrip; run(sim, 0.6);
  assert.ok(mid > 0.2 && mid < 0.9, `retour progressif ${mid}`);
  assert.ok(car.handGrip > 0.95, `adhérence revenue ${car.handGrip}`);
  assert.ok(upY(car.body.rotation()) > 0.9, 'la voiture reste sur ses roues');
});
