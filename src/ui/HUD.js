/**
 * Interface : tableau de score, chrono, jauge de boost, annonces animées, menus (principal, pause, fin).
 * Elle lit l'état du match et n'en décide jamais.
 */
const fmt = s => { s = Math.max(0, s); const m = Math.floor(s / 60), r = Math.floor(s % 60); return `${m}:${String(r).padStart(2, '0')}`; };
const fmtUp = s => `+${fmt(s)}`;
const TEAM_FR = { blue: 'Bleu', orange: 'Orange' };

const CONTROLS = [
  ['Z / W', 'Accélérer'], ['S', 'Freiner, puis reculer'], ['Q / A · D', 'Tourner'],
  ['Espace', 'Sauter · 2ᵉ appui : double saut'], ['Espace + direction', 'Figure (en l’air)'], ['Maj', 'Boost'],
  ['Ctrl ou X', 'Dérapage'], ['E', 'Rotation aérienne'], ['C', 'Caméra ballon'], ['Échap', 'Pause'], ['M', 'Son'],
];

/** Fiches des véhicules (texte d'ambiance ; les performances viennent de CONFIG.CAR_MODELS). */
const CARS = [
  { id: 'typhon', name: 'Typhon S', tag: 'V8 biturbo', engine: 'V8 biturbo 4,0 L · 720 ch · capot carbone', blurb: 'Couple énorme, grosses accélérations, pétarades au lever de pied.' },
  { id: 'vortex', name: 'Vortex GT', tag: 'V12', engine: 'V12 atmosphérique 6,5 L · 780 ch · aileron', blurb: 'Plus légère, plus rapide en pointe, monte haut dans les tours.' },
];

