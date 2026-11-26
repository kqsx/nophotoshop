import { handle, json, error, rateLimit, readJson, HttpError } from '../_lib/http.js';
import { getSession, requireAdmin } from '../_lib/auth.js';
import { getStore } from '../_lib/store.js';
import { audit } from '../_lib/data.js';
import { parseCube, serializeCube, slugify, CubeError } from '../../src/engine/cube.js';
import { SCALAR_KEYS } from '../../src/engine/params.js';

export interface LutMeta {
  id: string; name: string; group: string; collection: string; kind: 'cube' | 'xmp';
  order: number; enabled: boolean; size: number; bytes: number; createdAt: string; delta?: Record<string, unknown>;
}

const MAX_LUTS = 300;
const clean = (s: unknown, n = 40) => String(s ?? '').replace(/[<>"'`\\]/g, '').replace(/\s+/g, ' ').trim().slice(0, n);

async function listMeta(): Promise<LutMeta[]> {
  const store = getStore();
  const ids = (await store.get<string[]>('lut:index')) || [];
  const metas = await Promise.all(ids.map((id) => store.get<LutMeta>(`lut:meta:${id}`)));
  return metas.filter(Boolean).sort((a, b) => a!.order - b!.order) as LutMeta[];
}

function validDelta(d: unknown): Record<string, unknown> {
  if (!d || typeof d !== 'object') throw new HttpError(400, 'Preset Lightroom không hợp lệ');
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(d as Record<string, unknown>)) {
    if ((SCALAR_KEYS as readonly string[]).includes(k) && typeof v === 'number' && Number.isFinite(v)) out[k] = Math.max(-150, Math.min(150, v));
    else if (['hslHue', 'hslSat', 'hslLum'].includes(k) && Array.isArray(v) && v.length === 8 && v.every((x) => typeof x === 'number' && Math.abs(x) <= 100)) out[k] = v;
    else if (k === 'curve' && Array.isArray(v) && v.length <= 32 && v.every((p) => Array.isArray(p) && p.length === 2 && p.every((x) => typeof x === 'number' && x >= 0 && x <= 1))) out[k] = v;
  }
  if (!Object.keys(out).length) throw new HttpError(400, 'Preset Lightroom không có thông số nào dùng được');
  return out;
}

export const GET = handle(async (req) => {
  const url = new URL(req.url);
  const file = url.searchParams.get('file');
  if (file) {
    if (!/^[a-z0-9-]{1,64}$/.test(file)) return error(400, 'id sai');
    const data = await getStore().get<string>(`lut:data:${file}`);
    if (!data) return error(404, 'Không có LUT');
    return new Response(data, { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=86400' } });
  }
  const all = url.searchParams.get('all') === '1' && (await getSession(req));
  const metas = await listMeta();
  return json({ luts: all ? metas : metas.filter((m) => m.enabled) }, 200, { 'Cache-Control': all ? 'no-store' : 'public, max-age=60' });
});

export const POST = handle(async (req) => {
  await requireAdmin(req);
  if (!(await rateLimit(req, 'admin', 120))) return error(429, 'Quá nhiều yêu cầu');
  const body = await readJson<{ name?: string; group?: string; collection?: string; kind?: string; data?: string; delta?: unknown }>(req, 2_600_000);
  const store = getStore();
  const ids = (await store.get<string[]>('lut:index')) || [];
  if (ids.length >= MAX_LUTS) return error(400, `Tối đa ${MAX_LUTS} LUT`);
  const name = clean(body.name, 60) || 'LUT mới';
  let id = slugify(name);
  for (let i = 2; ids.includes(id); i++) id = `${slugify(name).slice(0, 40)}-${i}`;
  const kind = body.kind === 'xmp' ? 'xmp' : 'cube';
  const meta: LutMeta = {
    id, name, group: clean(body.group) || 'Khác', collection: clean(body.collection), kind,
    order: ids.length + 100, enabled: true, size: 0, bytes: 0, createdAt: new Date().toISOString(),
  };
  if (kind === 'cube') {
    if (typeof body.data !== 'string') return error(400, 'Thiếu nội dung .cube');
    let lut;
    try { lut = parseCube(body.data); } catch (e) { return error(400, e instanceof CubeError ? e.message : 'File .cube không hợp lệ'); }
    if (lut.size > 65) return error(400, 'LUT quá lớn');
    const text = serializeCube({ ...lut, title: name });
    if (text.length > 2_500_000) return error(413, 'LUT quá lớn sau khi chuẩn hóa — hãy dùng 33³ hoặc 17³');
    meta.size = lut.size;
    meta.bytes = text.length;
    await store.set(`lut:data:${id}`, text);
  } else {
    meta.delta = validDelta(body.delta);
    meta.bytes = JSON.stringify(meta.delta).length;
  }
  await store.set(`lut:meta:${id}`, meta);
  await store.set('lut:index', [...ids, id]);
  await audit(req, 'lut-upload', { id, name, kind, bytes: meta.bytes });
  return json({ ok: true, lut: meta });
});

export const PATCH = handle(async (req) => {
  await requireAdmin(req);
  const body = await readJson<{ id?: string; name?: string; group?: string; collection?: string; enabled?: boolean; order?: string[] }>(req, 50_000);
  const store = getStore();
  if (Array.isArray(body.order)) {
    const ids = (await store.get<string[]>('lut:index')) || [];
    const order = body.order.filter((x) => ids.includes(x));
    for (let i = 0; i < order.length; i++) {
      const m = await store.get<LutMeta>(`lut:meta:${order[i]}`);
      if (m) await store.set(`lut:meta:${m.id}`, { ...m, order: i });
    }
    await audit(req, 'lut-reorder', { count: order.length });
    return json({ ok: true });
  }
  if (!body.id) return error(400, 'Thiếu id');
  const m = await store.get<LutMeta>(`lut:meta:${body.id}`);
  if (!m) return error(404, 'Không có LUT');
  const next: LutMeta = {
    ...m,
    ...(body.name !== undefined ? { name: clean(body.name, 60) || m.name } : {}),
    ...(body.group !== undefined ? { group: clean(body.group) || 'Khác' } : {}),
    ...(body.collection !== undefined ? { collection: clean(body.collection) } : {}),
    ...(typeof body.enabled === 'boolean' ? { enabled: body.enabled } : {}),
  };
  await store.set(`lut:meta:${m.id}`, next);
  await audit(req, 'lut-edit', { id: m.id });
  return json({ ok: true, lut: next });
});

export const DELETE = handle(async (req) => {
  await requireAdmin(req);
  const id = new URL(req.url).searchParams.get('id') || '';
  const store = getStore();
  const ids = (await store.get<string[]>('lut:index')) || [];
  if (!ids.includes(id)) return error(404, 'Không có LUT');
  await store.del([`lut:meta:${id}`, `lut:data:${id}`]);
  await store.set('lut:index', ids.filter((x) => x !== id));
  await audit(req, 'lut-delete', { id });
  return json({ ok: true });
});
