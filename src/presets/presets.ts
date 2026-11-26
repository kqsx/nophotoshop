import data from './presets.json';
import type { PresetDelta } from '../engine/params';
import { autoBright, type Analysis } from '../analysis/analyze';

export interface Preset {
  id: string;
  name: string;
  group: string;
  icon: string;
  color: string;
  strength: number;
  when: string[];
  desc: string;
  delta?: PresetDelta;
  lut?: string;
  dynamic?: 'auto';
  custom?: boolean;
}

export const PRESETS: Preset[] = data.presets as Preset[];
export const QUICK_ORDER = ['auto', 'beauty', 'portrait', 'nature', 'studio', 'backlit', 'sunrise', 'clear', 'skin', 'sky', 'green', 'night', 'food', 'product', 'landscape', 'acne', 'even', 'film', 'vintage', 'bw'];

export function presetDelta(p: Preset, a: Analysis | null): PresetDelta {
  if (p.dynamic === 'auto') return a ? autoBright(a) : { exposure: 6, shadows: 20, highlights: -20, clarity: 10, vibrance: 15 };
  return p.delta ?? {};
}

/** Chấm điểm preset theo nội dung ảnh → 4 gợi ý tốt nhất. */
export function suggest(a: Analysis | null, list: Preset[] = PRESETS): Preset[] {
  if (!a) return list.slice(0, 4);
  const score = (p: Preset) => {
    let s = 0;
    for (const w of p.when) {
      if (w === 'any') s += 1;
      if (w === 'face' && a.hasPerson) s += 3 + a.skin * 10;
      if (w === 'sky' && a.hasSky) s += 2.5 + a.sky * 6;
      if (w === 'green' && a.hasGreen) s += 2.5 + a.green * 5;
      if (w === 'dark' && a.isDark) s += 3;
      if (w === 'backlit' && a.isBacklit) s += 4;
      if (w === 'night' && a.isNight) s += 4.5;
      if (w === 'food' && a.isFood) s += 3.5;
      if (w === 'product' && a.isProduct) s += 3.2;
    }
    if (p.id === 'auto') s += 2.2;
    return s;
  };
  return [...list].map((p) => ({ p, s: score(p) })).filter((x) => x.s > 0).sort((x, y) => y.s - x.s).slice(0, 4).map((x) => x.p);
}

/** «Tự động chọn cho tôi»: Auto sáng + preset phù hợp nhất (nếu có). */
export function autoPick(a: Analysis | null): { id: string; strength: number }[] {
  const out = [{ id: 'auto', strength: 80 }];
  if (!a) return out;
  if (a.isNight) out.push({ id: 'night', strength: 60 });
  else if (a.isBacklit) out.push({ id: 'backlit', strength: 60 });
  if (a.hasPerson) out.push({ id: 'beauty', strength: 90 });
  else if (a.hasSky && a.hasGreen) out.push({ id: 'nature', strength: 60 });
  else if (a.hasSky) out.push({ id: 'sky', strength: 60 });
  else if (a.hasGreen) out.push({ id: 'green', strength: 60 });
  else if (a.isFood) out.push({ id: 'food', strength: 60 });
  else if (a.isProduct) out.push({ id: 'product', strength: 60 });
  else out.push({ id: 'clear', strength: 50 });
  return out;
}
