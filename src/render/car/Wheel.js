import * as THREE from 'three';

/**
 * Roue complète, axe de rotation X, face extérieure vers +X (miroir par échelle -1 pour le côté droit) :
 *  - pneu à flancs bombés, épaulements, trois rainures, sculptures et marquage du flanc ;
 *  - jante à cinq branches dédoublées (Y) et voile concave, rebord poli, fût intérieur, écrous, cache-moyeu ;
 *  - disque de frein percé-rainuré et bol, étrier fixe (ne tourne pas) ;
 *  - disque de flou de mouvement qui apparaît quand la roue tourne vite.
 */
const R = 0.40;

/** Révolution d'un profil [rayon, abscisse axiale] autour de X ; UV : u autour, v en abscisse curviligne. */
function lathe(profile, segs, { closeSeam = true } = {}) {
  const n = profile.length, pos = [], uv = [], idx = [];
  const len = [0]; for (let j = 1; j < n; j++) len.push(len[j - 1] + Math.hypot(profile[j][0] - profile[j - 1][0], profile[j][1] - profile[j - 1][1]));
  const L = len[n - 1] || 1;
  for (let i = 0; i <= segs; i++) {
    const th = i / segs * Math.PI * 2, c = Math.cos(th), s = Math.sin(th);
    for (let j = 0; j < n; j++) { const [r, a] = profile[j]; pos.push(a, r * c, r * s); uv.push(i / segs, len[j] / L); }
  }
  for (let i = 0; i < segs; i++) for (let j = 0; j < n - 1; j++) {
    const a = i * n + j, b = (i + 1) * n + j, c = (i + 1) * n + j + 1, d = i * n + j + 1;
    idx.push(a, b, c, a, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  if (closeSeam) { // raccord de la couture : normales moyennées
    const N = g.attributes.normal;
    for (let j = 0; j < n; j++) { const a = j, b = segs * n + j; const x = N.getX(a) + N.getX(b), y = N.getY(a) + N.getY(b), z = N.getZ(a) + N.getZ(b), l = Math.hypot(x, y, z) || 1; N.setXYZ(a, x / l, y / l, z / l); N.setXYZ(b, x / l, y / l, z / l); }
  }
  return g;
}

function canvas(w, h) { return Object.assign(document.createElement('canvas'), { width: w, height: h }); }

/** Texture du pneu : sculptures (bande de roulement) et marquage du flanc extérieur. v : 0 = talon intérieur, 1 = talon extérieur. */
function tireTextures(vTread0, vTread1, vSide0, vSide1) {
  const W = 2048, H = 256, c = canvas(W, H), x = c.getContext('2d');
  const b = canvas(W, H), y = b.getContext('2d');
  x.fillStyle = '#0d0e0f'; x.fillRect(0, 0, W, H);
  y.fillStyle = '#808080'; y.fillRect(0, 0, W, H);
  // Sculptures directionnelles (rainures en chevron fines) dans la bande de roulement
  const t0 = vTread0 * H, t1 = vTread1 * H;
  y.strokeStyle = '#3a3a3a'; y.lineWidth = 3;
  for (let i = 0; i < 96; i++) {
    const u = i / 96 * W;
    y.beginPath(); y.moveTo(u, t0 + 4); y.lineTo(u + 14, (t0 + t1) / 2 - 18); y.stroke();
    y.beginPath(); y.moveTo(u, t1 - 4); y.lineTo(u + 14, (t0 + t1) / 2 + 18); y.stroke();
  }
  // Marquage du flanc (marque fictive)
  const s0 = vSide0 * H, s1 = vSide1 * H, mid = (s0 + s1) / 2;
  x.font = `700 ${Math.round((s1 - s0) * 0.55)}px "Archivo", "Arial Black", Arial, sans-serif`; x.textBaseline = 'middle';
  y.font = x.font;
  const txt = 'JACKPOT  ·  SPORT RACE  ·  305/30 ZR21    ';
  for (const k of [0, 0.5]) {
    x.fillStyle = '#5a5d61'; x.fillText(txt, k * W + 20, mid);
    y.fillStyle = '#c8c8c8'; y.fillText(txt, k * W + 20, mid);
  }
  // Fines stries circulaires du flanc
  x.fillStyle = 'rgba(255,255,255,0.025)'; for (let v = s0 - 18; v < s1 + 18; v += 4) x.fillRect(0, v, W, 1);
  const map = new THREE.CanvasTexture(c); map.colorSpace = THREE.SRGBColorSpace; map.wrapS = THREE.RepeatWrapping; map.anisotropy = 8;
  const bump = new THREE.CanvasTexture(b); bump.wrapS = THREE.RepeatWrapping; bump.anisotropy = 8;
  return { map, bump };
}

/** Texture du disque de frein : perçages et rainures sur la piste de freinage (v : rayon intérieur → extérieur). */
function discTexture() {
  const W = 1024, H = 64, c = canvas(W, H), x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#4b4e52'); g.addColorStop(0.5, '#8d9196'); g.addColorStop(1, '#5d6064');
  x.fillStyle = g; x.fillRect(0, 0, W, H);
  x.fillStyle = 'rgba(0,0,0,0.04)'; for (let v = 0; v < H; v += 2) x.fillRect(0, v, W, 1);
  for (let i = 0; i < 36; i++) {
    const u = i / 36 * W;
    x.fillStyle = '#151618'; for (let k = 0; k < 3; k++) { x.beginPath(); x.arc(u + k * 7, 18 + k * 14, 3.2, 0, Math.PI * 2); x.fill(); }
    x.strokeStyle = 'rgba(20,20,22,0.8)'; x.lineWidth = 2.2; x.beginPath(); x.moveTo(u + 12, 8); x.lineTo(u + 26, 56); x.stroke();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.RepeatWrapping; return t;
}

let SHARED = null;
function shared() {
  if (SHARED) return SHARED;
  // --- Pneu ---
  const tireProf = [
    [0.262, -0.128], [0.30, -0.141], [0.35, -0.146], [0.381, -0.139], [0.395, -0.126], [0.40, -0.108],
    [0.40, -0.076], [0.391, -0.073], [0.391, -0.057], [0.40, -0.054],
    [0.40, -0.012], [0.391, -0.009], [0.391, 0.009], [0.40, 0.012],
    [0.40, 0.054], [0.391, 0.057], [0.391, 0.073], [0.40, 0.076],
    [0.40, 0.108], [0.395, 0.126], [0.381, 0.139], [0.35, 0.146], [0.30, 0.141], [0.262, 0.128],
  ];
  const tire = lathe(tireProf, 72);
  // positions v des zones (abscisse curviligne)
  const len = [0]; for (let j = 1; j < tireProf.length; j++) len.push(len[j - 1] + Math.hypot(tireProf[j][0] - tireProf[j - 1][0], tireProf[j][1] - tireProf[j - 1][1]));
  const L = len[len.length - 1], vAt = j => len[j] / L;
  const tt = tireTextures(vAt(5), vAt(18), vAt(19) + 0.01, vAt(22));
  const rubber = new THREE.MeshStandardMaterial({ color: 0xffffff, map: tt.map, bumpMap: tt.bump, bumpScale: 1.2, roughness: 0.86, metalness: 0 });
  tt.map.repeat.set(1, 1);

  // --- Jante : fût, rebord, voile à branches en Y ---
  const barrel = lathe([[0.25, -0.125], [0.252, 0.095], [0.262, 0.112]], 64);
  const lipG = lathe([[0.262, 0.112], [0.276, 0.118], [0.279, 0.128], [0.27, 0.137], [0.258, 0.132]], 64);
  const yShape = new THREE.Shape();
  [[0.08, -0.027], [0.152, -0.021], [0.254, -0.056], [0.254, -0.028], [0.166, -0.002], [0.254, 0.028], [0.254, 0.056], [0.152, 0.021], [0.08, 0.027]]
    .forEach(([u, v], i) => i ? yShape.lineTo(u, v) : yShape.moveTo(u, v));
  yShape.closePath();
  const spokeG = new THREE.ExtrudeGeometry(yShape, { depth: 0.026, bevelEnabled: true, bevelThickness: 0.007, bevelSize: 0.006, bevelSegments: 2, curveSegments: 4 });
  { // repère : u radial → Y, v tangentiel → Z, profondeur → X ; voile concave (moyeu en retrait)
    const p = spokeG.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const u = p.getX(i), v = p.getY(i), w = p.getZ(i);
      const k = THREE.MathUtils.clamp((u - 0.08) / 0.174, 0, 1);
      p.setXYZ(i, w + 0.03 + k * k * 0.062 - k * 0.012, u, v);
    }
    spokeG.computeVertexNormals();
  }
  const spokes = [];
  for (let s = 0; s < 5; s++) { const g = spokeG.clone(); g.rotateX(s / 5 * Math.PI * 2); spokes.push(g); }
  const face = mergeGeos(spokes);
  const hub = lathe([[0.0, 0.07], [0.04, 0.069], [0.07, 0.062], [0.088, 0.05], [0.09, 0.02], [0.086, 0.0]], 40, { closeSeam: true });
  const nutG = new THREE.CylinderGeometry(0.011, 0.011, 0.024, 6).rotateZ(Math.PI / 2);
  const nuts = [];
  for (let s = 0; s < 5; s++) { const a = (s + 0.5) / 5 * Math.PI * 2, g = nutG.clone(); g.translate(0.074, Math.cos(a) * 0.055, Math.sin(a) * 0.055); nuts.push(g); }
  const nut = mergeGeos(nuts);
  const cap = new THREE.CircleGeometry(0.03, 24).rotateY(Math.PI / 2).translate(0.0715, 0, 0);

  // --- Frein ---
  const disc = lathe([[0.1, -0.03], [0.228, -0.03], [0.228, 0.002], [0.1, 0.002]], 56);
  const bell = lathe([[0.03, 0.03], [0.1, 0.03], [0.105, 0.0], [0.1, -0.03]], 32);
  const calShape = new THREE.Shape();
  const a0 = -0.42, a1 = 0.42; // secteur angulaire de l'étrier
  for (let i = 0; i <= 10; i++) { const a = a0 + (a1 - a0) * i / 10; calShape[i ? 'lineTo' : 'moveTo'](Math.cos(a) * 0.252, Math.sin(a) * 0.252); }
  for (let i = 10; i >= 0; i--) { const a = a0 + (a1 - a0) * i / 10; calShape.lineTo(Math.cos(a) * 0.168, Math.sin(a) * 0.168); }
  const caliper = new THREE.ExtrudeGeometry(calShape, { depth: 0.07, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.012, bevelSegments: 3, curveSegments: 4 });
  caliper.rotateY(-Math.PI / 2); caliper.translate(0.035 + 0.012, 0, 0);
  { // pivote vers l'arrière-haut du disque
    const q = new THREE.Matrix4().makeRotationX(-Math.PI * 0.62); caliper.applyMatrix4(q);
  }

  const blur = new THREE.CircleGeometry(0.256, 40).rotateY(Math.PI / 2).translate(0.096, 0, 0);
  SHARED = {
    geo: { tire, barrel, lip: lipG, face, hub, nut, cap, disc, bell, caliper, blur },
    mat: {
      rubber,
      disc: new THREE.MeshStandardMaterial({ map: discTexture(), metalness: 0.85, roughness: 0.38 }),
      bell: new THREE.MeshStandardMaterial({ color: 0x2a2c30, metalness: 0.7, roughness: 0.45 }),
      nut: new THREE.MeshStandardMaterial({ color: 0xd8dde2, metalness: 1, roughness: 0.2 }),
      lip: new THREE.MeshStandardMaterial({ color: 0xe6e9ec, metalness: 1, roughness: 0.14, side: THREE.DoubleSide }),
    },
  };
  return SHARED;
}

/** Fusion simple de géométries indexées ou non (mêmes attributs position/normal/uv). */
function mergeGeos(list) {
  const geos = list.map(g => g.index ? g.toNonIndexed() : g);
  const total = geos.reduce((s, g) => s + g.attributes.position.count, 0);
  const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3); let o = 0;
  for (const g of geos) { pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3); o += g.attributes.position.count; }
  const out = new THREE.BufferGeometry(); out.setAttribute('position', new THREE.BufferAttribute(pos, 3)); out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  return out;
}

