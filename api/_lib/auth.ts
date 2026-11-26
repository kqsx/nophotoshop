import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { getStore } from './store.js';
import { HttpError, ipHash } from './http.js';

const COOKIE = 'nps_admin';
const SESSION_HOURS = 12;
const MAX_FAILS = 5;
const LOCK_SECONDS = 15 * 60;


let fallbackSecret: string | null = null;
/**
 * Khóa ký cookie: ưu tiên SESSION_SECRET; nếu chưa đặt thì dùng khóa dẫn xuất từ token KV
 * (bí mật, ổn định giữa các lần chạy); nếu không có cả hai thì sinh ngẫu nhiên theo phiên máy chủ
 * (vẫn đăng nhập được, chỉ bị đăng xuất khi máy chủ khởi động lại).
 */
function secret(): string {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  const kv = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (kv) return createHmac('sha256', 'nps-session').update(kv).digest('hex');
  fallbackSecret ??= randomBytes(32).toString('hex');
  return fallbackSecret;
}

/** Mật khẩu admin mặc định (chỉ lưu dạng băm bcrypt). Đặt ADMIN_PASSWORD_HASH trên Vercel để đổi. */
const DEFAULT_HASH = '$2b$12$hY321ew8TFp8hOIl3IdPi.Pat6ncSCjt31Ci/4mGKK.6fUxJEWERG';
function passwordHash(): string {
  return process.env.ADMIN_PASSWORD_HASH || DEFAULT_HASH;
}

const b64u = (b: Buffer | string) => Buffer.from(b).toString('base64url');
const sign = (payload: string) => createHmac('sha256', secret()).update(payload).digest('base64url');

export function createSessionCookie(req: Request): string {
  const payload = b64u(JSON.stringify({ exp: Date.now() + SESSION_HOURS * 3600_000, n: randomBytes(8).toString('hex') }));
  const token = `${payload}.${sign(payload)}`;
  const secure = new URL(req.url).protocol === 'https:' ? '; Secure' : '';
  return `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_HOURS * 3600}${secure}`;
}

export function clearSessionCookie(): string {
  return `${COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`;
}

function readCookie(req: Request): string | null {
  const c = req.headers.get('cookie') || '';
  const m = c.split(/;\s*/).find((p) => p.startsWith(COOKIE + '='));
  return m ? m.slice(COOKIE.length + 1) : null;
}

export async function getSession(req: Request): Promise<{ n: string; exp: number } | null> {
  const tok = readCookie(req);
  if (!tok) return null;
  const [payload, sig] = tok.split('.');
  if (!payload || !sig) return null;
  const expected = Buffer.from(sign(payload));
  const got = Buffer.from(sig);
  if (expected.length !== got.length || !timingSafeEqual(expected, got)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString()) as { n: string; exp: number };
    if (data.exp < Date.now()) return null;
    if (await getStore().get(`revoked:${data.n}`)) return null;
    return data;
  } catch { return null; }
}

export async function revokeSession(req: Request) {
  const s = await getSession(req);
  if (s) await getStore().set(`revoked:${s.n}`, 1, Math.ceil((s.exp - Date.now()) / 1000) + 60);
}

/** Bắt buộc phiên admin + header chống CSRF cho thao tác ghi. */
export async function requireAdmin(req: Request) {
  const s = await getSession(req);
  if (!s) throw new HttpError(401, 'Cần đăng nhập admin');
  if (req.method !== 'GET' && req.headers.get('x-nps') !== '1') throw new HttpError(403, 'Thiếu header bảo vệ');
  return s;
}

export async function lockStatus(req: Request) {
  const store = getStore();
  const key = `lock:${ipHash(req)}`;
  const fails = (await store.get<number>(key)) || 0;
  const ttl = fails >= MAX_FAILS ? await store.ttl(key) : 0;
  return { key, fails, locked: fails >= MAX_FAILS, retryAfter: Math.max(ttl, 0) };
}

export async function verifyPassword(password: string): Promise<boolean> {
  if (typeof password !== 'string' || password.length > 200) return false;
  return bcrypt.compare(password, passwordHash());
}

export async function registerFail(key: string, fails: number) {
  await getStore().set(key, fails + 1, LOCK_SECONDS);
}

export function totpEnabled() { return !!process.env.ADMIN_TOTP_SECRET; }

function base32Decode(s: string): Buffer {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const ch of s.replace(/=+$/, '').toUpperCase().replace(/\s/g, '')) {
    const v = alphabet.indexOf(ch);
    if (v < 0) continue;
    bits += v.toString(2).padStart(5, '0');
  }
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}

export function verifyTotp(code: string): boolean {
  const sec = process.env.ADMIN_TOTP_SECRET;
  if (!sec) return true;
  if (!/^\d{6}$/.test(code || '')) return false;
  const key = base32Decode(sec);
  const step = Math.floor(Date.now() / 30000);
  for (const off of [-1, 0, 1]) {
    const buf = Buffer.alloc(8);
    buf.writeBigUInt64BE(BigInt(step + off));
    const h = createHmac('sha1', key).update(buf).digest();
    const o = h[h.length - 1] & 0xf;
    const num = ((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000).toString().padStart(6, '0');
    if (num === code) return true;
  }
  return false;
}
