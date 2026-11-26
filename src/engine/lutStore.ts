import { parseCube, type CubeLut } from './cube';
import type { PresetDelta } from './params';

export interface LutItem {
  id: string;
  name: string;
  group: string;
  collection?: string;
  kind: 'cube' | 'xmp';
  url?: string;
  size?: number;
  order?: number;
  enabled?: boolean;
  delta?: PresetDelta;
  builtin?: boolean;
}

const cache = new Map<string, CubeLut>();
const pending = new Map<string, Promise<CubeLut | null>>();
let catalog: LutItem[] = [];
let catalogPromise: Promise<LutItem[]> | null = null;

export async function loadCatalog(force = false): Promise<LutItem[]> {
  if (catalogPromise && !force) return catalogPromise;
  catalogPromise = (async () => {
    const out: LutItem[] = [];
    try {
      const r = await fetch('/luts/luts.json');
      if (r.ok) {
        const j = (await r.json()) as { luts: LutItem[] };
        out.push(...j.luts.map((l) => ({ ...l, builtin: true })));
      }
    } catch { /* offline */ }
    try {
      const r = await fetch('/api/luts');
      if (r.ok) {
        const j = (await r.json()) as { luts: LutItem[] };
        for (const l of j.luts) if (l.enabled !== false && !out.some((o) => o.id === l.id)) out.push(l);
      }
    } catch { /* chưa có API */ }
    out.sort((a, b) => (a.order ?? 999) - (b.order ?? 999) || a.name.localeCompare(b.name, 'vi'));
    catalog = out;
    return out;
  })();
  return catalogPromise;
}

export function catalogNow() { return catalog; }
export function findItem(id: string) { return catalog.find((l) => l.id === id); }

export function registerLut(id: string, lut: CubeLut) { cache.set(id, lut); }

export async function getLut(id: string): Promise<CubeLut | null> {
  const c = cache.get(id);
  if (c) return c;
  if (pending.has(id)) return pending.get(id)!;
  const p = (async () => {
    if (!catalog.length) await loadCatalog();
    const item = findItem(id);
    const url = item?.url ?? `/api/luts?file=${encodeURIComponent(id)}`;
    try {
      const r = await fetch(url);
      if (!r.ok) return null;
      const lut = parseCube(await r.text());
      cache.set(id, lut);
      return lut;
    } catch (e) {
      console.warn('LUT lỗi', id, e);
      return null;
    } finally {
      pending.delete(id);
    }
  })();
  pending.set(id, p);
  return p;
}
