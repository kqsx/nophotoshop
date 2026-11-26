import { useEffect, useRef, useState } from 'react';
import { curveTable, type CurvePoint, type Curves } from '../../engine/params';
import { commit, live, type Doc } from './store';

const CH: { k: keyof Curves; label: string; color: string }[] = [
  { k: 'master', label: 'RGB', color: 'var(--text)' },
  { k: 'r', label: 'Đỏ', color: '#ff3b30' },
  { k: 'g', label: 'Lục', color: '#30d158' },
  { k: 'b', label: 'Lam', color: '#0a84ff' },
];

export function CurveEditor({ doc }: { doc: Doc }) {
  const [ch, setCh] = useState<keyof Curves>('master');
  const ref = useRef<SVGSVGElement>(null);
  const drag = useRef<number | null>(null);
  const pts = doc.cur.manual.curves[ch];
  const S = 280;
  const setPts = (p: CurvePoint[]) => live((e) => ({ ...e, manual: { ...e.manual, curves: { ...e.manual.curves, [ch]: p } } }));
  const toXY = (e: React.PointerEvent): CurvePoint => {
    const r = ref.current!.getBoundingClientRect();
    return [Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), Math.min(1, Math.max(0, 1 - (e.clientY - r.top) / r.height))];
  };
  const table = curveTable(pts);
  let path = '';
  for (let i = 0; i < 256; i += 3) path += `${i ? 'L' : 'M'}${(i / 255) * S},${(1 - table[i]) * S}`;
  path += `L${S},${(1 - table[255]) * S}`;
  const hist = doc.analysis?.hist;
  let hpath = '';
  if (hist) {
    let mx = 1;
    for (let i = 2; i < 254; i++) mx = Math.max(mx, hist[i]);
    hpath = `M0,${S}`;
    for (let i = 0; i < 256; i += 2) hpath += `L${(i / 255) * S},${S - Math.min(1, hist[i] / mx) * S * 0.9}`;
    hpath += `L${S},${S}Z`;
  }
  useEffect(() => { drag.current = null; }, [ch]);
  return (
    <div>
      <div className="seg" style={{ marginBottom: 10 }}>
        {CH.map((c) => <button key={c.k} className={ch === c.k ? 'on' : ''} onClick={() => setCh(c.k)} style={{ color: ch === c.k ? c.color : undefined }}>{c.label}</button>)}
      </div>
      <svg
        ref={ref}
        viewBox={`0 0 ${S} ${S}`}
        className="curve"
        style={{ touchAction: 'none' }}
        onPointerDown={(e) => {
          (e.target as Element).setPointerCapture?.(e.pointerId);
          const p = toXY(e);
          let idx = pts.findIndex((q) => Math.hypot(q[0] - p[0], q[1] - p[1]) < 0.06);
          if (idx < 0) {
            const np = [...pts, p].sort((a, b) => a[0] - b[0]);
            idx = np.indexOf(p);
            setPts(np);
          }
          drag.current = idx;
        }}
        onPointerMove={(e) => {
          if (drag.current == null) return;
          const p = toXY(e);
          const np = pts.map((q) => [...q] as CurvePoint);
          const i = drag.current;
          const lo = i > 0 ? np[i - 1][0] + 0.01 : 0, hi = i < np.length - 1 ? np[i + 1][0] - 0.01 : 1;
          np[i] = [i === 0 ? 0 : i === np.length - 1 ? 1 : Math.min(hi, Math.max(lo, p[0])), p[1]];
          setPts(np);
        }}
        onPointerUp={() => { drag.current = null; commit('Đường cong'); }}
        onDoubleClick={(e) => {
          const p = toXY(e as unknown as React.PointerEvent);
          const idx = pts.findIndex((q, i) => i > 0 && i < pts.length - 1 && Math.hypot(q[0] - p[0], q[1] - p[1]) < 0.06);
          if (idx > 0) { setPts(pts.filter((_, i) => i !== idx)); commit('Xóa điểm cong'); }
        }}
      >
        <rect width={S} height={S} rx="12" className="curve-bg" />
        {[1, 2, 3].map((i) => <g key={i}><line x1={(i * S) / 4} y1="0" x2={(i * S) / 4} y2={S} className="curve-grid" /><line y1={(i * S) / 4} x1="0" y2={(i * S) / 4} x2={S} className="curve-grid" /></g>)}
        {hpath && <path d={hpath} className="curve-hist" />}
        <line x1="0" y1={S} x2={S} y2="0" className="curve-grid" strokeDasharray="4 4" />
        <path d={path} fill="none" stroke={CH.find((c) => c.k === ch)!.color} strokeWidth="2.5" />
        {pts.map((p, i) => <circle key={i} cx={p[0] * S} cy={(1 - p[1]) * S} r="8" className="curve-pt" />)}
      </svg>
      <div className="row between">
        <span className="muted small">Chạm để thêm điểm · kéo để chỉnh · bấm đúp để xóa</span>
        <button className="btn sm" onClick={() => { setPts([[0, 0], [1, 1]]); commit('Đặt lại đường cong'); }}>Đặt lại</button>
      </div>
    </div>
  );
}
