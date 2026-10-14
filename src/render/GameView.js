import * as THREE from 'three';
import { SKY_DUSK_FRAG } from './sky.js';
import { setAnisotropy } from './textures.js';
import { ArenaVisual, TEAM_RGB } from './ArenaVisual.js';
import { BallVisual } from './BallVisual.js';
import { VehicleVisual } from './VehicleVisual.js';
import { Effects, PAL } from './Effects.js';
import { PostFX } from './PostFX.js';
import { SkidMarks } from './SkidMarks.js';

const DPR_CAP = { high: 1.15, medium: 1, low: 0.75 };

/** Ciel panoramique (équirectangulaire) calculé une fois : le shader de nuages n'est plus exécuté à chaque image. */
function bakeSky(renderer, sunDir) {
  const rt = new THREE.WebGLRenderTarget(2048, 1024, { type: THREE.HalfFloatType, generateMipmaps: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false });
  const frag = '#define OCT 5\n' + SKY_DUSK_FRAG
    .replace('varying vec3 vDir;', 'varying vec2 vUv; vec3 vDir;')
    .replace('void main(){', 'void main(){ { float lon = (vUv.x - .5) * 6.2831853, lat = (vUv.y - .5) * 3.14159265; vDir = vec3(cos(lat) * sin(lon), sin(lat), cos(lat) * cos(lon)); }');
  const mat = new THREE.ShaderMaterial({ uniforms: { uSun: { value: sunDir }, uTime: { value: 0 } }, vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }', fragmentShader: frag, depthTest: false, depthWrite: false });
  const sc = new THREE.Scene(), quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat); quad.frustumCulled = false; sc.add(quad);
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const prev = renderer.getRenderTarget();
  renderer.setRenderTarget(rt); renderer.render(sc, cam); renderer.setRenderTarget(prev);
  mat.dispose(); quad.geometry.dispose();
  return rt;
}

/**
 * Rendu Three.js de la simulation. Il lit les corps physiques (avec interpolation entre deux pas fixes)
 * et n'écrit jamais dans le monde physique.
 * Ambiance : match en soirée, stade éclairé par ses rampes de projecteurs et ses pylônes d'angle.
 */
