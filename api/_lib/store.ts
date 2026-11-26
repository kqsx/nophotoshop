/**
 * Lớp lưu trữ nhỏ gọn cho dữ liệu server (KHÔNG bao giờ chứa ảnh người dùng).
 * - Có biến môi trường KV_REST_API_URL/KV_REST_API_TOKEN (Vercel KV) hoặc
 *   UPSTASH_REDIS_REST_URL/UPSTASH_REDIS_REST_TOKEN → dùng Redis qua REST.
 * - Không có → bộ nhớ trong tiến trình (khi chạy local còn ghi ra .data/store.json).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export interface Store {
  readonly kind: 'redis' | 'memory';
  get<T = unknown>(key: string): Promise<T | null>;
  set(key: string, value: unknown, ttlSec?: number): Promise<void>;
  del(keys: string[]): Promise<number>;
  keys(prefix: string): Promise<string[]>;
  hincrby(key: string, field: string, by: number): Promise<number>;
  hset(key: string, field: string, value: string): Promise<void>;
  hgetall(key: string): Promise<Record<string, string>>;
  hsetall(key: string, data: Record<string, string>): Promise<void>;
  incr(key: string, ttlSec: number): Promise<number>;
  ttl(key: string): Promise<number>;
  hgetallMany(keys: string[]): Promise<Record<string, string>[]>;
  size(key: string): Promise<number>;
}

const REDIS_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || '';
const REDIS_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || '';

class RedisStore implements Store {
  readonly kind = 'redis' as const;
  private async cmd<T = unknown>(...args: (string | number)[]): Promise<T> {
    const r = await fetch(REDIS_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${REDIS_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(args.map(String)),
    });
    const j = (await r.json()) as { result?: T; error?: string };
    if (!r.ok || j.error) throw new Error(`KV error: ${j.error || r.status}`);
    return j.result as T;
  }
  async get<T>(key: string) {
    const v = await this.cmd<string | null>('GET', key);
    if (v == null) return null;
    try { return JSON.parse(v) as T; } catch { return v as unknown as T; }
  }
  async set(key: string, value: unknown, ttlSec?: number) {
    const v = typeof value === 'string' ? value : JSON.stringify(value);
    if (ttlSec) await this.cmd('SET', key, v, 'EX', ttlSec);
    else await this.cmd('SET', key, v);
  }
  async del(keys: string[]) {
    if (!keys.length) return 0;
    return this.cmd<number>('DEL', ...keys);
  }
  async keys(prefix: string) {
    const out: string[] = [];
    let cursor = '0';
    do {
      const [next, batch] = await this.cmd<[string, string[]]>('SCAN', cursor, 'MATCH', `${prefix}*`, 'COUNT', 500);
      cursor = next;
      out.push(...batch);
    } while (cursor !== '0');
    return out.sort();
  }
  hincrby(key: string, field: string, by: number) { return this.cmd<number>('HINCRBY', key, field, by); }
  async hset(key: string, field: string, value: string) { await this.cmd('HSET', key, field, value); }
  async hgetall(key: string) {
    const arr = (await this.cmd<string[]>('HGETALL', key)) || [];
    const o: Record<string, string> = {};
    for (let i = 0; i < arr.length; i += 2) o[arr[i]] = arr[i + 1];
    return o;
  }
  async hsetall(key: string, data: Record<string, string>) {
    const flat = Object.entries(data).flat();
    if (flat.length) await this.cmd('HSET', key, ...flat);
  }
  async incr(key: string, ttlSec: number) {
    const n = await this.cmd<number>('INCR', key);
    if (n === 1) await this.cmd('EXPIRE', key, ttlSec);
    return n;
  }
  ttl(key: string) { return this.cmd<number>('TTL', key); }
  private async pipeline<T>(cmds: (string | number)[][]): Promise<T[]> {
    const out: T[] = [];
    for (let i = 0; i < cmds.length; i += 200) {
      const r = await fetch(REDIS_URL.replace(/\/$/, '') + '/pipeline', {
        method: 'POST',
        headers: { Authorization: `Bearer ${REDIS_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(cmds.slice(i, i + 200).map((c) => c.map(String))),
      });
      const j = (await r.json()) as { result?: T; error?: string }[];
      if (!r.ok) throw new Error('KV pipeline error');
      for (const x of j) out.push(x.result as T);
    }
    return out;
  }
  async hgetallMany(keys: string[]) {
    const res = await this.pipeline<string[]>(keys.map((k) => ['HGETALL', k]));
    return res.map((arr) => {
      const o: Record<string, string> = {};
      for (let i = 0; i < (arr?.length ?? 0); i += 2) o[arr[i]] = arr[i + 1];
      return o;
    });
  }
  async size(key: string) {
    const type = await this.cmd<string>('TYPE', key);
    if (type === 'string') return this.cmd<number>('STRLEN', key);
    if (type === 'hash') {
      const h = await this.hgetall(key);
      return Object.entries(h).reduce((a, [k, v]) => a + k.length + v.length, 0);
    }
    return 0;
  }
}

type Entry = { v: unknown; exp?: number };

class MemoryStore implements Store {
  readonly kind = 'memory' as const;
  private map = new Map<string, Entry>();
  private file: string | null = null;
  constructor() {
    if (!process.env.VERCEL) {
      const dir = join(process.cwd(), '.data');
      this.file = join(dir, 'store.json');
      try {
        if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
        if (existsSync(this.file)) {
          const raw = JSON.parse(readFileSync(this.file, 'utf8')) as Record<string, Entry>;
          for (const [k, e] of Object.entries(raw)) this.map.set(k, e);
        }
      } catch { /* bỏ qua file hỏng */ }
    }
  }
  private save() {
    if (!this.file) return;
    try { writeFileSync(this.file, JSON.stringify(Object.fromEntries(this.map))); } catch { /* ignore */ }
  }
  private live(key: string): Entry | undefined {
    const e = this.map.get(key);
    if (e && e.exp && e.exp < Date.now()) { this.map.delete(key); return undefined; }
    return e;
  }
  async get<T>(key: string) { const e = this.live(key); return e ? (structuredClone(e.v) as T) : null; }
  async set(key: string, value: unknown, ttlSec?: number) {
    this.map.set(key, { v: structuredClone(value), exp: ttlSec ? Date.now() + ttlSec * 1000 : undefined });
    this.save();
  }
  async del(keys: string[]) {
    let n = 0;
    for (const k of keys) if (this.map.delete(k)) n++;
    this.save();
    return n;
  }
  async keys(prefix: string) { return [...this.map.keys()].filter((k) => k.startsWith(prefix) && this.live(k)).sort(); }
  private hash(key: string) {
    let e = this.live(key);
    if (!e || typeof e.v !== 'object' || e.v === null) { e = { v: {} }; this.map.set(key, e); }
    return e.v as Record<string, string>;
  }
  async hincrby(key: string, field: string, by: number) {
    const h = this.hash(key);
    const n = (parseInt(h[field] || '0', 10) || 0) + by;
    h[field] = String(n);
    this.save();
    return n;
  }
  async hset(key: string, field: string, value: string) { this.hash(key)[field] = value; this.save(); }
  async hgetall(key: string) { const e = this.live(key); return e ? { ...(e.v as Record<string, string>) } : {}; }
  async hsetall(key: string, data: Record<string, string>) { Object.assign(this.hash(key), data); this.save(); }
  async incr(key: string, ttlSec: number) {
    const e = this.live(key);
    const n = (typeof e?.v === 'number' ? e.v : 0) + 1;
    this.map.set(key, { v: n, exp: e?.exp ?? Date.now() + ttlSec * 1000 });
    return n;
  }
  async ttl(key: string) { const e = this.live(key); return e?.exp ? Math.ceil((e.exp - Date.now()) / 1000) : -1; }
  async hgetallMany(keys: string[]) { return Promise.all(keys.map((k) => this.hgetall(k))); }
  async size(key: string) { const e = this.live(key); return e ? JSON.stringify(e.v).length : 0; }
}

const g = globalThis as unknown as { __npsStore?: Store };
export function getStore(): Store {
  if (!g.__npsStore) g.__npsStore = REDIS_URL && REDIS_TOKEN ? new RedisStore() : new MemoryStore();
  return g.__npsStore;
}
