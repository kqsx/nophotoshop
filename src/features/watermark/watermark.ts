import { useSyncExternalStore } from 'react';
import { kvGet, kvSet } from '../../lib/db';

export type WmType = 'text' | 'logo' | 'tile' | 'signature';
export interface WmPos { x: number; y: number; size: number; rotation: number }
export interface WmLayer extends WmPos {
  id: string;
  type: WmType;
  text: string;
  font: string;
  bold: boolean;
  italic: boolean;
  color: string;
  opacity: number; // 0–100
  stroke: boolean;
  strokeColor: string;
  shadow: boolean;
  letterSpacing: number; // % cỡ chữ
  logo: string | null; // dataURL — chỉ lưu trên máy
  tint: 'none' | 'white' | 'black';
  radius: number; // % bo góc logo
  tileGap: number; // % khoảng cách lát
  tileAngle: number;
  autoContrast: boolean;
  margin: number; // % lề
  locked: boolean;
  visible: boolean;
  portrait: WmPos | null; // vị trí riêng cho ảnh dọc
}

export const FONTS = [
  { family: 'Be Vietnam Pro', label: 'Be Vietnam Pro' },
  { family: 'Montserrat', label: 'Montserrat' },
  { family: 'Playfair Display', label: 'Playfair (có chân)' },
  { family: 'Roboto Slab', label: 'Roboto Slab' },
  { family: 'Oswald', label: 'Oswald (cao)' },
  { family: 'Dancing Script', label: 'Dancing Script (viết tay)' },
  { family: 'Pacifico', label: 'Pacifico (mềm)' },
  { family: 'Georgia', label: 'Georgia (hệ thống)' },
];

export const MAX_LAYERS = 5;

export function newLayer(type: WmType, name = 'DucAnh'): WmLayer {
  return {
    id: Math.random().toString(36).slice(2, 9),
    type,
    text: type === 'signature' ? `© ${name}` : type === 'tile' ? name : name,
    font: type === 'signature' ? 'Dancing Script' : 'Be Vietnam Pro',
    bold: type !== 'signature',
    italic: false,
    color: '#ffffff',
    opacity: type === 'tile' ? 22 : 60,
    stroke: false,
    strokeColor: '#000000',
    shadow: true,
    letterSpacing: type === 'text' ? 4 : 0,
    logo: null,
    tint: 'none',
    radius: 0,
    tileGap: 60,
    tileAngle: -30,
    autoContrast: false,
    margin: 3,
    locked: false,
    visible: true,
    x: type === 'tile' ? 0.5 : 1,
    y: type === 'tile' ? 0.5 : 1,
    size: type === 'tile' ? 14 : type === 'signature' ? 22 : 18,
    rotation: 0,
    portrait: null,
  };
}

// ---------- Store ----------
interface WmState { layers: WmLayer[]; selected: string | null; alwaysApply: boolean; preview: boolean; portraitMode: boolean }
let st: WmState = { layers: [], selected: null, alwaysApply: false, preview: true, portraitMode: false };
const subs = new Set<() => void>();
const emit = () => subs.forEach((s) => s());
export const wmGet = () => st;
export function useWm<T>(sel: (s: WmState) => T): T {
  return useSyncExternalStore((cb) => { subs.add(cb); return () => subs.delete(cb); }, () => sel(st));
}
let saveT: number | undefined;
export function wmSet(patch: Partial<WmState>) {
  st = { ...st, ...patch };
  emit();
  clearTimeout(saveT);
  saveT = window.setTimeout(() => kvSet('wm', { layers: st.layers, alwaysApply: st.alwaysApply }), 400);
}
export function wmUpdate(id: string, patch: Partial<WmLayer>) {
  wmSet({ layers: st.layers.map((l) => (l.id === id ? { ...l, ...patch } : l)) });
}
export async function wmLoad() {
  const v = await kvGet<{ layers: WmLayer[]; alwaysApply: boolean }>('wm');
  if (v) st = { ...st, layers: v.layers || [], alwaysApply: !!v.alwaysApply, selected: v.layers?.[0]?.id ?? null };
  emit();
}