export class GameView {
  constructor(canvas, sim, { small = false, models = ['vortex', 'typhon'], quality = 'medium' } = {}) {
    this.sim = sim; this.C = sim.C; this.small = small; this.quality = quality;
    // Pas d'anticrénelage multisample : le stade est déjà dense, et le MSAA doublait le coût dès que la voiture bougeait.
    const renderer = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    setAnisotropy(Math.min(4, renderer.capabilities.getMaxAnisotropy()));
    this.dprMax = Math.min(window.devicePixelRatio || 1, 1.5); this.dpr = Math.min(this.dprMax, DPR_CAP[quality]);
    renderer.setPixelRatio(this.dpr);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
    const scene = this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(70, 1, 0.2, 3000);
    this.time = { value: 0 };

    // ---------- Éclairage de match : lumière principale (ombres) + deux appoints + ciel ----------
    this.sunDir = new THREE.Vector3(0.42, 0.84, 0.34).normalize();          // depuis un pylône d'angle, très haut
    const key = this.sun = new THREE.DirectionalLight(0xfff4e8, 2.6);
    key.castShadow = true;
    const SM = quality === 'low' ? 512 : 1024; key.shadow.mapSize.set(SM, SM);
    Object.assign(key.shadow.camera, { left: -34, right: 34, top: 34, bottom: -34, near: 1, far: 260 });
    key.shadow.bias = -0.0005; key.shadow.normalBias = 0.03;
    scene.add(key, key.target);
    // Peu de lumières dynamiques : chacune coûte sur chaque pixel éclairé (pelouse, tribunes, public)
    const fill = new THREE.DirectionalLight(0xe8f0ff, 1.25); fill.position.set(-50, 75, -42); scene.add(fill);
    scene.add(new THREE.HemisphereLight(0x5a6884, 0x1a1712, 0.75));
    // Appoint lié à la caméra (comme en retransmission) : la voiture du joueur reste lisible de dos
    this.camFill = new THREE.DirectionalLight(0xdfe8ff, 0.55); scene.add(this.camFill, this.camFill.target);
    // Ciel de nuit : la lune haute, côté -X
    this.skySun = new THREE.Vector3(-0.55, 0.42, 0.62).normalize();
    // Le ciel (nuages procéduraux, coûteux) est calculé une seule fois dans une texture panoramique
    this.skyRT = bakeSky(renderer, this.skySun);
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(2400, 48, 24), new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { uSky: { value: this.skyRT.texture } },
      vertexShader: 'varying vec3 vDir; void main(){ vDir = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }',
      fragmentShader: `uniform sampler2D uSky; varying vec3 vDir;
        void main(){ vec3 d = normalize(vDir); vec2 uv = vec2(atan(d.x, d.z) / 6.2831853 + .5, asin(clamp(d.y, -1.0, 1.0)) / 3.14159265 + .5);
          gl_FragColor = vec4(texture2D(uSky, uv).rgb, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }` }));
    this.sky.renderOrder = -10; this.sky.frustumCulled = false; scene.add(this.sky);
    const fogCol = new THREE.Color(0.035, 0.04, 0.06);
    scene.fog = new THREE.Fog(fogCol, 260, 1500);

    this.arena = new ArenaVisual(scene, this.C, sim.layout, { small, fogColor: fogCol });
    this.ball = new BallVisual(scene, this.C);
    this.fx = new Effects(scene, { small });
    this.skids = new SkidMarks(scene, { small });

    // ---------- Environnement réfléchi : le stade lui-même (projecteurs, tribunes, ciel) ----------
    {
      const pm = new THREE.PMREMGenerator(renderer);
      scene.position.y = -5; scene.updateMatrixWorld(true);
      const env = pm.fromScene(scene, 0.02, 0.5, 2500);
      scene.position.y = 0; scene.updateMatrixWorld(true);
      scene.environment = env.texture; this.envRT = env; pm.dispose();
    }
    this.cars = sim.cars.map((c, i) => new VehicleVisual(scene, this.C, c.team, { envMap: scene.environment, model: models[i] || 'vortex' }));
    if (this.C.CAR_MODEL_URL) for (const v of this.cars) v.loadModel(this.C.CAR_MODEL_URL).catch(e => console.warn('Modèle de voiture non chargé, modèle procédural conservé :', e));

    this.post = new PostFX(renderer, scene, this.camera, { quality });

    // Interpolation entre deux pas de simulation
    const mkState = () => ({ p0: new THREE.Vector3(), q0: new THREE.Quaternion(), p1: new THREE.Vector3(), q1: new THREE.Quaternion(), p: new THREE.Vector3(), q: new THREE.Quaternion() });
    this.bodies = [...sim.cars.map(c => ({ body: c.body, ...mkState() })), { body: sim.ball.body, ...mkState() }];
    this.capture(); for (const b of this.bodies) { b.p0.copy(b.p1); b.q0.copy(b.q1); }
    this._a = new THREE.Vector3(); this._b = new THREE.Vector3(); this._v = new THREE.Vector3(); this._c = new THREE.Vector2();
    this.resize();
  }

  /** À appeler avant chaque pas fixe : l'état courant devient l'état précédent. */
  capturePrev() { for (const b of this.bodies) { b.p0.copy(b.p1); b.q0.copy(b.q1); } }
  /** À appeler après les pas fixes de l'image : lit l'état physique courant. */
  capture() { for (const b of this.bodies) { const t = b.body.translation(), r = b.body.rotation(); b.p1.set(t.x, t.y, t.z); b.q1.set(r.x, r.y, r.z, r.w); } }
  /** Téléportations (engagement) : pas d'interpolation à travers le terrain. */
  snap() { this.capture(); for (const b of this.bodies) { b.p0.copy(b.p1); b.q0.copy(b.q1); } this.skids.clear(); }

  interpolate(alpha) { for (const b of this.bodies) { b.p.lerpVectors(b.p0, b.p1, alpha); b.q.slerpQuaternions(b.q0, b.q1, alpha); } }
  carPose(i) { return this.bodies[i]; }
  ballPose() { return this.bodies[this.bodies.length - 1]; }

  setCarModel(i, model) { this.cars[i].setModel(model); }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    if (this.post) this.post.setSize(w, h, this.dpr);
  }

  setDpr(d) { this.dpr = d; this.renderer.setPixelRatio(d); this.resize(); }

  /** Niveau de qualité global : 'high' | 'medium' | 'low' (définition, post-traitement, ombres, densité du public). */
  setQuality(q) {
    this.quality = q;
    const d = Math.min(this.dprMax, DPR_CAP[q]);
    if (Math.abs(d - this.dpr) > 0.01) this.setDpr(d);
    this.post.setQuality(q);
    this.arena.crowd.setDensity(q === 'high' ? 1 : q === 'medium' ? 0.6 : 0.3);
    const SM = q === 'low' ? 512 : 1024;
    if (this.sun.shadow.mapSize.x !== SM) { this.sun.shadow.mapSize.set(SM, SM); if (this.sun.shadow.map) { this.sun.shadow.map.dispose(); this.sun.shadow.map = null; } }
  }

  /** Met à jour tous les visuels pour l'image. */
  update(dt, t, info) {
    this.time.value = t;
    const sim = this.sim;
    const emitBoost = ((this._puff = ((this._puff | 0) + 1)) & 1) === 0;
    sim.cars.forEach((car, i) => {
      const pose = this.carPose(i), vis = this.cars[i];
      vis.update(pose.p, pose.q, car, dt, t);
      if (car.boosting && dt > 0 && emitBoost) {
        vis.body.updateMatrixWorld(true);
        const back = this._b.set(0, 0, -1).applyQuaternion(pose.q), vel = car.body.linvel();
        const colors = car.team === 'blue' ? PAL.FIRE_BLUE : PAL.FIRE_ORANGE;
        const n = vis.exhausts.length;
        for (let k = 0; k < n; k += n > 2 ? 2 : 1) this.fx.boostPuff(vis.exhaustWorld(k, this._a), back, vel, colors, 1);
      }
      // Fumée de pneus en dérapage, traces de gomme
      if (dt > 0 && car.slip > 4 && car.grounded >= 2) {
        if (Math.random() < dt * 40) {
          const w = car.wheels[2 + ((Math.random() * 2) | 0)];
          this.fx.emit(w.point.x, 0.2, w.point.z, (Math.random() - .5) * 2, .8, (Math.random() - .5) * 2, 1.4, .35, 2.2, .3, PAL.SMOKE[0], 1.4, -.25);
        }
      }
      this.skids.update(i, car, dt);
    });
    const bp = this.ballPose();
    this.ball.update(bp.p, bp.q, dt, sim.ball.active);
    this.arena.update(dt, t, { ballPos: sim.ball.active ? bp.p : null, padState: info.padState, cheer: info.cheer });
    // Ombres portées : le cadre d'ombre suit l'action
    const f = info.focus;
    this.sun.target.position.copy(f); this.sun.position.copy(f).addScaledVector(this.sunDir, 140);
    this.sky.position.copy(this.camera.position);
    this.camFill.position.copy(this.camera.position).add(this._a.set(0, 6, 0)); this.camFill.target.position.copy(this.carPose(0).p);
    this.fx.update(dt, this.camera);
    // Effets de vitesse : point de fuite = projection d'un point devant la voiture du joueur
    this.post.update(dt, t, { flash: info.flash || 0 });
  }

  render() { this.post.render(); }
  teamRGB(team) { return TEAM_RGB[team]; }
}
