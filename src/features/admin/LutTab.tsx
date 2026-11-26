import { useEffect, useRef, useState } from 'react';
import { Upload, Trash2, Eye, EyeOff, ChevronUp, ChevronDown, CircleCheck, CircleAlert, FileUp } from 'lucide-react';
import { api, fmtBytes } from './api';
import { toast } from '../../ui/toast';
import { CUBE_MAX_BYTES, parseCube, resizeCube, sampleCube, serializeCube, type CubeLut } from '../../engine/cube';
import { parseXmp } from '../../engine/xmp';
import { SAMPLES } from '../home/samples';
import type { PresetDelta } from '../../engine/params';

interface Meta { id: string; name: string; group: string; collection: string; kind: 'cube' | 'xmp'; order: number; enabled: boolean; size: number; bytes: number; createdAt: string }
interface Pending { key: string; file: string; name: string; group: string; collection: string; kind: 'cube' | 'xmp'; ok: boolean; msg: string; cube?: CubeLut; delta?: PresetDelta; preview?: string; status?: 'up' | 'done' | 'err' }

const GROUPS = ['Phim', 'Điện ảnh', 'Trời', 'Da', 'Ban đêm', 'Màu nổi', 'Đen trắng', 'Khác'];

let sampleCache: ImageData | null = null;
function sampleImage(): ImageData {
  if (sampleCache) return sampleCache;
  const s = SAMPLES[0];
  const c = document.createElement('canvas');
  c.width = s.w; c.height = s.h;
  s.draw(c.getContext('2d')!, s.w, s.h);
  const t = document.createElement('canvas');
  t.width = 150; t.height = 100;
  const k = t.getContext('2d', { willReadFrequently: true })!;
  k.drawImage(c, 0, 0, 150, 100);
  sampleCache = k.getImageData(0, 0, 150, 100);
  return sampleCache;
}

/** Ảnh xem trước nhỏ: áp LUT lên ảnh mẫu bằng CPU. */
function previewLut(l: CubeLut): string {
  const src = sampleImage();
  const out = new ImageData(src.width, src.height);
  for (let i = 0; i < src.data.length; i += 4) {
    const [r, g, b] = sampleCube(l, src.data[i] / 255, src.data[i + 1] / 255, src.data[i + 2] / 255);
    out.data[i] = r * 255; out.data[i + 1] = g * 255; out.data[i + 2] = b * 255; out.data[i + 3] = 255;
  }
  const c = document.createElement('canvas');
  c.width = src.width; c.height = src.height;
  c.getContext('2d')!.putImageData(out, 0, 0);
  return c.toDataURL('image/jpeg', 0.8);
}

