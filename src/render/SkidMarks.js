import * as THREE from 'three';

/**
 * Traces de gomme au sol : un tampon circulaire de segments (quads) déposés sous les roues qui glissent
 * (dérapage, freinage appuyé, patinage au démarrage). Elles s'estompent en une dizaine de secondes.
 */
export class SkidMarks {
  constructor(scene, { small = false } = {}) {
    const N = this.N = small ? 700 : 1600;
    this.pos = new Float32Array(N * 4 * 3); this.info = new Float32Array(N * 4 * 2);
    const idx = new Uint32Array(N * 6);
    for (let i = 0; i < N; i++) idx.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3], i * 6);
    const g = this.geo = new THREE.BufferGeometry();
    this.posAttr = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.infoAttr = new THREE.BufferAttribute(this.info, 2).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.posAttr); g.setAttribute('aInfo', this.infoAttr); g.setIndex(new THREE.BufferAttribute(idx, 1));
    this.U = { uTime: { value: 0 } };
    const m = new THREE.Mesh(g, new THREE.ShaderMaterial({ uniforms: this.U, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
      vertexShader: 'attribute vec2 aInfo; varying float vA; uniform float uTime; void main(){ float age = uTime - aInfo.x; vA = aInfo.y * (1.0 - smoothstep(5.0, 14.0, age)); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'varying float vA; void main(){ if (vA <= 0.002) discard; gl_FragColor = vec4(vec3(.012, .013, .012), vA); }' }));
    m.frustumCulled = false; m.renderOrder = 1; scene.add(m);
    this.cur = 0; this.t = 0; this.prev = new Map();
  }

  clear() { this.info.fill(0); this.infoAttr.needsUpdate = true; this.prev.clear(); }

  update(ci, car, dt) {
    if (ci === 0) { this.t += dt; this.U.uTime.value = this.t; }
    for (let k = 0; k < 4; k++) {
      const w = car.wheels[k], key = ci * 4 + k;
      const sliding = w.contact && car.speed > 3 && (w.slip > 3.2 || (car.braking && car.speed > 9 && k < 2));
      if (!sliding) { this.prev.delete(key); continue; }
      const p = w.point, pr = this.prev.get(key);
      if (!pr) { this.prev.set(key, { x: p.x, z: p.z, a: 0 }); continue; }
      const dx = p.x - pr.x, dz = p.z - pr.z, L = Math.hypot(dx, dz);
      if (L < 0.3) continue;
      if (L > 3) { this.prev.set(key, { x: p.x, z: p.z, a: 0 }); continue; }
      const sx = -dz / L * 0.14, sz = dx / L * 0.14, y = 0.012;
      const a = Math.min(0.75, 0.25 + (w.slip - 3) * 0.06);
      const i = this.cur; this.cur = (this.cur + 1) % this.N;
      this.pos.set([pr.x - sx, y, pr.z - sz, pr.x + sx, y, pr.z + sz, p.x + sx, y, p.z + sz, p.x - sx, y, p.z - sz], i * 12);
      this.info.set([this.t, pr.a, this.t, pr.a, this.t, a, this.t, a], i * 8);
      this.prev.set(key, { x: p.x, z: p.z, a });
      this.posAttr.addUpdateRange(i * 12, 12); this.infoAttr.addUpdateRange(i * 8, 8);
      this.posAttr.needsUpdate = true; this.infoAttr.needsUpdate = true;
    }
  }
}