// ---------- Vẽ ----------
const imgCache = new Map<string, HTMLImageElement>();
export function loadImage(src: string): Promise<HTMLImageElement> {
  const c = imgCache.get(src);
  if (c?.complete) return Promise.resolve(c);
  return new Promise((res, rej) => {
    const im = c ?? new Image();
    im.onload = () => res(im);
    im.onerror = rej;
    if (!c) { im.src = src; imgCache.set(src, im); }
  });
}

export async function ensureFonts(layers: WmLayer[]) {
  const jobs: Promise<unknown>[] = [];
  for (const l of layers) {
    if (l.type !== 'logo') jobs.push(document.fonts.load(`${l.italic ? 'italic ' : ''}${l.bold ? 700 : 400} 64px "${l.font}"`, l.text || 'Aă'));
    if (l.logo) jobs.push(loadImage(l.logo));
  }
  await Promise.allSettled(jobs);
}

export interface Box { cx: number; cy: number; w: number; h: number; rot: number }

export function posOf(l: WmLayer, W: number, H: number): WmPos {
  return H > W * 1.05 && l.portrait ? l.portrait : l;
}

function fontStr(l: WmLayer, px: number) {
  return `${l.italic ? 'italic ' : ''}${l.bold ? 700 : 400} ${px}px "${l.font}", "Be Vietnam Pro", sans-serif`;
}

function textOf(l: WmLayer, exifDate: string | null) {
  if (l.type === 'signature') return `${l.text}${l.text ? ' · ' : ''}${exifDate || new Date().toLocaleDateString('vi-VN')}`;
  return l.text || ' ';
}

/** Kích thước một watermark theo % chiều rộng ảnh. */
export function measure(ctx: CanvasRenderingContext2D, l: WmLayer, W: number, H: number, exifDate: string | null): { w: number; h: number; font: number } {
  const p = posOf(l, W, H);
  const targetW = (p.size / 100) * W;
  if (l.type === 'logo') {
    const im = l.logo ? imgCache.get(l.logo) : null;
    const ar = im && im.naturalWidth ? im.naturalHeight / im.naturalWidth : 0.5;
    return { w: targetW, h: targetW * ar, font: 0 };
  }
  const txt = textOf(l, exifDate);
  ctx.save();
  ctx.font = fontStr(l, 100);
  ctx.letterSpacing = `${l.letterSpacing}px`;
  const m = ctx.measureText(txt);
  ctx.restore();
  const w100 = Math.max(1, m.width);
  const font = (100 * targetW) / w100;
  return { w: targetW, h: font * 1.2, font };
}

export function layerBox(ctx: CanvasRenderingContext2D, l: WmLayer, W: number, H: number, exifDate: string | null): Box {
  const p = posOf(l, W, H);
  const m = measure(ctx, l, W, H, exifDate);
  if (l.type === 'tile') return { cx: W / 2, cy: H / 2, w: W, h: H, rot: 0 };
  // giữ trong khung với lề 3%
  const margin = ((l.margin ?? 3) / 100) * Math.min(W, H);
  const cx = Math.min(W - margin - m.w / 2, Math.max(margin + m.w / 2, p.x * W));
  const cy = Math.min(H - margin - m.h / 2, Math.max(margin + m.h / 2, p.y * H));
  return { cx: m.w + margin * 2 > W ? p.x * W : cx, cy: m.h + margin * 2 > H ? p.y * H : cy, w: m.w, h: m.h, rot: (p.rotation * Math.PI) / 180 };
}

function sampleLuma(src: CanvasImageSource | null, x: number, y: number, w: number, h: number, W: number, H: number): number {
  if (!src) return 0.5;
  try {
    const c = document.createElement('canvas');
    c.width = 8; c.height = 8;
    const k = c.getContext('2d', { willReadFrequently: true })!;
    const sw = (src as HTMLCanvasElement).width, sh = (src as HTMLCanvasElement).height;
    k.drawImage(src, ((x - w / 2) / W) * sw, ((y - h / 2) / H) * sh, (w / W) * sw, (h / H) * sh, 0, 0, 8, 8);
    const d = k.getImageData(0, 0, 8, 8).data;
    let s = 0;
    for (let i = 0; i < d.length; i += 4) s += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
    return s / 64 / 255;
  } catch { return 0.5; }
}

