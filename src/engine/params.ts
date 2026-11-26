/** Toàn bộ thông số chỉnh ảnh. Hầu hết thanh kéo nằm trong −100…100 (hoặc 0…100). */
export type CurvePoint = [number, number];

export interface Curves {
  master: CurvePoint[];
  r: CurvePoint[];
  g: CurvePoint[];
  b: CurvePoint[];
}

export interface HealSpot { x: number; y: number; r: number }

export interface Geometry {
  rot90: 0 | 1 | 2 | 3;
  flipH: boolean;
  flipV: boolean;
  straighten: number; // độ, −45…45
  crop: { x: number; y: number; w: number; h: number }; // tỷ lệ 0…1 trong khung đã xoay
  aspect: string; // 'orig' | '1:1' | ...
  zoom: number; // 1…4
  panX: number; // 0…1
  panY: number;
}

export const SCALAR_KEYS = [
  'exposure', 'contrast', 'highlights', 'shadows', 'whites', 'blacks', 'dehaze', 'clarity',
  'temp', 'tint', 'vibrance', 'saturation',
  'smooth', 'skinBright', 'skinPink', 'skinEven', 'acne', 'darkCircle', 'skinWarm',
  'sky', 'foliage',
  'sharpen', 'denoise', 'grain', 'vignette', 'fade',
] as const;
export type ScalarKey = (typeof SCALAR_KEYS)[number];

export type Scalars = Record<ScalarKey, number>;

export interface Params extends Scalars {
  hslHue: number[]; // 8 dải
  hslSat: number[];
  hslLum: number[];
  curves: Curves;
  heal: HealSpot[];
  lut: { id: string; amount: number } | null;
}

export const HSL_BANDS = ['Đỏ', 'Cam', 'Vàng', 'Lục', 'Lục lam', 'Lam', 'Tím', 'Hồng'] as const;
export const HSL_COLORS = ['#ff3b30', '#ff9500', '#ffcc00', '#34c759', '#32d7d2', '#0a84ff', '#8e5cf7', '#ff2d92'];

const ident = (): CurvePoint[] => [[0, 0], [1, 1]];

export function defaultParams(): Params {
  const s = Object.fromEntries(SCALAR_KEYS.map((k) => [k, 0])) as Scalars;
  return {
    ...s,
    hslHue: Array(8).fill(0),
    hslSat: Array(8).fill(0),
    hslLum: Array(8).fill(0),
    curves: { master: ident(), r: ident(), g: ident(), b: ident() },
    heal: [],
    lut: null,
  };
}

export function defaultGeometry(): Geometry {
  return { rot90: 0, flipH: false, flipV: false, straighten: 0, crop: { x: 0, y: 0, w: 1, h: 1 }, aspect: 'orig', zoom: 1, panX: 0.5, panY: 0.5 };
}

/** Giới hạn của từng thông số [min, max]. */
export const RANGES: Record<ScalarKey, [number, number]> = {
  exposure: [-100, 100], contrast: [-100, 100], highlights: [-100, 100], shadows: [-100, 100],
  whites: [-100, 100], blacks: [-100, 100], dehaze: [-100, 100], clarity: [-100, 100],
  temp: [-100, 100], tint: [-100, 100], vibrance: [-100, 100], saturation: [-100, 100],
  smooth: [0, 100], skinBright: [0, 100], skinPink: [0, 100], skinEven: [0, 100], acne: [0, 100],
  darkCircle: [0, 100], skinWarm: [-100, 100], sky: [0, 100], foliage: [0, 100],
  sharpen: [0, 100], denoise: [0, 100], grain: [0, 100], vignette: [-100, 100], fade: [0, 100],
};

export const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

export type PresetDelta = Partial<Scalars> & {
  hslHue?: number[];
  hslSat?: number[];
  hslLum?: number[];
  curve?: CurvePoint[];
};

/** Cộng dồn: thông số tay + Σ(preset × cường độ). */
export function combine(manual: Params, layers: { delta: PresetDelta; strength: number; lut?: string; lutAmount?: number }[]): Params {
  const out: Params = structuredClone(manual);
  for (const { delta, strength, lut, lutAmount } of layers) {
    const k = strength / 100;
    for (const key of SCALAR_KEYS) {
      const d = delta[key];
      if (d) out[key] += d * k;
    }
    for (const arr of ['hslHue', 'hslSat', 'hslLum'] as const) {
      const d = delta[arr];
      if (d) for (let i = 0; i < 8; i++) out[arr][i] += (d[i] || 0) * k;
    }
    if (delta.curve && isDefaultCurve(manual.curves.master))
      out.curves.master = delta.curve.map(([x, y]) => [x, x + (y - x) * Math.min(1, k)] as CurvePoint);
    if (lut && !manual.lut) out.lut = { id: lut, amount: (lutAmount ?? 100) * k };
  }
  for (const key of SCALAR_KEYS) out[key] = clamp(out[key], RANGES[key][0] * 1.5, RANGES[key][1] * 1.5);
  return out;
}

export function isDefaultCurve(c: CurvePoint[]) {
  return c.length === 2 && c[0][0] === 0 && c[0][1] === 0 && c[1][0] === 1 && c[1][1] === 1;
}

/** Đường cong spline đơn điệu (Fritsch–Carlson) → bảng 256 giá trị. */
export function curveTable(points: CurvePoint[]): Float32Array {
  const pts = [...points].sort((a, b) => a[0] - b[0]);
  const n = pts.length;
  const out = new Float32Array(256);
  if (n < 2) { for (let i = 0; i < 256; i++) out[i] = i / 255; return out; }
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const d: number[] = [];
  const m: number[] = [];
  for (let i = 0; i < n - 1; i++) d.push((ys[i + 1] - ys[i]) / Math.max(1e-6, xs[i + 1] - xs[i]));
  m.push(d[0]);
  for (let i = 1; i < n - 1; i++) m.push(d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2);
  m.push(d[n - 2]);
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) { m[i] = 0; m[i + 1] = 0; continue; }
    const a = m[i] / d[i], b = m[i + 1] / d[i];
    const s = a * a + b * b;
    if (s > 9) { const t = 3 / Math.sqrt(s); m[i] = t * a * d[i]; m[i + 1] = t * b * d[i]; }
  }
  for (let j = 0; j < 256; j++) {
    const x = j / 255;
    let i = 0;
    if (x <= xs[0]) { out[j] = ys[0]; continue; }
    if (x >= xs[n - 1]) { out[j] = ys[n - 1]; continue; }
    while (i < n - 2 && x > xs[i + 1]) i++;
    const h = xs[i + 1] - xs[i];
    const t = (x - xs[i]) / h;
    const t2 = t * t, t3 = t2 * t;
    out[j] = clamp(
      (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h * m[i] + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h * m[i + 1],
      0, 1,
    );
  }
  return out;
}
