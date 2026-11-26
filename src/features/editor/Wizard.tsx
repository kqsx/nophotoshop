import { useEffect, useState, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight, ImagePlus, Download } from 'lucide-react';
import { lsGet, lsSet } from '../../lib/db';
import { ParamSlider } from './QuickPanel';
import type { Doc, Tab } from './store';
import { getState, setTab } from './store';

export const wizardEnabled = () => lsGet('nps_wizard') !== 'off';

const STEPS: { title: string; desc: string; tab?: Tab; skin?: boolean }[] = [
  { title: 'Chọn ảnh', desc: 'Một hoặc nhiều ảnh — app tự nhận ảnh ngang/dọc.' },
  { title: 'Cắt và xoay', desc: 'Chọn khung 9:16, 16:9, 4:5, 1:1… Có thể bỏ qua bước này.', tab: 'crop' },
  { title: 'Làm đẹp một chạm', desc: 'Bấm một kiểu bạn thích, kéo «Cường độ» nếu muốn nhẹ hơn.', tab: 'quick' },
  { title: 'Da và dáng', desc: 'Mịn da, sáng da, hồng da, xóa mụn — mặc định nhẹ, tự nhiên.', skin: true },
  { title: 'Màu sắc', desc: 'Chọn bộ màu LUT — thumbnail là chính ảnh của bạn.', tab: 'lut' },
  { title: 'Đóng dấu', desc: 'Thêm chữ hoặc logo, kéo để đặt vị trí, đổi cỡ.', tab: 'watermark' },
  { title: 'Tải về / chia sẻ', desc: 'Chọn 4K hoặc cỡ mạng xã hội, tải một ảnh hoặc cả ZIP.' },
];

export function WizardPanel({ doc, onExit, onExport, onAdd, render }: { doc: Doc; onExit: () => void; onExport: () => void; onAdd: () => void; render: (t: Tab) => ReactNode }) {
  const [i, setI] = useState(0);
  const s = STEPS[i];
  useEffect(() => { if (STEPS[i].tab) setTab(STEPS[i].tab!); }, [i]);
  const exit = () => { lsSet('nps_wizard', 'off'); onExit(); };
  return (
    <aside className="ed-panel glass open wizard" aria-label="Chế độ từng bước">
      <div className="wiz-head">
        <div className="row between">
          <span className="wiz-step">Bước {i + 1}/{STEPS.length}</span>
          <button className="btn sm ghost" onClick={exit}>Bỏ qua · Chế độ tự do</button>
        </div>
        <div className="wiz-bar"><div style={{ width: `${((i + 1) / STEPS.length) * 100}%` }} /></div>
        <h2>{s.title}</h2>
        <p className="muted">{s.desc}</p>
      </div>
      <div className="panel-scroll">
        {i === 0 && (
          <div className="panel-body">
            <p>Đã có <b>{getState().docs.length}</b> ảnh. {doc.analysis && <>Ảnh này là <b>{doc.analysis.orientation === 'doc' ? 'ảnh dọc' : doc.analysis.orientation === 'ngang' ? 'ảnh ngang' : 'ảnh vuông'}</b>{doc.analysis.ratio && <> tỷ lệ <b>{doc.analysis.ratio}</b></>}.</>}</p>
            <button className="btn lg block" onClick={onAdd}><ImagePlus size={16} /> Thêm ảnh khác</button>
          </div>
        )}
        {s.tab && render(s.tab)}
        {s.skin && (
          <div className="panel-body">
            {!doc.analysis?.hasPerson && <p className="muted">Không thấy rõ người trong ảnh — bạn có thể bỏ qua bước này.</p>}
            <div className="glass card sliders">
              <ParamSlider doc={doc} k="smooth" label="Mịn da" min={0} fill="var(--pink)" />
              <ParamSlider doc={doc} k="skinBright" label="Sáng da" min={0} fill="var(--pink)" />
              <ParamSlider doc={doc} k="skinPink" label="Hồng da" min={0} fill="var(--pink)" />
              <ParamSlider doc={doc} k="acne" label="Xóa mụn" min={0} fill="var(--pink)" />
              <ParamSlider doc={doc} k="skinEven" label="Đều màu / nám" min={0} fill="var(--pink)" />
            </div>
            <p className="muted small">Thon mặt/bóp eo sẽ có ở bản sau (cần nhận diện dáng người).</p>
          </div>
        )}
        {i === STEPS.length - 1 && (
          <div className="panel-body">
            <button className="btn primary lg block" onClick={onExport}><Download size={16} /> Tải ảnh về</button>
          </div>
        )}
      </div>
      <div className="wiz-nav">
        <button className="btn lg" disabled={i === 0} onClick={() => setI(i - 1)}><ChevronLeft size={14} /> Quay lại</button>
        {i < STEPS.length - 1 ? (
          <button className="btn primary lg grow" onClick={() => setI(i + 1)}>Tiếp tục <ChevronRight size={14} /></button>
        ) : (
          <button className="btn lg grow" onClick={exit}>Xong · chỉnh tự do</button>
        )}
      </div>
    </aside>
  );
}
