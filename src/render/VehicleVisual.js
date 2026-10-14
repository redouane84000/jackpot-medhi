import * as THREE from 'three';
import { MODELS, ZONES } from './car/CarShape.js';
import { requestCarBody } from './car/bodyLoader.js';
import { createCarMaterial, paintDecal } from './car/CarMaterial.js';
import { createWheel, wheelMaterials } from './car/Wheel.js';

/**
 * Voiture visuelle : coupé sportif original modélisé par champ de distance (car/CarShape.js),
 * peinture vernie et détails dessinés par shader (car/CarMaterial.js), roues complètes (car/Wheel.js),
 * aileron, diffuseur, échappements, essuie-glaces, plaque, ombre de contact.
 * Synchronisée sur la physique, en lecture seule :
 *  - position et orientation du châssis (interpolées),
 *  - compression de chaque suspension,
 *  - braquage réel des roues avant,
 *  - rotation des roues liée à leur vitesse au sol (flou de mouvement à haute vitesse).
 * Un modèle GLB sous licence peut remplacer la carrosserie (loadModel), avec des nœuds wheel_FL/FR/RL/RR.
 */
const G = -0.76;                           // niveau du sol dans le repère du châssis, au repos

const BODY_GEO = {}, BODY_READY = {};
/** Deux niveaux de détail : fin (voiture proche) et grossier (voiture lointaine, ombre portée). */
const LOD_H = { fine: 0.025, coarse: 0.06 };
/**
 * Géométrie de carrosserie d'un modèle, partagée par toutes les voitures. Elle est renvoyée tout de suite (vide)
 * et remplie dès que le Web Worker a terminé ; bodyReady(model) indique quand les deux niveaux sont prêts.
 */
export function carBodyGeometry(model = 'vortex', lod = 'fine') {
  const key = model + ':' + lod;
  if (BODY_GEO[key]) return BODY_GEO[key];
  const g = BODY_GEO[key] = new THREE.BufferGeometry();
  BODY_READY[key] = requestCarBody(model, LOD_H[lod]).then(({ body, mirror, ms }) => {
    if (lod === 'coarse') mirror = { positions: new Float32Array(0), normals: new Float32Array(0), zones: new Float32Array(0), indices: new Uint32Array(0) };
    const nb = body.positions.length / 3, nm = mirror.positions.length / 3;
    const pos = new Float32Array((nb + nm) * 3), nor = new Float32Array((nb + nm) * 3), zon = new Float32Array((nb + nm) * ZONES);
    pos.set(body.positions); pos.set(mirror.positions, nb * 3);
    nor.set(body.normals); nor.set(mirror.normals, nb * 3);
    zon.set(body.zones); zon.set(mirror.zones, nb * ZONES);
    const idx = new Uint32Array(body.indices.length + mirror.indices.length);
    idx.set(body.indices); for (let i = 0; i < mirror.indices.length; i++) idx[body.indices.length + i] = mirror.indices[i] + nb;
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    const ib = new THREE.InterleavedBuffer(zon, ZONES);
    g.setAttribute('aZoneA', new THREE.InterleavedBufferAttribute(ib, 4, 0)); g.setAttribute('aZoneB', new THREE.InterleavedBufferAttribute(ib, 4, 4));
    g.setIndex(new THREE.BufferAttribute(idx, 1)); g.computeBoundingSphere();
    g.userData.ms = ms;
    return g;
  });
  return g;
}
/** Promesse résolue quand la carrosserie du modèle est prête (deux niveaux de détail). */
export function bodyReady(model) { carBodyGeometry(model, 'fine'); carBodyGeometry(model, 'coarse'); return Promise.all([BODY_READY[model + ':fine'], BODY_READY[model + ':coarse']]); }

const SHADOW_ONLY = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });

const TEAM_STYLE = {
  blue: { paint: '#0a3cb4', accent: '#5b9bff', accentCss: '#5b9bff', number: '7', glow: [0.25, 0.55, 1.6] },
  orange: { paint: '#f0590e', accent: '#ffb057', accentCss: '#ffffff', number: '11', glow: [1.6, 0.6, 0.15] },
};
const ROOF = { vortex: null, typhon: '#08090b' };

