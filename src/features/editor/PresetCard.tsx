import { X } from 'lucide-react';
import { PresetIcon } from '../../ui/icons';
import type { Preset } from '../../presets/presets';
import { effectiveParams, type Doc } from './store';
import { useThumb } from './runtime';
import type { LutItem } from '../../engine/lutStore';

export function PresetCard({ doc, p, active, onClick, compact }: { doc: Doc; p: Preset; active: boolean; onClick: () => void; compact?: boolean }) {
  const url = useThumb(doc, 'p:' + p.id, () => effectiveParams(doc, { ...doc.cur, presets: [{ id: p.id, strength: p.strength }] }));
  return (
    <button className={'pcard' + (active ? ' on' : '') + (compact ? ' compact' : '')} onClick={onClick} aria-pressed={active} title={p.desc}>
      <span className="pthumb">
        {url ? <img src={url} alt="" /> : <span className="shimmer" />}
        <span className={`sq ${p.color}`} style={{ width: 30, height: 30 }}><PresetIcon name={p.icon} size={18} /></span>
        {active && <span className="pcheck" aria-hidden>✓</span>}
      </span>
      <span className="pname">{p.name}</span>
    </button>
  );
}

export function LutCard({ doc, l, active, onClick }: { doc: Doc; l: LutItem; active: boolean; onClick: () => void }) {
  const url = useThumb(doc, 'l:' + l.id, () => {
    const base = { ...doc.cur, manual: { ...doc.cur.manual, lut: { id: l.id, amount: 100 } } };
    return effectiveParams(doc, base);
  });
  return (
    <button className={'pcard compact' + (active ? ' on' : '')} onClick={onClick} aria-pressed={active}>
      <span className="pthumb">
        {url ? <img src={url} alt="" /> : <span className="shimmer" />}
        {active && <span className="pcheck" aria-hidden>✓</span>}
      </span>
      <span className="pname">{l.name}</span>
    </button>
  );
}

export function ActiveChip({ name, on, onSelect, onRemove }: { name: string; on: boolean; onSelect: () => void; onRemove: () => void }) {
  return (
    <span className={'chip' + (on ? ' on' : '')}>
      <button className="chip-btn" onClick={onSelect}>{name}</button>
      <button className="chip-x" onClick={onRemove} aria-label={`Bỏ ${name}`}><X size={16} strokeWidth={2} /></button>
    </span>
  );
}
