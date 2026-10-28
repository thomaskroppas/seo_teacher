// Генерация иконок PWA: node scripts/make-icons.js  (нужен playwright и chromium)
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const path = require('path');
const svg = (size, pad, rounded) => `<html><body style="margin:0;background:${rounded === 'opaque' ? '#2563eb' : 'transparent'}"><svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 512 512">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3b82f6"/><stop offset="1" stop-color="#1d4ed8"/></linearGradient></defs>
${rounded === 'round' ? '<rect width="512" height="512" rx="112" fill="url(#g)"/>' : '<rect width="512" height="512" fill="url(#g)"/>'}
<g transform="translate(256 256) scale(${1 - pad}) translate(-256 -256)">
<path d="M120 352 L216 236 L284 304 L392 168" fill="none" stroke="#fff" stroke-width="40" stroke-linecap="round" stroke-linejoin="round"/>
<path d="M330 160 H400 V230" fill="none" stroke="#fff" stroke-width="40" stroke-linecap="round" stroke-linejoin="round"/></g></svg></body></html>`;
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium' });
  const jobs = [['icon-192.png', 192, 0.0, 'round', true], ['icon-512.png', 512, 0.0, 'round', true], ['maskable-512.png', 512, 0.22, 'opaque', false], ['apple-touch-icon.png', 180, 0.12, 'opaque', false]];
  for (const [name, size, pad, mode, transparent] of jobs) {
    const pg = await b.newPage({ viewport: { width: size, height: size } });
    await pg.setContent(svg(size, pad, mode)); await pg.screenshot({ path: path.join(__dirname, '..', 'icons', name), omitBackground: transparent, clip: { x: 0, y: 0, width: size, height: size } }); await pg.close();
  }
  await b.close(); console.log('icons ok');
})();
