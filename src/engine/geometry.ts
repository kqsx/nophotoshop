import type { Geometry } from './params';

export type Drawable = ImageBitmap | HTMLCanvasElement | HTMLImageElement | OffscreenCanvas;

export function srcSize(img: Drawable): [number, number] {
  if ('naturalWidth' in img) return [img.naturalWidth, img.naturalHeight];
  return [img.width, img.height];
}

/** Kích thước khung sau xoay 90°. */
export function frameSize(img: Drawable, g: Geometry): [number, number] {
  const [w, h] = srcSize(img);
  return g.rot90 % 2 ? [h, w] : [w, h];
}

/** Kích thước vùng cắt (đơn vị px ảnh gốc). */
export function croppedSize(img: Drawable, g: Geometry): [number, number] {
  const [W, H] = frameSize(img, g);
  return [Math.max(1, Math.round(W * g.crop.w)), Math.max(1, Math.round(H * g.crop.h))];
}

/** Tính kích thước xuất theo cạnh dài mong muốn (giữ tỷ lệ). */
export function fitLong(w: number, h: number, long: number): [number, number] {
  const s = long / Math.max(w, h);
  return [Math.max(1, Math.round(w * s)), Math.max(1, Math.round(h * s))];
}

export function straightenZoom(W: number, H: number, deg: number) {
  const t = Math.abs((deg * Math.PI) / 180);
  const c = Math.cos(t), s = Math.sin(t);
  return Math.max((W * c + H * s) / W, (W * s + H * c) / H);
}

/**
 * Vẽ một mảnh (tile) của ảnh đã cắt/xoay ở độ phân giải xuất outW×outH.
 * Mảnh bắt đầu tại (tx,ty) với viền đệm pad px mỗi phía.
 */
export function drawGeometry(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  img: Drawable,
  g: Geometry,
  outW: number,
  outH: number,
  tx = 0,
  ty = 0,
  pad = 0,
) {
  const [W0, H0] = srcSize(img);
  const [W1, H1] = frameSize(img, g);
  const { x: cx, y: cy, w: cw, h: ch } = g.crop;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.translate(-(tx - pad), -(ty - pad));
  ctx.scale(outW / (cw * W1), outH / (ch * H1));
  ctx.translate(-cx * W1, -cy * H1);
  ctx.translate(W1 / 2, H1 / 2);
  if (g.straighten) {
    ctx.rotate((g.straighten * Math.PI) / 180);
    const z = straightenZoom(W1, H1, g.straighten);
    ctx.scale(z, z);
  }
  ctx.scale(g.flipH ? -1 : 1, g.flipV ? -1 : 1);
  ctx.rotate((g.rot90 * Math.PI) / 2);
  ctx.drawImage(img as CanvasImageSource, -W0 / 2, -H0 / 2, W0, H0);
  ctx.restore();
}

export function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

/** Ảnh đã cắt/xoay ở cạnh dài `long` (dùng cho xem trước, phân tích, mờ nền). */
export function renderGeometryCanvas(img: Drawable, g: Geometry, long: number, allowUpscale = false): HTMLCanvasElement {
  const [cw, ch] = croppedSize(img, g);
  const target = allowUpscale ? long : Math.min(long, Math.max(cw, ch));
  const [w, h] = fitLong(cw, ch, target);
  const c = makeCanvas(w, h);
  drawGeometry(c.getContext('2d')!, img, g, w, h);
  return c;
}