const WHEEL_STYLE = {
  blue: { rim: 0x1a1d22, rimRough: 0.32, rimMetal: 0.9, caliper: 0x2f6bff, cap: 0x2f6bff },
  orange: { rim: 0xb9bec4, rimRough: 0.26, rimMetal: 1.0, caliper: 0xff6a1a, cap: 0xff6a1a },
};

/** Matériaux propres à une équipe (jantes, étriers). */
export function wheelMaterials(team) {
  const st = WHEEL_STYLE[team] || WHEEL_STYLE.blue;
  const blurU = { uA: { value: 0 }, uRim: { value: new THREE.Color(st.rim) } };
  return {
    rim: new THREE.MeshStandardMaterial({ color: st.rim, metalness: st.rimMetal, roughness: st.rimRough, side: THREE.DoubleSide }),
    caliper: new THREE.MeshPhysicalMaterial({ color: st.caliper, metalness: 0.1, roughness: 0.35, clearcoat: 1, clearcoatRoughness: 0.1 }),
    cap: new THREE.MeshStandardMaterial({ color: st.cap, metalness: 0.4, roughness: 0.3 }),
    blur: new THREE.ShaderMaterial({ uniforms: blurU, transparent: true, depthWrite: false,
      vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `uniform float uA; uniform vec3 uRim; varying vec3 vP;
        void main(){ float r = length(vP.yz) / 0.256; if (r > 1.0) discard;
          float spokes = smoothstep(.3, .36, r) * (1.0 - smoothstep(.95, 1.0, r));
          vec3 c = mix(uRim * .9 + .02, vec3(.03), .35 * (1.0 - spokes)) * (1.0 + .25 * sin(r * 40.0));
          gl_FragColor = vec4(c, uA * (.55 + .4 * spokes));
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }` }),
    blurU,
  };
}

