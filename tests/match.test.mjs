// Tests de la logique de match pure (machine à états, score, chronomètre, prolongation, pause).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MatchManager, STATE } from '../src/match/MatchManager.js';
import { EventBus } from '../src/core/EventBus.js';
import { CONFIG } from '../src/config.js';

const C = { ...CONFIG, MATCH_DURATION: 60 };
const DT = 1 / 120;
const advance = (m, sec, dt = DT) => { const n = Math.round(sec / dt); for (let i = 0; i < n; i++) m.update(dt); };
function toPlaying(m) {
  m.startMatch();
  assert.equal(m.state, STATE.RESETTING);
  advance(m, C.RESET_DURATION + 0.01); assert.equal(m.state, STATE.COUNTDOWN);
  advance(m, C.KICKOFF_COUNTDOWN + 0.01); assert.equal(m.state, STATE.KICKOFF);
  m.notifyBallTouched(); assert.equal(m.state, STATE.PLAYING);
}

test('flux MENU → RESETTING → COUNTDOWN → KICKOFF → PLAYING', () => {
  const m = new MatchManager(C, new EventBus());
  assert.equal(m.state, STATE.MENU);
  toPlaying(m);
});

test("le chrono ne tourne qu'en PLAYING (pas pendant le compte à rebours ni l'engagement)", () => {
  const m = new MatchManager(C, new EventBus());
  m.startMatch(); advance(m, 2); assert.equal(m.timeLeft, C.MATCH_DURATION);
  advance(m, 2); assert.equal(m.state, STATE.KICKOFF); assert.equal(m.timeLeft, C.MATCH_DURATION);
  m.notifyBallTouched(); advance(m, 10);
  assert.ok(Math.abs(m.timeLeft - (C.MATCH_DURATION - 10)) < 1e-6, `timeLeft=${m.timeLeft}`);
});

test("l'engagement démarre le chrono au plus tard après KICKOFF_CLOCK_DELAY", () => {
  const m = new MatchManager(C, new EventBus());
  m.startMatch(); advance(m, C.RESET_DURATION + C.KICKOFF_COUNTDOWN + 0.02);
  assert.equal(m.state, STATE.KICKOFF);
  advance(m, C.KICKOFF_CLOCK_DELAY + 0.02); assert.equal(m.state, STATE.PLAYING);
});

test('un but valide ajoute exactement un point, une seule fois', () => {
  const bus = new EventBus(); let goals = 0; bus.on('goal', () => goals++);
  const m = new MatchManager(C, bus); toPlaying(m);
  assert.equal(m.notifyGoal('orange'), true);           // ballon dans la cage orange → point bleu
  assert.deepEqual(m.score, { blue: 1, orange: 0 });
  assert.equal(m.state, STATE.GOAL_SCORED);
  assert.equal(m.notifyGoal('orange'), false);          // même passage signalé deux fois : refusé
  assert.equal(m.notifyGoal('blue'), false);
  assert.deepEqual(m.score, { blue: 1, orange: 0 }); assert.equal(goals, 1);
});

test('aucun but hors des états PLAYING / KICKOFF', () => {
  const m = new MatchManager(C, new EventBus());
  assert.equal(m.notifyGoal('blue'), false);            // MENU
  m.startMatch(); assert.equal(m.notifyGoal('blue'), false); // RESETTING
  advance(m, C.RESET_DURATION + 0.01); assert.equal(m.notifyGoal('blue'), false); // COUNTDOWN
  assert.deepEqual(m.score, { blue: 0, orange: 0 });
});

test('le chrono est gelé pendant la célébration puis le jeu se réinitialise', () => {
  const m = new MatchManager(C, new EventBus()); toPlaying(m);
  advance(m, 5); const t = m.timeLeft;
  m.notifyGoal('blue'); advance(m, C.GOAL_CELEBRATION - 0.05);
  assert.equal(m.state, STATE.GOAL_SCORED); assert.equal(m.timeLeft, t);
  advance(m, 0.1); assert.equal(m.state, STATE.RESETTING);
  advance(m, C.RESET_DURATION + 0.01); assert.equal(m.state, STATE.COUNTDOWN);
});

test('fin du temps réglementaire : victoire de l’équipe qui mène', () => {
  const bus = new EventBus(); let end = null; bus.on('matchEnd', e => end = e);
  const m = new MatchManager(C, bus); toPlaying(m);
  m.notifyGoal('blue'); advance(m, C.GOAL_CELEBRATION + C.RESET_DURATION + C.KICKOFF_COUNTDOWN + 0.05);
  m.notifyBallTouched(); advance(m, C.MATCH_DURATION + 1);
  assert.equal(m.state, STATE.MATCH_FINISHED); assert.equal(m.winner, 'orange'); assert.equal(end.winner, 'orange');
});

test('égalité : prolongation puis but en or', () => {
  const bus = new EventBus(); let ot = 0; bus.on('overtime', () => ot++);
  const m = new MatchManager(C, bus); toPlaying(m);
  advance(m, C.MATCH_DURATION + 0.05);
  assert.equal(m.state, STATE.OVERTIME); assert.equal(m.overtime, true); assert.equal(ot, 1);
  advance(m, C.OVERTIME_BANNER + C.RESET_DURATION + C.KICKOFF_COUNTDOWN + 0.05);
  assert.equal(m.state, STATE.KICKOFF); m.notifyBallTouched(); advance(m, 12);
  assert.ok(Math.abs(m.clock - 12) < 1e-6, 'le chrono compte vers le haut en prolongation');
  m.notifyGoal('blue');
  assert.equal(m.state, STATE.GOAL_SCORED); assert.equal(m.winner, 'orange');
  advance(m, C.GOAL_CELEBRATION + 0.05);
  assert.equal(m.state, STATE.MATCH_FINISHED); assert.deepEqual(m.score, { blue: 0, orange: 1 });
});

test('pause et reprise restaurent l’état, le chrono est gelé', () => {
  const m = new MatchManager(C, new EventBus()); toPlaying(m);
  advance(m, 3); const t = m.timeLeft;
  assert.equal(m.pause(), true); assert.equal(m.state, STATE.PAUSED);
  advance(m, 20); assert.equal(m.timeLeft, t);
  assert.equal(m.resume(), true); assert.equal(m.state, STATE.PLAYING);
  advance(m, 1); assert.ok(Math.abs(m.timeLeft - (t - 1)) < 1e-6);
  assert.equal(m.pause(), true); m.toMenu(); assert.equal(m.state, STATE.MENU);
});

test('une baisse de FPS ne change pas le chrono (pas variables, même durée totale)', () => {
  const a = new MatchManager(C, new EventBus()), b = new MatchManager(C, new EventBus());
  toPlaying(a); toPlaying(b);
  advance(a, 20, 1 / 120); advance(b, 20, 1 / 15);
  assert.ok(Math.abs(a.timeLeft - b.timeLeft) < 1e-6, `${a.timeLeft} vs ${b.timeLeft}`);
});

test('une nouvelle partie repart de zéro', () => {
  const m = new MatchManager(C, new EventBus()); toPlaying(m);
  m.notifyGoal('orange'); advance(m, C.GOAL_CELEBRATION + 0.1);
  m.startMatch();
  assert.deepEqual(m.score, { blue: 0, orange: 0 }); assert.equal(m.timeLeft, C.MATCH_DURATION); assert.equal(m.overtime, false);
  assert.equal(m.state, STATE.RESETTING);
});
