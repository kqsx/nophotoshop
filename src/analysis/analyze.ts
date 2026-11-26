import { orientationOf, ratioLabel, type Orientation } from './aspect';
import type { PresetDelta } from '../engine/params';

export interface Analysis {
  width: number;
  height: number;
  orientation: Orientation;
  ratio: string | null;
  hist: Uint32Array; // 256 bin độ sáng
  mean: number;
  p1: number; p5: number; p50: number; p95: number; p99: number;
  clipHi: number; clipLo: number; darkFrac: number; brightFrac: number;
  skin: number; sky: number; green: number; food: number;
  hasPerson: boolean; hasSky: boolean; hasGreen: boolean;
  isDark: boolean; isBacklit: boolean; isNight: boolean; isProduct: boolean; isFood: boolean;
  cast: { temp: number; tint: number };
  ms: number;
}

const toLin = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);

export function analyzeCanvas(src: CanvasImageSource & { width: number; height: number }, fullW: number, fullH: number): Analysis {
  const t0 = performance.now();
  const S = 192;
  const sc = Math.min(1, S / Math.max(src.width, src.height));
  const w = Math.max(1, Math.round(src.width * sc)), h = Math.max(1, Math.round(src.height * sc));
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(src, 0, 0, w, h);
  const d = ctx.getImageData(0, 0, w, h).data;
  const hist = new Uint32Array(256);
  let skin = 0, sky = 0, green = 0, food = 0, n = 0;
  let centerSum = 0, centerN = 0, borderSum = 0, borderN = 0, topSum = 0, topN = 0;
  let mr = 0, mg = 0, mb = 0, mn = 0;
  let edgeLowSat = 0, edgeN = 0, edgeBright = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const r = d[i] / 255, g = d[i + 1] / 255, b = d[i + 2] / 255;
      const L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      hist[Math.min(255, Math.round(L * 255))]++;
      n++;
      const mx = Math.max(r, g, b), mn2 = Math.min(r, g, b);
      const s = mx > 0 ? (mx - mn2) / mx : 0;
      let hue = 0;
      if (mx !== mn2) {
        if (mx === r) hue = ((g - b) / (mx - mn2)) % 6;
        else if (mx === g) hue = (b - r) / (mx - mn2) + 2;
        else hue = (r - g) / (mx - mn2) + 4;
        hue *= 60; if (hue < 0) hue += 360;
      }
      const cb = 0.5 - 0.168736 * r - 0.331264 * g + 0.5 * b;
      const cr = 0.5 + 0.5 * r - 0.418688 * g - 0.081312 * b;
      const isSkin = cb > 0.3 && cb < 0.5 && cr > 0.53 && cr < 0.68 && L > 0.15 && L < 0.8 && s < 0.65;
      if (isSkin) skin++;
      const fy = y / h, fx = x / w;
      if (fy < 0.45 && ((hue > 185 && hue < 250 && s > 0.15 && mx > 0.4) || (s < 0.12 && mx > 0.75))) sky++;
      if (hue > 60 && hue < 165 && s > 0.2 && mx > 0.15) green++;
      if (!isSkin && (hue < 50 || hue > 340) && s > 0.45 && mx > 0.35 && fx > 0.2 && fx < 0.8 && fy > 0.2 && fy < 0.8) food++;
      const center = fx > 0.3 && fx < 0.7 && fy > 0.3 && fy < 0.75;
      if (center) { centerSum += L; centerN++; } else { borderSum += L; borderN++; }
      if (fy < 0.3) { topSum += L; topN++; }
      if (fx < 0.08 || fx > 0.92 || fy < 0.08 || fy > 0.92) {
        edgeN++;
        if (s < 0.12) edgeLowSat++;
        if (L > 0.75) edgeBright++;
      }
      if (L > 0.15 && L < 0.85) { mr += toLin(r); mg += toLin(g); mb += toLin(b); mn++; }
    }
  }
  const pct = (p: number) => {
    const target = n * p;
    let acc = 0;
    for (let i = 0; i < 256; i++) { acc += hist[i]; if (acc >= target) return i / 255; }
    return 1;
  };
  let dark = 0, bright = 0;
  for (let i = 0; i < 256; i++) { if (i < 72) dark += hist[i]; if (i > 190) bright += hist[i]; }
  const darkFrac = dark / n, brightFrac = bright / n;
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += hist[i] * i;
  const mean = sum / n / 255;
  const clipHi = (hist[254] + hist[255]) / n, clipLo = (hist[0] + hist[1]) / n;
  const p1 = pct(0.01), p5 = pct(0.05), p50 = pct(0.5), p95 = pct(0.95), p99 = pct(0.99);
  const centerMean = centerSum / Math.max(1, centerN), borderMean = borderSum / Math.max(1, borderN);
  const topMean = topSum / Math.max(1, topN);
  // màu ám (gray world, chỉ vùng trung tính)
  mr /= Math.max(1, mn); mg /= Math.max(1, mn); mb /= Math.max(1, mn);
  const avg = (mr + mg + mb) / 3 || 1;
  const temp = Math.max(-18, Math.min(18, ((mb - mr) / avg) * 60));
  const tint = Math.max(-12, Math.min(12, ((mg - (mr + mb) / 2) / avg) * -50));
  const a: Analysis = {
    width: fullW, height: fullH,
    orientation: orientationOf(fullW, fullH), ratio: ratioLabel(fullW, fullH),
    hist, mean, p1, p5, p50, p95, p99, clipHi, clipLo, darkFrac, brightFrac,
    skin: skin / n, sky: sky / n, green: green / n, food: food / n,
    hasPerson: skin / n > 0.06 && skin / n < 0.55,
    hasSky: sky / n > 0.08,
    hasGreen: green / n > 0.12,
    isDark: mean < 0.32,
    isBacklit: ((topMean - centerMean > 0.12 || borderMean - centerMean > 0.12) && centerMean < 0.5) || (darkFrac > 0.25 && p95 > 0.75 && mean > 0.25),
    isNight: mean < 0.22 && p99 > 0.7,
    isProduct: edgeLowSat / Math.max(1, edgeN) > 0.7 && edgeBright / Math.max(1, edgeN) > 0.5,
    isFood: food / n > 0.12 && skin / n < 0.1,
    cast: { temp, tint },
    ms: 0,
  };
  a.ms = performance.now() - t0;
  return a;
}