/** Crée une roue. Retourne { root, steer, spin, blurU }. root : point de montage ; steer : pivot de braquage ; spin : partie tournante. */
export function createWheel(mats, { side = 1, front = true } = {}) {
  const S = shared();
  const root = new THREE.Group(), steer = new THREE.Group(), spin = new THREE.Group();
  root.add(steer); steer.add(spin);
  if (side < 0) root.scale.x = -1;
  const mesh = (g, m, parent, shadow = true) => { const me = new THREE.Mesh(g, m); me.castShadow = shadow; me.receiveShadow = true; parent.add(me); return me; };
  mesh(S.geo.tire, S.mat.rubber, spin);
  mesh(S.geo.barrel, mats.rim, spin, false);
  mesh(S.geo.face, mats.rim, spin);
  mesh(S.geo.hub, mats.rim, spin, false);
  mesh(S.geo.nut, S.mat.nut, spin, false);
  mesh(S.geo.cap, mats.cap, spin, false);
  mesh(S.geo.disc, S.mat.disc, spin, false).position.x = -0.035;
  mesh(S.geo.bell, S.mat.bell, spin, false).position.x = -0.035;
  const cal = mesh(S.geo.caliper, mats.caliper, steer, false); cal.position.x = -0.035;
  if (!front) cal.scale.setScalar(0.9);
  mesh(S.geo.lip, S.mat.lip, spin, false);                         // rebord poli (taillé diamant)
  const blur = new THREE.Mesh(S.geo.blur, mats.blur); blur.renderOrder = 3; steer.add(blur);
  return { root, steer, spin, blur };
}

export const WHEEL_RADIUS_VISUAL = R;
