import * as THREE from 'three';
import { canvasTex, paintBillAtlas, paintCoin, rand, TAU } from './textures.js';

/**
 * Effets visuels : particules (boost, poussière, étincelles), explosion de but « jackpot »
 * (boule de feu, étoile, ondes de choc, pluie de pièces et de billets). Aucun effet n'agit sur la physique.
 */
const pick = a => a[(Math.random() * a.length) | 0];
const easeOut = (u, p = 3) => 1 - Math.pow(1 - Math.min(1, Math.max(0, u)), p);
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const randUnit = v => { const u = rand(-1, 1), a = rand(0, TAU), s = Math.sqrt(1 - u * u); return v.set(s * Math.cos(a), u, s * Math.sin(a)); };

export const PAL = {
  DUST: [[.2, .22, .17], [.16, .18, .14], [.24, .25, .2]],
  SMOKE: [[.22, .23, .25], [.18, .19, .21]],
  GOLD: [[1, .78, .3], [1, .88, .5], [1, .64, .16]],
  FIRE_BLUE: [[.35, .6, 1.4], [.6, .8, 1.5], [.9, .95, 1.4]],
  FIRE_ORANGE: [[1.4, .55, .12], [1.4, .8, .3], [1.3, .4, .08]],
  SPARK: [[1, .95, .8], [1, .85, .5]],
};

