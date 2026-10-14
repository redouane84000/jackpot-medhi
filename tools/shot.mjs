const { chromium } = await import(process.env.PLAYWRIGHT_PATH || 'playwright');   // npm i -D playwright
const [url, out, w = 960, h = 600, waitFn = 'window.done'] = process.argv.slice(2);
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: +w, height: +h } }); const errs = [];
p.on('pageerror', e => errs.push('ERR ' + e.message)); p.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.type() + ' ' + m.text().slice(0, 300)); });
await p.goto(url); await p.waitForFunction(waitFn, null, { timeout: 180000 });
await p.screenshot({ path: out, timeout: 240000 });
console.log(errs.slice(0, 10).join('\n') || 'ok'); await b.close();
