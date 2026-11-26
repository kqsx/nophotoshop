import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ChevronLeft, RotateCcw, Undo2, Redo2, Eye, Columns2, History, Download, Sparkles, Palette, SlidersHorizontal, Crop, Stamp, Plus, X, ChartColumn, ChevronUp, ChevronDown,
} from 'lucide-react';
import { Viewport } from './Viewport';
import { QuickPanel } from './QuickPanel';
import { LutPanel } from './LutPanel';
import { AdvancedPanel } from './AdvancedPanel';
import { CropPanel } from './CropPanel';
import { WatermarkPanel } from '../watermark/WatermarkPanel';
import { ExportDialog } from '../export/ExportDialog';
import { Modal } from '../../ui/Modal';
import { addFiles, blankEdit, closeAll, edit, resetAll, jumpTo, redo, removeDoc, setActive, setSyncAll, setTab, undo, useStore, type Doc, type Tab } from './store';
import { Switch } from '../../ui/Modal';
import { getBlur } from './runtime';
import { toast } from '../../ui/toast';
import { orientationOf } from '../../analysis/aspect';
import type { PreviewPipeline } from '../../engine/pipeline';

const BLANK = JSON.stringify(blankEdit());

const TABS: { id: Tab; label: string; icon: typeof Sparkles }[] = [
  { id: 'quick', label: 'Gợi ý', icon: Sparkles },
  { id: 'lut', label: 'Màu LUT', icon: Palette },
  { id: 'advanced', label: 'Nâng cao', icon: SlidersHorizontal },
  { id: 'crop', label: 'Cắt', icon: Crop },
  { id: 'watermark', label: 'Đóng dấu', icon: Stamp },
];

