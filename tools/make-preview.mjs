// Génère preview/game.html : la page du jeu avec une import map vers node_modules (test local sans bundler).
import { readFileSync, writeFileSync } from 'node:fs';
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const map = `<script type="importmap">{"imports":{"three":"../node_modules/three/build/three.module.js","three/examples/jsm/":"../node_modules/three/examples/jsm/","@dimforge/rapier3d-compat":"../node_modules/@dimforge/rapier3d-compat/rapier.mjs"}}</script>
<script type="module" src="../src/main.js"></script>`;
writeFileSync(new URL('../preview/game.html', import.meta.url), html.replace('<script type="module" src="/src/main.js"></script>', map));
console.log('preview/game.html');
