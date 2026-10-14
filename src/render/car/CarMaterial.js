import * as THREE from 'three';

/**
 * Matériau de carrosserie : un seul MeshPhysicalMaterial (peinture vernie) dont le shader choisit, pixel par pixel,
 * la matière à partir des zones portées par les sommets (distances signées → bords nets à toute distance) :
 * peinture métallisée vernie, vitrage teinté avec sérigraphie noire, montants noir laqué, carbone, grilles alvéolées,
 * optiques LED, feux arrière, glace de rétroviseur. Les lignes d'ouvrants, la trappe à carburant, la poignée de porte,
 * le numéro de course et le bandeau de pare-brise sont dessinés dans le même shader (coordonnées objet).
 */
export function createCarMaterial({ paint, roof, accent, decal, envMap = null, shader }) {
  const v4 = a => new THREE.Vector4(...a), v2 = a => new THREE.Vector2(...a);
  const U = {
    uDoors: { value: v4(shader.doors) }, uDoor2: { value: v4(shader.door2) }, uHandles: { value: v4(shader.handles) }, uFuel: { value: v2(shader.fuel) },
    uHood: { value: v4(shader.hood) }, uLouvre: { value: v4(shader.louvre) }, uRearPanel: { value: v4(shader.rearPanel) },
    uSun: { value: v2(shader.sun) }, uProj: { value: v4(shader.proj) }, uNumber: { value: v4(shader.number) }, uCarbonHood: { value: shader.carbonHood ? 1 : 0 },
    uRoof: { value: new THREE.Color(roof) },
    uAccent: { value: new THREE.Color(accent) },
    uHead: { value: 1 }, uTail: { value: 1 }, uRev: { value: 0 },
    uDecal: { value: decal },
  };
  const m = new THREE.MeshPhysicalMaterial({ color: new THREE.Color(paint), metalness: 0.55, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.03, envMap, envMapIntensity: 1.5 });
  m.userData.U = U;
  m.onBeforeCompile = s => {
    Object.assign(s.uniforms, U);
    s.vertexShader = s.vertexShader
      .replace('#include <common>', `#include <common>
        attribute vec4 aZoneA; attribute vec4 aZoneB;
        varying vec4 vZA; varying vec4 vZB; varying vec3 vObj; varying vec3 vObjN;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vZA = aZoneA; vZB = aZoneB; vObj = position; vObjN = normal;`);
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform vec3 uRoof, uAccent; uniform float uHead, uTail, uRev; uniform sampler2D uDecal;
        uniform vec4 uDoors, uDoor2, uHandles, uHood, uLouvre, uRearPanel, uProj, uNumber; uniform vec2 uFuel, uSun; uniform float uCarbonHood;
        float zHandle(vec3 P, float zc, float yc){ vec2 hq = abs(vec2(P.z - zc, P.y - yc)) - vec2(.085, .012); return length(max(hq, 0.0)) + min(max(hq.x, hq.y), 0.0) - .006; }
        varying vec4 vZA; varying vec4 vZB; varying vec3 vObj; varying vec3 vObjN;
        float zEdge(float d){ float f = max(fwidth(d), 1e-5); return smoothstep(-f, f, d); }
        float zLine(float d, float w){ float f = max(fwidth(d), 1e-5), we = max(w, f * 0.75); return (1.0 - smoothstep(we, we + f * 1.2, abs(d))) * clamp(w / (f * 0.4), 0.6, 1.0); }
        float zHash(vec3 p){ p = fract(p * vec3(.1031, .1030, .0973)); p += dot(p, p.yxz + 33.33); return fract((p.x + p.y) * p.z); }
        float zHex(vec2 p){ p *= vec2(1.0, 1.1547); vec2 a = mod(p, vec2(1.0, 1.732)) - vec2(.5, .866), b = mod(p - vec2(.5, .866), vec2(1.0, 1.732)) - vec2(.5, .866);
          vec2 g = dot(a, a) < dot(b, b) ? a : b; vec2 q = abs(g); return max(q.x * .866 + q.y * .5, q.y); }
        float zSegD(vec2 p, vec2 a, vec2 b){ vec2 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0); return length(pa - ba * h); }
        vec3 zCol; float zRough, zMetal, zCC, zCCR; vec3 zEmit;`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        {
          vec3 P = vObj, N = normalize(vObjN); float ax = abs(P.x);
          float mGH = zEdge(vZA.x), mGlass = zEdge(vZA.y), mRoof = zEdge(vZA.z) * mGH, mTrim = zEdge(vZA.w);
          float mCav = zEdge(vZB.x), mHead = zEdge(vZB.y), mTail = zEdge(vZB.z), mChrome = zEdge(vZB.w);
          // --- Peinture métallisée (paillettes discrètes) ---
          float fl = zHash(floor(P * 900.0)); float flFade = 1.0 - smoothstep(.0008, .003, length(fwidth(P)));
          zCol = diffuseColor.rgb * (1.0 + (fl - .5) * .16 * flFade); zRough = .3 + (fl - .5) * .06 * flFade; zMetal = .55; zCC = 1.0; zCCR = .03; zEmit = vec3(0.0);
          // Lignes d'ouvrants (portes, capot, coffre), trappe à carburant, poignée
          float lines = 0.0;
          if (abs(N.x) > .3 && P.y < .89 + uDoor2.z * .04) {
            float yy = P.y - .25, zF = uDoors.x + uDoors.y * yy, zR = uDoors.z + uDoors.w * yy;
            lines = max(lines, zLine(P.z - zF, .0035) * step(.245, P.y));
            lines = max(lines, zLine(P.z - zR, .0035) * step(.245, P.y));
            lines = max(lines, zLine(P.y - .245, .0035) * step(uDoors.z, P.z) * step(P.z, uDoors.x));
            if (uDoor2.z > .5) lines = max(lines, zLine(P.z - (uDoor2.x + uDoor2.y * yy), .0035) * step(.245, P.y));
            lines = max(lines, zLine(P.z - (1.80 - .25 * (P.y - .4)), .002) * step(.3, P.y) * step(P.y, .66));
            float hr = zHandle(P, uHandles.x, uHandles.z);
            if (uHandles.w > .5) hr = min(hr, zHandle(P, uHandles.y, uHandles.z));
            lines = max(lines, zLine(hr, .0018)); if (hr < 0.0) zCol *= .25;
            if (P.x > 0.0) lines = max(lines, zLine(length(vec2(P.z - uFuel.x, P.y - uFuel.y)) - .052, .0018));
          }
          if (N.y > .3) {
            lines = max(lines, zLine(ax - uHood.x, .0045) * step(.86, P.z) * step(P.z, uHood.y + .08 * ax * ax));
            lines = max(lines, zLine(P.z - (uHood.y + .08 * ax * ax), .0045) * step(ax, uHood.x));
            if (uHood.w > 0.0) {
              lines = max(lines, zLine(P.z + uHood.z, .002) * step(ax, uHood.w) * step(.9, P.y));
              lines = max(lines, zLine(ax - uHood.w, .002) * step(P.z, -uHood.z) * step(-2.05, P.z) * step(.9, P.y));
            }
          }
          // Ouïes de capot (lamelles)
          if (N.y > .5 && ax > uLouvre.x && ax < uLouvre.y && P.z > uLouvre.z && P.z < uLouvre.w) {
            float slat = fract((P.z - uLouvre.z) / (uLouvre.w - uLouvre.z) * 7.0), edge = min(min(ax - uLouvre.x, uLouvre.y - ax), min(P.z - uLouvre.z, uLouvre.w - P.z));
            float louv = smoothstep(.0, .004, edge) * (1.0 - smoothstep(.55, .62, slat));
            zCol *= 1.0 - .92 * louv; zRough = mix(zRough, .7, louv);
            lines = max(lines, zLine(edge, .002));
          }
          // Capot carbone apparent (sergé 2×2, vernis épais)
          if (uCarbonHood > .5 && N.y > -.4 && P.y > .78 && ax < uHood.x && P.z > .84 && P.z < uHood.y + .08 * ax * ax) {
            float edge = min(uHood.x - ax, min(P.z - .84, uHood.y + .08 * ax * ax - P.z));
            float hm = smoothstep(0.0, max(fwidth(edge), 1e-4) * 1.5, edge);
            vec2 cw = vec2(P.x * .7071 + P.z * .7071, -P.x * .7071 + P.z * .7071) * 90.0;
            float tw2 = step(.5, fract(cw.x + floor(cw.y) * .5)) ;
            float fade = 1.0 - smoothstep(.0015, .005, length(fwidth(P)));
            vec3 cf = vec3(.006) + vec3(.014, .015, .018) * mix(.5, tw2, fade);
            zCol = mix(zCol, cf, hm); zMetal = mix(zMetal, .35, hm); zRough = mix(zRough, .28, hm);
          }
          lines *= 1.0 - mGH;
          zCol *= 1.0 - .85 * lines; zRough = mix(zRough, .6, lines);
          // Numéro de course sur les portières
          if (abs(N.x) > .45 && P.y > uNumber.y && P.y < uNumber.y + uNumber.z && abs(P.z - uNumber.x) < uNumber.w * .5) {
            vec2 uv = vec2((P.x > 0.0 ? uNumber.x - P.z : P.z - uNumber.x) / uNumber.w + .5, (P.y - uNumber.y) / uNumber.z);
            vec4 dc = texture2D(uDecal, vec2(uv.x * .5, uv.y));
            zCol = mix(zCol, dc.rgb, dc.a * (1.0 - mGH)); zMetal = mix(zMetal, .1, dc.a); zRough = mix(zRough, .35, dc.a);
          }
          // --- Panneau arrière noir laqué (entre les feux, autour de la plaque) ---
          if (uRearPanel.w > .5 && P.z < -1.98 && N.z < -.3) {
            vec2 q = vec2(ax, P.y - uRearPanel.y); vec2 qq = abs(q) - vec2(uRearPanel.x, uRearPanel.z); float pd = length(max(qq, 0.0)) + min(max(qq.x, qq.y), 0.0) - .04;
            float pm = 1.0 - smoothstep(-.002, .002, pd);
            zCol = mix(zCol, vec3(.01), pm); zRough = mix(zRough, .2, pm); zMetal = mix(zMetal, .1, pm);
          }
          // --- Montants et encadrements : noir laqué ---
          zCol = mix(zCol, uRoof, mRoof * step(.001, abs(uRoof.r - diffuseColor.r) + abs(uRoof.g - diffuseColor.g) + abs(uRoof.b - diffuseColor.b)));
          float mBlack = mGH * (1.0 - mRoof);
          zCol = mix(zCol, vec3(.012), mBlack); zRough = mix(zRough, .18, mBlack); zMetal = mix(zMetal, .1, mBlack);
          // --- Vitrage teinté, sérigraphie noire en bordure ---
          float g = mGlass * mGH;
          float frit = 1.0 - smoothstep(.022, .045, vZA.y);
          float dots = step(zHex(P.xz * 120.0 + P.y * 60.0) , .32 + .6 * (1.0 - smoothstep(.02, .045, vZA.y)));
          vec3 glassC = vec3(.004, .006, .008);
          float fritM = max(1.0 - smoothstep(.018, .022, vZA.y), frit * dots * (1.0 - smoothstep(.0006, .002, length(fwidth(P)))));
          // Bandeau de pare-brise (pare-soleil sérigraphié)
          if (P.z > -.2 && N.z > .1 && P.y > uSun.x) { vec4 sc = texture2D(uDecal, vec2(.5 + .5 * clamp(P.x / 1.3 + .5, 0.0, 1.0), clamp((P.y - uSun.x) / uSun.y, 0.0, 1.0))); glassC = mix(vec3(.015), sc.rgb, sc.a); fritM = max(fritM, .0); }
          vec3 gc = mix(glassC, vec3(.01), fritM);
          zCol = mix(zCol, gc, g); zRough = mix(zRough, mix(.02, .45, fritM), g); zMetal = mix(zMetal, 0.0, g); zCCR = mix(zCCR, 0.0, g);
          // --- Garnitures : carbone ---
          float tw = step(.5, fract((P.x * .7071 + P.z * .7071) * 55.0)) * step(.5, fract(P.y * 55.0 + P.z * 20.0));
          float twFade = 1.0 - smoothstep(.002, .006, length(fwidth(P)));
          vec3 carbon = vec3(.018) * (1.0 + tw * .9 * twFade);
          zCol = mix(zCol, carbon, mTrim); zRough = mix(zRough, .32, mTrim); zMetal = mix(zMetal, .25, mTrim); zCC = mix(zCC, .7, mTrim);
          // --- Creux : noir mat ; grilles alvéolées sur les prises d'air ---
          float grille = (P.z > 1.9 || (ax > .82 && P.z < -.15 && P.z > -1.0)) ? 1.0 : 0.0;
          float hx = zHex((P.z > 1.9 ? P.xy : P.zy) * 38.0);
          float bars = smoothstep(.40, .46, hx) * grille * (1.0 - smoothstep(.003, .008, length(fwidth(P))));
          vec3 cav = mix(vec3(.006), vec3(.06), bars);
          zCol = mix(zCol, cav, mCav); zRough = mix(zRough, mix(.75, .35, bars), mCav); zMetal = mix(zMetal, bars * .6, mCav); zCC = mix(zCC, 0.0, mCav);
          // --- Phares : réflecteur chromé sombre, signature LED en contour, deux modules projecteurs ---
          if (mHead > 0.0) {
            float ring = 1.0 - smoothstep(.006, .011, vZB.y);
            vec2 q = vec2(ax, P.y);
            float pj = min(length(q - uProj.xy), length(q - uProj.zw));
            float proj = 1.0 - smoothstep(.016, .022, pj), projRing = zLine(pj - .026, .002);
            vec3 hc = mix(vec3(.05, .055, .06), vec3(.85), proj * .6 + projRing * .4);
            zCol = mix(zCol, hc, mHead); zRough = mix(zRough, .08, mHead); zMetal = mix(zMetal, .9, mHead); zCC = mix(zCC, 1.0, mHead); zCCR = mix(zCCR, 0.0, mHead);
            zEmit += mHead * vec3(1.0, .97, .92) * uHead * (ring * 5.0 + proj * 2.4 + .06);
          }
          // --- Feux arrière : verre rouge, filet LED, éclat au freinage ---
          if (mTail > 0.0) {
            float ring = 1.0 - smoothstep(.004, .008, vZB.z);
            float rev = (1.0 - smoothstep(.0, .002, abs(ax - .62) - .045)) * step(P.y, .86);
            vec3 tc = mix(vec3(.22, .006, .006), vec3(.5), rev * .5);
            zCol = mix(zCol, tc, mTail); zRough = mix(zRough, .06, mTail); zMetal = mix(zMetal, .1, mTail); zCC = mix(zCC, 1.0, mTail);
            zEmit += mTail * (vec3(1.0, .02, .03) * uTail * (ring * 4.0 + .9) + vec3(1.0, .95, .9) * rev * uRev * 3.0);
          }
          // --- Glace de rétroviseur ---
          zCol = mix(zCol, vec3(.75), mChrome); zRough = mix(zRough, .02, mChrome); zMetal = mix(zMetal, 1.0, mChrome);
          diffuseColor.rgb = zCol;
        }`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n roughnessFactor = zRough;')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\n metalnessFactor = zMetal;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance += zEmit;')
      .replace('#include <lights_physical_fragment>', `#include <lights_physical_fragment>
        #ifdef USE_CLEARCOAT
          material.clearcoat = zCC; material.clearcoatRoughness = max(zCCR, 0.0525) + geometryRoughness;
        #endif`);
  };
  return m;
}

