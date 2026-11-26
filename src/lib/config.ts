import { useSyncExternalStore } from 'react';

/** Cấu hình app — admin chỉnh được qua /admin (lưu trên server, rất nhỏ). */
export interface AppConfig {
  appName: string;
  author: string;
  phone: string;
  footer: string;
  accent: string;
  disabledPresets: string[];
  featuredPresets: string[];
  wmFonts: string[];
}
export const DEFAULT_CONFIG: AppConfig = {
  appName: 'NoPhotoShop',
  author: 'By DucAnh',
  phone: '0904817613',
  footer: '',
  accent: '#0a84ff',
  disabledPresets: [],
  featuredPresets: [],
  wmFonts: [],
};
let cfg: AppConfig = DEFAULT_CONFIG;
const subs = new Set<() => void>();

export async function loadConfig() {
  try {
    const r = await fetch('/api/admin/config');
    if (r.ok) {
      const j = (await r.json()) as { config: Partial<AppConfig> };
      cfg = { ...DEFAULT_CONFIG, ...j.config };
      if (cfg.accent && /^#[0-9a-f]{6}$/i.test(cfg.accent)) document.documentElement.style.setProperty('--accent', cfg.accent);
      subs.forEach((s) => s());
    }
  } catch { /* offline: dùng mặc định */ }
}
export const getConfig = () => cfg;
export function useConfig() {
  return useSyncExternalStore((cb) => { subs.add(cb); return () => subs.delete(cb); }, () => cfg);
}
