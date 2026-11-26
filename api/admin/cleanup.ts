import { handle, json, error, readJson, dayKey, rateLimit } from '../_lib/http.js';
import { requireAdmin, verifyPassword } from '../_lib/auth.js';
import { getStore } from '../_lib/store.js';
import { PREFIX, DATA_TYPES, audit, getRetention, isDate, type DataType, type Retention } from '../_lib/data.js';

interface TrashItem { key: string; kind: 'hash' | 'json'; value: unknown }
interface Trash { id: string; at: string; types: DataType[]; from: string; to: string; records: number; bytes: number; items: TrashItem[] }
const TRASH_DAYS = 7;

/** Tìm các khóa thuộc loại dữ liệu trong khoảng ngày. */
async function collect(types: DataType[], from: string, to: string) {
  const store = getStore();
  const items: { type: DataType; key: string; kind: 'hash' | 'json'; records: number; bytes: number }[] = [];
  for (const t of types) {
    if (t === 'luts') {
      const ids = (await store.get<string[]>('lut:index')) || [];
      for (const id of ids) {
        const m = await store.get<{ createdAt: string; bytes: number }>(`lut:meta:${id}`);
        const d = m?.createdAt?.slice(0, 10);
        if (m && d && d >= from && d <= to) {
          items.push({ type: t, key: `lut:meta:${id}`, kind: 'json', records: 1, bytes: m.bytes });
          if (await store.get(`lut:data:${id}`)) items.push({ type: t, key: `lut:data:${id}`, kind: 'json', records: 0, bytes: 0 });
        }
      }
      continue;
    }
    const p = PREFIX[t];
    for (const key of await store.keys(p)) {
      const d = key.slice(p.length);
      if (d < from || d > to) continue;
      const h = await store.hgetall(key);
      const n = Object.keys(h).length;
      const bytes = Object.entries(h).reduce((a, [k, v]) => a + k.length + v.length, 0);
      items.push({ type: t, key, kind: 'hash', records: t === 'stats' ? Object.values(h).reduce((a, v) => a + (Number(v) || 0), 0) : n, bytes });
    }
  }
  return items;
}

async function removeLutIndex(keys: string[]) {
  const store = getStore();
  const gone = keys.filter((k) => k.startsWith('lut:meta:')).map((k) => k.slice(9));
  if (!gone.length) return;
  const ids = (await store.get<string[]>('lut:index')) || [];
  await store.set('lut:index', ids.filter((x) => !gone.includes(x)));
}

async function softDelete(types: DataType[], from: string, to: string, permanent: boolean) {
  const store = getStore();
  const found = await collect(types, from, to);
  const keys = found.map((f) => f.key);
  const records = found.reduce((a, f) => a + f.records, 0);
  const bytes = found.reduce((a, f) => a + f.bytes, 0);
  if (!permanent && keys.length) {
    const items: TrashItem[] = [];
    for (const f of found) items.push({ key: f.key, kind: f.kind, value: f.kind === 'hash' ? await store.hgetall(f.key) : await store.get(f.key) });
    const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
    const t: Trash = { id, at: new Date().toISOString(), types, from, to, records, bytes, items };
    await store.set(`trash:${id}`, t, (TRASH_DAYS + 1) * 86400);
  }
  await store.del(keys);
  await removeLutIndex(keys);
  return { keys: keys.length, records, bytes };
}

async function listTrash() {
  const store = getStore();
  const out: Omit<Trash, 'items'>[] = [];
  for (const k of await store.keys('trash:')) {
    const t = await store.get<Trash>(k);
    if (t) { const { items: _i, ...rest } = t; void _i; out.push(rest); }
  }
  return out.sort((a, b) => b.at.localeCompare(a.at));
}

