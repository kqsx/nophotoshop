/** Gộp thống kê ngày → tuần/tháng/năm (hàm thuần, có test). */
export type Range = 'day' | 'week' | 'month' | 'year';

export function isoWeek(d: Date): string {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const y = t.getUTCFullYear();
  const w = Math.ceil(((t.getTime() - Date.UTC(y, 0, 1)) / 86400000 + 1) / 7);
  return `${y}-T${String(w).padStart(2, '0')}`;
}

export function bucketOf(day: string, r: Range): string {
  if (r === 'day') return day;
  if (r === 'month') return day.slice(0, 7);
  if (r === 'year') return day.slice(0, 4);
  return isoWeek(new Date(day + 'T00:00:00Z'));
}

export interface Aggregated {
  series: { bucket: string; visit: number; image: number; export: number; preset: number; lut: number; share: number; install: number; error: number }[];
  totals: Record<string, number>;
  top: { presets: [string, number][]; luts: [string, number][]; devices: [string, number][]; sources: [string, number][]; formats: [string, number][] };
}

const BASE = ['visit', 'image', 'export', 'preset', 'lut', 'share', 'install', 'error'] as const;

export function aggregate(days: { day: string; data: Record<string, string> }[], r: Range): Aggregated {
  const buckets = new Map<string, Record<string, number>>();
  const totals: Record<string, number> = {};
  for (const { day, data } of days) {
    const b = bucketOf(day, r);
    const cur = buckets.get(b) ?? {};
    for (const [k, v] of Object.entries(data)) {
      const n = Number(v) || 0;
      totals[k] = (totals[k] || 0) + n;
      if ((BASE as readonly string[]).includes(k)) cur[k] = (cur[k] || 0) + n;
    }
    buckets.set(b, cur);
  }
  const series = [...buckets.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([bucket, c]) => ({
    bucket, visit: c.visit || 0, image: c.image || 0, export: c.export || 0, preset: c.preset || 0, lut: c.lut || 0, share: c.share || 0, install: c.install || 0, error: c.error || 0,
  }));
  const top = (prefix: string) =>
    Object.entries(totals).filter(([k]) => k.startsWith(prefix)).map(([k, v]) => [k.slice(prefix.length), v] as [string, number]).sort((a, b) => b[1] - a[1]).slice(0, 12);
  return {
    series,
    totals: Object.fromEntries(BASE.map((k) => [k, totals[k] || 0])),
    top: { presets: top('preset:'), luts: top('lut:'), devices: top('dev:'), sources: top('visit:src:'), formats: top('export:') },
  };
}

export function daysBetween(from: string, to: string): string[] {
  const out: string[] = [];
  const a = new Date(from + 'T00:00:00Z'), b = new Date(to + 'T00:00:00Z');
  for (let t = a.getTime(); t <= b.getTime() && out.length < 3700; t += 86400000) out.push(new Date(t).toISOString().slice(0, 10));
  return out;
}
