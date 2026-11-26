import { useEffect, useRef, useState } from 'react';
import { Download, Share, Stamp, X, ShieldCheck, Images } from 'lucide-react';
import { Modal, Switch } from '../../ui/Modal';
import { Slider } from '../../ui/Slider';
import { toast } from '../../ui/toast';
import { activeDoc, getState, setTab, type Doc } from '../editor/store';
import { newLayer, useWm, wmSet } from '../watermark/watermark';
import { SIZES, SOCIAL, download, exportDoc, formatSupport, plan, shareFiles, zipFiles, type ExportOpts, type Format, type SizeKey } from './exporter';
import { getConfig } from '../../lib/config';
import { lsGet, lsSet } from '../../lib/db';

export function ExportDialog({ onClose }: { onClose: () => void }) {
  const wm = useWm((s) => s);
  const doc = activeDoc()!;
  const docs = getState().docs;
  const saved = (() => { try { return JSON.parse(lsGet('nps_export') || '{}') as Partial<ExportOpts>; } catch { return {}; } })();
  const [step, setStep] = useState<'ask' | 'opts'>(wm.alwaysApply ? 'opts' : 'ask');
  const [useWmark, setUseWmark] = useState(wm.alwaysApply && wm.layers.length > 0);
  const [size, setSize] = useState<SizeKey>(saved.size ?? '4k');
  const [customLong, setCustomLong] = useState(saved.customLong ?? 3000);
  const [format, setFormat] = useState<Format>(saved.format ?? 'jpeg');
  const [quality, setQuality] = useState(Math.round((saved.quality ?? 0.92) * 100));
  const [picked, setPicked] = useState<string[]>(() => docs.map((d) => d.id));
  const mobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Mac/.test(navigator.userAgent));
  const [saveMode, setSaveMode] = useState<'files' | 'zip'>(mobile ? 'files' : 'zip');
  const [support, setSupport] = useState<Record<Format, boolean>>({ jpeg: true, png: true, webp: false, avif: false });
  const [busy, setBusy] = useState<null | { p: number; label: string }>(null);
  const abort = useRef<AbortController | null>(null);
  useEffect(() => { formatSupport().then(setSupport); }, []);

  const opts = (): ExportOpts => ({ size, customLong, format, quality: quality / 100, watermark: useWmark, layers: wm.layers });
  const pl = plan(doc, opts());

  const run = async (mode: 'download' | 'share') => {
    lsSet('nps_export', JSON.stringify({ size, customLong, format, quality: quality / 100 }));
    const list: Doc[] = docs.length > 1 ? docs.filter((d) => picked.includes(d.id)) : [doc];
    if (!list.length) { toast('Hãy chọn ít nhất một ảnh', 'err'); return; }
    const ac = new AbortController();
    abort.current = ac;
    const out: { name: string; blob: Blob }[] = [];
    let lastNote: string | null = null;
    try {
      for (let i = 0; i < list.length; i++) {
        setBusy({ p: i / list.length, label: list.length > 1 ? `Đang xuất ảnh ${i + 1}/${list.length}…` : 'Đang xuất ảnh…' });
        const r = await exportDoc(list[i], opts(), (f) => setBusy({ p: (i + f) / list.length, label: list.length > 1 ? `Đang xuất ảnh ${i + 1}/${list.length}…` : `Đang xuất ${Math.round(f * 100)}%` }), ac.signal);
        out.push({ name: r.name, blob: r.blob });
        lastNote = r.note;
      }
      const files = out.map((o) => new File([o.blob], o.name, { type: o.blob.type }));
      if (mode === 'share' || (out.length > 1 && saveMode === 'files' && mobile)) {
        // Điện thoại: mở bảng chia sẻ → «Lưu N ảnh» vào Thư viện ảnh
        if (await shareFiles(files)) { onClose(); return; }
        if (mode === 'share') toast('Trình duyệt không hỗ trợ chia sẻ file — đã tải xuống', 'info');
      }
      if (out.length === 1) download(out[0].blob, out[0].name);
      else if (saveMode === 'files') {
        for (let i = 0; i < out.length; i++) {
          setBusy({ p: 1, label: `Đang lưu ảnh ${i + 1}/${out.length}…` });
          download(out[i].blob, out[i].name);
          await new Promise((r) => setTimeout(r, 450));
        }
      } else {
        setBusy({ p: 1, label: 'Đang nén ZIP…' });
        download(await zipFiles(out), `nophotoshop-${new Date().toISOString().slice(0, 10)}.zip`);
      }
      toast(lastNote ? `Đã xuất. ${lastNote}` : `Đã lưu ${out.length > 1 ? out.length + ' ảnh' : 'ảnh'}`, lastNote ? 'info' : 'ok', { ms: lastNote ? 7000 : 2800 });
      onClose();
    } catch (e) {
      if ((e as Error).name !== 'AbortError') { console.error(e); toast('Xuất ảnh lỗi: ' + (e as Error).message, 'err'); }
      setBusy(null);
    }
  };

  if (step === 'ask')
    return (
      <Modal title="Tải ảnh xuống" onClose={onClose}>
        <div className="ask">
          <span className="sq orange" style={{ width: 42, height: 42 }}><Stamp size={23} strokeWidth={1.75} /></span>
          <h3>Bạn có muốn đóng dấu (watermark) lên ảnh không?</h3>
          <p className="muted">Thêm tên hoặc logo của bạn để khẳng định bản quyền khi chia sẻ.</p>
          {wm.layers.length > 0 ? (
            <>
              <button className="btn primary lg block" onClick={() => { setUseWmark(true); setStep('opts'); }}><Stamp size={14} /> Có, đóng dấu ({wm.layers.length} mẫu)</button>
              <button className="btn lg block" onClick={() => { setUseWmark(false); setStep('opts'); }}>Không, tải ảnh sạch</button>
              <button className="btn ghost block" onClick={() => { onClose(); setTab('watermark'); }}>Chỉnh watermark trước</button>
            </>
          ) : (
            <>
              <button className="btn primary lg block" onClick={() => {
                const l = newLayer('text', getConfig().author.replace(/^By\s+/i, '') || 'DucAnh');
                l.text = '© ' + l.text;
                wmSet({ layers: [l], selected: l.id, preview: true });
                onClose();
                setTab('watermark');
                toast('Đã thêm watermark — kéo để đặt vị trí rồi bấm Xuất', 'info', { ms: 5000 });
              }}><Stamp size={14} /> Có, tạo watermark</button>
              <button className="btn lg block" onClick={() => { setUseWmark(false); setStep('opts'); }}>Không, tải ảnh luôn</button>
            </>
          )}
          <label className="row small" style={{ justifyContent: 'center' }}>
            <input type="checkbox" checked={wm.alwaysApply} onChange={(e) => wmSet({ alwaysApply: e.target.checked })} /> Ghi nhớ: luôn áp dụng watermark khi xuất
          </label>
        </div>
      </Modal>
    );

  return (
    <Modal title="Xuất ảnh" onClose={() => { abort.current?.abort(); onClose(); }}>
      <div className="stack">
        <div className="field">
          <span>Kích thước</span>
          <div className="row wrap" style={{ gap: 8 }}>
            {SIZES.map((s) => <button key={s.key} className={'chip big' + (size === s.key ? ' on' : '')} onClick={() => setSize(s.key)}>{s.label}{s.hint && <small>{s.hint}</small>}</button>)}
          </div>
          {size === 'custom' && <Slider label="Cạnh dài" value={customLong} min={512} max={8192} step={64} def={3000} unit="px" onChange={setCustomLong} />}
          <div className="hscroll chips">
            {SOCIAL.map((s) => <button key={s.key} className={'chip' + (size === s.key ? ' on' : '')} onClick={() => setSize(s.key)}>{s.label}</button>)}
          </div>
        </div>
        <div className="field">
          <span>Định dạng</span>
          <div className="seg">
            {(['jpeg', 'png', 'webp', 'avif'] as Format[]).filter((f) => support[f]).map((f) => (
              <button key={f} className={format === f ? 'on' : ''} onClick={() => setFormat(f)}>{f === 'jpeg' ? 'JPG' : f.toUpperCase()}</button>
            ))}
          </div>
          {format !== 'png' && <Slider label="Chất lượng" value={quality} min={60} max={100} def={92} onChange={setQuality} />}
        </div>
        {docs.length > 1 && (
          <div className="field">
            <div className="row between">
              <span><Images size={14} style={{ verticalAlign: -3 }} /> Chọn ảnh để xuất ({picked.length}/{docs.length})</span>
              <button className="btn sm ghost" onClick={() => setPicked(picked.length === docs.length ? [doc.id] : docs.map((d) => d.id))}>{picked.length === docs.length ? 'Chỉ ảnh này' : 'Chọn tất cả'}</button>
            </div>
            <div className="pick-grid">
              {docs.map((d) => {
                const on = picked.includes(d.id);
                return (
                  <button key={d.id} className={'pick' + (on ? ' on' : '')} aria-pressed={on} aria-label={d.name} onClick={() => setPicked(on ? picked.filter((x) => x !== d.id) : [...picked, d.id])}>
                    <img src={d.thumb} alt="" />{on && <span className="pcheck">✓</span>}
                  </button>
                );
              })}
            </div>
            {picked.length > 1 && (
              <>
                <span>Cách tải về</span>
                <div className="seg">
                  <button className={saveMode === 'files' ? 'on' : ''} onClick={() => setSaveMode('files')}>Từng ảnh vào máy</button>
                  <button className={saveMode === 'zip' ? 'on' : ''} onClick={() => setSaveMode('zip')}>Một file ZIP</button>
                </div>
                <span className="muted small">{saveMode === 'files' ? (mobile ? 'Điện thoại: mở bảng chia sẻ, chọn «Lưu ảnh» để đưa tất cả vào Thư viện ảnh.' : 'Tải lần lượt từng ảnh (trình duyệt có thể hỏi cho phép tải nhiều file).') : 'Gộp tất cả vào một file .zip — tiện gửi qua máy tính, Zalo, email.'}</span>
              </>
            )}
          </div>
        )}
        <div className="list">
          <div className="list-item">
            <Stamp size={14} strokeWidth={1.75} />
            <div className="grow"><b>Đóng dấu watermark</b><div className="muted small">{wm.layers.length ? `${wm.layers.length} lớp` : 'Chưa có watermark'}</div></div>
            <Switch label="Đóng dấu watermark" checked={useWmark && wm.layers.length > 0} onChange={(v) => { if (v && !wm.layers.length) { onClose(); setTab('watermark'); return; } setUseWmark(v); }} />
          </div>
          <div className="list-item">
            <ShieldCheck size={14} strokeWidth={1.75} color="var(--green)" />
            <div className="grow small muted">Hồ sơ màu sRGB. Thông tin vị trí GPS và EXIF được xóa để bảo vệ riêng tư.</div>
          </div>
        </div>
        <p className="out-dim"><b>{pl.w} × {pl.h}px</b>{pl.note && <span className="muted small"> · {pl.note}</span>}</p>
        {busy ? (
          <div className="stack">
            <div className="progress" role="progressbar" aria-valuenow={Math.round(busy.p * 100)}><div style={{ width: `${busy.p * 100}%` }} /></div>
            <div className="row between"><span>{busy.label}</span><button className="btn sm" onClick={() => abort.current?.abort()}><X size={14} /> Hủy</button></div>
          </div>
        ) : (
          <div className="row">
            <button className="btn primary lg grow" onClick={() => run('download')}><Download size={16} /> {picked.length > 1 && docs.length > 1 ? `Tải ${picked.length} ảnh` : 'Tải xuống'}</button>
            {'share' in navigator && <button className="btn lg" onClick={() => run('share')} aria-label="Chia sẻ ảnh"><Share size={16} /></button>}
          </div>
        )}
      </div>
    </Modal>
  );
}
