// Sinh bộ LUT mặc định (tự tạo bằng công thức — không vướng bản quyền) vào public/luts/.
import { writeFileSync, mkdirSync } from 'node:fs';
const N = 17;
const cl = (v) => Math.min(1, Math.max(0, v));
const mix = (a, b, t) => a + (b - a) * t;
const luma = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
const scurve = (x, k) => cl(x + k * (x - 0.5) * (1 - Math.abs(2 * x - 1)) * 1.0);
const sat = (r, g, b, s) => { const y = luma(r, g, b); return [y + (r - y) * s, y + (g - y) * s, y + (b - y) * s]; };
const fade = (v, a) => a + v * (1 - a * 1.4);

const LUTS = [
  { id: 'phim-am', name: 'Phim ấm', group: 'Phim', f: (r, g, b) => {
    [r, g, b] = sat(r, g, b, 0.88);
    const y = luma(r, g, b);
    r += 0.05 * y; b -= 0.05 * y; g += 0.01;
    return [fade(scurve(r, 0.25), 0.06), fade(scurve(g, 0.22), 0.05), fade(scurve(b, 0.18), 0.07)];
  } },
  { id: 'dien-anh', name: 'Xanh cam điện ảnh', group: 'Điện ảnh', f: (r, g, b) => {
    const y = luma(r, g, b);
    const sh = 1 - Math.min(1, y / 0.55), hi = Math.max(0, (y - 0.45) / 0.55);
    r += -0.06 * sh + 0.07 * hi; g += 0.015 * sh + 0.02 * hi; b += 0.07 * sh - 0.07 * hi;
    [r, g, b] = sat(r, g, b, 1.08);
    return [scurve(r, 0.2), scurve(g, 0.2), scurve(b, 0.2)];
  } },
  { id: 'hoai-co', name: 'Hoài cổ', group: 'Phim', f: (r, g, b) => {
    [r, g, b] = sat(r, g, b, 0.7);
    r = r * 0.95 + 0.06; g = g * 0.92 + 0.05; b = b * 0.8 + 0.06;
    return [fade(r, 0.08), fade(g, 0.07), fade(b, 0.05)];
  } },
  { id: 'lanh-mo', name: 'Lạnh mờ', group: 'Phim', f: (r, g, b) => {
    [r, g, b] = sat(r, g, b, 0.78);
    r -= 0.03; b += 0.05;
    return [fade(r, 0.07), fade(g, 0.07), fade(b, 0.09)];
  } },
  { id: 'nang-vang', name: 'Nắng vàng', group: 'Màu nổi', f: (r, g, b) => {
    const y = luma(r, g, b);
    r += 0.06 * (0.3 + y); g += 0.03 * (0.3 + y); b -= 0.06 * y;
    [r, g, b] = sat(r, g, b, 1.12);
    return [scurve(r, 0.12), scurve(g, 0.12), scurve(b, 0.12)];
  } },
  { id: 'han-quoc', name: 'Trong veo Hàn Quốc', group: 'Da', f: (r, g, b) => {
    const y = luma(r, g, b);
    [r, g, b] = sat(r, g, b, 0.86);
    r = mix(r, 1, 0.08) + 0.012; g = mix(g, 1, 0.08); b = mix(b, 1, 0.1) + 0.01;
    return [r, g + 0.005 * (1 - y), b];
  } },
  { id: 'den-trang', name: 'Đen trắng tương phản', group: 'Đen trắng', f: (r, g, b) => {
    const y = cl(0.4 * r + 0.45 * g + 0.15 * b);
    const v = scurve(scurve(y, 0.35), 0.15);
    return [v, v, v];
  } },
  { id: 'dem-neon', name: 'Đêm neon', group: 'Ban đêm', f: (r, g, b) => {
    const y = luma(r, g, b);
    const sh = 1 - Math.min(1, y / 0.6);
    r += 0.04 * (1 - sh); b += 0.08 * sh; g -= 0.02;
    [r, g, b] = sat(r, g, b, 1.2);
    return [scurve(r, 0.22), scurve(g, 0.18), scurve(b, 0.22)];
  } },
];

mkdirSync('public/luts', { recursive: true });
const index = [];
LUTS.forEach((L, i) => {
  const lines = [`TITLE "${L.name}"`, `# NoPhotoShop By DucAnh — LUT tự tạo`, `LUT_3D_SIZE ${N}`];
  for (let bi = 0; bi < N; bi++) for (let gi = 0; gi < N; gi++) for (let ri = 0; ri < N; ri++) {
    const o = L.f(ri / (N - 1), gi / (N - 1), bi / (N - 1)).map((v) => cl(v).toFixed(4));
    lines.push(o.join(' '));
  }
  writeFileSync(`public/luts/${L.id}.cube`, lines.join('\n') + '\n');
  index.push({ id: L.id, name: L.name, group: L.group, kind: 'cube', url: `/luts/${L.id}.cube`, size: N, order: i });
});
writeFileSync('public/luts/luts.json', JSON.stringify({ version: 1, luts: index }, null, 2));
console.log('Đã sinh', LUTS.length, 'LUT');
