import { handle, json, error, rateLimit, readJson } from '../_lib/http.js';
import { clearSessionCookie, createSessionCookie, getSession, lockStatus, registerFail, revokeSession, totpEnabled, verifyPassword, verifyTotp } from '../_lib/auth.js';
import { getStore } from '../_lib/store.js';
import { audit } from '../_lib/data.js';

/** GET: trạng thái phiên · POST: đăng nhập · DELETE: đăng xuất */
export const GET = handle(async (req) => {
  const s = await getSession(req);
  return json({ ok: true, authed: !!s, totp: totpEnabled(), store: getStore().kind, expiresAt: s?.exp ?? null });
});

export const POST = handle(async (req) => {
  if (!(await rateLimit(req, 'login', 10))) return error(429, 'Thử quá nhiều lần, đợi 1 phút');
  const lock = await lockStatus(req);
  if (lock.locked) return error(423, `Đã khóa do nhập sai nhiều lần. Thử lại sau ${Math.ceil(lock.retryAfter / 60)} phút.`, { retryAfter: lock.retryAfter });
  const { password, code } = await readJson<{ password?: string; code?: string }>(req, 4000);
  const ok = (await verifyPassword(password || '')) && verifyTotp(code || '');
  if (!ok) {
    await registerFail(lock.key, lock.fails);
    await audit(req, 'login-fail', null);
    const left = 4 - lock.fails;
    return error(401, left > 0 ? `Sai mật khẩu${totpEnabled() ? ' hoặc mã 2FA' : ''}. Còn ${left} lần thử.` : 'Sai quá 5 lần — đã khóa 15 phút.');
  }
  await getStore().del([lock.key]);
  await audit(req, 'login', null);
  return json({ ok: true }, 200, { 'Set-Cookie': createSessionCookie(req) });
});

export const DELETE = handle(async (req) => {
  await revokeSession(req);
  return json({ ok: true }, 200, { 'Set-Cookie': clearSessionCookie() });
});
