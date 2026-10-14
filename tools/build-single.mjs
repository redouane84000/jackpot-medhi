// Construit une page autonome (dist/jackpot-arena.html) : code du jeu regroupé par esbuild,
// Three.js et Rapier chargés depuis le CDN jsDelivr (versions figées). Option --local : chemins node_modules (tests hors ligne).
import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const local = process.argv.includes('--local');
const CDN = {
  three: 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js',
  rapier: 'https://cdn.jsdelivr.net/npm/@dimforge/rapier3d-compat@0.19.3/rapier.mjs',
};
const LOCAL = { three: '../node_modules/three/build/three.module.js', rapier: '../node_modules/@dimforge/rapier3d-compat/rapier.mjs' };
const url = local ? LOCAL : CDN;

// Worker de génération des carrosseries : regroupé à part, puis injecté dans la page (lancé depuis un Blob)
const wk = await build({ entryPoints: [new URL('../src/render/car/carWorker.js', import.meta.url).pathname], bundle: true, format: 'iife', write: false, minify: true, target: 'es2020', legalComments: 'none' });
const workerSrc = wk.outputFiles[0].text;

const r = await build({
  entryPoints: [new URL('../src/main.js', import.meta.url).pathname],
  bundle: true, format: 'esm', write: false, minify: true, target: 'es2020',
  define: { __CAR_WORKER_SRC__: JSON.stringify(workerSrc) },
  // « three » et Rapier restent externes (CDN) ; les modules d'exemples de three (GLTFLoader) sont inclus dans le paquet
  plugins: [{ name: 'externals', setup(b) {
    b.onResolve({ filter: /^three$|^@dimforge\/rapier3d-compat$/ }, a => ({ path: a.path, external: true }));
    b.onResolve({ filter: /^three\/examples\// }, a => ({ path: new URL('../node_modules/' + a.path, import.meta.url).pathname }));
  } }],
  legalComments: 'none',
});
let js = r.outputFiles[0].text;
js = js.replace(/from"three"/g, `from"${url.three}"`).replace(/from"@dimforge\/rapier3d-compat"/g, `from"${url.rapier}"`);
if (/from"(three|@dimforge)/.test(js) || /import\("three/.test(js)) throw new Error('import non résolu');
js = js.replace(/<\/script/gi, '<\\/script');

let html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
if (!local) {
  // L'artifact fournit lui-même doctype, html, head, body, charset et viewport
  html = html.replace(/<!doctype html>\s*/i, '').replace(/<\/?html[^>]*>\s*/gi, '').replace(/<\/?head>\s*/gi, '').replace(/<\/?body>\s*/gi, '')
    .replace(/<meta charset="utf-8">\s*/i, '').replace(/<meta name="viewport"[^>]*>\s*/i, '');
}
html = html.replace('<script type="module" src="/src/main.js"></script>', () => `<script type="module">\n${js}\n</script>`);
mkdirSync(new URL('../dist/', import.meta.url), { recursive: true });
const out = new URL(`../dist/${local ? 'local-test' : 'jackpot-arena'}.html`, import.meta.url);
writeFileSync(out, html);
console.log(out.pathname, (html.length / 1024).toFixed(0) + ' Ko');
