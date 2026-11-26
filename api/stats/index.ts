import { handle, json, error, rateLimit, readJson, dayKey } from '../_lib/http.js';
import { requireAdmin } from '../_lib/auth.js';
import { getStore } from '../_lib/store.js';
import { PREFIX, isDate } from '../_lib/data.js';
import { aggregate, type Range } from '../_lib/agg.js';

const TYPES = new Set(['visit', 'image', 'preset', 'lut', 'export', 'share', 'install', 'error']);
const DEVICES = new Set(['mobile', 'tablet', 'desktop']);

/** POST công khai: nhận sự kiện ẩn danh (không IP, không ảnh). */
export const POST = handle(async (req) => {
  if (!(await rateLimit(req, 'stats', 30))) return json({ ok: false }, 429);
  const body = await readJson<{ events?: { t?: string; id?: string }[]; device?: string }>(req, 16_000);
  const events = Array.isArray(body.events) ? body.events.slice(0, 50) : [];
  const store = getStore();
  const key = PREFIX.stats + dayKey(new Date());
  let visit = false;
  for (const e of events) {
    if (!e || !TYPES.has(String(e.t))) continue;
    await store.hincrby(key, String(e.t), 1);
    const id = typeof e.id === 'string' ? e.id.toLowerCase().replace(/[^a-z0-9:_-]/g, '').slice(0, 48) : '';
    if (id) await store.hincrby(key, `${e.t}:${id}`, 1);
    if (e.t === 'visit') visit = true;
    if (e.t === 'error') {
      const ua = req.headers.get('user-agent') || '';
      const browser = /Edg\//.test(ua) ? 'edge' : /Chrome\//.test(ua) ? 'chrome' : /Safari\//.test(ua) ? 'safari' : /Firefox\//.test(ua) ? 'firefox' : 'other';
      await store.hset(PREFIX.logs + dayKey(new Date()), `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, JSON.stringify({ code: id || 'unknown', browser }));
    }
  }
  if (visit && DEVICES.has(String(body.device))) await store.hincrby(key, `dev:${body.device}`, 1);
  return new Response(null, { status: 204 });
});

/** GET admin: thống kê theo ngày / tuần / tháng / năm. */
export const GET = handle(async (req) => {
  await requireAdmin(req);
  const url = new URL(req.url);
  const range = (['day', 'week', 'month', 'year'].includes(url.searchParams.get('range') || '') ? url.searchParams.get('range') : 'day') as Range;
  const today = dayKey(new Date());
  const defFrom: Record<Range, number> = { day: 30, week: 7 * 16, month: 366, year: 365 * 5 };
  const from = url.searchParams.get('from') || dayKey(new Date(Date.now() - defFrom[range] * 86400000));
  const to = url.searchParams.get('to') || today;
  if (!isDate(from) || !isDate(to) || from > to) return error(400, 'Khoảng ngày không hợp lệ');
  const store = getStore();
  const keys = (await store.keys(PREFIX.stats)).filter((k) => {
    const d = k.slice(PREFIX.stats.length);
    return d >= from && d <= to;
  });
  const data = await store.hgetallMany(keys);
  const days = keys.map((k, i) => ({ day: k.slice(PREFIX.stats.length), data: data[i] }));
  const agg = aggregate(days, range);
  // điền đủ ngày trống cho biểu đồ ngày
  return json({ ok: true, range, from, to, ...agg });
});