/** Chạy chính sách giữ dữ liệu (Cron hằng ngày). */
async function autoClean(r: Retention) {
  const today = new Date();
  const before = (days: number) => dayKey(new Date(today.getTime() - days * 86400000));
  const res: Record<string, unknown> = {};
  if (r.enabled) {
    res.logs = await softDelete(['logs'], '0000-01-01', before(r.logsDays + 1), true);
    res.stats = await softDelete(['stats'], '0000-01-01', before(r.statsMonths * 30.44 + 1), true);
    res.feedback = await softDelete(['feedback'], '0000-01-01', before(r.feedbackDays + 1), true);
    res.audit = await softDelete(['audit'], '0000-01-01', before(r.auditMonths * 30.44 + 1), true);
  }
  // thùng rác quá 7 ngày → xóa hẳn
  const store = getStore();
  let purged = 0;
  for (const k of await store.keys('trash:')) {
    const t = await store.get<Trash>(k);
    if (!t || Date.now() - Date.parse(t.at) > TRASH_DAYS * 86400000) { await store.del([k]); purged++; }
  }
  res.trashPurged = purged;
  return res;
}

const PREFIX_USAGE: [string, string][] = [['LUT', 'lut:'], ['Thống kê', PREFIX.stats], ['Nhật ký lỗi', PREFIX.logs], ['Phản hồi', PREFIX.feedback], ['Nhật ký admin', PREFIX.audit], ['Thùng rác', 'trash:'], ['Cấu hình', 'cfg:']];

export const GET = handle(async (req) => {
  const url = new URL(req.url);
  const auth = req.headers.get('authorization');
  // Vercel Cron gọi GET kèm "Authorization: Bearer <CRON_SECRET>"
  if (url.searchParams.get('cron') === '1' || (auth?.startsWith('Bearer ') && !!process.env.CRON_SECRET)) {
    if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) return error(401, 'Sai CRON_SECRET');
    const res = await autoClean(await getRetention());
    await audit(null, 'auto-cleanup', res);
    return json({ ok: true, res });
  }
  await requireAdmin(req);
  if (url.searchParams.get('trash') === '1') return json({ ok: true, trash: await listTrash() });
  if (url.searchParams.get('retention') === '1') return json({ ok: true, retention: await getRetention() });
  if (url.searchParams.get('audit') === '1') {
    const store = getStore();
    const keys = (await store.keys(PREFIX.audit)).slice(-60);
    const all = await store.hgetallMany(keys);
    const entries = all.flatMap((h) => Object.values(h).map((v) => { try { return JSON.parse(v); } catch { return null; } })).filter(Boolean);
    entries.sort((a, b) => String(b.at).localeCompare(String(a.at)));
    return json({ ok: true, entries: entries.slice(0, 300) });
  }
  if (url.searchParams.get('usage') === '1') {
    const store = getStore();
    const rows: { label: string; keys: number; bytes: number }[] = [];
    for (const [label, p] of PREFIX_USAGE) {
      const ks = await store.keys(p);
      let bytes = 0;
      for (const k of ks.slice(0, 2000)) bytes += await store.size(k);
      rows.push({ label, keys: ks.length, bytes });
    }
    const limit = Number(process.env.STORAGE_LIMIT_BYTES || 256 * 1024 * 1024);
    return json({ ok: true, store: store.kind, rows, used: rows.reduce((a, r) => a + r.bytes, 0), limit });
  }
  return error(400, 'Thiếu tham số');
});

