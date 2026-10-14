import * as THREE from 'three';
import { canvasTex, mkCanvas, paintTurfDetail, paintGlow, paintNet, TAU } from './textures.js';
import { roundedPath, P3, Quads, beamMatrix, hash1 } from './stadium/geom.js';
import { Stands, TEAM_RGB } from './stadium/Stands.js';
import { Crowd } from './stadium/Crowd.js';

export { TEAM_RGB };

/**
 * Stade visuel. Purement décoratif : aucune de ces géométries n'a de collider.
 * Les obstacles physiques sont construits séparément (arena/ArenaColliders.js) à partir du même layout.
 *  - pelouse tondue en bandes, marquages, parvis ;
 *  - enceinte vitrée (verre trempé, montants, lisse haute, bande LED basse) ;
 *  - cages (cadre blanc et filet) ;
 *  - tribunes, toit, projecteurs, pylônes, écrans (stadium/Stands.js) ;
 *  - public en 3D, drapeaux, tifos (stadium/Crowd.js) ;
 *  - ville au loin.
 */
export class ArenaVisual {
  constructor(scene, C, layout, { small = false, fogColor }) {
    this.C = C; this.L = layout; this.scene = scene;
    this.time = { value: 0 };
    this.ballU = { value: new THREE.Vector3(0, -100, 0) };
    const hx = layout.hx, hz = layout.hz, rc = layout.rc, gw = C.GOAL_WIDTH / 2, gh = C.GOAL_HEIGHT, gd = C.GOAL_DEPTH;
    const BLUE = new THREE.Color().setRGB(...TEAM_RGB.blue), ORANGE = new THREE.Color().setRGB(...TEAM_RGB.orange);
    const hdr = (c, k) => c.clone().multiplyScalar(k);

    this.stands = new Stands(scene, C, layout, { small, fogColor });
    this.crowd = new Crowd(scene, C, layout, { small, fogColor });
    const SL = this.stands.S;

    // ================= Sol : pelouse tondue, marquages, parvis, abords =================
    const turfTex = canvasTex(paintTurfDetail(), { wrap: true });
    const groundMat = new THREE.MeshLambertMaterial();
    groundMat.onBeforeCompile = s => {
      s.uniforms.uTurf = { value: turfTex };
      s.vertexShader = 'varying vec3 vW;\n' + s.vertexShader.replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\n vW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      s.fragmentShader = `uniform sampler2D uTurf; varying vec3 vW;
        float h21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
        float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }
        float sdRR(vec2 p, vec2 b, float r){ vec2 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }
        float lineAA(float d, float w){ float f = max(fwidth(d), 1e-4); return 1.0 - smoothstep(w - f, w + f, d); }
        ` + s.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
        const float HX = ${hx.toFixed(2)}, HZ = ${hz.toFixed(2)}, RC = ${rc.toFixed(2)}, GW = ${gw.toFixed(2)}, GD = ${gd.toFixed(2)};
        vec2 p = vW.xz, a = abs(p);
        float sd = sdRR(p, vec2(HX, HZ), RC);
        bool inGoal = a.x < GW && a.y >= HZ - 0.05 && a.y < HZ + GD;
        vec3 d1 = texture2D(uTurf, p / 1.9).rgb, d2 = texture2D(uTurf, p / 6.1 + .37).rgb;
        float macro = vn(p * .06) * .6 + vn(p * .017) * .4;
        // tonte en bandes (longueur) + quadrillage léger (largeur)
        float stripe = mod(floor(p.y / 5.25 + .5), 2.0), cross = mod(floor(p.x / 6.8 + .5), 2.0);
        vec3 c = mix(vec3(.058, .175, .04), vec3(.085, .235, .058), stripe) * (1.0 + (cross - .5) * .07) * mix(.86, 1.12, macro) * (d1 * 1.2 + d2 * .62);
        // usure devant les cages et au centre
        float wear = smoothstep(9.0, 0.0, length(vec2(p.x, a.y - HZ + 4.0)) ) * .5 + smoothstep(5.0, 0.0, length(p)) * .25;
        c = mix(c, vec3(.16, .17, .08) * (d1 * 1.1), wear * (.4 + .6 * vn(p * 1.3)));
        vec3 team = p.y < 0.0 ? vec3(${BLUE.r.toFixed(3)}, ${BLUE.g.toFixed(3)}, ${BLUE.b.toFixed(3)}) : vec3(${ORANGE.r.toFixed(3)}, ${ORANGE.g.toFixed(3)}, ${ORANGE.b.toFixed(3)});
        // Marquages
        float W = .12, white = 0.0, teamL = 0.0;
        white = max(white, lineAA(abs(sd + .7), W));
        white = max(white, lineAA(abs(p.y), W) * step(sd, -.7));
        white = max(white, lineAA(abs(length(p) - 9.15), W));
        white = max(white, lineAA(length(p) - .4, 0.0));
        float boxL = max(abs(a.y - (HZ - 9.0)), max(a.x - 12.0, 0.0));
        float boxS = max(abs(a.x - 12.0), max(abs(a.y - (HZ - 4.5)) - 4.5, 0.0));
        teamL = max(teamL, lineAA(min(boxL, boxS), W));
        if (a.y < HZ - 9.0) teamL = max(teamL, lineAA(abs(length(vec2(p.x, a.y - (HZ - 9.0))) - 7.0), W));
        teamL = max(teamL, lineAA(max(abs(a.y - HZ), a.x - GW), .2));
        c = mix(c, vec3(.8, .83, .78) * (.9 + d1.g * .12), white * .95);
        c = mix(c, team * 1.1 + .08, teamL * .95);
        if (inGoal && a.y > HZ + .2) { float g = vn(p * 3.0); c = mix(vec3(.03, .035, .04), team * .22, .5 + .2 * g); }
        // Parvis entre la vitre et les tribunes : sol technique sombre
        if (sd > 0.0 && !inGoal) {
          float tile = step(.97, fract(p.x / 2.0)) + step(.97, fract(p.y / 2.0));
          c = vec3(.05, .052, .058) * (.85 + vn(p * .7) * .3) + tile * .01;
          float far = smoothstep(${(SL.back.d + 2).toFixed(1)}, ${(SL.back.d + 30).toFixed(1)}, sdRR(p, vec2(${SL.FX.toFixed(1)}, ${SL.FZ.toFixed(1)}), ${SL.RC.toFixed(1)}));
          // abords du stade : esplanade, puis parkings éclairés
          vec3 plaza = vec3(.09, .085, .08) * (.8 + vn(p * .2) * .4);
          float lot = step(.92, fract(p.x / 2.6)) * step(.5, fract(p.y / 18.0));
          c = mix(c, plaza + lot * .05, far);
        }
        diffuseColor.rgb = c;`)
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        { float sdE = sdRR(vW.xz, vec2(${hx.toFixed(2)}, ${hz.toFixed(2)}), ${rc.toFixed(2)});
          vec3 tm = vW.z < 0.0 ? vec3(${BLUE.r.toFixed(3)}, ${BLUE.g.toFixed(3)}, ${BLUE.b.toFixed(3)}) : vec3(${ORANGE.r.toFixed(3)}, ${ORANGE.g.toFixed(3)}, ${ORANGE.b.toFixed(3)});
          totalEmissiveRadiance += tm * smoothstep(1.0, 0.0, abs(sdE + 0.12)) * step(sdE, 0.0) * .22; }`);
    };
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(1400, 1400, 1, 1), groundMat);
    ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);

    // Emblème central (dessin original)
    { const S = 1024, cv = mkCanvas(S, S), x = cv.getContext('2d'), m = S / 2;
      x.strokeStyle = 'rgba(255,214,120,.55)'; x.lineWidth = 10; x.beginPath(); x.arc(m, m, m * .78, 0, TAU); x.stroke();
      x.lineWidth = 3; x.beginPath(); x.arc(m, m, m * .7, 0, TAU); x.stroke();
      x.fillStyle = 'rgba(255,214,120,.28)'; x.beginPath(); for (let i = 0; i < 10; i++) { const a = i / 10 * TAU - Math.PI / 2, r = i % 2 ? m * .16 : m * .4; i ? x.lineTo(m + Math.cos(a) * r, m + Math.sin(a) * r) : x.moveTo(m + Math.cos(a) * r, m + Math.sin(a) * r); } x.closePath(); x.fill();
      x.font = '800 70px "Archivo", Impact, Arial, sans-serif'; x.fillStyle = 'rgba(255,240,210,.5)'; x.textAlign = 'center'; x.textBaseline = 'middle';
      const txt = 'JACKPOT · ARENA · '; for (let k = 0; k < 2; k++) for (let i = 0; i < txt.length; i++) { const a = (i / txt.length + k * 0.5) * Math.PI - Math.PI; x.save(); x.translate(m + Math.cos(a) * m * .6, m + Math.sin(a) * m * .6); x.rotate(a + Math.PI / 2); x.fillText(txt[i], 0, 0); x.restore(); }
      const em = new THREE.Mesh(new THREE.PlaneGeometry(17, 17), new THREE.MeshStandardMaterial({ map: canvasTex(cv), transparent: true, depthWrite: false, roughness: .8 }));
      em.rotation.x = -Math.PI / 2; em.position.y = 0.012; em.receiveShadow = true; em.renderOrder = 1; scene.add(em); }

    // ================= Enceinte vitrée =================
    const wallPath = roundedPath(hx, hz, rc, 1.0, [-gw, gw]);
    const isMouth = (a, b) => Math.abs(a.z) > hz - 0.01 && Math.abs(b.z) > hz - 0.01 && Math.abs((a.x + b.x) / 2) < gw;
    const H = C.ARENA_WALL_HEIGHT, band = 1.2;
    const bandQ = new Quads(), glassQ = new Quads(), rimQ = new Quads();
    for (let i = 0; i < wallPath.pts.length; i++) {
      const a = wallPath.pts[i], b = wallPath.pts[(i + 1) % wallPath.pts.length];
      const N = new THREE.Vector3(-(a.nx + b.nx) / 2, 0, -(a.nz + b.nz) / 2).normalize();
      const u0 = a.s / 56, u1 = (i + 1 === wallPath.pts.length ? wallPath.L : b.s) / 56;
      const mouth = isMouth(a, b);
      if (!mouth) bandQ.quad(P3(a, 0, 0), P3(b, 0, 0), P3(b, 0, band), P3(a, 0, band), N, new THREE.Color(1, 1, 1), [[u0, 0], [u1, 0], [u1, 1], [u0, 1]]);
      const y0 = mouth ? gh : band;
      glassQ.quad(P3(a, 0, y0), P3(b, 0, y0), P3(b, 0, H), P3(a, 0, H), N, new THREE.Color(1, 1, 1), [[a.s, y0], [b.s, y0], [b.s, H], [a.s, H]]);
      rimQ.quad(P3(a, -0.06, H), P3(b, -0.06, H), P3(b, 0.18, H + 0.12), P3(a, 0.18, H + 0.12), new THREE.Vector3(0, 1, 0), new THREE.Color(0.75, 0.78, 0.82));
      rimQ.quad(P3(a, -0.06, H - 0.18), P3(b, -0.06, H - 0.18), P3(b, -0.06, H), P3(a, -0.06, H), N, new THREE.Color(0.55, 0.58, 0.62));
    }
    scene.add(new THREE.Mesh(bandQ.geo(), this.stands.ledMaterial));
    scene.add(new THREE.Mesh(rimQ.geo(), new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.8, roughness: 0.3 })));
    const glassMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
      uniforms: { uBall: this.ballU, uTime: this.time, uBlue: { value: BLUE }, uOrange: { value: ORANGE } },
      vertexShader: `varying vec3 vW; varying vec3 vN; varying vec2 vUv;
        void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: `uniform vec3 uBall, uBlue, uOrange; uniform float uTime; varying vec3 vW; varying vec3 vN; varying vec2 vUv;
        float hexEdge(vec2 p){ p *= vec2(1.0, 1.1547); vec2 a = mod(p, vec2(1.0, 1.732)) - vec2(.5, .866), b = mod(p - vec2(.5, .866), vec2(1.0, 1.732)) - vec2(.5, .866);
          vec2 g = dot(a, a) < dot(b, b) ? a : b; vec2 q = abs(g); float d = max(q.x * .866 + q.y * .5, q.y); return smoothstep(.42, .48, d); }
        float h21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
        float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }
        void main(){
          vec3 V = normalize(cameraPosition - vW);
          float fres = pow(1.0 - abs(dot(V, normalize(vN))), 4.0);
          // joints entre panneaux de verre (tous les 3 m) et traverse
          float seam = 1.0 - smoothstep(0.0, 0.03, abs(fract(vUv.x / 3.0 + .5) - .5) * 3.0);
          float smudge = vn(vUv * vec2(1.3, 2.0)) * vn(vUv * 6.0);
          float dB = length(vW - uBall), prox = smoothstep(9.0, 2.5, dB);
          float hx = hexEdge(vUv / 1.2) * prox;
          vec3 team = mix(uBlue, uOrange, smoothstep(-18.0, 18.0, vW.z));
          // reflet du ciel nocturne et des projecteurs (bandeau clair en haut)
          vec3 refl = mix(vec3(.05, .07, .12), vec3(.5, .55, .62), smoothstep(6.0, 12.0, vW.y)) ;
          float a = .025 + fres * .35 + smudge * .03 + seam * .25 + hx * .6 + prox * .05;
          vec3 c = refl * (1.0 + fres) + seam * vec3(.25) + team * (hx * 2.4 + prox * .5);
          gl_FragColor = vec4(c, a);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }` });
    const glass = new THREE.Mesh(glassQ.geo(), glassMat); glass.renderOrder = 8; scene.add(glass);
    // Montants verticaux (tous les 6 m) avec pied et platine
    { const posts = wallPath.pts.filter((p, i) => i % 6 === 0 && !(Math.abs(p.z) > hz - 0.01 && Math.abs(p.x) < gw + 0.5));
      const mats = [], tmp = new THREE.Matrix4();
      for (const p of posts) mats.push(beamMatrix(new THREE.Vector3(p.x + p.nx * 0.1, 0, p.z + p.nz * 0.1), new THREE.Vector3(p.x + p.nx * 0.1, H, p.z + p.nz * 0.1), 0.16, 0.24, tmp.clone()));
      const im = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0x2b3138, metalness: .8, roughness: .35 }), mats.length);
      mats.forEach((m, i) => im.setMatrixAt(i, m)); scene.add(im); }

    // ================= Cages : cadre blanc, liseré LED, filet =================
    const netTex = canvasTex(paintNet(), { wrap: true });
    this.goalGlow = [];
    for (const g of layout.goals) {
      const s = g.sign, tc = g.team === 'blue' ? BLUE : ORANGE;
      const grp = new THREE.Group(); scene.add(grp);
      const netMat = new THREE.MeshStandardMaterial({ map: netTex, color: new THREE.Color(0.9, 0.92, 0.95), transparent: true, alphaTest: 0.3, side: THREE.DoubleSide, roughness: 0.8, depthWrite: false });
      const backMat = new THREE.MeshStandardMaterial({ color: 0x07090c, roughness: .6, metalness: .2, emissive: tc, emissiveIntensity: 0.18, side: THREE.DoubleSide });
      const addPlane = (w, h, x, y, z, ry, mat, rep = null, sag = 0) => {
        let mm = mat;
        if (rep) { const t = mat.map.clone(); t.needsUpdate = true; t.repeat.set(rep[0], rep[1]); mm = mat.clone(); mm.map = t; }
        const geo = new THREE.PlaneGeometry(w, h, 12, 6);
        if (sag) { const p = geo.attributes.position; for (let i = 0; i < p.count; i++) { const u = p.getX(i) / w + .5, v = p.getY(i) / h + .5; p.setZ(i, -sag * Math.sin(u * Math.PI) * Math.sin(v * Math.PI)); } geo.computeVertexNormals(); }
        const me = new THREE.Mesh(geo, mm); me.position.set(x, y, z); me.rotation.y = ry; grp.add(me); return me;
      };
      const zc = s * (hz + gd / 2), zb = s * (hz + gd);
      addPlane(gw * 2, gh, 0, gh / 2, zb - s * 0.05, 0, backMat);
      addPlane(gw * 2, gh, 0, gh / 2, zb - s * 0.4, 0, netMat, [gw * 2 / 0.9, gh / 0.9], -0.3 * s);
      for (const k of [-1, 1]) { addPlane(gd, gh, k * gw, gh / 2, zc, Math.PI / 2, backMat); addPlane(gd, gh, k * (gw - 0.35), gh / 2, zc, Math.PI / 2, netMat, [gd / 0.9, gh / 0.9], 0.25 * k); }
      { const roof = new THREE.Mesh(new THREE.PlaneGeometry(gw * 2, gd), backMat); roof.rotation.x = Math.PI / 2; roof.position.set(0, gh, zc); grp.add(roof); }
      const pr = C.GOAL_POST_RADIUS;
      const frameMat = new THREE.MeshStandardMaterial({ color: 0xf4f6f8, roughness: 0.35, metalness: 0.1 });
      const ledMat = new THREE.MeshBasicMaterial({ color: hdr(tc, 2.2) });
      for (const k of [-1, 1]) {
        const post = new THREE.Mesh(new THREE.CapsuleGeometry(pr, gh, 6, 18), frameMat); post.position.set(k * gw, gh / 2, s * hz); post.castShadow = true; grp.add(post);
        const strip = new THREE.Mesh(new THREE.BoxGeometry(0.08, gh, 0.08), ledMat); strip.position.set(k * gw, gh / 2, s * (hz - pr * 0.9)); grp.add(strip);
      }
      const bar = new THREE.Mesh(new THREE.CapsuleGeometry(pr, gw * 2, 6, 18), frameMat); bar.rotation.z = Math.PI / 2; bar.position.set(0, gh, s * hz); bar.castShadow = true; grp.add(bar);
      const barStrip = new THREE.Mesh(new THREE.BoxGeometry(gw * 2, 0.08, 0.08), ledMat); barStrip.position.set(0, gh - pr * 0.9, s * (hz - pr * 0.6)); grp.add(barStrip);
      // éclairage de la cage par l'émissif du fond (pas de lumière dynamique : trop coûteux sur tout le terrain)
      this.goalGlow.push({ team: g.team, frameMat: ledMat, backMat, base: tc.clone(), pulse: 0 });
    }

    // ================= Pastilles de boost =================
    const padGlow = canvasTex(paintGlow());
    const pads = layout.pads;
    this.padSmall = pads.filter(p => !p.big); this.padBig = pads.filter(p => p.big);
    const discGeo = new THREE.CircleGeometry(1, 40); discGeo.rotateX(-Math.PI / 2);
    this.smallIM = new THREE.InstancedMesh(discGeo, new THREE.MeshBasicMaterial({ map: padGlow, color: new THREE.Color(1.6, 1.15, .35), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }), this.padSmall.length);
    this.bigBaseIM = new THREE.InstancedMesh(discGeo, new THREE.MeshBasicMaterial({ map: padGlow, color: new THREE.Color(1.8, 1.2, .3), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }), this.padBig.length);
    this.orbIM = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(.6, 1), new THREE.MeshStandardMaterial({ color: 0xffc457, emissive: 0xffa21a, emissiveIntensity: 2.2, roughness: .3, metalness: .6, flatShading: true }), this.padBig.length);
    for (const im of [this.smallIM, this.bigBaseIM]) im.renderOrder = 2;
    scene.add(this.smallIM, this.bigBaseIM, this.orbIM);
    { const ringGeo = new THREE.RingGeometry(.8, 1, 40); ringGeo.rotateX(-Math.PI / 2);
      const ringMat = new THREE.MeshStandardMaterial({ color: 0x1a1d21, metalness: .8, roughness: .3 });
      for (const p of pads) { const r = new THREE.Mesh(ringGeo, ringMat); r.position.set(p.x, .015, p.z); r.scale.setScalar(p.big ? 1.9 : 1.1); r.receiveShadow = true; scene.add(r); } }

    // ================= Ville au loin (silhouettes, fenêtres éclairées, feux de balisage) =================
    {
      const n = small ? 160 : 320, im = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), new THREE.MeshBasicMaterial({ color: 0xffffff }), n);
      const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
      for (let i = 0; i < n; i++) {
        const a = hash1(i * 1.3) * TAU, r = 520 + hash1(i * 2.7) * 420, h = 16 + Math.pow(hash1(i * 5.1), 2.4) * 85;
        m4.compose(new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r), q.setFromAxisAngle(up, hash1(i * 9.1) * TAU), new THREE.Vector3(16 + hash1(i * 3.3) * 34, h, 16 + hash1(i * 4.4) * 34));
        im.setMatrixAt(i, m4);
      }
      im.material.onBeforeCompile = s => {
        s.uniforms.uTime = this.time;
        s.vertexShader = 'varying vec3 vL; varying vec3 vS; varying float vSeed;\n' + s.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
          vL = position; vS = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz)); vSeed = fract(sin(dot(instanceMatrix[3].xz, vec2(12.9898, 78.233))) * 43758.5);`);
        s.fragmentShader = 'uniform float uTime; varying vec3 vL; varying vec3 vS; varying float vSeed;\n' + s.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
          vec3 lp = vL * vS; float side = step(.49, abs(vL.x)) + step(.49, abs(vL.z));
          vec2 cell = side > 0.0 ? vec2(abs(vL.x) > .49 ? lp.z : lp.x, lp.y) : vec2(0.0);
          vec2 g = floor(cell / vec2(3.2, 3.6)), f = fract(cell / vec2(3.2, 3.6));
          float on = step(.7, fract(sin(dot(g + vSeed * 31.0, vec2(41.3, 289.1))) * 15731.7)) * step(.25, f.x) * step(f.x, .8) * step(.3, f.y) * step(f.y, .78);
          vec3 base = vec3(.012, .014, .02);
          vec3 win = mix(vec3(1.0, .78, .45), vec3(.65, .8, 1.0), step(.7, fract(vSeed * 7.0 + g.x * .13))) * .9;
          vec3 c = base + win * on * side;
          float top = step(.995, vL.y) ; c += top * .0;
          float beacon = step(.97, vL.y) * step(.45, length(vL.xz)) * step(.6, vSeed) * step(.5, fract(uTime * .7 + vSeed * 9.0)) * 4.0;
          diffuseColor.rgb = c + vec3(1.0, .05, .03) * beacon;`);
      };
      im.frustumCulled = false; scene.add(im);
    }

    this._m4 = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._s = new THREE.Vector3(); this._p = new THREE.Vector3();
  }

  /** Écrans géants : score, chrono, message (redessiné uniquement quand le contenu change). */
  drawScreen(score, clock, msg, msgTeam) {
    const key = `${score.blue}|${score.orange}|${clock}|${msg}|${msgTeam}`;
    if (key === this.stands.screenKey) return; this.stands.screenKey = key;
    const W = 1024, H = 512, x = this.stands.screenCanvas.getContext('2d');
    const g = x.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#08151d'); g.addColorStop(1, '#020608'); x.fillStyle = g; x.fillRect(0, 0, W, H);
    x.fillStyle = '#1652d8'; x.fillRect(0, 0, W / 2, 10); x.fillStyle = '#f2620f'; x.fillRect(W / 2, 0, W / 2, 10);
    x.textAlign = 'center'; x.textBaseline = 'middle';
    const font = (w, s) => `${w} ${s}px "Archivo", Impact, "Arial Black", Arial, sans-serif`;
    if (msg) {
      const col = msgTeam === 'blue' ? '#5ea2ff' : msgTeam === 'orange' ? '#ff9a4a' : '#f2d27a';
      x.shadowColor = col; x.shadowBlur = 40; x.fillStyle = col; x.font = font(900, msg.length > 9 ? 120 : 170); x.fillText(msg, W / 2, H * .44); x.shadowBlur = 0;
      x.font = font(800, 60); x.fillStyle = '#e8f2f6'; x.fillText(`${score.blue}  —  ${score.orange}`, W / 2, H * .8);
    } else {
      x.font = font(900, 230); x.fillStyle = '#5ea2ff'; x.fillText(String(score.blue), W * .2, H * .48); x.fillStyle = '#ff9a4a'; x.fillText(String(score.orange), W * .8, H * .48);
      x.font = font(800, 130); x.fillStyle = '#eef6f8'; x.fillText(clock, W / 2, H * .44);
      x.font = font(700, 40); try { x.letterSpacing = '8px'; } catch (e) { /* ignore */ }
      x.fillStyle = '#7f9aa6'; x.fillText('BLEU', W * .2, H * .82); x.fillText('ORANGE', W * .8, H * .82); x.fillText('JACKPOT ARENA', W / 2, H * .82);
      try { x.letterSpacing = '0px'; } catch (e) { /* ignore */ }
    }
    x.fillStyle = 'rgba(255,255,255,.05)'; for (let yy = 0; yy < H; yy += 4) x.fillRect(0, yy, W, 1);
    this.stands.screenTex.needsUpdate = true;
  }

  update(dt, t, { ballPos, padState, cheer }) {
    this.time.value = t;
    if (ballPos) this.ballU.value.copy(ballPos);
    this.stands.update(dt, t);
    this.crowd.update(dt, t, cheer);
    const m4 = this._m4, q = this._q, s = this._s, p = this._p;
    this.padSmall.forEach((pad, i) => { const on = padState[pad.id]; m4.compose(p.set(pad.x, .02, pad.z), q.identity(), s.setScalar(on ? 1.3 + .08 * Math.sin(t * 4 + i) : .5)); this.smallIM.setMatrixAt(i, m4); });
    this.padBig.forEach((pad, i) => {
      const on = padState[pad.id];
      m4.compose(p.set(pad.x, .02, pad.z), q.identity(), s.setScalar(on ? 2.6 : 1.2)); this.bigBaseIM.setMatrixAt(i, m4);
      m4.compose(p.set(pad.x, on ? 1.1 + .15 * Math.sin(t * 2.4 + i) : -2, pad.z), q.setFromAxisAngle(_Y, t * 1.6 + i), s.setScalar(on ? 1 : .001)); this.orbIM.setMatrixAt(i, m4);
    });
    this.smallIM.instanceMatrix.needsUpdate = this.bigBaseIM.instanceMatrix.needsUpdate = this.orbIM.instanceMatrix.needsUpdate = true;
    for (const gg of this.goalGlow) {
      gg.pulse = Math.max(0, gg.pulse - dt * 0.6);
      const k = 2.2 + gg.pulse * 6 * (0.6 + 0.4 * Math.sin(t * 18));
      gg.frameMat.color.copy(gg.base).multiplyScalar(k);
      gg.backMat.emissiveIntensity = 0.18 + gg.pulse * 1.6;
    }
  }

  flashGoal(team) { for (const gg of this.goalGlow) if (gg.team === team) gg.pulse = 1; this.stands.flash(team === 'blue' ? 'orange' : 'blue'); }
}
const _Y = new THREE.Vector3(0, 1, 0);
