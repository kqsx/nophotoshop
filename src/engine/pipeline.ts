import { Renderer, MID_LONG, LARGE_LONG } from './Renderer';
import { croppedSize, drawGeometry, fitLong, makeCanvas, type Drawable } from './geometry';
import type { Geometry, Params } from './params';
import { getLut } from './lutStore';

const PAD = 8;

/** Kéo dài pixel mép ra vùng đệm để làm mờ không bị viền tối. */
function extendEdges(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number) {
  const c = ctx.canvas;
  const W = c.width, H = c.height;
  if (x1 <= x0 || y1 <= y0) return;
  if (x0 > 0) ctx.drawImage(c, x0, 0, 1, H, 0, 0, x0, H);
  if (x1 < W) ctx.drawImage(c, x1 - 1, 0, 1, H, x1, 0, W - x1, H);
  if (y0 > 0) ctx.drawImage(c, 0, y0, W, 1, 0, 0, W, y0);
  if (y1 < H) ctx.drawImage(c, 0, y1 - 1, W, 1, 0, y1, W, H - y1);
}

/** Ảnh mờ nền cố định theo khung cắt — giống hệt giữa xem trước và xuất. */
export function blurSources(img: Drawable, g: Geometry) {
  const [cw, ch] = croppedSize(img, g);
  const [mw, mh] = fitLong(cw, ch, MID_LONG);
  const mid = makeCanvas(mw, mh);
  drawGeometry(mid.getContext('2d')!, img, g, mw, mh);
  const [lw, lh] = fitLong(cw, ch, LARGE_LONG);
  const large = makeCanvas(lw, lh);
  const lctx = large.getContext('2d')!;
  lctx.imageSmoothingQuality = 'high';
  lctx.drawImage(mid, 0, 0, lw, lh);
  return { mid, large };
}

/** Dựng canvas nguồn (kèm viền đệm) cho một mảnh. */
function tileSource(img: Drawable, g: Geometry, outW: number, outH: number, tx: number, ty: number, tw: number, th: number, reuse?: HTMLCanvasElement) {
  const c = reuse && reuse.width === tw + PAD * 2 && reuse.height === th + PAD * 2 ? reuse : makeCanvas(tw + PAD * 2, th + PAD * 2);
  const ctx = c.getContext('2d', { willReadFrequently: false })!;
  ctx.clearRect(0, 0, c.width, c.height);
  drawGeometry(ctx, img, g, outW, outH, tx, ty, PAD);
  const x0 = Math.max(0, PAD - tx), y0 = Math.max(0, PAD - ty);
  const x1 = Math.min(c.width, PAD + (outW - tx)), y1 = Math.min(c.height, PAD + (outH - ty));
  extendEdges(ctx, x0, y0, x1, y1);
  return c;
}

export async function ensureLut(r: Renderer, p: Params) {
  if (p.lut && r.lutId !== p.lut.id) {
    const lut = await getLut(p.lut.id);
    if (lut) r.setLut(p.lut.id, lut);
  }
}

/** Xem trước: một mảnh duy nhất ở cạnh dài ~1600px. */
export class PreviewPipeline {
  readonly r: Renderer;
  outW = 1;
  outH = 1;
  private ready = false;
  constructor(canvas: HTMLCanvasElement) {
    this.r = new Renderer(canvas);
  }
  prepare(img: Drawable, g: Geometry, long = 1600, blur?: { mid: HTMLCanvasElement; large: HTMLCanvasElement }) {
    const [cw, ch] = croppedSize(img, g);
    const lim = Math.min(long, this.r.maxTex - PAD * 2);
    [this.outW, this.outH] = fitLong(cw, ch, Math.min(lim, Math.max(cw, ch)));
    const b = blur ?? blurSources(img, g);
    this.r.setBlurSources(b.mid, b.large);
    this.r.setSource(tileSource(img, g, this.outW, this.outH, 0, 0, this.outW, this.outH));
    this.ready = true;
    return b;
  }
  async render(p: Params, split = 0) {
    if (!this.ready) return;
    await ensureLut(this.r, p);
    this.r.render(p, { tileX: 0, tileY: 0, tileW: this.outW, tileH: this.outH, outW: this.outW, outH: this.outH, pad: PAD, split });
  }
  renderSync(p: Params, split = 0) {
    if (!this.ready) return;
    this.r.render(p, { tileX: 0, tileY: 0, tileW: this.outW, tileH: this.outH, outW: this.outW, outH: this.outH, pad: PAD, split });
  }
}

