/** Ciel physique stylisé : dégradé atmosphérique, cumulus procéduraux (fbm), disque solaire. */
export const SKY_FRAG = `
uniform vec3 uSun; uniform float uTime; varying vec3 vDir;
float sHash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float sNoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(sHash(i), sHash(i + vec2(1.0, 0.0)), f.x), mix(sHash(i + vec2(0.0, 1.0)), sHash(i + vec2(1.0, 1.0)), f.x), f.y); }
const mat2 M2 = mat2(1.6, 1.2, -1.2, 1.6);
float fbm(vec2 p){ float a = .5, s = 0.0; for (int i = 0; i < OCT; i++){ s += a * sNoise(p); p = M2 * p; a *= .5; } return s; }
const vec3 ZEN = vec3(.12, .36, .76), MID = vec3(.38, .6, .88), HOR = vec3(.76, .86, .95), SKYK = vec3(1.2);
float cloudD(vec2 uv){
  float q = fbm(uv * .45 + vec2(3.1, 1.7));
  float base = fbm(uv * .9 + q * 1.1);
  float detail = fbm(uv * 3.2 + q * 2.0);
  return base * .78 + detail * .3;
}
void main(){
  vec3 d = normalize(vDir); float h = d.y;
  vec3 col = h > 0.0 ? mix(mix(HOR, MID, smoothstep(0.0, .2, h)), ZEN, smoothstep(.15, .95, h)) : HOR;
  if (h > 0.0) {
    vec2 uv = d.xz / (h + .12) * .55 + vec2(uTime * .011, uTime * .004);
    float n = cloudD(uv);
    float cov = smoothstep(.45, .57, n) * smoothstep(.2, .45, fbm(uv * .18 + 7.3));
    vec2 sd2 = normalize(uSun.xz + 1e-4);
    float n2 = cloudD(uv + sd2 * .06);
    float lit = clamp(.55 + (n - n2) * 6.0, 0.0, 1.0);
    float thick = smoothstep(.5, .7, n);
    vec3 cc = mix(vec3(.56, .63, .74), vec3(1.0, .99, .96), lit);
    cc *= mix(1.0, .82, thick * (1.0 - lit));
    cc = mix(cc, vec3(1.0, .98, .94), pow(lit, 4.0) * (1.0 - thick) * .5);
    float fade = smoothstep(.0, .16, h);
    col = mix(col, cc, cov * fade);
    col = mix(col, HOR, (1.0 - smoothstep(0.0, .09, h)) * .55);
  }
  float sd = max(dot(d, normalize(uSun)), 0.0);
  col += vec3(1.0, .92, .76) * (pow(sd, 4000.0) * 8.0 + pow(sd, 120.0) * .25 + pow(sd, 6.0) * .1);
  gl_FragColor = vec4(pow(col, vec3(2.2)) * SKYK, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;


/**
 * Ciel de nuit de match : bleu nuit profond, nuages bien lisibles éclairés par la lune (liseré argenté)
 * et par la pollution lumineuse de la ville (dessous orangé), lune et halo, étoiles entre les nuages.
 */
export const SKY_DUSK_FRAG = `
uniform vec3 uSun; uniform float uTime; varying vec3 vDir;
float sHash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float sNoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(sHash(i), sHash(i + vec2(1.0, 0.0)), f.x), mix(sHash(i + vec2(0.0, 1.0)), sHash(i + vec2(1.0, 1.0)), f.x), f.y); }
const mat2 M2 = mat2(1.6, 1.2, -1.2, 1.6);
float fbm(vec2 p){ float a = .5, s = 0.0; for (int i = 0; i < OCT; i++){ s += a * sNoise(p); p = M2 * p; a *= .5; } return s; }
float clouds(vec2 uv){ float q = fbm(uv * .45 + vec2(3.1, 1.7)); return fbm(uv * .9 + q * 1.2) * .78 + fbm(uv * 3.1 + q * 2.0) * .3; }
void main(){
  vec3 d = normalize(vDir); float h = d.y;
  vec3 moon = normalize(uSun);
  vec3 zen = vec3(.012, .022, .058), mid = vec3(.03, .052, .12), hor = vec3(.13, .11, .14);
  vec3 col = mix(hor, mid, smoothstep(0.0, .25, h)); col = mix(col, zen, smoothstep(.2, .9, h));
  float md = max(dot(d, moon), 0.0);
  col += vec3(.25, .3, .4) * pow(md, 12.0) * .5 + vec3(.5, .55, .65) * pow(md, 200.0) * .6;     // halo lunaire
  col += vec3(.45, .3, .2) * exp(-abs(h) * 14.0) * .35;                                             // lueur de la ville sur l'horizon
  if (h > 0.0) {
    vec2 uv = d.xz / (h + .12) * .55 + vec2(uTime * .008, uTime * .003);
    float n = clouds(uv);
    float cov = smoothstep(.46, .62, n) * smoothstep(.15, .45, fbm(uv * .2 + 7.3) + .1);
    float n2 = clouds(uv + normalize(moon.xz + 1e-4) * .05);
    float lit = clamp(.5 + (n - n2) * 6.0, 0.0, 1.0);
    float thick = smoothstep(.55, .75, n);
    vec3 under = vec3(.16, .12, .11) * exp(-h * 2.5);                                                // dessous éclairé par la ville
    vec3 cc = vec3(.055, .062, .085) + under + vec3(.32, .36, .45) * lit * (1.0 - thick * .6) * (.35 + .65 * pow(md, 3.0));
    float fade = smoothstep(.0, .14, h);
    // étoiles (masquées par les nuages)
    vec2 sp = d.xz / (h + .3) * 170.0; vec2 si = floor(sp);
    float st = step(.9962, sHash(si)) * smoothstep(.2, .55, h);
    float tw = .55 + .45 * sin(uTime * (1.5 + sHash(si + 3.0) * 3.0) + sHash(si) * 30.0);
    col += vec3(.9, .92, 1.0) * st * tw * smoothstep(.45, .0, length(fract(sp) - .5)) * 1.3 * (1.0 - cov);
    col = mix(col, cc, cov * fade * .92);
    // disque de la lune (devant les nuages fins)
    col = mix(col, vec3(1.6, 1.58, 1.5), smoothstep(.99955, .9997, md) * (1.0 - thick * .8));
  } else {
    col = mix(col, vec3(.02, .022, .03), smoothstep(0.0, -.08, h));
  }
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;