async function inspect(f: File, shrink: boolean): Promise<Pending> {
  const base = { key: f.name + f.size + Math.random(), file: f.name, name: f.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').slice(0, 60), group: 'Khác', collection: '' };
  const ext = f.name.toLowerCase().split('.').pop();
  if (ext !== 'cube' && ext !== 'xmp') return { ...base, kind: 'cube', ok: false, msg: 'Sai định dạng: chỉ nhận .cube (LUT 3D) hoặc .xmp (preset Lightroom)' };
  if (f.size > CUBE_MAX_BYTES) return { ...base, kind: 'cube', ok: false, msg: `File quá lớn (${fmtBytes(f.size)}), tối đa 8 MB` };
  const text = await f.text();
  if (ext === 'xmp') {
    try {
      const x = parseXmp(text);
      const delta = { ...x.delta, ...(x.curve ? { curve: x.curve } : {}) };
      return { ...base, name: x.name || base.name, kind: 'xmp', ok: true, msg: `Preset Lightroom · ${Object.keys(delta).length} thông số`, delta };
    } catch (e) {
      return { ...base, kind: 'xmp', ok: false, msg: (e as Error).message };
    }
  }
  try {
    let cube = parseCube(text);
    let msg = `LUT ${cube.size}³ hợp lệ`;
    if (shrink && cube.size > 33) { cube = resizeCube(cube, 33); msg += ' → đã nén về 33³'; }
    if (cube.title) base.name = cube.title.slice(0, 60);
    return { ...base, kind: 'cube', ok: true, msg, cube, preview: previewLut(cube) };
  } catch (e) {
    return { ...base, kind: 'cube', ok: false, msg: (e as Error).message };
  }
}

export function LutTab() {
  const [list, setList] = useState<Meta[]>([]);
  const [pending, setPending] = useState<Pending[]>([]);
  const [shrink, setShrink] = useState(true);
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const load = () => api<{ luts: Meta[] }>('/api/luts?all=1').then((j) => setList(j.luts)).catch((e) => toast(e.message, 'err'));
  useEffect(() => { load(); }, []);

  const addFiles = async (files: FileList | File[]) => {
    const arr = [...files].slice(0, 50);
    const res: Pending[] = [];
    for (const f of arr) res.push(await inspect(f, shrink));
    setPending((p) => [...p, ...res]);
    const bad = res.filter((r) => !r.ok).length;
    if (bad) toast(`${bad} file không hợp lệ — xem lý do bên dưới`, 'err');
  };
  const uploadAll = async () => {
    setBusy(true);
    let ok = 0;
    for (const p of pending) {
      if (!p.ok || p.status === 'done') continue;
      setPending((x) => x.map((y) => (y.key === p.key ? { ...y, status: 'up' } : y)));
      try {
        await api('/api/luts', { method: 'POST', body: { name: p.name, group: p.group, collection: p.collection, kind: p.kind, data: p.cube ? serializeCube(p.cube) : undefined, delta: p.delta } });
        ok++;
        setPending((x) => x.map((y) => (y.key === p.key ? { ...y, status: 'done' } : y)));
      } catch (e) {
        setPending((x) => x.map((y) => (y.key === p.key ? { ...y, status: 'err', ok: false, msg: (e as Error).message } : y)));
      }
    }
    setBusy(false);
    if (ok) { toast(`Đã tải lên ${ok} mục`); load(); setPending((x) => x.filter((y) => y.status !== 'done')); }
  };
  const patch = async (id: string, body: Record<string, unknown>) => { await api('/api/luts', { method: 'PATCH', body: { id, ...body } }); load(); };
  const move = async (i: number, d: -1 | 1) => {
    const arr = [...list];
    const j = i + d;
    if (j < 0 || j >= arr.length) return;
    [arr[i], arr[j]] = [arr[j], arr[i]];
    setList(arr);
    await api('/api/luts', { method: 'PATCH', body: { order: arr.map((x) => x.id) } });
  };

  return (
    <div className="stack">
      <div
        className={'dropzone glass' + (drag ? ' on' : '')}
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); addFiles(e.dataTransfer.files); }}
        onClick={() => fileRef.current?.click()}
        role="button"
        tabIndex={0}
      >
        <FileUp size={40} strokeWidth={1.5} />
        <b>Kéo thả nhiều file .cube hoặc .xmp vào đây</b>
        <span className="muted small">LUT 3D (.cube 17³/33³/65³, xuất từ Photoshop, Lightroom/ACR, Resolve…) hoặc preset Lightroom (.xmp). Hệ thống kiểm tra đúng định dạng, dung lượng ≤ 8 MB, nội dung từng dòng.</span>
        <input ref={fileRef} type="file" accept=".cube,.xmp" multiple hidden onChange={(e) => { if (e.target.files) addFiles(e.target.files); e.target.value = ''; }} />
      </div>
      <label className="row small"><input type="checkbox" checked={shrink} onChange={(e) => setShrink(e.target.checked)} /> Tự nén LUT lớn (65³) về 33³ để nhẹ (khuyên dùng)</label>

      {pending.length > 0 && (
        <div className="glass card stack">
          <div className="row between"><h3>Chờ tải lên ({pending.length})</h3>
            <div className="row">
              <button className="btn sm" onClick={() => setPending([])}>Bỏ hết</button>
              <button className="btn primary sm" disabled={busy || !pending.some((p) => p.ok && p.status !== 'done')} onClick={uploadAll}><Upload size={18} /> Tải lên tất cả hợp lệ</button>
            </div>
          </div>
          {pending.map((p) => (
            <div key={p.key} className={'pending' + (p.ok ? '' : ' bad')}>
              {p.preview ? <img src={p.preview} alt="" /> : <div className="pending-ph">{p.kind === 'xmp' ? 'XMP' : '—'}</div>}
              <div className="grow stack" style={{ gap: 6 }}>
                <div className="row small">{p.ok ? <CircleCheck size={18} color="var(--green)" /> : <CircleAlert size={18} color="var(--red)" />}<span className="muted">{p.file}</span> · <span>{p.msg}</span>{p.status === 'up' && ' · đang tải…'}</div>
                {p.ok && (
                  <div className="row wrap">
                    <input className="input" style={{ flex: '2 1 160px' }} value={p.name} aria-label="Tên" onChange={(e) => setPending((x) => x.map((y) => (y.key === p.key ? { ...y, name: e.target.value } : y)))} />
                    <select className="input" style={{ flex: '1 1 120px' }} value={p.group} aria-label="Nhóm" onChange={(e) => setPending((x) => x.map((y) => (y.key === p.key ? { ...y, group: e.target.value } : y)))}>{GROUPS.map((g) => <option key={g}>{g}</option>)}</select>
                    <input className="input" style={{ flex: '1 1 120px' }} placeholder="Bộ (collection)" value={p.collection} aria-label="Bộ sưu tập" onChange={(e) => setPending((x) => x.map((y) => (y.key === p.key ? { ...y, collection: e.target.value } : y)))} />
                  </div>
                )}
              </div>
              <button className="icon-btn" aria-label="Bỏ" onClick={() => setPending((x) => x.filter((y) => y.key !== p.key))}><Trash2 size={20} /></button>
            </div>
          ))}
        </div>
      )}

      <div className="glass card">
        <h3 style={{ marginBottom: 8 }}>Thư viện đã tải ({list.length})</h3>
        {!list.length && <p className="muted">Chưa có LUT nào do admin tải. 8 LUT mặc định của app vẫn hiển thị cho người dùng.</p>}
        <div className="list">
          {list.map((l, i) => (
            <div key={l.id} className="list-item" style={{ opacity: l.enabled ? 1 : 0.5 }}>
              <div className="grow">
                <input className="input inline" defaultValue={l.name} aria-label="Tên" onBlur={(e) => e.target.value !== l.name && patch(l.id, { name: e.target.value })} />
                <div className="muted small">{l.kind === 'xmp' ? 'Preset Lightroom' : `LUT ${l.size}³`} · {fmtBytes(l.bytes)} · {new Date(l.createdAt).toLocaleDateString('vi-VN')}{l.collection && ` · Bộ: ${l.collection}`}</div>
              </div>
              <select className="input" style={{ width: 130 }} value={l.group} aria-label="Nhóm" onChange={(e) => patch(l.id, { group: e.target.value })}>{[...new Set([...GROUPS, l.group])].map((g) => <option key={g}>{g}</option>)}</select>
              <button className="icon-btn" aria-label="Lên" onClick={() => move(i, -1)}><ChevronUp size={20} /></button>
              <button className="icon-btn" aria-label="Xuống" onClick={() => move(i, 1)}><ChevronDown size={20} /></button>
              <button className="icon-btn" aria-label={l.enabled ? 'Tắt' : 'Bật'} onClick={() => patch(l.id, { enabled: !l.enabled })}>{l.enabled ? <Eye size={20} /> : <EyeOff size={20} />}</button>
              <button className="icon-btn" aria-label="Xóa" onClick={async () => { if (!confirm(`Xóa “${l.name}”?`)) return; await api(`/api/luts?id=${l.id}`, { method: 'DELETE' }); load(); }}><Trash2 size={20} /></button>
            </div>
          ))}
        </div>
      </div>
      <p className="muted small">Bản quyền: chỉ tải LUT tự tạo hoặc có giấy phép sử dụng. Lightroom Classic không xuất .cube trực tiếp — hãy tải preset .xmp, hoặc xuất .cube từ Photoshop (File › Export › Color Lookup Tables).</p>
    </div>
  );
}
