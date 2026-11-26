/**
 * Đọc preset Lightroom (.xmp, Camera Raw Settings) và quy đổi sang thông số NoPhotoShop.
 * Lightroom preset là bộ thông số chứ không phải LUT, nên được lưu như một "preset màu".
 */
import type { PresetDelta, CurvePoint } from './params';

export interface XmpPreset {
  name: string;
  delta: PresetDelta;
  curve?: CurvePoint[];
}

const BANDS = ['Red', 'Orange', 'Yellow', 'Green', 'Aqua', 'Blue', 'Purple', 'Magenta'];

function readAttr(xml: string, name: string): string | null {
  const a = new RegExp(`crs:${name}\\s*=\\s*"([^"]*)"`).exec(xml);
  if (a) return a[1];
  const e = new RegExp(`<crs:${name}>([^<]*)</crs:${name}>`).exec(xml);
  return e ? e[1] : null;
}
const num = (xml: string, name: string): number | null => {
  const v = readAttr(xml, name);
  if (v == null) return null;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
};
const c100 = (v: number) => Math.max(-100, Math.min(100, Math.round(v)));

export function parseXmp(xml: string): XmpPreset {
  if (typeof xml !== 'string' || xml.length > 2_000_000) throw new Error('File XMP quá lớn');
  if (!/crs:|camera-raw-settings/i.test(xml)) throw new Error('Không phải preset Lightroom/Camera Raw (.xmp)');
  const d: PresetDelta = {};
  const set = (k: keyof PresetDelta, v: number | null, f = 1) => { if (v != null && v !== 0) (d as Record<string, number>)[k] = c100(v * f); };
  const exp = num(xml, 'Exposure2012') ?? num(xml, 'Exposure');
  if (exp != null) d.exposure = c100((exp / 2.5) * 100);
  set('contrast', num(xml, 'Contrast2012') ?? num(xml, 'Contrast'), 0.8);
  set('highlights', num(xml, 'Highlights2012'));
  set('shadows', num(xml, 'Shadows2012'));
  set('whites', num(xml, 'Whites2012'));
  set('blacks', num(xml, 'Blacks2012'));
  set('clarity', num(xml, 'Clarity2012') ?? num(xml, 'Clarity'));
  set('dehaze', num(xml, 'Dehaze'));
  set('vibrance', num(xml, 'Vibrance'));
  set('saturation', num(xml, 'Saturation'));
  const it = num(xml, 'IncrementalTemperature');
  const kt = num(xml, 'Temperature');
  if (it != null) set('temp', it);
  else if (kt != null) set('temp', (kt - 5500) / 40);
  const tint = num(xml, 'IncrementalTint') ?? num(xml, 'Tint');
  set('tint', tint);
  set('sharpen', num(xml, 'Sharpness'), 0.6);
  set('denoise', num(xml, 'LuminanceSmoothing'));
  set('grain', num(xml, 'GrainAmount'));
  set('vignette', num(xml, 'PostCropVignetteAmount'));
  const hue: number[] = [], sat: number[] = [], lum: number[] = [];
  let anyHsl = false;
  BANDS.forEach((b, i) => {
    hue[i] = c100(num(xml, `HueAdjustment${b}`) ?? 0);
    sat[i] = c100(num(xml, `SaturationAdjustment${b}`) ?? 0);
    lum[i] = c100(num(xml, `LuminanceAdjustment${b}`) ?? 0);
    if (hue[i] || sat[i] || lum[i]) anyHsl = true;
  });
  if (anyHsl) { d.hslHue = hue; d.hslSat = sat; d.hslLum = lum; }
  // Đen trắng
  if (/crs:ConvertToGrayscale\s*=\s*"True"/i.test(xml) || /<crs:ConvertToGrayscale>True/i.test(xml)) d.saturation = -100;
  // Tone curve (PV2012)
  let curve: CurvePoint[] | undefined;
  const seq = /<crs:ToneCurvePV2012>\s*<rdf:Seq>([\s\S]*?)<\/rdf:Seq>/.exec(xml);
  if (seq) {
    const pts = [...seq[1].matchAll(/<rdf:li>\s*(\d+)\s*,\s*(\d+)\s*<\/rdf:li>/g)].map(
      (m) => [Number(m[1]) / 255, Number(m[2]) / 255] as CurvePoint,
    );
    if (pts.length >= 2 && !(pts.length === 2 && pts[0][1] === 0 && pts[1][1] === 1)) curve = pts;
  }
  const nameMatch = /<crs:Name>\s*<rdf:Alt>\s*<rdf:li[^>]*>([^<]*)<\/rdf:li>/.exec(xml) || /crs:PresetName\s*=\s*"([^"]*)"/.exec(xml);
  return { name: (nameMatch?.[1] || '').trim().slice(0, 60), delta: d, curve };
}
