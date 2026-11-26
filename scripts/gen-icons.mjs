// Sinh icon PWA + favicon + ảnh OG bằng Chromium (Playwright có sẵn). Chạy: npm run gen:icons
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require(process.env.NODE_PATH + '/playwright')); }
import { writeFileSync, mkdirSync } from 'node:fs';

const glyph = (s, color = '#fff') => `
  <path d="M${s * 0.27} ${s * 0.73} L${s * 0.6} ${s * 0.4}" stroke="${color}" stroke-width="${s * 0.085}" stroke-linecap="round"/>
  <path d="M${s * 0.69} ${s * 0.17} Q${s * 0.69} ${s * 0.31} ${s * 0.83} ${s * 0.31} Q${s * 0.69} ${s * 0.31} ${s * 0.69} ${s * 0.45} Q${s * 0.69} ${s * 0.31} ${s * 0.55} ${s * 0.31} Q${s * 0.69} ${s * 0.31} ${s * 0.69} ${s * 0.17}Z" fill="${color}"/>
  <circle cx="${s * 0.36}" cy="${s * 0.3}" r="${s * 0.04}" fill="${color}" opacity=".85"/>
  <circle cx="${s * 0.76}" cy="${s * 0.64}" r="${s * 0.03}" fill="${color}" opacity=".7"/>`;
const bg = (s, rx = 0) => `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0a84ff"/><stop offset="1" stop-color="#bf5af2"/></linearGradient></defs><rect width="${s}" height="${s}" rx="${rx}" fill="url(#g)"/>`;
const svg = (s, inner) => `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}">${inner}</svg>`;

const icons = {
  'icon-192.png': [192, svg(192, bg(192, 42) + glyph(192))],
  'icon-512.png': [512, svg(512, bg(512, 112) + glyph(512))],
  'icon-maskable-512.png': [512, svg(512, bg(512) + `<g transform="translate(76.8 76.8) scale(0.7)">${glyph(512)}</g>`)],
  'icon-monochrome-512.png': [512, svg(512, `<g transform="translate(51 51) scale(0.8)">${glyph(512, '#fff')}</g>`)],
  'apple-touch-icon-180.png': [180, svg(180, bg(180) + `<g transform="translate(18 18) scale(0.8)">${glyph(180)}</g>`)],
  'favicon-32.png': [32, svg(32, bg(32, 7) + glyph(32))],
  'shortcut-pick-96.png': [96, svg(96, `<rect width="96" height="96" rx="22" fill="#0a84ff"/><rect x="24" y="28" width="48" height="40" rx="8" stroke="#fff" stroke-width="5" fill="none"/><circle cx="38" cy="42" r="5" fill="#fff"/><path d="M28 64 L46 48 L68 64" stroke="#fff" stroke-width="5" fill="none" stroke-linejoin="round"/>`)],
  'shortcut-camera-96.png': [96, svg(96, `<rect width="96" height="96" rx="22" fill="#30d158"/><rect x="20" y="32" width="56" height="38" rx="9" stroke="#fff" stroke-width="5" fill="none"/><circle cx="48" cy="51" r="10" stroke="#fff" stroke-width="5" fill="none"/><path d="M38 32 L42 25 H54 L58 32" stroke="#fff" stroke-width="5" fill="none" stroke-linejoin="round"/>`)],
};

mkdirSync('public/icons', { recursive: true });
writeFileSync('public/icons/favicon.svg', svg(64, bg(64, 15) + glyph(64)));
writeFileSync('public/icons/safari-pinned-tab.svg', svg(64, glyph(64, '#000')));

const browser = await chromium.launch();
const page = await browser.newPage();
for (const [name, [s, markup]] of Object.entries(icons)) {
  await page.setViewportSize({ width: s, height: s });
  await page.setContent(`<html><body style="margin:0;background:transparent">${markup}</body></html>`);
  writeFileSync(`public/icons/${name}`, await page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: s, height: s } }));
}
// Ảnh Open Graph 1200×630
await page.setViewportSize({ width: 1200, height: 630 });
await page.setContent(`<html><body style="margin:0;width:1200px;height:630px;font-family:system-ui,sans-serif;
  background:radial-gradient(700px 400px at 15% 10%,#0a84ff55,transparent),radial-gradient(700px 400px at 90% 90%,#bf5af255,transparent),#0b0b10;color:#fff;display:flex;align-items:center;gap:56px;padding:0 90px;box-sizing:border-box">
  ${svg(220, bg(220, 50) + glyph(220))}
  <div><div style="font-size:84px;font-weight:800;letter-spacing:-2px">NoPhotoShop</div>
  <div style="font-size:40px;opacity:.85;margin-top:6px">Chỉnh ảnh đẹp 1 chạm · Xuất 4K</div>
  <div style="font-size:30px;opacity:.6;margin-top:22px">By DucAnh · Ảnh không rời máy bạn</div></div></body></html>`);
writeFileSync('public/og-banner.png', await page.screenshot());
await browser.close();
console.log('Đã sinh icon');
