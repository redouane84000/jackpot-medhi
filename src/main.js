import RAPIER from '@dimforge/rapier3d-compat';
import { Game } from './core/Game.js';
import { bodyReady } from './render/VehicleVisual.js';

/** Point d'entrée : initialise le moteur physique (WebAssembly), puis le jeu. */
const boot = document.getElementById('boot');
const fail = msg => { if (boot) { boot.classList.add('err'); boot.textContent = msg; } };

(async () => {
  // Les carrosseries se construisent en arrière-plan (Web Workers) pendant le reste du chargement
  const bodies = Promise.all(['typhon', 'vortex'].map(m => bodyReady(m)));
  try { await RAPIER.init(); }
  catch (e) {
    console.error(e);
    const wasm = typeof WebAssembly === 'undefined' || /WebAssembly|wasm|Content Security|CompileError|unsafe-eval/i.test(String(e && (e.message || e)));
    fail(wasm
      ? 'Cette page bloque WebAssembly : le moteur physique (Rapier) ne peut pas démarrer ici. Lance le projet en local : npm install, puis npm run dev.'
      : 'Le moteur physique n’a pas pu démarrer dans ce navigateur. Essaie une version récente de Chrome, Edge, Firefox ou Safari.');
    return;
  }
  try { await Promise.race([document.fonts?.load('900 40px Archivo'), new Promise(r => setTimeout(r, 1500))]); } catch (e) { /* police de secours */ }
  let game;
  try { game = new Game(RAPIER, { canvas: document.getElementById('c'), uiRoot: document.getElementById('ui') }); }
  catch (e) { console.error(e); fail('La 3D ne peut pas démarrer sur cet appareil (WebGL indisponible).'); return; }
  window.__game = game;               // accès de diagnostic et de test
  await bodies;
  game.start();
  boot?.remove();
})();