export class HUD {
  constructor(root, { models = {}, model = 'typhon' } = {}) {
    this.root = root;
    // barres de caractéristiques normalisées entre les deux modèles
    const stat = (id, key, inv = false) => { const v = models[id]?.[key] ?? 1, all = Object.values(models).map(m => m[key] ?? 1), lo = Math.min(...all), hi = Math.max(...all); const t = hi > lo ? (v - lo) / (hi - lo) : 0.5; return 0.55 + 0.4 * (inv ? 1 - t : t); };
    const carCards = CARS.map(c => `<label class="car"><input type="radio" name="car" value="${c.id}"${c.id === model ? ' checked' : ''}><span class="card">
        <span class="ct"><span class="cn">${c.name}</span><span class="tag">${c.tag}</span></span>
        <span class="ce">${c.engine}</span>
        <span class="bars"><span>Accélération</span><i style="--v:${stat(c.id, 'accel').toFixed(2)}"></i><span>Vitesse de pointe</span><i style="--v:${stat(c.id, 'maxSpeed').toFixed(2)}"></i><span>Poids (impact)</span><i style="--v:${stat(c.id, 'mass').toFixed(2)}"></i></span>
      </span></label>`).join('');
    root.innerHTML = `
      <div class="hud" id="hud" hidden>
        <div class="score" aria-live="polite">
          <div class="team blue"><span class="name">Bleu</span><span class="pts" id="sB">0</span></div>
          <div class="clock"><span id="clock">5:00</span><span class="ot" id="ot" hidden>Prolongation</span></div>
          <div class="team orange"><span class="pts" id="sO">0</span><span class="name">Orange</span></div>
        </div>
        <div class="boost" id="boost">
          <svg viewBox="0 0 120 120" aria-hidden="true"><circle class="track" cx="60" cy="60" r="50"/><circle class="fill" id="bFill" cx="60" cy="60" r="50"/></svg>
          <div class="bval"><span id="bNum">33</span><small>Boost</small></div>
          <div class="speed"><span id="spd">0</span> km/h</div>
        </div>
        <div class="hint" id="hint">C caméra · Échap pause</div>
        <div class="toast" id="toast" hidden></div>
      </div>
      <div class="center" id="center" aria-live="assertive"></div>
      <div class="flash" id="flash"></div>
      <section class="menu" id="menu" hidden>
        <div class="menu-col">
          <p class="eyebrow">Football automobile · 1 contre 1</p>
          <h1 class="title"><span>Jackpot</span><span>Medhi</span></h1>
          <p class="lede">Tu pilotes la voiture <b class="tb">bleue</b>. Pousse le ballon dans la cage <b class="to">orange</b>. Cinq minutes, le meilleur score gagne ; en cas d’égalité, le premier but l’emporte.</p>
          <fieldset class="cars" id="cars"><legend>Véhicule</legend>${carCards}</fieldset>
          <fieldset class="diff" id="diff"><legend>Adversaire</legend>
            <label><input type="radio" name="diff" id="dEasy" value="0.45"><span>Facile</span></label>
            <label><input type="radio" name="diff" id="dNormal" value="0.72" checked><span>Normal</span></label>
            <label><input type="radio" name="diff" id="dHard" value="0.95"><span>Difficile</span></label>
          </fieldset>
          <div class="row"><button class="primary" id="play" type="button">Jouer</button><button class="ghost" id="keysBtn" type="button" aria-expanded="false">Commandes</button></div>
          <p class="foot">Manette compatible. Sur téléphone, des commandes tactiles apparaissent.</p>
        </div>
        <div class="showcase" id="showcase" aria-hidden="true"><span class="sn" id="scName"></span><span class="se" id="scEngine"></span></div>
        <div class="keys menu-keys" id="menuKeys" aria-label="Commandes" hidden>${CONTROLS.map(([k, v]) => `<div><kbd>${k}</kbd><span>${v}</span></div>`).join('')}</div>
      </section>
      <section class="overlay" id="pause" hidden>
        <h2>Pause</h2>
        <div class="btns"><button class="primary" id="resume" type="button">Reprendre</button><button id="restart" type="button">Recommencer</button><button id="toMenu" type="button">Menu principal</button></div>
        <div class="keys compact">${CONTROLS.map(([k, v]) => `<div><kbd>${k}</kbd><span>${v}</span></div>`).join('')}</div>
      </section>
      <section class="overlay end" id="end" hidden>
        <p class="eyebrow" id="endEyebrow">Fin du match</p>
        <h2 id="endTitle">Victoire</h2>
        <p class="final" id="endScore"></p>
        <div class="btns"><button class="primary" id="again" type="button">Rejouer</button><button id="endMenu" type="button">Menu principal</button></div>
      </section>
      <div class="loading" id="loading"><span id="loadMsg">Chargement de l’arène</span></div>`;
    const $ = id => root.querySelector('#' + id);
    this.el = { hud: $('hud'), sB: $('sB'), sO: $('sO'), clock: $('clock'), ot: $('ot'), bFill: $('bFill'), bNum: $('bNum'), spd: $('spd'), boost: $('boost'), center: $('center'), flash: $('flash'), menu: $('menu'), pause: $('pause'), end: $('end'), endTitle: $('endTitle'), endScore: $('endScore'), endEyebrow: $('endEyebrow'), loading: $('loading'), loadMsg: $('loadMsg'), toast: $('toast'), hint: $('hint') };
    this.circ = 2 * Math.PI * 50;
    this.el.bFill.style.strokeDasharray = `${this.circ}`;
    this.cache = {};
    this.cb = {};
    $('play').addEventListener('click', () => this.cb.play?.(+root.querySelector('input[name=diff]:checked').value));
    $('resume').addEventListener('click', () => this.cb.resume?.());
    $('restart').addEventListener('click', () => this.cb.restart?.());
    $('toMenu').addEventListener('click', () => this.cb.menu?.());
    $('again').addEventListener('click', () => this.cb.restart?.());
    $('endMenu').addEventListener('click', () => this.cb.menu?.());
    const keysBtn = $('keysBtn'), mk = $('menuKeys');
    keysBtn.addEventListener('click', () => { mk.hidden = !mk.hidden; keysBtn.setAttribute('aria-expanded', String(!mk.hidden)); });
    root.querySelectorAll('input[name=car]').forEach(r => r.addEventListener('change', () => { if (r.checked) { this.setCar(r.value); this.cb.model?.(r.value); } }));
    this.setCar(model);
    try { const d = localStorage.getItem('ja-diff'); if (d) { const r = root.querySelector(`input[name=diff][value="${d}"]`); if (r) r.checked = true; } } catch (e) { /* stockage indisponible */ }
    root.querySelectorAll('input[name=diff]').forEach(r => r.addEventListener('change', () => { try { localStorage.setItem('ja-diff', r.value); } catch (e) { /* ignore */ } }));
  }

