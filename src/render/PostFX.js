import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';

/**
 * Post-traitement (aucun effet sur le jeu), limité à trois passes pour rester léger :
 *  1. rendu HDR (multiéchantillonné selon la qualité) ;
 *  2. halo lumineux (bloom) à basse résolution ;
 *  3. passe finale unique : flou radial de vitesse, aberration chromatique, tone mapping ACES, sRGB,
 *     contraste, saturation, vignettage, grain.
 * En qualité basse, rendu direct sans composition.
 */
const FinalShader = {
  uniforms: {
    tDiffuse: { value: null }, uAmount: { value: 0 }, uCenter: { value: new THREE.Vector2(0.5, 0.5) }, uCA: { value: 0 },
    uTime: { value: 0 }, uVignette: { value: 0.32 }, uGrain: { value: 0.03 }, uSat: { value: 1.08 }, uContrast: { value: 1.06 }, uFlash: { value: 0 }, uExposure: { value: 1 },
  },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float uAmount, uCA, uTime, uVignette, uGrain, uSat, uContrast, uFlash, uExposure; uniform vec2 uCenter; varying vec2 vUv;
    vec3 jaRRT(vec3 v){ vec3 a = v * (v + 0.0245786) - 0.000090537; vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081; return a / b; }
    vec3 jaAces(vec3 c){
      const mat3 I = mat3(vec3(0.59719, 0.07600, 0.02840), vec3(0.35458, 0.90834, 0.13383), vec3(0.04823, 0.01566, 0.83777));
      const mat3 O = mat3(vec3(1.60475, -0.10208, -0.00327), vec3(-0.53108, 1.10813, -0.07276), vec3(-0.07367, -0.00605, 1.07602));
      c *= uExposure / 0.6; c = I * c; c = jaRRT(c); c = O * c; return clamp(c, 0.0, 1.0);
    }
    vec3 toSRGB(vec3 c){ return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), c)); }
    float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main(){
      vec2 dir = vUv - uCenter; float r = length(dir);
      vec3 c = texture2D(tDiffuse, vUv).rgb;
      if (uAmount > 0.001) {
        float k = uAmount * smoothstep(.12, .75, r) * .06;
        for (int i = 1; i < 7; i++) c += texture2D(tDiffuse, vUv - dir * k * float(i) / 6.0).rgb;
        c /= 7.0;
        vec2 o = dir * uCA * .012 * r;
        c.r = mix(c.r, texture2D(tDiffuse, vUv + o).r, .8); c.b = mix(c.b, texture2D(tDiffuse, vUv - o).b, .8);
      }
      c = toSRGB(jaAces(c));
      float l = dot(c, vec3(.2126, .7152, .0722));
      c = mix(vec3(l), c, uSat);
      c = (c - .5) * uContrast + .5;
      c += vec3(-.006, .0, .012) * (1.0 - l) + vec3(.012, .006, -.008) * l;
      vec2 q = vUv - .5; c *= clamp(1.0 - dot(q, q) * uVignette * 2.2, 0.0, 1.0);
      c += (h(vUv * 1000.0 + fract(uTime) * 61.0) - .5) * uGrain;
      c += uFlash;
      gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
    }`,
};

const PRESET = {
  high: { samples: 4, bloomScale: 0.5, strength: 0.42 },
  medium: { samples: 2, bloomScale: 0.33, strength: 0.36 },
};

export class PostFX {
  constructor(renderer, scene, camera, { quality = 'high' } = {}) {
    this.renderer = renderer; this.scene = scene; this.camera = camera;
    this.enabled = false; this.speed = 0; this.flash = 0;
    this.center = new THREE.Vector2(0.5, 0.5);
    this.setQuality(quality);
  }

  setQuality(q) {
    if (q === this.quality && (this.composer || q === 'low')) return;
    this.quality = q;
    this.dispose();
    if (q === 'low') { this.enabled = false; return; }
    const P = PRESET[q] || PRESET.medium;
    const r = this.renderer, size = r.getSize(new THREE.Vector2()), dpr = r.getPixelRatio();
    const rt = new THREE.WebGLRenderTarget(Math.round(size.x * dpr), Math.round(size.y * dpr), { type: THREE.HalfFloatType, samples: r.capabilities.isWebGL2 ? P.samples : 0 });
    this.composer = new EffectComposer(r, rt);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloomScale = P.bloomScale;
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x * P.bloomScale, size.y * P.bloomScale), P.strength, 0.35, 1.25);
    this.composer.addPass(this.bloom);
    this.finalPass = new ShaderPass(FinalShader); this.composer.addPass(this.finalPass);
    this.finalPass.uniforms.uExposure.value = r.toneMappingExposure;
    this.enabled = true;
  }

  setSize(w, h, dpr) { if (this.composer) { this.composer.setPixelRatio(dpr); this.composer.setSize(w, h); this.bloom.setSize(w * this.bloomScale, h * this.bloomScale); } }

  /** speed : 0..1 (flou radial), center : point de fuite à l'écran (0..1). */
  update(dt, t, { speed = 0, center = null, flash = 0 } = {}) {
    this.speed += (speed - this.speed) * Math.min(1, dt * 6);
    this.flash = Math.max(flash, this.flash - dt * 2.5);
    if (!this.enabled) return;
    const u = this.finalPass.uniforms;
    u.uAmount.value = this.speed; u.uCA.value = this.speed * 0.9;
    if (center) u.uCenter.value.lerp(center, Math.min(1, dt * 8));
    u.uTime.value = t; u.uFlash.value = this.flash * 0.25;
  }

  render() { if (this.enabled) this.composer.render(); else this.renderer.render(this.scene, this.camera); }

  dispose() {
    if (!this.composer) return;
    this.composer.renderTarget1.dispose(); this.composer.renderTarget2.dispose();
    for (const p of this.composer.passes) p.dispose?.();
    this.composer = null; this.bloom = null; this.finalPass = null;
  }
}
