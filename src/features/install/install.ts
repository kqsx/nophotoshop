import { useSyncExternalStore } from 'react';
import { lsGet, lsSet } from '../../lib/db';
import { track } from '../../lib/stats';

interface BIPEvent extends Event { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> }

let deferred: BIPEvent | null = null;
const subs = new Set<() => void>();
const emit = () => subs.forEach((s) => s());

addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferred = e as BIPEvent;
  emit();
});
addEventListener('appinstalled', () => { deferred = null; track('install'); emit(); });

export const isStandalone = () =>
  matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;

export function platform() {
  const ua = navigator.userAgent;
  const ios = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const inApp = /FBAN|FBAV|FB_IAB|Instagram|Zalo|Line\/|TikTok|Messenger/i.test(ua);
  const iosSafari = ios && /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS|GSA/.test(ua) && !inApp;
  return { ios, iosSafari, inApp, android: /Android/.test(ua) };
}

export function useInstall() {
  return useSyncExternalStore((cb) => { subs.add(cb); return () => subs.delete(cb); }, () => deferred);
}

export async function promptInstall(): Promise<boolean> {
  if (!deferred) return false;
  await deferred.prompt();
  const r = await deferred.userChoice;
  deferred = null;
  emit();
  return r.outcome === 'accepted';
}

const SNOOZE_KEY = 'nps_install_snooze';
export function snoozed() {
  const t = Number(lsGet(SNOOZE_KEY) || 0);
  return Date.now() - t < 14 * 86400_000;
}
export function snooze() { lsSet(SNOOZE_KEY, String(Date.now())); emit(); }
