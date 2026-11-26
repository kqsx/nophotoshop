import { createHash } from 'node:crypto';
import { getStore } from './store.js';

export function json(data: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers },
  });
}

export function error(status: number, message: string, extra: Record<string, unknown> = {}) {
  return json({ ok: false, error: message, ...extra }, status);
}

export function clientIp(req: Request): string {
  const xf = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || '0.0.0.0';
  return xf.split(',')[0].trim();
}

/** Băm IP để không bao giờ lưu IP thô. */
export function ipHash(req: Request): string {
  const salt = process.env.SESSION_SECRET || 'nps-dev-salt';
  return createHash('sha256').update(salt + '|' + clientIp(req)).digest('hex').slice(0, 20);
}

/** Giới hạn tần suất theo phút. Trả về true nếu được phép. */
export async function rateLimit(req: Request, bucket: string, perMinute: number): Promise<boolean> {
  const minute = Math.floor(Date.now() / 60000);
  const n = await getStore().incr(`rl:${bucket}:${ipHash(req)}:${minute}`, 70);
  return n <= perMinute;
}

export async function readJson<T>(req: Request, maxBytes = 2_500_000): Promise<T> {
  const len = Number(req.headers.get('content-length') || '0');
  if (len > maxBytes) throw new HttpError(413, 'Dữ liệu quá lớn');
  const text = await req.text();
  if (text.length > maxBytes) throw new HttpError(413, 'Dữ liệu quá lớn');
  try { return JSON.parse(text) as T; } catch { throw new HttpError(400, 'JSON không hợp lệ'); }
}

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export function handle(fn: (req: Request) => Promise<Response>) {
  return async (req: Request): Promise<Response> => {
    try {
      return await fn(req);
    } catch (e) {
      if (e instanceof HttpError) return error(e.status, e.message);
      console.error(e);
      return error(500, 'Lỗi máy chủ');
    }
  };
}

export const dayKey = (d: Date) => d.toISOString().slice(0, 10);
