import { useRef, useState } from 'react';
import { Pipette, Eraser, Save, FileDown, FileUp, Copy, RotateCcw, Trash2 } from 'lucide-react';
import { ParamSlider } from './QuickPanel';
import { CurveEditor } from './CurveEditor';
import { Slider } from '../../ui/Slider';
import { HSL_BANDS, HSL_COLORS, SCALAR_KEYS } from '../../engine/params';
import { applyRecipe, applyRecipeToAll, commit, edit, effectiveParams, getState, live, recipeOf, resetAll, setCustomPresets, type Doc } from './store';
import { toast } from '../../ui/toast';
import { putItem, delItem } from '../../lib/db';
import { download } from '../export/exporter';
import type { Preset } from '../../presets/presets';

const SECTIONS = ['Ánh sáng', 'Màu', 'HSL', 'Đường cong', 'Da', 'Chi tiết', 'Công thức'] as const;
type Sec = (typeof SECTIONS)[number];

export function AdvancedPanel({ doc, tapMode, setTapMode, healSize, setHealSize }: { doc: Doc; tapMode: 'heal' | 'wb' | null; setTapMode: (m: 'heal' | 'wb' | null) => void; healSize: number; setHealSize: (n: number) => void }) {
  const [sec, setSec] = useState<Sec>('Ánh sáng');
  const [band, setBand] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const S = (k: Parameters<typeof ParamSlider>[0]['k'], label: string, min?: number, fill?: string) => <ParamSlider doc={doc} k={k} label={label} min={min} fill={fill} />;
  const hsl = (arr: 'hslHue' | 'hslSat' | 'hslLum', label: string, grad?: string) => (
    <Slider
      label={label}
      value={doc.cur.manual[arr][band]}
      gradient={grad}
      onChange={(v) => live((e) => { const a = [...e.manual[arr]]; a[band] = v; return { ...e, manual: { ...e.manual, [arr]: a } }; })}
      onCommit={() => commit(`HSL ${HSL_BANDS[band]}`)}
    />
  );
  const saveCustom = async () => {
    const name = prompt('Tên preset của bạn:', 'Preset của tôi');
    if (!name) return;
    const eff = effectiveParams(doc);
    const delta: Record<string, unknown> = {};
    for (const k of SCALAR_KEYS) if (eff[k]) delta[k] = Math.round(eff[k]);
    delta.hslHue = eff.hslHue; delta.hslSat = eff.hslSat; delta.hslLum = eff.hslLum;
    const p: Preset = { id: 'my:' + Date.now().toString(36), name: name.slice(0, 30), group: 'Của tôi', icon: 'star', color: 'teal', strength: 100, when: [], desc: 'Preset riêng', delta, lut: eff.lut?.id, custom: true };
    await putItem('presets', p);
    setCustomPresets([...getState().customPresets, p]);
    toast('Đã lưu preset riêng');
  };
  return (
    <div className="panel-body">
      <div className="hscroll chips">
        {SECTIONS.map((s) => <button key={s} className={'chip' + (sec === s ? ' on' : '')} onClick={() => { setSec(s); setTapMode(null); }}>{s}</button>)}
      </div>
      <div className="glass card sliders">
        {sec === 'Ánh sáng' && (<>
          {S('exposure', 'Phơi sáng')}{S('contrast', 'Tương phản')}{S('highlights', 'Vùng sáng')}{S('shadows', 'Vùng tối')}
          {S('whites', 'Trắng')}{S('blacks', 'Đen')}{S('clarity', 'Độ rõ (Clarity)')}{S('dehaze', 'Khử mờ (Dehaze)')}
        </>)}
        {sec === 'Màu' && (<>
          <button className={'btn block' + (tapMode === 'wb' ? ' primary' : '')} onClick={() => setTapMode(tapMode === 'wb' ? null : 'wb')}>
            <Pipette size={14} strokeWidth={1.75} /> {tapMode === 'wb' ? 'Chạm vào vùng trắng/xám trên ảnh…' : 'Chấm cân bằng trắng'}
          </button>
          <ParamSlider doc={doc} k="temp" label="Nhiệt độ màu" gradient="linear-gradient(90deg,#4aa3ff,#e9e9ee 50%,#ffb340)" />
          <ParamSlider doc={doc} k="tint" label="Tint (lục ↔ hồng)" gradient="linear-gradient(90deg,#3ccf6a,#e9e9ee 50%,#e85bd8)" />
          {S('vibrance', 'Vibrance (màu thông minh)')}{S('saturation', 'Bão hòa')}
          {S('sky', 'Trời xanh mây trắng', 0, 'var(--green)')}{S('foliage', 'Cây xanh tươi', 0, 'var(--green)')}
        </>)}
        {sec === 'HSL' && (<>
          <div className="bands">
            {HSL_BANDS.map((b, i) => (
              <button key={b} className={'band' + (band === i ? ' on' : '')} style={{ background: HSL_COLORS[i] }} onClick={() => setBand(i)} aria-label={b} aria-pressed={band === i} />
            ))}
          </div>
          <p className="muted small" style={{ margin: '4px 0' }}>Dải màu: <b>{HSL_BANDS[band]}</b></p>
          {hsl('hslHue', 'Sắc độ (Hue)')}{hsl('hslSat', 'Bão hòa (Sat)')}{hsl('hslLum', 'Độ sáng (Lum)')}
        </>)}
        {sec === 'Đường cong' && <CurveEditor doc={doc} />}
        {sec === 'Da' && (<>
          {S('smooth', 'Mịn da', 0, 'var(--pink)')}{S('skinBright', 'Sáng da', 0, 'var(--pink)')}{S('skinPink', 'Hồng da', 0, 'var(--pink)')}
          {S('skinEven', 'Đều màu / giảm nám', 0, 'var(--pink)')}{S('acne', 'Xóa mụn tự động', 0, 'var(--pink)')}{S('darkCircle', 'Giảm quầng thâm', 0, 'var(--pink)')}
          <ParamSlider doc={doc} k="skinWarm" label="Tông da (lạnh ↔ ấm)" gradient="linear-gradient(90deg,#e7b9c8,#f2d2bd 50%,#f0b27a)" />
          <div className="divider" />
          <button className={'btn block' + (tapMode === 'heal' ? ' primary' : '')} onClick={() => setTapMode(tapMode === 'heal' ? null : 'heal')}>
            <Eraser size={14} strokeWidth={1.75} /> {tapMode === 'heal' ? 'Chạm vào mụn/vết trên ảnh để xóa' : 'Chạm để xóa mụn / vật nhỏ'}
          </button>
          {tapMode === 'heal' && <Slider label="Cỡ cọ" value={healSize} min={5} max={80} def={18} onChange={setHealSize} />}
          {doc.cur.manual.heal.length > 0 && (
            <button className="btn sm" onClick={() => edit('Xóa các điểm', (e) => ({ ...e, manual: { ...e.manual, heal: [] } }))}>
              <Trash2 size={14} /> Bỏ {doc.cur.manual.heal.length} điểm đã xóa
            </button>
          )}
        </>)}
        {sec === 'Chi tiết' && (<>
          {S('sharpen', 'Độ nét', 0)}{S('denoise', 'Khử nhiễu', 0)}{S('grain', 'Hạt phim', 0)}{S('vignette', 'Viền tối/sáng (Vignette)')}{S('fade', 'Phai màu (matte)', 0)}
        </>)}
        {sec === 'Công thức' && (
          <div className="stack">
            <p className="muted small">Công thức là cấu hình chỉnh ảnh (không chứa ảnh) — lưu lại, gửi bạn bè hoặc áp cho nhiều ảnh.</p>
            <button className="btn block" onClick={saveCustom}><Save size={14} /> Lưu thành preset riêng</button>
            <button className="btn block" onClick={() => { download(new Blob([JSON.stringify(recipeOf(doc), null, 1)], { type: 'application/json' }), 'cong-thuc.nophotoshop.json'); }}><FileDown size={14} /> Xuất file công thức</button>
            <button className="btn block" onClick={() => fileRef.current?.click()}><FileUp size={14} /> Mở file công thức</button>
            <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={async (e) => {
              const f = e.target.files?.[0]; e.target.value = '';
              if (!f) return;
              try { applyRecipe(JSON.parse(await f.text())); toast('Đã áp công thức'); } catch (er) { toast((er as Error).message, 'err'); }
            }} />
            {getState().docs.length > 1 && <button className="btn block" onClick={() => { applyRecipeToAll(); toast('Đã áp cho tất cả ảnh'); }}><Copy size={14} /> Áp cho tất cả {getState().docs.length} ảnh</button>}
            <CustomList />
            <button className="btn block danger" onClick={resetAll}><RotateCcw size={14} /> Đặt lại ảnh này</button>
          </div>
        )}
      </div>
    </div>
  );
}

function CustomList() {
  const list = getState().customPresets;
  if (!list.length) return null;
  return (
    <div className="list">
      {list.map((p) => (
        <div key={p.id} className="list-item">
          <span className="grow">{p.name}</span>
          <button className="icon-btn" aria-label={`Xóa ${p.name}`} onClick={async () => { await delItem('presets', p.id); setCustomPresets(getState().customPresets.filter((x) => x.id !== p.id)); }}><Trash2 size={14} /></button>
        </div>
      ))}
    </div>
  );
}
