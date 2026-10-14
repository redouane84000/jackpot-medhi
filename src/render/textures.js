import * as THREE from 'three';

/** Textures procédurales (canvas) : aucune image externe, aucun logo réel. */
export const TAU = Math.PI * 2;
export const rand = (a, b) => a + Math.random() * (b - a);
export const mkCanvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
let ANISO = 8;
export const setAnisotropy = a => { ANISO = a; };
export function canvasTex(c, o = {}) {
  const t = new THREE.CanvasTexture(c);
  if (o.srgb !== false) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = ANISO;
  if (o.wrap) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
const hexA = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},${a})`; };

/** Détail de gazon synthétique (brins, granulats), tuilable. */
export function paintTurfDetail() {
  const S = 512, c = mkCanvas(S, S), x = c.getContext('2d');
  x.fillStyle = '#b8bfad'; x.fillRect(0, 0, S, S);
  for (let i = 0; i < 9000; i++) { x.fillStyle = `rgba(${Math.random() < .5 ? '60,72,44' : '230,236,214'},${rand(.05, .14)})`; x.fillRect(Math.random() * S, Math.random() * S, rand(2, 6), rand(2, 6)); }
  x.lineCap = 'round';
  for (let i = 0; i < 26000; i++) {
    const px = Math.random() * S, py = Math.random() * S, len = rand(3, 9), ang = -Math.PI / 2 + rand(-.6, .6);
    x.strokeStyle = `hsla(${rand(70, 105)},${rand(10, 30)}%,${rand(52, 96)}%,${rand(.35, .9)})`; x.lineWidth = rand(.8, 1.8);
    const ex = Math.cos(ang) * len, ey = Math.sin(ang) * len;
    for (const ox of [0, px < 12 ? S : px > S - 12 ? -S : 0]) for (const oy of [0, py < 12 ? S : py > S - 12 ? -S : 0]) { x.beginPath(); x.moveTo(px + ox, py + oy); x.lineTo(px + ox + ex, py + oy + ey); x.stroke(); }
  }
  for (let i = 0; i < 2600; i++) { x.fillStyle = `rgba(40,48,28,${rand(.25, .5)})`; x.beginPath(); x.arc(Math.random() * S, Math.random() * S, rand(.6, 1.6), 0, TAU); x.fill(); }
  return c;
}

/** Silhouettes de supporters : R = maillot, G = peau, B = cheveux, A = découpe (4 variantes). */
export function paintCrowd() {
  const W = 64, H = 96, c = mkCanvas(W * 4, H), x = c.getContext('2d');
  const R_ = 'rgb(255,0,0)', G_ = 'rgb(0,255,0)', B_ = 'rgb(0,0,255)';
  const rr = (X, Y, w, h, r) => { x.beginPath(); x.moveTo(X + r, Y); x.arcTo(X + w, Y, X + w, Y + h, r); x.arcTo(X + w, Y + h, X, Y + h, r); x.arcTo(X, Y + h, X, Y, r); x.arcTo(X, Y, X + w, Y, r); x.closePath(); x.fill(); };
  for (let v = 0; v < 4; v++) {
    const ox = v * W;
    x.fillStyle = R_; rr(ox + 12, 46, 40, 52, 12);
    if (v === 1 || v === 3) { x.save(); x.strokeStyle = R_; x.lineWidth = 9; x.lineCap = 'round'; x.beginPath(); x.moveTo(ox + 16, 54); x.lineTo(ox + 8, 22); x.moveTo(ox + 48, 54); x.lineTo(ox + 56, 22); x.stroke(); x.fillStyle = G_; x.beginPath(); x.arc(ox + 8, 18, 5, 0, TAU); x.arc(ox + 56, 18, 5, 0, TAU); x.fill(); x.restore(); }
    if (v === 2) { x.fillStyle = R_; x.fillRect(ox + 4, 50, 56, 7); }
    x.fillStyle = G_; x.beginPath(); x.ellipse(ox + 32, 32, 11, 13, 0, 0, TAU); x.fill();
    x.fillStyle = B_; x.beginPath(); x.ellipse(ox + 32, 25, 12, 8 + (v % 2) * 3, 0, Math.PI, TAU); x.fill();
    if (v === 3) { x.fillStyle = R_; x.beginPath(); x.ellipse(ox + 32, 22, 13, 7, 0, Math.PI, TAU); x.fill(); }
  }
  return c;
}

/** Bandeau LED du pied des vitres : chevrons et nom de l'arène, couleur d'équipe. */
export function paintBoard(accent, accent2) {
  const W = 1024, H = 64, c = mkCanvas(W, H), x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#071a22'); g.addColorStop(1, '#03090d'); x.fillStyle = g; x.fillRect(0, 0, W, H);
  for (let i = 0; i < 6; i++) { const X = 560 + i * 62; x.fillStyle = i % 2 ? accent2 : accent; x.beginPath(); x.moveTo(X, 8); x.lineTo(X + 26, 32); x.lineTo(X, 56); x.lineTo(X - 16, 56); x.lineTo(X + 10, 32); x.lineTo(X - 16, 8); x.closePath(); x.fill(); }
  x.font = '900 40px "Archivo", Impact, "Arial Black", Arial, sans-serif'; x.textBaseline = 'middle'; x.fillStyle = '#eaf6f8';
  try { x.letterSpacing = '6px'; } catch (e) { /* navigateurs anciens */ }
  x.fillText('JACKPOT ARENA', 40, 35);
  x.fillStyle = 'rgba(255,255,255,.07)'; for (let y = 0; y < H; y += 3) x.fillRect(0, y, W, 1);
  return c;
}

/** Billets fictifs (deux variantes) : motifs guillochés originaux, aucune devise réelle. */
export function paintBillAtlas() {
  const c = mkCanvas(1024, 1024), x = c.getContext('2d');
  const bill = (oy, v) => {
    const w = 1024, h = 512;
    x.save(); x.translate(0, oy); x.beginPath(); x.rect(0, 0, w, h); x.clip();
    const pal = v === 0 ? { p0: '#d9ecc9', p1: '#a3cc8c', ink: '#24502b', ink2: '#4f8746' } : { p0: '#d4ebe2', p1: '#97c7b3', ink: '#1b4a42', ink2: '#3f7d70' };
    let g = x.createLinearGradient(0, 0, w, 0); g.addColorStop(0, pal.p1); g.addColorStop(.45, pal.p0); g.addColorStop(1, pal.p1);
    x.fillStyle = g; x.fillRect(0, 0, w, h);
    x.lineWidth = 1.1; x.strokeStyle = hexA(pal.ink2, .2);
    for (let k = 0; k < 40; k++) { x.beginPath(); for (let px = 0; px <= w; px += 6) { const y = h * .1 + k * (h * .8 / 39) + Math.sin(px * .021 + k * .35) * 7 + Math.sin(px * .007 + k) * 5; px ? x.lineTo(px, y) : x.moveTo(px, y); } x.stroke(); }
    const rose = (cx, cy, R1, r1, d, col, lw) => { x.strokeStyle = col; x.lineWidth = lw; x.beginPath(); for (let t = 0; t <= TAU + .01; t += .006) { const X = (R1 - r1) * Math.cos(t) + d * Math.cos((R1 - r1) / r1 * t), Y = (R1 - r1) * Math.sin(t) - d * Math.sin((R1 - r1) / r1 * t); t ? x.lineTo(cx + X, cy + Y) : x.moveTo(cx + X, cy + Y); } x.stroke(); };
    rose(w * .24, h * .52, 130, 10, 46, hexA(pal.ink, .55), 1.2); rose(w * .24, h * .52, 84, 7, 30, hexA(pal.ink, .45), 1);
    x.strokeStyle = pal.ink; x.lineWidth = 5; x.strokeRect(16, 16, w - 32, h - 32); x.lineWidth = 1.5; x.strokeRect(28, 28, w - 56, h - 56);
    x.fillStyle = pal.ink; x.font = '700 88px Georgia, "Times New Roman", serif'; x.textBaseline = 'alphabetic';
    x.textAlign = 'left'; x.fillText('100', 50, 122); x.textAlign = 'right'; x.fillText('100', w - 50, h - 48);
    x.textAlign = 'center'; x.font = '800 64px Georgia, serif'; x.fillStyle = hexA(pal.ink, .8); x.fillText('JACKPOT', w * .7, h * .56);
    x.restore();
  };
  bill(0, 0); bill(512, 1);
  return c;
}

export function paintCoin(bump) {
  const S = 256, c = mkCanvas(S, S), x = c.getContext('2d'), m = S / 2;
  if (!bump) { const g = x.createRadialGradient(m * .8, m * .8, 0, m, m, m); g.addColorStop(0, '#fffaf0'); g.addColorStop(1, '#efe0b8'); x.fillStyle = g; x.fillRect(0, 0, S, S); }
  else { x.fillStyle = '#5a5a5a'; x.fillRect(0, 0, S, S); }
  const ring = (r0, r1, col) => { x.fillStyle = col; x.beginPath(); x.arc(m, m, r1, 0, TAU); x.arc(m, m, r0, 0, TAU, true); x.fill(); };
  ring(m * .86, m, bump ? '#e6e6e6' : '#f4e6c2'); ring(m * .74, m * .78, bump ? '#b8b8b8' : '#d8c08a');
  x.beginPath(); for (let i = 0; i < 10; i++) { const a = i / 10 * TAU - Math.PI / 2, r = i % 2 ? m * .2 : m * .46; i ? x.lineTo(m + Math.cos(a) * r, m + Math.sin(a) * r) : x.moveTo(m + Math.cos(a) * r, m + Math.sin(a) * r); } x.closePath();
  x.fillStyle = bump ? '#ffffff' : '#fff6dc'; x.fill();
  return c;
}

/** Disque lumineux doux (halos, projecteurs, lueurs). */
export function paintGlow() {
  const c = mkCanvas(128, 128), x = c.getContext('2d'), g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(.25, 'rgba(255,255,255,.5)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 128, 128); return c;
}

/** Filet de cage : maillage hexagonal. */
export function paintNet() {
  const S = 128, c = mkCanvas(S, S), x = c.getContext('2d');
  x.clearRect(0, 0, S, S); x.strokeStyle = 'rgba(255,255,255,.95)'; x.lineWidth = 3;
  const r = 16, h = r * Math.sqrt(3);
  for (let row = -1; row < 6; row++) for (let col = -1; col < 6; col++) {
    const cx = col * r * 3 + (row % 2 ? r * 1.5 : 0), cy = row * h / 2;
    x.beginPath(); for (let i = 0; i <= 6; i++) { const a = i / 6 * TAU; i ? x.lineTo(cx + r * Math.cos(a), cy + r * Math.sin(a)) : x.moveTo(cx + r * Math.cos(a), cy + r * Math.sin(a)); } x.stroke();
  }
  return c;
}

/** Sculpture de pneu (relief). */
export function paintTread() {
  const c = mkCanvas(256, 32), x = c.getContext('2d');
  x.fillStyle = '#808080'; x.fillRect(0, 0, 256, 32);
  x.fillStyle = '#202020'; for (let i = 0; i < 256; i += 10) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i + 5, 16); x.lineTo(i, 32); x.lineTo(i + 3, 32); x.lineTo(i + 8, 16); x.lineTo(i + 3, 0); x.fill(); }
  x.fillRect(0, 14, 256, 4);
  return c;
}