/** «Auto sáng»: tính thông số từ histogram, có giới hạn biên độ để không quá tay. */
export function autoBright(a: Analysis): PresetDelta {
  const cl = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
  const target = 0.46;
  const medLin = toLin(Math.max(0.02, a.p50));
  let ev = Math.log2(toLin(target) / medLin) * 0.65;
  if (a.clipHi > 0.02) ev = Math.min(ev, 0.15);
  ev = cl(ev, -0.8, 1.1);
  const d: PresetDelta = { exposure: Math.round((ev / 2.5) * 100) };
  d.shadows = Math.round(cl(cl((0.18 - a.p5) * 250, 0, 40) + cl(a.darkFrac * 90, 0, 35) + (a.isBacklit ? 12 : 0), 0, 70));
  d.highlights = -Math.round(cl(a.clipHi * 1500 + Math.max(0, a.p99 - 0.96) * 500, 0, 45));
  d.whites = a.p99 < 0.85 ? Math.round(cl((0.92 - a.p99) * 120, 0, 25)) : 0;
  d.blacks = a.p1 > 0.08 ? -Math.round(cl((a.p1 - 0.04) * 150, 0, 20)) : 0;
  const range = a.p95 - a.p5;
  d.contrast = range < 0.55 ? Math.round(cl((0.6 - range) * 60, 0, 18)) : 0;
  d.dehaze = a.p1 > 0.12 ? Math.round(cl((a.p1 - 0.08) * 120, 0, 20)) : 0;
  d.clarity = 12;
  d.vibrance = 18;
  if (Math.abs(a.cast.temp) > 4) d.temp = Math.round(a.cast.temp * 0.6);
  if (Math.abs(a.cast.tint) > 3) d.tint = Math.round(a.cast.tint * 0.5);
  return d;
}
