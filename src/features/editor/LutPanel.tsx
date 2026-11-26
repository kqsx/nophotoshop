import { useMemo, useState } from 'react';
import { CircleOff } from 'lucide-react';
import { useLuts } from './QuickPanel';
import { LutCard, PresetCard } from './PresetCard';
import { allPresets, commit, live, setLut, togglePreset, type Doc } from './store';
import { Slider } from '../../ui/Slider';

export function LutPanel({ doc }: { doc: Doc }) {
  const luts = useLuts();
  const xmp = allPresets().filter((p) => p.id.startsWith('xmp:'));
  const groups = useMemo(() => ['Tất cả', ...new Set(luts.map((l) => l.group || 'Khác'))], [luts]);
  const [g, setG] = useState('Tất cả');
  const shown = luts.filter((l) => g === 'Tất cả' || (l.group || 'Khác') === g);
  const cur = doc.cur.manual.lut;
  return (
    <div className="panel-body">
      <div className="hscroll chips">
        {groups.map((x) => <button key={x} className={'chip' + (g === x ? ' on' : '')} onClick={() => setG(x)}>{x}</button>)}
      </div>
      {cur && (
        <div className="glass card">
          <Slider label="Cường độ LUT" value={cur.amount} min={0} max={100} def={100} unit="%" onChange={(v) => live((e) => ({ ...e, manual: { ...e.manual, lut: e.manual.lut && { ...e.manual.lut, amount: v } } }))} onCommit={() => commit('Cường độ LUT')} />
        </div>
      )}
      <div className="pgrid">
        <button className={'pcard compact' + (!cur ? ' on' : '')} onClick={() => setLut(null)}>
          <span className="pthumb none"><CircleOff size={20} strokeWidth={1.5} /></span>
          <span className="pname">Không LUT</span>
        </button>
        {shown.map((l) => <LutCard key={l.id} doc={doc} l={l} active={cur?.id === l.id} onClick={() => setLut(cur?.id === l.id ? null : l.id)} />)}
      </div>
      {xmp.length > 0 && (
        <>
          <h3 className="sec">Preset Lightroom</h3>
          <div className="pgrid">
            {xmp.map((p) => <PresetCard key={p.id} doc={doc} p={p} compact active={doc.cur.presets.some((l) => l.id === p.id)} onClick={() => togglePreset(p.id)} />)}
          </div>
        </>
      )}
      {!luts.length && <p className="muted">Đang tải thư viện LUT…</p>}
      <p className="muted small">Thumbnail được vẽ bằng chính ảnh của bạn. LUT do admin tải lên sẽ tự xuất hiện tại đây.</p>
    </div>
  );
}