  on(name, fn) { this.cb[name] = fn; }
  /** Légende animée du véhicule exposé dans le menu. */
  setCar(id) {
    const c = CARS.find(k => k.id === id) || CARS[0], sc = this.root.querySelector('#showcase');
    this.root.querySelector('#scName').textContent = c.name; this.root.querySelector('#scEngine').textContent = c.blurb;
    sc.classList.remove('in'); void sc.offsetWidth; sc.classList.add('in');
  }
  setLoading(msg) { if (msg) { this.el.loading.hidden = false; this.el.loadMsg.textContent = msg; } else this.el.loading.classList.add('off'); }
  error(msg) { this.el.loading.hidden = false; this.el.loading.classList.remove('off'); this.el.loading.classList.add('err'); this.el.loadMsg.textContent = msg; }

  /** Les commandes tactiles disparaissent derrière les menus (elles intercepteraient les appuis). */
  _overlay() { document.body.classList.toggle('ui-overlay', !this.el.menu.hidden || !this.el.pause.hidden || !this.el.end.hidden); }
  showMenu(v) { this.el.menu.hidden = !v; this.el.hud.hidden = v; this._overlay(); if (v) this.root.querySelector('#play').focus({ preventScroll: true }); }
  showPause(v) { this.el.pause.hidden = !v; this._overlay(); if (v) this.root.querySelector('#resume').focus({ preventScroll: true }); }
  showEnd(v, data) {
    this.el.end.hidden = !v; this._overlay(); if (!v) return;
    const won = data.winner === data.playerTeam;
    this.el.end.dataset.result = won ? 'win' : 'lose';
    this.el.endTitle.textContent = won ? 'Victoire' : 'Défaite';
    this.el.endEyebrow.textContent = data.overtime ? 'But en or · fin du match' : 'Fin du match';
    this.el.endScore.innerHTML = `<span class="tb">Bleu ${data.score.blue}</span> <span class="sep">—</span> <span class="to">${data.score.orange} Orange</span>`;
    this.root.querySelector('#again').focus({ preventScroll: true });
  }

  update(match, car) {
    const c = this.cache, e = this.el;
    const clock = match.overtime ? fmtUp(match.clock) : fmt(Math.ceil(match.clock - 1e-6));
    if (c.clock !== clock) { e.clock.textContent = clock; c.clock = clock; }
    if (c.ot !== match.overtime) { e.ot.hidden = !match.overtime; c.ot = match.overtime; }
    if (c.sB !== match.score.blue) { e.sB.textContent = match.score.blue; c.sB = match.score.blue; }
    if (c.sO !== match.score.orange) { e.sO.textContent = match.score.orange; c.sO = match.score.orange; }
    const b = Math.round(car.boost);
    if (c.b !== b) { e.bNum.textContent = b; e.bFill.style.strokeDashoffset = `${this.circ * (1 - b / 100)}`; e.boost.classList.toggle('empty', b < 1); e.boost.classList.toggle('full', b >= 100); c.b = b; }
    e.boost.classList.toggle('active', car.boosting);
    const kmh = Math.round(Math.abs(car.fwdSpeed) * 3.6);
    if (c.kmh !== kmh) { e.spd.textContent = kmh; c.kmh = kmh; }
  }

  /** Annonce centrale animée (compte à rebours, but, prolongation…). */
  announce(html, cls, ms = 1200) {
    const d = document.createElement('div'); d.className = 'ann ' + cls; d.innerHTML = html;
    this.el.center.appendChild(d);
    setTimeout(() => d.remove(), ms);
  }
  countdown(n) { this.announce(`<span>${n}</span>`, 'count', 950); }
  go() { this.announce('<span>Go</span>', 'count go', 900); }
  goal(team, score, playerTeam) {
    this.announce(`<div class="band ${team}"><span class="big">But</span><span class="sub">${TEAM_FR[team]} marque · ${score.blue} – ${score.orange}</span></div>`, 'goal ' + (team === playerTeam ? 'mine' : 'theirs'), 2900);
    this.flash(team);
  }
  overtime() { this.announce('<div class="band gold"><span class="big">Prolongation</span><span class="sub">Le prochain but gagne</span></div>', 'goal', 2200); }
  flash(team) { const f = this.el.flash; f.className = 'flash ' + team; void f.offsetWidth; f.classList.add('on'); }
  toast(msg) { const t = this.el.toast; t.textContent = msg; t.hidden = false; clearTimeout(this._tt); this._tt = setTimeout(() => { t.hidden = true; }, 1400); }
}
