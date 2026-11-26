import { useEffect, useRef, useState } from 'react';
import { Type, Image as ImageIcon, Grid3x3, Signature, Lock, LockOpen, Copy, Trash2, ChevronUp, ChevronDown, Eye, EyeOff, Save, Bold, Italic } from 'lucide-react';
import { FONTS, GRID9, MAX_LAYERS, newLayer, posOf, useWm, wmSet, wmUpdate, type WmLayer, type WmPos } from './watermark';
import { Slider } from '../../ui/Slider';
import { Switch } from '../../ui/Modal';
import { toast } from '../../ui/toast';
import { listAll, putItem, delItem } from '../../lib/db';
import { getConfig } from '../../lib/config';

interface Template { id: string; name: string; layers: WmLayer[] }

const TYPE_LABEL: Record<WmLayer['type'], string> = { text: 'Chữ', logo: 'Logo', tile: 'Lát chống copy', signature: 'Chữ ký' };

export function WatermarkPanel({ portrait }: { portrait: boolean }) {
  const st = useWm((s) => s);
  const sel = st.layers.find((l) => l.id === st.selected) ?? null;
  const logoRef = useRef<HTMLInputElement>(null);
  const [tpls, setTpls] = useState<Template[]>([]);
  useEffect(() => { listAll<Template>('wmTemplates').then(setTpls); }, []);

  const add = (type: WmLayer['type']) => {
    if (st.layers.length >= MAX_LAYERS) return toast(`Tối đa ${MAX_LAYERS} watermark`, 'info');
    const l = newLayer(type, getConfig().author.replace(/^By\s+/i, '') || 'DucAnh');
    wmSet({ layers: [...st.layers, l], selected: l.id, preview: true });
    if (type === 'logo') setTimeout(() => logoRef.current?.click(), 50);
  };
  const move = (id: string, dir: -1 | 1) => {
    const arr = [...st.layers];
    const i = arr.findIndex((l) => l.id === id), j = i + dir;
    if (j < 0 || j >= arr.length) return;
    [arr[i], arr[j]] = [arr[j], arr[i]];
    wmSet({ layers: arr });
  };
  const usePortrait = portrait && st.portraitMode;
  const pos = sel ? (usePortrait && sel.portrait ? sel.portrait : posOf(sel, 1, 1)) : null;
  const setPos = (p: Partial<WmPos>) => {
    if (!sel) return;
    if (usePortrait) wmUpdate(sel.id, { portrait: { ...(sel.portrait ?? { x: sel.x, y: sel.y, size: sel.size, rotation: sel.rotation }), ...p } });
    else wmUpdate(sel.id, p);
  };
  const up = (p: Partial<WmLayer>) => sel && wmUpdate(sel.id, p);

  return (
    <div className="panel-body">
      <div className="tool-row">
        <button className="tool" onClick={() => add('text')}><Type size={24} strokeWidth={1.75} /><span>Chữ</span></button>
        <button className="tool" onClick={() => add('logo')}><ImageIcon size={24} strokeWidth={1.75} /><span>Logo</span></button>
        <button className="tool" onClick={() => add('tile')}><Grid3x3 size={24} strokeWidth={1.75} /><span>Lát kín</span></button>
        <button className="tool" onClick={() => add('signature')}><Signature size={24} strokeWidth={1.75} /><span>Chữ ký</span></button>
      </div>
      <input ref={logoRef} type="file" accept="image/png,image/svg+xml,image/webp" hidden onChange={async (e) => {
        const f = e.target.files?.[0]; e.target.value = '';
        if (!f || !sel) return;
        if (f.size > 3_000_000) return toast('Logo tối đa 3 MB', 'err');
        const url = await new Promise<string>((res) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.readAsDataURL(f); });
        up({ logo: url, type: 'logo' });
      }} />

      <div className="list">
        <div className="list-item">
          <div className="grow"><b>Luôn áp dụng khi xuất</b><div className="muted small">Không hỏi lại mỗi lần tải</div></div>
          <Switch label="Luôn áp dụng khi xuất" checked={st.alwaysApply} onChange={(v) => wmSet({ alwaysApply: v })} />
        </div>
        <div className="list-item">
          <div className="grow"><b>Vị trí riêng cho ảnh dọc</b><div className="muted small">{portrait ? 'Đang chỉnh vị trí cho ảnh dọc' : 'Áp dụng khi ảnh dọc'}</div></div>
          <Switch label="Vị trí riêng cho ảnh dọc" checked={st.portraitMode} onChange={(v) => wmSet({ portraitMode: v })} />
        </div>
      </div>

      {st.layers.length === 0 && <p className="muted">Thêm chữ hoặc logo để đóng dấu bản quyền. Watermark chỉ áp lên ảnh khi xuất, ảnh gốc không đổi.</p>}

      {st.layers.length > 0 && (
        <div className="list">
          {[...st.layers].reverse().map((l) => (
            <div key={l.id} className={'list-item layer' + (l.id === st.selected ? ' sel' : '')} onClick={() => wmSet({ selected: l.id })}>
              <span className="grow ellipsis"><b>{TYPE_LABEL[l.type]}</b> <span className="muted">{l.type === 'logo' ? (l.logo ? '' : '(chưa chọn ảnh)') : l.text}</span></span>
              <button className="icon-btn" aria-label="Ẩn/hiện" onClick={(e) => { e.stopPropagation(); wmUpdate(l.id, { visible: !l.visible }); }}>{l.visible ? <Eye size={20} /> : <EyeOff size={20} />}</button>
              <button className="icon-btn" aria-label="Lên lớp trên" onClick={(e) => { e.stopPropagation(); move(l.id, 1); }}><ChevronUp size={20} /></button>
              <button className="icon-btn" aria-label="Xuống lớp dưới" onClick={(e) => { e.stopPropagation(); move(l.id, -1); }}><ChevronDown size={20} /></button>
              <button className="icon-btn" aria-label="Khóa" onClick={(e) => { e.stopPropagation(); wmUpdate(l.id, { locked: !l.locked }); }}>{l.locked ? <Lock size={20} /> : <LockOpen size={20} />}</button>
              <button className="icon-btn" aria-label="Nhân đôi" onClick={(e) => {
                e.stopPropagation();
                if (st.layers.length >= MAX_LAYERS) return toast(`Tối đa ${MAX_LAYERS} watermark`, 'info');
                const c = { ...structuredClone(l), id: Math.random().toString(36).slice(2, 9), y: Math.max(0, l.y - 0.1) };
                wmSet({ layers: [...st.layers, c], selected: c.id });
              }}><Copy size={20} /></button>
              <button className="icon-btn" aria-label="Xóa" onClick={(e) => { e.stopPropagation(); const rest = st.layers.filter((x) => x.id !== l.id); wmSet({ layers: rest, selected: rest[rest.length - 1]?.id ?? null }); }}><Trash2 size={20} /></button>
            </div>
          ))}
        </div>
      )}

      {sel && pos && (
        <div className="glass card stack">
          {sel.type !== 'logo' && (
            <>
              <label className="field"><span>{sel.type === 'signature' ? 'Tên (ngày chụp tự điền từ EXIF)' : 'Nội dung'}</span>
                <input className="input" value={sel.text} maxLength={80} onChange={(e) => up({ text: e.target.value })} />
              </label>
              <div className="row wrap">
                <select className="input grow" value={sel.font} onChange={(e) => up({ font: e.target.value })} aria-label="Font chữ" style={{ fontFamily: sel.font }}>
                  {FONTS.filter((f) => !getConfig().wmFonts.length || getConfig().wmFonts.includes(f.family)).map((f) => <option key={f.family} value={f.family} style={{ fontFamily: f.family }}>{f.label}</option>)}
                </select>
                <button className={'icon-btn' + (sel.bold ? ' on' : '')} aria-label="Đậm" onClick={() => up({ bold: !sel.bold })}><Bold size={22} /></button>
                <button className={'icon-btn' + (sel.italic ? ' on' : '')} aria-label="Nghiêng" onClick={() => up({ italic: !sel.italic })}><Italic size={22} /></button>
                <input type="color" className="color" value={sel.color} onChange={(e) => up({ color: e.target.value })} aria-label="Màu chữ" />
              </div>
              <div className="row wrap small">
                <label className="row"><Switch label="Viền chữ" checked={sel.stroke} onChange={(v) => up({ stroke: v })} /> Viền</label>
                {sel.stroke && <input type="color" className="color" value={sel.strokeColor} onChange={(e) => up({ strokeColor: e.target.value })} aria-label="Màu viền" />}
                <label className="row"><Switch label="Bóng đổ" checked={sel.shadow} onChange={(v) => up({ shadow: v })} /> Bóng</label>
                <label className="row"><Switch label="Tự đổi màu theo nền" checked={sel.autoContrast} onChange={(v) => up({ autoContrast: v })} /> Tự đổi màu</label>
              </div>
              <Slider label="Khoảng cách chữ" value={sel.letterSpacing} min={-5} max={60} def={0} onChange={(v) => up({ letterSpacing: v })} />
            </>
          )}
          {sel.type === 'logo' && (
            <>
              <button className="btn block" onClick={() => logoRef.current?.click()}><ImageIcon size={20} /> {sel.logo ? 'Đổi logo' : 'Chọn logo (PNG/SVG/WebP)'}</button>
              <div className="seg">
                {(['none', 'white', 'black'] as const).map((t) => <button key={t} className={sel.tint === t ? 'on' : ''} onClick={() => up({ tint: t })}>{t === 'none' ? 'Màu gốc' : t === 'white' ? 'Trắng' : 'Đen'}</button>)}
              </div>
              <Slider label="Bo góc" value={sel.radius} min={0} max={50} def={0} unit="%" onChange={(v) => up({ radius: v })} />
              <label className="row small"><Switch label="Bóng đổ" checked={sel.shadow} onChange={(v) => up({ shadow: v })} /> Bóng đổ</label>
            </>
          )}
          <Slider label="Kích thước (% chiều rộng ảnh)" value={Math.round(pos.size)} min={3} max={100} def={18} unit="%" onChange={(v) => setPos({ size: v })} />
          <Slider label="Độ trong suốt" value={sel.opacity} min={5} max={100} def={60} unit="%" onChange={(v) => up({ opacity: v })} />
          <Slider label="Xoay" value={Math.round(pos.rotation)} min={-180} max={180} def={0} unit="°" onChange={(v) => setPos({ rotation: v })} />
          {sel.type === 'tile' ? (
            <>
              <Slider label="Khoảng cách lát" value={sel.tileGap} min={10} max={200} def={60} unit="%" onChange={(v) => up({ tileGap: v })} />
              <Slider label="Góc lát" value={sel.tileAngle} min={-90} max={90} def={-30} unit="°" onChange={(v) => up({ tileAngle: v })} />
            </>
          ) : (
            <>
              <Slider label="Khoảng cách lề" value={sel.margin} min={0} max={15} def={3} unit="%" onChange={(v) => up({ margin: v })} />
              <div className="field">
                <span>Vị trí nhanh (hoặc kéo trực tiếp trên ảnh, chụm 2 ngón để phóng/xoay)</span>
                <div className="grid9">
                  {GRID9.map(([x, y], i) => (
                    <button key={i} className={Math.abs(pos.x - x) < 0.02 && Math.abs(pos.y - y) < 0.02 ? 'on' : ''} onClick={() => setPos({ x, y })} aria-label={`Vị trí ${i + 1}`}><span /></button>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      )}

      <h3 className="sec">Mẫu đã lưu</h3>
      <div className="row wrap">
        <button className="btn sm" disabled={!st.layers.length} onClick={async () => {
          const name = prompt('Tên mẫu watermark:', 'Mẫu của tôi');
          if (!name) return;
          const t: Template = { id: Date.now().toString(36), name: name.slice(0, 30), layers: structuredClone(st.layers) };
          await putItem('wmTemplates', t);
          setTpls([...tpls, t]);
          toast('Đã lưu mẫu');
        }}><Save size={18} /> Lưu mẫu</button>
        {tpls.map((t) => (
          <span key={t.id} className="chip">
            <button className="chip-btn" onClick={() => wmSet({ layers: structuredClone(t.layers), selected: t.layers[0]?.id ?? null })}>{t.name}</button>
            <button className="chip-x" aria-label={`Xóa mẫu ${t.name}`} onClick={async () => { await delItem('wmTemplates', t.id); setTpls(tpls.filter((x) => x.id !== t.id)); }}>×</button>
          </span>
        ))}
      </div>
      <p className="muted small">Logo chỉ lưu trên máy bạn, không gửi lên server. Lưu ý: watermark giúp nhận diện tác giả nhưng không chặn được việc cắt bỏ — kiểu “Lát kín” khó xóa hơn.</p>
    </div>
  );
}
