import { handle, json, readJson } from '../_lib/http.js';
import { requireAdmin } from '../_lib/auth.js';
import { getStore } from '../_lib/store.js';
import { audit } from '../_lib/data.js';

const clean = (s: unknown, n: number) => String(s ?? '').replace(/[<>"`\\]/g, '').trim().slice(0, n);

/** GET công khai: cấu hình app · PUT admin: lưu cấu hình. */
export const GET = handle(async () => {
  const config = (await getStore().get<Record<string, unknown>>('cfg:app')) || {};
  return json({ ok: true, config }, 200, { 'Cache-Control': 'public, max-age=60' });
});

export const PUT = handle(async (req) => {
  await requireAdmin(req);
  const b = await readJson<Record<string, unknown>>(req, 20_000);
  const arr = (v: unknown) => (Array.isArray(v) ? v.map((x) => clean(x, 40)).filter(Boolean).slice(0, 60) : []);
  const config = {
    appName: clean(b.appName, 40) || 'NoPhotoShop',
    author: clean(b.author, 40) || 'By DucAnh',
    phone: clean(b.phone, 20).replace(/[^\d+]/g, '') || '0904817613',
    footer: clean(b.footer, 200),
    accent: /^#[0-9a-f]{6}$/i.test(String(b.accent)) ? String(b.accent) : '#0a84ff',
    disabledPresets: arr(b.disabledPresets),
    featuredPresets: arr(b.featuredPresets),
    wmFonts: arr(b.wmFonts),
  };
  await getStore().set('cfg:app', config);
  await audit(req, 'config', null);
  return json({ ok: true, config });
});