function drawOne(ctx: CanvasRenderingContext2D, l: WmLayer, W: number, H: number, exifDate: string | null, bg: CanvasImageSource | null, cx: number, cy: number, rot: number, m: { w: number; h: number; font: number }) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(rot);
  ctx.globalAlpha = l.opacity / 100;
  if (l.type === 'logo') {
    const im = l.logo ? imgCache.get(l.logo) : null;
    if (im && im.complete) {
      let src: CanvasImageSource = im;
      if (l.tint !== 'none') {
        const t = document.createElement('canvas');
        t.width = Math.max(1, Math.round(m.w)); t.height = Math.max(1, Math.round(m.h));
        const tc = t.getContext('2d')!;
        tc.drawImage(im, 0, 0, t.width, t.height);
        tc.globalCompositeOperation = 'source-in';
        tc.fillStyle = l.tint === 'white' ? '#fff' : '#000';
        tc.fillRect(0, 0, t.width, t.height);
        src = t;
      }
      if (l.radius > 0) {
        const r = (l.radius / 100) * Math.min(m.w, m.h);
        ctx.beginPath();
        ctx.roundRect(-m.w / 2, -m.h / 2, m.w, m.h, r);
        ctx.clip();
      }
      if (l.shadow) { ctx.shadowColor = 'rgba(0,0,0,.35)'; ctx.shadowBlur = m.w * 0.04; }
      ctx.drawImage(src, -m.w / 2, -m.h / 2, m.w, m.h);
    }
  } else {
    const txt = textOf(l, exifDate);
    ctx.font = fontStr(l, m.font);
    ctx.letterSpacing = `${(l.letterSpacing * m.font) / 100}px`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    let color = l.color;
    if (l.autoContrast) color = sampleLuma(bg, cx, cy, m.w, m.h, W, H) > 0.55 ? '#111111' : '#ffffff';
    if (l.shadow) {
      ctx.shadowColor = 'rgba(0,0,0,.45)';
      ctx.shadowBlur = m.font * 0.18;
      ctx.shadowOffsetY = m.font * 0.04;
    }
    if (l.stroke) {
      ctx.lineJoin = 'round';
      ctx.lineWidth = Math.max(1, m.font * 0.08);
      ctx.strokeStyle = l.strokeColor;
      ctx.strokeText(txt, 0, 0);
    }
    ctx.fillStyle = color;
    ctx.fillText(txt, 0, 0);
  }
  ctx.restore();
}

/**
 * Vẽ tất cả watermark lên ctx kích thước W×H. Dùng chung cho xem trước và xuất (tọa độ tỷ lệ),
 * nên ảnh xuất 4K giống hệt xem trước.
 */
export function drawWatermarks(ctx: CanvasRenderingContext2D, layers: WmLayer[], W: number, H: number, exifDate: string | null, bg: CanvasImageSource | null = null) {
  for (const l of layers) {
    if (!l.visible) continue;
    const m = measure(ctx, l, W, H, exifDate);
    if (l.type === 'tile') {
      const p = posOf(l, W, H);
      const gap = (l.tileGap / 100) * m.w;
      const stepX = m.w + gap, stepY = m.h + gap * 1.2;
      const ang = (l.tileAngle * Math.PI) / 180;
      const R = Math.hypot(W, H);
      ctx.save();
      ctx.translate(W / 2, H / 2);
      ctx.rotate(ang);
      for (let yy = -R / 2, row = 0; yy < R / 2 + stepY; yy += stepY, row++) {
        for (let xx = -R / 2 + (row % 2 ? stepX / 2 : 0); xx < R / 2 + stepX; xx += stepX) {
          drawOne(ctx, { ...l, autoContrast: false }, W, H, exifDate, null, xx, yy, (p.rotation * Math.PI) / 180, m);
        }
      }
      ctx.restore();
      continue;
    }
    const b = layerBox(ctx, l, W, H, exifDate);
    drawOne(ctx, l, W, H, exifDate, bg, b.cx, b.cy, b.rot, m);
  }
}

export const GRID9: [number, number][] = [
  [0, 0], [0.5, 0], [1, 0],
  [0, 0.5], [0.5, 0.5], [1, 0.5],
  [0, 1], [0.5, 1], [1, 1],
];