export function Editor() {
  const docs = useStore((s) => s.docs);
  const activeId = useStore((s) => s.activeId);
  const tab = useStore((s) => s.tab);
  const loading = useStore((s) => s.loading);
  const syncAll = useStore((s) => s.syncAll);
  const doc = docs.find((d) => d.id === activeId) ?? docs[0];
  const [holdOrig, setHoldOrig] = useState(false);
  const [split, setSplit] = useState<number | null>(null);
  const [hist, setHist] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [tapMode, setTapMode] = useState<'heal' | 'wb' | null>(null);
  const [healSize, setHealSize] = useState(18);
  const [sheetOpen, setSheetOpen] = useState(true);
  const pipe = useRef<PreviewPipeline | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // phím tắt: Ctrl+Z, Ctrl+Shift+Z, giữ Space xem ảnh gốc
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.tagName === 'INPUT' && (t as HTMLInputElement).type !== 'range' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT') return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); }
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); }
      else if (e.code === 'Space') { e.preventDefault(); setHoldOrig(true); }
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); setExporting(true); }
    };
    const up = (e: KeyboardEvent) => { if (e.code === 'Space') setHoldOrig(false); };
    addEventListener('keydown', down);
    addEventListener('keyup', up);
    return () => { removeEventListener('keydown', down); removeEventListener('keyup', up); };
  }, []);

  useEffect(() => { if (tab !== 'advanced') setTapMode(null); }, [tab]);

  const onTap = useCallback((u: number, v: number) => {
    if (!doc) return;
    if (tapMode === 'heal') {
      if (doc.cur.manual.heal.length >= 16) return toast('Tối đa 16 điểm xóa mỗi ảnh', 'info');
      edit('Xóa điểm', (s) => ({ ...s, manual: { ...s.manual, heal: [...s.manual.heal, { x: u, y: v, r: healSize / 1000 }] } }));
    } else if (tapMode === 'wb') {
      const { mid } = getBlur(doc);
      const ctx = mid.getContext('2d', { willReadFrequently: true })!;
      const d = ctx.getImageData(Math.max(0, Math.round(u * mid.width) - 3), Math.max(0, Math.round(v * mid.height) - 3), 7, 7).data;
      let r = 0, g = 0, b = 0;
      const lin = (x: number) => ((x / 255) <= 0.04045 ? x / 255 / 12.92 : ((x / 255 + 0.055) / 1.055) ** 2.4);
      for (let i = 0; i < d.length; i += 4) { r += lin(d[i]); g += lin(d[i + 1]); b += lin(d[i + 2]); }
      const t = Math.max(-1, Math.min(1, (b - r) / (0.16 * (r + b) || 1)));
      const r2 = r * (1 + 0.16 * t), b2 = b * (1 - 0.16 * t);
      const k = Math.max(-1, Math.min(1, (g - (r2 + b2) / 2) / (0.1 * g || 1)));
      edit('Cân bằng trắng', (s) => ({ ...s, manual: { ...s.manual, temp: Math.round(t * 100), tint: Math.round(k * 100) } }));
      setTapMode(null);
      toast('Đã cân bằng trắng');
    }
  }, [doc, tapMode, healSize]);

  const onReady = useCallback((p: PreviewPipeline) => { pipe.current = p; }, []);
  if (!doc) return null;
  const portrait = orientationOf(doc.w, doc.h) === 'doc';

  const panel = (t: Tab) => (
    <>
      {t === 'quick' && <QuickPanel doc={doc} />}
      {t === 'lut' && <LutPanel doc={doc} />}
      {t === 'advanced' && <AdvancedPanel doc={doc} tapMode={tapMode} setTapMode={setTapMode} healSize={healSize} setHealSize={setHealSize} />}
      {t === 'crop' && <CropPanel doc={doc} />}
      {t === 'watermark' && <WatermarkPanel portrait={portrait} />}
    </>
  );

  return (
    <div className="editor">
      <header className="ed-top glass">
        <button className="icon-btn" aria-label="Về trang chủ" onClick={() => { if (confirm('Đóng tất cả ảnh và về trang chủ?')) closeAll(); }}><ChevronLeft size={18} strokeWidth={1.75} /></button>
        <div className="ed-title grow">
          <b className="ellipsis">{doc.name}</b>
          <small className="muted">{doc.w}×{doc.h}{doc.analysis?.ratio ? ` · ${doc.analysis.ratio}` : ''}</small>
        </div>
        <button className="tbtn" aria-label="Trở lại thao tác trước (Ctrl+Z)" title="Trở lại" disabled={!doc.past.length} onClick={undo}><Undo2 size={16} strokeWidth={1.75} /><span>Trở lại</span></button>
        <button className="tbtn icon-only" aria-label="Làm lại (Ctrl+Shift+Z)" title="Làm lại" disabled={!doc.future.length} onClick={redo}><Redo2 size={16} strokeWidth={1.75} /></button>
        <button className="tbtn" aria-label="Đưa ảnh về ban đầu" title="Ảnh gốc" disabled={JSON.stringify(doc.cur) === BLANK} onClick={() => { resetAll(); toast('Đã đưa ảnh về ban đầu — bấm Trở lại để hoàn tác'); }}><RotateCcw size={16} strokeWidth={1.75} /><span>Ảnh gốc</span></button>
        <button className="icon-btn hide-sm" aria-label="Lịch sử" onClick={() => setShowHistory(true)}><History size={16} strokeWidth={1.75} /></button>
        <button className="btn primary sm" onClick={() => setExporting(true)}><Download size={14} /> Xuất</button>
      </header>

      <div className="ed-body">
        <div className="ed-stage">
          <Viewport
            doc={doc}
            showOriginal={holdOrig}
            split={split}
            onSplit={setSplit}
            wmActive={tab === 'watermark'}
            tapMode={tapMode}
            onTap={onTap}
            onReady={onReady}
          />
          <div className="stage-tools">
            <button
              className={'pill glass' + (holdOrig ? ' on' : '')}
              onPointerDown={() => setHoldOrig(true)}
              onPointerUp={() => setHoldOrig(false)}
              onPointerLeave={() => setHoldOrig(false)}
              onContextMenu={(e) => e.preventDefault()}
              aria-label="Giữ để xem ảnh gốc"
            ><Eye size={14} strokeWidth={1.75} /> Giữ xem gốc</button>
            <button className={'pill glass' + (split != null ? ' on' : '')} onClick={() => setSplit(split == null ? 0.5 : null)} aria-pressed={split != null}><Columns2 size={14} strokeWidth={1.75} /> Trước/Sau</button>
            <button className={'pill glass hide-sm' + (hist ? ' on' : '')} onClick={() => setHist(!hist)} aria-pressed={hist} aria-label="Histogram"><ChartColumn size={14} strokeWidth={1.75} /></button>
            <button className="pill glass show-sm" onClick={() => setShowHistory(true)} aria-label="Lịch sử"><History size={14} strokeWidth={1.75} /></button>
          </div>
          {hist && <Histogram pipe={pipe.current} rev={doc.rev} />}
          {loading > 0 && <div className="loading-pill glass">Đang mở {loading} ảnh…</div>}
          {docs.length > 1 && (
            <label className="sync-bar glass">
              <Switch label="Chỉnh đồng loạt" checked={syncAll} onChange={setSyncAll} />
              <span><b>Chỉnh đồng loạt {docs.length} ảnh</b><small className="muted">{syncAll ? 'Preset, LUT, thanh kéo áp cho tất cả (khung cắt giữ riêng)' : 'Chỉ chỉnh ảnh đang chọn'}</small></span>
            </label>
          )}
          {(
            <div className="filmstrip">
              {docs.map((d: Doc) => (
                <div key={d.id} className={'film' + (d.id === doc.id ? ' on' : '')}>
                  <button onClick={() => setActive(d.id)} aria-label={`Ảnh ${d.name}`}><img src={d.thumb} alt="" /></button>
                  {docs.length > 1 && <button className="film-x" aria-label="Bỏ ảnh" onClick={() => removeDoc(d.id)}><X size={14} strokeWidth={2.5} /></button>}
                </div>
              ))}
              <button className="film add" onClick={() => fileRef.current?.click()} aria-label="Thêm ảnh"><Plus size={16} strokeWidth={1.75} /></button>
            </div>
          )}
          <input ref={fileRef} type="file" accept="image/*,.heic,.heif" multiple hidden onChange={(e) => { if (e.target.files) addFiles(e.target.files, (m) => toast(m, 'err')); e.target.value = ''; }} />
        </div>

        {(
          <aside className={'ed-panel glass' + (sheetOpen ? ' open' : '')}>
            <button className="sheet-grab show-sm" onClick={() => setSheetOpen(!sheetOpen)} aria-label={sheetOpen ? 'Thu gọn công cụ' : 'Mở công cụ'}>
              <span className="grabber" />{sheetOpen ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
            </button>
            <nav className="tabs" role="tablist" aria-label="Công cụ">
              {TABS.map((t) => (
                <button key={t.id} role="tab" aria-selected={tab === t.id} className={'tab' + (tab === t.id ? ' on' : '')} onClick={() => { setTab(t.id); setSheetOpen(true); }}>
                  <t.icon size={17} strokeWidth={1.75} fill={tab === t.id ? 'currentColor' : 'none'} fillOpacity={tab === t.id ? 0.18 : 0} />
                  <span>{t.label}</span>
                </button>
              ))}
            </nav>
            <div className="panel-scroll">{panel(tab)}</div>
          </aside>
        )}
      </div>

      {showHistory && (
        <Modal title="Lịch sử chỉnh sửa" onClose={() => setShowHistory(false)}>
          <div className="list">
            {[{ label: 'Ảnh gốc', i: 0 }, ...doc.past.map((p, i) => ({ label: p.label, i: i + 1 })), ...doc.future.map((f, i) => ({ label: f.label, i: doc.past.length + 1 + i }))].map((h) => (
              <button key={h.i} className={'list-item hist' + (h.i === doc.past.length ? ' on' : '') + (h.i > doc.past.length ? ' future' : '')} onClick={() => jumpTo(h.i)}>
                <span className="muted small" style={{ width: 28 }}>{h.i}</span>
                <span className="grow">{h.i === 0 ? 'Ảnh gốc' : historyLabel(doc, h.i)}</span>
                {h.i === doc.past.length && <span className="tag">Hiện tại</span>}
              </button>
            ))}
          </div>
          <p className="muted small">Bấm vào một bước để quay lại. Hoàn tác/làm lại không giới hạn (trong bộ nhớ cho phép).</p>
        </Modal>
      )}
      {exporting && <ExportDialog onClose={() => setExporting(false)} />}
    </div>
  );
}