export class Effects {
  constructor(scene, { small = false } = {}) {
    this.scene = scene;
    const PM = this.PM = small ? 500 : 800;
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3)); g.setIndex([0, 1, 2, 0, 2, 3]);
    const A = (n, k) => new THREE.InstancedBufferAttribute(new Float32Array(n * k), k).setUsage(THREE.DynamicDrawUsage);
    this.iOff = A(PM, 3); this.iSize = A(PM, 1); this.iAlpha = A(PM, 1); this.iCol = A(PM, 3); this.iStr = A(PM, 4);
    g.setAttribute('iOff', this.iOff); g.setAttribute('iSize', this.iSize); g.setAttribute('iAlpha', this.iAlpha); g.setAttribute('iCol', this.iCol); g.setAttribute('iStr', this.iStr); g.instanceCount = PM;
    const mesh = new THREE.Mesh(g, new THREE.ShaderMaterial({ transparent: true, depthWrite: false,
      vertexShader: `attribute vec3 iOff; attribute float iSize; attribute float iAlpha; attribute vec3 iCol; attribute vec4 iStr;
        varying vec2 vQ; varying float vA; varying vec3 vC;
        void main(){
          vQ = position.xy; vA = iAlpha; vC = iCol;
          vec3 camR = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
          vec3 camU = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
          vec3 wp;
          if (iStr.w > .001 && dot(iStr.xyz, iStr.xyz) > 1e-6) {
            vec3 dir = normalize(iStr.xyz), vd = normalize(iOff - cameraPosition), side = normalize(cross(dir, vd));
            wp = iOff + side * position.x * iSize + dir * position.y * (iSize + iStr.w);
          } else wp = iOff + (camR * position.x + camU * position.y) * iSize;
          if (iAlpha <= 0.0) wp = vec3(0.0, -1000.0, 0.0);
          gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
        }`,
      fragmentShader: 'varying vec2 vQ; varying float vA; varying vec3 vC; void main(){ float d = length(vQ); if (d > 1.0) discard; gl_FragColor = vec4(vC, vA * smoothstep(1.0, 0.0, d)); }' }));
    mesh.frustumCulled = false; mesh.renderOrder = 6; scene.add(mesh);
    this.pP = new Float32Array(PM * 3); this.pV = new Float32Array(PM * 3); this.pL = new Float32Array(PM); this.pML = new Float32Array(PM);
    this.pS0 = new Float32Array(PM); this.pS1 = new Float32Array(PM); this.pA0 = new Float32Array(PM); this.pDr = new Float32Array(PM); this.pGr = new Float32Array(PM); this.pSt = new Float32Array(PM);
    this.cur = 0; this.colDirty = false;

    // ---------- Explosion de but ----------
    const fxVS = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';
    const fx = (frag, uniforms, order, additive = false) => { const me = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({ uniforms, transparent: true, depthWrite: false, vertexShader: fxVS, fragmentShader: frag, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending })); me.renderOrder = order; me.visible = false; me.frustumCulled = false; scene.add(me); return me; };
    this.fireball = fx(`uniform float uA; uniform vec3 uC; varying vec2 vUv; void main(){ vec2 p = vUv * 2.0 - 1.0; float r = length(p); if (r > 1.0) discard;
      float a = pow(1.0 - r * r, 1.6) * uA; vec3 c = mix(uC, vec3(1.0, .95, .75), smoothstep(.9, 0.0, r)); gl_FragColor = vec4(c, a); }`, { uA: { value: 0 }, uC: { value: new THREE.Color() } }, 9);
    this.starburst = fx(`uniform float uA, uRot; uniform vec3 uC; varying vec2 vUv; void main(){ vec2 p = vUv * 2.0 - 1.0; float r = length(p); if (r > 1.0) discard; float a = atan(p.y, p.x) + uRot;
      float rays = pow(abs(sin(a * 9.0)), 46.0) + .65 * pow(abs(sin(a * 14.0 + 1.3)), 70.0) + .45 * pow(abs(sin(a * 5.0 + .6)), 90.0);
      float fall = smoothstep(1.0, .05, r) * smoothstep(0.0, .06, r);
      gl_FragColor = vec4(mix(uC, vec3(1.0, .92, .6), smoothstep(.6, 0.0, r)), rays * fall * uA); }`, { uA: { value: 0 }, uRot: { value: 0 }, uC: { value: new THREE.Color() } }, 8, true);
    const ringFrag = `uniform float uA; uniform vec3 uC; varying vec2 vUv; void main(){ vec2 p = vUv * 2.0 - 1.0; float r = length(p); if (r > 1.0) discard;
      float a = smoothstep(.03, 0.0, abs(r - .92)) * uA + smoothstep(.92, .55, r) * .04 * uA; gl_FragColor = vec4(uC, a); }`;
    this.ring1 = fx(ringFrag, { uA: { value: 0 }, uC: { value: new THREE.Color() } }, 8);
    this.ring2 = fx(ringFrag, { uA: { value: 0 }, uC: { value: new THREE.Color(.95, .98, 1) } }, 8);
    this.groundRing = fx(ringFrag, { uA: { value: 0 }, uC: { value: new THREE.Color() } }, 3); this.groundRing.rotation.x = -Math.PI / 2;
    this.boom = null;

    // ---------- Pluie de pièces et de billets ----------
    const NB = this.NB = small ? 90 : 170, NC = this.NC = small ? 50 : 90;
    const billGeo = new THREE.PlaneGeometry(1.1, .55, 10, 1); billGeo.rotateX(-Math.PI / 2);
    const aBend = this.aBend = new THREE.InstancedBufferAttribute(new Float32Array(NB * 3), 3).setUsage(THREE.DynamicDrawUsage);
    const aVar = new THREE.InstancedBufferAttribute(new Float32Array(NB), 1); for (let i = 0; i < NB; i++) aVar.array[i] = i % 3 === 0 ? 1 : 0;
    billGeo.setAttribute('aBend', aBend); billGeo.setAttribute('aVar', aVar);
    const billMat = new THREE.MeshStandardMaterial({ map: canvasTex(paintBillAtlas()), side: THREE.DoubleSide, roughness: .9, envMapIntensity: .7, color: new THREE.Color('#c3d0bf') });
    this.timeU = { value: 0 };
    billMat.onBeforeCompile = s => {
      s.uniforms.uTime = this.timeU;
      s.vertexShader = 'uniform float uTime;\nattribute vec3 aBend;\nattribute float aVar;\n' + s.vertexShader
        .replace('#include <uv_vertex>', '#include <uv_vertex>\n vMapUv.y = vMapUv.y * .5 + aVar * .5;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          float bx = position.x / .55;
          transformed.y += (sin(bx * 2.6 + aBend.x + uTime * aBend.z) * .55 + bx * bx * .45) * aBend.y;`);
    };
    this.billsIM = new THREE.InstancedMesh(billGeo, billMat, NB); this.billsIM.castShadow = true; this.billsIM.frustumCulled = false; scene.add(this.billsIM);
    const gold = new THREE.Color().setRGB(1, .72, .27), goldEm = new THREE.Color().setRGB(.25, .15, .03);
    const face = new THREE.MeshStandardMaterial({ color: gold, emissive: goldEm, metalness: 1, roughness: .26, map: canvasTex(paintCoin(false)), bumpMap: canvasTex(paintCoin(true), { srgb: false }), bumpScale: 1.6, envMapIntensity: .8 });
    const side = new THREE.MeshStandardMaterial({ color: gold, emissive: goldEm, metalness: 1, roughness: .32 });
    this.coinsIM = new THREE.InstancedMesh(new THREE.CylinderGeometry(.19, .19, .04, 28), [side, face, face], NC); this.coinsIM.castShadow = true; this.coinsIM.frustumCulled = false; scene.add(this.coinsIM);
    const mk = n => Array.from({ length: n }, () => ({ p: new THREE.Vector3(), v: new THREE.Vector3(), q: new THREE.Quaternion(), w: new THREE.Vector3(), q0: new THREE.Quaternion(), q1: new THREE.Quaternion(), on: false, st: 0, t0: 0, life: 0 }));
    this.bills = mk(NB); this.coins = mk(NC);
    this.ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < NB; i++) this.billsIM.setMatrixAt(i, this.ZERO);
    for (let i = 0; i < NC; i++) this.coinsIM.setMatrixAt(i, this.ZERO);
    this._a = new THREE.Vector3(); this._b = new THREE.Vector3(); this._q = new THREE.Quaternion(); this._e = new THREE.Euler(0, 0, 0, 'YXZ'); this._m = new THREE.Matrix4(); this._s = new THREE.Vector3();
    this.t = 0;
  }

  emit(x, y, z, vx, vy, vz, life, s0, s1, a0, col, drag = 0, grav = 0, st = 0) {
    const i = this.cur; this.cur = (this.cur + 1) % this.PM; const i3 = i * 3;
    this.pP[i3] = x; this.pP[i3 + 1] = y; this.pP[i3 + 2] = z; this.pV[i3] = vx; this.pV[i3 + 1] = vy; this.pV[i3 + 2] = vz;
    this.pL[i] = this.pML[i] = life; this.pS0[i] = s0; this.pS1[i] = s1; this.pA0[i] = a0; this.pDr[i] = drag; this.pGr[i] = grav; this.pSt[i] = st;
    this.iCol.array[i3] = col[0]; this.iCol.array[i3 + 1] = col[1]; this.iCol.array[i3 + 2] = col[2]; this.colDirty = true;
  }

  /** Flamme et traînée de boost depuis un échappement (position monde, direction arrière). */
  boostPuff(p, back, vel, colors, intensity = 1) {
    this.emit(p.x, p.y, p.z, back.x * rand(6, 11) + vel.x * .6, back.y * 4 + rand(-.3, .5), back.z * rand(6, 11) + vel.z * .6, rand(.12, .22), rand(.16, .24) * intensity, rand(.28, .45) * intensity, .7, pick(colors), 3, -.2);
  }

  dust(x, z, n, s = 1) { for (let i = 0; i < n; i++) { randUnit(this._a); this.emit(x + this._a.x * .4, .15, z + this._a.z * .4, this._a.x * rand(1, 4), rand(.3, 1.4), this._a.z * rand(1, 4), rand(.6, 1.2), .2 * s, rand(.7, 1.3) * s, .3, pick(PAL.DUST), 2.2, -.1); } }

  sparks(p, n, speed = 9, colors = PAL.SPARK) { for (let i = 0; i < n; i++) { randUnit(this._a); const sp = rand(.3, 1) * speed; this.emit(p.x, p.y, p.z, this._a.x * sp, this._a.y * sp + 2, this._a.z * sp, rand(.25, .6), .05, .02, 1, pick(colors), 1.6, 7, .05); } }

  /** Explosion « jackpot » au point de but, aux couleurs de l'équipe qui marque. */
  goalExplosion(pos, teamRGB) {
    const c = new THREE.Color().setRGB(...teamRGB);
    this.boom = { p: pos.clone(), t: 0, c };
    this.fireball.material.uniforms.uC.value.copy(c).lerp(new THREE.Color(1, .8, .4), .35);
    this.starburst.material.uniforms.uC.value.copy(c).lerp(new THREE.Color(1, .85, .4), .5);
    this.ring1.material.uniforms.uC.value.copy(c).multiplyScalar(1.3);
    this.groundRing.material.uniforms.uC.value.copy(c).lerp(new THREE.Color(1, 1, 1), .4);
    const C_EX = pos;
    const fire = teamRGB[2] > teamRGB[0] ? PAL.FIRE_BLUE : PAL.FIRE_ORANGE;
    for (let i = 0; i < 260; i++) { randUnit(this._a); const sp = rand(5, 22); this.emit(C_EX.x + this._a.x * .5, C_EX.y + this._a.y * .5, C_EX.z + this._a.z * .5, this._a.x * sp, this._a.y * sp + 3, this._a.z * sp, rand(.8, 1.8), rand(.06, .12), .03, 1, pick(i % 3 ? PAL.GOLD : fire), 1.5, 5, .05); }
    for (let i = 0; i < 70; i++) { randUnit(this._a); const sp = rand(2, 7); this.emit(C_EX.x + this._a.x * rand(0, 1.5), C_EX.y + this._a.y * rand(0, 1.5), C_EX.z + this._a.z * rand(0, 1.5), this._a.x * sp, this._a.y * sp + 1, this._a.z * sp, rand(1.8, 3), rand(1, 1.8), rand(4, 6.5), .34, pick(PAL.SMOKE), 2, -.2); }
    for (let i = 0; i < 90; i++) { randUnit(this._a); const sp = rand(1, 9); this.emit(C_EX.x, C_EX.y, C_EX.z, this._a.x * sp, Math.abs(this._a.y) * sp + 2, this._a.z * sp, rand(1.8, 3.4), .07, .05, .9, pick(fire), 1, 1); }
    // Pièces et billets projetés hors de la cage, qui retombent sur le terrain
    const out = Math.sign(-pos.z) || 1;
    for (const b of this.bills) {
      randUnit(this._a); b.p.copy(C_EX).addScaledVector(this._a, rand(0, 1)); b.v.set(this._a.x * rand(3, 12), rand(8, 20), out * rand(6, 20) + this._a.z * 4);
      Object.assign(b, { on: true, st: 0, t0: this.t, ph: rand(0, TAU), om: rand(2.4, 3.8), sw: rand(1.2, 2.6), hd: rand(0, TAU), vt: rand(3.2, 4.4), yaw: rand(0, TAU), yr: rand(-1.4, 1.4), roll: rand(0, TAU), tumb: Math.random() < .3, pt: rand(0, TAU), pr: rand(-10, 10), life: rand(7, 9) });
      b.rr = b.tumb ? rand(4, 8) * (Math.random() < .5 ? -1 : 1) : rand(-12, 12);
    }
    for (const co of this.coins) { randUnit(this._a); co.p.copy(C_EX).addScaledVector(this._a, rand(0, .8)); co.v.set(this._a.x * rand(3, 13), rand(9, 22), out * rand(6, 22) + this._a.z * 4); randUnit(co.w).multiplyScalar(rand(8, 18)); randUnit(this._b); co.q.setFromAxisAngle(this._b, rand(0, TAU)); Object.assign(co, { on: true, st: 0, life: rand(7, 9) }); }
    this.moneyLive = true;
  }

  clearMoney() {
    for (const o of [...this.bills, ...this.coins]) o.on = false;
    this.jets = []; this.rockets = [];
    if (!this.moneyLive) return;
    this.moneyLive = false;
    for (let i = 0; i < this.NB; i++) this.billsIM.setMatrixAt(i, this.ZERO);
    for (let i = 0; i < this.NC; i++) this.coinsIM.setMatrixAt(i, this.ZERO);
    this.billsIM.instanceMatrix.needsUpdate = true; this.coinsIM.instanceMatrix.needsUpdate = true;
  }

  /**
   * Pyrotechnie de but : jets de flammes aux montants de la cage et feux d'artifice au-dessus du virage,
   * aux couleurs de l'équipe qui marque.
   */
  pyro(goalZ, gw, teamRGB) {
    const fire = teamRGB[2] > teamRGB[0] ? PAL.FIRE_BLUE : PAL.FIRE_ORANGE;
    this.jets = [-1, 1].flatMap(sx => [0, 0.45].map(d => ({ x: sx * (gw + 1.6), z: goalZ, t: -d, fire })));
    this.rockets = [];
    const out = -Math.sign(goalZ) || 1;
    for (let i = 0; i < 9; i++) this.rockets.push({ x: rand(-30, 30), z: goalZ + out * rand(-6, 6) - out * 8 + Math.sign(goalZ) * 18, y: 0, vy: rand(26, 34), t: -i * 0.22 - rand(0, 0.2), fire, burst: false, rgb: teamRGB });
  }

  _updatePyro(dt) {
    if (this.jets) for (const j of this.jets) {
      j.t += dt; if (j.t < 0 || j.t > 1.3) continue;
      const k = 1 - j.t / 1.3;
      for (let i = 0; i < 5; i++) this.emit(j.x + rand(-0.25, 0.25), 0.3, j.z + rand(-0.25, 0.25), rand(-0.8, 0.8), rand(14, 20) * (0.6 + 0.4 * k), rand(-0.8, 0.8), rand(0.35, 0.6), rand(0.35, 0.6), rand(1.2, 2.0), 0.85, pick(i % 2 ? j.fire : PAL.GOLD), 1.2, 4);
      if (Math.random() < 0.4) this.emit(j.x, 6 + rand(0, 3), j.z, rand(-1, 1), rand(1, 3), rand(-1, 1), rand(1.4, 2.4), 1.2, rand(3, 5), 0.18, pick(PAL.SMOKE), 0.6, -0.4);
    }
    if (this.rockets) for (const r of this.rockets) {
      r.t += dt; if (r.t < 0) continue;
      if (!r.burst) {
        r.vy -= 9.8 * dt; r.y += r.vy * dt;
        this.emit(r.x, r.y, r.z, rand(-0.5, 0.5), -2, rand(-0.5, 0.5), 0.5, 0.18, 0.05, 0.9, pick(PAL.GOLD), 1, 2);
        if (r.vy < 4) {
          r.burst = true;
          for (let i = 0; i < 70; i++) { randUnit(this._a); const sp = rand(8, 15); this.emit(r.x, r.y, r.z, this._a.x * sp, this._a.y * sp, this._a.z * sp, rand(1.1, 1.8), 0.22, 0.08, 1, pick(i % 3 ? r.fire : PAL.SPARK), 1.6, 3, 0.04); }
        }
      }
    }
  }

  update(dt, camera) {
    this.t += dt; this.timeU.value = this.t;
    this._updatePyro(dt);
    // Particules
    const PM = this.PM, off = this.iOff.array, sz = this.iSize.array, al = this.iAlpha.array, sr = this.iStr.array;
    for (let i = 0; i < PM; i++) {
      if (this.pL[i] <= 0) { al[i] = 0; continue; }
      this.pL[i] -= dt; if (this.pL[i] <= 0) { al[i] = 0; continue; }
      const i3 = i * 3, k = 1 - this.pL[i] / this.pML[i], dr = Math.exp(-this.pDr[i] * dt);
      this.pV[i3] *= dr; this.pV[i3 + 1] = this.pV[i3 + 1] * dr - this.pGr[i] * dt; this.pV[i3 + 2] *= dr;
      this.pP[i3] += this.pV[i3] * dt; this.pP[i3 + 1] += this.pV[i3 + 1] * dt; this.pP[i3 + 2] += this.pV[i3 + 2] * dt;
      if (this.pP[i3 + 1] < 0.03) { this.pP[i3 + 1] = 0.03; this.pV[i3 + 1] = Math.abs(this.pV[i3 + 1]) * .3; }
      off[i3] = this.pP[i3]; off[i3 + 1] = this.pP[i3 + 1]; off[i3 + 2] = this.pP[i3 + 2];
      sz[i] = this.pS0[i] + (this.pS1[i] - this.pS0[i]) * (1 - (1 - k) * (1 - k));
      al[i] = this.pA0[i] * Math.min(1, k * 10) * Math.pow(1 - k, 1.3);
      const i4 = i * 4;
      if (this.pSt[i] > 0) { sr[i4] = this.pV[i3]; sr[i4 + 1] = this.pV[i3 + 1]; sr[i4 + 2] = this.pV[i3 + 2]; sr[i4 + 3] = Math.hypot(this.pV[i3], this.pV[i3 + 1], this.pV[i3 + 2]) * this.pSt[i]; } else sr[i4 + 3] = 0;
    }
    this.iOff.needsUpdate = this.iSize.needsUpdate = this.iAlpha.needsUpdate = this.iStr.needsUpdate = true;
    if (this.colDirty) { this.iCol.needsUpdate = true; this.colDirty = false; }

    // Explosion
    const B = this.boom;
    const face = me => { me.position.copy(B.p); me.quaternion.copy(camera.quaternion); };
    if (B) {
      B.t += dt; const te = B.t;
      this.fireball.visible = te < .7; if (this.fireball.visible) { face(this.fireball); this.fireball.scale.setScalar(1.5 + 9 * easeOut(te / .45)); this.fireball.material.uniforms.uA.value = 1 - sstep(.05, .6, te); }
      this.starburst.visible = te < 1.1; if (this.starburst.visible) { face(this.starburst); this.starburst.scale.setScalar(3 + 22 * easeOut(te / .7, 2.5)); this.starburst.material.uniforms.uA.value = .7 * (1 - sstep(.08, .9, te)); this.starburst.material.uniforms.uRot.value = te * .4; }
      this.ring1.visible = te < .9; if (this.ring1.visible) { face(this.ring1); this.ring1.scale.setScalar(2 + 30 * easeOut(te / .8, 2.2)); this.ring1.material.uniforms.uA.value = 1 - sstep(.1, .85, te); }
      const t2 = te - .1; this.ring2.visible = t2 >= 0 && t2 < .9; if (this.ring2.visible) { face(this.ring2); this.ring2.scale.setScalar(2 + 22 * easeOut(t2 / .8, 2.2)); this.ring2.material.uniforms.uA.value = .8 * (1 - sstep(.1, .85, t2)); }
      this.groundRing.visible = te < 1.2; if (this.groundRing.visible) { this.groundRing.position.set(B.p.x, .06, B.p.z); this.groundRing.scale.setScalar(2 + 26 * easeOut(te / 1.1, 2)); this.groundRing.material.uniforms.uA.value = .8 * (1 - sstep(.1, 1.1, te)); }
      if (te > 1.3) this.boom = null;
    }

    // Billets et pièces : seulement pendant l'animation de but
    if (this.moneyLive) {
    const a = this._a, q = this._q, e = this._e, m = this._m, s = this._s;
    let live = false;
    for (let i = 0; i < this.NB; i++) {
      const b = this.bills[i];
      if (!b.on) { this.billsIM.setMatrixAt(i, this.ZERO); continue; }
      b.life -= dt; if (b.life <= 0) { b.on = false; this.billsIM.setMatrixAt(i, this.ZERO); continue; }
      live = true;
      if (b.st === 0) {
        const age = this.t - b.t0;
        if (age < .6) { b.v.y -= 9.8 * dt; b.v.multiplyScalar(Math.exp(-dt * .8)); }
        else {
          b.ph += b.om * dt; const sway = Math.sin(b.ph), dsw = Math.cos(b.ph);
          b.hd += b.yr * dt * .5; a.set(Math.cos(b.hd) * dsw * b.sw, -b.vt, Math.sin(b.hd) * dsw * b.sw);
          b.v.lerp(a, 1 - Math.exp(-dt * 1.6));
        }
        b.p.addScaledVector(b.v, dt);
        b.yaw += b.yr * dt; if (!b.tumb) b.rr *= Math.exp(-dt * 1.3); b.roll += b.rr * dt; b.pr *= Math.exp(-dt * 1.6); b.pt += b.pr * dt;
        e.set(b.pt * (1 - sstep(.3, 1.4, age)) + Math.sin(b.ph) * .7 * sstep(.3, 1.4, age), b.yaw, b.roll, 'YXZ'); b.q.setFromEuler(e);
        this.aBend.array[i * 3] = b.ph; this.aBend.array[i * 3 + 1] = .05 + .03 * Math.abs(Math.sin(b.ph)); this.aBend.array[i * 3 + 2] = 6;
        if (b.p.y <= .03 + (i % 7) * .004) { b.st = 1; b.t0 = this.t; b.q0.copy(b.q); a.set(0, 1, 0).applyQuaternion(b.q); e.set(0, b.yaw, a.y >= 0 ? 0 : Math.PI, 'YXZ'); b.q1.setFromEuler(e); b.y0 = b.p.y; }
      } else if (b.st === 1) {
        const u = sstep(0, 1, (this.t - b.t0) / .3); b.q.slerpQuaternions(b.q0, b.q1, u); b.p.y = (b.y0) * (1 - u) + (.025 + (i % 7) * .004) * u; this.aBend.array[i * 3 + 1] *= (1 - u);
        if (u >= 1) b.st = 2;
      }
      const sc = Math.min(1, b.life / .5);
      m.compose(b.p, b.q, s.setScalar(sc)); this.billsIM.setMatrixAt(i, m);
    }
    this.aBend.needsUpdate = true; this.billsIM.instanceMatrix.needsUpdate = true;
    for (let i = 0; i < this.NC; i++) {
      const c = this.coins[i];
      if (!c.on) { this.coinsIM.setMatrixAt(i, this.ZERO); continue; }
      c.life -= dt; if (c.life <= 0) { c.on = false; this.coinsIM.setMatrixAt(i, this.ZERO); continue; }
      live = true;
      if (c.st === 0) {
        c.v.y -= 9.8 * dt; c.v.multiplyScalar(Math.exp(-dt * .5)); c.p.addScaledVector(c.v, dt);
        const wl = c.w.length(); if (wl > 1e-5) { q.setFromAxisAngle(a.copy(c.w).multiplyScalar(1 / wl), wl * dt); c.q.premultiply(q); }
        if (c.p.y < .03 && c.v.y < 0) { c.p.y = .03; if (c.v.y < -3) { c.v.y *= -.35; c.v.x *= .6; c.v.z *= .6; c.w.multiplyScalar(.6); } else { c.st = 1; e.set(0, rand(0, TAU), 0, 'YXZ'); c.q1.setFromEuler(e); c.q0.copy(c.q); c.t0 = this.t; } }
      } else if (c.st === 1) { const u = sstep(0, 1, (this.t - c.t0) / .25); c.q.slerpQuaternions(c.q0, c.q1, u); }
      const sc = Math.min(1, c.life / .5);
      m.compose(c.p, c.q, s.setScalar(sc)); this.coinsIM.setMatrixAt(i, m);
    }
    this.coinsIM.instanceMatrix.needsUpdate = true;
    if (!live) this.moneyLive = false;
    }
  }
}
