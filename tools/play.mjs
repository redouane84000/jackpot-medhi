// Pilote le jeu dans Chromium headless : menu, lancement, avance du temps, captures, erreurs console.
const { chromium } = await import(process.env.PLAYWRIGHT_PATH || 'playwright');   // npm i -D playwright
const [url = 'http://localhost:8777/preview/game.html', w = 960, h = 600, script = 'menu'] = process.argv.slice(2);
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const mobile = +w < 600; const ctx = await b.newContext({ viewport: { width: +w, height: +h }, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: 1 }); const p = await ctx.newPage(); const logs = [];
p.on('pageerror', e => logs.push('PAGEERROR ' + e.message + '\n' + (e.stack || '').split('\n').slice(0, 4).join('\n')));
p.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') logs.push(m.type() + ' ' + m.text().slice(0, 300)); });
await p.goto(url + (process.env.Q ? (url.includes('?') ? '&' : '?') + 'q=' + process.env.Q : ''));
await p.waitForFunction(() => window.__game && window.__game.last, null, { timeout: 180000 });
const shot = async name => { await p.screenshot({ path: `preview/${name}.png`, timeout: 240000 }); console.log('shot', name); };
const steps = script.split(',');
for (const st of steps) {
  const [cmd, arg] = st.split(':');
  if (cmd === 'menu') { await p.evaluate(() => window.__game.debugRun(0.5)); await shot('g-menu'); }
  else if (cmd === 'play') { if (mobile) await p.tap('#play'); else await p.click('#play'); await p.evaluate(() => { window.__game.debugRun(0.05); }); }
  else if (cmd === 'auto') await p.evaluate(() => window.__game.debugAutopilot(true));
  else if (cmd === 'run') { await p.evaluate(s => window.__game.debugRun(+s), arg); }
  else if (cmd === 'shot') { await p.waitForTimeout(800); await shot(arg); }
  else if (cmd === 'key') { await p.keyboard.down(arg); }
  else if (cmd === 'up') { await p.keyboard.up(arg); }
  else if (cmd === 'press') { await p.keyboard.press(arg); }
  else if (cmd === 'shoot') { await p.evaluate(side => { const g = window.__game, b = g.sim.ball; const s = +side || 1; b.reset(3, 2.5, s * 40); b.body.setLinvel({ x: -1, y: 1.5, z: s * 26 }, true); }, arg); }
  else if (cmd === 'pause') { await p.keyboard.press('Escape'); await p.evaluate(() => window.__game.debugRun(0.05)); }
  else if (cmd === 'finish') { await p.evaluate(() => { const g = window.__game; g.sim.match.timeLeft = 0.5; }); }
  else if (cmd === 'freeze') { await p.evaluate(ms => document.getAnimations().forEach(a => { a.pause(); a.currentTime = +ms; }), arg); }
  else if (cmd === 'banner') { await p.evaluate(() => { const g = window.__game; g.hud.goal('blue', { blue: 2, orange: 1 }, 'blue'); }); }
  else if (cmd === 'count') { await p.evaluate(() => window.__game.hud.countdown(2)); }
  else if (cmd === 'endnow') { await p.evaluate(() => { const g = window.__game; g.sim.match.score.blue = 3; g.sim.match.score.orange = 1; g.sim.match.state = 'PLAYING'; g.sim.match.timeLeft = 0.2; }); }
  else if (cmd === 'cam') { await p.keyboard.press('KeyC'); await p.evaluate(() => window.__game.debugRun(0.05)); }
  else if (cmd === 'state') console.log('state', await p.evaluate(() => { const g = window.__game, M = g.sim.match; const c = g.player.body.translation(); return JSON.stringify({ state: M.state, score: M.score, clock: M.clock.toFixed(1), car: [c.x.toFixed(1), c.y.toFixed(2), c.z.toFixed(1)], speed: g.player.speed.toFixed(1), boost: g.player.boost.toFixed(0), ai: g.brain.state, cam: g.rig.mode }); }));
}
console.log(logs.slice(0, 15).join('\n') || 'no console errors');
await b.close();
