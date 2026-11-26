import { getStore } from './store.js';
import { dayKey, ipHash } from './http.js';

export const PREFIX = {
  stats: 'stats:d:',
  logs: 'log:d:',
  feedback: 'fb:d:',
  audit: 'audit:d:',
} as const;
export type DataType = keyof typeof PREFIX | 'luts';
export const DATA_TYPES: DataType[] = ['stats', 'logs', 'feedback', 'audit', 'luts'];

export async function audit(req: Request | null, action: string, detail: unknown = null) {
  const now = new Date();
  const field = `${now.getTime()}-${Math.random().toString(36).slice(2, 6)}`;
  await getStore().hset(`${PREFIX.audit}${dayKey(now)}`, field, JSON.stringify({ at: now.toISOString(), action, detail, who: req ? 'admin@' + ipHash(req).slice(0, 6) : 'cron' }));
}

export interface Retention { enabled: boolean; logsDays: number; statsMonths: number; auditMonths: number; feedbackDays: number }
export async function getRetention(): Promise<Retention> {
  const r = await getStore().get<Retention>('cfg:retention');
  return {
    enabled: r?.enabled ?? true,
    logsDays: r?.logsDays ?? Number(process.env.RETENTION_LOGS_DAYS || 30),
    statsMonths: r?.statsMonths ?? Number(process.env.RETENTION_STATS_MONTHS || 12),
    auditMonths: r?.auditMonths ?? 12,
    feedbackDays: r?.feedbackDays ?? 90,
  };
}

export const isDate = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
