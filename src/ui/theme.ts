import { useSyncExternalStore } from 'react';
import { lsGet, lsSet } from '../lib/db';

export type ThemePref = 'system' | 'light' | 'dark';
let pref: ThemePref = (lsGet('nps_theme') as ThemePref) || 'system';
const subs = new Set<() => void>();
const mq = typeof matchMedia !== 'undefined' ? matchMedia('(prefers-color-scheme: dark)') : null;

function apply() {
  const dark = pref === 'dark' || (pref === 'system' && !!mq?.matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.remove());
  const meta = document.createElement('meta');
  meta.name = 'theme-color';
  meta.content = dark ? '#000000' : '#f2f2f7';
  document.head.appendChild(meta);
  subs.forEach((s) => s());
}
mq?.addEventListener('change', apply);
apply();

export function setTheme(p: ThemePref) { pref = p; lsSet('nps_theme', p); apply(); }
export function useTheme() {
  return useSyncExternalStore((cb) => { subs.add(cb); return () => subs.delete(cb); }, () => pref);
}
export const isDark = () => document.documentElement.dataset.theme === 'dark';