let aux: Renderer | null = null;
export function auxRenderer() {
  aux ??= new Renderer();
  return aux;
}

/** Vẽ thumbnail nhỏ của ảnh với thông số p → dataURL. */
export class ThumbMaker {
  private srcKey: unknown = null;
  private w = 1;
  private h = 1;
  private out = makeCanvas(1, 1);
  async make(img: Drawable, g: Geometry, blur: { mid: HTMLCanvasElement; large: HTMLCanvasElement }, p: Params, size = 168): Promise<string> {
    const r = auxRenderer();
    if (this.srcKey !== blur || r.owner !== this) {
      r.owner = this;
      const [cw, ch] = croppedSize(img, g);
      // thumbnail vuông, cắt giữa
      [this.w, this.h] = fitLong(cw, ch, size);
      r.setBlurSources(blur.mid, blur.large);
      r.setSource(tileSource(img, g, this.w, this.h, 0, 0, this.w, this.h));
      this.srcKey = blur;
    }
    await ensureLut(r, p);
    r.render(p, { tileX: 0, tileY: 0, tileW: this.w, tileH: this.h, outW: this.w, outH: this.h, pad: PAD });
    this.out.width = this.w;
    this.out.height = this.h;
    this.out.getContext('2d')!.drawImage(r.canvas, 0, 0);
    return this.out.toDataURL('image/jpeg', 0.8);
  }
  invalidate() { this.srcKey = null; }
}

export interface ExportJob {
  img: Drawable;
  geometry: Geometry;
  params: Params;
  outW: number;
  outH: number;
  onProgress?: (f: number) => void;
  signal?: AbortSignal;
  tile?: number;
}

/** Xuất ảnh theo từng mảnh 1024px để không vượt giới hạn GPU trên điện thoại. */
export async function renderFull(job: ExportJob): Promise<HTMLCanvasElement> {
  const r = auxRenderer();
  r.owner = job;
  const T = Math.min(job.tile ?? 1024, r.maxTex - PAD * 2);
  const blur = blurSources(job.img, job.geometry);
  r.setBlurSources(blur.mid, blur.large);
  await ensureLut(r, job.params);
  const out = makeCanvas(job.outW, job.outH);
  const octx = out.getContext('2d')!;
  const cols = Math.ceil(job.outW / T), rows = Math.ceil(job.outH / T);
  let done = 0;
  let src: HTMLCanvasElement | undefined;
  for (let ty = 0; ty < rows; ty++) {
    for (let tx = 0; tx < cols; tx++) {
      if (job.signal?.aborted) throw new DOMException('Đã hủy', 'AbortError');
      const x = tx * T, y = ty * T;
      const w = Math.min(T, job.outW - x), h = Math.min(T, job.outH - y);
      src = tileSource(job.img, job.geometry, job.outW, job.outH, x, y, w, h, src);
      r.setSource(src);
      r.render(job.params, { tileX: x, tileY: y, tileW: w, tileH: h, outW: job.outW, outH: job.outH, pad: PAD });
      octx.drawImage(r.canvas, 0, 0, w, h, x, y, w, h);
      done++;
      job.onProgress?.(done / (cols * rows));
      await new Promise((res) => setTimeout(res, 0));
    }
  }
  return out;
}
