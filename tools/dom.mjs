import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 960, height: 600 } });
await p.goto('http://localhost:8777/preview/game.html');
await p.waitForFunction(() => window.__game && window.__game.last, null, { timeout: 180000 });
const r = await p.evaluate(() => {
  const g = window.__game; g.halted = true;
  g.hud.goal('blue', { blue: 2, orange: 1 }, 'blue');
  document.getAnimations().forEach(a => { a.pause(); a.currentTime = 900; });
  const ann = document.querySelector('.ann'), band = document.querySelector('.ann .band'), c = document.querySelector('.center');
  const cs = band && getComputedStyle(band), rb = band?.getBoundingClientRect(), rc = c.getBoundingClientRect(), ra = ann?.getBoundingClientRect();
  return { n: document.querySelectorAll('.ann').length, opacity: cs?.opacity, clip: cs?.clipPath, display: cs?.display, band: rb && [rb.x, rb.y, rb.width, rb.height], ann: ra && [ra.x, ra.y, ra.width, ra.height], center: [rc.x, rc.y, rc.width, rc.height], centerHidden: getComputedStyle(c).display, anims: document.getAnimations().map(a => a.animationName + ':' + a.currentTime) };
});
console.log(JSON.stringify(r)); await p.screenshot({ path: 'preview/dom.png' }); await b.close();
