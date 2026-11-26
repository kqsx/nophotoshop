import { useState } from 'react';
import { ImagePlus, WandSparkles, Download } from 'lucide-react';
import { lsGet, lsSet } from '../../lib/db';

const PAGES = [
  { icon: ImagePlus, color: 'blue', title: 'Chọn ảnh', text: 'Chọn từ thư viện, chụp mới hoặc kéo thả. Ảnh không bao giờ rời máy bạn.' },
  { icon: WandSparkles, color: 'pink', title: 'Bấm 1 nút là đẹp', text: 'Beauty, Chân dung, Thiên nhiên, Ngược sáng… App tự gợi ý kiểu hợp với ảnh.' },
  { icon: Download, color: 'green', title: 'Tải về 4K', text: 'Thêm chữ ký, logo nếu muốn, rồi tải về hoặc chia sẻ ngay.' },
];

export const needOnboarding = () => !lsGet('nps_onboarded');

export function Onboarding({ onDone }: { onDone: () => void }) {
  const [i, setI] = useState(0);
  const done = () => { lsSet('nps_onboarded', '1'); onDone(); };
  const P = PAGES[i];
  return (
    <div className="backdrop" style={{ placeItems: 'center' }}>
      <div className="modal onboard" role="dialog" aria-modal="true" aria-label="Hướng dẫn">
        <span className={`sq ${P.color}`} style={{ width: 88, height: 88 }}><P.icon size={48} strokeWidth={1.75} /></span>
        <h2>{P.title}</h2>
        <p className="muted">{P.text}</p>
        <div className="dots">{PAGES.map((_, k) => <span key={k} className={k === i ? 'on' : ''} />)}</div>
        <div className="row">
          <button className="btn ghost" onClick={done}>Bỏ qua</button>
          <button className="btn primary lg grow" onClick={() => (i < PAGES.length - 1 ? setI(i + 1) : done())}>{i < PAGES.length - 1 ? 'Tiếp' : 'Bắt đầu'}</button>
        </div>
      </div>
    </div>
  );
}
