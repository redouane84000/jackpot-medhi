import { buildCarBodyData } from './CarShape.js';

/**
 * Génération des carrosseries dans des Web Workers (en parallèle, sans bloquer le chargement du stade).
 * Page autonome : le code du worker est injecté à la construction (__CAR_WORKER_SRC__) et lancé depuis un Blob.
 * Sans Worker disponible, la génération se fait directement (plus lente, même résultat).
 */
const pending = new Map();

function makeWorker() {
  /* global __CAR_WORKER_SRC__ */
  if (typeof __CAR_WORKER_SRC__ !== 'undefined') {
    const url = URL.createObjectURL(new Blob([__CAR_WORKER_SRC__], { type: 'text/javascript' }));
    return new Worker(url);
  }
  return new Worker(new URL('./carWorker.js', import.meta.url), { type: 'module' });
}

export function requestCarBody(model, h = 0.02) {
  const key = model + '@' + h;
  if (pending.has(key)) return pending.get(key);
  const p = new Promise(resolve => {
    let w = null;
    try { w = typeof Worker !== 'undefined' ? makeWorker() : null; } catch (e) { w = null; }
    if (!w) { resolve(buildCarBodyData(model, { h })); return; }
    const fallback = () => { try { w.terminate(); } catch (e) { /* ignore */ } resolve(buildCarBodyData(model, { h })); };
    const timer = setTimeout(fallback, 20000);
    w.onmessage = e => { clearTimeout(timer); w.terminate(); resolve(e.data.data); };
    w.onerror = ev => { clearTimeout(timer); ev.preventDefault?.(); fallback(); };
    w.postMessage({ id: key, model, h });
  });
  pending.set(key, p);
  return p;
}