/** Nhãn cho bước i: là nhãn của thao tác dẫn tới trạng thái i. */
function historyLabel(d: Doc, i: number): string {
  const labels = [...d.past.map((p) => p.label), ...d.future.map((f) => f.label)];
  // past[k].label là thao tác tạo ra trạng thái k+1
  return labels[i - 1] ?? '';
}

function Histogram({ pipe, rev }: { pipe: PreviewPipeline | null; rev: number }) {
  const ref = useRef<SVGSVGElement>(null);
  const [paths, setPaths] = useState<string[]>([]);
  useEffect(() => {
    const t = setTimeout(() => {
      if (!pipe) return;
      const src = pipe.r.canvas;
      const c = document.createElement('canvas');
      c.width = 160; c.height = Math.max(1, Math.round((160 * src.height) / src.width));
      const ctx = c.getContext('2d', { willReadFrequently: true })!;
      ctx.drawImage(src, 0, 0, c.width, c.height);
      const d = ctx.getImageData(0, 0, c.width, c.height).data;
      const H = [new Uint32Array(64), new Uint32Array(64), new Uint32Array(64)];
      for (let i = 0; i < d.length; i += 4) { H[0][d[i] >> 2]++; H[1][d[i + 1] >> 2]++; H[2][d[i + 2] >> 2]++; }
      let mx = 1;
      for (const h of H) for (let i = 1; i < 63; i++) mx = Math.max(mx, h[i]);
      setPaths(H.map((h) => { let p = 'M0,60'; for (let i = 0; i < 64; i++) p += `L${(i / 63) * 200},${60 - Math.min(1, h[i] / mx) * 58}`; return p + 'L200,60Z'; }));
    }, 250);
    return () => clearTimeout(t);
  }, [pipe, rev]);
  return (
    <svg ref={ref} className="histogram glass" viewBox="0 0 200 60" aria-label="Histogram">
      {paths.map((p, i) => <path key={i} d={p} fill={['rgba(255,59,48,.55)', 'rgba(48,209,88,.55)', 'rgba(10,132,255,.55)'][i]} style={{ mixBlendMode: 'screen' }} />)}
    </svg>
  );
}
