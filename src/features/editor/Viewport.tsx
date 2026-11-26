import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { PreviewPipeline } from '../../engine/pipeline';
import { effectiveParams, type Doc } from './store';
import { getBlur } from './runtime';
import { drawWatermarks, ensureFonts, layerBox, posOf, useWm, wmGet, wmSet, wmUpdate, type WmLayer, type WmPos } from '../watermark/watermark';
import { toast } from '../../ui/toast';

interface Props {
  doc: Doc;
  showOriginal: boolean;
  split: number | null; // null = tắt; 0..1 vị trí thanh chia
  onSplit: (v: number) => void;
  wmActive: boolean;
  tapMode: 'heal' | 'wb' | null;
  onTap?: (u: number, v: number) => void;
  onReady?: (p: PreviewPipeline) => void;
}

export function Viewport({ doc, showOriginal, split, onSplit, wmActive, tapMode, onTap, onReady }: Props) {
  const wrap = useRef<HTMLDivElement>(null);
  const glRef = useRef<HTMLCanvasElement>(null);
  const ovRef = useRef<HTMLCanvasElement>(null);
  const pipe = useRef<PreviewPipeline | null>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [err, setErr] = useState<string | null>(null);
  const wm = useWm((s) => s);
  const raf = useRef(0);
  const params = effectiveParams(doc);
  const geomKey = JSON.stringify(doc.cur.geometry);

  // khởi tạo pipeline
  useEffect(() => {
    if (!glRef.current || pipe.current) return;
    try {
      pipe.current = new PreviewPipeline(glRef.current);
      onReady?.(pipe.current);
    } catch (e) {
      setErr((e as Error).message);
    }
  }, [onReady]);

  // nạp ảnh / đổi khung cắt
  const [prepKey, setPrepKey] = useState('');
  useEffect(() => {
    const p = pipe.current;
    if (!p) return;
    p.prepare(doc.bitmap, doc.cur.geometry, 1600, getBlur(doc));
    setPrepKey(doc.id + geomKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc.id, geomKey, err]);

  // kích thước hiển thị (contain)
  useLayoutEffect(() => {
    const el = wrap.current;
    const p = pipe.current;
    if (!el || !p) return;
    const fit = () => {
      const W = el.clientWidth - 24, H = el.clientHeight - 24;
      const s = Math.min(W / p.outW, H / p.outH);
      setBox({ w: Math.max(1, Math.floor(p.outW * s)), h: Math.max(1, Math.floor(p.outH * s)) });
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [prepKey]);

  // vẽ (gộp theo requestAnimationFrame — chỉ vẽ khung mới nhất)
  const splitVal = showOriginal ? 2 : split ?? 0;
  const pKey = JSON.stringify(params);
  useEffect(() => {
    cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(() => {
      pipe.current?.render(params, splitVal).catch((e) => toast(String(e), 'err'));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pKey, splitVal, prepKey]);

  // lớp phủ: watermark + khung chọn + thanh chia
  const drawOverlay = () => {
    const c = ovRef.current;
    if (!c || !box.w) return;
    const dpr = Math.min(2, devicePixelRatio || 1);
    const W = Math.round(box.w * dpr), H = Math.round(box.h * dpr);
    if (c.width !== W || c.height !== H) { c.width = W; c.height = H; }
    const ctx = c.getContext('2d')!;
    ctx.clearRect(0, 0, W, H);
    const show = (wm.preview || wmActive) && !showOriginal;
    if (show && wm.layers.length) {
      drawWatermarks(ctx, wm.layers, W, H, doc.exifDate, glRef.current);
      if (wmActive) {
        const sel = wm.layers.find((l) => l.id === wm.selected);
        if (sel && sel.type !== 'tile' && sel.visible) {
          const b = layerBox(ctx, sel, W, H, doc.exifDate);
          ctx.save();
          ctx.translate(b.cx, b.cy);
          ctx.rotate(b.rot);
          ctx.strokeStyle = '#0a84ff';
          ctx.lineWidth = 2 * dpr;
          ctx.setLineDash([6 * dpr, 4 * dpr]);
          ctx.strokeRect(-b.w / 2 - 6 * dpr, -b.h / 2 - 6 * dpr, b.w + 12 * dpr, b.h + 12 * dpr);
          ctx.setLineDash([]);
          if (!sel.locked) {
            ctx.fillStyle = '#fff';
            for (const [hx, hy] of [[b.w / 2 + 6 * dpr, b.h / 2 + 6 * dpr], [0, -b.h / 2 - 26 * dpr]]) {
              ctx.beginPath(); ctx.arc(hx, hy, 9 * dpr, 0, 7); ctx.fill(); ctx.stroke();
            }
          }
          ctx.restore();
        }
      }
    }
    if (split != null && !showOriginal) {
      const x = split * W;
      ctx.fillStyle = 'rgba(255,255,255,.95)';
      ctx.fillRect(x - dpr, 0, 2 * dpr, H);
      ctx.beginPath(); ctx.arc(x, H / 2, 16 * dpr, 0, 7); ctx.fill();
      ctx.fillStyle = '#1c1c1e';
      ctx.font = `${600} ${12 * dpr}px sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('‹ ›', x, H / 2);
      ctx.fillStyle = 'rgba(0,0,0,.5)';
      ctx.font = `${600} ${13 * dpr}px sans-serif`;
      ctx.fillText('Gốc', 30 * dpr, 20 * dpr);
      ctx.fillText('Sau', W - 30 * dpr, 20 * dpr);
    }
  };
  useEffect(() => {
    ensureFonts(wm.layers).then(drawOverlay);
    drawOverlay();
  });

  // ---------- tương tác ----------
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<null | { kind: 'move' | 'scale' | 'rotate' | 'pinch' | 'split'; id?: string; start: WmPos; px: number; py: number; d0?: number; a0?: number; cx?: number; cy?: number }>(null);

  const local = (e: React.PointerEvent) => {
    const r = ovRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top, W: r.width, H: r.height };
  };
  const setPos = (l: WmLayer, pos: Partial<WmPos>) => {
    const portrait = doc.cur.geometry && box.h > box.w * 1.05 && wmGet().portraitMode;
    if (portrait) wmUpdate(l.id, { portrait: { ...(l.portrait ?? { x: l.x, y: l.y, size: l.size, rotation: l.rotation }), ...pos } });
    else wmUpdate(l.id, pos);
  };

  const onDown = (e: React.PointerEvent) => {
    const p = local(e);
    (e.target as Element).setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: p.x, y: p.y });
    if (split != null && Math.abs(p.x - split * p.W) < 30) {
      gesture.current = { kind: 'split', start: { x: 0, y: 0, size: 0, rotation: 0 }, px: p.x, py: p.y };
      return;
    }
    if (tapMode) {
      onTap?.(p.x / p.W, p.y / p.H);
      return;
    }
    if (!wmActive) return;
    const st = wmGet();
    const ctx = ovRef.current!.getContext('2d')!;
    if (pointers.current.size === 2 && gesture.current?.id) {
      const [a, b] = [...pointers.current.values()];
      const l = st.layers.find((x) => x.id === gesture.current!.id);
      if (l) gesture.current = { kind: 'pinch', id: l.id, start: { ...posOf(l, p.W, p.H) }, px: 0, py: 0, d0: Math.hypot(a.x - b.x, a.y - b.y), a0: Math.atan2(b.y - a.y, b.x - a.x) };
      return;
    }
    // tay nắm của lớp đang chọn
    const sel = st.layers.find((l) => l.id === st.selected);
    if (sel && !sel.locked && sel.type !== 'tile') {
      const bx = layerBox(ctx, sel, p.W, p.H, doc.exifDate);
      const toLocal = (x: number, y: number) => {
        const dx = x - bx.cx, dy = y - bx.cy;
        return { x: dx * Math.cos(-bx.rot) - dy * Math.sin(-bx.rot), y: dx * Math.sin(-bx.rot) + dy * Math.cos(-bx.rot) };
      };
      const q = toLocal(p.x, p.y);
      if (Math.hypot(q.x - (bx.w / 2 + 6), q.y - (bx.h / 2 + 6)) < 22) {
        gesture.current = { kind: 'scale', id: sel.id, start: { ...posOf(sel, p.W, p.H) }, px: p.x, py: p.y, cx: bx.cx, cy: bx.cy, d0: Math.hypot(p.x - bx.cx, p.y - bx.cy) };
        return;
      }
      if (Math.hypot(q.x, q.y - (-bx.h / 2 - 26)) < 22) {
        gesture.current = { kind: 'rotate', id: sel.id, start: { ...posOf(sel, p.W, p.H) }, px: p.x, py: p.y, cx: bx.cx, cy: bx.cy };
        return;
      }
    }
    // chọn lớp dưới ngón tay
    for (let i = st.layers.length - 1; i >= 0; i--) {
      const l = st.layers[i];
      if (!l.visible || l.type === 'tile') continue;
      const b = layerBox(ctx, l, p.W, p.H, doc.exifDate);
      const dx = p.x - b.cx, dy = p.y - b.cy;
      const lx = dx * Math.cos(-b.rot) - dy * Math.sin(-b.rot), ly = dx * Math.sin(-b.rot) + dy * Math.cos(-b.rot);
      if (Math.abs(lx) < b.w / 2 + 12 && Math.abs(ly) < b.h / 2 + 12) {
        if (wmGet().selected !== l.id) wmSet({ selected: l.id });
        if (!l.locked) gesture.current = { kind: 'move', id: l.id, start: { ...posOf(l, p.W, p.H), x: b.cx / p.W, y: b.cy / p.H }, px: p.x, py: p.y };
        return;
      }
    }
  };
  const onMove = (e: React.PointerEvent) => {
    const g = gesture.current;
    if (!pointers.current.has(e.pointerId)) return;
    const p = local(e);
    pointers.current.set(e.pointerId, { x: p.x, y: p.y });
    if (!g) return;
    if (g.kind === 'split') { onSplit(Math.min(1, Math.max(0, p.x / p.W))); return; }
    const l = wmGet().layers.find((x) => x.id === g.id);
    if (!l) return;
    if (g.kind === 'move') setPos(l, { x: g.start.x + (p.x - g.px) / p.W, y: g.start.y + (p.y - g.py) / p.H });
    else if (g.kind === 'scale') {
      const d = Math.hypot(p.x - g.cx!, p.y - g.cy!);
      setPos(l, { size: Math.min(100, Math.max(3, g.start.size * (d / Math.max(1, g.d0!)))) });
    } else if (g.kind === 'rotate') {
      const a = (Math.atan2(p.y - g.cy!, p.x - g.cx!) * 180) / Math.PI + 90;
      const snapped = Math.abs(a % 45) < 4 ? Math.round(a / 45) * 45 : a;
      setPos(l, { rotation: ((snapped + 540) % 360) - 180 });
    } else if (g.kind === 'pinch' && pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const ang = Math.atan2(b.y - a.y, b.x - a.x);
      setPos(l, {
        size: Math.min(100, Math.max(3, g.start.size * (d / Math.max(1, g.d0!)))),
        rotation: Math.round(g.start.rotation + ((ang - g.a0!) * 180) / Math.PI),
      });
    }
  };
  const onUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size === 0) gesture.current = null;
  };

  if (err)
    return (
      <div className="viewport" ref={wrap}>
        <div className="glass card" style={{ maxWidth: 420, margin: 'auto' }}>
          <b>Không khởi động được bộ xử lý ảnh</b>
          <p className="muted">{err}. Hãy cập nhật trình duyệt (Chrome, Safari 15+, Edge, Firefox) và bật tăng tốc phần cứng.</p>
        </div>
      </div>
    );

  return (
    <div className="viewport" ref={wrap}>
      <div className="stage" style={{ width: box.w, height: box.h }}>
        <canvas ref={glRef} className="gl" style={{ width: box.w, height: box.h }} aria-label="Ảnh đang chỉnh" role="img" />
        <canvas
          ref={ovRef}
          className={'overlay' + (wmActive ? ' wm' : '') + (tapMode ? ' tap' : '')}
          style={{ width: box.w, height: box.h, touchAction: wmActive || tapMode || split != null ? 'none' : 'auto' }}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
        />
        {showOriginal && <div className="badge-orig">Ảnh gốc</div>}
      </div>
    </div>
  );
}
