import { RotateCcw, RotateCw, FlipHorizontal2, FlipVertical2, Undo2 } from 'lucide-react';
import { Slider } from '../../ui/Slider';
import { commit, edit, live, type Doc } from './store';
import { frameSize } from '../../engine/geometry';
import { parseRatio, suggestCrops } from '../../analysis/aspect';
import { defaultGeometry, type Geometry } from '../../engine/params';

const RATIOS = [
  { r: 'orig', label: 'Gốc' }, { r: '1:1', label: '1:1' }, { r: '4:5', label: '4:5' }, { r: '9:16', label: '9:16' },
  { r: '16:9', label: '16:9' }, { r: '3:4', label: '3:4' }, { r: '4:3', label: '4:3' }, { r: '3:2', label: '3:2' },
  { r: '2:3', label: '2:3' }, { r: '1.91:1', label: '1.91:1' },
];
const ID_PHOTO = [
  { r: '3:4', label: 'Ảnh thẻ 3×4' }, { r: '2:3', label: 'Ảnh thẻ 4×6' },
];

/** Tính khung cắt từ tỷ lệ + thu phóng + vị trí. */
export function layoutCrop(d: Doc, g: Geometry): Geometry {
  const [W, H] = frameSize(d.bitmap, g);
  const r = g.aspect === 'orig' ? W / H : parseRatio(g.aspect) ?? W / H;
  let w = W, h = H;
  if (W / H > r) w = H * r; else h = W / r;
  w /= g.zoom; h /= g.zoom;
  const x = (W - w) * g.panX, y = (H - h) * g.panY;
  return { ...g, crop: { x: x / W, y: y / H, w: w / W, h: h / H } };
}

export function CropPanel({ doc }: { doc: Doc }) {
  const g = doc.cur.geometry;
  const setG = (patch: Partial<Geometry>, label?: string) => {
    const fn = (e: typeof doc.cur) => ({ ...e, geometry: layoutCrop(doc, { ...e.geometry, ...patch }) });
    if (label) edit(label, fn); else live(fn);
  };
  const sugg = suggestCrops(...frameSize(doc.bitmap, g));
  return (
    <div className="panel-body">
      <h3 className="sec">Gợi ý theo mạng xã hội</h3>
      <div className="hscroll chips">
        {sugg.map((s) => (
          <button key={s.label} className={'chip' + (g.aspect === s.ratio ? ' on' : '')} onClick={() => setG({ aspect: s.ratio, zoom: 1, panX: 0.5, panY: 0.5 }, `Cắt ${s.ratio}`)}>
            {s.label} <span className="small" style={{ opacity: 0.7 }}>{s.ratio}</span>
          </button>
        ))}
      </div>
      <h3 className="sec">Tỷ lệ</h3>
      <div className="ratio-grid">
        {RATIOS.map((x) => (
          <button key={x.r} className={'chip' + (g.aspect === x.r ? ' on' : '')} onClick={() => setG({ aspect: x.r, zoom: 1, panX: 0.5, panY: 0.5 }, `Cắt ${x.label}`)}>{x.label}</button>
        ))}
        {ID_PHOTO.map((x) => (
          <button key={x.label} className="chip" onClick={() => setG({ aspect: x.r, zoom: 1, panX: 0.5, panY: 0.35 }, x.label)}>{x.label}</button>
        ))}
      </div>
      <div className="glass card sliders">
        <Slider label="Thu phóng khung" value={Math.round((g.zoom - 1) * 100)} min={0} max={200} def={0} unit="%" onChange={(v) => setG({ zoom: 1 + v / 100 })} onCommit={() => commit('Thu phóng')} />
        <Slider label="Dịch ngang" value={Math.round((g.panX - 0.5) * 200)} def={0} onChange={(v) => setG({ panX: 0.5 + v / 200 })} onCommit={() => commit('Dịch khung')} />
        <Slider label="Dịch dọc" value={Math.round((g.panY - 0.5) * 200)} def={0} onChange={(v) => setG({ panY: 0.5 + v / 200 })} onCommit={() => commit('Dịch khung')} />
        <Slider label="Cân thẳng (Straighten)" value={g.straighten} min={-45} max={45} step={0.5} def={0} unit="°" onChange={(v) => setG({ straighten: v })} onCommit={() => commit('Cân thẳng')} />
      </div>
      <div className="tool-row">
        <button className="tool" onClick={() => setG({ rot90: ((g.rot90 + 3) % 4) as Geometry['rot90'] }, 'Xoay trái')}><RotateCcw size={24} strokeWidth={1.75} /><span>Xoay trái</span></button>
        <button className="tool" onClick={() => setG({ rot90: ((g.rot90 + 1) % 4) as Geometry['rot90'] }, 'Xoay phải')}><RotateCw size={24} strokeWidth={1.75} /><span>Xoay phải</span></button>
        <button className="tool" onClick={() => setG({ flipH: !g.flipH }, 'Lật ngang')}><FlipHorizontal2 size={24} strokeWidth={1.75} /><span>Lật ngang</span></button>
        <button className="tool" onClick={() => setG({ flipV: !g.flipV }, 'Lật dọc')}><FlipVertical2 size={24} strokeWidth={1.75} /><span>Lật dọc</span></button>
        <button className="tool" onClick={() => edit('Bỏ cắt', (e) => ({ ...e, geometry: defaultGeometry() }))}><Undo2 size={24} strokeWidth={1.75} /><span>Bỏ cắt</span></button>
      </div>
    </div>
  );
}