let CARBON_TEX = null;
function carbonTexture() {
  if (CARBON_TEX) return CARBON_TEX;
  const c = Object.assign(document.createElement('canvas'), { width: 128, height: 128 }), x = c.getContext('2d');
  x.fillStyle = '#0d0e10'; x.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 16; i++) for (let j = 0; j < 16; j++) {
    const g = x.createLinearGradient(i * 8, j * 8, i * 8 + 8, j * 8 + 8);
    const on = (i + j) % 2 === 0; g.addColorStop(0, on ? '#24272c' : '#111316'); g.addColorStop(1, on ? '#15171a' : '#1d2024');
    x.fillStyle = g; x.fillRect(i * 8, j * 8, 8, 8);
  }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.repeat.set(6, 6); t.anisotropy = 8;
  return (CARBON_TEX = t);
}

function contactShadowTexture() {
  const S = 128, c = Object.assign(document.createElement('canvas'), { width: S, height: S * 2 }), x = c.getContext('2d');
  const img = x.createImageData(S, S * 2);
  for (let j = 0; j < S * 2; j++) for (let i = 0; i < S; i++) {
    const u = (i + 0.5) / S * 2 - 1, v = (j + 0.5) / (S * 2) * 2 - 1;
    const qx = Math.max(Math.abs(u) - 0.55, 0) / 0.45, qy = Math.max(Math.abs(v) - 0.7, 0) / 0.3;
    const d = Math.min(1, Math.hypot(qx, qy)), a = Math.pow(1 - d, 1.8);
    const k = (j * S + i) * 4; img.data[k] = img.data[k + 1] = img.data[k + 2] = 0; img.data[k + 3] = a * 255;
  }
  x.putImageData(img, 0, 0);
  return new THREE.CanvasTexture(c);
}

export class VehicleVisual {
  constructor(scene, C, team, { envMap = null, model = 'vortex' } = {}) {
    this.C = C; this.team = team; this.envMap = envMap;
    this.st = TEAM_STYLE[team] || TEAM_STYLE.blue;
    this.root = new THREE.Group(); scene.add(this.root);
    this.body = new THREE.Group(); this.root.add(this.body);
    this.decal = paintDecal(this.st.number, this.st.accentCss);
    this.carbon = new THREE.MeshPhysicalMaterial({ map: carbonTexture(), color: 0xffffff, metalness: 0.3, roughness: 0.35, clearcoat: 1, clearcoatRoughness: 0.08, envMap });
    this.black = new THREE.MeshStandardMaterial({ color: 0x0b0c0e, roughness: 0.6, metalness: 0.2 });
    this.chrome = new THREE.MeshStandardMaterial({ color: 0xdfe3e8, metalness: 1, roughness: 0.12, envMap, side: THREE.DoubleSide });
    // Flammes de boost (shader partagé par les sorties d'échappement)
    this.flameU = { uA: { value: 0 }, uT: { value: 0 }, uCol: { value: new THREE.Color().setRGB(...this.st.glow) } };
    this.flameMat = new THREE.ShaderMaterial({ uniforms: this.flameU, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `uniform float uA, uT; uniform vec3 uCol; varying vec2 vUv; void main(){ float v = vUv.y; float fl = .75 + .25 * sin(uT * 80.0 + vUv.x * 30.0) * sin(uT * 47.0);
        vec3 c = mix(uCol, vec3(1.0, .95, .85), pow(v, 3.0)); c = mix(c, vec3(1.0), pow(v, 10.0));
        gl_FragColor = vec4(min(c * 1.15, vec3(1.4)), pow(v, 1.3) * uA * fl); }` });
    this.flameGeo = new THREE.ConeGeometry(0.065, 1, 18, 1, true); this.flameGeo.translate(0, 0.5, 0); this.flameGeo.rotateX(-Math.PI / 2);
    this.setModel(model);

    // ---------- Roues ----------
    this.wmats = wheelMaterials(team);
    this.wheels = [];
    const tx = C.WHEEL_TRACK_HALF - 0.025, bz = C.WHEEL_BASE_HALF;   // voie visuelle légèrement rentrée : pneus sous les ailes
    for (const [x, z, front] of [[tx, bz, true], [-tx, bz, true], [tx, -bz, false], [-tx, -bz, false]]) {
      const side = Math.sign(x);
      const w = createWheel(this.wmats, { side, front });
      w.root.position.set(x, 0.05 - 0.41, z); this.root.add(w.root);
      this.wheels.push({ ...w, front, side, x, z });
    }

    // ---------- Ombre de contact (occultation au sol) ----------
    this.shadow = new THREE.Mesh(new THREE.PlaneGeometry(2.5, 4.9), new THREE.MeshBasicMaterial({ map: contactShadowTexture(), color: 0x000000, transparent: true, depthWrite: false, opacity: 0.75 }));
    this.shadow.rotation.x = -Math.PI / 2; this.shadow.renderOrder = 1; scene.add(this.shadow);

    this.lenSmooth = [0.41, 0.41, 0.41, 0.41];
    this.prevV = new THREE.Vector3(); this.accL = new THREE.Vector3(); this._v = new THREE.Vector3(); this._qi = new THREE.Quaternion();
    this.roll = 0; this.pitch = 0;
  }

