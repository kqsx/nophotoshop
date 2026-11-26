import { openDB, type IDBPDatabase } from 'idb';

/** Dữ liệu chỉ nằm trên máy người dùng: preset riêng, mẫu watermark, phiên đang sửa, cài đặt. */
let dbp: Promise<IDBPDatabase> | null = null;
function db() {
  dbp ??= openDB('nophotoshop', 1, {
    upgrade(d) {
      d.createObjectStore('kv');
      d.createObjectStore('presets', { keyPath: 'id' });
      d.createObjectStore('wmTemplates', { keyPath: 'id' });
      d.createObjectStore('session', { keyPath: 'id' });
    },
  });
  return dbp;
}

export async function kvGet<T>(key: string): Promise<T | undefined> {
  try { return (await (await db()).get('kv', key)) as T | undefined; } catch { return undefined; }
}
export async function kvSet(key: string, v: unknown) {
  try { await (await db()).put('kv', v, key); } catch { /* chế độ riêng tư */ }
}
export async function listAll<T>(store: 'presets' | 'wmTemplates' | 'session'): Promise<T[]> {
  try { return (await (await db()).getAll(store)) as T[]; } catch { return []; }
}
export async function putItem(store: 'presets' | 'wmTemplates' | 'session', v: unknown) {
  try { await (await db()).put(store, v); } catch { /* ignore */ }
}
export async function delItem(store: 'presets' | 'wmTemplates' | 'session', id: string) {
  try { await (await db()).delete(store, id); } catch { /* ignore */ }
}
export async function clearStore(store: 'presets' | 'wmTemplates' | 'session') {
  try { await (await db()).clear(store); } catch { /* ignore */ }
}

/** «Dọn bộ nhớ»: xóa toàn bộ dữ liệu cục bộ của app. */
export async function wipeAll() {
  try {
    const d = await db();
    d.close();
  } catch { /* ignore */ }
  dbp = null;
  await new Promise<void>((res) => {
    const r = indexedDB.deleteDatabase('nophotoshop');
    r.onsuccess = r.onerror = r.onblocked = () => res();
  });
  try { localStorage.clear(); } catch { /* ignore */ }
  if ('caches' in window) for (const k of await caches.keys()) if (k.includes('user')) await caches.delete(k);
}

export function lsGet(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}
export function lsSet(key: string, v: string) {
  try { localStorage.setItem(key, v); } catch { /* ignore */ }
}
