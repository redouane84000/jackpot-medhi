// T19 — la caméra ne traverse ni les murs ni le sol, dans les deux modes, y compris dans les coins et en l'air.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { CameraRig } from '../src/camera/CameraRig.js';
import { buildArenaLayout, arenaSDF } from '../src/arena/ArenaLayout.js';
import { CONFIG } from '../src/config.js';

const L = buildArenaLayout(CONFIG);
const inside = p => {
  const inGoal = Math.abs(p.x) < CONFIG.GOAL_WIDTH / 2 && Math.abs(p.z) <= L.hz + CONFIG.GOAL_DEPTH && Math.abs(p.z) > L.hz - 1;
  return (arenaSDF(L, p.x, p.z) < 0 || inGoal) && p.y >= 0.6 && p.y < CONFIG.ARENA_CEILING;
};

test('T19 — caméra toujours dans l’enceinte et au-dessus du sol', () => {
  const positions = [
    [0, 0.76, 0, 0], [0, 0.76, -50, 0], [0, 0.76, 50, Math.PI], [31, 0.76, 0, -Math.PI / 2], [-31, 0.76, 0, Math.PI / 2],
    [28, 0.76, 46, Math.PI * 0.75], [-29, 0.76, -47, -Math.PI * 0.25], [0, 0.76, -55, 0], [0, 0.76, 55, Math.PI],
    [10, 9, 20, 1], [-30, 0.76, 49, Math.PI], [33, 0.76, -51, 0],
  ];
  for (const mode of ['car', 'ball']) {
    for (const [x, y, z, yaw] of positions) {
      const cam = new THREE.PerspectiveCamera(70, 16 / 9, 0.2, 2000);
      const rig = new CameraRig(cam, CONFIG, L); rig.mode = mode; rig.cineW = 0; rig.introT = 1;
      const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
      rig.yaw = yaw; rig.pos.set(x, y + 3, z);
      const ball = new THREE.Vector3(-x * 0.5, 3, -z * 0.5);
      for (let i = 0; i < 180; i++) rig.update(1 / 60, { state: 'PLAYING', stateTime: i / 60, carPos: new THREE.Vector3(x, y, z), carQuat: q, carSpeed: 20, carGrounded: y < 1, ballPos: ball, ballActive: true });
      assert.ok(inside(cam.position), `${mode} @(${x},${z}) → caméra (${cam.position.x.toFixed(2)}, ${cam.position.y.toFixed(2)}, ${cam.position.z.toFixed(2)})`);
    }
  }
});

test('T19b — en mode ballon, le ballon et la voiture restent devant la caméra', () => {
  const cam = new THREE.PerspectiveCamera(70, 16 / 9, 0.2, 2000);
  const rig = new CameraRig(cam, CONFIG, L); rig.mode = 'ball'; rig.cineW = 0; rig.introT = 1;
  const car = new THREE.Vector3(0, 0.76, -10), ball = new THREE.Vector3(12, 4, 15), q = new THREE.Quaternion();
  for (let i = 0; i < 240; i++) rig.update(1 / 60, { state: 'PLAYING', stateTime: 1, carPos: car, carQuat: q, carSpeed: 10, carGrounded: true, ballPos: ball, ballActive: true });
  cam.updateMatrixWorld(); const fr = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
  assert.ok(fr.containsPoint(ball), 'ballon visible'); assert.ok(fr.containsPoint(car), 'voiture visible');
});