export const POST = handle(async (req) => {
  await requireAdmin(req);
  if (!(await rateLimit(req, 'admin', 120))) return error(429, 'Quá nhiều yêu cầu');
  const b = await readJson<{ action?: string; from?: string; to?: string; types?: string[]; preview?: boolean; confirm?: string; password?: string; permanent?: boolean; id?: string; all?: boolean; retention?: Partial<Retention> }>(req, 20_000);
  const types = (Array.isArray(b.types) ? b.types : []).filter((t): t is DataType => (DATA_TYPES as string[]).includes(t));
  const store = getStore();
  const needConfirm = async () => {
    if (b.confirm !== 'XOA') return error(400, 'Hãy gõ đúng chữ XOA để xác nhận');
    if (!(await verifyPassword(b.password || ''))) { await audit(req, 'cleanup-bad-password', null); return error(401, 'Mật khẩu admin không đúng'); }
    return null;
  };
  switch (b.action ?? (b.preview ? 'preview' : 'delete')) {
    case 'preview':
    case 'delete':
    case 'backup': {
      if (!isDate(b.from) || !isDate(b.to) || b.from > b.to) return error(400, 'Khoảng ngày không hợp lệ');
      if (!types.length) return error(400, 'Chọn ít nhất một loại dữ liệu');
      if (b.action === 'preview' || b.preview) {
        const found = await collect(types, b.from, b.to);
        const by: Record<string, { keys: number; records: number; bytes: number }> = {};
        for (const f of found) {
          by[f.type] ??= { keys: 0, records: 0, bytes: 0 };
          by[f.type].keys++; by[f.type].records += f.records; by[f.type].bytes += f.bytes;
        }
        return json({ ok: true, preview: true, records: found.reduce((a, f) => a + f.records, 0), bytes: found.reduce((a, f) => a + f.bytes, 0), keys: found.length, by });
      }
      if (b.action === 'backup') {
        const found = await collect(types, b.from, b.to);
        const data: Record<string, unknown> = {};
        for (const f of found) data[f.key] = f.kind === 'hash' ? await store.hgetall(f.key) : f.key.startsWith('lut:data:') ? '(nội dung LUT bỏ qua trong sao lưu)' : await store.get(f.key);
        await audit(req, 'backup', { types, from: b.from, to: b.to, keys: found.length });
        return json({ ok: true, exportedAt: new Date().toISOString(), types, from: b.from, to: b.to, data });
      }
      const bad = await needConfirm();
      if (bad) return bad;
      const r = await softDelete(types, b.from, b.to, !!b.permanent);
      await audit(req, b.permanent ? 'delete-permanent' : 'delete-soft', { types, from: b.from, to: b.to, ...r });
      return json({ ok: true, deleted: r.records, keys: r.keys, bytes: r.bytes, trash: !b.permanent });
    }
    case 'restore': {
      const t = await store.get<Trash>(`trash:${b.id}`);
      if (!t) return error(404, 'Không còn trong thùng rác');
      for (const it of t.items) {
        if (it.kind === 'hash') await store.hsetall(it.key, it.value as Record<string, string>);
        else await store.set(it.key, it.value);
      }
      const lutIds = t.items.filter((i) => i.key.startsWith('lut:meta:')).map((i) => i.key.slice(9));
      if (lutIds.length) {
        const ids = (await store.get<string[]>('lut:index')) || [];
        await store.set('lut:index', [...new Set([...ids, ...lutIds])]);
      }
      await store.del([`trash:${b.id}`]);
      await audit(req, 'restore', { id: b.id, records: t.records });
      return json({ ok: true, restored: t.records });
    }
    case 'purge': {
      const bad = await needConfirm();
      if (bad) return bad;
      const keys = b.all ? await store.keys('trash:') : [`trash:${b.id}`];
      const n = await store.del(keys);
      await audit(req, 'purge', { count: n });
      return json({ ok: true, purged: n });
    }
    case 'retention': {
      const cur = await getRetention();
      const r = b.retention || {};
      const num = (v: unknown, lo: number, hi: number, d: number) => (typeof v === 'number' && v >= lo && v <= hi ? Math.round(v) : d);
      const next: Retention = {
        enabled: typeof r.enabled === 'boolean' ? r.enabled : cur.enabled,
        logsDays: num(r.logsDays, 1, 3650, cur.logsDays),
        statsMonths: num(r.statsMonths, 1, 120, cur.statsMonths),
        auditMonths: num(r.auditMonths, 1, 120, cur.auditMonths),
        feedbackDays: num(r.feedbackDays, 1, 3650, cur.feedbackDays),
      };
      await store.set('cfg:retention', next);
      await audit(req, 'retention', next);
      return json({ ok: true, retention: next });
    }
    case 'run-auto': {
      const res = await autoClean(await getRetention());
      await audit(req, 'auto-cleanup-manual', res);
      return json({ ok: true, res });
    }
  }
  return error(400, 'Hành động không hợp lệ');
});
