import { useEffect, useMemo, useState } from 'react';
import { SlidersHorizontal, ChevronRight, Sun, Thermometer, Sparkles, Heart, Smile } from 'lucide-react';
import { Slider } from '../../ui/Slider';
import { PRESETS, QUICK_ORDER, suggest } from '../../presets/presets';
import { allPresets, commit, findPreset, live, setLut, setPresetStrength, setTab, togglePreset, type Doc } from './store';
import { PresetCard, LutCard, ActiveChip } from './PresetCard';
import { loadCatalog, type LutItem } from '../../engine/lutStore';
import { useConfig } from '../../lib/config';
import type { ScalarKey } from '../../engine/params';

export function useLuts() {
  const [luts, setLuts] = useState<LutItem[]>([]);
  useEffect(() => { loadCatalog().then((l) => setLuts(l.filter((x) => x.kind === 'cube'))); }, []);
  return luts;
}

export function ParamSlider({ doc, k, label, min, max, fill, gradient }: { doc: Doc; k: ScalarKey; label: React.ReactNode; min?: number; max?: number; fill?: string; gradient?: string }) {
  return (
    <Slider
      label={label}
      value={doc.cur.manual[k]}
      min={min}
      max={max}
      fill={fill}
      gradient={gradient}
      onChange={(v) => live((e) => ({ ...e, manual: { ...e.manual, [k]: v } }))}
      onCommit={() => commit(typeof label === 'string' ? label : k)}
    />
  );
}

export function QuickPanel({ doc }: { doc: Doc }) {
  const cfg = useConfig();
  const luts = useLuts();
  const [sel, setSel] = useState<string | null>(null);
  const list = useMemo(() => {
    const all = allPresets().filter((p) => !cfg.disabledPresets.includes(p.id));
    const order = [...cfg.featuredPresets, ...QUICK_ORDER];
    return all.sort((a, b) => {
      const ia = order.indexOf(a.id), ib = order.indexOf(b.id);
      return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib);
    });
  }, [cfg, doc.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const sugg = useMemo(() => suggest(doc.analysis, PRESETS.filter((p) => !cfg.disabledPresets.includes(p.id))), [doc.analysis, cfg]);
  const active = doc.cur.presets;
  const selLayer = active.find((l) => l.id === sel) ?? active[active.length - 1];
  const selPreset = selLayer ? findPreset(selLayer.id) : null;
  const a = doc.analysis;
  const tags = a ? [a.orientation === 'doc' ? 'Ảnh dọc' : a.orientation === 'ngang' ? 'Ảnh ngang' : 'Ảnh vuông', a.ratio, a.hasPerson && 'Có người', a.hasSky && 'Có trời', a.hasGreen && 'Cây xanh', a.isBacklit && 'Ngược sáng', a.isNight && 'Ban đêm', a.isDark && !a.isNight && 'Hơi tối'].filter(Boolean) : [];

  return (
    <div className="panel-body">
      {tags.length > 0 && <div className="tags">{tags.map((t) => <span key={String(t)} className="tag">{t}</span>)}</div>}

      {sugg.length > 0 && (
        <>
          <h3 className="sec">Gợi ý cho ảnh này</h3>
          <div className="hscroll">
            {sugg.map((p) => <PresetCard key={p.id} doc={doc} p={p} active={active.some((l) => l.id === p.id)} onClick={() => { togglePreset(p.id); setSel(p.id); }} />)}
          </div>
        </>
      )}

      {active.length > 0 && (
        <div className="active-box glass">
          <div className="row wrap" style={{ gap: 8 }}>
            <span className="muted small">Đang áp dụng:</span>
            {active.map((l) => (
              <ActiveChip key={l.id} name={findPreset(l.id)?.name ?? l.id} on={selLayer?.id === l.id} onSelect={() => setSel(l.id)} onRemove={() => togglePreset(l.id)} />
            ))}
          </div>
          {selLayer && selPreset && (
            <Slider label={<>Cường độ <b>{selPreset.name}</b></>} value={selLayer.strength} min={0} max={100} def={selPreset.strength} unit="%" onChange={(v) => setPresetStrength(selLayer.id, v)} onCommit={() => commit(`Cường độ ${selPreset.name}`)} />
          )}
        </div>
      )}

      <h3 className="sec">Chỉnh 1 chạm</h3>
      <div className="pgrid">
        {list.map((p) => <PresetCard key={p.id} doc={doc} p={p} active={active.some((l) => l.id === p.id)} onClick={() => { togglePreset(p.id); setSel(p.id); }} />)}
      </div>

      {luts.length > 0 && (
        <>
          <div className="row between">
            <h3 className="sec">Bộ màu LUT</h3>
            <button className="btn sm ghost" onClick={() => setTab('lut')}>Tất cả <ChevronRight size={14} /></button>
          </div>
          <div className="hscroll">
            {luts.slice(0, 10).map((l) => (
              <LutCard key={l.id} doc={doc} l={l} active={doc.cur.manual.lut?.id === l.id} onClick={() => setLut(doc.cur.manual.lut?.id === l.id ? null : l.id)} />
            ))}
          </div>
          {doc.cur.manual.lut && (
            <Slider label="Cường độ LUT" value={doc.cur.manual.lut.amount} min={0} max={100} def={100} unit="%" onChange={(v) => live((e) => ({ ...e, manual: { ...e.manual, lut: e.manual.lut && { ...e.manual.lut, amount: v } } }))} onCommit={() => commit('Cường độ LUT')} />
          )}
        </>
      )}

      <h3 className="sec">Tinh chỉnh nhanh</h3>
      <div className="glass card sliders">
        <ParamSlider doc={doc} k="exposure" label={<><Sun size={14} strokeWidth={1.75} /> Độ sáng</>} />
        <ParamSlider doc={doc} k="temp" label={<><Thermometer size={14} strokeWidth={1.75} /> Tông màu (lạnh ↔ ấm)</>} gradient="linear-gradient(90deg,#4aa3ff,#e9e9ee 50%,#ffb340)" />
        <ParamSlider doc={doc} k="smooth" label={<><Sparkles size={14} strokeWidth={1.75} /> Mịn da</>} min={0} fill="var(--pink)" />
        <ParamSlider doc={doc} k="skinBright" label={<><Smile size={14} strokeWidth={1.75} /> Sáng da</>} min={0} fill="var(--pink)" />
        <ParamSlider doc={doc} k="skinPink" label={<><Heart size={14} strokeWidth={1.75} /> Hồng da</>} min={0} fill="var(--pink)" />
      </div>

      <button className="btn lg block adv-btn" onClick={() => setTab('advanced')}>
        <SlidersHorizontal size={16} strokeWidth={1.75} /> Nâng cao <span className="muted small">HSL · Curves · Da chi tiết · Hiệu ứng</span>
      </button>
    </div>
  );
}
