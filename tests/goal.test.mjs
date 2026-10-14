// Tests du détecteur de buts (franchissement complet de la sphère, une seule détection par passage).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GoalDetector } from '../src/match/GoalDetector.js';
import { buildArenaLayout } from '../src/arena/ArenaLayout.js';
import { CONFIG } from '../src/config.js';

const L = buildArenaLayout(CONFIG), R = CONFIG.BALL_RADIUS, hz = L.hz;
const at = (x, y, z) => ({ x, y, z });

test('centre sur la ligne : pas de but', () => {
  const g = new GoalDetector(L, CONFIG);
  assert.equal(g.update(at(0, 2, hz)), null);
  assert.equal(g.update(at(0, 2, hz + R - 0.01)), null);   // il manque 1 cm
});

test('sphère entièrement derrière la ligne, entre les montants : but détecté une seule fois', () => {
  const g = new GoalDetector(L, CONFIG);
  const hit = g.update(at(2, 2, hz + R + 0.01));
  assert.equal(hit?.team, 'orange');                        // cage défendue par l'équipe orange
  assert.equal(g.update(at(2, 2, hz + R + 0.5)), null);     // reste dedans : rien de plus
  assert.equal(g.update(at(2, 2, hz + 3)), null);
});

test('cage bleue en Z négatif', () => {
  const g = new GoalDetector(L, CONFIG);
  assert.equal(g.update(at(0, 1.5, -hz - R - 0.05))?.team, 'blue');
});

test('hors du cadre : à côté des montants ou au-dessus de la barre', () => {
  const g = new GoalDetector(L, CONFIG);
  assert.equal(g.update(at(CONFIG.GOAL_WIDTH / 2 + 0.5, 2, hz + R + 0.2)), null);
  assert.equal(g.update(at(0, CONFIG.GOAL_HEIGHT + 0.5, hz + R + 0.2)), null);
});

test("le passage est détecté de l'extérieur vers l'intérieur uniquement", () => {
  const g = new GoalDetector(L, CONFIG);
  assert.ok(g.update(at(0, 2, hz + R + 0.1)));
  assert.equal(g.update(at(0, 2, hz)), null);                // à cheval sur la ligne : toujours « dedans »
  assert.equal(g.update(at(0, 2, hz - R - 0.1)), null);      // ressorti entièrement
  assert.ok(g.update(at(0, 2, hz + R + 0.1)));               // nouveau passage : nouvelle détection
});