  /** Carrosserie et pièces rapportées d'un modèle (VORTEX ou TYPHON) ; les roues sont communes. */
  setModel(modelId) {
    const M = MODELS[modelId] || MODELS.vortex, st = this.st;
    this.model = M.id;
    for (const ch of [...this.body.children]) { this.body.remove(ch); if (ch.geometry && !ch.userData.shared) ch.geometry.dispose(); }
    if (this.paint) this.paint.dispose();
    this.paint = createCarMaterial({ paint: st.paint, roof: ROOF[M.id] || st.paint, accent: st.accent, decal: this.decal, envMap: this.envMap, shader: M.shader });
    this.U = this.paint.userData.U;
    // Niveau de détail : maillage fin près de la caméra, grossier au-delà de 38 m ; l'ombre utilise toujours le grossier
    const lod = new THREE.LOD();
    const fine = new THREE.Mesh(carBodyGeometry(M.id, 'fine'), this.paint), coarse = new THREE.Mesh(carBodyGeometry(M.id, 'coarse'), this.paint);
    for (const m of [fine, coarse]) { m.receiveShadow = true; m.userData.shared = true; }
    lod.addLevel(fine, 0); lod.addLevel(coarse, 38);
    lod.position.y = G; lod.userData.shared = true; this.body.add(lod);
    const shadow = new THREE.Mesh(carBodyGeometry(M.id, 'coarse'), SHADOW_ONLY); shadow.castShadow = true; shadow.position.y = G; shadow.userData.shared = true;
    shadow.renderOrder = -1; this.body.add(shadow);
    const carbon = this.carbon, black = this.black, chrome = this.chrome;
    const add = (geo, mat, x, y, z, shadow = true) => { const me = new THREE.Mesh(geo, mat); me.position.set(x, G + y, z); me.castShadow = shadow; this.body.add(me); return me; };
    if (M.wing) {
      // Aileron arrière : profil d'aile déporteur, montants col de cygne, dérives
      const af = new THREE.Shape(), ch = 0.3, th = 0.034;
      af.moveTo(0, 0);
      for (let i = 1; i <= 16; i++) { const t = i / 16; af.lineTo(t * ch, -th * (1.0 * Math.sqrt(t) - 1.1 * t + 0.4 * t * t) * 2.2); }
      af.lineTo(ch, 0.004); af.lineTo(ch - 0.004, -0.028);
      for (let i = 15; i >= 1; i--) { const t = i / 16; af.lineTo(t * ch, th * 0.35 * Math.sqrt(t) * (1 - t) * 2); }
      af.closePath();
      const span = 1.56;
      const wing = new THREE.ExtrudeGeometry(af, { depth: span, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.004, bevelSegments: 1, curveSegments: 4 });
      wing.translate(0, 0, -span / 2); wing.rotateY(Math.PI / 2); wing.rotateX(0.1);
      add(wing, carbon, 0, 1.15, -1.74);
      const plate = new THREE.BoxGeometry(0.008, 0.11, 0.3);
      for (const sx of [-1, 1]) {
        add(plate, carbon, sx * 0.784, 1.15, -1.89);
        const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(sx * 0.42, G + 0.975, -1.86), new THREE.Vector3(sx * 0.42, G + 1.07, -1.93), new THREE.Vector3(sx * 0.42, G + 1.16, -1.86)]);
        const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 12, 0.014, 8), black); tube.castShadow = true; this.body.add(tube);
      }
    }
    // Diffuseur : ailettes
    { const [n, gap] = M.fins, fin = new THREE.BoxGeometry(0.012, 0.1, 0.26);
      for (let i = 0; i < n; i++) add(fin, carbon, (i - (n - 1) / 2) * gap, 0.235, -1.99, false); }
    // Sorties d'échappement (ovales, chromées, intérieur noirci)
    this.exhausts = [];
    { const tip = new THREE.CylinderGeometry(0.05, 0.054, 0.1, 28, 1, true); tip.rotateX(Math.PI / 2); tip.scale(1, 0.78, 1);
      const inner = new THREE.CircleGeometry(0.048, 24); inner.scale(1, 0.78, 1);
      for (const [x, y, z] of M.exhaust) {
        add(tip, chrome, x, y, z + 0.03, false);
        const d = add(inner, black, x, y, z + 0.07, false); d.rotation.y = Math.PI;
        this.exhausts.push(new THREE.Vector3(x, G + y, z - 0.03));
      }
    }
    // Essuie-glaces
    { const arm = new THREE.BoxGeometry(0.56, 0.01, 0.018), [wy, wz] = M.wiper;
      for (const [x, a] of [[0.12, 0.08], [-0.42, 0.14]]) { const m = add(arm, black, x, wy, wz, false); m.rotation.set(-0.38, a, 0); } }
    // Plaque arrière (immatriculation fictive)
    { const c = Object.assign(document.createElement('canvas'), { width: 512, height: 112 }), x = c.getContext('2d');
      x.fillStyle = '#e9ecef'; x.fillRect(0, 0, 512, 112); x.fillStyle = this.team === 'blue' ? '#1d4fd8' : '#e2580e'; x.fillRect(0, 0, 44, 112);
      x.fillStyle = '#16181b'; x.font = '700 78px "Archivo", "Arial Narrow", Arial, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
      x.fillText(this.team === 'blue' ? 'JA-007-BL' : 'JA-011-OR', 280, 60);
      x.strokeStyle = '#16181b'; x.lineWidth = 4; x.strokeRect(2, 2, 508, 108);
      const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
      const p = add(new THREE.PlaneGeometry(0.46, 0.1), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5, metalness: 0.1 }), 0, M.plate[0], M.plate[1], false);
      p.rotation.y = Math.PI; }
    // Flammes
    this.flames = this.exhausts.map(p => { const f = new THREE.Mesh(this.flameGeo, this.flameMat); f.position.copy(p); f.visible = false; f.renderOrder = 5; f.userData.shared = true; this.body.add(f); return f; });
  }

  /** Synchronise le visuel sur l'état physique interpolé. */
  update(pos, quat, car, dt, time) {
    this.root.position.copy(pos); this.root.quaternion.copy(quat);
    // Transfert de charge visible : la caisse prend du roulis en virage, plonge au freinage, s'assied à l'accélération
    if (dt > 0) {
      const v = car.body.linvel(), a = this._v.set(v.x, v.y, v.z).sub(this.prevV).multiplyScalar(1 / Math.max(dt, 1e-3));
      this.prevV.set(v.x, v.y, v.z);
      a.applyQuaternion(this._qi.copy(quat).invert());
      this.accL.lerp(a, Math.min(1, dt * 8));
      const on = car.grounded >= 3 ? 1 : 0;
      this.roll += (THREE.MathUtils.clamp(this.accL.x * 0.0042, -0.045, 0.045) * on - this.roll) * Math.min(1, dt * 7);
      this.pitch += (THREE.MathUtils.clamp(-this.accL.z * 0.0035, -0.035, 0.035) * on - this.pitch) * Math.min(1, dt * 7);
      this.body.rotation.set(this.pitch, 0, this.roll);
    }
    let spinMax = 0;
    for (let i = 0; i < 4; i++) {
      const w = this.wheels[i], pw = car.wheels[i];
      this.lenSmooth[i] += (pw.len - this.lenSmooth[i]) * Math.min(1, dt * 30);
      w.root.position.y = 0.05 - this.lenSmooth[i];
      if (w.front) w.steer.rotation.y = car.steer * w.side;     // roue miroir : le sens de rotation autour de Y s'inverse
      w.spin.rotation.x = pw.spin;
      spinMax = Math.max(spinMax, Math.abs(pw.spinVel || 0));
      if (w.custom) { w.custom.rotation.order = 'YXZ'; w.custom.rotation.x = pw.spin; if (w.front) w.custom.rotation.y = car.steer; }
    }
    // Flou de rotation des jantes au-delà d'environ 40 km/h
    const blurA = THREE.MathUtils.smoothstep(spinMax, 22, 55) * 0.85;
    this.wmats.blurU.uA.value = blurA;
    for (const w of this.wheels) w.blur.visible = blurA > 0.01;
    // Flammes de boost
    const boost = car.boosting ? 1 : 0;
    this.flameU.uA.value += (boost - this.flameU.uA.value) * Math.min(1, dt * 18); this.flameU.uT.value = time;
    for (const f of this.flames) { f.visible = this.flameU.uA.value > 0.02; f.scale.set(1, 1, 0.7 + 0.9 * this.flameU.uA.value + 0.15 * Math.sin(time * 50)); }
    // Feux : stop au freinage, recul en marche arrière, phares renforcés au boost
    this.U.uTail.value += ((car.braking ? 3.2 : 1.0) - this.U.uTail.value) * Math.min(1, dt * 20);
    this.U.uRev.value = car.fwdSpeed < -0.6 ? 1 : 0;
    this.U.uHead.value = 1 + 0.4 * this.flameU.uA.value;
    // Ombre de contact : suit la voiture au sol, s'estompe en l'air
    const h = Math.max(0, pos.y - 0.76);
    this.shadow.position.set(pos.x, 0.02, pos.z);
    this.shadow.rotation.z = Math.atan2(2 * (quat.w * quat.y + quat.x * quat.z), 1 - 2 * (quat.y * quat.y + quat.x * quat.x));
    const up = 1 - 2 * (quat.x * quat.x + quat.z * quat.z);
    this.shadow.material.opacity = Math.max(0, 0.78 - h * 0.28) * Math.max(0.2, up);
    this.shadow.scale.setScalar(1 + h * 0.15);
  }

  /** Points de sortie des échappements, en coordonnées monde (pour les particules). */
  exhaustWorld(i, out) { return out.copy(this.exhausts[i]).applyMatrix4(this.body.matrixWorld); }

  /** Remplace la carrosserie procédurale par un modèle GLB (roues nommées wheel_FL, wheel_FR, wheel_RL, wheel_RR). */
  async loadModel(url) {
    const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
    const gltf = await new GLTFLoader().loadAsync(url);
    const model = gltf.scene, box = new THREE.Box3().setFromObject(model), size = box.getSize(new THREE.Vector3());
    const k = this.C.CAR_LENGTH / Math.max(size.z, size.x); model.scale.setScalar(k);
    box.setFromObject(model); model.position.y = G - box.min.y;
    model.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    this.body.clear(); this.body.add(model);
    const map = { FL: 0, FR: 1, RL: 2, RR: 3 };
    model.traverse(o => { const m = /wheel_?(FL|FR|RL|RR)/i.exec(o.name); if (m) { const w = this.wheels[map[m[1].toUpperCase()]]; w.root.visible = false; w.custom = o; } });
  }
}
