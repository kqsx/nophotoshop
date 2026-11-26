import { useSyncExternalStore, type ReactNode } from 'react';
import { CircleCheck, CircleAlert, Info } from 'lucide-react';

type Kind = 'ok' | 'err' | 'info';
interface T { id: number; msg: ReactNode; kind: Kind; action?: { label: string; run: () => void } }
let list: T[] = [];
const subs = new Set<() => void>();
const emit = () => subs.forEach((s) => s());
let n = 0;

export function toast(msg: ReactNode, kind: Kind = 'ok', opts: { action?: T['action']; ms?: number } = {}) {
  const id = ++n;
  list = [...list, { id, msg, kind, action: opts.action }].slice(-3);
  emit();
  if (opts.ms !== 0) setTimeout(() => dismiss(id), opts.ms ?? (opts.action ? 9000 : 2800));
  return id;
}
export function dismiss(id: number) { list = list.filter((t) => t.id !== id); emit(); }

export function Toasts() {
  const items = useSyncExternalStore((cb) => { subs.add(cb); return () => subs.delete(cb); }, () => list);
  return (
    <div className="toasts" role="status" aria-live="polite">
      {items.map((t) => (
        <div key={t.id} className="toast glass">
          {t.kind === 'ok' ? <CircleCheck size={22} color="var(--green)" /> : t.kind === 'err' ? <CircleAlert size={22} color="var(--red)" /> : <Info size={22} color="var(--accent)" />}
          <span>{t.msg}</span>
          {t.action && (
            <button className="btn sm primary" onClick={() => { t.action!.run(); dismiss(t.id); }}>{t.action.label}</button>
          )}
        </div>
      ))}
    </div>
  );
}
