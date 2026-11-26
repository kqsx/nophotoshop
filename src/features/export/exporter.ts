import { renderFull } from '../../engine/pipeline';
import { croppedSize, fitLong } from '../../engine/geometry';
import { effectiveParams, type Doc } from '../editor/store';
import { drawWatermarks, ensureFonts, type WmLayer } from '../watermark/watermark';
import { track } from '../../lib/stats';

export type SizeKey = 'orig' | '1080' | '2k' | '4k' | 'custom' | 'ig-portrait' | 'ig-square' | 'story' | 'fb-cover' | 'yt-thumb' | 'zalo-cover';
export type Format = 'jpeg' | 'png' | 'webp' | 'avif';

export const SIZES: { key: SizeKey; label: string; long?: number; box?: [number, number]; hint?: string }[] = [
  { key: 'orig', label: 'Gốc', hint: 'Giữ kích thước ảnh' },
  { key: '1080', label: '1080p', long: 1920 },
  { key: '2k', label: '2K', long: 2560 },
  { key: '4k', label: '4K', long: 3840, hint: 'Nét căng' },
  { key: 'custom', label: 'Tùy chỉnh' },
];
export const SOCIAL: { key: SizeKey; label: string; box: [number, number] }[] = [
  { key: 'ig-portrait', label: 'Instagram 4:5', box: [1080, 1350] },
  { key: 'ig-square', label: 'Instagram 1:1', box: [1080, 1080] },
  { key: 'story', label: 'Story/Reels 9:16', box: [1080, 1920] },
  { key: 'fb-cover', label: 'Bìa Facebook', box: [1640, 624] },
  { key: 'yt-thumb', label: 'YouTube', box: [1280, 720] },
  { key: 'zalo-cover', label: 'Bìa Zalo', box: [1500, 1000] },
];

export const MIME: Record<Format, string> = { jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', avif: 'image/avif' };
export const EXT: Record<Format, string> = { jpeg: 'jpg', png: 'png', webp: 'webp', avif: 'avif' };

let support: Record<Format, boolean> | null = null;
export async function formatSupport(): Promise<Record<Format, boolean>> {
  if (support) return support;
  const c = document.createElement('canvas');
  c.width = c.height = 2;
  const test = (m: string) => new Promise<boolean>((res) => c.toBlob((b) => res(!!b && b.type === m), m));
  support = { jpeg: true, png: true, webp: await test('image/webp'), avif: await test('image/avif') };
  return support;
}

/** Giới hạn diện tích canvas an toàn theo thiết bị. */
export function canvasLimit(): number {
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8;
  if (ios) return 16_700_000;
  if (mem <= 2) return 9_000_000;
  if (mem <= 4) return 24_000_000;
  return 64_000_000;
}

export interface ExportOpts {
  size: SizeKey;
  customLong: number;
  format: Format;
  quality: number; // 0.5–1
  watermark: boolean;
  layers: WmLayer[];
}

/** Tính kích thước xuất; tự hạ xuống nếu vượt giới hạn thiết bị. */
export function plan(d: Doc, o: ExportOpts): { w: number; h: number; note: string | null } {
  const [cw, ch] = croppedSize(d.bitmap, d.cur.geometry);
  let w = cw, h = ch;
  const s = SIZES.find((x) => x.key === o.size);
  const so = SOCIAL.find((x) => x.key === o.size);
  if (s?.long) [w, h] = fitLong(cw, ch, s.long);
  else if (o.size === 'custom') [w, h] = fitLong(cw, ch, Math.max(64, Math.min(8192, o.customLong || 2048)));
  else if (so) {
    // vừa khung mạng xã hội theo cạnh dài, giữ tỷ lệ (khuyên cắt đúng tỷ lệ ở tab Cắt)
    const sc = Math.min(so.box[0] / cw, so.box[1] / ch);
    [w, h] = [Math.round(cw * sc), Math.round(ch * sc)];
  }
  let note: string | null = null;
  const limit = canvasLimit();
  if (w * h > limit) {
    const k = Math.sqrt(limit / (w * h));
    w = Math.floor(w * k); h = Math.floor(h * k);
    note = `Thiết bị này giới hạn bộ nhớ ảnh, đã tự hạ xuống ${w}×${h}px.`;
  }
  if (Math.max(w, h) > Math.max(cw, ch) * 1.05) note = (note ? note + ' ' : '') + 'Ảnh gốc nhỏ hơn cỡ xuất: app phóng mượt + làm nét nhẹ, không tạo thêm chi tiết thật.';
  return { w, h, note };
}

export function outName(name: string, f: Format) {
  const base = name.replace(/\.[^.]+$/, '').replace(/[^\p{L}\p{N}_-]+/gu, '-').slice(0, 60) || 'anh';
  return `${base}_nophotoshop.${EXT[f]}`;
}

export async function exportDoc(d: Doc, o: ExportOpts, onProgress: (f: number) => void, signal: AbortSignal): Promise<{ blob: Blob; name: string; w: number; h: number; note: string | null }> {
  const { w, h, note } = plan(d, o);
  const params = effectiveParams(d);
  const upscale = Math.max(w, h) / Math.max(...croppedSize(d.bitmap, d.cur.geometry));
  if (upscale > 1.2) params.sharpen = Math.min(150, params.sharpen + 12);
  let canvas: HTMLCanvasElement;
  try {
    canvas = await renderFull({ img: d.bitmap, geometry: d.cur.geometry, params, outW: w, outH: h, onProgress: (f) => onProgress(f * 0.9), signal });
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    // hết bộ nhớ GPU → thử lại 2K
    if (Math.max(w, h) > 2560) {
      const r = await exportDoc(d, { ...o, size: '2k' }, onProgress, signal);
      return { ...r, note: 'Không đủ bộ nhớ cho cỡ này, đã tự xuất ở 2K.' };
    }
    throw e;
  }
  if (o.watermark && o.layers.length) {
    await ensureFonts(o.layers);
    drawWatermarks(canvas.getContext('2d')!, o.layers, w, h, d.exifDate, canvas);
  }
  onProgress(0.95);
  const blob = await new Promise<Blob>((res, rej) =>
    canvas.toBlob((b) => (b ? res(b) : rej(new Error('Không tạo được file ảnh'))), MIME[o.format], o.format === 'png' ? undefined : o.quality),
  );
  canvas.width = canvas.height = 1; // giải phóng bộ nhớ
  onProgress(1);
  track('export', `${o.format}:${o.size}`);
  return { blob, name: outName(d.name, o.format), w, h, note };
}

export function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

export async function zipFiles(files: { name: string; blob: Blob }[]): Promise<Blob> {
  const { zipSync } = await import('fflate');
  const entries: Record<string, [Uint8Array, { level: 0 }]> = {};
  const used = new Set<string>();
  for (const f of files) {
    let n = f.name, i = 1;
    while (used.has(n)) n = f.name.replace(/(\.[^.]+)$/, `-${i++}$1`);
    used.add(n);
    entries[n] = [new Uint8Array(await f.blob.arrayBuffer()), { level: 0 }];
  }
  return new Blob([zipSync(entries) as BlobPart], { type: 'application/zip' });
}

export async function shareFiles(files: File[]): Promise<boolean> {
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (nav.share && nav.canShare?.({ files })) {
    try {
      await nav.share({ files, title: 'NoPhotoShop' });
      track('share', 'file');
      return true;
    } catch (e) {
      if ((e as Error).name === 'AbortError') return true;
    }
  }
  return false;
}