/** Atlas de décors : numéro de portière (moitié gauche) et bandeau de pare-brise (moitié droite). */
export function paintDecal(number, accentCss, textCss = '#ffffff') {
  const W = 1024, H = 512, cv = typeof OffscreenCanvas !== 'undefined' && typeof document === 'undefined' ? new OffscreenCanvas(W, H) : Object.assign(document.createElement('canvas'), { width: W, height: H });
  const x = cv.getContext('2d');
  x.clearRect(0, 0, W, H);
  // Numéro : rond de course, chiffres italiques
  const cxN = 300, cyN = 250;
  x.save();
  x.translate(cxN, cyN);
  x.fillStyle = 'rgba(255,255,255,0.0)';
  x.font = 'italic 900 230px "Archivo", Impact, "Arial Black", Arial, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.lineWidth = 18; x.strokeStyle = 'rgba(8,10,12,0.95)'; x.strokeText(number, 0, 6);
  x.fillStyle = textCss; x.fillText(number, 0, 6);
  x.restore();
  // Bandes fines sous le numéro
  x.fillStyle = accentCss; x.fillRect(60, 420, 400, 10); x.fillStyle = textCss; x.fillRect(60, 438, 300, 5);
  // Bandeau de pare-brise
  x.save(); x.beginPath(); x.rect(512, 0, 512, H); x.clip();
  x.fillStyle = 'rgba(10,12,14,1)'; x.fillRect(512, 0, 512, H);
  x.font = '800 120px "Archivo", Impact, Arial, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
  try { x.letterSpacing = '10px'; } catch (e) { /* ignore */ }
  x.fillStyle = accentCss; x.fillText('JACKPOT', 768, H * 0.52, 440);
  x.restore();
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}
